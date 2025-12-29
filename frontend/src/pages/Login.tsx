/**
 * @file Login.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { RefreshCw, Lock, Key, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';

interface SystemConfig {
  registrationEnabled: boolean;
  privateKeyRequiredForLogin: boolean;
  privateKeyRequiredForRegister: boolean;
  hasPrivateKey: boolean;
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { t, i18n: i18nInstance } = useTranslation();
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [checkingLanguage, setCheckingLanguage] = useState(true);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');

  // 初始化语言设置（默认英文）
  useEffect(() => {
    const savedLanguage = localStorage.getItem('app-language');
    if (!savedLanguage || (savedLanguage !== 'zh' && savedLanguage !== 'en')) {
      // 如果没有保存的语言，默认设置为英文并保存
      const defaultLanguage = 'en';
      localStorage.setItem('app-language', defaultLanguage);
      i18nInstance.changeLanguage(defaultLanguage);
      setCurrentLanguage(defaultLanguage);
    } else {
      // 使用保存的语言
      i18nInstance.changeLanguage(savedLanguage);
      setCurrentLanguage(savedLanguage);
    }
    setCheckingLanguage(false);
  }, [i18nInstance]);

  // 处理语言切换
  const handleLanguageChange = (lang: string) => {
    localStorage.setItem('app-language', lang);
    i18nInstance.changeLanguage(lang);
    setCurrentLanguage(lang);
  };
  const [showPrivateKeyStep, setShowPrivateKeyStep] = useState(false);
  const [privateKeyVerified, setPrivateKeyVerified] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    privateKey: '',
    captcha: '',
  });
  const [captchaSessionId, setCaptchaSessionId] = useState<string>('');
  const [captchaImage, setCaptchaImage] = useState<string>('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [verifyingPrivateKey, setVerifyingPrivateKey] = useState(false);
  const captchaRef = useRef<HTMLImageElement>(null);

  // 获取系统配置
  useEffect(() => {
    const fetchSystemConfig = async () => {
      try {
        const response = await api.get('/auth/system-config');
        setSystemConfig(response.data);
        
        // 判断是否需要显示私有密钥步骤
        const needPrivateKey = response.data.privateKeyRequiredForLogin && response.data.hasPrivateKey;
        setShowPrivateKeyStep(needPrivateKey);
        
        // 如果不需要私有密钥，直接标记为已验证
        if (!needPrivateKey) {
          setPrivateKeyVerified(true);
        }
      } catch (error: any) {
        console.error('获取系统配置失败:', error);
        toast.error(t('auth.getSystemConfigFailed'));
      }
    };
    
    fetchSystemConfig();
  }, []);

  // 从localStorage加载保存的账号信息
  useEffect(() => {
    const savedUsername = localStorage.getItem('saved_username');
    const savedPassword = localStorage.getItem('saved_password');
    const savedRememberMe = localStorage.getItem('remember_me') === 'true';
    
    if (savedUsername && savedRememberMe) {
      setFormData(prev => ({
        ...prev,
        username: savedUsername,
        password: savedPassword || '',
      }));
      setRememberMe(savedRememberMe);
    }
  }, []);

  // 加载验证码
  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    try {
      const response = await fetch(`/api/auth/captcha?sessionId=${captchaSessionId || ''}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      
      const sessionId = response.headers.get('x-captcha-session-id');
      if (sessionId) {
        setCaptchaSessionId(sessionId);
      }
      
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      setCaptchaImage(imageUrl);
    } catch (error: any) {
      console.error('加载验证码失败:', error);
      toast.error(t('auth.loadCaptchaFailed'));
    } finally {
      setLoadingCaptcha(false);
    }
  };

  // 验证私有密钥后加载验证码
  useEffect(() => {
    if (privateKeyVerified) {
      loadCaptcha();
    }
  }, [privateKeyVerified]);

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

  // 登录提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        username: formData.username,
        password: formData.password,
        privateKey: showPrivateKeyStep ? formData.privateKey : undefined,
        captcha: formData.captcha,
        captchaSessionId,
        rememberMe,
      });

      // 如果选择记住我，保存账号信息
      if (rememberMe) {
        localStorage.setItem('saved_username', formData.username);
        localStorage.setItem('saved_password', formData.password);
        localStorage.setItem('remember_me', 'true');
      } else {
        // 清除保存的信息
        localStorage.removeItem('saved_username');
        localStorage.removeItem('saved_password');
        localStorage.removeItem('remember_me');
      }

      login(response.data.token, response.data.user);
      
      // 同步语言设置到后端 system_language
      try {
        const currentLang = localStorage.getItem('app-language') || 'en';
        const systemLanguage = currentLang === 'zh' ? 'zh-CN' : 'en';
        await api.put('/settings/system_language', { value: systemLanguage });
        
        // 同时保存用户语言偏好
        await api.put('/users/me/language', { language: currentLang });
      } catch (error) {
        // 静默失败，不影响登录流程
        console.error('同步语言设置失败:', error);
      }
      
      toast.success(t('auth.loginSuccess'));
      navigate('/');
    } catch (error: any) {
      console.error('登录错误详情:', error);
      
      // 如果验证码错误，重新加载验证码
      if (error.response?.data?.error === '验证码错误' || error.response?.data?.error === 'Captcha error') {
        loadCaptcha();
        setFormData(prev => ({ ...prev, captcha: '' }));
      }
      
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || t('auth.loginFailed');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 如果正在检查语言或系统配置还未加载
  if (checkingLanguage || !systemConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // 第一步：验证私有访问密钥
  if (showPrivateKeyStep && !privateKeyVerified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-md w-full space-y-8 flex-1 flex flex-col justify-center">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <Key className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {t('auth.privateKeyVerification')}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t('auth.privateKeyRequired')}
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleVerifyPrivateKey}>
            <div>
              <label htmlFor="privateKey" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('auth.privateKey')}
              </label>
              <input
                id="privateKey"
                name="privateKey"
                type="password"
                required
                className="input"
                placeholder={t('auth.enterPrivateKey')}
                value={formData.privateKey}
                onChange={(e) =>
                  setFormData({ ...formData, privateKey: e.target.value })
                }
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {t('auth.contactAdmin')}
              </p>
            </div>

            <button
              type="submit"
              disabled={verifyingPrivateKey}
              className="w-full btn btn-primary"
            >
              {verifyingPrivateKey ? t('auth.verifying') : t('auth.verifyPrivateKey')}
            </button>
          </form>

          {/* 语言选择器 - 扁平化设计 */}
          <div className="flex justify-center items-center gap-2 pt-6 mt-8 border-t border-gray-200 dark:border-gray-700">
            <Globe className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => handleLanguageChange('en')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  currentLanguage === 'en'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                🇬🇧 English
              </button>
              <button
                onClick={() => handleLanguageChange('zh')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  currentLanguage === 'zh'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                🇨🇳 中文
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 第二步：正常登录
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8 flex-1 flex flex-col justify-center">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {t('auth.loginToAccount')}
          </h2>
          {systemConfig.registrationEnabled && (
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              {t('common.or')}{' '}
              <Link
                to="/register"
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                {t('auth.registerNewAccount')}
              </Link>
            </p>
          )}
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* 用户名 */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('auth.username')}
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
              />
            </div>

            {/* 密码 */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('auth.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>

            {/* 验证码 */}
            <div>
              <label htmlFor="captcha" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('auth.captcha')}
              </label>
              <div className="flex gap-2">
                <input
                  id="captcha"
                  name="captcha"
                  type="text"
                  required
                  className="input flex-1"
                  placeholder={t('auth.enterCaptcha')}
                  value={formData.captcha}
                  onChange={(e) =>
                    setFormData({ ...formData, captcha: e.target.value })
                  }
                  maxLength={4}
                />
                <div className="relative">
                  {captchaImage ? (
                    <img
                      ref={captchaRef}
                      src={captchaImage}
                      alt={t('auth.captcha')}
                      className="h-10 w-24 border border-gray-300 dark:border-gray-700 rounded cursor-pointer"
                      onClick={loadCaptcha}
                      title={t('auth.clickToRefresh')}
                    />
                  ) : (
                    <div className="h-10 w-24 border border-gray-300 dark:border-gray-700 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                      {loadingCaptcha ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="text-xs text-gray-500">{t('common.loading')}</span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    disabled={loadingCaptcha}
                    className="absolute -top-1 -right-1 p-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
                    title={t('auth.refreshCaptcha')}
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingCaptcha ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* 记住我 */}
            <div className="flex items-center">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                {t('auth.rememberMe')}
              </label>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || loadingCaptcha}
              className="w-full btn btn-primary"
            >
              {loading ? t('common.loading') : t('auth.login')}
            </button>
          </div>
        </form>

        {/* 语言选择器 - 扁平化设计 */}
        <div className="flex justify-center items-center gap-2 pt-6 mt-8 border-t border-gray-200 dark:border-gray-700">
          <Globe className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                currentLanguage === 'en'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              🇬🇧 English
            </button>
            <button
              onClick={() => handleLanguageChange('zh')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                currentLanguage === 'zh'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              🇨🇳 简体中文
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
