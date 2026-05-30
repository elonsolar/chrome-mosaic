/**
 * Coze Studio Flow Designer - 100% 还原版本
 * 完整迁移自 C:\Users\64162\public\coze-studio-main
 */

// ==================== 标准节点类型枚举 ====================
/**
 * 节点类型定义 - 完全对应 Coze Studio 的 StandardNodeType
 * 源文件: frontend/packages/workflow/base/src/types/node-type.ts
 */
const StandardNodeType = {
  // 基础节点
  Start: '1',
  End: '2',
  LLM: '3',
  Api: '4',
  Code: '5',
  Dataset: '6',
  If: '8',
  SubWorkflow: '9',
  Variable: '11',
  Database: '12',
  Output: '13',
  Imageflow: '14',
  Text: '15',
  ImageGenerate: '16',
  ImageReference: '17',
  Question: '18',
  Break: '19',
  SetVariable: '20',
  Loop: '21',
  Intent: '22',
  ImageCanvas: '23',
  SceneVariable: '24',
  SceneChat: '25',
  LTM: '26',
  DatasetWrite: '27',
  Batch: '28',
  Continue: '29',
  Input: '30',
  Comment: '31',
  VariableMerge: '32',
  QueryMessageList: '37',
  ClearContext: '38',
  CreateConversation: '39',
  TriggerUpsert: '34',
  TriggerDelete: '35',
  TriggerRead: '36',
  VariableAssign: '40',
  Http: '45',
  DatabaseUpdate: '42',
  DatabaseQuery: '43',
  DatabaseDelete: '44',
  DatabaseCreate: '46',
  UpdateConversation: '51',
  DeleteConversation: '52',
  QueryConversationList: '53',
  QueryConversationHistory: '54',
  CreateMessage: '55',
  UpdateMessage: '56',
  DeleteMessage: '57',
  JsonStringify: '58',
  JsonParser: '59',
};

// ==================== 变量类型定义 ====================
/**
 * 变量类型枚举
 * 源文件: frontend/packages/workflow/base/src/types/dto.ts
 */
const VariableTypeDTO = {
  object: 'object',
  list: 'list',
  string: 'string',
  integer: 'integer',
  float: 'float',
  boolean: 'boolean',
  image: 'image',
  time: 'time',
};

// ==================== 值表达式类型 ====================
/**
 * 值表达式类型
 * 支持字面量和引用两种模式
 */
const ValueExpressionType = {
  Literal: 'literal',  // 字面量值
  Ref: 'ref',          // 变量引用
};

// ==================== 循环类型 ====================
/**
 * 循环节点类型
 * 源文件: frontend/packages/workflow/playground/src/node-registries/loop/constants.ts
 */
const LoopType = {
  Array: 'array',      // 数组循环
  Count: 'count',      // 计数循环
  Infinite: 'infinite', // 无限循环
};

// ==================== 批量模式 ====================
/**
 * LLM 节点批量模式
 */
const BatchMode = {
  Single: 'single',
  Batch: 'batch',
};

// ==================== 节点元数据和配置 ====================
/**
 * 节点模板信息
 * 完全对应 Coze 的节点设计
 */
