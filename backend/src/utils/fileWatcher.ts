/**
 * @file fileWatcher.ts
 * @author ttbye
 * @date 2025-12-11
 * @description 文件监控服务，监控import目录的电子书文件
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { db } from '../db';
import { AutoImportHandler } from './autoImportHandler';

export interface FileWatcherOptions {
  importDir: string;
  pollInterval?: number; // 轮询间隔（毫秒）
  supportedExtensions?: string[]; // 支持的文件扩展名
}

export interface DetectedFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileExt: string;
  detectedAt: Date;
}

export class FileWatcher extends EventEmitter {
  private importDir: string;
  private pollInterval: number;
  private supportedExtensions: string[];
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private processedFiles: Set<string> = new Set(); // 已处理的文件
  private fileStableTime: Map<string, { size: number; time: number }> = new Map(); // 文件稳定性检查
  private readonly STABLE_DURATION = 3000; // 文件必须稳定3秒才认为上传完成

  constructor(options: FileWatcherOptions) {
    super();
    this.importDir = options.importDir;
    this.pollInterval = options.pollInterval || 5000; // 默认5秒
    this.supportedExtensions = options.supportedExtensions || ['.epub', '.pdf', '.txt', '.mobi'];
    
    // 确保导入目录存在
    this.ensureImportDir();
  }

  /**
   * 确保导入目录存在
   */
  private ensureImportDir(): void {
    try {
      if (!fs.existsSync(this.importDir)) {
        fs.mkdirSync(this.importDir, { recursive: true });
        console.log('[文件监控] 创建导入目录:', this.importDir);
      }
    } catch (error: any) {
      console.error('[文件监控] 创建导入目录失败:', error.message);
    }
  }

/**
   * 启动文件监控
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('[文件监控] 监控服务已在运行中');
      return;
    }

    this.isRunning = true;
    console.log('[文件监控] 启动文件监控服务');
    console.log('[文件监控] 监控目录:', this.importDir);
    console.log('[文件监控] 轮询间隔:', this.pollInterval, 'ms');
    console.log('[文件监控] 支持的格式:', this.supportedExtensions.join(', '));

    // 立即执行一次扫描
    this.scanDirectory();

    // 定时扫描
    this.intervalId = setInterval(() => {
      this.scanDirectory();
    }, this.pollInterval);

    this.emit('started');
  }

  /**
   * 停止文件监控
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    console.log('[文件监控] 停止文件监控服务');
    this.emit('stopped');
  }

  /**
   * 扫描目录查找新文件（递归扫描所有子目录）
   */
  private scanDirectory(): void {
  try {
      // 确保目录存在
      if (!fs.existsSync(this.importDir)) {
        this.ensureImportDir();
        return;
      }

      // 递归扫描目录
      this.scanDirectoryRecursive(this.importDir);

      // 清理已删除文件的记录
      this.cleanupDeletedFiles();
    } catch (error: any) {
      console.error('[文件监控] 扫描目录失败:', error.message);
    }
  }

  /**
   * 递归扫描目录
   */
  private scanDirectoryRecursive(dir: string): void {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        
        try {
          const stats = fs.statSync(itemPath);
          
          if (stats.isDirectory()) {
            // 递归扫描子目录
            console.log('[文件监控] 扫描子目录:', itemPath);
            this.scanDirectoryRecursive(itemPath);
          } else if (stats.isFile()) {
            // 处理文件
            const fileExt = path.extname(item).toLowerCase();
            
            // 检查文件扩展名
            if (!this.supportedExtensions.includes(fileExt)) {
              continue;
            }

            // 检查是否已处理过
            if (this.processedFiles.has(itemPath)) {
              continue;
            }

            // 检查文件是否稳定（避免处理正在复制的文件）
            if (!this.isFileStable(itemPath, stats.size)) {
              continue;
            }

            // 发现新文件
            const relativePath = path.relative(this.importDir, itemPath);
            console.log('[文件监控] 发现新文件:', relativePath, '(', this.formatFileSize(stats.size), ')');
            
            const detectedFile: DetectedFile = {
              filePath: itemPath,
              fileName: item,
              fileSize: stats.size,
              fileExt,
              detectedAt: new Date(),
            };

            // 标记为已处理
            this.processedFiles.add(itemPath);

            // 触发文件发现事件
            this.emit('fileDetected', detectedFile);
          }
        } catch (error: any) {
          console.error('[文件监控] 处理项目失败:', item, error.message);
        }
      }
    } catch (error: any) {
      console.error('[文件监控] 扫描目录失败:', dir, error.message);
    }
    }

  /**
   * 检查文件是否稳定（大小不再变化）
   */
  private isFileStable(filePath: string, currentSize: number): boolean {
    const now = Date.now();
    const cached = this.fileStableTime.get(filePath);

    if (!cached) {
      // 第一次检测到这个文件
      this.fileStableTime.set(filePath, { size: currentSize, time: now });
      return false;
    }

    // 文件大小发生变化，更新记录
    if (cached.size !== currentSize) {
      this.fileStableTime.set(filePath, { size: currentSize, time: now });
      return false;
    }

    // 文件大小没变化，但时间还不够
    if (now - cached.time < this.STABLE_DURATION) {
    return false;
  }

    // 文件稳定了
    this.fileStableTime.delete(filePath);
    return true;
  }

  /**
   * 清理已删除文件的记录
   */
  private cleanupDeletedFiles(): void {
    const toDelete: string[] = [];
    
    for (const filePath of this.processedFiles) {
    if (!fs.existsSync(filePath)) {
        toDelete.push(filePath);
      }
    }

    for (const filePath of toDelete) {
      this.processedFiles.delete(filePath);
    }

    // 清理稳定性检查的记录
    for (const [filePath] of this.fileStableTime.entries()) {
      if (!fs.existsSync(filePath)) {
        this.fileStableTime.delete(filePath);
      }
    }
}

