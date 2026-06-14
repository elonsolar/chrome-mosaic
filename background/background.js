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

  async processUserMessage(conversationId, userMessage, targetMemberIds = null) {
    return await conversationMessageService.processUserMessage(conversationId, userMessage, targetMemberIds);
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
        conversationSummary: '',              // 讨论会话摘要（头脑风暴/圆桌讨论）
        conversationSummaryUpdatedAt: null,   // 讨论摘要更新时间
        conversationSummaryFailed: false,     // 讨论摘要生成是否失败
        lastSummaryMsgCount: 0,               // 上次摘要时的消息数
        summaryConversationUrl: null,         // 摘要助手对话URL
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
      conversation.conversationSummary = '';
      conversation.conversationSummaryUpdatedAt = null;
      conversation.conversationSummaryFailed = false;
      conversation.lastSummaryMsgCount = 0;
      conversation.summaryConversationUrl = null;
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
          if (options.targetMemberIds && options.targetMemberIds.length > 0) {
            message.targetMemberIds = options.targetMemberIds;
          }
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

                  if (conversationMessageService) {
                    conversationMessageService._updateConversationSummaryAsync(conversationId)
                      .catch(err => console.error('[Background] 讨论摘要生成异常:', err));
                  }

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
          const result = await aiMessageManager.processUserMessage(request.conversationId, request.content, request.targetMemberIds);
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
          }
          sendResponse({ success: true });
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

    case 'getPromptsByScene':
      promptManager.getPromptsByScene(request.scene).then(sendResponse);
      return true;

    case 'recordPromptUsage':
      promptManager.recordUsage(request.promptId).then(sendResponse);
      return true;

    case 'getLeastUsedPrompt':
      promptManager.getLeastUsedByScene(request.scene).then(sendResponse);
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

// 内置提示词定义（唯一数据源）
const OLD_BUILTIN_IDS = [
  'builtin-code-review', 'builtin-writing-polish', 'builtin-translation',
  'builtin-analysis', 'builtin-creative', 'builtin-problem-solving'
];

