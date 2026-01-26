/**
 * @file readingProgressManager.ts
 * @description 电子书阅读进度管理器 - 统一管理阅读进度的保存、读取和同步
 */

import api from './api';

export interface ReadingProgress {
  book_id: string;
  user_id: string;
  progress: number; // 0-1之间的进度百分比
  current_page?: number;
  total_pages?: number;
  chapter_index?: number;
  chapter_title?: string;
  last_read_at: string;
  reading_time?: number; // 累计阅读时间（分钟）
  created_at?: string;
  updated_at?: string;
}

export interface LocalReadingProgress {
  book_id: string;
  progress: number;
  current_page?: number;
  total_pages?: number;
  chapter_index?: number;
  chapter_title?: string;
  last_read_at: string;
  reading_time?: number;
}

/**
 * 电子书阅读进度管理器
 * 负责统一管理阅读进度的保存、读取和同步
 */
export class ReadingProgressManager {
  private static instance: ReadingProgressManager;
  private cache: Map<string, ReadingProgress> = new Map();
  private syncQueue: ReadingProgress[] = [];
  private isOnline = navigator.onLine;

  private constructor() {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingProgress();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  static getInstance(): ReadingProgressManager {
    if (!ReadingProgressManager.instance) {
      ReadingProgressManager.instance = new ReadingProgressManager();
    }
    return ReadingProgressManager.instance;
  }

  /**
   * 获取电子书的阅读进度
   * @param bookId 书籍ID
   * @returns 阅读进度数据
   */
  async getProgress(bookId: string): Promise<ReadingProgress | null> {
    // 先检查缓存
    if (this.cache.has(bookId)) {
      return this.cache.get(bookId)!;
    }

    try {
      // 尝试从服务器获取
      const response = await api.get(`/reading-progress/${bookId}`);
      const serverProgress = response.data;

      if (serverProgress) {
        this.cache.set(bookId, serverProgress);
        return serverProgress;
      }
    } catch (error) {
      console.warn('获取服务器阅读进度失败:', error);
    }

    // 如果服务器获取失败，尝试从本地存储获取
    try {
      const localProgress = this.getLocalProgress(bookId);
      if (localProgress) {
        return localProgress;
      }
    } catch (error) {
      console.warn('获取本地阅读进度失败:', error);
    }

    return null;
  }

  /**
   * 保存阅读进度
   * @param progress 阅读进度数据
   */
  async saveProgress(progress: Omit<ReadingProgress, 'user_id' | 'created_at' | 'updated_at'>): Promise<void> {
    const progressData: ReadingProgress = {
      ...progress,
      user_id: '', // 由后端设置
      last_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 更新缓存
    this.cache.set(progress.book_id, progressData);

    // 保存到本地存储作为备份
    this.saveLocalProgress(progressData);

    // 如果在线，同步到服务器
    if (this.isOnline) {
      try {
        await this.syncToServer(progressData);
      } catch (error) {
        console.warn('同步阅读进度到服务器失败:', error);
        // 加入同步队列，稍后重试
        this.syncQueue.push(progressData);
      }
    } else {
      // 离线时加入同步队列
      this.syncQueue.push(progressData);
    }
  }

  /**
   * 同步待处理的进度到服务器
   */
  private async syncPendingProgress(): Promise<void> {
    if (!this.isOnline || this.syncQueue.length === 0) return;

    const pendingProgress = [...this.syncQueue];
    this.syncQueue = [];

    for (const progress of pendingProgress) {
      try {
        await this.syncToServer(progress);
      } catch (error) {
        console.warn('同步待处理进度失败:', error);
        // 重新加入队列
        this.syncQueue.push(progress);
      }
    }
  }

  /**
   * 同步进度到服务器
   */
  private async syncToServer(progress: ReadingProgress): Promise<void> {
    await api.post('/reading-progress', {
      book_id: progress.book_id,
      progress: progress.progress,
      current_page: progress.current_page,
      total_pages: progress.total_pages,
      chapter_index: progress.chapter_index,
      chapter_title: progress.chapter_title,
      reading_time: progress.reading_time,
    });
  }

  /**
   * 从本地存储获取阅读进度
   */
  private getLocalProgress(bookId: string): ReadingProgress | null {
    try {
      const saved = localStorage.getItem(`reading_progress_${bookId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn('读取本地阅读进度失败:', error);
    }
    return null;
  }

  /**
   * 保存阅读进度到本地存储
   */
  private saveLocalProgress(progress: ReadingProgress): void {
    try {
      localStorage.setItem(`reading_progress_${progress.book_id}`, JSON.stringify(progress));
    } catch (error) {
      console.warn('保存本地阅读进度失败:', error);
    }
  }

  /**
   * 获取用户的阅读统计
   */
  async getReadingStats(userId?: string): Promise<{
    total_books: number;
    total_reading_time: number;
    average_progress: number;
    recent_reads: ReadingProgress[];
  }> {
    try {
      const response = await api.get('/reading-progress/stats');
      return response.data;
    } catch (error) {
      console.warn('获取阅读统计失败:', error);
      return {
        total_books: 0,
        total_reading_time: 0,
        average_progress: 0,
        recent_reads: [],
      };
    }
  }

  /**
   * 获取用户的阅读历史
   */
  async getReadingHistory(limit = 20): Promise<ReadingProgress[]> {
    try {
      const response = await api.get(`/reading-progress/history?limit=${limit}`);
      return response.data || [];
    } catch (error) {
      console.warn('获取阅读历史失败:', error);
      return [];
    }
  }

  /**
   * 分享阅读进度到群组
   */
  async shareProgress(bookId: string, groupId: string, message?: string): Promise<void> {
    const progress = await this.getProgress(bookId);
    if (!progress) {
      throw new Error('未找到阅读进度');
    }

    const progressMessage = {
      book_id: bookId,
      progress: progress.progress,
      current_page: progress.current_page,
      total_pages: progress.total_pages,
      chapter_title: progress.chapter_title,
      reading_time: progress.reading_time,
      message: message || `我正在阅读《${progress.chapter_title || '书籍'}》，进度 ${(progress.progress * 100).toFixed(1)}%`,
    };

    await api.post('/messages', {
      groupId,
      content: JSON.stringify(progressMessage),
      messageType: 'reading_progress',
    });
  }
}

// 导出单例实例
export const readingProgressManager = ReadingProgressManager.getInstance();