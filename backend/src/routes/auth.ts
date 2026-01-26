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
import { validate, validateLogin, validateRegister } from '../middleware/validation';
import { logActionFromRequest, getClientIpFromRequest } from '../utils/logger';

const router = express.Router();

// 使用从ipBlock中间件导入的getClientIp

// 生成验证码
// 支持两种格式：
// 1. 默认返回 JSON（包含 svg、svgDataUrl 和 sessionId，避免 CORS 问题）
// 2. 如果明确请求 SVG 格式（format=svg 或 Accept: image/svg），返回 SVG
router.get('/captcha', (req, res) => {
  try {
    // console.log('[验证码] 收到验证码请求');
    // console.log('[验证码] 请求 URL:', req.url);
    // console.log('[验证码] 请求原始 URL:', req.originalUrl);
    // console.log('[验证码] 请求查询参数 (原始):', req.query);
    // console.log('[验证码] 请求查询参数 (字符串化):', JSON.stringify(req.query, null, 2));
    // console.log('[验证码] 请求头:', {
    //   'accept': req.headers.accept,
    //   'user-agent': req.headers['user-agent']
    // });
    
    // 从查询参数中获取值（确保正确处理）
    const sessionId = (req.query.sessionId as string) || undefined;
    const format = (req.query.format as string) || '';
    const acceptHeader = req.headers.accept || '';
    
    console.log('[验证码] 解析后的参数:', {
      sessionId: sessionId || '未提供',
      format: format,
      formatType: typeof format,
      formatValue: format === 'json' ? '✅ 是 json' : `❌ 不是 json (值是: "${format}")`,
      acceptHeader: acceptHeader,
      acceptHeaderIncludesJson: acceptHeader.includes('application/json') ? '✅ 包含 json' : '❌ 不包含 json'
    });
    
    const result = generateCaptcha(sessionId);
    console.log('[验证码] 生成成功，SessionId:', result.sessionId);
    
    if (!result.svg || !result.sessionId) {
      console.error('[验证码] 返回数据无效:', { hasSvg: !!result.svg, hasSessionId: !!result.sessionId });
      throw new Error('验证码生成返回数据无效');
    }
    
    // 默认返回 JSON 格式（更可靠，避免 CORS 问题）
    // 只有在明确请求 SVG 格式时才返回 SVG
    const formatLower = (format || '').toLowerCase().trim();
    const acceptHeaderLower = (acceptHeader || '').toLowerCase();
    
    // 检查是否明确请求 SVG 格式
    const explicitlyRequestSvg = formatLower === 'svg' || 
                                  acceptHeaderLower.includes('image/svg') ||
                                  acceptHeaderLower.includes('image/*');
    
    // 检查是否请求 JSON 格式
    const explicitlyRequestJson = formatLower === 'json' || 
                                  acceptHeaderLower.includes('application/json');
    
    // 默认返回 JSON（除非明确请求 SVG）
    const shouldReturnJson = explicitlyRequestJson || !explicitlyRequestSvg;
    
    console.log('[验证码] 格式检测:', {
      format: format,
      formatLower: formatLower,
      acceptHeader: acceptHeader,
      acceptHeaderLower: acceptHeaderLower,
      explicitlyRequestSvg: explicitlyRequestSvg,
      explicitlyRequestJson: explicitlyRequestJson,
      shouldReturnJson: shouldReturnJson,
      queryParams: req.query
    });
    
    // 返回 JSON 格式（默认或明确请求）
    if (shouldReturnJson) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // 将 SVG 转换为 data URL
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
      
      console.log('[验证码] 返回 JSON 格式，SessionId:', result.sessionId);
      const jsonResponse = {
        svg: result.svg,
        svgDataUrl: svgDataUrl,
        sessionId: result.sessionId
      };
      console.log('[验证码] JSON 响应数据:', { 
        hasSvg: !!jsonResponse.svg, 
        hasSvgDataUrl: !!jsonResponse.svgDataUrl,
        sessionId: jsonResponse.sessionId,
        svgLength: jsonResponse.svg?.length || 0
      });
      
      // 确保响应头已设置
      console.log('[验证码] 设置响应头前检查:', {
        'Content-Type': res.getHeader('Content-Type'),
        'X-Captcha-Session-Id': res.getHeader('X-Captcha-Session-Id')
      });
      
      res.json(jsonResponse);
      console.log('[验证码] ✅ JSON 响应已发送，Content-Type 应该是 application/json');
      return;
    }
    
    // 如果代码执行到这里，说明 shouldReturnJson 为 false
    // 这不应该发生，因为我们已经设置了默认返回 JSON
    // 但为了安全，仍然返回 JSON
    console.error('[验证码] ⚠️  意外情况：shouldReturnJson 为 false，但仍然返回 JSON');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
    res.json({
      svg: result.svg,
      svgDataUrl: svgDataUrl,
      sessionId: result.sessionId
    });
    console.log('[验证码] ✅ 备用 JSON 响应已发送');
    return;
  } catch (error: any) {
    console.error('[验证码] 生成验证码失败:', error);
    console.error('[验证码] 错误类型:', error?.constructor?.name);
    console.error('[验证码] 错误消息:', error?.message);
    console.error('[验证码] 错误堆栈:', error?.stack);
    
    // 如果响应头已发送，无法再发送错误响应
    if (res.headersSent) {
      console.error('[验证码] 响应头已发送，无法返回错误信息');
      return;
    }
    
    // 返回详细的错误信息（开发环境）
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `生成验证码失败: ${error?.message || error || '未知错误'}`
      : '生成验证码失败';
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
});

