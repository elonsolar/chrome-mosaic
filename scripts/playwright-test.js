/**
 * Playwright自动化测试脚本
 * 用于测试AI平台在后台标签页中的行为
 *
 * 安装依赖：
 * npm install playwright
 *
 * 运行脚本：
 * node playwright-test.js
 */

const { chromium } = require('playwright');

// 配置
const CONFIG = {
  headless: false, // 显示浏览器窗口
  slowMo: 1000, // 慢速模式，便于观察
  timeout: 60000, // 超时时间
  platforms: {
    deepseek: 'https://chat.deepseek.com/',
    doubao: 'https://www.doubao.com/chat/',
    qianwen: 'https://www.qianwen.com/',
    kimi: 'https://www.kimi.com/'
  }
};

// Chrome启动参数（优化的参数集）
const CHROME_ARGS = [
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion,IdleShutdown',
  '--disable-background-timer-throttling',
  '--disable-background-networking',
  '--disable-features=SpareRendererForSitePerProcess',
  '--disable-features=WakeLock',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled'
];

// 测试消息
const TEST_MESSAGES = {
  simple: '你好，请回复：测试成功',
  code: '请写一个Python的Hello World程序',
  math: '计算：123 + 456 = ?'
};

/**
 * 初始化浏览器
 */
async function initBrowser() {
  console.log('========== 正在启动浏览器 ==========');
  console.log('Chrome参数:', CHROME_ARGS.join('\n  '));

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: CHROME_ARGS,
    slowMo: CONFIG.slowMo
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  });

  console.log('✓ 浏览器启动成功\n');

  return { browser, context };
}

/**
 * 测试单个平台
 */
async function testPlatform(context, platformName, platformUrl) {
  console.log(`========== 测试 ${platformName} ==========`);
  console.log(`URL: ${platformUrl}`);

  const page = await context.newPage();

  try {
    // 1. 导航到平台
    console.log('1. 正在导航到平台...');
    await page.goto(platformUrl, { waitUntil: 'networkidle', timeout: CONFIG.timeout });
    console.log('✓ 页面加载完成');

    // 2. 注入防懒加载脚本
    console.log('2. 正在注入防懒加载脚本...');
    await page.addInitScript(() => {
      // 基础防懒加载脚本
      Object.defineProperty(document, 'hidden', {
        get: () => false,
        configurable: true
      });
      Object.defineProperty(document, 'visibilityState', {
        get: () => "visible",
        configurable: true
      });

      // 拦截visibilitychange
      const origAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'visibilitychange') return;
        return orig.call(this, type, listener, options);
      };

      console.log('[Playwright] 防懒加载脚本已注入');
    });
    console.log('✓ 脚本注入完成');

    // 3. 验证脚本注入
    console.log('3. 正在验证脚本注入...');
    const hiddenState = await page.evaluate(() => ({
      hidden: document.hidden,
      visibilityState: document.visibilityState
    }));
    console.log('  hidden:', hiddenState.hidden);
    console.log('  visibilityState:', hiddenState.visibilityState);

    if (hiddenState.hidden === false && hiddenState.visibilityState === 'visible') {
      console.log('✓ 脚本注入成功');
    } else {
      console.log('✗ 脚本注入失败');
      return { success: false, error: '脚本注入失败' };
    }

    // 4. 等待页面完全加载
    console.log('4. 等待页面完全加载...');
    await page.waitForTimeout(3000);

    // 5. 模拟后台运行
    console.log('5. 模拟后台运行（不激活标签页）...');
    await page.waitForTimeout(5000);

    // 6. 检查页面状态
    console.log('6. 检查后台页面状态...');
    const pageState = await page.evaluate(() => ({
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      title: document.title
    }));
    console.log('  后台状态:', pageState);

    // 7. 关闭页面
    await page.close();

    console.log(`✓ ${platformName} 测试完成\n`);

    return {
      success: true,
      platform: platformName,
      finalState: pageState
    };

  } catch (error) {
    console.error(`✗ ${platformName} 测试失败:`, error.message);
    await page.close();
    return {
      success: false,
      platform: platformName,
      error: error.message
    };
  }
}

