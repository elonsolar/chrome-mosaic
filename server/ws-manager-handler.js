/**
 * WebSocket 管理功能处理器
 * 处理会话、提示词、模型、专家等资源的CRUD操作
 * 供MCP和管理工具使用
 */
class WSManagerHandler {
  constructor(messageRouter) {
    this.messageRouter = messageRouter;
  }

  /**
   * 注册WebSocket客户端的管理消息处理
   */
  registerClient(ws) {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('[WSManagerHandler] 解析消息失败:', error);
        this.sendError(ws, null, 'INVALID_JSON', '消息格式错误');
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(ws, message) {
    const { id, type, data } = message;

    if (!type) {
      return this.sendError(ws, id, 'MISSING_TYPE', '缺少消息类型');
    }

    // 只处理管理类消息
    const managementTypes = ['conversation', 'prompt', 'model', 'expert', 'system'];
    const resource = type.split('.')[0];
    if (!managementTypes.includes(resource)) {
      return; // 非管理消息，跳过
    }

    console.log(`[WSManagerHandler] 处理消息: ${type}`, id ? `(id: ${id})` : '');

    // 路由到对应的处理方法 - 支持复合操作如 expert.update
    const parts = type.split('.');
    const action = parts.slice(1).join('.');

    switch (resource) {
      case 'conversation':
        this.handleConversation(ws, id, action, data);
        break;
      case 'prompt':
        this.handlePrompt(ws, id, action, data);
        break;
      case 'model':
        this.handleModel(ws, id, action, data);
        break;
      case 'expert':
        this.handleExpert(ws, id, action, data);
        break;
      case 'system':
        this.handleSystem(ws, id, action, data);
        break;
      default:
        this.sendError(ws, id, 'UNKNOWN_RESOURCE', `未知的资源类型: ${resource}`);
    }
  }

  // ==================== 会话管理 ====================

  async handleConversation(ws, id, action, data) {
    switch (action) {
      case 'list':
        await this.forwardToExtension(ws, id, 'conversation.list', data);
        break;
      case 'get':
        if (!data?.conversationId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少conversationId');
        }
        await this.forwardToExtension(ws, id, 'conversation.get', data);
        break;
      case 'messages':
        if (!data?.conversationId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少conversationId');
        }
        await this.forwardToExtension(ws, id, 'conversation.messages', data);
        break;
      case 'members':
        if (!data?.conversationId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少conversationId');
        }
        await this.forwardToExtension(ws, id, 'conversation.members', data);
        break;
      case 'create':
        await this.forwardToExtension(ws, id, 'conversation.create', data);
        break;
      case 'delete':
        if (!data?.conversationId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少conversationId');
        }
        await this.forwardToExtension(ws, id, 'conversation.delete', data);
        break;
      case 'send':
        if (!data?.conversationId || !data?.message) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少conversationId或message');
        }
        await this.forwardToExtension(ws, id, 'conversation.send', data);
        break;
      default:
        this.sendError(ws, id, 'UNKNOWN_ACTION', `未知的会话操作: ${action}`);
    }
  }

  // ==================== 提示词管理 ====================

