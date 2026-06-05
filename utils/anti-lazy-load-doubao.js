// 豆包专用 - Fetch 拦截器 + 人类行为模拟
// 版本: 3.1.0
// 核心改进: 高斯分布时序 + 贝塞尔曲线鼠标 + Proxy隐蔽 + 完整交互链
(function() {
  'use strict';

  const DEBUG = false;
  const intervals = [];
  
  function debug(...args) {
    if (DEBUG) console.log('[Doubao Anti-Lazy]', ...args);
  }

  // ========== 工具函数 ==========

  function gaussianRandom(mean, stdev) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function humanDelay(min, max) {
    const mean = (min + max) / 2;
    const stdev = (max - min) / 6;
    return clamp(gaussianRandom(mean, stdev), min, max);
  }

  // ========== Proxy 隐蔽覆盖工具 ==========

  function createStealthOverride(originalFn, overrideFn) {
    return new Proxy(originalFn, {
      apply: function(target, thisArg, argumentsList) {
        return overrideFn.apply(thisArg, argumentsList);
      },
      get: function(target, prop) {
        if (prop === 'toString') {
          return Function.prototype.toString.bind(originalFn);
        }
        if (prop === 'name') return originalFn.name;
        if (prop === 'length') return originalFn.length;
        return Reflect.get(target, prop);
      }
    });
  }

  // ========== 贝塞尔曲线鼠标模拟器 ==========

  class BezierMouseSimulator {
    constructor() {
      this.currentX = window.innerWidth / 2 + gaussianRandom(0, 100);
      this.currentY = window.innerHeight / 2 + gaussianRandom(0, 80);
      this.targetX = this.currentX;
      this.targetY = this.currentY;
      this.isMoving = false;
      this.moveHistory = [];
      this.maxHistory = 50;
    }

    generateControlPoint(startX, startY, endX, endY) {
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const dist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
      const offset = clamp(dist * 0.3, 20, 150);
      const angle = Math.atan2(endY - startY, endX - startX) + (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 4 + Math.random() * Math.PI / 4);
      return {
        x: midX + Math.cos(angle) * offset * gaussianRandom(1, 0.3),
        y: midY + Math.sin(angle) * offset * gaussianRandom(1, 0.3)
      };
    }

    bezierPoint(t, p0, p1, p2) {
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
      };
    }

    moveTo(targetX, targetY) {
      this.targetX = clamp(targetX, 10, window.innerWidth - 10);
      this.targetY = clamp(targetY, 10, window.innerHeight - 10);
    }

    getStep() {
      const dist = Math.sqrt((this.targetX - this.currentX) ** 2 + (this.targetY - this.currentY) ** 2);
      return Math.max(3, Math.min(20, dist / 10));
    }

    simulateStep() {
      const dist = Math.sqrt((this.targetX - this.currentX) ** 2 + (this.targetY - this.currentY) ** 2);
      if (dist < 2) {
        this.currentX = this.targetX;
        this.currentY = this.targetY;
        return false;
      }

      const step = this.getStep();
      const jitterX = gaussianRandom(0, 0.8);
      const jitterY = gaussianRandom(0, 0.8);
      
      const dx = this.targetX - this.currentX;
      const dy = this.targetY - this.currentY;
      const ratio = step / dist;

      this.currentX += dx * ratio + jitterX;
      this.currentY += dy * ratio + jitterY;
      
      this.currentX = clamp(this.currentX, 0, window.innerWidth);
      this.currentY = clamp(this.currentY, 0, window.innerHeight);

      this.moveHistory.push({ x: this.currentX, y: this.currentY, t: Date.now() });
      if (this.moveHistory.length > this.maxHistory) this.moveHistory.shift();

      return true;
    }

    getPos() {
      return { x: this.currentX, y: this.currentY };
    }

    pickRandomTarget() {
      const margin = 80;
      this.targetX = clamp(gaussianRandom(window.innerWidth / 2, window.innerWidth / 4), margin, window.innerWidth - margin);
      this.targetY = clamp(gaussianRandom(window.innerHeight / 2, window.innerHeight / 4), margin, window.innerHeight - margin);
    }
  }

  const mouseSim = new BezierMouseSimulator();

  // ========== 事件派发 ==========

  function dispatchMouseEvent(type, x, y, extra) {
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x + window.screenX,
      screenY: y + window.screenY,
      movementX: 0,
      movementY: 0,
      ...(extra || {})
    };
    document.dispatchEvent(new MouseEvent(type, opts));
  }

  function dispatchMouseChain(x, y) {
    const pos = mouseSim.getPos();
    const movementX = x - pos.x;
    const movementY = y - pos.y;
    dispatchMouseEvent('pointermove', x, y, { pointerId: 1, pointerType: 'mouse', movementX, movementY });
    dispatchMouseEvent('mousemove', x, y, { movementX, movementY });
  }

  function dispatchClickSequence(x, y) {
    dispatchMouseEvent('pointerdown', x, y, { button: 0, pointerId: 1, pointerType: 'mouse', pressure: 0.5 });
    dispatchMouseEvent('mousedown', x, y, { button: 0 });
    const releaseDelay = clamp(gaussianRandom(80, 30), 40, 200);
    setTimeout(() => {
      dispatchMouseEvent('pointerup', x, y, { button: 0, pointerId: 1, pointerType: 'mouse', pressure: 0 });
      dispatchMouseEvent('mouseup', x, y, { button: 0 });
      dispatchMouseEvent('click', x, y, { button: 0 });
    }, releaseDelay);
  }

  // 暴露给 adapter 层使用
  window.__doubaoMouse = {
    sim: mouseSim,
    moveTo(x, y) { mouseSim.moveTo(x, y); },
    getPos() { return mouseSim.getPos(); },
    dispatchMouseChain,
    dispatchClickSequence,
    humanDelay,
    gaussianRandom
  };

  // ========== Fetch 拦截器 ==========

  function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    const fetchOverride = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isWaiting = document.body.getAttribute('data-anti-lazy-waiting') === 'true';
      
      const response = await originalFetch.apply(this, args);
      
      try {
        if (url && isWaiting && url.includes('/chat/completion')) {
          debug('matched AI API');
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
                let finalText = fullText;
                if (finalText.length > 0) {
                  document.body.setAttribute('data-anti-lazy-message', finalText);
                  document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
                  debug('got full reply, length:', finalText.length);
                }
                return;
              }
              
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              
              let lineEnd;
              while ((lineEnd = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, lineEnd).trim();
                buffer = buffer.substring(lineEnd + 1);
                
                if (!line) continue;
                
                if (line.startsWith('data:')) {
                  const data = line.slice(5).trim();
                  if (data === '[DONE]') continue;
                  
                  try {
                    const json = JSON.parse(data);
                    let text = '';
                    
                    if (json.patch_op && Array.isArray(json.patch_op)) {
                      for (const op of json.patch_op) {
                        const pv = op.patch_value;
                        if (pv?.tts_content) continue;
                        if (pv?.content_block && Array.isArray(pv.content_block)) {
                          for (const block of pv.content_block) {
                            if (block.block_type === 10040) {
                              isThinking = !block.is_finish;
                              continue;
                            }
                            if (block?.content?.text_block?.summary) continue;
                            if (block.block_type === 10000) {
                              const blockText = block?.content?.text_block?.text;
                              if (typeof blockText === 'string') text += blockText;
                            }
                          }
                        }
                      }
                    }
                    
                    if (!text && json.content?.content_block && Array.isArray(json.content.content_block)) {
                      for (const block of json.content.content_block) {
                        if (block.block_type === 10040) {
                          isThinking = !block.is_finish;
                          continue;
                        }
                        if (block?.content?.text_block?.summary) continue;
                        if (block.block_type === 10000) {
                          const blockText = block?.content?.text_block?.text;
                          if (typeof blockText === 'string') text += blockText;
                        }
                      }
                    }
                    
                    if (!text && typeof json.text === 'string') {
                      if (!isThinking) text = json.text;
                    }
                    
                    if (!text && typeof json.choices?.[0]?.delta?.content === 'string') {
                      text = json.choices[0].delta.content;
                    }
                    
                    if (text) fullText += text;
                  } catch (e) {
                    debug('JSON parse error:', e.message);
                  }
                }
              }
              
              if (fullText.length > 0) {
                document.body.setAttribute('data-anti-lazy-stream-content', fullText);
              }
              
              readStream();
            }).catch(e => debug('stream read error:', e.message));
          }
          
          readStream();
        }
      } catch (e) {
        debug('error:', e.message);
      }
      
      return response;
    };
    
    window.fetch = createStealthOverride(originalFetch, fetchOverride);
    debug('Fetch interceptor installed');
  }

  // ========== 用户行为模拟（高斯分布 + 贝塞尔曲线） ==========

  function setupUserActivity() {
    // 鼠标平滑移动（贝塞尔曲线）
    function moveLoop() {
      const dist = Math.sqrt(
        (mouseSim.targetX - mouseSim.currentX) ** 2 + 
        (mouseSim.targetY - mouseSim.currentY) ** 2
      );

      if (dist < 3) {
        mouseSim.pickRandomTarget();
        const nextDelay = humanDelay(3000, 8000);
        setTimeout(moveLoop, nextDelay);
        return;
      }

      mouseSim.simulateStep();
      const pos = mouseSim.getPos();
      dispatchMouseChain(pos.x, pos.y);

      const stepDelay = dist > 200 ? humanDelay(8, 20) : humanDelay(15, 40);
      setTimeout(moveLoop, stepDelay);
    }
    setTimeout(moveLoop, humanDelay(1000, 3000));

    // 偶尔点击（频率低，避免触发风控）
    function clickLoop() {
      if (Math.random() < 0.3) {
        const pos = mouseSim.getPos();
        dispatchClickSequence(pos.x, pos.y);
      }
      const nextDelay = humanDelay(15000, 40000);
      setTimeout(clickLoop, nextDelay);
    }
    setTimeout(clickLoop, humanDelay(20000, 40000));

    // 滚动（低频率）
    function scrollLoop() {
      const delta = gaussianRandom(0, 30);
      window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      const nextDelay = humanDelay(10000, 25000);
      setTimeout(scrollLoop, nextDelay);
    }
    setTimeout(scrollLoop, humanDelay(8000, 15000));

    // 键盘（极低频率，只按修饰键）
    function keyLoop() {
      if (Math.random() < 0.2) {
        const keys = ['Shift', 'Control', 'Alt'];
        const key = keys[Math.floor(Math.random() * keys.length)];
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, keyCode: key === 'Shift' ? 16 : key === 'Control' ? 17 : 18 }));
        setTimeout(() => {
          document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }, humanDelay(50, 150));
      }
      const nextDelay = humanDelay(20000, 50000);
      setTimeout(keyLoop, nextDelay);
    }
    setTimeout(keyLoop, humanDelay(15000, 30000));

    debug('User activity simulation started (Gaussian + Bezier)');
  }

  // ========== 页面可见性 + API 覆盖 ==========

  function setupVisibility() {
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true, enumerable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true, enumerable: true });
    } catch (e) {
      debug('visibility override failed:', e.message);
    }

    const origHasFocus = document.hasFocus.bind(document);
    document.hasFocus = createStealthOverride(origHasFocus, () => true);

    // 覆盖 navigator.userActivation
    try {
      if (navigator.userActivation) {
        Object.defineProperty(navigator.userActivation, 'isActive', { get: () => true, configurable: true });
        Object.defineProperty(navigator.userActivation, 'hasBeenActive', { get: () => true, configurable: true });
      }
    } catch (e) {}

    // 拦截 visibilitychange 相关事件注册
    const blockedEvents = ['visibilitychange', 'webkitvisibilitychange', 'freeze', 'resume', 'pagehide'];
    const origAddEventListener = EventTarget.prototype.addEventListener;
    const stealthAddEventListener = function(type, listener, options) {
      if (blockedEvents.includes(type)) return;
      return origAddEventListener.call(this, type, listener, options);
    };
    EventTarget.prototype.addEventListener = createStealthOverride(origAddEventListener, stealthAddEventListener);

    // 拦截 freeze/pagehide 事件派发
    const origDispatchEvent = EventTarget.prototype.dispatchEvent;
    const stealthDispatchEvent = function(event) {
      if (event && (event.type === 'freeze' || event.type === 'pagehide')) return false;
      return origDispatchEvent.call(this, event);
    };
    EventTarget.prototype.dispatchEvent = createStealthOverride(origDispatchEvent, stealthDispatchEvent);

    // 覆盖 IntersectionObserver
    if (window.IntersectionObserver) {
      const OrigIO = window.IntersectionObserver;
      const stealthIO = function(callback, options) {
        const wrappedCallback = (entries, observer) => {
          const modified = entries.map(entry => {
            entry.isIntersecting = true;
            entry.intersectionRatio = 1;
            entry.intersectionRect = entry.boundingClientRect;
            return entry;
          });
          return callback(modified, observer);
        };
        const observer = new OrigIO(wrappedCallback, options);
        const origObserve = observer.observe.bind(observer);
        observer.observe = (el) => {
          setTimeout(() => {
            wrappedCallback([{
              target: el,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: el.getBoundingClientRect(),
              intersectionRect: el.getBoundingClientRect(),
              rootBounds: null,
              time: performance.now()
            }], observer);
          }, 0);
          return origObserve(el);
        };
        return observer;
      };
      stealthIO.prototype = OrigIO.prototype;
      window.IntersectionObserver = createStealthOverride(OrigIO, stealthIO);
    }

    // 覆盖 requestIdleCallback
    if (window.requestIdleCallback) {
      const origRIC = window.requestIdleCallback;
      const stealthRIC = (callback) => {
        return setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 50 }), 0);
      };
      window.requestIdleCallback = createStealthOverride(origRIC, stealthRIC);
    }

    // 覆盖 Network Info
    if (navigator.connection) {
      try {
        Object.defineProperty(navigator.connection, 'saveData', { get: () => false, configurable: true });
        Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g', configurable: true });
      } catch (e) {}
    }

    debug('Visibility + API overrides installed');
  }

  // ========== 初始化 ==========

  function init() {
    setupFetchInterceptor();
    setupVisibility();
    setupUserActivity();
    debug('Initialized v4.0.0');
  }

  init();
})();
