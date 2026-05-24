// 千问专用防懒加载脚本
// 千问可能使用 Page Lifecycle API + 网络状态检测
(function() {
  'use strict';

  console.log('[Anti-Lazy-Load-Qianwen] ========== 开始注入千问专用脚本 ==========');

  // 1. 基础Visibility API覆盖
  try {
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });
    Object.defineProperty(document, 'visibilityState', {
      get: () => "visible",
      configurable: true
    });
    Object.defineProperty(document, 'webkitVisibilityState', {
      get: () => "visible",
      configurable: true
    });
    Object.defineProperty(document, 'webkitHidden', {
      get: () => false,
      configurable: true
    });
    console.log('[Anti-Lazy-Load-Qianwen] ✓ Visibility API 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load-Qianwen] 覆盖 Visibility API 失败:', e);
  }

  // 2. 拦截所有可见性相关事件
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const blockedEvents = [
      'visibilitychange',
      'webkitvisibilitychange',
      'freeze',
      'resume',
      'pagehide',
      'pageshow'
    ];

    if (blockedEvents.includes(type)) {
      console.log(`[Anti-Lazy-Load-Qianwen] 拦截 ${type} listener`);
      return;
    }
    return origAddEventListener.call(this, type, listener, options);
  };

  console.log('[Anti-Lazy-Load-Qianwen] ✓ 事件拦截已启用');

  // 3. 覆盖 Page Lifecycle API
  const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function(event) {
    if (event.type === 'freeze' || event.type === 'pagehide') {
      console.log(`[Anti-Lazy-Load-Qianwen] 拦截 ${event.type} 事件`);
      return false;
    }
    return originalDispatchEvent.call(this, event);
  };

  // 4. 覆盖 document.wasDiscarded（页面卸载检测）
  try {
    Object.defineProperty(document, 'wasDiscarded', {
      get: () => false,
      configurable: true
    });
    console.log('[Anti-Lazy-Load-Qianwen] ✓ wasDiscarded 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load-Qianwen] 覆盖 wasDiscarded 失败:', e);
  }

  // 5. 覆盖网络状态API（千问可能使用）
  if (navigator.connection) {
    try {
      const originalConnection = navigator.connection;

      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          ...originalConnection,
          saveData: false,
          effectiveType: '4g',
          rtt: 0,
          downlink: 100,
          addEventListener: () => {},
          removeEventListener: () => {}
        }),
        configurable: true
      });

      Object.defineProperty(navigator.connection, 'saveData', {
        get: () => false,
        configurable: true
      });

      Object.defineProperty(navigator.connection, 'effectiveType', {
        get: () => '4g',
        configurable: true
      });

      Object.defineProperty(navigator.connection, 'rtt', {
        get: () => 0,
        configurable: true
      });

      Object.defineProperty(navigator.connection, 'downlink', {
        get: () => 100,
        configurable: true
      });

      console.log('[Anti-Lazy-Load-Qianwen] ✓ Network Information API 已覆盖');
    } catch (e) {
      console.warn('[Anti-Lazy-Load-Qianwen] 覆盖 Network Information API 失败:', e);
    }
  }

  // 6. 覆盖 requestIdleCallback
  if (window.requestIdleCallback) {
    const originalRequestIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = function(callback, options) {
      console.log('[Anti-Lazy-Load-Qianwen] 拦截 requestIdleCallback');
      const deadline = {
        didTimeout: false,
        timeRemaining: () => 100,
      };
      return setTimeout(() => callback(deadline), 0);
    };
    console.log('[Anti-Lazy-Load-Qianwen] ✓ requestIdleCallback 已覆盖');
  }

  // 7. 覆盖 IntersectionObserver
  if (window.IntersectionObserver) {
    const OriginalIntersectionObserver = window.IntersectionObserver;

    window.IntersectionObserver = function(callback, options) {
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
        console.log('[Anti-Lazy-Load-Qianwen] 拦截 IntersectionObserver.observe');
        const mockEntry = {
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: element.getBoundingClientRect(),
          intersectionRect: element.getBoundingClientRect(),
          rootBounds: null,
          time: performance.now()
        };
        setTimeout(() => wrappedCallback([mockEntry], observer), 0);
        return originalObserve(element);
      };

      return observer;
    };

    window.IntersectionObserver.prototype = OriginalIntersectionObserver.prototype;

    console.log('[Anti-Lazy-Load-Qianwen] ✓ IntersectionObserver 已覆盖');
  }

  // 8. 强制触发 focus 事件
  setTimeout(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('focus'));
    console.log('[Anti-Lazy-Load-Qianwen] ✓ 强制触发 focus 事件');
  }, 100);

  // 10. 模拟用户活动
  let activityCount = 0;
  const activityInterval = setInterval(() => {
    activityCount++;

    const events = [
      new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: 100 + Math.random() * 100,
        clientY: 100 + Math.random() * 100
      }),
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        view: window,
        keyCode: 0
      })
    ];

    events.forEach(event => {
      document.dispatchEvent(event);
    });

    // 每隔一段时间触发一次scroll事件
    if (activityCount % 3 === 0) {
      window.dispatchEvent(new Event('scroll'));
    }

    // 每隔一段时间触发一次touch事件（移动端模拟）
    if (activityCount % 5 === 0) {
      const touch = new Touch({
        identifier: Date.now(),
        target: document.body,
        clientX: 100 + Math.random() * 100,
        clientY: 100 + Math.random() * 100,
        pageX: 100 + Math.random() * 100,
        pageY: 100 + Math.random() * 100,
        screenX: 100 + Math.random() * 100,
        screenY: 100 + Math.random() * 100,
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
    }
  }, 2000);

  console.log('[Anti-Lazy-Load-Qianwen] ✓ 用户活动模拟已启用');

  // 11. 确保WebSocket连接保持活跃
  const originalWebSocket = window.WebSocket;
  if (originalWebSocket) {
    window.WebSocket = function(...args) {
      const ws = new originalWebSocket(...args);

      const originalSend = ws.send.bind(ws);
      ws.send = function(...sendArgs) {
        console.log('[Anti-Lazy-Load-Qianwen] WebSocket 发送数据');
        return originalSend(...sendArgs);
      };

      // 定期发送ping
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {
            clearInterval(pingInterval);
          }
        }
      }, 10000);

      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });

      return ws;
    };

    window.WebSocket.prototype = originalWebSocket.prototype;

    console.log('[Anti-Lazy-Load-Qianwen] ✓ WebSocket 保活已启用');
  }

  // 12. 覆盖 performance.now() 防止时间检测
  const originalPerformanceNow = performance.now;
  let lastTime = originalPerformanceNow.call(performance);
  performance.now = function() {
    const currentTime = originalPerformanceNow.call(performance);
    // 确保时间递增
    if (currentTime <= lastTime) {
      return lastTime + 16.67; // ~60fps
    }
    lastTime = currentTime;
    return currentTime;
  };

  console.log('[Anti-Lazy-Load-Qianwen] ========== 注入完成 ==========');

})();