  async handlePrompt(ws, id, action, data) {
    switch (action) {
      case 'list':
        await this.forwardToExtension(ws, id, 'prompt.list', data);
        break;
      case 'get':
        if (!data?.promptId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少promptId');
        }
        await this.forwardToExtension(ws, id, 'prompt.get', data);
        break;
      case 'create':
        if (!data?.name || !data?.content) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少name或content');
        }
        await this.forwardToExtension(ws, id, 'prompt.create', data);
        break;
      case 'update':
        if (!data?.promptId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少promptId');
        }
        await this.forwardToExtension(ws, id, 'prompt.update', data);
        break;
      case 'delete':
        if (!data?.promptId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少promptId');
        }
        await this.forwardToExtension(ws, id, 'prompt.delete', data);
        break;
      case 'search':
        await this.forwardToExtension(ws, id, 'prompt.search', data);
        break;
      default:
        this.sendError(ws, id, 'UNKNOWN_ACTION', `未知的提示词操作: ${action}`);
    }
  }

  // ==================== 模型管理 ====================

  async handleModel(ws, id, action, data) {
    switch (action) {
      case 'list':
        await this.forwardToExtension(ws, id, 'model.list', data);
        break;
      case 'get':
        if (!data?.modelId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少modelId');
        }
        await this.forwardToExtension(ws, id, 'model.get', data);
        break;
      case 'create':
        if (!data?.platformId || !data?.code) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少platformId或code');
        }
        await this.forwardToExtension(ws, id, 'model.create', data);
        break;
      case 'update':
        if (!data?.platformId || !data?.modelId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少platformId或modelId');
        }
        await this.forwardToExtension(ws, id, 'model.update', data);
        break;
      case 'delete':
        if (!data?.platformId || !data?.modelId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少platformId或modelId');
        }
        await this.forwardToExtension(ws, id, 'model.delete', data);
        break;
      case 'toggle':
        if (!data?.platformId || !data?.modelId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少platformId或modelId');
        }
        await this.forwardToExtension(ws, id, 'model.toggle', data);
        break;
      case 'platforms':
        await this.forwardToExtension(ws, id, 'model.platforms', data);
        break;
      default:
        this.sendError(ws, id, 'UNKNOWN_ACTION', `未知的模型操作: ${action}`);
    }
  }

  // ==================== 专家管理 ====================

  async handleExpert(ws, id, action, data) {
    switch (action) {
      case 'list':
        await this.forwardToExtension(ws, id, 'expert.list', data);
        break;
      case 'get':
        if (!data?.expertId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少expertId');
        }
        await this.forwardToExtension(ws, id, 'expert.get', data);
        break;
      case 'create':
        // 专家创建可以包含流程设计
        await this.forwardToExtension(ws, id, 'expert.create', data);
        break;
      case 'update':
        if (!data?.expertId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少expertId');
        }
        // 专家更新可以包含流程设计
        await this.forwardToExtension(ws, id, 'expert.update', data);
        break;
      case 'delete':
        if (!data?.expertId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少expertId');
        }
        await this.forwardToExtension(ws, id, 'expert.delete', data);
        break;
      case 'duplicate':
        if (!data?.expertId) {
          return this.sendError(ws, id, 'MISSING_PARAM', '缺少expertId');
        }
        await this.forwardToExtension(ws, id, 'expert.duplicate', data);
        break;
      case 'search':
        await this.forwardToExtension(ws, id, 'expert.search', data);
        break;
      default:
        this.sendError(ws, id, 'UNKNOWN_ACTION', `未知的专家操作: ${action}`);
    }
  }

  // ==================== 系统信息 ====================

  async handleSystem(ws, id, action, data) {
    switch (action) {
      case 'info':
        this.sendSuccess(ws, id, {
          version: '1.0.0',
          connectedClients: this.messageRouter.getConnectedClientsCount(),
          pendingRequests: this.messageRouter.getPendingRequestsCount(),
          timestamp: Date.now()
        });
        break;
      case 'heartbeat':
        this.sendSuccess(ws, id, {
          time: new Date().toISOString(),
          connectedClients: this.messageRouter.getConnectedClientsCount()
        });
        break;
      default:
        this.sendError(ws, id, 'UNKNOWN_ACTION', `未知的系统操作: ${action}`);
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 转发消息到Chrome插件并等待响应
   */
  async forwardToExtension(ws, requestId, type, data) {
    try {
      const response = await this.messageRouter.sendManagerMessage({
        type,
        data,
        requestId
      });

      // 检查是否是来自扩展的错误响应
      if (response && response.success === false) {
        this.sendError(ws, requestId,
          response.error?.code || 'EXTENSION_ERROR',
          response.error?.message || '操作失败'
        );
      } else {
        this.sendSuccess(ws, requestId, response);
      }
    } catch (error) {
      console.error(`[WSManagerHandler] 转发失败 (${type}):`, error);
      this.sendError(ws, requestId, 'FORWARD_FAILED', error.message);
    }
  }

  /**
   * 发送成功响应
   */
  sendSuccess(ws, id, data) {
    if (ws.readyState !== 1) return; // WebSocket.OPEN = 1
    try {
      ws.send(JSON.stringify({
        id,
        success: true,
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('[WSManagerHandler] 发送成功响应失败:', e);
    }
  }

  /**
   * 发送错误响应
   */
  sendError(ws, id, code, message) {
    if (ws.readyState !== 1) return; // WebSocket.OPEN = 1
    try {
      ws.send(JSON.stringify({
        id,
        success: false,
        error: {
          code,
          message
        },
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('[WSManagerHandler] 发送错误响应失败:', e);
    }
  }
}

module.exports = WSManagerHandler;
