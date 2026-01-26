/**
 * @file audiobookProgressManager.ts
 * @description 有声小说播放进度管理器 - 统一管理播放进度的保存、读取和同步
 */

import api from './api';

export interface AudiobookProgress {
  audiobook_id: string;
  file_id: string;
  current_time: number;
  duration: number;
  progress: number; // 百分比
  last_played_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface LocalProgressCache {
  file_id: string;
  current_time: number;
  duration: number;
  progress: number;
  last_played_at: string;
}

/**
 * 有声小说播放进度管理器
 * 负责统一管理播放进度的保存、读取和同步
 */
export class AudiobookProgressManager {
  private static instance: AudiobookProgressManager;
  private cache: Map<string, AudiobookProgress> = new Map();

  private constructor() {}

  static getInstance(): AudiobookProgressManager {
    if (!AudiobookProgressManager.instance) {
      AudiobookProgressManager.instance = new AudiobookProgressManager();
    }
    return AudiobookProgressManager.instance;
  }

  /**
   * 获取有声小说的播放进度（API最优先，本地缓存仅在API完全失败时使用）
   * @param audiobookId 有声小说ID
   * @returns 播放进度数据
   */
  async getProgress(audiobookId: string): Promise<AudiobookProgress | null> {
    try {
      // 从API获取最新进度（最优先）
      const response = await api.get(`/audiobooks/${audiobookId}/progress`);
      if (response.data.success && response.data.progress) {
        const progress = response.data.progress;

        // 调试日志：获取进度时的详细信息
        console.log('🎵 [有声小说调试] 从API获取进度:', {
          audiobookId,
          progress: progress ? {
            file_id: progress.file_id,
            current_time: progress.current_time,
            duration: progress.duration,
            progress: progress.progress,
            is_new_file: progress.is_new_file
          } : null
        });

        // 处理特殊情况：如果后端返回 is_new_file，表示这是新文件，没有进度记录
        if (progress.is_new_file) {
          console.log('🎵 [有声小说调试] 检测到新文件，返回last_file_id但无进度记录:', {
            audiobookId,
            lastFileId: progress.file_id
          });

          // 为新文件创建默认进度对象
          const newFileProgress: AudiobookProgress = {
            audiobook_id: audiobookId,
            file_id: progress.file_id,
            current_time: 0,
            duration: 0,
            progress: 0,
            last_played_at: new Date().toISOString()
          };

          // 不缓存新文件的进度（因为还没有真正开始播放）
          // 只返回文件ID，让前端知道从哪个文件开始播放
          return newFileProgress;
        }

        // 更新内存缓存
        this.cache.set(audiobookId, progress);

        // 同步到本地缓存
        this.saveToLocalCache(audiobookId, progress);

        // console.log('[ProgressManager] 从API获取进度成功', {
        //   audiobookId,
        //   fileId: progress.file_id,
        //   currentTime: progress.current_time,
        //   progress: progress.progress
        // });

        return progress;
      }
      // API返回成功但没有进度数据，直接返回null，不使用本地缓存
      return null;
    } catch (error) {
      console.error('[ProgressManager] API获取进度失败，仅在API完全失败时尝试本地缓存', error);
      // 只有在API调用完全失败（网络错误等）时，才尝试从本地缓存获取
      const localProgress = this.getFromLocalCache(audiobookId);
      if (localProgress) {
        // console.log('[ProgressManager] 从本地缓存获取进度（API完全失败）', {
        //   audiobookId,
        //   fileId: localProgress.file_id,
        //   currentTime: localProgress.current_time
        // });
        return localProgress;
      }
    }

    return null;
  }

