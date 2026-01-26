/**
 * @file auth.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  // ✅ 修复：支持从 Authorization header 或 query 参数读取 token
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  // 如果 header 中没有 token，尝试从 query 参数读取（降级方案）
  if (!token && req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  // 检查JWT密钥是否配置
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    console.error('[安全] JWT_SECRET未设置');
    return res.status(500).json({ error: '服务器配置错误：JWT_SECRET未设置' });
  }
  
  // 只拒绝明显的开发默认值，允许 docker-compose 中设置的有效默认值
  if (secret === 'your-secret-key' || secret === 'change-this-secret-key-in-production') {
    console.error('[安全] JWT_SECRET使用了不安全的默认值');
    return res.status(500).json({ error: '服务器配置错误：JWT_SECRET使用了不安全的默认值' });
  }
  
  jwt.verify(token, secret, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: '无效的认证令牌' });
    }
    
    // 验证用户是否存在
    try {
      const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(decoded.userId) as any;
      if (!user) {
        console.warn('JWT token 中的用户不存在:', decoded.userId);
        return res.status(401).json({ error: '用户不存在，请重新登录' });
      }
      req.userId = decoded.userId;
      req.userRole = user.role || 'user';
    } catch (e) {
      console.error('验证用户失败:', e);
      return res.status(500).json({ error: '验证用户失败' });
    }
    
    next();
  });
}

// 检查是否为管理员
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.userId) {
    return res.status(401).json({ error: '未认证' });
  }
  
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  
  next();
}

/**
 * 检查是否为本地地址
 */
function isLocalHostname(hostname: string): boolean {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase().trim();
  return normalized === 'localhost' || 
         normalized === '127.0.0.1' || 
         normalized === '::1' ||
         normalized === '0.0.0.0' ||
         normalized.startsWith('127.') ||
         normalized.startsWith('192.168.') ||
         normalized.startsWith('10.') ||
         normalized.startsWith('172.16.') ||
         normalized.startsWith('172.17.') ||
         normalized.startsWith('172.18.') ||
         normalized.startsWith('172.19.') ||
         normalized.startsWith('172.20.') ||
         normalized.startsWith('172.21.') ||
         normalized.startsWith('172.22.') ||
         normalized.startsWith('172.23.') ||
         normalized.startsWith('172.24.') ||
         normalized.startsWith('172.25.') ||
         normalized.startsWith('172.26.') ||
         normalized.startsWith('172.27.') ||
         normalized.startsWith('172.28.') ||
         normalized.startsWith('172.29.') ||
         normalized.startsWith('172.30.') ||
         normalized.startsWith('172.31.');
}

/**
 * 检查是否为本地同源请求
 * 如果请求来源和目标是同一个地址（localhost/127.0.0.1），则认为是本地请求
 */
function isLocalSameOriginRequest(req: Request): boolean {
  try {
    // 获取请求目标地址
    const host = req.get('host') || '';
    const protocol = req.protocol || 'http';
    
    // 获取请求来源地址
    const origin = req.get('origin') || req.get('referer') || '';
    
    // 如果没有Origin和Referer，可能是直接请求（如Postman），检查Host是否为本地
    if (!origin) {
      const hostname = host.split(':')[0];
      return isLocalHostname(hostname);
    }
    
    // 解析Origin
    let originHostname: string;
    let originPort: string | undefined;
    try {
      const originUrl = new URL(origin);
      originHostname = originUrl.hostname;
      originPort = originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80');
    } catch (e) {
      // Origin解析失败，尝试从Referer解析
      try {
        const refererUrl = new URL(req.get('referer') || '');
        originHostname = refererUrl.hostname;
        originPort = refererUrl.port || (refererUrl.protocol === 'https:' ? '443' : '80');
      } catch (e2) {
        return false;
      }
    }
    
    // 解析目标Host
    const hostParts = host.split(':');
    const targetHostname = hostParts[0];
    const targetPort = hostParts[1] || (protocol === 'https' ? '443' : '80');
    
    // 如果来源和目标都是本地地址，则认为是本地请求
    if (isLocalHostname(originHostname) && isLocalHostname(targetHostname)) {
      // 如果端口也匹配，或者都是默认端口，则认为是同一服务器
      if (originPort === targetPort || 
          (originPort === '80' && targetPort === '80') ||
          (originPort === '443' && targetPort === '443')) {
        return true;
      }
      // 即使端口不同，如果都是本地地址，也认为是本地请求（前后端可能在同一机器不同端口）
      if (originHostname === targetHostname) {
        return true;
      }
    }
    
    // 如果来源和目标完全匹配（包括端口），则认为是同源请求
    if (originHostname === targetHostname && originPort === targetPort) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('检查本地请求失败:', error);
    return false;
  }
}

/**
 * 检查请求是否来自 Docker 网络内部
 * 如果请求直接来自 Docker 网络内的容器（如 nginx frontend），则认为是内部请求
 */
