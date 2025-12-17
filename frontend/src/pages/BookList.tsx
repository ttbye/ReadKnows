/**
 * @file BookList.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Book, Search, Grid3x3, List, ChevronLeft, ChevronRight, ArrowUpDown, Clock, ArrowUp, ArrowDown, Star, Calendar, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCoverUrl } from '../utils/coverHelper';
import { useAuthStore } from '../store/authStore';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';
import { offlineDataCache } from '../utils/offlineDataCache';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import BookDetailModal from '../components/BookDetailModal';

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
  const [bookCategories, setBookCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showBookDetailModal, setShowBookDetailModal] = useState(false);
  const limit = 20;

  // 监听网络状态
  const { isOnline, checkAndResetOfflineFlag } = useNetworkStatus();

  useEffect(() => {
    // 先尝试从缓存加载数据（快速显示）
    loadFromCache().then((hasData) => {
      // 如果从缓存加载到数据，先显示缓存数据
      // 然后从网络获取最新数据（如果在线）
      if (offlineDataCache.isOnline()) {
        fetchAllData();
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
  }, [page, searchQuery, sortBy, sortOrder, selectedCategory]);

  // 获取书籍分类统计
  useEffect(() => {
    fetchBookCategories();
  }, [isAuthenticated]);

  const fetchBookCategories = async () => {
    try {
      const response = await api.get('/books/categories');
      setBookCategories(response.data.categories || []);
    } catch (error: any) {
      console.error('获取书籍分类统计失败:', error);
      // 静默失败，不影响主功能
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
      await Promise.all([
        fetchBooks(),
        fetchRecentBooks(),
        fetchRecommendedBooks(),
        isAuthenticated && fetchRecentReadBooks(),
        isAuthenticated && fetchPrivateBooks(),
      ]);
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
    await fetchAllData();
    await fetchBookCategories();
    toast.success(
      (t) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '0.5s' }} />
          </div>
          <div>
            <div className="font-semibold text-white">刷新成功</div>
            <div className="text-xs text-white/80 mt-0.5">数据已更新</div>
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

  const fetchBooks = async () => {
    try {
      const response = await api.get('/books', {
        params: { 
          page, 
          limit, 
          search: searchQuery || undefined,
          sort: sortBy,
          order: sortOrder,
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
        },
      });
      
      if (page === 1) {
        setBooks(response.data.books || []);
      } else {
        setBooks(prev => [...prev, ...(response.data.books || [])]);
      }
      
      setTotal(response.data.pagination?.total || 0);
      setHasMore((response.data.books || []).length === limit);
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      toast.error('获取书籍列表失败');
    }
  };

  const fetchRecentBooks = async () => {
    try {
      const response = await api.get('/books/recent', {
        params: { limit: 20 },
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
      toast.error('请输入搜索关键词');
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
              笔记
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
            {book.author || '未知作者'}
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
              onError={(e) => {
                const target = e.target as HTMLImageElement;
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
            笔记
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm sm:text-base mb-1 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 break-words" title={book.title}>
          {book.title.length > 30 ? `${book.title.substring(0, 30)}...` : book.title}
        </h3>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-2">
          {book.author || '未知作者'}
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
              title="向左滚动"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              title="向右滚动"
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
                  placeholder="搜索书籍、作者..."
                    className="w-full pl-12 pr-12 py-3 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-all shadow-sm hover:shadow-md"
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
                  title="搜索"
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
            <HorizontalBookList title="最近新增" books={recentBooks} />
          )}

          {/* 私人书籍（仅登录用户）- 移动到最近新增下方 */}
          {isAuthenticated && privateBooks.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <div className="w-1 h-5 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full"></div>
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">我的书籍</span>
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
                    title="向左滚动"
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
                    title="向右滚动"
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
                              笔记
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
                            {book.author || '未知作者'}
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
            <HorizontalBookList title="好书推荐" books={recommendedBooks} />
          )}

          {/* 所有书籍 */}
          {books.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              暂无书籍
            </div>
          ) : (
            <>
              {/* 书籍分类筛选 - 扁平化设计 */}
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
                      全部
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
                        {cat.category} ({cat.count})
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                      title="网格视图"
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
                      title="列表视图"
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
                      title="排序"
                    >
                      <ArrowUpDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline font-medium">
                        {sortBy === 'created_at' && (sortOrder === 'desc' ? '最新添加' : '最早添加')}
                        {sortBy === 'title' && (sortOrder === 'asc' ? '标题 A-Z' : '标题 Z-A')}
                        {sortBy === 'author' && (sortOrder === 'asc' ? '作者 A-Z' : '作者 Z-A')}
                        {sortBy === 'rating' && (sortOrder === 'desc' ? '评分最高' : '评分最低')}
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
                            排序方式
                          </div>
                          
                          {/* 创建时间 */}
                          <div className="px-3 py-1.5">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              创建时间
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
                                最新
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
                                最早
                              </button>
                            </div>
                          </div>
                          
                          {/* 标题 */}
                          <div className="px-3 py-1.5">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                              <Book className="w-3 h-3" />
                              标题
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
                              作者
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
                              评分
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
                                最高
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
                                最低
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
                    上一页
                  </button>
                  <span className="flex items-center px-4">
                    第 {page} 页 / 共 {Math.ceil(total / limit)} 页
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= Math.ceil(total / limit)}
                    className="btn btn-secondary"
                  >
                    下一页
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
                    {loading ? '加载中...' : '加载更多'}
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
