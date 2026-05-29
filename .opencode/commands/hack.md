---
description: 更新anti-lazy-load对抗脚本，解决AI平台后台标签页无法接收消息的问题
agent: build
---

更新 $1 平台的anti-lazy-load对抗脚本，解决后台标签页无法接收消息的问题。

## 问题背景

当标签页在后台运行时，AI平台会使用"懒加载"机制检测页面是否可见，导致平台不处理消息、MutationObserver不触发、最终无回复。需要更新对抗机制以绕过平台的检测。

### 本扩展工作流程
1. 用户在 chat.html 创建会话，添加AI成员
2. 用户发送消息后，插件自动打开各AI平台的标签页
3. 通过 content-script.js 将消息注入到各平台的输入框
4. 通过 MutationObserver 监听平台的AI回复
5. 将回复返回并显示在 chat.html 中

### 失败表现
- chat页面显示"等待AI回复超时（300秒）"
- Background 日志显示"Ping超时" / "Content Script未就绪"
- MutationObserver 30秒内未检测到新消息

---

## 对抗思维框架

### 平台视角：他们会怎么检测？

| 检测维度 | 具体方法 | 检测原理 |
|---------|---------|---------|
| **时序分析** | 鼠标事件间隔分布 | 人类符合泊松分布，机器过于均匀或完全随机 |
| **行为轨迹** | 鼠标移动曲率、加速度 | 人类有惯性/抖动/修正，贝塞尔曲线过于平滑 |
| **事件可信度** | `event.isTrusted` | `dispatchEvent`产生的事件为`false`，最致命检测 |
| **API完整性** | `toString()`检查 | 重写函数后`toString()`不再返回`[native code]` |
| **iframe对比** | 通过iframe获取原始函数 | 与当前函数对比，检测是否被篡改 |
| **硬件指纹** | 触摸事件与`maxTouchPoints`匹配 | 不支持触摸的设备触发触摸事件=异常 |
| **rAF节流** | `requestAnimationFrame`间隔 | 后台标签页rAF被节流到~1次/秒 |
| **网络状态** | `navigator.connection` | 网络状态与实际请求行为不匹配 |

### 对抗师视角：我们的绕过策略

| 检测维度 | 绕过方案 | 优先级 |
|---------|---------|:------:|
| **事件可信度** | 使用CDP直接派发事件（Playwright） | P0 |
| **API完整性** | 使用Proxy包装，保持`toString()`返回原生代码 | P0 |
| **时序分析** | 高斯分布随机数，模拟人类反应时间 | P1 |
| **行为轨迹** | 物理引擎模拟鼠标，加入惯性/抖动/摩擦 | P1 |
| **rAF节流** | 覆盖rAF，伪造时间戳 | P2 |
| **硬件指纹** | 根据实际硬件动态适配 | P2 |

---

## 指导方案

### 一、读代码，理解现状

阅读以下文件，了解当前对抗机制的完整实现：
- `utils/anti-lazy-load-deepseek.js` - DeepSeek专用（独立IIFE）
- `utils/anti-lazy-load-doubao.js` - 豆包专用（独立IIFE）
- `utils/anti-lazy-load-qianwen.js` - 千问专用（独立IIFE）
- `utils/anti-lazy-load-base.js` - 基类（**未使用**，仅供参考）
- `utils/anti-lazy-load-config.js` - 配置文件（**未使用**，仅供参考）
- `docs/chrome-launch-args.md` - Chrome启动参数文档
- `utils/platforms/$1-adapter.js` - 平台适配器
- `utils/content-script.js` - Content Script

**重要**：当前三个平台脚本都是**独立的IIFE自执行函数**，各自内联所有对抗逻辑，并未继承或使用 `AntiLazyLoadBase` 基类。这是刻意的设计选择，确保每个平台脚本完全独立运行。

### 二、侦察新检测机制

通过Playwright打开$1平台，在控制台诊断，检查以下检测方法：

#### 1. 可见性检测（Visibility Detection）
- `document.hidden` 和 `document.visibilityState` 检查
- `document.hasFocus()` 检查
- `visibilitychange` 事件监听
- Page Lifecycle API（`freeze`/`pagehide`/`resume`）

