/**
 * @file audiobookStore.ts
 * @description 全局有声小说播放状态管理
 */

import { create } from 'zustand';

interface AudioFile {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_order: number;
  duration?: number;
}

type CenterButtonMode = 'audiobook' | 'reading' | null;

interface AudiobookState {
  // 播放状态
  isPlaying: boolean;
  currentFileId: string | null;
  audiobookId: string | null;
  audiobookTitle: string | null;
  audiobookAuthor?: string;
  audiobookCover?: string;
  files: AudioFile[];
  currentTime: number;
  duration: number;
  
  // 播放器显示状态
  showPlayer: boolean;
  showMiniPlayer: boolean; // 导航栏迷你播放器
  
  // 中间按钮模式：'audiobook' 表示有声小说模式，'reading' 表示阅读模式，null 表示未设置
  centerButtonMode: CenterButtonMode;
  
  // 控制方法
  setPlaying: (playing: boolean) => void;
  setCurrentFile: (fileId: string) => void;
  setAudiobook: (data: {
    audiobookId: string;
    audiobookTitle: string;
    audiobookAuthor?: string;
    audiobookCover?: string;
    files: AudioFile[];
    initialFileId: string;
  }) => void;
  setProgress: (currentTime: number, duration: number) => void;
  setShowPlayer: (show: boolean) => void;
  setShowMiniPlayer: (show: boolean) => void;
  setCenterButtonMode: (mode: CenterButtonMode) => void;
  reset: () => void;
  
  // 播放控制方法（通过事件系统调用，避免在 store 中存储函数引用）
  // 使用 window 事件来触发播放控制，避免 Hook 顺序问题
}

export const useAudiobookStore = create<AudiobookState>((set) => ({
  isPlaying: false,
  currentFileId: null,
  audiobookId: null,
  audiobookTitle: null,
  audiobookAuthor: undefined,
  audiobookCover: undefined,
  files: [],
  currentTime: 0,
  duration: 0,
  showPlayer: false,
  showMiniPlayer: false,
  centerButtonMode: null,
  
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentFile: (fileId) => set({ currentFileId: fileId }),
  setAudiobook: (data) => set({
    audiobookId: data.audiobookId,
    audiobookTitle: data.audiobookTitle,
    audiobookAuthor: data.audiobookAuthor,
    audiobookCover: data.audiobookCover,
    files: data.files,
    currentFileId: data.initialFileId,
    // 设置有声小说时，自动设置中间按钮模式为 'audiobook'
    centerButtonMode: 'audiobook',
  }),
  setProgress: (currentTime, duration) => set({ currentTime, duration }),
  setShowPlayer: (show) => set({ showPlayer: show }),
  setShowMiniPlayer: (show) => set({ showMiniPlayer: show }),
  setCenterButtonMode: (mode) => set({ centerButtonMode: mode }),
  reset: () => set({
    isPlaying: false,
    currentFileId: null,
    audiobookId: null,
    audiobookTitle: null,
    audiobookAuthor: undefined,
    audiobookCover: undefined,
    files: [],
    currentTime: 0,
    duration: 0,
    showPlayer: false,
    showMiniPlayer: false,
    // 重置时不改变 centerButtonMode，保持用户的操作意图
    // centerButtonMode: null,
  }),
}));
