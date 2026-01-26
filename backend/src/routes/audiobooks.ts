/**
 * @file audiobooks.ts
 * @description 有声小说相关路由
 */

import express from 'express';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { db } from '../db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { audioDir, audioImportDir, coversDir } from '../config/paths';
import { generateDefaultAudiobookCover } from '../utils/audiobookCoverGenerator';
import * as iconv from 'iconv-lite';

// 修复文件名编码问题（处理中文乱码）
function fixFileNameEncoding(fileName: string): string {
  try {
    // 如果文件名已经是正确的UTF-8且包含中文字符，直接返回
    const hasChinese = /[\u4e00-\u9fff]/.test(fileName);
    const hasReplacementChar = /[\uFFFD]/.test(fileName);
    
    // 如果文件名包含中文字符且没有替换字符，且看起来是有效的UTF-8，直接返回
    if (hasChinese && !hasReplacementChar) {
      // 验证是否是有效的UTF-8（通过重新编码检查）
      try {
        const utf8Bytes = Buffer.from(fileName, 'utf8');
        const redecoded = utf8Bytes.toString('utf8');
        if (redecoded === fileName) {
          // 已经是正确的UTF-8中文文件名
          return fileName;
        }
      } catch (e) {
        // 继续尝试修复
      }
    }

    // 如果文件名不包含中文字符或包含乱码，尝试修复
    console.log('[文件名编码修复] 原始文件名:', fileName);
    console.log('[文件名编码修复] 原始文件名Buffer (hex):', Buffer.from(fileName).toString('hex'));

    // 方法1: 尝试从Latin1解码（最常见问题：UTF-8字节被误读为Latin1字符）
    // 这是macOS/Linux上最常见的问题：文件系统返回UTF-8字节，但被解释为Latin1字符串
    try {
      // 将字符串按Latin1编码获取字节，然后按UTF-8解码
      const latin1Bytes = Buffer.from(fileName, 'latin1');
      const utf8Decoded = latin1Bytes.toString('utf8');
      // 检查解码后的字符串是否包含中文字符且没有乱码
      if (!/[\uFFFD]/.test(utf8Decoded) && /[\u4e00-\u9fff]/.test(utf8Decoded)) {
        console.log('[文件名编码修复] ✅ 使用Latin1->UTF8解码:', utf8Decoded);
        return utf8Decoded;
      }
    } catch (e) {
      // 忽略Latin1解码错误
    }

    // 方法2: 尝试使用iconv-lite从GBK/GB2312解码（常见的中文编码）
    try {
      const gbkDecoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'gbk');
      if (!/[\uFFFD]/.test(gbkDecoded) && /[\u4e00-\u9fff]/.test(gbkDecoded)) {
        console.log('[文件名编码修复] ✅ 使用GBK解码:', gbkDecoded);
        return gbkDecoded;
      }
    } catch (e) {
      // 忽略GBK解码错误
    }

    // 方法3: 尝试使用iconv-lite从GB2312解码
    try {
      const gb2312Decoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'gb2312');
      if (!/[\uFFFD]/.test(gb2312Decoded) && /[\u4e00-\u9fff]/.test(gb2312Decoded)) {
        console.log('[文件名编码修复] ✅ 使用GB2312解码:', gb2312Decoded);
        return gb2312Decoded;
      }
    } catch (e) {
      // 忽略GB2312解码错误
    }

    // 方法4: 尝试从binary解码
    try {
      const binaryBuffer = Buffer.from(fileName, 'binary');
      const utf8FromBinary = binaryBuffer.toString('utf8');
      if (!/[\uFFFD]/.test(utf8FromBinary) && /[\u4e00-\u9fff]/.test(utf8FromBinary)) {
        console.log('[文件名编码修复] ✅ 使用binary->UTF8解码:', utf8FromBinary);
        return utf8FromBinary;
      }
    } catch (e) {
      // 忽略binary解码错误
    }

    // 方法5: 尝试直接使用iconv-lite从UTF-8解码（处理双重编码）
    try {
      const doubleEncoded = iconv.decode(Buffer.from(fileName, 'latin1'), 'utf8');
      if (!/[\uFFFD]/.test(doubleEncoded) && /[\u4e00-\u9fff]/.test(doubleEncoded)) {
        console.log('[文件名编码修复] ✅ 使用双重UTF-8解码:', doubleEncoded);
        return doubleEncoded;
      }
    } catch (e) {
      // 忽略双重编码解码错误
    }

    // 方法6: 如果包含乱码字符，尝试修复
    if (/[\uFFFD]/.test(fileName)) {
      try {
        // 将文件名作为字节序列重新解释
        const bytes = Buffer.from(fileName, 'latin1');
        const fixed = bytes.toString('utf8');
        if (!/[\uFFFD]/.test(fixed) && fixed.length > 0) {
          console.log('[文件名编码修复] ✅ 使用字节序列修复:', fixed);
          return fixed;
        }
      } catch (e) {
        // 忽略修复错误
      }
    }

    // 如果所有方法都失败，返回原文件名
    console.warn('[文件名编码修复] ⚠️ 无法修复编码，使用原文件名:', fileName);
    return fileName;
  } catch (error) {
    console.error('[文件名编码修复] ❌ 修复过程出错:', error);
    return fileName;
  }
}

const router = express.Router();

// 确保目录存在
// 音频文件存储在文件系统中，路径为: audioDir/{audiobookId}/
// 例如: app/data/audio/{audiobookId}/
// 数据库只存储文件路径等元数据，不存储文件内容
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
  console.log(`[音频文件存储] 创建音频目录: ${audioDir}`);
} else {
  console.log(`[音频文件存储] 音频文件存储目录: ${audioDir}`);
}
if (!fs.existsSync(audioImportDir)) {
  fs.mkdirSync(audioImportDir, { recursive: true });
}

// 支持的音频文件格式
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma'];

