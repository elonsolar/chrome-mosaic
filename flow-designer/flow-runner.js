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
    this.currentNode = node;

    switch (node.type) {
      case StandardNodeType.Start:
        await this.executeStartNode(node);
        break;
      case StandardNodeType.LLM:
        await this.executeLLMNode(node);
        break;
      case StandardNodeType.Http:
        await this.executeHttpNode(node);
        break;
      case StandardNodeType.Code:
        await this.executeCodeNode(node);
        break;
      case StandardNodeType.If:
        await this.executeIfNode(node);
        break;
      case StandardNodeType.Loop:
        await this.executeLoopNode(node);
        break;
      case StandardNodeType.End:
        await this.executeEndNode(node);
        break;
      default:
        throw new Error(`未知节点类型: ${node.type}`);
    }

    const nextNode = this.getNextNode(node.id);
    if (nextNode) {
      await this.executeNode(nextNode);
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
    const modelType = data.model?.modelType || 'default';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'callModel',
        modelType,
        systemPrompt,
        prompt
      });

      this.context[`${node.id}_output`] = response;
      this.context.answer = response;
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

  getNextNode(nodeId) {
    const edges = this.flowData.edges || [];
    const edge = edges.find(e => e.source === nodeId);
    if (!edge) return null;
    return this.flowData.nodes.find(n => n.id === edge.target);
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
