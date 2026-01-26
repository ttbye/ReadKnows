/**
 * @file Playlist.tsx
 * @description 播放列表组件（支持虚拟滚动优化）
 */

import React, { memo, useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { Play, Clock } from 'lucide-react';
import { AudioFile } from './types';
import { formatDuration, formatFileSize } from './utils';

interface PlaylistProps {
  files: AudioFile[];
  currentFileId: string;
  isPlaying: boolean;
  onFileSelect: (fileId: string) => void;
  onFilePlay?: (fileId: string, forceRestart?: boolean) => void;
  selectedFileId?: string | null;
  isPageMode?: boolean;
  isPWAMode?: boolean;
  enableVirtualScroll?: boolean;
  fileProgresses?: { [fileId: string]: { file_id: string; current_time: number; duration: number; progress: number; last_played_at: string } };
}

export const Playlist = memo<PlaylistProps>(({
  files,
  currentFileId,
  isPlaying,
  onFileSelect,
  onFilePlay,
  selectedFileId,
  isPageMode = false,
  isPWAMode = false,
  enableVirtualScroll = files.length > 100,
  fileProgresses,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentFileButtonRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ fileId: string; x: number; y: number; time: number; hasMoved: boolean } | null>(null);
  const hasScrolledToCurrentFile = useRef(false);
  const isUserScrolling = useRef(false); // 标记用户是否正在手动滚动
  const lastScrolledFileIdRef = useRef<string | null>(null); // 记录上次滚动到的文件ID

  // 使用useState管理虚拟滚动范围
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(50, files.length),
  });

  // 当前播放文件在原始列表中的位置
  const currentFileIndex = useMemo(() => {
    return files.findIndex(file => file.id === currentFileId);
  }, [files, currentFileId]);

  // 优化滚动到当前文件
  const scrollToCurrentFile = useCallback((immediate = false, forceUpdateRange = false) => {
    if (!currentFileId || !containerRef.current || currentFileIndex === -1) {
      return;
    }

    const container = containerRef.current;
    const itemHeight = 60;

    if (enableVirtualScroll) {
      // 虚拟滚动模式：确保当前文件在可见范围内，然后滚动到正确位置

      // 检查当前文件是否在当前可见范围内
      const isCurrentFileVisible = currentFileIndex >= visibleRange.start && currentFileIndex < visibleRange.end;

      if (!isCurrentFileVisible || forceUpdateRange) {
        // 当前文件不在可见范围内，或者强制更新范围，需要更新可见范围
        const buffer = 10;
        const containerHeight = container.clientHeight;
        const visibleItemCount = Math.ceil(containerHeight / itemHeight);

        // 将当前文件放在可见范围的顶部位置，实现置顶显示
        const start = Math.max(0, currentFileIndex - 1); // 当前文件前一个作为缓冲
        const end = Math.min(files.length, start + visibleItemCount + buffer);

        setVisibleRange({ start: adjustedStart, end });
        return; // 等待下一次渲染后再滚动
      }

      // 当前文件在可见范围内，使用scrollIntoView来准确定位
      // 延迟执行，确保DOM已更新
      const performScroll = () => {
        const currentFileElements = container.querySelectorAll('[data-file-id]');
        const targetElement = Array.from(currentFileElements).find(
          el => el.getAttribute('data-file-id') === currentFileId
        ) as HTMLElement;

        if (targetElement) {
          // 计算元素在容器中的位置
          const containerRect = container.getBoundingClientRect();
          const elementRect = targetElement.getBoundingClientRect();
          const relativeTop = elementRect.top - containerRect.top;
          const currentScrollTop = container.scrollTop;

          // 检查元素是否已经在容器顶部附近
          const tolerance = 10;
          if (Math.abs(relativeTop) <= tolerance) {
            return; // 已经在正确位置
          }

          // 计算目标滚动位置
          const targetScrollTop = currentScrollTop + relativeTop;

          // 使用容器的scrollTo方法，确保只在容器内滚动
          if (immediate) {
            container.scrollTop = targetScrollTop;
          } else {
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth',
            });
          }
        } else {
          // fallback：使用计算的位置
          const relativeIndex = currentFileIndex - visibleRange.start;
          const targetScrollTop = relativeIndex * itemHeight;
          const currentScrollTop = container.scrollTop;
          const tolerance = 5;

          if (Math.abs(currentScrollTop - targetScrollTop) > tolerance) {
            if (immediate) {
              container.scrollTop = targetScrollTop;
            } else {
              container.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth',
              });
            }
          }
        }
      };

      if (immediate) {
        // 立即执行
        performScroll();
      } else {
        // 延迟执行，确保DOM已更新
        setTimeout(performScroll, 50);
      }
    } else {
      // 非虚拟滚动模式：使用scrollIntoView进行精确定位
      const performScroll = () => {
        const currentFileElements = container.querySelectorAll('[data-file-id]');
        const targetElement = Array.from(currentFileElements).find(
          el => el.getAttribute('data-file-id') === currentFileId
        ) as HTMLElement;

        if (targetElement) {
          // 计算元素在容器中的位置
          const containerRect = container.getBoundingClientRect();
          const elementRect = targetElement.getBoundingClientRect();
          const relativeTop = elementRect.top - containerRect.top;
          const currentScrollTop = container.scrollTop;

          // 检查元素是否已经在容器顶部附近
          const tolerance = 10;
          if (Math.abs(relativeTop) <= tolerance) {
            return; // 已经在正确位置
          }

          // 计算目标滚动位置
          const targetScrollTop = currentScrollTop + relativeTop;

          // 使用容器的scrollTo方法，确保只在容器内滚动
          if (immediate) {
            container.scrollTop = targetScrollTop;
          } else {
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth',
            });
          }
        } else {
          // fallback：使用计算的位置
          const targetScrollTop = currentFileIndex * itemHeight;
          const currentScrollTop = container.scrollTop;
          const containerHeight = container.clientHeight;

          const fileTop = targetScrollTop;
          const fileBottom = targetScrollTop + itemHeight;
          const visibleTop = currentScrollTop;
          const visibleBottom = currentScrollTop + containerHeight;

          if (fileTop >= visibleTop && fileBottom <= visibleBottom) {
            return;
          }

          const tolerance = 5;
          if (Math.abs(currentScrollTop - targetScrollTop) <= tolerance) {
            return;
          }

          if (immediate) {
            container.scrollTop = targetScrollTop;
          } else {
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth',
            });
          }
        }
      };

      if (immediate) {
        performScroll();
      } else {
        setTimeout(performScroll, 50);
      }
    }

    hasScrolledToCurrentFile.current = true;
  }, [currentFileId, currentFileIndex, enableVirtualScroll, visibleRange, files.length]);

  // ✅ 修复：移除组件挂载时的自动滚动，让用户可以正常查看列表
  // 只有在音频切换时才滚动，这样不会干扰用户的浏览

  // 当当前文件变化时，滚动到该文件（只在真正切换音频时滚动）
  useEffect(() => {
    // 只有当 currentFileId 真正发生变化时才滚动
    if (currentFileId && currentFileIndex !== -1 && !isUserScrolling.current && lastScrolledFileIdRef.current !== currentFileId) {
      // 更新最后滚动到的文件ID
      lastScrolledFileIdRef.current = currentFileId;

      const timer = setTimeout(() => {
        // 再次检查用户是否正在滚动，如果是则不执行自动滚动
        if (!isUserScrolling.current) {
          scrollToCurrentFile(true, false); // 立即滚动，不强制更新范围，置顶显示
        }
      }, 500); // 增加延迟时间，避免干扰用户操作
      return () => clearTimeout(timer);
    }
  }, [currentFileId, currentFileIndex, scrollToCurrentFile, isUserScrolling.current]);

  // ✅ 修复：移除可见范围变化时的自动滚动
  // 只有在音频切换时才滚动，让用户可以正常浏览列表

  // 虚拟滚动处理
  const handleScroll = useCallback((e?: React.UIEvent<HTMLDivElement>) => {
    if (!enableVirtualScroll || !containerRef.current) return;

    // 如果是程序化滚动（比如我们的scrollToCurrentFile），不标记为用户滚动
    if (e && e.nativeEvent) {
      // 标记用户正在滚动
      isUserScrolling.current = true;

      // 清除用户滚动标记的定时器
      if ((window as any).userScrollTimer) {
        clearTimeout((window as any).userScrollTimer);
      }
      (window as any).userScrollTimer = setTimeout(() => {
        isUserScrolling.current = false;
      }, 150); // 150ms后认为滚动结束
    }

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const itemHeight = 60;
    const buffer = 10;

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const end = Math.min(
      files.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
    );

    setVisibleRange({ start, end });
  }, [enableVirtualScroll, files.length]);

  // 渲染的文件列表（基于虚拟滚动范围）
  const visibleFiles = useMemo(() => {
    if (!enableVirtualScroll) {
      return files;
    }
    return files.slice(visibleRange.start, visibleRange.end);
  }, [files, enableVirtualScroll, visibleRange]);

  // 虚拟滚动占位高度
  const topSpacerHeight = enableVirtualScroll ? visibleRange.start * 60 : 0;
  const bottomSpacerHeight = enableVirtualScroll
    ? Math.max(0, (files.length - visibleRange.end) * 60)
    : 0;

  // 双击检测状态
  const clickCountRef = useRef<{ [fileId: string]: { count: number; timer: NodeJS.Timeout | null } }>({});

  // 点击事件处理
  const handleFileClick = useCallback((fileId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 如果没有 onFilePlay 回调，双击功能不可用，使用单次点击选择
    if (!onFilePlay) {
      onFileSelect(fileId);
      return;
    }

    // 获取或创建该文件的点击计数器
    const clickData = clickCountRef.current[fileId] || { count: 0, timer: null };
    clickCountRef.current[fileId] = clickData;

    // 清除之前的定时器
    if (clickData.timer) {
      clearTimeout(clickData.timer);
    }

    // 增加点击计数
    clickData.count += 1;

    if (clickData.count === 1) {
      // 第一次点击，设置定时器
      clickData.timer = setTimeout(() => {
        // 定时器到期，只点击一次，选择文件
        onFileSelect(fileId);
        clickData.count = 0;
        clickData.timer = null;
      }, 300); // 300ms 内没有第二次点击则认为是单次点击
    } else if (clickData.count === 2) {
      // 第二次点击，双击播放
      // 清除定时器，防止单次点击的处理
      if (clickData.timer) {
        clearTimeout(clickData.timer);
        clickData.timer = null;
      }

      // 执行双击播放逻辑
      handleDoubleClickPlay(fileId);

      // 重置计数器
      clickData.count = 0;
    }
  }, [onFileSelect, onFilePlay]);

  // 双击播放处理函数
  const handleDoubleClickPlay = useCallback((fileId: string) => {
    if (!onFilePlay) return;

    // 检查文件进度，如果进度 > 99%，强制从头播放
    const fileProgress = fileProgresses?.[fileId];
    const forceRestart = fileProgress && fileProgress.progress > 99;

    // 调用播放函数，传递是否强制重启的参数
    onFilePlay(fileId, forceRestart);
  }, [fileProgresses, onFilePlay]);

  // 触摸事件处理
  const handleTouchStart = useCallback((fileId: string, e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-play-button]')) {
      return;
    }
    
    const touch = e.touches[0];
    touchStartRef.current = {
      fileId,
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      hasMoved: false,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-play-button]')) {
      return;
    }
    
    if (touchStartRef.current) {
      touchStartRef.current.hasMoved = true;
    }
  }, []);

  const handleTouchEnd = useCallback((fileId: string, e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-play-button]')) {
      touchStartRef.current = null;
      return;
    }
    
    if (!touchStartRef.current || touchStartRef.current.fileId !== fileId) {
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const deltaTime = Date.now() - touchStartRef.current.time;
    const hasMoved = touchStartRef.current.hasMoved;

    if (hasMoved || deltaX > 5 || deltaY > 5 || deltaTime > 300) {
      touchStartRef.current = null;
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    onFileSelect(fileId);
    touchStartRef.current = null;
  }, [onFileSelect]);

  return (
    <div
      ref={containerRef}
      data-playlist-container="true"
      className={`overflow-y-auto scroll-smooth ${
        isPageMode ? 'flex-1 min-h-0 max-h-[60vh] px-2 pb-4 lg:px-4' : 'mt-3 max-h-64 px-2'
      }`}
      onScroll={(e) => {
        if (enableVirtualScroll) {
          handleScroll(e);
        }
        // 分发滚动事件给父组件（用于头部收缩等功能）
        window.dispatchEvent(new CustomEvent('playlist:scroll', {
          detail: { scrollTop: e.currentTarget.scrollTop }
        }));
      }}
      onTouchStart={(e) => {
        // 防止触摸事件冒泡
        if (isPageMode) {
          e.stopPropagation();
        }
      }}
      onTouchEnd={(e) => {
        // 防止触摸事件冒泡
        if (isPageMode) {
          e.stopPropagation();
        }
      }}
      onWheel={(e) => {
        // 在播放列表容器内，始终阻止滚轮事件冒泡，防止页面滚动
        if (isPageMode) {
          e.stopPropagation();
        }
      }}
      onTouchMove={(e) => {
        if (touchStartRef.current) {
          touchStartRef.current.hasMoved = true;
        }

        // 在播放列表容器内，始终阻止触摸滚动事件冒泡，防止页面滚动
        if (isPageMode) {
          e.stopPropagation();
        }
      }}
      style={
        isPageMode
          ? {
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
              // 防止页面弹性滚动
              overscrollBehaviorY: 'contain',
              // 确保滚动只在容器内进行
              position: 'relative',
              // 防止 iOS Safari 的橡皮筋效果
              WebkitTransform: 'translateZ(0)',
            }
          : {}
      }
      role="list"
      aria-label="播放列表"
    >
      {/* 虚拟滚动：顶部占位 */}
      {topSpacerHeight > 0 && (
        <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      )}

      {/* 文件列表 */}
      {visibleFiles.map((file, index) => {
        const actualIndex = visibleRange.start + index;
        const isCurrent = file.id === currentFileId;
        const isSelected = selectedFileId ? file.id === selectedFileId : false;
        const isPlayingState = isCurrent && isPlaying;
        const isSelectedState = isSelected && !isCurrent;

        return (
          <div
            key={file.id}
            data-file-id={file.id}
            ref={isCurrent ? currentFileButtonRef : null}
            onClick={(e) => handleFileClick(file.id, e)}
            onTouchStart={(e) => handleTouchStart(file.id, e)}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => handleTouchEnd(file.id, e)}
            className={`relative flex items-center gap-2 px-2 py-2 cursor-pointer transition-all duration-200 border-b border-transparent ${
              isPlayingState
                ? 'bg-blue-50/50 dark:bg-blue-900/10 border-b-blue-500/30 dark:border-b-blue-400/30'
                : isSelectedState
                ? 'bg-gray-50/50 dark:bg-gray-800/30 border-b-gray-300/20 dark:border-b-gray-600/20'
                : 'hover:bg-gray-50/30 dark:hover:bg-gray-800/20 border-b-gray-200/10 dark:border-b-gray-700/10'
            }`}
            role="listitem"
            aria-label={`${file.file_name.replace(/^\d+_/, '')}，${actualIndex + 1} / ${files.length}`}
            aria-current={isCurrent ? 'true' : 'false'}
          >
            <div
              className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded font-semibold text-xs transition-all ${
                isPlayingState
                  ? 'bg-blue-500 text-white'
                  : isSelectedState
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              {actualIndex + 1}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <h3
                className={`flex-1 text-sm font-medium truncate ${
                  isPlayingState
                    ? 'text-blue-600 dark:text-blue-400'
                    : isSelectedState
                    ? 'text-gray-700 dark:text-gray-300'
                    : 'text-gray-900 dark:text-gray-100'
                }`}
              >
                {file.file_name.replace(/^\d+_/, '')}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {file.duration && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {formatDuration(file.duration)}
                  </span>
                )}
                {file.file_size && (
                  <span className="hidden sm:inline-flex items-center gap-1">
                    <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></span>
                    {formatFileSize(file.file_size)}
                  </span>
                )}
              </div>
            </div>
            {isPlayingState && (
              <div className="flex-shrink-0 flex items-center gap-1.5">
                <div className="relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse"></div>
                  <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 animate-ping opacity-60"></div>
                </div>
                <div className="w-7 h-7 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center transition-all">
                  <Play
                    className="w-3.5 h-3.5 text-white"
                    fill="currentColor"
                    stroke="none"
                    style={{ marginLeft: '1px' }}
                  />
                </div>
              </div>
            )}
            {isSelectedState && !isPlayingState && (
              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()} data-play-button="true">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onFilePlay) {
                      onFilePlay(file.id);
                    }
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    if (touchStartRef.current) {
                      touchStartRef.current = null;
                    }
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (touchStartRef.current) {
                      touchStartRef.current = null;
                    }
                    if (onFilePlay) {
                      onFilePlay(file.id);
                    }
                  }}
                  data-play-button="true"
                  className="w-7 h-7 flex items-center justify-center text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 active:text-blue-700 dark:active:text-blue-200 transition-colors duration-200 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/30"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                  title="播放此音频"
                  aria-label="播放此音频"
                >
                  <Play
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    fill="currentColor"
                    stroke="none"
                    style={{ marginLeft: '2px', pointerEvents: 'none' }}
                  />
                </button>
              </div>
            )}

            {fileProgresses && fileProgresses[file.id] && fileProgresses[file.id].duration > 0 && (
              <div className="absolute bottom-0 left-9 right-2 h-0.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, fileProgresses[file.id].progress || 0))}%`,
                    transition: 'width 0.1s linear',
                    willChange: 'width',
                    backgroundColor: isCurrent
                      ? 'rgba(59, 130, 246, 0.4)'
                      : 'rgba(96, 165, 250, 0.3)'
                  }}
                  title={`已播放 ${fileProgresses[file.id].progress.toFixed(1)}%`}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* 虚拟滚动：底部占位 */}
      {bottomSpacerHeight > 0 && (
        <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
      )}
    </div>
  );
});

Playlist.displayName = 'Playlist';