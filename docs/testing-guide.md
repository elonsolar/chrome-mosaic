# AI平台懒加载问题测试指南

## 测试环境准备

### 1. 重新加载扩展
在Chrome中：
1. 打开 `chrome://extensions/`
2. 找到"Free AI"扩展
3. 点击"重新加载"按钮（刷新图标）

### 2. 清除缓存
1. 打开 `chrome://settings/clearBrowserData`
2. 选择"缓存的图片和文件"
3. 点击"清除数据"

## 测试步骤

### 步骤1：验证脚本注入

1. 打开DeepSeek网站：https://chat.deepseek.com
2. 按F12打开开发者工具
3. 在控制台中输入：
   ```javascript
   console.log('hidden:', document.hidden);
   console.log('visibilityState:', document.visibilityState);
   ```
4. **期望结果**：应该看到 `hidden: false` 和 `visibilityState: "visible"`
5. **检查日志**：应该看到 `[Anti-Lazy-Load]` 开头的日志

### 步骤2：测试DeepSeek

1. 打开DeepSeek网站
2. 在chat.html中创建一个只包含DeepSeek的会话
3. 发送一条测试消息
4. **立即切换到其他标签页**（不要停留在DeepSeek标签页）
5. 等待30秒
6. **检查**：DeepSeek是否返回了消息？
   - 如果返回了，说明脚本有效 ✅
   - 如果没有返回，查看控制台是否有错误 ❌

### 步骤3：测试豆包

1. 打开豆包网站：https://www.doubao.com/chat/
2. 在控制台中检查是否有 `[Anti-Lazy-Load-Doubao]` 日志
3. 验证IntersectionObserver是否被覆盖：
   ```javascript
   // 测试IntersectionObserver
   const observer = new IntersectionObserver((entries) => {
     console.log('Entry:', entries[0]);
     console.log('isIntersecting:', entries[0].isIntersecting);
   });
   observer.observe(document.body);
   ```
4. **期望结果**：应该立即看到 `isIntersecting: true`
5. 在chat.html中创建包含豆包的会话
6. 发送消息后切换标签页
7. **检查**：豆包是否返回了消息？

### 步骤4：测试千问

1. 打开千问网站：https://www.qianwen.com/
2. 在控制台中检查是否有 `[Anti-Lazy-Load-Qianwen]` 日志
3. 验证网络状态API是否被覆盖：
   ```javascript
   console.log('connection:', navigator.connection);
   console.log('effectiveType:', navigator.connection.effectiveType);
   ```
4. **期望结果**：应该看到 `effectiveType: "4g"`
5. 在chat.html中创建包含千问的会话
6. 发送消息后切换标签页
7. **检查**：千问是否返回了消息？

### 步骤5：测试Kimi（对照组）

1. 打开Kimi网站：https://www.kimi.com/
2. 在chat.html中创建包含Kimi的会话
3. 发送消息后切换标签页
4. **期望结果**：Kimi应该始终能正常返回消息（无需脚本）

### 步骤6：多平台并发测试

1. 创建包含DeepSeek、豆包、千问、Kimi的会话
2. 发送一条消息
3. **立即切换到其他标签页**
4. 等待1分钟
5. **检查**：所有平台是否都返回了消息？
   - DeepSeek: ✅ / ❌
   - 豆包: ✅ / ❌
   - 千问: ✅ / ❌
   - Kimi: ✅ / ❌

## 调试方法

### 查看所有注入的脚本

在控制台中执行：
```javascript
// 查看所有已加载的脚本
console.log(performance.getEntriesByType('resource').filter(r => r.name.includes('anti-lazy-load')));
```

### 检查事件监听器

```javascript
// 检查document上的所有事件监听器
console.log(getEventListeners(document));

// 检查是否有visibilitychange监听器
const listeners = getEventListeners(document);
console.log('visibilitychange listeners:', listeners.visibilitychange);
```

### 检查页面状态

```javascript
// 综合检查
console.log('=== 页面状态检查 ===');
console.log('document.hidden:', document.hidden);
console.log('document.visibilityState:', document.visibilityState);
console.log('document.hasFocus():', document.hasFocus());
console.log('document.wasDiscarded:', document.wasDiscarded);

if (navigator.connection) {
  console.log('navigator.connection.effectiveType:', navigator.connection.effectiveType);
  console.log('navigator.connection.saveData:', navigator.connection.saveData);
}

console.log('window.onfocus:', window.onfocus);
console.log('window.onblur:', window.onblur);
```

