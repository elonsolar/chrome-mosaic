// 获取会话ID
const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get('id');

/**
 * 消息类型枚举（与 background/core/constants.js 保持一致）
 */
const MessageType = {
  MEMBER: 'member',      // 成员消息（默认，成员回复）
  USER: 'user',          // 用户消息
  INTRO: 'intro',        // 自我介绍消息
  TIP: 'tip'             // 系统提示消息
};

// Kimi 过载检测关键词
const OVERLOAD_PATTERNS = [
  '不好意思', '人太多了', '高峰期算力不足',
  'Kimi有点累了', '请晚点再问我', '服务繁忙', '系统繁忙'
];

function isKimiOverloadError(error) {
  const msg = error?.message || error || '';
  return OVERLOAD_PATTERNS.some(p => msg.includes(p));
}

const INPUT_TIPS_COMMON = [
  'Shift+Enter 换行，Enter 发送',
  'Ctrl+K 搜索历史对话',
  '点击成员头像可查看对话详情',
  '点击右上角图标切换明暗主题',
  '支持 Markdown 格式和数学公式',
  '右键会话可重命名、导出或删除',
];

const INPUT_TIPS_BRAINSTORMING = [
  '输入 @ 成员名 可以定向发送给指定成员',
  '输入 / 查看可用命令',
  '各成员独享上下文，互不影响',
];

const INPUT_TIPS_DISCUSSION = [
  '输入 /loop 问题 --max=5 发起多轮讨论',
  '输入 / 查看可用命令',
  '成员共享上下文，按顺序依次发言',
  '拖拽成员标签可调整发言顺序',
];

const INPUT_TIPS_EXPERTQA = [
  '输入 / 查看可用命令',
  '点击「查看执行过程」了解专家推理链路',
];

function getContextTips() {
  const mode = state.conversation?.mode || 'brainstorming';
  const modeTips = mode === 'discussion' ? INPUT_TIPS_DISCUSSION
    : mode === 'expertqa' ? INPUT_TIPS_EXPERTQA
    : INPUT_TIPS_BRAINSTORMING;
  return [...modeTips, ...INPUT_TIPS_COMMON];
}

let tipCarouselTimer = null;
let tipCarouselIndex = 0;

function startTipCarousel() {
  stopTipCarousel();
  if (!elements.messageInput || !state.conversation) return;
  const hasMembers = (state.conversation.members && state.conversation.members.length > 0) ||
    (state.conversation.mode === 'expertqa' && state.conversation.expertId);
  if (!hasMembers) return;

  tipCarouselTimer = setInterval(() => {
    if (elements.messageInput.value.trim() === '' && document.activeElement === elements.messageInput) {
      const tips = getContextTips();
      elements.messageInput.placeholder = tips[tipCarouselIndex % tips.length];
      tipCarouselIndex++;
    }
  }, 4000);
}

function stopTipCarousel() {
  if (tipCarouselTimer) {
    clearInterval(tipCarouselTimer);
    tipCarouselTimer = null;
  }
}

// Mode Examples 数据（内联）
const MODE_EXAMPLES = {
  brainstorming: [
    {
      label: '接口响应 3 秒，各模型独立找瓶颈',
      name: '我们的 API 接口平均响应 3 秒，数据库是 PostgreSQL，框架是 Express，各模型独立分析最可能的瓶颈在哪',
      preview: { user: '我们的 API 响应要 3 秒，帮我看下瓶颈可能在哪', ai: [
        { name: 'DeepSeek', text: '先查数据库慢查询日志，大概率是 N+1 查询或缺索引' },
        { name: '千问', text: '检查 Express 中间件链，可能是序列化或鉴权中间件阻塞了请求' },
      ]}
    },
    {
      label: '页面白屏 2 秒，各模型独立排查',
      name: 'Vue 3 项目首页白屏 2 秒，打包后 main.js 有 1.8MB，各模型独立分析是打包配置问题还是加载策略问题',
      preview: { user: '首页白屏 2 秒，main.js 1.8MB，怎么优化？', ai: [
        { name: '千问', text: '1.8MB 太大了，先用 rollup-plugin-visualizer 看看是什么占了体积' },
        { name: 'Kimi', text: '路由级别做懒加载，首屏只加载必要代码，其余按需导入' },
      ]}
    },
    {
      label: '内存持续增长，各模型独立定位',
      name: 'Node 服务运行 2 天后内存涨到 1.5GB，重启后恢复，各模型独立分析可能的泄漏点在哪',
      preview: { user: 'Node 服务跑 2 天内存涨到 1.5G，重启就好，哪里泄漏了？', ai: [
        { name: 'DeepSeek', text: '用 --inspect 跟 heap snapshot，重点查闭包和事件监听器未清理' },
        { name: '豆包', text: '检查全局缓存有没有 TTL，常见的 Map/Set 只加不删就是泄漏' },
      ]}
    },
    {
      label: '各模型分别推荐一种数据库',
      name: '新项目日活预计 5 万，需要存储用户行为日志和支持复杂查询，各模型分别推荐 PostgreSQL、MongoDB、MySQL 中的一种',
      preview: { user: '新项目日活 5 万，要存日志也要复杂查询，选什么数据库？', ai: [
        { name: '千问', text: '推荐 PostgreSQL，JSONB 存日志 + SQL 做复杂查询，一个库搞定' },
        { name: 'DeepSeek', text: '推荐 MongoDB，日志天然是文档型，聚合管道分析也够用' },
      ]}
    },
    {
      label: '各模型分别给 Docker 镜像瘦身方案',
      name: '我们的 Docker 镜像 1.2GB，构建要 8 分钟，各模型独立给出不同的瘦身思路',
      preview: { user: 'Docker 镜像 1.2GB，构建 8 分钟，太慢太大了', ai: [
        { name: '豆包', text: '用多阶段构建，builder 阶段装依赖，runtime 阶段只拷贝产物' },
        { name: '千问', text: '换 Alpine 基础镜像，再用 .dockerignore 排除 node_modules 和测试文件' },
      ]}
    },
    {
      label: '各模型分析用户留存率下降原因',
      name: '产品注册后 7 天留存只有 5%，各模型独立分析是 onboarding、功能、定价还是竞品的问题',
      preview: { user: '7 天留存只有 5%，到底是哪里出了问题？', ai: [
        { name: 'DeepSeek', text: '先看注册后的 onboarding 流程完成率，用户可能卡在第一步就走了' },
        { name: 'Kimi', text: '对比留存用户和流失用户的行为路径，找到关键差异点' },
      ]}
    },
    {
      label: '各模型评估 Go vs Rust 做后端',
      name: '团队考虑用 Go 或 Rust 重写后端服务，各模型分别从性能、生态、学习成本、招聘难度角度分析',
      preview: { user: '后端要重写，Go 和 Rust 选哪个？', ai: [
        { name: '千问', text: '选 Go，学习成本低、招聘容易、生态成熟，适合快速迭代' },
        { name: 'DeepSeek', text: '选 Rust，性能极致、内存安全，适合对延迟敏感的核心服务' },
      ]}
    },
    {
      label: '各模型给 React 渲染卡顿优化方案',
      name: 'React 列表页面渲染 500 条数据卡顿，各模型独立给出优化方案',
      preview: { user: 'React 渲染 500 条列表卡顿，怎么优化？', ai: [
        { name: '豆包', text: '用 react-window 做虚拟滚动，只渲染可视区域的 DOM' },
        { name: '千问', text: '先用 React DevTools Profiler 定位哪个组件重渲染了，再 memo 优化' },
      ]}
    },
  ],
  discussion: [
    {
      label: '电商项目要不要拆微服务？',
      name: '我们电商项目日订单 5000，代码 8 万行，部署一次要 15 分钟，讨论到底要不要拆微服务',
      preview: { user: '电商项目日订单 5000，代码 8 万行，部署要 15 分钟，要不要拆微服务？', ai: [
        { name: 'DeepSeek', text: '8 万行还不大，先拆订单和支付两个独立部署就够了，别过度拆分' },
        { name: '千问', text: '同意 DeepSeek 说的，而且部署慢的问题可能 CI/CD 优化收益更大' },
        { name: '豆包', text: '补充一点：你们说的对，但拆之前先做好服务间通信的基础设施，不然后面更乱' },
      ]}
    },
    {
      label: 'JS 项目要不要上 TypeScript？',
      name: '现有 JS 项目 15 万行，团队 8 人，讨论上 TS 的迁移成本、收益、风险',
      preview: { user: 'JS 项目 15 万行，团队 8 人，要不要上 TypeScript？', ai: [
        { name: '千问', text: '建议渐进式迁移，新文件用 TS，旧文件加 @ts-check，逐步收紧' },
        { name: 'DeepSeek', text: '同意渐进式，但 15 万行全转不现实，先把核心模块和公共库类型化收益最高' },
        { name: 'Kimi', text: '两位说的都对，补充一点：先评估团队 TS 熟练度，都不会的话先培训一周再开工' },
      ]}
    },
    {
      label: 'REST 改 GraphQL 值不值？',
      name: '前端抱怨接口太多要调 5 次，后端说 GraphQL 增加复杂度，讨论成本和收益',
      preview: { user: '前端说接口调太多想换 GraphQL，后端觉得太复杂，怎么看？', ai: [
        { name: 'DeepSeek', text: '先试试 BFF 层聚合，用一个接口包装多次调用，成本比换 GraphQL 低很多' },
        { name: '千问', text: '完全同意，GraphQL 的学习和维护成本对你们团队来说可能得不偿失' },
        { name: 'Kimi', text: '对，如果接口数量不多 BFF 就够了，除非数据模型真的很复杂再考虑 GraphQL' },
      ]}
    },
    {
      label: '评审这份 API 接口设计',
      name: '评审 REST API 接口设计文档，讨论命名规范、错误码设计、版本策略、分页方案',
      preview: { user: '大家帮我看看这份 API 设计有没有问题', ai: [
        { name: 'DeepSeek', text: '错误码用 HTTP 状态码就好，别自定义一套，客户端处理起来更统一' },
        { name: '千问', text: '补充 DeepSeek 的观点：分页建议用 cursor-based 而不是 offset，数据量大了 offset 性能差' },
        { name: '豆包', text: '两位说得对，再加一条：URL 里别放动词，用名词复数 + HTTP 方法表达操作' },
      ]}
    },
    {
      label: 'Monorepo 还是多仓库？',
      name: '团队 12 人维护 5 个前端项目，讨论是否应该转 Monorepo，工具选 Turborepo 还是 Nx',
      preview: { user: '12 人维护 5 个前端项目，要不要转 Monorepo？', ai: [
        { name: '千问', text: '5 个项目有共享组件的话值得转，Turborepo 上手简单，适合你们的规模' },
        { name: 'DeepSeek', text: '同意，但要先理清项目间的依赖关系，如果完全独立就没必要折腾' },
        { name: 'Kimi', text: '两位说的都在理，建议先拿 2 个关联最紧密的项目试水，别一次全转' },
      ]}
    },
    {
      label: '前端状态管理选哪个？',
      name: '新项目状态管理选 Redux Toolkit、Zustand 还是 Jotai？讨论各方案在中大型项目中的表现',
      preview: { user: '新项目状态管理选 Redux Toolkit 还是 Zustand？', ai: [
        { name: 'DeepSeek', text: 'Zustand，API 简单、bundle 小、不需要 Provider 包裹，开发体验好很多' },
        { name: '千问', text: '但 Zustand 的 devtools 和中间件生态不如 Redux Toolkit 成熟，中大型项目维护成本高' },
        { name: '豆包', text: '同意千问说的，先看状态复杂度，简单用 Zustand，复杂用 RTK，别过度设计' },
      ]}
    },
    {
      label: '要不要引入 Redis？',
      name: '当前用内存存 session，日活 2 万，讨论是否需要引入 Redis 以及运维成本',
      preview: { user: '现在内存存 session，日活 2 万，要上 Redis 吗？', ai: [
        { name: 'DeepSeek', text: '2 万日活单机内存还扛得住，等多实例部署时再引入 Redis 也不迟' },
        { name: '千问', text: 'DeepSeek 说的对，但如果计划做水平扩展，现在就上 Redis 不然 session 共享是大问题' },
        { name: 'Kimi', text: 'Redis 运维成本其实不高，云服务商都有托管实例，建议早用早省心' },
      ]}
    },
    {
      label: 'Code Review 流程怎么优化？',
      name: '团队 Code Review 经常卡 2-3 天，讨论如何优化：PR 大小规范、自动化检查、Review 轮值',
      preview: { user: 'Code Review 总是卡 2-3 天，怎么优化流程？', ai: [
        { name: '豆包', text: 'PR 控制在 400 行以内，大的改动拆成多个小 PR，review 速度会快很多' },
        { name: '千问', text: '同意小 PR 的做法，再加 CI 自动检查 lint、类型检查、测试覆盖率，把机械性工作去掉' },
        { name: 'DeepSeek', text: '两位说的都对，再搞个 review 轮值表，每人每天分配 2 个 PR，别让某个人成为瓶颈' },
      ]}
    },
  ],
  expertqa: [
    {
      label: '设计电商支付模块架构',
      name: '设计电商系统的支付模块：日交易量 5 万，对接微信和支付宝，需要退款和自动对账',
      preview: { user: '帮我设计支付模块，日交易量 5 万，对接微信和支付宝，需要退款和自动对账', ai: [
        { name: '支付架构专家', text: '支付网关：统一接口封装渠道差异，requestId 保证幂等性，异步回调 + 消息队列确保最终一致性。退款：申请→风控→渠道退款→状态回调，全程异步。对账：每日定时拉取渠道账单自动核对，差异告警。' },
      ]}
    },
    {
      label: '后端项目代码质量审计',
      name: '对 Node.js + Express 后端做全面审计：PostgreSQL + Sequelize，代码 3 万行',
      preview: { user: '审计这个 Node.js + Express 后端项目，PostgreSQL + Sequelize，代码 3 万行', ai: [
        { name: '代码审计专家', text: '安全：3 处 SQL 拼接有注入风险，2 处用户输入未转义有 XSS 风险。依赖：npm audit 5 个高危，express-jwt 需升级。质量：错误处理不统一，建议加全局异常中间件；缺少请求参数校验。' },
      ]}
    },
    {
      label: '竞品分析报告',
      name: '分析团队协作工具竞品（飞书、Notion、Confluence），我们面向中小研发团队',
      preview: { user: '分析飞书、Notion、Confluence 竞品，我们面向中小研发团队，主打轻量', ai: [
        { name: '竞品分析专家', text: '飞书：一体化强但重，中小团队用不满。Notion：灵活但缺研发流程集成。Confluence：企业级但体验老旧。差异化建议：聚焦轻量 + 本地优先 + 离线协作，三者都没做好这个方向。' },
      ]}
    },
    {
      label: '设计 RBAC 权限系统',
      name: '设计多租户权限系统，需要 RBAC + ABAC，控制到按钮和接口级别',
      preview: { user: '设计多租户权限系统，RBAC + ABAC，控制到按钮和接口级别', ai: [
        { name: '系统架构专家', text: '模型：用户-角色-权限三层，角色绑定租户 tenant_id 隔离数据。权限分功能权限（菜单/按钮）+ 数据权限（行级/列级）+ API 权限。实现：中间件统一拦截校验，权限数据缓存 Redis 减少查库。' },
      ]}
    },
    {
      label: 'MySQL 迁移 PostgreSQL 方案',
      name: 'MySQL 5.7 迁移到 PostgreSQL 15，TypeORM，有存储过程，数据量 200GB',
      preview: { user: 'MySQL 5.7 迁移到 PG 15，用 TypeORM，有几个存储过程，数据 200GB', ai: [
        { name: '数据库迁移专家', text: '数据映射：AUTO_INCREMENT→SERIAL，DATETIME→TIMESTAMPTZ，ENUM→VARCHAR+CHECK。存储过程改写为应用层逻辑。TypeORM 只需改连接配置。迁移策略：双写灰度 2 周，先读 PG 写 MySQL，验证后全切。' },
      ]}
    },
    {
      label: '设计实时消息推送系统',
      name: '设计千万级用户实时通知系统，Web 和 App 都要支持，消息不能丢',
      preview: { user: '设计千万级用户实时通知系统，Web 和 App 都要支持，消息不能丢', ai: [
        { name: '系统架构专家', text: '架构：WebSocket 网关集群 + Redis Pub/Sub 分发，按用户 ID 哈希分配连接。可靠性：消息先落库再推送，客户端 ACK 确认，未确认定时重试。降级：WebSocket 不可用自动切长轮询。多端：统一推送网关封装 APNs/FCM/WebPush。' },
      ]}
    },
  ],
};

// 状态
const state = {
  conversation: null,
  members: [],
  memberStatus: {}, // memberId -> { status: 'online'|'offline', isBusy: boolean }
  flowExecutionLogs: [] // 流程执行日志
};

let isMemberReplyingMode = false;

let mentionState = {
  active: false,
  query: '',
  startIndex: -1,
  selectedIndex: 0,
  filteredMembers: []
};

// Dashboard 动画状态
const dashboardState = {
  modeTimers: {},
  modeCurrentIndex: { brainstorming: -1, discussion: -1, expertqa: -1 },
  modePlaying: {},
  showcaseIndex: 0,
  showcaseTimer: null
};

// DOM元素
const elements = {
  membersTags: null,
  messagesContainer: null,
  messageInput: null,
  sendBtn: null
};

// 初始化
async function init() {
  initElements();

  messageStore = new MessageStore(elements.messagesContainer);

  await initSidebar();

  if (!conversationId) {
    // 没有会话ID时，显示 dashboard mode showcase
    renderDashboardWelcome();
    // 绑定事件（即使没有会话ID也要绑定平台面板等基础功能）
    bindEvents();
    initSmartPanel();
    return;
  }

  // 加载数据
  await loadData();



  // 检查是否需要自动发送消息
  const autoSendMessage = urlParams.get('autoSend');
  if (autoSendMessage) {
    // 清除URL参数
    window.history.replaceState({}, '', `chat.html?id=${conversationId}`);
    
    // 设置输入框内容并自动发送
    setTimeout(async () => {
      elements.messageInput.value = decodeURIComponent(autoSendMessage);
      await sendMessage();
    }, 500);
  }

  // 绑定事件
  bindEvents();

  // 初始渲染
  renderScrollBar();
  renderSummaryFloatBtn();

  // 监听存储变化（实时更新UI）
  chrome.storage.onChanged.addListener((changes, areaName) => {
    console.log('[Chat:DIAG] storage.onChanged fired - areaName:', areaName, 'keys:', Object.keys(changes));
    if (areaName === 'local' && changes.conversations) {
      const oldCount = changes.conversations.oldValue?.length || 0;
      const newCount = changes.conversations.newValue?.length || 0;
      console.log('[Chat:DIAG] storage.onChanged - conversations changed, old:', oldCount, 'new:', newCount);
      handleStorageChange(changes.conversations);
      // 同时更新侧边栏
      loadSidebarConversations();
    } else {
      console.log('[Chat:DIAG] storage.onChanged - ignored (not local or not conversations)');
    }
  });

  // 渲染界面
  render();

  // 初始化智能面板
  initSmartPanel();
}

function initElements() {
  // 首先修复DOM结构，确保messages-container和input-container在chat-container内部
  fixDOMStructure();
  
  elements.membersTags = document.getElementById('membersTags');
  elements.messagesContainer = document.getElementById('messagesContainer');
  elements.messageInput = document.getElementById('messageInput');
  elements.sendBtn = document.getElementById('sendBtn');
  elements.modeBadge = document.getElementById('modeBadge');
  elements.smartPanel = document.getElementById('smartPanel');
  elements.smartPanelToggle = document.getElementById('smartPanelToggle');
  elements.loopProgressFixed = document.getElementById('loopProgressFixed');
  elements.scrollBtnContainer = document.getElementById('scrollBtnContainer');
  elements.mentionDropdown = document.getElementById('mentionDropdown');

  // 创建摘要浮动图标（位于消息区右下角）
  elements.summaryFloatBtn = document.createElement('button');
  elements.summaryFloatBtn.className = 'summary-float-btn';
  elements.summaryFloatBtn.title = '查看讨论摘要';
  elements.summaryFloatBtn.innerHTML = '📋';
  elements.summaryFloatBadge = document.createElement('span');
  elements.summaryFloatBadge.className = 'summary-float-badge';
  elements.summaryFloatBtn.appendChild(elements.summaryFloatBadge);
  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) {
    chatContainer.appendChild(elements.summaryFloatBtn);
  }
}

// 修复DOM结构，确保关键元素在正确的位置
function fixDOMStructure() {
  const chatContainer = document.querySelector('.chat-container');
  const messagesContainer = document.getElementById('messagesContainer');
  const inputContainer = document.querySelector('.input-container');
  
  if (!chatContainer || !messagesContainer || !inputContainer) {
    console.warn('[Chat] fixDOMStructure - Missing required elements');
    return;
  }
  
  // 检查messages-container的父元素是否是chat-container
  if (messagesContainer.parentElement !== chatContainer) {
    console.log('[Chat] fixDOMStructure - Moving messages-container to chat-container');
    
    // 保存chat-container中的现有元素
    const chatHeader = document.querySelector('.chat-header');
    const chatInfo = document.querySelector('.chat-info');
    
    // 清空chat-container
    chatContainer.innerHTML = '';
    
    // 重新添加元素，确保顺序正确
    if (chatHeader) chatContainer.appendChild(chatHeader);
    if (chatInfo) chatContainer.appendChild(chatInfo);
    chatContainer.appendChild(messagesContainer);
    chatContainer.appendChild(inputContainer);
  }
  
  // 检查input-container的父元素是否是chat-container
  if (inputContainer.parentElement !== chatContainer) {
    console.log('[Chat] fixDOMStructure - Moving input-container to chat-container');
    chatContainer.appendChild(inputContainer);
  }
}

async function loadData() {
  try {
    console.log('[Chat:DIAG] loadData - starting, conversationId:', conversationId);
    const [conversation, models, platforms, prompts, experts] = await Promise.all([
      getConversation(conversationId),
      chrome.runtime.sendMessage({ action: 'getModels' }).catch(() => []),
      chrome.runtime.sendMessage({ action: 'getPlatforms' }).catch(() => []),
      chrome.runtime.sendMessage({ action: 'getPrompts' }).catch(() => []),
      chrome.runtime.sendMessage({ action: 'getExperts' }).catch(() => [])
    ]);

    console.log('[Chat] loadData - conversation:', conversation);
    console.log('[Chat] loadData - conversation.members:', conversation?.members);
    console.log('[Chat] loadData - conversation.mode:', conversation?.mode);
    console.log('[Chat] loadData - conversation.contextMode:', conversation?.contextMode);
    console.log('[Chat] loadData - conversation.sendMode:', conversation?.sendMode);
    console.log('[Chat] loadData - conversation.messages count:', conversation?.messages?.length);
    console.log('[Chat] loadData - platforms:', platforms);
    console.log('[Chat:DIAG] loadData - models:', models?.length, 'platforms:', platforms?.length, 'prompts:', prompts?.length, 'experts:', experts?.length);

    state.conversation = conversation;
    state.models = models || [];
    state.platforms = platforms || [];
    state.prompts = prompts || [];
    state.experts = experts || [];

    // 如果提示词为空，触发初始化内置提示词
    if (!state.prompts || state.prompts.length === 0) {
      console.log('[Chat] 提示词为空，触发后台初始化');
      await chrome.runtime.sendMessage({ action: 'initializeBuiltinPrompts' });
      // 重新加载提示词
      state.prompts = await chrome.runtime.sendMessage({ action: 'getPrompts' }).catch(() => []);
      console.log('[Chat] 初始化后提示词数量:', state.prompts.length);
    }

    if (!conversation) {
      showError('会话不存在');
    }
  } catch (error) {
    console.error('加载数据失败:', error);
    showError('加载数据失败');
  }
}

