document.addEventListener('DOMContentLoaded', () => {
  // ===== Bottom toolbar buttons =====
  document.getElementById('btn-minimap')?.addEventListener('click', () => console.log('Minimap'));
  document.getElementById('btn-autolayout')?.addEventListener('click', () => console.log('Auto layout'));
  document.getElementById('btn-layout')?.addEventListener('click', () => console.log('Layout'));
  document.getElementById('btn-close-panel')?.addEventListener('click', () => window.app?.closePanel());

  // ===== Add Node Dialog =====
  const addNodeDialog = document.getElementById('add-node-dialog');
  document.getElementById('btn-add-node')?.addEventListener('click', () => {
    addNodeDialog.style.display = 'flex';
    document.getElementById('node-search').value = '';
    document.getElementById('node-search').focus();
    filterNodeOptions('');
  });
  document.getElementById('btn-close-dialog')?.addEventListener('click', () => {
    addNodeDialog.style.display = 'none';
  });
  addNodeDialog?.addEventListener('click', (e) => {
    if (e.target === addNodeDialog) addNodeDialog.style.display = 'none';
  });

  document.getElementById('node-search')?.addEventListener('input', (e) => {
    filterNodeOptions(e.target.value.toLowerCase());
  });

  function filterNodeOptions(query) {
    document.querySelectorAll('.node-option').forEach(opt => {
      const text = opt.querySelector('span')?.textContent?.toLowerCase() || '';
      opt.style.display = text.includes(query) ? '' : 'none';
    });
    document.querySelectorAll('.node-group').forEach(group => {
      const visible = group.querySelectorAll('.node-option[style*="display: none"]').length < group.querySelectorAll('.node-option').length;
      group.style.display = visible ? '' : 'none';
    });
  }

  // ===== Node option click =====
  document.querySelectorAll('.node-option').forEach(opt => {
    opt.addEventListener('click', () => {
      if (opt.classList.contains('disabled')) return;
      const type = opt.dataset.type;
      addNodeDialog.style.display = 'none';
      const typeMap = {
        llm: StandardNodeType.LLM,
        plugin: StandardNodeType.Http,
      };
      if (typeMap[type]) {
        const container = document.getElementById('canvas-container');
        const w = container?.offsetWidth || 800;
        const h = container?.offsetHeight || 600;
        const scrollX = container?.scrollLeft || 0;
        const scrollY = container?.scrollTop || 0;
        const x = scrollX + Math.max(100, w / 2 - 114);
        const y = scrollY + Math.max(100, h / 2 - 50);
        window.app?.addNode(typeMap[type], { x, y });
      } else {
        console.warn('Unknown node type:', type);
      }
    });
  });

  // ===== Variable Picker =====
  document.getElementById('btn-close-var-picker')?.addEventListener('click', () => {
    window.app?.closeVariablePicker();
  });

  // ===== Flow designer init =====
  const canvasCtrl = new CanvasController(document.getElementById('flow-canvas'));
  window.app = new FlowDesignerApp('flow-canvas', canvasCtrl);

  // ===== Test run button =====
  document.getElementById('btn-test-run')?.addEventListener('click', () => {
    window.app?.openFlowTestPanel();
  });

  console.log('Coze Studio Flow Designer ready');
  document.dispatchEvent(new CustomEvent('flow-designer-ready', { detail: { app: window.app } }));
});