### 监控API调用

```javascript
// 监控setVisibility（如果平台调用）
const originalSetAttribute = Element.prototype.setAttribute;
Element.prototype.setAttribute = function(name, value) {
  if (name === 'hidden' || name === 'aria-hidden') {
    console.log('setAttribute:', name, '=', value);
  }
  return originalSetAttribute.call(this, name, value);
};
```

## 常见问题排查

### 问题1：脚本没有注入

**症状**：控制台没有看到 `[Anti-Lazy-Load]` 日志

**排查步骤**：
1. 检查 `chrome://extensions/` 中扩展是否已启用
2. 检查manifest.json中的路径是否正确
3. 刷新页面并重新检查
4. 查看扩展的错误日志

**解决方案**：
- 重新加载扩展
- 检查文件路径
- 查看Chrome扩展的错误页面

### 问题2：脚本注入了但没有效果

**症状**：能看到日志，但平台仍然不返回消息

**排查步骤**：
1. 检查 `document.hidden` 的值是否为 `false`
2. 检查是否有其他脚本覆盖了我们的设置
3. 查看平台自己的代码，寻找其他检测机制

**解决方案**：
- 尝试使用Chrome启动参数
- 增强注入脚本
- 联系开发者获取支持

### 问题3：某些平台有效，某些无效

**症状**：DeepSeek有效，但豆包和千问无效

**可能原因**：
- 不同平台使用了不同的检测机制
- 注入脚本对某些平台不够完善
- 平台更新了检测机制

**解决方案**：
- 为每个平台定制脚本（已完成）
- 使用Chrome启动参数增强
- 持续监控和更新

### 问题4：所有平台都无效

**症状**：即使注入了脚本，所有平台都不返回消息

**可能原因**：
- Chrome的背景标签页优化机制
- 扩展权限不足
- 消息传递机制问题

**解决方案**：
1. 使用Chrome启动参数：
   ```bash
   chrome.exe --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,IdleShutdown
   ```

2. 检查扩展权限：
   - 打开 `chrome://extensions/`
   - 点击"详细信息"
   - 确保"网站访问权限"包含了所有AI平台

3. 检查消息传递：
   - 在控制台中查看是否有消息传递错误
   - 检查background.js的日志

## 性能测试

### 测试资源消耗

1. 打开任务管理器（Ctrl+Shift+Esc）
2. 找到Chrome进程
3. 观察以下指标：
   - CPU使用率
   - 内存使用量
   - 网络活动

**期望结果**：
- CPU使用率应该有轻微增加（由于模拟用户活动）
- 内存使用量应该稳定
- 网络活动应该正常（消息能够发送和接收）

### 测试长时间运行

1. 创建会话并发送消息
2. 切换到其他标签页
3. 保持标签页在后台运行1小时
4. 返回检查是否还能正常使用

**期望结果**：
- 页面应该保持活跃
- 新消息应该能够正常接收
- 没有内存泄漏

## 日志收集

如果问题仍然存在，请收集以下信息：

1. **控制台日志**：
   ```javascript
   // 导出所有日志
   console.log('%c=== 日志收集 ===', 'color: red; font-size: 20px;');
   console.log('User Agent:', navigator.userAgent);
   console.log('Platform:', navigator.platform);
   console.log('Language:', navigator.language);
   ```

2. **扩展信息**：
   - 扩展版本
   - Chrome版本
   - 操作系统版本

3. **复现步骤**：
   - 详细的操作步骤
   - 预期结果
   - 实际结果

4. **截图**：
   - 控制台截图
   - 网络请求截图
   - 页面状态截图

## 成功标准

✅ **测试通过的标准**：
1. 所有注入脚本成功加载（控制台有日志）
2. `document.hidden` 始终返回 `false`
3. 在后台标签页中，所有AI平台都能正常返回消息
4. 没有明显的性能问题
5. 长时间运行稳定

❌ **测试失败的标准**：
1. 脚本注入失败
2. 平台在后台不返回消息
3. 出现严重的性能问题
4. 浏览器崩溃或卡死

## 下一步行动

如果测试通过：
1. 在实际使用中验证
2. 收集用户反馈
3. 持续监控平台更新

如果测试失败：
1. 查看详细日志
2. 尝试Chrome启动参数
3. 联系开发者获取支持
4. 考虑使用Playwright等自动化工具