function bindEvents() {
  elements.sendBtn.addEventListener('click', () => {
    console.log('[Chat:DIAG] sendBtn clicked');
    sendMessage();
  });

  elements.messageInput.addEventListener('keydown', (e) => {
    if (mentionState.active) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionState.selectedIndex = Math.min(mentionState.selectedIndex + 1, mentionState.filteredMembers.length - 1);
        renderMentionDropdown();
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionState.selectedIndex = Math.max(mentionState.selectedIndex - 1, 0);
        renderMentionDropdown();
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionState.filteredMembers.length > 0) {
          e.preventDefault();
          selectMentionItem(mentionState.filteredMembers[mentionState.selectedIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        hideMentionDropdown();
        hideCommandSuggestions();
        return;
      }
    }

    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const value = e.target.value;
      e.target.value = value.substring(0, start) + '\n' + value.substring(end);
      e.target.selectionStart = e.target.selectionEnd = start + 1;
      e.target.dispatchEvent(new Event('input'));
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      const value = e.target.value.trim();
      console.log('[Chat:DIAG] Enter pressed, value length:', value.length, 'conversationId:', conversationId, 'sendBtn disabled:', elements.sendBtn.disabled);

      // 新对话：按回车显示创建会话弹窗
      if (!conversationId && value) {
        console.log('[Chat:DIAG] No conversation, showing create modal');
        showNewConversationWithInput(value);
        return;
      }

      if (value.startsWith('/')) {
        const filter = value.substring(1).toLowerCase();
        const candidates = getFilteredCommands(filter);

        if (candidates.length > 0) {
          const cmd = candidates[0];
          hideCommandSuggestions();
          // 如果输入已经是完整命令（带参数），直接发送
          if (value.startsWith(cmd.name + ' ') || value === cmd.name) {
            sendMessage();
          } else {
            // 否则补全命令名
            elements.messageInput.value = cmd.name + ' ';
            // 需要参数的命令不立即发送，等待用户输入参数
            if (cmd.hasArgs) {
              return;
            }
            sendMessage();
          }
        } else {
          // 尝试用命令名部分匹配（忽略参数）
          const cmdName = '/' + filter.split(/\s+/)[0];
          const exactCmd = availableCommands.find(c => c.name === cmdName);
          if (exactCmd) {
            hideCommandSuggestions();
            sendMessage();
          } else {
            showError('没有匹配的命令: ' + value);
            hideCommandSuggestions();
          }
        }
        return;
      }

      if (selectCandidateCommand()) {
        return;
      }
      console.log('[Chat:DIAG] Enter -> calling sendMessage()');
      sendMessage();
    } else if (e.key === 'Escape') {
      hideCommandSuggestions();
    }
  });

  elements.messageInput.addEventListener('input', (e) => {
    const value = e.target.value;
    updateSendButtonState();

    if (value === '/') {
      showCommandSuggestions();
    } else if (value.startsWith('/') && !value.includes(' ')) {
      const filter = value.substring(1).toLowerCase();
      showCommandSuggestions(filter);
    } else {
      hideCommandSuggestions();
    }

    handleMentionInput(e.target);
  });

  elements.messageInput.addEventListener('focus', () => {
    if (elements.messageInput.value.trim() === '') {
      const tips = getContextTips();
      elements.messageInput.placeholder = tips[tipCarouselIndex % tips.length];
    }
    startTipCarousel();
  });

  elements.messageInput.addEventListener('blur', () => {
    stopTipCarousel();
    const hasMembers = state.conversation && ((state.conversation.members && state.conversation.members.length > 0) ||
      (state.conversation.mode === 'expertqa' && state.conversation.expertId));
    if (hasMembers) {
      elements.messageInput.placeholder = '输入消息...';
    }
  });

  // 成员标签点击事件
  elements.membersTags.addEventListener('click', (e) => {
    // 成员删除按钮
    const removeBtn = e.target.closest('.member-tag-remove');
    if (removeBtn) {
      const tag = removeBtn.closest('.member-tag');
      const memberId = tag.dataset.memberId;
      removeMemberFromConversation(memberId);
      return;
    }

    // 点击成员标签打开配置模态框
    const tag = e.target.closest('.member-tag');
    if (tag) {
      const memberId = tag.dataset.memberId;
      openMemberConfigModal(memberId);
    }
  });

  // 添加成员按钮
  const memberAddBtn = document.getElementById('memberAddBtn');
  console.log('[DEBUG] memberAddBtn found:', !!memberAddBtn, memberAddBtn);
  if (memberAddBtn) {
    memberAddBtn.addEventListener('click', (e) => {
      console.log('[DEBUG] memberAddBtn clicked!');
      e.stopPropagation();
      e.preventDefault();
      try {
        showAddMemberModal();
      } catch (error) {
        console.error('[DEBUG] showAddMemberModal error:', error);
      }
    });
    console.log('[DEBUG] Event listener attached to memberAddBtn');
  } else {
    console.error('[DEBUG] memberAddBtn NOT FOUND in DOM!');
  }

  // 摘要浮动图标点击
  if (elements.summaryFloatBtn) {
    elements.summaryFloatBtn.addEventListener('click', () => {
      toggleSummaryPopover();
    });
  }

  // 监听消息容器滚动（更新回到底部条和摘要按钮）
  elements.messagesContainer.addEventListener('scroll', () => {
    renderScrollBar();
    renderSummaryFloatBtn();
  });

  // 智能面板切换
  if (elements.smartPanelToggle) {
    elements.smartPanelToggle.addEventListener('click', toggleSmartPanel);
  }

  // 智能面板标签切换
  const tabs = document.querySelectorAll('.smart-panel-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.smart-panel-tab-content').forEach(c => c.classList.remove('active'));
      const content = document.getElementById(`smartPanel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
      if (content) content.classList.add('active');
    });
  });

  // 成员对话历史弹窗关闭
  const memberChatClose = document.getElementById('memberChatClose');
  if (memberChatClose) {
    memberChatClose.addEventListener('click', closeMemberChat);
  }

  const memberChatOverlay = document.getElementById('memberChatOverlay');
  if (memberChatOverlay) {
    memberChatOverlay.addEventListener('click', (e) => {
      if (e.target === memberChatOverlay) {
        closeMemberChat();
      }
    });
  }

  // 会话信息面板关闭按钮
  const conversationInfoClose = document.getElementById('conversationInfoClose');
  if (conversationInfoClose) {
    conversationInfoClose.addEventListener('click', closeConversationInfo);
  }

  const addMemberBtn = document.getElementById('addMemberBtn');
  if (addMemberBtn) {
    addMemberBtn.addEventListener('click', addSingleMember);
  }

  // 成员配置模态框
  const closeMemberConfigBtn = document.getElementById('closeMemberConfigBtn');
  if (closeMemberConfigBtn) {
    closeMemberConfigBtn.addEventListener('click', closeMemberConfigModal);
  }

  const cancelMemberConfigBtn = document.getElementById('cancelMemberConfigBtn');
  if (cancelMemberConfigBtn) {
    cancelMemberConfigBtn.addEventListener('click', closeMemberConfigModal);
  }

  const saveMemberConfigBtn = document.getElementById('saveMemberConfigBtn');
  if (saveMemberConfigBtn) {
    saveMemberConfigBtn.addEventListener('click', saveMemberConfig);
  }

  const memberConfigModal = document.getElementById('memberConfigModal');
  if (memberConfigModal) {
    memberConfigModal.addEventListener('click', (e) => {
      if (e.target === memberConfigModal) {
        closeMemberConfigModal();
      }
    });
  }

  initScrollDetection();
  initNewMessagesObserver();
}

function handleMentionInput(textarea) {
  if (!state.conversation || state.conversation.mode !== 'brainstorming') {
    hideMentionDropdown();
    return;
  }

  const cursorPos = textarea.selectionStart;
  const textBefore = textarea.value.substring(0, cursorPos);
  const atMatch = textBefore.match(/@([^@\s]*)$/);

  if (atMatch) {
    const query = atMatch[1].toLowerCase();
    const atStart = cursorPos - query.length - 1;

    const members = state.conversation.members || [];
    mentionState.filteredMembers = members.filter(m => m.name.toLowerCase().includes(query));
    mentionState.query = query;
    mentionState.startIndex = atStart;
    mentionState.selectedIndex = 0;
    mentionState.active = true;

    renderMentionDropdown();
  } else {
    hideMentionDropdown();
  }
}

function renderMentionDropdown() {
  if (!elements.mentionDropdown) return;

  if (!mentionState.active || mentionState.filteredMembers.length === 0) {
    hideMentionDropdown();
    return;
  }

  elements.mentionDropdown.innerHTML = mentionState.filteredMembers.map((member, i) => {
    const avatarUrl = generateAvatarUrl(member.name);
    const activeClass = i === mentionState.selectedIndex ? ' active' : '';
    return `<div class="mention-item${activeClass}" data-member-id="${member.id}" data-index="${i}">
      <img class="mention-item-avatar" src="${avatarUrl}" alt="">
      <span class="mention-item-name">${escapeHtml(member.name)}</span>
    </div>`;
  }).join('');

  elements.mentionDropdown.classList.add('visible');

  elements.mentionDropdown.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const idx = parseInt(item.dataset.index);
      selectMentionItem(mentionState.filteredMembers[idx]);
    });
  });
}

function selectMentionItem(member) {
  if (!member) return;
  const textarea = elements.messageInput;
  const before = textarea.value.substring(0, mentionState.startIndex);
  const after = textarea.value.substring(textarea.selectionStart);
  textarea.value = before + '@' + member.name + ' ' + after;
  const newPos = before.length + member.name.length + 2;
  textarea.selectionStart = textarea.selectionEnd = newPos;
  textarea.focus();
  updateSendButtonState();
  hideMentionDropdown();
}

function hideMentionDropdown() {
  mentionState.active = false;
  if (elements.mentionDropdown) {
    elements.mentionDropdown.classList.remove('visible');
  }
}

function getMsgMentionNames(msg) {
  if (msg._mentionNames) return msg._mentionNames;
  if (msg.targetMemberIds && Array.isArray(msg.targetMemberIds) && state.conversation?.members) {
    return msg.targetMemberIds.map(id => {
      const m = state.conversation.members.find(m => m.id === id);
      return m ? m.name : '';
    }).filter(Boolean);
  }
  return null;
}

function extractMentionedMemberIds(content) {
  if (!state.conversation || state.conversation.mode !== 'brainstorming') return null;
  const members = state.conversation.members || [];
  const mentioned = [];
  for (const member of members) {
    // @name 必须紧跟空格才算有效提及
    if (content.includes('@' + member.name + ' ')) {
      mentioned.push(member.id);
    }
  }
  return mentioned.length > 0 ? mentioned : null;
}

function stripMentionPrefix(content) {
  const members = state.conversation?.members || [];
  let cleaned = content;
  for (const member of members) {
    // 只移除 @name 加空格的形式
    cleaned = cleaned.replace('@' + member.name + ' ', '');
  }
  return cleaned.trim();
}

function openConversationInfo() {
  const sidebar = document.getElementById('conversationInfoSidebar');
  if (sidebar) {
    sidebar.classList.add('active');
    renderConversationMembers();
  }
}

function closeConversationInfo() {
  const sidebar = document.getElementById('conversationInfoSidebar');
  if (sidebar) {
    sidebar.classList.remove('active');
  }
}

function renderConversationMembers() {
  const membersList = document.getElementById('conversationMembersList');
  const memberCount = document.getElementById('memberCount');

  if (!membersList || !state.conversation.members) {
    return;
  }

  if (memberCount) {
    memberCount.textContent = state.conversation.members.length;
  }

  membersList.innerHTML = state.conversation.members.map(member => {
    const roleSetting = state.conversation.memberSettings?.[member.id] || {};
    const displayName = roleSetting.nickname || member.name || '未知成员';
    const platformName = member.platformName || '';
    const modelCode = member.modelCode || member.provider || '';

    return `
      <div class="conversation-member-card">
        <div class="conversation-member-avatar">
          <img src="${generateAvatarUrl(displayName)}" alt="${escapeHtml(displayName)}">
        </div>
        <div class="conversation-member-info">
          <div class="conversation-member-name">${escapeHtml(displayName)}</div>
          <div class="conversation-member-details">
            ${platformName ? `<span class="conversation-member-platform">${escapeHtml(platformName)}</span>` : ''}
            ${modelCode ? `<span class="conversation-member-model">${escapeHtml(modelCode)}</span>` : ''}
          </div>
        </div>
        <button class="remove-member-btn" data-member-id="${member.id}" title="移除成员">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // 绑定删除按钮事件
  const removeButtons = membersList.querySelectorAll('.remove-member-btn');
  removeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const memberId = e.currentTarget.dataset.memberId;
      removeMember(memberId);
    });
  });
}

/**
 * 添加单个成员
 */
