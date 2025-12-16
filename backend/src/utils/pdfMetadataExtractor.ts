/**
 * @file pdfMetadataExtractor.ts
 * @author ttbye
 * @date 2025-12-11
 */

import fs from 'fs';
import path from 'path';

/**
 * 从PDF文件中提取元数据（标题、作者等）
 * 优先使用pdf-parse，如果失败则尝试使用pdfjs-dist
 * @param pdfFilePath PDF文件路径
 * @returns 元数据对象
 */
export async function extractPdfMetadata(pdfFilePath: string): Promise<{
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  keywords?: string;
  creationDate?: string;
  modificationDate?: string;
}> {
  try {
    // 方法1: 尝试使用pdf-parse（更简单，适合Node.js环境）
    return await extractPdfMetadataWithPdfParse(pdfFilePath);
  } catch (error: any) {
    console.warn('使用pdf-parse提取PDF元数据失败，尝试使用pdfjs-dist:', error.message);
    try {
      // 方法2: 使用pdfjs-dist（更强大，但需要更多配置）
      return await extractPdfMetadataWithPdfjs(pdfFilePath);
    } catch (error2: any) {
      console.error('使用pdfjs-dist提取PDF元数据也失败:', error2.message);
      // 如果都失败，返回空对象
      return {};
    }
  }
}

/**
 * 使用pdf-parse提取PDF元数据
 */
async function extractPdfMetadataWithPdfParse(pdfFilePath: string): Promise<{
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  keywords?: string;
  creationDate?: string;
  modificationDate?: string;
}> {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfFilePath);
    const data = await pdfParse(dataBuffer);
    
    const metadata: any = {};
    
    // 提取元数据（pdf-parse返回的info对象）
    if (data.info) {
      // 处理标题
      if (data.info.Title) {
        metadata.title = decodePdfString(data.info.Title);
      }
      
      // 处理作者
      if (data.info.Author) {
        metadata.author = decodePdfString(data.info.Author);
      }
      
      // 处理主题
      if (data.info.Subject) {
        metadata.subject = decodePdfString(data.info.Subject);
      }
      
      // 处理创建者
      if (data.info.Creator) {
        metadata.creator = decodePdfString(data.info.Creator);
      }
      
      // 处理生产者
      if (data.info.Producer) {
        metadata.producer = decodePdfString(data.info.Producer);
      }
      
      // 处理关键词
      if (data.info.Keywords) {
        metadata.keywords = decodePdfString(data.info.Keywords);
      }
      
      // 处理创建日期
      if (data.info.CreationDate) {
        metadata.creationDate = data.info.CreationDate;
      }
      
      // 处理修改日期
      if (data.info.ModDate) {
        metadata.modificationDate = data.info.ModDate;
      }
    }
    
    console.log('PDF元数据提取成功 (pdf-parse):', metadata);
    return metadata;
  } catch (error: any) {
    throw new Error(`pdf-parse提取失败: ${error.message}`);
  }
}

/**
 * 使用pdfjs-dist提取PDF元数据
 */
async function extractPdfMetadataWithPdfjs(pdfFilePath: string): Promise<{
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  keywords?: string;
  creationDate?: string;
  modificationDate?: string;
}> {
  try {
    // 动态导入pdfjs-dist
    let pdfjsLib: any;
    try {
      // 尝试不同的导入路径
      try {
        pdfjsLib = await import('pdfjs-dist');
      } catch (e1) {
        try {
          // @ts-ignore - 动态导入路径
          pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        } catch (e2) {
          // @ts-ignore - 动态导入路径
          pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
        }
      }
    } catch (e) {
      throw new Error(`无法加载pdfjs-dist: ${e}`);
    }
    
    // 读取PDF文件
    const pdfBuffer = fs.readFileSync(pdfFilePath);
    
    // 将Buffer转换为Uint8Array（pdfjs-dist要求使用Uint8Array而不是Buffer）
    const pdfBytes = new Uint8Array(pdfBuffer);
    
    // 设置worker路径（如果需要）
    if (pdfjsLib.GlobalWorkerOptions) {
      try {
        const workerPaths = [
          'pdfjs-dist/build/pdf.worker.mjs',
          'pdfjs-dist/legacy/build/pdf.worker.mjs',
          'pdfjs-dist/build/pdf.worker.js',
        ];
        
        let workerPath: string | null = null;
        for (const workerPathOption of workerPaths) {
          try {
            workerPath = require.resolve(workerPathOption);
            break;
          } catch (e) {
            // 继续尝试下一个路径
          }
        }
        
        if (workerPath) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
        }
      } catch (e: any) {
        console.warn('设置PDF.js worker路径失败:', e.message);
      }
    }
    
    // 加载PDF文档
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    const pdf = await loadingTask.promise;
    
    // 获取元数据
    const metadataObj = await pdf.getMetadata();
    const info = metadataObj.info || {};
    
    const metadata: any = {};
    
    // 提取元数据
    if (info.Title) {
      metadata.title = decodePdfString(info.Title);
    }
    
    if (info.Author) {
      metadata.author = decodePdfString(info.Author);
    }
    
    if (info.Subject) {
      metadata.subject = decodePdfString(info.Subject);
    }
    
    if (info.Creator) {
      metadata.creator = decodePdfString(info.Creator);
    }
    
    if (info.Producer) {
      metadata.producer = decodePdfString(info.Producer);
    }
    
    if (info.Keywords) {
      metadata.keywords = decodePdfString(info.Keywords);
    }
    
    if (info.CreationDate) {
      metadata.creationDate = info.CreationDate;
    }
    
    if (info.ModDate) {
      metadata.modificationDate = info.ModDate;
    }
    
    console.log('PDF元数据提取成功 (pdfjs-dist):', metadata);
    return metadata;
  } catch (error: any) {
    throw new Error(`pdfjs-dist提取失败: ${error.message}`);
  }
}

/**
 * 解码PDF字符串（处理编码问题）
 * PDF字符串可能是UTF-8、UTF-16BE、PDFDocEncoding等格式
 */
function decodePdfString(str: string | any): string {
  if (!str) return '';
  
  // 如果已经是字符串，直接返回
  if (typeof str === 'string') {
    // 检查是否是UTF-16BE编码（以FE FF开头）
    if (str.charCodeAt(0) === 0xFEFF || (str.length >= 2 && str.charCodeAt(0) === 0xFE && str.charCodeAt(1) === 0xFF)) {
      try {
        // 尝试解码UTF-16BE
        const buffer = Buffer.from(str, 'utf16le');
        return buffer.toString('utf8');
      } catch (e) {
        // 如果失败，返回原字符串
      }
    }
    
    // 尝试处理常见的编码问题
    try {
      // 如果字符串包含乱码，尝试不同的编码
      if (/[\uFFFD\u0000-\u001F]/.test(str)) {
        // 尝试从Latin1转换
        const buffer = Buffer.from(str, 'latin1');
        return buffer.toString('utf8');
      }
    } catch (e) {
      // 如果失败，返回原字符串
    }
    
    return str;
  }
  
  // 如果是Buffer，尝试解码
  if (Buffer.isBuffer(str)) {
    try {
      return str.toString('utf8');
    } catch (e) {
      try {
        return str.toString('latin1');
      } catch (e2) {
        return str.toString();
      }
    }
  }
  
  // 其他情况，转换为字符串
  return String(str);
}

