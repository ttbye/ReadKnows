/**
 * @file playerReducer.ts
 * @description 播放器状态管理 Reducer
 */

import { PlayerState, PlayerAction, PlayerActionType } from './types';

/**
 * 播放器初始状态
 */
export const createInitialState = (initialFileId: string, isPageMode: boolean): PlayerState => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
  isLoading: false,
  currentFileId: initialFileId,
  sleepTimer: null,
  isLooping: false,
  showPlaylist: isPageMode, // 页面模式默认显示列表
  showChapters: false,
  showVolumeSlider: false,
  showSleepTimer: false,
});

/**
 * 播放器状态 Reducer
 */
export function playerReducer(state: PlayerState, action: PlayerActionType): PlayerState {
  switch (action.type) {
    case PlayerAction.SET_PLAYING:
      return {
        ...state,
        isPlaying: action.payload,
      };

    case PlayerAction.SET_PAUSED:
      return {
        ...state,
        isPlaying: false,
      };

    case PlayerAction.SET_CURRENT_TIME:
      return {
        ...state,
        currentTime: action.payload,
      };

    case PlayerAction.SET_DURATION:
      return {
        ...state,
        duration: action.payload,
      };

    case PlayerAction.SET_VOLUME:
      return {
        ...state,
        volume: action.payload,
        // 当音量为0时自动静音
        isMuted: action.payload === 0,
      };

    case PlayerAction.SET_MUTED:
      return {
        ...state,
        isMuted: action.payload,
      };

    case PlayerAction.SET_PLAYBACK_RATE:
      return {
        ...state,
        playbackRate: action.payload,
      };

    case PlayerAction.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    case PlayerAction.SET_CURRENT_FILE_ID:
      return {
        ...state,
        currentFileId: action.payload,
      };

    case PlayerAction.SET_SLEEP_TIMER:
      return {
        ...state,
        sleepTimer: action.payload,
      };

    case PlayerAction.SET_LOOPING:
      return {
        ...state,
        isLooping: action.payload,
      };

    case PlayerAction.SET_SHOW_PLAYLIST:
      return {
        ...state,
        showPlaylist: action.payload,
      };

    case PlayerAction.SET_SHOW_CHAPTERS:
      return {
        ...state,
        showChapters: action.payload,
      };

    case PlayerAction.SET_SHOW_VOLUME_SLIDER:
      return {
        ...state,
        showVolumeSlider: action.payload,
      };

    case PlayerAction.SET_SHOW_SLEEP_TIMER:
      return {
        ...state,
        showSleepTimer: action.payload,
      };

    case PlayerAction.RESET:
      return createInitialState(state.currentFileId, false);

    default:
      return state;
  }
}

/**
 * Action Creators - 用于创建 action 的辅助函数
 */
export const playerActions = {
  setPlaying: (isPlaying: boolean): PlayerActionType => ({
    type: PlayerAction.SET_PLAYING,
    payload: isPlaying,
  }),

  setPaused: (): PlayerActionType => ({
    type: PlayerAction.SET_PAUSED,
  }),

  setCurrentTime: (time: number): PlayerActionType => ({
    type: PlayerAction.SET_CURRENT_TIME,
    payload: time,
  }),

  setDuration: (duration: number): PlayerActionType => ({
    type: PlayerAction.SET_DURATION,
    payload: duration,
  }),

  setVolume: (volume: number): PlayerActionType => ({
    type: PlayerAction.SET_VOLUME,
    payload: volume,
  }),

  setMuted: (isMuted: boolean): PlayerActionType => ({
    type: PlayerAction.SET_MUTED,
    payload: isMuted,
  }),

  setPlaybackRate: (rate: number): PlayerActionType => ({
    type: PlayerAction.SET_PLAYBACK_RATE,
    payload: rate,
  }),

  setLoading: (isLoading: boolean): PlayerActionType => ({
    type: PlayerAction.SET_LOADING,
    payload: isLoading,
  }),

  setCurrentFileId: (fileId: string): PlayerActionType => ({
    type: PlayerAction.SET_CURRENT_FILE_ID,
    payload: fileId,
  }),

  setSleepTimer: (minutes: number | null): PlayerActionType => ({
    type: PlayerAction.SET_SLEEP_TIMER,
    payload: minutes,
  }),

  setLooping: (isLooping: boolean): PlayerActionType => ({
    type: PlayerAction.SET_LOOPING,
    payload: isLooping,
  }),

  setShowPlaylist: (show: boolean): PlayerActionType => ({
    type: PlayerAction.SET_SHOW_PLAYLIST,
    payload: show,
  }),

  setShowChapters: (show: boolean): PlayerActionType => ({
    type: PlayerAction.SET_SHOW_CHAPTERS,
    payload: show,
  }),

  setShowVolumeSlider: (show: boolean): PlayerActionType => ({
    type: PlayerAction.SET_SHOW_VOLUME_SLIDER,
    payload: show,
  }),

  setShowSleepTimer: (show: boolean): PlayerActionType => ({
    type: PlayerAction.SET_SHOW_SLEEP_TIMER,
    payload: show,
  }),

  reset: (): PlayerActionType => ({
    type: PlayerAction.RESET,
  }),
};
