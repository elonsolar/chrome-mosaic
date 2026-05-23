const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\64162\\source\\ai\\free-ai-refactor\\dashboard\\dashboard.html';

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('读取文件失败:', err);
    return;
  }

  const result = data.replace(/<span class="fab-label">[^<]*<\/span>\s*/g, '');

  fs.writeFile(filePath, result, 'utf8', (err) => {
    if (err) {
      console.error('写入文件失败:', err);
      return;
    }
    console.log('成功删除所有fab-label标签');
  });
});
