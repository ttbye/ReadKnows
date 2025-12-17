/**
 * @file BookDetailModal.tsx
 * @author ttbye
 * @date 2025-12-11
 * 书籍详细页模态框组件
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Book, Plus, Trash2, Edit, X, Star, Tag, Globe, Download, Send, RefreshCw, FileText, Search, Check, ChevronDown, Clock, BookOpen, Heart, Lock, Upload, Link as LinkIcon } from 'lucide-react';
import { getCoverUrl } from '../utils/coverHelper';
import CategoryCombobox from './CategoryCombobox';
import { offlineDataCache } from '../utils/offlineDataCache';

interface BookDetail {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publish_date?: string;
  description?: string;
  cover_url?: string;
  file_path: string;
  file_name: string;
  file_type: string;
  rating?: number;
  tags?: string;
  category?: string;
  language?: string;
  uploader_id?: string;
  uploader_username?: string;
  created_at?: string;
  is_public?: number;
  parent_book_id?: string;
}

interface BookDetailModalProps {
  bookId: string;
  isOpen: boolean;
  onClose: () => void;
  onBookUpdated?: () => void; // 书籍更新后的回调
}

export default function BookDetailModal({ bookId, isOpen, onClose, onBookUpdated }: BookDetailModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [formats, setFormats] = useState<BookDetail[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inShelf, setInShelf] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<Partial<BookDetail>>({});
  const [extractingCover, setExtractingCover] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [showDoubanModal, setShowDoubanModal] = useState(false);
  const [pushEmail, setPushEmail] = useState('');
  const [emailPushEnabled, setEmailPushEnabled] = useState(false);
  const [smtpUserEmail, setSmtpUserEmail] = useState<string>('');
  const [pushing, setPushing] = useState(false);
  const [savedPushEmails, setSavedPushEmails] = useState<any[]>([]);
  const [pushFormatId, setPushFormatId] = useState<string | null>(null);
  const [doubanResults, setDoubanResults] = useState<any[]>([]);
  const [loadingDouban, setLoadingDouban] = useState(false);
  const [applyingDouban, setApplyingDouban] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCoverReplaceConfirm, setShowCoverReplaceConfirm] = useState(false);
  const [pendingDoubanInfo, setPendingDoubanInfo] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showCoverUploadModal, setShowCoverUploadModal] = useState(false);
  const [coverUploadMode, setCoverUploadMode] = useState<'file' | 'url' | 'extract'>('file');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [extractedCoverUrl, setExtractedCoverUrl] = useState<string | null>(null);
  const [showExtractCoverConfirm, setShowExtractCoverConfirm] = useState(false);
  const [autoExtractAttempted, setAutoExtractAttempted] = useState(false);
  const [extractCoverFailed, setExtractCoverFailed] = useState(false);
  const [bookCategories, setBookCategories] = useState<string[]>([]);
  const [isPWA, setIsPWA] = useState(false);
  const [exportingNotes, setExportingNotes] = useState(false);
  const [creatingNoteBook, setCreatingNoteBook] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);

  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = (window.navigator as any).standalone === true; // iOS Safari
      setIsPWA(isStandalone || isFullscreen);
    };
    checkPWA();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkPWA);
    return () => mediaQuery.removeEventListener('change', checkPWA);
  }, []);
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 触摸事件相关的 ref
  const touchStartTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const longPressThreshold = 500; // 长按阈值（毫秒）

  // 当模态框打开时加载书籍数据
  useEffect(() => {
    if (isOpen && bookId) {
      fetchBook();
      setAutoExtractAttempted(false);
      setExtractCoverFailed(false);
      if (isAuthenticated) {
        checkShelf();
        checkEmailPushEnabled();
      }
    }
  }, [isOpen, bookId, isAuthenticated]);

  // 加载书籍类型列表
  useEffect(() => {
    fetchBookCategories();
  }, []);

  // 处理ESC键关闭模态框和防止背景滚动
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // 防止背景滚动
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const fetchBookCategories = async () => {
    try {
      const response = await api.get('/settings/book-categories');
      
      if (!response.data || !response.data.categories) {
        console.warn('API返回数据格式不正确:', response.data);
        setBookCategories([]);
        return;
      }

      const categories = response.data.categories.map((c: any) => c.name || c);
      setBookCategories(categories);
    } catch (error: any) {
      console.error('获取书籍类型列表失败:', error);
      setBookCategories([]);
    }
  };

  const checkEmailPushEnabled = async () => {
    try {
      const response = await api.get('/settings');
      const settings = response.data.settings || {};
      const enabled = settings.email_push_enabled?.value === 'true';
      setEmailPushEnabled(enabled);
      setSmtpUserEmail(settings.smtp_user?.value || '');
      
      // 如果推送功能启用，获取已保存的推送邮箱列表
      if (enabled && isAuthenticated) {
        try {
          const emailsResponse = await api.get('/users/me/push-emails');
          setSavedPushEmails(emailsResponse.data.emails || []);
        } catch (error) {
          console.error('获取推送邮箱列表失败:', error);
        }
      }
    } catch (error) {
      console.error('检查邮件推送设置失败:', error);
      // 即使API调用失败，也尝试设置为false，避免显示按钮
      setEmailPushEnabled(false);
    }
  };

  const fetchBook = async () => {
    try {
      const response = await api.get(`/books/${bookId}`);
      const bookData = response.data.book;
      const formatsData = response.data.formats || [];
      
      setBook(bookData);
      setFormats(formatsData);
      setEditForm(bookData);
      
      // 默认选中epub格式（如果有），否则选中第一个格式
      if (!selectedFormatId && formatsData.length > 0) {
        const epubFormat = formatsData.find((f: BookDetail) => f.file_type.toLowerCase() === 'epub');
        if (epubFormat) {
          setSelectedFormatId(epubFormat.id);
        } else {
          setSelectedFormatId(formatsData[0].id);
        }
      }
      
      // 如果没有封面且是EPUB或PDF格式，自动尝试提取封面
      const needsExtraction = !bookData.cover_url || 
                             bookData.cover_url === 'cover' || 
                             bookData.cover_url === 'pdf-cover';
      
      if (isAuthenticated && 
          needsExtraction &&
          !autoExtractAttempted &&
          (bookData.file_type === 'epub' || bookData.file_type === 'pdf')) {
        setAutoExtractAttempted(true);
        handleExtractCover();
      }
    } catch (error: any) {
      console.error('获取书籍详情失败:', error);
      toast.error('获取书籍详情失败');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const buildNotesMarkdown = (bookInfo: BookDetail, notes: any[], highlights: any[]) => {
    const title = bookInfo.title || '未命名书籍';
    const author = bookInfo.author || '';
    const now = new Date().toLocaleString('zh-CN');

    const md: string[] = [];
    md.push(`# ${title} [笔记]`);
    if (author) md.push(`- 作者：${author}`);
    md.push(`- 导出时间：${now}`);
    md.push('');
    md.push('---');
    md.push('');

    md.push('## 高亮');
    if (!highlights?.length) {
      md.push('');
      md.push('（无高亮）');
    } else {
      md.push('');
      highlights
        .filter((h: any) => !h.deleted_at)
        .forEach((h: any, idx: number) => {
          const text = (h.selected_text || '').toString().trim();
          md.push(`- ${idx + 1}. ${text ? text : '（无文本）'}`);
        });
    }

    md.push('');
    md.push('## 笔记');
    if (!notes?.length) {
      md.push('');
      md.push('（无笔记）');
    } else {
      md.push('');
      notes.forEach((n: any, idx: number) => {
        const content = (n.content || '').toString().trim();
        const sel = (n.selected_text || '').toString().trim();
        const page = n.page_number != null ? `第${n.page_number}页` : '';
        const chapter = n.chapter_index != null ? `章节${n.chapter_index}` : '';
        const loc = [chapter, page].filter(Boolean).join(' / ');
        md.push(`### ${idx + 1}. ${loc || '位置未知'}`);
        if (sel) {
          md.push('');
          md.push(`> ${sel.replace(/\n/g, '\n> ')}`);
        }
        md.push('');
        md.push(content || '（空）');
        md.push('');
      });
    }

    md.push('---');
    md.push('');
    md.push('> 由 读士私人书库（ReadKnows）自动导出');
    md.push('');
    return md.join('\n');
  };

  const downloadTextFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchNotesAndHighlights = async () => {
    const [notesRes, hlRes] = await Promise.all([
      api.get(`/notes/book/${bookId}`),
      api.get(`/highlights/book/${bookId}`),
    ]);
    const notes = notesRes.data?.notes || [];
    const highlights = hlRes.data?.highlights || [];
    return { notes, highlights };
  };

  const handleExportNotesMarkdown = async () => {
    if (!isAuthenticated) {
      toast.error('请先登录');
      return;
    }
    if (!book) return;
    setExportingNotes(true);
    try {
      const { notes, highlights } = await fetchNotesAndHighlights();
      const md = buildNotesMarkdown(book, notes, highlights);
      const safeName = `${book.title || '未命名书籍'}-笔记.md`.replace(/[\\/:*?"<>|]/g, '_');
      downloadTextFile(safeName, md);
      toast.success('已导出 Markdown');
    } catch (e: any) {
      console.error('导出笔记失败:', e);
      toast.error(e?.response?.data?.error || e?.message || '导出失败');
    } finally {
      setExportingNotes(false);
    }
  };

  // 导出为 Markdown 并上传为“我的私人书籍”
  const handleExportAndCreatePrivateBook = async () => {
    if (!isAuthenticated) {
      toast.error('请先登录');
      return;
    }
    if (!book) return;
    setCreatingNoteBook(true);
    try {
      const { notes, highlights } = await fetchNotesAndHighlights();
      const md = buildNotesMarkdown(book, notes, highlights);
      const baseTitle = `${book.title || '未命名书籍'}[笔记]`;
      const fileName = `${baseTitle}.md`.replace(/[\\/:*?"<>|]/g, '_');
      const file = new File([md], fileName, { type: 'text/markdown;charset=utf-8' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('isPublic', 'false'); // 私有
      formData.append('autoConvertTxt', 'false');
      formData.append('autoConvertMobi', 'false');
      formData.append('category', '笔记');
      formData.append('title', baseTitle);
      // 作者使用当前登录用户
      if (user?.username) formData.append('author', user.username);
      // 封面复用原书封面（前端显示时叠加“笔记”角标）
      if (book.cover_url) formData.append('coverUrl', book.cover_url);

      const uploadRes = await api.post('/books/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 兜底：确保加入书架
      const newBookId = uploadRes.data?.book?.id;
      if (newBookId) {
        try {
          await api.post('/shelf/add', { bookId: newBookId });
        } catch {
          // ignore
        }
      }

      // 清理列表缓存并通知刷新
      try {
        await offlineDataCache.deleteByPrefix('/api/books');
        await offlineDataCache.deleteByPrefix('/api/shelf/my');
      } catch {
        // ignore
      }
      window.dispatchEvent(new CustomEvent('__books_changed'));

      toast.success('已生成并添加到我的书架（私有 / 笔记）');
      // 刷新当前模态数据
      onBookUpdated?.();
    } catch (e: any) {
      console.error('生成私人笔记书失败:', e);
      toast.error(e?.response?.data?.error || e?.message || '生成失败');
    } finally {
      setCreatingNoteBook(false);
    }
  };

  const checkShelf = async () => {
    if (!isAuthenticated || !bookId) return;
    try {
      const response = await api.get('/shelf/my');
      const shelfBooks = response.data.books || [];
      setInShelf(shelfBooks.some((b: any) => b.id === bookId));
    } catch (error) {
      console.error('检查书架状态失败:', error);
    }
  };

  const handleToggleShelf = async () => {
    if (!isAuthenticated || !book) return;
    try {
      if (inShelf) {
        await api.delete(`/shelf/remove/${bookId}`);
        setInShelf(false);
        toast.success('已从书架移除');
      } else {
        await api.post('/shelf/add', { bookId });
        setInShelf(true);
        toast.success('已添加到书架');
      }
      if (onBookUpdated) {
        onBookUpdated();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleStartReading = async () => {
    if (!book) return;
    
    // 使用选中的格式ID（如果有多个格式）
    const readingBookId = selectedFormatId || book.id;
    const readingBook = formats.find(f => f.id === readingBookId) || book;
    
    // 检查并下载书籍到本地缓存（支持离线）
    try {
      const ext = readingBook.file_name?.split('.').pop()?.toLowerCase() || readingBook.file_type;
      const serverUrl = `/books/${readingBook.id}.${ext}`;
      
      // 导入离线存储工具
      const { offlineStorage } = await import('../utils/offlineStorage');
      
      // 检查是否已缓存
      const isCached = await offlineStorage.isBookCached(readingBook.id);
      
      if (!isCached) {
        // 显示下载提示
        toast.loading('正在下载书籍到本地...', { id: 'downloading-book' });
        
        try {
          // 下载并缓存
          await offlineStorage.downloadBook(readingBook.id, ext, serverUrl);
          toast.success('书籍已下载到本地，可以离线阅读', { id: 'downloading-book' });
        } catch (error: any) {
          console.error('下载书籍失败:', error);
          toast.error('下载失败，将使用在线模式', { id: 'downloading-book' });
        }
      }
    } catch (error) {
      console.error('离线存储初始化失败:', error);
      // 继续导航，即使离线存储失败
    }
    
    // 先关闭模态框
    onClose();
    
    // 使用 setTimeout 确保模态框关闭动画完成后再导航
    setTimeout(() => {
      // 先导航到书籍详细页面
      navigate(`/books/${book.id}`);
      // 然后立即导航到阅读页面，这样返回时会回到书籍详细页面
      setTimeout(() => {
        navigate(`/reader/${readingBookId}`);
      }, 50);
    }, 100);
  };

  const handleExtractCover = async () => {
    const currentBook = book;
    if (!currentBook || (currentBook.file_type !== 'epub' && currentBook.file_type !== 'pdf')) {
      return;
    }

    setExtractingCover(true);
    try {
      const response = await api.post(`/books/${bookId}/extract-cover`);
      
      if (response.data.success === false) {
        const errorMsg = response.data.error || response.data.message || '提取封面失败';
        console.error('[提取封面] 失败:', errorMsg);
        if (!loading) {
          toast.error(errorMsg);
        }
        setExtractCoverFailed(true);
        return;
      }
      
      if (response.data.cover_url) {
        setBook({ ...currentBook, cover_url: response.data.cover_url });
        if (!loading) {
          toast.success('封面提取成功');
        }
        await fetchBook();
        if (onBookUpdated) {
          onBookUpdated();
        }
      } else {
        console.warn('[提取封面] 未返回封面URL');
        if (!loading) {
          toast.error('封面提取失败：未返回封面URL');
        }
        setExtractCoverFailed(true);
      }
    } catch (error: any) {
      console.error('[提取封面] HTTP错误:', error);
      if (!loading) {
        const errorMsg = error.response?.data?.error || 
                        error.response?.data?.message || 
                        error.message || 
                        '提取封面失败';
        toast.error(errorMsg);
      }
      setExtractCoverFailed(true);
    } finally {
      setExtractingCover(false);
    }
  };

  // 处理封面双击（PC端）
  const handleCoverDoubleClick = () => {
    if (isAuthenticated && (user?.role === 'admin' || book?.uploader_id === user?.id)) {
      setShowCoverUploadModal(true);
      setCoverUploadMode('file');
      setCoverFile(null);
      setCoverUrl('');
      setCoverPreview(null);
    }
  };

  // 处理触摸开始（移动端）
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartTimeRef.current = Date.now();
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    // 启动长按计时器
    longPressTimerRef.current = setTimeout(() => {
      // 长按触发
      handleCoverDoubleClick();
    }, longPressThreshold);
  };

  // 处理触摸移动（移动端）
  const handleTouchMove = (e: React.TouchEvent) => {
    // 如果移动距离过大，取消长按
    if (touchStartPosRef.current) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
      
      // 如果移动超过10px，取消长按
      if (deltaX > 10 || deltaY > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  };

  // 处理触摸结束（移动端）
  const handleTouchEnd = (e: React.TouchEvent) => {
    // 清除长按计时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 检测双击触摸
    const currentTime = Date.now();
    const touchDuration = currentTime - touchStartTimeRef.current;

    // 如果是短按（小于300ms），可能是双击的一部分
    if (touchDuration < 300) {
      const timeSinceLastTap = currentTime - lastTapTimeRef.current;
      
      // 如果两次点击间隔小于300ms，认为是双击
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        e.preventDefault(); // 防止触发单击事件
        handleCoverDoubleClick();
        lastTapTimeRef.current = 0; // 重置
      } else {
        lastTapTimeRef.current = currentTime;
      }
    }

    // 重置触摸状态
    touchStartPosRef.current = null;
  };

  // 处理触摸取消（移动端）
  const handleTouchCancel = (e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  // 获取豆瓣书籍信息
  const handleFetchDoubanInfo = async () => {
    if (!bookId || !book) return;
    
    setLoadingDouban(true);
    setShowDoubanModal(true);
    setDoubanResults([]);

    try {
      const response = await api.get(`/books/${bookId}/search-douban`);
      setDoubanResults(response.data.results || []);
      
      if (response.data.results.length === 0) {
        toast.error('未找到相关书籍信息');
      } else {
        toast.success(`找到 ${response.data.results.length} 条相关书籍信息`);
      }
    } catch (error: any) {
      console.error('获取豆瓣信息失败:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          '获取书籍信息失败';
      
      // 根据错误类型显示不同的提示
      if (errorMessage.includes('未配置') || errorMessage.includes('API地址')) {
        toast.error('豆瓣API地址未配置，请前往系统设置配置', {
          duration: 5000,
        });
      } else if (errorMessage.includes('无法连接') || errorMessage.includes('网络')) {
        toast.error('无法连接到豆瓣API服务，请检查网络连接和API地址', {
          duration: 5000,
        });
      } else {
        toast.error(errorMessage, {
          duration: 5000,
        });
      }
    } finally {
      setLoadingDouban(false);
    }
  };

  // 应用豆瓣书籍信息
  const handleApplyDoubanInfo = async (doubanInfo: any) => {
    if (!bookId) return;

    // 检查是否有封面图片URL，如果有则询问用户是否下载并替换
    if (doubanInfo.image && doubanInfo.image.startsWith('http')) {
      // 如果当前书籍已有封面，询问是否替换
      if (book?.cover_url && book.cover_url !== 'cover' && book.cover_url !== 'pdf-cover') {
        setPendingDoubanInfo(doubanInfo);
        setShowCoverReplaceConfirm(true);
        return;
      } else {
        // 没有封面，直接下载
        await applyDoubanInfo(doubanInfo, true);
        return;
      }
    }

    // 没有封面图片URL，直接应用
    await applyDoubanInfo(doubanInfo, false);
  };

  const applyDoubanInfo = async (doubanInfo: any, replaceCover: boolean) => {
    if (!bookId) return;
    setApplyingDouban(true);
    try {
      await api.post(`/books/${bookId}/apply-douban-info`, {
        ...doubanInfo,
        replaceCover,
      });
      toast.success('书籍信息已更新');
      setShowDoubanModal(false);
      setDoubanResults([]);
      setShowCoverReplaceConfirm(false);
      setPendingDoubanInfo(null);
      await fetchBook();
      if (onBookUpdated) {
        onBookUpdated();
      }
    } catch (error: any) {
      console.error('应用豆瓣信息失败:', error);
      toast.error(error.response?.data?.error || '更新失败');
    } finally {
      setApplyingDouban(false);
    }
  };

  // 处理封面文件选择
  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        toast.error('请选择图片文件');
        return;
      }
      // 检查文件大小（限制5MB）
      if (file.size > 5 * 1024 * 1024) {
        toast.error('图片文件不能超过5MB');
        return;
      }
      setCoverFile(file);
      // 生成预览
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 提取封面（从原书文件）
  const handleExtractCoverFromBook = async () => {
    if (!bookId || !book) return;

    // 检查文件类型是否支持
    if (book.file_type !== 'epub' && book.file_type !== 'pdf') {
      toast.error('仅支持从 EPUB 或 PDF 格式的书籍中提取封面');
      return;
    }

    setUploadingCover(true);
    try {
      // 先尝试提取封面（不强制，用于预览）
      const response = await api.post(`/books/${bookId}/extract-cover`, { force: false });
      
      if (response.data.success === false) {
        // 提取失败
        toast.error(response.data.error || '提取封面失败');
        return;
      }

      if (response.data.cover_url) {
        // 提取成功，检查是否已有封面
        if (book.cover_url && 
            book.cover_url !== 'cover' && 
            book.cover_url !== 'pdf-cover' &&
            book.cover_url.startsWith('/books/')) {
          // 已有封面，显示预览并询问是否覆盖
          setExtractedCoverUrl(response.data.cover_url);
          setShowExtractCoverConfirm(true);
        } else {
          // 没有封面，直接应用
          await applyExtractedCover(response.data.cover_url, true);
        }
      } else {
        toast.error('未找到封面图片');
      }
    } catch (error: any) {
      console.error('提取封面失败:', error);
      toast.error(error.response?.data?.error || '提取封面失败');
    } finally {
      setUploadingCover(false);
    }
  };

  // 应用提取的封面
  const applyExtractedCover = async (coverUrl: string, force: boolean) => {
    if (!bookId) return;

    setUploadingCover(true);
    try {
      // 强制提取并覆盖
      const response = await api.post(`/books/${bookId}/extract-cover`, { force });
      
      if (response.data.success === false) {
        toast.error(response.data.error || '提取封面失败');
        return;
      }

      if (response.data.cover_url) {
        toast.success('封面提取成功');
        await fetchBook();
        if (onBookUpdated) {
          onBookUpdated();
        }
        setShowCoverUploadModal(false);
        setShowExtractCoverConfirm(false);
        setExtractedCoverUrl(null);
      } else {
        toast.error('提取封面失败');
      }
    } catch (error: any) {
      console.error('应用提取封面失败:', error);
      toast.error(error.response?.data?.error || '应用封面失败');
    } finally {
      setUploadingCover(false);
    }
  };

  // 上传封面
  const handleUploadCover = async () => {
    if (!bookId) return;

    if (coverUploadMode === 'file' && !coverFile) {
      toast.error('请选择图片文件');
      return;
    }

    if (coverUploadMode === 'url' && !coverUrl.trim()) {
      toast.error('请输入图片URL');
      return;
    }

    if (coverUploadMode === 'extract') {
      await handleExtractCoverFromBook();
      return;
    }

    setUploadingCover(true);
    try {
      if (coverUploadMode === 'file' && coverFile) {
        // 文件上传
        const formData = new FormData();
        formData.append('cover', coverFile);
        
        const response = await api.post(`/books/${bookId}/upload-cover`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        toast.success('封面上传成功');
        await fetchBook();
        if (onBookUpdated) {
          onBookUpdated();
        }
      } else if (coverUploadMode === 'url' && coverUrl) {
        // URL下载
        const response = await api.post(`/books/${bookId}/cover-from-url`, {
          imageUrl: coverUrl,
        });
        
        toast.success('封面下载成功');
        await fetchBook();
        if (onBookUpdated) {
          onBookUpdated();
        }
      }
      
      setShowCoverUploadModal(false);
      setCoverFile(null);
      setCoverUrl('');
      setCoverPreview(null);
    } catch (error: any) {
      console.error('上传封面失败:', error);
      toast.error(error.response?.data?.error || '上传封面失败');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleDownload = async () => {
    try {
      // 使用选中的格式ID（如果有多个格式）
      const downloadFormatId = selectedFormatId || bookId;
      const downloadBook = formats.find(f => f.id === downloadFormatId) || book;
      
      const response = await api.get(`/books/${bookId}/download`, {
        params: { formatId: downloadFormatId !== bookId ? downloadFormatId : undefined },
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', downloadBook?.file_name || `${downloadBook?.title}.${downloadBook?.file_type}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`下载开始 (${downloadBook?.file_type?.toUpperCase()})`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || '下载失败');
    }
  };

  const handlePush = async () => {
    if (!pushEmail || !pushEmail.includes('@')) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    const formatIdToPush = pushFormatId || selectedFormatId || bookId;
    if (!formatIdToPush) {
      toast.error('无法确定要推送的书籍格式');
      return;
    }

    setPushing(true);
    try {
      await api.post(`/books/${formatIdToPush}/push`, { 
        email: pushEmail,
        formatId: formatIdToPush !== bookId ? formatIdToPush : undefined
      });
      toast.success('书籍已推送到邮箱');
      setShowPushModal(false);
      setPushEmail('');
      setPushFormatId(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || '推送失败');
    } finally {
      setPushing(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await api.delete(`/books/${bookId}`);
      toast.success('删除成功');
      onClose();
      if (onBookUpdated) {
        onBookUpdated();
      }
      // 导航到书籍列表
      navigate('/books');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleSaveEdit = async () => {
    if (!bookId) return;
    setSavingEdit(true);
    try {
      // 如果 cover_url 是空字符串，转换为 null 以清空封面
      const updateData = {
        ...editForm,
        cover_url: editForm.cover_url === '' ? null : editForm.cover_url,
      };
      await api.put(`/books/${bookId}`, updateData);
      toast.success('保存成功');
      setShowEditModal(false);
      await fetchBook();
      if (onBookUpdated) {
        onBookUpdated();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const canDelete = () => {
    if (!isAuthenticated || !user || !book) return false;
    return user.role === 'admin' || book.uploader_id === user.id;
  };

  const canPush = () => {
    if (!isAuthenticated || !user) return false;
    return emailPushEnabled;
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        style={{
          // PWA移动端安全区域适配
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
        }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return null;
  }


  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto hide-scrollbar"
      style={{
        // PWA移动端安全区域适配
        // iPhone PWA 模式下，需要更大的顶部安全区域（通常 44px+）
        // 使用 clamp 确保最小值，同时适配不同设备
        paddingTop: isPWA 
          ? 'max(clamp(20px, env(safe-area-inset-top, 20px), 50px), 8px)'
          : 'max(env(safe-area-inset-top, 0px), 8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
      }}
      onClick={(e) => {
        // 只有点击背景层（最外层div）时才关闭模态框
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        ref={modalRef}
        data-book-detail-modal
        className="bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl overflow-y-auto hide-scrollbar mx-4 sm:mx-auto"
        style={{
          // 移动端高度适配：使用 100vh 减去外层容器的 padding 和基本间隙
          // PWA 模式下，顶部安全区域可能更大，需要动态计算
          maxHeight: isPWA
            ? 'calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 50px), 8px) - max(env(safe-area-inset-bottom, 0px), 8px) - 16px)'
            : 'calc(100vh - max(env(safe-area-inset-top, 0px), 8px) - max(env(safe-area-inset-bottom, 0px), 8px) - 16px)',
          // 移动端宽度适配：确保有适当的边距，但不超过屏幕宽度
          // 使用 calc 计算，考虑安全区域和边距（mx-4 提供 16px 每边，总共 32px）
          width: 'calc(100vw - max(env(safe-area-inset-left, 0px), 16px) - max(env(safe-area-inset-right, 0px), 16px) - 32px)',
          maxWidth: 'calc(100vw - max(env(safe-area-inset-left, 0px), 16px) - max(env(safe-area-inset-right, 0px), 16px) - 32px)',
          // PWA模式下增加顶部间距
          marginTop: isPWA ? 'max(env(safe-area-inset-top, 0px), 24px)' : '0',
        }}
        onClick={(e) => {
          // 阻止事件冒泡，防止点击内容区域时关闭模态框
          e.stopPropagation();
        }}
      >
        {/* 头部：关闭按钮 */}
        <div 
          className="sticky top-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 flex items-center justify-between z-10 rounded-t-2xl"
          style={{
            // 固定在模态框顶部
            top: 0,
            // 安全区域适配：左右 padding 考虑安全区域
            // PWA 模式下，顶部也需要额外的安全区域 padding，确保标题栏不被遮挡
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 24px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 24px)',
            paddingTop: isPWA 
              ? 'max(env(safe-area-inset-top, 0px), 16px)'
              : '16px',
            paddingBottom: '16px',
          }}
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">书籍详情</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 内容区域 */}
        <div 
          className="p-4 md:p-6"
          style={{
            // 移动端安全区域适配：左右 padding 考虑安全区域
            // PC端使用 Tailwind 的 md:p-6，移动端使用安全区域或 16px
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 mb-4 md:mb-6">
            {/* 左侧封面 - 桌面端 */}
            <div className="hidden md:block md:col-span-4 lg:col-span-3">
              <div className="w-full max-w-[140px] sm:max-w-[160px] md:max-w-[180px] lg:max-w-[200px] mx-auto md:mx-0">
                <div 
                  className="group relative w-full aspect-[3/4] mb-3"
                  onDoubleClick={handleCoverDoubleClick}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchCancel}
                  title={isAuthenticated && (user?.role === 'admin' || book.uploader_id === user?.id) ? '双击或长按上传封面' : ''}
                >
                  <div className="w-full h-full bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-xl overflow-hidden shadow-lg ring-2 ring-white dark:ring-gray-800 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:ring-blue-200 dark:hover:ring-blue-800 flex items-center justify-center p-1.5 cursor-pointer">
                    {(() => {
                      const coverUrl = getCoverUrl(book.cover_url);
                      return coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={book.title}
                          className="w-full h-full object-contain rounded-lg"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            width: 'auto',
                            height: 'auto',
                            objectPosition: 'center',
                          }}
                          loading="lazy"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center">
                                  <svg class="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                                  </svg>
                                </div>
                              `;
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Book className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-gray-400 dark:text-gray-500" />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧信息 */}
            <div className="md:col-span-8 lg:col-span-9">
              <div className="card-gradient rounded-xl shadow-lg overflow-hidden">
                {/* 标题和作者等信息 */}
                <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex-1 min-w-0">
                    {/* 移动端：封面缩小并放在标题左侧（卡片内部） */}
                    <div className="md:hidden flex items-start gap-3 mb-2">
                      {/* 封面小图 */}
                      <div 
                        className="group relative w-20 h-28 flex-shrink-0"
                        onDoubleClick={handleCoverDoubleClick}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchCancel}
                        title={isAuthenticated && (user?.role === 'admin' || book.uploader_id === user?.id) ? '双击或长按上传封面' : ''}
                      >
                        <div className="w-full h-full bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-lg overflow-hidden shadow-md ring-1 ring-white dark:ring-gray-800 flex items-center justify-center p-1">
                          {(() => {
                            const coverUrl = getCoverUrl(book.cover_url);
                            return coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={book.title}
                                className="w-full h-full object-contain rounded"
                                loading="lazy"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Book className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      
                      {/* 标题和作者等信息（移动端） */}
                      <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold mb-1.5 bg-gradient-to-r from-gray-900 via-blue-800 to-gray-900 dark:from-gray-100 dark:via-blue-200 dark:to-gray-100 bg-clip-text text-transparent leading-tight">
                          {book.title}
                        </h1>
                        
                        {/* 作者（移动端，单独一行） */}
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mb-1.5">
                          {book.author || '未知作者'}
                        </p>
                        
                        {/* 分类和是否私有（移动端，下一行） */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {book.category && (
                            <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded border border-blue-200 dark:border-blue-800/50 shadow-sm">
                              <Tag className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                              <span className="font-semibold text-blue-700 dark:text-blue-300 text-xs">{book.category}</span>
                            </div>
                          )}
                          {/* 公有/私有状态 */}
                          {book.is_public !== undefined && (
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded border shadow-sm ${
                              book.is_public === 1
                                ? 'bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-800/50'
                                : 'bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 border-orange-200 dark:border-orange-800/50'
                            }`}>
                              {book.is_public === 1 ? (
                                <>
                                  <Globe className="w-3 h-3 text-green-600 dark:text-green-400" />
                                  <span className="font-semibold text-green-700 dark:text-green-300 text-xs">公开</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                                  <span className="font-semibold text-orange-700 dark:text-orange-300 text-xs">私有</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 桌面端：保持原有布局 */}
                    <h1 className="hidden md:block text-xl md:text-2xl lg:text-3xl font-bold mb-2 md:mb-3 bg-gradient-to-r from-gray-900 via-blue-800 to-gray-900 dark:from-gray-100 dark:via-blue-200 dark:to-gray-100 bg-clip-text text-transparent leading-tight">
                      {book.title}
                    </h1>
                    <div className="hidden md:flex items-center gap-2 md:gap-3 flex-wrap mb-2 md:mb-3">
                      <p className="text-sm md:text-lg lg:text-xl text-gray-600 dark:text-gray-400 font-medium">
                        {book.author || '未知作者'}
                      </p>
                      {book.rating && (
                        <div className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 rounded-lg border border-yellow-200 dark:border-yellow-800/50 shadow-sm">
                          <Star className="w-3 h-3 md:w-4 md:h-4 fill-yellow-400 text-yellow-400" />
                          <span className="font-bold text-yellow-700 dark:text-yellow-300 text-xs md:text-sm">{book.rating.toFixed(1)}</span>
                        </div>
                      )}
                      {book.category && (
                        <div className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-0.5 md:py-1 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg border border-blue-200 dark:border-blue-800/50 shadow-sm">
                          <Tag className="w-3 h-3 md:w-4 md:h-4 text-blue-600 dark:text-blue-400" />
                          <span className="font-semibold text-blue-700 dark:text-blue-300 text-xs md:text-sm">{book.category}</span>
                        </div>
                      )}
                      {/* 公有/私有状态 */}
                      {book.is_public !== undefined && (
                        <div className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-0.5 md:py-1 rounded-lg border shadow-sm ${
                          book.is_public === 1
                            ? 'bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-800/50'
                            : 'bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 border-orange-200 dark:border-orange-800/50'
                        }`}>
                          {book.is_public === 1 ? (
                            <>
                              <Globe className="w-3 h-3 md:w-4 md:h-4 text-green-600 dark:text-green-400" />
                              <span className="font-semibold text-green-700 dark:text-green-300 text-xs md:text-sm">公开</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3 md:w-4 md:h-4 text-orange-600 dark:text-orange-400" />
                              <span className="font-semibold text-orange-700 dark:text-orange-300 text-xs md:text-sm">私有</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {/* 书籍简介 - 扁平化显示，限制字数 */}
                    {book.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-1.5 md:mb-3 line-clamp-2">
                        {book.description.length > 100 ? `${book.description.substring(0, 100)}...` : book.description}
                      </p>
                    )}
                    {/* 上传者和上传日期 */}
                    {(book.uploader_username || book.created_at) && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1.5 md:mb-3">
                        {book.uploader_username && <span>上传者: {book.uploader_username}</span>}
                        {book.uploader_username && book.created_at && <span> · </span>}
                        {book.created_at && (
                          <span>上传时间: {new Date(book.created_at).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 操作按钮区域 */}
                <div className="p-4 md:p-6 space-y-3">
                    {/* 格式选择（如果有多个格式） */}
                    {isAuthenticated && formats.filter((f: BookDetail) => f.file_type.toLowerCase() !== 'mobi').length > 1 && (
                      <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                          选择阅读格式：
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {formats.filter((f: BookDetail) => f.file_type.toLowerCase() !== 'mobi').map((format) => (
                            <button
                              key={format.id}
                              onClick={() => setSelectedFormatId(format.id)}
                              className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all duration-200 ${
                                selectedFormatId === format.id
                                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md scale-105'
                                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                              }`}
                            >
                              {format.file_type.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* 主要操作按钮 - 开始阅读按钮醒目 */}
                    <button
                      onClick={handleStartReading}
                      className="w-full bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-700 hover:via-blue-600 hover:to-purple-700 text-white font-semibold text-sm md:text-base py-3 md:py-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                      <BookOpen className="w-4 h-4 md:w-5 md:h-5" />
                      <span>开始阅读{formats.length > 1 && selectedFormatId ? ` (${formats.find(f => f.id === selectedFormatId)?.file_type.toUpperCase()})` : ''}</span>
                    </button>
                    
                    {/* 其他操作按钮 - 非扁平化设计 */}
                    {isAuthenticated && (
                      <div className={`grid gap-1.5 md:gap-2 ${canDelete() ? 'grid-cols-6' : 'grid-cols-5'}`}>
                        {inShelf ? (
                          <button
                            onClick={handleToggleShelf}
                            className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm"
                            title="取消收藏"
                          >
                            <Heart className="w-3.5 h-3.5 md:w-4 md:h-4 fill-red-500 text-red-500 transition-transform group-hover:scale-110" />
                            <span className="text-[9px] md:text-[10px] font-medium">已收藏</span>
                          </button>
                        ) : (
                          <button
                            onClick={handleToggleShelf}
                            className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm"
                            title="收藏"
                          >
                            <Heart className="w-3.5 h-3.5 md:w-4 md:h-4 transition-transform group-hover:scale-110" />
                            <span className="text-[9px] md:text-[10px] font-medium">收藏</span>
                          </button>
                        )}
                        <button
                          onClick={handleDownload}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm"
                          title="下载书籍"
                        >
                          <Download className="w-3.5 h-3.5 md:w-4 md:h-4 transition-transform group-hover:scale-110" />
                          <span className="text-[9px] md:text-[10px] font-medium">下载</span>
                        </button>
                        <button
                          onClick={() => setShowNotesModal(true)}
                          disabled={exportingNotes || creatingNoteBook}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700 text-gray-700 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          title="笔记（导出 / 导入为私人书籍）"
                        >
                          <FileText className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${(exportingNotes || creatingNoteBook) ? 'animate-pulse' : 'group-hover:scale-110'}`} />
                          <span className="text-[9px] md:text-[10px] font-medium">笔记</span>
                        </button>
                        <button
                          onClick={handleFetchDoubanInfo}
                          disabled={loadingDouban}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          title="获取书籍信息"
                        >
                          <Search className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${loadingDouban ? 'animate-spin' : 'group-hover:scale-110'}`} />
                          <span className="text-[9px] md:text-[10px] font-medium">信息</span>
                        </button>
                        <button
                          onClick={() => {
                            if (!isAuthenticated) {
                              toast.error('请先登录');
                              return;
                            }
                            if (!emailPushEnabled) {
                              toast.error('邮件推送功能未启用，请联系管理员在系统设置中启用');
                              return;
                            }
                            setShowPushModal(true);
                          }}
                          disabled={!isAuthenticated || !emailPushEnabled}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-700 text-gray-700 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!isAuthenticated ? '请先登录' : !emailPushEnabled ? '邮件推送功能未启用' : '推送到Kindle'}
                        >
                          <Send className="w-3.5 h-3.5 md:w-4 md:h-4 transition-transform group-hover:scale-110" />
                          <span className="text-[9px] md:text-[10px] font-medium">推送</span>
                        </button>
                        {canDelete() && (
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm"
                            title="删除书籍"
                          >
                            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 transition-transform group-hover:scale-110" />
                            <span className="text-[9px] md:text-[10px] font-medium">删除</span>
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* 管理按钮（编辑、上传封面等） */}
                    {(isAuthenticated && (user?.role === 'admin' || book.uploader_id === user?.id)) && (
                      <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                        <button
                          onClick={() => setShowEditModal(true)}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-yellow-300 dark:hover:border-yellow-700 text-gray-700 dark:text-gray-300 hover:text-yellow-600 dark:hover:text-yellow-400 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-all duration-200 hover:shadow-sm"
                          title="编辑书籍信息"
                        >
                          <Edit className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                          <span className="text-xs font-medium">编辑</span>
                        </button>
                        <button
                          onClick={() => setShowCoverUploadModal(true)}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700 text-gray-700 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-all duration-200 hover:shadow-sm"
                          title="上传封面"
                        >
                          <Upload className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                          <span className="text-xs font-medium">封面</span>
                        </button>
                      </div>
                    )}
                    
                    {/* 提取封面按钮 - 可选显示 */}
                    {(!book.cover_url || book.cover_url === 'cover' || book.cover_url === 'pdf-cover') && 
                     (book.file_type === 'epub' || book.file_type === 'pdf') && 
                     !extractCoverFailed && (
                      <div className="grid grid-cols-1 gap-1.5 md:gap-2">
                        <button
                          onClick={handleExtractCover}
                          disabled={extractingCover}
                          className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-700 text-gray-700 dark:text-gray-300 hover:text-cyan-600 dark:hover:text-cyan-400 rounded-lg py-2 flex items-center justify-center gap-1.5 transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          title="提取封面"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 transition-transform ${extractingCover ? 'animate-spin' : 'group-hover:scale-110'}`} />
                          <span className="text-xs font-medium">提取封面</span>
                        </button>
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>


          {/* 详细信息卡片 */}
          <div className="mt-6">
            <div className="card-gradient rounded-xl shadow-lg overflow-hidden">
              <div className="p-1.5 md:p-4 space-y-1.5 md:space-y-3">
                {/* 基本信息卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 md:gap-3">
                  {book.category && (
                    <div className="group flex items-center gap-1 md:gap-2 p-1.5 md:p-3 bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-blue-900/20 dark:via-gray-800 dark:to-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                      <div className="flex-shrink-0 w-5 h-5 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center">
                        <Tag className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0">分类</div>
                        <div className="text-[8px] md:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
                          {book.category}
                        </div>
                      </div>
                    </div>
                  )}
                  {book.language && (
                    <div className="group flex items-center gap-1 md:gap-2 p-1.5 md:p-3 bg-gradient-to-br from-green-50 via-white to-green-50 dark:from-green-900/20 dark:via-gray-800 dark:to-green-900/20 rounded-lg border border-green-100 dark:border-green-800/50">
                      <div className="flex-shrink-0 w-5 h-5 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 dark:from-green-600 dark:to-green-700 flex items-center justify-center">
                        <Globe className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0">语言</div>
                        <div className="text-[8px] md:text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                          {book.language === 'zh' ? '中文' : 
                           book.language === 'en' ? 'English' :
                           book.language === 'ja' ? '日本語' :
                           book.language === 'ko' ? '한국어' :
                           book.language === 'fr' ? 'Français' :
                           book.language === 'de' ? 'Deutsch' :
                           book.language === 'es' ? 'Español' :
                           book.language === 'ru' ? 'Русский' : book.language}
                        </div>
                      </div>
                    </div>
                  )}
                  {book.publisher && (
                    <div className="group flex items-center gap-1 md:gap-2 p-1.5 md:p-3 bg-gradient-to-br from-purple-50 via-white to-purple-50 dark:from-purple-900/20 dark:via-gray-800 dark:to-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800/50">
                      <div className="flex-shrink-0 w-5 h-5 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 flex items-center justify-center">
                        <Book className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0">出版社</div>
                        <div className="text-[8px] md:text-sm font-semibold text-gray-500 dark:text-gray-100 line-clamp-2 leading-tight">
                          {book.publisher}
                        </div>
                      </div>
                    </div>
                  )}
                  {book.publish_date && (
                    <div className="group flex items-center gap-1 md:gap-2 p-1.5 md:p-3 bg-gradient-to-br from-orange-50 via-white to-orange-50 dark:from-orange-900/20 dark:via-gray-800 dark:to-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-800/50">
                      <div className="flex-shrink-0 w-5 h-5 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 flex items-center justify-center">
                        <Clock className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0">出版日期</div>
                        <div className="text-[8px] md:text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                          {book.publish_date}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="group flex items-center gap-1 md:gap-2 p-1.5 md:p-3 bg-gradient-to-br from-indigo-50 via-white to-indigo-50 dark:from-indigo-900/20 dark:via-gray-800 dark:to-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                    <div className="flex-shrink-0 w-5 h-5 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700 flex items-center justify-center">
                      <FileText className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0">ISBN</div>
                      <div className="text-[8px] md:text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono leading-tight">
                        {book.isbn || <span className="text-gray-400 dark:text-gray-500 italic">未设置</span>}
                      </div>
                    </div>
                  </div>
                  <div className="group flex items-center gap-1 md:gap-2 p-1.5 md:p-3 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-shrink-0 w-5 h-5 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
                      <FileText className="w-2.5 h-2.5 md:w-4 md:h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0">文件格式</div>
                      <div className="text-[8px] md:text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formats.length > 1 ? (
                          <div className="flex flex-wrap gap-0.5">
                            {formats.map((format) => (
                              <span
                                key={format.id}
                                className="inline-block px-1 py-0.5 md:px-1.5 md:py-0.5 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded font-mono uppercase text-[9px] md:text-xs"
                              >
                                {format.file_type}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-block px-1 py-0.5 md:px-1.5 md:py-0.5 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded font-mono uppercase text-[9px] md:text-xs">
                            {book.file_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 标签 */}
                {book.tags && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">标签</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {book.tags.split(',').map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-full text-xs font-medium shadow-sm"
                        >
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 删除确认模态框 */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">确认删除</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">确定要删除这本书吗？此操作无法撤销。</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑模态框 */}
      {showEditModal && book && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto"
          style={{
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full overflow-y-auto shadow-2xl"
            style={{
              // 调整最大高度以考虑安全区域
              maxHeight: 'calc(100vh - max(env(safe-area-inset-top, 0px), 16px) - max(env(safe-area-inset-bottom, 0px), 16px))',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">编辑书籍信息</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">标题 *</label>
                  <input
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">作者</label>
                  <input
                    type="text"
                    value={editForm.author || ''}
                    onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* 出版信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">ISBN</label>
                  <input
                    type="text"
                    value={editForm.isbn || ''}
                    onChange={(e) => setEditForm({ ...editForm, isbn: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">出版社</label>
                  <input
                    type="text"
                    value={editForm.publisher || ''}
                    onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">出版日期</label>
                  <input
                    type="text"
                    value={editForm.publish_date || ''}
                    onChange={(e) => setEditForm({ ...editForm, publish_date: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* 分类信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">分类</label>
                  <CategoryCombobox
                    value={editForm.category || '未分类'}
                    onChange={(value) => setEditForm({ ...editForm, category: value })}
                    categories={bookCategories}
                    placeholder="选择或输入书籍分类"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">语言</label>
                  <input
                    type="text"
                    value={editForm.language || ''}
                    onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">评分</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={editForm.rating || ''}
                    onChange={(e) => setEditForm({ ...editForm, rating: parseFloat(e.target.value) || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* 封面图片地址 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">封面图片地址</label>
                <input
                  type="text"
                  value={editForm.cover_url || ''}
                  onChange={(e) => setEditForm({ ...editForm, cover_url: e.target.value })}
                  placeholder="例如：/books/xxx/cover.jpg 或 https://example.com/cover.jpg"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  可以是本地路径（/books/...）或在线图片URL（http://...）
                </p>
              </div>

              {/* 标签 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">标签</label>
                <input
                  type="text"
                  value={editForm.tags || ''}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="多个标签用逗号分隔"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">例如：科幻, 小说, 刘慈欣</p>
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">简介/描述</label>
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={8}
                  placeholder="请输入书籍的详细简介或描述..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持多行文本，建议详细描述书籍内容</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 笔记：导出 / 导入方式选择 */}
      {showNotesModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onPointerDown={() => setShowNotesModal(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-xl p-4"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">读书笔记</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  请选择：导出仅下载，或导入为新的私人书籍（笔记）。
                </div>
              </div>
              <button
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-800/60"
                onClick={() => setShowNotesModal(false)}
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                disabled={exportingNotes || creatingNoteBook}
                onClick={async () => {
                  setShowNotesModal(false);
                  await handleExportNotesMarkdown();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText className="w-4 h-4" />
                导出（仅下载）
              </button>
              <button
                disabled={exportingNotes || creatingNoteBook}
                onClick={async () => {
                  setShowNotesModal(false);
                  await handleExportAndCreatePrivateBook();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                导入为私人书籍
              </button>
              <button
                onClick={() => setShowNotesModal(false)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 py-2.5 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 推送书籍模态框 */}
      {showPushModal && (
        <div 
          className="fixed inset-0 bg-black flex items-center justify-center z-[60]"
          style={{ 
            backgroundColor: '#000000',
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
          }}
        >
          <div className="card-gradient rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Send className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">推送到Kindle</h2>
                </div>
                <button
                  onClick={() => {
                    setShowPushModal(false);
                    setPushEmail('');
                    setPushFormatId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* 书籍名称 */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">书籍名称</label>
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100">
                    {book?.title || '未知'}
                  </div>
                </div>

                {/* 格式选择（如果有多个格式） */}
                {formats.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                      选择推送格式 <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {formats.map((format) => (
                        <button
                          key={format.id}
                          type="button"
                          onClick={() => setPushFormatId(format.id)}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                            (pushFormatId || selectedFormatId) === format.id
                              ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                              : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                          disabled={pushing}
                        >
                          {format.file_type.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      当前选择：{formats.find(f => f.id === (pushFormatId || selectedFormatId))?.file_type.toUpperCase() || '未知'}
                    </p>
                  </div>
                )}

                {/* 接收方邮箱地址 */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    接收方邮箱地址 <span className="text-red-500">*</span>
                  </label>
                  
                  {/* 已保存的推送邮箱列表 */}
                  {savedPushEmails.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">快速选择已保存的邮箱：</p>
                      <div className="flex flex-wrap gap-2">
                        {savedPushEmails.map((email) => (
                          <button
                            key={email.id}
                            type="button"
                            onClick={() => {
                              setPushEmail(email.email);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                              pushEmail === email.email
                                ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                            disabled={pushing}
                          >
                            {email.email}
                            {email.is_kindle && (
                              <span className="ml-1 text-xs opacity-75">(Kindle)</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <input
                    type="email"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="example@kindle.com 或 example@gmail.com"
                    value={pushEmail}
                    onChange={(e) => setPushEmail(e.target.value)}
                    disabled={pushing}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    支持Kindle邮箱（@kindle.com）和普通邮箱
                    {savedPushEmails.length === 0 && (
                      <span className="block mt-1">
                        提示：在"个人信息"页面可以管理推送邮箱，方便下次快速选择
                      </span>
                    )}
                  </p>
                </div>

                {/* 发送方邮箱地址 */}
                {smtpUserEmail && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">发送方邮箱地址</label>
                    <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-900 dark:text-blue-100 font-mono text-sm">
                      {smtpUserEmail}
                    </div>
                  </div>
                )}

                {/* Kindle提醒 */}
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-amber-600 dark:text-amber-400 text-xs font-bold">!</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                        Kindle设置提醒
                      </p>
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        请确保在您的Kindle设备或Kindle应用中，已将该发送方邮箱地址添加到"已认可的发件人电子邮箱列表"中，否则Kindle将无法接收推送的书籍。
                      </p>
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowPushModal(false);
                      setPushEmail('');
                      setPushFormatId(null);
                    }}
                    disabled={pushing}
                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handlePush}
                    disabled={pushing || !pushEmail || !pushEmail.includes('@')}
                    className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pushing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        推送中...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        推送
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 豆瓣书籍信息模态框 */}
      {showDoubanModal && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto"
          style={{
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">从豆瓣获取书籍信息</h2>
              <button
                onClick={() => {
                  setShowDoubanModal(false);
                  setDoubanResults([]);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {loadingDouban ? (
              <div className="text-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
                <p className="text-gray-600 dark:text-gray-400">正在搜索书籍信息...</p>
              </div>
            ) : doubanResults.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400">未找到相关书籍信息</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  请检查书籍标题是否正确，或稍后重试
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  找到 {doubanResults.length} 个相关结果，请选择要应用的书籍信息：
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {doubanResults.map((result, index) => (
                    <div
                      key={result.id || index}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                    >
                      <div className="flex gap-4">
                        {result.image && (
                          <img
                            src={result.image}
                            alt={result.title}
                            className="w-20 h-28 object-cover rounded flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg mb-2 line-clamp-2 text-gray-900 dark:text-gray-100">
                            {result.title || '未知标题'}
                          </h3>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            {result.author && (
                              <p>
                                <span className="font-medium text-gray-900 dark:text-gray-100">作者：</span>
                                {result.author}
                              </p>
                            )}
                            {result.publisher && (
                              <p>
                                <span className="font-medium text-gray-900 dark:text-gray-100">出版社：</span>
                                {result.publisher}
                              </p>
                            )}
                            {result.pubdate && (
                              <p>
                                <span className="font-medium text-gray-900 dark:text-gray-100">出版日期：</span>
                                {result.pubdate}
                              </p>
                            )}
                            {result.isbn && (
                              <p>
                                <span className="font-medium text-gray-900 dark:text-gray-100">ISBN：</span>
                                {result.isbn}
                              </p>
                            )}
                            {result.rating && (
                              <p className="flex items-center gap-1">
                                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                <span>{result.rating.toFixed(1)}</span>
                              </p>
                            )}
                          </div>
                          {result.summary && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 line-clamp-3">
                              {result.summary}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleApplyDoubanInfo(result)}
                        disabled={applyingDouban}
                        className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {applyingDouban ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            应用中...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            应用此信息
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowDoubanModal(false);
                  setDoubanResults([]);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 封面替换确认弹窗 */}
      {showCoverReplaceConfirm && pendingDoubanInfo && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">替换封面</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">检测到豆瓣信息中包含封面图片</p>
              </div>
            </div>
            {pendingDoubanInfo.image && (
              <div className="mb-4 flex justify-center">
                <img
                  src={pendingDoubanInfo.image}
                  alt="新封面"
                  className="w-32 h-48 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                检测到豆瓣返回了封面图片
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                是否下载封面图片到本地并替换当前封面？
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCoverReplaceConfirm(false);
                  applyDoubanInfo(pendingDoubanInfo, false);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                仅更新信息
              </button>
              <button
                onClick={() => {
                  setShowCoverReplaceConfirm(false);
                  applyDoubanInfo(pendingDoubanInfo, true);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                替换封面
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 封面上传模态窗口 */}
      {showCoverUploadModal && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">上传封面</h2>
              <button
                onClick={() => setShowCoverUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {/* 上传方式选择 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  onClick={() => {
                    setCoverUploadMode('file');
                    setCoverPreview(null);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                    coverUploadMode === 'file'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-1" />
                  本地上传
                </button>
                <button
                  onClick={() => {
                    setCoverUploadMode('url');
                    setCoverPreview(null);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                    coverUploadMode === 'url'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <LinkIcon className="w-4 h-4 inline mr-1" />
                  在线链接
                </button>
                <button
                  onClick={() => {
                    setCoverUploadMode('extract');
                    setCoverPreview(null);
                  }}
                  disabled={book?.file_type !== 'epub' && book?.file_type !== 'pdf'}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                    coverUploadMode === 'extract'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <RefreshCw className="w-4 h-4 inline mr-1" />
                  封面提取
                </button>
              </div>

              {/* 本地文件上传 */}
              {coverUploadMode === 'file' && (
                <div>
                  <label className="block mb-2">
                    <div className="flex items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-gray-50 dark:bg-gray-900">
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="预览"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-center">
                          <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            点击选择图片或拖拽到此处
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            支持 JPG、PNG、WebP 格式，最大 5MB
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (!file.type.startsWith('image/')) {
                            toast.error('请选择图片文件');
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            toast.error('图片文件不能超过5MB');
                            return;
                          }
                          setCoverFile(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setCoverPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {coverFile && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      已选择: {coverFile.name}
                    </p>
                  )}
                </div>
              )}

              {/* 在线链接 */}
              {coverUploadMode === 'url' && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    图片URL地址
                  </label>
                  <input
                    type="url"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://example.com/cover.jpg"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    支持 HTTP/HTTPS 图片链接，系统会自动下载并保存到服务器
                  </p>
                </div>
              )}

              {/* 从原书提取 */}
              {coverUploadMode === 'extract' && (
                <div>
                  <div className="flex items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
                    <div className="text-center">
                      <RefreshCw className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        从 {book?.file_type?.toUpperCase()} 文件中提取封面
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        系统将从原书文件中提取封面图片
                      </p>
                      {book?.file_type !== 'epub' && book?.file_type !== 'pdf' && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-2">
                          当前书籍格式不支持封面提取（仅支持 EPUB 和 PDF）
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setShowCoverUploadModal(false)}
                disabled={uploadingCover}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleUploadCover}
                disabled={
                  uploadingCover || 
                  (coverUploadMode === 'file' && !coverFile) || 
                  (coverUploadMode === 'url' && !coverUrl) ||
                  (coverUploadMode === 'extract' && book?.file_type !== 'epub' && book?.file_type !== 'pdf')
                }
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {uploadingCover ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {coverUploadMode === 'file' ? '上传中...' : coverUploadMode === 'url' ? '下载中...' : '提取中...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {coverUploadMode === 'file' ? '确认上传' : coverUploadMode === 'url' ? '确认下载' : '提取封面'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 提取封面确认覆盖弹窗 */}
      {showExtractCoverConfirm && extractedCoverUrl && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            // PWA移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">提取封面成功</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">已从原书文件中提取到封面图片</p>
              </div>
            </div>
            <div className="mb-4 flex justify-center">
              <img
                src={getCoverUrl(extractedCoverUrl)}
                alt="提取的封面"
                className="w-32 h-48 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                是否覆盖当前封面？
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                当前书籍已有封面图片，是否要用提取的封面替换现有封面？
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExtractCoverConfirm(false);
                  setExtractedCoverUrl(null);
                  setShowCoverUploadModal(false);
                }}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={() => applyExtractedCover(extractedCoverUrl, true)}
                disabled={uploadingCover}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {uploadingCover ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    覆盖封面
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

