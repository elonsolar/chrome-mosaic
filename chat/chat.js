// 获取会话ID
const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get('id');

// 状态
const state = {
  conversation: null,
  roles: [],
  isLoading: false,
  isWaitingResponse: false
};

// DOM元素
const elements = {
  chatTitle: null,
  rolesTags: null,
  messagesContainer: null,
  messageInput: null,
  sendBtn: null
};

// 初始化
async function init() {
  if (!conversationId) {
    showError('会话ID不存在');
    return;
  }

  // 初始化DOM元素
  initElements();

  // 加载数据
  await loadData();

  // 绑定事件
  bindEvents();

  // 监听存储变化（实时更新UI）
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.conversations) {
      handleStorageChange(changes.conversations);
    }
  });

  // 渲染界面
  render();

  // 初始化平台面板
  initPlatformPanel();
}

function initElements() {
  elements.chatTitle = document.getElementById('chatTitle');
  elements.rolesTags = document.getElementById('rolesTags');
  elements.messagesContainer = document.getElementById('messagesContainer');
  elements.messageInput = document.getElementById('messageInput');
  elements.sendBtn = document.getElementById('sendBtn');
  elements.modeBadge = document.getElementById('modeBadge');
  elements.platformPanel = document.getElementById('platformPanel');
  elements.platformWindows = document.getElementById('platformWindows');

  // 创建滚动到底部按钮
  elements.scrollBottomBtn = document.createElement('button');
  elements.scrollBottomBtn.className = 'scroll-bottom-btn';
  elements.scrollBottomBtn.innerHTML = '↓';
  elements.scrollBottomBtn.title = '滚动到底部';
  elements.messagesContainer.appendChild(elements.scrollBottomBtn);
}

async function loadData() {
  try {
    const [conversation, roles] = await Promise.all([
      getConversation(conversationId),
      getRoles()
    ]);

    state.conversation = conversation;
    state.roles = roles;

    if (!conversation) {
      showError('会话不存在');
    }
  } catch (error) {
    console.error('加载数据失败:', error);
    showError('加载数据失败');
  }
}

function bindEvents() {
  elements.sendBtn.addEventListener('click', sendMessage);

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const value = e.target.value.trim();

      if (value.startsWith('/')) {
        const filter = value.substring(1).toLowerCase();
        const candidates = getFilteredCommands(filter);

        if (candidates.length > 0) {
          elements.messageInput.value = candidates[0].name + ' ';
          hideCommandSuggestions();
          sendMessage();
        } else {
          showError('没有匹配的命令: ' + value);
          hideCommandSuggestions();
        }
        return;
      }

      if (selectCandidateCommand()) {
        return;
      }
      sendMessage();
    } else if (e.key === 'Escape') {
      hideCommandSuggestions();
    }
  });

  elements.messageInput.addEventListener('input', (e) => {
    const value = e.target.value;
    
    if (value === '/') {
      showCommandSuggestions();
    } else if (value.startsWith('/') && !value.includes(' ')) {
      const filter = value.substring(1).toLowerCase();
      showCommandSuggestions(filter);
    } else {
      hideCommandSuggestions();
    }
  });

  // 模式徽章点击打开模式选择器
  const modeBadge = document.getElementById('modeBadge');
  if (modeBadge) {
    modeBadge.addEventListener('click', () => {
      showModeSelector();
    });
  }

  // 角色标签点击打开排序
  elements.rolesTags.addEventListener('click', (e) => {
    const tag = e.target.closest('.role-tag.draggable');
    if (tag) {
      showModeSelector(true);
    }

    // 角色删除按钮
    const removeBtn = e.target.closest('.role-tag-remove');
    if (removeBtn) {
      const tag = removeBtn.closest('.role-tag');
      const roleId = tag.dataset.roleId;
      removeRoleFromConversation(roleId);
    }
  });

  // 点击标题编辑会话名称
  elements.chatTitle.addEventListener('click', () => {
    if (!elements.chatTitle.classList.contains('editing')) {
      enableTitleEditing();
    }
  });

  // 添加角色按钮
  const roleAddBtn = document.getElementById('roleAddBtn');
  if (roleAddBtn) {
    roleAddBtn.addEventListener('click', () => {
      showAddRoleModal();
    });
  }

  // 滚动到底部按钮
  elements.scrollBottomBtn.addEventListener('click', () => {
    scrollToBottom();
    elements.scrollBottomBtn.classList.remove('visible');
  });

  // 监听消息容器滚动
  elements.messagesContainer.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = elements.messagesContainer;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    elements.scrollBottomBtn.classList.toggle('visible', !isNearBottom);
  });

  // 平台面板切换
  const platformToggle = document.getElementById('platformToggle');
  if (platformToggle) {
    platformToggle.addEventListener('click', togglePlatformPanel);
  }

  // 平台面板拖拽调整大小
  initPlatformResizer();
}

