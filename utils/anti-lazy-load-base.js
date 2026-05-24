// 防懒加载基类 - 提供所有平台共用的功能

class AntiLazyLoadBase {
  constructor(platform, config) {
    this.platform = platform;
    this.config = config;
    this.activityIntervals = [];
    this.originalAPIs = {};
  }

  // 初始化
  init() {
    this.debug('开始注入防懒加载脚本');

    if (this.config.apiOverrides.visibility) {
      this.overrideVisibilityAPI();
    }

    if (this.config.apiOverrides.intersectionObserver) {
      this.overrideIntersectionObserver();
    }

    if (this.config.apiOverrides.requestIdleCallback) {
      this.overrideRequestIdleCallback();
    }

    if (this.config.apiOverrides.focus) {
      this.overrideFocusAPI();
    }

    if (this.config.apiOverrides.pageLifecycle) {
      this.overridePageLifecycleAPI();
    }

    if (this.config.apiOverrides.networkInfo) {
      this.overrideNetworkInfoAPI();
    }

    if (this.config.mouseMovement.enabled) {
      this.startMouseMovement();
    }

    if (this.config.userActivity.enabled) {
      this.startUserActivity();
    }

    if (this.config.websocket.enabled) {
      this.overrideWebSocket();
    }

    this.debug('注入完成');
  }

  // 调试日志
  debug(...args) {
    if (this.config.debug) {
      console.log(`[Anti-Lazy-Load-${this.platform}]`, ...args);
    }
  }

  // 保存原始 API
  saveOriginalAPI(name, api) {
    this.originalAPIs[name] = api;
  }

  // 获取原始 API
  getOriginalAPI(name) {
    return this.originalAPIs[name];
  }

  // 覆盖 Visibility API
  overrideVisibilityAPI() {
    try {
      Object.defineProperty(document, 'hidden', {
        get: () => false,
        configurable: true
      });
      Object.defineProperty(document, 'visibilityState', {
        get: () => "visible",
        configurable: true
      });
      this.debug('Visibility API 已覆盖');
    } catch (e) {
      this.debug('覆盖 Visibility API 失败:', e.message);
    }
  }

  // 覆盖 IntersectionObserver
  overrideIntersectionObserver() {
    if (!window.IntersectionObserver) return;

    const OriginalIntersectionObserver = window.IntersectionObserver;
    this.saveOriginalAPI('IntersectionObserver', OriginalIntersectionObserver);

    window.IntersectionObserver = (callback, options) => {
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

      observer.observe = (element) => {
        this.debug('IntersectionObserver.observe 被调用');
        // 立即触发回调
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
    this.debug('IntersectionObserver 已覆盖');
  }

  // 覆盖 requestIdleCallback
  overrideRequestIdleCallback() {
    if (!window.requestIdleCallback) return;

    const originalRequestIdleCallback = window.requestIdleCallback;
    this.saveOriginalAPI('requestIdleCallback', originalRequestIdleCallback);

    window.requestIdleCallback = (callback, options) => {
      const deadline = {
        didTimeout: true,
        timeRemaining: () => 50
      };
      return setTimeout(() => callback(deadline), 0);
    };

    this.debug('requestIdleCallback 已覆盖');
  }

  // 覆盖 Focus API
  overrideFocusAPI() {
    try {
      Object.defineProperty(document, 'hasFocus', {
        value: () => true,
        writable: false,
        configurable: true
      });
      this.debug('hasFocus 已覆盖');
    } catch (e) {
      this.debug('覆盖 hasFocus 失败:', e.message);
    }
  }

  // 覆盖 Page Lifecycle API
  overridePageLifecycleAPI() {
    // 拦截事件监听
    const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'freeze', 'resume', 'pagehide', 'pageshow'];
    const origAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (blockedEvents.includes(type)) {
        return;
      }
      return origAddEventListener.call(this, type, listener, options);
    };

    // 拦截事件派发
    const originalDispatchEvent = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
      if (event.type === 'freeze' || event.type === 'pagehide') {
        return false;
      }
      return originalDispatchEvent.call(this, event);
    };

    // 监听 freeze 事件并阻止
    window.addEventListener('freeze', (e) => {
      e.stopImmediatePropagation();
    }, true);

