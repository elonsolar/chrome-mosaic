// SVG 图标渲染器（替代 three.js 3D 渲染）
class ModelIconRenderer {
  constructor(container, providerKey) {
    this.container = container;
    this.providerKey = providerKey;
    this.render();
  }

  render() {
    const iconSvg = getModelIcon(this.providerKey);
    this.container.innerHTML = iconSvg;
    this.container.classList.add('model-icon-container');
  }

  dispose() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}


class ModelsTab {
  constructor() {
    this.state = {
      models: [],
      providers: {},
      editingModelId: null,
      currentProvider: 'all'
    };
    this.elements = {};
    this.renderers = [];
  }

  async init() {
    try {
      this.initElements();
      this.initMessageListener();
      this.bindEvents();
      await this.loadModels();
      this.initProviderSelect();
      this.render();
    } catch (e) {
      console.error('[ModelsTab] init failed:', e);
      if (this.elements.modelsList) {
        this.elements.modelsList.innerHTML = '<div class="empty-state-robot"><p>加载失败: ' + e.message + '</p></div>';
      }
    }
  }

  initElements() {
    this.elements = {
      modelsList: document.getElementById('modelsList'),
      newModelBtn: document.getElementById('newModelBtn'),
      modelModal: document.getElementById('modelModal'),
      providerTabs: document.getElementById('providerTabs')
    };
  }

  initMessageListener() {
    window.addEventListener('message', (e) => {
      const action = e.data?.action;
      if (action === 'createModel') {
        this.showModelModal();
      }
    });
  }

