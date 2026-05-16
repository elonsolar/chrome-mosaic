/**
 * 流程执行引擎
 * 负责执行流程定义，协调多个模型节点
 */
class FlowExecutor {
  constructor(tabManager, conversationManager) {
    this.tabManager = tabManager;
    this.conversationManager = conversationManager;
  }

  /**
   * 执行流程
   * @param {Object} flow - 流程定义
   * @param {string} userInput - 用户输入
   * @param {Object} context - 执行上下文（conversationId等）
   * @returns {Promise<Object>} 执行结果
   */
  async executeFlow(flow, userInput, context = {}) {
    console.log('[FlowExecutor] 开始执行流程:', flow.name);

    if (!flow.nodes || flow.nodes.length === 0) {
      throw new Error('流程没有节点');
    }

    // 构建执行图
    const executionGraph = this.buildExecutionGraph(flow);

    // 执行流程
    const result = await this.executeGraph(executionGraph, userInput, context);

    console.log('[FlowExecutor] 流程执行完成');
    return result;
  }

  /**
   * 构建执行图
   * 将节点和连接转换为可执行的结构
   */
  buildExecutionGraph(flow) {
    const nodeMap = new Map();
    flow.nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

    // 构建节点的出连接和入连接
    const outgoingConnections = new Map();
    const incomingConnections = new Map();

    flow.nodes.forEach(node => {
      outgoingConnections.set(node.id, []);
      incomingConnections.set(node.id, []);
    });

    flow.connections.forEach(conn => {
      if (outgoingConnections.has(conn.from)) {
        outgoingConnections.get(conn.from).push(conn);
      }
      if (incomingConnections.has(conn.to)) {
        incomingConnections.get(conn.to).push(conn);
      }
    });

    // 找到起始节点（没有入连接的节点）
    const startNodes = flow.nodes.filter(node =>
      incomingConnections.get(node.id).length === 0
    );

    if (startNodes.length === 0) {
      throw new Error('流程没有起始节点（检测到循环依赖）');
    }

    if (startNodes.length > 1) {
      throw new Error('流程只能有一个起始节点');
    }

    return {
      nodes: nodeMap,
      outgoingConnections,
      incomingConnections,
      startNode: startNodes[0]
    };
  }

  /**
   * 执行执行图
   */
  async executeGraph(graph, userInput, context) {
    const { nodes, outgoingConnections, startNode } = graph;

    // 执行结果存储
    const nodeResults = new Map();

    // 执行节点
    const executeNode = async (nodeId, input) => {
      // 如果已经执行过，直接返回结果
      if (nodeResults.has(nodeId)) {
        return nodeResults.get(nodeId);
      }

      const node = nodes.get(nodeId);
      console.log('[FlowExecutor] 执行节点:', node.name);

      // 获取模型和提示词
      const model = await this.getModel(node.modelId);
      const prompt = await this.getPrompt(node.promptId);

      // 构建完整输入
      const fullInput = this.buildFullInput(input, prompt);

      // 发送到模型
      const result = await this.sendToModel(model, fullInput, context);

      // 存储结果
      nodeResults.set(nodeId, result);

      // 获取出连接
      const outgoing = outgoingConnections.get(nodeId) || [];

      if (outgoing.length === 0) {
        // 没有出连接，这是终点节点，返回结果
        console.log('[FlowExecutor] 到达终点节点:', node.name);
        return result;
      }

      // 检查是并行还是串行
      const hasParallel = outgoing.some(conn => conn.mode === 'parallel');

      if (hasParallel) {
        // 并行执行
        console.log('[FlowExecutor] 并行执行子节点');
        const parallelResults = await Promise.all(
          outgoing.map(conn =>
            executeNode(conn.to, result.content)
          )
        );

        // 如果有多个并行结果，合并它们
        if (parallelResults.length > 1) {
          return {
            content: parallelResults.map(r => r.content).join('\n\n'),
            metadata: {
              parallel: true,
              results: parallelResults
            }
          };
        }

        return parallelResults[0];
      } else {
        // 串行执行
        console.log('[FlowExecutor] 串行执行子节点');
        if (outgoing.length === 1) {
          return await executeNode(outgoing[0].to, result.content);
        } else {
          // 多个串行连接，按顺序执行
          let currentResult = result;
          for (const conn of outgoing.sort((a, b) => a.order - b.order)) {
            currentResult = await executeNode(conn.to, currentResult.content);
          }
          return currentResult;
        }
      }
    };

    // 从起始节点开始执行
    return await executeNode(startNode.id, userInput);
  }

  /**
   * 构建完整输入（提示词 + 用户输入）
   */
  buildFullInput(userInput, prompt) {
    if (!prompt || !prompt.content) {
      return userInput;
    }

    // 替换变量（如果有）
    let fullPrompt = prompt.content;
    const variables = prompt.variables || [];

    variables.forEach(variable => {
      // 简单的变量替换
      fullPrompt = fullPrompt.replace(
        new RegExp(`\\{${variable}\\}`, 'g'),
        userInput
      );
    });

    // 如果没有变量或变量未匹配，追加用户输入
    if (variables.length === 0) {
      fullPrompt = `${prompt.content}\n\n${userInput}`;
    }

    return fullPrompt;
  }

  /**
   * 发送到模型
   */
  async sendToModel(model, input, context) {
    console.log('[FlowExecutor] 发送到模型:', model.name);

    // 这里需要调用实际的模型发送逻辑
    // 暂时返回模拟结果
    try {
      // 实际实现时，这里会调用 tabManager.sendMessage
      const response = await this.tabManager.sendMessage(
        model.provider,
        input
      );

      return {
        success: true,
        content: response.content || response,
        model: model.name,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[FlowExecutor] 模型调用失败:', error);
      return {
        success: false,
        content: `错误: ${error.message}`,
        model: model.name,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取模型信息
   */
  async getModel(modelId) {
    const models = await chrome.storage.local.get('models');
    return models.models?.find(m => m.id === modelId) || null;
  }

  /**
   * 获取提示词信息
   */
  async getPrompt(promptId) {
    const prompts = await chrome.storage.local.get('prompts');
    return prompts.prompts?.find(p => p.id === promptId) || null;
  }

  /**
   * 验证流程
   */
  validateFlow(flow) {
    if (!flow.nodes || flow.nodes.length === 0) {
      return { valid: false, errors: ['流程没有节点'] };
    }

    if (!flow.connections || flow.connections.length === 0) {
      return { valid: false, errors: ['流程没有连接'] };
    }

    // 检查节点引用
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    const invalidConnections = flow.connections.filter(
      conn => !nodeIds.has(conn.from) || !nodeIds.has(conn.to)
    );

    if (invalidConnections.length > 0) {
      return { valid: false, errors: ['存在无效的连接'] };
    }

    // 检查循环依赖
    const graph = this.buildExecutionGraph(flow);
    if (!graph.startNode) {
      return { valid: false, errors: ['检测到循环依赖'] };
    }

    return { valid: true, errors: [] };
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowExecutor;
}
