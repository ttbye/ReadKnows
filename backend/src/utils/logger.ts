/**
 * @file logger.ts
 * @author ttbye
 * @date 2026-01-06
 * @description 系统日志记录工具
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';

export type ActionCategory =
  | 'auth'           // 认证相关（登录、登出、注册）
  | 'book'           // 书籍相关（上传、删除、编辑、收藏）
  | 'reading'        // 阅读相关（开始阅读、进度更新、完成阅读）
  | 'audiobook'      // 有声小说相关（播放、进度、完成）
  | 'user'           // 用户相关（创建、编辑、删除用户）
  | 'system'         // 系统相关（设置修改、系统操作）
  | 'other';         // 其他操作

export type ActionType =
  // 认证相关
  | 'login' | 'logout' | 'register' | 'login_failed'
  // 书籍相关
  | 'book_upload' | 'book_delete' | 'book_edit' | 'book_favorite' | 'book_unfavorite' | 'book_download' | 'book_share'
  // 阅读相关
  | 'reading_start' | 'reading_progress' | 'reading_complete'
  // 有声小说相关
  | 'audiobook_play' | 'audiobook_progress' | 'audiobook_complete'
  // 用户相关
  | 'user_create' | 'user_edit' | 'user_delete' | 'user_password_reset'
  // 系统相关
  | 'system_settings_update' | 'log_export' | 'log_clear'
  // 其他
  | 'other';

export interface LogEntry {
  user_id?: string;
  username?: string;
  action_type: ActionType;
  action_category: ActionCategory;
  description?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
}

/**
 * 获取当前 UTC 时间的 ISO 8601 格式字符串
 */
const getCurrentUTCTime = () => new Date().toISOString();

/**
 * 记录系统日志
 */
export function logAction(entry: LogEntry): void {
  try {
    const id = uuidv4();
    const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;
    const nowUTC = getCurrentUTCTime();
    
    db.prepare(`
      INSERT INTO system_logs (
        id, user_id, username, action_type, action_category, 
        description, ip_address, user_agent, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.user_id || null,
      entry.username || null,
      entry.action_type,
      entry.action_category,
      entry.description || null,
      entry.ip_address || null,
      entry.user_agent || null,
      metadataJson,
      nowUTC
    );
  } catch (error: any) {
    // 日志记录失败不应该影响主流程，只记录到控制台
    console.error('[Logger] 记录日志失败:', error.message);
  }
}

/**
 * 从请求对象获取客户端信息并记录日志
 */
export function logActionFromRequest(
  req: any,
  entry: Omit<LogEntry, 'ip_address' | 'user_agent'>
): void {
  const ip_address = req.ip ||
                     req.headers['x-forwarded-for']?.split(',')[0] ||
                     req.connection?.remoteAddress ||
                     'unknown';
  const user_agent = req.headers['user-agent'] || 'unknown';

  // 优先使用传入的用户信息，如果没有则自动获取
  let user_id = entry.user_id;
  let username = entry.username;

  // 如果没有提供用户信息，尝试从请求中自动获取
  if (!user_id && req.userId) {
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId) as { username: string } | undefined;
      if (user) {
        user_id = req.userId;
        username = user.username;
      } else {
        console.warn('[Logger] 未找到用户:', req.userId);
      }
    } catch (error) {
      // 获取用户信息失败，静默处理
      console.warn('[Logger] 获取用户信息失败:', error, 'userId:', req.userId);
    }
  }

  // 调试日志（生产环境可移除）
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Logger] 记录日志:', {
      action_type: entry.action_type,
      action_category: entry.action_category,
      user_id,
      username,
      has_userId: !!req.userId,
      description: entry.description?.substring(0, 50)
    });
  }

  // 创建日志条目，移除已经处理的字段
  const { user_id: _, username: __, ...logEntry } = entry;

  logAction({
    ...logEntry,
    user_id,
    username,
    ip_address,
    user_agent,
  });
}

/**
 * 获取客户端IP地址（用于在路由中调用）
 */
export function getClientIpFromRequest(req: any): string {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection?.remoteAddress || 
         'unknown';
}
