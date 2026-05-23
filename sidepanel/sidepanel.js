const state = {
  conversations: [],
  members: [],
  settings: { wsUrl: 'ws://localhost:8080', wsEnabled: false },
  editingMemberId: null,
  models: [],        // 新增：模型列表
  prompts: [],       // 新增：提示词列表
  flows: [],         // 新增：流程列表
  statusCheckInterval: null,  // WebSocket状态检查定时器
  inlineMemberForm: {
    isExpanded: false,
    models: [],
    prompts: []
  }
};

// DOM元素
const elements = {
  conversationList: null,
  memberList: null,
  newConversationModal: null,
  newMemberModal: null
};

// 初始化
async function init() {
  // 初始化DOM元素引用
  initElements();

  // 加载数据
  await loadData();

  // 绑定事件
  bindEvents();

  // 渲染界面
  render();
}

function initElements() {
  elements.conversationList = document.getElementById('conversationList');
  elements.memberList = document.getElementById('memberList');
  elements.newConversationModal = document.getElementById('newConversationModal');
  elements.newMemberModal = document.getElementById('newMemberModal');

  // WebSocket设置相关元素（仅用于旧版设置页面）
  elements.wsUrlInput = document.getElementById('wsUrlInput');
  elements.wsEnabledCheckbox = document.getElementById('wsEnabledCheckbox');
  elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');
  elements.reconnectBtn = document.getElementById('reconnectBtn');
  elements.wsStatus = document.getElementById('wsStatus');
  elements.wsStatusText = document.getElementById('wsStatusText');
  elements.helperModelSelect = document.getElementById('helperModelSelect');

  initProviderSelect();
}

function initProviderSelect() {
  const providerSelect = document.getElementById('provider');
  if (providerSelect && PROVIDERS) {
    providerSelect.innerHTML = '';
    Object.values(PROVIDERS).forEach(provider => {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.name;
      providerSelect.appendChild(option);
    });
  }
}

async function loadData() {
  const [conversations, members, settings, models, prompts, teams] = await Promise.all([
    sendMessage({ action: 'getConversations' }),
    sendMessage({ action: 'getMembers' }),
    sendMessage({ action: 'getSettings' }),
    sendMessage({ action: 'getModels' }),
    sendMessage({ action: 'getPrompts' }),
    sendMessage({ action: 'getTeams' }).catch(() => []) // 团队数据可能不存在
  ]);

  state.conversations = conversations || [];
  state.members = members || [];
  state.settings = settings || { wsUrl: 'ws://localhost:8080', wsEnabled: false, contextMode: 'self', floatWindow: true };
  state.models = models || [];
  state.prompts = prompts || [];
  state.teams = teams || [];

  // 加载设置到UI
  loadSettingsToUI();

  // 加载WebSocket设置
  loadWebSocketSettings();

  // 加载辅助模型列表
  loadHelperModels();

  // 开始状态检查
  startStatusCheck();
}

function loadSettingsToUI() {
  const floatWindowCheck = document.getElementById('floatWindowCheck');

  if (floatWindowCheck) {
    floatWindowCheck.checked = state.settings.floatWindow !== false;
  }

  // 加载辅助模型设置
  const helperModelSelect = document.getElementById('helperModelSelect');
  if (helperModelSelect) {
    loadHelperModels();
    if (state.settings.helperModel) {
      helperModelSelect.value = state.settings.helperModel;
    }
  }
}

function bindEvents() {
  // 标签切换（如果存在）
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 新建会话
  const newConversationBtn = document.getElementById('newConversationBtn');
  if (newConversationBtn) {
    newConversationBtn.addEventListener('click', showNewConversationModal);
  }

  // 打开管理面板
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('dashboard/dashboard.html')
      });
    });
  }

  const confirmConversationBtn = document.getElementById('confirmConversationBtn');
  if (confirmConversationBtn) {
    confirmConversationBtn.addEventListener('click', createConversation);
  }

  const cancelConversationBtn = document.getElementById('cancelConversationBtn');
  if (cancelConversationBtn) {
    cancelConversationBtn.addEventListener('click', hideNewConversationModal);
  }

  // 上下文模式切换 - 已移除，改为模式选择
  // 模式切换事件
  document.querySelectorAll('input[name="convMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateModeVisibility(e.target.value);
    });
  });

  // 在新建会话中创建新成员 - 改为展开内联表单
  const createMemberInConvBtn = document.getElementById('createMemberInConvBtn');
  if (createMemberInConvBtn) {
    createMemberInConvBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Sidepanel] 点击创建新成员按钮，展开内联表单');
      expandInlineMemberForm();
    });
    console.log('[Sidepanel] 创建新成员按钮事件已绑定（内联模式）');
  } else {
    console.error('[Sidepanel] 未找到 createMemberInConvBtn 元素');
  }

  // 新建成员
  const newMemberBtn = document.getElementById('newMemberBtn');
  if (newMemberBtn) {
    newMemberBtn.addEventListener('click', showNewMemberModal);
  }

  const confirmMemberBtn = document.getElementById('confirmMemberBtn');
  if (confirmMemberBtn) {
    confirmMemberBtn.addEventListener('click', createMember);
  }

  const cancelMemberBtn = document.getElementById('cancelMemberBtn');
  if (cancelMemberBtn) {
    cancelMemberBtn.addEventListener('click', hideNewMemberModal);
  }

  // 服务提供商改变时自动填充模型
  const providerSelect = document.getElementById('provider');
  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      const modelInput = document.getElementById('model');
      if (modelInput) {
        const provider = PROVIDERS[e.target.value];
        if (provider && provider.defaultModel) {
          modelInput.value = provider.defaultModel;
        }
      }
    });
  }

  // 设计会话流程按钮 - 已移除

  // 保存设置
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  // 消息设置
  const floatWindowCheck = document.getElementById('floatWindowCheck');
  if (floatWindowCheck) {
    floatWindowCheck.addEventListener('change', (e) => {
      updateSetting('floatWindow', e.target.checked);
    });
  }

  // 辅助模型设置
  const helperModelSelect = document.getElementById('helperModelSelect');
  if (helperModelSelect) {
    helperModelSelect.addEventListener('change', (e) => {
      updateSetting('helperModel', e.target.value);
    });
  }

  // WebSocket连接设置
  if (elements.saveSettingsBtn) {
    elements.saveSettingsBtn.addEventListener('click', saveWebSocketSettings);
  }

  if (elements.reconnectBtn) {
    elements.reconnectBtn.addEventListener('click', reconnectWebSocket);
  }

  // 模态框关闭
  document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // 点击模态框外部关闭
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeAllModals();
    }
  });
}

  function render() {
  renderConversations();
  // 极简版不渲染members标签页
  // renderMembers();
}

