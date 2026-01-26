/**
 * @file ChaptersList.tsx
 * @description 章节列表组件
 */

import React, { memo, useMemo } from 'react';
import { Hash } from 'lucide-react';
import { Chapter } from './types';
import { formatTime } from './utils';

interface ChaptersListProps {
  chapters: Chapter[];
  currentTime: number;
  onChapterClick: (chapter: Chapter) => void;
  isPageMode?: boolean;
}

/**
 * 章节列表组件
 * 显示当前文件的章节列表，支持跳转到指定章节
 */
export const ChaptersList = memo<ChaptersListProps>(({
  chapters,
  currentTime,
  onChapterClick,
  isPageMode = false,
}) => {
  const currentChapter = useMemo(() => {
    for (let i = chapters.length - 1; i >= 0; i--) {
      const chapter = chapters[i];
      if (currentTime >= chapter.start && currentTime <= chapter.end) {
        return chapter;
      }
    }
    return null;
  }, [chapters, currentTime]);

  if (!chapters || chapters.length === 0) {
    return null;
  }

  return (
    <div
      className={`overflow-y-auto border-t border-gray-200 dark:border-gray-700 pt-3 ${
        isPageMode ? 'flex-1 min-h-0 px-4 pb-4 lg:px-6' : 'mt-3 max-h-64'
      }`}
      role="list"
      aria-label="章节列表"
    >
      {chapters.map((chapter) => {
        const isCurrentChapter = currentChapter?.id === chapter.id;
        return (
          <button
            key={chapter.id}
            onClick={() => onChapterClick(chapter)}
            className={`w-full text-left px-3 py-2 rounded transition-colors flex items-center justify-between ${
              isCurrentChapter
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            aria-label={`跳转到章节：${chapter.title}`}
            aria-current={isCurrentChapter ? 'true' : 'false'}
          >
            <span className="text-sm">{chapter.title}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatTime(chapter.start)} - {formatTime(chapter.end)}
            </span>
          </button>
        );
      })}
    </div>
  );
});

ChaptersList.displayName = 'ChaptersList';
