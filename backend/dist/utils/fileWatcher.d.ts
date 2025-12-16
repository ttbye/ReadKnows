/**
 * @file fileWatcher.ts
 * @author ttbye
 * @date 2025-12-11
 * @description 文件监控服务，监控import目录的电子书文件
 */
import { EventEmitter } from 'events';
export interface FileWatcherOptions {
    importDir: string;
    pollInterval?: number;
    supportedExtensions?: string[];
}
export interface DetectedFile {
    filePath: string;
    fileName: string;
    fileSize: number;
    fileExt: string;
    detectedAt: Date;
}
export declare class FileWatcher extends EventEmitter {
    private importDir;
    private pollInterval;
    private supportedExtensions;
    private isRunning;
    private intervalId?;
    private processedFiles;
    private fileStableTime;
    private readonly STABLE_DURATION;
    constructor(options: FileWatcherOptions);
    /**
     * 确保导入目录存在
     */
    private ensureImportDir;
    /**
       * 启动文件监控
       */
    start(): void;
    /**
     * 停止文件监控
     */
    stop(): void;
    /**
     * 扫描目录查找新文件（递归扫描所有子目录）
     */
    private scanDirectory;
    /**
     * 递归扫描目录
     */
    private scanDirectoryRecursive;
    /**
     * 检查文件是否稳定（大小不再变化）
     */
    private isFileStable;
    /**
     * 清理已删除文件的记录
     */
    private cleanupDeletedFiles;
    /**
       * 标记文件处理成功（从已处理列表中移除，允许重新处理）
       */
    markFileProcessed(filePath: string): void;
    /**
     * 标记文件处理失败（保留在已处理列表中，避免重复处理）
     */
    markFileFailed(filePath: string): void;
    /**
     * 格式化文件大小
     */
    private formatFileSize;
    /**
     * 获取监控状态
     */
    getStatus(): {
        isRunning: boolean;
        importDir: string;
        pollInterval: number;
        processedCount: number;
        pendingCount: number;
    };
    /**
     * 手动触发扫描
     */
    triggerScan(): void;
}
/**
 * 启动文件监控服务
 */
export declare function startFileWatcher(): void;
/**
 * 停止文件监控服务
 */
export declare function stopFileWatcher(): void;
/**
 * 获取监控器状态
 */
export declare function getWatcherStatus(): any;
/**
 * 手动触发扫描
 */
export declare function triggerManualScan(): void;
//# sourceMappingURL=fileWatcher.d.ts.map