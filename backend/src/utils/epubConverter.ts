/**
 * @file epubConverter.ts
 * @author ttbye
 * @date 2025-12-11
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
// @ts-ignore
import EPub from 'epub-gen';

const execAsync = promisify(exec);
const booksDir = process.env.BOOKS_DIR || './books';

export async function convertTxtToEpub(
  txtFilePath: string,
  title: string,
  author: string = '未知作者'
): Promise<string> {
  try {
    // 读取txt文件内容
    const content = fs.readFileSync(txtFilePath, 'utf-8');
    
    // 简单的章节分割（按空行分割，可以改进）
    let chapters: Array<{ title: string; data: string }> = content
      .split(/\n\s*\n/)
      .filter((chunk: string) => chunk.trim().length > 0)
      .map((chunk: string, index: number) => ({
        title: `第${index + 1}章`,
        data: chunk.trim(),
      }));

    // 如果章节太多，合并成更少的章节
    const maxChapters = 50;
    if (chapters.length > maxChapters) {
      const chunkSize = Math.ceil(chapters.length / maxChapters);
      const mergedChapters: Array<{ title: string; data: string }> = [];
      for (let i = 0; i < chapters.length; i += chunkSize) {
        const chunk = chapters.slice(i, i + chunkSize);
        mergedChapters.push({
          title: `第${Math.floor(i / chunkSize) + 1}章`,
          data: chunk.map((c) => c.data).join('\n\n'),
        });
      }
      chapters = mergedChapters;
    }

    // 生成epub文件
    const epubId = uuidv4();
    const epubFileName = `${epubId}.epub`;
    const epubPath = path.join(booksDir, epubFileName);

    const option = {
      title,
      author,
      output: epubPath,
      content: chapters,
    };

    await new EPub(option).promise;

    return epubPath;
  } catch (error) {
    console.error('转换txt到epub失败:', error);
    throw error;
  }
}

/**
 * 将 MOBI 文件转换为 EPUB 格式
 * 使用 Calibre 的 ebook-convert 命令行工具
 * @param mobiFilePath MOBI 文件路径
 * @returns EPUB 文件路径
 */
export async function convertMobiToEpub(mobiFilePath: string): Promise<string> {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(mobiFilePath)) {
      throw new Error(`MOBI 文件不存在: ${mobiFilePath}`);
    }

    // 生成 EPUB 文件路径
    const epubId = uuidv4();
    const epubFileName = `${epubId}.epub`;
    const epubPath = path.join(booksDir, epubFileName);

    // 检查 Calibre 是否安装
    let ebookConvertPath = 'ebook-convert';
    
    // 尝试查找 ebook-convert 命令
    try {
      // 在 macOS 上，Calibre 通常安装在 /Applications/calibre.app/Contents/MacOS/ebook-convert
      if (process.platform === 'darwin') {
        const macPaths = [
          '/Applications/calibre.app/Contents/MacOS/ebook-convert',
          '/usr/local/bin/ebook-convert',
          '/opt/homebrew/bin/ebook-convert',
        ];
        
        for (const macPath of macPaths) {
          if (fs.existsSync(macPath)) {
            ebookConvertPath = macPath;
            break;
          }
        }
      } else if (process.platform === 'linux') {
        // Linux 上检查常见安装路径（Docker 容器中）
        const linuxPaths = [
          '/opt/calibre/ebook-convert',           // 符号链接路径
          '/opt/calibre/calibre/ebook-convert',  // 实际安装路径
          '/usr/local/bin/ebook-convert',         // 系统符号链接
          '/usr/bin/ebook-convert',               // 系统包管理器安装
          'ebook-convert',                        // PATH 中的命令
        ];
        
        for (const linuxPath of linuxPaths) {
          if (linuxPath === 'ebook-convert') {
            // 对于命令，使用 which 检查
            try {
              const { execSync } = require('child_process');
              const whichResult = execSync('which ebook-convert', { encoding: 'utf8', stdio: 'pipe' }).trim();
              if (whichResult) {
                ebookConvertPath = whichResult;
                break;
              }
            } catch (e) {
              // which 命令失败，继续检查下一个路径
            }
          } else if (fs.existsSync(linuxPath)) {
            ebookConvertPath = linuxPath;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        // Windows 上 Calibre 通常安装在 Program Files
        const winPaths = [
          'C:\\Program Files\\Calibre2\\ebook-convert.exe',
          'C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe',
        ];
        
        for (const winPath of winPaths) {
          if (fs.existsSync(winPath)) {
            ebookConvertPath = winPath;
            break;
          }
        }
      }
    } catch (e) {
      console.warn('查找 ebook-convert 路径失败，使用默认路径:', e);
    }

    // 执行转换命令
    console.log('开始转换 MOBI 到 EPUB:', {
      mobiPath: mobiFilePath,
      epubPath,
      ebookConvertPath,
    });

    // 转义文件路径中的特殊字符（特别是空格）
    const escapedMobiPath = mobiFilePath.replace(/ /g, '\\ ');
    const escapedEpubPath = epubPath.replace(/ /g, '\\ ');

    // 构建命令 - 使用绝对路径并正确转义
    // 在Windows上需要使用不同的命令格式
    let command: string;
    if (process.platform === 'win32') {
      // Windows: 直接使用路径，不需要转义
      command = `"${ebookConvertPath}" "${mobiFilePath}" "${epubPath}"`;
    } else {
      // Unix-like: 使用引号包裹路径
      command = `"${ebookConvertPath}" "${mobiFilePath}" "${epubPath}"`;
    }

    console.log('[MOBI转换] 执行命令:', command);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5分钟超时
        maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区
        encoding: 'utf8',
      });
      
      console.log('[MOBI转换] 命令输出:', { stdout: stdout?.substring(0, 200), stderr: stderr?.substring(0, 200) });

      if (stderr && !stderr.includes('Conversion successful')) {
        console.warn('ebook-convert 警告:', stderr);
      }

      // 检查 EPUB 文件是否生成
      if (!fs.existsSync(epubPath)) {
        throw new Error('EPUB 文件未生成，转换可能失败');
      }

      console.log('MOBI 转 EPUB 成功:', {
        mobiPath: mobiFilePath,
        epubPath,
        epubSize: fs.statSync(epubPath).size,
      });

      return epubPath;
    } catch (execError: any) {
      // 如果命令执行失败，检查是否是 Calibre 未安装
      if (execError.code === 'ENOENT' || execError.message.includes('ebook-convert')) {
        throw new Error(
          '未找到 Calibre 转换工具。请先安装 Calibre：\n' +
          'macOS: brew install --cask calibre\n' +
          'Linux: sudo apt-get install calibre\n' +
          'Windows: 从 https://calibre-ebook.com/download 下载安装'
        );
      }
      throw execError;
    }
  } catch (error: any) {
    console.error('转换 MOBI 到 EPUB 失败:', error);
    throw new Error(`MOBI 转 EPUB 失败: ${error.message}`);
  }
}