#### 2. 元素可见性检测（Element Visibility Detection）
- `IntersectionObserver` 检测元素是否在视口内
- `getBoundingClientRect()` 检查元素位置和尺寸
- `getComputedStyle()` 检查元素样式

#### 3. 用户活动检测（User Activity Detection）
- 鼠标移动、点击、滚动事件
- 键盘事件
- 触摸事件（移动端）
- **事件时序分析（人类行为模式）**
- **事件isTrusted检查**

#### 4. 网络状态检测（Network Status Detection）
- `navigator.onLine` 检查
- Network Information API（`saveData`/`effectiveType`/`rtt`）
- WebSocket 连接状态

#### 5. 硬件指纹检测（Hardware Fingerprint Detection）
- `navigator.maxTouchPoints`（触摸点数量）
- `navigator.hardwareConcurrency`（CPU核心数）
- `navigator.deviceMemory`（设备内存）

#### 6. 浏览器API深度检测（Browser API Deep Detection）
- `performance.now()` 时序分析
- `requestIdleCallback` 行为
- `requestAnimationFrame` 行为（**后台节流检测**）
- `navigator.connection` 网络信息

#### 7. API完整性检测（API Integrity Detection）
- `toString()` 检查函数是否被重写
- iframe 对比原始函数

---

### 三、更新对抗代码

针对$1平台，更新对应的anti-lazy-load脚本。以下是按优先级排列的对抗策略：

#### P0：事件可信度对抗（最关键）

**问题**：`dispatchEvent` 产生的事件 `isTrusted = false`，这是最致命的检测。

**方案A：使用CDP直接派发事件（推荐）**
```javascript
// 在content-script.js中，通过background.js调用CDP
// 事件的isTrusted=true，无法被检测
chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: 100,
    y: 100
});
```

**方案B：UserActivation API激活（部分场景有效）**
```javascript
// 激活用户代理状态，使后续事件的isTrusted可能为true
navigator.userActivation.isActive = true;
navigator.userActivation.hasBeenActive = true;

// 注意：此方法不一定对所有事件类型有效
```

**方案C：模拟完整交互序列（降低检测概率）**
```javascript
// 不是直接dispatchEvent，而是模拟完整的交互链
function simulateRealClick(element) {
    // 1. 先触发mousedown
    element.dispatchEvent(new MouseEvent('mousedown', { 
        bubbles: true, cancelable: true 
    }));
    
    // 2. 短暂停留（模拟按下-停留-释放）
    setTimeout(() => {
        // 3. 触发mouseup
        element.dispatchEvent(new MouseEvent('mouseup', { 
            bubbles: true, cancelable: true 
        }));
        // 4. 最后触发click
        element.dispatchEvent(new MouseEvent('click', { 
            bubbles: true, cancelable: true 
        }));
    }, 50 + Math.random() * 100); // 50-150ms停留
}
```

#### P0：API完整性对抗（防止toString检测）

**问题**：直接重写函数后，`toString()` 不再返回原生代码。

**方案：使用Proxy包装**
```javascript
// 错误方式：直接重写
document.hasFocus = () => true;
console.log(document.hasFocus.toString()); 
// 输出: "() => true" ← 暴露！

// 正确方式：Proxy包装
const originalHasFocus = document.hasFocus.bind(document);
document.hasFocus = new Proxy(originalHasFocus, {
    apply: function(target, thisArg, argumentsList) {
        return true; // 始终返回true
    },
    get: function(target, prop) {
        if (prop === 'toString') {
            // 返回原始函数的toString
            return Function.prototype.toString.bind(originalHasFocus);
        }
        if (prop === 'name') {
            return 'hasFocus';
        }
        return Reflect.get(target, prop);
    }
});

console.log(document.hasFocus.toString()); 
// 输出: "function hasFocus() { [native code] }" ← 通过检测！
```

**应用到所有API覆盖**：
```javascript
// 统一的Proxy包装工具函数
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

// 使用示例
document.hasFocus = createStealthOverride(
    document.hasFocus.bind(document),
    () => true
);

document.hidden = undefined; // 属性需要用defineProperty
Object.defineProperty(document, 'hidden', {
    get: createStealthOverride(
        Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get,
        () => false
    )
});
```

#### P1：时序分析对抗（高斯分布）

**问题**：均匀分布随机数不符合人类行为模式。

