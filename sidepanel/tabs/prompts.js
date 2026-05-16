/**
 * 提示词管理页面逻辑
 */
class PromptsTab {
  constructor() {
    this.state = {
      folders: [],
      prompts: [],
      selectedFolderId: null,
      editingFolderId: null,
      editingPromptId: null
    };

    this.elements = {};
  }

  async init() {
    this.initElements();
    this.bindEvents();
    await this.loadData();
    this.render();
  }

  initElements() {
    this.elements = {
      folderTree: document.getElementById('folderTree'),
      promptsList: document.getElementById('promptsList'),
      searchInput: document.getElementById('searchInput'),
      newFolderBtn: document.getElementById('newFolderBtn'),
      newPromptBtn: document.getElementById('newPromptBtn'),
      folderModal: document.getElementById('folderModal'),
      promptModal: document.getElementById('promptModal'),
      folderName: document.getElementById('folderName'),
      parentFolder: document.getElementById('parentFolder'),
      promptName: document.getElementById('promptName'),
      promptFolder: document.getElementById('promptFolder'),
      promptDescription: document.getElementById('promptDescription'),
      promptContent: document.getElementById('promptContent'),
      promptVariables: document.getElementById('promptVariables')
    };
  }

  bindEvents() {
    // 搜索
    this.elements.searchInput.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // 新建文件夹
    this.elements.newFolderBtn.addEventListener('click', () => {
      this.showFolderModal();
    });

    // 新建提示词
    this.elements.newPromptBtn.addEventListener('click', () => {
      this.showPromptModal();
    });

    // 文件夹确认
    document.getElementById('confirmFolderBtn').addEventListener('click', () => {
      this.saveFolder();
    });

    // 提示词确认
    document.getElementById('confirmPromptBtn').addEventListener('click', () => {
      this.savePrompt();
    });

    // 取消按钮
    document.getElementById('cancelFolderBtn').addEventListener('click', () => {
      this.hideFolderModal();
    });

    document.getElementById('cancelPromptBtn').addEventListener('click', () => {
      this.hidePromptModal();
    });

    // 关闭按钮
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideFolderModal();
        this.hidePromptModal();
      });
    });

    // 点击外部关闭
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideFolderModal();
        this.hidePromptModal();
      }
    });

    // 提示词内容变化时提取变量
    this.elements.promptContent.addEventListener('input', () => {
      this.extractVariables();
    });
  }

  async loadData() {
    try {
      const [folders, folderTree] = await Promise.all([
        sendMessage({ action: 'getFolders' }),
        sendMessage({ action: 'getFolderTree' })
      ]);

      this.state.folders = folders || [];
      this.state.folderTree = folderTree || [];
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }

  render() {
    this.renderFolderTree();
    if (this.state.selectedFolderId) {
      this.loadPrompts(this.state.selectedFolderId);
    } else {
      this.elements.promptsList.innerHTML = '<div class="empty-state">请选择文件夹</div>';
    }
  }

  renderFolderTree() {
    if (!this.state.folderTree || this.state.folderTree.length === 0) {
      this.elements.folderTree.innerHTML = '<div class="empty-state">暂无文件夹</div>';
      return;
    }

    this.elements.folderTree.innerHTML = this.renderFolderTreeItems(this.state.folderTree);

    // 绑定文件夹点击事件
    this.elements.folderTree.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = item.dataset.id;
        this.selectFolder(folderId);
      });

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showFolderContextMenu(item.dataset.id, e);
      });
    });
  }

  renderFolderTreeItems(folders, level = 0) {
    return folders.map(folder => {
      const isSelected = folder.id === this.state.selectedFolderId;
      const indent = level * 20;

      let html = `
        <div class="folder-item ${isSelected ? 'selected' : ''}"
             data-id="${folder.id}"
             style="padding-left: ${indent + 10}px">
          <span class="folder-icon">📁</span>
          <span class="folder-name">${this.escapeHtml(folder.name)}</span>
          <span class="folder-count">(${folder.promptCount || 0})</span>
        </div>
      `;

      if (folder.children && folder.children.length > 0) {
        html += this.renderFolderTreeItems(folder.children, level + 1);
      }

      return html;
    }).join('');
  }

  async selectFolder(folderId) {
    this.state.selectedFolderId = folderId;
    this.renderFolderTree();
    await this.loadPrompts(folderId);
  }

  async loadPrompts(folderId) {
    try {
      const prompts = await sendMessage({
        action: 'getPrompts',
        folderId: folderId
      });

      this.state.prompts = prompts || [];
      this.renderPrompts();
    } catch (error) {
      console.error('加载提示词失败:', error);
      this.elements.promptsList.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  }

  renderPrompts() {
    if (this.state.prompts.length === 0) {
      this.elements.promptsList.innerHTML = '<div class="empty-state">暂无提示词</div>';
      return;
    }

    this.elements.promptsList.innerHTML = this.state.prompts.map(prompt => {
      const preview = prompt.content.substring(0, 100) + (prompt.content.length > 100 ? '...' : '');

      return `
        <div class="prompt-item" data-id="${prompt.id}">
          <div class="prompt-header">
            <h3>${this.escapeHtml(prompt.name)}</h3>
            <div class="prompt-actions">
              <button class="edit-btn" data-id="${prompt.id}">编辑</button>
              <button class="delete-btn" data-id="${prompt.id}">&times;</button>
            </div>
          </div>
          <div class="prompt-description">${this.escapeHtml(prompt.description || '无描述')}</div>
          <div class="prompt-preview">${this.escapeHtml(preview)}</div>
          ${prompt.variables && prompt.variables.length > 0 ? `
            <div class="prompt-variables">
              变量：${prompt.variables.map(v => `<code>{${v}}</code>`).join(', ')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // 绑定事件
    this.elements.promptsList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editPrompt(btn.dataset.id);
      });
    });

    this.elements.promptsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePrompt(btn.dataset.id);
      });
    });
  }

  async handleSearch(keyword) {
    if (!keyword.trim()) {
      this.renderPrompts();
      return;
    }

    try {
      const results = await sendMessage({
        action: 'searchPrompts',
        keyword: keyword
      });

      this.state.prompts = results || [];
      this.renderPrompts();
    } catch (error) {
      console.error('搜索失败:', error);
    }
  }

  async extractVariables() {
    const content = this.elements.promptContent.value;
    const regex = /\{([^}]+)\}/g;
    const variables = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    this.elements.promptVariables.value = variables.join(',');
  }

  showFolderModal(folderId = null) {
    this.state.editingFolderId = folderId;

    if (folderId) {
      const folder = this.state.folders.find(f => f.id === folderId);
      document.getElementById('folderModalTitle').textContent = '编辑文件夹';
      this.elements.folderName.value = folder.name;
      this.elements.parentFolder.value = folder.parentId || '';
    } else {
      document.getElementById('folderModalTitle').textContent = '新建文件夹';
      this.elements.folderName.value = '';
      this.elements.parentFolder.value = this.state.selectedFolderId || '';
    }

    this.updateParentFolderOptions();
    this.elements.folderModal.classList.add('active');
  }

  showPromptModal(promptId = null) {
    this.state.editingPromptId = promptId;

    if (promptId) {
      const prompt = this.state.prompts.find(p => p.id === promptId);
      document.getElementById('promptModalTitle').textContent = '编辑提示词';
      this.elements.promptName.value = prompt.name;
      this.elements.promptFolder.value = prompt.folderId || '';
      this.elements.promptDescription.value = prompt.description || '';
      this.elements.promptContent.value = prompt.content;
      this.elements.promptVariables.value = (prompt.variables || []).join(',');
    } else {
      document.getElementById('promptModalTitle').textContent = '新建提示词';
      this.elements.promptName.value = '';
      this.elements.promptFolder.value = this.state.selectedFolderId || '';
      this.elements.promptDescription.value = '';
      this.elements.promptContent.value = '';
      this.elements.promptVariables.value = '';
    }

    this.updatePromptFolderOptions();
    this.elements.promptModal.classList.add('active');
  }

  hideFolderModal() {
    this.elements.folderModal.classList.remove('active');
    this.state.editingFolderId = null;
  }

  hidePromptModal() {
    this.elements.promptModal.classList.remove('active');
    this.state.editingPromptId = null;
  }

  updateParentFolderOptions() {
    const currentId = this.state.editingFolderId;
    let html = '<option value="">无（根目录）</option>';

    const addOptions = (folders, level = 0) => {
      folders.forEach(folder => {
        if (folder.id === currentId) return;

        const indent = '　'.repeat(level);
        html += `<option value="${folder.id}">${indent}${folder.name}</option>`;

        if (folder.children) {
          addOptions(folder.children, level + 1);
        }
      });
    };

    addOptions(this.state.folderTree || []);
    this.elements.parentFolder.innerHTML = html;
  }

  updatePromptFolderOptions() {
    let html = '<option value="">无（根目录）</option>';

    const addOptions = (folders, level = 0) => {
      folders.forEach(folder => {
        const indent = '　'.repeat(level);
        html += `<option value="${folder.id}">${indent}${folder.name}</option>`;

        if (folder.children) {
          addOptions(folder.children, level + 1);
        }
      });
    };

    addOptions(this.state.folderTree || []);
    this.elements.promptFolder.innerHTML = html;
  }

  async saveFolder() {
    const name = this.elements.folderName.value.trim();
    const parentId = this.elements.parentFolder.value || null;

    if (!name) {
      alert('请输入文件夹名称');
      return;
    }

    try {
      if (this.state.editingFolderId) {
        await sendMessage({
          action: 'updateFolder',
          folderId: this.state.editingFolderId,
          data: { name, parentId }
        });
      } else {
        await sendMessage({
          action: 'createFolder',
          name: name,
          parentId: parentId
        });
      }

      await this.loadData();
      this.render();
      this.hideFolderModal();
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async savePrompt() {
    const name = this.elements.promptName.value.trim();
    const folderId = this.elements.promptFolder.value || null;
    const description = this.elements.promptDescription.value.trim();
    const content = this.elements.promptContent.value.trim();
    const variables = this.elements.promptVariables.value
      .split(',')
      .map(v => v.trim())
      .filter(v => v);

    if (!name || !content) {
      alert('请输入提示词名称和内容');
      return;
    }

    try {
      if (this.state.editingPromptId) {
        await sendMessage({
          action: 'updatePrompt',
          promptId: this.state.editingPromptId,
          data: { name, folderId, description, content, variables }
        });
      } else {
        await sendMessage({
          action: 'createPrompt',
          data: { name, folderId, description, content, variables }
        });
      }

      await this.loadData();
      this.render();
      this.hidePromptModal();
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async editPrompt(promptId) {
    this.showPromptModal(promptId);
  }

  async deletePrompt(promptId) {
    if (!confirm('确定要删除这个提示词吗？')) return;

    try {
      await sendMessage({
        action: 'deletePrompt',
        promptId: promptId
      });

      await this.loadData();
      this.render();
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
const promptsTab = new PromptsTab();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => promptsTab.init());
} else {
  promptsTab.init();
}
