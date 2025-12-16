/**
 * @author ttbye
 * 阅读器容器组件
 * 提供统一的阅读器界面，包括顶部工具栏、底部导航栏、目录等
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { ReaderConfig, ReadingPosition, TOCItem } from '../../types/reader';
import ReaderEPUBPro from './formats/ReaderEPUBPro';
import ReaderPDFPro from './formats/ReaderPDFPro';
import ReaderTXTPro from './formats/ReaderTXTPro';
import ReaderOfficePro from './formats/ReaderOfficePro';
import BottomNavigation from './BottomNavigation';
import BottomInfoBar, { getInfoBarHeight } from './BottomInfoBar';
import TOCPanel from './TOCPanel';
import ReadingSettingsPanel from './ReadingSettingsPanel';
import NotesPanel from './NotesPanel';
import TextSelectionToolbar from './TextSelectionToolbar';
import CreateNoteModal from './CreateNoteModal';

export default function ReaderContainer({ config }: { config: ReaderConfig }) {
  const [showBottomNav, setShowBottomNav] = useState(false); // 底部栏默认隐藏，只有点击设置时才显示
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [, setBookNotes] = useState<any[]>([]);
  const [currentPosition, setCurrentPosition] = useState<ReadingPosition>({
    currentPage: 1,
    totalPages: 1,
    progress: 0,
  });
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [infoBarHeight, setInfoBarHeight] = useState(34); // 默认移动端高度
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // 显示底部设置导航栏
  const showBottomNavigation = useCallback(() => {
    setShowBottomNav(true);
    
    // 清除之前的隐藏定时器
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    
    // 3秒后自动隐藏底部导航栏（顶部栏始终显示）
    hideTimerRef.current = setTimeout(() => {
      setShowBottomNav(false);
    }, 3000);
  }, []);

  // 隐藏底部导航栏
  const hideBottomNavigation = useCallback(() => {
    setShowBottomNav(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
  }, []);

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

  // 处理点击屏幕中心区域（PC端用）
  const handleCenterClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 只处理直接点击容器的事件，不处理子元素的事件
    if (e.target !== e.currentTarget) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 定义中心区域：屏幕中间 40% 的宽度和高度
    const centerXStart = rect.width * 0.3;
    const centerXEnd = rect.width * 0.7;
    const centerYStart = rect.height * 0.3;
    const centerYEnd = rect.height * 0.7;
    
    // 检查点击是否在中心区域
    if (x >= centerXStart && x <= centerXEnd && y >= centerYStart && y <= centerYEnd) {
      toggleNavigationBar();
    }
  }, [toggleNavigationBar]);


  // 处理进度变化
  const handleProgressChange = useCallback((progress: number, position: ReadingPosition) => {
    setCurrentPosition(position);
    config.onProgressChange(progress, position);
  }, [config]);

  // 处理添加笔记
  const handleAddNote = useCallback((text: string) => {
    setSelectedText(text);
    setShowCreateNoteModal(true);
    setShowSelectionToolbar(false);
    // 清除文本选择
    window.getSelection()?.removeAllRanges();
  }, []);

  // 处理翻页
  const handlePageTurn = useCallback((direction: 'prev' | 'next') => {
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
              <p className="text-lg mb-2">不支持的格式</p>
              <p className="text-sm text-gray-500">{config.book.file_type}</p>
            </div>
          </div>
        );
    }
  };

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000' },
    dark: { bg: '#1a1a1a', text: '#ffffff' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37' },
    green: { bg: '#c8e6c9', text: '#2e7d32' },
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
        setBookNotes(response.data.notes || []);
      } catch (error) {
        console.error('获取书籍笔记失败:', error);
      }
    };
    if (config.book.id) {
      fetchBookNotes();
    }
  }, [config.book.id]);

  // 处理文本选择
  useEffect(() => {
    const handleMouseUp = (_e: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setShowSelectionToolbar(false);
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        setShowSelectionToolbar(false);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelectedText(selectedText);
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
      setShowSelectionToolbar(true);
    };

    const handleClick = (_e: MouseEvent) => {
      // 如果点击的不是选择工具栏，则隐藏工具栏
      if (!(_e.target as HTMLElement).closest('.text-selection-toolbar')) {
        const selection = window.getSelection();
        if (selection && selection.isCollapsed) {
          setShowSelectionToolbar(false);
        }
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick);
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
      {/* 顶部工具栏 - 始终显示，固定高度48px */}
      <div
        className="absolute left-0 right-0 z-30"
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
            onClick={config.onClose}
            className="p-2 hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 rounded-lg transition-colors"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 text-center px-4">
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

          <div className="flex items-center gap-2">
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
              aria-label="设置"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 阅读区域 - 响应式布局，留出顶部导航栏和底部信息栏空间 */}
      <div 
        className="flex-1 relative overflow-hidden w-full" 
        style={{ 
          minHeight: 0,
          // 根据设备类型动态计算顶部间距
          paddingTop: getReadingAreaPaddingTop(),
          // 动态计算底部预留空间
          // 注意：
          // 1. 底部信息栏：外层容器通过paddingBottom处理了安全区域，所以实际高度 = infoBarHeight + 安全区域
          // 2. 底部导航栏：如果显示在信息栏上方，定位在 infoBarHeight + 安全区域 的位置
          //                如果单独显示，自己通过paddingBottom处理安全区域
          // 3. 阅读区域需要预留它们的高度，不需要再加安全区域（因为它们已经处理了）
          // 所以阅读区域需要预留：
          // - 如果显示底部信息栏：infoBarHeight + 安全区域（信息栏外层有paddingBottom）
          // - 如果显示设置导航栏：额外 + 82px（导航栏实际高度，不包含安全区域）
          // - 如果不显示信息栏但显示导航栏：82px + 安全区域（导航栏自己处理安全区域）
          // - 如果都不显示：安全区域（避免内容被系统UI遮挡）
          paddingBottom: config.settings.showBottomInfoBar
            ? (showBottomNav 
                ? `calc(${infoBarHeight}px + 82px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))` 
                : `calc(${infoBarHeight}px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`)
            : (showBottomNav 
                ? `calc(82px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))` 
                : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)'),
        }}
      >
        {renderReader()}
      </div>

      {/* 底部信息栏 - 根据设置显示/隐藏 */}
      {config.settings.showBottomInfoBar && (
        <BottomInfoBar
          book={config.book}
          position={currentPosition}
          settings={config.settings}
        />
      )}

      {/* 底部导航栏 - 可自动隐藏，显示在底部信息栏上方 */}
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
            showBottomNavigation();
          }
        }}
        onToggleNotes={() => {
          setShowNotes(!showNotes);
          showBottomNavigation();
        }}
        onPageTurn={handlePageTurn}
        onMouseEnter={() => {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        }}
        onMouseLeave={() => {
          if (showBottomNav) {
            hideTimerRef.current = setTimeout(() => {
              hideBottomNavigation();
            }, 3000);
          }
        }}
      />

      {/* 目录面板 */}
      {showTOC && (
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
            }
            setShowTOC(false);
          }}
        />
      )}

      {/* 设置面板 */}
      {showSettings && (
        <ReadingSettingsPanel
          settings={config.settings}
          bookType={config.book.file_type}
          onSettingsChange={config.onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 笔记面板 */}
      {showNotes && (
        <NotesPanel
          bookId={config.book.id}
          currentPage={currentPosition.currentPage}
          currentChapterIndex={currentPosition.chapterIndex}
          selectedText={selectedText}
          isVisible={showNotes}
          onClose={() => {
            setShowNotes(false);
            setSelectedText('');
          }}
          onNoteClick={(note) => {
            // 点击笔记时可以跳转到对应位置
            setShowNotes(false);
          }}
        />
      )}

      {/* 文本选择工具栏 */}
      {showSelectionToolbar && selectionPosition && (
        <div className="text-selection-toolbar">
          <TextSelectionToolbar
            selectedText={selectedText}
            position={selectionPosition}
            onAddNote={handleAddNote}
            onClose={() => {
              setShowSelectionToolbar(false);
              window.getSelection()?.removeAllRanges();
            }}
          />
        </div>
      )}

      {/* 笔记创建模态框 */}
      <CreateNoteModal
        isVisible={showCreateNoteModal}
        bookId={config.book.id}
        selectedText={selectedText}
        currentPage={currentPosition.currentPage}
        chapterIndex={currentPosition.chapterIndex}
        onClose={() => {
          setShowCreateNoteModal(false);
          setSelectedText('');
        }}
        onSuccess={() => {
          // 笔记创建成功后的回调，可以在这里刷新笔记列表等
          // 如果需要刷新笔记面板，可以在这里处理
        }}
      />
    </div>
  );
}
