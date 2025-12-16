/**
 * @file BookDetail.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Book, Plus, Trash2, Edit, ArrowLeft, Star, Tag, Globe, Download, Send, RefreshCw, FileText, X, Search, Check, ChevronDown, Clock, BookOpen, Heart, Lock, Upload, Link as LinkIcon } from 'lucide-react';
import { getCoverUrl } from '../utils/coverHelper';
import CategoryCombobox from '../components/CategoryCombobox';

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

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
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
  const [autoExtractAttempted, setAutoExtractAttempted] = useState(false); // 标记是否已尝试过自动提取封面
  const [extractCoverFailed, setExtractCoverFailed] = useState(false); // 标记提取封面是否失败
  const [bookCategories, setBookCategories] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
      fetchBook();
      setAutoExtractAttempted(false); // 重置自动提取标志
      setExtractCoverFailed(false); // 重置提取失败标志
      if (isAuthenticated) {
        checkShelf();
        checkEmailPushEnabled();
      }
    }
  }, [id, isAuthenticated]);

  // 加载书籍类型列表
  useEffect(() => {
    fetchBookCategories();
  }, []);

  const fetchBookCategories = async () => {
    try {
      const response = await api.get('/settings/book-categories');
      
      if (!response.data || !response.data.categories) {
        console.warn('API返回数据格式不正确:', response.data);
        setBookCategories(['未分类']);
        return;
      }
      
      const cats = response.data.categories.map((c: any) => {
        if (typeof c === 'string') {
          return c;
        }
        return c.name || c.category || String(c);
      }).filter((cat: string) => cat && cat.trim() !== '');
      
      if (cats.length > 0) {
        setBookCategories(cats);
      } else {
        console.warn('书籍类型列表为空，使用默认值');
        setBookCategories(['未分类']);
      }
    } catch (error: any) {
      console.error('获取书籍类型列表失败:', error);
      console.error('错误状态码:', error.response?.status);
      console.error('错误详情:', error.response?.data || error.message);
      // 使用默认分类列表
      setBookCategories(['未分类', '小说', '文学', '历史', '哲学', '武侠', '传记', '科技', '计算机', '编程', '经济', '管理', '心理学', '社会科学', '自然科学', '艺术', '教育', '儿童读物', '漫画']);
    }
  };

  // 检查邮件推送是否启用并获取SMTP配置
  const checkEmailPushEnabled = async () => {
    try {
      const response = await api.get('/settings');
      const settings = response.data.settings || {};
      const enabled = settings.email_push_enabled?.value === 'true';
      console.log('[推送功能] 邮件推送功能状态:', enabled);
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
      const response = await api.get(`/books/${id}`);
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
      // 注意：只有在真的没有封面时才提取，避免不必要的请求
      // 并且只在首次加载时自动提取，保存编辑后不再自动提取
      const needsExtraction = !bookData.cover_url || 
                             bookData.cover_url === 'cover' || 
                             bookData.cover_url === 'pdf-cover';
      
      if (isAuthenticated && 
          needsExtraction &&
          !autoExtractAttempted && // 只在未尝试过自动提取时执行
          (bookData.file_type === 'epub' || bookData.file_type === 'pdf')) {
        // 标记已尝试自动提取
        setAutoExtractAttempted(true);
        // 延迟提取，避免阻塞页面加载
        setTimeout(async () => {
          try {
            const extractResponse = await api.post(`/books/${id}/extract-cover`);
            if (extractResponse.data.cover_url) {
              setBook({ ...bookData, cover_url: extractResponse.data.cover_url });
            }
          } catch (error: any) {
            // 静默失败，只在控制台记录
            console.log('自动提取封面失败:', error.response?.data?.error || error.message);
            setExtractCoverFailed(true); // 标记提取失败
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error('获取书籍详情失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
      if (error.statusText !== 'OK (Offline Cache)' && error.statusText !== 'OK (Offline, No Cache)') {
        // 只有在在线且确实失败时才显示错误
        if (navigator.onLine) {
          toast.error('获取书籍详情失败');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const checkShelf = async () => {
    try {
      const response = await api.get(`/shelf/check/${id}`);
      setInShelf(response.data.inShelf);
    } catch (error) {
      console.error('检查书架状态失败:', error);
    }
  };

  const handleAddToShelf = async () => {
    try {
      await api.post('/shelf/add', { bookId: id });
      setInShelf(true);
      toast.success('已收藏');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '收藏失败');
    }
  };

  const handleRemoveFromShelf = async () => {
    try {
      await api.delete(`/shelf/remove/${id}`);
      setInShelf(false);
      toast.success('已取消收藏');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '取消收藏失败');
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
    
    // 导航到阅读页面
    navigate(`/reader/${readingBookId}`);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      // 如果 cover_url 是空字符串，转换为 null 以清空封面
      const updateData = {
        ...editForm,
        cover_url: editForm.cover_url === '' ? null : editForm.cover_url,
      };
      await api.put(`/books/${id}`, updateData);
      // 保存后不自动提取封面，所以先设置标志
      setAutoExtractAttempted(true);
      await fetchBook();
      setShowEditModal(false);
      toast.success('更新成功');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '更新失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenEditModal = () => {
    if (book) {
      setEditForm(book);
      setShowEditModal(true);
    }
  };

  // 触摸事件相关状态
  const touchStartTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressThreshold = 500; // 长按阈值：500ms

  // 处理封面双击（PC端）或双击触摸（移动端）
  const handleCoverDoubleClick = () => {
    if (isAuthenticated && (user?.role === 'admin' || user?.id === book?.uploader_id)) {
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
  const handleTouchCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  // 处理文件选择
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
    if (!id || !book) return;

    // 检查文件类型是否支持
    if (book.file_type !== 'epub' && book.file_type !== 'pdf') {
      toast.error('仅支持从 EPUB 或 PDF 格式的书籍中提取封面');
      return;
    }

    setUploadingCover(true);
    try {
      // 先尝试提取封面（不强制，用于预览）
      const response = await api.post(`/books/${id}/extract-cover`, { force: false });
      
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
    if (!id) return;

    setUploadingCover(true);
    try {
      // 强制提取并覆盖
      const response = await api.post(`/books/${id}/extract-cover`, { force });
      
      if (response.data.success === false) {
        toast.error(response.data.error || '提取封面失败');
        return;
      }

      if (response.data.cover_url) {
        toast.success('封面提取成功');
        setBook({ ...book!, cover_url: response.data.cover_url });
        setShowCoverUploadModal(false);
        setShowExtractCoverConfirm(false);
        setExtractedCoverUrl(null);
        await fetchBook();
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
    if (!id) return;

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
        
        const response = await api.post(`/books/${id}/upload-cover`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        toast.success('封面上传成功');
        setBook({ ...book!, cover_url: response.data.cover_url });
      } else if (coverUploadMode === 'url' && coverUrl) {
        // URL下载
        const response = await api.post(`/books/${id}/cover-from-url`, {
          imageUrl: coverUrl,
        });
        
        toast.success('封面下载成功');
        setBook({ ...book!, cover_url: response.data.cover_url });
      }
      
      setShowCoverUploadModal(false);
      await fetchBook();
    } catch (error: any) {
      console.error('上传封面失败:', error);
      toast.error(error.response?.data?.error || '上传封面失败');
    } finally {
      setUploadingCover(false);
    }
  };

  // 提取封面
  const handleExtractCover = async () => {
    const currentBook = book;
    if (!currentBook || (currentBook.file_type !== 'epub' && currentBook.file_type !== 'pdf')) {
      return; // 静默失败，不显示错误
    }

    setExtractingCover(true);
    try {
      const response = await api.post(`/books/${id}/extract-cover`);
      
      // 检查响应中的 success 字段
      if (response.data.success === false) {
        // 后端返回失败但不是HTTP错误
        const errorMsg = response.data.error || response.data.message || '提取封面失败';
        console.error('[提取封面] 失败:', errorMsg);
        if (response.data.hint) {
          console.error('[提取封面] 提示:', response.data.hint);
        }
        // 只在手动点击时显示错误消息
        if (!loading) {
          toast.error(errorMsg);
        }
        setExtractCoverFailed(true); // 标记提取失败
        return;
      }
      
      // 提取成功
      if (response.data.cover_url) {
        setBook({ ...currentBook, cover_url: response.data.cover_url });
        // 只在手动点击时显示成功消息
        if (!loading) {
          toast.success('封面提取成功');
        }
        } else {
        // 没有返回封面URL
        console.warn('[提取封面] 未返回封面URL');
        if (!loading) {
          toast.error('封面提取失败：未返回封面URL');
        }
        setExtractCoverFailed(true); // 标记提取失败
      }
    } catch (error: any) {
      // HTTP错误
      console.error('[提取封面] HTTP错误:', error);
      // 只在手动点击时显示错误消息
      if (!loading) {
        const errorMsg = error.response?.data?.error || 
                        error.response?.data?.message || 
                        error.message || 
                        '提取封面失败';
        toast.error(errorMsg);
      }
      setExtractCoverFailed(true); // 标记提取失败
    } finally {
      setExtractingCover(false);
    }
  };

  // 删除书籍
  const handleDelete = async () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await api.delete(`/books/${id}`);
      toast.success('删除成功');
      navigate('/books');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '删除失败');
    }
  };

  // 下载书籍
  const handleDownload = async () => {
    try {
      // 使用选中的格式ID（如果有多个格式）
      const downloadFormatId = selectedFormatId || id;
      const downloadBook = formats.find(f => f.id === downloadFormatId) || book;
      
      const response = await api.get(`/books/${id}/download`, {
        params: { formatId: downloadFormatId !== id ? downloadFormatId : undefined },
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

  // 推送书籍
  const handlePush = async () => {
    if (!pushEmail || !pushEmail.includes('@')) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    // 确定要推送的格式ID
    const formatIdToPush = pushFormatId || selectedFormatId || id;
    if (!formatIdToPush) {
      toast.error('无法确定要推送的书籍格式');
      return;
    }

    setPushing(true);
    try {
      await api.post(`/books/${formatIdToPush}/push`, { email: pushEmail });
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


  // 检查是否有删除权限
  const canDelete = () => {
    if (!isAuthenticated || !user || !book) return false;
    return user.role === 'admin' || book.uploader_id === user.id;
  };

  // 检查是否有推送权限（所有已登录用户都可以推送，只要邮件推送功能已启用）
  const canPush = () => {
    if (!isAuthenticated || !user) return false;
    return emailPushEnabled;
  };

  // 获取豆瓣书籍信息
  const handleFetchDoubanInfo = async () => {
    if (!id || !book) return;
    
    setLoadingDouban(true);
    setShowDoubanModal(true);
    setDoubanResults([]);

    try {
      const response = await api.get(`/books/${id}/search-douban`);
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
    if (!id) return;

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
    if (!id) return;
    setApplyingDouban(true);
    try {
      await api.post(`/books/${id}/apply-douban-info`, {
        ...doubanInfo,
        replaceCover,
      });
      toast.success('书籍信息已更新');
      setShowDoubanModal(false);
      setDoubanResults([]);
      setShowCoverReplaceConfirm(false);
      setPendingDoubanInfo(null);
      await fetchBook();
    } catch (error: any) {
      console.error('应用豆瓣信息失败:', error);
      toast.error(error.response?.data?.error || '更新失败');
    } finally {
      setApplyingDouban(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">书籍不存在</p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
      style={{
        // 移动端底部padding，考虑底部导航栏和安全区域
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        // 移动端顶部padding，考虑顶部导航栏和安全区域
        paddingTop: 'clamp(20px, env(safe-area-inset-top, 20px), 44px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 md:py-4 lg:py-6">
        {/* 主要内容区域：左侧封面 + 右侧信息 */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 mb-4 md:mb-6">
          {/* 左侧：封面图片 */}
          <div className="md:col-span-4 lg:col-span-3">
            <div className="w-full max-w-[140px] sm:max-w-[160px] md:max-w-[180px] lg:max-w-[200px] mx-auto md:mx-0">
              {/* 封面图片 */}
              <div 
                className="group relative w-full aspect-[3/4] mb-3"
                onDoubleClick={handleCoverDoubleClick}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                title={isAuthenticated && (user?.role === 'admin' || user?.id === book.uploader_id) ? '双击或长按上传封面' : ''}
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
              
              {/* 编辑按钮 - 封面正下方 */}
              {isAuthenticated && (user?.role === 'admin' || user?.id === book.uploader_id) && (
                <div className="flex justify-center">
                  <button
                    onClick={handleOpenEditModal}
                    className="group px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-all duration-200 hover:shadow-md flex items-center gap-1.5 text-xs"
                    title="编辑书籍信息"
                  >
                    <Edit className="w-3 h-3 transition-transform group-hover:scale-110" />
                    <span className="font-medium">编辑</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 右侧：标题、作者等信息和操作按钮 */}
          <div className="md:col-span-8 lg:col-span-9">
            <div className="card-gradient rounded-xl shadow-lg overflow-hidden">
              {/* 右侧上部分：标题和作者等信息 */}
              <div className="p-3 md:p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg md:text-2xl lg:text-3xl font-bold mb-2 md:mb-3 bg-gradient-to-r from-gray-900 via-blue-800 to-gray-900 dark:from-gray-100 dark:via-blue-200 dark:to-gray-100 bg-clip-text text-transparent leading-tight">
                    {book.title}
                  </h1>
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap mb-2 md:mb-3">
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
                  {/* 上传者和上传日期 */}
                  {(book.uploader_username || book.created_at) && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 md:mb-3">
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
                  {/* 书籍介绍 */}
                  {book.description && (
                    <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-2 md:mt-3 line-clamp-2 md:line-clamp-3">
                      {book.description}
                    </p>
                  )}
                </div>
              </div>

              {/* 右侧下部分：操作按钮 */}
              {isAuthenticated && (
                <div className="p-3 md:p-4 lg:p-6 space-y-3">
                  {/* 格式选择（如果有多个格式，排除mobi） */}
                  {formats.filter((f: BookDetail) => f.file_type.toLowerCase() !== 'mobi').length > 1 && (
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
                  
                  {/* 主要操作按钮 */}
                  <button
                    onClick={handleStartReading}
                    className="w-full bg-gradient-to-r from-blue-600 via-blue-500 to-purple-600 hover:from-blue-700 hover:via-blue-600 hover:to-purple-700 text-white font-semibold text-sm md:text-base py-3 md:py-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    <BookOpen className="w-4 h-4 md:w-5 md:h-5" />
                    <span>开始阅读{formats.length > 1 && selectedFormatId ? ` (${formats.find(f => f.id === selectedFormatId)?.file_type.toUpperCase()})` : ''}</span>
                  </button>
                  
                  {/* 操作按钮 */}
                  <div className={`grid gap-1.5 md:gap-2 ${canDelete() ? 'grid-cols-5' : 'grid-cols-4'}`}>
                    {inShelf ? (
                      <button
                        onClick={handleRemoveFromShelf}
                        className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm"
                        title="取消收藏"
                      >
                        <Heart className="w-3.5 h-3.5 md:w-4 md:h-4 fill-red-500 text-red-500 transition-transform group-hover:scale-110" />
                        <span className="text-[9px] md:text-[10px] font-medium">已收藏</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleAddToShelf}
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
                      onClick={handleFetchDoubanInfo}
                      disabled={loadingDouban}
                      className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title="获取书籍信息"
                    >
                      <Search className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${loadingDouban ? 'animate-spin' : 'group-hover:scale-110'}`} />
                      <span className="text-[9px] md:text-[10px] font-medium">信息</span>
                    </button>
                    {/* 推送按钮 - 始终显示，但根据功能启用状态和登录状态启用/禁用 */}
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
                        onClick={handleDelete}
                        className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 rounded-lg py-2 md:py-2.5 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:shadow-sm"
                        title="删除书籍"
                      >
                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 transition-transform group-hover:scale-110" />
                        <span className="text-[9px] md:text-[10px] font-medium">删除</span>
                      </button>
                    )}
                  </div>
                  
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
              )}
            </div>
          </div>
        </div>

        {/* 下方：详细信息内容 */}
        <div className="mt-4 md:mt-6">
          <div className="card-gradient rounded-xl shadow-lg overflow-hidden">
              {/* 书籍详细信息卡片 */}
              <div className="p-3 md:p-4 lg:p-5 space-y-2 md:space-y-3">
                {/* 基本信息 - 统一整齐的卡片样式 */}
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                  {book.category && (
                    <div className="group flex items-center gap-2 p-2 md:p-3 bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-blue-900/20 dark:via-gray-800 dark:to-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200">
                      <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center">
                        <Tag className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide">分类</div>
                        <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {book.category}
                        </div>
                      </div>
                    </div>
                  )}
                  {book.language && (
                    <div className="group flex items-center gap-2 p-2 md:p-3 bg-gradient-to-br from-green-50 via-white to-green-50 dark:from-green-900/20 dark:via-gray-800 dark:to-green-900/20 rounded-lg border border-green-100 dark:border-green-800/50 hover:border-green-300 dark:hover:border-green-700 transition-all duration-200">
                      <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-green-500 to-green-600 dark:from-green-600 dark:to-green-700 flex items-center justify-center">
                        <Globe className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide">语言</div>
                        <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100">
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
                    <div className="group flex items-center gap-2 p-2 md:p-3 bg-gradient-to-br from-purple-50 via-white to-purple-50 dark:from-purple-900/20 dark:via-gray-800 dark:to-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800/50 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200">
                      <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700 flex items-center justify-center">
                        <Book className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide">出版社</div>
                        <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                          {book.publisher}
                        </div>
                      </div>
                    </div>
                  )}
                  {book.publish_date && (
                    <div className="group flex items-center gap-2 p-2 md:p-3 bg-gradient-to-br from-orange-50 via-white to-orange-50 dark:from-orange-900/20 dark:via-gray-800 dark:to-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-800/50 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-200">
                      <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 flex items-center justify-center">
                        <Clock className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide">出版日期</div>
                        <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {book.publish_date}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="group flex items-center gap-2 p-2 md:p-3 bg-gradient-to-br from-indigo-50 via-white to-indigo-50 dark:from-indigo-900/20 dark:via-gray-800 dark:to-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/50 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200">
                    <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700 flex items-center justify-center">
                      <FileText className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide">ISBN</div>
                      <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">
                        {book.isbn || <span className="text-gray-400 dark:text-gray-500 italic">未设置</span>}
                      </div>
                    </div>
                  </div>
                  <div className="group flex items-center gap-2 p-2 md:p-3 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
                    <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
                      <FileText className="w-4 h-4 md:w-4.5 md:h-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wide">文件格式</div>
                      <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formats.length > 1 ? (
                          <div className="flex flex-wrap gap-0.5">
                            {formats.map((format) => (
                              <span
                                key={format.id}
                                className="inline-block px-1.5 py-0.5 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded font-mono uppercase text-[10px]"
                              >
                                {format.file_type}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded font-mono uppercase text-xs">
                            {book.file_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 标签 */}
                {book.tags && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">标签</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {book.tags.split(',').map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-full text-[10px] md:text-xs font-medium shadow-sm"
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

      {/* 推送书籍模态框 */}
      {showPushModal && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4" style={{ backgroundColor: '#000000' }}>
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

                {/* 格式选择（如果有多个格式，包含mobi） */}
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
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
          <div className="card-gradient rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">从豆瓣获取书籍信息</h2>
              <button
                onClick={() => {
                  setShowDoubanModal(false);
                  setDoubanResults([]);
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
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
                        className="w-full mt-4 btn btn-primary"
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
                className="btn btn-secondary"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
          <div className="card-gradient rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">确认删除</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复</p>
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  确定要删除 <span className="font-semibold text-gray-900 dark:text-gray-100">《{book?.title}》</span> 吗？
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  ⚠️ 删除后书籍文件和相关数据将被永久删除，无法恢复
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 封面替换确认弹窗 */}
      {showCoverReplaceConfirm && pendingDoubanInfo && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
          <div className="card-gradient rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
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
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">✓</span>
                    <span><strong>替换封面：</strong>从豆瓣下载封面图片到书籍目录，并替换当前封面</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">○</span>
                    <span><strong>仅更新信息：</strong>保留当前封面，只更新书名、作者、简介等文本信息</span>
                  </li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCoverReplaceConfirm(false);
                    applyDoubanInfo(pendingDoubanInfo, false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  仅更新信息
                </button>
                <button
                  onClick={() => {
                    setShowCoverReplaceConfirm(false);
                    applyDoubanInfo(pendingDoubanInfo, true);
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  替换封面
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑书籍信息模态窗口 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4" style={{ backgroundColor: '#000000' }}>
          <div className="card-gradient rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">编辑书籍信息</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">标题 *</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">作者</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.author || ''}
                    onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                  />
                </div>
              </div>

              {/* 出版信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">ISBN</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.isbn || ''}
                    onChange={(e) => setEditForm({ ...editForm, isbn: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">出版社</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.publisher || ''}
                    onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">出版日期</label>
                  <input
                    type="text"
                    className="input"
                    value={editForm.publish_date || ''}
                    onChange={(e) => setEditForm({ ...editForm, publish_date: e.target.value })}
                    placeholder="YYYY-MM-DD"
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
                    className="input"
                    value={editForm.language || ''}
                    onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">评分</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    className="input"
                    value={editForm.rating || ''}
                    onChange={(e) => setEditForm({ ...editForm, rating: parseFloat(e.target.value) || undefined })}
                  />
                </div>
              </div>

              {/* 封面图片地址 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">封面图片地址</label>
                <input
                  type="text"
                  className="input"
                  value={editForm.cover_url || ''}
                  onChange={(e) => setEditForm({ ...editForm, cover_url: e.target.value })}
                  placeholder="例如：/books/xxx/cover.jpg 或 https://example.com/cover.jpg"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  可以是本地路径（/books/...）或在线图片URL（http://...）
                  {editForm.cover_url && editForm.cover_url.startsWith('http') && (
                    <span className="text-amber-600 dark:text-amber-400 ml-2">
                      ⚠️ 使用在线URL可能影响加载速度
                    </span>
                  )}
                </p>
              </div>

              {/* 标签 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">标签</label>
                <input
                  type="text"
                  className="input"
                  value={editForm.tags || ''}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="多个标签用逗号分隔"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">例如：科幻, 小说, 刘慈欣</p>
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">简介/描述</label>
                <textarea
                  className="input"
                  rows={8}
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="请输入书籍的详细简介或描述..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持多行文本，建议详细描述书籍内容</p>
              </div>
            </div>

            {/* 底部操作按钮 */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={savingEdit}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    保存更改
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 封面上传模态窗口 */}
      {showCoverUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="card-gradient rounded-lg shadow-xl w-full max-w-md">
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
                      onChange={handleCoverFileChange}
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
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
          <div className="card-gradient rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
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
        </div>
      )}
    </div>
  );
}