// 获取系统配置信息（不需要认证）
router.get('/system-config', async (req, res) => {
  // 默认配置值
  const defaultConfig = {
    registrationEnabled: true,
    privateKeyRequiredForLogin: false,
    privateKeyRequiredForRegister: true,
    hasPrivateKey: false,
    enableApiServerConfigInLogin: true,
  };

  try {
    console.log('[system-config] 收到系统配置请求');
    
    // 检查数据库是否可用
    if (!db) {
      console.warn('[system-config] 数据库未初始化，返回默认配置');
      return res.status(200).json(defaultConfig);
    }
    
    // 安全地获取配置值，如果查询失败则使用默认值
    let registrationEnabled: any = null;
    let privateKeyRequiredForLogin: any = null;
    let privateKeyRequiredForRegister: any = null;
    let privateAccessKey: any = null;
    let enableApiServerConfigInLogin: any = null;

    try {
      registrationEnabled = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('registration_enabled') as any;
      console.log('[system-config] registration_enabled:', registrationEnabled?.value);
    } catch (e: any) {
      console.warn('[system-config] 查询 registration_enabled 失败:', e.message);
    }

    try {
      privateKeyRequiredForLogin = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_login') as any;
      console.log('[system-config] private_key_required_for_login:', privateKeyRequiredForLogin?.value);
    } catch (e: any) {
      console.warn('[system-config] 查询 private_key_required_for_login 失败:', e.message);
    }

    try {
      privateKeyRequiredForRegister = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_register') as any;
      console.log('[system-config] private_key_required_for_register:', privateKeyRequiredForRegister?.value);
    } catch (e: any) {
      console.warn('[system-config] 查询 private_key_required_for_register 失败:', e.message);
    }

    try {
      privateAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;
      console.log('[system-config] private_access_key:', privateAccessKey ? '已设置' : '未设置');
    } catch (e: any) {
      console.warn('[system-config] 查询 private_access_key 失败:', e.message);
    }

    try {
      enableApiServerConfigInLogin = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('enable_api_server_config_in_login') as any;
      console.log('[system-config] enable_api_server_config_in_login:', enableApiServerConfigInLogin?.value);
    } catch (e: any) {
      console.warn('[system-config] 查询 enable_api_server_config_in_login 失败:', e.message);
    }

    // 返回配置，如果查询失败则使用默认值
    const getBoolValue = (setting: any, defaultValue: boolean): boolean => {
      if (!setting || !setting.value) return defaultValue;
      return setting.value === 'true';
    };

    // 确保返回 200 状态码，即使有错误也返回默认配置
    return res.status(200).json({
      registrationEnabled: getBoolValue(registrationEnabled, defaultConfig.registrationEnabled),
      privateKeyRequiredForLogin: getBoolValue(privateKeyRequiredForLogin, defaultConfig.privateKeyRequiredForLogin),
      privateKeyRequiredForRegister: getBoolValue(privateKeyRequiredForRegister, defaultConfig.privateKeyRequiredForRegister),
      hasPrivateKey: !!(privateAccessKey?.value && privateAccessKey.value.trim() !== ''),
      enableApiServerConfigInLogin: getBoolValue(enableApiServerConfigInLogin, defaultConfig.enableApiServerConfigInLogin),
    });
  } catch (error: any) {
    // 记录错误但不影响响应
    console.error('[system-config] 获取系统配置失败:', error);
    console.error('[system-config] 错误堆栈:', error.stack);
    // 即使出错也返回默认配置（200状态码），避免前端无法加载
    return res.status(200).json(defaultConfig);
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
router.post('/register', validate(validateRegister), async (req, res) => {
  try {
    const { username, nickname, email, password, privateKey } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: '请提供用户名、邮箱和密码' });
    }

    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ error: '请提供昵称' });
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
    // can_upload_private 默认值：管理员为 1（允许），普通用户为 0（禁用）
    const canUploadPrivateValue = userRole === 'admin' ? 1 : 0;
    // max_private_books 默认为 30
    const maxPrivateBooks = 30;
    // 处理昵称（去除首尾空格）
    const trimmedNickname = nickname.trim();
    db.prepare(
      'INSERT INTO users (id, username, nickname, email, password, role, can_upload_private, max_private_books) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(userId, username, trimmedNickname, email, hashedPassword, userRole, canUploadPrivateValue, maxPrivateBooks);

    // 如果是第一个用户，输出日志
    if (isFirstUser) {
      console.log('========================================');
      console.log('🎉 第一个用户已注册为管理员！');
      console.log('========================================');
      console.log(`用户名: ${username}`);
      console.log(`昵称: ${trimmedNickname}`);
      console.log(`邮箱: ${email}`);
      console.log(`角色: 管理员 (admin)`);
      console.log('========================================');
    }

    // 生成JWT
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'your-secret-key') {
      console.error('[安全] JWT_SECRET未正确配置');
      return res.status(500).json({ error: '服务器配置错误' });
    }
    if (typeof secret !== 'string') {
      throw new Error('JWT_SECRET must be a string');
    }
    const token = jwt.sign({ userId: userId }, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as jwt.SignOptions);

    // 获取创建的用户信息（包含权限字段）
    const newUser = db
      .prepare('SELECT id, username, nickname, email, role, can_upload_private, max_private_books FROM users WHERE id = ?')
      .get(userId) as any;
    
    // 转换 can_upload_private 为布尔值
    const canUploadPrivateBool = newUser.can_upload_private === 1;
    
    res.status(201).json({
      message: '注册成功',
      token,
      user: { 
        id: userId, 
        username, 
        nickname: newUser.nickname || trimmedNickname,
        email, 
        role: userRole,
        can_upload_private: canUploadPrivateBool,
        max_private_books: newUser.max_private_books || 30
      },
    });
  } catch (error: any) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录（先验证私有访问密钥，再验证用户登录）
