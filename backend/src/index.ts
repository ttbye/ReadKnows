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
import axios from 'axios';
import https from 'https';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
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
import ocrRoutes from './routes/ocr';
import groupsRoutes from './routes/groups';
import bookSharesRoutes from './routes/bookShares';
import messagesRoutes from './routes/messages';
import friendsRoutes from './routes/friends';
import readingProgressRoutes from './routes/readingProgress';
import readingCheckinsRoutes from './routes/readingCheckins';
import achievementsRoutes from './routes/achievements';
import audiobooksRoutes from './routes/audiobooks';
import audiobookSharesRoutes from './routes/audiobookShares';
import logsRoutes from './routes/logs';
import { startFileWatcher, stopFileWatcher, getWatcherStatus, triggerManualScan } from './utils/fileWatcher';
import { verifyApiKey } from './middleware/auth';
import { booksDir, importDir, fontsDir, coversDir, avatarsDir, dbPath, sslDir } from './config/paths';
import { ensureBookFileExists } from './utils/pathCompatibility';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '1281', 10);

// 配置信任代理（Docker 环境必需）
// 这样 Express 才能正确识别 X-Forwarded-For 头中的真实客户端 IP
// 在 Docker 环境中，请求会经过反向代理，需要信任代理才能获取真实 IP
app.set('trust proxy', true);

// 中间件
// 配置Helmet安全响应头（必须在CORS之前）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // 如果需要嵌入资源，设置为false
  crossOriginResourcePolicy: { policy: "cross-origin" }, // 允许跨域资源
}));

// CORS 配置：限制允许的来源
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || [
  'http://localhost:1280',
  'http://127.0.0.1:1280',
  'https://localhost:1243',
  'https://127.0.0.1:1243',
  'http://localhost:1281',
  'http://127.0.0.1:1281',
  'https://localhost:1244',
  'https://127.0.0.1:1244',
  'capacitor://localhost',
  'ionic://localhost',
  'file://',
  'null', // 某些移动应用可能发送 'null' 字符串
];

