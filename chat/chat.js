// 获取会话ID
const urlParams = new URLSearchParams(window.location.search);
const conversationId = urlParams.get('id');

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
  isLoading: false,
  isWaitingResponse: false
};

// Dashboard 动画状态
const dashboardState = {
  modeTimers: {},
  modeCurrentIndex: { brainstorming: -1, discussion: -1, expertqa: -1 },
  modePlaying: {}
};

// DOM元素
const elements = {
  chatTitle: null,
  membersTags: null,
  messagesContainer: null,
  messageInput: null,
  sendBtn: null
};

// 初始化
async function init() {
  // 初始化DOM元素
  initElements();

  // 初始化侧边栏
  await initSidebar();

  if (!conversationId) {
    // 没有会话ID时，显示 dashboard mode showcase
    renderDashboardWelcome();
    // 绑定事件（即使没有会话ID也要绑定平台面板等基础功能）
    bindEvents();
    initPlatformPanel();
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

  // 监听存储变化（实时更新UI）
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.conversations) {
      handleStorageChange(changes.conversations);
      // 同时更新侧边栏
      loadSidebarConversations();
    }
  });

  // 渲染界面
  render();

  // 初始化平台面板
  initPlatformPanel();
}

function initElements() {
  elements.chatTitle = document.getElementById('chatTitle');
  elements.membersTags = document.getElementById('membersTags');
  elements.messagesContainer = document.getElementById('messagesContainer');
  elements.messageInput = document.getElementById('messageInput');
  elements.sendBtn = document.getElementById('sendBtn');
  elements.modeBadge = document.getElementById('modeBadge');
  elements.platformPanel = document.getElementById('platformPanel');
  elements.platformWindows = document.getElementById('platformWindows');

  // 创建滚动到底部按钮
  elements.scrollBottomBtn = document.createElement('button');
  elements.scrollBottomBtn.className = 'scroll-bottom-btn';
  elements.scrollBottomBtn.innerHTML = '↓';
  elements.scrollBottomBtn.title = '滚动到底部';
  elements.messagesContainer.appendChild(elements.scrollBottomBtn);
}

async function loadData() {
  try {
    const [conversation, models, prompts, experts] = await Promise.all([
      getConversation(conversationId),
      chrome.runtime.sendMessage({ action: 'getModels' }),
      chrome.runtime.sendMessage({ action: 'getPrompts' }),
      chrome.runtime.sendMessage({ action: 'getExperts' }).catch(() => [])
    ]);

    console.log('[Chat] loadData - conversation:', conversation);
    console.log('[Chat] loadData - conversation.members:', conversation?.members);
    console.log('[Chat] loadData - conversation.mode:', conversation?.mode);
    console.log('[Chat] loadData - conversation.contextMode:', conversation?.contextMode);

    state.conversation = conversation;
    state.models = models || [];
    state.prompts = prompts || [];
    state.experts = experts || [];

    if (!conversation) {
      showError('会话不存在');
    }
  } catch (error) {
    console.error('加载数据失败:', error);
    showError('加载数据失败');
  }
}

function bindEvents() {
  elements.sendBtn.addEventListener('click', sendMessage);

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const value = e.target.value.trim();

      // 新对话：按回车显示创建会话弹窗
      if (!conversationId && value) {
        showNewConversationWithInput(value);
        return;
      }

      if (value.startsWith('/')) {
        const filter = value.substring(1).toLowerCase();
        const candidates = getFilteredCommands(filter);

        if (candidates.length > 0) {
          elements.messageInput.value = candidates[0].name + ' ';
          hideCommandSuggestions();
          sendMessage();
        } else {
          showError('没有匹配的命令: ' + value);
          hideCommandSuggestions();
        }
        return;
      }

      if (selectCandidateCommand()) {
        return;
      }
      sendMessage();
    } else if (e.key === 'Escape') {
      hideCommandSuggestions();
    }
  });

  elements.messageInput.addEventListener('input', (e) => {
    const value = e.target.value;
    
    if (value === '/') {
      showCommandSuggestions();
    } else if (value.startsWith('/') && !value.includes(' ')) {
      const filter = value.substring(1).toLowerCase();
      showCommandSuggestions(filter);
    } else {
      hideCommandSuggestions();
    }
  });

  // 模式徽章点击打开模式选择器
  const modeBadge = document.getElementById('modeBadge');
  if (modeBadge) {
    modeBadge.addEventListener('click', () => {
      showModeSelector();
    });
  }

  // 成员标签点击打开排序
  elements.membersTags.addEventListener('click', (e) => {
    const tag = e.target.closest('.member-tag.draggable');
    if (tag) {
      showModeSelector(true);
    }

    // 成员删除按钮
    const removeBtn = e.target.closest('.member-tag-remove');
    if (removeBtn) {
      const tag = removeBtn.closest('.member-tag');
      const memberId = tag.dataset.memberId;
      removeMemberFromConversation(memberId);
    }
  });

  // 点击标题编辑会话名称
  elements.chatTitle.addEventListener('click', () => {
    if (!elements.chatTitle.classList.contains('editing')) {
      enableTitleEditing();
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

  // 滚动到底部按钮
  elements.scrollBottomBtn.addEventListener('click', () => {
    scrollToBottom();
    elements.scrollBottomBtn.classList.remove('visible');
  });

  // 监听消息容器滚动
  elements.messagesContainer.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = elements.messagesContainer;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    elements.scrollBottomBtn.classList.toggle('visible', !isNearBottom);
  });

  // 平台面板切换
  const platformToggle = document.getElementById('platformToggle');
  if (platformToggle) {
    platformToggle.addEventListener('click', togglePlatformPanel);
  }

  // 平台面板拖拽调整大小
  initPlatformResizer();
}

