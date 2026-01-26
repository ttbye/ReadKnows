/**
 * @file groups.ts
 * @author ttbye
 * @date 2025-12-30
 * @description 用户群组管理路由
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 获取用户的所有群组
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    if (!userId) {
      return res.status(401).json({ error: '未认证' });
    }
    
    console.log('获取群组列表，userId:', userId);
    
    // 快速检查表是否存在
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_groups'").get() as any;
      if (!tableCheck) {
        console.warn('user_groups 表不存在，返回空数组');
        return res.json({ groups: [] });
      }
    } catch (checkError: any) {
      // 如果查询失败，可能是表不存在，返回空数组
      if (checkError.message && checkError.message.includes('no such table')) {
        console.warn('user_groups 表不存在，返回空数组');
        return res.json({ groups: [] });
      }
      // 其他错误也返回空数组，避免阻塞
      console.warn('检查表存在性失败，返回空数组:', checkError.message);
      return res.json({ groups: [] });
    }

    // 快速获取用户所在的群组ID
    let groupIds: string[] = [];
    try {
      const memberRows = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId) as any[];
      groupIds = memberRows.map((row: any) => row.group_id);
    } catch (memberError: any) {
      if (memberError.message && (memberError.message.includes('no such table') || memberError.message.includes('no such column'))) {
        console.warn('group_members 表不存在，返回空数组');
        return res.json({ groups: [] });
      }
      // 其他错误也返回空数组
      console.warn('查询群组成员失败，返回空数组:', memberError.message);
      return res.json({ groups: [] });
    }

    if (groupIds.length === 0) {
      console.log('用户没有加入任何群组');
      return res.json({ groups: [] });
    }

    // 简化查询：先获取群组基本信息，然后单独获取用户角色和成员数
    let groups: any[] = [];
    try {
      const placeholders = groupIds.map(() => '?').join(',');
      // 先获取群组基本信息
      groups = db.prepare(`
        SELECT * FROM user_groups
        WHERE id IN (${placeholders})
        ORDER BY created_at DESC
      `).all(...groupIds) as any[];

      // 然后为每个群组添加用户角色和成员数（使用批量查询优化）
      for (const group of groups) {
        try {
          const memberInfo = db.prepare('SELECT role, joined_at FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1').get(group.id, userId) as any;
          const memberCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?').get(group.id) as any;
          
          group.user_role = memberInfo?.role || 'member';
          group.joined_at = memberInfo?.joined_at || group.created_at;
          group.member_count = memberCount?.count || 0;
        } catch (infoError: any) {
          // 如果查询失败，使用默认值
          group.user_role = 'member';
          group.joined_at = group.created_at;
          group.member_count = 0;
        }
      }
    } catch (queryError: any) {
      if (queryError.message && (queryError.message.includes('no such table') || queryError.message.includes('no such column'))) {
        console.warn('查询群组时表不存在，返回空数组');
        return res.json({ groups: [] });
      }
      // 其他错误也返回空数组
      console.warn('查询群组失败，返回空数组:', queryError.message);
      return res.json({ groups: [] });
    }

    console.log('查询到的群组数量:', groups.length);
    res.json({ groups: groups || [] });
  } catch (error: any) {
    console.error('获取群组列表失败:', error);
    console.error('错误消息:', error.message);
    // 任何错误都返回空数组，避免阻塞前端
    res.json({ groups: [] });
  }
});

// 创建群组
router.post('/', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, description, isPublic } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '群组名称不能为空' });
    }

    const groupId = uuidv4();
    
    // 创建群组
    db.prepare(`
      INSERT INTO user_groups (id, name, description, creator_id, is_public)
      VALUES (?, ?, ?, ?, ?)
    `).run(groupId, name.trim(), description || null, userId, isPublic ? 1 : 0);

    // 将创建者添加为管理员
    const memberId = uuidv4();
    const joinedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO group_members (id, group_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(memberId, groupId, userId, 'admin', joinedAt);
    
    console.log('添加创建者为管理员成功:', { memberId, groupId, userId, role: 'admin', joinedAt });

    // 获取创建的群组信息（优化查询，避免复杂的JOIN）
    try {
      const groupInfo = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(groupId) as any;
      const memberInfo = db.prepare('SELECT role, joined_at FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
      const memberCount = db.prepare('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?').get(groupId) as any;

      if (!groupInfo) {
        console.error('创建群组后查询失败，groupId:', groupId);
        return res.status(500).json({ error: '创建群组成功，但查询群组信息失败' });
      }

      const group = {
        ...groupInfo,
        user_role: memberInfo?.role || 'admin',
        joined_at: memberInfo?.joined_at || new Date().toISOString(),
        member_count: memberCount?.count || 1,
      };

      console.log('创建的群组信息:', group);

      res.status(201).json({ 
        message: '群组创建成功',
        group 
      });
    } catch (queryError: any) {
      console.error('查询创建的群组失败:', queryError);
      // 即使查询失败，群组已经创建成功，返回基本信息
      const groupInfo = db.prepare('SELECT * FROM user_groups WHERE id = ?').get(groupId) as any;
      if (groupInfo) {
        res.status(201).json({ 
          message: '群组创建成功',
          group: {
            ...groupInfo,
            user_role: 'admin',
            joined_at: new Date().toISOString(),
            member_count: 1,
          }
        });
      } else {
        res.status(500).json({ error: '创建群组成功，但查询群组信息失败' });
      }
    }
  } catch (error: any) {
    console.error('创建群组失败:', error);
    res.status(500).json({ error: '创建群组失败' });
  }
});

// 获取群组详情
router.get('/:groupId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    // 获取群组信息
    const group = db.prepare(`
      SELECT 
        g.*,
        gm.role as user_role,
        gm.joined_at,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM user_groups g
      INNER JOIN group_members gm ON g.id = gm.group_id
      WHERE g.id = ? AND gm.user_id = ?
    `).get(groupId, userId) as any;

    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }

    // 获取群组成员列表
    const members = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.nickname,
        gm.role,
        gm.joined_at
      FROM group_members gm
      INNER JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `).all(groupId) as any[];

    res.json({ 
      group,
      members 
    });
  } catch (error: any) {
    console.error('获取群组详情失败:', error);
    res.status(500).json({ error: '获取群组详情失败' });
  }
});

// 更新群组信息（仅管理员）
router.put('/:groupId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { name, description, isPublic } = req.body;

    // 检查用户是否是管理员
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以修改群组信息' });
    }

    // 更新群组信息
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (isPublic !== undefined) {
      updates.push('is_public = ?');
      values.push(isPublic ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(groupId);

    db.prepare(`
      UPDATE user_groups 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    // 获取更新后的群组信息
    const group = db.prepare(`
      SELECT 
        g.*,
        gm.role as user_role,
        gm.joined_at,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM user_groups g
      INNER JOIN group_members gm ON g.id = gm.group_id
      WHERE g.id = ? AND gm.user_id = ?
    `).get(groupId, userId) as any;

    res.json({ 
      message: '群组信息更新成功',
      group 
    });
  } catch (error: any) {
    console.error('更新群组信息失败:', error);
    res.status(500).json({ error: '更新群组信息失败' });
  }
});

// 删除群组（仅创建者）
router.delete('/:groupId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    // 检查用户是否是创建者
    const group = db.prepare(`
      SELECT creator_id FROM user_groups WHERE id = ?
    `).get(groupId) as any;

    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }

    if (group.creator_id !== userId) {
      return res.status(403).json({ error: '只有创建者可以删除群组' });
    }

    // 删除群组（外键约束会自动删除相关记录）
    db.prepare('DELETE FROM user_groups WHERE id = ?').run(groupId);

    res.json({ message: '群组删除成功' });
  } catch (error: any) {
    console.error('删除群组失败:', error);
    res.status(500).json({ error: '删除群组失败' });
  }
});

// 获取群组成员列表（群成员可查看）
router.get('/:groupId/members', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    const myMembership = db.prepare(`
      SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId);

    if (!myMembership) {
      return res.status(403).json({ error: '您不是该群组成员' });
    }

    const members = db.prepare(`
      SELECT u.id, u.username, u.nickname, gm.role, gm.joined_at
      FROM group_members gm
      INNER JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.joined_at ASC
    `).all(groupId) as any[];

    res.json({ members });
  } catch (error: any) {
    console.error('获取群组成员失败:', error);
    res.status(500).json({ error: '获取群组成员失败' });
  }
});

// 添加成员到群组（仅管理员）
router.post('/:groupId/members', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { userId: targetUserId, role = 'member' } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: '用户ID不能为空' });
    }

    // 检查操作者是否是管理员
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以添加成员' });
    }

    // 检查目标用户是否存在
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId) as any;
    if (!targetUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查用户是否已经是成员
    const existingMember = db.prepare(`
      SELECT id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, targetUserId) as any;

    if (existingMember) {
      return res.status(400).json({ error: '用户已经是群组成员' });
    }

    // 添加成员
    const memberId = uuidv4();
    db.prepare(`
      INSERT INTO group_members (id, group_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(memberId, groupId, targetUserId, role);

    // 获取添加的成员信息
    const member = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.nickname,
        gm.role,
        gm.joined_at
      FROM group_members gm
      INNER JOIN users u ON gm.user_id = u.id
      WHERE gm.id = ?
    `).get(memberId) as any;

    res.status(201).json({ 
      message: '成员添加成功',
      member 
    });
  } catch (error: any) {
    console.error('添加成员失败:', error);
    res.status(500).json({ error: '添加成员失败' });
  }
});

// 用户退出群组
router.post('/:groupId/leave', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT id, role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    // 检查是否是群组创建者
    const group = db.prepare('SELECT creator_id FROM user_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }
    
    if (group.creator_id === userId) {
      return res.status(400).json({ error: '群组创建者不能退出群组，请先删除群组或转让创建者权限' });
    }

    // 移除成员
    db.prepare('DELETE FROM group_members WHERE id = ?').run(membership.id);

    res.json({ message: '已成功退出群组' });
  } catch (error: any) {
    console.error('退出群组失败:', error);
    res.status(500).json({ error: '退出群组失败' });
  }
});

// 转让群主（仅创建者）
router.post('/:groupId/transfer', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { newOwnerId } = req.body;

    if (!newOwnerId || typeof newOwnerId !== 'string') {
      return res.status(400).json({ error: '请指定新群主' });
    }
    if (newOwnerId === userId) {
      return res.status(400).json({ error: '不能转让给自己' });
    }

    const group = db.prepare('SELECT creator_id FROM user_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }
    if (group.creator_id !== userId) {
      return res.status(403).json({ error: '只有群主可以转让群主身份' });
    }

    const newOwnerMember = db.prepare(`
      SELECT id, role FROM group_members WHERE group_id = ? AND user_id = ?
    `).get(groupId, newOwnerId) as any;
    if (!newOwnerMember) {
      return res.status(400).json({ error: '新群主必须是当前群组成员' });
    }

    const transaction = db.transaction(() => {
      db.prepare('UPDATE user_groups SET creator_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newOwnerId, groupId);
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('admin', groupId, newOwnerId);
      db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('member', groupId, userId);
    });
    transaction();

    res.json({ message: '群主转让成功' });
  } catch (error: any) {
    console.error('转让群主失败:', error);
    res.status(500).json({ error: '转让群主失败' });
  }
});

// 移除群组成员（仅管理员，或成员自己退出）
router.delete('/:groupId/members/:memberId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId, memberId } = req.params;

    // 检查操作者是否是管理员或要移除的是自己
    const membership = db.prepare(`
      SELECT role, user_id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    // 获取要移除的成员信息
    const targetMember = db.prepare(`
      SELECT user_id FROM group_members WHERE id = ?
    `).get(memberId) as any;

    if (!targetMember) {
      return res.status(404).json({ error: '成员不存在' });
    }

    // 只有管理员可以移除其他成员，或者成员可以自己退出
    if (targetMember.user_id !== userId && membership.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以移除其他成员' });
    }

    // 不能移除创建者
    const group = db.prepare('SELECT creator_id FROM user_groups WHERE id = ?').get(groupId) as any;
    if (targetMember.user_id === group.creator_id) {
      return res.status(400).json({ error: '不能移除群组创建者' });
    }

    // 移除成员
    db.prepare('DELETE FROM group_members WHERE id = ?').run(memberId);

    res.json({ message: '成员移除成功' });
  } catch (error: any) {
    console.error('移除成员失败:', error);
    res.status(500).json({ error: '移除成员失败' });
  }
});

// 更新成员角色（仅管理员）
router.put('/:groupId/members/:memberId/role', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId, memberId } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }

    // 检查操作者是否是管理员
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以修改成员角色' });
    }

    // 不能修改创建者的角色
    const targetMember = db.prepare(`
      SELECT user_id FROM group_members WHERE id = ?
    `).get(memberId) as any;

    if (!targetMember) {
      return res.status(404).json({ error: '成员不存在' });
    }

    const group = db.prepare('SELECT creator_id FROM user_groups WHERE id = ?').get(groupId) as any;
    if (targetMember.user_id === group.creator_id) {
      return res.status(400).json({ error: '不能修改创建者的角色' });
    }

    // 更新角色
    db.prepare('UPDATE group_members SET role = ? WHERE id = ?').run(role, memberId);

    res.json({ message: '成员角色更新成功' });
  } catch (error: any) {
    console.error('更新成员角色失败:', error);
    res.status(500).json({ error: '更新成员角色失败' });
  }
});

// 搜索公开群组
router.get('/public/search', (req: AuthRequest, res) => {
  try {
    const { keyword } = req.query;
    const userId = req.userId!;

    let query = `
      SELECT 
        g.*,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
        CASE WHEN EXISTS (
          SELECT 1 FROM group_members WHERE group_id = g.id AND user_id = ?
        ) THEN 1 ELSE 0 END as is_member
      FROM user_groups g
      WHERE g.is_public = 1
    `;
    const params: any[] = [userId];

    if (keyword) {
      query += ` AND (g.name LIKE ? OR g.description LIKE ?)`;
      const searchTerm = `%${keyword}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ` ORDER BY g.created_at DESC LIMIT 50`;

    const groups = db.prepare(query).all(...params) as any[];

    res.json({ groups });
  } catch (error: any) {
    console.error('搜索公开群组失败:', error);
    res.status(500).json({ error: '搜索公开群组失败' });
  }
});

// ========== 群组邀请相关路由 ==========

// 获取可邀请的好友列表（用于群组邀请，只能邀请好友）
router.get('/:groupId/invitable-friends', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { keyword } = req.query;

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    // 检查friendships表是否存在
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friendships'").get() as any;
      if (!tableCheck) {
        return res.json({ friends: [], hint: 'no_accepted_friends' });
      }
    } catch (checkError: any) {
      console.warn('friendships表不存在');
      return res.json({ friends: [], hint: 'no_accepted_friends' });
    }

    // 获取已经是群组成员的好友ID列表
    let memberIds: string[] = [];
    try {
      const groupMemberIds = db.prepare(`
        SELECT user_id FROM group_members WHERE group_id = ?
      `).all(groupId) as any[];
      memberIds = groupMemberIds.map(m => m.user_id);
    } catch (error: any) {
      console.warn('获取群组成员失败:', error);
      memberIds = [];
    }

    // 构建查询：获取好友列表，排除已经是群组成员的好友
    // 检查表是否有remark字段
    let hasRemarkField = false;
    try {
      const columns = db.prepare("PRAGMA table_info(friendships)").all() as any[];
      hasRemarkField = columns.some(col => col.name === 'remark');
    } catch (e) {
      // 忽略错误
    }

    let query = `
      SELECT DISTINCT
        CASE 
          WHEN f.user_id = ? THEN f.friend_id
          ELSE f.user_id
        END as friend_id,
        CASE 
          WHEN f.user_id = ? THEN u2.username
          ELSE u1.username
        END as username,
        CASE 
          WHEN f.user_id = ? THEN u2.nickname
          ELSE u1.nickname
        END as nickname,
        CASE 
          WHEN f.user_id = ? THEN u2.email
          ELSE u1.email
        END as email
    `;

    // 如果有remark字段，添加到查询中
    if (hasRemarkField) {
      query += `,
        CASE 
          WHEN f.user_id = ? THEN f.remark
          ELSE NULL
        END as remark`;
    }

    query += `
      FROM friendships f
      INNER JOIN users u1 ON f.user_id = u1.id
      INNER JOIN users u2 ON f.friend_id = u2.id
      WHERE (f.user_id = ? OR f.friend_id = ?) 
        AND f.status = 'accepted'
    `;
    
    const params: any[] = [userId, userId, userId, userId];
    if (hasRemarkField) {
      params.push(userId);
    }
    params.push(userId, userId);

    // 如果有搜索关键词，添加搜索条件
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

    // ORDER BY子句
    if (hasRemarkField) {
      query += ` ORDER BY remark, nickname, username LIMIT 50`;
    } else {
      query += ` ORDER BY nickname, username LIMIT 50`;
    }

    let friends = db.prepare(query).all(...params) as any[];
    const countAccepted = friends.length;

    // 过滤掉已经是群组成员的好友
    friends = friends.filter(f => !memberIds.includes(f.friend_id));

    // 过滤掉已有待处理群组邀请的好友
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='group_invitations'").get() as any;
      if (tableCheck) {
        friends = friends.filter((f) => {
          const pending = db.prepare(`
            SELECT id FROM group_invitations WHERE group_id = ? AND invitee_id = ? AND status = 'pending'
          `).get(groupId, f.friend_id) as any;
          return !pending;
        });
      }
    } catch (e) {
      // 忽略
    }

    // 空列表时返回 hint，便于前端展示更准确的说明
    let hint: 'no_accepted_friends' | 'all_in_group_or_pending' | undefined;
    if (friends.length === 0 && countAccepted === 0) {
      hint = 'no_accepted_friends';
    } else if (friends.length === 0 && countAccepted > 0) {
      hint = 'all_in_group_or_pending';
    }

    res.json({ friends, hint });
  } catch (error: any) {
    console.error('获取可邀请的好友列表失败:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ error: '获取可邀请的好友列表失败', details: error.message });
  }
});

// 批量邀请用户加入群组（用于 CreateGroupModal、InviteToGroupModal 等，请求体 { userIds: string[], message?: string }）
router.post('/:groupId/invite', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { userIds, message } = req.body;
    const idList = Array.isArray(userIds) ? userIds : [];

    if (idList.length === 0) {
      return res.status(400).json({ error: '请指定要邀请的用户' });
    }

    // 检查群组是否存在
    const group = db.prepare('SELECT id, creator_id FROM user_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }

    // 检查操作者是否是群组成员
    const membership = db.prepare(`
      SELECT role FROM group_members WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;
    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员，无法邀请他人' });
    }

    let invited = 0;
    const errors: string[] = [];

    for (const inviteeId of idList) {
      if (!inviteeId || typeof inviteeId !== 'string') continue;
      if (inviteeId === userId) { errors.push('不能邀请自己'); continue; }

      const invitee = db.prepare('SELECT id, username FROM users WHERE id = ?').get(inviteeId) as any;
      if (!invitee) { errors.push('用户不存在'); continue; }

      const existingMember = db.prepare(`
        SELECT id FROM group_members WHERE group_id = ? AND user_id = ?
      `).get(groupId, inviteeId) as any;
      if (existingMember) { errors.push('已是成员'); continue; }

      const friendship = db.prepare(`
        SELECT id FROM friendships
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = 'accepted'
      `).get(userId, inviteeId, inviteeId, userId) as any;
      if (!friendship) { errors.push('只能邀请好友'); continue; }

      const existingInvitation = db.prepare(`
        SELECT id FROM group_invitations WHERE group_id = ? AND invitee_id = ? AND status = 'pending'
      `).get(groupId, inviteeId) as any;
      if (existingInvitation) { errors.push('已有待处理邀请'); continue; }

      const invitationId = uuidv4();
      db.prepare(`
        INSERT INTO group_invitations (id, group_id, inviter_id, invitee_id, message, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(invitationId, groupId, userId, inviteeId, message || null);
      invited += 1;
    }

    res.status(200).json({
      message: invited > 0 ? `已邀请 ${invited} 人` : '未成功邀请任何人',
      invited,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('批量邀请失败:', error);
    res.status(500).json({ error: '批量邀请失败', details: error?.message });
  }
});

// 创建群组邀请（单用户，请求体 { inviteeId, message? }）
router.post('/:groupId/invitations', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { inviteeId, message } = req.body;

    if (!inviteeId) {
      return res.status(400).json({ error: '请指定要邀请的用户' });
    }

    // 检查群组是否存在
    const group = db.prepare('SELECT id, creator_id FROM user_groups WHERE id = ?').get(groupId) as any;
    if (!group) {
      return res.status(404).json({ error: '群组不存在' });
    }

    // 检查操作者是否是群组成员（管理员或成员都可以邀请）
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员，无法邀请他人' });
    }

    // 检查被邀请用户是否存在
    const invitee = db.prepare('SELECT id, username FROM users WHERE id = ?').get(inviteeId) as any;
    if (!invitee) {
      return res.status(404).json({ error: '被邀请用户不存在' });
    }

    // 不能邀请自己
    if (inviteeId === userId) {
      return res.status(400).json({ error: '不能邀请自己' });
    }

    // 检查用户是否已经是成员
    const existingMember = db.prepare(`
      SELECT id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, inviteeId) as any;

    if (existingMember) {
      return res.status(400).json({ error: '该用户已经是群组成员' });
    }

    // 检查是否是好友关系（必须先成为好友才能邀请）
    const friendship = db.prepare(`
      SELECT id FROM friendships 
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
      AND status = 'accepted'
    `).get(userId, inviteeId, inviteeId, userId) as any;

    if (!friendship) {
      return res.status(403).json({ error: '只能邀请好友加入群组，请先添加对方为好友' });
    }

    // 检查是否已有待处理的邀请
    const existingInvitation = db.prepare(`
      SELECT id FROM group_invitations 
      WHERE group_id = ? AND invitee_id = ? AND status = 'pending'
    `).get(groupId, inviteeId) as any;

    if (existingInvitation) {
      return res.status(400).json({ error: '该用户已有待处理的邀请' });
    }

    // 创建邀请
    const invitationId = uuidv4();
    db.prepare(`
      INSERT INTO group_invitations (id, group_id, inviter_id, invitee_id, message, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(invitationId, groupId, userId, inviteeId, message || null);

    // 获取邀请信息
    const invitation = db.prepare(`
      SELECT 
        gi.*,
        u1.username as inviter_username,
        u1.nickname as inviter_nickname,
        u2.username as invitee_username,
        u2.nickname as invitee_nickname,
        g.name as group_name
      FROM group_invitations gi
      INNER JOIN users u1 ON gi.inviter_id = u1.id
      INNER JOIN users u2 ON gi.invitee_id = u2.id
      INNER JOIN user_groups g ON gi.group_id = g.id
      WHERE gi.id = ?
    `).get(invitationId) as any;

    res.status(201).json({ 
      message: '邀请已发送',
      invitation 
    });
  } catch (error: any) {
    console.error('创建邀请失败:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ 
      error: '创建邀请失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 获取用户的邀请列表（收到的邀请）
router.get('/invitations/received', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const invitations = db.prepare(`
      SELECT 
        gi.*,
        u.username as inviter_username,
        u.nickname as inviter_nickname,
        u.email as inviter_email,
        g.name as group_name,
        g.description as group_description,
        g.is_public as group_is_public
      FROM group_invitations gi
      INNER JOIN users u ON gi.inviter_id = u.id
      INNER JOIN user_groups g ON gi.group_id = g.id
      WHERE gi.invitee_id = ? AND gi.status = 'pending'
      ORDER BY gi.created_at DESC
    `).all(userId) as any[];

    res.json({ invitations });
  } catch (error: any) {
    console.error('获取邀请列表失败:', error);
    res.status(500).json({ error: '获取邀请列表失败' });
  }
});

// 获取群组发出的邀请列表
router.get('/:groupId/invitations', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT role FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    const invitations = db.prepare(`
      SELECT 
        gi.*,
        u.username as invitee_username,
        u.nickname as invitee_nickname,
        u.email as invitee_email
      FROM group_invitations gi
      INNER JOIN users u ON gi.invitee_id = u.id
      WHERE gi.group_id = ?
      ORDER BY gi.created_at DESC
    `).all(groupId) as any[];

    res.json({ invitations });
  } catch (error: any) {
    console.error('获取群组邀请列表失败:', error);
    res.status(500).json({ error: '获取群组邀请列表失败' });
  }
});

// 接受邀请
router.post('/invitations/:invitationId/accept', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { invitationId } = req.params;

    // 获取邀请信息
    const invitation = db.prepare(`
      SELECT * FROM group_invitations WHERE id = ?
    `).get(invitationId) as any;

    if (!invitation) {
      return res.status(404).json({ error: '邀请不存在' });
    }

    // 检查是否是邀请的接收者
    if (invitation.invitee_id !== userId) {
      return res.status(403).json({ error: '您无权处理此邀请' });
    }

    // 检查邀请状态
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: '该邀请已处理' });
    }

    // 检查用户是否已经是成员
    const existingMember = db.prepare(`
      SELECT id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(invitation.group_id, userId) as any;

    if (existingMember) {
      // 如果已经是成员，直接更新邀请状态
      db.prepare(`
        UPDATE group_invitations 
        SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(invitationId);
      return res.json({ message: '您已经是该群组的成员' });
    }

    // 使用事务确保操作的原子性
    const transaction = db.transaction(() => {
      // 添加成员
      const memberId = uuidv4();
      db.prepare(`
        INSERT INTO group_members (id, group_id, user_id, role, joined_at)
        VALUES (?, ?, ?, 'member', CURRENT_TIMESTAMP)
      `).run(memberId, invitation.group_id, userId);

      // 更新邀请状态
      db.prepare(`
        UPDATE group_invitations 
        SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(invitationId);
    });

    transaction();

    res.json({ message: '已成功加入群组' });
  } catch (error: any) {
    console.error('接受邀请失败:', error);
    res.status(500).json({ error: '接受邀请失败' });
  }
});

// 拒绝邀请
router.post('/invitations/:invitationId/decline', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { invitationId } = req.params;

    // 获取邀请信息
    const invitation = db.prepare(`
      SELECT * FROM group_invitations WHERE id = ?
    `).get(invitationId) as any;

    if (!invitation) {
      return res.status(404).json({ error: '邀请不存在' });
    }

    // 检查是否是邀请的接收者
    if (invitation.invitee_id !== userId) {
      return res.status(403).json({ error: '您无权处理此邀请' });
    }

    // 检查邀请状态
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: '该邀请已处理' });
    }

    // 更新邀请状态
    db.prepare(`
      UPDATE group_invitations 
      SET status = 'declined', responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(invitationId);

    res.json({ message: '已拒绝邀请' });
  } catch (error: any) {
    console.error('拒绝邀请失败:', error);
    res.status(500).json({ error: '拒绝邀请失败' });
  }
});

// 取消邀请（仅邀请者或管理员）
router.delete('/invitations/:invitationId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { invitationId } = req.params;

    // 获取邀请信息
    const invitation = db.prepare(`
      SELECT gi.*, g.creator_id
      FROM group_invitations gi
      INNER JOIN user_groups g ON gi.group_id = g.id
      WHERE gi.id = ?
    `).get(invitationId) as any;

    if (!invitation) {
      return res.status(404).json({ error: '邀请不存在' });
    }

    // 检查权限：邀请者、群组创建者或管理员可以取消
    const isInviter = invitation.inviter_id === userId;
    const isCreator = invitation.creator_id === userId;
    
    // 检查是否是管理员
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    const isAdmin = user?.role === 'admin';

    if (!isInviter && !isCreator && !isAdmin) {
      return res.status(403).json({ error: '您无权取消此邀请' });
    }

    // 删除邀请
    db.prepare('DELETE FROM group_invitations WHERE id = ?').run(invitationId);

    res.json({ message: '邀请已取消' });
  } catch (error: any) {
    console.error('取消邀请失败:', error);
    res.status(500).json({ error: '取消邀请失败' });
  }
});

// 获取群组的书籍列表
router.get('/:groupId/books', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // 验证 userId 是否存在
    if (!userId) {
      console.error('[获取群组书籍] userId 不存在:', { groupId, userId, hasAuth: !!req.userId });
      return res.status(401).json({ error: '未认证，请重新登录' });
    }

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      console.warn('[获取群组书籍] 用户不是群组成员:', { groupId, userId });
      // 额外检查：验证群组是否存在
      const groupExists = db.prepare('SELECT id FROM user_groups WHERE id = ?').get(groupId) as any;
      if (!groupExists) {
        return res.status(404).json({ error: '群组不存在' });
      }
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    const offset = (Number(page) - 1) * Number(limit);

    // 检查book_group_visibility表是否存在
    let books: any[] = [];
    let total: { count: number } = { count: 0 };

    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='book_group_visibility'").get() as any;
      if (tableCheck) {
        // 获取群组可见的书籍
        books = db.prepare(`
          SELECT 
            b.*,
            u.username as uploader_username,
            u.nickname as uploader_nickname
          FROM books b
          INNER JOIN book_group_visibility bgv ON b.id = bgv.book_id
          LEFT JOIN users u ON b.uploader_id = u.id
          WHERE bgv.group_id = ? AND b.parent_book_id IS NULL
          ORDER BY b.created_at DESC
          LIMIT ? OFFSET ?
        `).all(groupId, Number(limit), offset) as any[];

        const countResult = db.prepare(`
          SELECT COUNT(*) as count
          FROM books b
          INNER JOIN book_group_visibility bgv ON b.id = bgv.book_id
          WHERE bgv.group_id = ? AND b.parent_book_id IS NULL
        `).get(groupId) as { count: number } | undefined;
        
        total = countResult || { count: 0 };
      }
    } catch (error: any) {
      console.error('获取群组书籍失败:', error);
      // 如果表不存在，返回空数组
      if (error.message && error.message.includes('no such table')) {
        books = [];
        total = { count: 0 };
      } else {
        throw error;
      }
    }

    res.json({
      books: books || [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: total.count || 0,
        totalPages: Math.ceil((total.count || 0) / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('获取群组书籍失败:', error);
    res.status(500).json({ error: '获取群组书籍失败', details: error.message });
  }
});

// 设置群组静音状态
router.put('/:groupId/mute', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { muted } = req.body;

    if (typeof muted !== 'boolean') {
      return res.status(400).json({ error: '请提供有效的静音状态（true/false）' });
    }

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    // 更新静音状态
    db.prepare(`
      UPDATE group_members 
      SET is_muted = ? 
      WHERE group_id = ? AND user_id = ?
    `).run(muted ? 1 : 0, groupId, userId);

    res.json({ 
      message: muted ? '群组已静音' : '群组已取消静音',
      muted 
    });
  } catch (error: any) {
    console.error('设置群组静音状态失败:', error);
    res.status(500).json({ error: '设置群组静音状态失败', details: error.message });
  }
});

// 获取群组静音状态
router.get('/:groupId/mute', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT is_muted FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    res.json({ 
      muted: membership.is_muted === 1 
    });
  } catch (error: any) {
    console.error('获取群组静音状态失败:', error);
    res.status(500).json({ error: '获取群组静音状态失败', details: error.message });
  }
});

export default router;