// 配置multer用于封面图片上传
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    cb(null, coversDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `audiobook_${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式，仅支持 JPG、PNG、GIF、WebP'));
    }
  },
});

// 清理 HTML 标签的工具函数
function stripHtmlTags(html: string): string {
  if (!html || typeof html !== 'string') {
    return html;
  }
  // 移除所有 HTML 标签
  let text = html.replace(/<[^>]*>/g, '');
  // 解码 HTML 实体
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // 处理其他常见的 HTML 实体
  text = text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  text = text.replace(/&#x([a-f\d]+);/gi, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  // 清理多余的空白字符
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// 清理元数据中的 HTML 标签
function cleanMetadata(metadata: any): any {
  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }
  const cleaned = { ...metadata };
  // 清理 description 字段
  if (cleaned.description && typeof cleaned.description === 'string') {
    cleaned.description = stripHtmlTags(cleaned.description);
  }
  // 清理 summary 字段（如果有）
  if (cleaned.summary && typeof cleaned.summary === 'string') {
    cleaned.summary = stripHtmlTags(cleaned.summary);
  }
  return cleaned;
}

// 扫描audioimport目录，按文件夹组织
router.post('/scan-folders', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!fs.existsSync(audioImportDir)) {
      return res.status(400).json({ error: '导入目录不存在' });
    }

    const folders: any[] = [];
    const processedPaths = new Set<string>(); // 记录已处理的路径，避免重复

    // 查找目录下的直接音频文件（不包括子目录）
    function findDirectAudioFiles(dir: string): any[] {
      const files: any[] = [];
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        for (const item of items) {
          const itemPath = path.join(dir, item);
          try {
            const itemStat = fs.statSync(itemPath);
            if (itemStat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (AUDIO_EXTENSIONS.includes(ext)) {
                // ✅ 修复：修复文件名编码
                const fixedName = fixFileNameEncoding(item);
                files.push({
                  name: fixedName,
                  path: itemPath,
                  size: itemStat.size,
                  type: ext.substring(1),
                });
              }
            }
          } catch (error: any) {
            // 忽略无法访问的文件
          }
        }
      } catch (error: any) {
        // 忽略无法读取的目录
      }
      return files;
    }

    // 检查目录的直接子目录中是否有包含音频文件的目录（只检查直接子目录，不递归）
    function hasAudioSubdirectories(dir: string): boolean {
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        for (const item of items) {
          const itemPath = path.join(dir, item);
          try {
            const itemStat = fs.statSync(itemPath);
            if (itemStat.isDirectory()) {
              // 只检查直接子目录，不递归
              const directAudioFiles = findDirectAudioFiles(itemPath);
              if (directAudioFiles.length > 0) {
                return true; // 找到包含音频文件的直接子目录
              }
            }
          } catch (error: any) {
            // 忽略无法访问的子目录
          }
        }
      } catch (error: any) {
        // 忽略无法读取的目录
      }
      return false;
    }

    // 扫描audioimport目录下的所有文件夹
    function scanDirectory(dir: string, relativePath: string = ''): void {
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });

        for (const item of items) {
          const itemPath = path.join(dir, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          
          // 如果已经处理过这个路径，跳过
          if (processedPaths.has(itemPath)) {
            continue;
          }
          
          try {
            const itemStat = fs.statSync(itemPath);

            if (itemStat.isDirectory()) {
              // 检查该文件夹下是否有音频文件
              const audioFiles = findAudioFiles(itemPath);
              
              // 检查是否有包含音频文件的子目录
              const hasSubdirsWithAudio = hasAudioSubdirectories(itemPath);
              
              // 如果该目录有包含音频文件的子目录，只显示父目录，不显示子目录
              if (hasSubdirsWithAudio) {
                // 这是父目录，收集所有子目录的音频文件
                const allAudioFiles: any[] = [];
                const subdirs: string[] = [];
                
                // 递归收集所有子目录的音频文件
                function collectSubdirAudio(subDir: string): void {
                  const subItems = fs.readdirSync(subDir, { encoding: 'utf8' });
                  for (const subItem of subItems) {
                    const subItemPath = path.join(subDir, subItem);
                    try {
                      const subItemStat = fs.statSync(subItemPath);
                      if (subItemStat.isDirectory()) {
                        const subAudioFiles = findAudioFiles(subItemPath);
                        if (subAudioFiles.length > 0) {
                          subdirs.push(subItemPath);
                          allAudioFiles.push(...subAudioFiles);
                          processedPaths.add(subItemPath); // 标记子目录已处理
                        }
                        collectSubdirAudio(subItemPath); // 继续递归
                      }
                    } catch (error: any) {
                      // 忽略无法访问的子目录
                    }
                  }
                }
                
                collectSubdirAudio(itemPath);
                
                // 也检查当前目录本身是否有音频文件
                const directAudioFiles = audioFiles.filter(f => {
                  const fileDir = path.dirname(f.path);
                  return fileDir === itemPath; // 只包含直接在当前目录下的文件
                });
                
                const totalAudioFiles = [...directAudioFiles, ...allAudioFiles];
                
                if (totalAudioFiles.length > 0) {
                  // 检查父目录的封面和元数据
                  const coverExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
                  let hasCover = false;
                  let hasMetadata = false;
                  let metadataInfo: any = null;

                  // 检查封面（优先检查父目录）
                  for (const ext of coverExtensions) {
                    const possibleCoverPaths = [
                      path.join(itemPath, `cover${ext}`),
                      path.join(itemPath, `Cover${ext}`),
                      path.join(itemPath, `COVER${ext}`),
                    ];
                    
                    for (const possiblePath of possibleCoverPaths) {
                      if (fs.existsSync(possiblePath)) {
                        hasCover = true;
                        break;
                      }
                    }
                    
                    if (hasCover) break;
                  }

                  // 检查元数据（优先检查父目录）
                  const metadataPaths = [
                    path.join(itemPath, 'metadata.json'),
                    path.join(itemPath, 'Metadata.json'),
                    path.join(itemPath, 'METADATA.json'),
                  ];

                  for (const metadataPath of metadataPaths) {
                    if (fs.existsSync(metadataPath)) {
                      hasMetadata = true;
                      try {
                        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
                        metadataInfo = JSON.parse(metadataContent);
                        // 清理 HTML 标签
                        metadataInfo = cleanMetadata(metadataInfo);
                      } catch (error: any) {
                        console.warn(`解析元数据文件失败 ${metadataPath}:`, error);
                      }
                      break;
                    }
                  }

                  folders.push({
                    folderName: item,
                    folderPath: itemPath,
                    relativePath: relativeItemPath,
                    audioFileCount: totalAudioFiles.length,
                    totalSize: totalAudioFiles.reduce((sum, f) => sum + f.size, 0),
                    hasCover,
                    hasMetadata,
                    metadata: metadataInfo,
                    audioFiles: totalAudioFiles.map(f => ({
                      name: f.name,
                      path: f.path,
                      size: f.size,
                      type: f.type,
                    })),
                    hasSubdirectories: true, // 标记有子目录
                  });
                  
                  processedPaths.add(itemPath); // 标记已处理
                }
              } else if (audioFiles.length > 0) {
                // 该目录有音频文件但没有包含音频文件的子目录，正常显示
                // 检查是否有封面和元数据
                const coverExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
                let hasCover = false;
                let hasMetadata = false;
                let metadataInfo: any = null;

                // 检查封面
                for (const ext of coverExtensions) {
                  const possibleCoverPaths = [
                    path.join(itemPath, `cover${ext}`),
                    path.join(itemPath, `Cover${ext}`),
                    path.join(itemPath, `COVER${ext}`),
                  ];
                  
                  for (const possiblePath of possibleCoverPaths) {
                    if (fs.existsSync(possiblePath)) {
                      hasCover = true;
                      break;
                    }
                  }
                  
                  if (hasCover) break;
                }

                // 检查元数据
                const metadataPaths = [
                  path.join(itemPath, 'metadata.json'),
                  path.join(itemPath, 'Metadata.json'),
                  path.join(itemPath, 'METADATA.json'),
                ];

                for (const metadataPath of metadataPaths) {
                  if (fs.existsSync(metadataPath)) {
                    hasMetadata = true;
                    try {
                      const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
                      metadataInfo = JSON.parse(metadataContent);
                      // 清理 HTML 标签
                      metadataInfo = cleanMetadata(metadataInfo);
                    } catch (error: any) {
                      console.warn(`解析元数据文件失败 ${metadataPath}:`, error);
                    }
                    break;
                  }
                }

                folders.push({
                  folderName: item,
                  folderPath: itemPath,
                  relativePath: relativeItemPath,
                  audioFileCount: audioFiles.length,
                  totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
                  hasCover,
                  hasMetadata,
                  metadata: metadataInfo,
                  audioFiles: audioFiles.map(f => ({
                    name: f.name,
                    path: f.path,
                    size: f.size,
                    type: f.type,
                  })),
                });
                
                processedPaths.add(itemPath); // 标记已处理
              }
              
              // 只有在不是父目录的情况下才递归扫描子目录
              // 如果已经作为父目录处理过，就不再递归
              if (!processedPaths.has(itemPath)) {
                scanDirectory(itemPath, relativeItemPath);
              }
            }
          } catch (error: any) {
            console.error(`扫描目录失败 ${itemPath}:`, error.message);
          }
        }
      } catch (error: any) {
        console.error(`扫描目录失败 ${dir}:`, error.message);
      }
    }

    // 查找目录下的所有音频文件
    function findAudioFiles(dir: string): any[] {
      const files: any[] = [];
      
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          
          try {
            const itemStat = fs.statSync(itemPath);
            
            if (itemStat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (AUDIO_EXTENSIONS.includes(ext)) {
                // ✅ 修复：修复文件名编码
                const fixedName = fixFileNameEncoding(item);
                files.push({
                  name: fixedName,
                  path: itemPath,
                  size: itemStat.size,
                  type: ext.substring(1),
                });
              }
            } else if (itemStat.isDirectory()) {
              // 递归查找子目录中的音频文件
              files.push(...findAudioFiles(itemPath));
            }
          } catch (error: any) {
            console.error(`处理文件失败 ${itemPath}:`, error.message);
          }
        }
      } catch (error: any) {
        console.error(`查找音频文件失败 ${dir}:`, error.message);
      }
      
      return files;
    }

    scanDirectory(audioImportDir);

    res.json({
      success: true,
      folders: folders.sort((a, b) => a.folderName.localeCompare(b.folderName)),
    });
  } catch (error: any) {
    console.error('扫描文件夹失败:', error);
    res.status(500).json({ error: '扫描文件夹失败: ' + error.message });
  }
});

// 导入有声小说（需要权限）
router.post('/import', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = db.prepare('SELECT role, can_upload_audiobook FROM users WHERE id = ?').get(userId) as any;
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查上传有声小说权限（管理员不受限制）
    if (user.role !== 'admin') {
      const canUploadAudiobook = user.can_upload_audiobook !== undefined && user.can_upload_audiobook !== null
        ? user.can_upload_audiobook === 1
        : false; // 默认为false（需要权限）
      
      if (!canUploadAudiobook) {
        console.log(`[导入有声小说] 权限被拒绝: 用户 ${userId} 尝试导入有声小说，但上传权限已被禁用`);
        return res.status(403).json({ error: '您没有权限上传有声小说，请联系管理员开启此权限' });
      }
    }

    const { folderPath, title, author, type, isPublic } = req.body;

    if (!folderPath || !title || !type) {
      return res.status(400).json({ error: '请提供文件夹路径、标题和类型' });
    }

    const publicMode = isPublic === true || isPublic === 'true';

    // 验证文件夹路径
    if (!fs.existsSync(folderPath)) {
      return res.status(400).json({ error: '文件夹路径不存在' });
    }

    // 查找文件夹下的所有音频文件（递归）
    function findAllAudioFiles(dir: string): any[] {
      const files: any[] = [];
      
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        
        // 先收集文件，再收集目录
        const fileItems: string[] = [];
        const dirItems: string[] = [];
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const itemStat = fs.statSync(itemPath);
          
          if (itemStat.isFile()) {
            fileItems.push(item);
          } else if (itemStat.isDirectory()) {
            dirItems.push(item);
          }
        }
        
        // 处理文件（按名称排序）
        fileItems.sort().forEach(item => {
          const itemPath = path.join(dir, item);
          const ext = path.extname(item).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) {
            const stat = fs.statSync(itemPath);
            // ✅ 修复：修复文件名编码
            const fixedName = fixFileNameEncoding(item);
            files.push({
              name: fixedName,
              path: itemPath,
              size: stat.size,
              type: ext.substring(1),
            });
          }
        });
        
        // 递归处理子目录（按名称排序）
        dirItems.sort().forEach(item => {
          const itemPath = path.join(dir, item);
          files.push(...findAllAudioFiles(itemPath));
        });
      } catch (error: any) {
        console.error(`查找音频文件失败 ${dir}:`, error.message);
      }
      
      return files;
    }

    const audioFiles = findAllAudioFiles(folderPath);

    if (audioFiles.length === 0) {
      return res.status(400).json({ error: '文件夹中没有找到音频文件' });
    }

    // 检查是否有封面图片和元数据文件
    const coverExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    let coverPath: string | null = null;
    let metadata: any = null;

    // 查找封面图片
    for (const ext of coverExtensions) {
      const possibleCoverPaths = [
        path.join(folderPath, `cover${ext}`),
        path.join(folderPath, `Cover${ext}`),
        path.join(folderPath, `COVER${ext}`),
      ];
      
      for (const possiblePath of possibleCoverPaths) {
        if (fs.existsSync(possiblePath)) {
          coverPath = possiblePath;
          break;
        }
      }
      
      if (coverPath) break;
    }

    // 查找元数据文件
    const metadataPaths = [
      path.join(folderPath, 'metadata.json'),
      path.join(folderPath, 'Metadata.json'),
      path.join(folderPath, 'METADATA.json'),
    ];

    for (const metadataPath of metadataPaths) {
      if (fs.existsSync(metadataPath)) {
        try {
          const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
          metadata = JSON.parse(metadataContent);
          // 清理 HTML 标签
          metadata = cleanMetadata(metadata);
          break;
        } catch (error: any) {
          console.warn(`解析元数据文件失败 ${metadataPath}:`, error);
        }
      }
    }

    // 如果元数据中有标题和作者，优先使用
    const finalTitle = metadata?.title || title;
    const finalAuthor = metadata?.author || author || null;
    const finalDescription = metadata?.description || metadata?.summary || null;

    // 创建有声小说记录
    const audiobookId = uuidv4();
    const now = new Date().toISOString();
    
    // 确定目标文件夹路径
    const targetFolderName = path.basename(folderPath);
    const targetFolderPath = path.join(audioDir, audiobookId);
    
    // 确保目标目录存在
    if (!fs.existsSync(targetFolderPath)) {
      fs.mkdirSync(targetFolderPath, { recursive: true });
    }

    // 处理封面图片
    let coverUrl: string | null = null;
    
    if (coverPath && fs.existsSync(coverPath)) {
      try {
        // 确保封面目录存在
        if (!fs.existsSync(coversDir)) {
          fs.mkdirSync(coversDir, { recursive: true });
        }

        // 生成封面文件名
        const coverExt = path.extname(coverPath);
        const coverFileName = `${audiobookId}${coverExt}`;
        const targetCoverPath = path.join(coversDir, coverFileName);

        // 复制封面文件
        fs.copyFileSync(coverPath, targetCoverPath);
        coverUrl = coverFileName;
        console.log(`已复制封面: ${coverPath} -> ${targetCoverPath}`);
      } catch (error: any) {
        console.error(`复制封面失败:`, error);
      }
    }

    // 如果没有封面，生成默认封面
    if (!coverUrl) {
      try {
        coverUrl = await generateDefaultAudiobookCover(audiobookId, finalTitle, finalAuthor);
      } catch (error: any) {
        console.error(`生成默认封面失败:`, error);
      }
    }

    // 保存有声小说记录
    db.prepare(`
      INSERT INTO audiobooks (
        id, title, author, type, description, cover_url, folder_path, uploader_id, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      audiobookId,
      finalTitle,
      finalAuthor,
      type,
      finalDescription,
      coverUrl,
      targetFolderPath,
      userId,
      publicMode ? 1 : 0,
      now,
      now
    );

    // 复制音频文件到目标目录并创建文件记录
    const fileRecords: any[] = [];
    let fileOrder = 0;
    let firstFileId: string | null = null; // 用于存储第一个文件的ID，章节信息将关联到这个文件

    for (const audioFile of audioFiles) {
      // ✅ 修复：使用 fixFileNameEncoding 函数修复文件名编码
      const safeFileName = fixFileNameEncoding(audioFile.name);
      
      const targetFileName = `${String(fileOrder + 1).padStart(4, '0')}_${safeFileName}`;
      const targetFilePath = path.join(targetFolderPath, targetFileName);

      // 复制文件
      try {
        fs.copyFileSync(audioFile.path, targetFilePath);
      } catch (error: any) {
        console.error(`复制文件失败 ${audioFile.path} -> ${targetFilePath}:`, error);
        continue;
      }

      // 创建文件记录
      const fileId = uuidv4();
      if (fileOrder === 0) {
        firstFileId = fileId; // 保存第一个文件的ID
      }
      
      db.prepare(`
        INSERT INTO audiobook_files (
          id, audiobook_id, file_path, file_name, file_size, file_type, file_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        audiobookId,
        targetFilePath,
        targetFileName,
        audioFile.size,
        audioFile.type,
        fileOrder
      );

      fileRecords.push({
        id: fileId,
        fileName: targetFileName,
        fileSize: audioFile.size,
        fileType: audioFile.type,
        fileOrder,
      });

      fileOrder++;
    }

    // 如果元数据中有章节信息，且只有一个音频文件，则保存章节信息
    if (metadata?.chapters && Array.isArray(metadata.chapters) && metadata.chapters.length > 0 && firstFileId) {
      // 如果只有一个文件，章节信息属于这个文件
      // 如果有多个文件，章节信息属于第一个文件（可以根据需要调整逻辑）
      const targetFileId = audioFiles.length === 1 ? firstFileId : firstFileId;
      
      for (const chapter of metadata.chapters) {
        if (chapter.id !== undefined && chapter.title && chapter.start !== undefined && chapter.end !== undefined) {
          const chapterId = uuidv4();
          db.prepare(`
            INSERT INTO audiobook_chapters (
              id, file_id, chapter_id, title, start_time, end_time
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            chapterId,
            targetFileId,
            chapter.id,
            chapter.title,
            chapter.start,
            chapter.end
          );
        }
      }
      console.log(`已保存 ${metadata.chapters.length} 个章节信息到文件 ${targetFileId}`);
    }

    res.json({
      success: true,
      audiobook: {
        id: audiobookId,
        title,
        author,
        type,
        fileCount: fileRecords.length,
      },
      files: fileRecords,
    });
  } catch (error: any) {
    console.error('导入有声小说失败:', error);
    res.status(500).json({ error: '导入有声小说失败: ' + error.message });
  }
});

