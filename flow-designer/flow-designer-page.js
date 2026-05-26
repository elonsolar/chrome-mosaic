/**
 * 流程设计器页面 - 重新设计版本
 * 基于 Coze Studio 设计系统
 */

// ==================== 节点类型定义 ====================
class NodeTypes {
  static START = 'start';
  static LLM = 'llm';
  static TOOL = 'tool';
  static END = 'end';

  static getAll() {
    return [
      { type: NodeTypes.START, name: '开始', icon: '🚀', color: '#10B981', description: '流程开始节点' },
      { type: NodeTypes.LLM, name: '大模型', icon: '🤖', color: '#3B82F6', description: '调用大语言模型' },
      { type: NodeTypes.TOOL, name: '工具', icon: '🔧', color: '#F59E0B', description: '调用外部工具' },
      { type: NodeTypes.END, name: '结束', icon: '🏁', color: '#EF4444', description: '流程结束节点' }
    ];
  }

  static getByType(type) {
    return NodeTypes.getAll().find(t => t.type === type);
  }

  static isStart(type) { return type === NodeTypes.START; }
  static isEnd(type) { return type === NodeTypes.END; }
  static isExecutable(type) { return type === NodeTypes.LLM || type === NodeTypes.TOOL; }
}

// ==================== 流程执行引擎 ====================
class FlowRunner {
  constructor(flowData) {
    this.flowData = flowData;
    this.context = {};
    this.currentNode = null;
    this.isRunning = false;
  }

  async run() {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }

    this.isRunning = true;
    this.context = {};

    try {
      // 找到开始节点
      const startNode = this.flowData.nodes.find(n => n.type === NodeTypes.START);
      if (!startNode) {
        throw new Error('未找到开始节点');
      }

      // 从开始节点开始执行
      await this.executeNode(startNode);

      return {
        success: true,
        context: this.context,
        message: '流程执行成功'
      };
    } catch (error) {
      console.error('流程执行失败:', error);
      return {
        success: false,
        error: error.message,
        context: this.context
      };
    } finally {
      this.isRunning = false;
    }
  }

  async executeNode(node) {
    this.currentNode = node;

    switch (node.type) {
      case NodeTypes.START:
        await this.executeStartNode(node);
        break;
      case NodeTypes.LLM:
        await this.executeLLMNode(node);
        break;
      case NodeTypes.TOOL:
        await this.executeToolNode(node);
        break;
      case NodeTypes.END:
        await this.executeEndNode(node);
        break;
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }

    // 执行下一个节点
    const nextNode = this.getNextNode(node.id);
    if (nextNode) {
      await this.executeNode(nextNode);
    }
  }

  async executeStartNode(node) {
    // 开始节点：初始化输入变量
    if (node.config && node.config.inputs) {
      for (const [key, value] of Object.entries(node.config.inputs)) {
        this.context[key] = value;
      }
    }
  }

  async executeLLMNode(node) {
    if (!node.config || !node.config.modelId) {
      throw new Error('LLM 节点缺少模型配置');
    }

    // 替换变量
    const prompt = this.replaceVariables(node.config.prompt || '');
    const answer = this.replaceVariables(node.config.answer || '');

    // 调用大模型
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'callModel',
        modelId: node.config.modelId,
        prompt,
        answer
      });

      // 保存输出
      const outputKey = node.config.outputKey || `${node.id}_output`;
      this.context[outputKey] = response;

      // 如果有输出格式定义，解析输出
      if (node.config.outputFormat) {
        const parsed = this.parseOutput(response, node.config.outputFormat);
        this.context[`${outputKey}_parsed`] = parsed;
      }
    } catch (error) {
      throw new Error(`LLM 调用失败: ${error.message}`);
    }
  }

  async executeToolNode(node) {
    if (!node.config || !node.config.toolId) {
      throw new Error('工具节点缺少工具配置');
    }

    // 准备参数
    const params = {};
    if (node.config.params) {
      for (const [key, value] of Object.entries(node.config.params)) {
        params[key] = this.replaceVariables(value);
      }
    }

    // 调用工具
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'callTool',
        toolId: node.config.toolId,
        params
      });

      // 保存输出
      const outputKey = node.config.outputKey || `${node.id}_output`;
      this.context[outputKey] = response;
    } catch (error) {
      throw new Error(`工具调用失败: ${error.message}`);
    }
  }

  async executeEndNode(node) {
    // 结束节点：输出最终结果
    if (node.config && node.config.outputs) {
      for (const [key, value] of Object.entries(node.config.outputs)) {
        this.context[key] = this.replaceVariables(value);
      }
    }
  }

  getNextNode(nodeId) {
    // 找到从当前节点出发的连接
    const connection = this.flowData.connections.find(c => c.from === nodeId);
    if (!connection) return null;

    // 返回目标节点
    return this.flowData.nodes.find(n => n.id === connection.to);
  }

  replaceVariables(text) {
    if (!text || typeof text !== 'string') return text;

    // 匹配 {{variable}} 格式
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      return this.context[trimmedKey] !== undefined ? this.context[trimmedKey] : match;
    });
  }

  parseOutput(text, format) {
    try {
      if (format === 'json') {
        return JSON.parse(text);
      }
      return text;
    } catch (error) {
      console.error('解析输出失败:', error);
      return text;
    }
  }
}

