class ConversationMessageService {
  constructor(
    conversationManager,
    entityFactory,
    progressTracker,
    progressNotifier,
    floatWindowService,
    tabManager
  ) {
    this.conversationManager = conversationManager;
    this.entityFactory = entityFactory;
    this.progressTracker = progressTracker;
    this.progressNotifier = progressNotifier;
    this.floatWindowService = floatWindowService;
    this.tabManager = tabManager;
    
    // 会话Worker管理
    this.workers = new Map(); // conversationId -> ConversationWorker
  }

  async processUserMessage(conversationId, userMessage) {
    console.log('[ConversationMessageService] ========== 处理用户消息 ==========');
    console.log('[ConversationMessageService] conversationId:', conversationId);
    console.log('[ConversationMessageService] userMessage:', userMessage);

    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

    console.log('[ConversationMessageService] 会话模式:', conversation.mode);
    console.log('[ConversationMessageService] expertId:', conversation.expertId);
    console.log('[ConversationMessageService] members:', conversation.members?.length);

    // 专家问答模式：不使用队列，直接执行
    if (conversation.expertId) {
      return await this._processExpertQA(conversationId, userMessage, conversation);
    }

    // 头脑风暴/圆桌模式：使用队列
    return await this._processWithQueue(conversationId, userMessage, conversation);
  }

  async _processExpertQA(conversationId, userMessage, conversation) {
    const settings = { floatWindow: false };
    try {
      const result = await chrome.storage.local.get('settings');
      Object.assign(settings, result.settings || {});
    } catch (error) {
      console.warn('[ConversationMessageService] 获取设置失败，使用默认值:', error);
    }

    conversation.useFloatWindow = settings.floatWindow !== false;
    const context = new ConversationContext(conversation);

    await this._showUserMessage(userMessage, context);

    const userMsg = await this.conversationManager.addMessage(conversationId, null, userMessage, MessageType.USER);
    context.conversation.messages.push(userMsg);

    const entities = await this.entityFactory.createEntitiesFromConversation(conversation);
    entities.forEach(entity => entity.setProgressTracker(this.progressTracker));

    this.progressTracker.reset();

    const unsubscribe = this.progressTracker.onProgress((progress) => {
      this.progressNotifier.notify(conversationId, progress);
    });

    try {
      const results = [];
      for (const entity of entities) {
        try {
          const result = await entity.execute(userMessage, context);
          results.push({ status: 'fulfilled', value: result });

          if (result.success && result.content) {
            const entityId = result.expertId;
            const message = await this.conversationManager.addMessage(
              context.conversationId,
              entityId,
              result.content
            );

            if (message && message.id) {
              context.memberLastMessageIds[entityId] = message.id;
              context.conversation.messages.push(message);
              await this.conversationManager.updateConversation(context.conversationId, {
                memberLastMessageIds: context.memberLastMessageIds
              });
            }
          }
        } catch (error) {
          console.error('[ConversationMessageService] 专家执行异常:', error);
          results.push({ status: 'rejected', reason: error });
        }
      }

      await this._updateConversationContext(conversationId, context);
      await this._showCompletionMessage(results, context);

      return await this.conversationManager.getConversation(conversationId);
    } finally {
      unsubscribe();
    }
  }

  async _processWithQueue(conversationId, userMessage, conversation) {
    const settings = { floatWindow: false };
    try {
      const result = await chrome.storage.local.get('settings');
      Object.assign(settings, result.settings || {});
    } catch (error) {
      console.warn('[ConversationMessageService] 获取设置失败，使用默认值:', error);
    }

    conversation.useFloatWindow = settings.floatWindow !== false;
    const context = new ConversationContext(conversation);

    // 显示用户消息到浮窗
    await this._showUserMessage(userMessage, context);

    // 获取或创建Worker
    let worker = this.workers.get(conversationId);
    if (!worker) {
      worker = this._createWorker(conversationId);
    }

    // 设置模式和成员顺序
    const sendMode = context.conversationMode === 'discussion' ? 'discussion' : 'brainstorm';
    worker.setMode(sendMode);

    // 头脑风暴：立即保存用户消息
    // 圆桌讨论：延迟保存（在 Worker 中处理，避免排队消息污染上下文）
    if (sendMode === 'brainstorm') {
      await this.conversationManager.addMessage(conversationId, null, userMessage, MessageType.USER);
    }
    if (conversation.memberOrder) {
      worker.setMemberOrder(conversation.memberOrder);
    }

    // 创建实体并添加到Worker
    const entities = await this.entityFactory.createEntitiesFromConversation(conversation);
    entities.forEach(entity => {
      entity.setProgressTracker(this.progressTracker);
      worker.addMember(entity.id, entity);
    });

    // 入队（只存消息内容，执行时从 storage 读最新数据）
    worker.enqueueMessage(userMessage);

    // 启动Worker（如果未运行）
    if (!worker.isRunning) {
      worker.start();
    }

    // 立即返回当前会话状态（不等待完成）
    return await this.conversationManager.getConversation(conversationId);
  }

