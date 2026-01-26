/**
 * @file useErrorRecovery.ts
 * @description 错误恢复Hook
 */

import { useCallback, useRef } from 'react';
import { logError, ErrorCategory, ErrorSeverity } from '../utils/errorLogger';
import { getAudioErrorType, AudioErrorType } from '../types/audio';

/**
 * 错误恢复策略
 */
export enum RecoveryStrategy {
  /** 重试 */
  RETRY = 'retry',
  /** 跳过当前项 */
  SKIP = 'skip',
  /** 回退到上一个状态 */
  ROLLBACK = 'rollback',
  /** 重置 */
  RESET = 'reset',
  /** 忽略 */
  IGNORE = 'ignore',
}

/**
 * 错误恢复配置
 */
export interface ErrorRecoveryConfig {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 是否自动恢复 */
  autoRecover?: boolean;
}

/**
 * 错误恢复结果
 */
export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  message?: string;
}

/**
 * 错误恢复Hook
 */
export function useErrorRecovery(config: ErrorRecoveryConfig = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    autoRecover = true,
  } = config;

  const retryCountRef = useRef<Map<string, number>>(new Map());

  /**
   * 处理音频错误
   */
  const handleAudioError = useCallback(
    (
      error: MediaError | null,
      audio: HTMLAudioElement,
      onRetry?: () => Promise<void>
    ): RecoveryResult => {
      if (!error) {
        return { success: true, strategy: RecoveryStrategy.IGNORE };
      }

      const errorType = getAudioErrorType(error);
      const errorKey = `audio_${error.code}`;
      const retryCount = retryCountRef.current.get(errorKey) || 0;

      // 记录错误
      logError(new Error(`Audio error: ${errorType}`), {
        category: ErrorCategory.AUDIO,
        severity: ErrorSeverity.MEDIUM,
        extra: {
          code: error.code,
          message: error.message,
          errorType,
        },
      });

      // 根据错误类型选择恢复策略
      switch (errorType) {
        case AudioErrorType.NETWORK:
          // 网络错误：重试
          if (retryCount < maxRetries && autoRecover) {
            retryCountRef.current.set(errorKey, retryCount + 1);
            setTimeout(() => {
              if (onRetry) {
                onRetry().catch((e) => {
                  console.error('[useErrorRecovery] 重试失败:', e);
                });
              } else {
                audio.load();
              }
            }, retryDelay * (retryCount + 1)); // 指数退避
            return {
              success: true,
              strategy: RecoveryStrategy.RETRY,
              message: `网络错误，正在重试（${retryCount + 1}/${maxRetries}）...`,
            };
          }
          return {
            success: false,
            strategy: RecoveryStrategy.SKIP,
            message: '网络错误，无法加载音频',
          };

        case AudioErrorType.DECODE:
          // 解码错误：跳过
          return {
            success: false,
            strategy: RecoveryStrategy.SKIP,
            message: '音频解码失败，请检查文件格式',
          };

        case AudioErrorType.SRC_NOT_SUPPORTED:
          // 不支持的格式：跳过
          return {
            success: false,
            strategy: RecoveryStrategy.SKIP,
            message: '不支持的音频格式',
          };

        case AudioErrorType.ABORTED:
          // 中止：忽略
          return {
            success: true,
            strategy: RecoveryStrategy.IGNORE,
            message: '加载已中止',
          };

        default:
          // 未知错误：重试
          if (retryCount < maxRetries && autoRecover) {
            retryCountRef.current.set(errorKey, retryCount + 1);
            setTimeout(() => {
              if (onRetry) {
                onRetry().catch((e) => {
                  console.error('[useErrorRecovery] 重试失败:', e);
                });
              } else {
                audio.load();
              }
            }, retryDelay * (retryCount + 1));
            return {
              success: true,
              strategy: RecoveryStrategy.RETRY,
              message: `未知错误，正在重试（${retryCount + 1}/${maxRetries}）...`,
            };
          }
          return {
            success: false,
            strategy: RecoveryStrategy.SKIP,
            message: '未知错误，无法恢复',
          };
      }
    },
    [maxRetries, retryDelay, autoRecover]
  );

  /**
   * 处理网络错误
   */
  const handleNetworkError = useCallback(
    (
      error: Error,
      onRetry?: () => Promise<void>
    ): RecoveryResult => {
      const errorKey = `network_${error.message}`;
      const retryCount = retryCountRef.current.get(errorKey) || 0;

      // 记录错误
      logError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
      });

      // 网络错误：重试
      if (retryCount < maxRetries && autoRecover) {
        retryCountRef.current.set(errorKey, retryCount + 1);
        setTimeout(() => {
          if (onRetry) {
            onRetry().catch((e) => {
              console.error('[useErrorRecovery] 网络重试失败:', e);
            });
          }
        }, retryDelay * (retryCount + 1));
        return {
          success: true,
          strategy: RecoveryStrategy.RETRY,
          message: `网络错误，正在重试（${retryCount + 1}/${maxRetries}）...`,
        };
      }

      return {
        success: false,
        strategy: RecoveryStrategy.SKIP,
        message: '网络错误，无法连接服务器',
      };
    },
    [maxRetries, retryDelay, autoRecover]
  );

  /**
   * 处理PWA错误
   */
  const handlePWAError = useCallback(
    (error: Error): RecoveryResult => {
      // 记录错误
      logError(error, {
        category: ErrorCategory.PWA,
        severity: ErrorSeverity.LOW,
      });

      // PWA错误通常可以忽略，不影响核心功能
      return {
        success: true,
        strategy: RecoveryStrategy.IGNORE,
        message: 'PWA功能暂时不可用，但不影响播放',
      };
    },
    []
  );

  /**
   * 重置重试计数
   */
  const resetRetryCount = useCallback((key?: string) => {
    if (key) {
      retryCountRef.current.delete(key);
    } else {
      retryCountRef.current.clear();
    }
  }, []);

  return {
    handleAudioError,
    handleNetworkError,
    handlePWAError,
    resetRetryCount,
  };
}
