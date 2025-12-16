"use strict";
/**
 * @file fileWatcher.ts
 * @author ttbye
 * @date 2025-12-11
 * @description 文件监控服务，监控import目录的电子书文件
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileWatcher = void 0;
exports.startFileWatcher = startFileWatcher;
exports.stopFileWatcher = stopFileWatcher;
exports.getWatcherStatus = getWatcherStatus;
exports.triggerManualScan = triggerManualScan;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const db_1 = require("../db");
const autoImportHandler_1 = require("./autoImportHandler");
class FileWatcher extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.isRunning = false;
        this.processedFiles = new Set(); // 已处理的文件
        this.fileStableTime = new Map(); // 文件稳定性检查
        this.STABLE_DURATION = 3000; // 文件必须稳定3秒才认为上传完成
        this.importDir = options.importDir;
        this.pollInterval = options.pollInterval || 5000; // 默认5秒
        this.supportedExtensions = options.supportedExtensions || ['.epub', '.pdf', '.txt', '.mobi'];
        // 确保导入目录存在
        this.ensureImportDir();
    }
    /**
     * 确保导入目录存在
     */
    ensureImportDir() {
        try {
            if (!fs_1.default.existsSync(this.importDir)) {
                fs_1.default.mkdirSync(this.importDir, { recursive: true });
                console.log('[文件监控] 创建导入目录:', this.importDir);
            }
        }
        catch (error) {
            console.error('[文件监控] 创建导入目录失败:', error.message);
        }
    }
    /**
       * 启动文件监控
       */
    start() {
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
    stop() {
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
    scanDirectory() {
        try {
            // 确保目录存在
            if (!fs_1.default.existsSync(this.importDir)) {
                this.ensureImportDir();
                return;
            }
            // 递归扫描目录
            this.scanDirectoryRecursive(this.importDir);
            // 清理已删除文件的记录
            this.cleanupDeletedFiles();
        }
        catch (error) {
            console.error('[文件监控] 扫描目录失败:', error.message);
        }
    }
    /**
     * 递归扫描目录
     */
    scanDirectoryRecursive(dir) {
        try {
            const items = fs_1.default.readdirSync(dir);
            for (const item of items) {
                const itemPath = path_1.default.join(dir, item);
                try {
                    const stats = fs_1.default.statSync(itemPath);
                    if (stats.isDirectory()) {
                        // 递归扫描子目录
                        console.log('[文件监控] 扫描子目录:', itemPath);
                        this.scanDirectoryRecursive(itemPath);
                    }
                    else if (stats.isFile()) {
                        // 处理文件
                        const fileExt = path_1.default.extname(item).toLowerCase();
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
                        const relativePath = path_1.default.relative(this.importDir, itemPath);
                        console.log('[文件监控] 发现新文件:', relativePath, '(', this.formatFileSize(stats.size), ')');
                        const detectedFile = {
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
                }
                catch (error) {
                    console.error('[文件监控] 处理项目失败:', item, error.message);
                }
            }
        }
        catch (error) {
            console.error('[文件监控] 扫描目录失败:', dir, error.message);
        }
    }
    /**
     * 检查文件是否稳定（大小不再变化）
     */
    isFileStable(filePath, currentSize) {
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
    cleanupDeletedFiles() {
        const toDelete = [];
        for (const filePath of this.processedFiles) {
            if (!fs_1.default.existsSync(filePath)) {
                toDelete.push(filePath);
            }
        }
        for (const filePath of toDelete) {
            this.processedFiles.delete(filePath);
        }
        // 清理稳定性检查的记录
        for (const [filePath] of this.fileStableTime.entries()) {
            if (!fs_1.default.existsSync(filePath)) {
                this.fileStableTime.delete(filePath);
            }
        }
    }
    /**
       * 标记文件处理成功（从已处理列表中移除，允许重新处理）
       */
    markFileProcessed(filePath) {
        // 文件已被删除，从已处理列表中移除
        this.processedFiles.delete(filePath);
    }
    /**
     * 标记文件处理失败（保留在已处理列表中，避免重复处理）
     */
    markFileFailed(filePath) {
        // 保持在已处理列表中
        console.log('[文件监控] 文件处理失败，标记为已处理:', filePath);
    }
    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes < 1024)
            return bytes + ' B';
        if (bytes < 1024 * 1024)
            return (bytes / 1024).toFixed(2) + ' KB';
        if (bytes < 1024 * 1024 * 1024)
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
    /**
     * 获取监控状态
     */
    getStatus() {
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
    triggerScan() {
        console.log('[文件监控] 手动触发扫描');
        this.scanDirectory();
    }
}
exports.FileWatcher = FileWatcher;
// ============================================
// 导出全局实例和辅助函数
// ============================================
let globalWatcher = null;
let importHandler = null;
/**
 * 启动文件监控服务
 */
function startFileWatcher() {
    if (globalWatcher) {
        console.warn('[文件监控] 监控服务已在运行中');
        return;
    }
    const importDir = process.env.IMPORT_DIR || './import';
    // 创建监控器实例
    globalWatcher = new FileWatcher({
        importDir,
        pollInterval: 5000, // 5秒轮询一次
        supportedExtensions: ['.epub', '.pdf', '.txt', '.mobi'],
    });
    // 创建导入处理器
    importHandler = new autoImportHandler_1.AutoImportHandler(db_1.db);
    // 监听文件检测事件
    globalWatcher.on('fileDetected', async (file) => {
        console.log('[自动导入] 检测到新文件，开始处理:', file.fileName);
        try {
            const result = await importHandler.processFile(file);
            if (result.success) {
                if (result.isDuplicate) {
                    console.log('[自动导入] 文件已存在，跳过:', result.bookTitle);
                }
                else {
                    console.log('[自动导入] 导入成功:', result.bookTitle, `(ID: ${result.bookId})`);
                }
                globalWatcher.markFileProcessed(file.filePath);
            }
            else {
                console.error('[自动导入] 导入失败:', file.fileName, result.error);
                globalWatcher.markFileFailed(file.filePath);
            }
        }
        catch (error) {
            console.error('[自动导入] 处理文件异常:', file.fileName, error.message);
            globalWatcher.markFileFailed(file.filePath);
        }
    });
    // 启动监控
    globalWatcher.start();
}
/**
 * 停止文件监控服务
 */
function stopFileWatcher() {
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
function getWatcherStatus() {
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
function triggerManualScan() {
    if (globalWatcher) {
        globalWatcher.triggerScan();
    }
    else {
        throw new Error('监控服务未启动');
    }
}
//# sourceMappingURL=fileWatcher.js.map