**方案：使用高斯分布模拟人类行为**
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
    return gaussianRandom(250, 50); // 均值250ms，标准差50ms
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

// 使用示例
function simulateUserActivity() {
    const activities = [
        generateHumanLikeMouseMovement,
        () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })),
        () => window.scrollBy(0, gaussianRandom(0, 50))
    ];
    const activity = activities[Math.floor(Math.random() * activities.length)];
    activity();
    
    setTimeout(simulateUserActivity, mouseMoveInterval());
}
```

#### P1：行为轨迹对抗（物理引擎）

**问题**：贝塞尔曲线过于平滑，缺乏人类特征。

**方案：物理引擎模拟鼠标**
```javascript
class MousePhysicsSimulator {
    constructor() {
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * window.innerHeight;
        this.velocity = { x: 0, y: 0 };
        this.acceleration = 0.3;
        this.friction = 0.85;
        this.jitter = 0.5; // 手部抖动
        this.targetX = this.x;
        this.targetY = this.y;
    }
    
    // 设置目标位置
    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
    }
    
    // 模拟一帧的移动
    step() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 接近目标时减速（模拟精确点击）
        if (distance < 50) {
            this.velocity.x *= 0.7;
            this.velocity.y *= 0.7;
        } else {
            // 远离目标时加速
            this.velocity.x += (dx / distance) * this.acceleration;
            this.velocity.y += (dy / distance) * this.acceleration;
        }
        
        // 应用摩擦力
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        
        // 添加手部抖动（近距离时更明显）
        const jitterAmount = distance < 100 ? this.jitter * 2 : this.jitter;
        this.x += this.velocity.x + (Math.random() - 0.5) * jitterAmount;
        this.y += this.velocity.y + (Math.random() - 0.5) * jitterAmount;
        
        // 边界检查
        this.x = Math.max(0, Math.min(window.innerWidth, this.x));
        this.y = Math.max(0, Math.min(window.innerHeight, this.y));
        
        return { x: this.x, y: this.y };
    }
    
    // 模拟移动到目标位置
    moveTo(targetX, targetY, callback) {
        this.setTarget(targetX, targetY);
        
        const moveStep = () => {
            const pos = this.step();
            
            // 派发mousemove事件
            document.dispatchEvent(new MouseEvent('mousemove', {
                clientX: pos.x,
                clientY: pos.y,
                bubbles: true
            }));
            
            // 检查是否到达目标
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 2) {
                // 继续移动，间隔16-32ms（模拟60-30fps）
                setTimeout(moveStep, 16 + Math.random() * 16);
            } else {
                // 到达目标，触发回调
                if (callback) callback();
            }
        };
        
        moveStep();
    }
}

// 使用示例
const mouseSimulator = new MousePhysicsSimulator();

function generateHumanLikeMouseMovement() {
    const targetX = Math.random() * window.innerWidth;
    const targetY = Math.random() * window.innerHeight;
    
    mouseSimulator.moveTo(targetX, targetY, () => {
        // 移动完成，可能触发点击
        if (Math.random() < 0.1) {
            simulateRealClick(document.elementFromPoint(targetX, targetY));
        }
    });
}
```

#### P2：rAF节流对抗

**问题**：后台标签页的`requestAnimationFrame`被节流到~1次/秒。

**方案：覆盖rAF，伪造时间戳**
```javascript
// 覆盖requestAnimationFrame，防止后台节流检测
const originalRAF = window.requestAnimationFrame;
let lastRAFTime = performance.now();
let rafCallCount = 0;

window.requestAnimationFrame = function(callback) {
    rafCallCount++;
    
    return originalRAF((timestamp) => {
        const now = performance.now();
        const elapsed = now - lastRAFTime;
        
        // 如果间隔超过100ms（被节流），伪造一个正常的时间戳
        if (elapsed > 100) {
            // 伪造为16.67ms间隔（60fps）
            timestamp = lastRAFTime + 16.67;
        }
        
        lastRAFTime = timestamp;
        callback(timestamp);
    });
};

