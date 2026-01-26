/**
 * @file AccountSettings.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { User, Lock, ArrowLeft, Save, Mail, Plus, Trash2, Edit2, X, Settings, RefreshCw, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import api, { getCustomApiUrl, setCustomApiUrl, getCustomApiKey, setCustomApiKey, getCurrentApiUrl } from '../utils/api';
import { enableE2EE, createBackup, restoreFromBackup, hasLocalPrivateKey, clearLocalPrivateKey } from '../utils/e2ee';
import toast from 'react-hot-toast';
import PasswordInput from '../components/PasswordInput';

export default function AccountSettings() {
  const { t } = useTranslation();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    nickname: '',
    can_upload_private: true,
    max_private_books: 30,
    can_upload_books: true,
    can_edit_books: true,
    can_download: true,
    can_push: true,
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
  
  // API服务器配置相关状态
  const [enableApiServerConfig, setEnableApiServerConfig] = useState(false);
  const [customApiUrl, setCustomApiUrlState] = useState<string>('');
  const [customApiKey, setCustomApiKeyState] = useState<string>('');
  const [testingApiUrl, setTestingApiUrl] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [e2eeEnabling, setE2eeEnabling] = useState(false);
  const [e2eeHasBackup, setE2eeHasBackup] = useState(false);
  const [hasLocalKey, setHasLocalKey] = useState<boolean>(false);
  const [showSetRecoveryModal, setShowSetRecoveryModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // 从后端获取最新的用户信息，确保权限信息是最新的
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (isAuthenticated) {
        try {
          const response = await api.get('/users/me', {
            timeout: 5000, // 5秒超时，如果超时则使用缓存数据
          });
          const latestUser = response.data.user;
          setUser(latestUser); // 更新authStore中的用户信息
          // 确保权限字段正确转换为布尔值
          const canUploadPrivate = latestUser.can_upload_private !== undefined && latestUser.can_upload_private !== null
            ? (latestUser.can_upload_private === true || latestUser.can_upload_private === 1 || latestUser.can_upload_private === '1')
            : (latestUser.role === 'admin'); // 默认：管理员允许，普通用户不允许
          
          setFormData({
            username: latestUser.username || '',
            email: latestUser.email || '',
            nickname: latestUser.nickname || '',
            can_upload_private: canUploadPrivate,
            max_private_books: latestUser.max_private_books !== undefined && latestUser.max_private_books !== null
              ? latestUser.max_private_books
              : 30, // 默认为30（向后兼容）
            can_upload_books: latestUser.can_upload_books !== undefined && latestUser.can_upload_books !== null
              ? (latestUser.can_upload_books === true || latestUser.can_upload_books === 1 || latestUser.can_upload_books === '1')
              : true, // 默认为true（向后兼容）
            can_edit_books: latestUser.can_edit_books !== undefined && latestUser.can_edit_books !== null
              ? (latestUser.can_edit_books === true || latestUser.can_edit_books === 1 || latestUser.can_edit_books === '1')
              : true, // 默认为true（向后兼容）
            can_download: latestUser.can_download !== undefined && latestUser.can_download !== null
              ? (latestUser.can_download === true || latestUser.can_download === 1 || latestUser.can_download === '1')
              : true, // 默认为true（向后兼容）
            can_push: latestUser.can_push !== undefined && latestUser.can_push !== null
              ? (latestUser.can_push === true || latestUser.can_push === 1 || latestUser.can_push === '1')
              : true, // 默认为true（向后兼容）
          });
          setE2eeEnabled(!!(latestUser as any).e2ee_public_key);
          setE2eeHasBackup(!!(latestUser as any).e2ee_has_backup);
          fetchPushEmails();
        } catch (error: any) {
          // 静默处理超时和网络错误，使用缓存数据
          const isNetworkError = error.code === 'ECONNABORTED' || 
                                error.code === 'ERR_NETWORK' || 
                                error.code === 'ERR_ADDRESS_INVALID' ||
                                error.message?.includes('timeout');
          
          // 静默处理网络错误
          
          // 如果获取失败，使用authStore中的信息作为后备
          if (user) {
            // 确保权限字段正确转换为布尔值
            const canUploadPrivate = (user as any).can_upload_private !== undefined && (user as any).can_upload_private !== null
              ? ((user as any).can_upload_private === true || (user as any).can_upload_private === 1 || (user as any).can_upload_private === '1')
              : ((user as any).role === 'admin'); // 默认：管理员允许，普通用户不允许
            
            setFormData({
              username: user.username || '',
              email: user.email || '',
              nickname: (user as any).nickname || '',
              can_upload_private: canUploadPrivate,
              max_private_books: (user as any).max_private_books !== undefined && (user as any).max_private_books !== null
                ? (user as any).max_private_books
                : 30, // 默认为30（向后兼容）
              can_upload_books: (user as any).can_upload_books !== undefined && (user as any).can_upload_books !== null
                ? ((user as any).can_upload_books === true || (user as any).can_upload_books === 1 || (user as any).can_upload_books === '1')
                : true, // 默认为true（向后兼容）
              can_edit_books: (user as any).can_edit_books !== undefined && (user as any).can_edit_books !== null
                ? ((user as any).can_edit_books === true || (user as any).can_edit_books === 1 || (user as any).can_edit_books === '1')
                : true, // 默认为true（向后兼容）
              can_download: (user as any).can_download !== undefined && (user as any).can_download !== null
                ? ((user as any).can_download === true || (user as any).can_download === 1 || (user as any).can_download === '1')
                : true, // 默认为true（向后兼容）
              can_push: (user as any).can_push !== undefined && (user as any).can_push !== null
                ? ((user as any).can_push === true || (user as any).can_push === 1 || (user as any).can_push === '1')
                : true, // 默认为true（向后兼容）
            });
            setE2eeEnabled(!!(user as any).e2ee_public_key);
            setE2eeHasBackup(!!(user as any).e2ee_has_backup);
          }
        }
      }
    };
    fetchUserInfo();
  }, [isAuthenticated]);

  // E2EE：本机是否有私钥（仅当账号已启用 E2EE 时检查）
  useEffect(() => {
    if (!e2eeEnabled) {
      setHasLocalKey(false);
      return;
    }
    hasLocalPrivateKey().then(setHasLocalKey);
  }, [e2eeEnabled]);

  // 获取系统配置，检查是否允许显示API服务器配置
  useEffect(() => {
    const fetchSystemConfig = async () => {
      try {
        const response = await api.get('/auth/system-config');
        setEnableApiServerConfig(response.data.enableApiServerConfigInLogin || false);
        
        // 如果允许显示，加载已保存的配置
        if (response.data.enableApiServerConfigInLogin) {
          const savedUrl = getCustomApiUrl();
          const savedApiKey = getCustomApiKey();
          setCustomApiUrlState(savedUrl || '');
          setCustomApiKeyState(savedApiKey || '');
        }
      } catch (error: any) {
        // 默认不显示
        setEnableApiServerConfig(false);
      }
    };
    
    fetchSystemConfig();
  }, []);

  // 测试服务器连接
  const handleTestConnection = async () => {
    if (!customApiUrl || !customApiUrl.trim()) {
      toast.error(t('settings.pleaseEnterServerAddress') || t('auth.serverAddressPlaceholder'));
      return;
    }

    const url = customApiUrl.trim().replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error(t('auth.serverAddressMustStartWithHttp'));
      return;
    }

    setTestingApiUrl(true);
    setConnectionStatus('idle');

    try {
      let testBaseUrl = url;
      if (!testBaseUrl.endsWith('/api') && !testBaseUrl.endsWith('/api/')) {
        testBaseUrl = `${testBaseUrl}/api`;
      }
      
      const testHeaders: any = {
        'Content-Type': 'application/json',
      };
      
      if (customApiKey && customApiKey.trim()) {
        testHeaders['X-API-Key'] = customApiKey.trim();
      }

      // 第一步：测试基本连接
      try {
        const publicResponse = await fetch(`${testBaseUrl}/settings/public`, {
          method: 'GET',
          headers: testHeaders,
          signal: AbortSignal.timeout(5000),
        });

        if (!publicResponse.ok && publicResponse.status !== 401 && publicResponse.status !== 403) {
          throw new Error(`HTTP ${publicResponse.status}: ${publicResponse.statusText}`);
        }
      } catch (networkError: any) {
        if (networkError.name === 'AbortError' || networkError.name === 'TimeoutError') {
          throw new Error('NETWORK_TIMEOUT');
        }
        if (networkError.message.includes('Failed to fetch') || networkError.message.includes('NetworkError')) {
          throw new Error('NETWORK_ERROR');
        }
        throw networkError;
      }

      // 第二步：如果输入了 API Key，验证 API Key
      if (customApiKey && customApiKey.trim()) {
        try {
          const authResponse = await fetch(`${testBaseUrl}/settings`, {
            method: 'GET',
            headers: testHeaders,
            signal: AbortSignal.timeout(5000),
          });

          if (authResponse.status === 403) {
            setConnectionStatus('error');
            toast.error(t('auth.connectionSuccessButApiKeyIncorrect'));
            return;
          }

          if (authResponse.status === 401 || authResponse.ok) {
            setConnectionStatus('success');
            toast.success(t('auth.connectionSuccess'));
          } else {
            throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`);
          }
        } catch (keyError: any) {
          if (keyError.name === 'AbortError' || keyError.name === 'TimeoutError') {
            throw new Error('NETWORK_TIMEOUT');
          }
          throw keyError;
        }
      } else {
        setConnectionStatus('success');
        toast.success(t('auth.connectionSuccessServerAddressValid'));
      }
    } catch (error: any) {
      setConnectionStatus('error');
      if (error.message === 'NETWORK_TIMEOUT' || error.name === 'AbortError' || error.name === 'TimeoutError') {
        toast.error(t('auth.connectionTimeout'));
      } else if (error.message === 'NETWORK_ERROR' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        toast.error(t('auth.cannotConnectToServer'));
      } else {
        toast.error(t('auth.connectionFailed', { error: error.message || t('common.unknownError') }));
      }
    } finally {
      setTestingApiUrl(false);
    }
  };

  // 保存服务器配置
  const handleSaveServerConfig = () => {
    try {
      if (customApiUrl && customApiUrl.trim()) {
        const url = customApiUrl.trim().replace(/\/+$/, '');
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          toast.error(t('auth.serverAddressMustStartWithHttp'));
          return;
        }
        
        setCustomApiUrl(url);
        
        if (customApiKey && customApiKey.trim()) {
          setCustomApiKey(customApiKey.trim());
        } else {
          setCustomApiKey(null);
        }
        
        toast.success(t('auth.serverConfigSaved'));
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setCustomApiUrl(null);
        setCustomApiKey(null);
        toast.success(t('settings.defaultServerAddressRestored'));
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error: any) {
      toast.error(t('auth.saveFailed', { error: error.message }));
    }
  };

  // 获取推送邮箱列表
  const fetchPushEmails = async () => {
    setLoadingEmails(true);
    try {
      const response = await api.get('/users/me/push-emails', {
        timeout: 3000, // 3秒超时
      });
      setPushEmails(response.data.emails || []);
    } catch (error: any) {
      // 网络错误时静默失败
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID') {
        toast.error(error.response?.data?.error || t('accountSettings.fetchPushEmailsFailed'));
      }
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
      await api.post(`/users/me/push-emails/${id}`, { _method: 'DELETE' });
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
      await api.post(`/users/me/push-emails/${id}`, { _method: 'PUT', email: editingEmailValue.trim() });
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
      // 普通用户只能修改邮箱和昵称，不能修改权限设置
      const response = await api.post('/users/me', { _method: 'PUT',
        email: formData.email.trim(),
        nickname: formData.nickname.trim() || null, // 允许清空昵称
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

  const handleEnableE2EE = async () => {
    setE2eeEnabling(true);
    try {
      const ok = await enableE2EE();
      if (ok) {
        const r = await api.get('/users/me', { timeout: 5000 });
        setUser(r.data.user);
        setE2eeEnabled(!!(r.data.user as any).e2ee_public_key);
        setE2eeHasBackup(!!(r.data.user as any).e2ee_has_backup);
        setHasLocalKey(true);
        toast.success(t('accountSettings.e2eeEnabled') || '端到端加密已启用');
      } else {
        toast.error(t('accountSettings.e2eeEnableFailed') || '启用失败');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || (t('accountSettings.e2eeEnableFailed') || '启用失败'));
    } finally {
      setE2eeEnabling(false);
    }
  };

  const handleSetRecoveryPassword = async () => {
    if (!recoveryPassword || recoveryPassword.length < 6) {
      toast.error(t('accountSettings.e2eeRecoveryPasswordTooShort') || '恢复密码至少 6 位');
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      toast.error(t('accountSettings.e2eeRecoveryPasswordMismatch') || '两次输入不一致');
      return;
    }
    setRecoveryLoading(true);
    try {
      const ok = await createBackup(recoveryPassword);
      if (ok) {
        const r = await api.get('/users/me', { timeout: 5000 });
        setUser(r.data.user);
        setE2eeHasBackup(!!(r.data.user as any).e2ee_has_backup);
        setShowSetRecoveryModal(false);
        setRecoveryPassword('');
        setRecoveryPasswordConfirm('');
        toast.success(t('accountSettings.e2eeRecoverySetSuccess') || '恢复密码已设置');
      } else {
        toast.error(t('accountSettings.e2eeRecoverySetFailed') || '设置失败');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || (t('accountSettings.e2eeRecoverySetFailed') || '设置失败'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleClearBackup = async () => {
    if (!confirm(t('accountSettings.e2eeClearBackupConfirm') || '清除后无法在新设备恢复密钥，确定继续？')) return;
    try {
      await api.post('/users/me/e2ee-backup', { _method: 'PUT', encrypted: null });
      const r = await api.get('/users/me', { timeout: 5000 });
      setUser(r.data.user);
      setE2eeHasBackup(false);
      toast.success(t('accountSettings.e2eeBackupCleared') || '恢复备份已清除');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || (t('common.operationFailed') || '操作失败'));
    }
  };

  const handleRestoreFromBackup = async () => {
    if (!restorePassword) {
      toast.error(t('accountSettings.e2eeRecoveryPasswordRequired') || '请输入恢复密码');
      return;
    }
    setRecoveryLoading(true);
    try {
      const ok = await restoreFromBackup(restorePassword);
      if (ok) {
        setHasLocalKey(true);
        const r = await api.get('/users/me', { timeout: 5000 });
        setUser(r.data.user);
        setShowRestoreModal(false);
        setRestorePassword('');
        toast.success(t('accountSettings.e2eeRestoreSuccess') || '密钥已恢复，本设备可正常加解密');
      } else {
        toast.error(t('accountSettings.e2eeRestoreFailed') || '恢复失败，请检查恢复密码');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || (t('accountSettings.e2eeRestoreFailed') || '恢复失败'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleDisableE2EE = async () => {
    if (!confirm(t('accountSettings.e2eeDisableConfirm') || '确定要关闭端到端加密吗？关闭后将清除所有相关密钥，此设备和服务器将无法解密历史E2EE消息。')) return;
    setE2eeEnabling(true);
    try {
      // 1. 本地清除私钥
      await clearLocalPrivateKey();
      // 2. 服务器端清除公钥
      await api.post('/users/me/e2ee-public-key', { _method: 'PUT', publicKey: null });
      // 3. 清除服务器端的私钥备份
      await api.post('/users/me/e2ee-backup', { _method: 'PUT', encrypted: null });
      // 4. 更新本地状态
      const r = await api.get('/users/me', { timeout: 5000 });
      setUser(r.data.user);
      setE2eeEnabled(false);
      setE2eeHasBackup(false);
      setHasLocalKey(false);
      toast.success(t('accountSettings.e2eeDisabled') || '端到端加密已关闭');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || (t('accountSettings.e2eeDisableFailed') || '关闭失败'));
    } finally {
      setE2eeEnabling(false);
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
      await api.post('/users/me/password', { _method: 'PUT',
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
          
          {/* 权限设置信息（只读，仅显示当前状态） */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('accountSettings.canUploadPrivate')}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formData.can_upload_private 
                    ? t('accountSettings.canUploadPrivateEnabled') || '已启用'
                    : t('accountSettings.canUploadPrivateDisabled') || '已禁用'}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                formData.can_upload_private 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {formData.can_upload_private ? t('common.yes') : t('common.no')}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('accountSettings.maxPrivateBooks')}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formData.max_private_books === 0 
                  ? t('accountSettings.unlimited') || '无限制'
                  : t('accountSettings.maxPrivateBooksValue', { count: formData.max_private_books }) || `${formData.max_private_books} 本`}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
              {t('accountSettings.permissionSettingsNote') || '权限设置由管理员管理，如需修改请联系管理员'}
            </p>
            
            {/* 其他权限信息 */}
            <div className="mt-4 space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('accountSettings.canUploadBooks') || '允许上传书籍'}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  formData.can_upload_books 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {formData.can_upload_books ? t('common.yes') : t('common.no')}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('accountSettings.canEditBooks') || '允许编辑书籍信息'}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  formData.can_edit_books 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {formData.can_edit_books ? t('common.yes') : t('common.no')}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('accountSettings.canDownload') || '允许下载书籍'}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  formData.can_download 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {formData.can_download ? t('common.yes') : t('common.no')}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('accountSettings.canPush') || '允许推送书籍'}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  formData.can_push 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {formData.can_push ? t('common.yes') : t('common.no')}
                </span>
              </div>
            </div>
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

      {/* API服务器配置 - 根据系统设置决定是否显示 */}
      {enableApiServerConfig && (
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('auth.serverConfig')}</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('auth.serverAddress')} <span className="text-gray-400 text-xs">({t('auth.optional')})</span>
            </label>
            <input
              type="text"
              className="input w-full"
              value={customApiUrl}
              onChange={(e) => setCustomApiUrlState(e.target.value)}
              placeholder={t('auth.serverAddressPlaceholder')}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('auth.current')}: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">{getCurrentApiUrl()}</code>
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('auth.apiKey')} <span className="text-gray-400 text-xs">({t('auth.optional')})</span>
            </label>
            <PasswordInput
              value={customApiKey}
              onChange={(e) => setCustomApiKeyState(e.target.value)}
              placeholder={t('auth.apiKeyPlaceholder')}
              className="input w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('auth.apiKeyHint')}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testingApiUrl || !customApiUrl?.trim()}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {testingApiUrl ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('auth.testing')}
                </>
              ) : (
                <>
                  {connectionStatus === 'success' && <CheckCircle className="w-4 h-4" />}
                  {connectionStatus === 'error' && <XCircle className="w-4 h-4" />}
                  {t('auth.testConnection')}
                </>
              )}
            </button>
            <button
              onClick={handleSaveServerConfig}
              className="btn btn-secondary flex-1"
            >
              {t('auth.saveConfig')}
            </button>
          </div>

          {getCustomApiUrl() && (
            <button
              onClick={() => {
                setCustomApiUrl(null);
                setCustomApiKey(null);
                setCustomApiUrlState('');
                setCustomApiKeyState('');
                toast.success(t('auth.configCleared'));
                setTimeout(() => window.location.reload(), 1000);
              }}
              className="btn btn-sm btn-danger w-full"
            >
              {t('auth.clearConfig')}
            </button>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            💡 {t('auth.serverConfigHint')}
          </p>
        </div>
      </div>
      )}

      {/* 端到端加密（1:1 书友文字消息） */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('accountSettings.e2eeTitle') || '端到端加密（书友消息）'}</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {t('accountSettings.e2eeDesc') || '仅对 1:1 好友文字消息加密，服务器无法解密。双方均需启用；群聊、图片、语音等不加密。'}
        </p>

        {!e2eeEnabled && (
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {t('accountSettings.e2eeStatusOff') || '未启用'}
            </span>
            <button onClick={handleEnableE2EE} disabled={e2eeEnabling} className="btn btn-primary">
              {e2eeEnabling ? (t('common.loading') || '...') : (t('accountSettings.e2eeEnable') || '启用')}
            </button>
          </div>
        )}

        {e2eeEnabled && hasLocalKey && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                {t('accountSettings.e2eeStatusOn') || '已启用'}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('accountSettings.e2eeRecoveryBackup') || '恢复备份'}: {e2eeHasBackup ? (t('accountSettings.e2eeRecoverySet') || '已设置') : (t('accountSettings.e2eeRecoveryNotSet') || '未设置')}
            </p>
            {!e2eeHasBackup && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t('accountSettings.e2eeRecoverySuggestion') || '为在手机等新设备上恢复密钥，建议设置恢复密码。'}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setRecoveryPassword(''); setRecoveryPasswordConfirm(''); setShowSetRecoveryModal(true); }} className="btn btn-secondary">
                {e2eeHasBackup ? (t('accountSettings.e2eeUpdateRecovery') || '更新恢复密码') : (t('accountSettings.e2eeSetRecovery') || '设置恢复密码')}
              </button>
              {e2eeHasBackup && (
                <button onClick={handleClearBackup} className="btn btn-danger">
                  {t('accountSettings.e2eeClearBackup') || '清除恢复备份'}
                </button>
              )}
              <button onClick={handleDisableE2EE} disabled={e2eeEnabling} className="btn btn-danger">
                {t('accountSettings.e2eeDisable') || '关闭端到端加密'}
              </button>
            </div>
          </div>
        )}

        {e2eeEnabled && !hasLocalKey && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {t('accountSettings.e2eeNoLocalKey') || '本设备未恢复密钥'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {e2eeHasBackup
                ? (t('accountSettings.e2eeRestoreHint') || '您已在其他设备设置恢复密码，可在此输入恢复密码从账号恢复密钥，即可在此设备查看与发送加密消息。')
                : (t('accountSettings.e2eeNoBackupHint') || '您尚未设置恢复密码，无法在此设备恢复。请先在已启用 E2EE 的设备（如电脑）上设置恢复密码；或在此重新启用 E2EE（将生成新密钥，原设备将无法解密之后的新消息）。')}
            </p>
            <div className="flex flex-wrap gap-2">
              {e2eeHasBackup && (
                <button onClick={() => { setRestorePassword(''); setShowRestoreModal(true); }} className="btn btn-primary">
                  {t('accountSettings.e2eeRestoreFromAccount') || '从账号恢复'}
                </button>
              )}
              {!e2eeHasBackup && (
                <button onClick={handleEnableE2EE} disabled={e2eeEnabling} className="btn btn-secondary">
                  {e2eeEnabling ? (t('common.loading') || '...') : (t('accountSettings.e2eeReEnable') || '在本设备重新启用 E2EE')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 设置/更新恢复密码 弹窗 */}
      {showSetRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !recoveryLoading && setShowSetRecoveryModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{e2eeHasBackup ? (t('accountSettings.e2eeUpdateRecovery') || '更新恢复密码') : (t('accountSettings.e2eeSetRecovery') || '设置恢复密码')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{t('accountSettings.e2eeRecoveryPasswordHint') || '用于在新设备上恢复密钥，请妥善保管。至少 6 位。'}</p>
            <div className="space-y-3">
              <PasswordInput value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} placeholder={t('accountSettings.e2eeRecoveryPassword') || '恢复密码'} className="input w-full" />
              <PasswordInput value={recoveryPasswordConfirm} onChange={e => setRecoveryPasswordConfirm(e.target.value)} placeholder={t('accountSettings.e2eeRecoveryPasswordConfirm') || '确认恢复密码'} className="input w-full" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => !recoveryLoading && setShowSetRecoveryModal(false)} className="btn btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleSetRecoveryPassword} disabled={recoveryLoading} className="btn btn-primary">{recoveryLoading ? t('common.loading') : t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 从账号恢复 弹窗 */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !recoveryLoading && setShowRestoreModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('accountSettings.e2eeRestoreFromAccount') || '从账号恢复'}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{t('accountSettings.e2eeRestorePasswordHint') || '输入您在其他设备设置的恢复密码。'}</p>
            <PasswordInput value={restorePassword} onChange={e => setRestorePassword(e.target.value)} placeholder={t('accountSettings.e2eeRecoveryPassword') || '恢复密码'} className="input w-full mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => !recoveryLoading && setShowRestoreModal(false)} className="btn btn-secondary">{t('common.cancel')}</button>
              <button onClick={handleRestoreFromBackup} disabled={recoveryLoading} className="btn btn-primary">{recoveryLoading ? t('common.loading') : t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}

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
            <PasswordInput
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              placeholder={t('accountSettings.currentPasswordPlaceholder')}
              className="input w-full"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('accountSettings.newPassword')}
            </label>
            <PasswordInput
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              placeholder={t('userManagement.passwordPlaceholder')}
              className="input w-full"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              {t('accountSettings.confirmPassword')}
            </label>
            <PasswordInput
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              placeholder={t('accountSettings.confirmPasswordPlaceholder')}
              className="input w-full"
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

