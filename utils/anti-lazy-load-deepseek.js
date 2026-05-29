// DeepSeek 专用防懒加载脚本 - 增强版
// 版本: 3.0.0
// 更新日期: 2026-05-29
// 主要更新: Fetch拦截器、过滤思考内容
(function() {
  'use strict';

  // 配置
  const CONFIG = {
    debug: true,
    mouseMovement: {
      minInterval: 3000,
      maxInterval: 7000,
      smoothMovement: false
    },
    userActivity: {
      eventTypes: ['mousemove']
    }
  };

  const activityIntervals = [];

  function debug(...args) {
    if (CONFIG.debug) {
      console.log('[Anti-Lazy-Load-DeepSeek]', ...args);
    }
  }

  // ========== Fetch 拦截器（过滤思考内容）==========
  function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isWaiting = document.body.getAttribute('data-anti-lazy-waiting') === 'true';
      
      const response = await originalFetch.apply(this, args);
      
      try {
        // DeepSeek API 端点: /api/v0/chat/completion
        if (url && url.includes('/api/v0/chat/completion')) {
          debug('✓ 匹配到 DeepSeek AI API (fetch)');
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
                    
                    // DeepSeek 格式: choices[0].delta.content
                    if (json.choices && json.choices[0] && json.choices[0].delta) {
                      const delta = json.choices[0].delta;
                      
                      // 检查是否有思考内容
                      if (delta.reasoning_content || delta.reasoning) {
                        isThinking = true;
                        continue;
                      }
                      
                      // 正式回复内容
                      if (delta.content && !isThinking) {
                        fullText += delta.content;
                      }
                    }
                    
                    // 检查是否结束
                    if (json.choices && json.choices[0] && json.choices[0].finish_reason) {
                      isThinking = false;
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

  // ========== XMLHttpRequest 拦截器 ==========
  function setupXHRInterceptor() {
    try {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url) {
        this._interceptedUrl = url;
        return originalOpen.apply(this, arguments);
      };
      
      XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        const url = xhr._interceptedUrl;
        
        if (url && url.includes('/api/v0/chat/completion')) {
          debug('✓ 匹配到 DeepSeek AI API (XHR)');
          
          let lastProcessedLength = 0;
          let currentFragmentType = null; // 'THINK' 或 'RESPONSE'
          let responseContent = '';
          
          xhr.addEventListener('progress', function() {
            try {
              const newText = xhr.responseText.substring(lastProcessedLength);
              lastProcessedLength = xhr.responseText.length;
              
              const lines = newText.split('\n');
              
              for (const line of lines) {
                if (!line.trim()) continue;
                
                // SSE 格式: data: {...}
                let dataLine = line.trim();
                if (dataLine.startsWith('data:')) {
                  dataLine = dataLine.slice(5).trim();
                }
                
                try {
                  const json = JSON.parse(dataLine);
                  
                  // 检查是否是新片段开始
                  if (json.p === 'response/fragments' && json.o === 'APPEND' && json.v) {
                    for (const fragment of json.v) {
                      currentFragmentType = fragment.type;
                      if (fragment.type === 'THINK') {
                        debug('检测到思考内容');
                      } else if (fragment.type === 'RESPONSE') {
                        responseContent += fragment.content || '';
                        debug('✓ 正式回复开始:', fragment.content);
                      }
                    }
                  }
                  
                  // JSON Patch: 追加内容到当前片段（完整格式）
                  if (json.p === 'response/fragments/-1/content' && json.v) {
                    if (currentFragmentType === 'RESPONSE') {
                      responseContent += json.v;
                    }
                  }
                  
                  // 简写格式: {"v":"..."} - 追加到当前片段
                  if (!json.p && json.v && typeof json.v === 'string' && currentFragmentType === 'RESPONSE') {
                    responseContent += json.v;
                  }
                  
                  // 检查是否结束
                  if (json.p === 'response/status' && json.v === 'FINISHED') {
                    debug('✓ 回复完成');
                    
                    // 设置结果
                    if (responseContent.length > 0) {
                      document.body.setAttribute('data-anti-lazy-message', responseContent);
                      document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
                      debug(`✓ 获取完整回复 (XHR)，长度: ${responseContent.length}`);
                    }
                  }
                } catch (e) {
                  // JSON 解析错误，忽略
                }
              }
            } catch (e) {
              debug('XHR progress 解析错误:', e.message);
            }
          });
        }
        
        return originalSend.apply(this, arguments);
      };
      
      debug('✓ XHR 拦截器已安装');
    } catch (e) {
      debug('XHR 拦截器安装失败:', e.message);
      console.error('[Anti-Lazy-Load-DeepSeek] XHR 拦截器安装失败:', e);
    }
  }

  // ========== 监听 Enter 键发送消息 ==========
  function setupEnterKeyListener() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        const textarea = document.querySelector('textarea');
        if (textarea) {
          // 设置 fetch 拦截器等待标志
          document.body.setAttribute('data-anti-lazy-waiting', 'true');
          debug('✓ 检测到 Enter 键发送消息，已设置 data-anti-lazy-waiting = true');
        }
      }
    }, true);
    debug('✓ Enter 键监听已安装');
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

  // 覆盖 requestIdleCallback
  function overrideRequestIdleCallback() {
    if (!window.requestIdleCallback) return;
    const originalRequestIdleCallback = window.requestIdleCallback;
    const stealthRequestIdleCallback = function(callback, options) {
      const deadline = { didTimeout: true, timeRemaining: () => 50 };
      return setTimeout(() => callback(deadline), 0);
    };
    window.requestIdleCallback = createStealthOverride(
      originalRequestIdleCallback,
      stealthRequestIdleCallback
    );
    debug('requestIdleCallback 已覆盖');
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

  // 拦截 visibilitychange 事件
  function blockVisibilityChange() {
    const blockedEvents = [
      'visibilitychange', 'webkitvisibilitychange',
      'freeze', 'resume', 'pagehide', 'pageshow'
    ];
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

  // 拦截 freeze 事件
  function blockFreezeEvent() {
    window.addEventListener('freeze', (e) => {
      e.stopImmediatePropagation();
    }, true);
    debug('freeze 事件拦截已启用');
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
      debug('Network Information API 已覆盖');
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

  // 鼠标移动模拟
  function startMouseMovement() {
    const moveMouse = () => {
      const x = Math.random() * (window.innerWidth - 100) + 50;
      const y = Math.random() * (window.innerHeight - 100) + 50;
      const event = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      });
      document.dispatchEvent(event);

      const interval = mouseMoveInterval();
      const intervalId = setTimeout(moveMouse, interval);
      activityIntervals.push(intervalId);
    };
    const intervalId = setTimeout(moveMouse, 1000);
    activityIntervals.push(intervalId);
    debug('鼠标移动模拟已启动');
  }

  // keepAlive 动画
  function startKeepAlive() {
    let animationFrameId;
    function keepAlive() {
      performance.now();
      animationFrameId = requestAnimationFrame(keepAlive);
    }
    keepAlive();
    debug('keepAlive 动画已启动');
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

  // 初始化
  function init() {
    // Fetch 拦截器
    setupFetchInterceptor();
    setupXHRInterceptor();
    setupEnterKeyListener();

    // 基础对抗
    overrideVisibilityAPI();
    blockVisibilityChange();
    overrideIntersectionObserver();
    overrideRequestIdleCallback();
    overrideFocusAPI();
    blockFreezeEvent();
    overrideNetworkInfoAPI();
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
    startMouseMovement();
    startKeepAlive();

    // 核心：简单的 Keep-alive
    startSimpleKeepAlive();

    debug('防懒加载脚本初始化完成（增强版 v3.0.0 + Fetch拦截器 + 浏览器节流对抗 + React懒加载对抗）');
  }

  init();

})();
