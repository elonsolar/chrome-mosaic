class MemberEntity extends BaseEntity {
  constructor(memberData, modelConfig, senderFactory) {
    super(
      memberData.id,
      memberData.name,
      'member'
    );

    this.model = memberData.modelCode || memberData.model;
    this.accessMethod = memberData.accessMethod || modelConfig?.accessMethod || 'web';
    this.systemPrompt = memberData.systemPrompt || '';

    this.baseUrl = modelConfig?.baseUrl || memberData.baseUrl || '';
    this.apiKey = modelConfig?.apiKey || memberData.apiKey || '';
    this.webUrl = modelConfig?.webUrl || memberData.webUrl || '';

    this.senderFactory = senderFactory;
    
    // 成员状态
    this.status = 'online';  // 'online' | 'offline'
    this.offlineReason = '';
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
  }

  async validate(input, context) {
    if (!input || input.trim().length === 0) {
      return { valid: false, error: '输入内容为空' };
    }

    if (this.accessMethod === 'api' && (!this.baseUrl || !this.apiKey)) {
      return { valid: false, error: 'API 模式需要配置 Base URL 和 API Key' };
    }

    return { valid: true, error: null };
  }

  async execute(input, context, onChunk) {
    console.log(`[MemberEntity] ${this.name} 开始执行 (${this.accessMethod} 模式)`);

    this.reportProgress({
      type: 'status',
      status: 'starting',
      message: '准备发送消息...'
    });

    try {
      const sender = this.senderFactory.getSender(this.accessMethod);

      this.reportProgress({
        type: 'status',
        status: 'sending',
        message: '发送中...'
      });

      const isSequential = context.conversationMode === 'discussion';
      let message;

      if (this.accessMethod === 'api') {
        message = isSequential
          ? this._buildApiMessageSequential(input, context)
          : this._buildApiMessageParallel(input, context);
      } else {
        message = isSequential
          ? this._buildWebMessageSequential(input, context)
          : this._buildWebMessageParallel(input, context);
      }

      const savedUrl = context.getMemberUrl(this.id);
      console.log(`[MemberEntity] ${this.name} 发送前 memberUrl:`, savedUrl, '| webUrl:', this.webUrl, '| memberId:', this.id);

      const response = await sender.send(message, {
        model: this.model,
        conversationUrl: savedUrl,
        conversationId: context.conversationId,
        conversation: context.conversation,
        memberId: this.id,
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        webUrl: this.webUrl,
        onChunk
      });

      console.log(`[MemberEntity] ${this.name} 收到响应 conversationUrl:`, response.conversationUrl);

      this.reportProgress({
        type: 'status',
        status: 'completed',
        message: '完成'
      });

      if (response.conversationUrl) {
        context.setMemberUrl(this.id, response.conversationUrl);
        console.log(`[MemberEntity] ${this.name} 已保存 memberUrl:`, response.conversationUrl);
      } else {
        console.warn(`[MemberEntity] ${this.name} 响应中没有 conversationUrl!`);
      }

      // 成功后重置错误计数
      this.consecutiveErrors = 0;

      return {
        success: true,
        content: response.content,
        memberId: this.id,
        memberName: this.name,
        timestamp: Date.now()
      };

    } catch (error) {
      // 检测服务过载/限流错误，立即离线不重试
      const overloadPatterns = ['有点累了', '请稍后再试', 'rate limit', 'too many', 'overload', '繁忙', '服务繁忙', '429', '503'];
      const isOverload = overloadPatterns.some(p => error.message.toLowerCase().includes(p));
      if (isOverload) {
        this.status = 'offline';
        this.offlineReason = `服务过载: ${error.message}`;
        this.consecutiveErrors = 0;
        console.warn(`[MemberEntity] ${this.name} 服务过载，立即离线`);
      } else {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.status = 'offline';
          this.offlineReason = `连续${this.consecutiveErrors}次失败`;
          console.warn(`[MemberEntity] ${this.name} 自动离线: ${this.offlineReason}`);
        }
      }

      this.reportProgress({
        type: 'status',
        status: 'error',
        message: `错误: ${error.message}`
      });

      return {
        success: false,
        content: '',
        error: error.message,
        memberId: this.id,
        memberName: this.name,
        timestamp: Date.now()
      };
    }
  }

  _buildApiMessageParallel(input, context) {
    const messages = context.conversation.messages || [];
    const apiMessages = [];

    const isFirstMessage = !messages.some(m =>
      m.memberId === this.id && !m.isIntro && m.type !== 'tip'
    );

    if (isFirstMessage && this.systemPrompt) {
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const systemContent = `【你的角色设定】\n${this.systemPrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`;
      apiMessages.push({ role: 'system', content: systemContent });
    }

    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename', 'prompt_change'];
    for (const msg of messages) {
      if (msg.isIntro) continue;

      // 检查 target 和 exclude
      if (msg.target && msg.target.length > 0 && !msg.target.includes(this.id)) continue;
      if (msg.exclude && msg.exclude.includes(this.id)) continue;

      if (msg.isUser) {
        apiMessages.push({ role: 'user', content: msg.content });
      } else if (msg.memberId === this.id) {
        const content = msg.type === 'tip'
          ? this._cleanTipContentSimple(msg.content)
          : msg.content;
        apiMessages.push({ role: 'assistant', content: content });
      } else if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) {
        apiMessages.push({
          role: 'user',
          content: this._cleanTipContentSimple(msg.content)
        });
      } else if (msg.memberId !== this.id && msg.type === 'member') {
        const member = context.conversation.members.find(m => m.id === msg.memberId);
        const memberName = member ? member.name : '成员';
        apiMessages.push({
          role: 'user',
          content: `${memberName}：${msg.content}`
        });
      }
    }

    const hasUserInHistory = apiMessages.some(msg => msg.role === 'user');
    if (!hasUserInHistory && input !== 'INLOOP') {
      apiMessages.push({ role: 'user', content: input });
    }

    return apiMessages;
  }

  _buildApiMessageSequential(input, context) {
    const allMessages = context.conversation.messages || [];
    const apiMessages = [];

    const lastMessageId = context.getLastMessageId(this.id);
    let startIndex = 0;

    if (lastMessageId) {
      startIndex = allMessages.findIndex(msg => msg.id === lastMessageId) + 1;
      if (startIndex === 0) startIndex = 0;
    }

    const incrementalMessages = allMessages.slice(startIndex);

    const myMessages = allMessages.filter(m =>
      m.memberId === this.id && !m.isIntro && m.type !== 'tip'
    );
    const isFirstMessage = myMessages.length === 0;

    if (isFirstMessage) {
      const discussionPrompt = this._buildDiscussionPrompt(context);
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const systemContent = discussionPrompt
        ? `${discussionPrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`
        : '';
      if (systemContent) {
        apiMessages.push({ role: 'system', content: systemContent });
      }
    }

    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename', 'prompt_change'];
    for (const msg of incrementalMessages) {
      if (msg.isIntro) continue;

      // 检查 target 和 exclude
      if (msg.target && msg.target.length > 0 && !msg.target.includes(this.id)) continue;
      if (msg.exclude && msg.exclude.includes(this.id)) continue;

      if (msg.isUser) {
        apiMessages.push({ role: 'user', content: msg.content });
      } else if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) {
        apiMessages.push({
          role: 'user',
          content: this._cleanTipContentSimple(msg.content)
        });
      } else if (msg.memberId !== this.id && msg.type === 'member') {
        const member = context.conversation.members.find(m => m.id === msg.memberId);
        const memberName = member ? member.name : '成员';
        apiMessages.push({
          role: 'user',
          content: `${memberName}：${msg.content}`
        });
      }
    }

    const hasUserInHistory = apiMessages.some(msg => msg.role === 'user');
    if (!hasUserInHistory && input !== 'INLOOP') {
      apiMessages.push({ role: 'user', content: input });
    }

    return apiMessages;
  }

  _buildWebMessageParallel(input, context) {
    const messages = context.conversation.messages || [];

    const isFirstMessage = !messages.some(m =>
      m.memberId === this.id && !m.isIntro && m.type !== 'tip'
    );

    let message = input === 'INLOOP' ? '' : input;

    if (isFirstMessage && this.systemPrompt) {
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const memberPrompt = `【你的角色设定】\n${this.systemPrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`;
      message = message ? `${memberPrompt}\n\n${message}` : memberPrompt;
    }

    return message;
  }

  _buildWebMessageSequential(input, context) {
    const allMessages = context.conversation.messages || [];

    const lastMessageId = context.getLastMessageId(this.id);
    let startIndex = 0;

    if (lastMessageId) {
      startIndex = allMessages.findIndex(msg => msg.id === lastMessageId) + 1;
      if (startIndex === 0) startIndex = 0;
    }

    const incrementalMessages = allMessages.slice(startIndex);

    const myMessages = allMessages.filter(m =>
      m.memberId === this.id && !m.isIntro && m.type !== 'tip'
    );
    const isFirstMessage = myMessages.length === 0;

    // 讨论提示词（仅第一条消息）
    let discussionPrefix = '';
    if (isFirstMessage) {
      const discussionPrompt = this._buildDiscussionPrompt(context);
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      discussionPrefix = discussionPrompt
        ? `${discussionPrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`
        : '';
    }

    // 构建历史上下文
    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename', 'prompt_change'];
    const historyParts = [];

    for (const msg of incrementalMessages) {
      if (msg.isIntro) continue;

      // 检查 target 和 exclude
      if (msg.target && msg.target.length > 0 && !msg.target.includes(this.id)) continue;
      if (msg.exclude && msg.exclude.includes(this.id)) continue;

      if (msg.isUser) {
        historyParts.push(`用户：${msg.content}`);
      } else if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) {
        historyParts.push(this._cleanTipContentSimple(msg.content));
      } else if (msg.memberId !== this.id && msg.type === 'member') {
        const member = context.conversation.members.find(m => m.id === msg.memberId);
        const memberName = member ? member.name : '成员';
        const content = msg.content;
        historyParts.push(`${memberName}：${content}`);
      }
    }

    // 组装最终消息：讨论提示词（不被覆盖）+ 历史 + 当前输入
    const hasUserInHistory = historyParts.some(p => p.startsWith('用户：'));
    let message;
    if (historyParts.length > 0 && !hasUserInHistory && input !== 'INLOOP') {
      message = [discussionPrefix, historyParts.join('\n\n'), `用户：${input}`].filter(Boolean).join('\n\n');
    } else if (historyParts.length > 0) {
      message = [discussionPrefix, historyParts.join('\n\n')].filter(Boolean).join('\n\n');
    } else {
      message = discussionPrefix ? `${discussionPrefix}\n\n${input}` : (input === 'INLOOP' ? discussionPrefix : input);
    }

    return message;
  }

  _buildDiscussionPrompt(context) {
    if (context.conversationMode !== 'discussion') {
      return '';
    }

    const memberNames = context.conversation.members
      .filter(m => m.id !== this.id)
      .map(m => m.name)
      .join('、');

    return `群成员：${this.name}（你）、${memberNames || '其他成员'}。

${this.systemPrompt || '你是一个有独立见解的讨论参与者。'}

轮到你发言时：先看前面成员说了什么，找他们没覆盖的点或可以深入的方向，给出具体的补充, 若遇到不同意的观点，提出质疑。如果前面已经说全了，简短确认即可。禁止主动提到自己的名称，只有引用别人内容时才可以提别人名称。`;
  }

  _cleanTipContent(content, fallbackName = '系统') {
    let cleaned = content.replace(/<[^>]+>/g, '');
    cleaned = cleaned.replace(/，模型是[^，]+/g, '');
    cleaned = cleaned.replace(/，提示词是[^，]+/g, '');
    cleaned = cleaned.replace(/[，,\s]+$/g, '').replace(/^[，,\s]+/g, '');
    cleaned = cleaned.replace(/，{2,}/g, '，');
    return `<tip>${cleaned.trim() || content}</tip>`;
  }

  _cleanTipContentSimple(content) {
    return this._cleanTipContent(content);
  }

  setStatus(status, reason = '') {
    this.status = status;
    this.offlineReason = reason;
    if (status === 'online') {
      this.consecutiveErrors = 0;
    }
    console.log(`[MemberEntity] ${this.name} 状态设置为: ${status}${reason ? ' (' + reason + ')' : ''}`);
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      offlineReason: this.offlineReason,
      consecutiveErrors: this.consecutiveErrors
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemberEntity;
}
