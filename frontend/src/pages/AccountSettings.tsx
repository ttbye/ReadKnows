/**
 * @file AccountSettings.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { User, Lock, ArrowLeft, Save, Mail, Plus, Trash2, Edit2, X } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function AccountSettings() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    nickname: '',
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
        nickname: (user as any).nickname || '',
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
      toast.error(error.response?.data?.error || t('accountSettings.fetchPushEmailsFailed'));
    } finally {
      setLoadingEmails(false);
    }
  };

  // 添加推送邮箱
  const handleAddEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error(t('accountSettings.emailPlaceholder') || t('bookDetail.enterValidEmail'));
      return;
    }

    try {
      await api.post('/users/me/push-emails', { email: newEmail.trim() });
      toast.success(t('accountSettings.pushEmailAdded'));
      setNewEmail('');
      setShowAddEmail(false);
      fetchPushEmails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('accountSettings.addPushEmailFailed'));
    }
  };

  // 删除推送邮箱
  const handleDeleteEmail = async (id: string) => {
    if (!confirm(t('accountSettings.confirmDeletePushEmail'))) {
      return;
    }

    try {
      await api.delete(`/users/me/push-emails/${id}`);
      toast.success(t('accountSettings.pushEmailDeleted'));
      fetchPushEmails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('accountSettings.deletePushEmailFailed'));
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
      toast.error(t('accountSettings.emailPlaceholder') || t('bookDetail.enterValidEmail'));
      return;
    }

    try {
      await api.put(`/users/me/push-emails/${id}`, { email: editingEmailValue.trim() });
      toast.success(t('accountSettings.pushEmailUpdated'));
      setEditingEmail(null);
      setEditingEmailValue('');
      fetchPushEmails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('accountSettings.updatePushEmailFailed'));
    }
  };

  const handleSave = async () => {
    if (!formData.email.trim()) {
      toast.error(t('accountSettings.pleaseFillEmail'));
      return;
    }

    setSaving(true);
    try {
      const response = await api.put('/users/me', {
        email: formData.email.trim(),
      });
      
      // 更新store中的用户信息
      setUser(response.data.user);
      toast.success(t('accountSettings.personalInfoUpdated'));
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('accountSettings.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast.error(t('accountSettings.pleaseFillAllPasswordFields'));
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast.error(t('accountSettings.newPasswordMinLength'));
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('accountSettings.passwordsNotMatch'));
      return;
    }

    setChangingPassword(true);
    try {
      await api.put('/users/me/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      
      toast.success(t('accountSettings.passwordChanged'));
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('accountSettings.changePasswordFailed'));
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('accountSettings.personalInfo')}</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('userManagement.username')}
            </label>
            <input
              type="text"
              className="input w-full bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
              value={formData.username}
              readOnly
              disabled
              placeholder={t('userManagement.username')}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('userManagement.usernameCannotChange')}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('userManagement.email')}
            </label>
            <input
              type="email"
              className="input w-full"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('userManagement.emailPlaceholder')}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('userManagement.nickname')}
            </label>
            <input
              type="text"
              className="input w-full"
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              placeholder={t('userManagement.nicknamePlaceholder')}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('userManagement.nicknameHint')}
            </p>
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {t('common.loading')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('common.save')}
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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('accountSettings.pushEmails')}</h2>
          </div>
          {!showAddEmail && (
            <button
              onClick={() => setShowAddEmail(true)}
              className="btn btn-sm btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('accountSettings.addPushEmail')}
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
                  placeholder={t('accountSettings.emailPlaceholder')}
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
                  {t('common.add')}
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
                {t('book.supportKindleEmail')}
              </p>
            </div>
          )}

          {/* 邮箱列表 */}
          {loadingEmails ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto"></div>
              <p className="mt-2">{t('common.loading')}</p>
            </div>
          ) : pushEmails.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t('accountSettings.noPushEmails')}</p>
              <p className="text-xs mt-1">{t('accountSettings.pushEmailHint')}</p>
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
                            {t('accountSettings.lastUsed')}：{new Date(email.last_used_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => startEditEmail(email.id, email.email)}
                        className="btn btn-sm btn-secondary"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmail(email.id)}
                        className="btn btn-sm btn-danger"
                        title={t('common.delete')}
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('accountSettings.changePassword')}</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('accountSettings.currentPassword')}
            </label>
            <input
              type="password"
              className="input w-full"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              placeholder={t('accountSettings.currentPasswordPlaceholder')}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('accountSettings.newPassword')}
            </label>
            <input
              type="password"
              className="input w-full"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              placeholder={t('userManagement.passwordPlaceholder')}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('accountSettings.confirmPassword')}
            </label>
            <input
              type="password"
              className="input w-full"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              placeholder={t('accountSettings.confirmPasswordPlaceholder')}
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
                {t('common.loading')}
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                {t('accountSettings.changePassword')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

