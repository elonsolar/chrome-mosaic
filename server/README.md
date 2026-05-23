# OpenAI API 兼容的 WebSocket 服务器

这是一个支持 OpenAI API 标准接口的 Node.js WebSocket 服务器，用于与 Edge 浏览器插件进行会话交互。

## ⚡ 快速开始

**5分钟快速配置指南**: 查看 [QUICK_START.md](../QUICK_START.md)

## 核心概念

### 🔑 model 参数 = 会话名称

在此系统中，API 请求中的 `model` 参数实际上是**插件会话的名称**，而不是 AI 模型名称。

```json
{
  "model": "我的客服会话",  // 这是插件中创建的会话名称
  "messages": [{"role": "user", "content": "你好"}]
}
```

**工作流程**：
1. 在浏览器插件中创建会话并命名
2. 为会话添加角色（选择 AI 平台：DeepSeek、豆包、千问、Kimi 等）
3. API 请求时使用会话名称作为 `model` 参数
4. 系统自动使用该会话中配置的角色发送消息并返回响应

## 功能特性

- **OpenAI API 兼容接口**: POST `/v1/chat/completions` 端点，支持 SSE 流式响应
- **基于会话的模型管理**: 通过插件会话管理多个 AI 平台和模型
- **多角色协作**: 一个会话可以包含多个角色，自动依次调用并合并响应
- **工具调用支持**: 自动在 JSON 格式和自定义 XML 格式之间转换工具定义和调用
- **WebSocket 集成**: 与浏览器插件通过 WebSocket 通信
- **可配置**: 支持环境变量配置端口、超时时间等

## 安装

```bash
npm install
```

## 运行

```bash
npm start
```

或使用开发模式（自动重启）：

```bash
npm run dev
```

服务器将在以下端口运行：
- WebSocket 服务器: `ws://localhost:8080`
- HTTP API 服务器: `http://localhost:3000`

## 环境变量

创建 `.env` 文件或设置环境变量：

```env
# WebSocket 服务器端口（默认: 8080）
WS_PORT=8080

# HTTP API 服务器端口（默认: 3000）
API_PORT=3000

# 请求超时时间（毫秒，默认: 30000）
REQUEST_TIMEOUT=30000
```

## OpenAI API 接口

### POST /v1/chat/completions

标准的 OpenAI 聊天完成接口，支持工具调用。

#### 请求格式

```json
{
  "model": "我的客服会话",
  "messages": [
    {
      "role": "user",
      "content": "你好，请帮我查询天气"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "城市名称"
            },
            "unit": {
              "type": "string",
              "enum": ["celsius", "fahrenheit"],
              "description": "温度单位"
            }
          },
          "required": ["city"]
        }
      }
    }
  ],
  "stream": true
}
```

#### 响应格式

**非流式响应** (`stream: false`):

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我可以帮你查询天气。",
        "tool_calls": null
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

**流式响应** (`stream: true`):

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"你好"}}]}

data: [DONE]
```

#### 工具调用响应

当模型需要调用工具时：

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_1234567890_0",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"city\":\"北京\",\"unit\":\"celsius\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

## 工具格式转换

服务器会自动在 JSON 格式和 Markdown 代码块格式之间转换工具定义和调用。

### JSON → 文本说明

工具定义会被转换为易读的文本说明发送给模型：

```
你可以使用以下工具：

**get_weather**
查询指定城市的天气情况
参数：
        - city (必需): 要查询的城市名称
        - unit (可选): 温度单位，默认为 celsius

如果需要调用工具，请使用以下格式：

```tool_call
{"name": "工具名称", "arguments": {"参数名": "参数值"}}
```
```

### 代码块 → JSON

模型的工具调用响应会从以下 Markdown 代码块格式解析：

````
```tool_call
{"name": "get_weather", "arguments": {"city": "北京", "unit": "celsius"}}
```
````

转换为标准的 OpenAI tool_calls 格式。

## WebSocket 消息协议

### 从服务器发送到插件的消息

```json
{
  "type": "chat_request",
  "requestId": "uuid-v4",
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "..."}
  ],
  "timestamp": 1234567890
}
```

### 从插件发送到服务器的响应

```json
{
  "type": "ai_response",
  "requestId": "uuid-v4",
  "content": "模型回复内容",
  "timestamp": 1234567890
}
```

## 健康检查

### GET /health

返回服务器状态：

```json
{
  "status": "healthy",
  "connected_clients": 1,
  "pending_requests": 0
}
```

## 使用示例

### cURL

```bash
# 非流式请求
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'

# 流式请求
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dummy"  # 不需要真实的 API key
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "你好，请帮我查询北京的天气"}
    ],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["city"]
            }
        }
    }]
)

