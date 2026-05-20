const state = {
  conversations: [],
  roles: [],
  settings: { wsUrl: 'ws://localhost:8080', wsEnabled: false },
  editingRoleId: null,
  models: [],        // 新增：模型列表
  prompts: [],       // 新增：提示词列表
  flows: []          // 新增：流程列表
};

// DOM元素
const elements = {
  conversationList: null,
  roleList: null,
  newConversationModal: null,
  newRoleModal: null
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
  elements.roleList = document.getElementById('roleList');
  elements.newConversationModal = document.getElementById('newConversationModal');
  elements.newRoleModal = document.getElementById('newRoleModal');

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
  const [conversations, roles, settings, models, prompts] = await Promise.all([
    sendMessage({ action: 'getConversations' }),
    sendMessage({ action: 'getRoles' }),
    sendMessage({ action: 'getSettings' }),
    sendMessage({ action: 'getModels' }),
    sendMessage({ action: 'getPrompts' })
  ]);

  state.conversations = conversations || [];
  state.roles = roles || [];
  state.settings = settings || { wsUrl: 'ws://localhost:8080', wsEnabled: false, contextMode: 'self', floatWindow: true };
  state.models = models || [];
  state.prompts = prompts || [];

  // 加载设置到UI
  loadSettingsToUI();
}

function loadSettingsToUI() {
  const floatWindowCheck = document.getElementById('floatWindowCheck');

  if (floatWindowCheck) {
    floatWindowCheck.checked = state.settings.floatWindow !== false;
  }
}

function bindEvents() {
  // 标签切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 新建会话
  const newConversationBtn = document.getElementById('newConversationBtn');
  if (newConversationBtn) {
    newConversationBtn.addEventListener('click', showNewConversationModal);
  }

  const confirmConversationBtn = document.getElementById('confirmConversationBtn');
  if (confirmConversationBtn) {
    confirmConversationBtn.addEventListener('click', createConversation);
  }

  const cancelConversationBtn = document.getElementById('cancelConversationBtn');
  if (cancelConversationBtn) {
    cancelConversationBtn.addEventListener('click', hideNewConversationModal);
  }

  // 上下文模式切换
  const contextModeSelect = document.getElementById('contextMode');
  if (contextModeSelect) {
    contextModeSelect.addEventListener('change', updateStrategyOptions);
  }

  // 在新建会话中创建新角色
  const createRoleInConvBtn = document.getElementById('createRoleInConvBtn');
  if (createRoleInConvBtn) {
    createRoleInConvBtn.addEventListener('click', () => {
      showCreateRoleInConvModal();
    });
  }

  // 新建角色
  const newRoleBtn = document.getElementById('newRoleBtn');
  if (newRoleBtn) {
    newRoleBtn.addEventListener('click', showNewRoleModal);
  }

  const confirmRoleBtn = document.getElementById('confirmRoleBtn');
  if (confirmRoleBtn) {
    confirmRoleBtn.addEventListener('click', createRole);
  }

  const cancelRoleBtn = document.getElementById('cancelRoleBtn');
  if (cancelRoleBtn) {
    cancelRoleBtn.addEventListener('click', hideNewRoleModal);
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

  // 执行策略选择
  document.querySelectorAll('input[name="strategy"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const designBtn = document.getElementById('designConversationFlowBtn');
      if (designBtn) {
        designBtn.style.display = e.target.value === 'custom' ? 'block' : 'none';
      }
    });
  });

  // 设计会话流程按钮
  const designConversationFlowBtn = document.getElementById('designConversationFlowBtn');
  if (designConversationFlowBtn) {
    designConversationFlowBtn.addEventListener('click', showConversationFlowDesigner);
  }

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
  renderRoles();
}

