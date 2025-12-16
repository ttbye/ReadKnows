/**
 * @file initAdmin.js
 * @author ttbye
 * @date 2025-12-11
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// 获取数据库路径
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.db');
const dbDir = path.dirname(dbPath);

// 确保目录存在
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 连接数据库
const db = new Database(dbPath);

// 初始化数据库表（如果不存在）
function initTables() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 检查是否有role字段
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasRole = tableInfo.some((col) => col.name === 'role');
    if (!hasRole) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      console.log('已添加 role 字段');
    }
  } catch (e) {
    // 忽略错误
  }
}

// 初始化管理员
async function initAdmin(username, email, password) {
  try {
    initTables();
    
    // 检查用户是否已存在
    const existingUser = db
      .prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?')
      .get(username, email);

    if (existingUser) {
      // 如果用户已存在，更新为管理员
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingUser.id);
      console.log('========================================');
      console.log(`用户 "${existingUser.username}" 已存在，已更新为管理员`);
      console.log('========================================');
      console.log(`用户名: ${existingUser.username}`);
      console.log(`邮箱: ${existingUser.email}`);
      console.log('========================================');
      return;
    }

    // 创建新管理员账号
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.prepare(
      'INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, username, email, hashedPassword, 'admin');

    console.log('========================================');
    console.log('默认管理员账号创建成功！');
    console.log('========================================');
    console.log(`用户名: ${username}`);
    console.log(`邮箱: ${email}`);
    console.log(`密码: ${password}`);
    console.log('========================================');
    console.log('请妥善保管密码，首次登录后请及时修改！');
    console.log('========================================');
  } catch (error) {
    console.error('初始化管理员账号失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 主函数
(async () => {
  const args = process.argv.slice(2);
  const username = args[0] || 'ttbye';
  const email = args[1] || 'ttbye@example.com';
  const password = args[2] || 'admin123456';

  try {
    await initAdmin(username, email, password);
    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  }
})();

