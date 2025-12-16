/**
 * @file captcha.ts
 * @author ttbye
 * @date 2025-12-11
 */

import svgCaptcha from 'svg-captcha';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';

// 验证码会话存储（内存缓存，5分钟过期）
const captchaCache = new Map<string, { text: string; expiresAt: number }>();

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
export function generateCaptcha(sessionId?: string): { svg: string; sessionId: string } {
  const captcha = svgCaptcha.create({
    size: 4, // 验证码长度
    ignoreChars: '0o1il', // 忽略容易混淆的字符
    noise: 2, // 干扰线数量
    color: true, // 彩色
    background: '#f0f0f0', // 背景色
    width: 120,
    height: 40,
  });

  const id = sessionId || uuidv4();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟过期

  // 存储到内存缓存
  captchaCache.set(id, {
    text: captcha.text.toLowerCase(), // 转换为小写，不区分大小写
    expiresAt,
  });

  // 同时存储到数据库（作为备份）
  try {
    db.prepare(`
      INSERT OR REPLACE INTO captcha_sessions (id, session_id, captcha_text, expires_at)
      VALUES (?, ?, ?, datetime('now', '+' || ? || ' minutes'))
    `).run(uuidv4(), id, captcha.text.toLowerCase(), 5);
  } catch (e) {
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
export function verifyCaptcha(sessionId: string, userInput: string): boolean {
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
    const session = db
      .prepare(`
        SELECT captcha_text, expires_at 
        FROM captcha_sessions 
        WHERE session_id = ? AND expires_at > datetime('now')
      `)
      .get(sessionId) as any;

    if (!session) {
      return false;
    }

    const isValid = session.captcha_text === userInput.toLowerCase().trim();
    
    // 验证后删除（无论成功失败）
    db.prepare('DELETE FROM captcha_sessions WHERE session_id = ?').run(sessionId);

    return isValid;
  } catch (e) {
    console.error('验证码验证错误:', e);
    return false;
  }
}

/**
 * 清理过期验证码
 */
export function cleanExpiredCaptchas(): void {
  try {
    db.prepare("DELETE FROM captcha_sessions WHERE expires_at < datetime('now')").run();
  } catch (e) {
    console.error('清理过期验证码失败:', e);
  }
}

