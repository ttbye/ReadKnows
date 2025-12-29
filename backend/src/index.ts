/**
 * @file index.ts
 * @author ttbye
 * @date 2024-12-11
 * @description 后端服务入口文件
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initDatabase, db } from './db';
import authRoutes from './routes/auth';
import bookRoutes from './routes/books';
import shelfRoutes from './routes/shelf';
import readingRoutes from './routes/reading';
import settingsRoutes from './routes/settings';
import scanRoutes from './routes/scan';
import opdsRoutes from './routes/opds';
import fontsRoutes from './routes/fonts';
import usersRoutes from './routes/users';
import ipManagementRoutes from './routes/ipManagement';
import aiRoutes from './routes/ai';
import notesRoutes from './routes/notes';
import highlightsRoutes from './routes/highlights';
import importRoutes from './routes/import';
import ttsRoutes from './routes/tts';
import { startFileWatcher, stopFileWatcher, getWatcherStatus, triggerManualScan } from './utils/fileWatcher';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '1281', 10);

// 确保必要的目录存在
const booksDir = process.env.BOOKS_DIR || './books';
if (!fs.existsSync(booksDir)) {
  fs.mkdirSync(booksDir, { recursive: true });
}

const dataDir = path.dirname(process.env.DB_PATH || './data/database.db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const importDir = process.env.IMPORT_DIR || './import';
if (!fs.existsSync(importDir)) {
  fs.mkdirSync(importDir, { recursive: true });
  console.log('创建import目录:', importDir);
}

// 中间件
app.use(cors());
// 增加 JSON 和 URL 编码的请求体大小限制（500MB）
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// 静态文件服务 - 提供书籍文件（支持中文文件名和相对路径）
app.use('/books', (req, res, next) => {
  try {
    console.log('收到文件请求:', req.path, 'Accept:', req.headers.accept);
    
    // 解码URL中的路径（支持多级路径）
    let decodedPath = decodeURIComponent(req.path);
    
    // 移除开头的 /books
    if (decodedPath.startsWith('/books')) {
      decodedPath = decodedPath.substring(7);
    }
    
    // 移除开头的 /
    if (decodedPath.startsWith('/')) {
      decodedPath = decodedPath.substring(1);
    }
    
    console.log('解码后的路径:', decodedPath);
    
    // 如果路径是UUID（可能带扩展名），尝试从数据库获取实际文件路径
    // 支持格式：/books/{uuid} 或 /books/{uuid}.epub
    const uuidWithExtPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.[a-z]+)?$/i;
    const uuidMatch = decodedPath.match(uuidWithExtPattern);
    if (uuidMatch) {
      const uuid = uuidMatch[1];
      const ext = uuidMatch[2] || '';
      console.log('检测到UUID格式:', { uuid, ext, originalPath: decodedPath });
      
      // 如果是不带扩展名的UUID，需要检查是否是文件请求
      // 如果是HTML请求（浏览器访问页面），应该直接返回404，让Vite代理处理
      if (!ext) {
        const accept = req.headers.accept || '';
        const userAgent = req.headers['user-agent'] || '';
        const isBrowserRequest = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari') || userAgent.includes('Firefox');
        
        // 如果是浏览器请求（HTML请求或Accept为空），直接返回404，让Vite代理处理
        if (accept.includes('text/html') || (accept === '' && isBrowserRequest)) {
          console.log('检测到浏览器页面请求，返回404让Vite代理处理:', { accept, userAgent: userAgent.substring(0, 50) });
          res.status(404);
          res.setHeader('Content-Type', 'text/plain');
          return res.send('Not Found');
        }
        
        // 如果是JSON请求，说明是API调用，不应该提供文件
        if (accept.includes('application/json')) {
          console.log('检测到JSON请求（API调用），跳过文件服务');
          return res.status(404).json({ error: '请使用 /api/books/:id 获取书籍信息' });
        }
        
        // 检查是否是明确的文件请求
        const fileAcceptTypes = [
          'application/epub+zip',
          'application/pdf',
          'text/plain',
          'application/octet-stream',
          'application/x-epub+zip',
          'application/x-pdf',
          '*/*' // 通配符，表示接受任何类型
        ];
        const isFileRequest = fileAcceptTypes.some(type => accept.includes(type));
        
        // 如果没有明确的文件类型请求，也不应该提供文件（避免误下载）
        // 只有明确请求文件类型时才提供文件
        if (!isFileRequest && accept !== '') {
          console.log('不是明确的文件请求，返回404让Vite代理处理');
          res.status(404);
          res.setHeader('Content-Type', 'text/plain');
          return res.send('Not Found');
        }
        
        // 如果Accept为空或包含通配符，且不是明确的文件请求，返回404
        if ((accept === '' || accept === '*/*') && !isFileRequest) {
          console.log('Accept为空或通配符，返回404让Vite代理处理');
          res.status(404);
          res.setHeader('Content-Type', 'text/plain');
          return res.send('Not Found');
        }
      }
      
      try {
        const book = db.prepare('SELECT file_path, file_name FROM books WHERE id = ?').get(uuid) as any;
        
        if (!book) {
          console.error('UUID对应的书籍不存在:', uuid);
          return res.status(404).json({ error: '书籍不存在', uuid });
        }
        
        if (!book.file_path && !book.file_name) {
          console.error('书籍记录缺少文件路径:', { uuid, book });
          return res.status(404).json({ error: '书籍文件路径缺失', uuid });
        }
        
        // 使用实际文件路径
        let actualPath = book.file_path || book.file_name;
        console.log('数据库查询结果:', { 
          uuid, 
          file_path: book.file_path, 
          file_name: book.file_name, 
          actualPath,
          booksDir 
        });
        
        // 处理路径：file_path可能是绝对路径或相对路径
        // 统一使用path.resolve和path.relative来处理路径，确保正确性
        
        // 将booksDir解析为绝对路径（用于比较）
        const resolvedBooksDir = path.resolve(booksDir);
        console.log('路径解析开始:', { 
          booksDir, 
          resolvedBooksDir, 
          actualPath,
          isAbsolute: path.isAbsolute(actualPath)
        });
        
        // 1. 如果是绝对路径，计算相对于booksDir的路径
        if (path.isAbsolute(actualPath)) {
          try {
            const relativePath = path.relative(resolvedBooksDir, actualPath);
            decodedPath = relativePath.replace(/\\/g, '/'); // Windows路径转换为Unix风格
            console.log('绝对路径转换为相对路径:', { actualPath, resolvedBooksDir, relativePath, decodedPath });
          } catch (e: any) {
            console.error('绝对路径转换失败:', e);
            throw new Error(`路径转换失败: ${e.message}`);
          }
        } 
        // 2. 如果路径包含'books'，提取'books'之后的部分
        else if (actualPath.includes('books')) {
          try {
            const booksIndex = actualPath.indexOf('books');
            let extractedPath = actualPath.substring(booksIndex + 6); // 'books/' 的长度是6
            if (extractedPath.startsWith('/') || extractedPath.startsWith('\\')) {
              extractedPath = extractedPath.substring(1);
            }
            decodedPath = extractedPath.replace(/\\/g, '/');
            console.log('从包含books的路径提取:', { original: book.file_path, extractedPath, decodedPath });
          } catch (e: any) {
            console.error('路径提取失败:', e);
            throw new Error(`路径提取失败: ${e.message}`);
          }
        }
        // 3. 如果已经是相对路径（不以/开头），直接使用
        else if (!actualPath.startsWith('/') && !actualPath.startsWith('\\')) {
          decodedPath = actualPath.replace(/\\/g, '/');
          console.log('使用相对路径:', decodedPath);
        } 
        // 4. 其他情况，移除开头的斜杠
        else {
          decodedPath = actualPath.substring(1).replace(/\\/g, '/');
          console.log('移除开头斜杠:', decodedPath);
        }
        
        // 确保路径不为空
        if (!decodedPath || decodedPath.trim() === '') {
          console.error('解析后的路径为空:', { uuid, actualPath, decodedPath, book });
          return res.status(404).json({ error: '无法解析文件路径', uuid, actualPath });
        }
        
        console.log('UUID解析成功:', { uuid, ext, decodedPath, originalPath: req.path });
      } catch (dbError: any) {
        console.error('数据库查询失败:', dbError);
        console.error('错误堆栈:', dbError.stack);
        return res.status(500).json({ 
          error: '数据库查询失败', 
          message: dbError.message,
          stack: process.env.NODE_ENV === 'development' ? dbError.stack : undefined
        });
      }
    }
    
    // 构建完整文件路径
    let fullPath: string;
    try {
      fullPath = path.join(booksDir, decodedPath);
      console.log('构建文件路径:', { booksDir, decodedPath, fullPath });
    } catch (e: any) {
      console.error('构建文件路径失败:', e);
      return res.status(500).json({ error: '构建文件路径失败', message: e.message });
    }
    
    // 安全检查：确保路径在booksDir内（防止路径遍历攻击）
    let normalizedBooksDir: string;
    let normalizedFullPath: string;
    try {
      normalizedBooksDir = path.resolve(path.normalize(booksDir));
      normalizedFullPath = path.resolve(path.normalize(fullPath));
      
      console.log('路径规范化:', { 
        booksDir, 
        normalizedBooksDir, 
        fullPath,
        normalizedFullPath, 
        startsWith: normalizedFullPath.startsWith(normalizedBooksDir) 
      });
    } catch (e: any) {
      console.error('路径规范化失败:', e);
      return res.status(500).json({ error: '路径规范化失败', message: e.message });
    }
    
    if (!normalizedFullPath.startsWith(normalizedBooksDir)) {
      console.error('路径安全检查失败:', { 
        normalizedBooksDir, 
        normalizedFullPath,
        booksDir,
        decodedPath,
        fullPath
      });
      return res.status(403).json({ error: '访问被拒绝', path: decodedPath });
    }
    
    // 检查路径是否为空（访问 /books 根路径）
    if (!decodedPath || decodedPath.trim() === '') {
      console.log('访问 /books 根路径，返回404让前端路由处理');
      // 返回简单的404，让Vite代理能够正确处理
      res.status(404);
      res.setHeader('Content-Type', 'text/plain');
      return res.send('Not Found');
    }
    
    // 检查文件是否存在
    try {
      if (!fs.existsSync(normalizedFullPath)) {
        console.error('文件不存在:', {
          normalizedFullPath,
          requestPath: req.path,
          decodedPath,
          fullPath,
          booksDir,
          fileExists: fs.existsSync(booksDir)
        });
        return res.status(404).json({ error: '文件不存在', path: normalizedFullPath });
      }
      
      // 检查是否是目录（不应该发送目录）
      const stats = fs.statSync(normalizedFullPath);
      if (stats.isDirectory()) {
        console.log('路径指向目录，返回404让前端路由处理:', normalizedFullPath);
        // 返回简单的404，让Vite代理能够正确处理
        res.status(404);
        res.setHeader('Content-Type', 'text/plain');
        return res.send('Not Found');
      }
      
      if (!stats.isFile()) {
        console.log('路径不是文件，返回404:', normalizedFullPath);
        return res.status(404).json({ error: '不是有效的文件', path: normalizedFullPath });
      }
      
      console.log('文件存在，准备发送:', normalizedFullPath);
    } catch (e: any) {
      console.error('检查文件存在性失败:', e);
      return res.status(500).json({ error: '检查文件失败', message: e.message });
    }
    
    // 设置正确的Content-Type和CORS头
    if (normalizedFullPath.endsWith('.epub')) {
      // EPUB文件应该作为application/epub+zip或application/zip返回
      // 但epubjs需要能够识别这是一个完整的EPUB文件
      res.setHeader('Content-Type', 'application/epub+zip');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      // 支持Range请求，epubjs可能需要分段加载
      res.setHeader('Accept-Ranges', 'bytes');
      // 添加Content-Disposition，确保浏览器知道这是一个文件
      const fileName = path.basename(normalizedFullPath);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    } else if (normalizedFullPath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');
    } else if (normalizedFullPath.endsWith('.txt')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    // 处理Range请求（epubjs可能需要）
    const range = req.headers.range;
    if (range && (normalizedFullPath.endsWith('.epub') || normalizedFullPath.endsWith('.pdf'))) {
      try {
        const stats = fs.statSync(normalizedFullPath);
        const fileSize = stats.size;
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        if (start >= fileSize || end >= fileSize || start < 0 || end < start) {
          console.error('Range请求无效:', { start, end, fileSize });
          return res.status(416).json({ error: 'Range Not Satisfiable' });
        }
        
        const file = fs.createReadStream(normalizedFullPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': normalizedFullPath.endsWith('.epub') ? 'application/epub+zip' : 'application/pdf',
        };
        res.writeHead(206, head);
        file.pipe(res);
        
        file.on('error', (err: any) => {
          console.error('读取文件流错误:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: '读取文件失败', message: err.message });
          }
        });
      } catch (rangeError: any) {
        console.error('处理Range请求失败:', rangeError);
        // 如果Range请求失败，尝试发送完整文件
        res.sendFile(normalizedFullPath);
      }
    } else {
      // 发送完整文件
      res.sendFile(normalizedFullPath, (err: any) => {
        if (err) {
          console.error('发送文件失败:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: '发送文件失败', message: err.message });
          }
        }
      });
    }
  } catch (error: any) {
    console.error('提供文件服务错误:', error);
    console.error('错误堆栈:', error.stack);
    console.error('请求信息:', {
      path: req.path,
      method: req.method,
      headers: req.headers,
    });
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '文件服务错误', 
        message: error.message,
        path: req.path,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// 字体文件目录
const fontsDir = process.env.FONTS_DIR || './fonts';
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const coversDir = process.env.COVERS_DIR || './covers';
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}

