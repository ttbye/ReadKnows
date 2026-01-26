/**
 * @author ttbye
 * 书签面板组件 - 完善版
 * 参考主流阅读软件的书签功能
 */

import { useState, useMemo } from 'react';
import { X, Bookmark, BookmarkCheck, Trash2, Search, Edit2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ReadingSettings } from '../../types/reader';
import { useTranslation } from 'react-i18next';

interface Bookmark {
  id: string;
  bookId: string;
  fileType: string;
  name?: string; // 书签名称
  note?: string; // 书签备注
  position: {
    progress?: number;
    currentPage?: number;
    chapterIndex?: number;
    cfi?: string;
    currentLocation?: string;
  };
  preview?: string;
  createdAt: number;
}

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  currentPosition: {
    progress?: number;
    currentPage?: number;
    chapterIndex?: number;
    currentLocation?: string;
  };
  fileType?: string;
  settings: ReadingSettings;
  isVisible: boolean;
  onClose: () => void;
  onBookmarkClick: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  onEditBookmark?: (bookmark: Bookmark) => void;
}

type SortType = 'progress' | 'time';

export default function BookmarkPanel({
  bookmarks,
  currentPosition,
  fileType,
  settings,
  isVisible,
  onClose,
  onBookmarkClick,
  onDeleteBookmark,
  onEditBookmark,
}: BookmarkPanelProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<SortType>('progress');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const themeStyles = {
    light: {
      panelBg: '#ffffff',
      panelText: '#111827',
      border: 'rgba(229,231,235,0.7)',
      subText: '#6b7280',
      listBg: 'rgba(249,250,251,0.75)',
      cardBg: 'rgba(255,255,255,0.92)',
      overlay: 'rgba(0,0,0,0.55)',
      hoverBg: 'rgba(243,244,246,0.8)',
      inputBg: 'rgba(255,255,255,0.9)',
    },
    dark: {
      panelBg: '#111827',
      panelText: '#f9fafb',
      border: 'rgba(31,41,55,0.85)',
      subText: '#d1d5db',
      listBg: 'rgba(3,7,18,0.35)',
      cardBg: 'rgba(17,24,39,0.78)',
      overlay: 'rgba(0,0,0,0.55)',
      hoverBg: 'rgba(31,41,55,0.8)',
      inputBg: 'rgba(31,41,55,0.9)',
    },
    sepia: {
      panelBg: '#f4e4bc',
      panelText: '#5c4b37',
      border: 'rgba(212,196,156,0.9)',
      subText: 'rgba(92,75,55,0.75)',
      listBg: 'rgba(244,228,188,0.85)',
      cardBg: 'rgba(255,255,255,0.55)',
      overlay: 'rgba(0,0,0,0.45)',
      hoverBg: 'rgba(255,255,255,0.4)',
      inputBg: 'rgba(255,255,255,0.7)',
    },
    green: {
      panelBg: '#c8e6c9',
      panelText: '#2e7d32',
      border: 'rgba(165,214,167,0.9)',
      subText: 'rgba(46,125,50,0.75)',
      listBg: 'rgba(200,230,201,0.85)',
      cardBg: 'rgba(255,255,255,0.55)',
      overlay: 'rgba(0,0,0,0.45)',
      hoverBg: 'rgba(255,255,255,0.4)',
      inputBg: 'rgba(255,255,255,0.7)',
    },
  }[settings.theme];

  // 格式化进度显示
  const formatProgress = (progress?: number) => {
    if (progress === undefined || progress === null) return '';
    return `${(progress * 100).toFixed(1)}%`;
  };

  // 格式化页码显示
  const formatPage = (page?: number) => {
    if (page === undefined || page === null) return '';
    return t('reader.pageNumber', { page });
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return t('reader.today');
    } else if (days === 1) {
      return t('reader.yesterday');
    } else if (days < 7) {
      return t('reader.daysAgo', { days });
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  // 检查书签是否是当前位置（与 ReaderContainer 中的逻辑保持一致）
  const isCurrentPosition = (bookmark: Bookmark) => {
    const currentProgress = currentPosition.progress || 0;
    const currentPage = currentPosition.currentPage || 0;
    const currentChapterIndex = currentPosition.chapterIndex;
    const currentLocation = currentPosition.currentLocation;
    const bookmarkProgress = bookmark.position.progress || 0;
    
    // 优先使用 currentLocation 匹配（EPUB CFI 或其他格式的位置标识）- 精确匹配
    if (currentLocation) {
      if (bookmark.position.currentLocation === currentLocation) return true;
      if (bookmark.position.cfi === currentLocation) return true;
    }
    
    // 对于有页码的格式（PDF/TXT），使用页码匹配 - 精确匹配
    if (currentPage > 0 && fileType && (fileType === 'pdf' || fileType === 'txt')) {
      if (bookmark.position.currentPage === currentPage) return true;
    }
    
    // 对于 EPUB，如果有章节索引，同时匹配章节索引和 progress
    if (fileType === 'epub' && currentChapterIndex !== undefined) {
      // 章节索引必须匹配
      if (bookmark.position.chapterIndex !== currentChapterIndex) return false;
      // progress 必须非常接近（允许 0.1% 的误差）
      return Math.abs(bookmarkProgress - currentProgress) < 0.001;
    }
    
    // 兜底：使用 progress 匹配（仅在没有精确位置标识时使用，误差更小：0.1%）
    // 如果有 currentLocation 或页码，不应该使用 progress 匹配
    if (bookmark.position.currentLocation || bookmark.position.cfi || bookmark.position.currentPage) {
      return false;
    }
    return Math.abs(bookmarkProgress - currentProgress) < 0.001;
  };

  // 过滤和排序书签
  const filteredAndSortedBookmarks = useMemo(() => {
    // 在 useMemo 内部定义 formatProgress，避免依赖外部函数
    const formatProgress = (progress?: number) => {
      if (progress === undefined || progress === null) return '';
      return `${(progress * 100).toFixed(1)}%`;
    };

    let filtered = bookmarks;

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = bookmarks.filter(bookmark => {
        const nameMatch = bookmark.name?.toLowerCase().includes(query);
        const noteMatch = bookmark.note?.toLowerCase().includes(query);
        const previewMatch = bookmark.preview?.toLowerCase().includes(query);
        const pageMatch = bookmark.position.currentPage?.toString().includes(query);
        const progressMatch = formatProgress(bookmark.position.progress).includes(query);
        return nameMatch || noteMatch || previewMatch || pageMatch || progressMatch;
      });
    }

    // 排序
    const sorted = [...filtered].sort((a, b) => {
      if (sortType === 'progress') {
        const progressA = a.position.progress || 0;
        const progressB = b.position.progress || 0;
        return sortOrder === 'asc' ? progressA - progressB : progressB - progressA;
      } else {
        // 按时间排序
        return sortOrder === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
      }
    });

    return sorted;
  }, [bookmarks, searchQuery, sortType, sortOrder]);

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const toggleSortType = () => {
    setSortType(prev => prev === 'progress' ? 'time' : 'progress');
  };

  // 早期返回必须在所有 hooks 之后
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex items-end sm:items-center sm:justify-center"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full sm:w-96 h-full sm:h-auto sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col border overflow-hidden"
        style={{
          backgroundColor: themeStyles.panelBg,
          borderColor: themeStyles.border,
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b backdrop-blur-md"
          style={{
            borderColor: themeStyles.border,
            backgroundColor: `${themeStyles.panelBg}80`,
          }}
        >
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-5 h-5" style={{ color: '#ff9800' }} />
            <h2 className="text-base font-semibold" style={{ color: themeStyles.panelText }}>
              {t('reader.bookmarks')} ({bookmarks.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{
              color: themeStyles.subText,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索和排序栏 */}
        {bookmarks.length > 0 && (
          <div className="px-4 py-2 border-b" style={{ borderColor: themeStyles.border }}>
            {/* 搜索框 */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: themeStyles.subText }} />
              <input
                type="text"
                placeholder={t('reader.searchBookmarks')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-3 py-2 rounded-lg text-sm border"
                style={{
                  backgroundColor: themeStyles.inputBg,
                  color: themeStyles.panelText,
                  borderColor: themeStyles.border,
                }}
              />
            </div>

            {/* 排序控制 */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSortType}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs"
                style={{
                  color: themeStyles.subText,
                  backgroundColor: themeStyles.hoverBg,
                }}
              >
                <ArrowUpDown className="w-3 h-3" />
                {sortType === 'progress' ? t('reader.sortByProgress') : t('reader.sortByTime')}
              </button>
              <button
                onClick={toggleSortOrder}
                className="p-1 rounded"
                style={{
                  color: themeStyles.subText,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = themeStyles.hoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {sortOrder === 'asc' ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* 书签列表 */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: themeStyles.listBg }}>
          {filteredAndSortedBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <Bookmark className="w-16 h-16 mx-auto mb-4 opacity-30" style={{ color: themeStyles.subText }} />
              <p style={{ color: themeStyles.subText }}>
                {searchQuery ? t('reader.noMatchingBookmarks') : t('reader.noBookmarks')}
              </p>
              {!searchQuery && (
                <p className="text-xs mt-2" style={{ color: themeStyles.subText, opacity: 0.7 }}>
                  {t('reader.addBookmarkHint')}
                </p>
              )}
            </div>
          ) : (
            <div className="py-2">
              {filteredAndSortedBookmarks.map((bookmark) => {
                const isCurrent = isCurrentPosition(bookmark);
                return (
                  <div
                    key={bookmark.id}
                    className="mx-2 mb-2 rounded-xl border transition-colors"
                    style={{
                      backgroundColor: isCurrent ? (settings.theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)') : themeStyles.cardBg,
                      borderColor: isCurrent ? '#3b82f6' : themeStyles.border,
                    }}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* 书签名称 */}
                          {bookmark.name && (
                            <h3 className="text-sm font-semibold mb-1" style={{ color: themeStyles.panelText }}>
                              {bookmark.name}
                            </h3>
                          )}

                          {/* 位置信息 */}
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {bookmark.position.currentPage && (
                              <span className="text-sm font-medium" style={{ color: themeStyles.panelText }}>
                                {formatPage(bookmark.position.currentPage)}
                              </span>
                            )}
                            {bookmark.position.progress !== undefined && (
                              <span className="text-sm font-medium" style={{ color: themeStyles.panelText }}>
                                {formatProgress(bookmark.position.progress)}
                              </span>
                            )}
                            {!bookmark.position.currentPage && bookmark.position.progress === undefined && (
                              <span className="text-sm" style={{ color: themeStyles.subText }}>
                                {t('reader.positionUnknown')}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500 text-white">
                                {t('reader.currentPosition')}
                              </span>
                            )}
                          </div>
                          
                          {/* 书签备注 */}
                          {bookmark.note && (
                            <p className="text-sm mb-1 italic" style={{ color: themeStyles.subText }}>
                              {bookmark.note}
                            </p>
                          )}
                          
                          {/* 预览文本 */}
                          {bookmark.preview && !bookmark.note && (
                            <p
                              className="text-sm line-clamp-2 mb-1"
                              style={{ color: themeStyles.subText }}
                            >
                              {bookmark.preview}
                            </p>
                          )}
                          
                          {/* 创建时间 */}
                          <p className="text-xs" style={{ color: themeStyles.subText, opacity: 0.7 }}>
                            {formatDate(bookmark.createdAt)}
                          </p>
                        </div>
                        
                        {/* 操作按钮 */}
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {onEditBookmark && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditBookmark(bookmark);
                              }}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{
                                color: themeStyles.subText,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = themeStyles.hoverBg;
                                e.currentTarget.style.color = '#3b82f6';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = themeStyles.subText;
                              }}
                              aria-label={t('common.edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteBookmark(bookmark.id);
                            }}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{
                              color: themeStyles.subText,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = themeStyles.hoverBg;
                              e.currentTarget.style.color = '#ef4444';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = themeStyles.subText;
                            }}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* 跳转按钮 */}
                      <button
                        onClick={() => onBookmarkClick(bookmark)}
                        className="w-full mt-2 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: isCurrent ? 'rgba(59, 130, 246, 0.1)' : themeStyles.hoverBg,
                          color: isCurrent ? '#3b82f6' : themeStyles.panelText,
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrent) {
                            e.currentTarget.style.backgroundColor = themeStyles.hoverBg;
                            e.currentTarget.style.opacity = '0.8';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrent) {
                            e.currentTarget.style.backgroundColor = themeStyles.hoverBg;
                            e.currentTarget.style.opacity = '1';
                          }
                        }}
                      >
                        {isCurrent ? t('reader.currentPosition') : t('reader.goToBookmark')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