/**
   * 标记文件处理成功（从已处理列表中移除，允许重新处理）
   */
  public markFileProcessed(filePath: string): void {
    // 文件已被删除，从已处理列表中移除
    this.processedFiles.delete(filePath);
    }

  /**
   * 标记文件处理失败（保留在已处理列表中，避免重复处理）
   */
  public markFileFailed(filePath: string): void {
    // 保持在已处理列表中
    console.log('[文件监控] 文件处理失败，标记为已处理:', filePath);
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * 获取监控状态
   */
  public getStatus(): {
    isRunning: boolean;
    importDir: string;
    pollInterval: number;
    processedCount: number;
    pendingCount: number;
  } {
    return {
      isRunning: this.isRunning,
      importDir: this.importDir,
      pollInterval: this.pollInterval,
      processedCount: this.processedFiles.size,
      pendingCount: this.fileStableTime.size,
    };
  }

  /**
   * 手动触发扫描
   */
  public triggerScan(): void {
    console.log('[文件监控] 手动触发扫描');
    this.scanDirectory();
  }
}

// ============================================
// 导出全局实例和辅助函数
// ============================================

let globalWatcher: FileWatcher | null = null;
let importHandler: AutoImportHandler | null = null;

/**
 * 启动文件监控服务
 */
export function startFileWatcher(): void {
  if (globalWatcher) {
    console.warn('[文件监控] 监控服务已在运行中');
    return;
  }

  const { importDir } = require('../config/paths');
  
  // 创建监控器实例
  globalWatcher = new FileWatcher({
    importDir,
    pollInterval: 5000, // 5秒轮询一次
    supportedExtensions: ['.epub', '.pdf', '.txt', '.mobi'],
    });

  // 创建导入处理器
  importHandler = new AutoImportHandler(db);

  // 监听文件检测事件
  globalWatcher.on('fileDetected', async (file) => {
    console.log('[自动导入] 检测到新文件，开始处理:', file.fileName);
    
    try {
      const result = await importHandler!.processFile(file);
      
      if (result.success) {
        if (result.isDuplicate) {
          console.log('[自动导入] 文件已存在，跳过:', result.bookTitle);
        } else {
          console.log('[自动导入] 导入成功:', result.bookTitle, `(ID: ${result.bookId})`);
        }
        globalWatcher!.markFileProcessed(file.filePath);
      } else {
        console.error('[自动导入] 导入失败:', file.fileName, result.error);
        globalWatcher!.markFileFailed(file.filePath);
      }
  } catch (error: any) {
      console.error('[自动导入] 处理文件异常:', file.fileName, error.message);
      globalWatcher!.markFileFailed(file.filePath);
  }
  });

  // 启动监控
  globalWatcher.start();
}

/**
 * 停止文件监控服务
 */
export function stopFileWatcher(): void {
  if (globalWatcher) {
    globalWatcher.stop();
    globalWatcher = null;
    importHandler = null;
    console.log('[文件监控] 监控服务已停止');
  }
}

/**
 * 获取监控器状态
 */
export function getWatcherStatus(): any {
  if (!globalWatcher) {
  return {
      isRunning: false,
      error: '监控服务未启动',
    };
  }
  return globalWatcher.getStatus();
}

/**
 * 手动触发扫描
 */
export function triggerManualScan(): void {
  if (globalWatcher) {
    globalWatcher.triggerScan();
  } else {
    throw new Error('监控服务未启动');
  }
}