function initPlatformResizer() {
  const resizer = document.getElementById('platformResizer');
  const platformPanel = document.getElementById('platformPanel');
  if (!resizer || !platformPanel) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = platformPanel.offsetWidth;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const deltaX = startX - e.clientX;
    const newWidth = Math.max(400, Math.min(startWidth + deltaX, window.innerWidth * 0.9));
    platformPanel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

async function handleStorageChange(change) {
  console.log('[Chat] 检测到存储变化');

  const newConversations = change.newValue || [];
  const updatedConversation = newConversations.find(c => c.id === conversationId);

  if (updatedConversation) {
    const oldMessageCount = state.conversation?.messages?.length || 0;
    const newMessageCount = updatedConversation?.messages?.length || 0;

    console.log(`[Chat] 消息数变化: ${oldMessageCount} → ${newMessageCount}`);

    state.conversation = updatedConversation;
    renderMessages();

    // 更新输入状态
    const hasMembers = state.conversation.members && state.conversation.members.length > 0;
    if (elements.messageInput) {
      elements.messageInput.disabled = !hasMembers;
      elements.messageInput.placeholder = hasMembers ? '输入消息...' : '请先添加成员后再发送消息';
    }
    if (elements.sendBtn) {
      elements.sendBtn.disabled = !hasMembers;
    }

    // 更新平台面板的消息列表
    updatePlatformPanelMessages();

    if (newMessageCount > oldMessageCount) {
      console.log(`[Chat] 新增了 ${newMessageCount - oldMessageCount} 条消息`);
      scrollToBottom();

      if (state.isWaitingResponse) {
        console.log('[Chat] AI回复已到达，恢复发送按钮');
        state.isWaitingResponse = false;
        resetSendButton();
      }
    }
  }
}

function updatePlatformPanelMessages() {
  if (!state.conversation.members || state.conversation.members.length === 0) {
    return;
  }

  state.conversation.members.forEach(member => {
    const windowElement = document.querySelector(`.platform-window[data-member-id="${member.id}"]`);
    if (!windowElement) return;

    const messageList = windowElement.querySelector('.platform-message-list');
    if (!messageList) return;

    const roleMessages = getMemberMessages(member.id);

    if (roleMessages.length > 0) {
      messageList.innerHTML = roleMessages.map(msg => createMessageHTML(msg, member)).join('');
    } else {
      messageList.innerHTML = `
        <div class="platform-conversation-empty">
          <div class="platform-empty-icon">💬</div>
          <div class="platform-empty-text">暂无消息</div>
          <div class="platform-empty-hint">发送消息后会在此显示对话历史</div>
        </div>
      `;
    }

    // 重新绑定事件监听器
    messageList.removeEventListener('click', handleMessageListClick);
    messageList.addEventListener('click', handleMessageListClick);
  });

  console.log('[Chat] 平台面板消息已更新');
}

function handleMessageListClick(e) {
  const header = e.target.closest('.platform-message-header');
  const expandBtn = e.target.closest('.platform-message-expand-btn');

  if (header || expandBtn) {
    const messageEl = (header || expandBtn).closest('.platform-message');
    if (messageEl) {
      const messageId = messageEl.dataset.messageId;
      const memberId = messageEl.dataset.memberId;
      toggleMessageExpand(messageId, memberId);
    }
  }
}

function bindMemberClickEvents() {
  const clickableElements = elements.messagesContainer.querySelectorAll('.clickable');
  clickableElements.forEach(el => {
    el.addEventListener('click', async (e) => {
      const provider = e.currentTarget.getAttribute('data-provider');
      const memberId = e.currentTarget.getAttribute('data-member-id');
      if (provider) {
        try {
          let targetUrl = null;
          if (memberId && state.conversation?.memberUrls) {
            targetUrl = state.conversation.memberUrls[memberId] || null;
          }
          await chrome.runtime.sendMessage({
            action: 'activatePlatformTab',
            provider,
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

  // 设置标题
  elements.chatTitle.textContent = state.conversation.name;

  // 显示当前模式
  renderModeBadge();

  // 设置成员标签
  renderMembersTags();

  // 渲染消息
  renderMessages();

  // 根据是否有成员或专家来启用/禁用输入
  const hasMembers = (state.conversation.members && state.conversation.members.length > 0) ||
    (state.conversation.mode === 'expertqa' && state.conversation.expertId);
  if (elements.messageInput) {
    elements.messageInput.disabled = !hasMembers;
    elements.messageInput.placeholder = hasMembers ? '输入消息...' : '请先添加成员后再发送消息';
  }
  if (elements.sendBtn) {
    elements.sendBtn.disabled = !hasMembers;
  }
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
    const provider = PROVIDERS[member.provider];
    const color = provider ? provider.color : '#666';
    return `<span class="member-tag${hasOrdering ? ' draggable' : ''}" data-member-id="${member.id}" title="${hasOrdering ? '点击调整顺序' : ''}">
      ${hasOrdering ? `<span class="member-tag-drag-handle">#${memberIndex + 1}</span>` : ''}
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px;"></span>
      ${escapeHtml(member.name)}
      <span class="member-tag-remove" title="移除成员">×</span>
    </span>`;
  }).join('');

  console.log('[Chat] renderMembersTags - Members tags HTML:', elements.membersTags.innerHTML);
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

function renderMessages() {
  // 专家问答模式有专家ID即可
  const hasParticipants = (state.conversation.members && state.conversation.members.length > 0) ||
    (state.conversation.mode === 'expertqa' && state.conversation.expertId);

  if (!hasParticipants) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-messages">
        <div class="empty-messages-icon">👥</div>
        <h2>暂无成员</h2>
        <p>此会话暂无成员，请先添加成员</p>
      </div>
    `;
    return;
  }

  if (!state.conversation.messages || state.conversation.messages.length === 0) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-messages">
        <div class="empty-messages-icon">💬</div>
        <h2>开始对话</h2>
        <p>在下方输入消息，所有成员将同时收到并回复</p>
      </div>
    `;
    return;
  }

  elements.messagesContainer.innerHTML = state.conversation.messages.map((msg, index) => {
    const member = state.conversation.members.find(m => m.id === msg.memberId);
    const roleSetting = state.conversation.memberSettings?.[msg.memberId] || {};
    const displayName = roleSetting.nickname || member?.name || '未知成员';
    const providerName = member ? getProviderDisplayName(member.provider) : '';
    const provider = member ? member.provider : null;

    if (msg.isUser) {
      return `
        <div class="message user-message">
          <div class="message-avatar user-avatar">我</div>
          <div class="message-content">
            <div class="message-text">${escapeHtml(msg.content)}</div>
            <div class="message-time">${formatTime(msg.timestamp)}</div>
            <div class="message-actions">
              <button class="copy-msg-btn" data-msg-index="${index}" title="复制消息">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>复制</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      const clickableClass = provider ? 'clickable' : '';
      const providerAttr = provider ? `data-provider="${provider}" data-member-id="${msg.memberId}"` : '';
      const providerConfig = PROVIDERS ? PROVIDERS[provider] : null;
      const color = providerConfig ? providerConfig.color : '#666';

      return `
        <div class="message ai-message">
          <div class="message-avatar ai-avatar ${clickableClass}" ${providerAttr} style="background:linear-gradient(135deg, ${color}, ${color}cc);">${escapeHtml(displayName.charAt(0))}</div>
          <div class="message-content">
            <div class="message-role ${clickableClass}" ${providerAttr}>
              ${escapeHtml(displayName)}
              ${providerName ? `<span class="provider-badge" style="background:linear-gradient(135deg, ${color}, ${color}cc);">${escapeHtml(providerName)}</span>` : ''}
            </div>
            <div class="message-text">${formatMessage(msg.content)}</div>
            <div class="message-time">${formatTime(msg.timestamp)}</div>
            <div class="message-actions">
              <button class="copy-msg-btn" data-msg-index="${index}" title="复制消息">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>复制</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }).join('');

  bindMemberClickEvents();
  addCodeCopyButtons(elements.messagesContainer);

  // 滚动到底部
  scrollToBottom();
}

async function sendMessage() {
  const content = elements.messageInput.value.trim();

  if (!content || state.isLoading) {
    return;
  }

  // 检查是否是命令
  if (content.startsWith('/')) {
    await handleCommand(content);
    elements.messageInput.value = '';
    return;
  }

  state.isLoading = true;
  elements.sendBtn.disabled = true;
  elements.sendBtn.innerHTML = '<span style="opacity:0.7;">发送中…</span>';

  try {
    addTempMessage(content, true);
    elements.messageInput.value = '';
    
    // 检查是否有虚拟模型
    const hasVirtualModels = await checkHasVirtualModels();
    
    if (hasVirtualModels) {
      // 有虚拟模型，显示执行过程
      showVirtualModelExecution();
    } else {
      // 只有普通模型，显示普通思考中
      showThinkingIndicator();
    }

    const updatedConversation = await sendMessageToBackend(conversationId, content);

    if (updatedConversation) {
      state.conversation = updatedConversation;
      renderMessages();
    }

    state.isWaitingResponse = true;

    setTimeout(() => {
      if (state.isWaitingResponse) {
        state.isWaitingResponse = false;
        resetSendButton();
      }
    }, 60000);
  } catch (error) {
    console.error('发送消息失败:', error);
    showError('发送消息失败: ' + error.message);
    resetSendButton();
  } finally {
    hideThinkingIndicator();
    scrollToBottom();
  }
}

function resetSendButton() {
  state.isLoading = false;
  elements.sendBtn.disabled = false;
  elements.sendBtn.innerHTML = '发送';
}

async function checkHasVirtualModels() {
  if (!state.conversation.modelIds && !state.conversation.members) {
    return false;
  }

  const modelIds = state.conversation.modelIds || state.conversation.members.map(m => m.id) || [];

  try {
    const models = await chrome.runtime.sendMessage({ action: 'getModels' });
    if (!models) return false;

    return modelIds.some(id => {
      const model = models.find(m => m.id === id);
      return model && model.isVirtual;
    });
  } catch (error) {
    console.error('检查虚拟模型失败:', error);
    return false;
  }
}

function showVirtualModelExecution() {
  const executionId = 'exec-' + Date.now();
  
  const executionHTML = `
    <div class="message ai-message virtual-model-execution" id="${executionId}">
      <div class="message-avatar ai-avatar" style="background:linear-gradient(135deg, #8b5cf6, #6366f1);">🤖</div>
      <div class="message-content">
        <div class="message-role">虚拟模型执行中</div>
        <div class="virtual-model-progress">
          <div class="progress-header">
            <div class="progress-spinner"></div>
            <span class="progress-text">正在分析任务并分发给各个Agent...</span>
          </div>
          <div class="progress-nodes"></div>
        </div>
      </div>
    </div>
  `;
  
  elements.messagesContainer.insertAdjacentHTML('beforeend', executionHTML);
  scrollToBottom();
  
  return executionId;
}

function updateVirtualModelProgress(executionId, progress) {
  const executionElement = document.getElementById(executionId);
  if (!executionElement) return;
  
  const nodesContainer = executionElement.querySelector('.progress-nodes');
  const progressText = executionElement.querySelector('.progress-text');
  
  if (progressText) {
    progressText.textContent = progress.statusText || '执行中...';
  }
  
  if (nodesContainer && progress.nodes) {
    nodesContainer.innerHTML = progress.nodes.map(node => `
      <div class="progress-node ${node.status}">
        <div class="node-status">
          ${node.status === 'completed' ? '✅' : 
            node.status === 'running' ? '⏳' : 
            node.status === 'error' ? '❌' : '⏸️'}
        </div>
        <div class="node-info">
          <div class="node-name">${escapeHtml(node.name)}</div>
          ${node.result ? `<div class="node-result">${escapeHtml(node.result.substring(0, 100))}${node.result.length > 100 ? '...' : ''}</div>` : ''}
        </div>
      </div>
    `).join('');
  }
  
  scrollToBottom();
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
  scrollToBottom();
}

function hideThinkingIndicator() {
  const existing = document.getElementById('thinking-indicator');
  if (existing) {
    existing.remove();
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
    case '/mode':
      await handleModeCommand();
      break;
    default:
      showError('未知命令: ' + cmd);
  }
}

let newStatusTimeout = null;

async function handleNewCommand() {
  try {
    // Step 1: 清空本地会话 → 立即清除页面
    const response = await chrome.runtime.sendMessage({
      action: 'clearConversationLocal',
      conversationId
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '清除失败');
    }

    state.conversation = response.conversation;
    renderMessages();
    console.log('[Chat] 本地会话已清除');

    // 在标题附近显示状态：正在删除后台会话
    showNewStatus('deleting');

    // Step 2: 把 memberUrls 快照传给平台删除（不 await）
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

  document.querySelector('.chat-header-top').appendChild(indicator);
}

let messageListenerAttached = false;

function attachMessageListener() {
  if (!messageListenerAttached) {
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'clearComplete') {
        showNewStatus(request.success ? 'done' : 'failed');
      } else if (request.type === 'flowExecutionProgress') {
        handleFlowExecutionProgress(request.progress);
      } else if (request.type === 'flowExecutionComplete') {
        removeProgressIndicator();
      } else if (request.type === 'flowExecutionError') {
        handleFlowExecutionError(request.error);
      }
    });
    messageListenerAttached = true;
  }
}

attachMessageListener();

function handleFlowExecutionProgress(progress) {
  console.log('[Chat] 流程执行进度:', progress);
  
  let progressElement = document.getElementById('currentFlowProgressIndicator');
  
  if (!progressElement) {
    const progressHtml = `
      <div class="message ai-message" id="currentFlowProgressIndicator">
        <div class="message-avatar">⚙️</div>
        <div class="message-content">
          <div class="message-sender">系统</div>
          <div class="progress-indicator">
            <div class="progress-text" id="currentFlowProgressText"></div>
            <div class="progress-bar-container">
              <div class="progress-fill" id="currentFlowProgressBar"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
      messagesContainer.insertAdjacentHTML('beforeend', progressHtml);
      progressElement = document.getElementById('currentFlowProgressIndicator');
    }
  }
  
  const progressText = document.getElementById('currentFlowProgressText');
  const progressBar = document.getElementById('currentFlowProgressBar');
  
  if (progressText) {
    progressText.textContent = `执行进度：第${progress.iteration}/${progress.maxIterations}轮`;
  }
  
  if (progressBar) {
    progressBar.style.width = `${(progress.iteration / progress.maxIterations) * 100}%`;
  }
  
  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function removeProgressIndicator() {
  const progressElement = document.getElementById('currentFlowProgressIndicator');
  if (progressElement) {
    progressElement.remove();
  }
}

function handleFlowExecutionError(error) {
  console.error('[Chat] 流程执行错误:', error);
  removeProgressIndicator();
  
  const errorHtml = `
    <div class="message ai-message">
      <div class="message-avatar">❌</div>
      <div class="message-content">
        <div class="message-sender">系统</div>
        <div class="error-message">流程执行失败: ${escapeHtml(error)}</div>
      </div>
    </div>
  `;
  
  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    messagesContainer.insertAdjacentHTML('beforeend', errorHtml);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}


async function handleModeCommand() {
  showModeSelector();
}

function showModeSelector(focusOrder) {
  const mode = state.conversation.mode;
  
  if (mode === 'brainstorming' || mode === 'discussion' || mode === 'expertqa') {
    const modeInfo = {
      brainstorming: { name: '头脑风暴', desc: '独享上下文 · 并行回复', icon: '💡' },
      discussion: { name: '圆桌讨论', desc: '共享上下文 · 依次发言\n使用 /loop 问题 次数 进行多轮讨论', icon: '🪑' },
      expertqa: { name: '专家问答', desc: '多AI协作 · 迭代求解', icon: '🎓' }
    };

    const info = modeInfo[mode];
    const modal = document.createElement('div');
    modal.className = 'mode-selector-modal';
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <h2>${info.icon} ${info.name}</h2>
          <div class="mode-section">
            <div class="mode-info-readonly">
              <div class="mode-name">${info.name}</div>
              <div class="mode-desc" style="white-space:pre-line;">${info.desc}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" id="closeModeBtn">确定</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeModeBtn').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('modal-overlay')) {
        document.body.removeChild(modal);
      }
    });
    return;
  }

  const currentContextMode = state.conversation.contextMode || 'self';
  const currentSendMode = state.conversation.sendMode || (currentContextMode === 'self' ? 'parallel' : 'parallel');
  const memberIds = state.conversation.members.map(m => m.id);
  const currentOrder = state.conversation.memberOrder || memberIds || [];

  const contextModeNames = {
    self: '独享模式',
    full: '共享模式'
  };

  const sendModeNames = {
    parallel: '并行模式',
    sequential: '顺序模式',
    random: '随机模式'
  };

  const modal = document.createElement('div');
  modal.className = 'mode-selector-modal';
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <h2>会话模式设置</h2>

        ${currentContextMode === 'self' ? `
        <div class="mode-section">
          <div class="mode-info-readonly">
            <div class="mode-name">${contextModeNames[currentContextMode]}（并行）</div>
            <div class="mode-desc">每个AI独立对话，互不干扰，使用各自的会话URL</div>
          </div>
        </div>
        ` : `
        <div class="mode-section">
          <div class="mode-info-readonly">
            <div class="mode-name">${contextModeNames[currentContextMode]}</div>
            <div class="mode-desc">所有对话历史都发送给每个AI，每次打开新会话</div>
          </div>
        </div>

        <div class="mode-section" id="sendModeSection">
          <h3>执行策略</h3>
          <div class="mode-options">
            <label class="mode-option">
              <input type="radio" name="sendMode" value="parallel" ${currentSendMode === 'parallel' ? 'checked' : ''}>
              <div class="mode-info">
                <div class="mode-name">并行</div>
                <div class="mode-desc">所有成员同时收到消息并独立响应</div>
              </div>
            </label>
            <label class="mode-option">
              <input type="radio" name="sendMode" value="sequential" ${currentSendMode === 'sequential' ? 'checked' : ''}>
              <div class="mode-info">
                <div class="mode-name">串行</div>
                <div class="mode-desc">按成员顺序依次发送，每个成员能看到之前成员的回复</div>
              </div>
            </label>
            <label class="mode-option">
              <input type="radio" name="sendMode" value="random" ${currentSendMode === 'random' ? 'checked' : ''}>
              <div class="mode-info">
                <div class="mode-name">随机</div>
                <div class="mode-desc">随机选择一个成员响应</div>
              </div>
            </label>
          </div>
        </div>
        `}
        
        <div class="mode-order-section" id="modeOrderSection">
          <h3>成员顺序</h3>
          <p class="mode-order-hint">拖动成员卡片调整顺序（用于串行模式）</p>
          <div class="member-order-list" id="modeMemberOrderList">
            ${currentOrder.map((memberId, index) => {
              const member = state.conversation.members.find(m => m.id === memberId);
              if (!member) return '';
              const providerConfig = PROVIDERS ? PROVIDERS[member.provider] : null;
              const color = providerConfig ? providerConfig.color : '#667eea';
              return `
                <div class="member-order-item" draggable="true" data-member-id="${memberId}">
                  <div class="member-order-handle">⋮⋮</div>
                  <div class="member-order-avatar" style="background:linear-gradient(135deg, ${color}, ${color}cc);">${escapeHtml(member.name.charAt(0))}</div>
                  <div class="member-order-info">
                    <div class="member-order-name">${escapeHtml(member.name)}</div>
                    <div class="member-order-provider">
                      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:4px;"></span>
                      ${getProviderDisplayName(member.provider)}
                    </div>
                  </div>
                  <div class="member-order-index" style="color:${color};">${index + 1}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelModeBtn">取消</button>
          <button class="btn btn-primary" id="saveModeBtn">保存</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const sendModeRadios = modal.querySelectorAll('input[name="sendMode"]');
  const sendModeSection = modal.querySelector('#sendModeSection');
  const orderSection = modal.querySelector('#modeOrderSection');
  const orderList = modal.querySelector('#modeRoleOrderList');

  function updateSectionVisibility() {
    if (!sendModeSection) return;

    const selectedSendMode = modal.querySelector('input[name="sendMode"]:checked').value;

    if (selectedSendMode === 'sequential') {
      orderSection.style.display = 'block';
    } else {
      orderSection.style.display = 'none';
    }
  }

  if (sendModeRadios) {
    sendModeRadios.forEach(radio => {
      radio.addEventListener('change', updateSectionVisibility);
    });
  }

  let draggedItem = null;
  orderList.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('member-order-item')) {
      draggedItem = e.target;
      e.target.style.opacity = '0.5';
    }
  });

  orderList.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('member-order-item')) {
      e.target.style.opacity = '1';
      draggedItem = null;
      updateOrderIndices(orderList);
    }
  });

  orderList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(orderList, e.clientY);
    if (draggedItem) {
      if (afterElement == null) {
        orderList.appendChild(draggedItem);
      } else {
        orderList.insertBefore(draggedItem, afterElement);
      }
    }
  });

  updateSectionVisibility();

  if (focusOrder && currentContextMode === 'full') {
    setTimeout(() => {
      if (orderSection && orderSection.style.display !== 'none') {
        orderSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  document.getElementById('cancelModeBtn').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  document.getElementById('saveModeBtn').addEventListener('click', async () => {
    const items = orderList.querySelectorAll('.member-order-item');
    const newOrder = Array.from(items).map(item => item.getAttribute('data-member-id'));

    const updates = {};

    if (currentContextMode === 'full') {
      const selectedSendMode = modal.querySelector('input[name="sendMode"]:checked').value;
      updates.sendMode = selectedSendMode;
      if (selectedSendMode === 'sequential') {
        updates.memberOrder = newOrder;
      } else {
        updates.memberOrder = null;
      }
    } else {
      updates.sendMode = 'parallel';
    }

    try {
      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        render();
        if (currentContextMode === 'full') {
          console.log('[Chat] 发送模式已更新');
          console.log('[Chat] 成员顺序已更新:', newOrder);
        }
      }

      document.body.removeChild(modal);
    } catch (error) {
      console.error('[Chat] 更新失败:', error);
      showError('更新失败: ' + error.message);
    }
  });
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

function addTempMessage(content, isUser) {
  const tempDiv = document.createElement('div');
  tempDiv.className = `message ${isUser ? 'user-message' : 'ai-message'} temp-message`;
  tempDiv.innerHTML = `
    <div class="message-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}">${isUser ? '我' : 'AI'}</div>
    <div class="message-content">
      <div class="message-text">${escapeHtml(content)}</div>
      <div class="message-time">正在发送...</div>
    </div>
  `;
  elements.messagesContainer.appendChild(tempDiv);
  scrollToBottom();
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

async function sendMessageToBackend(conversationId, content) {
  console.log('[Chat] ========== 发送消息到Background ==========');
  console.log('[Chat] conversationId:', conversationId);
  console.log('[Chat] content:', content);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('[Chat] ❌ 发送消息超时（300秒）');
      reject(new Error('发送消息超时（300秒）'));
    }, 300000);
    
    console.log('[Chat] 发送chrome.runtime.sendMessage...');
    chrome.runtime.sendMessage({
      action: 'addMessage',
      conversationId,
      content
    }, (response) => {
      console.log('[Chat] 收到Background响应:', response);
      clearTimeout(timeout);
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && !response.error) {
        resolve(response);
      } else {
        reject(new Error(response?.error || '发送失败'));
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(content) {
  if (!content) return '';

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

  // 处理标题
  contentWithoutCode = contentWithoutCode
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>');

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
      return `<li>${escapeHtml(orderedItems[parseInt(index)])}</li>`;
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
      return `<li>${escapeHtml(unorderedItems[parseInt(index)])}</li>`;
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

  return contentWithoutCode;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getProviderDisplayName(provider) {
  const providerConfig = PROVIDERS[provider];
  return providerConfig ? providerConfig.name : provider;
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
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

const availableCommands = [
  { name: '/new', description: '清除所有会话内容和重置成员会话URL' },
  { name: '/mode', description: '切换上下文模式和发送模式，调整成员顺序' }
];

function getFilteredCommands(filter) {
  if (!filter) {
    return availableCommands;
  }
  return availableCommands.filter(cmd => cmd.name.toLowerCase().includes(filter));
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

// ==================== 平台面板管理 ====================

function initPlatformPanel() {
  // 确保平台面板默认收起
  if (elements.platformPanel && !elements.platformPanel.classList.contains('collapsed')) {
    elements.platformPanel.classList.add('collapsed');
    const toggleIcon = document.querySelector('.toggle-icon');
    if (toggleIcon) toggleIcon.textContent = '▶';
    console.log('[PlatformPanel] 默认收起平台面板');
  }

  if (!state.conversation || !state.conversation.members) {
    console.log('[PlatformPanel] 没有成员，跳过创建窗口');
    return;
  }

  console.log('[PlatformPanel] 初始化平台面板');
  createPlatformWindows();
}

function createPlatformWindows() {
  if (!elements.platformWindows) return;

  elements.platformWindows.innerHTML = '';

  const members = state.conversation.members || [];
  if (members.length === 0) {
    elements.platformWindows.innerHTML = '<div class="platform-empty">平台窗口将在此显示</div>';
    return;
  }

  members.forEach(member => {
    const windowElement = createPlatformWindow(member);
    if (windowElement) {
      elements.platformWindows.appendChild(windowElement);
    }
  });

  console.log(`[PlatformPanel] 创建了 ${elements.platformWindows.children.length} 个平台窗口`);
}

function createPlatformWindow(member) {
  const provider = PROVIDERS[member.provider];
  if (!provider) {
    console.warn(`[PlatformPanel] 未找到成员 ${member.name} 的提供商配置`);
    return null;
  }

  const windowId = `platform-window-${member.id}`;
  const windowElement = document.createElement('div');
  windowElement.className = 'platform-window collapsed-height';
  windowElement.id = windowId;
  windowElement.dataset.memberId = member.id;
  windowElement.dataset.provider = member.provider;

  const memberMessages = getMemberMessages(member.id);
  console.log(`[PlatformPanel] 创建成员 ${member.name} 的窗口，消息数量:`, memberMessages.length);
  if (memberMessages.length > 0) {
    console.log(`[PlatformPanel] 消息数据:`, memberMessages);
  }

  windowElement.innerHTML = `
    <div class="platform-window-header" title="点击展开/收起">
      <div class="platform-window-info">
        <div class="platform-window-indicator" style="background: ${provider.color};"></div>
        <div class="platform-window-name">${escapeHtml(member.name)}</div>
        <div class="platform-window-provider">${escapeHtml(provider.name)}</div>
      </div>
      <div class="platform-window-actions">
        <button class="platform-window-btn open-tab" title="在标签页中打开" data-action="openTab">🔗</button>
      </div>
    </div>
    <div class="platform-window-content">
      <div class="platform-message-list">
        ${memberMessages.length > 0 ? memberMessages.map(msg => createMessageHTML(msg, member)).join('') : `
          <div class="platform-conversation-empty">
            <div class="platform-empty-icon">💬</div>
            <div class="platform-empty-text">暂无消息</div>
            <div class="platform-empty-hint">发送消息后会在此显示对话历史</div>
          </div>
        `}
      </div>
    </div>
  `;

  const header = windowElement.querySelector('.platform-window-header');
  if (header) {
    header.addEventListener('click', () => togglePlatformWindowHeight(windowId));
  }

  const openTabBtn = windowElement.querySelector('[data-action="openTab"]');
  if (openTabBtn) {
    openTabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlatformConversation(member);
    });
  }

  const messageList = windowElement.querySelector('.platform-message-list');
  if (messageList) {
    messageList.addEventListener('click', handleMessageListClick);
  }

  return windowElement;
}

function getMemberMessages(memberId) {
  if (!state.conversation.messages || state.conversation.messages.length === 0) {
    return [];
  }

  return state.conversation.messages.filter(msg => {
    return msg.isUser || msg.memberId === memberId;
  });
}

function createMessageHTML(message, member) {
  const provider = PROVIDERS[member.provider];
  const isUser = message.isUser;
  const messageId = message.id;
  const uniqueId = `${member.id}-${messageId}`;

  return `
    <div class="platform-message ${isUser ? 'user-message' : 'ai-message'} collapsed" data-message-id="${messageId}" data-member-id="${member.id}" data-unique-id="${uniqueId}">
      <div class="platform-message-header" title="点击展开/收起">
        <div class="platform-message-avatar" style="background: ${isUser ? 'var(--primary)' : provider.color}">
          ${isUser ? '我' : escapeHtml(member.name.charAt(0))}
        </div>
        <div class="platform-message-time">${formatTime(message.timestamp)}</div>
        <div class="platform-message-hint">▼</div>
      </div>
      <div class="platform-message-content" id="msg-content-${uniqueId}">
        ${renderMessageContent(message.content)}
      </div>
      <div class="platform-message-expand-btn" id="msg-expand-${uniqueId}">
        展开 ↓
      </div>
    </div>
  `;
}

function renderMessageContent(content) {
  if (!content || content.trim() === '') {
    console.warn('[renderMessageContent] 内容为空');
    return '<span style="color: var(--text-tertiary); font-style: italic;">(空消息)</span>';
  }

  console.log('[renderMessageContent] 原始内容:', content.substring(0, 50), '长度:', content.length);

  if (typeof marked !== 'undefined' && marked.parse) {
    try {
      const result = marked.parse(content);
      console.log('[renderMessageContent] Markdown渲染成功，结果长度:', result.length);
      if (!result || result.trim() === '') {
        console.warn('[renderMessageContent] Markdown渲染结果为空，使用纯文本');
        return escapeHtml(content);
      }
      return result;
    } catch (e) {
      console.error('[renderMessageContent] Markdown parse error:', e);
      return escapeHtml(content);
    }
  }

  console.log('[renderMessageContent] marked不可用，使用纯文本');
  return escapeHtml(content);
}

function toggleMessageExpand(messageId, memberId) {
  const messageEl = document.querySelector(`.platform-message[data-message-id="${messageId}"][data-member-id="${memberId}"]`);
  if (!messageEl) {
    console.warn('Message element not found:', messageId, 'memberId:', memberId);
    return;
  }

  const expandBtn = messageEl.querySelector('.platform-message-expand-btn');
  const isCollapsed = messageEl.classList.contains('collapsed');

  if (isCollapsed) {
    messageEl.classList.remove('collapsed');
    messageEl.classList.add('expanded');
    if (expandBtn) expandBtn.textContent = '收起 ↑';
    console.log('Message expanded:', messageId, 'memberId:', memberId);
  } else {
    messageEl.classList.remove('expanded');
    messageEl.classList.add('collapsed');
    if (expandBtn) expandBtn.textContent = '展开 ↓';
    console.log('Message collapsed:', messageId, 'memberId:', memberId);
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function togglePlatformWindowHeight(windowId) {
  const windowElement = document.getElementById(windowId);
  if (!windowElement) {
    console.warn('[togglePlatformWindowHeight] 窗口不存在:', windowId);
    return;
  }

  const content = windowElement.querySelector('.platform-window-content');
  if (!content) {
    console.warn('[togglePlatformWindowHeight] 内容区不存在');
    return;
  }

  const isCollapsed = windowElement.classList.contains('collapsed-height');

  if (isCollapsed) {
    // 展开
    windowElement.classList.remove('collapsed-height');
    windowElement.classList.add('expanded-height');
    // 移除内联样式，让CSS控制
    content.style.maxHeight = '';
  } else {
    // 收缩
    windowElement.classList.remove('expanded-height');
    windowElement.classList.add('collapsed-height');
    content.style.maxHeight = '0';
  }

  console.log(`[PlatformPanel] 窗口 ${windowId} ${isCollapsed ? '展开' : '收缩'}`);
}

async function openPlatformConversation(member) {
  console.log(`[PlatformPanel] 打开成员 ${member.name} 的平台会话`);
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'openPlatformConversation',
      conversationId: conversationId,
      memberId: member.id,
      provider: member.provider
    });
    console.log(`[PlatformPanel] 打开平台会话成功:`, result);
  } catch (error) {
    console.error(`[PlatformPanel] 打开平台会话失败:`, error);
    alert('打开失败：' + error.message);
  }
}

async function refreshMemberConversation(memberId) {
  console.log(`[PlatformPanel] 刷新成员 ${memberId} 的会话列表`);
  createPlatformWindows();
}

function togglePlatformPanel() {
  if (!elements.platformPanel) return;

  const isCollapsed = elements.platformPanel.classList.contains('collapsed');
  elements.platformPanel.classList.toggle('collapsed');

  const toggleIcon = document.querySelector('.toggle-icon');
  if (toggleIcon) {
    toggleIcon.textContent = isCollapsed ? '◀' : '▶';
  }

  console.log(`[PlatformPanel] 面板${isCollapsed ? '展开' : '收起'}`);
}

// ==================== 会话设置 ====================

function enableTitleEditing() {
  const currentName = state.conversation.name || '';

  elements.chatTitle.classList.add('editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'title-edit-input';
  input.value = currentName;
  input.placeholder = '输入会话名称';

  elements.chatTitle.innerHTML = '';
  elements.chatTitle.appendChild(input);
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
        elements.chatTitle.classList.remove('editing');
        elements.chatTitle.textContent = newName;
        console.log('[Chat] 会话名称已更新');
      }
    } catch (error) {
      console.error('[Chat] 更新会话名称失败:', error);
    }
  };

  const cancelEdit = () => {
    elements.chatTitle.classList.remove('editing');
    elements.chatTitle.textContent = currentName;
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
  console.log('[DEBUG] state.models:', state.models?.length, state.models);
  console.log('[DEBUG] state.prompts:', state.prompts?.length, state.prompts);

  const existingModal = document.getElementById('addMemberModel');
  if (existingModal) {
    const modalOverlay = existingModal.closest('.modal-overlay');
    if (modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h2>创建新成员</h2>

      <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 13px;">
        创建新成员并添加到当前会话
      </p>

      <div class="form-group">
        <label for="newMemberName">成员名称</label>
        <input type="text" id="newMemberName" class="form-input" placeholder="输入成员名称" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
      </div>

      <div class="form-group">
        <label for="newMemberModel">选择模型</label>
        <select id="newMemberModel" class="form-select" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
          <option value="">请选择模型...</option>
          ${(state.models || []).map(model => {
            const provider = PROVIDERS[model.provider];
            const displayName = provider ? `${provider.name} - ${model.name}` : model.name;
            return `<option value="${model.id}" ${model.enabled === false ? 'disabled' : ''}>
              ${displayName} ${model.enabled === false ? '(已禁用)' : ''}
            </option>`;
          }).join('')}
        </select>
      </div>

      <div class="form-group">
        <label for="newMemberPrompt">选择提示词（可选）</label>
        <select id="newMemberPrompt" class="form-select" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
          <option value="">无提示词</option>
          ${(state.prompts || []).map(prompt => {
            return `<option value="${prompt.id}">${escapeHtml(prompt.name)}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelCreateMemberBtn">取消</button>
        <button class="btn btn-primary" id="confirmCreateMemberBtn">创建并添加</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cancelBtn = document.getElementById('cancelCreateMemberBtn');
  const confirmBtn = document.getElementById('confirmCreateMemberBtn');

  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  confirmBtn.addEventListener('click', async () => {
    const memberName = document.getElementById('newMemberName').value.trim();
    const modelId = document.getElementById('newMemberModel').value;
    const promptId = document.getElementById('newMemberPrompt').value;

    if (!memberName) {
      alert('请输入成员名称');
      return;
    }

    if (!modelId) {
      alert('请选择模型');
      return;
    }

    try {
      const model = state.models.find(m => m.id === modelId);
      if (!model) {
        alert('模型不存在');
        return;
      }

      let systemPrompt = '';
      if (promptId) {
        const prompt = state.prompts.find(p => p.id === promptId);
        if (prompt) {
          systemPrompt = prompt.content || '';
        }
      }

      // 直接创建 Member 对象，不再调用 createMember action
      const newMember = {
        id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
        name: memberName,
        provider: model.provider,
        model: model.model,
        systemPrompt: systemPrompt,
        baseUrl: model.baseUrl || '',
        apiKey: model.apiKey || ''
      };

      const currentMembers = state.conversation.members || [];
      const updatedMembers = [...currentMembers, newMember];
      const memberIds = updatedMembers.map(m => m.id);
      const updates = { members: updatedMembers };

      if (state.conversation.mode === 'discussion' || state.conversation.sendMode === 'sequential') {
        updates.memberOrder = memberIds;
      }

      const updatedConversation = await chrome.runtime.sendMessage({
        action: 'updateConversation',
        conversationId,
        updates
      });

      if (updatedConversation) {
        state.conversation = updatedConversation;
        render();
        initPlatformPanel();
        console.log('[Chat] 新成员已创建并添加到会话');
        document.body.removeChild(modal);
      }
    } catch (error) {
      console.error('创建成员失败:', error);
      alert('创建成员失败：' + error.message);
      document.body.removeChild(modal);
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
    const updates = { members: updatedMembers };

    if (state.conversation.mode === 'discussion' || state.conversation.sendMode === 'sequential') {
      updates.memberOrder = memberIds;
    }

    const updatedConversation = await chrome.runtime.sendMessage({
      action: 'updateConversation',
      conversationId,
      updates
    });

    if (updatedConversation) {
      state.conversation = updatedConversation;
      render();
      initPlatformPanel();
      console.log('[Chat] 成员已移除');
    }
  } catch (error) {
    console.error('[Chat] 移除成员失败:', error);
    alert('移除成员失败: ' + error.message);
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

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    showCopySuccess(button);
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

  if (conversations.length === 0) {
    container.innerHTML = '<div class="sidebar-empty">暂无会话</div>';
    return;
  }

  const groups = groupConversationsByDate(conversations);

  const threeDotSvg = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z" fill="currentColor"></path><path d="M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z" fill="currentColor"></path><path d="M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z" fill="currentColor"></path></svg>';

  const modeIcons = {
    brainstorming: '💡',
    discussion: '🪑',
    expertqa: '🎓'
  };

  container.innerHTML = groups.map(group => `
    <div class="sidebar-date-group">
      <div class="sidebar-date-label">${group.label}</div>
      ${group.items.map(conv => {
        const isActive = conv.id === conversationId;
        const modeIcon = modeIcons[conv.mode] || modeIcons.brainstorming;
        return `
          <div class="sidebar-conv-item ${isActive ? 'active' : ''}"
               data-conv-id="${conv.id}"
               title="${escapeHtml(conv.name)}">
            <span class="sidebar-conv-mode-icon">${modeIcon}</span>
            <div class="sidebar-conv-name">${escapeHtml(conv.name)}</div>
            <button class="sidebar-conv-more" data-conv-id="${conv.id}" title="更多操作">${threeDotSvg}</button>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');

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
}

function groupConversationsByDate(conversations) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups = {
    today: { label: '今天', items: [] },
    yesterday: { label: '昨天', items: [] },
    week: { label: '最近7天', items: [] },
    older: { label: '更早', items: [] }
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
  }
}

// 删除会话
async function deleteConversationFromSidebar(convId) {
  if (!confirm('确定要删除这个会话吗？')) return;

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
    alert('删除失败: ' + error.message);
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
      chrome.runtime.sendMessage({ action: 'getModels' }),
      chrome.runtime.sendMessage({ action: 'getPrompts' }),
      chrome.runtime.sendMessage({ action: 'getExperts' }).catch(() => [])
    ]);

    newConvState.inlineFormModels = (models || []).filter(m => m.enabled !== false);
    newConvState.inlineFormPrompts = prompts || [];

    const modelSelect = document.getElementById('convNewMemberModel');
    if (modelSelect) {
      modelSelect.innerHTML = '<option value="">请选择模型...</option>' +
        newConvState.inlineFormModels.map(model => {
          const provider = window.PROVIDERS ? window.PROVIDERS[model.provider] : null;
          const displayName = provider ? `${provider.name} - ${model.name}` : model.name;
          return `<option value="${model.id}">${escapeHtml(displayName)}</option>`;
        }).join('');
    }

    const promptSelect = document.getElementById('convNewMemberPrompt');
    if (promptSelect) {
      promptSelect.innerHTML = '<option value="">无提示词</option>' +
        newConvState.inlineFormPrompts.map(prompt => {
          return `<option value="${prompt.id}">${escapeHtml(prompt.name)}</option>`;
        }).join('');
    }

    if (experts && experts.length > 0) {
      const expertSelector = document.getElementById('expertSelector');
      if (expertSelector) {
        expertSelector.innerHTML = experts.map(expert => `
          <div class="expert-option" data-expert-id="${expert.id}">
            <div class="expert-option-icon">${escapeHtml(expert.icon || '🎓')}</div>
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
      if (expertSelector) expertSelector.innerHTML = '<div class="empty-state">暂无专家</div>';
    }

    if (!newConvState.eventsBound) {
      document.querySelectorAll('input[name="convMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          newConvState.mode = e.target.value;
          updateNewConvModeVisibility(e.target.value);
        });
      });

      const createMemberBtn = document.getElementById('convCreateMemberBtn');
      if (createMemberBtn) {
        createMemberBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const form = document.getElementById('convInlineMemberForm');
          if (!form) return;
          form.style.display = 'block';
          setTimeout(() => form.classList.add('expanded'), 10);
          setTimeout(() => {
            const nameInput = document.getElementById('convNewMemberName');
            if (nameInput) nameInput.focus();
          }, 300);
        });
      }

      const cancelInlineBtn = document.getElementById('convCancelInlineBtn');
      if (cancelInlineBtn) {
        cancelInlineBtn.addEventListener('click', () => {
          const form = document.getElementById('convInlineMemberForm');
          if (!form) return;
          form.classList.remove('expanded');
          setTimeout(() => { form.style.display = 'none'; }, 300);
          resetInlineMemberForm();
        });
      }

      const saveInlineBtn = document.getElementById('convSaveInlineBtn');
      if (saveInlineBtn) {
        saveInlineBtn.addEventListener('click', saveNewConvInlineMember);
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
    const provider = window.PROVIDERS ? window.PROVIDERS[member.provider] : null;
    const providerName = provider ? provider.name : member.provider;
    const model = newConvState.inlineFormModels.find(m => m.id === member.model || m.model === member.model);
    const modelName = model ? model.name : member.model;
    const prompt = newConvState.inlineFormPrompts.find(p => p.content === member.systemPrompt);
    const promptName = prompt ? prompt.name : (member.systemPrompt ? '自定义提示词' : '');

    return `
      <div class="member-option selected${isDiscussion ? ' draggable' : ''}" data-member-id="${member.id}" ${isDiscussion ? 'draggable="true"' : ''}>
        ${isDiscussion ? `<span class="drag-handle" style="cursor:grab;margin-right:8px;color:#999;">⠿</span>` : ''}
        ${isDiscussion ? `<span class="order-number" style="margin-right:8px;color:#666;font-weight:600;">${index + 1}</span>` : ''}
        <div class="member-option-info">
          <div class="member-option-name">${escapeHtml(member.name)}</div>
          <div class="member-option-meta">
            <span>${escapeHtml(providerName)} - ${escapeHtml(modelName)}</span>
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

    // 直接创建 Member 对象，不再调用 createMember action
    const newMember = {
      id: `member_${Date.now().toString(36)}_${Math.random().toString(36).substr(2)}`,
      name: memberName,
      provider: model.provider,
      model: model.model || model.id,
      systemPrompt: systemPrompt,
      baseUrl: model.baseUrl || '',
      apiKey: model.apiKey || ''
    };

    newConvState.members.push(newMember);
    renderNewConvMemberList();
    saveBtn.innerHTML = '<span>✓</span> 创建成功';
    saveBtn.style.background = 'linear-gradient(135deg, #34c759 0%, #30b350 100%)';
    setTimeout(() => {
      const form = document.getElementById('convInlineMemberForm');
      if (form) form.style.display = 'none';
      resetInlineMemberForm();
    }, 800);
  } catch (error) {
    console.error('[NewConvModal] 创建成员失败:', error);
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span>✗</span> 创建失败';
    saveBtn.style.background = 'linear-gradient(135deg, #ff3b30 0%, #d63020 100%)';
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>✨</span> 创建并添加';
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
  if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span>✨</span> 创建并添加'; saveBtn.style.background = ''; }
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
      alert('请选择一个专家');
      return;
    }
    data.expertId = newConvState.selectedExpertId;
    data.members = [];
  } else {
    // 使用新的 members 字段，而不是 modelIds
    const members = newConvState.members;

    if (mode === 'discussion' && members.length < 2) {
      alert('圆桌讨论至少需要 2 个成员');
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
    alert('创建失败: ' + (error.message || error));
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
}

function renderDashboardWelcome() {
  console.log('[Chat] 渲染 dashboard welcome');

  elements.messagesContainer.innerHTML = `
    <div class="mode-showcase">
      <div class="mode-showcase-card" data-mode="brainstorming">
        <div class="mode-showcase-header">
          <span class="mode-showcase-icon">💡</span>
          <div>
            <h3 class="mode-showcase-title">头脑风暴</h3>
            <p class="mode-showcase-subtitle">排查问题 · 多方案对比 · 各给各的答案</p>
          </div>
        </div>
        <div class="mode-showcase-examples" id="modeExamplesBrainstorming"></div>
      </div>

      <div class="mode-showcase-card" data-mode="discussion">
        <div class="mode-showcase-header">
          <span class="mode-showcase-icon">🪑</span>
          <div>
            <h3 class="mode-showcase-title">圆桌讨论</h3>
            <p class="mode-showcase-subtitle">方案辩论 · 互相挑毛病 · 逐步深入</p>
          </div>
        </div>
        <div class="mode-showcase-examples" id="modeExamplesDiscussion"></div>
      </div>

      <div class="mode-showcase-card" data-mode="expertqa">
        <div class="mode-showcase-header">
          <span class="mode-showcase-icon">🎓</span>
          <div>
            <h3 class="mode-showcase-title">专家问答</h3>
            <p class="mode-showcase-subtitle">系统设计 · 全面审计 · 分步骤协作</p>
          </div>
        </div>
        <div class="mode-showcase-examples" id="modeExamplesExpertqa"></div>
      </div>
    </div>
  `;

  // 启动动画
  startDashboardAnimations();

  // 绑定点击事件
  bindDashboardCardEvents();
}

function startDashboardAnimations() {
  console.log('[Chat] 启动 dashboard 动画');
  Object.keys(MODE_EXAMPLES).forEach(mode => {
    playDashboardModePreview(mode);
    startDashboardModeCycle(mode);
  });
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
    const hintSvg = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const hint = document.createElement('div');
    hint.className = 'mode-example-hint';
    hint.innerHTML = `点击开始类似对话 ${hintSvg}`;
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

// 启动
init();
