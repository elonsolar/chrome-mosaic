
#  浏览器操作指南


1. 连接用户使用的浏览器 （默认）
```
 const browser = await chromium.connectOverCDP('http://localhost:9222');
```

2. 打开新的浏览器,
```
playwright_browser_navigate 
```

# manifest.json 版本号规则

- 格式: `主版本.次版本.补丁` (SemVer)
- **补丁** (x.x.N): Bug修复、小调整
- **次版本** (x.N.0): 新增功能、行为改进
- **主版本** (N.0.0): 架构变更、不兼容改动
- 任何改动涉及到扩展发布时，必须同步更新 `manifest.json` 的 `version` 字段