  _createWorker(conversationId) {
    const worker = new ConversationWorker(
      conversationId,
      this.conversationManager,
      (convId, message) => {
        // 消息保存后的回调
        if (message) {
          this.progressNotifier.notify(convId, {
            type: 'message_saved',
            messageId: message.id,
            memberId: message.memberId
          });
        }
      }
    );
    this.workers.set(conversationId, worker);
    console.log(`[ConversationMessageService] 创建Worker: ${conversationId}`);
    return worker;
  }

  getWorker(conversationId) {
    return this.workers.get(conversationId);
  }

  async setLoopTask(conversationId, task) {
    console.log(`[ConversationMessageService] 设置 loopTask: ${conversationId}`);
    
    // 获取会话信息以确定模式
    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

    let worker = this.workers.get(conversationId);
    if (!worker) {
      worker = this._createWorker(conversationId);
    }

    // 设置模式和成员顺序
    const sendMode = conversation.mode === 'discussion' ? 'discussion' : 'brainstorm';
    worker.setMode(sendMode);
    if (conversation.memberOrder) {
      worker.setMemberOrder(conversation.memberOrder);
    }

    // 创建实体并添加到 Worker
    const entities = await this.entityFactory.createEntitiesFromConversation(conversation);
    entities.forEach(entity => {
      entity.setProgressTracker(this.progressTracker);
      worker.addMember(entity.id, entity);
    });

    // 将 loopTask 作为特殊消息入队
    worker.enqueueLoopTask(task);

    // 确保 Worker 正在运行
    if (!worker.isRunning) {
      worker.start();
    }
  }

  stopWorker(conversationId) {
    const worker = this.workers.get(conversationId);
    if (worker) {
      worker.stop();
      this.workers.delete(conversationId);
      console.log(`[ConversationMessageService] 停止Worker: ${conversationId}`);
    }
  }

  async _closePlatformTab(entityId, context) {
    if (!this.tabManager) {
      console.warn('[ConversationMessageService] tabManager 未初始化，跳过关闭标签页');
      return;
    }

    const url = context.getMemberUrl(entityId);
    if (!url) {
      console.log('[ConversationMessageService] 成员无平台URL，跳过关闭标签页:', entityId);
      return;
    }

    try {
      console.log('[ConversationMessageService] 关闭平台标签页:', url);
      await this.tabManager.closeTabByUrl(url);
      console.log('[ConversationMessageService] 标签页已关闭:', url);
    } catch (error) {
      console.warn('[ConversationMessageService] 关闭标签页失败:', error.message);
    }
  }

  async _updateConversationContext(conversationId, context) {
    const updates = context.toSerializable();
    await this.conversationManager.updateConversation(conversationId, updates);
  }

  async _showUserMessage(content, context) {
    if (context.useFloatWindow) {
      await this.floatWindowService.addMessage({
        role: '用户',
        content: content,
        isUser: true,
        isError: false
      });
    }
  }

  async _showCompletionMessage(results, context) {
    if (!context.useFloatWindow) return;

    // 头脑风暴模式下 results 为空，跳过完成消息
    if (!results || results.length === 0) return;

    const successCount = results.filter(r => 
      r.status === 'fulfilled' && r.value && r.value.success
    ).length;
    const totalCount = results.length;
    const errorCount = totalCount - successCount;

    let message = `执行完成: ${successCount}/${totalCount} 个任务成功`;
    if (errorCount > 0) {
      message += ` (${errorCount} 个失败)`;
    }

    try {
      await this.floatWindowService.addMessage({
        role: '系统',
        content: message,
        isUser: false,
        isError: false
      });
    } catch (error) {
      console.error('[ConversationMessageService] 完成消息发送失败:', error);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConversationMessageService;
}
