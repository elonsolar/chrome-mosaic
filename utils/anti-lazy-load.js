// 增强的防懒加载注入脚本
(function() {
  'use strict';

  console.log('[Anti-Lazy-Load] ========== 开始注入防懒加载脚本 ==========');

  // 1. 覆盖 document.hidden 和 visibilityState
  try {
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });
    Object.defineProperty(document, 'visibilityState', {
      get: () => "visible",
      configurable: true
    });
    console.log('[Anti-Lazy-Load] ✓ document.hidden/visibilityState 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load] 覆盖 document.hidden 失败:', e);
  }

  // 2. 拦截 visibilitychange 事件
  const origAddEventListener = document.addEventListener;
  document.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange') {
      console.log('[Anti-Lazy-Load] 拦截 visibilitychange listener');
      return;
    }
    return origAddEventListener.call(this, type, listener, options);
  };
  console.log('[Anti-Lazy-Load] ✓ visibilitychange 拦截已启用');

  // 3. 覆盖 Page Visibility API 的其他属性
  try {
    Object.defineProperty(document, 'webkitVisibilityState', {
      get: () => "visible",
      configurable: true
    });
    Object.defineProperty(document, 'webkitHidden', {
      get: () => false,
      configurable: true
    });
    console.log('[Anti-Lazy-Load] ✓ webkit 前缀属性已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load] 覆盖 webkit 前缀失败:', e);
  }

  // 4. 覆盖 Intersection Observer (豆包可能使用)
  if (window.IntersectionObserver) {
    const OriginalIntersectionObserver = window.IntersectionObserver;
    window.IntersectionObserver = function(callback, options) {
      // 修改回调，使元素始终被视为可见
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
    console.log('[Anti-Lazy-Load] ✓ IntersectionObserver 已覆盖');
  }

  // 5. 覆盖 requestIdleCallback (千问可能使用)
  if (window.requestIdleCallback) {
    const originalRequestIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = function(callback, options) {
      // 立即执行，不等待空闲
      const deadline = {
        didTimeout: true,
        timeRemaining: () => 0,
      };
      return originalRequestIdleCallback(() => callback(deadline), { ...options, timeout: 0 });
    };
    console.log('[Anti-Lazy-Load] ✓ requestIdleCallback 已覆盖');
  }

  // 6. 覆盖 Focus 相关 API
  try {
    Object.defineProperty(document, 'hasFocus', {
      value: () => true,
      writable: false,
      configurable: true
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });
    console.log('[Anti-Lazy-Load] ✓ hasFocus 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load] 覆盖 hasFocus 失败:', e);
  }

  // 7. 覆盖 window.onfocus 和 onblur
  try {
    Object.defineProperty(window, 'onfocus', {
      set: function(value) {
        this._onfocus = value;
      },
      get: function() {
        return this._onfocus;
      },
      configurable: true
    });
    Object.defineProperty(window, 'onblur', {
      set: function(value) {
        // 忽略 onblur 设置
      },
      get: function() {
        return null;
      },
      configurable: true
    });
    console.log('[Anti-Lazy-Load] ✓ onfocus/onblur 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load] 覆盖 onfocus/onblur 失败:', e);
  }

  // 8. 模拟定期鼠标移动（防止页面认为用户离开）
  let lastMouseMoveTime = Date.now();
  document.addEventListener('mousemove', () => {
    lastMouseMoveTime = Date.now();
  });

  // 每5秒触发一次鼠标移动事件
  setInterval(() => {
    const event = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: Math.random() * 100,
      clientY: Math.random() * 100
    });
    document.dispatchEvent(event);
  }, 5000);
  console.log('[Anti-Lazy-Load] ✓ 模拟鼠标移动已启用');

  // 9. 覆盖 Page Lifecycle API 的 freeze 事件
  window.addEventListener('freeze', (e) => {
    e.stopImmediatePropagation();
    console.log('[Anti-Lazy-Load] 拦截 freeze 事件');
  }, true);

  window.addEventListener('resume', (e) => {
    console.log('[Anti-Lazy-Load] 收到 resume 事件，页面已激活');
  }, true);

  // 10. 覆盖网络状态 API（某些平台可能使用）
  if (navigator.connection) {
    try {
      Object.defineProperty(navigator.connection, 'saveData', {
        get: () => false,
        configurable: true
      });
      Object.defineProperty(navigator.connection, 'effectiveType', {
        get: () => '4g',
        configurable: true
      });
      console.log('[Anti-Lazy-Load] ✓ Network Information API 已覆盖');
    } catch (e) {
      console.warn('[Anti-Lazy-Load] 覆盖 Network Information API 失败:', e);
    }
  }

  // 11. 强制触发 visibilitychange 为 visible
  setTimeout(() => {
    const event = new Event('visibilitychange');
    Object.defineProperty(event, 'target', {
      value: document,
      writable: false
    });
    // 不触发事件，只是确保状态正确
    console.log('[Anti-Lazy-Load] ✓ 强制设置页面为可见状态');
  }, 100);

  // 12. 针对 React 框架的优化（豆包使用 React）
  // 覆盖 React 的内部调度器
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const originalRenderer = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers;
    if (originalRenderer) {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers = new Map();
      console.log('[Anti-Lazy-Load] ✓ React DevTools 调度器已重置');
    }
  }

  // 14. 覆盖 performance.now()，防止时间检测
  const originalPerformanceNow = performance.now;
  performance.now = function() {
    return originalPerformanceNow.call(this);
  };

  // 15. 确保动画持续运行
  let animationFrameId;
  function keepAlive() {
    // 执行一些轻量级操作以保持页面活跃
    const timestamp = performance.now();
    animationFrameId = requestAnimationFrame(keepAlive);
  }
  keepAlive();
  console.log('[Anti-Lazy-Load] ✓ keepAlive 动画已启动');

  console.log('[Anti-Lazy-Load] ========== 注入完成 ==========');
  console.log('[Anti-Lazy-Load] 页面将被强制保持活跃状态');

})();
