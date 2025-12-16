/**
 * @file settings.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { getWatcherStatus, triggerManualScan } from '../utils/fileWatcher';
import nodemailer from 'nodemailer';
import { getVersion, getVersionInfo } from '../utils/version';

const router = express.Router();

// 获取公开配置信息（不需要认证）
router.get('/public', async (req, res) => {
  try {
    const registrationEnabled = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('registration_enabled') as any;
    const privateKeyRequiredForLogin = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_login') as any;
    const privateKeyRequiredForRegister = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_register') as any;
    const privateAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;

    res.json({
      registrationEnabled: registrationEnabled?.value === 'true',
      privateKeyRequiredForLogin: privateKeyRequiredForLogin?.value === 'true',
      privateKeyRequiredForRegister: privateKeyRequiredForRegister?.value === 'true',
      hasPrivateKey: !!(privateAccessKey?.value && privateAccessKey.value.trim() !== ''),
    });
  } catch (error: any) {
    console.error('获取公开配置失败:', error);
    res.status(500).json({ error: '获取配置失败' });
  }
});

// 获取系统版本号（不需要认证）
router.get('/version', async (req, res) => {
  try {
    const versionInfo = getVersionInfo();
    res.json(versionInfo);
  } catch (error: any) {
    console.error('获取版本号失败:', error);
    res.status(500).json({ error: '获取版本号失败', version: '0.0.0-UNKNOWN' });
  }
});

// 获取所有设置
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const settings = db.prepare('SELECT * FROM system_settings ORDER BY key').all() as any[];
    const settingsObj: any = {};
    settings.forEach((setting) => {
      settingsObj[setting.key] = {
        id: setting.id,
        value: setting.value,
        description: setting.description,
        updated_at: setting.updated_at,
      };
    });
    res.json({ settings: settingsObj });
  } catch (error: any) {
    console.error('获取设置失败:', error);
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 更新设置
router.put('/:key', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: '请提供设置值' });
    }

    // 检查设置是否存在
    const existing = db.prepare('SELECT id FROM system_settings WHERE key = ?').get(key) as any;

    if (existing) {
      // 更新现有设置
      db.prepare(
        'UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?'
      ).run(value, key);
    } else {
      // 创建新设置
      const id = uuidv4();
      db.prepare(
        'INSERT INTO system_settings (id, key, value) VALUES (?, ?, ?)'
      ).run(id, key, value);
    }

    // 如果是路径设置，验证路径是否存在
    if (key === 'books_storage_path' || key === 'books_scan_path') {
      if (value && !fs.existsSync(value)) {
        try {
          fs.mkdirSync(value, { recursive: true });
        } catch (error: any) {
          return res.status(400).json({ error: `无法创建目录: ${error.message}` });
        }
      }
    }

    const setting = db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
    res.json({ message: '设置已更新', setting });
  } catch (error: any) {
    console.error('更新设置失败:', error);
    res.status(500).json({ error: '更新设置失败' });
  }
});

// ========== 书籍类型管理 API（仅管理员） ==========
// 注意：这些路由必须在 /:key 路由之前，否则会被 /:key 捕获

// 获取所有书籍类型
router.get('/book-categories', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const categories = db.prepare(`
      SELECT id, name, display_order, created_at, updated_at
      FROM book_categories
      ORDER BY display_order ASC, name ASC
    `).all() as Array<{ id: string; name: string; display_order: number; created_at: string; updated_at: string }>;
    
    res.json({ categories });
  } catch (error: any) {
    console.error('获取书籍类型列表失败:', error);
    res.status(500).json({ error: '获取书籍类型列表失败' });
  }
});

// 创建书籍类型（仅管理员）
router.post('/book-categories', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, display_order } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: '请提供书籍类型名称' });
    }

    const categoryName = name.trim();

    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM book_categories WHERE name = ?').get(categoryName) as any;
    if (existing) {
      return res.status(400).json({ error: '该书籍类型已存在' });
    }

    const id = uuidv4();
    const order = display_order !== undefined ? Number(display_order) : 0;

    db.prepare(`
      INSERT INTO book_categories (id, name, display_order)
      VALUES (?, ?, ?)
    `).run(id, categoryName, order);

    const category = db.prepare('SELECT * FROM book_categories WHERE id = ?').get(id);
    res.status(201).json({ message: '书籍类型创建成功', category });
  } catch (error: any) {
    console.error('创建书籍类型失败:', error);
    res.status(500).json({ error: '创建书籍类型失败' });
  }
});

// 更新书籍类型（仅管理员）
router.put('/book-categories/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, display_order } = req.body;

    // 检查书籍类型是否存在
    const existing = db.prepare('SELECT * FROM book_categories WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: '书籍类型不存在' });
    }

    // 如果提供了新名称，检查是否与其他类型冲突
    if (name && name.trim() !== existing.name) {
      const nameConflict = db.prepare('SELECT id FROM book_categories WHERE name = ? AND id != ?').get(name.trim(), id) as any;
      if (nameConflict) {
        return res.status(400).json({ error: '该书籍类型名称已存在' });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (display_order !== undefined) {
      updates.push('display_order = ?');
      params.push(Number(display_order));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '请提供要更新的字段' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`
      UPDATE book_categories
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);

    const category = db.prepare('SELECT * FROM book_categories WHERE id = ?').get(id);
    res.json({ message: '书籍类型更新成功', category });
  } catch (error: any) {
    console.error('更新书籍类型失败:', error);
    res.status(500).json({ error: '更新书籍类型失败' });
  }
});

// 删除书籍类型（仅管理员）
router.delete('/book-categories/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 检查书籍类型是否存在
    const existing = db.prepare('SELECT * FROM book_categories WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: '书籍类型不存在' });
    }

    // 检查是否有书籍使用此类型
    const booksUsingCategory = db.prepare('SELECT COUNT(*) as count FROM books WHERE category = ?').get(existing.name) as any;
    if (booksUsingCategory.count > 0) {
      return res.status(400).json({ 
        error: `无法删除：仍有 ${booksUsingCategory.count} 本书籍使用此类型`,
        booksCount: booksUsingCategory.count
      });
    }

    db.prepare('DELETE FROM book_categories WHERE id = ?').run(id);
    res.json({ message: '书籍类型删除成功' });
  } catch (error: any) {
    console.error('删除书籍类型失败:', error);
    res.status(500).json({ error: '删除书籍类型失败' });
  }
});

// 获取单个设置
router.get('/:key', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;
    const setting = db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key) as any;

    if (!setting) {
      return res.status(404).json({ error: '设置不存在' });
    }

    res.json({ setting });
  } catch (error: any) {
    console.error('获取设置失败:', error);
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 验证路径
router.post('/validate-path', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { path: pathToValidate } = req.body;

    if (!pathToValidate) {
      return res.status(400).json({ error: '请提供路径' });
    }

    const exists = fs.existsSync(pathToValidate);
    const isDirectory = exists && fs.statSync(pathToValidate).isDirectory();
    const isWritable = exists && isDirectory && fs.accessSync(pathToValidate, fs.constants.W_OK) === undefined;

    res.json({
      exists,
      isDirectory,
      isWritable,
      absolutePath: path.resolve(pathToValidate),
    });
  } catch (error: any) {
    res.json({
      exists: false,
      isDirectory: false,
      isWritable: false,
      error: error.message,
    });
  }
});

// 获取自动导入状态
router.get('/auto-import/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const status = getWatcherStatus();
    
    // 获取导入目录中的文件数量
    const importDir = process.env.IMPORT_DIR || './import';
    let filesCount = 0;
    let supportedFilesCount = 0;
    
    if (fs.existsSync(importDir)) {
      const files = fs.readdirSync(importDir);
      filesCount = files.filter(f => {
        const filePath = path.join(importDir, f);
        return fs.statSync(filePath).isFile();
      }).length;
      
      const supportedExts = ['.epub', '.pdf', '.txt', '.mobi'];
      supportedFilesCount = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        const filePath = path.join(importDir, f);
        return fs.statSync(filePath).isFile() && supportedExts.includes(ext);
      }).length;
    }
    
    res.json({
      ...status,
      filesInDirectory: filesCount,
      supportedFilesInDirectory: supportedFilesCount,
    });
  } catch (error: any) {
    console.error('获取自动导入状态失败:', error);
    res.status(500).json({ error: '获取状态失败' });
  }
});

// 手动触发扫描
router.post('/auto-import/scan', authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log('[API] 收到手动扫描请求');
    triggerManualScan();
    res.json({
      message: '手动扫描已触发',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API] 手动扫描失败:', error);
    res.status(500).json({ error: '扫描失败', message: error.message });
  }
});

// 测试邮件发送（仅管理员）
router.post('/test-email', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' });
    }

    // 获取SMTP配置
    const smtpHost = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_host') as any;
    const smtpPort = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_port') as any;
    const smtpUser = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_user') as any;
    const smtpPassword = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('smtp_password') as any;

    if (!smtpHost?.value || !smtpUser?.value || !smtpPassword?.value) {
      return res.status(400).json({ error: 'SMTP配置不完整，请先配置SMTP信息' });
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

    // 发送测试邮件
    const mailOptions = {
      from: smtpUser.value,
      to: email,
      subject: 'ReadKnows 邮件推送测试',
      text: `这是一封来自 ReadKnows 系统的测试邮件。

如果您收到这封邮件，说明SMTP配置正确，邮件推送功能可以正常使用。

发送时间: ${new Date().toLocaleString('zh-CN')}
发送方邮箱: ${smtpUser.value}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">ReadKnows 邮件推送测试</h2>
          <p>这是一封来自 <strong>ReadKnows</strong> 系统的测试邮件。</p>
          <p>如果您收到这封邮件，说明SMTP配置正确，邮件推送功能可以正常使用。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            发送时间: ${new Date().toLocaleString('zh-CN')}<br>
            发送方邮箱: ${smtpUser.value}
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({ 
      message: '测试邮件已发送',
      sentTo: email,
      sentFrom: smtpUser.value,
    });
  } catch (error: any) {
    console.error('发送测试邮件失败:', error);
    
    // 提供更详细的错误信息
    let errorMessage = '发送测试邮件失败';
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

export default router;

