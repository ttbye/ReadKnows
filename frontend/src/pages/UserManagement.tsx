/**
 * @file UserManagement.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Users, Shield, User, Trash2, Edit, Search, ChevronLeft, ChevronRight, Key, X, Check, Plus, UserPlus, Mail, Lock, BookOpen } from 'lucide-react';

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  nickname?: string;
  created_at: string;
  updated_at: string;
  bookCount: number;
  shelfCount: number;
}

interface CreateUserForm {
  username: string;
  email: string;
  password: string;
  role: string;
}

interface EditUserForm {
  email: string;
  nickname?: string;
}

export default function UserManagement() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  
  // 创建用户相关状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: '',
    email: '',
    password: '',
    role: 'user',
  });
  const [creating, setCreating] = useState(false);
  
  // 编辑用户相关状态
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({
    email: '',
    nickname: '',
  });
  const [editing, setEditing] = useState(false);
  
  // 重置密码相关状态
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    }
  }, [user, page, search]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/users', {
        params: { page, limit, search: search || undefined },
      });
      setUsers(response.data.users || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      console.error('获取用户列表失败:', error);
      toast.error(error.response?.data?.error || t('userManagement.fetchUsersFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.username || !createForm.email || !createForm.password) {
      toast.error(t('userManagement.pleaseFillAllFields'));
      return;
    }

    if (createForm.password.length < 6) {
      toast.error(t('userManagement.passwordMinLength'));
      return;
    }

    try {
      setCreating(true);
      await api.post('/users', createForm);
      toast.success(t('userManagement.userCreated'));
      setShowCreateModal(false);
      setCreateForm({
        username: '',
        email: '',
        password: '',
        role: 'user',
      });
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('userManagement.createUserFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleEditUser = async () => {
    if (!editingUser || !editForm.email) {
      toast.error(t('userManagement.pleaseFillEmail'));
      return;
    }

    try {
      setEditing(true);
      await api.put(`/users/${editingUser.id}`, editForm);
      toast.success(t('userManagement.userUpdated'));
      setShowEditModal(false);
      setEditingUser(null);
      setEditForm({ email: '', nickname: '' });
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('userManagement.updateUserFailed'));
    } finally {
      setEditing(false);
    }
  };

  const openEditModal = (userItem: UserItem) => {
    setEditingUser(userItem);
    setEditForm({ email: userItem.email, nickname: userItem.nickname || '' });
    setShowEditModal(true);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put(`/users/${userId}/role`, { role: newRole });
      toast.success(t('userManagement.roleUpdated'));
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('userManagement.updateRoleFailed'));
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    if (!window.confirm(t('userManagement.confirmDeleteUser', { username }))) {
      return;
    }

    try {
      await api.delete(`/users/${userId}`);
      toast.success(t('userManagement.userDeleted'));
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('userManagement.deleteUserFailed'));
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUserId || !newPassword) {
      toast.error(t('userManagement.pleaseEnterNewPassword'));
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t('userManagement.passwordMinLength'));
      return;
    }

    try {
      await api.put(`/users/${resettingUserId}/password`, { password: newPassword });
      toast.success(t('userManagement.passwordResetSuccess'));
      setShowPasswordModal(false);
      setNewPassword('');
      setResettingUserId(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('userManagement.resetPasswordFailed'));
    }
  };

  const openPasswordModal = (userId: string) => {
    setResettingUserId(userId);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">{t('userManagement.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* 搜索和操作栏 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder={t('userManagement.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
          >
            <UserPlus className="w-5 h-5" />
            {t('userManagement.createUser')}
          </button>
        </div>
      </div>

        {/* 统计信息 */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">{t('userManagement.totalUsers')}</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{total}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">{t('userManagement.admin')}</div>
              <div className="text-2xl font-bold text-purple-600">{users.filter(u => u.role === 'admin').length}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">{t('userManagement.normalUser')}</div>
              <div className="text-2xl font-bold text-blue-600">{users.filter(u => u.role === 'user').length}</div>
            </div>
          </div>
        )}

      {/* 用户列表 */}
      {loading ? (
        <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">{t('userManagement.loading')}</p>
        </div>
      ) : (
        <>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.username')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.nickname')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.email')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.role')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.stats')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.registerTime')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{t('userManagement.actions')}</th>
                  </tr>
                </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {users.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        {t('userManagement.noUsers')}
                      </td>
                    </tr>
                  ) : (
                    users.map((userItem) => (
                        <tr key={userItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shadow-md">
                              {userItem.username[0]?.toUpperCase()}
                            </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                  {userItem.username}
                            {userItem.id === user?.id && (
                                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                                {t('userManagement.currentUser')}
                              </span>
                            )}
                                </div>
                              </div>
                          </div>
                        </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {userItem.nickname || <span className="text-gray-400 italic">{t('userManagement.notSet')}</span>}
                            </div>
                        </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                          {userItem.email}
                            </div>
                        </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                          {userItem.id === user?.id ? (
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              userItem.role === 'admin'
                                ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}>
                              {userItem.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                              {userItem.role === 'admin' ? t('userManagement.adminRole') : t('userManagement.normalUserRole')}
                            </span>
                          ) : (
                            <select
                                className={`text-xs px-2.5 py-1 rounded-full font-medium border focus:ring-2 focus:ring-blue-500 ${
                                userItem.role === 'admin'
                                  ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                              }`}
                              value={userItem.role}
                              onChange={(e) => handleRoleChange(userItem.id, e.target.value)}
                            >
                              <option value="user">{t('userManagement.normalUserRole')}</option>
                              <option value="admin">{t('userManagement.adminRole')}</option>
                            </select>
                          )}
                        </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                  <BookOpen className="w-4 h-4" />
                                  {userItem.bookCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-4 h-4" />
                                  {userItem.shelfCount}
                                </span>
                              </div>
                          </div>
                        </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {new Date(userItem.created_at).toLocaleString('zh-CN', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                        </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(userItem)}
                                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title={t('userManagement.editUser')}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openPasswordModal(userItem.id)}
                                className="p-2 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                              title={t('userManagement.resetPassword')}
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            {userItem.id !== user?.id && (
                              <button
                                onClick={() => handleDelete(userItem.id, userItem.username)}
                                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title={t('userManagement.deleteUser')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分页 */}
          {total > limit && (
          <div className="flex items-center justify-between mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {t('userManagement.pageInfo', { total, page, totalPages: Math.ceil(total / limit) })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('userManagement.previousPage')}
                </button>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(total / limit), page + 1))}
                  disabled={page >= Math.ceil(total / limit)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {t('userManagement.nextPage')}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 创建用户模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <UserPlus className="w-6 h-6" />
                {t('userManagement.createNewUser')}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({
                    username: '',
                    email: '',
                    password: '',
                    role: 'user',
                  });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t('userManagement.username')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('userManagement.usernamePlaceholder')}
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {t('userManagement.email') || '邮箱'}
                </label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('userManagement.emailPlaceholder')}
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {t('userManagement.password') || '密码'}
                </label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('userManagement.passwordPlaceholder')}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">{t('userManagement.passwordHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {t('userManagement.roleLabel')}
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                >
                  <option value="user">{t('userManagement.normalUserRole')}</option>
                  <option value="admin">{t('userManagement.adminRole')}</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({
                      username: '',
                      email: '',
                      password: '',
                      role: 'user',
                    });
                  }}
                  disabled={creating}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {creating ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('common.loading')}
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {t('common.confirm')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户模态框 */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Edit className="w-6 h-6" />
                {t('userManagement.editUser')}
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                  setEditForm({ email: '', nickname: '' });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t('userManagement.username')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  value={editingUser.username}
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">{t('userManagement.usernameCannotChange') || '用户名注册后无法修改'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {t('userManagement.email')}
                </label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('userManagement.emailPlaceholder')}
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t('userManagement.nickname')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('userManagement.nicknamePlaceholder') || '请输入昵称（可选）'}
                  value={editForm.nickname || ''}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">{t('userManagement.nicknameHint') || '昵称用于在书籍详情中显示，留空则显示用户名'}</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                    setEditForm({ email: '', nickname: '' });
                  }}
                  disabled={editing}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleEditUser}
                  disabled={editing}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {editing ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('common.loading')}
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {t('common.save')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 重置密码模态框 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Key className="w-6 h-6" />
                {t('userManagement.resetPassword')}
              </h2>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setNewPassword('');
                  setResettingUserId(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {t('userManagement.newPassword')}
                </label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                  placeholder={t('userManagement.passwordPlaceholder')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">{t('userManagement.passwordHint')}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setNewPassword('');
                    setResettingUserId(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleResetPassword}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
