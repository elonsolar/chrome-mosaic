/**
 * 平台管理器
 * 管理AI平台配置（平台级：包含API配置、网页模型、API模型列表）
 */
const BUILTIN_WEB_URLS = {
  deepseek: 'https://chat.deepseek.com/',
  doubao: 'https://www.doubao.com/chat/',
  qianwen: 'https://www.qianwen.com/chat/',
  kimi: 'https://kimi.moonshot.cn/',
};

class PlatformManager {
  constructor() {
    this.storageKey = 'platforms';
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return 'plt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 生成模型唯一ID
   */
  generateModelId() {
    return 'model-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 平台颜色映射
   */
  getPlatformColor(platformName) {
    const colors = {
      '网页': '#10b981',        // green
      'OpenAI': '#00a67e',      // green
      'DeepSeek': '#4f6ef7',    // blue
      'Kimi': '#6366f1',        // indigo
      '豆包': '#f59e0b',        // amber
      '千问': '#8b5cf6',        // purple
      '智谱': '#ec4899',        // pink
      'Claude': '#d97706',      // orange
      'Gemini': '#06b6d4',      // cyan
      'default': '#667eea'      // default purple
    };

    return colors[platformName] || colors['default'];
  }

  /**
   * 获取所有模型（扁平化）
   * 用于模型选择器等需要获取所有模型的场景
   */
  async getAllModels() {
    const platforms = await this.getPlatforms();
    const models = [];

    for (const platform of platforms) {
      // 确保 models 字段存在且是数组
      if (!platform.models || !Array.isArray(platform.models)) {
        console.warn(`[PlatformManager] Platform ${platform.platformName} has invalid models field, skipping`);
        continue;
      }

      for (const model of platform.models) {
        if (!model.enabled) continue;

        const color = platform.color || this.getPlatformColor(platform.platformName);

        if (platform.isWeb) {
          // 网页模型：webUrl 始终用代码定义的最新值
          const webUrl = BUILTIN_WEB_URLS[model.code] || model.webUrl || '';
          models.push({
            id: model.id,
            code: model.code,
            platformName: platform.platformName,
            platformId: platform.id,
            accessMethod: 'web',
            enabled: model.enabled,
            color: color,
            webUrl: webUrl
          });
        } else {
          // API模型
          models.push({
            id: model.id,
            code: model.code,
            platformName: platform.platformName,
            platformId: platform.id,
            accessMethod: 'api',
            enabled: model.enabled,
            baseUrl: platform.baseUrl,
            apiKey: platform.apiKey,
            color: color
          });
        }
      }
    }

    return models;
  }

  /**
   * 创建内置网页平台
   */
  async createBuiltinWebPlatform() {
    const webModels = Object.entries(BUILTIN_WEB_URLS).map(([code, webUrl]) => ({ code, webUrl }));

    const models = webModels.map(m => ({
      id: this.generateModelId(),
      code: m.code,
      webUrl: m.webUrl,
      enabled: true
    }));

    const webPlatform = {
      id: this.generateId(),
      platformName: '网页',
      isWeb: true,
      color: this.getPlatformColor('网页'),
      models: models
    };

    await this.savePlatforms([webPlatform]);
    return webPlatform;
  }

  /**
   * 初始化平台数据
   */
  async initialize() {
    const platforms = await this.getPlatforms();
    if (platforms.length === 0) {
      console.log('[PlatformManager] 首次安装，创建内置网页平台');
      await this.createBuiltinWebPlatform();
    } else {
      console.log('[PlatformManager] 平台数据已存在');
      // 数据迁移：确保所有平台都有有效的 models 字段
      let needsMigration = false;
      const migratedPlatforms = platforms.map(platform => {
        if (!platform.models || !Array.isArray(platform.models)) {
          console.warn(`[PlatformManager] Platform ${platform.platformName} has invalid models field, initializing to empty array`);
          needsMigration = true;
          return {
            ...platform,
            models: []
          };
        }
        return platform;
      });

      if (needsMigration) {
        await this.savePlatforms(migratedPlatforms);
        console.log('[PlatformManager] 数据迁移完成');
      }
    }
  }

  /**
   * 获取所有平台
   */
  async getPlatforms() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * 获取单个平台
   */
  async getPlatform(platformId) {
    const platforms = await this.getPlatforms();
    return platforms.find(p => p.id === platformId) || null;
  }

  /**
   * 创建平台
   * 支持预定义平台和自定义平台
   */
  async createPlatform(data) {
    const { providerId, providerName, baseUrl, apiKey } = data;
    const name = providerName || providerId || '未命名平台';

    const platforms = await this.getPlatforms();

    // 检查是否已存在（根据平台名称）
    const existing = platforms.find(p => p.platformName === name);
    if (existing) {
      throw new Error('该平台已存在');
    }

    const newPlatform = {
      id: this.generateId(),
      platformName: name,
      isWeb: false,
      color: this.getPlatformColor(name),
      baseUrl: baseUrl || '',
      apiKey: apiKey || '',
      models: []
    };

    platforms.push(newPlatform);
    await this.savePlatforms(platforms);
    return newPlatform;
  }

  /**
   * 更新平台
   */
  async updatePlatform(platformId, updates) {
    const platforms = await this.getPlatforms();
    const index = platforms.findIndex(p => p.id === platformId);

    if (index === -1) {
      throw new Error('平台不存在');
    }

    platforms[index] = {
      ...platforms[index],
      ...updates,
      id: platformId  // 确保ID不被修改
    };

    await this.savePlatforms(platforms);
    return platforms[index];
  }

  /**
   * 删除平台
   */
  async deletePlatform(platformId) {
    let platforms = await this.getPlatforms();

    if (platforms.length <= 1) {
      throw new Error('至少需要保留一个平台');
    }

    platforms = platforms.filter(p => p.id !== platformId);
    await this.savePlatforms(platforms);
  }

  /**
   * 添加模型
   */
  async addModel(platformId, modelData) {
    const platform = await this.getPlatform(platformId);
    if (!platform) {
      throw new Error('平台不存在');
    }

    if (platform.isWeb) {
      throw new Error('网页平台不支持添加模型');
    }

    // 确保 models 字段存在且是数组
    if (!platform.models || !Array.isArray(platform.models)) {
      platform.models = [];
    }

    // 检查模型编码是否已存在
    const existing = platform.models.find(m => m.code === modelData.code);
    if (existing) {
      throw new Error('模型编码已存在');
    }

    const newModel = {
      id: this.generateModelId(),
      code: modelData.code || modelData.id,
      enabled: modelData.enabled !== false
    };

    platform.models.push(newModel);
    await this.updatePlatform(platformId, { models: platform.models });
    return newModel;
  }

  /**
   * 更新模型
   */
  async updateModel(platformId, modelId, updates) {
    const platform = await this.getPlatform(platformId);
    if (!platform) {
      throw new Error('平台不存在');
    }

    // 确保 models 字段存在且是数组
    if (!platform.models || !Array.isArray(platform.models)) {
      throw new Error('模型不存在');
    }

    const index = platform.models.findIndex(m => m.id === modelId);
    if (index === -1) {
      throw new Error('模型不存在');
    }

    platform.models[index] = {
      ...platform.models[index],
      ...updates,
      id: modelId
    };

    await this.updatePlatform(platformId, { models: platform.models });
    return platform.models[index];
  }

  /**
   * 删除模型
   */
  async deleteModel(platformId, modelId) {
    const platform = await this.getPlatform(platformId);
    if (!platform) {
      throw new Error('平台不存在');
    }

    if (platform.isWeb) {
      throw new Error('网页平台不支持删除模型');
    }

    // 确保 models 字段存在且是数组
    if (!platform.models || !Array.isArray(platform.models)) {
      platform.models = [];
    }

    platform.models = platform.models.filter(m => m.id !== modelId);
    await this.updatePlatform(platformId, { models: platform.models });
  }

  /**
   * 切换模型启用状态
   */
  async toggleModelEnabled(platformId, modelId) {
    const platform = await this.getPlatform(platformId);
    if (!platform) {
      throw new Error('平台不存在');
    }

    // 确保 models 字段存在且是数组
    if (!platform.models || !Array.isArray(platform.models)) {
      throw new Error('模型不存在');
    }

    const model = platform.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error('模型不存在');
    }

    await this.updateModel(platformId, modelId, {
      enabled: !model.enabled
    });
  }

  /**
   * 根据模型ID获取模型
   */
  async getModelById(modelId) {
    const models = await this.getAllModels();
    return models.find(m => m.id === modelId) || null;
  }

  /**
   * 保存平台列表
   */
  async savePlatforms(platforms) {
    await chrome.storage.local.set({ [this.storageKey]: platforms });
  }

}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformManager;
}
