/**
 * @file useAudioErrorHandler.ts
 * @description 音频错误处理 Hook - 统一处理音频加载和播放错误
 */

import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { AudioFile } from '../types';
import { isPWAMode } from '../types/pwa';

/**
 * 错误处理配置
 */
export interface AudioErrorHandlerConfig {
  /** 当前文件ID */
  currentFileId: string;
  /** 当前文件 */
  currentFile: AudioFile | null;
  /** 最后成功加载的文件ID ref */
  lastSuccessfulLoadRef: React.MutableRefObject<string | null>;
  /** 错误时间 ref */
  errorTimeRef: React.MutableRefObject<number>;
  /** 自动播放下一首标志 ref */
  autoPlayNextRef: React.MutableRefObject<boolean>;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置暂停状态 */
  setPaused: () => void;
  /** 重新加载音频函数 */
  reloadAudio?: (fileId: string) => Promise<void>;
}

/**
 * 音频错误处理 Hook
 */
export function useAudioErrorHandler(config: AudioErrorHandlerConfig) {
  const {
    currentFileId,
    currentFile,
    lastSuccessfulLoadRef,
    errorTimeRef,
    autoPlayNextRef,
    setLoading,
    setPaused,
    reloadAudio,
  } = config;

  /**
   * 处理音频错误
   */
  const handleAudioError = useCallback(
    (audio: HTMLAudioElement, fileId: string) => {
      const error = audio.error;
      const isPWAModeLocal = isPWAMode();
      const currentTime = Date.now();

      // 检查是否是旧错误（音频已经重新加载）
      if (
        lastSuccessfulLoadRef.current === fileId &&
        currentTime - errorTimeRef.current > 5000
      ) {
        console.log('[useAudioErrorHandler] 忽略旧错误事件（音频已重新加载）', {
          fileId,
          lastSuccessfulFileId: lastSuccessfulLoadRef.current,
          timeSinceError: currentTime - errorTimeRef.current,
        });
        return;
      }

      // 检查音频是否实际上已经成功加载（readyState >= 2 且有src）
      if (audio.readyState >= 2 && audio.src && !audio.src.startsWith('blob:')) {
        // 可能是blob URL已过期，但音频实际上已经加载
        console.warn('[useAudioErrorHandler] 音频错误但readyState正常，可能是blob URL过期', {
          fileId,
          readyState: audio.readyState,
          src: audio.src.substring(0, 50),
          hasError: !!error,
        });
        // 不显示错误，尝试重新加载
        if (autoPlayNextRef.current && reloadAudio) {
          setTimeout(() => {
            if (autoPlayNextRef.current && audio === audio) {
              reloadAudio(fileId).catch(() => {
                // 忽略重新加载的错误，让canplaythrough处理器处理
              });
            }
          }, 500);
        }
        return;
      }

      errorTimeRef.current = currentTime;
      let errorMessage = '音频加载失败';
      let shouldShowToast = true;

      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = '音频加载被中止';
            console.warn('[useAudioErrorHandler] 音频加载被中止', {
              fileId,
              audioUrl: audio.src?.substring(0, 100),
              currentFileId,
              isAutoPlayNext: autoPlayNextRef.current,
            });
            // 被中止的错误通常不需要显示toast，可能是用户操作或自动切换
            shouldShowToast = false;
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = '网络错误，无法加载音频';
            console.error('[useAudioErrorHandler] 网络错误', {
              fileId,
              audioUrl: audio.src?.substring(0, 100),
              error: {
                code: error.code,
                message: error.message,
              },
              readyState: audio.readyState,
              networkState: audio.networkState,
              isPWA: isPWAModeLocal,
              documentHidden: document.hidden,
            });
            // 在自动播放下一集时，网络错误可能是暂时的，不显示toast
            if (autoPlayNextRef.current) {
              shouldShowToast = false;
            }
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = '音频解码失败，格式可能不支持';
            console.error('[useAudioErrorHandler] 音频解码失败', {
              fileId,
              audioUrl: audio.src?.substring(0, 100),
              error: {
                code: error.code,
                message: error.message,
              },
              fileType: currentFile?.file_type,
              readyState: audio.readyState,
            });
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = '音频格式不支持或URL无效';
            console.error('[useAudioErrorHandler] 音频格式不支持', {
              fileId,
              audioUrl: audio.src?.substring(0, 100),
              error: {
                code: error.code,
                message: error.message,
              },
              fileType: currentFile?.file_type,
              readyState: audio.readyState,
              networkState: audio.networkState,
            });
            break;
          default:
            errorMessage = `音频加载失败 (错误代码: ${error.code})`;
            console.error('[useAudioErrorHandler] 音频加载失败', {
              fileId,
              audioUrl: audio.src?.substring(0, 100),
              error: {
                code: error.code,
                message: error.message,
              },
              fileType: currentFile?.file_type,
              readyState: audio.readyState,
              networkState: audio.networkState,
              isPWA: isPWAModeLocal,
              documentHidden: document.hidden,
              isAutoPlayNext: autoPlayNextRef.current,
            });
        }
      } else {
        console.error('[useAudioErrorHandler] 音频错误事件（无错误对象）', {
          fileId,
          audioUrl: audio.src?.substring(0, 100),
          readyState: audio.readyState,
          networkState: audio.networkState,
          isPWA: isPWAModeLocal,
          documentHidden: document.hidden,
          isAutoPlayNext: autoPlayNextRef.current,
        });
      }

      // 只在非自动播放切换时显示错误提示
      if (shouldShowToast && !autoPlayNextRef.current) {
        toast.error(errorMessage);
      } else if (autoPlayNextRef.current) {
        console.warn('[useAudioErrorHandler] 自动播放下一集时音频加载失败，将重试', {
          fileId,
          errorCode: error?.code,
          isPWA: isPWAModeLocal,
        });
      }

      setLoading(false);
      // 只有在非自动播放时才设置播放状态为false
      if (!autoPlayNextRef.current) {
        setPaused();
      }
    },
    [
      currentFileId,
      currentFile,
      lastSuccessfulLoadRef,
      errorTimeRef,
      autoPlayNextRef,
      setLoading,
      setPaused,
      reloadAudio,
    ]
  );

  /**
   * 设置错误事件监听器
   */
  const setupErrorHandler = useCallback(
    (audio: HTMLAudioElement, fileId: string) => {
      const errorHandler = () => {
        handleAudioError(audio, fileId);
      };

      audio.addEventListener('error', errorHandler);
      return () => {
        audio.removeEventListener('error', errorHandler);
      };
    },
    [handleAudioError]
  );

  return {
    handleAudioError,
    setupErrorHandler,
  };
}
