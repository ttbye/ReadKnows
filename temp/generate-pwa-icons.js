/**
 * 生成PWA图标
 * 需要安装: npm install -g sharp-cli
 * 或使用在线工具生成
 */

const fs = require('fs');
const path = require('path');

console.log('===================================');
console.log('PWA图标生成指南');
console.log('===================================');
console.log('');
console.log('需要生成以下图标：');
console.log('  - pwa-192x192.png');
console.log('  - pwa-512x512.png');
console.log('  - apple-touch-icon.png (180x180)');
console.log('  - favicon.ico');
console.log('');
console.log('📝 方法1：使用在线工具（推荐）');
console.log('  1. 访问: https://realfavicongenerator.net/');
console.log('  2. 上传一张正方形图片（推荐512x512或更大）');
console.log('  3. 选择PWA选项');
console.log('  4. 下载生成的图标包');
console.log('  5. 将图标复制到 frontend/public/ 目录');
console.log('');
console.log('📝 方法2：使用本地工具');
console.log('  如果你有一张源图片（logo.png），运行：');
console.log('  ');
console.log('  # 安装sharp-cli');
console.log('  npm install -g sharp-cli');
console.log('  ');
console.log('  # 生成图标');
console.log('  cd frontend/public');
console.log('  sharp -i logo.png -o pwa-192x192.png resize 192 192');
console.log('  sharp -i logo.png -o pwa-512x512.png resize 512 512');
console.log('  sharp -i logo.png -o apple-touch-icon.png resize 180 180');
console.log('');
console.log('📝 方法3：使用临时图标（快速测试）');
console.log('  我将为你创建简单的SVG图标作为临时方案...');
console.log('');

// 创建简单的SVG图标
const svgIcon = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#4F46E5"/>
  <text x="256" y="280" font-family="Arial, sans-serif" font-size="200" fill="white" text-anchor="middle" font-weight="bold">书</text>
</svg>`;

const publicDir = path.join(__dirname, 'frontend', 'public');
const svgPath = path.join(publicDir, 'icon.svg');

try {
  fs.writeFileSync(svgPath, svgIcon);
  console.log('✅ 已创建 icon.svg');
  console.log('   位置:', svgPath);
  console.log('');
  console.log('🎨 下一步：');
  console.log('  1. 在浏览器中打开 icon.svg');
  console.log('  2. 截图并保存为PNG格式');
  console.log('  3. 使用在线工具转换为所需尺寸');
  console.log('  4. 或者使用本地图片编辑工具');
} catch (error) {
  console.error('创建SVG失败:', error.message);
}

console.log('');
console.log('===================================');
