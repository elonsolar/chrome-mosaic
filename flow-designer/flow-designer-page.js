/**
 * 流程设计器页面 - 独立全屏页面
 */
class FlowDesignerPage {
  constructor() {
    this.flowId = null;
    this.flowData = null;
    this.nodes = [];
    this.connections = [];
    this.lines = [];
    
    this.dragState = {
      isDragging: false,
      isConnecting: false,
      connectingFrom: null,
      nodeId: null,
      startX: 0,
      startY: 0,
      startPort: null,
      tempLine: null
    };
    
    this.elements = {};
  }

  async init() {
    // 获取URL参数
    const urlParams = new URLSearchParams(window.location.search);
    this.flowId = urlParams.get('flowId');
    const modelId = urlParams.get('modelId');
    
    this.initElements();
    this.bindEvents();
    
    // 加载可用模型
    await this.loadModels();
    
    // 加载流程数据
    if (this.flowId) {
      await this.loadFlow(this.flowId);
    } else if (modelId) {
      // 从虚拟模型加载流程
      await this.loadFlowByModelId(modelId);
    }
    
    this.updateUI();
  }

  initElements() {
    this.elements = {
      flowTitle: document.getElementById('flowTitle'),
      flowIdDisplay: document.getElementById('flowIdDisplay'),
      canvas: document.getElementById('canvas'),
      emptyState: document.getElementById('emptyState'),
      addNodeBtn: document.getElementById('addNodeBtn'),
      saveBtn: document.getElementById('saveBtn'),
      closeBtn: document.getElementById('closeBtn'),
      addNodeModal: document.getElementById('addNodeModal'),
      closeAddNodeModal: document.getElementById('closeAddNodeModal'),
      nodeName: document.getElementById('nodeName'),
      nodeModel: document.getElementById('nodeModel'),
      confirmAddNodeBtn: document.getElementById('confirmAddNodeBtn'),
      cancelAddNodeBtn: document.getElementById('cancelAddNodeBtn'),
      modal: document.getElementById('addNodeModal')
    };
  }

  bindEvents() {
    // 工具栏按钮
    if (this.elements.addNodeBtn) {
      this.elements.addNodeBtn.addEventListener('click', () => this.showAddNodeModal());
    }
    
    if (this.elements.saveBtn) {
      this.elements.saveBtn.addEventListener('click', () => this.saveFlow());
    }
    
    if (this.elements.closeBtn) {
      this.elements.closeBtn.addEventListener('click', () => window.close());
    }
    
    // 添加节点模态框
    if (this.elements.closeAddNodeModal) {
      this.elements.closeAddNodeModal.addEventListener('click', () => this.hideAddNodeModal());
    }
    
    if (this.elements.cancelAddNodeBtn) {
      this.elements.cancelAddNodeBtn.addEventListener('click', () => this.hideAddNodeModal());
    }
    
    if (this.elements.confirmAddNodeBtn) {
      this.elements.confirmAddNodeBtn.addEventListener('click', () => this.addNode());
    }
    
    // 画布事件
    if (this.elements.canvas) {
      this.elements.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
      this.elements.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
      this.elements.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
    }

    // 点击模态框外部关闭
    if (this.elements.modal) {
      this.elements.modal.addEventListener('click', (e) => {
        if (e.target === this.elements.modal) {
          this.hideAddNodeModal();
        }
      });
    }
  }

  async loadModels() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getModels' });
      this.models = response || [];
      
