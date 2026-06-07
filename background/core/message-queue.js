class MessageQueue {
  constructor() {
    this.queue = [];
    this.onEnqueue = null;
  }

  enqueue(content, targetMembers = null) {
    const entry = {
      type: 'message',
      content,
      targetMembers,
      consumed: new Set(),
      saved: false,
      createdAt: Date.now()
    };
    this.queue.push(entry);
    console.log(`[MessageQueue] 消息入队，队列长度: ${this.queue.length}`);
    if (this.onEnqueue) {
      this.onEnqueue();
    }
    return this.queue.length - 1;
  }

  enqueueLoopTask(task) {
    const entry = {
      type: 'loop',
      task,
      consumed: new Set(),
      saved: true,
      createdAt: Date.now()
    };
    this.queue.push(entry);
    console.log(`[MessageQueue] LoopTask 入队，队列长度: ${this.queue.length}`);
    if (this.onEnqueue) {
      this.onEnqueue();
    }
    return this.queue.length - 1;
  }

  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  dequeue() {
    return this.queue.shift();
  }

  getNextForMember(memberId) {
    return this.queue.findIndex(msg => msg.type === 'message' && !msg.consumed.has(memberId));
  }

  getAllUnconsumedForMember(memberId) {
    const indices = [];
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].type === 'message' && !this.queue[i].consumed.has(memberId)) {
        indices.push(i);
      }
    }
    return indices;
  }

  markConsumed(memberId, msgIndex) {
    if (msgIndex >= 0 && msgIndex < this.queue.length) {
      this.queue[msgIndex].consumed.add(memberId);
      console.log(`[MessageQueue] 成员 ${memberId} 消费了消息 ${msgIndex}`);
    }
  }

  markConsumedBatch(memberId, msgIndices) {
    for (const idx of msgIndices) {
      this.queue[idx].consumed.add(memberId);
    }
    console.log(`[MessageQueue] 成员 ${memberId} 批量消费了 ${msgIndices.length} 条消息`);
  }

  canRemove(msgIndex, onlineMemberIds) {
    if (msgIndex < 0 || msgIndex >= this.queue.length) return false;
    const msg = this.queue[msgIndex];
    const relevantIds = msg.targetMembers || onlineMemberIds;
    return relevantIds.every(id => msg.consumed.has(id));
  }

  removeCompleted(onlineMemberIds) {
    const before = this.queue.length;
    this.queue = this.queue.filter((msg, i) => !this.canRemove(i, onlineMemberIds));
    const removed = before - this.queue.length;
    if (removed > 0) {
      console.log(`[MessageQueue] 移除了 ${removed} 条已消费消息，剩余: ${this.queue.length}`);
    }
  }

  get length() {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
    console.log('[MessageQueue] 队列已清空');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageQueue;
}
