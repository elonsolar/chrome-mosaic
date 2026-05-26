# Project Context: Free AI Extension Refactoring

## Goal
Refactor model configuration to platform-level architecture (baseUrl/apiKey configured once per platform, not per model)

## Key Decisions
- No data migration from legacy models (fresh start)
- All management in Dashboard, no sidepanel (deleted)
- FlowExecutor: removed 3-iteration loop (was unreliable)
- Model selector display: "模型名称 (平台)" format
- Platform architecture: baseUrl/apiKey stored once per platform, shared by all API models

## Critical Fixes Applied
1. **Syntax error in models-tab.js** (2026-05-25): stray HTML (duplicate template literal) at lines 90-131 outside `render()` function — caused "Unexpected token '<'" preventing models-tab.js from loading. Fixed by removing duplicate block.

## Known Issues
- CSP violation in prompts.html (inline script, manifests as console error only)
- ModelsTab initialization timing: `#modelsTabContainer` may not exist during dashboard init on first load

## Test Data
4 platforms in storage: OpenAI, Kimi, DeepSeek, 豆包

## Relevant Files
- `dashboard/components/models-tab.js`: ModelsTab class (600 lines, includes render/initElements/loadPlatforms)
- `dashboard/components/models-tab.css`: Platform management styles (modal, platform-option, etc.)
- `dashboard/dashboard.html`: Main dashboard (includes #modelsFab, script refs)
- `dashboard/dashboard.js`: Router (navigateTo('models') calls render() + loadPlatforms())
- `dashboard/components/prompts.html/js`: Restored from git (prompts page)
- `config/providers.config.js`: 7 provider definitions

## Launching Browser for Testing

```javascript
const browser = await chromium.launchPersistentContext('C:\\Users\\64162\\AppData\\Local\\Google\\Chrome\\User Data\\Default', {
  headless: false
});
const page = await browser.newPage();
await page.goto('chrome-extension://anohnmmabfdpckoiidlibmiookpcldla/chat/chat.html');
```
