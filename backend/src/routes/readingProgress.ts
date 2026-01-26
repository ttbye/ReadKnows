/**
 * @file readingProgress.ts
 * @author ttbye
 * @date 2025-01-01
 * @description 阅读进度管理路由 - 保存、获取和同步电子书阅读进度
 */

import express from 'express';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

/**
 * 获取指定书籍的阅读进度
 */
router.get('/:bookId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.params;

    const progress = db.prepare(`
      SELECT * FROM reading_progress
      WHERE user_id = ? AND book_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(userId, bookId) as any;

    res.json(progress || null);
  } catch (error: any) {
    console.error('获取阅读进度失败:', error);
    res.status(500).json({ error: '获取阅读进度失败', details: error.message });
  }
});

/**
 * 保存或更新阅读进度
 */
router.post('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      book_id,
      progress,
      current_page,
      total_pages,
      chapter_index,
      chapter_title,
      reading_time
    } = req.body;

    if (!book_id) {
      return res.status(400).json({ error: '请提供书籍ID' });
    }

    const now = new Date().toISOString();

    // 检查是否已存在进度记录
    const existing = db.prepare(`
      SELECT id FROM reading_progress
      WHERE user_id = ? AND book_id = ?
    `).get(userId, book_id) as any;

    if (existing) {
      // 更新现有记录
      db.prepare(`
        UPDATE reading_progress
        SET progress = ?, current_page = ?, total_pages = ?,
            chapter_index = ?, chapter_title = ?, reading_time = ?,
            last_read_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        progress || 0,
        current_page || null,
        total_pages || null,
        chapter_index || null,
        chapter_title || null,
        reading_time || 0,
        now,
        now,
        existing.id
      );
    } else {
      // 创建新记录
      db.prepare(`
        INSERT INTO reading_progress (
          user_id, book_id, progress, current_page, total_pages,
          chapter_index, chapter_title, reading_time, last_read_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        book_id,
        progress || 0,
        current_page || null,
        total_pages || null,
        chapter_index || null,
        chapter_title || null,
        reading_time || 0,
        now,
        now,
        now
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('保存阅读进度失败:', error);
    res.status(500).json({ error: '保存阅读进度失败', details: error.message });
  }
});

/**
 * 获取用户的阅读统计
 */
router.get('/stats/summary', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT book_id) as total_books,
        SUM(reading_time) as total_reading_time,
        AVG(progress) as average_progress
      FROM reading_progress
      WHERE user_id = ?
    `).get(userId) as any;

    res.json({
      total_books: stats.total_books || 0,
      total_reading_time: stats.total_reading_time || 0,
      average_progress: stats.average_progress || 0,
    });
  } catch (error: any) {
    console.error('获取阅读统计失败:', error);
    res.status(500).json({ error: '获取阅读统计失败', details: error.message });
  }
});

/**
 * 获取用户的阅读历史
 */
router.get('/history/recent', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 20;

    // 仅展示公开书籍或本人上传的私有书籍，不展示他人私有（避免隐私泄露）
    const history = db.prepare(`
      SELECT rp.*, b.title as book_title, b.author, b.cover_path
      FROM reading_progress rp
      LEFT JOIN books b ON rp.book_id = b.id
      WHERE rp.user_id = ? AND (b.id IS NULL OR b.is_public = 1 OR b.uploader_id = ?)
      ORDER BY rp.last_read_at DESC
      LIMIT ?
    `).all(userId, userId, limit);

    res.json(history);
  } catch (error: any) {
    console.error('获取阅读历史失败:', error);
    res.status(500).json({ error: '获取阅读历史失败', details: error.message });
  }
});

/**
 * 获取好友的阅读进度（用于书友圈分享）
 */
router.get('/friends/progress', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 50;

    // 获取好友最近的阅读进度
    const friendsProgress = db.prepare(`
      SELECT
        rp.*,
        b.title as book_title,
        b.author,
        b.cover_path,
        u.username as friend_username,
        u.nickname as friend_nickname,
        u.avatar_path
      FROM reading_progress rp
      LEFT JOIN books b ON rp.book_id = b.id
      LEFT JOIN users u ON rp.user_id = u.id
      WHERE rp.user_id IN (
        SELECT
          CASE
            WHEN f.user_id = ? THEN f.friend_id
            ELSE f.user_id
          END
        FROM friends f
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
      )
      AND rp.last_read_at >= datetime('now', '-30 days')
      ORDER BY rp.last_read_at DESC
      LIMIT ?
    `).all(userId, userId, userId, limit);

    res.json(friendsProgress);
  } catch (error: any) {
    console.error('获取好友阅读进度失败:', error);
    res.status(500).json({ error: '获取好友阅读进度失败', details: error.message });
  }
});

export default router;