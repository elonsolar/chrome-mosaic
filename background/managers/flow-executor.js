class FlowExecutor {
  constructor(tabManager, conversationManager, senderFactory, platformManager) {
    this.tabManager = tabManager;
    this.conversationManager = conversationManager;
    this.senderFactory = senderFactory;
    this.platformManager = platformManager;
  }

  async executeFlow(flow, userInput, context = {}) {
    console.log('[FlowExecutor] ========== 开始执行流程:', flow.name, '==========');
    console.log('[FlowExecutor] 节点数:', flow.nodes?.length);

    if (!flow.nodes || flow.nodes.length === 0) {
      throw new Error('流程没有节点');
    }

    const rawConnections = flow.connections || flow.edges || [];
    flow.connections = rawConnections.map(conn => ({
      id: conn.id,
      from: conn.from || conn.source,
      to: conn.to || conn.target
    }));

    const onProgress = context.onProgress || null;
    const sessionPool = new TemporarySessionPool(this.conversationManager);

    const executionGraph = this.buildExecutionGraph(flow);
    console.log('[FlowExecutor] 执行图构建完成，节点数:', executionGraph.nodes.length);

    try {
      if (onProgress) {
        onProgress({ current: 0, total: executionGraph.nodes.size });
      }

      const finalResult = await this.executeGraph(executionGraph, userInput, context, sessionPool, flow);

      console.log('[FlowExecutor] ========== 流程执行完成 ==========');
      return {
        success: true,
        content: finalResult ? finalResult.content : '',
        nodeResults: finalResult?.nodeResults || [],
        metadata: {
          totalNodes: executionGraph.nodes.size,
          totalDuration: finalResult?.metadata?.totalDuration || 0
        }
      };
    } catch (error) {
      console.error('[FlowExecutor] 流程执行出错:', error.message);

      if (error.resumeInfo) {
        return {
          success: false,
          content: '',
          error: error.message,
          canResume: true,
          resumeInfo: {
            flow: { nodes: flow.nodes, connections: flow.connections },
            userInput,
            context: {
              startNodeInputs: context.startNodeInputs,
              conversationId: context.conversationId,
              memberId: context.memberId
            },
            completedNodeIds: error.resumeInfo.completedNodeIds,
            executionContextSnapshot: error.resumeInfo.executionContextSnapshot,
            nodeResultsSnapshot: error.resumeInfo.nodeResultsSnapshot,
            failedNodeId: error.resumeInfo.failedNodeId,
            failedNodeName: error.resumeInfo.failedNodeName,
            errorMessage: error.resumeInfo.errorMessage
          }
        };
      }

      throw error;
    } finally {
      console.log('[FlowExecutor] 流程执行结束，清理资源');
      await sessionPool.cleanup();
    }
  }

  async resumeFlow(resumeState) {
    const { flow, userInput, context, completedNodeIds, executionContextSnapshot, nodeResultsSnapshot, failedNodeId, failedNodeName, errorMessage } = resumeState;

    console.log('[FlowExecutor] ========== 恢复执行流程 ==========');
    console.log('[FlowExecutor] 已完成节点:', completedNodeIds);
    console.log('[FlowExecutor] 失败节点:', failedNodeId);

    const rawConnections = flow.connections || flow.edges || [];
    flow.connections = rawConnections.map(conn => ({
      id: conn.id,
      from: conn.from || conn.source,
      to: conn.to || conn.target
    }));

    const sessionPool = new TemporarySessionPool(this.conversationManager);
    const executionGraph = this.buildExecutionGraph(flow);
    const onProgress = context.onProgress || null;

    try {
      const finalResult = await this.executeGraph(executionGraph, userInput, context, sessionPool, flow, {
        completedNodeIds: new Set(completedNodeIds),
        executionContextSnapshot: new Map(Object.entries(executionContextSnapshot || {})),
        nodeResultsSnapshot: nodeResultsSnapshot || {},
        failedNodeId
      });

      console.log('[FlowExecutor] ========== 流程恢复执行完成 ==========');
      return {
        success: true,
        content: finalResult ? finalResult.content : '',
        nodeResults: finalResult?.nodeResults || [],
        metadata: {
          totalNodes: executionGraph.nodes.size,
          totalDuration: finalResult?.metadata?.totalDuration || 0
        }
      };
    } catch (error) {
      console.error('[FlowExecutor] 流程恢复执行出错:', error.message);
      if (error.resumeInfo) {
        return {
          success: false,
          content: '',
          error: error.message,
          canResume: true,
          resumeInfo: {
            flow: { nodes: flow.nodes, connections: flow.connections },
            userInput,
            context: {
              startNodeInputs: context.startNodeInputs,
              conversationId: context.conversationId,
              memberId: context.memberId
            },
            completedNodeIds: error.resumeInfo.completedNodeIds,
            executionContextSnapshot: error.resumeInfo.executionContextSnapshot,
            nodeResultsSnapshot: error.resumeInfo.nodeResultsSnapshot,
            failedNodeId: error.resumeInfo.failedNodeId,
            failedNodeName: error.resumeInfo.failedNodeName,
            errorMessage: error.resumeInfo.errorMessage
          }
        };
      }
      throw error;
    } finally {
      await sessionPool.cleanup();
    }
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

    // 连接格式已在 executeFlow 中统一为 from/to
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

    const startNode = startNodes[0];
    console.log('[FlowExecutor] startNode:', startNode.id);
    console.log('[FlowExecutor] startNode outgoing:', outgoingConnections.get(startNode.id));

    return {
      nodes: nodeMap,
      outgoingConnections,
      incomingConnections,
      startNode
    };
  }

  async executeGraph(graph, userInput, context, sessionPool, flow, resumeState = null) {
    const { nodes, outgoingConnections, incomingConnections, startNode } = graph;
    const nodeResults = new Map();
    const pendingExecutions = new Map();
    
    const executionDetails = [];
    let executionOrder = 0;
    const startTime = Date.now();

    const executionContext = new Map();

    if (resumeState?.executionContextSnapshot) {
      const snapshot = resumeState.executionContextSnapshot instanceof Map
        ? resumeState.executionContextSnapshot
        : Object.entries(resumeState.executionContextSnapshot);
      for (const [k, v] of snapshot) {
        executionContext.set(k, v);
      }
    }

    const startNodeData = nodes.get(startNode.id);
    console.log('[FlowExecutor] 开始节点:', startNode.id, '数据:', startNodeData);
    if (startNodeData && startNodeData.data?.outputs) {
      const startNodeInputs = context.startNodeInputs || {};
      startNodeData.data.outputs.forEach(output => {
        const contextKey = `${startNode.id}.${output.name}`;
        const inputValue = startNodeInputs[output.name] || '';
        executionContext.set(contextKey, inputValue);
        console.log('[FlowExecutor] 初始化执行变量:', contextKey, '=', inputValue);
      });
    }

    const completedNodeIds = resumeState ? new Set(resumeState.completedNodeIds || []) : new Set();

    if (resumeState?.nodeResultsSnapshot) {
      for (const [id, result] of Object.entries(resumeState.nodeResultsSnapshot)) {
        nodeResults.set(id, result);
      }
    }

    const _buildResumeInfo = (failedNodeId, failedNodeName, errorMessage) => {
      const contextSnapshot = {};
      for (const [k, v] of executionContext) {
        contextSnapshot[k] = v;
      }
      const completedIds = [];
      for (const id of nodeResults.keys()) {
        if (id !== failedNodeId) completedIds.push(id);
      }
      for (const id of completedNodeIds) {
        if (!completedIds.includes(id) && id !== failedNodeId) completedIds.push(id);
      }
      const nodeResultsSnapshot = {};
      for (const [id, result] of nodeResults) {
        if (id !== failedNodeId) {
          nodeResultsSnapshot[id] = { success: result.success, content: result.content, timestamp: result.timestamp };
        }
      }
      return {
        completedNodeIds: completedIds,
        executionContextSnapshot: contextSnapshot,
        nodeResultsSnapshot,
        failedNodeId,
        failedNodeName,
        errorMessage
      };
    };

    const executeNode = async (nodeId, input) => {
      console.log('[FlowExecutor] executeNode 被调用, nodeId:', nodeId, 'input:', input?.substring(0, 50));

      if (completedNodeIds.has(nodeId) && nodeResults.has(nodeId)) {
        console.log('[FlowExecutor] 跳过已完成节点:', nodeId);
        const cachedResult = nodeResults.get(nodeId);
        // 跳过已完成节点，但仍需继续执行下游节点
        const connections = flow.connections || [];
        const outgoing = connections.filter(c => (c.from || c.source) === nodeId);

        if (outgoing.length === 0) {
          console.log('[FlowExecutor] 已完成节点是终点:', nodeId);
          return cachedResult;
        }

        if (outgoing.length > 1) {
          console.log(`[FlowExecutor] 已完成节点并行执行 ${outgoing.length} 个子节点`);
          const settled = await Promise.allSettled(
            outgoing.map(conn => executeNode((conn.to || conn.target), cachedResult.content))
          );
          const failedBranch = settled.find(s => s.status === 'rejected');
          if (failedBranch) throw failedBranch.reason;
          return { success: true, content: cachedResult.content, branches: settled.map(s => s.value), metadata: { parallel: true } };
        } else {
          console.log('[FlowExecutor] 已完成节点串行执行子节点');
          return await executeNode((outgoing[0].to || outgoing[0].target), cachedResult.content);
        }
      }

      if (pendingExecutions.has(nodeId)) {
        return await pendingExecutions.get(nodeId);
      }

      if (nodeResults.has(nodeId)) {
        return nodeResults.get(nodeId);
      }

      const executionPromise = (async () => {
        const nodeStartTime = Date.now();
        const node = nodes.get(nodeId);
        console.log('[FlowExecutor] 执行节点:', node.name || node.data?.title || nodeId, '类型:', node.type);

        if (context.onProgress) {
          context.onProgress({
            current: executionOrder,
            total: nodes.size,
            nodeName: node.name || node.data?.title || nodeId,
            nodeId,
            status: 'started',
            duration: 0
          });
        }

        const incomingConns = incomingConnections.get(nodeId) || [];
        if (incomingConns.length > 1) {
          console.log(`[FlowExecutor] 节点 ${node.name || nodeId} 是汇聚节点，等待 ${incomingConns.length} 个上游节点`);
          for (const conn of incomingConns) {
            if (!nodeResults.has(conn.from)) {
              if (pendingExecutions.has(conn.from)) {
                console.log(`[FlowExecutor]   等待上游: ${nodes.get(conn.from)?.name || conn.from}`);
                await pendingExecutions.get(conn.from);
              }
            }
          }
          console.log(`[FlowExecutor] 所有上游节点完成，继续执行 ${node.name || nodeId}`);
        }

        let result;
        switch (node.type) {
          case '1':
          case '2':
            console.log('[FlowExecutor] 执行开始/结束节点');
            result = { success: true, content: input, timestamp: Date.now() };
            break;

          case '3':
            console.log('[FlowExecutor] 执行LLM节点');
            result = await this.executeLLMNode(node, input, sessionPool, context, executionContext);
            break;

          case '45':
            console.log('[FlowExecutor] 执行HTTP节点');
            result = await this.executeHttpNode(node, input);
            break;

          case '5':
            console.log('[FlowExecutor] 执行代码节点');
            result = await this.executeCodeNode(node, input);
            break;

          default:
            console.warn('[FlowExecutor] 不支持的节点类型:', node.type);
            result = {
              success: false,
              content: '',
              error: `不支持的节点类型: ${node.type}`,
              timestamp: Date.now()
            };
        }

        nodeResults.set(nodeId, result);

        if (result.success && node.data?.outputs && node.type !== '1' && node.type !== '2') {
          node.data.outputs.forEach(output => {
            const contextKey = `${node.id}.${output.name}`;
            executionContext.set(contextKey, result.content);
            console.log('[FlowExecutor] 保存执行变量:', contextKey, '=', result.content?.substring(0, 50));
          });
        }

        const nodeDuration = Date.now() - nodeStartTime;

        const detail = {
          nodeId,
          nodeName: node.name || node.data?.title || nodeId,
          order: ++executionOrder,
          duration: nodeDuration,
          result: { ...result },
          timestamp: Date.now()
        };
        executionDetails.push(detail);

        if (context.onProgress) {
          context.onProgress({
            current: executionOrder,
            total: nodes.size,
            nodeName: detail.nodeName,
            nodeId,
            duration: nodeDuration,
            status: 'completed'
          });
        }

        if (!result.success) {
          const errorMsg = `节点 ${detail.nodeName} 执行失败: ${result.error || result.content || '未知错误'}`;
          console.error('[FlowExecutor]', errorMsg);
          const resumeInfo = _buildResumeInfo(nodeId, detail.nodeName, errorMsg);
          const error = new Error(errorMsg);
          error.resumeInfo = resumeInfo;
          throw error;
        }

        return result;
      })();

      pendingExecutions.set(nodeId, executionPromise);

      const result = await executionPromise;

      try {
        const connections = flow.connections || [];
        const outgoing = connections.filter(c => (c.from || c.source) === nodeId);

        if (outgoing.length === 0) {
          console.log('[FlowExecutor] 到达终点节点:', nodeId);
          return result;
        }

        const getNextNode = (conn) => {
          const targetId = conn.to || conn.target;
          return nodes.get(targetId);
        };

        if (outgoing.length > 1) {
          console.log(`[FlowExecutor] 并行执行 ${outgoing.length} 个子节点`);

          const settled = await Promise.allSettled(
            outgoing.map(conn => executeNode((conn.to || conn.target), result.content))
          );

          const failedBranch = settled.find(s => s.status === 'rejected');
          if (failedBranch) {
            throw failedBranch.reason;
          }

          const branchResults = settled.map(s => s.value);
          return {
            success: true,
            content: result.content,
            branches: branchResults,
            metadata: { parallel: true }
          };
        } else {
          console.log('[FlowExecutor] 串行执行子节点');
          return await executeNode((outgoing[0].to || outgoing[0].target), result.content);
        }
      } finally {
        pendingExecutions.delete(nodeId);
      }
    };

    const finalResult = await executeNode(startNode.id, userInput);
    const totalDuration = Date.now() - startTime;

    return {
      success: true,
      content: finalResult.content || '',
      finalResult,
      nodeResults: executionDetails,
      metadata: {
        totalNodes: nodes.size,
        totalDuration,
        ...finalResult.metadata
      }
    };
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

  resolveValue(valueExpr, executionContext) {
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
          return executionContext.get(contextKey) || '';
        }
      }
    }

    return String(valueExpr);
  }

  replaceVariableReferences(text, executionContext) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    return text.replace(/\{\{(.+?)\}\}/g, (match, refStr) => {
      const parts = refStr.split('.');
      if (parts.length >= 2) {
        const nodeId = parts[0];
        const varName = parts.slice(1).join('.');
        const contextKey = `${nodeId}.${varName}`;
        const value = executionContext.get(contextKey);
        return value !== undefined ? value : match;
      }
      return match;
    });
  }

  async executeLLMNode(node, input, sessionPool, context, executionContext) {
    console.log('[FlowExecutor] 执行LLM节点:', node.name || node.data?.title, '节点ID:', node.id);

    const storedModel = node.data?.model;
    let modelId = storedModel?.modelId || storedModel?.id;

    if (!modelId) {
      const allModels = await this.platformManager.getAllModels();
      const available = allModels.filter(m => m.enabled !== false);
      if (available.length === 0) {
        return {
          success: false,
          content: '',
          error: 'LLM 节点未配置模型，且没有可用的模型',
          timestamp: Date.now()
        };
      }
      const fallback = available[0];
      modelId = fallback.id;
      console.log('[FlowExecutor] LLM节点未配置模型，自动使用:', fallback.code, '(' + fallback.platformName + ')');
    }

    const model = await this.platformManager.getModelById(modelId);
    if (!model) {
      return {
        success: false,
        content: '',
        error: '模型配置不存在或已被删除',
        timestamp: Date.now()
      };
    }

    const inputParams = node.data?.$$input_decorator$$?.inputParameters || [];
    const resolvedInputs = {};
    inputParams.forEach(param => {
      const inputValue = this.resolveValue(param.input, executionContext);
      resolvedInputs[param.name] = inputValue;
      console.log('[FlowExecutor] 解析输入参数:', param.name, '=', String(inputValue).substring(0, 50));
    });

    let prompt = node.data?.$$prompt_decorator$$?.prompt || '';
    let systemPrompt = node.data?.$$prompt_decorator$$?.systemPrompt || '';

    prompt = this.replaceVariableReferences(prompt, executionContext);
    systemPrompt = this.replaceVariableReferences(systemPrompt, executionContext);

    Object.keys(resolvedInputs).forEach(inputName => {
      const regex = new RegExp(`\\{\\{${inputName}\\}\\}`, 'g');
      systemPrompt = systemPrompt.replace(regex, resolvedInputs[inputName]);
      prompt = prompt.replace(regex, resolvedInputs[inputName]);
    });

    const sender = this.senderFactory.getSender(model.accessMethod || 'web');

    let message;
    if (model.accessMethod === 'api') {
      message = [];

      if (systemPrompt) {
        message.push({ role: 'system', content: systemPrompt });
      }

      const userContent = inputParams.length > 0 ? prompt : `${prompt}\n\n${input}`;
      message.push({ role: 'user', content: userContent });
    } else {
      const safeSystemPrompt = systemPrompt || '';
      const safePrompt = prompt || '';
      const safeInput = input || '';

      if (inputParams.length > 0) {
        message = safeSystemPrompt
          ? `[系统]\n${safeSystemPrompt}\n\n[用户]\n${safePrompt}`
          : safePrompt;
      } else {
        message = safeSystemPrompt
          ? `[系统]\n${safeSystemPrompt}\n\n[用户]\n${safePrompt}\n\n${safeInput}`
          : `${safePrompt}\n\n${safeInput}`;
      }
    }

    try {
      const response = await sender.send(message, {
        model: model.code,
        baseUrl: model.baseUrl || '',
        apiKey: model.apiKey || '',
        webUrl: model.webUrl || '',
        conversationId: context?.conversationId,
        memberId: context?.memberId
      });

      // 删除网页平台的会话并关闭标签页
      if (response.conversationUrl && this.tabManager) {
        console.log('[FlowExecutor] 删除LLM节点会话:', response.conversationUrl);
        // 先删除会话，再关闭标签页
        await this.deletePlatformConversation(response.conversationUrl).catch(err => {
          console.warn('[FlowExecutor] 删除会话失败:', err.message);
        });
      }

      return {
        success: true,
        content: response.content,
        conversationUrl: response.conversationUrl,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[FlowExecutor] LLM节点执行失败:', error);
      return {
        success: false,
        content: '',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  async deletePlatformConversation(conversationUrl) {
    try {
      const tab = await this.tabManager.openPlatformTab(conversationUrl, false);
      
      await new Promise(resolve => setTimeout(resolve, 2000));

      let pingSuccess = false;
      for (let i = 0; i < 5; i++) {
        try {
          const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
          if (pingResponse && pingResponse.status === 'ok') {
            pingSuccess = true;
            break;
          }
        } catch (pingError) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!pingSuccess) {
        throw new Error('Content Script未就绪');
      }

      // 发送删除会话消息
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'deleteConversation',
        conversationUrl: conversationUrl
      });

      if (!response || !response.success) {
        throw new Error(response?.error || '删除失败');
      }

      console.log(`[FlowExecutor] 平台会话删除成功`);

      try {
        await chrome.tabs.remove(tab.id);
        console.log(`[FlowExecutor] 已关闭删除操作标签页`);
      } catch (closeError) {
        console.warn(`[FlowExecutor] 关闭标签页失败（可能已被用户关闭）:`, closeError.message);
      }

      return true;
    } catch (error) {
      console.error('[FlowExecutor] 删除平台会话失败:', error);
      return false;
    }
  }

  async executeHttpNode(node, input) {
    const inputs = node.data?.inputs || {};
    const method = inputs.method || 'GET';
    const url = inputs.url || input;
    const body = inputs.body || '';

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
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `HTTP请求失败: ${error.message}`,
        timestamp: Date.now()
      };
    }
  }

  async executeCodeNode(node, input) {
    const data = node.data || {};
    const language = data.language || 'javascript';
    const code = data.code || '';

    try {
      let result;
      if (language === 'javascript') {
        const context = { input };
        const fn = new Function('context', code);
        result = fn(context);
      } else {
        throw new Error(`不支持的代码语言: ${language}`);
      }

      return {
        success: true,
        content: String(result),
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `代码执行失败: ${error.message}`,
        timestamp: Date.now()
      };
    }
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

  async execute(flowData, startNodeInputs = {}, onProgress = null) {
    console.log('[FlowExecutor] 执行流程');

    const flow = this.transformFromFlowData(flowData);
    const userInput = this.buildUserInput(startNodeInputs, flowData);

    const result = await this.executeFlow(flow, userInput, {
      onProgress,
      startNodeInputs,
      flowData
    });

    return this.transformToTestResult(result, flowData);
  }

  transformFromFlowData(flowData) {
    const connections = flowData.edges.map(edge => ({
      from: edge.source || edge.from,
      to: edge.target || edge.to
    }));

    return {
      name: 'Test Run',
      nodes: flowData.nodes,
      connections
    };
  }

  buildUserInput(startNodeInputs, flowData) {
    const startNode = flowData.nodes.find(n => n.type === '1');
    if (!startNode) return '(无输入)';

    const inputs = startNode.data?.outputs || [];
    if (inputs.length === 0) {
      const inputValues = Object.values(startNodeInputs).filter(v => v);
      if (inputValues.length === 0) {
        return '(无输入)';
      }
      return JSON.stringify(startNodeInputs);
    }

    return inputs.map(output => 
      `${output.name}: ${startNodeInputs[output.name] || ''}`
    ).join('\n');
  }

  transformToTestResult(result, flowData) {
    if (!result.success && result.canResume) {
      return {
        success: false,
        finalOutput: '',
        error: result.error,
        canResume: true,
        resumeInfo: result.resumeInfo,
        nodeResults: [],
        executionContext: {},
        executionLog: []
      };
    }

    const endNode = flowData.nodes.find(n => n.type === '2');
    let finalOutput = result.content || '';

    if (endNode && result.nodeResults) {
      const endResult = result.nodeResults.find(r => r.nodeId === endNode.id);
      if (endResult) {
        finalOutput = endResult.result.content || '';
      }
    }

    return {
      success: result.success,
      finalOutput,
      nodeResults: result.nodeResults || [],
      executionContext: {},
      executionLog: result.nodeResults?.map(detail => ({
        phase: 'node',
        message: `#${detail.order} ${detail.nodeName} (${detail.duration}ms)${detail.result.success ? '' : ' 失败: ' + (detail.result.error || '')}`,
        timestamp: detail.timestamp,
        ...detail
      })) || []
    };
  }
  async executeSingleNode(node, inputs = {}) {
    console.log('[FlowExecutor] 执行单节点测试:', node.name || node.data?.title);

    const storedModel = node.data?.model;
    const modelId = storedModel?.modelId || storedModel?.id;
    if (!modelId) {
      return { success: false, content: '', error: 'LLM 节点未配置模型' };
    }

    const model = await this.platformManager.getModelById(modelId);
    if (!model) {
      return { success: false, content: '', error: '模型配置不存在或已被删除' };
    }

    let prompt = node.data?.$$prompt_decorator$$?.prompt || '';
    let systemPrompt = node.data?.$$prompt_decorator$$?.systemPrompt || '';

    Object.keys(inputs).forEach(name => {
      const regex = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
      systemPrompt = systemPrompt.replace(regex, inputs[name]);
      prompt = prompt.replace(regex, inputs[name]);
    });

    const sender = this.senderFactory.getSender(model.accessMethod || 'web');

    let message;
    if (model.accessMethod === 'api') {
      message = [];
      if (systemPrompt) {
        message.push({ role: 'system', content: systemPrompt });
      }
      message.push({ role: 'user', content: prompt });
    } else {
      message = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    }

    try {
      const response = await sender.send(message, {
        model: model.code,
        baseUrl: model.baseUrl || '',
        apiKey: model.apiKey || '',
        webUrl: model.webUrl || ''
      });
      return {
        success: true,
        content: response.content,
        conversationUrl: response.conversationUrl
      };
    } catch (error) {
      console.error('[FlowExecutor] 单节点执行失败:', error);
      return {
        success: false,
        content: '',
        error: error.message
      };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowExecutor;
}
