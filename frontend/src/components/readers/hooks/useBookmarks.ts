import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { ReadingPosition } from '../../../types/reader';

export interface Bookmark {
  id: string;
  bookId: string;
  fileType: string;
  name?: string; // 书签名称
  note?: string; // 书签备注
  position: {
    progress?: number;
    currentPage?: number;
    chapterIndex?: number;
    cfi?: string; // EPUB CFI
    currentLocation?: string; // 通用位置标识
  };
  preview?: string;
  createdAt: number;
}

function getBookmarkStorageKey(bookId: string) {
  return `bookmarks-${bookId}`;
}

function isSameBookmarkPosition(params: {
  bookmark: Bookmark;
  currentPosition: ReadingPosition;
  fileType?: string;
}) {
  const { bookmark: b, currentPosition, fileType } = params;
  const currentProgress = currentPosition.progress || 0;
  const currentPage = currentPosition.currentPage || 0;
  const currentChapterIndex = currentPosition.chapterIndex;
  const currentLocation = currentPosition.currentLocation;

  // 优先使用 currentLocation 匹配（EPUB CFI 或其他格式的位置标识）- 精确匹配
  if (currentLocation) {
    if (b.position.currentLocation === currentLocation) return true;
    if (b.position.cfi === currentLocation) return true;
  }

  // 对于有页码的格式（PDF/TXT），使用页码匹配 - 精确匹配
  if (currentPage > 0 && (fileType === 'pdf' || fileType === 'txt')) {
    if (b.position.currentPage === currentPage) return true;
  }

  // 对于 EPUB，如果有章节索引，同时匹配章节索引和 progress
  if (fileType === 'epub' && currentChapterIndex !== undefined) {
    if (b.position.chapterIndex !== currentChapterIndex) return false;
    const bookmarkProgress = b.position.progress || 0;
    return Math.abs(bookmarkProgress - currentProgress) < 0.001;
  }

  // 兜底：使用 progress 匹配（仅在没有精确位置标识时使用，误差更小：0.1%）
  // 如果有 currentLocation 或页码，不应该使用 progress 匹配
  if (b.position.currentLocation || b.position.cfi || b.position.currentPage) {
    return false;
  }
  const bookmarkProgress = b.position.progress || 0;
  return Math.abs(bookmarkProgress - currentProgress) < 0.001;
}

