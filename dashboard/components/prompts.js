/**
 * 提示词管理页面逻辑
 */
class PromptsTab {
  constructor() {
    this.state = {
      prompts: [],
      editingPromptId: null,
      selectedTag: 'all',
      viewMode: 'grid',
      favorites: new Set()
    };

    // 内置提示词
    this.builtinPrompts = [
      {
        id: 'builtin-code-review',
        name: '代码审查',
        content: '请审查以下代码，重点关注：\n1. 代码质量和可读性\n2. 潜在的 bug 和边界情况\n3. 性能优化机会\n4. 安全性问题\n5. 最佳实践建议\n\n请提供具体的改进建议，并说明理由。',
        tags: ['代码审查', '质量', '编程'],
        isBuiltin: true
      },
      {
        id: 'builtin-writing-polish',
        name: '文章润色',
        content: '请帮我润色以下文本，使其更加清晰、准确、流畅。保持原意不变，优化表达方式和逻辑结构。提供修改前后的对比说明。',
        tags: ['润色', '编辑', '写作'],
        isBuiltin: true
      },
      {
        id: 'builtin-translation',
        name: '专业翻译',
        content: '请将以下文本翻译成目标语言，确保：\n1. 准确传达原意\n2. 符合目标语言的表达习惯\n3. 保持原文的语气和风格\n4. 专业术语准确\n\n如有歧义，请提供多种翻译选项并说明差异。',
        tags: ['翻译', '多语言'],
        isBuiltin: true
      },
      {
        id: 'builtin-analysis',
        name: '逻辑分析',
        content: '请对以下内容进行深入分析：\n1. 核心观点和论据\n2. 逻辑结构和推理过程\n3. 潜在的假设和偏见\n4. 优势和不足\n5. 改进建议\n\n提供客观、结构化的分析结果。',
        tags: ['分析', '逻辑'],
        isBuiltin: true
      },
      {
        id: 'builtin-creative',
        name: '创意写作',
        content: '请基于以下主题进行创意写作。要求：\n1. 构思新颖，视角独特\n2. 情节或观点引人入胜\n3. 语言生动，富有感染力\n4. 结构完整，逻辑自洽\n\n发挥创造力，打破常规思维。',
        tags: ['创意', '写作'],
        isBuiltin: true
      },
      {
        id: 'builtin-problem-solving',
        name: '问题解决',
        content: '请帮我分析并解决以下问题。步骤：\n1. 明确问题本质和目标\n2. 分析根本原因\n3. 提出多个解决方案\n4. 评估各方案的优劣\n5. 给出最佳方案和实施步骤\n\n请提供系统性的解决方案。',
        tags: ['问题解决', '方法论'],
        isBuiltin: true
      }
    ];

    this.elements = {};
  }

  async init() {
    this.initElements();
    this.bindEvents();
    await this.loadData();
    this.render();
    this.initMessageListener();
  }

  initMessageListener() {
    // 监听来自父窗口的消息（如来自 FAB 按钮）
    window.addEventListener('message', (e) => {
      const action = e.data?.action;
      if (action === 'createPrompt') {
        this.showPromptModal();
      } else if (action === 'importPrompts') {
        this.importPrompts();
      } else if (action === 'exportPrompts') {
        this.exportPrompts();
      }
    });
  }

  initElements() {
    this.elements = {
      promptsList: document.getElementById('promptsList'),
      newPromptBtn: document.getElementById('newPromptBtn'),
      createPromptBtn: document.getElementById('createPromptBtn'),
      promptModal: document.getElementById('promptModal'),
      promptName: document.getElementById('promptName'),
      promptContent: document.getElementById('promptContent'),
      promptTags: document.getElementById('promptTags'),
      tagsCloud: document.getElementById('tagsCloud'),
      viewToggle: document.getElementById('viewToggle'),
      searchInput: document.getElementById('promptSearchInput'),
      clearSearchBtn: document.getElementById('clearPromptSearch')
    };
  }

