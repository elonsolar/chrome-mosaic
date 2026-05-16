/**
 * 流程设计器 - 可复用组件
 * 用于设计虚拟模型流程或会话流程
 */
class FlowDesigner {
  constructor(options = {}) {
    this.mode = options.mode || 'virtual-model'; // 'virtual-model' | 'conversation'
    this.flowId = options.flowId || null;
    this.onSave = options.onSave || null;
    this.onClose = options.onClose || null;
    
    // 会话模式的额外参数
    this.availableModels = options.availableModels || [];
    this.availablePrompts = options.availablePrompts || [];
    
    this.state = {
      nodes: [],
      connections: [],
      lines: []
    };
    
    this.elements = {};
    this.dragState = {
      isDragging: false,
      nodeId: null,
      startX: 0,
      startY: 0
    };
  }

  /**
   * 打开流程设计器
   */
  async open() {
    // 创建模态框
    this.createModal();
    
    // 初始化
    await this.init();
    
    // 如果有flowId，加载已有流程
    if (this.flowId) {
      await this.loadFlow(this.flowId);
    }
  }

  /**
   * 关闭流程设计器
   */
  close() {
    if (this.elements.modal) {
      this.elements.modal.remove();
      this.clearLines();
    }
    
    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * 创建模态框
   */
  createModal() {
    const modal = document.createElement('div');
    modal.className = 'modal flow-designer-modal active';
    modal.innerHTML = this.getModalHTML();
    document.body.appendChild(modal);
    
    this.elements.modal = modal;
    this.initElements();
    this.bindModalEvents();
  }

  /**
   * 获取模态框HTML
   */
  getModalHTML() {
    const title = this.mode === 'virtual-model' ? '设计虚拟模型流程' : '设计会话执行流程';
    
    return `
      <div class="modal-content modal-fullscreen">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="close-btn" id="closeFlowDesigner">&times;</button>
        </div>
        <div class="modal-body no-padding">
          <div class="flow-designer-container">
            <div class="flow-designer-toolbar">
              <button class="btn btn-secondary" id="addNodeBtn">+ 添加节点</button>
              <button class="btn btn-primary" id="saveFlowBtn">💾 保存</button>
              <button class="btn btn-secondary" id="cancelFlowBtn">✕ 取消</button>
            </div>
            <div class="flow-designer-canvas-container">
              <div class="flow-designer-canvas" id="flowDesignerCanvas">
                <div class="empty-state">
                  <p>暂无节点</p>
                  <p class="hint">点击"添加节点"开始设计流程</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 添加节点对话框 -->
      <div class="modal" id="addNodeModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>添加节点</h2>
            <button class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="nodeModel">使用模型</label>
              <select id="nodeModel">
                <option value="">选择模型...</option>
              </select>
            </div>
            ${this.mode === 'conversation' ? `
            <div class="form-group">
              <label for="nodePrompt">使用提示词（普通模型需要）</label>
              <select id="nodePrompt">
                <option value="">不使用提示词</option>
              </select>
              <small class="help-text">虚拟模型自带提示词，不需要选择</small>
            </div>
            ` : ''}
            <div class="form-group">
              <label for="nodeName">节点名称</label>
              <input type="text" id="nodeName" placeholder="例如：分析专家">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelAddNodeBtn">取消</button>
            <button class="btn btn-primary" id="confirmAddNodeBtn">添加</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初始化DOM元素引用
   */
  initElements() {
    this.elements.canvas = document.getElementById('flowDesignerCanvas');
    this.elements.addNodeModal = document.getElementById('addNodeModal');
  }

  /**
   * 绑定模态框事件
   */
  bindModalEvents() {
    // 关闭按钮
    const closeBtn = document.getElementById('closeFlowDesigner');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 添加节点
    const addNodeBtn = document.getElementById('addNodeBtn');
    if (addNodeBtn) {
      addNodeBtn.addEventListener('click', () => this.showAddNodeModal());
    }

    // 保存
    const saveFlowBtn = document.getElementById('saveFlowBtn');
    if (saveFlowBtn) {
      saveFlowBtn.addEventListener('click', () => this.saveFlow());
    }

    // 取消
    const cancelFlowBtn = document.getElementById('cancelFlowBtn');
    if (cancelFlowBtn) {
      cancelFlowBtn.addEventListener('click', () => this.close());
    }

    // 添加节点对话框事件
    this.bindAddNodeModalEvents();

    // 关闭所有模态框
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal && modal.id === 'addNodeModal') {
          this.hideAddNodeModal();
        }
      });
    });

    // 点击外部关闭
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal') && e.target.id === 'addNodeModal') {
        this.hideAddNodeModal();
      }
    });
  }

  /**
   * 绑定添加节点对话框事件
   */
  bindAddNodeModalEvents() {
    const confirmBtn = document.getElementById('confirmAddNodeBtn');
    const cancelBtn = document.getElementById('cancelAddNodeBtn');
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.addNode());
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideAddNodeModal());
    }

    // 模型选择时自动填充节点名称
    const nodeModel = document.getElementById('nodeModel');
    if (nodeModel) {
      nodeModel.addEventListener('change', (e) => {
        const nodeName = document.getElementById('nodeName');
        if (nodeName && e.target.value) {
          const model = this.availableModels.find(m => m.id === e.target.value);
          if (model) {
            nodeName.value = model.name;
          }
        }
      });
    }
  }

  /**
   * 初始化
   */
  async init() {
    // 加载可用模型
    await this.loadAvailableModels();
    
    // 加载可用提示词（会话模式）
    if (this.mode === 'conversation') {
      await this.loadAvailablePrompts();
    }
  }

  /**
   * 加载可用模型
   */
  async loadAvailableModels() {
    const models = await sendMessage({ action: 'getModels' });
    this.availableModels = models || [];
    
    const select = document.getElementById('nodeModel');
    if (select) {
      select.innerHTML = '<option value="">选择模型...</option>';
      this.availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        select.appendChild(option);
      });
    }
  }

  /**
   * 加载可用提示词
   */
  async loadAvailablePrompts() {
    const prompts = await sendMessage({ action: 'getPrompts' });
    this.availablePrompts = prompts || [];
    
    const select = document.getElementById('nodePrompt');
    if (select) {
      select.innerHTML = '<option value="">不使用提示词</option>';
      this.availablePrompts.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.name;
        select.appendChild(option);
      });
    }
  }

  /**
   * 显示添加节点对话框
   */
  showAddNodeModal() {
    if (this.elements.addNodeModal) {
      this.elements.addNodeModal.classList.add('active');
      
      // 清空表单
      document.getElementById('nodeModel').value = '';
      document.getElementById('nodeName').value = '';
      const promptSelect = document.getElementById('nodePrompt');
      if (promptSelect) {
        promptSelect.value = '';
      }
    }
  }

  /**
   * 隐藏添加节点对话框
   */
  hideAddNodeModal() {
    if (this.elements.addNodeModal) {
      this.elements.addNodeModal.classList.remove('active');
    }
  }

  /**
   * 添加节点
   */
  addNode() {
    const modelId = document.getElementById('nodeModel').value;
    const name = document.getElementById('nodeName').value;
    const promptId = document.getElementById('nodePrompt')?.value || null;

    if (!modelId) {
      alert('请选择模型');
      return;
    }

    const model = this.availableModels.find(m => m.id === modelId);
    if (!model) {
      alert('模型不存在');
      return;
    }

    const node = {
      id: 'node-' + Date.now(),
      modelId: modelId,
      modelName: model.name,
      name: name || model.name,
      promptId: promptId,
      x: 100 + this.state.nodes.length * 50,
      y: 100 + this.state.nodes.length * 50
    };

    this.state.nodes.push(node);
    this.renderNodes();
    this.hideAddNodeModal();
  }

  /**
   * 渲染所有节点
   */
  renderNodes() {
    if (!this.elements.canvas) return;

    if (this.state.nodes.length === 0) {
      this.elements.canvas.innerHTML = `
        <div class="empty-state">
          <p>暂无节点</p>
          <p class="hint">点击"添加节点"开始设计流程</p>
        </div>
      `;
      return;
    }

    this.elements.canvas.innerHTML = '';
    
    this.state.nodes.forEach(node => {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'flow-node';
      nodeEl.dataset.nodeId = node.id;
      nodeEl.style.left = node.x + 'px';
      nodeEl.style.top = node.y + 'px';
      
      const isVirtual = this.availableModels.find(m => m.id === node.modelId)?.isVirtual;
      
      nodeEl.innerHTML = `
        <div class="node-header ${isVirtual ? 'virtual' : ''}">
          <span class="node-icon">${isVirtual ? '🤖' : '🔷'}</span>
          <span class="node-title">${this.escapeHtml(node.name)}</span>
          <button class="node-delete-btn" data-node-id="${node.id}">×</button>
        </div>
        <div class="node-body">
          <div class="node-info">模型：${this.escapeHtml(node.modelName)}</div>
          ${node.promptId ? `<div class="node-info">提示词：已选择</div>` : ''}
        </div>
        <div class="node-port node-port-in" data-port="in"></div>
        <div class="node-port node-port-out" data-port="out"></div>
      `;

      // 拖拽功能
      const header = nodeEl.querySelector('.node-header');
      header.addEventListener('mousedown', (e) => this.startDrag(e, node.id));

      // 删除按钮
      const deleteBtn = nodeEl.querySelector('.node-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteNode(node.id);
      });

      this.elements.canvas.appendChild(nodeEl);
    });

    // 渲染连接线
    this.renderConnections();
  }

  /**
   * 开始拖拽
   */
  startDrag(e, nodeId) {
    if (e.target.classList.contains('node-delete-btn')) return;
    
    this.dragState.isDragging = true;
    this.dragState.nodeId = nodeId;
    this.dragState.startX = e.clientX - this.state.nodes.find(n => n.id === nodeId).x;
    this.dragState.startY = e.clientY - this.state.nodes.find(n => n.id === nodeId).y;

    document.addEventListener('mousemove', this.drag);
    document.addEventListener('mouseup', this.stopDrag);
  }

  /**
   * 拖拽中
   */
  drag = (e) => {
    if (!this.dragState.isDragging) return;

    const node = this.state.nodes.find(n => n.id === this.dragState.nodeId);
    if (node) {
      node.x = e.clientX - this.dragState.startX;
      node.y = e.clientY - this.dragState.startY;

      const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
      if (nodeEl) {
        nodeEl.style.left = node.x + 'px';
        nodeEl.style.top = node.y + 'px';
      }

      this.renderConnections();
    }
  }

  /**
   * 停止拖拽
   */
  stopDrag = () => {
    this.dragState.isDragging = false;
    this.dragState.nodeId = null;
    document.removeEventListener('mousemove', this.drag);
    document.removeEventListener('mouseup', this.stopDrag);
  }

  /**
   * 删除节点
   */
  deleteNode(nodeId) {
    if (!confirm('确定删除此节点吗？')) return;

    this.state.nodes = this.state.nodes.filter(n => n.id !== nodeId);
    this.state.connections = this.state.connections.filter(
      c => c.from !== nodeId && c.to !== nodeId
    );
    
    this.renderNodes();
  }

  /**
   * 渲染连接线
   */
  renderConnections() {
    this.clearLines();

    this.state.connections.forEach(conn => {
      const fromEl = document.querySelector(`[data-node-id="${conn.from}"] .node-port-out`);
      const toEl = document.querySelector(`[data-node-id="${conn.to}"] .node-port-in`);

      if (fromEl && toEl && window.LeaderLine) {
        const line = new LeaderLine(fromEl, toEl, {
          color: '#8b5cf6',
          width: 2,
          path: 'grid',
          startSocket: 'right',
          endSocket: 'left'
        });

        this.state.lines.push(line);
      }
    });
  }

  /**
   * 清除所有连接线
   */
  clearLines() {
    this.state.lines.forEach(line => {
      if (line && line.remove) {
        line.remove();
      }
    });
    this.state.lines = [];
  }

  /**
   * 加载已有流程
   */
  async loadFlow(flowId) {
    const flow = await sendMessage({ 
      action: 'getFlow', 
      flowId: flowId 
    });

    if (flow) {
      this.state.nodes = flow.nodes || [];
      this.state.connections = flow.connections || [];
      this.renderNodes();
    }
  }

  /**
   * 保存流程
   */
  async saveFlow() {
    if (this.state.nodes.length === 0) {
      alert('请至少添加一个节点');
      return;
    }

    // 自动推断连接顺序（如果用户没有手动连接）
    if (this.state.connections.length === 0 && this.state.nodes.length > 1) {
      for (let i = 0; i < this.state.nodes.length - 1; i++) {
        this.state.connections.push({
          from: this.state.nodes[i].id,
          to: this.state.nodes[i + 1].id
        });
      }
    }

    const flowData = {
      nodes: this.state.nodes,
      connections: this.state.connections,
      mode: this.mode
    };

    // 调用保存回调
    if (this.onSave) {
      const savedFlowId = await this.onSave(flowData);
      if (savedFlowId) {
        this.flowId = savedFlowId;
        this.close();
        alert('流程已保存');
      }
    } else {
      // 默认保存逻辑
      const result = await sendMessage({
        action: 'saveFlow',
        flow: flowData
      });
      
      if (result && result.id) {
        this.flowId = result.id;
        this.close();
        alert('流程已保存');
      }
    }
  }

  /**
   * 转义HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 导出到全局
window.FlowDesigner = FlowDesigner;
