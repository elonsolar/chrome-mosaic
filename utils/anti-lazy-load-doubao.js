// 豆包专用防懒加载脚本
// 豆包使用 React + IntersectionObserver
(function() {
  'use strict';

  console.log('[Anti-Lazy-Load-Doubao] ========== 开始注入豆包专用脚本 ==========');

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
    console.log('[Anti-Lazy-Load-Doubao] ✓ Visibility API 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load-Doubao] 覆盖 Visibility API 失败:', e);
  }

  // 2. 拦截 visibilitychange 事件
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'visibilitychange') {
      console.log('[Anti-Lazy-Load-Doubao] 拦截 visibilitychange listener');
      return;
    }
    return origAddEventListener.call(this, type, listener, options);
  };

  // 3. 覆盖 IntersectionObserver（豆包重点）
  if (window.IntersectionObserver) {
    const OriginalIntersectionObserver = window.IntersectionObserver;

    window.IntersectionObserver = function(callback, options) {
      const wrappedCallback = (entries, observer) => {
        const modifiedEntries = entries.map(entry => {
          // 强制设置为完全可见
          entry.isIntersecting = true;
          entry.intersectionRatio = 1;
          entry.intersectionRect = entry.boundingClientRect;
          return entry;
        });
        return callback(modifiedEntries, observer);
      };

      const observer = new OriginalIntersectionObserver(wrappedCallback, options);

      // 保存原始observe方法
      const originalObserve = observer.observe.bind(observer);

      // 重写observe方法
      observer.observe = function(element) {
        console.log('[Anti-Lazy-Load-Doubao] 拦截 IntersectionObserver.observe');
        // 立即触发一次回调，告知元素可见
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

    // 保留原型方法
    window.IntersectionObserver.prototype = OriginalIntersectionObserver.prototype;

    console.log('[Anti-Lazy-Load-Doubao] ✓ IntersectionObserver 已覆盖');
  }

  // 4. 覆盖 requestIdleCallback（React可能使用）
  if (window.requestIdleCallback) {
    const originalRequestIdleCallback = window.requestIdleCallback;
    window.requestIdleCallback = function(callback, options) {
      console.log('[Anti-Lazy-Load-Doubao] 拦截 requestIdleCallback');
      // 立即执行，不等待空闲
      const deadline = {
        didTimeout: true,
        timeRemaining: () => 50, // 返回较大的剩余时间
      };
      return setTimeout(() => callback(deadline), 0);
    };
    console.log('[Anti-Lazy-Load-Doubao] ✓ requestIdleCallback 已覆盖');
  }

  // 5. 覆盖 Focus 相关API
  try {
    Object.defineProperty(document, 'hasFocus', {
      value: () => true,
      writable: false,
      configurable: true
    });
    console.log('[Anti-Lazy-Load-Doubao] ✓ hasFocus 已覆盖');
  } catch (e) {
    console.warn('[Anti-Lazy-Load-Doubao] 覆盖 hasFocus 失败:', e);
  }

  // 7. 模拟定期用户活动
  setInterval(() => {
    const events = [
      new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: 100 + Math.random() * 50,
        clientY: 100 + Math.random() * 50
      }),
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: 100 + Math.random() * 50,
        clientY: 100 + Math.random() * 50
      }),
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: 100 + Math.random() * 50,
        clientY: 100 + Math.random() * 50
      })
    ];

    events.forEach(event => {
      document.dispatchEvent(event);
    });
  }, 3000);

  console.log('[Anti-Lazy-Load-Doubao] ✓ 用户活动模拟已启用');

  // 8. 覆盖 Page Lifecycle API
  window.addEventListener('freeze', (e) => {
    e.stopImmediatePropagation();
    console.log('[Anti-Lazy-Load-Doubao] 拦截 freeze 事件');
  }, true);

  console.log('[Anti-Lazy-Load-Doubao] ========== 注入完成 ==========');

})();
