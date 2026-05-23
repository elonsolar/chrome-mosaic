const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    console.log('导航到Coze工作流页面...');
    await page.goto('https://www.coze.cn/space/7470833256154972186/project-ide/7587383162188070912/workflow/7641896691621462051');
    
    // 等待页面加载
    await page.waitForTimeout(5000);
    
    // 查找LLM节点
    console.log('查找LLM节点...');
    const llmNode = await page.locator('[data-node-type="llm"]').first();
    if (await llmNode.count() > 0) {
      console.log('找到LLM节点');
      
      // 查找运行按钮
      const runBtn = await page.locator('.run-button, [class*="run"], svg').filter({ hasText: '' }).first();
      if (await runBtn.count() > 0) {
        console.log('找到运行按钮，点击...');
        await runBtn.click();
        await page.waitForTimeout(2000);
      }
    }
    
    // 检查侧边栏运行面板
    console.log('\n=== 检查侧边栏运行面板 ===');
    const sidebarPanel = await page.locator('.sidebar-panel, .panel, [class*="panel"]').first();
    
    if (await sidebarPanel.count() > 0) {
      const panelHtml = await sidebarPanel.innerHTML();
      console.log('侧边栏面板HTML:');
      console.log(panelHtml.substring(0, 5000));
      
      // 查找标题
      const title = await page.locator('.panel-title, [class*="title"]').first();
      if (await title.count() > 0) {
        console.log('\n标题文本:', await title.textContent());
      }
      
      // 查找输入变量区域
      const inputSection = await page.locator('[class*="input"], [class*="variable"]').first();
      if (await inputSection.count() > 0) {
        console.log('\n输入变量区域HTML:');
        console.log(await inputSection.innerHTML());
      }
      
      // 查找运行按钮
      const executeBtn = await page.locator('button:has-text("运行"), [class*="run"]').all();
      console.log('\n找到', executeBtn.length, '个运行相关按钮');
    }
    
    console.log('\n按Enter键关闭浏览器...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('发生错误:', error.message);
  } finally {
    await browser.close();
  }
})();
