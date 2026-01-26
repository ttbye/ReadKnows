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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

    const fontName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const fontPath = req.file.path;
    const fileName = req.file.filename;
    const fileSize = req.file.size;
    const fileType = path.extname(req.file.originalname).substring(1);

    // 保存字体信息到数据库
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
    res.status(500).json({ error: error.message || '上传失败' });
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