    this.debug('Page Lifecycle API 已覆盖');
  }

  // 覆盖 Network Information API
  overrideNetworkInfoAPI() {
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
      Object.defineProperty(navigator.connection, 'rtt', {
        get: () => 0,
        configurable: true
      });
      Object.defineProperty(navigator.connection, 'downlink', {
        get: () => 100,
        configurable: true
      });
      this.debug('Network Information API 已覆盖');
    } catch (e) {
      this.debug('覆盖 Network Information API 失败:', e.message);
    }
  }

  // 生成随机坐标
  getRandomCoordinate() {
    const range = this.config.mouseMovement.coordinateRange;
    return {
      x: Math.floor(Math.random() * (range.maxX - range.minX)) + range.minX,
      y: Math.floor(Math.random() * (range.maxY - range.minY)) + range.minY
    };
  }

  // 生成随机间隔
  getRandomInterval() {
    const { minInterval, maxInterval } = this.config.mouseMovement;
    return Math.floor(Math.random() * (maxInterval - minInterval)) + minInterval;
  }

  // 创建鼠标移动事件
  createMouseEvent(x, y, type) {
    return new MouseEvent(type || 'mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    });
  }

  // 平滑鼠标移动（模拟贝塞尔曲线）
  smoothMouseMove(startX, startY, endX, endY, duration) {
    const steps = 10;
    const stepDuration = duration / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      setTimeout(() => {
        document.dispatchEvent(this.createMouseEvent(x, y));
      }, stepDuration * i);
    }
  }

  // 开始鼠标移动模拟
  startMouseMovement() {
    const moveMouse = () => {
      const startPos = this.getRandomCoordinate();
      const endPos = this.getRandomCoordinate();
      const interval = this.getRandomInterval();

      if (this.config.mouseMovement.smoothMovement) {
        const duration = Math.random() * 500 + 200; // 200-700ms
        this.smoothMouseMove(startPos.x, startPos.y, endPos.x, endPos.y, duration);
      } else {
        document.dispatchEvent(this.createMouseEvent(endPos.x, endPos.y));
      }

      // 随机停顿
      if (Math.random() < this.config.mouseMovement.pauseProbability) {
        const pauseDuration = Math.random() *
          (this.config.mouseMovement.pauseDuration.max - this.config.mouseMovement.pauseDuration.min) +
          this.config.mouseMovement.pauseDuration.min;

        setTimeout(() => {
          const intervalId = setTimeout(moveMouse, interval);
          this.activityIntervals.push(intervalId);
        }, pauseDuration);
      } else {
        const intervalId = setTimeout(moveMouse, interval);
        this.activityIntervals.push(intervalId);
      }
    };

    const intervalId = setTimeout(moveMouse, this.getRandomInterval());
    this.activityIntervals.push(intervalId);
    this.debug('鼠标移动模拟已启动');
  }

  // 开始用户活动模拟
  startUserActivity() {
    const simulateActivity = () => {
      const eventTypes = this.config.userActivity.eventTypes;
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const coord = this.getRandomCoordinate();

      let event;
      if (eventType === 'mousemove' || eventType === 'mousedown' || eventType === 'mouseup') {
        event = this.createMouseEvent(coord.x, coord.y, eventType);
      } else if (eventType === 'keydown') {
        event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          keyCode: Math.floor(Math.random() * 255)
        });
      } else if (eventType === 'scroll') {
        event = new Event('scroll', { bubbles: true });
      }

      if (event) {
        document.dispatchEvent(event);
      }

      // 触摸事件（移动端）
      if (this.config.userActivity.enableTouch && Math.random() < 0.1) {
        this.simulateTouchEvent(coord.x, coord.y);
      }

      const interval = Math.random() *
        (this.config.userActivity.interval.max - this.config.userActivity.interval.min) +
        this.config.userActivity.interval.min;

      const intervalId = setTimeout(simulateActivity, interval);
      this.activityIntervals.push(intervalId);
    };

    const intervalId = setTimeout(simulateActivity, 1000);
    this.activityIntervals.push(intervalId);
    this.debug('用户活动模拟已启动');
  }

  // 模拟触摸事件
  simulateTouchEvent(x, y) {
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

  // 覆盖 WebSocket
  overrideWebSocket() {
    const originalWebSocket = window.WebSocket;
    if (!originalWebSocket) return;

    this.saveOriginalAPI('WebSocket', originalWebSocket);

    window.WebSocket = (...args) => {
      const ws = new originalWebSocket(...args);

      const originalSend = ws.send.bind(ws);
      ws.send = (...sendArgs) => {
        return originalSend(...sendArgs);
      };

      // 定期发送 ping
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(this.config.websocket.pingMessage));
          } catch (e) {
            clearInterval(pingInterval);
          }
        }
      }, this.config.websocket.pingInterval);

      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });

      return ws;
    };

    window.WebSocket.prototype = originalWebSocket.prototype;
    this.debug('WebSocket 保活已启用');
  }

  // 清理资源
  cleanup() {
    this.activityIntervals.forEach(id => clearTimeout(id));
    this.activityIntervals = [];
    this.debug('资源已清理');
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AntiLazyLoadBase;
}
