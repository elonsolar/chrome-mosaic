/**
 * Dashboard 主逻辑
 * 管理页面路由、导航和全局状态
 */

class Dashboard {
  constructor() {
    this.state = {
      experts: [],
      conversations: [],
      models: [],
      flows: [],
      prompts: [],
      editingExpertId: null
    };
    this.currentPage = 'prompts';
    this.dataLoaded = false;
    this.elements = {};
    this.conversationFilters = {
      keyword: '',
      dateRange: 'all',
      modelId: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    };
    this.batchOperations = {
      selectedIds: new Set(),
      selectAll: false
    };
    this.selectedConvModels = [];
    this.convMode = 'brainstorming';
    this.convMembers = [];
    this.convInlineFormModels = [];
    this.convInlineFormPrompts = [];
    this.expertsViewMode = 'grid';
    this.modelsTab = null;
  }

  async init() {
    console.log('[Dashboard] 初始化');

    // 初始化主题
    this.initTheme();

    // 初始化DOM元素引用
    this.initElements();

    // 绑定事件
    this.bindEvents();

    // 加载数据
    await this.loadData();

    // 初始化路由
    this.initRouter();

    // 初始化设置管理器
    if (window.SettingsManager) {
      window.settingsManager = new SettingsManager();
      await window.settingsManager.init();
    }

    // 初始化模型管理标签页
    if (window.ModelsTab) {
      this.modelsTab = new ModelsTab(this);
      await this.modelsTab.init();
    }

    // 加载专家视图模式
    chrome.storage.local.get('expertsViewMode', (result) => {
      this.expertsViewMode = result.expertsViewMode || 'grid';
      this.initExpertsViewToggle();
    });

    console.log('[Dashboard] 初始化完成');
  }

  initTheme() {
    // 主题已由 ThemeManager 在加载时自动初始化
    // 这里不需要做任何操作
  }

  toggleTheme() {
    // 使用 ThemeManager 切换主题
    if (window.themeManager) {
      window.themeManager.toggle();
    }
  }

  initElements() {
    // 导航项
    this.elements.navItems = document.querySelectorAll('.nav-item');

    // 页面内容区
    this.elements.pages = document.querySelectorAll('.page-content');

    // 容器
    this.elements.expertsContainer = document.getElementById('expertsContainer');
    this.elements.conversationsContainer = document.getElementById('conversationsContainer');

    // 过滤器元素
    this.elements.conversationSearchInput = document.getElementById('conversationSearchInput');
    this.elements.conversationDateFilter = document.getElementById('conversationDateFilter');
    this.elements.conversationModelFilter = document.getElementById('conversationModelFilter');
    this.elements.conversationSortBy = document.getElementById('conversationSortBy');
    this.elements.sortOrderBtn = document.getElementById('sortOrderBtn');
    this.elements.clearSearchBtn = document.getElementById('clearSearchBtn');
    this.elements.filterStats = document.getElementById('filterStats');
    this.elements.filteredCount = document.getElementById('filteredCount');

    // 会话创建模态框
    this.elements.conversationModal = document.getElementById('conversationModal');
    this.elements.conversationName = document.getElementById('conversationName');
    this.elements.convModelSelector = document.getElementById('convModelSelector');
    this.elements.cancelConversationBtn = document.getElementById('cancelConversationBtn');
    this.elements.confirmConversationBtn = document.getElementById('confirmConversationBtn');
    this.elements.convModeSelector = document.getElementById('convModeSelector');
    this.elements.convExpertGroup = document.getElementById('convExpertGroup');
    this.elements.convExpertSelector = document.getElementById('convExpertSelector');
    this.elements.convMemberGroup = document.getElementById('convMemberGroup');
    this.elements.convInlineMemberForm = document.getElementById('convInlineMemberForm');
    this.elements.convAddMemberBtn = document.getElementById('convAddMemberBtn');
  }

