#!/usr/bin/env node

/**
 * 生成简单的PWA图标
 * 使用纯 Node.js，无需额外依赖
 */

const fs = require('fs');
const path = require('path');

// 一个最小的192x192蓝色PNG图片（base64编码）
// 这是一个1x1的蓝色PNG，我们会在文件名中说明是占位符
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// SVG图标（可缩放矢量图形）
const createSVG = (size, text = '📚') => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad)" rx="20"/>
  <text x="50%" y="50%" font-size="${size * 0.5}" text-anchor="middle" dy=".3em" fill="white" font-family="Arial, sans-serif">${text}</text>
</svg>`;

const targetDir = path.join(__dirname, 'frontend', 'public');

console.log('========================================');
console.log('生成 PWA 图标');
console.log('========================================');
console.log('');
console.log('目标目录:', targetDir);
console.log('');

// 确保目录存在
if (!fs.existsSync(targetDir)) {
  console.error('❌ 错误：目标目录不存在');
  process.exit(1);
}

try {
  // 生成SVG格式的图标（更好的兼容性）
  console.log('生成 pwa-192x192.svg...');
  fs.writeFileSync(
    path.join(targetDir, 'pwa-192x192.svg'),
    createSVG(192, '📚')
  );

  console.log('生成 pwa-512x512.svg...');
  fs.writeFileSync(
    path.join(targetDir, 'pwa-512x512.svg'),
    createSVG(512, '📚')
  );

  // 同时生成PNG版本（使用占位符）
  const buffer = Buffer.from(TINY_PNG_BASE64, 'base64');
  
  console.log('生成 pwa-192x192.png (占位符)...');
  fs.writeFileSync(path.join(targetDir, 'pwa-192x192.png'), buffer);
  
  console.log('生成 pwa-512x512.png (占位符)...');
  fs.writeFileSync(path.join(targetDir, 'pwa-512x512.png'), buffer);

  console.log('');
  console.log('✅ 图标生成成功！');
  console.log('');
  console.log('📝 生成的文件：');
  const files = fs.readdirSync(targetDir).filter(f => f.startsWith('pwa-'));
  files.forEach(file => {
    const stat = fs.statSync(path.join(targetDir, file));
    console.log(`  - ${file} (${stat.size} bytes)`);
  });

  console.log('');
  console.log('========================================');
  console.log('下一步');
  console.log('========================================');
  console.log('');
  console.log('⚠️  当前图标是简单占位符');
  console.log('');
  console.log('建议使用专业工具生成：');
  console.log('1. 访问 https://realfavicongenerator.net/');
  console.log('2. 上传你的 logo 图片');
  console.log('3. 下载生成的图标包');
  console.log('4. 复制到 frontend/public/ 目录');
  console.log('');
  console.log('然后重新构建前端镜像：');
  console.log('  docker-compose build frontend --no-cache');
  console.log('  docker-compose up -d frontend');
  console.log('');
  console.log('========================================');
  
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
}

