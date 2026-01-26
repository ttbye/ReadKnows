/**
 * @file useAudioPreload.ts
 * @description 音频预加载 Hook - 管理音频文件的预加载和缓存
 */

import { useRef, useCallback, useEffect } from 'react';
import api from '../../../utils/api';
import { AudioFile } from '../types';

interface UseAudioPreloadProps {
  audiobookId: string;
  files: AudioFile[];
  currentFileId: string;
  preloadCount?: number; // 预加载后续文件数量，默认3个
}

interface PreloadCacheItem {
  blob: Blob;
  url: string;
  mimeType: string;
  timestamp: number;
}

/**
 * 音频预加载 Hook
 * 管理音频文件的预加载和缓存，支持后续音频的提前加载
 */
export function useAudioPreload({
  audiobookId,
  files,
  currentFileId,
  preloadCount = 3,
}: UseAudioPreloadProps) {
  const preloadCacheRef = useRef<Map<string, PreloadCacheItem>>(new Map());
  const preloadingRef = useRef<Set<string>>(new Set()); // 正在预加载的文件ID集合

  /**
   * 预加载单个音频文件
   */
  const preloadAudio = useCallback(
    async (fileId: string): Promise<string | null> => {
      // 如果已经在缓存中，直接返回
      const cached = preloadCacheRef.current.get(fileId);
      if (cached) {
        // 检查缓存是否过期（1小时）
        if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
          return cached.url;
        } else {
          // 清理过期缓存
          URL.revokeObjectURL(cached.url);
          preloadCacheRef.current.delete(fileId);
        }
      }

      // 如果正在预加载，等待
      if (preloadingRef.current.has(fileId)) {
        return null;
      }

      preloadingRef.current.add(fileId);

      try {
        console.log('[useAudioPreload] 开始预加载音频', { fileId });

        // 使用原始fetch API获取音频文件，避免axios的封装可能导致的问题
        const audioUrl = getFullApiUrl(`/audiobooks/${audiobookId}/files/${fileId}`);
        const authHeaders = getAuthHeaders();

        const response = await fetch(audioUrl, {
          headers: authHeaders,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        const mimeType = blob.type || 'audio/mpeg';
        const url = URL.createObjectURL(blob);

        // 存入缓存
        preloadCacheRef.current.set(fileId, {
          blob,
          url,
          mimeType,
          timestamp: Date.now(),
        });

        console.log('[useAudioPreload] 音频预加载成功', { fileId });
        preloadingRef.current.delete(fileId);

        return url;
      } catch (error) {
        console.error('[useAudioPreload] 音频预加载失败', { fileId, error });
        preloadingRef.current.delete(fileId);
        return null;
      }
    },
    [audiobookId]
  );

  /**
   * 预加载后续音频文件（改为顺序加载，避免并发过多导致的问题）
   */
  const preloadNextFiles = useCallback(async () => {
    const currentIndex = files.findIndex(f => f.id === currentFileId);
    if (currentIndex === -1) return;

    // 逐个预加载后续的 preloadCount 个文件，避免并发过多
    for (let i = 1; i <= preloadCount; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < files.length) {
        const nextFile = files[nextIndex];
        try {
          await preloadAudio(nextFile.id);
        } catch (err) {
          console.warn('[useAudioPreload] 预加载失败', { fileId: nextFile.id, err });
          // 继续下一个，不要因为一个失败而停止所有预加载
        }
      }
    }
  }, [files, currentFileId, preloadCount, preloadAudio]);

  /**
   * 获取预加载的URL（如果已预加载）
   */
  const getPreloadedUrl = useCallback(
    (fileId: string): string | null => {
      const cached = preloadCacheRef.current.get(fileId);
      if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
        return cached.url;
      }
      return null;
    },
    []
  );

  /**
   * 清理指定文件的缓存
   */
  const clearCache = useCallback((fileId: string) => {
    const cached = preloadCacheRef.current.get(fileId);
    if (cached) {
      URL.revokeObjectURL(cached.url);
      preloadCacheRef.current.delete(fileId);
    }
  }, []);

  /**
   * 清理所有过期缓存（超过1小时）
   */
  const clearExpiredCache = useCallback(() => {
    const now = Date.now();
    const expiredFiles: string[] = [];

    preloadCacheRef.current.forEach((item, fileId) => {
      if (now - item.timestamp > 60 * 60 * 1000) {
        expiredFiles.push(fileId);
      }
    });

    expiredFiles.forEach(fileId => {
      clearCache(fileId);
    });

    if (expiredFiles.length > 0) {
      console.log('[useAudioPreload] 清理过期缓存', { count: expiredFiles.length });
    }
  }, [clearCache]);

  /**
   * 清理所有缓存
   */
  const clearAllCache = useCallback(() => {
    preloadCacheRef.current.forEach(item => {
      URL.revokeObjectURL(item.url);
    });
    preloadCacheRef.current.clear();
    preloadingRef.current.clear();
  }, []);

  // 当当前文件变化时，预加载后续文件
  // 暂时禁用预加载以调试主要问题
  // useEffect(() => {
  //   preloadNextFiles();
  // }, [preloadNextFiles]);

  // 定期清理过期缓存（每10分钟）
  useEffect(() => {
    const interval = setInterval(() => {
      clearExpiredCache();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [clearExpiredCache]);

  // 组件卸载时清理所有缓存
  useEffect(() => {
    return () => {
      clearAllCache();
    };
  }, [clearAllCache]);

  return {
    preloadAudio,
    preloadNextFiles,
    getPreloadedUrl,
    clearCache,
    clearExpiredCache,
    clearAllCache,
  };
}
