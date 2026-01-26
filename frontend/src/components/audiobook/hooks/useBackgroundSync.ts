/**
 * @file useBackgroundSync.ts
 * @description 后台同步Hook（PWA优化）
 */

import { useCallback, useEffect, useRef } from 'react';
import { logError, ErrorCategory, ErrorSeverity } from '../utils/errorLogger';

/**
 * 后台同步配置
 */
export interface BackgroundSyncConfig {
  /** 是否启用后台同步 */
  enabled?: boolean;
  /** 同步间隔（毫秒） */
  syncInterval?: number;
  /** 是否在页面可见时同步 */
  syncOnVisible?: boolean;
}

/**
 * 同步任务
 */
export interface SyncTask {
  id: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

/**
 * 后台同步Hook
 */
export function useBackgroundSync(
  syncFunction: (data: unknown) => Promise<void>,
  config: BackgroundSyncConfig = {}
): {
  queueSync: (data: unknown) => void;
  processSyncQueue: () => Promise<void>;
  clearSyncQueue: () => void;
} {
  const {
    enabled = true,
    syncInterval = 30000, // 30秒
    syncOnVisible = true,
  } = config;

  const syncQueueRef = useRef<SyncTask[]>([]);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  // 处理同步队列
  const processSyncQueue = useCallback(async () => {
    if (!enabled || isProcessingRef.current || syncQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const tasks = [...syncQueueRef.current];
      syncQueueRef.current = [];

      for (const task of tasks) {
        try {
          await syncFunction(task.data);
          console.log('[useBackgroundSync] 同步成功', { taskId: task.id });
        } catch (error) {
          // 同步失败，重新加入队列（最多重试3次）
          if (task.retries < 3) {
            task.retries++;
            syncQueueRef.current.push(task);
            logError(error as Error, {
              category: ErrorCategory.NETWORK,
              severity: ErrorSeverity.LOW,
              extra: { taskId: task.id, retries: task.retries },
            });
          } else {
            logError(error as Error, {
              category: ErrorCategory.NETWORK,
              severity: ErrorSeverity.MEDIUM,
              extra: { taskId: task.id, maxRetries: true },
            });
          }
        }
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [enabled, syncFunction]);

  // 添加同步任务到队列
  const queueSync = useCallback(
    (data: unknown) => {
      if (!enabled) return;

      const task: SyncTask = {
        id: `sync_${Date.now()}_${Math.random()}`,
        data,
        timestamp: Date.now(),
        retries: 0,
      };

      syncQueueRef.current.push(task);

      // 如果队列中有任务且不在处理中，立即处理
      if (!isProcessingRef.current) {
        processSyncQueue();
      }
    },
    [enabled, processSyncQueue]
  );

  // 清除同步队列
  const clearSyncQueue = useCallback(() => {
    syncQueueRef.current = [];
  }, []);

  // 定期同步
  useEffect(() => {
    if (!enabled) return;

    syncIntervalRef.current = setInterval(() => {
      processSyncQueue();
    }, syncInterval);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [enabled, syncInterval, processSyncQueue]);

  // 页面可见时同步
  useEffect(() => {
    if (!enabled || !syncOnVisible) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        processSyncQueue();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, syncOnVisible, processSyncQueue]);

  // 注册 Service Worker 后台同步（如果支持）
  useEffect(() => {
    // ✅ 修复：完全禁用 Background Sync API 检查，避免任何可能的错误
    // 这个功能不是必需的，如果出现问题会影响整个组件
    // 如果需要 Background Sync，可以在 Service Worker 中实现
    return;
    
    // 以下代码已禁用，避免 'sync' in undefined 错误
    /*
    if (!enabled || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 检查是否支持 Background Sync API
    // 注意：navigator.serviceWorker.registration 可能不存在，需要先获取 ready
    const registerBackgroundSync = async () => {
      try {
        // ✅ 修复：确保 navigator.serviceWorker 存在
        if (!navigator.serviceWorker) {
          return;
        }
        
        // ✅ 修复：检查 navigator.serviceWorker.ready 是否存在
        if (!navigator.serviceWorker.ready) {
          return;
        }
        
        const swRegistration = await navigator.serviceWorker.ready;
        
        // ✅ 修复：更严格的检查，确保 swRegistration 是有效的对象
        // 使用 try-catch 包裹，避免任何可能的错误
        try {
          if (swRegistration && 
              typeof swRegistration === 'object' && 
              swRegistration !== null) {
            // 使用 hasOwnProperty 而不是 'in' 操作符
            const hasSync = Object.prototype.hasOwnProperty.call(swRegistration, 'sync');
            if (hasSync) {
              console.log('[useBackgroundSync] Background Sync API 已注册');
            }
          }
        } catch (checkError) {
          // 忽略检查错误，不影响功能
          console.warn('[useBackgroundSync] 检查 Background Sync API 失败:', checkError);
        }
      } catch (error) {
        // 捕获所有错误，避免影响组件渲染
        console.warn('[useBackgroundSync] Background Sync API 注册失败:', error);
      }
    };

    registerBackgroundSync();
    */
  }, [enabled]);

  // 页面卸载前同步
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
      if (syncQueueRef.current.length > 0) {
        // 使用 sendBeacon 发送同步请求（如果支持）
        if ('sendBeacon' in navigator) {
          syncQueueRef.current.forEach((task) => {
            try {
              const blob = new Blob([JSON.stringify(task.data)], {
                type: 'application/json',
              });
              navigator.sendBeacon('/api/audiobooks/sync', blob);
            } catch (error) {
              console.warn('[useBackgroundSync] sendBeacon 失败:', error);
            }
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled]);

  return {
    queueSync,
    processSyncQueue,
    clearSyncQueue,
  };
}
