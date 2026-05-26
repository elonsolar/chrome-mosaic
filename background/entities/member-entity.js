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

    if (this.systemPrompt) {
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const fullPrompt = additionalPrompt 
        ? `${this.systemPrompt}\n\n${additionalPrompt}`
        : this.systemPrompt;

      messages.push({ role: 'system', content: fullPrompt });
    }

    const history = this._buildHistory(context);
    messages.push(...history);

    messages.push({ role: 'user', content: input });

    return messages;
  }

  _buildWebMessage(input, context) {
    let message = input;

    if (this.systemPrompt) {
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');
      const fullPrompt = additionalPrompt 
        ? `${this.systemPrompt}\n\n${additionalPrompt}`
        : this.systemPrompt;

      message = `${fullPrompt}\n\n${input}`;
    }

    message += '\n\n**严格遵守**：在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';

    return message;
  }

  _buildHistory(context) {
    const messages = context.conversation.messages || [];
    const contextMode = context.contextMode;

    if (contextMode === 'self') {
      return messages
        .filter(msg => msg.isUser || msg.memberId === this.id)
        .map(msg => ({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.content
        }));
    } else {
      return messages
        .map(msg => ({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.content
        }));
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemberEntity;
}
