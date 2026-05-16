/**
 * 流程设计器逻辑
 * 使用LeaderLine绘制连接线
 */
class FlowsTab {
  constructor() {
    this.state = {
      flows: [],
      selectedFlowId: null,
      nodes: [],
      connections: [],
      editingFlowId: null,
      lines: [] // LeaderLine实例
    };

    this.elements = {};
  }

  async init() {
    this.initElements();
    this.bindEvents();
    await this.loadFlows();
    this.renderFlowsList();
  }

  initElements() {
    this.elements = {
      flowsList: document.getElementById('flowsList'),
      flowsCanvas: document.getElementById('flowsCanvas'),
      flowModal: document.getElementById('flowModal'),
      nodeModal: document.getElementById('nodeModal'),
      virtualModelModal: document.getElementById('virtualModelModal')
    };
  }

  bindEvents() {
    // 新建流程
    document.getElementById('newFlowBtn').addEventListener('click', () => {
      this.showFlowModal();
    });

    // 添加节点
    document.getElementById('addNodeBtn').addEventListener('click', () => {
      this.showNodeModal();
    });

    // 保存流程
    document.getElementById('saveFlowBtn').addEventListener('click', () => {
      this.saveCurrentFlow();
    });

    // 流程确认
    document.getElementById('confirmFlowBtn').addEventListener('click', () => {
      this.saveFlow();
    });

    // 节点确认
    document.getElementById('confirmNodeBtn').addEventListener('click', () => {
      this.addNode();
    });

    // 虚拟模型确认
    document.getElementById('confirmVirtualModelBtn').addEventListener('click', () => {
      this.saveAsVirtualModel();
    });

    // 取消按钮
    document.getElementById('cancelFlowBtn').addEventListener('click', () => {
      this.hideFlowModal();
    });

    document.getElementById('cancelNodeBtn').addEventListener('click', () => {
      this.hideNodeModal();
    });

    document.getElementById('cancelVirtualModelBtn').addEventListener('click', () => {
      this.hideVirtualModelModal();
    });

    // 关闭按钮
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hideFlowModal();
        this.hideNodeModal();
        this.hideVirtualModelModal();
      });
    });

    // 点击外部关闭
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideFlowModal();
        this.hideNodeModal();
        this.hideVirtualModelModal();
      }
    });
  }

  async loadFlows() {
    try {
      const flows = await sendMessage({ action: 'getFlows' });
      this.state.flows = flows || [];
    } catch (error) {
      console.error('加载流程失败:', error);
    }
  }

  renderFlowsList() {
    if (this.state.flows.length === 0) {
      this.elements.flowsList.innerHTML = '<div class="empty-state">暂无流程</div>';
      return;
    }

    this.elements.flowsList.innerHTML = this.state.flows.map(flow => {
      const isSelected = flow.id === this.state.selectedFlowId;

      return `
        <div class="flow-item ${isSelected ? 'selected' : ''}" data-id="${flow.id}">
          <div class="flow-name">${this.escapeHtml(flow.name)}</div>
          <div class="flow-info">
            <span class="node-count">${flow.nodes?.length || 0} 个节点</span>
            <div class="flow-actions">
              <button class="duplicate-btn" data-id="${flow.id}" title="复制">📋</button>
              <button class="delete-btn" data-id="${flow.id}" title="删除">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定事件
    this.elements.flowsList.querySelectorAll('.flow-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('duplicate-btn') && !e.target.classList.contains('delete-btn')) {
          this.selectFlow(item.dataset.id);
        }
      });
    });

    this.elements.flowsList.querySelectorAll('.duplicate-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.duplicateFlow(btn.dataset.id);
      });
    });

    this.elements.flowsList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.deleteFlow(btn.dataset.id);
      });
    });
  }

  async selectFlow(flowId) {
    this.state.selectedFlowId = flowId;
    this.renderFlowsList();

    // 加载流程数据
    const flow = await sendMessage({
      action: 'getFlowById',
      flowId: flowId
    });

    if (flow) {
      this.state.nodes = flow.nodes || [];
      this.state.connections = flow.connections || [];
      this.renderCanvas();
    }
  }

  renderCanvas() {
    this.clearLines();

    if (this.state.nodes.length === 0) {
      this.elements.flowsCanvas.innerHTML = '<div class="empty-state">点击"添加节点"开始设计流程</div>';
      return;
    }

    // 渲染节点
    this.elements.flowsCanvas.innerHTML = this.state.nodes.map(node => `
      <div class="flow-node" id="node-${node.id}" data-id="${node.id}"
           style="left: ${node.x || 100}px; top: ${node.y || 100}px;">
        <div class="node-header">
          <span class="node-title">${this.escapeHtml(node.name)}</span>
          <button class="node-delete" data-id="${node.id}">&times;</button>
        </div>
        <div class="node-body">
          <div class="node-info">${this.escapeHtml(node.modelId || '')}</div>
        </div>
        <div class="node-port node-port-in"></div>
        <div class="node-port node-port-out"></div>
      </div>
    `).join('');

    // 渲染连接线
    this.renderConnections();

    // 绑定节点事件
    this.bindNodeEvents();
  }

  renderConnections() {
    this.state.connections.forEach(conn => {
      const fromNode = document.getElementById(`node-${conn.from}`);
      const toNode = document.getElementById(`node-${conn.to}`);

      if (fromNode && toNode) {
        const fromPort = fromNode.querySelector('.node-port-out');
        const toPort = toNode.querySelector('.node-port-in');

        const line = new LeaderLine(fromPort, toPort, {
          color: '#666',
          width: 2,
          path: 'straight',
          endPlug: 'arrow1'
        });

        this.state.lines.push({ connection: conn, line });
      }
    });
  }

  clearLines() {
    this.state.lines.forEach(({ line }) => {
      line.remove();
    });
    this.state.lines = [];
  }

  bindNodeEvents() {
    // 节点拖拽
    this.elements.flowsCanvas.querySelectorAll('.flow-node').forEach(node => {
      let isDragging = false;
      let startX, startY, initialX, initialY;

      const header = node.querySelector('.node-header');
      header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('node-delete')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = parseInt(node.style.left) || 0;
        initialY = parseInt(node.style.top) || 0;
        node.classList.add('dragging');
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        node.style.left = (initialX + dx) + 'px';
        node.style.top = (initialY + dy) + 'px';

        // 重绘连接线
        this.clearLines();
        this.renderConnections();
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          node.classList.remove('dragging');

          // 更新节点位置
          const nodeId = node.dataset.id;
          const nodeData = this.state.nodes.find(n => n.id === nodeId);
          if (nodeData) {
            nodeData.x = parseInt(node.style.left);
            nodeData.y = parseInt(node.style.top);
          }
        }
      });
    });

    // 删除节点
    this.elements.flowsCanvas.querySelectorAll('.node-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.deleteNode(btn.dataset.id);
      });
    });
  }

  async saveCurrentFlow() {
    if (!this.state.selectedFlowId) {
      alert('请先选择流程');
      return;
    }

    try {
      await sendMessage({
        action: 'updateFlow',
        flowId: this.state.selectedFlowId,
        data: {
          nodes: this.state.nodes,
          connections: this.state.connections
        }
      });

      alert('保存成功');
      await this.loadFlows();
      this.renderFlowsList();
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  }

  async showFlowModal() {
    document.getElementById('flowModalTitle').textContent = '新建流程';
    document.getElementById('flowName').value = '';
    document.getElementById('flowDescription').value = '';
    this.elements.flowModal.classList.add('active');
  }

  async saveFlow() {
    const name = document.getElementById('flowName').value.trim();
    const description = document.getElementById('flowDescription').value.trim();

    if (!name) {
      alert('请输入流程名称');
      return;
    }

    try {
      const flow = await sendMessage({
        action: 'createFlow',
        data: { name, description }
      });

      await this.loadFlows();
      this.renderFlowsList();
      this.selectFlow(flow.id);
      this.hideFlowModal();
    } catch (error) {
      alert('创建失败：' + error.message);
    }
  }

  async showNodeModal() {
    if (!this.state.selectedFlowId) {
      alert('请先选择流程');
      return;
    }

    // 加载模型和提示词选项
    try {
      const [models, prompts] = await Promise.all([
        sendMessage({ action: 'getEnabledModels' }),
        sendMessage({ action: 'getPrompts' })
      ]);

      const modelSelect = document.getElementById('nodeModel');
      const promptSelect = document.getElementById('nodePrompt');

      modelSelect.innerHTML = models.map(m =>
        `<option value="${m.id}">${m.name}</option>`
      ).join('');

      promptSelect.innerHTML = prompts.map(p =>
        `<option value="${p.id}">${p.name}</option>`
      ).join('');

      document.getElementById('nodeName').value = '';
      this.elements.nodeModal.classList.add('active');
    } catch (error) {
      alert('加载数据失败：' + error.message);
    }
  }

  async addNode() {
    const name = document.getElementById('nodeName').value.trim();
    const modelId = document.getElementById('nodeModel').value;
    const promptId = document.getElementById('nodePrompt').value;

    if (!name) {
      alert('请输入节点名称');
      return;
    }

    try {
      const result = await sendMessage({
        action: 'addNode',
        flowId: this.state.selectedFlowId,
        nodeData: {
          name,
          modelId,
          promptId,
          x: 100,
          y: 100
        }
      });

      // 重新加载流程
      await this.selectFlow(this.state.selectedFlowId);
      this.hideNodeModal();
    } catch (error) {
      alert('添加失败：' + error.message);
    }
  }

  async deleteNode(nodeId) {
    if (!confirm('确定要删除这个节点吗？')) return;

    try {
      await sendMessage({
        action: 'deleteNode',
        flowId: this.state.selectedFlowId,
        nodeId: nodeId
      });

      await this.selectFlow(this.state.selectedFlowId);
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  }

  async deleteFlow(flowId) {
    if (!confirm('确定要删除这个流程吗？')) return;

    try {
      await sendMessage({
        action: 'deleteFlow',
        flowId: flowId
      });

      if (this.state.selectedFlowId === flowId) {
        this.state.selectedFlowId = null;
        this.state.nodes = [];
        this.state.connections = [];
        this.renderCanvas();
      }

      await this.loadFlows();
      this.renderFlowsList();
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  }

  async duplicateFlow(flowId) {
    try {
      await sendMessage({
        action: 'duplicateFlow',
        flowId: flowId
      });

      await this.loadFlows();
      this.renderFlowsList();
    } catch (error) {
      alert('复制失败：' + error.message);
    }
  }

  hideFlowModal() {
    this.elements.flowModal.classList.remove('active');
  }

  hideNodeModal() {
    this.elements.nodeModal.classList.remove('active');
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
