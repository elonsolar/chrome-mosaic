/**
 * FlowTestRunner - 流程试运行执行器
 * 职责：
 * 1. 拓扑排序节点执行顺序
 * 2. 管理执行上下文（节点输出）
 * 3. 替换变量引用 {{nodeId.output}}
 * 4. 逐个调用 conversationOneShot 执行节点
 */

class FlowTestRunner {
  constructor(conversationManager, senderFactory) {
    this.conversationManager = conversationManager;
    this.senderFactory = senderFactory;
    this.executionContext = new Map();
  }

  async testRunFlow(flowData, startNodeInputs = {}, onProgress = null) {
    console.log('[FlowTestRunner] 开始试运行流程, 节点数:', flowData.nodes.length);

    const executionOrder = this.topologicalSort(flowData.nodes, flowData.edges);
    console.log('[FlowTestRunner] 执行顺序:', executionOrder.map(n => n.data?.title || n.id));

    this.executionContext.clear();
    const startNode = executionOrder[0];
    if (startNode.type === '1' && startNode.data?.outputs) {
      startNode.data.outputs.forEach(output => {
        const inputValue = startNodeInputs[output.name] || '';
        this.executionContext.set(`${startNode.id}.${output.name}`, inputValue);
      });
    }

    const results = [];
    for (let i = 0; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      
      if (node.type === '1' || node.type === '2') {
        continue;
      }

      if (onProgress) {
        onProgress({ current: i, total: executionOrder.length, nodeName: node.data?.title });
      }

      const result = await this.executeNode(node);
      results.push({ nodeId: node.id, nodeName: node.data?.title, result });

      if (result.success && node.data?.outputs) {
        node.data.outputs.forEach(output => {
          const contextKey = `${node.id}.${output.name}`;
          let outputValue = result.content;
          if (output.key === 'output') {
            outputValue = result.content;
          }
          this.executionContext.set(contextKey, outputValue);
        });
      }

      if (!result.success) {
        console.error('[FlowTestRunner] 节点执行失败:', node.data?.title, result.error);
        break;
      }
    }

    const endNode = executionOrder[executionOrder.length - 1];
    let finalOutput = '';
    if (endNode.type === '2') {
      finalOutput = await this.processEndNode(endNode);
    }

    return {
      success: results.every(r => r.result.success),
      finalOutput,
      nodeResults: results,
      executionContext: Object.fromEntries(this.executionContext),
    };
  }

