# WebSocket 管理 API 文档

## 概述

WebSocket管理API用于管理插件的各种资源，包括会话、提示词、模型和专家。该API主要供MCP和管理工具使用。

## 连接方式

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

## 消息协议

### 请求格式

```json
{
  "id": "unique-request-id",
  "type": "resource.action",
  "data": {},
  "timestamp": 1234567890
}
```

### 响应格式

```json
{
  "id": "unique-request-id",
  "success": true,
  "data": {},
  "timestamp": 1234567890
}
```

### 错误响应

```json
{
  "id": "unique-request-id",
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  },
  "timestamp": 1234567890
}
```

---

## 会话管理 (conversation)

### 获取会话列表

```json
// 请求
{
  "id": "req-001",
  "type": "conversation.list",
  "data": {}
}

// 响应
{
  "id": "req-001",
  "success": true,
  "data": [
    {
      "id": "conv-123",
      "name": "我的会话",
      "mode": "brainstorming",
      "members": [...],
      "messages": [...],
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

### 获取单个会话

```json
// 请求
{
  "id": "req-002",
  "type": "conversation.get",
  "data": {
    "conversationId": "conv-123"
  }
}
```

### 获取会话消息

```json
// 请求
{
  "id": "req-003",
  "type": "conversation.messages",
  "data": {
    "conversationId": "conv-123"
  }
}

// 响应
{
  "id": "req-003",
  "success": true,
  "data": [
    {
      "id": "msg-001",
      "memberId": null,
      "content": "用户消息内容",
      "isUser": true,
      "timestamp": 1234567890
    },
    {
      "id": "msg-002",
      "memberId": "model-123",
      "content": "AI回复内容",
      "isUser": false,
      "timestamp": 1234567890
    }
  ]
}
```

### 获取会话成员

```json
// 请求
{
  "id": "req-004",
  "type": "conversation.members",
  "data": {
    "conversationId": "conv-123"
  }
}

// 响应
{
  "id": "req-004",
  "success": true,
  "data": [
    {
      "id": "model-123",
      "name": "GPT-4",
      "platformName": "OpenAI",
      "accessMethod": "api"
    }
  ]
}
```

### 创建会话

```json
// 请求
{
  "id": "req-005",
  "type": "conversation.create",
  "data": {
    "name": "新会话",
    "mode": "brainstorming",
    "members": [
      {
        "id": "model-123",
        "name": "GPT-4"
      }
    ],
    "options": {
      "expertId": "expert-456"
    }
  }
}
```

### 删除会话

```json
// 请求
{
  "id": "req-006",
  "type": "conversation.delete",
  "data": {
    "conversationId": "conv-123"
  }
}
```

### 发送消息

```json
// 请求
{
  "id": "req-007",
  "type": "conversation.send",
  "data": {
    "conversationId": "conv-123",
    "message": "你好，请帮我分析一下这个问题"
  }
}
```

---

## 提示词管理 (prompt)

### 获取提示词列表

```json
// 请求
{
  "id": "req-010",
  "type": "prompt.list",
  "data": {}
}

