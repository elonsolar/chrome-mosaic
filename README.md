# Mosaic

> 没有任何一个 AI 拥有全部答案。但如果它们坐在同一张桌子前呢？

Chrome/Edge 浏览器扩展。把 DeepSeek、豆包、千问、Kimi 拉进同一个对话——同一个问题，不同性格的 AI 同时作答。你会看到它们各有各的聪明，也各有各的盲区。有时候答案是 A 说的那段话，有时候最佳方案藏在 B 的补充和 C 的反驳之间。

然后你意识到：重要的不是哪个 AI 最强，而是让它们一起出场。

> ⚠️ 本项目仅供学习交流，禁止商业用途。使用者需遵守各平台服务条款。

## 快速开始

```bash
git clone https://github.com/elonsolar/chrome-mosaic.git
```

打开 `chrome://extensions/` → 开启开发者模式 → 加载已解压的扩展程序 → 选择项目目录

- **网页模式**（推荐）：直接操控 AI 网页，零成本
- **API 模式**：填入 API Key，走官方接口，更稳定

## 起因

你可能也有过这种经历：在 DeepSeek 问了一个问题，觉得答案差点意思，又打开 Kimi 问了一遍，再去千问碰碰运气。三个标签页来回切，复制粘贴同样的提示词，对比三个窗口里的回答。

这很蠢。所以有了 Mosaic。一次提问，所有 AI 同时回答。并排摆在你面前——谁在认真思考，谁在敷衍了事，谁给出了你没想到的角度。不需要切标签页，不需要复制粘贴。你第一次能真正"看见"不同 AI 之间的差异。而一旦你看见了差异，就回不去了。

## 三种玩法

**头脑风暴** — 同一个问题，所有 AI 同时独立回答。DeepSeek 擅长结构化分析，Kimi 会找资料，豆包表达自然，千问长文推理稳。答案并排摆开，谁强谁弱一目了然。用 `@成员名` 可以只问其中一个。

**圆桌讨论** — 多个 AI 接力发言，共享上下文。DeepSeek 先分析，Kimi 补充视角，千问做总结。`/loop 问题 --max=5` 发起自动多轮讨论，拖拽成员标签调整发言顺序。

**专家问答** — 和前两种不一样：多个 AI 不再各说各的，而是通过预设的 LLM 流程协作，只给你一个答案。有人拆解问题，有人出方案，有人审查汇总。流程用可视化画布拖拽编排，点击「查看执行过程」展开每一步的输出。

## API 服务器(实验性)

`cd server && npm install && npm start`，浏览器里的 AI 变成三种标准接口，任何客户端都能接入：

| 服务 | 地址 | 用途 |
|------|------|------|
| OpenAI API | `http://localhost:12600/v1/chat/completions` | Cursor、opencode 等兼容客户端 |
| WebSocket | `ws://localhost:12606` | 实时消息推送 |
| MCP | `http://localhost:12600/mcp` | Claude、opencode 等 MCP 客户端，支持 tools / resources / prompts |

opencode provider 配置：

```json
{
  "provider": {
    "mosaic": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Mosaic",
      "options": { "baseURL": "http://localhost:12600/v1", "apiKey": "any" },
      "models": { "free": { "name": "你的会话名称" } }
    }
  }
}
```

opencode MCP 配置：

```json
{
  "mosaic": {
    "type": "remote",
    "enabled": false,
    "url": "http://localhost:12600/mcp"
  }
}
```

HTTP / WebSocket 调用示例：

```javascript
// HTTP
fetch('http://localhost:12600/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: '会话名称',
    messages: [{ role: 'user', content: '你好' }],
    stream: true
  })
});

// WebSocket
const ws = new WebSocket('ws://localhost:12606');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

文档：[WebSocket API](docs/websocket-api.md) · [服务器详情](server/README.md)

## 支持的 AI 平台

DeepSeek · Kimi · 豆包 · 千问（更多在路上）

## 快捷操作

| 操作 | 说明 |
|------|------|
| `Enter` | 发送 |
| `Shift+Enter` / `Ctrl+Enter` | 换行 |
| `Ctrl+K` | 搜索历史 |
| `/` | 查看命令 |
| `@成员名 消息` | 定向发送 |
| `/loop 问题 --max=5` | 自动多轮讨论 |
| 右键会话 | 重命名 / 导出 / 删除 |
| 点击头像 | 查看单成员对话 |
| 拖拽成员标签 | 调整发言顺序 |

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=elonsolar/chrome-mosaic&type=Date)](https://star-history.com/#elonsolar/chrome-mosaic&Date)

## License

MIT
