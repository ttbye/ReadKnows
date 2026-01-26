/**
 * @file Register.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api, { getCustomApiUrl, getCustomApiKey } from '../utils/api';
import toast from 'react-hot-toast';
import { Key, UserPlus, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PasswordInput from '../components/PasswordInput';

interface SystemConfig {
  registrationEnabled: boolean;
  privateKeyRequiredForLogin: boolean;
  privateKeyRequiredForRegister: boolean;
  hasPrivateKey: boolean;
}

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [showPrivateKeyStep, setShowPrivateKeyStep] = useState(false);
  const [privateKeyVerified, setPrivateKeyVerified] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    nickname: '',
    email: '',
    password: '',
    confirmPassword: '',
    privateKey: '',
  });
  const [loading, setLoading] = useState(false);
  const [verifyingPrivateKey, setVerifyingPrivateKey] = useState(false);

  // 获取系统配置
  useEffect(() => {
    const fetchSystemConfig = async () => {
      try {
        const response = await api.get('/auth/system-config');
        setSystemConfig(response.data);
        
        // 判断是否需要显示私有密钥步骤
        const needPrivateKey = response.data.privateKeyRequiredForRegister && response.data.hasPrivateKey;
        setShowPrivateKeyStep(needPrivateKey);
        
        // 如果不需要私有密钥，直接标记为已验证
        if (!needPrivateKey) {
          setPrivateKeyVerified(true);
        }
      } catch (error: any) {
        toast.error(t('auth.getSystemConfigFailed'));
      }
    };
    
    fetchSystemConfig();
  }, []);

  // 验证私有访问密钥
  const handleVerifyPrivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.privateKey) {
      toast.error(t('auth.enterPrivateKey'));
      return;
    }
    
    setVerifyingPrivateKey(true);
    
    try {
      await api.post('/auth/verify-private-key', {
        privateKey: formData.privateKey
      });
      
      setPrivateKeyVerified(true);
      toast.success(t('auth.verifySuccess'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || t('auth.verifyFailed');
      toast.error(errorMessage);
    } finally {
      setVerifyingPrivateKey(false);
    }
  };

  // 注册提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('auth.passwordsNotMatch') || '两次输入的密码不一致');
      return;
    }

    if (formData.password.length < 6) {
      toast.error(t('auth.passwordMinLength') || '密码长度至少为6位');
      return;
    }

    // 检查是否配置了服务器地址和 API Key，如果配置了，必须先验证通过
    const customApiUrl = getCustomApiUrl();
    const customApiKey = getCustomApiKey();
    if (customApiUrl && customApiKey && customApiKey.trim()) {
      // 如果配置了 API Key，必须在提交前验证
      try {
        let testBaseUrl = customApiUrl;
        if (!testBaseUrl.endsWith('/api') && !testBaseUrl.endsWith('/api/')) {
          testBaseUrl = `${testBaseUrl}/api`;
        }
        
        const verifyResponse = await fetch(`${testBaseUrl}/settings`, {
          method: 'GET',
          headers: {
            'X-API-Key': customApiKey.trim(),
          },
          signal: AbortSignal.timeout(3000),
        });

        if (verifyResponse.status === 403) {
          toast.error('API Key 验证失败，无法注册。请检查服务器配置。');
          return;
        }
      } catch (verifyError: any) {
        // 验证失败，阻止注册
        toast.error('API Key 验证失败，无法注册。请检查服务器配置。');
        return;
      }
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        username: formData.username,
        nickname: formData.nickname.trim() || undefined,
        email: formData.email,
        password: formData.password,
        privateKey: showPrivateKeyStep ? formData.privateKey : undefined,
      });
      
      // 检查是否是第一个用户（管理员）
      const isAdmin = response.data.user?.role === 'admin';
      
      login(response.data.token, response.data.user);
      
      if (isAdmin) {
        toast.success('🎉 注册成功！您是第一个用户，已自动成为管理员', {
          duration: 5000,
        });
      } else {
        toast.success('注册成功');
      }
      
      navigate('/');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || '注册失败';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 如果系统配置还未加载
  if (!systemConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // 如果系统已关闭注册功能
  if (!systemConfig.registrationEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="mx-auto h-16 w-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            注册已关闭
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            系统管理员已关闭注册功能，如需账号请联系管理员
          </p>
          <Link
            to="/login"
            className="inline-block btn btn-primary"
          >
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  // 第一步：验证私有访问密钥
  if (showPrivateKeyStep && !privateKeyVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 py-12 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8">
            <div className="text-center mb-8">
              <div className="mx-auto h-12 w-12 bg-blue-600 dark:bg-blue-500 flex items-center justify-center mb-4">
                <Key className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                私有访问验证
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                注册前需要验证私有访问密钥
              </p>
            </div>
            
            <form onSubmit={handleVerifyPrivateKey} className="space-y-6">
              <div>
                <label htmlFor="privateKey" className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  私有访问密钥
                </label>
                <PasswordInput
                  id="privateKey"
                  name="privateKey"
                  value={formData.privateKey}
                  onChange={(e) =>
                    setFormData({ ...formData, privateKey: e.target.value })
                  }
                  placeholder="请输入私有访问密钥"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  required
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  如果您不知道密钥，请联系管理员
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  返回登录
                </button>
                <button
                  type="submit"
                  disabled={verifyingPrivateKey}
                  className="flex-1 px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {verifyingPrivateKey ? '验证中...' : '验证密钥'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 第二步：注册表单
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            创建新账户
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            或{' '}
            <Link
              to="/login"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              登录现有账户
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="input"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                autoFocus={!showPrivateKeyStep}
                placeholder="只能包含字母、数字和下划线"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                用于登录，注册后无法修改
              </p>
            </div>
            
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                昵称 <span className="text-red-500">*</span>
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                required
                className="input"
                value={formData.nickname}
                onChange={(e) =>
                  setFormData({ ...formData, nickname: e.target.value })
                }
                placeholder="用于显示的昵称"
                maxLength={20}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                其他用户将看到的昵称
              </p>
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                邮箱 <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="input"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="your@email.com"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                密码
              </label>
              <PasswordInput
                id="password"
                name="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="input"
                required
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                密码长度至少为6位
              </p>
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                确认密码
              </label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                className="input"
                required
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </div>
          
          {/* 提示信息 */}
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p className="flex items-center justify-center gap-1">
              <span>👑</span>
              <span>第一个注册的用户将自动成为管理员</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