function renderConversations() {
  if (state.conversations.length === 0) {
    elements.conversationList.innerHTML = '<div class="empty-state">暂无会话</div>';
    return;
  }

  elements.conversationList.innerHTML = state.conversations.map(conv => {
    // 兼容旧数据：roleIds 和 新数据：modelIds
    const modelIds = conv.modelIds || conv.roleIds || [];
    const models = modelIds.map(id => {
      // 优先从新models中查找，再从旧roles中查找
      let model = state.models.find(m => m.id === id);
      if (model) return model;

      const role = state.roles.find(r => r.id === id);
      return role ? { name: role.name, isVirtual: false } : null;
    }).filter(Boolean);

    const modelNames = models.map(m => {
      if (m.isVirtual) return `${m.icon || '🤖'} ${m.name}`;
      return m.name;
    }).join(', ');

    const lastMessage = conv.messages[conv.messages.length - 1];
    const preview = lastMessage ? lastMessage.content.substring(0, 60) + '...' : '暂无消息';
    const msgCount = conv.messages?.length || 0;

    // 上下文模式标签
    const contextModeLabel = conv.contextMode === 'full'
      ? '<span class="conversation-mode-tag full">共享</span>'
      : '<span class="conversation-mode-tag self">独享</span>';

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
        <div class="conversation-roles">模型: ${modelNames || '未选择'}</div>
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

function renderRoles() {
  // 角色功能已废弃，此函数保留以防旧代码调用
  if (!elements.roleList) return;
  
  if (state.roles.length === 0) {
    elements.roleList.innerHTML = '<div class="empty-state">暂无角色</div>';
    return;
  }

  elements.roleList.innerHTML = state.roles.map(role => {
    const provider = PROVIDERS[role.provider];
    const providerName = provider ? provider.name : role.provider;
    const providerColor = provider ? provider.color : '#666';

    return `
      <div class="role-item" data-id="${role.id}">
        <div class="role-header">
          <h3>
            <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${providerColor};color:#fff;font-size:12px;font-weight:700;margin-right:6px;flex-shrink:0;">${escapeHtml(role.name.charAt(0))}</span>
            ${escapeHtml(role.name)}
          </h3>
          <div class="role-actions">
            <button class="test-btn" data-id="${role.id}" data-provider="${role.provider}">测试</button>
            <button class="edit-btn" data-id="${role.id}">编辑</button>
            <button class="delete-btn" data-id="${role.id}">&times;</button>
          </div>
        </div>
        <div class="role-info">
          <div><span style="font-weight:500;color:#333;">提供商:</span> ${providerName}</div>
          <div><span style="font-weight:500;color:#333;">模型:</span> ${escapeHtml(role.model)}</div>
        </div>
      </div>
    `;
  }).join('');

  // 绑定删除事件
  document.querySelectorAll('.role-item .delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRole(btn.dataset.id);
    });
  });

  // 绑定编辑事件
  document.querySelectorAll('.role-item .edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editRole(btn.dataset.id);
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
  const selectedRoleIds = Array.from(document.querySelectorAll('#roleSelector input:checked'))
    .map(cb => cb.value);
  const contextMode = document.getElementById('contextMode').value;
  
  // 获取执行策略
  let sendMode = 'parallel'; // 默认并行
  if (contextMode === 'full') {
    const strategyRadio = document.querySelector('input[name="strategy"]:checked');
    if (strategyRadio) {
      sendMode = strategyRadio.value;
    }
  }

  if (!name) {
    alert('请输入会话名称');
    return;
  }

  if (selectedRoleIds.length === 0) {
    alert('请至少选择一个角色');
    return;
  }

  if (state.editingConversationId) {
    // 编辑模式
    const updates = { name, roleIds: selectedRoleIds, sendMode };
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
    // 新建模式
    const conversation = await sendMessage({
      action: 'createConversation',
      name,
      roleIds: selectedRoleIds,
      contextMode,
      sendMode
    });

    if (conversation) {
      state.conversations.push(conversation);
      renderConversations();
      hideNewConversationModal();

      // 打开新会话的聊天页面
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

// 角色操作
async function createRole() {
  const name = document.getElementById('roleName').value.trim();
  const provider = document.getElementById('provider').value;
  let model = document.getElementById('model').value.trim();
  const systemPrompt = document.getElementById('systemPrompt').value.trim();

  if (!name) {
    alert('请输入角色名称');
    return;
  }

  if (state.editingRoleId) {
    const updates = { name, provider, model, systemPrompt };
    await sendMessage({
      action: 'updateRole',
      roleId: state.editingRoleId,
      updates
    });

    const roleIndex = state.roles.findIndex(r => r.id === state.editingRoleId);
    if (roleIndex !== -1) {
      Object.assign(state.roles[roleIndex], { id: state.editingRoleId, ...updates });
    }
    renderRoles();
    hideNewRoleModal();
  } else {
    if (!model) {
      const providerConfig = PROVIDERS[provider];
      model = providerConfig ? providerConfig.defaultModel : 'default';
    }

    const role = await sendMessage({
      action: 'createRole',
      name,
      provider,
      model,
      systemPrompt
    });

    if (role) {
      state.roles.push(role);
      renderRoles();
      hideNewRoleModal();
    }
  }
}

async function deleteRole(roleId) {
  if (confirm('确定要删除这个角色吗？')) {
    await sendMessage({
      action: 'deleteRole',
      roleId
    });

    state.roles = state.roles.filter(r => r.id !== roleId);
    renderRoles();
  }
}

function editRole(roleId) {
  const role = state.roles.find(r => r.id === roleId);
  if (role) {
    showEditRoleModal(role);
  }
}

async function testPlatform(provider, roleId) {
  const role = state.roles.find(r => r.id === roleId);
  if (!role) return;

  const btn = document.querySelector(`.test-btn[data-id="${roleId}"]`);
  const originalText = btn.textContent;
  btn.textContent = '测试中...';
  btn.disabled = true;

  try {
    const result = await sendMessage({
      action: 'testPlatform',
      platform: provider
    });

    if (result && result.success) {
      alert(`✅ ${role.name} 连接成功！\n\n平台信息：${JSON.stringify(result.info, null, 2)}`);
    } else {
      alert(`❌ ${role.name} 连接失败\n\n请确保已在浏览器中登录 ${provider} 账号`);
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

// 模态框操作
function showNewConversationModal() {
  state.editingConversationId = null;
  document.getElementById('conversationModalTitle').textContent = '新建会话';
  document.getElementById('confirmConversationBtn').textContent = '创建';
  document.getElementById('contextMode').disabled = false;

  // 渲染角色选择器
  const roleSelector = document.getElementById('roleSelector');
  if (state.roles.length === 0) {
    roleSelector.innerHTML = '<div class="empty-state">暂无可用角色</div>';
  } else {
    roleSelector.innerHTML = state.roles.map(role => {
      const provider = PROVIDERS[role.provider];
      const color = provider ? provider.color : '#666';
      return `
        <label class="role-checkbox" style="display: block; padding: 8px 10px; margin: 4px 0; background: #f9f9f9; border-radius: 4px; cursor: pointer; border: 1px solid #e5e7eb;">
          <input type="checkbox" value="${role.id}" data-role-id="${role.id}">
          <span style="margin-left: 8px; display: inline-flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, ${color}, ${color}cc); color: white; font-size: 11px; text-align: center; line-height: 20px;">${escapeHtml(role.name.charAt(0))}</span>
            ${escapeHtml(role.name)}
          </span>
        </label>
      `;
    }).join('');
  }

  // 初始化执行策略
  updateStrategyOptions();

  elements.newConversationModal.classList.add('active');
}

// 根据上下文模式更新执行策略选项
function updateStrategyOptions() {
  const contextMode = document.getElementById('contextMode').value;
  const strategyGroup = document.getElementById('strategyGroup');
  const strategyRadios = document.querySelectorAll('input[name="strategy"]');
  const strategyHint = document.getElementById('strategyHint');

  if (contextMode === 'self') {
    // 独享模式：隐藏执行策略选项，默认并行
    strategyGroup.style.display = 'none';
  } else {
    // 共享模式：显示执行策略选项
    strategyGroup.style.display = 'block';
    strategyHint.textContent = '共享模式支持三种执行策略';
  }
}

// 在新建会话中创建新角色
async function showCreateRoleInConvModal() {
  const [models, prompts] = await Promise.all([
    sendMessage({ action: 'getModels' }),
    sendMessage({ action: 'getPrompts' })
  ]);

  const availableModels = (models || []).filter(m => m.enabled !== false);
  const availablePrompts = prompts || [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h2>创建新角色</h2>
      
      <div class="form-group" style="margin-bottom: 16px;">
        <label>角色名称</label>
        <input type="text" id="newRoleInConvName" class="form-input" placeholder="输入角色名称" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label>选择模型</label>
        <select id="newRoleInConvModel" class="form-select" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
          <option value="">请选择模型...</option>
          ${availableModels.map(model => {
            const provider = PROVIDERS[model.provider];
            const displayName = provider ? `${provider.name} - ${model.name}` : model.name;
            return `<option value="${model.id}">${displayName}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 16px;">
        <label>选择提示词（可选）</label>
        <select id="newRoleInConvPrompt" class="form-select" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
          <option value="">无提示词</option>
          ${availablePrompts.map(prompt => {
            return `<option value="${prompt.id}">${escapeHtml(prompt.name)}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelRoleInConvBtn">取消</button>
        <button class="btn btn-primary" id="saveRoleInConvBtn">创建并添加</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cancelBtn = document.getElementById('cancelRoleInConvBtn');
  const saveBtn = document.getElementById('saveRoleInConvBtn');

  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  saveBtn.addEventListener('click', async () => {
    const roleName = modal.querySelector('#newRoleInConvName').value.trim();
    const modelId = modal.querySelector('#newRoleInConvModel').value;
    const promptId = modal.querySelector('#newRoleInConvPrompt').value;

    if (!roleName) {
      alert('请输入角色名称');
      return;
    }

    if (!modelId) {
      alert('请选择模型');
      return;
    }

    try {
      // 获取模型信息
      const model = availableModels.find(m => m.id === modelId);
      if (!model) {
        alert('模型不存在');
        return;
      }

      // 获取提示词内容
      let systemPrompt = '';
      if (promptId) {
        const prompt = availablePrompts.find(p => p.id === promptId);
        if (prompt) {
          systemPrompt = prompt.content || '';
        }
      }

      // 创建新角色
      const newRole = await sendMessage({
        action: 'createRole',
        name: roleName,
        provider: model.provider,
        model: model.model,
        systemPrompt: systemPrompt
      });

      if (newRole) {
        // 添加到state.roles
        state.roles.push(newRole);
        
        // 刷新角色选择器
        const roleSelector = document.getElementById('roleSelector');
        if (roleSelector) {
          const provider = PROVIDERS[newRole.provider];
          const color = provider ? provider.color : '#666';
          const roleHtml = `
            <label class="role-checkbox" style="display: block; padding: 8px 10px; margin: 4px 0; background: #f9f9f9; border-radius: 4px; cursor: pointer; border: 1px solid #e5e7eb;">
              <input type="checkbox" value="${newRole.id}" data-role-id="${newRole.id}" checked>
              <span style="margin-left: 8px; display: inline-flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, ${color}, ${color}cc); color: white; font-size: 11px; text-align: center; line-height: 20px;">${escapeHtml(newRole.name.charAt(0))}</span>
                ${escapeHtml(newRole.name)}
              </span>
            </label>
          `;
          roleSelector.insertAdjacentHTML('beforeend', roleHtml);
        }

        document.body.removeChild(modal);
        console.log('[Sidepanel] 新角色已创建并添加到会话');
      }
    } catch (error) {
      console.error('创建角色失败:', error);
      alert('创建角色失败：' + error.message);
    }
  });

  // 点击外部关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

function updateRoleSettings() {
  const selectedRoleIds = Array.from(document.querySelectorAll('.role-selector input:checked'))
    .map(cb => cb.value);

  const container = document.getElementById('roleSettingsContainer');
  const group = document.getElementById('roleSettingsGroup');

  if (selectedRoleIds.length === 0) {
    container.innerHTML = '';
    group.style.display = 'none';
    return;
  }

  group.style.display = 'block';
  container.innerHTML = selectedRoleIds.map(roleId => {
    const role = state.roles.find(r => r.id === roleId);
    if (!role) return '';
    return `
      <div class="role-setting-item" style="margin-bottom: 12px; padding: 10px; background: #f5f5f5; border-radius: 6px;">
        <div style="font-weight: 600; margin-bottom: 8px;">${escapeHtml(role.name)}</div>
        <div style="margin-bottom: 8px;">
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">昵称（可选）</label>
          <input type="text" class="role-nickname-input" data-role-id="${roleId}" placeholder="默认：${escapeHtml(role.name)}" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div>
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 4px;">追加提示词（可选）</label>
          <textarea class="role-prompt-input" data-role-id="${roleId}" rows="2" placeholder="为该角色在此会话中追加特殊的提示词" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
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
  const contextModeSelect = document.getElementById('contextMode');
  contextModeSelect.value = conversation.contextMode || 'self';
  contextModeSelect.disabled = true;

  // 渲染角色选择器并选中当前角色
  const roleSelector = document.getElementById('roleSelector');
  if (state.roles.length === 0) {
    roleSelector.innerHTML = '<div class="empty-state">请先创建角色</div>';
  } else {
    roleSelector.innerHTML = state.roles.map(role => {
      const isChecked = conversation.roleIds.includes(role.id) ? 'checked' : '';
      return `
        <label class="role-checkbox">
          <input type="checkbox" value="${role.id}" ${isChecked}>
          <span>${escapeHtml(role.name)}</span>
          <small>(${role.provider})</small>
        </label>
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
}

function showNewRoleModal() {
  state.editingRoleId = null;
  document.querySelector('#newRoleModal h2').textContent = '新建角色';
  document.getElementById('confirmRoleBtn').textContent = '创建';
  elements.newRoleModal.classList.add('active');
}

function showEditRoleModal(role) {
  state.editingRoleId = role.id;
  document.querySelector('#newRoleModal h2').textContent = '编辑角色';
  document.getElementById('confirmRoleBtn').textContent = '保存';

  document.getElementById('roleName').value = role.name;
  document.getElementById('provider').value = role.provider;
  document.getElementById('model').value = role.model;
  document.getElementById('systemPrompt').value = role.systemPrompt || '';

  elements.newRoleModal.classList.add('active');
}

function hideNewRoleModal() {
  elements.newRoleModal.classList.remove('active');
  state.editingRoleId = null;
  document.getElementById('roleName').value = '';
  document.getElementById('model').value = '';
  document.getElementById('systemPrompt').value = '';
  document.querySelector('#newRoleModal h2').textContent = '新建角色';
  document.getElementById('confirmRoleBtn').textContent = '创建';
}

function closeAllModals() {
  hideNewConversationModal();
  hideNewRoleModal();
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

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
