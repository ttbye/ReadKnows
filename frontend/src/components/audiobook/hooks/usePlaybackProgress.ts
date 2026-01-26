/**
 * @file usePlaybackProgress.ts
 * @description 播放进度管理 Hook - 处理播放进度的保存和恢复
 */

import { useRef, useCallback } from 'react';
import { audiobookProgressManager } from '../../../utils/audiobookProgressManager';

interface UsePlaybackProgressProps {
  audiobookId: string;
  currentFileId: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  onProgressUpdate: () => void;
  saveOfflineState?: (fileId: string, currentTime: number, duration: number) => void;
}

/**
 * 播放进度管理 Hook
 * 处理播放进度的保存（防抖、定期保存）和从API恢复播放进度
 */
export function usePlaybackProgress({
  audiobookId,
  currentFileId,
  audioRef,
  onProgressUpdate,
  saveOfflineState,
}: UsePlaybackProgressProps) {
  const lastSaveTimeRef = useRef<number>(0); // 上次保存进度的时间戳
  const saveProgressTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 防抖定时器

  /**
   * 保存播放进度
   */
  const saveProgress = useCallback(
    async (
      time: number,
      totalDuration: number,
      explicitFileId?: string,
      forceSave: boolean = false,
      isSwitchingFile: boolean = false
    ) => {
      // ✅ 修复：优先使用显式传入的fileId，如果没有则使用currentFileId
      const targetFileId = explicitFileId || currentFileId;

      if (!audiobookId || !targetFileId) {
        console.warn('[AudiobookPlayer] 保存进度失败：缺少必要参数', {
          audiobookId,
          targetFileId,
          explicitFileId,
          currentFileId,
        });
        return;
      }

      try {
        // ✅ 修复：如果forceSave为true，直接使用传入的参数（不从audioRef获取，因为此时audioRef可能还是旧文件）
        // 否则，确保使用最新的播放时间（从audioRef获取，而不是依赖传入的参数）
        const actualTime = forceSave ? time : audioRef.current?.currentTime ?? time;
        const actualDuration = forceSave
          ? totalDuration
          : audioRef.current?.duration ?? totalDuration;

        // ✅ 修复：切换文件时强制保存（即使duration为0），主要目的是更新last_file_id
        if (
          forceSave ||
          isSwitchingFile ||
          (actualDuration > 0 && actualTime >= 0 && actualTime <= actualDuration)
        ) {
          // 使用统一的进度管理器保存进度
          await audiobookProgressManager.saveProgress(
            audiobookId,
            targetFileId,
            actualTime,
            actualDuration,
            forceSave
          );

          // ✅ 同时保存到本地缓存（通过进度管理器已处理，这里保留兼容性调用）
          if (saveOfflineState) {
            try {
              saveOfflineState(targetFileId, actualTime, actualDuration);
            } catch (cacheError) {
              console.warn('[AudiobookPlayer] 更新本地缓存失败（不影响主流程）', cacheError);
            }
          }
          onProgressUpdate();
        } else {
          console.warn('[AudiobookPlayer] 跳过无效的进度保存', {
            actualTime,
            actualDuration,
            fileId: targetFileId,
            audiobookId,
            forceSave,
            isSwitchingFile,
          });
        }
      } catch (error: any) {
        console.error('[AudiobookPlayer] 保存进度失败:', error, {
          audiobookId,
          fileId: targetFileId,
          forceSave,
          isSwitchingFile,
        });
      }
    },
    [audiobookId, currentFileId, audioRef, onProgressUpdate]
  );

  /**
   * 防抖保存进度（每15秒至少保存一次）
   */
  const debouncedSaveProgress = useCallback(
    (fileId?: string) => {
      const now = Date.now();
      if (now - lastSaveTimeRef.current >= 15000) { // ✅ 改为15秒
        // 清除之前的定时器
        if (saveProgressTimeoutRef.current) {
          clearTimeout(saveProgressTimeoutRef.current);
        }
        // 延迟500ms保存，避免频繁触发
        saveProgressTimeoutRef.current = setTimeout(() => {
          if (audioRef.current && audioRef.current.duration > 0) {
            const targetFileId = fileId || currentFileId;
            saveProgress(
              audioRef.current.currentTime,
              audioRef.current.duration,
              targetFileId
            );
            lastSaveTimeRef.current = Date.now();
          }
          saveProgressTimeoutRef.current = null;
        }, 500);
      }
    },
    [audioRef, currentFileId, saveProgress]
  );

  /**
   * 从API恢复播放进度
   */
  const restoreProgress = useCallback(
    async (fileId: string): Promise<number> => {
      try {
        // 使用统一的进度管理器获取文件进度
        const currentTime = await audiobookProgressManager.getFileProgress(audiobookId, fileId);
        return currentTime;
      } catch (error) {
        console.error('[AudiobookPlayer] 获取进度失败:', error);
        return 0;
      }
    },
    [audiobookId]
  );

  /**
   * 强制保存进度（用于关闭、暂停、切换时）
   */
  const forceSaveProgress = useCallback(
    async (fileId?: string) => {
      if (audioRef.current && audioRef.current.duration > 0) {
        const targetFileId = fileId || currentFileId;
        await saveProgress(
          audioRef.current.currentTime,
          audioRef.current.duration,
          targetFileId,
          true // forceSave
        );
        lastSaveTimeRef.current = Date.now();
      }
    },
    [audioRef, currentFileId, saveProgress]
  );

  /**
   * 清理定时器
   */
  const cleanup = useCallback(() => {
    if (saveProgressTimeoutRef.current) {
      clearTimeout(saveProgressTimeoutRef.current);
      saveProgressTimeoutRef.current = null;
    }
  }, []);

  return {
    saveProgress,
    debouncedSaveProgress,
    forceSaveProgress,
    restoreProgress,
    cleanup,
    lastSaveTimeRef,
  };
}
