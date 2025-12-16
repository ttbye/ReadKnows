/**
 * @file autoImportHandler.ts
 * @author ttbye
 * @date 2025-12-11
 * @description 自动导入处理器，处理检测到的电子书文件
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { extractEpubMetadata } from './epubParser';
import { extractPdfMetadata } from './pdfMetadataExtractor';
import { extractPdfCover } from './pdfCoverExtractor';
import { convertTxtToEpub, convertMobiToEpub } from './epubConverter';
import { calculateFileHash } from './fileHash';
import { DetectedFile } from './fileWatcher';

const booksDir = process.env.BOOKS_DIR || './books';

export interface ImportResult {
  success: boolean;
  bookId?: string;
  bookTitle?: string;
  error?: string;
  isDuplicate?: boolean;
}

export class AutoImportHandler {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * 获取系统设置
   */
  private getSetting(key: string, defaultValue: string = ''): string {
    const setting = this.db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as any;
    return setting ? setting.value : defaultValue;
  }

  /**
   * 处理检测到的文件
   */
  public async processFile(file: DetectedFile): Promise<ImportResult> {
    console.log('[自动导入] 开始处理文件:', file.fileName);

    try {
      const fileExt = file.fileExt.toLowerCase();
      let finalFilePath = file.filePath;
      let metadata: any = {};

      // 获取转换设置
      const autoConvertTxt = this.getSetting('auto_convert_txt', 'true') === 'true';
      const autoConvertMobi = this.getSetting('auto_convert_mobi', 'true') === 'true';

      // 1. 转换格式（如果需要）
      if (fileExt === '.mobi' && autoConvertMobi) {
        console.log('[自动导入] 转换MOBI到EPUB...');
        try {
          finalFilePath = await convertMobiToEpub(file.filePath);
          console.log('[自动导入] MOBI转换成功:', finalFilePath);
        } catch (error: any) {
          console.error('[自动导入] MOBI转换失败:', error.message);
      return {
        success: false,
            error: `MOBI转换失败: ${error.message}`,
          };
        }
      } else if (fileExt === '.mobi' && !autoConvertMobi) {
        // MOBI文件但未启用转换，跳过
        console.log('[自动导入] MOBI文件但未启用自动转换，跳过:', file.fileName);
        return {
          success: false,
          error: 'MOBI文件未启用自动转换',
        };
      } else if (fileExt === '.txt' && autoConvertTxt) {
        console.log('[自动导入] 转换TXT到EPUB...');
        const title = path.basename(file.fileName, '.txt');
        try {
          finalFilePath = await convertTxtToEpub(file.filePath, title, '未知作者');
          console.log('[自动导入] TXT转换成功:', finalFilePath);
        } catch (error: any) {
          console.error('[自动导入] TXT转换失败:', error.message);
          return {
            success: false,
            error: `TXT转换失败: ${error.message}`,
          };
      }
      }

      // 2. 计算文件哈希（检查重复）
      const fileHash = await calculateFileHash(finalFilePath);
      const existingBook = this.db
        .prepare('SELECT id, title FROM books WHERE file_hash = ?')
        .get(fileHash) as any;

      if (existingBook) {
        console.log('[自动导入] 文件已存在，跳过导入:', existingBook.title);
        
        // 删除原文件
        this.deleteFile(file.filePath);
        
        // 如果转换了文件，也删除转换后的文件
        if (finalFilePath !== file.filePath) {
          this.deleteFile(finalFilePath);
        }

        return {
          success: true,
          isDuplicate: true,
          bookId: existingBook.id,
          bookTitle: existingBook.title,
        };
      }

      // 3. 提取元数据（第一次，不保存封面）
      const finalFileExt = path.extname(finalFilePath).toLowerCase();
      
      if (finalFileExt === '.epub') {
      try {
          metadata = await extractEpubMetadata(finalFilePath);
        console.log('[自动导入] EPUB元数据提取成功:', {
          title: metadata.title,
          author: metadata.author,
            cover_url: metadata.cover_url
        });
      } catch (error: any) {
          console.error('[自动导入] EPUB元数据提取失败:', error.message);
        metadata = {
            title: path.basename(file.fileName, fileExt),
          author: '未知作者',
        };
      }
      } else if (finalFileExt === '.pdf') {
      try {
          const pdfMetadata = await extractPdfMetadata(finalFilePath);
        metadata = {
            title: pdfMetadata.title || path.basename(file.fileName, fileExt),
          author: pdfMetadata.author || '未知作者',
          description: pdfMetadata.subject,
            cover_url: 'pdf-cover', // 标记需要提取PDF封面
        };
          console.log('[自动导入] PDF元数据提取成功:', metadata.title);
      } catch (error: any) {
          console.error('[自动导入] PDF元数据提取失败:', error.message);
        metadata = {
            title: path.basename(file.fileName, fileExt),
          author: '未知作者',
            cover_url: 'pdf-cover', // 标记需要提取PDF封面
          };
        }
      } else {
        metadata = {
          title: path.basename(file.fileName, fileExt),
          author: '未知作者',
        };
      }

      // 4. 生成书籍ID和目录
      const bookId = uuidv4();
      const bookDir = path.join(booksDir, 'public', bookId);
      
      // 确保目录存在
      if (!fs.existsSync(bookDir)) {
        fs.mkdirSync(bookDir, { recursive: true });
    }

      // 5. 移动文件到书籍目录
      const newFileName = `book${finalFileExt}`;
      const newFilePath = path.join(bookDir, newFileName);
      
      fs.copyFileSync(finalFilePath, newFilePath);
      console.log('[自动导入] 文件已复制到:', newFilePath);

      // 6. 提取封面（第二次，保存封面文件）
      if (finalFileExt === '.epub') {
      try {
          console.log('[自动导入] 开始提取EPUB封面，bookDir:', bookDir);
          const coverMetadata = await extractEpubMetadata(newFilePath, bookDir);
          console.log('[自动导入] EPUB封面提取结果:', {
            cover_url: coverMetadata.cover_url,
            bookDir
          });
          
        if (coverMetadata.cover_url && coverMetadata.cover_url !== 'cover') {
          metadata.cover_url = coverMetadata.cover_url;
            console.log('[自动导入] ✅ EPUB封面提取成功:', metadata.cover_url);
          } else {
            console.warn('[自动导入] ⚠️  EPUB封面提取返回无效值:', coverMetadata.cover_url);
            metadata.cover_url = null;
        }
      } catch (error: any) {
          console.error('[自动导入] ❌ EPUB封面提取失败:', error.message);
          console.error('[自动导入] 错误堆栈:', error.stack);
        metadata.cover_url = null;
      }
      } else if (finalFileExt === '.pdf' && metadata.cover_url === 'pdf-cover') {
      try {
          console.log('[自动导入] 开始提取PDF封面，bookDir:', bookDir);
          const coverUrl = await extractPdfCover(newFilePath, bookDir);
        if (coverUrl) {
          metadata.cover_url = coverUrl;
            console.log('[自动导入] ✅ PDF封面提取成功:', metadata.cover_url);
          } else {
            console.warn('[自动导入] ⚠️  PDF封面提取返回空值');
            metadata.cover_url = null;
        }
      } catch (error: any) {
          console.error('[自动导入] ❌ PDF封面提取失败:', error.message);
          console.error('[自动导入] 错误堆栈:', error.stack);
        metadata.cover_url = null;
      }
    }

      // 7. 保存到数据库
      const fileSize = fs.statSync(newFilePath).size;
    const now = new Date().toISOString();

      this.db
        .prepare(`
        INSERT INTO books (
            id, title, author, description, cover_url,
            file_path, file_name, file_size, file_type, file_hash,
            is_public, uploader_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
        bookId,
        metadata.title || '未知标题',
        metadata.author || '未知作者',
        metadata.description || null,
        metadata.cover_url || null,
          newFilePath,
          newFileName,
        fileSize,
          finalFileExt.substring(1), // 去掉点号
        fileHash,
          1, // is_public
          null, // uploader_id (自动导入没有用户)
        now,
        now
      );

      console.log('[自动导入] 书籍已保存到数据库:', {
        id: bookId,
        title: metadata.title,
        author: metadata.author,
      });

      // 8. 删除原文件
      this.deleteFile(file.filePath);

      // 如果转换了文件，也删除转换后的临时文件
      if (finalFilePath !== file.filePath && finalFilePath !== newFilePath) {
        this.deleteFile(finalFilePath);
      }

      return {
        success: true,
        bookId,
        bookTitle: metadata.title || '未知标题',
      };
  } catch (error: any) {
      console.error('[自动导入] 处理文件失败:', error);
    return {
      success: false,
        error: error.message,
    };
  }
}

/**
   * 删除文件
 */
  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[自动导入] 已删除原文件:', filePath);
      }
    } catch (error: any) {
      console.error('[自动导入] 删除文件失败:', filePath, error.message);
    }
  }
}
