// Kimi 专用 - Fetch 拦截器 + 用户活动模拟
// 版本: 3.0.0
// 主要更新: Fetch拦截器、防后台冻结
(function() {
  'use strict';

  const DEBUG = false;
  const intervals = [];
  
  function debug(...args) {
    if (DEBUG) console.log('[Kimi Fetch]', ...args);
  }

  // ========== Fetch 拦截器（Connect-RPC 协议）==========
  // Kimi 使用 Connect-RPC 流式协议 (content-type: application/connect+json)
  // 端点: /apiv2/kimi.gateway.chat.v1.ChatService/Chat
  // 数据格式: 每个消息前有5字节头(1字节压缩标志 + 4字节长度)，后跟 JSON
  // 思考内容: op="append", mask="block.think.content", block.think.content
  // 正式回复: op="append", mask="block.text.content", block.text.content
  // 结束标记: "done": {}
  function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isWaiting = document.body.getAttribute('data-anti-lazy-waiting') === 'true';
      
      const response = await originalFetch.apply(this, args);
      
      try {
        if (url && isWaiting && url.includes('kimi.gateway.chat.v1.ChatService/Chat')) {
          debug('✓ 匹配到 Kimi AI API (Connect-RPC)');
          document.body.setAttribute('data-anti-lazy-waiting', 'false');
          
          const clonedResponse = response.clone();

          if (!response.ok) {
            const errorBody = await clonedResponse.text().catch(() => '');
            const msg = errorBody || `错误: Kimi API 返回 ${response.status}`;
            document.body.setAttribute('data-anti-lazy-message', msg);
            document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
            document.body.setAttribute('data-anti-lazy-error', 'true');
            debug(`⚠️ 非正常响应: ${response.status}`);
            return response;
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('connect+json') && !contentType.includes('application/json')) {
            const text = await clonedResponse.text().catch(() => '');
            document.body.setAttribute('data-anti-lazy-message', text || `错误: 非预期响应类型 ${contentType}`);
            document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
            document.body.setAttribute('data-anti-lazy-error', 'true');
            debug(`⚠️ 非预期响应类型: ${contentType}`);
            return response;
          }



          const reader = clonedResponse.body.getReader();
          let fullText = '';
          let rawBuffer = new Uint8Array(0);
          
          function parseConnectStreamMessages(bytes) {
            const messages = [];
            let offset = 0;
            while (offset + 5 <= bytes.length) {
              const msgLen = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0);
              if (offset + 5 + msgLen > bytes.length) break;
              const payload = new TextDecoder().decode(bytes.slice(offset + 5, offset + 5 + msgLen));
              messages.push(payload);
              offset += 5 + msgLen;
            }
            return { messages, remaining: bytes.slice(offset) };
          }
          
           function readStream() {
             reader.read().then(({ done, value }) => {
               if (done) {
                 if (fullText.length > 0) {
                   document.body.setAttribute('data-anti-lazy-message', fullText);
                   document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
                   debug(`✓ 获取完整回复，长度: ${fullText.length}`);
                 } else {
                   document.body.setAttribute('data-anti-lazy-message', '错误: Kimi 返回了空回复');
                   document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
                   document.body.setAttribute('data-anti-lazy-error', 'true');
                   debug('⚠️ 流结束但回复为空');
                 }
                 return;
              }
              
              const merged = new Uint8Array(rawBuffer.length + value.length);
              merged.set(rawBuffer);
              merged.set(value, rawBuffer.length);
              rawBuffer = merged;
              
              const { messages, remaining } = parseConnectStreamMessages(rawBuffer);
              rawBuffer = remaining;
              
              for (const payload of messages) {
                if (!payload.trim()) continue;
                try {
                  const json = JSON.parse(payload);
                  
                  if (json.op === 'append' && json.mask === 'block.text.content') {
                    const text = json.block?.text?.content;
                    if (typeof text === 'string') {
                      fullText += text;
                    }
                  }
                  
                  if (json.op === 'set' && json.mask === 'block.text') {
                    const text = json.block?.text?.content;
                    if (typeof text === 'string') {
                      fullText += text;
                    }
                  }
                } catch (e) {
                  debug(`JSON 解析错误: ${e.message}`);
                }
              }

              if (fullText.length > 0) {
                document.body.setAttribute('data-anti-lazy-stream-content', fullText);
              }
               
               readStream();
            }).catch(e => {
              debug('流读取错误:', e.message);
              document.body.setAttribute('data-anti-lazy-message', '错误: ' + e.message);
              document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
              document.body.setAttribute('data-anti-lazy-error', 'true');
            });
          }
          
          readStream();
        }
      } catch (e) {
        debug('错误:', e.message);
        document.body.setAttribute('data-anti-lazy-message', '错误: ' + e.message);
        document.body.setAttribute('data-anti-lazy-fetch-ready', 'true');
        document.body.setAttribute('data-anti-lazy-error', 'true');
      }
      
      return response;
    };
    
    window.fetch = new Proxy(window.fetch, {
      apply: (target, thisArg, args) => target.apply(thisArg, args),
      get: (target, prop) => prop === 'toString' ? Function.prototype.toString.bind(originalFetch) : Reflect.get(target, prop)
    });
    
    debug('✓ Fetch 拦截器已安装');
  }

  // ========== 用户活动模拟（防检测）==========
  function setupUserActivity() {
    let lastMouseTime = 0;
    const mouseInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastMouseTime < 3000) return;
      lastMouseTime = now;
      
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: x, clientY: y, bubbles: true
      }));
    }, 2000 + Math.random() * 3000);
    intervals.push(mouseInterval);

    const clickInterval = setInterval(() => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      
      document.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
    }, 5000 + Math.random() * 5000);
    intervals.push(clickInterval);

    const scrollInterval = setInterval(() => {
      window.scrollBy(0, Math.random() * 10 - 5);
    }, 8000 + Math.random() * 4000);
    intervals.push(scrollInterval);

    const keyInterval = setInterval(() => {
      const keys = ['Shift', 'Control', 'Alt'];
      const key = keys[Math.floor(Math.random() * keys.length)];
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }, 10000 + Math.random() * 5000);
    intervals.push(keyInterval);

    debug('✓ 用户活动模拟已启动');
  }

  // ========== 页面可见性模拟 ==========
  function setupVisibility() {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    
    const visInterval = setInterval(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    }, 5000);
    intervals.push(visInterval);

    document.hasFocus = () => true;

    debug('✓ 可见性模拟已启动');
  }

  // ========== 初始化 ==========
  function init() {
    setupFetchInterceptor();
    setupUserActivity();
    setupVisibility();
    debug('✓ 初始化完成');
  }

  init();
})();
