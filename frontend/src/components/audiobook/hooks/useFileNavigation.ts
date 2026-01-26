/**
 * @file useFileNavigation.ts
 * @description 文件导航 Hook - 处理上一首/下一首切换逻辑
 */

import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AudioFile } from '../types';
import { isPWAMode } from '../types/pwa';

/**
 * 文件导航配置
 */
export interface FileNavigationConfig {
  /** 文件列表 */
  files: AudioFile[];
  /** 当前文件索引 */
  currentFileIndex: number;
  /** 当前文件ID */
  currentFileId: string;
  /** 当前文件 */
  currentFile: AudioFile | null;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 音频引用 */
  audioRef: React.RefObject<HTMLAudioElement>;
  /** 保存进度函数 */
  saveProgress: (
    time: number,
    duration: number,
    fileId: string,
    forceSave?: boolean,
    isSwitchingFile?: boolean
  ) => Promise<void>;
  /** 设置当前文件ID */
  setCurrentFileId: (fileId: string) => void;
  /** 文件变化回调 */
  onFileChange: (fileId: string) => void;
  /** 设置暂停状态 */
  setPaused: () => void;
  /** 显示播放列表状态 */
  showPlaylist: boolean;
  /** 设置显示播放列表 */
  setShowPlaylist: (show: boolean) => void;
  /** 自动播放下一首标志ref */
  autoPlayNextRef: React.MutableRefObject<boolean>;
  /** 设置自动播放下一首 */
  setAutoPlayNext: (value: boolean) => void;
}

/**
 * 文件导航 Hook
 */
