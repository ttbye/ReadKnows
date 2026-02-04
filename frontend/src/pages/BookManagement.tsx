/**
 * @author ttbye
 * 书籍管理页面（管理员专用）
 * 管理员可以查看所有书籍，并将私有书籍改为公有书籍
 */

import { useState, useEffect } from 'react';
import { Globe, Lock, Search, Filter, Check, X, Trash2, RefreshCw, AlertTriangle, Book, Activity, Edit } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatTimeWithTimezone } from '../utils/timezone';

interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  file_type: string;
  is_public: number;
  uploader_id: string;
  uploader_username?: string;
  created_at: string;
  cover_url?: string;
}

export default function BookManagement() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchCategoryModal, setShowBatchCategoryModal] = useState(false);
  const [batchCategory, setBatchCategory] = useState('');
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState({
    category: '',
    language: '',
    tags: '',
    rating: '',
  });

  // 检查管理员权限
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error(t('bookManagement.needAdminPermission'));
      navigate('/');
      return;
    }
    fetchBooks();
  }, [user, navigate]);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const response = await api.get('/books/admin/all');
      setBooks(response.data.books || []);
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      toast.error('获取书籍列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredBooks = books.filter(book => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!book.title.toLowerCase().includes(term) && !book.author.toLowerCase().includes(term)) {
        return false;
      }
    }
    if (filterType === 'public' && book.is_public !== 1) return false;
    if (filterType === 'private' && book.is_public !== 0) return false;
    return true;
  });

  const toggleSelect = (bookId: string) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(bookId)) {
      newSelected.delete(bookId);
    } else {
      newSelected.add(bookId);
    }
    setSelectedBooks(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedBooks.size === filteredBooks.length) {
      setSelectedBooks(new Set());
    } else {
      setSelectedBooks(new Set(filteredBooks.map(b => b.id)));
    }
  };

  const updateBookVisibility = async (bookId: string, isPublic: boolean) => {
    try {
      await api.patch(`/books/${bookId}/visibility`, { isPublic });
      toast.success(isPublic ? '已设为公开' : '已设为私有');
      fetchBooks();
    } catch (error) {
      console.error('更新书籍可见性失败:', error);
      toast.error('更新失败');
    }
  };

  const batchUpdateCategory = async () => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择书籍');
      return;
    }

    if (!batchCategory.trim()) {
      toast.error('请输入分类名称');
      return;
    }

    try {
      const response = await api.patch('/books/batch/category', {
        bookIds: Array.from(selectedBooks),
        category: batchCategory.trim(),
      });

      const { results } = response.data;
      if (results.success.length > 0) {
        toast.success(`成功更新 ${results.success.length} 本书分类`);
      }
      if (results.failed.length > 0) {
        toast.error(`失败 ${results.failed.length} 本书`);
      }

      setSelectedBooks(new Set());
      setShowBatchCategoryModal(false);
      setBatchCategory('');
      fetchBooks();
    } catch (error) {
      console.error('批量更新分类失败:', error);
      toast.error('批量更新分类失败');
    }
  };

  const batchUpdateBooks = async () => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择书籍');
      return;
    }

    // 过滤出有值的字段
    const updates: any = {};
    if (batchEditForm.category.trim()) updates.category = batchEditForm.category.trim();
    if (batchEditForm.language.trim()) updates.language = batchEditForm.language.trim();
    if (batchEditForm.tags.trim()) updates.tags = batchEditForm.tags.trim();
    if (batchEditForm.rating.trim()) updates.rating = parseFloat(batchEditForm.rating.trim()) || undefined;

    if (Object.keys(updates).length === 0) {
      toast.error('请至少填写一项要更新的信息');
      return;
    }

    try {
      const response = await api.patch('/books/batch/update', {
        bookIds: Array.from(selectedBooks),
        updates,
      });

      const { results } = response.data;
      if (results.success.length > 0) {
        toast.success(`成功更新 ${results.success.length} 本书信息`);
      }
      if (results.failed.length > 0) {
        toast.error(`失败 ${results.failed.length} 本书`);
      }

      setSelectedBooks(new Set());
      setShowBatchEditModal(false);
      setBatchEditForm({ category: '', language: '', tags: '', rating: '' });
      fetchBooks();
    } catch (error) {
      console.error('批量更新书籍信息失败:', error);
      toast.error('批量更新书籍信息失败');
    }
  };

  const batchUpdateDouban = async () => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择书籍');
      return;
    }

    try {
      toast('正在更新豆瓣信息，请稍候...');
      const response = await api.post('/books/batch/update-douban', {
        bookIds: Array.from(selectedBooks),
      });

      const { results } = response.data;
      let message = '';
      if (results.success.length > 0) {
        message += `成功更新 ${results.success.length} 本书`;
      }
      if (results.skipped.length > 0) {
        message += `，跳过 ${results.skipped.length} 本书`;
      }
      if (results.failed.length > 0) {
        message += `，失败 ${results.failed.length} 本书`;
      }

      if (message) {
        toast.success(message);
      }

      setSelectedBooks(new Set());
      fetchBooks();
    } catch (error) {
      console.error('批量更新豆瓣信息失败:', error);
      toast.error('批量更新豆瓣信息失败');
    }
  };

  const deleteBook = async (bookId: string) => {
    if (!confirm('确定要删除这本书吗？')) return;

    try {
      await api.post(`/books/${bookId}`, { _method: 'DELETE' });
      toast.success('书籍已删除');
      fetchBooks();
    } catch (error) {
      console.error('删除书籍失败:', error);
      toast.error('删除失败');
    }
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('bookManagement.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
      {/* 紧凑的页面头部 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Book className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">书籍管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchBooks()}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 紧凑的统计信息 */}
      <div className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">总书籍</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{books.length}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Globe className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">公开书籍</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{books.filter(b => b.is_public === 1).length}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Lock className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">私有书籍</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{books.filter(b => b.is_public === 0).length}</div>
          </div>
        </div>
      </div>

      {/* 紧凑的操作栏 */}
      <div className="mb-4">
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 搜索 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="搜索书籍标题或作者..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* 过滤 */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">{t('bookManagement.allBooks')}</option>
                <option value="public">{t('bookManagement.publicBooks')}</option>
                <option value="private">{t('bookManagement.privateBooks')}</option>
              </select>
            </div>
          </div>

          {/* 批量操作 */}
          {selectedBooks.size > 0 && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  已选择 {selectedBooks.size} 本书
                </span>
                <button
                  onClick={() => setSelectedBooks(new Set())}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  {t('bookManagement.deselectAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    try {
                      const response = await api.patch('/books/batch/visibility', {
                        bookIds: Array.from(selectedBooks),
                        isPublic: true,
                      });

                      const { results } = response.data;
                      if (results.success.length > 0) {
                        toast.success(`成功公开 ${results.success.length} 本书`);
                      }
                      if (results.failed.length > 0) {
                        toast.error(`失败 ${results.failed.length} 本书`);
                      }

                      setSelectedBooks(new Set());
                      fetchBooks();
                    } catch (error) {
                      console.error('批量公开失败:', error);
                      toast.error('批量公开失败');
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">批量公开</span>
                  <span className="sm:hidden">公开</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      const response = await api.patch('/books/batch/visibility', {
                        bookIds: Array.from(selectedBooks),
                        isPublic: false,
                      });

                      const { results } = response.data;
                      if (results.success.length > 0) {
                        toast.success(`成功设为私有 ${results.success.length} 本书`);
                      }
                      if (results.failed.length > 0) {
                        toast.error(`失败 ${results.failed.length} 本书`);
                      }

                      setSelectedBooks(new Set());
                      fetchBooks();
                    } catch (error) {
                      console.error('批量私有失败:', error);
                      toast.error('批量私有失败');
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center"
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline">批量私有</span>
                  <span className="sm:hidden">私有</span>
                </button>
                <button
                  onClick={() => setShowBatchEditModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center"
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">批量编辑</span>
                  <span className="sm:hidden">编辑</span>
                </button>
                <button
                  onClick={() => setShowBatchCategoryModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">批量分类</span>
                  <span className="sm:hidden">分类</span>
                </button>
                <button
                  onClick={batchUpdateDouban}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">更新豆瓣</span>
                  <span className="sm:hidden">豆瓣</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2 min-w-[100px] justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">批量删除</span>
                  <span className="sm:hidden">删除</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 书籍列表 - 响应式布局 */}
      {filteredBooks.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <Book className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm ? '未找到匹配的书籍' : '没有书籍'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 桌面端表格布局 */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedBooks.size === filteredBooks.length && filteredBooks.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      书籍信息
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      上传者
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredBooks.map((book) => (
                    <tr key={book.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedBooks.has(book.id)}
                          onChange={() => toggleSelect(book.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded overflow-hidden flex items-center justify-center">
                            <Book className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {book.title}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {book.author} · {book.category} · {book.file_type.toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {book.uploader_username || '未知'}
                        </div>
                        {book.created_at && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {formatTimeWithTimezone(book.created_at, {
                              showTime: false,
                              showDate: true,
                              relative: false,
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {book.is_public === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <Globe className="w-3 h-3" />
                            公开
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                            <Lock className="w-3 h-3" />
                            私有
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-1">
                          {book.is_public === 1 ? (
                            <button
                              onClick={() => updateBookVisibility(book.id, false)}
                              className="p-1 text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-200 disabled:opacity-50 rounded"
                              title="设为私有"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => updateBookVisibility(book.id, true)}
                              className="p-1 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200 disabled:opacity-50 rounded"
                              title="设为公开"
                            >
                              <Globe className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteBook(book.id)}
                            className="p-1 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 disabled:opacity-50 rounded"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 移动端卡片列表 */}
          <div className="md:hidden space-y-2">
            {filteredBooks.map((book) => (
              <div key={book.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-start gap-3 mb-2">
                  <input
                    type="checkbox"
                    checked={selectedBooks.has(book.id)}
                    onChange={() => toggleSelect(book.id)}
                    className="w-4 h-4 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="w-12 h-16 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded overflow-hidden flex items-center justify-center">
                    <Book className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{book.title}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author} · {book.category}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {book.is_public === 1 ? (
                          <button
                            onClick={() => updateBookVisibility(book.id, false)}
                            className="p-1.5 text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-200 disabled:opacity-50 rounded"
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => updateBookVisibility(book.id, true)}
                            className="p-1.5 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200 disabled:opacity-50 rounded"
                          >
                            <Globe className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteBook(book.id)}
                          className="p-1.5 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 disabled:opacity-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <span>{book.uploader_username || '未知'}</span>
                        <span>{book.file_type.toUpperCase()}</span>
                      </div>
                      {book.is_public === 1 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <Globe className="w-2.5 h-2.5" />
                          公开
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                          <Lock className="w-2.5 h-2.5" />
                          私有
                        </span>
                      )}
                    </div>
                    {book.created_at && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatTimeWithTimezone(book.created_at, {
                          showTime: false,
                          showDate: true,
                          relative: false,
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 批量编辑对话框 */}
      {showBatchEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Edit className="w-6 h-6 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">批量编辑书籍信息</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              为选中的 {selectedBooks.size} 本书批量编辑信息：
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  分类（可选）
                </label>
                <input
                  type="text"
                  value={batchEditForm.category}
                  onChange={(e) => setBatchEditForm({ ...batchEditForm, category: e.target.value })}
                  placeholder="输入分类名称"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  语言（可选）
                </label>
                <input
                  type="text"
                  value={batchEditForm.language}
                  onChange={(e) => setBatchEditForm({ ...batchEditForm, language: e.target.value })}
                  placeholder="输入语言，如：中文、English"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  标签（可选）
                </label>
                <input
                  type="text"
                  value={batchEditForm.tags}
                  onChange={(e) => setBatchEditForm({ ...batchEditForm, tags: e.target.value })}
                  placeholder="输入标签，用逗号分隔"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  评分（可选，0-5）
                </label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={batchEditForm.rating}
                  onChange={(e) => setBatchEditForm({ ...batchEditForm, rating: e.target.value })}
                  placeholder="输入评分，0-5之间"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBatchEditModal(false);
                  setBatchEditForm({ category: '', language: '', tags: '', rating: '' });
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={batchUpdateBooks}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                确认编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量分类对话框 */}
      {showBatchCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Filter className="w-6 h-6 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">批量设置分类</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              为选中的 {selectedBooks.size} 本书设置分类：
            </p>
            <div className="mb-6">
              <input
                type="text"
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value)}
                placeholder="输入分类名称"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBatchCategoryModal(false);
                  setBatchCategory('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={batchUpdateCategory}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                确认设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">确认删除</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              确定要删除选中的 {selectedBooks.size} 本书吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    const response = await api.post('/books/batch/delete', {
                      bookIds: Array.from(selectedBooks),
                    });

                    const { results } = response.data;
                    if (results.success.length > 0) {
                      toast.success(`成功删除 ${results.success.length} 本书`);
                    }
                    if (results.failed.length > 0) {
                      toast.error(`失败 ${results.failed.length} 本书`);
                    }

                    setSelectedBooks(new Set());
                    setShowDeleteConfirm(false);
                    fetchBooks();
                  } catch (error) {
                    console.error('批量删除失败:', error);
                    toast.error('批量删除失败');
                  }
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}