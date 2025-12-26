/**
 * @author ttbye
 * PC端左侧目录面板组件
 * 支持根据阅读进度高亮当前章节并自动滚动
 */

import { useEffect, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { TOCItem, ReadingPosition } from '../../types/reader';

interface SideTOCPanelProps {
  toc: TOCItem[];
  currentPosition: ReadingPosition;
  bookType?: string;
  themeStyles: {
    bg: string;
    text: string;
    border: string;
  };
  showSideTOC: boolean;
  onClose: () => void;
  onChapterSelect: (href?: string) => void;
  getToolbarTop: () => string;
  infoBarHeight: number;
  showBottomInfoBar: boolean;
}

export default function SideTOCPanel({
  toc,
  currentPosition,
  bookType,
  themeStyles,
  showSideTOC,
  onClose,
  onChapterSelect,
  getToolbarTop,
  infoBarHeight,
  showBottomInfoBar,
}: SideTOCPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentItemRef = useRef<HTMLButtonElement>(null);

  // 计算当前应该高亮的目录项索引
  const currentChapterIndex = useMemo(() => {
    if (toc.length === 0) return -1;

    // EPUB: 使用 chapterIndex，但需要匹配到对应的目录项
    if (bookType === 'epub') {
      const chapterIndex = currentPosition.chapterIndex ?? -1;
      if (chapterIndex < 0) return -1;
      
      // 直接使用 chapterIndex 作为目录索引（如果目录项有 chapterIndex 属性）
      // 否则，尝试通过索引匹配
      for (let i = 0; i < toc.length; i++) {
        const item = toc[i];
        // 如果目录项有 chapterIndex 属性，直接匹配
        if ((item as any).chapterIndex !== undefined && (item as any).chapterIndex === chapterIndex) {
          return i;
        }
      }
      
      // 如果没有找到匹配项，使用索引匹配（假设目录顺序与章节顺序一致）
      if (chapterIndex >= 0 && chapterIndex < toc.length) {
        return chapterIndex;
      }
      
      // 如果索引超出范围，返回最后一个目录项
      return toc.length - 1;
    }

    // PDF/TXT/MD/Office: 根据 currentPage 匹配
    const currentPage = currentPosition.currentPage || 0;
    if (currentPage <= 0) return -1;

    // 查找最接近且不超过当前页面的目录项
    let bestMatch = -1;
    let bestPage = -1;

    for (let i = 0; i < toc.length; i++) {
      const item = toc[i];
      if (!item.href) continue;

      // 解析页码
      const pageMatch = item.href.match(/page=(\d+)/);
      if (pageMatch) {
        const itemPage = parseInt(pageMatch[1], 10);
        
        // 如果目录项页码不超过当前页，且比之前找到的最佳匹配更接近当前页
        if (itemPage <= currentPage && itemPage > bestPage) {
          bestMatch = i;
          bestPage = itemPage;
        }
      }
    }

    // 如果找到匹配项，返回索引
    if (bestMatch >= 0) {
      return bestMatch;
    }

    // 如果没有找到匹配项，且当前页小于第一个目录项的页码，返回0
    if (toc.length > 0) {
      const firstItem = toc[0];
      if (firstItem.href) {
        const pageMatch = firstItem.href.match(/page=(\d+)/);
        if (pageMatch) {
          const firstPage = parseInt(pageMatch[1], 10);
          if (currentPage < firstPage) {
            return 0;
          }
        }
      }
      // 如果当前页超过所有目录项，返回最后一个目录项
      return toc.length - 1;
    }

    return -1;
  }, [toc, currentPosition, bookType]);

  // 当当前章节变化时，自动滚动到对应位置
  useEffect(() => {
    if (!showSideTOC || currentChapterIndex < 0 || !scrollContainerRef.current || !currentItemRef.current) {
      return;
    }

    const container = scrollContainerRef.current;
    const item = currentItemRef.current;

    // 计算元素位置
    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    // 计算需要滚动的距离
    const itemTop = itemRect.top - containerRect.top + container.scrollTop;
    const itemBottom = itemTop + itemRect.height;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    // 如果当前项不在可视区域内，滚动到中心位置
    if (itemTop < scrollTop || itemBottom > scrollTop + containerHeight) {
      const targetScroll = itemTop - containerHeight / 2 + itemRect.height / 2;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [showSideTOC, currentChapterIndex]);

  return (
    <>
      {/* 目录遮罩层 - 当目录显示时，点击遮罩关闭目录 */}
      {showSideTOC && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-20"
          onClick={onClose}
          style={{ display: showSideTOC ? 'block' : 'none' }}
        />
      )}
      <div
        className={`fixed left-0 top-0 bottom-0 z-40 transition-transform duration-300 ${
          showSideTOC ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          width: '280px',
          backgroundColor: themeStyles.bg,
          borderRight: `1px solid ${themeStyles.border}`,
          paddingTop: getToolbarTop(),
          paddingBottom: showBottomInfoBar
            ? `calc(${infoBarHeight}px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
            : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
          boxShadow: showSideTOC ? '2px 0 8px rgba(0, 0, 0, 0.1)' : 'none',
        }}
      >
        <div ref={scrollContainerRef} className="h-full overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: themeStyles.border }}>
            <h2 className="text-base font-semibold" style={{ color: themeStyles.text }}>目录</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              style={{ color: themeStyles.text }}
              aria-label="关闭目录"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-2 py-2">
            {toc.map((item, index) => {
              const isCurrent = index === currentChapterIndex;
              return (
                <button
                  key={item.id || index}
                  ref={isCurrent ? currentItemRef : null}
                  onClick={() => onChapterSelect(item.href)}
                  className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    isCurrent ? 'bg-blue-100 dark:bg-blue-900/30 font-medium' : ''
                  }`}
                  style={{
                    paddingLeft: `${(item.level || 1) * 16 + 12}px`,
                    color: isCurrent ? (themeStyles.text === '#1a1a1a' ? '#1890ff' : '#60a5fa') : themeStyles.text,
                    fontSize: '0.875rem',
                  }}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

