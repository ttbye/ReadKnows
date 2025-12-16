/**
 * @author ttbye
 * 书籍管理页面（管理员专用）
 * 管理员可以查看所有书籍，并将私有书籍改为公有书籍
 */

import { useState, useEffect } from 'react';
import { Globe, Lock, Search, Filter, Check, X, Trash2, RefreshCw, AlertTriangle, Book } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl } from '../utils/coverHelper';

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

interface User {
  id: string;
  username: string;
}

export default function BookManagement() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [users, setUsers] = useState<Map<string, User>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [updatingDouban, setUpdatingDouban] = useState(false);
  const [doubanProgress, setDoubanProgress] = useState({ current: 0, total: 0 });
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState({
    category: '',
    language: '',
    tags: '',
    rating: '',
  });
  const [categories, setCategories] = useState<string[]>([]);

  // 检查管理员权限
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('需要管理员权限');
      navigate('/');
    }
  }, [user, navigate]);

  // 加载书籍列表
  useEffect(() => {
    fetchBooks();
    fetchUsers();
    fetchCategories();
  }, []);

  // 获取所有分类（从书籍类型管理表获取）
  const fetchCategories = async () => {
    try {
      const response = await api.get('/settings/book-categories');
      
      if (!response.data || !response.data.categories) {
        console.warn('API返回数据格式不正确:', response.data);
        setCategories(['未分类']);
        return;
      }
      
      const cats = response.data.categories.map((c: any) => {
        if (typeof c === 'string') {
          return c;
        }
        return c.name || c.category || String(c);
      }).filter((cat: string) => cat && cat.trim() !== '');
      
      if (cats.length > 0) {
        setCategories(cats);
      } else {
        console.warn('书籍类型列表为空');
        setCategories(['未分类']);
      }
    } catch (error: any) {
      console.error('获取分类列表失败:', error);
      console.error('错误状态码:', error.response?.status);
      console.error('错误详情:', error.response?.data || error.message);
      // 使用默认分类列表
      setCategories(['未分类', '小说', '文学', '历史', '哲学', '武侠', '传记', '科技', '计算机', '编程', '经济', '管理', '心理学', '社会科学', '自然科学', '艺术', '教育', '儿童读物', '漫画']);
    }
  };

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const response = await api.get('/books', {
        params: {
          page: 1,
          limit: 1000, // 获取所有书籍
        },
      });
      setBooks(response.data.books || []);
    } catch (error: any) {
      console.error('获取书籍列表失败:', error);
      toast.error(error.response?.data?.error || '获取书籍列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      const userMap = new Map<string, User>();
      response.data.users.forEach((u: User) => {
        userMap.set(u.id, u);
      });
      setUsers(userMap);
    } catch (error) {
      console.error('获取用户列表失败:', error);
    }
  };

  // 更新单个书籍的可见性
  const updateBookVisibility = async (bookId: string, isPublic: boolean) => {
    try {
      setUpdating(true);
      await api.patch(`/books/${bookId}/visibility`, { isPublic });
      toast.success(`书籍已${isPublic ? '公开' : '私有化'}`);
      await fetchBooks();
    } catch (error: any) {
      console.error('更新书籍可见性失败:', error);
      toast.error(error.response?.data?.error || '更新失败');
    } finally {
      setUpdating(false);
    }
  };

  // 批量更新书籍信息
  const batchUpdateBooks = async () => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择要操作的书籍');
      return;
    }

    const updates: any = {};
    if (batchEditForm.category) updates.category = batchEditForm.category;
    if (batchEditForm.language) updates.language = batchEditForm.language;
    if (batchEditForm.tags) updates.tags = batchEditForm.tags;
    if (batchEditForm.rating) {
      const rating = parseFloat(batchEditForm.rating);
      if (!isNaN(rating) && rating >= 0 && rating <= 10) {
        updates.rating = rating;
      }
    }

    if (Object.keys(updates).length === 0) {
      toast.error('请至少填写一个要修改的字段');
      return;
    }

    try {
      setUpdating(true);
      const response = await api.patch('/books/batch/update', {
        bookIds: Array.from(selectedBooks),
        updates,
      });
      toast.success(response.data.message);
      setSelectedBooks(new Set());
      setShowBatchEditModal(false);
      setBatchEditForm({ category: '', language: '', tags: '', rating: '' });
      await fetchBooks();
    } catch (error: any) {
      console.error('批量更新失败:', error);
      toast.error(error.response?.data?.error || '批量更新失败');
    } finally {
      setUpdating(false);
    }
  };

  // 批量更新书籍可见性
  const batchUpdateVisibility = async (isPublic: boolean) => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择要操作的书籍');
      return;
    }

    try {
      setUpdating(true);
      const response = await api.patch('/books/batch/visibility', {
        bookIds: Array.from(selectedBooks),
        isPublic,
      });
      toast.success(response.data.message);
      setSelectedBooks(new Set());
      await fetchBooks();
    } catch (error: any) {
      console.error('批量更新失败:', error);
      toast.error(error.response?.data?.error || '批量更新失败');
    } finally {
      setUpdating(false);
    }
  };

  // 批量删除书籍
  const batchDeleteBooks = async () => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择要删除的书籍');
      return;
    }

    try {
      setUpdating(true);
      const response = await api.post('/books/batch/delete', {
        bookIds: Array.from(selectedBooks),
      });
      
      const { results } = response.data;
      if (results.success.length > 0) {
        toast.success(`成功删除 ${results.success.length} 本书籍`);
      }
      if (results.failed.length > 0) {
        toast.error(`删除失败 ${results.failed.length} 本`);
      }
      
      setSelectedBooks(new Set());
      setShowDeleteConfirm(false);
      await fetchBooks();
    } catch (error: any) {
      console.error('批量删除失败:', error);
      toast.error(error.response?.data?.error || '批量删除失败');
    } finally {
      setUpdating(false);
    }
  };

  // 批量更新豆瓣信息
  const batchUpdateDouban = async () => {
    if (selectedBooks.size === 0) {
      toast.error('请先选择要更新的书籍');
      return;
    }

    const bookIds = Array.from(selectedBooks);
    setUpdatingDouban(true);
    setDoubanProgress({ current: 0, total: bookIds.length });

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      // 逐个更新以显示进度
      for (let i = 0; i < bookIds.length; i++) {
        try {
          setDoubanProgress({ current: i + 1, total: bookIds.length });
          
          const response = await api.post('/books/batch/update-douban', {
            bookIds: [bookIds[i]],
          });

          if (response.data.results.success.length > 0) {
            successCount++;
          }
          if (response.data.results.skipped.length > 0) {
            skippedCount++;
          }
          if (response.data.results.failed.length > 0) {
            failedCount++;
          }
        } catch (error) {
          console.error(`更新书籍 ${bookIds[i]} 失败:`, error);
          failedCount++;
        }
      }

      // 显示汇总结果
      if (successCount > 0) {
        toast.success(`成功更新 ${successCount} 本书籍信息`);
      }
      if (skippedCount > 0) {
        toast(`跳过 ${skippedCount} 本（未找到匹配结果）`, { icon: 'ℹ️' });
      }
      if (failedCount > 0) {
        toast.error(`更新失败 ${failedCount} 本`);
      }

      setSelectedBooks(new Set());
      await fetchBooks();
    } catch (error: any) {
      console.error('批量更新豆瓣信息失败:', error);
      toast.error(error.response?.data?.error || '批量更新失败');
    } finally {
      setUpdatingDouban(false);
      setDoubanProgress({ current: 0, total: 0 });
    }
  };

  // 切换选择
  const toggleSelect = (bookId: string) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(bookId)) {
      newSelected.delete(bookId);
    } else {
      newSelected.add(bookId);
    }
    setSelectedBooks(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedBooks.size === filteredBooks.length) {
      setSelectedBooks(new Set());
    } else {
      setSelectedBooks(new Set(filteredBooks.map(b => b.id)));
    }
  };

  // 过滤书籍
  const filteredBooks = books.filter(book => {
    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (
        !book.title.toLowerCase().includes(term) &&
        !book.author.toLowerCase().includes(term)
      ) {
        return false;
      }
    }

    // 类型过滤
    if (filterType === 'public' && book.is_public !== 1) return false;
    if (filterType === 'private' && book.is_public !== 0) return false;

    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 工具栏 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* 搜索 */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="搜索书名或作者..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* 过滤 */}
            <div className="flex items-center gap-2">
              <Filter className="text-gray-400 w-5 h-5" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">全部书籍</option>
                <option value="public">公开书籍</option>
                <option value="private">私有书籍</option>
              </select>
            </div>
          </div>

          {/* 批量操作 */}
          {selectedBooks.size > 0 && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  已选择 {selectedBooks.size} 本书籍
                </span>
                <button
                  onClick={() => setSelectedBooks(new Set())}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  取消选择
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => batchUpdateVisibility(true)}
                  disabled={updating || updatingDouban}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  <Globe className="w-4 h-4" />
                  批量公开
                </button>
                <button
                  onClick={() => batchUpdateVisibility(false)}
                  disabled={updating || updatingDouban}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  <Lock className="w-4 h-4" />
                  批量私有
                </button>
                <button
                  onClick={() => setShowBatchEditModal(true)}
                  disabled={updating || updatingDouban}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  <Filter className="w-4 h-4" />
                  批量修改
                </button>
                <button
                  onClick={batchUpdateDouban}
                  disabled={updating || updatingDouban}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  {updatingDouban ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      更新中 ({doubanProgress.current}/{doubanProgress.total})
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      批量更新豆瓣信息
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={updating || updatingDouban}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  批量删除
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">总书籍数</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{books.length}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">公开书籍</div>
            <div className="text-2xl font-bold text-green-600">{books.filter(b => b.is_public === 1).length}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">私有书籍</div>
            <div className="text-2xl font-bold text-orange-600">{books.filter(b => b.is_public === 0).length}</div>
          </div>
        </div>

        {/* 书籍列表 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedBooks.size === filteredBooks.length && filteredBooks.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    书籍信息
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    上传者
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedBooks.has(book.id)}
                        onChange={() => toggleSelect(book.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded overflow-hidden flex items-center justify-center">
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
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `
                                      <div class="w-full h-full flex items-center justify-center">
                                        <svg class="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {book.title}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {book.author} · {book.category} · {book.file_type.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {book.uploader_username || users.get(book.uploader_id)?.username || '未知'}
                      </div>
                      {book.created_at && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(book.created_at).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {book.is_public === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          <Globe className="w-3 h-3" />
                          公开
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                          <Lock className="w-3 h-3" />
                          私有
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {book.is_public === 1 ? (
                        <button
                          onClick={() => updateBookVisibility(book.id, false)}
                          disabled={updating}
                          className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 disabled:opacity-50"
                        >
                          改为私有
                        </button>
                      ) : (
                        <button
                          onClick={() => updateBookVisibility(book.id, true)}
                          disabled={updating}
                          className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                        >
                          改为公开
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredBooks.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">没有找到符合条件的书籍</p>
            </div>
          )}
        </div>

        {/* 批量修改模态框 */}
        {showBatchEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">批量修改书籍</h2>
                <button
                  onClick={() => {
                    setShowBatchEditModal(false);
                    setBatchEditForm({ category: '', language: '', tags: '', rating: '' });
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    分类（留空不修改）
                  </label>
                  <select
                    value={batchEditForm.category}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">不修改</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    语言（留空不修改）
                  </label>
                  <select
                    value={batchEditForm.language}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, language: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">不修改</option>
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                    <option value="ja">日文</option>
                    <option value="ko">韩文</option>
                    <option value="fr">法文</option>
                    <option value="de">德文</option>
                    <option value="es">西班牙文</option>
                    <option value="ru">俄文</option>
                    <option value="other">其他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    标签（留空不修改，多个标签用逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={batchEditForm.tags}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, tags: e.target.value })}
                    placeholder="例如: 小说,历史,文学"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    评分（留空不修改，0-10）
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={batchEditForm.rating}
                    onChange={(e) => setBatchEditForm({ ...batchEditForm, rating: e.target.value })}
                    placeholder="例如: 8.5"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowBatchEditModal(false);
                      setBatchEditForm({ category: '', language: '', tags: '', rating: '' });
                    }}
                    disabled={updating}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={batchUpdateBooks}
                    disabled={updating}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                  >
                    {updating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        更新中...
                      </>
                    ) : (
                      '确认修改'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认对话框 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    确认删除
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    此操作不可恢复
                  </p>
                </div>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                确定要删除选中的 <span className="font-bold text-red-600">{selectedBooks.size}</span> 本书籍吗？
                <br />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  这将永久删除书籍文件和所有相关数据。
                </span>
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={updating}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={batchDeleteBooks}
                  disabled={updating}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {updating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      删除中...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      确认删除
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

