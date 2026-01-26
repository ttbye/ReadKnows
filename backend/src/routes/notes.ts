/**
 * @file notes.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 获取当前 UTC 时间的 ISO 8601 格式字符串
const getCurrentUTCTime = () => new Date().toISOString();

// 获取用户的所有笔记
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.query;

    let query = `
      SELECT 
        n.id,
        n.book_id,
        n.content,
        n.position,
        n.page_number,
        n.chapter_index,
        n.selected_text,
        n.created_at,
        n.updated_at,
        b.title as book_title,
        b.author as book_author,
        b.cover_url as book_cover_url
      FROM notes n
      LEFT JOIN books b ON n.book_id = b.id
      WHERE n.user_id = ?
    `;

    const params: any[] = [userId];

    if (bookId) {
      query += ' AND n.book_id = ?';
      params.push(bookId as string);
    }

    query += ' ORDER BY n.created_at DESC';

    const notes = db.prepare(query).all(...params) as any[];

    res.json({ notes });
  } catch (error: any) {
    console.error('获取笔记失败:', error);
    res.status(500).json({ error: '获取笔记失败' });
  }
});

// 获取单条笔记
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const note = db.prepare(`
      SELECT 
        n.id,
        n.book_id,
        n.content,
        n.position,
        n.page_number,
        n.chapter_index,
        n.selected_text,
        n.created_at,
        n.updated_at,
        b.title as book_title,
        b.author as book_author,
        b.cover_url as book_cover_url
      FROM notes n
      LEFT JOIN books b ON n.book_id = b.id
      WHERE n.id = ? AND n.user_id = ?
    `).get(id, userId) as any;

    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    res.json({ note });
  } catch (error: any) {
    console.error('获取笔记失败:', error);
    res.status(500).json({ error: '获取笔记失败' });
  }
});

// 创建笔记
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId, content, position, pageNumber, chapterIndex, selectedText } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '请提供笔记内容' });
    }

    // 如果提供了bookId，验证书籍是否存在
    if (bookId && bookId.trim()) {
      const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId.trim()) as any;
    if (!book) {
      return res.status(400).json({ error: '书籍不存在' });
      }
    }

    const noteId = uuidv4();
    const now = getCurrentUTCTime();

    // 获取可见性设置（从请求体）
    const { isPublic = false, shareToGroupId = null } = req.body;

    db.prepare(`
      INSERT INTO notes (
        id, user_id, book_id, content, position, 
        page_number, chapter_index, selected_text,
        is_public, share_to_group_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      noteId,
      userId,
      bookId && bookId.trim() ? bookId.trim() : null,
      content.trim(),
      position || null,
      pageNumber || null,
      chapterIndex || null,
      selectedText || null,
      isPublic ? 1 : 0,
      shareToGroupId || null,
      now,
      now
    );

    // 获取创建的笔记（包含书籍信息）
    const note = db.prepare(`
      SELECT 
        n.id,
        n.book_id,
        n.content,
        n.position,
        n.page_number,
        n.chapter_index,
        n.selected_text,
        n.created_at,
        n.updated_at,
        b.title as book_title,
        b.author as book_author,
        b.cover_url as book_cover_url
      FROM notes n
      LEFT JOIN books b ON n.book_id = b.id
      WHERE n.id = ?
    `).get(noteId) as any;

    res.status(201).json({ note });
  } catch (error: any) {
    console.error('创建笔记失败:', error);
    res.status(500).json({ error: '创建笔记失败' });
  }
});

// 更新笔记
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { content, position, pageNumber, chapterIndex, selectedText } = req.body;

    if (!content) {
      return res.status(400).json({ error: '请提供笔记内容' });
    }

    // 检查笔记是否存在且属于当前用户
    const existingNoteCheck = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existingNoteCheck) {
      return res.status(404).json({ error: '笔记不存在或无权限' });
    }

    const now = getCurrentUTCTime();

    // 获取可见性设置（从请求体，如果未提供则保持原值）
    const { isPublic, shareToGroupId } = req.body;
    const existingNote = db.prepare('SELECT is_public, share_to_group_id FROM notes WHERE id = ? AND user_id = ?').get(id, userId) as any;
    
    const finalIsPublic = isPublic !== undefined ? (isPublic ? 1 : 0) : (existingNote?.is_public || 0);
    const finalShareToGroupId = shareToGroupId !== undefined ? shareToGroupId : (existingNote?.share_to_group_id || null);

    db.prepare(`
      UPDATE notes
      SET content = ?,
          position = ?,
          page_number = ?,
          chapter_index = ?,
          selected_text = ?,
          is_public = ?,
          share_to_group_id = ?,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      content,
      position || null,
      pageNumber || null,
      chapterIndex || null,
      selectedText || null,
      finalIsPublic,
      finalShareToGroupId,
      now,
      id,
      userId
    );

    // 获取更新后的笔记（包含书籍信息）
    const note = db.prepare(`
      SELECT 
        n.id,
        n.book_id,
        n.content,
        n.position,
        n.page_number,
        n.chapter_index,
        n.selected_text,
        n.created_at,
        n.updated_at,
        b.title as book_title,
        b.author as book_author,
        b.cover_url as book_cover_url
      FROM notes n
      LEFT JOIN books b ON n.book_id = b.id
      WHERE n.id = ?
    `).get(id) as any;

    res.json({ note });
  } catch (error: any) {
    console.error('更新笔记失败:', error);
    res.status(500).json({ error: '更新笔记失败' });
  }
});

// 删除笔记
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // 检查笔记是否存在且属于当前用户
    const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!note) {
      return res.status(404).json({ error: '笔记不存在或无权限' });
    }

    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);

    res.json({ message: '笔记已删除' });
  } catch (error: any) {
    console.error('删除笔记失败:', error);
    res.status(500).json({ error: '删除笔记失败' });
  }
});

// 获取书籍的所有笔记（包括自己的、公开的、群组共享的）
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
    // 如果书籍共享到群组，该群组的所有成员都应该能看到笔记
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

    // 构建查询：获取自己的笔记、公开的笔记、以及群组共享的笔记
    let query = `
      SELECT 
        n.id,
        n.user_id,
        n.book_id,
        n.content,
        n.position,
        n.page_number,
        n.chapter_index,
        n.selected_text,
        n.is_public,
        n.share_to_group_id,
        n.created_at,
        n.updated_at,
        u.username,
        u.nickname
      FROM notes n
      INNER JOIN users u ON n.user_id = u.id
      WHERE n.book_id = ?
        AND (
          n.user_id = ?
          OR n.is_public = 1
          ${allGroupIds.length > 0 ? `OR (n.share_to_group_id IS NOT NULL AND n.share_to_group_id != '' AND n.share_to_group_id IN (${allGroupIds.map(() => '?').join(',')}))` : ''}
        )
      ORDER BY n.page_number ASC, n.chapter_index ASC, n.created_at ASC
    `;

    const params: any[] = [bookId, userId];
    if (allGroupIds.length > 0) {
      params.push(...allGroupIds);
    }

    const notes = db.prepare(query).all(...params) as any[];
    
    // 调试日志
    if (process.env.NODE_ENV === 'development') {
      console.log(`获取书籍 ${bookId} 的笔记:`, {
        userId,
        userGroups: groupIds,
        bookGroups: bookGroupIds,
        allGroups: allGroupIds,
        notesCount: notes.length,
        notesWithGroupShare: notes.filter(n => n.share_to_group_id).length,
        notesDetails: notes.map(n => ({
          id: n.id,
          userId: n.user_id,
          shareToGroupId: n.share_to_group_id,
          isPublic: n.is_public
        }))
      });
    }

    res.json({ notes });
  } catch (error: any) {
    console.error('获取书籍笔记失败:', error);
    res.status(500).json({ error: '获取书籍笔记失败' });
  }
});

// 批量更新书籍笔记的群组共享设置
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
      return res.status(403).json({ error: '您没有权限操作此书籍的笔记' });
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

    // 更新该书籍的所有笔记的群组共享设置
    const result = db.prepare(`
      UPDATE notes 
      SET share_to_group_id = ?
      WHERE book_id = ? AND user_id = ?
    `).run(groupId || null, bookId, userId);

    res.json({ 
      message: '笔记群组共享设置已更新',
      updatedCount: result.changes || 0
    });
  } catch (error: any) {
    console.error('批量更新笔记群组共享失败:', error);
    res.status(500).json({ error: '批量更新笔记群组共享失败' });
  }
});

export default router;

