/**
 * 流程管理页面逻辑
 */
class FlowsTab {
  constructor() {
    this.state = {
      flows: [],
      virtualModels: [],
      editingFlowId: null,
      currentCategory: 'all'
    };

    this.elements = {};
  }

  async init() {
    this.initElements();
    this.initMessageListener();
    this.bindEvents();
    await this.loadData();
    this.render();
  }

  initElements() {
    this.elements = {
      flowsList: document.getElementById('flowsList'),
      newFlowBtn: document.getElementById('newFlowBtn'),
      flowModal: document.getElementById('flowModal'),
      virtualModelModal: document.getElementById('virtualModelModal'),
      categoryTabs: document.getElementById('categoryTabs'),
      flowNodesContainer: document.getElementById('flowNodesContainer')
    };
  }

  initMessageListener() {
    window.addEventListener('message', (e) => {
      const action = e.data?.action;
      if (action === 'createFlow') {
        this.openDesignerForNewFlow();
      }
    });

    // 从流程设计器返回时刷新列表
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.loadData().then(() => this.render());
      }
    });
  }

  bindEvents() {
    // 新建流程按钮 - 使用流程设计器
    if (this.elements.newFlowBtn) {
      this.elements.newFlowBtn.addEventListener('click', () => {
        this.openDesignerForNewFlow();
      });
    }

    // 分类标签筛选
    if (this.elements.categoryTabs) {
      this.elements.categoryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.category-tab');
        if (tab) {
          const category = tab.dataset.category;
          this.filterByCategory(category);
        }
      });
    }

    // 虚拟模型相关按钮
    const confirmVirtualModelBtn = document.getElementById('confirmVirtualModelBtn');
    if (confirmVirtualModelBtn) {
      confirmVirtualModelBtn.addEventListener('click', () => {
        this.saveVirtualModel();
      });
    }

    const cancelVirtualModelBtn = document.getElementById('cancelVirtualModelBtn');
    if (cancelVirtualModelBtn) {
      cancelVirtualModelBtn.addEventListener('click', () => {
        this.hideVirtualModelModal();
      });
    }

    // 关闭按钮
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideFlowModal();
        this.hideVirtualModelModal();
      });
    });

    // 点击外部关闭
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideFlowModal();
        this.hideVirtualModelModal();
      }
    });
  }

  async loadData() {
    try {
      const [flows, models] = await Promise.all([
        sendMessage({ action: 'getFlows' }),
        sendMessage({ action: 'getModels' })
      ]);

      this.state.flows = flows || [];
      this.state.virtualModels = (models || []).filter(model => model.isVirtual);
    } catch (error) {
      console.error('加载数据失败:', error);
      this.state.flows = [];
      this.state.virtualModels = [];
    }
  }

  filterByCategory(category) {
    this.state.currentCategory = category;

    // 更新标签激活状态
    if (this.elements.categoryTabs) {
      this.elements.categoryTabs.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
      });
    }

    this.render();
  }

  getFilteredFlows() {
    if (this.state.currentCategory === 'all') {
      return this.state.flows;
    }
    return this.state.flows.filter(flow => flow.category === this.state.currentCategory);
  }

  showFlowModal(flowId = null) {
    this.state.editingFlowId = flowId;

    const modal = this.elements.flowModal;
    const title = document.getElementById('flowModalTitle');
    const confirmBtn = document.getElementById('confirmFlowBtn');

    if (!modal || !title || !confirmBtn) return;

    // 清空节点容器
    if (this.elements.flowNodesContainer) {
      this.elements.flowNodesContainer.innerHTML = '';
    }

    if (flowId) {
      title.textContent = '编辑方案';
      confirmBtn.textContent = '保存';

      const flow = this.state.flows.find(f => f.id === flowId);
      if (flow) {
        document.getElementById('flowName').value = flow.name || '';
        document.getElementById('flowCategory').value = flow.category || 'simple';
        document.getElementById('flowDescription').value = flow.description || '';
        document.getElementById('flowIcon').value = flow.icon || '';

        // 恢复节点
        if (flow.nodes && flow.nodes.length > 0) {
          flow.nodes.forEach(node => {
            this.addNode(node);
          });
        } else {
          // 至少添加一个节点
          this.addNode();
        }
      }
    } else {
      title.textContent = '新建方案';
      confirmBtn.textContent = '创建';

      // 清空表单
      document.getElementById('flowName').value = '';
      document.getElementById('flowCategory').value = 'simple';
      document.getElementById('flowDescription').value = '';
      document.getElementById('flowIcon').value = '';

      // 添加一个默认节点
      this.addNode();
    }

    modal.classList.add('active');
  }

  hideFlowModal() {
    if (this.elements.flowModal) {
      this.elements.flowModal.classList.remove('active');
    }
    this.state.editingFlowId = null;
  }

  openDesignerForNewFlow() {
    this.openDesignerModal();
  }

  openDesignerForEdit(flowId) {
    this.openDesignerModal(flowId);
  }

  openDesignerModal(flowId = null) {
    const modal = document.getElementById('flowDesignerModal');
    const iframe = document.getElementById('flowDesignerIframe');
    if (!modal || !iframe) return;

    const params = flowId ? `?flowId=${flowId}` : '';
    iframe.src = chrome.runtime.getURL(`flow-designer/flow-designer.html${params}`);

    modal.classList.add('active');

    // 监听来自 iframe 的消息
    const messageHandler = (e) => {
      if (e.data?.action === 'flowSaved') {
        this.loadData().then(() => this.render());
      } else if (e.data?.action === 'closeFlowDesigner') {
        this.closeDesignerModal(modal);
      }
    };
    window.addEventListener('message', messageHandler);

    // 点击模态框外部关闭
    const closeHandler = (e) => {
      if (e.target === modal) {
        this.closeDesignerModal(modal);
      }
    };
    modal.addEventListener('click', closeHandler);

    // ESC 键关闭
    const escHandler = (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        this.closeDesignerModal(modal);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 存储清理函数
    modal._cleanup = () => {
      window.removeEventListener('message', messageHandler);
      modal.removeEventListener('click', closeHandler);
      document.removeEventListener('keydown', escHandler);
    };
  }

  closeDesignerModal(modal) {
    if (!modal || !modal.classList.contains('active')) return;
    modal.classList.remove('active');
    const iframe = document.getElementById('flowDesignerIframe');
    if (iframe) iframe.src = 'about:blank';
    if (modal._cleanup) modal._cleanup();
    this.loadData().then(() => this.render());
  }

  addNode(nodeData = null) {
    if (!this.elements.flowNodesContainer) return;

    const nodeIndex = this.elements.flowNodesContainer.children.length;
    const nodeElement = document.createElement('div');
    nodeElement.className = 'flow-node';
    nodeElement.dataset.index = nodeIndex;

    nodeElement.innerHTML = `
      <div class="node-header">
        <span class="node-number">${nodeIndex + 1}</span>
        <input type="text" class="form-input node-name" placeholder="节点名称" value="${nodeData?.name || ''}">
        <button type="button" class="btn-icon remove-node-btn" title="删除节点">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>
      <div class="node-body">
        <select class="form-select node-type">
          <option value="prompt" ${nodeData?.type === 'prompt' ? 'selected' : ''}>提示词</option>
          <option value="model" ${nodeData?.type === 'model' ? 'selected' : ''}>模型调用</option>
          <option value="condition" ${nodeData?.type === 'condition' ? 'selected' : ''}>条件判断</option>
        </select>
        <textarea class="form-textarea node-config" rows="2" placeholder="节点配置（JSON格式）">${nodeData?.config || ''}</textarea>
      </div>
    `;

    // 绑定删除节点事件
    const removeBtn = nodeElement.querySelector('.remove-node-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (confirm('确定删除此节点吗？')) {
          nodeElement.remove();
          this.updateNodeNumbers();
        }
      });
    }

    this.elements.flowNodesContainer.appendChild(nodeElement);
  }

  updateNodeNumbers() {
    if (!this.elements.flowNodesContainer) return;

    const nodes = this.elements.flowNodesContainer.querySelectorAll('.flow-node');
    nodes.forEach((node, index) => {
      const numberSpan = node.querySelector('.node-number');
      if (numberSpan) {
        numberSpan.textContent = index + 1;
      }
      node.dataset.index = index;
    });
  }

  async saveFlow() {
    const name = document.getElementById('flowName')?.value?.trim() || '';
    const category = document.getElementById('flowCategory')?.value || 'simple';
    const description = document.getElementById('flowDescription')?.value?.trim() || '';
    const icon = document.getElementById('flowIcon')?.value?.trim() || '';

    if (!name) {
      alert('请输入流程名称');
      return;
    }

    // 收集节点数据
    const nodes = [];
    const nodeElements = this.elements.flowNodesContainer?.querySelectorAll('.flow-node') || [];
    nodeElements.forEach((nodeEl, index) => {
      const nodeName = nodeEl.querySelector('.node-name')?.value?.trim() || `节点${index + 1}`;
      const nodeType = nodeEl.querySelector('.node-type')?.value || 'prompt';
      const nodeConfig = nodeEl.querySelector('.node-config')?.value?.trim() || '{}';

      try {
        nodes.push({
          name: nodeName,
          type: nodeType,
          config: nodeConfig
        });
      } catch (error) {
        console.error('节点配置解析失败:', error);
      }
    });

    const data = {
      name,
      category,
      description,
      icon,
      nodes
    };

    try {
      if (this.state.editingFlowId) {
        data.id = this.state.editingFlowId;
        await sendMessage({ action: 'updateFlow', data });
      } else {
        await sendMessage({ action: 'createFlow', data });
      }

      await this.loadData();
      this.render();
      this.hideFlowModal();
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  }

  showVirtualModelModal() {
    const modal = this.elements.virtualModelModal;
    if (!modal) return;

    // 清空表单
    document.getElementById('virtualModelName').value = '';
    document.getElementById('virtualModelFlow').value = '';
    document.getElementById('virtualModelDescription').value = '';
    document.getElementById('virtualModelIcon').value = '🤖';
    document.getElementById('virtualModelEnabled').checked = false;

    // 加载流程列表
    this.loadFlowsToSelect();

    modal.classList.add('active');
  }

  hideVirtualModelModal() {
    if (this.elements.virtualModelModal) {
      this.elements.virtualModelModal.classList.remove('active');
    }
  }

  loadFlowsToSelect() {
    const flowSelect = document.getElementById('virtualModelFlow');
    if (flowSelect) {
      if (this.state.flows.length === 0) {
        flowSelect.innerHTML = '<option value="">暂无可用流程</option>';
      } else {
        flowSelect.innerHTML = '<option value="">请选择流程...</option>' +
          this.state.flows.map(f =>
            `<option value="${f.id}">${this.escapeHtml(f.icon + ' ' + f.name)}</option>`
          ).join('');
      }
    }
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
      if (this.state.flows.length === 0) {
        alert('暂无可用流程，请先创建流程。');
      } else {
        alert('请选择流程');
      }
      return;
    }

    const data = {
      name,
      flowId,
      description,
      icon,
      enabled
    };

    try {
      await sendMessage({ action: 'createVirtualModel', data });
      await this.loadData();
      this.render();
      this.hideVirtualModelModal();
    } catch (error) {
      alert('创建失败: ' + error.message);
    }
  }

  render() {
    if (!this.elements.flowsList) return;

    const filteredFlows = this.getFilteredFlows();

    if (filteredFlows.length === 0) {
      const message = this.state.currentCategory === 'all'
        ? '暂无流程，点击上方按钮创建新流程'
        : '此分类暂无流程';
      this.elements.flowsList.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
      this.updateCategoryCounts();
      return;
    }

    this.elements.flowsList.innerHTML = filteredFlows.map(flow => {
      const nodeCount = flow.nodes?.length || 0;
      const description = flow.description || '暂无描述';

      return `
        <div class="flow-item" data-id="${flow.id}">
          <div class="flow-icon">${flow.icon || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>'}</div>
          <div class="flow-info">
            <h3 class="flow-name">${this.escapeHtml(flow.name)}</h3>
            <div class="flow-details">
              <span class="flow-nodes">${nodeCount} 个节点</span>
              ${description ? `<span class="flow-desc">${this.escapeHtml(description)}</span>` : ''}
            </div>
          </div>
          <div class="flow-actions">
            <button class="btn-action create-virtual-btn" data-id="${flow.id}" title="创建虚拟模型">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </button>
            <button class="btn-action design-btn" data-id="${flow.id}" title="设计流程">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
            <button class="btn-action edit-btn" data-id="${flow.id}" title="编辑">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-action delete-btn" data-id="${flow.id}" title="删除">
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

    // 绑定事件
    this.bindFlowEvents();
    this.updateCategoryCounts();
  }

  bindFlowEvents() {
    // 绑定编辑按钮事件 - 使用流程设计器
    this.elements.flowsList.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDesignerForEdit(btn.dataset.id);
      });
    });

    // 绑定删除按钮事件
    this.elements.flowsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteFlow(btn.dataset.id);
      });
    });

    // 绑定创建虚拟模型按钮事件
    this.elements.flowsList.querySelectorAll('.create-virtual-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const flowId = btn.dataset.id;
        // 预选择流程
        document.getElementById('virtualModelFlow').value = flowId;
        this.showVirtualModelModal();
      });
    });

    // 绑定设计流程按钮事件
    this.elements.flowsList.querySelectorAll('.design-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFlowDesigner(btn.dataset.id);
      });
    });
  }

  updateCategoryCounts() {
    const counts = {
      all: this.state.flows.length,
      simple: 0,
      complex: 0,
      ai: 0
    };

    this.state.flows.forEach(flow => {
      if (counts.hasOwnProperty(flow.category)) {
        counts[flow.category]++;
      }
    });

    // 更新显示
    Object.keys(counts).forEach(category => {
      const countEl = document.getElementById(`${category}Count`);
      if (countEl) {
        countEl.textContent = counts[category];
      }
    });
  }

  async deleteFlow(flowId) {
    if (!confirm('确定删除此流程吗？')) return;

    try {
      await sendMessage({
        action: 'deleteFlow',
        flowId: flowId
      });

      await this.loadData();
      this.render();
    } catch (error) {
      alert('删除失败: ' + error.message);
    }
  }

  openFlowDesigner(flowId) {
    this.openDesignerForEdit(flowId);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
const flowsTab = new FlowsTab();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => flowsTab.init());
} else {
  flowsTab.init();
}