/**
 * @file useMediaSession.ts
 * @description Media Session API Hook - 管理锁屏和通知控制
 */

import { useEffect, useRef, useCallback } from 'react';
import { AudioFile } from '../types';

interface UseMediaSessionProps {
  isPlaying: boolean;
  currentFileId: string;
  files: AudioFile[];
  audiobookTitle: string;
  audiobookAuthor?: string;
  audiobookCover?: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  autoPlayNextRef: React.MutableRefObject<boolean>;
  setAutoPlayNext: (value: boolean) => void;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Media Session Hook
 * 管理Media Session API集成，处理锁屏和通知控制
 */
export function useMediaSession({
  isPlaying,
  currentFileId,
  files,
  audiobookTitle,
  audiobookAuthor,
  audiobookCover,
  audioRef,
  autoPlayNextRef,
  setAutoPlayNext,
  onPlay,
  onPause,
  onPrevious,
  onNext,
}: UseMediaSessionProps) {
  const updateMediaSessionRef = useRef<() => void>();

  const updateMediaSession = useCallback(() => {
    // 某些 Android WebView 不完全支持 Media Session / MediaMetadata，
    // 这里做一次全面能力检测，避免在不支持的环境中直接报错导致整个页面白屏
    try {
      if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
      const hasMediaSession = 'mediaSession' in navigator && (navigator as any).mediaSession;
      const MediaMetadataCtor = (window as any).MediaMetadata;
      if (!hasMediaSession || !MediaMetadataCtor) {
        // 环境不支持 Media Session，直接跳过，不影响正常播放
        return;
      }

      const mediaSession = (navigator as any).mediaSession;
      const currentIndex = files.findIndex(f => f.id === currentFileId);
      const currentFile = files[currentIndex];

      // 设置元数据
      mediaSession.metadata = new MediaMetadataCtor({
        title: currentFile?.file_name || audiobookTitle || '未知',
        artist: audiobookAuthor || '未知作者',
        album: audiobookTitle || '有声小说',
        artwork: audiobookCover
          ? [{ src: audiobookCover, sizes: '512x512', type: 'image/png' }]
          : [],
      });

      // 设置播放状态
      mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      // 设置操作处理程序
      mediaSession.setActionHandler('play', () => {
        if (audioRef.current && !isPlaying) {
          // ✅ 修复：iOS PWA模式下，如果设置了自动播放标志，清除它（因为用户已手动播放）
          const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
          const isIOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
          if (isPWAMode && isIOS && autoPlayNextRef.current) {
            console.log(
              '[AudiobookPlayer] iOS PWA模式：用户通过Media Session播放，清除自动播放标志'
            );
            setAutoPlayNext(false);
            autoPlayNextRef.current = false;
          }

          onPlay();
          updateMediaSessionRef.current?.();
        }
      });

      mediaSession.setActionHandler('pause', () => {
        if (audioRef.current && isPlaying) {
          onPause();
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
          const isPWAMode = window.matchMedia('(display-mode: standalone)').matches;
          const isIOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

          if (isPWAMode && isIOS) {
            // iOS PWA模式下，Media Session的nexttrack事件是用户交互，可以自动播放
            autoPlayNextRef.current = true;
            setAutoPlayNext(true);
          }
          window.dispatchEvent(new CustomEvent('audiobook:next'));
        }
      });

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
  }, [
    isPlaying,
    currentFileId,
    files,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
    audioRef,
    autoPlayNextRef,
    setAutoPlayNext,
    onPlay,
    onPause,
  ]);

  // 保存 updateMediaSession 到 ref
  updateMediaSessionRef.current = updateMediaSession;

  // 监听播放状态变化，更新 Media Session
  useEffect(() => {
    updateMediaSession();
  }, [updateMediaSession]);

  return {
    updateMediaSession,
  };
}
