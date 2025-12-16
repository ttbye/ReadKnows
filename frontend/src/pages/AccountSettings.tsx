/**
 * @file AccountSettings.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { User, Lock, ArrowLeft, Save, Mail, Plus, Trash2, Edit2, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function AccountSettings() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // 推送邮箱相关状态
  const [pushEmails, setPushEmails] = useState<any[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
      });
      fetchPushEmails();
    }
  }, [user]);

  // 获取推送邮箱列表
  const fetchPushEmails = async () => {
    setLoadingEmails(true);
    try {
      const response = await api.get('/users/me/push-emails');
      setPushEmails(response.data.emails || []);
    } catch (error: any) {
      console.error('获取推送邮箱列表失败:', error);
      toast.error(error.response?.data?.error || '获取推送邮箱列表失败');
    } finally {
      setLoadingEmails(false);
    }
  };

  // 添加推送邮箱
  const handleAddEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    try {
      await api.post('/users/me/push-emails', { email: newEmail.trim() });
      toast.success('推送邮箱添加成功');
      setNewEmail('');
      setShowAddEmail(false);
      fetchPushEmails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '添加推送邮箱失败');
    }
  };

  // 删除推送邮箱
  const handleDeleteEmail = async (id: string) => {
    if (!confirm('确定要删除这个推送邮箱吗？')) {
      return;
    }

    try {
      await api.delete(`/users/me/push-emails/${id}`);
      toast.success('推送邮箱删除成功');
      fetchPushEmails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '删除推送邮箱失败');
    }
  };

  // 开始编辑邮箱
  const startEditEmail = (id: string, currentEmail: string) => {
    setEditingEmail(id);
    setEditingEmailValue(currentEmail);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingEmail(null);
    setEditingEmailValue('');
  };

  // 保存编辑
  const handleSaveEdit = async (id: string) => {
    if (!editingEmailValue.trim() || !editingEmailValue.includes('@')) {
      toast.error('请输入有效的邮箱地址');
      return;
    }

    try {
      await api.put(`/users/me/push-emails/${id}`, { email: editingEmailValue.trim() });
      toast.success('推送邮箱更新成功');
      setEditingEmail(null);
      setEditingEmailValue('');
      fetchPushEmails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '更新推送邮箱失败');
    }
  };

  const handleSave = async () => {
    if (!formData.email.trim()) {
      toast.error('请填写邮箱');
      return;
    }

    setSaving(true);
    try {
      const response = await api.put('/users/me', {
        email: formData.email.trim(),
      });
      
      // 更新store中的用户信息
      setUser(response.data.user);
      toast.success('个人信息已更新');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast.error('请填写所有密码字段');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error('新密码长度至少6位');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    setChangingPassword(true);
    try {
      await api.put('/users/me/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      
      toast.success('密码修改成功');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || '密码修改失败');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* 个人信息 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">个人信息</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              用户名
            </label>
            <input
              type="text"
              className="input w-full bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
              value={formData.username}
              readOnly
              disabled
              placeholder="用户名"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              用户名注册后无法修改
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              邮箱
            </label>
            <input
              type="email"
              className="input w-full"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="请输入邮箱"
            />
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存修改
              </>
            )}
          </button>
        </div>
      </div>

      {/* 推送邮箱管理 */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">推送邮箱管理</h2>
          </div>
          {!showAddEmail && (
            <button
              onClick={() => setShowAddEmail(true)}
              className="btn btn-sm btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加邮箱
            </button>
          )}
        </div>

        <div className="space-y-3">
          {/* 添加邮箱表单 */}
          {showAddEmail && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                <input
                  type="email"
                  className="input flex-1"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="请输入推送邮箱地址（如：example@kindle.com）"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddEmail();
                    }
                  }}
                />
                <button
                  onClick={handleAddEmail}
                  className="btn btn-primary"
                >
                  添加
                </button>
                <button
                  onClick={() => {
                    setShowAddEmail(false);
                    setNewEmail('');
                  }}
                  className="btn btn-secondary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                支持Kindle邮箱（@kindle.com）和普通邮箱
              </p>
            </div>
          )}

          {/* 邮箱列表 */}
          {loadingEmails ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto"></div>
              <p className="mt-2">加载中...</p>
            </div>
          ) : pushEmails.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无推送邮箱</p>
              <p className="text-xs mt-1">添加邮箱后，推送书籍时会自动记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pushEmails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  {editingEmail === email.id ? (
                    <>
                      <input
                        type="email"
                        className="input flex-1"
                        value={editingEmailValue}
                        onChange={(e) => setEditingEmailValue(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(email.id);
                          } else if (e.key === 'Escape') {
                            cancelEdit();
                          }
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(email.id)}
                        className="btn btn-sm btn-primary"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="btn btn-sm btn-secondary"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {email.email}
                          </span>
                          {email.is_kindle && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                              Kindle
                            </span>
                          )}
                        </div>
                        {email.last_used_at && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            最后使用：{new Date(email.last_used_at).toLocaleString('zh-CN')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => startEditEmail(email.id, email.email)}
                        className="btn btn-sm btn-secondary"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmail(email.id)}
                        className="btn btn-sm btn-danger"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 修改密码 */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">修改密码</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              当前密码
            </label>
            <input
              type="password"
              className="input w-full"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              placeholder="请输入当前密码"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              新密码
            </label>
            <input
              type="password"
              className="input w-full"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              placeholder="请输入新密码（至少6位）"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              确认新密码
            </label>
            <input
              type="password"
              className="input w-full"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              placeholder="请再次输入新密码"
            />
          </div>
          
          <button
            onClick={handleChangePassword}
            disabled={changingPassword}
            className="btn btn-primary w-full"
          >
            {changingPassword ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                修改中...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                修改密码
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

