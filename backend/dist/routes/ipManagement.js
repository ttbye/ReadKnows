"use strict";
/**
 * @file ipManagement.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// 获取所有被禁用的IP列表（管理员）
router.get('/blocked', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const blockedIPs = db_1.db
            .prepare(`
        SELECT 
          id,
          ip_address,
          reason,
          blocked_at,
          unblock_at,
          attempts,
          last_attempt
        FROM blocked_ips
        WHERE unblock_at IS NULL OR unblock_at > datetime('now')
        ORDER BY blocked_at DESC
      `)
            .all();
        res.json({ blockedIPs });
    }
    catch (error) {
        console.error('获取禁用IP列表失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
// 解禁IP（管理员）
router.post('/unblock/:id', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const blocked = db_1.db.prepare('SELECT * FROM blocked_ips WHERE id = ?').get(id);
        if (!blocked) {
            return res.status(404).json({ error: '未找到该IP记录' });
        }
        // 设置解禁时间
        db_1.db.prepare('UPDATE blocked_ips SET unblock_at = datetime("now") WHERE id = ?').run(id);
        res.json({ message: 'IP已解禁', ip: blocked.ip_address });
    }
    catch (error) {
        console.error('解禁IP失败:', error);
        res.status(500).json({ error: '解禁失败' });
    }
});
// 手动禁用IP（管理员）
router.post('/block', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { ipAddress, reason } = req.body;
        if (!ipAddress) {
            return res.status(400).json({ error: '请提供IP地址' });
        }
        const { v4: uuidv4 } = require('uuid');
        const blockedId = uuidv4();
        db_1.db.prepare(`
      INSERT OR REPLACE INTO blocked_ips (id, ip_address, reason, attempts)
      VALUES (?, ?, ?, 0)
    `).run(blockedId, ipAddress, reason || '管理员手动禁用');
        res.json({ message: 'IP已禁用', ip: ipAddress });
    }
    catch (error) {
        console.error('禁用IP失败:', error);
        res.status(500).json({ error: '禁用失败' });
    }
});
// 获取IP访问尝试记录（管理员）
router.get('/attempts', auth_1.authenticateToken, auth_1.requireAdmin, async (req, res) => {
    try {
        const { ip, limit = 100 } = req.query;
        let attempts;
        if (ip) {
            attempts = db_1.db
                .prepare(`
          SELECT * FROM ip_access_attempts
          WHERE ip_address = ?
          ORDER BY created_at DESC
          LIMIT ?
        `)
                .all(ip, parseInt(limit));
        }
        else {
            attempts = db_1.db
                .prepare(`
          SELECT * FROM ip_access_attempts
          ORDER BY created_at DESC
          LIMIT ?
        `)
                .all(parseInt(limit));
        }
        res.json({ attempts });
    }
    catch (error) {
        console.error('获取访问尝试记录失败:', error);
        res.status(500).json({ error: '获取失败' });
    }
});
exports.default = router;
//# sourceMappingURL=ipManagement.js.map