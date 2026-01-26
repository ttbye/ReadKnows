/**
 * 下载 PDF.js 资源到本地
 * 包括 worker、cmaps 和 standard_fonts
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const PDFJS_VERSION = '3.11.174';
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PDFJS_DIR = path.join(PUBLIC_DIR, 'pdfjs');
const WORKER_DIR = path.join(PDFJS_DIR, 'worker');
const CMAPS_DIR = path.join(PDFJS_DIR, 'cmaps');
const STANDARD_FONTS_DIR = path.join(PDFJS_DIR, 'standard_fonts');

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ 创建目录: ${dir}`);
  }
}

// 下载文件
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    console.log(`下载: ${url}`);
    console.log(`保存到: ${dest}`);

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlink(dest, () => {});
          return downloadFile(redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href, dest)
            .then(resolve)
            .catch(reject);
        }
      }

      if (response.statusCode && response.statusCode >= 400) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`下载失败: ${response.statusCode} ${response.statusMessage || ''}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ 下载完成: ${path.basename(dest)}`);
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });

    request.setTimeout(60000, () => {
      request.destroy();
      file.close();
      fs.unlink(dest, () => {});
      reject(new Error('下载超时'));
    });
  });
}

// 从 node_modules 复制文件
function copyFromNodeModules(src, dest) {
  return new Promise((resolve, reject) => {
    try {
      const nodeModulesPath = path.resolve(__dirname, '../node_modules', src);
      if (fs.existsSync(nodeModulesPath)) {
        fs.copyFileSync(nodeModulesPath, dest);
        console.log(`✓ 复制完成: ${path.basename(dest)}`);
        resolve();
      } else {
        reject(new Error(`文件不存在: ${nodeModulesPath}`));
      }
    } catch (error) {
      reject(error);
    }
  });
}

// 下载 worker 文件
async function downloadWorker() {
  ensureDir(WORKER_DIR);
  
  const workerDest = path.join(WORKER_DIR, 'pdf.worker.min.js');
  
  // 先尝试从 node_modules 复制
  const nodeModulesPaths = [
    'pdfjs-dist/build/pdf.worker.min.js',
    'pdfjs-dist/build/pdf.worker.mjs',
    'pdfjs-dist/legacy/build/pdf.worker.min.js',
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
  ];
  
  let copied = false;
  for (const srcPath of nodeModulesPaths) {
    try {
      await copyFromNodeModules(srcPath, workerDest);
      console.log(`✓ Worker 文件已从 node_modules 复制: ${srcPath}`);
      copied = true;
      break;
    } catch (error) {
      // 继续尝试下一个路径
    }
  }
  
  // 如果 node_modules 中没有，从 CDN 下载
  if (!copied) {
    console.log('从 node_modules 复制失败，尝试从 CDN 下载...');
    const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
    try {
      await downloadFile(workerUrl, workerDest);
    } catch (downloadError) {
      // 尝试备用 CDN
      const altUrl = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;
      console.log('尝试备用 CDN...');
      await downloadFile(altUrl, workerDest);
    }
  }
}

// 下载 cmaps
async function downloadCMaps() {
  ensureDir(CMAPS_DIR);
  
  console.log('\n下载 CMap 文件...');
  
  // 先尝试从 node_modules 复制整个 cmaps 目录
  const nodeModulesCMaps = path.resolve(__dirname, '../node_modules/pdfjs-dist/cmaps');
  if (fs.existsSync(nodeModulesCMaps)) {
    console.log('从 node_modules 复制 cmaps 目录...');
    const files = fs.readdirSync(nodeModulesCMaps);
    let copiedCount = 0;
    for (const file of files) {
      const src = path.join(nodeModulesCMaps, file);
      const dest = path.join(CMAPS_DIR, file);
      if (fs.statSync(src).isFile()) {
        // 跳过已存在的文件
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          copiedCount++;
        }
      }
    }
    console.log(`✓ 已复制 ${copiedCount} 个 CMap 文件从 node_modules`);
    if (copiedCount > 0) {
      return; // 成功从 node_modules 复制，不需要从 CDN 下载
    }
  }
  
  // 如果 node_modules 中没有或复制失败，从 CDN 下载关键文件
  console.log('从 CDN 下载关键 cmaps...');
  // 完整的中文CMap文件列表（包括水平和垂直文本）
  // 按重要性排序：最常用的在前
  const cmapFiles = [
    // Unicode GB编码（最常用，最重要）
    'UniGB-UCS2-H.bcmap',   // 水平文本（UCS-2编码）- 最常用
    'UniGB-UCS2-V.bcmap',   // 垂直文本（UCS-2编码）
    'UniGB-UTF16-H.bcmap',  // 水平文本（UTF-16编码）
    'UniGB-UTF16-V.bcmap',  // 垂直文本（UTF-16编码）
    'UniGB-UTF8-H.bcmap',   // 水平文本（UTF-8编码）
    'UniGB-UTF8-V.bcmap',   // 垂直文本（UTF-8编码）
    'UniGB-UTF32-H.bcmap',  // 水平文本（UTF-32编码）
    'UniGB-UTF32-V.bcmap',  // 垂直文本（UTF-32编码）
    // GBK编码（GB2312扩展）
    'GBK-EUC-H.bcmap',      // 水平文本
    'GBK-EUC-V.bcmap',      // 垂直文本
    'GBKp-EUC-H.bcmap',     // GBK扩展水平
    'GBKp-EUC-V.bcmap',     // GBK扩展垂直
    'GBK2K-H.bcmap',        // GBK2K水平
    'GBK2K-V.bcmap',        // GBK2K垂直
    // Adobe GB1编码（某些PDF使用）
    'Adobe-GB1-UCS2.bcmap', // Adobe GB1 UCS2
    'Adobe-GB1-0.bcmap',    // Adobe GB1 0
    'Adobe-GB1-1.bcmap',    // Adobe GB1 1
    'Adobe-GB1-2.bcmap',    // Adobe GB1 2
    'Adobe-GB1-3.bcmap',    // Adobe GB1 3
    'Adobe-GB1-4.bcmap',    // Adobe GB1 4
    'Adobe-GB1-5.bcmap',    // Adobe GB1 5
  ];
  
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  for (const file of cmapFiles) {
    const dest = path.join(CMAPS_DIR, file);
    // 检查文件是否存在且大小合理（大于1000字节，避免损坏的小文件）
    if (fs.existsSync(dest)) {
      const stats = fs.statSync(dest);
      // 如果文件大小小于1000字节，可能是损坏的文件，需要重新下载
      // 正常的CMap文件至少应该有几千字节
      if (stats.size > 1000) {
        console.log(`⏭  跳过已存在的文件: ${file} (${stats.size} bytes)`);
        skippedCount++;
        continue;
      } else {
        console.log(`⚠  文件存在但大小异常(${stats.size} bytes)，将重新下载: ${file}`);
        try {
          fs.unlinkSync(dest);
        } catch (e) {
          // 忽略删除错误
        }
      }
    }
    
    // 尝试多个CDN源
    const cdnSources = [
      `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/${file}`,
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/${file}`,
    ];
    
    let downloaded = false;
    for (const url of cdnSources) {
      try {
        await downloadFile(url, dest);
        // 验证下载的文件大小
        if (fs.existsSync(dest)) {
          const stats = fs.statSync(dest);
          if (stats.size > 1000) {
            console.log(`  ✓ 下载成功: ${file} (${stats.size} bytes)`);
            downloadedCount++;
            downloaded = true;
            // 添加延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 300));
            break;
          } else {
            // 文件太小，可能是错误页面或损坏的文件
            console.log(`  ⚠ 下载的文件太小(${stats.size} bytes)，尝试下一个源...`);
            fs.unlinkSync(dest);
          }
        }
      } catch (error) {
        // 尝试下一个CDN源
        continue;
      }
    }
    
    if (!downloaded) {
      console.warn(`  ✗ 下载 ${file} 失败: 所有CDN源都不可用或文件损坏`);
      failedCount++;
    }
  }
  
  console.log(`\nCMap下载统计:`);
  console.log(`  ✓ 新下载: ${downloadedCount} 个`);
  console.log(`  ⏭ 已存在: ${skippedCount} 个`);
  if (failedCount > 0) {
    console.log(`  ✗ 失败: ${failedCount} 个`);
  }
  
  // 验证关键文件完整性
  console.log(`\n验证关键CMap文件完整性...`);
  const criticalFiles = [
    'UniGB-UCS2-H.bcmap',
    'UniGB-UCS2-V.bcmap',
    'UniGB-UTF16-H.bcmap',
    'UniGB-UTF16-V.bcmap',
    'GBK-EUC-H.bcmap',
    'GBK-EUC-V.bcmap',
  ];
  
  let allCriticalOk = true;
  for (const file of criticalFiles) {
    const filePath = path.join(CMAPS_DIR, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 1000) {
        console.log(`  ✓ ${file}: ${stats.size} bytes`);
      } else {
        console.log(`  ❌ ${file}: ${stats.size} bytes (损坏，需要重新下载)`);
        allCriticalOk = false;
        // 删除损坏的文件，下次运行时会重新下载
        try {
          fs.unlinkSync(filePath);
          console.log(`    已删除损坏的文件，请重新运行脚本下载`);
        } catch (e) {
          // 忽略删除错误
        }
      }
    } else {
      console.log(`  ❌ ${file}: 缺失`);
      allCriticalOk = false;
    }
  }
  
  if (allCriticalOk) {
    console.log(`\n✓ 所有关键CMap文件完整！PDF中文显示应该可以正常工作。`);
  } else {
    console.log(`\n⚠️  部分关键文件缺失或损坏，可能影响某些PDF的中文显示。`);
    console.log(`   建议重新运行此脚本或手动下载缺失的文件。`);
  }
}

// 下载 standard_fonts
async function downloadStandardFonts() {
  ensureDir(STANDARD_FONTS_DIR);
  
  console.log('\n下载 Standard Fonts 文件...');
  
  // 先尝试从 node_modules 复制整个 standard_fonts 目录
  const nodeModulesFonts = path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts');
  if (fs.existsSync(nodeModulesFonts)) {
    console.log('从 node_modules 复制 standard_fonts 目录...');
    const files = fs.readdirSync(nodeModulesFonts);
    let copiedCount = 0;
    for (const file of files) {
      const src = path.join(nodeModulesFonts, file);
      const dest = path.join(STANDARD_FONTS_DIR, file);
      if (fs.statSync(src).isFile()) {
        // 跳过已存在的文件
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          copiedCount++;
        }
      }
    }
    console.log(`✓ 已复制 ${copiedCount} 个 Standard Fonts 文件从 node_modules`);
    if (copiedCount > 0) {
      return; // 成功从 node_modules 复制，不需要从 CDN 下载
    }
  }
  
  // 如果 node_modules 中没有或复制失败，尝试从 CDN 下载
  // 注意：新版本的 pdfjs-dist 可能不再包含 standard_fonts 目录
  // 这些文件不是必需的，PDF.js 会使用系统字体作为后备
  console.log('尝试从 CDN 下载 standard_fonts...');
  console.log('注意：如果下载失败，PDF.js 会使用系统字体，不影响基本功能');
  
  // 尝试不同的路径
  const fontPaths = [
    `standard_fonts`,
    `build/standard_fonts`,
  ];
  
  const fontFiles = [
    'Courier-Bold.afm',
    'Courier-BoldOblique.afm',
    'Courier-Oblique.afm',
    'Courier.afm',
    'Helvetica-Bold.afm',
    'Helvetica-BoldOblique.afm',
    'Helvetica-Oblique.afm',
    'Helvetica.afm',
    'Symbol.afm',
    'Times-Bold.afm',
    'Times-BoldItalic.afm',
    'Times-Italic.afm',
    'Times-Roman.afm',
    'ZapfDingbats.afm',
  ];
  
  let downloadedCount = 0;
  for (const file of fontFiles) {
    const dest = path.join(STANDARD_FONTS_DIR, file);
    // 跳过已存在的文件
    if (fs.existsSync(dest)) {
      downloadedCount++;
      continue;
    }
    
    let downloaded = false;
    for (const fontPath of fontPaths) {
      const cdnSources = [
        `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/${fontPath}/${file}`,
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/${fontPath}/${file}`,
      ];
      
      for (const url of cdnSources) {
        try {
          await downloadFile(url, dest);
          console.log(`✓ 成功下载: ${file}`);
          downloaded = true;
          downloadedCount++;
          // 添加延迟避免请求过快
          await new Promise(resolve => setTimeout(resolve, 300));
          break;
        } catch (error) {
          // 尝试下一个CDN源
          continue;
        }
      }
      
      if (downloaded) break;
    }
    
    if (!downloaded) {
      console.log(`⚠ 跳过 ${file}（文件不存在或下载失败，PDF.js 会使用系统字体）`);
    }
  }
  
  if (downloadedCount === 0) {
    console.log('⚠ Standard Fonts 文件下载失败，但不影响功能');
    console.log('  PDF.js 会使用系统字体作为后备方案');
  } else {
    console.log(`✓ 成功下载 ${downloadedCount} 个 Standard Fonts 文件`);
  }
}

// 主函数
async function main() {
  console.log('开始下载 PDF.js 资源...\n');
  console.log(`PDF.js 版本: ${PDFJS_VERSION}`);
  console.log(`目标目录: ${PDFJS_DIR}\n`);

  try {
    ensureDir(PUBLIC_DIR);
    ensureDir(PDFJS_DIR);

    // 下载 worker
    console.log('1. 下载 Worker 文件...');
    await downloadWorker();

    // 下载 cmaps
    await downloadCMaps();

    // 下载 standard_fonts
    await downloadStandardFonts();

    console.log('\n✓ 所有 PDF.js 资源下载完成！');
    console.log(`\n资源位置:`);
    console.log(`  Worker: ${WORKER_DIR}`);
    console.log(`  CMaps: ${CMAPS_DIR}`);
    console.log(`  Standard Fonts: ${STANDARD_FONTS_DIR}`);
  } catch (error) {
    console.error('\n✗ 下载失败:', error.message);
    process.exit(1);
  }
}

main();
