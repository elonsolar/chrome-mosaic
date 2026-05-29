const TestRunner = {
  results: {},

  init() {
    this.loadResults();
    this.bindEvents();
    this.updateStats();
    this.applyFilter('all');
  },

  loadResults() {
    const key = this.getStorageKey();
    const saved = localStorage.getItem(key);
    this.results = saved ? JSON.parse(saved) : {};
  },

  saveResults() {
    const key = this.getStorageKey();
    localStorage.setItem(key, JSON.stringify(this.results));
  },

  getStorageKey() {
    const page = location.pathname.split('/').pop().replace('.html', '');
    return `tc-${page}`;
  },

  bindEvents() {
    document.querySelectorAll('.scenario-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open');
      });
    });

    document.querySelectorAll('.btn-pass').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.scenario').dataset.id;
        this.markPass(id);
      });
    });

    document.querySelectorAll('.btn-fail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.scenario').dataset.id;
        this.markFail(id);
      });
    });

    document.querySelectorAll('.btn-reset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.scenario').dataset.id;
        this.resetStatus(id);
      });
    });

    document.querySelectorAll('.notes textarea').forEach(textarea => {
      textarea.addEventListener('input', () => {
        const id = textarea.closest('.scenario').dataset.id;
        if (!this.results[id]) this.results[id] = {};
        this.results[id].notes = textarea.value;
        this.saveResults();
      });
    });

    document.querySelectorAll('.filters button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyFilter(btn.dataset.filter);
      });
    });

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.export());
    }

    const expandAllBtn = document.getElementById('expandAll');
    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.scenario').forEach(s => s.classList.add('open'));
      });
    }

    const collapseAllBtn = document.getElementById('collapseAll');
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.scenario').forEach(s => s.classList.remove('open'));
      });
    }
  },

  markPass(id) {
    this.results[id] = { ...this.results[id], status: 'pass', time: new Date().toISOString() };
    this.saveResults();
    this.applyStatus(id);
    this.updateStats();
  },

  markFail(id) {
    this.results[id] = { ...this.results[id], status: 'fail', time: new Date().toISOString() };
    this.saveResults();
    this.applyStatus(id);
    this.updateStats();
  },

  resetStatus(id) {
    if (this.results[id]) {
      delete this.results[id].status;
      delete this.results[id].time;
    }
    this.saveResults();
    this.applyStatus(id);
    this.updateStats();
  },

  applyStatus(id) {
    const el = document.querySelector(`.scenario[data-id="${id}"]`);
    if (!el) return;
    const status = this.results[id]?.status || 'pending';
    el.className = `scenario ${status}`;

    const badge = el.querySelector('.status-badge');
    if (badge) {
      badge.className = `status-badge ${status}`;
      badge.textContent = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : '待执行';
    }

    const textarea = el.querySelector('.notes textarea');
    if (textarea && this.results[id]?.notes) {
      textarea.value = this.results[id].notes;
    }
  },

  applyFilter(filter) {
    document.querySelectorAll('.scenario').forEach(el => {
      const status = this.results[el.dataset.id]?.status || 'pending';
      if (filter === 'all') {
        el.style.display = '';
      } else {
        el.style.display = status === filter ? '' : 'none';
      }
    });
  },

  updateStats() {
    const scenarios = document.querySelectorAll('.scenario');
    let pass = 0, fail = 0, pending = 0;
    scenarios.forEach(el => {
      const status = this.results[el.dataset.id]?.status || 'pending';
      if (status === 'pass') pass++;
      else if (status === 'fail') fail++;
      else pending++;
    });
    const total = scenarios.length;

    const setNum = (cls, val) => {
      const el = document.querySelector(`.stat-card.${cls} .number`);
      if (el) el.textContent = val;
    };
    setNum('total', total);
    setNum('pass', pass);
    setNum('fail', fail);
    setNum('pending', pending);

    scenarios.forEach(el => this.applyStatus(el.dataset.id));
  },

  export() {
    const scenarios = document.querySelectorAll('.scenario');
    const lines = [];
    lines.push(`# ${document.querySelector('h1')?.textContent || 'Test Report'}`);
    lines.push(`Date: ${new Date().toLocaleString()}\n`);

    let pass = 0, fail = 0, pending = 0;
    scenarios.forEach(el => {
      const id = el.dataset.id;
      const title = el.querySelector('.scenario-title')?.textContent?.trim() || id;
      const status = this.results[id]?.status || 'pending';
      const notes = this.results[id]?.notes || '';
      const icon = status === 'pass' ? '[PASS]' : status === 'fail' ? '[FAIL]' : '[----]';
      lines.push(`${icon} ${title}`);
      if (notes) lines.push(`       Note: ${notes}`);
      if (status === 'pass') pass++;
      else if (status === 'fail') fail++;
      else pending++;
    });

    lines.push(`\n--- Summary: ${pass} pass, ${fail} fail, ${pending} pending ---`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.getStorageKey()}-report.txt`;
    a.click();
  },

  applyAllSaved() {
    Object.keys(this.results).forEach(id => this.applyStatus(id));
  }
};

document.addEventListener('DOMContentLoaded', () => {
  TestRunner.init();
  TestRunner.applyAllSaved();
});
