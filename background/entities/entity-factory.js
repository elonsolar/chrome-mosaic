class EntityFactory {
  constructor(platformManager, senderFactory, flowExecutor, progressNotifier) {
    this.platformManager = platformManager;
    this.senderFactory = senderFactory;
    this.flowExecutor = flowExecutor;
    this.progressNotifier = progressNotifier;
  }

  async createMember(memberData) {
    const models = await this.platformManager.getAllModels();
    // 新架构：使用 modelId 查找模型配置
    const modelConfig = memberData.modelId
      ? models.find(m => m.id === memberData.modelId)
      : null;

    // 如果找不到（例如旧数据），回退到按 provider+model 查找
    const fallbackConfig = !modelConfig && memberData.provider && memberData.model
      ? models.find(m => m.provider === memberData.provider && m.model === memberData.model)
      : null;

    return new MemberEntity(
      memberData,
      modelConfig || fallbackConfig,
      this.senderFactory
    );
  }

  createExpert(flowData) {
    return new ExpertEntity(
      flowData,
      this.flowExecutor,
      this.progressNotifier
    );
  }

  async createEntitiesFromConversation(conversation) {
    const entities = [];

    if (conversation.flowId) {
      const flow = await this.flowExecutor.flowManager.getFlowById(conversation.flowId);
      if (flow) {
        entities.push(this.createExpert(flow));
      }
    } else if (conversation.members && conversation.members.length > 0) {
      const memberIds = conversation.memberOrder || conversation.members.map(m => m.id);
      const memberMap = new Map(conversation.members.map(m => [m.id, m]));

      console.log('[EntityFactory] 创建成员 Entities, memberIds:', memberIds);
      console.log('[EntityFactory] conversation.members:', conversation.members.map(m => ({ id: m.id, name: m.name })));

      for (const memberId of memberIds) {
        const member = memberMap.get(memberId);
        if (member) {
          console.log(`[EntityFactory] 创建 Entity: ${member.name} (${memberId})`);
          const entity = await this.createMember(member);
          entities.push(entity);
        } else {
          console.warn(`[EntityFactory] 找不到成员: ${memberId}`);
        }
      }

      console.log(`[EntityFactory] 总共创建 ${entities.length} 个 Entities`);
    }

    return entities;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EntityFactory;
}
