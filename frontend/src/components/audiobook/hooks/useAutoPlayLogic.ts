/**
 * @file useAutoPlayLogic.ts
 * @description 自动播放逻辑 Hook - 处理自动播放、断点续播等逻辑
 */

import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { isPWAMode, isIOSDevice } from '../types/pwa';

/**
 * 自动播放配置
 */
export interface AutoPlayLogicConfig {
  /** 音频元素引用 */
  audioRef: React.RefObject<HTMLAudioElement>;
  /** 当前文件ID */
  currentFileId: string;
  /** 开始时间 */
  startTime: number;
  /** 是否应该自动播放（用户主动点击） */
  shouldAutoPlayOnLoadRef: React.MutableRefObject<boolean>;
  /** 自动播放下一首标志ref */
  autoPlayNextRef: React.MutableRefObject<boolean>;
  /** 设置自动播放下一首 */
  setAutoPlayNext: (value: boolean) => void;
  /** 设置播放状态 */
  setPlaying: (playing: boolean) => void;
  /** 设置暂停状态 */
  setPaused: () => void;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

/**
 * 自动播放逻辑 Hook
 */
export function useAutoPlayLogic(config: AutoPlayLogicConfig) {
  const {
    audioRef,
    currentFileId,
    startTime,
    shouldAutoPlayOnLoadRef,
    autoPlayNextRef,
    setAutoPlayNext,
    setPlaying,
    setPaused,
    maxRetries = 5,
    retryDelay = 1000,
  } = config;

  const { t } = useTranslation();

  /**
   * 尝试自动播放
   */
  const attemptAutoPlay = useCallback(
    (audio: HTMLAudioElement, retryCount: number = 0) => {
      const isPWAModeLocal = isPWAMode();
      const isIOSPWA = isIOSDevice() && isPWAModeLocal;
      const isAndroidWebView =
        /Android/.test(navigator.userAgent) &&
        (document.referrer.includes('android-app://') ||
          (window as any).Capacitor?.getPlatform() === 'android' ||
          (window as any).Android !== undefined);

      // 检查音频是否准备好
      if (audio.readyState >= 3) {
        // 音频已准备好，尝试播放
        audio
          .play()
          .then(() => {
            if (audio.paused) {
              console.warn('[useAutoPlayLogic] 播放失败：音频仍然暂停');
              setPaused();
            } else {
              setPlaying(true);
              setAutoPlayNext(false);
              autoPlayNextRef.current = false;
            }
          })
          .catch((e: any) => {
            console.error('[useAutoPlayLogic] 自动播放失败', {
              error: e.name,
              message: e.message,
              retryCount,
              isIOSPWA,
              isAndroidWebView,
            });

            // 确保状态正确
            setPaused();

            // iOS PWA模式下，NotAllowedError是正常的（需要用户交互）
            if (isIOSPWA && e.name === 'NotAllowedError') {
              console.log(
                '[useAutoPlayLogic] iOS PWA模式：自动播放被阻止（需要用户交互），等待用户通过锁屏控制播放'
              );
              // 保持autoPlayNextRef，等待用户通过Media Session播放
              return;
            }

            // Android WebView 中，大多数错误都应该重试
            const shouldRetryPWA = [
              'NotAllowedError',
              'NotSupportedError',
              'AbortError',
              'NotReadableError',
              'NetworkError',
              'TypeError',
              'InvalidStateError',
              'SecurityError',
            ].includes(e.name);

            const shouldRetry = isAndroidWebView
              ? !['MediaError'].includes(e.name)
              : (isPWAModeLocal && shouldRetryPWA) ||
                (!isPWAModeLocal &&
                  ['NotAllowedError', 'NotSupportedError', 'AbortError'].includes(e.name));

            if (shouldRetry) {
              if (retryCount < maxRetries) {
                console.log(`[useAutoPlayLogic] ${retryDelay}ms后重试 (${retryCount + 1}/${maxRetries})`, {
                  isAndroidWebView,
                });
                setTimeout(() => attemptAutoPlay(audio, retryCount + 1), retryDelay);
              } else {
                if (!isIOSPWA) {
                  if (isAndroidWebView) {
                    console.warn(
                      '[useAutoPlayLogic] Android WebView模式：达到最大重试次数，但保持自动播放标志以便后续重试'
                    );
                  } else {
                    setAutoPlayNext(false);
                    autoPlayNextRef.current = false;
                  }
                }
              }
            } else {
              if (!isIOSPWA && !isAndroidWebView) {
                setAutoPlayNext(false);
                autoPlayNextRef.current = false;
              } else if (isAndroidWebView) {
                console.warn('[useAutoPlayLogic] Android WebView模式：遇到致命错误，但保持自动播放标志');
              }
            }
          });
      } else {
        // 音频未准备好，等待后重试
        if (retryCount < maxRetries) {
          setTimeout(() => attemptAutoPlay(audio, retryCount + 1), retryDelay);
        } else {
          console.error('[useAutoPlayLogic] 音频未准备好，取消自动播放');
          setPaused();
          setAutoPlayNext(false);
          autoPlayNextRef.current = false;
        }
      }
    },
    [
      setPlaying,
      setPaused,
      setAutoPlayNext,
      autoPlayNextRef,
      maxRetries,
      retryDelay,
    ]
  );

  /**
   * 处理自动播放逻辑
   */
  const handleAutoPlay = useCallback(
    (audio: HTMLAudioElement) => {
      // 自动播放逻辑：
      // 1. 如果是自动续播（autoPlayNextRef.current = true），在 loadedmetadata 中处理
      // 2. 如果有进度且不是自动续播，自动播放（断点续播）
      // 3. 如果用户主动点击播放（shouldAutoPlayOnLoadRef.current = true），自动播放
      // 4. 如果既没有进度也不是自动续播且用户未主动点击，不自动播放

      if (startTime > 0 && !autoPlayNextRef.current) {
        // 断点续播：有进度且不是自动续播
        audio
          .play()
          .then(() => {
            if (audio.paused) {
              console.warn('[useAutoPlayLogic] 断点续播失败：音频仍然暂停');
              setPaused();
            } else {
              setPlaying(true);
            }
          })
          .catch((e) => {
            console.error('播放失败:', e);
            setPaused();
            toast.error(t('audiobook.player.playFailed'));
          });
      } else if (shouldAutoPlayOnLoadRef.current && !autoPlayNextRef.current) {
        // 用户主动点击播放：即使没有进度也自动播放
        audio
          .play()
          .then(() => {
            if (audio.paused) {
              console.warn('[useAutoPlayLogic] 用户播放请求失败：音频仍然暂停');
              setPaused();
            } else {
              setPlaying(true);
            }
          })
          .catch((e) => {
            console.error('播放失败:', e);
            setPaused();
            toast.error(t('audiobook.player.playFailed'));
          });
      } else if (!autoPlayNextRef.current) {
        // 既没有进度也不是自动续播且用户未主动点击，确保播放状态为 false
        setPaused();
      }
      // 如果是自动续播（autoPlayNextRef.current = true），在 loadedmetadata 事件中处理
    },
    [
      startTime,
      autoPlayNextRef,
      shouldAutoPlayOnLoadRef,
      setPlaying,
      setPaused,
      t,
    ]
  );

  /**
   * 设置 canplaythrough 事件处理器（用于自动续播）
   */
  const setupCanPlayThroughHandler = useCallback(
    (audio: HTMLAudioElement) => {
      const isPWAModeLocal = isPWAMode();
      const isAndroidWebView =
        /Android/.test(navigator.userAgent) &&
        (document.referrer.includes('android-app://') ||
          (window as any).Capacitor?.getPlatform() === 'android' ||
          (window as any).Android !== undefined);

      const canplaythroughHandler = () => {
        if (audioRef.current === audio && autoPlayNextRef.current) {
          // 自动续播：延迟后尝试播放
          const startDelay = isAndroidWebView ? 50 : isPWAModeLocal ? 100 : 50;
          setTimeout(() => attemptAutoPlay(audio, 0), startDelay);
        }
      };

      audio.addEventListener('canplaythrough', canplaythroughHandler);
      return () => {
        audio.removeEventListener('canplaythrough', canplaythroughHandler);
      };
    },
    [audioRef, autoPlayNextRef, attemptAutoPlay]
  );

  return {
    handleAutoPlay,
    attemptAutoPlay,
    setupCanPlayThroughHandler,
  };
}
