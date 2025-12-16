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
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const secret = process.env.JWT_SECRET || 'your-secret-key';
  
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

