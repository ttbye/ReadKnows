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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimUnicodeEdges(s: string): string {
  // 删除字符串首尾空白（包含全角空格）
  return s.replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
}

function txtToHtmlParagraphs(txt: string): string {
  // 目标：
  // - 保留原 TXT 的“段内格式”（换行/缩进/连续空格）
  // - 删除“多余空白行”（多个空白行压缩为 1 个段分隔）
  // - 增加段间距
  // 先逐行清洗：把“仅包含空白字符的行”（含全角空格　）视为真正空行
  const raw = txt.replace(/\r\n/g, '\n');
  const cleanedLines = raw.split('\n').map((line) => {
    // 注意：\s 不包含全角空格，因此额外加入 \u3000（　）
    const isBlank = line.replace(/[\s\u3000]/g, '').length === 0;
    return isBlank ? '' : line.replace(/[ \t\u3000]+$/g, ''); // 去掉行尾空白，保留行首缩进
  });

  // 压缩多余空白行：多个空行 -> 1 个空行（段分隔）
  const normalized = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // 按“空白行”分段；段内使用 pre-wrap 保留原本的硬换行与缩进
  const parts = normalized
    .split(/\n\n+/)
    // 删除每一段头尾空格（含全角空格）
    .map((p) => trimUnicodeEdges(p))
    .filter((p) => p.replace(/[\s\u3000]/g, '').length > 0);

  return parts
    .map(
      (p) =>
        `<p style="margin: 0 0 1.1em 0; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(p)}</p>`
    )
    .join('\n');
}

type Chapter = { title: string; data: string };

function splitTxtIntoChapters(raw: string): Chapter[] {
  const content = raw.replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  // 常见章节标题：第X章/节/卷/回；或 Chapter N
  const headingRe =
    /^\s*(第\s*[〇零一二三四五六七八九十百千万0-9]{1,9}\s*(?:章|节|卷|回)\s*.*|Chapter\s+\d+\b.*)\s*$/i;

  const headings: Array<{ lineIndex: number; title: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (headingRe.test(line)) headings.push({ lineIndex: i, title: line });
  }

  // 1) 优先按“章节标题行”切分
  if (headings.length >= 2) {
    const out: Chapter[] = [];
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].lineIndex;
      const end = i + 1 < headings.length ? headings[i + 1].lineIndex : lines.length;
      const title = headings[i].title.trim() || `第${i + 1}章`;
      const body = lines.slice(start + 1, end).join('\n').trim();
      // 章节标题只用于 TOC；正文不重复显示标题，但保留锚点便于跳转
      const html = `<div id="ch-${i + 1}"></div>\n${txtToHtmlParagraphs(body)}`;
      out.push({ title, data: html });
    }
    return out.filter((c) => c.data.trim().length > 0);
  }

  // 2) 否则按“段落块”切分（空行分段），但避免切得过碎：再按字数合并
  const blocks = content
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  // 单块也要能产出 1 个章节
  if (blocks.length <= 1) {
    const title = '第1章';
    const html = `<div id="ch-1"></div>\n${txtToHtmlParagraphs(content)}`;
    return [{ title, data: html }];
  }

  // 目标：尽量控制章节数在 20~50 之间（阅读器目录更友好）
  const totalChars = blocks.reduce((s, b) => s + b.length, 0);
  const targetChapters = Math.max(20, Math.min(50, Math.ceil(totalChars / 12000))); // ~12k 字/章
  const targetCharsPerChapter = Math.max(4000, Math.floor(totalChars / targetChapters));

  const merged: Array<{ title: string; body: string }> = [];
  let buf = '';
  let idx = 0;
  for (const block of blocks) {
    const next = buf ? `${buf}\n\n${block}` : block;
    if (next.length >= targetCharsPerChapter && buf) {
      idx++;
      merged.push({ title: `第${idx}章`, body: buf });
      buf = block;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) {
    idx++;
    merged.push({ title: `第${idx}章`, body: buf });
  }

  return merged.map((m, i) => ({
    title: m.title,
    data: `<div id="ch-${i + 1}"></div>\n${txtToHtmlParagraphs(m.body)}`,
  }));
}

export async function convertTxtToEpub(
  txtFilePath: string,
  title: string,
  author: string = '未知作者'
): Promise<string> {
  try {
    // 读取txt文件内容
    const content = fs.readFileSync(txtFilePath, 'utf-8');

    // 章节切分 + 生成带 <h1> 的 HTML（更利于阅读器识别目录/章节）
    const chapters: Chapter[] = splitTxtIntoChapters(content);

    // 生成epub文件
    const epubId = uuidv4();
    const epubFileName = `${epubId}.epub`;
    const epubPath = path.join(booksDir, epubFileName);

    const option = {
      title,
      author,
      output: epubPath,
      content: chapters,
      // 一些阅读器会显示 tocTitle（不影响条目生成）
      tocTitle: '目录',
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