async function addSingleMember() {
  try {
    if (!state.models || state.models.length === 0) {
      showToast('暂无可用模型，请先配置平台', 'warning', {
        text: '去配置',
        onClick: () => { window.open(chrome.runtime.getURL('dashboard/dashboard.html#models')); }
      });
      return;
    }

    // 使用第一个模型作为默认值
    const defaultModel = state.models[0];
    const nicknames = generateRandomNicknames(1);

    const newMember = {
      id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
      name: nicknames[0],
      platformId: defaultModel.platformId,
      modelId: defaultModel.id,
      modelCode: defaultModel.code,
      platformName: defaultModel.platformName,
      accessMethod: defaultModel.accessMethod,
      color: defaultModel.color || '#667eea',
      systemPrompt: '',
      webUrl: defaultModel.webUrl || ''
    };

    const updatedMembers = [...state.conversation.members, newMember];
    const updatedMemberOrder = [...(state.conversation.memberOrder || state.conversation.members.map(m => m.id)), newMember.id];

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId: state.conversation.id,
        updates: {
          members: updatedMembers,
          memberOrder: updatedMemberOrder
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    state.conversation.members = updatedMembers;

    renderConversationMembers();

    await sendMemberJoinTipMessages(state.conversation.id, [newMember]);
  } catch (error) {
    console.error('[Chat] 添加成员失败:', error);
    showToast('添加成员失败: ' + (error.message || error), 'error');
  }
}

/**
 * 移除成员
 */
async function removeMember(memberId) {
  try {
    const member = state.conversation.members.find(m => m.id === memberId);
    if (!member) {
      showToast('成员不存在', 'error');
      return;
    }

    const updatedMembers = state.conversation.members.filter(m => m.id !== memberId);

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId: state.conversation.id,
        updates: {
          members: updatedMembers
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    state.conversation.members = updatedMembers;

    renderConversationMembers();

    // 添加 Tip 提示：成员离开
    await addTipMessage(
      state.conversation.id,
      `${member.name} 已离开会话`,
      'leave'  // ✅ 离开会话 - 需要发送给 AI
    );
  } catch (error) {
    console.error('[Chat] 移除成员失败:', error);
    showToast('移除成员失败: ' + (error.message || error), 'error');
  }
}

async function handleStorageChange(change) {
  console.log('[Chat] 检测到存储变化');

  const newConversations = change.newValue || [];
  const updatedConversation = newConversations.find(c => c.id === conversationId);

  if (!updatedConversation) {
    console.log('[Chat:DIAG] handleStorageChange - updatedConversation NOT FOUND for id:', conversationId);
    return;
  }

  const oldMsgs = state.conversation?.messages || [];
  const newMsgs = updatedConversation?.messages || [];
  const oldMessageCount = oldMsgs.filter(msg => !msg.isIntro).length;
  const newMessageCount = newMsgs.filter(msg => !msg.isIntro).length;
  const hasNewMessages = newMessageCount > oldMessageCount;
  const oldPlacholders = oldMsgs.filter(m => m._status === 'placeholder').length;
  const newConfirmed = newMsgs.filter(m => !m.isUser && m.type === 'member').length;

  console.log('[Chat:DIAG] handleStorageChange - stats:', {
    oldMessageCount,
    newMessageCount,
    hasNewMessages,
    oldPlacholders,
    newConfirmed,
    isUserScrolling,
    isMemberReplyingMode
  });

  state.conversation = updatedConversation;

  if (isUserScrolling) {
    console.log('[Chat:DIAG] handleStorageChange - user is scrolling, deferring render');
    updateConversationName();
    updateSmartPanelContent();
    if (hasNewMessages) {
      unreadCount += newMessageCount - oldMessageCount;
      hasPendingRender = true;
      updateNewMessagesBadge();
    }
    return;
  }

  if (hasNewMessages) {
    console.log('[Chat:DIAG] handleStorageChange - new messages detected, syncing backend');
    hideThinkingIndicator();

    messageStore.syncBackend(newMsgs);
    const prevMemberReplying = isMemberReplyingMode;
    checkPlaceholdersResolved();
    if (prevMemberReplying !== isMemberReplyingMode) {
      console.log('[Chat:DIAG] handleStorageChange - isMemberReplyingMode changed:', prevMemberReplying, '->', isMemberReplyingMode);
    }

    const diff = newMessageCount - oldMessageCount;
    if (userScrolled) {
      unreadCount += diff;
      updateNewMessagesBadge();
    } else {
      requestAnimationFrame(() => {
        if (!userScrolled) {
          scrollToBottom();
        }
      });
    }
  } else {
    console.log('[Chat:DIAG] handleStorageChange - no new messages (or same count), checking if placeholders remain');
    const phCount = messageStore.messages.filter(m => m._status === 'placeholder').length;
    console.log('[Chat:DIAG] handleStorageChange - placeholder count:', phCount, 'isMemberReplyingMode:', isMemberReplyingMode);
  }

  updateConversationName();
   
  fetchMemberStatus();

  const hasMembers = (state.conversation.members && state.conversation.members.length > 0) ||
    (state.conversation.mode === 'expertqa' && state.conversation.expertId);
  if (elements.messageInput) {
    elements.messageInput.disabled = !hasMembers;
    elements.messageInput.placeholder = hasMembers ? '输入消息...' : '请先添加成员后再发送消息';
  }
  updateSendButtonState();

  updateSmartPanelContent();
  renderScrollBar();
  renderSummaryFloatBtn();
}

function bindMemberClickEvents() {
  const clickableElements = elements.messagesContainer.querySelectorAll('.clickable');
  clickableElements.forEach(el => {
    el.addEventListener('click', async (e) => {
      const provider = e.currentTarget.getAttribute('data-provider');
      const memberId = e.currentTarget.getAttribute('data-member-id');
      
      // 优先打开成员配置模态框
      if (memberId && state.conversation?.members) {
        const member = state.conversation.members.find(m => m.id === memberId);
        if (member) {
          e.preventDefault();
          e.stopPropagation();
          openMemberConfigModal(memberId);
          return;
        }
      }
      
      // 如果没有memberId，则激活平台标签页（保持原有行为）
      if (provider) {
        try {
          let targetUrl = null;
          if (memberId && state.conversation?.memberUrls) {
            targetUrl = state.conversation.memberUrls[memberId] || null;
          }
          await chrome.runtime.sendMessage({
            action: 'activatePlatformTab',
            targetUrl
          });
        } catch (error) {
          console.error('激活标签页失败:', error);
        }
      }
    });
  });
}

function render() {
  if (!state.conversation) return;

  // 更新会话名称显示
  updateConversationName();

  // 显示当前模式
  renderModeBadge();

  // 设置成员标签
  renderMembersTags();

  // 渲染消息
  renderMessages();

  // 初始加载滚动到底部
  scrollToBottom();

  // 根据是否有成员或专家来启用/禁用输入
  const hasMembers = (state.conversation.members && state.conversation.members.length > 0) ||
    (state.conversation.mode === 'expertqa' && state.conversation.expertId);
  if (elements.messageInput) {
    elements.messageInput.disabled = !hasMembers;
    elements.messageInput.placeholder = hasMembers ? '输入消息...' : '请先添加成员后再发送消息';
  }
  updateSendButtonState();
}

function updateConversationName() {
  const conversationName = document.getElementById('conversationName');
  if (conversationName && state.conversation) {
    conversationName.textContent = state.conversation.name;
    conversationName.title = state.conversation.name;
  }

  updateSidebarConvTitleStatus();
}

function updateSidebarConvTitleStatus() {
  if (!conversationId) return;
  const container = document.getElementById('sidebarConversations');
  if (!container) return;

  const item = container.querySelector(`[data-conv-id="${conversationId}"]`);
  if (!item) return;

  const conv = state.conversation;
  if (!conv) return;

  const nameEl = item.querySelector('.sidebar-conv-name');
  if (!nameEl) return;

  const status = conv.titleStatus || (conv.nameIsDefault ? 'default' : 'done');
  nameEl.setAttribute('data-title-status', status);
}

function renderMembersTags() {
  console.log('[Chat] renderMembersTags - conversation.members:', state.conversation.members);


  if (state.conversation.mode === 'expertqa' || state.conversation.contextMode === 'expertqa') {
    const expertId = state.conversation.expertId || state.conversation.memberSettings?.expertId;
    if (expertId) {
      const expert = state.experts?.find(e => e.id === expertId);
      if (expert) {
        elements.membersTags.innerHTML = `<span class="member-tag" style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); color: white; border: none;">
          <span>🎓</span> ${escapeHtml(expert.name)}
        </span>`;
        return;
      }
    }
  }

  if (!state.conversation.members || state.conversation.members.length === 0) {
    console.log('[Chat] renderMembersTags - No members, clearing tags');
    elements.membersTags.innerHTML = '';
    return;
  }

  const hasOrdering = state.conversation.mode === 'discussion' ||
    (state.conversation.sendMode && state.conversation.sendMode === 'sequential');
  const memberIds = state.conversation.members.map(m => m.id);

  console.log('[Chat] renderMembersTags - Rendering', state.conversation.members.length, 'members');

  elements.membersTags.innerHTML = state.conversation.members.map(member => {
    const memberIndex = (state.conversation.memberOrder || memberIds).indexOf(member.id);
    const color = member.color || '#667eea';
    const status = state.memberStatus[member.id]?.status || 'online';
    const isBusy = state.memberStatus[member.id]?.isBusy || false;
    const statusColor = status === 'online' ? '#43e97b' : '#e74c3c';
    const statusTitle = status === 'online' ? '在线 - 点击切换为离线' : '离线 - 点击切换为在线';
    const offlineClass = status === 'offline' ? ' offline' : '';
    const avatarUrl = generateAvatarUrl(member.name);
    
    return `<span class="member-tag${hasOrdering ? ' draggable' : ''}${offlineClass}" data-member-id="${member.id}" title="点击查看和 ${escapeHtml(member.name)} 的对话历史">
      ${hasOrdering ? `<span class="member-tag-drag-handle">#${memberIndex + 1}</span>` : ''}
      <span class="member-status-dot" data-member-id="${member.id}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};cursor:pointer;margin-right:2px;" title="${statusTitle}"></span>
      <img class="member-tag-avatar" src="${avatarUrl}" alt="${escapeHtml(member.name)}" style="width:14px;height:14px;border-radius:50%;${status === 'offline' ? 'filter:grayscale(100%);' : ''}">
      ${escapeHtml(member.name)}${isBusy ? ' <span class="member-busy-indicator">⏳</span>' : ''}
      <span class="member-tag-remove" title="移除成员">×</span>
    </span>`;
  }).join('');

  // 绑定状态切换事件
  elements.membersTags.querySelectorAll('.member-status-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = dot.dataset.memberId;
      const currentStatus = state.memberStatus[memberId]?.status || 'online';
      const newStatus = currentStatus === 'online' ? 'offline' : 'online';
      toggleMemberStatus(memberId, newStatus);
    });
  });

  console.log('[Chat] renderMembersTags - Members tags HTML:', elements.membersTags.innerHTML);
}

async function toggleMemberStatus(memberId, newStatus) {
  try {
    // 更新本地状态
    if (!state.memberStatus[memberId]) {
      state.memberStatus[memberId] = { status: 'online', isBusy: false };
    }
    state.memberStatus[memberId].status = newStatus;
    
    // 通知后台
    const response = await chrome.runtime.sendMessage({
      action: 'setMemberStatus',
      conversationId,
      memberId,
      status: newStatus
    });
    
    if (response?.success) {
      console.log(`[Chat] 成员 ${memberId} 状态已更新为: ${newStatus}`);
      renderMembersTags();
    } else {
      console.error('[Chat] 更新成员状态失败:', response?.error);
      // 回滚本地状态
      state.memberStatus[memberId].status = newStatus === 'online' ? 'offline' : 'online';
    }
  } catch (error) {
    console.error('[Chat] 更新成员状态失败:', error);
    // 回滚本地状态
    state.memberStatus[memberId].status = newStatus === 'online' ? 'offline' : 'online';
  }
}

async function fetchMemberStatus() {
  if (!state.conversation?.members) return;
  
  for (const member of state.conversation.members) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getMemberStatus',
        conversationId,
        memberId: member.id
      });
      
      if (response?.success && response.status) {
        state.memberStatus[member.id] = response.status;
      } else {
        // 默认在线
        state.memberStatus[member.id] = { status: 'online', isBusy: false };
      }
    } catch (error) {
      console.warn(`[Chat] 获取成员 ${member.id} 状态失败:`, error);
      state.memberStatus[member.id] = { status: 'online', isBusy: false };
    }
  }
  
  renderMembersTags();
}

// ==================== 成员配置模态框 ====================

let currentConfigMemberId = null;

function openMemberConfigModal(memberId) {
  const member = state.conversation.members.find(m => m.id === memberId);
  if (!member) {
    console.warn('[Chat] openMemberConfigModal - Member not found:', memberId);
    return;
  }

  console.log('[Chat] openMemberConfigModal - Opening config for member:', member.name);

  currentConfigMemberId = memberId;

  // 填充表单
  const nameInput = document.getElementById('memberConfigName');
  const modelSelect = document.getElementById('memberConfigModel');
  const promptSelect = document.getElementById('memberConfigPrompt');

  if (nameInput) nameInput.value = member.name;

  // 填充模型选择器
  if (modelSelect) {
    modelSelect.innerHTML = '<option value="">请选择模型...</option>' +
      state.models.map(model => {
        const platformName = model.platformName || '未知平台';
        const displayName = `${model.code || model.id}(${platformName})`;
        const selected = model.id === member.modelId ? 'selected' : '';
        return `<option value="${model.id}" ${selected}>${escapeHtml(displayName)}</option>`;
      }).join('');

  }

  // 填充提示词选择器
  if (promptSelect) {
    promptSelect.innerHTML = '<option value="">无提示词</option>' +
      state.prompts.map(prompt => {
        const selected = prompt.content === member.systemPrompt ? 'selected' : '';
        return `<option value="${prompt.id}" ${selected}>${escapeHtml(prompt.name)}</option>`;
      }).join('');
  }

  // 显示模态框
  const modal = document.getElementById('memberConfigModal');
  if (modal) modal.classList.add('active');
}

async function saveMemberConfig() {
  if (!currentConfigMemberId) return;

  const nameInput = document.getElementById('memberConfigName');
  const modelSelect = document.getElementById('memberConfigModel');
  const promptSelect = document.getElementById('memberConfigPrompt');

  const memberName = nameInput ? nameInput.value.trim() : '';
  const modelId = modelSelect ? modelSelect.value : null;
  const promptId = promptSelect ? promptSelect.value : null;

  if (!memberName) {
    showToast('请输入成员名称', 'warning');
    return;
  }

  if (!modelId) {
    showToast('请选择模型', 'warning');
    return;
  }

  // 查找模型和提示词
  const model = state.models.find(m => m.id === modelId);
  if (!model) {
    showToast('模型不存在', 'error');
    return;
  }

  let systemPrompt = '';
  if (promptId) {
    const prompt = state.prompts.find(p => p.id === promptId);
    if (prompt) systemPrompt = prompt.content || '';
  }

  // 更新成员数据
  const member = state.conversation.members.find(m => m.id === currentConfigMemberId);
  if (!member) {
    showToast('成员不存在', 'error');
    return;
  }

  // 记录旧的名称和模型ID，用于后续判断是否需要提示
  const oldName = member.name;
  const oldModelId = member.modelId;
  const oldModelCode = member.modelCode;
  const oldPlatformName = member.platformName;

  member.name = memberName;
  member.platformId = model.platformId;
  member.modelId = model.id;
  member.modelCode = model.code;
  member.platformName = model.platformName;
  member.accessMethod = model.accessMethod;
  member.color = model.color || '#667eea';
  member.systemPrompt = systemPrompt;

  if (model.accessMethod === 'api') {
    member.baseUrl = model.baseUrl || '';
    member.apiKey = model.apiKey || '';
    delete member.webUrl;
  } else {
    member.webUrl = model.webUrl || '';
    delete member.baseUrl;
    delete member.apiKey;
  }

  // 保存到storage
  try {
    await chrome.runtime.sendMessage({
      action: 'updateConversation',
      conversationId: state.conversation.id,
      updates: {
        members: state.conversation.members
      }
    });

    // 关闭模态框
    const modal = document.getElementById('memberConfigModal');
    if (modal) modal.classList.remove('active');

    currentConfigMemberId = null;

    // 重新渲染成员标签
    renderMembersTags();

    // 如果名称改变了，添加提示消息
    if (oldName !== memberName) {
      try {
        // 给被更名的成员发送专属 tip（不在UI显示）
        await chrome.runtime.sendMessage({
          action: 'addMessageDirect',
          conversationId: state.conversation.id,
          memberId: null,
          content: `你当前群聊名称改为 ${memberName}`,
          msgType: MessageType.TIP,
          tipSubType: 'rename',
          ui: false,
          target: [member.id]
        });

        // 给其他成员发送通用 tip（在UI显示）
        await chrome.runtime.sendMessage({
          action: 'addMessageDirect',
          conversationId: state.conversation.id,
          memberId: null,
          content: `${oldName} 改名为 ${memberName}`,
          msgType: MessageType.TIP,
          tipSubType: 'rename',
          ui: true,
          exclude: [member.id]
        });
      } catch (error) {
        console.error('[Chat] 添加名称变更提示消息失败:', error);
      }
    }

    // 如果提示词改变了，添加提示消息
    const oldPrompt = member.systemPrompt;
    if (oldPrompt !== systemPrompt) {
      // 检查成员是否有历史消息
      const hasHistory = (state.conversation.messages || []).some(msg => msg.memberId === member.id && !msg.isTip);

      if (hasHistory && systemPrompt) {
        try {
          // 只有有历史消息的成员才发送角色设定变更提示（不在UI显示）
          await chrome.runtime.sendMessage({
            action: 'addMessageDirect',
            conversationId: state.conversation.id,
            memberId: null,
            content: `你的角色设定变更为 ${systemPrompt}`,
            msgType: MessageType.TIP,
            tipSubType: 'prompt_change',
            ui: false,
            target: [member.id]
          });
        } catch (error) {
          console.error('[Chat] 添加提示词变更提示消息失败:', error);
        }
      }
    }

    // 如果模型改变了，添加提示消息并记录切换时间戳
    if (oldModelId !== model.id) {
      // 记录模型切换时间戳（用于后续判断上下文范围）
      member.modelSwitchedAt = Date.now();

      try {
        await chrome.runtime.sendMessage({
          action: 'addMessageDirect',
          conversationId: state.conversation.id,
          memberId: null,  // 系统消息没有成员
          content: `${member.name} 切换了模型为 ${model.code}(${model.platformName})`,
          msgType: MessageType.TIP,
          tipSubType: 'model_switch'  // ❌ 切换模型 - 不发送给 AI
        });
      } catch (error) {
        console.error('[Chat] 添加模型切换提示消息失败:', error);
      }
    }
  } catch (error) {
    console.error('[Chat] saveMemberConfig - 保存失败:', error);
    showToast('保存失败: ' + (error.message || error), 'error');
  }
}

function closeMemberConfigModal() {
  const modal = document.getElementById('memberConfigModal');
  if (modal) modal.classList.remove('active');
  currentConfigMemberId = null;
}

// ==================== 成员对话历史弹出框 ====================

function openMemberChat(memberId) {
  const member = state.conversation.members.find(m => m.id === memberId);
  if (!member) {
    console.warn('[Chat] openMemberChat - Member not found:', memberId);
    return;
  }

  console.log('[Chat] openMemberChat - Opening chat for member:', member.name);

  // 设置弹窗头部信息
  const avatarEl = document.getElementById('memberChatAvatar');
  const nameEl = document.getElementById('memberChatName');
  const messagesEl = document.getElementById('memberChatMessages');
  const overlay = document.getElementById('memberChatOverlay');

  if (!overlay || !messagesEl) {
    console.error('[Chat] openMemberChat - Modal elements not found');
    return;
  }

  const color = member.color || '#667eea';
  const initial = escapeHtml(member.name.charAt(0).toUpperCase());
  if (avatarEl) {
    avatarEl.innerHTML = `<img src="${generateAvatarUrl(member.name)}" alt="${escapeHtml(member.name)}" loading="lazy">`;
  }
  if (nameEl) {
    nameEl.textContent = escapeHtml(member.name) + ' 的对话';
  }

  // 过滤该成员的消息
  const memberMessages = (state.conversation.messages || [])
    .filter(msg => msg.memberId === memberId);

  console.log('[Chat] openMemberChat - Found', memberMessages.length, 'messages for member');

  if (memberMessages.length === 0) {
    messagesEl.innerHTML = '<div class="member-chat-empty">暂无对话记录</div>';
  } else {
    messagesEl.innerHTML = memberMessages.map(msg => {
      const isUser = msg.isUser;
      const content = msg.content || '';
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : '';
      return `<div class="member-chat-msg ${isUser ? 'user' : 'ai'}">
        <div class="member-chat-msg-bubble">
          <div class="member-chat-msg-text">${escapeHtml(content)}</div>
          <div class="member-chat-msg-time">${isUser ? '我' : escapeHtml(member.name)} · ${time}</div>
        </div>
      </div>`;
    }).join('');
  }

  overlay.classList.add('active');
  overlay.style.display = 'flex';

  // 滚动到底部
  setTimeout(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 100);
}

function closeMemberChat() {
  const overlay = document.getElementById('memberChatOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.style.display = 'none';
  }
}

function renderModeBadge() {
  const badge = document.getElementById('modeBadge');
  if (!badge) return;

  console.log('[Chat] renderModeBadge - conversation.mode:', state.conversation.mode, 'contextMode:', state.conversation.contextMode);

  const mode = state.conversation.mode ||
    (state.conversation.contextMode === 'full' ? 'discussion' : 'brainstorming');

  if (['brainstorming', 'discussion', 'expertqa'].includes(mode)) {
    const modeDisplay = {
      brainstorming: { text: '头脑风暴', class: 'mode-badge mode-brainstorm', title: '独享上下文 · 并行回复\n点击查看详情' },
      discussion: { text: '圆桌讨论', class: 'mode-badge mode-discuss', title: '共享上下文 · 依次发言\n使用 /loop 问题 次数 进行多轮讨论\n点击查看详情' },
      expertqa: { text: '专家问答', class: 'mode-badge mode-expert', title: '多AI协作 · 迭代求解\n点击查看详情' }
    };
    const display = modeDisplay[mode];
    badge.className = display.class;
    badge.textContent = display.text;
    badge.title = display.title;
    return;
  }

  const contextMode = state.conversation.contextMode;
  const sendMode = state.conversation.sendMode;

  if (!contextMode && !sendMode) {
    badge.textContent = '头脑风暴';
    badge.className = 'mode-badge mode-brainstorm';
    badge.title = '默认模式: 独享上下文 · 并行回复\n点击切换';
    return;
  }

  const contextModeNames = { self: '独享', full: '共享' };
  const sendModeNames = { parallel: '并行', sequential: '顺序接龙', random: '随机接龙' };

  if (contextMode === 'self') {
    badge.textContent = '头脑风暴';
    badge.className = 'mode-badge mode-brainstorm';
    badge.title = '独享模式 · 并行回复\n点击切换';
  } else {
    const safeSendMode = sendMode || 'parallel';
    badge.textContent = `${contextModeNames[contextMode] || '共享'} · ${sendModeNames[safeSendMode] || '并行'}`;
    badge.className = 'mode-badge mode-context-full mode-' + safeSendMode;
    badge.title = `共享模式 · ${sendModeNames[safeSendMode] || '并行'}\n点击切换`;
  }
}

function buildMessageHtml(msg, index, showCursor) {
  const msgId = msg.id || `msg_${index}_${msg.timestamp || Date.now()}`;
  const vid = msg._viewId ? ` data-view-id="${msg._viewId}"` : '';
  if (msg.type === 'tip') {
    if (msg.ui === false) {
      return '';
    }
    return `
      <div class="message tip-message" data-msg-id="${msgId}"${vid}>
        <div class="tip-content">${msg.content}</div>
      </div>
    `;
  }

  const member = state.conversation.members.find(m => m.id === msg.memberId);
  const roleSetting = state.conversation.memberSettings?.[msg.memberId] || {};
  const displayName = roleSetting.nickname || msg.memberName || member?.name || '未知成员';
  const platformName = member ? (member.platformName || '') : '';
  const modelCode = member ? (member.modelCode || member.provider) : null;

  if (msg.isError) {
    return `
      <div class="message ai-message error-ai-message" data-msg-id="${msgId}"${vid}>
        <div class="message-avatar ai-avatar ${clickableClass}" ${providerAttr} title="点击配置成员" style="cursor: pointer;">
          <img src="${generateAvatarUrl(displayName)}" alt="${escapeHtml(displayName)}" loading="lazy">
        </div>
        <div class="message-body">
          <div class="message-header-row">
            <span class="message-sender-name ${clickableClass}" ${providerAttr}>${escapeHtml(displayName)}</span>
            <span class="message-time">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-text error-message-text">${msg.content}</div>
        </div>
      </div>
    `;
  }

  if (msg.isUser) {
    const mentionNames = getMsgMentionNames(msg);
    const mentionHtml = mentionNames ? mentionNames.map(n => `<span class="mention-badge">@${escapeHtml(n)}</span>`).join(' ') + ' ' : '';
    return `
      <div class="message user-message" data-msg-id="${msgId}"${vid}>
        <div class="message-avatar user-avatar">
          <img src="${generateAvatarUrl('Me')}" alt="我" loading="lazy">
        </div>
        <div class="message-body">
          <div class="message-header-row">
            <span class="message-sender-name">我</span>
            <span class="message-time">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-text">${mentionHtml}${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
          <div class="message-actions">
            <button class="copy-msg-btn" data-msg-index="${index}" title="复制消息">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const clickableClass = 'clickable';
  const providerAttr = `data-provider="${modelCode || ''}" data-member-id="${msg.memberId}"`;

  const isExpertQa = state.conversation.mode === 'expertqa';
  const hasLogs = state.flowExecutionLogs && state.flowExecutionLogs.length > 0;
  const viewProcessBtn = isExpertQa && hasLogs ? `
    <button class="view-process-btn" data-action="view-process" title="查看执行过程">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
      <span>查看过程</span>
    </button>
  ` : '';

  return `
    <div class="message ai-message" data-msg-id="${msgId}"${vid}>
      <div class="message-avatar ai-avatar ${clickableClass}" ${providerAttr} title="点击配置成员" style="cursor: pointer;">
        <img src="${generateAvatarUrl(displayName)}" alt="${escapeHtml(displayName)}" loading="lazy">
      </div>
      <div class="message-body">
        <div class="message-header-row">
          <span class="message-sender-name ${clickableClass}" ${providerAttr}>${escapeHtml(displayName)}</span>
          <span class="message-time">${formatTime(msg.timestamp)}</span>
        </div>
        <div class="message-text">${showCursor ? escapeHtml(msg.content).replace(/\n/g, '<br>') + '<span class="streaming-cursor">|</span>' : formatMessage(msg.content)}</div>
        <div class="message-actions">
          ${viewProcessBtn}
          <button class="copy-msg-btn" data-msg-index="${index}" title="复制消息">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildPlaceholderHtml(msg) {
  const member = state.conversation.members.find(m => m.id === msg.memberId);
  const name = msg.memberName || member?.name || '未知成员';
  const modelCode = member ? (member.modelCode || member.provider) : '';
  const providerAttr = `data-provider="${modelCode}" data-member-id="${msg.memberId}"`;
  return `
    <div class="message ai-message member-replying-item" data-view-id="${msg._viewId}" data-member-id="${msg.memberId}">
      <div class="message-avatar ai-avatar clickable" ${providerAttr} title="点击配置成员" style="cursor: pointer;">
        <img src="${generateAvatarUrl(name)}" alt="${escapeHtml(name)}" loading="lazy">
      </div>
      <div class="message-body">
        <div class="message-header-row">
          <span class="message-sender-name clickable" ${providerAttr}>${escapeHtml(name)}</span>
        </div>
        <div class="member-replying-status">
          <div class="thinking-dots-inline">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
          </div>
          <span class="thinking-text">回复中...</span>
        </div>
      </div>
    </div>
  `;
}

function bindMessageElement(el, msg) {
  if (!el) return;
  el.querySelectorAll('.clickable').forEach(c => {
    c.addEventListener('click', (e) => {
      const memberId = c.dataset.memberId;
      if (memberId && state.conversation?.members) {
        const member = state.conversation.members.find(m => m.id === memberId);
        if (member) {
          e.preventDefault();
          e.stopPropagation();
          openMemberConfigModal(memberId);
          return;
        }
      }
      const provider = c.dataset.provider;
      if (provider) {
        let targetUrl = null;
        if (memberId && state.conversation?.memberUrls) {
          targetUrl = state.conversation.memberUrls[memberId] || null;
        }
        chrome.runtime.sendMessage({
          action: 'activatePlatformTab',
          targetUrl
        }).catch(() => {});
      }
    });
  });
  el.querySelectorAll('.copy-msg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = msg.content || '';
      navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '✓';
          setTimeout(() => {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
          }, 1000);
        });
    });
  });
  el.querySelectorAll('.tip-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const memberId = link.dataset.memberId;
      if (memberId) {
        e.preventDefault();
        openMemberConfigModal(memberId);
      }
    });
  });
  if (msg.type === 'member' || (msg._status !== 'placeholder' && msg._status !== 'streaming' && !msg.isUser && msg.type !== 'tip')) {
    renderMathFormulas(el);
    addCodeCopyButtons(el);
  }
}


let messageStore;

function renderMessages() {
  const hasParticipants = (state.conversation.members && state.conversation.members.length > 0) ||
    (state.conversation.mode === 'expertqa' && state.conversation.expertId);

  renderScrollBar();
  renderSummaryFloatBtn();

  if (!hasParticipants) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-messages">
        <div class="empty-messages-icon">👥</div>
        <h2>暂无成员</h2>
        <p>此会话暂无成员，请先添加成员</p>
      </div>
    `;
    updateSendButtonState();
    return;
  }

  const messages = state.conversation.messages || [];

  if (messages.length === 0) {
    elements.messagesContainer.innerHTML = '';
    updateSendButtonState();
    return;
  }

  messageStore.reset(messages);

  updateSendButtonState();
  setTimeout(observeNewMessages, 50);
}

async function sendMessage() {
  const content = elements.messageInput.value.trim();
  console.log(`[Chat:DIAG] sendMessage() called. content="${content?.substring(0, 50)}...", mode=${state.conversation?.mode}, members=${state.conversation?.members?.length}, isMemberReplyingMode=${isMemberReplyingMode}`);

  if (!content) {
    console.log('[Chat:DIAG] sendMessage - empty content, returning');
    return;
  }

  if (content.startsWith('/')) {
    console.log('[Chat:DIAG] sendMessage - is command, delegating to handleCommand');
    await handleCommand(content);
    elements.messageInput.value = '';
    return;
  }

  // 如果内容只是 @name（可能带空格），不发送
  const members = state.conversation.members || [];
  const isJustMention = members.some(m => {
    const nameWithAt = '@' + m.name;
    return content === nameWithAt || content.trim() === nameWithAt;
  });
  if (isJustMention) {
    return;
  }

  // 先解析 @提及，检查有效性（在清空输入框之前）
  const targetMemberIds = extractMentionedMemberIds(content);
  const displayContent = targetMemberIds ? stripMentionPrefix(content) : content;
  const mentionNames = targetMemberIds ? targetMemberIds.map(id => {
    const m = state.conversation.members.find(m => m.id === id);
    return m ? m.name : '';
  }).filter(Boolean) : null;

  if (targetMemberIds && state.conversation.mode === 'brainstorming') {
    addTipMessage(conversationId, `📩 消息已定向发送给 ${mentionNames.join('、')}`);
  }

  if (!displayContent) {
    if (targetMemberIds) {
      showToast('请输入消息内容', 'warning');
    }
    return;
  }

  elements.messageInput.value = '';
  elements.sendBtn.classList.add('sending');
  hideMentionDropdown();
  console.log('[Chat:DIAG] sendMessage - input cleared, sendBtn set to sending');

  try {
    messageStore.push({
      isUser: true, content: displayContent, _mentionNames: mentionNames, timestamp: Date.now(), _status: 'local'
    });
    console.log('[Chat:DIAG] sendMessage - user message pushed to store');

    const isExpertQa = state.conversation.mode === 'expertqa' && state.conversation.expertId;
    const mode = state.conversation.mode || 'brainstorming';
    console.log(`[Chat:DIAG] sendMessage - mode=${mode}, isExpertQa=${isExpertQa}`);

    if (isExpertQa) {
      showInitialExpertProgress();
    } else if (mode === 'brainstorming' || mode === 'discussion') {
      console.log('[Chat:DIAG] sendMessage - brainstorming/discussion mode, placeholders will be driven by backend member_processing notifications');
    } else if (!isMemberReplyingMode) {
      showThinkingIndicator();
    }

    sendMessageToBackend(conversationId, displayContent, targetMemberIds)
      .then(updatedConversation => {
        console.log('[Chat:DIAG] sendMessageToBackend.then() - received response, has conversation:', !!updatedConversation, 'messages:', updatedConversation?.messages?.length);
        if (updatedConversation) {
          state.conversation = updatedConversation;
          messageStore.syncBackend(updatedConversation.messages || []);
          checkPlaceholdersResolved();
          updateConversationName();
          console.log('[Chat:DIAG] sendMessageToBackend.then() - state updated, isMemberReplyingMode after sync:', isMemberReplyingMode);
        }
      })
      .catch(error => {
        console.error('[Chat:DIAG] sendMessageToBackend.catch() - error:', error);
        if (isKimiOverloadError(error)) {
          showToast('Kimi 过载: ' + error.message, 'warning', {
            text: '重试',
            onClick: () => {
              elements.messageInput.value = content;
              sendMessage();
            }
          });
        } else {
          showError('发送消息失败: ' + error.message);
        }
        if (!isMemberReplyingMode) {
          hideMemberReplyingIndicators();
        }
      })
      .finally(() => {
        console.log('[Chat:DIAG] sendMessageToBackend.finally() - isMemberReplyingMode:', isMemberReplyingMode);
        removeProgressIndicator();
        if (!isMemberReplyingMode) {
          hideThinkingIndicator();
        }
      });
  } catch (error) {
    console.error('[Chat:DIAG] sendMessage - OUTER catch block hit! error:', error, 'isMemberReplyingMode:', isMemberReplyingMode);
    showError('发送消息失败: ' + error.message);
    hideThinkingIndicator();
    hideMemberReplyingIndicators();
  }
}

function showInitialExpertProgress() {
  const expert = state.experts?.find(e => e.id === state.conversation.expertId);
  const expertName = expert?.name || 'AI助手';
  const expertIcon = expert?.icon || '🤖';
  const expertNodes = expert?.nodes || [];
  
  // 获取LLM节点（排除开始和结束节点）
  const llmNodes = expertNodes.filter(n => n.type === '3');
  const nodeCount = llmNodes.length;

  // 生成节点步骤HTML
  const stepsHtml = `
    <div class="expert-steps">
      <div class="expert-step active">
        <div class="step-dot"></div>
        <span class="step-label">开始</span>
      </div>
      ${llmNodes.map((node, i) => `
        <div class="expert-step" data-node-id="${node.id}">
          <div class="step-dot"></div>
          <span class="step-label">${escapeHtml(node.data?.title || `节点${i+1}`)}</span>
        </div>
      `).join('')}
      <div class="expert-step">
        <div class="step-dot"></div>
        <span class="step-label">结束</span>
      </div>
    </div>
  `;

  const progressHtml = `
    <div class="message ai-message expert-progress-message" id="currentFlowProgressIndicator">
      <div class="message-avatar-wrapper">
        <div class="message-avatar expert-avatar-thinking">
          ${expertIcon.startsWith('http') 
            ? `<img src="${escapeHtml(expertIcon)}" alt="专家图标" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` 
            : escapeHtml(expertIcon)}
        </div>
      </div>
      <div class="message-body">
        <div class="message-header-row">
          <span class="message-sender-name">${escapeHtml(expertName)}</span>
          <span class="expert-status-badge">执行中</span>
        </div>
        <div class="message-text expert-thinking-text">
          <div class="thinking-dots-inline">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
          </div>
          <span class="thinking-text">开始执行流程...</span>
        </div>
        ${stepsHtml}
      </div>
    </div>
  `;

  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    messagesContainer.insertAdjacentHTML('beforeend', progressHtml);
  }
}

function updateSendButtonState() {
  if (!elements.sendBtn || !elements.messageInput) return;
  const hasMembers = (state.conversation?.members?.length > 0) ||
    (state.conversation?.mode === 'expertqa' && state.conversation?.expertId);
  const hasText = elements.messageInput.value.trim().length > 0;
  const wasDisabled = elements.sendBtn.disabled;
  elements.sendBtn.disabled = !hasMembers || !hasText;
  if (wasDisabled !== elements.sendBtn.disabled) {
    console.log('[Chat:DIAG] updateSendButtonState - changed:', wasDisabled, '->', elements.sendBtn.disabled, 'hasMembers:', hasMembers, 'hasText:', hasText);
  }
}

function showThinkingIndicator() {
  hideThinkingIndicator();
  const indicator = document.createElement('div');
  indicator.className = 'thinking-indicator';
  indicator.id = 'thinking-indicator';
  indicator.innerHTML = `
    <div class="thinking-dots">
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
      <div class="thinking-dot"></div>
    </div>
  `;
  elements.messagesContainer.appendChild(indicator);
}

function hideThinkingIndicator() {
  const existing = document.getElementById('thinking-indicator');
  if (existing) {
    existing.remove();
  }
}

function showMemberReplyingIndicators() {
  const members = state.conversation.members || [];
  if (members.length === 0) return;
  console.log('[Chat:DIAG] showMemberReplyingIndicators - members:', members.length, 'isMemberReplyingMode:', isMemberReplyingMode, 'memberStatus:', JSON.stringify(state.memberStatus));

  if (isMemberReplyingMode) {
    const existing = messageStore.messages.filter(m => m._status === 'placeholder');
    console.log('[Chat:DIAG] showMemberReplyingIndicators - removing existing placeholders:', existing.length);
    for (const ph of existing) {
      messageStore.remove(ph._viewId);
    }
  }

  isMemberReplyingMode = true;

  members.forEach(member => {
    const status = state.memberStatus[member.id]?.status || 'online';
    if (status === 'offline') {
      console.log('[Chat:DIAG] showMemberReplyingIndicators - skipping offline member:', member.name);
      return;
    }

    messageStore.push({
      _status: 'placeholder',
      memberId: member.id,
      memberName: member.name,
      modelCode: member.modelCode || member.provider
    });
  });
  console.log('[Chat:DIAG] showMemberReplyingIndicators - done, total messages in store:', messageStore.length);
}

function hideMemberReplyingIndicators() {
  const placeholders = messageStore.messages.filter(m => m._status === 'placeholder');
  console.log('[Chat:DIAG] hideMemberReplyingIndicators - removing', placeholders.length, 'placeholders');
  for (const ph of placeholders) {
    messageStore.remove(ph._viewId);
  }
  isMemberReplyingMode = false;
  console.log('[Chat:DIAG] hideMemberReplyingIndicators - isMemberReplyingMode set to false');
}

function checkPlaceholdersResolved() {
  const placeholderCount = messageStore.messages.filter(m => m._status === 'placeholder').length;
  if (isMemberReplyingMode) {
    if (placeholderCount === 0) {
      console.log('[Chat:DIAG] checkPlaceholdersResolved - ALL placeholders resolved, setting isMemberReplyingMode=false');
      isMemberReplyingMode = false;
    } else {
      console.log('[Chat:DIAG] checkPlaceholdersResolved - still', placeholderCount, 'placeholders remaining, isMemberReplyingMode stays true');
    }
  }
}

async function handleCommand(command) {
  console.log('[Chat] 处理命令:', command);

  const parts = command.trim().split(/\s+/);
  let cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Command alias support: /clear -> /new (backward compatibility)
  const commandAliases = {
    '/clear': '/new'
  };
  cmd = commandAliases[cmd] || cmd;

  switch (cmd) {
    case '/new':
      await handleNewCommand();
      break;
    case '/loop':
      await handleLoopCommand(args);
      break;
    default:
      showError('未知命令: ' + cmd);
  }
}

let newStatusTimeout = null;

async function handleNewCommand() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'clearConversationLocal',
      conversationId
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '清除失败');
    }

    state.conversation = response.conversation;
    renderMessages();
    updateConversationName();
    console.log('[Chat] 本地会话已清除');

    showNewStatus('deleting');

    chrome.runtime.sendMessage({
      action: 'clearConversationPlatform',
      conversationId,
      memberUrls: response.memberUrls
    });

  } catch (error) {
    console.error('[Chat] 清除会话失败:', error);
    showNewStatus('failed');
  }
}

