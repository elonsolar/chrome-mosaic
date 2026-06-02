const { v4: uuidv4 } = require('uuid');

class MCPHandler {
  constructor(messageRouter) {
    this.messageRouter = messageRouter;
    this.sessions = new Map();
    this.serverInfo = {
      name: 'free-ai-refactor',
      version: '1.0.0'
    };
    this.capabilities = {
      tools: {},
      resources: {},
      prompts: {}
    };
  }

  handleGet(req, res) {
    const accept = req.headers['accept'] || '';

    if (accept.includes('text/event-stream')) {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !this.sessions.has(sessionId)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid or missing session' }
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('mcp-session-id', sessionId);
      res.flushHeaders();

      const session = this.sessions.get(sessionId);
      session.sseResponse = res;

      req.on('close', () => {
        if (session.sseResponse === res) {
          session.sseResponse = null;
        }
      });

      return;
    }

    res.json({
      name: this.serverInfo.name,
      version: this.serverInfo.version,
      protocol: 'MCP',
      protocolVersion: '2024-11-05',
      endpoints: { mcp: '/mcp' }
    });
  }

  handleDelete(req, res) {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
    res.sendStatus(204);
  }

  async handleRequest(req, res) {
    try {
      const body = req.body;
      const { method, params, id } = body;
      const isNotification = id === undefined || id === null;

      console.log(`[MCP] 请求: ${method}`, id ? `(id: ${id})` : '(notification)');

      if (isNotification) {
        console.log(`[MCP] 通知: ${method}，返回 202`);
        return res.status(202).end();
      }

      let sessionId = req.headers['mcp-session-id'];
      let isNewSession = false;

      if (!sessionId || !this.sessions.has(sessionId)) {
        sessionId = uuidv4();
        isNewSession = true;
        this.sessions.set(sessionId, { createdAt: Date.now(), sseResponse: null });
      }

      res.setHeader('mcp-session-id', sessionId);

      let result;

      switch (method) {
        case 'initialize':
          result = this.handleInitialize(params);
          break;
        case 'notifications/initialized':
          return res.status(202).end();
        case 'tools/list':
          result = this.handleToolsList();
          break;
        case 'tools/call':
          result = await this.handleToolsCall(params);
          break;
        case 'resources/list':
          result = this.handleResourcesList();
          break;
        case 'resources/read':
          result = await this.handleResourcesRead(params);
          break;
        case 'prompts/list':
          result = this.handlePromptsList();
          break;
        case 'prompts/get':
          result = await this.handlePromptsGet(params);
          break;
        case 'ping':
          result = {};
          break;
        default:
          return res.status(400).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` }
          });
      }

      const accept = req.headers['accept'] || '';
      if (accept.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        const data = JSON.stringify({ jsonrpc: '2.0', id, result });
        res.write(`event: message\ndata: ${data}\n\n`);
        res.end();
      } else {
        res.json({ jsonrpc: '2.0', id, result });
      }

    } catch (error) {
      console.error('[MCP] 错误:', error);
      const accept = req.headers['accept'] || '';
      if (accept.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream');
        const data = JSON.stringify({
          jsonrpc: '2.0',
          id: req.body.id,
          error: { code: -32000, message: error.message }
        });
        res.write(`event: message\ndata: ${data}\n\n`);
        res.end();
      } else {
        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: { code: -32000, message: error.message }
        });
      }
    }
  }

  handleInitialize(params) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo
    };
  }

  handleToolsList() {
    return {
      tools: [
        // ==================== 会话管理 ====================
        {
          name: 'get_conversations',
          description: `获取所有会话列表。
返回值: 会话数组，每个会话包含id、name、mode、members、messages等字段。
使用场景: 查看所有已创建的会话，获取会话ID用于后续操作。`,
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_conversation',
          description: `获取单个会话详情。
返回值: 完整的会话对象，包含成员列表、消息历史、模式设置等。
使用场景: 查看特定会话的详细信息。`,
          inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'string', description: '会话ID，可通过get_conversations获取' } },
            required: ['conversationId']
          }
        },
        {
          name: 'get_conversation_messages',
          description: `获取会话的消息列表。
返回值: 消息数组，每条消息包含id、content、memberId、type、timestamp等字段。
消息类型(type): "user"=用户消息, "member"=AI成员回复, "tip"=系统提示, "intro"=自我介绍。
使用场景: 查看会话的对话历史。`,
          inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'string', description: '会话ID' } },
            required: ['conversationId']
          }
        },
        {
          name: 'get_conversation_members',
          description: `获取会话的成员列表。
返回值: 成员数组，每个成员包含id、name、platformId、modelId、modelCode、systemPrompt等字段。
使用场景: 查看会话中有哪些AI成员参与。`,
          inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'string', description: '会话ID' } },
            required: ['conversationId']
          }
        },
        {
          name: 'create_conversation',
          description: `创建新会话。

【调用步骤】
1. 先调用 get_platforms 获取平台列表，拿到 platformId
2. 再调用 get_models 获取模型列表，拿到 modelId、modelCode、platformName、accessMethod
3. 组装 members 数组，调用本方法创建会话

【模式说明】
- brainstorming: 头脑风暴，各成员独立回答，并行回复
- discussion: 圆桌讨论，成员按顺序发言，共享上下文
- expertqa: 专家问答，使用专家流程，需在options中指定expertId

【完整调用示例 - 头脑风暴模式】
{
  "name": "代码优化讨论",
  "mode": "brainstorming",
  "members": [
    {
      "id": "member_abc123",
      "name": "DeepSeek",
      "platformId": "plt-xxx",
      "modelId": "model-xxx",
      "modelCode": "deepseek",
      "platformName": "网页",
      "accessMethod": "web",
      "color": "#10b981",
      "systemPrompt": ""
    },
    {
      "id": "member_def456",
      "name": "千问",
      "platformId": "plt-xxx",
      "modelId": "model-yyy",
      "modelCode": "qianwen",
      "platformName": "网页",
      "accessMethod": "web",
      "color": "#10b981",
      "systemPrompt": ""
    }
  ]
}

【完整调用示例 - 专家问答模式】
{
  "name": "代码审查",
  "mode": "expertqa",
  "members": [],
  "options": {
    "expertId": "expert-xxx"
  }
}

【成员对象字段说明】
- id: 唯一标识，建议 "member_" + 随机字符串
- name: 成员显示名称
- platformId: 从 get_platforms 获取
- modelId: 从 get_models 获取
- modelCode: 从 get_models 获取，如 "deepseek"
- platformName: 从 get_models 获取，如 "网页"
- accessMethod: 从 get_models 获取，"web" 或 "api"
- color: 颜色值，如 "#10b981"
- systemPrompt: 可选，成员的系统提示词`,
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '会话名称' },
              mode: { type: 'string', description: '会话模式: brainstorming(头脑风暴), discussion(圆桌讨论), expertqa(专家问答)', enum: ['brainstorming', 'discussion', 'expertqa'] },
              members: { type: 'array', description: '成员数组，expertqa模式可传空数组[]', items: { type: 'object' } },
              options: { type: 'object', description: '选项，expertqa模式需要 { "expertId": "专家ID" }' }
            },
            required: ['name']
          }
        },
        {
          name: 'update_conversation',
          description: `更新会话信息。
可更新字段:
- name: 会话名称
- members: 成员列表
- memberOrder: 成员发言顺序
- memberSettings: 成员设置
- mode: 会话模式

返回值: 更新后的会话对象。`,
          inputSchema: {
            type: 'object',
            properties: {
              conversationId: { type: 'string', description: '会话ID' },
              updates: { type: 'object', description: '要更新的字段和值' }
            },
            required: ['conversationId', 'updates']
          }
        },
        {
          name: 'delete_conversation',
          description: `删除会话。
注意: 此操作不可逆，会删除会话及其所有消息历史。
返回值: { success: true }`,
          inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'string', description: '会话ID' } },
            required: ['conversationId']
          }
        },
        {
          name: 'send_message',
          description: `发送消息到会话。
消息将被发送给会话中的所有AI成员，成员会根据会话模式（并行或顺序）进行回复。
返回值: 包含新消息的会话对象。
使用场景: 向会话发送用户消息，触发AI成员回复。`,
          inputSchema: {
            type: 'object',
            properties: {
              conversationId: { type: 'string', description: '会话ID' },
              message: { type: 'string', description: '消息内容' }
            },
            required: ['conversationId', 'message']
          }
        },
        // ==================== 提示词管理 ====================
        {
          name: 'get_prompts',
          description: `获取所有提示词列表。
返回值: 提示词数组，每个提示词包含id、name、content、tags、isBuiltin等字段。
使用场景: 查看可用的提示词，获取提示词ID用于配置成员的systemPrompt。`,
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_prompt',
          description: `获取单个提示词详情。
返回值: 完整的提示词对象。`,
          inputSchema: {
            type: 'object',
            properties: { promptId: { type: 'string', description: '提示词ID' } },
            required: ['promptId']
          }
        },
        {
          name: 'create_prompt',
          description: `创建新提示词。
提示词用于定义AI成员的行为和角色，可以分配给会话成员的systemPrompt字段。
返回值: 创建成功的提示词对象。`,
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '提示词名称，如"代码审查专家"' },
              content: { type: 'string', description: '提示词内容，定义AI的行为规则' },
              tags: { type: 'array', description: '标签数组，用于分类和搜索', items: { type: 'string' } }
            },
            required: ['name', 'content']
          }
        },
        {
          name: 'update_prompt',
          description: `更新提示词。
可更新字段: name、content、tags。
返回值: 更新后的提示词对象。`,
          inputSchema: {
            type: 'object',
            properties: {
              promptId: { type: 'string', description: '提示词ID' },
              updates: { type: 'object', description: '要更新的字段和值' }
            },
            required: ['promptId', 'updates']
          }
        },
        {
          name: 'delete_prompt',
          description: `删除提示词。
注意: 内置提示词(builtin)可能无法删除。
返回值: { success: true }`,
          inputSchema: {
            type: 'object',
            properties: { promptId: { type: 'string', description: '提示词ID' } },
            required: ['promptId']
          }
        },
        {
          name: 'search_prompts',
          description: `搜索提示词。
搜索范围: 提示词名称、内容、描述。
返回值: 匹配的提示词数组。`,
          inputSchema: {
            type: 'object',
            properties: { keyword: { type: 'string', description: '搜索关键词' } },
            required: ['keyword']
          }
        },
        // ==================== 模型管理 ====================
        {
          name: 'get_models',
          description: `获取所有模型列表。
返回值: 模型数组，每个模型包含id、code、platformId、platformName、accessMethod、webUrl等字段。
accessMethod: "web"=网页版(需要浏览器标签页), "api"=API调用(需要配置apiKey)。
使用场景: 查看可用模型，获取modelId和platformId用于创建会话成员。`,
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_model',
          description: `获取单个模型详情。
返回值: 完整的模型对象，包含配置信息。`,
          inputSchema: {
            type: 'object',
            properties: { modelId: { type: 'string', description: '模型ID' } },
            required: ['modelId']
          }
        },
        {
          name: 'get_platforms',
          description: `获取所有平台列表。
返回值: 平台数组，每个平台包含id、platformName、providerId、models等字段。
平台代表AI服务提供商，如"网页"(支持DeepSeek、豆包、千问、Kimi)、"阿里百炼"、"智谱"等。
使用场景: 查看可用平台和平台下的模型配置。`,
          inputSchema: { type: 'object', properties: {} }
        },
        // ==================== 专家管理 ====================
        {
          name: 'get_experts',
          description: `获取所有专家列表。
返回值: 专家数组，每个专家包含id、name、description、icon、nodes、connections等字段。
专家是预定义的AI工作流程，包含多个处理节点和连接关系。
使用场景: 查看可用专家，获取expertId用于创建expertqa模式的会话。`,
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_expert',
          description: `获取单个专家详情。
返回值: 完整的专家对象，包含流程定义(nodes和connections)。`,
          inputSchema: {
            type: 'object',
            properties: { expertId: { type: 'string', description: '专家ID' } },
            required: ['expertId']
          }
        },
        {
          name: 'create_expert',
          description: `创建新专家，可包含流程设计。

【调用步骤】
1. 先调用 get_models 获取可用模型列表
2. 组装 nodes 和 connections，调用本方法创建专家

【model字段格式】
从get_models获取模型数据后，按以下格式填入：
{
  "modelId": "模型ID（get_models返回的id字段）",
  "platformId": "平台ID（get_models返回的platformId字段）",
  "name": "显示名称，格式: code(platformName)，如 deepseek(网页)"
}

示例：若get_models返回 {"id":"model-xxx","code":"deepseek","platformId":"plt-xxx","platformName":"网页"}
则model字段填：{"modelId":"model-xxx","platformId":"plt-xxx","name":"deepseek(网页)"}

【变量引用格式】
引用上游节点输出变量时，用 {{节点标题.变量名}} 格式：
{
  "type": "ref",
  "content": {
    "source": "block-output",
    "blockID": "上游节点ID",
    "name": "上游节点outputs中的name值"
  }
}

在prompt中使用变量: {{变量名}}  ← 用name值，不是key

【完整示例 - 问题解决专家】
{
  "name": "问题解决专家",
  "description": "分析问题并提供解决方案",
  "icon": "🔧",
  "nodes": [
    {
      "id": "start",
      "type": "1",
      "data": {
        "title": "开始",
        "description": "流程的起始点",
        "outputs": [{"name": "user_input", "type": "string"}],  // name是变量标识，引用和显示都用它
        "nodeMeta": {"title": "开始", "description": "流程的起始点", "icon": "/nodes/start.svg", "mainColor": "#52C41A"}
      },
      "position": {"x": 100, "y": 250}
    },
    {
      "id": "node-analyze",
      "type": "3",
      "data": {
        "title": "问题分析",
        "description": "分析用户问题",
        "batchMode": "single",
        "model": {"modelId": "模型ID", "platformId": "平台ID", "name": "code(platformName)"},
        "$$input_decorator$$": {
          "inputParameters": [
            {
              "name": "user_input",  // 本节点变量名，用于prompt中{{user_input}}
              "input": {
                "type": "ref",
                "content": {
                  "source": "block-output",
                  "blockID": "start",
                  "name": "user_input"  // 对应start节点outputs中的name
                }
              }
            }
          ],
          "chatHistorySetting": {"enableChatHistory": false, "chatHistoryRound": 5}
        },
        "$$prompt_decorator$$": {"systemPrompt": "你是一个问题分析专家。", "prompt": "请分析以下问题，找出关键要素和根本原因：\\n\\n{{user_input}}"},
        "batch": {"batchSize": 10},
        "fcParam": [],
        "outputs": [{"name": "analysis", "type": "string"}],
        "nodeMeta": {"title": "问题分析", "description": "分析用户问题", "icon": "/nodes/llm.svg", "mainColor": "#1890FF"}
      },
      "position": {"x": 400, "y": 250}
    },
    {
      "id": "node-solve",
      "type": "3",
      "data": {
        "title": "解决方案",
        "description": "提供解决方案",
        "batchMode": "single",
        "model": {"modelId": "模型ID", "platformId": "平台ID", "name": "code(platformName)"},
        "$$input_decorator$$": {
          "inputParameters": [
            {
              "name": "analysis",  // 本节点变量名，用于prompt中{{analysis}}
              "input": {
                "type": "ref",
                "content": {
                  "source": "block-output",
                  "blockID": "node-analyze",
                  "name": "analysis"  // 对应node-analyze节点outputs中的name
                }
              }
            }
          ],
          "chatHistorySetting": {"enableChatHistory": false, "chatHistoryRound": 5}
        },
        "$$prompt_decorator$$": {"systemPrompt": "你是一个问题解决专家。", "prompt": "基于以下分析，提供可行的解决方案：\\n\\n{{analysis}}"},
        "batch": {"batchSize": 10},
        "fcParam": [],
        "outputs": [{"name": "solution", "type": "string"}],
        "nodeMeta": {"title": "解决方案", "description": "提供解决方案", "icon": "/nodes/llm.svg", "mainColor": "#1890FF"}
      },
      "position": {"x": 700, "y": 250}
    },
    {
      "id": "end",
      "type": "2",
      "data": {
        "title": "结束",
        "description": "流程的终止点",
        "inputs": {
          "terminatePlan": "return_variables",
          "content": {"type": "literal", "content": "问题分析：\\n{{analysis}}\\n\\n解决方案：\\n{{solution}}"},
          "inputParameters": [
            {
              "name": "analysis",
              "input": {
                "type": "ref",
                "content": {
                  "source": "block-output",
                  "blockID": "node-analyze",
                  "name": "analysis"
                }
              }
            },
            {
              "name": "solution",
              "input": {
                "type": "ref",
                "content": {
                  "source": "block-output",
                  "blockID": "node-solve",
                  "name": "solution"
                }
              }
            }
          ],
          "streamingOutput": false
        },
        "nodeMeta": {"title": "结束", "description": "流程的终止点", "icon": "/nodes/end.svg", "mainColor": "#FF4D4F"}
      },
      "position": {"x": 1000, "y": 250}
    }
  ],
  "connections": [
    {"id": "conn-1", "source": "start", "target": "node-analyze"},
    {"id": "conn-2", "source": "node-analyze", "target": "node-solve"},
    {"id": "conn-3", "source": "node-solve", "target": "end"}
  ]
}

【节点类型说明】
- "1": 开始节点（必须有，id必须是"start"）
- "2": 结束节点（必须有，id必须是"end"）
- "3": 大模型节点（LLM节点，用于调用AI处理）

【关键要点】
1. model字段: 需包含modelId、platformId、name三个字段，name格式为"code(platformName)"
2. 变量引用: $$input_decorator$$.inputParameters 中引用上游节点输出
3. prompt中使用 {{变量名}} 格式引用变量
4. 结束节点: inputParameters必须列出要返回的变量，content中用{{变量名}}引用

【connections字段】
定义节点执行顺序，source -> target`,
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '专家名称' },
              description: { type: 'string', description: '专家描述' },
              icon: { type: 'string', description: '图标，如emoji "🔧" 或图片URL' },
              nodes: { type: 'array', description: '节点数组，必须包含start和end节点', items: { type: 'object' } },
              connections: { type: 'array', description: '连接数组，定义执行顺序', items: { type: 'object' } }
            },
            required: ['name']
          }
        },
        {
          name: 'update_expert',
          description: `更新专家信息。
可更新字段: name、description、icon、nodes、connections。
返回值: 更新后的专家对象。`,
          inputSchema: {
            type: 'object',
            properties: {
              expertId: { type: 'string', description: '专家ID' },
              updates: { type: 'object', description: '要更新的字段和值' }
            },
            required: ['expertId', 'updates']
          }
        },
        {
          name: 'delete_expert',
          description: `删除专家。
返回值: { success: true }`,
          inputSchema: {
            type: 'object',
            properties: { expertId: { type: 'string', description: '专家ID' } },
            required: ['expertId']
          }
        },
        {
          name: 'duplicate_expert',
          description: `复制专家，创建一个副本。
新专家名称会自动添加"(副本)"后缀。
返回值: 复制成功的新专家对象。`,
          inputSchema: {
            type: 'object',
            properties: { expertId: { type: 'string', description: '要复制的专家ID' } },
            required: ['expertId']
          }
        },
        {
          name: 'search_experts',
          description: `搜索专家。
搜索范围: 专家名称、描述。
返回值: 匹配的专家数组。`,
          inputSchema: {
            type: 'object',
            properties: { keyword: { type: 'string', description: '搜索关键词' } },
            required: ['keyword']
          }
        },
        // ==================== 系统信息 ====================
        {
          name: 'get_system_info',
          description: `获取系统信息。
返回值:
- version: 服务器版本
- connectedClients: 当前连接的客户端数量
- timestamp: 当前时间戳

使用场景: 检查服务器状态和连接数。`,
          inputSchema: { type: 'object', properties: {} }
        }
      ]
    };
  }

  async handleToolsCall(params) {
    const { name, arguments: args } = params;

    console.log(`[MCP] 调用工具: ${name}`, args);

    let result;

    switch (name) {
      // ==================== 会话管理 ====================
      case 'get_conversations':
        result = await this.forwardToExtension('conversation.list', {});
        break;
      case 'get_conversation':
        result = await this.forwardToExtension('conversation.get', { conversationId: args.conversationId });
        break;
      case 'get_conversation_messages':
        result = await this.forwardToExtension('conversation.messages', { conversationId: args.conversationId });
        break;
      case 'get_conversation_members':
        result = await this.forwardToExtension('conversation.members', { conversationId: args.conversationId });
        break;
      case 'create_conversation':
        result = await this.forwardToExtension('conversation.create', args);
        break;
      case 'update_conversation':
        result = await this.forwardToExtension('conversation.update', args);
        break;
      case 'delete_conversation':
        result = await this.forwardToExtension('conversation.delete', { conversationId: args.conversationId });
        break;
      case 'send_message':
        result = await this.forwardToExtension('conversation.send', args);
        break;
      // ==================== 提示词管理 ====================
      case 'get_prompts':
        result = await this.forwardToExtension('prompt.list', {});
        break;
      case 'get_prompt':
        result = await this.forwardToExtension('prompt.get', { promptId: args.promptId });
        break;
      case 'create_prompt':
        result = await this.forwardToExtension('prompt.create', args);
        break;
      case 'update_prompt':
        result = await this.forwardToExtension('prompt.update', args);
        break;
      case 'delete_prompt':
        result = await this.forwardToExtension('prompt.delete', { promptId: args.promptId });
        break;
      case 'search_prompts':
        result = await this.forwardToExtension('prompt.search', args);
        break;
      // ==================== 模型管理 ====================
      case 'get_models':
        result = await this.forwardToExtension('model.list', {});
        break;
      case 'get_model':
        result = await this.forwardToExtension('model.get', { modelId: args.modelId });
        break;
      case 'get_platforms':
        result = await this.forwardToExtension('model.platforms', {});
        break;
      // ==================== 专家管理 ====================
      case 'get_experts':
        result = await this.forwardToExtension('expert.list', {});
        break;
      case 'get_expert':
        result = await this.forwardToExtension('expert.get', { expertId: args.expertId });
        break;
      case 'create_expert':
        result = await this.forwardToExtension('expert.create', args);
        break;
      case 'update_expert':
        result = await this.forwardToExtension('expert.update', args);
        break;
      case 'delete_expert':
        result = await this.forwardToExtension('expert.delete', { expertId: args.expertId });
        break;
      case 'duplicate_expert':
        result = await this.forwardToExtension('expert.duplicate', { expertId: args.expertId });
        break;
      case 'search_experts':
        result = await this.forwardToExtension('expert.search', args);
        break;
      // ==================== 系统信息 ====================
      case 'get_system_info':
        result = {
          version: this.serverInfo.version,
          connectedClients: this.messageRouter.getConnectedClientsCount(),
          timestamp: Date.now()
        };
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) }
      ]
    };
  }

  handleResourcesList() {
    return {
      resources: [
        { uri: 'mosaic://conversations', name: '会话列表', description: '所有会话的列表', mimeType: 'application/json' },
        { uri: 'mosaic://prompts', name: '提示词列表', description: '所有提示词的列表', mimeType: 'application/json' },
        { uri: 'mosaic://models', name: '模型列表', description: '所有模型的列表', mimeType: 'application/json' },
        { uri: 'mosaic://experts', name: '专家列表', description: '所有专家的列表', mimeType: 'application/json' }
      ]
    };
  }

  async handleResourcesRead(params) {
    const { uri } = params;
    let data;

    switch (uri) {
      case 'mosaic://conversations':
        data = await this.forwardToExtension('conversation.list', {});
        break;
      case 'mosaic://prompts':
        data = await this.forwardToExtension('prompt.list', {});
        break;
      case 'mosaic://models':
        data = await this.forwardToExtension('model.list', {});
        break;
      case 'mosaic://experts':
        data = await this.forwardToExtension('expert.list', {});
        break;
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }

    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }]
    };
  }

  handlePromptsList() {
    return {
      prompts: [
        { name: 'code_review', description: '代码审查提示词' },
        { name: 'summarize', description: '总结提示词' }
      ]
    };
  }

  async handlePromptsGet(params) {
    const { name, arguments: args } = params;

    switch (name) {
      case 'code_review':
        return {
          description: '代码审查提示词',
          messages: [{
            role: 'user',
            content: { type: 'text', text: '请审查以下代码，指出潜在问题和改进建议：\n\n' + (args?.code || args?.content || '') }
          }]
        };
      case 'summarize':
        return {
          description: '总结提示词',
          messages: [{
            role: 'user',
            content: { type: 'text', text: '请总结以下内容：\n\n' + (args?.content || '') }
          }]
        };
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  async forwardToExtension(type, data) {
    const requestId = 'mcp-' + Date.now();

    try {
      return await this.messageRouter.sendManagerMessage({
        type,
        data,
        requestId,
        timeout: 30000
      });
    } catch (error) {
      console.error(`[MCP] 转发失败 (${type}):`, error);
      throw error;
    }
  }
}

module.exports = MCPHandler;
