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

  gaussianRandom(mean, stdev) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdev + mean;
  }

  clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  humanDelay(min, max) {
    const mean = (min + max) / 2;
    const stdev = (max - min) / 6;
    return this.clamp(this.gaussianRandom(mean, stdev), min, max);
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

  dispatchMouseEventsOnElement(el, type, extra) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + this.gaussianRandom(0, 3);
    const y = rect.top + rect.height / 2 + this.gaussianRandom(0, 2);
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x + window.screenX,
      screenY: y + window.screenY,
      ...(extra || {})
    }));
  }

  async humanClickElement(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2 + this.gaussianRandom(0, rect.width * 0.08);
    const y = rect.top + rect.height / 2 + this.gaussianRandom(0, rect.height * 0.08);

    this.dispatchMouseEventsOnElement(el, 'pointerover', { pointerId: 1, pointerType: 'mouse' });
    this.dispatchMouseEventsOnElement(el, 'pointerenter', { pointerId: 1, pointerType: 'mouse' });
    this.dispatchMouseEventsOnElement(el, 'mouseover', { relatedTarget: el.parentNode });
    this.dispatchMouseEventsOnElement(el, 'mouseenter', { relatedTarget: el.parentNode });
    await this.sleep(this.humanDelay(50, 150));

    for (let i = 0; i < 3; i++) {
      this.dispatchMouseEventsOnElement(el, 'pointermove', { pointerId: 1, pointerType: 'mouse', movementX: this.gaussianRandom(0, 2), movementY: this.gaussianRandom(0, 2) });
      await this.sleep(this.humanDelay(10, 30));
    }

    this.dispatchMouseEventsOnElement(el, 'pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', pressure: 0.5 });
    this.dispatchMouseEventsOnElement(el, 'mousedown', { button: 0, detail: 1 });
    await this.sleep(this.clamp(this.gaussianRandom(80, 30), 40, 200));

    this.dispatchMouseEventsOnElement(el, 'pointerup', { button: 0, pointerId: 1, pointerType: 'mouse', pressure: 0 });
    this.dispatchMouseEventsOnElement(el, 'mouseup', { button: 0, detail: 1 });
    el.click();
    await this.sleep(this.humanDelay(100, 300));
  }

  async humanTypeText(inputBox, text) {
    inputBox.focus();
    await this.sleep(this.humanDelay(150, 350));

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    ).set;

    let currentText = '';
    for (let i = 0; i < text.length; i++) {
      currentText += text[i];
      nativeSetter.call(inputBox, currentText);

      if (i % 2 === 0 || i === text.length - 1) {
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
      }

      let charDelay;
      if (Math.random() < 0.03) {
        charDelay = this.humanDelay(100, 250);  // 偶尔停顿
      } else if (text[i] === ' ' || text[i] === ',' || text[i] === '。' || text[i] === '，' || text[i] === '\n') {
        charDelay = this.humanDelay(20, 60);  // 标点符号
      } else {
        charDelay = this.humanDelay(10, 30);  // 普通字符
      }
      await this.sleep(charDelay);
    }

    nativeSetter.call(inputBox, text);
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    inputBox.dispatchEvent(new Event('change', { bubbles: true }));
    await this.sleep(this.humanDelay(300, 600));
  }

  async sendMessage(content) {
    const timestamp = () => new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp()}] [${this.platform}] ========== 开始发送消息 ==========`);

    const inputBox = await this.waitForElement('textarea.semi-input-textarea', 10000);
    console.log(`[${timestamp()}] [${this.platform}] ✓ 找到输入框`);

    inputBox.focus();
    await this.sleep(this.humanDelay(200, 400));
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已聚焦输入框`);

    await this.humanTypeText(inputBox, content);
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已输入文本`);

    const sendButton = await this.waitForButton();
    console.log(`[${timestamp()}] [${this.platform}] ✓ 找到发送按钮`);

    document.body.setAttribute('data-anti-lazy-waiting', 'true');
    console.log(`[${timestamp()}] [${this.platform}] ✓ 已设置 data-anti-lazy-waiting = true`);

    await this.humanClickElement(sendButton);
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

      targetLink = conversationLinks.find(link => {
        const style = window.getComputedStyle(link);
        return style.fontWeight === '700' || 
               style.fontWeight === 'bold' ||
               link.classList.contains('active') ||
               link.getAttribute('aria-current') === 'page';
      });

      if (!targetLink) {
        const conversationId = conversationUrl.split('/chat/')[1]?.split('/')[0];
        if (conversationId) {
          targetLink = conversationLinks.find(link =>
            link.href.includes(conversationId)
          );
        }
      }

      if (!targetLink && conversationLinks.length > 0) {
        console.warn(`[${this.platform}] ⚠️ 未找到精确匹配会话，使用第一个会话`);
        targetLink = conversationLinks[0];
      }

      if (!targetLink) {
        throw new Error('找不到目标会话链接');
      }
      console.log(`[${this.platform}] ✓ 找到会话链接:`, targetLink.textContent.trim());

      targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(this.humanDelay(400, 800));

      await this.humanClickElement(targetLink);
      await this.sleep(this.humanDelay(300, 700));

      const menuButton = targetLink.querySelector('button');
      if (!menuButton) {
        throw new Error('找不到会话菜单按钮');
      }
      console.log(`[${this.platform}] ✓ 找到菜单按钮`);

      await this.humanClickElement(menuButton);
      await this.sleep(this.humanDelay(500, 1200));

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

      await this.humanClickElement(deleteButton);
      await this.sleep(this.humanDelay(300, 600));

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

      await this.humanClickElement(confirmButton);
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