// 保持toString()返回原生代码
window.requestAnimationFrame = createStealthOverride(
    originalRAF,
    window.requestAnimationFrame
);
```

#### P2：硬件指纹适配

**问题**：触摸事件与`maxTouchPoints`不匹配。

**方案：根据实际硬件动态适配**
```javascript
class HardwareAwareSimulator {
    constructor() {
        this.maxTouchPoints = navigator.maxTouchPoints;
        this.hardwareConcurrency = navigator.hardwareConcurrency;
        this.isTouchDevice = this.maxTouchPoints > 0;
        
        // 检测是否为移动设备
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        );
    }
    
    // 模拟触摸事件（仅在支持触摸的设备上）
    simulateTouchIfSupported() {
        if (!this.isTouchDevice) {
            // 不支持触摸，跳过模拟
            return;
        }
        
        const touch = new Touch({
            identifier: Date.now(),
            target: document.body,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight,
            radiusX: 2.5,
            radiusY: 2.5,
            rotationAngle: 10,
            force: 0.5
        });
        
        document.dispatchEvent(new TouchEvent('touchstart', {
            touches: [touch],
            targetTouches: [touch],
            changedTouches: [touch],
            bubbles: true
        }));
    }
    
    // 调整并发数（确保与实际CPU核心数匹配）
    getConcurrency() {
        // 不要覆盖为固定值，使用实际值
        return this.hardwareConcurrency;
    }
}

// 使用示例
const hardwareSimulator = new HardwareAwareSimulator();

// 在用户活动模拟中
function simulateUserActivity() {
    // 鼠标/键盘活动
    generateHumanLikeMouseMovement();
    
    // 触摸活动（仅在触摸设备上）
    if (hardwareSimulator.isTouchDevice && Math.random() < 0.3) {
        hardwareSimulator.simulateTouchIfSupported();
    }
}
```

#### P1：浏览器节流全面对抗（后台标签页关键）

**问题**：后台标签页会被浏览器强制节流，影响：
- `requestAnimationFrame` 被节流到 ~1次/秒
- `setTimeout`/`setInterval` 最小间隔变为 1秒
- React 组件更新被延迟或暂停
- React 懒加载（`React.lazy`、`Suspense`）无法正常触发

**方案A：Web Worker 绕过主线程节流**
```javascript
// Worker 不受主线程节流影响，可以保持高频执行
const workerCode = `
  let timerId = null;
  let interval = 16; // 60fps
  
  self.onmessage = function(e) {
    if (e.data.type === 'start') {
      interval = e.data.interval || 16;
      tick();
    } else if (e.data.type === 'stop') {
      clearTimeout(timerId);
    }
  };
  
  function tick() {
    self.postMessage({ type: 'tick', timestamp: performance.now() });
    timerId = setTimeout(tick, interval);
  }
`;

const blob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(blob);
const tickWorker = new Worker(workerUrl);

// 使用 Worker 时钟替代 setInterval
tickWorker.onmessage = (e) => {
  if (e.data.type === 'tick') {
    // 在这里执行需要高频运行的任务
    checkForNewMessages();
    simulateUserActivity();
  }
};

// 启动 Worker 时钟（不受主线程节流影响）
tickWorker.postMessage({ type: 'start', interval: 100 });
```

**方案B：React 懒加载对抗策略**

React 懒加载（`React.lazy` + `Suspense`）依赖动态 `import()`，后台标签页可能导致：
- chunk 加载超时
- 组件渲染被延迟
- Suspense fallback 一直显示

```javascript
// 1. 预加载关键 chunk（绕过懒加载）
function preloadReactChunks() {
  // 找到页面中的所有 script 标签，预加载相关 chunk
  const scripts = document.querySelectorAll('script[src*="chunk"]');
  scripts.forEach(script => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = script.src;
    document.head.appendChild(link);
  });
  
  // 预加载动态 import 的模块
  if (window.__NEXT_DATA__ || window.__nuxt) {
    // Next.js / Nuxt.js 特定的预加载逻辑
    const routes = extractRoutesFromFramework();
    routes.forEach(route => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = route;
      document.head.appendChild(link);
    });
  }
}

// 2. 强制触发 Suspense 解决（防止永久 pending）
function forceResolveSuspense() {
  // 查找所有 Suspense 边界
  const suspenseElements = document.querySelectorAll('[data-reactroot]');
  
  // 覆盖 React 的 lazy 实现，立即解析
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    // 强制刷新所有 Fiber 节点
    hook.onCommitFiberRoot = (id, root, priorityLevel, didError) => {
      // 强制同步渲染
      root.current.stateNode?.forceUpdate?.();
    };
  }
}