// 获取有声小说列表
router.get('/list', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { search, page = 1, pageSize = 20 } = req.query;

    let query = 'SELECT * FROM audiobooks WHERE 1=1';
    const params: any[] = [];

    // 权限过滤：只能看到公开的或自己上传的
    query += ' AND (is_public = 1 OR uploader_id = ?)';
    params.push(userId);

    // 模糊搜索：支持标题和作者
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query += ' AND (title LIKE ? OR author LIKE ? OR type LIKE ?)';
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    // 分页
    const offset = (Number(page) - 1) * Number(pageSize);
    query += ' LIMIT ? OFFSET ?';
    params.push(Number(pageSize), offset);

    const audiobooks = db.prepare(query).all(...params) as any[];

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as count FROM audiobooks WHERE 1=1';
    const countParams: any[] = [];
    
    countQuery += ' AND (is_public = 1 OR uploader_id = ?)';
    countParams.push(userId);

    // 模糊搜索：支持标题和作者
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      countQuery += ' AND (title LIKE ? OR author LIKE ? OR type LIKE ?)';
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const totalResult = db.prepare(countQuery).get(...countParams) as any;
    const total = totalResult.count;

    // 为每个有声小说获取文件数量
    const audiobooksWithFileCount = audiobooks.map(ab => {
      const fileCount = db.prepare('SELECT COUNT(*) as count FROM audiobook_files WHERE audiobook_id = ?')
        .get(ab.id) as any;
      return {
        ...ab,
        fileCount: fileCount.count,
      };
    });

    res.json({
      success: true,
      audiobooks: audiobooksWithFileCount,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (error: any) {
    console.error('获取有声小说列表失败:', error);
    res.status(500).json({ error: '获取有声小说列表失败: ' + error.message });
  }
});

// 获取所有作者列表（用于下拉选择）
router.get('/authors/list', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    const authors = db.prepare(`
      SELECT DISTINCT author 
      FROM audiobooks 
      WHERE (is_public = 1 OR uploader_id = ?) AND author IS NOT NULL AND author != ''
      ORDER BY author ASC
    `).all(userId) as any[];

    res.json({
      success: true,
      authors: authors.map(a => a.author),
    });
  } catch (error: any) {
    console.error('获取作者列表失败:', error);
    res.status(500).json({ error: '获取作者列表失败: ' + error.message });
  }
});

// 获取有声小说详情
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;

    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    // 检查权限
    if (audiobook.is_public === 0 && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声小说' });
    }

    // 获取音频文件列表
    const files = db.prepare(`
      SELECT * FROM audiobook_files 
      WHERE audiobook_id = ? 
      ORDER BY file_order ASC
    `).all(id) as any[];

    // 为每个文件获取章节信息
    const filesWithChapters = files.map(f => {
      const chapters = db.prepare(`
        SELECT * FROM audiobook_chapters 
        WHERE file_id = ? 
        ORDER BY start_time ASC
      `).all(f.id) as any[];
      
      return {
        ...f,
        chapters: chapters.map(c => ({
          id: c.chapter_id,
          title: c.title,
          start: c.start_time,
          end: c.end_time,
        })),
      };
    });

    res.json({
      success: true,
      audiobook: {
        ...audiobook,
        files: filesWithChapters,
      },
    });
  } catch (error: any) {
    console.error('获取有声小说详情失败:', error);
    res.status(500).json({ error: '获取有声小说详情失败: ' + error.message });
  }
});

// 获取音频文件
router.get('/:id/files/:fileId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.userId!;

    // ✅ 性能优化：合并数据库查询，一次性获取有声小说和文件信息
    const result = db.prepare(`
      SELECT 
        ab.id as audiobook_id,
        ab.is_public,
        ab.uploader_id,
        af.id as file_id,
        af.file_path,
        af.file_type,
        af.file_name,
        af.file_size
      FROM audiobooks ab
      INNER JOIN audiobook_files af ON af.audiobook_id = ab.id
      WHERE ab.id = ? AND af.id = ?
    `).get(id, fileId) as any;

    if (!result) {
      return res.status(404).json({ error: '有声小说或音频文件不存在' });
    }

    // 检查权限
    if (result.is_public === 0 && result.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声小说' });
    }

    // ✅ 性能优化：使用异步文件操作，避免阻塞
    const statAsync = promisify(fs.stat);
    let stat: fs.Stats;
    try {
      stat = await statAsync(result.file_path);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: '音频文件不存在于文件系统' });
      }
      throw error;
    }
    const range = req.headers.range;

    // 根据文件类型设置Content-Type
    const contentTypeMap: { [key: string]: string } = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
      wma: 'audio/x-ms-wma',
    };

    const contentType = contentTypeMap[result.file_type.toLowerCase()] || 'audio/mpeg';

    // ✅ 修复：设置CORS头，确保跨域请求正常工作
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    // ✅ 修复：音频文件不应被缓存，避免Workbox缓存错误
    // 设置no-cache确保浏览器不缓存音频文件
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // 设置ETag和Last-Modified用于缓存验证
    const etag = `"${stat.size}-${stat.mtime.getTime()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    
    // 检查If-None-Match和If-Modified-Since请求头
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];
    
    if (ifNoneMatch === etag || (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime)) {
      // 文件未修改，返回304 Not Modified
      res.status(304).end();
      return;
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', stat.size);

    // ✅ 性能优化：记录请求开始时间（用于性能监控）
    const startTime = Date.now();

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;

      // 验证范围有效性
      if (start < 0 || start >= stat.size || end < start || end >= stat.size) {
        res.status(416).json({ error: 'Range Not Satisfiable' });
        return;
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunksize);

      // ✅ 性能优化：设置较大的缓冲区大小（64KB），提高传输效率
      const fileStream = fs.createReadStream(result.file_path, { 
        start, 
        end,
        highWaterMark: 64 * 1024 // 64KB 缓冲区
      });
      
      fileStream.on('error', (error) => {
        console.error('[音频文件] 流读取错误:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: '读取音频文件失败' });
        }
      });

      fileStream.on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`[音频文件] Range请求完成: ${chunksize} bytes, 耗时: ${duration}ms`);
      });

      fileStream.pipe(res);
    } else {
      // ✅ 性能优化：设置较大的缓冲区大小（64KB），提高传输效率
      const fileStream = fs.createReadStream(result.file_path, {
        highWaterMark: 64 * 1024 // 64KB 缓冲区
      });
      
      fileStream.on('error', (error) => {
        console.error('[音频文件] 流读取错误:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: '读取音频文件失败' });
        }
      });

      fileStream.on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`[音频文件] 完整文件传输完成: ${stat.size} bytes, 耗时: ${duration}ms`);
      });

      fileStream.pipe(res);
    }
  } catch (error: any) {
    console.error('获取音频文件失败:', error);
    res.status(500).json({ error: '获取音频文件失败: ' + error.message });
  }
});

// 更新音频文件时长
router.put('/:id/files/:fileId/duration', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.userId!;
    const { duration } = req.body;

    if (!duration || duration <= 0) {
      return res.status(400).json({ error: '无效的时长值' });
    }

    // 检查有声小说权限
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    if (audiobook.is_public === 0 && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声小说' });
    }

    // 检查文件是否存在
    const file = db.prepare('SELECT * FROM audiobook_files WHERE id = ? AND audiobook_id = ?')
      .get(fileId, id) as any;

    if (!file) {
      return res.status(404).json({ error: '音频文件不存在' });
    }

    // 更新时长（只在当前时长为空或0时更新）
    if (!file.duration || file.duration === 0) {
      db.prepare('UPDATE audiobook_files SET duration = ? WHERE id = ? AND audiobook_id = ?')
        .run(duration, fileId, id);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('更新音频文件时长失败:', error);
    res.status(500).json({ error: '更新音频文件时长失败: ' + error.message });
  }
});

// 保存播放进度
router.post('/:id/progress', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { fileId, currentTime, duration, updateLastFileIdOnly, clientTimestamp } = req.body; // ✅ 新增：支持只更新last_file_id和客户端时间戳

    if (!fileId || currentTime === undefined) {
      return res.status(400).json({ error: '请提供文件ID和当前播放时间' });
    }

    // 检查权限
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    if (audiobook.is_public === 0 && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声小说' });
    }

    const now = new Date().toISOString();

    // ✅ 修复：如果updateLastFileIdOnly为true，只更新last_file_id，不更新进度记录
    if (updateLastFileIdOnly) {
      const historyExisting = db.prepare('SELECT id FROM audiobook_history WHERE user_id = ? AND audiobook_id = ?')
        .get(userId, id) as any;

      if (historyExisting) {
        db.prepare(`
          UPDATE audiobook_history 
          SET last_played_at = ?, last_file_id = ?
          WHERE user_id = ? AND audiobook_id = ?
        `).run(now, fileId, userId, id);
        console.log('[AudiobookProgress] 只更新last_file_id', { userId, audiobookId: id, fileId, now });
      } else {
        const historyId = uuidv4();
        db.prepare(`
          INSERT INTO audiobook_history (
            id, user_id, audiobook_id, last_played_at, last_file_id
          ) VALUES (?, ?, ?, ?, ?)
        `).run(historyId, userId, id, now, fileId);
        console.log('[AudiobookProgress] 创建播放历史（只更新last_file_id）', { userId, audiobookId: id, fileId, now });
      }

      res.json({ success: true });
      return;
    }

    // 正常保存进度逻辑
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // ✅ 修复：检查是否已存在该文件的进度记录（每个文件独立进度）
    const existing = db.prepare('SELECT * FROM audiobook_progress WHERE user_id = ? AND audiobook_id = ? AND file_id = ?')
      .get(userId, id, fileId) as any;

    if (existing) {
      // ✅ 修复：如果duration为0，保留原有的duration和progress，只更新last_played_at
      // 这样可以避免切换文件时覆盖已有进度
      if (duration === 0 && existing.duration > 0) {
        // 只更新last_played_at，不更新进度
        db.prepare(`
          UPDATE audiobook_progress 
          SET last_played_at = ?, updated_at = ?
          WHERE user_id = ? AND audiobook_id = ? AND file_id = ?
        `).run(now, now, userId, id, fileId);
        console.log('[AudiobookProgress] 保留原有进度，只更新last_played_at', { userId, audiobookId: id, fileId });
      } else {
        // ✅ 修复：改进并发控制逻辑
        // 比较更新时间，如果当前请求更新，则使用新数据
        // 如果是旧数据（last_played_at 比现有记录早），则忽略更新
        const existingTime = new Date(existing.last_played_at || existing.updated_at || 0).getTime();
        const currentTimeStamp = Date.now();

        // 如果当前请求的"播放时间"明显早于现有记录（相差超过30秒），可能是并发冲突
        const timeDiff = Math.abs((existing.current_time || 0) - currentTime);
        const isConcurrentConflict = timeDiff > 30; // 30秒阈值

        let finalCurrentTime: number;
        let finalDuration: number;
        let shouldUpdate = true;

        if (isConcurrentConflict) {
          // 并发冲突：使用播放进度更靠后的那个（避免进度倒退）
          finalCurrentTime = Math.max(existing.current_time || 0, currentTime);
          finalDuration = duration > 0 ? duration : existing.duration || 0;
          console.log('[AudiobookProgress] 检测到并发冲突，使用较大进度', {
            userId, audiobookId: id, fileId,
            existingTime: existing.current_time,
            newTime: currentTime,
            chosenTime: finalCurrentTime,
            timeDiff
          });
        } else {
          // 正常更新：使用新数据
          finalCurrentTime = currentTime;
          finalDuration = duration > 0 ? duration : existing.duration || 0;
        }

        const finalProgress = finalDuration > 0 ? (finalCurrentTime / finalDuration) * 100 : 0;

        // 更新该文件的进度记录
        db.prepare(`
          UPDATE audiobook_progress
          SET current_time = ?, duration = ?, progress = ?, last_played_at = ?, updated_at = ?
          WHERE user_id = ? AND audiobook_id = ? AND file_id = ?
        `).run(finalCurrentTime, finalDuration, finalProgress, now, now, userId, id, fileId);

        console.log('[AudiobookProgress] 更新进度记录', {
          userId, audiobookId: id, fileId,
          finalCurrentTime, finalDuration, finalProgress,
          isConcurrentConflict
        });
      }
    } else {
      // 创建该文件的新进度记录
      // ✅ 移动端/PWA 兜底：有些环境下 duration 可能拿不到（0/NaN），但 current_time 仍然可以用于断点续播
      // - currentTime > 0：允许插入一条 duration=0 的记录，保证下次能续播
      // - currentTime = 0 且 duration = 0：通常代表“仅更新 last_file_id”，前端应使用 updateLastFileIdOnly；这里避免产生无意义记录
      if (duration > 0 || currentTime > 0) {
        const progressId = uuidv4();
        db.prepare(`
          INSERT INTO audiobook_progress (
            id, user_id, audiobook_id, file_id, current_time, duration, progress, last_played_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(progressId, userId, id, fileId, currentTime, duration || 0, progress, now, now);
      }
    }

    // ✅ 修复：更新播放历史（确保 last_file_id 始终是最新的）
    const historyExisting = db.prepare('SELECT id, last_file_id FROM audiobook_history WHERE user_id = ? AND audiobook_id = ?')
      .get(userId, id) as any;

    if (historyExisting) {
      // ✅ 修复：始终更新 last_file_id，即使时间相同也要更新（确保文件ID是最新的）
      const oldFileId = historyExisting.last_file_id;
      db.prepare(`
        UPDATE audiobook_history 
        SET last_played_at = ?, last_file_id = ?
        WHERE user_id = ? AND audiobook_id = ?
      `).run(now, fileId, userId, id);
      console.log('[AudiobookProgress] 更新播放历史', { 
        userId, 
        audiobookId: id, 
        oldFileId, 
        newFileId: fileId, 
        now,
        currentTime,
        duration
      });
    } else {
      const historyId = uuidv4();
      db.prepare(`
        INSERT INTO audiobook_history (
          id, user_id, audiobook_id, last_played_at, last_file_id
        ) VALUES (?, ?, ?, ?, ?)
      `).run(historyId, userId, id, now, fileId);
      console.log('[AudiobookProgress] 创建播放历史', { 
        userId, 
        audiobookId: id, 
        fileId, 
        now,
        currentTime,
        duration
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('保存播放进度失败:', error);
    res.status(500).json({ error: '保存播放进度失败: ' + error.message });
  }
});

