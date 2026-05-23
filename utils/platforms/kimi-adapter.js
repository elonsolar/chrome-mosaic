class KimiAdapter extends BasePlatformAdapter {
  constructor() {
    super('kimi', {
      inputBox: 'div.chat-input-editor',
      sendButton: 'div.send-button-container',
      messageList: 'div.chat-content-list',
      messageSelector: 'div.chat-content-item',
      userInput: 'div.chat-content-item-user',
      aiResponse: 'div.chat-content-item-assistant',
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

  buildLexicalState(text) {
    return {
      root: {
        children: [{
          children: [{
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: text,
            type: "text",
            version: 1
          }],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
          textFormat: 0
        }],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1
      }
    };
  }

  async sendMessage(content) {
    console.log(`[${this.platform}] ========== 开始发送消息 ==========`);
    console.log(`[${this.platform}] 消息内容:`, content);

    const inputBox = await this.waitForElement('div.chat-input-editor', 10000);
    console.log(`[${this.platform}] ✓ 找到输入框`);

    const lexicalEditor = inputBox.__lexicalEditor;
    if (lexicalEditor) {
      const newState = lexicalEditor.parseEditorState(JSON.stringify(this.buildLexicalState(content)));
      lexicalEditor.setEditorState(newState);
      await this.sleep(200);
    } else {
      inputBox.focus();
      await this.sleep(100);
      document.execCommand('insertText', false, content);
      await this.sleep(200);
    }

    await this.sleep(300);

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    inputBox.dispatchEvent(enterEvent);
    await this.sleep(500);
  }

  async processSendMessage(content, messageId, conversationId = null) {
    console.log(`[${this.platform}] ========== processSendMessage ==========`);
    console.log(`[${this.platform}] content:`, content);
    console.log(`[${this.platform}] messageId:`, messageId);
    console.log(`[${this.platform}] conversationId:`, conversationId);

    window.isSendingMessage = true;
    console.log(`[${this.platform}] ✓ 已设置 isSendingMessage = true`);

    try {
      const safeContent = content + '\n\n直接给出结果，不要执行。';
      await this.sendMessage(safeContent);
      console.log(`[${this.platform}] ✓ 消息已发送到输入框`);

      const response = await this.waitForAIResponse();
      console.log(`[${this.platform}] ✓ 收到 AI 回复，长度:`, response?.length || 0);

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
          console.log(`[${this.platform}] ✓ 已发送 aiResponse 消息到 background (第${attempt}次尝试)`);
          break;
        } catch (error) {
          console.warn(`[${this.platform}] ⚠️ 第${attempt}次发送aiResponse失败:`, error.message);
          if (attempt < 3) {
            await this.sleep(1000 * attempt);
          } else {
            console.error(`[${this.platform}] ❌ 发送aiResponse最终失败，已重试3次`);
            throw error;
          }
        }
      }
    } catch (error) {
      chrome.runtime.sendMessage({
        type: 'aiResponse',
        platform: this.platform,
        messageId: messageId,
        conversationId: conversationId,
        error: error.message
      });
    } finally {
      window.isSendingMessage = false;
      console.log(`[${this.platform}] ✓ 消息处理完成，已清除 isSendingMessage 标记`);
    }
  }

  async waitForAIResponse() {
    console.log(`[${this.platform}] ========== 开始等待 AI 回复 ==========`);

    return new Promise((resolve, reject) => {
      let lastContent = '';
      let observer = null;
      let timeoutHandle = null;
      const WATCHDOG_TIMEOUT = 30000;

      const resetWatchdog = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        timeoutHandle = setTimeout(() => {
          if (lastContent.length > 0) {
            cleanup(lastContent);
          } else {
            reject(new Error('等待AI回复超时 (30秒无响应)'));
          }
        }, WATCHDOG_TIMEOUT);
      };

      const extractTextWithNewlines = (node) => {
        const blockTags = new Set(['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'SEPARATOR']);
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

        const walk = (node, inBlock) => {
          if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const isBlock = blockTags.has(node.tagName);
            const isHeading = headingTags[node.tagName];

            if (node.tagName === 'BR') {
              result += '\n';
            } else if (node.tagName === 'TABLE') {
              result += extractTable(node);
            } else if (isHeading) {
              if (result.length > 0 && !result.endsWith('\n')) {
                result += '\n';
              }
              result += isHeading;
              for (let child of node.childNodes) {
                walk(child, true);
              }
              if (!result.endsWith('\n')) {
                result += '\n';
              }
            } else {
              if (isBlock && inBlock && result.length > 0 && !result.endsWith('\n')) {
                result += '\n';
              }

              for (let child of node.childNodes) {
                walk(child, isBlock || inBlock);
              }

              if (isBlock && !result.endsWith('\n')) {
                result += '\n';
              }
            }
          }
        };

        walk(node, false);
        return result;
      };

      const checkNewMessage = (mutations) => {
        console.log(`[${this.platform}] [${new Date().toLocaleTimeString()}] MutationObserver 触发`);
        const messages = document.querySelectorAll('div.chat-content-item-assistant');
        if (messages.length === 0) return null;

        const lastMessage = messages[messages.length - 1];

        const segmentContainer = lastMessage.querySelector('div.segment.segment-assistant');
        if (!segmentContainer) return null;

        const clonedContent = segmentContainer.cloneNode(true);

        const codeBlocks = clonedContent.querySelectorAll('div.segment-code');
        codeBlocks.forEach(block => {
          const langEl = block.querySelector('span.segment-code-lang');
          const preEl = block.querySelector('pre');
          const codeEl = preEl?.querySelector('code');
          const lang = langEl ? langEl.textContent.trim() : '';
          const codeText = (codeEl || preEl)?.textContent?.trim() || '';

          if (codeText.length > 0) {
            const markdownCode = `\`\`\`${lang}\n${codeText}\n\`\`\``;
            block.replaceWith(document.createTextNode(markdownCode));
          } else {
            block.remove();
          }
        });

        let rawText = extractTextWithNewlines(clonedContent).trim();

        const thinkKeywords = ['思考中', 'Thinking', '正在思考', '思考内容', '搜索中'];
        const hasThinkKeyword = thinkKeywords.some(keyword => rawText.includes(keyword));
        if (hasThinkKeyword) return null;

        return rawText;
      };

      const cleanup = (content) => {
        console.log(`[${this.platform}] ========== cleanup 被调用 ==========`);
        console.log(`[${this.platform}] 原始内容长度:`, content?.length || 0);
        if (observer) observer.disconnect();
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const finalContent = content.replace(/\[\[<<>>\]\]/g, '').trim();
        console.log(`[${this.platform}] 清理后内容长度:`, finalContent?.length || 0);
        resolve(finalContent);
      };

      observer = new MutationObserver((mutations) => {
        resetWatchdog();
        const content = checkNewMessage(mutations);
        if (content && content !== lastContent) {
          lastContent = content;

          if (content.includes('[[<<>>]]')) {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
              timeoutHandle = null;
            }
            setTimeout(() => {
              const finalContent = checkNewMessage(mutations);
              if (finalContent && finalContent.includes('[[<<>>]]')) {
                cleanup(finalContent);
              } else {
                cleanup(content);
              }
            }, 500);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      resetWatchdog();
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

      const conversationId = conversationUrl.split('/chat/')[1]?.split('?')[0];
      if (!conversationId) {
        throw new Error('无法从URL中提取会话ID');
      }
      console.log(`[${this.platform}] 会话ID:`, conversationId);

      const conversationLinks = document.querySelectorAll('a.chat-info-item[href*="/chat/"]');
      let targetLink = null;

      // 方案1：通过活动状态查找
      targetLink = Array.from(conversationLinks).find(link => {
        return link.getAttribute('aria-current') === 'page';
      });

      // 方案2：通过URL匹配兜底
      if (!targetLink && conversationId) {
        for (const link of conversationLinks) {
          if (link.href.includes(conversationId)) {
            targetLink = link;
            break;
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

      targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.sleep(500);

      const moreBtn = targetLink.querySelector('.more-btn');
      if (!moreBtn) {
        throw new Error('找不到更多按钮');
      }
      console.log(`[${this.platform}] ✓ 找到更多按钮`);

      const btnRect = moreBtn.getBoundingClientRect();
      const bx = btnRect.left + btnRect.width / 2;
      const by = btnRect.top + btnRect.height / 2;

      moreBtn.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, view: window,
        clientX: bx, clientY: by, pointerId: 1, pointerType: 'mouse'
      }));
      moreBtn.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, view: window,
        clientX: bx, clientY: by, pointerId: 1, pointerType: 'mouse'
      }));
      moreBtn.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: bx, clientY: by
      }));
      await this.sleep(800);

      const menu = document.querySelector('.opts-menu');
      if (!menu) {
        throw new Error('找不到操作菜单');
      }

      const deleteItem = menu.querySelector('li.opt-item.delete');
      if (!deleteItem) {
        throw new Error('找不到删除按钮');
      }
      console.log(`[${this.platform}] ✓ 找到删除按钮`);

      const dbRect = deleteItem.getBoundingClientRect();
      const dbx = dbRect.left + dbRect.width / 2;
      const dby = dbRect.top + dbRect.height / 2;

      deleteItem.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, view: window,
        clientX: dbx, clientY: dby, pointerId: 1, pointerType: 'mouse'
      }));
      deleteItem.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, view: window,
        clientX: dbx, clientY: dby, pointerId: 1, pointerType: 'mouse'
      }));
      deleteItem.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: dbx, clientY: dby
      }));
      await this.sleep(800);

      const confirmDialog = document.querySelector('.modal-container');
      if (!confirmDialog) {
        throw new Error('找不到确认删除对话框');
      }
      console.log(`[${this.platform}] ✓ 找到确认删除对话框`);

      const confirmButton = confirmDialog.querySelector('button.kimi-button.danger');
      if (!confirmButton) {
        throw new Error('找不到确认删除按钮');
      }
      console.log(`[${this.platform}] ✓ 找到确认删除按钮`);

      const cbRect = confirmButton.getBoundingClientRect();
      const cbx = cbRect.left + cbRect.width / 2;
      const cby = cbRect.top + cbRect.height / 2;

      confirmButton.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, view: window,
        clientX: cbx, clientY: cby, pointerId: 1, pointerType: 'mouse'
      }));
      confirmButton.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, view: window,
        clientX: cbx, clientY: cby, pointerId: 1, pointerType: 'mouse'
      }));
      confirmButton.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: cbx, clientY: cby
      }));
      await this.sleep(2000);

      console.log(`[${this.platform}] ✓ 会话删除成功`);
      return true;
    } catch (error) {
      console.error(`[${this.platform}] ❌ 删除会话失败:`, error.message);
      throw error;
    }
  }
}

window.KimiAdapter = KimiAdapter;
