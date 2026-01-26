/**
 * @file logs.ts
 * @author ttbye
 * @date 2026-01-06
 * @description 系统日志管理路由（仅管理员）
 */

import express from 'express';
import { db } from '../db';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';
import { logActionFromRequest } from '../utils/logger';

const router = express.Router();

// 获取当前 UTC 时间的 ISO 8601 格式字符串
const getCurrentUTCTime = () => new Date().toISOString();

// 创建用户操作日志记录路由（普通用户可调用）
const userLogsRouter = express.Router();
userLogsRouter.use(authenticateToken); // 只需要认证，不需要管理员权限

// 用户操作日志记录（前端调用）
userLogsRouter.post('/', (req: AuthRequest, res) => {
  try {
    const { action_type, action_category, description, metadata } = req.body;

    // 验证必填字段
    if (!action_type || !action_category) {
      return res.status(400).json({ error: 'action_type 和 action_category 为必填字段' });
    }

    // 获取客户端信息
    const ip_address = req.ip ||
                       (typeof req.headers['x-forwarded-for'] === 'string'
                         ? req.headers['x-forwarded-for'].split(',')[0]
                         : Array.isArray(req.headers['x-forwarded-for'])
                           ? req.headers['x-forwarded-for'][0]
                           : undefined) ||
                       req.connection?.remoteAddress ||
                       'unknown';
    const user_agent = req.headers['user-agent'] || 'unknown';

    // 记录日志
    logActionFromRequest(req, {
      action_type,
      action_category,
      description,
      metadata,
    });

    res.json({ success: true, message: '日志记录成功' });
  } catch (error: any) {
    console.error('[日志] 记录用户操作日志失败:', error);
    res.status(500).json({ error: '记录日志失败', message: error.message });
  }
});

// 挂载用户日志路由
router.use('/', userLogsRouter);

// 所有其他日志路由都需要管理员权限
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * 获取日志列表（支持分页、筛选、搜索）
 * GET /api/logs
 * Query参数:
 *   - page: 页码（默认1）
 *   - limit: 每页数量（默认50，最大200）
 *   - action_type: 操作类型筛选
 *   - action_category: 操作分类筛选
 *   - username: 用户名筛选
 *   - start_date: 开始日期（YYYY-MM-DD）
 *   - end_date: 结束日期（YYYY-MM-DD）
 *   - search: 搜索关键词（搜索描述和用户名）
 */
