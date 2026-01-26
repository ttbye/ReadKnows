/**
 * @file epubConverter.ts
 * @description EPUB 转换工具，支持 TXT 转 EPUB 和 MOBI 转 EPUB
 */

import { exec, execFile, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { booksDir } from '../config/paths';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * 查找 ebook-convert 可执行路径（Calibre 自带，用于 TXT/MOBI 转 EPUB）
 */
function getEbookConvertPath(): string {
  let ebookConvertPath = 'ebook-convert';
  try {
    if (process.platform === 'darwin') {
      const macPaths = [
        '/Applications/calibre.app/Contents/MacOS/ebook-convert',
        '/usr/local/bin/ebook-convert',
        '/opt/homebrew/bin/ebook-convert',
      ];
      for (const p of macPaths) {
        if (fs.existsSync(p)) {
          return p;
        }
      }
    } else if (process.platform === 'linux') {
      const linuxPaths = [
        '/opt/calibre/ebook-convert',
        '/opt/calibre/calibre/ebook-convert',
        '/usr/local/bin/ebook-convert',
        '/usr/bin/ebook-convert',
      ];
      for (const p of linuxPaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          try {
            fs.accessSync(p, fs.constants.X_OK);
            return p;
          } catch (_e) {}
        }
      }
      try {
        const w = execSync('which ebook-convert', { encoding: 'utf8', stdio: 'pipe' }).trim();
        if (w) return w;
      } catch (_e) {}
    } else if (process.platform === 'win32') {
      const winPaths = [
        'C:\\Program Files\\Calibre2\\ebook-convert.exe',
        'C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe',
      ];
      for (const p of winPaths) {
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (_e) {}
  return ebookConvertPath;
}

/**
 * 将 TXT 文件转换为 EPUB 格式
 * 使用 Calibre 的 ebook-convert（与 MOBI 转 EPUB 相同工具）
 */
export async function convertTxtToEpub(
  txtFilePath: string,
  title: string,
  author: string = '未知作者'
): Promise<string> {
  try {
    if (!fs.existsSync(txtFilePath)) {
      throw new Error(`TXT 文件不存在: ${txtFilePath}`);
    }
    const epubPath = path.join(booksDir, `${uuidv4()}.epub`);
    const ebookConvertPath = getEbookConvertPath();
    const args = [txtFilePath, epubPath, '--title', title, '--authors', author];
    console.log('[TXT转换] 开始转换 TXT 到 EPUB:', { txtPath: txtFilePath, epubPath, title, author });
    await execFileAsync(ebookConvertPath, args, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
    });
    if (!fs.existsSync(epubPath)) {
      throw new Error('EPUB 文件未生成，转换可能失败');
    }
    console.log('[TXT转换] 转换成功:', { epubPath, size: fs.statSync(epubPath).size });
    return epubPath;
  } catch (error: any) {
    if (error.code === 'ENOENT' || (error.message && error.message.includes('ebook-convert'))) {
      throw new Error(
        '未找到 Calibre 转换工具，TXT 转 EPUB 需要安装 Calibre：\n' +
        'macOS: brew install --cask calibre\n' +
        'Linux: sudo apt-get install calibre 或使用带 Calibre 的 Docker 镜像\n' +
        'Windows: 从 https://calibre-ebook.com/download 下载安装'
      );
    }
    console.error('转换 TXT 到 EPUB 失败:', error);
    throw new Error(`TXT 转 EPUB 失败: ${error.message}`);
  }
}

/**
 * 检查 Calibre 是否可用
 * 返回可用状态和路径信息
 */
export async function checkCalibreAvailable(): Promise<{
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}> {
  try {
    let ebookConvertPath = 'ebook-convert';
    let foundPath = '';
    
    // 尝试查找 ebook-convert 命令
    try {
      if (process.platform === 'linux') {
        // Linux 上检查常见安装路径（Docker 容器中）
        const linuxPaths = [
          '/opt/calibre/ebook-convert',           // 符号链接路径
          '/opt/calibre/calibre/ebook-convert',  // 实际安装路径
          '/usr/local/bin/ebook-convert',         // 系统符号链接
          '/usr/bin/ebook-convert',               // 系统包管理器安装
        ];
        
        for (const linuxPath of linuxPaths) {
          if (fs.existsSync(linuxPath) && fs.statSync(linuxPath).isFile()) {
            // 检查文件是否可执行
            try {
              fs.accessSync(linuxPath, fs.constants.X_OK);
              ebookConvertPath = linuxPath;
              foundPath = linuxPath;
              break;
            } catch (e) {
              // 文件不可执行，继续检查下一个
            }
          }
        }
        
        // 如果没找到，尝试使用 which 命令
        if (!foundPath) {
          try {
            const { execSync } = require('child_process');
            const whichResult = execSync('which ebook-convert', { encoding: 'utf8', stdio: 'pipe' }).trim();
            if (whichResult) {
              ebookConvertPath = whichResult;
              foundPath = whichResult;
            }
          } catch (e) {
            // which 命令失败
          }
        }
      } else if (process.platform === 'darwin') {
        const macPaths = [
          '/Applications/calibre.app/Contents/MacOS/ebook-convert',
          '/usr/local/bin/ebook-convert',
          '/opt/homebrew/bin/ebook-convert',
        ];
        
        for (const macPath of macPaths) {
          if (fs.existsSync(macPath)) {
            ebookConvertPath = macPath;
            foundPath = macPath;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        const winPaths = [
          'C:\\Program Files\\Calibre2\\ebook-convert.exe',
          'C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe',
        ];
        
        for (const winPath of winPaths) {
          if (fs.existsSync(winPath)) {
            ebookConvertPath = winPath;
            foundPath = winPath;
            break;
          }
        }
      }
    } catch (e) {
      // 查找路径失败
    }

    // 如果没有找到具体路径，使用默认命令名
    if (!foundPath) {
      ebookConvertPath = 'ebook-convert';
    }

    // 尝试执行版本命令来验证
    try {
      const { stdout, stderr } = await execAsync(`"${ebookConvertPath}" --version`, {
        timeout: 5000,
        maxBuffer: 1024 * 1024, // 1MB
      });
      
      const versionOutput = (stdout || stderr || '').trim();
      const version = versionOutput.split('\n')[0] || versionOutput;
      
      return {
        available: true,
        path: foundPath || ebookConvertPath,
        version: version,
      };
    } catch (execError: any) {
      if (execError.code === 'ENOENT') {
        return {
          available: false,
          error: '未找到 Calibre 转换工具。请先安装 Calibre。',
        };
      }
      
      return {
        available: false,
        path: foundPath || ebookConvertPath,
        error: `Calibre 工具无法执行: ${execError.message}`,
      };
    }
  } catch (error: any) {
    return {
      available: false,
      error: `检查 Calibre 可用性时出错: ${error.message}`,
    };
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

    const ebookConvertPath = getEbookConvertPath();
    console.log('开始转换 MOBI 到 EPUB:', {
      mobiPath: mobiFilePath,
      epubPath,
      ebookConvertPath,
    });
    const command = `"${ebookConvertPath}" "${mobiFilePath}" "${epubPath}"`;

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
