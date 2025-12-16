/**
 * @file books.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { searchBookByName, getBookByISBN } from '../utils/douban';
import { convertTxtToEpub, convertMobiToEpub } from '../utils/epubConverter';
import { extractEpubMetadata } from '../utils/epubParser';
import { extractPdfCover } from '../utils/pdfCoverExtractor';
import { generateOfficeCover } from '../utils/officeCoverGenerator';
import { convertOfficeToPdf, checkLibreOfficeAvailable } from '../utils/officeToPdfConverter';
import { extractPdfMetadata } from '../utils/pdfMetadataExtractor';
import nodemailer from 'nodemailer';
import { calculateFileHash } from '../utils/fileHash';
import {
  generateBookPath,
  generateBookFileName,
  ensureDirectoryExists,
  moveFile,
  findBookByHash,
  findSameBookOtherFormats,
  findSameBookSameFormat,
  findAllBookFormats,
  createImportHistory,
} from '../utils/bookStorage';

// 获取当前UTC时间（ISO格式）
const getCurrentUTCTime = () => new Date().toISOString();
import { extractTagsFromDouban, mergeTags } from '../utils/tagHelper';
import * as iconv from 'iconv-lite';

// 修复文件名编码问题（处理中文乱码）
function fixFileNameEncoding(fileName: string): string {
  try {
    // 如果文件名已经是正确的UTF-8，直接返回
    const utf8Test = Buffer.from(fileName, 'utf8').toString('utf8');
    if (utf8Test === fileName && !/[\uFFFD]/.test(fileName) && /^[\x00-\x7F\u4e00-\u9fff\s\-_\.\(\)\[\]]+$/.test(fileName)) {
      return fileName;
    }

    console.log('[文件名编码修复] 原始文件名:', fileName);
    console.log('[文件名编码修复] 原始文件名Buffer (hex):', Buffer.from(fileName).toString('hex'));

    // 方法1: 尝试从Latin1解码（multer默认使用latin1）
    try {
      const latin1Buffer = Buffer.from(fileName, 'latin1');
      const utf8Decoded = latin1Buffer.toString('utf8');
      // 检查解码后的字符串是否包含中文字符且没有乱码
      if (!/[\uFFFD]/.test(utf8Decoded) && /[\u4e00-\u9fff]/.test(utf8Decoded)) {
        console.log('[文件名编码修复] ✅ 使用Latin1->UTF8解码:', utf8Decoded);
        return utf8Decoded;
      }
    } catch (e) {
      // 忽略Latin1解码错误
    }

    // 方法2: 尝试使用iconv-lite从GBK/GB2312解码（常见的中文编码）
    try {
      const gbkDecoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'gbk');
      if (!/[\uFFFD]/.test(gbkDecoded) && /[\u4e00-\u9fff]/.test(gbkDecoded)) {
        console.log('[文件名编码修复] ✅ 使用GBK解码:', gbkDecoded);
        return gbkDecoded;
      }
    } catch (e) {
      // 忽略GBK解码错误
    }

    // 方法3: 尝试使用iconv-lite从GB2312解码
    try {
      const gb2312Decoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'gb2312');
      if (!/[\uFFFD]/.test(gb2312Decoded) && /[\u4e00-\u9fff]/.test(gb2312Decoded)) {
        console.log('[文件名编码修复] ✅ 使用GB2312解码:', gb2312Decoded);
        return gb2312Decoded;
      }
    } catch (e) {
      // 忽略GB2312解码错误
    }

    // 方法4: 尝试从binary解码
    try {
      const binaryBuffer = Buffer.from(fileName, 'binary');
      const utf8FromBinary = binaryBuffer.toString('utf8');
      if (!/[\uFFFD]/.test(utf8FromBinary) && /[\u4e00-\u9fff]/.test(utf8FromBinary)) {
        console.log('[文件名编码修复] ✅ 使用binary->UTF8解码:', utf8FromBinary);
        return utf8FromBinary;
      }
    } catch (e) {
      // 忽略binary解码错误
    }

    // 方法5: 尝试直接使用iconv-lite从UTF-8解码（处理双重编码）
    try {
      const doubleEncoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'utf8');
      if (!/[\uFFFD]/.test(doubleEncoded) && /[\u4e00-\u9fff]/.test(doubleEncoded)) {
        console.log('[文件名编码修复] ✅ 使用双重UTF-8解码:', doubleEncoded);
        return doubleEncoded;
      }
    } catch (e) {
      // 忽略双重编码解码错误
    }

    // 方法6: 如果包含乱码字符，尝试修复
    if (/[\uFFFD]/.test(fileName)) {
      try {
        // 将文件名作为字节序列重新解释
        const bytes = Buffer.from(fileName, 'latin1');
        const fixed = bytes.toString('utf8');
        if (!/[\uFFFD]/.test(fixed) && fixed.length > 0) {
          console.log('[文件名编码修复] ✅ 使用字节序列修复:', fixed);
          return fixed;
        }
      } catch (e) {
        // 忽略修复错误
      }
    }

    // 如果所有方法都失败，返回原文件名
    console.warn('[文件名编码修复] ⚠️ 无法修复编码，使用原文件名:', fileName);
    return fileName;
  } catch (error) {
    console.error('[文件名编码修复] ❌ 修复过程出错:', error);
    return fileName;
  }
}

const router = express.Router();

// Office 文档类型列表
const OFFICE_TYPES = ['.docx', '.doc', '.xlsx', '.xls', '.pptx'];
const booksDir = process.env.BOOKS_DIR || './books';

// 配置multer用于文件上传（临时存储，后续会移动到正确位置）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(booksDir, '.temp');
    ensureDirectoryExists(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.epub', '.pdf', '.txt', '.mobi', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  },
});

// 配置multer用于封面图片上传
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(booksDir, '.temp');
    ensureDirectoryExists(tempDir);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `cover_${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式，仅支持 JPG、PNG、GIF、WebP'));
    }
  },
});


// 上传书籍
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    // 获取上传选项
    const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
    const autoConvertTxt = req.body.autoConvertTxt !== 'false' && req.body.autoConvertTxt !== false;
    const autoConvertMobi = req.body.autoConvertMobi !== 'false' && req.body.autoConvertMobi !== false;
    const selectedCategory = req.body.category || '未分类';
    
    // 获取用户信息
    const userId = req.userId!;
    const username = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;

    let filePath = req.file.path;
    // 修复文件名编码问题（处理乱码）- 对所有文件类型生效
    let fileName = fixFileNameEncoding(req.file.originalname);
    console.log('[文件上传] 原始文件名:', req.file.originalname);
    console.log('[文件上传] 修复后文件名:', fileName);
    let fileSize = req.file.size;
    let fileExt = path.extname(fileName).toLowerCase();
    let metadata: any = {};

    // 如果是txt文件，根据设置决定是否转换为epub
    if (fileExt === '.txt' && autoConvertTxt) {
      const title = req.body.title || path.basename(fileName, '.txt');
      const author = req.body.author || '未知作者';
      const epubPath = await convertTxtToEpub(filePath, title, author);
      // 删除原始txt文件
      fs.unlinkSync(filePath);
      // 更新文件路径和元数据
      filePath = epubPath;
      fileSize = fs.statSync(epubPath).size;
      fileExt = '.epub';
      metadata = { title, author };
    } else if (fileExt === '.txt') {
      // 不转换，直接使用txt文件
      metadata = {
        title: req.body.title || path.basename(fileName, '.txt'),
        author: req.body.author || '未知作者',
      };
    } else if (fileExt === '.epub') {
      // EPUB格式：先提取元数据（不保存封面，只获取信息）
      try {
        // 不传入bookDir，只提取元数据
        metadata = await extractEpubMetadata(filePath);
        console.log('EPUB元数据提取结果:', {
          title: metadata.title,
          author: metadata.author,
          cover_url: metadata.cover_url
        });
      } catch (error: any) {
        console.error('提取epub元数据失败:', error);
        metadata = {
          title: path.basename(fileName, '.epub'),
          author: '未知作者',
        };
      }
    } else if (fileExt === '.pdf') {
      // PDF格式：先提取元数据
      try {
        const pdfMetadata = await extractPdfMetadata(filePath);
        metadata = {
          title: pdfMetadata.title || path.basename(fileName, fileExt),
          author: pdfMetadata.author || '未知作者',
          subject: pdfMetadata.subject,
          creator: pdfMetadata.creator,
          producer: pdfMetadata.producer,
          keywords: pdfMetadata.keywords,
          cover_url: 'pdf-cover', // 标记需要从PDF提取封面
        };
        console.log('PDF元数据提取结果:', {
          title: metadata.title,
          author: metadata.author,
          subject: metadata.subject,
        });
      } catch (error: any) {
        console.error('提取PDF元数据失败:', error);
        // 如果提取失败，使用文件名作为标题（处理编码问题）
        let fallbackTitle = path.basename(fileName, fileExt);
        // 尝试修复文件名编码问题
        try {
          // 如果文件名看起来是乱码，尝试从UTF-8解码
          if (/[\uFFFD\u0000-\u001F]/.test(fallbackTitle)) {
            const buffer = Buffer.from(fallbackTitle, 'latin1');
            fallbackTitle = buffer.toString('utf8');
          }
        } catch (e) {
          // 如果解码失败，使用原文件名
        }
        metadata = {
          title: fallbackTitle,
          author: '未知作者',
          cover_url: 'pdf-cover',
        };
      }
    } else if (fileExt === '.mobi') {
      // MOBI格式：同时保存MOBI和EPUB格式
      console.log('[MOBI上传] 检测到MOBI文件:', {
        fileName,
        filePath,
        autoConvertMobi,
        fileSize: req.file.size,
      });
      
      // 先提取MOBI的元数据（使用文件名）
        metadata = {
          title: path.basename(fileName, '.mobi'),
          author: '未知作者',
        };
      
      // 如果启用自动转换，将在保存MOBI后继续处理EPUB
      // 这里先不转换，等MOBI保存后再转换并保存EPUB
    } else {
      // 其他格式（包括 Office 文档），使用文件名作为标题
      metadata = {
        title: path.basename(fileName, fileExt),
        author: '未知作者',
      };
    }

    // Office 文档：尝试转换为 PDF（如果 LibreOffice 可用）
    let pdfBookId: string | null = null;
    if (OFFICE_TYPES.includes(fileExt)) {
      try {
        const isLibreOfficeAvailable = await checkLibreOfficeAvailable();
        if (isLibreOfficeAvailable) {
          console.log('[Office转PDF] 开始转换 Office 文件为 PDF:', fileName);
          // 先保存原始文件，然后再转换
          // 转换将在文件保存后进行
        } else {
          console.warn('[Office转PDF] LibreOffice 未安装，跳过 PDF 转换');
        }
      } catch (error: any) {
        console.warn('[Office转PDF] 检查 LibreOffice 失败:', error.message);
      }
    }

    // 获取自动获取豆瓣信息的设置
    const autoFetchDoubanSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('auto_fetch_douban') as any;
    const autoFetchDouban = autoFetchDoubanSetting?.value === 'true';

    // 尝试从豆瓣获取更详细的书籍信息
    if (autoFetchDouban && metadata.title) {
      try {
        const searchResults = await searchBookByName(metadata.title);
        if (searchResults.length > 0) {
          const doubanInfo = searchResults[0];
          // 提取标签
          const doubanTags = extractTagsFromDouban(doubanInfo.tags);
          metadata = {
            ...metadata,
            title: doubanInfo.title || metadata.title,
            author: Array.isArray(doubanInfo.author) 
              ? doubanInfo.author.join(', ') 
              : doubanInfo.author || metadata.author,
            isbn: doubanInfo.isbn || metadata.isbn,
            publisher: doubanInfo.publisher || metadata.publisher,
            publish_date: doubanInfo.pubdate || metadata.publish_date,
            description: doubanInfo.summary || metadata.description,
            cover_url: doubanInfo.image || metadata.cover_url,
            rating: doubanInfo.rating?.average || metadata.rating,
            tags: doubanTags || metadata.tags,
          };
        }
      } catch (error: any) {
        console.error('搜索豆瓣信息失败:', error.message || error);
        // 如果是因为未配置API地址，记录但不影响上传流程
        if (error.message && error.message.includes('未配置')) {
          console.warn('豆瓣API未配置，跳过自动获取书籍信息');
        }
      }
    }

    // 计算文件hash
    const fileHash = await calculateFileHash(filePath);

    // 检查是否已存在相同hash的书籍
    const existingBook = findBookByHash(db, fileHash);
    if (existingBook) {
      // 删除临时文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // 创建导入历史记录
      createImportHistory(
        db,
        userId,
        fileName,
        filePath,
        'skipped',
        '该书籍已存在（相同hash）',
        existingBook.id
      );
      // 返回已存在的书籍信息，而不是错误
      return res.json({ 
        message: '该书籍已存在',
        book: existingBook 
      });
    }

    // 获取分类（从请求体或默认为"未分类"）
    const category = selectedCategory || metadata.category || '未分类';

    // 获取最终标题和作者（用于去重检查）
    const finalTitle = metadata.title || '未知标题';
    const finalAuthor = metadata.author || '未知作者';
    const finalFileType = fileExt.substring(1); // 去掉点号

    // 检查同一本书同格式是否已存在（避免重复上传）
    const sameFormatBook = findSameBookSameFormat(db, finalTitle, finalAuthor, finalFileType);
    if (sameFormatBook) {
      // 删除临时文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      // 创建导入历史记录
      createImportHistory(
        db,
        userId,
        fileName,
        filePath,
        'skipped',
        `该书籍的${finalFileType.toUpperCase()}格式已存在`,
        sameFormatBook.id
      );
      // 返回已存在的书籍信息
      return res.json({ 
        message: `该书籍的${finalFileType.toUpperCase()}格式已存在`,
        book: sameFormatBook 
      });
    }

    // 生成存储路径（使用已获取的finalTitle和finalAuthor）
    const bookDir = generateBookPath(
      booksDir, 
      finalTitle, 
      finalAuthor, 
      category,
      isPublic,
      username?.username
    );
    ensureDirectoryExists(bookDir);

    // 生成最终文件名
    const finalFileName = generateBookFileName(finalTitle, fileExt);
    const finalFilePath = path.join(bookDir, finalFileName);

    // 检查同一本书是否已有其他格式（相同标题和作者）
    const sameBooks = findSameBookOtherFormats(db, finalTitle, finalAuthor);
    let parentBookId: string | null = null;
    
    if (sameBooks.length > 0) {
      // 找到主书籍（没有parent_book_id的书或第一个书）
      const mainBook = sameBooks.find(b => !b.parent_book_id) || sameBooks[0];
      parentBookId = mainBook.id;
      
      // 使用已存在的书籍目录
      const existingBookDir = path.dirname(mainBook.file_path);
      const newFilePath = path.join(existingBookDir, finalFileName);
      
      // 如果文件已存在，添加hash后缀
      if (fs.existsSync(newFilePath)) {
        const hashSuffix = fileHash.substring(0, 8);
        const nameWithoutExt = path.basename(finalFileName, fileExt);
        const newFileName = `${nameWithoutExt}_${hashSuffix}${fileExt}`;
        const finalPathWithHash = path.join(existingBookDir, newFileName);
        try {
          moveFile(filePath, finalPathWithHash);
          filePath = finalPathWithHash;
        } catch (moveError: any) {
          throw new Error(`移动文件失败: ${moveError.message}`);
        }
      } else {
        try {
          moveFile(filePath, newFilePath);
          filePath = newFilePath;
        } catch (moveError: any) {
          throw new Error(`移动文件失败: ${moveError.message}`);
        }
      }
    } else {
      // 移动文件到最终位置
      try {
        moveFile(filePath, finalFilePath);
        filePath = finalFilePath;
      } catch (moveError: any) {
        throw new Error(`移动文件失败: ${moveError.message}`);
      }
    }

    // 文件已保存到最终位置，现在提取封面
    // EPUB格式：从EPUB中提取封面
    if (fileExt === '.epub' && (!metadata.cover_url || metadata.cover_url === 'cover')) {
      try {
        console.log('提取EPUB封面，目标目录:', bookDir);
        const coverMetadata = await extractEpubMetadata(filePath, bookDir);
        if (coverMetadata.cover_url && coverMetadata.cover_url !== 'cover') {
          metadata.cover_url = coverMetadata.cover_url;
          console.log('EPUB封面提取成功:', metadata.cover_url);
        } else {
          console.warn('EPUB封面提取失败或未找到封面');
          metadata.cover_url = null;
        }
      } catch (error: any) {
        console.error('提取EPUB封面失败:', error);
        metadata.cover_url = null;
      }
    }
    
    // PDF格式：从PDF第一页提取封面
    if (fileExt === '.pdf' && (!metadata.cover_url || metadata.cover_url === 'pdf-cover')) {
      try {
        console.log('提取PDF封面，目标目录:', bookDir);
        const coverUrl = await extractPdfCover(filePath, bookDir);
        if (coverUrl) {
          metadata.cover_url = coverUrl;
          console.log('PDF封面提取成功:', metadata.cover_url);
        } else {
          console.warn('PDF封面提取失败');
          metadata.cover_url = null;
        }
      } catch (error: any) {
        console.error('提取PDF封面失败:', error);
        metadata.cover_url = null;
      }
    }

    // Office 文档和 Markdown：生成统一风格的封面
    const officeAndMarkdownTypes = [...OFFICE_TYPES, '.md'];
    if (officeAndMarkdownTypes.includes(fileExt) && !metadata.cover_url) {
      try {
        console.log('生成Office文档封面，目标目录:', bookDir);
        const coverUrl = await generateOfficeCover(finalTitle, fileExt, bookDir);
        if (coverUrl) {
          metadata.cover_url = coverUrl;
          console.log('Office文档封面生成成功:', metadata.cover_url);
        }
      } catch (error: any) {
        console.error('生成Office文档封面失败:', error);
        metadata.cover_url = null;
      }
    }

    // 保存到数据库
    const bookId = uuidv4();
    const now = getCurrentUTCTime();

    try {
      db.prepare(`
        INSERT INTO books (
          id, title, author, isbn, publisher, publish_date,
          description, cover_url, file_path, file_name, file_size, file_type, 
          file_hash, category, language, rating, tags, uploader_id, is_public, parent_book_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bookId,
        finalTitle,
        finalAuthor,
        metadata.isbn || null,
        metadata.publisher || null,
        metadata.publish_date || null,
        metadata.description || null,
        metadata.cover_url || null,
        filePath,
        fileName, // 使用修复后的原始文件名
        fileSize,
        fileExt.substring(1), // 去掉点号
        fileHash,
        category,
        metadata.language || 'zh',
        metadata.rating || null,
        metadata.tags || null,
        userId, // 保存上传者ID
        isPublic ? 1 : 0, // 公开/私有标记
        parentBookId, // 父书籍ID（多格式支持）
        now, // 创建时间
        now  // 更新时间
      );
      
      // 创建导入历史记录
      createImportHistory(
        db,
        userId,
        fileName,
        filePath,
        'success',
        '上传成功',
        bookId
      );
    } catch (dbError: any) {
      // 如果数据库插入失败，尝试删除已移动的文件
      if (fs.existsSync(filePath) && filePath !== req.file.path) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('删除文件失败:', e);
        }
      }
      console.error('数据库插入错误:', dbError);
      throw new Error(`数据库保存失败: ${dbError.message}`);
    }

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);

    // 如果是Office文件且LibreOffice可用，转换并保存PDF格式
    if (OFFICE_TYPES.includes(fileExt)) {
      try {
        const isLibreOfficeAvailable = await checkLibreOfficeAvailable();
        if (isLibreOfficeAvailable) {
          try {
            console.log('[Office转PDF] 开始转换 Office 文件为 PDF:', fileName);
            const pdfPath = await convertOfficeToPdf(filePath, bookDir, finalTitle);
            console.log('[Office转PDF] 转换成功，PDF路径:', pdfPath);
            
            const pdfSize = fs.statSync(pdfPath).size;
            const pdfFileName = path.basename(pdfPath);
            const pdfFilePath = path.join(bookDir, pdfFileName);
            
            // 如果转换后的文件不在目标目录，移动到目标目录
            if (pdfPath !== pdfFilePath) {
              try {
                moveFile(pdfPath, pdfFilePath);
                console.log('[Office转PDF] PDF文件已移动到:', pdfFilePath);
              } catch (moveError: any) {
                console.error('[Office转PDF] 移动PDF文件失败:', moveError);
                // 如果移动失败，使用转换后的临时路径
              }
            }
            
            // 计算PDF文件hash
            const pdfHash = await calculateFileHash(pdfFilePath);
            
            // 检查是否已存在相同hash的PDF书籍
            const existingPdfBook = findBookByHash(db, pdfHash);
            if (existingPdfBook) {
              console.log('[Office转PDF] PDF文件已存在，使用已存在的书籍:', existingPdfBook.id);
              // 删除刚转换的PDF文件
              if (fs.existsSync(pdfFilePath)) {
                fs.unlinkSync(pdfFilePath);
              }
              // 不创建新的PDF书籍记录，但可以更新关联关系
            } else {
              // 创建PDF格式的书籍记录
              const pdfBookId = uuidv4();
              const pdfNow = getCurrentUTCTime();
              
              // 提取PDF元数据
              let pdfMetadata: any = {};
              try {
                const { extractPdfMetadata } = await import('../utils/pdfMetadataExtractor');
                pdfMetadata = await extractPdfMetadata(pdfFilePath);
              } catch (error: any) {
                console.warn('[Office转PDF] 提取PDF元数据失败，使用Office文档的元数据:', error);
                pdfMetadata = metadata;
              }
              
              // 提取PDF封面
              let pdfCoverUrl = metadata.cover_url;
              try {
                const coverUrl = await extractPdfCover(pdfFilePath, bookDir);
                if (coverUrl) {
                  pdfCoverUrl = coverUrl;
                }
              } catch (error: any) {
                console.warn('[Office转PDF] 提取PDF封面失败:', error);
              }
              
              db.prepare(`
                INSERT INTO books (
                  id, title, author, isbn, publisher, publish_date,
                  description, cover_url, file_path, file_name, file_size, file_type, 
                  file_hash, category, language, rating, tags, uploader_id, is_public, parent_book_id,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                pdfBookId,
                pdfMetadata.title || finalTitle,
                pdfMetadata.author || finalAuthor,
                pdfMetadata.isbn || metadata.isbn || null,
                pdfMetadata.publisher || metadata.publisher || null,
                pdfMetadata.publish_date || metadata.publish_date || null,
                pdfMetadata.description || metadata.description || null,
                pdfCoverUrl || null,
                pdfFilePath,
                pdfFileName,
                pdfSize,
                'pdf',
                pdfHash,
                category,
                pdfMetadata.language || metadata.language || 'zh',
                pdfMetadata.rating || metadata.rating || null,
                pdfMetadata.tags || metadata.tags || null,
                userId,
                isPublic ? 1 : 0,
                bookId, // 父书籍ID指向原始Office文件
                pdfNow,
                pdfNow
              );
              
              console.log('[Office转PDF] PDF格式书籍已创建:', pdfBookId);
              
              // 创建导入历史记录
              createImportHistory(
                db,
                userId,
                pdfFileName,
                pdfFilePath,
                'success',
                'Office转PDF成功',
                pdfBookId
              );
            }
          } catch (error: any) {
            console.error('[Office转PDF] 转换失败:', error);
            // 转换失败不影响原始文件的上传
          }
        } else {
          console.warn('[Office转PDF] LibreOffice 未安装，跳过 PDF 转换');
        }
      } catch (error: any) {
        console.error('[Office转PDF] 检查或转换过程出错:', error);
        // 错误不影响原始文件的上传
      }
    }

    // 如果是MOBI文件且启用了自动转换，转换并保存EPUB格式
    if (fileExt === '.mobi' && autoConvertMobi) {
      try {
        console.log('[MOBI上传] 开始转换 MOBI 到 EPUB:', fileName);
        const epubPath = await convertMobiToEpub(filePath);
        console.log('[MOBI上传] 转换成功，EPUB路径:', epubPath);
        
        const epubSize = fs.statSync(epubPath).size;
        const epubFileName = path.basename(filePath).replace(/\.mobi$/i, '.epub');
        let epubFilePath = path.join(path.dirname(filePath), epubFileName);
        
        // 移动EPUB文件到正确位置
        try {
          moveFile(epubPath, epubFilePath);
          console.log('[MOBI上传] EPUB文件已移动到:', epubFilePath);
        } catch (moveError: any) {
          console.error('[MOBI上传] 移动EPUB文件失败:', moveError);
          // 如果移动失败，使用转换后的临时路径
          epubFilePath = epubPath;
        }
        
        // 计算EPUB文件hash
        const epubHash = await calculateFileHash(epubFilePath);
        
        // 检查是否已存在相同hash的EPUB书籍
        const existingEpubBook = findBookByHash(db, epubHash);
        if (existingEpubBook) {
          console.warn('[MOBI上传] EPUB格式已存在（相同hash），跳过保存');
          // 删除转换后的临时文件
          if (fs.existsSync(epubFilePath) && epubFilePath !== existingEpubBook.file_path) {
            try {
              fs.unlinkSync(epubFilePath);
            } catch (e) {
              console.warn('[MOBI上传] 删除临时EPUB文件失败:', e);
            }
          }
        } else {
          // 尝试从转换后的 EPUB 提取元数据（优先使用EPUB的元数据）
          let epubMetadata: any = {};
          try {
            epubMetadata = await extractEpubMetadata(epubFilePath);
            console.log('[MOBI上传] MOBI转EPUB后元数据提取结果:', {
              title: epubMetadata.title,
              author: epubMetadata.author,
            });
          } catch (error: any) {
            console.warn('[MOBI上传] 提取转换后EPUB元数据失败，使用MOBI的元数据:', error);
            epubMetadata = { ...metadata };
          }
          
          // 提取EPUB封面
          if (!epubMetadata.cover_url || epubMetadata.cover_url === 'cover') {
            try {
              const coverMetadata = await extractEpubMetadata(epubFilePath, path.dirname(epubFilePath));
              if (coverMetadata.cover_url && coverMetadata.cover_url !== 'cover') {
                epubMetadata.cover_url = coverMetadata.cover_url;
                console.log('[MOBI上传] EPUB封面提取成功:', epubMetadata.cover_url);
              }
            } catch (error: any) {
              console.warn('[MOBI上传] 提取EPUB封面失败:', error);
            }
          }
          
          // 保存EPUB格式到数据库（parent_book_id指向MOBI）
          const epubBookId = uuidv4();
          const epubNow = getCurrentUTCTime();
          db.prepare(`
            INSERT INTO books (
              id, title, author, isbn, publisher, publish_date,
              description, cover_url, file_path, file_name, file_size, file_type, 
              file_hash, category, language, rating, tags, uploader_id, is_public, parent_book_id,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            epubBookId,
            epubMetadata.title || finalTitle,
            epubMetadata.author || finalAuthor,
            epubMetadata.isbn || metadata.isbn || null,
            epubMetadata.publisher || metadata.publisher || null,
            epubMetadata.publish_date || metadata.publish_date || null,
            epubMetadata.description || metadata.description || null,
            epubMetadata.cover_url || metadata.cover_url || null,
            epubFilePath,
            path.basename(epubFilePath),
            epubSize,
            'epub',
            epubHash,
            category,
            epubMetadata.language || metadata.language || 'zh',
            epubMetadata.rating || metadata.rating || null,
            epubMetadata.tags || metadata.tags || null,
            userId,
            isPublic ? 1 : 0,
            bookId, // parent_book_id指向MOBI文件
            epubNow, // 创建时间
            epubNow  // 更新时间
          );
          
          console.log('[MOBI上传] EPUB格式已保存，ID:', epubBookId);
        }
      } catch (error: any) {
        console.error('[MOBI上传] MOBI转EPUB失败:', {
          error: error.message,
          stack: error.stack,
        });
        
        // 转换失败：删除MOBI书籍记录和文件，防止乱码显示
        console.error('[MOBI上传] EPUB转换失败，删除MOBI书籍记录和文件');
        
        try {
          // 删除数据库记录
          db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
          console.log('[MOBI上传] 已删除MOBI书籍数据库记录:', bookId);
          
          // 删除文件
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('[MOBI上传] 已删除MOBI文件:', filePath);
          }
          
          // 删除封面文件（如果存在）
          if (metadata.cover_url && fs.existsSync(metadata.cover_url)) {
            try {
              fs.unlinkSync(metadata.cover_url);
              console.log('[MOBI上传] 已删除封面文件:', metadata.cover_url);
            } catch (e) {
              console.warn('[MOBI上传] 删除封面文件失败:', e);
            }
          }
          
          // 创建导入历史记录
          createImportHistory(
            db,
            userId,
            fileName,
            filePath,
            'error',
            `MOBI转EPUB失败: ${error.message}`,
            undefined
          );
        } catch (deleteError: any) {
          console.error('[MOBI上传] 删除MOBI书籍失败:', deleteError);
        }
        
        // 返回错误响应
        return res.status(500).json({
          error: 'MOBI转EPUB失败，书籍已删除',
          details: error.message,
        });
      }
    }

    // 如果是私有书籍，自动添加到用户书架
    if (!isPublic) {
      try {
        const shelfId = uuidv4();
        db.prepare(`
          INSERT OR IGNORE INTO user_shelves (id, user_id, book_id)
          VALUES (?, ?, ?)
        `).run(shelfId, userId, bookId);
        console.log(`私有书籍已自动添加到用户书架: ${bookId}`);
      } catch (shelfError) {
        console.warn('添加到书架失败:', shelfError);
        // 不影响上传流程，继续
      }
    }

    res.status(201).json({
      message: '书籍上传成功',
      book,
    });
  } catch (error: any) {
    console.error('========================================');
    console.error('[上传书籍] 发生错误:', error.message || error);
    console.error('[上传书籍] 错误堆栈:', error.stack);
    console.error('[上传书籍] 文件信息:', {
      originalname: req.file?.originalname,
      filename: req.file?.filename,
      path: req.file?.path,
      size: req.file?.size,
    });
    console.error('[上传书籍] 请求信息:', {
      userId: req.userId,
      body: {
        isPublic: req.body.isPublic,
        autoConvertTxt: req.body.autoConvertTxt,
        autoConvertMobi: req.body.autoConvertMobi,
        category: req.body.category,
      }
    });
    console.error('========================================');
    
    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('[上传书籍] 临时文件已清理:', req.file.path);
      } catch (e: any) {
        console.error('[上传书籍] 清理临时文件失败:', e.message);
      }
    }
    
    // 返回详细的错误信息
    const errorMessage = error.message || '上传失败';
    const errorDetails = process.env.NODE_ENV === 'development' ? error.stack : undefined;
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      fileName: req.file?.originalname,
    });
  }
});

// 从豆瓣搜索书籍信息
router.get('/:id/search-douban', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    console.log('[搜索豆瓣] 开始搜索，书籍ID:', id);
    
    // 获取书籍信息
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      console.log('[搜索豆瓣] 书籍不存在:', id);
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 使用书名搜索豆瓣
    const searchQuery = book.title;
    console.log('[搜索豆瓣] 书籍标题:', searchQuery);
    if (!searchQuery) {
      return res.status(400).json({ error: '书籍标题为空，无法搜索' });
    }

    console.log('[搜索豆瓣] 调用 searchBookByName...');
    const searchResults = await searchBookByName(searchQuery);
    console.log('[搜索豆瓣] 搜索结果数量:', searchResults.length);
    
    // 格式化结果
    const formattedResults = searchResults.map((item) => ({
      id: item.id,
      title: item.title,
      author: Array.isArray(item.author) ? item.author.join(', ') : item.author,
      isbn: item.isbn,
      publisher: item.publisher,
      pubdate: item.pubdate,
      summary: item.summary,
      image: item.image,
      rating: item.rating?.average,
      tags: item.tags,
    }));

    res.json({ results: formattedResults });
  } catch (error: any) {
    console.error('[搜索豆瓣] 错误详情:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
    });
    
    // 判断错误类型
    let statusCode = 500;
    let errorMessage = '搜索失败';
    
    if (error.message && error.message.includes('未配置')) {
      statusCode = 400;
      errorMessage = '豆瓣API地址未配置，请在系统设置中配置豆瓣API地址';
    } else if (error.message && error.message.includes('搜索书籍失败')) {
      statusCode = 502; // Bad Gateway - API服务问题
      errorMessage = error.message;
    } else if (error.response) {
      // HTTP错误响应
      statusCode = error.response.status >= 400 && error.response.status < 500 ? 400 : 502;
      errorMessage = `豆瓣API请求失败: ${error.response.statusText || error.message}`;
    } else if (error.request) {
      // 请求已发出但没有收到响应
      statusCode = 503; // Service Unavailable
      errorMessage = '无法连接到豆瓣API服务，请检查API地址和网络连接';
    } else {
      // 其他错误
      errorMessage = error.message || '搜索失败，请检查豆瓣API配置';
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 应用豆瓣书籍信息到数据库
router.post('/:id/apply-douban-info', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      author,
      isbn,
      publisher,
      pubdate,
      summary,
      image,
      rating,
      tags,
      replaceCover, // 是否替换封面图片
    } = req.body;

    // 检查书籍是否存在
    const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!existingBook) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 处理标签
    let finalTags = existingBook.tags;
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const doubanTags = extractTagsFromDouban(tags);
      if (doubanTags) {
        finalTags = mergeTags(existingBook.tags, doubanTags);
      }
    }

    // 处理作者（如果是数组，转换为字符串）
    const finalAuthor = Array.isArray(author) ? author.join(', ') : (author || existingBook.author);

    // 构建更新数据
    const updateData: any = {
      title: title || existingBook.title,
      author: finalAuthor,
      // 只有当isbn有值时才更新，空字符串、null、undefined都保持原值
      isbn: (isbn && isbn.trim() !== '') ? isbn.trim() : existingBook.isbn,
      publisher: publisher || existingBook.publisher,
      publish_date: pubdate || existingBook.publish_date,
      description: summary || existingBook.description,
      cover_url: existingBook.cover_url, // 默认保持原封面，后面根据replaceCover决定是否更新
      rating: rating || existingBook.rating,
      tags: finalTags,
      updated_at: new Date().toISOString(),
    };

    // 检查是否需要移动文件（如果标题或作者改变）
    const needMoveFile = 
      (title && title !== existingBook.title) ||
      (finalAuthor && finalAuthor !== existingBook.author);

    let newFilePath = existingBook.file_path;

    if (needMoveFile && fs.existsSync(existingBook.file_path)) {
      // 生成新路径
      const newBookDir = generateBookPath(
        booksDir,
        updateData.category || existingBook.category || '未分类',
        finalAuthor || '未知作者',
        title || existingBook.title
      );
      
      if (!fs.existsSync(newBookDir)) {
        fs.mkdirSync(newBookDir, { recursive: true });
      }

      const fileName = path.basename(existingBook.file_path);
      newFilePath = path.join(newBookDir, fileName);

      // 移动文件
      if (fs.existsSync(newFilePath)) {
        // 如果目标文件已存在，添加时间戳
        const ext = path.extname(fileName);
        const name = path.basename(fileName, ext);
        newFilePath = path.join(newBookDir, `${name}_${Date.now()}${ext}`);
      }

      fs.renameSync(existingBook.file_path, newFilePath);
      updateData.file_path = newFilePath;
    }

    // 如果有封面图片URL且用户确认替换，下载并保存
    if (image && image.startsWith('http') && replaceCover) {
      try {
        console.log('[应用豆瓣信息] 开始下载封面图片:', image);
        const coverResponse = await axios.get(image, { 
          responseType: 'arraybuffer', 
          timeout: 30000, // 增加超时时间到30秒
          httpsAgent: image.startsWith('https://') ? new https.Agent({
            rejectUnauthorized: false,
          }) : undefined,
        });
        const coverBuffer = Buffer.from(coverResponse.data);
        
        // 使用最终的文件路径来确定书籍目录
        const finalBookPath = updateData.file_path || existingBook.file_path;
        const bookDir = path.dirname(finalBookPath);
        
        // 确保目录存在
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
            const urlPath = new URL(image).pathname;
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
        
        // 删除旧封面文件（如果存在且是本地文件）
        if (existingBook.cover_url && existingBook.cover_url.startsWith('/books/')) {
          const oldCoverPath = path.join(booksDir, existingBook.cover_url.replace('/books/', ''));
          if (fs.existsSync(oldCoverPath) && oldCoverPath !== coverFilePath) {
            try {
              fs.unlinkSync(oldCoverPath);
              console.log('[应用豆瓣信息] 已删除旧封面文件:', oldCoverPath);
            } catch (unlinkError) {
              console.warn('[应用豆瓣信息] 删除旧封面失败:', unlinkError);
            }
          }
        }
        
        // 写入新封面文件
        fs.writeFileSync(coverFilePath, coverBuffer);
        
        const relativePath = path.relative(booksDir, coverFilePath);
        updateData.cover_url = `/books/${relativePath.replace(/\\/g, '/')}`;
        
        console.log('[应用豆瓣信息] 封面图片已下载并保存:', {
          coverFilePath,
          coverUrl: updateData.cover_url,
          bookDir,
          fileSize: coverBuffer.length,
          detectedFormat: coverExt,
        });
      } catch (coverError: any) {
        console.error('[应用豆瓣信息] 下载封面图片失败:', coverError.message);
        // 下载失败，保持原有封面
        updateData.cover_url = existingBook.cover_url;
        console.log('[应用豆瓣信息] 下载失败，保持原有封面');
      }
    } else if (image && image.startsWith('http') && !replaceCover) {
      // 如果用户选择不替换封面，保持原有封面
      updateData.cover_url = existingBook.cover_url;
      console.log('[应用豆瓣信息] 用户选择不替换封面，保持原有封面:', updateData.cover_url);
    }

    // 更新数据库
    db.prepare(`
      UPDATE books SET
        title = ?,
        author = ?,
        isbn = ?,
        publisher = ?,
        publish_date = ?,
        description = ?,
        cover_url = ?,
        rating = ?,
        tags = ?,
        file_path = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      updateData.title,
      updateData.author,
      updateData.isbn,
      updateData.publisher,
      updateData.publish_date,
      updateData.description,
      updateData.cover_url,
      updateData.rating,
      updateData.tags,
      updateData.file_path || existingBook.file_path,
      updateData.updated_at,
      id
    );

    res.json({ message: '书籍信息已更新', book: { ...existingBook, ...updateData } });
  } catch (error: any) {
    console.error('应用豆瓣信息失败:', error);
    res.status(500).json({ error: '更新失败', message: error.message });
  }
});

// 搜索书籍（从豆瓣）
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: '请提供搜索关键词' });
    }

    const results = await searchBookByName(q);
    res.json({ books: results });
  } catch (error: any) {
    console.error('搜索书籍错误:', error);
    const statusCode = error.message && error.message.includes('未配置') ? 400 : 500;
    res.status(statusCode).json({ 
      error: error.message || '搜索失败',
      message: error.message || '搜索失败，请检查豆瓣API配置'
    });
  }
});

// 获取所有书籍（支持公开/私有筛选）
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, sort = 'created_at', order = 'desc', scope, category } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // 从Authorization头获取用户ID（如果有）
    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
      }
    } catch (e) {
      // 忽略token验证错误，未登录用户也可以查看公开书籍
    }

    // 使用 LEFT JOIN 获取上传者用户名
    let query = `
      SELECT 
        b.*,
        u.username as uploader_username
      FROM books b
      LEFT JOIN users u ON b.uploader_id = u.id
    `;
    const params: any[] = [];
    let countQuery = 'SELECT COUNT(*) as count FROM books b';
    const countParams: any[] = [];
    const conditions: string[] = [];

    // 只查询主书籍（没有parent_book_id的书籍），避免多格式重复显示
    conditions.push('b.parent_book_id IS NULL');

    // 根据scope参数筛选
    if (scope === 'public') {
      // 仅公开书籍
      conditions.push('b.is_public = 1');
    } else if (scope === 'private' && userId) {
      // 仅用户的私有书籍
      conditions.push('b.is_public = 0 AND b.uploader_id = ?');
      params.push(userId);
      countParams.push(userId);
    } else if (userId) {
      // 所有公开书籍 + 用户的私有书籍
      conditions.push('(b.is_public = 1 OR b.uploader_id = ?)');
      params.push(userId);
      countParams.push(userId);
    } else {
      // 未登录用户只能看公开书籍
      conditions.push('b.is_public = 1');
    }

    // 书籍分类筛选
    if (category && category !== 'all') {
      conditions.push('b.category = ?');
      params.push(category);
      countParams.push(category);
    }

    // 搜索条件
    if (search) {
      conditions.push('(b.title LIKE ? OR b.author LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`);
    }

    // 应用条件
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      // countQuery 也使用表别名 b，所以可以直接使用相同的条件
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    // 排序
    const validSortFields = ['created_at', 'title', 'author', 'rating', 'updated_at'];
    const sortField = validSortFields.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    // 排序字段需要加表别名
    query += ` ORDER BY b.${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(Number(limit), offset);

    const books = db.prepare(query).all(...params) as any[];
    const total = db.prepare(countQuery).get(...countParams) as any;

    // 对于MOBI格式的书籍，优先使用EPUB版本的封面
    const processedBooks = books.map((book: any) => {
      if (book.file_type && book.file_type.toLowerCase() === 'mobi') {
        // 查找EPUB格式的版本
        const epubBook = db.prepare('SELECT * FROM books WHERE parent_book_id = ? AND file_type = ?').get(book.id, 'epub') as any;
        if (epubBook && epubBook.cover_url) {
          // 使用EPUB版本的封面
          book.cover_url = epubBook.cover_url;
        }
      }
      return book;
    });

    res.json({
      books: processedBooks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: total.count,
      },
    });
  } catch (error: any) {
    console.error('获取书籍列表错误:', error);
    res.status(500).json({ error: '获取书籍列表失败' });
  }
});

// 获取书籍分类统计
router.get('/categories', async (req, res) => {
  try {
    // 从Authorization头获取用户ID（如果有）
    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
      }
    } catch (e) {
      // 忽略token验证错误
    }

    // 构建基础查询条件（与GET /books保持一致）
    const conditions: string[] = ['parent_book_id IS NULL'];
    const params: any[] = [];

    // 根据用户权限筛选
    if (userId) {
      // 所有公开书籍 + 用户的私有书籍
      conditions.push('(is_public = 1 OR uploader_id = ?)');
      params.push(userId);
    } else {
      // 未登录用户只能看公开书籍
      conditions.push('is_public = 1');
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    // 按书籍分类分组统计
    const categoryStats = db.prepare(`
      SELECT 
        category,
        COUNT(*) as count
      FROM books
      ${whereClause}
      GROUP BY category
      HAVING COUNT(*) > 0
      ORDER BY count DESC, category ASC
    `).all(...params) as Array<{ category: string; count: number }>;

    res.json({ categories: categoryStats });
  } catch (error: any) {
    console.error('获取书籍分类统计错误:', error);
    res.status(500).json({ error: '获取书籍分类统计失败' });
  }
});

// 获取最近新增的书籍
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // 从Authorization头获取用户ID（如果有）
    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
      }
    } catch (e) {
      // 忽略token验证错误
    }

    let query = 'SELECT * FROM books WHERE parent_book_id IS NULL AND ';
    const params: any[] = [];

    if (userId) {
      // 登录用户：公开书籍 + 自己的私有书籍
      query += '(is_public = 1 OR uploader_id = ?)';
      params.push(userId);
    } else {
      // 未登录：仅公开书籍
      query += 'is_public = 1';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit));

    const books = db.prepare(query).all(...params) as any[];
    
    // 对于MOBI格式的书籍，优先使用EPUB版本的封面
    const processedBooks = books.map((book: any) => {
      if (book.file_type && book.file_type.toLowerCase() === 'mobi') {
        // 查找EPUB格式的版本
        const epubBook = db.prepare('SELECT * FROM books WHERE parent_book_id = ? AND file_type = ?').get(book.id, 'epub') as any;
        if (epubBook && epubBook.cover_url) {
          // 使用EPUB版本的封面
          book.cover_url = epubBook.cover_url;
        }
      }
      return book;
    });
    
    res.json({ books: processedBooks });
  } catch (error: any) {
    console.error('获取最近新增书籍错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取高分书籍（好书推荐）
router.get('/recommended', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // 从Authorization头获取用户ID（如果有）
    let userId: string | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.userId;
      }
    } catch (e) {
      // 忽略token验证错误
    }

    let query = 'SELECT * FROM books WHERE parent_book_id IS NULL AND rating IS NOT NULL AND rating >= 7';
    const params: any[] = [];

    if (userId) {
      // 登录用户：公开书籍 + 自己的私有书籍
      query += ' AND (is_public = 1 OR uploader_id = ?)';
      params.push(userId);
    } else {
      // 未登录：仅公开书籍
      query += ' AND is_public = 1';
    }

    query += ' ORDER BY RANDOM() LIMIT ?';
    params.push(Number(limit));

    const books = db.prepare(query).all(...params) as any[];
    
    // 对于MOBI格式的书籍，优先使用EPUB版本的封面
    const processedBooks = books.map((book: any) => {
      if (book.file_type && book.file_type.toLowerCase() === 'mobi') {
        // 查找EPUB格式的版本
        const epubBook = db.prepare('SELECT * FROM books WHERE parent_book_id = ? AND file_type = ?').get(book.id, 'epub') as any;
        if (epubBook && epubBook.cover_url) {
          // 使用EPUB版本的封面
          book.cover_url = epubBook.cover_url;
        }
      }
      return book;
    });
    
    res.json({ books: processedBooks });
  } catch (error: any) {
    console.error('获取推荐书籍错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 上传封面图片（文件上传）
router.post('/:id/upload-cover', authenticateToken, uploadCover.single('cover'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole || 'user';

    // 获取书籍信息
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 权限检查：管理员或上传者可以修改
    if (userRole !== 'admin' && book.uploader_id !== userId) {
      return res.status(403).json({ error: '无权修改此书籍' });
    }

    // 检查文件是否上传
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const tempFilePath = req.file.path;
    const bookDir = path.dirname(book.file_path);
    
    // 确保书籍目录存在
    ensureDirectoryExists(bookDir);

    // 确定封面文件扩展名
    const ext = path.extname(req.file.originalname).toLowerCase();
    const coverFileName = `cover${ext}`;
    const coverFilePath = path.join(bookDir, coverFileName);

    try {
      // 删除旧封面（如果存在）
      if (book.cover_url && book.cover_url.startsWith('/books/')) {
        const oldCoverPath = path.join(booksDir, book.cover_url.replace('/books/', ''));
        if (fs.existsSync(oldCoverPath)) {
          fs.unlinkSync(oldCoverPath);
          console.log('[上传封面] 已删除旧封面:', oldCoverPath);
        }
      }

      // 移动文件到书籍目录
      moveFile(tempFilePath, coverFilePath);

      // 生成相对路径
      const relativePath = path.relative(booksDir, coverFilePath);
      const coverUrl = `/books/${relativePath.replace(/\\/g, '/')}`;

      // 更新数据库
      db.prepare('UPDATE books SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(coverUrl, id);

      console.log('[上传封面] 封面上传成功:', { bookTitle: book.title, coverUrl });
      res.json({ message: '封面上传成功', cover_url: coverUrl });
    } catch (error: any) {
      // 清理临时文件
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[上传封面] 错误:', error);
    res.status(500).json({ error: '上传封面失败', message: error.message });
  }
});

// 从URL下载封面图片
router.post('/:id/cover-from-url', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { imageUrl } = req.body;
    const userId = req.userId!;
    const userRole = req.userRole || 'user';

    // 验证URL
    if (!imageUrl || !imageUrl.startsWith('http')) {
      return res.status(400).json({ error: '请提供有效的图片URL' });
    }

    // 获取书籍信息
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 权限检查：管理员或上传者可以修改
    if (userRole !== 'admin' && book.uploader_id !== userId) {
      return res.status(403).json({ error: '无权修改此书籍' });
    }

    const bookDir = path.dirname(book.file_path);
    ensureDirectoryExists(bookDir);

    try {
      console.log('[从URL下载封面] 开始下载:', imageUrl);
      
      // 下载图片
      const coverResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30秒超时
        httpsAgent: imageUrl.startsWith('https://') ? new https.Agent({
          rejectUnauthorized: false,
        }) : undefined,
      });

      const coverBuffer = Buffer.from(coverResponse.data);
      
      // 检测图片格式
      let coverExt = '.jpg'; // 默认
      
      // 从Content-Type检测
      const contentType = coverResponse.headers['content-type'];
      if (contentType) {
        if (contentType.includes('png')) coverExt = '.png';
        else if (contentType.includes('webp')) coverExt = '.webp';
        else if (contentType.includes('gif')) coverExt = '.gif';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) coverExt = '.jpg';
      }
      
      // 从URL路径检测（作为备选）
      if (coverExt === '.jpg') {
        try {
          const urlPath = new URL(imageUrl).pathname;
          const ext = path.extname(urlPath).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            coverExt = ext;
          }
        } catch (e) {
          // URL解析失败，使用默认
        }
      }

      // 从文件头检测（最准确）
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

      // 删除旧封面（如果存在）
      if (book.cover_url && book.cover_url.startsWith('/books/')) {
        const oldCoverPath = path.join(booksDir, book.cover_url.replace('/books/', ''));
        if (fs.existsSync(oldCoverPath)) {
          fs.unlinkSync(oldCoverPath);
          console.log('[从URL下载封面] 已删除旧封面:', oldCoverPath);
        }
      }

      // 保存新封面
      fs.writeFileSync(coverFilePath, coverBuffer);

      // 生成相对路径
      const relativePath = path.relative(booksDir, coverFilePath);
      const coverUrl = `/books/${relativePath.replace(/\\/g, '/')}`;

      // 更新数据库
      db.prepare('UPDATE books SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(coverUrl, id);

      console.log('[从URL下载封面] 封面下载成功:', {
        bookTitle: book.title,
        coverUrl,
        detectedFormat: coverExt,
        fileSize: coverBuffer.length,
      });

      res.json({ message: '封面下载成功', cover_url: coverUrl });
    } catch (downloadError: any) {
      console.error('[从URL下载封面] 下载失败:', downloadError.message);
      
      if (downloadError.code === 'ECONNREFUSED') {
        return res.status(400).json({ error: '无法连接到图片服务器' });
      } else if (downloadError.code === 'ETIMEDOUT') {
        return res.status(400).json({ error: '下载超时，请检查URL是否有效' });
      } else if (downloadError.response?.status === 404) {
        return res.status(400).json({ error: '图片不存在（404）' });
      } else if (downloadError.response?.status === 403) {
        return res.status(400).json({ error: '无权访问该图片（403）' });
      }
      
      return res.status(400).json({ 
        error: '下载图片失败', 
        message: downloadError.message 
      });
    }
  } catch (error: any) {
    console.error('[从URL下载封面] 错误:', error);
    res.status(500).json({ error: '设置封面失败', message: error.message });
  }
});

// 提取封面图片（必须在 /:id 之前，确保路由正确匹配）
router.post('/:id/extract-cover', authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log('[提取封面] 收到请求，ID:', req.params.id);
    const { id } = req.params;
    const { force } = req.body; // 是否强制提取（即使已有封面也重新提取）
    
    // 获取书籍信息
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 检查文件是否存在
    if (!book.file_path) {
      return res.status(400).json({ error: '书籍文件路径不存在' });
    }
    
    if (!fs.existsSync(book.file_path)) {
      console.warn('[提取封面] 文件不存在:', book.file_path);
      return res.status(404).json({ error: '书籍文件不存在' });
    }

    // 如果已有有效的封面且不是强制提取，直接返回
    if (!force && book.cover_url && 
        book.cover_url !== 'cover' && 
        book.cover_url !== 'pdf-cover' &&
        book.cover_url.startsWith('/books/')) {
      console.log('[提取封面] 封面已存在:', book.cover_url);
      return res.json({ 
        message: '封面已存在', 
        cover_url: book.cover_url 
      });
    }

    // 检查文件类型是否支持
    if (book.file_type !== 'epub' && book.file_type !== 'pdf') {
      return res.status(400).json({ 
        error: '不支持的文件类型',
        message: `文件类型 ${book.file_type} 不支持封面提取，仅支持 EPUB 和 PDF 格式`
      });
    }

    // 获取书籍目录
    const bookDir = path.dirname(book.file_path);
    
    // 确保目录存在
    try {
      ensureDirectoryExists(bookDir);
    } catch (dirError: any) {
      console.error('[提取封面] 创建目录失败:', dirError);
      return res.status(500).json({ 
        error: '无法创建封面保存目录',
        message: dirError.message 
      });
    }

    // 如果是强制提取且已有封面，先删除旧封面文件
    if (force && book.cover_url && book.cover_url.startsWith('/books/')) {
      try {
        const oldCoverPath = path.join(booksDir, book.cover_url.replace('/books/', ''));
        if (fs.existsSync(oldCoverPath)) {
          fs.unlinkSync(oldCoverPath);
          console.log('[提取封面] 已删除旧封面:', oldCoverPath);
        }
      } catch (deleteError: any) {
        console.warn('[提取封面] 删除旧封面失败:', deleteError.message);
        // 继续执行，不阻止提取
      }
    }

    let coverUrl: string | null = null;
    let extractionError: string | null = null;

    // 根据文件类型提取封面
    try {
      console.log('[提取封面] 开始提取，文件类型:', book.file_type);
      
      if (book.file_type === 'epub') {
        try {
          const coverMetadata = await extractEpubMetadata(book.file_path, bookDir);
          coverUrl = coverMetadata.cover_url;
          console.log('[提取封面] EPUB封面提取结果:', coverUrl);
        } catch (epubError: any) {
          console.error('[提取封面] EPUB提取失败:', epubError);
          extractionError = `EPUB封面提取失败: ${epubError.message}`;
        }
      } else if (book.file_type === 'pdf') {
        try {
          coverUrl = await extractPdfCover(book.file_path, bookDir);
          console.log('[提取封面] PDF封面提取结果:', coverUrl);
          
          // 如果PDF封面提取失败，提供详细的错误信息
          if (!coverUrl) {
            // 检查是否是依赖问题
            let missingDeps: string[] = [];
            
            try {
              await import('pdfjs-dist');
            } catch (e: any) {
              missingDeps.push('pdfjs-dist');
            }
            
            try {
              await import('canvas');
            } catch (e: any) {
              missingDeps.push('canvas');
            }
            
            if (missingDeps.length > 0) {
              extractionError = `PDF封面提取需要安装以下依赖: ${missingDeps.join(', ')}\n请运行: npm install ${missingDeps.join(' ')}\n注意：canvas包需要系统依赖，请参考 https://github.com/Automattic/node-canvas#installation`;
            } else {
              extractionError = 'PDF文件可能不包含封面页或封面页格式不支持';
            }
          }
        } catch (pdfError: any) {
          console.error('[提取封面] PDF提取失败:', pdfError);
          const errorMsg = pdfError.message || String(pdfError);
          
          // 检查是否是依赖缺失的问题
          if (errorMsg.includes('pdfjs-dist') || errorMsg.includes('Cannot find module')) {
            let missingDeps: string[] = [];
            if (errorMsg.includes('pdfjs-dist')) {
              missingDeps.push('pdfjs-dist');
            }
            if (errorMsg.includes('canvas')) {
              missingDeps.push('canvas');
            }
            
            if (missingDeps.length > 0) {
              extractionError = `PDF封面提取需要安装以下依赖: ${missingDeps.join(', ')}\n请运行: npm install ${missingDeps.join(' ')}\n注意：canvas包需要系统依赖，请参考 https://github.com/Automattic/node-canvas#installation`;
            } else {
              extractionError = `PDF封面提取失败: ${errorMsg}`;
            }
          } else {
            extractionError = `PDF封面提取失败: ${errorMsg}`;
          }
        }
      }
    } catch (error: any) {
      console.error('[提取封面] 提取过程出错:', error);
      extractionError = error.message || '封面提取过程出错';
    }

    // 处理提取错误
    if (extractionError) {
      console.error('[提取封面] 提取失败:', extractionError);
      
      // 返回详细的错误信息
      return res.status(200).json({
        success: false,
        error: extractionError,
        hint: extractionError.includes('canvas') 
          ? 'PDF封面提取需要安装canvas依赖。\n在macOS上，请先运行: brew install pkg-config cairo pango libpng jpeg giflib librsvg\n然后运行: npm install canvas\n在Linux上，请运行: sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev'
          : extractionError.includes('pdfjs-dist')
          ? 'PDF封面提取需要安装pdfjs-dist依赖，请运行: npm install pdfjs-dist'
          : undefined
      });
    }

    // 检查提取结果
    if (coverUrl && coverUrl !== 'cover' && coverUrl !== 'pdf-cover') {
      try {
        // 更新数据库
        db.prepare('UPDATE books SET cover_url = ? WHERE id = ?').run(coverUrl, id);
        console.log('[提取封面] 成功，封面URL:', coverUrl);
        return res.json({ 
          message: '封面提取成功', 
          cover_url: coverUrl 
        });
      } catch (dbError: any) {
        console.error('[提取封面] 数据库更新失败:', dbError);
        return res.status(500).json({ 
          error: '封面提取成功但数据库更新失败',
          message: dbError.message 
        });
      }
    } else {
      // 提取失败，返回详细错误信息
      const errorMessage = extractionError || '未找到封面图片';
      console.warn('[提取封面] 失败:', errorMessage);
      
      // 不返回500，返回200但标记为失败
      return res.json({ 
        success: false,
        error: errorMessage,
        message: errorMessage,
        hint: book.file_type === 'pdf' 
          ? 'PDF封面提取需要安装: npm install pdfjs-dist canvas' 
          : 'EPUB文件可能不包含封面或封面格式不支持'
      });
    }
  } catch (error: any) {
    console.error('[提取封面] 未捕获的错误:', error);
    return res.status(500).json({ 
      error: '服务器内部错误',
      message: error.message || '提取封面失败'
    });
  }
});

// 下载书籍（必须在 /:id 之前，确保路由正确匹配）
router.get('/:id/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { formatId } = req.query; // 支持指定格式ID下载
    
    let book: any;
    
    // 如果指定了格式ID，使用该格式；否则使用原始书籍
    if (formatId && formatId !== id) {
      book = db.prepare('SELECT * FROM books WHERE id = ?').get(formatId) as any;
      if (!book) {
        return res.status(404).json({ error: '指定的格式不存在' });
      }
    } else {
      book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
      if (!book) {
        return res.status(404).json({ error: '书籍不存在' });
      }
    }

    if (!book.file_path || !fs.existsSync(book.file_path)) {
      return res.status(404).json({ error: '书籍文件不存在' });
    }

    const fileName = book.file_name || `${book.title}.${book.file_type}`;
    res.download(book.file_path, fileName, (err) => {
      if (err) {
        console.error('下载文件错误:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: '下载失败' });
        }
      }
    });
  } catch (error: any) {
    console.error('下载书籍错误:', error);
    res.status(500).json({ error: '下载失败' });
  }
});

// 推送书籍到邮箱（必须在 /:id 之前，确保路由正确匹配）
router.post('/:id/push', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { email, formatId } = req.body; // 支持指定格式ID推送
    const userRole = req.userRole || 'user';

    // 检查是否启用邮件推送功能
    const emailPushEnabled = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('email_push_enabled') as any;
    if (!emailPushEnabled || emailPushEnabled.value !== 'true') {
      return res.status(403).json({ error: '邮件推送功能未启用' });
    }

    // 所有已登录用户都可以推送（不再限制为管理员）

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' });
    }

    let book: any;
    
    // 如果指定了格式ID，使用该格式；否则使用原始书籍
    if (formatId && formatId !== id) {
      book = db.prepare('SELECT * FROM books WHERE id = ?').get(formatId) as any;
      if (!book) {
        return res.status(404).json({ error: '指定的格式不存在' });
      }
    } else {
      book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
      if (!book) {
        return res.status(404).json({ error: '书籍不存在' });
      }
    }

    if (!book.file_path || !fs.existsSync(book.file_path)) {
      return res.status(404).json({ error: '书籍文件不存在' });
    }

    // 获取SMTP配置
    const smtpHost = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_host') as any;
    const smtpPort = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_port') as any;
    const smtpUser = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_user') as any;
    const smtpPassword = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_password') as any;

    if (!smtpHost?.value || !smtpUser?.value || !smtpPassword?.value) {
      return res.status(400).json({ error: 'SMTP配置不完整，请在系统设置中配置' });
    }

    // 创建邮件传输器
    const port = parseInt(smtpPort?.value || '587', 10);
    const isSecure = port === 465; // 465端口使用SSL
    
    const transporter = nodemailer.createTransport({
      host: smtpHost.value,
      port: port,
      secure: isSecure, // true for 465, false for other ports
      auth: {
        user: smtpUser.value,
        pass: smtpPassword.value,
      },
      // 添加TLS选项，允许自签名证书（用于测试）
      tls: {
        rejectUnauthorized: false, // 在生产环境中应该设为true
      },
    });

    // 如果是Kindle邮箱，使用特殊主题
    const isKindle = email.includes('@kindle.com') || email.includes('@free.kindle.com');
    const subject = isKindle ? 'convert' : `书籍推送: ${book.title}`;

    // 发送邮件
    const mailOptions = {
      from: smtpUser.value,
      to: email,
      subject: subject,
      text: `您收到了一本电子书：${book.title}\n作者：${book.author || '未知'}`,
      attachments: [
        {
          filename: book.file_name || `${book.title}.${book.file_type}`,
          path: book.file_path,
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    // 记录推送邮箱到数据库
    try {
      const userId = req.userId;
      if (userId) {
        const existing = db.prepare('SELECT id FROM user_push_emails WHERE user_id = ? AND email = ?').get(userId, email) as any;
        if (existing) {
          // 更新最后使用时间
          db.prepare('UPDATE user_push_emails SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
        } else {
          // 插入新记录
          const emailId = uuidv4();
          db.prepare(`
            INSERT INTO user_push_emails (id, user_id, email, is_kindle, last_used_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(emailId, userId, email, isKindle ? 1 : 0);
        }
      }
    } catch (dbError) {
      console.error('记录推送邮箱失败:', dbError);
      // 不影响推送结果，只记录错误
    }

    res.json({ message: '书籍已推送到邮箱' });
  } catch (error: any) {
    console.error('推送书籍错误:', error);
    
    // 提供更详细的错误信息
    let errorMessage = '推送失败';
    if (error.code === 'EAUTH') {
      errorMessage = 'SMTP认证失败，请检查邮箱地址和密码/授权码是否正确';
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      errorMessage = '无法连接到SMTP服务器，请检查服务器地址和端口是否正确';
    } else if (error.code === 'EENVELOPE') {
      errorMessage = '邮件地址格式错误';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.code || '未知错误',
      message: '请检查SMTP配置是否正确，包括服务器地址、端口、邮箱地址和密码/授权码'
    });
  }
});

// 转换书籍格式（必须在 /:id 之前，确保路由正确匹配）
router.post('/:id/convert', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { targetFormat } = req.body;

    if (!targetFormat || !['epub', 'pdf', 'txt'].includes(targetFormat)) {
      return res.status(400).json({ error: '请提供有效的目标格式（epub/pdf/txt）' });
    }

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    if (!book.file_path || !fs.existsSync(book.file_path)) {
      return res.status(404).json({ error: '书籍文件不存在' });
    }

    // 如果目标格式与当前格式相同
    if (book.file_type === targetFormat) {
      return res.status(400).json({ error: '目标格式与当前格式相同' });
    }

    // TODO: 实现格式转换逻辑
    // 这里需要根据源格式和目标格式调用相应的转换工具
    // 例如：EPUB转PDF、PDF转EPUB、EPUB转TXT等
    
    res.status(501).json({ error: '格式转换功能暂未实现' });
  } catch (error: any) {
    console.error('转换格式错误:', error);
    res.status(500).json({ error: '转换失败', message: error.message });
  }
});

// 获取单个书籍详情（包括所有格式）
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;

    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 获取所有格式
    const formats = findAllBookFormats(db, id);

    // 如果当前书籍是MOBI格式，优先从EPUB版本读取信息
    if (book.file_type && book.file_type.toLowerCase() === 'mobi') {
      const epubFormat = formats.find((f: any) => f.file_type && f.file_type.toLowerCase() === 'epub');
      if (epubFormat) {
        console.log('[书籍详情] MOBI格式书籍，使用EPUB版本的元数据');
        // 使用EPUB版本的元数据（但保留MOBI的file_path和file_type）
        book.title = epubFormat.title || book.title;
        book.author = epubFormat.author || book.author;
        book.isbn = epubFormat.isbn || book.isbn;
        book.publisher = epubFormat.publisher || book.publisher;
        book.publish_date = epubFormat.publish_date || book.publish_date;
        book.description = epubFormat.description || book.description;
        book.cover_url = epubFormat.cover_url || book.cover_url;
        book.rating = epubFormat.rating || book.rating;
        book.tags = epubFormat.tags || book.tags;
        book.language = epubFormat.language || book.language;
      }
    }

    // 检查封面文件是否真实存在
    if (book.cover_url && book.cover_url.startsWith('/books/')) {
      const coverPath = path.join(booksDir, book.cover_url.replace('/books/', ''));
      if (!fs.existsSync(coverPath)) {
        console.warn(`[书籍详情] 封面文件不存在: ${coverPath}，重置cover_url`);
        book.cover_url = null;
        // 同时更新数据库
        try {
          db.prepare('UPDATE books SET cover_url = NULL WHERE id = ?').run(id);
        } catch (updateError) {
          console.error('[书籍详情] 更新cover_url失败:', updateError);
        }
      }
    }

    res.json({ book, formats });
  } catch (error: any) {
    console.error('获取书籍详情错误:', error);
    res.status(500).json({ error: '获取书籍详情失败' });
  }
});

// 更新书籍信息
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      author,
      isbn,
      publisher,
      publish_date,
      description,
      cover_url,
      tags,
      rating,
      category,
      file_type,
    } = req.body;

    // 检查书籍是否存在
    const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!existingBook) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 直接使用用户输入的数据，不再从豆瓣API自动检索
    // 注意：空字符串视为未提供值，保持原有值；null 视为清空该字段
    const updateData: any = {
      title: title !== undefined ? title : existingBook.title,
      author: author !== undefined ? author : existingBook.author,
      isbn: isbn !== undefined ? isbn : existingBook.isbn,
      publisher: publisher !== undefined ? publisher : existingBook.publisher,
      publish_date: publish_date !== undefined ? publish_date : existingBook.publish_date,
      description: description !== undefined ? description : existingBook.description,
      // cover_url: 如果传入空字符串或 null，则清空封面；如果未传入，保持原有值
      cover_url: cover_url !== undefined ? (cover_url === '' || cover_url === null ? null : cover_url) : existingBook.cover_url,
      rating: rating !== undefined ? rating : existingBook.rating,
      tags: tags !== undefined ? tags : existingBook.tags,
      category: category !== undefined ? category : (existingBook.category || '未分类'),
      updated_at: new Date().toISOString(),
    };

    // 检查是否需要移动文件（如果分类、作者或标题改变）
    const needMoveFile = 
      (title && title !== existingBook.title) ||
      (author && author !== existingBook.author) ||
      (category && category !== existingBook.category);

    let newFilePath = existingBook.file_path;

    if (needMoveFile && fs.existsSync(existingBook.file_path)) {
      // 生成新路径
      const newBookDir = generateBookPath(
        booksDir,
        updateData.title,
        updateData.author,
        updateData.category
      );
      ensureDirectoryExists(newBookDir);

      // 检查同一本书是否已有其他格式
      const sameBooks = findSameBookOtherFormats(db, updateData.title, updateData.author, id);
      if (sameBooks.length > 0) {
        // 使用已存在的书籍目录
        const existingBookDir = path.dirname(sameBooks[0].file_path);
        const fileExt = path.extname(existingBook.file_name);
        const newFileName = generateBookFileName(updateData.title, fileExt);
        newFilePath = path.join(existingBookDir, newFileName);
      } else {
        // 创建新目录
        const fileExt = path.extname(existingBook.file_name);
        const newFileName = generateBookFileName(updateData.title, fileExt);
        newFilePath = path.join(newBookDir, newFileName);
      }

      // 如果目标文件已存在，添加hash后缀
      if (fs.existsSync(newFilePath) && newFilePath !== existingBook.file_path) {
        const hashSuffix = existingBook.file_hash ? existingBook.file_hash.substring(0, 8) : uuidv4().substring(0, 8);
        const fileExt = path.extname(newFilePath);
        const nameWithoutExt = path.basename(newFilePath, fileExt);
        newFilePath = path.join(path.dirname(newFilePath), `${nameWithoutExt}_${hashSuffix}${fileExt}`);
      }

      // 移动文件
      if (newFilePath !== existingBook.file_path) {
        moveFile(existingBook.file_path, newFilePath);
        updateData.file_path = newFilePath;
        updateData.file_name = path.basename(newFilePath);
      }
    }

    // 如果文件类型改变，需要更新文件名扩展名
    if (file_type && file_type !== existingBook.file_type) {
      const oldExt = path.extname(newFilePath);
      const newExt = `.${file_type}`;
      if (oldExt !== newExt) {
        const newPathWithExt = newFilePath.replace(oldExt, newExt);
        if (fs.existsSync(newFilePath)) {
          moveFile(newFilePath, newPathWithExt);
          newFilePath = newPathWithExt;
          updateData.file_path = newFilePath;
          updateData.file_name = path.basename(newFilePath);
          updateData.file_type = file_type;
        }
      }
    }

    // 构建更新SQL
    const updates: string[] = [];
    const values: any[] = [];
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(updateData.updated_at);
      values.push(id);
      db.prepare(
        `UPDATE books SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    res.json({ message: '更新成功', book });
  } catch (error: any) {
    console.error('更新书籍错误:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 更新书籍公有/私有状态（仅管理员）
router.patch('/:id/visibility', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ error: '必须提供isPublic参数（boolean类型）' });
    }

    // 检查书籍是否存在
    const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!existingBook) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 获取书籍上传者信息
    const uploader = db.prepare('SELECT username FROM users WHERE id = ?').get(existingBook.uploader_id) as any;

    // 更新书籍的公有/私有状态
    db.prepare('UPDATE books SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isPublic ? 1 : 0, id);

    // 如果将私有书籍改为公有，需要移动文件到公有目录
    if (isPublic && existingBook.is_public === 0 && fs.existsSync(existingBook.file_path)) {
      try {
        // 生成新的公有路径
        const publicPath = generateBookPath(
          booksDir,
          existingBook.title,
          existingBook.author,
          existingBook.category,
          true, // isPublic
          uploader?.username
        );
        ensureDirectoryExists(publicPath);

        const newFilePath = path.join(publicPath, existingBook.file_name);
        
        // 如果目标文件已存在，添加hash后缀
        let finalPath = newFilePath;
        if (fs.existsSync(finalPath)) {
          const hashSuffix = existingBook.file_hash ? existingBook.file_hash.substring(0, 8) : uuidv4().substring(0, 8);
          const fileExt = path.extname(finalPath);
          const nameWithoutExt = path.basename(finalPath, fileExt);
          finalPath = path.join(path.dirname(finalPath), `${nameWithoutExt}_${hashSuffix}${fileExt}`);
        }

        // 移动文件
        moveFile(existingBook.file_path, finalPath);
        
        // 更新数据库中的文件路径
        db.prepare('UPDATE books SET file_path = ?, file_name = ? WHERE id = ?')
          .run(finalPath, path.basename(finalPath), id);
        
        console.log(`书籍文件已移动: ${existingBook.file_path} -> ${finalPath}`);
      } catch (fileError) {
        console.error('移动书籍文件失败:', fileError);
        // 文件移动失败不影响状态更新
      }
    }

    // 如果将公有书籍改为私有，也需要移动文件到私有目录
    if (!isPublic && existingBook.is_public === 1 && fs.existsSync(existingBook.file_path)) {
      try {
        // 生成新的私有路径
        const privatePath = generateBookPath(
          booksDir,
          existingBook.title,
          existingBook.author,
          existingBook.category,
          false, // isPublic
          uploader?.username
        );
        ensureDirectoryExists(privatePath);

        const newFilePath = path.join(privatePath, existingBook.file_name);
        
        // 如果目标文件已存在，添加hash后缀
        let finalPath = newFilePath;
        if (fs.existsSync(finalPath)) {
          const hashSuffix = existingBook.file_hash ? existingBook.file_hash.substring(0, 8) : uuidv4().substring(0, 8);
          const fileExt = path.extname(finalPath);
          const nameWithoutExt = path.basename(finalPath, fileExt);
          finalPath = path.join(path.dirname(finalPath), `${nameWithoutExt}_${hashSuffix}${fileExt}`);
        }

        // 移动文件
        moveFile(existingBook.file_path, finalPath);
        
        // 更新数据库中的文件路径
        db.prepare('UPDATE books SET file_path = ?, file_name = ? WHERE id = ?')
          .run(finalPath, path.basename(finalPath), id);
        
        console.log(`书籍文件已移动: ${existingBook.file_path} -> ${finalPath}`);
      } catch (fileError) {
        console.error('移动书籍文件失败:', fileError);
        // 文件移动失败不影响状态更新
      }
    }

    const updatedBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    res.json({ 
      message: `书籍已${isPublic ? '公开' : '私有化'}`, 
      book: updatedBook 
    });
  } catch (error: any) {
    console.error('更新书籍可见性错误:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 批量更新书籍公有/私有状态（仅管理员）
router.patch('/batch/visibility', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { bookIds, isPublic } = req.body;

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: '必须提供书籍ID数组' });
    }

    if (typeof isPublic !== 'boolean') {
      return res.status(400).json({ error: '必须提供isPublic参数（boolean类型）' });
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const id of bookIds) {
      try {
        const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
        if (!existingBook) {
          results.failed.push({ id, error: '书籍不存在' });
          continue;
        }

        const uploader = db.prepare('SELECT username FROM users WHERE id = ?').get(existingBook.uploader_id) as any;

        // 更新状态
        db.prepare('UPDATE books SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(isPublic ? 1 : 0, id);

        // 移动文件（简化处理，不阻塞批量操作）
        if ((isPublic && existingBook.is_public === 0) || (!isPublic && existingBook.is_public === 1)) {
          if (fs.existsSync(existingBook.file_path)) {
            try {
              const newPath = generateBookPath(
                booksDir,
                existingBook.title,
                existingBook.author,
                existingBook.category,
                isPublic,
                uploader?.username
              );
              ensureDirectoryExists(newPath);

              const newFilePath = path.join(newPath, existingBook.file_name);
              let finalPath = newFilePath;
              
              if (fs.existsSync(finalPath)) {
                const hashSuffix = existingBook.file_hash ? existingBook.file_hash.substring(0, 8) : uuidv4().substring(0, 8);
                const fileExt = path.extname(finalPath);
                const nameWithoutExt = path.basename(finalPath, fileExt);
                finalPath = path.join(path.dirname(finalPath), `${nameWithoutExt}_${hashSuffix}${fileExt}`);
              }

              moveFile(existingBook.file_path, finalPath);
              db.prepare('UPDATE books SET file_path = ?, file_name = ? WHERE id = ?')
                .run(finalPath, path.basename(finalPath), id);
            } catch (fileError) {
              console.error(`移动书籍文件失败 (${id}):`, fileError);
              // 继续处理，不影响其他书籍
            }
          }
        }

        results.success.push(id);
      } catch (error: any) {
        results.failed.push({ id, error: error.message });
      }
    }

    res.json({
      message: `批量更新完成：成功 ${results.success.length} 个，失败 ${results.failed.length} 个`,
      results
    });
  } catch (error: any) {
    console.error('批量更新书籍可见性错误:', error);
    res.status(500).json({ error: '批量更新失败' });
  }
});

// 批量更新书籍分类（仅管理员）
router.patch('/batch/category', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { bookIds, category } = req.body;

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: '必须提供书籍ID数组' });
    }

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: '必须提供分类名称' });
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const id of bookIds) {
      try {
        const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
        if (!existingBook) {
          results.failed.push({ id, error: '书籍不存在' });
          continue;
        }

        // 更新分类
        db.prepare('UPDATE books SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(category, id);

        // 如果需要移动文件（分类改变）
        if (category !== existingBook.category && fs.existsSync(existingBook.file_path)) {
          try {
            const uploader = db.prepare('SELECT username FROM users WHERE id = ?').get(existingBook.uploader_id) as any;
            const newPath = generateBookPath(
              booksDir,
              existingBook.title,
              existingBook.author,
              category,
              existingBook.is_public === 1,
              uploader?.username
            );
            ensureDirectoryExists(newPath);

            const newFilePath = path.join(newPath, existingBook.file_name);
            let finalPath = newFilePath;
            
            if (fs.existsSync(finalPath)) {
              const hashSuffix = existingBook.file_hash ? existingBook.file_hash.substring(0, 8) : uuidv4().substring(0, 8);
              const fileExt = path.extname(finalPath);
              const nameWithoutExt = path.basename(finalPath, fileExt);
              finalPath = path.join(path.dirname(finalPath), `${nameWithoutExt}_${hashSuffix}${fileExt}`);
            }

            moveFile(existingBook.file_path, finalPath);
            db.prepare('UPDATE books SET file_path = ?, file_name = ? WHERE id = ?')
              .run(finalPath, path.basename(finalPath), id);
          } catch (fileError) {
            console.error(`移动书籍文件失败 (${id}):`, fileError);
            // 继续处理，不影响其他书籍
          }
        }

        results.success.push(id);
      } catch (error: any) {
        results.failed.push({ id, error: error.message });
      }
    }

    res.json({
      message: `批量更新完成：成功 ${results.success.length} 个，失败 ${results.failed.length} 个`,
      results
    });
  } catch (error: any) {
    console.error('批量更新书籍分类错误:', error);
    res.status(500).json({ error: '批量更新失败' });
  }
});

// 批量更新书籍信息（仅管理员）
router.patch('/batch/update', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { bookIds, updates } = req.body;

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: '必须提供书籍ID数组' });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: '必须提供更新数据' });
    }

    const allowedFields = ['category', 'language', 'tags', 'rating'];
    const updateFields: any = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateFields[field] = updates[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: '没有有效的更新字段' });
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const id of bookIds) {
      try {
        const existingBook = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
        if (!existingBook) {
          results.failed.push({ id, error: '书籍不存在' });
          continue;
        }

        // 构建更新SQL
        const updateParts: string[] = [];
        const updateValues: any[] = [];
        
        for (const [field, value] of Object.entries(updateFields)) {
          updateParts.push(`${field} = ?`);
          updateValues.push(value);
        }
        updateParts.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(id);

        db.prepare(`UPDATE books SET ${updateParts.join(', ')} WHERE id = ?`)
          .run(...updateValues);

        // 如果分类改变，需要移动文件
        if (updateFields.category && updateFields.category !== existingBook.category && fs.existsSync(existingBook.file_path)) {
          try {
            const uploader = db.prepare('SELECT username FROM users WHERE id = ?').get(existingBook.uploader_id) as any;
            const newPath = generateBookPath(
              booksDir,
              existingBook.title,
              existingBook.author,
              updateFields.category,
              existingBook.is_public === 1,
              uploader?.username
            );
            ensureDirectoryExists(newPath);

            const newFilePath = path.join(newPath, existingBook.file_name);
            let finalPath = newFilePath;
            
            if (fs.existsSync(finalPath)) {
              const hashSuffix = existingBook.file_hash ? existingBook.file_hash.substring(0, 8) : uuidv4().substring(0, 8);
              const fileExt = path.extname(finalPath);
              const nameWithoutExt = path.basename(finalPath, fileExt);
              finalPath = path.join(path.dirname(finalPath), `${nameWithoutExt}_${hashSuffix}${fileExt}`);
            }

            moveFile(existingBook.file_path, finalPath);
            db.prepare('UPDATE books SET file_path = ?, file_name = ? WHERE id = ?')
              .run(finalPath, path.basename(finalPath), id);
          } catch (fileError) {
            console.error(`移动书籍文件失败 (${id}):`, fileError);
          }
        }

        results.success.push(id);
      } catch (error: any) {
        results.failed.push({ id, error: error.message });
      }
    }

    res.json({
      message: `批量更新完成：成功 ${results.success.length} 个，失败 ${results.failed.length} 个`,
      results
    });
  } catch (error: any) {
    console.error('批量更新书籍信息错误:', error);
    res.status(500).json({ error: '批量更新失败' });
  }
});

// 删除书籍（管理员或上传者可以删除）
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole || 'user';

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 权限检查：管理员或上传者可以删除
    if (userRole !== 'admin' && book.uploader_id !== userId) {
      return res.status(403).json({ error: '无权删除此书籍' });
    }

    // 删除封面文件（如果存在）
    if (book.cover_url && book.cover_url.startsWith('/books/')) {
      const coverPath = path.join(booksDir, book.cover_url.replace('/books/', ''));
      if (fs.existsSync(coverPath)) {
        try {
          fs.unlinkSync(coverPath);
        } catch (e) {
          console.warn('删除封面文件失败:', e);
        }
      }
    }

    // 删除书籍文件
    if (fs.existsSync(book.file_path)) {
      fs.unlinkSync(book.file_path);
    }

    // 删除数据库记录
    db.prepare('DELETE FROM books WHERE id = ?').run(id);

    res.json({ message: '删除成功' });
  } catch (error: any) {
    console.error('删除书籍错误:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 批量删除书籍（仅管理员）
router.post('/batch/delete', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { bookIds } = req.body;

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: '必须提供书籍ID数组' });
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const id of bookIds) {
      try {
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
        if (!book) {
          results.failed.push({ id, error: '书籍不存在' });
          continue;
        }

        // 删除封面文件
        if (book.cover_url && book.cover_url.startsWith('/books/')) {
          const coverPath = path.join(booksDir, book.cover_url.replace('/books/', ''));
          if (fs.existsSync(coverPath)) {
            try {
              fs.unlinkSync(coverPath);
            } catch (e) {
              console.warn('删除封面文件失败:', e);
            }
          }
        }

        // 删除书籍文件
        if (fs.existsSync(book.file_path)) {
          try {
            fs.unlinkSync(book.file_path);
          } catch (e) {
            console.warn('删除书籍文件失败:', e);
          }
        }

        // 删除数据库记录
        db.prepare('DELETE FROM books WHERE id = ?').run(id);
        results.success.push(id);
      } catch (error: any) {
        results.failed.push({ id, error: error.message });
      }
    }

    res.json({
      message: `批量删除完成：成功 ${results.success.length} 个，失败 ${results.failed.length} 个`,
      results
    });
  } catch (error: any) {
    console.error('批量删除书籍错误:', error);
    res.status(500).json({ error: '批量删除失败' });
  }
});

// 批量更新豆瓣信息（仅管理员）
router.post('/batch/update-douban', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { bookIds } = req.body;

    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return res.status(400).json({ error: '必须提供书籍ID数组' });
    }

    const results = {
      success: [] as { id: string; title: string }[],
      failed: [] as { id: string; title: string; error: string }[],
      skipped: [] as { id: string; title: string; reason: string }[],
    };

    for (const id of bookIds) {
      try {
        const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
        if (!book) {
          results.failed.push({ id, title: '未知', error: '书籍不存在' });
          continue;
        }

        try {
          // 尝试通过标题搜索豆瓣
          const doubanResults = await searchBookByName(book.title);
          
          if (doubanResults.length === 0) {
            results.skipped.push({ 
              id, 
              title: book.title, 
              reason: '豆瓣未找到匹配结果' 
            });
            continue;
          }

          // 使用第一个搜索结果
          const doubanInfo = doubanResults[0];
          
          // 提取标签
          const doubanTags = extractTagsFromDouban(doubanInfo.tags);
          const finalTags = doubanTags || book.tags;

          // 更新书籍信息
          const updateData: any = {
            author: doubanInfo.author 
              ? (Array.isArray(doubanInfo.author) ? doubanInfo.author.join(', ') : doubanInfo.author)
              : book.author,
            isbn: doubanInfo.isbn || book.isbn,
            publisher: doubanInfo.publisher || book.publisher,
            publish_date: doubanInfo.pubdate || book.publish_date,
            description: doubanInfo.summary || book.description,
            rating: doubanInfo.rating?.average || book.rating,
            tags: finalTags,
            updated_at: new Date().toISOString(),
          };

          // 如果有封面图片URL，下载并保存到本地
          if (doubanInfo.image && doubanInfo.image.startsWith('http')) {
            try {
              console.log(`[批量更新豆瓣] 下载封面图片: ${book.title}`);
              const coverResponse = await axios.get(doubanInfo.image, { 
                responseType: 'arraybuffer', 
                timeout: 15000,
                httpsAgent: doubanInfo.image.startsWith('https://') ? new https.Agent({
                  rejectUnauthorized: false,
                }) : undefined,
              });
              const coverBuffer = Buffer.from(coverResponse.data);
              
              // 获取书籍目录
              const bookDir = path.dirname(book.file_path);
              
              // 确保目录存在
              if (!fs.existsSync(bookDir)) {
                fs.mkdirSync(bookDir, { recursive: true });
              }
              
              // 确定封面文件扩展名
              let coverExt = '.jpg';
              try {
                const urlPath = new URL(doubanInfo.image).pathname;
                const ext = path.extname(urlPath);
                if (ext && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())) {
                  coverExt = ext;
                }
              } catch (e) {
                // 使用默认扩展名
              }
              
              const coverFileName = `cover${coverExt}`;
              const coverFilePath = path.join(bookDir, coverFileName);
              
              // 如果已存在封面文件，先删除
              if (fs.existsSync(coverFilePath)) {
                fs.unlinkSync(coverFilePath);
              }
              
              // 写入新封面文件
              fs.writeFileSync(coverFilePath, coverBuffer);
              
              const relativePath = path.relative(booksDir, coverFilePath);
              updateData.cover_url = `/books/${relativePath.replace(/\\/g, '/')}`;
              
              console.log(`[批量更新豆瓣] 封面下载成功: ${book.title}`);
            } catch (coverError: any) {
              console.error(`[批量更新豆瓣] 封面下载失败: ${book.title}`, coverError.message);
              // 如果下载失败，保持原有封面
              updateData.cover_url = book.cover_url;
            }
          } else {
            // 如果没有封面URL，保持原有封面
            updateData.cover_url = book.cover_url;
          }

          // 构建更新SQL
          const updates: string[] = [];
          const values: any[] = [];
          Object.keys(updateData).forEach((key) => {
            if (updateData[key] !== undefined && key !== 'updated_at') {
              updates.push(`${key} = ?`);
              values.push(updateData[key]);
            }
          });

          if (updates.length > 0) {
            updates.push('updated_at = ?');
            values.push(updateData.updated_at);
            values.push(id);
            db.prepare(
              `UPDATE books SET ${updates.join(', ')} WHERE id = ?`
            ).run(...values);
          }

          results.success.push({ id, title: book.title });
        } catch (doubanError: any) {
          results.failed.push({ 
            id, 
            title: book.title, 
            error: doubanError.message || '获取豆瓣信息失败' 
          });
        }
      } catch (error: any) {
        results.failed.push({ id, title: '未知', error: error.message });
      }
    }

    res.json({
      message: `批量更新完成：成功 ${results.success.length} 个，跳过 ${results.skipped.length} 个，失败 ${results.failed.length} 个`,
      results
    });
  } catch (error: any) {
    console.error('批量更新豆瓣信息错误:', error);
    res.status(500).json({ error: '批量更新失败' });
  }
});

// 获取书籍文本内容（用于阅读）
router.get('/:id/text', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { maxLength = 100000 } = req.query;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 导入文本提取函数
    const { extractBookText } = await import('../utils/bookTextExtractor');
    
    const text = await extractBookText(id, Number(maxLength));
    
    res.json({ text });
  } catch (error: any) {
    console.error('获取书籍文本错误:', error);
    res.status(500).json({ error: error.message || '获取文本失败' });
  }
});

// 获取书籍HTML内容（用于DOCX等格式的格式化显示）
router.get('/:id/html', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.userRole;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 权限检查：私有书籍只有上传者和管理员可访问
    if (book.is_public === 0 && book.uploader_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '无权访问此书籍' });
    }

    const fileExt = path.extname(book.file_name || '').toLowerCase() || 
                    (book.file_type ? `.${book.file_type}` : '');

    // 只支持 DOCX 格式
    if (fileExt !== '.docx') {
      return res.status(400).json({ error: '此接口仅支持 DOCX 格式' });
    }

    // 导入HTML转换函数
    const { convertDocxToHtml, extractBookText } = await import('../utils/bookTextExtractor');
    
    // 获取文件路径
    const booksDir = process.env.BOOKS_DIR || './books';
    let filePath: string | null = null;
    
    if (book.file_path) {
      if (path.isAbsolute(book.file_path)) {
        filePath = book.file_path;
      } else {
        filePath = path.join(booksDir, book.file_path);
      }
    }
    
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const html = await convertDocxToHtml(filePath);
    
    res.json({ html });
  } catch (error: any) {
    console.error('获取书籍HTML错误:', error);
    res.status(500).json({ error: error.message || '获取HTML失败' });
  }
});

// 获取书籍Markdown内容（用于DOCX等格式的格式化显示，表格显示更好）
router.get('/:id/markdown', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const userRole = req.userRole;

    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 权限检查：私有书籍只有上传者和管理员可访问
    if (book.is_public === 0 && book.uploader_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '无权访问此书籍' });
    }

    const fileExt = path.extname(book.file_name || '').toLowerCase() || 
                    (book.file_type ? `.${book.file_type}` : '');

    // 只支持 DOCX 格式
    if (fileExt !== '.docx') {
      return res.status(400).json({ error: '此接口仅支持 DOCX 格式' });
    }

    // 导入Markdown转换函数
    const { convertDocxToMarkdown } = await import('../utils/bookTextExtractor');
    
    // 获取文件路径
    const booksDir = process.env.BOOKS_DIR || './books';
    let filePath: string | null = null;
    
    if (book.file_path) {
      if (path.isAbsolute(book.file_path)) {
        filePath = book.file_path;
      } else {
        filePath = path.join(booksDir, book.file_path);
      }
    }
    
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const markdown = await convertDocxToMarkdown(filePath);
    
    res.json({ markdown });
  } catch (error: any) {
    console.error('获取书籍Markdown错误:', error);
    res.status(500).json({ error: error.message || '获取Markdown失败' });
  }
});

export default router;

