/**
 * @file useAudioManager.ts
 * @description 音频管理 Hook - 管理音频元素的创建、加载、播放、暂停
 */

import { useRef, useCallback, useEffect } from 'react';
import { getFullApiUrl, getAuthHeaders } from '../../../utils/api';
import { AudioFile } from '../types';

// 全局音频实例管理器（单例模式）
const globalAudioManager = {
  instance: null as {
    audiobookId: string;
    fileId: string;
    audio: HTMLAudioElement;
  } | null,

  getInstance() {
    return this.instance;
  },

  setInstance(audiobookId: string, fileId: string, audio: HTMLAudioElement) {
    const oldInstance = this.instance;
    const isPWAMode =
      typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches;
    const isSameAudiobook = oldInstance && oldInstance.audiobookId === audiobookId;

    if (oldInstance && oldInstance.audio) {
      if (!isPWAMode || !isSameAudiobook) {
        oldInstance.audio.pause();
        if (oldInstance.audio.src && oldInstance.audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(oldInstance.audio.src);
        }
      }
    }

    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach(audioEl => {
        if (audioEl !== audio && !audioEl.paused) {
          if (!isPWAMode || !isSameAudiobook) {
            audioEl.pause();
          }
        }
      });
    }

    this.instance = { audiobookId, fileId, audio };
  },

  clearInstance() {
    if (this.instance && this.instance.audio) {
      try {
        this.instance.audio.pause();
        this.instance.audio.currentTime = 0;
        if (
          this.instance.audio.src &&
          this.instance.audio.src.startsWith('blob:')
        ) {
          URL.revokeObjectURL(this.instance.audio.src);
        }
      } catch (e) {
        console.warn('[globalAudioManager] 清理音频失败:', e);
      }
    }
    this.instance = null;
  },

  canReuse(audiobookId: string, fileId: string): boolean {
    return (
      this.instance !== null &&
      this.instance.audiobookId === audiobookId &&
      this.instance.fileId === fileId &&
      this.instance.audio !== null
    );
  },
};

// 暴露到window对象
if (typeof window !== 'undefined') {
  (window as any).globalAudioManager = globalAudioManager;
}

interface UseAudioManagerProps {
  audiobookId: string;
  currentFileId: string;
  files: AudioFile[];
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
  getPreloadedUrl?: (fileId: string) => string | null;
}

/**
 * 音频管理 Hook
 * 管理音频元素的创建、加载、播放、暂停和事件监听
 */
