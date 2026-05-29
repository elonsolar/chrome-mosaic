// 豆包专用 - Fetch 拦截器 + 用户活动模拟
// 版本: 3.0.8
// 使用完整回复（已过滤思考内容 block_type:10040，只保留文本 block_type:10000）
(function() {
  'use strict';

  const DEBUG = false; // 关闭详细调试日志
  const intervals = [];
  
  function debug(...args) {
    if (DEBUG) console.log('[Doubao Fetch]', ...args);
  }

  // ========== Fetch 拦截器 ==========
  function setupFetchInterceptor() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isWaiting = document.body.getAttribute('data-anti-lazy-waiting') === 'true';
      
      const response = await originalFetch.apply(this, args);
      
      try {
        if (url && isWaiting && url.includes('/chat/completion')) {
          debug('✓ 匹配到 AI API');
          document.body.setAttribute('data-anti-lazy-waiting', 'false');
          
          const clonedResponse = response.clone();
          const reader = clonedResponse.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let buffer = '';
          let isThinking = false; // 追踪是否处于思考阶段
          
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
              console.log("解码数据chunk ",chunk)
              buffer += chunk;
              
              // 处理所有完整的行
              let lineEnd;
              while ((lineEnd = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, lineEnd).trim();
                buffer = buffer.substring(lineEnd + 1);
                
                if (!line) continue;
                
                if (line.startsWith('data:')) {
                  const data = line.slice(5).trim();
                  if (data === '[DONE]') continue;
                  
                  // console.log(data);
                  
                  try {
                    const json = JSON.parse(data);
                    let text = '';
                    
                    // 豆包格式: patch_op -> content_block -> text_block -> text
                    if (json.patch_op && Array.isArray(json.patch_op)) {
                      for (const op of json.patch_op) {
                        const pv = op.patch_value;
                        // 跳过 tts_content（思考内容）
                        if (pv?.tts_content) {
                          continue;
                        }
                        if (pv?.content_block && Array.isArray(pv.content_block)) {
                          for (const block of pv.content_block) {
                            // 检测思考块状态
                            if (block.block_type === 10040) {
                              isThinking = !block.is_finish;
                              continue;
                            }
                            // 跳过思考子内容(有summary字段)
                            if (block?.content?.text_block?.summary) continue;
                            // 只处理文本块(block_type:10000)
                            if (block.block_type === 10000) {
                              const blockText = block?.content?.text_block?.text;
                              if (typeof blockText === 'string') {
                                text += blockText;
                              }
                            }
                          }
                        }
                      }
                    }
                    
                    // STREAM_MSG_NOTIFY 格式: content -> content_block -> text_block -> text
                    if (!text && json.content?.content_block && Array.isArray(json.content.content_block)) {
                      for (const block of json.content.content_block) {
                        // 检测思考块状态
                        if (block.block_type === 10040) {
                          isThinking = !block.is_finish;
                          continue;
                        }
                        // 跳过思考子内容(有summary字段)
                        if (block?.content?.text_block?.summary) continue;
                        // 只处理文本块(block_type:10000)
                        if (block.block_type === 10000) {
                          const blockText = block?.content?.text_block?.text;
                          if (typeof blockText === 'string') {
                            text += blockText;
                          }
                        }
                      }
                    }
                    
                    // CHUNK_DELTA 格式（纯文本追加）- 跳过思考阶段的文本
                    if (!text && typeof json.text === 'string') {
                      if (!isThinking) {
                        text = json.text;
                      }
                    }
                    
                    // 标准格式回退
                    if (!text && typeof json.choices?.[0]?.delta?.content === 'string') {
                      text = json.choices[0].delta.content;
                    }
                    
                    if (text) {
                      fullText += text;
                    }
                  } catch (e) {
                    debug(`JSON 解析错误: ${e.message}, 数据: "${data.substring(0, 100)}"`);
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

  // ========== 用户活动模拟（防检测）==========
  function setupUserActivity() {
    // 鼠标移动模拟
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

    // 点击模拟
    const clickInterval = setInterval(() => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      
      document.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
    }, 5000 + Math.random() * 5000);
    intervals.push(clickInterval);

    // 滚动模拟
    const scrollInterval = setInterval(() => {
      window.scrollBy(0, Math.random() * 10 - 5);
    }, 8000 + Math.random() * 4000);
    intervals.push(scrollInterval);

    // 键盘事件模拟
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
    // 覆盖 document.hidden
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    
    // 定期触发可见性事件
    const visInterval = setInterval(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    }, 5000);
    intervals.push(visInterval);

    // 覆盖 document.hasFocus
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