function initPlatformResizer() {
  const resizer = document.getElementById('platformResizer');
  const platformPanel = document.getElementById('platformPanel');
  if (!resizer || !platformPanel) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = platformPanel.offsetWidth;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const deltaX = startX - e.clientX;
    const newWidth = Math.max(400, Math.min(startWidth + deltaX, window.innerWidth * 0.9));
    platformPanel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

async function handleStorageChange(change) {
  console.log('[Chat] 检测到存储变化');

  const newConversations = change.newValue || [];
  const updatedConversation = newConversations.find(c => c.id === conversationId);

  if (updatedConversation) {
    const oldMessageCount = state.conversation?.messages?.length || 0;
    const newMessageCount = updatedConversation?.messages?.length || 0;

    console.log(`[Chat] 消息数变化: ${oldMessageCount} → ${newMessageCount}`);

    state.conversation = updatedConversation;
    renderMessages();

    // 更新平台面板的消息列表
    updatePlatformPanelMessages();

    if (newMessageCount > oldMessageCount) {
      console.log(`[Chat] 新增了 ${newMessageCount - oldMessageCount} 条消息`);
      scrollToBottom();

      if (state.isWaitingResponse) {
        console.log('[Chat] AI回复已到达，恢复发送按钮');
        state.isWaitingResponse = false;
        resetSendButton();
      }
    }
  }
}

function updatePlatformPanelMessages() {
  if (!state.conversation.roleIds || state.conversation.roleIds.length === 0) {
    return;
  }

  state.conversation.roleIds.forEach(roleId => {
    const role = state.roles.find(r => r.id === roleId);
    if (!role) return;

    const windowElement = document.querySelector(`.platform-window[data-role-id="${roleId}"]`);
    if (!windowElement) return;

    const messageList = windowElement.querySelector('.platform-message-list');
    if (!messageList) return;

    const roleMessages = getRoleMessages(roleId);

    if (roleMessages.length > 0) {
      messageList.innerHTML = roleMessages.map(msg => createMessageHTML(msg, role)).join('');
    } else {
      messageList.innerHTML = `
        <div class="platform-conversation-empty">
          <div class="platform-empty-icon">💬</div>
          <div class="platform-empty-text">暂无消息</div>
          <div class="platform-empty-hint">发送消息后会在此显示对话历史</div>
        </div>
      `;
    }

    // 重新绑定事件监听器
    messageList.removeEventListener('click', handleMessageListClick);
    messageList.addEventListener('click', handleMessageListClick);
  });

  console.log('[Chat] 平台面板消息已更新');
}

function handleMessageListClick(e) {
  const header = e.target.closest('.platform-message-header');
  const expandBtn = e.target.closest('.platform-message-expand-btn');

  if (header || expandBtn) {
    const messageEl = (header || expandBtn).closest('.platform-message');
    if (messageEl) {
      const messageId = messageEl.dataset.messageId;
      const roleId = messageEl.dataset.roleId;
      toggleMessageExpand(messageId, roleId);
    }
  }
}

function bindRoleClickEvents() {
  const clickableElements = elements.messagesContainer.querySelectorAll('.clickable');
  clickableElements.forEach(el => {
    el.addEventListener('click', async (e) => {
      const provider = e.currentTarget.getAttribute('data-provider');
      const roleId = e.currentTarget.getAttribute('data-role-id');
      if (provider) {
        try {
          let targetUrl = null;
          if (roleId && state.conversation?.roleUrls) {
            targetUrl = state.conversation.roleUrls[roleId] || null;
          }
          await chrome.runtime.sendMessage({
            action: 'activatePlatformTab',
            provider,
            targetUrl
          });
        } catch (error) {
          console.error('激活标签页失败:', error);
        }
      }
    });
  });
}

function render() {
  if (!state.conversation) return;

  // 设置标题
  elements.chatTitle.textContent = state.conversation.name;

  // 显示当前模式
  renderModeBadge();

  // 设置角色标签
  renderRolesTags();

  // 渲染消息
  renderMessages();
}

function renderRolesTags() {
  if (!state.conversation.roleIds || state.conversation.roleIds.length === 0) {
    elements.rolesTags.innerHTML = '<span class="role-tag">未选择角色</span>';
    return;
  }

  const hasOrdering = state.conversation.sendMode && state.conversation.sendMode === 'sequential';

  elements.rolesTags.innerHTML = state.conversation.roleIds.map(roleId => {
    const role = state.roles.find(r => r.id === roleId);
    if (!role) return '';
    const roleIndex = (state.conversation.roleOrder || state.conversation.roleIds).indexOf(roleId);
    const provider = PROVIDERS[role.provider];
    const color = provider ? provider.color : '#666';
    return `<span class="role-tag${hasOrdering ? ' draggable' : ''}" data-role-id="${roleId}" title="${hasOrdering ? '点击调整顺序' : ''}">
      ${hasOrdering ? `<span class="role-tag-drag-handle">#${roleIndex + 1}</span>` : ''}
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px;"></span>
      ${escapeHtml(role.name)}
      <span class="role-tag-remove" title="移除角色">×</span>
    </span>`;
  }).join('');
}

function renderModeBadge() {
  const badge = document.getElementById('modeBadge');
  if (!badge) return;

  const contextMode = state.conversation.contextMode || 'self';
  const sendMode = state.conversation.sendMode || 'parallel';
  
  const contextModeNames = { self: '独享', full: '共享' };
  const sendModeNames = { parallel: '并行', sequential: '顺序接龙', random: '随机接龙' };
  
  let badgeText, badgeClass, badgeTitle;

  if (contextMode === 'self') {
    badgeText = contextModeNames[contextMode];
    badgeClass = 'mode-badge mode-context-self';
    badgeTitle = '当前模式: 独享模式\n每个AI独立对话，互不干扰\n点击切换';
  } else {
    badgeText = `${contextModeNames[contextMode]} · ${sendModeNames[sendMode]}`;
    badgeClass = 'mode-badge mode-context-full mode-' + sendMode;
    
    const sendModeLabels = { 
      parallel: '并行模式', 
      sequential: '顺序模式（角色接龙）', 
      random: '随机模式（角色接龙）' 
    };
    badgeTitle = `当前模式: 共享模式 · ${sendModeLabels[sendMode]}\n点击切换`;
  }

  badge.className = badgeClass;
  badge.textContent = badgeText;
  badge.title = badgeTitle;
}

function renderMessages() {
  if (!state.conversation.messages || state.conversation.messages.length === 0) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-messages">
        <div class="empty-messages-icon">💬</div>
        <h2>开始对话</h2>
        <p>在下方输入消息，所有角色将同时收到并回复</p>
      </div>
    `;
    return;
  }

  elements.messagesContainer.innerHTML = state.conversation.messages.map(msg => {
    const role = state.roles.find(r => r.id === msg.roleId);
    const roleSetting = state.conversation.roleSettings?.[msg.roleId] || {};
    const displayName = roleSetting.nickname || role?.name || '未知角色';
    const providerName = role ? getProviderDisplayName(role.provider) : '';
    const provider = role ? role.provider : null;

    if (msg.isUser) {
      return `
        <div class="message user-message">
          <div class="message-avatar user-avatar">我</div>
          <div class="message-content">
            <div class="message-text">${escapeHtml(msg.content)}</div>
            <div class="message-time">${formatTime(msg.timestamp)}</div>
          </div>
        </div>
      `;
    } else {
      const clickableClass = provider ? 'clickable' : '';
      const providerAttr = provider ? `data-provider="${provider}" data-role-id="${msg.roleId}"` : '';
      const providerConfig = PROVIDERS ? PROVIDERS[provider] : null;
      const color = providerConfig ? providerConfig.color : '#666';

      return `
        <div class="message ai-message">
          <div class="message-avatar ai-avatar ${clickableClass}" ${providerAttr} style="background:linear-gradient(135deg, ${color}, ${color}cc);">${escapeHtml(displayName.charAt(0))}</div>
          <div class="message-content">
            <div class="message-role ${clickableClass}" ${providerAttr}>
              ${escapeHtml(displayName)}
              ${providerName ? `<span class="provider-badge" style="background:linear-gradient(135deg, ${color}, ${color}cc);">${escapeHtml(providerName)}</span>` : ''}
            </div>
            <div class="message-text">${formatMessage(msg.content)}</div>
            <div class="message-time">${formatTime(msg.timestamp)}</div>
          </div>
        </div>
      `;
    }
  }).join('');

  bindRoleClickEvents();

  // 滚动到底部
  scrollToBottom();
}

async function sendMessage() {
  const content = elements.messageInput.value.trim();

  if (!content || state.isLoading) {
    return;
  }

  // 检查是否是命令
  if (content.startsWith('/')) {
    await handleCommand(content);
    elements.messageInput.value = '';
    return;
  }

  state.isLoading = true;
  elements.sendBtn.disabled = true;
  elements.sendBtn.innerHTML = '<span style="opacity:0.7;">发送中…</span>';

  try {
    addTempMessage(content, true);
    elements.messageInput.value = '';
    
    // 检查是否有虚拟模型
    const hasVirtualModels = await checkHasVirtualModels();
    
    if (hasVirtualModels) {
      // 有虚拟模型，显示执行过程
      showVirtualModelExecution();
    } else {
      // 只有普通模型，显示普通思考中
      showThinkingIndicator();
    }

    const updatedConversation = await sendMessageToBackend(conversationId, content);

    if (updatedConversation) {
      state.conversation = updatedConversation;
      renderMessages();
    }

    state.isWaitingResponse = true;

    setTimeout(() => {
      if (state.isWaitingResponse) {
        state.isWaitingResponse = false;
        resetSendButton();
      }
    }, 60000);
  } catch (error) {
    console.error('发送消息失败:', error);
    showError('发送消息失败: ' + error.message);
    resetSendButton();
  } finally {
    hideThinkingIndicator();
    scrollToBottom();
  }
}

function resetSendButton() {
    state.isLoading = false;
    resetSendButton();
  } catch (error) {
    console.error('发送消息失败:', error);
    showError('发送消息失败: ' + error.message);
    state.isLoading = false;
    resetSendButton();
  }
}

async function checkHasVirtualModels() {
  if (!state.conversation.modelIds && !state.conversation.roleIds) {
    return false;
  }
  
  const modelIds = state.conversation.modelIds || state.conversation.roleIds || [];
  
  try {
    const models = await sendMessage({ action: 'getModels' });
    if (!models) return false;
    
    return modelIds.some(id => {
      const model = models.find(m => m.id === id);
      return model && model.isVirtual;
    });
  } catch (error) {
    console.error('检查虚拟模型失败:', error);
    return false;
  }
}

function showVirtualModelExecution() {
  const executionId = 'exec-' + Date.now();
  
  const executionHTML = `
    <div class="message ai-message virtual-model-execution" id="${executionId}">
      <div class="message-avatar ai-avatar" style="background:linear-gradient(135deg, #8b5cf6, #6366f1);">🤖</div>
      <div class="message-content">
        <div class="message-role">虚拟模型执行中</div>
        <div class="virtual-model-progress">
          <div class="progress-header">
            <div class="progress-spinner"></div>
            <span class="progress-text">正在分析任务并分发给各个Agent...</span>
          </div>
          <div class="progress-nodes"></div>
        </div>
      </div>
    </div>
  `;
  
  elements.messagesContainer.insertAdjacentHTML('beforeend', executionHTML);
  scrollToBottom();
  
  return executionId;
}

function updateVirtualModelProgress(executionId, progress) {
  const executionElement = document.getElementById(executionId);
  if (!executionElement) return;
  
  const nodesContainer = executionElement.querySelector('.progress-nodes');
  const progressText = executionElement.querySelector('.progress-text');
  
  if (progressText) {
    progressText.textContent = progress.statusText || '执行中...';
  }
  
  if (nodesContainer && progress.nodes) {
    nodesContainer.innerHTML = progress.nodes.map(node => `
      <div class="progress-node ${node.status}">
        <div class="node-status">
          ${node.status === 'completed' ? '✅' : 
            node.status === 'running' ? '⏳' : 
            node.status === 'error' ? '❌' : '⏸️'}
        </div>
        <div class="node-info">
          <div class="node-name">${escapeHtml(node.name)}</div>
          ${node.result ? `<div class="node-result">${escapeHtml(node.result.substring(0, 100))}${node.result.length > 100 ? '...' : ''}</div>` : ''}
        </div>
      </div>
    `).join('');
  }
  
  scrollToBottom();
}


function showThinkingIndicator() {
  hideThinkingIndicator();
  const indicator = document.createElement('div');
  indicator.className = 'thinking-indicator';
  indicator.id = 'thinking-indicator';
  indicator.innerHTML = `
    <div class="thinking-dots">
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
    </div>
  `;
  elements.messagesContainer.appendChild(indicator);
  scrollToBottom();
}

function hideThinkingIndicator() {
  const existing = document.getElementById('thinking-indicator');
  if (existing) {
    existing.remove();
  }
}

async function handleCommand(command) {
  console.log('[Chat] 处理命令:', command);

  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case '/clear':
      await handleClearCommand();
      break;
    case '/mode':
      await handleModeCommand();
      break;
    default:
      showError('未知命令: ' + cmd);
  }
}

