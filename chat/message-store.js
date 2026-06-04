class MessageStore {
  constructor(container) {
    this._msgs = [];
    this._container = container;
    this._confirmedIds = new Set();
    this._counter = 0;
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
    const i = this._msgs.findIndex(m => m._viewId === viewId);
    if (i < 0) return false;
    newMsg._viewId = viewId;
    this._msgs[i] = newMsg;
    if (newMsg.id) this._confirmedIds.add(newMsg.id);
    this._updateDom(viewId, newMsg);
    return true;
  }

  remove(viewId) {
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
        const ph = this.findPlaceholder(msg.memberId);
        if (ph) {
          this.replace(ph._viewId, { ...msg, _status: 'confirmed' });
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
