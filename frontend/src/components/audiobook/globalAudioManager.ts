/**
 * @file globalAudioManager.ts
 * @description 全局音频实例管理器（单例）- 确保应用内只有一个“主有声书音频”在播放
 */

import type { GlobalAudioManager, WindowWithGlobalAudioManager } from './types';
import { stopAllRegisteredAudios } from '../../utils/audioRegistry';

// 全局音频实例管理器（单例模式，确保整个应用只有一个音频实例）
export const globalAudioManager: GlobalAudioManager = {
  instance: null,

  // 获取当前音频实例
  getInstance() {
    return this.instance;
  },

  // 设置音频实例
  setInstance(audiobookId: string, fileId: string, audio: HTMLAudioElement) {
    const oldInstance = this.instance;

    // ✅ 无论是否PWA模式，切换文件时都应该停止旧音频，确保同时只能有一个音频在播放
    if (oldInstance && oldInstance.audio) {
      const isDifferentFile = !oldInstance.fileId || oldInstance.fileId !== fileId;

      if (isDifferentFile) {
        try {
          oldInstance.audio.pause();
          oldInstance.audio.currentTime = 0;
          if (oldInstance.audio.src && oldInstance.audio.src.startsWith('blob:')) {
            URL.revokeObjectURL(oldInstance.audio.src);
          }
        } catch {
          // ignore
        }
      }
    }

    // 停止所有其他正在播放的音频（DOM 内）
    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach((audioEl) => {
        if (audioEl !== audio && !audioEl.paused) {
          try {
            audioEl.pause();
            audioEl.currentTime = 0;
          } catch {
            // ignore
          }
        }
      });
    }

    this.instance = { audiobookId, fileId, audio };
  },

  // 清除实例
  clearInstance() {
    if (this.instance && this.instance.audio) {
      try {
        this.instance.audio.pause();
        this.instance.audio.currentTime = 0;
        if (this.instance.audio.src && this.instance.audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(this.instance.audio.src);
        }
      } catch {
        // ignore
      }
    }
    this.instance = null;
  },

  // 停止所有音频（用于PWA关闭/页面切换时）
  stopAll() {
    // ✅ 先停掉所有“注册过的游离音频”（new Audio() 生成、但不在 DOM 的那种）
    stopAllRegisteredAudios({ revokeBlobUrl: true });

    // 停止当前实例
    this.clearInstance();

    // 停止所有音频元素
    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach((audioEl) => {
        if (!audioEl.paused) {
          try {
            audioEl.pause();
            audioEl.currentTime = 0;
            if (audioEl.src && audioEl.src.startsWith('blob:')) {
              URL.revokeObjectURL(audioEl.src);
            }
          } catch {
            // ignore
          }
        }
      });
    }
  },

  // 检查是否可以复用实例
  canReuse(audiobookId: string, fileId: string): boolean {
    return (
      this.instance !== null &&
      this.instance.audiobookId === audiobookId &&
      this.instance.fileId === fileId &&
      this.instance.audio !== null
    );
  },

  // 获取最后播放信息
  getLastPlaybackInfo() {
    if (!this.instance) return null;

    return {
      audiobookId: this.instance.audiobookId,
      fileId: this.instance.fileId,
      currentTime: this.instance.audio.currentTime,
      duration: this.instance.audio.duration,
      isPlaying: !this.instance.audio.paused && !this.instance.audio.ended,
    };
  },

  // 尝试恢复播放
  tryResumePlayback(audiobookId: string, fileId: string): boolean {
    if (
      this.instance &&
      this.instance.audiobookId === audiobookId &&
      this.instance.fileId === fileId &&
      this.instance.audio
    ) {
      const audio = this.instance.audio;
      if (audio.src && !audio.error && audio.readyState >= 2) {
        // 如果音频当前仍在播放，返回 true；否则返回 false
        return !audio.paused && audio.currentTime > 0;
      }
    }

    return false;
  },
};

// 暴露到 window 对象，方便全局访问
if (typeof window !== 'undefined') {
  const win = window as WindowWithGlobalAudioManager;
  win.globalAudioManager = globalAudioManager;
}

