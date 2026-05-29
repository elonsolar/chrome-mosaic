class OpenAIAdapter extends BasePlatformAdapter {
  constructor() {
    super('openai', {
      inputBox: 'textarea',
      sendButton: 'button',
      messageList: '[class*="message"]',
      messageSelector: '[class*="message"]',
      userInput: '[class*="user"]',
      aiResponse: '[class*="assistant"]',
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

  async sendMessage(content) {
    const inputBox = await this.waitForElement('textarea', 10000);
    inputBox.focus();

    inputBox.value = content;
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    await this.sleep(1000);

    inputBox.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      compose: true
    }));

    await this.sleep(1000);

    const sendButtons = document.querySelectorAll('button, [role="button"]');
    for (const btn of sendButtons) {
      const text = btn.textContent?.trim().toLowerCase();
      if (text.includes('发送') || text.includes('send') || text.includes('提交') || text === '') {
        if (!btn.disabled && btn.offsetParent !== null) {
          btn.click();
          await this.sleep(500);
          break;
        }
      }
    }
  }

  async processSendMessage(content, messageId, conversationId = null) {
    try {
      await this.sendMessage(content);

      const response = await this.waitForAIResponse();

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
    }
  }

  async waitForAIResponse() {
    return new Promise((resolve, reject) => {
      let lastContent = '';
      let observer = null;
      let timeoutHandle = null;
      const WATCHDOG_TIMEOUT = 10000;

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

      const checkNewMessage = () => {
        let messageElements = document.querySelectorAll('[data-message-id]');

        if (messageElements.length === 0) {
          messageElements = document.querySelectorAll('.ds-message');
          if (messageElements.length === 0) return null;
        }

        const messages = Array.from(messageElements);
        let aiMessages = [];

        if (messages[0]?.hasAttribute('data-message-id')) {
          aiMessages = messages.filter((_, index) => index % 2 === 1);
        } else {
          aiMessages = messages.filter(msg => {
            const markdown = msg.querySelector('.ds-markdown');
            if (markdown) {
              const text = markdown.textContent || '';
              return !text.trim().startsWith('User:') && !text.trim().startsWith('用户:');
            }
            return false;
          });
        }

        if (aiMessages.length === 0) return null;

        const lastAIMessage = aiMessages[aiMessages.length - 1];
        let rawText = (lastAIMessage.innerText || lastAIMessage.textContent || '').trim();

        if (!rawText || rawText.length < 10) return null;

        return rawText;
      };

      const cleanup = (content) => {
        if (observer) observer.disconnect();
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const finalContent = content.replace(/\[\[<<>>\]\]/g, '').trim();
        resolve(finalContent);
      };

      observer = new MutationObserver(() => {
        resetWatchdog();
        const content = checkNewMessage();
        if (content && content !== lastContent) {
          lastContent = content;
          // 响应内容更新，继续等待
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
}

window.OpenAIAdapter = OpenAIAdapter;
