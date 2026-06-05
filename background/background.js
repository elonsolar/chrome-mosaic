importScripts('./managers/prompt-manager.js');
importScripts('./managers/prompt-folder-manager.js');
importScripts('./managers/platform-manager.js');
importScripts('./managers/flow-manager.js');
importScripts('./managers/flow-executor.js');
importScripts('./managers/temporary-session-pool.js');
importScripts('./managers/team-manager.js');
importScripts('./managers/expert-manager.js');
importScripts('./senders/abstract-message-sender.js');
importScripts('./senders/web-message-sender.js');
importScripts('./senders/api-message-sender.js');
importScripts('./senders/sender-factory.js');
importScripts('./flow-test-runner.js');
importScripts('./core/base-entity.js');
importScripts('./core/conversation-context.js');
importScripts('./core/message-queue.js');
importScripts('./core/conversation-worker.js');
importScripts('./core/progress-tracker.js');
importScripts('./entities/member-entity.js');
importScripts('./entities/expert-entity.js');
importScripts('./entities/entity-factory.js');
importScripts('./services/progress-notification-service.js');
importScripts('./services/conversation-message-service.js');
importScripts('./core/constants.js');

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

      case 'manager_request':
        this.handleManagerRequest(message);
        break;

      case 'heartbeat':
        // 心跳消息，不需要处理
        break;

      default:
        console.log('[WS] 未知消息类型:', message.type);
    }
  }

  async handleManagerRequest(message) {
    const { requestId, action, data } = message;
    console.log('[WS] 处理管理请求:', action, requestId);

    try {
      // 支持复合操作如 expert.update
      const parts = action.split('.');
      const resource = parts[0];
      const operation = parts.slice(1).join('.');
      let result = null;

      switch (resource) {
        case 'conversation':
          result = await this.handleConversationManager(operation, data);
          break;
        case 'prompt':
          result = await this.handlePromptManager(operation, data);
          break;
        case 'model':
          result = await this.handleModelManager(operation, data);
          break;
        case 'expert':
          result = await this.handleExpertManager(operation, data);
          break;
        case 'system':
          result = this.handleSystemManager(operation, data);
          break;
        default:
          throw new Error(`未知的资源类型: ${resource}`);
      }

      this.send({
        type: 'manager_response',
        requestId,
        success: true,
        data: result,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WS] 管理请求处理失败:', error);
      this.send({
        type: 'manager_response',
        requestId,
        success: false,
        error: {
          code: 'MANAGER_ERROR',
          message: error.message
        },
        timestamp: Date.now()
      });
    }
  }

  async handleConversationManager(operation, data) {
    switch (operation) {
      case 'list':
        return await StorageManager.getConversations();
      case 'get':
        return await conversationManager.getConversation(data.conversationId);
      case 'messages':
        const conv = await conversationManager.getConversation(data.conversationId);
        return conv ? conv.messages : [];
      case 'members':
        const convMembers = await conversationManager.getConversation(data.conversationId);
        return convMembers ? convMembers.members : [];
      case 'create':
        return await conversationManager.createConversation(
          data.name,
          data.members,
          data.mode,
          data.options
        );
      case 'update':
        return await conversationManager.updateConversation(data.conversationId, data.updates);
      case 'delete':
        await conversationManager.deleteConversation(data.conversationId);
        return { success: true };
      case 'send':
        return await aiMessageManager.processUserMessage(data.conversationId, data.message);
      default:
        throw new Error(`未知的会话操作: ${operation}`);
    }
  }

  async handlePromptManager(operation, data) {
    switch (operation) {
      case 'list':
        return await promptManager.getPrompts();
      case 'get':
        return await promptManager.getPromptById(data.promptId);
      case 'create':
        return await promptManager.createPrompt(data);
      case 'update':
        return await promptManager.updatePrompt(data.promptId, data);
      case 'delete':
        await promptManager.deletePrompt(data.promptId);
        return { success: true };
      case 'search':
        return await promptManager.searchPrompts(data.keyword);
      default:
        throw new Error(`未知的提示词操作: ${operation}`);
    }
  }

  async handleModelManager(operation, data) {
    switch (operation) {
      case 'list':
        return await platformManager.getAllModels();
      case 'get':
        return await platformManager.getModelById(data.modelId);
      case 'create':
        return await platformManager.addModel(data.platformId, data);
      case 'update':
        return await platformManager.updateModel(data.platformId, data.modelId, data);
      case 'delete':
        await platformManager.deleteModel(data.platformId, data.modelId);
        return { success: true };
      case 'toggle':
        return await platformManager.toggleModelEnabled(data.platformId, data.modelId);
      case 'platforms':
        return await platformManager.getPlatforms();
      default:
        throw new Error(`未知的模型操作: ${operation}`);
    }
  }

  async handleExpertManager(operation, data) {
    switch (operation) {
      case 'list':
        return await expertManager.getExperts();
      case 'get':
        return await expertManager.getExpertById(data.expertId);
      case 'create':
        return await expertManager.createExpert(data);
      case 'update':
        return await expertManager.updateExpert(data.expertId, data);
      case 'delete':
        await expertManager.deleteExpert(data.expertId);
        return { success: true };
      case 'duplicate':
        return await expertManager.duplicateExpert(data.expertId);
      case 'search':
        return await expertManager.searchExperts(data.keyword);
      default:
        throw new Error(`未知的专家操作: ${operation}`);
    }
  }

  handleSystemManager(operation, data) {
    switch (operation) {
      case 'info':
        return {
          version: '1.0.0',
          timestamp: Date.now()
        };
      case 'heartbeat':
        return {
          time: new Date().toISOString()
        };
      default:
        throw new Error(`未知的系统操作: ${operation}`);
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

      const memberIds = conversation.members.map(m => m.id);
      console.log('[WS] 找到会话:', conversation.id, '成员:', memberIds);

      if (!conversation.members || conversation.members.length === 0) {
        throw new Error(`会话 "${model}" 没有配置成员。请在插件中为该会话添加成员。`);
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

  updateStatus(connected, status, extra = {}) {
    console.log('[WS] 状态更新:', { connected, status, ...extra });
    
    // 发送状态更新到所有相关的标签页
    if (chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id && chrome.tabs.sendMessage) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'ws_status_update',
              connected,
              status,
              ...extra
            }).catch(() => {
              // 忽略发送失败（标签页可能关闭或不监听此消息）
            });
          }
        });
      });
    }
  }
}

class AIMessageManager {
  constructor(tabManager, conversationManager, senderFactory) {
    this.tabManager = tabManager;
    this.conversationManager = conversationManager;
    this.senderFactory = senderFactory;
  }

  async combineResponses(responses, conversation) {
    if (!responses || responses.length === 0) {
      return '';
    }

    if (responses.length === 1) {
      return responses[0].content;
    }

    return responses.map((r, index) => {
      const member = conversation.members.find(m => m.id === r.memberId);
      const memberName = member ? member.name : `成员 ${index + 1}`;
      return `[${memberName}] ${r.content}`;
    }).join('\n\n');
  }

  async processUserMessage(conversationId, userMessage) {
    return await conversationMessageService.processUserMessage(conversationId, userMessage);
  }

  async executeDiscussionLoop(conversationId, question, rounds, contextMode, useFloatWindow) {
    if (rounds && rounds > 1) {
      console.warn('[AIMessageManager] 多轮讨论功能暂未实现，将执行单轮讨论。rounds 参数被忽略。');
    }

    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

    const updates = {
      mode: 'discussion',
      contextMode: contextMode
    };

    await this.conversationManager.updateConversation(conversationId, updates);

    return await conversationMessageService.processUserMessage(conversationId, question);
  }

  formatSummary(summary) {
    if (!summary) return '';
    
    return `<summary>
# 专家会话历史摘要

提示：这是历史摘要，可能不一定和当前任务相关

---

${summary}
</summary>`;
  }

