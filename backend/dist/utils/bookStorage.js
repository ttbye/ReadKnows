"use strict";
/**
 * @file bookStorage.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeFileName = sanitizeFileName;
exports.generateBookPath = generateBookPath;
exports.generateBookFileName = generateBookFileName;
exports.ensureDirectoryExists = ensureDirectoryExists;
exports.moveFile = moveFile;
exports.copyFile = copyFile;
exports.findBookByHash = findBookByHash;
exports.findSameBookOtherFormats = findSameBookOtherFormats;
exports.findSameBookSameFormat = findSameBookSameFormat;
exports.findAllBookFormats = findAllBookFormats;
exports.createImportHistory = createImportHistory;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * 清理文件名，移除非法字符
 */
function sanitizeFileName(fileName) {
    // 移除或替换非法字符
    return fileName
        .replace(/[<>:"/\\|?*]/g, '_') // 替换非法字符为下划线
        .replace(/\s+/g, ' ') // 多个空格合并为一个
        .trim();
}
/**
 * 根据书籍信息生成存储路径
 * 格式:
 * - 公开书籍: {booksDir}/public/{category}/{author}/{title}/
 * - 私有书籍: {booksDir}/user/{username}/{category}/{author}/{title}/
 */
function generateBookPath(booksDir, title, author, category = '未分类', isPublic = false, username) {
    const sanitizedCategory = sanitizeFileName(category || '未分类');
    const sanitizedAuthor = sanitizeFileName(author || '未知作者');
    const sanitizedTitle = sanitizeFileName(title || '未知标题');
    if (isPublic) {
        // 公开书籍: books/public/{category}/{author}/{title}/
        return path_1.default.join(booksDir, 'public', sanitizedCategory, sanitizedAuthor, sanitizedTitle);
    }
    else {
        // 私有书籍: books/user/{username}/{category}/{author}/{title}/
        const sanitizedUsername = sanitizeFileName(username || 'default');
        return path_1.default.join(booksDir, 'user', sanitizedUsername, sanitizedCategory, sanitizedAuthor, sanitizedTitle);
    }
}
/**
 * 生成书籍文件名
 * 格式: {title}.{ext}
 */
function generateBookFileName(title, fileExt) {
    const sanitizedTitle = sanitizeFileName(title || '未知标题');
    return `${sanitizedTitle}${fileExt}`;
}
/**
 * 确保目录存在
 */
function ensureDirectoryExists(dirPath) {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
}
/**
 * 移动文件到新路径
 */
function moveFile(oldPath, newPath) {
    ensureDirectoryExists(path_1.default.dirname(newPath));
    fs_1.default.renameSync(oldPath, newPath);
}
/**
 * 复制文件到新路径
 */
function copyFile(sourcePath, targetPath) {
    ensureDirectoryExists(path_1.default.dirname(targetPath));
    fs_1.default.copyFileSync(sourcePath, targetPath);
}
/**
 * 检查同一本书是否已存在（通过hash）
 */
function findBookByHash(db, hash) {
    return db.prepare('SELECT * FROM books WHERE file_hash = ?').get(hash);
}
/**
 * 查找同一本书的其他格式（通过title和author）
 */
function findSameBookOtherFormats(db, title, author, excludeId) {
    let query = 'SELECT * FROM books WHERE title = ? AND author = ?';
    const params = [title, author];
    if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
    }
    return db.prepare(query).all(...params);
}
/**
 * 检查同一本书同格式是否已存在（通过title、author和file_type）
 */
function findSameBookSameFormat(db, title, author, fileType, excludeId) {
    let query = 'SELECT * FROM books WHERE title = ? AND author = ? AND file_type = ?';
    const params = [title, author, fileType];
    if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
    }
    return db.prepare(query).get(...params);
}
/**
 * 查找一本书的所有格式（包括主书和子格式）
 */
function findAllBookFormats(db, bookId) {
    // 首先查找当前书籍
    const currentBook = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
    if (!currentBook)
        return [];
    // 如果当前书有parent_book_id，则查找所有同一parent的书籍
    if (currentBook.parent_book_id) {
        return db.prepare('SELECT * FROM books WHERE parent_book_id = ? OR id = ? ORDER BY file_type').all(currentBook.parent_book_id, currentBook.parent_book_id);
    }
    // 否则，查找所有以当前书为parent的书籍
    const formats = db.prepare('SELECT * FROM books WHERE parent_book_id = ? OR id = ? ORDER BY file_type').all(bookId, bookId);
    return formats;
}
/**
 * 创建导入历史记录
 */
function createImportHistory(db, userId, fileName, filePath, status, message, bookId) {
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`
    INSERT INTO import_history (id, user_id, file_name, file_path, status, message, book_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, fileName, filePath, status, message, bookId || null);
}
//# sourceMappingURL=bookStorage.js.map