// 检查是否为本地网络地址（192.168.x.x, 10.x.x.x, 172.16-31.x.x）
const isLocalNetwork = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    
    // localhost 和 127.0.0.1
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    
    // 私有IP地址范围
    // 192.168.0.0/16
    if (/^192\.168\./.test(hostname)) {
      return true;
    }
    // 10.0.0.0/8
    if (/^10\./.test(hostname)) {
      return true;
    }
    // 172.16.0.0/12
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) {
      return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // 允许无origin的请求（如移动应用、Postman、curl等）
    // 这是最重要的：APK应用通常不发送Origin头，或者发送null
    if (!origin || origin === 'null' || origin === 'file://') {
      console.log(`[CORS] 允许无origin或特殊origin的请求: ${origin || '(无origin)'}`);
      return callback(null, true);
    }
    
    // 如果在允许列表中，直接通过
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] 允许来源（配置列表）: ${origin}`);
      callback(null, true);
      return;
    }
    
    // 如果是本地网络地址，也允许通过
    if (isLocalNetwork(origin)) {
      console.log(`[CORS] 允许本地网络来源: ${origin}`);
      callback(null, true);
      return;
    }
    
    // 检查是否为file://协议（某些Android WebView可能使用）
    if (origin.startsWith('file://')) {
      console.log(`[CORS] 允许file://协议来源: ${origin}`);
      callback(null, true);
      return;
    }
    
    // 检查是否为capacitor://或ionic://协议（Capacitor应用）
    if (origin.startsWith('capacitor://') || origin.startsWith('ionic://')) {
      console.log(`[CORS] 允许Capacitor/Ionic协议来源: ${origin}`);
      callback(null, true);
      return;
    }
    
    // 记录被拒绝的来源，帮助用户诊断问题
    console.warn(`[CORS] 拒绝来源: ${origin}`);
    console.warn(`[CORS] 提示: 如果这是您的公网域名，请在环境变量 ALLOWED_ORIGINS 中添加: ${origin}`);
    console.warn(`[CORS] 当前允许的来源: ${allowedOrigins.join(', ')}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: [
    'X-Captcha-Session-Id',
    'x-captcha-session-id',  // 小写版本（某些浏览器可能使用小写）
    'Content-Type',
    'Content-Length',
    'Cache-Control'
  ],
  allowedHeaders: [
    'Content-Type',
    'content-type',
    'Authorization',
    'authorization',
    'X-API-Key',
    'x-api-key',
    'X-Captcha-Session-Id',
    'x-captcha-session-id',
    'Cache-Control',
    'cache-control',
    'Accept',
    'accept',
    'Accept-Language',
    'accept-language',
    'User-Agent',
    'user-agent'
  ],
}));

// API限流配置
// 通用API限流（每分钟200个请求，提高限制避免页面加载时触发限流）
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 默认1分钟
  max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10), // 默认200个请求（提高限制）
  message: '请求过于频繁，请稍后再试',
  statusCode: 429, // 明确指定状态码为429，避免某些情况下返回418
  standardHeaders: true,
  legacyHeaders: false,
  // 某些长耗时或低频操作不参与限流计数，避免误伤
  skip: (req) => {
    const p = req.path || '';
    const method = req.method || '';
    
    // 从消息附件导入到图书馆的接口可能会比较耗时且偶尔重复点击，这里放行
    if (p.startsWith('/books/upload-from-path')) {
      return true;
    }
    
    // 只读的 GET 请求跳过限流（不会造成服务器压力）
    // 这些是页面加载时常见的请求，不应该被限流
    if (method === 'GET') {
      // 设置相关（只读）
      if (p === '/settings/public' || p === '/settings/version' || p.startsWith('/api/settings/public') || p.startsWith('/api/settings/version')) {
        return true;
      }
      // 当前用户信息（个人页、账号设置等频繁拉取）
      if (p.includes('/users/me') && !p.includes('/avatar')) {
        return true;
      }
      // 我的书架（个人页加载）
      if (p.includes('/shelf/my')) {
        return true;
      }
      // 读书打卡、成就（个人页加载）
      if (p.includes('/reading-checkins') || p.includes('/achievements')) {
        return true;
      }
      // 阅读进度（只读）
      if (p.includes('/reading/progress')) {
        return true;
      }
      // 有声小说列表（只读）
      if (p.includes('/audiobooks/list')) {
        return true;
      }
      // 有声小说进度（只读）
      if (p.includes('/audiobooks/') && p.includes('/progress') && !p.includes('/progress/')) {
        return true;
      }
      // 有声小说历史（只读）
      if (p.includes('/audiobooks/history')) {
        return true;
      }
      // 未读消息数（只读）
      if (p.includes('/messages/unread-count')) {
        return true;
      }
      // 封面图片代理（GET请求，只读）
      if (p === '/covers/proxy' || p.startsWith('/api/covers/proxy')) {
        return true;
      }
      // 封面图片静态文件（GET请求，只读）
      if (p.startsWith('/covers/') || p.startsWith('/api/covers/')) {
        return true;
      }
    }
    
    return false;
  },
});

// 登录接口限流（每分钟5次）
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: parseInt(process.env.LOGIN_LIMIT_MAX || '5', 10), // 默认5次
  message: '登录尝试过于频繁，请稍后再试',
  skipSuccessfulRequests: true, // 成功请求不计入限制
});

// 注册接口限流（每小时3次）
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: parseInt(process.env.REGISTER_LIMIT_MAX || '3', 10), // 默认3次
  message: '注册请求过于频繁，请稍后再试',
});

// 设置请求超时（根据路由设置不同的超时时间）
app.use((req, res, next) => {
  // 文件上传路由需要更长的超时时间（30分钟，支持大文件上传）
  const isUploadRoute = req.path.includes('/upload') || 
                        req.path.includes('/books/upload') ||
                        req.path.includes('/fonts/upload') ||
                        req.path.includes('/audiobooks/upload');
  
  // 管理操作路由（settings、users）需要更长的超时时间（2分钟）
  // 局域网访问时网络延迟可能较高，需要更长的超时时间
  const isAdminRoute = req.path.includes('/api/settings/') || 
                       req.path.includes('/api/users/') ||
                       req.path.includes('/api/ip-management/');
  
  // 根据路由类型设置超时时间
  let timeout = 30000; // 默认30秒
  if (isUploadRoute) {
    timeout = 1800000; // 上传：30分钟（支持大文件上传）
  } else if (isAdminRoute) {
    timeout = 120000; // 管理操作：2分钟（局域网访问可能需要更长时间）
  }
  
  req.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: '请求超时' });
    }
  });
  next();
});

// 响应压缩（提高传输性能）- 需要安装: npm install compression @types/compression
// import compression from 'compression';
// app.use(compression({ level: 6, threshold: 1024 })); // 压缩大于1KB的响应

// 增加 JSON 和 URL 编码的请求体大小限制
// 注意：文件上传使用 multer，不受此限制影响，但元数据字段可能较大
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 处理 _method 参数：将 POST 请求转换为 PUT 或 DELETE（用于防火墙限制）
app.use((req, res, next) => {
  // 只处理 POST 请求
  if (req.method === 'POST') {
    // 检查请求体中的 _method 参数
    let methodOverride: string | undefined;
    
    // 从请求体中获取 _method（支持 JSON 和 FormData）
    if (req.body && typeof req.body === 'object') {
      methodOverride = req.body._method;
      // 移除 _method 字段，避免干扰业务逻辑
      if (methodOverride) {
        delete req.body._method;
      }
    }
    
    // 如果找到了 _method 参数，修改请求方法
    if (methodOverride && (methodOverride.toUpperCase() === 'PUT' || methodOverride.toUpperCase() === 'DELETE')) {
      req.method = methodOverride.toUpperCase();
      // 更新 Express 的内部方法（某些中间件可能依赖这个）
      (req as any).originalMethod = 'POST';
    }
  }
  
  next();
});

// 静态文件服务 - 提供书籍文件（支持中文文件名和相对路径）
app.use('/books', (req, res, next) => {
  // 确保响应在出错时也能正确发送
  let responseSent = false;
  const sendResponse = (status: number, body: any) => {
    if (!responseSent && !res.headersSent) {
      responseSent = true;
      res.status(status);
      if (typeof body === 'string') {
        res.setHeader('Content-Type', 'text/plain');
        res.send(body);
      } else {
        res.json(body);
      }
    }
  };

  try {
    // 记录所有图片文件请求（用于调试502错误）
    const isImageRequest = /\.(jpg|jpeg|png|gif|webp)$/i.test(req.path);
    if (isImageRequest) {
      console.log('[图片请求] 收到请求:', req.path, 'Accept:', req.headers.accept);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('收到文件请求:', req.path, 'Accept:', req.headers.accept);
    }
    
    // 解码URL中的路径（支持多级路径和中文）
    let decodedPath: string;
    try {
      // 先尝试解码，如果失败则使用原始路径
      decodedPath = decodeURIComponent(req.path);
    } catch (e: any) {
      // 如果解码失败（可能是双重编码或其他问题），尝试其他方法
      console.warn('URL解码失败，尝试其他方法:', req.path, e.message);
      try {
        // 尝试使用 decodeURI（更宽松）
        decodedPath = decodeURI(req.path);
      } catch (e2: any) {
        // 如果还是失败，使用原始路径
        console.warn('decodeURI 也失败，使用原始路径:', req.path);
        decodedPath = req.path;
      }
    }
    
    // 移除开头的 /books
    if (decodedPath.startsWith('/books')) {
      decodedPath = decodedPath.substring(7);
    }
    
    // 移除开头的 /
    if (decodedPath.startsWith('/')) {
      decodedPath = decodedPath.substring(1);
    }
    
    // 确保路径不为空
    if (!decodedPath || decodedPath.trim() === '') {
      console.log('路径为空，返回404让前端路由处理');
      return sendResponse(404, 'Not Found');
    }
    
    // 减少日志输出
    if (process.env.NODE_ENV === 'development') {
      console.log('解码后的路径:', decodedPath);
    }
    
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
          return sendResponse(404, 'Not Found');
        }
        
        // 如果是JSON请求，说明是API调用，不应该提供文件
        if (accept.includes('application/json')) {
          console.log('检测到JSON请求（API调用），跳过文件服务');
          return sendResponse(404, { error: '请使用 /api/books/:id 获取书籍信息' });
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
          return sendResponse(404, 'Not Found');
        }
        
        // 如果Accept为空或包含通配符，且不是明确的文件请求，返回404
        if ((accept === '' || accept === '*/*') && !isFileRequest) {
          console.log('Accept为空或通配符，返回404让Vite代理处理');
          return sendResponse(404, 'Not Found');
        }
      }
      
      try {
        const book = db.prepare('SELECT file_path, file_name FROM books WHERE id = ?').get(uuid) as any;
        
        if (!book) {
          console.error('UUID对应的书籍不存在:', uuid);
          return sendResponse(404, { error: '书籍不存在', uuid });
        }
        
        if (!book.file_path && !book.file_name) {
          console.error('书籍记录缺少文件路径:', { uuid, book });
          return sendResponse(404, { error: '书籍文件路径缺失', uuid });
        }
        
        // 使用实际文件路径，并尝试兼容性解析
        let actualPath = book.file_path || book.file_name;
        
        // 尝试使用路径兼容性处理（支持旧路径自动转换）
        const resolvedPath = ensureBookFileExists(actualPath);
        if (resolvedPath) {
          actualPath = resolvedPath;
        }
        
        console.log('数据库查询结果:', { 
          uuid, 
          file_path: book.file_path, 
          file_name: book.file_name, 
          actualPath,
          resolvedPath,
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
          return sendResponse(404, { error: '无法解析文件路径', uuid, actualPath });
        }
        
        console.log('UUID解析成功:', { uuid, ext, decodedPath, originalPath: req.path });
      } catch (dbError: any) {
        console.error('数据库查询失败:', dbError);
        console.error('错误堆栈:', dbError.stack);
        return sendResponse(500, { 
          error: '数据库查询失败', 
          message: dbError.message,
          stack: process.env.NODE_ENV === 'development' ? dbError.stack : undefined
        });
      }
    }
    
    // 构建完整文件路径
    let fullPath: string;
    try {
      // 确保 decodedPath 是有效的路径字符串
      if (typeof decodedPath !== 'string' || decodedPath.trim() === '') {
        console.error('无效的路径:', decodedPath);
        return sendResponse(400, { error: '无效的路径', path: decodedPath });
      }
      
      // 使用 path.join 构建路径，确保正确处理中文路径
      fullPath = path.join(booksDir, decodedPath);
      
      // 规范化路径，处理 .. 和 . 等相对路径
      fullPath = path.normalize(fullPath);
      
      // 记录图片文件的路径构建（用于调试）
      if (isImageRequest) {
        console.log('[图片请求] 构建文件路径:', { booksDir, decodedPath, fullPath });
      } else if (process.env.NODE_ENV === 'development') {
        console.log('构建文件路径:', { booksDir, decodedPath, fullPath });
      }
    } catch (e: any) {
      console.error('构建文件路径失败:', e);
      console.error('路径信息:', { booksDir, decodedPath, error: e.message });
      return sendResponse(500, { error: '构建文件路径失败', message: e.message });
    }
    
    // 安全检查：确保路径在booksDir内（防止路径遍历攻击）
    let normalizedBooksDir: string;
    let normalizedFullPath: string;
    try {
      normalizedBooksDir = path.resolve(path.normalize(booksDir));
      normalizedFullPath = path.resolve(path.normalize(fullPath));
      
      // 记录图片文件的路径规范化（用于调试）
      if (isImageRequest) {
        console.log('[图片请求] 路径规范化:', { 
          normalizedBooksDir, 
          normalizedFullPath, 
          startsWith: normalizedFullPath.startsWith(normalizedBooksDir) 
        });
      } else if (process.env.NODE_ENV === 'development') {
        console.log('路径规范化:', { 
          booksDir, 
          normalizedBooksDir, 
          fullPath,
          normalizedFullPath, 
          startsWith: normalizedFullPath.startsWith(normalizedBooksDir) 
        });
      }
    } catch (e: any) {
      console.error('路径规范化失败:', e);
      return sendResponse(500, { error: '路径规范化失败', message: e.message });
    }
    
    if (!normalizedFullPath.startsWith(normalizedBooksDir)) {
      console.error('路径安全检查失败:', { 
        normalizedBooksDir, 
        normalizedFullPath,
        booksDir,
        decodedPath,
        fullPath
      });
      return sendResponse(403, { error: '访问被拒绝', path: decodedPath });
    }
    
    // 检查文件是否存在
    try {
      if (!fs.existsSync(normalizedFullPath)) {
        // 记录图片文件不存在的情况（用于调试）
        if (isImageRequest) {
          console.warn('[图片请求] 文件不存在:', {
            normalizedFullPath,
            requestPath: req.path,
            decodedPath: decodedPath.substring(0, 100) + (decodedPath.length > 100 ? '...' : ''),
            booksDirExists: fs.existsSync(booksDir)
          });
        } else {
          console.error('文件不存在:', {
            normalizedFullPath,
            requestPath: req.path,
            decodedPath,
            fullPath,
            booksDir,
            fileExists: fs.existsSync(booksDir),
            decodedPathType: typeof decodedPath,
            decodedPathLength: decodedPath?.length
          });
        }
        
        // 如果是图片文件，返回404但不显示错误详情（避免暴露路径信息）
        if (isImageRequest) {
          return sendResponse(404, 'Image Not Found');
        }
        
        return sendResponse(404, { error: '文件不存在', path: normalizedFullPath });
      }
      
      // 检查是否是目录（不应该发送目录）
      const stats = fs.statSync(normalizedFullPath);
      if (stats.isDirectory()) {
        console.log('路径指向目录，返回404让前端路由处理:', normalizedFullPath);
        return sendResponse(404, 'Not Found');
      }
      
      if (!stats.isFile()) {
        if (isImageRequest) {
          console.warn('[图片请求] 路径不是文件:', normalizedFullPath);
        } else {
          console.log('路径不是文件，返回404:', normalizedFullPath);
        }
        return sendResponse(404, { error: '不是有效的文件', path: normalizedFullPath });
      }
      
      // 记录图片文件存在的情况（用于调试）
      if (isImageRequest) {
        console.log('[图片请求] 文件存在，准备发送:', normalizedFullPath, '大小:', stats.size, 'bytes');
      } else if (process.env.NODE_ENV === 'development') {
        console.log('文件存在，准备发送:', normalizedFullPath, '大小:', stats.size, 'bytes');
      }
    } catch (e: any) {
      console.error('检查文件存在性失败:', e);
      console.error('错误详情:', {
        message: e.message,
        code: e.code,
        path: normalizedFullPath,
        decodedPath,
        fullPath
      });
      
      // 如果是文件系统错误（如ENOENT），返回404
      if (e.code === 'ENOENT') {
        const isImageFile = /\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedFullPath);
        if (isImageFile) {
          return sendResponse(404, 'Image Not Found');
        }
        return sendResponse(404, { error: '文件不存在', path: normalizedFullPath });
      }
      
      return sendResponse(500, { error: '检查文件失败', message: e.message });
    }
    
    // 设置正确的Content-Type和CORS头
    const fileExt = path.extname(normalizedFullPath).toLowerCase();
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
    } else if (fileExt === '.jpg' || fileExt === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
    } else if (fileExt === '.png') {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
    } else if (fileExt === '.gif') {
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
    } else if (fileExt === '.webp') {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
    } else {
      // 对于其他文件类型，设置通用的CORS头
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
          return sendResponse(416, { error: 'Range Not Satisfiable' });
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
          if (!responseSent && !res.headersSent) {
            sendResponse(500, { error: '读取文件失败', message: err.message });
          }
        });
      } catch (rangeError: any) {
        console.error('处理Range请求失败:', rangeError);
        // 如果Range请求失败，尝试发送完整文件
        if (!responseSent && !res.headersSent) {
          res.sendFile(normalizedFullPath, {
            headers: {
              'Cache-Control': /\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedFullPath) 
                ? 'public, max-age=31536000' 
                : 'no-cache'
            }
          }, (err: any) => {
            if (err && !responseSent && !res.headersSent) {
              const isImageFile = /\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedFullPath);
              if (err.code === 'ENOENT') {
                if (isImageFile) {
                  return sendResponse(404, 'Image Not Found');
                }
                return sendResponse(404, { error: '文件不存在', path: normalizedFullPath });
              }
              sendResponse(500, { error: '发送文件失败', message: err.message });
            }
          });
        }
      }
    } else {
      // 发送完整文件
      res.sendFile(normalizedFullPath, {
        headers: {
          'Cache-Control': /\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedFullPath) 
            ? 'public, max-age=31536000' 
            : 'no-cache'
        }
      }, (err: any) => {
        if (err) {
          // 记录图片文件发送失败的情况（用于调试502错误）
          if (isImageRequest) {
            console.error('[图片请求] 发送文件失败:', {
              message: err.message,
              code: err.code,
              path: normalizedFullPath.substring(0, 100) + (normalizedFullPath.length > 100 ? '...' : ''),
              headersSent: res.headersSent,
              responseSent: responseSent
            });
          } else {
            console.error('发送文件失败:', err);
            console.error('错误详情:', {
              message: err.message,
              code: err.code,
              path: normalizedFullPath,
              decodedPath
            });
          }
          
          // 如果响应已经发送，不再处理
          if (responseSent || res.headersSent) {
            console.warn('[图片请求] 响应已发送，忽略错误');
            return;
          }
          
          // 如果是文件系统错误，返回404
          if (err.code === 'ENOENT') {
            if (isImageRequest) {
              return sendResponse(404, 'Image Not Found');
            }
            return sendResponse(404, { error: '文件不存在', path: normalizedFullPath });
          }
          
          sendResponse(500, { error: '发送文件失败', message: err.message });
        } else if (isImageRequest) {
          console.log('[图片请求] 文件发送成功');
        }
      });
    }
  } catch (error: any) {
    // 记录所有错误，特别是图片请求的错误（用于调试502）
    const isImageRequest = /\.(jpg|jpeg|png|gif|webp)$/i.test(req.path);
    if (isImageRequest) {
      console.error('[图片请求] 提供文件服务错误:', {
        message: error.message,
        code: error.code,
        path: req.path,
        stack: error.stack?.substring(0, 500)
      });
    } else {
      console.error('提供文件服务错误:', error);
      console.error('错误堆栈:', error.stack);
      console.error('请求信息:', {
        path: req.path,
        method: req.method,
        headers: req.headers,
      });
    }
    
    // 确保错误响应被发送
    if (!responseSent && !res.headersSent) {
      sendResponse(500, { 
        error: '文件服务错误', 
        message: error.message,
        path: req.path,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      console.warn('[图片请求] 响应已发送，无法返回错误信息');
    }
  }
});

// 字体和封面目录已从 paths 配置中导入

// 静态文件服务 - 提供字体文件
// 消息附件不再通过 /messages 静态提供，以避免未授权访问。
// 所有附件必须通过 /api/messages/files/:filename 或 /api/messages/file/:filename 经认证后获取。

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

// 静态文件服务 - 用户头像
app.use('/api/avatars', express.static(avatarsDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
  },
}));

// 封面图片代理 - 处理外部图片的CORS问题
// 注意：必须在限流中间件之前注册，因为限流中间件会应用到所有 /api/ 路由
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

    // 使用axios获取图片（与项目中其他远程图片下载保持一致）
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30秒超时
        maxContentLength: 10 * 1024 * 1024, // 限制最大10MB
        httpsAgent: url.startsWith('https://') ? new https.Agent({
          rejectUnauthorized: false, // 允许自签名证书
        }) : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', // 模拟浏览器请求
        },
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';

      // 验证内容类型是否为图片
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!validImageTypes.some(type => contentType.includes(type))) {
        console.warn('[封面代理] 非图片内容类型:', contentType, 'URL:', url);
        // 仍然返回，但记录警告
      }

      // 验证文件大小（至少应该是有效的图片）
      if (buffer.length < 100) {
        return res.status(400).json({ error: '图片文件太小，可能无效' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
      res.send(buffer);
    } catch (axiosError: any) {
      // 处理axios错误
      if (axiosError.response) {
        // 服务器返回了错误状态码
        console.error('[封面代理] 服务器错误:', axiosError.response.status, 'URL:', url);
        return res.status(axiosError.response.status).json({ 
          error: '获取图片失败', 
          status: axiosError.response.status 
        });
      } else if (axiosError.request) {
        // 请求已发出但没有收到响应
        console.error('[封面代理] 网络错误:', axiosError.message, 'URL:', url);
        return res.status(504).json({ error: '网络超时或无法连接' });
      } else {
        // 其他错误
        console.error('[封面代理] 请求错误:', axiosError.message, 'URL:', url);
        return res.status(500).json({ error: '请求失败' });
      }
    }
  } catch (error: any) {
    console.error('[封面代理] 未知错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '代理失败', message: error.message });
    }
  }
});

// 初始化数据库（同步初始化，确保在服务器启动前完成）
try {
  console.log('[启动] 开始初始化数据库...');
  initDatabase();
  console.log('[启动] 数据库初始化完成');
} catch (error: any) {
  console.error('[启动] ========== 数据库初始化失败 ==========');
  console.error('[启动] 错误消息:', error.message);
  console.error('[启动] 错误名称:', error.name);
  console.error('[启动] 错误堆栈:', error.stack);
  console.error('[启动] ======================================');
  console.error('[启动] 服务器无法启动，请检查：');
  console.error('[启动] 1. 数据库文件路径是否正确 (DB_PATH)');
  console.error('[启动] 2. 数据库文件权限是否正确');
  console.error('[启动] 3. 磁盘空间是否充足');
  console.error('[启动] 4. 数据库文件是否损坏');
  process.exit(1);
}

// 获取并显示密钥信息
function displaySecurityKeys() {
  try {
    const apiKeySetting = db.prepare("SELECT value FROM system_settings WHERE key = 'api_key'").get() as any;
    const privateKeySetting = db.prepare("SELECT value FROM system_settings WHERE key = 'private_access_key'").get() as any;
    
    const apiKey = apiKeySetting?.value || '';
    const privateKey = privateKeySetting?.value || '';
    
    if (apiKey || privateKey) {
      console.log('\n====================================');
      console.log('🔐 安全密钥信息');
      console.log('====================================');
      if (apiKey) {
        console.log('API Key:', apiKey);
        console.log('  - 用于API请求认证');
        console.log('  - 在请求头中设置: X-API-Key');
      }
      if (privateKey) {
        console.log('私有访问密钥:', privateKey);
        console.log('  - 用于登录/注册时的额外验证');
        console.log('  - 可在系统设置中配置是否启用');
      }
      console.log('====================================');
      console.log('⚠️  请妥善保管这些密钥，不要泄露！');
      console.log('====================================\n');
    }
  } catch (error: any) {
    console.warn('获取密钥信息失败:', error.message);
  }
}

// 显示密钥信息
displaySecurityKeys();

// 定期清理过期验证码（每小时）
setInterval(() => {
  const { cleanExpiredCaptchas } = require('./utils/captcha');
  cleanExpiredCaptchas();
}, 60 * 60 * 1000);

// 路由
// 添加调试中间件，记录所有 /api/auth 请求
// 验证码路由需要特殊处理 CORS（在路由之前添加 OPTIONS 处理）
app.options('/api/auth/captcha', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, content-type, Authorization, authorization, X-API-Key, x-api-key, X-Captcha-Session-Id, x-captcha-session-id, Cache-Control, cache-control, Accept, accept, Accept-Language, accept-language, User-Agent, user-agent');
  res.header('Access-Control-Expose-Headers', 'X-Captcha-Session-Id, x-captcha-session-id, Content-Type, Content-Length, Cache-Control');
  res.header('Access-Control-Max-Age', '86400'); // 缓存预检请求24小时
  res.sendStatus(200);
});

// 应用API限流到所有API路由
// 注意：/api/covers/proxy 需要在限流之前注册，因为它需要跳过限流
app.use('/api/', apiLimiter);

// 公开 API（不需要 API Key 验证）
app.use('/api/auth', (req, res, next) => {
  console.log('[API路由] /api/auth 请求:', req.method, req.path, '原始路径:', req.originalUrl);
  next();
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth', authRoutes);

// 需要 API Key 验证的 API 路由（除了 /api/settings/public 和 /api/settings/version）
// 注意：settings 路由内部会处理公开接口的例外情况
app.use('/api/books', verifyApiKey);
app.use('/api/shelf', verifyApiKey);
app.use('/api/reading', verifyApiKey);
app.use('/api/scan', verifyApiKey);
app.use('/api/fonts', verifyApiKey);
app.use('/api/users', verifyApiKey);
app.use('/api/ip', verifyApiKey);
app.use('/api/ai', verifyApiKey);
app.use('/api/notes', verifyApiKey);
app.use('/api/highlights', verifyApiKey);
app.use('/api/tts', verifyApiKey);
app.use('/api/ocr', verifyApiKey);
app.use('/api/import', verifyApiKey);
app.use('/api/groups', verifyApiKey);
app.use('/api/book-shares', verifyApiKey);
app.use('/api/messages', verifyApiKey);
app.use('/api/friends', verifyApiKey);
app.use('/api/audiobooks', verifyApiKey);
app.use('/api/logs', verifyApiKey);
app.use('/opds', verifyApiKey);

// settings 路由需要特殊处理：公开接口不需要验证，其他接口需要验证
app.use('/api/settings', (req, res, next) => {
  // 公开接口不需要 API Key 验证
  if (req.path === '/public' || req.path === '/version') {
    return next();
  }
  // 其他接口需要 API Key 验证
  verifyApiKey(req, res, next);
});
app.use('/api/settings', settingsRoutes);

// 需要 API Key 验证的路由处理器（中间件已在上方应用）
app.use('/api/books', (req, res, next) => {
  console.log('[API路由] /api/books 请求:', req.method, req.path, '原始路径:', req.originalUrl);
  next();
});
app.use('/api/books', bookRoutes);
app.use('/api/shelf', shelfRoutes);
app.use('/api/reading', readingRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/fonts', fontsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/ip', ipManagementRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/highlights', highlightsRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/import', importRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/book-shares', bookSharesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/audiobooks', audiobooksRoutes);
app.use('/api/audiobook-shares', audiobookSharesRoutes);
app.use('/api/reading-progress', readingProgressRoutes);
app.use('/api/reading-checkins', readingCheckinsRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/opds', opdsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 全局错误处理中间件（必须在所有路由之后）
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[全局错误处理] 未捕获的错误:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    name: err.name,
    path: req.path,
    method: req.method,
  });

  // 如果响应头已经发送，则无法发送错误响应
  if (res.headersSent) {
    console.error('[全局错误处理] 响应头已发送，无法返回错误信息');
    return next(err);
  }

  // 根据错误类型返回适当的响应
  const statusCode = err.statusCode || err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // 生产环境不返回详细错误信息
  const errorResponse: any = {
    error: statusCode >= 500 ? '服务器内部错误' : (err.message || '请求失败'),
  };

  // 只在开发环境返回详细错误信息
  if (isDevelopment) {
    errorResponse.details = {
      message: err.message,
      stack: err.stack,
      code: err.code,
      name: err.name,
    };
  }

  res.status(statusCode).json(errorResponse);
});

// SPA fallback：处理前端路由请求（必须在404处理器之前）
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  // 如果请求的是 /messages/ 或 /messages 路径（包括查询参数），返回前端的 index.html
  if (req.path.startsWith('/messages')) {
    // 检查是否是 API 请求（有 Accept: application/json 头）
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('application/json')) {
      // 如果是 API 请求，继续到下一个中间件
      return next();
    }

    // 返回前端 index.html，让前端路由处理
    // 尝试多个可能的路径（开发环境和生产环境）
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'), // 开发环境
      path.join(__dirname, '..', 'frontend', 'dist', 'index.html'), // 生产环境
      path.join(__dirname, 'public', 'index.html'), // 其他可能的路径
    ];

    for (const indexPath of possiblePaths) {
      if (fs.existsSync(indexPath)) {
        console.log('[SPA Fallback] 找到前端 index.html:', indexPath);
        return res.sendFile(indexPath);
      }
    }

    // 如果找不到 index.html，继续到下一个中间件
    console.warn('[SPA Fallback] 未找到前端 index.html 文件');
    return next();
  }

  next();
});

// 处理未匹配的路由（404）
app.use((req: express.Request, res: express.Response) => {
  if (!res.headersSent) {
    res.status(404).json({ error: '路由不存在', path: req.path });
  }
});

// 处理未捕获的 Promise 拒绝
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[未捕获的 Promise 拒绝]', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    code: reason?.code,
  });
});

// 处理未捕获的异常
process.on('uncaughtException', (error: Error) => {
  console.error('[未捕获的异常]', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  // 不要立即退出，让服务器继续运行
  // process.exit(1);
});

// 启动HTTP服务器
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`本地访问: http://localhost:${PORT}`);
  
  // 设置服务器超时时间（用于长时间操作如文件上传、删除用户等）
  // Docker 环境下文件上传和删除大量关联数据可能需要更长时间
  server.timeout = 1800000; // 1800秒（30分钟）超时，支持大文件上传
  server.keepAliveTimeout = 1800000; // 保持连接超时
  server.headersTimeout = 1800000; // 请求头超时
  
  console.log(`服务器超时设置: ${server.timeout}ms`);
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
});

