/**
 * 浮动窗口组件
 * 在当前页面显示多AI回复，不切换标签页
 */

class FloatingWindow {
  constructor(options = {}) {
    this.width = options.width || 400;
    this.height = options.height || 500;
    this.minWidth = 300;
    this.minHeight = 200;
    this.position = options.position || { x: 20, y: 20 };
    this.visible = false;
    this.dragging = false;
    this.resizing = false;
    this.shadowRoot = null;
    this.container = null;

    this.init();
  }

  init() {
    // 创建容器
    this.container = document.createElement('div');
    this.container.id = 'open-chat-floating-window';
    Object.assign(this.container.style, {
      position: 'fixed',
      left: this.position.x + 'px',
      top: this.position.y + 'px',
      width: this.width + 'px',
      height: this.height + 'px',
      zIndex: '2147483647',
      display: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    // 使用 Shadow DOM 避免样式冲突
    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    
    // 添加样式
    this.addStyles();
    
    // 添加内容
    this.addContent();

    // 添加到页面
    document.body.appendChild(this.container);

    // 绑定事件
    this.bindEvents();
  }

  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .window-container {
        width: 100%;
        height: 100%;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .window-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }

      .window-title {
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .window-controls {
        display: flex;
        gap: 8px;
      }

      .control-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .control-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
      }

      .window-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #f8f9fa;
      }

      .message-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .message-item {
        background: white;
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
      }

      .message-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .message-role {
        font-size: 13px;
        font-weight: 600;
        color: #333;
        margin-bottom: 4px;
        cursor: default;
      }

      .message-role.clickable {
        cursor: pointer;
        color: #667eea;
        text-decoration: underline;
        text-decoration-style: dotted;
        text-underline-offset: 2px;
      }

      .message-role.clickable:hover {
        color: #764ba2;
      }

      .message-time {
        font-size: 11px;
        color: #999;
      }

      .message-content {
        font-size: 14px;
        line-height: 1.6;
        color: #333;
        word-wrap: break-word;
        overflow-x: auto;
      }

      .message-content pre {
        background: #f6f8fa;
        border: 1px solid #e1e4e8;
        border-radius: 6px;
        padding: 12px;
        margin: 8px 0;
        overflow-x: auto;
        font-size: 13px;
        line-height: 1.5;
      }

      .message-content code {
        background: #f6f8fa;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 13px;
        color: #24292e;
      }

      .message-content pre code {
        background: transparent;
        padding: 0;
        border: none;
        color: #24292e;
      }

      .message-content p {
        margin: 8px 0;
      }

      .message-content ul, .message-content ol {
        margin: 8px 0;
        padding-left: 24px;
      }

      .message-content li {
        margin: 4px 0;
      }

      .message-content h1, .message-content h2, .message-content h3 {
        margin: 12px 0 8px 0;
        font-weight: 600;
      }

      .message-content h1 { font-size: 18px; }
      .message-content h2 { font-size: 16px; }
      .message-content h3 { font-size: 14px; }

      .message-content blockquote {
        border-left: 3px solid #667eea;
        padding-left: 12px;
        margin: 8px 0;
        color: #6a737d;
      }

      .message-content a {
        color: #667eea;
        text-decoration: none;
      }

      .message-content a:hover {
        text-decoration: underline;
      }

      .user-message {
        background: #e7f3ff;
        border-left: 3px solid #2196F3;
      }

      .user-message .message-role {
        color: #2196F3;
      }

      .ai-message {
        border-left: 3px solid #667eea;
      }

      .error-message {
        background: #ffebee;
        border-left: 3px solid #f44336;
      }

      .error-message .message-role {
        color: #f44336;
      }

      .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 16px;
        height: 16px;
        cursor: se-resize;
        background: linear-gradient(135deg, transparent 50%, #667eea 50%);
      }

      .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #999;
      }

      .empty-state svg {
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        opacity: 0.3;
      }

      ::-webkit-scrollbar {
        width: 8px;
      }

      ::-webkit-scrollbar-track {
        background: #f1f1f1;
      }

