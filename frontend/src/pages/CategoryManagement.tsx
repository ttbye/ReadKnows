/**
 * @file CategoryManagement.tsx
 * @author ttbye
 * @date 2025-12-11
 * 书籍类型管理页面
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Type, Plus, Edit, Trash2, X, ArrowLeft } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export default function CategoryManagement() {
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
      toast.error('需要管理员权限');
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
      toast.error('获取书籍类型列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开创建模态框
  const handleCreate = () => {
    setEditingCategory(null);
    setFormData({ name: '', display_order: categories.length });
    setShowEditModal(true);
  };

  // 打开编辑模态框
  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, display_order: category.display_order });
    setShowEditModal(true);
  };

  // 保存（创建或更新）
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入书籍类型名称');
      return;
    }

    try {
      if (editingCategory) {
        // 更新
        await api.put(`/settings/book-categories/${editingCategory.id}`, {
          name: formData.name.trim(),
          display_order: formData.display_order,
        });
        toast.success('书籍类型更新成功');
      } else {
        // 创建
        await api.post('/settings/book-categories', {
          name: formData.name.trim(),
          display_order: formData.display_order,
        });
        toast.success('书籍类型创建成功');
      }
      setShowEditModal(false);
      setEditingCategory(null);
      setFormData({ name: '', display_order: 0 });
      await fetchCategories();
    } catch (error: any) {
      console.error('保存书籍类型失败:', error);
      toast.error(error.response?.data?.error || '保存失败');
    }
  };

  // 删除
  const handleDelete = async (category: Category) => {
    if (!window.confirm(`确定要删除书籍类型"${category.name}"吗？`)) {
      return;
    }

    try {
      await api.delete(`/settings/book-categories/${category.id}`);
      toast.success('书籍类型删除成功');
      await fetchCategories();
    } catch (error: any) {
      console.error('删除书籍类型失败:', error);
      toast.error(error.response?.data?.error || '删除失败');
    }
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex items-center gap-3">
            <Type className="w-6 h-6 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">书籍类型管理</h1>
          </div>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加类型
        </button>
      </div>

      {/* 内容区域 */}
      <div className="card-gradient rounded-lg p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {categories.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                暂无书籍类型，点击"添加类型"创建
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="card-gradient p-4 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {category.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        排序: {category.display_order}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑/创建模态框 */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingCategory ? '编辑书籍类型' : '添加书籍类型'}
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
                  类型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: 小说、历史、科技"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  排序顺序
                </label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  placeholder="数字越小越靠前"
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
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingCategory ? '更新' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

