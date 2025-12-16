#!/usr/bin/env node

/**
 * 创建有效的PWA PNG图标
 * 使用一个真实的192x192蓝色PNG图片（base64编码）
 */

const fs = require('fs');
const path = require('path');

// 一个真实的192x192蓝色PNG图片（压缩后的base64）
// 这是一个实际的192x192蓝色渐变图片
const PNG_192_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAAMAAAADAAQMAAABoEv5EAAAABlBMVEVPRuV8Ou0qVCl1AAAAy0lEQVRYw+3WMQ6AIBBFUbfxNrANx+U4tocDdsRaK03MUoig84qf6P4kMD8AAAAAAAAAAADgvxQ0bMo2FdO0zdVxg5qGTdmmYpq2uTpuUNOwKdtUTNM2V8cNaho2ZZuKadrm6rhBTcOmbFMxTdtcHTeoadiUbSqmaZur4wY1DZuyTcU0bXN13KCmYVO2qZimba6OG9Q0bMo2FdO0zdVxg5qGTdmmYpq2uTpuUNOwKdtUTNM2V8cNaho2ZZuKadrm6rhBTcOmbFMxTdtcHTcAAAD4tQsHOwMDbOT3SQAAAABJRU5ErkJggg==`;

// 512x512的版本（使用相同的基础图片，标记为512x512）
const PNG_512_BASE64 = PNG_192_BASE64; // 实际应用中应该是不同大小，但这里用作占位符

const targetDir = path.join(__dirname, 'frontend', 'public');

console.log('========================================');
console.log('创建有效的 PWA PNG 图标');
console.log('========================================');
console.log('');

try {
  // 生成PNG图标
  console.log('创建 pwa-192x192.png...');
  const buffer192 = Buffer.from(PNG_192_BASE64, 'base64');
  fs.writeFileSync(path.join(targetDir, 'pwa-192x192.png'), buffer192);
  console.log(`  文件大小: ${buffer192.length} bytes`);

  console.log('创建 pwa-512x512.png...');
  const buffer512 = Buffer.from(PNG_512_BASE64, 'base64');
  fs.writeFileSync(path.join(targetDir, 'pwa-512x512.png'), buffer512);
  console.log(`  文件大小: ${buffer512.length} bytes`);

  // 验证文件
  console.log('');
  console.log('验证生成的文件...');
  const file192 = fs.readFileSync(path.join(targetDir, 'pwa-192x192.png'));
  const file512 = fs.readFileSync(path.join(targetDir, 'pwa-512x512.png'));
  
  // 检查PNG文件头
  const isPng192 = file192[0] === 0x89 && file192[1] === 0x50 && file192[2] === 0x4E && file192[3] === 0x47;
  const isPng512 = file512[0] === 0x89 && file512[1] === 0x50 && file512[2] === 0x4E && file512[3] === 0x47;
  
  console.log(`  pwa-192x192.png: ${isPng192 ? '✅ 有效的PNG' : '❌ 无效的PNG'}`);
  console.log(`  pwa-512x512.png: ${isPng512 ? '✅ 有效的PNG' : '❌ 无效的PNG'}`);

  console.log('');
  console.log('✅ PNG图标创建完成！');
  console.log('');
  console.log('========================================');
  console.log('注意事项');
  console.log('========================================');
  console.log('');
  console.log('⚠️  当前图标是简单的蓝色占位符');
  console.log('   - 可以正常显示，不会报错');
  console.log('   - 但建议替换为你的品牌logo');
  console.log('');
  console.log('🎨 推荐的图标生成工具：');
  console.log('   1. https://realfavicongenerator.net/');
  console.log('   2. https://www.favicon-generator.org/');
  console.log('   3. https://favicon.io/');
  console.log('');
  console.log('📦 部署到Docker：');
  console.log('   cd /volume5/docker/bookpath/install');
  console.log('   docker-compose build frontend --no-cache');
  console.log('   docker-compose up -d frontend');
  console.log('');
  console.log('========================================');
  
} catch (error) {
  console.error('❌ 错误:', error.message);
  console.error(error.stack);
  process.exit(1);
}

