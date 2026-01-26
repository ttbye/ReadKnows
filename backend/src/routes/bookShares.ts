/**
 * @file bookShares.ts
 * @author ttbye
 * @date 2025-12-30
 * @description 书籍分享管理路由
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logActionFromRequest } from '../utils/logger';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 分享书籍给用户或群组
router.post('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId, toUserId, toGroupId, permission = 'read', expiresAt } = req.body;

    if (!bookId) {
      return res.status(400).json({ error: '书籍ID不能为空' });
    }

    if (!toUserId && !toGroupId) {
      return res.status(400).json({ error: '必须指定分享给用户或群组' });
    }

    if (toUserId && toGroupId) {
      return res.status(400).json({ error: '不能同时分享给用户和群组' });
    }

    // 检查书籍是否存在且用户有权限
    const book = db.prepare(`
      SELECT id, uploader_id, is_public FROM books WHERE id = ?
    `).get(bookId) as any;

    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 检查用户是否有权限分享（上传者或管理员）
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    if (book.uploader_id !== userId && user.role !== 'admin') {
      return res.status(403).json({ error: '您没有权限分享此书籍' });
    }

    // 如果分享给用户，检查用户是否存在
    if (toUserId) {
      const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(toUserId) as any;
      if (!targetUser) {
        return res.status(404).json({ error: '目标用户不存在' });
      }

      // 如果是普通用户（非管理员），检查是否是好友关系
      if (user.role !== 'admin') {
        const friendship = db.prepare(`
          SELECT id FROM friendships 
          WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
          AND status = 'accepted'
        `).get(userId, toUserId, toUserId, userId) as any;
        
        if (!friendship) {
          return res.status(403).json({ error: '您只能分享书籍给好友' });
        }
      }
    }

    // 如果分享给群组，检查用户是否是群组成员
    if (toGroupId) {
      const membership = db.prepare(`
        SELECT id FROM group_members 
        WHERE group_id = ? AND user_id = ?
      `).get(toGroupId, userId) as any;
      
      if (!membership) {
        // 管理员可以分享给任何群组，普通用户只能分享给已加入的群组
        if (user.role !== 'admin') {
          return res.status(403).json({ error: '您只能分享书籍给已加入的书友会' });
        }
      }
    }

    // 检查是否已经分享过
    const existingShare = db.prepare(`
      SELECT id FROM book_shares 
      WHERE book_id = ? AND from_user_id = ? 
        AND (to_user_id = ? OR to_group_id = ?)
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(bookId, userId, toUserId || null, toGroupId || null) as any;

    if (existingShare) {
      return res.status(400).json({ error: '已经分享过此书籍' });
    }

    // 创建分享记录
    const shareId = uuidv4();
    db.prepare(`
      INSERT INTO book_shares (id, book_id, from_user_id, to_user_id, to_group_id, permission, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      shareId,
      bookId,
      userId,
      toUserId || null,
      toGroupId || null,
      permission,
      expiresAt || null
    );

    // 如果分享到群组，自动将该书籍的所有笔记和高亮也共享到该群组
    if (toGroupId) {
      try {
        // 更新该书籍的所有笔记，将 share_to_group_id 设置为目标群组ID
        const notesResult = db.prepare(`
          UPDATE notes 
          SET share_to_group_id = ?
          WHERE book_id = ? AND user_id = ?
        `).run(toGroupId, bookId, userId);
        
        // 更新该书籍的所有高亮，将 share_to_group_id 设置为目标群组ID
        const highlightsResult = db.prepare(`
          UPDATE highlights 
          SET share_to_group_id = ?
          WHERE book_id = ? AND user_id = ? AND deleted_at IS NULL
        `).run(toGroupId, bookId, userId);
        
        console.log(`[书籍分享] 书籍 ${bookId} 分享到群组 ${toGroupId}: 已更新 ${notesResult.changes || 0} 条笔记和 ${highlightsResult.changes || 0} 条高亮`);
      } catch (shareError: any) {
        console.error('[书籍分享] 自动共享笔记和高亮失败:', shareError);
        // 不抛出错误，因为书籍分享已经成功
      }
    }

    // 获取分享信息
    const share = db.prepare(`
      SELECT 
        bs.*,
        b.title as book_title,
        u1.username as from_username,
        u2.username as to_username,
        g.name as to_group_name
      FROM book_shares bs
      INNER JOIN books b ON bs.book_id = b.id
      INNER JOIN users u1 ON bs.from_user_id = u1.id
      LEFT JOIN users u2 ON bs.to_user_id = u2.id
      LEFT JOIN user_groups g ON bs.to_group_id = g.id
      WHERE bs.id = ?
    `).get(shareId) as any;

    // 记录书籍分享日志
    logActionFromRequest(req, {
      action_type: 'book_share',
      action_category: 'book',
      description: `分享书籍《${share.book_title}》${toUserId ? `给用户 ${share.to_username}` : `到群组 ${share.to_group_name}`}`,
      metadata: {
        book_id: bookId,
        book_title: share.book_title,
        share_id: shareId,
        to_user_id: toUserId,
        to_group_id: toGroupId,
        permission: permission,
        expires_at: expiresAt,
      }
    });

    res.status(201).json({
      message: '书籍分享成功',
      share
    });
  } catch (error: any) {
    console.error('分享书籍失败:', error);
    res.status(500).json({ error: '分享书籍失败' });
  }
});

// 获取用户收到的书籍分享
router.get('/received', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // 获取直接分享给用户的书籍
    const directShares = db.prepare(`
      SELECT 
        bs.*,
        b.*,
        u.username as from_username,
        u.nickname as from_nickname
      FROM book_shares bs
      INNER JOIN books b ON bs.book_id = b.id
      INNER JOIN users u ON bs.from_user_id = u.id
      WHERE bs.to_user_id = ?
        AND (bs.expires_at IS NULL OR bs.expires_at > datetime('now'))
      ORDER BY bs.created_at DESC
    `).all(userId) as any[];

    // 获取通过群组分享的书籍
    const groupShares = db.prepare(`
      SELECT DISTINCT
        bs.*,
        b.*,
        u.username as from_username,
        u.nickname as from_nickname,
        g.name as group_name
      FROM book_shares bs
      INNER JOIN books b ON bs.book_id = b.id
      INNER JOIN users u ON bs.from_user_id = u.id
      INNER JOIN user_groups g ON bs.to_group_id = g.id
      INNER JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
        AND (bs.expires_at IS NULL OR bs.expires_at > datetime('now'))
      ORDER BY bs.created_at DESC
    `).all(userId) as any[];

    res.json({ 
      directShares,
      groupShares 
    });
  } catch (error: any) {
    console.error('获取分享书籍失败:', error);
    res.status(500).json({ error: '获取分享书籍失败' });
  }
});

// 获取用户分享出去的书籍
router.get('/sent', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const shares = db.prepare(`
      SELECT 
        bs.*,
        b.*,
        u.username as to_username,
        u.nickname as to_nickname,
        g.name as to_group_name
      FROM book_shares bs
      INNER JOIN books b ON bs.book_id = b.id
      LEFT JOIN users u ON bs.to_user_id = u.id
      LEFT JOIN user_groups g ON bs.to_group_id = g.id
      WHERE bs.from_user_id = ?
        AND (bs.expires_at IS NULL OR bs.expires_at > datetime('now'))
      ORDER BY bs.created_at DESC
    `).all(userId) as any[];

    res.json({ shares });
  } catch (error: any) {
    console.error('获取分享记录失败:', error);
    res.status(500).json({ error: '获取分享记录失败' });
  }
});

// 取消分享
router.delete('/:shareId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { shareId } = req.params;

    // 检查分享是否存在且用户有权限删除
    const share = db.prepare(`
      SELECT from_user_id FROM book_shares WHERE id = ?
    `).get(shareId) as any;

    if (!share) {
      return res.status(404).json({ error: '分享记录不存在' });
    }

    if (share.from_user_id !== userId) {
      return res.status(403).json({ error: '您没有权限删除此分享' });
    }

    // 删除分享
    db.prepare('DELETE FROM book_shares WHERE id = ?').run(shareId);

    res.json({ message: '分享已取消' });
  } catch (error: any) {
    console.error('取消分享失败:', error);
    res.status(500).json({ error: '取消分享失败' });
  }
});

export default router;