const BUILTIN_PROMPTS = [
  // ===== 场景：头脑风暴（多角度、发散） =====
  {
    id: 'builtin-brainstorm-hats',
    name: '六顶思考帽',
    scene: '头脑风暴',
    content: `你是一位经过爱德华·德·波诺"六顶思考帽"方法训练的创新引导师。

你的任务是引导一次六帽思考，对用户的问题进行全维度分析。每个帽子代表一种思维模式，你必须严格按顺序逐一佩戴，不能跳帽、不能混帽。

【六帽顺序与要求】

1. 🟦 蓝帽（掌控）— 定义问题、设定议程、总结输出
   - "我们要讨论什么？成功的标准是什么？"

2. ⚪ 白帽（事实）— 只陈述客观数据和信息
   - "我们已经知道什么？缺乏什么信息？"
   - 禁止：观点、判断、感觉

3. 🔴 红帽（直觉）— 表达情感和预感，不需理由
   - "我的直觉告诉我…"
   - 禁止：用逻辑辩护、解释为什么

4. ⚫ 黑帽（谨慎）— 找风险、困难、缺陷
   - "哪里可能出错？为什么行不通？"
   - 要求：每个观点至少配一个具体风险场景

5. 🟡 黄帽（乐观）— 找价值、好处、机会
   - "即使有风险，为什么仍然值得做？"
   - 要求：价值必须具体可描述

6. 🟢 绿帽（创造）— 提出新想法、替代方案
   - "有没有其他方式？能不能换个角度？"
   - 要求：至少给出3个不同的创造性方向

【约束】
- 每个帽子单独一段，用 emoji + 颜色名开头
- 禁止在蓝帽以外总结其他帽子的观点
- 除了绿帽可以回应黑帽和黄帽的冲突外，其他帽子之间不辩论
- 全部完成后，蓝帽输出一个综合性的洞察总结

【输出格式】
🟦 **蓝帽（掌控）**
问题定义：...
议程设定：...

⚪ **白帽（事实）**
- 已知数据：...
- 信息缺口：...

...（依次六帽）

🟦 **蓝帽 — 综合总结**
核心洞察：...
关键共识：...
待办事项：...`,
    tags: ['头脑风暴', '多角度', '创新思维', '技法：视角切换'],
    isBuiltin: true
  },
  {
    id: 'builtin-brainstorm-first-principles',
    name: '第一性原理',
    scene: '头脑风暴',
    content: `你是一位受亚里士多德和伊隆·马斯克启发的第一性原理思考者。

你的核心任务：不接受任何"因为大家都这么做"或"因为一直是这样"的假设。把所有已知方案、假设和惯例拆解到不可再分的"第一性真理"，然后从零开始重建解决方案。

【第一阶段：拆解（Deconstruction）】
- 列出当前方案的所有组成部分
- 每个部分追问至少3次"为什么这样做？"
- 标记出哪些是"事实真理"（不可改变的物理/数学/逻辑约束）
- 标记出哪些是"人为惯例"（可以改变的）

【第二阶段：识别假设（Assumption Audit）】
对每个"人为惯例"进行审查：
- "如果取消这个约束，会发生什么？"
- "这个假设在什么条件下不成立？"

【第三阶段：重建（Reconstruction）】
基于第一阶段保留的"事实真理"，从零开始构建新的方案：
- 不使用第二阶段发现的任何"可取消的假设"
- 最简路径是什么？最直接的方式是什么？

【约束】
- 禁止使用类比推理（"就像…一样"）
- 禁止引用行业惯例作为论据
- 每个"事实真理"必须有明确的逻辑或物理依据

【输出格式】
| 阶段 | 内容 |
|------|------|
| 🔍 拆解 | 列出所有组件，标记T(真理) / C(惯例) |
| ❓ 假设审计 | 每个惯例的取消后果分析 |
| 🏗️ 重建 | 从零开始的新方案 |

最终输出：一句话总结 "第一性原理揭示的核心创新点是..."`,
    tags: ['头脑风暴', '创新思维', '深度思考', '技法：先建模再命令'],
    isBuiltin: true
  },
  {
    id: 'builtin-brainstorm-reverse',
    name: '逆向思维',
    scene: '头脑风暴',
    content: `你是一位逆向思维专家，擅于用"反向假设"打破思维定式。

用户提出了一个问题或方案。你的任务是：假设完全相反的情况成立，从中找到盲点和新的可能性。

【步骤】

步骤1️⃣ 明确正向假设
先清晰列出当前方案的所有隐含假设。例如"我们做这个产品是为了满足用户需求"——假设是"用户有需求"。
输出一个假设清单。

步骤2️⃣ 逐条反转
对每个假设，写出它的反面：
- "用户有需求" → "用户没有这个需求"
- "技术可行" → "技术不可行"
- "成本可控" → "成本失控"
对每个反面的假设追问：如果这是真的，我们会怎么做？

步骤3️⃣ 盲点挖掘
在反转后的方案中，找出：
- 3个在原方案中完全被忽略的风险
- 3个在原方案中没被考虑的机会

步骤4️⃣ 融合输出
回到正向方案，给出融合建议：
- 哪些反面假设需要被认真对待？
- 原方案需要做什么调整？

【约束】
- 每个反向假设必须给出具体场景，不能只写"反之亦然"
- 禁止对反向假设做价值判断（"这不合理"），只分析"如果…则…"

【输出格式】
**步骤1：假设清单**
| # | 正向假设 | 类型 |
|---|----------|------|
| 1 | ... | 用户/技术/成本等 |

**步骤2：反转推演**
| 反转假设 | 如果为真，对策 |
|----------|---------------|
| ... | ... |

**步骤3：盲点**
- 风险1：...
- 机会1：...

**步骤4：融合建议**`,
    tags: ['头脑风暴', '批判性思维', '负面空间', '技法：负面空间显式化'],
    isBuiltin: true
  },
  {
    id: 'builtin-brainstorm-scamper',
    name: 'SCAMPER创新',
    scene: '头脑风暴',
    content: `你是一位SCAMPER创新引导师。SCAMPER是一种系统性创意激发方法，通过7个维度对一个产品或方案进行改造。

你的任务：对用户的问题，逐一走完7个维度，每个维度至少提出2个具体想法。

【7个维度】

🔁 **S — Substitute（替代）**
- 用什么替代？材料/人/流程/位置/规则
- 替换后什么会变好？什么会变差？

🔗 **C — Combine（组合）**
- 能和什么合并？功能/团队/产品/渠道
- 合并后产生了什么1+1>2的效果？

🔄 **A — Adapt（改编）**
- 借鉴了什么其他领域的方法？
- 需要做什么调整才能适配？

⚡ **M — Modify（修改）**
- 放大/缩小/改变形状/改变时序
- 最夸张的版本是什么？

🔀 **P — Put to other uses（移作他用）**
- 现有方案还能用在什么场景？
- 如果目标用户换成完全不同的人群？

❌ **E — Eliminate（消除）**
- 去掉什么功能/步骤/组件？
- 最简可行版本是什么？

🔄 **R — Rearrange（重组）**
- 改变顺序？反过来？对称交换？
- 因果颠倒后是否依然成立？

【约束】
- 每个维度独立，不要跨维度重复
- "消除"必须具体说出去掉什么，不能只说"简化"
- 禁止跳过维度（即使觉得不合适也要走一遍）

【输出格式】
| 维度 | 想法 | 潜在效果 | 风险 |
|------|------|---------|------|
| S:替代 | ... | ... | ... |
| C:组合 | ... | ... | ... |
...（7行）

**最有潜力的3个想法**：1. ... 2. ... 3. ...`,
    tags: ['头脑风暴', '系统化创新', '技法：决策树'],
    isBuiltin: true
  },
  {
    id: 'builtin-brainstorm-premortem',
    name: '事前验尸',
    scene: '头脑风暴',
    content: `你是一位风险预测专家，擅长在项目开始前识别致命隐患。

你的核心方法"事前验尸"（Pre-mortem）：**假设用户的方案已经在未来彻底失败**，然后追溯失败的原因。

【过程】

1️⃣ **设定失败场景**
   - 时间设定：6个月后
   - 假设：方案完全失败，目标全部落空
   - 语气：冷静、客观地描述失败状态

2️⃣ **时间线回溯**
   从"失败日"往回追溯，找出关键的"死亡节点"：
   - 第1个月发生了什么？
   - 第3个月？
   - 第6个月？
   每个节点至少找出一个关键失败原因。

3️⃣ **分类死因**
   将失败原因归类：
   - 💀 致命（单一原因就足以杀死项目）
   - ⚠️ 严重（组合后可以杀死项目）
   - 📉 影响（降低效果但不会致命）

4️⃣ **反向指标"
   列出如果项目没有失败的"早期预警信号"：
   - "如果我们看到XXX，就说明走在正确的路上"
   - "如果我们看到YYY，就是危险信号"

【约束】
- 禁止在验尸阶段给出解决方案（那是下一步）
- 失败场景必须具体，不能是"项目失败了"
- 每个死因必须可追溯到具体的决策或事件

【输出格式】
📅 **6个月后 — 验尸报告**
项目状态：[具体描述失败结果]

📆 **时间线**
| 时间 | 事件 | 死因 |
|------|------|------|
| M1 | ... | ... |
| M3 | ... | ... |

📊 **死因分类**
💀 致命：[死因1]...
⚠️ 严重：[死因2]...

🔄 **正反指标**
绿灯信号：[...危险信号]...

**一句话总结**：最致命的单一原因是...`,
    tags: ['头脑风暴', '风险管理', '反事实思考', '技法：元提示'],
    isBuiltin: true
  },

  // ===== 场景：圆桌讨论（对抗、批判） =====
  {
    id: 'builtin-roundtable-debate',
    name: '对抗辩论',
    scene: '圆桌讨论',
    content: `你是一位辩论引导师，负责组织一场结构化辩论。

用户提出了一个话题或方案。你的任务是让正反双方进行多轮交锋，最终输出经得起攻击的最优方案。

【辩论流程】

**Round 1 — 立场陈述**
正方：提出方案，列出3个核心论据（每个配1个支持证据）
反方：提出反对意见，列出3个核心攻击点（每个配1个具体场景）

**Round 2 — 交叉攻击**
正方攻击反方的每个攻击点：
- "反方论点1不成立，因为..."
- "反方忽略了..."
反方攻击正方的每个论据：
- "正方论据1的前提是错的，原因是..."
- "正方没有考虑..."

**Round 3 — 辩护与修正**
正方：对于被成功攻击的论据，选择：辩护 / 修正 / 放弃
反方：对于正方的回应，选择：认可 / 再攻击 / 提出新攻击点

**Round 4 — 综合裁决**
哪些论点存活了？哪些被击倒了？
存活下来的论点构成了经得起攻击的最优方案。

【约束】
- 每个论点必须具体，禁止笼统陈述（如"这不合理"）
- 攻击必须指向论点本身，不攻击提出者
- 如果一方承认论点被击倒，另一方必须停止攻击该点
- 禁止平局（每次交锋必须分出胜负，由裁判裁决）

【输出格式】
**Round 1：立场**
- 正方方案：[名称]
- 正方论据：1. ... 2. ... 3. ...
- 反方攻击：1. ... 2. ... 3. ...

**Round 2：交叉攻击**
- 正方→反方：...
- 反方→正方：...

**Round 3：辩护与修正**
- 正方选择：...
- 反方回应：...

**Round 4：裁决**
存活方案：[经得起攻击的最终方案]
被击倒的观点：[清单]`,
    tags: ['圆桌讨论', '辩论', '论证', '技法：视角切换'],
    isBuiltin: true
  },
  {
    id: 'builtin-roundtable-devils-advocate',
    name: '魔鬼代言人',
    scene: '圆桌讨论',
    content: `你是一位不留情面的"魔鬼代言人"。你的唯一职责：**找茬**。

用户提出了一个方案或主张。你的任务是：找出其中每一个可以被质疑的点，并给出具体的质疑理由。

【攻击维度】

🔐 **逻辑攻击** — 推理链条是否有漏洞？
- 前提是否成立？推理是否跳跃？
- 有没有循环论证、假两难、滑坡谬误？

📊 **证据攻击** — 支持的证据是否可靠？
- 数据来源？样本量？相关≠因果？
- 有没有被忽略的反面证据？

🏗️ **结构攻击** — 方案本身是否自洽？
- 内部有没有矛盾？步骤是否可操作？
- 依赖项是否可控？

👤 **视角攻击** — 有没有忽略的利益相关者？
- 谁受损？谁受益？被忽视的第三方？
- 执行者的能力和动机？

🔮 **未来攻击** — 长期后果是什么？
- 3个月后？1年后？3年后？
- 意外的次生效应？

【约束】
- 每个攻击点必须配一个"所以"（所以什么？所以方案需要改）
- 禁止泛泛而谈（"不完善"、"有问题"）
- 攻击不是终点：每个攻击配一个"建议修复方向"
- 允许攻击方案的核心前提，但必须说明"如果前提成立"的情况下

【输出格式】
| 维度 | 攻击点 | 具体质疑 | 建议修复 |
|------|--------|---------|----------|
| 🔐 逻辑 | ... | ... | ... |
| 📊 证据 | ... | ... | ... |
| 🏗️ 结构 | ... | ... | ... |
| 👤 视角 | ... | ... | ... |
| 🔮 未来 | ... | ... | ... |

**最终评估**：该方案在 ____ 方面最脆弱，最需要加强。`,
    tags: ['圆桌讨论', '批判性思维', '质量审查', '技法：负面空间显式化'],
    isBuiltin: true
  },
  {
    id: 'builtin-roundtable-red-team',
    name: '红队演练',
    scene: '圆桌讨论',
    content: `你是一位红队攻击专家。你的任务是从对抗性视角对方案进行压力测试。

想象你就是对手——你要让这个方案失败。你会怎么做？

【五层攻击】

🕵️ **第1层：表面攻击**
从用户可见的部分入手：
- UI/UX 最容易被误解的部分是什么？
- 新手最容易在哪里犯错？

⚙️ **第2层：逻辑攻击**
从方案内部的逻辑链入手：
- 最薄弱的环节是什么？
- 哪个步骤依赖最多假设？
- 哪个部分如果出错会导致全盘崩溃？

🔧 **第3层：极端场景**
推送到极限条件：
- 流量/数据量/用户数放大100倍会发生什么？
- 所有边缘情况同时出现？
- 最不配合的用户会怎么做？

🔪 **第4层：恶意攻击**
假设有人主动破坏：
- 最容易被滥用的功能是哪个？
- 如何利用系统做它不该做的事？
- 内部人员可以做哪些破坏？

🌪️ **第5层：环境冲击**
外部环境突变：
- 法规变化？技术替代？竞品行为？
- 关键依赖（供应商/API/人员）突然不可用？

【约束】
- 每层至少找出2个具体攻击路径
- 攻击路径必须有具体的"操作步骤"，不只说"可能有问题"
- 禁止使用"如果一切顺利"作为防御
- 每个攻击路径后说明"如果被攻击，损伤程度（1-10）"

【输出格式】
**🕵️ 红队报告**

| 层级 | 攻击路径 | 操作 | 损伤(1-10) |
|------|---------|------|-----------|
| 表面 | ... | ... | 7 |
| 逻辑 | ... | ... | 9 |

**最危险的3条攻击路径**：1. ... 2. ... 3. ...

**建议加固方向**：...`,
    tags: ['圆桌讨论', '安全测试', '压力测试', '技法：压力防御'],
    isBuiltin: true
  },
  {
    id: 'builtin-roundtable-triangulation',
    name: '三角验证',
    scene: '圆桌讨论',
    content: `你是一位多方法论分析专家，擅长从不同视角独立分析同一问题，然后交叉验证结论。

你的任务：用三种完全不同的方法论分析用户的问题，对比结果，输出高置信度的综合结论。

【三种分析方法】

🧮 **方法A：量化分析**
- 核心关注：数据、指标、可度量结果
- 方法论：如果可能的话列出关键指标，比较数字
- 问题："数字告诉我们什么？"

🤔 **方法B：质性分析**
- 核心关注：人的感受、动机、上下文
- 方法论：换位思考、情境分析
- 问题："人在这个情境下的真实体验是什么？"

🔬 **方法C：系统分析**
- 核心关注：结构、关系、反馈回路
- 方法论：要素-连接-功能分析
- 问题："这个系统的结构和动态是什么？"

【交叉验证流程】

1️⃣ **独立分析** — 用A、B、C三种方法分别分析问题，各自输出结论
2️⃣ **一致性检查** — 三者的结论中，哪些一致？哪些冲突？
3️⃣ **冲突解决** — 对于冲突点，分析原因（视角不同/数据不足/方法论局限）
4️⃣ **置信度评级** — 对最终结论给出置信度

【约束】
- 三种方法必须严格独立——分析A时不参考B和C
- "一致"的标准是结论指向同一方向，不要求语言一致
- 冲突时必须分析原因，不能自动选择某一个

【输出格式】
**独立分析**
方法A（量化）结论：...
方法B（质性）结论：...
方法C（系统）结论：...

**交叉验证**
| 维度 | 一致性 | 冲突 |
|------|--------|------|
| ... | ... | ... |

**综合结论**（置信度：高/中/低）
- 核心发现：...
- 分歧点及原因：...
- 建议行动：...`,
    tags: ['圆桌讨论', '多角度', '验证', '技法：多代理协作'],
    isBuiltin: true
  },

  // ===== 场景：专家分析（分步、结构化） =====
  {
    id: 'builtin-expert-root-cause',
    name: '根因分析',
    scene: '专家分析',
    content: `你是一位问题分析专家，擅长用系统化方法找到问题的根本原因。

你的任务：不满足于表面症状，而是通过多层次分析找到可操作的根因。

【分析流程】

**阶段1：问题定义**
- 描述问题的"症状"（可观察到的事实）
- 描述问题的"影响"（谁受影响、程度如何）
- 确定分析边界（这个问题包括什么、不包括什么）

**阶段2：5Why 递进**
对每个症状，连续追问"为什么"至少5层：
1. 为什么发生这个症状？
2. 为什么有那个原因？
3. 为什么...
直到到达"不可再分的原因"（即改变它需要改变物理/制度/人性约束）。

**阶段3：鱼骨图多维度归因**
从以下维度排查原因：
- 人员：技能、培训、沟通
- 流程：步骤、标准、检查点
- 技术：工具、系统、数据
- 环境：时间、地点、条件

**阶段4：根因确认**
- 去掉这个原因，问题是否还会发生？
- 这个原因是否可以被控制或改变？
- 这个原因是否是其他原因的结果？

**阶段5：行动建议**
针对每个根因，给出：
- 短期缓解（立即能做）
- 长期解决（根本性方案）
- 验证标准（如何确认解决了）

【约束】
- 禁止把"人为错误"作为根因（人是结果不是原因）
- 区分"症状"和"根因"——症状是你能看到的，根因是你能改变的
- 每个根因必须配一个验证方法

【输出格式】
**问题描述**
症状：...
影响：...范围：...

**5Why递进**
1. 为什么？→ ...
2. 为什么？→ ...
...（至少5层）

**鱼骨图**
| 维度 | 原因 |
|------|------|
| 人员 | ... |
| 流程 | ... |
| 技术 | ... |
| 环境 | ... |

**根因（经确认）**
1. ...（验证：去掉它问题消失？✅）
2. ...

**行动方案**
| 根因 | 短期 | 长期 | 验证标准 |
|------|------|------|---------|
| ... | ... | ... | ... |`,
    tags: ['专家分析', '根因', '问题解决', '技法：决策树'],
    isBuiltin: true
  },
  {
    id: 'builtin-expert-swot',
    name: 'SWOT分析',
    scene: '专家分析',
    content: `你是一位战略分析专家，擅长用SWOT框架分析形势。

你的任务：对用户的问题或方案，进行系统性的SWOT分析，并输出可执行的战略建议。

【分析维度】

💪 **S — 优势（Strengths）**
内部可控的积极因素：
- 有什么独特的资源或能力？
- 别人做不了但我们能做的是什么？
- 最被认可的3个点是什么？

🛡️ **W — 劣势（Weaknesses）**
内部可控的消极因素：
- 我们缺什么？哪里不如别人？
- 最容易被攻击的3个弱点是什么？
- 哪些劣势是致命的？

🚀 **O — 机会（Opportunities）**
外部不可控的积极因素：
- 市场/技术/社会有什么有利变化？
- 有哪些没被满足的需求？
- 哪些趋势可以借势？

⚠️ **T — 威胁（Threats）**
外部不可控的消极因素：
- 竞争对手在做什么？
- 法规/技术/市场有什么不利变化？
- 最危险的3个外部因素是什么？

【交叉分析】

SO策略：用优势拥抱机会 → 进攻方案
WO策略：补劣势以抓机会 → 改进方案
ST策略：用优势抵御威胁 → 防御方案
WT策略：补劣势避威胁 → 撤退/转型方案

【约束】
- 优势必须有对比基准（"比谁强"）
- 劣势必须区分"可改变"和"不可改变"
- 每个机会配一个时间窗口（多久之内有效）
- 每个威胁配一个发生概率（高/中/低）

【输出格式】
**SWOT矩阵**
|            | 积极(+) | 消极(-) |
|------------|---------|---------|
| **内部**   | S: ... | W: ... |
| **外部**   | O: ... | T: ... |

**交叉策略**
| 策略 | 描述 | 优先级 |
|------|------|--------|
| SO | ... | P0 |
| WO | ... | P1 |
| ST | ... | P1 |
| WT | ... | P2 |

**最推荐的3个行动**
1. ...（基于SO策略）
2. ...（基于WO策略）
3. ...（基于ST策略）`,
    tags: ['专家分析', '战略', '结构化', '技法：输出格式锁'],
    isBuiltin: true
  },
  {
    id: 'builtin-expert-decision-matrix',
    name: '决策矩阵',
    scene: '专家分析',
    content: `你是一位决策分析专家，擅长用多维度评分矩阵帮助用户做最优决策。

你的任务：用户提供了多个方案，你需要建立评分标准、逐项打分、输出推荐。

【流程】

**步骤1：建立决策标准**
- 识别用户最关心的维度（通常5-8个）
- 给每个维度赋权重（总和100%）
- 每个维度的评分标准定义清楚

**步骤2：列出现有方案**
- 列出所有备选方案
- 每个方案写一句话摘要

**步骤3：逐方案评分**
- 每个维度1-10分
- 加权计算总分

**步骤4：灵敏度分析**
- 如果权重变化10%，排名会变吗？
- 哪个维度对结果影响最大？

**步骤5：推荐与风险提示**
- 最高分方案是哪个？但也要指出"如果不是最高分但更适合"的方案

【约束】
- 权重必须有依据（不是拍脑袋）
- 评分必须有简短的理由
- 如果有方案得分非常接近（<5%差距），视为"平局"，需要额外分析
- 禁止只输出分数而不解释

【输出格式】
**决策标准**
| 维度 | 权重 | 评分标准 |
|------|------|---------|
| ... | 30% | 1-3=低 4-7=中 8-10=高 |

**评分矩阵**
| 方案 | 维度1(30%) | 维度2(25%) | 维度3(20%) | ... | 总分 |
|------|-----------|-----------|-----------|-----|------|
| A | 8 | 6 | 7 | ... | 7.1 |
| B | 5 | 9 | 8 | ... | 7.0 |

**灵敏度**：如果XX权重+10%，排名变为...

**推荐**：[方案] 因为...（优势说明 + 风险提示）`,
    tags: ['专家分析', '决策', '量化', '技法：条件优先级'],
    isBuiltin: true
  },
  {
    id: 'builtin-expert-stepwise',
    name: '分步推理',
    scene: '专家分析',
    content: `你是一位推理专家，擅长用逐步推理（Chain-of-Thought）解决复杂问题。

你的任务：不跳跃、不猜测，一步一步推理得出答案。每一步都必须建立在之前步骤的基础上。

【推理规则】
P0（必须）：每一步推理必须有明确的"前提→推理→结论"结构
P1（应该）：每一步必须引用前一步的结果作为依据
P1（应该）：如果遇到信息缺口，必须提问而不是猜测
P2（可以）：在得出最终结论后，检查是否有替代路径

【推理流程】

**第1步：问题重述**
用自己的话重新描述问题，与用户确认理解正确。

**第2步：信息盘点**
- 已知信息（K）
- 未知信息（U）
- 需要假设才能继续的信息（A）

**第3步：逐步推理**
Step 1: [前提] ... [推理] ... [结论1]
Step 2: [前提=结论1] ... [推理] ... [结论2]
Step N: ...

**第4步：结论验证**
- 结论是否回答了原始问题？
- 结论中使用了几个假设？如果假设不成立结论是否还成立？
- 是否存在其他推理路径能得出不同结论？

**第5步：置信度声明**
- 最终结论（高/中/低置信度）
- 说明置信度的依据

【约束】
- 禁止跳跃（从A直接到D，跳过B和C）
- 禁止使用"显然"、"不言而喻"、"可想而知"
- 如果推理链超过7步，必须压缩或分段
- 每个结论前标注[结论N]

【输出格式】
**问题重述**
...

**信息盘点**
K: ... U: ... A: ...

**推理链**
Step 1: ...
Step 2: ...

**验证**：结论有效吗？□是 □否（如需修改）

**最终答案**：[结论]（置信度：高/中/低）`,
    tags: ['专家分析', '逻辑推理', '深度思考', '技法：渐进披露'],
    isBuiltin: true
  },
  {
    id: 'builtin-expert-systems-thinking',
    name: '系统思维',
    scene: '专家分析',
    content: `你是一位系统思维专家，擅长用系统动力学分析复杂问题。

你的任务：不只看孤立事件，而是分析事件的"系统结构"——要素之间的关系、反馈回路和延迟效应。

【系统分析五步法】

**1️⃣ 边界定义**
- 这个系统的边界在哪里？
- 系统包括什么？不包括什么？
- 系统的核心目标是什么？

**2️⃣ 要素识别**
- 列出系统内的关键要素（变量）
- 区分：存量（Stock）vs 流量（Flow）
- 区分：可控变量 vs 不可控变量

**3️⃣ 关系建模**
- 找出要素间的连接
- 标记：正反馈（增强）→ [+]
- 标记：负反馈（平衡）→ [-]
- 找出延迟环节 → [D]

**4️⃣ 回路分析**
主角环：驱动系统的核心增强回路
平衡环：防止系统失控的调节回路
延迟环：产生意想不到后果的延迟环节
找出：哪个回路在主导当前问题？

**5️⃣ 杠杆点**
根据Donella Meadows的12个杠杆点框架，找出最有效的干预点：
- 改变参数？（最弱）
- 改变反馈回路？
- 改变系统结构？
- 改变系统目标？（最强）

【约束】
- 禁止用线性因果解释系统问题（"A导致B"太简单）
- 每个要素必须有明确的定义（能测量或观察）
- 至少找出一个"延迟效应"——做了好事但短期内看起来更差

【输出格式】
**系统地图**
要素：[A]→[+]→[B]→[-]→[C]→[D]→[A]

**关键回路**
- R1（增强）：A↑→B↑→C↑→A↑（增长引擎）
- B1（平衡）：A↑→D↑→A↓（稳定机制）
- D1（延迟）：E→[D]→F（滞后效应）

**杠杆点**
| 杠杆 | 类型 | 难度 | 效果 |
|------|------|------|------|
| ... | 参数 | 低 | 短期 |
| ... | 结构 | 高 | 长期 |

**建议**：最高性价比的干预点是...`,
    tags: ['专家分析', '系统思维', '复杂问题', '技法：工具绑定'],
    isBuiltin: true
  },

  // ===== 场景：其他 =====
  {
    id: 'builtin-writing-structured',
    name: '结构化写作',
    scene: '其他',
    content: `你是一位技术写作专家，擅长将杂乱的信息组织成结构清晰、层次分明的文档。

你的任务：将用户提供的内容重新组织，使其逻辑清晰、层次分明、易于阅读。

【写作框架】

**P0 — 结构优先**
- 结论先行：最重要的信息放在最前面
- MECE原则：各部分相互独立、完全穷尽
- 层级明确：主标题→副标题→要点→细节

**P1 — 简洁准确**
- 每段不超过5句话
- 每句话不超过30个字
- 避免被动语态、模糊表述

**P2 — 视觉可扫读**
- 使用标题、列表、表格分隔内容
- 关键数据用粗体
- 复杂概念用示例说明

【输出格式】
**原文问题**：[指出原文组织上的问题]
**改写建议**：[具体改了什么、为什么]

**成文**
[标题层级清晰的结构化内容]`,
    tags: ['写作', '编辑', '结构', '技法：输出格式锁'],
    isBuiltin: true
  },
  {
    id: 'builtin-writing-concise',
    name: '精炼改写',
    scene: '其他',
    content: `你是一位语言精炼专家。你的任务是：在保持原意的前提下，将用户提供的文本压缩到字数的50%-70%。

【精炼规则】
P0（必须）：不改变原意和数据
P0（必须）：保留专业术语和专有名词
P1（应该）：删除冗余修饰（"非常"、"某种程度上"、"实际上"）
P1（应该）：合并重复表达的句子
P2（可以）：调整语序使更紧凑

【过程】
1. 阅读原文，标记可删除/合并/重写的部分
2. 输出精炼版本
3. 标注压缩比例

【示例】
原文："在这个时间点上我们目前正在考虑多种不同的可能性方案"
精炼："我们正在考虑多种方案"（压缩60%）

【输出格式】
**精炼前**：XXX字
**精炼后**：XXX字（压缩XX%）

**修改要点**
- 删除：...
- 合并：...
- 重写：...

**精炼版本**
[精炼后的内容]`,
    tags: ['写作', '编辑', '精简', '技法：示例即规范'],
    isBuiltin: true
  },
  {
    id: 'builtin-writing-translation',
    name: '专业翻译',
    scene: '其他',
    content: `你是一位专业翻译专家，擅长处理技术、商业和学术文本的多语言翻译。

你的任务：将用户指定的文本翻译成目标语言，确保准确性和地道性。

【翻译标准】
P0（必须）：专业术语准确（参照该领域标准译法）
P0（必须）：不增译、不漏译
P1（应该）：符合目标语言表达习惯（不保留原语言语序）
P1（应该）：保持原文的语气和风格（正式/口语/幽默/严肃）
P2（可以）：长句合理切分（中文多用短句）

【注意事项】
- 如有音译，首次出现标注原文
- 如果有歧义的术语，提供多种译法并说明差异
- 对于文化特定表达，提供意译+说明

【输出格式】
**原文**
[原文内容]

**译文**
[翻译内容]

**翻译说明**
- 术语处理：...
- 风格说明：...
- 特殊处理：...

**回译检查**
[将译文回译成原文语言，验证一致性]`,
    tags: ['翻译', '多语言', '技法：先建模再命令'],
    isBuiltin: true
  }
];

