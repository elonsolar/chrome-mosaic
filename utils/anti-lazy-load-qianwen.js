// 千问专用防懒加载脚本 - 增强版
// 版本: 3.0.0
// 更新日期: 2026-05-29
// 主要更新: Fetch拦截器、过滤思考内容
(function() {
  'use strict';

  // 配置
  const CONFIG = {
    debug: false,
    mouseMovement: {
      minInterval: 1000,
      maxInterval: 4000,
      smoothMovement: true
    },
    userActivity: {
      eventTypes: ['mousemove', 'keydown', 'scroll'],
      interval: { min: 1500, max: 3500 },
      enableTouch: true
    },
    websocket: {
      enabled: true,
      pingInterval: 15000,
      pingMessage: { type: 'ping' }
    }
  };

  const activityIntervals = [];

  function debug(...args) {
    if (CONFIG.debug) {
      console.log('[Anti-Lazy-Load-Qianwen]', ...args);
    }
  }

  // 高斯随机数生成器（Box-Muller变换）
  function gaussianRandom(mean = 0, stdev = 1) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }

  // 鼠标移动间隔（高斯分布）
  function mouseMoveInterval() {
    return Math.max(1000, gaussianRandom(4000, 1500));
  }

  // Proxy包装工具函数 - 保持toString()返回原生代码
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

  // 覆盖 Visibility API
  function overrideVisibilityAPI() {
    try {
      const originalHiddenGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get;
      Object.defineProperty(document, 'hidden', {
        get: createStealthOverride(originalHiddenGetter, () => false),
        configurable: true
      });

      const originalVisibilityStateGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get;
      Object.defineProperty(document, 'visibilityState', {
        get: createStealthOverride(originalVisibilityStateGetter, () => 'visible'),
        configurable: true
      });

      // WebKit前缀
      if ('webkitHidden' in document) {
        Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
      }
      debug('Visibility API 已覆盖');
    } catch (e) {}
  }

  // 拦截所有可见性相关事件
  function blockVisibilityEvents() {
    const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'freeze', 'resume', 'pagehide', 'pageshow'];
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const stealthAddEventListener = function(type, listener, options) {
      if (blockedEvents.includes(type)) {
        return;
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
    EventTarget.prototype.addEventListener = createStealthOverride(
      originalAddEventListener,
      stealthAddEventListener
    );
    debug('可见性事件拦截已启用');
  }

  // 覆盖 Page Lifecycle API
  function overridePageLifecycleAPI() {
    const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
    const stealthDispatchEvent = function(event) {
      if (event.type === 'freeze' || event.type === 'pagehide') {
        return false;
      }
      return originalDispatchEvent.call(this, event);
    };
    EventTarget.prototype.dispatchEvent = createStealthOverride(
      originalDispatchEvent,
      stealthDispatchEvent
    );

    try {
      Object.defineProperty(document, 'wasDiscarded', {
        get: () => false,
        configurable: true
      });
      debug('Page Lifecycle API 已覆盖');
    } catch (e) {}
  }

  // 覆盖 Network Information API
  function overrideNetworkInfoAPI() {
    if (!navigator.connection) return;
    try {
      const originalSaveDataGetter = Object.getOwnPropertyDescriptor(
        navigator.connection, 'saveData'
      )?.get;
      const originalEffectiveTypeGetter = Object.getOwnPropertyDescriptor(
        navigator.connection, 'effectiveType'
      )?.get;
      const originalRttGetter = Object.getOwnPropertyDescriptor(
        navigator.connection, 'rtt'
      )?.get;

      if (originalSaveDataGetter) {
        Object.defineProperty(navigator.connection, 'saveData', {
          get: createStealthOverride(originalSaveDataGetter, () => false),
          configurable: true
        });
      }
      if (originalEffectiveTypeGetter) {
        Object.defineProperty(navigator.connection, 'effectiveType', {
          get: createStealthOverride(originalEffectiveTypeGetter, () => '4g'),
          configurable: true
        });
      }
      if (originalRttGetter) {
        Object.defineProperty(navigator.connection, 'rtt', {
          get: createStealthOverride(originalRttGetter, () => 0),
          configurable: true
        });
      }
      debug('Network Information API 已覆盖');
    } catch (e) {}
  }

  // 覆盖 requestIdleCallback
  function overrideRequestIdleCallback() {
    if (!window.requestIdleCallback) return;
    const originalRequestIdleCallback = window.requestIdleCallback;
    const stealthRequestIdleCallback = function(callback, options) {
      const deadline = { didTimeout: false, timeRemaining: () => 100 };
      return setTimeout(() => callback(deadline), 0);
    };
    window.requestIdleCallback = createStealthOverride(
      originalRequestIdleCallback,
      stealthRequestIdleCallback
    );
    debug('requestIdleCallback 已覆盖');
  }

  // 覆盖 IntersectionObserver
  function overrideIntersectionObserver() {
    if (!window.IntersectionObserver) return;
    const OriginalIntersectionObserver = window.IntersectionObserver;
    const StealthIntersectionObserver = function(callback, options) {
      const wrappedCallback = (entries, observer) => {
        const modifiedEntries = entries.map(entry => {
          entry.isIntersecting = true;
          entry.intersectionRatio = 1;
          entry.intersectionRect = entry.boundingClientRect;
          return entry;
        });
        return callback(modifiedEntries, observer);
      };

      const observer = new OriginalIntersectionObserver(wrappedCallback, options);
      const originalObserve = observer.observe.bind(observer);

      observer.observe = function(element) {
        setTimeout(() => {
          const mockEntry = {
            target: element,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: element.getBoundingClientRect(),
            intersectionRect: element.getBoundingClientRect(),
            rootBounds: null,
            time: performance.now()
          };
          wrappedCallback([mockEntry], observer);
        }, 0);
        return originalObserve(element);
      };

      return observer;
    };
    StealthIntersectionObserver.prototype = OriginalIntersectionObserver.prototype;

    window.IntersectionObserver = createStealthOverride(
      OriginalIntersectionObserver,
      StealthIntersectionObserver
    );
    debug('IntersectionObserver 已覆盖');
  }

  // 覆盖 Focus API
  function overrideFocusAPI() {
    try {
      const originalHasFocus = document.hasFocus.bind(document);
      document.hasFocus = createStealthOverride(
        originalHasFocus,
        () => true
      );
      debug('hasFocus 已覆盖');
    } catch (e) {}

    try {
      Object.defineProperty(window, 'onfocus', {
        set: function(value) { this._onfocus = value; },
        get: function() { return this._onfocus; },
        configurable: true
      });
      Object.defineProperty(window, 'onblur', {
        set: function(value) {},
        get: function() { return null; },
        configurable: true
      });
    } catch (e) {}
  }

  // 覆盖 requestAnimationFrame（防止后台节流检测）
  function overrideRequestAnimationFrame() {
    const originalRAF = window.requestAnimationFrame;
    let lastRAFTime = performance.now();
    let rafId = 0;

    const stealthRAF = function(callback) {
      if (typeof callback !== 'function') return 0;
      
      rafId++;
      const currentId = rafId;
      
      const wrappedCallback = (timestamp) => {
        const now = performance.now();
        const elapsed = now - lastRAFTime;
        
        // 如果间隔过大（被节流），伪造时间戳
        if (elapsed > 100) {
          timestamp = lastRAFTime + 16.67;
        } else {
          timestamp = lastRAFTime + elapsed;
        }
        
        lastRAFTime = timestamp;
        try {
          callback(timestamp);
        } catch (e) {
          debug('RAF callback error:', e.message);
        }
      };
      
      return originalRAF(wrappedCallback);
    };

    window.requestAnimationFrame = createStealthOverride(originalRAF, stealthRAF);
    debug('requestAnimationFrame 已覆盖');
  }

  // 覆盖 Performance API（防止时序分析）
  function overridePerformanceAPI() {
    try {
      const originalNow = performance.now.bind(performance);
      let lastNow = originalNow();
      
      performance.now = createStealthOverride(
        originalNow,
        function() {
          const realNow = originalNow();
          const elapsed = realNow - lastNow;
          
          // 如果间隔过大（被节流），返回伪造的时间戳
          if (elapsed > 100) {
            lastNow = lastNow + 16.67; // 60fps
          } else {
            lastNow = realNow;
          }
          
          return lastNow;
        }
      );
      debug('Performance API 已覆盖');
    } catch (e) {
      debug('Performance API 覆盖失败:', e.message);
    }
  }

  // P1: Web Worker 时钟（绕过主线程节流）
  function startWebWorkerClock() {
    const workerCode = `
      let timerId = null;
      let interval = 100;
      
      self.onmessage = function(e) {
        if (e.data.type === 'start') {
          interval = e.data.interval || 100;
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

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const tickWorker = new Worker(workerUrl);
      
      tickWorker.onmessage = (e) => {
        if (e.data.type === 'tick') {
          // Worker 时钟不受主线程节流影响
        }
      };
      
      tickWorker.postMessage({ type: 'start', interval: 2000 });
      activityIntervals.push(() => tickWorker.terminate());
      debug('Web Worker 时钟已启动');
    } catch (e) {
      debug('Web Worker 创建失败:', e.message);
    }
  }

  // P1: MessageChannel 心跳（保持主线程活跃）
  function startMessageChannelHeartbeat() {
    try {
      const channel = new MessageChannel();
      
      channel.port1.onmessage = (e) => {
        if (e.data.type === 'heartbeat') {
          // 最小化活动，防止页面被冻结
          window.dispatchEvent(new MouseEvent('mousemove', {
            clientX: Math.random() * 100,
            clientY: Math.random() * 100,
            bubbles: false
          }));
          
          // 继续心跳
          setTimeout(() => {
            channel.port1.postMessage({ type: 'heartbeat' });
          }, 500);
        }
      };
      
      channel.port1.postMessage({ type: 'heartbeat' });
      debug('MessageChannel 心跳已启动');
    } catch (e) {
      debug('MessageChannel 创建失败:', e.message);
    }
  }

  // P1: 覆盖 setTimeout/setInterval（防止后台节流）
  function overrideTimers() {
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;

    const stealthSetTimeout = function(callback, delay, ...args) {
      // 如果延迟小于1秒且被后台节流，使用 MessageChannel 保持执行
      if (delay < 1000 && document.hidden) {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => callback(...args);
        channel.port2.postMessage(null);
        return;
      }
      return originalSetTimeout.call(window, callback, delay, ...args);
    };

    window.setTimeout = createStealthOverride(originalSetTimeout, stealthSetTimeout);
    window.setInterval = createStealthOverride(originalSetInterval, originalSetInterval);
    debug('定时器 API 已覆盖');
  }

  // P1: React 懒加载对抗 - 预加载 chunk
  function preloadReactChunks() {
    try {
      // 预加载页面中已知的 chunk
      const scripts = document.querySelectorAll('script[src*="chunk"], script[src*="bundle"]');
      scripts.forEach(script => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = script.src;
        document.head.appendChild(link);
      });
      
      debug('React chunk 预加载已执行');
    } catch (e) {
      debug('chunk 预加载失败:', e.message);
    }
  }

  // P1: React 懒加载对抗 - 覆盖 webpack dynamic import
  function overrideWebpackDynamicImport() {
    try {
      // 覆盖 webpack 的 __webpack_require__.e（chunk 加载）
      if (window.__webpack_require__?.e) {
        const originalEnsure = window.__webpack_require__.e;
        window.__webpack_require__.e = function(chunkId) {
          return originalEnsure.call(this, chunkId).catch(err => {
            debug('Chunk load failed, retrying...', chunkId);
            return new Promise((resolve, reject) => {
              setTimeout(() => {
                originalEnsure.call(this, chunkId).then(resolve).catch(reject);
              }, 1000);
            });
          });
        };
        debug('webpack dynamic import 已覆盖');
      }
    } catch (e) {
      debug('webpack 覆盖失败:', e.message);
    }
  }

  // 强制触发 focus 事件
  function triggerFocusEvent() {
    setTimeout(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('focus'));
      debug('focus 事件已触发');
    }, 100);
  }

  // 鼠标移动模拟
  function startMouseMovement() {
    const moveMouse = () => {
      const x = Math.random() * (window.innerWidth - 200) + 100;
      const y = Math.random() * (window.innerHeight - 200) + 100;

      if (CONFIG.mouseMovement.smoothMovement) {
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
          setTimeout(() => {
            const event = new MouseEvent('mousemove', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: x * (i / steps),
              clientY: y * (i / steps)
            });
            document.dispatchEvent(event);
          }, (i * 40));
        }
      } else {
        const event = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        });
        document.dispatchEvent(event);
      }

      const interval = mouseMoveInterval();
      const intervalId = setTimeout(moveMouse, interval);
      activityIntervals.push(intervalId);
    };
    const intervalId = setTimeout(moveMouse, 1000);
    activityIntervals.push(intervalId);
    debug('鼠标移动模拟已启动');
  }

  // 用户活动模拟
  function startUserActivity() {
    let activityCount = 0;
    const simulateActivity = () => {
      activityCount++;
      const eventType = CONFIG.userActivity.eventTypes[Math.floor(Math.random() * CONFIG.userActivity.eventTypes.length)];
      const x = Math.random() * (window.innerWidth - 200) + 100;
      const y = Math.random() * (window.innerHeight - 200) + 100;

      let event;
      if (eventType === 'mousemove') {
        event = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        });
      } else if (eventType === 'keydown') {
        event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          view: window,
          keyCode: Math.floor(Math.random() * 255)
        });
      } else if (eventType === 'scroll') {
        event = new Event('scroll', { bubbles: true });
      }

      if (event) {
        document.dispatchEvent(event);
      }

      // 触摸事件（移动端）
      if (CONFIG.userActivity.enableTouch && activityCount % 10 === 0) {
        try {
          const touch = new Touch({
            identifier: Date.now(),
            target: document.body,
            clientX: x,
            clientY: y,
            pageX: x,
            pageY: y,
            screenX: x,
            screenY: y,
            radiusX: 2.5,
            radiusY: 2.5,
            rotationAngle: 0,
            force: 1
          });
          const touchEvent = new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [touch],
            targetTouches: [touch],
            changedTouches: [touch]
          });
          document.dispatchEvent(touchEvent);
        } catch (e) {
          // 触摸事件构造失败，忽略
        }
      }

      // 定期触发 scroll 事件
      if (activityCount % 3 === 0) {
        window.dispatchEvent(new Event('scroll'));
      }

      const interval = mouseMoveInterval();
      const intervalId = setTimeout(simulateActivity, interval);
      activityIntervals.push(intervalId);
    };
    const intervalId = setTimeout(simulateActivity, 1500);
    activityIntervals.push(intervalId);
    debug('用户活动模拟已启动');
  }

  // 覆盖 WebSocket
  function overrideWebSocket() {
    if (!CONFIG.websocket.enabled) return;
    const originalWebSocket = window.WebSocket;
    if (!originalWebSocket) return;

    const StealthWebSocket = function(...args) {
      const ws = new originalWebSocket(...args);
      const originalSend = ws.send.bind(ws);
      ws.send = function(...sendArgs) {
        return originalSend(...sendArgs);
      };

      // 定期发送 ping
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(CONFIG.websocket.pingMessage));
          } catch (e) {
            clearInterval(pingInterval);
          }
        }
      }, CONFIG.websocket.pingInterval);

      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });

      return ws;
    };
    StealthWebSocket.prototype = originalWebSocket.prototype;

    window.WebSocket = createStealthOverride(originalWebSocket, StealthWebSocket);
    debug('WebSocket 保活已启用');
  }

  // 核心：简单的 DOM 查询 + window 写入，防止页面冻结
  function startSimpleKeepAlive() {
    let count = 0;

    // 初始化 monitoring 对象（关键！往 window 写入数据）
    if (!window.monitoring) {
      window.monitoring = {
        domSnapshots: [],
        keepAliveCount: 0
      };
    }

    const intervalId = setInterval(() => {
      count++;

      // 强制 DOM 查询
      const messages = document.querySelectorAll('[class*="message"], [class*="chat"], [class*="msg"]');
      const messageCount = messages.length;

      // 关键：往 window.monitoring.domSnapshots 写入数据！
      window.monitoring.domSnapshots.push({
        timestamp: Date.now(),
        messageCount: messageCount,
        source: 'setInterval'
      });

      window.monitoring.keepAliveCount++;

      if (count % 6 === 0) {
        debug('Keep-alive 第', count, '次, 消息数:', messageCount);
      }
    }, 5000);

    activityIntervals.push(intervalId);
    debug('简单 Keep-alive 已启动（5秒）');
  }

  // ========== Fetch 拦截器（过滤思考内容）==========
  function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isWaiting = document.body.getAttribute('data-anti-lazy-waiting') === 'true';
      
      const response = await originalFetch.apply(this, args);
      
      try {
        if (url && isWaiting && url.includes('/api/v2/chat')) {
          debug('✓ 匹配到千问 AI API');
          document.body.setAttribute('data-anti-lazy-waiting', 'false');
          
          const clonedResponse = response.clone();
          const reader = clonedResponse.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let buffer = '';
          let isThinking = false;
          
          function readStream() {
            reader.read().then(({ done, value }) => {
              if (done) {
                // 使用完整回复（已过滤思考内容）
                let finalText = fullText;
                if (finalText.length > 0) {
                  document.body.setAttribute('data-anti-lazy-message', finalText);
                  document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
                  debug(`✓ 获取完整回复，长度: ${finalText.length}`);
                }
                return;
              }
              
              // 解码数据
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              
              // 处理所有完整的行
              let lineEnd;
              while ((lineEnd = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, lineEnd).trim();
                buffer = buffer.substring(lineEnd + 1);
                
                if (!line) continue;
                
                if (line.startsWith('data:')) {
                  const data = line.slice(5).trim();
                  
                  console.log(data);
                  
                  try {
                    const json = JSON.parse(data);
                    
                    // 检查是否是思考内容
                    const messages = json?.data?.messages || [];
                    for (const msg of messages) {
                      // 思考内容: mime_type: "multi_load/iframe", type: "deep_think"
                      if (msg.mime_type === 'multi_load/iframe' && msg.meta_data?.multi_load) {
                        let hasDeepThink = false;
                        for (const load of msg.meta_data.multi_load) {
                          if (load.type === 'deep_think') {
                            isThinking = load.content?.status === 'processing';
                            hasDeepThink = true;
                            continue;
                          }
                        }
                        // 跳过包含视频卡片的消息
                        if (msg.meta_data.multi_load.some(load => load.html)) {
                          continue;
                        }
                      }
                      
                      // 正式回复: content 字段
                      if (msg.content && typeof msg.content === 'string' && !isThinking) {
                        // 过滤掉 [(deep_think)] 标记
                        const cleanContent = msg.content.replace(/\[\(deep_think\)\]/g, '').trim();
                        if (cleanContent) {
                          // 直接替换，因为 content 是完整内容
                          fullText = cleanContent;
                        }
                      }
                    }
                  } catch (e) {
                    // JSON 解析错误，忽略
                  }
                }
              }
              
              readStream();
            }).catch(e => debug('流读取错误:', e.message));
          }
          
          readStream();
        }
      } catch (e) {
        debug('错误:', e.message);
      }
      
      return response;
    };
    
    window.fetch = new Proxy(window.fetch, {
      apply: (target, thisArg, args) => target.apply(thisArg, args),
      get: (target, prop) => prop === 'toString' ? Function.prototype.toString.bind(originalFetch) : Reflect.get(target, prop)
    });
    
    debug('✓ Fetch 拦截器已安装');
  }

  // 初始化
  function init() {
    // Fetch 拦截器（过滤思考内容）
    setupFetchInterceptor();
    
    // 基础对抗
    overrideVisibilityAPI();
    blockVisibilityEvents();
    overridePageLifecycleAPI();
    overrideNetworkInfoAPI();
    overrideRequestIdleCallback();
    overrideIntersectionObserver();
    overrideFocusAPI();
    overrideRequestAnimationFrame();

    // P2: Performance API 覆盖
    overridePerformanceAPI();

    // P1: 浏览器节流对抗
    startWebWorkerClock();
    startMessageChannelHeartbeat();
    overrideTimers();

    // P1: React 懒加载对抗
    preloadReactChunks();
    overrideWebpackDynamicImport();

    // 行为模拟
    triggerFocusEvent();
    startMouseMovement();
    startUserActivity();
    overrideWebSocket();

    // 核心：简单的 Keep-alive
    startSimpleKeepAlive();

    debug('防懒加载脚本初始化完成（增强版 v2.1.0 + 浏览器节流对抗 + React懒加载对抗）');
  }

  init();

})();
