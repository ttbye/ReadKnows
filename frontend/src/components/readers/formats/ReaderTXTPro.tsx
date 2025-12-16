/**
 * @author ttbye
 * 专业级 TXT 电子书阅读器
 * 支持分页、翻页、搜索、进度同步、书签等功能
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem } from '../../../types/reader';
import { offlineStorage } from '../../../utils/offlineStorage';
import toast from 'react-hot-toast';
import { X, Clock, Search, Bookmark, BookmarkCheck } from 'lucide-react';

interface ReaderTXTProProps {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  onSettingsChange: (settings: ReadingSettings) => void;
  onProgressChange: (progress: number, position: ReadingPosition) => void;
  onTOCChange: (toc: TOCItem[]) => void;
  onClose: () => void;
}

interface Page {
  pageNumber: number;
  startLine: number;
  endLine: number;
  content: string;
}

interface SearchResult {
  lineIndex: number;
  charIndex: number;
  match: string;
}

interface Bookmark {
  pageNumber: number;
  lineIndex: number;
  preview: string;
  createdAt: number;
}

export default function ReaderTXTPro({
  book,
  settings,
  initialPosition,
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
}: ReaderTXTProProps) {
  // 核心状态
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [textLines, setTextLines] = useState<string[]>([]);
  const [fullText, setFullText] = useState<string>('');
  
  // 分页状态
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isTurningPage, setIsTurningPage] = useState(false);
  
  // UI 状态
  const [showBottomBar, setShowBottomBar] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [bookNotes, setBookNotes] = useState<any[]>([]);
  
  // 触摸状态
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [touchOffset, setTouchOffset] = useState(0);
  const [pageTransition, setPageTransition] = useState<'none' | 'next' | 'prev'>('none');
  
  // 容器尺寸
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // 定时器
  const hideBarsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 更新时间
  useEffect(() => {
    timeUpdateTimerRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => {
      if (timeUpdateTimerRef.current) {
        clearInterval(timeUpdateTimerRef.current);
      }
    };
  }, []);

  // 暴露全局跳转函数供TOC使用
  useEffect(() => {
    (window as any).__txtGoToPage = (pageNumber: number) => {
      const targetPage = pages.find(p => p.pageNumber === pageNumber);
      if (targetPage) {
        const targetIndex = pages.indexOf(targetPage);
        setCurrentPageIndex(targetIndex);
        toast.success('已跳转');
      } else {
        toast.error('页面不存在');
      }
    };

    return () => {
      delete (window as any).__txtGoToPage;
    };
  }, [pages]);

  // 获取文件URL
  const getFileUrl = async (): Promise<string> => {
    const ext = book.file_name?.split('.').pop()?.toLowerCase() || 'txt';
    const serverUrl = `/books/${book.id}.${ext}`;
    
    try {
      const cachedBlob = await offlineStorage.getBook(book.id);
      if (cachedBlob) {
        return offlineStorage.createBlobURL(cachedBlob);
      }
      const blob = await offlineStorage.downloadBook(book.id, ext, serverUrl);
      return offlineStorage.createBlobURL(blob);
    } catch (error) {
      console.error('离线存储失败，使用服务器URL', error);
      return serverUrl;
    }
  };

  // 加载TXT文件
  useEffect(() => {
    if (!book || !book.id) return;

    const loadTxt = async () => {
      try {
        setLoading(true);

        const fileUrl = await getFileUrl();
        
        // 对于大文件，使用流式读取
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`加载失败: ${response.status} ${response.statusText}`);
        }

        // 读取文本内容
        const text = await response.text();
        
        // 处理不同编码和换行符
        // 统一换行符为 \n
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 按行分割，保留空行
        const lines = normalizedText.split('\n');
        
        setFullText(normalizedText);
        setTextLines(lines);
        
        // 加载书签
        loadBookmarks();

        setLoading(false);
      } catch (error: any) {
        console.error('加载TXT失败', error);
        toast.error(`加载失败: ${error.message || '未知错误'}`);
        setLoading(false);
      }
    };

    loadTxt();
  }, [book?.id, book?.file_name]);

  // 加载书签
  const loadBookmarks = useCallback(() => {
    try {
      const saved = localStorage.getItem(`bookmarks-${book.id}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Bookmark[];
        setBookmarks(parsed);
      }
    } catch (error) {
      console.error('加载书签失败', error);
    }
  }, [book.id]);

  // 获取书籍笔记
  useEffect(() => {
    const fetchBookNotes = async () => {
      try {
        const api = (await import('../../../utils/api')).default;
        const response = await api.get(`/notes/book/${book.id}`);
        setBookNotes(response.data.notes || []);
      } catch (error) {
        console.error('获取书籍笔记失败:', error);
      }
    };
    if (book.id) {
      fetchBookNotes();
    }
  }, [book.id]);

  // 保存书签
  const saveBookmarks = useCallback((newBookmarks: Bookmark[]) => {
    try {
      localStorage.setItem(`bookmarks-${book.id}`, JSON.stringify(newBookmarks));
      setBookmarks(newBookmarks);
    } catch (error) {
      console.error('保存书签失败', error);
    }
  }, [book.id]);

  // 监听容器尺寸变化
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newSize = { 
          width: rect.width || window.innerWidth, 
          height: rect.height || (window.innerHeight - 140) 
        };
        setContainerSize(newSize);
      } else {
        const fallbackSize = { 
          width: window.innerWidth, 
          height: window.innerHeight - 140 
        };
        setContainerSize(fallbackSize);
      }
    };

    const timer = setTimeout(() => {
      updateSize();
    }, 100);

    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        updateSize();
      });
      resizeObserver.observe(containerRef.current);
      window.addEventListener('resize', updateSize);
      
      return () => {
        clearTimeout(timer);
        resizeObserver.disconnect();
        window.removeEventListener('resize', updateSize);
      };
    }
    
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // 智能分页：将文本内容分割成页面
  const paginateText = useCallback(() => {
    if (textLines.length === 0) {
      return;
    }
    
    const effectiveHeight = containerSize.height > 0 
      ? containerSize.height 
      : (window.innerHeight - 140);
    const effectiveWidth = containerSize.width > 0 
      ? containerSize.width 
      : window.innerWidth;
    
    if (effectiveHeight <= 0) {
      return;
    }

    const allPages: Page[] = [];
    const pageHeight = effectiveHeight - 80; // 减去导航栏高度
    let currentPageLines: string[] = [];
    let currentPageHeight = 0;
    let globalPageNumber = 1;

    // 创建临时容器用于测量
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
      position: absolute;
      visibility: hidden;
      width: ${effectiveWidth - (settings.margin * 2)}px;
      top: -9999px;
      left: -9999px;
      ${getContentCSS()}
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    document.body.appendChild(tempDiv);

    textLines.forEach((line, lineIndex) => {
      // 测量当前行的高度
      tempDiv.textContent = line || ' '; // 空行用空格代替测量
      const lineHeight = tempDiv.offsetHeight;

      // 如果当前页加上这一行会超出，先保存当前页
      if (currentPageHeight + lineHeight > pageHeight && currentPageLines.length > 0) {
        const pageContent = currentPageLines.join('\n');
        allPages.push({
          pageNumber: globalPageNumber++,
          startLine: lineIndex - currentPageLines.length,
          endLine: lineIndex - 1,
          content: pageContent,
        });
        currentPageLines = [line];
        currentPageHeight = lineHeight;
      } else {
        currentPageLines.push(line);
        currentPageHeight += lineHeight;
      }
    });

    // 保存最后一页
    if (currentPageLines.length > 0) {
      const pageContent = currentPageLines.join('\n');
      allPages.push({
        pageNumber: globalPageNumber++,
        startLine: textLines.length - currentPageLines.length,
        endLine: textLines.length - 1,
        content: pageContent,
      });
    }

    document.body.removeChild(tempDiv);
    
    setPages(allPages);
    setTotalPages(allPages.length);

    // 恢复阅读位置
    if (allPages.length > 0) {
      if (initialPosition && initialPosition.currentPage) {
        const targetPageIndex = Math.min(
          initialPosition.currentPage - 1,
          allPages.length - 1
        );
        setCurrentPageIndex(Math.max(0, targetPageIndex));
      } else {
        setCurrentPageIndex(0);
      }
    }
  }, [textLines, containerSize, settings, initialPosition]);

  // 计算分页
  useEffect(() => {
    paginateText();
  }, [paginateText]);

  // 获取内容CSS样式字符串
  const getContentCSS = useCallback((): string => {
    const themeStyles = {
      light: { bg: '#ffffff', text: '#000000' },
      dark: { bg: '#1a1a1a', text: '#ffffff' },
      sepia: { bg: '#f4e4bc', text: '#5c4b37' },
      green: { bg: '#c8e6c9', text: '#2e7d32' },
    }[settings.theme];

    const fontFamily = {
      default: '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif',
      serif: '"Songti SC", "SimSun", "宋体", "STSong", serif',
      'sans-serif': '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif',
      monospace: '"Courier New", "Monaco", "Consolas", monospace',
    }[settings.fontFamily] || '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif';

    return `
      background-color: ${themeStyles.bg};
      color: ${themeStyles.text};
      font-family: ${fontFamily};
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      padding: ${settings.margin}px;
    `;
  }, [settings]);

  // 获取内容样式对象
  const getContentStyles = useCallback(() => {
    const themeStyles = {
      light: { bg: '#ffffff', text: '#000000' },
      dark: { bg: '#1a1a1a', text: '#ffffff' },
      sepia: { bg: '#f4e4bc', text: '#5c4b37' },
      green: { bg: '#c8e6c9', text: '#2e7d32' },
    }[settings.theme];

    const fontFamily = {
      default: '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif',
      serif: '"Songti SC", "SimSun", "宋体", "STSong", serif',
      'sans-serif': '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif',
      monospace: '"Courier New", "Monaco", "Consolas", monospace',
    }[settings.fontFamily] || '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif';

    return {
      backgroundColor: themeStyles.bg,
      color: themeStyles.text,
      fontFamily: fontFamily,
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      padding: `${settings.margin}px`,
    };
  }, [settings]);

  // 显示/隐藏底部导航栏
  const showBars = useCallback(() => {
    setShowBottomBar(true);
    
    if (hideBarsTimerRef.current) {
      clearTimeout(hideBarsTimerRef.current);
    }
    
    hideBarsTimerRef.current = setTimeout(() => {
      setShowBottomBar(false);
    }, 3000);
  }, []);

  // 翻页处理
  const turnPage = useCallback((direction: 'prev' | 'next') => {
    if (isTurningPage || pages.length === 0) return;

    setIsTurningPage(true);
    setPageTransition(direction);

    setTimeout(() => {
      if (direction === 'next') {
        if (currentPageIndex < pages.length - 1) {
          setCurrentPageIndex(currentPageIndex + 1);
        } else {
          toast('已经是最后一页了');
        }
      } else {
        if (currentPageIndex > 0) {
          setCurrentPageIndex(currentPageIndex - 1);
        } else {
          toast('已经是第一页了');
        }
      }

      setTimeout(() => {
        setPageTransition('none');
        setIsTurningPage(false);
      }, 300);
    }, 50);
  }, [isTurningPage, pages.length, currentPageIndex]);

  // 更新阅读进度
  useEffect(() => {
    if (pages.length === 0 || totalPages === 0) return;

    const currentPage = pages[currentPageIndex];
    if (!currentPage) return;

    const progress = Math.min(1, Math.max(0, currentPage.pageNumber / totalPages));

    // 防抖保存进度
    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
    }

    progressSaveTimerRef.current = setTimeout(() => {
      const position: ReadingPosition = {
        currentPage: currentPage.pageNumber,
        totalPages: totalPages,
        progress: progress,
        scrollTop: 0,
      };
      
      onProgressChange(progress, position);
    }, 500);
  }, [currentPageIndex, pages, totalPages, onProgressChange]);

  // 搜索功能
  const performSearch = useCallback((term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    const results: SearchResult[] = [];
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    textLines.forEach((line, lineIndex) => {
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          lineIndex,
          charIndex: match.index,
          match: match[0],
        });
      }
    });

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
    
    if (results.length > 0) {
      toast.success(`找到 ${results.length} 个匹配结果`);
    } else {
      toast('未找到匹配结果');
    }
  }, [textLines]);

  // 跳转到搜索结果
  const goToSearchResult = useCallback((index: number) => {
    if (index < 0 || index >= searchResults.length) return;

    const result = searchResults[index];
    const targetPage = pages.find(
      p => p.startLine <= result.lineIndex && p.endLine >= result.lineIndex
    );

    if (targetPage) {
      const targetIndex = pages.indexOf(targetPage);
      setCurrentPageIndex(targetIndex);
      setCurrentSearchIndex(index);
      setShowSearch(false);
      showBars();
    }
  }, [searchResults, pages, showBars]);

  // 下一个搜索结果
  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    goToSearchResult(nextIndex);
  }, [searchResults, currentSearchIndex, goToSearchResult]);

  // 上一个搜索结果
  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex <= 0 
      ? searchResults.length - 1 
      : currentSearchIndex - 1;
    goToSearchResult(prevIndex);
  }, [searchResults, currentSearchIndex, goToSearchResult]);

  // 高亮搜索关键词
  const highlightText = useCallback((text: string, searchTerm: string): string => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(
      `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    );
    
    return text.replace(regex, '<mark style="background-color: yellow; color: black;">$1</mark>');
  }, []);

  // 标记笔记文本
  const markNotesInText = useCallback((text: string, pageNumber: number): string => {
    if (!text || bookNotes.length === 0) return text;
    
    // 获取当前页面的笔记
    const pageNotes = bookNotes.filter(note => note.page_number === pageNumber);
    if (pageNotes.length === 0) return text;
    
    let markedText = text;
    
    // 为每个笔记标记选中的文本
    pageNotes.forEach((note) => {
      if (note.selected_text && note.selected_text.trim()) {
        const selectedText = note.selected_text.trim();
        // 转义特殊字符
        const escapedText = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedText})`, 'gi');
        
        // 检查文本中是否包含该选中文本
        if (regex.test(markedText)) {
          markedText = markedText.replace(regex, (match) => {
            return `<mark class="note-highlight" style="background-color: #ffeb3b; color: #000; border-bottom: 2px solid #ff9800; cursor: pointer; position: relative;" title="有笔记：${note.content.substring(0, 30)}...">${match}</mark>`;
          });
        }
      }
    });
    
    return markedText;
  }, [bookNotes]);

  // 添加书签
  const addBookmark = useCallback(() => {
    const currentPage = pages[currentPageIndex];
    if (!currentPage) return;

    const preview = currentPage.content.substring(0, 50).replace(/\n/g, ' ');
    const newBookmark: Bookmark = {
      pageNumber: currentPage.pageNumber,
      lineIndex: currentPage.startLine,
      preview,
      createdAt: Date.now(),
    };

    // 检查是否已存在
    const exists = bookmarks.some(
      b => b.pageNumber === currentPage.pageNumber
    );

    if (exists) {
      toast('当前页面已添加书签');
      return;
    }

    const newBookmarks = [...bookmarks, newBookmark].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
    saveBookmarks(newBookmarks);
    toast.success('书签已添加');
  }, [pages, currentPageIndex, bookmarks, saveBookmarks]);

  // 删除书签
  const removeBookmark = useCallback((pageNumber: number) => {
    const newBookmarks = bookmarks.filter(b => b.pageNumber !== pageNumber);
    saveBookmarks(newBookmarks);
    toast.success('书签已删除');
  }, [bookmarks, saveBookmarks]);

  // 跳转到书签
  const goToBookmark = useCallback((pageNumber: number) => {
    const targetPage = pages.find(p => p.pageNumber === pageNumber);
    if (targetPage) {
      const targetIndex = pages.indexOf(targetPage);
      setCurrentPageIndex(targetIndex);
      setShowBookmarks(false);
      showBars();
    }
  }, [pages, showBars]);

  // 检查当前页是否有书签
  const hasBookmark = useMemo(() => {
    const currentPage = pages[currentPageIndex];
    if (!currentPage) return false;
    return bookmarks.some(b => b.pageNumber === currentPage.pageNumber);
  }, [pages, currentPageIndex, bookmarks]);

  // 触摸事件处理
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    showBars();
  }, [showBars]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
      setTouchOffset(Math.max(-100, Math.min(100, deltaX)));
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaTime = Date.now() - touchStartRef.current.time;

    if (Math.abs(deltaX) > 50 && deltaTime < 300) {
      if (deltaX > 0) {
        turnPage('prev');
      } else {
        turnPage('next');
      }
    }

    setTouchOffset(0);
    touchStartRef.current = null;
  }, [turnPage]);

  // 点击翻页
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (settings.clickToTurn) {
      if (settings.pageTurnMode === 'horizontal') {
        if (x < width / 3) {
          turnPage('prev');
        } else if (x > (width * 2) / 3) {
          turnPage('next');
        } else {
          showBars();
        }
      } else {
        const y = e.clientY - rect.top;
        const height = rect.height;
        if (y < height / 3) {
          turnPage('prev');
        } else if (y > (height * 2) / 3) {
          turnPage('next');
        } else {
          showBars();
        }
      }
    } else {
      showBars();
    }
  }, [settings, turnPage, showBars]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // 在搜索框中，只处理搜索相关快捷键
        if (e.key === 'Enter' && showSearch) {
          e.preventDefault();
          performSearch(searchTerm);
          return;
        }
        if (e.key === 'Escape' && showSearch) {
          e.preventDefault();
          setShowSearch(false);
          return;
        }
        return;
      }

      // 标记已处理，避免容器层重复处理
      (e as any).__readerHandled = true;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        turnPage('prev');
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        turnPage('next');
      } else if (e.key === 'Escape') {
        setShowBottomBar(false);
        setShowSearch(false);
        setShowBookmarks(false);
      } else if (e.key === 'f' || e.key === 'F') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setShowSearch(true);
        }
      } else if (e.key === 'b' || e.key === 'B') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (hasBookmark) {
            removeBookmark(pages[currentPageIndex]?.pageNumber || 0);
          } else {
            addBookmark();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [turnPage, showSearch, searchTerm, performSearch, hasBookmark, pages, currentPageIndex, addBookmark, removeBookmark]);

  // 获取当前页面
  const currentPage = pages[currentPageIndex];

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  }[settings.theme];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: themeStyles.bg }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: themeStyles.text }} />
          <p style={{ color: themeStyles.text }}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: themeStyles.bg }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* 阅读内容区域 */}
      <div
        ref={contentRef}
        className="h-full w-full overflow-hidden relative"
        style={{
          transform: `translateX(${touchOffset}px)`,
          transition: touchOffset === 0 && pageTransition === 'none' ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          paddingBottom: showBottomBar ? '80px' : '0',
        }}
      >
        {currentPage ? (
          <div
            className="h-full w-full overflow-y-auto"
            style={{
              padding: '40px 20px',
              backgroundColor: themeStyles.bg,
            }}
          >
            <div
              className="txt-content"
              style={{
                ...getContentStyles(),
                maxWidth: '900px',
                margin: '0 auto',
                minHeight: '100%',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
              }}
              dangerouslySetInnerHTML={{
                __html: showSearch && searchTerm
                  ? highlightText(currentPage.content, searchTerm)
                  : currentPage.content.replace(/\n/g, '<br/>')
              }}
            />
          </div>
        ) : pages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p style={{ color: themeStyles.text }}>正在加载内容...</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p style={{ color: themeStyles.text }}>无法显示内容</p>
            </div>
          </div>
        )}
      </div>

      {/* 底部导航栏 */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 ${
          showBottomBar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{
          backgroundColor: themeStyles.bg,
          borderTop: `1px solid ${themeStyles.border}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="px-4 py-3">
          {/* 进度条 */}
          <div className="w-full h-1 rounded-full mb-3" style={{ backgroundColor: themeStyles.border }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${((currentPage?.pageNumber || 1) / totalPages) * 100}%`,
                backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
              }}
            />
          </div>
          {/* 信息行 */}
          <div className="flex items-center justify-between text-xs" style={{ color: themeStyles.text, opacity: 0.7 }}>
            <span className="truncate max-w-[30%]">{book.title || book.file_name}</span>
            <span className="mx-2">
              {currentPage?.pageNumber || 0} / {totalPages}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {/* 操作按钮 */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <button
              onClick={() => {
                setShowSearch(true);
                showBars();
              }}
              className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 transition-colors"
              aria-label="搜索"
            >
              <Search className="w-4 h-4" style={{ color: themeStyles.text }} />
            </button>
            <button
              onClick={() => {
                setShowBookmarks(true);
                showBars();
              }}
              className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 transition-colors"
              aria-label="书签"
            >
              <Bookmark className="w-4 h-4" style={{ color: themeStyles.text }} />
            </button>
            <button
              onClick={hasBookmark ? () => removeBookmark(currentPage?.pageNumber || 0) : addBookmark}
              className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 transition-colors"
              aria-label={hasBookmark ? "删除书签" : "添加书签"}
            >
              {hasBookmark ? (
                <BookmarkCheck className="w-4 h-4" style={{ color: '#ff9800' }} />
              ) : (
                <Bookmark className="w-4 h-4" style={{ color: themeStyles.text }} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 搜索面板 */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">搜索</h2>
              <button onClick={() => setShowSearch(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    performSearch(searchTerm);
                  }
                }}
                placeholder="输入搜索关键词..."
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">
                    找到 {searchResults.length} 个结果
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={prevSearchResult}
                      className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                    >
                      上一个
                    </button>
                    <button
                      onClick={nextSearchResult}
                      className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                    >
                      下一个
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <button
                      key={index}
                      onClick={() => goToSearchResult(index)}
                      className={`w-full text-left px-4 py-2 rounded-lg transition-colors mb-1 ${
                        index === currentSearchIndex
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="text-sm font-medium">第 {result.lineIndex + 1} 行</div>
                      <div className="text-xs text-gray-500 truncate">
                        {textLines[result.lineIndex]?.substring(Math.max(0, result.charIndex - 20), result.charIndex + 50)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => performSearch(searchTerm)}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              搜索
            </button>
          </div>
        </div>
      )}

      {/* 书签面板 */}
      {showBookmarks && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">书签</h2>
              <button onClick={() => setShowBookmarks(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bookmark className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无书签</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookmarks.map((bookmark, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <button
                      onClick={() => goToBookmark(bookmark.pageNumber)}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium">第 {bookmark.pageNumber} 页</div>
                      <div className="text-sm text-gray-500 truncate mt-1">
                        {bookmark.preview}
                      </div>
                    </button>
                    <button
                      onClick={() => removeBookmark(bookmark.pageNumber)}
                      className="ml-2 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 注入样式 */}
      <style>{`
        .txt-content {
          ${getContentCSS()}
        }
        .txt-content mark {
          background-color: yellow;
          color: black;
          padding: 2px 0;
        }
      `}</style>
    </div>
  );
}

