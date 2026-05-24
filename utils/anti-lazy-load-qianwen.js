// 千问专用防懒加载脚本
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

  // 覆盖 Visibility API
  function overrideVisibilityAPI() {
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
      debug('Visibility API 已覆盖');
    } catch (e) {}
  }

  // 拦截所有可见性相关事件
  function blockVisibilityEvents() {
    const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'freeze', 'resume', 'pagehide', 'pageshow'];
    const origAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (blockedEvents.includes(type)) {
        return;
      }
      return origAddEventListener.call(this, type, listener, options);
    };
    debug('可见性事件拦截已启用');
  }

  // 覆盖 Page Lifecycle API
  function overridePageLifecycleAPI() {
    const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
      if (event.type === 'freeze' || event.type === 'pagehide') {
        return false;
      }
      return originalDispatchEvent.call(this, event);
    };

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
      debug('Network Information API 已覆盖');
    } catch (e) {}
  }

  // 覆盖 requestIdleCallback
  function overrideRequestIdleCallback() {
    if (!window.requestIdleCallback) return;
    const originalRequestIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = function(callback, options) {
      const deadline = { didTimeout: false, timeRemaining: () => 100 };
      return setTimeout(() => callback(deadline), 0);
    };
    debug('requestIdleCallback 已覆盖');
  }

  // 覆盖 IntersectionObserver
  function overrideIntersectionObserver() {
    if (!window.IntersectionObserver) return;
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
    window.IntersectionObserver.prototype = OriginalIntersectionObserver.prototype;
    debug('IntersectionObserver 已覆盖');
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

      const interval = Math.random() * (CONFIG.mouseMovement.maxInterval - CONFIG.mouseMovement.minInterval) + CONFIG.mouseMovement.minInterval;
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
      }

      // 定期触发 scroll 事件
      if (activityCount % 3 === 0) {
        window.dispatchEvent(new Event('scroll'));
      }

      const interval = Math.random() * (CONFIG.userActivity.interval.max - CONFIG.userActivity.interval.min) + CONFIG.userActivity.interval.min;
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

    window.WebSocket = function(...args) {
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
    window.WebSocket.prototype = originalWebSocket.prototype;
    debug('WebSocket 保活已启用');
  }

  // 覆盖 performance.now
  function overridePerformanceNow() {
    const originalPerformanceNow = performance.now;
    let lastTime = originalPerformanceNow.call(performance);
    performance.now = function() {
      const currentTime = originalPerformanceNow.call(performance);
      if (currentTime <= lastTime) {
        return lastTime + 16.67;
      }
      lastTime = currentTime;
      return currentTime;
    };
    debug('performance.now 已覆盖');
  }

  // 初始化
  function init() {
    overrideVisibilityAPI();
    blockVisibilityEvents();
    overridePageLifecycleAPI();
    overrideNetworkInfoAPI();
    overrideRequestIdleCallback();
    overrideIntersectionObserver();
    triggerFocusEvent();
    startMouseMovement();
    startUserActivity();
    overrideWebSocket();
    overridePerformanceNow();
    debug('防懒加载脚本初始化完成');
  }

  init();

})();
