/**
 * 修复 messages 表的 to_user_id NOT NULL 约束
 * 这个脚本会重建表以移除 to_user_id 的 NOT NULL 约束，支持群组消息
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/database.db');
const db = new Database(dbPath);

console.log('开始修复 messages 表的 to_user_id NOT NULL 约束...');

try {
  // 检查当前约束
  const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
  const toUserIdInfo = tableInfo.find((col) => col.name === 'to_user_id');
  
  console.log('当前 to_user_id 约束:', {
    notnull: toUserIdInfo?.notnull,
    type: toUserIdInfo?.type
  });
  
  if (!toUserIdInfo || toUserIdInfo.notnull === 0) {
    console.log('✓ to_user_id 约束正常，无需修复');
    process.exit(0);
  }
  
  console.log('⚠️  检测到 to_user_id 有 NOT NULL 约束，开始修复...');
  
  // 开始事务
  db.exec('BEGIN TRANSACTION');
  
  try {
    // 清理可能存在的残留表
    db.exec('DROP TABLE IF EXISTS messages_new');
    
    // 创建新表（不带 NOT NULL 约束）
    db.exec(`
      CREATE TABLE messages_new (
        id TEXT PRIMARY KEY,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT,
        group_id TEXT,
        message_type TEXT DEFAULT 'text',
        content TEXT,
        file_path TEXT,
        file_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        book_id TEXT,
        book_title TEXT,
        is_read INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        is_recalled INTEGER DEFAULT 0,
        reply_to_message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
        CHECK ((to_user_id IS NOT NULL AND group_id IS NULL) OR (to_user_id IS NULL AND group_id IS NOT NULL))
      )
    `);
    
    // 获取所有列名（按顺序）
    const existingColumns = tableInfo.map(col => col.name);
    const columns = existingColumns.join(', ');
    
    console.log('复制数据，列:', columns);
    
    // 复制数据
    const rowCount = db.prepare(`SELECT COUNT(*) as count FROM messages`).get() as any;
    console.log(`准备复制 ${rowCount.count} 条消息...`);
    
    db.exec(`
      INSERT INTO messages_new (${columns})
      SELECT ${columns} FROM messages
    `);
    
    console.log('✓ 数据复制完成');
    
    // 删除旧表
    db.exec('DROP TABLE messages');
    console.log('✓ 旧表已删除');
    
    // 重命名新表
    db.exec('ALTER TABLE messages_new RENAME TO messages');
    console.log('✓ 新表已重命名');
    
    // 重新创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    `);
    console.log('✓ 索引已重新创建');
    
    // 提交事务
    db.exec('COMMIT');
    
    // 验证修复是否成功
    const verifyTableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
    const verifyToUserId = verifyTableInfo.find((col) => col.name === 'to_user_id');
    
    if (verifyToUserId && verifyToUserId.notnull === 0) {
      console.log('✓ 已成功修复 to_user_id 的 NOT NULL 约束，现在支持群组消息');
    } else {
      console.error('❌ 修复后验证失败，to_user_id 仍然有 NOT NULL 约束');
      throw new Error('修复失败');
    }
  } catch (error: any) {
    // 回滚事务
    db.exec('ROLLBACK');
    console.error('❌ 修复失败，已回滚:', error.message);
    throw error;
  }
} catch (error: any) {
  console.error('❌ 修复过程出错:', error);
  process.exit(1);
} finally {
  db.close();
}

