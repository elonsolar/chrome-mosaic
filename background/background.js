importScripts('../config/providers.config.js');
importScripts('./managers/prompt-manager.js');
importScripts('./managers/prompt-folder-manager.js');
importScripts('./managers/model-manager.js');
importScripts('./managers/flow-manager.js');
importScripts('./managers/flow-executor.js');

/**
 * 检测浏览器信息
 */
async function getBrowserInfo() {
  try {
    // 获取浏览器信息
    const browserInfo = await chrome.runtime.getBrowserInfo ?
      await chrome.runtime.getBrowserInfo() : null;

    if (browserInfo) {
      console.log('[Background] 浏览器信息:', browserInfo);

      // Edge (Chromium-based)
      if (browserInfo.name === 'Microsoft Edge' || browserInfo.name.includes('Edg')) {
        return {
          name: 'Edge',
          isEdge: true,
          isChrome: false
        };
      }

      // Chrome
      if (browserInfo.name === 'Chrome') {
        return {
          name: 'Chrome',
          isEdge: false,
          isChrome: true
        };
      }
    }

    // 回退到 User-Agent 检测
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) {
      return {
        name: 'Edge',
        isEdge: true,
        isChrome: false
      };
    } else if (ua.includes('Chrome/')) {
      return {
        name: 'Chrome',
        isEdge: false,
        isChrome: true
      };
    }

    // 默认当作 Chrome 处理
    return {
      name: 'Unknown',
      isEdge: false,
      isChrome: true
    };
  } catch (error) {
    console.log('[Background] 无法检测浏览器类型，默认当作 Chrome:', error.message);
    return {
      name: 'Unknown',
      isEdge: false,
      isChrome: true
    };
  }
}

/**
 * 检测浏览器并返回适当的激活延迟
 * Edge 需要更长的激活时间来触发 DOM 更新
 */
async function getActivationDelay(platform = null) {
  const browserInfo = await getBrowserInfo();

  const delays = {
    'kimi': 300,
    'deepseek': 800,
    'doubao': 1500,
    'qianwen': 1500
  };

  if (browserInfo.isEdge) {
    return platform ? (delays[platform] || 1500) : 1500;
  } else if (browserInfo.isChrome) {
    return platform ? (delays[platform] || 1000) : 1000;
  }

  return platform ? (delays[platform] || 1000) : 1000;
}

class WebSocketManager {
  constructor(tabManagerRef, pendingResponsesRef) {
    this.ws = null;
    this.connected = false;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity;
    this.baseReconnectDelay = 2000;
    this.maxReconnectDelay = 30000;
    this.currentReconnectDelay = this.baseReconnectDelay;
    this.messageQueue = [];
    this.tabManager = tabManagerRef;
    this.pendingResponses = pendingResponsesRef;
    this.wsRequestQueue = new Map();
    this.reconnectTimeoutId = null;
    this.heartbeatIntervalId = null;
    this.heartbeatInterval = 30000;
  }

  async connect(url) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WS] 已经连接，无需重复连接');
      return;
    }

    try {
      console.log('[WS] 正在连接到:', url);
      this.updateStatus(false, 'connecting');

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] 连接成功');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.currentReconnectDelay = this.baseReconnectDelay;
        this.updateStatus(true, 'connected');
        
        // 发送队列中的消息
        this.flushMessageQueue();
        
        // 发送连接确认
        this.send({
          type: 'connected',
          data: { message: '浏览器插件已连接' },
          timestamp: Date.now()
        });

        // 启动心跳
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WS] 收到消息:', message.type);
          
          // 重置心跳计时器
          if (this.heartbeatIntervalId) {
            this.resetHeartbeat();
          }
          
          this.handleMessage(message);
        } catch (error) {
          console.error('[WS] 解析消息失败:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WS] 连接关闭, code:', event.code, 'reason:', event.reason);
        this.connected = false;
        this.updateStatus(false, 'disconnected');
        
        // 停止心跳
        this.stopHeartbeat();

        // 尝试自动重连
        if (this.shouldReconnect) {
          this.scheduleReconnect(url);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] 连接错误:', error);
        this.updateStatus(false, 'error');
      };

    } catch (error) {
      console.error('[WS] 连接失败:', error);
      this.updateStatus(false, 'error');
      
      // 连接失败也尝试重连
      if (this.shouldReconnect) {
        this.scheduleReconnect(url);
      }
    }
  }

  disconnect() {
    console.log('[WS] 主动断开连接，停止自动重连');
    this.shouldReconnect = false;
    
    // 清除重连定时器
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    
    // 停止心跳
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.updateStatus(false, 'disconnected');
    }
  }

  scheduleReconnect(url) {
    if (this.reconnectTimeoutId) {
      return; // 已经有重连计划
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    this.currentReconnectDelay = delay;

    console.log(`[WS] ${delay / 1000}秒后尝试重连 (${this.reconnectAttempts}次)...`);
    this.updateStatus(false, 'reconnecting', { 
      attempt: this.reconnectAttempts,
      delay: delay 
    });

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.reconnect(url);
    }, delay);
  }

  reconnect(url) {
    this.connect(url);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatIntervalId = setInterval(() => {
      if (this.connected && this.ws) {
        this.send({ type: 'heartbeat', timestamp: Date.now() });
      }
    }, this.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  resetHeartbeat() {
    this.stopHeartbeat();
    this.startHeartbeat();
  }

  send(message) {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('[WS] 发送消息失败:', error);
        return false;
      }
    } else {
      console.log('[WS] 未连接，消息加入队列');
      this.messageQueue.push(message);
      return false;
    }
  }

  flushMessageQueue() {
    console.log(`[WS] 发送队列中的 ${this.messageQueue.length} 条消息`);
    while (this.messageQueue.length > 0 && this.connected) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'chat_request':
        this.handleChatRequest(message);
        break;

      case 'heartbeat':
        // 心跳消息，不需要处理
        break;

      default:
        console.log('[WS] 未知消息类型:', message.type);
    }
  }

  async handleChatRequest(message) {
    const { requestId, model, messages, tools } = message;

    try {
      console.log('[WS] 处理聊天请求:', requestId, '会话名称:', model);

      const userMessage = messages[messages.length - 1];
      if (!userMessage || (userMessage.role !== 'user' && userMessage.role!=='tool')) {
        throw new Error('无效的消息格式：缺少用户消息');
      }

      const conversations = await StorageManager.getConversations();
      let conversation = conversations.find(c => c.name === model);

      if (!conversation) {
        throw new Error(`会话不存在: ${model}。请先在插件中创建名为 "${model}" 的会话。`);
      }

      console.log('[WS] 找到会话:', conversation.id, '角色:', conversation.roleIds);

      if (!conversation.roleIds || conversation.roleIds.length === 0) {
        throw new Error(`会话 "${model}" 没有配置角色。请在插件中为该会话添加角色。`);
      }

      const conversationId = conversation.id;

      console.log('[WS] 将请求加入 wsRequestQueue, conversationId:', conversationId);
      console.log('[WS] 当前队列大小:', this.wsRequestQueue.size);

      const timeout = setTimeout(() => {
        console.error('[WS] TIMEOUT 300秒超时, conversationId:', conversationId);
        console.error('[WS] TIMEOUT 队列中的会话:', Array.from(this.wsRequestQueue.keys()));
        this.wsRequestQueue.delete(conversationId);
        stopPolling(conversationId);

        this.send({
          type: 'ai_response',
          requestId: requestId,
          content: `错误: 等待 AI 响应超时（300秒）`,
          error: true,
          timestamp: Date.now()
        });
      }, 300000);

      this.wsRequestQueue.set(conversationId, {
        requestId,
        timeout,
        conversationName: conversation.name
      });

      console.log('[WS] 发送消息到会话');
      await aiMessageManager.processUserMessage(
        conversationId,
        userMessage.content
      );

      console.log('[WS] 请求已发送，等待 aiResponse 事件触发');

    } catch (error) {
      console.error('[WS] 处理聊天请求失败:', error);

      this.send({
        type: 'ai_response',
        requestId: requestId,
        content: `错误: ${error.message}`,
        error: true,
        timestamp: Date.now()
      });
    }
  }

  async combineResponses(responses) {
    if (!responses || responses.length === 0) {
      return '';
    }

    if (responses.length === 1) {
      return responses[0].content;
    }

    const roles = await StorageManager.getRoles();
    return responses.map((r, index) => {
      const role = roles.find(role => role.id === r.roleId);
      const roleName = role ? role.name : `角色 ${index + 1}`;
      return `[${roleName}] ${r.content}`;
    }).join('\n\n');
  }

  updateStatus(connected, status) {
    // 通知所有监听器状态变化
    chrome.runtime.sendMessage({
      type: 'wsStatusChanged',
      connected: connected,
      status: status
    }).catch(() => {
      // 忽略错误（可能没有监听器）
    });
  }

  getStatus() {
    return {
      connected: this.connected,
      readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED,
      shouldReconnect: this.shouldReconnect,
      reconnectAttempts: this.reconnectAttempts,
      reconnectDelay: this.currentReconnectDelay,
      isReconnecting: this.reconnectTimeoutId !== null
    };
  }
}