let clearStatusTimeout = null;

async function handleClearCommand() {
  try {
    // Step 1: 清空本地会话 → 立即清除页面
    const response = await chrome.runtime.sendMessage({
      action: 'clearConversationLocal',
      conversationId
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '清除失败');
    }

    state.conversation = response.conversation;
    renderMessages();
    console.log('[Chat] 本地会话已清除');

    // 在标题附近显示状态：正在删除后台会话
    showClearStatus('deleting');

    // Step 2: 把 roleUrls 快照传给平台删除（不 await）
    chrome.runtime.sendMessage({
      action: 'clearConversationPlatform',
      conversationId,
      roleUrls: response.roleUrls
    });

  } catch (error) {
    console.error('[Chat] 清除会话失败:', error);
    showClearStatus('failed');
  }
}

function showClearStatus(status) {
  const existing = document.querySelector('.clear-status');
  if (existing) existing.remove();
  if (clearStatusTimeout) {
    clearTimeout(clearStatusTimeout);
    clearStatusTimeout = null;
  }

  const indicator = document.createElement('div');
  indicator.className = 'clear-status';

  if (status === 'deleting') {
    indicator.innerHTML = '<span class="clear-status-dot"></span><span class="clear-status-text">正在删除后台会话...</span>';
  } else if (status === 'done') {
    indicator.innerHTML = '<span class="clear-status-dot clear-status-done"></span><span class="clear-status-text">清除成功</span>';
    clearStatusTimeout = setTimeout(() => indicator.remove(), 2000);
  } else if (status === 'failed') {
    indicator.innerHTML = '<span class="clear-status-dot clear-status-failed"></span><span class="clear-status-text">清除失败</span>';
    clearStatusTimeout = setTimeout(() => indicator.remove(), 3000);
  }

  document.querySelector('.chat-header-top').appendChild(indicator);
}

