class WebMessageSender extends AbstractMessageSender {
  constructor(tabManager, pendingResponses) {
    super();
    this.tabManager = tabManager;
    this.pendingResponses = pendingResponses;
    this._platformQueues = new Map();
  }

  async _acquirePlatformLock(url) {
    const hostname = new URL(url).hostname;
    const prev = this._platformQueues.get(hostname) || Promise.resolve();

    let release;
    const pending = new Promise(resolve => { release = resolve; });
    this._platformQueues.set(hostname, prev.then(() => pending));

    await prev;
    return release;
  }

  async send(content, options = {}) {
    const { conversationUrl, conversationId, conversation, webUrl, onChunk } = options;

    const isNewConversation = !conversationUrl;
    const forceNewTab = isNewConversation;

    console.log(`[WebMessageSender] conversationUrl:`, conversationUrl, '| webUrl:', webUrl, '| forceNewTab:', forceNewTab);

    const response = await this.sendToPlatform(
      'sendMessage',
      { content, conversationId: conversationId },
      forceNewTab,
      conversationUrl || webUrl,
      onChunk
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

  async sendToPlatform(messageType, data = {}, forceNewTab = false, url, onChunk = null) {
    if (!url) {
      throw new Error('没有配置目标 URL');
    }

    const release = await this._acquirePlatformLock(url);
    const tab = await this.tabManager.openPlatformTab(url, forceNewTab);
    let success = false;
    try {

    console.log(`[WebMessageSender] sendToPlatform url:`, url, '| forceNewTab:', forceNewTab);

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
        this.pendingResponses.set(messageId, { resolve, reject, conversationId, onChunk });

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

      success = true;
      return await responsePromise;
    } else {
      success = true;
      return await this.sendToTab(tab.id, message);
    }
    } finally {
      if (!success) {
        chrome.tabs.remove(tab.id).catch(() => {});
      }
      release();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
