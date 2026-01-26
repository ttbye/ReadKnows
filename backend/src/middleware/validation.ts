/**
 * @file validation.ts
 * @author ttbye
 * @date 2025-01-01
 * @description 输入验证中间件
 */

import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 确保req.body存在
      if (!req.body) {
        req.body = {};
      }

      // 记录请求信息（用于调试）
      console.log('[验证中间件] 开始验证请求:', {
        path: req.path,
        method: req.method,
        bodyKeys: Object.keys(req.body),
        body: req.body
      });

      // 执行所有验证规则
      // 使用Promise.allSettled确保所有验证规则都能执行，即使某些失败
      // 对每个验证规则进行try-catch包装，避免单个规则抛出异常导致整个验证失败
      const results = await Promise.allSettled(
        validations.map(validation => {
          return new Promise((resolve, reject) => {
            try {
              const result = validation.run(req);
              // 如果返回Promise，等待它完成
              if (result && typeof result.then === 'function') {
                result
                  .then(() => resolve(result))
                  .catch((e: any) => {
                    console.error('[验证中间件] 单个验证规则Promise失败:', e.message);
                    resolve(result); // 即使失败也resolve，让validationResult处理
                  });
              } else {
                resolve(result);
              }
            } catch (e: any) {
              console.error('[验证中间件] 单个验证规则执行异常:', e.message);
              // 即使异常也resolve，让validationResult处理
              resolve(null);
            }
          });
        })
      );
      
      // 检查是否有验证规则执行失败
      const failedValidations = results.filter(r => r.status === 'rejected');
      if (failedValidations.length > 0) {
        console.error('[验证中间件] 部分验证规则执行失败:', 
          failedValidations.map((r: any) => r.reason?.message || r.reason)
        );
        // 即使有验证规则执行失败，也继续检查验证结果
      }

      // 获取验证结果
      const errors = validationResult(req);
      
      if (errors.isEmpty()) {
        console.log('[验证中间件] ✅ 验证通过');
        return next();
      }

      // 验证失败，返回错误信息
      console.log('[验证中间件] ❌ 验证失败:', errors.array());
      
      // 提取第一个错误信息作为主要错误提示
      const firstError = errors.array()[0];
      const errorMessage = firstError?.msg || '输入验证失败';
      
      return res.status(400).json({ 
        error: errorMessage,
        errors: errors.array(),
        // 开发环境提供更多调试信息
        ...(process.env.NODE_ENV === 'development' ? {
          path: req.path,
          method: req.method,
          body: req.body
        } : {})
      });
    } catch (error: any) {
      console.error('[验证中间件] ⚠️ 验证过程出错:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        path: req.path,
        method: req.method
      });
      
      // 如果是验证相关的错误，返回400；否则返回500
      if (error.name === 'ValidationError' || error.message?.includes('validation')) {
        return res.status(400).json({ 
          error: '输入验证失败',
          message: error.message 
        });
      }
      
      // 对于其他错误，也返回400而不是500，避免前端看到500错误
      return res.status(400).json({ 
        error: '请求验证失败',
        message: error.message || '未知错误',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };
};

// 登录验证规则
// 使用简单但安全的验证方式
export const validateLogin = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('用户名不能为空'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('密码不能为空'),
  body('captcha')
    .trim()
    .notEmpty()
    .withMessage('验证码不能为空'),
  body('captchaSessionId')
    .trim()
    .notEmpty()
    .withMessage('验证码会话ID不能为空'),
];

// 注册验证规则
export const validateRegister = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('用户名长度必须在3-20个字符之间')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),
  body('nickname')
    .trim()
    .notEmpty()
    .withMessage('昵称不能为空')
    .isLength({ min: 1, max: 20 })
    .withMessage('昵称长度必须在1-20个字符之间'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('邮箱格式不正确')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('密码长度至少8位')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('密码必须包含大小写字母和数字'),
];

// UUID参数验证
export const validateUUID = [
  param('id').isUUID().withMessage('无效的ID格式'),
];

// 密码强度验证函数
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: '密码长度至少8位' };
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: '密码必须包含小写字母' };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: '密码必须包含大写字母' };
  }
  
  if (!/\d/.test(password)) {
    return { valid: false, message: '密码必须包含数字' };
  }
  
  return { valid: true };
}
