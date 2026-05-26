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

      let message;
      if (this.accessMethod === 'api') {
        message = this._buildApiMessage(input, context);
      } else {
        message = this._buildWebMessage(input, context);
      }

      const response = await sender.send(message, {
        model: this.model,
        conversationUrl: context.getMemberUrl(this.id),
        conversationId: context.conversationId,
        conversation: context.conversation,
        memberId: this.id,
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        webUrl: this.webUrl
      });

      this.reportProgress({
        type: 'status',
        status: 'completed',
        message: '完成'
      });

      if (response.conversationUrl) {
        context.setMemberUrl(this.id, response.conversationUrl);
      }

      return {
        success: true,
        content: response.content,
        memberId: this.id,
        memberName: this.name,
        timestamp: Date.now()
      };

    } catch (error) {
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

  _buildApiMessage(input, context) {
    const messages = [];

    if (this.systemPrompt || context.conversationMode === 'discussion') {
      const discussionPrompt = this._buildDiscussionPrompt(context);
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const basePrompt = this.systemPrompt || '';

      const fullPrompt = discussionPrompt
        ? `${discussionPrompt}\n\n${basePrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`
        : (additionalPrompt ? `${basePrompt}\n\n${additionalPrompt}` : basePrompt);

      if (fullPrompt) {
        messages.push({ role: 'system', content: fullPrompt });
      }
    }

    const history = this._buildHistory(context);
    messages.push(...history);

    const hasUserInHistory = history.some(msg => msg.role === 'user');
    if (!hasUserInHistory) {
      messages.push({ role: 'user', content: input });
    }

    return messages;
  }

  _buildWebMessage(input, context) {
    let message = input;

    const lastMessageId = context.getLastMessageId(this.id);
    const isFirstMessage = !lastMessageId;

    if (isFirstMessage && (this.systemPrompt || context.conversationMode === 'discussion')) {
      const discussionPrompt = this._buildDiscussionPrompt(context);
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const basePrompt = this.systemPrompt || '';

      const fullPrompt = discussionPrompt
        ? `${discussionPrompt}\n\n${basePrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`
        : (additionalPrompt ? `${basePrompt}\n\n${additionalPrompt}` : basePrompt);

      const historyText = this._buildHistoryText(context);

      message = historyText
        ? `${fullPrompt}\n\n${historyText}`
        : `${fullPrompt}\n\n当前问题：${input}`;
    } else {
      const historyText = this._buildHistoryText(context);

      message = historyText
        ? historyText
        : input;
    }

    message += '\n\n**严格遵守**：在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';

    return message;
  }

  _buildDiscussionPrompt(context) {
    if (context.conversationMode !== 'discussion') {
      return '';
    }

    const members = context.conversation.members || [];
    const memberNames = members.map(m => m.name).join('、');

    return `当前会话成员：${memberNames}。\n你的名称是${this.name}。\n你不可以扮演别的成员，只能以${this.name}的身份回复。`;
  }

  _buildHistoryText(context) {
    const messages = context.conversation.messages || [];
    const contextMode = context.contextMode;
    const lastMessageId = context.getLastMessageId(this.id);

    let startIndex = 0;
    if (lastMessageId) {
      startIndex = messages.findIndex(msg => msg.id === lastMessageId) + 1;
      if (startIndex === 0) {
        startIndex = 0;
      }
    }

    const incrementalMessages = messages.slice(startIndex);

    let filteredMessages;
    if (contextMode === 'self') {
      filteredMessages = incrementalMessages.filter(msg => msg.isUser || msg.memberId === this.id);
    } else {
      filteredMessages = incrementalMessages.filter(msg => msg.memberId !== this.id);
    }

    if (filteredMessages.length === 0) {
      return '';
    }

    return filteredMessages.map(msg => {
      if (msg.isUser) {
        return `用户：${msg.content}`;
      } else {
        const member = context.conversation.members.find(m => m.id === msg.memberId);
        const memberName = member ? member.name : 'AI助手';
        return `${memberName}：${msg.content}`;
      }
    }).join('\n\n');
  }

  _buildHistory(context) {
    const messages = context.conversation.messages || [];
    const contextMode = context.contextMode;
    const lastMessageId = context.getLastMessageId(this.id);

    let startIndex = 0;
    if (lastMessageId) {
      startIndex = messages.findIndex(msg => msg.id === lastMessageId) + 1;
      if (startIndex === 0) {
        startIndex = 0;
      }
    }

    const incrementalMessages = messages.slice(startIndex);

    let filteredMessages;
    if (contextMode === 'self') {
      filteredMessages = incrementalMessages.filter(msg => msg.isUser || msg.memberId === this.id);
    } else {
      filteredMessages = incrementalMessages.filter(msg => msg.memberId !== this.id);
    }

    return filteredMessages.map(msg => ({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.content
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemberEntity;
}
