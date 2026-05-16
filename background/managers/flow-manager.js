/**
 * 流程管理器
 * 管理流程定义的CRUD操作
 */
class FlowManager {
  constructor() {
    this.storageKey = 'flows';
  }

  /**
   * 创建新流程
   */
  async createFlow(data) {
    const { name, description } = data;

    if (!name) {
      throw new Error('流程名称不能为空');
    }

    const flows = await this.getFlows();
    const newFlow = {
      id: this.generateId(),
      name,
      description: description || '',
      nodes: [],
      connections: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    flows.push(newFlow);
    await this.saveFlows(flows);

    return newFlow;
  }

  /**
   * 获取所有流程
   */
  async getFlows() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || [];
  }

  /**
   * 根据ID获取流程
   */
  async getFlowById(id) {
    const flows = await this.getFlows();
    return flows.find(f => f.id === id) || null;
  }

  /**
   * 更新流程
   */
  async updateFlow(id, data) {
    const flows = await this.getFlows();
    const index = flows.findIndex(f => f.id === id);

    if (index === -1) {
      throw new Error('流程不存在');
    }

    flows[index] = {
      ...flows[index],
      ...data,
      id,
      updatedAt: Date.now()
    };

    await this.saveFlows(flows);
    return flows[index];
  }

  /**
   * 更新节点
   */
  async updateNode(flowId, nodeId, nodeData) {
    const flow = await this.getFlowById(flowId);
    if (!flow) {
      throw new Error('流程不存在');
    }

    const nodeIndex = flow.nodes.findIndex(n => n.id === nodeId);
    if (nodeIndex === -1) {
      throw new Error('节点不存在');
    }

    flow.nodes[nodeIndex] = {
      ...flow.nodes[nodeIndex],
      ...nodeData,
      id: nodeId
    };

    return this.updateFlow(flowId, { nodes: flow.nodes });
  }

  /**
   * 添加节点
   */
  async addNode(flowId, nodeData) {
    const flow = await this.getFlowById(flowId);
    if (!flow) {
      throw new Error('流程不存在');
    }

    const newNode = {
      id: this.generateId(),
      ...nodeData,
      config: nodeData.config || {}
    };

    flow.nodes.push(newNode);

    return this.updateFlow(flowId, { nodes: flow.nodes });
  }

  /**
   * 删除节点
   */
  async deleteNode(flowId, nodeId) {
    const flow = await this.getFlowById(flowId);
    if (!flow) {
      throw new Error('流程不存在');
    }

    // 删除节点
    flow.nodes = flow.nodes.filter(n => n.id !== nodeId);

    // 删除相关连接
    flow.connections = flow.connections.filter(
      c => c.from !== nodeId && c.to !== nodeId
    );

    return this.updateFlow(flowId, {
      nodes: flow.nodes,
      connections: flow.connections
    });
  }

  /**
   * 添加连接
   */
  async addConnection(flowId, connectionData) {
    const flow = await this.getFlowById(flowId);
    if (!flow) {
      throw new Error('流程不存在');
    }

    // 验证节点存在
    const fromNode = flow.nodes.find(n => n.id === connectionData.from);
    const toNode = flow.nodes.find(n => n.id === connectionData.to);

    if (!fromNode || !toNode) {
      throw new Error('节点不存在');
    }

    // 检查是否已存在连接
    const exists = flow.connections.some(
      c => c.from === connectionData.from && c.to === connectionData.to
    );

    if (exists) {
      throw new Error('连接已存在');
    }

    const newConnection = {
      id: this.generateId(),
      ...connectionData,
      order: flow.connections.length
    };

    flow.connections.push(newConnection);

    return this.updateFlow(flowId, { connections: flow.connections });
  }

  /**
   * 删除连接
   */
  async deleteConnection(flowId, connectionId) {
    const flow = await this.getFlowById(flowId);
    if (!flow) {
      throw new Error('流程不存在');
    }

    flow.connections = flow.connections.filter(c => c.id !== connectionId);

    return this.updateFlow(flowId, { connections: flow.connections });
  }

  /**
   * 删除流程
   */
  async deleteFlow(id) {
    let flows = await this.getFlows();
    flows = flows.filter(f => f.id !== id);
    await this.saveFlows(flows);
  }

  /**
   * 复制流程
   */
  async duplicateFlow(id) {
    const original = await this.getFlowById(id);
    if (!original) {
      throw new Error('流程不存在');
    }

    return this.createFlow({
      name: `${original.name} (副本)`,
      description: original.description,
      nodes: original.nodes.map(node => ({
        ...node,
        id: this.generateId()
      })),
      connections: original.connections.map(conn => ({
        ...conn,
        id: this.generateId()
      }))
    });
  }

  /**
   * 保存流程列表
   */
  async saveFlows(flows) {
    await chrome.storage.local.set({ [this.storageKey]: flows });
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlowManager;
}
