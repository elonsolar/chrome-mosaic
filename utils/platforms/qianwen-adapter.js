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
    console.log(`[${this.platform}] ========== processSendMessage ==========`);
    console.log(`[${this.platform}] content:`, content);
    console.log(`[${this.platform}] messageId:`, messageId);
    console.log(`[${this.platform}] conversationId:`, conversationId);

    window.isSendingMessage = true;
    console.log(`[${this.platform}] ✓ 已设置 isSendingMessage = true`);

    try {
      await this.sendMessage(content);
      console.log(`[${this.platform}] ✓ 消息已发送到输入框`);

      const response = await this.waitForAIResponse();
      console.log(`[${this.platform}] ✓ 收到 AI 回复，长度:`, response?.length || 0);

      // 等待 URL 更新（Qianwen 发送消息后会导航到新会话）
      const conversationUrl = await this.waitForUrlUpdate();
      console.log(`[${this.platform}] ✓ URL 已更新:`, conversationUrl);

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
              conversationUrl: conversationUrl
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

      const checkNewMessage = (mutations) => {
        console.log(`[${this.platform}] [${new Date().toLocaleTimeString()}] MutationObserver 触发`);
        const messageContainer = document.querySelector('.message-list-content-container');
        if (!messageContainer) return null;

        const chatRounds = messageContainer.querySelectorAll('.chat-round');
        if (chatRounds.length === 0) return null;

        const lastRound = chatRounds[chatRounds.length - 1];
        const answerCard = lastRound?.querySelector('.answer-common-card');
        
        if (!answerCard) return null;

        const clonedMessage = answerCard.cloneNode(true);

        const thinkSelectors = [
          '[data-card_name="deep_think"]', '.thinking-content', '.think-process', '[class*="think"]',
          '[class*="thought"]', '.qk-think', '.think-container', '.thinking', '.thought'
        ];

        thinkSelectors.forEach(selector => {
          const elements = clonedMessage.querySelectorAll(selector);
          elements.forEach(el => el.remove());
        });

        const markdownElement = clonedMessage.querySelector('.qk-markdown');

        if (!markdownElement) return null;

        const clone = markdownElement.cloneNode(true);
        
        // 处理代码块
        const codeBlocks = clone.querySelectorAll('pre');
        
        codeBlocks.forEach(block => {
          const codeEl = block.querySelector('code');
          const codeText = (codeEl || block)?.textContent?.trim() || '';
          
          if (codeText.length > 0) {
            let lang = '';
            if (codeEl) {
              const langMatch = (codeEl.className || '').match(/language-(\w+)/);
              lang = langMatch ? langMatch[1] : '';
            }
            const markdownCode = `\`\`\`${lang}\n${codeText}\n\`\`\``;
            block.replaceWith(document.createTextNode(markdownCode));
          } else {
            block.remove();
          }
        });

        const removeSelectors = [
          '[class*="video-note"]',
          '[class*="card_video"]',
          '[class*="search-result"]',
          '[class*="recommend"]',
          '[class*="source-map"]',
          'style',
          'script'
        ];
        removeSelectors.forEach(sel => {
          clone.querySelectorAll(sel).forEach(el => el.remove());
        });

        const extractTextWithNewlines = (node) => {
          const blockTags = new Set(['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'TD', 'TH']);
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

        let rawText = extractTextWithNewlines(clone).trim();

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
