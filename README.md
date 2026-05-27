# FreeAI - 多平台 AI 模型协作工具

浏览器扩展，统一管理多个 AI 平台，支持多模型协作对话、流程编排和提示词管理。

## 快速开始

### 安装

```bash
git clone https://github.com/elonsolar/free-ai.git
cd free-ai
```

1. 打开 `edge://extensions/` 或 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"，选择项目根目录

### 配置平台

1. 点击扩展图标 → **Dashboard**
2. 进入 **模型** 页面
3. 点击 **新增平台**，填写：
   - 平台名称（如 OpenAI、DeepSeek）
   - Base URL（如 `https://api.openai.com/v1`）
   - API Key
4. 选择该平台下的可用模型

### 开始对话

1. 点击扩展图标 → **开启新对话**
2. 选择对话模式：
   - **头脑风暴**：多个模型同时回答，独立上下文
   - **圆桌讨论**：依次发言，共享上下文
   - **专家问答**：多模型协作求解
3. 选择成员（基于平台+模型组合）
4. 输入消息开始对话

### 管理功能

**Dashboard** 提供完整管理界面：
- **提示词**：创建和管理复用提示词
- **模型**：配置平台和模型
- **专家**：创建专家角色（自动生成头像）
- **设置**：WebSocket 连接、辅助模型配置

### 流程编排（高级）

点击扩展图标 → **流程设计器**，创建可视化工作流：
- 拖拽节点设计流程
- 支持条件判断、循环
- 多模型协作流程

## 支持的集成

### 平台支持
- OpenAI、DeepSeek、Kimi、豆包、千问等
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

## 系统要求

- Chrome 88+ / Edge 88+
- 需要对应 AI 平台的 API Key

## 常见问题

**Q: 免费吗？**
A: 需要各平台的 API Key，费用由各平台收取

**Q: 数据安全吗？**
A: 所有数据本地存储，对话直接发送到 AI 平台

**Q: 支持哪些平台？**
A: OpenAI、DeepSeek、Kimi、豆包、千问等主流平台

## License

MIT
