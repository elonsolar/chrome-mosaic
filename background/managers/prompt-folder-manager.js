/**
 * 提示词文件夹管理器
 * 支持树形结构的文件夹组织
 */
class PromptFolderManager {
  constructor() {
    this.storageKey = 'promptFolders';
  }

  /**
   * 创建新文件夹
   */
  async createFolder(name, parentId = null) {
    if (!name || name.trim() === '') {
      throw new Error('文件夹名称不能为空');
    }

    const folders = await this.getFolders();
    const newFolder = {
      id: this.generateId(),
      name: name.trim(),
      parentId,
      icon: null,
      createdAt: Date.now()
    };

    folders.push(newFolder);
    await this.saveFolders(folders);

    return newFolder;
  }

  /**
   * 获取所有文件夹
   */
  async getFolders() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * 根据ID获取文件夹
   */
  async getFolderById(id) {
    const folders = await this.getFolders();
    return folders.find(f => f.id === id) || null;
  }

  /**
   * 获取文件夹树形结构
   */
  async getFolderTree() {
    const folders = await this.getFolders();
    const prompts = await this.getPrompts?.() || [];

    // 构建文件夹树
    const buildTree = (parentId = null) => {
      return folders
        .filter(f => f.parentId === parentId)
        .map(folder => ({
          ...folder,
          children: buildTree(folder.id),
          promptCount: prompts.filter(p => p.folderId === folder.id).length
        }));
    };

    return buildTree();
  }

  /**
   * 更新文件夹
   */
  async updateFolder(id, data) {
    const folders = await this.getFolders();
    const index = folders.findIndex(f => f.id === id);

    if (index === -1) {
      throw new Error('文件夹不存在');
    }

    folders[index] = {
      ...folders[index],
      ...data,
      id
    };

    await this.saveFolders(folders);
    return folders[index];
  }

  /**
   * 删除文件夹
   * 如果有子文件夹或提示词，需要先处理
   */
  async deleteFolder(id, force = false) {
    const folders = await this.getFolders();

    // 检查是否有子文件夹
    const hasChildren = folders.some(f => f.parentId === id);
    if (hasChildren && !force) {
      throw new Error('请先删除子文件夹');
    }

    // 删除文件夹
    const updatedFolders = folders.filter(f => f.id !== id);
    await this.saveFolders(updatedFolders);

    // TODO: 处理该文件夹下的提示词（移动到根目录或删除）
    // 这里需要在实际使用时实现
  }

  /**
   * 移动文件夹
   */
  async moveFolder(id, targetParentId) {
    // 检查是否会形成循环
    if (await this.wouldCreateCycle(id, targetParentId)) {
      throw new Error('不能将文件夹移动到其子文件夹中');
    }

    return this.updateFolder(id, { parentId: targetParentId });
  }

  /**
   * 检查移动是否会形成循环
   */
  async wouldCreateCycle(folderId, targetParentId) {
    if (!targetParentId) return false;

    let currentId = targetParentId;
    const visited = new Set();

    while (currentId) {
      if (currentId === folderId) return true;
      if (visited.has(currentId)) return true;

      visited.add(currentId);
      const folder = await this.getFolderById(currentId);
      currentId = folder?.parentId;
    }

    return false;
  }

  /**
   * 保存文件夹列表
   */
  async saveFolders(folders) {
    await chrome.storage.local.set({ [this.storageKey]: folders });
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
  module.exports = PromptFolderManager;
}
