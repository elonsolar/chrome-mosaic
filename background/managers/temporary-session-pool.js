class TemporarySessionPool {
  constructor(conversationManager) {
    this.conversationManager = conversationManager;
    this.tempConversations = new Map();
  }

  async getSessionForNode(node) {
    if (this.tempConversations.has(node.id)) {
      return this.tempConversations.get(node.id);
    }

    const tempConv = await this.conversationManager.createConversation(
      `Temp_${node.name}_${Date.now()}`,
      [node.modelId],
      'brainstorming',
      {}
    );

    this.tempConversations.set(node.id, tempConv.id);
    return tempConv.id;
  }

  async cleanup() {
    console.log(`[SessionPool] 清理 ${this.tempConversations.size} 个临时会话`);

    for (const [nodeId, conversationId] of this.tempConversations) {
      try {
        const conversation = await this.conversationManager.getConversation(conversationId);
        if (conversation && conversation.memberUrls) {
          const members = await StorageManager.getMembers();
          for (const [memberId, conversationUrl] of Object.entries(conversation.memberUrls)) {
            const member = members.find(m => m.id === memberId);
            if (member && conversationUrl) {
              try {
                await aiMessageManager.deletePlatformConversation(member.provider, conversationUrl);
              } catch (e) {
                console.error(`[SessionPool] 删除平台会话失败:`, e);
              }
            }
          }
        }

        await this.conversationManager.deleteConversation(conversationId);
      } catch (error) {
        console.error(`[SessionPool] 清理会话 ${conversationId} 失败:`, error);
      }
    }

    this.tempConversations.clear();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TemporarySessionPool;
}
