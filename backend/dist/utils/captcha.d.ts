/**
 * @file captcha.ts
 * @author ttbye
 * @date 2025-12-11
 */
/**
 * 生成验证码
 * @param sessionId 会话ID（如果提供则使用，否则生成新的）
 * @returns 验证码图片SVG和会话ID
 */
export declare function generateCaptcha(sessionId?: string): {
    svg: string;
    sessionId: string;
};
/**
 * 验证验证码
 * @param sessionId 会话ID
 * @param userInput 用户输入的验证码
 * @returns 是否验证通过
 */
export declare function verifyCaptcha(sessionId: string, userInput: string): boolean;
/**
 * 清理过期验证码
 */
export declare function cleanExpiredCaptchas(): void;
//# sourceMappingURL=captcha.d.ts.map