const NODE_TEMPLATE_INFO = {
  [StandardNodeType.Start]: {
    name: '开始',
    icon: '🚀',
    icon_url: '/nodes/start.svg',
    color: '#52C41A',
    description: '流程的起始点',
    size: { width: 360, height: 78.7 },
    deleteDisable: true,
    copyDisable: true,
    headerReadonly: true,
    defaultPorts: [{ type: 'output' }],
  },
  [StandardNodeType.End]: {
    name: '结束',
    icon: '🏁',
    icon_url: '/nodes/end.svg',
    color: '#FF4D4F',
    description: '流程的终止点',
    size: { width: 360, height: 78.2 },
    deleteDisable: true,
    copyDisable: true,
    headerReadonly: true,
    defaultPorts: [{ type: 'input' }],
  },
  [StandardNodeType.LLM]: {
    name: '大模型',
    icon: '🤖',
    icon_url: '/nodes/llm.svg',
    color: '#1890FF',
    description: '调用大语言模型',
    size: { width: 360, height: 130.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Api]: {
    name: 'API',
    icon: '🔌',
    icon_url: '/nodes/api.svg',
    color: '#722ED1',
    description: '调用外部 API',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Http]: {
    name: 'HTTP',
    icon: '🌐',
    icon_url: '/nodes/http.svg',
    color: '#722ED1',
    description: 'HTTP 请求',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Code]: {
    name: '代码',
    icon: '💻',
    icon_url: '/nodes/code.svg',
    color: '#FAAD14',
    description: '执行代码',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.If]: {
    name: '条件判断',
    icon: '🔀',
    icon_url: '/nodes/if.svg',
    color: '#13C2C2',
    description: '条件分支',
    size: { width: 360, height: 104.7 },
    defaultPorts: [
      { type: 'input' },
      { type: 'output', portID: 'true' },
      { type: 'output', portID: 'false' },
    ],
  },
  [StandardNodeType.Loop]: {
    name: '循环',
    icon: '🔁',
    icon_url: '/nodes/loop.svg',
    color: '#FA8C16',
    description: '循环执行',
    size: { width: 360, height: 139.86 },
    defaultPorts: [
      { type: 'input' },
      { type: 'output', portID: 'loop-output' },
      { type: 'output', portID: 'loop-output-to-function', disabled: true },
    ],
  },
  [StandardNodeType.Variable]: {
    name: '变量',
    icon: '📦',
    icon_url: '/nodes/variable.svg',
    color: '#8C8C8C',
    description: '变量操作',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.SetVariable]: {
    name: '设置变量',
    icon: '📝',
    icon_url: '/nodes/set-variable.svg',
    color: '#8C8C8C',
    description: '设置变量值',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Batch]: {
    name: '批量处理',
    icon: '📚',
    icon_url: '/nodes/batch.svg',
    color: '#FA541C',
    description: '批量处理数据',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Database]: {
    name: '数据库',
    icon: '🗄️',
    icon_url: '/nodes/database.svg',
    color: '#2F54EB',
    description: '数据库操作',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Dataset]: {
    name: '知识库',
    icon: '📚',
    icon_url: '/nodes/dataset.svg',
    color: '#13C2C2',
    description: '知识库检索',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Text]: {
    name: '文本',
    icon: '📄',
    icon_url: '/nodes/text.svg',
    color: '#595959',
    description: '文本处理',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
  [StandardNodeType.Question]: {
    name: '问题',
    icon: '❓',
    icon_url: '/nodes/question.svg',
    color: '#FA8C16',
    description: '提问节点',
    size: { width: 360, height: 104.7 },
    defaultPorts: [{ type: 'input' }, { type: 'output' }],
  },
};

// ==================== 变量引用工具函数 ====================
/**
 * 解析变量引用
 * 格式: {{nodeId.varName}} 或 {{nodeId.path.to.var}}
 * @param {string} ref - 变量引用字符串
 * @returns {object|null} - 解析结果 {nodeId, path}
 */
function parseVariableReference(ref) {
  if (!ref || typeof ref !== 'string') {
    return null;
  }

  // 匹配 {{nodeId.varName}} 格式
  const match = ref.match(/\{\{(.+?)\}\}/);
  if (match) {
    const parts = match[1].split('.');
    return {
      nodeId: parts[0],
      path: parts.slice(1).join('.'),
    };
  }

  return null;
}

/**
 * 创建变量引用
 * @param {string} nodeId - 节点 ID
 * @param {string} varName - 变量名
 * @returns {string} - 变量引用字符串
 */
function createVariableReference(nodeId, varName) {
  return `{{${nodeId}.${varName}}}`;
}

/**
 * 判断是否是变量引用
 * @param {any} value - 值
 * @returns {boolean}
 */
function isVariableReference(value) {
  if (typeof value !== 'string') {
    return false;
  }
  return /\{\{.+\}\}/.test(value);
}

/**
 * 从值表达式中提取实际值
 * @param {object} valueExpression - 值表达式对象
 * @returns {any}
 */
function extractValue(valueExpression) {
  if (!valueExpression) {
    return null;
  }

  if (valueExpression.type === ValueExpressionType.Literal) {
    return valueExpression.content;
  }

  if (valueExpression.type === ValueExpressionType.Ref) {
    const ref = valueExpression.content;
    if (ref?.source === 'block-output') {
      return createVariableReference(ref.blockID, ref.name);
    }
    return null;
  }

  return valueExpression;
}

/**
 * 创建值表达式对象
 * @param {any} value - 原始值
 * @returns {object} - 值表达式对象
 */
function createValueExpression(value, nodes) {
  if (isVariableReference(value)) {
    const parsed = parseVariableReference(value);
    if (parsed) {
      let blockID = parsed.nodeId;
      if (nodes && Array.isArray(nodes)) {
        const node = nodes.find(n => (n.data?.title === parsed.nodeId) || n.id === parsed.nodeId);
        if (node) blockID = node.id;
      }
      return {
        type: ValueExpressionType.Ref,
        content: {
          source: 'block-output',
          blockID: blockID,
          name: parsed.path,
        },
      };
    }
  }

  return {
    type: ValueExpressionType.Literal,
    content: value,
  };
}

// ==================== 默认节点配置 ====================
/**
 * 创建默认的开始节点
 * 对应 Coze Studio 的 Start 节点
 */
function createDefaultStartNode() {
  return {
    id: 'start',
    type: StandardNodeType.Start,
    position: { x: 100, y: 250 },
    data: {
      title: '开始',
      description: '流程的起始点',
      outputs: [
        {
          key: 'user_input',
          name: 'input',
          type: VariableTypeDTO.string,
        },
      ],
      nodeMeta: {
        title: '开始',
        description: '流程的起始点',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.Start].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.Start].color,
      },
    },
  };
}

