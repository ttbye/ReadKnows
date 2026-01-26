/**
 * @file ocr.ts
 * @author ttbye
 * @date 2025-01-XX
 *
 * OCR 识别服务路由
 * - 后端负责鉴权、缓存、调用 OCR API
 * - OCR API 服务提供实际的 OCR 识别功能
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import crypto from 'crypto';

const router = express.Router();

// OCR 服务器地址：优先使用系统设置，其次环境变量，最后默认值
function getOCRBaseUrl(): string {
  // 从系统设置中读取 OCR 服务器配置
  try {
    const hostSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('ocr_server_host') as any;
    const portSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('ocr_server_port') as any;
    
    const host = hostSetting?.value ? String(hostSetting.value).trim() : '';
    const port = portSetting?.value ? String(portSetting.value).trim() : '';
    
    if (host && port) {
      const baseUrl = `http://${host}:${port}`;
      console.log(`[OCR] 从系统设置读取OCR服务器地址: ${baseUrl} (host=${host}, port=${port})`);
      return baseUrl;
    } else {
      console.warn(`[OCR] 系统设置中的OCR服务器地址不完整: host=${host || '(空)'}, port=${port || '(空)'}`);
    }
  } catch (e) {
    console.warn('[OCR] 读取系统设置失败，使用默认值', e);
  }
  
  // 环境变量
  if (process.env.OCR_BASE_URL) {
    console.log(`[OCR] 从环境变量读取OCR服务器地址: ${process.env.OCR_BASE_URL}`);
    return process.env.OCR_BASE_URL;
  }
  
  // 默认值：优先使用容器名称（Docker 网络）
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    const defaultUrl = 'http://ocr-api:5080';
    console.warn(`[OCR] 使用Docker默认地址: ${defaultUrl}`);
    return defaultUrl;
  }
  
  // 不在 Docker 中，使用 localhost
  const defaultUrl = 'http://127.0.0.1:5080';
  console.warn(`[OCR] 使用本地默认地址: ${defaultUrl}`);
  return defaultUrl;
}

import { ocrCacheDir } from '../config/paths';

// OCR 缓存目录（统一放在 data/cache/ocr 下）
const OCR_CACHE_DIR = ocrCacheDir;

// 获取 OCR API Key
function getOCRApiKey(): string | undefined {
  // 优先从环境变量读取
  if (process.env.OCR_API_KEY) {
    return process.env.OCR_API_KEY;
  }
  // 从系统设置读取
  try {
    const apiKeySetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('ocr_api_key') as any;
    if (apiKeySetting?.value) {
      return String(apiKeySetting.value).trim();
    }
  } catch (e) {
    console.warn('[OCR] 读取 OCR API Key 失败', e);
  }
  return undefined;
}

// 创建 OCR API 请求配置
function getOCRRequestConfig(timeout: number = 30000) {
  const apiKey = getOCRApiKey();
  const config: any = {
    timeout: timeout,
  };
  if (apiKey) {
    config.headers = {
      'X-API-Key': apiKey,
    };
  }
  return config;
}

// 确保目录存在
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// 计算图片的哈希值（用于缓存）
function getImageHash(imageBase64: string): string {
  return crypto.createHash('md5').update(imageBase64).digest('hex');
}

// 初始化数据库表（OCR 结果缓存）
function initOCRCacheTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ocr_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_hash TEXT UNIQUE NOT NULL,
        book_id TEXT,
        page_num INTEGER,
        result_text TEXT,
        result_words TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ocr_cache_image_hash ON ocr_cache(image_hash);
      CREATE INDEX IF NOT EXISTS idx_ocr_cache_book_page ON ocr_cache(book_id, page_num);
    `);
    
    console.log('[OCR] OCR 缓存表初始化完成');
  } catch (e) {
    console.error('[OCR] OCR 缓存表初始化失败:', e);
  }
}

// 初始化
initOCRCacheTable();
ensureDir(OCR_CACHE_DIR);

/**
 * OCR 识别接口
 * POST /api/ocr/recognize
 */