      const select = this.elements.nodeModel;
      if (select) {
        select.innerHTML = '<option value="">选择模型...</option>';
        this.models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.name;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('加载模型失败:', error);
    }
  }

  async loadFlow(flowId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getFlow', flowId });
      if (response) {
        this.flowData = response;
        this.nodes = response.nodes || [];
        this.connections = response.connections || [];
        this.renderFlow();
      }
    } catch (error) {
      console.error('加载流程失败:', error);
    }
  }

  async loadFlowByModelId(modelId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getModel', modelId });
      if (response && response.flowId) {
        await this.loadFlow(response.flowId);
      }
    } catch (error) {
      console.error('加载模型流程失败:', error);
    }
  }

  renderFlow() {
    if (!this.elements.canvas) return;
    
    // 清空画布
    this.clearCanvas();
    
    if (this.nodes.length === 0) {
      this.showEmptyState();
      return;
    }
    
    this.hideEmptyState();
    
    // 渲染节点
    this.nodes.forEach(node => {
      this.renderNode(node);
    });
    
    // 如果有节点但没有连接，显示提示
    if (this.nodes.length > 0 && this.connections.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'connection-hint';
      hint.innerHTML = '💡 提示：从节点的右侧端口拖拽到另一个节点的左侧端口即可创建连线';
      hint.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        animation: slideUp 0.3s ease;
      `;
      document.body.appendChild(hint);
      
      setTimeout(() => hint.remove(), 5000);
    }
    
    // 渲染连线
    this.connections.forEach(conn => {
      this.renderConnection(conn);
    });
  }

  renderNode(node) {
    const div = document.createElement('div');
    div.className = 'flow-node';
    div.id = `node-${node.id}`;
    div.style.left = node.x + 'px';
    div.style.top = node.y + 'px';
    
    const model = this.models.find(m => m.id === node.modelId);
    const modelName = model ? model.name : node.modelId;
    
    div.innerHTML = `
      <div class="node-header">
        <span class="node-icon">🤖</span>
        <span class="node-title">${this.escapeHtml(node.name)}</span>
        <button class="node-delete-btn" data-node-id="${node.id}">&times;</button>
      </div>
      <div class="node-body">
        <div class="node-info">模型: ${this.escapeHtml(modelName)}</div>
      </div>
      <div class="node-port node-port-in" data-port="in" data-node-id="${node.id}"></div>
      <div class="node-port node-port-out" data-port="out" data-node-id="${node.id}"></div>
    `;
    
    // 删除按钮事件
    const deleteBtn = div.querySelector('.node-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteNode(node.id);
      });
    }
    
    // 端口连接事件
    const ports = div.querySelectorAll('.node-port');
    ports.forEach(port => {
      port.addEventListener('mousedown', (e) => {
        this.onPortMouseDown(e, node.id, port.dataset.port);
      });
      port.addEventListener('mouseup', (e) => {
        this.onPortMouseUp(e, node.id, port.dataset.port);
      });
      port.addEventListener('mouseenter', (e) => {
        if (this.dragState.isConnecting && port.dataset.port === 'in') {
          port.style.transform = 'translateY(-50%) scale(1.5)';
          port.style.boxShadow = '0 0 0 6px rgba(139, 92, 246, 0.3)';
        }
      });
      port.addEventListener('mouseleave', (e) => {
        port.style.transform = '';
        port.style.boxShadow = '';
      });
    });
    
    this.elements.canvas.appendChild(div);
  }

  renderConnection(conn) {
    const fromNode = this.nodes.find(n => n.id === conn.from);
    const toNode = this.nodes.find(n => n.id === conn.to);
    
    if (!fromNode || !toNode) return;
    
    const fromEl = document.getElementById(`node-${fromNode.id}`);
    const toEl = document.getElementById(`node-${toNode.id}`);
    
    if (!fromEl || !toEl) return;
    
    const fromPort = fromEl.querySelector('.node-port-out');
    const toPort = toEl.querySelector('.node-port-in');
    
    if (!fromPort || !toPort) return;
    
    const line = new LeaderLine(fromPort, toPort, {
      color: '#8b5cf6',
      width: 2,
      endPlug: 'arrow'
    });
    
    this.lines.push({ id: conn.id, line });
  }

  onCanvasMouseDown(e) {
    // 如果点击的是端口，不处理节点拖拽
    if (e.target.classList.contains('node-port')) {
      return;
    }
    
    const nodeEl = e.target.closest('.flow-node');
    if (nodeEl) {
      this.dragState.isDragging = true;
      this.dragState.nodeId = nodeEl.id.replace('node-', '');
      this.dragState.startX = e.clientX - nodeEl.offsetLeft;
      this.dragState.startY = e.clientY - nodeEl.offsetTop;
      e.preventDefault();
    }
  }

  onCanvasMouseMove(e) {
    if (this.dragState.isDragging) {
      const node = this.nodes.find(n => n.id === this.dragState.nodeId);
      if (node) {
        node.x = e.clientX - this.dragState.startX;
        node.y = e.clientY - this.dragState.startY;
        
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.style.left = node.x + 'px';
          nodeEl.style.top = node.y + 'px';
        }
        
        // 实时更新相关连线
        this.updateNodeConnections(node.id);
      }
    }
    
    if (this.dragState.isConnecting) {
      // 更新临时连线
      this.updateTempLine(e);
    }
  }

  onCanvasMouseUp(e) {
    if (this.dragState.isConnecting) {
      // 取消连线，删除临时线
      if (this.dragState.tempLine) {
        if (this.dragState.tempLine.svg) {
          this.dragState.tempLine.svg.remove();
        } else if (this.dragState.tempLine.remove) {
          this.dragState.tempLine.remove();
        }
        this.dragState.tempLine = null;
      }
      this.dragState.isConnecting = false;
      this.dragState.connectingFrom = null;
      this.dragState.startPort = null;
    }
    this.dragState.isDragging = false;
    this.dragState.nodeId = null;
  }

  onPortMouseDown(e, nodeId, portType) {
    if (portType === 'out') {
      const fromNodeEl = document.getElementById(`node-${nodeId}`);
      const fromPort = fromNodeEl?.querySelector('.node-port-out');
      
      if (!fromPort) return;

      e.stopPropagation();
      e.preventDefault();

      this.dragState.isConnecting = true;
      this.dragState.connectingFrom = nodeId;
      this.dragState.startPort = fromPort;
      
      // 初始化临时连线对象
      this.dragState.tempLine = null;
    }
  }

  onPortMouseUp(e, nodeId, portType) {
    if (this.dragState.isConnecting && portType === 'in') {
      e.stopPropagation();
      e.preventDefault();

      const fromNode = this.dragState.connectingFrom;
      const toNode = nodeId;
      
      // 删除临时连线
      if (this.dragState.tempLine) {
        if (this.dragState.tempLine.svg) {
          this.dragState.tempLine.svg.remove();
        } else if (this.dragState.tempLine.remove) {
          this.dragState.tempLine.remove();
        }
        this.dragState.tempLine = null;
      }
      
      if (fromNode && toNode && fromNode !== toNode) {
        // 检查是否已存在连接
        const exists = this.connections.some(c => c.from === fromNode && c.to === toNode);
        if (!exists) {
          const connection = {
            id: 'conn-' + Date.now(),
            from: fromNode,
            to: toNode
          };
          this.connections.push(connection);
          this.renderConnection(connection);
        }
      }
      
      this.dragState.isConnecting = false;
      this.dragState.connectingFrom = null;
      this.dragState.startPort = null;
    }
  }

  updateTempLine(e) {
    if (!this.dragState.startPort) return;
    
    // 获取画布位置
    const canvasRect = this.elements.canvas.getBoundingClientRect();
    const scrollLeft = this.elements.canvas.scrollLeft;
    const scrollTop = this.elements.canvas.scrollTop;
    
    // 计算鼠标在画布中的位置
    const mouseX = e.clientX - canvasRect.left + scrollLeft;
    const mouseY = e.clientY - canvasRect.top + scrollTop;
    
    // 获取起始端口位置
    const portRect = this.dragState.startPort.getBoundingClientRect();
    const startX = portRect.left - canvasRect.left + scrollLeft + portRect.width / 2;
    const startY = portRect.top - canvasRect.top + scrollTop + portRect.height / 2;
    
    // 创建或更新SVG临时线
    const svgId = 'temp-connection-svg';
    let svg = document.getElementById(svgId);
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = svgId;
      svg.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999;
        overflow: visible;
      `;
      this.elements.canvas.appendChild(svg);
    }
    
    // 清空旧内容
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    // 计算贝塞尔曲线控制点
    const deltaX = mouseX - startX;
    const controlOffset = Math.max(Math.abs(deltaX) * 0.5, 50);
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${mouseX - controlOffset} ${mouseY}, ${mouseX} ${mouseY}`;
    
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#8b5cf6');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '8,4');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    
    // 添加箭头标记
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.appendChild(defs);
    }
    
    let marker = defs.querySelector('#arrowhead');
    if (!marker) {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'arrowhead');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
      polygon.setAttribute('fill', '#8b5cf6');
      
      marker.appendChild(polygon);
      defs.appendChild(marker);
    }
    
    svg.appendChild(path);
    this.dragState.tempLine = { svg, path };
  }

  showAddNodeModal() {
    if (this.elements.addNodeModal) {
      this.elements.addNodeModal.classList.add('active');
      this.elements.nodeName.value = '';
      this.elements.nodeModel.value = '';
    }
  }

  hideAddNodeModal() {
    if (this.elements.addNodeModal) {
      this.elements.addNodeModal.classList.remove('active');
    }
  }

  addNode() {
    const name = this.elements.nodeName.value.trim();
    const modelId = this.elements.nodeModel.value;
    
    if (!name || !modelId) {
      alert('请填写节点名称和选择模型');
      return;
    }
    
    const node = {
      id: 'node-' + Date.now(),
      name,
      modelId,
      x: 100 + this.nodes.length * 50,
      y: 100 + this.nodes.length * 50
    };
    
    this.nodes.push(node);
    this.renderNode(node);
    this.hideAddNodeModal();
    this.updateEmptyState();
  }

  deleteNode(nodeId) {
    if (!confirm('确定删除此节点吗？')) return;
    
    // 1. 立即删除DOM元素
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (nodeEl) {
      nodeEl.remove();
    }
    
    // 2. 清除相关连线
    this.lines = this.lines.filter(l => {
      const conn = this.connections.find(c => c.id === l.id);
      if (conn && (conn.from === nodeId || conn.to === nodeId)) {
        l.line.remove();
        return false;
      }
      return true;
    });
    
    // 3. 更新数据
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
    
    // 4. 更新空状态
    this.updateEmptyState();
  }

  async saveFlow() {
    try {
      const flowData = {
        id: this.flowId,
        name: this.flowData?.name || '未命名流程',
        nodes: this.nodes,
        connections: this.connections,
        mode: 'virtual-model'
      };
      
      const response = await chrome.runtime.sendMessage({
        action: 'saveFlow',
        flow: flowData
      });
      
      if (response && response.id) {
        this.flowId = response.id;
        this.updateUI();
        alert('保存成功');
      } else {
        alert('保存失败');
      }
    } catch (error) {
      console.error('保存流程失败:', error);
      alert('保存失败: ' + error.message);
    }
  }

  updateUI() {
    if (this.elements.flowIdDisplay) {
      this.elements.flowIdDisplay.textContent = this.flowId || '新流程';
    }
  }

  showEmptyState() {
    if (this.elements.emptyState) {
      this.elements.emptyState.style.display = 'block';
    }
  }

  hideEmptyState() {
    if (this.elements.emptyState) {
      this.elements.emptyState.style.display = 'none';
    }
  }

  updateEmptyState() {
    if (this.nodes.length === 0) {
      this.showEmptyState();
    } else {
      this.hideEmptyState();
    }
  }

  clearCanvas() {
    const nodes = this.elements.canvas.querySelectorAll('.flow-node');
    nodes.forEach(n => n.remove());
    this.clearLines();
  }

  clearLines() {
    this.lines.forEach(l => l.line.remove());
    this.lines = [];
  }

  updateConnections() {
    this.clearLines();
    this.connections.forEach(conn => this.renderConnection(conn));
  }

  updateNodeConnections(nodeId) {
    // 找到与该节点相关的所有连线
    const relatedLines = this.lines.filter(l => {
      const conn = this.connections.find(c => c.id === l.id);
      return conn && (conn.from === nodeId || conn.to === nodeId);
    });
    
    // 更新这些连线的位置
    relatedLines.forEach(l => {
      if (l.line && typeof l.line.position === 'function') {
        try {
          l.line.position();
        } catch (error) {
          console.error('更新连线位置失败:', error);
        }
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
const page = new FlowDesignerPage();
window.addEventListener('DOMContentLoaded', () => page.init());
