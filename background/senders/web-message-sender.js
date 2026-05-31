class WebMessageSender extends AbstractMessageSender {
  constructor(tabManager, pendingResponses) {
    super();
    this.tabManager = tabManager;
    this.pendingResponses = pendingResponses;
  }

  async send(content, options = {}) {
    const { conversationUrl, conversationId, conversation, webUrl } = options;

    const isNewConversation = !conversationUrl;
    const forceNewTab = isNewConversation;

    console.log(`[WebMessageSender] conversationUrl:`, conversationUrl, '| webUrl:', webUrl, '| forceNewTab:', forceNewTab);

    const response = await this.sendToPlatform(
      'sendMessage',
      { content, conversationId: conversation },
      forceNewTab,
      conversationUrl || webUrl
    );

    return {
      content: response.content || '',
      conversationUrl: response.conversationUrl
    };
  }

  async sendToTab(tabId, message, timeout = 90000) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      throw new Error(`标签页${tabId} 不存在`);
    }

    try {
      await Promise.race([
        chrome.tabs.sendMessage(tabId, { type: 'ping' }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Ping超时')), 10000)
        )
      ]);
    } catch (pingError) {
      throw new Error('Content Script未注入，请刷新AI网站页面或重新加载插件');
    }

    return await Promise.race([
      chrome.tabs.sendMessage(tabId, message),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`发送消息超时(${timeout / 1000}秒)`)), timeout)
      )
    ]);
  }

  async sendToPlatform(messageType, data = {}, forceNewTab = false, url) {
    if (!url) {
      throw new Error('没有配置目标 URL');
    }

    console.log(`[WebMessageSender] sendToPlatform url:`, url, '| forceNewTab:', forceNewTab);

    const tab = await this.tabManager.openPlatformTab(url, forceNewTab);

    try {
      await chrome.tabs.update(tab.id, { active: false });
    } catch (e) {}

    await this.sleep(3000);

    let pingSuccess = false;
    for (let i = 0; i < 5; i++) {
      try {
        const pingResponse = await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
        if (pingResponse && pingResponse.status === 'ok') {
          pingSuccess = true;
          break;
        }
      } catch (pingError) {
        if (i === 0) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [
                'utils/platforms/base-adapter.js',
                'utils/platforms/deepseek-adapter.js',
                'utils/platforms/doubao-adapter.js',
                'utils/platforms/qianwen-adapter.js',
                'utils/platforms/kimi-adapter.js',
                'utils/content-script.js'
              ]
            });
            await this.sleep(3000);
          } catch (injectError) {
            console.warn(`注入content script到 ${url} 失败:`, injectError.message);
          }
        } else {
          await this.sleep(2000);
        }
      }
    }

    if (!pingSuccess) {
      throw new Error('Content Script未就绪，请刷新AI网站页面');
    }

    if (!forceNewTab) {
      await this.sleep(2000);
    }

    const message = {
      type: messageType,
      ...data
    };

    if (messageType === 'sendMessage') {
      const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${url}`;
      const conversationId = data.conversationId || null;

      const responsePromise = new Promise((resolve, reject) => {
        this.pendingResponses.set(messageId, { resolve, reject, conversationId });

        setTimeout(() => {
          if (this.pendingResponses.has(messageId)) {
            this.pendingResponses.delete(messageId);
            reject(new Error('等待AI回复超时（300秒）'));
          }
        }, 300000);
      });

      try {
        await chrome.tabs.sendMessage(tab.id, {
          ...message,
          messageId: messageId,
          conversationId: conversationId
        });
      } catch (sendError) {
        this.pendingResponses.delete(messageId);
        throw sendError;
      }

      return await responsePromise;
    } else {
      return await this.sendToTab(tab.id, message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