/**
 * 创建默认的结束节点
 * 对应 Coze Studio 的 End 节点
 */
function createDefaultEndNode() {
  return {
    id: 'end',
    type: StandardNodeType.End,
    position: { x: 700, y: 250 },
    data: {
      title: '结束',
      description: '流程的终止点',
      inputs: {
        terminatePlan: 'return_variables',  // 返回变量
        content: createValueExpression(''),  // 返回文本内容
        inputParameters: [],  // 输入参数（输出变量）
        streamingOutput: false,
      },
      nodeMeta: {
        title: '结束',
        description: '流程的终止点',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.End].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.End].color,
      },
    },
  };
}

/**
 * 创建 LLM 节点
 * @param {string} nodeId - 节点 ID
 * @param {object} position - 位置
 */
function createLLMNode(nodeId, position) {
  return {
    id: nodeId,
    type: StandardNodeType.LLM,
    position: position || { x: 400, y: 250 },
    data: {
      title: '大模型',
      description: '调用大语言模型',
      batchMode: BatchMode.Single,
      model: {
        modelType: 'default',
      },
      $$input_decorator$$: {
        inputParameters: [],  // 输入参数
        chatHistorySetting: {
          enableChatHistory: false,
          chatHistoryRound: 5,
        },
      },
      $$prompt_decorator$$: {
        systemPrompt: '',
        prompt: '',
      },
      batch: {
        batchSize: 10,
      },
      fcParam: [],  // Function Calling 技能
      outputs: [
        {
          key: 'answer',
          name: 'answer',
          type: VariableTypeDTO.string,
        },
      ],
      nodeMeta: {
        title: '大模型',
        description: '调用大语言模型',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.LLM].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.LLM].color,
      },
    },
  };
}

/**
 * 创建循环节点
 * @param {string} nodeId - 节点 ID
 * @param {object} position - 位置
 */
function createLoopNode(nodeId, position) {
  return {
    id: nodeId,
    type: StandardNodeType.Loop,
    position: position || { x: 400, y: 250 },
    data: {
      title: '循环',
      description: '循环执行',
      inputs: {
        loopType: LoopType.Array,
        loopCount: createValueExpression(10),
        inputParameters: [],  // 数组输入
        variableParameters: [],  // 循环变量
      },
      outputs: [],
      nodeMeta: {
        title: '循环',
        description: '循环执行',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.Loop].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.Loop].color,
      },
    },
  };
}

/**
 * 创建 HTTP 节点
 * @param {string} nodeId - 节点 ID
 * @param {object} position - 位置
 */
function createHttpNode(nodeId, position) {
  return {
    id: nodeId,
    type: StandardNodeType.Http,
    position: position || { x: 400, y: 250 },
    data: {
      title: 'HTTP 请求',
      description: '发送 HTTP 请求',
      inputs: {
        method: 'GET',
        url: createValueExpression(''),
        headers: [],
        body: createValueExpression(''),
        timeout: 30000,
      },
      outputs: [
        {
          key: 'response',
          name: 'response',
          type: VariableTypeDTO.object,
        },
      ],
      nodeMeta: {
        title: 'HTTP 请求',
        description: '发送 HTTP 请求',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.Http].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.Http].color,
      },
    },
  };
}

