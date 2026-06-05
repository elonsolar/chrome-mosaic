class ConversationWorker {
  constructor(conversationId, conversationManager, onMessageSaved) {
    this.conversationId = conversationId;
    this.conversationManager = conversationManager;
    this.onMessageSaved = onMessageSaved;
    
    this.queue = new MessageQueue();
    this.members = new Map();
    this.mode = 'brainstorm';
    this.memberOrder = [];
    this.currentMemberIndex = 0;
    
    this.isRunning = false;
    this._resolveSchedule = null;
    this.onMemberProcessing = null;
    this.onContentChunk = null;
    
    this.queue.onEnqueue = () => this._wakeUp();
  }

  setMode(mode) {
    this.mode = mode;
  }

  setMemberOrder(memberOrder) {
    this.memberOrder = memberOrder;
  }

  addMember(memberId, entity) {
    const existing = this.members.get(memberId);
    if (existing) {
      existing.entity = entity;
      existing.status = entity.status || 'online';
      console.log(`[ConversationWorker] 更新成员: ${memberId}, isBusy: ${existing.isBusy}`);
    } else {
      this.members.set(memberId, {
        entity,
        isBusy: false,
        status: entity.status || 'online'
      });
      console.log(`[ConversationWorker] 添加成员: ${memberId}, 状态: ${entity.status}`);
    }
  }

  updateMemberStatus(memberId, status) {
    const member = this.members.get(memberId);
    if (member) {
      member.status = status;
      member.entity.status = status;
      console.log(`[ConversationWorker] 成员 ${memberId} 状态更新为: ${status}`);
      this._wakeUp();
    }
  }

  getOnlineMemberIds() {
    return [...this.members.entries()]
      .filter(([_, m]) => m.status === 'online')
      .map(([id, _]) => id);
  }

  getMemberStatus(memberId) {
    const member = this.members.get(memberId);
    return member ? { status: member.status, isBusy: member.isBusy } : null;
  }

  enqueueMessage(content) {
    return this.queue.enqueue(content);
  }

  enqueueLoopTask(task) {
    return this.queue.enqueueLoopTask(task);
  }

  _wakeUp() {
    if (this._resolveSchedule) {
      this._resolveSchedule();
      this._resolveSchedule = null;
    }
  }

  async _waitForSignal() {
    return new Promise(resolve => {
      this._resolveSchedule = resolve;
    });
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[ConversationWorker] 启动，模式: ${this.mode}`);
    
    try {
      if (this.mode === 'brainstorm') {
        await this._runBrainstorm();
      } else {
        await this._runDiscussion();
      }
    } catch (error) {
      console.error('[ConversationWorker] 执行异常:', error);
    } finally {
      this.isRunning = false;
      console.log('[ConversationWorker] 停止');
    }
  }

  async _runBrainstorm() {
    while (this.isRunning) {
      const onlineIds = this.getOnlineMemberIds();
      this.queue.removeCompleted(onlineIds);
      
      if (this.queue.length === 0) {
        await this._waitForSignal();
        continue;
      }

      // 检查队首是否是 loopTask
      const firstMsg = this.queue.peek();
      if (firstMsg && firstMsg.type === 'loop') {
        this.queue.dequeue();
        await this._executeLoopTask(firstMsg.task);
        continue;
      }

      let hasWork = false;
      
      for (const [memberId, member] of this.members) {
        if (member.status !== 'online' || member.isBusy) continue;
        
        const msgIndices = this.queue.getAllUnconsumedForMember(memberId);
        if (msgIndices.length === 0) continue;
        
        const contents = msgIndices.map(i => this.queue.queue[i].content);
        const mergedContent = contents.join('\n\n');

        this.queue.markConsumedBatch(memberId, msgIndices);
        
        member.isBusy = true;
        hasWork = true;

        if (this.onMemberProcessing) {
          this.onMemberProcessing(memberId);
        }
        
        this._executeMember(memberId, member, mergedContent)
          .then(() => {
            member.isBusy = false;
            this._wakeUp();
          })
          .catch(() => {
            member.isBusy = false;
            this._wakeUp();
          });
      }
      
      if (!hasWork) {
        await this._waitForSignal();
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  async _runDiscussion() {
    while (this.isRunning) {
      const onlineIds = this.getOnlineMemberIds();
      
      if (this.queue.length === 0) {
        await this._waitForSignal();
        continue;
      }

      const msg = this.queue.peek();

      // 处理 loopTask 类型消息
      if (msg.type === 'loop') {
        this.queue.dequeue();
        await this._executeLoopTask(msg.task);
        continue;
      }

      // 延迟保存用户消息（避免排队消息污染上下文）
      if (!msg.saved) {
        await this.conversationManager.addMessage(
          this.conversationId, null, msg.content, MessageType.USER
        );
        msg.saved = true;
        console.log(`[ConversationWorker] 用户消息已保存: ${msg.content.substring(0, 20)}...`);
      }

      if (this.currentMemberIndex >= this.memberOrder.length) {
        this.queue.removeCompleted(onlineIds);
        this.currentMemberIndex = 0;
        continue;
      }

      const memberId = this.memberOrder[this.currentMemberIndex];
      const member = this.members.get(memberId);
      
      if (!member) {
        this.currentMemberIndex++;
        continue;
      }
      
      if (member.status !== 'online') {
        this.queue.markConsumed(memberId, 0);
        this.currentMemberIndex++;
        continue;
      }
      
      if (member.isBusy) {
        await this._waitForSignal();
        continue;
      }

      member.isBusy = true;

      if (this.onMemberProcessing) {
        this.onMemberProcessing(memberId);
      }
      
      try {
        await this._executeMember(memberId, member, msg.content);
      } catch (error) {
        console.error(`[ConversationWorker] 成员 ${memberId} 执行失败:`, error);
        if (this.onMemberError) {
          this.onMemberError(memberId, error.message || '执行失败');
        }
      }
      
      member.isBusy = false;
      this.queue.markConsumed(memberId, 0);
      this.currentMemberIndex++;
      
      if (this.currentMemberIndex >= this.memberOrder.length) {
        this.queue.removeCompleted(onlineIds);
        this.currentMemberIndex = 0;
      }
      
      this._wakeUp();
    }
  }

  async _executeLoopTask(task) {
    if (!task) return;
    
    console.log('[ConversationWorker] 开始执行 loopTask');
    try {
      await task.execute({ isRunning: () => this.isRunning });
      console.log('[ConversationWorker] loopTask 执行完成');
    } catch (error) {
      console.error('[ConversationWorker] loopTask 执行失败:', error);
    }
    this._wakeUp();
  }

  async _executeMember(memberId, member, content) {
    console.log(`[ConversationWorker] 成员 ${memberId} 开始执行`);
    
    // 从 storage 读取最新数据
    const conversation = await this.conversationManager.getConversation(this.conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }
    
    const context = new ConversationContext(conversation);
    console.log(`[ConversationWorker] 成员 ${memberId} 读取到 memberUrls:`, JSON.stringify(context.memberUrls));
    
    const onChunk = (delta, fullContent) => {
      if (this.onContentChunk) {
        this.onContentChunk(memberId, delta, fullContent);
      }
    };
    
    const result = await member.entity.execute(content, context, onChunk);
    
    if (result.success && result.content) {
      const entityId = result.memberId || result.expertId;
      console.log(`[ConversationWorker] 成员 ${entityId} 执行完成, context.memberUrls:`, JSON.stringify(context.memberUrls));
      
      // 原子保存：消息 + memberUrls 一起写入，避免竞态覆盖
      const message = await this.conversationManager.addMessageWithMeta(
        this.conversationId,
        entityId,
        result.content,
        MessageType.MEMBER,
        {
          memberUrls: context.memberUrls
        }
      );
      
      if (message && message.id) {
        // 消息 ID 已知，更新 memberLastMessageIds
        context.memberLastMessageIds[entityId] = message.id;
        await this.conversationManager.updateConversation(this.conversationId, {
          memberLastMessageIds: context.memberLastMessageIds
        });
      }
      
      console.log(`[ConversationWorker] 成员 ${entityId} 消息和 memberUrls 已原子保存`);
      
      if (this.onMessageSaved) {
        this.onMessageSaved(this.conversationId, message);
      }
      
      await this._closePlatformTab(entityId, context);
    }
    
    return result;
  }

  async _closePlatformTab(entityId, context) {
    const url = context.getMemberUrl(entityId);
    if (!url) return;
    
    try {
      if (typeof tabManager !== 'undefined' && tabManager) {
        await tabManager.closeTabByUrl(url);
      }
    } catch (error) {
      console.warn(`[ConversationWorker] 关闭标签页失败: ${error.message}`);
    }
  }

  stop() {
    this.isRunning = false;
    this._wakeUp();
    this.queue.clear();
    console.log('[ConversationWorker] 已停止并清空队列');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConversationWorker;
}