class StorageManager {
  static async getConversations() {
    const result = await chrome.storage.local.get('conversations');
    return result.conversations || [];
  }

  static async saveConversations(conversations) {
    await chrome.storage.local.set({ conversations });
  }

  static async getRoles() {
    const result = await chrome.storage.local.get('roles');
    return result.roles || [];
  }

  static async saveRoles(roles) {
    await chrome.storage.local.set({ roles });
  }

  static async getSettings() {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {
      wsUrl: 'ws://localhost:8080',
      wsEnabled: false,
      contextMode: 'self',
      floatWindow: true
    };
  }

  static async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
}

class TabManager {
  constructor() {
  }

  async openPlatformTab(url) {
    const existingTab = await this.findTabByUrl(url);
    if (existingTab) {
      console.log(`[TabManager] 复用已存在的标签页, URL: ${existingTab.url}`);
      return existingTab;
    }

    console.log(`[TabManager] 创建新标签页 -> ${url}`);
    const tab = await chrome.tabs.create({
      url,
      active: false
    });

    await this.waitForTabReady(tab.id);

    await chrome.tabs.update(tab.id, { active: false });

    return tab;
  }

  async findTabByUrl(targetUrl) {
    const normalizedUrl = targetUrl.replace(/\/$/, '');
    const allTabs = await chrome.tabs.query({});
    return allTabs.find(tab => {
      if (!tab.url || tab.pendingUrl) return false;
      return tab.url.replace(/\/$/, '') === normalizedUrl;
    }) || null;
  }

  async waitForTabReady(tabId, timeout = 30000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkReady = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);

          if (tab.status === 'complete') {
            resolve(tab);
            return;
          }

          if (Date.now() - startTime > timeout) {
            reject(new Error(`标签页 ${tabId} 加载超时`));
            return;
          }

