/**
 * 提示词管理页面逻辑
 */
class PromptsTab {
  constructor() {
    this.state = {
      prompts: [],
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
      promptsList: document.getElementById('promptsList'),
      newPromptBtn: document.getElementById('newPromptBtn'),
      promptModal: document.getElementById('promptModal'),
      promptName: document.getElementById('promptName'),
      promptContent: document.getElementById('promptContent'),
      promptVariables: document.getElementById('promptVariables')
    };
  }

  bindEvents() {
    // 新建提示词
    if (this.elements.newPromptBtn) {
      this.elements.newPromptBtn.addEventListener('click', () => {
        this.showPromptModal();
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
    } catch (error) {
      console.error('加载提示词失败：', error);
      this.state.prompts = [];
    }
  }

  render() {
    this.renderPromptsList();
  }

  renderPromptsList() {
    const list = this.elements.promptsList;
    if (!list) return;

    const prompts = [...this.state.prompts];

    if (prompts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          暂无提示词
        </div>
      `;
      return;
    }

    list.innerHTML = prompts.map(prompt => `
      <div class="prompt-item">
        <div class="prompt-info">
          <h3 class="prompt-name">${this.escapeHtml(prompt.name)}</h3>
          <p class="prompt-preview">${this.escapeHtml(prompt.content || '').substring(0, 100)}...</p>
          ${prompt.variables && prompt.variables.length > 0 ? `
            <div class="prompt-variables">
              ${prompt.variables.map(v => `<span class="variable-tag">${this.escapeHtml(v)}</span>`).join('')}
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
    `).join('');

    // 绑定事件
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const promptId = e.currentTarget.dataset.id;
        this.showPromptModal(promptId);
      });
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const promptId = e.currentTarget.dataset.id;
        this.deletePrompt(promptId);
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
      this.elements.promptVariables.value = (prompt.variables || []).join(',');
    } else {
      document.getElementById('promptModalTitle').textContent = '新建提示词';
      this.elements.promptName.value = '';
      this.elements.promptContent.value = '';
      this.elements.promptVariables.value = '';
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
          data: { name, content, variables }
        });
      } else {
        await sendMessage({
          action: 'createPrompt',
          data: { name, content, variables }
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
document.addEventListener('DOMContentLoaded', () => {
  promptsTab.init();
});
