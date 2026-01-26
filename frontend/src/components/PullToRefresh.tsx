/**
 * @file PullToRefresh.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export default function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  return (
    <div
      className="fixed left-0 right-0 flex items-center justify-center z-30 pointer-events-none transition-all duration-200"
      style={{
        top: `calc(44px + env(safe-area-inset-top, 0px) + ${pullDistance}px)`,
        opacity: pullDistance > 10 ? 1 : 0,
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-full shadow-lg p-3 border border-gray-200 dark:border-gray-700">
        <RefreshCw
          className={`w-6 h-6 text-blue-600 dark:text-blue-400 ${
            isRefreshing ? 'animate-spin' : ''
          }`}
          style={{
            transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            transition: isRefreshing ? undefined : 'transform 0.1s ease-out',
          }}
        />
      </div>
      {!isRefreshing && pullDistance >= threshold && (
        <div className="absolute -bottom-8 text-sm text-gray-600 dark:text-gray-400 font-medium">
          松开刷新
        </div>
      )}
    </div>
  );
}

