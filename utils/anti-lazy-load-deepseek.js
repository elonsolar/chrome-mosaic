// DeepSeek 专用防懒加载脚本
(function() {
  'use strict';

  // 配置
  const CONFIG = {
    debug: false,
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
      return new OriginalIntersectionObserver(wrappedCallback, options);
    };
    window.IntersectionObserver.prototype = OriginalIntersectionObserver.prototype;
    debug('IntersectionObserver 已覆盖');
  }

  // 覆盖 requestIdleCallback
  function overrideRequestIdleCallback() {
    if (!window.requestIdleCallback) return;
    const originalRequestIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = function(callback, options) {
      const deadline = { didTimeout: true, timeRemaining: () => 0 };
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
      debug('Focus API 已覆盖');
    } catch (e) {}
  }

  // 拦截 visibilitychange 事件
  function blockVisibilityChange() {
    const origAddEventListener = document.addEventListener;
    document.addEventListener = function(type, listener, options) {
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

  // 覆盖 Network Information API
  function overrideNetworkInfoAPI() {
    if (!navigator.connection) return;
    try {
      Object.defineProperty(navigator.connection, 'saveData', {
        get: () => false,
        configurable: true
      });
      Object.defineProperty(navigator.connection, 'effectiveType', {
        get: () => '4g',
        configurable: true
      });
      debug('Network Information API 已覆盖');
    } catch (e) {}
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

      const interval = Math.random() * (CONFIG.mouseMovement.maxInterval - CONFIG.mouseMovement.minInterval) + CONFIG.mouseMovement.minInterval;
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

  // 初始化
  function init() {
    overrideVisibilityAPI();
    blockVisibilityChange();
    overrideIntersectionObserver();
    overrideRequestIdleCallback();
    overrideFocusAPI();
    blockFreezeEvent();
    overrideNetworkInfoAPI();
    startMouseMovement();
    startKeepAlive();
    debug('防懒加载脚本初始化完成');
  }

  init();

})();
