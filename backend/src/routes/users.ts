/**
 * @file users.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import axios from 'axios';
import { authenticateToken, AuthRequest, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { avatarsDir } from '../config/paths';

const router = express.Router();

// 头像上传：仅允许图片，最大 2MB
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const userId = (req as AuthRequest).userId!;
    const raw = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(1);
    const ext = raw === 'jpeg' ? 'jpg' : (['png', 'gif', 'webp'].includes(raw) ? raw : 'jpg');
    cb(null, `${userId}_${uuidv4()}.${ext}`);
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
});

// 获取当前用户信息
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = db
      .prepare('SELECT id, username, email, role, nickname, language, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, e2ee_public_key, e2ee_private_key_encrypted, created_at, updated_at, last_login_time, avatar_path FROM users WHERE id = ?')
      .get(userId) as any;

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // E2EE 私钥备份：仅向客户端暴露是否存在，不返回密文
    user.e2ee_has_backup = !!(user.e2ee_private_key_encrypted);
    delete user.e2ee_private_key_encrypted;

    // 转换权限字段为布尔值
    // can_upload_private: 默认值：管理员为 true（允许），普通用户为 false（禁用）
    if (user.can_upload_private === undefined || user.can_upload_private === null) {
      user.can_upload_private = user.role === 'admin';
    } else {
      // 确保正确转换为布尔值：处理数字 0/1 和字符串 "0"/"1"
      const numValue = typeof user.can_upload_private === 'string' 
        ? parseInt(user.can_upload_private, 10) 
        : Number(user.can_upload_private);
      user.can_upload_private = numValue === 1;
    }

    // can_upload_books: 默认值：所有用户为 true（允许，向后兼容）
    if (user.can_upload_books === undefined || user.can_upload_books === null) {
      user.can_upload_books = true;
    } else {
      const numValue = typeof user.can_upload_books === 'string' 
        ? parseInt(user.can_upload_books, 10) 
        : Number(user.can_upload_books);
      user.can_upload_books = numValue === 1;
    }

    // can_edit_books: 默认值：所有用户为 true（允许，向后兼容）
    if (user.can_edit_books === undefined || user.can_edit_books === null) {
      user.can_edit_books = true;
    } else {
      const numValue = typeof user.can_edit_books === 'string' 
        ? parseInt(user.can_edit_books, 10) 
        : Number(user.can_edit_books);
      user.can_edit_books = numValue === 1;
    }

    // can_download: 默认值：所有用户为 true（允许，向后兼容）
    if (user.can_download === undefined || user.can_download === null) {
      user.can_download = true;
    } else {
      const numValue = typeof user.can_download === 'string' 
        ? parseInt(user.can_download, 10) 
        : Number(user.can_download);
      user.can_download = numValue === 1;
    }

    // can_push: 默认值：所有用户为 true（允许，向后兼容）
    if (user.can_push === undefined || user.can_push === null) {
      user.can_push = true;
    } else {
      const numValue = typeof user.can_push === 'string' 
        ? parseInt(user.can_push, 10) 
        : Number(user.can_push);
      user.can_push = numValue === 1;
    }

    // can_upload_audiobook: 默认值：管理员为 true（允许），普通用户为 false（禁用）
    if (user.can_upload_audiobook === undefined || user.can_upload_audiobook === null) {
      user.can_upload_audiobook = user.role === 'admin';
    } else {
      const numValue = typeof user.can_upload_audiobook === 'string' 
        ? parseInt(user.can_upload_audiobook, 10) 
        : Number(user.can_upload_audiobook);
      user.can_upload_audiobook = numValue === 1;
    }

    // 设置 max_private_books 默认值（向后兼容，默认为30）
    if (user.max_private_books === undefined || user.max_private_books === null) {
      user.max_private_books = 30;
    }

    res.json({ user });
  } catch (error: any) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 更新当前用户信息（不允许修改用户名）
router.put('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { email, nickname } = req.body;

    // 不允许修改用户名
    if (req.body.username) {
      return res.status(400).json({ error: '用户名注册后无法修改' });
    }

    // 不允许普通用户修改权限相关设置
    if (req.body.can_upload_private !== undefined || req.body.max_private_books !== undefined ||
        req.body.can_upload_books !== undefined || req.body.can_edit_books !== undefined ||
        req.body.can_download !== undefined || req.body.can_push !== undefined ||
        req.body.can_upload_audiobook !== undefined) {
      return res.status(403).json({ error: '您没有权限修改此设置，请联系管理员' });
    }

    if (!email) {
      return res.status(400).json({ error: '请提供邮箱' });
    }

    // 检查邮箱是否已存在（排除当前用户）
    const existingUser = db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email, userId) as any;
    if (existingUser) {
      return res.status(400).json({ error: '邮箱已存在' });
    }

    // 更新邮箱和昵称
    const updateFields: string[] = ['email = ?'];
    const updateValues: any[] = [email];
    
    // 如果提供了 nickname（包括空字符串），则更新它
    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      // 空字符串转换为 null，null 保持为 null
      if (nickname === null) {
        updateValues.push(null);
      } else if (typeof nickname === 'string') {
        updateValues.push(nickname.trim() || null);
      } else {
        updateValues.push(null);
      }
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(userId);
    
    db.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);

    const updatedUser = db
      .prepare('SELECT id, username, email, role, nickname, language, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at, last_login_time, avatar_path FROM users WHERE id = ?')
      .get(userId) as any;

    // 转换权限字段为布尔值
    if (updatedUser.can_upload_private === undefined || updatedUser.can_upload_private === null) {
      updatedUser.can_upload_private = updatedUser.role === 'admin';
    } else {
      updatedUser.can_upload_private = updatedUser.can_upload_private === 1;
    }

    if (updatedUser.can_upload_books === undefined || updatedUser.can_upload_books === null) {
      updatedUser.can_upload_books = true;
    } else {
      updatedUser.can_upload_books = updatedUser.can_upload_books === 1;
    }

    if (updatedUser.can_edit_books === undefined || updatedUser.can_edit_books === null) {
      updatedUser.can_edit_books = true;
    } else {
      updatedUser.can_edit_books = updatedUser.can_edit_books === 1;
    }

    if (updatedUser.can_download === undefined || updatedUser.can_download === null) {
      updatedUser.can_download = true;
    } else {
      updatedUser.can_download = updatedUser.can_download === 1;
    }

    if (updatedUser.can_push === undefined || updatedUser.can_push === null) {
      updatedUser.can_push = true;
    } else {
      updatedUser.can_push = updatedUser.can_push === 1;
    }

    if (updatedUser.can_upload_audiobook === undefined || updatedUser.can_upload_audiobook === null) {
      updatedUser.can_upload_audiobook = updatedUser.role === 'admin';
    } else {
      updatedUser.can_upload_audiobook = updatedUser.can_upload_audiobook === 1;
    }

    // 设置 max_private_books 默认值（向后兼容，默认为30）
    if (updatedUser.max_private_books === undefined || updatedUser.max_private_books === null) {
      updatedUser.max_private_books = 30;
    }

    res.json({ message: '用户信息更新成功', user: updatedUser });
  } catch (error: any) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({ error: '更新用户信息失败' });
  }
});

// 上传/更换当前用户头像（支持 PUT 和 POST，因部分代理或 FormData 场景可能将 PUT 转成 POST）
const avatarUploadHandler = [authenticateToken, uploadAvatar.single('avatar'), async (req: AuthRequest, res: any) => {
  try {
    const userId = req.userId!;
    if (!req.file) {
      return res.status(400).json({ error: '请选择图片文件（JPG、PNG、GIF、WebP，最大 2MB）' });
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(req.file.mimetype)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ error: '仅支持 JPG、PNG、GIF、WebP 图片' });
    }
    const filename = req.file.filename;
    const old = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null } | undefined;
    const oldPath = old?.avatar_path;
    db.prepare('UPDATE users SET avatar_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(filename, userId);
    if (oldPath) {
      const oldFull = path.join(avatarsDir, oldPath);
      try { if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull); } catch (_) {}
    }
    const updatedUser = db.prepare('SELECT id, username, email, role, nickname, language, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at, last_login_time, avatar_path FROM users WHERE id = ?').get(userId) as any;
    res.json({ message: '头像已更新', user: updatedUser });
  } catch (error: any) {
    console.error('上传头像错误:', error);
    res.status(500).json({ error: error.message || '上传头像失败' });
  }
}];
router.put('/me/avatar', ...avatarUploadHandler);
router.post('/me/avatar', ...avatarUploadHandler);

// 从图片 URL 设置头像（服务端下载图片到本地）
router.post('/me/avatar/from-url', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: '请提供有效的图片链接' });
    }
    const u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      return res.status(400).json({ error: '仅支持 http 或 https 链接' });
    }
    const resp = await axios.get(u, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
      validateStatus: () => true,
      headers: { 'User-Agent': 'ReadKnows-Avatar/1.0' },
    });
    if (resp.status !== 200) {
      return res.status(400).json({ error: '无法获取图片，请检查链接是否有效' });
    }
    const ct = (resp.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(ct)) {
      return res.status(400).json({ error: '链接不是有效图片（仅支持 JPG、PNG、GIF、WebP）' });
    }
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/gif': 'gif', 'image/webp': 'webp',
    };
    const ext = extMap[ct] || 'jpg';
    const filename = `${userId}_${uuidv4()}.${ext}`;
    const filepath = path.join(avatarsDir, filename);
    fs.writeFileSync(filepath, resp.data);

    const old = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null } | undefined;
    const oldPath = old?.avatar_path;
    db.prepare('UPDATE users SET avatar_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(filename, userId);
    if (oldPath) {
      const oldFull = path.join(avatarsDir, oldPath);
      try { if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull); } catch (_) {}
    }
    const updatedUser = db.prepare('SELECT id, username, email, role, nickname, language, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at, last_login_time, avatar_path FROM users WHERE id = ?').get(userId) as any;
    res.json({ message: '头像已更新', user: updatedUser });
  } catch (e: any) {
    if (e.response) return res.status(400).json({ error: '无法获取图片，请检查链接是否有效' });
    console.error('从 URL 设置头像错误:', e);
    res.status(500).json({ error: e.message || '设置头像失败' });
  }
});

// 清除当前用户头像
router.delete('/me/avatar', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const row = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId) as { avatar_path: string | null } | undefined;
    const oldPath = row?.avatar_path;
    db.prepare('UPDATE users SET avatar_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    if (oldPath) {
      const oldFull = path.join(avatarsDir, oldPath);
      try { if (fs.existsSync(oldFull)) fs.unlinkSync(oldFull); } catch (_) {}
    }
    const updatedUser = db.prepare('SELECT id, username, email, role, nickname, language, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at, last_login_time, avatar_path FROM users WHERE id = ?').get(userId) as any;
    res.json({ message: '头像已清除', user: updatedUser });
  } catch (error: any) {
    console.error('清除头像错误:', error);
    res.status(500).json({ error: '清除头像失败' });
  }
});

// 修改当前用户密码
router.put('/me/password', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '请提供当前密码和新密码' });
    }

    // 使用密码强度验证
    const { validatePasswordStrength } = require('../middleware/validation');
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    // 获取当前用户密码
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 验证当前密码
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: '当前密码错误' });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, userId);

    res.json({ message: '密码修改成功' });
  } catch (error: any) {
    console.error('修改密码错误:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// 设置当前用户的端到端加密公钥（E2EE 仅用于 1:1 文字消息）
router.put('/me/e2ee-public-key', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    let { publicKey } = req.body;
    if (publicKey === '' || publicKey === null || publicKey === undefined) {
      db.prepare('UPDATE users SET e2ee_public_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
      return res.json({ message: '已清除端到端加密公钥', publicKey: null });
    }
    if (typeof publicKey !== 'string' || !publicKey.trim()) {
      return res.status(400).json({ error: '请提供有效的公钥（JSON 字符串）' });
    }
    publicKey = publicKey.trim();
    // 简单校验：应为 JSON 对象或 base64
    if (publicKey.length > 2000) {
      return res.status(400).json({ error: '公钥数据过长' });
    }
    db.prepare('UPDATE users SET e2ee_public_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(publicKey, userId);
    res.json({ message: '端到端加密公钥已保存', publicKey: true });
  } catch (error: any) {
    console.error('设置 E2EE 公钥错误:', error);
    res.status(500).json({ error: '设置失败' });
  }
});

// 获取当前用户的 E2EE 私钥加密备份（仅用于在本机用恢复密码解密后导入；需登录）
router.get('/me/e2ee-backup', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const row = db.prepare('SELECT e2ee_private_key_encrypted FROM users WHERE id = ?').get(userId) as { e2ee_private_key_encrypted: string | null } | undefined;
    res.json({ encrypted: row?.e2ee_private_key_encrypted ?? null });
  } catch (error: any) {
    console.error('获取 E2EE 备份错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 设置或清除当前用户的 E2EE 私钥加密备份（密文由客户端用恢复密码加密后上传，服务器无法解密）
router.put('/me/e2ee-backup', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    let { encrypted } = req.body;
    if (encrypted === undefined || encrypted === null || encrypted === '') {
      db.prepare('UPDATE users SET e2ee_private_key_encrypted = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
      return res.json({ message: '已清除 E2EE 恢复备份' });
    }
    if (typeof encrypted !== 'string' || !encrypted.trim()) {
      return res.status(400).json({ error: '请提供有效的加密数据' });
    }
    encrypted = encrypted.trim();
    try {
      const o = JSON.parse(encrypted);
      if (!o || typeof o !== 'object' || typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.ct !== 'string') {
        return res.status(400).json({ error: '加密数据格式无效' });
      }
    } catch {
      return res.status(400).json({ error: '加密数据须为合法 JSON' });
    }
    if (encrypted.length > 10000) {
      return res.status(400).json({ error: '加密数据过长' });
    }
    db.prepare('UPDATE users SET e2ee_private_key_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(encrypted, userId);
    res.json({ message: 'E2EE 恢复备份已保存' });
  } catch (error: any) {
    console.error('设置 E2EE 备份错误:', error);
    res.status(500).json({ error: '设置失败' });
  }
});

// 获取指定用户的 E2EE 公钥（用于加密发往该用户的消息；需登录）
router.get('/:id/e2ee-public-key', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT e2ee_public_key FROM users WHERE id = ?').get(id) as { e2ee_public_key: string | null } | undefined;
    res.json({ publicKey: row?.e2ee_public_key ?? null });
  } catch (error: any) {
    console.error('获取 E2EE 公钥错误:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// 创建新用户（仅管理员）
router.post('/', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { username, email, password, role, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: '请提供用户名、邮箱和密码' });
    }

    // 使用密码强度验证
    const { validatePasswordStrength } = require('../middleware/validation');
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色，必须是 admin 或 user' });
    }

    // 检查用户是否已存在
    const existingUser = db
      .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .get(username, email) as any;

    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const userId = uuidv4();
    const userRole = role || 'user';
    // can_upload_private 默认值：管理员为 1（允许），普通用户为 0（禁用）
    // 如果明确设置则使用设置值
    let canUploadPrivate: number;
    if (can_upload_private !== undefined) {
      canUploadPrivate = can_upload_private === true || can_upload_private === 1 ? 1 : 0;
    } else {
      // 未设置时，管理员默认为 1，普通用户默认为 0
      canUploadPrivate = userRole === 'admin' ? 1 : 0;
    }
    // max_private_books 默认为 30，如果明确设置则使用设置值
    const maxPrivateBooks = max_private_books !== undefined 
      ? (parseInt(max_private_books, 10) >= 0 ? parseInt(max_private_books, 10) : 30)
      : 30;
    
    // 新权限字段：默认值：所有用户为 1（允许，向后兼容）
    const canUploadBooks = can_upload_books !== undefined 
      ? (can_upload_books === true || can_upload_books === 1 ? 1 : 0)
      : 1;
    const canEditBooks = can_edit_books !== undefined 
      ? (can_edit_books === true || can_edit_books === 1 ? 1 : 0)
      : 1;
    const canDownload = can_download !== undefined 
      ? (can_download === true || can_download === 1 ? 1 : 0)
      : 1;
    const canPush = can_push !== undefined 
      ? (can_push === true || can_push === 1 ? 1 : 0)
      : 1;
    const canUploadAudiobook = can_upload_audiobook !== undefined 
      ? (can_upload_audiobook === true || can_upload_audiobook === 1 ? 1 : 0)
      : (userRole === 'admin' ? 1 : 0); // 默认：管理员允许，普通用户禁用
    
    db.prepare(
      'INSERT INTO users (id, username, email, password, role, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, username, email, hashedPassword, userRole, canUploadPrivate, maxPrivateBooks, canUploadBooks, canEditBooks, canDownload, canPush, canUploadAudiobook);

    const newUser = db
      .prepare('SELECT id, username, email, role, nickname, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at FROM users WHERE id = ?')
      .get(userId) as any;

    // 转换权限字段为布尔值
    if (newUser.can_upload_private !== undefined && newUser.can_upload_private !== null) {
      newUser.can_upload_private = newUser.can_upload_private === 1;
    } else {
      newUser.can_upload_private = newUser.role === 'admin';
    }

    if (newUser.can_upload_books !== undefined && newUser.can_upload_books !== null) {
      newUser.can_upload_books = newUser.can_upload_books === 1;
    } else {
      newUser.can_upload_books = true;
    }

    if (newUser.can_edit_books !== undefined && newUser.can_edit_books !== null) {
      newUser.can_edit_books = newUser.can_edit_books === 1;
    } else {
      newUser.can_edit_books = true;
    }

    if (newUser.can_download !== undefined && newUser.can_download !== null) {
      newUser.can_download = newUser.can_download === 1;
    } else {
      newUser.can_download = true;
    }

    if (newUser.can_push !== undefined && newUser.can_push !== null) {
      newUser.can_push = newUser.can_push === 1;
    } else {
      newUser.can_push = true;
    }

    if (newUser.can_upload_audiobook !== undefined && newUser.can_upload_audiobook !== null) {
      newUser.can_upload_audiobook = newUser.can_upload_audiobook === 1;
    } else {
      newUser.can_upload_audiobook = newUser.role === 'admin';
    }

    // 设置 max_private_books 默认值（向后兼容，默认为30）
    if (newUser.max_private_books === undefined || newUser.max_private_books === null) {
      newUser.max_private_books = 30;
    }

    res.status(201).json({ message: '用户创建成功', user: newUser });
  } catch (error: any) {
    console.error('创建用户错误:', error);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 获取所有用户列表（仅管理员）
router.get('/', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = 'SELECT id, username, email, role, nickname, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at, last_login_time FROM users';
    const params: any[] = [];
    let countQuery = 'SELECT COUNT(*) as count FROM users';
    const countParams: any[] = [];

    if (search) {
      const searchCondition = ' WHERE username LIKE ? OR email LIKE ?';
      query += searchCondition;
      countQuery += searchCondition;
      params.push(`%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), offset);

    const users = db.prepare(query).all(...params) as any[];
    const total = db.prepare(countQuery).get(...countParams) as any;

    // 获取每个用户的统计信息
    const usersWithStats = users.map((user) => {
      const bookCount = db
        .prepare('SELECT COUNT(*) as count FROM books WHERE uploader_id = ?')
        .get(user.id) as any;
      const shelfCount = db
        .prepare('SELECT COUNT(*) as count FROM user_shelves WHERE user_id = ?')
        .get(user.id) as any;
      
      // 转换权限字段为布尔值
      const canUploadPrivate = user.can_upload_private !== undefined && user.can_upload_private !== null 
        ? user.can_upload_private === 1 
        : (user.role === 'admin'); // 默认：管理员允许，普通用户不允许
      
      const canUploadBooks = user.can_upload_books !== undefined && user.can_upload_books !== null 
        ? user.can_upload_books === 1 
        : true; // 默认为true（向后兼容）
      
      const canEditBooks = user.can_edit_books !== undefined && user.can_edit_books !== null 
        ? user.can_edit_books === 1 
        : true; // 默认为true（向后兼容）
      
      const canDownload = user.can_download !== undefined && user.can_download !== null 
        ? user.can_download === 1 
        : true; // 默认为true（向后兼容）
      
      const canPush = user.can_push !== undefined && user.can_push !== null 
        ? user.can_push === 1 
        : true; // 默认为true（向后兼容）
      
      const canUploadAudiobook = user.can_upload_audiobook !== undefined && user.can_upload_audiobook !== null 
        ? user.can_upload_audiobook === 1 
        : (user.role === 'admin'); // 默认：管理员允许，普通用户禁用
      
      // 设置 max_private_books 默认值（向后兼容，默认为30）
      const maxPrivateBooks = user.max_private_books !== undefined && user.max_private_books !== null
        ? user.max_private_books
        : 30;
      
      return {
        ...user,
        can_upload_private: canUploadPrivate,
        can_upload_books: canUploadBooks,
        can_edit_books: canEditBooks,
        can_download: canDownload,
        can_push: canPush,
        can_upload_audiobook: canUploadAudiobook,
        max_private_books: maxPrivateBooks,
        bookCount: bookCount?.count || 0,
        shelfCount: shelfCount?.count || 0,
      };
    });

    res.json({
      users: usersWithStats,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: total.count,
      },
    });
  } catch (error: any) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 更新用户信息（仅管理员）
router.put('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  // 设置响应超时（局域网访问可能需要更长时间）
  req.setTimeout(120000); // 120秒超时
  
  try {
    const { id } = req.params;
    const { email, nickname, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook } = req.body;
    const currentUserId = req.userId!;

    // 不允许修改用户名
    if (req.body.username) {
      return res.status(400).json({ error: '用户名注册后无法修改' });
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (!email) {
      return res.status(400).json({ error: '请提供邮箱' });
    }

    // 检查邮箱是否已存在（排除当前用户）
    const existingUser = db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email, id) as any;
    if (existingUser) {
      return res.status(400).json({ error: '邮箱已存在' });
    }

    // 使用事务确保操作的原子性
    const updateUser = db.transaction((userId: string, userEmail: string, userNickname: string | null | undefined, canUploadPrivate: number | undefined, maxPrivateBooks: number | undefined, canUploadBooks: number | undefined, canEditBooks: number | undefined, canDownload: number | undefined, canPush: number | undefined, canUploadAudiobook: number | undefined) => {
      try {
        // 更新邮箱和昵称
        const updateFields: string[] = ['email = ?'];
        const updateValues: any[] = [userEmail];
        
        // 如果提供了 nickname（包括空字符串），则更新它
        if (userNickname !== undefined) {
          updateFields.push('nickname = ?');
          // 空字符串转换为 null，null 保持为 null
          if (userNickname === null) {
            updateValues.push(null);
          } else if (typeof userNickname === 'string') {
            updateValues.push(userNickname.trim() || null);
          } else {
            updateValues.push(null);
          }
        }
        
        // 如果提供了 can_upload_private，则更新它
        if (canUploadPrivate !== undefined) {
          updateFields.push('can_upload_private = ?');
          updateValues.push(canUploadPrivate);
        }
        
        // 如果提供了 max_private_books，则更新它
        if (maxPrivateBooks !== undefined) {
          updateFields.push('max_private_books = ?');
          updateValues.push(maxPrivateBooks);
        }
        
        // 如果提供了新权限字段，则更新它们
        if (canUploadBooks !== undefined) {
          updateFields.push('can_upload_books = ?');
          updateValues.push(canUploadBooks);
        }
        
        if (canEditBooks !== undefined) {
          updateFields.push('can_edit_books = ?');
          updateValues.push(canEditBooks);
        }
        
        if (canDownload !== undefined) {
          updateFields.push('can_download = ?');
          updateValues.push(canDownload);
        }
        
        if (canPush !== undefined) {
          updateFields.push('can_push = ?');
          updateValues.push(canPush);
        }
        
        if (canUploadAudiobook !== undefined) {
          updateFields.push('can_upload_audiobook = ?');
          updateValues.push(canUploadAudiobook);
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(userId);
        
        const result = db.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateValues);
        
        if (result.changes === 0) {
          throw new Error('用户信息更新失败：未找到要更新的用户');
        }
        
        // 获取更新后的用户信息
        const updatedUser = db
          .prepare('SELECT id, username, email, role, nickname, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, can_upload_audiobook, created_at, updated_at FROM users WHERE id = ?')
          .get(userId) as any;
        
        return updatedUser;
      } catch (error: any) {
        console.error('更新用户信息事务错误:', error);
        throw error;
      }
    });

    // 执行更新操作
    // 如果 nickname 是 undefined，不传递它（保持原值）
    // 如果 nickname 是空字符串或 null，传递 null（清空昵称）
    let nicknameValue: string | null | undefined = undefined;
    if (nickname !== undefined) {
      if (nickname === null) {
        nicknameValue = null;
      } else if (typeof nickname === 'string') {
        nicknameValue = nickname.trim() || null;
      } else {
        nicknameValue = null;
      }
    }
    // 转换 can_upload_private 为整数（1或0）
    const canUploadPrivateValue = can_upload_private !== undefined 
      ? (can_upload_private === true || can_upload_private === 1 ? 1 : 0) 
      : undefined;
    // 转换 max_private_books 为整数
    let maxPrivateBooksValue: number | undefined = undefined;
    if (max_private_books !== undefined) {
      const parsed = typeof max_private_books === 'string' ? parseInt(max_private_books, 10) : Number(max_private_books);
      if (!isNaN(parsed) && parsed >= 0) {
        maxPrivateBooksValue = parsed;
      } else if (max_private_books !== null) {
        // 如果提供了值但不是有效的数字，返回错误
        return res.status(400).json({ error: '私人书籍数量限制必须是非负整数' });
      }
    }
    // 转换新权限字段为整数（1或0）
    const canUploadBooksValue = can_upload_books !== undefined 
      ? (can_upload_books === true || can_upload_books === 1 ? 1 : 0) 
      : undefined;
    const canEditBooksValue = can_edit_books !== undefined 
      ? (can_edit_books === true || can_edit_books === 1 ? 1 : 0) 
      : undefined;
    const canDownloadValue = can_download !== undefined 
      ? (can_download === true || can_download === 1 ? 1 : 0) 
      : undefined;
    const canPushValue = can_push !== undefined 
      ? (can_push === true || can_push === 1 ? 1 : 0) 
      : undefined;
    const canUploadAudiobookValue = can_upload_audiobook !== undefined 
      ? (can_upload_audiobook === true || can_upload_audiobook === 1 ? 1 : 0) 
      : undefined;
    const updatedUser = updateUser(id, email, nicknameValue, canUploadPrivateValue, maxPrivateBooksValue, canUploadBooksValue, canEditBooksValue, canDownloadValue, canPushValue, canUploadAudiobookValue);

    // 转换权限字段为布尔值
    if (updatedUser.can_upload_private !== undefined && updatedUser.can_upload_private !== null) {
      updatedUser.can_upload_private = updatedUser.can_upload_private === 1;
    } else {
      updatedUser.can_upload_private = updatedUser.role === 'admin';
    }

    if (updatedUser.can_upload_books !== undefined && updatedUser.can_upload_books !== null) {
      updatedUser.can_upload_books = updatedUser.can_upload_books === 1;
    } else {
      updatedUser.can_upload_books = true;
    }

    if (updatedUser.can_edit_books !== undefined && updatedUser.can_edit_books !== null) {
      updatedUser.can_edit_books = updatedUser.can_edit_books === 1;
    } else {
      updatedUser.can_edit_books = true;
    }

    if (updatedUser.can_download !== undefined && updatedUser.can_download !== null) {
      updatedUser.can_download = updatedUser.can_download === 1;
    } else {
      updatedUser.can_download = true;
    }

    if (updatedUser.can_push !== undefined && updatedUser.can_push !== null) {
      updatedUser.can_push = updatedUser.can_push === 1;
    } else {
      updatedUser.can_push = true;
    }

    if (updatedUser.can_upload_audiobook !== undefined && updatedUser.can_upload_audiobook !== null) {
      updatedUser.can_upload_audiobook = updatedUser.can_upload_audiobook === 1;
    } else {
      updatedUser.can_upload_audiobook = updatedUser.role === 'admin';
    }

    // 设置 max_private_books 默认值（向后兼容，默认为30）
    if (updatedUser.max_private_books === undefined || updatedUser.max_private_books === null) {
      updatedUser.max_private_books = 30;
    }

    // 确保响应已发送
    if (!res.headersSent) {
      res.json({ message: '用户信息更新成功', user: updatedUser });
    }
  } catch (error: any) {
    console.error('更新用户信息错误:', error);
    
    // 确保响应已发送
    if (!res.headersSent) {
      const errorMessage = error.message || '更新用户信息失败';
      const statusCode = error.code === 'SQLITE_CONSTRAINT' ? 400 : 500;
      res.status(statusCode).json({ error: errorMessage });
    }
  }
});

// 获取用户公开资料（本人或好友可查看）
router.get('/profile/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const viewerId = req.userId!;
    const { id: targetId } = req.params;

    if (!targetId) {
      return res.status(400).json({ error: '请提供用户ID' });
    }

    // 本人或好友可查看
    const isSelf = viewerId === targetId;
    const isFriend = !isSelf && (db.prepare(`
      SELECT 1 FROM friendships
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
      AND status = 'accepted'
      LIMIT 1
    `).get(viewerId, targetId, targetId, viewerId) != null);

    if (!isSelf && !isFriend) {
      return res.status(403).json({ error: '仅好友可查看该用户资料' });
    }

    const user = db.prepare(`
      SELECT id, username, nickname, created_at
      FROM users WHERE id = ?
    `).get(targetId) as any;

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 阅读统计（本人或好友可见）
    let readingStats = { totalBooks: 0, reading: 0, finished: 0, totalReadingTime: 0 };
    try {
      const stats = db.prepare(`
        SELECT
          COUNT(DISTINCT book_id) as totalBooks,
          SUM(CASE WHEN progress > 0 AND progress < 1 THEN 1 ELSE 0 END) as reading,
          SUM(CASE WHEN progress >= 1 THEN 1 ELSE 0 END) as finished,
          COALESCE(SUM(reading_time), 0) as totalReadingTime
        FROM reading_progress
        WHERE user_id = ?
      `).get(targetId) as any;
      if (stats) {
        readingStats = {
          totalBooks: stats.totalBooks || 0,
          reading: stats.reading || 0,
          finished: stats.finished || 0,
          totalReadingTime: stats.totalReadingTime || 0,
        };
      }
    } catch (_) {
      // reading_progress 表可能不存在，忽略
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        createdAt: user.created_at,
        isFriend,
        isSelf,
        ...readingStats,
      },
    });
  } catch (error: any) {
    console.error('获取用户资料失败:', error);
    res.status(500).json({ error: '获取用户资料失败' });
  }
});

// 获取单个用户信息（仅管理员）
router.get('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = db
      .prepare('SELECT id, username, email, role, nickname, can_upload_private, max_private_books, can_upload_books, can_edit_books, can_download, can_push, created_at, updated_at FROM users WHERE id = ?')
      .get(id) as any;

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 转换权限字段为布尔值
    const canUploadPrivate = user.can_upload_private !== undefined && user.can_upload_private !== null 
      ? user.can_upload_private === 1 
      : (user.role === 'admin'); // 默认：管理员允许，普通用户不允许

    const canUploadBooks = user.can_upload_books !== undefined && user.can_upload_books !== null 
      ? user.can_upload_books === 1 
      : true; // 默认为true（向后兼容）

    const canEditBooks = user.can_edit_books !== undefined && user.can_edit_books !== null 
      ? user.can_edit_books === 1 
      : true; // 默认为true（向后兼容）

    const canDownload = user.can_download !== undefined && user.can_download !== null 
      ? user.can_download === 1 
      : true; // 默认为true（向后兼容）

    const canPush = user.can_push !== undefined && user.can_push !== null 
      ? user.can_push === 1 
      : true; // 默认为true（向后兼容）

    const maxPrivateBooks = user.max_private_books !== undefined && user.max_private_books !== null
      ? user.max_private_books
      : 30;

    // 获取用户统计信息
    const bookCount = db
      .prepare('SELECT COUNT(*) as count FROM books WHERE uploader_id = ?')
      .get(id) as any;
    const shelfCount = db
      .prepare('SELECT COUNT(*) as count FROM user_shelves WHERE user_id = ?')
      .get(id) as any;

    res.json({
      user: {
        ...user,
        can_upload_private: canUploadPrivate,
        can_upload_books: canUploadBooks,
        can_edit_books: canEditBooks,
        can_download: canDownload,
        can_push: canPush,
        max_private_books: maxPrivateBooks,
        bookCount: bookCount?.count || 0,
        shelfCount: shelfCount?.count || 0,
      },
    });
  } catch (error: any) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 更新用户角色（仅管理员）
router.put('/:id/role', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  // 设置响应超时（局域网访问可能需要更长时间）
  req.setTimeout(120000); // 120秒超时
  
  try {
    const { id } = req.params;
    const { role } = req.body;
    const currentUserId = req.userId!;

    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色，必须是 admin 或 user' });
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 不能修改自己的角色
    if (id === currentUserId) {
      return res.status(400).json({ error: '不能修改自己的角色' });
    }

    // 确保至少有一个管理员
    if (user.role === 'admin' && role === 'user') {
      const adminCount = db
        .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
        .get() as any;
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: '至少需要保留一个管理员账号' });
      }
    }

    // 更新角色
    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);

    const updatedUser = db
      .prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?')
      .get(id) as any;

    if (!res.headersSent) {
      res.json({ message: '角色更新成功', user: updatedUser });
    }
  } catch (error: any) {
    console.error('更新用户角色错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '更新角色失败', details: error.message });
    }
  }
});

// 重置用户密码（仅管理员）
router.put('/:id/password', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  // 设置响应超时（局域网访问可能需要更长时间）
  req.setTimeout(120000); // 120秒超时
  
  try {
    const { id } = req.params;
    const { password } = req.body;

    // 使用密码强度验证
    const { validatePasswordStrength } = require('../middleware/validation');
    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as any;
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 更新密码
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, id);

    if (!res.headersSent) {
      res.json({ message: '密码重置成功' });
    }
  } catch (error: any) {
    console.error('重置密码错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '重置密码失败', details: error.message });
    }
  }
});

// 删除用户（仅管理员）
router.delete('/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  // 设置响应超时，防止长时间操作导致连接重置
  // Docker 环境下删除大量关联数据可能需要更长时间，设置为 120 秒
  req.setTimeout(120000); // 120秒超时
  
  const startTime = Date.now();
  const userId = req.params.id;
  
  try {
    const currentUserId = req.userId!;

    console.log(`[删除用户] 开始删除用户: ${userId}, 操作者: ${currentUserId}`);

    // 不能删除自己
    if (userId === currentUserId) {
      return res.status(400).json({ error: '不能删除自己的账号' });
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 确保至少有一个管理员
    if (user.role === 'admin') {
      const adminCount = db
        .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
        .get() as any;
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: '至少需要保留一个管理员账号' });
      }
    }

    // 统计用户关联数据量（用于日志）
    try {
      const readingHistoryCount = db.prepare('SELECT COUNT(*) as count FROM reading_history WHERE user_id = ?').get(userId) as any;
      const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE user_id = ?').get(userId) as any;
      const highlightsCount = db.prepare('SELECT COUNT(*) as count FROM highlights WHERE user_id = ?').get(userId) as any;
      const shelvesCount = db.prepare('SELECT COUNT(*) as count FROM user_shelves WHERE user_id = ?').get(userId) as any;
      
      console.log(`[删除用户] 用户关联数据统计:`, {
        readingHistory: readingHistoryCount?.count || 0,
        notes: notesCount?.count || 0,
        highlights: highlightsCount?.count || 0,
        shelves: shelvesCount?.count || 0,
      });
    } catch (statsError) {
      console.warn('[删除用户] 统计关联数据失败:', statsError);
    }

    console.log(`[删除用户] 开始执行删除事务...`);

    // 使用事务确保操作的原子性
    const deleteUser = db.transaction((uid: string) => {
      try {
        const transactionStartTime = Date.now();
        
        // 删除用户（外键约束会自动删除相关数据）
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(uid);
        
        const transactionDuration = Date.now() - transactionStartTime;
        console.log(`[删除用户] 删除事务完成，耗时: ${transactionDuration}ms`);
        
        if (result.changes === 0) {
          throw new Error('用户删除失败：未找到要删除的用户');
        }
        
        return result;
      } catch (error: any) {
        console.error('[删除用户] 删除用户事务错误:', error);
        // 检查是否是数据库锁定错误
        if (error.code === 'SQLITE_BUSY' || error.message?.includes('database is locked')) {
          console.error('[删除用户] 数据库被锁定，可能需要重试');
          throw new Error('数据库正忙，请稍后重试');
        }
        throw error;
      }
    });

    // 执行删除操作
    deleteUser(userId);

    const totalDuration = Date.now() - startTime;
    console.log(`[删除用户] 用户删除成功，总耗时: ${totalDuration}ms`);

    // 使用标准的 Express 响应方式
    res.json({ message: '用户删除成功' });
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error(`[删除用户] 删除用户错误 (耗时: ${totalDuration}ms):`, error);
    console.error('[删除用户] 错误详情:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    
    // 确保响应已发送（只有在响应头未发送时才发送）
    if (!res.headersSent && res.writable) {
      const errorMessage = error.message || '删除用户失败';
      const statusCode = error.code === 'SQLITE_CONSTRAINT' ? 400 : 500;
      res.status(statusCode).json({ error: errorMessage });
    } else if (res.headersSent && res.writable) {
      // 如果响应头已发送但响应体未发送，发送错误响应体
      res.end(JSON.stringify({ error: error.message || '删除用户失败' }));
    }
  }
});

// ========== 推送邮箱管理 ==========

// 获取当前用户的推送邮箱列表
router.get('/me/push-emails', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const emails = db
      .prepare(`
        SELECT id, email, is_kindle, last_used_at, created_at, updated_at
        FROM user_push_emails
        WHERE user_id = ?
        ORDER BY last_used_at DESC, created_at DESC
      `)
      .all(userId) as any[];

    res.json({ emails });
  } catch (error: any) {
    console.error('获取推送邮箱列表错误:', error);
    res.status(500).json({ error: '获取推送邮箱列表失败' });
  }
});

// 添加推送邮箱
router.post('/me/push-emails', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' });
    }

    // 检查是否已存在
    const existing = db
      .prepare('SELECT id FROM user_push_emails WHERE user_id = ? AND email = ?')
      .get(userId, email) as any;

    if (existing) {
      return res.status(400).json({ error: '该邮箱已存在' });
    }

    // 判断是否为Kindle邮箱
    const isKindle = email.includes('@kindle.com') || email.includes('@free.kindle.com');

    // 插入新记录
    const emailId = uuidv4();
    db.prepare(`
      INSERT INTO user_push_emails (id, user_id, email, is_kindle)
      VALUES (?, ?, ?, ?)
    `).run(emailId, userId, email, isKindle ? 1 : 0);

    const newEmail = db
      .prepare('SELECT id, email, is_kindle, last_used_at, created_at, updated_at FROM user_push_emails WHERE id = ?')
      .get(emailId) as any;

    res.status(201).json({ message: '推送邮箱添加成功', email: newEmail });
  } catch (error: any) {
    console.error('添加推送邮箱错误:', error);
    res.status(500).json({ error: '添加推送邮箱失败' });
  }
});

// 删除推送邮箱
router.delete('/me/push-emails/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // 检查邮箱是否属于当前用户
    const emailRecord = db
      .prepare('SELECT id FROM user_push_emails WHERE id = ? AND user_id = ?')
      .get(id, userId) as any;

    if (!emailRecord) {
      return res.status(404).json({ error: '推送邮箱不存在或无权访问' });
    }

    // 删除记录
    db.prepare('DELETE FROM user_push_emails WHERE id = ?').run(id);

    res.json({ message: '推送邮箱删除成功' });
  } catch (error: any) {
    console.error('删除推送邮箱错误:', error);
    res.status(500).json({ error: '删除推送邮箱失败' });
  }
});

// 更新推送邮箱（主要用于更新最后使用时间，但也可以更新邮箱地址）
router.put('/me/push-emails/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { email } = req.body;

    // 检查邮箱是否属于当前用户
    const emailRecord = db
      .prepare('SELECT id, email FROM user_push_emails WHERE id = ? AND user_id = ?')
      .get(id, userId) as any;

    if (!emailRecord) {
      return res.status(404).json({ error: '推送邮箱不存在或无权访问' });
    }

    // 如果提供了新邮箱地址，更新它
    if (email && email !== emailRecord.email) {
      if (!email.includes('@')) {
        return res.status(400).json({ error: '请提供有效的邮箱地址' });
      }

      // 检查新邮箱是否已被其他记录使用
      const existing = db
        .prepare('SELECT id FROM user_push_emails WHERE user_id = ? AND email = ? AND id != ?')
        .get(userId, email, id) as any;

      if (existing) {
        return res.status(400).json({ error: '该邮箱已被使用' });
      }

      // 判断是否为Kindle邮箱
      const isKindle = email.includes('@kindle.com') || email.includes('@free.kindle.com');

      // 更新邮箱地址
      db.prepare(`
        UPDATE user_push_emails
        SET email = ?, is_kindle = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(email, isKindle ? 1 : 0, id);
    } else {
      // 只更新最后使用时间
      db.prepare('UPDATE user_push_emails SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }

    const updatedEmail = db
      .prepare('SELECT id, email, is_kindle, last_used_at, created_at, updated_at FROM user_push_emails WHERE id = ?')
      .get(id) as any;

    res.json({ message: '推送邮箱更新成功', email: updatedEmail });
  } catch (error: any) {
    console.error('更新推送邮箱错误:', error);
    res.status(500).json({ error: '更新推送邮箱失败' });
  }
});

// 更新用户语言偏好
router.put('/me/language', authenticateToken, async (req: AuthRequest, res) => {
  // 设置响应超时（Docker 环境下可能需要更长时间）
  req.setTimeout(120000); // 120秒超时
  
  try {
    const userId = req.userId!;
    const { language } = req.body;

    if (!language || (language !== 'zh' && language !== 'en')) {
      return res.status(400).json({ error: '请提供有效的语言代码 (zh 或 en)' });
    }

    // 使用事务确保操作的原子性
    const updateUserLanguage = db.transaction((uid: string, lang: string) => {
      try {
        const result = db.prepare('UPDATE users SET language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(lang, uid);
        
        if (result.changes === 0) {
          throw new Error('用户语言更新失败：未找到要更新的用户');
        }
        
        const updatedUser = db
          .prepare('SELECT id, username, email, role, nickname, language, created_at, updated_at FROM users WHERE id = ?')
          .get(uid) as any;
        
        return updatedUser;
      } catch (error: any) {
        console.error('更新用户语言事务错误:', error);
        throw error;
      }
    });

    // 执行更新操作
    const updatedUser = updateUserLanguage(userId, language);

    // 确保响应已发送
    if (!res.headersSent) {
      res.json({ message: '语言设置已更新', user: updatedUser });
    }
  } catch (error: any) {
    console.error('更新用户语言错误:', error);
    
    // 确保响应已发送
    if (!res.headersSent) {
      const errorMessage = error.message || '更新用户语言失败';
      const statusCode = error.code === 'SQLITE_CONSTRAINT' ? 400 : 500;
      res.status(statusCode).json({ error: errorMessage });
    }
  }
});

export default router;

