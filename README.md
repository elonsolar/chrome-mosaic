# Mosaic - 多平台 AI 模型协作工具

> 📢 **项目更名**
>
> 本项目已从 `FreeAI` 更名为 `Mosaic`，GitHub 仓库地址已更新。

> 🙏 **致谢**
>
> 感谢以下模型厂商为广大用户提供免费网页服务，让更多人能够体验 AI 的魅力：
>
> - DeepSeek: https://chat.deepseek.com/
> - 豆包: https://www.doubao.com/chat/
> - Kimi: https://kimi.moonshot.cn/
> - 千问: https://www.qianwen.com/chat

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

### 1. 获取代码

```bash
git clone https://github.com/elonsolar/chrome-mosaic.git
cd chrome-mosaic
```

### 2. 安装扩展

> ⚠️ **提示**：本扩展暂时没有上架 Chrome/Edge 商店，需要本地加载使用。

1. 打开浏览器扩展管理页面
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. **开启"开发者模式"**（右上角开关）
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录（包含 `manifest.json` 的文件夹）

### 3. 开始使用

**网页模式（无需 API Key）**
- 点击浏览器工具栏的 Mosaic 图标
- 选择"网页"访问方式
- 直接使用 DeepSeek、豆包、千问、Kimi 等平台

**API 模式（更稳定）**
- 在成员配置中选择"API"访问方式
- 填入对应平台的 API Key
- 享受更稳定的服务

## 支持的集成

### 平台支持
- **API 平台**：DeepSeek、Kimi、豆包、千问等
- **网页平台**：DeepSeek、豆包、千问、Kimi（无需 API Key）
- 通过 API Key 接入

### TODO：MCP 开发中

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


