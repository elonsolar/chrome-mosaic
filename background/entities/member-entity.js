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

    // 检查成员是否刚刚切换了模型
    const member = context.conversation.members.find(m => m.id === this.id);
    const modelSwitchedAt = member?.modelSwitchedAt;

    // 判断是否是切换模型后的第一条消息
    const isAfterModelSwitch = modelSwitchedAt && this._isFirstMessageAfterSwitch(context, modelSwitchedAt);

    // 如果是第一次消息或刚切换模型，添加提示词
    if ((this.systemPrompt || context.conversationMode === 'discussion') && (!context.getLastMessageId(this.id) || isAfterModelSwitch)) {
      const discussionPrompt = this._buildDiscussionPrompt(context);
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');

      const fullPrompt = discussionPrompt
        ? `${discussionPrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`
        : '';

      if (fullPrompt) {
        messages.push({ role: 'system', content: fullPrompt });
      }
    }

    const history = this._buildHistory(context, modelSwitchedAt);
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

    // 检查成员是否刚刚切换了模型
    const member = context.conversation.members.find(m => m.id === this.id);
    const modelSwitchedAt = member?.modelSwitchedAt;

    // 判断是否是切换模型后的第一条消息
    const isAfterModelSwitch = modelSwitchedAt && this._isFirstMessageAfterSwitch(context, modelSwitchedAt);

    if ((isFirstMessage || isAfterModelSwitch) && (this.systemPrompt || context.conversationMode === 'discussion')) {
      const discussionPrompt = this._buildDiscussionPrompt(context);
      const additionalPrompt = context.getMemberSetting(this.id, 'additionalPrompt', '');

      const fullPrompt = discussionPrompt
        ? `${discussionPrompt}${additionalPrompt ? '\n\n' + additionalPrompt : ''}`
        : '';

      const historyText = this._buildHistoryText(context, modelSwitchedAt);

      message = historyText
        ? `${fullPrompt}\n\n${historyText}\n\n当前问题：${input}`
        : `${fullPrompt}\n\n当前问题：${input}`;
    } else {
      const historyText = this._buildHistoryText(context, modelSwitchedAt);

      message = historyText
        ? `${historyText}\n\n当前问题：${input}`
        : input;
    }

    message += '\n\n**严格遵守**：在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';

    return message;
  }

  _buildDiscussionPrompt(context) {
    if (context.conversationMode !== 'discussion') {
      return '';
    }

    return `你的姓名是${this.name}，你处于一个讨论群中，这个群的群主是 user，全体成员的首要目的是不遗余力的满足群主的需求，遵循他的一切指令。群里还有一些其他成员，你如果需要针对某个成员的话做出回应可以@某个它，但是你不得主动提及自己的名称角色，你的角色设定为：${this.systemPrompt}`;
  }

  /**
   * 判断是否是模型切换后的第一条消息
   */
  _isFirstMessageAfterSwitch(context, modelSwitchedAt) {
    const messages = context.conversation.messages || [];

    // 查找切换后的第一条用户消息
    for (const msg of messages) {
      if (msg.isUser && msg.timestamp > modelSwitchedAt) {
        // 检查是否已经有针对这条消息的回复
        const hasReply = messages.some(m =>
          m.memberId === this.id &&
          m.timestamp > msg.timestamp &&
          !m.isIntro &&
          m.type !== 'tip'
        );
        return !hasReply; // 如果没有回复，说明是第一条
      }
    }

    return false;
  }

  _buildHistoryText(context, modelSwitchedAt = null) {
    const messages = context.conversation.messages || [];
    const contextMode = context.contextMode;
    const lastMessageId = context.getLastMessageId(this.id);

    let startIndex = 0;

    // 如果有模型切换时间戳，从切换点开始
    if (modelSwitchedAt) {
      // 找到切换后的第一条消息索引
      startIndex = messages.findIndex(msg => msg.timestamp > modelSwitchedAt);
      if (startIndex === -1) {
        startIndex = 0;
      }
    } else if (lastMessageId) {
      // 否则使用lastMessageId
      startIndex = messages.findIndex(msg => msg.id === lastMessageId) + 1;
      if (startIndex === 0) {
        startIndex = 0;
      }
    }

    const incrementalMessages = messages.slice(startIndex);

    // 定义需要发送给 AI 的 Tip 子类型
    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename'];

    let filteredMessages;
    if (contextMode === 'self') {
      filteredMessages = incrementalMessages.filter(msg => {
        if (msg.isIntro) return false;
        if (msg.isUser) return true;
        if (msg.memberId === this.id) return true;
        if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) return true;
        return false;
      });
    } else {
      filteredMessages = incrementalMessages.filter(msg => {
        if (msg.isIntro) return false;
        if (msg.memberId !== this.id) return true;
        if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) return true;
        return false;
      });
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

        // 如果是 Tip 消息，清理 HTML 和模型信息
        if (msg.type === 'tip') {
          return this._cleanTipContent(msg.content, memberName);
        }

        return `${memberName}：${msg.content}`;
      }
    }).join('\n\n');
  }

  /**
   * 清理 Tip 消息内容，移除 HTML 和模型信息
   * 输入: "阿军 加入会话，模型是 网页 - qianwen，<a href="#" class="tip-link" data-member-id="xxx">修改模型</a>"
   * 输出: "阿军 加入会话"
   */
  _cleanTipContent(content, fallbackName = '系统') {
    // 移除"模型是 xxx，"部分
    let cleaned = content.replace(/，模型是[^，]+，/g, '，');

    // 移除 <a> 标签及内容（"修改模型"）
    cleaned = cleaned.replace(/<a[^>]*>修改模型<\/a>/g, '').trim();

    // 移除末尾可能的逗号
    cleaned = cleaned.replace(/，$/, '');

    return cleaned || content;
  }

  /**
   * 清理 Tip 消息内容（API 模式使用，不包含成员名称前缀）
   */
  _cleanTipContentSimple(content) {
    return this._cleanTipContent(content);
  }

  _buildHistory(context, modelSwitchedAt = null) {
    const messages = context.conversation.messages || [];
    const contextMode = context.contextMode;
    const lastMessageId = context.getLastMessageId(this.id);

    let startIndex = 0;

    // 如果有模型切换时间戳，从切换点开始
    if (modelSwitchedAt) {
      // 找到切换后的第一条消息索引
      startIndex = messages.findIndex(msg => msg.timestamp > modelSwitchedAt);
      if (startIndex === -1) {
        startIndex = 0;
      }
    } else if (lastMessageId) {
      // 否则使用lastMessageId
      startIndex = messages.findIndex(msg => msg.id === lastMessageId) + 1;
      if (startIndex === 0) {
        startIndex = 0;
      }
    }

    const incrementalMessages = messages.slice(startIndex);

    // 定义需要发送给 AI 的 Tip 子类型
    const ALLOWED_TIP_SUBTYPES = ['join', 'leave', 'rename'];

    let filteredMessages;
    if (contextMode === 'self') {
      filteredMessages = incrementalMessages.filter(msg => {
        if (msg.isIntro) return false;
        if (msg.isUser) return true;
        if (msg.memberId === this.id) return true;
        if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) return true;
        return false;
      });
    } else {
      filteredMessages = incrementalMessages.filter(msg => {
        if (msg.isIntro) return false;
        if (msg.memberId !== this.id) return true;
        if (msg.type === 'tip' && ALLOWED_TIP_SUBTYPES.includes(msg.tipSubType)) return true;
        return false;
      });
    }

    return filteredMessages.map(msg => {
      // 如果是 Tip 消息，清理 HTML 和模型信息
      const content = msg.type === 'tip' ? this._cleanTipContentSimple(msg.content) : msg.content;

      return {
        role: msg.isUser ? 'user' : 'assistant',
        content: content
      };
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemberEntity;
}
