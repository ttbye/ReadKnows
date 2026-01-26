/**
 * @file audio.ts
 * @description 音频相关类型定义
 */

/**
 * 音频元素的自定义属性（用于存储事件处理器引用）
 */
export interface AudioElementWithHandlers extends HTMLAudioElement {
  __timeupdateHandler?: () => void;
  __playHandler?: () => void;
  __pauseHandler?: () => void;
  __playingHandler?: () => void;
  __loadstartHandler?: () => void;
  __loadedmetadataHandler?: () => void;
  __canplaythroughHandler?: () => void;
  __endedHandler?: () => void;
  __errorHandler?: () => void;
}

/**
 * 音频实例信息
 */
export interface AudioInstance {
  audiobookId: string;
  fileId: string;
  audio: HTMLAudioElement;
}

/**
 * 音频错误信息
 */
export interface AudioErrorInfo {
  code: number;
  message: string;
  type: AudioErrorType;
}

/**
 * 音频加载状态
 */
export enum AudioLoadState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
}

/**
 * 音频错误类型枚举
 */
export enum AudioErrorType {
  ABORTED = 'ABORTED',
  NETWORK = 'NETWORK',
  DECODE = 'DECODE',
  SRC_NOT_SUPPORTED = 'SRC_NOT_SUPPORTED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * MediaError 错误代码常量
 */
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/**
 * 音频错误代码映射
 */
export const AudioErrorCodeMap: Record<number, AudioErrorType> = {
  [MEDIA_ERR_ABORTED]: AudioErrorType.ABORTED,
  [MEDIA_ERR_NETWORK]: AudioErrorType.NETWORK,
  [MEDIA_ERR_DECODE]: AudioErrorType.DECODE,
  [MEDIA_ERR_SRC_NOT_SUPPORTED]: AudioErrorType.SRC_NOT_SUPPORTED,
};

/**
 * 获取音频错误类型
 */
export function getAudioErrorType(error: MediaError | null): AudioErrorType {
  if (!error) return AudioErrorType.UNKNOWN;
  const code = error.code;
  return AudioErrorCodeMap[code] || AudioErrorType.UNKNOWN;
}

/**
 * 类型守卫：检查音频元素是否有自定义处理器
 */
export function isAudioElementWithHandlers(
  audio: HTMLAudioElement
): audio is AudioElementWithHandlers {
  return audio instanceof HTMLAudioElement;
}