// 响应
{
  "id": "req-010",
  "success": true,
  "data": [
    {
      "id": "prompt-001",
      "name": "代码审查",
      "content": "请审查以下代码...",
      "tags": ["编程", "代码审查"],
      "isBuiltin": true,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

### 获取单个提示词

```json
// 请求
{
  "id": "req-011",
  "type": "prompt.get",
  "data": {
    "promptId": "prompt-001"
  }
}
```

### 创建提示词

```json
// 请求
{
  "id": "req-012",
  "type": "prompt.create",
  "data": {
    "name": "自定义提示词",
    "content": "请帮我...",
    "tags": ["自定义"]
  }
}
```

### 更新提示词

```json
// 请求
{
  "id": "req-013",
  "type": "prompt.update",
  "data": {
    "promptId": "prompt-001",
    "name": "更新后的名称",
    "content": "更新后的内容"
  }
}
```

### 删除提示词

```json
// 请求
{
  "id": "req-014",
  "type": "prompt.delete",
  "data": {
    "promptId": "prompt-001"
  }
}
```

### 搜索提示词

```json
// 请求
{
  "id": "req-015",
  "type": "prompt.search",
  "data": {
    "keyword": "代码"
  }
}
```

---

## 模型管理 (model)

### 获取所有模型

```json
// 请求
{
  "id": "req-020",
  "type": "model.list",
  "data": {}
}

// 响应
{
  "id": "req-020",
  "success": true,
  "data": [
    {
      "id": "model-001",
      "code": "gpt-4",
      "platformName": "OpenAI",
      "platformId": "plt-001",
      "accessMethod": "api",
      "enabled": true,
      "color": "#00a67e"
    }
  ]
}
```

### 获取单个模型

```json
// 请求
{
  "id": "req-021",
  "type": "model.get",
  "data": {
    "modelId": "model-001"
  }
}
```

### 创建模型

```json
// 请求
{
  "id": "req-022",
  "type": "model.create",
  "data": {
    "platformId": "plt-001",
    "code": "gpt-4-turbo",
    "enabled": true
  }
}
```

### 更新模型

```json
// 请求
{
  "id": "req-023",
  "type": "model.update",
  "data": {
    "platformId": "plt-001",
    "modelId": "model-001",
    "code": "gpt-4-turbo-preview"
  }
}
```

### 删除模型

```json
// 请求
{
  "id": "req-024",
  "type": "model.delete",
  "data": {
    "platformId": "plt-001",
    "modelId": "model-001"
  }
}
```

### 切换模型启用状态

```json
// 请求
{
  "id": "req-025",
  "type": "model.toggle",
  "data": {
    "platformId": "plt-001",
    "modelId": "model-001"
  }
}
```

### 获取所有平台

```json
// 请求
{
  "id": "req-026",
  "type": "model.platforms",
  "data": {}
}
```

---

## 专家管理 (expert)

### 获取专家列表

```json
// 请求
{
  "id": "req-030",
  "type": "expert.list",
  "data": {}
}

// 响应
{
  "id": "req-030",
  "success": true,
  "data": [
    {
      "id": "expert-001",
      "name": "代码审查专家",
      "description": "专注于代码质量审查",
      "icon": "🤖",
      "nodes": [...],
      "connections": [...],
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

### 获取单个专家

```json
// 请求
{
  "id": "req-031",
  "type": "expert.get",
  "data": {
    "expertId": "expert-001"
  }
}
```

### 创建专家（含流程设计）

```json
// 请求
{
  "id": "req-032",
  "type": "expert.create",
  "data": {
    "name": "代码审查专家",
    "description": "专注于代码质量审查",
    "icon": "🤖",
    "nodes": [
      {
        "id": "node-001",
        "type": "start",
        "name": "开始",
        "config": {}
      },
      {
        "id": "node-002",
        "type": "ai",
        "name": "代码分析",
        "config": {
          "modelId": "model-001",
          "prompt": "请分析以下代码..."
        }
      },
      {
        "id": "node-003",
        "type": "end",
        "name": "结束",
        "config": {}
      }
    ],
    "connections": [
      {
        "id": "conn-001",
        "from": "node-001",
        "to": "node-002"
      },
      {
        "id": "conn-002",
        "from": "node-002",
        "to": "node-003"
      }
    ]
  }
}
```

### 更新专家（含流程设计）

```json
// 请求
{
  "id": "req-033",
  "type": "expert.update",
  "data": {
    "expertId": "expert-001",
    "name": "更新后的专家名称",
    "nodes": [...],
    "connections": [...]
  }
}
```

### 删除专家

```json
// 请求
{
  "id": "req-034",
  "type": "expert.delete",
  "data": {
    "expertId": "expert-001"
  }
}
```

### 复制专家

```json
// 请求
{
  "id": "req-035",
  "type": "expert.duplicate",
  "data": {
    "expertId": "expert-001"
  }
}
```

### 搜索专家

```json
// 请求
{
  "id": "req-036",
  "type": "expert.search",
  "data": {
    "keyword": "代码"
  }
}
```

---

## 系统信息 (system)

### 获取系统信息

```json
// 请求
{
  "id": "req-050",
  "type": "system.info",
  "data": {}
}

// 响应
{
  "id": "req-050",
  "success": true,
  "data": {
    "version": "1.0.0",
    "timestamp": 1234567890
  }
}
```

### 心跳

```json
// 请求
{
  "id": "req-051",
  "type": "system.heartbeat",
  "data": {}
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| `MISSING_PARAM` | 缺少必要参数 |
| `UNKNOWN_RESOURCE` | 未知的资源类型 |
| `UNKNOWN_ACTION` | 未知的操作 |
| `FORWARD_FAILED` | 转发到插件失败 |
| `MANAGER_ERROR` | 管理请求处理失败 |
| `INVALID_JSON` | 消息格式错误 |

---

## 使用示例

### JavaScript 客户端示例

```javascript
class MosaicWSClient {
  constructor(url = 'ws://localhost:8080') {
    this.url = url;
    this.ws = null;
    this.pendingRequests = new Map();
    this.requestCounter = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => resolve();
      this.ws.onerror = (error) => reject(error);
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const pending = this.pendingRequests.get(message.id);
        
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.success) {
            pending.resolve(message.data);
          } else {
            pending.reject(new Error(message.error.message));
          }
        }
      };
    });
  }

  send(type, data = {}) {
    return new Promise((resolve, reject) => {
      const id = `req-${++this.requestCounter}`;
      
      this.pendingRequests.set(id, { resolve, reject });
      
      this.ws.send(JSON.stringify({
        id,
        type,
        data,
        timestamp: Date.now()
      }));
    });
  }

  // 会话管理
  async getConversations() {
    return this.send('conversation.list');
  }

  async getConversation(id) {
    return this.send('conversation.get', { conversationId: id });
  }

  async createConversation(name, members, mode) {
    return this.send('conversation.create', { name, members, mode });
  }

  // 提示词管理
  async getPrompts() {
    return this.send('prompt.list');
  }

  async createPrompt(data) {
    return this.send('prompt.create', data);
  }

  // 模型管理
  async getModels() {
    return this.send('model.list');
  }

  // 专家管理
  async getExperts() {
    return this.send('expert.list');
  }

  async createExpert(data) {
    return this.send('expert.create', data);
  }

  async updateExpert(id, data) {
    return this.send('expert.update', { expertId: id, ...data });
  }
}

// 使用示例
async function main() {
  const client = new MosaicWSClient();
  await client.connect();
  
  // 获取会话列表
  const conversations = await client.getConversations();
  console.log('会话列表:', conversations);
  
  // 创建新专家（带流程设计）
  const expert = await client.createExpert({
    name: '代码审查专家',
    description: '专注于代码质量审查',
    nodes: [
      { id: 'start', type: 'start', name: '开始' },
      { id: 'analyze', type: 'ai', name: '分析', config: { modelId: 'model-001' } },
      { id: 'end', type: 'end', name: '结束' }
    ],
    connections: [
      { from: 'start', to: 'analyze' },
      { from: 'analyze', to: 'end' }
    ]
  });
  console.log('创建的专家:', expert);
}
```

---

## 与 MCP 集成

该API设计为可直接供MCP使用。MCP可以通过WebSocket连接到该服务，使用上述API管理插件数据。

### MCP 工具定义示例

```json
{
  "name": "get_conversations",
  "description": "获取所有会话列表",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

```json
{
  "name": "create_expert",
  "description": "创建新专家（可带流程设计）",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "专家名称"
      },
      "description": {
        "type": "string",
        "description": "专家描述"
      },
      "nodes": {
        "type": "array",
        "description": "流程节点"
      },
      "connections": {
        "type": "array",
        "description": "节点连接"
      }
    },
    "required": ["name"]
  }
}
```