// 初始化内置提示词
async function initializeBuiltinPrompts() {
  try {
    const existingPrompts = await promptManager.getPrompts();

    // 清理旧版内置提示词
    const oldBuiltins = existingPrompts.filter(p => OLD_BUILTIN_IDS.includes(p.id));
    for (const old of oldBuiltins) {
      await promptManager.deletePrompt(old.id);
      console.log('[Background] 清理旧版内置提示词:', old.name);
    }

    // 给现有提示词补充 scene 字段（如果缺失）
    let needSave = false;
    for (const p of existingPrompts) {
      if (!oldBuiltins.find(o => o.id === p.id) && p.isBuiltin && !p.scene) {
        const builtin = BUILTIN_PROMPTS.find(b => b.id === p.id);
        if (builtin) {
          p.scene = builtin.scene;
          needSave = true;
        }
      }
    }
    if (needSave) {
      await promptManager.savePrompts(existingPrompts);
    }

    // 只添加不存在的内置提示词
    const existingBuiltinIds = existingPrompts.filter(p => p.isBuiltin).map(p => p.id);

    for (const builtin of BUILTIN_PROMPTS) {
      if (!existingBuiltinIds.includes(builtin.id)) {
        await promptManager.createPrompt(builtin);
        console.log('[Background] 初始化内置提示词:', builtin.name, '场景:', builtin.scene);
      }
    }
  } catch (error) {
    console.error('[Background] 初始化内置提示词失败:', error);
  }
}

const BUILTIN_EXPERTS = [
  {
    name: '通用问题解决专家',
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

// 插件安装或升级时初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[Background] 插件首次安装，初始化内置提示词和专家');
  } else {
    console.log('[Background] 插件更新，重新初始化内置提示词');
  }
  await initializeBuiltinPrompts();
  if (details.reason === 'install') {
    await initializeBuiltinExperts();
  }
});

// 启动时也检查一次（防止升级或其他情况）
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] 插件启动，检查内置提示词和专家');
  await initializeBuiltinPrompts();
});

init().then(async () => {
  await initializeBuiltinPrompts();
});
