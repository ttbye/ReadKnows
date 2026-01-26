/**
 * @file CategoryManagement.tsx
 * @author ttbye
 * @date 2025-12-11
 * 书籍类型管理页面
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Type, Plus, Edit, Trash2, X, Activity, RefreshCw, ChevronLeft } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export default function CategoryManagement() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: '', display_order: 0 });

  // 检查管理员权限
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error(t('categoryManagement.noPermission'));
      navigate('/');
    }
  }, [user, navigate]);

  // 加载书籍类型列表
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchCategories();
    }
  }, [user]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings/book-categories');
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error('获取书籍类型列表失败:', error);
      toast.error(t('categoryManagement.fetchCategoriesFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCategory(null);
    setFormData({ name: '', display_order: categories.length });
    setShowEditModal(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, display_order: category.display_order });
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(t('categoryManagement.pleaseEnterCategoryName'));
      return;
    }

    try {
      if (editingCategory) {
        await api.post(`/settings/book-categories/${editingCategory.id}`, { _method: 'PUT', 
          name: formData.name.trim(),
          display_order: formData.display_order,
         });
        toast.success('书籍类型已更新');
      } else {
        await api.post('/settings/book-categories', {
          name: formData.name.trim(),
          display_order: formData.display_order,
        });
        toast.success('书籍类型已创建');
      }
      setShowEditModal(false);
      fetchCategories();
    } catch (error) {
      console.error('保存书籍类型失败:', error);
      toast.error('保存失败');
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('确定要删除这个书籍类型吗？')) return;

    try {
      await api.post(`/settings/book-categories/${categoryId}`, { _method: 'DELETE' });
      toast.success('书籍类型已删除');
      fetchCategories();
    } catch (error) {
      console.error('删除书籍类型失败:', error);
      toast.error('删除失败');
    }
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
      {/* 紧凑的页面头部 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Type className="w-6 h-6 text-purple-600" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">书籍类型管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCategories()}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={handleCreate}
              className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              title="添加类型"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 紧凑的统计信息 */}
      <div className="mb-4">
        <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs text-gray-600 dark:text-gray-400">类型统计</span>
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{categories.length} 个类型</div>
        </div>
      </div>

      {/* 书籍类型列表 */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <Type className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">还没有书籍类型</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {category.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    显示顺序: {category.display_order}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    创建时间: {new Date(category.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="编辑"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑/创建模态框 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingCategory ? '编辑类型' : '添加类型'}
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingCategory(null);
                  setFormData({ name: '', display_order: 0 });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('settings.categoryName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入类型名称"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  显示顺序
                </label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  placeholder={t('settings.displayOrderPlaceholder') || '数字越小越靠前'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingCategory(null);
                    setFormData({ name: '', display_order: 0 });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingCategory ? '保存' : '添加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}