// 3. 覆盖 dynamic import，禁止超时
const originalImport = window.__webpack_require__ || null;
if (originalImport) {
  // 保持 chunk 加载不超时
  const originalEnsure = originalImport.e;
  originalImport.e = function(chunkId) {
    return originalEnsure.call(this, chunkId).catch(err => {
      console.warn('[Anti-Lazy-Load] Chunk load failed, retrying...', chunkId);
      // 重试机制
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          originalEnsure.call(this, chunkId).then(resolve).catch(reject);
        }, 1000);
      });
    });
  };
}
```

**方案C：模拟页面可见性（欺骗 React 调度器）**

React 18+ 使用 Scheduler，会根据页面可见性调整优先级：
```javascript
// 覆盖 Page Visibility API，保持页面"可见"
const originalHiddenGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get;
Object.defineProperty(document, 'hidden', {
  get: createStealthOverride(originalHiddenGetter, () => false)
});

const originalVisibilityStateGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get;
Object.defineProperty(document, 'visibilityState', {
  get: createStealthOverride(originalVisibilityStateGetter, () => 'visible')
});

// 覆盖 document.hasFocus
document.hasFocus = createStealthOverride(
  document.hasFocus.bind(document),
  () => true
);

// 阻止 visibilitychange 事件
const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, listener, options) {
  if (type === 'visibilitychange' || type === 'webkitvisibilitychange') {
    return; // 静默丢弃
  }
  return originalAddEventListener.call(this, type, listener, options);
};

// 定期派发伪可见性事件（保持 React 调度器活跃）
setInterval(() => {
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
}, 1000);
```

**方案D：使用 MessageChannel 保持主线程活跃**
```javascript
// MessageChannel 不受 setTimeout 节流影响
const channel = new MessageChannel();
let messageInterval = 16;

channel.port1.onmessage = (e) => {
  if (e.data.type === 'heartbeat') {
    // 执行需要保持活跃的任务
    simulateMinimalActivity();
    
    // 继续发送心跳
    setTimeout(() => {
      channel.port1.postMessage({ type: 'heartbeat' });
    }, messageInterval);
  }
};

// 启动心跳
channel.port1.postMessage({ type: 'heartbeat' });

// 保持通道活跃
function simulateMinimalActivity() {
  // 最小化活动，防止被检测为完全不活跃
  window.dispatchEvent(new MouseEvent('mousemove', {
    clientX: Math.random() * 100,
    clientY: Math.random() * 100,
    bubbles: false
  }));
}
```

**方案E：覆盖定时器 API（防止后台节流）**
```javascript
// 覆盖 setTimeout/setInterval，保持正常执行
const originalSetTimeout = window.setTimeout;
const originalSetInterval = window.setInterval;

