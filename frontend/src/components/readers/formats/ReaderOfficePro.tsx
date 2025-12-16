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
        // 确保内容区域不会被安全区域遮挡（左右边距）
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        boxSizing: 'border-box',
      }}
      onClick={() => setShowBottomBar(!showBottomBar)}
    >
      {/* 顶部栏 */}
      {showBottomBar && (
        <div 
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4"
          style={{ 
            backgroundColor: themeStyles.bg,
            // 顶部安全区域
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
        className="h-full overflow-y-auto p-4 md:p-8 lg:p-12"
        style={{ 
          paddingTop: showBottomBar ? 'calc(80px + env(safe-area-inset-top, 0px))' : 'env(safe-area-inset-top, 0px)',
          paddingBottom: showBottomBar ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div 
          className="max-w-4xl mx-auto prose prose-lg dark:prose-invert rounded-2xl p-6 md:p-8 lg:p-10 shadow-xl"
          style={{
            fontSize: `${settings.fontSize}px`,
            fontFamily: settings.fontFamily,
            lineHeight: settings.lineHeight,
            color: themeStyles.text,
            backgroundColor: themeStyles.contentBg,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: `1px solid ${themeStyles.contentBorder}`,
            boxShadow: settings.theme === 'dark' 
              ? '0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.2)'
              : '0 20px 60px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* 文档标题 */}
          <div 
            className="mb-8 pb-4 border-b"
            style={{ borderColor: themeStyles.contentBorder }}
          >
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

          {/* 文档内容 */}
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
              <style>{`
                .prose {
                  color: ${themeStyles.text} !important;
                }
                .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
                  color: ${themeStyles.text} !important;
                }
                .prose p, .prose li, .prose td, .prose th {
                  color: ${themeStyles.text} !important;
                }
                .prose code {
                  background-color: ${settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
                  color: ${themeStyles.text};
                }
                .prose pre {
                  background-color: ${settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)'};
                  border: 1px solid ${themeStyles.contentBorder};
                }
              `}</style>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // 自定义表格样式
                  table: ({ children }: any) => (
                    <div className="overflow-x-auto my-4 rounded-lg" style={{ 
                      border: `1px solid ${themeStyles.contentBorder}`,
                    }}>
                      <table className="min-w-full border-collapse" style={{
                        borderColor: themeStyles.contentBorder,
                      }}>
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }: any) => (
                    <thead style={{ 
                      backgroundColor: settings.theme === 'dark' 
                        ? 'rgba(255, 255, 255, 0.1)' 
                        : 'rgba(0, 0, 0, 0.05)',
                    }}>
                      {children}
                    </thead>
                  ),
                  tbody: ({ children }: any) => (
                    <tbody>{children}</tbody>
                  ),
                  tr: ({ children }: any) => (
                    <tr style={{ borderColor: themeStyles.contentBorder }}>
                      {children}
                    </tr>
                  ),
                  th: ({ children }: any) => (
                    <th 
                      className="px-4 py-2 text-left font-semibold"
                      style={{
                        borderColor: themeStyles.contentBorder,
                        color: themeStyles.text,
                      }}
                    >
                      {children}
                    </th>
                  ),
                  td: ({ children }: any) => (
                    <td 
                      className="px-4 py-2"
                      style={{
                        borderColor: themeStyles.contentBorder,
                        color: themeStyles.text,
                      }}
                    >
                      {children}
                    </td>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
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
              <style>{`
                .docx-content * {
                  color: ${themeStyles.text} !important;
                }
                .docx-content table {
                  border-color: ${themeStyles.contentBorder} !important;
                }
                .docx-content table th {
                  background-color: ${settings.theme === 'dark' 
                    ? 'rgba(255, 255, 255, 0.1)' 
                    : 'rgba(0, 0, 0, 0.05)'} !important;
                }
                .docx-content table td {
                  border-color: ${themeStyles.contentBorder} !important;
                }
              `}</style>
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
      </div>

      {/* 底部提示 */}
      {!showBottomBar && (
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

