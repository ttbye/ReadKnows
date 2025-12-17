/**
 * @author ttbye
 * Office 文档阅读器（支持 Word、Excel、PowerPoint）
 * 通过后端文本提取功能显示文档内容
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem } from '../../../types/reader';
import { offlineStorage } from '../../../utils/offlineStorage';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { X, Download, FileText, FileSpreadsheet, Presentation } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReaderOfficeProProps {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  onSettingsChange: (settings: ReadingSettings) => void;
  onProgressChange: (progress: number, position: ReadingPosition) => void;
  onTOCChange: (toc: TOCItem[]) => void;
  onClose: () => void;
}

export default function ReaderOfficePro({
  book,
  settings,
  initialPosition,
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
}: ReaderOfficeProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string>('');
  const [contentType, setContentType] = useState<'text' | 'html' | 'markdown'>('text'); // 标记内容类型
  const [error, setError] = useState<string | null>(null);
  const [showBottomBar, setShowBottomBar] = useState(false);

  // 获取文件类型图标
  const getFileIcon = () => {
    const fileType = book.file_type?.toLowerCase();
    if (fileType === 'docx' || fileType === 'doc') {
      return <FileText className="w-8 h-8" />;
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      return <FileSpreadsheet className="w-8 h-8" />;
    } else if (fileType === 'pptx') {
      return <Presentation className="w-8 h-8" />;
    }
    return <FileText className="w-8 h-8" />;
  };

  // 获取文件类型名称
  const getFileTypeName = () => {
    const fileType = book.file_type?.toLowerCase();
    if (fileType === 'docx') return 'Word 文档';
    if (fileType === 'doc') return 'Word 文档（旧版）';
    if (fileType === 'xlsx') return 'Excel 表格';
    if (fileType === 'xls') return 'Excel 表格（旧版）';
    if (fileType === 'pptx') return 'PowerPoint 演示文稿';
    if (fileType === 'md') return 'Markdown 文档';
    return 'Office 文档';
  };

  // 加载文档内容
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const fileType = book.file_type?.toLowerCase();
        
        // 对于 MD 文件，直接获取文本并使用 Markdown 渲染
        if (fileType === 'md') {
          const response = await api.get(`/books/${book.id}/text`, {
            params: { maxLength: 100000 },
          });
          if (response.data && response.data.text) {
            setContent(response.data.text);
            setContentType('markdown');
            setLoading(false);
            return;
          }
        }
        
        // 对于 DOCX 文件，优先尝试获取 Markdown 格式（表格显示更好）
        if (fileType === 'docx') {
          try {
            const markdownResponse = await api.get(`/books/${book.id}/markdown`);
            if (markdownResponse.data && markdownResponse.data.markdown) {
              setContent(markdownResponse.data.markdown);
              setContentType('markdown');
              setLoading(false);
              return;
            }
          } catch (markdownError: any) {
            // 如果 Markdown 获取失败，尝试 HTML
            console.warn('获取Markdown格式失败，尝试HTML格式:', markdownError);
            try {
              const htmlResponse = await api.get(`/books/${book.id}/html`);
              if (htmlResponse.data && htmlResponse.data.html) {
                setContent(htmlResponse.data.html);
                setContentType('html');
                setLoading(false);
                return;
              }
            } catch (htmlError: any) {
              // 如果 HTML 也失败，回退到文本模式
              console.warn('获取HTML格式失败，使用文本格式:', htmlError);
            }
          }
        }
        
        // 对于其他格式或获取失败的情况，使用文本格式
        const response = await api.get(`/books/${book.id}/text`, {
          params: { maxLength: 100000 }, // 获取更多内容用于阅读
        });

        if (response.data && response.data.text) {
          setContent(response.data.text);
          setContentType('text');
        } else {
          throw new Error('无法获取文档内容');
        }
      } catch (err: any) {
        console.error('加载文档内容失败:', err);
        setError(err.response?.data?.error || err.message || '加载文档失败');
        toast.error('加载文档内容失败');
      } finally {
        setLoading(false);
      }
    };

    if (book.id) {
      loadContent();
    }

    // 设置空目录
    onTOCChange([]);
  }, [book.id, onTOCChange]);

  // 处理下载
  const handleDownload = async () => {
    try {
      const ext = book.file_name?.split('.').pop()?.toLowerCase() || book.file_type;
      const downloadUrl = `/books/${book.id}.${ext}`;
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = book.file_name || `${book.title}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('开始下载');
    } catch (error: any) {
      toast.error('下载失败');
    }
  };

  // 主题样式
  const themeStyles = {
    light: { 
      bg: '#ffffff', 
      text: '#000000',
      contentBg: 'rgba(255, 255, 255, 0.85)',
      contentBorder: 'rgba(0, 0, 0, 0.1)',
    },
    dark: { 
      bg: '#1a1a1a', 
      text: '#ffffff',
      contentBg: 'rgba(26, 26, 26, 0.85)',
      contentBorder: 'rgba(255, 255, 255, 0.1)',
    },
    sepia: { 
      bg: '#f4e4bc', 
      text: '#5c4b37',
      contentBg: 'rgba(244, 228, 188, 0.85)',
      contentBorder: 'rgba(92, 75, 55, 0.15)',
    },
    green: { 
      bg: '#c8e6c9', 
      text: '#2e7d32',
      contentBg: 'rgba(200, 230, 201, 0.85)',
      contentBorder: 'rgba(46, 125, 50, 0.15)',
    },
  }[settings.theme];

  const fileType = book.file_type?.toLowerCase();
  const isMarkdown = fileType === 'md';

  // 记录滚动位置（用于 flush / 字号变化后恢复）
  const lastScrollTopRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);

  // 让 MD 的阅读体验更接近 EPUB：顶部导航由 ReaderContainer 统一管理
  // 点击内容区域时，切换 ReaderContainer 的导航栏显示/隐藏
  const handleToggleNavigation = useCallback(() => {
    try {
      const fn = (window as any).__toggleReaderNavigation;
      if (typeof fn === 'function') fn();
    } catch {
      // ignore
    }
  }, []);

  // MD 默认字号兜底：避免过小导致难以阅读（仅在非常小的值时矫正）
  useEffect(() => {
    if (!isMarkdown) return;
    const fs = typeof settings.fontSize === 'number' ? settings.fontSize : 0;
    if (fs > 0 && fs < 16) {
      onSettingsChange({ ...settings, fontSize: 18 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarkdown]);

  // MD：按滚动进度记录/恢复阅读位置（跨设备/跨字号比“页码”稳定）
  useEffect(() => {
    if (!isMarkdown) return;
    const el = contentRef.current;
    if (!el) return;

    // 恢复：优先 scrollTop（px），其次 progress（百分比）
    const restore = () => {
      try {
        const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
        const byPx = typeof initialPosition?.scrollTop === 'number' ? initialPosition!.scrollTop : 0;
        const byProg = typeof initialPosition?.progress === 'number' ? initialPosition!.progress : 0;

        let target = 0;
        if (byPx && byPx > 0) {
          target = Math.max(0, Math.min(maxScroll, byPx));
        } else if (byProg && byProg > 0) {
          target = Math.max(0, Math.min(maxScroll, Math.round(byProg * maxScroll)));
        }

        el.scrollTop = target;
        lastScrollTopRef.current = el.scrollTop;
        lastProgressRef.current = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollTop / maxScroll)) : 0;
      } catch {
        // ignore
      }
    };

    // 内容加载后下一帧恢复，确保 scrollHeight 已稳定
    const t = window.setTimeout(restore, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarkdown, content, settings.fontSize, settings.lineHeight, settings.fontFamily]);

  useEffect(() => {
    if (!isMarkdown) return;
    const el = contentRef.current;
    if (!el) return;

    const emit = () => {
      try {
        const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
        const scrollTop = el.scrollTop || 0;
        const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
        lastScrollTopRef.current = scrollTop;
        lastProgressRef.current = progress;
        onProgressChange(progress, {
          currentPage: 1,
          totalPages: 1,
          progress,
          scrollTop,
          currentLocation: `mdscroll:${Math.round(progress * 100000)}`, // 仅用于调试/可扩展
        });
      } catch {
        // ignore
      }
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(emit);
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    // 初次上报一次（进入书籍即有进度）
    const t = window.setTimeout(emit, 50);

    // flush：切后台/关闭时立即上报，避免回退
    const flushNow = () => emit();
    const onVis = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    const onPageHide = () => flushNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearTimeout(t);
      el.removeEventListener('scroll', onScroll as any);
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      flushNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarkdown, content, onProgressChange]);

  // 暴露“跳转到指定进度/位置”给外部（供跨设备进度跳转）
  useEffect(() => {
    if (!isMarkdown) return;
    (window as any).__readerGoToPosition = (pos: any) => {
      try {
        const el = contentRef.current;
        if (!el) return false;
        const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
        const scrollTop = typeof pos?.scrollTop === 'number' ? pos.scrollTop : null;
        const progress = typeof pos?.progress === 'number' ? pos.progress : null;
        let target = 0;
        if (scrollTop != null && !isNaN(scrollTop)) {
          target = Math.max(0, Math.min(maxScroll, scrollTop));
        } else if (progress != null && !isNaN(progress)) {
          target = Math.max(0, Math.min(maxScroll, Math.round(progress * maxScroll)));
        }
        el.scrollTop = target;
        return true;
      } catch {
        // ignore
      }
      return false;
    };
    return () => {
      delete (window as any).__readerGoToPosition;
    };
  }, [isMarkdown, content]);

  // 隐藏/显示底部栏
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBottomBar(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showBottomBar]);

  if (loading) {
    return (
      <div 
        className="relative h-full w-full flex items-center justify-center"
        style={{ backgroundColor: themeStyles.bg, color: themeStyles.text }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current mx-auto mb-4"></div>
          <p>正在加载文档...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="relative h-full w-full flex items-center justify-center p-4"
        style={{ backgroundColor: themeStyles.bg, color: themeStyles.text }}
      >
        <div className="text-center max-w-md">
          <div className="mb-4 flex justify-center text-red-500">
            {getFileIcon()}
          </div>
          <h2 className="text-xl font-bold mb-2">加载失败</h2>
          <p className="text-sm mb-4">{error}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
            >
              返回
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              下载文档
            </button>
          </div>
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
        color: themeStyles.text,
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        boxSizing: 'border-box',
      }}
      onClick={() => {
        // MD：交给 ReaderContainer 统一控制顶部/侧栏等
        if (isMarkdown) {
          handleToggleNavigation();
        } else {
          // 其他 Office：保留原行为
          setShowBottomBar(!showBottomBar);
        }
      }}
    >
      {/* 非 MD：保留原有顶部栏 */}
      {!isMarkdown && showBottomBar && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4"
          style={{
            backgroundColor: themeStyles.bg,
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="flex-1 text-center">
            <h2 className="text-sm font-semibold truncate">{book.title}</h2>
            <p className="text-xs opacity-70">{getFileTypeName()}</p>
          </div>
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
          >
            <Download className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 内容区域 */}
      <div
        ref={contentRef}
        className={`h-full overflow-y-auto ${
          isMarkdown
            ? 'px-4 sm:px-6 md:px-10 py-6 sm:py-7 md:py-8'
            : 'p-4 md:p-8 lg:p-12'
        }`}
        style={{
          // ReaderContainer 已处理顶部工具栏高度与安全区；这里不再重复 top padding
          paddingTop: isMarkdown
            ? '16px'
            : showBottomBar
              ? 'calc(80px + env(safe-area-inset-top, 0px))'
              : 'env(safe-area-inset-top, 0px)',
          paddingBottom: isMarkdown
            ? '32px'
            : showBottomBar
              ? 'calc(80px + env(safe-area-inset-bottom, 0px))'
              : 'env(safe-area-inset-bottom, 0px)',
          // 给 MD 一个稳定的左右页边距（并兼容刘海/圆角屏 safe-area）
          paddingLeft: isMarkdown ? 'max(env(safe-area-inset-left, 0px), 16px)' : 'env(safe-area-inset-left, 0px)',
          paddingRight: isMarkdown ? 'max(env(safe-area-inset-right, 0px), 16px)' : 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div
          className={`${isMarkdown ? 'max-w-3xl' : 'max-w-4xl'} mx-auto`}
          style={{
            fontFamily: settings.fontFamily,
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            color: themeStyles.text,
          }}
        >
          {/* 非 MD：保留文档标题卡片；MD：更接近 EPUB 的“纯阅读” */}
          {!isMarkdown && (
            <div
              className="prose prose-lg dark:prose-invert rounded-2xl p-6 md:p-8 lg:p-10 shadow-xl"
              style={{
                color: themeStyles.text,
                backgroundColor: themeStyles.contentBg,
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: `1px solid ${themeStyles.contentBorder}`,
                boxShadow:
                  settings.theme === 'dark'
                    ? '0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.2)'
                    : '0 20px 60px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.08)',
              }}
            >
              <div className="mb-8 pb-4 border-b" style={{ borderColor: themeStyles.contentBorder }}>
                <div className="flex items-center gap-3 mb-2">
                  {getFileIcon()}
                  <h1 className="text-3xl font-bold m-0" style={{ color: themeStyles.text }}>
                    {book.title}
                  </h1>
                </div>
                <p className="text-sm opacity-70" style={{ color: themeStyles.text }}>
                  {getFileTypeName()}
                </p>
              </div>

              {/* 非 MD 的内容渲染 */}
              {contentType === 'markdown' ? (
                <div
                  className="prose prose-lg dark:prose-invert max-w-none"
                  style={{
                    fontFamily: settings.fontFamily,
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    color: themeStyles.text,
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              ) : contentType === 'html' ? (
                <div
                  className="docx-content"
                  style={{
                    fontFamily: settings.fontFamily,
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    color: themeStyles.text,
                  }}
                >
                  <div dangerouslySetInnerHTML={{ __html: content }} />
                </div>
              ) : (
                <div
                  className="whitespace-pre-wrap break-words"
                  style={{
                    fontFamily: settings.fontFamily,
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    color: themeStyles.text,
                  }}
                >
                  {content.split('\n').map((line, index) => (
                    <p key={index} className="mb-2" style={{ color: themeStyles.text }}>
                      {line || '\u00A0'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MD：用更轻量的 prose，背景直接跟随主题（更接近 EPUB） */}
          {isMarkdown && (
            <div
              className="prose prose-base md:prose-lg dark:prose-invert max-w-none rounded-2xl px-5 sm:px-6 md:px-8 py-6 sm:py-7 md:py-8"
              style={{
                color: themeStyles.text,
                backgroundColor: settings.theme === 'dark' ? 'rgba(17, 24, 39, 0.35)' : 'rgba(255, 255, 255, 0.65)',
                border: `1px solid ${themeStyles.contentBorder}`,
                backdropFilter: 'blur(14px) saturate(160%)',
                WebkitBackdropFilter: 'blur(14px) saturate(160%)',
              }}
            >
              <style>{`
                .prose {
                  color: ${themeStyles.text} !important;
                  max-width: none;
                  line-height: ${settings.lineHeight};
                }
                .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
                  color: ${themeStyles.text} !important;
                  letter-spacing: -0.01em;
                }
                .prose h1 {
                  font-size: 1.8em;
                  line-height: 1.2;
                  margin-top: 0.2em;
                  margin-bottom: 0.6em;
                }
                .prose h2 { margin-top: 1.4em; margin-bottom: 0.6em; }
                .prose h3 { margin-top: 1.2em; margin-bottom: 0.5em; }
                .prose p, .prose li, .prose td, .prose th {
                  color: ${themeStyles.text} !important;
                }
                .prose p { margin-top: 0.65em; margin-bottom: 0.65em; }
                .prose ul, .prose ol { margin-top: 0.6em; margin-bottom: 0.9em; }
                .prose li { margin-top: 0.25em; margin-bottom: 0.25em; }
                .prose hr { border-color: ${themeStyles.contentBorder}; opacity: 0.8; }
                .prose a { color: ${settings.theme === 'dark' ? '#60a5fa' : '#2563eb'}; text-decoration: none; }
                .prose a:hover { text-decoration: underline; }
                .prose code {
                  background-color: ${settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)'};
                  color: ${themeStyles.text};
                  padding: 0.15em 0.35em;
                  border-radius: 0.4em;
                }
                .prose pre {
                  background-color: ${settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.06)'};
                  border: 1px solid ${themeStyles.contentBorder};
                  border-radius: 0.9em;
                  padding: 0.95em 1.05em;
                }
                .prose blockquote {
                  border-left-color: ${settings.theme === 'dark' ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.15)'};
                  background: ${settings.theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'};
                  border-radius: 0.75em;
                  padding: 0.75em 0.9em;
                }
                .prose img { border-radius: 0.75em; }
                .prose table { font-size: 0.95em; }
              `}</style>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }: any) => (
                    <div className="overflow-x-auto my-4 rounded-lg" style={{ border: `1px solid ${themeStyles.contentBorder}` }}>
                      <table className="min-w-full border-collapse">{children}</table>
                    </div>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* 非 MD：底部提示保留 */}
      {!isMarkdown && !showBottomBar && (
        <div
          className="absolute left-1/2 transform -translate-x-1/2 text-xs opacity-50"
          style={{
            bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          点击屏幕显示/隐藏工具栏
        </div>
      )}
    </div>
  );
}

