/**
 * @file usePlaybackEndedHandler.ts
 * @description 播放完成处理 Hook - 处理播放结束后的逻辑（循环播放、自动播放下一集等）
 */

import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AudioFile } from '../types';
import { isPWAMode, isIOSDevice } from '../types/pwa';

/**
 * 播放完成处理配置
 */
export interface PlaybackEndedHandlerConfig {
  /** 文件列表 */
  files: AudioFile[];
  /** 当前文件ID */
  currentFileId: string;
  /** 有声小说ID */
  audiobookId: string;
  /** 有声小说标题 */
  audiobookTitle: string;
  /** 有声小说作者 */
  audiobookAuthor: string;
  /** 有声小说封面 */
  audiobookCover: string;
  /** 音频元素引用 */
  audioRef: React.RefObject<HTMLAudioElement>;
  /** 是否循环播放ref */
  isLoopingRef: React.MutableRefObject<boolean>;
  /** 自动播放下一首标志ref */
  autoPlayNextRef: React.MutableRefObject<boolean>;
  /** 设置自动播放下一首 */
  setAutoPlayNext: (value: boolean) => void;
  /** 设置暂停状态 */
  setPaused: () => void;
  /** 设置播放状态 */
  setPlaying: (playing: boolean) => void;
  /** 设置当前文件ID */
  setCurrentFileId: (fileId: string) => void;
  /** 文件变化回调 */
  onFileChange: (fileId: string) => void;
  /** 保存进度函数 */
  saveProgress: (
    time: number,
    duration: number,
    fileId: string,
    forceSave?: boolean,
    isSwitchingFile?: boolean
  ) => Promise<void>;
  /** 记录日志函数 */
  logAudiobookAction?: (
    actionType: 'audiobook_play' | 'audiobook_progress' | 'audiobook_complete',
    fileId: string,
    metadata?: any
  ) => Promise<void>;
}

/**
 * 播放完成处理 Hook
 */