  /**
   * 保存播放进度（同时保存到API和本地缓存）
   * @param audiobookId 有声小说ID
   * @param fileId 文件ID
   * @param currentTime 当前播放时间
   * @param duration 音频总时长
   * @param forceSave 强制保存（忽略验证）
   */
  async saveProgress(
    audiobookId: string,
    fileId: string,
    currentTime: number,
    duration: number,
    forceSave: boolean = false
  ): Promise<void> {
    try {
      // 验证参数
      if (!audiobookId || !fileId) {
        console.warn('[ProgressManager] 保存进度失败：缺少必要参数', { audiobookId, fileId });
        return;
      }

      // 如果不是强制保存，进行基本验证
      if (!forceSave) {
        if (duration <= 0 || currentTime < 0 || currentTime > duration) {
          console.warn('[ProgressManager] 保存进度失败：参数无效', {
            audiobookId,
            fileId,
            currentTime,
            duration
          });
          return;
        }
      }

      const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
      const now = new Date().toISOString();

      const progressData: AudiobookProgress = {
        audiobook_id: audiobookId,
        file_id: fileId,
        current_time: currentTime,
        duration: duration,
        progress: progressPercent,
        last_played_at: now
      };



      // 保存到API
      await api.post(`/audiobooks/${audiobookId}/progress`, {
        fileId,
        currentTime,
        duration
      });

      // 更新内存缓存
      this.cache.set(audiobookId, progressData);

      // 保存到本地缓存
      this.saveToLocalCache(audiobookId, progressData);


    } catch (error) {
      console.error('[ProgressManager] 保存进度失败', error, { audiobookId, fileId });

      // API保存失败时，至少保存到本地缓存
      try {
        const progressData: AudiobookProgress = {
          audiobook_id: audiobookId,
          file_id: fileId,
          current_time: currentTime,
          duration: duration,
          progress: duration > 0 ? (currentTime / duration) * 100 : 0,
          last_played_at: new Date().toISOString()
        };
        this.saveToLocalCache(audiobookId, progressData);
      } catch (cacheError) {
        console.error('[ProgressManager] 本地缓存保存也失败', cacheError);
      }
    }
  }

  /**
   * 获取指定文件的播放进度
   * @param audiobookId 有声小说ID
   * @param fileId 文件ID
   * @returns 指定文件的播放时间，如果不是当前文件返回0
   */
  async getFileProgress(audiobookId: string, fileId: string): Promise<number> {
    const progress = await this.getProgress(audiobookId);
    if (progress && progress.file_id === fileId) {
      // 如果进度已接近完成（>=99.9%），从头开始播放
      const progressPercent = progress.duration > 0 ? (progress.current_time / progress.duration) * 100 : 0;
      if (progressPercent >= 99.9) {

        return 0;
      }
      return progress.current_time;
    }
    return 0;
  }

  /**
   * 清除指定有声小说的进度缓存
   * @param audiobookId 有声小说ID
   */
  clearCache(audiobookId: string): void {
    this.cache.delete(audiobookId);
    localStorage.removeItem(`audiobook_progress_${audiobookId}`);
    // console.log('[ProgressManager] 已清除进度缓存', { audiobookId });
  }

  /**
   * 同步所有本地缓存到服务器（离线状态恢复后使用）
   */
  async syncAllLocalProgress(): Promise<void> {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith('audiobook_progress_'));
      // console.log('[ProgressManager] 开始同步本地进度到服务器', { count: keys.length });

      for (const key of keys) {
        try {
          const audiobookId = key.replace('audiobook_progress_', '');
          const localData = this.getFromLocalCache(audiobookId);

          if (localData) {
            await this.saveProgress(
              audiobookId,
              localData.file_id,
              localData.current_time,
              localData.duration,
              true // 强制保存
            );
          }
        } catch (error) {
          console.error('[ProgressManager] 同步单个进度失败', error, { key });
        }
      }

      // console.log('[ProgressManager] 本地进度同步完成');
    } catch (error) {
      console.error('[ProgressManager] 同步本地进度失败', error);
    }
  }

  /**
   * 从本地缓存获取进度
   */
  private getFromLocalCache(audiobookId: string): AudiobookProgress | null {
    try {
      const cached = localStorage.getItem(`audiobook_progress_${audiobookId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        // 验证数据结构
        if (parsed.file_id && typeof parsed.current_time === 'number') {
          return {
            audiobook_id: audiobookId,
            file_id: parsed.file_id,
            current_time: parsed.current_time || 0,
            duration: parsed.duration || 0,
            progress: parsed.progress || 0,
            last_played_at: parsed.last_played_at || new Date().toISOString()
          };
        }
      }
    } catch (error) {
      console.error('[ProgressManager] 从本地缓存获取进度失败', error);
    }
    return null;
  }

  /**
   * 保存到本地缓存
   */
  private saveToLocalCache(audiobookId: string, progress: AudiobookProgress): void {
    try {
      const cacheData: LocalProgressCache = {
        file_id: progress.file_id,
        current_time: progress.current_time,
        duration: progress.duration,
        progress: progress.progress,
        last_played_at: progress.last_played_at
      };
      localStorage.setItem(`audiobook_progress_${audiobookId}`, JSON.stringify(cacheData));
    } catch (error) {
      console.error('[ProgressManager] 保存到本地缓存失败', error);
    }
  }
}

// 导出单例实例
export const audiobookProgressManager = AudiobookProgressManager.getInstance();