  async executeExpertQA(conversation, userMessage, useFloatWindow) {
    let flow = null;

    if (conversation.expertId) {
      const expert = await expertManager.getExpertById(conversation.expertId);
      if (!expert) {
        await this.sendToFloatWindow('addMessage', {
          role: '系统',
          content: '错误：专家不存在',
          isUser: false,
          isError: true
        });
        return;
      }

      flow = {
        nodes: expert.nodes || [],
        connections: expert.connections || []
      };
    }

    if (!flow) {
      await this.sendToFloatWindow('addMessage', {
        role: '系统',
        content: '错误：未配置协作方案',
        isUser: false,
        isError: true
      });
      return;
    }

    // 构建输入：如果有历史摘要，放在用户输入前面
    let fullInput = userMessage;
    if (conversation.expertSummary && !conversation.expertSummaryFailed) {
      fullInput = this.formatSummary(conversation.expertSummary) + '\n\n' + userMessage;
    }

    // 获取 start 节点的输出变量名
    const startNode = flow.nodes.find(n => n.type === '1' || n.type === 'start');
    const startOutputName = startNode?.data?.outputs?.[0]?.name || 'user_input';

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '系统',
        content: '【专家问答】开始执行...',
        isUser: false,
        isError: false
      });
    }

    const result = await flowExecutor.executeFlow(flow, fullInput, {
      startNodeInputs: { [startOutputName]: fullInput },
      conversationId: conversation.id,
      memberId: conversation.expertId,
      onProgress: async (progress) => {
        // 发送进度到 chat 页面
        chrome.runtime.sendMessage({
          type: 'flowExecutionProgress',
          conversationId: conversation.id,
          progress: progress
        }).catch(() => {});

        if (useFloatWindow) {
          await this.sendToFloatWindow('addMessage', {
            role: '系统',
            content: `【专家问答】执行中... (${progress.current || 0}/${progress.total || 0}节点)`,
            isUser: false,
            isError: false
          });
        }
      }
    });

    const finalContent = result.content || '未能获取答案';

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '专家问答',
        content: finalContent,
        isUser: false,
        isError: false
      });
    }

    conversation.flowHistory.push({
      timestamp: Date.now(),
      question: userMessage,
      result: result
    });

    await this.conversationManager.updateConversation(conversation.id, {
      flowHistory: conversation.flowHistory
    });

    // 异步生成摘要（不阻塞主流程）
    this.updateExpertSummaryAsync(conversation.id, userMessage, finalContent, conversation.expertSummary, conversation.expertSummaryFailed)
      .catch(err => console.error('[ExpertQA] 摘要更新未处理异常:', err));
  }

  async generateExpertSummary(userMessage, assistantReply, oldSummary, model) {
    const prompt = `请根据以下信息生成简洁的对话摘要：

历史摘要：${oldSummary || "无"}

用户问题：${userMessage}

AI回答：${assistantReply}

要求：
1. 保留关键信息（主题、结论、用户偏好）
2. 长度控制在300字以内
3. 用于下一轮对话的上下文参考
4. 如果有新的关键信息，合并到历史摘要中

请直接输出摘要内容，不要添加任何前缀或解释：`;

    const sender = this.senderFactory.getSender(model.accessMethod || 'web');
    
    // 设置超时（60秒）
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('摘要生成超时')), 60000)
    );
    
    try {
      const response = await Promise.race([
        sender.send(prompt, {
          model: model.code,
          baseUrl: model.baseUrl || '',
          apiKey: model.apiKey || '',
          webUrl: model.webUrl || ''
        }),
        timeoutPromise
      ]);
      
      return response.content || null;
    } catch (error) {
      console.error('[ExpertQA] 摘要生成失败:', error.message);
      return null;
    }
  }

  async updateExpertSummaryAsync(conversationId, userMessage, assistantReply, oldSummary, expertSummaryFailed) {
    // 如果已经失败，跳过
    if (expertSummaryFailed) {
      console.log('[ExpertQA] 摘要生成已标记为失败，跳过');
      return;
    }

    try {
      // 获取 helperModel 配置
      const settings = await StorageManager.getSettings();
      const helperModelId = settings.helperModel;
      
      console.log('[ExpertQA] 摘要生成 - helperModelId:', helperModelId);
      
      if (!helperModelId) {
        console.warn('[ExpertQA] 未配置辅助模型，跳过摘要生成');
        return;
      }

      const helperModel = await platformManager.getModelById(helperModelId);
      console.log('[ExpertQA] 摘要生成 - helperModel:', helperModel?.code, helperModel?.platformName);
      
      if (!helperModel) {
        console.warn('[ExpertQA] 辅助模型不存在，跳过摘要生成');
        return;
      }

      // 生成摘要
      console.log('[ExpertQA] 开始生成摘要...');
      const newSummary = await this.generateExpertSummary(
        userMessage, 
        assistantReply, 
        oldSummary, 
        helperModel
      );

      console.log('[ExpertQA] 摘要生成结果:', newSummary ? '成功' : '失败');

      if (newSummary) {
        // 成功：更新摘要
        await this.conversationManager.updateConversation(conversationId, {
          expertSummary: newSummary,
          expertSummaryUpdatedAt: Date.now(),
          expertSummaryFailed: false
        });
        console.log('[ExpertQA] 摘要已更新');
      } else {
        // 失败：标记失败，发送提示
        await this.conversationManager.updateConversation(conversationId, {
          expertSummaryFailed: true
        });
        console.log('[ExpertQA] 摘要生成失败，已标记');

        if (helperModel.accessMethod === 'web') {
          await this.conversationManager.addMessage(conversationId, null, 
            `⚠️ 摘要生成失败，请<a href="${helperModel.webUrl}" target="_blank" class="tip-link">去登陆</a>后重试`, 
            MessageType.TIP
          );
        }
      }
    } catch (error) {
      // 不阻塞主流程
      console.error('[ExpertQA] 摘要生成异常:', error);
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
    if (conversation.memberUrls && Object.keys(conversation.memberUrls).length > 0) {
      console.log(`[AIMessageManager] 准备删除平台会话，共 ${Object.keys(conversation.memberUrls).length} 个`);

      for (const [memberId, conversationUrl] of Object.entries(conversation.memberUrls)) {
        const member = conversation.members.find(m => m.id === memberId);
        if (!member || !conversationUrl) continue;

        const providerKey = member.modelCode || member.provider;
        try {
          console.log(`[AIMessageManager] 开始删除会话: ${conversationUrl}`);
          await this.deletePlatformConversation(conversationUrl);
          deletedConversations.push({ url: conversationUrl });
          console.log(`[AIMessageManager] ✓ 会话删除成功`);
        } catch (error) {
          console.error(`[AIMessageManager] ❌ ${providerKey} 平台会话删除失败:`, error.message);
        }
      }
    }

    console.log(`[AIMessageManager] 平台会话删除完成，成功删除 ${deletedConversations.length} 个`);

    // 然后清除本地数据
    const result = await this.conversationManager.clearConversationMessages(conversationId);
    return { ...result, deletedConversations };
  }

  async deletePlatformConversation(conversationUrl) {
    try {
      const tab = await this.tabManager.openPlatformTab(conversationUrl, false);
      
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

      console.log(`[AIMessageManager] 平台会话删除成功`);

      try {
        await chrome.tabs.remove(tab.id);
        console.log(`[AIMessageManager] 已关闭删除操作标签页`);
      } catch (closeError) {
        console.warn(`[AIMessageManager] 关闭标签页失败（可能已被用户关闭）:`, closeError.message);
      }

      return true;
    } catch (error) {
      console.error(`[AIMessageManager] 删除平台会话失败:`, error);
      throw error;
    }
  }
}

class StorageManager {
  static async getConversations() {
    const result = await chrome.storage.local.get('conversations');
    const conversations = result.conversations || [];
    console.log('[StorageManager] getConversations: 获取到', conversations.length, '个会话');
    return conversations;
  }

  static async saveConversations(conversations) {
    console.log('[StorageManager] saveConversations: 保存', conversations.length, '个会话');
    await chrome.storage.local.set({ conversations });
    console.log('[StorageManager] saveConversations: 保存完成');
  }

  static async getSettings() {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {
      wsUrl: 'ws://localhost:12606',
      wsEnabled: false,
      contextMode: 'self',
      floatWindow: true,
      helperModel: ''
    };
  }

  static async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
}

class TabManager {
  async openPlatformTab(url, forceNew = false) {
    if (!url) {
      throw new Error('没有配置 URL');
    }

    if (!forceNew) {
      let existingTab = await this.findTabByUrl(url);
      if (!existingTab) {
        const baseUrl = this._extractBaseUrl(url);
        if (baseUrl) {
          existingTab = await this.findTabByUrlPrefix(baseUrl);
          if (existingTab) {
            console.log(`[TabManager] 通过前缀匹配找到标签页，导航到目标URL: ${url}`);
            await chrome.tabs.update(existingTab.id, { url: url, active: false });
            await this.sleep(2000);
            await this.waitForTabReady(existingTab.id);
            await chrome.tabs.update(existingTab.id, { active: false });
            return existingTab;
          }
        }
      }
      if (existingTab) {
        console.log(`[TabManager] 复用已存在的标签页: ${url}`);
        await chrome.tabs.update(existingTab.id, { active: false });
        await this.sleep(2000);
        return existingTab;
      }
      console.log(`[TabManager] 未找到匹配标签页，创建新标签页: ${url}`);
    } else {
      console.log(`[TabManager] 强制创建新标签页: ${url}`);
    }

    const tab = await chrome.tabs.create({
      url: url,
      active: false
    });

    await this.waitForTabReady(tab.id);
    await chrome.tabs.update(tab.id, { active: false });

    return tab;
  }

