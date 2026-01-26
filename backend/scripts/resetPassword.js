/**
 * @file resetPassword.js
 * @author ttbye
 * @date 2025-12-11
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
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

// 重置密码
async function resetPassword(username, newPassword) {
  try {
    // 检查用户是否存在
    const user = db
      .prepare('SELECT id, username, email FROM users WHERE username = ?')
      .get(username);

    if (!user) {
      console.error(`错误: 用户 "${username}" 不存在`);
      process.exit(1);
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?')
      .run(hashedPassword, username);

    console.log('========================================');
    console.log('密码重置成功！');
    console.log('========================================');
    console.log(`用户名: ${user.username}`);
    console.log(`邮箱: ${user.email}`);
    console.log(`新密码: ${newPassword}`);
    console.log('========================================');
    console.log('请妥善保管新密码！');
    console.log('========================================');
  } catch (error) {
    console.error('重置密码失败:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 主函数
(async () => {
  const args = process.argv.slice(2);
  const username = args[0] || 'ttbye';
  const password = args[1] || 'admin123456';

  if (!password) {
    console.error('错误: 请提供新密码');
    process.exit(1);
  }

  try {
    await resetPassword(username, password);
    process.exit(0);
  } catch (error) {
    console.error('重置失败:', error);
    process.exit(1);
  }
})();

