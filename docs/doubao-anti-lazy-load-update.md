# 豆包平台 Anti-Lazy-Load 对抗脚本更新总结

## 更新时间
2026-05-28

## 更新目标
解决豆包平台后台标签页无法接收消息的问题，通过升级对抗机制绕过平台的懒加载检测。

## 关键更新

### P0 级别：API完整性对抗（防止toString检测）

**问题**：直接重写函数后，`toString()` 不再返回原生代码，容易被平台检测。

**解决方案**：使用Proxy包装所有API覆盖，保持toString()返回原生代码。

```javascript
// 新增Proxy包装工具函数
function createStealthOverride(originalFn, overrideFn) {
  return new Proxy(originalFn, {
    apply: function(target, thisArg, argumentsList) {
      return overrideFn.apply(thisArg, argumentsList);
    },
    get: function(target, prop) {
      if (prop === 'toString') {
        return Function.prototype.toString.bind(originalFn);
      }
      if (prop === 'name') {
        return originalFn.name;
      }
      if (prop === 'length') {
        return originalFn.length;
      }
      return Reflect.get(target, prop);
    }
  });
}
```

**已应用到**：
- ✅ `document.hasFocus` - Focus API覆盖
- ✅ `EventTarget.prototype.addEventListener` - 事件拦截
- ✅ `window.IntersectionObserver` - IntersectionObserver覆盖
- ✅ `window.requestIdleCallback` - requestIdleCallback覆盖
- ✅ `document.hidden` 和 `document.visibilityState` - Visibility API覆盖

### P1 级别：时序分析对抗（高斯分布）

**问题**：均匀分布随机数不符合人类行为模式，平台可以通过时序分析检测自动化。

**解决方案**：使用高斯分布模拟人类行为模式。

```javascript
// 高斯随机数生成器（Box-Muller变换）
function gaussianRandom(mean = 0, stdev = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

// 人类反应时间（150-400ms，符合心理学研究）
function humanReactionTime() {
  return Math.max(50, gaussianRandom(250, 50));
}

// 打字速度变化
function typingDelay() {
  // 5%概率长停顿（思考）
  if (Math.random() < 0.05) {
    return gaussianRandom(800, 200);
  }
  // 正常打字间隔
  return gaussianRandom(80, 30);
}

// 鼠标移动间隔
function mouseMoveInterval() {
  // 符合人类行为：2-7秒，但分布不均匀
  return Math.max(1000, gaussianRandom(4000, 1500));
}
```

**已应用到**：
- ✅ 鼠标移动模拟 - 使用高斯分布间隔
- ✅ 用户活动模拟 - 使用高斯分布间隔
- ✅ 平滑移动延迟 - 使用高斯分布延迟

### P1 级别：增强事件拦截

**问题**：原有实现只拦截了 `document.addEventListener`，应该拦截 `EventTarget.prototype.addEventListener`。

**解决方案**：拦截更多可见性相关事件。

```javascript
// 拦截 visibilitychange 等事件（使用Proxy包装）
function blockVisibilityChange() {
  const blockedEvents = [
    'visibilitychange', 'webkitvisibilitychange',
    'freeze', 'resume', 'pagehide', 'pageshow'
  ];
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const stealthAddEventListener = function(type, listener, options) {
    if (blockedEvents.includes(type)) {
      return; // 静默丢弃
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.addEventListener = createStealthOverride(
    originalAddEventListener,
    stealthAddEventListener
  );
}
```

## 技术细节

### 高斯分布原理
使用 Box-Muller 变换将均匀分布转换为高斯分布（正态分布）：

```
Z = √(-2 ln U)) × cos(2πV)
```

其中 U 和 V 是均匀分布的随机数，Z 服从标准正态分布 N(0,1)。

### Proxy包装原理
通过 ES6 Proxy 对象拦截函数的调用和属性访问，保持toString()返回原生代码：

```javascript
// 检测前
console.log(document.hasFocus.toString());
// 输出: "() => true" ❌ 暴露！

// 检测后（使用Proxy包装）
console.log(document.hasFocus.toString());
// 输出: "function hasFocus() { [native code] }" ✓ 通过检测！
```

