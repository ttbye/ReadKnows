/**
 * @file index.ts
 * @author ttbye
 * @date 2025-12-11
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { dbPath } from '../config/paths';

const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('创建数据库目录:', dbDir);
}

export const db: Database.Database = new Database(dbPath);

// 数据库性能优化配置（特别适用于 Docker 环境）
// WAL 模式：提高并发性能，减少锁定时间
db.pragma('journal_mode = WAL');
// 同步模式：NORMAL 在 WAL 模式下提供更好的性能
db.pragma('synchronous = NORMAL');
// 缓存大小：增加缓存以提高查询性能（32MB）
db.pragma('cache_size = -32000');
// 临时存储：使用内存存储临时表
db.pragma('temp_store = MEMORY');
// 启用外键约束
db.pragma('foreign_keys = ON');
// 数据库锁定超时：等待锁定的时间（30秒），避免操作失败
db.pragma('busy_timeout = 30000');
// 优化器：启用查询优化器
db.pragma('optimize');

export function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 书籍表
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      publisher TEXT,
      publish_date TEXT,
      description TEXT,
      cover_url TEXT,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      file_hash TEXT,
      category TEXT DEFAULT '未分类',
      language TEXT DEFAULT 'zh',
      tags TEXT,
      rating REAL,
      is_public INTEGER DEFAULT 0,
      parent_book_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 检查并添加新字段（用于数据库迁移）
  try {
    const booksTableInfo = db.prepare("PRAGMA table_info(books)").all() as any[];
    const usersTableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
    
    const hasFileHash = booksTableInfo.some((col) => col.name === 'file_hash');
    const hasCategory = booksTableInfo.some((col) => col.name === 'category');
    const hasUploaderId = booksTableInfo.some((col) => col.name === 'uploader_id');
    const hasIsPublic = booksTableInfo.some((col) => col.name === 'is_public');
    const hasParentBookId = booksTableInfo.some((col) => col.name === 'parent_book_id');
    const hasRole = usersTableInfo.some((col) => col.name === 'role');
    const hasNickname = usersTableInfo.some((col) => col.name === 'nickname');
    const hasLanguage = usersTableInfo.some((col) => col.name === 'language');
    const hasCanUploadPrivate = usersTableInfo.some((col) => col.name === 'can_upload_private');
    const hasMaxPrivateBooks = usersTableInfo.some((col) => col.name === 'max_private_books');
    const hasLastLoginTime = usersTableInfo.some((col) => col.name === 'last_login_time');

    if (!hasFileHash) {
      db.exec('ALTER TABLE books ADD COLUMN file_hash TEXT');
      console.log('已添加 file_hash 字段');
    }

    if (!hasCategory) {
      db.exec("ALTER TABLE books ADD COLUMN category TEXT DEFAULT '未分类'");
      console.log('已添加 category 字段');
    }

    if (!hasUploaderId) {
      db.exec('ALTER TABLE books ADD COLUMN uploader_id TEXT');
      console.log('已添加 uploader_id 字段');
    }

    if (!hasIsPublic) {
      db.exec('ALTER TABLE books ADD COLUMN is_public INTEGER DEFAULT 0');
      console.log('已添加 is_public 字段');
    }

    if (!hasParentBookId) {
      db.exec('ALTER TABLE books ADD COLUMN parent_book_id TEXT');
      console.log('已添加 parent_book_id 字段');
    }

    if (!hasRole) {
      db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      console.log('已添加 role 字段');
    }

    if (!hasNickname) {
      db.exec("ALTER TABLE users ADD COLUMN nickname TEXT");
      console.log('已添加 nickname 字段');
    }

    if (!hasLanguage) {
      db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'");
      console.log('已添加 language 字段');
    }

    if (!hasCanUploadPrivate) {
      // 默认值：普通用户为 0（禁用），管理员为 1（启用）
      // 但 ALTER TABLE 只能设置一个默认值，所以设置为 0（普通用户默认）
      // 管理员创建时会显式设置为 1
      db.exec('ALTER TABLE users ADD COLUMN can_upload_private INTEGER DEFAULT 0');
      console.log('已添加 can_upload_private 字段（默认值：0，普通用户禁用）');
      
      // 将现有管理员用户的 can_upload_private 设置为 1
      try {
        db.exec("UPDATE users SET can_upload_private = 1 WHERE role = 'admin'");
        console.log('已更新现有管理员用户的 can_upload_private 为 1');
      } catch (e) {
        console.warn('更新现有管理员用户权限失败:', e);
      }
    }

    if (!hasMaxPrivateBooks) {
      db.exec('ALTER TABLE users ADD COLUMN max_private_books INTEGER DEFAULT 30');
      console.log('已添加 max_private_books 字段');
    }

    if (!hasLastLoginTime) {
      db.exec('ALTER TABLE users ADD COLUMN last_login_time DATETIME');
      console.log('已添加 last_login_time 字段');
    }

    // 检查并添加新的权限字段
    const hasCanUploadBooks = usersTableInfo.some((col) => col.name === 'can_upload_books');
    const hasCanEditBooks = usersTableInfo.some((col) => col.name === 'can_edit_books');
    const hasCanDownload = usersTableInfo.some((col) => col.name === 'can_download');
    const hasCanPush = usersTableInfo.some((col) => col.name === 'can_push');

    if (!hasCanUploadBooks) {
      // 默认值：管理员为 1（允许），普通用户为 1（允许，向后兼容）
      db.exec('ALTER TABLE users ADD COLUMN can_upload_books INTEGER DEFAULT 1');
      console.log('已添加 can_upload_books 字段（默认值：1，允许上传）');
      // 将现有管理员用户的 can_upload_books 设置为 1
      try {
        db.exec("UPDATE users SET can_upload_books = 1 WHERE role = 'admin'");
        console.log('已更新现有管理员用户的 can_upload_books 为 1');
      } catch (e) {
        console.warn('更新现有管理员用户上传权限失败:', e);
      }
    }

    if (!hasCanEditBooks) {
      // 默认值：管理员为 1（允许），普通用户为 1（允许，向后兼容）
      db.exec('ALTER TABLE users ADD COLUMN can_edit_books INTEGER DEFAULT 1');
      console.log('已添加 can_edit_books 字段（默认值：1，允许编辑）');
      // 将现有管理员用户的 can_edit_books 设置为 1
      try {
        db.exec("UPDATE users SET can_edit_books = 1 WHERE role = 'admin'");
        console.log('已更新现有管理员用户的 can_edit_books 为 1');
      } catch (e) {
        console.warn('更新现有管理员用户编辑权限失败:', e);
      }
    }

    if (!hasCanDownload) {
      // 默认值：管理员为 1（允许），普通用户为 1（允许，向后兼容）
      db.exec('ALTER TABLE users ADD COLUMN can_download INTEGER DEFAULT 1');
      console.log('已添加 can_download 字段（默认值：1，允许下载）');
      // 将现有管理员用户的 can_download 设置为 1
      try {
        db.exec("UPDATE users SET can_download = 1 WHERE role = 'admin'");
        console.log('已更新现有管理员用户的 can_download 为 1');
      } catch (e) {
        console.warn('更新现有管理员用户下载权限失败:', e);
      }
    }

    if (!hasCanPush) {
      // 默认值：管理员为 1（允许），普通用户为 1（允许，向后兼容）
      db.exec('ALTER TABLE users ADD COLUMN can_push INTEGER DEFAULT 1');
      console.log('已添加 can_push 字段（默认值：1，允许推送）');
      // 将现有管理员用户的 can_push 设置为 1
      try {
        db.exec("UPDATE users SET can_push = 1 WHERE role = 'admin'");
        console.log('已更新现有管理员用户的 can_push 为 1');
      } catch (e) {
        console.warn('更新现有管理员用户推送权限失败:', e);
      }
    }

    // 检查并添加 can_upload_audiobook 字段
    const hasCanUploadAudiobook = usersTableInfo.some((col) => col.name === 'can_upload_audiobook');
    if (!hasCanUploadAudiobook) {
      // 默认值：管理员为 1（允许），普通用户为 0（禁用）
      db.exec('ALTER TABLE users ADD COLUMN can_upload_audiobook INTEGER DEFAULT 0');
      console.log('已添加 can_upload_audiobook 字段（默认值：0，普通用户禁用）');
      // 将现有管理员用户的 can_upload_audiobook 设置为 1
      try {
        db.exec("UPDATE users SET can_upload_audiobook = 1 WHERE role = 'admin'");
        console.log('已更新现有管理员用户的 can_upload_audiobook 为 1');
      } catch (e) {
        console.warn('更新现有管理员用户上传有声小说权限失败:', e);
      }
    }

    // 检查并添加 can_use_friends 字段（书友功能权限）
    const hasCanUseFriends = usersTableInfo.some((col) => col.name === 'can_use_friends');
    if (!hasCanUseFriends) {
      // 默认值：所有用户为 1（允许，向后兼容）
      db.exec('ALTER TABLE users ADD COLUMN can_use_friends INTEGER DEFAULT 1');
      console.log('已添加 can_use_friends 字段（默认值：1，允许使用书友功能）');
      // 将现有所有用户的 can_use_friends 设置为 1（默认允许）
      try {
        db.exec("UPDATE users SET can_use_friends = 1");
        console.log('已更新现有所有用户的 can_use_friends 为 1');
      } catch (e) {
        console.warn('更新现有用户书友权限失败:', e);
      }
    }

    // 端到端加密：用户公钥（供对方加密消息，仅 1:1 文字消息使用）
    const hasE2eePublicKey = usersTableInfo.some((col) => col.name === 'e2ee_public_key');
    if (!hasE2eePublicKey) {
      db.exec('ALTER TABLE users ADD COLUMN e2ee_public_key TEXT');
      console.log('已添加 users.e2ee_public_key 字段');
    }

    // 端到端加密：私钥的加密备份（用用户自设的恢复密码加密，仅用于新设备恢复，服务器无法解密）
    const hasE2eePrivateKeyEncrypted = usersTableInfo.some((col) => col.name === 'e2ee_private_key_encrypted');
    if (!hasE2eePrivateKeyEncrypted) {
      db.exec('ALTER TABLE users ADD COLUMN e2ee_private_key_encrypted TEXT');
      console.log('已添加 users.e2ee_private_key_encrypted 字段');
    }

    // 用户头像路径（相对于 avatars 目录的文件名，如 userId_uuid.png）
    const hasAvatarPath = usersTableInfo.some((col) => col.name === 'avatar_path');
    if (!hasAvatarPath) {
      db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT');
      console.log('已添加 users.avatar_path 字段');
    }
    
    // 注意：系统会在第一个用户注册时自动设置为管理员
    // 检查是否有管理员
    try {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any;
      const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
      
      if (totalUsers.count > 0 && adminCount.count === 0) {
        // 如果有用户但没有管理员，将第一个用户设置为管理员
        const firstUser = db.prepare('SELECT id, username FROM users ORDER BY created_at ASC LIMIT 1').get() as any;
        if (firstUser) {
          db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(firstUser.id);
          console.log('========================================');
          console.log('已将第一个用户设置为管理员:', firstUser.username);
          console.log('========================================');
        }
      } else if (adminCount.count > 0) {
        console.log(`系统中有 ${adminCount.count} 个管理员账号`);
      } else {
        console.log('系统中暂无用户，第一个注册的用户将自动成为管理员');
      }
    } catch (e) {
      console.error('检查管理员状态失败:', e);
    }
  } catch (e) {
    console.error('数据库迁移错误:', e);
  }

  // 为file_hash创建索引（如果不存在）
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_books_file_hash ON books(file_hash);
      CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
      CREATE INDEX IF NOT EXISTS idx_books_is_public ON books(is_public);
      CREATE INDEX IF NOT EXISTS idx_books_parent_book_id ON books(parent_book_id);
    `);
  } catch (e) {
    console.error('创建索引错误:', e);
  }

  // 用户书架表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_shelves (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(user_id, book_id)
    )
  `);

  // 阅读进度表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      progress REAL DEFAULT 0,
      current_position TEXT,
      current_page INTEGER DEFAULT 1,
      total_pages INTEGER DEFAULT 1,
      chapter_index INTEGER DEFAULT 0,
      scroll_top REAL DEFAULT 0,
      last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(user_id, book_id)
    )
  `);
  
  // 检查并添加新字段（用于数据库迁移）
  try {
    const tableInfo = db.prepare("PRAGMA table_info(reading_progress)").all() as any[];
    const hasCurrentPage = tableInfo.some((col) => col.name === 'current_page');
    const hasTotalPages = tableInfo.some((col) => col.name === 'total_pages');
    const hasParagraphIndex = tableInfo.some((col) => col.name === 'paragraph_index');
    const hasChapterIndex = tableInfo.some((col) => col.name === 'chapter_index');
    const hasScrollTop = tableInfo.some((col) => col.name === 'scroll_top');
    const hasLastSessionId = tableInfo.some((col) => col.name === 'last_session_id');
    const hasChapterTitle = tableInfo.some((col) => col.name === 'chapter_title');
    const hasReadingTime = tableInfo.some((col) => col.name === 'reading_time');

    if (!hasCurrentPage) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN current_page INTEGER DEFAULT 1');
      console.log('已添加 current_page 字段');
    }
    if (!hasTotalPages) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN total_pages INTEGER DEFAULT 1');
      console.log('已添加 total_pages 字段');
    }
    if (!hasChapterIndex) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN chapter_index INTEGER DEFAULT 0');
      console.log('已添加 chapter_index 字段');
    }
    if (!hasScrollTop) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN scroll_top REAL DEFAULT 0');
      console.log('已添加 scroll_top 字段');
    }
    if (!hasLastSessionId) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN last_session_id TEXT');
      console.log('已添加 last_session_id 字段');
    }
    if (!hasChapterTitle) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN chapter_title TEXT');
      console.log('已添加 chapter_title 字段');
    }
    if (!hasReadingTime) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN reading_time REAL DEFAULT 0');
      console.log('已添加 reading_time 字段');
    }
    if (!hasParagraphIndex) {
      db.exec('ALTER TABLE reading_progress ADD COLUMN paragraph_index INTEGER');
      console.log('已添加 paragraph_index 字段');
    }
  } catch (e) {
    console.error('数据库迁移错误:', e);
  }

  // 阅读历史表（每用户每本书一条主记录）
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_reading_time INTEGER DEFAULT 0,
      total_progress REAL DEFAULT 0,
      read_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(user_id, book_id)
    )
  `);
  
  // 阅读会话表（记录每次阅读的详情）
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_sessions (
      id TEXT PRIMARY KEY,
      history_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration INTEGER DEFAULT 0,
      progress_before REAL DEFAULT 0,
      progress_after REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (history_id) REFERENCES reading_history(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // 读书打卡表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      checkin_date DATE NOT NULL,
      book_id TEXT,
      duration_minutes INTEGER DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
      UNIQUE(user_id, checkin_date)
    )
  `);

  // 成就定义表
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT,
      points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 用户成就表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
      UNIQUE(user_id, achievement_id)
    )
  `);

  // 初始化成就数据
  try {
    const defaultAchievements = [
      { id: 'first_message', key: 'first_message', name: '初次发言', description: '发送第一条消息', icon: '💬', points: 10 },
      { id: 'chatty_100', key: 'chatty_100', name: '话痨上线', description: '累计发送 100 条消息', icon: '🗨️', points: 50 },
      { id: 'first_checkin', key: 'first_checkin', name: '读书打卡', description: '完成第一次读书打卡', icon: '✅', points: 10 },
      { id: 'streak_7', key: 'streak_7', name: '坚持一周', description: '连续打卡 7 天', icon: '🔥', points: 40 },
      { id: 'bookworm_10', key: 'bookworm_10', name: '书虫达人', description: '完成 10 本书的阅读', icon: '📚', points: 80 },
    ];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO achievements (id, key, name, description, icon, points)
      VALUES (@id, @key, @name, @description, @icon, @points)
    `);
    defaultAchievements.forEach((achievement) => insertStmt.run(achievement));
  } catch (e) {
    console.error('初始化成就数据失败:', e);
  }
  
  // 数据库迁移：更新 reading_history 表结构
  try {
    const tableInfo = db.prepare("PRAGMA table_info(reading_history)").all() as any[];
    const hasLastReadAt = tableInfo.some((col) => col.name === 'last_read_at');
    const hasTotalReadingTime = tableInfo.some((col) => col.name === 'total_reading_time');
    const hasTotalProgress = tableInfo.some((col) => col.name === 'total_progress');
    const hasReadCount = tableInfo.some((col) => col.name === 'read_count');
    
    // 迁移旧数据
    if (!hasLastReadAt && tableInfo.some((col) => col.name === 'read_at')) {
      db.exec('ALTER TABLE reading_history RENAME COLUMN read_at TO last_read_at');
      console.log('已迁移 reading_history.read_at 到 last_read_at');
    }
    
    if (!hasTotalReadingTime) {
      db.exec('ALTER TABLE reading_history ADD COLUMN total_reading_time INTEGER DEFAULT 0');
      console.log('已添加 total_reading_time 字段');
    }
    
    if (!hasTotalProgress) {
      db.exec('ALTER TABLE reading_history ADD COLUMN total_progress REAL DEFAULT 0');
      console.log('已添加 total_progress 字段');
    }
    
    if (!hasReadCount) {
      db.exec('ALTER TABLE reading_history ADD COLUMN read_count INTEGER DEFAULT 0');
      console.log('已添加 read_count 字段');
    }
    
    // 检查并添加 updated_at 字段
    const hasUpdatedAt = tableInfo.some((col) => col.name === 'updated_at');
    if (!hasUpdatedAt) {
      db.exec('ALTER TABLE reading_history ADD COLUMN updated_at DATETIME');
      // 为现有记录设置 updated_at = last_read_at
      db.exec('UPDATE reading_history SET updated_at = last_read_at WHERE updated_at IS NULL');
      console.log('已添加 updated_at 字段');
    }
    
    // 创建索引
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_history_user_book 
      ON reading_history(user_id, book_id);
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_history 
      ON reading_sessions(history_id);
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_book 
      ON reading_sessions(user_id, book_id);
      CREATE INDEX IF NOT EXISTS idx_reading_sessions_start_time 
      ON reading_sessions(start_time);
    `);
  } catch (e) {
    console.error('数据库迁移错误:', e);
  }

  // 阅读设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      settings TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 用户AI设置表（每个用户独立的AI配置）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_ai_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'ollama',
      api_url TEXT DEFAULT 'http://127.0.0.1:11434',
      api_key TEXT DEFAULT '',
      model TEXT DEFAULT 'deepseek-v3.1:671b-cloud',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 用户推送邮箱表（记录用户推送过的Kindle邮箱）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_push_emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      is_kindle INTEGER DEFAULT 0,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, email)
    )
  `);

  // 创建用户推送邮箱索引
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_push_emails_user_id ON user_push_emails(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_push_emails_email ON user_push_emails(email);
    `);
  } catch (e) {
    console.error('创建用户推送邮箱索引错误:', e);
  }

  // 创建用户AI设置索引
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_ai_settings_user_id ON user_ai_settings(user_id);
    `);
  } catch (e) {
    console.error('创建用户AI设置索引错误:', e);
  }

  // 笔记表
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      content TEXT NOT NULL,
      position TEXT,
      page_number INTEGER,
      chapter_index INTEGER,
      selected_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // 迁移：允许book_id为NULL（支持独立笔记）
  try {
    const notesTableInfo = db.prepare("PRAGMA table_info(notes)").all() as any[];
    const bookIdColumn = notesTableInfo.find((col) => col.name === 'book_id');
    
    // 检查book_id是否允许NULL（SQLite中，notnull=0表示允许NULL）
    if (bookIdColumn && bookIdColumn.notnull === 1) {
      console.log('开始迁移notes表，允许book_id为NULL...');
      
      // 禁用外键检查
      db.pragma('foreign_keys = OFF');
      
      // 创建新表（book_id允许NULL）
      db.exec(`
        CREATE TABLE notes_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          book_id TEXT,
          content TEXT NOT NULL,
          position TEXT,
          page_number INTEGER,
          chapter_index INTEGER,
          selected_text TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )
      `);
      
      // 复制数据
      db.exec('INSERT INTO notes_new SELECT * FROM notes');
      
      // 删除旧表
      db.exec('DROP TABLE notes');
      
      // 重命名新表
      db.exec('ALTER TABLE notes_new RENAME TO notes');
      
      // 重新启用外键检查
      db.pragma('foreign_keys = ON');
      
      console.log('notes表迁移完成，book_id现在允许NULL');
    }
  } catch (e) {
    console.error('迁移notes表错误:', e);
    // 确保外键检查重新启用
    db.pragma('foreign_keys = ON');
  }

  // 创建笔记表索引
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
      CREATE INDEX IF NOT EXISTS idx_notes_book_id ON notes(book_id);
      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
    `);
  } catch (e) {
    console.error('创建笔记索引错误:', e);
  }

  // EPUB 高亮标注表（基于 CFI range）
  db.exec(`
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      cfi_range TEXT NOT NULL,
      selected_text TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // 高亮索引
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_highlights_user_id ON highlights(user_id);
      CREATE INDEX IF NOT EXISTS idx_highlights_book_id ON highlights(book_id);
      CREATE INDEX IF NOT EXISTS idx_highlights_user_book ON highlights(user_id, book_id);
      CREATE INDEX IF NOT EXISTS idx_highlights_updated_at ON highlights(updated_at DESC);
    `);
  } catch (e) {
    console.error('创建高亮索引错误:', e);
  }

  // 字体表
  db.exec(`
    CREATE TABLE IF NOT EXISTS fonts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 阅读器偏好设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reader_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      book_id TEXT, -- NULL 表示全局设置
      file_type TEXT NOT NULL, -- epub, pdf, txt
      reader_type TEXT NOT NULL, -- epubjs, readium, custom, pdfjs, react-pdf, native, markdown
      settings TEXT, -- JSON格式的阅读器特定设置
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(user_id, book_id, file_type)
    )
  `);

  // 书籍类型表（用于管理可选的书籍分类）
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 初始化默认书籍类型
  try {
    const existingCategories = db.prepare('SELECT COUNT(*) as count FROM book_categories').get() as any;
    if (existingCategories.count === 0) {
      const defaultCategories = [
        '未分类', '笔记', '小说', '文学', '历史', '哲学', '网络小说', '武侠小说',
        '传记', '科技', '计算机', '编程', '经济', '管理', '心理学',
        '社会科学', '自然科学', '艺术', '教育', '儿童读物', '漫画'
      ];
      const stmt = db.prepare('INSERT INTO book_categories (id, name, display_order) VALUES (?, ?, ?)');
      defaultCategories.forEach((name, index) => {
        stmt.run(uuidv4(), name, index);
      });
      console.log('已初始化默认书籍类型');
    }
  } catch (e) {
    console.error('初始化默认书籍类型失败:', e);
  }

  // 兼容迁移：确保“笔记”分类存在（即使之前已经初始化过）
  try {
    const noteCat = db.prepare('SELECT id FROM book_categories WHERE name = ?').get('笔记') as any;
    if (!noteCat) {
      db.prepare('INSERT OR IGNORE INTO book_categories (id, name, display_order) VALUES (?, ?, ?)').run(uuidv4(), '笔记', 0);
    }
  } catch (e) {
    console.error('确保笔记分类存在失败:', e);
  }

  // 系统设置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // IP禁用表
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id TEXT PRIMARY KEY,
      ip_address TEXT UNIQUE NOT NULL,
      reason TEXT,
      blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unblock_at DATETIME,
      attempts INTEGER DEFAULT 0,
      last_attempt DATETIME
    )
  `);

  // 验证码会话表（存储验证码和会话）
  db.exec(`
    CREATE TABLE IF NOT EXISTS captcha_sessions (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      captcha_text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    )
  `);

  // IP访问尝试记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_access_attempts (
      id TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      attempt_type TEXT NOT NULL,
      success INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 导入历史记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS import_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT,
      status TEXT NOT NULL,
      message TEXT,
      book_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
    )
  `);

  // 系统日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action_type TEXT NOT NULL,
      action_category TEXT NOT NULL,
      description TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 创建索引以提高查询性能
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_system_logs_action_type ON system_logs(action_type);
    CREATE INDEX IF NOT EXISTS idx_system_logs_action_category ON system_logs(action_category);
    CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);
  `);

  // 生成随机密钥的函数
  const generateRandomKey = (length: number = 16): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // 从环境变量读取API Key，如果没有则生成随机值
  const apiKeyFromEnv = process.env.API_KEY?.trim();
  const defaultApiKey = apiKeyFromEnv || generateRandomKey(16);
  
  // 生成私有访问密钥（如果不存在则生成）
  // 注意：此时 system_settings 表已经创建，但为了安全起见，仍然使用 try-catch
  let existingPrivateKey: any = null;
  try {
    existingPrivateKey = db.prepare("SELECT value FROM system_settings WHERE key = 'private_access_key'").get() as any;
  } catch (e: any) {
    console.warn('[数据库初始化] 查询现有私有密钥失败（将生成新密钥）:', e.message);
    existingPrivateKey = null;
  }
  const defaultPrivateKey = existingPrivateKey?.value?.trim() || generateRandomKey(20);

  // 初始化默认设置
  const defaultSettings = [
    { key: 'books_storage_path', value: './books', description: '书籍仓库保存路径' },
    { key: 'books_scan_path', value: './import', description: '书籍扫描路径' },
    { key: 'auto_convert_txt', value: 'true', description: '自动将TXT转换为EPUB' },
    { key: 'auto_convert_mobi', value: 'true', description: '自动将MOBI转换为EPUB' },
    { key: 'auto_fetch_douban', value: 'true', description: '自动从豆瓣获取书籍信息' },
    { key: 'auto_import_enabled', value: 'true', description: '启用自动导入功能（监控import目录）' },
    { key: 'douban_api_base', value: 'https://127.0.0.1:1552', description: '豆瓣API地址' },
    { key: 'opds_enabled', value: 'false', description: '启用OPDS功能' },
    { key: 'email_push_enabled', value: 'false', description: '启用邮件推送功能' },
    { key: 'smtp_host', value: '', description: 'SMTP服务器地址' },
    { key: 'smtp_port', value: '587', description: 'SMTP端口' },
    { key: 'smtp_user', value: '', description: 'SMTP用户名' },
    { key: 'smtp_password', value: '', description: 'SMTP密码' },
    { key: 'kindle_email', value: '', description: 'Kindle邮箱地址' },
    { key: 'api_key', value: defaultApiKey, description: 'API访问密钥（用于API请求认证）' },
    { key: 'private_access_key', value: defaultPrivateKey, description: '私有访问密钥' },
    { key: 'private_key_required_for_login', value: 'false', description: '登录时需要验证私有密钥' },
    { key: 'private_key_required_for_register', value: 'true', description: '注册时需要验证私有密钥' },
    { key: 'registration_enabled', value: 'true', description: '允许用户注册' },
    { key: 'private_access_enabled', value: 'false', description: '启用私有地址访问密钥验证（已废弃，使用上面的细分设置）' },
    { key: 'max_access_attempts', value: '10', description: '最大访问尝试次数（超过后禁用IP）' },
    { key: 'admin_can_see_all_books', value: 'false', description: '管理员在图书馆可看到所有书籍（含他人私有）；关闭时与普通用户一致。' },
    { key: 'ai_provider', value: 'ollama', description: 'AI提供商（ollama/openai/deepseek）' },
    { key: 'ai_api_url', value: 'http://localhost:11434', description: 'AI API地址（Ollama默认）' },
    { key: 'ai_api_key', value: '', description: 'AI API密钥（OpenAI/DeepSeek需要）' },
    { key: 'ai_model', value: 'llama2', description: 'AI模型名称' },
    { key: 'tts_default_model', value: 'edge', description: '默认TTS引擎（edge/qwen3/indextts2/coqui/piper）' },
    { key: 'system_timezone_offset', value: '8', description: '系统时区偏移（小时），默认+8（中国上海时区）' },
    { key: 'tts_default_voice', value: 'zh-CN-XiaoxiaoNeural', description: '默认TTS语音ID' },
    { key: 'tts_default_speed', value: '1.0', description: '默认TTS语速（0.5-3.0）' },
    { key: 'tts_auto_role', value: 'false', description: '是否启用自动角色识别' },
    { key: 'tts_server_host', value: '127.0.0.1', description: 'TTS服务器地址（IP或域名）' },
    { key: 'tts_server_port', value: '5051', description: 'TTS服务器端口' },
    { key: 'tts_test_sample', value: 'Hello, 你好！This is a test. 这是一个测试。', description: 'TTS音频测试内容样本（中英文混读）' },
    { key: 'system_language', value: 'zh-CN', description: '系统语言（zh-CN: 简体中文, en: English）' },
    { key: 'enable_api_server_config_in_login', value: 'true', description: '是否在登录页显示API服务器设置功能（默认显示）' },
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (id, key, value, description) VALUES (?, ?, ?, ?)');
  const updateSettingValue = db.prepare('UPDATE system_settings SET value = ? WHERE key = ?');
  const updateSettingDesc = db.prepare('UPDATE system_settings SET description = ? WHERE key = ?');
  
  // 导出生成的密钥，供启动时显示
  let generatedApiKey = defaultApiKey;
  let generatedPrivateKey = defaultPrivateKey;
  
  defaultSettings.forEach((setting) => {
    // 检查设置是否已存在
    const existing = db.prepare('SELECT value, description FROM system_settings WHERE key = ?').get(setting.key) as any;
    
    if (existing) {
      // 如果已存在，只更新描述（如果不同）
      if (existing.description !== setting.description) {
        updateSettingDesc.run(setting.description, setting.key);
      }
      
      // 特殊处理：如果 douban_api_base 是旧的硬编码地址，则更新为新默认值
      if (setting.key === 'douban_api_base' && 
          (existing.value === 'http://127.0.0.1:1552' || !existing.value || existing.value.trim() === '')) {
        updateSettingValue.run(setting.value, setting.key);
      }
      
      // 特殊处理：如果 books_scan_path 为空，则更新为默认值 ./import
      if (setting.key === 'books_scan_path' && 
          (!existing.value || existing.value.trim() === '')) {
        updateSettingValue.run(setting.value, setting.key);
      }
      
      // 特殊处理：如果 api_key 为空，则使用环境变量或生成新值
      if (setting.key === 'api_key' && 
          (!existing.value || existing.value.trim() === '')) {
        // 优先使用环境变量，否则使用生成的随机值
        const newApiKey = apiKeyFromEnv || generateRandomKey(16);
        updateSettingValue.run(newApiKey, setting.key);
      }
      
      // 特殊处理：如果 private_access_key 为空，则生成新值
      if (setting.key === 'private_access_key' && 
          (!existing.value || existing.value.trim() === '')) {
        const newPrivateKey = generateRandomKey(20);
        updateSettingValue.run(newPrivateKey, setting.key);
      }
    } else {
      // 如果不存在，插入新设置
    insertSetting.run(uuidv4(), setting.key, setting.value, setting.description);
    }
  });

  // 确保私有访问密钥已生成（如果之前为空）
  const finalPrivateKey = db.prepare("SELECT value FROM system_settings WHERE key = 'private_access_key'").get() as any;
  if (!finalPrivateKey || !finalPrivateKey.value || finalPrivateKey.value.trim() === '') {
    const newPrivateKey = generateRandomKey(20);
    updateSettingValue.run(newPrivateKey, 'private_access_key');
    generatedPrivateKey = newPrivateKey;
  } else {
    generatedPrivateKey = finalPrivateKey.value;
  }
  
  // 确保API Key已设置（如果之前为空）
  const finalApiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'api_key'").get() as any;
  if (!finalApiKey || !finalApiKey.value || finalApiKey.value.trim() === '') {
    const newApiKey = apiKeyFromEnv || generateRandomKey(16);
    updateSettingValue.run(newApiKey, 'api_key');
    generatedApiKey = newApiKey;
  } else {
    generatedApiKey = finalApiKey.value;
  }

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_shelves_user_id ON user_shelves(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_shelves_book_id ON user_shelves(book_id);
    CREATE INDEX IF NOT EXISTS idx_reading_progress_user_id ON reading_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_reading_progress_book_id ON reading_progress(book_id);
    CREATE INDEX IF NOT EXISTS idx_reading_history_user_id ON reading_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_reading_history_book_id ON reading_history(book_id);
    CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
    CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
    CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);
    CREATE INDEX IF NOT EXISTS idx_captcha_sessions_session ON captcha_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_captcha_sessions_expires ON captcha_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_ip_access_attempts_ip ON ip_access_attempts(ip_address);
    CREATE INDEX IF NOT EXISTS idx_ip_access_attempts_created ON ip_access_attempts(created_at);
    CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_import_history_created ON import_history(created_at);
  `);

  // 检查用户和管理员状态，并创建默认管理员账号
  try {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any;
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
    
    if (totalUsers.count === 0) {
      console.log('========================================');
      console.log('📚 欢迎使用 ReadKnows ');
          console.log('========================================');
      console.log('系统中暂无用户，正在创建默认管理员账号...');
      
      // 创建默认管理员账号
      try {
        const defaultUsername = 'books';
        const defaultPassword = 'readknows';
        const defaultEmail = 'admin@readknows.local';
        const defaultPrivateKey = 'books@123';
        
        // 加密密码（同步方式，避免async问题）
        const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
        
        // 创建管理员用户
        const userId = uuidv4();
        db.prepare(
          'INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)'
        ).run(userId, defaultUsername, defaultEmail, hashedPassword, 'admin');
        
        // 设置私人访问密钥
        const privateKeySettingExists = db.prepare('SELECT id FROM system_settings WHERE key = ?').get('private_access_key') as any;
        if (privateKeySettingExists) {
          db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(defaultPrivateKey, 'private_access_key');
        }
        
        console.log('========================================');
        console.log('✅ 默认管理员账号创建成功！');
        console.log('========================================');
        console.log(`👤 用户名: ${defaultUsername}`);
        console.log(`🔑 密码: ${defaultPassword}`);
        console.log(`📧 邮箱: ${defaultEmail}`);
        console.log(`🔐 私人访问密钥: ${defaultPrivateKey}`);
        console.log('========================================');
        console.log('⚠️  安全提示：');
        console.log('   1. 请立即登录系统修改默认密码');
        console.log('   2. 建议修改私人访问密钥');
        console.log('   3. 可在"设置-系统设置"中管理访问控制');
        console.log('========================================');
      } catch (createError) {
        console.error('创建默认管理员账号失败:', createError);
        console.log('========================================');
        console.log('👑 第一个注册的用户将自动成为管理员');
        console.log('🔐 注册时需要提供私人网站访问密码');
        console.log('========================================');
      }
    } else if (adminCount.count === 0) {
      // 如果有用户但没有管理员，将第一个用户设置为管理员
      const firstUser = db.prepare('SELECT id, username FROM users ORDER BY created_at ASC LIMIT 1').get() as any;
      if (firstUser) {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(firstUser.id);
          console.log('========================================');
        console.log(`已将第一个用户 "${firstUser.username}" 设置为管理员`);
          console.log('========================================');
      }
    } else {
      console.log(`系统中有 ${totalUsers.count} 个用户，${adminCount.count} 个管理员`);
    }
  } catch (e) {
    console.error('检查用户状态失败:', e);
  }

  // ========== 用户群组功能相关表 ==========
  
  // 用户群组表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      is_public INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 群组成员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      is_muted INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(group_id, user_id)
    )
  `);

  // 为group_members表添加is_muted字段（如果不存在）
  try {
    const columnCheck = db.prepare("PRAGMA table_info(group_members)").all() as any[];
    const hasIsMuted = columnCheck.some(col => col.name === 'is_muted');
    if (!hasIsMuted) {
      db.exec('ALTER TABLE group_members ADD COLUMN is_muted INTEGER DEFAULT 0');
      console.log('已添加 is_muted 字段到 group_members 表');
    }
  } catch (e: any) {
    // 如果字段已存在，忽略错误
    if (!e.message?.includes('duplicate column')) {
      console.error('添加 is_muted 字段失败:', e);
    }
  }

  // 群组邀请表
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_invitations (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      inviter_id TEXT NOT NULL,
      invitee_id TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 好友关系表
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, friend_id)
    )
  `);

  // 数据库迁移：为friendships表添加remark、group_name和message字段
  try {
    const tableInfo = db.prepare("PRAGMA table_info(friendships)").all() as any[];
    const hasRemark = tableInfo.some((col) => col.name === 'remark');
    const hasGroupName = tableInfo.some((col) => col.name === 'group_name');
    const hasMessage = tableInfo.some((col) => col.name === 'message');
    
    if (!hasRemark) {
      db.exec('ALTER TABLE friendships ADD COLUMN remark TEXT');
      console.log('已添加 friendships.remark 字段');
    }
    
    if (!hasGroupName) {
      db.exec('ALTER TABLE friendships ADD COLUMN group_name TEXT');
      console.log('已添加 friendships.group_name 字段');
    }
    
    if (!hasMessage) {
      db.exec('ALTER TABLE friendships ADD COLUMN message TEXT');
      console.log('已添加 friendships.message 字段');
    }
  } catch (error: any) {
    console.error('迁移friendships表失败:', error);
  }

  // 消息表
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
      CHECK ((to_user_id IS NOT NULL AND group_id IS NULL) OR (to_user_id IS NULL AND group_id IS NOT NULL))
    )
  `);

  // 数据库迁移：为messages表添加新字段
  try {
    const tableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
    const hasMessageType = tableInfo.some((col) => col.name === 'message_type');
    const hasFilePath = tableInfo.some((col) => col.name === 'file_path');
    const hasFileName = tableInfo.some((col) => col.name === 'file_name');
    const hasFileSize = tableInfo.some((col) => col.name === 'file_size');
    const hasFileType = tableInfo.some((col) => col.name === 'file_type');
    const hasBookId = tableInfo.some((col) => col.name === 'book_id');
    const hasBookTitle = tableInfo.some((col) => col.name === 'book_title');
    const hasGroupId = tableInfo.some((col) => col.name === 'group_id');
    
    if (!hasMessageType) {
      db.exec('ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT \'text\'');
      console.log('已添加 messages.message_type 字段');
    }
    
    if (!hasFilePath) {
      db.exec('ALTER TABLE messages ADD COLUMN file_path TEXT');
      console.log('已添加 messages.file_path 字段');
    }
    
    if (!hasFileName) {
      db.exec('ALTER TABLE messages ADD COLUMN file_name TEXT');
      console.log('已添加 messages.file_name 字段');
    }
    
    if (!hasFileSize) {
      db.exec('ALTER TABLE messages ADD COLUMN file_size INTEGER');
      console.log('已添加 messages.file_size 字段');
    }
    
    if (!hasFileType) {
      db.exec('ALTER TABLE messages ADD COLUMN file_type TEXT');
      console.log('已添加 messages.file_type 字段');
    }
    
    if (!hasBookId) {
      db.exec('ALTER TABLE messages ADD COLUMN book_id TEXT');
      console.log('已添加 messages.book_id 字段');
    }
    
    if (!hasBookTitle) {
      db.exec('ALTER TABLE messages ADD COLUMN book_title TEXT');
      console.log('已添加 messages.book_title 字段');
    }
    
    if (!hasGroupId) {
      db.exec('ALTER TABLE messages ADD COLUMN group_id TEXT');
      console.log('已添加 messages.group_id 字段');
    }
    
    const hasDuration = tableInfo.some((col) => col.name === 'duration');
    if (!hasDuration) {
      db.exec('ALTER TABLE messages ADD COLUMN duration REAL');
      console.log('已添加 messages.duration 字段');
    }
    
    // 检查并修复 to_user_id 的 NOT NULL 约束（群组消息需要 to_user_id 为 NULL）
    try {
      const toUserIdInfo = tableInfo.find((col) => col.name === 'to_user_id');
      if (toUserIdInfo && toUserIdInfo.notnull === 1) {
        // SQLite 不支持直接修改列的 NOT NULL 约束，需要重建表
        console.log('检测到 to_user_id 有 NOT NULL 约束，需要修复以支持群组消息...');
        // 注意：SQLite 不支持 ALTER COLUMN，所以这个约束会在 CHECK 约束中处理
        // 如果数据库已经有 NOT NULL 约束，我们需要通过迁移来处理
        // 由于 SQLite 的限制，我们只能通过 CHECK 约束来确保数据正确性
        console.log('注意：to_user_id 的 NOT NULL 约束需要通过重建表来移除，当前通过 CHECK 约束确保数据正确性');
      }
    } catch (e) {
      console.warn('检查 to_user_id 约束失败:', e);
    }
    
    // 添加撤回、删除、引用字段
    const hasIsDeleted = tableInfo.some((col) => col.name === 'is_deleted');
    const hasIsRecalled = tableInfo.some((col) => col.name === 'is_recalled');
    const hasReplyToMessageId = tableInfo.some((col) => col.name === 'reply_to_message_id');
    
    if (!hasIsDeleted) {
      db.exec('ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0');
      console.log('已添加 messages.is_deleted 字段');
    }
    
    if (!hasIsRecalled) {
      db.exec('ALTER TABLE messages ADD COLUMN is_recalled INTEGER DEFAULT 0');
      console.log('已添加 messages.is_recalled 字段');
    }
    
    if (!hasReplyToMessageId) {
      db.exec('ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT');
      console.log('已添加 messages.reply_to_message_id 字段');
    }
    
    // 更新现有消息的message_type
    if (hasMessageType) {
      db.exec('UPDATE messages SET message_type = \'text\' WHERE message_type IS NULL');
    }
    
    // 修复 to_user_id 的 NOT NULL 约束（如果存在）
    // SQLite 不支持直接修改列约束，需要重建表
    // 检查是否已经修复过（通过检查迁移标记表）
    try {
      // 检查是否已经修复过
      const migrationCheck = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='messages' AND sql LIKE '%to_user_id TEXT%'
      `).get() as any;
      
      // 重新获取表信息，因为可能已经添加了新字段
      const updatedTableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
      const toUserIdInfo = updatedTableInfo.find((col) => col.name === 'to_user_id');
      
      console.log('检查 to_user_id 约束:', {
        found: !!toUserIdInfo,
        notnull: toUserIdInfo?.notnull,
        type: toUserIdInfo?.type,
        hasMigration: !!migrationCheck
      });
      
      // 如果 to_user_id 有 NOT NULL 约束，需要修复
      if (toUserIdInfo && toUserIdInfo.notnull === 1) {
        console.log('⚠️  检测到 to_user_id 有 NOT NULL 约束，开始修复以支持群组消息...');
        
        // 使用事务确保数据一致性
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
          const existingColumns = updatedTableInfo.map(col => col.name);
          const columns = existingColumns.join(', ');
          
          console.log('复制数据，列:', columns);
          
          // 复制数据（只复制存在的列）
          db.exec(`
            INSERT INTO messages_new (${columns})
            SELECT ${columns} FROM messages
          `);
          
          // 删除旧表
          db.exec('DROP TABLE messages');
          
          // 重命名新表
          db.exec('ALTER TABLE messages_new RENAME TO messages');
          
          // 重新创建索引
          db.exec(`
            CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user_id);
            CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user_id);
            CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
          `);
          
          // 提交事务
          db.exec('COMMIT');
        } catch (transactionError: any) {
          // 回滚事务
          db.exec('ROLLBACK');
          throw transactionError;
        }
        
        // 验证修复是否成功
        const verifyTableInfo = db.prepare("PRAGMA table_info(messages)").all() as any[];
        const verifyToUserId = verifyTableInfo.find((col) => col.name === 'to_user_id');
        
        if (verifyToUserId && verifyToUserId.notnull === 0) {
          console.log('✓ 已成功修复 to_user_id 的 NOT NULL 约束，现在支持群组消息');
        } else {
          console.error('❌ 修复后验证失败，to_user_id 仍然有 NOT NULL 约束');
          throw new Error('修复 to_user_id 约束失败');
        }
      } else {
        console.log('✓ to_user_id 约束正常，无需修复');
      }
    } catch (e: any) {
      console.error('❌ 修复 to_user_id 约束失败:', e);
      console.error('错误详情:', e.message);
      if (e.stack) {
        console.error('堆栈:', e.stack);
      }
      // 如果修复失败，不影响其他功能，但会记录错误
    }
    
    // 更新现有消息的message_type
    if (hasMessageType) {
      db.exec('UPDATE messages SET message_type = \'text\' WHERE message_type IS NULL');
    }
  } catch (error: any) {
    console.error('迁移messages表失败:', error);
  }

  // 创建用户消息删除记录表（用于记录每个用户删除的消息）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_message_deletions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      UNIQUE(user_id, message_id)
    )
  `);
  
  // 创建用户对话删除记录表（用于记录每个用户删除的对话）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_conversation_deletions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_type TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, conversation_type, conversation_id)
    )
  `);

  // 创建索引以提高查询性能
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
    CREATE INDEX IF NOT EXISTS idx_user_message_deletions_user ON user_message_deletions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_message_deletions_message ON user_message_deletions(message_id);
    CREATE INDEX IF NOT EXISTS idx_user_conversation_deletions_user ON user_conversation_deletions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_conversation_deletions_conv ON user_conversation_deletions(conversation_type, conversation_id);
  `);

  // 用户对话设置表（静音、黑名单等）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_conversation_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_type TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      is_muted INTEGER DEFAULT 0,
      is_blocked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, conversation_type, conversation_id)
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_conversation_settings_user ON user_conversation_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_conversation_settings_conv ON user_conversation_settings(conversation_type, conversation_id);
    CREATE INDEX IF NOT EXISTS idx_user_conversation_settings_muted ON user_conversation_settings(is_muted);
    CREATE INDEX IF NOT EXISTS idx_user_conversation_settings_blocked ON user_conversation_settings(is_blocked);
  `);

  // 迁移：user_conversation_settings 添加 display_name、remark（对话重命名与备注）
  try {
    const ucsInfo = db.prepare("PRAGMA table_info(user_conversation_settings)").all() as any[];
    if (!ucsInfo.some((c) => c.name === 'display_name')) {
      db.exec('ALTER TABLE user_conversation_settings ADD COLUMN display_name TEXT');
      console.log('已添加 user_conversation_settings.display_name 字段');
    }
    if (!ucsInfo.some((c) => c.name === 'remark')) {
      db.exec('ALTER TABLE user_conversation_settings ADD COLUMN remark TEXT');
      console.log('已添加 user_conversation_settings.remark 字段');
    }
  } catch (e) {
    console.error('迁移 user_conversation_settings 失败:', e);
  }

  // 用户群组已读位置（用于计算群组未读数，群消息 to_user_id 恒为 NULL 无法用 messages.is_read）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_group_read (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      last_read_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, group_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_group_read_user ON user_group_read(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_group_read_group ON user_group_read(group_id)`);

  // 书籍群组可见性表（书籍可以设置为仅特定群组可见）
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_group_visibility (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      UNIQUE(book_id, group_id)
    )
  `);

  // 书籍分享表（书籍可以分享给特定用户）
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_shares (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT,
      to_group_id TEXT,
      permission TEXT DEFAULT 'read',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
      CHECK ((to_user_id IS NOT NULL) OR (to_group_id IS NOT NULL))
    )
  `);

  // 创建群组相关索引
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_book_group_visibility_book_id ON book_group_visibility(book_id);
      CREATE INDEX IF NOT EXISTS idx_book_group_visibility_group_id ON book_group_visibility(group_id);
      CREATE INDEX IF NOT EXISTS idx_book_shares_book_id ON book_shares(book_id);
      CREATE INDEX IF NOT EXISTS idx_book_shares_from_user_id ON book_shares(from_user_id);
      CREATE INDEX IF NOT EXISTS idx_book_shares_to_user_id ON book_shares(to_user_id);
      CREATE INDEX IF NOT EXISTS idx_book_shares_to_group_id ON book_shares(to_group_id);
      CREATE INDEX IF NOT EXISTS idx_book_shares_expires_at ON book_shares(expires_at);
      CREATE INDEX IF NOT EXISTS idx_books_uploader_id ON books(uploader_id);
      CREATE INDEX IF NOT EXISTS idx_books_group_only ON books(group_only);
      CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);
    `);
  } catch (e) {
    console.error('创建群组相关索引错误:', e);
  }

  // 检查并添加书籍表的群组可见性字段
  try {
    const booksTableInfo = db.prepare("PRAGMA table_info(books)").all() as any[];
    const hasGroupOnly = booksTableInfo.some((col) => col.name === 'group_only');
    
    if (!hasGroupOnly) {
      db.exec('ALTER TABLE books ADD COLUMN group_only INTEGER DEFAULT 0');
      console.log('已添加 group_only 字段到 books 表');
    }
  } catch (e) {
    console.error('添加 group_only 字段失败:', e);
  }

  // 检查并添加笔记表的可见性字段
  try {
    const notesTableInfo = db.prepare("PRAGMA table_info(notes)").all() as any[];
    const hasIsPublic = notesTableInfo.some((col) => col.name === 'is_public');
    const hasShareToGroup = notesTableInfo.some((col) => col.name === 'share_to_group_id');
    
    if (!hasIsPublic) {
      db.exec('ALTER TABLE notes ADD COLUMN is_public INTEGER DEFAULT 0');
      console.log('已添加 is_public 字段到 notes 表');
    }
    
    if (!hasShareToGroup) {
      db.exec('ALTER TABLE notes ADD COLUMN share_to_group_id TEXT');
      console.log('已添加 share_to_group_id 字段到 notes 表');
    }
  } catch (e) {
    console.error('添加笔记可见性字段失败:', e);
  }

  // 检查并添加高亮表的可见性字段
  try {
    const highlightsTableInfo = db.prepare("PRAGMA table_info(highlights)").all() as any[];
    const hasIsPublic = highlightsTableInfo.some((col) => col.name === 'is_public');
    const hasShareToGroup = highlightsTableInfo.some((col) => col.name === 'share_to_group_id');
    
    if (!hasIsPublic) {
      db.exec('ALTER TABLE highlights ADD COLUMN is_public INTEGER DEFAULT 0');
      console.log('已添加 is_public 字段到 highlights 表');
    }
    
    if (!hasShareToGroup) {
      db.exec('ALTER TABLE highlights ADD COLUMN share_to_group_id TEXT');
      console.log('已添加 share_to_group_id 字段到 highlights 表');
    }
  } catch (e) {
    console.error('添加高亮可见性字段失败:', e);
  }

  // AI对话历史表
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        UNIQUE(user_id, book_id)
      )
    `);
    
    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_book 
      ON ai_conversations(user_id, book_id);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at 
      ON ai_conversations(updated_at);
    `);
    console.log('AI对话历史表创建成功');
  } catch (e) {
    console.error('创建AI对话历史表失败:', e);
  }

  // 有声小说表
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobooks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        type TEXT NOT NULL DEFAULT '有声小说',
        description TEXT,
        cover_url TEXT,
        folder_path TEXT NOT NULL,
        uploader_id TEXT,
        is_public INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // 有声小说音频文件表
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_files (
        id TEXT PRIMARY KEY,
        audiobook_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        file_order INTEGER DEFAULT 0,
        duration REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id) ON DELETE CASCADE
      )
    `);
    
    // 有声小说章节表（用于单个音频文件的章节标记）
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_chapters (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        chapter_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES audiobook_files(id) ON DELETE CASCADE,
        UNIQUE(file_id, chapter_id)
      )
    `);
    
    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audiobooks_type ON audiobooks(type);
      CREATE INDEX IF NOT EXISTS idx_audiobooks_author ON audiobooks(author);
      CREATE INDEX IF NOT EXISTS idx_audiobooks_uploader_id ON audiobooks(uploader_id);
      CREATE INDEX IF NOT EXISTS idx_audiobooks_is_public ON audiobooks(is_public);
      CREATE INDEX IF NOT EXISTS idx_audiobook_files_audiobook_id ON audiobook_files(audiobook_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_files_file_order ON audiobook_files(audiobook_id, file_order);
      CREATE INDEX IF NOT EXISTS idx_audiobook_chapters_file_id ON audiobook_chapters(file_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_chapters_start_time ON audiobook_chapters(file_id, start_time);
    `);
    console.log('有声小说表创建成功');
  } catch (e) {
    console.error('创建有声小说表失败:', e);
  }

  // 有声小说播放进度表
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        audiobook_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        current_time REAL DEFAULT 0,
        duration REAL DEFAULT 0,
        progress REAL DEFAULT 0,
        last_played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES audiobook_files(id) ON DELETE CASCADE,
        UNIQUE(user_id, audiobook_id, file_id)
      )
    `);
    
    // ✅ 数据库迁移：如果表已存在但唯一约束不同，需要迁移
    try {
      // 检查是否存在旧的唯一约束索引
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audiobook_progress'").all() as any[];
      const hasOldIndex = indexes.some(idx => idx.name === 'sqlite_autoindex_audiobook_progress_1' || idx.name.includes('user_id') && idx.name.includes('audiobook_id') && !idx.name.includes('file_id'));
      
      if (hasOldIndex) {
        console.log('[数据库迁移] 检测到旧的audiobook_progress唯一约束，开始迁移...');
        // 创建临时表
        db.exec(`
          CREATE TABLE IF NOT EXISTS audiobook_progress_new (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            audiobook_id TEXT NOT NULL,
            file_id TEXT NOT NULL,
            current_time REAL DEFAULT 0,
            duration REAL DEFAULT 0,
            progress REAL DEFAULT 0,
            last_played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, audiobook_id, file_id)
          )
        `);
        
        // 复制数据（每个文件创建独立记录）
        const oldRecords = db.prepare('SELECT * FROM audiobook_progress').all() as any[];
        for (const record of oldRecords) {
          // 检查是否已存在该文件的记录
          const existing = db.prepare('SELECT id FROM audiobook_progress_new WHERE user_id = ? AND audiobook_id = ? AND file_id = ?')
            .get(record.user_id, record.audiobook_id, record.file_id);
          
          if (!existing) {
            db.prepare(`
              INSERT INTO audiobook_progress_new (id, user_id, audiobook_id, file_id, current_time, duration, progress, last_played_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              record.id || uuidv4(),
              record.user_id,
              record.audiobook_id,
              record.file_id,
              record.current_time || 0,
              record.duration || 0,
              record.progress || 0,
              record.last_played_at || new Date().toISOString(),
              record.updated_at || new Date().toISOString()
            );
          }
        }
        
        // 删除旧表并重命名新表
        db.exec('DROP TABLE audiobook_progress');
        db.exec('ALTER TABLE audiobook_progress_new RENAME TO audiobook_progress');
        console.log('[数据库迁移] audiobook_progress表迁移完成，现在支持每个文件独立进度');
      }
    } catch (migrationError: any) {
      console.warn('[数据库迁移] 迁移audiobook_progress表时出错，继续使用现有表:', migrationError.message);
    }
    
    // 有声小说书架表
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_shelves (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        audiobook_id TEXT NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id) ON DELETE CASCADE,
        UNIQUE(user_id, audiobook_id)
      )
    `);
    
    // 有声小说播放历史表
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        audiobook_id TEXT NOT NULL,
        last_played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_listening_time INTEGER DEFAULT 0,
        last_file_id TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id) ON DELETE CASCADE,
        FOREIGN KEY (last_file_id) REFERENCES audiobook_files(id) ON DELETE SET NULL,
        UNIQUE(user_id, audiobook_id)
      )
    `);
    
    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audiobook_progress_user ON audiobook_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_progress_audiobook ON audiobook_progress(audiobook_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_shelves_user ON audiobook_shelves(user_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_history_user ON audiobook_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_history_last_played ON audiobook_history(last_played_at DESC);
    `);
    console.log('有声小说播放进度和书架表创建成功');
  } catch (e) {
    console.error('创建有声小说播放进度和书架表失败:', e);
  }

  // 有声小说共享表
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_shares (
        id TEXT PRIMARY KEY,
        audiobook_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT,
        to_group_id TEXT,
        permission TEXT DEFAULT 'read',
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audiobook_id) REFERENCES audiobooks(id) ON DELETE CASCADE,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (to_group_id) REFERENCES user_groups(id) ON DELETE CASCADE
      )
    `);
    
    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audiobook_shares_audiobook ON audiobook_shares(audiobook_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_shares_from_user ON audiobook_shares(from_user_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_shares_to_user ON audiobook_shares(to_user_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_shares_to_group ON audiobook_shares(to_group_id);
      CREATE INDEX IF NOT EXISTS idx_audiobook_shares_expires ON audiobook_shares(expires_at);
    `);
    console.log('有声小说共享表创建成功');
  } catch (e) {
    console.error('创建有声小说共享表失败:', e);
  }

  console.log('数据库初始化完成');
}

