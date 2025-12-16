"use strict";
/**
 * @file notes.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// 获取当前 UTC 时间的 ISO 8601 格式字符串
const getCurrentUTCTime = () => new Date().toISOString();
// 获取用户的所有笔记
router.get('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
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
        const params = [userId];
        if (bookId) {
            query += ' AND n.book_id = ?';
            params.push(bookId);
        }
        query += ' ORDER BY n.created_at DESC';
        const notes = db_1.db.prepare(query).all(...params);
        res.json({ notes });
    }
    catch (error) {
        console.error('获取笔记失败:', error);
        res.status(500).json({ error: '获取笔记失败' });
    }
});
// 获取单条笔记
router.get('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const note = db_1.db.prepare(`
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
    `).get(id, userId);
        if (!note) {
            return res.status(404).json({ error: '笔记不存在' });
        }
        res.json({ note });
    }
    catch (error) {
        console.error('获取笔记失败:', error);
        res.status(500).json({ error: '获取笔记失败' });
    }
});
// 创建笔记
router.post('/', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId, content, position, pageNumber, chapterIndex, selectedText } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ error: '请提供笔记内容' });
        }
        // 如果提供了bookId，验证书籍是否存在
        if (bookId && bookId.trim()) {
            const book = db_1.db.prepare('SELECT id FROM books WHERE id = ?').get(bookId.trim());
            if (!book) {
                return res.status(400).json({ error: '书籍不存在' });
            }
        }
        const noteId = (0, uuid_1.v4)();
        const now = getCurrentUTCTime();
        db_1.db.prepare(`
      INSERT INTO notes (
        id, user_id, book_id, content, position, 
        page_number, chapter_index, selected_text,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(noteId, userId, bookId && bookId.trim() ? bookId.trim() : null, content.trim(), position || null, pageNumber || null, chapterIndex || null, selectedText || null, now, now);
        // 获取创建的笔记（包含书籍信息）
        const note = db_1.db.prepare(`
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
    `).get(noteId);
        res.status(201).json({ note });
    }
    catch (error) {
        console.error('创建笔记失败:', error);
        res.status(500).json({ error: '创建笔记失败' });
    }
});
// 更新笔记
router.put('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { content, position, pageNumber, chapterIndex, selectedText } = req.body;
        if (!content) {
            return res.status(400).json({ error: '请提供笔记内容' });
        }
        // 检查笔记是否存在且属于当前用户
        const existingNote = db_1.db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
        if (!existingNote) {
            return res.status(404).json({ error: '笔记不存在或无权限' });
        }
        const now = getCurrentUTCTime();
        db_1.db.prepare(`
      UPDATE notes
      SET content = ?,
          position = ?,
          page_number = ?,
          chapter_index = ?,
          selected_text = ?,
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(content, position || null, pageNumber || null, chapterIndex || null, selectedText || null, now, id, userId);
        // 获取更新后的笔记（包含书籍信息）
        const note = db_1.db.prepare(`
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
    `).get(id);
        res.json({ note });
    }
    catch (error) {
        console.error('更新笔记失败:', error);
        res.status(500).json({ error: '更新笔记失败' });
    }
});
// 删除笔记
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        // 检查笔记是否存在且属于当前用户
        const note = db_1.db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(id, userId);
        if (!note) {
            return res.status(404).json({ error: '笔记不存在或无权限' });
        }
        db_1.db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
        res.json({ message: '笔记已删除' });
    }
    catch (error) {
        console.error('删除笔记失败:', error);
        res.status(500).json({ error: '删除笔记失败' });
    }
});
// 获取书籍的所有笔记
router.get('/book/:bookId', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bookId } = req.params;
        const notes = db_1.db.prepare(`
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
    `).all(userId, bookId);
        res.json({ notes });
    }
    catch (error) {
        console.error('获取书籍笔记失败:', error);
        res.status(500).json({ error: '获取书籍笔记失败' });
    }
});
exports.default = router;
//# sourceMappingURL=notes.js.map