router.post('/recognize', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { image, bookId, pageNum, lang = 'ch' } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: '缺少图片数据' });
    }
    
    // 计算图片哈希
    const imageHash = getImageHash(image);
    
    // 检查缓存
    try {
      const cached = db.prepare('SELECT result_text, result_words FROM ocr_cache WHERE image_hash = ?').get(imageHash) as any;
      if (cached) {
        console.log(`[OCR] 从缓存读取结果 (hash: ${imageHash.substring(0, 8)}...)`);
        return res.json({
          success: true,
          text: cached.result_text,
          words: JSON.parse(cached.result_words),
          cached: true,
        });
      }
    } catch (e) {
      console.warn('[OCR] 读取缓存失败:', e);
    }
    
    // 调用 OCR API
    const ocrBaseUrl = getOCRBaseUrl();
    const requestConfig = getOCRRequestConfig(60000); // OCR 可能需要更长时间
    
    console.log(`[OCR] 调用 OCR API: ${ocrBaseUrl}/api/ocr/recognize`);
    
    // 对于中文识别，降低置信度阈值以提高识别率
    const minConfidence = lang === 'ch' ? 0.3 : 0.5;
    
    const ocrResponse = await axios.post(
      `${ocrBaseUrl}/api/ocr/recognize`,
      {
        image: image,
        lang: lang,
        preprocess: true,  // 启用图像预处理
        min_confidence: minConfidence,  // 降低置信度阈值
      },
      {
        ...requestConfig,
        headers: {
          ...requestConfig.headers,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!ocrResponse.data.success) {
      return res.status(500).json({
        error: ocrResponse.data.message || 'OCR 识别失败',
      });
    }
    
    const result = {
      text: ocrResponse.data.text,
      words: ocrResponse.data.words || [],
    };
    
    // 保存到缓存
    try {
      db.prepare(`
        INSERT OR REPLACE INTO ocr_cache (image_hash, book_id, page_num, result_text, result_words, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        imageHash,
        bookId || null,
        pageNum || null,
        result.text,
        JSON.stringify(result.words)
      );
      console.log(`[OCR] 结果已缓存 (hash: ${imageHash.substring(0, 8)}...)`);
    } catch (e) {
      console.warn('[OCR] 保存缓存失败:', e);
    }
    
    res.json({
      success: true,
      text: result.text,
      words: result.words,
      cached: false,
    });
  } catch (error: any) {
    console.error('[OCR] ========== OCR 识别失败 ==========');
    console.error('[OCR] 错误类型:', error.name);
    console.error('[OCR] 错误代码:', error.code);
    console.error('[OCR] 错误消息:', error.message);
    console.error('[OCR] 响应状态:', error.response?.status);
    console.error('[OCR] 响应数据:', error.response?.data);
    console.error('[OCR] 请求URL:', error.config?.url);
    console.error('[OCR] 错误堆栈:', error.stack);
    
    // 处理连接错误
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'OCR 服务不可用，无法连接到 OCR API 服务',
        details: '请检查 OCR API 服务是否运行，以及系统设置中的 OCR 服务器地址和端口是否正确',
        code: 'ECONNREFUSED',
      });
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: 'OCR 服务响应超时',
        details: 'OCR API 服务响应时间过长，请检查服务状态或稍后重试',
        code: error.code,
      });
    }
    
    // 处理 HTTP 错误响应
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      // 提取详细的错误信息
      let errorMessage = 'OCR 识别失败';
      let errorDetails: any = {};
      
      if (data?.error) {
        errorMessage = typeof data.error === 'string' ? data.error : data.error.message || errorMessage;
        errorDetails = data.error;
      } else if (data?.message) {
        errorMessage = data.message;
      } else if (data?.detail) {
        errorMessage = data.detail;
      } else if (typeof data === 'string') {
        errorMessage = data;
      }
      
      if (status === 503) {
        errorMessage = 'OCR 服务暂时不可用，引擎可能正在初始化或模型正在加载';
      } else if (status === 404) {
        errorMessage = 'OCR API 端点不存在，请检查 OCR API 服务版本';
      } else if (status === 500) {
        errorMessage = `OCR 服务内部错误: ${errorMessage}`;
      }
      
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: errorMessage,
        details: errorDetails,
        code: status.toString(),
      });
    }
    
    // 处理其他错误
    const errorMessage = error.message || 'OCR 识别失败';
    res.status(500).json({
      error: errorMessage,
      details: {
        name: error.name,
        code: error.code,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
        } : {}),
      },
    });
  }
});

/**
 * OCR 健康检查代理
 * GET /api/ocr/health
 * 用于前端测试 OCR 服务连接状态
 */
router.get('/health', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const ocrBaseUrl = getOCRBaseUrl();
    const requestConfig = getOCRRequestConfig(5000); // 5秒超时
    
    console.log(`[OCR] 健康检查: ${ocrBaseUrl}/health`);
    
    const healthResponse = await axios.get(`${ocrBaseUrl}/health`, requestConfig);
    
    res.json(healthResponse.data);
  } catch (error: any) {
    console.error('[OCR] 健康检查失败:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        status: 'error',
        message: 'OCR 服务不可用，无法连接到 OCR API',
        error: 'CONNECTION_REFUSED',
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        status: 'error',
        message: 'OCR 服务响应超时',
        error: 'TIMEOUT',
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: error.message || 'OCR 健康检查失败',
      error: error.code || 'UNKNOWN_ERROR',
    });
  }
});

/**
 * 清除 OCR 缓存
 * DELETE /api/ocr/cache
 */
router.delete('/cache', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.query;
    
    if (bookId) {
      // 清除指定书籍的缓存
      const stmt = db.prepare('DELETE FROM ocr_cache WHERE book_id = ?');
      const result = stmt.run(bookId);
      res.json({
        success: true,
        deleted: result.changes,
        message: `已清除书籍 ${bookId} 的 OCR 缓存`,
      });
    } else {
      // 清除所有缓存
      const stmt = db.prepare('DELETE FROM ocr_cache');
      const result = stmt.run();
      res.json({
        success: true,
        deleted: result.changes,
        message: '已清除所有 OCR 缓存',
      });
    }
  } catch (error: any) {
    console.error('[OCR] 清除缓存失败:', error);
    res.status(500).json({
      error: error.message || '清除缓存失败',
    });
  }
});

export default router;