function showNewStatus(status) {
  const existing = document.querySelector('.new-status');
  if (existing) existing.remove();
  if (newStatusTimeout) {
    clearTimeout(newStatusTimeout);
    newStatusTimeout = null;
  }

  const indicator = document.createElement('div');
  indicator.className = 'new-status';

  if (status === 'deleting') {
    indicator.innerHTML = '<span class="new-status-dot"></span><span class="new-status-text">正在删除后台会话...</span>';
  } else if (status === 'done') {
    indicator.innerHTML = '<span class="new-status-dot new-status-done"></span><span class="new-status-text">清除成功</span>';
    newStatusTimeout = setTimeout(() => indicator.remove(), 2000);
  } else if (status === 'failed') {
    indicator.innerHTML = '<span class="new-status-dot new-status-failed"></span><span class="new-status-text">清除失败</span>';
    newStatusTimeout = setTimeout(() => indicator.remove(), 3000);
  }

  document.querySelector('.chat-header').appendChild(indicator);
}

let messageListenerAttached = false;

function attachMessageListener() {
  if (!messageListenerAttached) {
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type) {
        console.log('[Chat:DIAG] runtime.onMessage received:', request.type, request);
      }
      if (request.type === 'clearComplete') {
        showNewStatus(request.success ? 'done' : 'failed');
      } else if (request.type === 'loopDiscussionProgress') {
        showLoopProgress(request.currentRound, request.totalRounds);
      } else if (request.type === 'loopDiscussionComplete') {
        removeLoopProgress();
        showSuccess(`多轮讨论完成（共 ${request.rounds} 轮）`);
      } else if (request.type === 'flowExecutionProgress') {
        console.log('[Chat:DIAG] flowExecutionProgress:', request.progress?.type, 'memberId:', request.progress?.memberId, 'isMemberReplyingMode:', isMemberReplyingMode);
        handleFlowExecutionProgress(request.progress);
      } else if (request.type === 'flowExecutionComplete') {
        console.log('[Chat:DIAG] flowExecutionComplete received');
        removeProgressIndicator();
    } else if (request.type === 'flowExecutionError') {
        console.log('[Chat] 流程执行错误:', request.error);
        handleFlowExecutionError(request);
      } else if (request.type === 'member_error') {
        handleMemberError(request);
      } else if (request.type === 'summaryUpdated') {
        if (state.conversation && state.conversation.id === request.conversationId) {
          state.conversation.conversationSummary = request.summary;
          state.conversation.conversationSummaryUpdatedAt = request.updatedAt;
          if (elements.summaryFloatBtn) {
            elements.summaryFloatBtn.dataset.hasNew = 'true';
          }
          renderSummaryFloatBtn();
        }
      }
    });
    messageListenerAttached = true;
    console.log('[Chat:DIAG] messageListener attached');
  }
}

attachMessageListener();

function showLoopProgress(currentRound, totalRounds) {
  removeLoopProgress();
  
  const progressDiv = document.createElement('div');
  progressDiv.className = 'loop-progress';
  progressDiv.id = 'loopProgressIndicator';
  progressDiv.innerHTML = `
    <div class="loop-progress-content">
      <div class="loop-progress-spinner"></div>
      <span class="loop-progress-text">多轮讨论中... 第 ${currentRound}/${totalRounds} 轮</span>
    </div>
  `;
  
  if (elements.loopProgressFixed) {
    elements.loopProgressFixed.appendChild(progressDiv);
  }
}

function removeLoopProgress() {
  const existing = document.getElementById('loopProgressIndicator');
  if (existing) {
    existing.remove();
  }
}

function handleFlowExecutionProgress(progress) {
  console.log('[Chat] 流程执行进度:', progress, 'isMemberReplyingMode:', isMemberReplyingMode);

  if (progress.type === 'member_processing') {
    const member = state.conversation.members?.find(m => m.id === progress.memberId);
    console.log('[Chat:DIAG] member_processing - member:', member?.name, 'memberId:', progress.memberId, 'found:', !!member);
    if (!member) return;
    if (messageStore.findPlaceholder(member.id)) {
      console.log('[Chat:DIAG] member_processing - placeholder already exists for', member.name);
      return;
    }

    const prevMode = isMemberReplyingMode;
    isMemberReplyingMode = true;
    hideThinkingIndicator();
    if (prevMode !== isMemberReplyingMode) {
      console.log('[Chat:DIAG] member_processing - isMemberReplyingMode changed:', prevMode, '->', isMemberReplyingMode);
    }

    console.log('[Chat:DIAG] member_processing - pushing placeholder for', member.name);
    messageStore.push({
      _status: 'placeholder',
      memberId: member.id,
      memberName: member.name,
      modelCode: member.modelCode || member.provider
    });
    return;
  }

  if (progress.type === 'content_chunk') {
    const memberId = progress.memberId;
    let msg = messageStore.findPlaceholder(memberId);
    if (!msg) msg = messageStore.findStreaming(memberId);
    if (!msg) {
      console.log('[Chat:DIAG] content_chunk - no placeholder/streaming found for memberId:', memberId, 'delta:', progress.delta?.substring(0, 30));
      return;
    }
    messageStore.updateContent(msg._viewId, progress.delta);
    return;
  }

  if (progress.type === 'message_saved') {
    const memberId = progress.memberId;
    let msg = messageStore.findStreaming(memberId);
    if (!msg) msg = messageStore.findPlaceholder(memberId);
    if (msg) {
      console.log('[Chat:DIAG] message_saved - found msg for memberId:', memberId, 'messageId:', progress.messageId, 'content length:', progress.content?.length);
      const prevMode = isMemberReplyingMode;
      messageStore.replace(msg._viewId, {
        ...msg,
        id: progress.messageId,
        content: progress.content || msg.content,
        _status: 'confirmed'
      });
      checkPlaceholdersResolved();
      if (prevMode !== isMemberReplyingMode) {
        console.log('[Chat:DIAG] message_saved - isMemberReplyingMode changed:', prevMode, '->', isMemberReplyingMode);
      }
    } else {
      console.log('[Chat:DIAG] message_saved - NO matching placeholder/streaming found for memberId:', memberId);
    }
    return;
  }

  // ✅ 只在专家模式下显示进度
  const isExpertMode = state.conversation.mode === 'expertqa' && state.conversation.expertId;

  if (!isExpertMode) {
    console.log('[Chat] 非专家模式，忽略进度提示');
    return;
  }

  // 获取专家信息
  const expert = state.experts?.find(e => e.id === state.conversation.expertId);
  const expertName = expert?.name || 'AI助手';
  const expertIcon = expert?.icon || '🤖';
  const expertNodes = expert?.nodes || [];

  let progressElement = document.getElementById('currentFlowProgressIndicator');

  if (!progressElement) {
    // 获取LLM节点（排除开始和结束节点）
    const llmNodes = expertNodes.filter(n => n.type === '3');

    // 生成节点步骤HTML
    const stepsHtml = `
      <div class="expert-steps">
        <div class="expert-step active">
          <div class="step-dot"></div>
          <span class="step-label">开始</span>
        </div>
        ${llmNodes.map((node, i) => `
          <div class="expert-step" data-node-id="${node.id}">
            <div class="step-dot"></div>
            <span class="step-label">${escapeHtml(node.data?.title || `节点${i+1}`)}</span>
          </div>
        `).join('')}
        <div class="expert-step">
          <div class="step-dot"></div>
          <span class="step-label">结束</span>
        </div>
      </div>
    `;

    const progressHtml = `
      <div class="message ai-message expert-progress-message" id="currentFlowProgressIndicator">
        <div class="message-avatar-wrapper">
          <div class="message-avatar expert-avatar-thinking">
            ${expertIcon.startsWith('http') 
              ? `<img src="${escapeHtml(expertIcon)}" alt="专家图标" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` 
              : escapeHtml(expertIcon)}
          </div>
        </div>
        <div class="message-body">
          <div class="message-header-row">
            <span class="message-sender-name">${escapeHtml(expertName)}</span>
            <span class="expert-status-badge">执行中</span>
          </div>
          <div class="message-text expert-thinking-text">
            <div class="thinking-dots-inline">
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
            </div>
            <span class="thinking-text">${progress.message || '正在处理...'}</span>
          </div>
          ${stepsHtml}
        </div>
      </div>
    `;

    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
      messagesContainer.insertAdjacentHTML('beforeend', progressHtml);
      progressElement = document.getElementById('currentFlowProgressIndicator');
    }
  }

  // 更新步骤条激活状态
  if (progressElement && progress.nodeId) {
    const steps = progressElement.querySelectorAll('.expert-step');
    let foundCurrent = false;

    steps.forEach(step => {
      const stepNodeId = step.dataset.nodeId;
      
      if (stepNodeId === progress.nodeId) {
        // 当前节点
        step.classList.add('active');
        step.classList.remove('completed');
        foundCurrent = true;
      } else if (!foundCurrent) {
        // 当前节点之前的节点
        step.classList.add('completed');
        step.classList.remove('active');
      } else {
        // 当前节点之后的节点
        step.classList.remove('active', 'completed');
      }
    });

    // 如果是开始节点（没有nodeId），激活开始节点
    if (!progress.nodeId && progress.status === 'started') {
      const startStep = steps[0];
      if (startStep) {
        startStep.classList.add('active');
      }
    }
  }

  // 更新思考文本
  const thinkingText = progressElement?.querySelector('.thinking-text');
  if (thinkingText && progress.message) {
    thinkingText.textContent = progress.message;
  }

  // 保存执行日志到状态中
  if (progress.nodeId) {
    if (!state.flowExecutionLogs) {
      state.flowExecutionLogs = [];
    }
    
    const existingLog = state.flowExecutionLogs.find(
      log => log.nodeId === progress.nodeId && log.status === 'started'
    );
    
    if (progress.status === 'completed') {
      if (existingLog) {
        existingLog.status = 'completed';
        existingLog.completedAt = Date.now();
        existingLog.duration = Date.now() - existingLog.timestamp;
      } else {
        state.flowExecutionLogs.push({
          timestamp: Date.now(),
          completedAt: Date.now(),
          nodeName: progress.nodeName,
          nodeId: progress.nodeId,
          status: 'completed',
          current: progress.current,
          total: progress.total,
          duration: 0
        });
      }
    } else if (progress.status === 'started' && !existingLog) {
      state.flowExecutionLogs.push({
        timestamp: Date.now(),
        nodeName: progress.nodeName,
        nodeId: progress.nodeId,
        status: 'started',
        current: progress.current,
        total: progress.total
      });
      
      if (state.flowExecutionLogs.length === 1) {
        renderMessages();
      }
    }
  }
}

function removeProgressIndicator() {
  const progressElement = document.getElementById('currentFlowProgressIndicator');
  if (progressElement) {
    progressElement.remove();
  }
}

function showFlowExecutionLogs() {
  const logs = state.flowExecutionLogs || [];
  
  // 格式化时间
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 格式化时长
  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // 生成日志 HTML - 只显示完成的节点
  let logsHtml = '';
  const completedLogs = logs.filter(log => log.status === 'completed');
  
  if (completedLogs.length === 0) {
    logsHtml = `
      <div class="flow-logs-empty">
        <div class="empty-icon">📋</div>
        <p>暂无执行日志</p>
      </div>
    `;
  } else {
    logsHtml = completedLogs.map((log, index) => `
      <div class="flow-log-item log-completed" data-log-index="${index}">
        <div class="log-main">
          <span class="log-index">${index + 1}</span>
          <span class="log-status">✅</span>
          <span class="log-node">${escapeHtml(log.nodeName || '未知节点')}</span>
          <span class="log-duration">${formatDuration(log.duration)}</span>
          <span class="log-expand">▼</span>
        </div>
        <div class="log-detail">
          <div class="log-detail-row">
            <span class="log-detail-label">开始时间:</span>
            <span class="log-detail-value">${formatTime(log.timestamp)}</span>
          </div>
          <div class="log-detail-row">
            <span class="log-detail-label">完成时间:</span>
            <span class="log-detail-value">${formatTime(log.completedAt)}</span>
          </div>
          <div class="log-detail-row">
            <span class="log-detail-label">节点进度:</span>
            <span class="log-detail-value">${log.current}/${log.total}</span>
          </div>
          ${log.duration ? `
          <div class="log-detail-row">
            <span class="log-detail-label">执行耗时:</span>
            <span class="log-detail-value">${formatDuration(log.duration)}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  // 创建弹窗
  const modalHtml = `
    <div class="modal-overlay active" id="flowLogsModal">
      <div class="modal-content flow-logs-modal">
        <div class="modal-header">
          <h3>📋 流程执行日志</h3>
          <button class="modal-close" id="closeFlowLogsModal">×</button>
        </div>
        <div class="modal-body">
          <div class="flow-logs-summary">
            共 ${completedLogs.length} 个节点执行完成
          </div>
          <div class="flow-logs-list">
            ${logsHtml}
          </div>
        </div>
        <div class="modal-footer">
          ${logs.length > 0 ? '<button class="btn-secondary" id="clearFlowLogs">清除日志</button>' : ''}
          <button class="btn-primary" id="closeFlowLogsBtn">关闭</button>
        </div>
      </div>
    </div>
  `;

  // 移除已存在的弹窗
  const existingModal = document.getElementById('flowLogsModal');
  if (existingModal) {
    existingModal.remove();
  }

  // 添加弹窗到页面
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // 绑定关闭事件
  document.getElementById('closeFlowLogsModal').addEventListener('click', () => {
    document.getElementById('flowLogsModal').remove();
  });
  document.getElementById('closeFlowLogsBtn').addEventListener('click', () => {
    document.getElementById('flowLogsModal').remove();
  });
  
  // 清除日志按钮
  const clearBtn = document.getElementById('clearFlowLogs');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.flowExecutionLogs = [];
      document.getElementById('flowLogsModal').remove();
      showSuccess('日志已清除');
    });
  }

  // 点击背景关闭
  document.getElementById('flowLogsModal').addEventListener('click', (e) => {
    if (e.target.id === 'flowLogsModal') {
      e.target.remove();
    }
  });

  // 绑定展开/折叠事件
  document.querySelectorAll('.flow-log-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
  });
}

function handleMemberError(request) {
  const error = request.error || '未知错误';
  const memberId = request.memberId;
  console.log('[Chat] 成员执行错误:', memberId, error);

  const member = state.conversation.members?.find(m => m.id === memberId);
  const memberName = member?.name || '未知成员';

  const isOverload = OVERLOAD_PATTERNS.some(p => error.includes(p));

  const errorText = isOverload
    ? `${memberName} 触发 Kimi 过载：${error}<br><small style="color:#999;">高峰期算力不足，建议切其他模型或稍后再试</small>`
    : `${memberName} 回复失败: ${error}`;

  let msg = messageStore.findPlaceholder(memberId) || messageStore.findStreaming(memberId);
  if (msg) {
    messageStore.replace(msg._viewId, {
      ...msg,
      content: errorText,
      type: 'member',
      isError: true,
      _status: 'confirmed',
      _overload: isOverload
    });
  }

  checkPlaceholdersResolved();
}

function handleFlowExecutionError(request) {
  const error = request.error || '未知错误';
  const canResume = request.canResume || false;
  console.error('[Chat] 流程执行错误:', error, '可恢复:', canResume);

  const isExpertMode = state.conversation.mode === 'expertqa' && state.conversation.expertId;

  if (!isExpertMode) {
    console.log('[Chat] 非专家模式，忽略错误提示');
    return;
  }

  removeProgressIndicator();

  const expertName = state.experts?.find(e => e.id === state.conversation.expertId)?.name || 'AI助手';

  const completedInfo = request.completedNodeIds?.length
    ? `<div class="error-completed-info">已完成 ${request.completedNodeIds.length} 个节点</div>`
    : '';

  const resumeBtnHtml = canResume
    ? `<button class="resume-flow-btn" id="resumeFlowBtn" title="从失败节点重新开始执行">🔄 重新执行失败节点</button>`
    : '';

  const errorHtml = `
    <div class="message ai-message">
      <div class="message-avatar-wrapper">
        <div class="message-avatar error-avatar">⚠️</div>
      </div>
      <div class="message-body">
        <div class="message-header-row">
          <span class="message-sender-name">${escapeHtml(expertName)}</span>
        </div>
        <div class="message-text error-message-text">
          ${request.failedNodeName ? `节点「${escapeHtml(request.failedNodeName)}」执行失败: ` : '流程执行失败: '}${escapeHtml(error)}
        </div>
        ${completedInfo}
        ${resumeBtnHtml}
      </div>
    </div>
  `;

  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    messagesContainer.insertAdjacentHTML('beforeend', errorHtml);

    if (canResume) {
      const btn = document.getElementById('resumeFlowBtn');
      if (btn) {
        btn.addEventListener('click', () => resumeFlowExecution(btn));
      }
    }
  }
}

