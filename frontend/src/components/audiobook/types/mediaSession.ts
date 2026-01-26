/**
 * @file mediaSession.ts
 * @description Media Session API 类型定义
 */

/**
 * Media Session 元数据
 */
export interface MediaSessionMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: MediaImage[];
}

/**
 * Media Session 播放状态
 */
export type MediaSessionPlaybackState = 'none' | 'paused' | 'playing';

/**
 * Media Session 操作类型
 */
export type MediaSessionAction =
  | 'play'
  | 'pause'
  | 'previoustrack'
  | 'nexttrack'
  | 'seekbackward'
  | 'seekforward'
  | 'seekto'
  | 'stop';

/**
 * Media Session 操作处理器类型
 */
export type MediaSessionActionHandler = () => void;

/**
 * Media Session API 接口（扩展类型）
 */
export interface MediaSessionAPI {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null
  ): void;
}

/**
 * Navigator 扩展（包含 Media Session）
 */
export interface NavigatorWithMediaSession extends Navigator {
  mediaSession?: MediaSessionAPI;
}

/**
 * Window 扩展（包含 MediaMetadata 构造函数）
 */
export interface WindowWithMediaMetadata extends Window {
  MediaMetadata?: {
    new (init?: MediaMetadataInit): MediaMetadata;
  };
}

/**
 * 类型守卫：检查是否支持 Media Session
 */
export function isMediaSessionSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false;
  }

  const nav = navigator as NavigatorWithMediaSession;
  const win = window as WindowWithMediaMetadata;

  return (
    'mediaSession' in navigator &&
    !!nav.mediaSession &&
    !!win.MediaMetadata
  );
}

/**
 * 获取 Media Session API（如果支持）
 */
export function getMediaSession(): MediaSessionAPI | null {
  if (!isMediaSessionSupported()) {
    return null;
  }

  const nav = navigator as NavigatorWithMediaSession;
  return nav.mediaSession || null;
}

/**
 * 获取 MediaMetadata 构造函数（如果支持）
 */
export function getMediaMetadataConstructor():
  | (new (init?: MediaMetadataInit) => MediaMetadata)
  | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const win = window as WindowWithMediaMetadata;
  return win.MediaMetadata || null;
}
