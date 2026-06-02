class DeepSeekAdapter extends BasePlatformAdapter {
  constructor() {
    super('deepseek', {
      inputBox: 'textarea',
      sendButton: 'button',
      messageList: '.ds-message',
      messageSelector: '.ds-message',
      userInput: '.ds-message:has(.ds-markdown)',
      aiResponse: '.ds-message:has(.ds-markdown)',
      newChatButton: '[class*="new"]'
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (selector.includes(':has-text(')) {
        const [baseSelector, textPart] = selector.split(':has-text(');
        const text = textPart.replace(/[)'"]/g, '');
        const elements = document.querySelectorAll(baseSelector);
        const element = Array.from(elements).find(el => el.textContent.includes(text));
        if (element) return element;
      } else {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      await this.sleep(100);
    }
    throw new Error(`元素未找到: ${selector}`);
  }

  async sendMessage(content) {
    console.log(`[${this.platform}] ========== 开始发送消息 ==========`);
    console.log(`[${this.platform}] 消息内容:`, content);

    const inputBox = await this.waitForElement('textarea', 10000);
    console.log(`[${this.platform}] ✓ 找到输入框`);
    
    inputBox.focus();

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(inputBox, content);
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    await this.sleep(500);

    // 设置 fetch 拦截器等待标志
    document.body.setAttribute('data-anti-lazy-waiting', 'true');
    console.log(`[${this.platform}] ✓ 已设置 data-anti-lazy-waiting = true`);

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    inputBox.dispatchEvent(enterEvent);

    if (content.includes('\n')) {
      const shiftEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      inputBox.dispatchEvent(shiftEnterEvent);
    }
  }

  async processSendMessage(content, messageId, conversationId = null) {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp()}] [${this.platform}] ========== processSendMessage ==========`);
    console.log(`[${timestamp()}] [${this.platform}] content:`, content);
    console.log(`[${timestamp()}] [${this.platform}] messageId:`, messageId);
    console.log(`[${timestamp()}] [${this.platform}] conversationId:`, conversationId);

    window.isSendingMessage = true;
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已设置 isSendingMessage = true`);

    try {
      await this.sendMessage(content);
      console.log(`[${timestamp()}] [${this.platform}] ✓ 消息已发送到输入框`);

      const response = await this.waitForAIResponse();
      console.log(`[${timestamp()}] [${this.platform}] ✓ 收到 AI 回复，长度:`, response?.length || 0);

      // 使用重试机制发送响应
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'aiResponse',
              platform: this.platform,
              messageId: messageId,
              conversationId: conversationId,
              content: response,
              conversationUrl: window.location.href
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
            setTimeout(() => reject(new Error('sendMessage超时')), 5000);
          });
          const ts = timestamp();
          console.log(`[${ts}] [${this.platform}] ✓ 已发送 aiResponse 消息到 background (第${attempt}次尝试)`);
          break;
        } catch (error) {
          const ts = timestamp();
          console.warn(`[${ts}] [${this.platform}] ⚠️ 第${attempt}次发送aiResponse失败:`, error.message);
          if (attempt < 3) {
            await this.sleep(1000 * attempt);
          } else {
            console.error(`[${ts}] [${this.platform}] ❌ 发送aiResponse最终失败，已重试3次`);
            throw error;
          }
        }
      }
    } catch (error) {
      const ts = timestamp();
      console.error(`[${ts}] [${this.platform}] ❌ 错误:`, error.message);
      chrome.runtime.sendMessage({
        type: 'aiResponse',
        platform: this.platform,
        messageId: messageId,
        conversationId: conversationId,
        error: error.message
      });
    } finally {
      window.isSendingMessage = false;
      const ts = timestamp();
      console.log(`[${ts}] [${this.platform}] ✓ 消息处理完成，已清除 isSendingMessage 标记`);
    }
  }

  async waitForAIResponse() {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp()}] [${this.platform}] ========== 开始等待 AI 回复 ==========`);

    const POLL_INTERVAL = 500; // 每500ms检查一次
    const MAX_WAIT = 120000; // 最长等待120秒
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const ts = timestamp();
        const elapsed = Date.now() - startTime;

        // 超时检查
        if (elapsed > MAX_WAIT) {
          clearInterval(checkInterval);
          console.log(`[${ts}] [${this.platform}] 等待超时 (${MAX_WAIT}ms)`);
          reject(new Error('等待AI回复超时'));
          return;
        }

        // 检查 fetch 拦截器是否已完成
        const fetchReady = document.body.getAttribute('data-anti-lazy-fetch-ready');
        const fetchMsg = document.body.getAttribute('data-anti-lazy-message');
        
        if (fetchReady === 'true' && fetchMsg && fetchMsg.length > 0) {
          console.log(`[${ts}] [${this.platform}] ✓ 从 fetch 拦截器获取消息，长度: ${fetchMsg.length}`);
          document.body.removeAttribute('data-anti-lazy-message');
          document.body.removeAttribute('data-anti-lazy-fetch-ready');
          clearInterval(checkInterval);
          resolve(fetchMsg);
          return;
        }

      }, POLL_INTERVAL);
    });
  }

  async deleteConversation(conversationUrl) {
    console.log(`[${this.platform}] ========== 开始删除会话 ==========`);
    console.log(`[${this.platform}] 会话URL:`, conversationUrl);

    try {
      if (window.location.href !== conversationUrl) {
        window.location.href = conversationUrl;
        await this.sleep(3000);
      }

      await this.sleep(2000);

      const conversationLinks = document.querySelectorAll('a[href*="/chat/s/"]');
      let targetLink = null;

      // 方案1：通过活动状态查找
      targetLink = Array.from(conversationLinks).find(link => {
        const style = window.getComputedStyle(link);
        return style.fontWeight === '700' || 
               style.fontWeight === 'bold' ||
               link.classList.contains('active') ||
               link.getAttribute('aria-current') === 'page';
      });

      // 方案2：通过URL匹配兜底
      if (!targetLink) {
        const conversationId = conversationUrl.split('/chat/s/')[1]?.split('/')[0];
        if (conversationId) {
          for (const link of conversationLinks) {
            if (link.href.includes(conversationId)) {
              targetLink = link;
              break;
            }
          }
        }
      }

      // 方案3：使用第一个会话作为兜底
      if (!targetLink && conversationLinks.length > 0) {
        console.warn(`[${this.platform}] ⚠️ 未找到精确匹配会话，使用第一个会话`);
        targetLink = conversationLinks[0];
      }

      if (!targetLink) {
        throw new Error('找不到目标会话链接');
      }
      console.log(`[${this.platform}] ✓ 找到会话链接:`, targetLink.textContent.trim());

      targetLink.scrollIntoView({ behavior: 'instant', block: 'center' });
      await this.sleep(300);

      const menuButton = targetLink.querySelector('[class*="ds-icon-button"], div[role="button"]');
      if (!menuButton) {
        throw new Error('找不到会话菜单按钮');
      }
      console.log(`[${this.platform}] ✓ 找到菜单按钮`);

      menuButton.click();
      await this.sleep(800);

      const menuContainer = document.querySelector('.ds-dropdown-menu[role="menu"]');
      if (!menuContainer) {
        throw new Error('找不到下拉菜单');
      }
      console.log(`[${this.platform}] ✓ 找到下拉菜单`);

      const menuItems = menuContainer.querySelectorAll('.ds-dropdown-menu-option');
      let deleteButton = null;

      for (const item of menuItems) {
        if (item.textContent.includes('删除')) {
          deleteButton = item;
          break;
        }
      }

      if (!deleteButton) {
        throw new Error('找不到删除按钮');
      }
      console.log(`[${this.platform}] ✓ 找到删除按钮`);

      deleteButton.click();
      await this.sleep(800);

      const modalWrapper = document.querySelector('.ds-modal-wrapper.ds-theme') 
        || document.querySelector('dialog');
      if (!modalWrapper) {
        throw new Error('找不到确认删除对话框');
      }
      console.log(`[${this.platform}] ✓ 找到确认删除对话框`);

      const dialogButtons = modalWrapper.querySelectorAll('button, [role="button"]');
      let confirmButton = null;

      for (const btn of dialogButtons) {
        if (btn.textContent.includes('删除该对话')) {
          confirmButton = btn;
          break;
        }
      }

      if (!confirmButton) {
        for (const btn of dialogButtons) {
          const btnText = btn.textContent.trim();
          if ((btnText.includes('删除') || btnText.toLowerCase().includes('delete')) && !btnText.includes('取消')) {
            confirmButton = btn;
            break;
          }
        }
      }

      if (!confirmButton) {
        throw new Error('找不到确认删除按钮');
      }
      console.log(`[${this.platform}] ✓ 找到确认删除按钮`);

      confirmButton.click();
      await this.sleep(2000);

      console.log(`[${this.platform}] ✓ 会话删除成功`);
      return true;
    } catch (error) {
      console.error(`[${this.platform}] ❌ 删除会话失败:`, error.message);
      throw error;
    }
  }
}

window.DeepSeekAdapter = DeepSeekAdapter;
