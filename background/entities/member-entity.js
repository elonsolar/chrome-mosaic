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

  async execute(input, context) {
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
        webUrl: this.webUrl
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
      // 累计错误，检查是否需要自动离线
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.status = 'offline';
        this.offlineReason = `连续${this.consecutiveErrors}次失败`;
        console.warn(`[MemberEntity] ${this.name} 自动离线: ${this.offlineReason}`);
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

    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename'];
    for (const msg of messages) {
      if (msg.isIntro) continue;

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

    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename'];
    for (const msg of incrementalMessages) {
      if (msg.isIntro) continue;

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
    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename'];
    const historyParts = [];

    for (const msg of incrementalMessages) {
      if (msg.isIntro) continue;

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

    return `你是 ${this.name}，这是你在本群中的称呼，它只是一个标签，不代表任何性格或身份暗示。你的性格、专长、说话方式，全部由下方的角色设定决定。

【群背景】
我们是一个协作讨论群，群里有多个成员，每个人都有自己的视角和专长。当用户提出任务或问题时，大家会各抒己见，目标是：通过多角度的讨论、互相补充和纠正，得出比任何单人思考都更完善的结论。

【你的角色设定】
${this.systemPrompt}

【讨论规则】
1. 用户的需求是唯一的工作方向。接到任务后，全力以赴从你的角色视角出发，给出有实质内容的分析或方案。
2. 严禁根据自己或他人的名字去做任何假设，也不可以主动提及自己的名字,名字只是代号且只有别人使用的时候才有意义。
3. 严格按照你的角色设定来思考和发言。你的观点应该是这个角色真正会有的看法，而不是为了迎合谁而说。
4. 讨论中不要人云亦云。如果你同意前面的观点，要给出新的论据或补充细节；如果你不同意，直接指出问题，提出不同看法。讨论的价值就在于碰撞出更全面的结果。
5. 遇到不确定的信息，主动去查证，或者在发言中明确指出这是你的推测、不确定之处在哪里，方便其他人补充纠正。
6. 和其他成员协作时，注意分工：有人提出框架，有人补充细节，有人挑刺找漏洞。你的目标是让整个讨论的结果更扎实，而不是证明自己更对。`;
  }

  _cleanTipContent(content, fallbackName = '系统') {
    let cleaned = content.replace(/，模型是[^，]+，/g, '，');
    cleaned = cleaned.replace(/，提示词是[^，]+，/g, '，');
    cleaned = cleaned.replace(/<a[^>]*>修改成员信息<\/a>/g, '').trim();
    cleaned = cleaned.replace(/，$/, '');
    return cleaned || content;
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
