/**
 * @file AudiobookPlayer.tsx
 * @description 有声小说播放器组件
 */

import { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, List, Hash, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getFullApiUrl, getAuthHeaders } from '../utils/api';
import { useAudiobookStore } from '../store/audiobookStore';
import {
  PlayerHeader,
  ProgressBar,
  PlayerControls,
  VolumeControl,
  SleepTimer,
  PlaybackRateControl,
  ChaptersList,
  Playlist,
  formatTime,
  formatDuration,
  formatFileSize,
  playerReducer,
  createInitialState,
  playerActions,
  type AudioElementWithHandlers,
  type GlobalAudioManager,
  type WindowWithGlobalAudioManager,
  type NavigatorWithMediaSession,
  type WindowWithMediaMetadata,
  getMediaSession,
  getMediaMetadataConstructor,
  getAudioErrorType,
  isPWAMode,
  isIOSDevice,
  isAndroidWebView,
  PlayerEventType,
  useKeyboardShortcuts,
  useFocusManagement,
  useLiveRegion,
  LiveRegionPriority,
  useErrorRecovery,
  logError,
  ErrorCategory,
  ErrorSeverity,
  AudiobookPlayerErrorBoundary,
  useTouchControls,
  useOfflineSupport,
  useBackgroundSync,
  useDeviceAPIs,
  usePlayerInitializer,
  useFileNavigation,
  useAudioEventHandlers,
  useAudioLoader,
  useAudioErrorHandler,
  useAutoPlayLogic,
  usePlaybackEndedHandler,
} from './audiobook';

// 全局音频实例管理器（单例模式，确保整个应用只有一个音频实例）
const globalAudioManager: GlobalAudioManager = {
  instance: null,
  
  // 获取当前音频实例
  getInstance() {
    return this.instance;
  },
  
  // 设置音频实例
  setInstance(audiobookId: string, fileId: string, audio: HTMLAudioElement) {
    const oldInstance = this.instance;
    
    // ✅ 修复：无论是否PWA模式，切换文件时都应该停止旧音频
    // 确保同时只能有一个音频在播放
    if (oldInstance && oldInstance.audio) {
      // 如果切换的是不同的文件（即使是同一有声小说），停止旧音频
      const isDifferentFile = !oldInstance.fileId || oldInstance.fileId !== fileId;
      
      if (isDifferentFile) {
        console.log('[globalAudioManager] 切换文件，停止旧音频', {
          oldFileId: oldInstance.fileId,
          newFileId: fileId,
          oldAudiobookId: oldInstance.audiobookId,
          newAudiobookId: audiobookId
        });
        
        // 停止旧音频
        try {
          oldInstance.audio.pause();
          oldInstance.audio.currentTime = 0;
          // 清理blob URL
          if (oldInstance.audio.src && oldInstance.audio.src.startsWith('blob:')) {
            URL.revokeObjectURL(oldInstance.audio.src);
          }
        } catch (e) {
          console.warn('[globalAudioManager] 停止旧音频失败:', e);
        }
      }
    }
    
    // ✅ 修复：停止所有其他正在播放的音频（确保同时只能有一个音频播放）
    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach((audioEl) => {
        if (audioEl !== audio && !audioEl.paused) {
          // 无论什么情况，都停止其他正在播放的音频
          try {
            console.log('[globalAudioManager] 停止其他正在播放的音频', {
              src: audioEl.src.substring(0, 50),
              currentTime: audioEl.currentTime
            });
            audioEl.pause();
            audioEl.currentTime = 0;
          } catch (e) {
            console.warn('[globalAudioManager] 停止其他音频失败:', e);
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
      } catch (e) {
        console.warn('[globalAudioManager] 清理音频失败:', e);
      }
    }
    this.instance = null;
  },
  
  // 停止所有音频（用于PWA关闭时）
  stopAll() {
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
            // 清理blob URL
            if (audioEl.src && audioEl.src.startsWith('blob:')) {
              URL.revokeObjectURL(audioEl.src);
            }
          } catch (e) {
            console.warn('[globalAudioManager] 停止音频失败:', e);
          }
        }
      });
    }
  },
  
  // 检查是否可以复用实例
  canReuse(audiobookId: string, fileId: string): boolean {
    return this.instance !== null && 
           this.instance.audiobookId === audiobookId && 
           this.instance.fileId === fileId &&
           this.instance.audio !== null;
  },
  
  // ✅ 新增：获取最后播放的音频信息
  getLastPlaybackInfo() {
    if (!this.instance) return null;
    
    return {
      audiobookId: this.instance.audiobookId,
      fileId: this.instance.fileId,
      currentTime: this.instance.audio.currentTime,
      duration: this.instance.audio.duration,
      isPlaying: !this.instance.audio.paused && !this.instance.audio.ended
    };
  },
  
  // ✅ 新增：尝试恢复播放
  tryResumePlayback(audiobookId: string, fileId: string): boolean {
    if (this.instance && 
        this.instance.audiobookId === audiobookId && 
        this.instance.fileId === fileId &&
        this.instance.audio) {
      
      const audio = this.instance.audio;
      
      // 检查音频是否仍然有效
      if (audio.src && !audio.error && audio.readyState >= 2) {
        console.log('[globalAudioManager] 恢复音频实例', {
          audiobookId,
          fileId,
          currentTime: audio.currentTime,
          duration: audio.duration
        });
        
        // 恢复播放状态
        if (!audio.paused && audio.currentTime > 0) {
          return true; // 已经在播放
        }
        
        return false;
      }
    }
    
    return false;
  }
};

// 暴露到window对象，方便全局访问
if (typeof window !== 'undefined') {
  const win = window as WindowWithGlobalAudioManager;
  win.globalAudioManager = globalAudioManager;
}

// 类型定义已移至 ./audiobook/types.ts
import type { AudiobookPlayerProps } from './audiobook/types';

/**
 * 有声小说播放器组件（内部实现）
 */