  _extractBaseUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}/`;
    } catch {
      return null;
    }
  }

  async findTabByUrlPrefix(webUrl) {
    if (!webUrl) return null;
    const allTabs = await chrome.tabs.query({});
    return allTabs.find(tab =>
      tab.url && tab.url.startsWith(webUrl) && !tab.pendingUrl
    ) || null;
  }

  async findTabByUrl(targetUrl) {
    const allTabs = await chrome.tabs.query({});
    return allTabs.find(tab => tab.url === targetUrl && !tab.pendingUrl) || null;
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
            reject(new Error(`标签页${tabId} 加载超时`));
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

  async closeTabByUrl(url) {
    const tab = await this.findTabByUrl(url);
    if (!tab) return;
    await chrome.tabs.remove(tab.id);
  }

  async activatePlatformTab(targetUrl) {
    const existingTab = await this.findTabByUrlPrefix(targetUrl);

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return true;
    } else {
      const tab = await this.openPlatformTab(targetUrl, true);
      await chrome.tabs.update(tab.id, { active: true });
      return true;
    }
  }

  async openPlatformConversation(targetUrl) {
    const existingTab = await this.findTabByUrlPrefix(targetUrl);

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return { success: true, tabId: existingTab.id };
    } else {
      const tab = await this.openPlatformTab(targetUrl, true);
      await chrome.tabs.update(tab.id, { active: true });
      return { success: true, tabId: tab.id };
    }
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

  async createConversation(name, members, mode, options = {}) {
    console.log('[Background] createConversation - mode:', mode, 'members count:', members?.length);

    // 使用全局锁防止竞态条件
    return withStorageLock(async () => {
      const conversations = await StorageManager.getConversations();

      const modeToContextMode = {
        brainstorming: 'self',
        discussion: 'full',
        expertqa: 'self'
      };

      const contextMode = modeToContextMode[mode] || (mode === 'self' || mode === 'full' ? mode : 'self');
      const sendMode = mode === 'discussion' ? 'sequential' : 'parallel';

      // 从 members 数组提取 ID
      const memberIds = members?.map(m => m.id) || [];

      const hasCustomName = !!name;
      const newConversation = {
        id: this.generateId(),
        name: name || `会话 ${conversations.length + 1}`,
        nameIsDefault: !hasCustomName,
        titleStatus: hasCustomName ? 'done' : 'default',
        mode: mode || 'brainstorming',
        contextMode,
        sendMode,
        members: members || [],
        memberSettings: options.memberSettings || {},
        memberOrder: options.memberOrder || memberIds,
        expertId: options.expertId || null,
        expertSummary: '',                    // 专家会话摘要
        expertSummaryUpdatedAt: null,         // 摘要更新时间
        expertSummaryFailed: false,           // 摘要生成是否失败
        flowHistory: [],                      // 专家流程执行历史
        memberUrls: {},
        memberLastMessageIds: {},
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      conversations.push(newConversation);
      await StorageManager.saveConversations(conversations);

      console.log('[Background] 会话创建完成，ID:', newConversation.id, '成员数:', newConversation.members?.length);

      // 创建会话后立即写入成员加入 Tip 消息
      if (members && members.length > 0) {
        try {
          const allPrompts = await promptManager.getPrompts();

          for (const member of members) {
            let promptInfo = '';
            if (member.systemPrompt) {
              const prompt = allPrompts.find(p => p.content === member.systemPrompt);
              const promptName = prompt ? prompt.name : '自定义提示词';
              promptInfo = `，提示词是 ${promptName}`;
            }

            let loginLink = '';
            if (member.accessMethod === 'web' && member.webUrl) {
              loginLink = `，<a href="${member.webUrl}" class="tip-link tip-login-link" target="_blank">去登陆</a>`;
            }
            const tipContent = `${member.name} 加入会话，模型是 ${member.modelCode}(${member.platformName})${promptInfo}${loginLink}，<a href="#" class="tip-link" data-member-id="${member.id}">修改成员信息</a>`;
            await this.addMessage(newConversation.id, null, tipContent, MessageType.TIP);
          }

          if (mode === 'discussion') {
            const roundtableTip = `你正在【圆桌讨论】模式中。所有成员共享完整的对话上下文，按顺序依次发言。使用 <code>/loop 问题 次数</code> 可发起多轮讨论。`;
            await this.addMessage(newConversation.id, null, roundtableTip, MessageType.TIP);
          }

          console.log('[Background] 成员加入 Tip 消息已写入');
        } catch (tipError) {
          console.error('[Background] 写入成员加入 Tip 失败:', tipError);
        }
      }

      // expertqa 模式的 tip 消息（独立于 members）
      if (mode === 'expertqa') {
        try {
          const settings = await StorageManager.getSettings();
          const helperModelId = settings.helperModel;
          
          let tipContent = '🎓 专家辅助已加入会话';
          
          if (helperModelId) {
            const helperModel = await platformManager.getModelById(helperModelId);
            if (helperModel) {
              if (helperModel.accessMethod === 'web') {
                tipContent += `，摘要模型是 ${helperModel.code}(${helperModel.platformName})`;
                tipContent += `，<a href="${helperModel.webUrl}" target="_blank" class="tip-link">去登陆</a>`;
              } else {
                tipContent += `，摘要模型是 ${helperModel.code}(${helperModel.platformName})`;
              }
            }
          } else {
            tipContent += '，<a href="#" class="tip-link" data-action="settings">请先配置辅助模型</a>';
          }
          
          await this.addMessage(newConversation.id, null, tipContent, MessageType.TIP);
          console.log('[Background] 专家辅助 Tip 消息已写入');
        } catch (tipError) {
          console.error('[Background] 写入专家辅助 Tip 失败:', tipError);
        }
      }

      // 验证保存是否成功（重试机制）
      let verified = null;
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 等待 50ms
        const saved = await StorageManager.getConversations();
        verified = saved.find(c => c.id === newConversation.id);
        if (verified) {
          console.log('[Background] 验证成功：会话已正确保存到 storage (尝试', i + 1, ')');
          break;
        }
      }

      if (!verified) {
        console.error('[Background] 严重错误：会话创建后无法从 storage 读取！ID:', newConversation.id);
        throw new Error(`会话创建后无法验证：${newConversation.id}`);
      }

      return newConversation;
    });
  }

  async deleteConversation(conversationId) {
    return withStorageLock(async () => {
      const conversations = await StorageManager.getConversations();
      const index = conversations.findIndex(c => c.id === conversationId);
      if (index === -1) {
        throw new Error(`会话不存在: ${conversationId}`);
      }
      conversations.splice(index, 1);
      await StorageManager.saveConversations(conversations);
    });
  }

  async updateConversation(conversationId, updates) {
    return withStorageLock(async () => {
      const conversations = await StorageManager.getConversations();
      const conversation = conversations.find(c => c.id === conversationId);

      if (conversation) {
        if (updates.mode) {
          const modeToContextMode = {
            brainstorming: 'self',
            discussion: 'full',
            expertqa: 'self'
          };
          updates.contextMode = modeToContextMode[updates.mode] || 'self';
          updates.sendMode = updates.mode === 'discussion' ? 'sequential' : 'parallel';
        } else if (updates.contextMode && updates.contextMode !== conversation.contextMode && !updates.mode) {
          throw new Error('会话模式不可修改');
        }
        // 用户手动更新标题时，清除默认标题标志
        if (updates.name !== undefined) {
          updates.nameIsDefault = false;
        }
        Object.assign(conversation, updates, { updatedAt: Date.now() });
        await StorageManager.saveConversations(conversations);
        return conversation;
      }

      return null;
    });
  }

  async addMessageWithMeta(conversationId, memberId, content, msgType, metaUpdates) {
    const queueKey = conversationId;

    if (!this.messageQueues.has(queueKey)) {
      this.messageQueues.set(queueKey, Promise.resolve());
    }

    const queue = this.messageQueues.get(queueKey);

    const newQueue = queue.then(async () => {
      const conversations = await StorageManager.getConversations();
      const conversation = conversations.find(c => c.id === conversationId);

      if (conversation) {
        const oldMemberUrls = conversation.memberUrls || {};
        console.log(`[addMessageWithMeta] 保存前 memberUrls:`, JSON.stringify(oldMemberUrls));

        let memberName = null;
        if (memberId) {
          const member = conversation.members.find(m => m.id === memberId);
          if (member) {
            memberName = member.name;
          }
        }

        const message = {
          id: this.generateId(),
          memberId,
          content,
          timestamp: Date.now()
        };

        if (memberName) {
          message.memberName = memberName;
        }

        message.type = msgType;

        if (msgType === MessageType.USER) {
          message.isUser = true;
        } else if (msgType === MessageType.INTRO) {
          message.isIntro = true;
        } else if (msgType === MessageType.TIP) {
          message.isTip = true;
        }

        conversation.messages.push(message);
        conversation.updatedAt = Date.now();

        if (metaUpdates) {
          if (metaUpdates.memberUrls) {
            conversation.memberUrls = Object.assign({}, conversation.memberUrls || {}, metaUpdates.memberUrls);
          }
          if (metaUpdates.memberLastMessageIds) {
            conversation.memberLastMessageIds = Object.assign({}, conversation.memberLastMessageIds || {}, metaUpdates.memberLastMessageIds);
          }
        }

        console.log(`[addMessageWithMeta] 保存后 memberUrls:`, JSON.stringify(conversation.memberUrls));
        await StorageManager.saveConversations(conversations);

        const verify = await StorageManager.getConversations();
        const verifyConv = verify.find(c => c.id === conversationId);
        console.log(`[addMessageWithMeta] 验证读取 memberUrls:`, JSON.stringify(verifyConv?.memberUrls));

        return message;
      }

      return null;
    });

    this.messageQueues.set(queueKey, newQueue);

    return newQueue;
  }

  async clearConversationMessages(conversationId) {
    const conversations = await StorageManager.getConversations();
    const conversation = conversations.find(c => c.id === conversationId);

    if (conversation) {
      conversation.messages = [];
      conversation.memberUrls = {};
      conversation.memberLastMessageIds = {};
      conversation.expertSummary = '';
      conversation.expertSummaryUpdatedAt = null;
      conversation.expertSummaryFailed = false;
      conversation.flowHistory = [];
      conversation.updatedAt = Date.now();
      await StorageManager.saveConversations(conversations);
      return conversation;
    }

    return null;
  }

  async addMessage(conversationId, memberId, content, msgType = MessageType.MEMBER, tipSubType = null, options = {}) {
    const queueKey = conversationId;

    if (!this.messageQueues.has(queueKey)) {
      this.messageQueues.set(queueKey, Promise.resolve());
    }

    const queue = this.messageQueues.get(queueKey);

    const newQueue = queue.then(async () => {
      const conversations = await StorageManager.getConversations();
      const conversation = conversations.find(c => c.id === conversationId);

      if (conversation) {
        // 获取成员/专家名称快照
        let memberName = null;
        if (memberId) {
          const member = conversation.members.find(m => m.id === memberId);
          if (member) {
            memberName = member.name;
          } else if (memberId.startsWith('expert-')) {
            // 专家模式：从 experts 中查找名称
            try {
              const result = await chrome.storage.local.get('experts');
              const expert = (result.experts || []).find(e => e.id === memberId);
              if (expert) {
                memberName = expert.name;
              }
            } catch (e) {
              console.warn('[ConversationManager] 获取专家名称失败:', e);
            }
          }
        }

        const message = {
          id: this.generateId(),
          memberId,
          content,
          timestamp: Date.now()
        };

        // 保存成员名称快照（用于成员离开后显示历史消息）
        if (memberName) {
          message.memberName = memberName;
        }

        message.type = msgType;

        if (msgType === MessageType.USER) {
          message.isUser = true;
        } else if (msgType === MessageType.INTRO) {
          message.isIntro = true;
        } else if (msgType === MessageType.TIP) {
          message.isTip = true;
          if (tipSubType) {
            message.tipSubType = tipSubType;
          }
          // 新增：ui, target, exclude 属性
          if (options.ui !== undefined) {
            message.ui = options.ui;
          }
          if (options.target && options.target.length > 0) {
            message.target = options.target;
          }
          if (options.exclude && options.exclude.length > 0) {
            message.exclude = options.exclude;
          }
        }

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
    if (!conversationId || typeof conversationId !== 'string') {
      console.error('[Background] getConversation 无效参数:', conversationId, typeof conversationId);
      return null;
    }

    const conversations = await StorageManager.getConversations();
    const found = conversations.find(c => c.id === conversationId) || null;

    if (!found) {
      console.error('[Background] getConversation 找不到会话:', conversationId);
    }

    return found;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

let tabManager;
let conversationManager;
let aiMessageManager;
let senderFactory;
let conversationMessageService;
let initResolve;
const initReady = new Promise(r => initResolve = r);
const pendingResponses = new Map();
const pollingIntervals = new Map();
let wsManager = null;

// 全局 storage 锁队列，防止并发修改
const storageOperationQueue = [];
let isProcessingStorage = false;

async function withStorageLock(operation) {
  return new Promise((resolve, reject) => {
    storageOperationQueue.push({ operation, resolve, reject });
    processStorageQueue();
  });
}

async function processStorageQueue() {
  if (isProcessingStorage || storageOperationQueue.length === 0) {
    return;
  }

  isProcessingStorage = true;
  const { operation, resolve, reject } = storageOperationQueue.shift();

  try {
    const result = await operation();
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    isProcessingStorage = false;
    // 处理队列中的下一个操作
    setTimeout(processStorageQueue, 0);
  }
}

// 新架构管理器
let promptManager;
let promptFolderManager;
let expertManager;
let flowManager;
let flowExecutor;
let flowTestRunner;
let teamManager;

async function init() {
  tabManager = new TabManager();
  conversationManager = new ConversationManager(tabManager);
  senderFactory = new SenderFactory(tabManager, pendingResponses);
  aiMessageManager = new AIMessageManager(tabManager, conversationManager, senderFactory);
  wsManager = new WebSocketManager(tabManager, pendingResponses);

  // 初始化新架构管理器
  expertManager = new ExpertManager();
  promptManager = new PromptManager();
  promptFolderManager = new PromptFolderManager();
  platformManager = new PlatformManager();
  await platformManager.initialize();
  flowManager = new FlowManager();
  flowExecutor = new FlowExecutor(tabManager, conversationManager, senderFactory, platformManager);
  teamManager = new TeamManager();
  flowTestRunner = new FlowTestRunner(conversationManager, senderFactory, flowExecutor);

  const floatWindowService = {
    addMessage: async (message) => {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          const isAIPlatform = tab.url && (
            tab.url.includes('deepseek.com') ||
            tab.url.includes('doubao.com') ||
            tab.url.includes('qianwen.com') ||
            tab.url.includes('moonshot.cn')
          );
          if (isAIPlatform) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'addMessage',
              message: message
            }).catch(() => {});
          }
        }
      } catch (error) {
        console.error('[FloatWindowService] 发送消息失败:', error);
      }
    }
  };

  progressTracker = new ProgressTracker();
  progressNotificationService = new ProgressNotificationService(floatWindowService);
  entityFactory = new EntityFactory(
    platformManager,
    senderFactory,
    flowExecutor,
    progressNotificationService
  );
  conversationMessageService = new ConversationMessageService(
    conversationManager,
    entityFactory,
    progressTracker,
    progressNotificationService,
    floatWindowService,
    tabManager,
    senderFactory
  );

  // 确保模型已导入
  const models = await platformManager.getAllModels();
  console.log('[Init] 已加载', models.length, '个模型');

  // 加载设置并连接 WebSocket
  const settings = await StorageManager.getSettings();
  if (settings.wsEnabled && settings.wsUrl) {
    wsManager.connect(settings.wsUrl);
  }

  // 迁移 prompts: 移除 category 字段，语义融入 tags
  try {
    const promptsResult = await chrome.storage.local.get('prompts');
    const prompts = promptsResult.prompts || [];
    let promptsMigrated = false;
    const categoryToTag = {
      'code': '编程',
      'writing': '写作',
      'translation': '翻译',
      'analysis': '分析',
      'creative': '创意'
    };
    for (const prompt of prompts) {
      if (prompt.category !== undefined) {
        const extraTag = categoryToTag[prompt.category];
        if (extraTag && !(prompt.tags || []).includes(extraTag)) {
          prompt.tags = [...(prompt.tags || []), extraTag];
        }
        delete prompt.category;
        promptsMigrated = true;
      }
    }
    if (promptsMigrated) {
      await chrome.storage.local.set({ prompts });
      console.log('[Init] 已迁移 prompts: 移除 category 字段');
    }
    await chrome.storage.local.remove('customCategories');
  } catch (e) {
    console.warn('[Init] 迁移 prompts category 失败:', e);
  }
  initResolve();
}

async function conversationOneShot(modelId, content, systemPrompt) {
  const model = await platformManager.getModelById(modelId);
  if (!model) throw new Error('模型不存在');

  const accessMethod = model.accessMethod || 'web';
  const sender = senderFactory.getSender(accessMethod);

  let response;
    const provider = model.code || model.provider;
    if (accessMethod === 'api') {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content });
      response = await sender.send(messages, {
        model: model.code,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey
      });
    } else {
      response = await sender.send(content, {
        model: model.code,
        webUrl: model.webUrl
      });
    }

  return {
    success: true,
    content: response.content,
    model: model.name,
    timestamp: Date.now()
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'aiChunk') {
    const pending = pendingResponses.get(request.messageId);

    if (pending && pending.onChunk) {
      pending.onChunk(request.content, request.fullContent);
    }

    sendResponse({ status: 'received' });
    return;
  }

  if (request.type === 'aiResponse') {
    const pending = pendingResponses.get(request.messageId);

    if (pending) {
      pendingResponses.delete(request.messageId);

      if (request.error) {
        pending.reject(new Error(request.error));
      } else {
        console.log(`[aiResponse] content script 返回 conversationUrl:`, request.conversationUrl);
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
            memberId: msg.memberId,
            content: msg.content
          }));

        const memberIds = conversation.members.map(m => m.id);
        console.log('[WS] 当前已响应成员数:', responses.length, '/', memberIds.length);

        const allResponded = memberIds.every(memberId =>
          conversation.messages.some((msg, index) =>
            !msg.isUser && msg.memberId === memberId && index > lastUserMessageIndex
          )
        );

        if (allResponded && responses.length > 0) {
          console.log('[WS] 所有成员已响应，发送响应给客户端');

          clearTimeout(wsRequest.timeout);
          wsManager.wsRequestQueue.delete(conversationId);
          stopPolling(conversationId);

          const conversation = await conversationManager.getConversation(conversationId);
          const combinedContent = await aiMessageManager.combineResponses(responses, conversation);

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
          console.log('[WS] 还有成员未响应，继续等待');
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
      console.log('[Background] 收到createConversation请求 - request.mode:', request.mode);
      conversationManager.createConversation(
        request.name,
        request.members || [],
        request.mode || 'brainstorming',
        {
          promptId: request.promptId,
          memberSettings: request.memberSettings,
          memberOrder: request.memberOrder,
          expertId: request.expertId
        }
      )
        .then(sendResponse);
      return true;

    case 'deleteConversation':
      conversationManager.deleteConversation(request.conversationId)
        .then(() => sendResponse({ success: true }));
      return true;

    case 'deletePlatformConversation':
      (async () => {
        try {
          const { conversationUrl } = request;
          if (!conversationUrl) {
            sendResponse({ error: '缺少 conversationUrl 参数' });
            return;
          }
          await aiMessageManager.deletePlatformConversation(conversationUrl);
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Background] 删除平台会话失败:', error.message);
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'updateConversation':
      (async () => {
        try {
          const { conversationId, updates } = request;
          // 支持modelIds，同时更新memberIds以保持兼容
          if (updates.modelIds) {
            updates.memberIds = updates.modelIds;
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
          const savedMemberUrls = conversation?.memberUrls ? { ...conversation.memberUrls } : {};

          const result = await aiMessageManager.conversationManager.clearConversationMessages(request.conversationId);
          sendResponse({ success: true, conversation: result, memberUrls: savedMemberUrls });
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'clearConversationPlatform':
      (async () => {
        try {
          const conversation = await conversationManager.getConversation(request.conversationId);
          const memberUrls = request.memberUrls || conversation.memberUrls || {};
          const deletedConversations = [];

          if (Object.keys(memberUrls).length > 0) {
            for (const [memberId, conversationUrl] of Object.entries(memberUrls)) {
              const member = conversation.members.find(m => m.id === memberId);
              if (!member || !conversationUrl) continue;
              const providerKey = member.modelCode || member.provider;
              try {
                await aiMessageManager.deletePlatformConversation(conversationUrl);
                deletedConversations.push({ url: conversationUrl });
              } catch (error) {
                console.error(`[AIMessageManager] ❌ ${providerKey} 平台会话删除失败:`, error.message);
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

    case 'startLoopDiscussion':
      (async () => {
        try {
          const { problemDesc, maxIterations } = request;
          const conversationId = request.conversationId;

          console.log(`[Background] 启动多轮讨论: ${problemDesc || '(继续当前讨论)'}, 最多 ${maxIterations} 轮`);

          const conversation = await conversationManager.getConversation(conversationId);

          if (!conversation || conversation.members.length === 0) {
            throw new Error('请先添加成员');
          }

          const hasUserMessages = conversation.messages && conversation.messages.some(msg => msg.type === MessageType.USER);

          if (!problemDesc && !hasUserMessages) {
            throw new Error('当前会话中没有用户消息，请提供问题描述');
          }

          sendResponse({
            success: true,
            message: problemDesc ? `多轮讨论已启动：${problemDesc}` : '多轮讨论已启动'
          });

          if (problemDesc) {
            console.log(`[Background] 发送用户问题: ${problemDesc}`);
            const userMsg = await conversationManager.addMessage(conversationId, null, problemDesc, MessageType.USER);
            conversation.messages.push(userMsg);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // 将 loop 执行逻辑封装为任务，通过队列协调执行
          const loopTask = {
            execute: async (workerContext) => {
              try {
                // 发送开始执行的 tip 消息
                const startTipContent = problemDesc
                  ? `🔄 多轮讨论已启动：${problemDesc}（${maxIterations} 轮）`
                  : `🔄 多轮讨论已启动（${maxIterations} 轮）`;
                await conversationManager.addMessage(conversationId, null, startTipContent, MessageType.TIP);

                const conv = await conversationManager.getConversation(conversationId);
                const context = new ConversationContext(conv);
                const entities = await entityFactory.createEntitiesFromConversation(conv);

                for (let round = 1; round <= maxIterations; round++) {
                  // 检查是否应该停止
                  if (workerContext && !workerContext.isRunning()) {
                    console.log(`[Background] loopTask 被中断，第 ${round} 轮`);
                    break;
                  }

                  console.log(`[Background] ========== 第 ${round} 轮开始 ==========`);

                  // 发送轮次进度消息到 chat
                  chrome.runtime.sendMessage({
                    type: 'loopDiscussionProgress',
                    conversationId,
                    currentRound: round,
                    totalRounds: maxIterations
                  });

                  for (const entity of entities) {
                    // 检查是否应该停止
                    if (workerContext && !workerContext.isRunning()) {
                      console.log(`[Background] loopTask 被中断`);
                      break;
                    }

                    console.log(`[Background] 触发成员 ${entity.name} 发送消息`);
                    try {
                      const result = await entity.execute('INLOOP', context);

                      if (result.success && result.content) {
                        const message = await conversationManager.addMessage(
                          conversationId,
                          result.memberId,
                          result.content
                        );

                        if (message && message.id) {
                          context.memberLastMessageIds[result.memberId] = message.id;
                          conv.messages.push(message);
                          await conversationManager.updateConversation(conversationId, {
                            memberLastMessageIds: context.memberLastMessageIds
                          });
                        }
                      }

                      await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (error) {
                      console.error(`[Background] 成员 ${entity.name} 发送消息失败:`, error);
                    }
                  }

                  console.log(`[Background] ========== 第 ${round} 轮完成 ==========`);

                  if (round < maxIterations) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                  }
                }

                console.log(`[Background] ========== 多轮讨论完成（共 ${maxIterations} 轮）==========`);

                // 发送完成的 tip 消息
                const completeTipContent = `✅ 多轮讨论已完成（共 ${maxIterations} 轮）`;
                await conversationManager.addMessage(conversationId, null, completeTipContent, MessageType.TIP);

                chrome.runtime.sendMessage({
                  type: 'loopDiscussionComplete',
                  conversationId,
                  success: true,
                  rounds: maxIterations
                });
              } catch (error) {
                console.error('[Background] loopTask 执行异常:', error);
                // 发送失败通知给前端
                chrome.runtime.sendMessage({
                  type: 'loopDiscussionComplete',
                  conversationId,
                  success: false,
                  error: error.message
                });
              }
            }
          };

          // 通过队列系统设置 loopTask，等待当前队列处理完毕后自动执行
          await conversationMessageService.setLoopTask(conversationId, loopTask);

        } catch (error) {
          console.error('[Background] 启动多轮讨论失败:', error);
          sendResponse({
            success: false,
            error: error.message
          });

          chrome.runtime.sendMessage({
            type: 'loopDiscussionComplete',
            conversationId,
            success: false,
            error: error.message
          });
        }
      })();
      return true;

    case 'addMessage':
      (async () => {
        try {
          await initReady;
          const result = await aiMessageManager.processUserMessage(request.conversationId, request.content);
          sendResponse(result);
        } catch (error) {
          console.error('addMessage失败:', error);
          try {
            const conversation = await aiMessageManager.conversationManager.getConversation(request.conversationId);
            sendResponse(conversation);
          } catch {
            sendResponse({ error: error.message });
          }
        }
      })();
      return true;

    case 'addMessageDirect':
      conversationManager.addMessage(
        request.conversationId,
        request.memberId,
        request.content,
        request.msgType,
        request.tipSubType,
        {
          ui: request.ui,
          target: request.target,
          exclude: request.exclude
        }
      )
        .then(message => {
          return conversationManager.getConversation(request.conversationId);
        })
        .then(conversation => sendResponse(conversation))
        .catch(error => {
          console.error('addMessageDirect失败:', error);
          sendResponse({ error: error.message });
        });
      return true;

    case 'getMemberStatus':
      (async () => {
        try {
          const worker = conversationMessageService.getWorker(request.conversationId);
          if (worker) {
            const status = worker.getMemberStatus(request.memberId);
            sendResponse({ success: true, status });
          } else {
            sendResponse({ success: true, status: null });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'setMemberStatus':
      (async () => {
        try {
          const worker = conversationMessageService.getWorker(request.conversationId);
          if (worker) {
            worker.updateMemberStatus(request.memberId, request.status);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Worker不存在' });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'getConversations':
      StorageManager.getConversations().then(sendResponse);
      return true;

    case 'getConversation':
      conversationManager.getConversation(request.conversationId)
        .then(sendResponse);
      return true;

    case 'updateSettings':
      (async () => {
        try {
          const oldSettings = await StorageManager.getSettings();
          await StorageManager.saveSettings(request.settings);

          // 处理 WebSocket 连接
          if (wsManager) {
            if (request.settings.wsEnabled && !oldSettings.wsEnabled) {
              wsManager.connect(request.settings.wsUrl);
            } else if (!request.settings.wsEnabled && oldSettings.wsEnabled) {
              wsManager.disconnect();
            } else if (request.settings.wsUrl !== oldSettings.wsUrl && request.settings.wsEnabled) {
              wsManager.disconnect();
              setTimeout(() => wsManager.connect(request.settings.wsUrl), 500);
            }
          }

          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'activatePlatformTab':
      tabManager.activatePlatformTab(request.targetUrl)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getSettings':
      StorageManager.getSettings().then(sendResponse);
      return true;

    case 'getWSStatus':
      sendResponse({
        connected: wsManager ? wsManager.connected : false,
        status: wsManager ? (wsManager.connected ? 'connected' : 'disconnected') : 'disabled'
      });
      return false;

    // ========== 新架构：提示词管理 ==========
    case 'getPrompts':
      promptManager.getPrompts().then(sendResponse);
      return true;

    case 'initializeBuiltinPrompts':
      initializeBuiltinPrompts().then(() => sendResponse({ success: true }));
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
      platformManager.getAllModels().then(sendResponse);
      return true;

    case 'getEnabledModels':
      platformManager.getAllModels().then(models => models.filter(m => m.enabled)).then(sendResponse);
      return true;

    // ========== 新架构：平台管理 ==========
    case 'getPlatforms':
      platformManager.getPlatforms().then(async (platforms) => {
        if (platforms.length === 0) {
          await platformManager.initialize();
          platforms = await platformManager.getPlatforms();
        }
        sendResponse({ success: true, data: platforms });
      });
      return true;

    case 'getPlatform':
      platformManager.getPlatform(request.platformId).then(platform => sendResponse({ success: true, platform }));
      return true;

    case 'createPlatform':
      platformManager.createPlatform(request.data).then(platform => sendResponse({ success: true, platform })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updatePlatform':
      platformManager.updatePlatform(request.platformId, request.data).then(platform => sendResponse({ success: true, platform })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deletePlatform':
      platformManager.deletePlatform(request.platformId).then(() => sendResponse({ success: true })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'addModel':
      platformManager.addModel(request.platformId, request.data).then(model => sendResponse({ success: true, model })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateModel':
      platformManager.updateModel(request.platformId, request.modelId, request.data).then(model => sendResponse({ success: true, model })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteModel':
      platformManager.deleteModel(request.platformId, request.modelId).then(() => sendResponse({ success: true })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'toggleModelEnabled':
      platformManager.toggleModelEnabled(request.platformId, request.modelId).then(model => sendResponse({ success: true, model })).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getAllModels':
      platformManager.getAllModels().then(sendResponse);
      return true;

    case 'getModelById':
      platformManager.getModelById(request.modelId).then(sendResponse);
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

    case 'saveFlow':
      (async () => {
        try {
          let result;
          if (request.flow.id) {
            result = await flowManager.updateFlow(request.flow.id, request.flow);
          } else {
            result = await flowManager.createFlow(request.flow);
          }
          sendResponse(result);
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'getFlow':
      flowManager.getFlowById(request.flowId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    // ========== 新架构：团队管理 ==========
    case 'getTeams':
      teamManager.getTeams().then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getTeam':
      teamManager.getTeam(request.teamId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getTeamWithMembers':
      teamManager.getTeamWithMembers(request.teamId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'createTeam':
      teamManager.createTeam(request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateTeam':
      teamManager.updateTeam(request.teamId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'deleteTeam':
      teamManager.deleteTeam(request.teamId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'searchTeams':
      teamManager.searchTeams(request.keyword).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'getModel':
      platformManager.getModelById(request.modelId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'openFlowDesigner':
      (async () => {
        try {
          const url = request.expertId 
            ? `flow-designer/flow-designer.html?expertId=${encodeURIComponent(request.expertId)}`
            : `flow-designer/flow-designer.html?modelId=${encodeURIComponent(request.modelId)}`;
          
          const tab = await chrome.tabs.create({
            url: chrome.runtime.getURL(url),
            pinned: false
          });
          
          sendResponse({ success: true, tabId: tab.id });
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    // ========== 新架构：流程执行 ==========
    case 'executeFlow':
      (async () => {
        try {
          const flow = request.flow;
          if (!flow || !flow.nodes || flow.nodes.length === 0) {
            throw new Error('流程不存在或格式错误');
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

    case 'executeSingleNode':
      (async () => {
        try {
          const result = await flowExecutor.executeSingleNode(
            request.node,
            request.inputs || {}
          );

          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'resumeFlow':
      (async () => {
        try {
          const conversationId = request.conversationId;
          const conversation = await conversationManager.getConversation(conversationId);
          if (!conversation || !conversation.pendingResume) {
            throw new Error('没有可恢复的执行状态');
          }

          const resumeState = conversation.pendingResume;

          // 确保 context 中包含必要的 conversationId 和 memberId
          if (!resumeState.context) {
            resumeState.context = {};
          }
          resumeState.context.conversationId = conversationId;
          resumeState.context.memberId = conversation.expertId;

          chrome.runtime.sendMessage({
            type: 'flowExecutionProgress',
            conversationId,
            progress: { current: 0, total: 0, status: 'started', nodeName: '恢复执行...' }
          }).catch(() => {});

          resumeState.context.onProgress = (progress) => {
            chrome.runtime.sendMessage({
              type: 'flowExecutionProgress',
              conversationId,
              progress
            }).catch(() => {});
          };

          const result = await flowExecutor.resumeFlow(resumeState);

          if (result.success) {
            await conversationManager.updateConversation(conversationId, {
              pendingResume: null
            });
            const entityId = conversation.expertId;
            const content = result.content || '未能获取答案';

            const message = await conversationManager.addMessage(conversationId, entityId, content);
            if (message && message.id) {
              await conversationManager.updateConversation(conversationId, {
                memberLastMessageIds: { [entityId]: message.id }
              });
            }

            chrome.runtime.sendMessage({
              type: 'flowExecutionComplete',
              conversationId
            }).catch(() => {});

            sendResponse({ success: true, conversation: await conversationManager.getConversation(conversationId) });
          } else if (result.canResume) {
            await conversationManager.updateConversation(conversationId, {
              pendingResume: result.resumeInfo
            });

            chrome.runtime.sendMessage({
              type: 'flowExecutionError',
              conversationId,
              error: result.error,
              canResume: true,
              failedNodeName: result.resumeInfo.failedNodeName,
              completedNodeIds: result.resumeInfo.completedNodeIds
            }).catch(() => {});

            sendResponse({ success: false, error: result.error, canResume: true });
          } else {
            throw new Error(result.error || '恢复执行失败');
          }
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

    // ========== 新架构：专家管理 ==========
    case 'getExperts':
      (async () => {
        let experts = await expertManager.getExperts();
        if (!experts || experts.length === 0) {
          await initializeBuiltinExperts();
          experts = await expertManager.getExperts();
        }
        sendResponse(experts);
      })();
      return true;

    case 'getExpertById':
      expertManager.getExpertById(request.expertId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'createExpert':
      expertManager.createExpert(request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'updateExpert':
      expertManager.updateExpert(request.expertId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'initializeBuiltinExperts':
      initializeBuiltinExperts().then(() => sendResponse({ success: true }));
      return true;

    case 'deleteExpert':
      expertManager.deleteExpert(request.expertId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'duplicateExpert':
      expertManager.duplicateExpert(request.expertId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'searchExperts':
      expertManager.searchExperts(request.keyword).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'expertAddNode':
      expertManager.addNode(request.expertId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'expertUpdateNode':
      expertManager.updateNode(request.expertId, request.nodeId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'expertDeleteNode':
      expertManager.deleteNode(request.expertId, request.nodeId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'expertAddConnection':
      expertManager.addConnection(request.expertId, request.data).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'expertDeleteConnection':
      expertManager.deleteConnection(request.expertId, request.connectionId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
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
      (async () => {
        try {
          const sender = senderFactory.getSender('web');
          const response = await sender.send('测试连接');
          sendResponse({
            success: true,
            info: {
              platform: request.platform,
              response: response.content,
              length: response.content ? response.content.length : 0
            }
          });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'openPlatformConversation':
      (async () => {
        try {
          let targetUrl = request.targetUrl || null;
          if (!targetUrl && request.conversationId && request.memberId) {
            const conversation = await conversationManager.getConversation(request.conversationId);
            targetUrl = conversation?.memberUrls?.[request.memberId] || null;
          }
          const result = await tabManager.openPlatformConversation(targetUrl);
          sendResponse(result);
        } catch (error) {
          sendResponse({ error: error.message });
        }
      })();
      return true;

    case 'conversationOneShot':
      conversationOneShot(request.modelId, request.content, request.systemPrompt)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'testRunFlow':
      (async () => {
        try {
          if (!flowTestRunner) {
            throw new Error('流程测试运行器未初始化，请稍后再试');
          }
          const { flowData, startNodeInputs } = request;
          
          const onProgress = (progress) => {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: 'flowTestProgress',
              progress
            }).catch(() => {});
          };

          const result = await flowTestRunner.testRunFlow(flowData, startNodeInputs, onProgress);
          sendResponse({ success: true, result });
        } catch (error) {
          console.error('[Background] testRunFlow 失败:', error);
          sendResponse({ success: false, error: error.message });
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

      const sendMode = conversation.sendMode || 'parallel';
      let pendingMemberIds = [];

      if (sendMode === 'parallel' || sendMode === 'random') {
        const lastUserMessage = [...conversation.messages].reverse().find(m => m.isUser);
        if (!lastUserMessage) {
          console.log('[Background] 没有用户消息，停止轮询');
          stopPolling(conversationId);
          return;
        }

        const lastUserMessageIndex = conversation.messages.findIndex(m => m.id === lastUserMessage.id);

        conversation.members.forEach(member => {
          const hasResponse = conversation.messages.some((msg, index) =>
            !msg.isUser &&
            msg.memberId === member.id &&
            index > lastUserMessageIndex
          );
          if (!hasResponse) {
            pendingMemberIds.push(member.id);
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

        const memberOrder = conversation.memberOrder || conversation.members.map(m => m.id);
        for (const memberId of memberOrder) {
          const hasResponse = conversation.messages.some((msg, index) =>
            !msg.isUser &&
            msg.memberId === memberId &&
            index > lastUserMessageIndex
          );

          if (!hasResponse) {
            pendingMemberIds = memberOrder.slice(memberOrder.indexOf(memberId));
            break;
          }
        }
      }

      if (pendingMemberIds.length === 0) {
        console.log('[Background] 所有成员已响应完成，停止轮询');
        stopPolling(conversationId);
        return;
      }

      const models = await platformManager.getAllModels();
      const webPendingMemberIds = pendingMemberIds.filter(memberId => {
        const member = conversation.members.find(m => m.id === memberId);
        if (!member) return false;
        // 新架构：直接使用 accessMethod 字段判断
        const modelConfig = member.modelId
          ? models.find(m => m.id === member.modelId)
          : null;
        return (member.accessMethod || modelConfig?.accessMethod || 'web') === 'web';
      });

      if (webPendingMemberIds.length === 0) {
        console.log('[Background] 剩余未响应成员均为 API 模式，停止轮询');
        stopPolling(conversationId);
        return;
      }

      console.log(`[Background] 检测到 ${webPendingMemberIds.length} 个未响应 Web 成员`);

      const browserInfo = await getBrowserInfo();
      console.log(`[Background] 浏览器: ${browserInfo.name}, 待处理成员: ${webPendingMemberIds.map(id => members.find(r => r.id === id)?.name).join(', ')}`);

      for (const memberId of webPendingMemberIds) {
        const member = members.find(r => r.id === memberId);
        if (!member) continue;
        // 新架构：web 模型的 modelCode 就是 providerId
        const providerKey = member.modelCode || member.provider;
        const baseUrl = member.webUrl || '';
        const memberUrl = conversation.memberUrls?.[memberId];
        const isBaseUrl = !memberUrl || memberUrl === baseUrl;

        try {
          console.log(`[Background] 检查成员 ${member.name} 标签页状态`);
          let targetTab = null;

          if (isBaseUrl) {
            const tabId = conversation.memberTabIds?.[memberId];
            if (tabId) {
              try {
                await chrome.tabs.get(tabId);
                targetTab = { id: tabId };
              } catch {
                console.log(`[Background] tab ${tabId} 已关闭`);
              }
            }
          } else {
            targetTab = await tabManager.findTabByUrl(memberUrl);
          }

          if (!targetTab) {
            console.log(`[Background] 未找到标签页: member: ${member.name}, url=${memberUrl}, providerKey: ${providerKey}`);
          }
        } catch (error) {
          console.error(`[Background] 检查 ${member.name} 标签页失败`, error);
        }
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
    await chrome.tabs.create({
      url: chrome.runtime.getURL('chat/chat.html')
    });
  });
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const conversations = await StorageManager.getConversations();
    let changed = false;
    for (const conv of conversations) {
      if (conv.memberTabIds) {
        for (const [rid, tid] of Object.entries(conv.memberTabIds)) {
          if (tid === tabId) {
            delete conv.memberTabIds[rid];
            changed = true;
          }
        }
      }
    }
    if (changed) {
      await StorageManager.saveConversations(conversations);
    }
  } catch (error) {
    console.error('[Background] 清理 memberTabIds 失败:', error);
  }
});

// 内置提示词定义
const BUILTIN_PROMPTS = [
  {
    id: 'builtin-code-review',
    name: '代码审查',
    content: '请审查以下代码，重点关注：\n1. 代码质量和可读性\n2. 潜在的 bug 和边界情况\n3. 性能优化机会\n4. 安全性问题\n5. 最佳实践建议\n\n请提供具体的改进建议，并说明理由。',
    tags: ['代码审查', '质量', '编程'],
    isBuiltin: true
  },
  {
    id: 'builtin-writing-polish',
    name: '文章润色',
    content: '请帮我润色以下文本，使其更加清晰、准确、流畅。保持原意不变，优化表达方式和逻辑结构。提供修改前后的对比说明。',
    tags: ['润色', '编辑', '写作'],
    isBuiltin: true
  },
  {
    id: 'builtin-translation',
    name: '专业翻译',
    content: '请将以下文本翻译成目标语言，确保：\n1. 准确传达原意\n2. 符合目标语言的表达习惯\n3. 保持原文的语气和风格\n4. 专业术语准确\n\n如有歧义，请提供多种翻译选项并说明差异。',
    tags: ['翻译', '多语言'],
    isBuiltin: true
  },
  {
    id: 'builtin-analysis',
    name: '逻辑分析',
    content: '请对以下内容进行深入分析：\n1. 核心观点和论据\n2. 逻辑结构和推理过程\n3. 潜在的假设和偏见\n4. 优势和不足\n5. 改进建议\n\n提供客观、结构化的分析结果。',
    tags: ['分析', '逻辑'],
    isBuiltin: true
  },
  {
    id: 'builtin-creative',
    name: '创意写作',
    content: '请基于以下主题进行创意写作。要求：\n1. 构思新颖，视角独特\n2. 情节或观点引人入胜\n3. 语言生动，富有感染力\n4. 结构完整，逻辑自洽\n\n发挥创造力，打破常规思维。',
    tags: ['创意', '写作'],
    isBuiltin: true
  },
  {
    id: 'builtin-problem-solving',
    name: '问题解决',
    content: '请帮我分析并解决以下问题。步骤：\n1. 明确问题本质和目标\n2. 分析根本原因\n3. 提出多个解决方案\n4. 评估各方案的优劣\n5. 给出最佳方案和实施步骤\n\n请提供系统性的解决方案。',
    tags: ['问题解决', '方法论'],
    isBuiltin: true
  }
];

// 初始化内置提示词
async function initializeBuiltinPrompts() {
  try {
    const existingPrompts = await promptManager.getPrompts();
    const existingBuiltinIds = existingPrompts.filter(p => p.isBuiltin).map(p => p.id);
    
    // 只添加不存在的内置提示词
    for (const builtin of BUILTIN_PROMPTS) {
      if (!existingBuiltinIds.includes(builtin.id)) {
        await promptManager.createPrompt(builtin);
        console.log('[Background] 初始化内置提示词:', builtin.name);
      }
    }
  } catch (error) {
    console.error('[Background] 初始化内置提示词失败:', error);
  }
}

const BUILTIN_EXPERTS = [
  {
    name: '代码审查专家',
    description: '多角度审查代码，分别从安全和性能两个维度独立分析，最后汇总给出完整改进方案',
    icon: '🔍',
    nodes: [
      { id: 'start', type: '1', position: { x: 80, y: 300 }, data: { title: '开始', description: '流程的起始点', outputs: [{ key: 'user_input', name: 'input', type: 'string' }], nodeMeta: { title: '开始', description: '流程的起始点', icon: '/nodes/start.svg', mainColor: '#52C41A' } } },
      { id: 'node-analyze', type: '3', position: { x: 320, y: 300 }, data: { title: '需求分析', description: '分析代码深层问题', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'input', input: { type: 'ref', content: { source: 'block-output', blockID: 'start', name: 'input' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位资深技术分析师。', prompt: '请分析以下代码，找出其中存在的深层问题：\n1. 代码的核心逻辑是什么\n2. 存在哪些安全隐患、性能瓶颈、设计缺陷\n3. 哪些地方需要优先改进\n\n代码：\n{{input}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'analysis', type: 'string' }], nodeMeta: { title: '需求分析', description: '分析代码深层问题', icon: '/nodes/llm.svg', mainColor: '#1890FF' } } },
      { id: 'node-security', type: '3', position: { x: 580, y: 160 }, data: { title: '安全审查', description: '从安全角度审查', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'analysis', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-analyze', name: 'analysis' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位安全专家，专注于代码安全审计。', prompt: '基于以下代码分析结果，从安全角度给出详细审查报告和修复方案：\n\n{{analysis}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'security_report', type: 'string' }], nodeMeta: { title: '安全审查', description: '从安全角度审查', icon: '/nodes/llm.svg', mainColor: '#F5222D' } } },
      { id: 'node-perf', type: '3', position: { x: 580, y: 440 }, data: { title: '性能审查', description: '从性能角度审查', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'analysis', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-analyze', name: 'analysis' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位性能优化专家，专注于代码质量和运行效率。', prompt: '基于以下代码分析结果，从性能和质量角度给出详细审查报告和优化方案：\n\n{{analysis}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'perf_report', type: 'string' }], nodeMeta: { title: '性能审查', description: '从性能角度审查', icon: '/nodes/llm.svg', mainColor: '#FA8C16' } } },
      { id: 'node-summary', type: '3', position: { x: 840, y: 300 }, data: { title: '汇总建议', description: '汇总审查结果', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'security_report', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-security', name: 'security_report' } } }, { name: 'perf_report', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-perf', name: 'perf_report' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位技术总监，擅长整合多方审查意见，输出清晰可执行的改进方案。', prompt: '请整合以下两份审查报告，输出一份完整的代码改进方案，按优先级排列：\n\n【安全审查报告】\n{{security_report}}\n\n【性能审查报告】\n{{perf_report}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'summary', type: 'string' }], nodeMeta: { title: '汇总建议', description: '汇总审查结果', icon: '/nodes/llm.svg', mainColor: '#52C41A' } } },
      { id: 'end', type: '2', position: { x: 1100, y: 300 }, data: { title: '结束', description: '流程的终止点', inputs: { terminatePlan: 'return_variables', content: { type: 'literal', content: '{{summary}}' }, inputParameters: [{ name: 'summary', type: 'string', value: { type: 'ref', content: { source: 'block-output', blockID: 'node-summary', name: 'summary' } } }], streamingOutput: false }, nodeMeta: { title: '结束', description: '流程的终止点', icon: '/nodes/end.svg', mainColor: '#FF4D4F' } } }
    ],
    connections: [
      { id: 'c1', source: 'start', target: 'node-analyze' },
      { id: 'c2', source: 'node-analyze', target: 'node-security' },
      { id: 'c3', source: 'node-analyze', target: 'node-perf' },
      { id: 'c4', source: 'node-security', target: 'node-summary' },
      { id: 'c5', source: 'node-perf', target: 'node-summary' },
      { id: 'c6', source: 'node-summary', target: 'end' }
    ],
    isBuiltin: true
  },
  {
    name: '问题分析专家',
    description: '深入分析问题根因，从创新思维和系统思维两个角度独立提出方案，最终汇总为最优解',
    icon: '🎯',
    nodes: [
      { id: 'start', type: '1', position: { x: 80, y: 300 }, data: { title: '开始', description: '流程的起始点', outputs: [{ key: 'user_input', name: 'input', type: 'string' }], nodeMeta: { title: '开始', description: '流程的起始点', icon: '/nodes/start.svg', mainColor: '#52C41A' } } },
      { id: 'node-analyze', type: '3', position: { x: 320, y: 300 }, data: { title: '根因分析', description: '挖掘问题深层需求', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'input', input: { type: 'ref', content: { source: 'block-output', blockID: 'start', name: 'input' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位问题分析专家，擅长挖掘表面问题背后的深层需求。', prompt: '请深入分析以下问题：\n1. 表面问题是什么\n2. 背后的深层需求和根本原因\n3. 利益相关者是谁，各自的诉求\n4. 约束条件和可用资源\n\n问题：{{input}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'analysis', type: 'string' }], nodeMeta: { title: '根因分析', description: '挖掘问题深层需求', icon: '/nodes/llm.svg', mainColor: '#1890FF' } } },
      { id: 'node-creative', type: '3', position: { x: 580, y: 160 }, data: { title: '创新方案', description: '跳出框架思考', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'analysis', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-analyze', name: 'analysis' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位创新思维专家，擅长跳出常规框架，提出有创造力的解决方案。', prompt: '基于以下问题分析，请从创新和突破性思维角度提出解决方案，不要受限于传统做法：\n\n{{analysis}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'creative_plan', type: 'string' }], nodeMeta: { title: '创新方案', description: '跳出框架思考', icon: '/nodes/llm.svg', mainColor: '#722ED1' } } },
      { id: 'node-systematic', type: '3', position: { x: 580, y: 440 }, data: { title: '系统方案', description: '系统性结构化方案', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'analysis', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-analyze', name: 'analysis' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位系统工程师，擅长用结构化、系统化的方法解决问题。', prompt: '基于以下问题分析，请从系统性和可落地角度提出解决方案，包含具体的实施步骤和资源规划：\n\n{{analysis}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'systematic_plan', type: 'string' }], nodeMeta: { title: '系统方案', description: '系统性结构化方案', icon: '/nodes/llm.svg', mainColor: '#13C2C2' } } },
      { id: 'node-summary', type: '3', position: { x: 840, y: 300 }, data: { title: '最优方案', description: '汇总并择优', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'creative_plan', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-creative', name: 'creative_plan' } } }, { name: 'systematic_plan', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-systematic', name: 'systematic_plan' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位决策顾问，擅长整合不同视角的方案，给出最优推荐。', prompt: '请整合以下两份方案，对比优劣，给出最终推荐方案和实施路线图：\n\n【创新方案】\n{{creative_plan}}\n\n【系统方案】\n{{systematic_plan}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'summary', type: 'string' }], nodeMeta: { title: '最优方案', description: '汇总并择优', icon: '/nodes/llm.svg', mainColor: '#52C41A' } } },
      { id: 'end', type: '2', position: { x: 1100, y: 300 }, data: { title: '结束', description: '流程的终止点', inputs: { terminatePlan: 'return_variables', content: { type: 'literal', content: '{{summary}}' }, inputParameters: [{ name: 'summary', type: 'string', value: { type: 'ref', content: { source: 'block-output', blockID: 'node-summary', name: 'summary' } } }], streamingOutput: false }, nodeMeta: { title: '结束', description: '流程的终止点', icon: '/nodes/end.svg', mainColor: '#FF4D4F' } } }
    ],
    connections: [
      { id: 'c1', source: 'start', target: 'node-analyze' },
      { id: 'c2', source: 'node-analyze', target: 'node-creative' },
      { id: 'c3', source: 'node-analyze', target: 'node-systematic' },
      { id: 'c4', source: 'node-creative', target: 'node-summary' },
      { id: 'c5', source: 'node-systematic', target: 'node-summary' },
      { id: 'c6', source: 'node-summary', target: 'end' }
    ],
    isBuiltin: true
  },
  {
    name: '技术方案专家',
    description: '分析技术需求，从架构简约派和工程实用派两个角度设计方案，汇总输出最优技术路线',
    icon: '🏗️',
    nodes: [
      { id: 'start', type: '1', position: { x: 80, y: 300 }, data: { title: '开始', description: '流程的起始点', outputs: [{ key: 'user_input', name: 'input', type: 'string' }], nodeMeta: { title: '开始', description: '流程的起始点', icon: '/nodes/start.svg', mainColor: '#52C41A' } } },
      { id: 'node-analyze', type: '3', position: { x: 320, y: 300 }, data: { title: '需求拆解', description: '拆解技术需求', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'input', input: { type: 'ref', content: { source: 'block-output', blockID: 'start', name: 'input' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位技术需求分析师。', prompt: '请拆解以下技术需求：\n1. 核心功能需求\n2. 非功能性需求（性能、安全、可扩展性）\n3. 技术约束和依赖\n4. 关键技术决策点\n\n需求：{{input}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'analysis', type: 'string' }], nodeMeta: { title: '需求拆解', description: '拆解技术需求', icon: '/nodes/llm.svg', mainColor: '#1890FF' } } },
      { id: 'node-minimal', type: '3', position: { x: 580, y: 160 }, data: { title: '简约架构方案', description: '极简主义架构', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'analysis', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-analyze', name: 'analysis' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位崇尚简约的架构师，信奉"大道至简"，优先选择最简单的技术方案。', prompt: '基于以下需求分析，设计一个尽量简约的技术方案：用最少的技术栈、最少的组件、最少的代码量来满足需求。给出架构图描述和核心接口设计。\n\n{{analysis}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'minimal_plan', type: 'string' }], nodeMeta: { title: '简约架构方案', description: '极简主义架构', icon: '/nodes/llm.svg', mainColor: '#EB2F96' } } },
      { id: 'node-practical', type: '3', position: { x: 580, y: 440 }, data: { title: '工程实战方案', description: '生产级工程方案', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'analysis', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-analyze', name: 'analysis' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位资深工程架构师，注重系统的可维护性、可观测性和生产级可靠性。', prompt: '基于以下需求分析，设计一个生产级的技术方案：包含完整的数据模型、接口设计、部署架构、监控告警、灰度发布策略。\n\n{{analysis}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'practical_plan', type: 'string' }], nodeMeta: { title: '工程实战方案', description: '生产级工程方案', icon: '/nodes/llm.svg', mainColor: '#FA541C' } } },
      { id: 'node-summary', type: '3', position: { x: 840, y: 300 }, data: { title: '方案整合', description: '整合最优路线', batchMode: 'single', model: {}, $$input_decorator$$: { inputParameters: [{ name: 'minimal_plan', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-minimal', name: 'minimal_plan' } } }, { name: 'practical_plan', input: { type: 'ref', content: { source: 'block-output', blockID: 'node-practical', name: 'practical_plan' } } }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } }, $$prompt_decorator$$: { systemPrompt: '你是一位CTO，擅长在简约和完备之间找到平衡点。', prompt: '请整合以下两个方案，取各自优点，给出最终推荐的技术路线和分阶段实施计划：\n\n【简约方案】\n{{minimal_plan}}\n\n【工程方案】\n{{practical_plan}}' }, batch: { batchSize: 10 }, fcParam: [], outputs: [{ key: 'output', name: 'summary', type: 'string' }], nodeMeta: { title: '方案整合', description: '整合最优路线', icon: '/nodes/llm.svg', mainColor: '#52C41A' } } },
      { id: 'end', type: '2', position: { x: 1100, y: 300 }, data: { title: '结束', description: '流程的终止点', inputs: { terminatePlan: 'return_variables', content: { type: 'literal', content: '{{summary}}' }, inputParameters: [{ name: 'summary', type: 'string', value: { type: 'ref', content: { source: 'block-output', blockID: 'node-summary', name: 'summary' } } }], streamingOutput: false }, nodeMeta: { title: '结束', description: '流程的终止点', icon: '/nodes/end.svg', mainColor: '#FF4D4F' } } }
    ],
    connections: [
      { id: 'c1', source: 'start', target: 'node-analyze' },
      { id: 'c2', source: 'node-analyze', target: 'node-minimal' },
      { id: 'c3', source: 'node-analyze', target: 'node-practical' },
      { id: 'c4', source: 'node-minimal', target: 'node-summary' },
      { id: 'c5', source: 'node-practical', target: 'node-summary' },
      { id: 'c6', source: 'node-summary', target: 'end' }
    ],
    isBuiltin: true
  }
];

async function initializeBuiltinExperts() {
  try {
    const existingExperts = await expertManager.getExperts();
    const existingBuiltin = existingExperts.filter(e => e.isBuiltin);

    const validBuiltinNames = new Set(BUILTIN_EXPERTS.map(b => b.name));
    const invalidExperts = existingBuiltin.filter(e => !validBuiltinNames.has(e.name));
    for (const invalid of invalidExperts) {
      await expertManager.deleteExpert(invalid.id);
      console.log('[Background] 清理旧版内置专家:', invalid.name);
    }

    const currentBuiltinNames = (invalidExperts.length > 0
      ? await expertManager.getExperts()
      : existingExperts).filter(e => e.isBuiltin).map(e => e.name);

    if (currentBuiltinNames.length >= BUILTIN_EXPERTS.length) {
      return;
    }

    const models = await platformManager.getAllModels();
    const available = models.filter(m => m.enabled !== false);
    if (available.length === 0) {
      console.log('[Background] 暂无可用模型，跳过内置专家初始化');
      return;
    }

    for (const builtin of BUILTIN_EXPERTS) {
      if (!currentBuiltinNames.includes(builtin.name)) {
        const expertData = JSON.parse(JSON.stringify(builtin));
        let llmIndex = 0;
        expertData.nodes = expertData.nodes.map(node => {
          if (node.type === '3' && node.data) {
            const model = available[llmIndex % available.length];
            node.data.model = {
              modelId: model.id,
              platformId: model.platformId,
              name: `${model.code}(${model.platformName})`
            };
            llmIndex++;
          }
          return node;
        });
        await expertManager.createExpert(expertData);
        console.log('[Background] 初始化内置专家:', builtin.name, '使用', llmIndex, '个LLM节点');
      }
    }
  } catch (error) {
    console.error('[Background] 初始化内置专家失败:', error);
  }
}

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[Background] 插件首次安装，初始化内置提示词和专家');
    await initializeBuiltinPrompts();
    await initializeBuiltinExperts();
  }
});

// 启动时也检查一次（防止升级或其他情况）
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] 插件启动，检查内置提示词和专家');
  await initializeBuiltinPrompts();
  await initializeBuiltinExperts();
});

init().then(async () => {
  await initializeBuiltinExperts();
});
