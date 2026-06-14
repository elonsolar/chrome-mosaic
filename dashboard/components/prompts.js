/**
 * 提示词管理页面逻辑
 */
const SCENES = [
  { key: 'all', label: '全部', icon: '' },
  { key: '头脑风暴', label: '头脑风暴', icon: '💡' },
  { key: '圆桌讨论', label: '圆桌讨论', icon: '🪑' },
  { key: '专家分析', label: '专家分析', icon: '🎓' },
  { key: '其他', label: '其他', icon: '✍️' }
];

const SCENE_COLORS = {
  '头脑风暴': '#8B5CF6',
  '圆桌讨论': '#EF4444',
  '专家分析': '#3B82F6',
  '其他': '#10B981'
};

const SCENE_ICONS = {
  '头脑风暴': '💡',
  '圆桌讨论': '🪑',
  '专家分析': '🎓',
  '其他': '✍️'
};

class PromptsTab {
  constructor() {
    this.state = {
      prompts: [],
      editingPromptId: null,
      selectedScene: 'all',
      viewMode: 'grid',
      favorites: new Set()
    };

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
      sceneTabs: document.getElementById('sceneTabs'),
      viewToggle: document.getElementById('viewToggle'),
      searchInput: document.getElementById('promptSearchInput'),
      clearSearchBtn: document.getElementById('clearPromptSearch')
    };
  }

  bindEvents() {
    const createBtn = this.elements.createPromptBtn || this.elements.newPromptBtn;
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.showPromptModal();
      });
    }

    if (this.elements.searchInput) {
      this.elements.searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim();
        this.elements.clearSearchBtn.style.display = keyword ? 'block' : 'none';
        this.filterPrompts(keyword);
      });
    }

    if (this.elements.clearSearchBtn) {
      this.elements.clearSearchBtn.addEventListener('click', () => {
        this.elements.searchInput.value = '';
        this.elements.clearSearchBtn.style.display = 'none';
        this.filterPrompts('');
      });
    }

    const confirmPromptBtn = document.getElementById('confirmPromptBtn');
    if (confirmPromptBtn) {
      confirmPromptBtn.addEventListener('click', () => {
        this.savePrompt();
      });
    }

    const cancelPromptBtn = document.getElementById('cancelPromptBtn');
    if (cancelPromptBtn) {
      cancelPromptBtn.addEventListener('click', () => {
        this.hidePromptModal();
      });
    }

    const closeButtons = document.querySelectorAll('.close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.hidePromptModal();
      });
    });

    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hidePromptModal();
        }
      });
    });

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

      if (Array.isArray(result)) {
        this.state.prompts = result;
      } else if (result && result.prompts) {
        this.state.prompts = result.prompts;
      } else {
        this.state.prompts = [];
      }

      const favoriteResult = await chrome.storage.local.get('favoritePrompts');
      this.state.favorites = new Set(favoriteResult.favoritePrompts || []);
    } catch (error) {
      console.error('加载提示词失败：', error);
      this.state.prompts = [];
    }
  }

  render() {
    this.renderSceneTabs();
    this.renderPromptsList();
  }

  renderSceneTabs() {
    if (!this.elements.sceneTabs) return;

    this.elements.sceneTabs.innerHTML = SCENES.map(s => `
      <button class="scene-tab ${this.state.selectedScene === s.key ? 'active' : ''}"
              data-scene="${s.key}">
        ${s.icon ? `<span class="scene-tab-icon">${s.icon}</span>` : ''}
        <span class="scene-tab-label">${s.label}</span>
        <span class="scene-tab-count">${this.countByScene(s.key)}</span>
      </button>
    `).join('');

    this.elements.sceneTabs.querySelectorAll('.scene-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.sceneTabs.querySelectorAll('.scene-tab').forEach(b =>
          b.classList.remove('active'));
        btn.classList.add('active');
        this.state.selectedScene = btn.dataset.scene;
        this.renderPromptsList();
      });
    });
  }

  countByScene(sceneKey) {
    if (sceneKey === 'all') return this.state.prompts.length;
    return this.state.prompts.filter(p => p.scene === sceneKey).length;
  }

  filterPrompts(keyword) {
    this.state.searchKeyword = keyword;
    this.renderPromptsList();
  }

  renderPromptsList() {
    const list = this.elements.promptsList;
    if (!list) return;

    let prompts = [...this.state.prompts];

    if (this.state.selectedScene !== 'all') {
      prompts = prompts.filter(p => p.scene === this.state.selectedScene);
    }

    if (this.state.searchKeyword) {
      const keyword = this.state.searchKeyword.toLowerCase();
      prompts = prompts.filter(p => 
        p.name.toLowerCase().includes(keyword) ||
        (p.content && p.content.toLowerCase().includes(keyword)) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(keyword)))
      );
    }

    if (prompts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          ${this.state.prompts.length === 0 ? '暂无提示词' : '没有找到匹配的提示词'}
        </div>
      `;
      return;
    }

    if (this.state.searchKeyword) {
      prompts.sort((a, b) => {
        const order = ['头脑风暴', '圆桌讨论', '专家分析', '其他', '未分类'];
        const sa = order.indexOf(a.scene || '未分类');
        const sb = order.indexOf(b.scene || '未分类');
        return (sa === -1 ? 99 : sa) - (sb === -1 ? 99 : sb);
      });
      if (this.state.viewMode === 'grid') {
        this.renderGridView(prompts);
      } else {
        this.renderListView(prompts);
      }
    } else {
      this.renderSceneGrouped(prompts);
    }
  }

  renderSceneGrouped(prompts) {
    const list = this.elements.promptsList;
    list.className = 'prompts-scene-groups';

    const groups = {};
    prompts.forEach(p => {
      const scene = p.scene || '未分类';
      if (!groups[scene]) groups[scene] = [];
      groups[scene].push(p);
    });

    const sceneOrder = ['头脑风暴', '圆桌讨论', '专家分析', '其他', '未分类'];

    list.innerHTML = sceneOrder
      .filter(scene => groups[scene])
      .map(scene => {
        const groupPrompts = groups[scene];
        const color = SCENE_COLORS[scene] || '#6B7280';
        const icon = SCENE_ICONS[scene] || '📋';

        if (this.state.viewMode === 'grid') {
          return `
            <div class="scene-group">
              <div class="scene-group-header" style="border-left-color: ${color};">
                <span class="scene-group-icon">${icon}</span>
                <h3 class="scene-group-title">${scene}</h3>
                <span class="scene-group-count">${groupPrompts.length}个提示词</span>
              </div>
              <div class="prompts-grid">
                ${groupPrompts.map(p => this.renderCard(p)).join('')}
              </div>
            </div>
          `;
        } else {
          return `
            <div class="scene-group">
              <div class="scene-group-header" style="border-left-color: ${color};">
                <span class="scene-group-icon">${icon}</span>
                <h3 class="scene-group-title">${scene}</h3>
                <span class="scene-group-count">${groupPrompts.length}个提示词</span>
              </div>
              <div class="prompts-list">
                ${groupPrompts.map(p => this.renderListItem(p)).join('')}
              </div>
            </div>
          `;
        }
      }).join('');

    this.bindPromptEvents();
  }

  renderCard(prompt) {
    const isFavorite = this.state.favorites.has(prompt.id);
    const avatarUrl = this.generateAvatarUrl(prompt);
    const hasTags = prompt.tags && prompt.tags.length > 0;
    const scene = prompt.scene;
    const sceneColor = SCENE_COLORS[scene] || '#6B7280';
    const hasScene = scene && scene !== '未分类';
    const usageCount = prompt.usageCount || 0;

    return `
      <div class="prompt-card" data-prompt-id="${prompt.id}">
        ${hasScene ? `<div class="prompt-card-scene-badge" style="background: ${sceneColor};">${scene}</div>` : ''}
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
          ${usageCount > 0 ? `<span class="prompt-usage-count">已使用 ${usageCount} 次</span>` : ''}
        </div>
        <div class="prompt-card-footer">
          <div class="prompt-actions">
            <button class="btn-action edit-btn" data-id="${prompt.id}" title="编辑">✏️</button>
            <button class="btn-action delete-btn" data-id="${prompt.id}" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  renderListItem(prompt) {
    const isFavorite = this.state.favorites.has(prompt.id);
    const tags = prompt.tags || [];
    const scene = prompt.scene;
    const sceneColor = SCENE_COLORS[scene] || '#6B7280';
    const usageCount = prompt.usageCount || 0;

    return `
      <div class="prompt-item" data-prompt-id="${prompt.id}">
        ${scene && scene !== '未分类' ? `<div class="prompt-item-scene" style="background: ${sceneColor};">${scene}</div>` : ''}
        <div class="prompt-info">
          <div class="prompt-item-header">
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-id="${prompt.id}" title="收藏">
              ${isFavorite ? '★' : '☆'}
            </button>
            <h3 class="prompt-name">
              ${this.escapeHtml(prompt.name)}
            </h3>
            ${usageCount > 0 ? `<span class="prompt-usage-badge">使用 ${usageCount} 次</span>` : ''}
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
  }

  renderGridView(prompts) {
    const list = this.elements.promptsList;
    list.className = 'prompts-grid';
    list.innerHTML = prompts.map(p => this.renderCard(p)).join('');
    this.bindPromptEvents();
  }

  renderListView(prompts) {
    const list = this.elements.promptsList;
    list.className = 'prompts-list';
    list.innerHTML = prompts.map(p => this.renderListItem(p)).join('');
    this.bindPromptEvents();
  }

  bindPromptEvents() {
    const list = this.elements.promptsList;

    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const promptId = btn.dataset.id;
        this.showPromptModal(promptId);
      });
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const promptId = btn.dataset.id;
        this.deletePrompt(promptId);
      });
    });

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
    return getLocalAvatarUrl(seed);
  }

  createSeedFromPrompt(prompt) {
    const parts = [
      prompt.name,
      (prompt.tags || []).slice(0, 3).join(',')
    ].join('|');
    return parts;
  }

}

const promptsTab = new PromptsTab();
document.addEventListener('DOMContentLoaded', () => {
  promptsTab.init();
});