async function resumeFlowExecution(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = '正在恢复...';
  }

  try {
    showInitialExpertProgress();
    console.log('[Chat] 开始恢复流程执行...');

    const response = await chrome.runtime.sendMessage({
      action: 'resumeFlow',
      conversationId
    });

    console.log('[Chat] 恢复流程响应:', response);
    removeProgressIndicator();
    hideThinkingIndicator();

    if (response && response.success && response.conversation) {
      console.log('[Chat] 恢复成功，更新会话');
      state.conversation = response.conversation;
      messageStore.syncBackend(response.conversation.messages || []);
      checkPlaceholdersResolved();
    } else if (response && response.canResume) {
      console.log('[Chat] 恢复后再次失败，可继续恢复');
      handleFlowExecutionError(response);
    } else {
      console.log('[Chat] 恢复失败:', response?.error);
      handleFlowExecutionError({ error: response?.error || '恢复执行失败' });
    }
  } catch (err) {
    console.error('[Chat] 恢复执行异常:', err);
    removeProgressIndicator();
    hideThinkingIndicator();
    handleFlowExecutionError({ error: err.message });
  }
}


async function handleLoopCommand(args) {
  if (state.conversation.mode !== 'discussion') {
    showError('/loop 命令仅支持圆桌讨论模式');
    return;
  }

  const maxMatch = args.find(arg => arg.startsWith('--max='));
  const maxIterations = maxMatch ? parseInt(maxMatch.split('=')[1]) : 3;

  const problemDesc = args.filter(arg => !arg.startsWith('--max=')).join(' ').trim();

  if (maxIterations < 1 || maxIterations > 10) {
    showError('迭代次数必须在 1-10 之间');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startLoopDiscussion',
      conversationId,
      problemDesc,
      maxIterations
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '启动多轮讨论失败');
    }

    const tipContent = problemDesc
      ? `📋 多轮讨论已加入队列：${problemDesc}（${maxIterations} 轮）`
      : `📋 多轮讨论已加入队列（${maxIterations} 轮）`;
    
    await addTipMessage(conversationId, tipContent, 'loop_queued');
  } catch (error) {
    console.error('[Chat] 启动多轮讨论失败:', error);
    showError(error.message);
  }
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.member-order-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateOrderIndices(container) {
  const items = container.querySelectorAll('.member-order-item');
  items.forEach((item, index) => {
    const indexEl = item.querySelector('.member-order-index');
    if (indexEl) {
      indexEl.textContent = index + 1;
    }
  });
}


// 工具函数
async function getConversation(id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('获取会话超时')), 30000);
    chrome.runtime.sendMessage({ action: 'getConversation', conversationId: id }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function sendMessageToBackend(conversationId, content, targetMemberIds = null) {
  console.log('[Chat] ========== 发送消息到Background ==========');
  console.log('[Chat] conversationId:', conversationId);
  console.log('[Chat] content:', content?.substring(0, 100));
  console.log('[Chat] targetMemberIds:', targetMemberIds);
  console.log('[Chat:DIAG] mode:', state.conversation?.mode, 'sendMode:', state.conversation?.sendMode, 'members count:', state.conversation?.members?.length);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('[Chat:DIAG] ❌ 发送消息超时（300秒）');
      reject(new Error('发送消息超时（300秒）'));
    }, 300000);
    
    const messageData = {
      action: 'addMessage',
      conversationId,
      content
    };
    if (targetMemberIds) {
      messageData.targetMemberIds = targetMemberIds;
    }

    console.log('[Chat:DIAG] 发送chrome.runtime.sendMessage (action: addMessage)...');
    chrome.runtime.sendMessage(messageData, (response) => {
      console.log('[Chat:DIAG] 收到Background响应:', response ? `success=${!response.error}, messages=${response?.messages?.length}` : 'null/undefined', 'lastError:', chrome.runtime.lastError?.message);
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        console.error('[Chat:DIAG] Background响应 lastError:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && !response.error) {
        console.log('[Chat:DIAG] Background响应成功, messages:', response.messages?.length);
        resolve(response);
      } else {
        console.error('[Chat:DIAG] Background响应错误:', response?.error);
        reject(new Error(response?.error || '发送失败'));
      }
    });
  });
}

/**
 * 添加系统提示消息
 */
async function addTipMessage(conversationId, content, tipSubType = null) {
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('添加提示消息超时')), 5000);

      const messageData = {
        action: 'addMessageDirect',
        conversationId,
        memberId: null,  // 系统消息没有成员
        content,
        msgType: MessageType.TIP
      };

      // 如果有子类型，添加到消息数据中
      if (tipSubType) {
        messageData.tipSubType = tipSubType;
      }

      chrome.runtime.sendMessage(messageData, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error('[Chat] 添加提示消息失败:', error);
  }
}

/**
 * 发送成员自我介绍消息
 */
async function sendMemberIntroMessages(conversationId, members) {
  console.log('[Chat] 发送成员自我介绍消息，成员数:', members.length);

  for (const member of members) {
    const introText = `你好，我是${member.name}，我使用的模型是${member.modelCode}(${member.platformName})，点击我的头像可以为我设置模型和提示词。`;

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('发送自我介绍超时')), 10000);

        chrome.runtime.sendMessage({
          action: 'addMessageDirect',
          conversationId,
          memberId: member.id,
          content: introText,
          msgType: MessageType.INTRO
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      // 延迟500ms，避免消息同时到达
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Chat] 发送成员 ${member.name} 自我介绍失败:`, error);
    }
  }
}

/**
 * 发送成员加入会话的 Tip 提示（替代自我介绍消息）
 */
async function sendMemberJoinTipMessages(conversationId, members) {
  console.log('[Chat] 发送成员加入 Tip 提示，成员数:', members.length);
  console.log('[Chat] state.prompts 数量:', state.prompts?.length || 0);

  for (const member of members) {
    console.log('[Chat] 成员信息:', member.name, 'systemPrompt:', member.systemPrompt);

    // 查找提示词名称
    let promptInfo = '';
    if (member.systemPrompt) {
      const prompt = state.prompts.find(p => p.content === member.systemPrompt);
      const promptName = prompt ? prompt.name : '自定义提示词';
      promptInfo = `，提示词是 ${promptName}`;
      console.log('[Chat] 找到提示词:', promptName);
    } else {
      console.log('[Chat] 成员没有设置提示词');
    }

    let loginLink = '';
    if (member.accessMethod === 'web' && member.webUrl) {
      loginLink = `，<a href="${member.webUrl}" class="tip-link tip-login-link" target="_blank">去登陆</a>`;
    }
    const tipContent = `${member.name} 加入会话，模型是 ${member.modelCode}(${member.platformName})${promptInfo}${loginLink}，<a href="#" class="tip-link" data-member-id="${member.id}">修改成员信息</a>`;
    console.log('[Chat] Tip 内容:', tipContent);

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('发送 Tip 提示超时')), 10000);

        chrome.runtime.sendMessage({
          action: 'addMessageDirect',
          conversationId,
          memberId: null,
          content: tipContent,
          msgType: MessageType.TIP,
          tipSubType: 'join'  // ✅ 加入会话 - 需要发送给 AI
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      // 延迟500ms，避免消息同时到达
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[Chat] 发送成员 ${member.name} Tip 提示失败:`, error);
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(content) {
  if (!content) return '';

  // 清理剪贴板粘贴标记 [Pasted ~X l...] 和其他剪贴板标记
  content = content.replace(/\[Pasted[^\]]*\]/g, '');
  content = content.replace(/\[Pas\$\$/g, '');
  content = content.replace(/\$\$_k/g, '');

  // 处理公式（在其他处理之前，避免公式内容被误处理）
  // 先处理转义的 LaTeX 分隔符
  // \[...\] 是块级公式的另一种表示
  const latexBlockFormulas = [];
  content = content.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    latexBlockFormulas.push(formula);
    return `__LATEX_BLOCK_FORMULA_${latexBlockFormulas.length - 1}__`;
  });

  // \(...\) 是行内公式的另一种表示
  const latexInlineFormulas = [];
  content = content.replace(/\\\((.*?)\\\)/g, (match, formula) => {
    latexInlineFormulas.push(formula);
    return `__LATEX_INLINE_FORMULA_${latexInlineFormulas.length - 1}__`;
  });

  // 块级公式 $$...$$
  const blockFormulas = [];
  content = content.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    blockFormulas.push(formula);
    return `__BLOCK_FORMULA_${blockFormulas.length - 1}__`;
  });

  // 行内公式 $...$（避免匹配到货币符号）
  const inlineFormulas = [];
  content = content.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    inlineFormulas.push(formula);
    return `__INLINE_FORMULA_${inlineFormulas.length - 1}__`;
  });

  // 将转义的 HTML 实体还原（如 &lt;strong&gt; -> <strong>）
  content = content
    .replace(/&lt;strong&gt;/gi, '<strong>')
    .replace(/&lt;\/strong&gt;/gi, '</strong>')
    .replace(/&lt;b&gt;/gi, '<b>')
    .replace(/&lt;\/b&gt;/gi, '</b>')
    .replace(/&lt;em&gt;/gi, '<em>')
    .replace(/&lt;\/em&gt;/gi, '</em>')
    .replace(/&lt;i&gt;/gi, '<i>')
    .replace(/&lt;\/i&gt;/gi, '</i>');

  // 将已存在的 HTML 标签转换为 Markdown 格式
  content = content
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*');

  // 先处理代码块，避免内部被处理
  const codeBlocks = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let contentWithoutCode = content.replace(codeBlockRegex, (match, lang, code) => {
    codeBlocks.push({ lang, code });
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // 处理分隔线
  contentWithoutCode = contentWithoutCode.replace(/\n---\n\n?/g, '<hr class="message-divider">');

  // 处理表格
  const tableRegex = /\n(\|.+\|)\n(\|[\s\-:|]+\|)\n((?:\|.+\|\n?)*)/g;
  contentWithoutCode = contentWithoutCode.replace(tableRegex, (match, headerRow, separatorRow, bodyRows) => {
    const headers = headerRow.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
    const rows = bodyRows.trim().split('\n').map(row =>
      row.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
    );

    let table = '<table><thead><tr>';
    headers.forEach(header => {
      table += `<th>${escapeHtml(header)}</th>`;
    });
    table += '</tr></thead><tbody>';

    rows.forEach(row => {
      table += '<tr>';
      row.forEach(cell => {
        table += `<td>${escapeHtml(cell)}</td>`;
      });
      table += '</tr>';
    });

    table += '</tbody></table>';
    return table;
  });

  // 处理引用
  contentWithoutCode = contentWithoutCode.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');

  // 处理标题（从高级到低级，避免误匹配）
  // 使用 (?<=^|>) 前瞻断言，匹配行首或标签后的内容
  contentWithoutCode = contentWithoutCode
    .replace(/(?<=^|>)###### (.*$)/gm, '<h6>$1</h6>')
    .replace(/(?<=^|>)##### (.*$)/gm, '<h5>$1</h5>')
    .replace(/(?<=^|>)#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/(?<=^|>)### (.*$)/gm, '<h3>$1</h3>')
    .replace(/(?<=^|>)## (.*$)/gm, '<h2>$1</h2>')
    .replace(/(?<=^|>)# (.*$)/gm, '<h1>$1</h1>');

  // 清除标题前的多余换行
  contentWithoutCode = contentWithoutCode.replace(/\n\n+(<h[1-6])/g, '\n$1');

  // 清除标题后的多余换行（保留1个）
  contentWithoutCode = contentWithoutCode.replace(/(<\/h[1-6]>)\n\n+/g, '$1\n');

  // 处理粗体、斜体
  contentWithoutCode = contentWithoutCode
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 处理列表 - 先包装列表项
  const orderedListRegex = /^\d+\.\s+(.*$)/gm;
  const unorderedListRegex = /^[-\*]\s+(.*$)/gm;

  // 收集所有列表项
  const orderedItems = [];
  const unorderedItems = [];

  contentWithoutCode = contentWithoutCode.replace(orderedListRegex, (match, text) => {
    orderedItems.push(text);
    return `__OL_ITEM_${orderedItems.length - 1}__`;
  });

  contentWithoutCode = contentWithoutCode.replace(unorderedListRegex, (match, text) => {
    unorderedItems.push(text);
    return `__UL_ITEM_${unorderedItems.length - 1}__`;
  });

  // 将连续的有序列表项包装在ol中
  let inOl = false;
  contentWithoutCode = contentWithoutCode.replace(/__OL_ITEM_\d+__\n?/g, (match) => {
    if (!inOl) {
      inOl = true;
      return '<ol class="message-list">' + match;
    }
    return match;
  });
  if (inOl) {
    contentWithoutCode = contentWithoutCode.replace(/(<\/ol>\n*)?<ol class="message-list">/g, '');
    contentWithoutCode = contentWithoutCode.replace(/__OL_ITEM_(\d+)__\n?/g, (match, index) => {
      const text = orderedItems[parseInt(index)]
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      return `<li>${escapeHtml(text).replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>').replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>')}</li>`;
    });
    contentWithoutCode = contentWithoutCode.replace(/(<li>.*?<\/li>\n?)*$/, (match) => {
      if (match.includes('<li>')) {
        return match + '</ol>\n';
      }
      return match;
    });
  }

  // 将连续的无序列表项包装在ul中
  let inUl = false;
  contentWithoutCode = contentWithoutCode.replace(/__UL_ITEM_\d+__\n?/g, (match) => {
    if (!inUl) {
      inUl = true;
      return '<ul class="message-list">' + match;
    }
    return match;
  });
  if (inUl) {
    contentWithoutCode = contentWithoutCode.replace(/(<\/ul>\n*)?<ul class="message-list">/g, '');
    contentWithoutCode = contentWithoutCode.replace(/__UL_ITEM_(\d+)__\n?/g, (match, index) => {
      const text = unorderedItems[parseInt(index)]
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      return `<li>${escapeHtml(text).replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>').replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>')}</li>`;
    });
    contentWithoutCode = contentWithoutCode.replace(/(<li>.*?<\/li>\n?)*$/, (match) => {
      if (match.includes('<li>')) {
        return match + '</ul>\n';
      }
      return match;
    });
  }

  // 处理段落（连续的文本行）
  contentWithoutCode = contentWithoutCode.replace(/^([^\n<].*$)\n(?=[^\n<])/gm, '$1<br>');

  // 处理换行（非代码块区域，且不在表格内，且不在列表标签内）
  contentWithoutCode = contentWithoutCode.replace(/\n(?![<|])/g, '<br>');

  // 恢复代码块
  contentWithoutCode = contentWithoutCode.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
    const { lang, code } = codeBlocks[parseInt(index)];
    return `<pre data-lang="${escapeHtml(lang)}"><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
  });

  // 恢复公式（使用 KaTeX 渲染）
  // LaTeX 块级公式 \[...\]
  contentWithoutCode = contentWithoutCode.replace(/__LATEX_BLOCK_FORMULA_(\d+)__/g, (match, index) => {
    const formula = latexBlockFormulas[parseInt(index)];
    return `<div class="math-block" data-formula="${escapeHtml(formula)}" style="background: #f6f8fa; padding: 12px; border-radius: 6px; margin: 8px 0; overflow-x: auto;"></div>`;
  });

  // LaTeX 行内公式 \(...\)
  contentWithoutCode = contentWithoutCode.replace(/__LATEX_INLINE_FORMULA_(\d+)__/g, (match, index) => {
    const formula = latexInlineFormulas[parseInt(index)];
    return `<span class="math-inline" data-formula="${escapeHtml(formula)}" style="background: #f6f8fa; padding: 2px 4px; border-radius: 3px;"></span>`;
  });

  // 块级公式 $$...$$
  contentWithoutCode = contentWithoutCode.replace(/__BLOCK_FORMULA_(\d+)__/g, (match, index) => {
    const formula = blockFormulas[parseInt(index)];
    return `<div class="math-block" data-formula="${escapeHtml(formula)}" style="background: #f6f8fa; padding: 12px; border-radius: 6px; margin: 8px 0; overflow-x: auto;"></div>`;
  });

  // 行内公式 $...$
  contentWithoutCode = contentWithoutCode.replace(/__INLINE_FORMULA_(\d+)__/g, (match, index) => {
    const formula = inlineFormulas[parseInt(index)];
    return `<span class="math-inline" data-formula="${escapeHtml(formula)}" style="background: #f6f8fa; padding: 2px 4px; border-radius: 3px;"></span>`;
  });

  return contentWithoutCode;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function generateAvatarUrl(name) {
  return getLocalAvatarUrl(name);
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

let userScrolled = false;
let isUserScrolling = false;
let unreadCount = 0;
let hasPendingRender = false;

function updateNewMessagesBadge() {
  renderScrollBar();
}

let newMsgObserver = null;
const observedMsgIds = new WeakSet();

function initNewMessagesObserver() {
  if (newMsgObserver) newMsgObserver.disconnect();

  newMsgObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target;
        const msgId = el.dataset.msgId;
        if (msgId && !el.dataset.seen) {
          el.dataset.seen = '1';
        }
      }
    }
  }, {
    root: elements.messagesContainer,
    threshold: 0.1
  });
}

function observeNewMessages() {
  if (!newMsgObserver) return;
  const msgs = elements.messagesContainer.querySelectorAll('.message:not([data-seen])');
  msgs.forEach(el => {
    if (!observedMsgIds.has(el)) {
      observedMsgIds.add(el);
      newMsgObserver.observe(el);
    }
  });
}

function initScrollDetection() {
  let scrollTimeout = null;

  elements.messagesContainer.addEventListener('wheel', () => {
    userScrolled = true;
  }, { passive: true });

  elements.messagesContainer.addEventListener('touchmove', () => {
    userScrolled = true;
  }, { passive: true });
  
  elements.messagesContainer.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = elements.messagesContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    isUserScrolling = distanceFromBottom > 200;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const { scrollTop: st, scrollHeight: sh, clientHeight: ch } = elements.messagesContainer;
      isUserScrolling = (sh - st - ch) > 200;
      if (!isUserScrolling && hasPendingRender) {
        hasPendingRender = false;
        unreadCount = 0;
        updateNewMessagesBadge();
        messageStore.syncBackend(state.conversation.messages || []);
        checkPlaceholdersResolved();
      }
    }, 300);
  });
}

function showError(message) {
  elements.messagesContainer.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
}

function showSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.className = 'success-message';
  successDiv.textContent = message;
  elements.messagesContainer.appendChild(successDiv);
  setTimeout(() => successDiv.remove(), 3000);
}

function showToast(message, type = 'info', action = null) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(container);
  }
  const colors = {
    info: { bg: '#f0f4ff', border: '#667eea', text: '#3b5998', icon: 'ℹ️' },
    warning: { bg: '#fff8e1', border: '#f5a623', text: '#8a6d00', icon: '⚠️' },
    error: { bg: '#fdecea', border: '#e74c3c', text: '#c0392b', icon: '❌' },
    success: { bg: '#e8f5e9', border: '#43e97b', text: '#2e7d32', icon: '✅' }
  };
  const c = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.style.cssText = `pointer-events:auto;display:flex;align-items:center;gap:8px;padding:10px 16px;background:${c.bg};border:1px solid ${c.border};border-radius:10px;color:${c.text};font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.12);animation:toast-in .3s ease;max-width:420px;`;
  let html = `<span>${c.icon}</span><span style="flex:1;">${escapeHtml(message)}</span>`;
  if (action) {
    html += `<a href="#" class="toast-action-link" style="color:${c.border};font-weight:600;text-decoration:none;white-space:nowrap;padding:2px 8px;border-radius:4px;transition:background .2s;">${escapeHtml(action.text)}</a>`;
  }
  toast.innerHTML = html;
  if (action) {
    const link = toast.querySelector('.toast-action-link');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        action.onClick();
        removeToast();
      });
    }
  }
  container.appendChild(toast);
  const removeToast = () => {
    toast.style.animation = 'toast-out .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  };
  setTimeout(removeToast, 4000);
}

const availableCommands = [
  { name: '/new', description: '清除所有会话内容和重置成员会话URL' },
  { name: '/loop', description: '启动多轮讨论：/loop 问题描述 --max=5（问题可选，默认基于当前会话；max可选，默认3轮）', hasArgs: true }
];

function getFilteredCommands(filter) {
  const isDiscussionMode = state.conversation.mode === 'discussion';

  let commands = availableCommands;

  if (!isDiscussionMode) {
    commands = commands.filter(cmd => cmd.name !== '/loop');
  }

  if (!filter) {
    return commands;
  }
  return commands.filter(cmd => cmd.name.toLowerCase().includes(filter));
}

function showCommandSuggestions(filter = '') {
  hideCommandSuggestions();

  const filteredCommands = getFilteredCommands(filter);

  if (filteredCommands.length === 0) {
    return;
  }

  const suggestionsDiv = document.createElement('div');
  suggestionsDiv.className = 'command-suggestions';
  suggestionsDiv.id = 'commandSuggestions';
  suggestionsDiv.dataset.candidateIndex = '0';

  filteredCommands.forEach((cmd, index) => {
    const item = document.createElement('div');
    item.className = 'command-suggestion-item' + (index === 0 ? ' candidate' : '');
    item.innerHTML = `
      <div class="command-name">${escapeHtml(cmd.name)}</div>
      <div class="command-desc">${escapeHtml(cmd.description)}</div>
    `;
    item.addEventListener('click', () => {
      elements.messageInput.value = cmd.name + ' ';
      hideCommandSuggestions();
      elements.messageInput.focus();
    });
    suggestionsDiv.appendChild(item);
  });

  const inputContainer = elements.messageInput.parentElement;
  inputContainer.style.position = 'relative';
  inputContainer.appendChild(suggestionsDiv);
}

function selectCandidateCommand() {
  const suggestionsDiv = document.getElementById('commandSuggestions');
  if (!suggestionsDiv) return false;

  const candidateItem = suggestionsDiv.querySelector('.command-suggestion-item.candidate');
  if (!candidateItem) return false;

  const commandName = candidateItem.querySelector('.command-name').textContent;
  elements.messageInput.value = commandName + ' ';
  hideCommandSuggestions();
  elements.messageInput.focus();
  return true;
}

function hideCommandSuggestions() {
  const existingSuggestions = document.getElementById('commandSuggestions');
  if (existingSuggestions) {
    existingSuggestions.remove();
  }
}

// ==================== 智能面板内容更新 ====================

function updateSmartPanelContent() {
  if (!state.conversation || !state.conversation.members) return;

  const membersEl = document.getElementById('smartPanelMembers');
  if (membersEl) {
    const members = state.conversation.members || [];
    if (members.length === 0) {
      membersEl.innerHTML = '<div class="smart-panel-empty"><div class="smart-panel-empty-icon">👥</div>暂无成员</div>';
    } else {
      membersEl.innerHTML = members.map(m => {
        const color = m.color || '#667eea';
        return `<div class="smart-panel-member-item">
          <div class="smart-panel-member-avatar" style="background:${color};">${escapeHtml(m.name.charAt(0).toUpperCase())}</div>
          <div class="smart-panel-member-info">
            <div class="smart-panel-member-name">${escapeHtml(m.name)}</div>
            <div class="smart-panel-member-role">成员</div>
          </div>
          <div class="smart-panel-member-status online"></div>
        </div>`;
      }).join('');
    }
  }

  const historyEl = document.getElementById('smartPanelHistory');
  if (historyEl) {
    const messages = state.conversation.messages || [];
    if (messages.length === 0) {
      historyEl.innerHTML = '<div class="smart-panel-empty"><div class="smart-panel-empty-icon">💬</div>暂无消息历史</div>';
    } else {
      historyEl.innerHTML = messages.slice(-20).reverse().map(msg => {
        const member = state.conversation.members.find(m => m.id === msg.memberId);
        const name = member?.name || (msg.isUser ? '我' : '未知');
        const icon = msg.isUser ? '🙋' : '🤖';
        const summary = msg.content.replace(/<[^>]*>/g, '').substring(0, 40);
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="smart-panel-history-item">
          <div class="smart-panel-history-icon">${icon}</div>
          <div class="smart-panel-history-content">
            <div class="smart-panel-history-time">${escapeHtml(name)} · ${time}</div>
            <div class="smart-panel-history-summary">${escapeHtml(summary)}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  const filesEl = document.getElementById('smartPanelFiles');
  if (filesEl) {
    filesEl.innerHTML = '<div class="smart-panel-empty"><div class="smart-panel-empty-icon">📁</div>暂无文件</div>';
  }
}

function renderScrollBar() {
  const container = elements.scrollBtnContainer;
  if (!container) return;

  const { scrollTop, scrollHeight, clientHeight } = elements.messagesContainer;
  const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

  if (isNearBottom && unreadCount === 0) {
    container.innerHTML = '';
    return;
  }

  const badgeHtml = unreadCount > 0
    ? `<span class="scroll-btn-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
    : '';

  container.innerHTML = `
    <div class="scroll-btn" id="scrollBtnTrigger" title="回到底部">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      ${badgeHtml}
    </div>
  `;

  const trigger = document.getElementById('scrollBtnTrigger');
  if (trigger) {
    trigger.addEventListener('click', () => {
      if (hasPendingRender) {
        hasPendingRender = false;
        messageStore.syncBackend(state.conversation.messages || []);
        checkPlaceholdersResolved();
      }
      userScrolled = false;
      scrollToBottom();
      unreadCount = 0;
      updateNewMessagesBadge();
    });
  }
}

function renderSummaryFloatBtn() {
  const btn = elements.summaryFloatBtn;
  if (!btn) return;

  const summary = state.conversation?.conversationSummary;
  const badge = elements.summaryFloatBadge;

  if (!summary) {
    btn.classList.remove('visible');
    return;
  }

  btn.classList.add('visible');

  const hasNew = btn.dataset.hasNew === 'true';
  if (badge) {
    if (hasNew) {
      badge.textContent = 'NEW';
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }
}

function toggleSummaryPopover() {
  const existingOverlay = document.querySelector('.summary-popover-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
    elements.summaryFloatBtn.dataset.hasNew = 'false';
    renderSummaryFloatBtn();
    return;
  }

  elements.summaryFloatBtn.dataset.hasNew = 'false';
  renderSummaryFloatBtn();

  const summary = state.conversation?.conversationSummary;
  if (!summary) return;

  const updatedAt = state.conversation?.conversationSummaryUpdatedAt;
  const timeStr = updatedAt ? new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';

  const overlay = document.createElement('div');
  overlay.className = 'summary-popover-overlay';
  overlay.id = 'summaryPopoverOverlay';

  const popover = document.createElement('div');
  popover.className = 'summary-popover';
  popover.id = 'summaryPopover';
  popover.innerHTML = `
    <div class="summary-popover-header">
      <span>📋 讨论摘要</span>
      <button class="summary-popover-close" id="summaryPopoverClose">&times;</button>
    </div>
    <div class="summary-popover-body">${formatMessage(summary)}</div>
    <div class="summary-popover-meta">更新于 ${timeStr} · 由辅助模型生成</div>
  `;

  overlay.appendChild(popover);
  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('summaryPopoverClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.remove();
    });
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

function initSmartPanel() {
  if (elements.smartPanel && !elements.smartPanel.classList.contains('collapsed')) {
    elements.smartPanel.classList.add('collapsed');
  }
}

function toggleSmartPanel() {
  if (!elements.smartPanel) return;
  elements.smartPanel.classList.toggle('collapsed');
  if (!elements.smartPanel.classList.contains('collapsed')) {
    updateSmartPanelContent();
  }
}

// ==================== 会话设置 ====================

function enableTitleEditing() {
  const currentName = state.conversation.name || '';
  const conversationName = document.getElementById('conversationName');
  if (!conversationName) return;

  conversationName.classList.add('editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'title-edit-input';
  input.value = currentName;
  input.placeholder = '输入会话名称';

  conversationName.innerHTML = '';
  conversationName.appendChild(input);
  input.focus();
  input.select();

  const saveTitle = async () => {
    const newName = input.value.trim();
    if (!newName) {
      input.focus();
      return;
    }

    try {
      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates: { name: newName }
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        conversationName.classList.remove('editing');
        conversationName.textContent = newName;
        conversationName.title = newName;
        console.log('[Chat] 会话名称已更新');
      }
    } catch (error) {
      console.error('[Chat] 更新会话名称失败:', error);
    }
  };

  const cancelEdit = () => {
    conversationName.classList.remove('editing');
    conversationName.textContent = currentName;
  };

  input.addEventListener('blur', () => {
    if (input.value.trim() !== currentName) {
      saveTitle();
    } else {
      cancelEdit();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });

  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function showAddMemberModal() {
  console.log('[DEBUG] showAddMemberModal() called');

  const existingModal = document.getElementById('addMemberModal');
  if (existingModal) {
    const modalOverlay = existingModal.closest('.modal-overlay');
    if (modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  }

  if (!state.models || state.models.length === 0) {
    showToast('暂无可用模型，请先配置平台', 'warning', {
      text: '去配置',
      onClick: () => { window.open(chrome.runtime.getURL('dashboard/dashboard.html#models')); }
    });
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h2>添加新成员</h2>
        <button class="modal-close" id="closeAddMemberModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="newMemberName">成员名称 <span class="required">*</span></label>
          <input type="text" id="newMemberName" class="form-input" placeholder="输入成员名称" autocomplete="off">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancelCreateMemberBtn">取消</button>
        <button class="btn btn-primary" id="confirmCreateMemberBtn">
          <span>+</span> 添加
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const nameInput = document.getElementById('newMemberName');
  if (nameInput) {
    setTimeout(() => nameInput.focus(), 100);
  }

  const closeModal = () => {
    const m = document.querySelector('.modal-overlay.active');
    if (m) document.body.removeChild(m);
  };

  document.getElementById('closeAddMemberModal').addEventListener('click', closeModal);
  document.getElementById('cancelCreateMemberBtn').addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  document.getElementById('confirmCreateMemberBtn').addEventListener('click', async () => {
    const memberName = document.getElementById('newMemberName').value.trim();

    if (!memberName) {
      showToast('请输入成员名称', 'warning');
      return;
    }

    try {
const defaultModel = pickModelWithWeight(state.models);

      const newMember = {
        id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
        name: memberName,
        platformId: defaultModel.platformId,
        modelId: defaultModel.id,
        modelCode: defaultModel.code,
        platformName: defaultModel.platformName,
        accessMethod: defaultModel.accessMethod,
        color: defaultModel.color || '#667eea',
        systemPrompt: '',
        webUrl: defaultModel.webUrl || ''
      };

      if (defaultModel.accessMethod === 'api') {
        newMember.baseUrl = defaultModel.baseUrl || '';
        newMember.apiKey = defaultModel.apiKey || '';
      }

      const currentMembers = state.conversation.members || [];
      const updatedMembers = [...currentMembers, newMember];
      const memberIds = updatedMembers.map(m => m.id);
      const updates = { members: updatedMembers, memberOrder: memberIds };

      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        closeModal();
        render();
        initSmartPanel();
        await sendMemberJoinTipMessages(conversationId, [newMember]);
      }
    } catch (error) {
      console.error('[Chat] 创建成员失败:', error);
      showToast('创建成员失败：' + error.message, 'error');
    }
  });
}

async function removeMemberFromConversation(memberId) {
  if (!confirm('确定要移除该成员吗？')) {
    return;
  }

  try {
    const currentMembers = state.conversation.members || [];
    const updatedMembers = currentMembers.filter(m => m.id !== memberId);
    const memberIds = updatedMembers.map(m => m.id);
    const updates = { members: updatedMembers, memberOrder: memberIds };

    const updatedConversation = await chrome.runtime.sendMessage({
      action: 'updateConversation',
      conversationId,
      updates
    });

    if (updatedConversation) {
      state.conversation = updatedConversation;
      render();
      initSmartPanel();
      console.log('[Chat] 成员已移除');
    }
  } catch (error) {
    console.error('[Chat] 移除成员失败:', error);
    showToast('移除成员失败: ' + error.message, 'error');
  }
}

function bindCopyButtonEvents() {
  const copyBtns = elements.messagesContainer.querySelectorAll('.copy-msg-btn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const msgIndex = parseInt(btn.dataset.msgIndex);
      const msg = state.conversation.messages[msgIndex];
      if (!msg) return;

      const text = msg.content;
      await copyToClipboard(text, btn);
    });
  });

  // 绑定查看过程按钮事件
  const viewProcessBtns = elements.messagesContainer.querySelectorAll('.view-process-btn');
  viewProcessBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showFlowExecutionLogs();
    });
  });
}

function addCodeCopyButtons(container) {
  const codeBlocks = container.querySelectorAll('pre code');
  codeBlocks.forEach(codeBlock => {
    const pre = codeBlock.parentElement;

    if (pre.querySelector('.code-copy-btn')) return;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy-btn';
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
    copyBtn.title = '复制代码';
    copyBtn.onclick = async () => {
      const codeText = codeBlock.textContent;
      await copyToClipboard(codeText, copyBtn);
    };

    pre.appendChild(copyBtn);
  });
}

function renderMathFormulas(container) {
  if (typeof katex === 'undefined') {
    console.warn('[Math] KaTeX 未加载，跳过公式渲染');
    return;
  }

  // 渲染块级公式
  container.querySelectorAll('.math-block[data-formula]').forEach(el => {
    try {
      const formula = el.getAttribute('data-formula');
      katex.render(formula, el, {
        displayMode: true,
        throwOnError: false,
        trust: true
      });
    } catch (e) {
      console.error('[Math] 块级公式渲染失败:', e);
      el.textContent = el.getAttribute('data-formula');
    }
  });

  // 渲染行内公式
  container.querySelectorAll('.math-inline[data-formula]').forEach(el => {
    try {
      const formula = el.getAttribute('data-formula');
      katex.render(formula, el, {
        displayMode: false,
        throwOnError: false,
        trust: true
      });
    } catch (e) {
      console.error('[Math] 行内公式渲染失败:', e);
      el.textContent = el.getAttribute('data-formula');
    }
  });
}

function showCopyToast(message, duration = 2000) {
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // 触发动画
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 自动消失
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    showCopySuccess(button);
    showCopyToast('已复制到剪贴板');
    console.log('[复制] 成功复制到剪贴板');
  } catch (err) {
    console.error('[复制] 复制失败:', err);
    fallbackCopy(text, button);
  }
}

function fallbackCopy(text, button) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
    showCopySuccess(button);
    console.log('[复制] 使用降级方案复制成功');
  } catch (err) {
    console.error('[复制] 降级方案也失败:', err);
    if (button) {
      const originalHTML = button.innerHTML;
      button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>失败</span>`;
      button.classList.add('error');
      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.classList.remove('error');
      }, 2000);
    }
  }

  document.body.removeChild(textarea);
}

function showCopySuccess(button) {
  if (!button) return;

  const originalHTML = button.innerHTML;
  const originalClass = button.className;

  if (button.classList.contains('code-copy-btn')) {
    button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
  } else {
    button.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>已复制</span>`;
  }
  button.classList.add('copied');

  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.className = originalClass;
  }, 2000);
}

