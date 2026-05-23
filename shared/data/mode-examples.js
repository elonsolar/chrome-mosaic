/**
 * Mode Examples 数据
 * 从 dashboard.js 提取，供 chat.html 使用
 */

export const MODE_EXAMPLES = {
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
