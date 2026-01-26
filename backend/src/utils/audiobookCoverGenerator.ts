/**
 * @file audiobookCoverGenerator.ts
 * @description 有声小说封面生成器
 */

import fs from 'fs';
import path from 'path';
import { coversDir } from '../config/paths';

/**
 * 生成默认有声小说封面图片（使用 SVG）
 */
export async function generateDefaultAudiobookCover(
  audiobookId: string,
  title: string,
  author?: string | null
): Promise<string | null> {
  try {
    // 确保封面目录存在
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }

    // 限制标题和作者长度
    const displayTitle = title.length > 20 ? title.substring(0, 20) + '...' : title;
    const displayAuthor = author && author.length > 15 ? author.substring(0, 15) + '...' : (author || '未知作者');
    
    // 生成 SVG
    const svg = `
      <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
        <!-- 背景渐变 -->
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#4F46E5;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:0.9" />
            <stop offset="100%" style="stop-color:#FFFFFF;stop-opacity:0.7" />
          </linearGradient>
        </defs>
        
        <!-- 背景 -->
        <rect width="400" height="600" fill="url(#bgGrad)"/>
        
        <!-- 装饰圆形 -->
        <circle cx="200" cy="150" r="80" fill="url(#iconGrad)" opacity="0.3"/>
        <circle cx="200" cy="150" r="60" fill="url(#iconGrad)" opacity="0.2"/>
        
        <!-- 音乐图标 -->
        <g transform="translate(200, 150)">
          <!-- 音符 -->
          <path d="M -20 -30 L -20 20 L -10 20 L -10 10 L 10 10 L 10 20 L 20 20 L 20 -30 Z" fill="white" opacity="0.9"/>
          <circle cx="-15" cy="-25" r="8" fill="white" opacity="0.9"/>
          <circle cx="15" cy="-25" r="8" fill="white" opacity="0.9"/>
        </g>
        
        <!-- 标题 -->
        <text x="200" y="320" font-size="28" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial, sans-serif">
          ${escapeXml(displayTitle)}
        </text>
        
        <!-- 作者 -->
        <text x="200" y="360" font-size="18" text-anchor="middle" fill="white" opacity="0.9" font-family="Arial, sans-serif">
          ${escapeXml(displayAuthor)}
        </text>
        
        <!-- 底部装饰 -->
        <rect x="50" y="500" width="300" height="4" rx="2" fill="white" opacity="0.5"/>
        <text x="200" y="550" font-size="14" text-anchor="middle" fill="white" opacity="0.7" font-family="Arial, sans-serif">
          有声小说
        </text>
      </svg>
    `;
    
    // 保存 SVG 文件
    const svgFileName = `${audiobookId}.svg`;
    const svgFilePath = path.join(coversDir, svgFileName);
    fs.writeFileSync(svgFilePath, svg);
    
    // 尝试使用 sharp 转换为 PNG（如果可用）
    try {
      const sharp = await import('sharp');
      const pngFileName = `${audiobookId}.png`;
      const pngFilePath = path.join(coversDir, pngFileName);
      
      await sharp.default(Buffer.from(svg))
        .resize(400, 600)
        .png()
        .toFile(pngFilePath);
      
      // 删除 SVG 文件
      if (fs.existsSync(svgFilePath)) {
        fs.unlinkSync(svgFilePath);
      }
      
      return pngFileName;
    } catch (sharpError) {
      // 如果 sharp 不可用，使用 SVG
      console.warn('[有声小说封面生成] sharp 不可用，使用 SVG 格式:', sharpError);
      return svgFileName;
    }
  } catch (error: any) {
    console.error('生成有声小说封面失败:', error);
    return null;
  }
}

/**
 * 转义 XML 特殊字符
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

