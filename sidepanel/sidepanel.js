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
  const selectedModelIds = Array.from(document.querySelectorAll('#modelSelector input:checked'))
    .map(cb => cb.value);
  const promptId = document.getElementById('conversationPrompt').value || null;
  const contextMode = document.getElementById('contextMode').value;

  if (!name) {
    alert('请输入会话名称');
    return;
  }

  if (selectedModelIds.length === 0) {
    alert('请至少选择一个模型');
    return;
  }

  if (state.editingConversationId) {
    // 编辑模式
    const updates = { name, modelIds: selectedModelIds, promptId };
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
      modelIds: selectedModelIds,
      promptId,
      contextMode
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

  // 渲染模型选择器
  const modelSelector = document.getElementById('modelSelector');
  if (state.models.length === 0) {
    modelSelector.innerHTML = '<div class="empty-state">暂无可用模型，请先在"模型"标签页创建模型</div>';
  } else {
    // 分组显示：虚拟模型一组，普通模型按提供商分组
    const virtualModels = state.models.filter(m => m.isVirtual && m.enabled);
    const regularModels = state.models.filter(m => !m.isVirtual && m.enabled);

    let html = '';

    // 虚拟模型组
    if (virtualModels.length > 0) {
      html += '<div style="margin-bottom: 12px;"><strong style="color: #8b5cf6; font-size: 12px;">🤖 虚拟模型</strong></div>';
      html += virtualModels.map(model => `
        <label class="model-checkbox" style="display: block; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 4px; cursor: pointer;">
          <input type="checkbox" value="${model.id}" data-model-id="${model.id}">
          <span style="margin-left: 8px;">${model.icon || '🤖'} ${escapeHtml(model.name)}</span>
        </label>
      `).join('');
    }

    // 普通模型按提供商分组
    const grouped = {};
    regularModels.forEach(model => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });

    for (const [provider, models] of Object.entries(grouped)) {
      const providerInfo = PROVIDERS[provider];
      html += `<div style="margin-top: 12px; margin-bottom: 8px;"><strong style="color: ${providerInfo?.color || '#666'}; font-size: 12px;">${providerInfo?.name || provider}</strong></div>`;
      html += models.map(model => `
        <label class="model-checkbox" style="display: block; padding: 6px 8px; margin: 4px 0; background: #f9f9f9; border-radius: 4px; cursor: pointer;">
          <input type="checkbox" value="${model.id}" data-model-id="${model.id}">
          <span style="margin-left: 8px;">${escapeHtml(model.name)}</span>
        </label>
      `).join('');
    }

    modelSelector.innerHTML = html;
  }

  // 渲染提示词选择器
  const promptSelect = document.getElementById('conversationPrompt');
  promptSelect.innerHTML = '<option value="">不使用提示词</option>' +
    state.prompts.map(prompt =>
      `<option value="${prompt.id}">${escapeHtml(prompt.name)}</option>`
    ).join('');

  elements.newConversationModal.classList.add('active');
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

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
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
