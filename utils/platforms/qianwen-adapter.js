class QianwenAdapter extends BasePlatformAdapter {
  constructor() {
    super('qianwen', {
      inputBox: 'div[contenteditable="true"][data-slate-editor="true"]',
      sendButton: 'button[aria-label="发送消息"]',
      messageList: '.message-list-content-container',
      messageSelector: '.chat-round',
      userInput: '.question-text-card',
      aiResponse: '.answer-common-card, .qk-markdown',
      newChatButton: 'button[class*="new"], a:contains("新对话")'
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await this.sleep(100);
    }
    throw new Error(`元素未找到: ${selector}`);
  }

  async sendMessage(content) {
    console.log(`[${this.platform}] ========== 开始发送消息 ==========`);
    console.log(`[${this.platform}] 消息内容:`, content);

    const editor = await this.waitForElement('div[contenteditable="true"][data-slate-editor="true"]', 10000);
    console.log(`[${this.platform}] ✓ 找到编辑器`);
    
    editor.focus();
    await this.sleep(200);

    let textNode = editor.querySelector('span[data-slate-node="text"]');
    if (!textNode) {
      const el = editor.querySelector('[data-slate-node="element"]') || Object.assign(
        editor.appendChild(document.createElement('p')), { 'data-slate-node': 'element' }
      );
      textNode = Object.assign(el.appendChild(document.createElement('span')), { 'data-slate-node': 'text' });
      await this.sleep(50);
    }

    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(textNode);
    sel.removeAllRanges();
    sel.addRange(r);

    editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContent' }));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'deleteContent' }));
    await this.sleep(100);

    r.selectNodeContents(textNode);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);

    editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: content }));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: content }));
    await this.sleep(1000);

    // 设置 fetch 拦截器等待标志
    document.body.setAttribute('data-anti-lazy-waiting', 'true');
    console.log(`[${this.platform}] ✓ 已设置 data-anti-lazy-waiting = true`);

    const sendButton = await this.waitForButton();
    sendButton.click();
    console.log(`[${this.platform}] ✓ 已点击发送按钮`);
    await this.sleep(1000);
  }

  async waitForButton() {
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      const btn = document.querySelector('button[aria-label="发送消息"]');
      if (btn) {
        const isDisabled = btn.disabled;
        const isVisible = btn.offsetParent !== null;
        console.log(`[${this.platform}] 按钮状态: disabled=${isDisabled}, visible=${isVisible}`);
        
        if (!isDisabled && isVisible) return btn;
        
        if (isDisabled) {
          console.log(`[${this.platform}] 按钮仍为 disabled，等待...`);
        }
        if (!isVisible) {
          console.log(`[${this.platform}] 按钮不可见，等待...`);
        }
      } else {
        console.log(`[${this.platform}] 未找到按钮元素，等待...`);
      }
      await this.sleep(200);
    }
    
    const allButtons = document.querySelectorAll('button');
    console.error(`[${this.platform}] 页面上所有按钮:`, Array.from(allButtons).map(b => ({
      ariaLabel: b.getAttribute('aria-label'),
      disabled: b.disabled,
      visible: b.offsetParent !== null,
      className: b.className
    })));
    
    throw new Error('发送按钮未找到');
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


      this.waitForUrlUpdate
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

      const convList = document.querySelector('[role="list"].sider-scrollbar');
      if (!convList) {
        throw new Error('找不到会话列表');
      }

      const convItems = Array.from(convList.children).filter(child => {
        const inner = child.firstElementChild;
        if (!inner) return false;
        const text = child.textContent.trim();
        return text.length > 0 && text.length < 100 && inner.classList.contains('cursor-pointer');
      });

      let targetItem = null;

      targetItem = convItems.find(item => {
        const inner = item.firstElementChild;
        return inner && inner.classList.contains('!bg-option');
      });

      if (!targetItem) {
        const urlId = conversationUrl.split('/chat/')[1]?.split('/')[0];
        if (convItems.length > 0) {
          console.warn(`[${this.platform}] ⚠️ 未找到活动会话，使用第一个会话`);
          targetItem = convItems[0];
        }
      }

      if (!targetItem) {
        throw new Error('找不到目标会话');
      }
      console.log(`[${this.platform}] ✓ 找到会话:`, targetItem.textContent.trim());

      targetItem.scrollIntoView({ behavior: 'instant', block: 'center' });
      await this.sleep(300);

      const innerItem = targetItem.firstElementChild;
      const menuButton = innerItem?.querySelector('button[aria-haspopup="menu"]');

      if (!menuButton) {
        throw new Error('找不到会话菜单按钮');
      }
      console.log(`[${this.platform}] ✓ 找到菜单按钮`);

      // 使用 PointerEvent 触发 Radix UI 菜单
      const btnRect = menuButton.getBoundingClientRect();
      const bx = btnRect.left + btnRect.width / 2;
      const by = btnRect.top + btnRect.height / 2;

      const pointerEvents = [
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, clientX: bx, clientY: by, pointerId: 1, pointerType: 'mouse' }),
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, clientX: bx, clientY: by, pointerId: 1, pointerType: 'mouse' }),
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: bx, clientY: by })
      ];
      pointerEvents.forEach(e => menuButton.dispatchEvent(e));
      await this.sleep(800);

      const menuItems = document.querySelectorAll('[role="menuitem"]');
      let deleteButton = null;

      for (const item of menuItems) {
        if (item.textContent.includes('删除此对话')) {
          deleteButton = item;
          break;
        }
      }

      if (!deleteButton) {
        throw new Error('找不到删除按钮');
      }
      console.log(`[${this.platform}] ✓ 找到删除按钮`);

      const dbRect = deleteButton.getBoundingClientRect();
      const dbx = dbRect.left + dbRect.width / 2;
      const dby = dbRect.top + dbRect.height / 2;

      const deletePointerEvents = [
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, clientX: dbx, clientY: dby, pointerId: 1, pointerType: 'mouse' }),
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, clientX: dbx, clientY: dby, pointerId: 1, pointerType: 'mouse' }),
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: dbx, clientY: dby })
      ];
      deletePointerEvents.forEach(e => deleteButton.dispatchEvent(e));
      await this.sleep(800);

      const dialog = document.querySelector('div[role="dialog"][data-state="open"]');
      if (!dialog) {
        throw new Error('找不到确认删除对话框');
      }
      console.log(`[${this.platform}] ✓ 找到确认删除对话框`);

      const dialogButtons = dialog.querySelectorAll('button');
      let confirmButton = null;

      for (const btn of dialogButtons) {
        if (btn.textContent.includes('确定')) {
          confirmButton = btn;
          break;
        }
      }

      if (!confirmButton) {
        throw new Error('找不到确认删除按钮');
      }
      console.log(`[${this.platform}] ✓ 找到确认删除按钮`);

      const cbRect = confirmButton.getBoundingClientRect();
      const cbx = cbRect.left + cbRect.width / 2;
      const cby = cbRect.top + cbRect.height / 2;

      const confirmPointerEvents = [
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, clientX: cbx, clientY: cby, pointerId: 1, pointerType: 'mouse' }),
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, clientX: cbx, clientY: cby, pointerId: 1, pointerType: 'mouse' }),
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: cbx, clientY: cby })
      ];
      confirmPointerEvents.forEach(e => confirmButton.dispatchEvent(e));
      await this.sleep(2000);

      console.log(`[${this.platform}] ✓ 会话删除成功`);
      return true;
    } catch (error) {
      console.error(`[${this.platform}] ❌ 删除会话失败:`, error.message);
      throw error;
    }
  }

  /**
   * 等待 URL 更新到新会话
   * Qianwen 发送消息后，URL 会从 /chat/ 或 /chat 变成 /chat/{sessionId}
   */
  async waitForUrlUpdate(timeout = 10000) {
    const startTime = Date.now();
    const initialUrl = window.location.href;
    const initialPath = new URL(initialUrl).pathname;

    console.log(`[${this.platform}] 开始等待 URL 更新...`);
    console.log(`[${this.platform}] 初始 URL:`, initialUrl);
    console.log(`[${this.platform}] 初始路径:`, initialPath);

    // 如果当前已经在会话页面，直接返回
    if (initialPath !== '/chat' && initialPath !== '/chat/') {
      console.log(`[${this.platform}] 当前已经在会话页面，无需等待`);
      return initialUrl;
    }

    // 等待 URL 更新
    while (Date.now() - startTime < timeout) {
      const currentUrl = window.location.href;
      const currentPath = new URL(currentUrl).pathname;

      // URL 已更新（不再是 /chat 或 /chat/）
      if (currentPath !== '/chat' && currentPath !== '/chat/' && currentUrl !== initialUrl) {
        console.log(`[${this.platform}] ✓ URL 已更新!`);
        console.log(`[${this.platform}] 新 URL:`, currentUrl);
        console.log(`[${this.platform}] 新路径:`, currentPath);
        return currentUrl;
      }

      await this.sleep(100);
    }

    console.warn(`[${this.platform}] ⚠️ URL 未在 ${timeout}ms 内更新，使用当前 URL`);
    return window.location.href;
  }
}

window.QianwenAdapter = QianwenAdapter;
