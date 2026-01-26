#!/usr/bin/env node

/**
 * @file resetSystem.js
 * @author ttbye
 * @date 2025-12-11
 */

/**
 * 系统初始化脚本
 * 用于完全清除数据库和所有书籍文件
 * 
 * 使用方法：
 * node backend/scripts/resetSystem.js [options]
 * 
 * 选项：
 * --keep-books   只清除数据库，保留书籍文件
 * --books-only   只清除书籍文件，保留数据库
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 解析命令行参数
const args = process.argv.slice(2);
const keepBooks = args.includes('--keep-books');
const booksOnly = args.includes('--books-only');

// 数据库路径
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.db');
const possibleDbPaths = [
  dbPath,
  path.join(__dirname, '../data/database.db'),
  path.join(__dirname, '../database.db'),
  './data/database.db',
  './database.db',
];

// 书籍目录路径
const booksDir = process.env.BOOKS_DIR || path.join(__dirname, '../books');
const coversDir = path.join(__dirname, '../covers');

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          📚 KnowBooks 系统初始化脚本                      ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// 显示警告
console.log('⚠️  警告：此操作将执行以下操作：');
console.log('');

if (!booksOnly) {
  console.log('   🗑️  删除所有数据库记录');
  console.log('      - 用户数据');
  console.log('      - 书籍信息');
  console.log('      - 阅读进度');
  console.log('      - 书架信息');
  console.log('      - 导入历史');
}

if (!keepBooks && !booksOnly) {
  console.log('');
}

if (!keepBooks) {
  console.log('   🗑️  删除所有书籍文件');
  console.log('      - 公开书籍');
  console.log('      - 私人书籍');
  console.log('      - 封面图片');
}

console.log('');
console.log('   ⚠️  此操作不可恢复！');
console.log('');

// 询问确认
rl.question('❓ 确定要继续吗？ (输入 yes 确认): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('');
    console.log('❌ 操作已取消');
    console.log('');
    rl.close();
    return;
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('开始清理...');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  let deletedDbCount = 0;
  let deletedFilesCount = 0;
  let deletedDirsCount = 0;

  // 1. 清除数据库
  if (!booksOnly) {
    console.log('📊 步骤 1/2: 清除数据库');
    console.log('─────────────────────────────────────────────────────────');
    
    possibleDbPaths.forEach((dbFilePath) => {
      const absolutePath = path.isAbsolute(dbFilePath) 
        ? dbFilePath 
        : path.resolve(__dirname, '..', dbFilePath);
      
      if (fs.existsSync(absolutePath)) {
        try {
          const stats = fs.statSync(absolutePath);
          console.log(`   找到: ${absolutePath}`);
          console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
          
          fs.unlinkSync(absolutePath);
          console.log(`   ✅ 已删除`);
          console.log('');
          deletedDbCount++;
        } catch (error) {
          console.error(`   ❌ 删除失败: ${error.message}`);
          console.log('');
        }
      }
    });

    if (deletedDbCount === 0) {
      console.log('   ℹ️  未找到数据库文件');
      console.log('');
    }
  }

  // 2. 清除书籍文件
  if (!keepBooks) {
    console.log('📚 步骤 2/2: 清除书籍文件');
    console.log('─────────────────────────────────────────────────────────');
    
    // 删除函数
    const deleteDirectory = (dirPath, dirName) => {
      const absolutePath = path.isAbsolute(dirPath) 
        ? dirPath 
        : path.resolve(__dirname, '..', dirPath);
      
      if (fs.existsSync(absolutePath)) {
        try {
          console.log(`   正在清理: ${dirName}`);
          
          // 递归统计文件数
          const countFiles = (dir) => {
            let count = 0;
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const itemPath = path.join(dir, item);
              const stat = fs.statSync(itemPath);
              if (stat.isFile()) {
                count++;
              } else if (stat.isDirectory()) {
                count += countFiles(itemPath);
              }
            }
            return count;
          };
          
          const fileCount = countFiles(absolutePath);
          
          // 递归删除目录
          const deleteDirRecursive = (dir) => {
            if (fs.existsSync(dir)) {
              fs.readdirSync(dir).forEach((file) => {
                const curPath = path.join(dir, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                  deleteDirRecursive(curPath);
                } else {
                  fs.unlinkSync(curPath);
                }
              });
              fs.rmdirSync(dir);
            }
          };
          
          // 清空目录但保留目录本身
          const items = fs.readdirSync(absolutePath);
          items.forEach((item) => {
            const itemPath = path.join(absolutePath, item);
            if (fs.lstatSync(itemPath).isDirectory()) {
              deleteDirRecursive(itemPath);
            } else {
              fs.unlinkSync(itemPath);
            }
          });
          
          console.log(`   ✅ 已删除 ${fileCount} 个文件`);
          console.log('');
          deletedFilesCount += fileCount;
          deletedDirsCount++;
        } catch (error) {
          console.error(`   ❌ 清理失败: ${error.message}`);
          console.log('');
        }
      } else {
        console.log(`   ℹ️  目录不存在: ${dirName}`);
        console.log('');
      }
    };

    // 删除书籍目录
    deleteDirectory(booksDir, '书籍目录 (books/)');
    
    // 删除封面目录
    deleteDirectory(coversDir, '封面目录 (covers/)');
  }

  // 显示总结
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('清理完成！');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  
  if (!booksOnly) {
    console.log(`✅ 已删除 ${deletedDbCount} 个数据库文件`);
  }
  if (!keepBooks) {
    console.log(`✅ 已清理 ${deletedDirsCount} 个目录`);
    console.log(`✅ 已删除 ${deletedFilesCount} 个文件`);
  }
  
  console.log('');
  console.log('────────────────────────────────────────────────────────────');
  console.log('📋 后续步骤：');
  console.log('────────────────────────────────────────────────────────────');
  console.log('');
  console.log('1. 清除浏览器缓存：');
  console.log('   - 打开浏览器开发者工具 (F12)');
  console.log('   - Application → Storage');
  console.log('   - Clear site data');
  console.log('');
  console.log('2. 重新启动后端服务器：');
  console.log('   cd backend');
  console.log('   npm run dev');
  console.log('');
  console.log('3. 系统将自动创建新的数据库');
  console.log('');
  console.log('4. 首次登录会自动创建管理员账号：');
  console.log('   用户名: ttbye');
  console.log('   密码: admin123456');
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  rl.close();
});

