/**
 * @file types.ts
 * @description 有声小说播放器类型定义（主入口文件）
 */

// 导出基础类型
export interface Chapter {
  /** 章节ID */
  id: number;
  /** 章节标题 */
  title: string;
  /** 章节开始时间（秒） */
  start: number;
  /** 章节结束时间（秒） */
  end: number;
}

export interface AudioFile {
  /** 文件ID */
  id: string;
  /** 文件名 */
  file_name: string;
  /** 文件大小（字节） */
  file_size: number;
  /** 文件类型（扩展名） */
  file_type: string;
  /** 文件顺序 */
  file_order: number;
  /** 文件时长（秒） */
  duration?: number;
  /** 章节列表 */
  chapters?: Chapter[];
}

export interface AudiobookPlayerProps {
  /** 有声小说ID */
  audiobookId: string;
  /** 有声小说标题 */
  audiobookTitle: string;
  /** 有声小说作者 */
  audiobookAuthor?: string;
  /** 有声小说封面URL */
  audiobookCover?: string;
  /** 音频文件列表 */
  files: AudioFile[];
  /** 初始文件ID */
  initialFileId: string;
  /** 初始播放时间（秒） */
  initialTime?: number;
  /** 关闭回调 */
  onClose: () => void;
  /** 文件切换回调 */
  onFileChange: (fileId: string) => void;
  /** 进度更新回调 */
  onProgressUpdate: () => void;
  /** 是否为页面模式 */
  isPageMode?: boolean;
}

/**
 * 播放器状态枚举
 */
export enum PlaybackState {
  IDLE = 'idle',
  LOADING = 'loading',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ERROR = 'error',
}

/**
 * 播放器操作枚举
 */
export enum PlayerAction {
  SET_PLAYING = 'SET_PLAYING',
  SET_PAUSED = 'SET_PAUSED',
  SET_CURRENT_TIME = 'SET_CURRENT_TIME',
  SET_DURATION = 'SET_DURATION',
  SET_VOLUME = 'SET_VOLUME',
  SET_MUTED = 'SET_MUTED',
  SET_PLAYBACK_RATE = 'SET_PLAYBACK_RATE',
  SET_LOADING = 'SET_LOADING',
  SET_CURRENT_FILE_ID = 'SET_CURRENT_FILE_ID',
  SET_SLEEP_TIMER = 'SET_SLEEP_TIMER',
  SET_LOOPING = 'SET_LOOPING',
  SET_SHOW_PLAYLIST = 'SET_SHOW_PLAYLIST',
  SET_SHOW_CHAPTERS = 'SET_SHOW_CHAPTERS',
  SET_SHOW_VOLUME_SLIDER = 'SET_SHOW_VOLUME_SLIDER',
  SET_SHOW_SLEEP_TIMER = 'SET_SHOW_SLEEP_TIMER',
  RESET = 'RESET',
}

/**
 * 播放器状态类型
 */
export interface PlayerState {
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 当前播放时间（秒） */
  currentTime: number;
  /** 总时长（秒） */
  duration: number;
  /** 音量（0-1） */
  volume: number;
  /** 是否静音 */
  isMuted: boolean;
  /** 播放速度 */
  playbackRate: number;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 当前文件ID */
  currentFileId: string;
  /** 睡眠定时器（分钟） */
  sleepTimer: number | null;
  /** 是否循环播放 */
  isLooping: boolean;
  /** 是否显示播放列表 */
  showPlaylist: boolean;
  /** 是否显示章节列表 */
  showChapters: boolean;
  /** 是否显示音量滑块 */
  showVolumeSlider: boolean;
  /** 是否显示睡眠定时器 */
  showSleepTimer: boolean;
}

/**
 * 播放器Action类型
 */
export type PlayerActionType =
  | { type: PlayerAction.SET_PLAYING; payload: boolean }
  | { type: PlayerAction.SET_PAUSED }
  | { type: PlayerAction.SET_CURRENT_TIME; payload: number }
  | { type: PlayerAction.SET_DURATION; payload: number }
  | { type: PlayerAction.SET_VOLUME; payload: number }
  | { type: PlayerAction.SET_MUTED; payload: boolean }
  | { type: PlayerAction.SET_PLAYBACK_RATE; payload: number }
  | { type: PlayerAction.SET_LOADING; payload: boolean }
  | { type: PlayerAction.SET_CURRENT_FILE_ID; payload: string }
  | { type: PlayerAction.SET_SLEEP_TIMER; payload: number | null }
  | { type: PlayerAction.SET_LOOPING; payload: boolean }
  | { type: PlayerAction.SET_SHOW_PLAYLIST; payload: boolean }
  | { type: PlayerAction.SET_SHOW_CHAPTERS; payload: boolean }
  | { type: PlayerAction.SET_SHOW_VOLUME_SLIDER; payload: boolean }
  | { type: PlayerAction.SET_SHOW_SLEEP_TIMER; payload: boolean }
  | { type: PlayerAction.RESET };

/**
 * 工具函数类型
 */
export type FormatTimeFunction = (seconds: number) => string;
export type FormatDurationFunction = (seconds?: number) => string;
export type FormatFileSizeFunction = (bytes: number) => string;

// 导出其他类型模块
export * from './types/audio';
export * from './types/mediaSession';
export * from './types/global';
export * from './types/events';
export * from './types/pwa';
