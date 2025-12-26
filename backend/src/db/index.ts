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

const dbPath = process.env.DB_PATH || './data/database.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: Database.Database = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

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

  // 初始化默认设置
  const defaultSettings = [
    { key: 'books_storage_path', value: './books', description: '书籍仓库保存路径' },
    { key: 'books_scan_path', value: './import', description: '书籍扫描路径' },
    { key: 'auto_convert_txt', value: 'true', description: '自动将TXT转换为EPUB' },
    { key: 'auto_convert_mobi', value: 'true', description: '自动将MOBI转换为EPUB' },
    { key: 'auto_fetch_douban', value: 'true', description: '自动从豆瓣获取书籍信息' },
    { key: 'auto_import_enabled', value: 'true', description: '启用自动导入功能（监控import目录）' },
    { key: 'douban_api_base', value: 'https://127.0.0.1:1552', description: '豆瓣API地址' },
    { key: 'opds_enabled', value: 'true', description: '启用OPDS功能' },
    { key: 'email_push_enabled', value: 'false', description: '启用邮件推送功能' },
    { key: 'smtp_host', value: '', description: 'SMTP服务器地址' },
    { key: 'smtp_port', value: '587', description: 'SMTP端口' },
    { key: 'smtp_user', value: '', description: 'SMTP用户名' },
    { key: 'smtp_password', value: '', description: 'SMTP密码' },
    { key: 'kindle_email', value: '', description: 'Kindle邮箱地址' },
    { key: 'private_access_key', value: '', description: '私有访问密钥' },
    { key: 'private_key_required_for_login', value: 'false', description: '登录时需要验证私有密钥' },
    { key: 'private_key_required_for_register', value: 'true', description: '注册时需要验证私有密钥' },
    { key: 'registration_enabled', value: 'true', description: '允许用户注册' },
    { key: 'private_access_enabled', value: 'false', description: '启用私有地址访问密钥验证（已废弃，使用上面的细分设置）' },
    { key: 'max_access_attempts', value: '10', description: '最大访问尝试次数（超过后禁用IP）' },
    { key: 'ai_provider', value: 'ollama', description: 'AI提供商（ollama/openai/deepseek）' },
    { key: 'ai_api_url', value: 'http://localhost:11434', description: 'AI API地址（Ollama默认）' },
    { key: 'ai_api_key', value: '', description: 'AI API密钥（OpenAI/DeepSeek需要）' },
    { key: 'ai_model', value: 'llama2', description: 'AI模型名称' },
    { key: 'tts_default_model', value: 'edge', description: '默认TTS引擎（edge/qwen3/indextts2/coqui/piper）' },
    { key: 'tts_default_voice', value: 'zh-CN-XiaoxiaoNeural', description: '默认TTS语音ID' },
    { key: 'tts_default_speed', value: '1.0', description: '默认TTS语速（0.5-3.0）' },
    { key: 'tts_auto_role', value: 'false', description: '是否启用自动角色识别' },
    { key: 'tts_server_host', value: '127.0.0.1', description: 'TTS服务器地址（IP或域名）' },
    { key: 'tts_server_port', value: '5050', description: 'TTS服务器端口' },
    { key: 'tts_test_sample', value: 'Hello, 你好！This is a test. 这是一个测试。', description: 'TTS音频测试内容样本（中英文混读）' },
    { key: 'system_language', value: 'zh-CN', description: '系统语言（zh-CN: 简体中文, en: English）' },
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO system_settings (id, key, value, description) VALUES (?, ?, ?, ?)');
  const updateSettingValue = db.prepare('UPDATE system_settings SET value = ? WHERE key = ?');
  const updateSettingDesc = db.prepare('UPDATE system_settings SET description = ? WHERE key = ?');
  
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
          (existing.value === 'http://192.168.6.6:1482' || !existing.value || existing.value.trim() === '')) {
        updateSettingValue.run(setting.value, setting.key);
      }
      
      // 特殊处理：如果 books_scan_path 为空，则更新为默认值 ./import
      if (setting.key === 'books_scan_path' && 
          (!existing.value || existing.value.trim() === '')) {
        updateSettingValue.run(setting.value, setting.key);
      }
    } else {
      // 如果不存在，插入新设置
    insertSetting.run(uuidv4(), setting.key, setting.value, setting.description);
    }
  });

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
      console.log('📚 欢迎使用 ReadKnows (读士私人书库)！');
          console.log('========================================');
      console.log('系统中暂无用户，正在创建默认管理员账号...');
      
      // 创建默认管理员账号
      try {
        const defaultUsername = 'books';
        const defaultPassword = 'books';
        const defaultEmail = 'admin@readknows.local';
        const defaultPrivateKey = 'books';
        
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

  console.log('数据库初始化完成');
}