// ✅ 新增：批量获取所有文件的播放进度
router.get('/:id/progress/all', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // 获取该有声小说所有文件的播放进度
    const allProgress = db.prepare(`
      SELECT file_id, current_time, duration, progress, last_played_at
      FROM audiobook_progress 
      WHERE user_id = ? AND audiobook_id = ?
      ORDER BY last_played_at DESC
    `).all(userId, id) as any[];

    // 转换为以 file_id 为 key 的对象，方便前端查找
    const progressMap: { [fileId: string]: any } = {};
    allProgress.forEach(p => {
      progressMap[p.file_id] = {
        file_id: p.file_id,
        current_time: p.current_time || 0,
        duration: p.duration || 0,
        progress: p.progress || 0,
        last_played_at: p.last_played_at,
      };
    });

    res.json({ success: true, progress: progressMap });
  } catch (error: any) {
    console.error('批量获取播放进度失败:', error);
    res.status(500).json({ error: '批量获取播放进度失败: ' + error.message });
  }
});

// 获取播放进度
router.get('/:id/progress', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { fileId } = req.query; // ✅ 修复：支持根据fileId获取特定文件的进度

    if (fileId) {
      // ✅ 修复：获取特定文件的进度
      const progress = db.prepare(`
        SELECT * FROM audiobook_progress 
        WHERE user_id = ? AND audiobook_id = ? AND file_id = ?
      `).get(userId, id, fileId) as any;

      if (!progress) {
        return res.json({ success: true, progress: null });
      }

      res.json({ success: true, progress });
    } else {
      // ✅ 修复：如果没有指定fileId，优先使用 audiobook_history 表的 last_file_id

      const history = db.prepare(`
        SELECT last_file_id, last_played_at FROM audiobook_history 
        WHERE user_id = ? AND audiobook_id = ?
      `).get(userId, id) as any;

      let progress: any = null;
      
      if (history && history.last_file_id) {
        // ✅ 修复：优先使用历史记录中的最后播放文件ID
        progress = db.prepare(`
          SELECT * FROM audiobook_progress 
          WHERE user_id = ? AND audiobook_id = ? AND file_id = ?
        `).get(userId, id, history.last_file_id) as any;
        console.log('[AudiobookProgress] 从历史记录获取进度', { 
          userId, 
          audiobookId: id, 
          lastFileId: history.last_file_id,
          lastPlayedAt: history.last_played_at,
          foundProgress: !!progress,
          progressFileId: progress ? progress.file_id : null,
          progressCurrentTime: progress ? progress.current_time : null,
          progressDuration: progress ? progress.duration : null
        });
        
        // ✅ 修复：如果 last_file_id 对应的进度记录不存在，返回 last_file_id 但 progress 为 null
        // 这样前端可以使用 last_file_id 作为初始文件，从头开始播放
        if (!progress) {
          console.log('[AudiobookProgress] last_file_id对应的进度记录不存在，返回last_file_id', { 
            userId, 
            audiobookId: id, 
            lastFileId: history.last_file_id
          });
          // 返回一个特殊的进度对象，包含 file_id 但 progress 为 null
          return res.json({ 
            success: true, 
            progress: {
              file_id: history.last_file_id,
              current_time: 0,
              duration: 0,
              progress: 0,
              // 标记这是一个新文件，没有进度记录
              is_new_file: true
            }
          });
        }
      }
      
      // ✅ 修复：只有在没有历史记录或历史记录中没有 last_file_id 时，才使用备用方案
      if (!progress) {
        const fallbackProgress = db.prepare(`
          SELECT * FROM audiobook_progress 
          WHERE user_id = ? AND audiobook_id = ?
          ORDER BY last_played_at DESC
          LIMIT 1
        `).get(userId, id) as any;
        progress = fallbackProgress;
        console.log('[AudiobookProgress] 从进度表获取最新进度（备用）', { 
          userId, 
          audiobookId: id,
          foundProgress: !!fallbackProgress,
          fileId: fallbackProgress?.file_id
        });
      }

      if (!progress) {
        console.log('[AudiobookProgress] 未找到播放进度', { userId, audiobookId: id });
        return res.json({ success: true, progress: null });
      }

      // ✅ 修复：明确类型断言，确保 TypeScript 知道 progress 不为 null
      const progressData = progress as any;
      console.log('[AudiobookProgress] 返回播放进度', { 
        userId, 
        audiobookId: id,
        fileId: progressData.file_id,
        currentTime: progressData.current_time,
        progress: progressData.progress
      });
      res.json({ success: true, progress: progressData });
    }
  } catch (error: any) {
    console.error('获取播放进度失败:', error);
    res.status(500).json({ error: '获取播放进度失败: ' + error.message });
  }
});

// 删除指定有声小说的所有播放进度
router.delete('/:id/progress', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // 检查有声小说是否存在
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    // 删除该用户对该有声小说的所有播放进度记录
    const deleteProgressResult = db.prepare('DELETE FROM audiobook_progress WHERE user_id = ? AND audiobook_id = ?')
      .run(userId, id);

    // 删除该用户对该有声小说的播放历史记录
    const deleteHistoryResult = db.prepare('DELETE FROM audiobook_history WHERE user_id = ? AND audiobook_id = ?')
      .run(userId, id);

    console.log('[AudiobookProgress] 清空播放进度', {
      userId,
      audiobookId: id,
      deletedProgressCount: deleteProgressResult.changes,
      deletedHistoryCount: deleteHistoryResult.changes
    });

    res.json({
      success: true,
      message: '播放进度已清空',
      deletedProgressCount: deleteProgressResult.changes,
      deletedHistoryCount: deleteHistoryResult.changes
    });
  } catch (error: any) {
    console.error('清空播放进度失败:', error);
    res.status(500).json({ error: '清空播放进度失败: ' + error.message });
  }
});

// 添加到书架
router.post('/:id/shelf', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // 检查权限
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    if (audiobook.is_public === 0 && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声小说' });
    }

    // 检查是否已在书架
    const existing = db.prepare('SELECT id FROM audiobook_shelves WHERE user_id = ? AND audiobook_id = ?')
      .get(userId, id) as any;

    if (existing) {
      return res.json({ success: true, message: '已在书架中' });
    }

    // 添加到书架
    const shelfId = uuidv4();
    db.prepare(`
      INSERT INTO audiobook_shelves (id, user_id, audiobook_id)
      VALUES (?, ?, ?)
    `).run(shelfId, userId, id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('添加到书架失败:', error);
    res.status(500).json({ error: '添加到书架失败: ' + error.message });
  }
});

// 从书架移除
router.delete('/:id/shelf', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    db.prepare('DELETE FROM audiobook_shelves WHERE user_id = ? AND audiobook_id = ?')
      .run(userId, id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('从书架移除失败:', error);
    res.status(500).json({ error: '从书架移除失败: ' + error.message });
  }
});

// 检查是否在书架
router.get('/:id/shelf', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const shelf = db.prepare('SELECT id FROM audiobook_shelves WHERE user_id = ? AND audiobook_id = ?')
      .get(userId, id) as any;

    res.json({ success: true, inShelf: !!shelf });
  } catch (error: any) {
    console.error('检查书架状态失败:', error);
    res.status(500).json({ error: '检查书架状态失败: ' + error.message });
  }
});

