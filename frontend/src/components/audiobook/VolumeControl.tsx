/**
 * @file VolumeControl.tsx
 * @description 音量控制组件
 */

import React, { memo, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  showSlider: boolean;
  onShowSliderChange: (show: boolean) => void;
}

/**
 * 音量控制组件
 * 包含音量按钮和音量滑块
 */
export const VolumeControl = memo<VolumeControlProps>(({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  showSlider,
  onShowSliderChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭音量滑块
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onShowSliderChange(false);
      }
    };

    if (showSlider) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSlider, onShowSliderChange]);

  const handleButtonClick = () => {
    if (isMuted && !showSlider) {
      onToggleMute();
    }
    onShowSliderChange(!showSlider);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    onVolumeChange(newVolume);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={handleButtonClick}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors"
        title="音量控制"
        aria-label={isMuted ? '取消静音' : '静音'}
        aria-pressed={isMuted}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4" strokeWidth={2} />
        ) : (
          <Volume2 className="w-4 h-4" strokeWidth={2} />
        )}
      </button>
      {showSlider && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-700 z-50">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleSliderChange}
            className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
                (isMuted ? 0 : volume) * 100
              }%, #e5e7eb ${(isMuted ? 0 : volume) * 100}%, #e5e7eb 100%)`,
            }}
            aria-label="调整音量"
            aria-valuenow={isMuted ? 0 : volume}
            aria-valuemin={0}
            aria-valuemax={1}
          />
          <div className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1">
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </div>
        </div>
      )}
    </div>
  );
});

VolumeControl.displayName = 'VolumeControl';
