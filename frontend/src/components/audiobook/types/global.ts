/**
 * @file global.ts
 * @description 全局对象类型定义
 */

import { AudioInstance } from './audio';

/**
 * 全局音频管理器接口
 */
export interface GlobalAudioManager {
  instance: AudioInstance | null;
  getInstance(): AudioInstance | null;
  setInstance(
    audiobookId: string,
    fileId: string,
    audio: HTMLAudioElement
  ): void;
  clearInstance(): void;
  stopAll?(): void; // 可选方法
  canReuse(audiobookId: string, fileId: string): boolean;
  getLastPlaybackInfo(): PlaybackInfo | null;
  tryResumePlayback(audiobookId: string, fileId: string): boolean;
}

/**
 * 播放信息
 */
export interface PlaybackInfo {
  audiobookId: string;
  fileId: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

/**
 * Window 对象扩展（包含全局音频管理器）
 */
export interface WindowWithGlobalAudioManager extends Window {
  globalAudioManager?: GlobalAudioManager;
}

/**
 * 类型守卫：检查 Window 是否包含全局音频管理器
 */
export function hasGlobalAudioManager(
  win: Window
): win is WindowWithGlobalAudioManager {
  return 'globalAudioManager' in win;
}