export function usePlaybackEndedHandler(config: PlaybackEndedHandlerConfig) {
  const {
    files,
    currentFileId,
    audiobookId,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
    audioRef,
    isLoopingRef,
    autoPlayNextRef,
    setAutoPlayNext,
    setPaused,
    setPlaying,
    setCurrentFileId,
    onFileChange,
    saveProgress,
    logAudiobookAction,
  } = config;

  const { t } = useTranslation();

  /**
   * 处理播放完成
   */
  const handlePlaybackEnded = useCallback(
    async (fileId: string) => {
      const handlingKey = `handling_${fileId}`;
      if ((window as any)[handlingKey]) {
        return;
      }
      (window as any)[handlingKey] = true;

      const audio = audioRef.current;
      if (!audio) {
        (window as any)[handlingKey] = false;
        return;
      }

      const isPWAModeLocal = isPWAMode();
      const isBackground = document.hidden;
      const isAndroidWebView =
        /Android/.test(navigator.userAgent) &&
        (document.referrer.includes('android-app://') ||
          (window as any).Capacitor?.getPlatform() === 'android' ||
          (window as any).Android !== undefined);

      console.log('[usePlaybackEndedHandler] 当前音频播放完成', {
        fileId,
        isPWA: isPWAModeLocal,
        isBackground,
        isAndroidWebView,
        isPlaying: !audio.paused,
        isLooping: isLoopingRef.current,
        currentTime: audio.currentTime,
        duration: audio.duration,
        ended: audio.ended,
      });

      // 暂停音频
      if (!isPWAModeLocal) {
        audio.pause();
        setPaused();
      } else {
        if (!audio.paused) {
          audio.pause();
        }
        setPaused();
      }

      // 保存当前播放进度（播放完成时）
      if (audio.duration > 0) {
        try {
          await saveProgress(audio.duration, audio.duration, fileId);
          console.log('[usePlaybackEndedHandler] 播放完成，进度已保存', { fileId });

          // 记录播放完成日志
          if (logAudiobookAction) {
            await logAudiobookAction('audiobook_complete', fileId, {
              duration: audio.duration,
              completed_at: new Date().toISOString()
            });
          }
        } catch (e) {
          console.error('[usePlaybackEndedHandler] 播放完成时保存进度失败', e);
        }
      }

      // 循环播放处理
      if (isLoopingRef.current) {
        console.log('[usePlaybackEndedHandler] 循环播放：重新播放当前音频', {
          fileId,
          isPWA: isPWAModeLocal,
        });

        const attemptPlayLoop = (retryCount = 0) => {
          audio.currentTime = 0;
          const maxRetries = isPWAModeLocal || document.hidden ? 8 : 5;

          setTimeout(() => {
            if (isLoopingRef.current && audioRef.current === audio) {
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log('[usePlaybackEndedHandler] 循环播放成功', {
                      isPWA: isPWAModeLocal,
                    });
                    setPlaying(true);
                    (window as any)[handlingKey] = false;
                  })
                  .catch((e) => {
                    console.warn(
                      '[usePlaybackEndedHandler] 循环播放失败，重试:',
                      retryCount + 1,
                      { isPWA: isPWAModeLocal }
                    );
                    if (retryCount < maxRetries) {
                      attemptPlayLoop(retryCount + 1);
                    } else {
                      setPaused();
                      (window as any)[handlingKey] = false;
                    }
                  });
              }
            }
          }, isPWAModeLocal ? 200 : 100);
        };

        attemptPlayLoop();
        return;
      }

      // 自动播放下一集
      const currentIndex = files.findIndex((f) => f.id === fileId);
      if (currentIndex >= 0 && currentIndex < files.length - 1) {
        const nextFile = files[currentIndex + 1];
        const isIOS = isIOSDevice();
        const isIOSPWA = isPWAModeLocal && isIOS;

        console.log('[usePlaybackEndedHandler] 准备自动播放下一集', {
          nextFileId: nextFile.id,
          nextFileName: nextFile.file_name,
          isPWA: isPWAModeLocal,
          isIOS,
          isIOSPWA,
          isBackground,
        });

        // iOS PWA模式特殊处理
        if (isIOSPWA) {
          console.log('[usePlaybackEndedHandler] iOS PWA模式：使用Media Session API触发下一首');

          try {
            const mediaSession = (navigator as any).mediaSession;
            if (mediaSession) {
              const MediaMetadataCtor = (window as any).MediaMetadata;
              if (MediaMetadataCtor) {
                mediaSession.metadata = new MediaMetadataCtor({
                  title: nextFile.file_name || audiobookTitle || '未知',
                  artist: audiobookAuthor || '未知作者',
                  album: audiobookTitle || '有声小说',
                  artwork: audiobookCover
                    ? [{ src: audiobookCover, sizes: '512x512', type: 'image/png' }]
                    : [],
                });
                mediaSession.playbackState = 'paused';
                console.log('[usePlaybackEndedHandler] iOS PWA模式：已更新Media Session元数据为下一首');
              }
            }
          } catch (e) {
            console.warn('[usePlaybackEndedHandler] iOS PWA模式：更新Media Session失败', e);
          }

          setTimeout(async () => {
            try {
              await saveProgress(0, 0, nextFile.id, true);
              console.log('[usePlaybackEndedHandler] iOS PWA模式：新文件进度已保存', {
                nextFileId: nextFile.id,
              });
            } catch (e) {
              console.error('[usePlaybackEndedHandler] iOS PWA模式：保存新文件进度失败', e);
            }

            autoPlayNextRef.current = true;
            setAutoPlayNext(true);
            setPaused();
            setCurrentFileId(nextFile.id);
            onFileChange(nextFile.id);

            setTimeout(() => {
              (window as any)[handlingKey] = false;
            }, 10000);
          }, 300);
        } else if (isAndroidWebView) {
          // Android WebView 模式
          setTimeout(async () => {
            try {
              await saveProgress(0, 0, nextFile.id, true);
            } catch (e) {
              console.error('[usePlaybackEndedHandler] Android WebView模式：保存新文件进度失败', e);
            }

            autoPlayNextRef.current = true;
            setAutoPlayNext(true);
            setPaused();
            setCurrentFileId(nextFile.id);
            onFileChange(nextFile.id);

            setTimeout(() => {
              (window as any)[handlingKey] = false;
            }, 10000);
          }, 300);
        } else if (isPWAModeLocal) {
          // 非iOS的PWA模式
          setTimeout(async () => {
            try {
              await saveProgress(0, 0, nextFile.id, true);
            } catch (e) {
              console.error('[usePlaybackEndedHandler] PWA模式：保存新文件进度失败', e);
            }

            autoPlayNextRef.current = true;
            setAutoPlayNext(true);
            setPaused();
            setCurrentFileId(nextFile.id);
            onFileChange(nextFile.id);

            setTimeout(() => {
              (window as any)[handlingKey] = false;
            }, 8000);
          }, 500);
        } else {
          // 非PWA模式正常处理
          (async () => {
            try {
              await saveProgress(0, 0, nextFile.id, true);
            } catch (e) {
              console.error('[usePlaybackEndedHandler] 非PWA模式：保存新文件进度失败', e);
            }

            autoPlayNextRef.current = true;
            setAutoPlayNext(true);
            setCurrentFileId(nextFile.id);
            onFileChange(nextFile.id);
          })();

          setTimeout(() => {
            (window as any)[handlingKey] = false;
          }, 3000);
        }
      } else {
        // 已是最后一集
        console.log('[usePlaybackEndedHandler] 已是最后一集，播放完成', {
          isPWA: isPWAModeLocal,
        });
        setPaused();
        setAutoPlayNext(false);
        autoPlayNextRef.current = false;

        if (!document.hidden) {
          toast.success(t('audiobook.player.playbackComplete'), { icon: '🎉' });
        }
        (window as any)[handlingKey] = false;
      }
    },
    [
      files,
      currentFileId,
      audiobookId,
      audiobookTitle,
      audiobookAuthor,
      audiobookCover,
      audioRef,
      isLoopingRef,
      autoPlayNextRef,
      setAutoPlayNext,
      setPaused,
      setPlaying,
      setCurrentFileId,
      onFileChange,
      saveProgress,
      t,
    ]
  );

  return {
    handlePlaybackEnded,
  };
}
