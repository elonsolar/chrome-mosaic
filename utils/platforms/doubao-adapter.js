class DoubaoAdapter extends BasePlatformAdapter {
  constructor() {
    super('doubao', {
      inputBox: 'textarea.semi-input-textarea',
      sendButton: '.send-btn-wrapper button',
      messageList: '[class*="message-list"]',
      messageSelector: '[class*="flow-markdown-body"]',
      userInput: '[class*="whitespace-pre-wrap"]',
      aiResponse: '[class*="flow-markdown-body"]',
      newChatButton: '[class*="new"]'
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

  async waitForButton() {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const btn = document.querySelector('.send-btn-wrapper button');
      if (btn && !btn.disabled && btn.offsetParent !== null) return btn;
      await this.sleep(200);
    }
    throw new Error('发送按钮未找到或已禁用');
  }

  async sendMessage(content) {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp()}] [${this.platform}] ========== 开始发送消息 ==========`);
    console.log(`[${timestamp()}] [${this.platform}] 消息内容:`, content);

    const inputBox = await this.waitForElement('textarea.semi-input-textarea', 10000);
    console.log(`[${timestamp()}] [${this.platform}] ✓ 找到输入框`);

    inputBox.focus();
    await this.sleep(200);

    // 绕过 React 受控组件，直接调用原生 setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(inputBox, content);
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    inputBox.dispatchEvent(new Event('change', { bubbles: true }));
    await this.sleep(500);

    // 等待发送按钮可用
    const sendButton = await this.waitForButton();
    console.log(`[${timestamp()}] [${this.platform}] ✓ 找到发送按钮`);

    // 点击发送按钮前，通过 DOM 属性通知 MAIN world 的 fetch 拦截器
    document.body.setAttribute('data-anti-lazy-waiting', 'true');
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已设置 data-anti-lazy-waiting = true（点击前）`);

    // 点击发送按钮
    sendButton.click();
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已点击发送按钮`);

    await this.sleep(1000);
  }

  async processSendMessage(content, messageId, conversationId = null) {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp()}] [${this.platform}] ========== processSendMessage ==========`);
    console.log(`[${timestamp()}] [${this.platform}] content:`, content);
    console.log(`[${timestamp()}] [${this.platform}] messageId:`, messageId);
    console.log(`[${timestamp()}] [${this.platform}] conversationId:`, conversationId);

    // 发送前记录消息数量
    const msgList = document.querySelector('[class*="message-list"]');
    const beforeCount = msgList ? msgList.querySelectorAll('.v_list_row').length : 0;
    console.log(`[${timestamp()}] [${this.platform}] 发送前消息数量: ${beforeCount}`);
    window.__antiLazyMsgCountBefore = beforeCount;

    window.isSendingMessage = true;
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已设置 isSendingMessage = true`);

    try {
      await this.sendMessage(content);  // sendMessage 内部会在点击前设置 data-anti-lazy-waiting = true
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
      window.__antiLazyUserSending = false;
      window.__antiLazyWaitingForReply = false;
      document.body.setAttribute('data-anti-lazy-waiting', 'false');
      chrome.runtime.sendMessage({
        type: 'aiResponse',
        platform: this.platform,
        messageId: messageId,
        conversationId: conversationId,
        error: error.message
      });
    } finally {
      window.isSendingMessage = false;
      window.__antiLazyUserSending = false;
      window.__antiLazyWaitingForReply = false;
      document.body.setAttribute('data-anti-lazy-waiting', 'false');
      const ts = timestamp();
      console.log(`[${ts}] [${this.platform}] ✓ 消息处理完成，已清除所有标志`);
    }
  }

  formatCodeBlocks(element) {
    const clonedElement = element.cloneNode(true);
    const codeBlocks = clonedElement.querySelectorAll('pre');

    codeBlocks.forEach(block => {
      const codeEl = block.querySelector('code');
      const langClass = (codeEl || block).className || '';
      const langMatch = langClass.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : '';

      const codeText = (codeEl || block).textContent?.trim() || '';

      if (codeText.length > 0) {
        const markdownCode = `\`\`\`${lang}\n${codeText}\n\`\`\``;
        block.replaceWith(document.createTextNode(markdownCode));
      } else {
        block.remove();
      }
    });

    return clonedElement;
  }

  extractTextWithNewlines(node) {
    const blockTags = new Set(['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'UL', 'OL']);
    const headingTags = { 'H1': '# ', 'H2': '## ', 'H3': '### ', 'H4': '#### ', 'H5': '##### ', 'H6': '###### ' };
    let result = '';

    const extractTable = (tableNode) => {
      const rows = [];
      const tableRows = tableNode.querySelectorAll('tr');
      tableRows.forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(cell => {
          cells.push(cell.textContent.trim().replace(/\|/g, '\\|'));
        });
        rows.push(cells);
      });

      if (rows.length === 0) return '';

      const maxCols = Math.max(...rows.map(r => r.length));
      let table = '\n';

      rows.forEach((row, i) => {
        while (row.length < maxCols) row.push('');
        table += '| ' + row.join(' | ') + ' |\n';
        if (i === 0) {
          table += '| ' + row.map(() => '---').join(' | ') + ' |\n';
        }
      });

      return table + '\n';
    };

    const extractList = (listNode, isOrdered) => {
      const items = listNode.querySelectorAll('li');
      if (items.length === 0) return '';

      let list = '\n';
      items.forEach(item => {
        const text = item.textContent.trim();
        if (isOrdered) {
          list += `1. ${text}\n`;
        } else {
          list += `- ${text}\n`;
        }
      });

      return list + '\n';
    };

    const walk = (node, inBlock) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const isBlock = blockTags.has(node.tagName);
        const isHeading = headingTags[node.tagName];

        // 处理分隔线
        if (node.tagName === 'HR') {
          result += '\n---\n\n';
          return;
        }

        // 处理列表
        if (node.tagName === 'UL' || node.tagName === 'OL') {
          if (result.length > 0 && !result.endsWith('\n')) {
            result += '\n';
          }
          result += extractList(node, node.tagName === 'OL');
          return;
        }

        if (node.tagName === 'BR') {
          // 忽略连续的BR（布局用），只保留单个换行
          if (!result.endsWith('\n')) {
            result += '\n';
          }
        } else if (node.tagName === 'TABLE') {
          result += extractTable(node);
        } else if (isHeading) {
          if (result.length > 0 && !result.endsWith('\n')) {
            result += '\n';
          }
          result += isHeading;
          for (let child of node.childNodes) {
            walk(child, false);
          }
          if (!result.endsWith('\n')) {
            result += '\n';
          }
        } else if (node.tagName === 'STRONG' || node.tagName === 'B') {
          // 保留文本强调
          result += '**';
          for (let child of node.childNodes) {
            walk(child, false);
          }
          result += '**';
        } else if (node.tagName === 'BLOCKQUOTE') {
          // 保留引用
          if (result.length > 0 && !result.endsWith('\n')) {
            result += '\n';
          }
          result += '> ';
          for (let child of node.childNodes) {
            walk(child, false);
          }
          result += '\n\n';
        } else {
          if (isBlock && inBlock && result.length > 0 && !result.endsWith('\n')) {
            result += '\n';
          }

          for (let child of node.childNodes) {
            walk(child, isBlock || inBlock);
          }

          // 跳过空DIV和布局用DIV（不添加换行符）
          const isLayoutDiv = node.tagName === 'DIV' && (
            !node.textContent.trim() ||
            node.className.includes('container-') ||
            node.className.includes('wrapper-') ||
            node.className.includes('md-box-line-break')
          );
          if (isBlock && !isLayoutDiv && !result.endsWith('\n')) {
            result += '\n';
          }
        }
      }
    };

    walk(node, false);
    return result;
  }

  async waitForAIResponse() {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp()}] [${this.platform}] ========== 开始等待 AI 回复 ==========`);

    const beforeCount = window.__antiLazyMsgCountBefore || 0;
    console.log(`[${timestamp()}] [${this.platform}] 等待消息数 >= ${beforeCount + 2}`);

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

        // 只检查 fetch 拦截器是否已完成
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

      const allLinks = document.querySelectorAll('a[href*="/chat/"]');
      const conversationLinks = Array.from(allLinks).filter(link =>
        link.id.startsWith('conversation_') || !link.className.includes('group/sidebar_nav_item')
      );
      let targetLink = null;

      // 方案1：通过活动状态查找（仅在历史对话链接中）
      targetLink = conversationLinks.find(link => {
        const style = window.getComputedStyle(link);
        return style.fontWeight === '700' || 
               style.fontWeight === 'bold' ||
               link.classList.contains('active') ||
               link.getAttribute('aria-current') === 'page';
      });

      // 方案2：通过URL匹配兜底
      if (!targetLink) {
        const conversationId = conversationUrl.split('/chat/')[1]?.split('/')[0];
        if (conversationId) {
          targetLink = conversationLinks.find(link =>
            link.href.includes(conversationId)
          );
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

      targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(500);

      const rect = targetLink.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const eventTypes = ['pointerenter', 'pointerover', 'pointermove', 'mouseenter', 'mouseover', 'mousemove'];
      for (const eventType of eventTypes) {
        const event = new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y
        });
        targetLink.dispatchEvent(event);
      }
      await this.sleep(500);

      const menuButton = targetLink.querySelector('button');
      if (!menuButton) {
        throw new Error('找不到会话菜单按钮');
      }
      console.log(`[${this.platform}] ✓ 找到菜单按钮`);

      const btnRect = menuButton.getBoundingClientRect();
      const bx = btnRect.left + btnRect.width / 2;
      const by = btnRect.top + btnRect.height / 2;

      menuButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, view: window,
        clientX: bx, clientY: by, pointerId: 1, pointerType: 'mouse'
      }));
      menuButton.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, view: window,
        clientX: bx, clientY: by, pointerId: 1, pointerType: 'mouse'
      }));
      menuButton.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: bx, clientY: by
      }));
      await this.sleep(1000);

      const deleteMenuItem = await this.waitForElement('[role="menuitem"]', 3000);
      const menuItems = document.querySelectorAll('[role="menuitem"]');
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
      await this.sleep(500);

      const dialog = await this.waitForElement('[role="dialog"]', 3000);
      const dialogButtons = dialog.querySelectorAll('button');
      let confirmButton = null;

      for (const btn of dialogButtons) {
        if (btn.textContent.includes('删除')) {
          confirmButton = btn;
          break;
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

window.DoubaoAdapter = DoubaoAdapter;
