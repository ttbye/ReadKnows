/**
 * @file ipBlock.ts
 * @author ttbye
 * @date 2025-12-11
 */
import { Request, Response, NextFunction } from 'express';
export interface IPBlockRequest extends Request {
    clientIp?: string;
}
/**
 * 获取客户端真实IP地址
 */
export declare function getClientIp(req: Request): string;
/**
 * 检查IP是否被禁用
 */
export declare function checkIPBlocked(req: IPBlockRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * 记录访问尝试
 */
export declare function recordAccessAttempt(ip: string, attemptType: 'private_key' | 'login', success: boolean): void;
/**
 * 检查并处理IP访问尝试次数
 * 如果失败次数达到阈值，禁用IP
 */
export declare function checkAndBlockIP(ip: string, attemptType: 'private_key' | 'login'): boolean;
/**
 * 验证私有访问密钥
 */
export declare function verifyPrivateAccessKey(req: IPBlockRequest, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
//# sourceMappingURL=ipBlock.d.ts.map