class ProgressNotificationService {
  constructor(floatWindowService) {
    this.floatWindowService = floatWindowService;
  }

  async notify(conversationId, progress) {
    await this._notifyFloatWindow(progress);
    await this._notifyChatUI(conversationId, progress);
  }

  async _notifyFloatWindow(progress) {
    if (!this.floatWindowService) return;

    try {
      await this.floatWindowService.addMessage({
        role: '系统',
        content: this._formatProgressMessage(progress),
        isUser: false,
        isError: false
      });
    } catch (error) {
      console.error('[ProgressNotifier] 浮窗通知失败:', error);
    }
  }

  async _notifyChatUI(conversationId, progress) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url.includes('chat/chat.html')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'flowExecutionProgress',
            progress: progress,
            conversationId: conversationId
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[ProgressNotifier] Chat UI 通知失败:', error);
    }
  }

  _formatProgressMessage(progress) {
    if (progress.details && progress.details.length > 0) {
      const details = progress.details.map(d => `${d.entityName}: ${d.message || '执行中...'}`).join('\n');
      return `总体进度: ${progress.percentage || 0}%\n${details}`;
    }

    if (progress.type === 'iteration') {
      const current = progress.current || 0;
      const max = progress.max || 1;
      const message = progress.message || '';
      return `执行进度：第${current}/${max}轮 ${message}`;
    } else if (progress.type === 'percentage') {
      return `执行中... ${progress.percentage || 0}%`;
    } else {
      return progress.message || '执行中...';
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressNotificationService;
}