      ::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: #555;
      }
    `;

    this.shadowRoot.appendChild(style);

    // 加载marked.js用于markdown渲染
    this.loadMarkdownLibrary();
  }

  loadMarkdownLibrary() {
    // 检查是否已加载
    if (typeof marked !== 'undefined') {
      return;
    }

    // 从本地加载marked.js
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('libs/marked.min.js');
    script.onload = () => {
      console.log('[FloatingWindow] marked.js loaded');
    };
    script.onerror = () => {
      console.warn('[FloatingWindow] Failed to load marked.js');
    };
    document.head.appendChild(script);
  }

  addContent() {
    const container = document.createElement('div');
    container.className = 'window-container';

    container.innerHTML = `
      <div class="window-header">
        <div class="window-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          OpenChat 多AI对话
        </div>
        <div class="window-controls">
          <button class="control-btn" id="minimizeBtn" title="最小化">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="control-btn" id="closeBtn" title="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="window-content" id="messageContainer">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
          </svg>
          <p>暂无消息</p>
          <p style="font-size: 12px; margin-top: 8px;">发送消息后，AI回复将显示在这里</p>
        </div>
      </div>
      <div class="resize-handle" id="resizeHandle"></div>
    `;

    this.shadowRoot.appendChild(container);

    // 缓存DOM引用
    this.messageContainer = this.shadowRoot.getElementById('messageContainer');
    this.minimizeBtn = this.shadowRoot.getElementById('minimizeBtn');
    this.closeBtn = this.shadowRoot.getElementById('closeBtn');
    this.resizeHandle = this.shadowRoot.getElementById('resizeHandle');
    this.windowHeader = this.shadowRoot.querySelector('.window-header');
  }

  bindEvents() {
    // 拖动
    this.windowHeader.addEventListener('mousedown', (e) => {
      if (e.target.closest('.control-btn')) return;
      this.dragging = true;
      this.startDrag(e);
    });

    // 最小化
    this.minimizeBtn.addEventListener('click', () => {
      this.toggle();
    });

    // 关闭
    this.closeBtn.addEventListener('click', () => {
      this.hide();
    });

    // 调整大小
    this.resizeHandle.addEventListener('mousedown', (e) => {
      this.resizing = true;
      this.startResize(e);
    });

    // 全局鼠标事件
    document.addEventListener('mousemove', (e) => {
      if (this.dragging) {
        this.onDrag(e);
      } else if (this.resizing) {
        this.onResize(e);
      }
    });

    document.addEventListener('mouseup', () => {
      this.dragging = false;
      this.resizing = false;
    });
  }

  startDrag(e) {
    this.startX = e.clientX - this.position.x;
    this.startY = e.clientY - this.position.y;
  }

  onDrag(e) {
    this.position.x = e.clientX - this.startX;
    this.position.y = e.clientY - this.startY;

    // 边界检查
    this.position.x = Math.max(0, Math.min(this.position.x, window.innerWidth - this.width));
    this.position.y = Math.max(0, Math.min(this.position.y, window.innerHeight - this.height));

    this.updatePosition();
  }

  startResize(e) {
    this.startWidth = this.width;
    this.startHeight = this.height;
    this.startMouseX = e.clientX;
    this.startMouseY = e.clientY;
  }

  onResize(e) {
    const deltaX = e.clientX - this.startMouseX;
    const deltaY = e.clientY - this.startMouseY;

    this.width = Math.max(this.minWidth, this.startWidth + deltaX);
    this.height = Math.max(this.minHeight, this.startHeight + deltaY);

    this.updateSize();
  }

  updatePosition() {
    this.container.style.left = this.position.x + 'px';
    this.container.style.top = this.position.y + 'px';
  }

  updateSize() {
    this.container.style.width = this.width + 'px';
    this.container.style.height = this.height + 'px';
  }

  show() {
    this.visible = true;
    this.container.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.container.style.display = 'none';
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  // 添加消息
  addMessage(role, content, isUser = false, isError = false, provider = null) {
    // 清除空状态
    const emptyState = this.messageContainer.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const messageItem = document.createElement('div');
    messageItem.className = `message-item ${isUser ? 'user-message' : isError ? 'error-message' : 'ai-message'}`;

    const time = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // 渲染内容（支持markdown）
    const renderedContent = this.renderContent(content, isUser, isError);

    messageItem.innerHTML = `
      <div class="message-header">
        <div class="message-role ${!isUser && provider ? 'clickable' : ''}"
             ${!isUser && provider ? `data-provider="${provider}" title="点击跳转到 ${role} 页面"` : ''}>
          ${isUser ? '用户' : role}
        </div>
        <div class="message-time">${time}</div>
      </div>
      <div class="message-content">${renderedContent}</div>
    `;

    // 绑定点击事件（AI消息）
    if (!isUser && provider) {
      const roleElement = messageItem.querySelector('.message-role');
      roleElement.addEventListener('click', () => {
        console.log(`[FloatingWindow] 点击跳转到 ${provider} (${role})`);
        // 发送消息给background激活标签页
        chrome.runtime.sendMessage({
          action: 'activatePlatformTab'
        });
      });
    }

    this.messageContainer.appendChild(messageItem);
    this.scrollToBottom();

    return messageItem;
  }

  // 渲染内容
  renderContent(content, isUser, isError) {
    if (isError) {
      return this.escapeHtml(content);
    }

    if (isUser) {
      return this.escapeHtml(content);
    }

    // AI消息：尝试markdown渲染
    if (typeof marked !== 'undefined' && marked.parse) {
      try {
        const html = marked.parse(content);
        return html;
      } catch (e) {
        console.warn('[FloatingWindow] Markdown解析失败:', e);
        return this.escapeHtml(content);
      }
    }

    // markdown库未加载，使用简单格式化
    return this.formatSimpleMarkdown(content);
  }

  // 简单markdown格式化（备用方案）
  formatSimpleMarkdown(text) {
    // 转义HTML
    let formatted = this.escapeHtml(text);

    // 先处理代码块 ```code```
    const codeBlocks = [];
    formatted = formatted.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      codeBlocks.push(`<pre><code>${this.escapeHtml(code)}</code></pre>`);
      return `__CODEBLOCK_${codeBlocks.length - 1}__`;
    });

    // 标题 # ## ###
    formatted = formatted
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 行内代码 `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 粗体 **text**
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 斜体 *text*
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 链接 [text](url)
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 列表 - *
    formatted = formatted.replace(/^\s*[-\*]\s+(.*$)/gim, '<li>$1</li>');

    // 换行
    formatted = formatted.replace(/\n/g, '<br>');

    // 恢复代码块
    formatted = formatted.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => codeBlocks[parseInt(index)]);

    return formatted;
  }

  // 清空消息
  clearMessages() {
    this.messageContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
        <p>暂无消息</p>
        <p style="font-size: 12px; margin-top: 8px;">发送消息后，AI回复将显示在这里</p>
      </div>
    `;
  }

  scrollToBottom() {
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 销毁
  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

// 如果在content script环境中，创建全局实例
if (typeof window !== 'undefined') {
  window.OpenChatFloatingWindow = FloatingWindow;
}
