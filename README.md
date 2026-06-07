# Mosaic - 多平台 AI 模型协作工具

> ⚠️ 本项目仅供学习交流，禁止商业用途。使用者需遵守各平台服务条款。

Chrome/Edge 浏览器扩展，统一管理多个 AI 平台，支持多模型协作对话、可视化流程编排。

## 快速开始

```bash
git clone https://github.com/elonsolar/chrome-mosaic.git
cd chrome-mosaic
```

**安装扩展**：打开 `chrome://extensions/` → 开启开发者模式 → 加载已解压的扩展程序 → 选择项目根目录

**使用方式**：
- **网页模式**：无需 API Key，直接使用 DeepSeek、豆包、千问、Kimi
- **API 模式**：填入 API Key，更稳定

## 工具集成

### 服务器

```bash
cd server && npm install && npm start
```

| 服务 | 地址 |
|------|------|
| HTTP API | `http://localhost:12600` |
| WebSocket | `ws://localhost:12606` |
| MCP | `http://localhost:12600/mcp` |

开发模式：`npm run dev`

### OpenAI API

```javascript
fetch('http://localhost:12600/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: '会话名称',
    messages: [{ role: 'user', content: '你好' }],
    stream: true
  })
});
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:12606');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### opencode

```json
{
  "provider": {
    "mosaic": {
      "npm": "@ai-sdk/openai-compatible",
      "name":"Mosaic",
      "options": { "baseURL": "http://localhost:12600/v1", "apiKey": "any" },
      "models": { "free": { "name": "自定义会话名称" } } 
    }
  }
}
```

文档：[WebSocket API](docs/websocket-api.md) · [服务器](server/README.md)

## 功能亮点

- **多模型协作**：头脑风暴、圆桌讨论、专家问答
- **可视化流程**：拖拽编排，10+ 种节点类型
- **专家系统**：自定义角色和工作流程
- **平台集成**：DeepSeek、Kimi、豆包、千问等

## 使用技巧

### 通用

| 操作 | 说明 |
|------|------|
| `Enter` | 发送消息 |
| `Shift+Enter` / `Ctrl+Enter` | 换行 |
| `Ctrl+K` | 搜索历史对话 |
| `/` | 查看可用命令 |
| 右键会话 | 重命名、导出、删除 |
| 点击成员头像 | 查看对话详情 |
| 点击成员状态点 | 切换上线/下线 |

### 头脑风暴模式

- 输入 `@成员名 消息内容` 可定向发送给指定成员，其他成员不会收到
- 各成员独享上下文，互不影响

### 圆桌讨论模式

- `/loop 问题描述 --max=5` 发起多轮自动讨论
- 拖拽成员标签可调整发言顺序
- 成员共享上下文，按顺序依次发言

### 专家问答模式

- 创建会话时选择预配置的专家
- 点击回复中的「查看执行过程」了解推理链路

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=elonsolar/chrome-mosaic&type=Date)](https://star-history.com/#elonsolar/chrome-mosaic&Date)

## License

MIT
