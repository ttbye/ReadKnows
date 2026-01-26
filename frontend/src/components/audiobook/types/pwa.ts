/**
 * @file pwa.ts
 * @description PWA 相关类型定义
 */

import { PlayerState } from './index';

/**
 * PWA 状态信息
 */
export interface PWAState {
  audiobookId: string;
  currentFileId: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  timestamp: number;
}

/**
 * PWA 状态持久化配置
 */
export interface PWAStateConfig {
  storageKey?: string;
  expirationTime?: number; // 过期时间（毫秒），默认1小时
}

/**
 * 检测是否为 PWA 模式
 */
export function isPWAMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * 检测是否为 iOS 设备
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream
  );
}

/**
 * 检测是否为 Android WebView
 */
export function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent;
  const referrer = document.referrer;
  const windowAny = window as any;

  return (
    /Android/.test(userAgent) &&
    (referrer.includes('android-app://') ||
      windowAny.Capacitor?.getPlatform() === 'android' ||
      windowAny.Android !== undefined)
  );
}

/**
 * 设备环境信息
 */
export interface DeviceEnvironment {
  isPWAMode: boolean;
  isIOS: boolean;
  isAndroidWebView: boolean;
  isMobile: boolean;
}

/**
 * 获取设备环境信息
 */
export function getDeviceEnvironment(): DeviceEnvironment {
  return {
    isPWAMode: isPWAMode(),
    isIOS: isIOSDevice(),
    isAndroidWebView: isAndroidWebView(),
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ),
  };
}
