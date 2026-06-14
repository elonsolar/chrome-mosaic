class ConversationMessageService {
  constructor(
    conversationManager,
    entityFactory,
    progressTracker,
    progressNotifier,
    floatWindowService,
    tabManager,
    senderFactory
  ) {
    this.conversationManager = conversationManager;
    this.entityFactory = entityFactory;
    this.progressTracker = progressTracker;
    this.progressNotifier = progressNotifier;
    this.floatWindowService = floatWindowService;
    this.tabManager = tabManager;
    this.senderFactory = senderFactory;
    
    // 会话Worker管理
    this.workers = new Map(); // conversationId -> ConversationWorker
  }

  async processUserMessage(conversationId, userMessage, targetMemberIds = null) {
    console.log('[ConversationMessageService] ========== 处理用户消息 ==========');
    console.log('[ConversationMessageService] conversationId:', conversationId);
    console.log('[ConversationMessageService] userMessage:', userMessage);
    console.log('[ConversationMessageService] targetMemberIds:', targetMemberIds);

    const conversation = await this.conversationManager.getConversation(conversationId);
    if (!conversation) {
      throw new Error('会话不存在');
    }

    console.log('[ConversationMessageService] 会话模式:', conversation.mode);
    console.log('[ConversationMessageService] expertId:', conversation.expertId);
    console.log('[ConversationMessageService] members:', conversation.members?.length);

    if (conversation.expertId) {
      return await this._processExpertQA(conversationId, userMessage, conversation);
    }

    return await this._processWithQueue(conversationId, userMessage, conversation, targetMemberIds);
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

    // 异步生成标题（不阻塞主流程）
    this._maybeGenerateTitle(conversationId, conversation, userMessage);

    const entities = await this.entityFactory.createEntitiesFromConversation(conversation);
    entities.forEach(entity => entity.setProgressTracker(this.progressTracker));

    this.progressTracker.reset();

    const unsubscribe = this.progressTracker.onProgress((progress) => {
      this.progressNotifier.notify(conversationId, progress);
    });

    // 构建输入：如果有历史摘要，放在用户输入前面
    let fullInput = userMessage;
    if (conversation.expertSummary && !conversation.expertSummaryFailed) {
      fullInput = this._formatSummary(conversation.expertSummary) + '\n\n' + userMessage;
    }

    try {
      const results = [];
      for (const entity of entities) {
        try {
          const result = await entity.execute(fullInput, context);
          results.push({ status: 'fulfilled', value: result });

          if (result.success && result.content) {
            const entityId = result.expertId;
            
            // 保存 conversationUrl 到 context
            if (result.conversationUrl) {
              context.setMemberUrl(entityId, result.conversationUrl);
              console.log('[ConversationMessageService] 保存专家URL:', entityId, result.conversationUrl);
            }
            
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

            // 关闭 web 模型的标签页
            await this._closePlatformTab(entityId, context);

            // 异步生成摘要（不阻塞主流程）
            if (this._updateExpertSummaryAsync) {
              this._updateExpertSummaryAsync(
                conversationId,
                userMessage,
                result.content,
                conversation.expertSummary,
                conversation.expertSummaryFailed,
                conversation.summaryConversationUrl
              ).catch(err => console.error('[ConversationMessageService] 摘要更新异常:', err));
            }
          }
        } catch (error) {
          console.error('[ConversationMessageService] 专家执行异常:', error);
          results.push({ status: 'rejected', reason: error });
        }
      }

      const failedResult = results.find(r => r.status === 'fulfilled' && r.value?.canResume);
      if (failedResult) {
        const { resumeInfo, error: errorMsg, expertName } = failedResult.value;
        console.log('[ConversationMessageService] 专家执行可恢复失败:', errorMsg);

        await this.conversationManager.updateConversation(conversationId, {
          pendingResume: resumeInfo
        });

        chrome.runtime.sendMessage({
          type: 'flowExecutionError',
          conversationId,
          error: errorMsg,
          canResume: true,
          failedNodeName: resumeInfo.failedNodeName,
          completedNodeIds: resumeInfo.completedNodeIds
        }).catch(() => {});
      }

      await this._updateConversationContext(conversationId, context);
      await this._showCompletionMessage(results, context);

      return await this.conversationManager.getConversation(conversationId);
    } finally {
      unsubscribe();
    }
  }

  async _updateExpertSummaryAsync(conversationId, userMessage, assistantReply, oldSummary, expertSummaryFailed, summaryConversationUrl) {
    // 如果已经失败，跳过
    if (expertSummaryFailed) {
      console.log('[ConversationMessageService] 摘要生成已标记为失败，跳过');
      return;
    }

    try {
      // 获取 helperModel 配置
      const settings = await StorageManager.getSettings();
      const helperModelId = settings.helperModel;
      
      console.log('[ConversationMessageService] 摘要生成 - helperModelId:', helperModelId);
      
      if (!helperModelId) {
        console.warn('[ConversationMessageService] 未配置辅助模型，跳过摘要生成');
        return;
      }

      const helperModel = await platformManager.getModelById(helperModelId);
      console.log('[ConversationMessageService] 摘要生成 - helperModel:', helperModel?.code, helperModel?.platformName);
      
      if (!helperModel) {
        console.warn('[ConversationMessageService] 辅助模型不存在，跳过摘要生成');
        return;
      }

      // 生成摘要
      console.log('[ConversationMessageService] 开始生成摘要...', { summaryConversationUrl });
      const result = await this._generateExpertSummary(
        userMessage, 
        assistantReply, 
        oldSummary, 
        helperModel,
        summaryConversationUrl
      );

      console.log('[ConversationMessageService] 摘要生成结果:', result.summary ? '成功' : '失败');

      if (result.summary) {
        // 成功：更新摘要和会话 URL
        await this.conversationManager.updateConversation(conversationId, {
          expertSummary: result.summary,
          expertSummaryUpdatedAt: Date.now(),
          expertSummaryFailed: false,
          summaryConversationUrl: result.conversationUrl
        });
        console.log('[ConversationMessageService] 摘要已更新');
        // 关闭摘要平台标签页
        if (result.conversationUrl && this.tabManager) {
          this.tabManager.closeTabByUrl(result.conversationUrl).catch(() => {});
        }
      } else {
        // 失败：标记失败，发送提示
        await this.conversationManager.updateConversation(conversationId, {
          expertSummaryFailed: true
        });
        console.warn('[ConversationMessageService] 摘要生成失败，已标记为失败');
        
        // 发送"去登陆"提示
        if (this.floatWindowService) {
          await this.floatWindowService.addMessage({
            role: '系统',
            content: '⚠️ 摘要生成失败，可能是网页模型未登录。请点击"去登陆"按钮登录后重试。',
            isUser: false,
            isError: false
          });
        }
      }
    } catch (error) {
      console.error('[ConversationMessageService] 摘要更新异常:', error);
    }
  }

  async _generateExpertSummary(userMessage, assistantReply, oldSummary, model, summaryConversationUrl) {
    let prompt;
    
    if (!summaryConversationUrl) {
      // 第一次：发送系统提示词 + 问题 + 答案
      prompt = `你是摘要助手，每次接收新问题和答案，生成新的摘要。

格式要求：
之前讨论了：[一句话总结]
关键信息：[关键点1, 关键点2]

要求：
1. 一句话总结之前讨论的内容
2. 列出关键信息点
3. 长度控制在300字以内
4. 用于下一轮对话的上下文参考

用户问题：${userMessage}

AI回答：${assistantReply}

请直接输出摘要内容，不要添加任何前缀或解释：`;
    } else {
      // 后续：只发送 问题 + 答案
      prompt = `用户问题：${userMessage}

AI回答：${assistantReply}

请结合历史对话，生成新的摘要（格式：之前讨论了：... 关键信息：...）：`;
    }

    const sender = this.senderFactory?.getSender(model.accessMethod || 'web');
    
    if (!sender) {
      console.error('[ConversationMessageService] 无法获取发送器');
      return { summary: null, conversationUrl: null };
    }

    // 设置超时（60秒）
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('摘要生成超时')), 60000);
    });

    try {
      const result = await Promise.race([
        sender.send(prompt, {
          ...model,
          conversationUrl: summaryConversationUrl || undefined
        }),
        timeoutPromise
      ]);

      if (result && result.content) {
        // 截断过长的摘要
        const summary = result.content.substring(0, 300);
        return { 
          summary, 
          conversationUrl: result.conversationUrl || summaryConversationUrl 
        };
      }
      return { summary: null, conversationUrl: null };
    } catch (error) {
      console.error('[ConversationMessageService] 摘要生成错误:', error.message);
      return { summary: null, conversationUrl: null };
    }
  }

  _formatSummary(summary) {
    return `<summary>
# 专家会话历史摘要

提示：这是历史摘要，可能不一定和当前任务相关

---

${summary}
</summary>`;
  }

  async _updateConversationSummaryAsync(conversationId) {
    try {
      const conversation = await this.conversationManager.getConversation(conversationId);
      if (!conversation) return;

      if (conversation.conversationSummaryFailed) {
        console.log('[ConversationMessageService] 讨论摘要已标记为失败，跳过');
        return;
      }

      const settings = await StorageManager.getSettings();
      const helperModelId = settings.helperModel;

      if (!helperModelId) {
        console.warn('[ConversationMessageService] 未配置辅助模型，跳过讨论摘要生成');
        return;
      }

      const helperModel = await platformManager.getModelById(helperModelId);
      if (!helperModel) {
        console.warn('[ConversationMessageService] 辅助模型不存在，跳过讨论摘要生成');
        return;
      }

      const oldSummary = conversation.conversationSummary || '';
      const summaryConversationUrl = conversation.summaryConversationUrl || null;
      const lastSummaryCount = conversation.lastSummaryMsgCount || 0;

      const messages = conversation.messages || [];
      const newMessages = messages.slice(lastSummaryCount);

      if (newMessages.length < 2) {
        console.log('[ConversationMessageService] 自上次摘要后消息不足，跳过');
        return;
      }

      const memberMap = new Map((conversation.members || []).map(m => [m.id, m]));
      const allParts = newMessages.map(m => {
        if (m.isUser) return `用户：${m.content}`;
        if (m.type === 'member') {
          const name = memberMap.get(m.memberId)?.name || '成员';
          return `${name}：${m.content}`;
        }
        return null;
      }).filter(Boolean);

      const newContentText = allParts.join('\n');

      console.log('[ConversationMessageService] 开始生成讨论摘要...');
      const result = await this._generateConversationSummary(
        newContentText, oldSummary, helperModel, summaryConversationUrl
      );

      if (result.summary) {
        const cleaned = result.summary.replace(/^(备份摘要：?|对话摘要：?|摘要：?|总结：?)/, '').trim();
        await this.conversationManager.updateConversation(conversationId, {
          conversationSummary: cleaned,
          conversationSummaryUpdatedAt: Date.now(),
          conversationSummaryFailed: false,
          lastSummaryMsgCount: messages.length,
          summaryConversationUrl: result.conversationUrl
        });
        console.log('[ConversationMessageService] 讨论摘要已更新');
        // 关闭摘要平台标签页
        if (result.conversationUrl && this.tabManager) {
          this.tabManager.closeTabByUrl(result.conversationUrl).catch(() => {});
        }

        chrome.runtime.sendMessage({
          type: 'summaryUpdated',
          conversationId,
          summary: cleaned,
          updatedAt: Date.now()
        }).catch(() => {});
      } else {
        await this.conversationManager.updateConversation(conversationId, {
          conversationSummaryFailed: true
        });
        console.warn('[ConversationMessageService] 讨论摘要生成失败');
      }
    } catch (error) {
      console.error('[ConversationMessageService] 讨论摘要更新异常:', error);
    }
  }

  async _generateConversationSummary(newContentText, oldSummary, model, summaryConversationUrl) {
    let prompt;

    if (!summaryConversationUrl) {
      prompt = `你是讨论摘要助手。请根据以下对话内容，生成一份给用户阅读的讨论摘要。

格式要求（Markdown）：

**核心话题**：[一句话概括讨论主题]

**主要观点**：
- [成员名]：[观点摘要，一句话]
- [成员名]：[观点摘要，一句话]

**共识**：[大家一致认同的内容，或"暂无明确共识"]

**分歧**：[存在争议或不同看法的点，或"暂无明显分歧"]

要求：
1. 简洁客观，每个观点不超过一句话
2. 按成员归类，标注成员名
3. 突出关键信息和决策点
4. 便于用户快速回顾本轮讨论
5. 直接输出 Markdown 内容，不要添加额外前缀或解释

---

对话内容：
${newContentText}`;
    } else {
      prompt = `历史摘要：
${oldSummary}

本轮新内容：
${newContentText}

请结合历史摘要和本轮新内容，生成更新后的讨论摘要（格式：**核心话题** + **主要观点** + **共识** + **分歧**）：`;
    }

    const sender = this.senderFactory?.getSender(model.accessMethod || 'web');

    if (!sender) {
      console.error('[ConversationMessageService] 无法获取发送器');
      return { summary: null, conversationUrl: null };
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('摘要生成超时')), 60000);
    });

    try {
      const result = await Promise.race([
        sender.send(prompt, {
          ...model,
          conversationUrl: summaryConversationUrl || undefined
        }),
        timeoutPromise
      ]);

      if (result && result.content) {
        const summary = result.content.substring(0, 500);
        return {
          summary,
          conversationUrl: result.conversationUrl || summaryConversationUrl
        };
      }
      return { summary: null, conversationUrl: null };
    } catch (error) {
      console.error('[ConversationMessageService] 讨论摘要生成错误:', error.message);
      return { summary: null, conversationUrl: null };
    }
  }

  async _maybeGenerateTitle(conversationId, conversation, userMessage) {
    if (!conversation.nameIsDefault) {
      return;
    }

    // titleStatus: 'default' | 'generating' | 'done'
    if (conversation.titleStatus === 'generating') {
      console.log('[ConversationMessageService] 标题正在生成中，跳过:', conversationId);
      return;
    }

    if (conversation.titleStatus === 'done') {
      return;
    }

    // 先持久化 generating 状态，防止 service worker 重启后丢失
    await this.conversationManager.updateConversation(conversationId, {
      titleStatus: 'generating'
    });

    this._generateTitle(conversationId, userMessage).catch(err => {
      console.error('[ConversationMessageService] 标题生成异常:', err);
    });
  }

  async _generateTitle(conversationId, userMessage) {
    let conversationUrl = null;
    try {
      const settings = await StorageManager.getSettings();
      const helperModelId = settings.helperModel;

      if (!helperModelId) {
        console.warn('[ConversationMessageService] 未配置辅助模型，跳过标题生成');
        return;
      }

      const helperModel = await platformManager.getModelById(helperModelId);
      if (!helperModel) {
        console.warn('[ConversationMessageService] 辅助模型不存在，跳过标题生成');
        return;
      }

      const sender = this.senderFactory?.getSender(helperModel.accessMethod || 'web');
      if (!sender) {
        console.error('[ConversationMessageService] 无法获取发送器');
        return;
      }

      const prompt = `You are a title generator. Generate a short, concise title (max 20 characters) for the following message. Output ONLY the title, nothing else.

Message: ${userMessage}`;

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('标题生成超时')), 30000);
      });

      const result = await Promise.race([
        sender.send(prompt, helperModel),
        timeoutPromise
      ]);

      // 记录会话URL，用于后续关闭标签页
      if (result && result.conversationUrl) {
        conversationUrl = result.conversationUrl;
      }

      if (result && result.content) {
        let title = result.content.trim();
        // 去除可能的引号
        title = title.replace(/^["'"「「【【]|["'"」」】】]$/g, '');
        // 限制长度
        if (title.length > 30) {
          title = title.substring(0, 30) + '...';
        }

        if (title) {
          const conversation = await this.conversationManager.getConversation(conversationId);
          if (conversation && conversation.nameIsDefault) {
            await this.conversationManager.updateConversation(conversationId, {
              name: title,
              nameIsDefault: false,
              titleStatus: 'done'
            });
            console.log('[ConversationMessageService] 标题已生成:', title);
          }
        }
      }
    } catch (error) {
      console.error('[ConversationMessageService] 标题生成失败:', error.message);
      // 生成失败时重置状态，允许下次重试
      try {
        const conv = await this.conversationManager.getConversation(conversationId);
        if (conv && conv.titleStatus === 'generating') {
          await this.conversationManager.updateConversation(conversationId, {
            titleStatus: 'default'
          });
        }
      } catch (_) {}
    } finally {
      // 删除平台会话并关闭标签页（仅 web 模型）
      if (conversationUrl && this.tabManager) {
        try {
          await this._deletePlatformConversation(conversationUrl);
          console.log('[ConversationMessageService] 标题生成平台会话已删除:', conversationUrl);
        } catch (e) {
          console.warn('[ConversationMessageService] 删除标题生成平台会话失败:', e.message);
        }
      }
    }
  }

  async _deletePlatformConversation(conversationUrl) {
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

      // 关闭标签页
      try {
        await chrome.tabs.remove(tab.id);
      } catch (closeError) {
        console.warn('[ConversationMessageService] 关闭标签页失败:', closeError.message);
      }

      return true;
    } catch (error) {
      console.error('[ConversationMessageService] 删除平台会话失败:', error);
      throw error;
    }
  }

  async _processWithQueue(conversationId, userMessage, conversation, targetMemberIds = null) {
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
      await this.conversationManager.addMessage(conversationId, null, userMessage, MessageType.USER, null, { targetMemberIds });
    }
    if (conversation.memberOrder) {
      worker.setMemberOrder(conversation.memberOrder);
    }

    // 异步生成标题（不阻塞主流程）
    this._maybeGenerateTitle(conversationId, conversation, userMessage);

    // 创建实体并添加到Worker
    const entities = await this.entityFactory.createEntitiesFromConversation(conversation);
    entities.forEach(entity => {
      entity.setProgressTracker(this.progressTracker);
      worker.addMember(entity.id, entity);
    });

    // 入队（只存消息内容，执行时从 storage 读最新数据）
    worker.enqueueMessage(userMessage, targetMemberIds);

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
        if (message) {
          this.progressNotifier.notify(convId, {
            type: 'message_saved',
            messageId: message.id,
            memberId: message.memberId,
            content: message.content
          });
        }
      }
    );
    worker.onMemberProcessing = (memberId) => {
      this.progressNotifier.notify(conversationId, {
        type: 'member_processing',
        memberId
      });
    };

    worker.onContentChunk = (memberId, delta, fullContent) => {
      this.progressNotifier.notify(conversationId, {
        type: 'content_chunk',
        memberId,
        delta,
        fullContent
      });
    };
    worker.onMemberError = (memberId, error) => {
      this.progressNotifier.notify(conversationId, {
        type: 'member_error',
        memberId,
        error
      });
    };
    worker.onRoundComplete = () => {
      this._updateConversationSummaryAsync(conversationId)
        .catch(err => console.error('[ConversationMessageService] 讨论摘要更新异常:', err));
    };
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
    console.log('[ConversationMessageService] _closePlatformTab 调用:', { entityId, hasTabManager: !!this.tabManager });
    
    if (!this.tabManager) {
      console.warn('[ConversationMessageService] tabManager 未初始化，跳过关闭标签页');
      return;
    }

    const url = context.getMemberUrl(entityId);
    console.log('[ConversationMessageService] 成员URL:', { entityId, url, memberUrls: context.memberUrls });
    
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