function renderConversations() {
  // 如果 conversationList 不存在，直接返回（比如在设置页面）
  if (!elements.conversationList) {
    return;
  }

  // 只显示最近5条会话
  const recentConversations = state.conversations
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .slice(0, 5);

  if (recentConversations.length === 0) {
    elements.conversationList.innerHTML = '<div class="empty-state">暂无会话，点击"新建会话"开始</div>';
    return;
  }

  elements.conversationList.innerHTML = recentConversations.map(conv => {
    // 兼容旧数据：memberIds 和 新数据：modelIds
    const modelIds = conv.modelIds || conv.memberIds || [];
    const models = modelIds.map(id => {
      // 优先从新models中查找，再从旧members中查找
      let model = state.models.find(m => m.id === id);
      if (model) return model;

      const member = state.members.find(m => m.id === id);
      return member ? { name: member.name, isVirtual: false } : null;
    }).filter(Boolean);

    const modelNames = models.map(m => {
      if (m.isVirtual) return `${m.icon || '🤖'} ${m.name}`;
      return m.name;
    }).join(', ');

    const lastMessage = conv.messages[conv.messages.length - 1];
    const preview = lastMessage ? lastMessage.content.substring(0, 60) + '...' : '暂无消息';
    const msgCount = conv.messages?.length || 0;

    const modeLabels = {
      brainstorming: '<span class="conversation-mode-tag self">头脑风暴</span>',
      discussion: '<span class="conversation-mode-tag full">圆桌讨论</span>',
      expertqa: '<span class="conversation-mode-tag expert">专家问答</span>'
    };
    const contextModeLabel = modeLabels[conv.mode] ||
      (conv.contextMode === 'full'
        ? '<span class="conversation-mode-tag full">共享</span>'
        : '<span class="conversation-mode-tag self">独享</span>');

    return `
      <div class="conversation-item" data-id="${conv.id}">
        <div class="conversation-header">
          <h3>${escapeHtml(conv.name)}</h3>
          <div class="conversation-actions">
            <button class="edit-btn" data-id="${conv.id}">编辑</button>
            <button class="delete-btn" data-id="${conv.id}">&times;</button>
          </div>
        </div>
        <div class="conversation-meta">
          ${contextModeLabel}
          <span class="conversation-message-count">💬 ${msgCount}</span>
          <span class="conversation-time">${formatTime(conv.updatedAt || conv.createdAt)}</span>
        </div>
        <div class="conversation-members">模型: ${modelNames || '未选择'}</div>
        <div class="conversation-preview">${escapeHtml(preview)}</div>
      </div>
    `;
  }).join('');

  // 绑定删除事件
  document.querySelectorAll('.conversation-item .delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(btn.dataset.id);
    });
  });

  // 绑定编辑事件
  document.querySelectorAll('.conversation-item .edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editConversation(btn.dataset.id);
    });
  });

  // 绑定点击事件
  document.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      openConversation(item.dataset.id);
    });
  });
}

function renderMembers() {
  // 成员功能已废弃，此函数保留以防旧代码调用
  if (!elements.memberList) return;

  if (state.members.length === 0) {
    elements.memberList.innerHTML = '<div class="empty-state">暂无成员</div>';
    return;
  }

  elements.memberList.innerHTML = state.members.map(member => {
    const provider = PROVIDERS[member.provider];
    const providerName = provider ? provider.name : member.provider;
    const providerColor = provider ? provider.color : '#666';

    return `
      <div class="member-item" data-id="${member.id}">
        <div class="member-header">
          <h3>
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${providerColor};color:#fff;font-size:12px;font-weight:700;margin-right:6px;flex-shrink:0;">${escapeHtml(member.name.charAt(0))}</span>
            ${escapeHtml(member.name)}
          </h3>
          <div class="member-actions">
            <button class="test-btn" data-id="${member.id}" data-provider="${member.provider}">测试</button>
            <button class="edit-btn" data-id="${member.id}">编辑</button>
            <button class="delete-btn" data-id="${member.id}">&times;</button>
          </div>
        </div>
        <div class="member-info">
          <div><span style="font-weight:500;color:#333;">提供商:</span> ${providerName}</div>
          <div><span style="font-weight:500;color:#333;">模型:</span> ${escapeHtml(member.model)}</div>
        </div>
      </div>
    `;
  }).join('');

  // 绑定删除事件
  document.querySelectorAll('.member-item .delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMember(btn.dataset.id);
    });
  });

  // 绑定编辑事件
  document.querySelectorAll('.member-item .edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editMember(btn.dataset.id);
    });
  });

  // 绑定测试事件
  document.querySelectorAll('.test-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      testPlatform(btn.dataset.provider, btn.dataset.id);
    });
  });
}

// 会话操作
async function createConversation() {
  const name = document.getElementById('conversationName').value.trim();
  const teamId = document.getElementById('teamSelect').value || null;
  const selectedMemberIds = Array.from(document.querySelectorAll('#memberSelector .member-checkbox'))
    .map(div => div.dataset.memberId);
  const mode = document.querySelector('input[name="convMode"]:checked')?.value || 'brainstorming';

  if (!name) {
    alert('请输入会话名称');
    return;
  }

  const options = {};

  if (mode === 'discussion') {
    const orderItems = document.querySelectorAll('#memberOrderContainer .member-order-item');
    options.memberOrder = Array.from(orderItems).map(item => item.dataset.memberId);
  } else if (mode === 'expertqa') {
    const flowSelect = document.getElementById('expertFlowSelect');
    if (flowSelect && flowSelect.value) {
      options.flowId = flowSelect.value;
    }
  }

  if (state.editingConversationId) {
    const updates = { name, memberIds: selectedMemberIds };
    if (teamId) {
      updates.teamId = teamId;
    }
    await sendMessage({
      action: 'updateConversation',
      conversationId: state.editingConversationId,
      updates
    });

    const convIndex = state.conversations.findIndex(c => c.id === state.editingConversationId);
    if (convIndex !== -1) {
      Object.assign(state.conversations[convIndex], updates);
    }
    renderConversations();
    hideNewConversationModal();
  } else {
    const conversation = await sendMessage({
      action: 'createConversation',
      name,
      memberIds: selectedMemberIds,
      mode,
      ...options
    });

    if (conversation) {
      if (teamId) {
        await sendMessage({
          action: 'updateConversation',
          conversationId: conversation.id,
          updates: { teamId }
        });
        conversation.teamId = teamId;
      }

      state.conversations.push(conversation);
      renderConversations();
      hideNewConversationModal();

      openConversation(conversation.id);
    }
  }
}