// 监听平台删除完成通知
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'clearComplete') {
    showClearStatus(request.success ? 'done' : 'failed');
  }
});

async function handleModeCommand() {
  showModeSelector();
}

function showModeSelector(focusOrder) {
  const currentContextMode = state.conversation.contextMode || 'self';
  const currentSendMode = state.conversation.sendMode || 'parallel';
  const currentOrder = state.conversation.roleOrder || state.conversation.roleIds || [];

  const contextModeNames = {
    self: '独享模式',
    full: '共享模式'
  };

  const sendModeNames = {
    parallel: '并行模式',
    sequential: '顺序模式',
    random: '随机模式'
  };

  const modal = document.createElement('div');
  modal.className = 'mode-selector-modal';
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <h2>会话模式设置</h2>

        ${currentContextMode === 'self' ? `
        <div class="mode-section">
          <div class="mode-info-readonly">
            <div class="mode-name">${contextModeNames[currentContextMode]}</div>
            <div class="mode-desc">每个AI独立对话，互不干扰，使用各自的会话URL</div>
          </div>
        </div>
        ` : `
        <div class="mode-section">
          <div class="mode-info-readonly">
            <div class="mode-name">${contextModeNames[currentContextMode]}</div>
            <div class="mode-desc">所有对话历史都发送给每个AI，每次打开新会话</div>
          </div>
        </div>

        <div class="mode-section" id="sendModeSection">
          <h3>发送模式</h3>
          <div class="mode-options">
            <label class="mode-option">
              <input type="radio" name="sendMode" value="parallel" ${currentSendMode === 'parallel' ? 'checked' : ''}>
              <div class="mode-info">
                <div class="mode-name">并行模式</div>
                <div class="mode-desc">所有角色同时收到消息并独立响应</div>
              </div>
            </label>
            <label class="mode-option">
              <input type="radio" name="sendMode" value="sequential" ${currentSendMode === 'sequential' ? 'checked' : ''}>
              <div class="mode-info">
                <div class="mode-name">顺序模式（角色接龙）</div>
                <div class="mode-desc">按角色顺序依次发送，每个角色能看到之前角色的回复</div>
              </div>
            </label>
            <label class="mode-option">
              <input type="radio" name="sendMode" value="random" ${currentSendMode === 'random' ? 'checked' : ''}>
              <div class="mode-info">
                <div class="mode-name">随机模式（角色接龙）</div>
                <div class="mode-desc">随机顺序依次发送，每个角色能看到之前角色的回复</div>
              </div>
            </label>
          </div>
        </div>
        `}
        
        <div class="mode-order-section" id="modeOrderSection">
          <h3>角色顺序</h3>
          <p class="mode-order-hint">拖动角色卡片调整顺序（用于顺序模式）</p>
          <div class="role-order-list" id="modeRoleOrderList">
            ${currentOrder.map((roleId, index) => {
              const role = state.roles.find(r => r.id === roleId);
              if (!role) return '';
              const providerConfig = PROVIDERS ? PROVIDERS[role.provider] : null;
              const color = providerConfig ? providerConfig.color : '#667eea';
              return `
                <div class="role-order-item" draggable="true" data-role-id="${roleId}">
                  <div class="role-order-handle">⋮⋮</div>
                  <div class="role-order-avatar" style="background:linear-gradient(135deg, ${color}, ${color}cc);">${escapeHtml(role.name.charAt(0))}</div>
                  <div class="role-order-info">
                    <div class="role-order-name">${escapeHtml(role.name)}</div>
                    <div class="role-order-provider">
                      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:4px;"></span>
                      ${getProviderDisplayName(role.provider)}
                    </div>
                  </div>
                  <div class="role-order-index" style="color:${color};">${index + 1}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelModeBtn">取消</button>
          <button class="btn btn-primary" id="saveModeBtn">保存</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const sendModeRadios = modal.querySelectorAll('input[name="sendMode"]');
  const sendModeSection = modal.querySelector('#sendModeSection');
  const orderSection = modal.querySelector('#modeOrderSection');
  const orderList = modal.querySelector('#modeRoleOrderList');

  function updateSectionVisibility() {
    if (!sendModeSection) return;

    const selectedSendMode = modal.querySelector('input[name="sendMode"]:checked').value;

    if (selectedSendMode === 'sequential') {
      orderSection.style.display = 'block';
    } else {
      orderSection.style.display = 'none';
    }
  }

  if (sendModeRadios) {
    sendModeRadios.forEach(radio => {
      radio.addEventListener('change', updateSectionVisibility);
    });
  }

  let draggedItem = null;
  orderList.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('role-order-item')) {
      draggedItem = e.target;
      e.target.style.opacity = '0.5';
    }
  });

  orderList.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('role-order-item')) {
      e.target.style.opacity = '1';
      draggedItem = null;
      updateOrderIndices(orderList);
    }
  });

  orderList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(orderList, e.clientY);
    if (draggedItem) {
      if (afterElement == null) {
        orderList.appendChild(draggedItem);
      } else {
        orderList.insertBefore(draggedItem, afterElement);
      }
    }
  });

  updateSectionVisibility();

  if (focusOrder && currentContextMode === 'full') {
    setTimeout(() => {
      if (orderSection && orderSection.style.display !== 'none') {
        orderSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  document.getElementById('cancelModeBtn').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  document.getElementById('saveModeBtn').addEventListener('click', async () => {
    const items = orderList.querySelectorAll('.role-order-item');
    const newOrder = Array.from(items).map(item => item.getAttribute('data-role-id'));

    const updates = {};

    if (currentContextMode === 'full') {
      const selectedSendMode = modal.querySelector('input[name="sendMode"]:checked').value;
      updates.sendMode = selectedSendMode;
      if (selectedSendMode === 'sequential') {
        updates.roleOrder = newOrder;
      } else {
        updates.roleOrder = null;
      }
    } else {
      updates.sendMode = 'parallel';
    }

    try {
      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        render();
        if (currentContextMode === 'full') {
          console.log('[Chat] 发送模式已更新');
          console.log('[Chat] 角色顺序已更新:', newOrder);
        }
      }

      document.body.removeChild(modal);
    } catch (error) {
      console.error('[Chat] 更新失败:', error);
      showError('更新失败: ' + error.message);
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.role-order-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateOrderIndices(container) {
  const items = container.querySelectorAll('.role-order-item');
  items.forEach((item, index) => {
    const indexEl = item.querySelector('.role-order-index');
    if (indexEl) {
      indexEl.textContent = index + 1;
    }
  });
}

function addTempMessage(content, isUser) {
  const tempDiv = document.createElement('div');
  tempDiv.className = `message ${isUser ? 'user-message' : 'ai-message'} temp-message`;
  tempDiv.innerHTML = `
    <div class="message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}">${isUser ? '我' : 'AI'}</div>
    <div class="message-content">
      <div class="message-text">${escapeHtml(content)}</div>
      <div class="message-time">正在发送...</div>
    </div>
  `;
  elements.messagesContainer.appendChild(tempDiv);
  scrollToBottom();
}

// 工具函数
async function getConversation(id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('获取会话超时')), 30000);
    chrome.runtime.sendMessage({ action: 'getConversation', conversationId: id }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function getRoles() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('获取角色超时')), 30000);
    chrome.runtime.sendMessage({ action: 'getRoles' }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function sendMessageToBackend(conversationId, content) {
  console.log('[Chat] ========== 发送消息到Background ==========');
  console.log('[Chat] conversationId:', conversationId);
  console.log('[Chat] content:', content);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('[Chat] ❌ 发送消息超时（300秒）');
      reject(new Error('发送消息超时（300秒）'));
    }, 300000);
    
    console.log('[Chat] 发送chrome.runtime.sendMessage...');
    chrome.runtime.sendMessage({
      action: 'addMessage',
      conversationId,
      content
    }, (response) => {
      console.log('[Chat] 收到Background响应:', response);
      clearTimeout(timeout);
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && !response.error) {
        resolve(response);
      } else {
        reject(new Error(response?.error || '发送失败'));
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(content) {
  if (!content) return '';

  // 先处理代码块，避免内部被处理
  const codeBlocks = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let contentWithoutCode = content.replace(codeBlockRegex, (match, lang, code) => {
    codeBlocks.push({ lang, code });
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // 处理表格
  const tableRegex = /\n(\|.+\|)\n(\|[\s\-:|]+\|)\n((?:\|.+\|\n?)*)/g;
  contentWithoutCode = contentWithoutCode.replace(tableRegex, (match, headerRow, separatorRow, bodyRows) => {
    const headers = headerRow.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    const rows = bodyRows.trim().split('\n').map(row => 
      row.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
    );
    
    let table = '<table><thead><tr>';
    headers.forEach(header => {
      table += `<th>${escapeHtml(header)}</th>`;
    });
    table += '</tr></thead><tbody>';
    
    rows.forEach(row => {
      table += '<tr>';
      row.forEach(cell => {
        table += `<td>${escapeHtml(cell)}</td>`;
      });
      table += '</tr>';
    });
    
    table += '</tbody></table>';
    return table;
  });

  // 处理标题
  contentWithoutCode = contentWithoutCode
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // 处理粗体、斜体
  contentWithoutCode = contentWithoutCode
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 处理列表
  contentWithoutCode = contentWithoutCode
    .replace(/^\d+\.\s+(.*$)/gm, '<li class="ol-item">$1</li>')
    .replace(/^[-\*]\s+(.*$)/gm, '<li class="ul-item">$1</li>');

  // 处理换行（非代码块区域，且不在表格内）
  contentWithoutCode = contentWithoutCode.replace(/\n(?![<|])/g, '<br>');

  // 恢复代码块
  contentWithoutCode = contentWithoutCode.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
    const { lang, code } = codeBlocks[parseInt(index)];
    return `<pre data-lang="${escapeHtml(lang)}"><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
  });

  return contentWithoutCode;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getProviderDisplayName(provider) {
  const providerConfig = PROVIDERS[provider];
  return providerConfig ? providerConfig.name : provider;
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function showError(message) {
  elements.messagesContainer.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

function showSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  elements.messagesContainer.appendChild(successDiv);
  setTimeout(() => successDiv.remove(), 3000);
}

const availableCommands = [
  { name: '/clear', description: '清除所有会话内容和重置角色会话URL' },
  { name: '/mode', description: '切换上下文模式和发送模式，调整角色顺序' }
];

function getFilteredCommands(filter) {
  if (!filter) {
    return availableCommands;
  }
  return availableCommands.filter(cmd => cmd.name.toLowerCase().includes(filter));
}

function showCommandSuggestions(filter = '') {
  hideCommandSuggestions();

  const filteredCommands = getFilteredCommands(filter);

  if (filteredCommands.length === 0) {
    return;
  }

  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'command-suggestions';
  suggestionsDiv.id = 'commandSuggestions';
  suggestionsDiv.dataset.candidateIndex = '0';

  filteredCommands.forEach((cmd, index) => {
    const item = document.createElement('div');
    item.className = 'command-suggestion-item' + (index === 0 ? ' candidate' : '');
    item.innerHTML = `
      <div class="command-name">${escapeHtml(cmd.name)}</div>
      <div class="command-desc">${escapeHtml(cmd.description)}</div>
    `;
    item.addEventListener('click', () => {
      elements.messageInput.value = cmd.name + ' ';
      hideCommandSuggestions();
      elements.messageInput.focus();
    });
    suggestionsDiv.appendChild(item);
  });

  const inputContainer = elements.messageInput.parentElement;
  inputContainer.style.position = 'relative';
  inputContainer.appendChild(suggestionsDiv);
}

function selectCandidateCommand() {
  const suggestionsDiv = document.getElementById('commandSuggestions');
  if (!suggestionsDiv) return false;

  const candidateItem = suggestionsDiv.querySelector('.command-suggestion-item.candidate');
  if (!candidateItem) return false;

  const commandName = candidateItem.querySelector('.command-name').textContent;
  elements.messageInput.value = commandName + ' ';
  hideCommandSuggestions();
  elements.messageInput.focus();
  return true;
}

function hideCommandSuggestions() {
  const existingSuggestions = document.getElementById('commandSuggestions');
  if (existingSuggestions) {
    existingSuggestions.remove();
  }
}

// ==================== 平台面板管理 ====================

function initPlatformPanel() {
  if (!state.conversation || !state.conversation.roleIds) {
    console.log('[PlatformPanel] 没有角色，跳过初始化');
    return;
  }

  console.log('[PlatformPanel] 初始化平台面板');
  createPlatformWindows();
  
  // 默认收起平台面板
  if (elements.platformPanel && !elements.platformPanel.classList.contains('collapsed')) {
    elements.platformPanel.classList.add('collapsed');
  }
}

function createPlatformWindows() {
  if (!elements.platformWindows) return;

  elements.platformWindows.innerHTML = '';

  const roleIds = state.conversation.roleIds || [];
  if (roleIds.length === 0) {
    elements.platformWindows.innerHTML = '<div class="platform-empty">平台窗口将在此显示</div>';
    return;
  }

  roleIds.forEach(roleId => {
    const role = state.roles.find(r => r.id === roleId);
    if (role) {
      const windowElement = createPlatformWindow(role);
      elements.platformWindows.appendChild(windowElement);
    }
  });

  console.log(`[PlatformPanel] 创建了 ${elements.platformWindows.children.length} 个平台窗口`);
}

function createPlatformWindow(role) {
  const provider = PROVIDERS[role.provider];
  if (!provider) {
    console.warn(`[PlatformPanel] 未找到角色 ${role.name} 的提供商配置`);
    return null;
  }

  const windowId = `platform-window-${role.id}`;
  const windowElement = document.createElement('div');
  windowElement.className = 'platform-window collapsed-height';
  windowElement.id = windowId;
  windowElement.dataset.roleId = role.id;
  windowElement.dataset.provider = role.provider;

  const roleMessages = getRoleMessages(role.id);
  console.log(`[PlatformPanel] 创建角色 ${role.name} 的窗口，消息数量:`, roleMessages.length);
  if (roleMessages.length > 0) {
    console.log(`[PlatformPanel] 消息数据:`, roleMessages);
  }

  windowElement.innerHTML = `
    <div class="platform-window-header" title="点击展开/收起">
      <div class="platform-window-info">
        <div class="platform-window-indicator" style="background: ${provider.color};"></div>
        <div class="platform-window-name">${escapeHtml(role.name)}</div>
        <div class="platform-window-provider">${escapeHtml(provider.name)}</div>
      </div>
      <div class="platform-window-actions">
        <button class="platform-window-btn open-tab" title="在标签页中打开" data-action="openTab">🔗</button>
      </div>
    </div>
    <div class="platform-window-content">
      <div class="platform-message-list">
        ${roleMessages.length > 0 ? roleMessages.map(msg => createMessageHTML(msg, role)).join('') : `
          <div class="platform-conversation-empty">
            <div class="platform-empty-icon">💬</div>
            <div class="platform-empty-text">暂无消息</div>
            <div class="platform-empty-hint">发送消息后会在此显示对话历史</div>
          </div>
        `}
      </div>
    </div>
  `;

  const header = windowElement.querySelector('.platform-window-header');
  if (header) {
    header.addEventListener('click', () => togglePlatformWindowHeight(windowId));
  }

  const openTabBtn = windowElement.querySelector('[data-action="openTab"]');
  if (openTabBtn) {
    openTabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlatformConversation(role);
    });
  }

  const messageList = windowElement.querySelector('.platform-message-list');
  if (messageList) {
    messageList.addEventListener('click', handleMessageListClick);
  }

  return windowElement;
}

function getRoleMessages(roleId) {
  if (!state.conversation.messages || state.conversation.messages.length === 0) {
    return [];
  }

  return state.conversation.messages.filter(msg => {
    // 包含用户消息和该角色的AI回复
    return msg.isUser || msg.roleId === roleId;
  });
}

function createMessageHTML(message, role) {
  const provider = PROVIDERS[role.provider];
  const isUser = message.isUser;
  const messageId = message.id;
  const uniqueId = `${role.id}-${messageId}`;

  return `
    <div class="platform-message ${isUser ? 'user-message' : 'ai-message'} collapsed" data-message-id="${messageId}" data-role-id="${role.id}" data-unique-id="${uniqueId}">
      <div class="platform-message-header" title="点击展开/收起">
        <div class="platform-message-avatar" style="background: ${isUser ? 'var(--primary)' : provider.color}">
          ${isUser ? '我' : escapeHtml(role.name.charAt(0))}
        </div>
        <div class="platform-message-time">${formatTime(message.timestamp)}</div>
        <div class="platform-message-hint">▼</div>
      </div>
      <div class="platform-message-content" id="msg-content-${uniqueId}">
        ${renderMessageContent(message.content)}
      </div>
      <div class="platform-message-expand-btn" id="msg-expand-${uniqueId}">
        展开 ↓
      </div>
    </div>
  `;
}

function renderMessageContent(content) {
  if (!content || content.trim() === '') {
    console.warn('[renderMessageContent] 内容为空');
    return '<span style="color: var(--text-tertiary); font-style: italic;">(空消息)</span>';
  }

  console.log('[renderMessageContent] 原始内容:', content.substring(0, 50), '长度:', content.length);

  if (typeof marked !== 'undefined' && marked.parse) {
    try {
      const result = marked.parse(content);
      console.log('[renderMessageContent] Markdown渲染成功，结果长度:', result.length);
      if (!result || result.trim() === '') {
        console.warn('[renderMessageContent] Markdown渲染结果为空，使用纯文本');
        return escapeHtml(content);
      }
      return result;
    } catch (e) {
      console.error('[renderMessageContent] Markdown parse error:', e);
      return escapeHtml(content);
    }
  }

  console.log('[renderMessageContent] marked不可用，使用纯文本');
  return escapeHtml(content);
}

function toggleMessageExpand(messageId, roleId) {
  const messageEl = document.querySelector(`.platform-message[data-message-id="${messageId}"][data-role-id="${roleId}"]`);
  if (!messageEl) {
    console.warn('Message element not found:', messageId, 'roleId:', roleId);
    return;
  }

  const expandBtn = messageEl.querySelector('.platform-message-expand-btn');
  const isCollapsed = messageEl.classList.contains('collapsed');

  if (isCollapsed) {
    messageEl.classList.remove('collapsed');
    messageEl.classList.add('expanded');
    if (expandBtn) expandBtn.textContent = '收起 ↑';
    console.log('Message expanded:', messageId, 'roleId:', roleId);
  } else {
    messageEl.classList.remove('expanded');
    messageEl.classList.add('collapsed');
    if (expandBtn) expandBtn.textContent = '展开 ↓';
    console.log('Message collapsed:', messageId, 'roleId:', roleId);
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function togglePlatformWindowHeight(windowId) {
  const windowElement = document.getElementById(windowId);
  if (!windowElement) {
    console.warn('[togglePlatformWindowHeight] 窗口不存在:', windowId);
    return;
  }

  const content = windowElement.querySelector('.platform-window-content');
  if (!content) {
    console.warn('[togglePlatformWindowHeight] 内容区不存在');
    return;
  }

  const isCollapsed = windowElement.classList.contains('collapsed-height');

  if (isCollapsed) {
    // 展开
    windowElement.classList.remove('collapsed-height');
    windowElement.classList.add('expanded-height');
    // 移除内联样式，让CSS控制
    content.style.maxHeight = '';
  } else {
    // 收缩
    windowElement.classList.remove('expanded-height');
    windowElement.classList.add('collapsed-height');
    content.style.maxHeight = '0';
  }

  console.log(`[PlatformPanel] 窗口 ${windowId} ${isCollapsed ? '展开' : '收缩'}`);
}

async function openPlatformConversation(role) {
  console.log(`[PlatformPanel] 打开角色 ${role.name} 的平台会话`);
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'openPlatformConversation',
      conversationId: conversationId,
      roleId: role.id,
      provider: role.provider
    });
    console.log(`[PlatformPanel] 打开平台会话成功:`, result);
  } catch (error) {
    console.error(`[PlatformPanel] 打开平台会话失败:`, error);
    alert('打开失败：' + error.message);
  }
}

