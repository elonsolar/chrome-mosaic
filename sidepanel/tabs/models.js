/**
 * 模型管理页面逻辑
 */
class ModelsTab {
  constructor() {
    this.state = {
      models: [],
      selectedProvider: 'all',
      editingModelId: null,
      flows: [] // 缓存流程列表
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

    // 新建虚拟模型
    this.elements.newVirtualModelBtn = document.getElementById('newVirtualModelBtn');
    if (this.elements.newVirtualModelBtn) {
      this.elements.newVirtualModelBtn.addEventListener('click', () => {
        this.showVirtualModelModal();
      });
    }

    // 新建模型
    this.elements.newModelBtn.addEventListener('click', () => {
      this.showModelModal();
    });

    // 虚拟模型确认
    const confirmVirtualModelBtn = document.getElementById('confirmVirtualModelBtn');
    if (confirmVirtualModelBtn) {
      confirmVirtualModelBtn.addEventListener('click', () => {
        this.saveVirtualModel();
      });
    }

    // 虚拟模型取消
    const cancelVirtualModelBtn = document.getElementById('cancelVirtualModelBtn');
    if (cancelVirtualModelBtn) {
      cancelVirtualModelBtn.addEventListener('click', () => {
        this.hideVirtualModelModal();
      });
    }

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
      const [models, flows] = await Promise.all([
        sendMessage({ action: 'getModels' }),
        sendMessage({ action: 'getFlows' })
      ]);
      this.state.models = models || [];
      this.state.flows = flows || [];
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

    // 按提供商或类型过滤
    if (this.state.selectedProvider === 'all') {
      // 显示所有，不过滤
    } else if (this.state.selectedProvider === 'regular') {
      filteredModels = filteredModels.filter(m => !m.isVirtual);
    } else if (this.state.selectedProvider === 'virtual') {
      filteredModels = filteredModels.filter(m => m.isVirtual);
    } else {
      // 按提供商过滤（只显示普通模型）
      filteredModels = filteredModels.filter(m => !m.isVirtual && m.provider === this.state.selectedProvider);
    }

    if (filteredModels.length === 0) {
      this.elements.modelsList.innerHTML = '<div class="empty-state">暂无模型</div>';
      return;
    }

    // 分组：虚拟模型单独一组，普通模型按提供商分组
    const virtualModels = filteredModels.filter(m => m.isVirtual);
    const regularModels = filteredModels.filter(m => !m.isVirtual);

    let html = '';

    // 虚拟模型组
    if (virtualModels.length > 0) {
      html += `
        <div class="model-group">
          <div class="model-group-header">
            <span class="provider-badge virtual-badge">
              🤖 虚拟模型
            </span>
          </div>
          <div class="model-group-items">
            ${virtualModels.map(model => this.renderModelItem(model)).join('')}
          </div>
        </div>
      `;
    }

    // 普通模型按提供商分组
    const grouped = {};
    regularModels.forEach(model => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });

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
    const isDefault = model.isDefault;
    const isEnabled = model.enabled;
    const isVirtual = model.isVirtual;

    let detailsHtml = '';
    if (isVirtual) {
      const flow = this.state.flows.find(f => f.id === model.flowId);
      detailsHtml = `
        <div class="model-details">
          <span class="model-provider">🤖 虚拟模型</span>
          <span class="model-model">${flow ? this.escapeHtml(flow.name) : '未知流程'}</span>
        </div>
      `;
    } else {
      const providerInfo = PROVIDERS[model.provider];
      detailsHtml = `
        <div class="model-details">
          <span class="model-provider">${providerInfo?.name || model.provider}</span>
          <span class="model-model">${this.escapeHtml(model.model)}</span>
        </div>
      `;
    }

    return `
      <div class="model-item ${isDefault ? 'default' : ''} ${!isEnabled ? 'disabled' : ''} ${isVirtual ? 'virtual' : ''}" data-id="${model.id}">
        <div class="model-info">
          <div class="model-name">
            ${isVirtual ? `<span class="model-icon">${model.icon || '🤖'}</span>` : ''}
            ${this.escapeHtml(model.name)}
            ${isVirtual ? '<span class="badge badge-virtual">虚拟</span>' : ''}
            ${isDefault ? '<span class="badge badge-default">默认</span>' : ''}
            ${!isEnabled ? '<span class="badge badge-disabled">已禁用</span>' : ''}
          </div>
          ${detailsHtml}
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

  async showVirtualModelModal() {
    // 加载流程列表
    const flowSelect = document.getElementById('virtualModelFlow');
    flowSelect.innerHTML = '<option value="">请选择流程...</option>' +
      this.state.flows.map(f =>
        `<option value="${f.id}">${this.escapeHtml(f.name)}</option>`
      ).join('');

    document.getElementById('virtualModelName').value = '';
    document.getElementById('virtualModelDescription').value = '';
    document.getElementById('virtualModelIcon').value = '🤖';

    document.getElementById('virtualModelModal').classList.add('active');
  }

  hideVirtualModelModal() {
    document.getElementById('virtualModelModal').classList.remove('active');
  }

  async saveVirtualModel() {
    const name = document.getElementById('virtualModelName').value.trim();
    const flowId = document.getElementById('virtualModelFlow').value;
    const description = document.getElementById('virtualModelDescription').value.trim();
    const icon = document.getElementById('virtualModelIcon').value.trim();

    if (!name) {
      alert('请输入虚拟模型名称');
      return;
    }

    if (!flowId) {
      alert('请选择流程');
      return;
    }

    try {
      await sendMessage({
        action: 'createVirtualModel',
        data: {
          name,
          flowId,
          description,
          icon
        }
      });

      await this.loadModels();
      this.render();
      this.hideVirtualModelModal();
    } catch (error) {
      alert('创建失败：' + error.message);
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