async function deleteConversation(conversationId) {
  if (confirm('确定要删除这个会话吗？')) {
    await sendMessage({
      action: 'deleteConversation',
      conversationId
    });

    state.conversations = state.conversations.filter(c => c.id !== conversationId);
    renderConversations();
  }
}

function editConversation(conversationId) {
  const conversation = state.conversations.find(c => c.id === conversationId);
  if (conversation) {
    showEditConversationModal(conversation);
  }
}

function openConversation(conversationId) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`chat/chat.html?id=${conversationId}`)
  });
}

// 成员操作
async function createMember() {
  const name = document.getElementById('memberName').value.trim();
  const provider = document.getElementById('provider').value;
  let model = document.getElementById('model').value.trim();
  const systemPrompt = document.getElementById('systemPrompt').value.trim();

  if (!name) {
    alert('请输入成员名称');
    return;
  }

  if (state.editingMemberId) {
    const updates = { name, provider, model, systemPrompt };
    await sendMessage({
      action: 'updateMember',
      memberId: state.editingMemberId,
      updates
    });

    const memberIndex = state.members.findIndex(m => m.id === state.editingMemberId);
    if (memberIndex !== -1) {
      Object.assign(state.members[memberIndex], { id: state.editingMemberId, ...updates });
    }
    renderMembers();
    hideNewMemberModal();
  } else {
    if (!model) {
      const providerConfig = PROVIDERS[provider];
      model = providerConfig ? providerConfig.defaultModel : 'default';
    }

    const member = await sendMessage({
      action: 'createMember',
      name,
      provider,
      model,
      systemPrompt
    });

    if (member) {
      state.members.push(member);
      renderMembers();
      hideNewMemberModal();
    }
  }
}

async function deleteMember(memberId) {
  if (confirm('确定要删除这个成员吗？')) {
    await sendMessage({
      action: 'deleteMember',
      memberId
    });

    state.members = state.members.filter(m => m.id !== memberId);
    renderMembers();
  }
}

function editMember(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (member) {
    showEditMemberModal(member);
  }
}

async function testPlatform(provider, memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;

  const btn = document.querySelector(`.test-btn[data-id="${memberId}"]`);
  const originalText = btn.textContent;
  btn.textContent = '测试中...';
  btn.disabled = true;

  try {
    const result = await sendMessage({
      action: 'testPlatform',
      platform: provider
    });

    if (result && result.success) {
      alert(`✅ ${member.name} 连接成功！\n\n平台信息：${JSON.stringify(result.info, null, 2)}`);
    } else {
      alert(`❌ ${member.name} 连接失败\n\n请确保已在浏览器中登录 ${provider} 账号`);
    }
  } catch (error) {
    alert(`❌ 测试失败: ${error.message}`);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// 设置操作
async function saveSettings() {
  state.settings.wsEnabled = document.getElementById('wsEnabled').checked;
  state.settings.wsUrl = document.getElementById('wsUrl').value.trim();

  await sendMessage({
    action: 'updateSettings',
    settings: state.settings
  });

  alert('设置已保存');
}

async function updateSetting(key, value) {
  state.settings[key] = value;

  await sendMessage({
    action: 'updateSettings',
    settings: state.settings
  });

  console.log(`设置已更新: ${key} = ${value}`);
}

// 加载辅助模型列表
function loadHelperModels() {
  const helperModelSelect = document.getElementById('helperModelSelect');
  if (!helperModelSelect) return;

  // 获取已启用的模型列表
  const enabledModels = (state.models || []).filter(model => model.enabled !== false);

  // 保存当前选择的值
  const currentValue = helperModelSelect.value;

  // 清空并重新填充选项
  helperModelSelect.innerHTML = '<option value="">请选择模型</option>';

  enabledModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name || model.model;
    helperModelSelect.appendChild(option);
  });

  // 恢复之前选择的值
  if (currentValue) {
    helperModelSelect.value = currentValue;
  }
}

// 模态框操作
function showNewConversationModal() {
  state.editingConversationId = null;
  document.getElementById('conversationModalTitle').textContent = '新建会话';
  document.getElementById('confirmConversationBtn').textContent = '创建';

  const teamSelect = document.getElementById('teamSelect');
  if (teamSelect) {
    teamSelect.innerHTML = '<option value="">不选择团队，手动添加成员</option>' +
      (state.teams || []).map(team =>
        `<option value="${team.id}">${escapeHtml(team.name)} (${team.memberIds?.length || 0}个成员)</option>`
      ).join('');
  }

  renderMemberSelector([]);

  const modeRadios = document.querySelectorAll('input[name="convMode"]');
  modeRadios.forEach(r => r.checked = r.value === 'brainstorming');
  updateModeVisibility('brainstorming');

  initInlineMemberForm();

  bindTeamSelectEvent();
  bindMemberRemoveEvents();

  elements.newConversationModal.classList.add('active');
}

// 渲染成员选择器
function renderMemberSelector(members) {
  const memberSelector = document.getElementById('memberSelector');
  if (!memberSelector) return;

  if (members.length === 0) {
    memberSelector.innerHTML = '<div class="empty-state">暂无成员，请点击上方"创建新成员"按钮添加</div>';
    return;
  }

  memberSelector.innerHTML = members.map(member => {
    const info = getMemberDisplayInfo(member);
    const provider = PROVIDERS[member.provider];
    const color = provider ? provider.color : '#666';
    return `
      <div class="member-checkbox" data-member-id="${member.id}" style="display: block; padding: 10px 12px; margin: 6px 0; background: #f9f9f9; border-radius: 6px; border: 1px solid #e5e7eb; transition: all 0.2s ease; position: relative;">
        <button class="remove-member-btn" data-member-id="${member.id}" style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border: none; background: #ff3b30; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">×</button>
        <div class="member-info-row" style="display: flex; align-items: center; gap: 8px;">
          <span class="member-avatar" style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, ${color}, ${color}cc); color: white; font-size: 12px; font-weight: 600; text-align: center; line-height: 24px; flex-shrink: 0;">${escapeHtml(member.name.charAt(0))}</span>
          <span class="member-name" style="font-weight: 600; color: #333;">${escapeHtml(info.name)}</span>
        </div>
        <div class="member-meta-row" style="margin-left: 34px; margin-top: 4px; font-size: 12px; color: #666;">
          <span class="member-model">🤖 ${escapeHtml(info.modelName)}</span>
          ${info.promptIcon ? `<span class="member-prompt" style="margin-left: 8px;">${escapeHtml(info.promptIcon)} ${escapeHtml(info.promptName)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 绑定团队选择事件
function bindTeamSelectEvent() {
  const teamSelect = document.getElementById('teamSelect');
  if (!teamSelect) return;

  // 移除之前的事件监听器（如果有）
  const newTeamSelect = teamSelect.cloneNode(true);
  teamSelect.parentNode.replaceChild(newTeamSelect, teamSelect);

  newTeamSelect.addEventListener('change', async (e) => {
    const teamId = e.target.value;

    if (!teamId) {
      // 未选择团队，显示空列表（用户需手动创建成员）
      renderMemberSelector([]);
      bindMemberRemoveEvents();
      return;
    }

    // 获取团队信息
    try {
      const team = await sendMessage({
        action: 'getTeamWithMembers',
        teamId
      });

      if (team && team.members) {
        // 渲染团队成员
        renderMemberSelector(team.members);
        bindMemberRemoveEvents();
      }
    } catch (error) {
      console.error('[Sidepanel] 获取团队信息失败:', error);
      alert('获取团队信息失败：' + error.message);
    }
  });
}

// 绑定成员删除按钮事件
function bindMemberRemoveEvents() {
  document.querySelectorAll('#memberSelector .remove-member-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = btn.dataset.memberId;
      const memberCard = btn.closest('.member-checkbox');
      if (memberCard) {
        memberCard.style.opacity = '0';
        memberCard.style.transform = 'translateX(20px)';
        setTimeout(() => {
          memberCard.remove();
        }, 200);
      }
    });

    // 添加悬停效果
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.background = '#d63020';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.background = '#ff3b30';
    });
  });
}

