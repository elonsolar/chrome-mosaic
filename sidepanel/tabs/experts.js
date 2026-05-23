class ExpertsTab {
  constructor() {
    this.state = {
      experts: [],
      editingExpertId: null,
      models: []
    };
  }

  async init() {
    await this.loadData();
    this.bindEvents();
    this.render();

    window.addEventListener('message', (e) => {
      if (e.data?.action === 'createExpert') {
        this.showExpertModal();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.loadData().then(() => this.render());
      }
    });
  }

  async loadData() {
    try {
      const [experts, models] = await Promise.all([
        this.send({ action: 'getExperts' }),
        this.send({ action: 'getModels' })
      ]);
      this.state.experts = Array.isArray(experts) ? experts : [];
      this.state.models = Array.isArray(models) ? models.filter(m => !m.isVirtual) : [];
    } catch (e) {
      console.error('[ExpertsTab] loadData error:', e);
    }
  }

  send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => resolve(resp));
    });
  }

  bindEvents() {
    document.getElementById('cancelExpertBtn')?.addEventListener('click', () => this.hideExpertModal());
    document.getElementById('saveExpertBtn')?.addEventListener('click', () => this.saveExpert());

    document.getElementById('expertModal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) this.hideExpertModal();
    });
  }

  render() {
    const app = document.getElementById('app');
    if (!app) return;
    this.renderList(app);
  }

  renderList(app) {
    const experts = this.state.experts;

    if (experts.length === 0) {
      app.innerHTML = `
        <div class="experts-toolbar">
          <h3>专家</h3>
          <button class="expert-btn primary" id="addExpertBtn">+ 新建</button>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">🎓</div>
          <h3>还没有专家</h3>
          <p>创建一个专家，为其设计执行流程</p>
          <button class="btn btn-primary" id="emptyAddExpertBtn" style="margin-top:16px;">+ 创建第一个专家</button>
        </div>
      `;
      this.bindListEvents();
      return;
    }

    app.innerHTML = `
      <div class="experts-toolbar">
        <h3>专家 (${experts.length})</h3>
        <button class="expert-btn primary" id="addExpertBtn">+ 新建</button>
      </div>
      <div class="experts-list">
        ${experts.map(expert => {
          const nodeCount = (expert.nodes || []).length;
          return `
            <div class="expert-card" data-id="${expert.id}">
              <div class="expert-card-header">
                <div class="expert-card-icon">${expert.icon || '🤖'}</div>
                <div>
                  <div class="expert-card-name">${this.esc(expert.name)}</div>
                  <div class="expert-card-meta">
                    <span>🔲 ${nodeCount} 个节点</span>
                  </div>
                </div>
              </div>
              ${expert.description ? `<div class="expert-card-desc">${this.esc(expert.description)}</div>` : ''}
              <div class="expert-card-actions">
                <button class="expert-btn primary" data-action="edit" data-id="${expert.id}">编辑</button>
                <button class="expert-btn primary" data-action="editFlow" data-id="${expert.id}">编辑流程</button>
                <button class="expert-btn" data-action="duplicate" data-id="${expert.id}">复制</button>
                <button class="expert-btn danger" data-action="delete" data-id="${expert.id}">删除</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    this.bindListEvents();
  }

  bindListEvents() {
    document.getElementById('addExpertBtn')?.addEventListener('click', () => this.showExpertModal());
    document.getElementById('emptyAddExpertBtn')?.addEventListener('click', () => this.showExpertModal());

    document.querySelectorAll('.expert-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          e.stopPropagation();
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          if (action === 'edit') this.showExpertModal(id);
          else if (action === 'editFlow') this.openDesigner(id);
          else if (action === 'duplicate') this.duplicateExpert(id);
          else if (action === 'delete') this.deleteExpert(id);
        }
      });
    });
  }

  showExpertModal(expertId = null) {
    this.state.editingExpertId = expertId;

    const modal = document.getElementById('expertModal');
    const title = document.getElementById('expertModalTitle');

    if (expertId) {
      const expert = this.state.experts.find(e => e.id === expertId);
      if (!expert) return;
      title.textContent = '编辑专家';
      document.getElementById('expertName').value = expert.name || '';
      document.getElementById('expertIcon').value = expert.icon || '🤖';
      document.getElementById('expertDesc').value = expert.description || '';
    } else {
      title.textContent = '新建专家';
      document.getElementById('expertName').value = '';
      document.getElementById('expertIcon').value = '🤖';
      document.getElementById('expertDesc').value = '';
    }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('expertName')?.focus(), 100);
  }

  hideExpertModal() {
    document.getElementById('expertModal')?.classList.remove('active');
    this.state.editingExpertId = null;
  }

  async saveExpert() {
    const name = document.getElementById('expertName')?.value.trim();
    const icon = document.getElementById('expertIcon')?.value.trim() || '🤖';
    const desc = document.getElementById('expertDesc')?.value.trim();

    if (!name) { alert('请输入名称'); return; }

    try {
      if (this.state.editingExpertId) {
        await this.send({
          action: 'updateExpert',
          expertId: this.state.editingExpertId,
          data: { name, icon, description: desc }
        });
      } else {
        await this.send({
          action: 'createExpert',
          data: { name, icon, description: desc, nodes: [], connections: [] }
        });
      }

      this.hideExpertModal();
      await this.loadData();
      this.render();
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  async deleteExpert(expertId) {
    const expert = this.state.experts.find(e => e.id === expertId);
    if (!expert) return;
    if (!confirm(`确定删除专家"${expert.name}"？`)) return;

    await this.send({ action: 'deleteExpert', expertId });
    await this.loadData();
    this.render();
  }

  async duplicateExpert(expertId) {
    try {
      await this.send({ action: 'duplicateExpert', expertId });
      await this.loadData();
      this.render();
    } catch (e) {
      alert('复制失败: ' + e.message);
    }
  }

  openDesigner(expertId) {
    const url = `../flow-designer/flow-designer.html?expertId=${encodeURIComponent(expertId)}`;
    chrome.tabs.create({ url: chrome.runtime.getURL(url) });
  }

  esc(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

const expertsTab = new ExpertsTab();
expertsTab.init();
