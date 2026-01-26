/**
 * @file pathCompatibility.ts
 * @description 路径兼容性处理，支持旧路径和新路径的自动转换
 */

import path from 'path';
import fs from 'fs';
import { booksDir } from '../config/paths';

/**
 * 尝试解析书籍文件路径，支持旧路径和新路径的兼容
 * @param filePath 数据库中存储的文件路径（可能是旧路径）
 * @returns 实际可用的文件路径，如果找不到则返回 null
 */
export function resolveBookFilePath(filePath: string): string | null {
  if (!filePath) {
    return null;
  }

  // 1. 首先尝试直接使用原路径（如果文件存在）
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  // 2. 如果是绝对路径，尝试转换为新路径
  if (path.isAbsolute(filePath)) {
    // 检查是否指向旧的 books 目录
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const oldBooksDir = path.join(projectRoot, 'books');
    
    if (filePath.startsWith(oldBooksDir)) {
      // 计算相对路径
      const relativePath = path.relative(oldBooksDir, filePath);
      // 构建新路径
      const newPath = path.join(booksDir, relativePath);
      if (fs.existsSync(newPath)) {
        return newPath;
      }
    }
    
    // 如果已经在新的 data/books 目录下，但文件不存在，尝试查找
    if (filePath.startsWith(booksDir)) {
      // 可能文件被移动了，尝试查找同名文件
      const fileName = path.basename(filePath);
      const foundPath = findFileInDirectory(booksDir, fileName);
      if (foundPath) {
        return foundPath;
      }
    }
  }
  
  // 3. 如果是相对路径，尝试在新目录下查找
  if (!path.isAbsolute(filePath)) {
    // 移除 'books/' 或 './books/' 前缀
    let relativePath = filePath.replace(/^(\.\/)?books\//, '');
    
    // 尝试在新路径下查找
    const newPath = path.join(booksDir, relativePath);
    if (fs.existsSync(newPath)) {
      return newPath;
    }
    
    // 如果还是找不到，尝试查找同名文件
    const fileName = path.basename(filePath);
    const foundPath = findFileInDirectory(booksDir, fileName);
    if (foundPath) {
      return foundPath;
    }
  }
  
  // 4. 最后尝试：使用文件名在 booksDir 下递归查找
  const fileName = path.basename(filePath);
  const foundPath = findFileInDirectory(booksDir, fileName);
  if (foundPath) {
    return foundPath;
  }
  
  return null;
}

/**
 * 在目录中递归查找文件
 * @param dir 搜索目录
 * @param fileName 文件名
 * @returns 找到的文件路径，如果找不到则返回 null
 */
function findFileInDirectory(dir: string, fileName: string): string | null {
  if (!fs.existsSync(dir)) {
    return null;
  }
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // 递归搜索子目录
        const found = findFileInDirectory(fullPath, fileName);
        if (found) {
          return found;
        }
      } else if (entry.name === fileName) {
        return fullPath;
      }
    }
  } catch (error) {
    // 忽略权限错误等
  }
  
  return null;
}

/**
 * 检查文件是否存在，如果不存在则尝试使用兼容性路径
 * @param filePath 文件路径
 * @returns 实际可用的文件路径，如果找不到则返回 null
 */
export function ensureBookFileExists(filePath: string): string | null {
  if (!filePath) {
    return null;
  }
  
  // 如果文件存在，直接返回
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  
  // 尝试使用兼容性解析
  return resolveBookFilePath(filePath);
}