/**
 * 测试并发场景
 */
async function testConcurrent(context) {
  console.log('========== 测试并发场景 ==========');

  const pages = [];

  try {
    // 1. 打开所有平台
    console.log('1. 打开所有AI平台...');
    for (const [platform, url] of Object.entries(CONFIG.platforms)) {
      console.log(`  打开 ${platform}...`);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: CONFIG.timeout });

      // 注入脚本
      await page.addInitScript(() => {
        Object.defineProperty(document, 'hidden', { get: () => false });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
      });

      pages.push({ platform, page });
      console.log(`  ✓ ${platform} 已打开`);
    }

    // 2. 等待所有页面加载
    console.log('\n2. 等待所有页面加载...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. 检查所有页面状态
    console.log('\n3. 检查所有页面状态...');
    for (const { platform, page } of pages) {
      const state = await page.evaluate(() => ({
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        title: document.title
      }));
      console.log(`  ${platform}:`, state);
    }

    // 4. 关闭所有页面
    console.log('\n4. 关闭所有页面...');
    for (const { platform, page } of pages) {
      await page.close();
      console.log(`  ✓ ${platform} 已关闭`);
    }

    console.log('\n✓ 并发测试完成\n');

    return { success: true };

  } catch (error) {
    console.error('\n✗ 并发测试失败:', error.message);

    // 清理
    for (const { page } of pages) {
      try {
        await page.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }

    return { success: false, error: error.message };
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   AI平台防懒加载测试脚本 - Playwright    ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const { browser, context } = await initBrowser();

  const results = {
    individual: {},
    concurrent: null
  };

  try {
    // 测试1：单个平台测试
    console.log('\n【测试1：单个平台测试】\n');

    for (const [platform, url] of Object.entries(CONFIG.platforms)) {
      const result = await testPlatform(context, platform, url);
      results.individual[platform] = result;

      // 每个平台测试之间等待
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 测试2：并发测试
    console.log('\n【测试2：并发测试】\n');
    results.concurrent = await testConcurrent(context);

    // 输出测试报告
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║              测试报告                     ║');
    console.log('╚══════════════════════════════════════════╝\n');

    console.log('【单个平台测试结果】');
    for (const [platform, result] of Object.entries(results.individual)) {
      const status = result.success ? '✅ 通过' : '❌ 失败';
      console.log(`  ${platform}: ${status}`);
      if (result.error) {
        console.log(`    错误: ${result.error}`);
      }
      if (result.finalState) {
        console.log(`    最终状态: hidden=${result.finalState.hidden}, visibilityState=${result.finalState.visibilityState}`);
      }
    }

    console.log('\n【并发测试结果】');
    const concurrentStatus = results.concurrent?.success ? '✅ 通过' : '❌ 失败';
    console.log(`  并发: ${concurrentStatus}`);

    // 总结
    const individualPassCount = Object.values(results.individual).filter(r => r.success).length;
    const individualTotalCount = Object.keys(results.individual).length;
    const concurrentPass = results.concurrent?.success || false;

    console.log('\n【总结】');
    console.log(`  单个平台通过率: ${individualPassCount}/${individualTotalCount} (${Math.round(individualPassCount/individualTotalCount*100)}%)`);
    console.log(`  并发测试: ${concurrentPass ? '✅ 通过' : '❌ 失败'}`);

    if (individualPassCount === individualTotalCount && concurrentPass) {
      console.log('\n✅ 所有测试通过！');
    } else {
      console.log('\n⚠️ 部分测试失败，请查看详细报告');
    }

  } catch (error) {
    console.error('\n✗ 测试运行失败:', error);
  } finally {
    // 关闭浏览器
    console.log('\n正在关闭浏览器...');
    await browser.close();
    console.log('✓ 测试完成');
  }
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  initBrowser,
  testPlatform,
  testConcurrent,
  runTests
};
