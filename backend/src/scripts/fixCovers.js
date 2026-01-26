/**
 * @file fixCovers.js
 * @author ttbye
 * @date 2025-12-11
 * @description 修复已导入书籍的封面
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 动态导入ES模块
async function main() {
  const db = new Database('./data/database.db');
  
  console.log('========================================');
  console.log('书籍封面修复工具');
  console.log('========================================');
  console.log('');
  
  // 查找需要修复的书籍
  const booksToFix = db.prepare(`
    SELECT id, title, author, cover_url, file_path, file_type
    FROM books
    WHERE cover_url IS NULL 
       OR cover_url = 'cover' 
       OR cover_url = 'pdf-cover'
    ORDER BY created_at DESC
  `).all();
  
  if (booksToFix.length === 0) {
    console.log('✅ 没有需要修复的书籍');
    db.close();
    return;
  }
  
  console.log(`找到 ${booksToFix.length} 本书籍需要修复封面\n`);
  
  // 动态导入工具函数
  const { extractEpubMetadata } = await import('../dist/utils/epubParser.js');
  const { extractPdfCover } = await import('../dist/utils/pdfCoverExtractor.js');
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  
  for (const book of booksToFix) {
    console.log(`\n处理: ${book.title} (${book.author})`);
    console.log(`  ID: ${book.id}`);
    console.log(`  类型: ${book.file_type}`);
    console.log(`  当前封面URL: ${book.cover_url || '无'}`);
    
    try {
      // 检查文件是否存在
      if (!fs.existsSync(book.file_path)) {
        console.log('  ❌ 文件不存在，跳过');
        skipCount++;
        continue;
      }
      
      // 获取书籍目录
      const bookDir = path.dirname(book.file_path);
      console.log(`  书籍目录: ${bookDir}`);
      
      let newCoverUrl = null;
      
      if (book.file_type === 'epub') {
        console.log('  提取EPUB封面...');
        const metadata = await extractEpubMetadata(book.file_path, bookDir);
        if (metadata.cover_url && metadata.cover_url !== 'cover') {
          newCoverUrl = metadata.cover_url;
          console.log(`  ✅ EPUB封面提取成功: ${newCoverUrl}`);
        } else {
          console.log('  ⚠️  EPUB中未找到封面');
          skipCount++;
          continue;
        }
      } else if (book.file_type === 'pdf') {
        console.log('  提取PDF封面...');
        newCoverUrl = await extractPdfCover(book.file_path, bookDir);
        if (newCoverUrl) {
          console.log(`  ✅ PDF封面提取成功: ${newCoverUrl}`);
        } else {
          console.log('  ⚠️  PDF封面提取失败');
          skipCount++;
          continue;
        }
      } else {
        console.log(`  ⚠️  不支持的文件类型: ${book.file_type}`);
        skipCount++;
        continue;
      }
      
      // 更新数据库
      if (newCoverUrl) {
        db.prepare('UPDATE books SET cover_url = ? WHERE id = ?')
          .run(newCoverUrl, book.id);
        console.log('  ✅ 数据库已更新');
        successCount++;
      }
    } catch (error) {
      console.error(`  ❌ 处理失败: ${error.message}`);
      failCount++;
    }
  }
  
  console.log('\n========================================');
  console.log('修复完成');
  console.log('========================================');
  console.log(`成功: ${successCount} 本`);
  console.log(`跳过: ${skipCount} 本`);
  console.log(`失败: ${failCount} 本`);
  console.log('');
  
  db.close();
}

main().catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});
