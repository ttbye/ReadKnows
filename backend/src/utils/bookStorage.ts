/**
 * @file bookStorage.ts
 * @author ttbye
 * @date 2025-12-11
 */

import path from 'path';
import fs from 'fs';

/**
 * 清理文件名，移除非法字符
 */
export function sanitizeFileName(fileName: string): string {
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
export function generateBookPath(
  booksDir: string,
  title: string,
  author: string,
  category: string = '未分类',
  isPublic: boolean = false,
  username?: string
): string {
  const sanitizedCategory = sanitizeFileName(category || '未分类');
  const sanitizedAuthor = sanitizeFileName(author || '未知作者');
  const sanitizedTitle = sanitizeFileName(title || '未知标题');

  if (isPublic) {
    // 公开书籍: books/public/{category}/{author}/{title}/
    return path.join(booksDir, 'public', sanitizedCategory, sanitizedAuthor, sanitizedTitle);
  } else {
    // 私有书籍: books/user/{username}/{category}/{author}/{title}/
    const sanitizedUsername = sanitizeFileName(username || 'default');
    return path.join(booksDir, 'user', sanitizedUsername, sanitizedCategory, sanitizedAuthor, sanitizedTitle);
  }
}

/**
 * 生成书籍文件名
 * 格式: {title}.{ext}
 */
export function generateBookFileName(title: string, fileExt: string): string {
  const sanitizedTitle = sanitizeFileName(title || '未知标题');
  return `${sanitizedTitle}${fileExt}`;
}

/**
 * 确保目录存在
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 移动文件到新路径
 */
export function moveFile(oldPath: string, newPath: string): void {
  ensureDirectoryExists(path.dirname(newPath));
  fs.renameSync(oldPath, newPath);
}

/**
 * 复制文件到新路径
 */
export function copyFile(sourcePath: string, targetPath: string): void {
  ensureDirectoryExists(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

/**
 * 检查同一本书是否已存在（通过hash）
 */
export function findBookByHash(db: any, hash: string): any {
  return db.prepare('SELECT * FROM books WHERE file_hash = ?').get(hash);
}

/**
 * 查找同一本书的其他格式（通过title和author）
 */
export function findSameBookOtherFormats(
  db: any,
  title: string,
  author: string,
  excludeId?: string
): any[] {
  let query = 'SELECT * FROM books WHERE title = ? AND author = ?';
  const params: any[] = [title, author];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  return db.prepare(query).all(...params);
}

/**
 * 检查同一本书同格式是否已存在（通过title、author和file_type）
 */
export function findSameBookSameFormat(
  db: any,
  title: string,
  author: string,
  fileType: string,
  excludeId?: string
): any {
  let query = 'SELECT * FROM books WHERE title = ? AND author = ? AND file_type = ?';
  const params: any[] = [title, author, fileType];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  return db.prepare(query).get(...params);
}

/**
 * 查找一本书的所有格式（包括主书和子格式）
 */
export function findAllBookFormats(
  db: any,
  bookId: string
): any[] {
  // 首先查找当前书籍
  const currentBook = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId);
  if (!currentBook) return [];

  // 如果当前书有parent_book_id，则查找所有同一parent的书籍
  if (currentBook.parent_book_id) {
    return db.prepare('SELECT * FROM books WHERE parent_book_id = ? OR id = ? ORDER BY file_type').all(
      currentBook.parent_book_id,
      currentBook.parent_book_id
    );
  }

  // 否则，查找所有以当前书为parent的书籍
  const formats = db.prepare('SELECT * FROM books WHERE parent_book_id = ? OR id = ? ORDER BY file_type').all(
    bookId,
    bookId
  );

  return formats;
}

/**
 * 创建导入历史记录
 */
export function createImportHistory(
  db: any,
  userId: string,
  fileName: string,
  filePath: string | null,
  status: 'success' | 'skipped' | 'error',
  message: string,
  bookId?: string
): void {
  const { v4: uuidv4 } = require('uuid');
  db.prepare(`
    INSERT INTO import_history (id, user_id, file_name, file_path, status, message, book_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, fileName, filePath, status, message, bookId || null);
}

