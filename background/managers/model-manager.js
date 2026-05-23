/**
 * 模型管理器
 * 管理AI模型配置
 */
class ModelManager {
  constructor() {
    this.storageKey = 'models';
  }

  /**
   * 从providers.config.js导入预设模型
   */
  async importFromProviders() {
    const models = [];

    for (const [providerId, provider] of Object.entries(PROVIDERS)) {
      const model = {
        id: this.generateId(),
        provider: providerId,
        model: provider.defaultModel,
        name: provider.name,
        description: `${provider.name} 默认模型`,
        isVirtual: false,
        isDefault: false,
        enabled: true,
        createdAt: Date.now()
      };

      models.push(model);
    }

    await this.saveModels(models);
    return models;
  }

  /**
   * 获取所有模型
   */
  async getModels() {
    const result = await chrome.storage.local.get(this.storageKey);
    let models = result[this.storageKey];

    // 如果没有模型，自动导入
    if (!models || models.length === 0) {
      models = await this.importFromProviders();
    }

    return models || [];
  }

  /**
   * 根据ID获取模型
   */
  async getModelById(id) {
    const models = await this.getModels();
    return models.find(m => m.id === id) || null;
  }

  /**
   * 根据提供商获取模型
   */
  async getModelsByProvider(provider) {
    const models = await this.getModels();
    return models.filter(m => !m.isVirtual && m.provider === provider);
  }

  /**
   * 获取虚拟模型
   */
  async getVirtualModels() {
    const models = await this.getModels();
    return models.filter(m => m.isVirtual);
  }

  /**
   * 获取普通模型
   */
  async getRegularModels() {
    const models = await this.getModels();
    return models.filter(m => !m.isVirtual);
  }

  /**
   * 根据流程ID获取虚拟模型
   */
  async getVirtualModelByFlowId(flowId) {
    const models = await this.getModels();
    return models.find(m => m.isVirtual && m.flowId === flowId) || null;
  }

  /**
   * 创建自定义模型
   */
  async createModel(data) {
    const { provider, model, name, description, isVirtual, flowId, icon, accessMethod, baseUrl, apiKey, thinking } = data;

    if (isVirtual) {
      // 创建虚拟模型
      if (!flowId) {
        throw new Error('虚拟模型必须指定流程');
      }

      const models = await this.getModels();
      const newModel = {
        id: this.generateId(),
        name: name || '未命名虚拟模型',
        isVirtual: true,
        flowId,
        description: description || '',
        icon: icon || '🤖',
        isDefault: false,
        enabled: true,
        createdAt: Date.now()
      };

      models.push(newModel);
      await this.saveModels(models);
      return newModel;

    } else {
      // 创建普通模型
      if (!provider || !model) {
        throw new Error('提供商和模型不能为空');
      }

      const models = await this.getModels();
      const newModel = {
        id: this.generateId(),
        provider,
        model,
        name: name || `${provider}-${model}`,
        description: description || '',
        accessMethod: data.accessMethod || 'web',
        baseUrl: data.baseUrl || '',
        apiKey: data.apiKey || '',
        thinking: data.thinking || false,
        isVirtual: false,
        isDefault: false,
        enabled: true,
        createdAt: Date.now()
      };

      models.push(newModel);
      await this.saveModels(models);
      return newModel;
    }
  }

  /**
   * 更新模型
   */
  async updateModel(id, data) {
    const models = await this.getModels();
    const index = models.findIndex(m => m.id === id);

    if (index === -1) {
      throw new Error('模型不存在');
    }

    const existingModel = models[index];

    // 如果要修改isVirtual状态，需要验证
    if (data.isVirtual !== undefined && data.isVirtual !== existingModel.isVirtual) {
      if (data.isVirtual && !data.flowId) {
        throw new Error('虚拟模型必须指定流程');
      }
      if (!data.isVirtual && (!data.provider || !data.model)) {
        throw new Error('普通模型必须指定提供商和模型');
      }
    }

    models[index] = {
      ...existingModel,
      ...data,
      id
    };

    await this.saveModels(models);
    return models[index];
  }

  /**
   * 删除模型
   */
  async deleteModel(id) {
    let models = await this.getModels();

    // 不允许删除最后一个模型
    if (models.length <= 1) {
      throw new Error('至少需要保留一个模型');
    }

    const modelToDelete = models.find(m => m.id === id);

    // 如果删除的是默认模型，需要先设置其他模型为默认
    if (modelToDelete && modelToDelete.isDefault) {
      const otherModels = models.filter(m => m.id !== id);
      if (otherModels.length > 0) {
        otherModels[0].isDefault = true;
      }
    }

    models = models.filter(m => m.id !== id);
    await this.saveModels(models);
  }

  /**
   * 设置默认模型
   */
  async setDefaultModel(id) {
    const models = await this.getModels();

    // 取消所有模型的默认状态
    models.forEach(m => {
      m.isDefault = (m.id === id);
    });

    await this.saveModels(models);

    // 返回设置的默认模型
    return models.find(m => m.id === id);
  }

  /**
   * 获取默认模型
   */
  async getDefaultModel() {
    const models = await this.getModels();
    return models.find(m => m.isDefault) || models[0] || null;
  }

  /**
   * 切换模型启用状态
   */
  async toggleModelEnabled(id) {
    const model = await this.getModelById(id);
    if (!model) {
      throw new Error('模型不存在');
    }

    // 不允许禁用所有模型
    if (model.enabled) {
      const enabledModels = await this.getModels();
      const otherEnabledModels = enabledModels.filter(m => m.enabled && m.id !== id);

      if (otherEnabledModels.length === 0) {
        throw new Error('至少需要启用一个模型');
      }
    }

    return this.updateModel(id, { enabled: !model.enabled });
  }

  /**
   * 获取已启用的模型
   */
  async getEnabledModels() {
    const models = await this.getModels();
    return models.filter(m => m.enabled);
  }

  /**
   * 保存模型列表
   */
  async saveModels(models) {
    await chrome.storage.local.set({ [this.storageKey]: models });
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
  module.exports = ModelManager;
}
