/**
 * @file audioRegistry.ts
 * @description 全局音频注册表：用于统一暂停/停止所有通过 new Audio() 创建的音频，避免多路音频同时播放
 *
 * 说明：
 * - document.querySelectorAll('audio') 只能拿到 DOM 内的 <audio>，对 new Audio()（不挂载DOM）无效。
 * - 这个注册表用于追踪这些“游离”音频实例，提供 pause/stop 能力。
 */
/* eslint-disable no-console */

export type RegisteredAudioMeta = {
  /** 便于排查来源（可选） */
  tag?: string;
  /** 注册时间 */
  createdAt: number;
};

type RegistryState = {
  audios: Set<HTMLAudioElement>;
  meta: WeakMap<HTMLAudioElement, RegisteredAudioMeta>;
};

declare global {
  interface Window {
    __rk_audio_registry__?: RegistryState;
  }
}

function getRegistry(): RegistryState | null {
  if (typeof window === 'undefined') return null;
  if (!window.__rk_audio_registry__) {
    window.__rk_audio_registry__ = {
      audios: new Set<HTMLAudioElement>(),
      meta: new WeakMap<HTMLAudioElement, RegisteredAudioMeta>(),
    };
  }
  return window.__rk_audio_registry__;
}

export function registerAudio(audio: HTMLAudioElement, meta?: Omit<RegisteredAudioMeta, 'createdAt'>): void {
  const reg = getRegistry();
  if (!reg) return;

  reg.audios.add(audio);
  reg.meta.set(audio, { createdAt: Date.now(), ...meta });

  // 结束后自动从 registry 移除，避免泄漏
  const onEnded = () => {
    unregisterAudio(audio);
    audio.removeEventListener('ended', onEnded);
  };
  audio.addEventListener('ended', onEnded);
}

export function unregisterAudio(audio: HTMLAudioElement): void {
  const reg = getRegistry();
  if (!reg) return;
  reg.audios.delete(audio);
}

export function createRegisteredAudio(src?: string, meta?: Omit<RegisteredAudioMeta, 'createdAt'>): HTMLAudioElement {
  const audio = src ? new Audio(src) : new Audio();
  registerAudio(audio, meta);
  return audio;
}

/**
 * 暂停所有已注册音频（不重置 currentTime），可选排除某个音频
 */
export function pauseAllRegisteredAudiosExcept(except?: HTMLAudioElement | null): void {
  const reg = getRegistry();
  if (!reg) return;

  reg.audios.forEach((audio) => {
    if (!audio) return;
    if (except && audio === except) return;
    try {
      if (!audio.paused) {
        audio.pause();
      }
    } catch (e) {
      // 忽略错误，避免影响主流程
    }
  });
}

/**
 * 停止所有已注册音频（pause + 重置到 0 + 可选清理 blob URL）
 */
export function stopAllRegisteredAudios(options?: { revokeBlobUrl?: boolean }): void {
  const revokeBlobUrl = options?.revokeBlobUrl ?? true;
  const reg = getRegistry();
  if (!reg) return;

  reg.audios.forEach((audio) => {
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      if (revokeBlobUrl && audio.src && audio.src.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(audio.src);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  });
}

/**
 * 检查是否有指定tag的音频正在播放
 */
export function isAudioPlayingWithTag(tag: string): boolean {
  const reg = getRegistry();
  if (!reg) return false;

  for (const audio of reg.audios) {
    if (!audio) continue;
    try {
      const meta = reg.meta.get(audio);
      if (meta?.tag === tag && !audio.paused && !audio.ended) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * 检查TTS是否正在播放（包括tts和ai-tts标签）
 */
export function isTTSPlaying(): boolean {
  return isAudioPlayingWithTag('tts') || isAudioPlayingWithTag('ai-tts');
}

