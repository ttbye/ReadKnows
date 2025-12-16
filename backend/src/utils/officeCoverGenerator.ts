/**
 * @file officeCoverGenerator.ts
 * @author ttbye
 * @date 2025-12-11
 * Office 文档封面生成器
 * 为 docx、xlsx、pptx 等格式生成统一风格的封面图片
 */

import fs from 'fs';
import path from 'path';

const booksDir = process.env.BOOKS_DIR || './books';

// 文档类型配置
const documentTypes: Record<string, { icon: string; color: string; bgColor: string }> = {
  docx: { icon: '📄', color: '#2B579A', bgColor: '#E8F4F8' },
  doc: { icon: '📄', color: '#2B579A', bgColor: '#E8F4F8' },
  xlsx: { icon: '📊', color: '#217346', bgColor: '#E8F5E9' },
  xls: { icon: '📊', color: '#217346', bgColor: '#E8F5E9' },
  pptx: { icon: '📽️', color: '#D04423', bgColor: '#FEE8E6' },
  md: { icon: '📝', color: '#333333', bgColor: '#F5F5F5' },
};

/**
 * 生成 Office 文档封面图片（使用 SVG 生成，然后转换为 PNG）
 */
export async function generateOfficeCover(
  title: string,
  fileType: string,
  outputDir: string
): Promise<string> {
  try {
    const type = fileType.toLowerCase().replace('.', '');
    const config = documentTypes[type] || { icon: '📄', color: '#666666', bgColor: '#F0F0F0' };
    
    // 限制标题长度
    const displayTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
    
    // 生成 SVG
    const svg = `
      <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
        <!-- 背景 -->
        <rect width="400" height="600" fill="${config.bgColor}"/>
        
        <!-- 渐变装饰 -->
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${config.color};stop-opacity:0.1" />
            <stop offset="100%" style="stop-color:${config.color};stop-opacity:0.3" />
          </linearGradient>
        </defs>
        <rect width="400" height="600" fill="url(#grad)"/>
        
        <!-- 图标 -->
        <text x="200" y="250" font-size="120" text-anchor="middle" fill="${config.color}">
          ${config.icon}
        </text>
        
        <!-- 标题 -->
        <text x="200" y="350" font-size="24" font-weight="bold" text-anchor="middle" fill="${config.color}" font-family="Arial, sans-serif">
          ${escapeXml(displayTitle)}
        </text>
        
        <!-- 文件类型标签 -->
        <rect x="150" y="380" width="100" height="30" rx="15" fill="${config.color}" opacity="0.2"/>
        <text x="200" y="400" font-size="14" text-anchor="middle" fill="${config.color}" font-family="Arial, sans-serif" font-weight="bold">
          ${type.toUpperCase()}
        </text>
        
        <!-- 底部装饰线 -->
        <line x1="50" y1="550" x2="350" y2="550" stroke="${config.color}" stroke-width="2" opacity="0.3"/>
      </svg>
    `;
    
    // 保存 SVG 文件
    const svgFileName = 'cover.svg';
    const svgFilePath = path.join(outputDir, svgFileName);
    fs.writeFileSync(svgFilePath, svg);
    
    // 尝试使用 sharp 转换为 PNG（如果可用）
    try {
      const sharp = await import('sharp');
      const pngFilePath = path.join(outputDir, 'cover.png');
      await sharp.default(Buffer.from(svg))
        .resize(400, 600)
        .png()
        .toFile(pngFilePath);
      
      // 删除 SVG 文件
      if (fs.existsSync(svgFilePath)) {
        fs.unlinkSync(svgFilePath);
      }
      
      // 返回相对于 booksDir 的路径
      const relativePath = path.relative(booksDir, pngFilePath);
      return `/books/${relativePath.replace(/\\/g, '/')}`;
    } catch (sharpError) {
      // 如果 sharp 不可用，使用 SVG
      console.warn('[Office封面生成] sharp 不可用，使用 SVG 格式:', sharpError);
      const relativePath = path.relative(booksDir, svgFilePath);
      return `/books/${relativePath.replace(/\\/g, '/')}`;
    }
  } catch (error: any) {
    console.error('[Office封面生成] 生成封面失败:', error);
    throw new Error(`生成Office文档封面失败: ${error.message}`);
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

