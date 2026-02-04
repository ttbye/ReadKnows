/**
 * @author ttbye
 * Office 文档阅读器（支持 Word、Excel、PowerPoint）
 * 使用 docx-preview 和 xlsx 插件预览文档内容
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem } from '../../../types/reader';
import { offlineStorage } from '../../../utils/offlineStorage';
import api from '../../../utils/api';
import { getFontFamily } from '../common/theme/themeManager';
import toast from 'react-hot-toast';
import { X, Download, FileText, FileSpreadsheet, Presentation } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderAsync } from 'docx-preview';
import * as XLSX from 'xlsx';

interface ReaderOfficeProProps {
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

export default function ReaderOfficePro({
  book,
  settings,
  initialPosition,
  customFonts = [],
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
}: ReaderOfficeProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string>('');
  const [contentType, setContentType] = useState<'text' | 'html' | 'markdown' | 'docx' | 'xlsx' | 'pptx'>('text'); // 标记内容类型
  const [error, setError] = useState<string | null>(null);
  const docxBlobRef = useRef<Blob | null>(null); // 保存 DOCX blob，等待 ref 准备好后渲染
  const [isMobile, setIsMobile] = useState(false); // 检测是否为移动端

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
        
        // 对于 DOCX 文件，使用 docx-preview 预览
        if (fileType === 'docx') {
          try {
            const response = await api.get(`/books/${book.id}/download`, {
              responseType: 'blob',
            });
            const blob = new Blob([response.data], {
              type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });
            
            // 保存 blob，等待 ref 准备好后渲染
            docxBlobRef.current = blob;
            // 先设置 contentType，让组件渲染出 ref 容器
            setContentType('docx');
            setLoading(false);
            // 渲染会在 useEffect 中完成
            return;
          } catch (docxError: any) {
            // 安全修复：仅在开发环境输出错误信息
            if (import.meta.env.DEV) {
              console.warn('使用docx-preview预览失败，尝试其他格式:', docxError);
            }
            // 如果预览失败，回退到原来的方式
          try {
            const markdownResponse = await api.get(`/books/${book.id}/markdown`);
            if (markdownResponse.data && markdownResponse.data.markdown) {
              setContent(markdownResponse.data.markdown);
              setContentType('markdown');
              setLoading(false);
              return;
            }
          } catch (markdownError: any) {
            // 安全修复：仅在开发环境输出错误信息
            if (import.meta.env.DEV) {
              console.warn('获取Markdown格式失败，尝试HTML格式:', markdownError);
            }
            try {
              const htmlResponse = await api.get(`/books/${book.id}/html`);
              if (htmlResponse.data && htmlResponse.data.html) {
                setContent(htmlResponse.data.html);
                setContentType('html');
                setLoading(false);
                return;
              }
            } catch (htmlError: any) {
              // 安全修复：仅在开发环境输出错误信息
              if (import.meta.env.DEV) {
                console.warn('获取HTML格式失败，使用文本格式:', htmlError);
              }
              }
            }
          }
        }
        
        // 对于 XLSX/XLS 文件，使用 xlsx 解析并显示
        if (fileType === 'xlsx' || fileType === 'xls') {
          try {
            const response = await api.get(`/books/${book.id}/download`, {
              responseType: 'arraybuffer',
            });
            const workbook = XLSX.read(response.data, { type: 'array' });
            
            // 生成HTML表格
            let htmlContent = '<div class="excel-preview">';
            workbook.SheetNames.forEach((sheetName, index) => {
              const worksheet = workbook.Sheets[sheetName];
              const html = XLSX.utils.sheet_to_html(worksheet);
              htmlContent += `<div class="excel-sheet ${index > 0 ? 'mt-8' : ''}">`;
              htmlContent += `<h3 class="text-lg font-semibold mb-4">${sheetName}</h3>`;
              htmlContent += html;
              htmlContent += '</div>';
            });
            htmlContent += '</div>';
            
            setContent(htmlContent);
            setContentType('xlsx');
            setLoading(false);
            return;
          } catch (xlsxError: any) {
            // 安全修复：仅在开发环境输出错误信息
            if (import.meta.env.DEV) {
              console.warn('使用xlsx预览失败，使用文本格式:', xlsxError);
            }
            // 如果预览失败，回退到文本格式
          }
        }
        
        // 对于 PPTX 文件，暂时使用文本格式（后续可以添加pptx预览支持）
        if (fileType === 'pptx') {
          // TODO: 添加 PPTX 预览支持
          // 目前使用文本格式
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
        // 安全修复：仅在开发环境输出详细错误信息
        if (import.meta.env.DEV) {
          console.error('加载文档内容失败:', err);
        }
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

  // 从DOCX文档中提取目录
  const extractTOCFromDocx = useCallback((container: HTMLElement) => {
    try {
      const tocItems: TOCItem[] = [];
      // 查找所有标题元素（h1-h6）
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6, .docx-wrapper h1, .docx-wrapper h2, .docx-wrapper h3, .docx-wrapper h4, .docx-wrapper h5, .docx-wrapper h6');
      
      headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName.charAt(1)) || 1;
        const title = heading.textContent?.trim() || '';
        if (title) {
          // 尝试找到对应的页面或位置
          const pageElement = heading.closest('.docx-page');
          const pageNumber = pageElement ? Array.from(container.querySelectorAll('.docx-page')).indexOf(pageElement) + 1 : 0;
          
          tocItems.push({
            id: `toc-${index}`,
            title: title,
            href: `page=${pageNumber}`,
            level: level,
          });
        }
      });
      
      if (tocItems.length > 0) {
        onTOCChange(tocItems);
      } else {
        onTOCChange([]);
      }
    } catch (error) {
      console.error('提取DOCX目录失败:', error);
      onTOCChange([]);
    }
  }, [onTOCChange]);

  // 当 DOCX ref 准备好后，渲染文档
  useEffect(() => {
    if (contentType === 'docx' && docxBlobRef.current) {
      const renderDocx = async (retryCount = 0) => {
        // 检查 ref 是否存在，如果不存在则重试
        if (!docxPreviewRef.current) {
          if (retryCount < 10) {
            // 最多重试10次，每次等待100ms
            setTimeout(() => renderDocx(retryCount + 1), 100);
            return;
          } else {
            console.error('DOCX 预览容器未准备好');
            setError('无法加载文档内容：预览容器未准备好');
            return;
          }
        }

        // 再次确认 ref 和 blob 都存在
        if (!docxBlobRef.current || !docxPreviewRef.current) {
          console.error('DOCX 数据或容器不存在');
          return;
        }

        try {
          const container = docxPreviewRef.current;
          const blob = docxBlobRef.current;
          
          // 清空容器
          container.innerHTML = '';
          
          // 渲染文档
          await renderAsync(blob, container, undefined, {
            className: '',
            inWrapper: true,
            ignoreWidth: false, // 保留文档的原始宽度和页边距设置
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true, // 启用分页，根据文档的分页方式分页
            ignoreLastRenderedPageBreak: false, // 保留最后一页的分页符
          });
          
          // 渲染完成后提取目录
          setTimeout(() => {
            extractTOCFromDocx(container);
          }, 500);
        } catch (error) {
          console.error('渲染 DOCX 失败:', error);
          // 如果渲染失败，回退到其他格式
          docxBlobRef.current = null;
          setContentType('text');
          // 尝试获取文本格式
          api.get(`/books/${book.id}/text`, {
            params: { maxLength: 100000 },
          }).then((response) => {
            if (response.data && response.data.text) {
              setContent(response.data.text);
              setContentType('text');
            }
          }).catch(() => {
            setError('无法加载文档内容');
          });
        }
      };
      
      // 等待一小段时间确保 DOM 已更新
      const timer = setTimeout(() => renderDocx(0), 50);
      return () => clearTimeout(timer);
    }
  }, [contentType, book.id, settings.readerWidth, extractTOCFromDocx]);

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

  // 缩放比例（从 settings 读取，默认100%）
  const zoom = settings.officeZoom ?? 100;

  const fileType = book.file_type?.toLowerCase();
  const isMarkdown = fileType === 'md';

  // 检测移动端和平板（包括iPad）
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      const userAgent = navigator.userAgent.toLowerCase();
      const isIPad = /ipad/.test(userAgent) || (userAgent.includes('macintosh') && 'ontouchend' in document);
      // iPad或宽度小于1024的设备都视为移动/平板设备
      setIsMobile(width < 1024 || isIPad);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 判断是否为PC端（桌面设备，不包括iPad）
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024 && !(/ipad/.test(navigator.userAgent.toLowerCase()) || (navigator.userAgent.toLowerCase().includes('macintosh') && 'ontouchend' in document));
  
  // 计算父容器的左右padding总和（用于缩放计算）
  const getParentPadding = () => {
    if (isMobile) {
      return typeof window !== 'undefined' && window.innerWidth < 768 ? '1rem' : '2rem'; // 0.5rem * 2 = 1rem, 1rem * 2 = 2rem
    }
    return isDesktop ? '4rem' : '3rem'; // 2rem * 2 = 4rem, 1.5rem * 2 = 3rem
  };
  const parentPadding = getParentPadding();
  
  // 获取阅读区域宽度样式
  const getReaderWidthStyle = () => {
    if (!isDesktop) {
      // 移动端和平板：始终全宽
      return { width: '100%', maxWidth: '100%', margin: '0' };
    }
    
    // PC端：根据设置选择
    if (settings.readerWidth === 'centered') {
      return {
        width: '980px',
        maxWidth: '980px',
        margin: '0 auto', // 居中显示
      };
    } else {
      return {
        width: '100%',
        maxWidth: '100%',
        margin: '0',
      };
    }
  };

  // 记录滚动位置（用于 flush / 字号变化后恢复）
  const lastScrollTopRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);
  const totalPagesRef = useRef<number>(1);
  const currentPageRef = useRef<number>(1);

  // 让 Office 文档的阅读体验更接近 EPUB：顶部导航由 ReaderContainer 统一管理
  // 点击内容区域时，切换 ReaderContainer 的导航栏显示/隐藏
  const handleToggleNavigation = useCallback(() => {
    try {
      const fn = (window as any).__toggleReaderNavigation;
      if (typeof fn === 'function') fn();
    } catch {
      // ignore
    }
  }, []);

  // 默认字号兜底：避免过小导致难以阅读（仅在非常小的值时矫正）
  useEffect(() => {
    const fs = typeof settings.fontSize === 'number' ? settings.fontSize : 0;
    if (fs > 0 && fs < 16) {
      onSettingsChange({ ...settings, fontSize: 18 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算总页数（基于内容高度和视口高度）
  const calculateTotalPages = useCallback((scrollHeight: number, clientHeight: number): number => {
    if (scrollHeight <= clientHeight) return 1;
    return Math.ceil(scrollHeight / clientHeight);
  }, []);

  // 计算当前页码（基于滚动位置）
  const calculateCurrentPage = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number): number => {
    if (scrollHeight <= clientHeight) return 1;
    const pageHeight = clientHeight;
    const currentPage = Math.floor(scrollTop / pageHeight) + 1;
    const totalPages = Math.ceil(scrollHeight / pageHeight);
    return Math.min(currentPage, totalPages);
  }, []);

  // 按滚动进度记录/恢复阅读位置（跨设备/跨字号比"页码"稳定）
  useEffect(() => {
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
  }, [content, settings.fontSize, settings.lineHeight, settings.fontFamily]);

  // 阅读进度跟踪和页码计算
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const emit = () => {
      try {
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;
        const maxScroll = Math.max(1, scrollHeight - clientHeight);
        const scrollTop = el.scrollTop || 0;
        const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
        
        // 计算页码
        const totalPages = calculateTotalPages(scrollHeight, clientHeight);
        const currentPage = calculateCurrentPage(scrollTop, scrollHeight, clientHeight);
        
        lastScrollTopRef.current = scrollTop;
        lastProgressRef.current = progress;
        totalPagesRef.current = totalPages;
        currentPageRef.current = currentPage;
        
        onProgressChange(progress, {
          currentPage,
          totalPages,
          progress,
          scrollTop,
          currentLocation: `office:${Math.round(progress * 100000)}`,
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
  }, [content, onProgressChange, calculateTotalPages, calculateCurrentPage]);

  // 暴露"跳转到指定进度/位置"给外部（供跨设备进度跳转）
  useEffect(() => {
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
  }, [content]);

  // 暴露翻页功能给 ReaderContainer
  useEffect(() => {
    (window as any).__readerPageTurn = (direction: 'prev' | 'next') => {
      const el = contentRef.current;
      if (!el) return;
      
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;
      const pageHeight = clientHeight;
      const currentScrollTop = el.scrollTop;
      
      if (direction === 'next') {
        const nextScrollTop = Math.min(
          scrollHeight - clientHeight,
          currentScrollTop + pageHeight * 0.8 // 翻页80%的高度
        );
        el.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
      } else {
        const prevScrollTop = Math.max(
          0,
          currentScrollTop - pageHeight * 0.8
        );
        el.scrollTo({ top: prevScrollTop, behavior: 'smooth' });
      }
    };
    
    return () => {
      delete (window as any).__readerPageTurn;
    };
  }, []);

  // 暴露"跳转到指定页面"给外部（供目录跳转使用）
  useEffect(() => {
    (window as any).__officeGoToPage = (pageNumber: number) => {
      try {
        const el = contentRef.current;
        if (!el) return false;
        
        // 查找对应的页面元素
        const pages = el.querySelectorAll('.docx-page');
        if (pages.length === 0) {
          // 如果没有分页，使用滚动位置
          const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
          const targetScroll = Math.max(0, Math.min(maxScroll, (pageNumber - 1) * el.clientHeight));
          el.scrollTo({ top: targetScroll, behavior: 'smooth' });
          return true;
        }
        
        const targetPage = pages[pageNumber - 1];
        if (targetPage) {
          targetPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    // 暴露"根据进度百分比跳转"给外部（供进度跳转功能使用）
    (window as any).__officeGoToProgress = (progress: number) => {
      try {
        const el = contentRef.current;
        if (!el) return false;
        
        if (typeof progress !== 'number' || isNaN(progress) || progress < 0 || progress > 1) {
          return false;
        }

        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;
        const maxScroll = Math.max(1, scrollHeight - clientHeight);
        const targetScroll = progress * maxScroll;
        
        el.scrollTo({ top: targetScroll, behavior: 'smooth' });
        return true;
      } catch {
        // ignore
      }
      return false;
    };

    return () => {
      delete (window as any).__officeGoToPage;
      delete (window as any).__officeGoToProgress;
    };
  }, []);

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
        WebkitTouchCallout: 'none', // 屏蔽iOS长按系统菜单
        WebkitUserSelect: 'none', // 阻止文本选择
        userSelect: 'none'
      }}
      onClick={() => {
        // 统一使用 ReaderContainer 的导航栏控制
          handleToggleNavigation();
      }}
      onContextMenu={(e) => {
        // 屏蔽浏览器默认右键菜单（阅读器内交互由应用接管）
        e.preventDefault();
      }}
    >
      {/* 移除自己的顶部栏，使用 ReaderContainer 的统一导航栏 */}

      {/* 内容区域 */}
      <div
        ref={contentRef}
        className="h-full overflow-y-auto relative"
        style={{
          // ReaderContainer 已处理顶部工具栏高度（48px）和底部导航栏/信息栏高度
          // 这里只需要添加内容区域的上下内边距，不需要再加工具栏高度
          // 顶部：添加内容区域的内边距
          paddingTop: isMobile ? '1rem' : '1.5rem',
          // 底部：添加内容区域的内边距，ReaderContainer 已预留底部导航栏空间
          // 但为了确保内容不被遮挡，额外添加一些底部间距
          paddingBottom: isMobile ? '1rem' : '1.5rem',
          // 阅读内容需要左右页边距，同时考虑安全区域
          // 移动端（手机，<768px）：添加最小页边距（0.5rem）
          // iPad/平板（768px-1023px）：使用中等页边距（1rem）
          // PC端（>=1024px且非iPad）：需要更大的页边距（2rem）
          paddingLeft: `max(env(safe-area-inset-left, 0px), ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 768 ? '0.5rem' : '1rem') : isDesktop ? '2rem' : '1.5rem'})`,
          paddingRight: `max(env(safe-area-inset-right, 0px), ${isMobile ? (typeof window !== 'undefined' && window.innerWidth < 768 ? '0.5rem' : '1rem') : isDesktop ? '2rem' : '1.5rem'})`,
          marginLeft: 0,
          marginRight: 0,
          // 确保内容区域背景色与主题一致
          backgroundColor: themeStyles.bg,
          // 始终允许横向滚动，以便查看宽表格和缩放后的内容
          overflowX: 'auto',
        }}
      >
        <div
          className="w-full"
          style={{
            fontFamily: getFontFamily(settings.fontFamily),
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            color: themeStyles.text,
            boxSizing: 'border-box',
            // 确保背景色与主题一致
            backgroundColor: themeStyles.bg,
            // 应用阅读宽度设置
            ...getReaderWidthStyle(),
            // 内容容器本身不需要额外的左右间距，外层容器已处理
            paddingLeft: 0,
            paddingRight: 0,
            // 应用缩放：使用transform scale，并调整容器宽度以适应缩放
            // 缩放时，需要确保缩放后的内容不超出父容器
            // 关键：transform scale不会改变布局尺寸，所以需要调整容器宽度
            // 如果缩放90%，容器宽度应该是 100% / 0.9 = 111.11%
            // 但实际显示宽度 = 111.11% * 0.9 = 100%，正好占满容器
            // 注意：需要考虑父容器的padding，所以使用calc计算
            ...(zoom !== 100 ? {
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              // 调整容器宽度以适应缩放
              // 缩放90%时，容器宽度 = (100% - padding) / 0.9 + padding
              // 这样缩放后的实际显示宽度 = 100% - padding，正好占满可用空间
              width: `calc((100% - ${parentPadding}) / ${zoom / 100} + ${parentPadding})`,
              minHeight: `calc(100% / ${zoom / 100})`,
              // 确保缩放后的容器不会超出父容器
              maxWidth: `calc((100% - ${parentPadding}) / ${zoom / 100} + ${parentPadding})`,
            } : {}),
          }}
        >
          {/* 统一风格：所有 Office 文档都使用类似 EPUB 的简洁风格 */}
          {contentType === 'docx' ? (
            <div
              ref={docxPreviewRef}
              className="docx-preview-container w-full"
              style={{
                fontFamily: getFontFamily(settings.fontFamily),
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                color: themeStyles.text,
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto', // 允许横向滚动以查看宽表格
                paddingLeft: 0,
                paddingRight: 0,
                marginLeft: 0,
                marginRight: 0,
                // 移除zoom，缩放由外层容器处理
              }}
            />
          ) : contentType === 'xlsx' ? (
            <div
              className="excel-preview-container w-full"
              style={{
                fontFamily: getFontFamily(settings.fontFamily),
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                color: themeStyles.text,
                width: '100%',
                maxWidth: '100%',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingLeft: 0,
                paddingRight: 0,
                marginLeft: 0,
                marginRight: 0,
                // 移除zoom，缩放由外层容器处理
              }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : contentType === 'markdown' ? (
            // Markdown 使用更轻量的样式（更接近 EPUB）
            <div
              className="prose prose-base md:prose-lg dark:prose-invert max-w-none"
              style={{
                paddingTop: isMobile ? '0.75rem' : '1.5rem',
                paddingBottom: isMobile ? '0.75rem' : '1.5rem',
                paddingLeft: 0,
                paddingRight: 0,
                marginLeft: 0,
                marginRight: 0,
                color: themeStyles.text,
                backgroundColor: themeStyles.bg,
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
          ) : contentType === 'html' ? (
            <div
              className="prose prose-base md:prose-lg dark:prose-invert max-w-none"
              style={{
                paddingTop: isMobile ? '0.75rem' : '1.5rem',
                paddingBottom: isMobile ? '0.75rem' : '1.5rem',
                paddingLeft: 0,
                paddingRight: 0,
                marginLeft: 0,
                marginRight: 0,
                color: themeStyles.text,
                backgroundColor: themeStyles.bg,
              }}
            >
              <div
                className="docx-content"
                style={{
                  fontFamily: getFontFamily(settings.fontFamily),
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  color: themeStyles.text,
                }}
                dangerouslySetInnerHTML={{ __html: content }}
              />
            </div>
          ) : (
            <div
              className="prose prose-base md:prose-lg dark:prose-invert max-w-none"
              style={{
                paddingTop: isMobile ? '0.75rem' : '1.5rem',
                paddingBottom: isMobile ? '0.75rem' : '1.5rem',
                paddingLeft: 0,
                paddingRight: 0,
                marginLeft: 0,
                marginRight: 0,
                color: themeStyles.text,
                backgroundColor: themeStyles.bg,
              }}
            >
              <div
                className="whitespace-pre-wrap break-words"
                style={{
                  fontFamily: getFontFamily(settings.fontFamily),
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
            </div>
          )}
        </div>
      </div>

      {/* 移除底部提示，使用 ReaderContainer 的统一导航栏 */}
      
      {/* 添加样式支持 */}
      <style>{`
        .docx-preview-container {
          /* 容器宽度：100%，但允许内容超出时横向滚动 */
          width: 100% !important;
          max-width: 100% !important;
          /* 所有平台都允许横向滚动，以便查看宽表格 */
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          box-sizing: border-box !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          background-color: ${themeStyles.bg} !important;
        }
        /* 确保 docx-preview 的所有元素都使用主题背景色 */
        .docx-preview-container * {
          background-color: transparent !important;
        }
        
        .excel-preview-container {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          box-sizing: border-box !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          background-color: ${themeStyles.bg} !important;
        }
        .excel-preview {
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        .excel-sheet {
          margin-bottom: 2rem;
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        .excel-sheet h3 {
          color: ${themeStyles.text};
          margin-bottom: 1rem;
          font-size: 1.1rem;
        }
        .excel-preview table {
          border-collapse: collapse;
          width: 100% !important;
          max-width: 100% !important;
          margin: 1rem 0;
          background: ${themeStyles.contentBg};
          display: block !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
        }
        .excel-preview table thead,
        .excel-preview table tbody,
        .excel-preview table tr {
          display: table !important;
          width: 100% !important;
        }
        .excel-preview table td,
        .excel-preview table th {
          border: 1px solid ${themeStyles.contentBorder};
          padding: 0.5rem;
          text-align: left;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          min-width: 80px;
        }
        .excel-preview table th {
          background: ${settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
          font-weight: bold;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        /* 移动端优化 */
        @media (max-width: 768px) {
          .excel-preview table {
            font-size: 0.85em !important;
          }
          .excel-preview table td,
          .excel-preview table th {
            padding: 0.4rem 0.3rem !important;
            min-width: 60px;
          }
          .excel-sheet h3 {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

