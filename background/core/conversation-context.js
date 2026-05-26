class ConversationContext {
  constructor(conversation, memberId = null) {
    this.conversation = conversation;
    this.conversationId = conversation.id;
    this.conversationMode = conversation.mode;
    this.contextMode = conversation.contextMode;
    this.memberUrls = conversation.memberUrls || {};
    this.memberLastMessageIds = conversation.memberLastMessageIds || {};
    this.memberSettings = conversation.memberSettings || {};
    this.memberOrder = conversation.memberOrder || [];
    this.memberId = memberId;
    this.useFloatWindow = conversation.useFloatWindow || false;
    
    this.runtimeState = {
      currentIteration: 0,
      startTime: Date.now()
    };
  }

  getMemberUrl(memberId) {
    return this.memberUrls[memberId];
  }

  setMemberUrl(memberId, url) {
    this.memberUrls[memberId] = url;
  }

  getLastMessageId(memberId) {
    return this.memberLastMessageIds[memberId];
  }

  setLastMessageId(memberId, messageId) {
    this.memberLastMessageIds[memberId] = messageId;
  }

  getMemberSetting(memberId, key, defaultValue) {
    const settings = this.memberSettings[memberId] || {};
    return settings[key] !== undefined ? settings[key] : defaultValue;
  }

  toSerializable() {
    return {
      memberUrls: this.memberUrls,
      memberLastMessageIds: this.memberLastMessageIds
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConversationContext;
}
