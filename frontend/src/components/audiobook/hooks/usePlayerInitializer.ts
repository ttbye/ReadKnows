/**
 * @file usePlayerInitializer.ts
 * @description 播放器初始化 Hook - 处理状态恢复、文件选择、API调用
 */

import { useCallback, useRef, useEffect } from 'react';
import api from '../../../utils/api';
import { AudioFile } from '../types';
import { useOfflineSupport } from './useOfflineSupport';

/**
 * 初始化配置
 */
export interface PlayerInitializerConfig {
  /** 有声小说ID */
  audiobookId: string;
  /** 文件列表 */
  files: AudioFile[];
  /** 初始文件ID */
  initialFileId: string;
  /** 初始播放时间 */
  initialTime?: number;
  /** 当前文件ID */
  currentFileId: string;
  /** 设置当前文件ID的函数 */
  setCurrentFileId: (fileId: string) => void;
  /** 设置全局状态的函数 */
  setAudiobook?: (state: {
    audiobookId: string;
    audiobookTitle: string;
    audiobookAuthor: string;
    audiobookCover: string;
    files: AudioFile[];
    initialFileId: string;
  }) => void;
  /** 有声小说标题 */
  audiobookTitle: string;
  /** 有声小说作者 */
  audiobookAuthor: string;
  /** 有声小说封面 */
  audiobookCover: string;
}

/**
 * 初始化结果
 */
export interface InitializationResult {
  /** 目标文件ID */
  fileId: string;
  /** 开始时间 */
  startTime: number;
  /** 来源 */
  source: string;
  /** 是否已从API获取过进度（用于区分"获取到0"和"未获取"） */
  hasProgressFromAPI?: boolean;
}

/**
 * 播放器初始化 Hook
 */
