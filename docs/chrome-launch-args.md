# Chrome启动参数和Playwright配置建议

## 问题背景

在不激活标签页的情况下，AI平台（如豆包、千问、DeepSeek）无法正确返回消息。这是由于这些平台使用了各种懒加载机制来检测页面是否可见。

## Chrome启动参数

以下是推荐的Chrome启动参数，可以解决大部分懒加载问题：

### 基础参数（已尝试）
```bash
chrome.exe --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
```

### 增强参数集（推荐）
```bash
chrome.exe ^
  --disable-backgrounding-occluded-windows ^
  --disable-renderer-backgrounding ^
  --disable-features=CalculateNativeWinOcclusion ^
  --disable-features=IdleShutdown ^
  --disable-features=BlinkGenPropertyTrees ^
  --disable-features=Translate ^
  --disable-background-networking ^
  --disable-background-timer-throttling ^
  --disable-backgrounding-occluded-windows ^
  --disable-breakpad ^
  --disable-client-side-phishing-detection ^
  --disable-component-update ^
  --disable-default-apps ^
  --disable-domain-reliability ^
  --disable-features=AudioServiceOutOfProcess ^
  --disable-features=AutofillServerCommunication ^
  --disable-features=CertificateTransparencyComponent ^
  --disable-features=DialMediaRouteProvider ^
  --disable-features=FlashDeprecationWarning ^
  --disable-features=GlobalMediaControls ^
  --disable-features=InProductHelp ^
  --disable-features=MediaRouter ^
  --disable-features=OptimizationHints ^
  --disable-features=RecordingHUD ^
  --disable-features=ResizeObserver ^
  --disable-features=SpareRendererForSitePerProcess ^
  --disable-features=VizDisplayCompositor ^
  --disable-features=WakeLock ^
  --disable-hang-monitor ^
  --disable-ipc-flooding-protection ^
  --disable-popup-blocking ^
  --disable-prompt-on-repost ^
  --disable-renderer-backgrounding ^
  --disable-sync ^
  --disable-translate ^
  --metrics-recording-only ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-background-mode ^
  --disable-extensions ^
  --disable-gpu ^
  --disable-software-rasterizer ^
  --disable-dev-shm-usage ^
  --no-sandbox ^
  --disable-setuid-sandbox ^
  --disable-web-security ^
  --allow-running-insecure-content ^
  --disable-features=VizDisplayCompositor ^
  --disable-features=IsolateOrigins,site-per-process ^
  --single-process
```

### 最小参数集（推荐测试）
```bash
chrome.exe ^
  --disable-backgrounding-occluded-windows ^
  --disable-renderer-backgrounding ^
  --disable-features=CalculateNativeWinOcclusion,IdleShutdown ^
  --disable-background-timer-throttling ^
  --disable-background-networking ^
  --disable-features=SpareRendererForSitePerProcess ^
  --disable-features=WakeLock ^
  --no-first-run ^
  --no-default-browser-check
```

### 关键参数说明

| 参数 | 说明 |
|------|------|
| `--disable-backgrounding-occluded-windows` | 防止被遮挡的窗口进入后台模式 |
| `--disable-renderer-backgrounding` | 防止渲染器进入后台模式 |
| `--disable-features=CalculateNativeWinOcclusion` | 禁用窗口遮挡计算 |
| `--disable-features=IdleShutdown` | 禁用空闲时关闭 |
| `--disable-background-timer-throttling` | 禁用后台计时器节流 |
| `--disable-background-networking` | 禁用后台网络请求 |
| `--disable-features=SpareRendererForSitePerProcess` | 禁用备用渲染器 |
| `--disable-features=WakeLock` | 禁用屏幕唤醒锁定 |
| `--single-process` | 单进程模式（最激进） |

## Playwright配置

Playwright打开浏览器时没有这个问题，是因为Playwright默认使用了很多优化参数。以下是Playwright的推荐配置：