function AudiobookPlayerInternal({
  audiobookId,
  audiobookTitle,
  audiobookAuthor,
  audiobookCover,
  files,
  initialFileId,
  initialTime = 0,
  onClose,
  onFileChange,
  onProgressUpdate,
  isPageMode = false,
}: AudiobookPlayerProps) {
  const { t } = useTranslation();
  
  // ✅ 使用 useReducer 管理播放器状态
  const [playerState, dispatch] = useReducer(
    playerReducer,
    { initialFileId, isPageMode },
    ({ initialFileId, isPageMode }) => createInitialState(initialFileId, isPageMode)
  );

  // 从 state 中解构常用状态
  const {
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isLoading,
    currentFileId,
    sleepTimer,
    isLooping,
    showPlaylist,
    showChapters,
    showVolumeSlider,
    showSleepTimer,
  } = playerState;

  // 保留一些独立的状态（不属于播放器核心状态）
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false); // ✅ 新增：标记是否已初始化，避免重复初始化
  const [isInitializing, setIsInitializing] = useState(false); // ✅ 新增：标记是否正在初始化
  const initializationCompleteRef = useRef(false); // ✅ 新增：标记初始化是否完成（使用ref避免闭包问题）
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null); // ✅ 新增：选中的文件ID（用于区分选中和播放状态）
  const [fileProgresses, setFileProgresses] = useState<{ [fileId: string]: { file_id: string; current_time: number; duration: number; progress: number; last_played_at: string } }>({}); // ✅ 新增：所有文件的播放进度
  
  // 同步 autoPlayNext 状态到 ref
  useEffect(() => {
    autoPlayNextRef.current = autoPlayNext;
  }, [autoPlayNext]);

  // ✅ 同步当前播放文件ID到选中状态
  useEffect(() => {
    if (currentFileId) {
      setSelectedFileId(currentFileId);
    }
  }, [currentFileId]);

  // ✅ 获取所有文件的播放进度
  useEffect(() => {
    if (!audiobookId) return;

    const fetchAllFileProgresses = async () => {
      try {
        const response = await api.get(`/audiobooks/${audiobookId}/progress/all`);
        if (response.data.success && response.data.progress) {
          setFileProgresses(response.data.progress);
          // console.log('[AudiobookPlayer] 获取所有文件进度成功', {
          //   audiobookId,
          //   progressCount: Object.keys(response.data.progress).length
          // });
        }
      } catch (error) {
        console.warn('[AudiobookPlayer] 获取所有文件进度失败:', error);
        // 忽略错误，不影响播放器正常工作
      }
    };

    fetchAllFileProgresses();
  }, [audiobookId]);

  // ✅ 辅助函数：简化 dispatch 调用
  const setPlayerPlaying = useCallback((playing: boolean) => {
    dispatch(playerActions.setPlaying(playing));
  }, []);

  const setPaused = useCallback(() => {
    dispatch(playerActions.setPaused());
  }, []);

  const setCurrentTimeState = useCallback((time: number) => {
    dispatch(playerActions.setCurrentTime(time));
  }, []);

  const setDurationState = useCallback((dur: number) => {
    dispatch(playerActions.setDuration(dur));
  }, []);

  const setVolumeState = useCallback((vol: number) => {
    dispatch(playerActions.setVolume(vol));
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    dispatch(playerActions.setMuted(muted));
  }, []);

  const setPlaybackRateState = useCallback((rate: number) => {
    dispatch(playerActions.setPlaybackRate(rate));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch(playerActions.setLoading(loading));
  }, []);

  const setCurrentFileIdState = useCallback((fileId: string) => {
    dispatch(playerActions.setCurrentFileId(fileId));
  }, []);

  const setSleepTimerState = useCallback((minutes: number | null) => {
    dispatch(playerActions.setSleepTimer(minutes));
  }, []);

  const setLooping = useCallback((looping: boolean) => {
    dispatch(playerActions.setLooping(looping));
  }, []);

  const setShowPlaylistState = useCallback((show: boolean) => {
    dispatch(playerActions.setShowPlaylist(show));
  }, []);

  const setShowChaptersState = useCallback((show: boolean) => {
    dispatch(playerActions.setShowChapters(show));
  }, []);

  const setShowVolumeSliderState = useCallback((show: boolean) => {
    dispatch(playerActions.setShowVolumeSlider(show));
  }, []);

  const setShowSleepTimerState = useCallback((show: boolean) => {
    dispatch(playerActions.setShowSleepTimer(show));
  }, []);

  // 更新 Media Session API（用于后台播放控制）
  // 注意：这个函数在 handlePrevious 和 handleNext 之后定义，使用 ref 避免循环依赖
  const updateMediaSessionRef = useRef<() => void>();
  const saveProgressRef = useRef<((time: number, totalDuration: number, explicitFileId?: string, forceSave?: boolean, isSwitchingFile?: boolean) => Promise<void>) | null>(null);
  
  const updateMediaSession = useCallback(() => {
    // 某些 Android WebView 不完全支持 Media Session / MediaMetadata，
    // 这里做一次全面能力检测，避免在不支持的环境中直接报错导致整个页面白屏
    try {
      const mediaSession = getMediaSession();
      const MediaMetadataCtor = getMediaMetadataConstructor();
      
      if (!mediaSession || !MediaMetadataCtor) {
        // 环境不支持 Media Session，直接跳过，不影响正常播放
        return;
      }

      const currentIndex = files.findIndex(f => f.id === currentFileId);
      const currentFile = files[currentIndex];
      
      // 设置元数据
      mediaSession.metadata = new MediaMetadataCtor({
        title: currentFile?.file_name || audiobookTitle || '未知',
        artist: audiobookAuthor || '未知作者',
        album: audiobookTitle || '有声小说',
        artwork: audiobookCover ? [
          { src: audiobookCover, sizes: '512x512', type: 'image/png' }
        ] : []
      });
      
      // 设置播放状态
      mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      
      // 设置操作处理程序
      mediaSession.setActionHandler('play', () => {
        if (audioRef.current && !isPlaying) {
          // ✅ 修复：iOS PWA模式下，如果设置了自动播放标志，清除它（因为用户已手动播放）
          const pwaMode = isPWAMode();
          const ios = isIOSDevice();
          if (pwaMode && ios && autoPlayNextRef.current) {
            // console.log('[AudiobookPlayer] iOS PWA模式：用户通过Media Session播放，清除自动播放标志');
            setAutoPlayNext(false);
            autoPlayNextRef.current = false;
          }
          
          audioRef.current.play().then(() => {
            setPlayerPlaying(true);
            updateMediaSessionRef.current?.();
          }).catch(() => {
            // 忽略后台播放失败
          });
        }
      });
      
      mediaSession.setActionHandler('pause', () => {
        if (audioRef.current && isPlaying) {
          // ✅ 新增：暂停时立即保存播放进度和last_file_id
          if (audioRef.current.duration > 0 && currentFileId && saveProgressRef.current) {
            const currentTime = audioRef.current.currentTime;
            const duration = audioRef.current.duration;
            // console.log('[AudiobookPlayer] Media Session暂停：立即保存播放进度', {
            //   fileId: currentFileId,
            //   currentTime,
            //   duration
            // });
            saveProgressRef.current(currentTime, duration, currentFileId).catch(e => {
              console.error('[AudiobookPlayer] Media Session暂停时保存进度失败', e);
            });
          }
          
          audioRef.current.pause();
          setPaused();
          updateMediaSessionRef.current?.();
        }
      });
      
      mediaSession.setActionHandler('previoustrack', () => {
        if (currentIndex > 0) {
          window.dispatchEvent(new CustomEvent('audiobook:previous'));
        }
      });
      
      mediaSession.setActionHandler('nexttrack', () => {
        if (currentIndex < files.length - 1) {
          // ✅ 修复：iOS PWA模式下，通过Media Session触发下一首时，设置自动播放标志
          const pwaMode = isPWAMode();
          const ios = isIOSDevice();
          
          if (pwaMode && ios) {
            // iOS PWA模式下，Media Session的nexttrack事件是用户交互，可以自动播放
            autoPlayNextRef.current = true;
            setAutoPlayNext(true);
          }
          window.dispatchEvent(new CustomEvent('audiobook:next'));
        }
      });
      
      // ✅ 修复：在播放完成时，通过Media Session API自动触发下一首
      // 某些系统会在播放完成时自动调用nexttrack
      // 但为了确保可靠性，我们也在ended事件中处理
      
      // 添加stop操作处理程序，确保可以停止播放
      try {
        mediaSession.setActionHandler('stop', () => {
          window.dispatchEvent(new CustomEvent('audiobook:stop'));
        });
      } catch {
        // 某些浏览器可能不支持stop操作
      }
      
      // 清除不支持的操作
      try {
        mediaSession.setActionHandler('seekbackward', null);
        mediaSession.setActionHandler('seekforward', null);
        mediaSession.setActionHandler('seekto', null);
      } catch {
        // 忽略不支持的操作
      }
    } catch (err) {
      // 任何 Media Session 相关错误都不应该影响有声小说页面的正常显示
      console.warn('[AudiobookPlayer] Media Session 初始化失败:', err);
    }
  }, [isPlaying, currentFileId, files, audiobookTitle, audiobookAuthor, audiobookCover, setPaused, setPlayerPlaying, setAutoPlayNext]);
  
  // 保存 updateMediaSession 到 ref
  updateMediaSessionRef.current = updateMediaSession;

  // 监听播放状态变化，更新 Media Session
  useEffect(() => {
    updateMediaSession();
  }, [isPlaying, currentFileId, updateMediaSession]);

  // 监听页面可见性变化，确保后台播放正常
  // 注意：只有在明确需要后台播放时才自动恢复，如果用户主动停止则不恢复
  const shouldAutoResumeRef = useRef(true); // 是否应该自动恢复播放
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏时，只有在允许自动恢复且音频确实在播放时才恢复
        if (shouldAutoResumeRef.current && audioRef.current && isPlaying && audioRef.current.paused) {
          audioRef.current.play().catch((e) => {
            console.warn('后台播放失败:', e);
          });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);
  
  // 当停止播放时，禁用自动恢复
  useEffect(() => {
    if (!isPlaying) {
      shouldAutoResumeRef.current = false;
    } else {
      shouldAutoResumeRef.current = true;
    }
  }, [isPlaying]);
  // showChapters 和 showVolumeSlider 已移至 playerState

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSaveTimeRef = useRef<number>(0); // 上次保存进度的时间戳
  const saveProgressTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 防抖定时器
  const autoPlayNextRef = useRef<boolean>(false); // 使用 ref 存储自动播放标志，确保在闭包中能访问最新值
  const isLoopingRef = useRef<boolean>(false); // 循环播放状态ref（用于在事件监听器中访问最新状态）
  const shouldAutoPlayOnLoadRef = useRef<boolean>(false); // 标记是否是用户主动点击播放（用于首次加载时自动播放）
  const togglePlayRef = useRef<(() => Promise<void>) | null>(null); // 存储 togglePlay 函数，供 handlePlaybackEnded 使用
  const userManuallySeekedRef = useRef<boolean>(false); // 标记用户是否手动拖动过进度条，如果拖动过就不再自动恢复保存的进度
  const previousFileIdRef = useRef<string | null>(null); // ✅ 修复：保存上一个文件ID，避免状态更新导致的时序问题
  const loggedPlayFilesRef = useRef<Set<string>>(new Set()); // 已记录播放日志的文件
  
  // ✅ 无障碍性：屏幕阅读器实时区域
  const { announce } = useLiveRegion(LiveRegionPriority.POLITE);
  
  // ✅ 无障碍性：焦点管理
  const { trapFocus } = useFocusManagement(true, {
    autoFocusOnOpen: !isPageMode, // 页面模式下不自动聚焦
    restoreFocusOnClose: !isPageMode,
    closeButtonSelector: '[data-close-button]',
  });
  
  // ✅ 无障碍性：焦点陷阱
  useEffect(() => {
    if (containerRef.current && !isPageMode) {
      return trapFocus(containerRef);
    }
  }, [trapFocus, isPageMode]);
  
  // ✅ 错误恢复：错误恢复Hook
  const { handleAudioError, handleNetworkError, handlePWAError, resetRetryCount } = useErrorRecovery({
    maxRetries: 3,
    retryDelay: 1000,
    autoRecover: true,
  });
  
  // ✅ PWA/移动端优化：离线支持
  const { saveOfflineState, loadOfflineState, clearOfflineState, isOnline } = useOfflineSupport(
    audiobookId,
    {
      enabled: true,
      cacheExpiration: 24 * 60 * 60 * 1000, // 24小时
    }
  );
  
  // ✅ PWA/移动端优化：设备API
  const {
    showNotification,
    requestWakeLock,
    releaseWakeLock,
    isWakeLockActive,
  } = useDeviceAPIs({
    enableNotifications: true,
    enableWakeLock: isPageMode, // 仅在页面模式下启用唤醒锁定
    enableOrientationLock: false,
    enableSensors: false,
  });
  
  // 记录有声小说播放日志
  const logAudiobookAction = useCallback(async (
    actionType: 'audiobook_play' | 'audiobook_progress' | 'audiobook_complete',
    fileId: string,
    metadata?: any
  ) => {
    try {
      await api.post('/logs', {
        action_type: actionType,
        action_category: 'audiobook',
        description: `${audiobookTitle || '未知有声小说'} - ${actionType === 'audiobook_play' ? '开始播放' :
                    actionType === 'audiobook_progress' ? '播放进度更新' : '播放完成'}`,
        metadata: {
          audiobook_id: audiobookId,
          audiobook_title: audiobookTitle,
          audiobook_author: audiobookAuthor,
          file_id: fileId,
          ...metadata
        }
      });
    } catch (error) {
      console.warn('[AudiobookPlayer] 记录播放日志失败:', error);
      // 不影响播放功能
    }
  }, [audiobookId, audiobookTitle, audiobookAuthor]);

  // 保存播放进度（必须在 usePlaybackEndedHandler 之前定义，因为它会被使用）
  // ✅ 修复：增强saveProgress函数，确保last_file_id正确更新
  const saveProgress = useCallback(async (
    time: number,
    totalDuration: number,
    explicitFileId?: string,
    forceSave: boolean = false,
    isSwitchingFile: boolean = false // ✅ 新增参数：是否在切换文件
  ) => {
    // ✅ 修复：优先使用显式传入的fileId，如果没有则使用currentFileId
    const targetFileId = explicitFileId || currentFileId;
    
    if (!audiobookId || !targetFileId) {
      console.warn('[AudiobookPlayer] 保存进度失败：缺少必要参数', { 
        audiobookId, 
        targetFileId,
        explicitFileId,
        currentFileId 
      });
      return;
    }
    
    try {
      // ✅ 修复：如果forceSave为true，直接使用传入的参数（不从audioRef获取，因为此时audioRef可能还是旧文件）
      // 否则，确保使用最新的播放时间（从audioRef获取，而不是依赖传入的参数）
      const actualTime = forceSave ? time : (audioRef.current?.currentTime ?? time);
      const actualDuration = forceSave ? totalDuration : (audioRef.current?.duration ?? totalDuration);
      
      // ✅ 修复：切换文件时（forceSave=true 且 time=0, duration=0），使用 updateLastFileIdOnly 只更新 last_file_id
      const isSwitchingFileOnly = forceSave && time === 0 && totalDuration === 0;
      
      if (isSwitchingFileOnly) {
        
        await api.post(`/audiobooks/${audiobookId}/progress`, {
          fileId: targetFileId,
          currentTime: 0,
          duration: 0,
          updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id，不创建或更新进度记录
        });
        
        // ✅ 修复：同步更新本地缓存，确保缓存与后端 last_file_id 一致
        try {
          saveOfflineState(targetFileId, 0, 0);
        } catch (cacheError) {
          console.warn('[AudiobookPlayer] 更新本地缓存失败（不影响主流程）', cacheError);
        }
        
        onProgressUpdate();
        return;
      }
      
      // ✅ 修复：切换文件时强制保存（即使duration为0），主要目的是更新last_file_id
      if (forceSave || isSwitchingFile || (actualDuration > 0 && actualTime >= 0 && actualTime <= actualDuration)) {
        
        await api.post(`/audiobooks/${audiobookId}/progress`, {
          fileId: targetFileId,
          currentTime: actualTime,
          duration: actualDuration,
          clientTimestamp: Date.now(), // 添加客户端时间戳，用于并发控制
        });

        // 调试日志：每次保存进度时记录详细信息
        console.log('🎵 [有声小说调试] 保存进度:', {
          audiobookId,
          fileId: targetFileId,
          currentTime: actualTime,
          duration: actualDuration,
          progressPercent: actualDuration > 0 ? ((actualTime / actualDuration) * 100).toFixed(2) + '%' : '0%'
        });
        
        
        // ✅ 修复：同步更新本地缓存，确保缓存与后端 last_file_id 一致
        try {
          saveOfflineState(targetFileId, actualTime, actualDuration);
        } catch (cacheError) {
          console.warn('[AudiobookPlayer] 更新本地缓存失败（不影响主流程）', cacheError);
        }

        // ✅ 更新fileProgresses状态，确保播放列表中的进度条实时更新
        const progressPercent = actualDuration > 0 ? (actualTime / actualDuration) * 100 : 0;
        setFileProgresses(prev => ({
          ...prev,
          [targetFileId]: {
            file_id: targetFileId,
            current_time: actualTime,
            duration: actualDuration,
            progress: progressPercent,
            last_played_at: new Date().toISOString(),
          }
        }));

        // 仅记录「开始播放」「播放完成」，不记录播放进度更新（避免日志过多）
        onProgressUpdate();
      } else {
        // console.warn('[AudiobookPlayer] 跳过无效的进度保存', {
        //   actualTime,
        //   actualDuration,
        //   fileId: targetFileId,
        //   audiobookId,
        //   forceSave,
        //   isSwitchingFile
        // });
      }
    } catch (error: any) {
      console.error('[AudiobookPlayer] 保存进度失败:', error, {
        audiobookId,
        fileId: targetFileId,
        forceSave,
        isSwitchingFile
      });
    }
  }, [audiobookId, currentFileId, onProgressUpdate, saveOfflineState]);
  
  // ✅ 修复：将 saveProgress 保存到 ref，供 updateMediaSession 使用
  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);
  
  // ✅ 重构：使用 usePlaybackEndedHandler Hook
  const { handlePlaybackEnded } = usePlaybackEndedHandler({
    files,
    currentFileId,
    audiobookId,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
    audioRef,
    isLoopingRef,
    autoPlayNextRef,
    setAutoPlayNext,
    setPaused,
    setPlaying: setPlayerPlaying,
    setCurrentFileId: setCurrentFileIdState,
    onFileChange,
    saveProgress,
    logAudiobookAction,
  });
  
  // ✅ 重构：播放完成处理函数ref（用于在loadAudio中设置）
  const handlePlaybackEndedRef = useRef<((fileId: string) => Promise<void>) | null>(null);
  
  // 更新ref引用
  useEffect(() => {
    handlePlaybackEndedRef.current = handlePlaybackEnded;
  }, [handlePlaybackEnded]);

  // ✅ 提前声明：预缓存管理和状态管理相关的 ref（必须在 useAudioEventHandlers 等 hooks 之前声明）
  const preloadCacheRef = useRef<Map<string, { blob: Blob; url: string; mimeType: string }>>(new Map());
  const preloadingRef = useRef<Set<string>>(new Set()); // 正在预加载的文件ID集合
  const progressUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSuccessfulLoadRef = useRef<string | null>(null); // 最后成功加载的文件ID
  const errorTimeRef = useRef<number>(0); // 错误发生的时间戳
  const pwaAudioHandlersCleanupRef = useRef<(() => void) | null>(null); // PWA音频事件处理器清理函数
  const backgroundCheckIntervalRef = useRef<NodeJS.Timeout | null>(null); // ✅ 修复：后台播放完成检测定时器

  // ✅ 性能优化：使用 useMemo 缓存计算结果（必须在 useAudioErrorHandler 等 hooks 之前声明）
  const currentFileIndex = useMemo(
    () => files.findIndex(f => f.id === currentFileId),
    [files, currentFileId]
  );

  const currentFile = useMemo(
    () => files[currentFileIndex],
    [files, currentFileIndex]
  );

  // ✅ 添加：PWA专用的音频事件处理函数（必须在 useAudioLoader 之前声明）
  const setupPWAAudioHandlers = useCallback((audio: HTMLAudioElement, fileId: string) => {
    const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
    
    if (!isPWAMode) return null;
    
    // PWA模式下添加额外的事件监听器
    const pwaErrorHandler = (e: ErrorEvent) => {
      // PWA模式下尝试自动恢复（通过重新加载音频）
      if (autoPlayNextRef.current) {
        setTimeout(() => {
          if (audioRef.current === audio && audio.error && currentFileId === fileId) {
            // 通过触发文件切换来重新加载
            onFileChange(fileId);
          }
        }, 1000);
      }
    };
    
    const pwaStalledHandler = () => {
      // console.log('[AudiobookPlayer] PWA模式音频卡顿');
      
      // PWA模式下尝试恢复播放
      if (isPlaying && audio.paused) {
        setTimeout(() => {
          if (audioRef.current === audio && audio.paused && !audio.ended) {
            audio.play().catch(e => {
              console.warn('[AudiobookPlayer] PWA模式恢复播放失败:', e);
            });
          }
        }, 500);
      }
    };
    
    audio.addEventListener('error', pwaErrorHandler as any);
    audio.addEventListener('stalled', pwaStalledHandler);
    
    return () => {
      audio.removeEventListener('error', pwaErrorHandler as any);
      audio.removeEventListener('stalled', pwaStalledHandler);
    };
  }, [currentFileId, isPlaying, onFileChange]);

  // ✅ 重构：使用 useAudioEventHandlers Hook
  const { setupAllHandlers, cleanupHandlers } = useAudioEventHandlers({
    audioRef,
    currentFileId,
    isPlaying,
    setCurrentTime: setCurrentTimeState,
    setDuration: setDurationState,
    setPlaying: setPlayerPlaying,
    setPaused,
    saveProgress: (time, duration, fileId) => {
      saveProgress(time, duration, fileId);
    },
    onPlaybackEnded: () => {
      if (handlePlaybackEndedRef.current && currentFileId) {
        handlePlaybackEndedRef.current(currentFileId);
      }
    },
    lastSaveTimeRef,
    saveProgressTimeoutRef,
    backgroundCheckIntervalRef,
  });
  
  // ✅ 重构：使用 useAudioErrorHandler Hook
  const { setupErrorHandler } = useAudioErrorHandler({
    currentFileId,
    currentFile,
    lastSuccessfulLoadRef,
    errorTimeRef,
    autoPlayNextRef,
    setLoading,
    setPaused,
    reloadAudio: (fileId: string) => {
      if (loadAudioRef.current) {
        return loadAudioRef.current(fileId, true, 0);
      }
      return Promise.resolve();
    },
  });
  
  // ✅ 重构：使用 useAutoPlayLogic Hook
  const autoPlayLogic = useAutoPlayLogic({
    audioRef,
    currentFileId,
    startTime: 0, // 将在loadAudio中动态设置
    shouldAutoPlayOnLoadRef,
    autoPlayNextRef,
    setAutoPlayNext,
    setPlaying: setPlayerPlaying,
    setPaused,
  });
  
  // ✅ 重构：使用 useAudioLoader Hook
  const audioLoader = useAudioLoader({
    audiobookId,
    files,
    currentFile,
    volume,
    isMuted,
    playbackRate,
    preloadCacheRef,
    setLoading,
    setupPWAAudioHandlers,
    pwaAudioHandlersCleanupRef,
    globalAudioManager,
  });
  
  // ✅ 新增：事件监听器清理函数（使用类型安全的接口）- 保留用于向后兼容
  const cleanupAudioEventListeners = useCallback((audio: HTMLAudioElement) => {
    cleanupHandlers(audio);
  }, [cleanupHandlers]);
  
  // ✅ PWA/移动端优化：页面可见性变化时处理同步（在 saveProgress 和 queueSync 定义之后）
  // 注意：这个 useEffect 将在后面定义，在 saveProgress 和 queueSync 之后

  // ✅ 修复：已移除 persistPWAState 和 restorePWAState 函数
  // PWA和PC端应该统一使用API获取和保存播放进度，确保数据一致性
  // localStorage缓存可能导致使用过时的进度数据，因此不再使用
  // 播放进度统一通过 usePlaybackProgress hook 中的 saveProgress 函数保存到API
  // 初始化时统一通过 usePlayerInitializer hook 中的 fetchProgressFromAPI 函数从API获取
  
  // 同步isLooping状态到ref
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);
  
  // 监听用户播放请求事件，标记需要自动播放
  useEffect(() => {
    const handleUserPlayRequest = () => {
      shouldAutoPlayOnLoadRef.current = true;
      // 延迟重置，确保 loadAudio 能读取到
      setTimeout(() => {
        shouldAutoPlayOnLoadRef.current = false;
      }, 2000);
    };
    
    window.addEventListener('audiobook:userPlayRequest', handleUserPlayRequest);
    return () => {
      window.removeEventListener('audiobook:userPlayRequest', handleUserPlayRequest);
    };
  }, []);

  
  // 全局状态管理
  const {
    isPlaying: globalIsPlaying,
    currentFileId: globalCurrentFileId,
    audiobookId: globalAudiobookId,
    currentTime: globalCurrentTime,
    duration: globalDuration,
    setPlaying,
    setCurrentFile,
    setProgress,
    setShowPlayer,
    setShowMiniPlayer,
    setAudiobook,
    reset,
  } = useAudiobookStore();

  // ✅ 性能优化：缓存进度百分比计算
  const progress = useMemo(() => {
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  }, [currentTime, duration]);

  // ✅ 性能优化：缓存当前章节计算
  const currentChapter = useMemo(() => {
    if (!currentFile?.chapters || currentFile.chapters.length === 0) {
      return null;
    }
    for (let i = currentFile.chapters.length - 1; i >= 0; i--) {
      const chapter = currentFile.chapters[i];
      if (currentTime >= chapter.start && currentTime <= chapter.end) {
        return chapter;
      }
    }
    return null;
  }, [currentFile, currentTime]);

  // 滚动到当前播放文件的辅助函数（提前定义，供 handlePrevious 和 handleNext 使用）
  // 注意：滚动逻辑已移至 Playlist 组件内部
  const scrollToCurrentFile = useCallback(() => {
    // 此函数保留用于向后兼容，但实际滚动由 Playlist 组件处理
  }, []);

  // ✅ PWA/移动端优化：后台同步（在 saveProgress 定义之后）
  const backgroundSync = useBackgroundSync(
    async (data: unknown) => {
      const syncData = data as { fileId: string; currentTime: number; duration: number };
      if (syncData.fileId && syncData.currentTime !== undefined) {
        await saveProgress(syncData.currentTime, syncData.duration, syncData.fileId);
      }
    },
    {
      enabled: true,
      syncInterval: 30000, // 30秒
      syncOnVisible: true,
    }
  );

  // ✅ PWA/移动端优化：页面可见性变化时处理同步（在 saveProgress 和 backgroundSync 定义之后）
  useEffect(() => {
    if (!isPageMode) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面可见时，处理后台同步队列
        backgroundSync.processSyncQueue();
      } else if (document.visibilityState === 'hidden') {
        // 页面隐藏时，保存当前状态
        if (audioRef.current && audioRef.current.duration > 0 && currentFileId) {
          const currentTime = audioRef.current.currentTime;
          const duration = audioRef.current.duration;
          saveOfflineState(currentFileId, currentTime, duration);
          
          // 如果在线，立即同步；如果离线，加入队列
          if (isOnline) {
            saveProgress(currentTime, duration, currentFileId).catch(() => {
              backgroundSync.queueSync({ fileId: currentFileId, currentTime, duration });
            });
          } else {
            backgroundSync.queueSync({ fileId: currentFileId, currentTime, duration });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPageMode, currentFileId, isOnline, saveOfflineState, saveProgress, backgroundSync]);

  // ✅ 重构：使用 usePlayerInitializer Hook
  const loadAudioRef = useRef<((fileId: string, isAutoSwitch?: boolean, startTimeFromAPI?: number) => Promise<void>) | null>(null);
  
  const { initialize: initializePlayer, markAsInitialized } = usePlayerInitializer({
    audiobookId,
    files,
    initialFileId,
    initialTime,
    currentFileId,
    setCurrentFileId: setCurrentFileIdState,
    setAudiobook,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
  });
  
  // ✅ 重构：包装初始化函数，添加加载音频的逻辑
  const initializePlayerWithAudio = useCallback(async () => {
    if (initializationCompleteRef.current || isInitializing || !audiobookId || !files.length) {

      return;
    }
    
    setIsInitializing(true);
    
    try {
      const result = await initializePlayer();

      // 调试：initializePlayer 返回结果
      // console.log('🎵 [AudiobookPlayer] initializePlayer 返回结果:', {
      //   result,
      //   initialTime, // 调试：显示传递给 AudiobookPlayer 的 initialTime
      //   initialFileId
      // });

      // ✅ 修复：初始化时更新 currentFileId，并加载音频（传入 startTime）
      // 但需要检查是否已经在加载相同的文件，避免重复加载
      if (result.fileId) {
        // 更新文件ID（这会触发 useEffect 监听 currentFileId 变化）
        setCurrentFileIdState(result.fileId);
        
        // ✅ 修复：初始化时直接加载音频（传入 startTime），但需要标记已加载，避免 useEffect 重复加载
        // 延迟加载，确保状态更新完成
        setTimeout(() => {
          if (loadAudioRef.current && previousFileIdRef.current !== result.fileId) {
            // 先更新 previousFileIdRef，标记正在加载，避免 useEffect 重复加载
            previousFileIdRef.current = result.fileId;
            // ✅ 修复：如果已从API获取过进度，传入 startTime（即使是 0）；否则传入 undefined，让 loadAudio 再次获取
            // 注意：PWA模式下也应该允许使用离线缓存作为降级方案，不再强制传入 startTime
            const initialStartTime = result.hasProgressFromAPI
              ? result.startTime
              : undefined;

            // 调试：初始化加载音频
            // console.log('🎵 [AudiobookPlayer] 初始化加载音频:', {
            //   fileId: result.fileId,
            //   startTime: initialStartTime,
            //   source: result.source,
            //   hasProgressFromAPI: result.hasProgressFromAPI
            // });
            //   hasProgressFromAPI: result.hasProgressFromAPI,
            //   isPWAMode
            // });
            loadAudioRef.current(result.fileId, false, initialStartTime);
          }
        }, 100);
      }
      
      initializationCompleteRef.current = true;
      markAsInitialized();
      setIsInitialized(true);
      setIsInitializing(false);
    } catch (error) {
      console.error('[AudiobookPlayer] 初始化失败:', error);
      // 降级方案：如果没有初始化结果，使用 initialFileId
      if (initialFileId) {
        setCurrentFileIdState(initialFileId);
        if (setAudiobook) {
          setAudiobook({
            audiobookId,
            audiobookTitle,
            audiobookAuthor,
            audiobookCover,
            files,
            initialFileId,
          });
        }
        // ✅ 修复：降级方案也不直接加载，让 useEffect 监听 currentFileId 变化来加载
      }
      setIsInitialized(true);
      setIsInitializing(false);
    }
  }, [initializePlayer, markAsInitialized, isInitializing, audiobookId, files.length, initialFileId, setCurrentFileIdState, setAudiobook, audiobookTitle, audiobookAuthor, audiobookCover, files, setIsInitialized]);

  // 播放/暂停
  const togglePlay = useCallback(async () => {


    // ✅ 修复：如果 audioRef 还没有初始化，尝试加载音频
    if (!audioRef.current) {
      console.warn('[AudiobookPlayer] audioRef 未初始化，尝试加载音频');
      if (currentFileId) {
        // ✅ 修复：等待 loadAudioRef 被设置（最多等待500ms）
        if (!loadAudioRef.current) {
          console.warn('[AudiobookPlayer] loadAudioRef 未设置，等待设置...');
          let retries = 0;
          while (!loadAudioRef.current && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 50));
            retries++;
          }
        }
        
        if (loadAudioRef.current) {
          try {
            await loadAudioRef.current(currentFileId, false, 0);
            // 等待音频加载完成
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error('[AudiobookPlayer] 加载音频失败:', error);
            toast.error('无法加载音频文件');
            return;
          }
        } else {
          console.error('[AudiobookPlayer] 无法播放：loadAudioRef 仍未设置');
          toast.error('音频加载器未准备好，请稍后再试');
          return;
        }
      } else {
        console.error('[AudiobookPlayer] 无法播放：没有 currentFileId');
        toast.error('音频未准备好，请稍后再试');
        return;
      }
    }

    if (isPlaying) {
      // ✅ 修复：暂停时立即保存播放进度和last_file_id，确保使用正确的fileId
      if (audioRef.current && audioRef.current.duration > 0 && currentFileId) {
        const currentTime = audioRef.current.currentTime;
        const duration = audioRef.current.duration;
        const fileIdToSave = currentFileId; // ✅ 修复：显式保存fileId，避免闭包问题
        // ✅ 修复：显式传入fileId参数，确保保存到正确的文件
        saveProgress(currentTime, duration, fileIdToSave).catch(e => {
          console.error('[AudiobookPlayer] 暂停时保存进度失败', e);
        });
      }
      
      audioRef.current?.pause();
      setPaused();
      updateMediaSessionRef.current?.();
      // ✅ 无障碍性：宣布暂停状态
      announce('播放已暂停', false);
      
      // ✅ PWA/移动端优化：暂停时释放屏幕唤醒锁定
      if (isPageMode) {
        releaseWakeLock().catch(() => {
          // 忽略错误
        });
      }
    } else {
      // ✅ 修复：检查音频是否已加载
      if (!audioRef.current || !audioRef.current.src) {
        console.warn('[AudiobookPlayer] 音频未加载，尝试加载');
        if (currentFileId) {
          // ✅ 修复：等待 loadAudioRef 被设置（最多等待500ms）
          if (!loadAudioRef.current) {
            console.warn('[AudiobookPlayer] loadAudioRef 未设置，等待设置...');
            let retries = 0;
            while (!loadAudioRef.current && retries < 10) {
              await new Promise(resolve => setTimeout(resolve, 50));
              retries++;
            }
          }
          
          if (loadAudioRef.current) {
            try {
              await loadAudioRef.current(currentFileId, false, 0);
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              console.error('[AudiobookPlayer] 加载音频失败:', error);
              toast.error('无法加载音频文件');
              return;
            }
          } else {
            console.error('[AudiobookPlayer] 无法播放：loadAudioRef 仍未设置');
            toast.error('音频加载器未准备好，请稍后再试');
            return;
          }
        } else {
          toast.error('音频未准备好');
          return;
        }
      }

      // ✅ 优化：PWA模式下使用更宽松的检测
      const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
      const isPlayingFinished = audioRef.current.duration > 0 && 
          Math.abs(audioRef.current.currentTime - audioRef.current.duration) < (isPWAMode ? 1.0 : 0.5);
      
      if (isPlayingFinished) {
        // 当前音频已播放完毕，自动播放下一个
        if (currentFileIndex < files.length - 1) {
          const nextFile = files[currentFileIndex + 1];
          // ✅ 修复：切换文件前，立即更新last_file_id
          (async () => {
            try {
              await api.post(`/audiobooks/${audiobookId}/progress`, {
                fileId: nextFile.id,
                currentTime: 0,
                duration: 0,
                updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id
              });
            } catch (e) {
              console.error('[AudiobookPlayer] togglePlay检测完成：更新last_file_id失败', e);
            }
            setAutoPlayNext(true);
            setCurrentFileIdState(nextFile.id);
            onFileChange(nextFile.id);
          })();
          return;
        } else {
          // 已经是最后一集，从头播放
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
          }
        }
      }
      
      try {
        if (!audioRef.current) {
          throw new Error('音频元素未初始化');
        }
        
        // ✅ 修复：在播放前再次检查状态，避免竞态条件
        if (audioRef.current.paused === false) {
          // 已经在播放，不需要再次播放
          return;
        }
        
        const playPromise = audioRef.current.play();
        
        // ✅ 修复：等待播放Promise完成，但忽略AbortError（用户可能在播放过程中暂停）
        try {
          await playPromise;
        } catch (playError: any) {
          // ✅ 修复：如果是AbortError（播放被暂停中断），这是正常的，不需要报错
          if (playError.name === 'AbortError' || playError.message?.includes('interrupted')) {
            // 检查当前状态，如果已经暂停，则更新状态
            if (audioRef.current?.paused) {
              setPaused();
            }
            return;
          }
          // 其他错误继续抛出
          throw playError;
        }
        
        // 验证播放状态，确保状态同步
        if (audioRef.current.paused) {
          console.warn('[AudiobookPlayer] 播放失败：音频仍然暂停');
          setPaused();
          // ✅ 无障碍性：宣布播放失败
          announce('播放失败', true);
        } else {
          setPlayerPlaying(true);
          updateMediaSessionRef.current?.();
          // ✅ 无障碍性：宣布播放状态
          announce('播放已开始', false);
          
          // ✅ PWA/移动端优化：播放时请求屏幕唤醒锁定
          if (isPageMode) {
            requestWakeLock().catch(() => {
              // 忽略错误，唤醒锁定是可选的
            });
          }
          
          // 移除播放通知，避免干扰用户
          // if (isPageMode && currentFile) {
          //   showNotification(`${audiobookTitle} - ${currentFile.file_name}`, {
          //     body: '正在播放',
          //     tag: 'audiobook-play',
          //   }).catch(() => {
          //     // 忽略错误，通知是可选的
          //   });
          // }
        }
      } catch (error: any) {
        // ✅ 修复：忽略AbortError，这是正常的（用户可能在播放过程中暂停）
        if (error.name === 'AbortError' || error.message?.includes('interrupted')) {
          // 检查当前状态，如果已经暂停，则更新状态
          if (audioRef.current?.paused) {
            setPaused();
          }
          return;
        }
        
        console.error('[AudiobookPlayer] 播放失败:', error);
        setPaused();
        toast.error(t('audiobook.player.playFailed') || '播放失败');
        // ✅ 无障碍性：宣布播放失败
        announce('播放失败', true);
      }
    }
  }, [isPlaying, t, currentFileIndex, files, onFileChange, setPlayerPlaying, setPaused, setCurrentFileIdState, announce, updateMediaSessionRef, currentFileId, isPageMode, audiobookTitle, currentFile, saveProgress, setAutoPlayNext, releaseWakeLock, requestWakeLock, showNotification]);

  // 将 togglePlay 保存到 ref，供 handlePlaybackEnded 使用
  useEffect(() => {
    togglePlayRef.current = togglePlay;
  }, [togglePlay]);

  // ✅ 重构：使用 useFileNavigation Hook
  const { navigateToPrevious, navigateToNext } = useFileNavigation({
    files,
    currentFileIndex,
    currentFileId,
    currentFile,
    isPlaying,
    audioRef,
    saveProgress,
    setCurrentFileId: setCurrentFileIdState,
    onFileChange,
    setPaused,
    showPlaylist,
    setShowPlaylist: setShowPlaylistState,
    autoPlayNextRef,
    setAutoPlayNext,
  });
  
  // ✅ 重构：包装导航函数，添加滚动逻辑
  const handlePrevious = useCallback(async () => {
    await navigateToPrevious();
    // 延迟滚动，确保 DOM 更新完成
    setTimeout(() => {
      scrollToCurrentFile();
    }, 300);
  }, [navigateToPrevious, scrollToCurrentFile]);

  // ✅ 重构：包装导航函数，添加滚动逻辑
  const handleNext = useCallback(async () => {
    await navigateToNext();
    // 延迟滚动，确保 DOM 更新完成
    setTimeout(() => {
      scrollToCurrentFile();
    }, 300);
  }, [navigateToNext, scrollToCurrentFile]);

  // 注册全局事件监听器，用于外部控制播放（避免在 store 中存储函数引用）
  useEffect(() => {
    const handlePlayPauseEvent = () => {
      togglePlay();
    };
    
    const handlePreviousEvent = () => {
      handlePrevious();
    };
    
    const handleNextEvent = () => {
      handleNext();
    };
    
    const handleStopEvent = async () => {
      
      // 禁用自动恢复播放
      shouldAutoResumeRef.current = false;
      
      // 停止前先保存当前播放进度
      if (audioRef.current && audioRef.current.duration > 0 && audiobookId && currentFileId) {
        try {
          await api.post(`/audiobooks/${audiobookId}/progress`, {
            fileId: currentFileId,
            currentTime: audioRef.current.currentTime,
            duration: audioRef.current.duration,
          });
        } catch (error: any) {
          console.error('[AudiobookPlayer] 停止时保存进度失败:', error);
          // 即使保存失败，也继续停止播放
        }
      }
      
      // 停止播放 - 更彻底地停止
      if (audioRef.current) {
        const audio = audioRef.current;
        
        // 移除所有事件监听器，防止自动播放
        // 移除 addEventListener 添加的监听器（使用类型安全的接口）
        const audioWithHandlers = audio as AudioElementWithHandlers;
        
        if (audioWithHandlers.__timeupdateHandler) {
          audio.removeEventListener('timeupdate', audioWithHandlers.__timeupdateHandler);
          delete audioWithHandlers.__timeupdateHandler;
        }
        if (audioWithHandlers.__loadstartHandler) {
          audio.removeEventListener('loadstart', audioWithHandlers.__loadstartHandler);
          delete audioWithHandlers.__loadstartHandler;
        }
        if (audioWithHandlers.__loadedmetadataHandler) {
          // loadedmetadata 是在 addEventListener 中定义的，需要移除
          audio.removeEventListener('loadedmetadata', audioWithHandlers.__loadedmetadataHandler);
          delete audioWithHandlers.__loadedmetadataHandler;
        }
        if (audioWithHandlers.__canplaythroughHandler) {
          audio.removeEventListener('canplaythrough', audioWithHandlers.__canplaythroughHandler);
          delete audioWithHandlers.__canplaythroughHandler;
        }
        if (audioWithHandlers.__endedHandler) {
          audio.removeEventListener('ended', audioWithHandlers.__endedHandler);
          delete audioWithHandlers.__endedHandler;
        }
        
        // 移除 on* 属性绑定的事件监听器
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.oncanplay = null;
        audio.oncanplaythrough = null;
        audio.onloadeddata = null;
        audio.onloadstart = null;
        audio.onloadedmetadata = null;
        
        // 强制暂停
        audio.pause();
        audio.currentTime = 0;
        
        // 清理blob URL
        if (audio.src && audio.src.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(audio.src);
          } catch (e) {
            console.warn('[AudiobookPlayer] 清理blob URL失败:', e);
          }
        }
        
        // 清空src，防止恢复播放
        audio.src = '';
        audio.load(); // 重新加载，清除所有状态
        
      }
      
      // 清理全局音频管理器
      globalAudioManager.clearInstance();
      
      // 更新状态
      setPaused();
      setPlaying(false);
      setShowMiniPlayer(false);
      
      // 重置全局状态
      reset();
      // 清除中间按钮模式（让用户重新选择）
      const store = useAudiobookStore.getState();
      store.setCenterButtonMode(null);
    };

    // 清理全局音频管理器的事件处理
    const handleClearGlobalManager = () => {
      // 停止所有音频播放
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          // 清理blob URL
          if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
          }
        } catch (e) {
          console.warn('[AudiobookPlayer] 停止音频失败:', e);
        }
      }
      
      // 停止所有其他音频元素
      if (typeof document !== 'undefined') {
        const allAudios = document.querySelectorAll('audio');
        allAudios.forEach((audioEl) => {
          if (!audioEl.paused) {
            try {
              audioEl.pause();
              audioEl.currentTime = 0;
            } catch (e) {
              console.warn('[AudiobookPlayer] 停止其他音频失败:', e);
            }
          }
        });
      }
      
      globalAudioManager.clearInstance();
      setPaused();
      setAutoPlayNext(false);
      autoPlayNextRef.current = false;
    };

    // ✅ 添加：处理保存前卸载事件
    const handleSaveBeforeUnload = () => {
      // console.log('[AudiobookPlayer] 收到保存前卸载事件');
      // ✅ 修复：立即保存当前进度，显式传入currentFileId
      if (audioRef.current && audioRef.current.duration > 0 && audiobookId && currentFileId) {
        saveProgress(audioRef.current.currentTime, audioRef.current.duration, currentFileId).catch(e => {
          console.error('[AudiobookPlayer] 保存进度失败:', e);
        });
      }
    };

    // 注册全局事件
    window.addEventListener('audiobook:playPause', handlePlayPauseEvent);
    window.addEventListener('audiobook:previous', handlePreviousEvent);
    window.addEventListener('audiobook:next', handleNextEvent);
    window.addEventListener('audiobook:stop', handleStopEvent);
    window.addEventListener('audiobook:clearGlobalManager', handleClearGlobalManager);
    window.addEventListener('audiobook:saveBeforeUnload', handleSaveBeforeUnload);

    return () => {
      window.removeEventListener('audiobook:playPause', handlePlayPauseEvent);
      window.removeEventListener('audiobook:previous', handlePreviousEvent);
      window.removeEventListener('audiobook:next', handleNextEvent);
      window.removeEventListener('audiobook:stop', handleStopEvent);
      window.removeEventListener('audiobook:clearGlobalManager', handleClearGlobalManager);
      window.removeEventListener('audiobook:saveBeforeUnload', handleSaveBeforeUnload);
    };
  }, [togglePlay, handlePrevious, handleNext, setPlaying, setShowMiniPlayer, reset, audiobookId, currentFileId, saveProgress]);

  // 同步播放状态到全局store
  useEffect(() => {
    setPlaying(isPlaying);
  }, [isPlaying, setPlaying]);

  useEffect(() => {
    setCurrentFile(currentFileId);
  }, [currentFileId, setCurrentFile]);

  useEffect(() => {
    setProgress(currentTime, duration);
  }, [currentTime, duration, setProgress]);
  
  // ✅ 优化：只在播放状态下启用15秒自动保存机制
  // 移除独立的定时器保存，使用 timeupdate 事件中的防抖保存即可
  // 这样可以避免多个保存机制之间的冲突，确保只在真正播放时保存
  
  // ✅ 修复：PWA模式下的播放状态同步问题
  useEffect(() => {
    const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
    
    if (!audioRef.current) return;
    
    const checkPlayState = () => {
      if (audioRef.current) {
        const actuallyPlaying = !audioRef.current.paused && 
                              audioRef.current.currentTime > 0 &&
                              !audioRef.current.ended;
        
        // 如果状态不一致，同步状态
        if (isPlaying !== actuallyPlaying) {
          setPlayerPlaying(actuallyPlaying);
        }
        
        // ✅ 修复：检查是否播放完成但未触发事件（PWA模式下）
        if (isPWAMode && actuallyPlaying && 
            audioRef.current.duration > 0 && 
            audioRef.current.currentTime >= audioRef.current.duration - 0.5) {
          // 提前准备处理播放完成
        }
      }
    };
    
    // PWA模式下更频繁地检查播放状态
    const interval = setInterval(checkPlayState, isPWAMode ? 1000 : 2000);
    
    return () => clearInterval(interval);
  }, [isPlaying]);
  
  // ✅ 修复：监听页面可见性变化，在后台时启用定期检测
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isPWAModeForVisibility = window.matchMedia('(display-mode: standalone)').matches;
      const isHidden = document.hidden;
      
      if (audioRef.current && (isPWAModeForVisibility || isHidden)) {
        // 页面隐藏或PWA模式时，确保后台检测定时器运行
        if (!backgroundCheckIntervalRef.current && audioRef.current.duration > 0 && !audioRef.current.paused) {
          
          backgroundCheckIntervalRef.current = setInterval(() => {
            const audio = audioRef.current;
            if (audio && audio.duration > 0 && !audio.paused) {
              const currentTime = audio.currentTime;
              const duration = audio.duration;
              const timeRemaining = duration - currentTime;
              
              if (timeRemaining <= 1.0 && timeRemaining >= 0) {
                
                setTimeout(() => {
                  if (audioRef.current === audio) {
                    const finalTimeRemaining = audio.duration - audio.currentTime;
                    if (finalTimeRemaining <= 0.5 || audio.ended) {
                      // 触发播放完成处理
                      const audioWithHandlers = audio as AudioElementWithHandlers;
                      if (audioWithHandlers.__endedHandler) {
                        audioWithHandlers.__endedHandler();
                      }
                    }
                  }
                }, 600);
              }
            } else if (!audio || audio.paused || audio.ended) {
              // 如果音频已暂停或结束，清除定时器
              if (backgroundCheckIntervalRef.current) {
                clearInterval(backgroundCheckIntervalRef.current);
                backgroundCheckIntervalRef.current = null;
              }
            }
          }, 500);
        }
      } else if (!isHidden && backgroundCheckIntervalRef.current) {
        // 页面可见时，可以依赖timeupdate事件，清除后台检测定时器
        // console.log('[AudiobookPlayer] 页面回到前台，清除后台检测定时器');
        clearInterval(backgroundCheckIntervalRef.current);
        backgroundCheckIntervalRef.current = null;
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 初始检查
    handleVisibilityChange();
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (backgroundCheckIntervalRef.current) {
        clearInterval(backgroundCheckIntervalRef.current);
        backgroundCheckIntervalRef.current = null;
      }
    };
  }, [currentFileId, isPlaying]);

  // 确保音频元素的 timeupdate 事件监听器始终存在
  // 这在组件重新挂载或重新打开播放面板时很重要
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // 移除旧的监听器（如果有）（使用类型安全的接口）
    const audioWithHandlers = audio as AudioElementWithHandlers;
    const existingHandler = audioWithHandlers.__timeupdateHandler;
    if (existingHandler) {
      audio.removeEventListener('timeupdate', existingHandler);
    }
    
    // 创建新的 timeupdate 处理函数
    const timeupdateHandler = () => {
      if (audioRef.current === audio) {
        setCurrentTimeState(audio.currentTime);

        // ✅ 修复：实时更新fileProgresses状态，确保播放列表中的进度条同步更新
        const duration = audio.duration || 0;
        if (duration > 0) {
          const progressPercent = (audio.currentTime / duration) * 100;
          setFileProgresses(prev => ({
            ...prev,
            [currentFileId]: {
              file_id: currentFileId,
              current_time: audio.currentTime,
              duration: duration,
              progress: progressPercent,
              last_played_at: new Date().toISOString(),
            }
          }));
        }

        // ✅ 修复：只有在播放状态下才启用15秒防抖保存机制
        if (isPlaying) {
          const now = Date.now();
          if (now - lastSaveTimeRef.current >= 15000) {
            // 清除之前的定时器
            if (saveProgressTimeoutRef.current) {
              clearTimeout(saveProgressTimeoutRef.current);
            }
            // 延迟500ms保存，避免频繁触发
            saveProgressTimeoutRef.current = setTimeout(() => {
              // ✅ 修复：显式传入currentFileId，避免在PWA环境下使用错误的fileId
              const currentTime = audio.currentTime;
              const duration = audio.duration;

              // 保存到服务器
              saveProgress(currentTime, duration, currentFileId);

              // ✅ PWA/移动端优化：同时保存离线状态
              saveOfflineState(currentFileId, currentTime, duration);

              // ✅ PWA/移动端优化：如果离线，加入后台同步队列
              if (!isOnline) {
                backgroundSync.queueSync({ fileId: currentFileId, currentTime, duration });
              }

              lastSaveTimeRef.current = Date.now();
            }, 500);
          }
        }
      }
    };
    
    // 保存处理函数引用，以便后续移除
    audioWithHandlers.__timeupdateHandler = timeupdateHandler;
    audio.addEventListener('timeupdate', timeupdateHandler);
    
    // 立即同步一次当前进度
    if (audio.readyState >= 2) {
      setCurrentTimeState(audio.currentTime);
      setDurationState(audio.duration || 0);
    }
    
    return () => {
      // 清理时移除监听器
      const audioWithHandlersCleanupTimeupdate = audio as AudioElementWithHandlers;
      if (audioWithHandlersCleanupTimeupdate.__timeupdateHandler === timeupdateHandler) {
        audio.removeEventListener('timeupdate', timeupdateHandler);
        delete audioWithHandlersCleanupTimeupdate.__timeupdateHandler;
      }
      
      // ✅ 修复：清理播放和暂停事件监听器（使用类型安全的接口）
      const audioWithHandlersCleanup = audio as AudioElementWithHandlers;
      if (audioWithHandlersCleanup.__playHandler) {
        audio.removeEventListener('play', audioWithHandlersCleanup.__playHandler);
        delete audioWithHandlersCleanup.__playHandler;
      }
      if (audioWithHandlersCleanup.__pauseHandler) {
        audio.removeEventListener('pause', audioWithHandlersCleanup.__pauseHandler);
        delete audioWithHandlersCleanup.__pauseHandler;
      }
      if (audioWithHandlersCleanup.__playingHandler) {
        audio.removeEventListener('playing', audioWithHandlersCleanup.__playingHandler);
        delete audioWithHandlersCleanup.__playingHandler;
      }
    };
  }, [currentFileId, isPlaying, setFileProgresses]); // 当文件ID或播放状态变化时重新绑定

  // 点击外部关闭音量滑块 - 已移至 VolumeControl 组件内部

  // 页面卸载时保存进度并停止播放
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 停止所有音频播放（PWA关闭时应该停止播放）
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          // 清理blob URL
          if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
          }
        } catch (e) {
          console.warn('[AudiobookPlayer] 停止音频失败:', e);
        }
      }
      
      // 停止所有其他音频元素
      if (typeof document !== 'undefined') {
        const allAudios = document.querySelectorAll('audio');
        allAudios.forEach((audioEl) => {
          if (!audioEl.paused) {
            try {
              audioEl.pause();
              audioEl.currentTime = 0;
            } catch (e) {
              console.warn('[AudiobookPlayer] 停止其他音频失败:', e);
            }
          }
        });
      }
      
      // 清理全局音频管理器
      globalAudioManager.clearInstance();
      
      // ✅ 修复：保存进度时，确保使用最新的播放时间
      if (audioRef.current && audioRef.current.duration > 0) {
        // 使用 navigator.sendBeacon 确保请求能够发送（即使页面正在卸载）
        const token = localStorage.getItem('auth-storage');
        let authToken = '';
        if (token) {
          try {
            const parsed = JSON.parse(token);
            authToken = parsed.state?.token || parsed.token || '';
          } catch (e) {
            // 忽略解析错误
          }
        }
        
        // ✅ 修复：确保使用最新的currentTime（可能在事件触发后又有更新）
        const finalCurrentTime = Math.max(0, Math.min(
          audioRef.current.currentTime, 
          audioRef.current.duration
        ));
        
        const data = JSON.stringify({
          fileId: currentFileId,
          currentTime: finalCurrentTime,
          duration: audioRef.current.duration,
        });
        
        // 使用 getFullApiUrl 构建完整的进度保存URL，支持自定义API服务器地址
        const progressUrl = getFullApiUrl(`/audiobooks/${audiobookId}/progress`);
        const authHeaders = getAuthHeaders();
        
        if (navigator.sendBeacon) {
          const blob = new Blob([data], { type: 'application/json' });
          // sendBeacon 不支持自定义 headers，但可以确保请求发送
          // 注意：如果使用自定义API服务器，sendBeacon可能无法发送认证头，这是浏览器限制
          navigator.sendBeacon(progressUrl, blob);
        } else {
          // 降级方案：同步保存（不推荐，但可以确保保存）
          try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', progressUrl, false); // 同步请求
            xhr.setRequestHeader('Content-Type', 'application/json');
            // 设置认证头
            if (authHeaders['Authorization']) {
              xhr.setRequestHeader('Authorization', authHeaders['Authorization'] as string);
            }
            if (authHeaders['X-API-Key']) {
              xhr.setRequestHeader('X-API-Key', authHeaders['X-API-Key'] as string);
            }
            xhr.send(data);
          } catch (e) {
            console.error('保存进度失败:', e);
          }
        }
      }
    };
    
    // 处理页面隐藏/冻结（PWA关闭时）
    const handlePageHide = (event: PageTransitionEvent) => {
      // console.log('[AudiobookPlayer] 页面隐藏/冻结', { persisted: event.persisted });
      
      // 停止所有音频播放
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          // 清理blob URL
          if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioRef.current.src);
          }
        } catch (e) {
          console.warn('[AudiobookPlayer] 停止音频失败:', e);
        }
      }
      
      // 停止所有其他音频元素
      if (typeof document !== 'undefined') {
        const allAudios = document.querySelectorAll('audio');
        allAudios.forEach((audioEl) => {
          if (!audioEl.paused) {
            try {
              audioEl.pause();
              audioEl.currentTime = 0;
            } catch (e) {
              console.warn('[AudiobookPlayer] 停止其他音频失败:', e);
            }
          }
        });
      }
      
      // 清理全局音频管理器
      globalAudioManager.clearInstance();
      
      // 重置播放状态
      setPaused();
      setAutoPlayNext(false);
      autoPlayNextRef.current = false;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [audiobookId, currentFileId]);

  // ✅ 修复：增强的PWA日志记录
  useEffect(() => {
    const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
    if (isPWAMode) {

      
      // 监听PWA特定事件
      const logPWAEvent = (event: Event) => {
        // console.log(`[AudiobookPlayer] PWA事件: ${event.type}`, {
        //   timestamp: new Date().toISOString(),
        //   documentHidden: document.hidden
        // });
      };
      
      window.addEventListener('appinstalled', logPWAEvent);
      window.addEventListener('beforeinstallprompt', logPWAEvent);
      
      // ✅ 添加：定期报告播放状态（仅在PWA模式下）
      const logInterval = setInterval(() => {
        if (audioRef.current) {
          // console.log('[AudiobookPlayer] PWA播放状态报告', {
          //   currentTime: audioRef.current.currentTime,
          //   duration: audioRef.current.duration,
          //   paused: audioRef.current.paused,
          //   readyState: audioRef.current.readyState,
          //   ended: audioRef.current.ended,
          //   documentHidden: document.hidden,
          //   currentFileId,
          //   isPlaying
          // });
        }
      }, 10000); // 每10秒报告一次
      
      return () => {
        window.removeEventListener('appinstalled', logPWAEvent);
        window.removeEventListener('beforeinstallprompt', logPWAEvent);
        clearInterval(logInterval);
      };
    }
  }, [audiobookId, currentFileId, files.length, isPlaying]);

  // ✅ 修复：已移除PWA状态持久化逻辑
  // PWA和PC端应该统一使用API获取和保存播放进度，确保数据一致性
  // 播放进度统一通过 usePlaybackProgress hook 中的 saveProgress 函数保存到API
  // 不再使用 localStorage 缓存，避免使用过时的进度数据

  // ✅ 修复：只有一个初始化useEffect
  useEffect(() => {
    if (!audiobookId || !files.length || isInitialized || isInitializing) {
      return;
    }
    
    // console.log('[AudiobookPlayer] 触发初始化');
      initializePlayerWithAudio();
    
    return () => {
      // 清理逻辑
      // console.log('[AudiobookPlayer] 清理初始化');
      
      // 取消任何待处理的定时器
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
        saveProgressTimeoutRef.current = null;
      }
      
      // 重置初始化标志（当audiobookId变化时）
      initializationCompleteRef.current = false;
      // ✅ 优化：在PWA模式下，如果用户退出页面，需要保存进度但不要完全停止音频
      const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
      
      // 组件卸载前保存当前进度
      if (audioRef.current && audioRef.current.duration > 0 && currentFileId && audiobookId) {
        // 在PWA模式下，如果页面隐藏，仍然保存进度
        if (!isPWAMode || !document.hidden) {
          // 非PWA模式或页面可见时保存进度
          api.post(`/audiobooks/${audiobookId}/progress`, {
            fileId: currentFileId,
            currentTime: audioRef.current.currentTime,
            duration: audioRef.current.duration,
          }).catch((error) => {
            console.error('保存进度失败:', error);
          });
        } else if (isPWAMode && document.hidden) {
          // PWA模式下页面隐藏时，使用sendBeacon保存进度
          const token = localStorage.getItem('auth-storage');
          let authToken = '';
          if (token) {
            try {
              const parsed = JSON.parse(token);
              authToken = parsed.state?.token || parsed.token || '';
            } catch (e) {
              // 忽略解析错误
            }
          }
          
          const data = JSON.stringify({
            fileId: currentFileId,
            currentTime: audioRef.current.currentTime,
            duration: audioRef.current.duration,
          });
          
          const progressUrl = getFullApiUrl(`/audiobooks/${audiobookId}/progress`);
          if (navigator.sendBeacon) {
            const blob = new Blob([data], { type: 'application/json' });
            navigator.sendBeacon(progressUrl, blob);
          }
        }
      }
      
      // 注意：组件卸载时不停止播放，让音频继续在后台播放
      // 只有在真正需要停止时才调用 pause()
      if (progressUpdateIntervalRef.current) {
        clearInterval(progressUpdateIntervalRef.current);
      }
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }
      // ✅ 修复：清理后台检测定时器
      if (backgroundCheckIntervalRef.current) {
        clearInterval(backgroundCheckIntervalRef.current);
        backgroundCheckIntervalRef.current = null;
      }
      
      // ✅ 修复：清理PWA事件处理器
      if (pwaAudioHandlersCleanupRef.current) {
        pwaAudioHandlersCleanupRef.current();
        pwaAudioHandlersCleanupRef.current = null;
      }
      
      // 不清理 audioRef，让音频继续播放
      // 只有在切换不同的有声小说时才清理全局实例
      
      // 清理预缓存（切换不同的有声小说时）
      preloadCacheRef.current.forEach((cached) => {
        URL.revokeObjectURL(cached.url);
      });
      preloadCacheRef.current.clear();
      preloadingRef.current.clear();
    };
  }, [audiobookId, files.length, isInitialized, isInitializing, initializePlayer]);

  // ✅ 修复：简化initialFileId变化的处理
  useEffect(() => {
    // ✅ 修复：只有在初始化完成后，且 initialFileId 与 currentFileId 不同时才响应
    // 同时检查 previousFileIdRef，避免重复加载
    if (isInitialized && initialFileId && initialFileId !== currentFileId && previousFileIdRef.current !== initialFileId) {
      // console.log('[AudiobookPlayer] initialFileId 变化，更新 currentFileId', {
      //   oldFileId: currentFileId,
      //   newFileId: initialFileId,
      //   previousFileId: previousFileIdRef.current,
      //   audiobookId
      // });
      
      // 先保存当前文件的进度
      if (audioRef.current && audioRef.current.duration > 0 && currentFileId) {
        saveProgress(
          audioRef.current.currentTime, 
          audioRef.current.duration, 
          currentFileId
        ).catch(e => {
          console.error('[AudiobookPlayer] 保存当前文件进度失败', e);
        });
      }
      
      // ✅ 修复：设置新的currentFileId时，也要更新last_file_id
      // 这确保了从书架页面进入时，last_file_id被正确设置为用户选择的文件
      saveProgress(0, 0, initialFileId, true, true).catch(e => {
        console.error('[AudiobookPlayer] 更新last_file_id失败', e);
      });

      // 更新文件ID
      setCurrentFileIdState(initialFileId);

      // ✅ 修复：不需要在这里加载音频，因为 currentFileId 变化会触发另一个 useEffect 加载
      // 这样可以避免重复加载
    }
  }, [initialFileId, isInitialized, currentFileId, audiobookId, setCurrentFileIdState, saveProgress]);

  // ✅ 修复：PWA页面切换回来的状态同步
  useEffect(() => {
    const handlePageVisibilityChange = () => {
      const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
      if (!isPWAMode || document.hidden) return;
      
      // console.log('[AudiobookPlayer] PWA页面回到前台');
      
      // 检查是否有全局音频实例
      const instance = globalAudioManager.getInstance();
      if (instance && 
          instance.audiobookId === audiobookId && 
          instance.fileId === currentFileId &&
          instance.audio) {
        
        const audio = instance.audio;
        
        // 如果音频已经加载，同步状态
        if (audio.readyState >= 2) {
          const actualPlaying = !audio.paused && audio.currentTime > 0 && !audio.ended;
          const actualCurrentTime = audio.currentTime || 0;
          const actualDuration = audio.duration || 0;
          
          // 同步状态（避免不必要的状态更新）
          if (actualPlaying !== isPlaying) {
            setPlayerPlaying(actualPlaying);
          }
          if (Math.abs(actualCurrentTime - currentTime) > 0.5) {
            setCurrentTimeState(actualCurrentTime);
          }
          if (Math.abs(actualDuration - duration) > 0.5) {
            setDurationState(actualDuration);
          }
          
          // console.log('[AudiobookPlayer] PWA同步音频状态', {
          //   fileId: currentFileId,
          //   actualPlaying,
          //   actualCurrentTime,
          //   actualDuration
          // });
        }
      }
    };
    
    document.addEventListener('visibilitychange', handlePageVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handlePageVisibilityChange);
    };
  }, [audiobookId, currentFileId, isPlaying, currentTime, duration]);

  // ✅ 修复：在关键位置添加调试日志
  useEffect(() => {
    // console.log('[AudiobookPlayer] 状态更新', {
    //   audiobookId,
    //   currentFileId,
    //   initialFileId,
    //   isInitialized,
    //   isInitializing,
    //   filesCount: files.length,
    //   audioRefExists: !!audioRef.current
    // });
  }, [audiobookId, currentFileId, initialFileId, isInitialized, isInitializing, files.length]);

  // 加载音频
  // ✅ 修复：修改loadAudio函数签名，支持传入startTime（可以是 undefined，表示未初始化）
  const loadAudio = async (fileId: string, isAutoSwitch: boolean = false, startTimeFromAPI?: number) => {
    // ✅ 修复：更新ref引用
    loadAudioRef.current = loadAudio;

    // 调试：loadAudio 函数调用
    // console.log('🎵 [loadAudio] 函数调用:', {
    //   fileId,
    //   currentFileId,
    //   previousFileId: previousFileIdRef.current,
    //   startTimeFromAPI,
    //   isAutoSwitch,
    //   isInitialized
    // });
    
    // ✅ 修复：检查是否应该加载（避免重复加载）
    if (audioRef.current && previousFileIdRef.current === fileId && !isAutoSwitch) {
      return;
    }
    
    // ✅ 修复：在加载新音频前，先停止所有正在播放的音频，避免多个音频同时播放
    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach((audioEl) => {
        if (!audioEl.paused && audioEl !== audioRef.current) {
          try {
            audioEl.pause();
            audioEl.currentTime = 0;
          } catch (e) {
            console.warn('[AudiobookPlayer] 停止其他音频失败:', e);
          }
        }
      });
    }
    
    setLoading(true);
    
    // ✅ 修复：记录切换前的文件ID
    const previousFileId = previousFileIdRef.current;
    
    // ✅ 修复：如果是切换文件（不是首次加载），先停止旧音频并保存进度
    if (previousFileId && previousFileId !== fileId) {
      // console.log('[AudiobookPlayer] 切换文件，停止旧音频并保存进度', {
      //   oldFileId: previousFileId,
      //   newFileId: fileId,
      //   isAutoSwitch
      // });
      
      // ✅ 修复：先停止旧音频，确保不会同时播放多个音频
      if (audioRef.current) {
        try {
          // 停止旧音频播放
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          // console.log('[AudiobookPlayer] 已停止旧音频', { oldFileId: previousFileId });
        } catch (e) {
          console.warn('[AudiobookPlayer] 停止旧音频失败:', e);
        }
      }
      
      // 先保存旧文件的播放进度
      if (audioRef.current && audioRef.current.duration > 0) {
        try {
          // ✅ 修复：保存旧文件的进度（不使用forceSave，但标记为切换文件）
          await saveProgress(
            audioRef.current.currentTime, 
            audioRef.current.duration, 
            previousFileId,
            false,
            true // 标记为切换文件
          );
        } catch (e) {
          console.error('[AudiobookPlayer] 切换文件时保存旧文件进度失败', e);
        }
      }
      
      // ✅ 修复：停止所有其他正在播放的音频（双重保险）
      if (typeof document !== 'undefined') {
        const allAudios = document.querySelectorAll('audio');
        allAudios.forEach((audioEl) => {
          if (audioEl !== audioRef.current && !audioEl.paused) {
            try {
              // console.log('[AudiobookPlayer] 停止其他正在播放的音频', {
              //   src: audioEl.src.substring(0, 50)
              // });
              audioEl.pause();
              audioEl.currentTime = 0;
            } catch (e) {
              console.warn('[AudiobookPlayer] 停止其他音频失败:', e);
            }
          }
        });
      }
    }
    
    // ✅ 修复：对于切换文件的情况，需要更新last_file_id（但不创建无效的进度记录）
    if (previousFileId !== fileId) {
      try {
        // ✅ 修复：使用 updateLastFileIdOnly 参数，只更新 last_file_id，不创建或更新进度记录
        // 这样可以避免创建无效的进度记录（0.01/1），导致刷新页面时恢复错误的进度
        await api.post(`/audiobooks/${audiobookId}/progress`, {
          fileId: fileId,
          currentTime: 0,
          duration: 0,
          updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id，不更新进度记录
        });
        // console.log('[AudiobookPlayer] last_file_id已更新（不创建进度记录）', {
        //   fileId,
        //   previousFileId: previousFileId || '首次加载'
        // });
        
        // ✅ 修复：同步更新本地缓存，确保缓存与后端 last_file_id 一致
        try {
          saveOfflineState(fileId, 0, 0);
          // console.log('[AudiobookPlayer] 本地缓存已同步更新（loadAudio切换文件）', {
          //   fileId
          // });
        } catch (cacheError) {
          console.warn('[AudiobookPlayer] 更新本地缓存失败（不影响主流程）', cacheError);
        }
      } catch (e) {
        console.error('[AudiobookPlayer] 更新last_file_id失败', e);
        // 降级方案：如果后端不支持 updateLastFileIdOnly，使用 saveProgress 但不创建进度记录
        // 注意：这里不应该创建进度记录，因为文件还没有开始播放
      }
    }
    
    // ✅ 修复：更新previousFileIdRef
    previousFileIdRef.current = fileId;
    
    // 记录加载开始
    // console.log('[AudiobookPlayer] 开始加载音频', {
    //   fileId,
    //   audiobookId,
    //   isAutoPlayNext: autoPlayNextRef.current,
    //   isPWA: window.matchMedia('(display-mode: standalone)').matches,
    //   documentHidden: document.hidden
    // });

    // 检查是否可以复用现有的全局音频实例
    if (globalAudioManager.canReuse(audiobookId, fileId)) {
      const instance = globalAudioManager.getInstance();
      if (instance && instance.audio) {
        const existingAudio = instance.audio;
        audioRef.current = existingAudio;
        setLoading(false);
        
        // ✅ 修复：从音频元素同步最新的播放状态和进度
        const actualPlaying = !existingAudio.paused && 
                             existingAudio.currentTime > 0 && 
                             !existingAudio.ended &&
                             existingAudio.readyState >= 2;
        const actualCurrentTime = existingAudio.currentTime || 0;
        const actualDuration = existingAudio.duration || 0;
        
        setPlayerPlaying(actualPlaying);
        setCurrentTimeState(actualCurrentTime);
        setDurationState(actualDuration);
        
        // 更新全局进度和状态
        setProgress(actualCurrentTime, actualDuration);
        setPlaying(actualPlaying);
        
        // console.log('[AudiobookPlayer] 复用音频实例，同步状态', {
        //   fileId,
        //   actualPlaying,
        //   actualCurrentTime,
        //   actualDuration,
        //   paused: existingAudio.paused,
        //   readyState: existingAudio.readyState
        // });
        
        // 如果是自动续播下一首，确保音频正在播放
        if (autoPlayNextRef.current && existingAudio.paused) {
          existingAudio.play().then(() => {
            setPlayerPlaying(true);
            setAutoPlayNext(false);
            autoPlayNextRef.current = false;
          }).catch((e) => {
            console.warn('[AudiobookPlayer] 复用音频实例：自动播放失败', e);
            // 失败时等待canplaythrough处理
          });
        } else if (autoPlayNextRef.current && !existingAudio.paused) {
          // 已经在播放，清除标志
          setAutoPlayNext(false);
          autoPlayNextRef.current = false;
        }
        
        // 确保 timeupdate 事件监听器存在（即使复用音频实例也要绑定）
        // 移除旧的监听器（如果有）（使用类型安全的接口）
        const existingAudioWithHandlers = existingAudio as AudioElementWithHandlers;
        const existingHandler = existingAudioWithHandlers.__timeupdateHandler;
        if (existingHandler) {
          existingAudio.removeEventListener('timeupdate', existingHandler);
        }
        
        // ✅ 修复：添加播放和暂停事件监听器（复用音频实例时）
        const playHandler = () => {
          if (audioRef.current === existingAudio) {
            setPlayerPlaying(true);
          }
        };
        
        const pauseHandler = () => {
          if (audioRef.current === existingAudio) {
            setPaused();
          }
        };
        
        const playingHandler = () => {
          if (audioRef.current === existingAudio) {
            setPlayerPlaying(true);
          }
        };
        
        // 清理旧的事件监听器（如果有）
        if (existingAudioWithHandlers.__playHandler) {
          existingAudio.removeEventListener('play', existingAudioWithHandlers.__playHandler);
        }
        if (existingAudioWithHandlers.__pauseHandler) {
          existingAudio.removeEventListener('pause', existingAudioWithHandlers.__pauseHandler);
        }
        if (existingAudioWithHandlers.__playingHandler) {
          existingAudio.removeEventListener('playing', existingAudioWithHandlers.__playingHandler);
        }
        
        existingAudio.addEventListener('play', playHandler);
        existingAudio.addEventListener('pause', pauseHandler);
        existingAudio.addEventListener('playing', playingHandler);
        existingAudioWithHandlers.__playHandler = playHandler;
        existingAudioWithHandlers.__pauseHandler = pauseHandler;
        existingAudioWithHandlers.__playingHandler = playingHandler;
        
        // 创建新的 timeupdate 处理函数
        const timeupdateHandler = () => {
          if (audioRef.current === existingAudio) {
            const currentTime = existingAudio.currentTime;
            setCurrentTimeState(currentTime);

            // ✅ 修复：实时更新fileProgresses状态，确保播放列表中的进度条同步更新
            const duration = existingAudio.duration || 0;
            if (duration > 0) {
              const progressPercent = (currentTime / duration) * 100;
              setFileProgresses(prev => ({
                ...prev,
                [fileId]: {
                  file_id: fileId,
                  current_time: currentTime,
                  duration: duration,
                  progress: progressPercent,
                  last_played_at: new Date().toISOString(),
                }
              }));
            }
            
            // ✅ 修复：同步播放状态（确保UI状态与音频实际状态一致）
            if (existingAudio.paused && isPlaying) {
              setPaused();
            } else if (!existingAudio.paused && !isPlaying && existingAudio.currentTime > 0) {
              setPlayerPlaying(true);
            }
            
            // ✅ 修复：只有在播放状态下才启用30秒防抖保存机制
            if (!existingAudio.paused) {
              const now = Date.now();
              if (now - lastSaveTimeRef.current >= 30000) {
                // 清除之前的定时器
                if (saveProgressTimeoutRef.current) {
                  clearTimeout(saveProgressTimeoutRef.current);
                }
                // 延迟500ms保存，避免频繁触发
                saveProgressTimeoutRef.current = setTimeout(() => {
                  // ✅ 修复：显式传入fileId，确保保存到正确的文件
                  saveProgress(existingAudio.currentTime, existingAudio.duration, fileId);
                  lastSaveTimeRef.current = Date.now();
                }, 500);
              }
            }
          }
        };
        
        // 保存处理函数引用，以便后续移除
        existingAudioWithHandlers.__timeupdateHandler = timeupdateHandler;
        existingAudio.addEventListener('timeupdate', timeupdateHandler);
        
        return;
      }
    }

    // 停止当前播放并清理旧的事件监听器
    if (audioRef.current) {
      const oldAudio = audioRef.current;
      
      // ✅ 修复：使用统一的清理函数清理事件监听器
      cleanupAudioEventListeners(oldAudio);
      
      // ✅ 修复：清理PWA事件处理器
      if (pwaAudioHandlersCleanupRef.current) {
        pwaAudioHandlersCleanupRef.current();
        pwaAudioHandlersCleanupRef.current = null;
      }
      
      // ✅ 修复：使用统一的清理函数清理事件监听器
      cleanupAudioEventListeners(oldAudio);
      
      // ✅ 修复：清理后台检测定时器
      if (backgroundCheckIntervalRef.current) {
        clearInterval(backgroundCheckIntervalRef.current);
        backgroundCheckIntervalRef.current = null;
      }
      
      oldAudio.pause();
      oldAudio.src = '';
      oldAudio.load();
      audioRef.current = null;
    }

    try {
      // ✅ 修复：如果初始化时已从API获取过进度（hasProgressFromAPI），直接使用传入的startTime
      // 否则，如果 startTimeFromAPI 为 undefined/null，需要从API获取
      // 注意：startTimeFromAPI 可能是 0（表示从头开始），这是有效值，不应该再次获取
      const hasInitialStartTime = startTimeFromAPI !== undefined && startTimeFromAPI !== null;
      let startTime = hasInitialStartTime ? startTimeFromAPI : 0;
      let startTimeSource = hasInitialStartTime ? 'startTimeFromAPI（初始化）' : '未初始化';
      
      // ✅ 修复：只有在初始化时没有获取到进度时，才从API获取
      // 如果 startTimeFromAPI 是数字（包括 0），说明已经获取过进度了，应该信任这个结果
      const shouldFetchFromAPI = !hasInitialStartTime && !isAutoSwitch;
      
      if (shouldFetchFromAPI) {
        // ✅ 修复：获取特定文件的播放进度（每个文件独立进度）
        try {
          const progressResponse = await api.get(`/audiobooks/${audiobookId}/progress`, {
            params: { fileId }
          });
          
          if (progressResponse.data.success && progressResponse.data.progress) {
            const progress = progressResponse.data.progress;
            // 确保是当前文件的进度
            if (progress.file_id === fileId) {
              // ✅ 修复：如果进度是100%，从头开始播放；否则从保存的进度位置开始播放
              // 优先使用后端返回的 progress 字段（百分比），如果没有则计算
              const progressPercent = progress.progress !== undefined && progress.progress !== null
                ? progress.progress  // 后端返回的百分比（0-100）
                : (progress.duration > 0 
                    ? (progress.current_time / progress.duration) * 100 
                    : 0);
              
              if (progressPercent >= 100) {
                // 进度已完成（100%），从头开始播放
                startTime = 0;
                startTimeSource = 'API（已完成，从头开始）';
                
                // 清除保存的进度，从头开始
                try {
                  await api.post(`/audiobooks/${audiobookId}/progress`, {
                    fileId: fileId,
                    currentTime: 0,
                    duration: progress.duration,
                  });
                } catch (e) {
                  console.warn('[AudiobookPlayer] 清除进度失败:', e);
                }
              } else {
                // ✅ 修复：无论 current_time 是否为 0，都使用它（0 表示从头开始，>0 表示断点续播）
                startTime = progress.current_time || 0;
                startTimeSource = startTime > 0 ? 'API（断点续播）' : 'API（无进度，从头开始）';
                // console.log('[AudiobookPlayer] ✅ 从API获取到播放进度', {
                //   fileId,
                //   startTime,
                //   current_time: progress.current_time,
                //   duration: progress.duration,
                //   progressPercent: progressPercent.toFixed(2) + '%',
                //   source: startTimeSource
                // });
              }
            } else {
              // 不是当前文件的进度，从头开始
              startTime = 0;
              startTimeSource = 'API（文件不匹配，从头开始）';
            }
          } else {
            // API没有返回进度，从头开始
            startTime = 0;
            startTimeSource = 'API（无进度记录，从头开始）';
          }
        } catch (apiError: any) {
          // ✅ 修复：API调用失败时，记录警告但不影响加载
          console.warn('[AudiobookPlayer] 获取播放进度失败（将从0开始）', {
            fileId,
            error: apiError?.message || '未知错误'
          });
          startTime = 0;
          startTimeSource = 'API调用失败（从头开始）';
        }
      } else {
        // // ✅ 修复：使用初始化时传入的 startTime（即使是 0，也信任这个结果）
        // console.log('[AudiobookPlayer] 使用初始化时传入的startTime', {
        //   fileId,
        //   startTime,
        //   source: startTimeSource,
        //   isAutoSwitch,
        //   startTimeFromAPI
        // });
      }
      
      // ✅ 修复：重置用户手动拖动标志（切换文件时重置）
      userManuallySeekedRef.current = false;

      // 创建音频元素
      // 使用 getFullApiUrl 构建完整的音频URL，支持自定义API服务器地址
      const audioUrl = getFullApiUrl(`/audiobooks/${audiobookId}/files/${fileId}`);
      
      // 获取认证头（包括Authorization和API Key）
      const authHeaders = getAuthHeaders();

      const audio = new Audio();
      audioRef.current = audio;
      
      // ✅ 修复：设置PWA专用事件处理器
      const cleanupPWASetup = setupPWAAudioHandlers(audio, fileId);
      if (cleanupPWASetup) {
        pwaAudioHandlersCleanupRef.current = cleanupPWASetup;
      }
      
      // 保存到全局音频管理器（会自动停止旧的音频）
      globalAudioManager.setInstance(audiobookId, fileId, audio);

      // 设置音频属性
      audio.preload = 'auto';
      audio.volume = isMuted ? 0 : volume;
      audio.playbackRate = playbackRate;
      // 启用后台播放支持（PWA模式）
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');

      // 设置音频源（带认证）
      // 优先使用预缓存的音频，如果没有则从服务器获取
      const cached = preloadCacheRef.current.get(fileId);
      let blobUrl: string | null = null;
      
      if (cached) {
        // 使用预缓存的音频
        blobUrl = cached.url;
        audio.src = blobUrl;
        // console.log('[AudiobookPlayer] 使用预缓存的音频', { 
        //   fileId, 
        //   fileName: currentFile?.file_name,
        //   blobSize: cached.blob.size 
        // });
      } else {
        // 从服务器获取音频
        const headers: HeadersInit = {
          ...authHeaders,
        };
        
        try {
          // ✅ 修复：添加超时和重试逻辑
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
          
          let response: Response;
          try {
            response = await fetch(audioUrl, {
              headers,
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            // ✅ 修复：检查是否是网络连接错误（ERR_CONNECTION_REFUSED）
            const isConnectionRefused = fetchError.message?.includes('ERR_CONNECTION_REFUSED') ||
                                      fetchError.message?.includes('Failed to fetch') ||
                                      fetchError.name === 'TypeError';
            
            // ✅ 修复：如果是网络连接错误，检查网络状态，如果离线则直接抛出错误，不重试
            if (isConnectionRefused && !navigator.onLine) {
              console.warn('[AudiobookPlayer] 网络离线，跳过重试', { 
                fileId, 
                error: fetchError.message,
                errorName: fetchError.name 
              });
              throw new Error('网络离线，无法加载音频');
            }
            
            // ✅ 修复：如果是网络错误或超时，尝试重试一次（最多重试2次）
            if (fetchError.name === 'AbortError' || 
                fetchError.message?.includes('Failed to fetch') ||
                fetchError.message?.includes('ERR_FAILED') ||
                fetchError.message?.includes('ERR_CONNECTION_REFUSED')) {
              console.warn('[AudiobookPlayer] fetch请求失败，尝试重试', { 
                fileId, 
                error: fetchError.message,
                errorName: fetchError.name 
              });
              // 等待1秒后重试
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                // 重试时不使用超时控制，避免再次超时
                response = await fetch(audioUrl, { headers: fetchHeaders });
              } catch (retryError: any) {
                // ✅ 修复：如果是连接拒绝错误，不记录详细错误日志
                const isRetryConnectionRefused = retryError.message?.includes('ERR_CONNECTION_REFUSED');
                if (!isRetryConnectionRefused) {
                  console.error('[AudiobookPlayer] 重试也失败', { 
                    fileId, 
                    error: retryError.message 
                  });
                }
                throw fetchError; // 抛出原始错误
              }
            } else {
              throw fetchError;
            }
          }
          
          if (response.ok) {
            // ✅ 修复：检查响应是否真的成功（处理 ERR_FAILED 200 的情况）
            if (!response.body) {
              throw new Error('响应体为空');
            }
            
            const blob = await response.blob();
            
            // ✅ 修复：检查blob是否为空
            if (blob.size === 0) {
              throw new Error('音频文件为空');
            }
            
            // 确保FLAC等格式的MIME类型正确
            // 从响应头获取Content-Type，如果没有则根据文件扩展名推断
            let blobType = blob.type;
            if (!blobType || blobType === 'application/octet-stream') {
              const fileExt = currentFile?.file_type?.toLowerCase() || '';
              const mimeTypeMap: { [key: string]: string } = {
                'mp3': 'audio/mpeg',
                'm4a': 'audio/mp4',
                'aac': 'audio/aac',
                'flac': 'audio/flac',
                'wav': 'audio/wav',
                'ogg': 'audio/ogg',
                'opus': 'audio/opus',
                'wma': 'audio/x-ms-wma',
              };
              blobType = mimeTypeMap[fileExt] || 'audio/mpeg';
            }
            
            // 创建正确MIME类型的Blob
            const typedBlob = new Blob([blob], { type: blobType });
            blobUrl = URL.createObjectURL(typedBlob);
            audio.src = blobUrl;
            
            // console.log('[AudiobookPlayer] 音频已加载', { 
            //   fileId, 
            //   fileName: currentFile?.file_name,
            //   fileType: currentFile?.file_type,
            //   blobType,
            //   blobSize: blob.size 
            // });
          } else {
            // HTTP错误，记录详细信息
            const errorText = await response.text().catch(() => '无法读取错误信息');
            console.error('[AudiobookPlayer] HTTP错误', {
              status: response.status,
              statusText: response.statusText,
              fileId,
              audioUrl,
              errorText: errorText.substring(0, 200) // 只记录前200字符
            });
            
            // ✅ 修复：401错误提示用户重新登录
            if (response.status === 401) {
              throw new Error('认证失败，请重新登录');
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error: any) {
          // ✅ 修复：检查是否是网络连接错误
          const isConnectionRefused = error?.message?.includes('ERR_CONNECTION_REFUSED') ||
                                    error?.message?.includes('Failed to fetch') ||
                                    error?.name === 'TypeError';
          
          if (!isConnectionRefused) {
            console.error('[AudiobookPlayer] fetch加载音频失败:', error, {
              fileId,
              audioUrl,
              errorMessage: error?.message,
              errorName: error?.name,
              isAutoPlayNext: autoPlayNextRef.current
            });
          }
          
          // ✅ 修复：如果是401错误，不要尝试降级方案，直接抛出错误
          if (error?.message?.includes('认证失败') || error?.message?.includes('401')) {
            toast.error('认证失败，请重新登录');
            throw error;
          }
          
          // ✅ 修复：如果是网络连接错误，提示用户检查网络，不尝试降级方案
          if (isConnectionRefused) {
            if (!navigator.onLine) {
              toast.error('网络离线，请检查网络连接');
            } else {
              toast.error('无法连接到服务器，请检查网络连接');
            }
            throw error;
          }
          
          // 如果fetch失败，不要直接使用URL（因为浏览器无法发送认证头）
          // 而是抛出错误，让上层处理（如果是自动播放，可以重试）
          // 只有在非自动播放时才尝试降级方案
          if (!autoPlayNextRef.current) {
            // 非自动播放：尝试降级方案（但不适用于401错误和网络连接错误）
            try {
              // 尝试从authHeaders中提取token，添加到URL参数中
              const authHeader = (authHeaders as any)['Authorization'] || '';
              const apiKey = (authHeaders as any)['X-API-Key'] || '';
              const token = authHeader?.replace('Bearer ', '') || apiKey || '';
              
              if (token) {
                const urlWithToken = `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
                audio.src = urlWithToken;
              } else {
                // 如果没有token，直接使用URL（可能因为缺少认证而失败，但这是最后的尝试）
                audio.src = audioUrl;
                console.warn('[AudiobookPlayer] 使用原始URL作为降级方案（可能因缺少认证而失败）', {
                  audioUrl,
                  hasAuthHeader: !!authHeader,
                  hasApiKey: !!apiKey
                });
              }
            } catch (e) {
              console.error('[AudiobookPlayer] 设置音频源失败:', e);
              // 最后的降级方案：直接使用URL
              audio.src = audioUrl;
            }
          } else {
            // 自动播放时，fetch失败应该重试
            // ✅ 修复：如果是网络连接错误，不等待重试，直接抛出错误
            if (isConnectionRefused) {
              throw error;
            }
            console.warn('[AudiobookPlayer] 自动播放时fetch失败，将等待canplaythrough或error事件处理', {
              fileId,
              audioUrl
            });
            // 不设置audio.src，避免触发错误
            // canplaythrough处理器会检查错误并重试
          }
        }
      }
      
      // 清理旧的blob URL 在播放结束时进行（在 handlePlaybackEnded 中处理）
      
      // ✅ 优化：立即预加载下一个音频（不延迟），确保播放完成时下一个音频已准备好
      // ✅ 修复：只有在网络在线时才预加载，避免离线时重复尝试
      const currentIndex = files.findIndex(f => f.id === fileId);
      if (currentIndex >= 0 && navigator.onLine) {
        // 清理当前文件之前的所有缓存（已经播放过的）
        for (let i = 0; i < currentIndex; i++) {
          const prevFileId = files[i].id;
          const cached = preloadCacheRef.current.get(prevFileId);
          if (cached) {
            URL.revokeObjectURL(cached.url);
            preloadCacheRef.current.delete(prevFileId);
          }
        }
        
        // ✅ 优化：立即预加载下一个音频（优先级最高）
        const nextIndex = currentIndex + 1;
        if (nextIndex < files.length) {
          const nextFile = files[nextIndex];
          const nextFileId = nextFile.id;
          
          // 如果下一个文件不在缓存中且未在加载，立即开始预加载
          if (!preloadCacheRef.current.has(nextFileId) && !preloadingRef.current.has(nextFileId)) {
            preloadingRef.current.add(nextFileId);
            
            // 立即开始预加载（不延迟）
            (async () => {
              try {
                const preloadAudioUrl = getFullApiUrl(`/audiobooks/${audiobookId}/files/${nextFileId}`);
                const authHeaders = getAuthHeaders();
                const response = await fetch(preloadAudioUrl, { headers: authHeaders });
                
                if (response.ok) {
                  const blob = await response.blob();
                  
                  // 推断MIME类型
                  let blobType = blob.type;
                  if (!blobType || blobType === 'application/octet-stream') {
                    const fileExt = nextFile.file_type?.toLowerCase() || '';
                    const mimeTypeMap: { [key: string]: string } = {
                      'mp3': 'audio/mpeg',
                      'm4a': 'audio/mp4',
                      'aac': 'audio/aac',
                      'flac': 'audio/flac',
                      'wav': 'audio/wav',
                      'ogg': 'audio/ogg',
                      'opus': 'audio/opus',
                      'wma': 'audio/x-ms-wma',
                    };
                    blobType = mimeTypeMap[fileExt] || 'audio/mpeg';
                  }
                  
                  const typedBlob = new Blob([blob], { type: blobType });
                  const blobUrl = URL.createObjectURL(typedBlob);
                  
                  preloadCacheRef.current.set(nextFileId, {
                    blob: typedBlob,
                    url: blobUrl,
                    mimeType: blobType
                  });
                  
                  preloadingRef.current.delete(nextFileId);
                } else {
                  console.warn(`[AudiobookPlayer] 预加载下一个音频失败: ${nextFile.file_name}, status=${response.status}`);
                  preloadingRef.current.delete(nextFileId);
                }
              } catch (error: any) {
                // ✅ 修复：如果是网络连接错误，静默失败，不记录警告（避免刷屏）
                const isConnectionRefused = error?.message?.includes('ERR_CONNECTION_REFUSED') ||
                                          error?.message?.includes('Failed to fetch') ||
                                          error?.name === 'TypeError';
                
                if (!isConnectionRefused) {
                  console.warn(`[AudiobookPlayer] 预加载下一个音频失败: ${nextFile.file_name}`, {
                    error: error?.message || error,
                    errorName: error?.name,
                    fileId: nextFileId
                  });
                }
                preloadingRef.current.delete(nextFileId);
                // 不抛出错误，让预加载失败不影响主播放
              }
            })();
          }
        }
      }
      
      // ✅ 优化：PWA模式下更早预加载后续音频
      // ✅ 修复：只有在网络在线时才预加载，避免离线时重复尝试
      const isPWAModeForPreload = window.matchMedia('(display-mode: standalone)').matches;
      const preloadDelay = isPWAModeForPreload ? 300 : 1000;
      
      if (navigator.onLine) {
        setTimeout(() => {
          // 预加载后续2个音频（下一个已经在上面预加载了）
          if (currentIndex >= 0) {
            const preloadCount = 2; // 减少到2个，因为下一个已经预加载了
            for (let i = 2; i <= preloadCount + 1; i++) { // 从第2个开始（索引+2，即currentIndex+2和currentIndex+3）
              const nextIndex = currentIndex + i;
              if (nextIndex >= files.length) break;
              
              const nextFile = files[nextIndex];
              const cacheKey = nextFile.id;
              
              // 如果已经在缓存中或正在加载，跳过
              if (preloadCacheRef.current.has(cacheKey) || preloadingRef.current.has(cacheKey)) {
                continue;
              }
              
              // 标记为正在加载
              preloadingRef.current.add(cacheKey);
              
              // 异步预加载
              (async () => {
                try {
                  const preloadAudioUrl = getFullApiUrl(`/audiobooks/${audiobookId}/files/${cacheKey}`);
                  const authHeaders = getAuthHeaders();
                  
                  // ✅ 修复：添加超时和重试逻辑
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
                  
                  let response: Response;
                  try {
                    response = await fetch(preloadAudioUrl, {
                      headers: authHeaders,
                      signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                  } catch (fetchError: any) {
                    clearTimeout(timeoutId);
                    // ✅ 修复：如果是网络连接错误，检查网络状态，如果离线则直接失败
                    const isConnectionRefused = fetchError.message?.includes('ERR_CONNECTION_REFUSED') ||
                                              fetchError.message?.includes('Failed to fetch') ||
                                              fetchError.name === 'TypeError';

                    if (isConnectionRefused && !navigator.onLine) {
                      throw new Error('网络离线');
                    }

                    // 如果是网络错误，尝试重试一次
                    if (fetchError.name === 'AbortError' || fetchError.message?.includes('Failed to fetch')) {
                      // 静默重试，不记录警告（避免刷屏）
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      response = await fetch(preloadAudioUrl, { headers: authHeaders });
                    } else {
                      throw fetchError;
                    }
                  }
                  
                  if (response.ok) {
                    const blob = await response.blob();
                    
                    // 推断MIME类型
                    let blobType = blob.type;
                    if (!blobType || blobType === 'application/octet-stream') {
                      const fileExt = nextFile.file_type?.toLowerCase() || '';
                      const mimeTypeMap: { [key: string]: string } = {
                        'mp3': 'audio/mpeg',
                        'm4a': 'audio/mp4',
                        'aac': 'audio/aac',
                        'flac': 'audio/flac',
                        'wav': 'audio/wav',
                        'ogg': 'audio/ogg',
                        'opus': 'audio/opus',
                        'wma': 'audio/x-ms-wma',
                      };
                      blobType = mimeTypeMap[fileExt] || 'audio/mpeg';
                    }
                    
                    const typedBlob = new Blob([blob], { type: blobType });
                    const blobUrl = URL.createObjectURL(typedBlob);
                    
                    preloadCacheRef.current.set(cacheKey, {
                      blob: typedBlob,
                      url: blobUrl,
                      mimeType: blobType
                    });
                    
                  } else {
                    console.warn(`[AudiobookPlayer] 预缓存失败: ${nextFile.file_name}, status=${response.status}`);
                  }
                } catch (error: any) {
                  // ✅ 修复：如果是网络连接错误，静默失败，不记录警告（避免刷屏）
                  const isConnectionRefused = error?.message?.includes('ERR_CONNECTION_REFUSED') ||
                                            error?.message?.includes('Failed to fetch') ||
                                            error?.message?.includes('网络离线') ||
                                            error?.name === 'TypeError';
                  
                  if (!isConnectionRefused) {
                    console.warn(`[AudiobookPlayer] 预缓存失败: ${nextFile.file_name}`, {
                      error: error?.message || error,
                      errorName: error?.name,
                      fileId: cacheKey
                    });
                  }
                  // 不抛出错误，让预加载失败不影响主播放
                } finally {
                  preloadingRef.current.delete(cacheKey);
                }
              })();
            }
          }
        }, 1000);
      }

      // 处理播放结束的函数（供 ended 事件和 timeupdate 备用检测使用）
      const handlePlaybackEnded = async () => {
        const handlingKey = `handling_${fileId}`;
        if ((window as any)[handlingKey]) {
          return;
        }
        (window as any)[handlingKey] = true;
        
        const isPWAModeLocal = window.matchMedia('(display-mode: standalone)').matches;
        const isBackground = document.hidden;
        // ✅ 修复：检测 Android WebView 环境
        const isAndroidWebViewLocal = /Android/.test(navigator.userAgent) && 
          (document.referrer.includes('android-app://') || 
           (window as any).Capacitor?.getPlatform() === 'android' ||
           (window as any).Android !== undefined);
        
        // console.log('[AudiobookPlayer] 当前音频播放完成', { 
        //   fileId, 
        //   isPWA: isPWAModeLocal,
        //   isBackground,
        //   isAndroidWebView: isAndroidWebViewLocal,
        //   isPlaying: !audio.paused,
        //   isLooping: isLoopingRef.current,
        //   currentTime: audio.currentTime,
        //   duration: audio.duration,
        //   ended: audio.ended
        // });
        
        // ✅ 修复：定义 continuePlaybackHandling 函数（在使用之前定义）
        async function continuePlaybackHandling() {
          const pwaMode = isPWAModeLocal;
          
          // ✅ 修复：PWA模式下更谨慎地处理状态
          if (!pwaMode) {
            // 非PWA模式正常暂停
            audio.pause();
            setPaused();
          } else {
            // PWA模式下，如果音频还在播放，先暂停
            if (!audio.paused) {
              audio.pause();
            }
            // 只更新UI状态，不立即重置播放器状态
            setPaused();
          }
          
          // ✅ 修复：保存当前播放进度（播放完成时）
          // 确保在切换到下一首之前，当前文件的进度和 last_file_id 已保存
          // ✅ 修复：显式传入当前文件的fileId，避免在PWA环境下使用错误的fileId
          if (audio.duration > 0) {
            // console.log('[AudiobookPlayer] 播放完成，保存当前文件完成进度', {
            //   fileId,
            //   duration: audio.duration,
            //   currentTime: audio.currentTime
            // });
            try {
              // ✅ 修复：使用 await 确保进度保存完成后再继续，显式传入fileId
              await saveProgress(audio.duration, audio.duration, fileId);
            } catch (e) {
              console.error('[AudiobookPlayer] 播放完成时保存进度失败', e);
              // 即使保存失败，也继续处理（避免阻塞）
            }
          }
          
          // 循环播放处理
          if (isLoopingRef.current) {
            
            // PWA模式下使用不同的重试策略
            const attemptPlayLoop = (retryCount = 0) => {
              audio.currentTime = 0;
              const maxRetries = isPWAModeLocal || document.hidden ? 8 : 5;
              
              setTimeout(() => {
                if (isLoopingRef.current && audioRef.current === audio) {
                  const playPromise = audio.play();
                  if (playPromise !== undefined) {
                    playPromise.then(() => {
                      setPlayerPlaying(true);
                      (window as any)[handlingKey] = false;
                    }).catch((e) => {
                      console.warn('[AudiobookPlayer] 循环播放失败，重试:', retryCount + 1, { isPWA: isPWAMode });
                      if (retryCount < maxRetries) {
                        attemptPlayLoop(retryCount + 1);
                      } else {
                        setPaused();
                        (window as any)[handlingKey] = false;
                      }
                    });
                  }
                }
              }, isPWAMode ? 200 : 100); // PWA模式下延迟更长
            };
            
            attemptPlayLoop();
            return;
          }
          
          // 自动播放下一集
          const currentIndex = files.findIndex(f => f.id === fileId);
          if (currentIndex >= 0 && currentIndex < files.length - 1) {
            const nextFile = files[currentIndex + 1];
            
            // ✅ 修复：检测是否为 iOS PWA 模式
            const isIOS = isIOSDevice();
            const isIOSPWA = isPWAMode && isIOS;
            
            // console.log('[AudiobookPlayer] 准备自动播放下一集', { 
            //   nextFileId: nextFile.id,
            //   nextFileName: nextFile.file_name,
            //   isPWA: isPWAMode,
            //   isIOS,
            //   isIOSPWA,
            //   isBackground
            // });
            
            // ✅ 修复：检测 Android WebView 环境
            const isAndroidWebView = /Android/.test(navigator.userAgent) && 
              (document.referrer.includes('android-app://') || 
               (window as any).Capacitor?.getPlatform() === 'android' ||
               (window as any).Android !== undefined);
            
            // ✅ 修复：iOS PWA模式下，通过Media Session API触发自动播放
            if (isIOSPWA) {
              
              // 更新Media Session元数据为下一首，这样用户可以通过锁屏控制播放
              try {
                const mediaSession = (navigator as any).mediaSession;
                if (mediaSession) {
                  const MediaMetadataCtor = (window as any).MediaMetadata;
                  if (MediaMetadataCtor) {
                    mediaSession.metadata = new MediaMetadataCtor({
                      title: nextFile.file_name || audiobookTitle || '未知',
                      artist: audiobookAuthor || '未知作者',
                      album: audiobookTitle || '有声小说',
                      artwork: audiobookCover ? [
                        { src: audiobookCover, sizes: '512x512', type: 'image/png' }
                      ] : []
                    });
                    
                    // 设置播放状态为暂停（因为还没开始播放）
                    mediaSession.playbackState = 'paused';
                    
                    
                    // ✅ 修复：尝试通过 Media Session API 自动触发播放
                    // 注意：iOS 可能仍然需要用户交互，但这是最好的尝试
                    setTimeout(() => {
                      try {
                        // 尝试触发 play 操作（如果 Media Session 支持）
                        // 这可能会被 iOS 阻止，但值得尝试
                        if (mediaSession.setActionHandler) {
  
                        }
                      } catch (e) {
                        console.warn('[AudiobookPlayer] iOS PWA模式：尝试触发播放失败', e);
                      }
                    }, 100);
                  }
                }
              } catch (e) {
                console.warn('[AudiobookPlayer] iOS PWA模式：更新Media Session失败', e);
              }
              
              setTimeout(async () => {
                // ✅ 修复：切换文件前，立即更新last_file_id
                try {
                  await api.post(`/audiobooks/${audiobookId}/progress`, {
                    fileId: nextFile.id,
                    currentTime: 0,
                    duration: 0,
                    updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id
                  });
                } catch (e) {
                  console.error('[AudiobookPlayer] iOS PWA模式：更新last_file_id失败', e);
                }
                
                // 设置自动播放标志
                autoPlayNextRef.current = true;
                setAutoPlayNext(true);
                
                // 确保UI状态正确
                setPaused();
                
                // 切换文件
                setCurrentFileIdState(nextFile.id);
                onFileChange(nextFile.id);
                
                // 延长清理时间
                setTimeout(() => {
                  (window as any)[handlingKey] = false;
                }, 10000);
              }, 300);
            } else if (isAndroidWebView) {

              setTimeout(async () => {
                // ✅ 修复：切换文件前，立即更新last_file_id
                try {
                  await api.post(`/audiobooks/${audiobookId}/progress`, {
                    fileId: nextFile.id,
                    currentTime: 0,
                    duration: 0,
                    updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id
                  });
                } catch (e) {
                  console.error('[AudiobookPlayer] Android WebView模式：更新last_file_id失败', e);
                }
                
                // 设置自动播放标志
                autoPlayNextRef.current = true;
                setAutoPlayNext(true);
                
                // 确保UI状态正确
                setPaused();
                
                // 切换文件
                setCurrentFileIdState(nextFile.id);
                onFileChange(nextFile.id);
                
                setTimeout(() => {
                  (window as any)[handlingKey] = false;
                }, 10000); // Android WebView 中等待更久
              }, 300); // Android WebView 中延迟更短，更快切换
            } else if (isPWAMode) {
              // 非iOS的PWA模式
              // 在PWA模式下，延迟切换文件以确保状态稳定
              // ✅ 修复：确保当前文件的进度已保存完成后再切换
              // 注意：continuePlaybackHandling 已经保存了进度，这里不需要重复保存
              setTimeout(async () => {
                // ✅ 修复：切换文件前，立即更新last_file_id
                try {
                  await api.post(`/audiobooks/${audiobookId}/progress`, {
                    fileId: nextFile.id,
                    currentTime: 0,
                    duration: 0,
                    updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id
                  });
                } catch (e) {
                  console.error('[AudiobookPlayer] PWA模式：更新last_file_id失败', e);
                }
                
                // 重置自动播放标志
                autoPlayNextRef.current = true;
                setAutoPlayNext(true);
                
                // 确保UI状态正确
                setPaused();
                
                // 切换文件
                setCurrentFileIdState(nextFile.id);
                onFileChange(nextFile.id);
                
                // 延长清理时间，确保canplaythrough能处理
                setTimeout(() => {
                  (window as any)[handlingKey] = false;
                }, 8000); // PWA模式下等待更久
              }, 500);
            } else {
              // 非PWA模式正常处理
              // ✅ 修复：确保当前文件的进度已保存完成后再切换
              // 注意：continuePlaybackHandling 已经保存了进度，这里不需要重复保存
              // ✅ 修复：切换文件前，立即更新last_file_id
              (async () => {
                try {
                  await api.post(`/audiobooks/${audiobookId}/progress`, {
                    fileId: nextFile.id,
                    currentTime: 0,
                    duration: 0,
                    updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id
                  });
                } catch (e) {
                  console.error('[AudiobookPlayer] 非PWA模式：更新last_file_id失败', e);
                }
                
                autoPlayNextRef.current = true;
                setAutoPlayNext(true);
                setCurrentFileIdState(nextFile.id);
                onFileChange(nextFile.id);
              })();
              
              setTimeout(() => {
                (window as any)[handlingKey] = false;
              }, 3000);
            }
          } else {
            setPaused();
            setAutoPlayNext(false);
            autoPlayNextRef.current = false;
            
            if (!document.hidden) {
              toast.success(t('audiobook.player.playbackComplete'), { icon: '🎉' });
            }
            (window as any)[handlingKey] = false;
          }
        }
        
        // ✅ 修复：调用 continuePlaybackHandling 函数处理播放完成逻辑
        await continuePlaybackHandling();
      };

      // ✅ 修复：添加播放和暂停事件监听器，确保状态实时更新
      const playHandler = () => {
        if (audioRef.current === audio) {
          setPlayerPlaying(true);
        }
      };
      
      const pauseHandler = () => {
        if (audioRef.current === audio) {
          setPaused();
          
          // ✅ 修复：暂停时立即保存播放进度和last_file_id，显式传入fileId
          // 即使 currentTime 为 0 也要保存，以确保 last_file_id 被更新
          if (audio.duration > 0) {
            const currentTime = audio.currentTime || 0;
            saveProgress(currentTime, audio.duration, fileId).catch(e => {
              console.error('[AudiobookPlayer] 暂停事件：保存进度失败', e);
            });
          } else if (fileId) {
            // 即使 duration 为 0（音频未完全加载），也要更新 last_file_id
            saveProgress(0, 0, fileId, true).catch(e => {
              console.error('[AudiobookPlayer] 暂停事件：更新last_file_id失败', e);
            });
          }
        }
      };
      
      const playingHandler = () => {
        if (audioRef.current === audio) {
          setPlayerPlaying(true);

          // 记录播放开始日志（避免重复记录）
          if (fileId && !loggedPlayFilesRef.current.has(fileId)) {
            loggedPlayFilesRef.current.add(fileId);
            logAudiobookAction('audiobook_play', fileId, {
              start_time: audio.currentTime || 0,
              duration: audio.duration || 0
            });
          }
        }
      };
      
      audio.addEventListener('play', playHandler);
      audio.addEventListener('pause', pauseHandler);
      audio.addEventListener('playing', playingHandler);
      const audioWithHandlersNew = audio as AudioElementWithHandlers;
      audioWithHandlersNew.__playHandler = playHandler;
      audioWithHandlersNew.__pauseHandler = pauseHandler;
      audioWithHandlersNew.__playingHandler = playingHandler;
      
      // 创建 timeupdate 处理函数（同时作为播放完成的备用检测机制）
      // 在 PWA/后台模式下，ended 事件可能不会触发，使用 timeupdate 检测播放完成
      let lastCurrentTime = 0;
      let endedCheckCount = 0;
      let endedHandled = false; // 防止重复处理 ended 事件
      
      const timeupdateHandler = () => {
        if (audioRef.current === audio) {
          const currentTime = audio.currentTime;
          setCurrentTimeState(currentTime);
          
          // ✅ 修复：同步播放状态（确保UI状态与音频实际状态一致）
          if (audio.paused && isPlaying) {
            setPaused();
          } else if (!audio.paused && !isPlaying && audio.currentTime > 0) {
            setPlayerPlaying(true);
          }
          
          // PWA/Android WebView模式下使用更灵敏的播放完成检测
          if (audio.duration > 0 && currentTime > 0 && !endedHandled) {
            const timeRemaining = audio.duration - currentTime;
            const pwaMode = isPWAMode();
            
            // ✅ 修复：检测 Android WebView 环境
            const isAndroidWebView = /Android/.test(navigator.userAgent) && 
              (document.referrer.includes('android-app://') || 
               (window as any).Capacitor?.getPlatform() === 'android' ||
               (window as any).Android !== undefined);
            
            // PWA/Android WebView模式下调整阈值和检测逻辑
            let threshold = 1.0;
            let requiredCount = 5;
            
            if (isPWAMode || document.hidden || isAndroidWebView) {
              // PWA/后台/Android WebView模式下更早检测，更容易触发
              // Android WebView 中，ended 事件可能不触发，需要更积极的检测
              threshold = isAndroidWebView ? 3.0 : 2.0; // Android WebView 中增加到3秒
              requiredCount = isAndroidWebView ? 2 : 3; // Android WebView 中减少到2次
            }
            
            if (timeRemaining < threshold && Math.abs(currentTime - lastCurrentTime) < 0.1) {
              endedCheckCount++;
              
              if (endedCheckCount >= requiredCount) {
                // console.log('[AudiobookPlayer] timeupdate检测到播放完成', {
                //   isPWA: isPWAMode,
                //   isBackground: document.hidden,
                //   currentTime,
                //   duration: audio.duration,
                //   threshold
                // });
                
                endedHandled = true;
                endedCheckCount = 0;
                
                // PWA/Android WebView模式下立即处理，不延迟
                if (isPWAMode || document.hidden || isAndroidWebView) {
                  if (audioRef.current === audio && audio.duration > 0) {
                    // Android WebView 中使用更宽松的完成条件
                    const completionThreshold = isAndroidWebView ? 3.0 : (isPWAMode ? 2.5 : 1.0);
                    const isCompleted = audio.currentTime >= audio.duration - completionThreshold || 
                                       audio.ended || 
                                       (audio.paused && audio.currentTime > 0 && 
                                        Math.abs(audio.currentTime - audio.duration) < completionThreshold);
                    
                    if (isCompleted) {
                      // console.log('[AudiobookPlayer] 确认播放完成，触发handlePlaybackEnded', {
                      //   isPWA: isPWAMode,
                      //   isAndroidWebView,
                      //   currentTime: audio.currentTime,
                      //   duration: audio.duration,
                      //   ended: audio.ended
                      // });
                      handlePlaybackEnded();
                    } else {
                      endedHandled = false;
                    }
                  }
                } else {
                  // 非PWA模式下延迟处理
                  setTimeout(() => {
                    if (audioRef.current === audio && audio.duration > 0) {
                      const isCompleted = audio.currentTime >= audio.duration - 0.5 || 
                                       audio.ended || 
                                       (audio.paused && audio.currentTime > 0);
                      
                      if (isCompleted) {
                        handlePlaybackEnded();
                      } else {
                        endedHandled = false;
                      }
                    }
                  }, 100);
                }
              }
            } else {
              endedCheckCount = 0;
            }
            lastCurrentTime = currentTime;
          }
          
          // ✅ 修复：只有在播放状态下才启用30秒防抖保存机制
          if (!audio.paused) {
            const now = Date.now();
            if (now - lastSaveTimeRef.current >= 30000) {
              // 清除之前的定时器
              if (saveProgressTimeoutRef.current) {
                clearTimeout(saveProgressTimeoutRef.current);
              }
              // 延迟500ms保存，避免频繁触发
              saveProgressTimeoutRef.current = setTimeout(() => {
                // ✅ 修复：显式传入fileId，确保保存到正确的文件
                saveProgress(audio.currentTime, audio.duration, fileId);
                lastSaveTimeRef.current = Date.now();
              }, 500);
            }
          }
        }
      };
      
      // 保存处理函数引用，以便后续移除
      const audioWithHandlersTimeupdate = audio as AudioElementWithHandlers;
      audioWithHandlersTimeupdate.__timeupdateHandler = timeupdateHandler;
      audio.addEventListener('timeupdate', timeupdateHandler);
      
      // 当音频重新加载时，重置 endedHandled 标志
      const loadstartHandler = () => {
        endedHandled = false;
        endedCheckCount = 0;
        lastCurrentTime = 0;
      };
      
      audio.addEventListener('loadstart', loadstartHandler);
      (audio as any).__loadstartHandler = loadstartHandler;

      // 事件监听：loadedmetadata - 音频元数据加载完成
      const loadedmetadataHandler = () => {
        // ✅ 修复：检查当前音频是否仍然是活动音频（防止切换文件后旧音频的事件触发）
        if (audioRef.current !== audio) {
          // console.log('[AudiobookPlayer] loadedmetadata: 忽略旧音频事件', {
          //   currentAudio: audioRef.current?.src?.substring(0, 50),
          //   eventAudio: audio.src?.substring(0, 50),
          //   fileId
          // });
          return;
        }
        
        const audioDuration = audio.duration;
        setDurationState(audioDuration);
        // ✅ 修复：在loadedmetadata时设置播放位置，但需要确保duration有效，且用户没有手动拖动过
        // 注意：即使 startTime 为 0，也要确保 audio.currentTime 被设置为 0（避免某些浏览器默认值）
        // PWA模式下，可能需要更强制地设置播放位置
        const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
        if (audioDuration > 0 && !userManuallySeekedRef.current) {
          if (startTime > 0) {
            // 确保startTime不超过duration
            const safeStartTime = Math.min(startTime, audioDuration - 0.1);
            if (safeStartTime > 0) {
              // ✅ 修复：PWA模式下，如果当前位置与目标位置差距较大，强制设置
              // PC模式下，如果差距较小，也设置，确保精度
              const threshold = isPWAMode ? 0.5 : 0.1;
              if (Math.abs(audio.currentTime - safeStartTime) > threshold) {
                audio.currentTime = safeStartTime;
                setCurrentTimeState(safeStartTime);
                // console.log('[AudiobookPlayer] ✅ loadedmetadata: 恢复播放位置', {
                //   startTime: safeStartTime,
                //   duration: audioDuration,
                //   fileId,
                //   source: 'loadedmetadata',
                //   isPWAMode,
                //   threshold,
                //   previousTime: audio.currentTime
                // });
              }
            }
          } else {
            // startTime 为 0，确保从开头播放
            // ✅ 修复：PWA模式下，如果当前位置大于0.5秒，强制重置到0
            const threshold = isPWAMode ? 0.5 : 0.1;
            if (audio.currentTime > threshold) {
              audio.currentTime = 0;
              setCurrentTimeState(0);
            }
          }
        }
        setLoading(false);
        
        // ✅ 修复：如果是自动续播下一首，在loadedmetadata时也尝试播放（作为canplaythrough的备用）
        // 注意：主要依赖canplaythrough事件，这里只是备用方案
        // 但需要确保初始化已完成，避免进度不准确时自动播放
        if (autoPlayNextRef.current && audioRef.current === audio && audio.readyState >= 2 && isInitialized && !isInitializing) {
          // 延迟一小段时间，确保音频已准备好
          setTimeout(() => {
            if (autoPlayNextRef.current && audioRef.current === audio && isInitialized && !isInitializing) {
              // 检查音频是否已经在播放
              if (!audio.paused && audio.currentTime > 0) {
                // 音频已经在播放，不需要额外操作
                setPlayerPlaying(true);
                setAutoPlayNext(false);
                autoPlayNextRef.current = false;
              } else if (audio.readyState >= 2 && !audio.error) {
                // 音频已准备好但未播放，尝试播放（作为canplaythrough的备用）
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                  playPromise.then(() => {
                    setPlayerPlaying(true);
                    setAutoPlayNext(false);
                    autoPlayNextRef.current = false;
                  }).catch((e) => {
                    console.warn('[AudiobookPlayer] loadedmetadata: 自动播放失败，等待canplaythrough', e);
                    // 失败时等待canplaythrough处理，不重置autoPlayNextRef
                  });
                }
              }
            }
          }, 150);
        }
        
        // 如果当前文件的duration为空或0，更新到数据库
        if (audioDuration > 0 && currentFile && (!currentFile.duration || currentFile.duration === 0)) {
          api.post(`/audiobooks/${audiobookId}/files/${fileId}/duration`, { _method: 'PUT',  duration: audioDuration  })
            .then(() => {
              // 更新本地文件信息
              if (currentFile) {
                currentFile.duration = audioDuration;
              }
            })
            .catch((error) => {
              console.error('更新音频文件时长失败:', error);
            });
        }
      };
      
      audio.addEventListener('loadedmetadata', loadedmetadataHandler);
      (audio as any).__loadedmetadataHandler = loadedmetadataHandler;
      
      // 事件监听：canplaythrough - 音频可以完整播放（这是更可靠的自动播放时机）
      // 在 PWA 模式下，应该等待 canplaythrough 而不是仅仅 loadedmetadata
      const canplaythroughHandler = () => {
        // ✅ 修复：检查当前音频是否仍然是活动音频（防止切换文件后旧音频的事件触发）
        if (audioRef.current !== audio) {
          return;
        }
        
        const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
        
        // ✅ 修复：在canplaythrough时再次确保播放位置正确（作为loadedmetadata的备用）
        // 但只有在用户没有手动拖动过进度条时才恢复位置
        // PWA模式下，可能需要更强制地设置播放位置，因为事件触发顺序可能不同
        if (audio.duration > 0 && !userManuallySeekedRef.current) {
          if (startTime > 0) {
            // ✅ 修复：PWA模式下，如果当前位置与目标位置差距较大（>0.5秒），强制重新设置
            // PC模式下，如果差距较小（>0.1秒），也重新设置，确保精度
            const threshold = isPWAMode ? 0.5 : 0.1;
            if (Math.abs(audio.currentTime - startTime) > threshold) {
              const safeStartTime = Math.min(startTime, audio.duration - 0.1);
              if (safeStartTime > 0) {
                audio.currentTime = safeStartTime;
                setCurrentTimeState(safeStartTime);
              }
            }
          } else {
            // startTime 为 0，确保从开头播放
            // ✅ 修复：PWA模式下，如果当前位置大于0.5秒，强制重置到0
            const threshold = isPWAMode ? 0.5 : 0.1;
            if (audio.currentTime > threshold) {
              audio.currentTime = 0;
              setCurrentTimeState(0);
            }
          }
        }
        
        // ✅ 修复：确保初始化完成后再允许自动播放
        if (autoPlayNextRef.current && audioRef.current === audio && isInitialized && !isInitializing) {
          
          // ✅ 修复：PWA模式下的状态不一致处理
          if (isPlaying && audio.paused) {
            console.warn('[AudiobookPlayer] 检测到状态不一致，先同步状态', {
              isPlaying,
              audioPaused: audio.paused,
              currentTime: audio.currentTime
            });
            
            if (isPWAMode) {
              // PWA模式下，如果音频已暂停但UI显示播放，尝试恢复播放
              if (autoPlayNextRef.current && audio.paused) {
                const playPromise = audio.play();
                playPromise.then(() => {
                }).catch(e => {
                  console.warn('[AudiobookPlayer] PWA模式状态恢复失败:', e);
                  setPaused();
                });
              } else {
                setPaused();
              }
            } else {
              setPaused();
            }
          }
          
          // PWA模式下使用更激进的自动播放策略
          const attemptAutoPlay = (retryCount = 0) => {
            // ✅ 修复：确保初始化完成后再允许自动播放
            if (!isInitialized || isInitializing) {
              // console.log('[AudiobookPlayer] 初始化未完成，跳过自动播放', {
              //   isInitialized,
              //   isInitializing,
              //   retryCount
              // });
              return;
            }
            
            // ✅ 修复：检测是否为 iOS PWA 模式
            const isIOS = isIOSDevice();
            const isIOSPWA = isPWAMode && isIOS;
            
            // ✅ 修复：检测 Android WebView 环境
            const isAndroidWebView = /Android/.test(navigator.userAgent) && 
              (document.referrer.includes('android-app://') || 
               (window as any).Capacitor?.getPlatform() === 'android' ||
               (window as any).Android !== undefined);
            
            // iOS PWA模式下，由于自动播放限制，减少重试次数（主要依赖Media Session）
            // Android WebView 中，增加重试次数和更短的延迟（因为通常可以自动播放）
            // 非iOS PWA模式保持原有策略
            const maxRetries = isIOSPWA ? 5 : (isAndroidWebView ? 30 : (isPWAMode ? 25 : 10));
            const retryDelay = isAndroidWebView ? 
              Math.min(400 * (retryCount + 1), 5000) : // Android WebView 中更短的延迟
              (isPWAMode ? 
                Math.min(800 * (retryCount + 1), 10000) : 
                Math.min(500 * (retryCount + 1), 3000));
            
            if (autoPlayNextRef.current && 
                audioRef.current === audio && 
                audio.src && 
                !audio.error && 
                audio.readyState >= 2 &&
                isInitialized &&
                !isInitializing) {
              
              // ✅ 修改：确保音频已暂停，然后再播放
              if (!audio.paused) {
                console.warn('[AudiobookPlayer] 音频未暂停，先暂停', { currentTime: audio.currentTime });
                audio.pause();
                setPaused();
              }
              
              // ✅ 修复：iOS PWA模式下，尝试自动播放，但主要依赖Media Session
              const isIOS = isIOSDevice();
              const isIOSPWA = isPWAMode && isIOS;
              
              // ✅ 修复：检测 Android WebView 环境
              const isAndroidWebView = /Android/.test(navigator.userAgent) && 
                (document.referrer.includes('android-app://') || 
                 (window as any).Capacitor?.getPlatform() === 'android' ||
                 (window as any).Android !== undefined);
              
              // Android WebView 中，通常可以自动播放，直接尝试
              // iOS PWA模式下，如果自动播放失败，提示用户使用锁屏控制
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise.then(() => {
                  // PWA/Android WebView模式下验证播放状态
                  const verifyDelay = isAndroidWebView ? 300 : (isPWAMode ? 500 : 200);
                  setTimeout(() => {
                    if (!audio.paused && audio.currentTime > 0) {
                      setPlayerPlaying(true);
                      setAutoPlayNext(false);
                      autoPlayNextRef.current = false;
                    } else if (retryCount < maxRetries) {
                      console.warn('[AudiobookPlayer] 播放验证失败，重试', {
                        paused: audio.paused,
                        currentTime: audio.currentTime,
                        readyState: audio.readyState,
                        isIOSPWA,
                        isAndroidWebView,
                        retryCount,
                        maxRetries
                      });
                      setTimeout(() => attemptAutoPlay(retryCount + 1), retryDelay);
                    } else {
                      if (isIOSPWA) {
                        // iOS PWA模式下，保持自动播放标志，等待用户通过Media Session播放
                        // 不重置autoPlayNextRef，这样用户点击锁屏播放按钮时可以继续
                      } else if (isAndroidWebView) {
                        console.error('[AudiobookPlayer] Android WebView模式：自动播放最终失败，但保持自动播放标志以便重试', {
                          paused: audio.paused,
                          currentTime: audio.currentTime,
                          readyState: audio.readyState
                        });
                        // Android WebView 中，即使失败也保持标志，等待音频准备好后重试
                        // 不立即重置，给音频更多时间准备
                      } else {
                        console.error('[AudiobookPlayer] 自动播放最终失败，重置状态');
                        setPaused();
                        setAutoPlayNext(false);
                        autoPlayNextRef.current = false;
                      }
                    }
                  }, verifyDelay);
                }).catch((e) => {
                  const isIOS = isIOSDevice();
                  const isIOSPWA = isPWAMode && isIOS;
                  
                  // ✅ 修复：检测 Android WebView 环境
                  const isAndroidWebView = /Android/.test(navigator.userAgent) && 
                    (document.referrer.includes('android-app://') || 
                     (window as any).Capacitor?.getPlatform() === 'android' ||
                     (window as any).Android !== undefined);
                  
                  console.warn('[AudiobookPlayer] 自动播放失败:', e.name, {
                    retryCount,
                    maxRetries,
                    paused: audio.paused,
                    isIOSPWA,
                    isAndroidWebView
                  });
                  
                  // 确保状态正确
                  setPaused();
                  
                  // iOS PWA模式下，NotAllowedError是正常的（需要用户交互）
                  if (isIOSPWA && e.name === 'NotAllowedError') {
                    // 保持autoPlayNextRef，等待用户通过Media Session播放
                    // 不重置标志，这样用户点击锁屏播放按钮时可以继续
                    return;
                  }
                  
                  // Android WebView 中，大多数错误都应该重试（因为通常支持自动播放）
                  // PWA模式下更多错误类型应该重试
                  const shouldRetryPWA = [
                    'NotAllowedError', 'NotSupportedError', 'AbortError',
                    'NotReadableError', 'NetworkError', 'TypeError',
                    'InvalidStateError', 'SecurityError'
                  ].includes(e.name);
                  
                  // Android WebView 中，几乎所有错误都重试（除了真正的致命错误）
                  const shouldRetry = isAndroidWebView ? 
                    !['MediaError'].includes(e.name) : // Android WebView 中重试几乎所有错误
                    ((isPWAMode && shouldRetryPWA) || 
                     (!isPWAMode && ['NotAllowedError', 'NotSupportedError', 'AbortError'].includes(e.name)));
                  
                  if (shouldRetry) {
                    if (retryCount < maxRetries) {
    
                      setTimeout(() => attemptAutoPlay(retryCount + 1), retryDelay);
                    } else {
                      if (!isIOSPWA) {
                        if (isAndroidWebView) {
                          console.warn('[AudiobookPlayer] Android WebView模式：达到最大重试次数，但保持自动播放标志以便后续重试');
                          // Android WebView 中，即使达到最大重试次数，也保持标志
                          // 因为可能是音频还没准备好，稍后可能会成功
                        } else {
                          setAutoPlayNext(false);
                          autoPlayNextRef.current = false;
                        }
                      }
                    }
                  } else {
                    if (!isIOSPWA && !isAndroidWebView) {
                      setAutoPlayNext(false);
                      autoPlayNextRef.current = false;
                    } else if (isAndroidWebView) {
                      console.warn('[AudiobookPlayer] Android WebView模式：遇到致命错误，但保持自动播放标志');
                    }
                  }
                });
              }
            } else {
              // 音频未准备好，等待后重试
              if (retryCount < maxRetries) {
                setTimeout(() => attemptAutoPlay(retryCount + 1), retryDelay);
              } else {
                console.error('[AudiobookPlayer] 音频未准备好，取消自动播放');
                setPaused();
                setAutoPlayNext(false);
                autoPlayNextRef.current = false;
              }
            }
          };
          
          // ✅ 修复：检测 Android WebView 环境
          const isAndroidWebView = /Android/.test(navigator.userAgent) && 
            (document.referrer.includes('android-app://') || 
             (window as any).Capacitor?.getPlatform() === 'android' ||
             (window as any).Android !== undefined);
          
          // PWA/Android WebView模式下立即开始尝试播放
          // Android WebView 中延迟更短，更快开始播放
          const startDelay = isAndroidWebView ? 50 : (isPWAMode ? 100 : 50);
          setTimeout(() => attemptAutoPlay(0), startDelay);
        }
      };
      
      audio.addEventListener('canplaythrough', canplaythroughHandler);
      (audio as any).__canplaythroughHandler = canplaythroughHandler;

      // 绑定 ended 事件（主要机制）
      // 在 PWA/后台模式下，ended 事件可能不会触发，所以 timeupdate 作为备用机制
      audio.addEventListener('ended', handlePlaybackEnded);
      (audio as any).__endedHandler = handlePlaybackEnded;
      
      // ✅ 修复：PWA/后台/Android WebView模式下，添加定期检查机制（因为timeupdate在后台可能停止触发）
      const isPWAModeForCheck = window.matchMedia('(display-mode: standalone)').matches;
      // ✅ 修复：检测 Android WebView 环境（APK模式）
      const isAndroidWebView = /Android/.test(navigator.userAgent) && 
        (document.referrer.includes('android-app://') || 
         (window as any).Capacitor?.getPlatform() === 'android' ||
         (window as any).Android !== undefined);
      
      if (isPWAModeForCheck || document.hidden || isAndroidWebView) {
        // 清除旧的定时器
        if (backgroundCheckIntervalRef.current) {
          clearInterval(backgroundCheckIntervalRef.current);
        }
        
        // Android WebView 中，即使在前台，timeupdate 也可能不稳定
        backgroundCheckIntervalRef.current = setInterval(() => {
          if (audioRef.current === audio && audio.duration > 0) {
            // ✅ 修复：Android WebView 中，即使 paused 也要检查（可能 ended 事件未触发）
            const currentTime = audio.currentTime;
            const duration = audio.duration;
            const timeRemaining = duration - currentTime;
            
            // Android WebView 中，使用更宽松的检测条件
            const threshold = isAndroidWebView ? 2.0 : 1.0;
            
            // 如果接近播放完成或已经结束
            if ((timeRemaining <= threshold && timeRemaining >= 0) || audio.ended) {
              
              // 等待一小段时间确保真的播放完成
              setTimeout(() => {
                if (audioRef.current === audio && audio.duration > 0) {
                  const finalTimeRemaining = audio.duration - audio.currentTime;
                  // Android WebView 中使用更宽松的条件
                  const isCompleted = finalTimeRemaining <= (isAndroidWebView ? 1.0 : 0.5) || 
                                     audio.ended || 
                                     (audio.paused && finalTimeRemaining <= threshold);
                  
                  if (isCompleted) {
                    handlePlaybackEnded();
                  }
                }
              }, isAndroidWebView ? 800 : 600);
            }
          } else if (audioRef.current !== audio || audio.ended || (audio.paused && audio.currentTime === 0)) {
            // 如果音频已切换、已结束或已重置，清除定时器
            if (backgroundCheckIntervalRef.current) {
              clearInterval(backgroundCheckIntervalRef.current);
              backgroundCheckIntervalRef.current = null;
            }
          }
        }, isAndroidWebView ? 300 : 500); // Android WebView 中更频繁检查
      }

      audio.addEventListener('error', (e) => {
        const error = audio.error;
        const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
        const currentTime = Date.now();
        
        // 检查是否是旧错误（音频已经重新加载）
        if (lastSuccessfulLoadRef.current === fileId && currentTime - errorTimeRef.current > 5000) {
          return;
        }
        
        // 检查音频是否实际上已经成功加载（readyState >= 2 且有src）
        if (audio.readyState >= 2 && audio.src && !audio.src.startsWith('blob:')) {
          // 可能是blob URL已过期，但音频实际上已经加载
          console.warn('[AudiobookPlayer] 音频错误但readyState正常，可能是blob URL过期', {
            fileId,
            readyState: audio.readyState,
            src: audio.src.substring(0, 50),
            hasError: !!error
          });
          // 不显示错误，尝试重新加载
          if (autoPlayNextRef.current) {
            // 自动播放时，尝试重新获取blob URL
            setTimeout(() => {
              if (autoPlayNextRef.current && audioRef.current === audio) {
                loadAudio(fileId).catch(() => {
                  // 忽略重新加载的错误，让canplaythrough处理器处理
                });
              }
            }, 500);
          }
          return;
        }
        
        errorTimeRef.current = currentTime;
        let errorMessage = '音频加载失败';
        let shouldShowToast = true;
        
        if (error) {
          switch (error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              errorMessage = '音频加载被中止';
              console.warn('[AudiobookPlayer] 音频加载被中止', { 
                fileId, 
                audioUrl: audio.src?.substring(0, 100),
                currentFileId,
                isAutoPlayNext: autoPlayNextRef.current
              });
              // 被中止的错误通常不需要显示toast，可能是用户操作或自动切换
              shouldShowToast = false;
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              errorMessage = '网络错误，无法加载音频';
              // ✅ 修复：检查是否是连接拒绝错误，如果是则静默记录
              const isConnectionRefused = audio.src?.includes('ERR_CONNECTION_REFUSED') ||
                                        !navigator.onLine;
              
              if (!isConnectionRefused) {
                console.error('[AudiobookPlayer] 网络错误', { 
                  fileId, 
                  audioUrl: audio.src?.substring(0, 100), 
                  error: {
                    code: error.code,
                    message: error.message
                  },
                  readyState: audio.readyState,
                  networkState: audio.networkState,
                  isPWA: isPWAMode,
                  documentHidden: document.hidden
                });
              }
              // 在自动播放下一集时，网络错误可能是暂时的，不显示toast
              if (autoPlayNextRef.current) {
                shouldShowToast = false;
              }
              break;
            case MediaError.MEDIA_ERR_DECODE:
              errorMessage = '音频解码失败，格式可能不支持';
              console.error('[AudiobookPlayer] 音频解码失败', { 
                fileId, 
                audioUrl: audio.src?.substring(0, 100), 
                error: {
                  code: error.code,
                  message: error.message
                },
                fileType: currentFile?.file_type,
                readyState: audio.readyState
              });
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = '音频格式不支持或URL无效';
              console.error('[AudiobookPlayer] 音频格式不支持', { 
                fileId, 
                audioUrl: audio.src?.substring(0, 100), 
                error: {
                  code: error.code,
                  message: error.message
                },
                fileType: currentFile?.file_type,
                readyState: audio.readyState,
                networkState: audio.networkState
              });
              break;
            default:
              errorMessage = `音频加载失败 (错误代码: ${error.code})`;
              console.error('[AudiobookPlayer] 音频加载失败', { 
                fileId, 
                audioUrl: audio.src?.substring(0, 100), 
                error: {
                  code: error.code,
                  message: error.message
                },
                fileType: currentFile?.file_type,
                readyState: audio.readyState,
                networkState: audio.networkState,
                isPWA: isPWAMode,
                documentHidden: document.hidden,
                isAutoPlayNext: autoPlayNextRef.current
              });
          }
        } else {
          console.error('[AudiobookPlayer] 音频错误事件（无错误对象）', { 
            fileId, 
            audioUrl: audio.src?.substring(0, 100),
            readyState: audio.readyState,
            networkState: audio.networkState,
            isPWA: isPWAMode,
            documentHidden: document.hidden,
            isAutoPlayNext: autoPlayNextRef.current
          });
        }
        
        // 只在非自动播放切换时显示错误提示
        // 如果是自动播放下一集时的错误，可能是暂时的网络问题，不显示toast
        if (shouldShowToast && !autoPlayNextRef.current) {
          toast.error(errorMessage);
        } else if (autoPlayNextRef.current) {
          console.warn('[AudiobookPlayer] 自动播放下一集时音频加载失败，将重试', { 
            fileId,
            errorCode: error?.code,
            isPWA: isPWAMode
          });
        }
        
        setLoading(false);
        // 只有在非自动播放时才设置播放状态为false
        // 自动播放时，canplaythrough处理器会处理重试
        if (!autoPlayNextRef.current) {
          setPaused();
        }
      });
      
      // 记录成功加载的文件ID
      // ✅ 修复：loadeddata 事件处理（PWA模式下可能需要更早设置播放位置）
      const loadeddataHandler = () => {
        // ✅ 修复：检查当前音频是否仍然是活动音频（防止切换文件后旧音频的事件触发）
        if (audioRef.current !== audio) {
          return;
        }
        
        if (!audio.error && audio.src) {
          lastSuccessfulLoadRef.current = fileId;
          
          // ✅ 修复：PWA模式下，在 loadeddata 时也尝试设置播放位置（作为更早的备用方案）
          const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
          if (isPWAMode && audio.duration > 0 && !userManuallySeekedRef.current) {
            if (startTime > 0) {
              const safeStartTime = Math.min(startTime, audio.duration - 0.1);
              if (safeStartTime > 0 && Math.abs(audio.currentTime - safeStartTime) > 0.5) {
                audio.currentTime = safeStartTime;
                setCurrentTimeState(safeStartTime);
              }
            } else if (audio.currentTime > 0.5) {
              // startTime 为 0，确保从开头播放
              audio.currentTime = 0;
              setCurrentTimeState(0);
            }
          }
        }
      };
      
      audio.addEventListener('loadeddata', loadeddataHandler);
      (audio as any).__loadeddataHandler = loadeddataHandler;

      // ✅ 修复：自动播放逻辑 - 确保初始化完成后再允许自动播放
      const canAutoPlay = isInitialized && !isInitializing;
      
      if (startTime > 0 && !autoPlayNextRef.current && canAutoPlay) {
        // 断点续播：有进度且不是自动续播且初始化已完成
        audio.play().then(() => {
          // 验证播放状态，确保状态同步
          if (audio.paused) {
            console.warn('[AudiobookPlayer] 断点续播失败：音频仍然暂停');
            setPaused();
          } else {
            setPlayerPlaying(true);
          }
        }).catch((e) => {
          // ✅ 修复：处理 NotAllowedError（浏览器自动播放策略限制）
          if (e.name === 'NotAllowedError' || e.message?.includes('user didn\'t interact')) {
            console.warn('[AudiobookPlayer] 断点续播被浏览器阻止（需要用户交互）:', e);
            setPaused();
            // 不显示错误提示，因为这是浏览器的正常行为
            // 音频已加载到正确位置，用户可以手动点击播放按钮
          } else {
            console.error('播放失败:', e);
            setPaused();
            toast.error(t('audiobook.player.playFailed'));
          }
        });
      } else if (shouldAutoPlayOnLoadRef.current && !autoPlayNextRef.current && canAutoPlay) {
        // 用户主动点击播放：即使没有进度也自动播放，但需要初始化完成
        audio.play().then(() => {
          if (audio.paused) {
            console.warn('[AudiobookPlayer] 用户播放请求失败：音频仍然暂停');
            setPaused();
          } else {
            setPlayerPlaying(true);
          }
        }).catch((e) => {
          // ✅ 修复：处理 NotAllowedError（浏览器自动播放策略限制）
          if (e.name === 'NotAllowedError' || e.message?.includes('user didn\'t interact')) {
            console.warn('[AudiobookPlayer] 自动播放被浏览器阻止（需要用户交互）:', e);
            setPaused();
            // 不显示错误提示，因为这是浏览器的正常行为
          } else {
            console.error('播放失败:', e);
            setPaused();
            toast.error(t('audiobook.player.playFailed'));
          }
        });
      } else if (!canAutoPlay) {
        // ✅ 修复：初始化未完成，不自动播放
        setPaused();
      } else if (!autoPlayNextRef.current) {
        // 既没有进度也不是自动续播且用户未主动点击，确保播放状态为 false
        setPaused();
      }
      // 如果是自动续播（autoPlayNextRef.current = true），在 loadedmetadata 事件中处理
    } catch (error: any) {
      console.error('加载音频失败:', error);
      toast.error('加载音频失败');
      setLoading(false);
    }
  };

  // ✅ 修复：确保 loadAudioRef 在 loadAudio 函数定义后立即被设置
  useEffect(() => {
    loadAudioRef.current = loadAudio;
  }, [loadAudio]);

  // ✅ 修复：监听 currentFileId 变化，自动加载音频（用于播放列表选择和上一首/下一首）
  useEffect(() => {
    // 只在初始化完成后才自动加载
    if (!isInitialized || !currentFileId || !loadAudioRef.current) {
      return;
    }

    // ✅ 修复：使用 previousFileIdRef 来检查当前实际加载的文件
    // previousFileIdRef 在 loadAudio 成功执行后才会更新，可以准确反映当前加载的文件
    const currentLoadedFileId = previousFileIdRef.current;
    
    // 检查是否已经在加载或播放相同的文件（避免重复加载）
    if (currentLoadedFileId === currentFileId) {
      return;
    }

    // 记录之前的文件ID（用于日志）
    const prevFileId = previousFileIdRef.current;

    // 延迟加载，避免频繁切换
    const timeoutId = setTimeout(() => {
      // ✅ 修复：再次检查，确保文件ID没有再次变化，并且当前没有加载相同的文件
      const currentLoadedFileIdAfterDelay = previousFileIdRef.current;
      
      if (loadAudioRef.current && currentFileId && currentLoadedFileIdAfterDelay !== currentFileId) {
        
        // 如果正在播放，切换后继续播放；否则只加载不播放
        const shouldAutoPlay = isPlaying;
        // ✅ 修复：从播放列表选择文件时，不传递 startTimeFromAPI，让 loadAudio 从API重新获取该文件的进度
        loadAudioRef.current(currentFileId, false, undefined).then(() => {
          // 如果之前正在播放，切换后自动播放
          if (shouldAutoPlay && audioRef.current && audioRef.current.src) {
            audioRef.current.play().catch((e) => {
              // ✅ 修复：处理各种播放错误，优雅降级
              if (e.name === 'AbortError' || e.message?.includes('interrupted')) {
                // 播放被暂停中断，这是正常的，忽略
              } else if (e.name === 'NotAllowedError' || e.message?.includes('user didn\'t interact')) {
                // 浏览器自动播放策略限制，需要用户交互
                console.warn('[AudiobookPlayer] 自动播放被浏览器阻止（需要用户交互），用户需要手动点击播放按钮');
                // 不显示错误提示，因为这是浏览器的正常行为
                // 音频已加载，用户可以手动点击播放按钮
              } else {
                // 其他错误，记录但不显示错误提示（避免干扰用户）
                console.warn('[AudiobookPlayer] 切换后自动播放失败:', e);
              }
            });
          }
        }).catch((error) => {
          console.error('[AudiobookPlayer] 自动加载音频失败:', error);
        });
      } else {

      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [currentFileId, isInitialized, isPlaying]);

  // 关闭播放器时的处理
  const handleClose = useCallback(() => {
    // 如果正在播放，显示迷你播放器，但不停止播放
    if (isPlaying) {
      setShowMiniPlayer(true);
    }
    setShowPlayer(false);
    onClose();
    // 注意：不停止播放，让音频继续在后台播放
  }, [isPlaying, setShowMiniPlayer, setShowPlayer, onClose]);

  // 跳转到指定时间（使用useCallback优化）
  const seekTo = useCallback(
    (time: number) => {
      if (audioRef.current) {
        // ✅ 修复：用户手动拖动进度条时，标记为已手动拖动，阻止自动恢复保存的进度
        userManuallySeekedRef.current = true;
        audioRef.current.currentTime = time;
        setCurrentTimeState(time);

        // ✅ 修复：立即更新fileProgresses状态，确保播放列表中的进度条实时更新
        const duration = audioRef.current.duration || 0;
        const progressPercent = duration > 0 ? (time / duration) * 100 : 0;
        setFileProgresses(prev => ({
          ...prev,
          [currentFileId]: {
            file_id: currentFileId,
            current_time: time,
            duration: duration,
            progress: progressPercent,
            last_played_at: new Date().toISOString(),
          }
        }));

        // ✅ 修复：拖动进度条后，延迟10秒保存进度（防抖）
        // 清除之前的定时器
        if (saveProgressTimeoutRef.current) {
          clearTimeout(saveProgressTimeoutRef.current);
        }

        // ✅ 修复：设置新的定时器，10秒后保存进度，显式传入currentFileId
        saveProgressTimeoutRef.current = setTimeout(() => {
          if (audioRef.current && audioRef.current.duration > 0 && currentFileId) {
            const currentTime = audioRef.current.currentTime;
            const duration = audioRef.current.duration;

            // ✅ 修复：显式传入currentFileId，确保保存到正确的文件
            saveProgress(currentTime, duration, currentFileId).catch(e => {
              console.error('[AudiobookPlayer] 拖动进度条后保存进度失败', e);
            });
          }
          saveProgressTimeoutRef.current = null;
        }, 10000); // 10秒后保存
      }
    },
    [currentFileId, saveProgress, setCurrentTimeState, setFileProgresses]
  );

  // 向前15秒（使用useCallback优化）
  const seekBackward = useCallback(() => {
    if (audioRef.current) {
      const newTime = Math.max(0, audioRef.current.currentTime - 15);
      seekTo(newTime);
    }
  }, [seekTo]);

  // 向后15秒（使用useCallback优化）
  const seekForward = useCallback(() => {
    if (audioRef.current) {
      const newTime = Math.min(
        audioRef.current.duration || 0,
        audioRef.current.currentTime + 15
      );
      seekTo(newTime);
    }
  }, [seekTo]);

  // 跳转到指定章节
  const jumpToChapter = useCallback(
    (chapter: import('./audiobook/types').Chapter) => {
      seekTo(chapter.start);
      if (!isPlaying && audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            setPlayerPlaying(true);
          })
          .catch(e => {
            console.error('播放失败:', e);
          });
      }
    },
    [isPlaying, seekTo, setPlayerPlaying]
  );

  // 获取当前章节（使用缓存的 currentChapter）
  const getCurrentChapter = useCallback((): import('./audiobook/types').Chapter | null => {
    return currentChapter;
  }, [currentChapter]);

  // 调整音量（使用useCallback优化）
  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setVolumeState(newVolume);
      if (audioRef.current) {
        audioRef.current.volume = newVolume;
      }
      // ✅ 无障碍性：宣布音量变化
      announce(`音量 ${Math.round(newVolume * 100)}%`);
    },
    [setVolumeState, announce]
  );
  
  // ✅ 无障碍性：增加音量
  const handleVolumeUp = useCallback(() => {
    const newVolume = Math.min(1, volume + 0.1);
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);
  
  // ✅ 无障碍性：减少音量
  const handleVolumeDown = useCallback(() => {
    const newVolume = Math.max(0, volume - 0.1);
    handleVolumeChange(newVolume);
  }, [volume, handleVolumeChange]);

  // 切换静音（使用useCallback优化）
  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume;
        setMuted(false);
        // ✅ 无障碍性：宣布取消静音
        announce(`已取消静音，音量 ${Math.round(volume * 100)}%`);
      } else {
        audioRef.current.volume = 0;
        setMuted(true);
        // ✅ 无障碍性：宣布静音
        announce('已静音');
      }
    }
  }, [isMuted, volume, setMuted, announce]);

  // 调整播放速度（使用useCallback优化）
  const changePlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRateState(rate);
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
      }
    },
    [setPlaybackRateState]
  );

  // 设置睡眠定时器（使用useCallback优化）
  const setSleepTimerMinutes = useCallback(
    (minutes: number) => {
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
      }

      if (minutes === 0) {
        setSleepTimerState(null);
        setShowSleepTimerState(false);
        return;
      }

      setSleepTimerState(minutes);
      setShowSleepTimerState(false);

      sleepTimerRef.current = setTimeout(() => {
        if (audioRef.current) {
          // ✅ 新增：睡眠定时器暂停时立即保存播放进度和last_file_id
          if (audioRef.current.duration > 0 && currentFileId) {
            const currentTime = audioRef.current.currentTime;
            const duration = audioRef.current.duration;
            saveProgress(currentTime, duration, currentFileId).catch(e => {
              console.error('[AudiobookPlayer] 睡眠定时器暂停时保存进度失败', e);
            });
          }
          
          audioRef.current.pause();
          setPaused();
        }
        setSleepTimerState(null);
        toast.success(t('audiobook.player.sleepTimerClosed'));
      }, minutes * 60 * 1000);
    },
    [setSleepTimerState, setShowSleepTimerState, setPaused, t]
  );

  // 工具函数已移至 ./audiobook/utils.ts

  // ✅ 性能优化：切换循环播放（使用useCallback）
  const toggleLooping = useCallback(() => {
    setLooping(!isLooping);
  }, [isLooping, setLooping]);

  // ✅ 性能优化：切换章节显示（使用useCallback）
  const toggleShowChapters = useCallback(() => {
    setShowChaptersState(!showChapters);
  }, [showChapters, setShowChaptersState]);

  // ✅ 性能优化：切换播放列表显示（使用useCallback）
  const toggleShowPlaylist = useCallback(() => {
    setShowPlaylistState(!showPlaylist);
  }, [showPlaylist, setShowPlaylistState]);
  
  // ✅ PWA/移动端优化：触摸控制（在所有处理函数定义之后）
  const { touchHandlers } = useTouchControls(
    {
      onTogglePlay: togglePlay,
      onPrevious: handlePrevious,
      onNext: handleNext,
      onSeekBackward: seekBackward,
      onSeekForward: seekForward,
      onSeek: (delta) => {
        if (audioRef.current) {
          const newTime = Math.max(
            0,
            Math.min(audioRef.current.duration || 0, currentTime + delta)
          );
          seekTo(newTime);
        }
      },
    },
    {
      enabled: isPageMode, // 仅在页面模式下启用触摸控制
      enableHapticFeedback: true,
    }
  );
  
  // ✅ 无障碍性：键盘快捷键支持（在所有处理函数定义之后）
  useKeyboardShortcuts(
    {
      onTogglePlay: togglePlay,
      onPrevious: handlePrevious,
      onNext: handleNext,
      onSeekBackward: seekBackward,
      onSeekForward: seekForward,
      onVolumeUp: handleVolumeUp,
      onVolumeDown: handleVolumeDown,
      onToggleMute: toggleMute,
      onClose: !isPageMode ? handleClose : undefined,
      onTogglePlaylist: toggleShowPlaylist,
      onToggleChapters: toggleShowChapters,
    },
    {
      enabled: true,
    }
  );

  // 处理文件选择（从播放列表）
  // ✅ 修改：只选择文件，不播放（用于滚动选择）
  const handleFileSelectOnly = useCallback((fileId: string) => {
    setSelectedFileId(fileId);
  }, []);

  // ✅ 新增：双击播放选中的文件
  const handleFilePlay = useCallback(async (fileId: string, forceRestart: boolean = false) => {
    // 如果选择的是当前文件，只需要播放/暂停
    if (fileId === currentFileId) {
      if (isPlaying) {
        togglePlay();
      } else {
        togglePlay();
      }
      return;
    }

    // 检查是否需要强制从头播放（进度 > 99% 时）
    let shouldForceRestart = forceRestart;
    if (!shouldForceRestart) {
      // 检查文件进度，如果进度 > 99%，强制从头播放
      const fileProgress = fileProgresses[fileId];
      if (fileProgress && fileProgress.progress > 99) {
        shouldForceRestart = true;
      }
    }

    // ✅ 修复：切换文件前，先保存当前文件的进度和last_file_id（即使duration为0也要保存）
    // 显式保存当前文件的fileId，避免在异步操作中currentFileId发生变化
    const previousFileId = currentFileId;
    if (audioRef.current && previousFileId && previousFileId !== fileId) {
      const currentTime = audioRef.current.currentTime || 0;
      const duration = audioRef.current.duration || 0;

      try {
        if (duration > 0) {
          // 音频已完全加载，保存完整进度（显式传入previousFileId，确保保存到正确的文件）
          await saveProgress(currentTime, duration, previousFileId);
        } else {
          // 音频未完全加载，至少更新last_file_id（显式传入previousFileId）
          await saveProgress(0, 0, previousFileId, true);
        }
      } catch (e) {
        console.error('[AudiobookPlayer] 播放列表切换：保存当前文件进度失败', e);
      }
    }

    // ✅ 修复：切换文件前，立即更新last_file_id（使用 updateLastFileIdOnly，确保正确更新）
    // 这必须在保存旧文件进度之后执行，确保last_file_id指向新文件
    try {
      // 如果需要强制从头播放，设置 currentTime 为 0
      const initialCurrentTime = shouldForceRestart ? 0 : undefined;
      await api.post(`/audiobooks/${audiobookId}/progress`, {
        fileId: fileId, // ✅ 修复：显式使用新文件的fileId
        currentTime: initialCurrentTime !== undefined ? initialCurrentTime : 0,
        duration: 0,
        updateLastFileIdOnly: true, // ✅ 关键：只更新 last_file_id，不创建或更新进度记录
      });
      // ✅ 修复：同步更新本地缓存，确保缓存与后端 last_file_id 一致
      try {
        saveOfflineState(fileId, initialCurrentTime || 0, 0);
      } catch (cacheError) {
        console.warn('[AudiobookPlayer] 播放列表切换：更新本地缓存失败（不影响主流程）', cacheError);
      }
    } catch (e) {
      console.error('[AudiobookPlayer] 播放列表切换：更新last_file_id失败', e);
      // 降级方案：使用 saveProgress，但后端会正确处理
      try {
        await saveProgress(0, 0, fileId, true); // ✅ 修复：显式传入新文件的fileId
      } catch (e2) {
        console.error('[AudiobookPlayer] 播放列表切换：降级方案也失败', e2);
      }
    }

    // ✅ 修复：记录切换前的播放状态，切换后恢复
    const wasPlaying = isPlaying;

    setCurrentFileIdState(fileId);
    setSelectedFileId(fileId); // 同步更新选中状态
    onFileChange(fileId);

    // ✅ 修复：文件ID变化会触发useEffect自动加载，这里不需要手动调用loadAudio
    // 但如果之前正在播放，需要设置自动播放标志
    if (wasPlaying) {
      setAutoPlayNext(true);
      autoPlayNextRef.current = true;
    }

    // ✅ 修复：页面模式下不隐藏播放列表
    if (!isPageMode) {
      setShowPlaylistState(false);
    }
  }, [currentFileId, isPlaying, saveProgress, saveOfflineState, onFileChange, isPageMode, setCurrentFileIdState, setShowPlaylistState, audiobookId, togglePlay, fileProgresses]);

  // ✅ 保留向后兼容：handleFileSelect 现在只选择，不播放
  const handleFileSelect = handleFileSelectOnly;

  return (
    <div 
      ref={containerRef}
      className={isPageMode ? "w-full h-full flex flex-col min-h-0" : "fixed inset-x-0 audiobook-player-container"}
      role="region"
      aria-label="有声小说播放器"
      aria-live="polite"
      {...(isPageMode ? touchHandlers : {})}
      style={isPageMode ? {
        // ✅ 修复：页面模式下移除顶部安全区域，只保留底部和左右安全区域
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      } : {
        zIndex: 40, // 确保在导航栏下方（导航栏是 z-50）
        // ✅ 修复：非页面模式下也考虑安全区域
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 0.5rem)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 0.5rem)',
      }}
    >
      {/* 播放器主界面 - 扁平化设计，移除不必要的卡片背景 */}
      {!isPageMode && (
        <div className="w-full lg:max-w-7xl lg:mx-auto px-4 lg:px-[5px] pb-4">
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-t-lg lg:rounded-lg shadow-md relative">
            {/* 关闭按钮 - 右上角（仅在非页面模式显示） */}
            <button
              onClick={handleClose}
              data-close-button
              className="absolute top-4 right-4 z-10 p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
              title="关闭播放器（Esc）"
              aria-label="关闭播放器"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* 内容区域 */}
            <div className="px-4 pt-4 pb-4 lg:px-6 lg:py-6 pr-12">
              {/* 顶部播放控制区域 */}
              <div>
              {/* 头部信息 */}
              <PlayerHeader
                audiobookTitle={audiobookTitle}
                audiobookAuthor={audiobookAuthor}
                audiobookCover={audiobookCover}
                currentFile={currentFile}
                isPageMode={isPageMode}
              />

              {/* 进度条 */}
              <ProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={seekTo}
                isPageMode={isPageMode}
                disabled={!audioRef.current}
              />

              {/* 控制按钮 */}
              <PlayerControls
                isPlaying={isPlaying}
                isLoading={isLoading}
                currentFileIndex={currentFileIndex}
                totalFiles={files.length}
                currentTime={currentTime}
                duration={duration}
                onTogglePlay={togglePlay}
                onPrevious={handlePrevious}
                onNext={handleNext}
                onSeekBackward={seekBackward}
                onSeekForward={seekForward}
                isPageMode={isPageMode}
              />

                {/* 辅助按钮 */}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {/* 播放速度 */}
                  <PlaybackRateControl
                    playbackRate={playbackRate}
                    onRateChange={changePlaybackRate}
                  />

                  {/* 循环播放 */}
                  <button
                    onClick={toggleLooping}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                      isLooping
                        ? 'bg-blue-600/80 dark:bg-blue-500/80 text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                    }`}
                    title={isLooping ? t('audiobook.player.loopOn') || '循环播放：开启' : t('audiobook.player.loopOff') || '循环播放：关闭'}
                    aria-label={isLooping ? '关闭循环播放' : '开启循环播放'}
                    aria-pressed={isLooping}
                  >
                    <RotateCcw className={`w-4 h-4 ${isLooping ? 'animate-spin' : ''}`} style={{ animationDuration: '2s' }} strokeWidth={2} />
                  </button>
                  
                  {/* 睡眠定时器 */}
                  <SleepTimer
                    sleepTimer={sleepTimer}
                    showTimer={showSleepTimer}
                    onShowTimerChange={setShowSleepTimerState}
                    onSetTimer={setSleepTimerMinutes}
                  />

                  {/* 音量控制 */}
                  <VolumeControl
                    volume={volume}
                    isMuted={isMuted}
                    onVolumeChange={handleVolumeChange}
                    onToggleMute={toggleMute}
                    showSlider={showVolumeSlider}
                    onShowSliderChange={setShowVolumeSliderState}
                  />

                  {/* 章节按钮 */}
                  {currentFile?.chapters && currentFile.chapters.length > 0 && (
                    <button
                      onClick={toggleShowChapters}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                      title={t('audiobook.chapters')}
                      aria-label="显示章节列表"
                      aria-pressed={showChapters}
                    >
                      <Hash className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}

                  {/* 播放列表按钮 */}
                  <button
                    onClick={toggleShowPlaylist}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                    title={t('audiobook.playlist')}
                    aria-label="显示播放列表"
                    aria-pressed={showPlaylist}
                  >
                    <List className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* 章节列表和播放列表区域 */}
              {(showChapters || showPlaylist) && (
                <div>
                  {/* 章节列表 */}
                  {showChapters && currentFile?.chapters && currentFile.chapters.length > 0 && (
                    <ChaptersList
                      chapters={currentFile.chapters}
                      currentTime={currentTime}
                      onChapterClick={jumpToChapter}
                      isPageMode={isPageMode}
                    />
                  )}

                  {/* 播放列表 */}
                  {showPlaylist && (
                    <Playlist
                      files={files}
                      currentFileId={currentFileId}
                      isPlaying={isPlaying}
                      onFileSelect={handleFileSelectOnly}
                      onFilePlay={handleFilePlay}
                      selectedFileId={selectedFileId}
                      isPageMode={isPageMode}
                      isPWAMode={window.matchMedia('(display-mode: standalone)').matches}
                      enableVirtualScroll={files.length > 100}
                      fileProgresses={fileProgresses}
                    />
                  )}
                </div>
              )}

              {/* 睡眠定时器显示 */}
              {sleepTimer && (
                <div className="mt-3 text-center text-sm text-blue-600 dark:text-blue-400">
                  睡眠定时器: {sleepTimer}分钟后关闭
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 页面模式 - 扁平化设计，无卡片背景 */}
      {isPageMode && (
        <>
          {/* 顶部播放控制区域 */}
          <div className="flex-shrink-0 px-4 pt-6 pb-4 lg:px-6">
            {/* 头部信息 */}
            <PlayerHeader
              audiobookTitle={audiobookTitle}
              audiobookAuthor={audiobookAuthor}
              audiobookCover={audiobookCover}
              currentFile={currentFile}
              isPageMode={isPageMode}
            />

            {/* 进度条 */}
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              onSeek={seekTo}
              isPageMode={isPageMode}
              disabled={!audioRef.current}
            />

            {/* 控制按钮 */}
            <PlayerControls
              isPlaying={isPlaying}
              isLoading={isLoading}
              currentFileIndex={currentFileIndex}
              totalFiles={files.length}
              currentTime={currentTime}
              duration={duration}
              onTogglePlay={togglePlay}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onSeekBackward={seekBackward}
              onSeekForward={seekForward}
              isPageMode={isPageMode}
            />

            {/* 辅助按钮 */}
            <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
              {/* 播放速度 */}
              <PlaybackRateControl
                playbackRate={playbackRate}
                onRateChange={changePlaybackRate}
              />

              {/* 循环播放 */}
              <button
                onClick={toggleLooping}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  isLooping
                    ? 'bg-blue-600/80 dark:bg-blue-500/80 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
                }`}
                title={isLooping ? t('audiobook.player.loopOn') || '循环播放：开启' : t('audiobook.player.loopOff') || '循环播放：关闭'}
                aria-label={isLooping ? '关闭循环播放' : '开启循环播放'}
                aria-pressed={isLooping}
              >
                <RotateCcw className={`w-4 h-4 ${isLooping ? 'animate-spin' : ''}`} style={{ animationDuration: '2s' }} strokeWidth={2} />
              </button>
              
              {/* 睡眠定时器 */}
              <SleepTimer
                sleepTimer={sleepTimer}
                showTimer={showSleepTimer}
                onShowTimerChange={setShowSleepTimerState}
                onSetTimer={setSleepTimerMinutes}
              />

              {/* 音量控制 */}
              <VolumeControl
                volume={volume}
                isMuted={isMuted}
                onVolumeChange={handleVolumeChange}
                onToggleMute={toggleMute}
                showSlider={showVolumeSlider}
                onShowSliderChange={setShowVolumeSliderState}
              />

              {/* 章节按钮 */}
              {currentFile?.chapters && currentFile.chapters.length > 0 && (
                <button
                  onClick={toggleShowChapters}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                  title={t('audiobook.chapters')}
                  aria-label="显示章节列表"
                  aria-pressed={showChapters}
                >
                  <Hash className="w-4 h-4" strokeWidth={2} />
                </button>
              )}

              {/* 播放列表按钮 */}
              <button
                onClick={toggleShowPlaylist}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
                title={t('audiobook.playlist')}
                aria-label="显示播放列表"
                aria-pressed={showPlaylist}
              >
                <List className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* 章节列表和播放列表区域 */}
          {(showChapters || showPlaylist) && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* 章节列表 */}
              {showChapters && currentFile?.chapters && currentFile.chapters.length > 0 && (
                <ChaptersList
                  chapters={currentFile.chapters}
                  currentTime={currentTime}
                  onChapterClick={jumpToChapter}
                  isPageMode={isPageMode}
                />
              )}

              {/* 播放列表 */}
              {showPlaylist && (
                <Playlist
                  files={files}
                  currentFileId={currentFileId}
                  isPlaying={isPlaying}
                  onFileSelect={handleFileSelectOnly}
                  onFilePlay={handleFilePlay}
                  selectedFileId={selectedFileId}
                  isPageMode={isPageMode}
                  isPWAMode={window.matchMedia('(display-mode: standalone)').matches}
                  enableVirtualScroll={files.length > 100}
                  fileProgresses={fileProgresses}
                />
              )}
            </div>
          )}

          {/* 睡眠定时器显示 */}
          {sleepTimer && (
            <div className="px-4 lg:px-6 mt-3 text-center text-sm text-blue-600 dark:text-blue-400">
              睡眠定时器: {sleepTimer}分钟后关闭
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 有声小说播放器组件（带错误边界）
 */
export default function AudiobookPlayer(props: AudiobookPlayerProps) {
  return (
    <AudiobookPlayerErrorBoundary>
      <AudiobookPlayerInternal {...props} />
    </AudiobookPlayerErrorBoundary>
  );
}