// ========== 会话侧边栏功能 ==========

// 侧边栏状态
const sidebarState = {
  conversations: [],
  isCollapsed: false,
  contextMenuConvId: null
};

// 初始化侧边栏
async function initSidebar() {
  // 加载侧边栏折叠状态
  const { sidebarCollapsed } = await chrome.storage.local.get('sidebarCollapsed');
  sidebarState.isCollapsed = sidebarCollapsed || false;

  const sidebar = document.getElementById('conversationSidebar');
  if (sidebar && sidebarState.isCollapsed) {
    sidebar.classList.add('collapsed');
  }

  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.style.display = sidebarState.isCollapsed ? 'flex' : 'none';
  }

  // 绑定侧边栏事件
  bindSidebarEvents();

  // 加载会话列表
  await loadSidebarConversations();
}

// 绑定侧边栏事件
function bindSidebarEvents() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }

  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  if (sidebarCollapseBtn) {
    sidebarCollapseBtn.addEventListener('click', toggleSidebar);
  }

  const newChatBtn = document.getElementById('newChatBtn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', showNewConversationModal);
  }

  const sidebarSearchToggle = document.getElementById('sidebarSearchToggle');
  if (sidebarSearchToggle) {
    sidebarSearchToggle.addEventListener('click', openSearchModal);
  }

  const searchModalClose = document.getElementById('searchModalClose');
  if (searchModalClose) {
    searchModalClose.addEventListener('click', closeSearchModal);
  }

  const searchModalOverlay = document.getElementById('searchModalOverlay');
  if (searchModalOverlay) {
    searchModalOverlay.addEventListener('click', (e) => {
      if (e.target === searchModalOverlay) closeSearchModal();
    });
  }

  const searchModalInput = document.getElementById('searchModalInput');
  if (searchModalInput) {
    let searchTimeout;
    searchModalInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(e.target.value.trim());
      }, 300);
    });
    searchModalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSearchModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
    }
  });

  const openDashboardBtn = document.getElementById('openDashboardBtn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
    });
  }

  // 主题切换按钮
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn && window.themeManager) {
    themeToggleBtn.addEventListener('click', () => {
      window.themeManager.toggle();
    });
  }

  document.addEventListener('click', () => {
    hideContextMenu();
  });
}

function openSearchModal() {
  const overlay = document.getElementById('searchModalOverlay');
  const input = document.getElementById('searchModalInput');
  if (!overlay) return;
  overlay.classList.add('active');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

function closeSearchModal() {
  const overlay = document.getElementById('searchModalOverlay');
  const results = document.getElementById('searchModalResults');
  if (overlay) overlay.classList.remove('active');
  if (results) results.innerHTML = '';
}

function performSearch(keyword) {
  const resultsContainer = document.getElementById('searchModalResults');
  if (!resultsContainer) return;

  if (!keyword) {
    resultsContainer.innerHTML = '';
    return;
  }

  const lowerKeyword = keyword.toLowerCase();
  const results = [];

  for (const conv of sidebarState.conversations) {
    if (conv.name && conv.name.toLowerCase().includes(lowerKeyword)) {
      results.push({
        convId: conv.id,
        convName: conv.name,
        content: conv.name,
        time: formatSidebarTime(conv.updatedAt || conv.createdAt),
        matchField: 'title'
      });
    }

    if (conv.messages && conv.messages.length > 0) {
      for (const msg of conv.messages) {
        if (msg.content && msg.content.toLowerCase().includes(lowerKeyword)) {
          const idx = msg.content.toLowerCase().indexOf(lowerKeyword);
          const start = Math.max(0, idx - 40);
          const end = Math.min(msg.content.length, idx + keyword.length + 80);
          let snippet = (start > 0 ? '...' : '') + msg.content.substring(start, end) + (end < msg.content.length ? '...' : '');
          
          const existing = results.find(r => r.convId === conv.id);
          if (!existing) {
            results.push({
              convId: conv.id,
              convName: conv.name,
              content: snippet,
              time: formatSidebarTime(conv.updatedAt || conv.createdAt),
              keyword: keyword,
              matchField: 'content'
            });
          } else if (existing.matchField === 'title' && results.indexOf(existing) === results.length - 1) {
            existing.content = snippet;
            existing.keyword = keyword;
            existing.matchField = 'both';
          }
          break;
        }
      }
    }
  }

  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="search-modal-empty">没有找到匹配的对话</div>';
    return;
  }

  resultsContainer.innerHTML = results.map(r => {
    const highlightedContent = r.keyword
      ? escapeHtml(r.content).replace(new RegExp(escapeHtml(r.keyword), 'gi'), '<mark>$&</mark>')
      : escapeHtml(r.content);
    return `
      <div class="search-result-item" data-conv-id="${r.convId}" role="option">
        <div class="search-result-icon">💬</div>
        <div class="search-result-body">
          <div class="search-result-header">
            <span class="search-result-title">${escapeHtml(r.convName)}</span>
            <span class="search-result-time">${r.time}</span>
          </div>
          <div class="search-result-content">${highlightedContent}</div>
        </div>
      </div>
    `;
  }).join('');

  resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const convId = item.dataset.convId;
      closeSearchModal();
      if (convId !== conversationId) {
        window.location.href = `chat.html?id=${convId}`;
      }
    });
  });
}

// 切换侧边栏
async function toggleSidebar() {
  const sidebar = document.getElementById('conversationSidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (!sidebar) return;

  sidebarState.isCollapsed = !sidebarState.isCollapsed;
  sidebar.classList.toggle('collapsed', sidebarState.isCollapsed);

  if (sidebarToggle) {
    sidebarToggle.style.display = sidebarState.isCollapsed ? 'flex' : 'none';
  }

  await chrome.storage.local.set({ sidebarCollapsed: sidebarState.isCollapsed });
}

// 加载会话列表
async function loadSidebarConversations() {
  try {
    const conversations = await chrome.runtime.sendMessage({ action: 'getConversations' });
    sidebarState.conversations = (conversations || []).sort((a, b) =>
      (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
    );
    renderSidebarList();
  } catch (error) {
    console.error('[Sidebar] 加载会话列表失败:', error);
  }
}

// 渲染会话列表
function renderSidebarList() {
  const container = document.getElementById('sidebarConversations');
  if (!container) return;

  let conversations = sidebarState.conversations;

  const groups = groupConversationsByDate(conversations);

  const threeDotSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z" fill="currentColor"></path><path d="M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z" fill="currentColor"></path><path d="M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z" fill="currentColor"></path></svg>';

  const collapseSvg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const modeBadges = {
    brainstorming: { text: '风暴', cls: 'sb-badge-brainstorm' },
    discussion: { text: '讨论', cls: 'sb-badge-discuss' },
    expertqa: { text: '专家', cls: 'sb-badge-expert' }
  };

  container.innerHTML = groups.map(group => {
    return `
      <div class="sidebar-date-group" data-group-key="${group.key}">
        <div class="sidebar-date-label">${group.label}</div>
        <div class="sidebar-group-items">
          ${group.items.map(conv => {
            const isActive = conv.id === conversationId;
            const mode = conv.mode || 'brainstorming';
            const badge = modeBadges[mode] || modeBadges.brainstorming;
            const titleStatus = conv.titleStatus || (conv.nameIsDefault ? 'default' : 'done');
            return `
              <div class="sidebar-conv-item ${isActive ? 'active' : ''}"
                   data-conv-id="${conv.id}"
                   title="${escapeHtml(conv.name)}">
                <span class="sb-mode-badge ${badge.cls}">${badge.text}</span>
                <div class="sidebar-conv-name" data-title-status="${titleStatus}">${escapeHtml(conv.name)}</div>
                <button class="sidebar-conv-more" data-conv-id="${conv.id}" title="更多操作">${threeDotSvg}</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.sidebar-conv-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar-conv-more')) return;
      const convId = item.dataset.convId;
      if (convId !== conversationId) {
        window.location.href = `chat.html?id=${convId}`;
      }
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      sidebarState.contextMenuConvId = item.dataset.convId;
      showContextMenu(e.clientX, e.clientY);
    });
  });

  container.querySelectorAll('.sidebar-conv-more').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      sidebarState.contextMenuConvId = btn.dataset.convId;
      showContextMenu(rect.left, rect.bottom);
    });
  });

  if (conversationId) {
    const activeItem = container.querySelector('.sidebar-conv-item.active');
    if (activeItem) {
      requestAnimationFrame(() => {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }
}

function groupConversationsByDate(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups = {
    today: { key: 'today', label: '今天', items: [] },
    yesterday: { key: 'yesterday', label: '昨天', items: [] },
    week: { key: 'week', label: '最近7天', items: [] },
    older: { key: 'older', label: '更早', items: [] }
  };

  conversations.forEach(conv => {
    const ts = conv.updatedAt || conv.createdAt;
    if (ts >= today) {
      groups.today.items.push(conv);
    } else if (ts >= yesterday) {
      groups.yesterday.items.push(conv);
    } else if (ts >= weekAgo) {
      groups.week.items.push(conv);
    } else {
      groups.older.items.push(conv);
    }
  });

  return Object.values(groups).filter(g => g.items.length > 0);
}

// 格式化时间
function formatSidebarTime(timestamp) {
  if (!timestamp) return '';

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 显示右键菜单
function showContextMenu(x, y) {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;

  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // 绑定菜单项点击事件
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.onclick = () => {
      const action = item.dataset.action;
      handleContextMenuAction(action);
      hideContextMenu();
    };
  });
}

// 隐藏右键菜单
function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

// 处理右键菜单操作
async function handleContextMenuAction(action) {
  const convId = sidebarState.contextMenuConvId;
  if (!convId) return;

  if (action === 'delete') {
    await deleteConversationFromSidebar(convId);
  } else if (action === 'export') {
    exportConversationFromSidebar(convId);
  } else if (action === 'rename') {
    await renameConversationFromSidebar(convId);
  } else if (action === 'batchDelete') {
    openBatchDeleteModal();
  }
}

// 重命名会话（内联编辑）
async function renameConversationFromSidebar(convId) {
  const conv = sidebarState.conversations.find(c => c.id === convId);
  if (!conv) return;

  const container = document.getElementById('sidebarConversations');
  const item = container.querySelector(`[data-conv-id="${convId}"]`);
  const nameEl = item?.querySelector('.sidebar-conv-name');
  if (!nameEl) return;

  const originalName = conv.name;
  
  nameEl.contentEditable = 'true';
  nameEl.classList.add('editing');
  nameEl.focus();
  
  // 选中文本
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const saveAndReset = async () => {
    const newName = nameEl.textContent.trim();
    nameEl.contentEditable = 'false';
    nameEl.classList.remove('editing');
    
    if (newName && newName !== originalName) {
      try {
        await chrome.runtime.sendMessage({
          action: 'updateConversation',
          conversationId: convId,
          updates: { name: newName }
        });

        // 刷新列表
        await loadSidebarConversations();

        // 如果是当前会话，更新显示
        if (convId === conversationId) {
          const conversationName = document.getElementById('conversationName');
          if (conversationName) {
            conversationName.textContent = newName;
            conversationName.title = newName;
          }
        }
      } catch (error) {
        console.error('[Sidebar] 重命名会话失败:', error);
        nameEl.textContent = originalName;
      }
    } else {
      nameEl.textContent = originalName;
    }
  };

  const handleBlur = () => {
    saveAndReset();
    nameEl.removeEventListener('blur', handleBlur);
    nameEl.removeEventListener('keydown', handleKeydown);
  };

  const handleKeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      nameEl.textContent = originalName;
      nameEl.blur();
    }
  };

  nameEl.addEventListener('blur', handleBlur);
  nameEl.addEventListener('keydown', handleKeydown);
}

