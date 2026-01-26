/**
 * @file useOfflineSupport.ts
 * @description 离线支持Hook（PWA优化）
 */

import { useCallback, useEffect, useRef } from 'react';
import { logError, ErrorCategory, ErrorSeverity } from '../utils/errorLogger';

/**
 * 离线支持配置
 */
export interface OfflineSupportConfig {
  /** 是否启用离线支持 */
  enabled?: boolean;
  /** 缓存键前缀 */
  cacheKeyPrefix?: string;
  /** 缓存过期时间（毫秒） */
  cacheExpiration?: number;
}

/**
 * 离线缓存数据
 */
export interface OfflineCacheData {
  audiobookId: string;
  fileId: string;
  currentTime: number;
  duration: number;
  timestamp: number;
}

/**
 * 离线支持Hook
 */
export function useOfflineSupport(
  audiobookId: string,
  config: OfflineSupportConfig = {}
): {
  saveOfflineState: (fileId: string, currentTime: number, duration: number) => void;
  loadOfflineState: () => OfflineCacheData | null;
  clearOfflineState: () => void;
  isOnline: boolean;
} {
  const {
    enabled = true,
    cacheKeyPrefix = 'audiobook_offline_',
    cacheExpiration = 24 * 60 * 60 * 1000, // 24小时
  } = config;

  const isOnlineRef = useRef(navigator.onLine);

  // 监听在线/离线状态
  useEffect(() => {
    if (!enabled) return;

    const handleOnline = () => {
      isOnlineRef.current = true;
      console.log('[useOfflineSupport] 网络已连接');
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      console.log('[useOfflineSupport] 网络已断开');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [enabled]);

  // 保存离线状态
  const saveOfflineState = useCallback(
    (fileId: string, currentTime: number, duration: number) => {
      if (!enabled) return;

      try {
        const cacheData: OfflineCacheData = {
          audiobookId,
          fileId,
          currentTime,
          duration,
          timestamp: Date.now(),
        };

        const cacheKey = `${cacheKeyPrefix}${audiobookId}`;
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      } catch (error) {
        logError(error as Error, {
          category: ErrorCategory.STORAGE,
          severity: ErrorSeverity.LOW,
          extra: { audiobookId, fileId },
        });
      }
    },
    [enabled, audiobookId, cacheKeyPrefix]
  );

  // 加载离线状态
  const loadOfflineState = useCallback((): OfflineCacheData | null => {
    if (!enabled) return null;

    try {
      const cacheKey = `${cacheKeyPrefix}${audiobookId}`;
      const cached = localStorage.getItem(cacheKey);

      if (!cached) return null;

      const cacheData: OfflineCacheData = JSON.parse(cached);

      // 检查是否过期
      if (Date.now() - cacheData.timestamp > cacheExpiration) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      // 检查是否是同一个有声小说
      if (cacheData.audiobookId !== audiobookId) {
        return null;
      }

      return cacheData;
    } catch (error) {
      logError(error as Error, {
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        extra: { audiobookId },
      });
      return null;
    }
  }, [enabled, audiobookId, cacheKeyPrefix, cacheExpiration]);

  // 清除离线状态
  const clearOfflineState = useCallback(() => {
    if (!enabled) return;

    try {
      const cacheKey = `${cacheKeyPrefix}${audiobookId}`;
      localStorage.removeItem(cacheKey);
    } catch (error) {
      logError(error as Error, {
        category: ErrorCategory.STORAGE,
        severity: ErrorSeverity.LOW,
        extra: { audiobookId },
      });
    }
  }, [enabled, audiobookId, cacheKeyPrefix]);

  return {
    saveOfflineState,
    loadOfflineState,
    clearOfflineState,
    isOnline: isOnlineRef.current,
  };
}
