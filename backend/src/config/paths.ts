/**
 * @file paths.ts
 * @description 统一管理所有路径配置，确保所有运行时目录都在 data 目录下
 */

import path from 'path';
import fs from 'fs';

// 获取项目根目录（backend 目录的父目录）
// __dirname 在运行时是 backend/src（tsx）或 backend/dist（编译后）
// 向上两级到达项目根目录
const projectRoot = path.resolve(__dirname, '..', '..');

// 辅助函数：将相对路径解析为基于项目根目录的绝对路径
function resolveProjectPath(envVar: string | undefined, defaultRelativePath: string): string {
  if (envVar) {
    // 如果环境变量是绝对路径，直接使用
    if (path.isAbsolute(envVar)) {
      return envVar;
    }
    // 如果是相对路径，基于项目根目录解析
    return path.resolve(projectRoot, envVar);
  }
  // 使用默认相对路径，基于项目根目录解析
  return path.resolve(projectRoot, defaultRelativePath);
}

// 统一的数据目录（所有运行时数据都存放在这里）
const dataRoot = resolveProjectPath(process.env.DATA_ROOT, './data');

// 辅助函数：将路径解析为基于数据根目录的路径
function resolveDataPath(envVar: string | undefined, defaultSubPath: string): string {
  if (envVar) {
    // 如果环境变量是绝对路径，直接使用
    if (path.isAbsolute(envVar)) {
      return envVar;
    }
    // 如果是相对路径，基于项目根目录解析
    return path.resolve(projectRoot, envVar);
  }
  // 使用默认子路径，基于数据根目录解析
  return path.resolve(dataRoot, defaultSubPath);
}

// 确保数据根目录存在
if (!fs.existsSync(dataRoot)) {
  fs.mkdirSync(dataRoot, { recursive: true });
}

// 导出所有路径配置
export const paths = {
  // 项目根目录
  projectRoot,
  // 数据根目录
  dataRoot,
  // 书籍目录
  booksDir: resolveDataPath(process.env.BOOKS_DIR, 'books'),
  // 数据库路径
  dbPath: resolveDataPath(process.env.DB_PATH, 'database.db'),
  // 导入目录
  importDir: resolveDataPath(process.env.IMPORT_DIR, 'import'),
  // 消息目录
  messagesDir: resolveDataPath(process.env.MESSAGES_DIR, 'messages'),
  // 字体目录
  fontsDir: resolveDataPath(process.env.FONTS_DIR, 'fonts'),
  // 封面目录
  coversDir: resolveDataPath(process.env.COVERS_DIR, 'covers'),
  // 用户头像目录
  avatarsDir: resolveDataPath(process.env.AVATARS_DIR, 'avatars'),
  // OCR 缓存目录
  ocrCacheDir: resolveDataPath(process.env.OCR_CACHE_DIR, 'cache/ocr'),
  // TTS 缓存目录
  ttsCacheDir: resolveDataPath(process.env.TTS_CACHE_DIR, 'cache/tts'),
  // 有声小说目录
  audioDir: resolveDataPath(process.env.AUDIO_DIR, 'audio'),
  // 有声小说导入目录
  audioImportDir: resolveDataPath(process.env.AUDIO_IMPORT_DIR, 'audioimport'),
  // SSL证书目录
  sslDir: resolveDataPath(process.env.SSL_DIR, 'ssl'),
};

// 确保所有必要的目录存在
Object.entries(paths).forEach(([key, dirPath]) => {
  if (key !== 'projectRoot' && key !== 'dataRoot' && key !== 'dbPath') {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[路径配置] 创建目录 ${key}:`, dirPath);
    }
  } else if (key === 'dbPath') {
    // 数据库文件所在的目录
    const dbDir = path.dirname(dirPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`[路径配置] 创建数据库目录:`, dbDir);
    }
  }
});

// 导出单个路径（向后兼容）
export const booksDir = paths.booksDir;
export const importDir = paths.importDir;
export const messagesDir = paths.messagesDir;
export const fontsDir = paths.fontsDir;
export const coversDir = paths.coversDir;
export const avatarsDir = paths.avatarsDir;
export const dbPath = paths.dbPath;
export const ocrCacheDir = paths.ocrCacheDir;
export const ttsCacheDir = paths.ttsCacheDir;
export const audioDir = paths.audioDir;
export const audioImportDir = paths.audioImportDir;
export const sslDir = paths.sslDir;
