"use strict";
/**
 * @file shelf.ts
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
// 添加到书架
router.post('/add', auth_1.authenticateToken, async (req, res) => {
    try {
        const { bookId } = req.body;
        const userId = req.userId;
        if (!bookId) {
            return res.status(400).json({ error: '请提供书籍ID' });
        }
        // 检查书籍是否存在，并获取主书籍ID
        const book = db_1.db.prepare('SELECT id, parent_book_id FROM books WHERE id = ?').get(bookId);
        if (!book) {
            return res.status(404).json({ error: '书籍不存在' });
        }
        // 如果是子书籍（多格式书籍），使用主书籍ID
        const mainBookId = book.parent_book_id || book.id;
        // 检查主书籍是否已在书架中
        const existing = db_1.db
            .prepare('SELECT id FROM user_shelves WHERE user_id = ? AND book_id = ?')
            .get(userId, mainBookId);
        if (existing) {
            return res.status(400).json({ error: '书籍已在书架中' });
        }
        // 添加主书籍到书架
        const shelfId = (0, uuid_1.v4)();
        db_1.db.prepare('INSERT INTO user_shelves (id, user_id, book_id) VALUES (?, ?, ?)').run(shelfId, userId, mainBookId);
        res.status(201).json({ message: '已添加到书架' });
    }
    catch (error) {
        console.error('添加到书架错误:', error);
        res.status(500).json({ error: '添加失败' });
    }
});
// 从书架移除
router.delete('/remove/:bookId', auth_1.authenticateToken, async (req, res) => {
    try {
        const { bookId } = req.params;
        const userId = req.userId;
        db_1.db.prepare('DELETE FROM user_shelves WHERE user_id = ? AND book_id = ?').run(userId, bookId);
        res.json({ message: '已从书架移除' });
    }
    catch (error) {
        console.error('从书架移除错误:', error);
        res.status(500).json({ error: '移除失败' });
    }
});
// 获取我的书架
router.get('/my', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { sort = 'added_at', order = 'desc' } = req.query;
        // 排序字段映射
        const sortFieldMap = {
            'added_at': 's.added_at',
            'title': 'b.title',
            'author': 'b.author',
            'rating': 'b.rating',
            'created_at': 'b.created_at',
        };
        const sortField = sortFieldMap[sort] || 's.added_at';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
        const shelves = db_1.db
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
            .all(userId);
        // 对于MOBI格式的书籍，优先使用EPUB版本的封面
        const processedBooks = shelves.map((book) => {
            if (book.file_type && book.file_type.toLowerCase() === 'mobi') {
                // 查找EPUB格式的版本
                const epubBook = db_1.db.prepare('SELECT * FROM books WHERE parent_book_id = ? AND file_type = ?').get(book.id, 'epub');
                if (epubBook && epubBook.cover_url) {
                    // 使用EPUB版本的封面
                    book.cover_url = epubBook.cover_url;
                }
            }
            return book;
        });
        res.json({ books: processedBooks });
    }
    catch (error) {
        console.error('获取书架错误:', error);
        res.status(500).json({ error: '获取书架失败' });
    }
});
// 检查书籍是否在书架中
router.get('/check/:bookId', auth_1.authenticateToken, async (req, res) => {
    try {
        const { bookId } = req.params;
        const userId = req.userId;
        // 获取主书籍ID（如果是多格式书籍）
        const book = db_1.db.prepare('SELECT id, parent_book_id FROM books WHERE id = ?').get(bookId);
        const mainBookId = book?.parent_book_id || bookId;
        const existing = db_1.db
            .prepare('SELECT id FROM user_shelves WHERE user_id = ? AND book_id = ?')
            .get(userId, mainBookId);
        res.json({ inShelf: !!existing });
    }
    catch (error) {
        console.error('检查书架错误:', error);
        res.status(500).json({ error: '检查失败' });
    }
});
exports.default = router;
//# sourceMappingURL=shelf.js.map