/**
 * @file pdfCoverExtractor.ts
 * @author ttbye
 * @date 2025-12-11
 */

import fs from 'fs';
import path from 'path';

/**
 * 从PDF第一页提取封面图片
 * 使用pdfjs-dist + canvas来渲染PDF第一页为图片
 * @param pdfFilePath PDF文件路径
 * @param outputDir 输出目录
 * @returns 封面图片的相对路径（相对于booksDir）
 */
export async function extractPdfCover(
  pdfFilePath: string,
  outputDir: string
): Promise<string | null> {
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 尝试使用pdfjs-dist + canvas
    return await extractPdfCoverWithPdfjs(pdfFilePath, outputDir);
  } catch (error: any) {
    console.error('提取PDF封面失败:', error);
    // 重新抛出错误，让调用者能够获取详细的错误信息
    throw error;
  }
}

/**
 * Node.js环境的CanvasFactory实现
 * 用于适配pdfjs-dist在Node.js环境中使用node-canvas
 */
class NodeCanvasFactory {
  private createCanvas: any;

  constructor(createCanvasFn: any) {
    this.createCanvas = createCanvasFn;
  }

  create(width: number, height: number) {
    const canvas = this.createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas: canvas,
      context: context,
    };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * 使用pdfjs-dist从PDF第一页提取封面图片
 */
async function extractPdfCoverWithPdfjs(
  pdfFilePath: string,
  outputDir: string
): Promise<string | null> {
  try {
    // 首先加载canvas库
    let createCanvas: any;
    try {
      const canvasModule = await import('canvas');
      createCanvas = canvasModule.createCanvas;
      if (!createCanvas) {
        throw new Error('无法获取createCanvas函数');
      }
      console.log('[PDF封面提取] canvas库加载成功');
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      console.error('[PDF封面提取] canvas库加载失败:', errorMsg);
      
      if (errorMsg.includes('Cannot find module') || errorMsg.includes('MODULE_NOT_FOUND')) {
        throw new Error('PDF封面提取需要canvas依赖，请运行: npm install canvas\n注意：canvas包需要系统依赖，请参考 https://github.com/Automattic/node-canvas#installation');
      } else if (errorMsg.includes('The module') || errorMsg.includes('was compiled against')) {
        throw new Error('canvas模块版本不兼容，请重新安装: npm rebuild canvas\n或运行: npm install canvas --force');
      } else {
        throw new Error(`canvas库加载失败: ${errorMsg}\n请确保已安装canvas依赖: npm install canvas`);
      }
    }

    // 动态导入pdfjs-dist
    let pdfjsLib: any;
    try {
      // 尝试使用标准版本
      pdfjsLib = await import('pdfjs-dist');
      console.log('[PDF封面提取] pdfjs-dist 加载成功');
    } catch (e: any) {
      console.error('[PDF封面提取] pdfjs-dist 加载失败:', e.message);
      throw new Error('pdfjs-dist 未安装或加载失败，请运行: npm install pdfjs-dist');
    }
    
    // 读取PDF文件
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    console.log('[PDF封面提取] PDF文件大小:', pdfBuffer.length, 'bytes');
    
    // 将Buffer转换为Uint8Array（pdfjs-dist要求使用Uint8Array而不是Buffer）
    const pdfBytes = new Uint8Array(pdfBuffer);
    
    // 设置worker路径（禁用worker以避免路径问题）
    if (pdfjsLib.GlobalWorkerOptions) {
      // 在Node.js环境中禁用worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      console.log('[PDF封面提取] 已禁用PDF.js worker');
    }

    // 创建自定义CanvasFactory
    const canvasFactory = new NodeCanvasFactory(createCanvas);
    
    // 加载PDF文档，使用自定义CanvasFactory
    console.log('[PDF封面提取] 开始加载PDF文档...');
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      canvasFactory: canvasFactory, // 使用自定义CanvasFactory
    });
    const pdf = await loadingTask.promise;
    console.log('[PDF封面提取] PDF文档加载成功，总页数:', pdf.numPages);
    
    if (pdf.numPages === 0) {
      console.warn('PDF文件没有页面');
      return null;
    }

    // 获取第一页
    console.log('[PDF封面提取] 开始获取第一页...');
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); // 使用2倍缩放以获得更好的质量
    console.log('[PDF封面提取] 页面尺寸:', viewport.width, 'x', viewport.height);

    // 使用CanvasFactory创建canvas
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
    const canvas = canvasAndContext.canvas;
    const context = canvasAndContext.context;
    console.log('[PDF封面提取] Canvas创建成功', {
      width: canvas.width,
      height: canvas.height,
    });

    // 渲染PDF页面到canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    
    console.log('[PDF封面提取] 开始渲染页面到canvas...');
    await page.render(renderContext).promise;
    console.log('[PDF封面提取] 页面渲染完成');

    // 将canvas转换为图片并保存
    const coverExt = '.jpg';
    const coverFileName = `cover${coverExt}`;
    const coverFilePath = path.join(outputDir, coverFileName);

    // 将canvas转换为buffer并保存为JPEG
    console.log('[PDF封面提取] 开始转换为JPEG...');
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    fs.writeFileSync(coverFilePath, buffer);
    console.log('[PDF封面提取] 封面文件已保存:', coverFilePath, '大小:', buffer.length, 'bytes');

    // 返回相对于booksDir的路径
    const { booksDir } = require('../config/paths');
    const relativePath = path.relative(booksDir, coverFilePath);
    const coverUrl = `/books/${relativePath.replace(/\\/g, '/')}`;

    console.log('[PDF封面提取] 封面提取成功:', {
      coverFilePath,
      coverUrl,
      width: viewport.width,
      height: viewport.height,
      fileSize: buffer.length
    });

    return coverUrl;
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    console.error('使用pdfjs-dist提取PDF封面失败:', errorMessage);
    
    // 重新抛出错误，让调用者处理
    // 这样可以在路由层提供更详细的错误信息
    throw error;
  }
}