export function useBookmarks(params: {
  bookId: string;
  fileType?: string;
  currentPosition: ReadingPosition;
  readingAreaRef?: MutableRefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const { bookId, fileType, currentPosition, readingAreaRef } = params;

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);

  // 记录跳转前的阅读位置（用于返回功能）
  const [previousPosition, setPreviousPosition] = useState<ReadingPosition | null>(null);
  const [showBackButton, setShowBackButton] = useState(false);
  // 标记是否处于书签浏览模式（此时不保存阅读进度）
  const [isBookmarkBrowsingMode, setIsBookmarkBrowsingMode] = useState(false);

  const loadBookmarks = useCallback(() => {
    try {
      const saved = localStorage.getItem(getBookmarkStorageKey(bookId));
      if (saved) {
        const parsed = JSON.parse(saved) as Bookmark[];
        setBookmarks(parsed);
      } else {
        setBookmarks([]);
      }
    } catch (error) {
      console.error('加载书签失败', error);
      setBookmarks([]);
    }
  }, [bookId]);

  const saveBookmarks = useCallback(
    (newBookmarks: Bookmark[]) => {
      try {
        localStorage.setItem(getBookmarkStorageKey(bookId), JSON.stringify(newBookmarks));
        setBookmarks(newBookmarks);
      } catch (error) {
        console.error('保存书签失败', error);
        toast.error(t('reader.saveBookmarkFailed'));
      }
    },
    [bookId, t]
  );

  // 初始化/切书时加载书签
  useEffect(() => {
    loadBookmarks();
    // 切书时也重置书签相关 UI 状态
    setShowBookmarks(false);
    setEditingBookmark(null);
    setPreviousPosition(null);
    setShowBackButton(false);
    setIsBookmarkBrowsingMode(false);
    try {
      (window as any).__isBookmarkBrowsingMode = false;
      (window as any).__previousPositionForSave = null;
    } catch {
      // ignore
    }
  }, [loadBookmarks]);

  const hasCurrentBookmark = useMemo(() => {
    if (!bookmarks.length) return false;
    return bookmarks.some((b) => isSameBookmarkPosition({ bookmark: b, currentPosition, fileType }));
  }, [bookmarks, currentPosition, fileType]);

  const generateBookmarkTitle = useCallback((): string => {
    try {
      // 1. 优先使用章节标题
      if (currentPosition.chapterTitle) {
        return currentPosition.chapterTitle.trim();
      }

      // 2. 对于 EPUB，尝试从页面内容中提取第一行文本
      if (fileType === 'epub') {
        try {
          const container = readingAreaRef?.current;
          const iframe = container?.querySelector('iframe');
          if (iframe) {
            const iframeDoc = (iframe as HTMLIFrameElement).contentDocument || (iframe as HTMLIFrameElement).contentWindow?.document;
            if (iframeDoc) {
              const body = iframeDoc.body;
              if (body) {
                const walker = iframeDoc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);

                let node: Node | null;
                // eslint-disable-next-line no-cond-assign
                while ((node = walker.nextNode())) {
                  const text = node.textContent?.trim();
                  if (text && text.length > 5) {
                    const title = text.substring(0, 30).replace(/\s+/g, ' ').trim();
                    if (title.length > 0) return title;
                  }
                }

                const bodyText = body.textContent?.trim();
                if (bodyText) {
                  const firstLine = bodyText.split('\n')[0]?.trim();
                  if (firstLine && firstLine.length > 5) {
                    return firstLine.substring(0, 30).replace(/\s+/g, ' ').trim();
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('从 EPUB 页面提取标题失败:', e);
        }
      }

      // 3. 对于 TXT，从页面内容中提取第一行
      if (fileType === 'txt') {
        const getCurrentPageInfo = (window as any).__getCurrentPageInfo;
        if (getCurrentPageInfo) {
          const pageInfo = getCurrentPageInfo();
          if (pageInfo?.content) {
            const firstLine = pageInfo.content.split('\n')[0]?.trim();
            if (firstLine && firstLine.length > 5) {
              return firstLine.substring(0, 30).replace(/\s+/g, ' ').trim();
            }
          }
        }
      }

      // 4. 如果有页码，使用页码作为标题
      if (currentPosition.currentPage && currentPosition.currentPage > 0) {
        return t('reader.pageNumber', { page: currentPosition.currentPage });
      }

      // 5. 使用进度作为标题
      if (currentPosition.progress !== undefined) {
        return `${(currentPosition.progress * 100).toFixed(1)}%`;
      }

      // 6. 默认标题
      return t('reader.bookmark');
    } catch (e) {
      console.warn('生成书签标题失败:', e);
      return t('reader.bookmark');
    }
  }, [currentPosition, fileType, readingAreaRef, t]);

  const toggleBookmark = useCallback(() => {
    const currentProgress = currentPosition.progress || 0;
    const currentPage = currentPosition.currentPage || 0;
    const currentChapterIndex = currentPosition.chapterIndex;
    const currentLocation = currentPosition.currentLocation;

    // 获取当前位置的预览文本（如果有）
    let preview = '';
    try {
      // TXT: 尝试获取当前页面内容
      if (fileType === 'txt') {
        const getCurrentPageInfo = (window as any).__getCurrentPageInfo;
        if (getCurrentPageInfo) {
          const pageInfo = getCurrentPageInfo();
          if (pageInfo?.content) {
            preview = pageInfo.content.substring(0, 50).replace(/\n/g, ' ') || '';
          }
        }
      }
      // EPUB/PDF: 使用章节标题或页码作为预览
      if (currentPosition.chapterTitle) {
        preview = currentPosition.chapterTitle.substring(0, 50);
      } else if (currentPage > 0) {
        preview = t('reader.pageNumber', { page: currentPage });
      }
    } catch {
      // ignore
    }

    if (hasCurrentBookmark) {
      // 删除书签：使用相同的匹配逻辑
      const newBookmarks = bookmarks.filter((b) => {
        // 优先匹配 currentLocation（精确匹配）
        if (currentLocation && (b.position.currentLocation === currentLocation || b.position.cfi === currentLocation)) {
          return false;
        }
        // 匹配页码（精确匹配）
        if (currentPage > 0 && b.position.currentPage === currentPage) {
          return false;
        }
        // 对于 EPUB，如果有章节索引，同时匹配章节索引和 progress
        if (fileType === 'epub' && currentChapterIndex !== undefined && b.position.chapterIndex === currentChapterIndex) {
          const bookmarkProgress = b.position.progress || 0;
          if (Math.abs(bookmarkProgress - currentProgress) < 0.001) {
            return false;
          }
        }
        // 兜底：如果没有精确位置标识，使用 progress 匹配（误差更小：0.1%）
        if (!b.position.currentLocation && !b.position.cfi && !b.position.currentPage) {
          const bookmarkProgress = b.position.progress || 0;
          if (Math.abs(bookmarkProgress - currentProgress) < 0.001) {
            return false;
          }
        }
        return true;
      });
      saveBookmarks(newBookmarks);
      toast.success(t('reader.bookmarkDeleted'));
      return;
    }

    // 自动生成书签标题
    const bookmarkTitle = generateBookmarkTitle();

    const newBookmark: Bookmark = {
      id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      bookId,
      fileType: fileType || '',
      name: bookmarkTitle,
      position: {
        progress: currentProgress,
        currentPage: currentPage > 0 ? currentPage : undefined,
        chapterIndex: currentChapterIndex !== undefined ? currentChapterIndex : undefined,
        cfi: currentLocation && currentLocation.startsWith('epubcfi(') ? currentLocation : undefined,
        currentLocation: currentLocation || undefined,
      },
      preview: preview || undefined,
      createdAt: Date.now(),
    };

    const newBookmarks = [...bookmarks, newBookmark].sort((a, b) => {
      const progressA = a.position.progress || 0;
      const progressB = b.position.progress || 0;
      return progressA - progressB;
    });

    saveBookmarks(newBookmarks);
    toast.success(t('reader.bookmarkAdded'));
  }, [bookmarks, bookId, currentPosition, fileType, generateBookmarkTitle, hasCurrentBookmark, saveBookmarks, t]);

  const handleBookmarkButtonClick = useCallback(() => {
    toggleBookmark();
  }, [toggleBookmark]);

  const deleteBookmark = useCallback(
    (bookmarkId: string) => {
      const newBookmarks = bookmarks.filter((b) => b.id !== bookmarkId);
      saveBookmarks(newBookmarks);
      toast.success(t('reader.bookmarkDeleted'));
    },
    [bookmarks, saveBookmarks, t]
  );

  const editBookmark = useCallback((bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
  }, []);

  const saveEditedBookmark = useCallback(
    (updatedBookmark: Bookmark) => {
      const newBookmarks = bookmarks.map((b) => (b.id === updatedBookmark.id ? updatedBookmark : b));
      saveBookmarks(newBookmarks);
      toast.success(t('reader.bookmarkUpdated'));
      setEditingBookmark(null);
    },
    [bookmarks, saveBookmarks, t]
  );

  const goToBookmark = useCallback(
    async (bookmark: Bookmark) => {
      try {
        const currentPos: ReadingPosition = {
          progress: currentPosition.progress,
          currentPage: currentPosition.currentPage,
          totalPages: currentPosition.totalPages,
          chapterIndex: currentPosition.chapterIndex,
          currentLocation: currentPosition.currentLocation,
          chapterTitle: currentPosition.chapterTitle,
        };
        setPreviousPosition(currentPos);

        // 设置书签浏览模式标志（此时不保存阅读进度）
        setIsBookmarkBrowsingMode(true);
        (window as any).__isBookmarkBrowsingMode = true;
        (window as any).__previousPositionForSave = currentPos;

        const pos: any = {
          progress: bookmark.position.progress,
          currentPage: bookmark.position.currentPage,
          chapterIndex: bookmark.position.chapterIndex,
          currentLocation: bookmark.position.currentLocation || bookmark.position.cfi,
        };

        if ((window as any).__readerGoToPosition) {
          const success = await (window as any).__readerGoToPosition(pos);
          if (success) {
            setShowBookmarks(false);
            setShowBackButton(true);
            toast.success(t('reader.jumpedToBookmark'));
          } else {
            setIsBookmarkBrowsingMode(false);
            (window as any).__isBookmarkBrowsingMode = false;
            toast.error(t('reader.jumpFailedRetry'));
          }
        } else {
          setIsBookmarkBrowsingMode(false);
          (window as any).__isBookmarkBrowsingMode = false;
          toast.error(t('reader.readerNotReady'));
        }
      } catch (error) {
        console.error('跳转到书签失败:', error);
        setIsBookmarkBrowsingMode(false);
        (window as any).__isBookmarkBrowsingMode = false;
        toast.error(t('reader.jumpFailed'));
      }
    },
    [currentPosition, t]
  );

  const backToPreviousPosition = useCallback(async () => {
    if (!previousPosition) return;

    try {
      setIsBookmarkBrowsingMode(false);
      (window as any).__isBookmarkBrowsingMode = false;

      const pos: any = {
        progress: previousPosition.progress,
        currentPage: previousPosition.currentPage,
        chapterIndex: previousPosition.chapterIndex,
        currentLocation: previousPosition.currentLocation,
      };

      if ((window as any).__readerGoToPosition) {
        const success = await (window as any).__readerGoToPosition(pos);
        if (success) {
          setShowBackButton(false);
          setPreviousPosition(null);
          toast.success(t('reader.backedToPreviousPosition'));
        } else {
          toast.error(t('reader.jumpFailedRetry'));
        }
      } else {
        toast.error(t('reader.readerNotReady'));
      }
    } catch (error) {
      console.error('返回上一位置失败:', error);
      toast.error(t('reader.jumpFailed'));
    }
  }, [previousPosition, t]);

  const closeBackButton = useCallback(() => {
    setIsBookmarkBrowsingMode(false);
    (window as any).__isBookmarkBrowsingMode = false;

    if ((window as any).__saveCurrentProgress) {
      (window as any).__saveCurrentProgress();
    }

    setShowBackButton(false);
    setPreviousPosition(null);
    toast.success(t('reader.progressSaved'));
  }, [t]);

  // 退出阅读器前：如果正处于书签浏览模式，需要保存“跳转前”的位置（而不是书签位置）
  const beforeCloseReader = useCallback(async () => {
    if (!isBookmarkBrowsingMode || !previousPosition) return;

    try {
      setIsBookmarkBrowsingMode(false);
      (window as any).__isBookmarkBrowsingMode = false;

      if ((window as any).__savePreviousPosition) {
        (window as any).__savePreviousPosition(previousPosition);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      setPreviousPosition(null);
      (window as any).__previousPositionForSave = null;
    } catch {
      // ignore
    }
  }, [isBookmarkBrowsingMode, previousPosition]);

  return {
    bookmarks,
    hasCurrentBookmark,
    showBookmarks,
    setShowBookmarks,
    editingBookmark,
    setEditingBookmark,
    editBookmark,
    saveEditedBookmark,
    toggleBookmark,
    handleBookmarkButtonClick,
    deleteBookmark,
    goToBookmark,
    previousPosition,
    showBackButton,
    isBookmarkBrowsingMode,
    backToPreviousPosition,
    closeBackButton,
    beforeCloseReader,
  };
}

