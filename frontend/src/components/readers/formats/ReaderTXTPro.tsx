/**
 * @author ttbye
 * 专业级 TXT 电子书阅读器
 * 支持分页、翻页、搜索、进度同步、书签等功能
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem } from '../../../types/reader';
import { offlineStorage } from '../../../utils/offlineStorage';
import { getFullApiUrl, getFullBookUrl } from '../../../utils/api';
import { getFontFamily } from '../common/theme/themeManager';
import toast from 'react-hot-toast';
import { X, Clock, Search, Bookmark, BookmarkCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReaderTXTProProps {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  customFonts?: Array<{ id: string; name: string; file_name: string }>;
  fontCache?: Map<string, Blob>;
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
  customFonts = [],
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
}: ReaderTXTProProps) {
  const { t } = useTranslation();
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
  // 记录“稳定锚点”：用行号来跨字号/跨设备恢复位置（比页码稳定）
  const anchorLineRef = useRef<number | null>(null);

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

  // 暴露"获取当前页面信息"给外部（供TTS使用）
  useEffect(() => {
    (window as any).__getCurrentPageInfo = () => {
      const currentPage = pages[currentPageIndex];
      if (!currentPage) return null;
      return {
        pageIndex: currentPageIndex,
        startLine: currentPage.startLine,
        endLine: currentPage.endLine,
        content: currentPage.content,
        pageNumber: currentPage.pageNumber,
      };
    };

    // 暴露"获取当前页面对应的段落索引"给外部（供TTS使用）
    (window as any).__getCurrentPageParagraphIndex = async () => {
      try {
        // 获取段落列表 - 使用正确的token获取方式
        const getTokenFromStorage = (): string | null => {
          try {
            const token = localStorage.getItem('auth-storage');
            if (token) {
              const parsed = JSON.parse(token);
              // Zustand persist stores state directly, but may also have a 'state' wrapper
              return parsed.state?.token || parsed.token || null;
            }
          } catch (e) {
            // 忽略解析错误
          }
          // 兼容旧版本：尝试从 'token' key 获取
          return localStorage.getItem('token');
        };
        
        const token = getTokenFromStorage();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        // 使用统一的 API URL 配置
        const apiUrl = getFullApiUrl(`/tts/paragraphs?bookId=${encodeURIComponent(book.id)}&chapter=0`);
        const response = await fetch(apiUrl, { 
          headers,
          credentials: 'include', // 包含cookies
        });
        if (!response.ok) {
          console.warn(`[ReaderTXTPro] 获取段落列表失败: ${response.status} ${response.statusText}`);
          return null;
        }
        
        const data = await response.json();
        const paragraphs = data.paragraphs || [];
        if (paragraphs.length === 0) return null;

        const currentPage = pages[currentPageIndex];
        if (!currentPage) return null;

        // 根据当前页面第一行内容匹配段落
        const currentPageFirstLine = currentPage.content.split('\n')[0]?.trim();
        if (!currentPageFirstLine || currentPageFirstLine.length === 0) return null;

        // 改进匹配逻辑：使用更长的文本片段进行匹配，提高准确性
        const searchText = currentPageFirstLine.substring(0, Math.min(50, currentPageFirstLine.length));
        
        // 查找包含当前页面第一行内容的段落
        // 优先匹配：段落文本包含页面第一行
        for (let i = 0; i < paragraphs.length; i++) {
          const paraText = paragraphs[i].text;
          if (paraText.includes(searchText)) {
            console.log(`[ReaderTXTPro] 匹配段落索引 ${i}: 页面第一行="${searchText.substring(0, 20)}...", 段落文本="${paraText.substring(0, 30)}..."`);
            return i;
          }
        }
        
        // 次优匹配：页面第一行包含段落开头
        for (let i = 0; i < paragraphs.length; i++) {
          const paraText = paragraphs[i].text;
          const paraStart = paraText.substring(0, Math.min(50, paraText.length));
          if (currentPageFirstLine.includes(paraStart)) {
            console.log(`[ReaderTXTPro] 匹配段落索引 ${i}: 页面第一行包含段落开头`);
            return i;
          }
        }

        // 如果没找到，根据进度估算
        const progress = Math.min(1, Math.max(0, currentPage.pageNumber / totalPages));
        const estimatedIndex = Math.floor(progress * paragraphs.length);
        console.log(`[ReaderTXTPro] 未找到匹配段落，使用进度估算: progress=${progress}, 估算索引=${estimatedIndex}`);
        return estimatedIndex;
      } catch (e) {
        console.warn('[ReaderTXTPro] 获取段落索引失败', e);
        return null;
      }
    };

    // 暴露"获取当前页面文本内容"给外部（供TTS直接使用）
    (window as any).__getCurrentPageText = () => {
      const currentPage = pages[currentPageIndex];
      if (!currentPage) return null;
      return currentPage.content.trim();
    };

    return () => {
      delete (window as any).__getCurrentPageInfo;
      delete (window as any).__getCurrentPageParagraphIndex;
      delete (window as any).__getCurrentPageText;
    };
  }, [pages, currentPageIndex, book.id, totalPages]);

  // 暴露"跳转到指定进度/位置"给外部（供跨设备进度跳转）
  useEffect(() => {
    (window as any).__readerGoToPosition = (pos: any) => {
      try {
        // 优先使用 txtline:<line>
        const loc = pos?.currentLocation || pos?.currentPosition;
        let line: number | null = null;
        if (typeof loc === 'string' && loc.startsWith('txtline:')) {
          const n = parseInt(loc.substring('txtline:'.length), 10);
          if (!isNaN(n)) line = n;
        } else if (typeof pos?.scrollTop === 'number' && !isNaN(pos.scrollTop) && pos.scrollTop >= 0) {
          // 兼容：scrollTop 字段存了行号
          line = Math.round(pos.scrollTop);
        }

        if (line != null && pages.length > 0) {
          const p = pages.find((pg) => pg.startLine <= line! && pg.endLine >= line!);
          if (p) {
            setCurrentPageIndex(pages.indexOf(p));
            return true;
          }
        }

        // 兜底：按 progress 定位
        if (typeof pos?.progress === 'number' && !isNaN(pos.progress) && pages.length > 0) {
          const idx = Math.max(0, Math.min(pages.length - 1, Math.round(pos.progress * pages.length) - 1));
          setCurrentPageIndex(idx);
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };
    return () => {
      delete (window as any).__readerGoToPosition;
    };
  }, [pages]);

  // 处理当前朗读段落的显示（高亮和自动翻页）
  useEffect(() => {
    let currentHighlightElement: HTMLElement | null = null;
    
    (window as any).__setCurrentReadingParagraph = (paragraphId: string | null) => {
      try {
        // 清除之前的高亮
        if (currentHighlightElement) {
          currentHighlightElement.style.textDecoration = '';
          currentHighlightElement.style.textDecorationColor = '';
          currentHighlightElement.style.textDecorationThickness = '';
          currentHighlightElement.style.textUnderlineOffset = '';
          currentHighlightElement.classList.remove('reading-paragraph-highlight');
          currentHighlightElement = null;
        }

        if (!paragraphId) return;

        // 根据段落ID查找对应的元素
        // 段落ID格式: p0, p1, p2 等，对应段落索引
        const paraIndex = parseInt(paragraphId.replace(/^p/, ''), 10);
        if (isNaN(paraIndex) || paraIndex < 0) return;

        // 通过全局函数获取段落文本（从TTSPanel传递）
        const getParagraphText = (window as any).__getParagraphText;
        if (!getParagraphText) return;
        
        const paraText = getParagraphText(paragraphId);
        if (!paraText) return;

        // 在当前页面中查找并高亮段落
        // 通过文本内容匹配来找到对应的DOM元素
        const readerContent = containerRef.current?.querySelector('.reader-content');
        if (!readerContent) return;

        // 等待页面渲染完成后再高亮
        setTimeout(() => {
          // 查找包含段落文本的元素
          const allTextElements = readerContent.querySelectorAll('p, div, span, pre');
          
          // 改进匹配逻辑：使用更长的文本片段进行匹配，提高准确性
          const searchText = paraText.substring(0, Math.min(50, paraText.length));
          
          for (const elem of allTextElements) {
            const text = elem.textContent || '';
            // 优先匹配：元素文本包含段落文本
            if (text.includes(searchText)) {
              const htmlElem = elem as HTMLElement;
              
              // 高亮显示：只使用下划线，不影响布局
              const underlineColor = settings.theme === 'dark' ? '#4a9eff' : '#1890ff';
              htmlElem.style.textDecoration = 'underline';
              htmlElem.style.textDecorationColor = underlineColor;
              htmlElem.style.textDecorationThickness = '2px';
              htmlElem.style.textUnderlineOffset = '2px';
              htmlElem.classList.add('reading-paragraph-highlight');
              
              currentHighlightElement = htmlElem;
              
              // 检查段落是否在当前页面，如果不在则自动翻页
              const rect = htmlElem.getBoundingClientRect();
              const containerRect = readerContent.getBoundingClientRect();
              
              // 如果段落不在当前视图，需要翻页
              if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
                // 估算段落所在的行号（通过文本内容在全文中的位置）
                const paraIndex = parseInt(paragraphId.replace(/^p/, ''), 10);
                // 粗略估算：假设每个段落平均15行
                const estimatedLine = paraIndex * 15;
                
                // 找到包含该行的页面
                const targetPage = pages.find((pg) => pg.startLine <= estimatedLine && pg.endLine >= estimatedLine);
                if (targetPage) {
                  const pageIndex = pages.indexOf(targetPage);
                  if (pageIndex !== currentPageIndex) {
                    // 自动翻页
                    setCurrentPageIndex(pageIndex);
                    // 等待翻页完成后再高亮
                    setTimeout(() => {
                      htmlElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                  }
                }
              } else {
                // 自动滚动到该段落
                htmlElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              break;
            }
          }
        }, 100);
      } catch (e) {
        console.warn('[ReaderTXTPro] 高亮段落失败', e);
      }
    };

    return () => {
      delete (window as any).__setCurrentReadingParagraph;
      // 清理高亮
      if (currentHighlightElement) {
        currentHighlightElement.style.fontWeight = '';
        currentHighlightElement.style.backgroundColor = '';
        currentHighlightElement.style.border = '';
        currentHighlightElement.style.padding = '';
        currentHighlightElement.style.borderRadius = '';
        currentHighlightElement.classList.remove('reading-paragraph-highlight');
      }
    };
  }, [pages, currentPageIndex, settings.theme]);

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
      // 构建完整URL以支持自定义API URL
      return getFullBookUrl(serverUrl);
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
        // 如果URL不是blob URL，需要添加认证头
        const headers: HeadersInit = {};
        if (!fileUrl.startsWith('blob:')) {
          const { getAuthHeaders } = await import('../../../utils/api');
          Object.assign(headers, getAuthHeaders());
        }
        const response = await fetch(fileUrl, { headers });
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

    // 恢复阅读位置：
    // 1) 优先使用当前阅读锚点（行号）——用于字体/容器变化后的重新分页，不应回跳到旧 initialPosition
    // 2) 其次使用 initialPosition.currentLocation（txtline:xxx）
    // 3) 再用 initialPosition.progress（跨设备更稳定）
    // 4) 最后才用 initialPosition.currentPage（最不稳定：会受字号影响）
    if (allPages.length > 0) {
      let targetIndex = 0;

      const tryFindByLine = (line: number) => {
        if (Number.isFinite(line) && line >= 0) {
          const p = allPages.find((pg) => pg.startLine <= line && pg.endLine >= line);
          if (p) return allPages.indexOf(p);
        }
        return null;
      };

      // 1) 当前锚点（优先，解决“调整字号后页码不重算/回跳上一页”）
      if (anchorLineRef.current != null) {
        const idx = tryFindByLine(anchorLineRef.current);
        if (idx != null) targetIndex = idx;
      } else {
        // 2) initialPosition.currentLocation: txtline:<lineIndex>
        const loc = (initialPosition as any)?.currentLocation;
        if (typeof loc === 'string' && loc.startsWith('txtline:')) {
          const line = parseInt(loc.substring('txtline:'.length), 10);
          const idx = tryFindByLine(line);
          if (idx != null) targetIndex = idx;
        } else {
          // 3) initialPosition.progress（跨终端字号不同仍然稳定）
          const p = initialPosition?.progress;
          if (typeof p === 'number' && !isNaN(p) && p > 0) {
            targetIndex = Math.max(0, Math.min(allPages.length - 1, Math.round(p * allPages.length) - 1));
          } else if (initialPosition?.currentPage) {
            // 4) 最后兜底：页码（1-based）
            targetIndex = Math.max(0, Math.min(allPages.length - 1, initialPosition.currentPage - 1));
          }
        }
      }

      setCurrentPageIndex(targetIndex);
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

    const fontFamily = getFontFamily(settings.fontFamily);

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

    const fontFamily = getFontFamily(settings.fontFamily);

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
          toast(t('reader.alreadyLastPage'));
        }
      } else {
        if (currentPageIndex > 0) {
          setCurrentPageIndex(currentPageIndex - 1);
        } else {
          toast(t('reader.alreadyFirstPage'));
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
    // 更新稳定锚点：用当前页的起始行号（跨字号/跨设备可复原）
    anchorLineRef.current = currentPage.startLine;

    // 防抖保存进度
    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
    }

      progressSaveTimerRef.current = setTimeout(async () => {
        // 计算当前页面对应的段落索引（用于与朗读功能同步）
        let paragraphIndex: number | undefined = undefined;
        const getCurrentPageParagraphIndex = (window as any).__getCurrentPageParagraphIndex;
        if (getCurrentPageParagraphIndex) {
          try {
            paragraphIndex = await getCurrentPageParagraphIndex();
          } catch (e) {
            console.warn('[ReaderTXTPro] 获取段落索引失败', e);
          }
        }

        // 自动缓存当前页文本（供TTS使用）
        try {
          const getCurrentPageText = (window as any).__getCurrentPageText;
          if (getCurrentPageText) {
            const pageText = getCurrentPageText();
            if (pageText && pageText.trim().length > 0) {
              (window as any).__cachedCurrentPageText = pageText.trim();
              console.log(`[ReaderTXTPro] 自动缓存当前页文本: ${pageText.trim().length} 字符`);
            } else {
              (window as any).__cachedCurrentPageText = null;
            }
          }
        } catch (e) {
          console.warn('[ReaderTXTPro] 自动获取当前页文本失败', e);
          (window as any).__cachedCurrentPageText = null;
        }

      const position: ReadingPosition = {
        currentPage: currentPage.pageNumber,
        totalPages: totalPages,
        progress: progress,
        // 用 startLine 存在 scroll_top 字段，便于后端保存（比 0 更有意义）
        scrollTop: currentPage.startLine,
        // 关键：用 currentLocation 保存稳定位置（跨字号/跨设备不乱）
        currentLocation: `txtline:${currentPage.startLine}`,
          // 段落索引（用于与朗读功能同步）
          paragraphIndex: paragraphIndex,
      };
      
      onProgressChange(progress, position);
    }, 500);
  }, [currentPageIndex, pages, totalPages, onProgressChange]);

  // 组件卸载/切后台时：立即 flush 一次进度（避免"重新打开回到上一页"）
  useEffect(() => {
    const flushNow = async () => {
      try {
        if (progressSaveTimerRef.current) {
          clearTimeout(progressSaveTimerRef.current);
          progressSaveTimerRef.current = null;
        }
        if (pages.length === 0 || totalPages === 0) return;
        const currentPage = pages[currentPageIndex];
        if (!currentPage) return;
        const progress = Math.min(1, Math.max(0, currentPage.pageNumber / totalPages));
        
        // 计算当前页面对应的段落索引
        let paragraphIndex: number | undefined = undefined;
        const getCurrentPageParagraphIndex = (window as any).__getCurrentPageParagraphIndex;
        if (getCurrentPageParagraphIndex) {
          try {
            paragraphIndex = await getCurrentPageParagraphIndex();
          } catch (e) {
            console.warn('[ReaderTXTPro] 获取段落索引失败', e);
          }
        }

        onProgressChange(progress, {
          currentPage: currentPage.pageNumber,
          totalPages,
          progress,
          scrollTop: currentPage.startLine,
          currentLocation: `txtline:${currentPage.startLine}`,
          paragraphIndex: paragraphIndex,
        });
      } catch {
        // ignore
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      flushNow();
    };
  }, [pages, totalPages, currentPageIndex, onProgressChange]);

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
      toast(t('reader.noSearchResults'));
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
  // HTML转义函数，防止XSS攻击
  const escapeHtml = useCallback((text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }, []);

  const highlightText = useCallback((text: string, searchTerm: string): string => {
    if (!searchTerm.trim()) return escapeHtml(text);
    
    // 先转义HTML，防止XSS攻击
    const escapedText = escapeHtml(text);
    const escapedSearchTerm = escapeHtml(searchTerm);
    
    const regex = new RegExp(
      `(${escapedSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    );
    
    return escapedText.replace(regex, '<mark style="background-color: yellow; color: black;">$1</mark>');
  }, [escapeHtml]);

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
      toast(t('reader.bookmarkAlreadyExists'));
      return;
    }

    const newBookmarks = [...bookmarks, newBookmark].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
    saveBookmarks(newBookmarks);
    toast.success(t('reader.bookmarkAdded'));
  }, [pages, currentPageIndex, bookmarks, saveBookmarks]);

  // 删除书签
  const removeBookmark = useCallback((pageNumber: number) => {
    const newBookmarks = bookmarks.filter(b => b.pageNumber !== pageNumber);
    saveBookmarks(newBookmarks);
    toast.success(t('reader.bookmarkDeleted'));
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

    // 检查是否点击了功能条、导航栏等 UI 元素
    if (target && (
      target.closest('.text-selection-toolbar') ||
      target.closest('[data-settings-panel]') ||
      target.closest('[data-toc-panel]') ||
      target.closest('[data-notes-panel]') ||
      target.closest('[data-bookmarks-panel]')
    )) {
      return;
    }

    // 优先检查并隐藏 UI 元素（功能条、导航栏等）
    // 如果隐藏了 UI，则不翻页
    const checkAndHideUI = (window as any).__readerCheckAndHideUI;
    if (checkAndHideUI && typeof checkAndHideUI === 'function') {
      const hasHiddenUI = checkAndHideUI();
      if (hasHiddenUI) {
        // 如果隐藏了 UI，不执行翻页
        return;
      }
    }

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
      style={{
        backgroundColor: themeStyles.bg,
        WebkitTouchCallout: 'none', // 屏蔽iOS长按系统菜单
        WebkitUserSelect: 'none', // 阻止文本选择
        userSelect: 'none'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      onContextMenu={(e) => {
        // 屏蔽浏览器默认右键菜单（阅读器内交互由应用接管）
        e.preventDefault();
      }}
    >
      {/* 阅读内容区域 */}
      <div
        ref={contentRef}
        className="h-full w-full overflow-hidden relative"
        style={{
          transform: `translateX(${touchOffset}px)`,
          transition: touchOffset === 0 && pageTransition === 'none' ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          paddingBottom: showBottomBar ? '30px' : '0',
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
                // 安全修复：对内容进行HTML转义，防止XSS攻击
                __html: showSearch && searchTerm
                  ? highlightText(currentPage.content, searchTerm)
                  : escapeHtml(currentPage.content).replace(/\n/g, '<br/>')
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
              <p style={{ color: themeStyles.text }}>{t('reader.cannotDisplayContent')}</p>
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
              aria-label={t('reader.search')}
            >
              <Search className="w-4 h-4" style={{ color: themeStyles.text }} />
            </button>
            <button
              onClick={() => {
                setShowBookmarks(true);
                showBars();
              }}
              className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 transition-colors"
              aria-label={t('reader.bookmark')}
            >
              <Bookmark className="w-4 h-4" style={{ color: themeStyles.text }} />
            </button>
            <button
              onClick={hasBookmark ? () => removeBookmark(currentPage?.pageNumber || 0) : addBookmark}
              className="p-2 rounded-lg hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 transition-colors"
              aria-label={hasBookmark ? t('reader.deleteBookmark') : t('reader.addBookmark')}
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
              <h2 className="text-xl font-bold">{t('reader.search')}</h2>
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
                placeholder={t('reader.searchPlaceholder')}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">
                    {t('reader.searchResultsFound', { count: searchResults.length })}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={prevSearchResult}
                      className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                    >
                      {t('common.previous')}
                    </button>
                    <button
                      onClick={nextSearchResult}
                      className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                    >
                      {t('common.next')}
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
                      <div className="text-sm font-medium">{t('reader.lineNumber', { line: result.lineIndex + 1 })}</div>
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
              {t('reader.search')}
            </button>
          </div>
        </div>
      )}

      {/* 书签面板 */}
      {showBookmarks && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t('reader.bookmark')}</h2>
              <button onClick={() => setShowBookmarks(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bookmark className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>{t('reader.noBookmarks')}</p>
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
                      <div className="font-medium">{t('reader.pageNumber', { page: bookmark.pageNumber })}</div>
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

