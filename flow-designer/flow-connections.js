class ConnectionManager {
  constructor(canvasId, app, canvasController) {
    this.canvasId = canvasId;
    this.app = app;
    this.canvasController = canvasController || null;
    this.svg = null;
    this.connections = [];
    this.isConnecting = false;
    this.connectionStart = null;
    this.tempLine = null;
    this.init();
  }

  init() {
    this.createSVG();
    this.bindEvents();
  }

  createSVG() {
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) return;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'connections-svg');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#3964FE');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    this.svg.appendChild(defs);

    canvas.insertBefore(this.svg, canvas.firstChild);
  }

  renderPorts(node) {
    const nodeEl = document.getElementById(node.id);
    if (!nodeEl) return;

    nodeEl.querySelectorAll('.node-port').forEach(p => p.remove());

    const info = NODE_TEMPLATE_INFO[node.type];
    if (!info) return;
    const ports = info.defaultPorts || [];

    ports.forEach((portConfig) => {
      const port = document.createElement('div');
      port.className = `node-port port-${portConfig.type}`;
      port.dataset.nodeId = node.id;
      port.dataset.portType = portConfig.type;
      port.dataset.portId = portConfig.portID || `${portConfig.type}`;

      if (portConfig.disabled) port.classList.add('port-disabled');

      if (!portConfig.disabled) {
        port.addEventListener('mousedown', (e) => this.onPortMouseDown(e, node, portConfig));
        port.addEventListener('mouseup', (e) => this.onPortMouseUp(e, node, portConfig));
      }

      nodeEl.appendChild(port);
    });
  }

  onPortMouseDown(e, node, portConfig) {
    e.stopPropagation();
    e.preventDefault();
    if (portConfig.type !== 'output') return;

    this.isConnecting = true;
    this.connectionStart = {
      nodeId: node.id,
      portType: portConfig.type,
      portId: portConfig.portID,
      element: e.target.closest('.node-port')
    };

    this.createTempLine(e);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onPortMouseUp(e, node, portConfig) {
    e.stopPropagation();
    e.preventDefault();
    if (!this.isConnecting || !this.connectionStart) return;

    if (portConfig.type === 'input' && this.connectionStart.nodeId !== node.id) {
      this.createConnection(this.connectionStart.nodeId, node.id, this.connectionStart.portId, portConfig.portID);
    }
    this.cancelConnection();
  }

  onMouseMove = (e) => {
    if (!this.isConnecting || !this.tempLine) return;
    const canvas = document.getElementById(this.canvasId);
    const rect = canvas.getBoundingClientRect();
    const scale = this.canvasController?.scale || 1;
    const x = (e.clientX - rect.left) / scale + canvas.parentElement.scrollLeft;
    const y = (e.clientY - rect.top) / scale + canvas.parentElement.scrollTop;
    this.updateTempLine(x, y);
  };

  onMouseUp = () => { this.cancelConnection(); };

  createTempLine(e) {
    if (this.tempLine) this.tempLine.remove();
    const canvas = document.getElementById(this.canvasId);
    const rect = canvas.getBoundingClientRect();
    const port = this.connectionStart.element;
    const portRect = port.getBoundingClientRect();
    const scale = this.canvasController?.scale || 1;
    const sx = (portRect.left - rect.left) / scale + portRect.width / 2 + canvas.parentElement.scrollLeft;
    const sy = (portRect.top - rect.top) / scale + portRect.height / 2 + canvas.parentElement.scrollTop;

    this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.tempLine.setAttribute('class', 'connection-line temp-line');
    this.svg.appendChild(this.tempLine);
    this.updateTempLine(sx, sy);
  }

  updateTempLine(ex, ey) {
    if (!this.tempLine || !this.connectionStart) return;
    const canvas = document.getElementById(this.canvasId);
    const rect = canvas.getBoundingClientRect();
    const port = this.connectionStart.element;
    const portRect = port.getBoundingClientRect();
    const scale = this.canvasController?.scale || 1;
    const sx = (portRect.left - rect.left) / scale + portRect.width / 2 + canvas.parentElement.scrollLeft;
    const sy = (portRect.top - rect.top) / scale + portRect.height / 2 + canvas.parentElement.scrollTop;
    this.tempLine.setAttribute('d', this.calcPath(sx, sy, ex, ey));
  }

  createConnection(sourceId, targetId, sourcePortId, targetPortId) {
    if (this.connections.some(c => c.source === sourceId && c.target === targetId)) return;
    if (this.wouldCreateCycle(sourceId, targetId)) { alert('不能创建循环连线'); return; }

    const conn = { id: `conn_${Date.now()}`, source: sourceId, target: targetId, sourcePort: sourcePortId, targetPort: targetPortId };
    this.connections.push(conn);
    this.app.edges.push({ id: conn.id, source: sourceId, target: targetId });
    this.renderConnections();
    this.app.saveFlowData();
  }

  wouldCreateCycle(sourceId, targetId) {
    const visited = new Set();
    const q = [targetId];
    while (q.length > 0) {
      const cur = q.shift();
      if (cur === sourceId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      this.connections.filter(c => c.source === cur).forEach(c => { if (!visited.has(c.target)) q.push(c.target); });
    }
    return false;
  }

  renderConnections() {
    this.svg.querySelectorAll('.connection-line:not(.temp-line)').forEach(l => l.remove());
    this.connections.forEach(c => this.renderConnection(c));
  }

  renderConnection(conn) {
    const src = document.getElementById(conn.source);
    const tgt = document.getElementById(conn.target);
    if (!src || !tgt) return;

    const sp = src.querySelector(`.port-output[data-port-id="${conn.sourcePort}"]`) || src.querySelector('.port-output');
    const tp = tgt.querySelector(`.port-input[data-port-id="${conn.targetPort}"]`) || tgt.querySelector('.port-input');
    if (!sp || !tp) return;

    const canvas = document.getElementById(this.canvasId);
    const rect = canvas.getBoundingClientRect();
    const sr = sp.getBoundingClientRect();
    const tr = tp.getBoundingClientRect();

    const scale = this.canvasController?.scale || 1;

    const sx = (sr.left - rect.left) / scale + sr.width / 2 + canvas.parentElement.scrollLeft;
    const sy = (sr.top - rect.top) / scale + sr.height / 2 + canvas.parentElement.scrollTop;
    const ex = (tr.left - rect.left) / scale + tr.width / 2 + canvas.parentElement.scrollLeft;
    const ey = (tr.top - rect.top) / scale + tr.height / 2 + canvas.parentElement.scrollTop;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection-line');
    path.setAttribute('id', conn.id);
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('d', this.calcPath(sx, sy, ex, ey));

    path.addEventListener('click', (e) => { e.stopPropagation(); this.selectConnection(conn.id); });
    path.addEventListener('dblclick', (e) => { e.stopPropagation(); this.deleteConnection(conn.id); });

    this.svg.appendChild(path);
  }

  calcPath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const offset = Math.max(dx * 0.5, 50);
    return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
  }

  selectConnection(connId) {
    this.svg.querySelectorAll('.connection-line.selected').forEach(l => { l.classList.remove('selected'); });
    const line = document.getElementById(connId);
    if (line) line.classList.add('selected');
    this.selectedConnectionId = connId;
  }

  deleteConnection(connId) {
    if (!confirm('确定删除这条连线？')) return;
    this.connections = this.connections.filter(c => c.id !== connId);
    this.app.edges = this.app.edges.filter(e => e.id !== connId);
    document.getElementById(connId)?.remove();
    this.app.saveFlowData();
  }

  cancelConnection() {
    this.isConnecting = false;
    this.connectionStart = null;
    this.tempLine?.remove();
    this.tempLine = null;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }

  deleteNodeConnections(nodeId) {
    const toDel = this.connections.filter(c => c.source === nodeId || c.target === nodeId);
    toDel.forEach(c => document.getElementById(c.id)?.remove());
    this.connections = this.connections.filter(c => c.source !== nodeId && c.target !== nodeId);
    this.app.edges = this.app.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
  }

  bindEvents() {
    const canvas = document.getElementById(this.canvasId);
    if (canvas) {
      canvas.addEventListener('click', (e) => {
        if (e.target === canvas || e.target === this.svg) this.deselectAll();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && this.selectedConnectionId) this.deleteConnection(this.selectedConnectionId);
    });
  }

  deselectAll() {
    this.svg.querySelectorAll('.connection-line.selected').forEach(l => l.classList.remove('selected'));
    this.selectedConnectionId = null;
  }

  updateNodeConnections(nodeId) {
    this.connections.filter(c => c.source === nodeId || c.target === nodeId).forEach(c => {
      document.getElementById(c.id)?.remove();
      this.renderConnection(c);
    });
  }
}

if (typeof window !== 'undefined') window.ConnectionManager = ConnectionManager;
if (typeof module !== 'undefined' && module.exports) module.exports = ConnectionManager;