// 删除会话
async function deleteConversationFromSidebar(convId) {
  try {
    // 获取会话数据以清理平台会话
    const conv = sidebarState.conversations.find(c => c.id === convId);
    if (conv && conv.memberUrls) {
      // 清理平台会话
      for (const [memberId, conversationUrl] of Object.entries(conv.memberUrls)) {
        if (conversationUrl) {
          try {
            await chrome.runtime.sendMessage({
              action: 'deletePlatformConversation',
              provider: conv.memberSettings?.[memberId]?.provider,
              conversationUrl
            });
          } catch (e) {
            console.error('[Sidebar] 删除平台会话失败:', e);
          }
        }
      }
    }

    // 删除会话
    await chrome.runtime.sendMessage({
      action: 'deleteConversation',
      conversationId: convId
    });

    // 如果删除的是当前会话，跳转到第一个会话或显示空状态
    if (convId === conversationId) {
      const remaining = sidebarState.conversations.filter(c => c.id !== convId);
      if (remaining.length > 0) {
        window.location.href = `chat.html?id=${remaining[0].id}`;
      } else {
        window.location.href = `chat.html`;
      }
    } else {
      // 刷新列表
      await loadSidebarConversations();
    }
  } catch (error) {
    console.error('[Sidebar] 删除会话失败:', error);
    showToast('删除失败: ' + error.message, 'error');
  }
}

// 导出会话
function exportConversationFromSidebar(convId) {
  const conv = sidebarState.conversations.find(c => c.id === convId);
  if (!conv) return;

  const dataStr = JSON.stringify(conv, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation-${conv.name}-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// ========== 新建会话模态框 ==========

// 随机昵称库
const NICKNAMES = [
  '子墨', '雨桐', '思远', '晨曦', '星辰', '清风', '明月', '白云', '青山', '流水',
  '知秋', '听雨', '望舒', '映雪', '若溪', '逸飞', '书衡', '瑾瑜', '皓轩', '睿哲',
  '语嫣', '芷若', '念真', '怀瑾', '拾光', '初见', '长安', '归晚', '南风', '北辰',
  '墨白', '竹心', '兰亭', '松言', '鹤鸣', '鹿鸣', '凤栖', '龙吟', '虎啸', '鹰扬',
  '天佑', '嘉禾', '瑞霖', '景行', '弘毅', '致远', '明德', '修远', '凌云', '博雅',
  '文渊', '翰林', '锦书', '玉衡', '金戈', '铁衣', '丹心', '碧落', '紫电', '青霜',
  '问渠', '寻芳', '听泉', '望岳', '临风', '踏雪', '采薇', '折桂', '听荷', '品竹'
];

/**
 * 生成指定数量的随机昵称（不重复）
 */
function generateRandomNicknames(count) {
  const shuffled = [...NICKNAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, NICKNAMES.length));
}

/**
 * 加权随机选择一个模型（降低豆包/Kimi 被选中的概率）
 */
function pickModelWithWeight(models) {
  const weights = models.map(m => {
    const name = (m.platformName || m.code || m.modelCode || '').toLowerCase();
    if (name.includes('豆包') || name.includes('kimi') || name.includes('doubao')) return 0.15;
    return 1.0;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < models.length; i++) {
    r -= weights[i];
    if (r <= 0) return models[i];
  }
  return models[models.length - 1];
}

/**
 * 自动生成成员（使用系统启用的模型）
 */
async function generateAutoMembers(count, allModels) {
  const enabledModels = allModels.filter(m => m.enabled !== false);
  const nicknames = generateRandomNicknames(count);
  
  if (enabledModels.length === 0) {
    console.error('[AutoMembers] 没有可用的启用模型');
    return [];
  }

  // 根据对话模式自动选择场景对应提示词
  const sceneMap = {
    brainstorming: '头脑风暴',
    discussion: '圆桌讨论'
  };
  const scene = sceneMap[newConvState.mode];
  let scenePrompts = [];
  if (scene) {
    const result = await chrome.runtime.sendMessage({
      action: 'getPromptsByScene',
      scene
    }).catch(() => []);
    scenePrompts = Array.isArray(result) ? result : [];
  }

  const members = [];
  const usedPromptIds = new Set();

  for (let i = 0; i < count; i++) {
    const model = pickModelWithWeight(enabledModels);
    let systemPrompt = '';

    // 从场景提示词中选一个最少使用且不重复的
    if (scenePrompts.length > 0) {
      const available = scenePrompts
        .filter(p => !usedPromptIds.has(p.id))
        .sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));

      if (available.length === 0) {
        usedPromptIds.clear();
        scenePrompts.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
        if (scenePrompts.length > 0) {
          usedPromptIds.add(scenePrompts[0].id);
          systemPrompt = scenePrompts[0].content || '';
          chrome.runtime.sendMessage({ action: 'recordPromptUsage', promptId: scenePrompts[0].id });
        }
      } else {
        usedPromptIds.add(available[0].id);
        systemPrompt = available[0].content || '';
        chrome.runtime.sendMessage({ action: 'recordPromptUsage', promptId: available[0].id });
      }
    }

    const member = {
      id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
      name: nicknames[i],
      platformId: model.platformId,
      modelId: model.id,
      modelCode: model.code,
      platformName: model.platformName,
      accessMethod: model.accessMethod,
      color: model.color || '#667eea',
      systemPrompt: systemPrompt
    };
    if (model.accessMethod === 'api') {
      member.baseUrl = model.baseUrl || '';
      member.apiKey = model.apiKey || '';
    } else {
      member.webUrl = model.webUrl || '';
    }
    members.push(member);
  }
  
  return members;
}

// 新建会话状态
const newConvState = {
  mode: 'brainstorming',
  members: [],
  selectedExpertId: null,
  inlineFormModels: [],
  inlineFormPrompts: []
};

// 显示新建会话模态框
async function showNewConversationModal() {
  const modal = document.getElementById('newConversationModal');
  if (!modal) return;

  // 重置状态
  newConvState.mode = 'brainstorming';
  newConvState.members = [];
  newConvState.selectedExpertId = null;

  // 清空输入
  document.getElementById('convNameInput').value = '';

  // 重置模式选择
  document.querySelectorAll('input[name="convMode"]').forEach(radio => {
    radio.checked = radio.value === 'brainstorming';
  });

  // 重置内联表单
  const inlineForm = document.getElementById('convInlineMemberForm');
  if (inlineForm) {
    inlineForm.classList.remove('expanded');
    inlineForm.style.display = 'none';
  }

  // 加载数据
  await loadNewConvModalData();

  // 更新UI
  updateNewConvModeVisibility('brainstorming');
  renderNewConvMemberList();

  modal.classList.add('active');
}

// 加载模态框数据
async function loadNewConvModalData() {
  try {
    const [models, prompts, experts] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getModels' }).catch(() => []),
      chrome.runtime.sendMessage({ action: 'getPrompts' }).catch(() => []),
      chrome.runtime.sendMessage({ action: 'getExperts' }).catch(() => [])
    ]);

    newConvState.inlineFormModels = (models || []).filter(m => m.enabled !== false);
    newConvState.inlineFormPrompts = prompts || [];

    if (experts && experts.length > 0) {
      const expertSelector = document.getElementById('expertSelector');
      if (expertSelector) {
        expertSelector.innerHTML = experts.map(expert => `
          <div class="expert-option" data-expert-id="${expert.id}">
            <div class="expert-option-icon">${expert.icon && expert.icon.startsWith('http') ? `<img src="${escapeHtml(expert.icon)}" alt="专家图标" style="width:32px;height:32px;border-radius:50%;">` : escapeHtml(expert.icon || '🎓')}</div>
            <div class="expert-option-info">
              <div class="expert-option-name">${escapeHtml(expert.name)}</div>
              <div class="expert-option-desc">${escapeHtml(expert.description || '暂无描述')}</div>
            </div>
          </div>
        `).join('');

        expertSelector.querySelectorAll('.expert-option').forEach(opt => {
          opt.addEventListener('click', () => {
            expertSelector.querySelectorAll('.expert-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            newConvState.selectedExpertId = opt.dataset.expertId;
          });
        });
      }
    } else {
      const expertSelector = document.getElementById('expertSelector');
      if (expertSelector) expertSelector.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;"><div style="font-size:28px;margin-bottom:8px;">🎓</div><p style="margin:0 0 12px;font-size:13px;color:#86868b;">暂无可用专家</p><a href="#" id="gotoAddExpertLinkEmpty" style="display:inline-flex;align-items:center;gap:4px;color:#667eea;text-decoration:none;font-size:13px;font-weight:500;padding:6px 14px;border:1px solid #667eea;border-radius:8px;transition:all .2s;">去添加 →</a></div>';
      const gotoLink = document.getElementById('gotoAddExpertLinkEmpty');
      if (gotoLink) {
        gotoLink.addEventListener('click', (e) => {
          e.preventDefault();
          window.open(chrome.runtime.getURL('dashboard/dashboard.html#experts'));
        });
      }
    }

    // 处理标签旁边的"去添加"链接
    const gotoAddExpertLink = document.getElementById('gotoAddExpertLink');
    if (gotoAddExpertLink) {
      gotoAddExpertLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(chrome.runtime.getURL('dashboard/dashboard.html#experts'));
      });
    }

    if (!newConvState.eventsBound) {
      document.querySelectorAll('input[name="convMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          newConvState.mode = e.target.value;
          updateNewConvModeVisibility(e.target.value);
        });
      });

      // 成员数量滑块事件
      const memberCountSlider = document.getElementById('memberCountSlider');
      const memberCountValue = document.getElementById('memberCountValue');
      if (memberCountSlider && memberCountValue) {
        const updateSliderProgress = (val) => {
          const min = parseInt(memberCountSlider.min) || 1;
          const max = parseInt(memberCountSlider.max) || 6;
          const percent = ((val - min) / (max - min)) * 100;
          memberCountSlider.style.setProperty('--value-percent', `${percent}%`);
        };
        memberCountSlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          memberCountValue.textContent = val;
          updateSliderProgress(val);
        });
        updateSliderProgress(parseInt(memberCountSlider.value));
      }

      const closeBtn = document.getElementById('closeConvModalBtn');
      if (closeBtn) {
        closeBtn.addEventListener('click', hideNewConversationModal);
      }

      const cancelBtn = document.getElementById('cancelConvBtn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', hideNewConversationModal);
      }

      const confirmBtn = document.getElementById('confirmConvBtn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', createNewConversation);
      }

      newConvState.eventsBound = true;
    }

  } catch (error) {
    console.error('[NewConvModal] 加载数据失败:', error);
  }
}

// 更新模式可见性
function updateNewConvModeVisibility(mode) {
  const expertGroup = document.getElementById('expertSelectGroup');
  const memberGroup = document.getElementById('memberGroup');

  if (expertGroup) {
    expertGroup.style.display = mode === 'expertqa' ? 'block' : 'none';
  }
  if (memberGroup) {
    memberGroup.style.display = mode !== 'expertqa' ? 'block' : 'none';
  }
}

// 渲染成员列表
function renderNewConvMemberList() {
  const container = document.getElementById('convMemberSelector');
  if (!container) return;

  if (newConvState.members.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
        <p style="margin: 0; font-size: 13px; color: #86868b;">暂无成员，请点击上方"创建新成员"按钮添加</p>
      </div>
    `;
    return;
  }

  // 圆桌讨论模式下显示拖拽手柄
  const isDiscussion = newConvState.mode === 'discussion';

  container.innerHTML = newConvState.members.map((member, index) => {
    const modelCodeDisplay = member.modelCode || '';
    const platformName = member.platformName || '';
    const prompt = newConvState.inlineFormPrompts.find(p => p.content === member.systemPrompt);
    const promptName = prompt ? prompt.name : (member.systemPrompt ? '自定义提示词' : '');

    return `
      <div class="member-option selected${isDiscussion ? ' draggable' : ''}" data-member-id="${member.id}" ${isDiscussion ? 'draggable="true"' : ''}>
        ${isDiscussion ? `<span class="drag-handle" style="cursor:grab;margin-right:8px;color:#999;">⠿</span>` : ''}
        ${isDiscussion ? `<span class="order-number" style="margin-right:8px;color:#666;font-weight:600;">${index + 1}</span>` : ''}
        <div class="member-option-info">
          <div class="member-option-name">${escapeHtml(member.name)}</div>
          <div class="member-option-meta">
            <span>${escapeHtml(modelCodeDisplay)}(${escapeHtml(platformName)})</span>
            ${promptName ? `<span style="margin-left: 8px;">📝 ${escapeHtml(promptName)}</span>` : ''}
          </div>
        </div>
        <button class="remove-member-btn" data-member-id="${member.id}">×</button>
      </div>
    `;
  }).join('');

  // 绑定删除事件
  container.querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = btn.dataset.memberId;
      newConvState.members = newConvState.members.filter(m => m.id !== memberId);
      renderNewConvMemberList();
    });
  });

  // 圆桌讨论模式下启用拖拽排序
  if (isDiscussion) {
    initNewConvDragSort();
  }
}

// 初始化拖拽排序
function initNewConvDragSort() {
  const container = document.getElementById('convMemberSelector');
  if (!container) return;

  let draggedItem = null;

  container.querySelectorAll('.member-option[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      if (draggedItem) draggedItem.style.opacity = '1';
      draggedItem = null;
      updateNewConvMemberOrder();
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        const allItems = Array.from(container.querySelectorAll('.member-option'));
        const draggedIndex = allItems.indexOf(draggedItem);
        const targetIndex = allItems.indexOf(item);

        if (draggedIndex < targetIndex) {
          item.after(draggedItem);
        } else {
          item.before(draggedItem);
        }
      }
    });
  });
}

// 更新成员顺序
function updateNewConvMemberOrder() {
  const container = document.getElementById('convMemberSelector');
  if (!container) return;

  const newOrder = Array.from(container.querySelectorAll('.member-option'))
    .map(el => el.dataset.memberId);

  newConvState.members.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));

  // 更新序号显示
  container.querySelectorAll('.member-option').forEach((item, index) => {
    const orderNum = item.querySelector('.order-number');
    if (orderNum) orderNum.textContent = index + 1;
  });
}

// 保存内联成员
async function saveNewConvInlineMember() {
  const nameInput = document.getElementById('convNewMemberName');
  const modelSelect = document.getElementById('convNewMemberModel');
  const promptSelect = document.getElementById('convNewMemberPrompt');
  const saveBtn = document.getElementById('convSaveInlineBtn');

  if (!nameInput || !modelSelect || !saveBtn) return;

  const memberName = nameInput.value.trim();
  const modelId = modelSelect.value;
  const promptId = promptSelect ? promptSelect.value : null;

  if (!memberName) { nameInput.classList.add('error'); return; }
  if (!modelId) { modelSelect.classList.add('error'); return; }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="loading-spinner"></span> 创建中...';

  try {
    const model = newConvState.inlineFormModels.find(m => m.id === modelId);
    if (!model) throw new Error('模型不存在');

    let systemPrompt = '';
    if (promptId) {
      const prompt = newConvState.inlineFormPrompts.find(p => p.id === promptId);
      if (prompt) systemPrompt = prompt.content || '';
    }

    // 直接创建 Member 对象，使用新架构的数据结构
    const newMember = {
      id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
      name: memberName,
      platformId: model.platformId,
      modelId: model.id,
      modelCode: model.code,
      platformName: model.platformName,
      accessMethod: model.accessMethod,
      color: model.color || '#667eea',
      systemPrompt: systemPrompt
    };

    if (model.accessMethod === 'api') {
      newMember.baseUrl = model.baseUrl || '';
      newMember.apiKey = model.apiKey || '';
    } else {
      newMember.webUrl = model.webUrl || '';
    }

    newConvState.members.push(newMember);
    renderNewConvMemberList();
    const form = document.getElementById('convInlineMemberForm');
    if (form) form.style.display = 'none';
    resetInlineMemberForm();
  } catch (error) {
    console.error('[NewConvModal] 创建成员失败:', error);
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span>✗</span> 创建失败';
    saveBtn.style.background = 'linear-gradient(135deg, #ff3b30 0%, #d63020 100%)';
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>✨</span> 添加';
      saveBtn.style.background = '';
    }, 2000);
  }
}

// 重置内联表单
function resetInlineMemberForm() {
  const nameInput = document.getElementById('convNewMemberName');
  const modelSelect = document.getElementById('convNewMemberModel');
  const promptSelect = document.getElementById('convNewMemberPrompt');
  const saveBtn = document.getElementById('convSaveInlineBtn');

  if (nameInput) { nameInput.value = ''; nameInput.classList.remove('error', 'success'); }
  if (modelSelect) { modelSelect.value = ''; modelSelect.classList.remove('error', 'success'); }
  if (promptSelect) promptSelect.value = '';
  if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span>✨</span> 添加'; saveBtn.style.background = ''; }
}

// 显示新建会话弹窗（带输入内容）
async function showNewConversationWithInput(inputContent) {
  // 清空输入框
  elements.messageInput.value = '';

  // 显示模态框
  await showNewConversationModal();

  // 设置会话名称
  const nameInput = document.getElementById('convNameInput');
  if (nameInput) {
    // 截取前30个字符作为会话名称
    const suggestedName = inputContent.length > 30 ? inputContent.substring(0, 30) + '...' : inputContent;
    nameInput.value = suggestedName;
  }

  // 保存输入内容，以便创建会话后自动发送
  newConvState.pendingMessage = inputContent;

  // 显示提示信息
  const modalHeader = document.querySelector('#newConversationModal .modal-header h2');
  if (modalHeader) {
    const originalText = modalHeader.textContent;
    modalHeader.textContent = '创建会话以发送消息';
    
    // 恢复原始文本
    setTimeout(() => {
      modalHeader.textContent = originalText;
    }, 3000);
  }
}

// 隐藏新建会话模态框
function hideNewConversationModal() {
  const modal = document.getElementById('newConversationModal');
  if (modal) {
    modal.classList.remove('active');
  }
  // 清除待发送的消息
  newConvState.pendingMessage = null;
}

// 创建新会话
async function createNewConversation() {
  const nameInput = document.getElementById('convNameInput');
  const name = nameInput ? nameInput.value.trim() : '';
  const mode = newConvState.mode;

  const data = {
    name: name || undefined,
    mode
  };

  if (mode === 'expertqa') {
    if (!newConvState.selectedExpertId) {
      showToast('请先选择一个专家', 'warning');
      return;
    }
    data.expertId = newConvState.selectedExpertId;
    data.members = [];
  } else {
    // 自动生成成员
    const memberCountSlider = document.getElementById('memberCountSlider');
    const memberCount = memberCountSlider ? parseInt(memberCountSlider.value) : 2;
    
    const members = await generateAutoMembers(memberCount, newConvState.inlineFormModels);

    if (mode === 'discussion' && members.length < 2) {
      showToast('圆桌讨论至少需要 2 个成员', 'warning');
      return;
    }
    
    if (members.length === 0) {
      showToast('没有可用的模型，请先配置平台', 'warning', {
        text: '去配置',
        onClick: () => { window.open(chrome.runtime.getURL('dashboard/dashboard.html#models')); }
      });
      return;
    }
    
    data.members = members;

    if (mode === 'discussion') {
      data.memberOrder = members.map(m => m.id);
    }
  }

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'createConversation',
      ...data
    });

    if (result && result.id) {
      const pendingMessage = newConvState.pendingMessage;
      hideNewConversationModal();

      // 导航到新会话
      window.location.href = `chat.html?id=${result.id}${pendingMessage ? '&autoSend=' + encodeURIComponent(pendingMessage) : ''}`;
    }
  } catch (error) {
    console.error('[NewConvModal] 创建会话失败:', error);
    showToast('创建失败: ' + (error.message || error), 'error');
  }
}

// ==================== Dashboard Mode Showcase ====================

// 动画常量
const DASHBOARD_ANIMATION = {
  BASE_DELAY: 500,
  PER_AI_DELAY: 1800,
  END_DELAY: 3000
};

function clearDashboardAnimations() {
  console.log('[Chat] 清理 dashboard 动画');

  // 停止轮播
  dashboardState.showcaseRunning = false;
  clearInterval(dashboardState.showcaseTimer);
  dashboardState.showcaseTimer = null;

  // 清理所有定时器
  Object.keys(dashboardState.modeTimers).forEach(mode => {
    if (dashboardState.modeTimers[mode]) {
      clearInterval(dashboardState.modeTimers[mode]);
      delete dashboardState.modeTimers[mode];
    }
  });

  // 重置状态
  dashboardState.modeCurrentIndex = { brainstorming: -1, discussion: -1, expertqa: -1 };
  dashboardState.modePlaying = {};

  // 清空对话示例
  elements.messagesContainer.innerHTML = '';

  // 恢复 header 和输入框显示
  const chatHeader = document.querySelector('.chat-header');
  const inputContainer = document.querySelector('.input-container');
  if (chatHeader) chatHeader.style.display = '';
  if (inputContainer) inputContainer.style.display = '';
}

function renderDashboardWelcome() {
  console.log('[Chat] 渲染 dashboard welcome');

  // 初始化一个空的 conversation 对象
  state.conversation = {
    id: 'demo-showcase',
    name: '演示会话',
    mode: 'brainstorming',
    contextMode: 'self',
    sendMode: 'parallel',
    members: [],
    memberSettings: {},
    memberOrder: [],
    expertId: null,
    memberUrls: {},
    memberLastMessageIds: {},
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // 开始轮播模式对话
  startModeConversationCarousel();
}

function startModeConversationCarousel() {
  const modes = ['brainstorming', 'discussion', 'expertqa'];
  const modeToContextMode = {
    brainstorming: 'self',
    discussion: 'full',
    expertqa: 'self'
  };
  const modeToSendMode = {
    brainstorming: 'parallel',
    discussion: 'sequential',
    expertqa: 'sequential'
  };

  let currentIndex = 0;
  let isRunning = false;

  async function playModeConversation(mode) {
    if (isRunning) return;
    isRunning = true;

    const examples = MODE_EXAMPLES[mode];
    if (!examples || examples.length === 0) {
      isRunning = false;
      return;
    }

    const example = examples[Math.floor(Math.random() * examples.length)];

    // 设置演示会话数据
    state.conversation.mode = mode;
    state.conversation.contextMode = modeToContextMode[mode];
    state.conversation.sendMode = modeToSendMode[mode];
    state.conversation.members = example.preview.ai.map((ai, i) => ({
      id: `demo-${mode}-${i}`,
      name: ai.name,
      provider: 'demo',
      platformName: ai.name,
      color: '#667eea'
    }));
    state.conversation.memberOrder = state.conversation.members.map(m => m.id);
    state.conversation.messages = [];

    // 更新 UI
    updateConversationName();
    renderMembersTags();
    renderModeBadge();
    updateSendButtonState();
    renderMessages();

    // 清空消息容器，不显示空会话提示
    elements.messagesContainer.innerHTML = '';

    await sleep(500);

    // 模拟打字
    const userText = example.preview.user;
    elements.messageInput.value = '';
    elements.messageInput.focus();

    for (let i = 0; i < userText.length; i++) {
      elements.messageInput.value += userText[i];
      updateSendButtonState();
      await sleep(50);
    }

    await sleep(300);

    messageStore.push({
      isUser: true, content: userText, timestamp: Date.now(), _status: 'local'
    });

    elements.messageInput.value = '';
    updateSendButtonState();

    await sleep(200);

    showThinkingIndicator();

    await sleep(800);

    hideThinkingIndicator();

    const emptyMessages = elements.messagesContainer.querySelector('.empty-messages');
    if (emptyMessages) {
      emptyMessages.remove();
    }

    const cleanUserText = userText.replace(/\[Pasted[^\]]*\]/g, '');
    const userViewId = messageStore.find(m => m._status === 'local' && m.isUser)?._viewId;
    if (userViewId) {
      messageStore.update(userViewId, { content: cleanUserText, _status: 'confirmed' });
    }

    await sleep(300);

    for (let i = 0; i < example.preview.ai.length; i++) {
      const ai = example.preview.ai[i];
      const memberId = `demo-${mode}-${i}`;

      messageStore.push({
        isUser: false,
        memberId: memberId,
        content: ai.text,
        memberName: ai.name || `成员${i + 1}`,
        type: 'member',
        timestamp: Date.now() + i + 1,
        _status: 'confirmed'
      });

      await sleep(400);
    }

    await sleep(2000);
    isRunning = false;
  }

  // 清除之前的定时器
  if (dashboardState.showcaseTimer) {
    clearInterval(dashboardState.showcaseTimer);
  }

  // 立即播放第一个模式
  playModeConversation(modes[0]);

  // 轮播切换
  dashboardState.showcaseTimer = setInterval(() => {
    if (!isRunning) {
      currentIndex = (currentIndex + 1) % modes.length;
      playModeConversation(modes[currentIndex]);
    }
  }, 8000);
}

function startDashboardAnimations() {
  console.log('[Chat] 启动 dashboard 动画');
  Object.keys(MODE_EXAMPLES).forEach(mode => {
    playDashboardModePreview(mode);
    startDashboardModeCycle(mode);
  });
}

function startShowcaseCarousel() {
  const cards = document.querySelectorAll('.mode-showcase-card');
  const modes = ['brainstorming', 'discussion', 'expertqa'];
  if (!cards.length) return;

  dashboardState.showcaseIndex = 0;
  dashboardState.showcaseRunning = true;
  cards.forEach(c => c.classList.remove('active', 'exiting'));
  cards[0].classList.add('active');

  async function runCarousel() {
    while (dashboardState.showcaseRunning) {
      const mode = modes[dashboardState.showcaseIndex];
      const card = cards[dashboardState.showcaseIndex];

      await playShowcaseAnimation(mode, card);

      if (!dashboardState.showcaseRunning) break;

      await sleep(1500);

      const nextIndex = (dashboardState.showcaseIndex + 1) % cards.length;
      const next = cards[nextIndex];

      card.classList.remove('active');
      card.classList.add('exiting');
      next.classList.add('active');

      await sleep(600);
      card.classList.remove('exiting');

      dashboardState.showcaseIndex = nextIndex;
    }
  }

  runCarousel();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playShowcaseAnimation(mode, card) {
  const examples = MODE_EXAMPLES[mode];
  if (!examples || !examples.length) return;

  const container = card.querySelector('.mode-showcase-examples');
  if (!container) return;

  const ex = examples[Math.floor(Math.random() * examples.length)];
  const p = ex.preview;
  if (!p || !p.user || !p.ai) return;

  container.innerHTML = '';

  const itemWrap = document.createElement('div');
  itemWrap.className = 'mode-example-item';
  container.appendChild(itemWrap);

  const conv = document.createElement('div');
  conv.className = 'mode-preview-conversation';
  itemWrap.appendChild(conv);

  const inputArea = document.createElement('div');
  inputArea.className = 'mode-preview-input-sim';
  inputArea.innerHTML = `
    <div class="mode-preview-input-box">
      <span class="mode-preview-input-text"></span>
      <span class="mode-preview-input-cursor">|</span>
    </div>
  `;
  itemWrap.appendChild(inputArea);

  const textEl = inputArea.querySelector('.mode-preview-input-text');
  const cursorEl = inputArea.querySelector('.mode-preview-input-cursor');
  const chars = p.user.split('');

  for (let i = 0; i < chars.length; i++) {
    textEl.textContent += chars[i];
    await sleep(45);
  }

  await sleep(400);
  cursorEl.style.display = 'none';
  inputArea.classList.add('mode-preview-input-submitted');
  await sleep(300);
  textEl.textContent = '';
  inputArea.classList.remove('mode-preview-input-submitted');

  const userDiv = document.createElement('div');
  userDiv.className = 'mode-preview-user message';
  userDiv.innerHTML = `
    <div class="message-avatar user-avatar"><img src="${generateAvatarUrl('Me')}" alt="我"></div>
    <div class="message-body">
      <div class="message-header-row"><span class="message-sender-name">我</span></div>
      <div class="mode-preview-user-bubble message-text">${escapeHtml(p.user)}</div>
    </div>
  `;
  conv.appendChild(userDiv);

  for (const ai of p.ai) {
    const typing = document.createElement('div');
    typing.className = 'mode-preview-typing';
    typing.innerHTML = '<div class="mode-preview-typing-dot"></div><div class="mode-preview-typing-dot"></div><div class="mode-preview-typing-dot"></div>';
    conv.appendChild(typing);
    await sleep(1200);

    const aiDiv = document.createElement('div');
    aiDiv.className = 'mode-preview-ai message ai-message';
    aiDiv.innerHTML = `
      <div class="message-avatar ai-avatar"><img src="${generateAvatarUrl(ai.name)}" alt="${escapeHtml(ai.name)}"></div>
      <div class="message-body">
        <div class="message-header-row"><span class="message-sender-name">${escapeHtml(ai.name)}</span></div>
        <div class="mode-preview-ai-bubble message-text">${escapeHtml(ai.text)}</div>
      </div>
    `;
    conv.appendChild(aiDiv);
    await sleep(600);
  }

  const hintSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
  const hint = document.createElement('div');
  hint.className = 'mode-example-hint';
  hint.innerHTML = `点击开始 ${hintSvg}`;
  itemWrap.appendChild(hint);
}

async function playDashboardModePreview(mode) {
  if (dashboardState.modePlaying[mode]) return;
  dashboardState.modePlaying[mode] = true;

  try {
    const examples = MODE_EXAMPLES[mode];

    // 数据验证
    if (!examples || !Array.isArray(examples) || examples.length === 0) {
      console.warn(`[Chat] 模式 ${mode} 没有示例数据`);
      dashboardState.modePlaying[mode] = false;
      return;
    }

    const containerId = `modeExamples${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    const container = document.getElementById(containerId);

    if (!container) {
      dashboardState.modePlaying[mode] = false;
      return;
    }

    dashboardState.modeCurrentIndex[mode] = (dashboardState.modeCurrentIndex[mode] + 1) % examples.length;
    const ex = examples[dashboardState.modeCurrentIndex[mode]];

    // 验证示例数据格式
    if (!ex || !ex.preview) {
      console.warn(`[Chat] 模式 ${mode} 的示例数据格式错误`);
      dashboardState.modePlaying[mode] = false;
      return;
    }

    const p = ex.preview;
    if (!p.user || !p.ai || !Array.isArray(p.ai)) {
      console.warn(`[Chat] 模式 ${mode} 的预览数据格式错误`);
      dashboardState.modePlaying[mode] = false;
      return;
    }

    container.innerHTML = '';

    const itemWrap = document.createElement('div');
    itemWrap.className = 'mode-example-item';
    itemWrap.dataset.mode = mode;
    itemWrap.dataset.name = ex.name;
    container.appendChild(itemWrap);

    // 对话区域
    const conv = document.createElement('div');
    conv.className = 'mode-preview-conversation';
    itemWrap.appendChild(conv);

    // 底部输入框
    const inputArea = document.createElement('div');
    inputArea.className = 'mode-preview-input-sim';
    inputArea.innerHTML = `
      <div class="mode-preview-input-box">
        <span class="mode-preview-input-text"></span>
        <span class="mode-preview-input-cursor">|</span>
      </div>
    `;
    itemWrap.appendChild(inputArea);

    // 逐字打字动画
    const textEl = inputArea.querySelector('.mode-preview-input-text');
    const cursorEl = inputArea.querySelector('.mode-preview-input-cursor');
    const chars = p.user.split('');
    let charIndex = 0;

    await new Promise(resolve => {
      const typeInterval = setInterval(() => {
        if (charIndex < chars.length) {
          textEl.textContent += chars[charIndex];
          charIndex++;
        } else {
          clearInterval(typeInterval);
          setTimeout(() => {
            cursorEl.style.display = 'none';
            inputArea.classList.add('mode-preview-input-submitted');
            setTimeout(() => {
              textEl.textContent = '';
              inputArea.classList.remove('mode-preview-input-submitted');
            }, 300);
            resolve();
          }, 400);
        }
      }, 45);
    });

    // 用户消息出现在对话区
    const userDiv = document.createElement('div');
    userDiv.className = 'mode-preview-user';
    userDiv.innerHTML = `<div class="mode-preview-user-bubble">${escapeHtml(p.user)}</div>`;
    conv.appendChild(userDiv);

    // AI 回复
    let aiDelay = 600;
    p.ai.forEach((ai) => {
      const typing = document.createElement('div');
      typing.className = 'mode-preview-typing';
      typing.style.animationDelay = aiDelay + 'ms';
      typing.innerHTML = '<div class="mode-preview-typing-dot"></div><div class="mode-preview-typing-dot"></div><div class="mode-preview-typing-dot"></div>';
      conv.appendChild(typing);
      aiDelay += 1200;

      const aiDiv = document.createElement('div');
      aiDiv.className = 'mode-preview-ai';
      aiDiv.style.animationDelay = aiDelay + 'ms';
      aiDiv.innerHTML = `<div class="mode-preview-ai-name">${escapeHtml(ai.name)}</div><div class="mode-preview-ai-bubble">${escapeHtml(ai.text)}</div>`;
      conv.appendChild(aiDiv);
      aiDelay += 600;
    });

    // 底部提示
    const hintSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    const hint = document.createElement('div');
    hint.className = 'mode-example-hint';
    hint.innerHTML = `点击开始 ${hintSvg}`;
    itemWrap.appendChild(hint);

    restartDashboardModeCycle(mode, aiDelay + 3000);
  } catch (error) {
    console.error(`[Chat] 播放模式 ${mode} 预览时出错:`, error);
  } finally {
    dashboardState.modePlaying[mode] = false;
  }
}

function startDashboardModeCycle(mode) {
  const examples = MODE_EXAMPLES[mode];

  // 数据验证
  if (!examples || !Array.isArray(examples) || examples.length === 0) {
    console.warn(`[Chat] 模式 ${mode} 没有示例数据`);
    return;
  }

  const firstExample = examples[0];
  if (!firstExample || !firstExample.preview || !firstExample.preview.ai) {
    console.warn(`[Chat] 模式 ${mode} 的示例数据格式错误`);
    return;
  }

  const totalDelay = DASHBOARD_ANIMATION.BASE_DELAY + firstExample.preview.ai.length * DASHBOARD_ANIMATION.PER_AI_DELAY + DASHBOARD_ANIMATION.END_DELAY;
  restartDashboardModeCycle(mode, totalDelay);
}

function restartDashboardModeCycle(mode, delay) {
  if (dashboardState.modeTimers[mode]) {
    clearInterval(dashboardState.modeTimers[mode]);
  }
  dashboardState.modeTimers[mode] = setInterval(() => {
    if (!conversationId) {
      playDashboardModePreview(mode);
    }
  }, delay);
}

function bindDashboardCardEvents() {
  document.querySelectorAll('.mode-showcase-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      showNewConversationWithMode(mode);
    });
  });
}

