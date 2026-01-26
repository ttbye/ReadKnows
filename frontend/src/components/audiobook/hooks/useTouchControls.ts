/**
 * @file useTouchControls.ts
 * @description 触摸控制Hook（PWA/移动端优化）
 */

import { useCallback, useRef, useEffect } from 'react';

/**
 * 触摸控制配置
 */
export interface TouchControlsConfig {
  /** 是否启用触摸控制 */
  enabled?: boolean;
  /** 双击播放/暂停阈值（毫秒） */
  doubleTapThreshold?: number;
  /** 滑动调节进度阈值（像素） */
  swipeThreshold?: number;
  /** 长按显示菜单阈值（毫秒） */
  longPressThreshold?: number;
  /** 是否启用振动反馈 */
  enableHapticFeedback?: boolean;
}

/**
 * 触摸控制处理函数
 */
export interface TouchControlsHandlers {
  /** 播放/暂停切换 */
  onTogglePlay: () => void;
  /** 上一首 */
  onPrevious?: () => void;
  /** 下一首 */
  onNext?: () => void;
  /** 快退 */
  onSeekBackward?: () => void;
  /** 快进 */
  onSeekForward?: () => void;
  /** 调整进度 */
  onSeek?: (delta: number) => void;
  /** 显示/隐藏菜单 */
  onToggleMenu?: () => void;
}

/**
 * 触摸控制Hook
 * 
 * @param handlers 触摸控制处理函数
 * @param config 配置选项
 * 
 * @example
 * ```tsx
 * const { touchHandlers } = useTouchControls({
 *   onTogglePlay: () => togglePlay(),
 *   onSeek: (delta) => seekTo(currentTime + delta),
 * }, {
 *   enabled: true,
 *   enableHapticFeedback: true,
 * });
 * 
 * return <div {...touchHandlers}>...</div>;
 * ```
 */
export function useTouchControls(
  handlers: TouchControlsHandlers,
  config: TouchControlsConfig = {}
): {
  touchHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
} {
  const {
    enabled = true,
    doubleTapThreshold = 300,
    swipeThreshold = 50,
    longPressThreshold = 500,
    enableHapticFeedback = false,
  } = config;

  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const touchMoveRef = useRef<{
    x: number;
    y: number;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef(handlers);

  // 更新处理函数引用
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // 振动反馈（如果支持）
  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!enableHapticFeedback) return;

    if ('vibrate' in navigator) {
      const patterns: Record<string, number | number[]> = {
        light: 10,
        medium: 20,
        heavy: 30,
      };
      navigator.vibrate(patterns[type]);
    }
  }, [enableHapticFeedback]);

  // 触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return;

    const touch = e.touches[0];
    if (!touch) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    touchStartRef.current = { x, y, time: Date.now() };
    touchMoveRef.current = { x, y, deltaX: 0, deltaY: 0 };

    // 启动长按检测
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartRef.current && handlersRef.current.onToggleMenu) {
        hapticFeedback('medium');
        handlersRef.current.onToggleMenu();
      }
    }, longPressThreshold);
  }, [enabled, longPressThreshold, hapticFeedback]);

  // 触摸移动
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || !touchStartRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (touchMoveRef.current) {
      touchMoveRef.current.x = x;
      touchMoveRef.current.y = y;
      touchMoveRef.current.deltaX = x - touchStartRef.current.x;
      touchMoveRef.current.deltaY = y - touchStartRef.current.y;
    }

    // 如果移动距离超过阈值，取消长按
    if (touchMoveRef.current && Math.abs(touchMoveRef.current.deltaX) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, [enabled]);

  // 触摸结束
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!enabled || !touchStartRef.current) return;

    // ✅ 修复：检查触摸目标是否在播放列表区域内，如果是则不处理手势
    const target = e.target as HTMLElement;
    const playlistContainer = target.closest('[data-playlist-container="true"]');
    const playButton = target.closest('[data-play-button="true"]');
    const isInPlaylist = playlistContainer !== null || playButton !== null;
    
    // 如果触摸在播放列表区域内，不处理垂直滑动手势（避免滚动列表时切换歌曲）
    if (isInPlaylist) {
      // 清除长按定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartRef.current = null;
      return;
    }

    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const touch = e.changedTouches[0];
    if (!touch) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const deltaX = x - touchStartRef.current.x;
    const deltaY = y - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 检测双击
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    if (timeSinceLastTap < doubleTapThreshold && distance < 30) {
      // 双击：播放/暂停
      e.preventDefault();
      hapticFeedback('light');
      handlersRef.current.onTogglePlay();
      lastTapRef.current = 0; // 重置，避免三击
      touchStartRef.current = null;
      return;
    }

    // 检测滑动
    if (Math.abs(deltaX) > swipeThreshold || Math.abs(deltaY) > swipeThreshold) {
      e.preventDefault();

      // ✅ 修复：只处理水平滑动，取消垂直滑动切换歌曲功能
      // 水平滑动：调节进度
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (handlersRef.current.onSeek) {
          // 计算进度增量（每100像素 = 10秒）
          const seekDelta = (deltaX / 100) * 10;
          hapticFeedback('light');
          handlersRef.current.onSeek(seekDelta);
        } else if (deltaX > 0 && handlersRef.current.onSeekBackward) {
          // 向右滑动：快退
          hapticFeedback('light');
          handlersRef.current.onSeekBackward();
        } else if (deltaX < 0 && handlersRef.current.onSeekForward) {
          // 向左滑动：快进
          hapticFeedback('light');
          handlersRef.current.onSeekForward();
        }
      }
      // ✅ 已移除：垂直滑动切换上一首/下一首功能

      touchStartRef.current = null;
      return;
    }

    // 单击：记录时间，用于双击检测
    if (distance < 30 && deltaTime < 300) {
      lastTapRef.current = now;
    }

    touchStartRef.current = null;
  }, [enabled, doubleTapThreshold, swipeThreshold, hapticFeedback]);

  // 清理
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return {
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
