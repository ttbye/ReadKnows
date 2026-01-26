/**
 * @file BookList.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import api, { getCurrentApiUrl, debugApiConfig, getCustomApiUrl } from '../utils/api';
import { Book, Search, Grid3x3, List, ChevronLeft, ChevronRight, ArrowUpDown, Clock, ArrowUp, ArrowDown, Star, Calendar, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCoverUrl } from '../utils/coverHelper';
import { useAuthStore } from '../store/authStore';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';
import { offlineDataCache } from '../utils/offlineDataCache';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import BookDetailModal from '../components/BookDetailModal';
import { useTranslation } from 'react-i18next';

interface BookItem {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  description?: string;
  file_type: string;
  rating?: number;
  created_at?: string;
  uploader_id?: string;
  uploader_username?: string;
  category?: string;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'created_at' | 'title' | 'author' | 'rating';
type SortOrder = 'desc' | 'asc';

export default function BookList() {
  const { t } = useTranslation();
  const isNoteBook = (b: BookItem) => {
    const title = (b?.title || '').toString();
    return b?.category === '笔记' || title.includes('[笔记]');
  };
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookItem[]>([]);
  const [recentBooks, setRecentBooks] = useState<BookItem[]>([]);
  const [recommendedBooks, setRecommendedBooks] = useState<BookItem[]>([]);
  const [recentReadBooks, setRecentReadBooks] = useState<BookItem[]>([]);
  const [privateBooks, setPrivateBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''); // 输入框的值
  const [searchQuery, setSearchQuery] = useState(''); // 实际用于搜索的关键词
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuPosition, setSortMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedScope, setSelectedScope] = useState<string>('all'); // all, public, private, shared, group
  const [bookCategories, setBookCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showBookDetailModal, setShowBookDetailModal] = useState(false);
  // 记录各筛选类型的书籍数量（用于决定是否显示筛选按钮）
  const [scopeCounts, setScopeCounts] = useState<{ [key: string]: number }>({
    all: 0,
    public: 0,
    private: 0,
    shared: 0,
    group: 0,
  });
  const limit = 20;

  // 监听网络状态
  const { isOnline, checkAndResetOfflineFlag } = useNetworkStatus();

  useEffect(() => {
    // 安全修复：仅在开发环境显示API配置，避免生产环境泄露敏感信息
    if (import.meta.env.DEV) {
      debugApiConfig();
      console.log('[BookList] 当前 API 地址:', getCurrentApiUrl());
    }
    
    // 如果配置了自定义服务器地址，优先从网络获取，不使用缓存
    const customApiUrl = getCustomApiUrl();
    if (customApiUrl && customApiUrl.trim()) {
      console.log('[BookList] 检测到自定义服务器地址，跳过缓存，直接从网络获取');
      // 直接从网络获取，不使用缓存
      fetchAllData();
      return;
    }
    
    // 如果没有自定义服务器地址，才使用缓存策略
    // 先尝试从缓存加载数据（快速显示）
    loadFromCache().then((hasData) => {
      // 如果从缓存加载到数据，先显示缓存数据
      // 然后从网络获取最新数据（如果在线）
      if (offlineDataCache.isOnline()) {
        // 延迟200ms再获取网络数据，让缓存数据先显示
        setTimeout(() => {
          fetchAllData();
        }, 200);
      } else {
        // 离线时，无论是否有缓存数据，都不显示loading了
        setLoading(false);
      }
    }).catch(() => {
      // 缓存加载失败，尝试从网络获取
      if (offlineDataCache.isOnline()) {
        fetchAllData();
      } else {
        // 离线且无缓存，显示空状态
        setLoading(false);
      }
    });
  }, []);

  // 监听“书籍列表变更”事件（如：导出笔记生成新书），强制刷新列表
  useEffect(() => {
    const onBooksChanged = () => {
      // 直接从网络刷新（内部已处理离线与缓存兜底）
      fetchAllData();
      fetchBookCategories();
    };
    window.addEventListener('__books_changed', onBooksChanged as any);
    return () => window.removeEventListener('__books_changed', onBooksChanged as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // 监听网络状态变化：从离线恢复时自动刷新
  useEffect(() => {
    if (checkAndResetOfflineFlag()) {
      console.log('网络已恢复，自动刷新数据');
      toast.success('网络已连接，正在刷新数据...', { duration: 2000 });
      // 延迟一小段时间确保网络稳定
      setTimeout(() => {
        fetchAllData();
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // 从缓存加载数据（用于快速显示）
  const loadFromCache = async (): Promise<boolean> => {
    try {
      const cachePromises = [
        offlineDataCache.get('/api/books', { page: 1, limit, sort: sortBy, order: sortOrder }),
        offlineDataCache.get('/api/books/recent', { limit: 20 }),
        offlineDataCache.get('/api/books/recommended', { limit: 20 }),
        isAuthenticated && offlineDataCache.get('/api/reading/progress', { limit: 20 }),
        isAuthenticated && offlineDataCache.get('/api/books', { limit: 20, scope: 'private' }),
      ];

      const [cachedBooks, cachedRecent, cachedRecommended, cachedRecentRead, cachedPrivate] = await Promise.all(cachePromises);

      let hasData = false;

      if (cachedBooks?.books) {
        setBooks(cachedBooks.books);
        setTotal(cachedBooks.pagination?.total || 0);
        hasData = true;
      }
      if (cachedRecent?.books) {
        setRecentBooks(cachedRecent.books);
        hasData = true;
      }
      if (cachedRecommended?.books) {
        setRecommendedBooks(cachedRecommended.books);
        hasData = true;
      }
      if (cachedRecentRead?.progresses) {
        const books = cachedRecentRead.progresses.map((p: any) => ({
          id: p.book_id,
          title: p.title,
          author: p.author,
          cover_url: p.cover_url,
          file_type: p.file_type,
          rating: p.rating,
        }));
        setRecentReadBooks(Array.from(new Map(books.map((book: any) => [book.id, book])).values()) as BookItem[]);
        hasData = true;
      }
      if (cachedPrivate?.books) {
        setPrivateBooks(cachedPrivate.books as BookItem[]);
        hasData = true;
      }

      return hasData;
    } catch (error) {
      console.warn('从缓存加载数据失败:', error);
      return false;
    }
  };

  useEffect(() => {
    // 只有在没有搜索关键词时才获取书籍列表
    if (!searchQuery) {
    fetchBooks();
    }
  }, [page, searchQuery, sortBy, sortOrder, selectedCategory, selectedScope]);

  // 获取书籍分类统计（延迟加载，避免阻塞页面）
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookCategories();
      // 同时获取各筛选类型的书籍数量
      if (isAuthenticated) {
        fetchScopeCounts();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const fetchBookCategories = async () => {
    try {
      const response = await api.get('/books/categories', {
        timeout: 3000, // 3秒超时
      });
      
      // 处理不同的响应格式，保留 count 字段
      let categories: Array<{ category: string; count: number }> = [];
      if (Array.isArray(response.data.categories)) {
        // 如果是对象数组 [{category: 'xxx', count: 1}]
        if (response.data.categories.length > 0 && typeof response.data.categories[0] === 'object') {
          categories = response.data.categories.map((item: any) => ({
            category: item.category || item.name || String(item),
            count: typeof item.count === 'number' ? item.count : 0,
          }));
        } else {
          // 如果是字符串数组，转换为对象数组（count设为0或从其他地方获取）
          categories = response.data.categories.map((cat: string) => ({
            category: cat,
            count: 0, // 字符串数组没有count信息，设为0
          }));
        }
      } else if (response.data.categories && typeof response.data.categories === 'object') {
        // 如果是对象 {category: count}，转换为数组格式
        categories = Object.entries(response.data.categories).map(([category, count]) => ({
          category,
          count: typeof count === 'number' ? count : 0,
        }));
      }
      
      setBookCategories(categories);
    } catch (error: any) {
      console.error('获取书籍分类统计失败:', error);
      // 网络错误时静默失败，不影响主功能
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID' && error.code !== 'ECONNABORTED') {
        // 使用默认分类（对象格式）
        setBookCategories([{ category: '未分类', count: 0 }]);
      }
    }
  };

  // 移动端下滑加载更多
  useEffect(() => {
    if (!isMobile() || !hasMore || loading) return;

    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, page]);

  const isMobile = () => window.innerWidth <= 768;

  const fetchAllData = async () => {
    // 如果离线，先尝试从缓存加载
    if (!offlineDataCache.isOnline()) {
      const hasCache = await loadFromCache();
      if (hasCache) {
        setLoading(false);
        return; // 离线且有缓存，直接返回
      }
    }

    setLoading(true);
    try {
      // 优先加载关键数据（书籍列表）
      await fetchBooks();
      
      // 延迟加载非关键数据，避免阻塞页面渲染
      setTimeout(() => {
        Promise.all([
          fetchRecentBooks(),
          fetchRecommendedBooks(),
          isAuthenticated && fetchRecentReadBooks(),
          isAuthenticated && fetchPrivateBooks(),
        ]).catch((error) => {
          // 静默失败，不影响主列表显示
          console.error('获取辅助数据失败:', error);
        });
      }, 200);
    } catch (error: any) {
      console.error('获取数据失败:', error);
      
      // 离线时，尝试从缓存加载
      if (!offlineDataCache.isOnline()) {
        const hasCache = await loadFromCache();
        if (hasCache) {
          // 有缓存数据，不显示错误
          setLoading(false);
          return;
        }
      }
      
      // 如果是离线缓存的数据，不显示错误提示
      if (!error.isCached && !error.response?.data?.data && offlineDataCache.isOnline()) {
        toast.error('获取数据失败，请检查网络连接');
      }
    } finally {
      setLoading(false);
    }
  };

  // 下拉刷新
  const handleRefresh = async () => {
    setPage(1);
    setSelectedCategory('all');
    setSelectedScope('all');
    await fetchAllData();
    await fetchBookCategories();
    if (isAuthenticated) {
      await fetchScopeCounts();
    }
    toast.success(
      (toastInstance) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '0.5s' }} />
          </div>
          <div>
            <div className="font-semibold text-white">{t('shelf.refreshSuccess')}</div>
            <div className="text-xs text-white/80 mt-0.5">{t('shelf.shelfUpdated')}</div>
          </div>
        </div>
      ),
      {
        duration: 2000,
        style: {
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '16px 20px',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4), 0 4px 12px rgba(5, 150, 105, 0.3)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        },
        iconTheme: {
          primary: 'transparent',
          secondary: 'transparent',
        },
      }
    );
  };

  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 获取各筛选类型的书籍数量（用于决定是否显示筛选按钮）
  const fetchScopeCounts = async () => {
    if (!isAuthenticated) return;
    
    try {
      const scopes = ['all', 'public', 'private', 'shared', 'group'];
      const countPromises = scopes.map(async (scope) => {
        try {
          const params: any = { page: 1, limit: 1 };
          if (scope !== 'all') {
            params.scope = scope;
          }
          const response = await api.get('/books', { params, timeout: 3000 });
          return {
            scope,
            count: response.data.pagination?.total || 0,
          };
        } catch (error) {
          console.warn(`获取 ${scope} 类型书籍数量失败:`, error);
          return { scope, count: 0 };
        }
      });
      
      const results = await Promise.all(countPromises);
      const newScopeCounts: { [key: string]: number } = {};
      results.forEach((result) => {
        newScopeCounts[result.scope] = result.count;
      });
      setScopeCounts(newScopeCounts);
    } catch (error) {
      console.error('获取筛选类型书籍数量失败:', error);
    }
  };

  const fetchBooks = async () => {
    try {
      const params: any = { 
        page, 
        limit, 
        search: searchQuery || undefined,
        sort: sortBy,
        order: sortOrder,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
      };
      
      // 根据选择的scope添加筛选参数
      if (selectedScope === 'public') {
        params.scope = 'public';
      } else if (selectedScope === 'private') {
        params.scope = 'private';
      } else if (selectedScope === 'shared') {
        params.scope = 'shared';
      } else if (selectedScope === 'group') {
        params.scope = 'group';
      }
      
      const response = await api.get('/books', { 
        params,
        timeout: 5000, // 5秒超时
      });
      
      if (page === 1) {
        setBooks(response.data.books || []);
        // 更新当前筛选类型的数量
        const currentTotal = response.data.pagination?.total || 0;
        setScopeCounts(prev => {
          const updated = { ...prev };
          updated[selectedScope] = currentTotal;
          // 如果是 "all" 类型，也更新 total（用于判断是否显示筛选区域）
          if (selectedScope === 'all') {
            updated.all = currentTotal;
          }
          return updated;
        });
      } else {
        setBooks(prev => [...prev, ...(response.data.books || [])]);
      }
      
      setTotal(response.data.pagination?.total || 0);
      setHasMore((response.data.books || []).length === limit);
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      toast.error(t('book.fetchBooksFailed'));
    }
  };

  const fetchRecentBooks = async () => {
    try {
      const response = await api.get('/books/recent', {
        params: { limit: 20 },
        timeout: 3000, // 3秒超时
      });
      const books: BookItem[] = response.data.books || [];
      // 去重：根据book_id去重
      const uniqueBooks: BookItem[] = Array.from(
        new Map(books.map((book) => [book.id, book])).values()
      );
      setRecentBooks(uniqueBooks);
    } catch (error: any) {
      console.error('获取最近新增书籍失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
    }
  };

  const fetchRecommendedBooks = async () => {
    try {
      const response = await api.get('/books/recommended', {
        params: { limit: 20 },
        timeout: 3000, // 3秒超时
      });
      const books: BookItem[] = response.data.books || [];
      // 去重：根据book_id去重
      const uniqueBooks: BookItem[] = Array.from(
        new Map(books.map((book) => [book.id, book])).values()
      );
      setRecommendedBooks(uniqueBooks);
    } catch (error: any) {
      console.error('获取推荐书籍失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
    }
  };

  const fetchRecentReadBooks = async () => {
    try {
      const response = await api.get('/reading/progress', {
        params: { limit: 20 },
        timeout: 3000, // 3秒超时
      });
      const books: BookItem[] = response.data.progresses?.map((p: any) => ({
        id: p.book_id,
        title: p.title,
        author: p.author,
        cover_url: p.cover_url,
        file_type: p.file_type,
        rating: p.rating,
      })) || [];
      // 去重：根据book_id去重
      const uniqueBooks: BookItem[] = Array.from(
        new Map(books.map((book) => [book.id, book])).values()
      );
      setRecentReadBooks(uniqueBooks);
    } catch (error: any) {
      console.error('获取最近阅读失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
    }
  };

  const fetchPrivateBooks = async () => {
    try {
      const response = await api.get('/books', {
        params: { limit: 20, scope: 'private' },
        timeout: 3000, // 3秒超时
      });
      const books: BookItem[] = response.data.books || [];
      // 去重：根据book_id去重
      const uniqueBooks: BookItem[] = Array.from(
        new Map(books.map((book) => [book.id, book])).values()
      );
      setPrivateBooks(uniqueBooks);
    } catch (error: any) {
      console.error('获取私人书籍失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
    }
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    setPage(prev => prev + 1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) {
      toast.error(t('book.enterSearchKeyword'));
      return;
    }
    // 跳转到搜索结果页面
    navigate(`/search?q=${encodeURIComponent(search.trim())}&scope=all`);
  };


  const BookCard = ({ book }: { book: BookItem }) => (
    <div
      onClick={() => {
        setSelectedBookId(book.id);
        setShowBookDetailModal(true);
      }}
      className="group block h-full cursor-pointer relative z-0"
    >
      <div className="card-gradient overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 h-full flex flex-col">
        <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative flex-shrink-0 w-full">
          {(() => {
            const coverUrl = getCoverUrl(book.cover_url);
            return coverUrl ? (
              <img
                src={coverUrl}
                alt={book.title}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                style={{ minWidth: '100%', minHeight: '100%' }}
                onContextMenu={(e) => e.preventDefault()}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `
                      <div class="w-full h-full flex items-center justify-center">
                        <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                        </svg>
                      </div>
                    `;
                  }
                }}
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Book className="w-12 h-12 text-gray-400 dark:text-gray-500" />
              </div>
            );
          })()}
          {isNoteBook(book) && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-black/70 text-white backdrop-blur">
              {t('book.note')}
            </div>
          )}
          {book.rating && (
            <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span>⭐</span>
              <span>{book.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <div className="p-1.5 flex-1 flex flex-col justify-between min-h-[48px]">
          <h3 className="font-semibold text-xs line-clamp-2 mb-0.5 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words" title={book.title}>
            {book.title.length > 20 ? `${book.title.substring(0, 20)}...` : book.title}
          </h3>
          <div className="mt-auto space-y-0.5">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
            {book.author || t('book.unknownAuthor')}
          </p>
          </div>
        </div>
      </div>
    </div>
  );

  const BookListItem = ({ book }: { book: BookItem }) => (
    <div
      onClick={() => {
        setSelectedBookId(book.id);
        setShowBookDetailModal(true);
      }}
      className="group flex gap-3 sm:gap-4 p-3 sm:p-4 bg-white dark:bg-gray-800 rounded-lg hover:shadow-md transition-all border border-gray-200 dark:border-gray-700 cursor-pointer"
    >
      <div className="w-16 h-24 sm:w-20 sm:h-28 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded overflow-hidden aspect-[3/4] relative">
        {(() => {
          const coverUrl = getCoverUrl(book.cover_url);
          return coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title}
              className="w-full h-full object-cover object-center"
              style={{ minWidth: '100%', minHeight: '100%' }}
              onContextMenu={(e) => e.preventDefault()}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                const imgSrc = target.src;
                console.error('[BookList] 封面图片加载失败:', {
                  title: book.title,
                  coverUrl: book.cover_url,
                  finalUrl: imgSrc,
                });
                
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = `
                    <div class="w-full h-full flex items-center justify-center">
                      <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                      </svg>
                    </div>
                  `;
                }
              }}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Book className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
          );
        })()}
        {isNoteBook(book) && (
          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-black/70 text-white backdrop-blur">
            {t('book.note')}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm sm:text-base mb-1 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 break-words" title={book.title}>
          {book.title.length > 30 ? `${book.title.substring(0, 30)}...` : book.title}
        </h3>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2">
          {book.author || t('book.unknownAuthor')}
        </p>
        {book.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 hidden sm:block">
            {book.description}
          </p>
        )}
        {book.rating && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-yellow-500 text-xs">⭐</span>
            <span className="text-xs text-gray-600 dark:text-gray-400">{book.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );

  const HorizontalBookList = ({ title, books: bookList, loading: listLoading }: { title: string; books: BookItem[]; loading?: boolean }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
      if (scrollRef.current) {
        const scrollAmount = 300;
        scrollRef.current.scrollBy({
          left: direction === 'left' ? -scrollAmount : scrollAmount,
          behavior: 'smooth',
        });
      }
    };

    if (listLoading || bookList.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="w-1 h-5 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
            {title}
          </h2>
          <div className="flex gap-1.5">
            <button
              onClick={() => scroll('left')}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title={t('book.scrollLeft')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title={t('book.scrollRight')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 md:gap-5 overflow-x-auto scrollbar-hide pb-2 scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {bookList.map((book) => (
            <div key={book.id} className="flex-shrink-0 w-32 sm:w-36 md:w-40 lg:w-44">
              <BookCard book={book} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <PullToRefreshIndicator 
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />
      <div className="w-full pt-4 lg:pt-6">
        <div className="mb-6">
          {/* 搜索栏 - 扁平现代设计 */}
          <div className="px-4 py-4 mb-4">
          <form onSubmit={handleSearch} className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Search className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  type="text"
                  placeholder={t('book.searchPlaceholder')}
                    className="w-full pl-14 pr-12 py-3 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-all shadow-sm hover:shadow-md"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button 
                type="submit" 
                  className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
                  title={t('common.search')}
              >
                  <Search className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {loading && page === 1 ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>

          {/* 最近新增 */}
          {recentBooks.length > 0 && (
            <HorizontalBookList title={t('book.recentAdded')} books={recentBooks} />
          )}

          {/* 私人书籍（仅登录用户）- 移动到最近新增下方 */}
          {isAuthenticated && privateBooks.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <div className="w-1 h-5 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{t('book.myBooks')}</span>
                </h2>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      const scrollRef = document.getElementById('private-books-scroll');
                      if (scrollRef) {
                        scrollRef.scrollBy({ left: -300, behavior: 'smooth' });
                      }
                    }}
                    className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
                    title={t('book.scrollLeft')}
                  >
                    <ChevronLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </button>
                  <button
                    onClick={() => {
                      const scrollRef = document.getElementById('private-books-scroll');
                      if (scrollRef) {
                        scrollRef.scrollBy({ left: 300, behavior: 'smooth' });
                      }
                    }}
                    className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
                    title={t('book.scrollRight')}
                  >
                    <ChevronRight className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </button>
                </div>
              </div>
              <div
                id="private-books-scroll"
                className="flex gap-3 sm:gap-4 md:gap-5 overflow-x-auto scrollbar-hide pb-2 scroll-smooth"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {privateBooks.map((book) => (
                  <div key={book.id} className="flex-shrink-0 w-32 sm:w-36 md:w-40 lg:w-44">
                    <div
                      onClick={() => {
                        setSelectedBookId(book.id);
                        setShowBookDetailModal(true);
                      }}
                      className="group block h-full cursor-pointer"
                    >
                      <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 border-2 border-purple-200 dark:border-purple-800 h-full flex flex-col">
                        <div className="aspect-[3/4] bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 overflow-hidden relative flex-shrink-0 w-full">
                          {(() => {
                            const coverUrl = getCoverUrl(book.cover_url);
                            return coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={book.title}
                                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                                style={{ minWidth: '100%', minHeight: '100%' }}
                                onContextMenu={(e) => e.preventDefault()}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `
                                      <div class="w-full h-full flex items-center justify-center">
                                        <svg class="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                                        </svg>
                                      </div>
                                    `;
                                  }
                                }}
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Book className="w-12 h-12 text-purple-400 dark:text-purple-500" />
                              </div>
                            );
                          })()}
                          {isNoteBook(book) && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-black/70 text-white backdrop-blur">
                              {t('book.note')}
                            </div>
                          )}
                          {book.rating && (
                            <div className="absolute top-1 right-1 bg-purple-600/80 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <span>⭐</span>
                              <span>{book.rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-1.5 flex-1 flex flex-col justify-between min-h-[48px]">
                          <h3 className="font-semibold text-xs line-clamp-2 mb-0.5 text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            {book.title}
                          </h3>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-auto">
                            {book.author || t('book.unknownAuthor')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 好书推荐 */}
          {recommendedBooks.length > 0 && (
            <HorizontalBookList title={t('book.recommended')} books={recommendedBooks} />
          )}

          {/* 所有书籍 */}
          {/* 范围筛选（公开/私有/分享/群组） - 只在有对应类型书籍时显示，且没有搜索关键词时显示 */}
          {isAuthenticated && !searchQuery && (() => {
            // 检查是否有任何类型的书籍（除了 "all"）
            const hasAnyBooks = scopeCounts.public > 0 || scopeCounts.private > 0 || scopeCounts.shared > 0 || scopeCounts.group > 0;
            // 如果没有任何类型的书籍，不显示筛选区域
            if (!hasAnyBooks) {
              return null;
            }
            return (
              <div className="mb-4 px-4">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
                  {/* "全部"按钮 - 只要有任何类型的书籍就显示 */}
                  {scopeCounts.all > 0 && (
                    <button
                      onClick={() => {
                        setSelectedScope('all');
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        selectedScope === 'all'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-50/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                      }`}
                    >
                      {t('book.all') || '全部'}
                    </button>
                  )}
                  {/* "公开"按钮 - 只在有公开书籍时显示 */}
                  {scopeCounts.public > 0 && (
                    <button
                      onClick={() => {
                        setSelectedScope('public');
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        selectedScope === 'public'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-50/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                      }`}
                    >
                      {t('book.public') || '公开'}
                    </button>
                  )}
                  {/* "私有"按钮 - 只在有私有书籍时显示 */}
                  {scopeCounts.private > 0 && (
                    <button
                      onClick={() => {
                        setSelectedScope('private');
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        selectedScope === 'private'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-50/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                      }`}
                    >
                      {t('book.private') || '私有'}
                    </button>
                  )}
                  {/* "分享给我"按钮 - 只在有分享书籍时显示 */}
                  {scopeCounts.shared > 0 && (
                    <button
                      onClick={() => {
                        setSelectedScope('shared');
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        selectedScope === 'shared'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-50/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                      }`}
                    >
                      {t('book.shared') || '分享给我'}
                    </button>
                  )}
                  {/* "书友会可见"按钮 - 只在有群组书籍时显示 */}
                  {scopeCounts.group > 0 && (
                    <button
                      onClick={() => {
                        setSelectedScope('group');
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        selectedScope === 'group'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-50/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                      }`}
                    >
                      {t('book.group') || '书友会可见'}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 书籍分类筛选 - 扁平化设计 - 始终显示，即使没有书籍 */}
          {bookCategories.length > 0 && (
            <div className="mb-4 px-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                      : 'bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80 shadow-sm hover:shadow-md'
                  }`}
                >
                  {t('shelf.all')}
                </button>
                {bookCategories.map((cat) => (
                  <button
                    key={cat.category}
                    onClick={() => {
                      setSelectedCategory(cat.category);
                      setPage(1);
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedCategory === cat.category
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                        : 'bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80 shadow-sm hover:shadow-md'
                    }`}
                  >
                    {cat.category}{cat.count !== undefined && cat.count !== null ? ` (${cat.count})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 书籍列表内容 */}
          {books.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {t('book.noBooks')}
            </div>
          ) : (
            <>
              {/* 视图切换和排序 - 有背景容器 */}
              <div className="px-0 mb-6">
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-2 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-lg transition-all ${
                        viewMode === 'grid'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={t('shelf.gridView')}
                    >
                      <Grid3x3 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-lg transition-all ${
                        viewMode === 'list'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={t('shelf.listView')}
                    >
                      <List className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {/* 排序下拉菜单 */}
                  <div className="relative">
                    <button
                      ref={sortButtonRef}
                      onClick={() => {
                        if (sortButtonRef.current) {
                          const rect = sortButtonRef.current.getBoundingClientRect();
                          setSortMenuPosition({
                            top: rect.bottom + 8,
                            right: window.innerWidth - rect.right,
                          });
                        }
                        setSortMenuOpen(!sortMenuOpen);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                      title={t('shelf.sort')}
                    >
                      <ArrowUpDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline font-medium">
                        {sortBy === 'created_at' && (sortOrder === 'desc' ? t('shelf.recentAdded') : t('shelf.earliestAdded'))}
                        {sortBy === 'title' && (sortOrder === 'asc' ? t('shelf.titleAZ') : t('shelf.titleZA'))}
                        {sortBy === 'author' && (sortOrder === 'asc' ? t('shelf.authorAZ') : t('shelf.authorZA'))}
                        {sortBy === 'rating' && (sortOrder === 'desc' ? t('shelf.ratingHighest') : t('shelf.ratingLowest'))}
                      </span>
                    </button>
                    
                    {sortMenuOpen && sortMenuPosition && createPortal(
                      <>
                        <div 
                          className="fixed inset-0 z-[9998] bg-black/20" 
                          onClick={() => setSortMenuOpen(false)}
                        ></div>
                        <div 
                          className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-[9999]"
                          style={{
                            top: `${sortMenuPosition.top}px`,
                            right: `${sortMenuPosition.right}px`,
                          }}
                        >
                          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                            {t('shelf.sortBy')}
                          </div>
                          
                          {/* 创建时间 */}
                          <div className="px-3 py-1.5">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {t('shelf.createTime')}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setSortBy('created_at');
                                  setSortOrder('desc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'created_at' && sortOrder === 'desc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowDown className="w-3 h-3" />
                                {t('shelf.newest')}
                              </button>
                              <button
                                onClick={() => {
                                  setSortBy('created_at');
                                  setSortOrder('asc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'created_at' && sortOrder === 'asc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowUp className="w-3 h-3" />
                                {t('shelf.oldest')}
                              </button>
                            </div>
                          </div>
                          
                          {/* 标题 */}
                          <div className="px-3 py-1.5">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                              <Book className="w-3 h-3" />
                              {t('book.title')}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setSortBy('title');
                                  setSortOrder('asc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'title' && sortOrder === 'asc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowUp className="w-3 h-3" />
                                A-Z
                              </button>
                              <button
                                onClick={() => {
                                  setSortBy('title');
                                  setSortOrder('desc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'title' && sortOrder === 'desc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowDown className="w-3 h-3" />
                                Z-A
                              </button>
                            </div>
                          </div>
                          
                          {/* 作者 */}
                          <div className="px-3 py-1.5">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                              <Book className="w-3 h-3" />
                              {t('book.author')}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setSortBy('author');
                                  setSortOrder('asc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'author' && sortOrder === 'asc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowUp className="w-3 h-3" />
                                A-Z
                              </button>
                              <button
                                onClick={() => {
                                  setSortBy('author');
                                  setSortOrder('desc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'author' && sortOrder === 'desc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowDown className="w-3 h-3" />
                                Z-A
                              </button>
                            </div>
                          </div>
                          
                          {/* 评分 */}
                          <div className="px-3 py-1.5">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              {t('shelf.rating')}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  setSortBy('rating');
                                  setSortOrder('desc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'rating' && sortOrder === 'desc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowDown className="w-3 h-3" />
                                {t('shelf.highest')}
                              </button>
                              <button
                                onClick={() => {
                                  setSortBy('rating');
                                  setSortOrder('asc');
                                  setPage(1);
                                  setSortMenuOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                                  sortBy === 'rating' && sortOrder === 'asc'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                              >
                                <ArrowUp className="w-3 h-3" />
                                {t('shelf.lowest')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                  </div>
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3 relative z-0">
                  {books.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {books.map((book) => (
                    <BookListItem key={book.id} book={book} />
                  ))}
                </div>
              )}

              {/* 分页（桌面端） */}
              {!isMobile() && total > limit && (
                <div className="mt-8 flex justify-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn btn-secondary"
                  >
                    {t('book.previousPage')}
                  </button>
                  <span className="flex items-center px-4">
                    {t('book.pageInfo', { page, total: Math.ceil(total / limit) })}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= Math.ceil(total / limit)}
                    className="btn btn-secondary"
                  >
                    {t('book.nextPage')}
                  </button>
                </div>
              )}

              {/* 加载更多提示（移动端） */}
              {isMobile() && hasMore && (
                <div className="text-center py-4">
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="btn btn-secondary"
                  >
                    {loading ? t('common.loading') : t('book.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>

      {/* 书籍详细页模态框 */}
      {selectedBookId && (
        <BookDetailModal
          bookId={selectedBookId}
          isOpen={showBookDetailModal}
          onClose={() => {
            setShowBookDetailModal(false);
            setSelectedBookId(null);
          }}
          onBookUpdated={() => {
            // 刷新书籍列表
            fetchAllData();
          }}
        />
      )}
    </>
  );
}
