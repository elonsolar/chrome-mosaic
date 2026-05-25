importScripts('../config/providers.config.js');
importScripts('./managers/prompt-manager.js');
importScripts('./managers/prompt-folder-manager.js');
importScripts('./managers/model-manager.js');
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
    let conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

    const settings = await StorageManager.getSettings();
    const contextMode = conversation.contextMode || settings.contextMode || 'self';
    const useFloatWindow = settings.floatWindow !== false;

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '用户',
        content: userMessage,
        isUser: true,
        isError: false
      });
    }

    await this.conversationManager.addMessage(conversationId, null, userMessage, true);

    conversation = await this.conversationManager.getConversation(conversationId);

    if (conversation.flowId) {
      console.log('[AIMessageManager] 会话使用流程执行模式, flowId:', conversation.flowId);
      
      const flow = await flowManager.getFlowById(conversation.flowId);
      if (!flow) {
        throw new Error('流程不存在');
      }

      try {
        const result = await flowExecutor.executeFlow(flow, userMessage, {
          maxIterations: 3,
          onProgress: async (progress) => {
            console.log('[AIMessageManager] 流程执行进度:', progress);
            
            if (useFloatWindow) {
              await this.sendToFloatWindow('addMessage', {
                role: '系统',
                content: `执行进度：第${progress.iteration}/${progress.maxIterations}轮`,
                isUser: false,
                isError: false
              });
            }
            
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
              if (tab.url && tab.url.includes('chat/chat.html')) {
                chrome.tabs.sendMessage(tab.id, {
                  type: 'flowExecutionProgress',
                  progress: progress
                }).catch(() => {});
              }
            }
          }
        });

        if (!result || !result.content) {
          console.error('[AIMessageManager] 流程返回无效结果:', result);
          throw new Error('流程执行返回无效结果');
        }

        const finalContent = result.content;
        
        await this.conversationManager.addMessage(conversationId, null, finalContent, false);

        if (useFloatWindow) {
          await this.sendToFloatWindow('addMessage', {
            role: 'AI',
            content: finalContent,
            isUser: false,
            isError: false
          });
        }

        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && tab.url.includes('chat/chat.html')) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'flowExecutionComplete',
              result: finalContent,
              conversationId: conversationId
            }).catch(() => {});
          }
        }

        return await this.conversationManager.getConversation(conversationId);
      } catch (error) {
        console.error('[AIMessageManager] 流程执行失败:', error);
        
        const errorMessage = `流程执行失败: ${error.message}`;
        await this.conversationManager.addMessage(conversationId, null, errorMessage, false);
        
        if (useFloatWindow) {
          await this.sendToFloatWindow('addMessage', {
            role: '系统',
            content: errorMessage,
            isUser: false,
            isError: true
          });
        }
        
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && tab.url.includes('chat/chat.html')) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'flowExecutionError',
              error: error.message
            }).catch(() => {});
          }
        }
        
        return await this.conversationManager.getConversation(conversationId);
      }
    }

    if (!conversation.members || conversation.members.length === 0) {
      throw new Error('会话没有关联的成员');
    }

    const sendMode = conversation.sendMode || 'parallel';
    const memberIds = conversation.members.map(m => m.id);

    (async () => {
      try {
        console.log('[AIMessageManager] IIFE 开始发送消息, 会话:', conversationId, '成员数:', conversation.members.length);
        if (sendMode === 'sequential') {
          await this.sendToMembersSequential(conversation, contextMode, useFloatWindow, conversationId);
        } else if (sendMode === 'random') {
          await this.sendToMembersRandom(conversation, contextMode, useFloatWindow, conversationId);
        } else {
          const sendPromises = conversation.members.map(async (member) => {
            return await this.sendMessageToMember(member.id, conversation, contextMode, useFloatWindow, conversationId);
          });
          await Promise.allSettled(sendPromises);
        }
        console.log('[AIMessageManager] IIFE 所有消息发送完成');
      } catch (error) {
        console.error('[AIMessageManager] 发送消息到成员时出错:', error);
      }
    })();

    await new Promise(resolve => setTimeout(resolve, 500));

    const models = await modelManager.getModels();
    const hasWebRole = conversation.members.some(member => {
      const modelConfig = models.find(m => m.provider === member.provider && m.model === member.model);
      return (modelConfig?.accessMethod || 'web') === 'web';
    });

    if (hasWebRole) {
      setTimeout(() => {
        console.log(`[AIMessageManager] 启动轮询监控: ${conversationId}`);
        startPolling(conversationId);
      }, 2500);
    } else {
      console.log(`[AIMessageManager] 所有成员均为 API 模式，跳过轮询: ${conversationId}`);
    }

    return await this.conversationManager.getConversation(conversationId);
  }

  async executeDiscussionLoop(conversationId, question, rounds, contextMode, useFloatWindow) {
    const conversation = await this.conversationManager.getConversation(conversationId);
    const order = conversation.memberOrder || conversation.members.map(m => m.id);

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '用户',
        content: `/loop ${question} ${rounds}`,
        isUser: true,
        isError: false
      });
    }

    await this.conversationManager.addMessage(conversationId, null, question, true);

    let currentConv = await this.conversationManager.getConversation(conversationId);

    for (let round = 0; round < rounds; round++) {
      console.log(`[DiscussionLoop] 第${round + 1}/${rounds}轮`);

      if (useFloatWindow) {
        await this.sendToFloatWindow('addMessage', {
          role: '系统',
          content: `── 第${round + 1}轮讨论 ──`,
          isUser: false,
          isError: false
        });
      }

      for (const memberId of order) {
        currentConv = await this.conversationManager.getConversation(conversationId);
        await this.sendMessageToMember(memberId, currentConv, contextMode, useFloatWindow, conversationId);
      }

      await this.conversationManager.updateConversation(conversationId, {
        discussionRounds: (currentConv.discussionRounds || 0) + 1
      });
    }

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '系统',
        content: `讨论结束（${rounds}轮完成）`,
        isUser: false,
        isError: false
      });
    }

    return await this.conversationManager.getConversation(conversationId);
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
    } else if (conversation.flowId) {
      flow = await flowManager.getFlowById(conversation.flowId);
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

    if (useFloatWindow) {
      await this.sendToFloatWindow('addMessage', {
        role: '系统',
        content: '【专家问答】开始执行...',
        isUser: false,
        isError: false
      });
    }

    const result = await flowExecutor.executeFlow(flow, userMessage, {
      maxIterations: 3,
      onProgress: async (progress) => {
        if (useFloatWindow) {
          await this.sendToFloatWindow('addMessage', {
            role: '系统',
            content: `【专家问答】第${progress.iteration}/${progress.maxIterations}轮执行中...`,
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
        content: `【${result.metadata?.iterations || 1}轮迭代完成】\n\n${finalContent}`,
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
  }

  async sendMessageToMember(memberId, conversation, contextMode, useFloatWindow, conversationId) {
    const member = conversation.members.find(m => m.id === memberId);
    if (!member) return null;

    const roleSetting = conversation.memberSettings?.[memberId] || {};
    const nickname = roleSetting.nickname || member.name;
    const additionalPrompt = roleSetting.additionalPrompt || '';

    try {
      let messageToSend = '';

      if (contextMode === 'self') {
        const lastMessageId = conversation.memberLastMessageIds?.[memberId];
        const messagesToSend = this.getMessagesToSend(conversation, lastMessageId, false);

        if (messagesToSend.length === 0) {
          return null;
        }

        messageToSend = messagesToSend.map(msg => msg.content).join('\n\n');

        let fullPrompt = member.systemPrompt || '';
        if (additionalPrompt) {
          fullPrompt = fullPrompt ? `${fullPrompt}\n\n${additionalPrompt}` : additionalPrompt;
        }

        if (fullPrompt) {
          messageToSend = `${fullPrompt}\n\n${messageToSend}`;
        }

        messageToSend += '\n\n**严格遵守**：在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';
      } else {
        const lastMessageId = conversation.memberLastMessageIds?.[memberId];
        const messagesToSend = this.getMessagesToSend(conversation, lastMessageId, true);

        if (messagesToSend.length === 0) {
          return null;
        }

        const isFirstTime = !lastMessageId;
        const nicknameMap = {};
        conversation.members.forEach(member => {
          const setting = conversation.memberSettings?.[member.id] || {};
          nicknameMap[member.id] = setting.nickname || member.name;
        });

        if (isFirstTime) {
          const memberIds = conversation.members.map(m => m.id);
          const nicknames = memberIds.map(id => nicknameMap[id]).filter(Boolean);
          messageToSend += `当前我们在一个会话里，会话里有成员 user、${nicknames.join('、')}\n`;
          messageToSend += `你的当前会话名称是：${nickname}\n`;

          let fullPrompt = member.systemPrompt || '';
          if (additionalPrompt) {
            fullPrompt = fullPrompt ? `${fullPrompt}\n\n${additionalPrompt}` : additionalPrompt;
          }

          if (fullPrompt) {
            messageToSend += `你的成员设定：${fullPrompt}\n`;
          }
          messageToSend += `\n请注意：你只能扮演${nickname}，不可以扮演其他成员。\n\n`;
          messageToSend += '下面是当前会话的历史内容：\n\n';
        }

        messagesToSend.forEach(msg => {
          if (msg.isUser) {
            messageToSend += `User: ${msg.content}\n\n`;
          } else {
            messageToSend += `${nicknameMap[msg.memberId] || 'Assistant'}: ${msg.content}\n\n`;
          }
        });

        messageToSend = messageToSend.trim() + '\n\n重要：请在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';
      }

      const conversationUrl = conversation.memberUrls?.[memberId];

      const models = await modelManager.getModels();
      const modelConfig = models.find(m => m.provider === member.provider && m.model === member.model);
      const accessMethod = modelConfig?.accessMethod || 'web';
      const baseUrl = modelConfig?.baseUrl || '';
      const apiKey = modelConfig?.apiKey || '';

      const sender = this.senderFactory.getSender(accessMethod);

        console.log(`[AIMessageManager] 开始发送消息到成员 ${member.name} (${member.provider}), accessMethod: ${accessMethod}, 会话URL: ${conversationUrl}`);
      const response = await sender.send(messageToSend, {
        provider: member.provider,
        model: member.model,
        conversationUrl,
        conversationId,
        conversation,
        memberId,
        baseUrl,
        apiKey
      });
      console.log(`[AIMessageManager] 成员 ${member.name} 响应成功`);

      const content = response.content || '';

      if (response.conversationUrl) {
        if (!conversation.memberUrls) {
          conversation.memberUrls = {};
        }

        if (conversation.memberUrls[memberId] !== response.conversationUrl) {
          conversation.memberUrls[memberId] = response.conversationUrl;
        }
      }

      const savedMessage = await this.conversationManager.addMessage(conversationId, memberId, content, false);

      if (savedMessage) {
        if (!conversation.memberLastMessageIds) {
          conversation.memberLastMessageIds = {};
        }
        conversation.memberLastMessageIds[memberId] = savedMessage.id;
      }

      await this.conversationManager.updateConversation(conversationId, {
        memberUrls: conversation.memberUrls,
        memberTabIds: conversation.memberTabIds,
        memberLastMessageIds: conversation.memberLastMessageIds
      });

      if (useFloatWindow) {
        await this.sendToFloatWindow('addMessage', {
          role: nickname,
          content: content,
          isUser: false,
          isError: false,
          provider: member.provider
        });
      }

      return true;
    } catch (error) {
      console.error(`发送到 ${member.provider} 失败:`, error);
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

  async sendToMembersSequential(conversation, contextMode, useFloatWindow, conversationId) {
    const memberOrder = conversation.memberOrder || conversation.members.map(m => m.id);
    for (let i = 0; i < memberOrder.length; i++) {
      const memberId = memberOrder[i];
      await this.sendMessageToMember(memberId, conversation, contextMode, useFloatWindow, conversationId);
      conversation = await this.conversationManager.getConversation(conversationId);
    }
  }

  async sendToMembersRandom(conversation, contextMode, useFloatWindow, conversationId) {
    const memberIds = conversation.members.map(m => m.id);
    const shuffledMemberIds = [...memberIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffledMemberIds.length; i++) {
      const memberId = shuffledMemberIds[i];
      await this.sendMessageToMember(memberId, conversation, contextMode, useFloatWindow, conversationId);
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
    if (conversation.memberUrls && Object.keys(conversation.memberUrls).length > 0) {
      console.log(`[AIMessageManager] 准备删除平台会话，共 ${Object.keys(conversation.memberUrls).length} 个`);

      for (const [memberId, conversationUrl] of Object.entries(conversation.memberUrls)) {
        const member = conversation.members.find(m => m.id === memberId);
        if (!member || !conversationUrl) continue;

        try {
          console.log(`[AIMessageManager] 开始删除 ${member.provider} 平台的会话: ${conversationUrl}`);
          await this.deletePlatformConversation(member.provider, conversationUrl);
          deletedConversations.push({ provider: member.provider, url: conversationUrl });
          console.log(`[AIMessageManager] ✓ ${member.provider} 平台会话删除成功`);
        } catch (error) {
          console.error(`[AIMessageManager] ❌ ${member.provider} 平台会话删除失败:`, error.message);
        }
      }
    }

    console.log(`[AIMessageManager] 平台会话删除完成，成功删除 ${deletedConversations.length} 个`);

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
    this.tabs = new Map();
  }

  async openPlatformTab(platform, forceNew = false, targetUrl = null) {
    const provider = PROVIDERS[platform];
    if (!provider) {
      throw new Error(`不支持的平台: ${platform}`);
    }

    const url = provider.baseUrl;

    if (!forceNew) {
      if (targetUrl) {
        const exactTab = await this.findTabByUrl(targetUrl);
        if (exactTab) {
          console.log(`[TabManager] 复用已存在的标签页(URL匹配): ${platform}`);
          await chrome.tabs.update(exactTab.id, { active: false });
          await this.sleep(1000);
          return exactTab;
        }
      } else {
        const existingTab = await this.findPlatformTab(platform);
        if (existingTab) {
          console.log(`[TabManager] 复用已存在的标签页: ${platform}`);
          await chrome.tabs.update(existingTab.id, { active: false });
          await this.sleep(2000);
          return existingTab;
        }
      }
    }

    const openUrl = targetUrl || url;
    console.log(`[TabManager] 创建新标签页: ${platform} -> ${openUrl}`);
    const tab = await chrome.tabs.create({
      url: openUrl,
      active: false
    });

    this.tabs.set(platform, tab.id);
    await this.waitForTabReady(tab.id);

    await chrome.tabs.update(tab.id, { active: false });

    return tab;
  }

  async findPlatformTab(platform) {
    const provider = PROVIDERS[platform];
    if (!provider) return null;

    const domain = provider.domain;

    const tabId = this.tabs.get(platform);
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && tab.url.includes(domain)) {
          return tab;
        } else {
          this.tabs.delete(platform);
        }
      } catch (e) {
        this.tabs.delete(platform);
      }
    }

    const allTabs = await chrome.tabs.query({});
    const platformTab = allTabs.find(tab =>
      tab.url && tab.url.includes(domain) && !tab.pendingUrl
    );

    if (platformTab) {
      this.tabs.set(platform, platformTab.id);
      return platformTab;
    }

    return null;
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

  async closePlatformTab(platform) {
    const tabId = this.tabs.get(platform);
    if (tabId) {
      await chrome.tabs.remove(tabId);
      this.tabs.delete(platform);
    }
  }

  async closeTabByUrl(url) {
    const tab = await this.findTabByUrl(url);
    if (!tab) return;
    for (const [platform, tabId] of this.tabs) {
      if (tabId === tab.id) {
        this.tabs.delete(platform);
        break;
      }
    }
    await chrome.tabs.remove(tab.id);
  }

  async activatePlatformTab(platform) {
    const existingTab = await this.findPlatformTab(platform);

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return true;
    } else {
      const tab = await this.openPlatformTab(platform, true);
      await chrome.tabs.update(tab.id, { active: true });
      return true;
    }
  }

  async openPlatformConversation(platform) {
    const existingTab = await this.findPlatformTab(platform);

    if (existingTab) {
      await chrome.tabs.update(existingTab.id, { active: true });
      return { success: true, tabId: existingTab.id };
    } else {
      const tab = await this.openPlatformTab(platform, true);
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

      const newConversation = {
        id: this.generateId(),
        name: name || `会话 ${conversations.length + 1}`,
        mode: mode || 'brainstorming',
        contextMode,
        sendMode,
        members: members || [],
        memberSettings: options.memberSettings || {},
        memberOrder: options.memberOrder || memberIds,
        expertId: options.expertId || null,
        memberUrls: {},
        memberLastMessageIds: {},
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      conversations.push(newConversation);
      await StorageManager.saveConversations(conversations);

      console.log('[Background] 会话创建完成，ID:', newConversation.id, '成员数:', newConversation.members?.length);

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
      conversation.memberUrls = {};
      conversation.memberLastMessageIds = {};
      conversation.updatedAt = Date.now();
      await StorageManager.saveConversations(conversations);
      return conversation;
    }

    return null;
  }

  async addMessage(conversationId, memberId, content, isUser = false) {
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
          memberId,
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
    const found = conversations.find(c => c.id === conversationId) || null;

    if (!found) {
      console.error('[Background] getConversation 找不到会话:', conversationId, '当前会话数:', conversations.length);
      console.log('[Background] 当前所有会话ID:', conversations.map(c => c.id));
    } else {
      console.log('[Background] getConversation 找到会话:', conversationId, '成员数:', found.members?.length);
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
let modelManager;
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
  promptManager = new PromptManager();
  promptFolderManager = new PromptFolderManager();
  modelManager = new ModelManager();
  flowManager = new FlowManager();
  flowExecutor = new FlowExecutor(tabManager, conversationManager, senderFactory);
  teamManager = new TeamManager();
  expertManager = new ExpertManager();
  flowTestRunner = new FlowTestRunner(conversationManager, senderFactory, flowExecutor);

  // 确保模型已导入
  const models = await modelManager.getModels();
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
}

async function conversationOneShot(modelId, content, systemPrompt) {
  const model = await modelManager.getModelById(modelId);
  if (!model) throw new Error('模型不存在');

  const accessMethod = model.accessMethod || 'web';
  const sender = senderFactory.getSender(accessMethod);

  let response;
  if (accessMethod === 'api') {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content });
    response = await sender.send(messages, {
      provider: model.provider,
      model: model.model,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey
    });
  } else {
    response = await sender.send(content, {
      provider: model.provider
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

          const conversation = await this.conversationManager.getConversation(conversationId);
          const combinedContent = await wsManager.combineResponses(responses, conversation);

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
          expertId: request.expertId,
          flowId: request.flowId
        }
      )
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
          const memberUrls = conversation.memberUrls || {};
          const deletedConversations = [];

          if (Object.keys(memberUrls).length > 0) {
            for (const [memberId, conversationUrl] of Object.entries(memberUrls)) {
              const member = conversation.members.find(m => m.id === memberId);
              if (!member || !conversationUrl) continue;
              try {
                await aiMessageManager.deletePlatformConversation(member.provider, conversationUrl);
                deletedConversations.push({ provider: member.provider, url: conversationUrl });
              } catch (error) {
                console.error(`[AIMessageManager] ❌ ${member.provider} 平台会话删除失败:`, error.message);
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
      promptManager.getPrompts().then(sendResponse);
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
      modelManager.getModelById(request.modelId).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;

    case 'openFlowDesigner':
      (async () => {
        try {
          const url = request.flowId 
            ? `flow-designer/flow-designer.html?flowId=${encodeURIComponent(request.flowId)}`
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

          const results = await Promise.allSettled(
            modelIds.map(async (modelId) => {
              const model = await modelManager.getModelById(modelId);
              if (!model) {
                return { modelId, modelName: '未知', isVirtual: false, success: false, error: '模型不存在' };
              }

              if (model.isVirtual) {
                try {
                  const flow = await flowManager.getFlowById(model.flowId);
                  const result = await flowExecutor.executeFlow(flow, userInput, context);
                  return {
                    modelId: model.id,
                    modelName: model.name,
                    isVirtual: true,
                    success: true,
                    result
                  };
                } catch (error) {
                  return { modelId: model.id, modelName: model.name, isVirtual: true, success: false, error: error.message };
                }
              } else {
                try {
                  const accessMethod = model.accessMethod || 'web';
                  const sender = senderFactory.getSender(accessMethod);
                  const response = await sender.send(userInput, {
                    provider: model.provider,
                    model: model.model,
                    baseUrl: model.baseUrl || '',
                    apiKey: model.apiKey || ''
                  });
                  return {
                    modelId: model.id,
                    modelName: model.name,
                    isVirtual: false,
                    success: true,
                    result: { success: true, content: response.content, conversationUrl: response.conversationUrl }
                  };
                } catch (error) {
                  return { modelId: model.id, modelName: model.name, isVirtual: false, success: false, error: error.message };
                }
              }
            })
          );

          sendResponse({ success: true, results: results.map(r => r.value || r.reason) });
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
      expertManager.getExperts().then(sendResponse).catch(error => sendResponse({ error: error.message }));
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
          const response = await sender.send('测试连接', {
            provider: request.platform
          });
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
          const result = await tabManager.openPlatformConversation(request.provider, targetUrl);
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

      const models = await modelManager.getModels();
      const webPendingMemberIds = pendingMemberIds.filter(memberId => {
        const member = conversation.members.find(m => m.id === memberId);
        if (!member) return false;
        const modelConfig = models.find(m => m.provider === member.provider && m.model === member.model);
        return (modelConfig?.accessMethod || 'web') === 'web';
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
        const provider = PROVIDERS[member.provider];
        const memberUrl = conversation.memberUrls?.[memberId];
        const isBaseUrl = !memberUrl || memberUrl === provider?.baseUrl;

        try {
          console.log(`[Background] 检查成员 ${member.name} (${member.provider}) 标签页状态`);
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
            console.log(`[Background] 未找到标签页: member: ${member.name}, url=${memberUrl}, provider: ${member.provider}`);
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

init();
