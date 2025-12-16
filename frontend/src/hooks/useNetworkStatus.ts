/**
 * @file useNetworkStatus.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState, useCallback } from 'react';

/**
 * 网络状态监听Hook
 * 监听在线/离线状态变化
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      console.log('网络状态: 已连接');
      setIsOnline(true);
      // 如果之前是离线状态，标记为刚从离线恢复
      if (wasOffline) {
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      console.log('网络状态: 已断开');
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  /**
   * 检查是否刚从离线恢复（用于触发自动刷新）
   */
  const checkAndResetOfflineFlag = useCallback(() => {
    if (wasOffline && isOnline) {
      setWasOffline(false);
      return true; // 刚从离线恢复
    }
    return false;
  }, [wasOffline, isOnline]);

  return {
    isOnline,
    wasOffline,
    checkAndResetOfflineFlag,
  };
}

