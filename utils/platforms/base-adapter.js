class BasePlatformAdapter {
  constructor(platform, selectors) {
    this.platform = platform;
    this.selectors = selectors;
  }

  async sendMessage(content) {
    throw new Error(`${this.platform}: sendMessage() 必须由子类实现`);
  }

  async processSendMessage(content, messageId) {
    throw new Error(`${this.platform}: processSendMessage() 必须由子类实现`);
  }

  async newChat() {
    const newChatButton = document.querySelector(this.selectors.newChatButton);
    if (!newChatButton) {
      throw new Error('找不到新对话按钮');
    }
    newChatButton.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  _startStreamingCheck(messageId, conversationId) {
    let lastContent = '';
    return setInterval(() => {
      const current = document.body.getAttribute('data-anti-lazy-stream-content') || '';
      if (current && current !== lastContent) {
        const delta = lastContent ? current.slice(lastContent.length) : current;
        lastContent = current;
        if (delta) {
          chrome.runtime.sendMessage({
            type: 'aiChunk',
            messageId,
            conversationId,
            content: delta,
            fullContent: current
          }).catch(() => {});
        }
      }
    }, 500);
  }
}
