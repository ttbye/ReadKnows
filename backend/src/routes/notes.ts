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

    db.prepare(`
      INSERT INTO notes (
        id, user_id, book_id, content, position, 
        page_number, chapter_index, selected_text,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      noteId,
      userId,
      bookId && bookId.trim() ? bookId.trim() : null,
      content.trim(),
      position || null,
      pageNumber || null,
      chapterIndex || null,
      selectedText || null,
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
    const existingNote = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!existingNote) {
      return res.status(404).json({ error: '笔记不存在或无权限' });
    }

    const now = getCurrentUTCTime();

    db.prepare(`
      UPDATE notes
      SET content = ?,
          position = ?,
          page_number = ?,
          chapter_index = ?,
          selected_text = ?,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      content,
      position || null,
      pageNumber || null,
      chapterIndex || null,
      selectedText || null,
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

// 获取书籍的所有笔记
router.get('/book/:bookId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bookId } = req.params;

    const notes = db.prepare(`
      SELECT 
        n.id,
        n.book_id,
        n.content,
        n.position,
        n.page_number,
        n.chapter_index,
        n.selected_text,
        n.created_at,
        n.updated_at
      FROM notes n
      WHERE n.user_id = ? AND n.book_id = ?
      ORDER BY n.page_number ASC, n.chapter_index ASC, n.created_at ASC
    `).all(userId, bookId) as any[];

    res.json({ notes });
  } catch (error: any) {
    console.error('获取书籍笔记失败:', error);
    res.status(500).json({ error: '获取书籍笔记失败' });
  }
});

export default router;

