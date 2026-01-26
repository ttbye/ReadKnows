#!/usr/bin/env tsx

/**
 * 数据迁移脚本：更新数据库中的书籍文件路径
 * 将旧路径（如 ./books 或绝对路径指向旧 books 目录）更新为新路径（./data/books）
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 获取项目根目录
const projectRoot = path.resolve(__dirname, '..', '..');
const dbPath = path.join(projectRoot, 'data', 'database.db');

// 旧路径模式（需要迁移的路径）
const oldBooksDirPatterns = [
  path.join(projectRoot, 'books'),
  path.resolve(projectRoot, 'books'),
  './books',
  'books',
];

// 新路径（目标路径）
const newBooksDir = path.join(projectRoot, 'data', 'books');

console.log('📦 开始迁移书籍文件路径...');
console.log('数据库路径:', dbPath);
console.log('新书籍目录:', newBooksDir);
console.log('');

// 检查数据库是否存在
if (!fs.existsSync(dbPath)) {
  console.error('❌ 数据库文件不存在:', dbPath);
  process.exit(1);
}

// 打开数据库
const db = new Database(dbPath);

try {
  // 获取所有书籍
  const books = db.prepare('SELECT id, title, file_path FROM books').all() as Array<{
    id: string;
    title: string;
    file_path: string;
  }>;

  console.log(`📚 找到 ${books.length} 本书籍`);
  console.log('');

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];

  // 准备更新语句
  const updateStmt = db.prepare('UPDATE books SET file_path = ? WHERE id = ?');

  // 开始事务
  const updateBook = db.transaction((bookId: string, newPath: string) => {
    updateStmt.run(newPath, bookId);
  });

  for (const book of books) {
    const oldPath = book.file_path;
    let newPath: string | null = null;

    try {
      // 1. 如果是绝对路径，检查是否指向旧的 books 目录
      if (path.isAbsolute(oldPath)) {
        // 检查是否在旧的 books 目录下
        for (const oldBooksDir of oldBooksDirPatterns) {
          const resolvedOldDir = path.resolve(oldBooksDir);
          if (oldPath.startsWith(resolvedOldDir)) {
            // 计算相对路径（相对于旧 books 目录）
            const relativePath = path.relative(resolvedOldDir, oldPath);
            // 构建新路径
            newPath = path.join(newBooksDir, relativePath).replace(/\\/g, '/');
            break;
          }
        }

        // 如果已经在新的 data/books 目录下，跳过
        if (!newPath && oldPath.startsWith(newBooksDir)) {
          skippedCount++;
          continue;
        }

        // 如果不在任何已知的旧目录下，检查文件是否存在
        if (!newPath) {
          if (fs.existsSync(oldPath)) {
            // 文件存在，可能是用户自定义路径，跳过
            skippedCount++;
            continue;
          } else {
            // 文件不存在，尝试在新路径查找
            const fileName = path.basename(oldPath);
            const possibleNewPath = path.join(newBooksDir, fileName);
            if (fs.existsSync(possibleNewPath)) {
              newPath = possibleNewPath.replace(/\\/g, '/');
            }
          }
        }
      }
      // 2. 如果是相对路径
      else {
        // 检查是否以 'books/' 开头
        if (oldPath.startsWith('books/') || oldPath.startsWith('./books/')) {
          // 提取相对路径部分
          const relativePath = oldPath.replace(/^(\.\/)?books\//, '');
          newPath = path.join(newBooksDir, relativePath).replace(/\\/g, '/');
        }
        // 如果已经是 'data/books/' 开头，跳过
        else if (oldPath.startsWith('data/books/')) {
          skippedCount++;
          continue;
        }
        // 其他情况，尝试在新路径查找
        else {
          const possibleNewPath = path.join(newBooksDir, oldPath);
          if (fs.existsSync(possibleNewPath)) {
            newPath = possibleNewPath.replace(/\\/g, '/');
          }
        }
      }

      // 如果找到了新路径，检查文件是否存在
      if (newPath) {
        // 确保路径使用正斜杠（跨平台兼容）
        newPath = newPath.replace(/\\/g, '/');

        // 检查文件是否存在
        if (fs.existsSync(newPath)) {
          updateBook(book.id, newPath);
          updatedCount++;
          console.log(`✅ [${book.title}] ${oldPath} -> ${newPath}`);
        } else {
          // 文件不存在，尝试查找同名文件
          const fileName = path.basename(oldPath);
          const searchDir = newBooksDir;
          
          // 递归查找文件
          function findFile(dir: string, targetName: string): string | null {
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  const found = findFile(fullPath, targetName);
                  if (found) return found;
                } else if (entry.name === targetName) {
                  return fullPath;
                }
              }
            } catch (e) {
              // 忽略错误
            }
            return null;
          }

          const foundPath = findFile(searchDir, fileName);
          if (foundPath) {
            const normalizedPath = foundPath.replace(/\\/g, '/');
            updateBook(book.id, normalizedPath);
            updatedCount++;
            console.log(`✅ [${book.title}] ${oldPath} -> ${normalizedPath} (自动查找)`);
          } else {
            errorCount++;
            errors.push({
              id: book.id,
              title: book.title,
              error: `文件不存在: ${newPath}`,
            });
            console.log(`❌ [${book.title}] 文件不存在: ${oldPath} -> ${newPath}`);
          }
        }
      } else {
        // 无法确定新路径，检查旧路径是否存在
        if (fs.existsSync(oldPath)) {
          skippedCount++;
          console.log(`⏭️  [${book.title}] 跳过（路径有效）: ${oldPath}`);
        } else {
          errorCount++;
          errors.push({
            id: book.id,
            title: book.title,
            error: `无法确定新路径，且旧路径不存在`,
          });
          console.log(`❌ [${book.title}] 无法迁移: ${oldPath}`);
        }
      }
    } catch (error: any) {
      errorCount++;
      errors.push({
        id: book.id,
        title: book.title,
        error: error.message,
      });
      console.error(`❌ [${book.title}] 迁移失败:`, error.message);
    }
  }

  console.log('');
  console.log('========================================');
  console.log('📊 迁移结果:');
  console.log(`  ✅ 成功更新: ${updatedCount} 本`);
  console.log(`  ⏭️  跳过: ${skippedCount} 本`);
  console.log(`  ❌ 失败: ${errorCount} 本`);
  console.log('========================================');

  if (errors.length > 0) {
    console.log('');
    console.log('❌ 失败的书籍:');
    errors.forEach((err) => {
      console.log(`  - [${err.title}] (ID: ${err.id}): ${err.error}`);
    });
    console.log('');
    console.log('💡 提示: 请检查这些书籍的文件是否已手动移动，或需要重新导入');
  }

  if (updatedCount > 0) {
    console.log('');
    console.log('✅ 路径迁移完成！建议重启后端服务以确保更改生效。');
  }
} catch (error: any) {
  console.error('❌ 迁移过程出错:', error);
  process.exit(1);
} finally {
  db.close();
}
