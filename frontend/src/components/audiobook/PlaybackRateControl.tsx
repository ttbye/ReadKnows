/**
 * @file PlaybackRateControl.tsx
 * @description 播放速度控制组件
 */

import React, { memo } from 'react';

interface PlaybackRateControlProps {
  playbackRate: number;
  onRateChange: (rate: number) => void;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * 播放速度控制组件
 * 允许用户切换播放速度
 */
export const PlaybackRateControl = memo<PlaybackRateControlProps>(({
  playbackRate,
  onRateChange,
}) => {
  const handleClick = () => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
    onRateChange(PLAYBACK_RATES[nextIndex]);
  };

  return (
    <button
      onClick={handleClick}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
      title={`播放速度: ${playbackRate}x`}
      aria-label={`播放速度：${playbackRate}倍速`}
    >
      <span className="text-xs font-medium">{playbackRate}x</span>
    </button>
  );
});

PlaybackRateControl.displayName = 'PlaybackRateControl';
