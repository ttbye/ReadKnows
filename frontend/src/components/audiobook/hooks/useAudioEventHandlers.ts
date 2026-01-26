/**
 * @file useAudioEventHandlers.ts
 * @description 音频事件处理 Hook - 统一管理所有音频事件监听器
 */

import { useCallback, useRef, useEffect } from 'react';
import { AudioElementWithHandlers } from '../types/audio';

/**
 * 事件处理配置
 */
export interface AudioEventHandlersConfig {
  /** 音频元素引用 */
  audioRef: React.RefObject<HTMLAudioElement>;
  /** 当前文件ID */
  currentFileId: string;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 设置当前时间 */
  setCurrentTime: (time: number) => void;
  /** 设置时长 */
  setDuration: (duration: number) => void;
  /** 设置播放状态 */
  setPlaying: (playing: boolean) => void;
  /** 设置暂停状态 */
  setPaused: () => void;
  /** 保存进度函数 */
  saveProgress: (time: number, duration: number, fileId: string) => void;
  /** 播放完成回调 */
  onPlaybackEnded?: () => void;
  /** 最后保存时间ref */
  lastSaveTimeRef: React.MutableRefObject<number>;
  /** 保存进度定时器ref */
  saveProgressTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  /** 后台检测定时器ref */
  backgroundCheckIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

/**
 * 音频事件处理 Hook
 */
export function useAudioEventHandlers(config: AudioEventHandlersConfig) {
  const {
    audioRef,
    currentFileId,
    isPlaying,
    setCurrentTime,
    setDuration,
    setPlaying,
    setPaused,
    saveProgress,
    onPlaybackEnded,
    lastSaveTimeRef,
    saveProgressTimeoutRef,
    backgroundCheckIntervalRef,
  } = config;

  /**
   * 设置 timeupdate 事件监听器
   */
  const setupTimeUpdateHandler = useCallback(
    (audio: HTMLAudioElement, fileId: string) => {
      // 移除旧的监听器
      const audioWithHandlers = audio as AudioElementWithHandlers;
      const existingHandler = audioWithHandlers.__timeupdateHandler;
      if (existingHandler) {
        audio.removeEventListener('timeupdate', existingHandler);
      }

      // 创建新的处理函数
      const timeupdateHandler = () => {
        if (audioRef.current === audio) {
          const currentTime = audio.currentTime;
          setCurrentTime(currentTime);

          // 同步播放状态
          if (audio.paused && isPlaying) {
            setPaused();
          } else if (!audio.paused && !isPlaying && audio.currentTime > 0) {
            setPlaying(true);
          }

          // 防抖保存进度（每30秒至少保存一次）
          const now = Date.now();
          if (now - lastSaveTimeRef.current >= 30000) {
            if (saveProgressTimeoutRef.current) {
              clearTimeout(saveProgressTimeoutRef.current);
            }
            saveProgressTimeoutRef.current = setTimeout(() => {
              saveProgress(audio.currentTime, audio.duration, fileId);
              lastSaveTimeRef.current = Date.now();
            }, 500);
          }
        }
      };

      audio.addEventListener('timeupdate', timeupdateHandler);
      audioWithHandlers.__timeupdateHandler = timeupdateHandler;
    },
    [
      audioRef,
      isPlaying,
      setCurrentTime,
      setPlaying,
      setPaused,
      saveProgress,
      lastSaveTimeRef,
      saveProgressTimeoutRef,
    ]
  );

  /**
   * 设置 play/pause/playing 事件监听器
   */
  const setupPlayPauseHandlers = useCallback(
    (audio: HTMLAudioElement) => {
      const audioWithHandlers = audio as AudioElementWithHandlers;

      // 清理旧的事件监听器
      if (audioWithHandlers.__playHandler) {
        audio.removeEventListener('play', audioWithHandlers.__playHandler);
      }
      if (audioWithHandlers.__pauseHandler) {
        audio.removeEventListener('pause', audioWithHandlers.__pauseHandler);
      }
      if (audioWithHandlers.__playingHandler) {
        audio.removeEventListener('playing', audioWithHandlers.__playingHandler);
      }

      // 创建新的处理函数
      const playHandler = () => {
        if (audioRef.current === audio) {
          setPlaying(true);
        }
      };

      const pauseHandler = () => {
        if (audioRef.current === audio) {
          setPaused();
        }
      };

      const playingHandler = () => {
        if (audioRef.current === audio) {
          setPlaying(true);
        }
      };

      audio.addEventListener('play', playHandler);
      audio.addEventListener('pause', pauseHandler);
      audio.addEventListener('playing', playingHandler);

      audioWithHandlers.__playHandler = playHandler;
      audioWithHandlers.__pauseHandler = pauseHandler;
      audioWithHandlers.__playingHandler = playingHandler;
    },
    [audioRef, setPlaying, setPaused]
  );

  /**
   * 设置 loadedmetadata 事件监听器
   */
  const setupLoadedMetadataHandler = useCallback(
    (audio: HTMLAudioElement, startTime: number) => {
      const audioWithHandlers = audio as AudioElementWithHandlers;
      const existingHandler = audioWithHandlers.__loadedmetadataHandler;
      if (existingHandler) {
        audio.removeEventListener('loadedmetadata', existingHandler);
      }

      const loadedmetadataHandler = () => {
        if (audioRef.current === audio) {
          const duration = audio.duration || 0;
          setDuration(duration);

          // 如果有开始时间，设置到指定位置
          if (startTime > 0 && duration > 0) {
            const safeStartTime = Math.min(startTime, duration - 0.1);
            if (safeStartTime > 0) {
              audio.currentTime = safeStartTime;
            }
          }
        }
      };

      audio.addEventListener('loadedmetadata', loadedmetadataHandler);
      audioWithHandlers.__loadedmetadataHandler = loadedmetadataHandler;
    },
    [audioRef, setDuration]
  );

  /**
   * 设置 ended 事件监听器
   */
  const setupEndedHandler = useCallback(
    (audio: HTMLAudioElement) => {
      const audioWithHandlers = audio as AudioElementWithHandlers;
      const existingHandler = audioWithHandlers.__endedHandler;
      if (existingHandler) {
        audio.removeEventListener('ended', existingHandler);
      }

      const endedHandler = () => {
        if (audioRef.current === audio && onPlaybackEnded) {
          onPlaybackEnded();
        }
      };

      audio.addEventListener('ended', endedHandler);
      audioWithHandlers.__endedHandler = endedHandler;
    },
    [audioRef, onPlaybackEnded]
  );

  /**
   * 设置后台播放完成检测定时器
   */
  const setupBackgroundCheck = useCallback(
    (audio: HTMLAudioElement) => {
      const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
      const isAndroidWebView =
        /Android/.test(navigator.userAgent) &&
        (document.referrer.includes('android-app://') ||
          (window as any).Capacitor?.getPlatform() === 'android' ||
          (window as any).Android !== undefined);

      if (isPWAMode || document.hidden || isAndroidWebView) {
        // 清除旧的定时器
        if (backgroundCheckIntervalRef.current) {
          clearInterval(backgroundCheckIntervalRef.current);
        }

        // 每500ms检查一次播放进度（后台时timeupdate可能不触发）
        backgroundCheckIntervalRef.current = setInterval(() => {
          if (audioRef.current === audio && audio.duration > 0) {
            const currentTime = audio.currentTime;
            const duration = audio.duration;
            const timeRemaining = duration - currentTime;
            const threshold = isAndroidWebView ? 2.0 : 1.0;

            // 如果接近播放完成或已经结束
            if ((timeRemaining <= threshold && timeRemaining >= 0) || audio.ended) {
              setTimeout(() => {
                if (audioRef.current === audio && audio.duration > 0) {
                  const finalTimeRemaining = audio.duration - audio.currentTime;
                  const isCompleted =
                    finalTimeRemaining <= (isAndroidWebView ? 1.0 : 0.5) ||
                    audio.ended ||
                    (audio.paused && finalTimeRemaining <= threshold);

                  if (isCompleted && onPlaybackEnded) {
                    onPlaybackEnded();
                  }
                }
              }, isAndroidWebView ? 800 : 600);
            }
          } else if (
            audioRef.current !== audio ||
            audio.ended ||
            (audio.paused && audio.currentTime === 0)
          ) {
            // 如果音频已切换、已结束或已重置，清除定时器
            if (backgroundCheckIntervalRef.current) {
              clearInterval(backgroundCheckIntervalRef.current);
              backgroundCheckIntervalRef.current = null;
            }
          }
        }, isAndroidWebView ? 300 : 500);
      }
    },
    [audioRef, backgroundCheckIntervalRef, onPlaybackEnded]
  );

  /**
   * 设置所有事件监听器
   */
  const setupAllHandlers = useCallback(
    (audio: HTMLAudioElement, fileId: string, startTime: number = 0) => {
      setupTimeUpdateHandler(audio, fileId);
      setupPlayPauseHandlers(audio);
      setupLoadedMetadataHandler(audio, startTime);
      setupEndedHandler(audio);
      setupBackgroundCheck(audio);
    },
    [
      setupTimeUpdateHandler,
      setupPlayPauseHandlers,
      setupLoadedMetadataHandler,
      setupEndedHandler,
      setupBackgroundCheck,
    ]
  );

  /**
   * 清理所有事件监听器
   */
  const cleanupHandlers = useCallback(
    (audio: HTMLAudioElement) => {
      const audioWithHandlers = audio as AudioElementWithHandlers;

      // 移除所有事件监听器
      const handlers = [
        '__timeupdateHandler',
        '__playHandler',
        '__pauseHandler',
        '__playingHandler',
        '__loadedmetadataHandler',
        '__endedHandler',
        '__canplaythroughHandler',
      ];

      handlers.forEach((handlerName) => {
        const handler = audioWithHandlers[handlerName as keyof AudioElementWithHandlers];
        if (handler && typeof handler === 'function') {
          const eventName = handlerName.replace('__', '').replace('Handler', '');
          audio.removeEventListener(eventName, handler as EventListener);
          delete audioWithHandlers[handlerName as keyof AudioElementWithHandlers];
        }
      });

      // 清除后台检测定时器
      if (backgroundCheckIntervalRef.current) {
        clearInterval(backgroundCheckIntervalRef.current);
        backgroundCheckIntervalRef.current = null;
      }
    },
    [backgroundCheckIntervalRef]
  );

  return {
    setupAllHandlers,
    setupTimeUpdateHandler,
    setupPlayPauseHandlers,
    setupLoadedMetadataHandler,
    setupEndedHandler,
    setupBackgroundCheck,
    cleanupHandlers,
  };
}
