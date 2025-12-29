/**
 * @author ttbye
 * 阅读器容器组件
 * 提供统一的阅读器界面，包括顶部工具栏、底部导航栏、目录等
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Settings, X, BookmarkCheck } from 'lucide-react';
import { ReaderConfig, ReadingPosition, TOCItem, Highlight } from '../../types/reader';

// 书签接口
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
    cfi?: string; // EPUB CFI
    currentLocation?: string; // 通用位置标识
  };
  preview?: string;
  createdAt: number;
}
import ReaderEPUBPro from './formats/ReaderEPUBPro';
import ReaderPDFPro from './formats/ReaderPDFPro';
import ReaderTXTPro from './formats/ReaderTXTPro';
import ReaderOfficePro from './formats/ReaderOfficePro';
import BottomNavigation from './BottomNavigation';
import TTSFloatingButton from './TTSFloatingButton';
import BottomInfoBar, { getInfoBarHeight } from './BottomInfoBar';
import TOCPanel from './TOCPanel';
import SideTOCPanel from './SideTOCPanel';
import ReadingSettingsPanel from './ReadingSettingsPanel';
import NotesPanel from './NotesPanel';
import TextSelectionToolbar from './TextSelectionToolbar';
import CreateNoteModal from './CreateNoteModal';
import BookmarkPanel from './BookmarkPanel';
import BookmarkEditModal from './BookmarkEditModal';
import ImageViewer from './ImageViewer';
import NoteViewer from './NoteViewer';
import BackToPreviousPositionButton from './BackToPreviousPositionButton';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { addOrUpdateLocalHighlight, deleteLocalHighlight, generateHighlightId, getLocalHighlights, hasLocalHighlight, refreshHighlightsFromServer, syncHighlightQueue } from '../../utils/highlights';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';

export default function ReaderContainer({ config }: { config: ReaderConfig }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [showBottomNav, setShowBottomNav] = useState(false); // 底部栏默认隐藏，只有点击设置时才显示
  const [showTOC, setShowTOC] = useState(false);
  const [showSideTOC, setShowSideTOC] = useState(false); // 默认不显示左侧目录，用户需要手动打开
  const [showSettings, setShowSettings] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [isTTSMode, setIsTTSMode] = useState(false); // TTS模式状态（是否显示TTS控制面板）
  const [ttsCurrentIndex, setTtsCurrentIndex] = useState(-1);
  const [ttsTotalParagraphs, setTtsTotalParagraphs] = useState(0);
  const [showTTSFloatingButton, setShowTTSFloatingButton] = useState(false); // TTS悬浮按钮显示状态
  const wasSettingsOpenBeforeTTSRef = useRef(false); // 记录TTS播放前设置面板是否打开
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedCfiRange, setSelectedCfiRange] = useState<string | null>(null);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  
  // 笔记接口
  interface BookNote {
    id: string;
    content: string;
    position?: string;
    page_number?: number;
    chapter_index?: number;
    selected_text?: string;
    created_at: string;
    updated_at: string;
  }
  
  const [bookNotes, setBookNotes] = useState<BookNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<BookNote | null>(null);
  const [showNoteViewer, setShowNoteViewer] = useState(false);
  
  // 记录跳转前的阅读位置（用于返回功能）
  const [previousPosition, setPreviousPosition] = useState<ReadingPosition | null>(null);
  const [showBackButton, setShowBackButton] = useState(false);
  // 标记是否处于书签浏览模式（此时不保存阅读进度）
  const [isBookmarkBrowsingMode, setIsBookmarkBrowsingMode] = useState(false);
  
  const [currentPosition, setCurrentPosition] = useState<ReadingPosition>({
    currentPage: 1,
    totalPages: 1,
    progress: 0,
  });
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [infoBarHeight, setInfoBarHeight] = useState(34); // 默认移动端高度
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomNavRef = useRef<HTMLDivElement | null>(null);
  const showBottomNavigationRef = useRef<((isSettings?: boolean) => void) | null>(null);
  const lastEpubSelectionAtRef = useRef<number>(0);
  const { isOnline, checkAndResetOfflineFlag } = useNetworkStatus();
  const [bookHighlights, setBookHighlights] = useState<Highlight[]>([]);
  const [remoteProgressPrompt, setRemoteProgressPrompt] = useState<{ serverProgress: any; clientProgress?: any } | null>(null);
  // 同一阅读会话内：提示只弹一次；用户选择后不再弹，避免重复骚扰
  const remotePromptHandledRef = useRef(false);
  const remotePromptLastProgressRef = useRef<number>(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // 监听底部导航栏显示/隐藏，触发重新分页和安全区域计算
  useEffect(() => {
    // 通知阅读器重新计算布局和安全区域
    if ((window as any).__onBottomNavStateChange) {
      (window as any).__onBottomNavStateChange();
    }
    // 延迟执行，确保 DOM 更新完成
    const timer = setTimeout(() => {
      if ((window as any).__onBottomNavStateChange) {
        (window as any).__onBottomNavStateChange();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [showBottomNav]);

  // 监听TTS播放状态，切换面板
  useEffect(() => {
    // 注册TTS播放状态回调
    (window as any).__onTTSStart = () => {
      setIsTTSPlaying(true);
      // 如果悬浮按钮显示中，隐藏它并显示底部导航栏，进入TTS模式
      if (showTTSFloatingButton) {
        setShowTTSFloatingButton(false);
        setIsTTSMode(true); // 进入TTS模式
        if (showBottomNavigationRef.current) {
          showBottomNavigationRef.current();
        }
      } else if (!showBottomNav) {
        // 显示底部导航栏（会切换为播放控制模式）
        if (showBottomNavigationRef.current) {
          showBottomNavigationRef.current();
        }
      }
      // 通知阅读器重新计算底部安全区域并重新分页
      if ((window as any).__onTTSStateChange) {
        (window as any).__onTTSStateChange();
      }
    };

    (window as any).__onTTSStop = () => {
      setIsTTSPlaying(false);
      setTtsCurrentIndex(-1);
      setTtsTotalParagraphs(0);
      // 如果正在显示TTS模式面板，关闭TTS模式
      if (isTTSMode) {
        setIsTTSMode(false);
      }
      // 隐藏悬浮按钮（用户主动停止播放后，关闭面板时不显示悬浮按钮）
      setShowTTSFloatingButton(false);
      // 底部导航栏会自动切换回正常模式（通过 isTTSMode={isTTSPlaying}）
      // 通知阅读器重新计算底部安全区域并重新分页
      if ((window as any).__onTTSStateChange) {
        (window as any).__onTTSStateChange();
      }
    };

    
    // 定期检查TTS播放状态和段落信息（作为备用）
    const checkInterval = setInterval(() => {
      if ((window as any).__getTTSIsPlaying) {
        const playing = (window as any).__getTTSIsPlaying();
        if (playing !== isTTSPlaying) {
          setIsTTSPlaying(playing);
        }
      }
      if ((window as any).__getTTSCurrentIndex !== undefined) {
        const index = (window as any).__getTTSCurrentIndex();
        if (index !== ttsCurrentIndex) {
          setTtsCurrentIndex(index);
        }
      }
      if ((window as any).__getTTSTotalParagraphs !== undefined) {
        const total = (window as any).__getTTSTotalParagraphs();
        if (total !== ttsTotalParagraphs) {
          setTtsTotalParagraphs(total);
        }
      }
    }, 500);

    return () => {
      delete (window as any).__onTTSStart;
      delete (window as any).__onTTSStop;
      clearInterval(checkInterval);
    };
  }, [showSettings, isTTSPlaying, ttsCurrentIndex, ttsTotalParagraphs, showTTSFloatingButton, showBottomNav]);

  // 加载书签
  const loadBookmarks = useCallback(() => {
    try {
      const saved = localStorage.getItem(`bookmarks-${config.book.id}`);
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
  }, [config.book.id]);

  // 保存书签到 localStorage
  const saveBookmarks = useCallback((newBookmarks: Bookmark[]) => {
    try {
      localStorage.setItem(`bookmarks-${config.book.id}`, JSON.stringify(newBookmarks));
      setBookmarks(newBookmarks);
    } catch (error) {
      console.error('保存书签失败', error);
      toast.error(t('reader.saveBookmarkFailed'));
    }
  }, [config.book.id]);

  // 检查当前位置是否有书签
  const hasCurrentBookmark = useMemo(() => {
    if (bookmarks.length === 0) return false;
    
    const currentProgress = currentPosition.progress || 0;
    const currentPage = currentPosition.currentPage || 0;
    const currentChapterIndex = currentPosition.chapterIndex;
    const currentLocation = currentPosition.currentLocation;
    
    // 优先使用 currentLocation 匹配（EPUB CFI 或其他格式的位置标识）- 精确匹配
    if (currentLocation) {
      const matched = bookmarks.some(b => {
        // 精确匹配 currentLocation
        if (b.position.currentLocation === currentLocation) return true;
        if (b.position.cfi === currentLocation) return true;
        return false;
      });
      if (matched) return true;
    }
    
    // 对于有页码的格式（PDF/TXT），使用页码匹配 - 精确匹配
    if (currentPage > 0 && (config.book.file_type === 'pdf' || config.book.file_type === 'txt')) {
      const matched = bookmarks.some(b => {
        // 精确匹配页码
        if (b.position.currentPage === currentPage) return true;
        return false;
      });
      if (matched) return true;
    }
    
    // 对于 EPUB，如果有章节索引，同时匹配章节索引和 progress
    if (config.book.file_type === 'epub' && currentChapterIndex !== undefined) {
      const matched = bookmarks.some(b => {
        // 章节索引必须匹配
        if (b.position.chapterIndex !== currentChapterIndex) return false;
        // progress 必须非常接近（允许 0.1% 的误差）
        const bookmarkProgress = b.position.progress || 0;
        return Math.abs(bookmarkProgress - currentProgress) < 0.001;
      });
      if (matched) return true;
    }
    
    // 兜底：使用 progress 匹配（仅在没有精确位置标识时使用，误差更小：0.1%）
    // 注意：这个匹配可能不够精确，但作为最后的兜底方案
    return bookmarks.some(b => {
      // 如果有 currentLocation 或页码，不应该使用 progress 匹配
      if (b.position.currentLocation || b.position.cfi || b.position.currentPage) {
        return false;
      }
      const bookmarkProgress = b.position.progress || 0;
      return Math.abs(bookmarkProgress - currentProgress) < 0.001;
    });
  }, [bookmarks, currentPosition, config.book.file_type]);

  // 自动生成书签标题（从页面内容或标题中提取）
  const generateBookmarkTitle = useCallback((): string => {
    try {
      // 1. 优先使用章节标题
      if (currentPosition.chapterTitle) {
        return currentPosition.chapterTitle.trim();
      }

      // 2. 对于 EPUB，尝试从页面内容中提取第一行文本
      if (config.book.file_type === 'epub') {
        try {
          const container = containerRef.current;
          const iframe = container?.querySelector('iframe');
          if (iframe) {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              const body = iframeDoc.body;
              if (body) {
                // 查找第一个有文本内容的元素
                const walker = iframeDoc.createTreeWalker(
                  body,
                  NodeFilter.SHOW_TEXT,
                  null
                );
                
                let node;
                while (node = walker.nextNode()) {
                  const text = node.textContent?.trim();
                  if (text && text.length > 5) {
                    // 提取前30个字符作为标题
                    const title = text.substring(0, 30).replace(/\s+/g, ' ').trim();
                    if (title.length > 0) {
                      return title;
                    }
                  }
                }

                // 如果找不到文本节点，尝试从 body 的 textContent 中提取
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
      if (config.book.file_type === 'txt') {
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
  }, [currentPosition, config.book.file_type, t]);

  // 添加或删除书签
  const toggleBookmark = useCallback(() => {
    const currentProgress = currentPosition.progress || 0;
    const currentPage = currentPosition.currentPage || 0;
    const currentChapterIndex = currentPosition.chapterIndex;
    const currentLocation = currentPosition.currentLocation;
    
    // 获取当前位置的预览文本（如果有）
    let preview = '';
    try {
      // TXT: 尝试获取当前页面内容
      if (config.book.file_type === 'txt') {
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
    } catch (e) {
      // ignore
    }
    
    if (hasCurrentBookmark) {
      // 删除书签：使用相同的匹配逻辑
      const newBookmarks = bookmarks.filter(b => {
        // 优先匹配 currentLocation（精确匹配）
        if (currentLocation && (b.position.currentLocation === currentLocation || b.position.cfi === currentLocation)) {
          return false; // 删除匹配的书签
        }
        // 匹配页码（精确匹配）
        if (currentPage > 0 && b.position.currentPage === currentPage) {
          return false; // 删除匹配的书签
        }
        // 对于 EPUB，如果有章节索引，同时匹配章节索引和 progress
        if (config.book.file_type === 'epub' && currentChapterIndex !== undefined && b.position.chapterIndex === currentChapterIndex) {
          const bookmarkProgress = b.position.progress || 0;
          if (Math.abs(bookmarkProgress - currentProgress) < 0.001) {
            return false; // 删除匹配的书签
          }
        }
        // 兜底：如果没有精确位置标识，使用 progress 匹配（误差更小：0.1%）
        if (!b.position.currentLocation && !b.position.cfi && !b.position.currentPage) {
          const bookmarkProgress = b.position.progress || 0;
          if (Math.abs(bookmarkProgress - currentProgress) < 0.001) {
            return false; // 删除匹配的书签
          }
        }
        return true; // 保留不匹配的书签
      });
      saveBookmarks(newBookmarks);
      toast.success(t('reader.bookmarkDeleted'));
    } else {
      // 自动生成书签标题
      const bookmarkTitle = generateBookmarkTitle();
      
      // 添加书签
      const newBookmark: Bookmark = {
        id: `bookmark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        bookId: config.book.id,
        fileType: config.book.file_type || '',
        name: bookmarkTitle, // 自动生成的标题
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
    }
  }, [bookmarks, currentPosition, config.book, hasCurrentBookmark, saveBookmarks, generateBookmarkTitle, t]);

  // 初始化时加载书签
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // 跳转到书签位置
  const goToBookmark = useCallback(async (bookmark: Bookmark) => {
    try {
      // 保存当前阅读位置（用于返回功能）
      const currentPos: ReadingPosition = {
        progress: currentPosition.progress,
        currentPage: currentPosition.currentPage,
        chapterIndex: currentPosition.chapterIndex,
        currentLocation: currentPosition.currentLocation,
        chapterTitle: currentPosition.chapterTitle,
      };
      setPreviousPosition(currentPos);
      
      // 设置书签浏览模式标志（此时不保存阅读进度）
      setIsBookmarkBrowsingMode(true);
      // 设置全局标志，供阅读器组件使用
      (window as any).__isBookmarkBrowsingMode = true;
      // 保存之前的阅读位置到全局变量，供关闭时使用
      (window as any).__previousPositionForSave = currentPos;
      
      const pos: any = {
        progress: bookmark.position.progress,
        currentPage: bookmark.position.currentPage,
        chapterIndex: bookmark.position.chapterIndex,
        currentLocation: bookmark.position.currentLocation || bookmark.position.cfi,
      };

      // 使用全局跳转函数
      if ((window as any).__readerGoToPosition) {
        const success = await (window as any).__readerGoToPosition(pos);
        if (success) {
          setShowBookmarks(false);
          setShowBackButton(true); // 显示返回按钮
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
  }, [currentPosition, t]);

  // 返回到上一阅读位置
  const backToPreviousPosition = useCallback(async () => {
    if (!previousPosition) return;
    
    try {
      // 清除书签浏览模式标志，恢复正常的进度保存
      setIsBookmarkBrowsingMode(false);
      (window as any).__isBookmarkBrowsingMode = false;
      
      const pos: any = {
        progress: previousPosition.progress,
        currentPage: previousPosition.currentPage,
        chapterIndex: previousPosition.chapterIndex,
        currentLocation: previousPosition.currentLocation,
      };

      // 使用全局跳转函数
      if ((window as any).__readerGoToPosition) {
        const success = await (window as any).__readerGoToPosition(pos);
        if (success) {
          setShowBackButton(false); // 隐藏返回按钮
          setPreviousPosition(null); // 清除记录的位置
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

  // 关闭返回按钮（关闭时保存当前进度）
  const closeBackButton = useCallback(() => {
    // 清除书签浏览模式标志，恢复正常的进度保存
    setIsBookmarkBrowsingMode(false);
    (window as any).__isBookmarkBrowsingMode = false;
    
    // 触发保存当前进度
    // 通过调用阅读器的进度保存函数来保存当前进度
    if ((window as any).__saveCurrentProgress) {
      (window as any).__saveCurrentProgress();
    }
    
    setShowBackButton(false);
    setPreviousPosition(null);
    toast.success(t('reader.progressSaved'));
  }, [t]);

  // 删除书签
  const deleteBookmark = useCallback((bookmarkId: string) => {
    const newBookmarks = bookmarks.filter(b => b.id !== bookmarkId);
    saveBookmarks(newBookmarks);
    toast.success(t('reader.bookmarkDeleted'));
  }, [bookmarks, saveBookmarks, t]);

  // 编辑书签
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const editBookmark = useCallback((bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
  }, []);

  // 保存编辑后的书签
  const saveEditedBookmark = useCallback((updatedBookmark: Bookmark) => {
    const newBookmarks = bookmarks.map(b => 
      b.id === updatedBookmark.id ? updatedBookmark : b
    );
    saveBookmarks(newBookmarks);
    toast.success(t('reader.bookmarkUpdated'));
    setEditingBookmark(null);
  }, [bookmarks, saveBookmarks, t]);

  // 书签按钮点击处理：单击添加/删除
  const handleBookmarkButtonClick = useCallback(() => {
    toggleBookmark();
  }, [toggleBookmark]);
  
  // 检测是否为移动设备
  const [isMobile, setIsMobile] = useState(false);

  // 检测设备类型
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
      const isAndroidDevice = /android/.test(userAgent);
      const isMobileDevice = isIOSDevice || isAndroidDevice || window.innerWidth <= 768;
      
      setIsMobile(isMobileDevice);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // 监听窗口大小变化，动态计算底部信息栏高度
  useEffect(() => {
    const updateInfoBarHeight = () => {
      const height = getInfoBarHeight(window.innerWidth);
      setInfoBarHeight(height);
    };
    
    updateInfoBarHeight();
    window.addEventListener('resize', updateInfoBarHeight);
    return () => window.removeEventListener('resize', updateInfoBarHeight);
  }, []);

  // 刷新/重新打开时：先用 initialPosition 预填，避免底部信息栏短暂显示 1/1
  // 之后由各格式阅读器 onProgressChange( relocated/scroll ) 覆盖为实时值
  useEffect(() => {
    if (!config.initialPosition) return;

    setCurrentPosition((prev) => {
      // 如果已经有有效进度了，就不强行覆盖
      const prevLooksValid =
        (typeof prev.progress === 'number' && prev.progress > 0) ||
        (typeof prev.currentPage === 'number' && prev.currentPage > 1) ||
        (typeof prev.totalPages === 'number' && prev.totalPages > 1);
      if (prevLooksValid) return prev;
      return { ...prev, ...config.initialPosition };
    });
  }, [config.book.id, config.initialPosition]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // 显示底部设置导航栏
  const showBottomNavigation = useCallback((isSettings = false) => {
    setShowBottomNav(true);
    
    // 清除之前的隐藏定时器
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    
    // 不再自动隐藏，改为点击外部区域隐藏
  }, []);
  
  // 保存 showBottomNavigation 的引用到 ref
  useEffect(() => {
    showBottomNavigationRef.current = showBottomNavigation;
  }, [showBottomNavigation]);

  // 隐藏底部导航栏
  const hideBottomNavigation = useCallback(() => {
    // 如果正在播放 TTS，不允许隐藏面板
    if (isTTSPlaying) {
      return;
    }
    setShowBottomNav(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
  }, [isTTSPlaying]);

  // 检查并隐藏所有 UI 元素（功能条、导航栏等）
  // 返回 true 表示隐藏了 UI，false 表示没有 UI 需要隐藏
  const checkAndHideUI = useCallback(() => {
    let hasHiddenUI = false;
    
    // 1. 如果文本选择工具栏显示，先隐藏它
    if (showSelectionToolbar) {
      setShowSelectionToolbar(false);
      setSelectionPosition(null);
      setSelectedCfiRange(null);
      // 清空选区
      try {
        window.getSelection()?.removeAllRanges();
      } catch (e) {
        // ignore
      }
      hasHiddenUI = true;
    }
    
    // 2. 如果底部导航栏显示，先隐藏它
    if (showBottomNav && !isTTSPlaying) {
      hideBottomNavigation();
      setShowSettings(false);
      hasHiddenUI = true;
    }
    
    // 3. 如果笔记面板显示，先隐藏它
    if (showNotes) {
      setShowNotes(false);
      setSelectedText('');
      hasHiddenUI = true;
    }
    
    // 4. 如果书签面板显示，先隐藏它
    if (showBookmarks) {
      setShowBookmarks(false);
      hasHiddenUI = true;
    }
    
    // 5. 如果 TOC 面板显示，先隐藏它
    if (showTOC) {
      setShowTOC(false);
      hasHiddenUI = true;
    }
    
    // 6. 如果侧边 TOC 显示，先隐藏它
    if (showSideTOC) {
      setShowSideTOC(false);
      hasHiddenUI = true;
    }
    
    return hasHiddenUI;
  }, [showSelectionToolbar, showBottomNav, showNotes, showBookmarks, showTOC, showSideTOC, isTTSPlaying, hideBottomNavigation]);

  // 暴露检查并隐藏 UI 的函数给阅读器组件
  useEffect(() => {
    (window as any).__readerCheckAndHideUI = checkAndHideUI;
    return () => {
      delete (window as any).__readerCheckAndHideUI;
    };
  }, [checkAndHideUI]);

  // 切换导航栏显示/隐藏
  const toggleNavigationBar = useCallback(() => {
    if (showBottomNav) {
      hideBottomNavigation();
      setShowSettings(false);
    } else {
      showBottomNavigation();
      setShowSettings(false);
    }
  }, [showBottomNav, showBottomNavigation, hideBottomNavigation]);

  // 处理点击事件：点击非导航面板区域时隐藏导航栏
  const handleCenterClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 如果导航栏未显示，不处理
    if (!showBottomNav) return;
    
    // 如果正在播放 TTS，不隐藏导航栏
    if (isTTSPlaying) return;
    
    // 检查点击的目标元素
    const target = e.target as HTMLElement;
    
    // 如果点击的是导航栏本身或其子元素，不隐藏
    if (bottomNavRef.current && bottomNavRef.current.contains(target)) {
      return;
    }
    
    // 如果点击的是设置面板或其子元素，不隐藏
    const settingsPanel = document.querySelector('[data-settings-panel]');
    if (settingsPanel && settingsPanel.contains(target)) {
      return;
    }
    
    // 如果点击的是其他面板（TOC、笔记等），不隐藏
    const tocPanel = document.querySelector('[data-toc-panel]');
    const notesPanel = document.querySelector('[data-notes-panel]');
    const bookmarksPanel = document.querySelector('[data-bookmarks-panel]');
    
    if (
      (tocPanel && tocPanel.contains(target)) ||
      (notesPanel && notesPanel.contains(target)) ||
      (bookmarksPanel && bookmarksPanel.contains(target))
    ) {
      return;
    }
    
    // 点击的是阅读区域，隐藏导航栏
    hideBottomNavigation();
    setShowSettings(false);
  }, [showBottomNav, isTTSPlaying, hideBottomNavigation]);


  // 处理进度变化
  const handleProgressChange = useCallback((progress: number, position: ReadingPosition) => {
    setCurrentPosition(position);
    config.onProgressChange(progress, position);
  }, [config]);

  // 跨设备进度冲突提示（由 ReaderNew 在保存进度时触发 409 后广播）
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (!detail?.serverProgress) return;
        if (detail.bookId && detail.bookId !== config.book.id) return;
        if (remotePromptHandledRef.current) return;
        if (remoteProgressPrompt) return; // 正在显示时不重复 set
        const p = typeof detail.serverProgress.progress === 'number' ? detail.serverProgress.progress : 0;
        // 同进度/更小进度不重复提示
        if (p <= remotePromptLastProgressRef.current + 0.0001) return;
        remotePromptLastProgressRef.current = p;
        setRemoteProgressPrompt({ serverProgress: detail.serverProgress, clientProgress: detail.clientProgress });
      } catch {
        // ignore
      }
    };
    window.addEventListener('__reading_progress_conflict' as any, handler);
    return () => window.removeEventListener('__reading_progress_conflict' as any, handler);
  }, [config.book.id, remoteProgressPrompt]);

  // 打开书时发现服务端进度更靠后：也需要提示一次（不依赖 409 冲突）
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (!detail?.serverProgress) return;
        if (detail.bookId && detail.bookId !== config.book.id) return;
        if (remotePromptHandledRef.current) return;
        if (remoteProgressPrompt) return;
        const p = typeof detail.serverProgress.progress === 'number' ? detail.serverProgress.progress : 0;
        if (p <= remotePromptLastProgressRef.current + 0.0001) return;
        remotePromptLastProgressRef.current = p;
        setRemoteProgressPrompt({ serverProgress: detail.serverProgress, clientProgress: detail.clientProgress });
      } catch {
        // ignore
      }
    };
    window.addEventListener('__reading_progress_remote_detected' as any, handler);
    return () => window.removeEventListener('__reading_progress_remote_detected' as any, handler);
  }, [config.book.id, remoteProgressPrompt]);

  // 兜底：如果 ReaderNew 在 ReaderContainer 挂载前就触发了提示事件，事件可能会丢
  // 这里从 sessionStorage 读取一次“待提示的远端进度”，确保重新打开 A 端也能看到提示并跳转到 B 端最新进度
  useEffect(() => {
    try {
      if (!config.book.id) return;
      if (remotePromptHandledRef.current) return;
      if (remoteProgressPrompt) return;

      const key = `rk-remote-progress-${config.book.id}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key); // 读一次就清掉，避免重复弹

      const payload = JSON.parse(raw);
      const sp = payload?.serverProgress;
      if (!sp || typeof sp.progress !== 'number') return;

      // 只有当服务器明显更靠后才提示（避免重复/旧数据）
      const serverP = sp.progress;
      const localP = typeof currentPosition.progress === 'number' ? currentPosition.progress : 0;
      if (serverP <= localP + 0.01) return;
      if (serverP <= remotePromptLastProgressRef.current + 0.0001) return;

      remotePromptLastProgressRef.current = serverP;
      setRemoteProgressPrompt({ serverProgress: sp, clientProgress: payload?.clientProgress });
    } catch {
      // ignore
    }
  }, [config.book.id, currentPosition.progress, remoteProgressPrompt]);

  // 切书时重置（新书可再次提示）
  useEffect(() => {
    remotePromptHandledRef.current = false;
    remotePromptLastProgressRef.current = 0;
    setRemoteProgressPrompt(null);
  }, [config.book.id]);

  // 处理添加笔记
  const handleAddNote = useCallback((text: string) => {
    console.log('[ReaderContainer] handleAddNote', { textLen: text?.length, hasCfi: !!selectedCfiRange });
    setSelectedText(text);
    setShowCreateNoteModal(true);
    setShowSelectionToolbar(false);
    // 清除文本选择
    window.getSelection()?.removeAllRanges();
  }, [selectedCfiRange]);

  const safeOpen = (url: string) => {
    try {
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) {
        toast.error(t('reader.popupBlocked'));
      }
    } catch (e) {
      toast.error(t('reader.openFailed'));
    }
  };

  const handleCopy = useCallback(async () => {
    const text = (selectedText || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('reader.copied'));
    } catch (e) {
      // 兜底：老浏览器
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success(t('reader.copied'));
      } catch {
        toast.error(t('reader.copyFailed'));
      }
    }
  }, [selectedText, t]);

  const handleSearch = useCallback(() => {
    const q = (selectedText || '').trim();
    if (!q) return;
    safeOpen(`https://www.baidu.com/s?wd=${encodeURIComponent(q)}`);
  }, [selectedText]);

  const handleDictionary = useCallback(() => {
    const q = (selectedText || '').trim();
    if (!q) return;
    // 用有道词典网页版
    safeOpen(`https://www.youdao.com/result?word=${encodeURIComponent(q)}&lang=en`);
  }, [selectedText]);

  const handleTranslate = useCallback(() => {
    const q = (selectedText || '').trim();
    if (!q) return;
    // Google Translate（自动识别->中文）
    safeOpen(`https://translate.google.com/?sl=auto&tl=zh-CN&text=${encodeURIComponent(q)}&op=translate`);
  }, [selectedText]);

  // 处理 EPUB 高亮（支持再次点击取消）
  const handleToggleHighlight = useCallback(async (color?: string) => {
    console.log('[ReaderContainer] handleToggleHighlight', { hasCfi: !!selectedCfiRange, selectedTextLen: selectedText?.length, color });
    if (config.book.file_type !== 'epub') {
      toast.error(t('reader.onlyEpubHighlight'));
      return;
    }
    if (!selectedCfiRange) {
      toast.error(t('reader.noCfiDetected'));
      return;
    }
    if (!isAuthenticated) {
      toast.error(t('reader.loginRequiredForHighlight'));
      return;
    }

    const existing = hasLocalHighlight(config.book.id, selectedCfiRange);
    
    // 如果没有传入颜色，且已经存在高亮，则视为“取消高亮”
    // 如果传入了颜色，且已经存在高亮，则视为“更新高亮颜色”
    if (existing && !color) {
      // 取消高亮
      deleteLocalHighlight(config.book.id, existing.id);
      setBookHighlights((prev) => prev.filter((x) => x.id !== existing.id));
      if ((window as any).__epubUnhighlight) {
        try {
          (window as any).__epubUnhighlight(existing.cfiRange);
        } catch { /* ignore */ }
      }
      try {
        await syncHighlightQueue();
        toast.success(t('reader.highlightRemoved'));
      } catch {
        toast.success(t('reader.highlightRemovedOffline'));
      }
    } else {
      // 新增或更新高亮
      const targetColor = color || 'rgba(255, 235, 59, 0.55)';
      
      // 如果已存在且颜色相同，则不做操作或视为取消（这里逻辑视交互而定，通常点击相同颜色是取消，点击不同颜色是更换）
      if (existing && existing.color === targetColor) {
        deleteLocalHighlight(config.book.id, existing.id);
        setBookHighlights((prev) => prev.filter((x) => x.id !== existing.id));
        if ((window as any).__epubUnhighlight) {
          try {
            (window as any).__epubUnhighlight(existing.cfiRange);
          } catch { /* ignore */ }
        }
        try {
          await syncHighlightQueue();
          toast.success(t('reader.highlightRemoved'));
        } catch {
          toast.success(t('reader.highlightRemovedOffline'));
        }
        setShowSelectionToolbar(false);
        return;
      }

      const id = existing ? existing.id : generateHighlightId();
      const item = addOrUpdateLocalHighlight({
        id,
        bookId: config.book.id,
        cfiRange: selectedCfiRange,
        selectedText: selectedText || undefined,
        color: targetColor,
      });

      setBookHighlights((prev) => {
        const filtered = prev.filter((x) => x.id !== id);
        return [item, ...filtered];
      });

      if ((window as any).__epubHighlight) {
        try {
          (window as any).__epubHighlight(item.cfiRange, item.color);
        } catch { /* ignore */ }
      }

      try {
        await syncHighlightQueue();
        toast.success(existing ? t('reader.highlightUpdated') : t('reader.highlightAdded'));
      } catch {
        toast.success(existing ? t('reader.highlightUpdatedOffline') : t('reader.highlightAddedOffline'));
      }
    }

    setShowSelectionToolbar(false);
    window.getSelection()?.removeAllRanges();
  }, [config.book.file_type, config.book.id, isAuthenticated, selectedCfiRange, selectedText]);

  // 打开 EPUB 时：先用本地缓存快速渲染高亮；在线再从服务端刷新并渲染
  useEffect(() => {
    if (config.book.file_type !== 'epub' || !config.book.id) return;

    const applyHighlightsToReader = (list: Highlight[]) => {
      if (!(window as any).__epubHighlight) return;
      list.forEach((h) => {
        if (h?.cfiRange) {
          try {
            (window as any).__epubHighlight(h.cfiRange, h.color);
          } catch {
            // ignore
          }
        }
      });
    };

    // 本地缓存：先渲染
    const local = getLocalHighlights(config.book.id);
    setBookHighlights(local);
    // 可能阅读器尚未 ready，做一次轻量重试
    const t = setTimeout(() => applyHighlightsToReader(local), 300);

    // 在线：刷新并渲染
    if (isAuthenticated && navigator.onLine) {
      refreshHighlightsFromServer(config.book.id)
        .then((merged) => {
          setBookHighlights(merged);
          setTimeout(() => applyHighlightsToReader(merged), 300);
        })
        .catch(() => {});
    }

    return () => clearTimeout(t);
  }, [config.book.file_type, config.book.id, isAuthenticated]);

  // 网络恢复时：自动同步离线队列，并刷新服务端高亮
  useEffect(() => {
    if (!isAuthenticated) return;
    if (checkAndResetOfflineFlag()) {
      syncHighlightQueue()
        .then(async () => {
          if (config.book.file_type === 'epub' && config.book.id) {
            try {
              await refreshHighlightsFromServer(config.book.id);
            } catch {
              // ignore
            }
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, isAuthenticated]);

  // 处理翻页
  const handlePageTurn = useCallback((direction: 'prev' | 'next') => {
    // 翻页时自动隐藏工具条
    setShowSelectionToolbar(false);
    setSelectionPosition(null);
    setSelectedCfiRange(null);
    // 清空选区
    try {
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      // ignore
    }
    
    // 通过全局函数调用阅读器的翻页功能
    if ((window as any).__readerPageTurn) {
      (window as any).__readerPageTurn(direction);
    }
    // 翻页时不显示底部导航栏
  }, []);

  // 键盘左右键翻页（全局监听，确保在 iframe 或其他子元素不聚焦时也能工作）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果阅读器内部已处理（格式阅读器会标记），则跳过，避免重复翻页
      if ((e as any).__readerHandled) {
        return;
      }
      // 如果焦点在输入框/文本域，跳过
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePageTurn('prev');
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        handlePageTurn('next');
      } else if (e.key === ' ') {
        // 空格键：向下翻页
        e.preventDefault();
        handlePageTurn('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePageTurn]);

  // 根据文件类型渲染不同的阅读器
  const renderReader = () => {
    switch (config.book.file_type) {
      case 'epub':
        // 使用全新的专业版阅读器（ReaderEPUBPro）
        return (
          <ReaderEPUBPro
            book={config.book}
            settings={config.settings}
            initialPosition={config.initialPosition}
            onSettingsChange={config.onSettingsChange}
            onProgressChange={handleProgressChange}
            onTOCChange={setToc}
            onClose={config.onClose}
            highlights={bookHighlights}
            notes={bookNotes}
            onNoteClick={(note) => {
              setSelectedNote(note);
              setShowNoteViewer(true);
            }}
          />
        );
      case 'pdf':
        // 使用全新的专业版PDF阅读器（ReaderPDFPro）
        return (
          <ReaderPDFPro
            book={config.book}
            settings={config.settings}
            initialPosition={config.initialPosition}
            onSettingsChange={config.onSettingsChange}
            onProgressChange={handleProgressChange}
            onTOCChange={setToc}
            onClose={config.onClose}
          />
        );
      case 'txt':
        return (
          <ReaderTXTPro
            book={config.book}
            settings={config.settings}
            initialPosition={config.initialPosition}
            onSettingsChange={config.onSettingsChange}
            onProgressChange={handleProgressChange}
            onTOCChange={setToc}
            onClose={config.onClose}
          />
        );
      case 'docx':
      case 'doc':
      case 'xlsx':
      case 'xls':
      case 'pptx':
      case 'md':
        return (
          <ReaderOfficePro
            book={config.book}
            settings={config.settings}
            initialPosition={config.initialPosition}
            onSettingsChange={config.onSettingsChange}
            onProgressChange={handleProgressChange}
            onTOCChange={setToc}
            onClose={config.onClose}
          />
        );
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg mb-2">{t('reader.unsupportedFormat')}</p>
              <p className="text-sm text-gray-500">{config.book.file_type}</p>
            </div>
          </div>
        );
    }
  };

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  }[config.settings.theme];

  // 设置HTML和body的背景色为阅读器主题色（包括顶部安全区域）
  useEffect(() => {
    const originalHtmlBg = document.documentElement.style.backgroundColor;
    const originalBodyBg = document.body.style.backgroundColor;
    
    // 设置HTML和body的背景色，这样顶部安全区域也会使用相同的颜色
    document.documentElement.style.backgroundColor = themeStyles.bg;
    document.body.style.backgroundColor = themeStyles.bg;
    
    // 组件卸载时恢复原来的背景色
    return () => {
      document.documentElement.style.backgroundColor = originalHtmlBg;
      document.body.style.backgroundColor = originalBodyBg;
    };
  }, [themeStyles.bg]);

  // 注册全局切换导航栏函数（供阅读器组件调用）
  useEffect(() => {
    (window as any).__toggleReaderNavigation = toggleNavigationBar;
    
    return () => {
      delete (window as any).__toggleReaderNavigation;
    };
  }, [toggleNavigationBar]);

  // 获取书籍笔记
  useEffect(() => {
    const fetchBookNotes = async () => {
      try {
        const api = (await import('../../utils/api')).default;
        const response = await api.get(`/notes/book/${config.book.id}`);
        const notes = response.data.notes || [];
        setBookNotes(notes);
        // 通知阅读器更新笔记标记
        if ((window as any).__updateBookNotes) {
          (window as any).__updateBookNotes(notes);
        }
      } catch (error) {
        console.error('获取书籍笔记失败:', error);
      }
    };
    if (config.book.id && isAuthenticated) {
      fetchBookNotes();
    }
  }, [config.book.id, isAuthenticated]);

  // 处理文本选择
  useEffect(() => {
    const clearAllSelections = () => {
      try {
        window.getSelection()?.removeAllRanges();
      } catch (e) {
        // ignore
      }
      // 清理 EPUB iframe 内选区（如果有）
      try {
        document.querySelectorAll('iframe').forEach((iframe) => {
          try {
            const doc = (iframe as HTMLIFrameElement).contentDocument;
            doc?.getSelection?.()?.removeAllRanges();
          } catch (e) {
            // ignore
          }
        });
      } catch (e) {
        // ignore
      }
    };

    const handleMouseUp = (_e: MouseEvent) => {
      // 如果刚刚由 EPUB iframe 上报过选区，则忽略一小段时间内的外层 mouseup，
      // 避免外层 window.getSelection() 为空把工具栏立刻关掉，导致"点不到按钮/弹窗不出"。
      const timeSinceEpubSelection = Date.now() - lastEpubSelectionAtRef.current;
      if (timeSinceEpubSelection < 200) {
        return;
      }
      
      // 延迟一小段时间再检查，给 selectionchange 事件时间触发
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          // 再次检查 EPUB 选区上报时间
          if (Date.now() - lastEpubSelectionAtRef.current < 200) {
            return;
          }
          setShowSelectionToolbar(false);
          setSelectionPosition(null);
          setSelectedCfiRange(null);
          return;
        }

        const selectedText = selection.toString().trim();
        if (!selectedText || selectedText.length < 2) {
          setShowSelectionToolbar(false);
          setSelectionPosition(null);
          setSelectedCfiRange(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 验证选区矩形是否有效
        if (!rect || (rect.width < 2 && rect.height < 8)) {
          setShowSelectionToolbar(false);
          return;
        }
        
        setSelectedText(selectedText);
        setSelectionPosition({
          x: rect.left + rect.width / 2,
          // 作为"锚点"：交给工具栏自己决定显示在上方还是下方
          y: rect.top,
        });
        setShowSelectionToolbar(true);
      }, 50);
    };

    // 任意点击空白处都隐藏菜单（不依赖 selection 是否 collapsed）
    // 使用延迟处理，避免与工具栏按钮点击冲突
    let pointerDownTimer: NodeJS.Timeout | null = null;
    const handlePointerDown = (_e: PointerEvent) => {
      const target = _e.target as HTMLElement | null;
      // 点击菜单内部不处理
      if (target && target.closest('.text-selection-toolbar')) return;
      // 点击模态框内部也不处理（避免点输入框把菜单/选区清掉）
      if (target && target.closest('.note-content-textarea')) return;
      // 点击颜色选择器内部也不处理
      if (target && target.closest('[class*="bg-\\[#"]')) return;
      
      // 延迟处理，给工具栏按钮点击事件时间执行
      if (pointerDownTimer) clearTimeout(pointerDownTimer);
      pointerDownTimer = setTimeout(() => {
        // 再次检查，避免在延迟期间用户点击了工具栏
        const currentTarget = document.elementFromPoint(_e.clientX, _e.clientY);
        if (currentTarget && (
          currentTarget.closest('.text-selection-toolbar') ||
          currentTarget.closest('.note-content-textarea') ||
          currentTarget.closest('[class*="bg-\\[#"]')
        )) {
          return;
        }
        setShowSelectionToolbar(false);
        setSelectionPosition(null);
        setSelectedCfiRange(null);
        clearAllSelections();
      }, 100);
    };

    // 选区变成 collapsed 时自动隐藏菜单
    // 使用较短的延迟，快速响应用户取消选择的操作
    let selectionChangeTimer: NodeJS.Timeout | null = null;
    const handleSelectionChange = () => {
      // 如果刚刚由 EPUB iframe 上报过选区，则忽略一小段时间内的 selectionchange
      const timeSinceEpubSelection = Date.now() - lastEpubSelectionAtRef.current;
      if (timeSinceEpubSelection < 200) {
        return;
      }
      
      // 立即检查选区状态，如果为空则快速隐藏（减少延迟）
      try {
        const s = window.getSelection();
        if (!s || s.isCollapsed) {
          // 再次检查 EPUB 选区上报时间
          if (Date.now() - lastEpubSelectionAtRef.current < 200) {
            return;
          }
          // 立即隐藏工具条，不延迟
          setShowSelectionToolbar(false);
          setSelectionPosition(null);
          setSelectedCfiRange(null);
          return;
        }
      } catch (e) {
        // ignore
      }
      
      // 如果选区存在，清除之前的定时器（避免在用户重新选择时隐藏）
      if (selectionChangeTimer) {
        clearTimeout(selectionChangeTimer);
        selectionChangeTimer = null;
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('selectionchange', handleSelectionChange);

    // EPUB iframe 内选区：由 ReaderEPUBPro 通过自定义事件上报
    const handleEpubSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string;
        x: number;
        y: number;
        cfiRange?: string | null;
      };
      const t = (detail?.text || '').toString().trim();
      // 兜底：过滤极短/误触选区（移动端滑动时偶发）
      if (!t || t.length < 2) {
        setShowSelectionToolbar(false);
        return;
      }
      lastEpubSelectionAtRef.current = Date.now();
      setSelectedText(t);
      setSelectionPosition({ x: detail.x, y: detail.y });
      setSelectedCfiRange(detail.cfiRange || null);
      setShowSelectionToolbar(true);
    };

    window.addEventListener('__reader_text_selection' as any, handleEpubSelection);
    
    // 监听翻页事件，翻页时自动隐藏工具条
    const handlePageTurnEvent = () => {
      setShowSelectionToolbar(false);
      setSelectionPosition(null);
      setSelectedCfiRange(null);
      // 清空选区
      try {
        window.getSelection()?.removeAllRanges();
      } catch (e) {
        // ignore
      }
    };
    
    window.addEventListener('__reader_page_turn' as any, handlePageTurnEvent);
    
    // 监听图片查看事件
    const handleImageView = (e: Event) => {
      const detail = (e as CustomEvent).detail as { imageUrl: string };
      if (detail?.imageUrl) {
        setImageViewerUrl(detail.imageUrl);
      }
    };
    
    window.addEventListener('__reader_view_image' as any, handleImageView);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('__reader_text_selection' as any, handleEpubSelection);
      window.removeEventListener('__reader_page_turn' as any, handlePageTurnEvent);
      window.removeEventListener('__reader_view_image' as any, handleImageView);
      if (pointerDownTimer) clearTimeout(pointerDownTimer);
      if (selectionChangeTimer) clearTimeout(selectionChangeTimer);
    };
  }, []);

  // 统一的安全区域方案
  // 使用最小值确保一致性，但不超过实际安全区域
  // 这样可以确保：
  // 1. 所有设备都有足够的顶部空间（至少20px）
  // 2. 有安全区域的设备使用实际值（但不超过44px，避免过大）
  // 3. 桌面设备使用0px
  
  const getSafeAreaTop = () => {
    if (!isMobile) {
      return '0px'; // 桌面设备不需要安全区域
    }
    // 移动设备：使用最小值20px，但不超过实际安全区域，最大44px（iPhone X标准值）
    // 这样可以确保在所有设备上都有足够的空间，但不会过大
    return 'clamp(20px, env(safe-area-inset-top, 20px), 44px)';
  };

  // 计算工具栏顶部位置（固定位置，不随安全区域变化）
  const getToolbarTop = () => {
    if (!isMobile) {
      return '0px'; // 桌面设备从顶部开始
    }
    // 移动设备：安全区域下方，紧贴安全区域
    return getSafeAreaTop();
  };

  // 计算阅读区域顶部间距（工具栏高度固定为48px）
  // 注意：主容器已经处理了安全区域（paddingTop），顶部工具栏定位在安全区域下方
  // 所以阅读区域只需要工具栏高度，不需要再加安全区域
  const getReadingAreaPaddingTop = () => {
    const toolbarHeight = 48; // 固定工具栏高度
    // 只需要工具栏高度，因为主容器的paddingTop已经处理了安全区域
    return `${toolbarHeight}px`;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col overflow-hidden"
      onClick={handleCenterClick}
      onContextMenu={(e) => {
        // 全阅读器统一屏蔽默认右键菜单（PC/移动/PWA 一致）
        e.preventDefault();
      }}
      style={{
        backgroundColor: themeStyles.bg,
        color: themeStyles.text,
        width: '100%',
        height: '100vh',
        minHeight: '100vh',
        // 根据设备类型动态计算安全区域
        paddingTop: getSafeAreaTop(),
      }}
    >
      {/* 顶部工具栏 - 始终显示，固定高度48px
          说明：用 fixed 避免移动端/PWA 弹性拖拽时出现“工具栏跟着晃动”
      */}
      <div
        className="fixed left-0 right-0 z-30"
        style={{
          top: getToolbarTop(),
          height: '48px', // 固定高度
          minHeight: '48px',
          backgroundColor: themeStyles.bg,
          borderBottom: `1px solid ${config.settings.theme === 'dark' ? '#404040' : '#e0e0e0'}`,
        }}
      >
        <div className="flex items-center justify-between px-4 h-full" style={{ minHeight: '48px' }}>
          <button
            onClick={async () => {
              // 如果处于书签浏览模式，先保存之前的阅读位置
              if (isBookmarkBrowsingMode && previousPosition) {
                // 先清除书签浏览模式标志（避免 flushNow 保存书签位置）
                setIsBookmarkBrowsingMode(false);
                (window as any).__isBookmarkBrowsingMode = false;
                
                // 触发保存之前的阅读位置
                if ((window as any).__savePreviousPosition) {
                  (window as any).__savePreviousPosition(previousPosition);
                }
                
                // 等待一小段时间确保保存完成
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 清除状态
                setPreviousPosition(null);
                (window as any).__previousPositionForSave = null;
              }
              config.onClose();
            }}
            className="p-2 hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 rounded-lg transition-colors flex-shrink-0"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 text-center px-4 min-w-0">
            <h1 className="text-sm font-medium truncate max-w-xs mx-auto">
              {config.book.title || config.book.file_name}
            </h1>
            {(() => {
              // 优先使用阅读器传递的章节标题
              if (currentPosition.chapterTitle) {
                return (
                  <p className="text-xs opacity-70 mt-1 truncate max-w-xs mx-auto">
                    {currentPosition.chapterTitle}
                  </p>
                );
              }

              const findTOCItemByChapterIndex = (items: TOCItem[], targetIndex: number): TOCItem | null => {
                for (const item of items) {
                  // 检查当前项
                  if (item.chapterIndex === targetIndex) {
                    return item;
                  }
                  // 递归检查子项
                  if (item.children && item.children.length > 0) {
                    const found = findTOCItemByChapterIndex(item.children, targetIndex);
                    if (found) {
                      return found;
                    }
                  }
                }
                return null;
              };

              let chapterTitle = '';
              
              if (currentPosition.chapterIndex !== undefined && currentPosition.chapterIndex >= 0) {
                const tocItem = findTOCItemByChapterIndex(toc, currentPosition.chapterIndex);
                if (tocItem) {
                  chapterTitle = tocItem.title;
                } else {
                  // 方法2: 直接通过数组索引查找（向后兼容，但不推荐）
                  // 注意：这假设TOC数组索引与章节索引一一对应，可能不准确
                  const directTocItem = toc[currentPosition.chapterIndex];
                  if (directTocItem) {
                    chapterTitle = directTocItem.title;
                  }
                }
              }
              
              
              return chapterTitle ? (
                <p className="text-xs opacity-70 mt-1 truncate max-w-xs mx-auto">
                  {chapterTitle}
                </p>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 书签列表按钮 - 有书签时显示 */}
            {bookmarks.length > 0 && (
              <button
                onClick={() => {
                  setShowBookmarks(true);
                  showBottomNavigation();
                }}
                className="p-2 hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 rounded-lg transition-colors flex-shrink-0 relative"
                aria-label={t('reader.bookmarks')}
                title={t('reader.bookmarks')}
              >
                <BookmarkCheck className="w-5 h-5" style={{ color: hasCurrentBookmark ? '#ff9800' : undefined }} />
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center" style={{ fontSize: '10px', lineHeight: '1' }}>
                  {bookmarks.length > 99 ? '99+' : bookmarks.length}
                </span>
              </button>
            )}
            <button
              onClick={() => {
                // 点击设置按钮时只显示/隐藏底部导航栏，不显示设置模态框
                if (showBottomNav) {
                  hideBottomNavigation();
                  setShowSettings(false); // 确保设置模态框关闭
                } else {
                  showBottomNavigation();
                  setShowSettings(false); // 确保设置模态框关闭
                }
              }}
              className="p-2 hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 rounded-lg transition-colors"
              aria-label={t('common.settings')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 阅读区域 - 响应式布局，留出顶部导航栏和底部信息栏空间 */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden w-full" 
        style={{ 
          minHeight: 0,
          paddingTop: getReadingAreaPaddingTop(),
          paddingBottom: config.settings.showBottomInfoBar
            ? ((showBottomNav || isTTSPlaying)
                ? `calc(${infoBarHeight}px + 82px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))` 
                : `calc(${infoBarHeight}px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`)
            : ((showBottomNav || isTTSPlaying)
                ? `calc(82px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))` 
                : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)'),
        }}
      >
        {renderReader()}
        
        <TTSFloatingButton
          isVisible={showTTSFloatingButton}
          onClick={() => {
            // 点击悬浮按钮时，重新显示语音朗读面板
            setShowTTSFloatingButton(false);
            setIsTTSMode(true); // 进入TTS模式
            showBottomNavigation(); // 显示底部导航栏
            // 通知阅读器重新计算安全区域
            if ((window as any).__onBottomNavStateChange) {
              (window as any).__onBottomNavStateChange();
            }
          }}
          theme={config.settings.theme}
          containerRef={containerRef}
        />
      </div>

      {/* 底部信息栏 - 根据设置显示/隐藏 */}
      {config.settings.showBottomInfoBar && (
        <BottomInfoBar
          book={config.book}
          position={currentPosition}
          settings={config.settings}
          onToggleTOC={() => {
            setShowTOC(!showTOC);
            if (!showTOC) {
              showBottomNavigation();
            }
          }}
        />
      )}

      {/* 跨设备进度变更提示（位于底部信息栏上方） */}
      {remoteProgressPrompt && (
        <div className="fixed left-3 right-3 z-[95]" style={{ bottom: `${infoBarHeight + 12}px` }}>
          <div className="rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white/95 dark:bg-gray-900/90 shadow-xl backdrop-blur-md px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('reader.detectedNewProgress')}</div>
              <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                {t('reader.anotherDeviceUpdated')}{' '}
                <span className="font-semibold">
                  {(() => {
                    const sp = remoteProgressPrompt.serverProgress || {};
                    const pct = typeof sp.progress === 'number' ? sp.progress * 100 : null;
                    const cp = sp.currentPage;
                    const tp = sp.totalPages;
                    if (pct != null && Number.isFinite(pct)) return `${pct.toFixed(2)}%`;
                    if (typeof cp === 'number' && typeof tp === 'number' && tp > 1) return `${cp}/${tp} ${t('book.page')}`;
                    return t('reader.laterPosition');
                  })()}
                </span>
                {t('reader.jumpToContinue')}
              </div>

              {(() => {
                const sp = remoteProgressPrompt.serverProgress || {};
                const serverChapterIndex =
                  typeof sp.chapterIndex === 'number'
                    ? sp.chapterIndex
                    : (typeof sp.chapter_index === 'number' ? sp.chapter_index : undefined);

                const serverPct = typeof sp.progress === 'number' ? sp.progress * 100 : null;
                const localPct = typeof currentPosition.progress === 'number' ? currentPosition.progress * 100 : null;

                const flatten = (items: TOCItem[]): TOCItem[] => {
                  const out: TOCItem[] = [];
                  const walk = (arr: TOCItem[]) => {
                    for (const it of arr) {
                      out.push(it);
                      if (it.children?.length) walk(it.children);
                    }
                  };
                  walk(items);
                  return out;
                };

                const tocFlat = flatten(toc || []);
                const findTitleByChapterIndex = (idx: number | undefined) => {
                  if (idx === undefined) return null;
                  const hit = tocFlat.find((t) => typeof t.chapterIndex === 'number' && t.chapterIndex === idx);
                  return hit?.title || null;
                };

                const serverTitle = findTitleByChapterIndex(serverChapterIndex);
                const localTitle = currentPosition.chapterTitle || findTitleByChapterIndex(currentPosition.chapterIndex);

                return (
                  <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 space-y-0.5">
                    <div className="truncate">
                      {t('reader.localDevice')}{localPct !== null ? `${localPct.toFixed(2)}%` : `${currentPosition.currentPage}/${currentPosition.totalPages}`}
                      {localTitle ? ` · ${localTitle}` : ''}
                    </div>
                    <div className="truncate">
                      {t('reader.otherDevice')}{serverPct !== null ? `${serverPct.toFixed(2)}%` : (sp.currentPage && sp.totalPages ? `${sp.currentPage}/${sp.totalPages}` : '')}
                      {serverTitle ? ` · ${serverTitle}` : ''}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={() => {
                  remotePromptHandledRef.current = true;
                  setRemoteProgressPrompt(null);
                  try {
                    window.dispatchEvent(
                      new CustomEvent('__reading_progress_conflict_resolved', {
                        detail: { bookId: config.book.id, action: 'dismiss' },
                      })
                    );
                  } catch {
                    // ignore
                  }
                }}
              >
                {t('common.no')}
              </button>
              <button
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => {
                  const sp = remoteProgressPrompt.serverProgress || {};
                  const pos: any = {
                    progress: sp.progress,
                    currentPage: sp.currentPage,
                    totalPages: sp.totalPages,
                    chapterIndex: sp.chapterIndex,
                    scrollTop: sp.scrollTop,
                    currentLocation: sp.currentPosition,
                  };
                  try {
                    if ((window as any).__readerGoToPosition) {
                      await (window as any).__readerGoToPosition(pos);
                    }
                  } catch {
                    // ignore
                  }
                  remotePromptHandledRef.current = true;
                  setRemoteProgressPrompt(null);
                  try {
                    window.dispatchEvent(
                      new CustomEvent('__reading_progress_conflict_resolved', {
                        detail: { bookId: config.book.id, action: 'accept' },
                      })
                    );
                  } catch {
                    // ignore
                  }
                }}
              >
                {t('common.yes')}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavigation
        book={config.book}
        position={currentPosition}
        settings={config.settings}
        onSettingsChange={config.onSettingsChange}
        isVisible={showBottomNav}
        onToggleTOC={() => {
          setShowTOC(!showTOC);
          showBottomNavigation();
        }}
        onToggleSettings={() => {
          setShowSettings(!showSettings);
          if (showBottomNav) {
            hideBottomNavigation();
          } else {
            showBottomNavigation(true); // 设置模式，30秒后隐藏
          }
        }}
        onClose={() => {
          hideBottomNavigation();
          setShowSettings(false);
        }}
        isSettingsMode={showSettings}
        onToggleNotes={() => {
          setShowNotes(!showNotes);
          showBottomNavigation();
        }}
        onToggleTTS={() => {
          // 如果正在播放，停止播放并退出TTS模式
          if (isTTSPlaying && (window as any).__stopPageTTS) {
            (window as any).__stopPageTTS();
            setIsTTSMode(false);
          } else {
            // 如果是EPUB格式，进入TTS模式并显示底部导航栏，不自动开始播放
            // 用户需要点击播放按钮才会开始播放
            if (config.book.file_type === 'epub') {
              // 先停止所有其他播放进程
              if ((window as any).__stopAllTTS) {
                (window as any).__stopAllTTS();
              }
              // 进入TTS模式
              setIsTTSMode(true);
              // 显示底部导航栏（会切换为播放控制模式）
              showBottomNavigation();
              // 不自动开始播放，等待用户点击播放按钮
            }
          }
        }}
        onToggleBookmark={handleBookmarkButtonClick}
        onToggleBookmarkPanel={() => {
          setShowBookmarks(true);
          showBottomNavigation();
        }}
        hasBookmark={hasCurrentBookmark}
        isTTSMode={isTTSMode}
        isTTSPlaying={isTTSPlaying}
        ttsCurrentIndex={ttsCurrentIndex}
        ttsTotalParagraphs={ttsTotalParagraphs}
        onTTSPlayPause={() => {
          // 确保底部导航栏保持显示
          if (showBottomNavigationRef.current) {
            showBottomNavigationRef.current();
          }
          // 清除任何隐藏定时器
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          
          if (isTTSPlaying && (window as any).__stopPageTTS) {
            (window as any).__stopPageTTS();
          } else if (!isTTSPlaying && config.book.file_type === 'epub' && (window as any).__startPageTTS) {
            // 先停止所有其他播放进程
            if ((window as any).__stopAllTTS) {
              (window as any).__stopAllTTS();
            }
            setTimeout(() => {
              (window as any).__startPageTTS();
            }, 200); // 增加延迟确保停止完成
          }
        }}
        onTTSPrev={() => {
          // 确保底部导航栏保持显示
          if (showBottomNavigationRef.current) {
            showBottomNavigationRef.current();
          }
          // 清除任何隐藏定时器
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          
          // 播放前一个段落
          if (config.book.file_type === 'epub' && (window as any).__prevParagraph) {
            (window as any).__prevParagraph();
          } else {
            console.log('[TTS] 上一段落功能仅支持EPUB格式');
          }
        }}
        onTTSNext={() => {
          // 确保底部导航栏保持显示
          if (showBottomNavigationRef.current) {
            showBottomNavigationRef.current();
          }
          // 清除任何隐藏定时器
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          
          // 播放下一个段落
          if (config.book.file_type === 'epub' && (window as any).__nextParagraph) {
            (window as any).__nextParagraph();
          } else {
            console.log('[TTS] 下一段落功能仅支持EPUB格式');
          }
        }}
        onTTSClose={() => {
          // 关闭TTS模式
          setIsTTSMode(false);
          // 同时关闭设置面板
          setShowSettings(false);
          
          // 如果正在播放，关闭面板时：
          // 1. 不停止播放（继续播放）
          // 2. 隐藏底部导航栏
          // 3. 显示悬浮🎧按钮
          // 4. 重新计算安全区域
          if (isTTSPlaying) {
            hideBottomNavigation();
            setShowTTSFloatingButton(true);
            // 通知阅读器重新计算安全区域
            if ((window as any).__onBottomNavStateChange) {
              (window as any).__onBottomNavStateChange();
            }
          } else {
            // 如果没有播放，只是隐藏底部导航栏，不显示悬浮按钮
            hideBottomNavigation();
            setShowTTSFloatingButton(false);
          }
        }}
        onTTSSpeedChange={(speed: number) => {
          // 动态调整播放速度，不影响播放进程
          // 更新设置
          config.onSettingsChange({
            ...config.settings,
            tts_default_speed: { value: speed.toString() },
          } as any);
          // 通知阅读器更新播放速度（实时调整）
          if ((window as any).__updateTTSPlaybackSpeed) {
            (window as any).__updateTTSPlaybackSpeed(speed);
          }
        }}
        onTTSModelChange={(model: string) => {
          // 更新TTS引擎设置
          config.onSettingsChange({
            ...config.settings,
            tts_default_model: { value: model },
          } as any);
        }}
        onTTSVoiceChange={(voice: string) => {
          // 更新TTS音色设置
          config.onSettingsChange({
            ...config.settings,
            tts_default_voice: { value: voice },
          } as any);
        }}
        onMouseEnter={() => {
          // 鼠标进入导航栏时，清除任何隐藏定时器
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
        }}
        onMouseLeave={() => {
          // 鼠标离开导航栏时，不再自动隐藏
          // 改为点击外部区域隐藏
        }}
        ref={bottomNavRef}
      />

      {/* 目录面板 */}
      {showTOC && (
        <div data-toc-panel>
          <TOCPanel
          toc={toc}
          currentChapter={currentPosition.chapterIndex || 0}
          onClose={() => setShowTOC(false)}
          onChapterSelect={(_index, href) => {
            // 根据文件类型处理目录跳转
            if (config.book.file_type === 'pdf' && href) {
              // PDF目录跳转：解析href中的页码
              if ((window as any).__pdfHandleTOCClick) {
                (window as any).__pdfHandleTOCClick(href);
              }
            } else if (config.book.file_type === 'epub' && href) {
              // EPUB目录跳转：通过href跳转
              if ((window as any).__epubGoToChapter) {
                (window as any).__epubGoToChapter(href);
              }
            } else if (config.book.file_type === 'txt' && href) {
              // TXT目录跳转：解析href中的页码
              const pageMatch = href.match(/page=(\d+)/);
              if (pageMatch && (window as any).__txtGoToPage) {
                const pageNumber = parseInt(pageMatch[1], 10);
                (window as any).__txtGoToPage(pageNumber);
              }
            } else if ((config.book.file_type === 'docx' || config.book.file_type === 'xlsx' || config.book.file_type === 'pptx') && href) {
              // Office文档目录跳转：解析href中的页码
              const pageMatch = href.match(/page=(\d+)/);
              if (pageMatch && (window as any).__officeGoToPage) {
                const pageNumber = parseInt(pageMatch[1], 10);
                (window as any).__officeGoToPage(pageNumber);
              }
            }
            setShowTOC(false);
          }}
        />
        </div>
      )}

      {/* PC端左侧目录面板 */}
      {!isMobile && toc.length > 0 && (
        <>
          <SideTOCPanel
            toc={toc}
            currentPosition={currentPosition}
            bookType={config.book.file_type}
            themeStyles={themeStyles}
            showSideTOC={showSideTOC}
            onClose={() => setShowSideTOC(!showSideTOC)}
            onChapterSelect={(href) => {
              if (config.book.file_type === 'pdf' && href) {
                if ((window as any).__pdfHandleTOCClick) {
                  (window as any).__pdfHandleTOCClick(href);
                }
              } else if (config.book.file_type === 'epub' && href) {
                if ((window as any).__epubGoToChapter) {
                  (window as any).__epubGoToChapter(href);
                }
              } else if (config.book.file_type === 'txt' && href) {
                const pageMatch = href.match(/page=(\d+)/);
                if (pageMatch && (window as any).__txtGoToPage) {
                  const pageNumber = parseInt(pageMatch[1], 10);
                  (window as any).__txtGoToPage(pageNumber);
                }
              } else if ((config.book.file_type === 'docx' || config.book.file_type === 'xlsx' || config.book.file_type === 'pptx') && href) {
                const pageMatch = href.match(/page=(\d+)/);
                if (pageMatch && (window as any).__officeGoToPage) {
                  const pageNumber = parseInt(pageMatch[1], 10);
                  (window as any).__officeGoToPage(pageNumber);
                }
              }
            }}
            getToolbarTop={getToolbarTop}
            infoBarHeight={infoBarHeight}
            showBottomInfoBar={config.settings.showBottomInfoBar}
          />
        </>
      )}

      {/* 设置面板 - 播放时转换为播放控制面板 */}
      {showSettings && (
        <div data-settings-panel>
          <ReadingSettingsPanel
          settings={config.settings}
          bookType={config.book.file_type}
          onSettingsChange={config.onSettingsChange}
          onClose={() => {
            // 正常关闭面板
            setShowSettings(false);
          }}
          isTTSMode={isTTSPlaying}
          isTTSPlaying={isTTSPlaying}
          ttsCurrentIndex={ttsCurrentIndex}
          ttsTotalParagraphs={ttsTotalParagraphs}
          onTTSPlayPause={() => {
            if (isTTSPlaying && (window as any).__stopPageTTS) {
              (window as any).__stopPageTTS();
            } else if (!isTTSPlaying && config.book.file_type === 'epub' && (window as any).__startPageTTS) {
              (window as any).__startPageTTS();
            }
          }}
          onTTSPrev={() => {
            // 播放前一个段落
            if (config.book.file_type === 'epub' && (window as any).__prevParagraph) {
              (window as any).__prevParagraph();
            } else {
              console.log('[TTS] 上一段落功能仅支持EPUB格式');
            }
          }}
          onTTSNext={() => {
            // 播放下一个段落
            if (config.book.file_type === 'epub' && (window as any).__nextParagraph) {
              (window as any).__nextParagraph();
            } else {
              console.log('[TTS] 下一段落功能仅支持EPUB格式');
            }
          }}
        />
        </div>
      )}

      {/* 笔记面板 */}
      {showNotes && (
        <div data-notes-panel>
          <NotesPanel
          bookId={config.book.id}
          currentPage={currentPosition.currentPage}
          currentChapterIndex={currentPosition.chapterIndex}
          selectedText={selectedText}
          isVisible={showNotes}
          theme={config.settings.theme}
          onClose={() => {
            setShowNotes(false);
            setSelectedText('');
          }}
          onNoteClick={(note) => {
            // 点击笔记时可以跳转到对应位置
            setShowNotes(false);
          }}
        />
        </div>
      )}


      {/* 文本选择工具栏 */}
      {showSelectionToolbar && selectionPosition && (
        <div className="text-selection-toolbar">
          <TextSelectionToolbar
            selectedText={selectedText}
            position={selectionPosition}
            onAddNote={handleAddNote}
            onToggleHighlight={handleToggleHighlight}
            isHighlighted={!!(selectedCfiRange && hasLocalHighlight(config.book.id, selectedCfiRange))}
            onCopy={handleCopy}
            onSearch={handleSearch}
            onDictionary={handleDictionary}
            onTranslate={handleTranslate}
            onClose={() => {
              setShowSelectionToolbar(false);
              window.getSelection()?.removeAllRanges();
            }}
          />
        </div>
      )}

      {/* 书签面板 */}
      <div data-bookmarks-panel>
        <BookmarkPanel
          bookmarks={bookmarks}
          currentPosition={currentPosition}
          fileType={config.book.file_type}
          settings={config.settings}
          isVisible={showBookmarks}
          onClose={() => setShowBookmarks(false)}
          onBookmarkClick={goToBookmark}
          onDeleteBookmark={deleteBookmark}
          onEditBookmark={editBookmark}
        />
        <BookmarkEditModal
          bookmark={editingBookmark}
          isVisible={!!editingBookmark}
          onClose={() => setEditingBookmark(null)}
          onSave={saveEditedBookmark}
          theme={config.settings.theme}
        />
      </div>


      {/* 笔记创建模态框 */}
      <CreateNoteModal
        isVisible={showCreateNoteModal}
        bookId={config.book.id}
        selectedText={selectedText}
        selectedCfiRange={selectedCfiRange || undefined}
        currentPage={currentPosition.currentPage}
        chapterIndex={currentPosition.chapterIndex}
        onClose={() => {
          setShowCreateNoteModal(false);
          setSelectedText('');
          setSelectedCfiRange(null);
        }}
        onSuccess={async () => {
          // 高亮选中内容（EPUB）
          if (selectedCfiRange && (window as any).__epubHighlight) {
            try {
              (window as any).__epubHighlight(selectedCfiRange);
            } catch (e) {
              // ignore
            }
          }
          // 刷新笔记列表以显示新标记
          try {
            const api = (await import('../../utils/api')).default;
            const response = await api.get(`/notes/book/${config.book.id}`);
            const notes = response.data.notes || [];
            setBookNotes(notes);
            // 通知阅读器更新笔记标记
            if ((window as any).__updateBookNotes) {
              (window as any).__updateBookNotes(notes);
            }
          } catch (error) {
            console.error('刷新笔记列表失败:', error);
          }
        }}
      />

      {/* 图片查看器 */}
      <ImageViewer
        imageUrl={imageViewerUrl || ''}
        isVisible={!!imageViewerUrl}
        onClose={() => setImageViewerUrl(null)}
        alt={config.book.title}
      />

      {/* 笔记查看器 */}
      <NoteViewer
        note={selectedNote}
        isVisible={showNoteViewer}
        onClose={() => {
          setShowNoteViewer(false);
          setSelectedNote(null);
        }}
        theme={config.settings.theme}
      />

      {/* 返回上一阅读位置的悬浮按钮 */}
      <BackToPreviousPositionButton
        previousPosition={previousPosition}
        isVisible={showBackButton}
        onBack={backToPreviousPosition}
        onClose={closeBackButton}
        theme={config.settings.theme}
      />

    </div>
  );
}
