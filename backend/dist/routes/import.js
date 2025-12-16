"use strict";
/**
 * @file import.ts
 * @author ttbye
 * @date 2025-12-11
 * @description 自动导入管理API路由
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const fileWatcher_1 = require("../utils/fileWatcher");
const db_1 = require("../db");
const router = express_1.default.Router();
/**
 * 获取自动导入服务状态
 * GET /api/import/status
 */
router.get('/status', auth_1.authenticateToken, async (req, res) => {
    try {
        const status = (0, fileWatcher_1.getWatcherStatus)();
        // 获取最近的导入记录
        const recentImports = db_1.db
            .prepare(`
        SELECT id, title, author, file_name, file_size, created_at
        FROM books
        WHERE uploader_id IS NULL
        ORDER BY created_at DESC
        LIMIT 10
      `)
            .all();
        res.json({
            service: status,
            recentImports,
        });
    }
    catch (error) {
        console.error('[自动导入API] 获取状态失败:', error);
        res.status(500).json({
            error: '获取状态失败',
            message: error.message
        });
    }
});
/**
 * 手动触发扫描
 * POST /api/import/scan
 */
router.post('/scan', auth_1.authenticateToken, async (req, res) => {
    try {
        (0, fileWatcher_1.triggerManualScan)();
        res.json({
            message: '已触发手动扫描',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('[自动导入API] 触发扫描失败:', error);
        res.status(500).json({
            error: '触发扫描失败',
            message: error.message
        });
    }
});
/**
 * 获取导入统计
 * GET /api/import/stats
 */
router.get('/stats', auth_1.authenticateToken, async (req, res) => {
    try {
        // 统计自动导入的书籍（uploader_id 为 NULL 的）
        const stats = db_1.db
            .prepare(`
        SELECT 
          COUNT(*) as total_count,
          SUM(file_size) as total_size,
          COUNT(DISTINCT DATE(created_at)) as import_days
        FROM books
        WHERE uploader_id IS NULL
      `)
            .get();
        // 按日期统计
        const dailyStats = db_1.db
            .prepare(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count,
          SUM(file_size) as total_size
        FROM books
        WHERE uploader_id IS NULL
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `)
            .all();
        // 按格式统计
        const formatStats = db_1.db
            .prepare(`
        SELECT 
          file_type,
          COUNT(*) as count,
          SUM(file_size) as total_size
        FROM books
        WHERE uploader_id IS NULL
        GROUP BY file_type
      `)
            .all();
        res.json({
            summary: {
                totalBooks: stats.total_count || 0,
                totalSize: stats.total_size || 0,
                importDays: stats.import_days || 0,
            },
            dailyStats,
            formatStats,
        });
    }
    catch (error) {
        console.error('[自动导入API] 获取统计失败:', error);
        res.status(500).json({
            error: '获取统计失败',
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=import.js.map