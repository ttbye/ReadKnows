/**
 * @file autoImportHandler.ts
 * @author ttbye
 * @date 2025-12-11
 * @description 自动导入处理器，处理检测到的电子书文件
 */
import Database from 'better-sqlite3';
import { DetectedFile } from './fileWatcher';
export interface ImportResult {
    success: boolean;
    bookId?: string;
    bookTitle?: string;
    error?: string;
    isDuplicate?: boolean;
}
export declare class AutoImportHandler {
    private db;
    constructor(db: Database.Database);
    /**
     * 获取系统设置
     */
    private getSetting;
    /**
     * 处理检测到的文件
     */
    processFile(file: DetectedFile): Promise<ImportResult>;
    /**
       * 删除文件
     */
    private deleteFile;
}
//# sourceMappingURL=autoImportHandler.d.ts.map