### JavaScript/TypeScript配置
```javascript
const { chromium } = require('playwright');

const browser = await chromium.launch({
  headless: false,
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,IdleShutdown',
    '--disable-background-timer-throttling',
    '--disable-features=SpareRendererForSitePerProcess',
    '--disable-features=WakeLock',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  // 持久化用户数据目录（可选）
  // userDataDir: './user-data-dir',
});

const context = await browser.newContext({
  viewport: null, // 使用默认窗口大小
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
});

const page = await context.newPage();
await page.goto('https://chat.deepseek.com');
```

### Python配置
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        args=[
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=CalculateNativeWinOcclusion,IdleShutdown',
            '--disable-background-timer-throttling',
            '--disable-features=SpareRendererForSitePerProcess',
            '--disable-features=WakeLock',
            '--no-first-run',
            '--no-default-browser-check',
        ]
    )
    context = browser.new_context(
        viewport=None,
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    )
    page = context.new_page()
    page.goto('https://chat.deepseek.com')
```

## 脚本注入方案

除了启动参数，我们还提供了一个增强的注入脚本 `utils/anti-lazy-load.js`，它会：

1. **覆盖Visibility API**：
   - `document.hidden` → `false`
   - `document.visibilityState` → `"visible"`

2. **拦截事件**：
   - 拦截 `visibilitychange` 事件监听器
   - 拦截 `freeze` 事件（Page Lifecycle API）

3. **覆盖其他API**：
   - `IntersectionObserver`：元素始终可见
   - `requestIdleCallback`：立即执行，不等待空闲
   - `document.hasFocus()`：始终返回 `true`
   - `window.onfocus/onblur`：阻止blur设置

4. **模拟用户活动**：
   - 每5秒触发一次鼠标移动事件
   - 使用 `requestAnimationFrame` 保持页面活跃

5. **针对框架优化**：
   - React调度器重置（豆包使用React）
   - 限制 `setTimeout/setInterval` 最大延迟为1000ms

## 各平台特殊处理

### DeepSeek
- 使用Visibility API检测
- **解决方案**：基础注入脚本即可

### 豆包 (Doubao)
- 使用React + IntersectionObserver
- 可能使用requestIdleCallback
- **解决方案**：增强注入脚本 + React调度器重置

### 千问 (Qianwen)
- 可能使用Page Lifecycle API
- 可能使用网络状态检测
- **解决方案**：增强注入脚本 + freeze事件拦截

### Kimi
- 无特殊检测机制
- **解决方案**：无需特殊处理

## 测试步骤

1. **测试Chrome参数**：
   ```bash
   # 使用最小参数集启动Chrome
   chrome.exe --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion,IdleShutdown --disable-background-timer-throttling --no-first-run
   ```

2. **测试脚本注入**：
   - 确保扩展已正确安装
   - 打开AI平台网站
   - 在控制台检查是否有 `[Anti-Lazy-Load]` 日志

3. **测试发送消息**：
   - 在chat.html中创建包含多个AI的会话
   - 发送消息
   - 切换到其他标签页（不激活AI平台标签页）
   - 等待回复

## 调试方法

### 1. 检查Visibility API状态
```javascript
// 在AI平台页面控制台执行
console.log('hidden:', document.hidden);
console.log('visibilityState:', document.visibilityState);
```

### 2. 检查事件监听器
```javascript
// 检查是否有visibilitychange监听器
console.log(getEventListeners(document));
```

### 3. 检查页面状态
```javascript
// 检查是否有后台检测
console.log('hasFocus:', document.hasFocus());
console.log('isFrozen:', document.wasDiscarded || false);
```

## 故障排除

### 如果脚本注入失败
1. 检查manifest.json中是否正确配置
2. 确保脚本路径正确
3. 在页面控制台检查是否有加载错误

### 如果Chrome参数无效
1. 尝试使用完整参数集
2. 检查Chrome版本是否支持某些参数
3. 尝试使用 `--single-process`（最激进）

### 如果Playwright可以但Chrome不行
1. Playwright默认使用了更多优化参数
2. 对比Playwright和Chrome的启动参数差异
3. 逐步添加参数测试

## 最佳实践

1. **组合使用**：Chrome启动参数 + 脚本注入效果最佳
2. **渐进式测试**：先测试最小参数集，再逐步添加
3. **平台定制**：为不同平台定制不同的注入脚本
4. **持续监控**：各平台可能更新检测机制，需要持续适配
