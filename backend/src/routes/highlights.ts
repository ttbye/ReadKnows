/**
 * @file highlights.ts
 * EPUB 高亮标注 API（基于 CFI range）
 */

import express from 'express';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

const getCurrentUTCTime = () => new Date().toISOString();

// 获取某本书的高亮（包含已删除项，前端可按 deleted_at 过滤）
router.get('/book/:bookId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.params;

    const highlights = db.prepare(`
      SELECT
        id,
        user_id,
        book_id,
        cfi_range,
        selected_text,
        color,
        created_at,
        updated_at,
        deleted_at
      FROM highlights
      WHERE user_id = ? AND book_id = ?
      ORDER BY updated_at DESC
    `).all(userId, bookId) as any[];

    res.json({ highlights });
  } catch (error: any) {
    console.error('获取高亮失败:', error);
    res.status(500).json({ error: '获取高亮失败' });
  }
});

// 创建/更新（幂等 upsert，客户端可传固定 id 便于离线同步）
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id, bookId, cfiRange, selectedText, color, updatedAt } = req.body || {};

    if (!id || !bookId || !cfiRange) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    // 验证书籍存在
    const book = db.prepare('SELECT id FROM books WHERE id = ?').get(String(bookId)) as any;
    if (!book) {
      return res.status(400).json({ error: '书籍不存在' });
    }

    const now = getCurrentUTCTime();
    const clientUpdatedAt = updatedAt ? String(updatedAt) : now;

    // 如果已存在，做“最后写入 wins”策略（基于 updated_at 字符串比较，ISO 8601 可直接比较）
    const existing = db.prepare(`
      SELECT id, updated_at FROM highlights WHERE id = ? AND user_id = ?
    `).get(String(id), userId) as any;

    if (existing) {
      if (String(existing.updated_at || '') > clientUpdatedAt) {
        // 服务端已有更新的版本，直接返回服务端版本
        const h = db.prepare(`SELECT * FROM highlights WHERE id = ? AND user_id = ?`).get(String(id), userId) as any;
        return res.json({ highlight: h, skipped: true });
      }

      db.prepare(`
        UPDATE highlights
        SET book_id = ?,
            cfi_range = ?,
            selected_text = ?,
            color = ?,
            updated_at = ?,
            deleted_at = NULL
        WHERE id = ? AND user_id = ?
      `).run(
        String(bookId),
        String(cfiRange),
        selectedText ? String(selectedText) : null,
        color ? String(color) : null,
        clientUpdatedAt,
        String(id),
        userId
      );
    } else {
      db.prepare(`
        INSERT INTO highlights (
          id, user_id, book_id, cfi_range, selected_text, color,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        String(id),
        userId,
        String(bookId),
        String(cfiRange),
        selectedText ? String(selectedText) : null,
        color ? String(color) : null,
        now,
        clientUpdatedAt
      );
    }

    const highlight = db.prepare(`
      SELECT
        id, user_id, book_id, cfi_range, selected_text, color, created_at, updated_at, deleted_at
      FROM highlights
      WHERE id = ? AND user_id = ?
    `).get(String(id), userId) as any;

    res.status(existing ? 200 : 201).json({ highlight });
  } catch (error: any) {
    console.error('保存高亮失败:', error);
    res.status(500).json({ error: '保存高亮失败' });
  }
});

// 删除（软删除，便于多端同步）
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const now = getCurrentUTCTime();

    const existing = db.prepare('SELECT id FROM highlights WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existing) {
      return res.status(404).json({ error: '高亮不存在或无权限' });
    }

    db.prepare(`
      UPDATE highlights
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(now, now, id, userId);

    res.json({ message: '已删除' });
  } catch (error: any) {
    console.error('删除高亮失败:', error);
    res.status(500).json({ error: '删除高亮失败' });
  }
});

export default router;


