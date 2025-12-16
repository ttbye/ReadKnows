"use strict";
/**
 * @file ipBlock.ts
 * @author ttbye
 * @date 2025-12-11
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = getClientIp;
exports.checkIPBlocked = checkIPBlocked;
exports.recordAccessAttempt = recordAccessAttempt;
exports.checkAndBlockIP = checkAndBlockIP;
exports.verifyPrivateAccessKey = verifyPrivateAccessKey;
const db_1 = require("../db");
/**
 * 获取客户端真实IP地址
 */
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
/**
 * 检查IP是否被禁用
 */
function checkIPBlocked(req, res, next) {
    const clientIp = getClientIp(req);
    req.clientIp = clientIp;
    try {
        // 检查IP是否在禁用列表中
        const blocked = db_1.db
            .prepare(`
        SELECT * FROM blocked_ips 
        WHERE ip_address = ? 
        AND (unblock_at IS NULL OR unblock_at > datetime('now'))
      `)
            .get(clientIp);
        if (blocked) {
            return res.status(403).json({
                error: 'IP已被禁用',
                message: blocked.reason || '该IP地址已被管理员禁用',
                blockedAt: blocked.blocked_at,
            });
        }
        next();
    }
    catch (error) {
        console.error('检查IP禁用状态失败:', error);
        // 如果检查失败，允许继续（避免误拦截）
        next();
    }
}
/**
 * 记录访问尝试
 */
function recordAccessAttempt(ip, attemptType, success) {
    try {
        const id = require('uuid').v4();
        db_1.db.prepare(`
      INSERT INTO ip_access_attempts (id, ip_address, attempt_type, success)
      VALUES (?, ?, ?, ?)
    `).run(id, ip, attemptType, success ? 1 : 0);
    }
    catch (error) {
        console.error('记录访问尝试失败:', error);
    }
}
/**
 * 检查并处理IP访问尝试次数
 * 如果失败次数达到阈值，禁用IP
 */
function checkAndBlockIP(ip, attemptType) {
    try {
        const maxAttemptsSetting = db_1.db.prepare("SELECT value FROM system_settings WHERE key = 'max_access_attempts'").get();
        const maxAttempts = parseInt(maxAttemptsSetting?.value || '10');
        // 获取最近1小时内的失败尝试次数
        const recentAttempts = db_1.db
            .prepare(`
        SELECT COUNT(*) as count 
        FROM ip_access_attempts 
        WHERE ip_address = ? 
        AND attempt_type = ? 
        AND success = 0 
        AND created_at > datetime('now', '-1 hour')
      `)
            .get(ip, attemptType);
        if (recentAttempts.count >= maxAttempts) {
            // 禁用IP
            const blockedId = require('uuid').v4();
            db_1.db.prepare(`
        INSERT OR REPLACE INTO blocked_ips (id, ip_address, reason, attempts)
        VALUES (?, ?, ?, ?)
      `).run(blockedId, ip, `${attemptType}验证失败次数过多（${recentAttempts.count}次）`, recentAttempts.count);
            console.log(`IP ${ip} 因${attemptType}验证失败次数过多已被禁用`);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('检查IP访问尝试失败:', error);
        return false;
    }
}
/**
 * 验证私有访问密钥
 */
function verifyPrivateAccessKey(req, res, next) {
    const clientIp = req.clientIp || getClientIp(req);
    const { privateKey } = req.body;
    try {
        // 检查是否启用私有访问密钥验证
        const enabled = db_1.db
            .prepare("SELECT value FROM system_settings WHERE key = 'private_access_enabled'")
            .get();
        if (!enabled || enabled.value !== 'true') {
            // 如果未启用，直接通过
            return next();
        }
        // 获取配置的私有访问密钥
        const configKey = db_1.db
            .prepare("SELECT value FROM system_settings WHERE key = 'private_access_key'")
            .get();
        if (!configKey || !configKey.value) {
            // 如果未配置密钥，直接通过
            return next();
        }
        // 验证密钥
        if (!privateKey || privateKey !== configKey.value) {
            // 记录失败尝试
            recordAccessAttempt(clientIp, 'private_key', false);
            // 检查是否需要禁用IP
            const isBlocked = checkAndBlockIP(clientIp, 'private_key');
            if (isBlocked) {
                return res.status(403).json({
                    error: 'IP已被禁用',
                    message: '私有访问密钥验证失败次数过多，该IP已被禁用',
                });
            }
            return res.status(401).json({
                error: '私有访问密钥错误',
                message: '请输入正确的私有访问密钥',
            });
        }
        // 验证成功，记录成功尝试
        recordAccessAttempt(clientIp, 'private_key', true);
        next();
    }
    catch (error) {
        console.error('验证私有访问密钥失败:', error);
        return res.status(500).json({ error: '验证失败' });
    }
}
//# sourceMappingURL=ipBlock.js.map