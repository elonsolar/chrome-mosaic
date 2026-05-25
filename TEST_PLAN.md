# Member/Conversation 重构测试计划

## 📋 重构概述

本次重构将 **Member** 存储从全局 `chrome.storage.local.members` 迁移到 **Conversation** 内部：
- ❌ 旧架构：`conversation.memberIds` + 全局 `members` 数组
- ✅ 新架构：`conversation.members` = [{id, name, provider, model, systemPrompt, baseUrl, apiKey}, ...]

---

## 🧪 测试场景

### 1. 创建新会话（popup.js）

**步骤：**
1. 点击 popup 界面的"新建对话"按钮
2. 验证会话是否创建成功
3. 打开会话，检查成员列表

**预期结果：**
- ✅ 会话创建成功
- ✅ `conversation.members` 数组包含所有启用的 Model 转换后的 Member 对象
- ✅ 每个 Member 有唯一的 `member_xxx` 格式 ID
- ✅ Member 包含 `name`, `provider`, `model` 等字段
- ✅ 不再有 `memberIds` 字段

---

### 2. 发送消息（chat.js）

**步骤：**
1. 打开一个有多个成员的会话
2. 发送一条消息
3. 观察消息列表

**预期结果：**
- ✅ 消息发送成功
- ✅ 所有成员同时收到消息（并行模式）
- ✅ 成员名称正确显示（从 `conversation.members` 获取）
- ✅ 没有控制台错误

---

### 3. Flow 测试（临时会话）

**步骤：**
1. 创建一个 Flow 测试
2. 运行测试
3. 观察临时会话的创建和清理

**预期结果：**
- ✅ Flow 测试运行成功
- ✅ 临时会话创建时包含完整的 Member 对象
- ✅ Member ID 格式为 `member_xxx`
- ✅ 测试完成后临时会话正确清理
- ✅ 检查 `flow-executor.js` 日志，确认使用了 `conversation.members[0]`

---

### 4. 成员管理（chat.js）

**步骤：**
1. 打开一个会话
2. 尝试添加新成员（如果有这个功能）
3. 尝试移除成员

**预期结果：**
- ✅ 添加成员时，新成员对象被 push 到 `conversation.members`
- ✅ 移除成员时，从 `conversation.members` 数组中 filter 掉该成员
- ✅ `memberOrder` 自动更新为 `members.map(m => m.id)`
- ✅ 界面立即刷新显示新成员列表

---

### 5. Dashboard 显示（dashboard.js）

**步骤：**
1. 打开管理面板
2. 查看会话列表
3. 点击查看会话详情

**预期结果：**
- ✅ 会话列表显示成员名称（从 `conversation.members` 获取）
- ✅ 模型过滤器正常工作（通过 `member.provider` 和 `member.model` 匹配）
- ✅ 会话详情显示正确的成员信息
- ✅ 没有关于 `memberIds` 的错误

---

### 6. Sidepanel 显示（sidepanel.js）

**步骤：**
1. 打开侧边栏
2. 查看最近会话列表
3. 编辑某个会话

**预期结果：**
- ✅ 会话列表显示成员名称
- ✅ 编辑会话时显示当前成员
- ✅ 不再显示全局成员选择器（因为已删除）

---

### 7. 数据持久化

**步骤：**
1. 创建新会话
2. 添加几条消息
3. 刷新页面
4. 重新打开会话

**预期结果：**
- ✅ 会话数据正确保存
- ✅ `conversation.members` 数组完整保存
- ✅ 消息的 `memberId` 正确关联到 `conversation.members`
- ✅ 没有数据丢失

---

### 8. 向后兼容性检查

**步骤：**
1. 检查是否有旧数据包含 `memberIds`
2. 尝试加载旧会话

**预期结果：**
- ⚠️  旧数据可能无法正常加载（根据用户要求，不做迁移）
- ✅ 新会话完全使用新架构
- ✅ 代码中没有对 `memberIds` 的后备逻辑

---

## 🔍 调试检查点

### Console 检查

打开开发者工具，检查是否有以下错误：

1. **`state.members is undefined`**
   - 如果出现，说明某处还在使用 `state.members`
   - 检查 `chat.js` 是否有遗漏

2. **`conversation.memberIds is undefined`**
   - 如果出现，说明某处还在使用 `conversation.memberIds`
   - 检查是否所有地方都改为 `conversation.members`

3. **`getMembers is not a function`**
   - 如果出现，说明某处还在调用 `getMembers()`
   - 检查是否有遗漏的函数调用

### Storage 检查

打开 `chrome.storage.local`，检查：

1. ✅ `members` 字段应该为空或不存在
2. ✅ `conversations` 数组中每个会话都有 `members` 字段
3. ✅ `conversations` 数组中会话不应该有 `memberIds` 字段

---

## 📊 成功标准

重构成功的标志：

- ✅ 所有测试场景通过
- ✅ 没有控制台错误
- ✅ 所有功能正常工作
- ✅ 代码中不再有 `getMembers()` 调用
- ✅ 代码中不再有 `memberIds` 赋值
- ✅ 所有 Member 数据都存储在 `conversation.members` 中

---

## 🐛 已知限制

根据用户要求：

1. ❌ **不支持数据迁移**
   - 旧会话数据（使用 `memberIds`）可能无法正常工作
   - 建议：清空所有数据，重新开始

2. ❌ **不再有全局 Member 管理**
   - 所有 Member 都是会话特定的
   - 不能在不同会话间共享 Member 配置

3. ✅ **保留快速创建功能**
   - popup.js 的"新建对话"功能保留
   - 自动将 Models 转换为 Members

---

## 📝 测试记录

请在此记录测试结果：

- [ ] 测试 1: 创建新会话 - 通过 / 失败
- [ ] 测试 2: 发送消息 - 通过 / 失败
- [ ] 测试 3: Flow 测试 - 通过 / 失败
- [ ] 测试 4: 成员管理 - 通过 / 失败
- [ ] 测试 5: Dashboard 显示 - 通过 / 失败
- [ ] 测试 6: Sidepanel 显示 - 通过 / 失败
- [ ] 测试 7: 数据持久化 - 通过 / 失败
- [ ] 测试 8: 向后兼容性 - 通过 / 失败

**备注：** _______________