  bindEvents() {
    if (this.elements.newModelBtn) {
      this.elements.newModelBtn.addEventListener('click', () => {
        this.showModelModal();
      });
    }

    if (this.elements.providerTabs) {
      this.elements.providerTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.provider-tab');
        if (tab) {
          const provider = tab.dataset.provider;
          this.filterByProvider(provider);
        }
      });
    }

    const confirmModelBtn = document.getElementById('confirmModelBtn');
    if (confirmModelBtn) {
      confirmModelBtn.addEventListener('click', () => {
        this.saveModel();
      });
    }

    const cancelModelBtn = document.getElementById('cancelModelBtn');
    if (cancelModelBtn) {
      cancelModelBtn.addEventListener('click', () => {
        this.hideModelModal();
      });
    }

    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideModelModal();
      });
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideModelModal();
      }
    });

    const modelProvider = document.getElementById('modelProvider');
    if (modelProvider) {
      modelProvider.addEventListener('change', (e) => {
        const provider = PROVIDERS[e.target.value];
        if (provider && provider.defaultModel) {
          const modelModel = document.getElementById('modelModel');
          const modelName = document.getElementById('modelName');
          if (modelModel) modelModel.value = provider.defaultModel;
          if (modelName) modelName.value = provider.name;
        }
      });
    }

    document.querySelectorAll('input[name="accessMethod"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const apiFields = document.getElementById('apiConfigFields');
        if (apiFields) {
          apiFields.style.display = e.target.value === 'api' ? 'block' : 'none';
        }
      });
    });

    const toggleBtn = document.getElementById('toggleApiKeyBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const input = document.getElementById('modelApiKey');
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    }
  }

  async loadModels() {
    try {
      const models = await sendMessage({ action: 'getModels' });
      this.state.models = (models || []).filter(model => !model.isVirtual);
    } catch (error) {
      console.error('加载模型失败:', error);
      this.state.models = [];
    }
  }

  initProviderSelect() {
    const providerSelect = document.getElementById('modelProvider');
    if (providerSelect && PROVIDERS) {
      providerSelect.innerHTML = '<option value="">请选择提供商...</option>';
      Object.values(PROVIDERS).forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        providerSelect.appendChild(option);
      });
    }
  }

  getProviderTheme(provider) {
    const themes = {
      deepseek:  { color: '#3B82F6', gradient: '#EFF6FF', glow: 'rgba(59, 130, 246, 0.15)' },
      kimi:      { color: '#6366F1', gradient: '#EEF2FF', glow: 'rgba(99, 102, 241, 0.15)' },
      qianwen:   { color: '#8B5CF6', gradient: '#F5F3FF', glow: 'rgba(139, 92, 246, 0.15)' },
      doubao:    { color: '#14B8A6', gradient: '#F0FDFA', glow: 'rgba(20, 184, 166, 0.15)' },
      openai:    { color: '#10B981', gradient: '#ECFDF5', glow: 'rgba(16, 185, 129, 0.15)' },
      anthropic: { color: '#D97706', gradient: '#FFFBEB', glow: 'rgba(217, 119, 6, 0.15)' },
      zhipu:     { color: '#2563EB', gradient: '#EFF6FF', glow: 'rgba(37, 99, 235, 0.15)' },
      _default:  { color: '#3B82F6', gradient: '#EFF6FF', glow: 'rgba(59, 130, 246, 0.15)' }
    };
    return themes[provider] || themes._default;
  }

  filterByProvider(provider) {
    this.state.currentProvider = provider;
    if (this.elements.providerTabs) {
      this.elements.providerTabs.querySelectorAll('.provider-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.provider === provider);
      });
    }
    this.render();
  }

  getFilteredModels() {
    if (this.state.currentProvider === 'all') {
      return this.state.models;
    }
    return this.state.models.filter(model => model.provider === this.state.currentProvider);
  }

  showModelModal(modelId = null) {
    this.state.editingModelId = modelId;
    const modal = this.elements.modelModal;
    const title = document.getElementById('modelModalTitle');
    const confirmBtn = document.getElementById('confirmModelBtn');
    if (!modal || !title || !confirmBtn) return;

    this.initProviderSelect();

    if (modelId) {
      title.textContent = '编辑模型';
      confirmBtn.textContent = '保存';
      const model = this.state.models.find(m => m.id === modelId);
      if (model) {
        document.getElementById('modelProvider').value = model.provider || '';
        document.getElementById('modelModel').value = model.model || '';
        document.getElementById('modelName').value = model.name || '';
        document.getElementById('modelDescription').value = model.description || '';
        document.getElementById('modelEnabled').checked = model.enabled || false;
        document.getElementById('modelThinking').checked = model.thinking || false;

        const accessMethod = model.accessMethod || 'web';
        document.querySelector('input[name="accessMethod"][value="' + accessMethod + '"]').checked = true;
        document.getElementById('apiConfigFields').style.display = accessMethod === 'api' ? 'block' : 'none';
        document.getElementById('modelBaseUrl').value = model.baseUrl || '';
        document.getElementById('modelApiKey').value = model.apiKey || '';
      }
    } else {
      title.textContent = '新建模型';
      confirmBtn.textContent = '创建';
      document.getElementById('modelProvider').value = '';
      document.getElementById('modelModel').value = '';
      document.getElementById('modelName').value = '';
      document.getElementById('modelDescription').value = '';
      document.getElementById('modelEnabled').checked = false;
      document.getElementById('modelThinking').checked = false;

      document.querySelector('input[name="accessMethod"][value="web"]').checked = true;
      document.getElementById('apiConfigFields').style.display = 'none';
      document.getElementById('modelBaseUrl').value = '';
      document.getElementById('modelApiKey').value = '';
    }
    modal.classList.add('active');
  }

  hideModelModal() {
    if (this.elements.modelModal) {
      this.elements.modelModal.classList.remove('active');
    }
    this.state.editingModelId = null;
  }

  async saveModel() {
    const provider = document.getElementById('modelProvider')?.value || '';
    const model = document.getElementById('modelModel')?.value?.trim() || '';
    const name = document.getElementById('modelName')?.value?.trim() || '';
    const description = document.getElementById('modelDescription')?.value?.trim() || '';
    const enabled = document.getElementById('modelEnabled')?.checked || false;
    const thinking = document.getElementById('modelThinking')?.checked || false;
    const accessMethod = document.querySelector('input[name="accessMethod"]:checked')?.value || 'web';
    const baseUrl = document.getElementById('modelBaseUrl')?.value?.trim() || '';
    const apiKey = document.getElementById('modelApiKey')?.value?.trim() || '';

    if (!provider || !model || !name) {
      alert('请填写必填字段');
      return;
    }

    if (accessMethod === 'api' && (!baseUrl || !apiKey)) {
      alert('API 模式需要填写 Base URL 和 API Key');
      return;
    }

    const data = { provider, model, name, description, enabled, thinking, accessMethod, baseUrl, apiKey };

    try {
      if (this.state.editingModelId) {
        data.id = this.state.editingModelId;
        await sendMessage({ action: 'updateModel', data });
      } else {
        await sendMessage({ action: 'createModel', data });
      }
      await this.loadModels();
      this.render();
      this.hideModelModal();
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  }

  _createRenderer(container, providerKey) {
    try {
      return new ModelIconRenderer(container, providerKey);
    } catch (e) {
      console.warn('Icon renderer failed:', e);
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:48px;opacity:0.4;">🤖</div>';
      return null;
    }
  }

  render() {
    if (!this.elements.modelsList) return;

    this.updateModelCount();
    this.disposeRenderers();
    const filteredModels = this.getFilteredModels();

    if (filteredModels.length === 0) {
      const message = this.state.currentProvider === 'all'
        ? '暂无模型，点击上方按钮创建新模型'
        : '此提供商暂无模型';
      this.elements.modelsList.innerHTML = `
        <div class="empty-state-robot">
          <div class="robot-3d-container" data-provider="_default" style="width:160px;height:160px;margin:0 auto;"></div>
          <p>${message}</p>
        </div>`;
      const emptyEl = this.elements.modelsList.querySelector('.robot-3d-container');
      if (emptyEl) {
        const r = this._createRenderer(emptyEl, '_default');
        if (r) this.renderers.push(r);
      }
      this.updateProviderCounts();
      return;
    }

    this.elements.modelsList.innerHTML = filteredModels.map(model => {
      const isEnabled = model.enabled !== false;
      const provider = PROVIDERS[model.provider] || {};
      const theme = this.getProviderTheme(model.provider);
      const description = model.description || '';
      const accessMethod = model.accessMethod || 'web';
      const accessLabel = accessMethod === 'api' ? 'API' : '网页';
      const apiUrlHtml = accessMethod === 'api' ? '<div class="model-card-api-info"><span class="api-url-label">' + this.escapeHtml(model.baseUrl || '') + '</span></div>' : '';

      return `
        <div class="model-card ${!isEnabled ? 'disabled' : ''}" data-id="${model.id}">
          <div class="model-robot-showcase" style="background: ${theme.gradient};">
            <div class="robot-3d-container" data-provider="${model.provider}"></div>
          </div>
          <div class="model-card-body">
            <h3 class="model-card-name">${this.escapeHtml(model.name)}</h3>
            <div class="model-card-tags">
              <span class="model-tag tag-provider">${provider.name || model.provider}</span>
              <span class="model-tag tag-access ${accessMethod}">${accessLabel}</span>
              ${model.thinking ? '<span class="model-tag tag-thinking">思考</span>' : ''}
              <span class="model-tag tag-status ${isEnabled ? 'enabled' : 'disabled'}">${isEnabled ? '已启用' : '已禁用'}</span>
            </div>
            ${description ? '<p class="model-card-desc">' + this.escapeHtml(description) + '</p>' : ''}
            ${apiUrlHtml}
            <div class="model-card-actions">
              <button class="btn-action toggle-btn" data-id="${model.id}" title="${isEnabled ? '禁用' : '启用'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${isEnabled
                    ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
                    : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'}
                </svg>
              </button>
              <button class="btn-action edit-btn" data-id="${model.id}" title="编辑">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-action delete-btn" data-id="${model.id}" title="删除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.elements.modelsList.querySelectorAll('.robot-3d-container').forEach(el => {
      const provider = el.dataset.provider || '_default';
      const r = this._createRenderer(el, provider);
      if (r) this.renderers.push(r);
    });

    this.bindModelEvents();
    this.updateProviderCounts();
  }

  bindModelEvents() {
    this.elements.modelsList.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => this.toggleModel(btn.dataset.id));
    });
    this.elements.modelsList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => this.editModel(btn.dataset.id));
    });
    this.elements.modelsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => this.deleteModel(btn.dataset.id));
    });
  }

  async toggleModel(id) {
    const model = this.state.models.find(m => m.id === id);
    if (!model) return;
    model.enabled = model.enabled === false ? true : false;
    try {
      await sendMessage({ action: 'updateModel', model });
      this.render();
    } catch (e) {
      console.error('切换模型状态失败:', e);
    }
  }

  editModel(id) {
    if (id) this.showModelModal(id);
  }

  async deleteModel(id) {
    if (!confirm('确定删除此模型？')) return;
    try {
      await sendMessage({ action: 'deleteModel', model: { id } });
      await this.loadModels();
      this.render();
    } catch (e) {
      console.error('删除模型失败:', e);
    }
  }

  updateModelCount() {
    const modelCountEl = document.getElementById('modelCount');
    if (modelCountEl) {
      modelCountEl.textContent = this.state.models.length;
    }
  }

  updateProviderCounts() {
    const counts = { all: 0 };
    (this.state.models || []).forEach(m => {
      if (m.enabled === false) return;
      counts.all++;
      counts[m.provider] = (counts[m.provider] || 0) + 1;
    });
    Object.keys(counts).forEach(key => {
      const el = document.getElementById(`${key}Count`);
      if (el) el.textContent = counts[key];
    });
  }

  disposeRenderers() {
    this.renderers.forEach(r => r.dispose());
    this.renderers = [];
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const modelsTab = new ModelsTab();
modelsTab.init();
