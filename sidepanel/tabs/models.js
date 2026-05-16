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

    // 设计流程按钮
    const designFlowBtn = document.getElementById('designFlowBtn');
    if (designFlowBtn) {
      designFlowBtn.addEventListener('click', () => {
        const currentFlowId = document.getElementById('virtualModelFlow').value || null;
        
        const designer = new FlowDesigner({
          mode: 'virtual-model',
          flowId: currentFlowId,
          onSave: async (flowData) => {
            const result = await sendMessage({
              action: 'saveFlow',
              flow: flowData
            });
            
            if (result && result.id) {
              await this.loadFlows();
              document.getElementById('virtualModelFlow').value = result.id;
              return result.id;
            }
            return null;
          }
        });
        designer.open();
      });
    }

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
          document.getElementById('virtualModelFlow').value = model.flowId || '';
          document.getElementById('virtualModelDescription').value = model.description || '';
          document.getElementById('virtualModelIcon').value = model.icon || '🤖';
        } else {
          document.getElementById('modelProvider').value = model.provider || '';
          document.getElementById('modelModel').value = model.model || '';
          document.getElementById('modelName').value = model.name || '';
          document.getElementById('modelDescription').value = model.description || '';
        }
      }
    } else {
      title.textContent = '新建模型';
      confirmBtn.textContent = '创建';
      
      // 清空表单
      document.getElementById('virtualModelName').value = '';
      document.getElementById('virtualModelFlow').value = '';
      document.getElementById('virtualModelDescription').value = '';
      document.getElementById('virtualModelIcon').value = '🤖';
      
      document.getElementById('modelProvider').value = '';
      document.getElementById('modelModel').value = '';
      document.getElementById('modelName').value = '';
      document.getElementById('modelDescription').value = '';
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

    if (!provider || !model || !name) {
      alert('请填写必填字段');
      return;
    }

    const data = {
      provider,
      model,
      name,
      description
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
      icon
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
      
      return `
        <div class="model-item" data-id="${model.id}">
          <div class="model-header">
            <div class="model-icon ${isVirtual ? 'virtual' : ''}">
              ${isVirtual ? (model.icon || '🤖') : (model.name.charAt(0) || 'M')}
            </div>
            <div class="model-info">
              <h3>${this.escapeHtml(model.name)}</h3>
              <div class="model-meta">
                ${isVirtual 
                  ? `<span class="model-badge virtual">虚拟模型</span>`
                  : `<span class="model-badge">${this.escapeHtml(model.provider || '')}</span>`
                }
                ${model.description ? `<span class="model-desc">${this.escapeHtml(model.description)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="model-actions">
            <button class="btn-icon edit-btn" data-id="${model.id}" title="编辑">✏️</button>
            <button class="btn-icon delete-btn" data-id="${model.id}" title="删除">🗑️</button>
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
