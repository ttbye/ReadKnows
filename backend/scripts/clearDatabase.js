#!/usr/bin/env node

/**
 * @file clearDatabase.js
 * @author ttbye
 * @date 2025-12-11
 */

/**
 * 清除数据库脚本
 * 用于完全清除数据库文件
 */

const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.db');
const dbDir = path.dirname(dbPath);

// 可能的数据库文件位置
const possibleDbPaths = [
  dbPath,
  path.join(__dirname, '../data/database.db'),
  path.join(__dirname, '../database.db'),
  './data/database.db',
  './database.db',
];

console.log('========================================');
console.log('清除数据库脚本');
console.log('========================================');
console.log('');

// 查找并删除所有可能的数据库文件
let deletedCount = 0;
possibleDbPaths.forEach((dbFilePath) => {
  const absolutePath = path.isAbsolute(dbFilePath) 
    ? dbFilePath 
    : path.resolve(__dirname, '..', dbFilePath);
  
  if (fs.existsSync(absolutePath)) {
    try {
      const stats = fs.statSync(absolutePath);
      console.log(`找到数据库文件: ${absolutePath}`);
      console.log(`  大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
      fs.unlinkSync(absolutePath);
      console.log(`  ✓ 已删除`);
      deletedCount++;
    } catch (error) {
      console.error(`  ✗ 删除失败: ${error.message}`);
    }
  }
});

console.log('');
if (deletedCount > 0) {
  console.log(`成功删除 ${deletedCount} 个数据库文件`);
} else {
  console.log('未找到数据库文件');
}

console.log('');
console.log('========================================');
console.log('重要提示：');
console.log('========================================');
console.log('1. 请清除浏览器缓存（LocalStorage、IndexedDB）');
console.log('2. 重新启动后端服务器');
console.log('3. 服务器启动时会自动创建新的空数据库');
console.log('========================================');

