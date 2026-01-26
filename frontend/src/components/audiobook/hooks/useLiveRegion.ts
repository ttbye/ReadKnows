/**
 * @file useLiveRegion.ts
 * @description 屏幕阅读器实时区域Hook（无障碍性支持）
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Live Region 优先级
 */
export enum LiveRegionPriority {
  /** 不重要的更新（默认） */
  POLITE = 'polite',
  /** 重要的更新 */
  ASSERTIVE = 'assertive',
  /** 关闭（不朗读） */
  OFF = 'off',
}

/**
 * 屏幕阅读器实时区域Hook
 * 
 * @param priority 优先级（默认：polite）
 * 
 * @example
 * ```tsx
 * const { announce } = useLiveRegion(LiveRegionPriority.POLITE);
 * 
 * // 宣布状态变化
 * announce('播放已暂停');
 * ```
 */
export function useLiveRegion(
  priority: LiveRegionPriority = LiveRegionPriority.POLITE
): {
  announce: (message: string, assertive?: boolean) => void;
  clear: () => void;
} {
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 创建或获取 live region
  useEffect(() => {
    let liveRegion = document.getElementById('audiobook-live-region') as HTMLDivElement;
    
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'audiobook-live-region';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only'; // 屏幕阅读器专用，视觉上隐藏
      liveRegion.style.cssText = `
        position: absolute;
        left: -10000px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      `;
      document.body.appendChild(liveRegion);
    } else {
      liveRegion.setAttribute('aria-live', priority);
    }
    
    liveRegionRef.current = liveRegion;
    
    return () => {
      // 组件卸载时不删除 live region，因为可能被其他组件使用
      // 如果需要删除，可以在应用卸载时统一清理
    };
  }, [priority]);
  
  // 宣布消息
  const announce = useCallback(
    (message: string, assertive = false) => {
      if (!liveRegionRef.current) {
        return;
      }
      
      // 清除之前的消息和定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // 设置优先级
      const currentPriority = assertive
        ? LiveRegionPriority.ASSERTIVE
        : priority;
      liveRegionRef.current.setAttribute('aria-live', currentPriority);
      
      // 清空内容（触发屏幕阅读器重新读取）
      liveRegionRef.current.textContent = '';
      
      // 延迟设置新内容，确保屏幕阅读器能够检测到变化
      timeoutRef.current = setTimeout(() => {
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = message;
          
          // 清除内容，为下次宣布做准备
          setTimeout(() => {
            if (liveRegionRef.current) {
              liveRegionRef.current.textContent = '';
            }
          }, 1000);
        }
      }, 100);
    },
    [priority]
  );
  
  // 清除消息
  const clear = useCallback(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = '';
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  
  return {
    announce,
    clear,
  };
}