function updateModeVisibility(mode) {
  const expertFlowGroup = document.getElementById('expertFlowGroup');
  const memberOrderGroup = document.getElementById('memberOrderGroup');

  if (expertFlowGroup) {
    expertFlowGroup.style.display = mode === 'expertqa' ? 'block' : 'none';
  }

  if (memberOrderGroup) {
    memberOrderGroup.style.display = mode === 'discussion' ? 'block' : 'none';
    if (mode === 'discussion') {
      renderDiscussionOrder();
    }
  }

  if (mode === 'expertqa') {
    loadExpertFlows();
  }
}

function renderDiscussionOrder() {
  const container = document.getElementById('memberOrderContainer');
  if (!container) return;

  const selectedMemberIds = Array.from(document.querySelectorAll('#memberSelector .member-checkbox'))
    .map(div => div.dataset.memberId);

  if (selectedMemberIds.length === 0) {
    container.innerHTML = '<div class="empty-state">请先选择成员</div>';
    return;
  }

  container.innerHTML = selectedMemberIds.map((memberId, index) => {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return '';
    const provider = PROVIDERS[member.provider];
    const color = provider ? provider.color : '#666';
    return `
      <div class="member-order-item" data-member-id="${memberId}" draggable="true">
        <span class="drag-handle">⠿</span>
        <span class="order-number">${index + 1}</span>
        <span class="member-avatar" style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${color};color:#fff;font-size:10px;text-align:center;line-height:20px;">${escapeHtml(member.name.charAt(0))}</span>
        <span>${escapeHtml(member.name)}</span>
      </div>
    `;
  }).join('');

  initDragSort(container);
}

