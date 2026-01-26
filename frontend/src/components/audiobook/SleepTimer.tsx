/**
 * @file SleepTimer.tsx
 * @description 睡眠定时器组件
 */

import React, { memo } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SleepTimerProps {
  sleepTimer: number | null;
  showTimer: boolean;
  onShowTimerChange: (show: boolean) => void;
  onSetTimer: (minutes: number) => void;
}

/**
 * 睡眠定时器组件
 * 允许用户设置定时关闭播放器
 */
export const SleepTimer = memo<SleepTimerProps>(({
  sleepTimer,
  showTimer,
  onShowTimerChange,
  onSetTimer,
}) => {
  const { t } = useTranslation();

  const timerOptions = [0, 15, 30, 45, 60, 90, 120];

  return (
    <div className="relative">
      <button
        onClick={() => onShowTimerChange(!showTimer)}
        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
          sleepTimer
            ? 'bg-blue-600/80 dark:bg-blue-500/80 text-white'
            : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
        }`}
        title="睡眠定时器"
        aria-label="睡眠定时器"
        aria-pressed={!!sleepTimer}
      >
        <Clock className="w-4 h-4" strokeWidth={2} />
      </button>
      {showTimer && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 min-w-[120px] z-50 border border-gray-200 dark:border-gray-700">
          {timerOptions.map((min) => (
            <button
              key={min}
              onClick={() => {
                onSetTimer(min);
                onShowTimerChange(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                sleepTimer === min
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                  : ''
              }`}
              aria-label={min === 0 ? '关闭定时器' : `设置${min}分钟定时器`}
            >
              {min === 0 ? t('audiobook.player.closeTimer') || '关闭' : `${min}${t('audiobook.player.minutes') || '分钟'}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

SleepTimer.displayName = 'SleepTimer';
