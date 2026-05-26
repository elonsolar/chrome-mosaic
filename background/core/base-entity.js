class BaseEntity {
  constructor(id, name, type) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.progressTracker = null;
  }

  setProgressTracker(tracker) {
    this.progressTracker = tracker;
  }

  reportProgress(progress) {
    if (this.progressTracker) {
      this.progressTracker.reportProgress(this.id, {
        entityId: this.id,
        entityName: this.name,
        entityType: this.type,
        ...progress
      });
    }
  }

  async execute(input, context) {
    throw new Error('execute() must be implemented by subclass');
  }

  async validate(input, context) {
    return { valid: true, error: null };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaseEntity;
}