router.post('/login', checkIPBlocked, validate(validateLogin), async (req, res) => {
  try {
    // 检查数据库是否可用
    if (!db) {
      console.error('[登录] 数据库未初始化');
      return res.status(500).json({ 
        error: '数据库未初始化',
        message: '数据库连接失败，请检查数据库配置',
        hint: '请检查 DB_PATH 环境变量和数据库文件权限'
      });
    }
    
    const { username, password, captcha, captchaSessionId, rememberMe, privateKey } = req.body;
    const clientIp = getClientIp(req);
    
    // 记录请求信息（用于调试）
    console.log('[登录] 收到登录请求:', { 
      username, 
      hasPassword: !!password,
      hasCaptcha: !!captcha,
      hasCaptchaSessionId: !!captchaSessionId,
      clientIp 
    });

    // 检查是否需要验证私有密钥（安全地查询数据库，避免表不存在时出错）
    let privateKeyRequiredForLogin: any = null;
    let isPrivateKeyRequired = false;
    try {
      privateKeyRequiredForLogin = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_key_required_for_login') as any;
      isPrivateKeyRequired = privateKeyRequiredForLogin?.value === 'true';
    } catch (dbError: any) {
      console.warn('[登录] 查询 private_key_required_for_login 失败:', dbError.message);
      // 如果查询失败，默认不要求私有密钥
      isPrivateKeyRequired = false;
    }

    if (isPrivateKeyRequired) {
      let storedAccessKey: any = null;
      try {
        storedAccessKey = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('private_access_key') as any;
      } catch (dbError: any) {
        console.warn('[登录] 查询 private_access_key 失败:', dbError.message);
        // 如果查询失败，跳过私有密钥验证
        storedAccessKey = null;
      }
      
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
      if (!db) {
        throw new Error('数据库未初始化');
      }
      user = db
      .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(username, username) as any;
    } catch (dbError: any) {
      console.error('[登录] 数据库查询错误:', {
        message: dbError.message,
        name: dbError.name,
        code: dbError.code,
        stack: dbError.stack
      });
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
      // 记录登录失败日志
      logActionFromRequest(req, {
        username: username,
        action_type: 'login_failed',
        action_category: 'auth',
        description: `登录失败：用户名或密码错误`,
      });
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 记录成功尝试
    recordAccessAttempt(clientIp, 'login', true);
    
    // 记录登录成功日志
    logActionFromRequest(req, {
      user_id: user.id,
      username: user.username,
      action_type: 'login',
      action_category: 'auth',
      description: `用户登录成功`,
      metadata: {
        rememberMe: rememberMe || false,
      },
    });

    // 生成JWT（如果记住我，设置为1年，否则7天）
    let token: string;
    // 将 secret 定义在 try 块外，以便在 catch 中访问
    const secret = process.env.JWT_SECRET;
    try {
      console.log('[登录] JWT_SECRET检查:', { 
        hasSecret: !!secret, 
        secretLength: secret?.length,
        secretPrefix: secret ? secret.substring(0, 10) + '...' : '未设置',
        isDefault: !secret || secret.trim() === '' || secret === 'your-secret-key' || secret === 'change-this-secret-key-in-production'
      });
      
      // 只拒绝明显的默认值或空值，允许 docker-compose 中设置的有效默认值
      // 只要 JWT_SECRET 存在且长度合理（至少10个字符），就允许使用
      if (!secret || secret.trim() === '') {
        console.error('[安全] JWT_SECRET未设置');
        console.error('[安全] 环境变量检查:', {
          JWT_SECRET: process.env.JWT_SECRET ? '已设置' : '未设置',
          NODE_ENV: process.env.NODE_ENV
        });
        return res.status(500).json({ 
          error: '服务器配置错误：JWT_SECRET未设置',
          message: '请在环境变量中设置JWT_SECRET',
          hint: '在 docker-compose.yml 中设置 JWT_SECRET 环境变量，或创建 .env 文件'
        });
      }
      
      // 只拒绝明显的开发默认值
      if (secret === 'your-secret-key' || secret === 'change-this-secret-key-in-production') {
        console.error('[安全] JWT_SECRET使用了不安全的默认值');
        return res.status(500).json({ 
          error: '服务器配置错误：JWT_SECRET使用了不安全的默认值',
          message: '请设置一个强密钥，不能使用开发默认值'
        });
      }
      if (typeof secret !== 'string') {
        throw new Error('JWT_SECRET must be a string');
      }
      const expiresIn = rememberMe ? '365d' : (process.env.JWT_EXPIRES_IN || '7d');
      console.log('[登录] 准备生成JWT:', {
        userId: user.id,
        expiresIn,
        secretLength: secret.length,
        secretPrefix: secret.substring(0, 10) + '...'
      });
      token = jwt.sign({ userId: user.id }, secret, {
        expiresIn,
      } as jwt.SignOptions);
      console.log('[登录] JWT生成成功，token长度:', token.length);
    } catch (jwtError: any) {
      console.error('[登录] JWT生成错误:', {
        message: jwtError.message,
        name: jwtError.name,
        code: jwtError.code,
        stack: jwtError.stack,
        secretLength: secret?.length,
        hasSecret: !!secret
      });
      throw new Error(`JWT生成失败: ${jwtError.message}`);
    }

    // 更新最后登录时间
    try {
      db.prepare('UPDATE users SET last_login_time = ? WHERE id = ?').run(new Date().toISOString(), user.id);
      console.log('[登录] 已更新用户最后登录时间:', { userId: user.id, username: user.username });
    } catch (updateError: any) {
      console.warn('[登录] 更新最后登录时间失败:', updateError.message);
      // 不影响登录流程
    }

    // 转换 can_upload_private 为布尔值
    const canUploadPrivateBool = user.can_upload_private !== undefined && user.can_upload_private !== null
      ? user.can_upload_private === 1
      : (user.role === 'admin'); // 默认：管理员允许，普通用户不允许
    
    res.json({
      message: '登录成功',
      token,
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        role: user.role || 'user',
        nickname: user.nickname || null,
        can_upload_private: canUploadPrivateBool,
        max_private_books: user.max_private_books || 30,
        avatar_path: user.avatar_path || null
      },
    });
  } catch (error: any) {
    console.error('[登录] ========== 登录错误 ==========');
    console.error('[登录] 错误消息:', error.message);
    console.error('[登录] 错误名称:', error.name);
    console.error('[登录] 错误代码:', error.code);
    console.error('[登录] 错误堆栈:', error.stack);
    const { username: reqUsername, password: reqPassword, captcha, captchaSessionId } = req.body || {};
    console.error('[登录] 请求数据:', { 
      username: reqUsername, 
      passwordLength: reqPassword?.length,
      hasCaptcha: !!captcha,
      captchaLength: captcha?.length,
      hasCaptchaSessionId: !!captchaSessionId,
      captchaSessionIdLength: captchaSessionId?.length
    });
    console.error('[登录] =================================');
    
    // 检查是否是JWT_SECRET相关错误
    if (error.message && (error.message.includes('JWT_SECRET') || error.message.includes('服务器配置错误'))) {
      return res.status(500).json({ 
        error: '服务器配置错误：JWT_SECRET未正确配置',
        message: '请在环境变量中设置JWT_SECRET，不能使用默认值',
        hint: '在.env文件或docker-compose.yml中设置JWT_SECRET环境变量',
        detail: '请重启后端容器以应用JWT_SECRET更改'
      });
    }
    
    // 返回详细的错误信息（帮助调试）
    // 即使在生产环境也返回基本错误信息，帮助定位问题
    const errorResponse: any = {
      error: '登录失败',
      message: error.message || '服务器内部错误'
    };
    
    // 始终返回错误类型和代码（帮助前端识别错误）
    if (error.name) {
      errorResponse.errorType = error.name;
    }
    if (error.code) {
      errorResponse.errorCode = error.code;
    }
    
    // 生产环境也返回关键错误信息（不返回堆栈）
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment) {
      errorResponse.stack = error.stack;
      errorResponse.details = {
        name: error.name,
        code: error.code,
        message: error.message
      };
    } else {
      // 生产环境：返回错误类型和消息，帮助调试但不暴露敏感信息
      errorResponse.errorType = error.name || 'UnknownError';
      errorResponse.message = error.message || '服务器内部错误';
    }
    
    // 如果是数据库错误，提供更友好的提示
    if (error.message && (error.message.includes('database') || error.message.includes('SQL') || error.message.includes('prepare') || error.message.includes('ENOENT'))) {
      errorResponse.message = '数据库操作失败，请检查数据库连接';
      errorResponse.hint = '请检查数据库文件是否存在且可访问';
    }
    
    // 如果是 JWT 相关错误
    if (error.message && (error.message.includes('JWT') || error.message.includes('token'))) {
      errorResponse.message = 'JWT 生成失败';
      errorResponse.hint = '请检查 JWT_SECRET 配置';
    }
    
    console.error('[登录] 返回错误响应:', errorResponse);
    res.status(500).json(errorResponse);
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

    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'your-secret-key') {
      console.error('[安全] JWT_SECRET未正确配置');
      return res.status(500).json({ error: '服务器配置错误' });
    }
    const decoded = jwt.verify(token, secret) as any;

    const user = db
      .prepare('SELECT id, username, email, role, nickname, can_upload_private, max_private_books, created_at, avatar_path FROM users WHERE id = ?')
      .get(decoded.userId) as any;

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 转换 can_upload_private 为布尔值
    const canUploadPrivateBool2 = user.can_upload_private !== undefined && user.can_upload_private !== null
      ? user.can_upload_private === 1
      : (user.role === 'admin'); // 默认：管理员允许，普通用户不允许
    
    res.json({ 
      user: {
        ...user,
        can_upload_private: canUploadPrivateBool2,
        max_private_books: user.max_private_books || 30
      }
    });
  } catch (error: any) {
    res.status(401).json({ error: '无效的认证令牌' });
  }
});

export default router;

