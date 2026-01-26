/**
 * @file PlayerControls.tsx
 * @description 播放控制按钮组件（播放/暂停、上一首/下一首、快进/快退）
 */

import React, { memo } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw } from 'lucide-react';

interface PlayerControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  currentFileIndex: number;
  totalFiles: number;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  isPageMode?: boolean;
}

/**
 * 播放控制按钮组件
 * 包含播放/暂停、上一首/下一首、快进/快退按钮
 */
export const PlayerControls = memo<PlayerControlsProps>(({
  isPlaying,
  isLoading,
  currentFileIndex,
  totalFiles,
  currentTime,
  duration,
  onTogglePlay,
  onPrevious,
  onNext,
  onSeekBackward,
  onSeekForward,
  isPageMode = false,
}) => {
  const canSeekBackward = currentTime > 0;
  const canSeekForward = duration > 0 && currentTime < duration;
  const canGoPrevious = currentFileIndex > 0;
  const canGoNext = currentFileIndex < totalFiles - 1;

  return (
    <div className="flex items-center justify-center gap-2 lg:gap-3 mb-4">
      {/* 向前15秒按钮 */}
      <button
        onClick={onSeekBackward}
        disabled={!canSeekBackward}
        className="px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="向前15秒"
        aria-label="向前15秒"
      >
        <div className="flex items-center gap-1">
          <RotateCcw className="w-4 h-4" strokeWidth={2} />
          <span className="text-xs font-medium">15秒</span>
        </div>
      </button>

      {/* 上一首按钮 */}
      <button
        onClick={onPrevious}
        disabled={!canGoPrevious}
        className="p-3 rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="上一首"
        aria-pressed={false}
      >
        <SkipBack className="w-5 h-5" strokeWidth={2} />
      </button>

      {/* 播放/暂停按钮 */}
      <button
        onClick={onTogglePlay}
        disabled={isLoading}
        className={`group relative bg-blue-600/80 dark:bg-blue-500/80 text-white rounded-full hover:bg-blue-600 dark:hover:bg-blue-500 active:bg-blue-700 dark:active:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center overflow-hidden ${
          isPageMode ? 'w-10 h-10 lg:w-12 lg:h-12' : 'w-8 h-8 lg:w-10 lg:h-10'
        }`}
        style={{ aspectRatio: '1 / 1' }}
        aria-label={isPlaying ? '暂停' : '播放'}
        aria-pressed={isPlaying}
      >
        {isLoading ? (
          <div
            className={`relative border-2 border-white/40 border-t-white rounded-full animate-spin ${
              isPageMode ? 'w-5 h-5 lg:w-6 lg:h-6' : 'w-3.5 h-3.5 lg:w-4 lg:h-4'
            }`}
          />
        ) : isPlaying ? (
          <Pause
            className={`relative ${
              isPageMode ? 'w-5 h-5 lg:w-6 lg:h-6' : 'w-3.5 h-3.5 lg:w-4 lg:h-4'
            }`}
            fill="currentColor"
            stroke="none"
            style={{ display: 'block' }}
          />
        ) : (
          <Play
            className={`relative ${
              isPageMode ? 'w-5 h-5 lg:w-6 lg:h-6' : 'w-3.5 h-3.5 lg:w-4 lg:h-4'
            }`}
            fill="currentColor"
            stroke="none"
            style={{ display: 'block', marginLeft: '1px' }}
          />
        )}
      </button>

      {/* 下一首按钮 */}
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className="p-3 rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="下一首"
        aria-pressed={false}
      >
        <SkipForward className="w-5 h-5" strokeWidth={2} />
      </button>

      {/* 向后15秒按钮 */}
      <button
        onClick={onSeekForward}
        disabled={!canSeekForward}
        className="px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="向后15秒"
        aria-label="向后15秒"
      >
        <div className="flex items-center gap-1">
          <RotateCw className="w-4 h-4" strokeWidth={2} />
          <span className="text-xs font-medium">15秒</span>
        </div>
      </button>
    </div>
  );
});

PlayerControls.displayName = 'PlayerControls';
