class ProgressTracker {
  constructor() {
    this.entityProgress = new Map();
    this.listeners = [];
  }

  reportProgress(entityId, progress) {
    this.entityProgress.set(entityId, progress);
    this._notifyListeners();
  }

  getOverallProgress() {
    if (this.entityProgress.size === 0) {
      return { current: 0, total: 0, percentage: 0, details: [] };
    }

    let totalCurrent = 0;
    let totalMax = 0;

    for (const progress of this.entityProgress.values()) {
      if (progress.type === 'iteration') {
        totalCurrent += progress.current || 0;
        totalMax += progress.max || 1;
      } else if (progress.type === 'percentage') {
        totalCurrent += progress.percentage || 0;
        totalMax += 100;
      }
    }

    return {
      current: totalCurrent,
      total: totalMax,
      percentage: totalMax > 0 ? Math.round((totalCurrent / totalMax) * 100) : 0,
      details: Array.from(this.entityProgress.entries()).map(([id, p]) => ({ id, ...p }))
    };
  }

  onProgress(callback) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }

  _notifyListeners() {
    const overall = this.getOverallProgress();
    this.listeners.forEach(cb => cb(overall));
  }

  reset() {
    this.entityProgress.clear();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProgressTracker;
}