// 获取书架列表
router.get('/shelf/list', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (Number(page) - 1) * Number(pageSize);

    // 仅展示公开有声或本人上传的私有有声，不展示他人私有
    const audiobooks = db.prepare(`
      SELECT a.*, s.added_at as shelf_added_at
      FROM audiobooks a
      INNER JOIN audiobook_shelves s ON a.id = s.audiobook_id
      WHERE s.user_id = ? AND (a.is_public = 1 OR a.uploader_id = ?)
      ORDER BY s.added_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, userId, Number(pageSize), offset) as any[];

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM audiobook_shelves s
      INNER JOIN audiobooks a ON a.id = s.audiobook_id
      WHERE s.user_id = ? AND (a.is_public = 1 OR a.uploader_id = ?)
    `).get(userId, userId) as any;

    // 为每个有声小说获取文件数量和播放进度
    const audiobooksWithInfo = audiobooks.map(ab => {
      const fileCount = db.prepare('SELECT COUNT(*) as count FROM audiobook_files WHERE audiobook_id = ?')
        .get(ab.id) as any;
      const progress = db.prepare('SELECT * FROM audiobook_progress WHERE user_id = ? AND audiobook_id = ?')
        .get(userId, ab.id) as any;
      return {
        ...ab,
        fileCount: fileCount.count,
        progress: progress || null,
      };
    });

    res.json({
      success: true,
      audiobooks: audiobooksWithInfo,
      total: total.count,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (error: any) {
    console.error('获取书架列表失败:', error);
    res.status(500).json({ error: '获取书架列表失败: ' + error.message });
  }
});

// 获取播放历史
router.get('/history/list', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (Number(page) - 1) * Number(pageSize);

    // 仅展示公开有声或本人上传的私有有声，不展示他人私有
    const history = db.prepare(`
      SELECT h.*, a.title, a.author, a.cover_url, a.type
      FROM audiobook_history h
      INNER JOIN audiobooks a ON h.audiobook_id = a.id
      WHERE h.user_id = ? AND (a.is_public = 1 OR a.uploader_id = ?)
      ORDER BY h.last_played_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, userId, Number(pageSize), offset) as any[];

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM audiobook_history h
      INNER JOIN audiobooks a ON h.audiobook_id = a.id
      WHERE h.user_id = ? AND (a.is_public = 1 OR a.uploader_id = ?)
    `).get(userId, userId) as any;

    // 为每个有声小说获取播放进度
    const historyWithProgress = history.map(h => {
      const progress = db.prepare('SELECT * FROM audiobook_progress WHERE user_id = ? AND audiobook_id = ?')
        .get(userId, h.audiobook_id) as any;
      return {
        ...h,
        progress: progress || null,
      };
    });

    res.json({
      success: true,
      history: historyWithProgress,
      total: total.count,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (error: any) {
    console.error('获取播放历史失败:', error);
    res.status(500).json({ error: '获取播放历史失败: ' + error.message });
  }
});

// 上传封面图片（文件上传）
router.post('/:id/cover', authenticateToken, uploadCover.single('cover'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole || 'user';

    // 获取有声小说信息
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    // 权限检查：管理员或上传者可以修改
    if (userRole !== 'admin' && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权修改此有声小说' });
    }

    // 检查文件是否上传
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const coverFileName = req.file.filename;

    try {
      // 删除旧封面（如果存在）
      if (audiobook.cover_url) {
        const oldCoverPath = path.join(coversDir, audiobook.cover_url);
        if (fs.existsSync(oldCoverPath)) {
          fs.unlinkSync(oldCoverPath);
          console.log('[上传封面] 已删除旧封面:', oldCoverPath);
        }
      }

      // 更新数据库
      db.prepare('UPDATE audiobooks SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(coverFileName, id);

      console.log('[上传封面] 封面上传成功:', { audiobookTitle: audiobook.title, coverFileName });
      res.json({ success: true, cover_url: coverFileName });
    } catch (error: any) {
      // 清理上传的文件
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[上传封面] 错误:', error);
    res.status(500).json({ error: '上传封面失败', message: error.message });
  }
});

// 更新有声小说信息（管理员或上传者可以编辑）
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole || 'user';
    const {
      title,
      author,
      type,
      description,
      cover_url,
      isPublic,
    } = req.body;

    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    // 权限检查：管理员或上传者可以编辑
    if (userRole !== 'admin' && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权编辑此有声小说' });
    }

    // 构建更新数据
    const updateData: any = {
      title: title !== undefined ? title : audiobook.title,
      author: author !== undefined ? author : audiobook.author,
      type: type !== undefined ? type : audiobook.type,
      description: description !== undefined ? description : audiobook.description,
      cover_url: cover_url !== undefined ? (cover_url === '' || cover_url === null ? null : cover_url) : audiobook.cover_url,
      updated_at: new Date().toISOString(),
    };

    // 只有管理员或上传者可以修改公开状态
    if (isPublic !== undefined && (userRole === 'admin' || audiobook.uploader_id === userId)) {
      updateData.is_public = isPublic ? 1 : 0;
    }

    // 构建更新SQL
    const updates: string[] = [];
    const values: any[] = [];
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && key !== 'updated_at') {
        updates.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(updateData.updated_at);
      values.push(id);
      db.prepare(
        `UPDATE audiobooks SET ${updates.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    const updatedAudiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id);
    res.json({ success: true, audiobook: updatedAudiobook });
  } catch (error: any) {
    console.error('更新有声小说失败:', error);
    res.status(500).json({ error: '更新失败: ' + error.message });
  }
});

// 删除有声小说（管理员或上传者可以删除）
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole || 'user';

    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(id) as any;
    if (!audiobook) {
      return res.status(404).json({ error: '有声小说不存在' });
    }

    // 权限检查：管理员或上传者可以删除
    if (userRole !== 'admin' && audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权删除此有声小说' });
    }

    // 删除封面文件（如果存在）
    if (audiobook.cover_url) {
      const coverPath = path.join(coversDir, audiobook.cover_url);
      if (fs.existsSync(coverPath)) {
        try {
          fs.unlinkSync(coverPath);
          console.log(`已删除封面文件: ${coverPath}`);
        } catch (e) {
          console.warn('删除封面文件失败:', e);
        }
      }
    }

    // 删除音频文件夹及其所有内容
    if (audiobook.folder_path && fs.existsSync(audiobook.folder_path)) {
      try {
        // 递归删除文件夹
        function deleteDirectory(dirPath: string): void {
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            files.forEach((file) => {
              const filePath = path.join(dirPath, file);
              const stat = fs.statSync(filePath);
              if (stat.isDirectory()) {
                deleteDirectory(filePath);
              } else {
                fs.unlinkSync(filePath);
              }
            });
            fs.rmdirSync(dirPath);
          }
        }
        deleteDirectory(audiobook.folder_path);
        console.log(`已删除音频文件夹: ${audiobook.folder_path}`);
      } catch (e) {
        console.warn('删除音频文件夹失败:', e);
      }
    }

    // 删除相关的数据库记录（外键会自动处理，但我们可以显式删除）
    // 删除音频文件记录
    db.prepare('DELETE FROM audiobook_files WHERE audiobook_id = ?').run(id);
    // 删除播放进度记录
    db.prepare('DELETE FROM audiobook_progress WHERE audiobook_id = ?').run(id);
    // 删除书架记录
    db.prepare('DELETE FROM audiobook_shelves WHERE audiobook_id = ?').run(id);
    // 删除播放历史记录
    db.prepare('DELETE FROM audiobook_history WHERE audiobook_id = ?').run(id);
    // 删除有声小说主记录
    db.prepare('DELETE FROM audiobooks WHERE id = ?').run(id);

    res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    console.error('删除有声小说失败:', error);
    res.status(500).json({ error: '删除失败: ' + error.message });
  }
});

// 从本地路径扫描并上传有声小说文件夹
router.post('/upload-from-local', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = db.prepare('SELECT role, can_upload_audiobook FROM users WHERE id = ?').get(userId) as any;
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查上传有声小说权限（管理员不受限制）
    if (user.role !== 'admin') {
      const canUploadAudiobook = user.can_upload_audiobook !== undefined && user.can_upload_audiobook !== null
        ? user.can_upload_audiobook === 1
        : false; // 默认为false（需要权限）
      
      if (!canUploadAudiobook) {
        console.log(`[上传有声小说] 权限被拒绝: 用户 ${userId} 尝试上传有声小说，但上传权限已被禁用`);
        return res.status(403).json({ error: '您没有权限上传有声小说，请联系管理员开启此权限' });
      }
    }

    const { folderPath, title, author, type, isPublic } = req.body;

    if (!folderPath) {
      return res.status(400).json({ error: '请提供文件夹路径' });
    }

    if (!title || !type) {
      return res.status(400).json({ error: '请提供标题和类型' });
    }

    // 验证文件夹路径是否存在
    if (!fs.existsSync(folderPath)) {
      return res.status(400).json({ error: '文件夹路径不存在' });
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '提供的路径不是文件夹' });
    }

    // 查找文件夹下的所有音频文件（递归）
    function findAllAudioFiles(dir: string): any[] {
      const files: any[] = [];
      
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        
        // 先收集文件，再收集目录
        const fileItems: string[] = [];
        const dirItems: string[] = [];
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const itemStat = fs.statSync(itemPath);
          
          if (itemStat.isFile()) {
            fileItems.push(item);
          } else if (itemStat.isDirectory()) {
            dirItems.push(item);
          }
        }
        
        // 处理文件（按名称排序）
        fileItems.sort().forEach(item => {
          const itemPath = path.join(dir, item);
          const ext = path.extname(item).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) {
            const stat = fs.statSync(itemPath);
            // ✅ 修复：修复文件名编码
            const fixedName = fixFileNameEncoding(item);
            files.push({
              name: fixedName,
              path: itemPath,
              size: stat.size,
              type: ext.substring(1),
            });
          }
        });
        
        // 递归处理子目录（按名称排序）
        dirItems.sort().forEach(item => {
          const itemPath = path.join(dir, item);
          files.push(...findAllAudioFiles(itemPath));
        });
      } catch (error: any) {
        console.error(`查找音频文件失败 ${dir}:`, error.message);
      }
      
      return files;
    }

    const audioFiles = findAllAudioFiles(folderPath);

    if (audioFiles.length === 0) {
      return res.status(400).json({ error: '文件夹中没有找到音频文件' });
    }

    // 检查是否有封面图片和元数据文件
    const coverExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    let coverPath: string | null = null;
    let metadata: any = null;

    // 查找封面图片
    for (const ext of coverExtensions) {
      const possibleCoverPaths = [
        path.join(folderPath, `cover${ext}`),
        path.join(folderPath, `Cover${ext}`),
        path.join(folderPath, `COVER${ext}`),
      ];
      
      for (const possiblePath of possibleCoverPaths) {
        if (fs.existsSync(possiblePath)) {
          coverPath = possiblePath;
          break;
        }
      }
      
      if (coverPath) break;
    }

    // 查找元数据文件
    const metadataPaths = [
      path.join(folderPath, 'metadata.json'),
      path.join(folderPath, 'Metadata.json'),
      path.join(folderPath, 'METADATA.json'),
    ];

    for (const metadataPath of metadataPaths) {
      if (fs.existsSync(metadataPath)) {
        try {
          const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
          metadata = JSON.parse(metadataContent);
          // 清理 HTML 标签
          metadata = cleanMetadata(metadata);
          break;
        } catch (error: any) {
          console.warn(`解析元数据文件失败 ${metadataPath}:`, error);
        }
      }
    }

    // 如果元数据中有标题和作者，优先使用
    const finalTitle = metadata?.title || title;
    const finalAuthor = metadata?.author || author || null;
    const finalDescription = metadata?.description || metadata?.summary || null;

    const publicMode = isPublic === true || isPublic === 'true';

    // 创建有声小说记录
    const audiobookId = uuidv4();
    const now = new Date().toISOString();
    
    // 确定目标文件夹路径
    const targetFolderPath = path.join(audioDir, audiobookId);
    
    // 确保目标目录存在
    if (!fs.existsSync(targetFolderPath)) {
      fs.mkdirSync(targetFolderPath, { recursive: true });
    }

    // 处理封面图片
    let coverUrl: string | null = null;
    
    if (coverPath && fs.existsSync(coverPath)) {
      try {
        // 确保封面目录存在
        if (!fs.existsSync(coversDir)) {
          fs.mkdirSync(coversDir, { recursive: true });
        }

        // 生成封面文件名
        const coverExt = path.extname(coverPath);
        const coverFileName = `${audiobookId}${coverExt}`;
        const targetCoverPath = path.join(coversDir, coverFileName);

        // 复制封面文件
        fs.copyFileSync(coverPath, targetCoverPath);
        coverUrl = coverFileName;
        console.log(`已复制封面: ${coverPath} -> ${targetCoverPath}`);
      } catch (error: any) {
        console.error(`复制封面失败:`, error);
      }
    }

    // 如果没有封面，生成默认封面
    if (!coverUrl) {
      try {
        coverUrl = await generateDefaultAudiobookCover(audiobookId, finalTitle, finalAuthor);
      } catch (error: any) {
        console.error(`生成默认封面失败:`, error);
      }
    }

    // 保存有声小说记录
    db.prepare(`
      INSERT INTO audiobooks (
        id, title, author, type, description, cover_url, folder_path, uploader_id, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      audiobookId,
      finalTitle,
      finalAuthor,
      type,
      finalDescription,
      coverUrl,
      targetFolderPath,
      userId,
      publicMode ? 1 : 0,
      now,
      now
    );

    // 复制音频文件到目标目录并创建文件记录
    const fileRecords: any[] = [];
    let fileOrder = 0;
    let firstFileId: string | null = null;

    for (const audioFile of audioFiles) {
      // ✅ 修复：使用 fixFileNameEncoding 函数修复文件名编码
      const safeFileName = fixFileNameEncoding(audioFile.name);
      
      const targetFileName = `${String(fileOrder + 1).padStart(4, '0')}_${safeFileName}`;
      const targetFilePath = path.join(targetFolderPath, targetFileName);

      // 复制文件
      try {
        fs.copyFileSync(audioFile.path, targetFilePath);
      } catch (error: any) {
        console.error(`复制文件失败 ${audioFile.path} -> ${targetFilePath}:`, error);
        continue;
      }

      // 创建文件记录
      const fileId = uuidv4();
      if (fileOrder === 0) {
        firstFileId = fileId;
      }
      
      db.prepare(`
        INSERT INTO audiobook_files (
          id, audiobook_id, file_path, file_name, file_size, file_type, file_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        audiobookId,
        targetFilePath,
        targetFileName,
        audioFile.size,
        audioFile.type,
        fileOrder
      );

      fileRecords.push({
        id: fileId,
        fileName: targetFileName,
        fileSize: audioFile.size,
        fileType: audioFile.type,
        fileOrder,
      });

      fileOrder++;
    }

    // 如果元数据中有章节信息，且只有一个音频文件，则保存章节信息
    if (metadata?.chapters && Array.isArray(metadata.chapters) && metadata.chapters.length > 0 && firstFileId) {
      const targetFileId = audioFiles.length === 1 ? firstFileId : firstFileId;
      
      for (const chapter of metadata.chapters) {
        if (chapter.id !== undefined && chapter.title && chapter.start !== undefined && chapter.end !== undefined) {
          const chapterId = uuidv4();
          db.prepare(`
            INSERT INTO audiobook_chapters (
              id, file_id, chapter_id, title, start_time, end_time
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            chapterId,
            targetFileId,
            chapter.id,
            chapter.title,
            chapter.start,
            chapter.end
          );
        }
      }
      console.log(`已保存 ${metadata.chapters.length} 个章节信息到文件 ${targetFileId}`);
    }

    res.json({
      success: true,
      audiobook: {
        id: audiobookId,
        title: finalTitle,
        author: finalAuthor,
        type,
        fileCount: fileRecords.length,
      },
      files: fileRecords,
    });
  } catch (error: any) {
    console.error('从本地路径上传有声小说失败:', error);
    res.status(500).json({ error: '上传失败: ' + error.message });
  }
});

