class FlowExecutor {
  constructor(tabManager, conversationManager, senderFactory) {
    this.tabManager = tabManager;
    this.conversationManager = conversationManager;
    this.senderFactory = senderFactory;
  }

  async executeFlow(flow, userInput, context = {}) {
    console.log('[FlowExecutor] 开始执行流程:', flow.name);

    if (!flow.nodes || flow.nodes.length === 0) {
      throw new Error('流程没有节点');
    }

    const maxIterations = context.maxIterations || 3;
    const onProgress = context.onProgress || null;
    const sessionPool = new TemporarySessionPool(this.conversationManager);

    const executionGraph = this.buildExecutionGraph(flow);

    let currentInput = userInput;
    let iteration = 0;
    let finalResult = null;

    try {
      while (iteration < maxIterations) {
        iteration++;
        console.log(`[FlowExecutor] 第${iteration}轮执行`);

        if (onProgress) {
          onProgress({ iteration, maxIterations, currentResult: null });
        }

        const roundResult = await this.executeGraph(executionGraph, currentInput, context, sessionPool);
        finalResult = roundResult;

        if (iteration < maxIterations && this.detectDisagreement(roundResult)) {
          console.log('[FlowExecutor] 检测到分歧，准备下一轮');
          currentInput = this.prepareNextIterationInput(roundResult);

          await sessionPool.cleanup();
          sessionPool.tempConversations.clear();
        } else {
          break;
        }
      }

      return {
        success: true,
        content: finalResult ? finalResult.content : '',
        metadata: {
          iterations: iteration,
          converged: !this.detectDisagreement(finalResult)
        }
      };
    } finally {
      await sessionPool.cleanup();
    }
  }

