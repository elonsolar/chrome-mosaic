# Mosaic - 多平台 AI 模型协作工具

> 📢 **项目更名**
> 
> 本项目已从 `FreeAI` 更名为 `Mosaic`，GitHub 仓库地址已更新。

> 🙏 **致谢**
> 
> 感谢国内模型厂商（豆包、千问、DeepSeek、Kimi等）一如既往为广大用户提供免费网页服务，让更多人能够体验 AI 的魅力。

> ⚠️ **免责声明**
> 
> - 本项目仅供学习交流和技术研究，**禁止商业用途**
> - 内置的网页平台仅用于**交叉比较各厂商模型能力**，日常学习使用
> - 使用者需遵守各平台服务条款，因使用本项目导致的任何后果（包括但不限于账号封禁）由使用者自行承担
> - 平台更新可能导致内置网页调用功能失效

Mosaic 是一款 Chrome/Edge 浏览器扩展，统一管理多个 AI 平台，支持多模型协作对话、可视化流程编排、专家系统和提示词管理。

## 核心功能

### 多模型协作对话
- **头脑风暴**：多个模型同时回答，独立上下文，对比不同模型的回答
- **圆桌讨论**：依次发言，共享上下文，模型间可以相互讨论
- **专家问答**：多模型协作求解，支持自定义专家角色

### 可视化流程编排
- 拖拽节点设计工作流
- 支持条件判断、循环控制
- 多模型协作执行复杂任务
- 流程导入/导出

### 智能特性
- **数学公式渲染**：支持 LaTeX 数学公式（KaTeX）
- **成员状态管理**：在线/离线状态切换，控制参与对话的成员
- **代码高亮**：支持多种编程语言的代码块渲染
- **提示词管理**：创建和管理可复用的提示词模板

### 平台集成
- **API 接入**：通过 API Key 接入 OpenAI、DeepSeek、Kimi、豆包、千问等主流平台
- **网页平台**：直接调用各平台网页版，无需 API Key
- **本地工具**：通过 WebSocket 集成到其他应用

## 快速开始

```bash
git clone https://github.com/elonsolar/chrome-mosaic.git
```

1. 打开 `edge://extensions/` 或 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"，选择项目根目录
4. 点击扩展图标 → 开启新对话

## 支持的集成

### 平台支持
- **API 平台**：OpenAI、DeepSeek、Kimi、豆包、千问等
- **网页平台**：DeepSeek、豆包、千问、Kimi（无需 API Key）
- 通过 API Key 接入

### 本地工具集成（可选）
通过 WebSocket 连接到本地服务器，集成到其他应用：

```bash
cd server && npm install && npm start
```

配置 `~/.config/opencode/opencode.json`：
```json
{
  "provider": {
    "mosaic": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:3000/v1",
        "apiKey": "any"
      }
    }
  }
}
```

## 技术特性

- **Chrome Extension Manifest V3**：最新扩展规范
- **Service Worker**：后台任务处理
- **KaTeX**：数学公式渲染
- **LeaderLine**：流程图连线
- **WebSocket**：本地工具集成

## 系统要求

- Chrome 88+ / Edge 88+
- 需要对应 AI 平台的 API Key（网页平台模式除外）

## 常见问题

**Q: 数据安全吗？**
A: 所有数据本地存储，对话直接发送到 AI 平台

**Q: 支持哪些平台？**
A: OpenAI、DeepSeek、Kimi、豆包、千问等主流平台

**Q: 如何使用网页平台模式？**
A: 在成员配置中选择"网页"访问方式，无需 API Key 即可使用

**Q: 如何创建自定义专家？**
A: 在 Dashboard → 专家页面创建，可设置专家名称、提示词和工作流程

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=elonsolar/chrome-mosaic&type=Date)](https://star-history.com/#elonsolar/chrome-mosaic&Date)

## License

MIT

---

**推荐使用方式**：通过各平台官方 API 接入，享受稳定、合规的服务。网页平台模式仅供体验和对比测试。
