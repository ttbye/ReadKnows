import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 需要处理的目录
const dirs = [
  'src/pages',
  'src/components',
  'src/utils'
];

// 递归获取所有TypeScript文件
function getAllTsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...getAllTsFiles(fullPath));
    } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }

  return files;
}

// 转换PUT方法
function convertPutCalls(content) {
  // 匹配 api.put( 开头的调用
  const putRegex = /api\.put\(\s*`([^`]+)`\s*,?\s*({[^}]*})?\s*\)/g;

  return content.replace(putRegex, (match, url, params) => {
    if (params) {
      // 如果有参数，添加 _method: 'PUT' 到参数对象中
      const paramsContent = params.slice(1, -1); // 去掉 {}
      return `api.post(\`${url}\`, { _method: 'PUT', ${paramsContent} })`;
    } else {
      // 如果没有参数，创建新的参数对象
      return `api.post(\`${url}\`, { _method: 'PUT' })`;
    }
  });
}

// 转换DELETE方法
function convertDeleteCalls(content) {
  // 匹配 api.delete( 开头的调用
  const deleteRegex = /api\.delete\(\s*`([^`]+)`(?:\s*,?\s*({[^}]*}))?\s*\)/g;

  return content.replace(deleteRegex, (match, url, params) => {
    if (params) {
      // 如果有参数，添加 _method: 'DELETE' 到参数对象中
      const paramsContent = params.slice(1, -1); // 去掉 {}
      return `api.post(\`${url}\`, { _method: 'DELETE', ${paramsContent} })`;
    } else {
      // 如果没有参数，创建新的参数对象
      return `api.post(\`${url}\`, { _method: 'DELETE' })`;
    }
  });
}

// 处理单个文件
function processFile(filePath) {
  try {
    console.log(`Processing: ${filePath}`);
    let content = fs.readFileSync(filePath, 'utf8');

    // 先转换PUT调用，再转换DELETE调用
    content = convertPutCalls(content);
    content = convertDeleteCalls(content);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Updated: ${filePath}`);
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
  }
}

// 主函数
function main() {
  console.log('开始转换API方法调用...');

  const allFiles = [];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      allFiles.push(...getAllTsFiles(dir));
    }
  }

  console.log(`找到 ${allFiles.length} 个TypeScript文件`);

  for (const file of allFiles) {
    processFile(file);
  }

  console.log('转换完成！');
}

// 直接运行主函数
main();