// 静态文件服务 - 提供字体文件
app.use('/fonts', express.static(fontsDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.ttf')) {
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (path.endsWith('.otf')) {
      res.setHeader('Content-Type', 'font/otf');
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (path.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (path.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  },
}));

// 静态文件服务 - 提供封面图片
app.use('/api/covers', express.static(coversDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
    
    // 根据文件扩展名设置Content-Type
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else {
      res.setHeader('Content-Type', 'image/jpeg'); // 默认
    }
  },
}));

// 封面图片代理 - 处理外部图片的CORS问题
app.get('/api/covers/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: '缺少URL参数' });
    }

    // 验证URL是否安全（只允许http/https）
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ error: '无效的URL' });
    }

    // 使用fetch获取图片
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: '获取图片失败' });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('代理封面图片失败:', error);
    res.status(500).json({ error: '代理失败' });
  }
});

// 初始化数据库（同步初始化，确保在服务器启动前完成）
initDatabase();

// 定期清理过期验证码（每小时）
setInterval(() => {
  const { cleanExpiredCaptchas } = require('./utils/captcha');
  cleanExpiredCaptchas();
}, 60 * 60 * 1000);

// 路由
app.use('/api/auth', authRoutes);
// 添加调试日志，确认路由注册
app.use('/api/books', (req, res, next) => {
  console.log('[API路由] /api/books 请求:', req.method, req.path, '原始路径:', req.originalUrl);
  next();
});
app.use('/api/books', bookRoutes);
app.use('/api/shelf', shelfRoutes);
app.use('/api/reading', readingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/fonts', fontsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/ip', ipManagementRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/highlights', highlightsRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/import', importRoutes);
app.use('/opds', opdsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`本地访问: http://localhost:${PORT}`);
  // 获取本机IP地址（仅用于显示）
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`局域网访问: http://${iface.address}:${PORT}`);
        break;
      }
    }
  }
  
  // 启动文件监控服务（在服务器启动后）
  try {
    console.log('====================================');
    console.log('启动自动导入服务...');
    startFileWatcher();
    console.log('自动导入服务已启动');
    console.log(`监控目录: ${importDir}`);
    console.log('====================================');
  } catch (error: any) {
    console.error('启动文件监控服务失败:', error);
  }
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  stopFileWatcher();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...');
  stopFileWatcher();
  process.exit(0);
});

