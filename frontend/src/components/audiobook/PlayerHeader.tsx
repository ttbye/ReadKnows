/**
 * @file PlayerHeader.tsx
 * @description 播放器头部组件（标题、封面等信息）
 */

import React, { memo } from 'react';
import { AudioFile } from './types';

interface PlayerHeaderProps {
  audiobookTitle: string;
  audiobookAuthor?: string;
  audiobookCover?: string;
  currentFile?: AudioFile | null;
  isPageMode?: boolean;
}

/**
 * 播放器头部组件
 * 显示有声小说标题、作者、封面和当前播放文件信息
 */
export const PlayerHeader = memo<PlayerHeaderProps>(({
  audiobookTitle,
  audiobookAuthor,
  audiobookCover,
  currentFile,
  isPageMode = false,
}) => {
  if (isPageMode) {
    return (
      <div className="text-center mb-6">
        {audiobookCover && (
          <img
            src={audiobookCover}
            alt={audiobookTitle}
            className="w-40 h-40 lg:w-56 lg:h-56 object-cover rounded-lg shadow-sm mx-auto mb-4"
            loading="lazy"
          />
        )}
        <h2 className="text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white mb-1">
          {audiobookTitle}
        </h2>
        {audiobookAuthor && (
          <p className="text-base text-gray-600 dark:text-gray-400 mb-2">
            {audiobookAuthor}
          </p>
        )}
        {currentFile && (
          <p className="text-sm text-gray-500 dark:text-gray-500">
            {currentFile.file_name.replace(/^\d+_/, '')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 mb-4">
      {audiobookCover && (
        <img
          src={audiobookCover}
          alt={audiobookTitle}
          className="w-14 h-14 object-cover rounded-lg"
          loading="lazy"
        />
      )}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
          {audiobookTitle}
        </h3>
        {audiobookAuthor && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {audiobookAuthor}
          </p>
        )}
        {currentFile ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
            {currentFile.file_name.replace(/^\d+_/, '')}
          </p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
            加载中...
          </p>
        )}
      </div>
    </div>
  );
});

PlayerHeader.displayName = 'PlayerHeader';
