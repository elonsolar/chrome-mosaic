/**
 * 模型管理页面逻辑 - 简化版
 */
class ModelsTab {
  constructor() {
    this.state = {
      models: [],
      flows: [],
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
      newModelBtn: document.getElementById('newModelBtn'),
      modelModal: document.getElementById('modelModal'),
      regularModelForm: document.getElementById('regularModelForm'),
      virtualModelForm: document.getElementById('virtualModelForm')
    };
  }

  bindEvents() {
    // 新建模型
    if (this.elements.newModelBtn) {
      this.elements.newModelBtn.addEventListener('click', () => {
        this.showModelModal();
      });
    }

    // 模型类型选择
    document.querySelectorAll('input[name="modelType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.toggleModelForm(e.target.value);
      });
    });



    // 确认按钮
    const confirmModelBtn = document.getElementById('confirmModelBtn');
    if (confirmModelBtn) {
      confirmModelBtn.addEventListener('click', () => {
        this.saveModel();
      });
    }

    // 取消按钮
    const cancelModelBtn = document.getElementById('cancelModelBtn');
    if (cancelModelBtn) {
      cancelModelBtn.addEventListener('click', () => {
        this.hideModelModal();
      });
    }

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
      this.state.models = [];
      this.state.flows = [];
    }
  }

  async loadFlows() {
    try {
      const flows = await sendMessage({ action: 'getFlows' });
      this.state.flows = flows || [];
    } catch (error) {
      console.error('加载流程失败:', error);
      this.state.flows = [];
    }
  }

  toggleModelForm(type) {
    if (!this.elements.regularModelForm || !this.elements.virtualModelForm) return;

    if (type === 'virtual') {
      this.elements.regularModelForm.classList.remove('active');
      this.elements.virtualModelForm.classList.add('active');
      
      // 加载流程列表
      this.loadFlowsToSelect();
    } else {
      this.elements.regularModelForm.classList.add('active');
      this.elements.virtualModelForm.classList.remove('active');
      
      // 初始化提供商列表
      this.initProviderSelect();
    }
  }

  initProviderSelect() {
    const providerSelect = document.getElementById('modelProvider');
    if (providerSelect && PROVIDERS) {
      providerSelect.innerHTML = '';
      Object.values(PROVIDERS).forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        providerSelect.appendChild(option);
      });
    }
  }

  loadFlowsToSelect() {
    const flowSelect = document.getElementById('virtualModelFlow');
    if (flowSelect) {
      flowSelect.innerHTML = '<option value="">选择已有流程...</option>' +
        this.state.flows.map(f =>
          `<option value="${f.id}">${this.escapeHtml(f.name)}</option>`
        ).join('');
    }
  }

  showModelModal(modelId = null) {
    this.state.editingModelId = modelId;
    
    const modal = this.elements.modelModal;
    const title = document.getElementById('modelModalTitle');
    const confirmBtn = document.getElementById('confirmModelBtn');
    
    if (!modal || !title || !confirmBtn) return;

    // 重置表单
    document.querySelectorAll('input[name="modelType"]').forEach(radio => {
      radio.checked = radio.value === 'regular';
    });
    this.toggleModelForm('regular');
    
    if (modelId) {
      title.textContent = '编辑模型';
      confirmBtn.textContent = '保存';
      
      const model = this.state.models.find(m => m.id === modelId);
      if (model) {
        const typeRadio = document.querySelector(`input[name="modelType"][value="${model.isVirtual ? 'virtual' : 'regular'}"]`);
        if (typeRadio) typeRadio.checked = true;
        
        this.toggleModelForm(model.isVirtual ? 'virtual' : 'regular');
        
        if (model.isVirtual) {
          document.getElementById('virtualModelName').value = model.name || '';
          document.getElementById('virtualModelDescription').value = model.description || '';
          document.getElementById('virtualModelIcon').value = model.icon || '🤖';
          document.getElementById('virtualModelEnabled').checked = model.enabled || false;
        } else {
          document.getElementById('modelProvider').value = model.provider || '';
          document.getElementById('modelModel').value = model.model || '';
          document.getElementById('modelName').value = model.name || '';
          document.getElementById('modelDescription').value = model.description || '';
          document.getElementById('modelEnabled').checked = model.enabled || false;
          document.getElementById('modelThinking').checked = model.thinking || false;
        }
      }
    } else {
      title.textContent = '新建模型';
      confirmBtn.textContent = '创建';
      
      // 清空表单
      document.getElementById('virtualModelName').value = '';
      document.getElementById('virtualModelDescription').value = '';
      document.getElementById('virtualModelIcon').value = '🤖';
      document.getElementById('virtualModelEnabled').checked = false;
      
      document.getElementById('modelProvider').value = '';
      document.getElementById('modelModel').value = '';
      document.getElementById('modelName').value = '';
      document.getElementById('modelDescription').value = '';
      document.getElementById('modelEnabled').checked = false;
      document.getElementById('modelThinking').checked = false;
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
    const modelType = document.querySelector('input[name="modelType"]:checked')?.value || 'regular';
    
    try {
      if (modelType === 'virtual') {
        await this.saveVirtualModel();
      } else {
        await this.saveRegularModel();
      }
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  }

  async saveRegularModel() {
    const provider = document.getElementById('modelProvider')?.value || '';
    const model = document.getElementById('modelModel')?.value?.trim() || '';
    const name = document.getElementById('modelName')?.value?.trim() || '';
    const description = document.getElementById('modelDescription')?.value?.trim() || '';
    const enabled = document.getElementById('modelEnabled')?.checked || false;
    const thinking = document.getElementById('modelThinking')?.checked || false;

    if (!provider || !model || !name) {
      alert('请填写必填字段');
      return;
    }

    const data = {
      provider,
      model,
      name,
      description,
      enabled,
      thinking
    };

    if (this.state.editingModelId) {
      data.id = this.state.editingModelId;
      await sendMessage({ action: 'updateModel', data });
    } else {
      await sendMessage({ action: 'createModel', data });
    }

    await this.loadModels();
    this.render();
    this.hideModelModal();
  }

  async saveVirtualModel() {
    const name = document.getElementById('virtualModelName')?.value?.trim() || '';
    const flowId = document.getElementById('virtualModelFlow')?.value || '';
    const description = document.getElementById('virtualModelDescription')?.value?.trim() || '';
    const icon = document.getElementById('virtualModelIcon')?.value?.trim() || '🤖';
    const enabled = document.getElementById('virtualModelEnabled')?.checked || false;

    if (!name) {
      alert('请输入虚拟模型名称');
      return;
    }

    if (!flowId) {
      alert('请选择流程');
      return;
    }

    const data = {
      name,
      flowId,
      description,
      icon,
      enabled
    };

    if (this.state.editingModelId) {
      data.id = this.state.editingModelId;
      await sendMessage({ action: 'updateModel', data });
    } else {
      await sendMessage({ action: 'createVirtualModel', data });
    }

    await this.loadModels();
    this.render();
    this.hideModelModal();
  }

  render() {
    if (!this.elements.modelsList) return;

    if (this.state.models.length === 0) {
      this.elements.modelsList.innerHTML = '<div class="empty-state">暂无模型</div>';
      return;
    }

    this.elements.modelsList.innerHTML = this.state.models.map(model => {
      const isVirtual = model.isVirtual;
      const isEnabled = model.enabled !== false;
      
      return `
        <div class="model-item ${!isEnabled ? 'disabled' : ''}" data-id="${model.id}">
          <div class="model-info">
            <h3 class="model-name">${this.escapeHtml(model.name)}</h3>
            <span class="model-type ${isVirtual ? 'virtual' : 'regular'}">
              ${isVirtual ? '虚拟' : '基础'}
            </span>
          </div>
          <div class="model-status ${isEnabled ? 'enabled' : 'disabled'}">
            ${isEnabled ? '已启用' : '已禁用'}
          </div>
          <div class="model-actions">
            ${isVirtual ? `<button class="btn-action design-btn" data-id="${model.id}" title="设计流程">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </button>` : ''}
            <button class="btn-action toggle-btn" data-id="${model.id}" title="${isEnabled ? '禁用' : '启用'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isEnabled 
                  ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
                  : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
                }
              </svg>
            </button>
            <button class="btn-action edit-btn" data-id="${model.id}" title="编辑">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-action delete-btn" data-id="${model.id}" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定编辑和删除事件
    this.elements.modelsList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showModelModal(btn.dataset.id);
      });
    });

    this.elements.modelsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteModel(btn.dataset.id);
      });
    });

    // 绑定设计流程按钮事件
    this.elements.modelsList.querySelectorAll('.design-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFlowDesigner(btn.dataset.id);
      });
    });

    // 绑定启用/禁用按钮事件
    this.elements.modelsList.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleModelEnabled(btn.dataset.id);
      });
    });
  }

  async toggleModelEnabled(modelId) {
    try {
      await sendMessage({
        action: 'toggleModelEnabled',
        modelId: modelId
      });
      await this.loadModels();
      this.render();
    } catch (error) {
      console.error('切换模型状态失败:', error);
      alert('切换模型状态失败: ' + error.message);
    }
  }

  async openFlowDesigner(modelId) {
    try {
      await sendMessage({
        action: 'openFlowDesigner',
        modelId: modelId
      });
    } catch (error) {
      console.error('打开流程设计器失败:', error);
      alert('打开流程设计器失败: ' + error.message);
    }
  }

  async deleteModel(modelId) {
    if (!confirm('确定删除此模型吗？')) return;

    try {
      await sendMessage({
        action: 'deleteModel',
        modelId: modelId
      });

      await this.loadModels();
      this.render();
    } catch (error) {
      alert('删除失败: ' + error.message);
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => modelsTab.init());
} else {
  modelsTab.init();
}