print(response.choices[0].message)
```

### JavaScript (Fetch API)

```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: '你好' }
    ],
    stream: true
  })
});

// 处理流式响应
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  console.log(chunk);
}
```

## 架构说明

```
server/
├── server.js              # WebSocket 服务器（入口文件）
├── openai-api-server.js   # HTTP API 服务器
├── tool-converter.js      # 工具格式转换器
├── message-router.js      # HTTP/WebSocket 消息路由器
├── config.js              # 配置管理
├── test-client.html       # WebSocket 测试客户端
├── test-api.html          # API 测试客户端
└── package.json           # 依赖配置
```

### 请求流程

**详细流程图**: 查看 [FLOW.md](FLOW.md)

1. 客户端发送 HTTP POST 请求到 `/v1/chat/completions`，`model` 参数指定会话名称
2. `openai-api-server.js` 验证请求并转换工具定义（如果有）
3. `message-router.js` 将请求转发给 WebSocket 客户端（浏览器插件）
4. 浏览器插件的 `WebSocketManager` 接收请求，通过会话名称查找会话
5. 使用会话中配置的角色，通过 `AIMessageManager` 发送消息到对应的 AI 平台
6. 各个 AI 平台返回响应，被添加到会话中
7. `WebSocketManager` 收集所有角色的响应，合并后通过 WebSocket 返回
8. `tool-converter.js` 解析响应中的工具调用（如果有）
9. `openai-api-server.js` 格式化为 OpenAI 标准响应返回客户端

## 故障排除

### 端口被占用

如果默认端口被占用，可以通过环境变量修改：

```bash
# Windows
set WS_PORT=8081
set API_PORT=3001
npm start

# Linux/Mac
WS_PORT=8081 API_PORT=3001 npm start
```

### 无 WebSocket 客户端连接

API 请求会失败并返回错误。确保浏览器插件已连接到 WebSocket 服务器。

### 工具调用解析失败

检查模型响应是否遵循了指定的 XML 格式。服务器会尽力解析，但格式错误可能导致工具调用丢失。

## 部署

### 使用 PM2

```bash
npm install -g pm2
pm2 start server.js --name open-chat-server
pm2 save
pm2 startup
```

### Docker

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000 8080
CMD ["node", "server.js"]
```

构建和运行：

```bash
docker build -t open-chat-server .
docker run -p 3000:3000 -p 8080:8080 open-chat-server
```

## 许可证

MIT License

## 接收的消息类型

### conversations
会话列表更新
```json
{
  "type": "conversations",
  "data": {
    "conversations": [...]
  },
  "timestamp": 1234567890
}
```

### roles
角色列表更新
```json
{
  "type": "roles",
  "data": {
    "roles": [...]
  },
  "timestamp": 1234567890
}
```

### message
新消息
```json
{
  "type": "message",
  "data": {
    "conversationId": "xxx",
    "message": {
      "id": "xxx",
      "memberId": "xxx",
      "content": "消息内容",
      "isUser": false,
      "timestamp": 1234567890
    }
  },
  "timestamp": 1234567890
}
```

## 扩展功能

你可以基于此服务器实现以下功能：

### 1. 消息持久化
将消息保存到数据库（MongoDB、PostgreSQL等）

### 2. 消息转发
将消息转发给其他服务或API

### 3. AI响应
接收到用户消息后，调用AI API生成回复

### 4. 多客户端支持
支持多个插件实例同时连接

### 5. 认证
添加WebSocket认证机制

### 6. HTTP API
添加REST API用于查询和管理数据

示例：添加AI响应

```javascript
async function handleUserMessage(conversationId, userMessage) {
  // 调用AI API
  const aiResponse = await callAIAPI(userMessage);

  // 发送回复给插件
  broadcastToAll({
    type: 'aiResponse',
    data: {
      conversationId,
      response: aiResponse
    },
    timestamp: Date.now()
  });
}

function callAIAPI(message) {
  // 实现你的AI API调用逻辑
  return Promise.resolve('这是AI的回复');
}
```

## 环境变量

可以创建 `.env` 文件配置环境变量：

```env
PORT=8080
NODE_ENV=development
```

## 部署

### 使用PM2部署

```bash
npm install -g pm2
pm2 start server.js --name open-chat-server
pm2 save
pm2 startup
```

### 使用Docker部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

```bash
docker build -t open-chat-server .
docker run -p 8080:8080 open-chat-server
```

## 故障排除

### 端口被占用
如果端口8080被占用，可以修改 `server.js` 中的 PORT 变量。

### 连接失败
1. 检查服务器是否正在运行
2. 检查防火墙设置
3. 确认插件中的WebSocket地址正确

## 许可证

MIT License
