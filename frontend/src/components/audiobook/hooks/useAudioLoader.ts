/**
 * @file useAudioLoader.ts
 * @description 音频加载 Hook - 处理音频文件加载的核心逻辑
 */

import { useCallback, useRef } from 'react';
import api from '../../../utils/api';
import { getFullApiUrl, getAuthHeaders } from '../../../utils/api';
import { AudioFile } from '../types';
import { GlobalAudioManager } from '../types/global';

/**
 * 全局音频管理器接口（从外部传入）
 */
export interface AudioLoaderGlobalManager {
  canReuse: GlobalAudioManager['canReuse'];
  getInstance: GlobalAudioManager['getInstance'];
  setInstance: GlobalAudioManager['setInstance'];
}
import { AudioElementWithHandlers } from '../types/audio';

/**
 * 音频加载配置
 */
export interface AudioLoaderConfig {
  /** 有声小说ID */
  audiobookId: string;
  /** 文件列表 */
  files: AudioFile[];
  /** 当前文件 */
  currentFile: AudioFile | null;
  /** 音量 */
  volume: number;
  /** 是否静音 */
  isMuted: boolean;
  /** 播放速度 */
  playbackRate: number;
  /** 预加载缓存ref */
  preloadCacheRef: React.MutableRefObject<Map<string, { blob: Blob; url: string }>>;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** PWA事件处理器设置函数 */
  setupPWAAudioHandlers?: (audio: HTMLAudioElement, fileId: string) => (() => void) | null;
  /** PWA清理函数ref */
  pwaAudioHandlersCleanupRef?: React.MutableRefObject<(() => void) | null>;
  /** 全局音频管理器 */
  globalAudioManager: AudioLoaderGlobalManager;
}

/**
 * 加载结果
 */
export interface AudioLoadResult {
  /** 音频元素 */
  audio: HTMLAudioElement;
  /** 开始时间 */
  startTime: number;
  /** Blob URL（如果有） */
  blobUrl: string | null;
}

/**
 * 音频加载 Hook
 */
