class ExpertManager {
  constructor() {
    this.storageKey = 'experts';
  }

  generateId() {
    return 'expert-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  async getExperts() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  async getExpertById(expertId) {
    const experts = await this.getExperts();
    return experts.find(e => e.id === expertId) || null;
  }

  async createExpert(data) {
    const experts = await this.getExperts();

    const newExpert = {
      id: this.generateId(),
      name: data.name || '未命名专家',
      description: data.description || '',
      icon: data.icon || '🤖',
      nodes: data.nodes || [],
      connections: data.connections || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    experts.push(newExpert);
    await this.saveExperts(experts);

    return newExpert;
  }

  async updateExpert(expertId, data) {
    const experts = await this.getExperts();
    const index = experts.findIndex(e => e.id === expertId);

    if (index === -1) {
      throw new Error('专家不存在');
    }

    experts[index] = {
      ...experts[index],
      ...data,
      id: expertId,
      updatedAt: Date.now()
    };

    await this.saveExperts(experts);
    return experts[index];
  }

  async deleteExpert(expertId) {
    let experts = await this.getExperts();
    experts = experts.filter(e => e.id !== expertId);
    await this.saveExperts(experts);
  }

  async duplicateExpert(expertId) {
    const original = await this.getExpertById(expertId);
    if (!original) {
      throw new Error('专家不存在');
    }

    const oldToNew = {};
    const clonedNodes = (original.nodes || []).map(n => {
      const newId = this.generateId();
      oldToNew[n.id] = newId;
      return { ...n, id: newId };
    });

    const clonedConnections = (original.connections || []).map(c => ({
      ...c,
      id: this.generateId(),
      from: oldToNew[c.from] || c.from,
      to: oldToNew[c.to] || c.to
    }));

    return this.createExpert({
      name: `${original.name} (副本)`,
      description: original.description,
      icon: original.icon,
      nodes: clonedNodes,
      connections: clonedConnections
    });
  }

  async addNode(expertId, nodeData) {
    const expert = await this.getExpertById(expertId);
    if (!expert) throw new Error('专家不存在');

    const newNode = {
      id: this.generateId(),
      ...nodeData,
      config: nodeData.config || {}
    };

    expert.nodes = expert.nodes || [];
    expert.nodes.push(newNode);
    await this.updateExpert(expertId, { nodes: expert.nodes });
    return newNode;
  }

  async updateNode(expertId, nodeId, nodeData) {
    const expert = await this.getExpertById(expertId);
    if (!expert) throw new Error('专家不存在');

    const nodeIndex = (expert.nodes || []).findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) throw new Error('节点不存在');

    expert.nodes[nodeIndex] = { ...expert.nodes[nodeIndex], ...nodeData, id: nodeId };
    await this.updateExpert(expertId, { nodes: expert.nodes });
    return expert.nodes[nodeIndex];
  }

  async deleteNode(expertId, nodeId) {
    const expert = await this.getExpertById(expertId);
    if (!expert) throw new Error('专家不存在');

    expert.nodes = (expert.nodes || []).filter(n => n.id !== nodeId);
    expert.connections = (expert.connections || []).filter(c => c.from !== nodeId && c.to !== nodeId);

    await this.updateExpert(expertId, {
      nodes: expert.nodes,
      connections: expert.connections
    });
  }

  async addConnection(expertId, connectionData) {
    const expert = await this.getExpertById(expertId);
    if (!expert) throw new Error('专家不存在');

    const fromNode = (expert.nodes || []).find(n => n.id === connectionData.from);
    const toNode = (expert.nodes || []).find(n => n.id === connectionData.to);
    if (!fromNode || !toNode) throw new Error('节点不存在');

    const exists = (expert.connections || []).some(c => c.from === connectionData.from && c.to === connectionData.to);
    if (exists) throw new Error('连接已存在');

    const newConnection = {
      id: this.generateId(),
      ...connectionData,
      order: (expert.connections || []).length
    };

    expert.connections = expert.connections || [];
    expert.connections.push(newConnection);
    await this.updateExpert(expertId, { connections: expert.connections });
    return newConnection;
  }

  async deleteConnection(expertId, connectionId) {
    const expert = await this.getExpertById(expertId);
    if (!expert) throw new Error('专家不存在');

    expert.connections = (expert.connections || []).filter(c => c.id !== connectionId);
    await this.updateExpert(expertId, { connections: expert.connections });
  }

  async searchExperts(keyword) {
    const experts = await this.getExperts();
    if (!keyword) return experts;

    const lowerKeyword = keyword.toLowerCase();
    return experts.filter(e =>
      e.name.toLowerCase().includes(lowerKeyword) ||
      (e.description && e.description.toLowerCase().includes(lowerKeyword))
    );
  }

  async saveExperts(experts) {
    await chrome.storage.local.set({ [this.storageKey]: experts });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExpertManager;
}
