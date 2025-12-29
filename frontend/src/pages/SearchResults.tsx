/**
 * @file SearchResults.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Book, Search, Grid3x3, List, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCoverUrl } from '../utils/coverHelper';

interface BookItem {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  description?: string;
  file_type: string;
  rating?: number;
  created_at?: string;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'created_at' | 'title' | 'author' | 'rating';
type SortOrder = 'desc' | 'asc';

export default function SearchResults() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const scope = searchParams.get('scope') || 'all'; // 'all' or 'shelf'
  
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(query);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(query);
    setPage(1);
    setBooks([]);
  }, [query, scope]);

  useEffect(() => {
    if (query) {
      fetchBooks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, sortBy, sortOrder, scope]);

  // 移动端下滑加载更多
  useEffect(() => {
    if (!hasMore || loading || !query) return;

    const handleScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMore();
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [hasMore, loading, page, query]);

  const fetchBooks = async () => {
    if (!query) return;
    
    try {
      setLoading(true);
      const endpoint = scope === 'shelf' ? '/shelf/my' : '/books';
      const params: any = {
        search: query,
        sort: sortBy,
        order: sortOrder,
      };
      
      if (scope === 'all') {
        params.page = page;
        params.limit = limit;
      }
      
      const response = await api.get(endpoint, { params });
      const fetchedBooks = response.data.books || [];
      
      if (page === 1) {
        setBooks(fetchedBooks);
      } else {
        setBooks(prev => [...prev, ...fetchedBooks]);
      }
      
      setHasMore(fetchedBooks.length === limit);
    } catch (error: any) {
      console.error('搜索失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
      if (error.statusText !== 'OK (Offline Cache)' && error.statusText !== 'OK (Offline, No Cache)') {
        // 只有在在线且确实失败时才显示错误
        if (navigator.onLine) {
          toast.error(error.response?.data?.error || t('search.searchFailed') || '搜索失败');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    setPage(prev => prev + 1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) {
      toast.error(t('book.enterSearchKeyword'));
      return;
    }
    setSearchParams({ q: searchInput.trim(), scope });
    setPage(1);
    setBooks([]);
  };

  const handleClear = () => {
    setSearchInput('');
    navigate(scope === 'shelf' ? '/shelf' : '/books');
  };

  const BookCard = ({ book }: { book: BookItem }) => (
    <Link
      to={`/books/${book.id}`}
      className="group block h-full"
    >
      <div className="card-gradient overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 h-full flex flex-col">
        <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative flex-shrink-0">
          {(() => {
            const coverUrl = getCoverUrl(book.cover_url);
            return coverUrl ? (
              <img
                src={coverUrl}
                alt={book.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
        </div>
        <div className="p-3 flex-1 flex flex-col">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {book.title}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
            {book.author || t('book.unknownAuthor')}
          </p>
          {book.rating !== undefined && book.rating > 0 && (
            <div className="flex items-center gap-1 mt-auto">
              <span className="text-xs text-yellow-500">★</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{book.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );

  const BookListItem = ({ book }: { book: BookItem }) => (
    <Link
      to={`/books/${book.id}`}
      className="block card-gradient rounded-lg hover:shadow-md transition-all duration-200"
    >
      <div className="flex gap-4 p-4">
        <div className="w-20 h-28 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded overflow-hidden">
          {(() => {
            const coverUrl = getCoverUrl(book.cover_url);
            return coverUrl ? (
              <img
                src={coverUrl}
                alt={book.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
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
          <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
            {book.title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {book.author || t('book.unknownAuthor')}
          </p>
          {book.description && (
            <p className="text-sm text-gray-500 dark:text-gray-500 line-clamp-2 mb-2">
              {book.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="uppercase">{book.file_type}</span>
            {book.rating !== undefined && book.rating > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-500">★</span>
                <span>{book.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* 搜索栏 - 简洁扁平设计 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <form onSubmit={handleSearch} className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                type="text"
                placeholder={scope === 'shelf' ? '搜索我的书架...' : '搜索书籍、作者...'}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                autoFocus
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
            >
              {t('common.search')}
            </button>
          </div>
        </form>
      </div>

      {/* 工具栏 */}
      {query && (
        <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('search.foundBooks', { count: books.length })}
              {query && (
                <span className="ml-2">
                  {t('search.keyword')}: <span className="font-medium text-blue-600 dark:text-blue-400">"{query}"</span>
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {/* 视图切换 */}
              <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="网格视图"
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="列表视图"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* 排序 */}
              <div className="relative">
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  <ArrowUpDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300">
                    {sortBy === 'created_at' && (sortOrder === 'desc' ? '最新' : '最早')}
                    {sortBy === 'title' && (sortOrder === 'asc' ? '标题 A-Z' : '标题 Z-A')}
                    {sortBy === 'author' && (sortOrder === 'asc' ? '作者 A-Z' : '作者 Z-A')}
                    {sortBy === 'rating' && (sortOrder === 'desc' ? '评分最高' : '评分最低')}
                  </span>
                </button>
                
                {sortMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setSortMenuOpen(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-20">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                        排序方式
                      </div>
                      <button
                        onClick={() => {
                          setSortBy('created_at');
                          setSortOrder('desc');
                          setSortMenuOpen(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          sortBy === 'created_at' && sortOrder === 'desc' ? 'text-blue-600 dark:text-blue-400' : ''
                        }`}
                      >
                        最新添加
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('title');
                          setSortOrder('asc');
                          setSortMenuOpen(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          sortBy === 'title' && sortOrder === 'asc' ? 'text-blue-600 dark:text-blue-400' : ''
                        }`}
                      >
                        标题 A-Z
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('author');
                          setSortOrder('asc');
                          setSortMenuOpen(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          sortBy === 'author' && sortOrder === 'asc' ? 'text-blue-600 dark:text-blue-400' : ''
                        }`}
                      >
                        作者 A-Z
                      </button>
                      <button
                        onClick={() => {
                          setSortBy('rating');
                          setSortOrder('desc');
                          setSortMenuOpen(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          sortBy === 'rating' && sortOrder === 'desc' ? 'text-blue-600 dark:text-blue-400' : ''
                        }`}
                      >
                        评分最高
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 搜索结果 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        <div className="max-w-7xl mx-auto">
          {!query ? (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">请输入搜索关键词</p>
            </div>
          ) : loading && books.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : books.length === 0 ? (
            <div className="text-center py-12">
              <Book className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">未找到相关书籍</p>
            </div>
          ) : (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {books.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {books.map((book) => (
                    <BookListItem key={book.id} book={book} />
                  ))}
                </div>
              )}
              
              {loading && books.length > 0 && (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