  bindEvents() {
    // 导航点击事件
    this.elements.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        this.navigateTo(page);
      });
    });

    // 返回侧边栏按钮
    if (this.elements.backToSidebarBtn) {
      this.elements.backToSidebarBtn.addEventListener('click', () => {
        chrome.sidePanel.open().then(() => {
          window.close();
        });
      });
    }

    // 返回对话页面
    const backToChatBtn = document.getElementById('backToChatBtn');
    if (backToChatBtn) {
      backToChatBtn.addEventListener('click', () => {
        window.location.href = chrome.runtime.getURL('chat/chat.html');
      });
    }

    // 会话过滤器事件
    this.initConversationFilters();

    // 主题切换事件
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // 专家搜索和新增按钮事件
    this.initExpertsToolbar();

    // 会话创建模态框事件
    this.initConversationModalEvents();

    // 专家模态框事件
    document.getElementById('cancelExpertBtn')?.addEventListener('click', () => this.hideExpertModal());
    document.getElementById('saveExpertBtn')?.addEventListener('click', () => this.saveExpert());
    const expertModal = document.getElementById('expertModal');
    if (expertModal) {
      expertModal.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => this.hideExpertModal());
      });
      expertModal.addEventListener('click', (e) => {
        if (e.target === expertModal) this.hideExpertModal();
      });
    }
  }

  initConversationModalEvents() {
    this.elements.cancelConversationBtn?.addEventListener('click', () => {
      this.hideCreateConversationModal();
    });

    this.elements.confirmConversationBtn?.addEventListener('click', () => {
      this.createConversation();
    });

    if (this.elements.conversationModal) {
      this.elements.conversationModal.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.hideCreateConversationModal();
        });
      });

      this.elements.conversationModal.addEventListener('click', (e) => {
        if (e.target === this.elements.conversationModal) {
          this.hideCreateConversationModal();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.elements.conversationModal?.classList.contains('active')) {
          this.hideCreateConversationModal();
        }
      });
    }

    document.querySelectorAll('input[name="convMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        console.log('[Dashboard] 模式选择变更:', e.target.value);
        this.updateConvModeVisibility(e.target.value);
      });
    });

    this.elements.convAddMemberBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.expandConvInlineMemberForm();
    });

    document.getElementById('convCancelInlineBtn')?.addEventListener('click', () => {
      this.collapseConvInlineMemberForm();
    });

    document.getElementById('convSaveInlineBtn')?.addEventListener('click', () => {
      this.saveConvInlineMember();
    });
  }

  initExpertsToolbar() {
    // 搜索输入
    const searchInput = document.getElementById('expertSearchInput');
    const clearBtn = document.getElementById('clearExpertSearch');
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim();
        clearBtn.style.display = keyword ? 'block' : 'none';
        this.filterExperts(keyword);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        this.filterExperts('');
      });
    }

    // 新增专家按钮
    const createBtn = document.getElementById('createExpertBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.showExpertModal();
      });
    }
  }

  filterExperts(keyword) {
    const filtered = keyword
      ? this.experts.filter(expert => 
          expert.name.toLowerCase().includes(keyword.toLowerCase()) ||
          (expert.description && expert.description.toLowerCase().includes(keyword.toLowerCase()))
        )
      : this.experts;
    this.renderExperts(filtered);
  }

  initConversationFilters() {
    // 搜索输入
    this.elements.conversationSearchInput?.addEventListener('input', (e) => {
      this.conversationFilters.keyword = e.target.value.trim();
      this.elements.clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
      this.applyConversationFilters();
    });

    // 清除搜索
    this.elements.clearSearchBtn?.addEventListener('click', () => {
      this.elements.conversationSearchInput.value = '';
      this.conversationFilters.keyword = '';
      this.elements.clearSearchBtn.style.display = 'none';
      this.applyConversationFilters();
    });

    // 日期筛选
    this.elements.conversationDateFilter?.addEventListener('change', (e) => {
      this.conversationFilters.dateRange = e.target.value;
      this.applyConversationFilters();
    });

    // 模型筛选
    this.elements.conversationModelFilter?.addEventListener('change', (e) => {
      this.conversationFilters.modelId = e.target.value;
      this.applyConversationFilters();
    });

    // 排序
    this.elements.conversationSortBy?.addEventListener('change', (e) => {
      this.conversationFilters.sortBy = e.target.value;
      this.applyConversationFilters();
    });

    // 排序顺序切换
    this.elements.sortOrderBtn?.addEventListener('click', () => {
      this.conversationFilters.sortOrder = this.conversationFilters.sortOrder === 'desc' ? 'asc' : 'desc';
      this.elements.sortOrderBtn.classList.toggle('asc', this.conversationFilters.sortOrder === 'asc');
      this.applyConversationFilters();
    });

    // 批量操作事件
    this.initBatchOperations();
  }

  initBatchOperations() {
    // 全选复选框
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    selectAllCheckbox?.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.conversation-select-checkbox');
      if (e.target.checked) {
        const visibleIds = Array.from(checkboxes).map(cb => cb.dataset.id);
        this.batchOperations.selectedIds = new Set(visibleIds);
        this.batchOperations.selectAll = true;
        checkboxes.forEach(cb => {
          cb.checked = true;
          const card = cb.closest('.recent-item, .conv-card');
          if (card) card.classList.add('selected');
        });
      } else {
        this.batchOperations.selectedIds.clear();
        this.batchOperations.selectAll = false;
        checkboxes.forEach(cb => {
          cb.checked = false;
          const card = cb.closest('.recent-item, .conv-card');
          if (card) card.classList.remove('selected');
        });
      }
      this.updateBatchOperationsBar();
    });

    // 批量导出
    document.getElementById('batchExportBtn')?.addEventListener('click', () => {
      this.batchExportConversations();
    });

    // 批量删除
    document.getElementById('batchDeleteBtn')?.addEventListener('click', () => {
      this.batchDeleteConversations();
    });

    // 取消选择
    document.getElementById('cancelSelectionBtn')?.addEventListener('click', () => {
      this.batchOperations.selectedIds.clear();
      this.batchOperations.selectAll = false;

      const selectAllCheckbox = document.getElementById('selectAllCheckbox');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;

      document.querySelectorAll('.conversation-select-checkbox').forEach(cb => {
        cb.checked = false;
        const card = cb.closest('.recent-item, .conv-card');
        if (card) card.classList.remove('selected');
      });

      this.updateBatchOperationsBar();
    });
  }

  async loadData() {
    try {
      const [experts, conversations, models, flows, prompts] = await Promise.all([
        chrome.runtime.sendMessage({ action: 'getExperts' }),
        chrome.runtime.sendMessage({ action: 'getConversations' }),
        chrome.runtime.sendMessage({ action: 'getModels' }),
        chrome.runtime.sendMessage({ action: 'getFlows' }),
        chrome.runtime.sendMessage({ action: 'getPrompts' })
      ]);

      this.state.experts = experts || [];
      this.state.conversations = conversations || [];
      this.state.models = models || [];
      this.state.flows = flows || [];
      this.state.prompts = prompts || [];

      console.log('[Dashboard] 数据加载完成:', {
        experts: this.state.experts.length,
        conversations: this.state.conversations.length,
        models: this.state.models.length,
        flows: this.state.flows.length,
        prompts: this.state.prompts.length
      });

      this.dataLoaded = true;
    } catch (error) {
      console.error('[Dashboard] 加载数据失败:', error);
      this.state.experts = [];
      this.state.conversations = [];
      this.state.models = [];
      this.state.flows = [];
      this.state.prompts = [];
      this.dataLoaded = true;
    }
  }

  initRouter() {
    // 监听hash变化
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'prompts';
      this.navigateTo(hash);
    });

    // 初始化当前页面
    const hash = window.location.hash.slice(1) || 'prompts';
    this.navigateTo(hash);
  }

  navigateTo(page) {
    // 更新导航状态
    this.elements.navItems.forEach(item => {
      if (item.dataset.page === page) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 更新页面显示
    this.elements.pages.forEach(pageEl => {
      if (pageEl.id === `page-${page}`) {
        pageEl.classList.add('active');
      } else {
        pageEl.classList.remove('active');
      }
    });

    this.currentPage = page;

    // 页面特定逻辑
    if (page === 'experts') {
      this.renderExpertsPage();
    } else if (page === 'models') {
      // 渲染模型管理页面
      if (this.modelsTab) {
        this.modelsTab.render();
        this.modelsTab.loadPlatforms();
      }
    } else if (page === 'settings') {
      if (window.settingsManager) {
        window.settingsManager.loadHelperModels();
      }
    }

    // 更新URL hash
    if (window.location.hash.slice(1) !== page) {
      window.location.hash = page;
    }
  }

  async renderHomePage() {
    this.renderModeExamples();

    const refreshBtn = document.getElementById('homeRefreshBtn');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        Object.keys(this.MODE_EXAMPLES).forEach(mode => {
          this.playModePreview(mode);
        });
      };
    }
  }

  MODE_EXAMPLES = {
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

  _modeTimers = {};
  _modeCurrentIndex = { brainstorming: -1, discussion: -1, expertqa: -1 };

  renderModeExamples() {
    Object.keys(this.MODE_EXAMPLES).forEach(mode => {
      this.playModePreview(mode);
      this.startModeCycle(mode);
    });
  }

  async playModePreview(mode) {
    if (this._modePlaying && this._modePlaying[mode]) return;
    if (!this._modePlaying) this._modePlaying = {};
    this._modePlaying[mode] = true;
    const examples = this.MODE_EXAMPLES[mode];
    const container = document.getElementById(`modeExamples${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    if (!container) return;

    this._modeCurrentIndex[mode] = (this._modeCurrentIndex[mode] + 1) % examples.length;
    const ex = examples[this._modeCurrentIndex[mode]];
    const p = ex.preview;

    container.innerHTML = '';

    const itemWrap = document.createElement('div');
    itemWrap.className = 'mode-example-item';
    itemWrap.dataset.mode = mode;
    itemWrap.dataset.name = ex.name;
    itemWrap.onclick = () => {
      this.showCreateConversationModal();
      if (this.elements.conversationName) {
        this.elements.conversationName.value = ex.name;
      }
      this.updateConvModeVisibility(mode);
      document.querySelectorAll('input[name="convMode"]').forEach(r => {
        r.checked = r.value === mode;
      });
    };
    container.appendChild(itemWrap);

    // 对话区域（消息从这里出现）
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
    userDiv.innerHTML = `<div class="mode-preview-user-bubble">${this.escapeHtml(p.user)}</div>`;
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
      aiDiv.innerHTML = `<div class="mode-preview-ai-name">${this.escapeHtml(ai.name)}</div><div class="mode-preview-ai-bubble">${this.escapeHtml(ai.text)}</div>`;
      conv.appendChild(aiDiv);
      aiDelay += 600;
    });

    // 底部提示
    const hintSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    const hint = document.createElement('div');
    hint.className = 'mode-example-hint';
    hint.innerHTML = `点击开始类似对话 ${hintSvg}`;
    itemWrap.appendChild(hint);

    this.restartModeCycle(mode, aiDelay + 3000);
    this._modePlaying[mode] = false;
  }

  startModeCycle(mode) {
    const totalDelay = 500 + this.MODE_EXAMPLES[mode][0].preview.ai.length * 1800 + 3000;
    this.restartModeCycle(mode, totalDelay);
  }

  restartModeCycle(mode, delay) {
    if (this._modeTimers[mode]) clearInterval(this._modeTimers[mode]);
    this._modeTimers[mode] = setInterval(() => {
      if (this.currentPage === 'home') {
        this.playModePreview(mode);
      }
    }, delay);
  }

  bindModeExampleEvents() {
    document.querySelectorAll('.mode-example-item').forEach(item => {
      item.onclick = () => {
        const mode = item.dataset.mode;
        const name = item.dataset.name;
        this.showCreateConversationModal();
        if (this.elements.conversationName) {
          this.elements.conversationName.value = name;
        }
        this.updateConvModeVisibility(mode);
        document.querySelectorAll('input[name="convMode"]').forEach(r => {
          r.checked = r.value === mode;
        });
      };
    });
  }

  formatRelativeTime(timestamp) {
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

  async renderRecentConversations() {
    if (!this.elements.recentConversationsList) return;

    // 如果数据还没加载，保持骨架屏
    if (!this.dataLoaded) {
      return;
    }

    // 获取最近5条会话
    const recentConversations = this.state.conversations
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
      .slice(0, 5);

    // 移除骨架屏
    const skeleton = this.elements.recentConversationsList.querySelector('.loading-skeleton');
    if (skeleton) {
      skeleton.remove();
    }

    if (recentConversations.length === 0) {
      this.elements.recentConversationsList.innerHTML = `
        <div class="empty-state-illustrated" style="padding: 40px 20px; min-height: 200px;">
          <div class="empty-icon" style="font-size: 48px; opacity: 0.6;">💬</div>
          <p style="color: #86868b; margin: 12px 0 0 0;">暂无最近会话</p>
          <button class="btn btn-primary" style="margin-top: 16px;" onclick="chrome.sidePanel.open().then(() => window.close())">
            + 创建会话
          </button>
        </div>
      `;
      return;
    }

    this.elements.recentConversationsList.innerHTML = recentConversations.map(conv => {
      const members = conv.members || [];
      const modelNames = members.map(m => m.name).filter(Boolean).join(', ');
      const time = this.formatTime(conv.updatedAt || conv.createdAt);

      return `
        <div class="recent-item" data-conversation-id="${conv.id}">
          <div class="recent-item-header">
            <div class="recent-item-title">${this.escapeHtml(conv.name)}</div>
            <div class="recent-item-time">${time}</div>
          </div>
          <div class="recent-item-meta">
            <span>🤖 ${modelNames || '未选择'}</span>
            <span>💬 ${conv.messages?.length || 0} 条消息</span>
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this.elements.recentConversationsList.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.dataset.conversationId;
        window.location.href = chrome.runtime.getURL(`chat/chat.html?id=${conversationId}`);
      });
    });
  }

  renderConversationsPage() {
    if (!this.elements.conversationsContainer) return;

    // 填充模型筛选下拉框
    this.populateModelFilter();

    // 处理无数据状态
    if (!this.dataLoaded || this.state.conversations.length === 0) {
      this.elements.conversationsContainer.innerHTML = `
        <div class="empty-state-illustrated empty-state-centered">
          <div class="empty-background"><div class="floating-card card-1"></div><div class="floating-card card-2"></div><div class="floating-card card-3"></div></div>
          <div class="empty-icon">💬</div>
          <h3 class="empty-title">还没有会话</h3>
          <p class="empty-description">创建一个新的会话，开始与 AI 交流</p>
          <div class="empty-actions">
            <button class="btn btn-primary btn-lg" id="emptyConvCreateBtn">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              创建第一个会话
            </button>
          </div>
          <div class="empty-tips">
            <p><strong>💡 提示：</strong></p>
            <ul>
              <li>创建会话后可以同时与多个 AI 模型对话</li>
              <li>每个会话自动保存所有消息记录</li>
              <li>你可以在不同设备间同步会话</li>
            </ul>
          </div>
        </div>
      `;

      const emptyCreateBtn = document.getElementById('emptyConvCreateBtn');
      if (emptyCreateBtn) {
        emptyCreateBtn.addEventListener('click', () => {
          this.showCreateConversationModal();
        });
      }

      // 隐藏过滤器
      const filters = document.getElementById('conversationsFilters');
      if (filters) filters.style.display = 'none';
      const batchBar = document.getElementById('batchOperationsBar');
      if (batchBar) batchBar.style.display = 'none';

      return;
    }

    // 显示过滤器
    const filters = document.getElementById('conversationsFilters');
    if (filters) filters.style.display = 'block';

    // 应用过滤
    this.applyConversationFilters();
  }

  populateModelFilter() {
    if (!this.elements.conversationModelFilter) return;

    const modelFilter = this.elements.conversationModelFilter;
    const currentValue = modelFilter.value;

    // 获取所有在会话中使用的模型
    const usedModels = new Set();
    this.state.conversations.forEach(conv => {
      (conv.members || []).forEach(member => {
        // 新架构：用 modelId 查找；旧架构回退到 provider+model
        const model = member.modelId
          ? this.state.models.find(m => m.id === member.modelId)
          : this.state.models.find(m => m.provider === member.provider && m.model === member.model);
        if (model) {
          usedModels.add(model);
        }
      });
    });

    // 生成选项
    const options = [
      '<option value="all">全部模型</option>',
      ...Array.from(usedModels).map(model =>
        `<option value="${model.id}">${this.escapeHtml(model.name)}</option>`
      )
    ];

    modelFilter.innerHTML = options.join('');

    // 恢复之前的选择
    if (currentValue && Array.from(modelFilter.options).some(opt => opt.value === currentValue)) {
      modelFilter.value = currentValue;
    }
  }

  applyConversationFilters() {
    const filters = this.conversationFilters;
    let filtered = [...this.state.conversations];

    // 关键词过滤
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      filtered = filtered.filter(conv =>
        conv.name.toLowerCase().includes(keyword)
      );
    }

    // 日期过滤
    if (filters.dateRange !== 'all') {
      const now = new Date();
      if (filters.dateRange === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filtered = filtered.filter(conv => new Date(conv.updatedAt || conv.createdAt) >= today);
      } else if (filters.dateRange === 'week') {
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(conv => new Date(conv.updatedAt || conv.createdAt) >= weekAgo);
      } else if (filters.dateRange === 'month') {
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(conv => new Date(conv.updatedAt || conv.createdAt) >= monthAgo);
      }
    }

    // 模型过滤
    if (filters.modelId !== 'all') {
      const selectedModel = this.state.models.find(m => m.id === filters.modelId);
      filtered = filtered.filter(conv => {
        if (!conv.members || conv.members.length === 0) return false;
        return conv.members.some(member => {
          if (!selectedModel) return false;
          // 新架构：用 modelId 匹配；旧架构回退到 provider+model
          return member.modelId
            ? member.modelId === selectedModel.id
            : member.provider === selectedModel.provider && member.model === selectedModel.model;
        });
      });
    }

    // 排序
    filtered.sort((a, b) => {
      let aVal, bVal;

      if (filters.sortBy === 'updatedAt') {
        aVal = a.updatedAt || a.createdAt;
        bVal = b.updatedAt || b.createdAt;
      } else if (filters.sortBy === 'createdAt') {
        aVal = a.createdAt;
        bVal = b.createdAt;
      } else if (filters.sortBy === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (filters.sortBy === 'messagesCount') {
        aVal = (a.messages || []).length;
        bVal = (b.messages || []).length;
      }

      if (filters.sortOrder === 'desc') {
        return aVal > bVal ? -1 : 1;
      } else {
        return aVal < bVal ? -1 : 1;
      }
    });

    // 更新显示
    this.renderFilteredConversations(filtered);
    this.updateFilterStats(filtered.length);
  }

  renderFilteredConversations(conversations) {
    if (!this.elements.conversationsContainer) return;

    if (conversations.length === 0) {
      this.elements.conversationsContainer.innerHTML = `
        <div class="empty-state-illustrated" style="padding: 60px 20px; min-height: 400px;">
          <div class="empty-background"><div class="floating-card card-1"></div><div class="floating-card card-2"></div><div class="floating-card card-3"></div></div>
          <div class="empty-icon">🔍</div>
          <h3 class="empty-title">没有找到匹配的会话</h3>
          <p class="empty-description">尝试调整筛选条件或清除部分筛选</p>
          <div class="empty-actions">
            <button class="btn btn-secondary" id="clearFiltersBtn">清除筛选</button>
            <button class="btn btn-primary" id="emptyNewConvBtn">+ 新建会话</button>
          </div>
        </div>
      `;

      this.elements.conversationsContainer.querySelector('#clearFiltersBtn')?.addEventListener('click', () => {
        this.clearAllFilters();
      });
      this.elements.conversationsContainer.querySelector('#emptyNewConvBtn')?.addEventListener('click', () => {
        this.showCreateConversationModal();
      });

      return;
    }

    const modeLabels = {
      brainstorming: { text: '头脑风暴', class: 'mode-brainstorm', icon: '💡' },
      discussion: { text: '圆桌讨论', class: 'mode-discuss', icon: '🪑' },
      expertqa: { text: '专家问答', class: 'mode-expert', icon: '🎓' }
    };

    this.renderConversationsGrid(conversations, modeLabels);

    this.bindConversationItemEvents();
    this.bindConversationCardEvents();
  }

  renderConversationsGrid(conversations, modeLabels) {
    this.elements.conversationsContainer.innerHTML = `
      <div class="conversations-grid">
        ${conversations.map(conv => {
          const members = conv.members || [];
          const time = this.formatTime(conv.updatedAt || conv.createdAt);
          const messages = conv.messages || [];
          const lastMsg = messages[messages.length - 1];
          const prevMsg = messages.length > 1 ? messages[messages.length - 2] : null;
          const isSelected = this.batchOperations.selectedIds.has(conv.id);

          const previewBubbles = [];
          if (prevMsg) {
            const isUser = prevMsg.role === 'user';
            previewBubbles.push(`
              <div class="conv-preview-bubble ${isUser ? 'user' : 'assistant'}">
                <div class="conv-preview-avatar">${isUser ? '👤' : '🤖'}</div>
                <div class="conv-preview-text">${this.escapeHtml(prevMsg.content?.substring(0, 80) || '')}${prevMsg.content?.length > 80 ? '...' : ''}</div>
              </div>
            `);
          }
          if (lastMsg) {
            const isUser = lastMsg.role === 'user';
            previewBubbles.push(`
              <div class="conv-preview-bubble ${isUser ? 'user' : 'assistant'}">
                <div class="conv-preview-avatar">${isUser ? '👤' : '🤖'}</div>
                <div class="conv-preview-text">${this.escapeHtml(lastMsg.content?.substring(0, 80) || '')}${lastMsg.content?.length > 80 ? '...' : ''}</div>
              </div>
            `);
          }

          const modeInfo = modeLabels[conv.mode] || modeLabels.brainstorming;

          return `
            <div class="conv-card ${isSelected ? 'selected' : ''}" data-conversation-id="${conv.id}" style="position: relative;">
              <label class="conv-card-checkbox" onclick="event.stopPropagation()">
                <input type="checkbox" class="conversation-select-checkbox"
                       data-id="${conv.id}" ${isSelected ? 'checked' : ''}>
              </label>
              <div class="conv-card-header">
                <div class="conv-card-avatar">💬</div>
                <div class="conv-card-info">
                  <div class="conv-card-title-row">
                    <div class="conv-card-title">${this.escapeHtml(conv.name || '未命名会话')}</div>
                    <span class="conv-card-mode ${modeInfo.class}">${modeInfo.text}</span>
                    <div class="conv-card-time">${time}</div>
                  </div>
                  ${members.length > 0 ? `
                    <div class="conv-card-models">
                      ${members.slice(0, 3).map(m => `
                        <span class="conv-model-chip">🤖 ${this.escapeHtml(m.name)}</span>
                      `).join('')}
                      ${members.length > 3 ? `<span class="conv-model-chip">+${members.length - 3}</span>` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>
              ${previewBubbles.length > 0 ? `
                <div class="conv-card-preview">
                  ${previewBubbles.join('')}
                </div>
              ` : `
                <div class="conv-card-preview">
                  <div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 12px;">
                    暂无消息，点击开始对话
                  </div>
                </div>
              `}
              <div class="conv-card-footer">
                <div class="conv-card-stat">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M1 8C1 4.134 4.134 1 8 1s7 3.134 7 7-3.134 7-7 7c-1.2 0-2.34-.3-3.34-.83L1 15l1.83-2.66A6.96 6.96 0 011 8z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <strong>${messages.length}</strong> 条消息
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderConversationsList(conversations, modeLabels) {
    this.elements.conversationsContainer.innerHTML = `
      <div class="conversations-list">
        ${conversations.map(conv => {
          const members = conv.members || [];
          const time = this.formatTime(conv.updatedAt || conv.createdAt);
          const messages = conv.messages || [];
          const isSelected = this.batchOperations.selectedIds.has(conv.id);
          const modeInfo = modeLabels[conv.mode] || modeLabels.brainstorming;

          return `
            <div class="conv-list-item ${isSelected ? 'selected' : ''}" data-conversation-id="${conv.id}">
              <label class="conv-list-checkbox" onclick="event.stopPropagation()">
                <input type="checkbox" class="conversation-select-checkbox"
                       data-id="${conv.id}" ${isSelected ? 'checked' : ''}>
              </label>
              <div class="conv-list-icon">${modeInfo.icon}</div>
              <div class="conv-list-info">
                <div class="conv-list-title">${this.escapeHtml(conv.name || '未命名会话')}</div>
                <div class="conv-list-meta">
                  <span class="conv-list-mode ${modeInfo.class}">${modeInfo.text}</span>
                  ${members.length > 0 ? `<span class="conv-list-models">${members.slice(0, 2).map(m => this.escapeHtml(m.name)).join(', ')}${members.length > 2 ? '...' : ''}</span>` : ''}
                </div>
              </div>
              <div class="conv-list-stats">
                <span class="conv-list-messages">${messages.length} 条消息</span>
                <span class="conv-list-time">${time}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  bindConversationCardEvents() {
    // 绑定卡片视图点击事件
    this.elements.conversationsContainer.querySelectorAll('.conv-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.conv-card-checkbox')) return;
        const conversationId = card.dataset.conversationId;
        window.location.href = chrome.runtime.getURL(`chat/chat.html?id=${conversationId}`);
      });
    });
    
    // 绑定列表视图点击事件
    this.elements.conversationsContainer.querySelectorAll('.conv-list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.conv-list-checkbox')) return;
        const conversationId = item.dataset.conversationId;
        window.location.href = chrome.runtime.getURL(`chat/chat.html?id=${conversationId}`);
      });
    });
  }

  bindConversationItemEvents() {
    // 绑定复选框事件
    this.elements.conversationsContainer.querySelectorAll('.conversation-select-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = e.target.dataset.id;
        const card = e.target.closest('.recent-item, .conv-card');

        if (e.target.checked) {
          this.batchOperations.selectedIds.add(id);
          card?.classList.add('selected');
        } else {
          this.batchOperations.selectedIds.delete(id);
          card?.classList.remove('selected');
        }

        this.updateBatchOperationsBar();
      });

      // 阻止复选框点击事件冒泡到卡片
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    // 绑定卡片点击事件 - 直接跳转到 chat.html
    this.elements.conversationsContainer.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.dataset.conversationId;
        window.location.href = chrome.runtime.getURL(`chat/chat.html?id=${conversationId}`);
      });
    });

    // 绑定详情页返回按钮
    const backBtn = document.getElementById('backToConversationsBtn');
    if (backBtn) {
      backBtn.onclick = () => {
        this.hideConversationDetail();
      };
    }

    // 绑定继续对话按钮
    const continueBtn = document.getElementById('continueConversationBtn');
    if (continueBtn) {
      continueBtn.onclick = () => {
        const conversationId = continueBtn.dataset.conversationId;
        if (conversationId) {
          window.location.href = chrome.runtime.getURL(`chat/chat.html?id=${conversationId}`);
        }
      };
    }

    // 绑定导出按钮
    const exportBtn = document.getElementById('exportSingleConversationBtn');
    if (exportBtn) {
      exportBtn.onclick = () => {
        const conversationId = exportBtn.dataset.conversationId;
        if (conversationId) {
          const conversation = this.state.conversations.find(c => c.id === conversationId);
          if (conversation) {
            this.exportSingleConversation(conversation);
          }
        }
      };
    }
  }

  updateBatchOperationsBar() {
    const bar = document.getElementById('batchOperationsBar');
    const countEl = document.getElementById('selectedCount');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    const count = this.batchOperations.selectedIds.size;
    countEl.textContent = count;

    if (count > 0) {
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
  }

  async batchExportConversations() {
    const ids = Array.from(this.batchOperations.selectedIds);
    if (ids.length === 0) return;

    const conversations = this.state.conversations.filter(c => ids.includes(c.id));

    // 导出为 JSON
    const dataStr = JSON.stringify(conversations, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `mosaic-conversations-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    this.showNotification(`已导出 ${ids.length} 个会话`);
  }

  async batchDeleteConversations() {
    const ids = Array.from(this.batchOperations.selectedIds);
    if (ids.length === 0) return;

    const confirmed = confirm(`确定要删除 ${ids.length} 个会话吗？此操作不可恢复。`);
    if (!confirmed) return;

    try {
      await chrome.runtime.sendMessage({
        action: 'deleteConversations',
        conversationIds: ids
      });

      // 清除选择状态
      this.batchOperations.selectedIds.clear();
      this.batchOperations.selectAll = false;
      document.getElementById('selectAllCheckbox').checked = false;

      // 重新加载数据
      await this.loadData();
      this.applyConversationFilters();
      this.updateBatchOperationsBar();

      this.showNotification(`已删除 ${ids.length} 个会话`);
    } catch (error) {
      console.error('[Dashboard] 删除会话失败:', error);
      alert('删除失败: ' + error.message);
    }
  }

  showNotification(message) {
    // 创建一个简单的通知
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #34c759;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  async showConversationDetail(conversationId) {
    const conversation = this.state.conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    // 隐藏列表，显示详情
    this.elements.conversationsContainer.style.display = 'none';
    const detailView = document.getElementById('conversationDetailView');
    detailView.style.display = 'flex';

    // 填充基本信息
    document.getElementById('detailConversationName').textContent = conversation.name;
    document.getElementById('detailTime').textContent = this.formatTime(conversation.updatedAt || conversation.createdAt);

    const models = (conversation.modelIds || conversation.memberIds || []).map(id => {
      const model = this.state.models.find(m => m.id === id);
      return model ? model.name : id;
    }).join(', ');
    document.getElementById('detailModels').textContent = models || '未选择模型';

    // 更新按钮的data属性
    const continueBtn = document.getElementById('continueConversationBtn');
    const exportBtn = document.getElementById('exportSingleConversationBtn');
    if (continueBtn) continueBtn.dataset.conversationId = conversationId;
    if (exportBtn) exportBtn.dataset.conversationId = conversationId;

    // 渲染消息列表
    await this.renderConversationMessages(conversation);
  }

  async renderConversationMessages(conversation) {
    const messagesList = document.getElementById('detailMessagesList');

    if (!conversation.messages || conversation.messages.length === 0) {
      messagesList.innerHTML = `
        <div class="empty-state">
          <p>暂无消息</p>
        </div>
      `;
      return;
    }

    messagesList.innerHTML = conversation.messages.map(msg => {
      const isUser = msg.role === 'user';
      const member = conversation.members?.find(m => m.id === msg.memberId);
      const memberName = member ? member.name : 'AI';
      const avatar = isUser ? '👤' : '🤖';

      return `
        <div class="message-item">
          <div class="message-avatar">${avatar}</div>
          <div class="message-content">
            <div class="message-role">${isUser ? '用户' : memberName}</div>
            <div class="message-text">${this.escapeHtml(msg.content || '')}</div>
            ${msg.timestamp ? `
              <div class="message-time">${this.formatTime(msg.timestamp)}</div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 滚动到底部
    messagesList.scrollTop = messagesList.scrollHeight;
  }

  hideConversationDetail() {
    this.elements.conversationsContainer.style.display = 'block';
    const detailView = document.getElementById('conversationDetailView');
    if (detailView) detailView.style.display = 'none';
  }

  showCreateConversationModal() {
    if (!this.elements.conversationModal) return;

    this.convMode = 'brainstorming';
    this.convMembers = [];
    document.querySelectorAll('input[name="convMode"]').forEach(r => {
      r.checked = r.value === 'brainstorming';
    });
    this.updateConvModeVisibility('brainstorming');
    this.collapseConvInlineMemberForm();

    this.populateConvModelSelector();
    this.populateConvExpertSelector();
    this.loadConvInlineFormData();

    this.elements.conversationModal.classList.add('active');
    setTimeout(() => {
      if (this.elements.conversationName) this.elements.conversationName.focus();
    }, 100);
    this.elements.conversationName.value = '';
    this.selectedConvModels = [];
  }

  populateConvModelSelector() {
    if (!this.elements.convModelSelector) return;

    // 默认显示空列表，用户需通过"创建新成员"按钮添加成员
    if (this.convMembers.length === 0) {
      this.elements.convModelSelector.innerHTML = `
        <div class="empty-state" style="padding: 24px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
          <p style="margin: 0; font-size: 13px; color: #86868b;">暂无成员，请点击上方"创建新成员"按钮添加</p>
        </div>
      `;
      return;
    }

    // 圆桌讨论模式下显示拖拽手柄
    const isDiscussion = this.convMode === 'discussion';

    // 显示已创建的成员（名称+模型+提示词组合），所有成员默认参加会话
    this.elements.convModelSelector.innerHTML = this.convMembers.map((member, index) => {
      const platformName = member.platformName || '';
      const modelCode = member.modelCode || '';
      const prompt = this.state.prompts?.find(p => p.content === member.systemPrompt);
      const promptName = prompt ? prompt.name : (member.systemPrompt ? '自定义提示词' : '');

      return `
        <div class="member-option selected${isDiscussion ? ' draggable' : ''}" data-member-id="${member.id}" ${isDiscussion ? 'draggable="true"' : ''}>
          ${isDiscussion ? `<span class="drag-handle" style="cursor:grab;margin-right:8px;color:#999;">⠿</span>` : ''}
          ${isDiscussion ? `<span class="order-number" style="margin-right:8px;color:#666;font-weight:600;">${index + 1}</span>` : ''}
          <div class="member-option-info">
            <div class="member-option-name">${this.escapeHtml(member.name)}</div>
            <div class="member-option-meta">
              <span>${this.escapeHtml(platformName)} - ${this.escapeHtml(modelCode)}</span>
              ${promptName ? `<span style="margin-left: 8px;">📝 ${this.escapeHtml(promptName)}</span>` : ''}
            </div>
          </div>
          <button class="remove-member-btn" data-member-id="${member.id}">×</button>
        </div>
      `;
    }).join('');

    // 圆桌讨论模式下启用拖拽排序
    if (isDiscussion) {
      this.initMemberListDragSort();
    }
  }

  initMemberListDragSort() {
    const container = this.elements.convModelSelector;
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
        this.updateMemberOrder();
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

  updateMemberOrder() {
    const container = this.elements.convModelSelector;
    if (!container) return;

    const newOrder = Array.from(container.querySelectorAll('.member-option'))
      .map(el => el.dataset.memberId);

    // 更新 convMembers 数组顺序
    this.convMembers.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));

    // 更新序号显示
    container.querySelectorAll('.member-option').forEach((item, index) => {
      const orderNum = item.querySelector('.order-number');
      if (orderNum) orderNum.textContent = index + 1;
    });
  }

  populateConvExpertSelector() {
    if (!this.elements.convExpertSelector) return;
    const experts = this.state.experts || [];
    if (experts.length === 0) {
      this.elements.convExpertSelector.innerHTML = `
        <div class="empty-state" style="padding: 24px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;">🎓</div>
          <p style="margin: 0; font-size: 13px; color: #86868b;">暂无专家，请先在专家页面创建</p>
        </div>
      `;
      return;
    }
    this.elements.convExpertSelector.innerHTML = experts.map(expert => `
      <div class="expert-option" data-expert-id="${expert.id}">
        <div class="expert-option-radio">
          <input type="radio" name="convExpert" value="${expert.id}">
        </div>
        <div class="expert-option-info">
          <div class="expert-option-icon">${this.escapeHtml(expert.icon || '🎓')}</div>
          <div class="expert-option-text">
            <div class="expert-option-name">${this.escapeHtml(expert.name)}</div>
            <div class="expert-option-desc">${this.escapeHtml(expert.description || '暂无描述')}</div>
          </div>
        </div>
      </div>
    `).join('');
    this.elements.convExpertSelector.querySelectorAll('.expert-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.elements.convExpertSelector.querySelectorAll('.expert-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        const radio = opt.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });
  }

  updateConvModeVisibility(mode) {
    this.convMode = mode;
    const expertGroup = this.elements.convExpertGroup;
    const memberGroup = this.elements.convMemberGroup;

    if (expertGroup) expertGroup.style.display = mode === 'expertqa' ? 'block' : 'none';
    if (memberGroup) memberGroup.style.display = mode !== 'expertqa' ? 'block' : 'none';

    // 切换模式时重新渲染成员列表（圆桌讨论模式显示拖拽手柄）
    this.populateConvModelSelector();
  }

  async loadConvInlineFormData() {
    try {
      const [models, prompts] = await Promise.all([
        chrome.runtime.sendMessage({ action: 'getModels' }),
        chrome.runtime.sendMessage({ action: 'getPrompts' })
      ]);

      this.convInlineFormModels = (models || []).filter(m => m.enabled !== false);
      this.convInlineFormPrompts = prompts || [];

      const modelSelect = document.getElementById('convNewMemberModel');
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">请选择模型...</option>' +
          this.convInlineFormModels.map(model => {
            const platformName = model.platformName || '未知平台';
            const displayName = `${platformName} - ${model.id}`;
            return `<option value="${model.id}">${this.escapeHtml(displayName)}</option>`;
          }).join('');
      }

      const promptSelect = document.getElementById('convNewMemberPrompt');
      if (promptSelect) {
        promptSelect.innerHTML = '<option value="">无提示词</option>' +
          this.convInlineFormPrompts.map(prompt => {
            return `<option value="${prompt.id}">${this.escapeHtml(prompt.name)}</option>`;
          }).join('');
      }
    } catch (error) {
      console.error('[Dashboard] 加载内联表单数据失败:', error);
    }
  }

  expandConvInlineMemberForm() {
    const container = this.elements.convInlineMemberForm;
    if (!container) return;
    container.style.display = 'block';
    setTimeout(() => container.classList.add('expanded'), 10);
    setTimeout(() => {
      const nameInput = document.getElementById('convNewMemberName');
      if (nameInput) nameInput.focus();
    }, 300);
  }

  collapseConvInlineMemberForm() {
    const container = this.elements.convInlineMemberForm;
    if (!container) return;
    container.classList.remove('expanded');
    setTimeout(() => { container.style.display = 'none'; }, 300);
    this.resetConvInlineMemberForm();
  }

  resetConvInlineMemberForm() {
    const nameInput = document.getElementById('convNewMemberName');
    const modelSelect = document.getElementById('convNewMemberModel');
    const promptSelect = document.getElementById('convNewMemberPrompt');
    if (nameInput) { nameInput.value = ''; nameInput.classList.remove('error', 'success'); }
    if (modelSelect) { modelSelect.value = ''; modelSelect.classList.remove('error', 'success'); }
    if (promptSelect) promptSelect.value = '';
    const saveBtn = document.getElementById('convSaveInlineBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span>✨</span> 创建并添加'; saveBtn.style.background = ''; }
  }

  async saveConvInlineMember() {
    const saveBtn = document.getElementById('convSaveInlineBtn');
    const nameInput = document.getElementById('convNewMemberName');
    const modelSelect = document.getElementById('convNewMemberModel');
    const promptSelect = document.getElementById('convNewMemberPrompt');

    if (!nameInput || !modelSelect || !saveBtn) return;

    const memberName = nameInput.value.trim();
    const modelId = modelSelect.value;
    const promptId = promptSelect ? promptSelect.value : null;

    if (!memberName) { nameInput.classList.add('error'); return; }
    if (!modelId) { modelSelect.classList.add('error'); return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="loading-spinner"></span> 创建中...';

    try {
      const model = this.convInlineFormModels.find(m => m.id === modelId);
      if (!model) throw new Error('模型不存在');

      let systemPrompt = '';
      if (promptId) {
        const prompt = this.convInlineFormPrompts.find(p => p.id === promptId);
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
      }

      if (newMember) {
        this.convMembers.push(newMember);
        this.addConvMemberToSelector(newMember);
        saveBtn.innerHTML = '<span>✓</span> 创建成功';
        saveBtn.style.background = 'linear-gradient(135deg, #34c759 0%, #30b350 100%)';
        setTimeout(() => { this.collapseConvInlineMemberForm(); }, 800);
      }
    } catch (error) {
      console.error('[Dashboard] 创建成员失败:', error);
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

  addConvMemberToSelector(member) {
    // 重新渲染选择器以显示新成员
    this.populateConvModelSelector();
  }

  async createConversation() {
    const name = this.elements.conversationName?.value.trim();
    const mode = this.convMode || 'brainstorming';

    console.log('[Dashboard] 创建会话 - convMode:', this.convMode, '最终mode:', mode);

    const data = {
      name: name || undefined,
      mode
    };

    if (mode === 'expertqa') {
      const selectedExpert = this.elements.convExpertSelector?.querySelector('.expert-option.selected');
      if (!selectedExpert) {
        alert('请选择一个专家');
        return;
      }
      data.expertId = selectedExpert.dataset.expertId;
      data.modelIds = [];
    } else {
      // 所有创建的成员都参加会话
      const allMemberIds = this.convMembers.map(m => m.id);

      if (mode === 'discussion' && allMemberIds.length < 2) {
        alert('圆桌讨论至少需要 2 个成员');
        return;
      }
      data.modelIds = allMemberIds;

      // 圆桌讨论模式下，使用成员列表的顺序作为发言顺序
      if (mode === 'discussion') {
        data.memberOrder = allMemberIds;
      }
    }

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'createConversation',
        ...data
      });
      if (result && result.id) {
        this.hideCreateConversationModal();
        await this.loadData();
        window.location.href = chrome.runtime.getURL(`chat/chat.html?id=${result.id}`);
      }
    } catch (error) {
      console.error('[Dashboard] 创建会话失败:', error);
      alert('创建失败: ' + (error.message || error));
    }
  }

  hideCreateConversationModal() {
    if (this.elements.conversationModal) {
      this.elements.conversationModal.classList.remove('active');
    }
  }

  exportSingleConversation(conversation) {
    const dataStr = JSON.stringify(conversation, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${conversation.name}-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    this.showNotification('已导出会话');
  }

  updateFilterStats(count) {
    if (!this.elements.filterStats || !this.elements.filteredCount) return;

    const total = this.state.conversations.length;
    if (count < total) {
      this.elements.filterStats.style.display = 'block';
      this.elements.filteredCount.textContent = count;
    } else {
      this.elements.filterStats.style.display = 'none';
    }
  }

  hasActiveFilters() {
    const filters = this.conversationFilters;
    return filters.keyword ||
           filters.dateRange !== 'all' ||
           filters.modelId !== 'all';
  }

  removeFilter(type) {
    switch (type) {
      case 'keyword':
        this.conversationFilters.keyword = '';
        this.elements.conversationSearchInput.value = '';
        this.elements.clearSearchBtn.style.display = 'none';
        break;
      case 'dateRange':
        this.conversationFilters.dateRange = 'all';
        this.elements.conversationDateFilter.value = 'all';
        break;
      case 'modelId':
        this.conversationFilters.modelId = 'all';
        this.elements.conversationModelFilter.value = 'all';
        break;
    }
    this.applyConversationFilters();
  }

  clearAllFilters() {
    this.conversationFilters = {
      keyword: '',
      dateRange: 'all',
      modelId: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    };

    // 重置UI
    this.elements.conversationSearchInput.value = '';
    this.elements.clearSearchBtn.style.display = 'none';
    this.elements.conversationDateFilter.value = 'all';
    this.elements.conversationModelFilter.value = 'all';
    this.elements.conversationSortBy.value = 'updatedAt';
    this.elements.sortOrderBtn.classList.remove('asc');

    this.applyConversationFilters();
  }

  renderExpertsPage() {
    const container = this.elements.expertsContainer;
    if (!container) return;

    const experts = this.state.experts || [];

    if (experts.length === 0) {
      container.className = 'experts-container is-empty';
      container.innerHTML = `
        <div class="empty-state-illustrated empty-state-centered">
          <div class="empty-background">
            <div class="floating-card card-1"></div>
            <div class="floating-card card-2"></div>
            <div class="floating-card card-3"></div>
          </div>
          <div class="empty-icon">🎓</div>
          <h3 class="empty-title">还没有专家</h3>
          <p class="empty-description">创建专家并设计执行流程，让 AI 以专业身份解决问题</p>
          <div class="empty-actions">
            <button class="btn btn-primary btn-lg" id="emptyCreateExpertBtn">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              创建第一个专家
            </button>
          </div>
          <div class="empty-tips">
            <p><strong>💡 提示：</strong></p>
            <ul>
              <li>专家是一个可定制的 AI 执行方案</li>
              <li>通过可视化流程设计器编排节点与逻辑</li>
              <li>每个节点可以指定不同的 AI 模型与提示词</li>
            </ul>
          </div>
        </div>
      `;
      document.getElementById('emptyCreateExpertBtn')?.addEventListener('click', () => {
        this.showExpertModal();
      });
      return;
    }

    container.className = `experts-container has-experts view-${this.expertsViewMode || 'grid'}`;

    container.innerHTML = experts.map(expert => {
      return `
        <div class="expert-card" data-expert-id="${expert.id}">
          <div class="expert-card-header">
            <div class="expert-card-avatar">
              <img src="${this.getExpertAvatarUrl(expert)}" alt="${this.escapeHtml(expert.name || '')}">
            </div>
            <div class="expert-card-title-group">
              <div class="expert-card-name">${this.escapeHtml(expert.name || '未命名专家')}</div>
            </div>
          </div>

          <div class="expert-card-body">
            ${expert.description
              ? `<div class="expert-card-desc">${this.escapeHtml(expert.description)}</div>`
              : `<div class="expert-card-desc expert-card-desc-empty">暂无描述</div>`
            }
          </div>

          <div class="expert-card-footer">
            <div class="expert-card-actions">
              <button class="icon-btn" data-action="editFlow" data-id="${expert.id}" title="编辑流程">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="5" cy="6" r="3"/>
                  <circle cx="19" cy="6" r="3"/>
                  <circle cx="12" cy="18" r="3"/>
                  <path d="M5 9v3a4 4 0 004 4h2M19 9v3a4 4 0 01-4 4h-2"/>
                </svg>
              </button>
              <button class="icon-btn" data-action="edit" data-id="${expert.id}" title="编辑">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="icon-btn" data-action="duplicate" data-id="${expert.id}" title="复制">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
              <button class="icon-btn danger" data-action="delete" data-id="${expert.id}" title="删除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.bindExpertCardEvents();
  }

  bindExpertCardEvents() {
    document.querySelectorAll('.expert-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          e.stopPropagation();
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          if (action === 'edit') this.showExpertModal(id);
          else if (action === 'editFlow') this.openExpertDesigner(id);
          else if (action === 'duplicate') this.duplicateExpert(id);
          else if (action === 'delete') this.deleteExpert(id);
        }
      });
    });
  }

  showExpertModal(expertId = null) {
    this.state.editingExpertId = expertId;
    const modal = document.getElementById('expertModal');
    const title = document.getElementById('expertModalTitle');

    if (expertId) {
      const expert = this.state.experts.find(e => e.id === expertId);
      if (!expert) return;
      title.textContent = '编辑专家';
      document.getElementById('expertName').value = expert.name || '';
      document.getElementById('expertDesc').value = expert.description || '';
      this.updateExpertAvatarPreview(expert.name || '');
    } else {
      title.textContent = '新建专家';
      document.getElementById('expertName').value = '';
      document.getElementById('expertDesc').value = '';
      this.updateExpertAvatarPreview('');
    }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('expertName')?.focus(), 100);

    this.initExpertModalEvents();
  }

  initExpertModalEvents() {
    const nameInput = document.getElementById('expertName');
    const refreshBtn = document.getElementById('refreshAvatarBtn');

    nameInput?.addEventListener('input', () => {
      this.updateExpertAvatarPreview(nameInput.value);
    });

    refreshBtn?.addEventListener('click', () => {
      const name = nameInput?.value || '';
      const randomSeed = name + '_' + Date.now();
      this.updateExpertAvatarPreview(randomSeed);
    });
  }

  updateExpertAvatarPreview(seed) {
    const preview = document.getElementById('expertAvatarPreview');
    if (!preview) return;
    const url = this.generateExpertIcon(seed || 'expert');
    preview.innerHTML = `<img src="${url}" alt="预览">`;
  }

  hideExpertModal() {
    document.getElementById('expertModal')?.classList.remove('active');
    this.state.editingExpertId = null;
  }

  async saveExpert() {
    const name = document.getElementById('expertName')?.value.trim();
    const desc = document.getElementById('expertDesc')?.value.trim();

    if (!name) { alert('请输入专家名称'); return; }

    const preview = document.getElementById('expertAvatarPreview');
    const icon = preview?.querySelector('img')?.src || this.generateExpertIcon(name);

    try {
      if (this.state.editingExpertId) {
        await chrome.runtime.sendMessage({
          action: 'updateExpert',
          expertId: this.state.editingExpertId,
          data: { name, icon, description: desc }
        });
      } else {
        await chrome.runtime.sendMessage({
          action: 'createExpert',
          data: { name, icon, description: desc, nodes: [], connections: [] }
        });
      }

      this.hideExpertModal();
      await this.loadData();
      this.renderExpertsPage();
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  async deleteExpert(expertId) {
    const expert = this.state.experts.find(e => e.id === expertId);
    if (!expert) return;
    if (!confirm(`确定删除专家"${expert.name}"？`)) return;

    await chrome.runtime.sendMessage({ action: 'deleteExpert', expertId });
    await this.loadData();
    this.renderExpertsPage();
  }

  async duplicateExpert(expertId) {
    try {
      await chrome.runtime.sendMessage({ action: 'duplicateExpert', expertId });
      await this.loadData();
      this.renderExpertsPage();
    } catch (e) {
      alert('复制失败: ' + e.message);
    }
  }

  openExpertDesigner(expertId) {
    const url = `../flow-designer/flow-designer.html?expertId=${encodeURIComponent(expertId)}`;
    chrome.tabs.create({ url: chrome.runtime.getURL(url) });
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} 分钟前`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)} 小时前`;
    } else if (diff < 604800000) {
      return `${Math.floor(diff / 86400000)} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  initExpertsViewToggle() {
    const toggle = document.getElementById('expertsViewToggle');
    if (!toggle) return;

    const buttons = toggle.querySelectorAll('.view-btn');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.expertsViewMode);
    });

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchExpertsView(view);
      });
    });

    this.applyExpertsView();
  }

  switchExpertsView(view) {
    this.expertsViewMode = view;

    const toggle = document.getElementById('expertsViewToggle');
    if (toggle) {
      toggle.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });
    }

    chrome.storage.local.set({ expertsViewMode: view });

    this.applyExpertsView();
  }

  applyExpertsView() {
    const container = this.elements.expertsContainer;
    if (!container) return;

    container.classList.remove('view-grid', 'view-list');
    container.classList.add(`view-${this.expertsViewMode}`);
  }

  getExpertAvatarUrl(expert) {
    const icon = expert.icon;
    if (icon && icon.startsWith('http')) return icon;
    return this.generateExpertIcon(expert.name || 'expert');
  }

  generateExpertIcon(name) {
    const seed = name || 'expert';
    const style = 'adventurer';
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }

  // 刷新数据
  async refresh() {
    await this.loadData();
    if (this.currentPage === 'experts') {
      this.renderExpertsPage();
    }
  }
}

// 初始化Dashboard
let dashboard;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    dashboard = new Dashboard();
    dashboard.init();
    window.dashboard = dashboard;
  });
} else {
  dashboard = new Dashboard();
  dashboard.init();
  window.dashboard = dashboard;
}
