/**
 * @author ttbye
 * 书签面板组件
 */

import { X, Bookmark, BookmarkCheck, Trash2 } from 'lucide-react';
import { ReadingSettings } from '../../types/reader';

interface Bookmark {
  id: string;
  bookId: string;
  fileType: string;
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
  };
  settings: ReadingSettings;
  isVisible: boolean;
  onClose: () => void;
  onBookmarkClick: (bookmark: Bookmark) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
}

export default function BookmarkPanel({
  bookmarks,
  currentPosition,
  settings,
  isVisible,
  onClose,
  onBookmarkClick,
  onDeleteBookmark,
}: BookmarkPanelProps) {
  if (!isVisible) return null;

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
    },
  }[settings.theme];

  // 格式化进度显示
  const formatProgress = (progress?: number) => {
    if (progress === undefined || progress === null) return '';
    return `${(progress * 100).toFixed(2)}%`;
  };

  // 格式化页码显示
  const formatPage = (page?: number) => {
    if (page === undefined || page === null) return '';
    return `第 ${page} 页`;
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return '今天';
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  // 检查书签是否是当前位置
  const isCurrentPosition = (bookmark: Bookmark) => {
    const currentProgress = currentPosition.progress || 0;
    const currentPage = currentPosition.currentPage || 0;
    const bookmarkProgress = bookmark.position.progress || 0;
    
    // 使用 progress 匹配（允许 0.5% 误差）
    if (Math.abs(bookmarkProgress - currentProgress) < 0.005) {
      return true;
    }
    
    // 使用页码匹配
    if (currentPage > 0 && bookmark.position.currentPage === currentPage) {
      return true;
    }
    
    return false;
  };

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
              书签 ({bookmarks.length})
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
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 书签列表 */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: themeStyles.listBg }}>
          {bookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <Bookmark className="w-16 h-16 mx-auto mb-4 opacity-30" style={{ color: themeStyles.subText }} />
              <p style={{ color: themeStyles.subText }}>还没有书签</p>
              <p className="text-xs mt-2" style={{ color: themeStyles.subText, opacity: 0.7 }}>
                点击底部导航栏的书签按钮添加书签
              </p>
            </div>
          ) : (
            <div className="py-2">
              {bookmarks.map((bookmark) => {
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
                    <button
                      onClick={() => onBookmarkClick(bookmark)}
                      className="w-full text-left p-3 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* 位置信息 */}
                          <div className="flex items-center gap-2 mb-1">
                            {bookmark.position.currentPage ? (
                              <span className="text-sm font-medium" style={{ color: themeStyles.panelText }}>
                                {formatPage(bookmark.position.currentPage)}
                              </span>
                            ) : bookmark.position.progress !== undefined ? (
                              <span className="text-sm font-medium" style={{ color: themeStyles.panelText }}>
                                {formatProgress(bookmark.position.progress)}
                              </span>
                            ) : null}
                            {isCurrent && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500 text-white">
                                当前位置
                              </span>
                            )}
                          </div>
                          
                          {/* 预览文本 */}
                          {bookmark.preview && (
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
                        
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBookmark(bookmark.id);
                          }}
                          className="p-1.5 rounded-lg transition-colors flex-shrink-0"
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
                          aria-label="删除书签"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </button>
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