async function showNewConversationWithMode(mode) {
  // 立即清理动画，避免内存泄漏和动画在后台运行
  clearDashboardAnimations();

  // 打开新建会话模态框
  await showNewConversationModal();

  // 设置模式
  newConvState.mode = mode;

  // 更新模式选择器的选中状态
  document.querySelectorAll('input[name="convMode"]').forEach(radio => {
    radio.checked = radio.value === mode;
  });

  // 根据模式显示/隐藏对应的选项
  updateConvModeVisibility(mode);
}

function updateConvModeVisibility(mode) {
  const expertGroup = document.getElementById('expertSelectGroup');
  const memberGroup = document.getElementById('memberGroup');

  if (mode === 'expertqa') {
    expertGroup.style.display = 'block';
    memberGroup.style.display = 'none';
  } else {
    expertGroup.style.display = 'none';
    memberGroup.style.display = 'block';
  }
}

// ==================== 批量删除会话 ====================

const batchDeleteState = {
  selectedIds: new Set()
};

function openBatchDeleteModal() {
  const modal = document.getElementById('batchDeleteModal');
  if (!modal) return;

  // 重置状态
  batchDeleteState.selectedIds.clear();

  // 绑定事件
  bindBatchDeleteEvents();

  // 加载会话列表
  renderBatchDeleteList();

  // 显示模态框
  modal.classList.add('active');
}

function closeBatchDeleteModal() {
  const modal = document.getElementById('batchDeleteModal');
  if (modal) {
    modal.classList.remove('active');
  }
  batchDeleteState.selectedIds.clear();
}

function bindBatchDeleteEvents() {
  // 关闭按钮
  const closeBtn = document.getElementById('closeBatchDeleteModalBtn');
  if (closeBtn) {
    closeBtn.onclick = closeBatchDeleteModal;
  }

  // 取消按钮
  const cancelBtn = document.getElementById('cancelBatchDeleteBtn');
  if (cancelBtn) {
    cancelBtn.onclick = closeBatchDeleteModal;
  }

  // 点击遮罩关闭
  const modal = document.getElementById('batchDeleteModal');
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) closeBatchDeleteModal();
    };
  }

  // 全选
  const selectAll = document.getElementById('batchSelectAll');
  if (selectAll) {
    selectAll.onchange = () => {
      const checkboxes = document.querySelectorAll('.batch-delete-item-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        const convId = cb.dataset.convId;
        if (selectAll.checked) {
          batchDeleteState.selectedIds.add(convId);
        } else {
          batchDeleteState.selectedIds.delete(convId);
        }
      });
      updateBatchSelectedCount();
    };
  }

  // 筛选条件变化
  const filterName = document.getElementById('batchFilterName');
  const filterMode = document.getElementById('batchFilterMode');
  const filterDateFrom = document.getElementById('batchFilterDateFrom');
  const filterDateTo = document.getElementById('batchFilterDateTo');

  [filterName, filterMode, filterDateFrom, filterDateTo].forEach(el => {
    if (el) {
      el.oninput = () => renderBatchDeleteList();
      el.onchange = () => renderBatchDeleteList();
    }
  });

  // 删除按钮
  const confirmBtn = document.getElementById('confirmBatchDeleteBtn');
  if (confirmBtn) {
    confirmBtn.onclick = executeBatchDelete;
  }
}

function getFilteredConversations() {
  const filterName = document.getElementById('batchFilterName')?.value?.toLowerCase() || '';
  const filterMode = document.getElementById('batchFilterMode')?.value || '';
  const filterDateFrom = document.getElementById('batchFilterDateFrom')?.value;
  const filterDateTo = document.getElementById('batchFilterDateTo')?.value;

  return sidebarState.conversations.filter(conv => {
    // 名称筛选
    if (filterName && !(conv.name || '').toLowerCase().includes(filterName)) {
      return false;
    }

    // 模式筛选
    if (filterMode && conv.mode !== filterMode) {
      return false;
    }

    // 日期筛选
    const convTime = conv.updatedAt || conv.createdAt;
    if (filterDateFrom) {
      const fromDate = new Date(filterDateFrom).getTime();
      if (convTime < fromDate) return false;
    }
    if (filterDateTo) {
      const toDate = new Date(filterDateTo).getTime() + 86400000; // 加一天
      if (convTime > toDate) return false;
    }

    return true;
  });
}

function renderBatchDeleteList() {
  const container = document.getElementById('batchDeleteList');
  if (!container) return;

  const filtered = getFilteredConversations();

  if (filtered.length === 0) {
    container.innerHTML = '<div class="batch-delete-empty">没有符合条件的会话</div>';
    updateBatchSelectedCount();
    return;
  }

  const modeIcons = {
    brainstorming: '💡',
    discussion: '🪑',
    expertqa: '🎓'
  };

  const modeNames = {
    brainstorming: '头脑风暴',
    discussion: '圆桌讨论',
    expertqa: '专家问答'
  };

  container.innerHTML = filtered.map(conv => {
    const modeIcon = modeIcons[conv.mode] || modeIcons.brainstorming;
    const modeName = modeNames[conv.mode] || '头脑风暴';
    const time = formatSidebarTime(conv.updatedAt || conv.createdAt);
    const isChecked = batchDeleteState.selectedIds.has(conv.id);

    return `
      <div class="batch-delete-item ${isChecked ? 'selected' : ''}" data-conv-id="${conv.id}">
        <input type="checkbox" class="batch-delete-item-checkbox" data-conv-id="${conv.id}" ${isChecked ? 'checked' : ''}>
        <span class="batch-delete-item-mode">${modeIcon}</span>
        <div class="batch-delete-item-info">
          <div class="batch-delete-item-name">${escapeHtml(conv.name)}</div>
          <div class="batch-delete-item-meta">${modeName} · ${time}</div>
        </div>
      </div>
    `;
  }).join('');

  // 绑定复选框事件
  container.querySelectorAll('.batch-delete-item-checkbox').forEach(cb => {
    cb.onchange = () => {
      const convId = cb.dataset.convId;
      if (cb.checked) {
        batchDeleteState.selectedIds.add(convId);
      } else {
        batchDeleteState.selectedIds.delete(convId);
      }
      // 更新行样式
      const item = cb.closest('.batch-delete-item');
      if (item) {
        item.classList.toggle('selected', cb.checked);
      }
      updateBatchSelectedCount();
    };
  });

  // 点击行也可以选中
  container.querySelectorAll('.batch-delete-item').forEach(item => {
    item.onclick = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const cb = item.querySelector('.batch-delete-item-checkbox');
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    };
  });

  updateBatchSelectedCount();
}

function updateBatchSelectedCount() {
  const countEl = document.getElementById('batchSelectedCount');
  if (countEl) {
    countEl.textContent = batchDeleteState.selectedIds.size;
  }

  const confirmBtn = document.getElementById('confirmBatchDeleteBtn');
  if (confirmBtn) {
    confirmBtn.disabled = batchDeleteState.selectedIds.size === 0;
  }

  // 更新全选状态
  const selectAll = document.getElementById('batchSelectAll');
  if (selectAll) {
    const checkboxes = document.querySelectorAll('.batch-delete-item-checkbox');
    const checkedCount = document.querySelectorAll('.batch-delete-item-checkbox:checked').length;
    selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }
}

async function executeBatchDelete() {
  const idsToDelete = Array.from(batchDeleteState.selectedIds);
  if (idsToDelete.length === 0) return;

  // 检查是否包含当前会话
  const includesCurrent = idsToDelete.includes(conversationId);

  try {
    // 逐个删除
    for (const convId of idsToDelete) {
      const conv = sidebarState.conversations.find(c => c.id === convId);
      if (conv && conv.memberUrls) {
        // 清理平台会话
        for (const [memberId, conversationUrl] of Object.entries(conv.memberUrls)) {
          if (conversationUrl) {
            try {
              await chrome.runtime.sendMessage({
                action: 'deletePlatformConversation',
                provider: conv.memberSettings?.[memberId]?.provider,
                conversationUrl
              });
            } catch (e) {
              console.error('[BatchDelete] 删除平台会话失败:', e);
            }
          }
        }
      }

      await chrome.runtime.sendMessage({
        action: 'deleteConversation',
        conversationId: convId
      });
    }

    // 关闭弹窗
    closeBatchDeleteModal();

    // 如果包含当前会话，跳转
    if (includesCurrent) {
      const remaining = sidebarState.conversations.filter(c => !idsToDelete.includes(c.id));
      if (remaining.length > 0) {
        window.location.href = `chat.html?id=${remaining[0].id}`;
      } else {
        window.location.href = 'chat.html';
      }
    } else {
      // 刷新列表
      await loadSidebarConversations();
    }
  } catch (error) {
    console.error('[BatchDelete] 批量删除失败:', error);
    showToast('批量删除失败: ' + error.message, 'error');
  }
}

// ==================== 打字机效果 ====================

// 存储正在执行打字机效果的元素
const typewriterAnimations = new Map();

/**
 * 打字机效果函数
 * @param {HTMLElement} element - 要应用效果的元素
 * @param {string} htmlContent - 原始 HTML 内容
 * @param {number} speed - 打字速度（毫秒/字符）
 * @param {Function} onComplete - 完成回调
 */
function typewriterEffect(element, htmlContent, speed = 20, onComplete = null) {
  // 如果该元素已有动画，先取消
  if (typewriterAnimations.has(element)) {
    cancelAnimationFrame(typewriterAnimations.get(element).rafId);
    typewriterAnimations.delete(element);
  }

  // 解析 HTML 内容为文本和标签
  const tokens = parseHtmlTokens(htmlContent);
  let currentIndex = 0;
  let currentHtml = '';
  const state = { rafId: null, cancelled: false };

  typewriterAnimations.set(element, state);

  function type() {
    if (state.cancelled || currentIndex >= tokens.length) {
      typewriterAnimations.delete(element);
      element.classList.remove('typewriting');
      if (onComplete) onComplete();
      return;
    }

    const token = tokens[currentIndex];
    if (token.type === 'tag') {
      // 标签直接添加
      currentHtml += token.value;
      currentIndex++;
      type(); // 立即处理下一个
    } else {
      // 文本逐字添加
      if (token.charIndex < token.value.length) {
        currentHtml += token.value[token.charIndex];
        token.charIndex++;
        element.innerHTML = currentHtml;

        // 保持滚动到底部
        const container = elements.messagesContainer;
        if (container && !userScrolled) {
          container.scrollTop = container.scrollHeight;
        }

        setTimeout(type, speed);
      } else {
        currentIndex++;
        setTimeout(type, speed);
      }
    }
  }

  element.classList.add('typewriting');
  type();
}

/**
 * 解析 HTML 为 token 数组
 */
function parseHtmlTokens(html) {
  const tokens = [];
  let i = 0;
  let textBuffer = '';

  while (i < html.length) {
    if (html[i] === '<') {
      // 保存之前的文本
      if (textBuffer) {
        tokens.push({ type: 'text', value: textBuffer, charIndex: 0 });
        textBuffer = '';
      }

      // 找到标签结束
      let tagEnd = html.indexOf('>', i);
      if (tagEnd === -1) tagEnd = html.length - 1;

      const tag = html.substring(i, tagEnd + 1);
      tokens.push({ type: 'tag', value: tag });
      i = tagEnd + 1;
    } else {
      textBuffer += html[i];
      i++;
    }
  }

  // 保存剩余文本
  if (textBuffer) {
    tokens.push({ type: 'text', value: textBuffer, charIndex: 0 });
  }

  return tokens;
}

/**
 * 取消指定元素的打字机效果
 */
function cancelTypewriter(element) {
  if (typewriterAnimations.has(element)) {
    const state = typewriterAnimations.get(element);
    state.cancelled = true;
    cancelAnimationFrame(state.rafId);
    typewriterAnimations.delete(element);
    element.classList.remove('typewriting');
  }
}

/**
 * 取消所有打字机效果
 */
function cancelAllTypewriters() {
  typewriterAnimations.forEach((state, element) => {
    state.cancelled = true;
    cancelAnimationFrame(state.rafId);
    element.classList.remove('typewriting');
  });
  typewriterAnimations.clear();
}

// 启动
init();