function initDragSort(container) {
  let draggedItem = null;

  container.addEventListener('dragstart', (e) => {
    draggedItem = e.target.closest('.member-order-item');
    if (draggedItem) {
      draggedItem.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  container.addEventListener('dragend', (e) => {
    if (draggedItem) {
      draggedItem.style.opacity = '1';
      draggedItem = null;
    }
    updateOrderNumbers(container);
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.member-order-item');
    if (target && target !== draggedItem) {
      const rect = target.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        container.insertBefore(draggedItem, target);
      } else {
        container.insertBefore(draggedItem, target.nextSibling);
      }
    }
  });
}

function updateOrderNumbers(container) {
  container.querySelectorAll('.member-order-item').forEach((item, index) => {
    const numEl = item.querySelector('.order-number');
    if (numEl) numEl.textContent = index + 1;
  });
}

async function loadExpertFlows() {
  const flowSelect = document.getElementById('expertFlowSelect');
  if (!flowSelect) return;

  try {
    const flows = await sendMessage({ action: 'getFlows' }) || [];
    const currentValue = flowSelect.value;

    flowSelect.innerHTML = '<option value="">请选择方案...</option>';
    flows.forEach(flow => {
      const option = document.createElement('option');
      option.value = flow.id;
      option.textContent = flow.name;
      flowSelect.appendChild(option);
    });

    if (currentValue) {
      flowSelect.value = currentValue;
    }
  } catch (error) {
    console.error('加载专家流程失败:', error);
  }
}

// 在新建会话中创建新成员
async function showCreateMemberInConvModal() {
  console.log('[Sidepanel] showCreateMemberInConvModal 被调用');

  try {
    const [models, prompts] = await Promise.all([
      sendMessage({ action: 'getModels' }),
      sendMessage({ action: 'getPrompts' })
    ]);

    const availableModels = (models || []).filter(m => m.enabled !== false);
    const availablePrompts = prompts || [];

    // 创建模态框容器
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';

    // 使用标准化三段式结构
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 520px;">
        <div class="modal-header">
          <h2>在会话中创建新成员</h2>
          <button class="close-btn" id="closeMemberInConvBtn">&times;</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label for="newMemberInConvName">
              成员名称 <span style="color: #ff3b30;">*</span>
            </label>
            <input type="text" id="newMemberInConvName" class="form-input"
                   placeholder="例如：Python 专家助手" autocomplete="off">
            <small class="form-hint">为成员设置一个易于识别的名称</small>
          </div>

          <div class="form-group">
            <label for="newMemberInConvModel">
              选择模型 <span style="color: #ff3b30;">*</span>
            </label>
            <select id="newMemberInConvModel" class="form-select">
              <option value="">请选择模型...</option>
              ${availableModels.map(model => {
                const provider = PROVIDERS[model.provider];
                const displayName = provider ? `${provider.name} - ${model.name}` : model.name;
                return `<option value="${model.id}">${displayName}</option>`;
              }).join('')}
            </select>
            <small class="form-hint">选择此成员使用的 AI 模型</small>
          </div>

          <div class="form-group">
            <label for="newMemberInConvPrompt">
              选择提示词 <span style="color: #999; font-weight: normal;">（可选）</span>
            </label>
            <select id="newMemberInConvPrompt" class="form-select">
              <option value="">无提示词</option>
              ${availablePrompts.map(prompt => {
                return `<option value="${prompt.id}">${escapeHtml(prompt.name)}</option>`;
              }).join('')}
            </select>
            <small class="form-hint">为成员预定义系统提示词</small>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelMemberInConvBtn">取消</button>
          <button class="btn btn-primary" id="saveMemberInConvBtn">
            <span>✨</span> 创建并添加
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 获取表单元素
    const nameInput = modal.querySelector('#newMemberInConvName');
    const modelSelect = modal.querySelector('#newMemberInConvModel');
    const promptSelect = modal.querySelector('#newMemberInConvPrompt');
    const cancelBtn = modal.querySelector('#cancelMemberInConvBtn');
    const saveBtn = modal.querySelector('#saveMemberInConvBtn');
    const closeBtn = modal.querySelector('#closeMemberInConvBtn');

    // 自动聚焦到名称输入框
    setTimeout(() => nameInput.focus(), 100);

    // 表单验证函数
    const validateForm = () => {
      let isValid = true;

      // 验证名称
      if (!nameInput.value.trim()) {
        nameInput.classList.add('error');
        nameInput.classList.remove('success');
        isValid = false;
      } else {
        nameInput.classList.remove('error');
        nameInput.classList.add('success');
      }

      // 验证模型
      if (!modelSelect.value) {
        modelSelect.classList.add('error');
        modelSelect.classList.remove('success');
        isValid = false;
      } else {
        modelSelect.classList.remove('error');
        modelSelect.classList.add('success');
      }

      return isValid;
    };

    // 实时验证
    nameInput.addEventListener('input', () => {
      if (nameInput.value.trim()) {
        nameInput.classList.remove('error');
        nameInput.classList.add('success');
      }
    });

    modelSelect.addEventListener('change', () => {
      if (modelSelect.value) {
        modelSelect.classList.remove('error');
        modelSelect.classList.add('success');
      }
    });

    // 关闭模态框函数
    const closeModal = () => {
      modal.style.animation = 'modalFadeOut 0.2s ease';
      setTimeout(() => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      }, 200);
    };

    // 关闭按钮事件
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // 点击外部关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 保存按钮事件
    saveBtn.addEventListener('click', async () => {
      if (!validateForm()) {
        // 震动效果
        saveBtn.style.animation = 'shake 0.4s ease';
        setTimeout(() => {
          saveBtn.style.animation = '';
        }, 400);
        return;
      }

      const memberName = nameInput.value.trim();
      const modelId = modelSelect.value;
      const promptId = promptSelect.value;

      // 显示加载状态
      const originalText = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="loading-spinner"></span> 创建中...';

      try {
        const model = availableModels.find(m => m.id === modelId);
        if (!model) {
          throw new Error('模型不存在');
        }

        let systemPrompt = '';
        if (promptId) {
          const prompt = availablePrompts.find(p => p.id === promptId);
          if (prompt) {
            systemPrompt = prompt.content || '';
          }
        }

        const newMember = await sendMessage({
          action: 'createMember',
          name: memberName,
          provider: model.provider,
          model: model.model,
          systemPrompt: systemPrompt
        });

        if (newMember) {
          state.members.push(newMember);

          const memberSelector = document.getElementById('memberSelector');
          if (memberSelector) {
            const info = getMemberDisplayInfo(newMember);
            const provider = PROVIDERS[newMember.provider];
            const color = provider ? provider.color : '#666';
            const memberHtml = `
              <div class="member-checkbox" data-member-id="${newMember.id}" style="display: block; padding: 10px 12px; margin: 6px 0; background: #f9f9f9; border-radius: 6px; border: 1px solid #e5e7eb; animation: cardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1); position: relative;">
                <button class="remove-member-btn" data-member-id="${newMember.id}" style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border: none; background: #ff3b30; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">×</button>
                <div class="member-info-row" style="display: flex; align-items: center; gap: 8px;">
                  <span class="member-avatar" style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, ${color}, ${color}cc); color: white; font-size: 12px; font-weight: 600; text-align: center; line-height: 24px; flex-shrink: 0;">${escapeHtml(newMember.name.charAt(0))}</span>
                  <span class="member-name" style="font-weight: 600; color: #333;">${escapeHtml(info.name)}</span>
                </div>
                <div class="member-meta-row" style="margin-left: 34px; margin-top: 4px; font-size: 12px; color: #666;">
                  <span class="member-model">🤖 ${escapeHtml(info.modelName)}</span>
                  ${info.promptIcon ? `<span class="member-prompt" style="margin-left: 8px;">${escapeHtml(info.promptIcon)} ${escapeHtml(info.promptName)}</span>` : ''}
                </div>
              </div>
            `;
            memberSelector.insertAdjacentHTML('beforeend', memberHtml);
          }

          // 成功动画
          saveBtn.innerHTML = '<span>✓</span> 创建成功';
          saveBtn.style.background = 'linear-gradient(135deg, #34c759 0%, #30b350 100%)';

          setTimeout(() => {
            closeModal();
          }, 800);
        }
      } catch (error) {
        console.error('[Sidepanel] 创建成员失败:', error);

        // 错误状态
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>✗</span> 创建失败';
        saveBtn.style.background = 'linear-gradient(135deg, #ff3b30 0%, #d63020 100%)';

        setTimeout(() => {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText;
          saveBtn.style.background = '';
        }, 2000);
      }
    });

  } catch (error) {
    console.error('[Sidepanel] showCreateMemberInConvModal 错误:', error);
    alert('打开创建成员对话框失败：' + error.message);
  }
}

function updateMemberSettings() {
  const selectedMemberIds = Array.from(document.querySelectorAll('.member-selector input:checked'))
    .map(cb => cb.value);

  const container = document.getElementById('memberSettingsContainer');
  const group = document.getElementById('memberSettingsGroup');

  if (selectedMemberIds.length === 0) {
    container.innerHTML = '';
    group.style.display = 'none';
    return;
  }

  group.style.display = 'block';
  container.innerHTML = selectedMemberIds.map(memberId => {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return '';
    return `
      <div class="member-setting-item" style="margin-bottom: 12px; padding: 10px; background: #f5f5f5; border-radius: 6px;">
        <div style="font-weight: 600; margin-bottom: 8px;">${escapeHtml(member.name)}</div>
        <div style="margin-bottom: 8px;">
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">昵称（可选）</label>
          <input type="text" class="member-nickname-input" data-member-id="${memberId}" placeholder="默认：${escapeHtml(member.name)}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">追加提示词（可选）</label>
          <textarea class="member-prompt-input" data-member-id="${memberId}" rows="2" placeholder="为该成员在此会话中追加特殊的提示词" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
        </div>
      </div>
    `;
  }).join('');
}

function showEditConversationModal(conversation) {
  state.editingConversationId = conversation.id;
  document.getElementById('conversationModalTitle').textContent = '编辑会话';
  document.getElementById('confirmConversationBtn').textContent = '保存';

  document.getElementById('conversationName').value = conversation.name;

  const mode = conversation.mode || 'brainstorming';
  const modeRadios = document.querySelectorAll('input[name="convMode"]');
  modeRadios.forEach(r => {
    r.checked = r.value === mode;
    r.disabled = true;
  });
  updateModeVisibility(mode);

  const memberSelector = document.getElementById('memberSelector');
  if (state.members.length === 0) {
    memberSelector.innerHTML = '<div class="empty-state">请先创建成员</div>';
  } else {
    const modelIds = conversation.modelIds || conversation.memberIds || [];
    memberSelector.innerHTML = state.members.map(member => {
      const isCurrent = modelIds.includes(member.id);
      if (!isCurrent) return '';
      const info = getMemberDisplayInfo(member);
      const provider = PROVIDERS[member.provider];
      const color = provider ? provider.color : '#666';
      return `
        <div class="member-checkbox" data-member-id="${member.id}" style="display: block; padding: 10px 12px; margin: 6px 0; background: #f9f9f9; border-radius: 6px; border: 1px solid #e5e7eb; position: relative;">
          <div class="member-info-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="member-avatar" style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, ${color}, ${color}cc); color: white; font-size: 12px; font-weight: 600; text-align: center; line-height: 24px; flex-shrink: 0;">${escapeHtml(member.name.charAt(0))}</span>
            <span class="member-name" style="font-weight: 600; color: #333;">${escapeHtml(info.name)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  elements.newConversationModal.classList.add('active');
}

function hideNewConversationModal() {
  elements.newConversationModal.classList.remove('active');
  state.editingConversationId = null;
  document.getElementById('conversationName').value = '';
  document.getElementById('conversationModalTitle').textContent = '新建会话';
  document.getElementById('confirmConversationBtn').textContent = '创建';

  const modeRadios = document.querySelectorAll('input[name="convMode"]');
  modeRadios.forEach(r => {
    r.checked = r.value === 'brainstorming';
    r.disabled = false;
  });
}

function showNewMemberModal() {
  state.editingMemberId = null;
  document.querySelector('#newMemberModal h2').textContent = '新建成员';
  document.getElementById('confirmMemberBtn').textContent = '创建';
  elements.newMemberModal.classList.add('active');
}

function showEditMemberModal(member) {
  state.editingMemberId = member.id;
  document.querySelector('#newMemberModal h2').textContent = '编辑成员';
  document.getElementById('confirmMemberBtn').textContent = '保存';

  document.getElementById('memberName').value = member.name;
  document.getElementById('provider').value = member.provider;
  document.getElementById('model').value = member.model;
  document.getElementById('systemPrompt').value = member.systemPrompt || '';

  elements.newMemberModal.classList.add('active');
}

function hideNewMemberModal() {
  elements.newMemberModal.classList.remove('active');
  state.editingMemberId = null;
  document.getElementById('memberName').value = '';
  document.getElementById('model').value = '';
  document.getElementById('systemPrompt').value = '';
  document.querySelector('#newMemberModal h2').textContent = '新建成员';
  document.getElementById('confirmMemberBtn').textContent = '创建';
}

function closeAllModals() {
  hideNewConversationModal();
  hideNewMemberModal();
}

// 标签切换
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (tabButton) {
    tabButton.classList.add('active');
  }

  const tabContent = document.getElementById(`${tabName}-tab`);
  if (tabContent) {
    tabContent.classList.add('active');
  }
}

// 工具函数
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('请求超时（300秒）'));
    }, 300000); // 增加到300秒超时

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 会话流程设计器
let conversationFlowDesigner = null;

function showConversationFlowDesigner() {
  // 获取选中的模型
  const selectedModelIds = Array.from(document.querySelectorAll('#modelSelector input:checked'))
    .map(cb => cb.value)
    .filter(id => id);

  if (selectedModelIds.length === 0) {
    alert('请先选择至少一个模型');
    return;
  }

  conversationFlowDesigner = new FlowDesigner({
    mode: 'conversation',
    flowId: state.editingConversation?.flowId || null,
    availableModels: state.models.filter(m => selectedModelIds.includes(m.id)),
    onSave: async (flowData) => {
      const result = await sendMessage({
        action: 'saveFlow',
        flow: flowData
      });

      if (result && result.id) {
        if (state.editingConversation) {
          state.editingConversation.flowId = result.id;
        }
        return result.id;
      }
      return null;
    },
    onClose: () => {
      conversationFlowDesigner = null;
    }
  });

  conversationFlowDesigner.open();
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 页面卸载时停止状态检查
window.addEventListener('beforeunload', () => {
  if (state.statusCheckInterval) {
    clearInterval(state.statusCheckInterval);
  }
});

// ==================== WebSocket连接设置管理 ====================

// 加载WebSocket设置
function loadWebSocketSettings() {
  if (!elements.wsUrlInput || !elements.wsEnabledCheckbox) return;

  chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
    if (response) {
      elements.wsUrlInput.value = response.wsUrl || 'ws://localhost:8080';
      elements.wsEnabledCheckbox.checked = response.wsEnabled || false;
      updateWSStatus(response.wsConnected || false);
    }
  });
}

// 保存WebSocket设置
async function saveWebSocketSettings() {
  if (!elements.wsUrlInput || !elements.wsEnabledCheckbox) return;

  try {
    const settings = {
      wsUrl: elements.wsUrlInput.value.trim(),
      wsEnabled: elements.wsEnabledCheckbox.checked
    };

    await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settings
    });

    // 显示保存成功提示
    const originalText = elements.saveSettingsBtn.textContent;
    elements.saveSettingsBtn.textContent = '已保存 ✓';
    elements.saveSettingsBtn.style.background = 'linear-gradient(135deg, #34c759 0%, #30b350 100%)';

    setTimeout(() => {
      elements.saveSettingsBtn.textContent = originalText;
      elements.saveSettingsBtn.style.background = '';
    }, 2000);

    // 如果启用了 WebSocket，重新连接
    if (settings.wsEnabled) {
      await chrome.runtime.sendMessage({ action: 'reconnectWebSocket' });
    } else {
      await chrome.runtime.sendMessage({ action: 'disconnectWebSocket' });
    }

  } catch (error) {
    console.error('保存设置失败:', error);
    elements.saveSettingsBtn.textContent = '保存失败 ✗';
    setTimeout(() => {
      elements.saveSettingsBtn.textContent = '保存设置';
    }, 2000);
  }
}

// 更新 WebSocket 状态显示
function updateWSStatus(connected, reconnectInfo = null) {
  if (!elements.wsStatus || !elements.wsStatusText) return;

  if (connected) {
    elements.wsStatus.className = 'ws-status connected';
    elements.wsStatusText.textContent = '已连接';
    if (elements.reconnectBtn) elements.reconnectBtn.style.display = 'none';
    if (elements.saveSettingsBtn) elements.saveSettingsBtn.style.flex = '1';
  } else if (reconnectInfo && reconnectInfo.isReconnecting) {
    elements.wsStatus.className = 'ws-status reconnecting';
    const delay = Math.round(reconnectInfo.delay / 1000);
    elements.wsStatusText.textContent = `重连中 (${reconnectInfo.attempt}次) ${delay}s`;
    if (elements.reconnectBtn) elements.reconnectBtn.style.display = 'block';
    if (elements.saveSettingsBtn) elements.saveSettingsBtn.style.flex = '1';
  } else {
    elements.wsStatus.className = 'ws-status disconnected';
    elements.wsStatusText.textContent = '未连接';
    if (elements.reconnectBtn) elements.reconnectBtn.style.display = 'block';
    if (elements.saveSettingsBtn) elements.saveSettingsBtn.style.flex = '1';
  }
}

// 立即重连按钮
async function reconnectWebSocket() {
  if (!elements.reconnectBtn) return;

  try {
    elements.reconnectBtn.textContent = '重连中...';
    elements.reconnectBtn.disabled = true;

    await chrome.runtime.sendMessage({ action: 'reconnectWebSocket' });

    setTimeout(() => {
      elements.reconnectBtn.textContent = '立即重连';
      elements.reconnectBtn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('重连失败:', error);
    elements.reconnectBtn.textContent = '重连失败';
    setTimeout(() => {
      elements.reconnectBtn.textContent = '立即重连';
      elements.reconnectBtn.disabled = false;
    }, 2000);
  }
}

// 开始状态检查
function startStatusCheck() {
  if (state.statusCheckInterval) {
    clearInterval(state.statusCheckInterval);
  }

  state.statusCheckInterval = setInterval(async () => {
    try {
      const status = await chrome.runtime.sendMessage({ action: 'getWSStatus' });
      if (status) {
        updateWSStatus(status.connected, {
          isReconnecting: status.isReconnecting,
          attempt: status.reconnectAttempts,
          delay: status.reconnectDelay
        });
      }
    } catch (error) {
      console.error('获取 WS 状态失败:', error);
    }
  }, 1000); // 每秒更新一次
}

// 监听 WebSocket 状态变化
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'wsStatusChanged') {
    updateWSStatus(message.connected, message.reconnectInfo);
  }
});

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

// ==================== 内联成员表单相关 ====================

// 辅助函数：获取成员的显示信息
function getMemberDisplayInfo(member) {
  // 查找模型信息
  const model = state.inlineMemberForm.models.find(
    m => m.provider === member.provider && m.model === member.model
  );
  const modelName = model ? model.name : member.model;
  
  // 查找提示词信息
  let promptName = '无提示词';
  let promptIcon = '';
  
  if (member.systemPrompt) {
    const prompt = state.inlineMemberForm.prompts.find(
      p => p.content === member.systemPrompt
    );
    if (prompt) {
      promptName = prompt.name;
      promptIcon = '📝';
    } else {
      promptName = '自定义提示词';
      promptIcon = '✏️';
    }
  }
  
  return {
    name: member.name,
    modelName: modelName,
    promptName: promptName,
    promptIcon: promptIcon,
    hasPrompt: !!member.systemPrompt
  };
}

// 初始化内联表单
function initInlineMemberForm() {
  const container = document.getElementById('inlineMemberFormContainer');
  const cancelBtn = document.getElementById('cancelInlineMemberBtn');
  const saveBtn = document.getElementById('saveInlineMemberBtn');
  const nameInput = document.getElementById('newMemberInConvName');
  const modelSelect = document.getElementById('newMemberInConvModel');
  const promptSelect = document.getElementById('newMemberInConvPrompt');

  if (!container) {
    console.error('[Sidepanel] 未找到内联表单容器');
    return;
  }

  // 取消按钮
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      collapseInlineMemberForm();
      resetInlineMemberForm();
    });
  }

  // 保存按钮
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveInlineMember();
    });
  }

  // 实时验证
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      validateInlineFormField(nameInput, nameInput.value.trim());
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      validateInlineFormField(modelSelect, modelSelect.value);
    });
  }

  // 加载模型和提示词数据
  loadInlineFormData();
}

// 加载表单数据（模型和提示词）
async function loadInlineFormData() {
  try {
    const [models, prompts] = await Promise.all([
      sendMessage({ action: 'getModels' }),
      sendMessage({ action: 'getPrompts' })
    ]);

    state.inlineMemberForm.models = (models || []).filter(m => m.enabled !== false);
    state.inlineMemberForm.prompts = prompts || [];

    // 填充模型下拉框
    const modelSelect = document.getElementById('newMemberInConvModel');
    if (modelSelect) {
      modelSelect.innerHTML = '<option value="">请选择模型...</option>' +
        state.inlineMemberForm.models.map(model => {
          const provider = PROVIDERS[model.provider];
          const displayName = provider ? `${provider.name} - ${model.name}` : model.name;
          return `<option value="${model.id}">${displayName}</option>`;
        }).join('');
    }

    // 填充提示词下拉框
    const promptSelect = document.getElementById('newMemberInConvPrompt');
    if (promptSelect) {
      promptSelect.innerHTML = '<option value="">无提示词</option>' +
        state.inlineMemberForm.prompts.map(prompt => {
          return `<option value="${prompt.id}">${escapeHtml(prompt.name)}</option>`;
        }).join('');
    }

  } catch (error) {
    console.error('[Sidepanel] 加载内联表单数据失败:', error);
  }
}

// 展开表单
function expandInlineMemberForm() {
  const container = document.getElementById('inlineMemberFormContainer');

  if (!container) return;

  state.inlineMemberForm.isExpanded = true;
  container.style.display = 'block';
  
  // 触发重排以启动动画
  setTimeout(() => {
    container.classList.add('expanded');
  }, 10);

  // 聚焦到第一个输入框
  setTimeout(() => {
    const nameInput = document.getElementById('newMemberInConvName');
    if (nameInput) {
      nameInput.focus();
    }
  }, 300);

  console.log('[Sidepanel] 内联表单已展开');
}

// 折叠表单
function collapseInlineMemberForm() {
  const container = document.getElementById('inlineMemberFormContainer');

  if (!container) return;

  container.classList.remove('expanded');
  
  // 等待动画完成后再隐藏
  setTimeout(() => {
    container.style.display = 'none';
  }, 300);

  state.inlineMemberForm.isExpanded = false;
  container.classList.remove('success');

  console.log('[Sidepanel] 内联表单已折叠');
}

// 验证单个字段
function validateInlineFormField(field, value) {
  if (value) {
    field.classList.remove('error');
    field.classList.add('success');
    return true;
  } else {
    field.classList.add('error');
    field.classList.remove('success');
    return false;
  }
}

// 验证整个表单
function validateInlineMemberForm() {
  const nameInput = document.getElementById('newMemberInConvName');
  const modelSelect = document.getElementById('newMemberInConvModel');

  if (!nameInput || !modelSelect) return false;

  const isNameValid = validateInlineFormField(nameInput, nameInput.value.trim());
  const isModelValid = validateInlineFormField(modelSelect, modelSelect.value);

  return isNameValid && isModelValid;
}

// 重置表单
function resetInlineMemberForm() {
  const nameInput = document.getElementById('newMemberInConvName');
  const modelSelect = document.getElementById('newMemberInConvModel');
  const promptSelect = document.getElementById('newMemberInConvPrompt');

  if (nameInput) {
    nameInput.value = '';
    nameInput.classList.remove('error', 'success');
  }

  if (modelSelect) {
    modelSelect.value = '';
    modelSelect.classList.remove('error', 'success');
  }

  if (promptSelect) {
    promptSelect.value = '';
  }

  const container = document.getElementById('inlineMemberFormContainer');
  if (container) {
    container.classList.remove('success');
  }

  const saveBtn = document.getElementById('saveInlineMemberBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span>✨</span> 创建并添加';
    saveBtn.style.background = '';
  }

  console.log('[Sidepanel] 内联表单已重置');
}

// 保存新成员
async function saveInlineMember() {
  const saveBtn = document.getElementById('saveInlineMemberBtn');
  const container = document.getElementById('inlineMemberFormContainer');

  if (!saveBtn || !container) return;

  // 验证表单
  if (!validateInlineMemberForm()) {
    // 震动效果
    saveBtn.style.animation = 'shake 0.4s ease';
    setTimeout(() => {
      saveBtn.style.animation = '';
    }, 400);
    return;
  }

  const nameInput = document.getElementById('newMemberInConvName');
  const modelSelect = document.getElementById('newMemberInConvModel');
  const promptSelect = document.getElementById('newMemberInConvPrompt');

  if (!nameInput || !modelSelect) return;

  const memberName = nameInput.value.trim();
  const modelId = modelSelect.value;
  const promptId = promptSelect ? promptSelect.value : null;

  // 显示加载状态
  const originalText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="loading-spinner"></span> 创建中...';

  try {
    const model = state.inlineMemberForm.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error('模型不存在');
    }

    let systemPrompt = '';
    if (promptId) {
      const prompt = state.inlineMemberForm.prompts.find(p => p.id === promptId);
      if (prompt) {
        systemPrompt = prompt.content || '';
      }
    }

    const newMember = await sendMessage({
      action: 'createMember',
      name: memberName,
      provider: model.provider,
      model: model.model,
      systemPrompt: systemPrompt
    });

    if (newMember) {
      state.members.push(newMember);

      // 将新成员添加到成员选择器并自动选中
      addMemberToSelector(newMember);

      // 成功状态
      container.classList.add('success');
      saveBtn.innerHTML = '<span>✓</span> 创建成功';
      saveBtn.style.background = 'linear-gradient(135deg, #34c759 0%, #30b350 100%)';

      console.log('[Sidepanel] 新成员创建成功:', newMember);

      // 延迟折叠并重置（修改延迟为 100ms）
      setTimeout(() => {
        collapseInlineMemberForm();
        setTimeout(() => {
          resetInlineMemberForm();
        }, 300);
      }, 100);
    }
  } catch (error) {
    console.error('[Sidepanel] 创建成员失败:', error);

    // 错误状态
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span>✗</span> 创建失败';
    saveBtn.style.background = 'linear-gradient(135deg, #ff3b30 0%, #d63020 100%)';

    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
      saveBtn.style.background = '';
    }, 2000);
  }
}

// 将新成员添加到成员选择器
function addMemberToSelector(member) {
  const memberSelector = document.getElementById('memberSelector');
  if (!memberSelector) return;

  const info = getMemberDisplayInfo(member);
  const provider = PROVIDERS[member.provider];
  const color = provider ? provider.color : '#666';

  const memberHtml = `
    <div class="member-checkbox" data-member-id="${member.id}" style="display: block; padding: 10px 12px; margin: 6px 0; background: #f9f9f9; border-radius: 6px; border: 1px solid #e5e7eb; animation: cardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1); position: relative;">
      <button class="remove-member-btn" data-member-id="${member.id}" style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border: none; background: #ff3b30; color: white; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">×</button>
      <div class="member-info-row" style="display: flex; align-items: center; gap: 8px;">
        <span class="member-avatar" style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, ${color}, ${color}cc); color: white; font-size: 12px; font-weight: 600; text-align: center; line-height: 24px; flex-shrink: 0;">${escapeHtml(member.name.charAt(0))}</span>
        <span class="member-name" style="font-weight: 600; color: #333;">${escapeHtml(info.name)}</span>
      </div>
      <div class="member-meta-row" style="margin-left: 34px; margin-top: 4px; font-size: 12px; color: #666;">
        <span class="member-model">🤖 ${escapeHtml(info.modelName)}</span>
        ${info.promptIcon ? `<span class="member-prompt" style="margin-left: 8px;">${escapeHtml(info.promptIcon)} ${escapeHtml(info.promptName)}</span>` : ''}
      </div>
    </div>
  `;

  memberSelector.insertAdjacentHTML('beforeend', memberHtml);

  // 滚动到底部
  memberSelector.scrollTop = memberSelector.scrollHeight;

  // 为新添加的成员绑定删除事件
  const newBtn = memberSelector.querySelector(`.remove-member-btn[data-member-id="${member.id}"]`);
  if (newBtn) {
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = newBtn.dataset.memberId;
      const memberCard = newBtn.closest('.member-checkbox');
      if (memberCard) {
        memberCard.style.opacity = '0';
        memberCard.style.transform = 'translateX(20px)';
        setTimeout(() => {
          memberCard.remove();
        }, 200);
      }
    });

    newBtn.addEventListener('mouseenter', () => {
      newBtn.style.transform = 'scale(1.1)';
      newBtn.style.background = '#d63020';
    });
    newBtn.addEventListener('mouseleave', () => {
      newBtn.style.transform = 'scale(1)';
      newBtn.style.background = '#ff3b30';
    });
  }

  console.log('[Sidepanel] 新成员已添加到成员选择器');
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}