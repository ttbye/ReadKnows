/**
 * @file coverDownloader.ts
 * @description 下载远程封面图片到本地
 */

import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 下载远程封面图片到本地
 * @param coverUrl 封面URL（可以是远程URL或本地路径）
 * @param bookDir 书籍目录（封面将保存到此目录）
 * @param booksDir 书籍根目录（用于生成相对路径）
 * @returns 返回本地封面路径（相对路径，如 /books/...）或 null
 */
export async function downloadCoverToLocal(
  coverUrl: string | null | undefined,
  bookDir: string,
  booksDir: string
): Promise<string | null> {
  // 如果封面URL为空或不是远程URL，直接返回
  if (!coverUrl || !coverUrl.startsWith('http://') && !coverUrl.startsWith('https://')) {
    return null;
  }

  try {
    console.log('[封面下载] 开始下载远程封面:', coverUrl);

    // 下载封面图片
    const coverResponse = await axios.get(coverUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30秒超时
      httpsAgent: coverUrl.startsWith('https://') ? new https.Agent({
        rejectUnauthorized: false, // 允许自签名证书
      }) : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const coverBuffer = Buffer.from(coverResponse.data);

    // 确保书籍目录存在
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }

    // 智能检测封面文件扩展名
    let coverExt = '.jpg'; // 默认

    // 1. 从Content-Type检测
    const contentType = coverResponse.headers['content-type'];
    if (contentType) {
      if (contentType.includes('png')) coverExt = '.png';
      else if (contentType.includes('webp')) coverExt = '.webp';
      else if (contentType.includes('gif')) coverExt = '.gif';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) coverExt = '.jpg';
    }

    // 2. 从URL路径检测（作为备选）
    if (coverExt === '.jpg') {
      try {
        const urlPath = new URL(coverUrl).pathname;
        const ext = path.extname(urlPath).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          coverExt = ext;
        }
      } catch (e) {
        // URL解析失败，使用默认
      }
    }

    // 3. 从文件头检测（最准确）
    if (coverBuffer.length >= 4) {
      const header = coverBuffer.slice(0, 4);
      if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
        coverExt = '.png';
      } else if (header[0] === 0xFF && header[1] === 0xD8) {
        coverExt = '.jpg';
      } else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
        coverExt = '.gif';
      } else if (coverBuffer.slice(0, 4).toString() === 'RIFF' && coverBuffer.slice(8, 12).toString() === 'WEBP') {
        coverExt = '.webp';
      }
    }

    const coverFileName = `cover${coverExt}`;
    const coverFilePath = path.join(bookDir, coverFileName);

    // 如果已存在封面文件，先删除
    if (fs.existsSync(coverFilePath)) {
      fs.unlinkSync(coverFilePath);
    }

    // 保存封面文件
    fs.writeFileSync(coverFilePath, coverBuffer);

    // 生成相对路径
    const relativePath = path.relative(booksDir, coverFilePath);
    const localCoverUrl = `/books/${relativePath.replace(/\\/g, '/')}`;

    console.log('[封面下载] 封面下载成功:', {
      originalUrl: coverUrl,
      localPath: coverFilePath,
      coverUrl: localCoverUrl,
      fileSize: coverBuffer.length,
      detectedFormat: coverExt,
    });

    return localCoverUrl;
  } catch (error: any) {
    console.error('[封面下载] 下载失败:', {
      coverUrl,
      error: error.message,
      code: error.code,
      status: error.response?.status,
    });

    // 不抛出错误，返回null表示下载失败，但不影响主流程
    return null;
  }
}
