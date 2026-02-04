/**
 * @file friends.ts
 * @author ttbye
 * @date 2025-01-01
 * @description 好友系统路由
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest, requireCanUseFriends } from '../middleware/auth';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);
// 所有路由都需要书友权限
router.use(requireCanUseFriends);

// 搜索用户（用于添加好友）
router.get('/search', (req: AuthRequest, res) => {
  try {
    const { keyword } = req.query;
    
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return res.status(400).json({ error: '请提供搜索关键词' });
    }

    const searchTerm = `%${keyword.trim()}%`;
    const users = db.prepare(`
      SELECT id, username, email, nickname
      FROM users
      WHERE username LIKE ? OR email LIKE ? OR nickname LIKE ?
      LIMIT 20
    `).all(searchTerm, searchTerm, searchTerm) as any[];

    res.json({ users });
  } catch (error: any) {
    console.error('搜索用户失败:', error);
    res.status(500).json({ error: '搜索用户失败' });
  }
});

// 发送好友请求
router.post('/requests', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId, message } = req.body;

    if (!friendId) {
      return res.status(400).json({ error: '请提供好友ID' });
    }

    // 检查目标用户是否存在
    const friend = db.prepare('SELECT id, username FROM users WHERE id = ?').get(friendId) as any;
    if (!friend) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 不能添加自己为好友
    if (friendId === userId) {
      return res.status(400).json({ error: '不能添加自己为好友' });
    }

    // 检查是否已经是好友或已有请求
    const existingFriendship = db.prepare(`
      SELECT id, status FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(userId, friendId, friendId, userId) as any;

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        return res.status(400).json({ error: '你们已经是好友了' });
      } else if (existingFriendship.status === 'pending') {
        // 检查是谁发送的请求
        const request = db.prepare(`
          SELECT user_id FROM friendships WHERE id = ?
        `).get(existingFriendship.id) as any;
        
        if (request.user_id === userId) {
          return res.status(400).json({ error: '您已发送过好友请求' });
        } else {
          return res.status(400).json({ error: '对方已向您发送了好友请求，请先处理' });
        }
      }
    }

    // 创建好友请求
    const friendshipId = uuidv4();
    db.prepare(`
      INSERT INTO friendships (id, user_id, friend_id, status, message)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(friendshipId, userId, friendId, message || null);

    // 获取发送者信息
    const sender = db.prepare('SELECT username, nickname FROM users WHERE id = ?').get(userId) as any;
    const senderName = sender?.nickname || sender?.username || '用户';

    // 创建系统消息通知对方
    try {
      const messageId = uuidv4();
      const messageContent = `${senderName} 向您发送了好友请求`;
      db.prepare(`
        INSERT INTO messages (id, from_user_id, to_user_id, content)
        VALUES (?, ?, ?, ?)
      `).run(messageId, userId, friendId, messageContent);
    } catch (msgError: any) {
      // 如果消息创建失败，记录错误但不影响好友请求的创建
      console.error('创建好友请求通知消息失败:', msgError);
    }

    // 获取好友请求信息
    const friendship = db.prepare(`
      SELECT 
        f.*,
        u.username as friend_username,
        u.nickname as friend_nickname,
        u.email as friend_email
      FROM friendships f
      INNER JOIN users u ON f.friend_id = u.id
      WHERE f.id = ?
    `).get(friendshipId) as any;

    res.status(201).json({ 
      message: '好友请求已发送',
      data: friendship 
    });
  } catch (error: any) {
    console.error('发送好友请求失败:', error);
    res.status(500).json({ error: '发送好友请求失败' });
  }
});

// 获取好友请求列表（收到的请求）
router.get('/requests/received', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const requests = db.prepare(`
      SELECT 
        f.*,
        u.username as user_username,
        u.nickname as user_nickname,
        u.email as user_email
      FROM friendships f
      INNER JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId) as any[];
    
    // 确保message字段存在
    requests.forEach((req: any) => {
      if (!req.message) req.message = null;
    });

    res.json({ requests });
  } catch (error: any) {
    console.error('获取好友请求列表失败:', error);
    res.status(500).json({ error: '获取好友请求列表失败' });
  }
});

// 获取发送的好友请求列表
router.get('/requests/sent', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const requests = db.prepare(`
      SELECT 
        f.*,
        u.username as friend_username,
        u.nickname as friend_nickname,
        u.email as friend_email
      FROM friendships f
      INNER JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(userId) as any[];
    
    // 确保message字段存在
    requests.forEach((req: any) => {
      if (!req.message) req.message = null;
    });

    res.json({ requests });
  } catch (error: any) {
    console.error('获取发送的好友请求列表失败:', error);
    res.status(500).json({ error: '获取发送的好友请求列表失败' });
  }
});

// 接受好友请求
router.post('/requests/:requestId/accept', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { requestId } = req.params;

    // 获取好友请求信息
    const request = db.prepare(`
      SELECT * FROM friendships WHERE id = ?
    `).get(requestId) as any;

    if (!request) {
      return res.status(404).json({ error: '好友请求不存在' });
    }

    // 检查是否是发给当前用户的请求
    if (request.friend_id !== userId) {
      return res.status(403).json({ error: '您无权处理此请求' });
    }

    // 检查请求状态
    if (request.status !== 'pending') {
      return res.status(400).json({ error: '该请求已处理' });
    }

    // 更新请求状态为已接受
    db.prepare(`
      UPDATE friendships 
      SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(requestId);

    // 获取接受者信息
    const accepter = db.prepare('SELECT username, nickname FROM users WHERE id = ?').get(userId) as any;
    const accepterName = accepter?.nickname || accepter?.username || '用户';

    // 发送系统消息通知发送者
    try {
      const messageId = uuidv4();
      const messageContent = `${accepterName} 已接受您的好友请求，现在你们是好友了`;
      db.prepare(`
        INSERT INTO messages (id, from_user_id, to_user_id, content, message_type)
        VALUES (?, ?, ?, ?, 'text')
      `).run(messageId, userId, request.user_id, messageContent);
    } catch (msgError: any) {
      // 如果消息创建失败，记录错误但不影响好友请求的接受
      console.error('创建好友请求接受通知消息失败:', msgError);
    }

    res.json({ message: '好友请求已接受' });
  } catch (error: any) {
    console.error('接受好友请求失败:', error);
    res.status(500).json({ error: '接受好友请求失败' });
  }
});

// 拒绝好友请求
router.post('/requests/:requestId/decline', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { requestId } = req.params;

    // 获取好友请求信息
    const request = db.prepare(`
      SELECT * FROM friendships WHERE id = ?
    `).get(requestId) as any;

    if (!request) {
      return res.status(404).json({ error: '好友请求不存在' });
    }

    // 检查是否是发给当前用户的请求
    if (request.friend_id !== userId) {
      return res.status(403).json({ error: '您无权处理此请求' });
    }

    // 检查请求状态
    if (request.status !== 'pending') {
      return res.status(400).json({ error: '该请求已处理' });
    }

    // 获取拒绝者信息
    const decliner = db.prepare('SELECT username, nickname FROM users WHERE id = ?').get(userId) as any;
    const declinerName = decliner?.nickname || decliner?.username || '用户';

    // 删除好友请求
    db.prepare('DELETE FROM friendships WHERE id = ?').run(requestId);

    // 发送系统消息通知发送者
    try {
      const messageId = uuidv4();
      const messageContent = `${declinerName} 拒绝了您的好友请求`;
      db.prepare(`
        INSERT INTO messages (id, from_user_id, to_user_id, content, message_type)
        VALUES (?, ?, ?, ?, 'text')
      `).run(messageId, userId, request.user_id, messageContent);
    } catch (msgError: any) {
      // 如果消息创建失败，记录错误但不影响好友请求的拒绝
      console.error('创建好友请求拒绝通知消息失败:', msgError);
    }

    res.json({ message: '好友请求已拒绝' });
  } catch (error: any) {
    console.error('拒绝好友请求失败:', error);
    res.status(500).json({ error: '拒绝好友请求失败' });
  }
});

// 取消已发送的好友请求
router.delete('/requests/:requestId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { requestId } = req.params;

    const request = db.prepare(`
      SELECT * FROM friendships WHERE id = ?
    `).get(requestId) as any;

    if (!request) {
      return res.status(404).json({ error: '好友请求不存在' });
    }

    // 只能取消自己发送的请求
    if (request.user_id !== userId) {
      return res.status(403).json({ error: '您无权取消此请求' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: '该请求已处理' });
    }

    db.prepare('DELETE FROM friendships WHERE id = ?').run(requestId);

    res.json({ message: '好友请求已取消' });
  } catch (error: any) {
    console.error('取消好友请求失败:', error);
    res.status(500).json({ error: '取消好友请求失败' });
  }
});

// 获取好友列表
router.get('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { keyword, groupName } = req.query;

    // 检查friendships表是否存在
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friendships'").get() as any;
      if (!tableCheck) {
        return res.json({ friends: [] });
      }
    } catch (checkError: any) {
      console.warn('friendships表不存在');
      return res.json({ friends: [] });
    }

    // 检查表是否有remark和group_name字段
    let hasRemarkField = false;
    let hasGroupNameField = false;
    try {
      const columns = db.prepare("PRAGMA table_info(friendships)").all() as any[];
      hasRemarkField = columns.some(col => col.name === 'remark');
      hasGroupNameField = columns.some(col => col.name === 'group_name');
    } catch (e) {
      // 忽略错误
    }

    let query = `
      SELECT 
        f.*,
        CASE 
          WHEN f.user_id = ? THEN f.friend_id
          ELSE f.user_id
        END as friend_id,
        CASE 
          WHEN f.user_id = ? THEN u2.id
          ELSE u1.id
        END as user_id_for_display,
        CASE 
          WHEN f.user_id = ? THEN u2.username
          ELSE u1.username
        END as friend_username,
        CASE 
          WHEN f.user_id = ? THEN u2.nickname
          ELSE u1.nickname
        END as friend_nickname,
        CASE 
          WHEN f.user_id = ? THEN u2.email
          ELSE u1.email
        END as friend_email
    `;

    const params: any[] = [userId, userId, userId, userId, userId];

    // 如果有remark字段，添加到查询中
    if (hasRemarkField) {
      query += `,
        CASE 
          WHEN f.user_id = ? THEN f.remark
          ELSE NULL
        END as remark`;
      params.push(userId);
    } else {
      query += `, NULL as remark`;
    }

    // 如果有group_name字段，添加到查询中
    if (hasGroupNameField) {
      query += `,
        CASE 
          WHEN f.user_id = ? THEN f.group_name
          ELSE NULL
        END as group_name_display`;
      params.push(userId);
    } else {
      query += `, NULL as group_name_display`;
    }

    query += `
      FROM friendships f
      INNER JOIN users u1 ON f.user_id = u1.id
      INNER JOIN users u2 ON f.friend_id = u2.id
      WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
    `;

    params.push(userId, userId);

    // 添加搜索条件
    if (keyword && typeof keyword === 'string' && keyword.trim().length > 0) {
      const searchTerm = `%${keyword.trim()}%`;
      query += ` AND (
        CASE WHEN f.user_id = ? THEN u2.username ELSE u1.username END LIKE ?
        OR CASE WHEN f.user_id = ? THEN u2.nickname ELSE u1.nickname END LIKE ?
        OR CASE WHEN f.user_id = ? THEN u2.email ELSE u1.email END LIKE ?
      `;
      params.push(userId, searchTerm, userId, searchTerm, userId, searchTerm);
      
      // 如果有remark字段，也搜索remark
      if (hasRemarkField) {
        query += ` OR CASE WHEN f.user_id = ? THEN f.remark ELSE NULL END LIKE ?`;
        params.push(userId, searchTerm);
      }
      
      query += `)`;
    }

    // 添加分组筛选
    if (groupName && typeof groupName === 'string' && groupName.trim().length > 0 && hasGroupNameField) {
      query += ` AND CASE WHEN f.user_id = ? THEN f.group_name ELSE NULL END = ?`;
      params.push(userId, groupName.trim());
    }

    // ORDER BY子句
    if (hasRemarkField) {
      query += ` ORDER BY remark, friend_nickname, friend_username`;
    } else {
      query += ` ORDER BY friend_nickname, friend_username`;
    }

    const friends = db.prepare(query).all(...params) as any[];

    res.json({ friends });
  } catch (error: any) {
    console.error('获取好友列表失败:', error);
    console.error('错误详情:', error.message);
    res.status(500).json({ error: '获取好友列表失败', details: error.message });
  }
});

// 更新好友备注
router.put('/:friendId/remark', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.params;
    const { remark } = req.body;

    // 检查是否是好友关系
    const friendship = db.prepare(`
      SELECT id FROM friendships 
      WHERE user_id = ? AND friend_id = ? AND status = 'accepted'
    `).get(userId, friendId) as any;

    if (!friendship) {
      return res.status(404).json({ error: '不是好友关系' });
    }

    // 更新备注
    db.prepare(`
      UPDATE friendships 
      SET remark = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(remark || null, friendship.id);

    res.json({ message: '备注已更新' });
  } catch (error: any) {
    console.error('更新好友备注失败:', error);
    res.status(500).json({ error: '更新好友备注失败' });
  }
});

// 更新好友分组
router.put('/:friendId/group', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.params;
    const { groupName } = req.body;

    // 检查是否是好友关系
    const friendship = db.prepare(`
      SELECT id FROM friendships 
      WHERE user_id = ? AND friend_id = ? AND status = 'accepted'
    `).get(userId, friendId) as any;

    if (!friendship) {
      return res.status(404).json({ error: '不是好友关系' });
    }

    // 更新分组
    db.prepare(`
      UPDATE friendships 
      SET group_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(groupName || null, friendship.id);

    res.json({ message: '分组已更新' });
  } catch (error: any) {
    console.error('更新好友分组失败:', error);
    res.status(500).json({ error: '更新好友分组失败' });
  }
});

// 获取好友分组列表
router.get('/groups', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const groups = db.prepare(`
      SELECT DISTINCT group_name, COUNT(*) as count
      FROM friendships
      WHERE user_id = ? AND status = 'accepted' AND group_name IS NOT NULL AND group_name != ''
      GROUP BY group_name
      ORDER BY group_name
    `).all(userId) as any[];

    res.json({ groups });
  } catch (error: any) {
    console.error('获取好友分组列表失败:', error);
    res.status(500).json({ error: '获取好友分组列表失败' });
  }
});

// 删除好友
router.delete('/:friendId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.params;

    // 检查是否是好友关系（查找两条记录，因为好友关系是双向的）
    const friendships = db.prepare(`
      SELECT id FROM friendships 
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
      AND status = 'accepted'
    `).all(userId, friendId, friendId, userId) as any[];

    if (friendships.length === 0) {
      return res.status(404).json({ error: '不是好友关系' });
    }

    // 删除所有相关的好友关系记录（双向删除）
    for (const friendship of friendships) {
      db.prepare('DELETE FROM friendships WHERE id = ?').run(friendship.id);
    }

    res.json({ message: '好友已删除' });
  } catch (error: any) {
    console.error('删除好友失败:', error);
    res.status(500).json({ error: '删除好友失败' });
  }
});

export default router;

