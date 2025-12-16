/**
 * @file shelf.ts
 * @author ttbye
 * @date 2025-12-11
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 添加到书架
router.post('/add', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.userId!;

    if (!bookId) {
      return res.status(400).json({ error: '请提供书籍ID' });
    }

    // 检查书籍是否存在，并获取主书籍ID
    const book = db.prepare('SELECT id, parent_book_id FROM books WHERE id = ?').get(bookId) as any;
    if (!book) {
      return res.status(404).json({ error: '书籍不存在' });
    }

    // 如果是子书籍（多格式书籍），使用主书籍ID
    const mainBookId = book.parent_book_id || book.id;

    // 检查主书籍是否已在书架中
    const existing = db
      .prepare('SELECT id FROM user_shelves WHERE user_id = ? AND book_id = ?')
      .get(userId, mainBookId);

    if (existing) {
      return res.status(400).json({ error: '书籍已在书架中' });
    }

    // 添加主书籍到书架
    const shelfId = uuidv4();
    db.prepare(
      'INSERT INTO user_shelves (id, user_id, book_id) VALUES (?, ?, ?)'
    ).run(shelfId, userId, mainBookId);

    res.status(201).json({ message: '已添加到书架' });
  } catch (error: any) {
    console.error('添加到书架错误:', error);
    res.status(500).json({ error: '添加失败' });
  }
});

// 从书架移除
router.delete('/remove/:bookId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.userId!;

    db.prepare(
      'DELETE FROM user_shelves WHERE user_id = ? AND book_id = ?'
    ).run(userId, bookId);

    res.json({ message: '已从书架移除' });
  } catch (error: any) {
    console.error('从书架移除错误:', error);
    res.status(500).json({ error: '移除失败' });
  }
});

// 获取我的书架
router.get('/my', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { sort = 'added_at', order = 'desc' } = req.query;

    // 排序字段映射
    const sortFieldMap: { [key: string]: string } = {
      'added_at': 's.added_at',
      'title': 'b.title',
      'author': 'b.author',
      'rating': 'b.rating',
      'created_at': 'b.created_at',
    };

    const sortField = sortFieldMap[sort as string] || 's.added_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const shelves = db
      .prepare(`
        SELECT 
          s.id,
          s.added_at,
          b.*
        FROM user_shelves s
        JOIN books b ON s.book_id = b.id
        WHERE s.user_id = ? AND b.parent_book_id IS NULL
        ORDER BY ${sortField} ${sortOrder}
      `)
      .all(userId) as any[];

    // 对于MOBI格式的书籍，优先使用EPUB版本的封面
    const processedBooks = shelves.map((book: any) => {
      if (book.file_type && book.file_type.toLowerCase() === 'mobi') {
        // 查找EPUB格式的版本
        const epubBook = db.prepare('SELECT * FROM books WHERE parent_book_id = ? AND file_type = ?').get(book.id, 'epub') as any;
        if (epubBook && epubBook.cover_url) {
          // 使用EPUB版本的封面
          book.cover_url = epubBook.cover_url;
        }
      }
      return book;
    });

    res.json({ books: processedBooks });
  } catch (error: any) {
    console.error('获取书架错误:', error);
    res.status(500).json({ error: '获取书架失败' });
  }
});

// 检查书籍是否在书架中
router.get('/check/:bookId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.userId!;

    // 获取主书籍ID（如果是多格式书籍）
    const book = db.prepare('SELECT id, parent_book_id FROM books WHERE id = ?').get(bookId) as any;
    const mainBookId = book?.parent_book_id || bookId;

    const existing = db
      .prepare('SELECT id FROM user_shelves WHERE user_id = ? AND book_id = ?')
      .get(userId, mainBookId);

    res.json({ inShelf: !!existing });
  } catch (error: any) {
    console.error('检查书架错误:', error);
    res.status(500).json({ error: '检查失败' });
  }
});

export default router;

