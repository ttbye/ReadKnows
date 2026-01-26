/**
 * @file ipBlock.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

export interface IPBlockRequest extends Request {
  clientIp?: string;
}

/**
 * 获取客户端真实IP地址
 * 在 Docker 环境中，需要正确处理代理头
 */
export function getClientIp(req: Request): string {
  // 优先级：X-Forwarded-For > X-Real-IP > req.ip > req.socket.remoteAddress
  // X-Forwarded-For 可能包含多个 IP（代理链），取第一个（最原始的客户端 IP）
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const ips = forwarded.split(',').map(ip => ip.trim()).filter(ip => ip);
    if (ips.length > 0) {
      // 取第一个 IP（最原始的客户端 IP）
      const clientIp = ips[0];
      // 过滤掉 Docker 内部网络 IP（172.x.x.x, 10.x.x.x 等）
      // 如果第一个 IP 是 Docker 内部 IP，尝试取下一个
      if (clientIp.startsWith('172.') || 
          clientIp.startsWith('10.') || 
          clientIp.startsWith('192.168.') ||
          clientIp === '127.0.0.1' ||
          clientIp === '::1') {
        // 如果还有其他 IP，尝试使用下一个
        if (ips.length > 1) {
          return ips[1];
        }
      }
      return clientIp;
    }
  }
  
  // 尝试 X-Real-IP 头
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  
  // 使用 Express 的 req.ip（需要设置 trust proxy）
  if (req.ip && req.ip !== '::ffff:127.0.0.1' && req.ip !== '::1') {
    // 移除 IPv6 映射的 IPv4 前缀
    const ip = req.ip.replace(/^::ffff:/, '');
    return ip;
  }
  
  // 最后尝试 socket 地址
  const socketIp = req.socket.remoteAddress;
  if (socketIp && socketIp !== '::1' && socketIp !== '127.0.0.1') {
    return socketIp.replace(/^::ffff:/, '');
  }
  
  // 如果都获取不到，返回 unknown（不应该发生）
  console.warn('[IP获取] 无法获取客户端 IP，使用默认值:', {
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip'],
    'req.ip': req.ip,
    'socket.remoteAddress': req.socket.remoteAddress
  });
  return 'unknown';
}

/**
 * 检查IP是否被禁用
 */
export function checkIPBlocked(req: IPBlockRequest, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  req.clientIp = clientIp;

  try {
    // 检查IP是否在禁用列表中
    const blocked = db
      .prepare(`
        SELECT * FROM blocked_ips 
        WHERE ip_address = ? 
        AND (unblock_at IS NULL OR unblock_at > datetime('now'))
      `)
      .get(clientIp) as any;

    if (blocked) {
      return res.status(403).json({
        error: 'IP已被禁用',
        message: blocked.reason || '该IP地址已被管理员禁用',
        blockedAt: blocked.blocked_at,
      });
    }

    next();
  } catch (error: any) {
    console.error('检查IP禁用状态失败:', error);
    // 如果检查失败，允许继续（避免误拦截）
    next();
  }
}

/**
 * 记录访问尝试
 */
export function recordAccessAttempt(
  ip: string,
  attemptType: 'private_key' | 'login',
  success: boolean
): void {
  try {
    const id = require('uuid').v4();
    db.prepare(`
      INSERT INTO ip_access_attempts (id, ip_address, attempt_type, success)
      VALUES (?, ?, ?, ?)
    `).run(id, ip, attemptType, success ? 1 : 0);
  } catch (error: any) {
    console.error('记录访问尝试失败:', error);
  }
}

/**
 * 检查并处理IP访问尝试次数
 * 如果失败次数达到阈值，禁用IP
 */
export function checkAndBlockIP(ip: string, attemptType: 'private_key' | 'login'): boolean {
  try {
    let maxAttemptsSetting: { value?: string } | undefined = undefined;
    try {
      maxAttemptsSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'max_access_attempts'").get() as { value?: string } | undefined;
    } catch (dbError: any) {
      console.warn('[IPBlock] 查询 max_access_attempts 失败:', dbError.message);
      // 如果查询失败，使用默认值
      maxAttemptsSetting = undefined;
    }
    const maxAttempts = parseInt(
      maxAttemptsSetting?.value || '10'
    );

    // 获取最近1小时内的失败尝试次数
    const recentAttempts = db
      .prepare(`
        SELECT COUNT(*) as count 
        FROM ip_access_attempts 
        WHERE ip_address = ? 
        AND attempt_type = ? 
        AND success = 0 
        AND created_at > datetime('now', '-1 hour')
      `)
      .get(ip, attemptType) as any;

    if (recentAttempts.count >= maxAttempts) {
      // 禁用IP
      const blockedId = require('uuid').v4();
      db.prepare(`
        INSERT OR REPLACE INTO blocked_ips (id, ip_address, reason, attempts)
        VALUES (?, ?, ?, ?)
      `).run(
        blockedId,
        ip,
        `${attemptType}验证失败次数过多（${recentAttempts.count}次）`,
        recentAttempts.count
      );

      console.log(`IP ${ip} 因${attemptType}验证失败次数过多已被禁用`);
      return true;
    }

    return false;
  } catch (error: any) {
    console.error('检查IP访问尝试失败:', error);
    return false;
  }
}

/**
 * 验证私有访问密钥
 */
export function verifyPrivateAccessKey(req: IPBlockRequest, res: Response, next: NextFunction) {
  const clientIp = req.clientIp || getClientIp(req);
  const { privateKey } = req.body;

  try {
    // 检查是否启用私有访问密钥验证
    const enabled = db
      .prepare("SELECT value FROM system_settings WHERE key = 'private_access_enabled'")
      .get() as any;

    if (!enabled || enabled.value !== 'true') {
      // 如果未启用，直接通过
      return next();
    }

    // 获取配置的私有访问密钥
    const configKey = db
      .prepare("SELECT value FROM system_settings WHERE key = 'private_access_key'")
      .get() as any;

    if (!configKey || !configKey.value) {
      // 如果未配置密钥，直接通过
      return next();
    }

    // 验证密钥
    if (!privateKey || privateKey !== configKey.value) {
      // 记录失败尝试
      recordAccessAttempt(clientIp, 'private_key', false);
      
      // 检查是否需要禁用IP
      const isBlocked = checkAndBlockIP(clientIp, 'private_key');
      if (isBlocked) {
        return res.status(403).json({
          error: 'IP已被禁用',
          message: '私有访问密钥验证失败次数过多，该IP已被禁用',
        });
      }

      return res.status(401).json({
        error: '私有访问密钥错误',
        message: '请输入正确的私有访问密钥',
      });
    }

    // 验证成功，记录成功尝试
    recordAccessAttempt(clientIp, 'private_key', true);
    next();
  } catch (error: any) {
    console.error('验证私有访问密钥失败:', error);
    return res.status(500).json({ error: '验证失败' });
  }
}