router.get('/', (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    
    const actionType = req.query.action_type as string;
    const actionCategory = req.query.action_category as string;
    const username = req.query.username as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const search = req.query.search as string;

    // 构建WHERE条件
    const conditions: string[] = [];
    const params: any[] = [];

    if (actionType) {
      conditions.push('action_type = ?');
      params.push(actionType);
    }

    if (actionCategory) {
      conditions.push('action_category = ?');
      params.push(actionCategory);
    }

    if (username) {
      conditions.push('username LIKE ?');
      params.push(`%${username}%`);
    }

    if (startDate) {
      conditions.push("DATE(created_at) >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("DATE(created_at) <= ?");
      params.push(endDate);
    }

    if (search) {
      conditions.push('(description LIKE ? OR username LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM system_logs ${whereClause}
    `).get(...params) as any;
    const total = countResult.total || 0;

    // 获取日志列表
    const logs = db.prepare(`
      SELECT 
        id, user_id, username, action_type, action_category,
        description, ip_address, user_agent, metadata, created_at
      FROM system_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    // 解析metadata JSON
    const logsWithMetadata = logs.map(log => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }));

    res.json({
      logs: logsWithMetadata,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[日志] 获取日志列表失败:', error);
    res.status(500).json({ error: '获取日志列表失败', message: error.message });
  }
});

/**
 * 获取日志统计信息
 * GET /api/logs/stats
 */
router.get('/stats', (req: AuthRequest, res) => {
  try {
    // 总日志数
    const totalLogs = db.prepare('SELECT COUNT(*) as count FROM system_logs').get() as any;
    
    // 按分类统计
    const categoryStats = db.prepare(`
      SELECT action_category, COUNT(*) as count
      FROM system_logs
      GROUP BY action_category
      ORDER BY count DESC
    `).all() as any[];

    // 按操作类型统计（前10）
    const typeStats = db.prepare(`
      SELECT action_type, COUNT(*) as count
      FROM system_logs
      GROUP BY action_type
      ORDER BY count DESC
      LIMIT 10
    `).all() as any[];

    // 最近7天的日志数量（使用UTC时间）
    const sevenDaysAgoUTC = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent7Days = db.prepare(`
      SELECT COUNT(*) as count
      FROM system_logs
      WHERE created_at >= ?
    `).get(sevenDaysAgoUTC) as any;

    // 最近30天的日志数量（使用UTC时间）
    const thirtyDaysAgoUTC = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent30Days = db.prepare(`
      SELECT COUNT(*) as count
      FROM system_logs
      WHERE created_at >= ?
    `).get(thirtyDaysAgoUTC) as any;

    res.json({
      total: totalLogs.count || 0,
      recent7Days: recent7Days.count || 0,
      recent30Days: recent30Days.count || 0,
      categoryStats,
      typeStats,
    });
  } catch (error: any) {
    console.error('[日志] 获取统计信息失败:', error);
    res.status(500).json({ error: '获取统计信息失败', message: error.message });
  }
});

/**
 * 导出日志（CSV格式）
 * GET /api/logs/export
 * Query参数同列表接口
 */
router.get('/export', (req: AuthRequest, res) => {
  try {
    const actionType = req.query.action_type as string;
    const actionCategory = req.query.action_category as string;
    const username = req.query.username as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const search = req.query.search as string;

    // 构建WHERE条件（与列表接口相同）
    const conditions: string[] = [];
    const params: any[] = [];

    if (actionType) {
      conditions.push('action_type = ?');
      params.push(actionType);
    }

    if (actionCategory) {
      conditions.push('action_category = ?');
      params.push(actionCategory);
    }

    if (username) {
      conditions.push('username LIKE ?');
      params.push(`%${username}%`);
    }

    if (startDate) {
      conditions.push("DATE(created_at) >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("DATE(created_at) <= ?");
      params.push(endDate);
    }

    if (search) {
      conditions.push('(description LIKE ? OR username LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取所有符合条件的日志
    const logs = db.prepare(`
      SELECT 
        id, user_id, username, action_type, action_category,
        description, ip_address, user_agent, metadata, created_at
      FROM system_logs
      ${whereClause}
      ORDER BY created_at DESC
    `).all(...params) as any[];

    // 生成CSV
    const csvHeader = 'ID,用户ID,用户名,操作类型,操作分类,描述,IP地址,User Agent,元数据,创建时间\n';
    const csvRows = logs.map(log => {
      const metadata = log.metadata ? JSON.stringify(log.metadata).replace(/"/g, '""') : '';
      return [
        log.id,
        log.user_id || '',
        log.username || '',
        log.action_type,
        log.action_category,
        (log.description || '').replace(/"/g, '""'),
        log.ip_address || '',
        (log.user_agent || '').replace(/"/g, '""'),
        metadata,
        log.created_at,
      ].map(field => `"${field}"`).join(',');
    }).join('\n');

    const csv = csvHeader + csvRows;

    // 获取当前登录用户名用于日志记录
    let currentUsername: string | undefined;
    if (req.userId) {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId) as any;
      currentUsername = user?.username;
    }

    // 记录导出操作
    logActionFromRequest(req, {
      action_type: 'log_export',
      action_category: 'system',
      description: `导出日志（${logs.length}条）`,
      metadata: {
        filters: {
          action_type: actionType,
          action_category: actionCategory,
          username,
          start_date: startDate,
          end_date: endDate,
          search,
        },
        count: logs.length,
      },
    });

    // 设置响应头
    const filename = `logs_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));

    // 添加BOM以支持Excel正确显示中文
    res.write('\ufeff');
    res.end(csv, 'utf8');
  } catch (error: any) {
    console.error('[日志] 导出日志失败:', error);
    res.status(500).json({ error: '导出日志失败', message: error.message });
  }
});


/**
 * 清空日志
 * DELETE /api/logs
 * Query参数:
 *   - before_date: 清空此日期之前的日志（可选，格式：YYYY-MM-DD）
 *   如果不提供，则清空所有日志
 */
router.delete('/', (req: AuthRequest, res) => {
  try {
    const beforeDate = req.query.before_date as string;

    let deletedCount: number;
    if (beforeDate) {
      // 删除指定日期之前的日志
      const result = db.prepare(`
        DELETE FROM system_logs
        WHERE DATE(created_at) < ?
      `).run(beforeDate);
      deletedCount = result.changes || 0;
    } else {
      // 清空所有日志
      const result = db.prepare('DELETE FROM system_logs').run();
      deletedCount = result.changes || 0;
    }

    // 获取当前登录用户名用于日志记录
    let currentUsername: string | undefined;
    if (req.userId) {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId) as any;
      currentUsername = user?.username;
    }

    // 记录清空操作（在清空前记录，避免被删除）
    logActionFromRequest(req, {
      action_type: 'log_clear',
      action_category: 'system',
      description: beforeDate
        ? `清空${beforeDate}之前的日志（${deletedCount}条）`
        : `清空所有日志（${deletedCount}条）`,
      metadata: {
        before_date: beforeDate || null,
        deleted_count: deletedCount,
      },
    });

    res.json({
      message: '日志清空成功',
      deletedCount,
    });
  } catch (error: any) {
    console.error('[日志] 清空日志失败:', error);
    res.status(500).json({ error: '清空日志失败', message: error.message });
  }
});

export default router;
