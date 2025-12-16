"use strict";
/**
 * @file captcha.ts
 * @author ttbye
 * @date 2025-12-11
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCaptcha = generateCaptcha;
exports.verifyCaptcha = verifyCaptcha;
exports.cleanExpiredCaptchas = cleanExpiredCaptchas;
const svg_captcha_1 = __importDefault(require("svg-captcha"));
const uuid_1 = require("uuid");
const db_1 = require("../db");
// 验证码会话存储（内存缓存，5分钟过期）
const captchaCache = new Map();
// 清理过期验证码
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, data] of captchaCache.entries()) {
        if (data.expiresAt < now) {
            captchaCache.delete(sessionId);
        }
    }
}, 60000); // 每分钟清理一次
/**
 * 生成验证码
 * @param sessionId 会话ID（如果提供则使用，否则生成新的）
 * @returns 验证码图片SVG和会话ID
 */
function generateCaptcha(sessionId) {
    const captcha = svg_captcha_1.default.create({
        size: 4, // 验证码长度
        ignoreChars: '0o1il', // 忽略容易混淆的字符
        noise: 2, // 干扰线数量
        color: true, // 彩色
        background: '#f0f0f0', // 背景色
        width: 120,
        height: 40,
    });
    const id = sessionId || (0, uuid_1.v4)();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟过期
    // 存储到内存缓存
    captchaCache.set(id, {
        text: captcha.text.toLowerCase(), // 转换为小写，不区分大小写
        expiresAt,
    });
    // 同时存储到数据库（作为备份）
    try {
        db_1.db.prepare(`
      INSERT OR REPLACE INTO captcha_sessions (id, session_id, captcha_text, expires_at)
      VALUES (?, ?, ?, datetime('now', '+' || ? || ' minutes'))
    `).run((0, uuid_1.v4)(), id, captcha.text.toLowerCase(), 5);
    }
    catch (e) {
        console.warn('保存验证码到数据库失败:', e);
    }
    return {
        svg: captcha.data,
        sessionId: id,
    };
}
/**
 * 验证验证码
 * @param sessionId 会话ID
 * @param userInput 用户输入的验证码
 * @returns 是否验证通过
 */
function verifyCaptcha(sessionId, userInput) {
    if (!sessionId || !userInput) {
        return false;
    }
    // 先从内存缓存查找
    const cached = captchaCache.get(sessionId);
    if (cached) {
        if (cached.expiresAt < Date.now()) {
            captchaCache.delete(sessionId);
            return false;
        }
        const isValid = cached.text === userInput.toLowerCase().trim();
        if (isValid) {
            // 验证成功后删除
            captchaCache.delete(sessionId);
        }
        return isValid;
    }
    // 如果内存中没有，从数据库查找
    try {
        const session = db_1.db
            .prepare(`
        SELECT captcha_text, expires_at 
        FROM captcha_sessions 
        WHERE session_id = ? AND expires_at > datetime('now')
      `)
            .get(sessionId);
        if (!session) {
            return false;
        }
        const isValid = session.captcha_text === userInput.toLowerCase().trim();
        // 验证后删除（无论成功失败）
        db_1.db.prepare('DELETE FROM captcha_sessions WHERE session_id = ?').run(sessionId);
        return isValid;
    }
    catch (e) {
        console.error('验证码验证错误:', e);
        return false;
    }
}
/**
 * 清理过期验证码
 */
function cleanExpiredCaptchas() {
    try {
        db_1.db.prepare("DELETE FROM captcha_sessions WHERE expires_at < datetime('now')").run();
    }
    catch (e) {
        console.error('清理过期验证码失败:', e);
    }
}
//# sourceMappingURL=captcha.js.map