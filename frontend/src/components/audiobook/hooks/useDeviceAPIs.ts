/**
 * @file useDeviceAPIs.ts
 * @description 设备API集成Hook（PWA/移动端优化）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logError, ErrorCategory, ErrorSeverity } from '../utils/errorLogger';

/**
 * 设备API配置
 */
export interface DeviceAPIsConfig {
  /** 是否启用通知 */
  enableNotifications?: boolean;
  /** 是否启用屏幕唤醒锁定 */
  enableWakeLock?: boolean;
  /** 是否启用方向锁定 */
  enableOrientationLock?: boolean;
  /** 是否启用传感器 */
  enableSensors?: boolean;
}

/**
 * 通知权限状态
 */
export type NotificationPermission = 'default' | 'granted' | 'denied';

/**
 * 设备API Hook
 */
export function useDeviceAPIs(config: DeviceAPIsConfig = {}): {
  // 通知
  requestNotificationPermission: () => Promise<NotificationPermission>;
  showNotification: (title: string, options?: NotificationOptions) => Promise<void>;
  notificationPermission: NotificationPermission;
  
  // 屏幕唤醒锁定
  requestWakeLock: () => Promise<boolean>;
  releaseWakeLock: () => Promise<void>;
  isWakeLockActive: boolean;
  
  // 方向锁定
  lockOrientation: (orientation: OrientationLockType) => Promise<boolean>;
  unlockOrientation: () => Promise<void>;
  
  // 传感器
  isSensorSupported: boolean;
} {
  const {
    enableNotifications = true,
    enableWakeLock = true,
    enableOrientationLock = false,
    enableSensors = false,
  } = config;

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>('default');
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [isSensorSupported, setIsSensorSupported] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // 检查通知权限
  useEffect(() => {
    if (!enableNotifications || typeof Notification === 'undefined') {
      return;
    }

    setNotificationPermission(Notification.permission);
  }, [enableNotifications]);

  // 检查传感器支持
  useEffect(() => {
    if (!enableSensors) {
      return;
    }

    const checkSensorSupport = async () => {
      try {
        // 检查 DeviceOrientationEvent 或 DeviceMotionEvent
        if (
          typeof DeviceOrientationEvent !== 'undefined' ||
          typeof DeviceMotionEvent !== 'undefined'
        ) {
          setIsSensorSupported(true);
        }
      } catch (error) {
        setIsSensorSupported(false);
      }
    };

    checkSensorSupport();
  }, [enableSensors]);

  // 请求通知权限
  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!enableNotifications || typeof Notification === 'undefined') {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    } catch (error) {
      logError(error as Error, {
        category: ErrorCategory.PWA,
        severity: ErrorSeverity.LOW,
      });
      return 'denied';
    }
  }, [enableNotifications]);

  // 显示通知
  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (!enableNotifications || typeof Notification === 'undefined') {
        return;
      }

      if (notificationPermission !== 'granted') {
        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
          console.warn('[useDeviceAPIs] 通知权限未授予');
          return;
        }
      }

      try {
        const notification = new Notification(title, {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          ...options,
        });

        // 自动关闭通知（5秒后）
        setTimeout(() => {
          notification.close();
        }, 5000);
      } catch (error) {
        logError(error as Error, {
          category: ErrorCategory.PWA,
          severity: ErrorSeverity.LOW,
        });
      }
    },
    [enableNotifications, notificationPermission, requestNotificationPermission]
  );

  // 请求屏幕唤醒锁定
  const requestWakeLock = useCallback(async (): Promise<boolean> => {
    if (!enableWakeLock || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = wakeLock;
      setIsWakeLockActive(true);

      // 监听释放事件
      wakeLock.addEventListener('release', () => {
        setIsWakeLockActive(false);
        wakeLockRef.current = null;
      });

      return true;
    } catch (error) {
      logError(error as Error, {
        category: ErrorCategory.PWA,
        severity: ErrorSeverity.LOW,
      });
      return false;
    }
  }, [enableWakeLock]);

  // 释放屏幕唤醒锁定
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        setIsWakeLockActive(false);
      } catch (error) {
        logError(error as Error, {
          category: ErrorCategory.PWA,
          severity: ErrorSeverity.LOW,
        });
      }
    }
  }, []);

  // 锁定屏幕方向
  const lockOrientation = useCallback(
    async (orientation: OrientationLockType): Promise<boolean> => {
      if (!enableOrientationLock || typeof screen === 'undefined' || !screen.orientation) {
        return false;
      }

      try {
        await screen.orientation.lock(orientation);
        return true;
      } catch (error) {
        logError(error as Error, {
          category: ErrorCategory.PWA,
          severity: ErrorSeverity.LOW,
        });
        return false;
      }
    },
    [enableOrientationLock]
  );

  // 解锁屏幕方向
  const unlockOrientation = useCallback(async () => {
    if (typeof screen === 'undefined' || !screen.orientation) {
      return;
    }

    try {
      await screen.orientation.unlock();
    } catch (error) {
      logError(error as Error, {
        category: ErrorCategory.PWA,
        severity: ErrorSeverity.LOW,
      });
    }
  }, []);

  // 页面可见性变化时处理唤醒锁定
  useEffect(() => {
    if (!enableWakeLock) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
        // 页面重新可见时，如果之前有唤醒锁定，尝试重新获取
        // 注意：这里不自动重新获取，因为可能用户主动释放了
      } else if (document.visibilityState === 'hidden' && wakeLockRef.current) {
        // 页面隐藏时，释放唤醒锁定以节省电量
        await releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enableWakeLock, releaseWakeLock]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      releaseWakeLock();
      unlockOrientation();
    };
  }, [releaseWakeLock, unlockOrientation]);

  return {
    requestNotificationPermission,
    showNotification,
    notificationPermission,
    requestWakeLock,
    releaseWakeLock,
    isWakeLockActive,
    lockOrientation,
    unlockOrientation,
    isSensorSupported,
  };
}