## 已知限制

### 事件可信度问题（isTrusted）
- **问题**：`dispatchEvent` 产生的事件 `isTrusted = false`，这是浏览器安全机制
- **现状**：无法通过JavaScript直接设置`isTrusted`
- **缓解**：
  - 需要使用CDP（Chrome DevTools Protocol）直接派发事件，`isTrusted = true`
  - 模拟完整交互链（mousedown→mouseup→click），降低检测概率
  - 部分平台可能不检查`isTrusted`，需要逐个测试

### rAF节流问题
- **问题**：后台标签页的`requestAnimationFrame`被浏览器强制节流
- **现状**：无法完全绕过浏览器级别的节流
- **缓解**：可以覆盖rAF，伪造时间戳，但可能导致动画不流畅（未实现）

## 测试验证

### 诊断脚本
提供了完整的诊断脚本：`utils/diagnostics/doubao-diagnostic.js`

在豆包平台控制台运行此脚本，可以检查：
1. 可见性状态（document.hidden, document.visibilityState, document.hasFocus）
2. API完整性（toString()是否返回原生代码）
3. 事件可信度（isTrusted）
4. 对抗脚本加载状态
5. 网络状态
6. 硬件指纹
7. 事件拦截是否生效
8. 高斯分布随机数统计

### 手动测试流程
按照指导方案的测试流程：
1. 打开 chat.html（chrome-extension://[扩展ID]/chat/chat.html）
2. 新建会话，选择成员数 1，模式选"头脑风暴"
3. 找到成员加入会话信息，点击"修改成员信息"
4. 弹窗修改成员信息，找到模型下拉框
5. 选择要测试的网页平台（如 doubao）
6. 点击弹框确认
7. 找到聊天窗口输入框
8. 输入测试信息："你好，请回复OK"
9. 等待 35 秒
10. 查看聊天框是否有AI回复
11. 如果没有回复，查看对应平台已打开标签页的控制台日志

### 成功标准
- ✅ 聊天框中出现AI回复内容
- ✅ 平台标签页控制台无报错
- ✅ document.hasFocus.toString() 返回 "[native code]"

### 失败表现
- ❌ 35秒后聊天框无新消息
- ❌ 平台标签页控制台有报错

## 对比分析

### 更新前
```javascript
// 直接重写，暴露toString
document.hasFocus = () => true;
console.log(document.hasFocus.toString()); // "() => true" ❌

// 使用均匀分布随机数
const interval = Math.random() * (max - min) + min; // 不符合人类行为 ❌

// 只拦截document.addEventListener
const origAddEventListener = document.addEventListener; // 不够全面 ❌
```

### 更新后
```javascript
// Proxy包装，保持toString
document.hasFocus = createStealthOverride(originalHasFocus, () => true);
console.log(document.hasFocus.toString()); // "function hasFocus() { [native code] }" ✓

// 使用高斯分布随机数
const interval = mouseMoveInterval(); // 符合人类行为 ✓

// 拦截EventTarget.prototype.addEventListener
EventTarget.prototype.addEventListener = createStealthOverride(...); // 全面覆盖 ✓
```

## 下一步优化（可选）

### P2 级别：rAF节流对抗
覆盖 requestAnimationFrame，伪造时间戳，防止后台节流检测。

### P2 级别：硬件指纹适配
根据实际硬件（maxTouchPoints, hardwareConcurrency）动态适配事件模拟。

### P0 级别：CDP事件派发
通过 background.js 使用 CDP 直接派发事件，使 isTrusted = true。

## 文件变更

### 修改文件
- `utils/anti-lazy-load-doubao.js` - 豆包平台专用防懒加载脚本

### 新增文件
- `utils/diagnostics/doubao-diagnostic.js` - 诊断测试脚本

## 参考资料

- [Bot Detection: How to Block Bad Bots in 2026](https://fingerprint.com/blog/bot-detection/)
- [Anti-Detection Techniques: 2026 Comprehensive Guide](https://www.browserless.io/blog/anti-detection-techniques-2026-guide)
- [From Puppeteer stealth to Nodriver](https://securityboulevard.com/2025/06/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/)
- [Puppeteer Stealth Plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
