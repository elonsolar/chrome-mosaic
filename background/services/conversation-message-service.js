class ConversationMessageService {
  constructor(
    conversationManager,
    entityFactory,
    progressTracker,
    progressNotifier,
    floatWindowService
  ) {
    this.conversationManager = conversationManager;
    this.entityFactory = entityFactory;
    this.progressTracker = progressTracker;
    this.progressNotifier = progressNotifier;
    this.floatWindowService = floatWindowService;
  }

  async processUserMessage(conversationId, userMessage) {
    console.log('[ConversationMessageService] 处理用户消息:', conversationId);

    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

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

    const sendMode = context.conversationMode === 'discussion' ? 'sequential' : 'parallel';

    try {
      const results = await this._executeEntities(entities, userMessage, context);

      await this._saveResults(conversationId, results, sendMode);

      await this._updateConversationContext(conversationId, context);

      await this._showCompletionMessage(results, context);

      return await this.conversationManager.getConversation(conversationId);

    } finally {
      unsubscribe();
    }
  }

  async _executeEntities(entities, input, context) {
    if (!input || input.trim().length === 0) {
      throw new Error('输入内容不能为空');
    }

    const sendMode = context.conversationMode === 'discussion' ? 'sequential' : 'parallel';

    if (sendMode === 'sequential') {
      const results = [];
      for (const entity of entities) {
        try {
          const result = await entity.execute(input, context);
          results.push({ status: 'fulfilled', value: result });

          if (result.success && result.content) {
            const message = await this.conversationManager.addMessage(
              context.conversationId,
              result.memberId,
              result.content
            );

            if (message && message.id) {
              context.memberLastMessageIds[result.memberId] = message.id;
              context.conversation.messages.push(message);
              await this.conversationManager.updateConversation(context.conversationId, {
                memberLastMessageIds: context.memberLastMessageIds
              });
            }

            result.messageId = message.id;
          }
        } catch (error) {
          results.push({
            status: 'rejected',
            reason: error
          });
        }
      }
      return results;
    } else {
      // 头脑风暴模式：并行执行，谁响应就立即保存，不等待所有完成
      entities.map(async (entity) => {
        try {
          const result = await entity.execute(input, context);

          if (result.success && result.content) {
            const message = await this.conversationManager.addMessage(
              context.conversationId,
              result.memberId,
              result.content
            );

            if (message && message.id) {
              context.memberLastMessageIds[result.memberId] = message.id;
              context.conversation.messages.push(message);
              await this.conversationManager.updateConversation(context.conversationId, {
                memberLastMessageIds: context.memberLastMessageIds
              });
            }
          }
        } catch (error) {
          console.error('[ConversationMessageService] 实体执行失败:', error);
        }
      });
      
      // 不等待所有完成，立即返回空数组
      return [];
    }
  }

  async _saveResults(conversationId, results, sendMode) {
    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation.memberLastMessageIds) {
      conversation.memberLastMessageIds = {};
    }

    let needsUpdate = false;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const data = result.value;

        if (data.messageId) {
          continue;
        }

        if (data.success && data.content) {
          const message = await this.conversationManager.addMessage(
            conversationId,
            data.memberId || data.expertId,
            data.content
          );

          if (message && message.id) {
            const memberId = data.memberId || data.expertId;
            conversation.memberLastMessageIds[memberId] = message.id;
            needsUpdate = true;
          }
        }
      } else if (result.status === 'rejected') {
        console.error('[ConversationMessageService] 实体执行失败:', result.reason);
      }
    }

    if (needsUpdate) {
      await this.conversationManager.updateConversation(conversationId, {
        memberLastMessageIds: conversation.memberLastMessageIds
      });
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