/**
 * 创建代码节点
 * @param {string} nodeId - 节点 ID
 * @param {object} position - 位置
 */
function createCodeNode(nodeId, position) {
  return {
    id: nodeId,
    type: StandardNodeType.Code,
    position: position || { x: 400, y: 250 },
    data: {
      title: '代码',
      description: '执行代码',
      language: 'javascript',
      code: '',
      inputParameters: [],
      outputs: [
        {
          key: 'result',
          name: 'result',
          type: VariableTypeDTO.string,
        },
      ],
      nodeMeta: {
        title: '代码',
        description: '执行代码',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.Code].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.Code].color,
      },
    },
  };
}

/**
 * 创建条件节点
 * @param {string} nodeId - 节点 ID
 * @param {object} position - 位置
 */
function createIfNode(nodeId, position) {
  return {
    id: nodeId,
    type: StandardNodeType.If,
    position: position || { x: 400, y: 250 },
    data: {
      title: '条件判断',
      description: '条件分支',
      inputs: {
        conditions: [],
      },
      nodeMeta: {
        title: '条件判断',
        description: '条件分支',
        icon: NODE_TEMPLATE_INFO[StandardNodeType.If].icon_url,
        mainColor: NODE_TEMPLATE_INFO[StandardNodeType.If].color,
      },
    },
  };
}

// ==================== 节点操作工具 ====================
/**
 * 获取节点的所有输出变量
 * @param {object} node - 节点对象
 * @returns {array} - 输出变量列表
 */
function getNodeOutputVariables(node) {
  if (!node || !node.data) {
    return [];
  }

  // 开始节点
  if (node.type === StandardNodeType.Start) {
    return node.data.outputs || [];
  }

  // 结束节点
  if (node.type === StandardNodeType.End) {
    return node.data.inputs?.inputParameters || [];
  }

  // 其他节点
  return node.data.outputs || [];
}

/**
 * 获取节点的所有输入变量
 * @param {object} node - 节点对象
 * @returns {array} - 输入变量列表
 */
function getNodeInputVariables(node) {
  if (!node || !node.data) {
    return [];
  }

  // LLM 节点
  if (node.type === StandardNodeType.LLM) {
    return node.data.$$input_decorator$$?.inputParameters || [];
  }

  // 循环节点
  if (node.type === StandardNodeType.Loop) {
    return [
      ...(node.data.inputs?.inputParameters || []),
      ...(node.data.inputs?.variableParameters || []),
    ];
  }

  // HTTP 节点
  if (node.type === StandardNodeType.Http) {
    const inputs = [];
    if (node.data.inputs?.url) {
      inputs.push({ name: 'url', value: node.data.inputs.url });
    }
    if (node.data.inputs?.headers) {
      node.data.inputs.headers.forEach(header => {
        inputs.push({ name: `header.${header.key}`, value: header.value });
      });
    }
    if (node.data.inputs?.body) {
      inputs.push({ name: 'body', value: node.data.inputs.body });
    }
    return inputs;
  }

  // 代码节点
  if (node.type === StandardNodeType.Code) {
    return node.data.inputParameters || [];
  }

  return [];
}

/**
 * 获取某个节点的所有祖先节点 ID（沿边逆向遍历）
 * @param {array} edges - 边列表
 * @param {string} nodeId - 当前节点 ID
 * @returns {Set<string>} - 祖先节点 ID 集合
 */
function getAncestorNodeIds(edges, nodeId) {
  const ancestors = new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const edge of edges) {
      if (edge.target === currentId && !ancestors.has(edge.source)) {
        ancestors.add(edge.source);
        queue.push(edge.source);
      }
    }
  }
  return ancestors;
}

/**
 * 获取流程中所有可用变量
 * @param {array} nodes - 所有节点
 * @param {array} [edges] - 边列表（可选，提供则仅返回祖先节点变量）
 * @param {string} excludeNodeId - 排除的节点 ID
 * @returns {array} - 可用变量列表，按节点分组
 */
