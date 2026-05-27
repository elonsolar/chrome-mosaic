# GitHub 仓库重命名指南

## 步骤 1: 重命名 GitHub 仓库

1. 访问 https://github.com/elonsolar/free-ai/settings
2. 在 "Repository name" 输入框中，将 `free-ai` 改为 `mosaic`
3. 点击 "Rename" 按钮确认

**注意**：GitHub 会自动重定向旧地址到新地址，所以现有链接不会失效。

## 步骤 2: 更新本地 Git 配置

```bash
# 进入项目目录
cd C:\Users\64162\source\ai

# 重命名本地文件夹
cd ..
rename free-ai-refactor mosaic

# 进入新目录
cd mosaic

# 更新远程仓库地址
git remote set-url origin https://github.com/elonsolar/mosaic.git

# 验证远程地址
git remote -v
```

## 步骤 3: 更新本地 Git 工作树

如果使用 git worktree（根据 .git 文件显示）：

```bash
# 查看现有工作树
git worktree list

# 删除旧的工作树
git worktree remove free-ai-refactor

# 创建新的工作树（如果需要）
git worktree add <新路径> <分支名>
```

## 步骤 4: 提交更改

```bash
# 查看所有更改
git status

# 添加所有更改
git add .

# 提交更改
git commit -m "chore: 重命名项目为 Mosaic

- 更新所有文件中的项目名称和 logo
- 创建新的马赛克风格 logo
- 更新 README 和文档
- 更新 package.json 项目信息"
```

## 步骤 5: 推送到 GitHub

```bash
# 推送到新仓库
git push origin main
```

## 步骤 6: 验证

1. 访问 https://github.com/elonsolar/mosaic 确认所有文件已更新
2. 在浏览器中重新加载扩展，查看新 logo 和名称
3. 测试所有功能是否正常

## 步骤 7: 生成图标（重要）

1. 在浏览器中打开 `tools/icon-generator.html`
2. 点击"下载所有图标"按钮
3. 将下载的三个 PNG 文件保存到 `icons/` 目录：
   - icon16.png
   - icon48.png
   - icon128.png

## 注意事项

- ⚠️ 所有远程链接（如 GitHub README 中的链接）需要更新
- ⚠️ 如果有其他文档引用了旧仓库名，需要一并更新
- ⚠️ 建议在 GitHub 仓库的 Settings → Pages 中检查自定义域名设置
