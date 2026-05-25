# Member/Conversation 架构重构总结

## 🎯 重构目标

将 **Member** 存储从全局架构迁移到 **会话本地架构**：

- **旧架构**：全局 `chrome.storage.local.members` + `conversation.memberIds`
- **新架构**：`conversation.members` = [{id, name, provider, model, systemPrompt, baseUrl, apiKey}]

---

## 📐 架构变更

### 旧架构
```
chrome.storage.local:
  members: [
    {id: 'model_1', name: 'GPT-4', provider: 'openai', model: 'gpt-4', ...},
    {id: 'model_2', name: 'Claude', provider: 'anthropic', model: 'claude-3', ...}
  ]
  conversations: [
    {
      id: 'conv_1',
      name: 'My Conversation',
      memberIds: ['model_1', 'model_2'],
      messages: [...]
    }
  ]
```

### 新架构
```
chrome.storage.local:
  conversations: [
    {
      id: 'conv_1',
      name: 'My Conversation',
      members: [
        {id: 'member_xxx', name: 'GPT-4', provider: 'openai', model: 'gpt-4', ...},
        {id: 'member_yyy', name: 'Claude', provider: 'anthropic', model: 'claude-3', ...}
      ],
      memberUrls: {},
      memberSettings: {},
      memberOrder: ['member_xxx', 'member_yyy'],
      messages: [...]
    }
  ]
```

---

## 🔧 代码变更清单

### Backend（background/）

#### 1. `temporary-session-pool.js`
**变更：**
- ✅ 新增 `generateMemberId()` 函数
- ✅ 修改临时会话创建逻辑，传入完整 Member 对象
- ✅ 从 `node.data.model` 提取 `provider`, `model`, `systemPrompt`

**关键代码：**
```javascript
// 旧代码
const tempConversation = {
  memberIds: [memberId],
  ...
}

// 新代码
const member = {
  id: generateMemberId(),
  name: node.data.model.name,
  provider: node.data.model.provider,
  model: node.data.model.model,
  systemPrompt: node.data.systemPrompt || ''
};
const tempConversation = {
  members: [member],
  ...
}
```

#### 2. `flow-executor.js`
**变更：**
- ✅ 修改 `sendToModelViaTempSession()` 从 `conversation.members[0]` 获取 Member
- ✅ 删除使用 `getMembers()` 的代码

**关键代码：**
```javascript
// 旧代码
const member = await getMember(memberId);

// 新代码
const member = conversation.members[0];
```

#### 3. `utils/storage.js`
**变更：**
- ❌ 删除 `getMembers()` 函数
- ❌ 删除 `saveMembers()` 函数
- ❌ 删除 `createMember()` 函数
- ❌ 删除 `updateMember()` 函数
- ❌ 删除 `deleteMember()` 函数

#### 4. `background.js`
**变更：**
- ❌ 删除 `MemberManager` 类（lines 1324-1367）
- ❌ 删除 `memberManager` 变量
- ❌ 删除 `getMembers` action handler
- ❌ 删除 `createMember` action handler
- ❌ 删除 `updateMember` action handler
- ❌ 删除 `deleteMember` action handler

- ✅ 修改 `createConversation()` 签名：
  ```javascript
  // 旧代码
  createConversation(name, memberIds, mode, options)

  // 新代码
  createConversation(name, members, mode, options)
  ```

- ✅ 修改 8 处 `getMembers()` 调用为 `conversation.members`
- ✅ 修改所有 `conversation.memberIds` 引用

---

### Frontend（chat/, popup/, dashboard/, sidepanel/）

#### 5. `chat/chat.js`
**变更：**
- ❌ 删除 `state.members` 变量
- ❌ 删除 `getMembers()` 函数
- ✅ 修改 `loadData()` - 不再加载 members
- ✅ 修改 `renderMembersTags()` - 遍历 `conversation.members`
- ✅ 修改 `renderMessages()` - 从 `conversation.members` 获取 Member
- ✅ 修改 `createPlatformWindows()` - 遍历 `conversation.members`
- ✅ 修改所有 `state.members.find()` → `state.conversation.members.find()`
- ✅ 修改所有 `conversation.memberIds` → `conversation.members.map(m => m.id)`

