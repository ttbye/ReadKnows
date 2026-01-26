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
// 包括自己的、公开的、群组共享的高亮
router.get('/book/:bookId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.params;

    // 获取用户所在的所有群组ID
    const userGroups = db.prepare(`
      SELECT group_id FROM group_members WHERE user_id = ?
    `).all(userId) as any[];
    const groupIds = userGroups.map(g => g.group_id);
    
    // 同时检查书籍是否通过群组可见性共享（book_group_visibility）
    // 如果书籍共享到群组，该群组的所有成员都应该能看到高亮
    let bookGroupIds: string[] = [];
    try {
      const bookGroups = db.prepare(`
        SELECT DISTINCT bgv.group_id 
        FROM book_group_visibility bgv
        INNER JOIN group_members gm ON bgv.group_id = gm.group_id
        WHERE bgv.book_id = ? AND gm.user_id = ?
      `).all(bookId, userId) as any[];
      bookGroupIds = bookGroups.map(g => g.group_id);
    } catch (e: any) {
      // 如果表不存在，忽略
      if (!e.message?.includes('no such table')) {
        console.error('查询书籍群组可见性失败:', e);
      }
    }
    
    // 合并群组ID列表（去重）
    const allGroupIds = [...new Set([...groupIds, ...bookGroupIds])];

    // 构建查询：获取自己的高亮、公开的高亮、以及群组共享的高亮
    let query = `
      SELECT
        h.id,
        h.user_id,
        h.book_id,
        h.cfi_range,
        h.selected_text,
        h.color,
        h.is_public,
        h.share_to_group_id,
        h.created_at,
        h.updated_at,
        h.deleted_at,
        u.username,
        u.nickname
      FROM highlights h
      INNER JOIN users u ON h.user_id = u.id
      WHERE h.book_id = ?
        AND (
          h.user_id = ?
          OR (h.is_public = 1 AND h.deleted_at IS NULL)
          ${allGroupIds.length > 0 ? `OR (h.share_to_group_id IS NOT NULL AND h.share_to_group_id != '' AND h.share_to_group_id IN (${allGroupIds.map(() => '?').join(',')}) AND h.deleted_at IS NULL)` : ''}
        )
      ORDER BY h.updated_at DESC
    `;

    const params: any[] = [bookId, userId];
    if (allGroupIds.length > 0) {
      params.push(...allGroupIds);
    }

    const highlights = db.prepare(query).all(...params) as any[];
    
    // 调试日志
    if (process.env.NODE_ENV === 'development') {
      console.log(`获取书籍 ${bookId} 的高亮:`, {
        userId,
        userGroups: groupIds,
        bookGroups: bookGroupIds,
        allGroups: allGroupIds,
        highlightsCount: highlights.length,
        highlightsWithGroupShare: highlights.filter(h => h.share_to_group_id).length,
        highlightsDetails: highlights.map(h => ({
          id: h.id,
          userId: h.user_id,
          shareToGroupId: h.share_to_group_id,
          isPublic: h.is_public
        }))
      });
    }

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

      // 获取可见性设置（从请求体，如果未提供则保持原值）
      const { isPublic, shareToGroupId } = req.body;
      const existingHighlight = db.prepare(`
        SELECT is_public, share_to_group_id FROM highlights WHERE id = ? AND user_id = ?
      `).get(String(id), userId) as any;

      const finalIsPublic = isPublic !== undefined ? (isPublic ? 1 : 0) : (existingHighlight?.is_public || 0);
      const finalShareToGroupId = shareToGroupId !== undefined ? shareToGroupId : (existingHighlight?.share_to_group_id || null);

      db.prepare(`
        UPDATE highlights
        SET book_id = ?,
            cfi_range = ?,
            selected_text = ?,
            color = ?,
            is_public = ?,
            share_to_group_id = ?,
            updated_at = ?,
            deleted_at = NULL
        WHERE id = ? AND user_id = ?
      `).run(
        String(bookId),
        String(cfiRange),
        selectedText ? String(selectedText) : null,
        color ? String(color) : null,
        finalIsPublic,
        finalShareToGroupId,
        clientUpdatedAt,
        String(id),
        userId
      );
    } else {
      // 获取可见性设置（从请求体，默认为私有）
      const { isPublic, shareToGroupId } = req.body;
      const finalIsPublic = isPublic ? 1 : 0;
      const finalShareToGroupId = shareToGroupId || null;

      db.prepare(`
        INSERT INTO highlights (
          id, user_id, book_id, cfi_range, selected_text, color,
          is_public, share_to_group_id,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        String(id),
        userId,
        String(bookId),
        String(cfiRange),
        selectedText ? String(selectedText) : null,
        color ? String(color) : null,
        finalIsPublic,
        finalShareToGroupId,
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

// 批量更新书籍高亮的群组共享设置
router.post('/book/:bookId/share-to-group', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.params;
    const { groupId } = req.body;

    // 检查书籍是否存在且属于当前用户
    const book = db.prepare('SELECT uploader_id FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 检查用户是否有权限（上传者或管理员）
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    if (book.uploader_id !== userId && user.role !== 'admin') {
      return res.status(403).json({ error: '您没有权限操作此书籍的高亮' });
    }

    // 如果提供了groupId，验证用户是否是群组成员
    if (groupId) {
      const membership = db.prepare(`
        SELECT id FROM group_members 
        WHERE group_id = ? AND user_id = ?
      `).get(groupId, userId) as any;
      
      if (!membership && user.role !== 'admin') {
        return res.status(403).json({ error: '您不是该群组的成员' });
      }
    }

    // 更新该书籍的所有高亮的群组共享设置（不包括已删除的）
    const result = db.prepare(`
      UPDATE highlights 
      SET share_to_group_id = ?
      WHERE book_id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(groupId || null, bookId, userId);

    res.json({ 
      message: '高亮群组共享设置已更新',
      updatedCount: result.changes || 0
    });
  } catch (error: any) {
    console.error('批量更新高亮群组共享失败:', error);
    res.status(500).json({ error: '批量更新高亮群组共享失败' });
  }
});

export default router;


