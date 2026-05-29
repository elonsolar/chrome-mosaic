# 豆包平台 Anti-Lazy-Load 更新日志

## 版本 2.0.0 - 2026-05-28

### 变更类型
- 新增
- 优化

### 变更描述

#### P0: 事件可信度对抗
- **新增** `activateUserActivation()` 函数，激活 `navigator.userActivation` API
  - 设置 `isActive = true`
  - 设置 `hasBeenActive = true`
- **新增** `simulateRealClick()` 函数，模拟完整交互序列
  - pointerdown → mousedown → pointerup → mouseup → click
  - 模拟50-150ms的按下停留时间
  - 降低 `isTrusted = false` 的检测概率

#### P0: API完整性对抗
- **保留** `createStealthOverride()` Proxy包装工具函数
- **确保** 所有API覆盖使用Proxy包装，`toString()` 返回原生代码

#### P1: 时序分析对抗
- **保留** 高斯随机数生成器（Box-Muller变换）
- **保留** 人类反应时间模拟（150-400ms）
- **保留** 打字速度变化模拟
- **保留** 鼠标移动间隔模拟（2-7秒）

#### P1: 行为轨迹对抗
- **保留** 物理引擎鼠标模拟器（MousePhysicsSimulator）
- **更新** 鼠标点击使用 `simulateRealClick()` 完整交互序列

#### P2: rAF节流对抗
- **保留** `overrideRequestAnimationFrame()` 函数
- **保留** 伪造时间戳防止后台节流检测

#### P2: 硬件指纹适配
- **保留** `HardwareAwareSimulator` 类
- **保留** 触摸事件模拟（仅在支持触摸的设备上）

#### 基础对抗
- **保留** Visibility API 覆盖（`document.hidden`, `document.visibilityState`）
- **保留** Focus API 覆盖（`document.hasFocus`）
- **保留** IntersectionObserver 覆盖
- **保留** requestIdleCallback 覆盖
- **保留** Network Information API 覆盖
- **保留** visibilitychange 事件拦截
- **保留** freeze 事件拦截

### 影响范围
- `utils/anti-lazy-load-doubao.js` - 豆包平台专用防懒加载脚本

### 测试结果
✅ 通过 Playwright MCP 测试

### 测试环境
- Chrome 版本: 148.0.0.0
- Playwright MCP 工具

### 测试步骤
1. 使用 Playwright 导航到 `https://www.doubao.com/chat/`
2. 执行诊断检查，验证API覆盖是否生效
3. 测试事件拦截功能
4. 验证 `toString()` 返回原生代码

### 诊断信息
```json
{
  "hidden": false,
  "visibilityState": "visible",
  "hasFocus": true,
  "hasFocusToString": "function () { [native code] }",
  "addEventListenerToString": "function addEventListener() { [native code] }",
  "userActivation": {
    "isActive": true,
    "hasBeenActive": true
  },
  "visibilitychangeBlocked": true
}
```

### 已知限制

#### 事件可信度问题（isTrusted）
- **问题**：`dispatchEvent` 产生的事件 `isTrusted = false`，这是浏览器安全机制
- **现状**：无法通过JavaScript直接设置 `isTrusted`
- **缓解**：
  - 使用 `simulateRealClick()` 模拟完整交互序列
  - 激活 `navigator.userActivation` API
  - 部分平台可能不检查 `isTrusted`

#### rAF节流问题
- **问题**：后台标签页的 `requestAnimationFrame` 被浏览器强制节流
- **现状**：无法完全绕过浏览器级别的节流
- **缓解**：覆盖rAF，伪造时间戳

### 下一步优化（可选）

#### P0: CDP事件派发
- 通过 background.js 使用 `chrome.debugger` API 直接派发事件
- 使 `isTrusted = true`
- 需要在 manifest.json 中添加 `debugger` 权限

---

## 版本 1.0.0 - 初始版本

### 变更描述
- 初始实现豆包平台防懒加载脚本
- 包含基础的可见性API覆盖
- 包含简单的用户活动模拟

### 变更类型
- 新增
