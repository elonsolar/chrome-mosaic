# 图标目录使用说明

## 设计规范

图标使用 DeepSeek 风格设计：
- 背景：`#3964FE` 圆角矩形（rx=28 for 128x128）
- 图案：白色星芒（4 角星形）
- 无渐变、无文字

## 文件说明

- `icon.svg` - SVG 源图标（128x128 视口），建议以此文件为准
- `icon16.png` - 16x16 像素图标（浏览器工具栏）
- `icon48.png` - 48x48 像素图标（扩展管理页面）
- `icon128.png` - 128x128 像素图标（扩展详情页）

## 如何重新生成 PNG 图标

如果修改了 `icon.svg`，需要重新生成 PNG 文件。

### 使用 ImageMagick

```bash
magick icon.svg -resize 16x16 icon16.png
magick icon.svg -resize 48x48 icon48.png
magick icon.svg -resize 128x128 icon128.png
```

### 使用在线工具

将 `icon.svg` 上传到任意 SVG 转 PNG 在线工具，分别导出 16x16、48x48、128x128 尺寸。

## 验证图标

图标添加成功后，插件应该显示：
- 浏览器工具栏中的图标
- 插件列表中的图标
- 插件详情页的大图标
- 浏览器标签页的 favicon
