/**
 * 模型管理页面逻辑
 */
class ModelsTab {
  constructor() {
    this.state = {
      models: [],
      selectedProvider: 'all',
      editingModelId: null
    };

    this.elements = {};
  }

  async init() {
    this.initElements();
    this.bindEvents();
    await this.loadModels();
    this.render();
  }

  initElements() {
    this.elements = {
      modelsList: document.getElementById('modelsList'),
      providerTabs: document.getElementById('providerTabs'),
      newModelBtn: document.getElementById('newModelBtn'),
      modelModal: document.getElementById('modelModal'),
      modelProvider: document.getElementById('modelProvider'),
      modelModel: document.getElementById('modelModel'),
      modelName: document.getElementById('modelName'),
      modelDescription: document.getElementById('modelDescription')
    };
  }

  bindEvents() {
    // 提供商标签切换
    this.elements.providerTabs.querySelectorAll('.provider-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.selectProvider(tab.dataset.provider);
      });
    });

    // 新建模型
    this.elements.newModelBtn.addEventListener('click', () => {
      this.showModelModal();
    });

    // 模型确认
    document.getElementById('confirmModelBtn').addEventListener('click', () => {
      this.saveModel();
    });

    // 取消按钮
    document.getElementById('cancelModelBtn').addEventListener('click', () => {
      this.hideModelModal();
    });

    // 关闭按钮
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideModelModal();
      });
    });

    // 点击外部关闭
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideModelModal();
      }
    });

    // 提供商变化时自动填充模型名称
    this.elements.modelProvider.addEventListener('change', (e) => {
      const provider = PROVIDERS[e.target.value];
      if (provider && provider.defaultModel) {
        this.elements.modelModel.value = provider.defaultModel;
        this.elements.modelName.value = provider.name;
      }
    });
  }

  async loadModels() {
    try {
      const models = await sendMessage({ action: 'getModels' });
      this.state.models = models || [];
    } catch (error) {
      console.error('加载模型失败:', error);
    }
  }

  render() {
    this.renderProviderTabs();
    this.renderModels();
  }

  renderProviderTabs() {
    this.elements.providerTabs.querySelectorAll('.provider-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.provider === this.state.selectedProvider);
    });
  }

  renderModels() {
    let filteredModels = this.state.models;

    // 按提供商过滤
    if (this.state.selectedProvider !== 'all') {
      filteredModels = filteredModels.filter(m => m.provider === this.state.selectedProvider);
    }

    if (filteredModels.length === 0) {
      this.elements.modelsList.innerHTML = '<div class="empty-state">暂无模型</div>';
      return;
    }

    // 按提供商分组
    const grouped = {};
    filteredModels.forEach(model => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });

    let html = '';
    for (const [provider, models] of Object.entries(grouped)) {
      const providerInfo = PROVIDERS[provider];
      html += `
        <div class="model-group">
          <div class="model-group-header">
            <span class="provider-badge" style="background: ${providerInfo?.color || '#666'}">
              ${providerInfo?.name || provider}
            </span>
          </div>
          <div class="model-group-items">
            ${models.map(model => this.renderModelItem(model)).join('')}
          </div>
        </div>
      `;
    }

    this.elements.modelsList.innerHTML = html;

    // 绑定事件
    this.bindModelEvents();
  }

  renderModelItem(model) {
    const providerInfo = PROVIDERS[model.provider];
    const isDefault = model.isDefault;
    const isEnabled = model.enabled;

    return `
      <div class="model-item ${isDefault ? 'default' : ''} ${!isEnabled ? 'disabled' : ''}" data-id="${model.id}">
        <div class="model-info">
          <div class="model-name">
            ${this.escapeHtml(model.name)}
            ${isDefault ? '<span class="badge badge-default">默认</span>' : ''}
            ${!isEnabled ? '<span class="badge badge-disabled">已禁用</span>' : ''}
          </div>
          <div class="model-details">
            <span class="model-provider">${providerInfo?.name || model.provider}</span>
            <span class="model-model">${this.escapeHtml(model.model)}</span>
          </div>
          ${model.description ? `<div class="model-description">${this.escapeHtml(model.description)}</div>` : ''}
        </div>
        <div class="model-actions">
          ${!isDefault ? `<button class="btn-set-default" data-id="${model.id}" title="设为默认">⭐</button>` : ''}
          <button class="btn-toggle" data-id="${model.id}" title="${isEnabled ? '禁用' : '启用'}">
            ${isEnabled ? '🔛' : '🔕'}
          </button>
          <button class="edit-btn" data-id="${model.id}" title="编辑">✏️</button>
          <button class="delete-btn" data-id="${model.id}" title="删除">🗑️</button>
        </div>
      </div>
    `;
  }

  bindModelEvents() {
    // 设为默认
    this.elements.modelsList.querySelectorAll('.btn-set-default').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.setDefaultModel(btn.dataset.id);
      });
    });

    // 切换启用状态
    this.elements.modelsList.querySelectorAll('.btn-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.toggleModel(btn.dataset.id);
      });
    });

    // 编辑
    this.elements.modelsList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editModel(btn.dataset.id);
      });
    });

    // 删除
    this.elements.modelsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteModel(btn.dataset.id);
      });
    });
  }

  selectProvider(provider) {
    this.state.selectedProvider = provider;
    this.render();
  }

  async setDefaultModel(modelId) {
    try {
      await sendMessage({
        action: 'setDefaultModel',
        modelId: modelId
      });

      await this.loadModels();
      this.render();
    } catch (error) {
      alert('设置失败：' + error.message);
    }
  }

  async toggleModel(modelId) {
    try {
      await sendMessage({
        action: 'toggleModelEnabled',
        modelId: modelId
      });

      await this.loadModels();
      this.render();
    } catch (error) {
      alert('操作失败：' + error.message);
    }
  }

  showModelModal(modelId = null) {
    this.state.editingModelId = modelId;

    // 填充提供商选项
    let providerHtml = '';
    for (const [id, provider] of Object.entries(PROVIDERS)) {
      providerHtml += `<option value="${id}">${provider.name}</option>`;
    }
    this.elements.modelProvider.innerHTML = providerHtml;

    if (modelId) {
      const model = this.state.models.find(m => m.id === modelId);
      document.getElementById('modelModalTitle').textContent = '编辑模型';
      this.elements.modelProvider.value = model.provider;
      this.elements.modelModel.value = model.model;
      this.elements.modelName.value = model.name;
      this.elements.modelDescription.value = model.description || '';
    } else {
      document.getElementById('modelModalTitle').textContent = '新建模型';
      this.elements.modelProvider.value = 'deepseek';
      this.elements.modelModel.value = 'deepseek-chat';
      this.elements.modelName.value = 'DeepSeek 聊天模型';
      this.elements.modelDescription.value = '';
    }

    this.elements.modelModal.classList.add('active');
  }

  hideModelModal() {
    this.elements.modelModal.classList.remove('active');
    this.state.editingModelId = null;
  }

  async saveModel() {
    const provider = this.elements.modelProvider.value;
    const model = this.elements.modelModel.value.trim();
    const name = this.elements.modelName.value.trim();
    const description = this.elements.modelDescription.value.trim();

    if (!provider || !model || !name) {
      alert('请填写所有必填字段');
      return;
    }

    try {
      if (this.state.editingModelId) {
        await sendMessage({
          action: 'updateModel',
          modelId: this.state.editingModelId,
          data: { provider, model, name, description }
        });
      } else {
        await sendMessage({
          action: 'createModel',
          data: { provider, model, name, description }
        });
      }

      await this.loadModels();
      this.render();
      this.hideModelModal();
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async editModel(modelId) {
    this.showModelModal(modelId);
  }

  async deleteModel(modelId) {
    if (!confirm('确定要删除这个模型吗？')) return;

    try {
      await sendMessage({
        action: 'deleteModel',
        modelId: modelId
      });

      await this.loadModels();
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
const modelsTab = new ModelsTab();
modelsTab.init();