          setTimeout(checkReady, 500);
        } catch (error) {
          reject(error);
        }
      };

      checkReady();
    });
  }

  async sendToPlatform(platform, data = {}, targetUrl = null, conversation = null, roleId = null) {
    const provider = PROVIDERS[platform];
    if (!provider) {
      throw new Error(`不支持的平台: ${platform}`);
    }
    const url = targetUrl || provider.baseUrl;
    const tab = await this.openPlatformTab(url);

    if (conversation && roleId) {
      if (!conversation.roleTabIds) conversation.roleTabIds = {};
      conversation.roleTabIds[roleId] = tab.id;

      const convId = data.conversationId;
      if (convId) {
        const convs = await StorageManager.getConversations();
        const conv = convs.find(c => c.id === convId);
        if (conv) {
          if (!conv.roleTabIds) conv.roleTabIds = {};
          conv.roleTabIds[roleId] = tab.id;
          await StorageManager.saveConversations(convs);
        }
      }
    }

    try {
      await chrome.tabs.update(tab.id, { active: false });
    } catch (e) {}

    await this.sleep(3000);

    let pingSuccess = false;
    for (let i = 0; i < 5; i++) {
      try {
        const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
        if (pingResponse && pingResponse.status === 'ok') {
          pingSuccess = true;
          break;
        }
      } catch (pingError) {
        await this.sleep(2000);
      }
    }

    if (!pingSuccess) {
      throw new Error('Content Script未就绪，请刷新AI网站页面');
    }

    await this.sleep(2000);

    const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${platform}`;
    const conversationId = data.conversationId || null;

    const responsePromise = new Promise((resolve, reject) => {
      pendingResponses.set(messageId, { resolve, reject, conversationId });

      setTimeout(() => {
        if (pendingResponses.has(messageId)) {
          pendingResponses.delete(messageId);
          reject(new Error('等待AI回复超时（300秒）'));
        }
      }, 300000);
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'sendMessage',
        ...data,
        messageId,
        conversationId
      });

      try {
        await chrome.tabs.update(tab.id, { active: false });
      } catch (e) {}
    } catch (sendError) {
      pendingResponses.delete(messageId);
      throw sendError;
    }

    return await responsePromise;
  }

  async sendMessage(platform, content, targetUrl = null, conversationId = null, conversation = null, roleId = null) {
    const response = await this.sendToPlatform(platform, { content, conversationId }, targetUrl, conversation, roleId);
    return {
      success: true,
      content: response.content || response,
      conversationUrl: response.conversationUrl
    };
  }

  async activatePlatformTab(platform, targetUrl = null) {
    const provider = PROVIDERS[platform];
    if (!provider) return false;

    const url = targetUrl || provider.baseUrl;
    const existingTab = await this.findTabByUrl(url);

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return true;
    }

    const tab = await this.openPlatformTab(url);
    await chrome.tabs.update(tab.id, { active: true });
    return true;
  }

  async openPlatformConversation(platform, targetUrl = null) {
    const provider = PROVIDERS[platform];
    if (!provider) return { success: false, error: `不支持的平台: ${platform}` };

    const url = targetUrl || provider.baseUrl;
    const existingTab = await this.findTabByUrl(url);

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return { success: true, tabId: existingTab.id };
    }

    const tab = await this.openPlatformTab(url);
    await chrome.tabs.update(tab.id, { active: true });
    return { success: true, tabId: tab.id };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ConversationManager {
  constructor(tabManager) {
    this.tabManager = tabManager;
    this.messageQueues = new Map();
  }

  async createConversation(name, modelIds, contextMode, promptId = null, roleSettings = {}) {
    const conversations = await StorageManager.getConversations();

    // 支持新的modelIds和旧的roleIds
    const finalModelIds = modelIds || [];

    const newConversation = {
      id: this.generateId(),
      name: name || `会话 ${conversations.length + 1}`,
      modelIds: finalModelIds,          // 新字段
      roleIds: finalModelIds,            // 兼容旧字段
      promptId: promptId,                // 新字段：全局提示词
      contextMode: contextMode || 'self',
      sendMode: 'parallel',
      roleSettings: roleSettings || {},
      roleUrls: {},
      roleTabIds: {},
      roleLastMessageIds: {},
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    conversations.push(newConversation);
    await StorageManager.saveConversations(conversations);

    return newConversation;
  }

  async deleteConversation(conversationId) {
    let conversations = await StorageManager.getConversations();
    conversations = conversations.filter(c => c.id !== conversationId);
    await StorageManager.saveConversations(conversations);
  }

  async updateConversation(conversationId, updates) {
    const conversations = await StorageManager.getConversations();
    const conversation = conversations.find(c => c.id === conversationId);

    if (conversation) {
      if (updates.contextMode && updates.contextMode !== conversation.contextMode) {
        throw new Error('会话模式不可修改');
      }
      Object.assign(conversation, updates, { updatedAt: Date.now() });
      await StorageManager.saveConversations(conversations);
      return conversation;
    }

    return null;
  }

  async clearConversationMessages(conversationId) {
    const conversations = await StorageManager.getConversations();
    const conversation = conversations.find(c => c.id === conversationId);

    if (conversation) {
      conversation.messages = [];
      conversation.roleUrls = {};
      conversation.roleTabIds = {};
      conversation.roleLastMessageIds = {};
      conversation.updatedAt = Date.now();
      await StorageManager.saveConversations(conversations);
      return conversation;
    }

    return null;
  }

  async addMessage(conversationId, roleId, content, isUser = false) {
    const queueKey = conversationId;

    if (!this.messageQueues.has(queueKey)) {
      this.messageQueues.set(queueKey, Promise.resolve());
    }

    const queue = this.messageQueues.get(queueKey);

    const newQueue = queue.then(async () => {
      const conversations = await StorageManager.getConversations();
      const conversation = conversations.find(c => c.id === conversationId);

      if (conversation) {
        const message = {
          id: this.generateId(),
          roleId,
          content,
          isUser,
          timestamp: Date.now()
        };

        conversation.messages.push(message);
        conversation.updatedAt = Date.now();

        await StorageManager.saveConversations(conversations);
        return message;
      }

      return null;
    });

    this.messageQueues.set(queueKey, newQueue);

    return newQueue;
  }

  async getConversation(conversationId) {
    const conversations = await StorageManager.getConversations();
    return conversations.find(c => c.id === conversationId) || null;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

class RoleManager {
  constructor(tabManager) {
    this.tabManager = tabManager;
  }

  async createRole(name, provider, model, systemPrompt) {
    const roles = await StorageManager.getRoles();

    const newRole = {
      id: this.generateId(),
      name,
      provider,
      model,
      systemPrompt,
      conversationUrl: null,
      createdAt: Date.now()
    };

    roles.push(newRole);
    await StorageManager.saveRoles(roles);

    return newRole;
  }

  async updateRole(roleId, updates) {
    const roles = await StorageManager.getRoles();
    const role = roles.find(r => r.id === roleId);

    if (role) {
      Object.assign(role, updates);
      await StorageManager.saveRoles(roles);
    }
  }

  async deleteRole(roleId) {
    let roles = await StorageManager.getRoles();
    roles = roles.filter(r => r.id !== roleId);
    await StorageManager.saveRoles(roles);
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

class AIMessageManager {
  constructor(tabManager, conversationManager) {
    this.tabManager = tabManager;
    this.conversationManager = conversationManager;
  }

  async processUserMessage(conversationId, userMessage) {
    let conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation || !conversation.roleIds || conversation.roleIds.length === 0) {
      throw new Error('会话没有关联的角色');
    }

    const settings = await StorageManager.getSettings();
    const contextMode = conversation.contextMode || settings.contextMode || 'self';
    const useFloatWindow = settings.floatWindow !== false;
    const sendMode = conversation.sendMode || 'parallel';

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '用户',
        content: userMessage,
        isUser: true,
        isError: false
      });
    }

    const roles = await StorageManager.getRoles();

    await this.conversationManager.addMessage(conversationId, null, userMessage, true);

    conversation = await this.conversationManager.getConversation(conversationId);

    (async () => {
      try {
        console.log('[AIMessageManager] IIFE 开始发送消息, 会话:', conversationId, '角色数:', conversation.roleIds.length);
        if (sendMode === 'sequential') {
          await this.sendToRolesSequential(conversation, roles, contextMode, useFloatWindow, conversationId);
        } else if (sendMode === 'random') {
          await this.sendToRolesRandom(conversation, roles, contextMode, useFloatWindow, conversationId);
        } else {
          const sendPromises = conversation.roleIds.map(async (roleId) => {
            return await this.sendMessageToRole(roleId, roles, conversation, contextMode, useFloatWindow, conversationId);
          });
          await Promise.allSettled(sendPromises);
        }
        console.log('[AIMessageManager] IIFE 所有消息发送完成');
      } catch (error) {
        console.error('[AIMessageManager] 发送消息到角色时出错:', error);
      }
    })();

    await new Promise(resolve => setTimeout(resolve, 500));

    setTimeout(() => {
      console.log(`[AIMessageManager] 启动轮询监控: ${conversationId}`);
      startPolling(conversationId);
    }, 2500);

    return await this.conversationManager.getConversation(conversationId);
  }

  async sendMessageToRole(roleId, roles, conversation, contextMode, useFloatWindow, conversationId) {
    const role = roles.find(r => r.id === roleId);
    if (!role) return null;

    const roleSetting = conversation.roleSettings?.[roleId] || {};
    const nickname = roleSetting.nickname || role.name;
    const additionalPrompt = roleSetting.additionalPrompt || '';

    try {
      let messageToSend = '';

      if (contextMode === 'self') {
        const lastMessageId = conversation.roleLastMessageIds?.[roleId];
        const messagesToSend = this.getMessagesToSend(conversation, lastMessageId, false);

        if (messagesToSend.length === 0) {
          return null;
        }

        messageToSend = messagesToSend.map(msg => msg.content).join('\n\n');

        let fullPrompt = role.systemPrompt || '';
        if (additionalPrompt) {
          fullPrompt = fullPrompt ? `${fullPrompt}\n\n${additionalPrompt}` : additionalPrompt;
        }

        if (fullPrompt) {
          messageToSend = `${fullPrompt}\n\n${messageToSend}`;
        }

        messageToSend += '\n\n**严格遵守**：在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';
      } else {
        const lastMessageId = conversation.roleLastMessageIds?.[roleId];
        const messagesToSend = this.getMessagesToSend(conversation, lastMessageId, true);

        if (messagesToSend.length === 0) {
          return null;
        }

        const isFirstTime = !lastMessageId;
        const nicknameMap = {};
        roles.forEach(r => {
          const setting = conversation.roleSettings?.[r.id] || {};
          nicknameMap[r.id] = setting.nickname || r.name;
        });

        if (isFirstTime) {
          const nicknames = (conversation.roleIds || [])
            .map(id => nicknameMap[id])
            .filter(Boolean);
          messageToSend += `当前我们在一个会话里，会话里有成员 user、${nicknames.join('、')}\n`;
          messageToSend += `你的当前会话名称是：${nickname}\n`;

          let fullPrompt = role.systemPrompt || '';
          if (additionalPrompt) {
            fullPrompt = fullPrompt ? `${fullPrompt}\n\n${additionalPrompt}` : additionalPrompt;
          }

          if (fullPrompt) {
            messageToSend += `你的角色设定：${fullPrompt}\n`;
          }
          messageToSend += `\n请注意：你只能扮演${nickname}，不可以扮演其他角色。\n\n`;
          messageToSend += '下面是当前会话的历史内容：\n\n';
        }

        messagesToSend.forEach(msg => {
          if (msg.isUser) {
            messageToSend += `User: ${msg.content}\n\n`;
          } else {
            messageToSend += `${nicknameMap[msg.roleId] || 'Assistant'}: ${msg.content}\n\n`;
          }
        });

        messageToSend = messageToSend.trim() + '\n\n重要：请在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';
      }

      const conversationUrl = conversation.roleUrls?.[roleId];
      console.log(`[AIMessageManager] 开始发送消息到角色 ${role.name} (${role.provider}), 会话URL: ${conversationUrl}`);
      const response = await this.tabManager.sendMessage(role.provider, messageToSend, conversationUrl, conversationId, conversation, roleId);
      console.log(`[AIMessageManager] 角色 ${role.name} 响应: ${response?.success ? '成功' : '失败'}`);

      if (response && response.success) {
          let content = response.content || '';

          const endMarker = '[[<<>>]]';
          if (content.endsWith(endMarker)) {
            content = content.slice(0, -endMarker.length).trim();
          } else {
            console.warn(`[AIMessageManager] ${role.name} 的回复可能不完整，缺少结束标记`);
          }
          if (response.conversationUrl) {
            if (!conversation.roleUrls) {
              conversation.roleUrls = {};
            }

            if (conversation.roleUrls[roleId] !== response.conversationUrl) {
              conversation.roleUrls[roleId] = response.conversationUrl;
            }
          }

          const savedMessage = await this.conversationManager.addMessage(conversationId, roleId, content, false);

          if (savedMessage) {
            if (!conversation.roleLastMessageIds) {
              conversation.roleLastMessageIds = {};
            }
            conversation.roleLastMessageIds[roleId] = savedMessage.id;
          }

          await this.conversationManager.updateConversation(conversationId, {
            roleUrls: conversation.roleUrls,
            roleTabIds: conversation.roleTabIds,
            roleLastMessageIds: conversation.roleLastMessageIds
          });

          if (useFloatWindow) {
            await this.sendToFloatWindow('addMessage', {
              role: nickname,
              content: content,
              isUser: false,
              isError: false,
              provider: role.provider
            });
          }

          return true;
        } else {
          throw new Error('发送消息失败');
        }
    } catch (error) {
      console.error(`发送到 ${role.provider} 失败:`, error);
    }

    return false;
  }

  getMessagesToSend(conversation, lastMessageId, includeUserMessages = true) {
    if (!lastMessageId) {
      return includeUserMessages ? conversation.messages : conversation.messages.filter(m => m.isUser);
    }

    const lastMessageIndex = conversation.messages.findIndex(m => m.id === lastMessageId);

    if (lastMessageIndex >= 0) {
      const newMessages = conversation.messages.slice(lastMessageIndex + 1);
      return includeUserMessages ? newMessages : newMessages.filter(m => m.isUser);
    }

    return includeUserMessages ? conversation.messages : conversation.messages.filter(m => m.isUser);
  }

  async sendToRolesSequential(conversation, roles, contextMode, useFloatWindow, conversationId) {
    const roleOrder = conversation.roleOrder || conversation.roleIds;
    for (let i = 0; i < roleOrder.length; i++) {
      const roleId = roleOrder[i];
      await this.sendMessageToRole(roleId, roles, conversation, contextMode, useFloatWindow, conversationId);
      conversation = await this.conversationManager.getConversation(conversationId);
    }
  }

  async sendToRolesRandom(conversation, roles, contextMode, useFloatWindow, conversationId) {
    const shuffledRoleIds = [...conversation.roleIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffledRoleIds.length; i++) {
      const roleId = shuffledRoleIds[i];
      await this.sendMessageToRole(roleId, roles, conversation, contextMode, useFloatWindow, conversationId);
      conversation = await this.conversationManager.getConversation(conversationId);
    }
  }

  async sendToFloatWindow(action, data) {
    try {
      const tabs = await chrome.tabs.query({});

      for (const tab of tabs) {
        const isAIPlatform = tab.url && (
          tab.url.includes('deepseek.com') ||
          tab.url.includes('doubao.com') ||
          tab.url.includes('qianwen.com') ||
          tab.url.includes('moonshot.cn')
        );

        const isSpecialPage = tab.url && (
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:')
        );

        if (!isAIPlatform && !isSpecialPage && tab.url && tab.url.startsWith('http')) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              action,
              ...data
            });
            return;
          } catch (e) {
            continue;
          }
        }
      }
    } catch (error) {
      console.error('发送到浮动窗口失败:', error);
    }
  }

  async clearConversation(conversationId) {
    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

      // 先删除各个平台的会话
      const deletedConversations = [];
      if (conversation.roleUrls && Object.keys(conversation.roleUrls).length > 0) {
        const roles = await StorageManager.getRoles();
        console.log(`[AIMessageManager] 准备删除平台会话，共 ${Object.keys(conversation.roleUrls).length} 个`);

        for (const [roleId, conversationUrl] of Object.entries(conversation.roleUrls)) {
        const role = roles.find(r => r.id === roleId);
        if (!role || !conversationUrl) continue;

        try {
          console.log(`[AIMessageManager] 开始删除 ${role.provider} 平台的会话: ${conversationUrl}`);
          await this.deletePlatformConversation(role.provider, conversationUrl);
          deletedConversations.push({ provider: role.provider, url: conversationUrl });
          console.log(`[AIMessageManager] ✓ ${role.provider} 平台会话删除成功`);
        } catch (error) {
          console.error(`[AIMessageManager] ❌ ${role.provider} 平台会话删除失败:`, error.message);
        }
      }

      console.log(`[AIMessageManager] 平台会话删除完成，成功删除 ${deletedConversations.length} 个`);
    }

    // 然后清除本地数据
    const result = await this.conversationManager.clearConversationMessages(conversationId);
    return { ...result, deletedConversations };
  }

  async deletePlatformConversation(provider, conversationUrl) {
    try {
      const tab = await this.tabManager.openPlatformTab(conversationUrl);
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      let pingSuccess = false;
      for (let i = 0; i < 5; i++) {
        try {
          const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
          if (pingResponse && pingResponse.status === 'ok') {
            pingSuccess = true;
            break;
          }
        } catch (pingError) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!pingSuccess) {
        throw new Error('Content Script未就绪');
      }

      // 发送删除会话消息
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'deleteConversation',
        conversationUrl: conversationUrl
      });

      if (!response || !response.success) {
        throw new Error(response?.error || '删除失败');
      }

      console.log(`[AIMessageManager] ${provider} 平台会话删除成功`);
      return true;
    } catch (error) {
      console.error(`[AIMessageManager] 删除 ${provider} 平台会话失败:`, error);
      throw error;
    }
  }
}

let tabManager;
let conversationManager;
let roleManager;
let aiMessageManager;
const pendingResponses = new Map();
const pollingIntervals = new Map();
let wsManager = null;

// 新架构管理器
let promptManager;
let promptFolderManager;
let modelManager;

async function init() {
  tabManager = new TabManager();
  conversationManager = new ConversationManager(tabManager);
  roleManager = new RoleManager(tabManager);
  aiMessageManager = new AIMessageManager(tabManager, conversationManager);
  wsManager = new WebSocketManager(tabManager, pendingResponses);

  // 初始化新架构管理器
  promptManager = new PromptManager();
  promptFolderManager = new PromptFolderManager();
  modelManager = new ModelManager();
  flowManager = new FlowManager();
  flowExecutor = new FlowExecutor(tabManager, conversationManager);

  // 确保模型已导入
  const models = await modelManager.getModels();
  console.log('[Init] 已加载', models.length, '个模型');

  // 加载设置并连接 WebSocket
  const settings = await StorageManager.getSettings();
  if (settings.wsEnabled && settings.wsUrl) {
    wsManager.connect(settings.wsUrl);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'aiResponse') {
    const pending = pendingResponses.get(request.messageId);

    if (pending) {
      pendingResponses.delete(request.messageId);

      if (request.error) {
        pending.reject(new Error(request.error));
      } else {
        pending.resolve({
          content: request.content,
          conversationUrl: request.conversationUrl
        });
      }

      sendResponse({ status: 'received' });
    } else {
      sendResponse({ status: 'no_matching_promise' });
    }

    (async () => {
      try {
        const conversationId = request.conversationId;
        console.log('[WS] aiResponse 收到, conversationId:', conversationId);

        if (!conversationId) {
          console.warn('[WS] aiResponse 缺少 conversationId');
          return;
        }

        console.log('[WS] 等待 500ms 确保 addMessage 完成');
        await new Promise(resolve => setTimeout(resolve, 500));

        const conversation = await conversationManager.getConversation(conversationId);
        if (!conversation) {
          console.warn('[WS] aiResponse 会话不存在:', conversationId);
          return;
        }

        const wsRequest = wsManager?.wsRequestQueue.get(conversationId);
        if (!wsRequest) {
          console.log('[WS] aiResponse 没有对应的 WebSocket 请求, conversationId:', conversationId);
          console.log('[WS] wsRequestQueue 中的会话:', wsManager ? Array.from(wsManager.wsRequestQueue.keys()) : 'wsManager 不存在');
          return;
        }

        console.log('[WS] 找到 WebSocket 请求, 会话:', wsRequest.conversationName);

        const lastUserMessage = [...conversation.messages].reverse().find(m => m.isUser);
        if (!lastUserMessage) {
          console.warn('[WS] 没有找到用户消息');
          return;
        }

        const lastUserMessageIndex = conversation.messages.findIndex(m => m.id === lastUserMessage.id);

        const responses = conversation.messages
          .filter((msg, index) => !msg.isUser && index > lastUserMessageIndex)
          .map(msg => ({
            roleId: msg.roleId,
            content: msg.content
          }));

        console.log('[WS] 当前已响应角色数:', responses.length, '/', conversation.roleIds.length);

        const allResponded = conversation.roleIds.every(roleId =>
          conversation.messages.some((msg, index) =>
            !msg.isUser && msg.roleId === roleId && index > lastUserMessageIndex
          )
        );

        if (allResponded && responses.length > 0) {
          console.log('[WS] 所有角色已响应，发送响应给客户端');

          clearTimeout(wsRequest.timeout);
          wsManager.wsRequestQueue.delete(conversationId);
          stopPolling(conversationId);

          const combinedContent = await wsManager.combineResponses(responses);

          wsManager.send({
            type: 'ai_response',
            requestId: wsRequest.requestId,
            content: combinedContent,
            conversation_id: conversationId,
            conversation_name: wsRequest.conversationName,
            timestamp: Date.now()
          });

          console.log('[WS] 响应已发送');
        } else {
          console.log('[WS] 还有角色未响应，继续等待');
        }
      } catch (error) {
        console.error('[WS] 处理 aiResponse 时出错:', error);
      }
    })();

    return;
  }

  // 处理需要 async 的 action
  if (request.action === 'saveSettings' || request.action === 'reconnectWebSocket') {
    (async () => {
      try {
        if (request.action === 'saveSettings') {
          await StorageManager.saveSettings(request.settings);

          // 如果启用状态改变，处理 WebSocket 连接
          if (wsManager) {
            const currentSettings = await StorageManager.getSettings();
            if (request.settings.wsEnabled && !currentSettings.wsEnabled) {
              // 从未启用变为启用
              wsManager.connect(request.settings.wsUrl);
            } else if (!request.settings.wsEnabled && currentSettings.wsEnabled) {
              // 从启用变为未启用
              wsManager.disconnect();
            } else if (request.settings.wsUrl !== currentSettings.wsUrl && request.settings.wsEnabled) {
              // URL 改变且已启用
              wsManager.disconnect();
              setTimeout(() => {
                wsManager.connect(request.settings.wsUrl);
              }, 500);
            }
          }
          sendResponse({ success: true });
        } else if (request.action === 'reconnectWebSocket') {
          if (wsManager) {
            const settings = await StorageManager.getSettings();
            if (settings.wsEnabled && settings.wsUrl) {
              wsManager.disconnect();
              setTimeout(() => {
                wsManager.connect(settings.wsUrl);
              }, 500);
            }
          }
          sendResponse({ success: true });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  switch (request.action) {
    case 'createConversation':
      conversationManager.createConversation(request.name, request.modelIds || request.roleIds, request.contextMode, request.promptId, request.roleSettings)
        .then(sendResponse);
      return true;

    case 'deleteConversation':
      conversationManager.deleteConversation(request.conversationId)
        .then(() => sendResponse({ success: true }));
      return true;

    case 'updateConversation':
      (async () => {
        try {
          const { conversationId, updates } = request;
          // 支持modelIds，同时更新roleIds以保持兼容
          if (updates.modelIds) {
            updates.roleIds = updates.modelIds;
          }
          const conversation = await conversationManager.updateConversation(conversationId, updates);
          sendResponse(conversation);
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'clearConversation':
      (async () => {
        try {
          const result = await aiMessageManager.clearConversation(request.conversationId);
          sendResponse({ 
            success: true, 
            conversation: result,
            deletedConversations: result.deletedConversations || []
          });
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'clearConversationLocal':
      (async () => {
        try {
          const conversation = await aiMessageManager.conversationManager.getConversation(request.conversationId);
          const savedRoleUrls = conversation?.roleUrls ? { ...conversation.roleUrls } : {};

          const result = await aiMessageManager.conversationManager.clearConversationMessages(request.conversationId);
          sendResponse({ success: true, conversation: result, roleUrls: savedRoleUrls });
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'clearConversationPlatform':
      (async () => {
        try {
          const roleUrls = request.roleUrls || {};
          const deletedConversations = [];

          if (Object.keys(roleUrls).length > 0) {
            const roles = await StorageManager.getRoles();
            for (const [roleId, conversationUrl] of Object.entries(roleUrls)) {
              const role = roles.find(r => r.id === roleId);
              if (!role || !conversationUrl) continue;
              try {
                await aiMessageManager.deletePlatformConversation(role.provider, conversationUrl);
                deletedConversations.push({ provider: role.provider, url: conversationUrl });
              } catch (error) {
                console.error(`[AIMessageManager] ❌ ${role.provider} 平台会话删除失败:`, error.message);
              }
            }
          }

          chrome.runtime.sendMessage({
            type: 'clearComplete',
            success: true,
            conversationId: request.conversationId,
            deletedCount: deletedConversations.length
          });
        } catch (error) {
          chrome.runtime.sendMessage({
            type: 'clearComplete',
            success: false,
            conversationId: request.conversationId,
            error: error.message
          });
        }
      })();
      return false;

    case 'addMessage':
      aiMessageManager.processUserMessage(request.conversationId, request.content)
        .then(result => sendResponse(result))
        .catch(error => {
          console.error('addMessage失败:', error);
          aiMessageManager.conversationManager.getConversation(request.conversationId)
            .then(conversation => sendResponse(conversation))
            .catch(() => sendResponse({ error: error.message }));
        });
      return true;

    case 'getConversations':
      StorageManager.getConversations().then(sendResponse);
      return true;

    case 'getConversation':
      conversationManager.getConversation(request.conversationId)
        .then(sendResponse);
      return true;

    case 'createRole':
      roleManager.createRole(
        request.name,
        request.provider,
        request.model,
        request.systemPrompt
      ).then(sendResponse);
      return true;

    case 'updateRole':
      roleManager.updateRole(request.roleId, request.updates)
        .then(() => sendResponse({ success: true }));
      return true;

    case 'deleteRole':
      roleManager.deleteRole(request.roleId)
        .then(() => sendResponse({ success: true }));
      return true;

    case 'getRoles':
      StorageManager.getRoles().then(sendResponse);
      return true;

    case 'updateSettings':
      StorageManager.saveSettings(request.settings)
        .then(() => sendResponse({ success: true }));
      return true;

    case 'activatePlatformTab':
      tabManager.activatePlatformTab(request.provider, request.targetUrl)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getSettings':
      StorageManager.getSettings().then(sendResponse);
      return true;

    // ========== 新架构：提示词管理 ==========
    case 'getPrompts':
      promptManager.getPrompts(request.folderId).then(sendResponse);
      return true;

    case 'getPromptById':
      promptManager.getPromptById(request.promptId).then(sendResponse);
      return true;

    case 'createPrompt':
      promptManager.createPrompt(request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updatePrompt':
      promptManager.updatePrompt(request.promptId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deletePrompt':
      promptManager.deletePrompt(request.promptId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'searchPrompts':
      promptManager.searchPrompts(request.keyword).then(sendResponse);
      return true;

    case 'movePrompt':
      promptManager.movePrompt(request.promptId, request.targetFolderId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    // ========== 新架构：文件夹管理 ==========
    case 'getFolders':
      promptFolderManager.getFolders().then(sendResponse);
      return true;

    case 'getFolderTree':
      promptFolderManager.getFolderTree().then(sendResponse);
      return true;

    case 'createFolder':
      promptFolderManager.createFolder(request.name, request.parentId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateFolder':
      promptFolderManager.updateFolder(request.folderId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteFolder':
      promptFolderManager.deleteFolder(request.folderId, request.force).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'moveFolder':
      promptFolderManager.moveFolder(request.folderId, request.targetParentId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    // ========== 新架构：模型管理 ==========
    case 'getModels':
      modelManager.getModels().then(sendResponse);
      return true;

    case 'getModelById':
      modelManager.getModelById(request.modelId).then(sendResponse);
      return true;

    case 'getModelsByProvider':
      modelManager.getModelsByProvider(request.provider).then(sendResponse);
      return true;

    case 'createModel':
      modelManager.createModel(request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateModel':
      modelManager.updateModel(request.modelId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteModel':
      modelManager.deleteModel(request.modelId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'setDefaultModel':
      modelManager.setDefaultModel(request.modelId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getDefaultModel':
      modelManager.getDefaultModel().then(sendResponse);
      return true;

    case 'toggleModelEnabled':
      modelManager.toggleModelEnabled(request.modelId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getEnabledModels':
      modelManager.getEnabledModels().then(sendResponse);
      return true;

    // ========== 新架构：流程管理 ==========
    case 'getFlows':
      flowManager.getFlows().then(sendResponse);
      return true;

    case 'getFlowById':
      flowManager.getFlowById(request.flowId).then(sendResponse);
      return true;

    case 'createFlow':
      flowManager.createFlow(request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateFlow':
      flowManager.updateFlow(request.flowId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteFlow':
      flowManager.deleteFlow(request.flowId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'duplicateFlow':
      flowManager.duplicateFlow(request.flowId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'addNode':
      flowManager.addNode(request.flowId, request.nodeData).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateNode':
      flowManager.updateNode(request.flowId, request.nodeId, request.nodeData).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteNode':
      flowManager.deleteNode(request.flowId, request.nodeId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'addConnection':
      flowManager.addConnection(request.flowId, request.connectionData).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteConnection':
      flowManager.deleteConnection(request.flowId, request.connectionId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    // ========== 新架构：虚拟模型（统一在ModelManager中） ==========
    case 'getVirtualModels':
      modelManager.getVirtualModels().then(sendResponse);
      return true;

    case 'createVirtualModel':
      modelManager.createModel({
        ...request.data,
        isVirtual: true
      }).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getVirtualModelWithFlow':
      (async () => {
        const model = await modelManager.getModelById(request.virtualModelId);
        if (!model || !model.isVirtual) {
          sendResponse({ error: '虚拟模型不存在' });
          return;
        }
        const flow = await flowManager.getFlowById(model.flowId);
        sendResponse({ ...model, flow });
      })();
      return true;

    case 'deleteVirtualModel':
      modelManager.deleteModel(request.virtualModelId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    // ========== 新架构：流程执行 ==========
    case 'executeFlow':
      (async () => {
        try {
          const flow = await flowManager.getFlowById(request.flowId);
          if (!flow) {
            throw new Error('流程不存在');
          }

          const result = await flowExecutor.executeFlow(
            flow,
            request.userInput,
            request.context || {}
          );

          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'executeVirtualModel':
      (async () => {
        try {
          const model = await modelManager.getModelById(request.virtualModelId);
          if (!model || !model.isVirtual) {
            throw new Error('虚拟模型不存在');
          }

          const flow = await flowManager.getFlowById(model.flowId);
          if (!flow) {
            throw new Error('流程不存在');
          }

          const result = await flowExecutor.executeFlow(
            flow,
            request.userInput,
            request.context || {}
          );

          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'validateFlow':
      (async () => {
        try {
          const flow = await flowManager.getFlowById(request.flowId);
          const validation = flowExecutor.validateFlow(flow);
          sendResponse(validation);
        } catch (error) {
          sendResponse({ valid: false, errors: [error.message] });
        }
      })();
      return true;

    // ========== 新架构：混合执行（普通模型+虚拟模型） ==========
    case 'executeMixedModels':
      (async () => {
        try {
          const { modelIds, userInput, context } = request;

          // 并行执行所有模型
          const results = await Promise.all(
            modelIds.map(async (modelId) => {
              const model = await modelManager.getModelById(modelId);
              if (!model) {
                throw new Error(`模型不存在: ${modelId}`);
              }

              if (model.isVirtual) {
                // 执行虚拟模型
                const flow = await flowManager.getFlowById(model.flowId);
                const result = await flowExecutor.executeFlow(flow, userInput, context);
                return {
                  modelId: model.id,
                  modelName: model.name,
                  isVirtual: true,
                  result
                };
              } else {
                // 执行普通模型
                const result = await tabManager.sendMessage(model.provider, userInput);
                return {
                  modelId: model.id,
                  modelName: model.name,
                  isVirtual: false,
                  result
                };
              }
            })
          );

          sendResponse({ success: true, results });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'validateFlow':
      (async () => {
        try {
          const flow = await flowManager.getFlowById(request.flowId);
          const validation = flowExecutor.validateFlow(flow);
          sendResponse(validation);
        } catch (error) {
          sendResponse({ valid: false, errors: [error.message] });
        }
      })();
      return true;

    case 'disconnectWebSocket':
      if (wsManager) {
        wsManager.disconnect();
      }
      sendResponse({ success: true });
      return true;

    case 'getWSStatus':
      if (wsManager) {
        sendResponse(wsManager.getStatus());
      } else {
        sendResponse({ connected: false });
      }
      return true;

    case 'testPlatform':
      tabManager.sendMessage(request.platform, '测试连接')
        .then(response => {
          if (response && response.success) {
            sendResponse({
              success: true,
              info: {
                platform: request.platform,
                response: response.content,
                length: response.content ? response.content.length : 0
              }
            });
          } else {
            sendResponse({
              success: false,
              error: response?.error || '未收到有效回复'
            });
          }
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'openPlatformConversation':
      (async () => {
        try {
          let targetUrl = request.targetUrl || null;
          if (!targetUrl && request.conversationId && request.roleId) {
            const conversation = await conversationManager.getConversation(request.conversationId);
            targetUrl = conversation?.roleUrls?.[request.roleId] || null;
          }
          const result = await tabManager.openPlatformConversation(request.provider, targetUrl);
          sendResponse(result);
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

function startPolling(conversationId) {
  stopPolling(conversationId);

  console.log('[Background] 启动轮询监控会话:', conversationId);

  pollingIntervals.set(conversationId, setInterval(async () => {
    try {
      const conversation = await conversationManager.getConversation(conversationId);
      if (!conversation) {
        console.log('[Background] 会话不存在，停止轮询');
        stopPolling(conversationId);
        return;
      }

      const roles = await StorageManager.getRoles();
      const sendMode = conversation.sendMode || 'parallel';
      let pendingRoleIds = [];

      if (sendMode === 'parallel' || sendMode === 'random') {
        const lastUserMessage = [...conversation.messages].reverse().find(m => m.isUser);
        if (!lastUserMessage) {
          console.log('[Background] 没有用户消息，停止轮询');
          stopPolling(conversationId);
          return;
        }

        const lastUserMessageIndex = conversation.messages.findIndex(m => m.id === lastUserMessage.id);

        conversation.roleIds.forEach(roleId => {
          const hasResponse = conversation.messages.some((msg, index) =>
            !msg.isUser &&
            msg.roleId === roleId &&
            index > lastUserMessageIndex
          );
          if (!hasResponse) {
            pendingRoleIds.push(roleId);
          }
        });
      } else if (sendMode === 'sequential') {
        const lastUserMessage = [...conversation.messages].reverse().find(m => m.isUser);
        if (!lastUserMessage) {
          console.log('[Background] 没有用户消息，停止轮询');
          stopPolling(conversationId);
          return;
        }

        const lastUserMessageIndex = conversation.messages.findIndex(m => m.id === lastUserMessage.id);

        const roleOrder = conversation.roleOrder || conversation.roleIds;
        for (const roleId of roleOrder) {
          const hasResponse = conversation.messages.some((msg, index) =>
            !msg.isUser &&
            msg.roleId === roleId &&
            index > lastUserMessageIndex
          );

          if (!hasResponse) {
            pendingRoleIds = roleOrder.slice(roleOrder.indexOf(roleId));
            break;
          }
        }
      }

      if (pendingRoleIds.length === 0) {
        console.log('[Background] 所有角色已响应完成，停止轮询');
        stopPolling(conversationId);
        return;
      }

      console.log(`[Background] 检测到 ${pendingRoleIds.length} 个未响应角色`);

      const browserInfo = await getBrowserInfo();
      console.log(`[Background] 浏览器: ${browserInfo.name}, 待处理角色: ${pendingRoleIds.map(id => roles.find(r => r.id === id)?.name).join(', ')}`);

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const originalActiveTab = tabs[0];

      for (const roleId of pendingRoleIds) {
        const role = roles.find(r => r.id === roleId);
        if (!role) continue;
        const provider = PROVIDERS[role.provider];
        const roleUrl = conversation.roleUrls?.[roleId];
        const isBaseUrl = !roleUrl || roleUrl === provider?.baseUrl;

        try {
          console.log(`[Background] 激活角色 ${role.name} (${role.provider}) 标签页`);
          let targetTab = null;

          if (isBaseUrl) {
            const tabId = conversation.roleTabIds?.[roleId];
            if (tabId) {
              try {
                await chrome.tabs.get(tabId);
                targetTab = { id: tabId };
              } catch {
                console.log(`[Background] tab ${tabId} 已关闭`);
              }
            }
          } else {
            targetTab = await tabManager.findTabByUrl(roleUrl);
          }

          if (!targetTab) {
            console.log(`[Background] 未找到标签页: role: ${role.name}, url=${roleUrl}, provider: ${role.provider}`);
            continue;
          }

          await chrome.tabs.update(targetTab.id, { active: true });
          //await new Promise(resolve => setTimeout(resolve, 100));
          //await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.error(`[Background] 激活 ${role.name} 标签页失败`, error);
        }
      }

      if (originalActiveTab) {
        await chrome.tabs.update(originalActiveTab.id, { active: true });
        console.log(`[Background] 已切回原始标签页`);
      }
    } catch (error) {
      console.error('[Background] 轮询检查失败', error);
    }
  }, 6000));
}

function stopPolling(conversationId) {
  const interval = pollingIntervals.get(conversationId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(conversationId);
    console.log('[Background] 停止轮询:', conversationId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'pageReady') {
    sendResponse({ status: 'ok' });
  }

  if (message.type === 'sendToIframe') {
    sendResponse({ success: true });
    return true;
  }
});

if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const conversations = await StorageManager.getConversations();
    let changed = false;
    for (const conv of conversations) {
      if (conv.roleTabIds) {
        for (const [rid, tid] of Object.entries(conv.roleTabIds)) {
          if (tid === tabId) {
            delete conv.roleTabIds[rid];
            changed = true;
          }
        }
      }
    }
    if (changed) {
      await StorageManager.saveConversations(conversations);
    }
  } catch (error) {
    console.error('[Background] 清理 roleTabIds 失败:', error);
  }
});

init();
