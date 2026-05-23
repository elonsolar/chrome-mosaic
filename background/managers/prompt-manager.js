/**
 * 提示词管理器
 * 负责提示词的CRUD操作
 */
class PromptManager {
  constructor() {
    this.storageKey = 'prompts';
  }

  /**
   * 创建新提示词
   */
  async createPrompt(data) {
    const { name, content, tags, isBuiltin } = data;

    if (!name || !content) {
      throw new Error('提示词名称和内容不能为空');
    }

    const prompts = await this.getPrompts();
    const newPrompt = {
      id: this.generateId(),
      name,
      content,
      tags: tags || [],
      isBuiltin: isBuiltin || false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    prompts.push(newPrompt);
    await this.savePrompts(prompts);

    return newPrompt;
  }

  /**
   * 获取所有提示词
   */
  async getPrompts() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * 根据ID获取提示词
   */
  async getPromptById(id) {
    const prompts = await this.getPrompts();
    return prompts.find(p => p.id === id) || null;
  }

  /**
   * 更新提示词
   */
  async updatePrompt(id, data) {
    const prompts = await this.getPrompts();
    const index = prompts.findIndex(p => p.id === id);

    if (index === -1) {
      throw new Error('提示词不存在');
    }

    prompts[index] = {
      ...prompts[index],
      ...data,
      id,
      updatedAt: Date.now()
    };

    await this.savePrompts(prompts);
    return prompts[index];
  }

  /**
   * 删除提示词
   */
  async deletePrompt(id) {
    let prompts = await this.getPrompts();
    prompts = prompts.filter(p => p.id !== id);
    await this.savePrompts(prompts);
  }

  /**
   * 搜索提示词
   */
  async searchPrompts(keyword) {
    const prompts = await this.getPrompts();
    const lowerKeyword = keyword.toLowerCase();

    return prompts.filter(p =>
      p.name.toLowerCase().includes(lowerKeyword) ||
      p.content.toLowerCase().includes(lowerKeyword) ||
      p.description.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * 移动提示词到其他文件夹
   */
  async movePrompt(id, targetFolderId) {
    return this.updatePrompt(id, { folderId: targetFolderId });
  }

  /**
   * 保存提示词列表
   */
  async savePrompts(prompts) {
    await chrome.storage.local.set({ [this.storageKey]: prompts });
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
  module.exports = PromptManager;
}
