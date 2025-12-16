/**
 * 使用Canvas生成PWA图标
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'frontend', 'public');

// 确保public目录存在
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // 背景色（深蓝紫色）
  ctx.fillStyle = '#4F46E5';
  ctx.fillRect(0, 0, size, size);
  
  // 绘制书本图标
  const bookWidth = size * 0.5;
  const bookHeight = size * 0.6;
  const bookX = (size - bookWidth) / 2;
  const bookY = (size - bookHeight) / 2;
  
  // 书的主体（白色）
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(bookX, bookY, bookWidth, bookHeight);
  
  // 书脊（深色）
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(bookX, bookY, bookWidth * 0.15, bookHeight);
  
  // 页面线条
  ctx.strokeStyle = '#E0E7FF';
  ctx.lineWidth = size * 0.01;
  for (let i = 1; i <= 3; i++) {
    const lineY = bookY + (bookHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(bookX + bookWidth * 0.2, lineY);
    ctx.lineTo(bookX + bookWidth * 0.9, lineY);
    ctx.stroke();
  }
  
  // 添加文字 "书"
  const fontSize = size * 0.35;
  ctx.font = `bold ${fontSize}px Arial, "Noto Sans SC", sans-serif`;
  ctx.fillStyle = '#4F46E5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('书', size / 2 + bookWidth * 0.05, size / 2);
  
  // 保存图片
  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(publicDir, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ 已生成: ${filename} (${size}x${size})`);
}

console.log('===================================');
console.log('正在生成PWA图标...');
console.log('===================================');
console.log('');

try {
  // 生成各种尺寸的图标
  generateIcon(192, 'pwa-192x192.png');
  generateIcon(512, 'pwa-512x512.png');
  generateIcon(180, 'apple-touch-icon.png');
  generateIcon(48, 'favicon-48x48.png');
  
  console.log('');
  console.log('✅ 所有图标已生成！');
  console.log('   位置:', publicDir);
  console.log('');
  console.log('📝 生成的文件：');
  console.log('   - pwa-192x192.png');
  console.log('   - pwa-512x512.png');
  console.log('   - apple-touch-icon.png');
  console.log('   - favicon-48x48.png');
  console.log('');
  console.log('🚀 下一步：');
  console.log('   1. 重新构建前端: cd frontend && npm run build');
  console.log('   2. 重新部署: docker-compose build frontend');
  console.log('   3. 重启服务: docker-compose up -d');
  console.log('');
} catch (error) {
  console.error('❌ 生成图标失败:', error.message);
  console.log('');
  console.log('💡 解决方案：');
  console.log('   1. 确保已安装canvas: cd backend && npm install');
  console.log('   2. 或使用在线工具生成: https://realfavicongenerator.net/');
  console.log('   3. 将生成的图标放到 frontend/public/ 目录');
}

console.log('===================================');
