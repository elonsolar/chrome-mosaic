// 豆包专用防懒加载脚本
(function() {
  'use strict';

  // 配置
  const CONFIG = {
    debug: false,
    mouseMovement: {
      minInterval: 2000,
      maxInterval: 5000,
      smoothMovement: true
    },
    userActivity: {
      eventTypes: ['mousemove', 'mousedown', 'mouseup'],
      interval: { min: 2000, max: 4000 }
    }
  };

  const activityIntervals = [];

  function debug(...args) {
    if (CONFIG.debug) {
      console.log('[Anti-Lazy-Load-Doubao]', ...args);
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
      debug('Visibility API 已覆盖');
    } catch (e) {}
  }

  // 覆盖 IntersectionObserver（立即触发回调）
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

  // 覆盖 requestIdleCallback
  function overrideRequestIdleCallback() {
    if (!window.requestIdleCallback) return;
    const originalRequestIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = function(callback, options) {
      const deadline = { didTimeout: true, timeRemaining: () => 50 };
      return setTimeout(() => callback(deadline), 0);
    };
    debug('requestIdleCallback 已覆盖');
  }

  // 覆盖 Focus API
  function overrideFocusAPI() {
    try {
      Object.defineProperty(document, 'hasFocus', {
        value: () => true,
        writable: false,
        configurable: true
      });
      debug('hasFocus 已覆盖');
    } catch (e) {}
  }

  // 拦截 visibilitychange 事件
  function blockVisibilityChange() {
    const origAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'visibilitychange') {
        return;
      }
      return origAddEventListener.call(this, type, listener, options);
    };
    debug('visibilitychange 拦截已启用');
  }

  // 拦截 freeze 事件
  function blockFreezeEvent() {
    window.addEventListener('freeze', (e) => {
      e.stopImmediatePropagation();
    }, true);
    debug('freeze 事件拦截已启用');
  }

  // 鼠标移动模拟
  function startMouseMovement() {
    const moveMouse = () => {
      const x = Math.random() * (window.innerWidth - 200) + 100;
      const y = Math.random() * (window.innerHeight - 200) + 100;

      if (CONFIG.mouseMovement.smoothMovement) {
        // 平滑移动（模拟贝塞尔曲线）
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
          }, (i * 50));
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
    const simulateActivity = () => {
      const eventType = CONFIG.userActivity.eventTypes[Math.floor(Math.random() * CONFIG.userActivity.eventTypes.length)];
      const x = Math.random() * (window.innerWidth - 200) + 100;
      const y = Math.random() * (window.innerHeight - 200) + 100;

      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      });
      document.dispatchEvent(event);

      const interval = Math.random() * (CONFIG.userActivity.interval.max - CONFIG.userActivity.interval.min) + CONFIG.userActivity.interval.min;
      const intervalId = setTimeout(simulateActivity, interval);
      activityIntervals.push(intervalId);
    };
    const intervalId = setTimeout(simulateActivity, 1500);
    activityIntervals.push(intervalId);
    debug('用户活动模拟已启动');
  }

  // 初始化
  function init() {
    overrideVisibilityAPI();
    blockVisibilityChange();
    overrideIntersectionObserver();
    overrideRequestIdleCallback();
    overrideFocusAPI();
    blockFreezeEvent();
    startMouseMovement();
    startUserActivity();
    debug('防懒加载脚本初始化完成');
  }

  init();

})();