function getAllAvailableVariables(nodes, edges, excludeNodeId) {
  const variables = [];
  const ancestorIds = edges ? getAncestorNodeIds(edges, excludeNodeId) : null;

  nodes.forEach(node => {
    if (node.id === excludeNodeId) {
      return;
    }
    if (ancestorIds && !ancestorIds.has(node.id)) {
      return;
    }

    const outputs = getNodeOutputVariables(node);
    if (outputs.length > 0) {
      variables.push({
        nodeId: node.id,
        nodeName: node.data?.title || node.id,
        nodeIcon: NODE_TEMPLATE_INFO[node.type]?.icon || '📦',
        nodeColor: NODE_TEMPLATE_INFO[node.type]?.color || '#8C8C8C',
        variables: outputs.map(output => ({
          name: output.name,
          type: output.type,
          key: output.key,
          children: output.children,
        })),
      });
    }
  });

  return variables;
}

/**
 * 根据节点类型获取可用节点类型列表
 * 用于添加节点选择器
 * @returns {array} - 可用节点类型列表
 */
function getAvailableNodeTypes() {
  return [
    {
      type: StandardNodeType.LLM,
      ...NODE_TEMPLATE_INFO[StandardNodeType.LLM],
    },
    {
      type: StandardNodeType.Http,
      ...NODE_TEMPLATE_INFO[StandardNodeType.Http],
    },
    {
      type: StandardNodeType.Code,
      ...NODE_TEMPLATE_INFO[StandardNodeType.Code],
    },
    {
      type: StandardNodeType.If,
      ...NODE_TEMPLATE_INFO[StandardNodeType.If],
    },
    {
      type: StandardNodeType.Loop,
      ...NODE_TEMPLATE_INFO[StandardNodeType.Loop],
    },
    {
      type: StandardNodeType.Variable,
      ...NODE_TEMPLATE_INFO[StandardNodeType.Variable],
    },
    {
      type: StandardNodeType.SetVariable,
      ...NODE_TEMPLATE_INFO[StandardNodeType.SetVariable],
    },
    {
      type: StandardNodeType.Batch,
      ...NODE_TEMPLATE_INFO[StandardNodeType.Batch],
    },
  ];
}

// ==================== 导出到全局 ====================
// 将所有类和函数暴露到全局作用域，以便 HTML 中使用

if (typeof window !== 'undefined') {
  // 节点类型
  window.StandardNodeType = StandardNodeType;
  window.VariableTypeDTO = VariableTypeDTO;
  window.ValueExpressionType = ValueExpressionType;
  window.LoopType = LoopType;
  window.BatchMode = BatchMode;
  window.NODE_TEMPLATE_INFO = NODE_TEMPLATE_INFO;

  // 工具函数
  window.parseVariableReference = parseVariableReference;
  window.createVariableReference = createVariableReference;
  window.isVariableReference = isVariableReference;
  window.extractValue = extractValue;
  window.createValueExpression = createValueExpression;

  // 节点创建函数
  window.createDefaultStartNode = createDefaultStartNode;
  window.createDefaultEndNode = createDefaultEndNode;
  window.createLLMNode = createLLMNode;
  window.createLoopNode = createLoopNode;
  window.createHttpNode = createHttpNode;
  window.createCodeNode = createCodeNode;
  window.createIfNode = createIfNode;

  // 节点操作函数
  window.getNodeOutputVariables = getNodeOutputVariables;
  window.getNodeInputVariables = getNodeInputVariables;
  window.getAncestorNodeIds = getAncestorNodeIds;
  window.getAllAvailableVariables = getAllAvailableVariables;
  window.getAvailableNodeTypes = getAvailableNodeTypes;
}

// 如果是 Node.js 环境，导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    StandardNodeType,
    VariableTypeDTO,
    ValueExpressionType,
    LoopType,
    BatchMode,
    NODE_TEMPLATE_INFO,
    parseVariableReference,
    createVariableReference,
    isVariableReference,
    extractValue,
    createValueExpression,
    createDefaultStartNode,
    createDefaultEndNode,
    createLLMNode,
    createLoopNode,
    createHttpNode,
    createCodeNode,
    createIfNode,
    getNodeOutputVariables,
    getNodeInputVariables,
    getAncestorNodeIds,
    getAllAvailableVariables,
    getAvailableNodeTypes,
  };
}
