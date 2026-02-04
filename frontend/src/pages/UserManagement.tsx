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
import { Users, Shield, User, Trash2, Edit, Search, ChevronLeft, ChevronRight, Key, X, Check, Plus, UserPlus, Mail, Lock, BookOpen, Activity, Clock, Crown } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { formatTimeWithTimezone } from '../utils/timezone';

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  nickname?: string;
  can_upload_private?: boolean;
  max_private_books?: number;
  can_upload_books?: boolean;
  can_edit_books?: boolean;
  can_download?: boolean;
  can_push?: boolean;
  can_upload_audiobook?: boolean;
  can_use_friends?: boolean;
  created_at: string;
  updated_at: string;
  last_login_time?: string;
  bookCount: number;
  shelfCount: number;
}

interface CreateUserForm {
  username: string;
  email: string;
  password: string;
  role: string;
  can_upload_private?: boolean;
  max_private_books?: number;
  can_upload_books?: boolean;
  can_edit_books?: boolean;
  can_download?: boolean;
  can_push?: boolean;
  can_upload_audiobook?: boolean;
}

interface EditUserForm {
  email: string;
  nickname?: string;
  can_upload_private?: boolean;
  max_private_books?: number;
  can_upload_books?: boolean;
  can_edit_books?: boolean;
  can_download?: boolean;
  can_push?: boolean;
  can_upload_audiobook?: boolean;
  can_use_friends?: boolean;
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
    can_upload_private: true,
    max_private_books: 30,
    can_upload_books: true,
    can_edit_books: true,
    can_download: true,
    can_push: true,
    can_use_friends: true,
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

    const updateToast = toast.loading(t('userManagement.updatingUser') || '正在更新用户信息...');

    try {
      setEditing(true);
      await api.put(`/users/${editingUser.id}`, editForm, {
        timeout: 5000, // 5秒超时
      });
      toast.success(t('userManagement.userUpdated'), { id: updateToast });
      setShowEditModal(false);
      setEditingUser(null);
      setEditForm({ email: '', nickname: '', can_upload_private: true, max_private_books: 30, can_upload_books: true, can_edit_books: true, can_download: true, can_push: true, can_upload_audiobook: false, can_use_friends: true });
      fetchUsers();
    } catch (error: any) {
      let errorMessage = t('userManagement.updateUserFailed');
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = t('userManagement.updateUserTimeout') || '更新操作超时，请稍后重试';
      } else if (error.code === 'ERR_CONNECTION_RESET' || error.message?.includes('ERR_CONNECTION_RESET')) {
        errorMessage = t('userManagement.updateUserConnectionReset') || '连接被重置，请稍后重试';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage, { id: updateToast });
      