  bindEvents() {
    // 新建提示词按钮
    const createBtn = this.elements.createPromptBtn || this.elements.newPromptBtn;
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.showPromptModal();
      });
    }

    // 搜索输入
    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim();
        this.elements.clearSearchBtn.style.display = keyword ? 'block' : 'none';
        this.filterPrompts(keyword);
      });
    }

    // 清除搜索
    if (this.elements.clearSearchBtn) {
      this.elements.clearSearchBtn.addEventListener('click', () => {
        this.elements.searchInput.value = '';
        this.elements.clearSearchBtn.style.display = 'none';
        this.filterPrompts('');
      });
    }

    // 提示词确认
    const confirmPromptBtn = document.getElementById('confirmPromptBtn');
    if (confirmPromptBtn) {
      confirmPromptBtn.addEventListener('click', () => {
        this.savePrompt();
      });
    }

    // 取消按钮
    const cancelPromptBtn = document.getElementById('cancelPromptBtn');
    if (cancelPromptBtn) {
      cancelPromptBtn.addEventListener('click', () => {
        this.hidePromptModal();
      });
    }

    // 关闭按钮
    const closeButtons = document.querySelectorAll('.close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.hidePromptModal();
      });
    });

    // 点击模态框外部关闭
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hidePromptModal();
        }
      });
    });

    // 视图切换事件
    this.initViewToggle();
  }

  initViewToggle() {
    if (!this.elements.viewToggle) return;

    this.elements.viewToggle.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.viewToggle.querySelectorAll('.view-btn').forEach(b =>
          b.classList.remove('active'));
        btn.classList.add('active');
        this.state.viewMode = btn.dataset.view;
        this.render();
      });
    });
  }

  async loadData() {
    try {
      const result = await sendMessage({
        action: 'getPrompts'
      });

      // result直接是数组，不是 {prompts: [...]}
      if (Array.isArray(result)) {
        this.state.prompts = result;
      } else if (result && result.prompts) {
        this.state.prompts = result.prompts;
      } else {
        this.state.prompts = [];
      }

      // 初始化内置提示词
      await this.initBuiltinPrompts();

      // 加载收藏的提示词
      const favoriteResult = await chrome.storage.local.get('favoritePrompts');
      this.state.favorites = new Set(favoriteResult.favoritePrompts || []);
    } catch (error) {
      console.error('加载提示词失败：', error);
      this.state.prompts = [];
    }
  }

  async initBuiltinPrompts() {
    const builtinIds = this.builtinPrompts.map(p => p.id);
    const existingBuiltin = this.state.prompts.filter(p => p.isBuiltin);

    // 如果所有内置提示词都已存在，则不需要初始化
    if (existingBuiltin.length === this.builtinPrompts.length) {
      return;
    }

    // 只添加不存在的内置提示词
    for (const builtin of this.builtinPrompts) {
      const exists = this.state.prompts.find(p => p.id === builtin.id);
      if (!exists) {
        try {
          await sendMessage({
            action: 'createPrompt',
            data: {
              name: builtin.name,
              content: builtin.content,
              tags: builtin.tags,
              isBuiltin: true
            }
          });
        } catch (error) {
          console.error('初始化内置提示词失败：', builtin.name, error);
        }
      }
    }

    // 重新加载提示词列表
    const result = await sendMessage({
      action: 'getPrompts'
    });
    if (Array.isArray(result)) {
      this.state.prompts = result;
    } else if (result && result.prompts) {
      this.state.prompts = result.prompts;
    }
  }

  render() {
    this.updateTagsCloud();
    this.renderPromptsList();
  }

  filterPrompts(keyword) {
    this.state.searchKeyword = keyword;
    this.renderPromptsList();
  }

  updateTagsCloud() {
    if (!this.elements.tagsCloud) return;

    // 提取所有标签
    const allTags = new Set();
    this.state.prompts.forEach(prompt => {
      (prompt.tags || []).forEach(tag => allTags.add(tag));
    });

    if (allTags.size === 0) {
      this.elements.tagsCloud.style.display = 'none';
      return;
    }

    this.elements.tagsCloud.style.display = 'flex';
    this.elements.tagsCloud.innerHTML = `
      <button class="tag-filter active" data-tag="all">全部标签</button>
      ${Array.from(allTags).map(tag =>
        `<button class="tag-filter" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</button>`
      ).join('')}
    `;

    // 绑定事件
    this.elements.tagsCloud.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.tagsCloud.querySelectorAll('.tag-filter').forEach(b =>
          b.classList.remove('active'));
        btn.classList.add('active');
        this.state.selectedTag = btn.dataset.tag;
        this.renderPromptsList();
      });
    });
  }

  renderPromptsList() {
    const list = this.elements.promptsList;
    if (!list) return;

    let prompts = [...this.state.prompts];

    // 搜索过滤
    if (this.state.searchKeyword) {
      const keyword = this.state.searchKeyword.toLowerCase();
      prompts = prompts.filter(p => 
        p.name.toLowerCase().includes(keyword) ||
        (p.content && p.content.toLowerCase().includes(keyword)) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(keyword)))
      );
    }

    // 标签过滤
    if (this.state.selectedTag !== 'all') {
      prompts = prompts.filter(p => (p.tags || []).includes(this.state.selectedTag));
    }

    if (prompts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          ${this.state.prompts.length === 0 ? '暂无提示词' : '没有找到匹配的提示词'}
        </div>
      `;
      return;
    }

    // 根据视图模式渲染
    if (this.state.viewMode === 'grid') {
      this.renderGridView(prompts);
    } else {
      this.renderListView(prompts);
    }
  }

  renderListView(prompts) {
    const list = this.elements.promptsList;
    list.className = 'prompts-list';

    list.innerHTML = prompts.map(prompt => {
      const isFavorite = this.state.favorites.has(prompt.id);
      const tags = prompt.tags || [];

      return `
        <div class="prompt-item" data-prompt-id="${prompt.id}">
          <div class="prompt-info">
            <div class="prompt-item-header">
              <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${prompt.id}" title="收藏">
                ${isFavorite ? '★' : '☆'}
              </button>
              <h3 class="prompt-name">
                ${this.escapeHtml(prompt.name)}
              </h3>
            </div>
            <p class="prompt-preview">${this.escapeHtml(prompt.content || '')}</p>
            ${tags.length > 0 ? `
              <div class="prompt-tags">
                ${tags.slice(0, 3).map(tag => `<span class="prompt-tag">${this.escapeHtml(tag)}</span>`).join('')}
                ${tags.length > 3 ? `<span class="prompt-tag">+${tags.length - 3}</span>` : ''}
              </div>
            ` : ''}
          </div>
          <div class="prompt-actions">
            <button class="btn-action edit-btn" data-id="${prompt.id}" title="编辑">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-action delete-btn" data-id="${prompt.id}" title="删除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.bindPromptEvents();
  }

  renderGridView(prompts) {
    const list = this.elements.promptsList;

    list.className = 'prompts-grid';
    list.innerHTML = prompts.map(prompt => {
      const isFavorite = this.state.favorites.has(prompt.id);
      const avatarUrl = this.generateAvatarUrl(prompt);
      const hasTags = prompt.tags && prompt.tags.length > 0;

      return `
        <div class="prompt-card" data-prompt-id="${prompt.id}">
          <div class="prompt-card-header">
            <div class="prompt-avatar">
              <img src="${avatarUrl}" alt="${this.escapeHtml(prompt.name)}" loading="lazy">
            </div>
            <div class="prompt-card-meta-header">
              <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${prompt.id}" title="收藏">
                ${isFavorite ? '★' : '☆'}
              </button>
            </div>
          </div>
          <div class="prompt-card-body">
            <h3 class="prompt-card-title">${this.escapeHtml(prompt.name)}</h3>
            <p class="prompt-card-preview">${this.escapeHtml(prompt.content || '')}</p>
          </div>
          <div class="prompt-card-meta">
            ${hasTags ? `
              <div class="prompt-card-tags">
                ${prompt.tags.map(tag => `<span class="prompt-tag">${this.escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
          <div class="prompt-card-footer">
            <div class="prompt-actions">
              <button class="btn-action edit-btn" data-id="${prompt.id}" title="编辑">✏️</button>
              <button class="btn-action delete-btn" data-id="${prompt.id}" title="删除">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.bindPromptEvents();
  }

  bindPromptEvents() {
    const list = this.elements.promptsList;

    // 编辑按钮
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const promptId = btn.dataset.id;
        this.showPromptModal(promptId);
      });
    });

    // 删除按钮
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const promptId = btn.dataset.id;
        this.deletePrompt(promptId);
      });
    });

    // 收藏按钮
    list.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const promptId = btn.dataset.id;
        this.toggleFavorite(promptId);
      });
    });
  }

  showPromptModal(promptId = null) {
    this.state.editingPromptId = promptId;

    if (promptId) {
      const prompt = this.state.prompts.find(p => p.id === promptId);
      document.getElementById('promptModalTitle').textContent = '编辑提示词';
      this.elements.promptName.value = prompt.name;
      this.elements.promptContent.value = prompt.content;
      this.elements.promptTags.value = (prompt.tags || []).join(',');
    } else {
      document.getElementById('promptModalTitle').textContent = '新建提示词';
      this.elements.promptName.value = '';
      this.elements.promptContent.value = '';
      this.elements.promptTags.value = '';
    }

    this.elements.promptModal.classList.add('active');
  }

  hidePromptModal() {
    this.elements.promptModal.classList.remove('active');
    this.state.editingPromptId = null;
  }

  async savePrompt() {
    const name = this.elements.promptName.value.trim();
    const content = this.elements.promptContent.value.trim();
    const tags = this.elements.promptTags.value
      .split(',')
      .map(t => t.trim())
      .filter(t => t);

    if (!name || !content) {
      alert('请输入提示词名称和内容');
      return;
    }

    try {
      const data = { name, content, tags };

      if (this.state.editingPromptId) {
        await sendMessage({
          action: 'updatePrompt',
          promptId: this.state.editingPromptId,
          data: data
        });
      } else {
        await sendMessage({
          action: 'createPrompt',
          data: data
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

  toggleFavorite(promptId) {
    if (this.state.favorites.has(promptId)) {
      this.state.favorites.delete(promptId);
    } else {
      this.state.favorites.add(promptId);
    }

    // 保存到 storage
    chrome.storage.local.set({ favoritePrompts: Array.from(this.state.favorites) });

    this.render();
  }

  async exportPrompts() {
    if (this.state.prompts.length === 0) {
      alert('没有提示词可以导出');
      return;
    }

    const dataStr = JSON.stringify(this.state.prompts, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `mosaic-prompts-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    this.showNotification('已导出提示词');
  }

  async importPrompts() {
    // 创建文件选择器
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const prompts = JSON.parse(text);

        if (!Array.isArray(prompts)) {
          throw new Error('无效的提示词格式');
        }

        const confirmed = confirm(`将导入 ${prompts.length} 个提示词，是否继续？`);
        if (!confirmed) return;

        // 导入提示词
        for (const prompt of prompts) {
          if (prompt.name && prompt.content) {
            await sendMessage({
              action: 'createPrompt',
              data: {
                name: prompt.name,
                content: prompt.content,
                variables: prompt.variables || [],
                tags: prompt.tags || []
              }
            });
          }
        }

        await this.loadData();
        this.render();
        this.showNotification(`已导入 ${prompts.length} 个提示词`);
      } catch (error) {
        alert('导入失败：' + error.message);
      }
    };

    input.click();
  }

  showNotification(message) {
    // 创建通知
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--prompts-primary);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: slideInRight 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  generateAvatarUrl(prompt) {
    const seed = this.createSeedFromPrompt(prompt);
    const style = 'adventurer';
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }

  createSeedFromPrompt(prompt) {
    const parts = [
      prompt.name,
      (prompt.tags || []).slice(0, 3).join(',')
    ].join('|');
    return parts;
  }

}

// 初始化
const promptsTab = new PromptsTab();
document.addEventListener('DOMContentLoaded', () => {
  promptsTab.init();
});