// 使用 requestAnimationFrame 替代（如果未被节流）
window.setTimeout = function(callback, delay, ...args) {
  // 如果延迟小于 1秒，使用 rAF 循环
  if (delay < 1000) {
    const start = performance.now();
    const check = () => {
      if (performance.now() - start >= delay) {
        callback(...args);
      } else {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
    return;
  }
  return originalSetTimeout.call(window, callback, delay, ...args);
};

// 保持 toString() 原生
window.setTimeout = createStealthOverride(originalSetTimeout, window.setTimeout);
window.setInterval = createStealthOverride(originalSetInterval, window.setInterval);
```

#### 基础对抗（已有，需确保使用Proxy包装）

#### 1. 可见性检测对抗
```javascript
// 使用Proxy包装的版本
const originalHiddenGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get;
Object.defineProperty(document, 'hidden', {
    get: createStealthOverride(originalHiddenGetter, () => false)
});

const originalVisibilityStateGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get;
Object.defineProperty(document, 'visibilityState', {
    get: createStealthOverride(originalVisibilityStateGetter, () => 'visible')
});

// WebKit前缀
if ('webkitHidden' in document) {
    Object.defineProperty(document, 'webkitHidden', { get: () => false });
    Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible' });
}

// hasFocus
document.hasFocus = createStealthOverride(
    document.hasFocus.bind(document),
    () => true
);
```

#### 2. IntersectionObserver对抗
```javascript
const OriginalIntersectionObserver = window.IntersectionObserver;
window.IntersectionObserver = class extends OriginalIntersectionObserver {
    constructor(callback, options) {
        const wrappedCallback = (entries, observer) => {
            entries.forEach(entry => {
                entry.isIntersecting = true;
                entry.intersectionRatio = 1;
                entry.boundingClientRect = entry.rootBounds;
            });
            callback(entries, observer);
        };
        super(wrappedCallback, options);
    }
    observe(target) {
        super.observe(target);
        setTimeout(() => this.takeRecords(), 0);
    }
};

// 保持toString()原生
window.IntersectionObserver = createStealthOverride(
    OriginalIntersectionObserver,
    window.IntersectionObserver
);
```

#### 3. 事件拦截（visibilitychange等）
```javascript
const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, listener, options) {
    // 拦截可能导致页面状态变化的事件
    const blockedEvents = [
        'visibilitychange', 'webkitvisibilitychange',
        'freeze', 'resume', 'pagehide', 'pageshow'
    ];
    if (blockedEvents.includes(type)) {
        return; // 静默丢弃
    }
    return originalAddEventListener.call(this, type, listener, options);
};

// 保持toString()原生
EventTarget.prototype.addEventListener = createStealthOverride(
    originalAddEventListener,
    EventTarget.prototype.addEventListener
);
```

---

### 四、测试验证

#### 方法A：使用 MCP Playwright 自动化测试（推荐）

**前置条件**：
- Chrome 浏览器已启动并加载扩展
- 扩展ID已知或可获取
- Playwright MCP 工具可用

**测试步骤**：

```javascript
// 1. 连接到已运行的Chrome浏览器（需先用CDP启动）
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// 2. 获取扩展ID
const extensionId = await getExtensionId(context);

// 3. 打开 chat.html
const chatUrl = `chrome-extension://${extensionId}/chat/chat.html`;
const chatPage = await context.newPage();
await chatPage.goto(chatUrl);

// 4. 操作Chat页面
await chatPage.waitForLoadState('domcontentloaded');

// 新建会话
await chatPage.click('[data-testid="new-conversation"]');
await chatPage.selectOption('[data-testid="member-count"]', '1');
await chatPage.selectOption('[data-testid="mode"]', 'brainstorm');
await chatPage.click('[data-testid="confirm"]');

// 修改成员信息，选择测试平台
await chatPage.click('text=修改成员信息');
await chatPage.selectOption('[data-testid="model-selector"]', '$1');
await chatPage.click('[data-testid="confirm-modal"]');

// 发送测试消息
await chatPage.fill('[data-testid="chat-input"]', '你好，请回复OK');
await chatPage.click('[data-testid="send-button"]');

// 5. 等待AI回复（35秒超时）
try {
    await chatPage.waitForSelector('[data-testid="ai-response"]', { timeout: 35000 });
    console.log('✓ 测试成功：AI已回复');
} catch (e) {
    console.error('✗ 测试失败：35秒内未收到AI回复');
    
    // 检查平台标签页
    const platformPages = await context.pages();
    const platformPage = platformPages.find(p => p.url().includes('$1'));
    if (platformPage) {
        await platformPage.bringToFront();
        // 在控制台执行诊断检查
        const diagnostics = await platformPage.evaluate(() => {
            return {
                hidden: document.hidden,
                visibilityState: document.visibilityState,
                hasFocus: document.hasFocus(),
                hasFocusToString: document.hasFocus.toString(),
                onLine: navigator.onLine
            };
        });
        console.log('诊断信息:', diagnostics);
    }
}
```

**使用 opencode 内置 Playwright 工具**：

```javascript
// 直接使用 playwright_browser_navigate 连接
await playwright_browser_navigate({ url: chatUrl });

// 使用 playwright_browser_snapshot 查看页面状态
await playwright_browser_snapshot();

// 使用 playwright_browser_click 操作元素
await playwright_browser_click({
    target: '[data-testid="new-conversation"]',
    element: '新建会话按钮'
});

// 使用 playwright_browser_type 输入文本
await playwright_browser_type({
    target: '[data-testid="chat-input"]',
    text: '你好，请回复OK'
});

// 使用 playwright_browser_evaluate 执行诊断检查
await playwright_browser_evaluate({
    function: () => {
        console.log('document.hidden:', document.hidden);
        console.log('hasFocus.toString():', document.hasFocus.toString());
        return {
            hidden: document.hidden,
            hasFocusToString: document.hasFocus.toString()
        };
    }
});
```

#### 方法B：手动测试流程

1. 打开 chat.html（chrome-extension://[扩展ID]/chat/chat.html）
2. 新建会话，选择成员数 1，模式选"头脑风暴"
3. 找到成员加入会话信息，点击"修改成员信息"这几个字
4. 弹窗修改成员信息，找到模型下拉框
5. 选择要测试的网页平台（如 $1）
6. 点击弹框确认
7. 找到聊天窗口输入框
8. 输入测试信息："你好，请回复OK"
9. 等待 35 秒
10. 查看聊天框是否有AI回复
11. 如果没有回复，查看对应平台已打开标签页的控制台日志

#### 成功标准
- 聊天框中出现AI回复内容
- 平台标签页控制台无报错

#### 失败表现
- 35秒后聊天框无新消息
- 平台标签页控制台有报错

#### 诊断检查项
在AI平台控制台执行以下检查：
```javascript
// 1. 可见性状态
console.log('document.hidden:', document.hidden); // 应该是 false
console.log('document.visibilityState:', document.visibilityState); // 应该是 "visible"
console.log('document.hasFocus():', document.hasFocus()); // 应该是 true

// 2. API完整性检查（关键！）
console.log('hasFocus.toString():', document.hasFocus.toString()); 
// 应该是 "function hasFocus() { [native code] }"

console.log('addEventListener.toString():', EventTarget.prototype.addEventListener.toString());
// 应该是 "function addEventListener() { [native code] }"

// 3. 事件可信度检查
document.addEventListener('click', (e) => {
    console.log('click.isTrusted:', e.isTrusted); 
    // 如果是false，说明是合成事件（被检测风险）
});

// 4. 对抗脚本日志
// 检查是否有 [Anti-Lazy-Load] 日志输出

// 5. 平台适配器
console.log('window.platformAdapter:', window.platformAdapter); // 应该存在

// 6. 网络状态
console.log('navigator.onLine:', navigator.onLine); // 应该是 true
if (navigator.connection) {
    console.log('navigator.connection.saveData:', navigator.connection.saveData); // 应该是 false
    console.log('navigator.connection.effectiveType:', navigator.connection.effectiveType); // 应该是 "4g"
}

// 7. 硬件指纹
console.log('navigator.maxTouchPoints:', navigator.maxTouchPoints);
console.log('navigator.hardwareConcurrency:', navigator.hardwareConcurrency);
```

---

### 五、Chrome启动参数（备选方案）

如果脚本更新仍无法解决，可尝试Chrome启动参数：
```
chrome.exe --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,IdleShutdown --no-first-run
```

---

## 已知限制与无解问题

### 1. 事件isTrusted问题（部分无解）
- **问题**：`dispatchEvent` 产生的事件 `isTrusted = false`，这是浏览器安全机制
- **现状**：无法通过JavaScript直接设置`isTrusted`
- **缓解**：
  - 使用CDP（Chrome DevTools Protocol）直接派发事件，`isTrusted = true`
  - 模拟完整交互链（mousedown→mouseup→click），降低检测概率
  - 部分平台可能不检查`isTrusted`，需要逐个测试

### 2. rAF节流问题（部分无解）
- **问题**：后台标签页的`requestAnimationFrame`被浏览器强制节流
- **现状**：无法完全绕过浏览器级别的节流
- **缓解**：覆盖rAF，伪造时间戳，但可能导致动画不流畅

### 3. 内存/CPU检测（难以绕过）
- **问题**：平台可能检测JavaScript堆内存使用、CPU占用
- **现状**：无法伪造这些系统级指标
- **缓解**：避免过于频繁的事件触发，保持资源使用合理

### 4. 浏览器指纹（需要CDP支持）
- **问题**：Canvas、WebGL、AudioContext等指纹可能暴露自动化环境
- **现状**：content script无法完全覆盖这些API
- **缓解**：使用Playwright的stealth插件，在浏览器层面伪装

---

## 约束条件

1. **测试验证**：所有修改必须按照第四步骤约定的测试流程验证
2. **谨慎修改**：有问题不要盲目更改代码，需要思考、搜索和借鉴已有的实现
3. **寻求帮助**：当多次无法成功修改，可以和用户讨论，但不是让用户做低级的任务
4. **DOM选择器**：注意dom选择器，不要用带有hash（数字+字母）这种临时的，这种不稳定
5. **隐蔽性**：避免使用明显的console.log，使用debug配置控制日志输出
6. **性能**：避免过于频繁的事件触发（可能被检测为异常）
7. **一致性**：确保模拟行为与真实人类行为一致
8. **兼容性**：不要影响平台的正常功能
9. **Proxy包装**：所有API覆盖必须使用Proxy包装，防止`toString()`检测
10. **高斯分布**：所有随机间隔必须使用高斯分布，符合人类行为模式

---

## 文档管理规范

### 升级日志位置
所有平台脚本的升级日志和说明必须存放在 `docs/platform-upgrades/` 目录下。

### 命名规范
```
docs/platform-upgrades/
├── {platform-name}/
│   ├── CHANGELOG.md          # 该平台的版本变更日志
│   ├── UPGRADE-GUIDE.md      # 升级操作指南
│   └── scripts/              # 相关脚本备份
│       └── {version}/
└── README.md                 # 平台升级总览
```

**命名约束**：
- 平台目录名：小写+连字符（如 `deepseek`, `doubao`, `qianwen`）
- 版本目录：语义化版本（如 `v1.0.0`, `v1.1.0`）
- 文件名：大写+连字符（如 `CHANGELOG.md`）

### 必须记录的内容
每个平台的 `CHANGELOG.md` 必须包含：
1. **版本号** + **日期**
2. **变更类型**：新增/修复/优化/重构
3. **变更描述**：具体修改了什么
4. **影响范围**：哪些功能受影响
5. **测试结果**：是否通过Playwright MCP测试

---

## 测试约束

### 测试工具
**必须使用 Playwright MCP 工具进行测试**，不接受手动测试作为唯一验证手段。

### 测试流程
1. **连接浏览器**：使用 `playwright_browser_navigate` 连接到已运行的Chrome
2. **执行测试**：按照"四、测试验证"中的步骤操作
3. **记录结果**：将测试结果记录到对应平台的 `CHANGELOG.md`

### 测试通过标准
修改必须满足以下**所有条件**才算测试通过：

| 条件 | 验证方法 | 必须通过 |
|------|----------|:--------:|
| AI成功回复 | 聊天框35秒内出现回复 | ✅ |
| 无控制台错误 | `playwright_browser_console_messages` 无error级别 | ✅ |
| API完整性 | `toString()` 返回 `[native code]` | ✅ |
| 可见性状态 | `document.hidden === false` | ✅ |
| 事件可信度 | `isTrusted === true`（如适用） | ✅ |

### 测试失败处理
如果测试未通过：
1. **禁止提交代码**：测试失败的修改不得提交
2. **诊断原因**：使用 `playwright_browser_evaluate` 执行诊断检查
3. **记录失败**：在 `CHANGELOG.md` 中记录失败原因和诊断信息
4. **修复后重测**：修复问题后必须重新执行完整测试流程

### 测试报告模板
每次测试后，在 `CHANGELOG.md` 中添加：
```markdown
## 测试记录 - YYYY-MM-DD

**平台**: {platform-name}
**版本**: {version}
**测试结果**: ✅ 通过 / ❌ 失败

### 测试环境
- Chrome版本: xxx
- 扩展ID: xxx

### 测试步骤
1. xxx
2. xxx

### 诊断信息
```json
{
  "hidden": false,
  "visibilityState": "visible",
  "hasFocus": true
}
```

### 失败原因（如适用）
- 原因描述
- 修复方案
```

---

## 参考资源

- [Bot Detection: How to Block Bad Bots in 2026](https://fingerprint.com/blog/bot-detection/)
- [Anti-Detection Techniques: 2026 Comprehensive Guide](https://www.browserless.io/blog/anti-detection-techniques-2026-guide)
- [From Puppeteer stealth to Nodriver](https://securityboulevard.com/2025/06/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/)
- [Puppeteer Stealth Plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