async function refreshRoleConversation(roleId) {
  console.log(`[PlatformPanel] 刷新角色 ${roleId} 的会话列表`);
  createPlatformWindows();
}

function togglePlatformPanel() {
  if (!elements.platformPanel) return;

  const isCollapsed = elements.platformPanel.classList.contains('collapsed');
  elements.platformPanel.classList.toggle('collapsed');

  const toggleIcon = document.querySelector('.toggle-icon');
  if (toggleIcon) {
    toggleIcon.textContent = isCollapsed ? '◀' : '▶';
  }

  console.log(`[PlatformPanel] 面板${isCollapsed ? '展开' : '收起'}`);
}

// ==================== 会话设置 ====================

function enableTitleEditing() {
  const currentName = state.conversation.name || '';

  elements.chatTitle.classList.add('editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'title-edit-input';
  input.value = currentName;
  input.placeholder = '输入会话名称';

  elements.chatTitle.innerHTML = '';
  elements.chatTitle.appendChild(input);
  input.focus();
  input.select();

  const saveTitle = async () => {
    const newName = input.value.trim();
    if (!newName) {
      input.focus();
      return;
    }

    try {
      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates: { name: newName }
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        elements.chatTitle.classList.remove('editing');
        elements.chatTitle.textContent = newName;
        console.log('[Chat] 会话名称已更新');
      }
    } catch (error) {
      console.error('[Chat] 更新会话名称失败:', error);
    }
  };

  const cancelEdit = () => {
    elements.chatTitle.classList.remove('editing');
    elements.chatTitle.textContent = currentName;
  };

  input.addEventListener('blur', () => {
    if (input.value.trim() !== currentName) {
      saveTitle();
    } else {
      cancelEdit();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });

  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function showAddRoleModal() {
  const allRoles = state.roles || [];
  const currentRoleIds = state.conversation.roleIds || [];

  const availableRoles = allRoles.filter(role => !currentRoleIds.includes(role.id));

  if (availableRoles.length === 0) {
    alert('没有可添加的角色');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h2>添加角色</h2>
      <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 13px;">
        选择要添加到会话的角色
      </p>

      <div class="role-selection-list">
        ${availableRoles.map(role => {
          const provider = PROVIDERS[role.provider];
          const color = provider ? provider.color : '#666';
          return `
            <label class="role-selection-item">
              <input type="checkbox" value="${role.id}" />
              <div class="role-selection-avatar" style="background: linear-gradient(135deg, ${color}, ${color}cc);">
                ${escapeHtml(role.name.charAt(0))}
              </div>
              <div class="role-selection-info">
                <div class="role-selection-name">${escapeHtml(role.name)}</div>
                <div class="role-selection-provider">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:4px;"></span>
                  ${getProviderDisplayName(role.provider)}
                </div>
              </div>
            </label>
          `;
        }).join('')}
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelAddBtn">取消</button>
        <button class="btn btn-primary" id="saveAddBtn">添加</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cancelBtn = document.getElementById('cancelAddBtn');
  const saveBtn = document.getElementById('saveAddBtn');

  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  saveBtn.addEventListener('click', async () => {
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
    const newRoleIds = Array.from(checkboxes).map(cb => cb.value);

    if (newRoleIds.length === 0) {
      alert('请至少选择一个角色');
      return;
    }

    try {
      const updatedRoleIds = [...currentRoleIds, ...newRoleIds];
      const updates = { roleIds: updatedRoleIds };

      if (state.conversation.sendMode === 'sequential') {
        updates.roleOrder = updatedRoleIds;
      }

      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        render();
        initPlatformPanel();
        console.log('[Chat] 角色已添加');
      }

      document.body.removeChild(modal);
    } catch (error) {
      console.error('[Chat] 添加角色失败:', error);
      alert('添加失败: ' + error.message);
    }
  });
}

async function removeRoleFromConversation(roleId) {
  if (!confirm('确定要移除该角色吗？')) {
    return;
  }

  try {
    const currentRoleIds = state.conversation.roleIds || [];

    if (currentRoleIds.length <= 1) {
      alert('至少需要保留一个角色');
      return;
    }

    const updatedRoleIds = currentRoleIds.filter(id => id !== roleId);
    const updates = { roleIds: updatedRoleIds };

    if (state.conversation.sendMode === 'sequential') {
      updates.roleOrder = updatedRoleIds;
    }

    const updatedConversation = await chrome.runtime.sendMessage({
      action: 'updateConversation',
      conversationId,
      updates
    });

    if (updatedConversation) {
      state.conversation = updatedConversation;
      render();
      initPlatformPanel();
      console.log('[Chat] 角色已移除');
    }
  } catch (error) {
    console.error('[Chat] 移除角色失败:', error);
    alert('移除失败: ' + error.message);
  }
}

// 启动
init();