      // 如果是连接重置，延迟刷新用户列表
      if (error.code === 'ERR_CONNECTION_RESET' || error.message?.includes('ERR_CONNECTION_RESET')) {
        setTimeout(() => {
          fetchUsers();
        }, 2000);
      }
    } finally {
      setEditing(false);
    }
  };

  const openEditModal = (userItem: UserItem) => {
    setEditingUser(userItem);
    setEditForm({ 
      email: userItem.email, 
      nickname: userItem.nickname || '',
      can_upload_private: userItem.can_upload_private !== undefined 
        ? userItem.can_upload_private 
        : (userItem.role === 'admin'), // 默认：管理员允许，普通用户不允许
      max_private_books: userItem.max_private_books !== undefined && userItem.max_private_books !== null
        ? userItem.max_private_books
        : 30, // 默认为30（向后兼容）
      can_upload_books: userItem.can_upload_books !== undefined 
        ? userItem.can_upload_books 
        : true, // 默认为true（向后兼容）
      can_edit_books: userItem.can_edit_books !== undefined 
        ? userItem.can_edit_books 
        : true, // 默认为true（向后兼容）
      can_download: userItem.can_download !== undefined 
        ? userItem.can_download 
        : true, // 默认为true（向后兼容）
      can_push: userItem.can_push !== undefined 
        ? userItem.can_push 
        : true, // 默认为true（向后兼容）
      can_upload_audiobook: userItem.can_upload_audiobook !== undefined
        ? userItem.can_upload_audiobook
        : (userItem.role === 'admin'), // 默认：管理员允许，普通用户禁用
      can_use_friends: userItem.can_use_friends !== undefined
        ? userItem.can_use_friends
        : true, // 默认允许（向后兼容）
    });
    setShowEditModal(true);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.post(`/users/${userId}/role`, { _method: 'PUT',  role: newRole  });
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

    const deleteToast = toast.loading(t('userManagement.deletingUser', { username }) || `正在删除用户 ${username}...`);

    try {
      // 为删除操作使用更长的超时时间（120秒，匹配后端超时设置）
      // Docker 环境下删除大量关联数据可能需要更长时间
      await api.post(`/users/${userId}`, { _method: 'DELETE', 
        timeout: 120000,
       });
      toast.success(t('userManagement.userDeleted'), { id: deleteToast });
      fetchUsers();
    } catch (error: any) {
      let errorMessage = t('userManagement.deleteUserFailed');
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = t('userManagement.deleteUserTimeout') || '删除操作超时，请稍后重试';
      } else if (error.code === 'ERR_CONNECTION_RESET' || error.message?.includes('ERR_CONNECTION_RESET')) {
        errorMessage = t('userManagement.deleteUserConnectionReset') || '连接被重置，用户可能正在删除中，请稍后刷新页面查看';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage, { id: deleteToast });
      
      // 如果是连接重置，可能是操作正在进行，延迟刷新用户列表
      if (error.code === 'ERR_CONNECTION_RESET' || error.message?.includes('ERR_CONNECTION_RESET')) {
        setTimeout(() => {
          fetchUsers();
        }, 3000);
      }
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
      await api.post(`/users/${resettingUserId}/password`, { _method: 'PUT',  password: newPassword  });
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
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
      {/* 紧凑的页面头部 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">用户管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title="创建用户"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 紧凑的统计信息 */}
      {!loading && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">总用户</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{total}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Crown className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">管理员</span>
            </div>
            <div className="text-base font-semibold text-purple-600">{users.filter(u => u.role === 'admin').length}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">普通用户</span>
            </div>
            <div className="text-base font-semibold text-green-600">{users.filter(u => u.role === 'user').length}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">页码</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{page}</div>
          </div>
        </div>
      )}

      {/* 紧凑的操作栏 */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder={t('userManagement.searchPlaceholder') || '搜索用户名或邮箱'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* 用户列表 - 响应式布局 */}
      {loading ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">加载中...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <Users className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">暂无用户</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 桌面端表格布局 */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      角色
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      统计
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      最后登录
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      注册时间
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((userItem) => (
                    <tr key={userItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                            {userItem.username[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              {userItem.username}
                              {userItem.id === user?.id && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                  当前
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {userItem.email}
                            </div>
                            {userItem.nickname && (
                              <div className="text-xs text-gray-400 dark:text-gray-500">
                                {userItem.nickname}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {userItem.id === user?.id ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            userItem.role === 'admin'
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                              : 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                          }`}>
                            {userItem.role === 'admin' ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {userItem.role === 'admin' ? '管理员' : '用户'}
                          </span>
                        ) : (
                          <select
                            className={`text-xs px-2 py-1 rounded font-medium border focus:ring-2 focus:ring-blue-500 ${
                              userItem.role === 'admin'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
                                : 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                            }`}
                            value={userItem.role}
                            onChange={(e) => handleRoleChange(userItem.id, e.target.value)}
                          >
                            <option value="user">用户</option>
                            <option value="admin">管理员</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" />
                              {userItem.bookCount}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {userItem.shelfCount}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {userItem.last_login_time ? formatTimeWithTimezone(userItem.last_login_time, {
                            showTime: true,
                            showDate: true,
                            relative: false,
                          }) : '从未登录'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {formatTimeWithTimezone(userItem.created_at, {
                            showTime: false,
                            showDate: true,
                            relative: false,
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(userItem)}
                            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="编辑用户"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openPasswordModal(userItem.id)}
                            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                            title="重置密码"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          {userItem.id !== user?.id && (
                            <button
                              onClick={() => handleDelete(userItem.id, userItem.username)}
                              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="删除用户"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 移动端卡片布局 */}
          <div className="md:hidden space-y-2">
            {users.map((userItem) => (
              <div key={userItem.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {userItem.username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {userItem.username}
                        </span>
                        {userItem.id === user?.id && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded flex-shrink-0">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1">
                        {userItem.email}
                      </div>
                      {userItem.nickname && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {userItem.nickname}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      userItem.role === 'admin'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                    }`}>
                      {userItem.role === 'admin' ? '管理员' : '用户'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {userItem.bookCount}本
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {userItem.shelfCount}架
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>注册：{formatTimeWithTimezone(userItem.created_at, {
                      showTime: false,
                      showDate: true,
                      relative: false,
                    })}</span>
                    <span className="truncate ml-2">
                      登录：{userItem.last_login_time ? formatTimeWithTimezone(userItem.last_login_time, {
                        showTime: false,
                        showDate: true,
                        relative: false,
                      }) : '从未'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-1 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => openEditModal(userItem)}
                    className="flex-1 p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-xs font-medium transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => openPasswordModal(userItem.id)}
                    className="flex-1 p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded text-xs font-medium transition-colors"
                  >
                    重置密码
                  </button>
                  {userItem.id !== user?.id && (
                    <button
                      onClick={() => handleDelete(userItem.id, userItem.username)}
                      className="flex-1 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs font-medium transition-colors"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 紧凑的分页控件 */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {total} 个用户
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 min-w-[3rem] text-center">
                  {page}/{Math.ceil(total / limit)}
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(total / limit), page + 1))}
                  disabled={page >= Math.ceil(total / limit)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 创建用户模态框 - 移动端优化 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full max-h-[90vh] flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <UserPlus className="w-5 h-5" />
                创建用户
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
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容区域 - 可滚动 */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    用户名
                  </label>
                  <input
                    type="text"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="请输入用户名"
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    邮箱
                  </label>
                  <input
                    type="email"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="请输入邮箱"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    密码
                  </label>
                  <PasswordInput
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="请输入密码"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">密码至少6位字符</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    角色
                  </label>
                  <select
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 按钮栏 - 固定 */}
            <div className="flex gap-2 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
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
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateUser}
                disabled={creating}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors"
              >
                {creating ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    创建中
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    创建
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户模态框 - 移动端优化 */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full max-h-[90vh] flex flex-col">
            {/* 标题栏 - 固定 */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Edit className="w-5 h-5" />
                编辑用户
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                  setEditForm({ email: '', nickname: '', can_upload_private: true, max_private_books: 30, can_upload_books: true, can_edit_books: true, can_download: true, can_push: true, can_upload_audiobook: false, can_use_friends: true });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容区域 - 可滚动 */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    用户名
                  </label>
                  <input
                    type="text"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    value={editingUser.username}
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    邮箱
                  </label>
                  <input
                    type="email"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="请输入邮箱"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    昵称
                  </label>
                  <input
                    type="text"
                    className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    placeholder="请输入昵称（可选）"
                    value={editForm.nickname || ''}
                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                  />
                </div>

                {/* 简化的权限设置 - 只显示关键权限 */}
                <div className="pt-2">
                  <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
                    <Shield className="w-3.5 h-3.5" />
                    权限设置
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">上传书籍</span>
                        <input
                          type="checkbox"
                          checked={editForm.can_upload_books !== undefined ? editForm.can_upload_books : true}
                          onChange={(e) => setEditForm({ ...editForm, can_upload_books: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </label>
                    </div>

                    <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">编辑书籍</span>
                        <input
                          type="checkbox"
                          checked={editForm.can_edit_books !== undefined ? editForm.can_edit_books : true}
                          onChange={(e) => setEditForm({ ...editForm, can_edit_books: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </label>
                    </div>

                    <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">下载书籍</span>
                        <input
                          type="checkbox"
                          checked={editForm.can_download !== undefined ? editForm.can_download : true}
                          onChange={(e) => setEditForm({ ...editForm, can_download: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </label>
                    </div>

                    <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">上传有声小说</span>
                        <input
                          type="checkbox"
                          checked={editForm.can_upload_audiobook !== undefined ? editForm.can_upload_audiobook : (editingUser?.role === 'admin')}
                          onChange={(e) => setEditForm({ ...editForm, can_upload_audiobook: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </label>
                    </div>

                    <div className="col-span-2 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">书友功能</span>
                        <input
                          type="checkbox"
                          checked={editForm.can_use_friends !== undefined ? editForm.can_use_friends : true}
                          onChange={(e) => setEditForm({ ...editForm, can_use_friends: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 按钮栏 - 固定 */}
            <div className="flex gap-2 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                  setEditForm({ email: '', nickname: '', can_upload_private: true, max_private_books: 30, can_upload_books: true, can_edit_books: true, can_download: true, can_push: true, can_upload_audiobook: false, can_use_friends: true });
                }}
                disabled={editing}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleEditUser}
                disabled={editing}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors"
              >
                {editing ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    保存中
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    保存
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重置密码模态框 - 移动端优化 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full">
            {/* 标题栏 */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Key className="w-5 h-5" />
                重置密码
              </h2>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setNewPassword('');
                  setResettingUserId(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容区域 */}
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  新密码
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码"
                  className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">密码至少6位字符</p>
              </div>

              {/* 按钮栏 */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setNewPassword('');
                    setResettingUserId(null);
                  }}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleResetPassword}
                  className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