**关键代码：**
```javascript
// 旧代码
const member = state.members.find(m => m.id === memberId);
const memberIds = state.conversation.memberIds || [];

// 新代码
const member = state.conversation.members.find(m => m.id === memberId);
const memberIds = state.conversation.members.map(m => m.id);
```

#### 6. `popup/popup.js`
**变更：**
- ✅ 修改"新建对话"功能
- ✅ 将 Model 转换为 Member 对象
- ✅ 删除 `getMembers` action 调用

**关键代码：**
```javascript
// 旧代码
const members = await chrome.runtime.sendMessage({ action: 'getMembers' });
const memberIds = members.map(m => m.id);
chrome.runtime.sendMessage({
  action: 'createConversation',
  memberIds: memberIds
});

// 新代码
const models = await chrome.runtime.sendMessage({ action: 'getModels' });
const members = models.map(model => ({
  id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
  name: model.name,
  provider: model.provider,
  model: model.model,
  systemPrompt: '',
  baseUrl: model.baseUrl || '',
  apiKey: model.apiKey || ''
}));
chrome.runtime.sendMessage({
  action: 'createConversation',
  members: members
});
```

#### 7. `dashboard/dashboard.js`
**变更：**
- ✅ 修改会话列表渲染 - 使用 `conversation.members`
- ✅ 修改模型过滤器 - 通过 `member.provider` 和 `member.model` 匹配
- ✅ 修改会话详情显示 - 使用 `conversation.members`

**关键代码：**
```javascript
// 旧代码
const modelIds = conv.modelIds || conv.memberIds || [];
const models = modelIds.map(id => state.models.find(m => m.id === id));

// 新代码
const members = conv.members || [];
const modelNames = members.map(m => m.name).join(', ');
```

#### 8. `sidepanel/sidepanel.js`
**变更：**
- ✅ 修改会话列表渲染 - 使用 `conversation.members`
- ✅ 修改编辑会话对话框 - 显示 `conversation.members`

---

## 📊 影响分析

### ✅ 优势

1. **数据局部性** - Member 数据与 Conversation 紧密关联，查询更快
2. **简化架构** - 不再需要全局 Member 管理
3. **灵活性** - 每个会话可以有独立的 Member 配置
4. **一致性** - 所有会话数据集中管理

### ⚠️ 限制

1. **无法共享配置** - 不能在不同会话间共享 Member 配置
2. **重复数据** - 相同 Model 在多个会话中会创建多个 Member 对象
3. **无数据迁移** - 旧会话数据需要手动清理

---

## 🧪 测试建议

1. **创建新会话** - 验证 popup.js 的 Model 到 Member 转换
2. **发送消息** - 验证 chat.js 的成员渲染
3. **Flow 测试** - 验证临时会话的 Member 创建
4. **数据持久化** - 验证刷新页面后数据完整性

详细测试计划见：`TEST_PLAN.md`

---

## 📝 注意事项

### Member ID 格式

新架构使用全新的 Member ID 格式：
```javascript
function generateMemberId() {
  return 'member_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
}
```

示例：`member_123456789abcxyz`

### 访问模式变更

所有访问 Member 的代码都需要更新：

```javascript
// 旧模式
const member = members.find(m => m.id === memberId);

// 新模式
const member = conversation.members.find(m => m.id === memberId);
```

### 删除的 Action Handlers

以下 action handlers 已被删除：
- `getMembers`
- `createMember`
- `updateMember`
- `deleteMember`

如果前端代码仍在调用这些 actions，会导致错误。

---

## 🎯 完成状态

- ✅ Backend 重构完成（100%）
- ✅ Frontend 重构完成（100%）
- ✅ 代码审查完成
- ⏳ 测试进行中

**预计节省代码行数：** ~200 行
**新增代码行数：** ~150 行
**净减少：** ~50 行

---

## 📚 相关文档

- 测试计划：`TEST_PLAN.md`
- 原始需求：用户要求将 Member 从全局存储迁移到会话内部
- 架构设计：Solution A - Members 完全嵌入在会话中

---

**重构完成日期：** 2026-05-25
**重构负责人：** AI Assistant
