/**
 * @file auth.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { generateCaptcha, verifyCaptcha, cleanExpiredCaptchas } from '../utils/captcha';
import { checkIPBlocked, verifyPrivateAccessKey, recordAccessAttempt, checkAndBlockIP, getClientIp } from '../middleware/ipBlock';

const router = express.Router();

// 使用从ipBlock中间件导入的getClientIp

// 生成验证码
router.get('/captcha', (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    const { svg, sessionId: newSessionId } = generateCaptcha(sessionId);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Captcha-Session-Id', newSessionId);
    res.send(svg);
  } catch (error: any) {
    console.error('生成验证码失败:', error);
    res.status(500).json({ error: '生成验证码失败' });
  }
});

// 获取系统配置信息（不需要认证）
router.get('/system-config', async (req, res) => {
  try {
    // 安全地获取配置值，如果查询失败则使用默认值
    let registrationEnabled: any = null;
    let privateKeyRequiredForLogin: any = null;
    let privateKeyRequiredForRegister: any = null;
    let privateAccessKey: any = null;

    try {
      registrationEnabled = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('registration_enabled') as any;
    } catch (e: any) {
      console.warn('[system-config] 查询 registration_enabled 失败:', e.message);
    }

    try {
      privateKeyRequiredForLogin = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_login') as any;
    } catch (e: any) {
      console.warn('[system-config] 查询 private_key_required_for_login 失败:', e.message);
    }

    try {
      privateKeyRequiredForRegister = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_register') as any;
    } catch (e: any) {
      console.warn('[system-config] 查询 private_key_required_for_register 失败:', e.message);
    }

    try {
      privateAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;
    } catch (e: any) {
      console.warn('[system-config] 查询 private_access_key 失败:', e.message);
    }

    // 返回配置，如果查询失败则使用默认值
    const getBoolValue = (setting: any, defaultValue: boolean): boolean => {
      if (!setting || !setting.value) return defaultValue;
      return setting.value === 'true';
    };

    res.json({
      registrationEnabled: getBoolValue(registrationEnabled, true), // 默认允许注册
      privateKeyRequiredForLogin: getBoolValue(privateKeyRequiredForLogin, false), // 默认不需要
      privateKeyRequiredForRegister: getBoolValue(privateKeyRequiredForRegister, true), // 默认需要
      hasPrivateKey: !!(privateAccessKey?.value && privateAccessKey.value.trim() !== ''),
    });
  } catch (error: any) {
    console.error('[system-config] 获取系统配置失败:', error);
    console.error('[system-config] 错误堆栈:', error.stack);
    // 即使出错也返回默认配置，避免前端无法加载
    res.json({
      registrationEnabled: true,
      privateKeyRequiredForLogin: false,
      privateKeyRequiredForRegister: true,
      hasPrivateKey: false,
    });
  }
});

// 验证私有访问密钥（不需要认证）
router.post('/verify-private-key', async (req, res) => {
  try {
    const { privateKey } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: '请提供私有访问密钥' });
    }

    const storedAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;
    
    if (!storedAccessKey || !storedAccessKey.value || storedAccessKey.value.trim() === '') {
      // 如果没有设置密钥，验证通过
      return res.json({ valid: true });
    }

    const isValid = privateKey === storedAccessKey.value;
    
    if (!isValid) {
      return res.status(403).json({ error: '私有访问密钥错误', valid: false });
    }

    res.json({ valid: true });
  } catch (error: any) {
    console.error('验证私有访问密钥失败:', error);
    res.status(500).json({ error: '验证失败' });
  }
});

// 注册（需要验证私有访问密钥）
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, privateKey } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: '请提供用户名、邮箱和密码' });
    }

    // 检查是否允许注册
    const registrationEnabled = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('registration_enabled') as any;
    if (registrationEnabled?.value === 'false') {
      return res.status(403).json({ error: '系统已关闭注册功能' });
    }

    // 检查是否需要验证私有密钥
    const privateKeyRequiredForRegister = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_register') as any;
    const isPrivateKeyRequired = privateKeyRequiredForRegister?.value === 'true';

    if (isPrivateKeyRequired) {
      const storedAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;
      
      // 如果设置了密钥，则必须验证
      if (storedAccessKey?.value && storedAccessKey.value.trim() !== '') {
        if (!privateKey) {
          return res.status(400).json({ error: '请提供私有访问密钥' });
        }

        if (privateKey !== storedAccessKey.value) {
          return res.status(403).json({ error: '私有访问密钥错误' });
        }
      }
    }

    // 检查用户是否已存在
    const existingUser = db
      .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .get(username, email);

    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }

    // 检查数据库中是否已有用户
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    const isFirstUser = userCount.count === 0;

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const userId = uuidv4();
    // 第一个注册的用户自动设置为管理员
    const userRole = isFirstUser ? 'admin' : 'user';
    db.prepare(
      'INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, username, email, hashedPassword, userRole);

    // 如果是第一个用户，输出日志
    if (isFirstUser) {
      console.log('========================================');
      console.log('🎉 第一个用户已注册为管理员！');
      console.log('========================================');
      console.log(`用户名: ${username}`);
      console.log(`邮箱: ${email}`);
      console.log(`角色: 管理员 (admin)`);
      console.log('========================================');
    }

    // 生成JWT
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    if (typeof secret !== 'string') {
      throw new Error('JWT_SECRET must be a string');
    }
    const token = jwt.sign({ userId: userId }, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as jwt.SignOptions);

    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: userId, username, email, role: userRole },
    });
  } catch (error: any) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录（先验证私有访问密钥，再验证用户登录）
router.post('/login', checkIPBlocked, async (req, res) => {
  try {
    const { username, password, captcha, captchaSessionId, rememberMe, privateKey } = req.body;
    const clientIp = getClientIp(req);

    // 检查是否需要验证私有密钥
    const privateKeyRequiredForLogin = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_login') as any;
    const isPrivateKeyRequired = privateKeyRequiredForLogin?.value === 'true';

    if (isPrivateKeyRequired) {
      const storedAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;
      
      // 如果设置了密钥，则必须验证
      if (storedAccessKey?.value && storedAccessKey.value.trim() !== '') {
        if (!privateKey) {
          return res.status(400).json({ error: '请提供私有访问密钥' });
        }

        if (privateKey !== storedAccessKey.value) {
          // 记录失败尝试
          recordAccessAttempt(clientIp, 'private_key', false);
          checkAndBlockIP(clientIp, 'private_key');
          return res.status(403).json({ error: '私有访问密钥错误' });
        }
      }
    }

    // 验证验证码
    if (!captcha || !captchaSessionId) {
      return res.status(400).json({ error: '请提供验证码' });
    }

    if (!verifyCaptcha(captchaSessionId, captcha)) {
      return res.status(400).json({ error: '验证码错误' });
    }

    if (!username || !password) {
      return res.status(400).json({ error: '请提供用户名和密码' });
    }

    // 查找用户
    let user: any;
    try {
      user = db
      .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(username, username) as any;
    } catch (dbError: any) {
      console.error('数据库查询错误:', dbError);
      throw new Error(`数据库查询失败: ${dbError.message}`);
    }

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 检查密码字段是否存在
    if (!user.password) {
      console.error('用户密码字段为空:', user);
      return res.status(500).json({ error: '用户数据异常，请联系管理员' });
    }

    // 验证密码
    let isValid: boolean;
    try {
      isValid = await bcrypt.compare(password, user.password);
    } catch (bcryptError: any) {
      console.error('密码验证错误:', bcryptError);
      // 记录失败尝试
      recordAccessAttempt(clientIp, 'login', false);
      checkAndBlockIP(clientIp, 'login');
      throw new Error(`密码验证失败: ${bcryptError.message}`);
    }
    
    if (!isValid) {
      // 记录失败尝试
      recordAccessAttempt(clientIp, 'login', false);
      checkAndBlockIP(clientIp, 'login');
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 记录成功尝试
    recordAccessAttempt(clientIp, 'login', true);

    // 生成JWT（如果记住我，设置为1年，否则7天）
    let token: string;
    try {
      const secret = process.env.JWT_SECRET || 'your-secret-key';
      if (typeof secret !== 'string') {
        throw new Error('JWT_SECRET must be a string');
      }
      const expiresIn = rememberMe ? '365d' : (process.env.JWT_EXPIRES_IN || '7d');
      token = jwt.sign({ userId: user.id }, secret, {
        expiresIn,
      } as jwt.SignOptions);
    } catch (jwtError: any) {
      console.error('JWT生成错误:', jwtError);
      throw new Error(`JWT生成失败: ${jwtError.message}`);
    }

    res.json({
      message: '登录成功',
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role || 'user',
        nickname: user.nickname || null
      },
    });
  } catch (error: any) {
    console.error('登录错误:', error);
    console.error('错误堆栈:', error.stack);
    const { username: reqUsername, password: reqPassword } = req.body;
    console.error('请求数据:', { username: reqUsername, passwordLength: reqPassword?.length });
    res.status(500).json({ 
      error: '登录失败', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret) as any;

    const user = db
      .prepare('SELECT id, username, email, role, nickname, created_at FROM users WHERE id = ?')
      .get(decoded.userId) as any;

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ user });
  } catch (error: any) {
    res.status(401).json({ error: '无效的认证令牌' });
  }
});

export default router;

