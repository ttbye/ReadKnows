/**
 * @file Home.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { Book, TrendingUp, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Book {
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  file_type: string;
}

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [popularBooks, setPopularBooks] = useState<Book[]>([]);
  const [privateBooks, setPrivateBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 延迟100ms加载，避免阻塞页面初始渲染
    const timer = setTimeout(() => {
      fetchBooks();
    }, 100);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const fetchBooks = async () => {
    try {
      if (isAuthenticated) {
        // 登录用户：获取最新书籍、推荐书籍、个人私有书籍（并行请求，但设置超时）
        const [recentRes, popularRes, privateRes] = await Promise.all([
          api.get('/books/recent?limit=6', { timeout: 5000 }),
          api.get('/books/recommended?limit=6', { timeout: 5000 }),
          api.get('/books?limit=6&scope=private', { timeout: 5000 }),
        ]);
        setRecentBooks(recentRes.data.books || []);
        setPopularBooks(popularRes.data.books || []);
        setPrivateBooks(privateRes.data.books || []);
      } else {
        // 未登录用户：仅获取公开书籍
        const [recentRes, popularRes] = await Promise.all([
          api.get('/books/recent?limit=6', { timeout: 5000 }),
          api.get('/books/recommended?limit=6', { timeout: 5000 }),
        ]);
        setRecentBooks(recentRes.data.books || []);
        setPopularBooks(popularRes.data.books || []);
      }
    } catch (error: any) {
      // 静默失败，让API拦截器处理缓存
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID') {
        console.error('获取书籍失败:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('home.welcome')}</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          {t('home.subtitle')}
        </p>
        {!isAuthenticated && (
          <div className="flex gap-4 justify-center">
            <Link
              to="/register"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('home.registerNow')}
            </Link>
            <Link
              to="/login"
              className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('auth.login')}
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Book className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">支持多种格式</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            支持 EPUB、PDF、TXT、MOBI 等多种电子书格式，满足您的阅读需求。
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">多平台同步</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            支持 iOS、iPad、Mac、Windows 等多平台，阅读进度实时同步。
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('home.readingHistory')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {t('home.readingHistoryDesc')}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Book className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('home.personalShelf')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {t('home.personalShelfDesc')}
          </p>
        </div>
      </div>

      {!loading && (recentBooks.length > 0 || popularBooks.length > 0 || privateBooks.length > 0) && (
        <div className="space-y-8">
          {/* 个人书籍 - 仅登录用户可见 */}
          {isAuthenticated && privateBooks.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {t('home.myBooks')}
                </h2>
                <Link
                  to="/books?scope=private"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {t('home.viewAll')} →
                </Link>
              </div>
              <div className="relative">
                <div className="overflow-x-auto pb-2 -mx-4 px-4">
                  <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                    {privateBooks.map((book) => (
                      <Link
                        key={book.id}
                        to={`/books/${book.id}`}
                        className="group flex-shrink-0"
                        style={{ width: '150px' }}
                      >
                        <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-2 ring-2 ring-purple-200 dark:ring-purple-800">
                          {book.cover_url ? (
                            <img
                              src={book.cover_url}
                              alt={book.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Book className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                            </div>
                          )}
                        </div>
                        <h3 className="text-sm font-medium line-clamp-2 text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {book.title}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                          {book.author}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 最新书籍 */}
          {recentBooks.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('home.recentBooks')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {recentBooks.map((book) => (
                  <Link
                    key={book.id}
                    to={`/books/${book.id}`}
                    className="group"
                  >
                    <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt={book.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Book className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h3 className="text-sm font-medium line-clamp-2 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                      {book.author}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 好书推荐 */}
          {popularBooks.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('home.recommendedBooks')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {popularBooks.map((book) => (
                  <Link
                    key={book.id}
                    to={`/books/${book.id}`}
                    className="group"
                  >
                    <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt={book.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Book className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h3 className="text-sm font-medium line-clamp-2 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                      {book.author}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="text-center">
            <Link
              to="/books"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              浏览全部书籍
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

