class MessageStore {
  constructor(container) {
    this._msgs = [];
    this._container = container;
    this._confirmedIds = new Set();
    this._counter = 0;
    this._charQueues = {};
  }

  _vid() { return `v${++this._counter}`; }

  get messages() { return this._msgs; }
  get length() { return this._msgs.length; }

  push(msg) {
    msg._viewId = msg._viewId || this._vid();
    this._msgs.push(msg);
    this._appendDom(msg);
    return msg._viewId;
  }

  update(viewId, patch) {
    const i = this._msgs.findIndex(m => m._viewId === viewId);
    if (i < 0) return false;
    Object.assign(this._msgs[i], patch);
    this._updateDom(viewId, this._msgs[i]);
    return true;
  }

  replace(viewId, newMsg) {
    this._discardQueue(viewId);
    const i = this._msgs.findIndex(m => m._viewId === viewId);
    if (i < 0) return false;
    newMsg._viewId = viewId;
    this._msgs[i] = newMsg;
    if (newMsg.id) this._confirmedIds.add(newMsg.id);
    this._updateDom(viewId, newMsg);
    return true;
  }

  findStreaming(memberId) {
    return this._msgs.find(m => m._status === 'streaming' && m.memberId === memberId);
  }

  updateContent(viewId, content) {
    const i = this._msgs.findIndex(m => m._viewId === viewId);
    if (i < 0) return false;
    const msg = this._msgs[i];

    if (msg._status === 'placeholder') {
      msg._status = 'streaming';
      msg.content = msg.content || '';
      this._updateDom(viewId, msg);
    }

    this._enqueueChars(viewId, content);
    return true;
  }

  _enqueueChars(viewId, chars) {
    if (!this._charQueues[viewId]) {
      this._charQueues[viewId] = { pending: '', timer: null };
    }
    this._charQueues[viewId].pending += chars;
    this._startQueueProcessor(viewId);
  }

  _startQueueProcessor(viewId) {
    if (this._charQueues[viewId].timer) return;

    this._charQueues[viewId].timer = setInterval(() => {
      const queue = this._charQueues[viewId];
      if (!queue || !queue.pending) {
        if (queue) {
          clearInterval(queue.timer);
          queue.timer = null;
        }
        return;
      }

      const chars = queue.pending.slice(0, 5);
      queue.pending = queue.pending.slice(5);

      const i = this._msgs.findIndex(m => m._viewId === viewId);
      if (i < 0) { this._discardQueue(viewId); return; }

      const msg = this._msgs[i];
      msg.content = (msg.content || '') + chars;

      if (msg._status === 'streaming') {
        const el = this._el(viewId);
        if (el) {
          const textEl = el.querySelector('.message-text');
          if (textEl) {
            const safe = msg.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            textEl.innerHTML = safe.replace(/\n/g, '<br>') + '<span class="streaming-cursor">|</span>';
          }
        }
      }

      if (typeof scrollToBottom === 'function') scrollToBottom();
    }, 30);
  }

  _discardQueue(viewId) {
    const queue = this._charQueues[viewId];
    if (!queue) return;
    if (queue.timer) {
      clearInterval(queue.timer);
    }
    delete this._charQueues[viewId];
  }

  remove(viewId) {
    this._discardQueue(viewId);
    const i = this._msgs.findIndex(m => m._viewId === viewId);
    if (i < 0) return;
    this._msgs.splice(i, 1);
    const el = this._container.querySelector(`[data-view-id="${viewId}"]`);
    if (el) el.remove();
  }

  find(fn) { return this._msgs.find(fn); }

  findPlaceholder(memberId) {
    return this._msgs.find(m => m._status === 'placeholder' && m.memberId === memberId);
  }

  reset(msgs) {
    Object.keys(this._charQueues).forEach(vid => this._discardQueue(vid));
    this._msgs = msgs.map(m => ({
      ...m, _viewId: m._viewId || this._vid(), _status: 'confirmed'
    }));
    this._confirmedIds = new Set(
      this._msgs.filter(m => m.id).map(m => m.id)
    );
    this._renderFull();
  }

  syncBackend(backendMsgs) {
    for (const msg of backendMsgs) {
      if (!msg.id || this._confirmedIds.has(msg.id)) continue;
      this._confirmedIds.add(msg.id);

      if (msg.isUser) {
        const local = this._msgs.find(
          m => m._status === 'local' && m.isUser && m.content === msg.content
        );
        if (local) {
          Object.assign(local, msg, { _status: 'confirmed' });
          continue;
        }
      }

      if (msg.type === 'member' && msg.memberId) {
        let existing = this.findPlaceholder(msg.memberId);
        if (!existing) existing = this.findStreaming(msg.memberId);
        if (existing) {
          this.replace(existing._viewId, { ...msg, _status: 'confirmed' });
          continue;
        }
      }

      this.push({ ...msg, _status: 'confirmed' });
    }
  }

  _el(viewId) {
    return this._container.querySelector(`[data-view-id="${viewId}"]`);
  }

  _html(msg) {
    if (msg._status === 'placeholder') {
      return buildPlaceholderHtml(msg);
    }
    if (msg._status === 'streaming') {
      return buildMessageHtml(msg, this._msgs.indexOf(msg), true);
    }
    return buildMessageHtml(msg, this._msgs.indexOf(msg));
  }

  _appendDom(msg) {
    const tmp = document.createElement('div');
    tmp.innerHTML = this._html(msg);
    const el = tmp.firstElementChild;
    this._container.appendChild(el);
    bindMessageElement(el, msg);
  }

  _updateDom(viewId, msg) {
    const old = this._el(viewId);
    if (!old) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this._html(msg);
    old.replaceWith(tmp.firstElementChild);
    const el = this._el(viewId);
    if (el) bindMessageElement(el, msg);
  }

  _renderFull() {
    this._container.innerHTML = this._msgs.map(m => this._html(m)).join('');
    this._msgs.forEach(m => {
      const el = this._el(m._viewId);
      if (el) bindMessageElement(el, m);
    });
  }
}
