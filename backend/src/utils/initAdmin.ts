/**
 * @file initAdmin.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { db } from '../db';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * 初始化默认管理员账号
 * @param username 用户名，默认为 'ttbye'
 * @param email 邮箱
 * @param password 密码
 */
export async function initAdmin(
  username: string = 'ttbye',
  email: string = 'ttbye@example.com',
  password: string = 'admin123456'
): Promise<void> {
  try {
    // 检查用户是否已存在
    const existingUser = db
      .prepare('SELECT id, username, email FROM users WHERE username = ? OR email = ?')
      .get(username, email) as any;

    if (existingUser) {
      // 如果用户已存在，更新为管理员
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingUser.id);
      console.log(`用户 "${existingUser.username}" 已存在，已更新为管理员`);
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
  } catch (error: any) {
    console.error('初始化管理员账号失败:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (require.main === module) {
  (async () => {
    try {
      // 确保数据库已初始化
      const dbModule = await import('../db');
      await dbModule.initDatabase();
      
      const args = process.argv.slice(2);
      const username = args[0] || 'ttbye';
      const email = args[1] || 'ttbye@example.com';
      const password = args[2] || 'admin123456';

      await initAdmin(username, email, password);
      process.exit(0);
    } catch (error) {
      console.error('初始化失败:', error);
      process.exit(1);
    }
  })();
}

