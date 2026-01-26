/**
 * @file audiobookShares.ts
 * @author ttbye
 * @date 2025-12-30
 * @description 有声小说分享管理路由
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 分享有声小说给用户或群组
router.post('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { audiobookId, toUserId, toGroupId, permission = 'read', expiresAt } = req.body;

    if (!audiobookId) {
      return res.status(400).json({ error: '有声小说ID不能为空' });
    }

    if (!toUserId && !toGroupId) {
      return res.status(400).json({ error: '必须指定分享给用户或群组' });
    }

    if (toUserId && toGroupId) {
      return res.status(400).json({ error: '不能同时分享给用户和群组' });
    }

    // 检查有声小说是否存在且用户有权限
    const audiobook = db.prepare(`
      SELECT id, uploader_id, is_public FROM audiobooks WHERE id = ?
    `).get(audiobookId) as any;

    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    // 检查用户是否有权限分享（上传者或管理员）
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    if (audiobook.uploader_id !== userId && user.role !== 'admin') {
      return res.status(403).json({ error: '您没有权限分享此有声小说' });
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
          return res.status(403).json({ error: '您只能分享有声小说给好友' });
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
          return res.status(403).json({ error: '您只能分享有声小说给已加入的书友会' });
        }
      }
    }

    // 检查是否已经分享过
    const existingShare = db.prepare(`
      SELECT id FROM audiobook_shares 
      WHERE audiobook_id = ? AND from_user_id = ? 
        AND (to_user_id = ? OR to_group_id = ?)
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(audiobookId, userId, toUserId || null, toGroupId || null) as any;

    if (existingShare) {
      return res.status(400).json({ error: '已经分享过此有声小说' });
    }

    // 创建分享记录
    const shareId = uuidv4();
    db.prepare(`
      INSERT INTO audiobook_shares (id, audiobook_id, from_user_id, to_user_id, to_group_id, permission, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      shareId,
      audiobookId,
      userId,
      toUserId || null,
      toGroupId || null,
      permission,
      expiresAt || null
    );

    // 获取分享信息
    const share = db.prepare(`
      SELECT 
        abs.*,
        a.title as audiobook_title,
        a.author as audiobook_author,
        u1.username as from_username,
        u2.username as to_username,
        g.name as to_group_name
      FROM audiobook_shares abs
      INNER JOIN audiobooks a ON abs.audiobook_id = a.id
      INNER JOIN users u1 ON abs.from_user_id = u1.id
      LEFT JOIN users u2 ON abs.to_user_id = u2.id
      LEFT JOIN user_groups g ON abs.to_group_id = g.id
      WHERE abs.id = ?
    `).get(shareId) as any;

    res.status(201).json({ 
      message: '有声小说分享成功',
      share 
    });
  } catch (error: any) {
    console.error('分享有声小说失败:', error);
    res.status(500).json({ error: '分享有声小说失败' });
  }
});

// 获取用户收到的有声小说分享
router.get('/received', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // 获取直接分享给用户的有声小说
    const directShares = db.prepare(`
      SELECT 
        abs.*,
        a.*,
        u.username as from_username,
        u.nickname as from_nickname
      FROM audiobook_shares abs
      INNER JOIN audiobooks a ON abs.audiobook_id = a.id
      INNER JOIN users u ON abs.from_user_id = u.id
      WHERE abs.to_user_id = ?
        AND (abs.expires_at IS NULL OR abs.expires_at > datetime('now'))
      ORDER BY abs.created_at DESC
    `).all(userId) as any[];

    // 获取通过群组分享的有声小说
    const groupShares = db.prepare(`
      SELECT DISTINCT
        abs.*,
        a.*,
        u.username as from_username,
        u.nickname as from_nickname,
        g.name as group_name
      FROM audiobook_shares abs
      INNER JOIN audiobooks a ON abs.audiobook_id = a.id
      INNER JOIN users u ON abs.from_user_id = u.id
      INNER JOIN user_groups g ON abs.to_group_id = g.id
      INNER JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
        AND (abs.expires_at IS NULL OR abs.expires_at > datetime('now'))
      ORDER BY abs.created_at DESC
    `).all(userId) as any[];

    res.json({ 
      directShares,
      groupShares 
    });
  } catch (error: any) {
    console.error('获取分享有声小说失败:', error);
    res.status(500).json({ error: '获取分享有声小说失败' });
  }
});

// 获取用户分享出去的有声小说
router.get('/sent', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const shares = db.prepare(`
      SELECT 
        abs.*,
        a.*,
        u.username as to_username,
        u.nickname as to_nickname,
        g.name as to_group_name
      FROM audiobook_shares abs
      INNER JOIN audiobooks a ON abs.audiobook_id = a.id
      LEFT JOIN users u ON abs.to_user_id = u.id
      LEFT JOIN user_groups g ON abs.to_group_id = g.id
      WHERE abs.from_user_id = ?
        AND (abs.expires_at IS NULL OR abs.expires_at > datetime('now'))
      ORDER BY abs.created_at DESC
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
      SELECT from_user_id FROM audiobook_shares WHERE id = ?
    `).get(shareId) as any;

    if (!share) {
      return res.status(404).json({ error: '分享记录不存在' });
    }

    if (share.from_user_id !== userId) {
      return res.status(403).json({ error: '您没有权限删除此分享' });
    }

    // 删除分享
    db.prepare('DELETE FROM audiobook_shares WHERE id = ?').run(shareId);

    res.json({ message: '分享已取消' });
  } catch (error: any) {
    console.error('取消分享失败:', error);
    res.status(500).json({ error: '取消分享失败' });
  }
});

export default router;
