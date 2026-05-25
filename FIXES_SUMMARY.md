# Chat.js 问题修复清单

## 🔧 已修复的问题

### 1. sidepanel.js 初始化问题
**问题：** sidepanel.js 在初始化时调用已删除的 `getMembers` action

**修复：**
- 删除了 `sendMessage({ action: 'getMembers' })` 调用
- 设置 `state.members = []` 而不是从后端获取

**文件：** `sidepanel/sidepanel.js` (lines 72-86)

---

### 2. sidepanel.js 创建会话逻辑
**问题：** 创建会话时仍然使用 `memberIds` 参数，需要传递 `members`

**修复：**
- 修改 `createConversation()` 函数
- 从选中的 `memberIds` 获取完整的 `members` 对象
- 如果找不到 member，从 models 中创建临时 member
- 更新会话时传递 `members: selectedMembers`

**文件：** `sidepanel/sidepanel.js` (lines 393-475)

---

### 3. chat.js 创建成员功能
**问题：** `showAddMemberModal()` 调用已删除的 `createMember` action

**修复：**
- 直接创建 Member 对象，包含：
  - `id`: 使用 `generateMemberId()` 格式
  - `name`: 用户输入的名称
  - `provider`, `model`: 从选中的 model 获取
  - `systemPrompt`: 从选中的 prompt 获取
  - `baseUrl`, `apiKey`: 从 model 复制
- 直接更新会话的 `members` 数组

**文件：** `chat/chat.js` (lines 2126-2172)

---

### 4. chat.js 快速创建会话成员
**问题：** 快速创建会话对话框中也调用已删除的 `createMember` action

**修复：**
- 直接创建 Member 对象（格式同上）
- 添加到 `newConvState.members` 数组

**文件：** `chat/chat.js` (lines 3090-3119)

---

### 5. chat.js 语法错误 ⚠️ **NEW**
**问题：** 在第 2175 行有语法错误：`Missing catch or finally after try`

**原因：** 在编辑时不小心删除了 `if (newMember)` 检查，导致代码结构错乱

**修复：**
- 重新整理了 try-catch 结构
- 将 `document.body.removeChild(modal)` 移到 `if (updatedConversation)` 块内
- 在 catch 块中也添加了 `document.body.removeChild(modal)` 确保清理

**文件：** `chat/chat.js` (lines 2149-2179)

---

### 6. background.js 迁移代码问题 ⚠️ **NEW**
**问题：** 第 1357 行初始化错误，旧迁移代码尝试创建已删除的 `chrome.storage.local.members`

**原因：** 保留了旧的 'roles' → 'members' 和 'role*' → 'member*' 迁移代码

**修复：**
- 删除了 'roles' → 'members' 迁移代码（lines 1360-1370）
- 删除了 'role*' → 'member*' 迁移代码（lines 1372-1404）
- 保留了 WebSocket 连接和其他必要的初始化代码

**文件：** `background/background.js` (lines 1360-1406)

---

## 📝 需要测试的场景

### 1. Sidepanel 创建会话
- [ ] 打开 sidepanel
- [ ] 创建新会话
- [ ] 验证成员正确显示

### 2. Chat 页面添加成员
- [ ] 打开一个会话
- [ ] 点击 "+" 按钮添加成员
- [ ] 填写成员名称、选择模型
- [ ] 提交后验证成员显示

### 3. 快速创建会话
- [ ] 使用快捷键 Ctrl+J
- [ ] 在快速创建对话框中添加成员
- [ ] 创建会话后验证成员列表

### 4. Background 初始化
- [ ] 重新加载插件
- [ ] 检查控制台无错误
- [ ] 验证 WebSocket 连接正常（如果启用）

---

## 🎯 关键变更

### Member ID 格式
```javascript
// 新格式
`member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`
```

### Member 对象结构
```javascript
{
  id: 'member_xxx',
  name: '成员名称',
  provider: 'openai',
  model: 'gpt-4',
  systemPrompt: '',
  baseUrl: '',
  apiKey: ''
}
```

### 创建会话参数
```javascript
// 旧代码
{
  action: 'createConversation',
  name: '会话名称',
  memberIds: ['id1', 'id2']
}

// 新代码
{
  action: 'createConversation',
  name: '会话名称',
  members: [{id: 'member_xxx', name: '...', ...}, ...]
}
```

---

## ⚠️ 注意事项

1. **不再有全局 Member 管理** - 所有 Member 都是会话特定的
2. **不使用 createMember action** - 直接在前端创建 Member 对象
3. **Member ID 全新生成** - 不复用 Model ID
4. **删除了旧迁移代码** - 不再迁移 'roles' → 'members'

---

**修复完成时间：** 2026-05-25
**修复文件数：** 3 (sidepanel.js, chat.js, background.js)
**修复问题数：** 6
