/**
 * @file messages.ts
 * @author ttbye
 * @date 2025-01-01
 * @description 消息系统路由 - 支持文字、文件、书籍分享、群组消息
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest, requireCanUseFriends } from '../middleware/auth';
import multer from 'multer';

import path from 'path';
import fs from 'fs';
import * as iconv from 'iconv-lite';

// 修复文件名编码问题（处理中文乱码）
function fixFileNameEncoding(fileName: string): string {
  try {
    // 如果文件名已经是正确的UTF-8，直接返回
    const utf8Test = Buffer.from(fileName, 'utf8').toString('utf8');
    if (utf8Test === fileName && !/[\uFFFD]/.test(fileName) && /^[\x00-\x7F\u4e00-\u9fff\s\-_\.\(\)\[\]]+$/.test(fileName)) {
      return fileName;
    }

    // 方法1: 尝试从Latin1解码（multer默认使用latin1）
    try {
      const latin1Buffer = Buffer.from(fileName, 'latin1');
      const utf8Decoded = latin1Buffer.toString('utf8');
      if (!/[\uFFFD]/.test(utf8Decoded) && /[\u4e00-\u9fff]/.test(utf8Decoded)) {
        return utf8Decoded;
      }
    } catch (e) {
      // 忽略Latin1解码错误
    }

    // 方法2: 尝试使用iconv-lite从GBK/GB2312解码（常见的中文编码）
    try {
      const gbkDecoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'gbk');
      if (!/[\uFFFD]/.test(gbkDecoded) && /[\u4e00-\u9fff]/.test(gbkDecoded)) {
        return gbkDecoded;
      }
    } catch (e) {
      // 忽略GBK解码错误
    }

    // 方法3: 尝试使用iconv-lite从GB2312解码
    try {
      const gb2312Decoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'gb2312');
      if (!/[\uFFFD]/.test(gb2312Decoded) && /[\u4e00-\u9fff]/.test(gb2312Decoded)) {
        return gb2312Decoded;
      }
    } catch (e) {
      // 忽略GB2312解码错误
    }

    // 方法4: 尝试从binary解码
    try {
      const binaryBuffer = Buffer.from(fileName, 'binary');
      const utf8FromBinary = binaryBuffer.toString('utf8');
      if (!/[\uFFFD]/.test(utf8FromBinary) && /[\u4e00-\u9fff]/.test(utf8FromBinary)) {
        return utf8FromBinary;
      }
    } catch (e) {
      // 忽略binary解码错误
    }

    // 如果所有方法都失败，返回原文件名
    return fileName;
  } catch (error) {
    return fileName;
  }
}

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);
// 为所有消息路由应用书友权限检查
router.use(requireCanUseFriends);

// 消息文件存储目录
import { messagesDir } from '../config/paths';
if (!fs.existsSync(messagesDir)) {
  fs.mkdirSync(messagesDir, { recursive: true });
}

// 配置multer用于消息文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(messagesDir, 'files');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
});

// 仅上传文件，供前端先上传再发送（可配合 onUploadProgress 展示进度）
router.post('/upload-file', upload.single('file'), (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }
    const filePath = `/messages/files/${req.file.filename}`;
    const fileName = fixFileNameEncoding(req.file.originalname);
    const ext = path.extname(fileName).toLowerCase();
    const fileType = ext ? ext.slice(1) : null;
    res.json({
      file_path: filePath,
      file_name: fileName,
      file_size: req.file.size,
      file_type: fileType
    });
  } catch (e: any) {
    console.error('[upload-file]', e);
    res.status(500).json({ error: e?.message || '上传失败' });
  }
});

// 发送消息（支持文字、文件、书籍分享；文件可使用先上传得到的 file_path）
router.post('/', upload.single('file'), (req: AuthRequest, res) => {
  try {
    console.log('[发送消息] 开始处理请求');
    console.log('[发送消息] 请求头:', {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer ***' : '无',
      'x-api-key': req.headers['x-api-key'] ? '***' : '无'
    });
    console.log('[发送消息] 请求体:', JSON.stringify(req.body, null, 2));
    console.log('[发送消息] 文件:', req.file ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : '无文件');
    console.log('[发送消息] 用户ID:', req.userId);
    console.log('[发送消息] 原始请求体键:', Object.keys(req.body));

    const userId = req.userId!;
    let { toUserId, groupId, content, bookId, messageType = 'text' } = req.body;

    console.log('[发送消息] 解析参数:', {
      toUserId,
      groupId,
      content,
      bookId,
      messageType,
      hasFile: !!req.file
    });

    // 验证消息类型
    const validTypes = ['text', 'file', 'book', 'image', 'voice', 'sticker', 'book_excerpt'];
    if (!validTypes.includes(messageType)) {
      return res.status(400).json({ error: '无效的消息类型' });
    }

    // 确保 toUserId 和 groupId 正确处理（空字符串转为 null）
    const finalToUserId: string | null = (toUserId && typeof toUserId === 'string' && toUserId.trim() !== '') ? toUserId : null;
    const finalGroupId: string | null = (groupId && typeof groupId === 'string' && groupId.trim() !== '') ? groupId : null;

    console.log('[发送消息] 处理后的参数:', {
      finalToUserId,
      finalGroupId,
      toUserId,
      groupId
    });

    // 验证约束：to_user_id 和 group_id 不能同时有值
    if (finalToUserId && finalGroupId) {
      console.log('[发送消息] 错误：同时指定了用户ID和群组ID');
      return res.status(400).json({ error: '不能同时指定用户ID和群组ID' });
    }

    // 验证约束：to_user_id 和 group_id 必须有一个有值
    if (!finalToUserId && !finalGroupId) {
      console.log('[发送消息] 错误：未提供接收用户ID或群组ID');
      return res.status(400).json({ error: '请提供接收用户ID或群组ID' });
    }

    // 好友消息：给自己发消息则跳过好友检查；否则检查是否是好友关系
    if (finalToUserId) {
      console.log('[发送消息] 检查好友关系:', { userId, finalToUserId });

      if (finalToUserId !== userId) {
        const toUser = db.prepare('SELECT id FROM users WHERE id = ?').get(finalToUserId) as any;
      console.log('[发送消息] 接收用户查询结果:', toUser);

      if (!toUser) {
        console.log('[发送消息] 错误：接收用户不存在');
        return res.status(404).json({ error: '接收用户不存在' });
      }

      const friendship = db.prepare(`
        SELECT id FROM friendships
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
      `).get(userId, finalToUserId, finalToUserId, userId) as any;

      console.log('[发送消息] 好友关系查询结果:', friendship);

      if (!friendship) {
        console.log('[发送消息] 错误：不是好友关系');
        return res.status(403).json({ error: '只能给好友发送消息' });
      }

      // 检查是否被对方拉黑
      const blockedByReceiver = db.prepare(`
        SELECT is_blocked FROM user_conversation_settings
        WHERE user_id = ? AND conversation_type = 'friend' AND conversation_id = ?
      `).get(finalToUserId, userId) as any;

      if (blockedByReceiver?.is_blocked === 1) {
        console.log('[发送消息] 错误：您已被对方拉黑');
        return res.status(403).json({ error: '您已被对方拉黑，无法发送消息' });
      }
      }
    }

    // 群组消息：检查是否是群组成员
    if (finalGroupId) {
      console.log('[发送消息] 检查群组成员:', { userId, finalGroupId });

      const membership = db.prepare(`
        SELECT id FROM group_members
        WHERE group_id = ? AND user_id = ?
      `).get(finalGroupId, userId) as any;

      console.log('[发送消息] 群组成员查询结果:', membership);

      if (!membership) {
        console.log('[发送消息] 错误：不是群组成员');
        return res.status(403).json({ error: '您不是该群组的成员' });
      }
    }

    // 处理不同类型的消息
    let messageContent = content || '';
    let filePath: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;
    let fileType: string | null = null;
    let bookTitle: string | null = null;
    const replyToMessageId = req.body.replyToMessageId || null;

    if (messageType === 'file' || messageType === 'image' || messageType === 'voice') {
      if (req.file) {
        filePath = `/messages/files/${req.file.filename}`;
        fileName = fixFileNameEncoding(req.file.originalname);
        fileSize = req.file.size;
        fileType = fileName ? path.extname(fileName).toLowerCase().slice(1) : null;
      } else if (req.body.file_path && typeof req.body.file_path === 'string') {
        const raw = String(req.body.file_path).trim();
        const base = path.basename(raw);
        if (!/^\/messages\/files\/[^/\\]+$/.test(raw) || base.includes('..')) {
          return res.status(400).json({ error: '无效的 file_path' });
        }
        const full = path.join(messagesDir, 'files', base);
        if (!fs.existsSync(full)) {
          return res.status(400).json({ error: '文件不存在或已过期' });
        }
        filePath = raw;
        fileName = (req.body.file_name && String(req.body.file_name).trim()) || base;
        fileSize = parseInt(String(req.body.file_size || '0'), 10) || 0;
        fileType = (req.body.file_type && String(req.body.file_type).trim()) || (path.extname(fileName ?? '').toLowerCase().slice(1)) || null;
      } else {
        return res.status(400).json({ error: '请上传文件或提供 file_path' });
      }
      if (messageType === 'image') {
        messageContent = content || '[图片]';
      } else if (messageType === 'voice') {
        messageContent = '[语音]';
      } else {
        messageContent = `发送了文件: ${fileName}`;
      }
    } else if (messageType === 'book') {
      if (!bookId) {
        return res.status(400).json({ error: '请提供书籍ID' });
      }
      const book = db.prepare('SELECT id, title FROM books WHERE id = ?').get(bookId) as any;
      if (!book) {
        return res.status(404).json({ error: '书籍不存在' });
      }
      bookTitle = book.title;
      messageContent = content || `分享了书籍: ${bookTitle}`;
    } else if (messageType === 'book_excerpt') {
      if (!messageContent || !messageContent.trim()) {
        return res.status(400).json({ error: '请提供摘抄内容' });
      }
      messageContent = messageContent.trim();
      try {
        const parsedContent = JSON.parse(messageContent);
        if (parsedContent && typeof parsedContent === 'object') {
          if (!bookId && parsedContent.book_id) {
            bookId = parsedContent.book_id;
          }
          if (!bookTitle && parsedContent.book_title) {
            bookTitle = parsedContent.book_title;
          }
        }
      } catch {
        // 非JSON内容时忽略
      }
    } else if (messageType === 'sticker') {
      if (!messageContent || !messageContent.trim()) {
        return res.status(400).json({ error: '请提供表情包内容' });
      }
      messageContent = messageContent.trim();
    } else if (messageType === 'text') {
      if (!messageContent || !messageContent.trim()) {
        return res.status(400).json({ error: '请提供消息内容' });
      }
      messageContent = messageContent.trim();
    }
    
    // 如果引用了消息，验证引用的消息是否存在
    if (replyToMessageId) {
      let replyToMessage: any = null;
      
      if (finalGroupId) {
        // 群组消息：验证消息是否属于该群组
        replyToMessage = db.prepare(`
          SELECT id FROM messages 
          WHERE id = ? AND group_id = ?
        `).get(replyToMessageId, finalGroupId) as any;
      } else if (finalToUserId) {
        // 好友消息：验证消息是否属于该对话
        replyToMessage = db.prepare(`
          SELECT id FROM messages 
          WHERE id = ? AND (
            (from_user_id = ? AND to_user_id = ?) OR 
            (from_user_id = ? AND to_user_id = ?)
          ) AND (group_id IS NULL OR group_id = '')
        `).get(replyToMessageId, userId, finalToUserId, finalToUserId, userId) as any;
      }
      
      if (!replyToMessage) {
        return res.status(404).json({ error: '引用的消息不存在' });
      }
    }

    // 创建消息
    const messageId = uuidv4();
    
    // 获取语音消息的时长（如果有）
    const duration = messageType === 'voice' && req.body.duration 
      ? parseFloat(req.body.duration) 
      : null;
    
    // 调试日志
    console.log('准备插入消息:', {
      messageId,
      userId,
      finalToUserId,
      finalGroupId,
      messageType,
      messageContent: messageContent.substring(0, 50),
      hasFile: !!filePath,
      replyToMessageId,
      duration
    });
    
    try {
      // 确保群组消息时 to_user_id 为 null，好友消息时 group_id 为 null
      const insertToUserId = finalGroupId ? null : finalToUserId;
      const insertGroupId = finalToUserId ? null : finalGroupId;
      
      console.log('插入参数:', {
        insertToUserId,
        insertGroupId,
        isGroupMessage: !!insertGroupId,
        isFriendMessage: !!insertToUserId
      });
      
      db.prepare(`
        INSERT INTO messages (
          id, from_user_id, to_user_id, group_id, message_type, 
          content, file_path, file_name, file_size, file_type, 
          book_id, book_title, reply_to_message_id, duration
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        messageId,
        userId,
        insertToUserId,  // 群组消息时为 null
        insertGroupId,   // 好友消息时为 null
        messageType,
        messageContent,
        filePath,
        fileName,
        fileSize,
        fileType,
        bookId || null,
        bookTitle,
        replyToMessageId,
        duration
      );
    } catch (dbError: any) {
      console.error('数据库插入失败:', dbError);
      console.error('错误详情:', {
        message: dbError.message,
        code: dbError.code,
        finalToUserId,
        finalGroupId,
        userId,
        messageType
      });
      // 如果是约束错误，提供更友好的错误信息
      if (dbError.message && dbError.message.includes('CHECK constraint')) {
        return res.status(400).json({ error: '消息数据不符合约束条件：用户消息和群组消息不能同时存在' });
      }
      if (dbError.message && dbError.message.includes('NOT NULL constraint')) {
        return res.status(400).json({ 
          error: '消息数据不符合约束条件', 
          details: dbError.message,
          debug: {
            finalToUserId,
            finalGroupId,
            isGroupMessage: !!finalGroupId,
            isFriendMessage: !!finalToUserId
          }
        });
      }
      throw dbError; // 重新抛出其他错误
    }

    // 获取消息信息
    let message: any;
    try {
      if (finalGroupId) {
        // 群组消息：不需要to_user信息
        message = db.prepare(`
          SELECT 
            m.*,
            u1.username as from_username,
            u1.nickname as from_nickname
          FROM messages m
          INNER JOIN users u1 ON m.from_user_id = u1.id
          WHERE m.id = ?
        `).get(messageId) as any;
      } else {
        // 好友消息：需要to_user信息
        message = db.prepare(`
          SELECT 
            m.*,
            u1.username as from_username,
            u1.nickname as from_nickname,
            u2.username as to_username,
            u2.nickname as to_nickname
          FROM messages m
          INNER JOIN users u1 ON m.from_user_id = u1.id
          LEFT JOIN users u2 ON m.to_user_id = u2.id
          WHERE m.id = ?
        `).get(messageId) as any;
      }
    } catch (queryError: any) {
      console.error('查询消息信息失败:', queryError);
      // 即使查询失败，消息已经插入成功，返回基本消息信息
      message = {
        id: messageId,
        from_user_id: userId,
        to_user_id: finalToUserId,
        group_id: finalGroupId,
        message_type: messageType,
        content: messageContent,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
        book_id: bookId || null,
        book_title: bookTitle,
        reply_to_message_id: replyToMessageId,
        created_at: new Date().toISOString()
      };
    }

    res.status(201).json({ 
      message: '消息发送成功',
      data: message 
    });
  } catch (error: any) {
    console.error('发送消息失败:', error);
    console.error('错误堆栈:', error.stack);
    console.error('请求体:', JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      error: '发送消息失败', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 获取对话基本信息（必须在 /conversation/:userId 之前，因为这是更具体的路由）
router.get('/conversation/:type/:id', (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { type, id } = req.params;

    if (type === 'friend') {
      // 自己与自己对话：id 等于当前用户时直接返回自身信息
      if (id === currentUserId) {
        const selfUser = db.prepare(`
          SELECT id, username, nickname, email FROM users WHERE id = ?
        `).get(currentUserId) as any;
        if (!selfUser) {
          return res.status(404).json({ error: '用户不存在' });
        }
        return res.json({
          conversation: {
            other_user_id: selfUser.id,
            other_username: selfUser.username,
            other_nickname: selfUser.nickname || null,
            other_email: selfUser.email,
            conversation_type: 'friend'
          }
        });
      }

      // 获取好友对话信息（考虑双向好友关系）
      const friendship = db.prepare(`
        SELECT * FROM friendships
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
        LIMIT 1
      `).get(currentUserId, id, id, currentUserId) as any;

      if (!friendship) {
        return res.status(404).json({ error: '好友不存在或关系未确认' });
      }

      // 确定对方用户ID
      const otherUserId = friendship.user_id === currentUserId 
        ? friendship.friend_id 
        : friendship.user_id;

      // 获取对方用户信息
      const otherUser = db.prepare(`
        SELECT id, username, nickname, email
        FROM users
        WHERE id = ?
      `).get(otherUserId) as any;

      if (!otherUser) {
        return res.status(404).json({ error: '用户不存在' });
      }

      const friendInfo = {
        other_user_id: otherUser.id,
        other_username: otherUser.username,
        other_nickname: otherUser.nickname || null,
        other_email: otherUser.email,
        conversation_type: 'friend'
      };

      res.json({
        conversation: friendInfo
      });

    } else if (type === 'group') {
      // 获取群组对话信息
      const groupInfo = db.prepare(`
        SELECT
          g.id,
          g.name as group_name,
          g.description,
          g.creator_id as owner_id,
          g.created_at,
          'group' as conversation_type,
          COUNT(gm.user_id) as member_count
        FROM user_groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.id = ?
        GROUP BY g.id
      `).get(id) as any;

      if (!groupInfo) {
        return res.status(404).json({ error: '群组不存在' });
      }

      // 检查当前用户是否是群组成员
      const isMember = db.prepare(`
        SELECT 1 FROM group_members
        WHERE group_id = ? AND user_id = ?
      `).get(id, currentUserId);

      if (!isMember && groupInfo.owner_id !== currentUserId) {
        return res.status(403).json({ error: '您不是该群组的成员' });
      }

      // 检查是否是群主
      groupInfo.is_owner = groupInfo.owner_id === currentUserId;

      res.json({
        conversation: groupInfo
      });

    } else {
      return res.status(400).json({ error: '无效的对话类型' });
    }

  } catch (error: any) {
    console.error('获取对话信息失败:', error);
    res.status(500).json({ error: '获取对话信息失败', details: error.message });
  }
});

// 获取消息列表（与某个用户的所有消息）
router.get('/conversation/:userId', (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { userId } = req.params;
    const { page = 1, limit = 50, since } = req.query; // 支持 since 参数（ISO时间字符串）

    const offset = (Number(page) - 1) * Number(limit);

    // 构建查询条件
    let whereConditions = `
      ((m.from_user_id = ? AND m.to_user_id = ?) 
       OR (m.from_user_id = ? AND m.to_user_id = ?))
       AND (m.group_id IS NULL OR m.group_id = '')
       AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
       AND umd.id IS NULL
    `;
    
    const params: any[] = [currentUserId, currentUserId, userId, userId, currentUserId];
    
    // 如果提供了 since 参数，只获取该时间之后的消息
    if (since && typeof since === 'string') {
      try {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          whereConditions += ` AND m.created_at > ?`;
          params.push(sinceDate.toISOString());
        }
      } catch (e) {
        // 忽略无效的日期格式
      }
    }

    // 获取消息列表（排除当前用户已删除的消息）
    const messages = db.prepare(`
      SELECT 
        m.*,
        u1.username as from_username,
        u1.nickname as from_nickname,
        u2.username as to_username,
        u2.nickname as to_nickname,
        rm.content as reply_content,
        rm.from_nickname as reply_from_nickname,
        rm.from_username as reply_from_username,
        rm.message_type as reply_message_type
      FROM messages m
      INNER JOIN users u1 ON m.from_user_id = u1.id
      LEFT JOIN users u2 ON m.to_user_id = u2.id
      LEFT JOIN (
        SELECT 
          m2.id,
          m2.content,
          u3.nickname as from_nickname,
          u3.username as from_username,
          m2.message_type
        FROM messages m2
        INNER JOIN users u3 ON m2.from_user_id = u3.id
      ) rm ON m.reply_to_message_id = rm.id
      LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
      WHERE ${whereConditions}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset) as any[];

    // 获取总数（排除当前用户已删除的消息）
    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
      WHERE ((m.from_user_id = ? AND m.to_user_id = ?) 
         OR (m.from_user_id = ? AND m.to_user_id = ?))
         AND (m.group_id IS NULL OR m.group_id = '')
         AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
         AND umd.id IS NULL
    `).get(currentUserId, currentUserId, userId, userId, currentUserId) as any;

    res.json({ 
      messages: messages.reverse(), // 反转顺序，最新的在最后
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: total.count,
        totalPages: Math.ceil(total.count / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('获取消息列表失败:', error);
    res.status(500).json({ error: '获取消息列表失败' });
  }
});

// 获取群组消息列表
router.get('/group/:groupId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;
    const { page = 1, limit = 50, since } = req.query; // 支持 since 参数（ISO时间字符串）

    // 检查是否是群组成员
    const membership = db.prepare(`
      SELECT id FROM group_members 
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;

    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    const offset = (Number(page) - 1) * Number(limit);

    // 构建查询条件
    let whereConditions = `
      m.group_id = ?
        AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
        AND umd.id IS NULL
    `;
    
    const params: any[] = [userId, groupId];
    
    // 如果提供了 since 参数，只获取该时间之后的消息
    if (since && typeof since === 'string') {
      try {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          whereConditions += ` AND m.created_at > ?`;
          params.push(sinceDate.toISOString());
        }
      } catch (e) {
        // 忽略无效的日期格式
      }
    }

    // 获取消息列表（排除当前用户已删除的消息）
    const messages = db.prepare(`
      SELECT 
        m.*,
        u.username as from_username,
        u.nickname as from_nickname,
        rm.content as reply_content,
        rm.from_nickname as reply_from_nickname,
        rm.from_username as reply_from_username,
        rm.message_type as reply_message_type
      FROM messages m
      INNER JOIN users u ON m.from_user_id = u.id
      LEFT JOIN (
        SELECT 
          m2.id,
          m2.content,
          u2.nickname as from_nickname,
          u2.username as from_username,
          m2.message_type
        FROM messages m2
        INNER JOIN users u2 ON m2.from_user_id = u2.id
      ) rm ON m.reply_to_message_id = rm.id
      LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
      WHERE ${whereConditions}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset) as any[];

    // 获取总数（排除当前用户已删除的消息）
    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
      WHERE m.group_id = ?
        AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
        AND umd.id IS NULL
    `).get(userId, groupId) as any;

    res.json({ 
      messages: messages.reverse(),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: total.count,
        totalPages: Math.ceil(total.count / Number(limit))
      }
    });
  } catch (error: any) {
    console.error('获取群组消息列表失败:', error);
    res.status(500).json({ error: '获取群组消息列表失败' });
  }
});

// 获取所有会话列表（最近的消息，包括好友和群组）
router.get('/conversations', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // 获取好友会话
    let friendConversations: any[] = [];
    try {
      friendConversations = db.prepare(`
        SELECT
          m.*,
          CASE
            WHEN m.from_user_id = ? THEN m.to_user_id
            ELSE m.from_user_id
          END as other_user_id,
          CASE
            WHEN m.from_user_id = ? THEN u2.username
            ELSE u1.username
          END as other_username,
          CASE
            WHEN m.from_user_id = ? THEN u2.nickname
            ELSE u1.nickname
          END as other_nickname,
          CASE
            WHEN m.from_user_id = ? THEN u2.email
            ELSE u1.email
          END as other_email,
          'friend' as conversation_type
        FROM messages m
        INNER JOIN users u1 ON m.from_user_id = u1.id
        INNER JOIN users u2 ON m.to_user_id = u2.id
        INNER JOIN friendships f ON (
          (f.user_id = ? AND f.friend_id = CASE WHEN m.from_user_id = ? THEN m.to_user_id ELSE m.from_user_id END) OR
          (f.friend_id = ? AND f.user_id = CASE WHEN m.from_user_id = ? THEN m.to_user_id ELSE m.from_user_id END)
        )
        LEFT JOIN user_conversation_deletions ucd ON ucd.user_id = ?
          AND ucd.conversation_type = 'friend'
          AND ucd.conversation_id = CASE
            WHEN m.from_user_id = ? THEN m.to_user_id
            ELSE m.from_user_id
          END
        WHERE m.id IN (
          SELECT id FROM (
            SELECT m2.id AS id,
                   ROW_NUMBER() OVER (
                     PARTITION BY (CASE WHEN m2.from_user_id = ? THEN m2.to_user_id ELSE m2.from_user_id END)
                     ORDER BY m2.created_at DESC, m2.id DESC
                   ) AS rn
            FROM messages m2
            LEFT JOIN user_message_deletions umd ON m2.id = umd.message_id AND umd.user_id = ?
            WHERE (m2.from_user_id = ? OR m2.to_user_id = ?)
              AND (m2.group_id IS NULL OR m2.group_id = '')
              AND m2.to_user_id IS NOT NULL
              AND (m2.is_deleted = 0 OR m2.is_deleted IS NULL)
              AND umd.id IS NULL
          ) AS sub WHERE sub.rn = 1
        )
        AND f.status = 'accepted'
        AND ucd.id IS NULL
        ORDER BY m.created_at DESC
      `).all(userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId) as any[];
    } catch (error: any) {
      console.error('获取好友会话失败:', error);
      // 静默失败，返回空数组
    }

    // 自己与自己的会话：始终放在首位，无消息时也显示入口
    let selfConversation: any = null;
    try {
      const selfUser = db.prepare('SELECT id, username, nickname, email FROM users WHERE id = ?').get(userId) as any;
      if (selfUser) {
        const latestSelf = db.prepare(`
          SELECT m.* FROM messages m
          LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
          WHERE m.from_user_id = ? AND m.to_user_id = ?
            AND (m.group_id IS NULL OR m.group_id = '')
            AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
            AND umd.id IS NULL
          ORDER BY m.created_at DESC LIMIT 1
        `).get(userId, userId, userId) as any;
        selfConversation = latestSelf ? {
          ...latestSelf,
          other_user_id: selfUser.id,
          other_username: selfUser.username,
          other_nickname: selfUser.nickname || null,
          other_email: selfUser.email,
          conversation_type: 'friend'
        } : {
          id: 'self-empty',
          other_user_id: selfUser.id,
          other_username: selfUser.username,
          other_nickname: selfUser.nickname || null,
          other_email: selfUser.email,
          conversation_type: 'friend',
          content: '',
          created_at: new Date().toISOString(),
          message_type: 'text'
        };
      }
    } catch (e) {
      // 忽略
    }

    // 获取群组会话
    // 修改：显示所有加入的群组，即使没有消息（类似微信的群聊功能）
    let groupConversations: any[] = [];
    try {
      // 先获取所有加入的群组
      const joinedGroups = db.prepare(`
        SELECT 
          g.id as group_id,
          g.name as group_name,
          g.description as group_description
        FROM user_groups g
        INNER JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
      `).all(userId) as any[];

      // 为每个群组获取最新消息（排除已删除的对话）
      groupConversations = joinedGroups
        .filter((group: any) => {
          // 检查用户是否已删除此对话
          const deletion = db.prepare(`
            SELECT id FROM user_conversation_deletions
            WHERE user_id = ? AND conversation_type = 'group' AND conversation_id = ?
          `).get(userId, group.group_id) as any;
          return !deletion;
        })
        .map((group: any) => {
          const latestMessage = db.prepare(`
            SELECT m.*
            FROM messages m
            LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
            WHERE m.group_id = ?
            AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
            AND (m.is_recalled = 0 OR m.is_recalled IS NULL)
            AND umd.id IS NULL
            ORDER BY m.created_at DESC
            LIMIT 1
          `).get(userId, group.group_id) as any;

        if (latestMessage) {
          return {
            ...latestMessage,
            group_id: group.group_id,
            group_name: group.group_name,
            group_description: group.group_description,
            conversation_type: 'group'
          };
        } else {
          // 如果没有消息，创建一个空的会话对象
          return {
            id: `empty-${group.group_id}`,
            group_id: group.group_id,
            group_name: group.group_name,
            group_description: group.group_description,
            conversation_type: 'group',
            content: '',
            created_at: new Date().toISOString(),
            message_type: 'text'
          };
        }
      });
    } catch (error: any) {
      console.error('获取群组会话失败:', error);
      // 静默失败，返回空数组
    }

    // 合并并排序：自己的对话置顶，其余按最新消息时间
    const withSelf = selfConversation ? [selfConversation, ...friendConversations, ...groupConversations] : [...friendConversations, ...groupConversations];
    const allConversations = withSelf.sort((a, b) => {
      const aSelf = a.conversation_type === 'friend' && a.other_user_id === userId;
      const bSelf = b.conversation_type === 'friend' && b.other_user_id === userId;
      if (aSelf && !bSelf) return -1;
      if (!aSelf && bSelf) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // 获取每个会话的未读消息数和设置
    const conversationsWithUnread = allConversations.map(conv => {
      try {
        // 自己与自己的对话：不统计未读，直接返回
        if (conv.conversation_type === 'friend' && conv.other_user_id === userId) {
          return { ...conv, unread_count: 0, is_muted: false, is_blocked: false, display_name: null, remark: null };
        }
        // 获取对话设置（静音、黑名单、显示名、备注）
        const settings = db.prepare(`
          SELECT is_muted, is_blocked, display_name, remark FROM user_conversation_settings
          WHERE user_id = ? AND conversation_type = ? AND conversation_id = ?
        `).get(userId, conv.conversation_type, conv.conversation_type === 'friend' ? conv.other_user_id : conv.group_id) as any;
        
        const isMuted = settings?.is_muted === 1;
        const isBlocked = settings?.is_blocked === 1;
        const displayName = settings?.display_name && String(settings.display_name).trim() ? String(settings.display_name).trim() : null;
        const remark = settings?.remark && String(settings.remark).trim() ? String(settings.remark).trim() : null;
        
        if (conv.conversation_type === 'friend') {
          // 好友对话：统计发给当前用户且未读的消息（to_user_id=当前用户 且 is_read=0/NULL）
          let unreadQuery = `
            SELECT COUNT(*) as count
            FROM messages m
            LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
            WHERE ((m.from_user_id = ? AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = ?))
            AND m.to_user_id = ?
            AND (m.is_read = 0 OR m.is_read IS NULL)
            AND (m.group_id IS NULL OR m.group_id = '')
            AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
            AND umd.id IS NULL
          `;
          
          // 如果被拉黑，不计算未读数
          if (isBlocked) {
            const unreadCount = { count: 0 };
            return {
              ...conv,
              unread_count: 0,
              is_muted: isMuted,
              is_blocked: isBlocked,
              display_name: displayName,
              remark
            };
          }
          
          const unreadCount = db.prepare(unreadQuery).get(
            userId, conv.other_user_id, userId, userId, conv.other_user_id, userId
          ) as any;
          
          return {
            ...conv,
            unread_count: unreadCount.count || 0,
            is_muted: isMuted,
            is_blocked: isBlocked,
            display_name: displayName,
            remark
          };
        } else {
          // 群组对话：群消息 to_user_id 恒为 NULL，使用 user_group_read 的 last_read_at 计算 per-user 未读
          if (isBlocked) {
            return {
              ...conv,
              unread_count: 0,
              is_muted: isMuted,
              is_blocked: isBlocked,
              display_name: displayName,
              remark
            };
          }
          const ugr = db.prepare(`
            SELECT last_read_at FROM user_group_read WHERE user_id = ? AND group_id = ?
          `).get(userId, conv.group_id) as { last_read_at: string } | undefined;
          const lastReadAt = ugr?.last_read_at || '1970-01-01 00:00:00';
          const unreadCount = db.prepare(`
            SELECT COUNT(*) as count
            FROM messages m
            LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
            WHERE m.group_id = ?
            AND m.from_user_id != ?
            AND m.created_at > ?
            AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
            AND (m.is_recalled = 0 OR m.is_recalled IS NULL)
            AND umd.id IS NULL
          `).get(userId, conv.group_id, userId, lastReadAt) as { count: number };
          return {
            ...conv,
            unread_count: unreadCount?.count || 0,
            is_muted: isMuted,
            is_blocked: isBlocked,
            display_name: displayName,
            remark
          };
        }
      } catch (error: any) {
        console.error('获取未读消息数失败:', error);
        return {
          ...conv,
          unread_count: 0,
          is_muted: false,
          is_blocked: false,
          display_name: null,
          remark: null
        };
      }
    });

    res.json({ conversations: conversationsWithUnread });
  } catch (error: any) {
    console.error('获取会话列表失败:', error);
    // 降级为返回空列表，避免前端直接报错
    res.json({ conversations: [] });
  }
});

// 标记消息为已读
router.put('/:messageId/read', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;

    // 检查消息是否存在且是发给当前用户的
    const message = db.prepare(`
      SELECT id FROM messages 
      WHERE id = ? AND to_user_id = ?
    `).get(messageId, userId) as any;

    if (!message) {
      return res.status(404).json({ error: '消息不存在或无权限' });
    }

    // 标记为已读
    db.prepare(`
      UPDATE messages 
      SET is_read = 1 
      WHERE id = ?
    `).run(messageId);

    res.json({ message: '消息已标记为已读' });
  } catch (error: any) {
    console.error('标记消息已读失败:', error);
    res.status(500).json({ error: '标记消息已读失败' });
  }
});

// 标记与某个用户的所有消息为已读
router.put('/conversation/:userId/read-all', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { userId: otherUserId } = req.params;

    // 标记所有未读消息为已读（包括 is_read 为 NULL 的情况）
    const result = db.prepare(`
      UPDATE messages 
      SET is_read = 1 
      WHERE from_user_id = ? AND to_user_id = ? AND (is_read = 0 OR is_read IS NULL) AND group_id IS NULL
    `).run(otherUserId, userId);

    // 返回更新的消息数量，方便前端确认
    res.json({ 
      message: '所有消息已标记为已读',
      updated: result.changes || 0
    });
  } catch (error: any) {
    console.error('标记所有消息已读失败:', error);
    res.status(500).json({ error: '标记所有消息已读失败' });
  }
});

// 标记群组所有消息为已读（更新 user_group_read.last_read_at）
router.put('/group/:groupId/read-all', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    const membership = db.prepare(`
      SELECT id FROM group_members WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId) as any;
    if (!membership) {
      return res.status(403).json({ error: '您不是该群组的成员' });
    }

    const latest = db.prepare(`
      SELECT created_at FROM messages
      WHERE group_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY created_at DESC LIMIT 1
    `).get(groupId) as { created_at: string } | undefined;
    const lastReadAt = latest?.created_at || new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO user_group_read (user_id, group_id, last_read_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, group_id) DO UPDATE SET last_read_at = excluded.last_read_at
    `).run(userId, groupId, lastReadAt);

    // 返回更新的信息，方便前端确认
    res.json({ 
      message: '所有群组消息已标记为已读',
      last_read_at: lastReadAt
    });
  } catch (error: any) {
    console.error('标记群组消息已读失败:', error);
    res.status(500).json({ error: '标记群组消息已读失败' });
  }
});

// 获取未读消息数
router.get('/unread-count', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages m
      LEFT JOIN user_message_deletions umd ON m.id = umd.message_id AND umd.user_id = ?
      WHERE m.to_user_id = ? 
      AND m.is_read = 0 
      AND m.group_id IS NULL
      AND (m.is_deleted = 0 OR m.is_deleted IS NULL)
      AND umd.id IS NULL
    `).get(userId, userId) as any;

    res.json({ count: result.count || 0 });
  } catch (error: any) {
    console.error('获取未读消息数失败:', error);
    res.status(500).json({ error: '获取未读消息数失败' });
  }
});

// 下载消息文件
router.get('/file/:filename', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { filename } = req.params;
    const filePath = path.join(messagesDir, 'files', filename);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查用户是否有权限访问（通过检查消息）
    const message = db.prepare(`
      SELECT id, file_name FROM messages 
      WHERE file_path = ? AND (from_user_id = ? OR to_user_id = ? OR (group_id IS NOT NULL AND group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)))
    `).get(`/messages/files/${filename}`, userId, userId, userId) as any;

    if (!message) {
      return res.status(403).json({ error: '无权访问此文件' });
    }

    // 设置正确的文件名（处理中文编码）
    const fileName = message.file_name || filename;
    // 使用 encodeURIComponent 确保中文文件名正确编码
    const encodedFileName = encodeURIComponent(fileName);
    
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
    res.download(filePath, fileName);
  } catch (error: any) {
    console.error('下载文件失败:', error);
    res.status(500).json({ error: '下载文件失败' });
  }
});

// 预览/播放消息文件（用于音频等内联资源）
router.get('/files/:filename', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { filename } = req.params;
    const filePath = path.join(messagesDir, 'files', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const message = db.prepare(`
      SELECT id, file_name FROM messages 
      WHERE file_path = ? AND (from_user_id = ? OR to_user_id = ? OR (group_id IS NOT NULL AND group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)))
    `).get(`/messages/files/${filename}`, userId, userId, userId) as any;

    if (!message) {
      return res.status(403).json({ error: '无权访问此文件' });
    }

    const fileName = message.file_name || filename;
    const encodedFileName = encodeURIComponent(fileName);
    const ext = path.extname(fileName).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4'
    };
    const contentType = contentTypeMap[ext];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
    res.sendFile(filePath);
  } catch (error: any) {
    console.error('预览文件失败:', error);
    res.status(500).json({ error: '预览文件失败' });
  }
});

// 撤回消息（5分钟内）
router.put('/:messageId/recall', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;

    // 检查消息是否存在且是当前用户发送的
    const message = db.prepare(`
      SELECT id, created_at FROM messages 
      WHERE id = ? AND from_user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND (is_recalled = 0 OR is_recalled IS NULL)
    `).get(messageId, userId) as any;

    if (!message) {
      return res.status(404).json({ error: '消息不存在或无权限撤回' });
    }

    // 检查是否在5分钟内
    const messageTime = new Date(message.created_at).getTime();
    const now = Date.now();
    const diffMinutes = (now - messageTime) / (1000 * 60);

    if (diffMinutes > 5) {
      return res.status(400).json({ error: '消息发送超过5分钟，无法撤回' });
    }

    // 标记为已撤回
    db.prepare('UPDATE messages SET is_recalled = 1 WHERE id = ?').run(messageId);

    res.json({ message: '消息已撤回' });
  } catch (error: any) {
    console.error('撤回消息失败:', error);
    res.status(500).json({ error: '撤回消息失败' });
  }
});

// 删除消息（软删除；若有 file_path 则同时删除服务器端文件）
router.delete('/:messageId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { messageId } = req.params;

    // 检查消息是否存在且是当前用户发送的
    const message = db.prepare(`
      SELECT id, file_path FROM messages 
      WHERE id = ? AND from_user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    `).get(messageId, userId) as any;

    if (!message) {
      return res.status(404).json({ error: '消息不存在或无权限删除' });
    }

    // 若有附件/图片/语音等 file_path，删除服务器端文件
    if (message.file_path) {
      let filename: string | null = null;
      if (typeof message.file_path === 'string') {
        const p = message.file_path.trim();
        if (p.startsWith('/messages/files/')) filename = p.replace(/^\/messages\/files\//, '');
        else if (p.startsWith('/api/messages/files/')) filename = p.replace(/^\/api\/messages\/files\//, '');
      }
      if (filename) {
        const fullPath = path.join(messagesDir, 'files', filename);
        try {
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (e) {
          console.warn('删除消息附件文件失败:', fullPath, e);
        }
      }
    }

    // 软删除消息
    db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?').run(messageId);

    res.json({ message: '消息已删除' });
  } catch (error: any) {
    console.error('删除消息失败:', error);
    res.status(500).json({ error: '删除消息失败' });
  }
});

// 清空好友对话（仅标记当前用户的消息为已删除，不影响对方）
router.delete('/conversation/friend/:userId', (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { userId } = req.params;

    // 检查是否是好友关系
    const friendship = db.prepare(`
      SELECT * FROM friendships 
      WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `).get(currentUserId, userId, userId, currentUserId) as any;

    if (!friendship) {
      return res.status(404).json({ error: '不是好友关系' });
    }

    // 获取所有相关消息ID
    const messages = db.prepare(`
      SELECT id FROM messages
      WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
      AND (group_id IS NULL OR group_id = '')
      AND (is_deleted = 0 OR is_deleted IS NULL)
    `).all(currentUserId, userId, userId, currentUserId) as any[];

    // 为每条消息标记为当前用户已删除
    const insertDeletion = db.prepare(`
      INSERT OR IGNORE INTO user_message_deletions (id, user_id, message_id)
      VALUES (?, ?, ?)
    `);

    for (const msg of messages) {
      insertDeletion.run(uuidv4(), currentUserId, msg.id);
    }

    res.json({ message: '对话已清空' });
  } catch (error: any) {
    console.error('清空好友对话失败:', error);
    res.status(500).json({ error: '清空对话失败' });
  }
});

// 清空群组对话（仅标记当前用户的消息为已删除，不影响其他用户）
router.delete('/conversation/group/:groupId', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { groupId } = req.params;

    // 检查用户是否是群组成员
    const membership = db.prepare(`
      SELECT * FROM group_members 
      WHERE user_id = ? AND group_id = ?
    `).get(userId, groupId) as any;

    if (!membership) {
      return res.status(404).json({ error: '不是群组成员' });
    }

    // 获取该群组中的所有消息ID（包括用户发送和接收的）
    const messages = db.prepare(`
      SELECT id FROM messages
      WHERE group_id = ?
      AND (is_deleted = 0 OR is_deleted IS NULL)
    `).all(groupId) as any[];

    // 为每条消息标记为当前用户已删除
    const insertDeletion = db.prepare(`
      INSERT OR IGNORE INTO user_message_deletions (id, user_id, message_id)
      VALUES (?, ?, ?)
    `);

    for (const msg of messages) {
      insertDeletion.run(uuidv4(), userId, msg.id);
    }

    res.json({ message: '群组对话已清空' });
  } catch (error: any) {
    console.error('清空群组对话失败:', error);
    res.status(500).json({ error: '清空群组对话失败' });
  }
});

// 获取系统通知（群组邀请、好友邀请）
router.get('/notifications', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const notifications: any[] = [];

    // 检查group_invitations表是否存在
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='group_invitations'").get() as any;
      if (tableCheck) {
        // 获取群组邀请
        const groupInvitations = db.prepare(`
          SELECT 
            gi.*,
            u.username as inviter_username,
            u.nickname as inviter_nickname,
            g.name as group_name,
            g.description as group_description
          FROM group_invitations gi
          INNER JOIN users u ON gi.inviter_id = u.id
          INNER JOIN user_groups g ON gi.group_id = g.id
          WHERE gi.invitee_id = ? AND gi.status = 'pending'
          ORDER BY gi.created_at DESC
        `).all(userId) as any[];

        groupInvitations.forEach(inv => {
          notifications.push({
            id: inv.id,
            type: 'group_invitation',
            title: '群组邀请',
            content: `${inv.inviter_nickname || inv.inviter_username} 邀请您加入群组 "${inv.group_name}"`,
            data: inv,
            created_at: inv.created_at,
            is_read: 0
          });
        });
      }
    } catch (error: any) {
      console.error('获取群组邀请失败:', error);
      // 静默失败，不影响其他通知
    }

    // 检查friendships表是否存在
    try {
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friendships'").get() as any;
      if (tableCheck) {
        // 获取好友请求
        const friendRequests = db.prepare(`
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

        friendRequests.forEach(req => {
          notifications.push({
            id: req.id,
            type: 'friend_request',
            title: '好友请求',
            content: `${req.user_nickname || req.user_username} 向您发送了好友请求`,
            data: req,
            created_at: req.created_at,
            is_read: 0
          });
        });
      }
    } catch (error: any) {
      console.error('获取好友请求失败:', error);
      // 静默失败，不影响其他通知
    }

    // 按时间排序
    notifications.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({ notifications });
  } catch (error: any) {
    console.error('获取系统通知失败:', error);
    console.error('错误详情:', error.message);
    res.status(500).json({ error: '获取系统通知失败', details: error.message });
  }
});

// 搜索消息
router.get('/search', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { q: query } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.json({ results: [] });
    }

    const searchTerm = `%${query.trim()}%`;

    // 搜索用户发送或接收的消息
    const results = db.prepare(`
      SELECT
        m.id,
        m.content,
        m.message_type,
        m.created_at,
        m.from_user_id,
        m.to_user_id,
        m.group_id,
        CASE
          WHEN m.group_id IS NOT NULL THEN 'group'
          ELSE 'friend'
        END as conversation_type,
        u_from.username as from_username,
        u_from.nickname as from_nickname,
        CASE
          WHEN m.group_id IS NOT NULL THEN g.name
          ELSE u_to.username
        END as other_username,
        CASE
          WHEN m.group_id IS NOT NULL THEN g.name
          ELSE u_to.nickname
        END as other_nickname,
        CASE
          WHEN m.group_id IS NOT NULL THEN m.group_id
          ELSE CASE
            WHEN m.from_user_id = ? THEN m.to_user_id
            ELSE m.from_user_id
          END
        END as other_user_id
      FROM messages m
      LEFT JOIN users u_from ON m.from_user_id = u_from.id
      LEFT JOIN users u_to ON m.to_user_id = u_to.id
      LEFT JOIN user_groups g ON m.group_id = g.id
      WHERE
        (m.from_user_id = ? OR m.to_user_id = ? OR m.group_id IN (
          SELECT gm.group_id FROM group_members gm
          WHERE gm.user_id = ?
        ))
        AND m.content LIKE ?
        AND m.is_deleted = 0
        AND m.is_recalled = 0
      ORDER BY m.created_at DESC
      LIMIT 50
    `).all(userId, userId, userId, userId, searchTerm);

    res.json({ results });
  } catch (error: any) {
    console.error('搜索消息失败:', error);
    res.status(500).json({ error: '搜索失败', details: error.message });
  }
});

// 设置对话静音/取消静音
router.put('/conversation/:type/:id/mute', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, id } = req.params;
    const { muted } = req.body; // true/false

    if (type !== 'friend' && type !== 'group') {
      return res.status(400).json({ error: '无效的对话类型' });
    }

    // 检查对话是否存在
    if (type === 'friend') {
      const friendship = db.prepare(`
        SELECT id FROM friendships
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
        LIMIT 1
      `).get(userId, id, id, userId) as any;

      if (!friendship) {
        return res.status(404).json({ error: '好友关系不存在' });
      }
    } else {
      const membership = db.prepare(`
        SELECT id FROM group_members
        WHERE group_id = ? AND user_id = ?
      `).get(id, userId) as any;

      if (!membership) {
        return res.status(404).json({ error: '您不是该群组的成员' });
      }
    }

    // 检查是否已有设置记录
    const existing = db.prepare(`
      SELECT id FROM user_conversation_settings
      WHERE user_id = ? AND conversation_type = ? AND conversation_id = ?
    `).get(userId, type, id) as any;

    if (existing) {
      // 更新现有记录
      db.prepare(`
        UPDATE user_conversation_settings
        SET is_muted = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(muted ? 1 : 0, existing.id);
    } else {
      // 创建新记录
      const settingId = uuidv4();
      db.prepare(`
        INSERT INTO user_conversation_settings (id, user_id, conversation_type, conversation_id, is_muted)
        VALUES (?, ?, ?, ?, ?)
      `).run(settingId, userId, type, id, muted ? 1 : 0);
    }

    res.json({ message: muted ? '已设置为静音' : '已取消静音' });
  } catch (error: any) {
    console.error('设置静音失败:', error);
    res.status(500).json({ error: '设置静音失败' });
  }
});

// 设置对话黑名单/取消黑名单
router.put('/conversation/:type/:id/block', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, id } = req.params;
    const { blocked } = req.body; // true/false

    if (type !== 'friend' && type !== 'group') {
      return res.status(400).json({ error: '无效的对话类型' });
    }

    // 检查对话是否存在
    if (type === 'friend') {
      const friendship = db.prepare(`
        SELECT id FROM friendships
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
        LIMIT 1
      `).get(userId, id, id, userId) as any;

      if (!friendship) {
        return res.status(404).json({ error: '好友关系不存在' });
      }
    } else {
      const membership = db.prepare(`
        SELECT id FROM group_members
        WHERE group_id = ? AND user_id = ?
      `).get(id, userId) as any;

      if (!membership) {
        return res.status(404).json({ error: '您不是该群组的成员' });
      }
    }

    // 检查是否已有设置记录
    const existing = db.prepare(`
      SELECT id FROM user_conversation_settings
      WHERE user_id = ? AND conversation_type = ? AND conversation_id = ?
    `).get(userId, type, id) as any;

    if (existing) {
      // 更新现有记录
      db.prepare(`
        UPDATE user_conversation_settings
        SET is_blocked = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(blocked ? 1 : 0, existing.id);
    } else {
      // 创建新记录
      const settingId = uuidv4();
      db.prepare(`
        INSERT INTO user_conversation_settings (id, user_id, conversation_type, conversation_id, is_blocked)
        VALUES (?, ?, ?, ?, ?)
      `).run(settingId, userId, type, id, blocked ? 1 : 0);
    }

    res.json({ message: blocked ? '已加入黑名单' : '已移出黑名单' });
  } catch (error: any) {
    console.error('设置黑名单失败:', error);
    res.status(500).json({ error: '设置黑名单失败' });
  }
});

// 设置对话显示名与备注（重命名，仅对当前用户生效）
router.put('/conversation/:type/:id/display', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, id } = req.params;
    let { display_name: displayName, remark } = req.body || {};

    if (type !== 'friend' && type !== 'group') {
      return res.status(400).json({ error: '无效的对话类型' });
    }
    displayName = (displayName === '' || displayName == null) ? null : (typeof displayName === 'string' ? displayName.trim() : String(displayName).trim());
    remark = (remark === '' || remark == null) ? null : (typeof remark === 'string' ? remark.trim() : String(remark).trim());
    if (displayName === '') displayName = null;
    if (remark === '') remark = null;

    if (type === 'friend') {
      const friendship = db.prepare(`
        SELECT id FROM friendships
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted' LIMIT 1
      `).get(userId, id, id, userId) as any;
      if (!friendship) {
        return res.status(404).json({ error: '好友关系不存在' });
      }
    } else {
      const membership = db.prepare(`
        SELECT id FROM group_members WHERE group_id = ? AND user_id = ?
      `).get(id, userId) as any;
      if (!membership) {
        return res.status(404).json({ error: '您不是该群组的成员' });
      }
    }

    const existing = db.prepare(`
      SELECT id FROM user_conversation_settings
      WHERE user_id = ? AND conversation_type = ? AND conversation_id = ?
    `).get(userId, type, id) as any;

    if (existing) {
      db.prepare(`
        UPDATE user_conversation_settings
        SET display_name = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(displayName, remark, existing.id);
    } else {
      const settingId = uuidv4();
      db.prepare(`
        INSERT INTO user_conversation_settings (id, user_id, conversation_type, conversation_id, is_muted, is_blocked, display_name, remark)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `).run(settingId, userId, type, id, displayName, remark);
    }

    res.json({ message: '已保存', display_name: displayName, remark });
  } catch (error: any) {
    console.error('设置对话显示名失败:', error);
    res.status(500).json({ error: '设置对话显示名失败' });
  }
});

// 获取对话设置
router.get('/conversation/:type/:id/settings', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, id } = req.params;

    if (type !== 'friend' && type !== 'group') {
      return res.status(400).json({ error: '无效的对话类型' });
    }

    const settings = db.prepare(`
      SELECT is_muted, is_blocked FROM user_conversation_settings
      WHERE user_id = ? AND conversation_type = ? AND conversation_id = ?
    `).get(userId, type, id) as any;

    res.json({
      is_muted: settings?.is_muted === 1 || false,
      is_blocked: settings?.is_blocked === 1 || false
    });
  } catch (error: any) {
    console.error('获取对话设置失败:', error);
    res.status(500).json({ error: '获取对话设置失败' });
  }
});

// 标记对话所有消息为已读（打开对话页面时调用）
router.put('/conversation/:type/:id/read-all', (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { type, id } = req.params;

    if (type === 'friend') {
      // 标记好友对话的所有消息为已读
      db.prepare(`
        UPDATE messages
        SET is_read = 1
        WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
        AND to_user_id = ?
        AND (group_id IS NULL OR group_id = '')
        AND is_read = 0
        AND (is_deleted = 0 OR is_deleted IS NULL)
      `).run(userId, id, id, userId, userId);
    } else {
      // 标记群组对话为已读：更新 user_group_read（群消息 to_user_id 恒为 NULL，无法用 messages.is_read）
      const latest = db.prepare(`
        SELECT created_at FROM messages
        WHERE group_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY created_at DESC LIMIT 1
      `).get(id) as { created_at: string } | undefined;
      const lastReadAt = latest?.created_at || new Date().toISOString();
      db.prepare(`
        INSERT INTO user_group_read (user_id, group_id, last_read_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id, group_id) DO UPDATE SET last_read_at = excluded.last_read_at
      `).run(userId, id, lastReadAt);
    }

    // 触发未读数更新事件
    res.json({ message: '已标记为已读' });
  } catch (error: any) {
    console.error('标记消息为已读失败:', error);
    res.status(500).json({ error: '标记消息为已读失败' });
  }
});

export default router;
