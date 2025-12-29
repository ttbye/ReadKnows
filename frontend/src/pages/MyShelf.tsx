/**
 * @file MyShelf.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Book, Trash2, Grid3x3, List, ArrowUpDown, Clock, ArrowUp, ArrowDown, Star, Calendar, Search, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { getCoverUrl } from '../utils/coverHelper';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';
import { useAuthStore } from '../store/authStore';
import { offlineDataCache } from '../utils/offlineDataCache';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import BookDetailModal from '../components/BookDetailModal';
import { useTranslation } from 'react-i18next';

interface ShelfBook {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  file_type: string;
  added_at: string;
  rating?: number;
  created_at?: string;
  category?: string;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'added_at' | 'title' | 'author' | 'rating' | 'created_at';
type SortOrder = 'desc' | 'asc';

interface BookItem {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  file_type: string;
  rating?: number;
  category?: string;
}

export default function MyShelf() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [recentReadBooks, setRecentReadBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 从localStorage加载视图模式，如果没有则默认为grid
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('myShelfViewMode');
    return (saved === 'grid' || saved === 'list') ? saved : 'grid';
  });

  // 保存视图模式到localStorage
  useEffect(() => {
    localStorage.setItem('myShelfViewMode', viewMode);
  }, [viewMode]);
  const [sortBy, setSortBy] = useState<SortOption>('added_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuPosition, setSortMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [bookCategories, setBookCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showBookDetailModal, setShowBookDetailModal] = useState(false);

  // 监听网络状态
  const { isOnline, checkAndResetOfflineFlag } = useNetworkStatus();

  useEffect(() => {
    // 先尝试从缓存加载数据（快速显示）
    loadFromCache().then((hasData) => {
      // 如果从缓存加载到数据，先显示缓存数据
      // 然后从网络获取最新数据（如果在线）
      if (offlineDataCache.isOnline()) {
        fetchShelf();
        if (isAuthenticated) {
          fetchRecentReadBooks();
        }
      } else {
        // 离线时，如果缓存有数据，就不显示loading了
        if (hasData) {
          setLoading(false);
        } else {
          // 离线且无缓存，显示空状态
          setLoading(false);
        }
      }
    }).catch(() => {
      // 缓存加载失败，尝试从网络获取
      if (offlineDataCache.isOnline()) {
        fetchShelf();
        if (isAuthenticated) {
          fetchRecentReadBooks();
        }
      } else {
        // 离线且无缓存，显示空状态
        setLoading(false);
      }
    });
  }, [sortBy, sortOrder, isAuthenticated]);

  // 监听“书籍列表变更”事件（如：导出笔记生成新书），强制刷新书架
  useEffect(() => {
    const onBooksChanged = () => {
      if (offlineDataCache.isOnline()) {
        fetchShelf();
        if (isAuthenticated) fetchRecentReadBooks();
      } else {
        // 离线：尽量用缓存重载
        loadFromCache().catch(() => undefined);
      }
    };
    window.addEventListener('__books_changed', onBooksChanged as any);
    return () => window.removeEventListener('__books_changed', onBooksChanged as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, sortBy, sortOrder]);

  // 监听网络状态变化：从离线恢复时自动刷新
  useEffect(() => {
    if (checkAndResetOfflineFlag()) {
      console.log('网络已恢复，自动刷新书架数据');
      toast.success('网络已连接，正在刷新数据...', { duration: 2000 });
      // 延迟一小段时间确保网络稳定
      setTimeout(() => {
        fetchShelf();
        if (isAuthenticated) {
          fetchRecentReadBooks();
        }
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // 从缓存加载数据（用于快速显示）
  const loadFromCache = async (): Promise<boolean> => {
    try {
      const [cachedShelf, cachedRecentRead] = await Promise.all([
        offlineDataCache.get('/api/shelf/my', { sort: sortBy, order: sortOrder }),
        isAuthenticated && offlineDataCache.get('/api/reading/progress', { limit: 20 }),
      ]);

      let hasData = false;

      if (cachedShelf?.books) {
        setBooks(cachedShelf.books);
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

      return hasData;
    } catch (error) {
      console.warn('从缓存加载数据失败:', error);
      return false;
    }
  };

  const fetchShelf = async () => {
    // 如果离线，先尝试从缓存加载
    if (!offlineDataCache.isOnline()) {
      const hasCache = await loadFromCache();
      if (hasCache) {
        setLoading(false);
        return; // 离线且有缓存，直接返回
      }
    }

    try {
      setLoading(true);
      const response = await api.get('/shelf/my', {
        params: {
          sort: sortBy,
          order: sortOrder,
        },
      });
      const allBooks = response.data.books || [];
      setBooks(allBooks);
      
      // 计算分类统计
      const categoryMap = new Map<string, number>();
      allBooks.forEach((book: ShelfBook) => {
        const category = book.category || '未分类';
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      });
      
      const categories = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => {
          // 先按数量降序，再按名称升序
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return a.category.localeCompare(b.category);
        });
      
      setBookCategories(categories);
    } catch (error: any) {
      console.error('获取书架失败:', error);
      
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
        toast.error('获取书架失败，请检查网络连接');
      }
    } finally {
      setLoading(false);
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
      // 如果是离线缓存的数据，不显示错误提示
      if (!error.isCached && !error.response?.data?.data) {
        // 静默失败，不显示错误提示
      }
    }
  };

  const handleRemove = async (bookId: string) => {
    if (!confirm(t('shelf.confirmRemove'))) {
      return;
    }

    try {
      await api.delete(`/shelf/remove/${bookId}`);
      toast.success(t('shelf.removed'));
      fetchShelf();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('shelf.removeFailed'));
    }
  };

  // 下拉刷新
  const handleRefresh = async () => {
    await Promise.all([
      fetchShelf(),
      isAuthenticated && fetchRecentReadBooks(),
    ]);
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

  const BookCard = ({ book }: { book: ShelfBook }) => (
    <div className="group relative z-0" style={{ width: '100%', height: '100%' }}>
      <div
        onClick={() => {
          setSelectedBookId(book.id);
          setShowBookDetailModal(true);
        }}
        className="block cursor-pointer"
        style={{ width: '100%', height: '100%' }}
      >
        <div className="card-gradient overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 flex flex-col" style={{ width: '100%', height: '100%' }}>
          <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative flex-shrink-0 w-full">
            {(() => {
              const coverUrl = getCoverUrl(book.cover_url);
              return coverUrl ? (
                <>
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
                  {book.category === '笔记' && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-black/70 text-white backdrop-blur">
                      {t('shelf.note')}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Book className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
              );
            })()}
            {book.rating && (
              <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <span>⭐</span>
                <span>{book.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <div className="p-2 flex-1 flex flex-col justify-between min-h-[60px]">
            <h3 className="font-semibold text-xs leading-tight line-clamp-2 mb-1 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words" title={book.title}>
              {book.title.length > 20 ? `${book.title.substring(0, 20)}...` : book.title}
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-auto">
              {book.author || t('shelf.unknownAuthor')}
            </p>
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          handleRemove(book.id);
        }}
        className="absolute top-2 right-2 p-1.5 bg-red-500/90 backdrop-blur-sm text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg z-10"
        title={t('shelf.removeFromShelf')}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );

  // 最近阅读的卡片组件（用于HorizontalBookList）
  const RecentReadBookCard = ({ book }: { book: BookItem }) => (
    <div
      onClick={() => {
        setSelectedBookId(book.id);
        setShowBookDetailModal(true);
      }}
      className="group block h-full cursor-pointer"
    >
      <div className="card-gradient rounded-lg overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 h-full flex flex-col">
        <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative flex-shrink-0 w-full">
          {(() => {
            const coverUrl = getCoverUrl(book.cover_url);
            return coverUrl ? (
              <>
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
                {book.category === '笔记' && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-black/70 text-white backdrop-blur">
                    {t('shelf.note')}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Book className="w-12 h-12 text-gray-400 dark:text-gray-500" />
              </div>
            );
          })()}
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
          <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-auto">
            {book.author || t('shelf.unknownAuthor')}
          </p>
        </div>
      </div>
    </div>
  );

  // 横向书籍列表组件
  const HorizontalBookList = ({ title, books: bookList }: { title: string; books: BookItem[] }) => {
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

    if (bookList.length === 0) return null;

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
              <RecentReadBookCard book={book} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const BookListItem = ({ book }: { book: ShelfBook }) => (
    <div className="group relative flex gap-3 p-3 card-gradient rounded-lg hover:shadow-md transition-all">
      <div
        onClick={() => {
          setSelectedBookId(book.id);
          setShowBookDetailModal(true);
        }}
        className="flex-1 flex gap-3 cursor-pointer"
      >
        <div className="w-16 h-24 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded overflow-hidden aspect-[3/4]">
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
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-1 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 break-words" title={book.title}>
            {book.title.length > 30 ? `${book.title.substring(0, 30)}...` : book.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {book.author || t('shelf.unknownAuthor')}
          </p>
          {book.rating && (
            <div className="flex items-center gap-1">
              <span className="text-yellow-500 text-xs">⭐</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{book.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          handleRemove(book.id);
        }}
        className="p-2 bg-red-500/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
        title={t('shelf.removeFromShelf')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <PullToRefreshIndicator 
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />
      <div className="w-full overflow-hidden pt-4 lg:pt-6">
      {/* 最近阅读（仅登录用户）- 显示在页面顶部 */}
      {isAuthenticated && recentReadBooks.length > 0 && (
        <HorizontalBookList title={t('shelf.lastRead')} books={recentReadBooks} />
      )}

      {/* 我的笔记（从书架中筛选分类=笔记的书籍） */}
      {(() => {
        const noteBooks: BookItem[] = (books || [])
          .filter((b) => (b.category || '未分类') === '笔记')
          .map((b) => ({
            id: b.id,
            title: b.title,
            author: b.author,
            cover_url: b.cover_url,
            file_type: b.file_type,
            rating: b.rating,
            category: b.category,
          }));

        return noteBooks.length > 0 ? (
          <HorizontalBookList title={t('shelf.myNotes')} books={noteBooks} />
        ) : null;
      })()}

      <div className="mb-4">
        {/* 视图切换和排序 */}
        {books.length > 0 && (
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title={t('shelf.gridView')}
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline">
                  {sortBy === 'added_at' && (sortOrder === 'desc' ? t('shelf.recentAdded') : t('shelf.earliestAdded'))}
                  {sortBy === 'title' && (sortOrder === 'asc' ? t('shelf.titleAZ') : t('shelf.titleZA'))}
                  {sortBy === 'author' && (sortOrder === 'asc' ? t('shelf.authorAZ') : t('shelf.authorZA'))}
                  {sortBy === 'rating' && (sortOrder === 'desc' ? t('shelf.ratingHighest') : t('shelf.ratingLowest'))}
                  {sortBy === 'created_at' && (sortOrder === 'desc' ? t('shelf.bookNewest') : t('shelf.bookOldest'))}
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
                    
                    {/* 添加时间 */}
                    <div className="px-3 py-1.5">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t('shelf.addTime')}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setSortBy('added_at');
                            setSortOrder('desc');
                            setSortMenuOpen(false);
                          }}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                            sortBy === 'added_at' && sortOrder === 'desc'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          <ArrowDown className="w-3 h-3" />
                          {t('shelf.recent')}
                        </button>
                        <button
                          onClick={() => {
                            setSortBy('added_at');
                            setSortOrder('asc');
                            setSortMenuOpen(false);
                          }}
                          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                            sortBy === 'added_at' && sortOrder === 'asc'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          <ArrowUp className="w-3 h-3" />
                          {t('shelf.earliest')}
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
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        )}
      </div>

      {books.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full flex items-center justify-center">
            <Book className="w-12 h-12 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4 text-lg">{t('shelf.emptyShelf')}</p>
          <Link 
            to="/books" 
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            {t('shelf.goToLibrary')}
          </Link>
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

          {(() => {
            // 根据选择的分类筛选书籍
            const filteredBooks = selectedCategory === 'all' 
              ? books 
              : books.filter(book => (book.category || '未分类') === selectedCategory);
            
            if (filteredBooks.length === 0) {
              return (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  {t('shelf.noBooksInCategory')}
                </div>
              );
            }
            
            return viewMode === 'grid' ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-2.5 lg:gap-3 relative z-0">
                {filteredBooks.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBooks.map((book) => (
                  <BookListItem key={book.id} book={book} />
                ))}
              </div>
            );
          })()}
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
            // 刷新书架列表
            fetchShelf();
          }}
        />
      )}
    </>
  );
}
