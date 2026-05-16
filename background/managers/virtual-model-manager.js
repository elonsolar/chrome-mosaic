/**
 * 虚拟模型管理器
 * 虚拟模型 = 流程的包装器，用户当作"模型"使用
 */
class VirtualModelManager {
  constructor() {
    this.storageKey = 'virtualModels';
  }

  /**
   * 创建虚拟模型（包装流程）
   */
  async createVirtualModel(data) {
    const { name, description, flowId, icon } = data;

    if (!name || !flowId) {
      throw new Error('名称和流程不能为空');
    }

    // 验证流程存在
    const flowManager = new FlowManager();
    const flow = await flowManager.getFlowById(flowId);
    if (!flow) {
      throw new Error('流程不存在');
    }

    const virtualModels = await this.getVirtualModels();
    const newVirtualModel = {
      id: this.generateId(),
      name,
      description: description || '',
      flowId,
      icon: icon || '🤖',
      isVirtual: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    virtualModels.push(newVirtualModel);
    await this.saveVirtualModels(virtualModels);

    return newVirtualModel;
  }

  /**
   * 获取所有虚拟模型
   */
  async getVirtualModels() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * 根据ID获取虚拟模型
   */
  async getVirtualModelById(id) {
    const virtualModels = await this.getVirtualModels();
    return virtualModels.find(vm => vm.id === id) || null;
  }

  /**
   * 获取虚拟模型及其关联的流程数据
   */
  async getVirtualModelWithFlow(id) {
    const virtualModel = await this.getVirtualModelById(id);
    if (!virtualModel) {
      return null;
    }

    const flowManager = new FlowManager();
    const flow = await flowManager.getFlowById(virtualModel.flowId);

    return {
      ...virtualModel,
      flow
    };
  }

  /**
   * 获取所有虚拟模型及其流程
   */
  async getAllVirtualModelsWithFlows() {
    const virtualModels = await this.getVirtualModels();
    const flowManager = new FlowManager();

    const result = [];
    for (const vm of virtualModels) {
      const flow = await flowManager.getFlowById(vm.flowId);
      result.push({
        ...vm,
        flow
      });
    }

    return result;
  }

  /**
   * 更新虚拟模型
   */
  async updateVirtualModel(id, data) {
    const virtualModels = await this.getVirtualModels();
    const index = virtualModels.findIndex(vm => vm.id === id);

    if (index === -1) {
      throw new Error('虚拟模型不存在');
    }

    virtualModels[index] = {
      ...virtualModels[index],
      ...data,
      id,
      updatedAt: Date.now()
    };

    await this.saveVirtualModels(virtualModels);
    return virtualModels[index];
  }

  /**
   * 删除虚拟模型
   */
  async deleteVirtualModel(id) {
    let virtualModels = await this.getVirtualModels();
    virtualModels = virtualModels.filter(vm => vm.id !== id);
    await this.saveVirtualModels(virtualModels);
  }

  /**
   * 复制虚拟模型（同时复制其流程）
   */
  async duplicateVirtualModel(id) {
    const original = await this.getVirtualModelWithFlow(id);
    if (!original) {
      throw new Error('虚拟模型不存在');
    }

    // 复制流程
    const flowManager = new FlowManager();
    const newFlow = await flowManager.createFlow({
      name: `${original.flow.name} (副本)`,
      description: original.flow.description,
      nodes: original.flow.nodes.map(node => ({
        ...node,
        id: this.generateId()
      })),
      connections: original.flow.connections.map(conn => ({
        ...conn,
        id: this.generateId()
      }))
    });

    // 创建虚拟模型
    return this.createVirtualModel({
      name: `${original.name} (副本)`,
      description: original.description,
      flowId: newFlow.id,
      icon: original.icon
    });
  }

  /**
   * 保存虚拟模型列表
   */
  async saveVirtualModels(virtualModels) {
    await chrome.storage.local.set({ [this.storageKey]: virtualModels });
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VirtualModelManager;
}