export function useAudioManager({
  audiobookId,
  currentFileId,
  files,
  volume,
  isMuted,
  playbackRate,
  onTimeUpdate,
  onDurationChange,
  onPlay,
  onPause,
  onEnded,
  onError,
  getPreloadedUrl,
}: UseAudioManagerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const eventHandlersRef = useRef<Map<string, (() => void)[]>>(new Map());

  /**
   * 清理音频事件监听器
   */
  const cleanupAudioEventListeners = useCallback((audio: HTMLAudioElement) => {
    if (!audio) return;

    const handlers = [
      '__timeupdateHandler',
      '__playHandler',
      '__pauseHandler',
      '__playingHandler',
      '__loadstartHandler',
      '__loadedmetadataHandler',
      '__canplaythroughHandler',
      '__endedHandler',
    ];

    handlers.forEach(handlerName => {
      const handler = (audio as any)[handlerName];
      if (handler && typeof handler === 'function') {
        const eventName = handlerName.replace('__', '').replace('Handler', '');
        audio.removeEventListener(eventName, handler);
        delete (audio as any)[handlerName];
      }
    });

    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.oncanplay = null;
    audio.oncanplaythrough = null;
    audio.onloadeddata = null;
    audio.onloadstart = null;
    audio.onloadedmetadata = null;
    audio.onerror = null;
  }, []);

  /**
   * 加载音频文件
   */
  const loadAudio = useCallback(
    async (
      fileId: string,
      startTime: number = 0,
      usePreload: boolean = true
    ): Promise<HTMLAudioElement> => {
      // 检查是否可以复用现有实例
      if (globalAudioManager.canReuse(audiobookId, fileId)) {
        const instance = globalAudioManager.getInstance();
        if (instance && instance.audio) {
          audioRef.current = instance.audio;
          return instance.audio;
        }
      }

      // 停止当前播放并清理
      if (audioRef.current) {
        const oldAudio = audioRef.current;
        cleanupAudioEventListeners(oldAudio);
        oldAudio.pause();
        oldAudio.src = '';
        oldAudio.load();
        audioRef.current = null;
      }

      // 创建新的音频元素
      const audio = new Audio();
      audioRef.current = audio;

      // 设置音频属性
      audio.preload = 'auto';
      audio.volume = isMuted ? 0 : volume;
      audio.playbackRate = playbackRate;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');

      // 设置音频源
      let blobUrl: string | null = null;

      if (usePreload && getPreloadedUrl) {
        blobUrl = getPreloadedUrl(fileId);
      }

      if (blobUrl) {
        audio.src = blobUrl;
      } else {
        // 从服务器获取音频
        const audioUrl = getFullApiUrl(`/audiobooks/${audiobookId}/files/${fileId}`);
        const authHeaders = getAuthHeaders();

        try {
          const response = await fetch(audioUrl, { headers: authHeaders });
          if (response.ok) {
            const blob = await response.blob();
            const currentFile = files.find(f => f.id === fileId);

            // 推断MIME类型
            let blobType = blob.type;
            if (!blobType || blobType === 'application/octet-stream') {
              const fileExt = currentFile?.file_type?.toLowerCase() || '';
              const mimeTypeMap: { [key: string]: string } = {
                mp3: 'audio/mpeg',
                m4a: 'audio/mp4',
                aac: 'audio/aac',
                flac: 'audio/flac',
                wav: 'audio/wav',
                ogg: 'audio/ogg',
                opus: 'audio/opus',
                wma: 'audio/x-ms-wma',
              };
              blobType = mimeTypeMap[fileExt] || 'audio/mpeg';
            }

            const typedBlob = new Blob([blob], { type: blobType });
            blobUrl = URL.createObjectURL(typedBlob);
            audio.src = blobUrl;
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error: any) {
          console.error('[useAudioManager] 加载音频失败:', error);
          if (onError) {
            onError(error);
          }
          throw error;
        }
      }

      // 保存到全局音频管理器
      globalAudioManager.setInstance(audiobookId, fileId, audio);

      // 设置事件监听器
      const timeupdateHandler = () => {
        if (audioRef.current === audio && onTimeUpdate) {
          onTimeUpdate(audio.currentTime);
        }
      };

      const loadedmetadataHandler = () => {
        if (audioRef.current === audio) {
          if (onDurationChange) {
            onDurationChange(audio.duration || 0);
          }
          if (startTime > 0 && audio.duration > 0) {
            const safeStartTime = Math.min(startTime, audio.duration - 0.1);
            if (safeStartTime > 0) {
              audio.currentTime = safeStartTime;
            }
          }
        }
      };

      const playHandler = () => {
        if (audioRef.current === audio && onPlay) {
          onPlay();
        }
      };

      const pauseHandler = () => {
        if (audioRef.current === audio && onPause) {
          onPause();
        }
      };

      const endedHandler = () => {
        if (audioRef.current === audio && onEnded) {
          onEnded();
        }
      };

      audio.addEventListener('timeupdate', timeupdateHandler);
      audio.addEventListener('loadedmetadata', loadedmetadataHandler);
      audio.addEventListener('play', playHandler);
      audio.addEventListener('pause', pauseHandler);
      audio.addEventListener('ended', endedHandler);

      // 保存处理函数引用
      (audio as any).__timeupdateHandler = timeupdateHandler;
      (audio as any).__loadedmetadataHandler = loadedmetadataHandler;
      (audio as any).__playHandler = playHandler;
      (audio as any).__pauseHandler = pauseHandler;
      (audio as any).__endedHandler = endedHandler;

      return audio;
    },
    [
      audiobookId,
      files,
      volume,
      isMuted,
      playbackRate,
      onTimeUpdate,
      onDurationChange,
      onPlay,
      onPause,
      onEnded,
      onError,
      getPreloadedUrl,
      cleanupAudioEventListeners,
    ]
  );

  /**
   * 播放音频
   */
  const play = useCallback(async (): Promise<void> => {
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch (error) {
        console.error('[useAudioManager] 播放失败:', error);
        throw error;
      }
    }
  }, []);

  /**
   * 暂停音频
   */
  const pause = useCallback((): void => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  /**
   * 跳转到指定时间
   */
  const seek = useCallback((time: number): void => {
    if (audioRef.current && audioRef.current.duration > 0) {
      audioRef.current.currentTime = Math.max(
        0,
        Math.min(time, audioRef.current.duration)
      );
    }
  }, []);

  /**
   * 设置音量
   */
  const setVolume = useCallback(
    (newVolume: number): void => {
      if (audioRef.current) {
        audioRef.current.volume = newVolume;
      }
    },
    []
  );

  /**
   * 设置播放速度
   */
  const setPlaybackRate = useCallback(
    (rate: number): void => {
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
      }
    },
    []
  );

  /**
   * 清理资源
   */
  const cleanup = useCallback(() => {
    if (audioRef.current) {
      cleanupAudioEventListeners(audioRef.current);
      if (
        audioRef.current.src &&
        audioRef.current.src.startsWith('blob:')
      ) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
      audioRef.current = null;
    }
  }, [cleanupAudioEventListeners]);

  // 同步音量变化
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // 同步播放速度变化
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    audioRef,
    loadAudio,
    play,
    pause,
    seek,
    setVolume,
    setPlaybackRate,
    cleanup,
  };
}
