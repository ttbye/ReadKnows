/**
 * @file audio.ts
 * @description 音频 API Mock
 */

import { vi } from 'vitest';

/**
 * 创建模拟的 HTMLAudioElement
 */
export function createMockAudioElement(): HTMLAudioElement {
  const audio = document.createElement('audio') as HTMLAudioElement;
  
  // Mock 属性
  Object.defineProperty(audio, 'currentTime', {
    writable: true,
    value: 0,
  });
  
  Object.defineProperty(audio, 'duration', {
    writable: true,
    value: 0,
  });
  
  Object.defineProperty(audio, 'volume', {
    writable: true,
    value: 1,
  });
  
  Object.defineProperty(audio, 'muted', {
    writable: true,
    value: false,
  });
  
  Object.defineProperty(audio, 'playbackRate', {
    writable: true,
    value: 1,
  });
  
  Object.defineProperty(audio, 'paused', {
    writable: true,
    value: true,
  });
  
  Object.defineProperty(audio, 'ended', {
    writable: true,
    value: false,
  });
  
  Object.defineProperty(audio, 'readyState', {
    writable: true,
    value: 0,
  });
  
  Object.defineProperty(audio, 'networkState', {
    writable: true,
    value: 0,
  });
  
  Object.defineProperty(audio, 'src', {
    writable: true,
    value: '',
  });
  
  Object.defineProperty(audio, 'error', {
    writable: true,
    value: null,
  });
  
  // Mock 方法
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  audio.load = vi.fn();
  audio.addEventListener = vi.fn();
  audio.removeEventListener = vi.fn();
  
  return audio;
}

/**
 * 创建模拟的 MediaError
 */
export function createMockMediaError(code: number, message?: string): MediaError {
  return {
    code,
    message: message || `MediaError ${code}`,
  } as MediaError;
}

/**
 * 触发音频事件
 */
export function triggerAudioEvent(
  audio: HTMLAudioElement,
  eventName: string,
  eventData?: any
): void {
  const event = new Event(eventName);
  if (eventData) {
    Object.assign(event, eventData);
  }
  audio.dispatchEvent(event);
}

/**
 * 模拟音频加载完成
 */
export function simulateAudioLoaded(audio: HTMLAudioElement, duration: number = 100): void {
  Object.defineProperty(audio, 'duration', { value: duration, writable: true });
  Object.defineProperty(audio, 'readyState', { value: 4, writable: true }); // HAVE_ENOUGH_DATA
  triggerAudioEvent(audio, 'loadedmetadata');
  triggerAudioEvent(audio, 'canplay');
  triggerAudioEvent(audio, 'canplaythrough');
}

/**
 * 模拟音频播放
 */
export function simulateAudioPlay(audio: HTMLAudioElement): void {
  Object.defineProperty(audio, 'paused', { value: false, writable: true });
  triggerAudioEvent(audio, 'play');
  triggerAudioEvent(audio, 'playing');
}

/**
 * 模拟音频暂停
 */
export function simulateAudioPause(audio: HTMLAudioElement): void {
  Object.defineProperty(audio, 'paused', { value: true, writable: true });
  triggerAudioEvent(audio, 'pause');
}

/**
 * 模拟音频错误
 */
export function simulateAudioError(
  audio: HTMLAudioElement,
  errorCode: number,
  errorMessage?: string
): void {
  const error = createMockMediaError(errorCode, errorMessage);
  Object.defineProperty(audio, 'error', { value: error, writable: true });
  triggerAudioEvent(audio, 'error', { error });
}

/**
 * 模拟音频时间更新
 */
export function simulateTimeUpdate(audio: HTMLAudioElement, currentTime: number): void {
  Object.defineProperty(audio, 'currentTime', { value: currentTime, writable: true });
  triggerAudioEvent(audio, 'timeupdate');
}

/**
 * 模拟音频播放完成
 */
export function simulateAudioEnded(audio: HTMLAudioElement): void {
  Object.defineProperty(audio, 'ended', { value: true, writable: true });
  Object.defineProperty(audio, 'paused', { value: true, writable: true });
  triggerAudioEvent(audio, 'ended');
}