// ==================== 流程设计器页面 ====================
class FlowDesignerPage {
  constructor() {
    this.flowId = null;
    this.flowData = null;
    this.nodes = [];
    this.connections = [];
    this.lines = [];
    this.models = [];
    this.tools = [];
    this.selectedNodeId = null;

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

    this.nodeConfigs = {}; // 存储节点配置
  }

  async init() {
    this.initElements();
    this.bindEvents();
    this.initDragDrop();

    await this.loadModels();
    await this.loadTools();

    const urlParams = new URLSearchParams(window.location.search);
    this.flowId = urlParams.get('flowId');
    const modelId = urlParams.get('modelId');

    if (this.flowId) {
      await this.loadFlow(this.flowId);
    } else if (modelId) {
      await this.loadFlowByModelId(modelId);
    } else {
      // 新建流程：自动创建开始和结束节点
      this.createDefaultNodes();
    }

    this.updateUI();
  }

  createDefaultNodes() {
    // 创建开始节点（固定位置在左侧）
    const startNode = {
      id: 'node-start',
      type: NodeTypes.START,
      name: '开始',
      x: 100,
      y: 250
    };

    // 创建结束节点（固定位置在右侧）
    const endNode = {
      id: 'node-end',
      type: NodeTypes.END,
      name: '结束',
      x: 800,
      y: 250
    };

    this.nodes.push(startNode, endNode);
    this.renderNode(startNode);
    this.renderNode(endNode);

    // 初始化配置（包含固定的 USER_INPUT 变量）
    this.nodeConfigs[startNode.id] = {
      inputs: {
        USER_INPUT: {
          name: 'USER_INPUT',
          type: 'String',
          required: true
        }
      }
    };
    this.nodeConfigs[endNode.id] = { outputs: {}, returnText: '' };

    this.updateEmptyState();
  }

  initElements() {
    this.elements = {
      // 头部
      header: document.querySelector('.header'),
      flowTitle: document.getElementById('flowTitle'),
      flowIdDisplay: document.getElementById('flowIdDisplay'),

      // 画布
      canvas: document.getElementById('canvas'),
      emptyState: document.getElementById('emptyState'),

      // 浮动按钮
      floatingAddBtn: document.getElementById('floatingAddBtn'),
      saveBtn: document.getElementById('saveBtn'),
      closeBtn: document.getElementById('closeBtn'),
      runFlowBtn: document.getElementById('runFlowBtn'),

      // 侧边栏面板
      sidePanel: document.getElementById('nodeConfigPanel'),
      panelTitle: document.getElementById('panelTitle'),
      closePanelBtn: document.getElementById('closePanelBtn'),
      panelOverlay: document.getElementById('panelOverlay'),

      // 面板内容区域
      nodeTypeSection: document.getElementById('nodeTypeSection'),
      nodeTypeGrid: document.getElementById('nodeTypeGrid'),

      // 运行面板
      runPanel: document.getElementById('runPanel'),
      closeRunPanel: document.getElementById('closeRunPanel'),
      startRunBtn: document.getElementById('startRunBtn'),
      stopRunBtn: document.getElementById('stopRunBtn'),

      // 测试运行
      testRunBtn: document.getElementById('testRunBtn'),
      consoleOutput: document.querySelector('.console-output')
    };
  }

  bindEvents() {
    // 浮动添加按钮
    if (this.elements.floatingAddBtn) {
      this.elements.floatingAddBtn.addEventListener('click', () => this.showNodeTypeSelector());
    }

    // 工具栏按钮
    if (this.elements.saveBtn) {
      this.elements.saveBtn.addEventListener('click', () => this.saveFlow());
    }
    if (this.elements.closeBtn) {
      this.elements.closeBtn.addEventListener('click', () => window.close());
    }
    if (this.elements.runFlowBtn) {
      this.elements.runFlowBtn.addEventListener('click', () => this.showRunPanel());
    }

    // 侧边栏面板
    if (this.elements.closePanelBtn) {
      this.elements.closePanelBtn.addEventListener('click', () => this.hideNodeConfigPanel());
    }
    if (this.elements.panelOverlay) {
      this.elements.panelOverlay.addEventListener('click', () => this.hideNodeConfigPanel());
    }

    // 节点类型卡片点击
    if (this.elements.nodeTypeGrid) {
      const typeCards = this.elements.nodeTypeGrid.querySelectorAll('.type-card');
      typeCards.forEach(card => {
        card.addEventListener('click', () => {
          const nodeType = card.dataset.type;
          if (nodeType) {
            this.addNodeByType(nodeType);
          }
        });
      });
    }

    // 运行面板
    if (this.elements.closeRunPanel) {
      this.elements.closeRunPanel.addEventListener('click', () => this.hideRunPanel());
    }
    if (this.elements.startRunBtn) {
      this.elements.startRunBtn.addEventListener('click', () => this.startRun());
    }
    if (this.elements.stopRunBtn) {
      this.elements.stopRunBtn.addEventListener('click', () => this.stopRun());
    }

    // 变量选择器事件委托
    const pickerList = document.getElementById('variablePickerList');
    if (pickerList) {
      pickerList.addEventListener('click', (e) => {
        const item = e.target.closest('.variable-picker-item');
        if (item) {
          const nodeId = item.dataset.nodeId;
          const varName = item.dataset.varName;
          this.selectVariable(nodeId, varName);
        }
      });
    }

    // 画布事件
    if (this.elements.canvas) {
      this.elements.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
      this.elements.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
      this.elements.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
    }
  }