// 扫描本地目录查找音频文件
router.post('/scan-local', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = db.prepare('SELECT role, can_upload_audiobook FROM users WHERE id = ?').get(userId) as any;
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查上传有声小说权限（管理员不受限制）
    if (user.role !== 'admin') {
      const canUploadAudiobook = user.can_upload_audiobook !== undefined && user.can_upload_audiobook !== null
        ? user.can_upload_audiobook === 1
        : false;
      
      if (!canUploadAudiobook) {
        return res.status(403).json({ error: '您没有权限上传有声小说，请联系管理员开启此权限' });
      }
    }

    const { scanPath } = req.body;

    console.log('[扫描本地目录] 收到请求:', { scanPath, body: req.body });

    if (!scanPath) {
      console.log('[扫描本地目录] 错误: 未提供扫描路径');
      return res.status(400).json({ error: '请提供扫描路径' });
    }

    if (typeof scanPath !== 'string') {
      console.log('[扫描本地目录] 错误: 扫描路径类型错误:', typeof scanPath);
      return res.status(400).json({ error: '扫描路径必须是字符串' });
    }

    // 清理路径，移除首尾空格和引号
    let cleanPath = scanPath.trim();
    cleanPath = cleanPath.replace(/^['"]|['"]$/g, '').trim();
    
    // 规范化路径（处理路径分隔符和相对路径）
    let normalizedPath = path.normalize(cleanPath);
    
    // 处理 macOS 路径中的空格和特殊字符
    // 确保路径是绝对路径
    if (!path.isAbsolute(normalizedPath)) {
      console.warn('[扫描本地目录] 警告: 路径不是绝对路径，尝试解析:', normalizedPath);
    }
    
    console.log('[扫描本地目录] 原始路径:', scanPath);
    console.log('[扫描本地目录] 清理后路径:', cleanPath);
    console.log('[扫描本地目录] 规范化后的路径:', normalizedPath);
    console.log('[扫描本地目录] 路径是否为绝对路径:', path.isAbsolute(normalizedPath));

    // 检查路径是否存在
    let pathExists = false;
    let pathStat: fs.Stats | null = null;
    let pathError: Error | null = null;
    
    try {
      pathExists = fs.existsSync(normalizedPath);
      if (pathExists) {
        pathStat = fs.statSync(normalizedPath);
      }
    } catch (error: any) {
      pathError = error;
      console.error('[扫描本地目录] 访问路径时出错:', error);
    }

    if (!pathExists) {
      console.log('[扫描本地目录] 错误: 路径不存在:', normalizedPath);
      let errorMessage = `扫描路径不存在: ${normalizedPath}`;
      
      // 提供更详细的错误信息
      if (pathError) {
        errorMessage += `\n访问错误: ${pathError.message}`;
      }
      
      // 检查是否是权限问题
      if (pathError && ((pathError as any).code === 'EACCES' || (pathError as any).code === 'EPERM')) {
        errorMessage += '\n提示: 可能是权限不足，请检查路径访问权限';
      }
      
      // 检查路径格式
      if (normalizedPath.includes('~')) {
        errorMessage += '\n提示: 路径中包含 ~ 符号，请使用完整路径';
      }
      
      return res.status(400).json({ 
        error: errorMessage,
        path: normalizedPath,
        suggestion: '请确认：\n1. 路径是否正确\n2. 路径是否在服务器端存在\n3. 服务器是否有访问该路径的权限'
      });
    }

    if (!pathStat || !pathStat.isDirectory()) {
      console.log('[扫描本地目录] 错误: 路径不是文件夹:', normalizedPath);
      return res.status(400).json({ 
        error: `提供的路径不是文件夹: ${normalizedPath}`,
        path: normalizedPath
      });
    }

    const folders: any[] = [];
    const processedPaths = new Set<string>();

    // 查找目录下的直接音频文件
    function findDirectAudioFiles(dir: string): any[] {
      const files: any[] = [];
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        for (const item of items) {
          const itemPath = path.join(dir, item);
          try {
            const itemStat = fs.statSync(itemPath);
            if (itemStat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (AUDIO_EXTENSIONS.includes(ext)) {
                // ✅ 修复：修复文件名编码
                const fixedName = fixFileNameEncoding(item);
                files.push({
                  name: fixedName,
                  path: itemPath,
                  size: itemStat.size,
                  type: ext.substring(1),
                });
              }
            }
          } catch (error: any) {
            // 忽略无法访问的文件
          }
        }
      } catch (error: any) {
        // 忽略无法读取的目录
      }
      return files;
    }

    // 查找目录下的所有音频文件（递归）
    function findAudioFiles(dir: string): any[] {
      const files: any[] = [];
      
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          
          try {
            const itemStat = fs.statSync(itemPath);
            
            if (itemStat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (AUDIO_EXTENSIONS.includes(ext)) {
                // ✅ 修复：修复文件名编码
                const fixedName = fixFileNameEncoding(item);
                files.push({
                  name: fixedName,
                  path: itemPath,
                  size: itemStat.size,
                  type: ext.substring(1),
                });
              }
            } else if (itemStat.isDirectory()) {
              // 递归查找子目录中的音频文件
              files.push(...findAudioFiles(itemPath));
            }
          } catch (error: any) {
            console.error(`处理文件失败 ${itemPath}:`, error.message);
          }
        }
      } catch (error: any) {
        console.error(`查找音频文件失败 ${dir}:`, error.message);
      }
      
      return files;
    }

    // 检查目录的直接子目录中是否有包含音频文件的目录
    function hasAudioSubdirectories(dir: string): boolean {
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });
        for (const item of items) {
          const itemPath = path.join(dir, item);
          try {
            const itemStat = fs.statSync(itemPath);
            if (itemStat.isDirectory()) {
              const directAudioFiles = findDirectAudioFiles(itemPath);
              if (directAudioFiles.length > 0) {
                return true;
              }
            }
          } catch (error: any) {
            // 忽略无法访问的子目录
          }
        }
      } catch (error: any) {
        // 忽略无法读取的目录
      }
      return false;
    }

    // 扫描目录下的所有文件夹
    function scanDirectory(dir: string, relativePath: string = ''): void {
      try {
        const items = fs.readdirSync(dir, { encoding: 'utf8' });

        for (const item of items) {
          const itemPath = path.join(dir, item);
          const relativeItemPath = relativePath ? path.join(relativePath, item) : item;
          
          if (processedPaths.has(itemPath)) {
            continue;
          }
          
          try {
            const itemStat = fs.statSync(itemPath);

            if (itemStat.isDirectory()) {
              const audioFiles = findAudioFiles(itemPath);
              const hasSubdirsWithAudio = hasAudioSubdirectories(itemPath);
              
              if (hasSubdirsWithAudio) {
                const allAudioFiles: any[] = [];
                const subdirs: string[] = [];
                
                function collectSubdirAudio(subDir: string): void {
                  const subItems = fs.readdirSync(subDir, { encoding: 'utf8' });
                  for (const subItem of subItems) {
                    const subItemPath = path.join(subDir, subItem);
                    try {
                      const subItemStat = fs.statSync(subItemPath);
                      if (subItemStat.isDirectory()) {
                        const subAudioFiles = findAudioFiles(subItemPath);
                        if (subAudioFiles.length > 0) {
                          subdirs.push(subItemPath);
                          allAudioFiles.push(...subAudioFiles);
                          processedPaths.add(subItemPath);
                        }
                        collectSubdirAudio(subItemPath);
                      }
                    } catch (error: any) {
                      // 忽略无法访问的子目录
                    }
                  }
                }
                
                collectSubdirAudio(itemPath);
                
                const directAudioFiles = audioFiles.filter(f => {
                  const fileDir = path.dirname(f.path);
                  return fileDir === itemPath;
                });
                
                const totalAudioFiles = [...directAudioFiles, ...allAudioFiles];
                
                if (totalAudioFiles.length > 0) {
                  const coverExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
                  let hasCover = false;
                  let hasMetadata = false;
                  let metadataInfo: any = null;

                  for (const ext of coverExtensions) {
                    const possibleCoverPaths = [
                      path.join(itemPath, `cover${ext}`),
                      path.join(itemPath, `Cover${ext}`),
                      path.join(itemPath, `COVER${ext}`),
                    ];
                    
                    for (const possiblePath of possibleCoverPaths) {
                      if (fs.existsSync(possiblePath)) {
                        hasCover = true;
                        break;
                      }
                    }
                    
                    if (hasCover) break;
                  }

                  const metadataPaths = [
                    path.join(itemPath, 'metadata.json'),
                    path.join(itemPath, 'Metadata.json'),
                    path.join(itemPath, 'METADATA.json'),
                  ];

                  for (const metadataPath of metadataPaths) {
                    if (fs.existsSync(metadataPath)) {
                      hasMetadata = true;
                      try {
                        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
                        metadataInfo = JSON.parse(metadataContent);
                        metadataInfo = cleanMetadata(metadataInfo);
                      } catch (error: any) {
                        console.warn(`解析元数据文件失败 ${metadataPath}:`, error);
                      }
                      break;
                    }
                  }

                  folders.push({
                    folderName: item,
                    folderPath: itemPath,
                    relativePath: relativeItemPath,
                    audioFileCount: totalAudioFiles.length,
                    totalSize: totalAudioFiles.reduce((sum, f) => sum + f.size, 0),
                    hasCover,
                    hasMetadata,
                    metadata: metadataInfo,
                    audioFiles: totalAudioFiles.map(f => ({
                      name: f.name,
                      path: f.path,
                      size: f.size,
                      type: f.type,
                    })),
                    hasSubdirectories: true,
                  });
                  
                  processedPaths.add(itemPath);
                }
              } else if (audioFiles.length > 0) {
                const coverExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
                let hasCover = false;
                let hasMetadata = false;
                let metadataInfo: any = null;

                for (const ext of coverExtensions) {
                  const possibleCoverPaths = [
                    path.join(itemPath, `cover${ext}`),
                    path.join(itemPath, `Cover${ext}`),
                    path.join(itemPath, `COVER${ext}`),
                  ];
                  
                  for (const possiblePath of possibleCoverPaths) {
                    if (fs.existsSync(possiblePath)) {
                      hasCover = true;
                      break;
                    }
                  }
                  
                  if (hasCover) break;
                }

                const metadataPaths = [
                  path.join(itemPath, 'metadata.json'),
                  path.join(itemPath, 'Metadata.json'),
                  path.join(itemPath, 'METADATA.json'),
                ];

                for (const metadataPath of metadataPaths) {
                  if (fs.existsSync(metadataPath)) {
                    hasMetadata = true;
                    try {
                      const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
                      metadataInfo = JSON.parse(metadataContent);
                      metadataInfo = cleanMetadata(metadataInfo);
                    } catch (error: any) {
                      console.warn(`解析元数据文件失败 ${metadataPath}:`, error);
                    }
                    break;
                  }
                }

                folders.push({
                  folderName: item,
                  folderPath: itemPath,
                  relativePath: relativeItemPath,
                  audioFileCount: audioFiles.length,
                  totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
                  hasCover,
                  hasMetadata,
                  metadata: metadataInfo,
                  audioFiles: audioFiles.map(f => ({
                    name: f.name,
                    path: f.path,
                    size: f.size,
                    type: f.type,
                  })),
                });
                
                processedPaths.add(itemPath);
              }
              
              if (!processedPaths.has(itemPath)) {
                scanDirectory(itemPath, relativeItemPath);
              }
            }
          } catch (error: any) {
            console.error(`扫描目录失败 ${itemPath}:`, error.message);
          }
        }
      } catch (error: any) {
        console.error(`扫描目录失败 ${dir}:`, error.message);
      }
    }

    scanDirectory(normalizedPath);

    res.json({
      success: true,
      folders: folders.sort((a, b) => a.folderName.localeCompare(b.folderName)),
    });
  } catch (error: any) {
    console.error('扫描本地目录失败:', error);
    res.status(500).json({ error: '扫描失败: ' + error.message });
  }
});

