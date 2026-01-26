/**
 * @file ProgressBar.tsx
 * @description 播放进度条组件
 */

import React, { memo, useMemo } from 'react';
import { formatTime } from './utils';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isPageMode?: boolean;
  disabled?: boolean;
}

/**
 * 播放进度条组件
 * 显示当前播放时间和总时长，支持拖动调整播放进度
 */
export const ProgressBar = memo<ProgressBarProps>(({
  currentTime,
  duration,
  onSeek,
  isPageMode = false,
  disabled = false,
}) => {
  const progress = useMemo(() => {
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  }, [currentTime, duration]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    onSeek(newTime);
  };

  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className={`font-medium text-gray-600 dark:text-gray-300 tabular-nums ${
          isPageMode ? 'text-sm w-16 text-right' : 'text-xs w-14 text-right'
        }`}
        aria-label={`当前播放时间：${formatTime(currentTime)}`}
      >
        {formatTime(currentTime)}
      </span>
      <div className="flex-1 relative">
        <div
          className={`bg-gray-200 dark:bg-gray-700 rounded-full ${
            isPageMode ? 'h-2.5' : 'h-2'
          }`}
          role="progressbar"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-label="播放进度"
        >
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleChange}
          disabled={disabled}
          className={`absolute inset-0 w-full opacity-0 cursor-pointer ${
            isPageMode ? 'h-2.5' : 'h-2'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
          aria-label="调整播放进度"
        />
      </div>
      <span
        className={`font-medium text-gray-600 dark:text-gray-300 tabular-nums ${
          isPageMode ? 'text-sm w-16' : 'text-xs w-14'
        }`}
        aria-label={`总时长：${formatTime(duration)}`}
      >
        {formatTime(duration)}
      </span>
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';
