/**
 * 浮动窗口内容脚本
 * 在所有网页上显示浮动窗口，接收并显示AI回复
 */

(function() {
  'use strict';

  let floatingWindow = null;
  let currentConversationId = null;

  // 初始化浮动窗口
  function initFloatingWindow() {
    if (floatingWindow) return;

    console.log('[FloatingContent] 初始化浮动窗口');

    floatingWindow = new OpenChatFloatingWindow({
      width: 400,
      height: 500,
      position: {
        x: window.innerWidth - 420,
        y: 20
      }
    });

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[FloatingContent] 收到消息:', request);

      if (request.action === 'ping') {
        // 响应ping，用于检测浮动窗口是否存在
        console.log('[FloatingContent] 收到ping，返回pong');
        sendResponse({ status: 'ok', type: 'floatingWindow' });
        return true;
      } else if (request.action === 'showFloatingWindow') {
        floatingWindow.show();
        sendResponse({ success: true });
      } else if (request.action === 'hideFloatingWindow') {
        floatingWindow.hide();
        sendResponse({ success: true });
      } else if (request.action === 'addMessage') {
        const { role, content, isUser, isError, provider } = request;
        console.log('[FloatingContent] 添加消息:', { role, content, isUser, isError, provider });
        
        // 确保浮动窗口可见
        if (!floatingWindow.visible) {
          console.log('[FloatingContent] 浮动窗口不可见，自动显示');
          floatingWindow.show();
        }
        
        floatingWindow.addMessage(role, content, isUser, isError, provider);
        sendResponse({ success: true });
      } else if (request.action === 'clearMessages') {
        floatingWindow.clearMessages();
        sendResponse({ success: true });
      } else if (request.action === 'openConversation') {
        currentConversationId = request.conversationId;
        floatingWindow.clearMessages();
        floatingWindow.show();
        
        // 显示历史消息
        if (request.messages && Array.isArray(request.messages)) {
          request.messages.forEach(msg => {
            floatingWindow.addMessage(
              msg.memberName || msg.roleName || 'AI',
              msg.content,
              msg.isUser,
              msg.isError
            );
          });
        }
        
        sendResponse({ success: true });
      }

      return true;
    });

    // 通知background页面已就绪
    chrome.runtime.sendMessage({
      type: 'floatingWindowReady',
      url: window.location.href
    });

    console.log('[FloatingContent] 浮动窗口初始化完成');
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingWindow);
  } else {
    initFloatingWindow();
  }

  // 导出到全局
  window.OpenChatFloatingContent = {
    show: () => floatingWindow?.show(),
    hide: () => floatingWindow?.hide(),
    addMessage: (role, content, isUser, isError) => 
      floatingWindow?.addMessage(role, content, isUser, isError),
    clearMessages: () => floatingWindow?.clearMessages()
  };
})();
