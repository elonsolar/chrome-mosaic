class CanvasController {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.panStartPanX = 0;
    this.panStartPanY = 0;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.setScale(this.scale + delta, e.clientX, e.clientY);
      }
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.target === this.canvas)) {
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const dx = e.clientX - this.panStartX;
      const dy = e.clientY - this.panStartY;
      this.panX = this.panStartPanX + dx;
      this.panY = this.panStartPanY + dy;
      this.applyTransform();
    });

    document.addEventListener('mouseup', () => {
      this.isPanning = false;
    });
  }

  setScale(newScale, cx, cy) {
    const oldScale = this.scale;
    this.scale = Math.max(0.25, Math.min(2, newScale));

    if (cx !== undefined && cy !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      const x = cx - rect.left;
      const y = cy - rect.top;
      this.panX = x - (x - this.panX) * (this.scale / oldScale);
      this.panY = y - (y - this.panY) * (this.scale / oldScale);
    }

    this.applyTransform();
  }

  applyTransform() {
    this.canvas.style.transform = `scale(${this.scale}) translate(${this.panX}px, ${this.panY}px)`;
    this.canvas.style.transformOrigin = '0 0';
  }

  reset() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }
}

if (typeof window !== 'undefined') {
  window.CanvasController = CanvasController;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasController;
}