export function useAudioLoader(config: AudioLoaderConfig) {
  const {
    audiobookId,
    files,
    currentFile,
    volume,
    isMuted,
    playbackRate,
    preloadCacheRef,
    setLoading,
    setupPWAAudioHandlers,
    pwaAudioHandlersCleanupRef,
    globalAudioManager,
  } = config;

  /**
   * 获取文件的播放进度
   */
  const fetchFileProgress = useCallback(
    async (fileId: string, startTimeFromAPI: number): Promise<number> => {
      // 如果已经传入了开始时间，直接使用
      if (startTimeFromAPI > 0) {
        return startTimeFromAPI;
      }

      try {
        const progressResponse = await api.get(`/audiobooks/${audiobookId}/progress`, {
          params: { fileId },
        });

        if (progressResponse.data.success && progressResponse.data.progress) {
          const progress = progressResponse.data.progress;
          if (progress.file_id === fileId && progress.current_time > 0) {
            // ✅ 修复：如果进度是100%，从头开始播放；否则从保存的进度位置开始播放
            // 优先使用后端返回的 progress 字段（百分比），如果没有则计算
            const progressPercent = progress.progress !== undefined && progress.progress !== null
              ? progress.progress  // 后端返回的百分比（0-100）
              : (progress.duration > 0 
                  ? (progress.current_time / progress.duration) * 100 
                  : 0);

            // 如果进度是100%，从头开始播放
            if (progressPercent >= 100) {
              // 清除保存的进度
              try {
                await api.post(`/audiobooks/${audiobookId}/progress`, {
                  fileId: fileId,
                  currentTime: 0,
                  duration: progress.duration,
                });
              } catch (e) {
                console.warn('[useAudioLoader] 清除进度失败:', e);
              }
              console.log('[useAudioLoader] 文件已播放完成（进度=100%），从头开始播放', {
                fileId,
                progressPercent: progressPercent.toFixed(2) + '%'
              });
              return 0;
            }

            // 进度未完成（<100%），从保存的进度位置开始播放
            console.log('[useAudioLoader] 从保存的进度位置开始播放', {
              fileId,
              startTime: progress.current_time,
              progressPercent: progressPercent.toFixed(2) + '%'
            });
            return progress.current_time;
          }
        }
      } catch (error) {
        console.error('[useAudioLoader] 获取文件进度失败:', error);
      }

      return 0;
    },
    [audiobookId]
  );

  /**
   * 加载音频文件
   */
  const loadAudioFile = useCallback(
    async (
      fileId: string,
      startTimeFromAPI: number = 0,
      audioRef: React.RefObject<HTMLAudioElement>
    ): Promise<AudioLoadResult> => {
      // 检查是否可以复用现有的全局音频实例
      if (globalAudioManager.canReuse(audiobookId, fileId)) {
        const instance = globalAudioManager.getInstance();
        if (instance && instance.audio) {
          const existingAudio = instance.audio;
          audioRef.current = existingAudio;
          setLoading(false);

          // 获取开始时间
          const startTime = await fetchFileProgress(fileId, startTimeFromAPI);

          return {
            audio: existingAudio,
            startTime,
            blobUrl: existingAudio.src.startsWith('blob:') ? existingAudio.src : null,
          };
        }
      }

      // 获取开始时间
      const startTime = await fetchFileProgress(fileId, startTimeFromAPI);

      // 创建新的音频元素
      const audioUrl = getFullApiUrl(`/audiobooks/${audiobookId}/files/${fileId}`);
      const authHeaders = getAuthHeaders();
      const audio = new Audio();
      audioRef.current = audio;

      // 设置PWA专用事件处理器
      if (setupPWAAudioHandlers && pwaAudioHandlersCleanupRef) {
        const cleanupPWASetup = setupPWAAudioHandlers(audio, fileId);
        if (cleanupPWASetup) {
          pwaAudioHandlersCleanupRef.current = cleanupPWASetup;
        }
      }

      // 保存到全局音频管理器
      globalAudioManager.setInstance(audiobookId, fileId, audio);

      // 设置音频属性
      audio.preload = 'auto';
      audio.volume = isMuted ? 0 : volume;
      audio.playbackRate = playbackRate;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');

      // 设置音频源（优先使用预缓存的音频）
      const cached = preloadCacheRef.current.get(fileId);
      let blobUrl: string | null = null;

      if (cached) {
        // 使用预缓存的音频
        blobUrl = cached.url;
        audio.src = blobUrl;
        console.log('[useAudioLoader] 使用预缓存的音频', {
          fileId,
          fileName: currentFile?.file_name,
          blobSize: cached.blob.size,
        });
      } else {
        // 从服务器获取音频
        const headers: HeadersInit = {
          ...authHeaders,
        };

        try {
          const response = await fetch(audioUrl, { headers });
          if (response.ok) {
            const blob = await response.blob();

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
            const errorText = await response.text().catch(() => '无法读取错误信息');
            console.error('[useAudioLoader] HTTP错误', {
              status: response.status,
              statusText: response.statusText,
              fileId,
              audioUrl,
              errorText: errorText.substring(0, 200),
            });
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error: any) {
          console.error('[useAudioLoader] fetch加载音频失败:', error, {
            fileId,
            audioUrl,
            errorMessage: error?.message,
            errorName: error?.name,
          });

          // 降级方案：尝试使用带token的URL
          try {
            const authHeader = (authHeaders as any)['Authorization'] || '';
            const apiKey = (authHeaders as any)['X-API-Key'] || '';
            const token = authHeader?.replace('Bearer ', '') || apiKey || '';

            if (token) {
              const urlWithToken = `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
              audio.src = urlWithToken;
              console.log('[useAudioLoader] 使用带token的URL作为降级方案', { hasToken: !!token });
            } else {
              audio.src = audioUrl;
              console.warn('[useAudioLoader] 使用原始URL作为降级方案', { audioUrl });
            }
          } catch (e) {
            console.error('[useAudioLoader] 设置音频源失败:', e);
            audio.src = audioUrl;
          }
        }
      }

      return {
        audio,
        startTime,
        blobUrl,
      };
    },
    [
      audiobookId,
      files,
      currentFile,
      volume,
      isMuted,
      playbackRate,
      preloadCacheRef,
      setLoading,
      setupPWAAudioHandlers,
      pwaAudioHandlersCleanupRef,
      fetchFileProgress,
    ]
  );

  /**
   * 清理音频资源
   */
  const cleanupAudio = useCallback(
    (audio: HTMLAudioElement, blobUrl: string | null) => {
      if (audio) {
        audio.pause();
        audio.src = '';
        audio.load();
      }

      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
    },
    []
  );

  return {
    loadAudioFile,
    fetchFileProgress,
    cleanupAudio,
  };
}