  detectDisagreement(roundResult) {
    if (!roundResult || !roundResult.metadata || !roundResult.metadata.results) {
      return false;
    }

    const results = roundResult.metadata.results;
    if (results.length < 2) return false;

    const lengths = results.map(r => (r.content || '').length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (avgLength === 0) return false;

    const variance = lengths.reduce((sum, len) =>
      sum + Math.pow(len - avgLength, 2), 0
    ) / lengths.length;

    return variance > 10000;
  }

  prepareNextIterationInput(roundResult) {
    const results = roundResult.metadata?.results;
    if (!results || results.length < 2) {
      return roundResult.content || '';
    }

    return `以下是不同AI的观点，请综合讨论并给出统一答案：\n\n${
      results.map((r, i) =>
        `【观点${i + 1}】（来自${r.model || 'AI' + (i + 1)}）：\n${r.content}`
      ).join('\n\n---\n\n')
    }\n\n请综合以上观点，给出统一的答案。`;
  }

  buildExecutionGraph(flow) {
    const nodeMap = new Map();
    flow.nodes.forEach(node => {
      nodeMap.set(node.id, node);
    });

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

  async executeGraph(graph, userInput, context, sessionPool) {
    const { nodes, outgoingConnections, startNode } = graph;
    const nodeResults = new Map();

    const executeNode = async (nodeId, input) => {
      if (nodeResults.has(nodeId)) {
        return nodeResults.get(nodeId);
      }

      const node = nodes.get(nodeId);
      console.log('[FlowExecutor] 执行节点:', node.name);

      const model = await this.getModel(node.modelId);
      const prompt = await this.getPrompt(node.promptId);
      const fullInput = this.buildFullInput(input, prompt);

      let result;
      if (sessionPool) {
        const tempConvId = await sessionPool.getSessionForNode(node);
        result = await this.sendToModelViaTempSession(model, fullInput, tempConvId);
      } else {
        result = await this.sendToModel(model, fullInput, context);
      }

      nodeResults.set(nodeId, result);

      const outgoing = outgoingConnections.get(nodeId) || [];

      if (outgoing.length === 0) {
        console.log('[FlowExecutor] 到达终点节点:', node.name);
        return result;
      }

      const hasParallel = outgoing.some(conn => conn.mode === 'parallel');

      if (hasParallel) {
        console.log('[FlowExecutor] 并行执行子节点');
        const parallelResults = await Promise.all(
          outgoing.map(conn =>
            executeNode(conn.to, result.content)
          )
        );

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
        console.log('[FlowExecutor] 串行执行子节点');
        if (outgoing.length === 1) {
          return await executeNode(outgoing[0].to, result.content);
        } else {
          let currentResult = result;
          for (const conn of outgoing.sort((a, b) => a.order - b.order)) {
            currentResult = await executeNode(conn.to, currentResult.content);
          }
          return currentResult;
        }
      }
    };

    return await executeNode(startNode.id, userInput);
  }

  buildFullInput(userInput, prompt) {
    if (!prompt || !prompt.content) {
      return userInput;
    }

    let fullPrompt = prompt.content;
    const variables = prompt.variables || [];

    variables.forEach(variable => {
      fullPrompt = fullPrompt.replace(
        new RegExp(`\\{${variable}\\}`, 'g'),
        userInput
      );
    });

    if (variables.length === 0) {
      fullPrompt = `${prompt.content}\n\n${userInput}`;
    }

    return fullPrompt;
  }

  async sendToModel(model, input, context) {
    console.log('[FlowExecutor] 发送到模型:', model.name);

    try {
      const accessMethod = model.accessMethod || 'web';
      const sender = this.senderFactory.getSender(accessMethod);
      const response = await sender.send(input, {
        provider: model.provider,
        model: model.model,
        baseUrl: model.baseUrl || '',
        apiKey: model.apiKey || ''
      });

      return {
        success: true,
        content: response.content,
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

  async sendToModelViaTempSession(model, input, tempConvId) {
    console.log('[FlowExecutor] 通过临时会话发送到模型:', model.name, '临时会话:', tempConvId);

    try {
      const tempConv = await this.conversationManager.getConversation(tempConvId);
      const memberId = tempConv.memberIds[0];
      const members = await StorageManager.getMembers();
      const member = members.find(m => m.id === memberId);

      if (!member) {
        throw new Error('临时会话成员不存在');
      }
      const inputWithMarker = input + '\n\n**严格遵守**：在你的回复最后必须添加 [[<<>>]] 标记，表示回复结束。';

      const accessMethod = model.accessMethod || 'web';
      const sender = this.senderFactory.getSender(accessMethod);
      const conversationUrl = tempConv.memberUrls?.[memberId];
      const response = await sender.send(inputWithMarker, {
        provider: member.provider,
        model: model.model,
        conversationUrl,
        conversationId: tempConvId,
        conversation: tempConv,
        memberId,
        baseUrl: model.baseUrl || '',
        apiKey: model.apiKey || ''
      });

      const content = response.content;

      if (response.conversationUrl) {
        if (!tempConv.memberUrls) tempConv.memberUrls = {};
        tempConv.memberUrls[memberId] = response.conversationUrl;
        await this.conversationManager.updateConversation(tempConvId, {
          memberUrls: tempConv.memberUrls
        });
      }

      return {
        success: true,
        content: content,
        model: model.name,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[FlowExecutor] 临时会话模型调用失败:', error);
      return {
        success: false,
        content: `错误: ${error.message}`,
        model: model.name,
        timestamp: Date.now()
      };
    }
  }

  async getModel(modelId) {
    const models = await chrome.storage.local.get('models');
    return models.models?.find(m => m.id === modelId) || null;
  }

  async getPrompt(promptId) {
    const prompts = await chrome.storage.local.get('prompts');
    return prompts.prompts?.find(p => p.id === promptId) || null;
  }

  validateFlow(flow) {
    if (!flow.nodes || flow.nodes.length === 0) {
      return { valid: false, errors: ['流程没有节点'] };
    }

    if (!flow.connections || flow.connections.length === 0) {
      return { valid: false, errors: ['流程没有连接'] };
    }

    const nodeIds = new Set(flow.nodes.map(n => n.id));
    const invalidConnections = flow.connections.filter(
      conn => !nodeIds.has(conn.from) || !nodeIds.has(conn.to)
    );

    if (invalidConnections.length > 0) {
      return { valid: false, errors: ['存在无效的连接'] };
    }

    const graph = this.buildExecutionGraph(flow);
    if (!graph.startNode) {
      return { valid: false, errors: ['检测到循环依赖'] };
    }

    return { valid: true, errors: [] };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowExecutor;
}
