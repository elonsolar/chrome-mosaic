// Content Script - 注入到AI网站页面中执行操作

let currentAdapter = null;
let currentPlatform = null;

async function sendAiResponseWithRetry(message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
        setTimeout(() => reject(new Error('sendMessage超时')), 5000);
      });

      console.log(`[AI Plugin] ✅ aiResponse已发送 (第${attempt}次尝试)`);
      return result;
    } catch (error) {
      console.warn(`[AI Plugin] ⚠️ 第${attempt}次发送aiResponse失败:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        console.error(`[AI Plugin] ❌ 发送aiResponse最终失败，已重试${maxRetries}次`);
      }
    }
  }
}

function createPlatformAdapter(platform) {
  switch (platform) {
    case 'deepseek': return new DeepSeekAdapter();
    case 'doubao':   return new DoubaoAdapter();
    case 'qianwen':  return new QianwenAdapter();
    case 'kimi':     return new KimiAdapter();
    default:
      console.warn(`未知平台: ${platform}，使用doubao作为默认`);
      return new DoubaoAdapter();
  }
}

function init() {
  console.log('[AI Plugin] ========== 开始初始化 ==========');
  console.log('[AI Plugin] 当前URL:', window.location.href);

  currentPlatform = detectPlatform();
  console.log('[AI Plugin] 检测到平台:', currentPlatform);

  if (!currentPlatform) {
    console.warn('[AI Plugin] ⚠️ 无法识别当前平台');
    return;
  }

  try {
    currentAdapter = createPlatformAdapter(currentPlatform);
    console.log('[AI Plugin] ✓ 适配器创建成功');
  } catch (error) {
    console.error('[AI Plugin] ❌ 创建适配器失败:', error);
    return;
  }

  window.platformAdapter = currentAdapter;
  console.log('[AI Plugin] ✓ platformAdapter已暴露到window对象');

  chrome.runtime.sendMessage({
    type: 'pageReady',
    platform: currentPlatform,
    url: window.location.href
  });

  console.log('[AI Plugin] 初始化完成');
}

function detectPlatform() {
  const hostname = window.location.hostname;

  if (hostname.includes('deepseek')) {
    return 'deepseek';
  } else if (hostname.includes('doubao') || hostname.includes('feishu')) {
    return 'doubao';
  } else if (hostname.includes('qianwen') || hostname.includes('aliyun')) {
    return 'qianwen';
  } else if (hostname.includes('kimi') || hostname.includes('moonshot')) {
    return 'kimi';
  }

  return 'unknown';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[AI Plugin] 收到消息:', request.type);

  // ========== Keep-Alive：防止页面在后台冻结 ==========
  if (request.type === 'keepAlive') {
    console.log('[AI Plugin] 收到 keep-alive 消息');

    // 强制 DOM 查询，保持页面活跃
    const messages = document.querySelectorAll('[class*="message"], [class*="chat"]');
    console.log('[AI Plugin] DOM 查询，消息数:', messages.length);

    // 触发 scroll 事件
    window.dispatchEvent(new Event('scroll'));

    // 执行一些 DOM 操作
    document.hasFeature && document.hasFeature('1.0');

    sendResponse({ status: 'alive', messageCount: messages.length });
    return;
  }

  if (request.type === 'ping') {
    const platform = currentAdapter?.platform || 'unknown';
    sendResponse({ status: 'ok', platform });
    return;
  }

  // 新增：强制渲染消息
  if (request.type === 'forceRender') {
    console.log('[AI Plugin] ========== 收到强制渲染请求 ==========');

    if (window.forceRenderUtil) {
      window.forceRenderUtil.tryForceRender()
        .then(success => {
          console.log('[AI Plugin] ✓ 强制渲染完成:', success);
          sendResponse({ success });
        })
        .catch(error => {
          console.error('[AI Plugin] ✗ 强制渲染失败:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道打开，等待异步响应
    } else {
      console.warn('[AI Plugin] forceRenderUtil 未加载');
      sendResponse({ success: false, error: 'forceRenderUtil not loaded' });
    }
    return;
  }

  if (request.type === 'deleteConversation') {
    console.log('[AI Plugin] ========== 收到删除会话请求 ==========');
    console.log('[AI Plugin] 会话URL:', request.conversationUrl);
    console.log('[AI Plugin] 当前适配器:', currentAdapter?.platform);

    if (!currentAdapter) {
      console.error('[AI Plugin] ❌ adapter未初始化');
      sendResponse({ success: false, error: 'adapter未初始化' });
      return;
    }

    currentAdapter.deleteConversation(request.conversationUrl)
      .then(() => {
        console.log('[AI Plugin] ✅ 删除会话成功');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[AI Plugin] ❌ 删除会话失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'sendMessage') {
    if (!currentAdapter) {
      sendResponse({ status: 'error', message: 'adapter未初始化' });
      return;
    }

    const messageId = request.messageId;
    const content = request.content;
    const conversationId = request.conversationId || null;

    if (currentAdapter && currentAdapter.processSendMessage) {
      currentAdapter.processSendMessage(content, messageId, conversationId)
        .then(() => {
          sendResponse({ status: 'processing' });
        })
        .catch((error) => {
          console.error('[AI Plugin] processSendMessage 出错:', error);
          sendResponse({ status: 'error', message: error.message });
        });
      return true; // 保持消息通道打开
    } else {
      console.error('[AI Plugin] ❌ adapter 未初始化或没有 processSendMessage 方法');
      chrome.runtime.sendMessage({
        type: 'aiResponse',
        messageId,
        conversationId,
        error: 'adapter未初始化'
      });
      sendResponse({ status: 'error', message: 'adapter未初始化' });
    }
  }
});

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'sendMessage') {
    console.log('[AI Plugin] 从iframe收到消息:', event.data);

    const { messageId, content } = event.data;

    if (currentAdapter && currentAdapter.processSendMessage) {
      currentAdapter.processSendMessage(content, messageId);
    } else {
      console.error('[AI Plugin] ❌ adapter 未初始化或没有 processSendMessage 方法');
      chrome.runtime.sendMessage({
        type: 'aiResponse',
        messageId,
        error: 'adapter未初始化'
      });
    }
  }
});

console.log('[AI Plugin] ✓ 消息监听已启动');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