  initDragDrop() {
    // 不再需要拖拽功能
    // 节点通过点击节点类型卡片添加
  }

  async loadModels() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getModels' });
      this.models = response || [];
    } catch (error) {
      console.error('加载模型失败:', error);
    }
  }

  async loadTools() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTools' });
      this.tools = response || [];
    } catch (error) {
      console.error('加载工具失败:', error);
    }
  }

  async loadFlow(flowId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getFlow', flowId });
      if (response) {
        this.flowData = response;
        this.nodes = response.nodes || [];
        this.connections = response.connections || [];
        this.nodeConfigs = response.nodeConfigs || {};

        // 确保开始和结束节点存在
        this.ensureDefaultNodes();

        this.renderFlow();
      }
    } catch (error) {
      console.error('加载流程失败:', error);
    }
  }

  ensureDefaultNodes() {
    const hasStart = this.nodes.some(n => n.type === NodeTypes.START);
    const hasEnd = this.nodes.some(n => n.type === NodeTypes.END);

    if (!hasStart) {
      const startNode = {
        id: 'node-start',
        type: NodeTypes.START,
        name: '开始',
        x: 100,
        y: 250
      };
      this.nodes.unshift(startNode);
      
      // 默认包含固定的 USER_INPUT 变量
      this.nodeConfigs[startNode.id] = {
        inputs: {
          USER_INPUT: {
            name: 'USER_INPUT',
            type: 'String',
            required: true
          }
        }
      };
    }

    if (!hasEnd) {
      const endNode = {
        id: 'node-end',
        type: NodeTypes.END,
        name: '结束',
        x: 800,
        y: 250
      };
      this.nodes.push(endNode);
      this.nodeConfigs[endNode.id] = {
        outputs: {},
        returnText: ''
      };
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

    this.clearCanvas();

    if (this.nodes.length === 0) {
      this.showEmptyState();
      return;
    }

    this.hideEmptyState();

    this.nodes.forEach(node => {
      this.renderNode(node);
    });

    this.connections.forEach(conn => {
      this.renderConnection(conn);
    });
  }

  renderNode(node) {
    const nodeType = NodeTypes.getByType(node.type);
    if (!nodeType) return;

    const div = document.createElement('div');
    div.className = `node ${node.type === NodeTypes.START || node.type === NodeTypes.END ? 'node-special' : ''}`;
    div.id = `node-${node.id}`;
    div.style.left = node.x + 'px';
    div.style.top = node.y + 'px';
    div.dataset.type = node.type;

    div.innerHTML = `
      <div class="node-header">
        <span class="node-icon">${nodeType.icon}</span>
        <span class="node-title">${this.escapeHtml(node.name)}</span>
        ${!NodeTypes.isStart(node.type) && !NodeTypes.isEnd(node.type) ? `
          <button class="node-delete-btn" data-node-id="${node.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        ` : ''}
      </div>
      <div class="node-body">
        <div class="node-info">${nodeType.description}</div>
      </div>
      <div class="node-port node-port-in" data-port="in" data-node-id="${node.id}"></div>
      <div class="node-port node-port-out" data-port="out" data-node-id="${node.id}"></div>
    `;

    // 节点点击事件
    div.addEventListener('click', (e) => {
      if (!e.target.closest('.node-port') && !e.target.closest('.node-delete-btn')) {
        this.showNodeConfigPanel(node.id);
      }
    });

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
          port.style.boxShadow = '0 0 0 6px rgba(59, 130, 246, 0.3)';
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
      color: '#3B82F6',
      width: 2,
      endPlug: 'arrow'
    });

    this.lines.push({ id: conn.id, line });
  }

  showNodeConfigPanel(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    this.selectedNodeId = nodeId;
    const nodeType = NodeTypes.getByType(node.type);
    const config = this.nodeConfigs[nodeId] || {};

    // 显示侧边栏面板
    if (this.elements.sidePanel) {
      this.elements.sidePanel.style.display = 'block';

      // 隐藏节点类型选择区域
      if (this.elements.nodeTypeSection) {
        this.elements.nodeTypeSection.style.display = 'none';
      }

      // 显示其他配置区域（根据节点类型）
      this.updatePanelSections(node.type, config);
    }

    // 更新面板标题
    if (this.elements.panelTitle) {
      this.elements.panelTitle.textContent = `${nodeType.icon} ${node.name}`;
    }
  }

  updatePanelSections(nodeType, config) {
    // 根据节点类型显示/隐藏不同的配置区域
    const allSections = this.elements.sidePanel.querySelectorAll('.panel-section');
    allSections.forEach(section => {
      section.style.display = 'none';
    });

    // 根据节点类型显示相应的配置区域
    switch (nodeType) {
      case NodeTypes.START:
        // 显示输入变量配置
        const startInputSection = document.getElementById('panelInputSection');
        if (startInputSection) {
          startInputSection.style.display = 'block';
          this.renderInputVariables(config.inputs || {}, true); // withType = true
          this.bindVariableFormEvents(startInputSection, true);
        }
        break;

      case NodeTypes.LLM:
        // 显示模型选择
        const modelSection = document.getElementById('panelModelSection');
        if (modelSection) {
          modelSection.style.display = 'block';
          // 填充模型选项
          const modelSelect = document.getElementById('panelModelId');
          if (modelSelect) {
            modelSelect.innerHTML = '<option value="">选择模型...</option>';
            this.models.forEach(model => {
              const option = document.createElement('option');
              option.value = model.id;
              const platformName = model.platformName || '未知平台';
              option.textContent = `${platformName} - ${model.code || model.id}`;
              if (config.modelId === model.id) {
                option.selected = true;
              }
              modelSelect.appendChild(option);
            });
          }
        }

        // 显示输入变量配置
        const llmInputSection = document.getElementById('panelInputSection');
        if (llmInputSection) {
          llmInputSection.style.display = 'block';
          this.renderInputVariables(config.inputs || {}, false, true); // withRef = true
          this.bindVariableFormEvents(llmInputSection, false, true);
        }

        // 显示系统提示词
        const systemPromptSection = document.getElementById('panelSystemPromptSection');
        if (systemPromptSection) {
          systemPromptSection.style.display = 'block';
          const systemPrompt = document.getElementById('panelSystemPrompt');
          if (systemPrompt) {
            systemPrompt.value = config.systemPrompt || '';
          }
        }

        // 显示用户提示词
        const userPromptSection = document.getElementById('panelUserPromptSection');
        if (userPromptSection) {
          userPromptSection.style.display = 'block';
          const userPrompt = document.getElementById('panelUserPrompt');
          if (userPrompt) {
            userPrompt.value = config.userPrompt || '';
          }
        }

        // 显示高级配置
        const advancedSection = document.getElementById('panelLlmAdvancedSection');
        if (advancedSection) {
          advancedSection.style.display = 'block';
          const temperature = document.getElementById('panelTemperature');
          if (temperature) {
            temperature.value = config.temperature ?? 0.7;
          }
          const maxTokens = document.getElementById('panelMaxTokens');
          if (maxTokens) {
            maxTokens.value = config.maxTokens ?? 2000;
          }
          const outputFormatRadios = document.querySelectorAll('input[name="outputFormat"]');
          if (outputFormatRadios.length > 0) {
            outputFormatRadios.forEach(radio => {
              radio.checked = radio.value === (config.outputFormat || 'text');
            });
          }
        }
        break;

      case NodeTypes.TOOL:
        // 显示工具配置区域
        const toolInfoSection = document.getElementById('panelToolInfoSection');
        if (toolInfoSection) {
          toolInfoSection.style.display = 'block';
        }

        const toolInputSection = document.getElementById('panelToolInputSection');
        if (toolInputSection) {
          toolInputSection.style.display = 'block';
        }

        const toolOutputSection = document.getElementById('panelToolOutputSection');
        if (toolOutputSection) {
          toolOutputSection.style.display = 'block';
        }
        break;

      case NodeTypes.END:
        // 显示结束节点配置
        const endOutputSection = document.getElementById('panelEndOutputSection');
        if (endOutputSection) {
          endOutputSection.style.display = 'block';

          // 填充返回文本
          const returnTextInput = document.getElementById('panelReturnText');
          if (returnTextInput) {
            returnTextInput.value = config.returnText || '';
          }

          // 渲染输出变量（支持变量引用）
          this.renderOutputVariables(config.outputs || {});

          // 绑定输出变量事件
          this.bindOutputVariablesEvents();
        }
        break;
    }
  }

  hideNodeConfigPanel() {
    if (this.elements.sidePanel) {
      this.elements.sidePanel.style.display = 'none';
    }
    this.selectedNodeId = null;
  }

  renderInputVariables(inputs, withType = false, withRef = false) {
    const container = document.getElementById('panelInputParams');
    if (!container) return;

    container.innerHTML = '';

    Object.entries(inputs).forEach(([key, config]) => {
      // 如果 withType 为 true，config 应该是 { type, required }
      // 如果 withRef 为 true，config 是变量引用字符串
      // 否则 config 是变量的值
      if (withType && typeof config === 'object') {
        // USER_INPUT 是固定变量，不可删除
        const canDelete = key !== 'USER_INPUT';
        const varItem = this.createInputVariableItem(
          key,
          '',
          config.type || 'String',
          config.required || false,
          true,
          false,
          canDelete
        );
        container.appendChild(varItem);
      } else if (withRef) {
        const varItem = this.createInputVariableItem(
          key,
          config,
          '',
          false,
          false,
          true,
          true
        );
        container.appendChild(varItem);
      } else {
        const varItem = this.createInputVariableItem(key, config, '', false, false, false, true);
        container.appendChild(varItem);
      }
    });
  }

  createInputVariableItem(key = '', value = '', type = 'String', required = false, withType = false, withRef = false, canDelete = true) {
    const div = document.createElement('div');
    div.className = withType ? 'var-item' : 'var-item without-type';

    const typeOptions = ['String', 'Number', 'Boolean', 'Array', 'Object']
      .map(t => `<option value="${t}" ${type === t ? 'selected' : ''}>${t}</option>`)
      .join('');

    if (withType) {
      // 开始节点的输入变量（带类型）
      div.innerHTML = `
        <input type="text" class="form-input var-key" placeholder="变量名" value="${this.escapeHtml(key)}" ${!canDelete ? 'readonly' : ''} spellcheck="false"/>
        <select class="form-select var-type" ${!canDelete ? 'disabled' : ''}>
          ${typeOptions}
        </select>
        <div class="var-item-checkbox">
          <input type="checkbox" class="var-required" ${required ? 'checked' : ''} ${!canDelete ? 'disabled' : ''} title="必填"/>
        </div>
        ${canDelete ? `
        <button class="btn-small btn-ghost btn-remove-var" title="删除">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        ` : '<div></div>'}
      `;
    } else if (withRef) {
      // LLM/Tool节点的输入变量（带变量引用）
      const refValue = this.parseVariableReference(value);
      const refTagHtml = refValue ? this.renderVariableRefTag(refValue) : '<span class="var-ref-placeholder">选择变量</span>';

      div.innerHTML = `
        <input type="text" class="form-input var-key" placeholder="变量名" value="${this.escapeHtml(key)}" spellcheck="false"/>
        <div class="var-ref-input-wrapper" data-input-id="${Date.now()}-${Math.random()}">
          ${refTagHtml}
          <button class="var-ref-trigger-btn" title="选择变量">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.9999 14.0001C13.1045 14.0001 13.9999 13.1046 13.9999 12.0001C13.9999 10.8955 13.1045 10.0001 11.9999 10.0001C10.8954 10.0001 9.99994 10.8955 9.99994 12.0001C9.99994 13.1046 10.8954 14.0001 11.9999 14.0001Z"></path>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M22.9999 14C23.7145 12.7624 23.7145 11.2376 22.9999 9.99997L19.232 3.47369C18.5175 2.23609 17.197 1.47369 15.7679 1.47369H8.232C6.80294 1.47369 5.48243 2.23609 4.7679 3.47369L0.999949 9.99997C0.285418 11.2376 0.285418 12.7624 0.999948 14L4.7679 20.5263C5.48243 21.7639 6.80294 22.5263 8.232 22.5263H15.7679C17.197 22.5263 18.5175 21.7639 19.232 20.5263L22.9999 14Z"></path>
            </svg>
          </button>
        </div>
        <button class="btn-small btn-ghost btn-remove-var" title="删除">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      `;

      // 绑定变量选择器事件
      const triggerBtn = div.querySelector('.var-ref-trigger-btn');
      if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const inputWrapper = div.querySelector('.var-ref-input-wrapper');
          this.openVariablePicker(inputWrapper);
        });
      }
    } else {
      // 普通输入变量（无类型，无引用）
      div.innerHTML = `
        <input type="text" class="form-input var-key" placeholder="变量名" value="${this.escapeHtml(key)}" spellcheck="false"/>
        <input type="text" class="form-input var-value" placeholder="变量值" value="${this.escapeHtml(value)}" spellcheck="false"/>
        <button class="btn-small btn-ghost btn-remove-var" title="删除">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M11 3L3 11M3 3L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      `;
    }

    const removeBtn = div.querySelector('.btn-remove-var');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        div.remove();
      });
    }

    return div;
  }

  parseVariableReference(value) {
    // 解析变量引用，格式：{{nodeId.varName}}
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/^\{\{(.+?)\}\}$/);
    if (!match) return null;

    const ref = match[1];
    const parts = ref.split('.');
    if (parts.length < 2) return null;

    const nodeId = parts[0];
    const varName = parts.slice(1).join('.');

    return { nodeId, varName, full: ref };
  }

  renderVariableRefTag(ref) {
    const node = this.nodes.find(n => n.id === ref.nodeId);
    if (!node) return '';

    const nodeType = NodeTypes.getByType(node.type);
    const escapedNodeName = this.escapeHtml(node.name);
    const escapedVarName = this.escapeHtml(ref.varName);

    return `
      <div class="var-ref-tag">
        <div class="var-ref-tag-node-icon">${nodeType.icon}</div>
        <div class="var-ref-tag-content">
          <span class="var-ref-tag-node-name">${escapedNodeName}</span>
          <span class="var-ref-tag-separator">-</span>
          <span class="var-ref-tag-var-name">${escapedVarName}</span>
        </div>
        <div class="var-ref-tag-close" onclick="event.stopPropagation(); this.closest('.var-ref-input-wrapper').innerHTML = '<span class=\\'var-ref-placeholder\\'>选择变量</span>';">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.66 19.78a1.5 1.5 0 0 0 2.12-2.12L14.12 12l5.66-5.66a1.5 1.5 0 0 0-2.12-2.12L12 9.88 6.34 4.22a1.5 1.5 0 1 0-2.12 2.12L9.88 12l-5.66 5.66a1.5 1.5 0 0 0 2.12 2.12L12 14.12l5.66 5.66Z"></path>
          </svg>
        </div>
      </div>
    `;
  }

  openVariablePicker(inputWrapper) {
    this.currentInputWrapper = inputWrapper;

    const modal = document.getElementById('variablePickerModal');
    const overlay = document.getElementById('variablePickerOverlay');
    const list = document.getElementById('variablePickerList');

    if (!modal || !list) return;

    // 生成变量列表
    list.innerHTML = this.generateVariablePickerList();

    // 显示弹窗
    modal.style.display = 'flex';

    // 绑定关闭事件
    if (overlay) {
      overlay.onclick = () => {
        modal.style.display = 'none';
      };
    }
  }

  generateVariablePickerList() {
    let html = '';

    this.nodes.forEach(node => {
      if (node.type === NodeTypes.END) return;

      const config = this.nodeConfigs[node.id] || {};
      let variables = [];

      if (node.type === NodeTypes.START) {
        variables = Object.keys(config.inputs || {});
      } else if (node.type === NodeTypes.LLM) {
        variables = ['output', 'reasoning_content'];
      } else if (node.type === NodeTypes.TOOL) {
        variables = Object.keys(config.outputs || {});
      }

      if (variables.length === 0) return;

      const nodeType = NodeTypes.getByType(node.type);
      const escapedNodeName = this.escapeHtml(node.name);

      const variablesHtml = variables.map(varName => {
        const escapedVarName = this.escapeHtml(varName);
        return `
          <div class="variable-picker-item" data-node-id="${node.id}" data-var-name="${varName}">
            <div class="variable-picker-item-icon">${nodeType.icon}</div>
            <div class="variable-picker-item-content">
              <span class="variable-picker-item-node-name">${escapedNodeName}</span>
              <span class="variable-picker-item-var-name">${escapedVarName}</span>
            </div>
          </div>
        `;
      }).join('');

      html += `
        <div class="variable-picker-group">
          <div class="variable-picker-group-title">${nodeType.icon} ${escapedNodeName}</div>
          ${variablesHtml}
        </div>
      `;
    });

    if (!html) {
      html = '<div style="padding: 20px; text-align: center; color: var(--color-text-muted);">暂无可用变量</div>';
    }

    return html;
  }

  selectVariable(nodeId, varName) {
    if (!this.currentInputWrapper) return;

    const ref = {
      nodeId,
      varName,
      full: `${nodeId}.${varName}`
    };

    this.currentInputWrapper.innerHTML = this.renderVariableRefTag(ref);

    // 关闭弹窗
    const modal = document.getElementById('variablePickerModal');
    if (modal) {
      modal.style.display = 'none';
    }

    this.currentInputWrapper = null;
  }

  bindVariableFormEvents(section, withType = false, withRef = false) {
    // 添加输入变量按钮
    const addInputBtn = document.getElementById('panelAddInputBtn');
    if (addInputBtn) {
      // 移除旧的事件监听器（如果有）
      const newBtn = addInputBtn.cloneNode(true);
      addInputBtn.parentNode.replaceChild(newBtn, addInputBtn);

      newBtn.addEventListener('click', () => {
        const container = document.getElementById('panelInputParams');
        if (container) {
          const varItem = this.createInputVariableItem('', '', 'String', false, withType, withRef);
          container.appendChild(varItem);
        }
      });
    }

    // 添加输出变量按钮
    const addOutputBtn = document.getElementById('panelAddOutputVarBtn');
    if (addOutputBtn) {
      const newOutputBtn = addOutputBtn.cloneNode(true);
      addOutputBtn.parentNode.replaceChild(newOutputBtn, addOutputBtn);

      newOutputBtn.addEventListener('click', () => {
        const container = document.getElementById('panelOutputVars');
        if (container) {
          const varItem = this.createInputVariableItem('', '', '', false, false, false, true);
          container.appendChild(varItem);
        }
      });
    }
  }

  saveNodeConfig() {
    if (!this.selectedNodeId) return;

    const node = this.nodes.find(n => n.id === this.selectedNodeId);
    if (!node) return;

    const config = this.getConfigFromForm(node.type);
    this.nodeConfigs[this.selectedNodeId] = config;

    // 显示保存成功提示
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = '配置已保存';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  getConfigFromForm(nodeType) {
    const config = {};

    switch (nodeType) {
      case NodeTypes.START:
        config.inputs = this.getInputVariablesFromForm(true);
        break;
      case NodeTypes.LLM:
        config.modelId = document.getElementById('panelModelId')?.value || '';
        config.systemPrompt = document.getElementById('panelSystemPrompt')?.value || '';
        config.userPrompt = document.getElementById('panelUserPrompt')?.value || '';
        config.inputs = this.getInputVariablesFromForm(false, true); // withRef = true
        config.temperature = parseFloat(document.getElementById('panelTemperature')?.value) || 0.7;
        config.maxTokens = parseInt(document.getElementById('panelMaxTokens')?.value) || 2000;
        config.outputFormat = document.querySelector('input[name="outputFormat"]:checked')?.value || 'text';
        break;
      case NodeTypes.TOOL:
        config.toolId = document.getElementById('toolSelect')?.value || '';
        config.outputKey = document.getElementById('toolOutputKey')?.value || '';
        config.params = this.getToolParamsFromForm();
        break;
      case NodeTypes.END:
        config.returnText = document.getElementById('panelReturnText')?.value || '';
        config.outputs = this.getOutputVariablesFromForm();
        break;
    }

    return config;
  }

  getInputVariablesFromForm(withType = false, withRef = false) {
    const inputs = {};
    document.querySelectorAll('#panelInputParams .var-item').forEach(item => {
      const key = item.querySelector('.var-key')?.value.trim();
      if (!key) return;

      if (withType) {
        const type = item.querySelector('.var-type')?.value || 'String';
        const required = item.querySelector('.var-required')?.checked || false;
        inputs[key] = { type, required };
      } else if (withRef) {
        // 从变量引用标签中提取值
        const tag = item.querySelector('.var-ref-tag');
        if (tag) {
          const nodeName = tag.querySelector('.var-ref-tag-node-name')?.textContent;
          const varName = tag.querySelector('.var-ref-tag-var-name')?.textContent;
          const node = this.nodes.find(n => n.name === nodeName);
          if (node) {
            inputs[key] = `{{${node.id}.${varName}}}`;
          }
        } else {
          inputs[key] = '';
        }
      } else {
        const value = item.querySelector('.var-value')?.value.trim();
        inputs[key] = value;
      }
    });
    return inputs;
  }

  getOutputVariablesFromForm() {
    const outputs = {};
    document.querySelectorAll('#panelOutputVars .var-item').forEach(item => {
      const key = item.querySelector('.var-key')?.value.trim();
      if (!key) return;

      // 检查是否有变量引用标签
      const tag = item.querySelector('.var-ref-tag');
      if (tag) {
        // 从变量引用标签中提取值
        const nodeName = tag.querySelector('.var-ref-tag-node-name')?.textContent;
        const varName = tag.querySelector('.var-ref-tag-var-name')?.textContent;
        const node = this.nodes.find(n => n.name === nodeName);
        if (node) {
          outputs[key] = `{{${node.id}.${varName}}}`;
        }
      } else {
        // 普通值
        const value = item.querySelector('.var-value')?.value.trim();
        outputs[key] = value;
      }
    });
    return outputs;
  }

  renderOutputVariables(outputs) {
    const container = document.getElementById('panelOutputVars');
    if (!container) return;

    container.innerHTML = '';

    Object.entries(outputs).forEach(([key, value]) => {
      // 判断是否是变量引用
      const refValue = this.parseVariableReference(value);
      if (refValue) {
        // 变量引用
        const varItem = this.createInputVariableItem(
          key,
          value,
          '',
          false,
          false,
          true,
          true
        );
        container.appendChild(varItem);
      } else {
        // 普通值
        const varItem = this.createInputVariableItem(
          key,
          value,
          '',
          false,
          false,
          false,
          true
        );
        container.appendChild(varItem);
      }
    });
  }

  bindOutputVariablesEvents() {
    // 添加输出变量按钮
    const addOutputBtn = document.getElementById('panelAddOutputVarBtn');
    if (addOutputBtn) {
      const newOutputBtn = addOutputBtn.cloneNode(true);
      addOutputBtn.parentNode.replaceChild(newOutputBtn, addOutputBtn);

      newOutputBtn.addEventListener('click', () => {
        const container = document.getElementById('panelOutputVars');
        if (container) {
          // 默认支持变量引用
          const varItem = this.createInputVariableItem('', '', '', false, false, true, true);
          container.appendChild(varItem);
        }
      });
    }
  }

  getToolParamsFromForm() {
    const params = {};
    document.querySelectorAll('.params-list .param-item').forEach(item => {
      const key = item.querySelector('.param-key')?.value.trim();
      const value = item.querySelector('.param-value')?.value.trim();
      if (key) {
        params[key] = value;
      }
    });
    return params;
  }

  showNodeTypeSelector() {
    // 显示侧边栏面板，并显示节点类型选择区域
    if (this.elements.sidePanel) {
      this.elements.sidePanel.style.display = 'block';

      // 隐藏所有配置区域
      const allSections = this.elements.sidePanel.querySelectorAll('.panel-section');
      allSections.forEach(section => {
        section.style.display = 'none';
      });

      // 显示节点类型选择区域
      if (this.elements.nodeTypeSection) {
        this.elements.nodeTypeSection.style.display = 'block';
      }

      // 更新面板标题
      if (this.elements.panelTitle) {
        this.elements.panelTitle.textContent = '添加节点';
      }
    }
  }

  addNodeByType(type) {
    const nodeType = NodeTypes.getByType(type);
    if (!nodeType) return;

    // 计算节点位置（避免重叠）
    const x = 100 + this.nodes.length * 50;
    const y = 100 + this.nodes.length * 50;

    const node = {
      id: 'node-' + Date.now(),
      type: type,
      name: nodeType.name,
      x: x,
      y: y
    };

    this.nodes.push(node);
    this.renderNode(node);
    this.updateEmptyState();

    // 自动打开配置面板
    this.showNodeConfigPanel(node.id);
  }

  deleteNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);

    // 不允许删除开始和结束节点
    if (node && (NodeTypes.isStart(node.type) || NodeTypes.isEnd(node.type))) {
      alert('开始节点和结束节点不能删除');
      return;
    }

    if (!confirm('确定删除此节点吗？')) return;

    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (nodeEl) {
      nodeEl.remove();
    }

    this.lines = this.lines.filter(l => {
      const conn = this.connections.find(c => c.id === l.id);
      if (conn && (conn.from === nodeId || conn.to === nodeId)) {
        l.line.remove();
        return false;
      }
      return true;
    });

    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);

    if (this.selectedNodeId === nodeId) {
      this.hideNodeConfigPanel();
    }

    this.updateEmptyState();
  }

  async saveFlow() {
    try {
      // 保存当前编辑的节点配置
      if (this.selectedNodeId) {
        this.saveNodeConfig();
      }

      const flowData = {
        id: this.flowId,
        name: this.flowData?.name || '未命名流程',
        nodes: this.nodes,
        connections: this.connections,
        nodeConfigs: this.nodeConfigs,
        mode: 'flow-designer'
      };

      const response = await chrome.runtime.sendMessage({
        action: 'saveFlow',
        flow: flowData
      });

      if (response && response.id) {
        this.flowId = response.id;
        this.updateUI();
        this.showToast('保存成功', 'success');
      } else {
        this.showToast('保存失败', 'error');
      }
    } catch (error) {
      console.error('保存流程失败:', error);
      this.showToast('保存失败: ' + error.message, 'error');
    }
  }

  async testRun() {
    // 保存当前配置
    if (this.selectedNodeId) {
      this.saveNodeConfig();
    }

    const flowData = {
      nodes: this.nodes,
      connections: this.connections,
      nodeConfigs: this.nodeConfigs
    };

    const runner = new FlowRunner(flowData);

    // 清空控制台
    if (this.elements.consoleOutput) {
      this.elements.consoleOutput.innerHTML = '';
      this.addConsoleLog('开始执行流程...', 'info');
    }

    try {
      const result = await runner.run();

      if (result.success) {
        this.addConsoleLog('流程执行成功！', 'success');
        this.addConsoleLog('执行上下文:', 'info');
        this.addConsoleLog(JSON.stringify(result.context, null, 2), 'code');
      } else {
        this.addConsoleLog('流程执行失败: ' + result.error, 'error');
      }
    } catch (error) {
      this.addConsoleLog('执行错误: ' + error.message, 'error');
    }
  }

  addConsoleLog(message, type = 'info') {
    if (!this.elements.consoleOutput) return;

    const logLine = document.createElement('div');
    logLine.className = `console-line console-${type}`;
    logLine.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.elements.consoleOutput.appendChild(logLine);
    this.elements.consoleOutput.scrollTop = this.elements.consoleOutput.scrollHeight;
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  onCanvasMouseDown(e) {
    if (e.target.classList.contains('node-port')) {
      return;
    }

    const nodeEl = e.target.closest('.node');
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

        this.updateNodeConnections(node.id);
      }
    }

    if (this.dragState.isConnecting) {
      this.updateTempLine(e);
    }
  }

  onCanvasMouseUp(e) {
    if (this.dragState.isConnecting) {
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
      this.dragState.tempLine = null;
    }
  }

  onPortMouseUp(e, nodeId, portType) {
    if (this.dragState.isConnecting && portType === 'in') {
      e.stopPropagation();
      e.preventDefault();

      const fromNode = this.dragState.connectingFrom;
      const toNode = nodeId;

      if (this.dragState.tempLine) {
        if (this.dragState.tempLine.svg) {
          this.dragState.tempLine.svg.remove();
        } else if (this.dragState.tempLine.remove) {
          this.dragState.tempLine.remove();
        }
        this.dragState.tempLine = null;
      }

      if (fromNode && toNode && fromNode !== toNode) {
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

    const canvasRect = this.elements.canvas.getBoundingClientRect();
    const scrollLeft = this.elements.canvas.scrollLeft;
    const scrollTop = this.elements.canvas.scrollTop;

    const mouseX = e.clientX - canvasRect.left + scrollLeft;
    const mouseY = e.clientY - canvasRect.top + scrollTop;

    const portRect = this.dragState.startPort.getBoundingClientRect();
    const startX = portRect.left - canvasRect.left + scrollLeft + portRect.width / 2;
    const startY = portRect.top - canvasRect.top + scrollTop + portRect.height / 2;

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

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const deltaX = mouseX - startX;
    const controlOffset = Math.max(Math.abs(deltaX) * 0.5, 50);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${mouseX - controlOffset} ${mouseY}, ${mouseX} ${mouseY}`;

    path.setAttribute('d', d);
    path.setAttribute('stroke', '#3B82F6');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '8,4');
    path.setAttribute('marker-end', 'url(#arrowhead)');

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
      polygon.setAttribute('fill', '#3B82F6');

      marker.appendChild(polygon);
      defs.appendChild(marker);
    }

    svg.appendChild(path);
    this.dragState.tempLine = { svg, path };
  }

  updateUI() {
    if (this.elements.flowIdDisplay) {
      this.elements.flowIdDisplay.textContent = this.flowId || '新流程';
    }
  }

  showEmptyState() {
    if (this.elements.emptyState) {
      this.elements.emptyState.style.display = 'flex';
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
    const nodes = this.elements.canvas.querySelectorAll('.node');
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
    const relatedLines = this.lines.filter(l => {
      const conn = this.connections.find(c => c.id === l.id);
      return conn && (conn.from === nodeId || conn.to === nodeId);
    });

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

// ==================== 初始化 ====================
const page = new FlowDesignerPage();
window.addEventListener('DOMContentLoaded', () => page.init());
