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
import { RefreshCw, Lock, Key } from 'lucide-react';

interface SystemConfig {
  registrationEnabled: boolean;
  privateKeyRequiredForLogin: boolean;
  privateKeyRequiredForRegister: boolean;
  hasPrivateKey: boolean;
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
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
        toast.error('获取系统配置失败');
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
      toast.error('加载验证码失败，请刷新页面重试');
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
      toast.error('请输入私有访问密钥');
      return;
    }
    
    setVerifyingPrivateKey(true);
    
    try {
      await api.post('/auth/verify-private-key', {
        privateKey: formData.privateKey
      });
      
      setPrivateKeyVerified(true);
      toast.success('密钥验证成功');
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || '密钥验证失败';
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
      toast.success('登录成功');
      navigate('/');
    } catch (error: any) {
      console.error('登录错误详情:', error);
      
      // 如果验证码错误，重新加载验证码
      if (error.response?.data?.error === '验证码错误') {
        loadCaptcha();
        setFormData(prev => ({ ...prev, captcha: '' }));
      }
      
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || '登录失败';
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
          <p className="mt-2 text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  // 第一步：验证私有访问密钥
  if (showPrivateKeyStep && !privateKeyVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <Key className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
              私有访问验证
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              此站点需要私有访问密钥才能登录
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleVerifyPrivateKey}>
            <div>
              <label htmlFor="privateKey" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                私有访问密钥
              </label>
              <input
                id="privateKey"
                name="privateKey"
                type="password"
                required
                className="input"
                placeholder="请输入私有访问密钥"
                value={formData.privateKey}
                onChange={(e) =>
                  setFormData({ ...formData, privateKey: e.target.value })
                }
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                如果您不知道密钥，请联系管理员
              </p>
            </div>

            <button
              type="submit"
              disabled={verifyingPrivateKey}
              className="w-full btn btn-primary"
            >
              {verifyingPrivateKey ? '验证中...' : '验证密钥'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 第二步：正常登录
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            登录到您的账户
          </h2>
          {systemConfig.registrationEnabled && (
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              或{' '}
              <Link
                to="/register"
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                注册新账户
              </Link>
            </p>
          )}
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* 用户名 */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                用户名或邮箱
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
                密码
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
                验证码
              </label>
              <div className="flex gap-2">
                <input
                  id="captcha"
                  name="captcha"
                  type="text"
                  required
                  className="input flex-1"
                  placeholder="请输入验证码"
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
                      alt="验证码"
                      className="h-10 w-24 border border-gray-300 dark:border-gray-700 rounded cursor-pointer"
                      onClick={loadCaptcha}
                      title="点击刷新验证码"
                    />
                  ) : (
                    <div className="h-10 w-24 border border-gray-300 dark:border-gray-700 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                      {loadingCaptcha ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <span className="text-xs text-gray-500">加载中</span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    disabled={loadingCaptcha}
                    className="absolute -top-1 -right-1 p-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
                    title="刷新验证码"
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
                记住账号和密码
              </label>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || loadingCaptcha}
              className="w-full btn btn-primary"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