function isInternalDockerRequest(req: Request): boolean {
  try {
    // 获取直接连接的客户端地址（不经过代理）
    const socket = req.socket;
    const remoteAddress = socket?.remoteAddress;
    
    if (remoteAddress) {
      // 移除 IPv6 前缀（如 ::ffff:172.20.0.1）
      const cleanAddress = remoteAddress.replace(/^::ffff:/, '');
      
      // 检查是否为 Docker 网络内部地址
      // Docker 默认使用 172.x.x.x 范围，这里检查所有可能的私有网络地址
      if (isLocalHostname(cleanAddress)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.warn('[API Key验证] 检查内部请求失败:', error);
    return false;
  }
}

/**
 * 验证 API Key（从请求头 X-API-Key 读取）
 * 如果未配置 API Key 或未提供请求头，则不验证（允许通过）
 * 如果配置了 API Key，则必须提供正确的 API Key
 * 如果请求来源和目标都是本地地址（localhost/127.0.0.1），则跳过验证
 * 如果请求来自 Docker 网络内部（如通过 nginx 代理），则跳过验证
 */
export function verifyApiKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const origin = req.headers.origin;
    const host = req.get('host');
    const path = req.path;

    // 优先检查：如果请求来自 Docker 网络内部（通过 nginx 等代理转发），跳过验证
    // 这是为了支持前端和后端在同一个 Docker 网络中部署的场景
    if (isInternalDockerRequest(req)) {
      console.log('[API Key验证] ✅ 跳过Docker内部请求:', {
        remoteAddress: req.socket?.remoteAddress,
        origin: origin || '无origin',
        host: host,
        path: path
      });
      return next();
    }

    // 检查是否为本地同源请求，如果是则跳过验证
    if (isLocalSameOriginRequest(req)) {
      console.log('[API Key验证] ✅ 跳过本地同源请求:', {
        origin: origin || '无origin',
        host: host,
        path: path
      });
      return next();
    }

    // 额外检查：如果请求来自本地网络地址（192.168.x.x等），也跳过验证
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (isLocalHostname(originUrl.hostname)) {
          console.log('[API Key验证] ✅ 跳过本地网络Origin请求:', {
            origin,
            hostname: originUrl.hostname,
            path: path
          });
          return next();
        }
      } catch (e) {
        // 忽略URL解析错误
      }
    }

    // 检查请求的Host头是否为本地地址
    if (host) {
      const hostname = host.split(':')[0]; // 移除端口
      if (isLocalHostname(hostname)) {
        console.log('[API Key验证] ✅ 跳过本地Host请求:', {
          host,
          hostname,
          path: path
        });
        return next();
      }
    }

    // 新增：如果Origin或Referer包含localhost或127.0.0.1，也跳过验证
    // 这解决了前端在localhost:1280，后端在localhost:1281的情况
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
          console.log('[API Key验证] ✅ 跳过localhost Origin请求:', {
            origin,
            hostname: originUrl.hostname,
            path: path
          });
          return next();
        }
      } catch (e) {
        // 忽略URL解析错误
      }
    }

    // 检查Referer头是否包含localhost
    const referer = req.get('referer');
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.hostname === 'localhost' || refererUrl.hostname === '127.0.0.1') {
          console.log('[API Key验证] ✅ 跳过localhost Referer请求:', {
            referer,
            hostname: refererUrl.hostname,
            path: path
          });
          return next();
        }
      } catch (e) {
        // 忽略URL解析错误
      }
    }
    
    // 从数据库获取配置的 API Key
    const apiKeySetting = db
      .prepare("SELECT value FROM system_settings WHERE key = 'api_key'")
      .get() as { value?: string } | undefined;

    const configuredApiKey = apiKeySetting?.value?.trim();

    // 如果未配置 API Key，允许通过（向后兼容）
    if (!configuredApiKey || configuredApiKey === '') {
      console.log('[API Key验证] ✅ 未配置API Key，允许通过:', {
        path: path,
        origin: origin || '无origin',
        host: host
      });
      return next();
    }
    
    // 如果配置了API Key，记录需要验证的请求
    console.log('[API Key验证] ⚠️ 需要验证API Key:', {
      path: path,
      origin: origin || '无origin',
      host: host,
      hasApiKeyHeader: !!(req.headers['x-api-key'] || req.headers['X-API-Key'])
    });

    // 从请求头获取 API Key（支持大小写）
    const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];

    // 如果未提供 API Key，拒绝请求
    if (!apiKey || typeof apiKey !== 'string') {
      console.error('[API Key验证] ❌ 缺少API Key:', {
        path: path,
        origin: origin || '无origin',
        host: host,
        headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('api'))
      });
      return res.status(401).json({
        error: '缺少 API Key',
        message: '请在请求头中提供 X-API-Key',
        hint: '如果这是本地请求，请检查CORS和本地地址识别配置'
      });
    }

    // 验证 API Key
    if (apiKey.trim() !== configuredApiKey) {
      console.error('[API Key验证] ❌ API Key错误:', {
        path: path,
        origin: origin || '无origin',
        host: host,
        providedKeyLength: apiKey.length,
        expectedKeyLength: configuredApiKey.length
      });
      return res.status(403).json({
        error: 'API Key 错误',
        message: '提供的 API Key 不正确',
      });
    }

    // 验证通过
    console.log('[API Key验证] ✅ API Key验证通过:', {
      path: path,
      origin: origin || '无origin'
    });
    next();
  } catch (error: any) {
    console.error('验证 API Key 失败:', error);
    // 验证失败时，为了安全起见，拒绝请求
    return res.status(500).json({ error: '验证 API Key 时发生错误' });
  }
}