// 从文件上传创建有声小说（用于前端选择本地目录后上传）
// 使用磁盘存储而不是内存存储，避免大文件占用过多内存
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 使用临时目录存储上传的文件
    const tempDir = path.join(audioDir, '.temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // 生成临时文件名（使用 UUID 避免冲突）
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadAudiobookFiles = multer({
  storage: audioStorage,
  limits: { 
    fileSize: 1024 * 1024 * 1024, // 1GB per file (支持大文件)
    fieldSize: 10 * 1024 * 1024, // 10MB for fields (元数据等)
  },
  fileFilter: (req, file, cb) => {
    // 处理文件名编码（支持中文文件名）
    let fileName = file.originalname;
    
    // 如果文件名是 Buffer，尝试解码
    if (Buffer.isBuffer(fileName)) {
      try {
        fileName = fileName.toString('utf8');
        file.originalname = fileName; // 更新文件名
      } catch (e) {
        console.warn('[Multer] 文件名解码失败:', e);
      }
    }
    
    // 如果文件名包含编码字符，尝试解码
    if (fileName.includes('%')) {
      try {
        fileName = decodeURIComponent(fileName);
        file.originalname = fileName; // 更新文件名
      } catch (e) {
        console.warn('[Multer] 文件名URL解码失败:', e);
      }
    }
    
    const ext = path.extname(fileName).toLowerCase();
    console.log('[Multer] 文件过滤:', { 
      originalname: file.originalname, 
      fileName, 
      ext, 
      fieldname: file.fieldname,
      mimetype: file.mimetype,
    });
    
    // 允许音频文件和封面图片
    if (AUDIO_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      console.warn('[Multer] 不支持的文件格式:', ext, '文件名:', fileName);
      cb(new Error(`不支持的文件格式: ${ext}`));
    }
  },
});

router.post('/upload-files', authenticateToken, uploadAudiobookFiles.fields([
  { name: 'audioFiles', maxCount: 100 },
  { name: 'cover', maxCount: 1 }
]), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = db.prepare('SELECT role, can_upload_audiobook FROM users WHERE id = ?').get(userId) as any;
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查上传有声小说权限（管理员不受限制）
    if (user.role !== 'admin') {
      const canUploadAudiobook = user.can_upload_audiobook !== undefined && user.can_upload_audiobook !== null
        ? user.can_upload_audiobook === 1
        : false;
      
      if (!canUploadAudiobook) {
        return res.status(403).json({ error: '您没有权限上传有声小说，请联系管理员开启此权限' });
      }
    }

    console.log('[上传有声小说] 收到上传请求:', {
      userId,
      bodyKeys: Object.keys(req.body),
      hasFiles: !!req.files,
      filesKeys: req.files ? Object.keys(req.files as any) : [],
    });

    const { title, author, type, isPublic, metadata } = req.body;

    if (!title || !type) {
      return res.status(400).json({ error: '请提供标题和类型' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const audioFiles = files['audioFiles'] || [];
    const coverFiles = files['cover'] || [];
    
    console.log('[上传有声小说] 文件信息:', {
      audioFilesCount: audioFiles.length,
      coverFilesCount: coverFiles.length,
      audioFilesInfo: audioFiles.map(f => ({
        originalname: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
      })),
    });
    
    if (!audioFiles || audioFiles.length === 0) {
      console.error('[上传有声小说] 错误: 没有收到音频文件');
      return res.status(400).json({ error: '请至少上传一个音频文件' });
    }

    // 解析元数据（如果有）
    let metadataInfo: any = null;
    if (metadata) {
      try {
        metadataInfo = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        metadataInfo = cleanMetadata(metadataInfo);
      } catch (error: any) {
        console.warn('解析元数据失败:', error);
      }
    }

    // 如果元数据中有标题和作者，优先使用
    const finalTitle = metadataInfo?.title || title;
    const finalAuthor = metadataInfo?.author || author || null;
    const finalDescription = metadataInfo?.description || metadataInfo?.summary || null;

    const publicMode = isPublic === true || isPublic === 'true';

    // 创建有声小说记录
    const audiobookId = uuidv4();
    const now = new Date().toISOString();
    
    // 确定目标文件夹路径
    const targetFolderPath = path.join(audioDir, audiobookId);
    
    // 确保目标目录存在
    if (!fs.existsSync(targetFolderPath)) {
      fs.mkdirSync(targetFolderPath, { recursive: true });
    }

    // 处理封面图片
    let coverUrl: string | null = null;
    
    if (coverFiles && coverFiles.length > 0) {
      const coverFile = coverFiles[0];
      try {
        // 确保封面目录存在
        if (!fs.existsSync(coversDir)) {
          fs.mkdirSync(coversDir, { recursive: true });
        }

        // 生成封面文件名
        const coverExt = path.extname(coverFile.originalname);
        const coverFileName = `${audiobookId}${coverExt}`;
        const targetCoverPath = path.join(coversDir, coverFileName);

        // 保存封面文件（优先使用磁盘路径，降级使用 buffer）
        if (coverFile.path && fs.existsSync(coverFile.path)) {
          // 从临时目录移动到目标目录（更高效）
          fs.renameSync(coverFile.path, targetCoverPath);
        } else if (coverFile.buffer) {
          // 降级方案：如果使用内存存储，写入 buffer
          fs.writeFileSync(targetCoverPath, coverFile.buffer);
        } else {
          throw new Error('封面文件既没有 path 也没有 buffer');
        }
        
        coverUrl = coverFileName;
        console.log(`[上传有声小说] 已保存封面: ${coverFileName}`);
      } catch (error: any) {
        console.error(`[上传有声小说] 保存封面失败:`, error);
      }
    }

    // 如果没有封面，生成默认封面
    if (!coverUrl) {
      try {
        coverUrl = await generateDefaultAudiobookCover(audiobookId, finalTitle, finalAuthor);
      } catch (error: any) {
        console.error(`生成默认封面失败:`, error);
      }
    }

    // 保存有声小说记录
    db.prepare(`
      INSERT INTO audiobooks (
        id, title, author, type, description, cover_url, folder_path, uploader_id, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      audiobookId,
      finalTitle,
      finalAuthor,
      type,
      finalDescription,
      coverUrl,
      targetFolderPath,
      userId,
      publicMode ? 1 : 0,
      now,
      now
    );

    // 保存音频文件到目标目录并创建文件记录
    const fileRecords: any[] = [];
    let fileOrder = 0;
    let firstFileId: string | null = null;

    // 按文件名排序
    audioFiles.sort((a, b) => a.originalname.localeCompare(b.originalname));

    for (const audioFile of audioFiles) {
      // ✅ 修复：使用 fixFileNameEncoding 函数修复文件名编码
      const safeFileName = fixFileNameEncoding(audioFile.originalname);
      
      const targetFileName = `${String(fileOrder + 1).padStart(4, '0')}_${safeFileName}`;
      const targetFilePath = path.join(targetFolderPath, targetFileName);

      console.log(`[上传有声小说] 保存文件 ${fileOrder + 1}/${audioFiles.length}:`, {
        originalName: audioFile.originalname,
        targetFileName,
        size: audioFile.size,
        path: audioFile.path, // 磁盘存储时的路径
      });

      // 保存文件
      try {
        // 使用磁盘存储时，文件已经在临时目录中，直接移动而不是读取 buffer
        if (audioFile.path && fs.existsSync(audioFile.path)) {
          // 从临时目录移动到目标目录（更高效）
          fs.renameSync(audioFile.path, targetFilePath);
          console.log(`[上传有声小说] 文件移动成功: ${targetFileName}`);
        } else if (audioFile.buffer) {
          // 降级方案：如果使用内存存储，写入 buffer
          fs.writeFileSync(targetFilePath, audioFile.buffer);
          console.log(`[上传有声小说] 文件保存成功: ${targetFileName}`);
        } else {
          console.error(`[上传有声小说] 文件 ${targetFileName} 没有数据（既没有 path 也没有 buffer）`);
          continue;
        }
      } catch (error: any) {
        console.error(`[上传有声小说] 保存文件失败 ${targetFileName}:`, error);
        console.error(`[上传有声小说] 错误详情:`, {
          code: error.code,
          message: error.message,
          path: targetFilePath,
          tempPath: audioFile.path,
          dirExists: fs.existsSync(targetFolderPath),
        });
        continue;
      }

      // 创建文件记录
      const fileId = uuidv4();
      if (fileOrder === 0) {
        firstFileId = fileId;
      }
      
      const ext = path.extname(audioFile.originalname).toLowerCase();
      const fileType = ext.substring(1);
      
      db.prepare(`
        INSERT INTO audiobook_files (
          id, audiobook_id, file_path, file_name, file_size, file_type, file_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        audiobookId,
        targetFilePath,
        targetFileName,
        audioFile.size,
        fileType,
        fileOrder
      );

      fileRecords.push({
        id: fileId,
        fileName: targetFileName,
        fileSize: audioFile.size,
        fileType: fileType,
        fileOrder,
      });

      fileOrder++;
    }

    // 如果元数据中有章节信息，且只有一个音频文件，则保存章节信息
    if (metadataInfo?.chapters && Array.isArray(metadataInfo.chapters) && metadataInfo.chapters.length > 0 && firstFileId) {
      const targetFileId = audioFiles.length === 1 ? firstFileId : firstFileId;
      
      for (const chapter of metadataInfo.chapters) {
        if (chapter.id !== undefined && chapter.title && chapter.start !== undefined && chapter.end !== undefined) {
          const chapterId = uuidv4();
          db.prepare(`
            INSERT INTO audiobook_chapters (
              id, file_id, chapter_id, title, start_time, end_time
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            chapterId,
            targetFileId,
            chapter.id,
            chapter.title,
            chapter.start,
            chapter.end
          );
        }
      }
      console.log(`已保存 ${metadataInfo.chapters.length} 个章节信息到文件 ${targetFileId}`);
    }

    // 清理临时文件（如果使用磁盘存储）
    try {
      const tempDir = path.join(audioDir, '.temp');
      if (fs.existsSync(tempDir)) {
        // 清理本次上传的临时文件
        const tempFiles = fs.readdirSync(tempDir);
        for (const tempFile of tempFiles) {
          // 只删除本次上传相关的临时文件（通过文件名匹配）
          // 注意：这里简化处理，实际应该记录哪些文件是本次上传的
          try {
            const tempFilePath = path.join(tempDir, tempFile);
            // 检查文件是否还在使用（通过检查是否在 audioFiles 中）
            const isUsed = audioFiles.some(f => f.path === tempFilePath);
            if (!isUsed) {
              // 文件已经移动，可以删除
              fs.unlinkSync(tempFilePath);
            }
          } catch (e) {
            // 忽略清理错误
          }
        }
      }
    } catch (cleanupError: any) {
      console.warn('[上传有声小说] 清理临时文件失败:', cleanupError);
      // 清理失败不影响上传成功
    }

    console.log('[上传有声小说] 上传成功:', {
      audiobookId,
      title: finalTitle,
      fileCount: fileRecords.length,
    });

    res.json({
      success: true,
      audiobook: {
        id: audiobookId,
        title: finalTitle,
        author: finalAuthor,
        type,
        fileCount: fileRecords.length,
      },
      files: fileRecords,
    });
  } catch (error: any) {
    console.error('[上传有声小说] 上传失败:', error);
    console.error('[上传有声小说] 错误堆栈:', error.stack);
    
    // 清理临时文件（如果上传失败）
    try {
      const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
      const audioFiles = files['audioFiles'] || [];
      for (const audioFile of audioFiles) {
        if (audioFile.path && fs.existsSync(audioFile.path)) {
          try {
            fs.unlinkSync(audioFile.path);
          } catch (e) {
            // 忽略清理错误
          }
        }
      }
    } catch (cleanupError: any) {
      console.warn('[上传有声小说] 清理临时文件失败:', cleanupError);
    }
    
    res.status(500).json({ 
      error: '上传失败: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==================== 分批上传接口 ====================

// 创建有声书记录（预创建，用于分批上传）
router.post('/create', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const user = db.prepare('SELECT role, can_upload_audiobook FROM users WHERE id = ?').get(userId) as any;
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 检查上传权限
    if (user.role !== 'admin') {
      const canUploadAudiobook = user.can_upload_audiobook !== undefined && user.can_upload_audiobook !== null
        ? user.can_upload_audiobook === 1
        : false;
      
      if (!canUploadAudiobook) {
        return res.status(403).json({ error: '您没有权限上传有声小说，请联系管理员开启此权限' });
      }
    }

    const { title, author, type, isPublic, metadata, coverFile, totalFiles, totalSize } = req.body;

    if (!title || !type) {
      return res.status(400).json({ error: '请提供标题和类型' });
    }

    // 解析元数据
    let metadataInfo: any = null;
    if (metadata) {
      try {
        metadataInfo = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        metadataInfo = cleanMetadata(metadataInfo);
      } catch (error: any) {
        console.warn('解析元数据失败:', error);
      }
    }

    const finalTitle = metadataInfo?.title || title;
    const finalAuthor = metadataInfo?.author || author || null;
    const finalDescription = metadataInfo?.description || metadataInfo?.summary || null;
    const publicMode = isPublic === true || isPublic === 'true';

    // 创建有声小说记录（临时状态）
    const audiobookId = uuidv4();
    const now = new Date().toISOString();
    
    // 确定目标文件夹路径
    const targetFolderPath = path.join(audioDir, audiobookId);
    
    // 确保目标目录存在
    if (!fs.existsSync(targetFolderPath)) {
      fs.mkdirSync(targetFolderPath, { recursive: true });
    }

    // 保存有声小说记录（标记为上传中状态，可以添加一个 status 字段，这里暂时使用 description 标记）
    db.prepare(`
      INSERT INTO audiobooks (
        id, title, author, type, description, cover_url, folder_path, uploader_id, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      audiobookId,
      finalTitle,
      finalAuthor,
      type,
      finalDescription || '[上传中]',
      null, // 封面稍后上传
      targetFolderPath,
      userId,
      publicMode ? 1 : 0,
      now,
      now
    );

    console.log(`[创建有声书] 已创建记录: ${audiobookId}, 标题: ${finalTitle}`);

    res.json({
      success: true,
      audiobookId,
      needUploadCover: !!coverFile,
    });
  } catch (error: any) {
    console.error('[创建有声书] 失败:', error);
    res.status(500).json({ error: '创建有声书记录失败: ' + error.message });
  }
});

// 上传封面（单独接口）
router.post('/upload-cover', authenticateToken, uploadCover.single('cover'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { audiobookId } = req.body;

    if (!audiobookId) {
      return res.status(400).json({ error: '请提供 audiobookId' });
    }

    // 检查权限
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(audiobookId) as any;
    if (!audiobook || audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声书' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传封面文件' });
    }

    try {
      // 确保封面目录存在
      if (!fs.existsSync(coversDir)) {
        fs.mkdirSync(coversDir, { recursive: true });
      }

      // 生成封面文件名
      const coverExt = path.extname(req.file.originalname);
      const coverFileName = `${audiobookId}${coverExt}`;
      const targetCoverPath = path.join(coversDir, coverFileName);

      // 保存封面文件
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.renameSync(req.file.path, targetCoverPath);
      } else if (req.file.buffer) {
        fs.writeFileSync(targetCoverPath, req.file.buffer);
      }

      // 更新数据库
      db.prepare('UPDATE audiobooks SET cover_url = ? WHERE id = ?').run(coverFileName, audiobookId);

      console.log(`[上传封面] 已保存: ${coverFileName}`);

      res.json({
        success: true,
        coverUrl: coverFileName,
      });
    } catch (error: any) {
      console.error('[上传封面] 失败:', error);
      res.status(500).json({ error: '上传封面失败: ' + error.message });
    }
  } catch (error: any) {
    console.error('[上传封面] 失败:', error);
    res.status(500).json({ error: '上传封面失败: ' + error.message });
  }
});

// 上传批次文件
router.post('/upload-batch', authenticateToken, uploadAudiobookFiles.fields([
  { name: 'audioFiles', maxCount: 10 }
]), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { audiobookId, batchIndex } = req.body;

    if (!audiobookId) {
      return res.status(400).json({ error: '请提供 audiobookId' });
    }

    // 检查权限
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(audiobookId) as any;
    if (!audiobook || audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声书' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const audioFiles = files['audioFiles'] || [];
    
    if (!audioFiles || audioFiles.length === 0) {
      return res.status(400).json({ error: '请至少上传一个音频文件' });
    }

    // 文件存储在文件系统中，路径为: audioDir/audiobookId/
    // 例如: app/data/audio/{audiobookId}/
    const targetFolderPath = path.join(audioDir, audiobookId);
    if (!fs.existsSync(targetFolderPath)) {
      fs.mkdirSync(targetFolderPath, { recursive: true });
      console.log(`[批次上传] 创建音频文件目录: ${targetFolderPath}`);
    }

    // 获取当前已有的文件数量（用于排序）
    const existingFiles = db.prepare('SELECT COUNT(*) as count FROM audiobook_files WHERE audiobook_id = ?')
      .get(audiobookId) as any;
    let fileOrder = existingFiles?.count || 0;

    const fileRecords: any[] = [];

    // 按文件名排序
    audioFiles.sort((a, b) => a.originalname.localeCompare(b.originalname));

    // 准备数据库插入语句（复用以提高性能）
    const insertStmt = db.prepare(`
      INSERT INTO audiobook_files (
        id, audiobook_id, file_path, file_name, file_size, file_type, file_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // 使用事务批量处理文件（提高性能）
    const processFiles = db.transaction(() => {
      for (const audioFile of audioFiles) {
        // ✅ 修复：使用 fixFileNameEncoding 函数修复文件名编码
        const safeFileName = fixFileNameEncoding(audioFile.originalname);
        
        const targetFileName = `${String(fileOrder + 1).padStart(4, '0')}_${safeFileName}`;
        const targetFilePath = path.join(targetFolderPath, targetFileName);

        // 保存文件到文件系统（不存储到数据库，只存储路径等元数据）
        try {
          if (audioFile.path && fs.existsSync(audioFile.path)) {
            // 从临时目录移动到目标目录（文件存储在文件系统中）
            fs.renameSync(audioFile.path, targetFilePath);
            console.log(`[批次上传] 文件已保存到: ${targetFilePath}`);
          } else if (audioFile.buffer) {
            // 如果使用内存存储，写入到文件系统
            fs.writeFileSync(targetFilePath, audioFile.buffer);
            console.log(`[批次上传] 文件已写入到: ${targetFilePath}`);
          } else {
            console.error(`[批次上传] 文件 ${targetFileName} 没有数据`);
            continue;
          }
        } catch (error: any) {
          console.error(`[批次上传] 保存文件失败 ${targetFileName}:`, error);
          continue;
        }

        // 创建文件记录（数据库只存储文件路径等元数据，不存储文件内容）
        const fileId = uuidv4();
        const ext = path.extname(safeFileName).substring(1).toLowerCase();
        
        insertStmt.run(
          fileId,
          audiobookId,
          targetFilePath, // 文件系统路径
          targetFileName, // 文件名
          audioFile.size, // 文件大小
          ext,            // 文件类型
          fileOrder       // 文件顺序
        );

        fileRecords.push({
          id: fileId,
          fileName: targetFileName,
          fileSize: audioFile.size,
          fileType: ext,
          fileOrder,
        });

        fileOrder++;
      }
    });

    // 执行事务
    processFiles();

    console.log(`[批次上传] 批次 ${batchIndex} 完成: ${fileRecords.length} 个文件`);

    res.json({
      success: true,
      files: fileRecords,
      batchIndex: batchIndex ? parseInt(batchIndex) : 0,
    });
  } catch (error: any) {
    console.error('[批次上传] 失败:', error);
    res.status(500).json({ error: '批次上传失败: ' + error.message });
  }
});

// 完成上传（合并文件，更新状态）
router.post('/complete-upload', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { audiobookId } = req.body;

    if (!audiobookId) {
      return res.status(400).json({ error: '请提供 audiobookId' });
    }

    // 检查权限
    const audiobook = db.prepare('SELECT * FROM audiobooks WHERE id = ?').get(audiobookId) as any;
    if (!audiobook || audiobook.uploader_id !== userId) {
      return res.status(403).json({ error: '无权访问此有声书' });
    }

    // 获取所有文件
    const files = db.prepare(`
      SELECT * FROM audiobook_files 
      WHERE audiobook_id = ? 
      ORDER BY file_order ASC
    `).all(audiobookId) as any[];

    if (files.length === 0) {
      return res.status(400).json({ error: '没有找到上传的文件' });
    }

    // 更新描述（移除上传中标记）
    const currentDescription = audiobook.description;
    const finalDescription = currentDescription?.replace('[上传中]', '') || null;
    
    db.prepare('UPDATE audiobooks SET description = ?, updated_at = ? WHERE id = ?').run(
      finalDescription,
      new Date().toISOString(),
      audiobookId
    );

    // 如果没有封面，生成默认封面
    if (!audiobook.cover_url) {
      try {
        const coverUrl = await generateDefaultAudiobookCover(
          audiobookId,
          audiobook.title,
          audiobook.author
        );
        if (coverUrl) {
          db.prepare('UPDATE audiobooks SET cover_url = ? WHERE id = ?').run(coverUrl, audiobookId);
        }
      } catch (error: any) {
        console.error(`生成默认封面失败:`, error);
      }
    }

    console.log(`[完成上传] 有声书 ${audiobookId} 上传完成，共 ${files.length} 个文件`);

    res.json({
      success: true,
      audiobook: {
        id: audiobookId,
        title: audiobook.title,
        author: audiobook.author,
        fileCount: files.length,
      },
      files: files.map(f => ({
        id: f.id,
        fileName: f.file_name,
        fileSize: f.file_size,
        fileType: f.file_type,
        fileOrder: f.file_order,
      })),
    });
  } catch (error: any) {
    console.error('[完成上传] 失败:', error);
    res.status(500).json({ error: '完成上传失败: ' + error.message });
  }
});

export default router;

