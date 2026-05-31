class FlowDesignerApp {
  constructor(canvasId, canvasController) {
    this.canvasId = canvasId;
    this.canvasController = canvasController || null;
    this.nodes = [];
    this.edges = [];
    this.selectedNodeId = null;
    this.panelVisible = false;
    this.variablePickerVisible = false;
    this.currentVariableInput = null;
    this.currentNodeIdForVar = null;
    this.testRunLocked = false;
    this.connectionManager = null;
    this.models = [];
    this.init();
  }

  async init() {
    await this.loadFlowData();
    this.ensureDefaultNodes();
    this.saveFlowData();
    this.connectionManager = new ConnectionManager(this.canvasId, this, this.canvasController);
    this.syncEdgesToConnections();
    await this.loadModels();
    this.bindEvents();
    this.bindChromeMessages();
    this.render();
  }

  async loadModels() {
    try {
      const models = await chrome.runtime.sendMessage({ action: 'getModels' });
      this.models = models || [];
    } catch (error) {
      console.error('加载模型列表失败:', error);
    }
  }

  syncEdgesToConnections() {
    if (!this.connectionManager) return;
    this.edges.forEach(e => {
      if (!this.connectionManager.connections.some(c => c.id === e.id)) {
        this.connectionManager.connections.push({
          id: e.id,
          source: e.source,
          target: e.target,
          sourcePort: 'output',
          targetPort: 'input',
        });
      }
    });
  }

  createDefaultWorkflow() {
    const startNode = {
      id: 'start', type: StandardNodeType.Start,
      position: { x: 80, y: 280 },
      data: {
        title: '开始',
        description: '流程的起始点',
        outputs: [{ key: 'user_input', name: 'input', type: 'string' }],
        nodeMeta: { title: '开始', description: '流程的起始点', icon: '/nodes/start.svg', mainColor: '#52C41A' },
      },
    };
    const endNode = {
      id: 'end', type: StandardNodeType.End,
      position: { x: 1240, y: 280 },
      data: {
        title: '结束', description: '流程的终止点',
        inputs: { terminatePlan: 'return_variables', content: '', inputParameters: [], streamingOutput: false },
        nodeMeta: { title: '结束', description: '流程的终止点', icon: '/nodes/end.svg', mainColor: '#FF4D4F' },
      },
    };
    const analystNode = {
      id: 'analyst', type: StandardNodeType.LLM,
      position: { x: 360, y: 230 },
      data: {
        title: '分析师', description: '调用大语言模型', batchMode: BatchMode.Single,
        model: { modelType: '豆包·1.8·深度思考' },
        $$input_decorator$$: { inputParameters: [{ name: 'input', input: createValueExpression('') }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } },
        $$prompt_decorator$$: { systemPrompt: '', prompt: '' },
        batch: { batchSize: 10 }, fcParam: [],
        outputs: [{ key: 'output', name: 'output', type: 'string' }, { key: 'reasoning_content', name: 'reasoning_content', type: 'string' }],
        nodeMeta: { title: '分析师', description: '调用大语言模型', icon: '/nodes/llm.svg', mainColor: '#1890FF' },
      },
    };
    const coder1Node = {
      id: 'coder1', type: StandardNodeType.LLM,
      position: { x: 640, y: 120 },
      data: {
        title: '编程助手1', description: '调用大语言模型', batchMode: BatchMode.Single,
        model: { modelType: '豆包·1.8·深度思考' },
        $$input_decorator$$: { inputParameters: [{ name: 'input', input: createValueExpression('') }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } },
        $$prompt_decorator$$: { systemPrompt: '', prompt: '' },
        batch: { batchSize: 10 }, fcParam: [],
        outputs: [{ key: 'output', name: 'output', type: 'string' }, { key: 'reasoning_content', name: 'reasoning_content', type: 'string' }],
        nodeMeta: { title: '编程助手1', description: '调用大语言模型', icon: '/nodes/llm.svg', mainColor: '#1890FF' },
      },
    };
    const coder1_1Node = {
      id: 'coder1_1', type: StandardNodeType.LLM,
      position: { x: 640, y: 380 },
      data: {
        title: '编程助手1_1', description: '调用大语言模型', batchMode: BatchMode.Single,
        model: { modelType: '豆包·1.8·深度思考' },
        $$input_decorator$$: { inputParameters: [{ name: 'input', input: createValueExpression('') }], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } },
        $$prompt_decorator$$: { systemPrompt: '', prompt: '' },
        batch: { batchSize: 10 }, fcParam: [],
        outputs: [{ key: 'output', name: 'output', type: 'string' }, { key: 'reasoning_content', name: 'reasoning_content', type: 'string' }],
        nodeMeta: { title: '编程助手1_1', description: '调用大语言模型', icon: '/nodes/llm.svg', mainColor: '#1890FF' },
      },
    };
    const summarizerNode = {
      id: 'summarizer', type: StandardNodeType.LLM,
      position: { x: 940, y: 230 },
      data: {
        title: '汇总师', description: '调用大语言模型', batchMode: BatchMode.Single,
        model: { modelType: '豆包·1.8·深度思考' },
        $$input_decorator$$: { inputParameters: [
          { name: 'origin1', input: createValueExpression('') },
          { name: 'analysis', input: createValueExpression('') },
          { name: 'answer1', input: createValueExpression('') },
          { name: 'answer2', input: createValueExpression('') },
        ], chatHistorySetting: { enableChatHistory: false, chatHistoryRound: 5 } },
        $$prompt_decorator$$: { systemPrompt: '', prompt: '' },
        batch: { batchSize: 10 }, fcParam: [],
        outputs: [{ key: 'output', name: 'output', type: 'string' }, { key: 'reasoning_content', name: 'reasoning_content', type: 'string' }],
        nodeMeta: { title: '汇总师', description: '调用大语言模型', icon: '/nodes/llm.svg', mainColor: '#1890FF' },
      },
    };
    this.nodes = [startNode, analystNode, coder1Node, coder1_1Node, summarizerNode, endNode];
    this.edges = [
      { id: 'e1', source: 'start', target: 'analyst' },
      { id: 'e2', source: 'analyst', target: 'coder1' },
      { id: 'e3', source: 'analyst', target: 'coder1_1' },
      { id: 'e4', source: 'coder1', target: 'summarizer' },
      { id: 'e5', source: 'coder1_1', target: 'summarizer' },
      { id: 'e6', source: 'summarizer', target: 'end' },
    ];
  }

  ensureDefaultNodes() {
    const hasStart = this.nodes.find(n => n.type === StandardNodeType.Start);
    const hasEnd = this.nodes.find(n => n.type === StandardNodeType.End);
    if (!hasStart) this.nodes.push(createDefaultStartNode());
    if (!hasEnd) this.nodes.push(createDefaultEndNode());
  }

  addNode(nodeType, position) {
    const id = `node_${Date.now()}`;
    let node;
    switch (nodeType) {
      case StandardNodeType.LLM: node = createLLMNode(id, position); break;
      case StandardNodeType.Loop: node = createLoopNode(id, position); break;
      case StandardNodeType.Http: node = createHttpNode(id, position); break;
      case StandardNodeType.Code: node = createCodeNode(id, position); break;
      case StandardNodeType.If: node = createIfNode(id, position); break;
      default: return null;
    }
    if (node) {
      this.nodes.push(node);
      this.saveFlowData();
      this.render();
    }
    return node;
  }

  deleteNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return false;
    
    if (this.connectionManager) this.connectionManager.deleteNodeConnections(nodeId);
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    if (this.selectedNodeId === nodeId) this.closePanel();
    this.saveFlowData();
    this.render();
    return true;
  }

  addEdge(sourceId, targetId) {
    if (this.edges.some(e => e.source === sourceId && e.target === targetId)) return false;
    this.edges.push({ id: `edge_${Date.now()}`, source: sourceId, target: targetId });
    this.saveFlowData();
    this.render();
    return true;
  }

  deleteEdge(edgeId) {
    this.edges = this.edges.filter(e => e.id !== edgeId);
    this.saveFlowData();
    this.render();
  }

  selectNode(nodeId) {
    if (this.testRunLocked) return;
    this.selectedNodeId = nodeId;
    this.panelVisible = true;

    const existingTestPanel = document.getElementById('node-test-panel');
    if (existingTestPanel) {
      this.closeNodeTestPanel();
    }

    this.render();
    this.renderPanel();
  }

  closePanel() {
    if (this.testRunLocked) return;
    this.selectedNodeId = null;
    this.panelVisible = false;
    const panel = document.getElementById('config-panel');
    if (panel) panel.style.display = 'none';
    this.render();
  }

  // ===== Node Test Panel =====
  openNodeTestPanel(nodeId) {
    if (this.testRunLocked) return;
    this.testNodeId = nodeId;
    this.selectNode(nodeId);
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const panel = document.getElementById('config-panel');
    if (!panel) return;

    const testPanelHtml = this.renderNodeTestPanel(node);
    const existingTestPanel = document.getElementById('node-test-panel');
    if (existingTestPanel) {
      existingTestPanel.remove();
    }

    const testPanel = document.createElement('div');
    testPanel.id = 'node-test-panel';
    testPanel.className = 'node-test-panel';
    testPanel.innerHTML = testPanelHtml;

    panel.appendChild(testPanel);

    const panelHeader = panel.querySelector('.config-panel-header');
    const panelBody = panel.querySelector('.config-panel-body');
    if (panelHeader) panelHeader.style.display = 'none';
    if (panelBody) panelBody.style.display = 'none';

    this.bindTestPanelEvents(nodeId);
  }

  closeNodeTestPanel() {
    const testPanel = document.getElementById('node-test-panel');
    if (testPanel) {
      testPanel.remove();
    }

    const panel = document.getElementById('config-panel');
    if (panel) {
      const panelHeader = panel.querySelector('.config-panel-header');
      const panelBody = panel.querySelector('.config-panel-body');
      if (panelHeader) panelHeader.style.display = '';
      if (panelBody) panelBody.style.display = '';
      if (!this.selectedNodeId) {
        panel.style.display = 'none';
      }
    }
    this.testNodeId = null;

    if (this.testRunLocked) {
      this.testRunLocked = false;
      const runBtn = document.getElementById('btn-test-run');
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 3L13 8L4 13V3Z" fill="currentColor"/></svg> 试运行';
      }
    }
  }

  renderNodeTestPanel(node) {
    const inputParams = node.data?.$$input_decorator$$?.inputParameters || [];
    const inputRows = inputParams.map((p, i) => `
      <div class="test-input-row">
        <div class="test-input-label">
          <strong>${this.escHtml(p.name)}</strong>
          <span class="test-input-type">String</span>
        </div>
        <textarea class="test-input-textarea" data-idx="${i}" placeholder="输入${this.escHtml(p.name)}的值" rows="3"></textarea>
      </div>
    `).join('');

    return `
      <div class="test-panel-header">
        <svg class="test-panel-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M4.56643 3.15225L4.56652 3.15234L6.00166 4.58748L7.05035 5.63617L8.46457 7.05039L7.05035 8.4646L5.63614 7.05039L4.58758 6.00183L3.15231 4.56655C2.72492 5.1391 2.39787 5.76287 2.17114 6.41381C1.32731 8.8365 1.87321 11.6356 3.80885 13.5712C5.66617 15.4286 8.31851 16.0063 10.6705 15.3046L16.8743 21.5084C17.6554 22.2895 18.9217 22.2895 19.7028 21.5084L21.5091 19.7021C22.2901 18.9211 22.2901 17.6548 21.5091 16.8737L15.3052 10.6698C16.0069 8.31788 15.4292 5.66555 13.5719 3.80824C11.636 1.87235 8.83637 1.32655 6.41347 2.17086C5.76259 2.39767 5.13889 2.7248 4.56643 3.15225ZM8.068 3.82539L9.87878 5.63617L11.293 7.05039L9.87878 8.4646L8.46457 9.87881L7.05036 11.293L5.63614 9.87881L3.82586 8.06853C3.64175 9.52153 4.10781 11.0418 5.22306 12.157C6.54037 13.4743 8.42246 13.8882 10.0986 13.3881L11.2414 13.0471L12.0847 13.8903L18.2886 20.0942L20.0949 18.2879L13.891 12.084L13.0477 11.2408L13.3887 10.098C13.8888 8.42183 13.4749 6.53976 12.1576 5.22245C11.0421 4.10691 9.52135 3.6409 8.068 3.82539Z"></path>
        </svg>
        <span class="test-panel-title">试运行</span>
        <div class="test-panel-actions">
          <span class="test-panel-link">查看日志</span>
        </div>
        <button class="test-panel-close" data-action="close-test">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="test-panel-content">
        <div class="test-input-section">
          <div class="test-input-header">
            <div class="test-input-title-wrapper">
              <svg class="test-input-arrow" width="12" height="12" viewBox="0 0 25 24" fill="currentColor">
                <path d="M10.7574 16.8839C10.7591 16.8857 10.7608 16.8874 10.7625 16.8891L11.4696 17.5962C11.6405 17.767 11.8578 17.8631 12.0809 17.8845C12.1855 17.8945 12.2913 17.8881 12.3943 17.8653C12.5737 17.8255 12.7443 17.7358 12.8839 17.5962L13.591 16.8891C13.5927 16.8874 13.5944 16.8857 13.596 16.884L19.9549 10.5251C20.3454 10.1346 20.3454 9.50143 19.9549 9.1109L19.2478 8.4038C18.8573 8.01327 18.2241 8.01327 17.8336 8.4038L12.1768 14.0606L6.51993 8.40379C6.1294 8.01327 5.49624 8.01327 5.10571 8.40379L4.39861 9.1109C4.00808 9.50142 4.00808 10.1346 4.39861 10.5251L10.7574 16.8839Z"></path>
              </svg>
              <span class="test-input-title">试运行输入</span>
            </div>
          </div>
          <div class="test-input-list">
            ${inputRows || '<div class="test-empty">暂无输入变量</div>'}
          </div>
        </div>
        <div class="test-panel-footer">
          <button class="test-run-btn" data-action="execute-test">
            <svg width="14" height="14" viewBox="0 0 25 24" fill="currentColor">
              <path d="M19.5283 11.1341C20.1949 11.519 20.1949 12.4812 19.5283 12.8661L7.8313 19.6194C7.16463 20.0043 6.3313 19.5231 6.3313 18.7533L6.3313 5.24685C6.3313 4.47705 7.16463 3.99593 7.8313 4.38083L19.5283 11.1341Z"></path>
            </svg>
            <span>运行</span>
          </button>
        </div>
        <div class="test-result-section" id="test-result-section" style="display:none;">
          <div class="test-result-header">
            <span class="test-result-title">运行结果</span>
          </div>
          <div class="test-result-content" id="test-result-content"></div>
        </div>
      </div>
    `;
  }

  bindTestPanelEvents(nodeId) {
    const testPanel = document.getElementById('node-test-panel');
    if (!testPanel) return;

    const closeBtn = testPanel.querySelector('[data-action="close-test"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeNodeTestPanel();
      });
    }

    const runBtn = testPanel.querySelector('[data-action="execute-test"]');
    if (runBtn) {
      runBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.executeFlowTest();
      });
    }
  }

  async executeFlowTest() {
    const testPanel = document.getElementById('node-test-panel');
    if (!testPanel) return;

    const runBtn = testPanel.querySelector('.test-run-btn');
    const resultSection = testPanel.querySelector('#test-result-section');
    const resultContent = testPanel.querySelector('#test-result-content');
    let progressContent = testPanel.querySelector('#test-progress-content');

    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="loading-spinner"></span> 运行中...';
    }
    if (resultSection) {
      resultSection.style.display = 'block';
    }

    if (!progressContent) {
      const progressDiv = document.createElement('div');
      progressDiv.id = 'test-progress-content';
      progressDiv.className = 'test-progress-content';
      resultSection.insertBefore(progressDiv, resultContent);
      progressContent = progressDiv;
    }

    const TIMEOUT_MS = 300000;

    try {
      let response;

      if (this.testNodeId) {
        const node = this.nodes.find(n => n.id === this.testNodeId);
        if (!node) {
          throw new Error('节点不存在');
        }

        const inputParams = node.data?.$$input_decorator$$?.inputParameters || [];
        const inputs = {};
        testPanel.querySelectorAll('.test-input-textarea').forEach((input, i) => {
          if (inputParams[i]) {
            inputs[inputParams[i].name] = input.value;
          }
        });

        response = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'executeSingleNode',
              node: node,
              inputs: inputs
            }, (resp) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (resp?.error) {
                reject(new Error(resp.error));
              } else {
                resolve(resp.result);
              }
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('执行超时（5分钟）')), TIMEOUT_MS)
          )
        ]);

        if (progressContent) {
          progressContent.innerHTML = '<div class="test-progress-complete">✓ 执行完成</div>';
        }

        if (resultContent) {
          if (response.content) {
            resultContent.className = 'test-result-content test-result-success';
            resultContent.innerHTML = `
              <div class="test-result-header-text">节点输出：</div>
              <div class="test-result-final-output">${this.escHtml(response.content)}</div>
            `;
          } else if (response.error) {
            resultContent.className = 'test-result-content test-result-error';
            resultContent.textContent = '执行失败：' + response.error;
          } else {
            resultContent.className = 'test-result-content test-result-error';
            resultContent.textContent = '执行失败：未知错误';
          }
        }
      } else {
        const flowData = {
          nodes: this.nodes,
          edges: this.edges
        };

        const startNode = this.nodes.find(n => n.type === '1');
        const startNodeInputs = {};

        if (startNode && startNode.data?.outputs) {
          const inputs = testPanel.querySelectorAll('.test-input-textarea');
          inputs.forEach(input => {
            const idx = parseInt(input.getAttribute('data-idx'), 10);
            const paramName = startNode.data.outputs[idx]?.name;
            if (paramName) {
              startNodeInputs[paramName] = input.value;
            }
          });
        }

        response = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'testRunFlow',
              flowData,
              startNodeInputs
            }, (resp) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (resp?.error) {
                reject(new Error(resp.error));
              } else {
                resolve(resp);
              }
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('流程执行超时（5分钟）')), TIMEOUT_MS)
          )
        ]);

        if (progressContent) {
          progressContent.innerHTML = '<div class="test-progress-complete">✓ 执行完成</div>';
        }

        if (resultContent) {
          if (response.success && response.result) {
            const { success, finalOutput, nodeResults, executionContext } = response.result;

            if (success) {
              resultContent.className = 'test-result-content test-result-success';
              const sortedResults = [...nodeResults].sort((a, b) => (a.order || 0) - (b.order || 0));
              const totalDuration = sortedResults.reduce((sum, nr) => sum + (nr.duration || 0), 0);
              resultContent.innerHTML = `
                <div class="test-result-header-text">最终输出：</div>
                <div class="test-result-final-output">${this.escHtml(finalOutput)}</div>
                <div class="test-result-node-results">
                  <div class="test-result-header-text">执行详情 (总耗时 ${totalDuration}ms)：</div>
                  ${sortedResults.map(nr => `
                    <div class="test-node-result">
                      <span class="test-node-order">#${nr.order || '?'}</span>
                      <span class="node-name">${this.escHtml(nr.nodeName)}</span>
                      <span class="test-node-duration">${nr.duration || '?'}ms</span>
                      <span class="node-status ${nr.result.success ? 'success' : 'error'}">
                        ${nr.result.success ? '✓' : '✗'}
                      </span>
                      ${nr.result.content ? `<div class="node-output">${this.escHtml(nr.result.content)}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
                ${response.result.executionLog ? `
                <div class="test-execution-log-section">
                  <div class="test-result-header-text test-log-toggle" data-expanded="false">执行日志 ▸</div>
                  <div class="test-execution-log" style="display:none;">
                    ${response.result.executionLog.map(entry => {
                      if (entry.phase === 'start') return `<div class="test-log-entry test-log-phase">▶ ${this.escHtml(entry.message)}</div>`;
                      if (entry.phase === 'end') return `<div class="test-log-entry test-log-phase">■ ${this.escHtml(entry.message)}</div>`;
                      return `<div class="test-log-entry ${entry.success ? '' : 'test-log-error'}">[${entry.order}] ${this.escHtml(entry.nodeName)} ${entry.duration}ms ${entry.success ? '✓' : '✗ ' + this.escHtml(entry.error || '')}</div>`;
                    }).join('')}
                  </div>
                </div>
                ` : ''}
              `;
              const logToggle = resultContent.querySelector('.test-log-toggle');
              const logContainer = resultContent.querySelector('.test-execution-log');
              if (logToggle && logContainer) {
                logToggle.addEventListener('click', () => {
                  const expanded = logToggle.getAttribute('data-expanded') === 'true';
                  logToggle.setAttribute('data-expanded', String(!expanded));
                  logToggle.textContent = expanded ? '执行日志 ▸' : '执行日志 ▾';
                  logContainer.style.display = expanded ? 'none' : 'block';
                });
              }
            } else {
              resultContent.className = 'test-result-content test-result-error';
              const failedNode = nodeResults.find(nr => !nr.result.success);
              resultContent.textContent = `执行失败：${failedNode?.result?.error || '未知错误'}`;
            }
          } else {
            resultContent.className = 'test-result-content test-result-error';
            resultContent.textContent = '执行失败：' + (response.error || '未知错误');
          }
        }
      }
    } catch (error) {
      console.error('[FlowApp] 试运行失败:', error);
      if (progressContent) {
        progressContent.innerHTML = `<div class="test-progress-error">✗ 执行失败</div>`;
      }
      if (resultContent) {
        resultContent.className = 'test-result-content test-result-error';
        resultContent.textContent = '运行失败：' + error.message;
      }
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 25 24" fill="currentColor"><path d="M19.5283 11.1341C20.1949 11.519 20.1949 12.4812 19.5283 12.8661L7.8313 19.6194C7.16463 20.0043 6.3313 19.5231 6.3313 18.7533L6.3313 5.24685C6.3313 4.47705 7.16463 3.99593 7.8313 4.38083L19.5283 11.1341Z"></path></svg><span>运行</span>';
      }
      if (this.testRunLocked) {
        const toolbarBtn = document.getElementById('btn-test-run');
        if (toolbarBtn) {
          toolbarBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 3L13 8L4 13V3Z" fill="currentColor"/></svg> 试运行';
        }
      }
    }
  }

  openFlowTestPanel() {
    if (this.testRunLocked) return;

    const panel = document.getElementById('config-panel');
    if (!panel) return;

    const startNode = this.nodes.find(n => n.type === '1');
    if (!startNode) {
      alert('流程缺少开始节点');
      return;
    }

    const testPanelHtml = this.renderFlowTestPanel(startNode);
    const existingTestPanel = document.getElementById('node-test-panel');
    if (existingTestPanel) {
      existingTestPanel.remove();
    }

    panel.style.display = 'flex';

    const testPanel = document.createElement('div');
    testPanel.id = 'node-test-panel';
    testPanel.className = 'node-test-panel';
    testPanel.innerHTML = testPanelHtml;

    panel.appendChild(testPanel);

    const panelHeader = panel.querySelector('.config-panel-header');
    const panelBody = panel.querySelector('.config-panel-body');
    if (panelHeader) panelHeader.style.display = 'none';
    if (panelBody) panelBody.style.display = 'none';

    this.testRunLocked = true;

    const runBtn = document.getElementById('btn-test-run');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="loading-spinner"></span> 运行中...';
    }

    this.bindFlowTestPanelEvents();
  }

  renderFlowTestPanel(startNode) {
    const inputParams = startNode.data?.outputs || [];
    const inputRows = inputParams.map((p, i) => `
      <div class="test-input-row">
        <div class="test-input-label">
          <strong>${this.escHtml(p.name)}</strong>
          <span class="test-input-type">${p.type || 'String'}</span>
        </div>
        <textarea class="test-input-textarea" data-idx="${i}" placeholder="输入${this.escHtml(p.name)}的值" rows="3"></textarea>
      </div>
    `).join('');

    return `
      <div class="test-panel-header">
        <svg class="test-panel-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M4.56643 3.15225L4.56652 3.15234L6.00166 4.58748L7.05035 5.63617L8.46457 7.05039L7.05035 8.4646L5.63614 7.05039L4.58758 6.00183L3.15231 4.56655C2.72492 5.1391 2.39787 5.76287 2.17114 6.41381C1.32731 8.8365 1.87321 11.6356 3.80885 13.5712C5.66617 15.4286 8.31851 16.0063 10.6705 15.3046L16.8743 21.5084C17.6554 22.2895 18.9217 22.2895 19.7028 21.5084L21.5091 19.7021C22.2901 18.9211 22.2901 17.6548 21.5091 16.8737L15.3052 10.6698C16.0069 8.31788 15.4292 5.66555 13.5719 3.80824C11.636 1.87235 8.83637 1.32655 6.41347 2.17086C5.76259 2.39767 5.13889 2.7248 4.56643 3.15225ZM8.068 3.82539L9.87878 5.63617L11.293 7.05039L9.87878 8.4646L8.46457 9.87881L7.05036 11.293L5.63614 9.87881L3.82586 8.06853C3.64175 9.52153 4.10781 11.0418 5.22306 12.157C6.54037 13.4743 8.42246 13.8882 10.0986 13.3881L11.2414 13.0471L12.0847 13.8903L18.2886 20.0942L20.0949 18.2879L13.891 12.084L13.0477 11.2408L13.3887 10.098C13.8888 8.42183 13.4749 6.53976 12.1576 5.22245C11.0421 4.10691 9.52135 3.6409 8.068 3.82539Z"></path>
        </svg>
        <span class="test-panel-title">流程试运行</span>
        <div class="test-panel-actions">
          <span class="test-panel-link">查看日志</span>
        </div>
        <button class="test-panel-close" data-action="close-test">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="test-panel-content">
        <div class="test-input-section">
          <div class="test-input-header">
            <div class="test-input-title-wrapper">
              <svg class="test-input-arrow" width="12" height="12" viewBox="0 0 25 24" fill="currentColor">
                <path d="M10.7574 16.8839C10.7591 16.8857 10.7608 16.8874 10.7625 16.8891L11.4696 17.5962C11.6405 17.767 11.8578 17.8631 12.0809 17.8845C12.1855 17.8945 12.2913 17.8881 12.3943 17.8653C12.5737 17.8255 12.7443 17.7358 12.8839 17.5962L13.591 16.8891C13.5927 16.8874 13.5944 16.8857 13.596 16.884L19.9549 10.5251C20.3454 10.1346 20.3454 9.50143 19.9549 9.1109L19.2478 8.4038C18.8573 8.01327 18.2241 8.01327 17.8336 8.4038L12.1768 14.0606L6.51993 8.40379C6.1294 8.01327 5.49624 8.01327 5.10571 8.40379L4.39861 9.1109C4.00808 9.50142 4.00808 10.1346 4.39861 10.5251L10.7574 16.8839Z"></path>
              </svg>
              <span class="test-input-title">试运行输入</span>
            </div>
          </div>
          <div class="test-input-list">
            ${inputRows || '<div class="test-empty">暂无输入变量</div>'}
          </div>
        </div>
        <div class="test-panel-footer">
          <button class="test-run-btn" data-action="execute-test">
            <svg width="14" height="14" viewBox="0 0 25 24" fill="currentColor">
              <path d="M19.5283 11.1341C20.1949 11.519 20.1949 12.4812 19.5283 12.8661L7.8313 19.6194C7.16463 20.0043 6.3313 19.5231 6.3313 18.7533L6.3313 5.24685C6.3313 4.47705 7.16463 3.99593 7.83164 4.38083L19.5283 11.1341Z"></path>
            </svg>
            <span>运行</span>
          </button>
        </div>
        <div class="test-result-section" id="test-result-section" style="display:none;">
          <div class="test-result-header">
            <span class="test-result-title">运行结果</span>
          </div>
          <div class="test-result-content" id="test-result-content"></div>
        </div>
      </div>
    `;
  }

  bindFlowTestPanelEvents() {
    const testPanel = document.getElementById('node-test-panel');
    if (!testPanel) return;

    const closeBtn = testPanel.querySelector('[data-action="close-test"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeNodeTestPanel();
      });
    }

    const runBtn = testPanel.querySelector('[data-action="execute-test"]');
    if (runBtn) {
      runBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.executeFlowTest();
      });
    }
  }

  // ===== Variable Picker =====
  openVariablePicker(inputElement, nodeId) {
    this.variablePickerVisible = true;
    this.currentVariableInput = inputElement;
    this.currentNodeIdForVar = nodeId;
    const vars = getAllAvailableVariables(this.nodes, this.edges, nodeId);
    this.renderVariablePicker(vars);
  }

  closeVariablePicker() {
    this.variablePickerVisible = false;
    this.currentVariableInput = null;
    this.currentNodeIdForVar = null;
    const dialog = document.getElementById('variable-picker-dialog');
    if (dialog) dialog.style.display = 'none';
  }

  selectVariable(nodeId, varName) {
    if (this.currentVariableInput) {
      const node = this.nodes.find(n => n.id === nodeId);
      const displayName = (node && node.data?.title) ? node.data.title : nodeId;
      this.currentVariableInput.value = `{{${displayName}.${varName}}}`;
      this.currentVariableInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.closeVariablePicker();
  }

  // ===== Data persistence =====
  getStorageKey() {
    const urlParams = new URLSearchParams(window.location.search);
    const expertId = urlParams.get('expertId');
    return expertId ? `flowDesignerData_${expertId}` : 'flowDesignerData';
  }

  getExpertId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('expertId');
  }

  saveFlowData() {
    localStorage.setItem(this.getStorageKey(), JSON.stringify({ nodes: this.nodes, edges: this.edges }));

    // 同步到专家数据（后台执行，不阻塞）
    const expertId = this.getExpertId();
    if (expertId) {
      chrome.runtime.sendMessage({
        action: 'updateExpert',
        expertId: expertId,
        data: {
          nodes: this.nodes,
          connections: this.edges
        }
      }).then(() => {
        console.log('[FlowDesigner] 已同步节点数据到专家:', expertId);
      }).catch(error => {
        console.error('[FlowDesigner] 同步到专家失败:', error);
      });
    }
  }

  async loadFlowData() {
    const expertId = this.getExpertId();

    // 优先从专家数据加载
    if (expertId) {
      try {
        const expert = await chrome.runtime.sendMessage({
          action: 'getExpertById',
          expertId: expertId
        });

        if (expert && expert.nodes && expert.nodes.length > 0) {
          this.nodes = expert.nodes || [];
          this.edges = expert.connections || [];
          console.log('[FlowDesigner] 从专家数据加载节点:', this.nodes.length);
          return;
        }
      } catch (error) {
        console.error('[FlowDesigner] 加载专家数据失败:', error);
      }
    }

    // 回退到 localStorage
    const data = localStorage.getItem(this.getStorageKey());
    if (data) {
      try {
        const p = JSON.parse(data);
        this.nodes = p.nodes || [];
        this.edges = p.edges || [];
      } catch (e) {
        console.error('Load failed:', e);
      }
    }
  }

  clearFlowData() {
    if (confirm('确定清空所有数据？')) {
      this.nodes = [];
      this.edges = [];
      this.ensureDefaultNodes();
      this.saveFlowData();
      this.render();
    }
  }

  exportFlowData() {
    const blob = new Blob([JSON.stringify({ nodes: this.nodes, edges: this.edges }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flow_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  importFlowData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const p = JSON.parse(e.target.result);
        this.nodes = p.nodes || [];
        this.edges = p.edges || [];
        this.ensureDefaultNodes();
        this.saveFlowData();
        this.render();
        alert('导入成功');
      } catch (err) { alert('导入失败'); }
    };
    reader.readAsText(file);
  }

  // ===== Rendering =====
  render() {
    this.renderNodes();
    document.getElementById('select-count').textContent = `已选中 ${this.selectedNodeId ? 1 : 0} 个节点`;
  }

  renderNodes() {
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) return;
    const svg = canvas.querySelector('.connections-svg');
    canvas.innerHTML = '';
    if (svg) canvas.appendChild(svg);

    this.nodes.forEach(node => {
      const el = this.createNodeElement(node);
      canvas.appendChild(el);
      if (this.connectionManager) this.connectionManager.renderPorts(node);
    });

    if (this.connectionManager) this.connectionManager.renderConnections();
  }

  getNodeCSSClass(nodeType) {
    const map = {
      [StandardNodeType.Start]: 'start',
      [StandardNodeType.End]: 'end',
      [StandardNodeType.LLM]: 'llm',
      [StandardNodeType.Code]: 'code',
      [StandardNodeType.Http]: 'http',
      [StandardNodeType.Loop]: 'loop',
      [StandardNodeType.If]: 'ifelse',
    };
    return map[nodeType] || '';
  }

  getNodeSVGIcon(nodeType) {
    const icons = {
      [StandardNodeType.Start]: '<img src="https://lf3-static.bytednsdoc.com/obj/eden-cn/dvsmryvd_avi_dvsm/ljhwZthlaukjlkulzlp/icon/icon-Start-v2.jpg" alt="" style="width:18px;height:18px;border-radius:50%;object-fit:cover;" />',
      [StandardNodeType.End]: '<img src="https://lf3-static.bytednsdoc.com/obj/eden-cn/dvsmryvd_avi_dvsm/ljhwZthlaukjlkulzlp/icon/icon-End-v2.jpg" alt="" style="width:18px;height:18px;border-radius:50%;object-fit:cover;" />',
      [StandardNodeType.LLM]: '<img src="https://lf3-static.bytednsdoc.com/obj/eden-cn/dvsmryvd_avi_dvsm/ljhwZthlaukjlkulzlp/icon/icon-LLM-v2.jpg" alt="" style="width:18px;height:18px;border-radius:50%;object-fit:cover;" />',
      [StandardNodeType.Code]: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3" width="11" height="10" rx="2" fill="#FEF9C3"/><rect x="2.5" y="3" width="11" height="10" rx="2" stroke="#CA8A04" stroke-width="1.1"/><path d="M5.5 6.5L7.5 8.5L5.5 10.5" stroke="#CA8A04" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 6.5L8.5 8.5L10.5 10.5" stroke="#CA8A04" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
    return icons[nodeType] || '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="3" fill="#F3F4F6"/><rect x="2.5" y="2.5" width="11" height="11" rx="3" stroke="#9CA3AF" stroke-width="1.1"/></svg>';
  }

  createNodeElement(node) {
    const info = NODE_TEMPLATE_INFO[node.type] || {};
    const title = node.data?.title || info.name || 'Node';
    const cssClass = this.getNodeCSSClass(node.type);
    const isSelected = this.selectedNodeId === node.id;

    const el = document.createElement('div');
    el.className = `flow-node${isSelected ? ' selected' : ''}`;
    el.id = node.id;
    el.style.left = `${node.position.x}px`;
    el.style.top = `${node.position.y}px`;

    let headerContent = this.getNodeSVGIcon(node.type);
    let badgeHtml = '';
    let bodyHtml = '';
    const isDeletable = !(info && info.deleteDisable);
    const showActions = !(info && info.deleteDisable && info.copyDisable);

    if (node.type === StandardNodeType.Start) {
      bodyHtml = this.renderStartNodeBody(node);
    } else if (node.type === StandardNodeType.End) {
      bodyHtml = this.renderEndNodeBody(node);
    } else if (node.type === StandardNodeType.LLM) {
      bodyHtml = this.renderLLMNodeBody(node);
    } else if (node.type === StandardNodeType.Code) {
      bodyHtml = this.renderCodeNodeBody(node);
    } else if (node.type === StandardNodeType.Http) {
      bodyHtml = this.renderHttpNodeBody(node);
    } else {
      bodyHtml = '<div class="node-section"><div class="node-section-label">信息</div><div class="node-section-value" style="font-size:11px;color:#6B7280;">' + (info.description || '') + '</div></div>';
    }

    const runBtnHtml = (node.type === StandardNodeType.LLM)
      ? `<button class="node-action-btn node-run-btn" data-action="run-node" title="运行此节点"><svg width="14" height="14" viewBox="0 0 25 24" fill="currentColor"><path d="M19.5283 11.1341C20.1949 11.519 20.1949 12.4812 19.5283 12.8661L7.8313 19.6194C7.16463 20.0043 6.3313 19.5231 6.3313 18.7533L6.3313 5.24685C6.3313 4.47705 7.16463 3.99593 7.8313 4.38083L19.5283 11.1341Z"></path></svg></button>`
      : '';

    const actionsHtml = showActions
      ? (isDeletable
        ? `${runBtnHtml}<button class="node-action-btn" data-action="duplicate" title="复制"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3.5" y="5.5" width="7" height="6" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4V3.5C4.5 2.67 5.17 2 6 2H10C10.83 2 11.5 2.67 11.5 3.5V8.5C11.5 9.33 10.83 10 10 10H9.5" stroke="currentColor" stroke-width="1.1"/></svg></button><button class="node-action-btn danger" data-action="delete" title="删除"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>`
        : `${runBtnHtml}<button class="node-action-btn" data-action="duplicate" title="复制"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="3.5" y="5.5" width="7" height="6" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4V3.5C4.5 2.67 5.17 2 6 2H10C10.83 2 11.5 2.67 11.5 3.5V8.5C11.5 9.33 10.83 10 10 10H9.5" stroke="currentColor" stroke-width="1.1"/></svg></button>`)
      : runBtnHtml;

    el.innerHTML = `
      <div class="node-header ${cssClass}">
        <div class="node-icon">${headerContent}</div>
        <span class="node-title">${title}</span>
        ${badgeHtml ? `<span style="margin-left:auto;">${badgeHtml}</span>` : ''}
        ${actionsHtml ? `<div class="node-actions">${actionsHtml}</div>` : ''}
      </div>
      <div class="node-body">
        ${bodyHtml}
      </div>
    `;

    el.addEventListener('click', (e) => {
      if (this.testRunLocked) return;
      if (e.target.closest('.node-action-btn')) return;
      if (e.target.closest('.node-var-tag')) return;
      e.stopPropagation();
      this.selectNode(node.id);
    });

    if (showActions) {
      el.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteNode(node.id); });
      });
      el.querySelectorAll('[data-action="duplicate"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.duplicateNode(node.id); });
      });
      el.querySelectorAll('[data-action="run-node"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openNodeTestPanel(node.id); });
      });
    }

    el.querySelectorAll('.node-var-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectNode(node.id);
      });
    });

    this.makeDraggable(el, node);
    return el;
  }

  renderStartNodeBody(node) {
    const outputs = node.data?.outputs || [];
    const outputTags = outputs.map(o => this.makeVarTag(o.name, false)).join('');
    return `
      <div class="node-section">
        <div class="node-section-label">输入</div>
        <div class="node-section-value">${outputTags}</div>
      </div>
    `;
  }

  renderEndNodeBody(node) {
    return `
      <div class="node-section">
        <div class="node-section-label">输出</div>
        <div class="node-section-value">${this.makeVarTag('output', false)}</div>
      </div>
      <div class="node-section">
        <div class="node-section-label">输出类型</div>
        <div class="node-section-value"><span class="node-text-value">返回文本</span></div>
      </div>
    `;
  }

  renderLLMNodeBody(node) {
    const data = node.data || {};
    const inputParams = data.$$input_decorator$$?.inputParameters || [];
    const outputs = data.outputs || [];

    const inputTags = inputParams.length > 0
      ? inputParams.map(p => {
          const ref = extractValue(p.input);
          const isRef = isVariableReference(ref);
          return this.makeVarTag(p.name, true, isRef);
        }).join('')
      : this.makeVarTag('input', true, false);

    const outputTags = outputs.length > 0
      ? outputs.map(o => this.makeVarTag(o.name, false)).join('')
      : this.makeVarTag('output', false);

    const modelName = data.model?.name || data.model?.modelType ||
      (data.model?.modelId && this.models.find(m => m.id === data.model.modelId)?.code) || 'default';

    return `
      <div class="node-section">
        <div class="node-section-label">输入</div>
        <div class="node-section-value">${inputTags}</div>
      </div>
      <div class="node-section">
        <div class="node-section-label">输出</div>
        <div class="node-section-value">${outputTags}</div>
      </div>
      <div class="node-section">
        <div class="node-section-label">模型</div>
        <div class="node-section-value"><span class="node-model-text">${modelName}</span></div>
      </div>
      <div class="node-section">
        <div class="node-section-label">技能</div>
        <div class="node-section-value"><span class="node-skill-text">未配置技能</span></div>
      </div>
    `;
  }

  makeVarTag(name, isInput, isRef) {
    const refClass = isRef ? ' ref' : '';
    const clickable = isInput ? ' data-input-ref="true"' : '';
    return `<span class="node-var-tag${refClass}"${clickable}><svg class="var-icon" width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/></svg>${name}</span>`;
  }

  renderCodeNodeBody(node) {
    const data = node.data || {};
    const inputs = data.inputParameters || [];
    const inputTags = inputs.length > 0
      ? inputs.map(i => `<span class="node-var-tag"><svg class="var-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.2"/></svg>${i.name}</span>`).join('')
      : '<span class="node-var-tag" data-input-ref="true"><svg class="var-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.2"/></svg>input</span>';

    return `
      <div class="node-section">
        <div class="node-section-label">输入</div>
        <div class="node-variables">${inputTags}</div>
      </div>
      <div class="node-section">
        <div class="node-section-label">输出</div>
        <div class="node-variables">
          <span class="node-var-tag"><svg class="var-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.2"/></svg>result</span>
        </div>
      </div>
    `;
  }

  renderHttpNodeBody(node) {
    const method = node.data?.inputs?.method || 'GET';
    return `
      <div class="node-section">
        <div class="node-section-label">请求</div>
        <div style="font-size:12px;color:#6B7280;">${method}</div>
      </div>
    `;
  }

  duplicateNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const info = NODE_TEMPLATE_INFO[node.type];
    if (info && info.copyDisable) { alert('不能复制该节点'); return; }
    const newId = `dup_${Date.now()}`;
    const newNode = JSON.parse(JSON.stringify(node));
    newNode.id = newId;
    newNode.position = { x: node.position.x + 50, y: node.position.y + 50 };
    this.nodes.push(newNode);
    this.saveFlowData();
    this.render();
  }

  makeDraggable(element, node) {
    let isDragging = false;
    let startX, startY, initX, initY;

    const header = element.querySelector('.node-header');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.node-action-btn') || e.target.closest('.node-var-tag')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initX = node.position.x;
      initY = node.position.y;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      node.position.x = initX + (e.clientX - startX);
      node.position.y = initY + (e.clientY - startY);
      element.style.left = `${node.position.x}px`;
      element.style.top = `${node.position.y}px`;
      if (this.connectionManager) this.connectionManager.updateNodeConnections(node.id);
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) { isDragging = false; this.saveFlowData(); }
    });
  }

  // ===== Config Panel =====
  renderPanel() {
    const panel = document.getElementById('config-panel');
    if (!panel) return;
    if (!this.panelVisible || !this.selectedNodeId) { panel.style.display = 'none'; return; }

    const node = this.nodes.find(n => n.id === this.selectedNodeId);
    if (!node) { panel.style.display = 'none'; return; }

    panel.style.display = 'flex';

    // Panel header: icon + editable name
    const iconEl = document.getElementById('panel-node-icon');
    if (iconEl) {
      const info = NODE_TEMPLATE_INFO[node.type] || {};
      const mainColor = node.data?.nodeMeta?.mainColor || '#6B7280';
      const bgColor = mainColor + '1A';
      iconEl.innerHTML = this.getNodeSVGIcon(node.type);
      iconEl.style.background = bgColor;
    }
    const nameInput = document.getElementById('panel-node-name');
    if (nameInput) nameInput.value = node.data?.title || '';

    // Panel body
    const body = document.getElementById('panel-body');
    let sectionsHtml = '';

    // Description section (common) - click to edit
    const desc = node.data?.description || '';
    sectionsHtml += `
      <div class="config-section">
        <div class="config-desc-display" id="node-desc-display">${this.escHtml(desc) || '<span class="config-desc-placeholder">添加描述...</span>'}</div>
        <input type="text" class="config-desc-input" id="node-desc" value="${this.escHtml(desc)}" placeholder="添加描述..." style="display:none" />
      </div>
    `;

    // Type-specific sections
    switch (node.type) {
      case StandardNodeType.Start: sectionsHtml += this.renderStartConfig(node); break;
      case StandardNodeType.End: sectionsHtml += this.renderEndConfig(node); break;
      case StandardNodeType.LLM: sectionsHtml += this.renderLLMConfig(node); break;
      case StandardNodeType.Code: sectionsHtml += this.renderCodeConfig(node); break;
      case StandardNodeType.Http: sectionsHtml += this.renderHttpConfig(node); break;
      case StandardNodeType.Loop: sectionsHtml += this.renderLoopConfig(node); break;
      case StandardNodeType.If: sectionsHtml += this.renderIfConfig(node); break;
    }

    body.innerHTML = sectionsHtml;
    this.bindConfigEvents(node);
  }

  escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  renderStartConfig(node) {
    const outputs = node.data?.outputs || [];
    const rows = outputs.map((o, i) => `
      <div class="var-input-row">
        <input type="text" class="form-input" value="${this.escHtml(o.name)}" placeholder="参数名" style="flex:1;min-width:70px;" data-start-idx="${i}" data-field="name" />
        <select class="form-select" style="flex:0 0 80px;font-size:12px;" data-start-idx="${i}" data-field="type">
          ${Object.values(VariableTypeDTO).map(t => `<option value="${t}"${o.type === t ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <div style="flex:0 0 40px;display:flex;align-items:center;justify-content:center;">
          <input type="checkbox" class="form-checkbox" data-start-idx="${i}" data-field="required" ${o.required ? 'checked' : ''} title="必填"/>
        </div>
        <button class="icon-btn-sm" data-action="remove-start-output" data-idx="${i}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>
    `).join('');
    return `
      <div class="config-section">
        <div class="config-section-title">输入参数</div>
        <div class="var-table-header" style="display:flex;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);margin-bottom:8px;">
          <span style="flex:1;min-width:70px;font-size:12px;color:var(--color-text-muted);padding-left:8px;">参数名</span>
          <span style="flex:0 0 80px;font-size:12px;color:var(--color-text-muted);">参数类型</span>
          <span style="flex:0 0 40px;font-size:12px;color:var(--color-text-muted);text-align:center;">必填</span>
          <span style="flex:0 0 30px;"></span>
        </div>
        <div id="start-output-list">
          ${rows || '<div style="font-size:12px;color:#9CA3AF;padding:8px 0;">暂无参数</div>'}
        </div>
        <button class="btn btn-sm btn-secondary" data-action="add-start-output" style="margin-top:8px;">+ 添加参数</button>
      </div>
    `;
  }

  renderEndConfig(node) {
    const rawContent = node.data?.inputs?.content;
    const content = rawContent && typeof rawContent === 'object' ? (this.formatValueExpr(rawContent) || '') : (rawContent || '');
    const inputs = node.data?.inputs?.inputParameters || [];
    const rows = inputs.map((p, i) => {
      const valueDisplay = this.formatValueExpr(p.value);

      return `
      <div class="var-input-row">
        <input type="text" class="form-input" value="${this.escHtml(p.name)}" placeholder="变量名" style="flex:1;min-width:80px;" data-end-idx="${i}" data-field="name" />
        <select class="form-select" style="flex:0 0 80px;font-size:12px;" data-end-idx="${i}" data-field="type">
          ${Object.values(VariableTypeDTO).map(t => `<option value="${t}"${p.type === t ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <div style="flex:2;min-width:120px;position:relative;display:flex;">
          <input type="text" class="form-input var-ref-input" value="${this.escHtml(valueDisplay)}" placeholder="值或引用" style="flex:1;" data-end-idx="${i}" data-field="value" data-node-id="${node.id}" />
          <button class="var-ref-btn" data-end-idx="${i}" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.9999 14.0001C13.1045 14.0001 13.9999 13.1046 13.9999 12.0001C13.9999 10.8955 13.1045 10.0001 11.9999 10.0001C10.8954 10.0001 9.99994 10.8955 9.99994 12.0001C9.99994 13.1046 10.8954 14.0001 11.9999 14.0001Z"></path>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M22.9999 14C23.7145 12.7624 23.7145 11.2376 22.9999 9.99997L19.232 3.47369C18.5175 2.23609 17.197 1.47369 15.7679 1.47369H8.232C6.80294 1.47369 5.48243 2.23609 4.7679 3.47369L0.999949 9.99997C0.285418 11.2376 0.285418 12.7624 0.999948 14L4.7679 20.5263C5.48243 21.7639 6.80294 22.5263 8.232 22.5263H15.7679C17.197 22.5263 18.5175 21.7639 19.232 20.5263L22.9999 14ZM21.2679 11C21.6252 11.6188 21.6252 12.3812 21.2679 13L17.4999 19.5263C17.1427 20.1451 16.4824 20.5263 15.7679 20.5263H8.232C7.51747 20.5263 6.85721 20.1451 6.49995 19.5263L2.732 13C2.37473 12.3812 2.37473 11.6188 2.732 11L6.49995 4.47369C6.85721 3.85489 7.51747 3.47369 8.232 3.47369L15.7679 3.47369C16.4824 3.47369 17.1427 3.85489 17.4999 4.47369L21.2679 11Z"></path>
            </svg>
          </button>
        </div>
        <button class="icon-btn-sm" data-action="remove-end-output" data-idx="${i}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;
    }).join('');

    return `
      <div class="config-section">
        <div class="config-section-title">输出变量</div>
        <div class="var-table-header" style="display:flex;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);margin-bottom:8px;">
          <span style="flex:1;min-width:80px;font-size:12px;color:var(--color-text-muted);padding-left:8px;">变量名</span>
          <span style="flex:0 0 80px;font-size:12px;color:var(--color-text-muted);">变量类型</span>
          <span style="flex:2;min-width:120px;font-size:12px;color:var(--color-text-muted);padding-left:8px;">值或引用</span>
          <span style="flex:0 0 30px;"></span>
        </div>
        <div id="end-output-list">
          ${rows || '<div style="font-size:12px;color:#9CA3AF;padding:8px 0;">暂无输出变量</div>'}
        </div>
        <button class="btn btn-sm btn-secondary" data-action="add-end-output" style="margin-top:8px;">+ 添加输出变量</button>
      </div>
      <div class="config-section">
        <div class="config-section-title">返回文本</div>
        <textarea class="form-textarea" id="end-content" rows="4" placeholder="输入工作流的最终返回文本...">${this.escHtml(content)}</textarea>
        <div class="form-hint">支持变量引用，格式: {{input}}</div>
      </div>
    `;
  }

  async openPromptSelector() {
    // 创建弹窗容器
    let modal = document.getElementById('prompt-selector-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'prompt-selector-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 500px;
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    `;

    dialog.innerHTML = `
      <div style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: space-between;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">选择提示词</h3>
        <button id="close-prompt-selector" style="background: none; border: none; cursor: pointer; padding: 4px; color: #999; transition: color 0.2s;">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div style="padding: 12px 20px; border-bottom: 1px solid #e8e8e8;">
        <input type="text" id="prompt-search-input" placeholder="搜索提示词名称、内容或标签..." style="width: 100%; padding: 8px 12px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; color: #333; outline: none; box-sizing: border-box;" />
      </div>
      <div id="prompt-list-container" style="flex: 1; overflow-y: auto; padding: 12px 20px;">
        <div style="text-align: center; color: #999; padding: 20px;">加载中...</div>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    // 关闭按钮事件
    document.getElementById('close-prompt-selector').addEventListener('click', () => {
      modal.remove();
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 搜索功能
    const searchInput = document.getElementById('prompt-search-input');
    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim().toLowerCase();
      this.filterPromptList(keyword);
    });

    // 加载提示词列表
    await this.loadPromptList();
  }

  async loadPromptList() {
    const container = document.getElementById('prompt-list-container');
    if (!container) return;

    try {
      // 从 chrome.storage 或 background 获取提示词
      const result = await chrome.runtime.sendMessage({ action: 'getPrompts' });
      let prompts = [];

      if (Array.isArray(result)) {
        prompts = result;
      } else if (result && result.prompts) {
        prompts = result.prompts;
      }

      // 添加内置提示词
      const builtinPrompts = [
        {
          id: 'builtin-code-review',
          name: '代码审查',
          content: '请审查以下代码，重点关注：\n1. 代码质量和可读性\n2. 潜在的 bug 和边界情况\n3. 性能优化机会\n4. 安全性问题\n5. 最佳实践建议\n\n请提供具体的改进建议，并说明理由。',
          tags: ['代码审查', '质量', '编程'],
          isBuiltin: true
        },
        {
          id: 'builtin-writing-polish',
          name: '文章润色',
          content: '请帮我润色以下文本，使其更加清晰、准确、流畅。保持原意不变，优化表达方式和逻辑结构。提供修改前后的对比说明。',
          tags: ['润色', '编辑', '写作'],
          isBuiltin: true
        },
        {
          id: 'builtin-translation',
          name: '专业翻译',
          content: '请将以下文本翻译成目标语言，确保：\n1. 准确传达原意\n2. 符合目标语言的表达习惯\n3. 保持原文的语气和风格\n4. 专业术语准确\n\n如有歧义，请提供多种翻译选项并说明差异。',
          tags: ['翻译', '多语言'],
          isBuiltin: true
        },
        {
          id: 'builtin-analysis',
          name: '逻辑分析',
          content: '请对以下内容进行深入分析：\n1. 核心观点和论据\n2. 逻辑结构和推理过程\n3. 潜在的假设和偏见\n4. 优势和不足\n5. 改进建议\n\n提供客观、结构化的分析结果。',
          tags: ['分析', '逻辑'],
          isBuiltin: true
        },
        {
          id: 'builtin-creative',
          name: '创意写作',
          content: '请基于以下主题进行创意写作。要求：\n1. 构思新颖，视角独特\n2. 情节或观点引人入胜\n3. 语言生动，富有感染力\n4. 结构完整，逻辑自洽\n\n发挥创造力，打破常规思维。',
          tags: ['创意', '写作'],
          isBuiltin: true
        },
        {
          id: 'builtin-problem-solving',
          name: '问题解决',
          content: '请帮我分析并解决以下问题。步骤：\n1. 明确问题本质和目标\n2. 分析根本原因\n3. 提出多个解决方案\n4. 评估各方案的优劣\n5. 给出最佳方案和实施步骤\n\n请提供系统性的解决方案。',
          tags: ['问题解决', '方法论'],
          isBuiltin: true
        }
      ];

      this.allPrompts = [...builtinPrompts, ...prompts];
      this.renderPromptList(this.allPrompts);
    } catch (error) {
      console.error('加载提示词失败:', error);
      container.innerHTML = '<div style="text-align: center; color: #f5222d; padding: 20px;">加载提示词失败</div>';
    }
  }

  renderPromptList(prompts) {
    const container = document.getElementById('prompt-list-container');
    if (!container) return;

    if (prompts.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无提示词</div>';
      return;
    }

    container.innerHTML = prompts.map(prompt => `
      <div class="prompt-item" data-prompt-id="${this.escHtml(prompt.id)}" style="
        padding: 12px;
        margin-bottom: 8px;
        border: 1px solid #eee;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-weight: 600; font-size: 14px; color: #1a1a1a;">${this.escHtml(prompt.name)}</span>
          ${prompt.isBuiltin ? '<span style="font-size: 11px; color: #389e0d; background: #f6ffed; border: 1px solid #b7eb8f; padding: 1px 6px; border-radius: 4px;">内置</span>' : ''}
        </div>
        <div style="font-size: 13px; color: #666; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
          ${this.escHtml(prompt.content.substring(0, 120))}${prompt.content.length > 120 ? '...' : ''}
        </div>
        ${prompt.tags && prompt.tags.length > 0 ? `
          <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
            ${prompt.tags.map(tag => `<span style="font-size: 11px; color: #0958d9; background: #e6f4ff; padding: 2px 8px; border-radius: 4px;">${this.escHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    // 添加 hover 效果和点击事件
    container.querySelectorAll('.prompt-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.borderColor = '#1890ff';
        item.style.backgroundColor = '#f0f7ff';
      });
      item.addEventListener('mouseleave', () => {
        item.style.borderColor = '#eee';
        item.style.backgroundColor = 'transparent';
      });
      item.addEventListener('click', () => {
        const promptId = item.dataset.promptId;
        this.selectPrompt(promptId);
      });
    });
  }

  filterPromptList(keyword) {
    if (!this.allPrompts) return;

    if (!keyword) {
      this.renderPromptList(this.allPrompts);
      return;
    }

    const filtered = this.allPrompts.filter(prompt =>
      prompt.name.toLowerCase().includes(keyword) ||
      prompt.content.toLowerCase().includes(keyword) ||
      (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(keyword)))
    );

    this.renderPromptList(filtered);
  }

  selectPrompt(promptId) {
    if (!this.allPrompts) return;

    const prompt = this.allPrompts.find(p => p.id === promptId);
    if (!prompt) return;

    // 将提示词内容填入系统提示词输入框
    const systemPromptInput = document.getElementById('llm-system-prompt');
    if (systemPromptInput) {
      systemPromptInput.value = prompt.content;
      // 触发 input 事件以确保任何监听器都能捕获变化
      systemPromptInput.dispatchEvent(new Event('input', { bubbles: true }));
      systemPromptInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 关闭弹窗
    const modal = document.getElementById('prompt-selector-modal');
    if (modal) modal.remove();
  }

  renderLLMConfig(node) {
    const data = node.data || {};
    const systemPrompt = data.$$prompt_decorator$$?.systemPrompt || '';
    const prompt = data.$$prompt_decorator$$?.prompt || '';
    const storedModel = data.model || {};
    const inputParams = data.$$input_decorator$$?.inputParameters || [];
    const outputs = data.outputs || [];
    const chatHistory = data.$$input_decorator$$?.chatHistorySetting || {};

    // 实时查找模型（向后兼容旧格式：storedModel.id）
    const modelId = storedModel.modelId || storedModel.id;
    const selectedModel = modelId ? (this.models.find(m => m.id === modelId) || null) : null;

    const outputRows = outputs.map((o, i) => `
      <div class="var-input-row">
        <input type="text" class="form-input" value="${this.escHtml(o.name)}" placeholder="变量名" style="flex:1;min-width:70px;" data-llm-out-idx="${i}" data-field="name" />
        <select class="form-select" style="flex:0 0 80px;font-size:12px;" data-llm-out-idx="${i}" data-field="type">
          ${Object.values(VariableTypeDTO).map(t => `<option value="${t}"${o.type === t ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <button class="icon-btn-sm" data-action="remove-llm-output" data-idx="${i}">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        </button>
      </div>
    `).join('');

    const enableMem = chatHistory.enableChatHistory ? 'checked' : '';

    const modelDisplay = selectedModel
      ? `${selectedModel.code || ''}(${selectedModel.platformName || ''})`
      : '选择模型';

    return `
      <div class="config-section">
        <div class="config-section-title">输入变量</div>
        <div class="var-table-header" style="display:flex;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);margin-bottom:8px;">
          <span style="flex:1;min-width:80px;font-size:12px;color:var(--color-text-muted);padding-left:8px;">变量名</span>
          <span style="flex:0 0 80px;font-size:12px;color:var(--color-text-muted);">变量类型</span>
          <span style="flex:2;min-width:120px;font-size:12px;color:var(--color-text-muted);padding-left:8px;">值或引用</span>
          <span style="flex:0 0 30px;"></span>
        </div>
        <div id="llm-input-list">
          ${inputParams.map((p, i) => `
            <div class="var-input-row">
              <input type="text" class="form-input" value="${this.escHtml(p.name)}" placeholder="变量名" style="flex:1;min-width:80px;" data-idx="${i}" data-field="name" />
              <select class="form-select" style="flex:0 0 80px;font-size:12px;" data-idx="${i}" data-field="type">
                ${Object.values(VariableTypeDTO).map(t => `<option value="${t}"${p.type === t ? ' selected' : ''}>${t}</option>`).join('')}
              </select>
              <div style="flex:2;min-width:120px;position:relative;display:flex;">
                <input type="text" class="form-input var-ref-input" value="${this.escHtml(this.formatValueExpr(p.input))}" placeholder="值或引用" style="flex:1;" data-idx="${i}" data-field="input" data-node-id="${node.id}" />
                <button class="var-ref-btn" data-idx="${i}" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.9999 14.0001C13.1045 14.0001 13.9999 13.1046 13.9999 12.0001C13.9999 10.8955 13.1045 10.0001 11.9999 10.0001C10.8954 10.8955 9.99994 10.8955 9.99994 12.0001C9.99994 13.1046 10.8954 14.0001 11.9999 14.0001Z"></path>
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M22.9999 14C23.7145 12.7624 23.7145 11.2376 22.9999 9.99997L19.232 3.47369C18.5175 2.23609 17.197 1.47369 15.7679 1.47369H8.232C6.80294 1.47369 5.48243 2.23609 4.7679 3.47369L0.999949 9.99997C0.285418 11.2376 0.285418 12.7624 0.999948 14L4.7679 20.5263C5.48243 21.7639 6.80294 22.5263 8.232 22.5263H15.7679C17.197 22.5263 18.5175 21.7639 19.232 20.5263L22.9999 14ZM21.2679 11C21.6252 11.6188 21.6252 12.3812 21.2679 13L17.4999 19.5263C17.1427 20.1451 16.4824 20.5263 15.7679 20.5263H8.232C7.51747 20.5263 6.85721 20.1451 6.49995 19.5263L2.732 13C2.37473 12.6188 2.37473 11.6188 2.732 11L6.49995 4.47369C6.85721 3.85489 7.51747 3.47369 8.232 3.47369L15.7679 3.47369C16.4824 3.47369 17.1427 3.85489 17.4999 4.47369L21.2679 11Z"></path>
                  </svg>
                </button>
              </div>
              <button class="icon-btn-sm" data-action="remove-llm-input" data-idx="${i}"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-sm btn-secondary" data-action="add-llm-input" style="margin-top:8px;">+ 添加输入变量</button>
      </div>
      <div class="config-section">
        <div class="config-section-title">模型</div>
        <div class="model-selector" id="llm-model-selector">
          <div class="model-display" id="llm-model-display">${modelDisplay}</div>
          <svg class="model-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 5L6 8L9 5" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round"/></svg>
          <div class="model-dropdown" id="llm-model-dropdown" style="display:none">
            <div class="model-loading">加载模型列表...</div>
          </div>
        </div>
        <input type="hidden" id="llm-model-platform-id" value="${this.escHtml(storedModel.platformId || '')}" />
        <input type="hidden" id="llm-model-id" value="${this.escHtml(modelId || '')}" />
      </div>
      <div class="config-section">
        <div class="config-section-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span>系统提示词</span>
          <button id="btn-select-prompt" style="font-size:12px;color:#666;cursor:pointer;background:transparent;border:1px dashed #d9d9d9;border-radius:4px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            选择提示词
          </button>
        </div>
        <textarea class="form-textarea" id="llm-system-prompt" rows="4" placeholder="设置系统提示词...">${this.escHtml(systemPrompt)}</textarea>
        <div class="form-hint">支持变量引用，格式: {{input}}</div>
      </div>
      <div class="config-section">
        <div class="config-section-title">用户提示词</div>
        <textarea class="form-textarea" id="llm-prompt" rows="4" placeholder="设置用户提示词...">${this.escHtml(prompt)}</textarea>
        <div class="form-hint">支持变量引用，格式: {{input}}</div>
      </div>
      <div class="config-section">
        <div class="config-section-title">输出变量</div>
        <div class="var-table-header" style="display:flex;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);margin-bottom:8px;">
          <span style="flex:1;min-width:70px;font-size:12px;color:var(--color-text-muted);padding-left:8px;">变量名</span>
          <span style="flex:0 0 80px;font-size:12px;color:var(--color-text-muted);">变量类型</span>
          <span style="flex:0 0 30px;"></span>
        </div>
        <div id="llm-output-list">
          ${outputRows || '<div style="font-size:12px;color:#9CA3AF;padding:8px 0;">暂无输出变量</div>'}
        </div>
        <button class="btn btn-sm btn-secondary" data-action="add-llm-output" style="margin-top:8px;">+ 添加输出变量</button>
      </div>
      <div class="config-section">
        <div class="config-section-title">技能</div>
        <div style="font-size:12px;color:#9CA3AF;">未配置技能。可添加知识库、插件等。</div>
      </div>
      <div class="config-section">
        <div class="config-section-title">记忆</div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;cursor:pointer;">
          <input type="checkbox" id="llm-chat-history" ${enableMem} />
          启用对话记忆
        </label>
        <div class="form-hint" style="margin-top:4px;">开启后，大模型可参考多轮对话历史</div>
      </div>
    `;
  }

  renderCodeConfig(node) {
    const data = node.data || {};
    const code = data.code || '';
    const lang = data.language || 'javascript';
    return `
      <div class="config-section">
        <div class="config-section-title">语言</div>
        <select class="form-select" id="code-lang">
          <option value="javascript" ${lang === 'javascript' ? 'selected' : ''}>JavaScript</option>
          <option value="python" ${lang === 'python' ? 'selected' : ''}>Python</option>
        </select>
      </div>
      <div class="config-section">
        <div class="config-section-title">代码</div>
        <textarea class="form-textarea" id="code-content" rows="16" placeholder="编写代码...">${this.escHtml(code)}</textarea>
      </div>
    `;
  }

  renderHttpConfig(node) {
    const data = node.data?.inputs || {};
    return `
      <div class="config-section">
        <div class="config-section-title">请求</div>
        <div class="form-group">
          <label>方法</label>
          <select class="form-select" id="http-method">
            <option value="GET" ${data.method === 'GET' ? 'selected' : ''}>GET</option>
            <option value="POST" ${data.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="PUT" ${data.method === 'PUT' ? 'selected' : ''}>PUT</option>
            <option value="DELETE" ${data.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          </select>
        </div>
        <div class="form-group">
          <label>URL</label>
          <input type="text" class="form-input" id="http-url" value="${this.escHtml(data.url?.content || '')}" placeholder="https://..." />
        </div>
      </div>
    `;
  }

  renderLoopConfig(node) {
    return '<div class="config-section"><div class="config-section-title">循环配置</div><div class="form-hint">循环节点配置</div></div>';
  }

  renderIfConfig(node) {
    return '<div class="config-section"><div class="config-section-title">条件配置</div><div class="form-hint">条件判断节点配置</div></div>';
  }

  // ===== Config Events =====
  bindConfigEvents(node) {
    // Description click-to-edit
    const descDisplay = document.getElementById('node-desc-display');
    const descInput = document.getElementById('node-desc');
    if (descDisplay && descInput) {
      descDisplay.addEventListener('click', () => {
        descDisplay.style.display = 'none';
        descInput.style.display = 'block';
        descInput.focus();
      });
      descInput.addEventListener('blur', () => {
        descInput.style.display = 'none';
        descDisplay.style.display = 'block';
        descDisplay.innerHTML = descInput.value ? this.escHtml(descInput.value) : '<span class="config-desc-placeholder">添加描述...</span>';
      });
      descInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') descInput.blur();
      });
    }

    // Auto-save on change/blur for config fields
    const autoSaveIds = ['panel-node-name', 'node-desc', 'end-content',
      'llm-system-prompt', 'llm-prompt', 'code-content', 'http-url'];
    autoSaveIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('blur', () => this.saveNodeConfig(this.selectedNodeId, true));
    });
    ['llm-chat-history', 'code-lang', 'http-method'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.saveNodeConfig(this.selectedNodeId, true));
    });

    // Auto-save on var-input-row changes
    ['llm-input-list', 'llm-output-list', 'start-output-list', 'end-output-list'].forEach(listId => {
      const list = document.getElementById(listId);
      if (list) {
        list.addEventListener('change', (e) => {
          if (e.target.closest('.var-input-row')) {
            this.saveNodeConfig(this.selectedNodeId, true);
          }
        });
      }
    });

    // Action buttons
    document.querySelectorAll('[data-action="add-start-output"]').forEach(btn => {
      btn.onclick = () => this.addStartOutput(node.id);
    });
    document.querySelectorAll('[data-action="remove-start-output"]').forEach(btn => {
      btn.onclick = () => this.removeStartOutput(node.id, parseInt(btn.dataset.idx));
    });
    document.querySelectorAll('[data-action="add-end-output"]').forEach(btn => {
      btn.onclick = () => this.addEndOutput(node.id);
    });
    document.querySelectorAll('[data-action="remove-end-output"]').forEach(btn => {
      btn.onclick = () => this.removeEndOutput(node.id, parseInt(btn.dataset.idx));
    });
    document.querySelectorAll('[data-action="add-llm-input"]').forEach(btn => {
      btn.onclick = () => this.addLLMInput(node.id);
    });
    document.querySelectorAll('[data-action="remove-llm-input"]').forEach(btn => {
      btn.onclick = () => this.removeLLMInput(node.id, parseInt(btn.dataset.idx));
    });
    document.querySelectorAll('[data-action="add-llm-output"]').forEach(btn => {
      btn.onclick = () => this.addLLMOutput(node.id);
    });
    document.querySelectorAll('[data-action="remove-llm-output"]').forEach(btn => {
      btn.onclick = () => this.removeLLMOutput(node.id, parseInt(btn.dataset.idx));
    });

    // Variable picker buttons
    document.querySelectorAll('.var-ref-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const input = btn.parentElement.querySelector('.var-ref-input');
        if (input) {
          const nid = input.dataset.nodeId || node.id;
          this.openVariablePicker(input, nid);
        }
      };
    });

    // Variable picker inputs - removed onclick to allow manual typing

    // Select prompt button
    const selectPromptBtn = document.getElementById('btn-select-prompt');
    if (selectPromptBtn) {
      selectPromptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPromptSelector();
      });
    }

    // Model selector popover - load system models
    const modelDisplay = document.getElementById('llm-model-display');
    const modelDropdown = document.getElementById('llm-model-dropdown');
    if (modelDisplay && modelDropdown) {
      modelDisplay.addEventListener('click', async (e) => {
        e.stopPropagation();
        const willShow = modelDropdown.style.display === 'none';
        modelDropdown.style.display = willShow ? 'block' : 'none';
        if (willShow) {
          // Load models from system
          try {
            const models = await chrome.runtime.sendMessage({ action: 'getModels' });
            this.models = models || [];
            const enabledModels = models ? models.filter(m => m.enabled) : [];
            
            if (enabledModels.length === 0) {
              modelDropdown.innerHTML = '<div class="model-loading">暂无可用模型</div>';
            } else {
              modelDropdown.innerHTML = enabledModels.map(m => `
                <div class="model-option" data-model-id="${this.escHtml(m.id)}" data-platform-id="${this.escHtml(m.platformId || '')}">
                  <div class="model-option-name">${this.escHtml(m.code || '')}(${this.escHtml(m.platformName || '')})</div>
                  <div class="model-option-details">
                    <span class="model-access">${this.escHtml(m.accessMethod || 'web')}</span>
                  </div>
                </div>
              `).join('');
              
              // Add click handlers to model options
              modelDropdown.querySelectorAll('.model-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const modelId = opt.dataset.modelId;
                  const platformId = opt.dataset.platformId;
                  const selectedModel = enabledModels.find(m => m.id === modelId);
                    if (selectedModel) {
                    modelDisplay.textContent = `${selectedModel.code || ''}(${selectedModel.platformName || ''})`;
                    modelDropdown.style.display = 'none';
                    const n = this.nodes.find(n2 => n2.id === node.id);
                    if (n) {
                      n.data.model = {
                        platformId: platformId,
                        modelId: modelId,
                        name: `${selectedModel.code || ''}(${selectedModel.platformName || ''})`
                      };
                      this.saveFlowData();
                      this.render();
                    }
                  }
                });
              });
            }
          } catch (error) {
            console.error('Failed to load models:', error);
            modelDropdown.innerHTML = '<div class="model-loading">加载模型失败</div>';
          }
          
          const closeHandler = () => {
            modelDropdown.style.display = 'none';
            document.removeEventListener('click', closeHandler);
          };
          setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
      });
    }
  }

  saveNodeConfig(nodeId, skipPanelRender) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Common fields
    const nameInput = document.getElementById('panel-node-name');
    const descInput = document.getElementById('node-desc');
    if (nameInput) node.data.title = nameInput.value;
    if (descInput) node.data.description = descInput.value;

    if (node.type === StandardNodeType.Start) {
      const list = document.getElementById('start-output-list');
      if (list) {
        const outputs = node.data.outputs || [];
        list.querySelectorAll('.var-input-row').forEach((row, i) => {
          if (i < outputs.length) {
            const nInput = row.querySelector('[data-field="name"]');
            const tSelect = row.querySelector('[data-field="type"]');
            const rCheck = row.querySelector('[data-field="required"]');
            if (nInput) outputs[i].name = nInput.value;
            if (tSelect) outputs[i].type = tSelect.value;
            if (rCheck) outputs[i].required = rCheck.checked;
          }
        });
      }
    } else if (node.type === StandardNodeType.End) {
      const content = document.getElementById('end-content')?.value || '';
      node.data.inputs = node.data.inputs || {};
      node.data.inputs.content = content;

      const outList = document.getElementById('end-output-list');
      if (outList) {
        const params = node.data.inputs.inputParameters || [];
        outList.querySelectorAll('.var-input-row').forEach((row, i) => {
          if (i < params.length) {
            const nInput = row.querySelector('[data-field="name"]');
            const vInput = row.querySelector('[data-field="value"]');
            const tSelect = row.querySelector('[data-field="type"]');
            if (nInput) params[i].name = nInput.value;
            if (vInput) params[i].value = createValueExpression(vInput.value, this.nodes);
            if (tSelect) params[i].type = tSelect.value;
          }
        });
      }
    } else if (node.type === StandardNodeType.LLM) {
      const sys = document.getElementById('llm-system-prompt')?.value || '';
      const prompt = document.getElementById('llm-prompt')?.value || '';
      const chatHistory = document.getElementById('llm-chat-history')?.checked || false;
      node.data.model = node.data.model || {};
      node.data.$$prompt_decorator$$ = node.data.$$prompt_decorator$$ || {};
      node.data.$$prompt_decorator$$.systemPrompt = sys;
      node.data.$$prompt_decorator$$.prompt = prompt;
      node.data.$$input_decorator$$ = node.data.$$input_decorator$$ || {};
      node.data.$$input_decorator$$.chatHistorySetting = node.data.$$input_decorator$$.chatHistorySetting || {};
      node.data.$$input_decorator$$.chatHistorySetting.enableChatHistory = chatHistory;

      const list = document.getElementById('llm-input-list');
      if (list) {
        const params = node.data.$$input_decorator$$?.inputParameters || [];
        list.querySelectorAll('.var-input-row').forEach((row, i) => {
          if (i < params.length) {
            const nameInput2 = row.querySelector('[data-field="name"]');
            const typeSelect = row.querySelector('[data-field="type"]');
            const refInput = row.querySelector('[data-field="input"]');
            if (nameInput2) params[i].name = nameInput2.value;
            if (typeSelect) params[i].type = typeSelect.value;
            if (refInput) params[i].input = createValueExpression(refInput.value, this.nodes);
          }
        });
      }

      const outList = document.getElementById('llm-output-list');
      if (outList) {
        const outputs = node.data.outputs || [];
        outList.querySelectorAll('.var-input-row').forEach((row, i) => {
          if (i < outputs.length) {
            const nInput = row.querySelector('[data-field="name"]');
            const tSelect = row.querySelector('[data-field="type"]');
            if (nInput) outputs[i].name = nInput.value;
            if (tSelect) outputs[i].type = tSelect.value;
          }
        });
      }
    } else if (node.type === StandardNodeType.Code) {
      node.data.language = document.getElementById('code-lang')?.value || 'javascript';
      node.data.code = document.getElementById('code-content')?.value || '';
    } else if (node.type === StandardNodeType.Http) {
      node.data.inputs = node.data.inputs || {};
      node.data.inputs.method = document.getElementById('http-method')?.value || 'GET';
      node.data.inputs.url = createValueExpression(document.getElementById('http-url')?.value || '', this.nodes);
    }

    this.saveFlowData();
    this.render();
    if (!skipPanelRender) {
      this.renderPanel();
    }
  }

  addEndOutput(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    this.saveNodeConfig(this.selectedNodeId, true);
    node.data.inputs = node.data.inputs || {};
    node.data.inputs.inputParameters = node.data.inputs.inputParameters || [];
    node.data.inputs.inputParameters.push({ name: `output_${node.data.inputs.inputParameters.length + 1}`, type: VariableTypeDTO.string, value: createValueExpression('') });
    this.renderPanel();
  }

  removeEndOutput(nodeId, idx) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || !node.data.inputs?.inputParameters) return;
    node.data.inputs.inputParameters.splice(idx, 1);
    this.renderPanel();
  }

  addLLMInput(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.data.$$input_decorator$$ = node.data.$$input_decorator$$ || {};
    node.data.$$input_decorator$$.inputParameters = node.data.$$input_decorator$$.inputParameters || [];
    node.data.$$input_decorator$$.inputParameters.push({
      name: `var_${node.data.$$input_decorator$$.inputParameters.length + 1}`,
      type: VariableTypeDTO.string,
      input: createValueExpression('')
    });
    this.renderPanel();
  }

  removeLLMInput(nodeId, idx) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || !node.data.$$input_decorator$$?.inputParameters) return;
    node.data.$$input_decorator$$.inputParameters.splice(idx, 1);
    this.renderPanel();
  }

  addLLMOutput(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.data.outputs = node.data.outputs || [];
    const idx = node.data.outputs.length + 1;
    node.data.outputs.push({ key: `output_${Date.now()}`, name: `output_${idx}`, type: 'string' });
    this.renderPanel();
  }

  removeLLMOutput(nodeId, idx) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || !node.data.outputs) return;
    node.data.outputs.splice(idx, 1);
    this.renderPanel();
  }

  addStartOutput(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.data.outputs = node.data.outputs || [];
    const idx = node.data.outputs.length + 1;
    node.data.outputs.push({ key: `param_${Date.now()}`, name: `param_${idx}`, type: 'string', required: false });
    this.renderPanel();
  }

  removeStartOutput(nodeId, idx) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || !node.data.outputs) return;
    node.data.outputs.splice(idx, 1);
    this.renderPanel();
  }

  // ===== Variable Picker =====
  renderVariablePicker(variables) {
    const dialog = document.getElementById('variable-picker-dialog');
    if (!dialog) return;
    if (!this.variablePickerVisible || variables.length === 0) { dialog.style.display = 'none'; return; }
    dialog.style.display = 'flex';

    const body = document.getElementById('var-picker-body');
    body.innerHTML = variables.map(g => `
      <div class="var-group">
        <div class="var-group-header">
          <span>${g.nodeIcon || '📦'}</span>
          <span>${g.nodeName}</span>
        </div>
        <div class="var-group-items">
          ${g.variables.map(v => `
            <div class="var-picker-item" data-action="select-var" data-node-id="${g.nodeId}" data-var-name="${v.name}">
              <span class="var-picker-name">${v.name}</span>
              <span class="var-picker-type">${this.formatType(v.type)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    body.querySelectorAll('[data-action="select-var"]').forEach(el => {
      el.addEventListener('click', () => {
        this.selectVariable(el.dataset.nodeId, el.dataset.varName);
      });
    });
  }

  formatType(type) {
    const map = { string: '字符串', integer: '整数', float: '浮点数', boolean: '布尔', object: '对象', list: '数组' };
    return map[type] || type;
  }

  formatValueExpr(expr) {
    if (!expr) return '';
    const val = extractValue(expr);
    if (isVariableReference(val)) {
      const parsed = parseVariableReference(val);
      if (parsed && this.nodes) {
        const node = this.nodes.find(n => n.id === parsed.nodeId);
        if (node && node.data?.title) {
          return `{{${node.data.title}.${parsed.path}}}`;
        }
      }
      return val;
    }
    return val || '';
  }

  // ===== Events =====
  bindEvents() {
    const canvas = document.getElementById(this.canvasId);
    if (canvas) {
      canvas.addEventListener('click', (e) => {
        if (this.testRunLocked) return;
        if (e.target === canvas) this.closePanel();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && this.selectedNodeId && !this.testRunLocked) {
        const node = this.nodes.find(n => n.id === this.selectedNodeId);

        if (node) {
          const info = NODE_TEMPLATE_INFO[node.type];
          if (info && info.deleteDisable) {
            this.showDeleteDisabledToast(node);
            return;
          }
          this.deleteNode(this.selectedNodeId);
        }
      }
      if (e.key === 'Escape') {
        if (this.variablePickerVisible) this.closeVariablePicker();
        else if (this.testRunLocked) this.closeNodeTestPanel();
        else this.closePanel();
      }
    });
  }

  bindChromeMessages() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.warn('[FlowApp] Chrome runtime not available');
      return;
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'flowTestProgress') {
        this.handleFlowTestProgress(message.progress);
      }
      return true;
    });
  }

  handleFlowTestProgress(progress) {
    const progressContent = document.querySelector('#test-progress-content');
    if (progressContent) {
      const { current, total, nodeName } = progress;
      progressContent.innerHTML = `
        <div class="test-progress-item">
          <span class="progress-node-name">${this.escHtml(nodeName || '未知节点')}</span>
          <span class="progress-counter">${current}/${total}</span>
        </div>
        <div class="test-progress-bar">
          <div class="test-progress-fill" style="width: ${(current / total) * 100}%"></div>
        </div>
      `;
    }
  }

  showDeleteDisabledToast(node) {
    const info = NODE_TEMPLATE_INFO[node.type];
    // Fallback: info.name → node.data.title → generic label
    const nodeName = info?.name || node.data?.title || '该节点';

    // 创建临时提示
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #F5222D;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideDown 0.3s ease;
    `;
    toast.textContent = `${nodeName}节点不能删除`;

    // 添加动画样式（仅一次）
    if (!window._toastStyleInjected) {
      const style = document.createElement('style');
      style.id = 'toast-style';
      style.textContent = `
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
      window._toastStyleInjected = true;
    }

    document.body.appendChild(toast);

    // 2秒后移除（带防御性检查）
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
          if (document.body.contains(toast)) toast.remove();
        }, 300);
      }
    }, 2000);
  }
}

if (typeof window !== 'undefined') window.FlowDesignerApp = FlowDesignerApp;
if (typeof module !== 'undefined' && module.exports) module.exports = FlowDesignerApp;
