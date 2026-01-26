/**
 * @file events.ts
 * @description 事件类型定义
 */

import type { AudioFile } from '../types';

/**
 * 播放器事件类型
 */
export enum PlayerEventType {
  PLAY_PAUSE = 'audiobook:playPause',
  PREVIOUS = 'audiobook:previous',
  NEXT = 'audiobook:next',
  STOP = 'audiobook:stop',
  CLEAR_GLOBAL_MANAGER = 'audiobook:clearGlobalManager',
  SAVE_BEFORE_UNLOAD = 'audiobook:saveBeforeUnload',
  USER_PLAY_REQUEST = 'audiobook:userPlayRequest',
}

/**
 * 播放器事件详情
 */
export interface PlayerEventDetail {
  type: PlayerEventType;
  data?: unknown;
}

/**
 * 自定义播放器事件
 */
export class PlayerEvent extends CustomEvent<PlayerEventDetail> {
  constructor(type: PlayerEventType, detail?: PlayerEventDetail['data']) {
    super(type, {
      detail: {
        type,
        data: detail,
      },
    });
  }
}

/**
 * 文件切换事件详情
 */
export interface FileChangeEventDetail {
  fileId: string;
  file: AudioFile;
  previousFileId?: string;
}

/**
 * 进度更新事件详情
 */
export interface ProgressUpdateEventDetail {
  fileId: string;
  currentTime: number;
  duration: number;
  progress: number; // 0-100
}