// 启动HTTPS服务器（如果证书文件存在，或自动生成自签名证书）
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '1244', 10);
// 优先使用 cert.pem/key.pem，如果不存在则使用 fullchain.pem/privkey.pem
let certPath = fs.existsSync(path.join(sslDir, 'cert.pem')) 
  ? path.join(sslDir, 'cert.pem')
  : path.join(sslDir, 'fullchain.pem');
let keyPath = fs.existsSync(path.join(sslDir, 'key.pem'))
  ? path.join(sslDir, 'key.pem')
  : path.join(sslDir, 'privkey.pem');

// 如果证书不存在，尝试生成自签名证书
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.log('⚠️  未找到SSL证书文件，尝试生成自签名证书用于本地测试...');
  
  // 确保证书目录存在
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }
  
  // 使用标准路径
  certPath = path.join(sslDir, 'cert.pem');
  keyPath = path.join(sslDir, 'key.pem');
  
  // 尝试使用 openssl 生成自签名证书
  const { execSync } = require('child_process');
  try {
    execSync(`openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "${keyPath}" \
      -out "${certPath}" \
      -subj "/C=CN/ST=State/L=City/O=ReadKnows/CN=localhost"`, {
      stdio: 'ignore',
      timeout: 10000
    });
    console.log('✓ 自签名证书生成成功');
    console.log(`  证书路径: ${certPath}`);
    console.log(`  私钥路径: ${keyPath}`);
    console.log('⚠️  注意：这是自签名证书，浏览器会显示安全警告，这是正常的');
  } catch (error: any) {
    console.error('❌ 自签名证书生成失败:', error.message);
    console.log('⚠️  将跳过HTTPS服务器启动，仅使用HTTP服务器');
    certPath = '';
    keyPath = '';
  }
}