export function useFileNavigation(config: FileNavigationConfig) {
  const {
    files,
    currentFileIndex,
    currentFileId,
    currentFile,
    isPlaying,
    audioRef,
    saveProgress,
    setCurrentFileId,
    onFileChange,
    setPaused,
    showPlaylist,
    setShowPlaylist,
    autoPlayNextRef,
    setAutoPlayNext,
  } = config;

  const { t } = useTranslation();

  /**
   * 切换到上一首
   */
  const navigateToPrevious = useCallback(async () => {
    // ✅ 修复：切换文件前保存当前文件的进度和last_file_id（即使duration为0也要保存）
    if (audioRef.current && currentFileId) {
      const currentTime = audioRef.current.currentTime || 0;
      const duration = audioRef.current.duration || 0;
      
      console.log('[useFileNavigation] 切换到上一首：保存当前文件进度', {
        fileId: currentFileId,
        currentTime,
        duration
      });
      
      if (duration > 0) {
        // 音频已完全加载，保存完整进度
        await saveProgress(currentTime, duration, currentFileId);
      } else {
        // 音频未完全加载，至少更新last_file_id
        await saveProgress(0, 0, currentFileId, true);
      }
    }

    if (currentFileIndex > 0) {
      const prevFile = files[currentFileIndex - 1];

      // 切换文件前，立即保存新文件的进度（更新last_file_id）
      try {
        await saveProgress(0, 0, prevFile.id, true);
        console.log('[useFileNavigation] handlePrevious：新文件进度已保存（last_file_id已更新）', {
          prevFileId: prevFile.id,
        });
      } catch (e) {
        console.error('[useFileNavigation] handlePrevious：保存新文件进度失败', e);
      }

      // 更可靠地设置自动播放标志
      const isPWAModeLocal = isPWAMode();
      const wasPlaying = isPlaying;

      if (wasPlaying) {
        console.log('[useFileNavigation] 准备切换到上一首并继续播放', {
          currentFile: currentFile?.file_name,
          prevFile: prevFile.file_name,
          isPWA: isPWAModeLocal,
        });

        // 在状态更新前设置标志
        autoPlayNextRef.current = true;
        setAutoPlayNext(true);

        // PWA模式下需要确保状态同步
        if (isPWAModeLocal) {
          // 先停止当前音频
          if (audioRef.current) {
            audioRef.current.pause();
          }
          setPaused();

          // 延迟切换，确保状态稳定
          setTimeout(() => {
            setCurrentFileId(prevFile.id);
            onFileChange(prevFile.id);
          }, 100);
        } else {
          setCurrentFileId(prevFile.id);
          onFileChange(prevFile.id);
        }
      } else {
        // 当前未播放，直接切换
        setCurrentFileId(prevFile.id);
        onFileChange(prevFile.id);
      }

      // 切换到新音频时，确保列表显示
      if (!showPlaylist) {
        setShowPlaylist(true);
      }
    } else {
      toast(t('audiobook.player.firstEpisode'), { icon: 'ℹ️' });
    }
  }, [
    currentFileIndex,
    files,
    currentFileId,
    currentFile,
    isPlaying,
    audioRef,
    saveProgress,
    setCurrentFileId,
    onFileChange,
    setPaused,
    showPlaylist,
    setShowPlaylist,
    autoPlayNextRef,
    setAutoPlayNext,
    t,
  ]);

  /**
   * 切换到下一首
   */
  const navigateToNext = useCallback(async () => {
    // ✅ 修复：切换文件前保存当前文件的进度和last_file_id（即使duration为0也要保存）
    if (audioRef.current && currentFileId) {
      const currentTime = audioRef.current.currentTime || 0;
      const duration = audioRef.current.duration || 0;
      
      console.log('[useFileNavigation] 切换到下一首：保存当前文件进度', {
        fileId: currentFileId,
        currentTime,
        duration
      });
      
      if (duration > 0) {
        // 音频已完全加载，保存完整进度
        await saveProgress(currentTime, duration, currentFileId);
      } else {
        // 音频未完全加载，至少更新last_file_id
        await saveProgress(0, 0, currentFileId, true);
      }
    }

    if (currentFileIndex < files.length - 1) {
      const nextFile = files[currentFileIndex + 1];

      // 切换文件前，立即保存新文件的进度（更新last_file_id）
      try {
        await saveProgress(0, 0, nextFile.id, true);
        console.log('[useFileNavigation] handleNext：新文件进度已保存（last_file_id已更新）', {
          nextFileId: nextFile.id,
        });
      } catch (e) {
        console.error('[useFileNavigation] handleNext：保存新文件进度失败', e);
      }

      // 更可靠地设置自动播放标志
      const isPWAModeLocal = isPWAMode();
      const wasPlaying = isPlaying;

      if (wasPlaying) {
        console.log('[useFileNavigation] 准备切换到下一首并继续播放', {
          currentFile: currentFile?.file_name,
          nextFile: nextFile.file_name,
          isPWA: isPWAModeLocal,
        });

        // 在状态更新前设置标志
        autoPlayNextRef.current = true;
        setAutoPlayNext(true);

        // PWA模式下需要确保状态同步
        if (isPWAModeLocal) {
          // 先停止当前音频
          if (audioRef.current) {
            audioRef.current.pause();
          }
          setPaused();

          // 延迟切换，确保状态稳定
          setTimeout(() => {
            setCurrentFileId(nextFile.id);
            onFileChange(nextFile.id);
          }, 100);
        } else {
          setCurrentFileId(nextFile.id);
          onFileChange(nextFile.id);
        }
      } else {
        // 当前未播放，直接切换
        setCurrentFileId(nextFile.id);
        onFileChange(nextFile.id);
      }

      // 切换到新音频时，确保列表显示
      if (!showPlaylist) {
        setShowPlaylist(true);
      }
    } else {
      toast(t('audiobook.player.lastEpisode'), { icon: 'ℹ️' });
      setPaused();
    }
  }, [
    currentFileIndex,
    files,
    currentFileId,
    currentFile,
    isPlaying,
    audioRef,
    saveProgress,
    setCurrentFileId,
    onFileChange,
    setPaused,
    showPlaylist,
    setShowPlaylist,
    autoPlayNextRef,
    setAutoPlayNext,
    t,
  ]);

  return {
    navigateToPrevious,
    navigateToNext,
  };
}
