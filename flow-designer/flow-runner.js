class FlowRunner {
  constructor(flowData) {
    this.flowData = flowData;
    this.context = {};
    this.currentNode = null;
    this.isRunning = false;
    this.nodeResults = new Map();
    this.executingNodes = new Map();
  }

  async run() {
    if (this.isRunning) {
      throw new Error('流程已在运行中');
    }

    this.isRunning = true;
    this.context = {};
    this.nodeResults.clear();
    this.executingNodes.clear();

    try {
      const startNode = this.flowData.nodes.find(n => n.type === StandardNodeType.Start);
      if (!startNode) {
        throw new Error('未找到开始节点');
      }

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
    if (this.executingNodes.has(node.id)) {
      return await this.executingNodes.get(node.id);
    }

    if (this.nodeResults.has(node.id)) {
      return this.nodeResults.get(node.id);
    }

    const executionPromise = (async () => {
      this.currentNode = node;

      let nodeResult;
      switch (node.type) {
        case StandardNodeType.Start:
          await this.executeStartNode(node);
          nodeResult = { success: true };
          break;
        case StandardNodeType.LLM:
          nodeResult = await this.executeLLMNode(node);
          break;
        case StandardNodeType.Http:
          nodeResult = await this.executeHttpNode(node);
          break;
        case StandardNodeType.Code:
          nodeResult = await this.executeCodeNode(node);
          break;
        case StandardNodeType.If:
          nodeResult = await this.executeIfNode(node);
          break;
        case StandardNodeType.Loop:
          nodeResult = await this.executeLoopNode(node);
          break;
        case StandardNodeType.End:
          nodeResult = await this.executeEndNode(node);
          break;
        default:
          throw new Error(`未知节点类型: ${node.type}`);
      }

      const result = { success: true, data: nodeResult };
      this.nodeResults.set(node.id, result);
      return result;
    })();

    this.executingNodes.set(node.id, executionPromise);
    try {
      await executionPromise;
    } finally {
      this.executingNodes.delete(node.id);
    }

    const nextNodes = this.getNextNodes(node.id);

    if (nextNodes.length === 0) {
      console.log(`[FlowRunner] 到达终点节点: ${node.data?.title}`);
      return;
    }

    if (nextNodes.length > 1) {
      console.log(`[FlowRunner] 并行执行 ${nextNodes.length} 个子节点`);

      await Promise.all(
        nextNodes.map(nextNode => this.executeNode(nextNode))
      );
    } else {
      await this.executeNode(nextNodes[0]);
    }
  }

  async executeStartNode(node) {
    if (node.data && node.data.inputs) {
      for (const [key, value] of Object.entries(node.data.inputs)) {
        this.context[key] = value;
      }
    }
  }

  async executeLLMNode(node) {
    const data = node.data || {};
    const systemPrompt = this.replaceVariables(data.$$prompt_decorator$$?.systemPrompt || '');
    const prompt = this.replaceVariables(data.$$prompt_decorator$$?.prompt || '');
    const modelType = data.model?.name || data.model?.modelType || 'default';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'callModel',
        modelType,
        systemPrompt,
        prompt
      });

      this.context[`${node.id}_output`] = response;
      return response;
    } catch (error) {
      throw new Error(`LLM 调用失败: ${error.message}`);
    }
  }

  async executeHttpNode(node) {
    const inputs = node.data?.inputs || {};
    const method = inputs.method || 'GET';
    const url = this.replaceVariables(extractValue(inputs.url) || '');

    try {
      const response = await fetch(url, { method });
      const text = await response.text();
      this.context[`${node.id}_output`] = text;
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
        const fn = new Function('context', code);
        result = fn(this.context);
      } else {
        throw new Error(`不支持的代码语言: ${language}`);
      }

      this.context[`${node.id}_output`] = result;
    } catch (error) {
      throw new Error(`代码执行失败: ${error.message}`);
    }
  }

  async executeIfNode(node) {
    return;
  }

  async executeLoopNode(node) {
    return;
  }

  async executeEndNode(node) {
    if (node.data && node.data.inputs) {
      const content = extractValue(node.data.inputs.content);
      if (content) {
        this.context.result = this.replaceVariables(content);
      }
    }
  }

  getNextNodes(nodeId) {
    const edges = this.flowData.edges || [];
    const targetIds = edges
      .filter(e => e.source === nodeId)
      .map(e => e.target);

    return targetIds
      .map(id => this.flowData.nodes.find(n => n.id === id))
      .filter(Boolean);
  }

  replaceVariables(text) {
    if (!text || typeof text !== 'string') return text;

    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      return this.context[trimmedKey] !== undefined ? this.context[trimmedKey] : match;
    });
  }
}

if (typeof window !== 'undefined') {
  window.FlowRunner = FlowRunner;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowRunner;
}
