/**
 * 格式化 manifest.webmanifest 文件
 * 将压缩的 JSON 格式化为可读的格式
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 获取当前脚本所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// manifest 文件路径（相对于项目根目录）
const manifestPath = join(__dirname, '..', 'dist', 'manifest.webmanifest');

try {
  // 检查 manifest 文件是否存在
  if (!existsSync(manifestPath)) {
    console.warn('⚠️ manifest.webmanifest 文件不存在，跳过格式化');
    process.exit(0);
  }
  
  // 读取 manifest 文件
  const manifestContent = readFileSync(manifestPath, 'utf-8');
  
  // 解析 JSON
  const manifest = JSON.parse(manifestContent);
  
  // 格式化为可读的 JSON（2 空格缩进）
  const formattedContent = JSON.stringify(manifest, null, 2);
  
  // 写入格式化后的内容
  writeFileSync(manifestPath, formattedContent, 'utf-8');
  
  console.log('✅ manifest.webmanifest 已格式化');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.warn('⚠️ manifest.webmanifest 文件不存在，跳过格式化');
    process.exit(0);
  } else {
    console.error('❌ 格式化 manifest.webmanifest 失败:', error.message);
    // 在构建环境中，不要因为格式化失败而中断构建
    console.warn('⚠️ 继续构建，忽略格式化错误');
    process.exit(0);
  }
}