  topologicalSort(nodes, edges) {
    const inDegree = new Map();
    const adjacency = new Map();
    const nodeMap = new Map();

    nodes.forEach(node => {
      nodeMap.set(node.id, node);
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    });

    edges.forEach(edge => {
      const from = edge.source || edge.from;
      const to = edge.target || edge.to;
      adjacency.get(from).push(to);
      inDegree.set(to, (inDegree.get(to) || 0) + 1);
    });

    const queue = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });

    const result = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      const node = nodeMap.get(nodeId);
      if (node) {
        result.push(node);
      }

      adjacency.get(nodeId).forEach(neighborId => {
        inDegree.set(neighborId, inDegree.get(neighborId) - 1);
        if (inDegree.get(neighborId) === 0) {
          queue.push(neighborId);
        }
      });
    }

    if (result.length !== nodes.length) {
      throw new Error('检测到循环依赖，无法执行流程');
    }

    return result;
  }

  async executeNode(node) {
    console.log('[FlowTestRunner] 执行节点:', node.data?.title, '类型:', node.type);

    try {
      switch (node.type) {
        case '3':
          return await this.executeLLMNode(node);
        case '45':
          return await this.executeHttpNode(node);
        case '5':
          return await this.executeCodeNode(node);
        default:
          return {
            success: false,
            content: '',
            error: `不支持的节点类型: ${node.type}`
          };
      }
    } catch (error) {
      console.error('[FlowTestRunner] 节点执行异常:', error);
      return {
        success: false,
        content: '',
        error: error.message
      };
    }
  }

  async executeLLMNode(node) {
    const model = node.data?.model;
    if (!model?.id) {
      throw new Error('LLM 节点未配置模型');
    }

    const inputParams = node.data?.$$input_decorator$$?.inputParameters || [];
    const resolvedInputs = {};
    inputParams.forEach(param => {
      const inputValue = this.resolveValue(param.input);
      resolvedInputs[param.name] = inputValue;
    });

    let systemPrompt = node.data?.$$prompt_decorator$$?.systemPrompt || '';
    let prompt = node.data?.$$prompt_decorator$$?.prompt || '';

    systemPrompt = this.replaceVariableReferences(systemPrompt);
    prompt = this.replaceVariableReferences(prompt);

    Object.keys(resolvedInputs).forEach(inputName => {
      const regex = new RegExp(`\\{\\{${inputName}\\}\\}`, 'g');
      systemPrompt = systemPrompt.replace(regex, resolvedInputs[inputName]);
      prompt = prompt.replace(regex, resolvedInputs[inputName]);
    });

    const accessMethod = model.accessMethod || 'web';
    let finalContent, finalSystemPrompt;
    if (accessMethod === 'web') {
      finalContent = systemPrompt ? `[系统]\n${systemPrompt}\n\n[用户]\n${prompt}` : prompt;
      finalSystemPrompt = null;
    } else {
      finalContent = prompt;
      finalSystemPrompt = systemPrompt || null;
    }

    const response = await conversationOneShot(model.id, finalContent, finalSystemPrompt);

    return {
      success: response.success,
      content: response.content,
      model: response.model,
      timestamp: response.timestamp,
    };
  }

  async executeHttpNode(node) {
    const inputs = node.data?.inputs || {};
    const method = inputs.method || 'GET';
    const url = this.resolveValue(inputs.url);
    const body = this.resolveValue(inputs.body);

    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (method !== 'GET' && body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const text = await response.text();
      
      return {
        success: true,
        content: text,
      };
    } catch (error) {
      throw new Error(`HTTP 请求失败: ${error.message}`);
    }
  }

  async executeCodeNode(node) {
    const data = node.data || {};
    const language = data.language || 'javascript';
    const code = data.code || '';

    try {
      let result;
      if (language === 'javascript') {
        const context = Object.fromEntries(this.executionContext);
        const fn = new Function('context', code);
        result = fn(context);
      } else {
        throw new Error(`不支持的代码语言: ${language}`);
      }

      return {
        success: true,
        content: String(result),
      };
    } catch (error) {
      throw new Error(`代码执行失败: ${error.message}`);
    }
  }

  async processEndNode(endNode) {
    const inputs = endNode.data?.inputs || {};
    const contentExpr = inputs.content;
    let finalContent = this.replaceVariableReferences(
      this.resolveValue(contentExpr) || ''
    );

    if (inputs.inputParameters) {
      inputs.inputParameters.forEach(param => {
        const value = this.resolveValue(param.value);
        if (value) {
          const regex = new RegExp(`\\{\\{${param.name}\\}\\}`, 'g');
          finalContent = finalContent.replace(regex, value);
        }
      });
    }

    return finalContent;
  }

  resolveValue(valueExpr) {
    if (!valueExpr) {
      return '';
    }

    if (typeof valueExpr === 'string') {
      return valueExpr;
    }

    if (typeof valueExpr === 'object') {
      if (valueExpr.type === 'literal') {
        return valueExpr.content;
      }
      if (valueExpr.type === 'ref') {
        const ref = valueExpr.content;
        if (ref?.source === 'block-output') {
          const contextKey = `${ref.blockID}.${ref.name}`;
          return this.executionContext.get(contextKey) || '';
        }
      }
    }

    return String(valueExpr);
  }

  replaceVariableReferences(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    return text.replace(/\{\{(.+?)\}\}/g, (match, refStr) => {
      const parts = refStr.split('.');
      if (parts.length >= 2) {
        const nodeId = parts[0];
        const varName = parts.slice(1).join('.');
        const contextKey = `${nodeId}.${varName}`;
        const value = this.executionContext.get(contextKey);
        return value !== undefined ? value : match;
      }
      // No dot: keep as-is, should be resolved by output parameters
      return match;
    });
  }
}

if (typeof self !== 'undefined') {
  self.FlowTestRunner = FlowTestRunner;
}