if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    const httpsOptions = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    };
    
    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`HTTPS服务器运行在 https://0.0.0.0:${HTTPS_PORT}`);
      console.log(`本地访问: https://localhost:${HTTPS_PORT}`);
      
      // 设置HTTPS服务器超时时间
      httpsServer.timeout = 1800000; // 30分钟
      httpsServer.keepAliveTimeout = 1800000;
      httpsServer.headersTimeout = 1800000;
      
      // 获取本机IP地址（仅用于显示）
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`局域网访问: https://${iface.address}:${HTTPS_PORT}`);
            break;
          }
        }
      }
    });
    
    // 优雅关闭HTTPS服务器
    process.on('SIGINT', () => {
      console.log('\n正在关闭HTTPS服务器...');
      httpsServer.close(() => {
        console.log('HTTPS服务器已关闭');
      });
    });
    
    process.on('SIGTERM', () => {
      console.log('\n正在关闭HTTPS服务器...');
      httpsServer.close(() => {
        console.log('HTTPS服务器已关闭');
      });
    });
  } catch (error: any) {
    console.error('启动HTTPS服务器失败:', error.message);
    console.log('将继续使用HTTP服务器');
  }
} else {
  console.log(`⚠️  无法启动HTTPS服务器（证书文件不存在且生成失败）`);
  console.log(`证书目录: ${sslDir}`);
  console.log(`如需启用HTTPS，请将证书文件放入上述目录，或确保系统已安装 openssl`);
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

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭HTTP服务器...');
  server.close(() => {
    console.log('HTTP服务器已关闭');
    stopFileWatcher();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭HTTP服务器...');
  server.close(() => {
    console.log('HTTP服务器已关闭');
    stopFileWatcher();
    process.exit(0);
  });
});

