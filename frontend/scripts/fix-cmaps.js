/**
 * 修复和验证 PDF.js CMap 文件
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDFJS_VERSION = '3.11.174';
const CMAPS_DIR = path.resolve(__dirname, '../public/pdfjs/cmaps');

// 关键的中文CMap文件
const criticalCMaps = [
  'UniGB-UCS2-H.bcmap',
  'UniGB-UCS2-V.bcmap',
  'UniGB-UTF16-H.bcmap',
  'UniGB-UTF16-V.bcmap',
  'GBK-EUC-H.bcmap',
  'GBK-EUC-V.bcmap',
];

// 下载文件
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode >= 400) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log('=== PDF.js CMap 文件修复和验证 ===\n');
  
  // 确保目录存在
  if (!fs.existsSync(CMAPS_DIR)) {
    fs.mkdirSync(CMAPS_DIR, { recursive: true });
  }
  
  // 检查所有文件
  console.log('检查现有文件...\n');
  const files = fs.readdirSync(CMAPS_DIR).filter(f => f.endsWith('.bcmap'));
  const fileStats = {};
  
  for (const file of files) {
    const filePath = path.join(CMAPS_DIR, file);
    const stats = fs.statSync(filePath);
    fileStats[file] = stats.size;
    
    if (stats.size < 1000) {
      console.log(`❌ ${file}: ${stats.size} bytes (损坏，将重新下载)`);
    } else if (stats.size < 10000) {
      console.log(`⚠️  ${file}: ${stats.size} bytes (可能不完整)`);
    } else {
      console.log(`✓  ${file}: ${stats.size} bytes`);
    }
  }
  
  console.log('\n=== 下载缺失或损坏的关键文件 ===\n');
  
  const cdnSources = [
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
  ];
  
  let downloaded = 0;
  let failed = 0;
  
  for (const file of criticalCMaps) {
    const filePath = path.join(CMAPS_DIR, file);
    const currentSize = fileStats[file] || 0;
    
    // 如果文件不存在或小于1000字节，需要下载
    if (!fs.existsSync(filePath) || currentSize < 1000) {
      console.log(`下载: ${file}...`);
      
      let success = false;
      for (const baseUrl of cdnSources) {
        const url = `${baseUrl}${file}`;
        try {
          await downloadFile(url, filePath);
          const newSize = fs.statSync(filePath).size;
          if (newSize > 1000) {
            console.log(`  ✓ 成功: ${file} (${newSize} bytes)`);
            success = true;
            downloaded++;
            break;
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          // 尝试下一个源
          continue;
        }
      }
      
      if (!success) {
        console.log(`  ✗ 失败: ${file} (所有CDN源都不可用)`);
        failed++;
      }
      
      // 延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log(`⏭  跳过: ${file} (已存在且完整)`);
    }
  }
  
  console.log('\n=== 最终验证 ===\n');
  
  let allOk = true;
  for (const file of criticalCMaps) {
    const filePath = path.join(CMAPS_DIR, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 1000) {
        console.log(`✓ ${file}: ${stats.size} bytes`);
      } else {
        console.log(`❌ ${file}: ${stats.size} bytes (仍然损坏)`);
        allOk = false;
      }
    } else {
      console.log(`❌ ${file}: 缺失`);
      allOk = false;
    }
  }
  
  console.log('\n=== 总结 ===');
  console.log(`新下载: ${downloaded} 个文件`);
  if (failed > 0) {
    console.log(`失败: ${failed} 个文件`);
  }
  
  if (allOk) {
    console.log('\n✓ 所有关键CMap文件完整！');
    console.log('PDF中文显示应该可以正常工作。');
  } else {
    console.log('\n⚠️  部分文件缺失或损坏，可能影响某些PDF的中文显示。');
    console.log('建议检查网络连接或手动下载缺失的文件。');
  }
}

main().catch(console.error);
