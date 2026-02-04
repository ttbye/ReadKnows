/**
 * @file fonts.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
import { fontsDir } from '../config/paths';

// 确保字体目录存在
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// 配置multer用于字体文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fontsDir);
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，但添加唯一ID前缀避免冲突
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  // 取消文件大小限制
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的字体格式，仅支持 .ttf, .otf, .woff, .woff2'));
    }
  },
});

// 上传字体文件
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的字体文件' });
    }

    // 优先使用用户提供的名称，否则使用文件名（去除扩展名，支持 URL 解码）
    const customName = req.body?.name?.trim();
    let baseName = req.file.originalname;
    try {
      if (decodeURIComponent(baseName) !== baseName) baseName = decodeURIComponent(baseName);
    } catch (_) {}
    const fontName = customName || path.basename(baseName, path.extname(baseName));
    const rawPath = req.file.path;
    const fontPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(fontsDir, rawPath);
    const fileName = req.file.filename;
    const fileSize = req.file.size;
    const fileType = path.extname(req.file.originalname).substring(1);

    // 保存字体信息到数据库（file_path 存绝对路径，避免工作目录变化导致找不到文件）
    const fontId = uuidv4();
    db.prepare(`
      INSERT INTO fonts (id, name, file_name, file_path, file_size, file_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(fontId, fontName, fileName, fontPath, fileSize, fileType);

    res.status(201).json({
      message: '字体上传成功',
      font: {
        id: fontId,
        name: fontName,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        url: `/fonts/${fileName}`,
      },
    });
  } catch (error: any) {
    console.error('上传字体错误:', error);
    res.status(500).json({
      error: error.message || '上传失败',
      code: error.code,
    });
  }
});

// 按 ID 返回字体文件（用于 @font-face url，避免文件名编码问题）
router.get('/file-by-id/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const font = db.prepare('SELECT * FROM fonts WHERE id = ?').get(id) as any;
    if (!font || !font.file_path) {
      return res.status(404).json({ error: '字体不存在' });
    }
    if (!fs.existsSync(font.file_path)) {
      return res.status(404).json({ error: '字体文件不存在' });
    }
    const ext = path.extname(font.file_name || '').toLowerCase();
    const contentType: Record<string, string> = {
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
    };
    res.setHeader('Content-Type', contentType[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const absolutePath = path.isAbsolute(font.file_path) ? font.file_path : path.resolve(fontsDir, font.file_path);
    res.sendFile(path.resolve(absolutePath));
  } catch (error: any) {
    console.error('获取字体文件错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 获取所有字体
router.get('/', async (req, res) => {
  try {
    const fonts = db.prepare('SELECT * FROM fonts ORDER BY created_at DESC').all() as any[];
    
    const fontsWithUrl = fonts.map((font) => ({
      ...font,
      url: `/fonts/${font.file_name}`,
    }));

    res.json({ fonts: fontsWithUrl });
  } catch (error: any) {
    console.error('获取字体列表错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 更新字体名称
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '字体名称不能为空' });
    }

    const font = db.prepare('SELECT * FROM fonts WHERE id = ?').get(id) as any;
    if (!font) {
      return res.status(404).json({ error: '字体不存在' });
    }

    // 更新字体名称
    db.prepare('UPDATE fonts SET name = ? WHERE id = ?').run(name.trim(), id);

    const updatedFont = db.prepare('SELECT * FROM fonts WHERE id = ?').get(id) as any;
    res.json({ message: '字体名称已更新', font: updatedFont });
  } catch (error: any) {
    console.error('更新字体名称错误:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除字体
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const font = db.prepare('SELECT * FROM fonts WHERE id = ?').get(id) as any;
    if (!font) {
      return res.status(404).json({ error: '字体不存在' });
    }

    // 删除文件
    try {
      if (fs.existsSync(font.file_path)) {
        fs.unlinkSync(font.file_path);
      }
    } catch (e) {
      console.error('删除字体文件失败:', e);
    }

    // 删除数据库记录
    db.prepare('DELETE FROM fonts WHERE id = ?').run(id);

    res.json({ message: '字体已删除' });
  } catch (error: any) {
    console.error('删除字体错误:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// 下载常用字体
router.post('/download-defaults', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { downloadAllFonts } = require('../utils/downloadFonts');
    await downloadAllFonts();
    res.json({ message: '常用字体下载完成' });
  } catch (error: any) {
    console.error('下载字体错误:', error);
    res.status(500).json({ error: error.message || '下载失败' });
  }
});

export default router;

