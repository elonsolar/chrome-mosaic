class TemporarySessionPool {
  constructor(conversationManager) {
    this.conversationManager = conversationManager;
    this.tempConversations = new Map();
  }

  generateMemberId() {
    return 'member_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async getSessionForNode(node) {
    if (this.tempConversations.has(node.id)) {
      const existingConvId = this.tempConversations.get(node.id);
      console.log('[SessionPool] 复用现有临时会话:', node.id, '会话ID:', existingConvId);
      return existingConvId;
    }

    const model = node.data?.model;
    if (!model?.id) {
      throw new Error(`节点 ${node.name || node.id} 未配置模型`);
    }

    console.log('[SessionPool] 为节点创建临时会话:', node.name, '模型:', model.name);

    // 创建临时 Member 对象
    const tempMember = {
      id: this.generateMemberId(),
      name: `[临时] ${model.name}`,
      provider: model.provider,
      model: model.model,
      systemPrompt: '',
      baseUrl: model.baseUrl || '',
      apiKey: model.apiKey || ''
    };

    console.log('[SessionPool] 创建临时成员:', tempMember);

    const tempConv = await this.conversationManager.createConversation(
      `Temp_${node.name || node.id}_${Date.now()}`,
      [tempMember],
      'brainstorming',
      {}
    );

    if (!tempConv || !tempConv.id) {
      throw new Error(`创建临时会话失败: ${JSON.stringify(tempConv)}`);
    }

    console.log('[SessionPool] 临时会话创建成功:', tempConv.id, '成员数:', tempConv.members?.length);

    this.tempConversations.set(node.id, tempConv.id);
    return tempConv.id;
  }

  async cleanup() {
    const sessionCount = this.tempConversations.size;
    console.log(`[SessionPool] 准备清理 ${sessionCount} 个临时会话`);

    for (const [nodeId, conversationId] of this.tempConversations) {
      try {
        console.log(`[SessionPool] 清理节点 ${nodeId} 的临时会话 ${conversationId}`);

        const conversation = await this.conversationManager.getConversation(conversationId);

        // 删除平台会话
        if (conversation && conversation.memberUrls) {
          for (const [memberId, conversationUrl] of Object.entries(conversation.memberUrls)) {
            const member = conversation.members.find(m => m.id === memberId);
            if (member && conversationUrl) {
              try {
                await aiMessageManager.deletePlatformConversation(conversationUrl);
              } catch (e) {
                console.error(`[SessionPool] 删除平台会话失败:`, e);
              }
            }
          }
        }

        // 删除会话（Member 会自动被删除）
        await this.conversationManager.deleteConversation(conversationId);
        console.log(`[SessionPool] 已删除临时会话 ${conversationId}`);
      } catch (error) {
        console.error(`[SessionPool] 清理会话 ${conversationId} 失败:`, error);
      }
    }

    this.tempConversations.clear();
    console.log(`[SessionPool] 清理完成，剩余临时会话数: ${this.tempConversations.size}`);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TemporarySessionPool;
}