export function usePlayerInitializer(config: PlayerInitializerConfig) {
  const {
    audiobookId,
    files,
    initialFileId,
    initialTime = 0,
    currentFileId,
    setCurrentFileId,
    setAudiobook,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
  } = config;

  const initializationCompleteRef = useRef(false);
  const { loadOfflineState } = useOfflineSupport(audiobookId, {
    enabled: true,
    cacheExpiration: 24 * 60 * 60 * 1000,
  });
  
  // 使用 ref 存储所有需要的值，避免循环依赖和初始化顺序问题
  const stateRef = useRef({
    loadOfflineState,
    files,
    audiobookId,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
  });
  
  // 确保 ref 始终指向最新的值
  useEffect(() => {
    stateRef.current = {
      loadOfflineState,
      files,
      audiobookId,
      audiobookTitle,
      audiobookAuthor,
      audiobookCover,
    };
  }, [loadOfflineState, files, audiobookId, audiobookTitle, audiobookAuthor, audiobookCover]);

  /**
   * 从离线缓存恢复状态
   */
  const restoreFromOfflineCache = useCallback((): { fileId: string; startTime: number } | null => {
    const { loadOfflineState: loadFn, files: currentFiles } = stateRef.current;
    if (!loadFn || typeof loadFn !== 'function') {
      return null;
    }
    
    try {
      const offlineState = loadFn();
      if (offlineState && offlineState.fileId) {
        const isValidFile = currentFiles.some(f => f.id === offlineState.fileId);
        if (isValidFile) {
          return {
            fileId: offlineState.fileId,
            startTime: offlineState.currentTime || 0,
          };
        }
      }
    } catch (error) {
      console.warn('[usePlayerInitializer] 恢复离线缓存失败:', error);
    }
    return null;
  }, []);

  /**
   * 从PWA本地存储恢复状态（已废弃，不再使用）
   * ✅ 修复：PWA和PC端应该统一使用API获取进度，不再使用localStorage缓存
   * 这个函数保留是为了向后兼容，但不会在正常流程中被调用
   */
  const restoreFromPWACache = useCallback((): { fileId: string; startTime: number } | null => {
    // ✅ 修复：不再使用PWA本地存储，统一使用API
    // 这样可以确保PWA和PC端的进度一致，避免使用过时的缓存数据
    return null;
  }, []);

  /**
   * 从API获取最后播放的进度
   */
  const fetchProgressFromAPI = useCallback(async (): Promise<{ fileId: string; startTime: number; hasProgressFromAPI?: boolean } | null> => {
    const { audiobookId: currentAudiobookId, files: currentFiles } = stateRef.current;

    // 调试：开始从API获取进度
    // console.log('🎵 [fetchProgressFromAPI] 开始从API获取进度:', {
    //   audiobookId: currentAudiobookId,
    //   filesCount: currentFiles.length
    // });

    try {
      const progressResponse = await api.get(`/audiobooks/${currentAudiobookId}/progress`);

      // API响应（调试用）
      // console.log('🎵 [fetchProgressFromAPI] API响应:', {
      //   success: progressResponse.data.success,
      //   hasProgress: !!progressResponse.data.progress,
      //   progress: progressResponse.data.progress
      // });

      if (progressResponse.data.success && progressResponse.data.progress) {
        const progress = progressResponse.data.progress;
        const lastPlayedFileId = progress.file_id;

        // ✅ 修复：检查是否是有效的最后播放文件
        // 如果 is_new_file 为 true，说明这是新切换的文件，没有进度记录，应该从头开始播放
        const isNewFile = progress.is_new_file === true || (progress.current_time === 0 && progress.duration === 0);
        const isLastPlayedValid =
          lastPlayedFileId &&
          currentFiles.some(f => f.id === lastPlayedFileId);

        if (isLastPlayedValid) {
          // ✅ 修复：如果是新文件（没有进度记录），从头开始播放
          if (isNewFile) {
            return {
              fileId: lastPlayedFileId,
              startTime: 0,
              hasProgressFromAPI: true, // ✅ 标记已从API获取过进度（即使是0）
            } as InitializationResult;
          }

          // ✅ 修复：如果进度是100%，从头开始播放（startTime = 0）
          // 优先使用后端返回的 progress 字段（百分比），如果没有则计算
          const progressPercent = progress.progress !== undefined && progress.progress !== null
            ? progress.progress  // 后端返回的百分比（0-100）
            : (progress.duration > 0
                ? (progress.current_time / progress.duration) * 100
                : 0);

          const startTime = progressPercent >= 100 ? 0 : progress.current_time;

          return {
            fileId: lastPlayedFileId,
            startTime,
            hasProgressFromAPI: true, // ✅ 标记已从API获取过进度
          };
        } else {
          console.warn('[fetchProgressFromAPI] lastPlayedFileId无效', {
            lastPlayedFileId,
            availableFiles: currentFiles.map(f => f.id)
          });
        }
      } else {
        console.warn('[fetchProgressFromAPI] API响应成功但无进度数据', {
          success: progressResponse.data.success,
          hasProgress: !!progressResponse.data.progress
        });
      }
    } catch (error: any) {
      console.error('[fetchProgressFromAPI] API调用失败', {
        error: error.message,
        status: error.response?.status,
        url: `/audiobooks/${currentAudiobookId}/progress`,
        isPWAMode: window.matchMedia('(display-mode: standalone)').matches
      });
    }

    console.log('🎵 [fetchProgressFromAPI] 未获取到有效进度，返回null');
    return null;
  }, []);

  /**
   * 初始化播放器
   */
  const initialize = useCallback(async (): Promise<InitializationResult> => {
    let targetFileId = initialFileId;
    let startTime = initialTime; // ✅ 使用传入的initialTime作为默认值
    let source = 'initialFileId';
    let hasProgressFromAPI = false;
    let apiState: { fileId: string; startTime: number; hasProgressFromAPI?: boolean } | null = null;

    // 调试：打印初始化信息（可根据需要启用）
    // console.log('🎵 [usePlayerInitializer] 初始化开始:', {
    //   initialFileId,
    //   initialTime,
    //   source: '页面传入'
    // });

    // ✅ 修复：优先使用用户指定的initialFileId（来自URL参数），而不是API的last_file_id
    // 只有当没有指定initialFileId时，才使用API的last_file_id
    if (initialFileId) {
      // 总是尝试从API获取最新的进度，以确保数据准确性
      // 即使页面传入了initialTime，也要检查API是否有更新的进度
      apiState = await fetchProgressFromAPI();

      if (apiState && apiState.fileId === initialFileId) {
        // API返回的进度与用户指定的文件匹配，优先使用API的时间
        startTime = apiState.startTime;
        hasProgressFromAPI = true;
        console.log('🎵 [usePlayerInitializer] 使用API进度:', {
          startTime,
          initialTime,
          source: 'API优先'
        });
      } else if (initialTime > 0) {
        // API没有返回匹配的进度，但页面传入了有效的initialTime，使用页面传入的值
        startTime = initialTime;
        hasProgressFromAPI = true;
        console.log('🎵 [usePlayerInitializer] 使用页面传入的进度:', {
          startTime: initialTime,
          source: '页面传入（API无匹配）'
        });
      } else {
        // 都没有有效进度，从头开始
        startTime = 0;
        hasProgressFromAPI = false;
        console.log('🎵 [usePlayerInitializer] 无有效进度，从头开始');
      }
    } else {
      // 没有指定initialFileId，使用API的last_file_id
      apiState = await fetchProgressFromAPI();

      if (apiState) {
        targetFileId = apiState.fileId;
        startTime = apiState.startTime;
        hasProgressFromAPI = true;
        source = 'API进度（last_file_id）';

      } 
    }

    // ✅ 修复：统一使用API获取进度，但PWA模式下允许使用离线缓存作为降级方案
    // 这样可以确保进度的一致性，同时避免PWA模式下API调用失败时的进度丢失问题
    // 注意：不能使用 targetFileId === initialFileId 来判断，因为API返回的fileId可能等于initialFileId

    // 2. 如果API没有返回结果，尝试从离线缓存恢复（PWA模式下的降级方案）
    // 注意：离线缓存也应该通过API同步，这里只是最后的降级方案
    if (!apiState) {
      const offlineState = restoreFromOfflineCache();
      if (offlineState) {
        targetFileId = offlineState.fileId;
        startTime = offlineState.startTime;
      } else {
        // 如果连离线缓存都没有，记录警告
        console.warn('[usePlayerInitializer] API和离线缓存都不可用，使用默认设置');
      }
    }

    // ✅ 修复：已移除PWA本地存储恢复逻辑
    // PWA和PC端应该统一使用API获取进度，确保数据一致性
    // 如果API调用失败，应该显示错误或使用默认值，而不是使用可能过时的localStorage数据

    // 4. 更新状态
    if (targetFileId && targetFileId !== currentFileId) {
      setCurrentFileId(targetFileId);
    }

    // 5. 更新全局状态
    if (setAudiobook && targetFileId) {
      const { audiobookId: currentAudiobookId, files: currentFiles } = stateRef.current;
      setAudiobook({
        audiobookId: currentAudiobookId,
        audiobookTitle,
        audiobookAuthor,
        audiobookCover,
        files: currentFiles,
        initialFileId: targetFileId,
      });
    }

    // 调试：初始化完成
    // console.log('🎵 [usePlayerInitializer] 初始化完成，返回结果:', {
    //   fileId: targetFileId,
    //   startTime,
    //   source,
    //   hasProgressFromAPI,
    //   initialTime, // 调试：显示原始的 initialTime
    //   targetFileId,
    //   apiState
    // });

    return {
      fileId: targetFileId,
      startTime, // ✅ 修复：返回获取到的startTime（如果未获取到，为 0）
      source,
      hasProgressFromAPI, // ✅ 标记是否已从API获取过进度
    };
  }, [
    initialFileId,
    currentFileId,
    restoreFromOfflineCache,
    restoreFromPWACache,
    fetchProgressFromAPI,
    setCurrentFileId,
    setAudiobook,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
  ]);

  /**
   * 重置初始化状态（用于重新初始化）
   */
  const reset = useCallback(() => {
    initializationCompleteRef.current = false;
  }, []);

  /**
   * 检查是否已初始化
   */
  const isInitialized = useCallback(() => {
    return initializationCompleteRef.current;
  }, []);

  /**
   * 标记为已初始化
   */
  const markAsInitialized = useCallback(() => {
    initializationCompleteRef.current = true;
  }, []);

  return {
    initialize,
    reset,
    isInitialized,
    markAsInitialized,
  };
}
