/**
 * @file Login.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api, { setCustomApiUrl, getCustomApiUrl, setCustomApiKey, getCustomApiKey, getCurrentApiUrl, getFullApiUrl, getActualApiUrl } from '../utils/api';
import { offlineDataCache } from '../utils/offlineDataCache';
import toast from 'react-hot-toast';
import { RefreshCw, Lock, Key, Globe, Settings, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';
import PasswordInput from '../components/PasswordInput';
import { syncTimezoneFromBackend } from '../utils/timezone';

interface SystemConfig {
  registrationEnabled: boolean;
  privateKeyRequiredForLogin: boolean;
  privateKeyRequiredForRegister: boolean;
  hasPrivateKey: boolean;
  enableApiServerConfigInLogin: boolean;
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { t, i18n: i18nInstance } = useTranslation();
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [checkingLanguage, setCheckingLanguage] = useState(true);
  const [currentLanguage, setCurrentLanguage] = useState<string>('zh');

  // 初始化语言设置（默认中文）
  useEffect(() => {
    const savedLanguage = localStorage.getItem('app-language');
    if (!savedLanguage || (savedLanguage !== 'zh' && savedLanguage !== 'en')) {
      // 如果没有保存的语言，默认设置为中文并保存
      const defaultLanguage = 'zh';
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
  const lastCaptchaLoadTimeRef = useRef<number>(0);
  const captchaLoadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverConfig, setServerConfig] = useState({
    apiUrl: '',
    apiKey: '',
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [apiKeyValidated, setApiKeyValidated] = useState(false); // API Key 是否已验证通过
  const captchaRef = useRef<HTMLImageElement>(null);
  const configInitializedRef = useRef(false); // 标记配置是否已从 localStorage 初始化

  // 获取系统配置
  useEffect(() => {
    const fetchSystemConfig = async () => {
      try {
        // 确保使用正确的API URL和API Key
        const customApiUrl = getCustomApiUrl();
        const customApiKey = getCustomApiKey();
        
        // 如果配置了自定义API URL，确保API Key已设置
        if (customApiUrl && customApiKey && customApiKey.trim()) {
          // 确保API Key已应用到请求中
          console.log('[登录] 使用自定义API配置:', {
            url: customApiUrl,
            hasApiKey: !!customApiKey
          });
        }
        
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
        const errorMsg = error.response?.data?.error || error.message || '';
        console.error('[登录] 获取系统配置失败:', {
          error: errorMsg,
          status: error.response?.status,
          customApiUrl: getCustomApiUrl(),
          hasApiKey: !!getCustomApiKey()
        });
        
        // 如果是API Key相关错误，给出更明确的提示
        if (error.response?.status === 403 || errorMsg.includes('API Key')) {
          toast.error(t('auth.apiKeyError') || 'API Key 错误，请检查配置');
        } else if (error.response?.status === 401) {
          // 401可能是API Key缺失，但登录接口不需要API Key，所以这里可能是其他问题
          toast.error(t('auth.getSystemConfigFailed'));
        } else {
          toast.error(t('auth.getSystemConfigFailed'));
        }
      }
    };
    
    fetchSystemConfig();
  }, []);

  // 从localStorage加载保存的账号信息和服务器配置
  useEffect(() => {
    const savedUsername = localStorage.getItem('saved_username');
    // 安全修复：不再从localStorage读取密码，避免安全风险
    // const savedPassword = localStorage.getItem('saved_password');
    const savedRememberMe = localStorage.getItem('remember_me') === 'true';
    
    if (savedUsername && savedRememberMe) {
      setFormData(prev => ({
        ...prev,
        username: savedUsername,
        // 安全修复：不再自动填充密码，用户需要手动输入
        password: '',
      }));
      setRememberMe(savedRememberMe);
    }

    // 加载服务器配置
    const savedApiUrl = getCustomApiUrl();
    const savedApiKey = getCustomApiKey();
    setServerConfig({
      apiUrl: savedApiUrl || '',
      apiKey: savedApiKey || '',
    });
    
    // 如果已经有保存的配置，默认认为已验证（用户之前已经测试过了）
    // 如果需要，用户可以重新测试
    if (savedApiUrl && savedApiKey && savedApiKey.trim()) {
      setApiKeyValidated(true); // 假设已保存的配置是有效的
    } else {
      setApiKeyValidated(true); // 没有 API Key 时认为验证通过
    }
    
    // 标记配置已初始化
    configInitializedRef.current = true;
  }, []);

  // 当 API Key 改变时，重置验证状态（仅在用户手动修改时）
  useEffect(() => {
    // 如果配置还未初始化，不执行重置逻辑（避免初始化时重置）
    if (!configInitializedRef.current) {
      return;
    }
    
    // 如果用户修改了 API Key，重置验证状态
    if (serverConfig.apiKey && serverConfig.apiKey.trim()) {
      // 只有在状态不是 success 时才重置（避免测试后重置）
      if (connectionStatus === 'idle') {
        setApiKeyValidated(false);
      }
    } else {
      // 没有 API Key 时认为验证通过
      setApiKeyValidated(true);
    }
  }, [serverConfig.apiKey, connectionStatus]);

  // 加载验证码
  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    try {
      // 使用 fetch 直接获取 SVG，因为 api 工具可能无法正确处理 SVG 响应
      // 使用 getFullApiUrl() 获取正确的验证码 URL（支持自定义配置）
      // 构建参数
      const urlParams = new URLSearchParams();
      urlParams.set('format', 'json'); // 始终请求 JSON 格式
      if (captchaSessionId) {
        urlParams.set('sessionId', captchaSessionId);
      }
      
      // 使用统一的 API URL 配置函数
      const captchaUrl = getFullApiUrl(`/auth/captcha?${urlParams.toString()}`);
      
      // 构建请求头，如果需要 API Key
      // 注意：不添加 Cache-Control 头，避免 CORS 预检问题
      // 验证码本身已经通过 URL 参数和响应头设置了 no-cache
      const headers: HeadersInit = {
        'Accept': 'application/json', // 请求 JSON 格式，避免 CORS 响应头问题
      };
      
      const apiKey = getCustomApiKey();
      if (apiKey && apiKey.trim()) {
        headers['X-API-Key'] = apiKey.trim();
      }
      
      const response = await fetch(captchaUrl, {
        method: 'GET',
        headers,
        cache: 'no-store', // 确保不缓存
        // 确保 CORS 请求正确发送
        mode: 'cors',
        credentials: 'omit', // 对于跨域请求，通常不需要 credentials
      });
      
      if (!response.ok) {
        // 处理 429 错误
        if (response.status === 429) {
          throw new Error('429 Too Many Requests');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // 尝试解析为 JSON（新格式）
      let sessionId: string | null = null;
      let svgText: string = '';
      let imageUrl: string = '';
      
      const contentType = response.headers.get('content-type') || '';
      
      // 先读取响应内容（不区分格式）
      const responseText = await response.text();
      
      if (contentType.includes('application/json')) {
        // JSON 格式响应
        try {
          const data = JSON.parse(responseText);
          sessionId = data.sessionId || null;
          svgText = data.svg || '';
          
          if (data.svgDataUrl) {
            // 如果提供了 data URL，直接使用
            imageUrl = data.svgDataUrl;
          } else if (data.svg) {
            // 如果有 SVG 文本，转换为 data URL
            const svgBlob = new Blob([data.svg], { type: 'image/svg+xml' });
            imageUrl = URL.createObjectURL(svgBlob);
          }
          
          if (sessionId) {
            setCaptchaSessionId(sessionId);
          }
        } catch (jsonError) {
          // 如果 JSON 解析失败，尝试作为 SVG 处理
          svgText = responseText;
          const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
          imageUrl = URL.createObjectURL(svgBlob);
        }
      } else {
        // SVG 格式响应（旧格式或后端未识别 JSON 请求）
        svgText = responseText;
        
        // 尝试从响应头获取 sessionId
        sessionId = response.headers.get('x-captcha-session-id') || 
                   response.headers.get('X-Captcha-Session-Id') ||
                   response.headers.get('X-CAPTCHA-SESSION-ID');
        
        if (sessionId) {
          setCaptchaSessionId(sessionId);
        } else {
          // 尝试从 URL 参数中获取（如果有）
          const urlParams = new URLSearchParams(captchaUrl.split('?')[1]);
          const urlSessionId = urlParams.get('sessionId');
          if (urlSessionId) {
            setCaptchaSessionId(urlSessionId);
          }
        }
        
        // 将 SVG 转换为 data URL
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
        imageUrl = URL.createObjectURL(svgBlob);
      }
      
      // 如果仍然没有 sessionId，尝试从验证码 URL 中提取（作为最后的备用方案）
      if (!sessionId) {
        const urlObj = new URL(captchaUrl);
        const urlSessionId = urlObj.searchParams.get('sessionId');
        if (urlSessionId) {
          setCaptchaSessionId(urlSessionId);
          sessionId = urlSessionId;
        }
      }
      
      // 清理旧的 URL（如果有）
      if (captchaImage) {
        URL.revokeObjectURL(captchaImage);
      }
      
      if (imageUrl) {
        setCaptchaImage(imageUrl);
      } else {
        toast.error(t('auth.loadCaptchaFailed'));
      }
      } catch (error: any) {
        // 处理 429 错误（Too Many Requests）
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
          // 429 错误时，延迟更长时间后重试
          const retryDelay = 5000; // 5秒
          setTimeout(() => {
            loadCaptcha();
          }, retryDelay);
          // 不显示错误提示，避免刷屏
          return;
        }
        
        // 网络错误时静默处理，不显示错误提示
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID') {
          // 只有在非429错误时才显示错误提示
          if (!error.message?.includes('429')) {
            toast.error(t('auth.loadCaptchaFailed'));
          }
        }
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

  // 系统配置加载完成后，如果不需要私有密钥验证，自动加载验证码
  useEffect(() => {
    if (systemConfig && !showPrivateKeyStep && privateKeyVerified) {
      // 延迟一点加载，确保页面已经渲染
      const timer = setTimeout(() => {
        loadCaptcha();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [systemConfig, showPrivateKeyStep, privateKeyVerified]);

  // 测试服务器连接
  const handleTestConnection = async () => {
    // 如果未输入服务器地址，使用默认本地服务器
    if (!serverConfig.apiUrl || !serverConfig.apiUrl.trim()) {
      // 使用默认本地服务器，无需测试
      toast.success(t('auth.willUseLocalServer'));
      return;
    }

    const url = serverConfig.apiUrl.trim().replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error(t('auth.serverAddressMustStartWithHttp'));
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      // 构建测试 URL：如果 URL 已经包含 /api，直接使用；否则添加 /api
      let testBaseUrl = url;
      if (!testBaseUrl.endsWith('/api') && !testBaseUrl.endsWith('/api/')) {
        testBaseUrl = `${testBaseUrl}/api`;
      }
      
      // 准备测试请求头
      const testHeaders: any = {
        'Content-Type': 'application/json',
      };
      
      if (serverConfig.apiKey && serverConfig.apiKey.trim()) {
        testHeaders['X-API-Key'] = serverConfig.apiKey.trim();
      }

      // 第一步：测试基本连接（使用公开接口）
      try {
        const publicResponse = await fetch(`${testBaseUrl}/settings/public`, {
          method: 'GET',
          headers: testHeaders,
          signal: AbortSignal.timeout(5000),
        });

        if (!publicResponse.ok) {
          if (publicResponse.status === 401 || publicResponse.status === 403) {
            // 可能是 API Key 错误，继续到第二步验证
          } else if (publicResponse.status === 404) {
            throw new Error('服务器地址无效，找不到该接口');
          } else {
            throw new Error(`HTTP ${publicResponse.status}: ${publicResponse.statusText}`);
          }
        }
      } catch (networkError: any) {
        // 如果公开接口都访问不了，说明服务器地址有问题
        if (networkError.name === 'AbortError' || networkError.name === 'TimeoutError') {
          throw new Error('NETWORK_TIMEOUT');
        }
        if (networkError.message.includes('Failed to fetch') || networkError.message.includes('NetworkError')) {
          throw new Error('NETWORK_ERROR');
        }
        throw networkError;
      }

      // 第二步：如果输入了 API Key，验证 API Key 是否正确
      if (serverConfig.apiKey && serverConfig.apiKey.trim()) {
        try {
          // 使用需要 API Key 验证的接口测试（/settings 接口需要验证但不一定需要登录）
          const authResponse = await fetch(`${testBaseUrl}/settings`, {
            method: 'GET',
            headers: testHeaders,
            signal: AbortSignal.timeout(5000),
          });

          if (authResponse.status === 403) {
            // 403 表示 API Key 错误
            const errorData = await authResponse.json().catch(() => ({}));
            const errorMsg = errorData.error || errorData.message || '';
            if (errorMsg.includes('API Key') || errorMsg.includes('缺少') || errorMsg.includes('错误')) {
              setConnectionStatus('error');
              setApiKeyValidated(false); // 标记 API Key 验证失败
              toast.error(t('auth.connectionSuccessButApiKeyIncorrect'));
              return;
            }
            // 其他 403 错误也视为 API Key 错误
            setConnectionStatus('error');
            setApiKeyValidated(false); // 标记 API Key 验证失败
            toast.error(t('auth.connectionSuccessButApiKeyIncorrect'));
            return;
          }

          if (authResponse.status === 401) {
            // 401 表示 API Key 正确但需要登录（这是正常的）
            setConnectionStatus('success');
            setApiKeyValidated(true); // 标记 API Key 已验证通过
            toast.success(t('auth.connectionSuccessRequiresLogin'));
          } else if (authResponse.ok) {
            // 200 表示完全成功
            setConnectionStatus('success');
            setApiKeyValidated(true); // 标记 API Key 已验证通过
            toast.success(t('auth.connectionSuccess'));
          } else {
            // 其他状态码视为错误
            throw new Error(`HTTP ${authResponse.status}: ${authResponse.statusText}`);
          }
        } catch (keyError: any) {
          if (keyError.name === 'AbortError' || keyError.name === 'TimeoutError') {
            throw new Error('NETWORK_TIMEOUT');
          }
          // 如果返回 403，已经在上面处理了
          // 其他错误可能是网络问题
          throw keyError;
        }
      } else {
        // 没有输入 API Key，只测试服务器地址
        setConnectionStatus('success');
        setApiKeyValidated(true); // 没有 API Key 时认为验证通过（使用默认或不需要）
        toast.success(t('auth.connectionSuccessServerAddressValid'));
      }
    } catch (error: any) {
      setConnectionStatus('error');
      if (error.message === 'NETWORK_TIMEOUT' || error.name === 'AbortError' || error.name === 'TimeoutError') {
        toast.error(t('auth.connectionTimeout'));
      } else if (error.message === 'NETWORK_ERROR' || error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        toast.error(t('auth.cannotConnectToServer'));
      } else if (error.message?.includes('HTTP 403')) {
        // 403 错误已经在上面处理了，这里不应该出现
        toast.error(t('auth.connectionSuccessButApiKeyIncorrect'));
      } else {
        toast.error(t('auth.connectionFailed', { error: error.message || t('common.unknownError') }));
      }
    } finally {
      setTestingConnection(false);
    }
  };

  // 保存服务器配置
  const handleSaveServerConfig = async () => {
    try {
      const oldUrl = getCustomApiUrl();
      
      if (serverConfig.apiUrl && serverConfig.apiUrl.trim()) {
        const url = serverConfig.apiUrl.trim().replace(/\/+$/, '');
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          toast.error(t('auth.serverAddressMustStartWithHttp'));
          return;
        }
        
        // 如果配置了 API Key，必须先测试通过才能保存
        if (serverConfig.apiKey && serverConfig.apiKey.trim()) {
          // 如果 API Key 测试失败，不允许保存
          if (connectionStatus === 'error' || !apiKeyValidated) {
            toast.error(t('auth.apiKeyValidationFailed'));
            return;
          }
        }
        
        setCustomApiUrl(url);
        
        // 如果服务器地址改变了，清除旧的缓存数据
        if (oldUrl && oldUrl !== url) {
          try {
            await offlineDataCache.clearAll();
          } catch (e) {
            // 静默处理清除缓存失败
          }
        }
      } else {
        setCustomApiUrl(null);
        
        // 如果从自定义地址恢复到默认，也清除缓存
        if (oldUrl) {
          try {
            await offlineDataCache.clearAll();
          } catch (e) {
            // 静默处理清除缓存失败
          }
        }
      }

      if (serverConfig.apiKey && serverConfig.apiKey.trim()) {
        setCustomApiKey(serverConfig.apiKey.trim());
      } else {
        setCustomApiKey(null);
        setApiKeyValidated(true); // 没有 API Key 时认为验证通过
      }

      toast.success(t('auth.serverConfigSaved'));
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      toast.error(t('auth.saveFailed', { error: error.message }));
    }
  };

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
    
    // 检查是否配置了服务器地址和 API Key，如果配置了，必须先测试通过
    // 注意：如果没有配置自定义地址，使用默认的本地服务器（相对路径 /api），无需API Key
    const customApiUrl = getCustomApiUrl();
    const customApiKey = getCustomApiKey();
    // 只有当配置了自定义服务器地址且需要API Key时，才进行验证
    if (customApiUrl && customApiKey && customApiKey.trim()) {
      // 如果配置了 API Key，必须已经测试通过
      if (!apiKeyValidated || connectionStatus === 'error') {
        toast.error(t('auth.pleaseTestConnectionFirst'));
        return;
      }
    }
    
    setLoading(true);

    try {
      // 检查验证码和 sessionId
      if (!formData.captcha || !formData.captcha.trim()) {
        toast.error(t('auth.enterCaptcha'));
        setLoading(false);
        return;
      }
      
      if (!captchaSessionId || !captchaSessionId.trim()) {
        toast.error(t('auth.captchaSessionIdMissing'));
        loadCaptcha(); // 重新加载验证码
        setLoading(false);
        return;
      }
      
      // 构建登录请求数据
      const loginData: any = {
        username: formData.username,
        password: formData.password,
        captcha: formData.captcha.trim(), // 确保去除空格
        captchaSessionId: captchaSessionId.trim(), // 确保去除空格
        rememberMe,
      };
      
      // 只有在需要私有密钥时才添加
      if (showPrivateKeyStep && formData.privateKey) {
        loginData.privateKey = formData.privateKey;
      }
      
      // 确保API Key已正确设置（登录接口不需要API Key，但其他接口可能需要）
      const currentApiUrl = getCustomApiUrl();
      const currentApiKey = getCustomApiKey();
      // 安全修复：注释掉可能泄露敏感信息的console输出
      // if (currentApiUrl && currentApiKey && currentApiKey.trim()) {
      //   console.log('[登录] 登录请求，使用自定义API配置:', {
      //     url: currentApiUrl,
      //     hasApiKey: !!currentApiKey
      //   });
      // }
      
      const response = await api.post('/auth/login', loginData);

      // 如果选择记住我，只保存用户名（不保存密码，避免安全风险）
      if (rememberMe) {
        localStorage.setItem('saved_username', formData.username);
        localStorage.setItem('remember_me', 'true');
        // 安全提示：不保存密码，用户需要每次手动输入
      } else {
        // 清除保存的信息
        localStorage.removeItem('saved_username');
        localStorage.removeItem('remember_me');
        // 确保清除可能存在的旧密码（向后兼容）
        localStorage.removeItem('saved_password');
      }

      // 再次验证：如果配置了 API Key，确保它是有效的（使用上面已声明的变量）
      if (currentApiUrl && currentApiKey && currentApiKey.trim()) {
        // 最后一次验证 API Key
        try {
          let testBaseUrl = currentApiUrl;
          if (!testBaseUrl.endsWith('/api') && !testBaseUrl.endsWith('/api/')) {
            testBaseUrl = `${testBaseUrl}/api`;
          }
          
          const verifyResponse = await fetch(`${testBaseUrl}/settings`, {
            method: 'GET',
            headers: {
              'X-API-Key': currentApiKey.trim(),
            },
            signal: AbortSignal.timeout(3000),
          });

          if (verifyResponse.status === 403) {
            toast.error(t('auth.apiKeyVerificationFailedCannotLogin'));
            setLoading(false);
            return;
          }
        } catch (verifyError: any) {
          // 验证失败，阻止登录
          toast.error(t('auth.apiKeyVerificationFailedCannotLogin'));
          setLoading(false);
          return;
        }
      }

      login(response.data.token, response.data.user);

      // 登录成功后清除旧缓存，确保数据安全
      try {
        await offlineDataCache.clearAll();
      } catch (e) {
        // 静默处理清除缓存失败
      }

      // 登录成功后，自动获取系统 API Key 并应用，同时同步时区设置（供对话等页面时间展示）
      try {
        const settingsResponse = await api.get('/settings');
        const settings = settingsResponse?.data?.settings || {};
        const systemApiKey = settings?.api_key?.value;
        if (systemApiKey && systemApiKey.trim()) {
          const currentApiKey = getCustomApiKey();
          if (!currentApiKey || currentApiKey.trim() === '') {
            setCustomApiKey(systemApiKey.trim());
          }
        }
        if (settings?.system_timezone_offset?.value != null) {
          const o = parseInt(String(settings.system_timezone_offset.value), 10);
          if (!isNaN(o) && o >= -12 && o <= 14) syncTimezoneFromBackend(o);
        }
      } catch (error) {
        // 静默失败，不影响登录流程
      }
      
      // 同步语言设置到后端 system_language
      try {
        const currentLang = localStorage.getItem('app-language') || 'en';
        const systemLanguage = currentLang === 'zh' ? 'zh-CN' : 'en';
        await api.put('/settings/system_language', { value: systemLanguage }, {
          timeout: 120000, // 120秒超时，匹配后端设置
        });
        
        // 同时保存用户语言偏好
        await api.put('/users/me/language', { language: currentLang }, {
          timeout: 120000, // 120秒超时，匹配后端设置
        });
      } catch (error) {
        // 静默失败，不影响登录流程
      }
      
      toast.success(t('auth.loginSuccess'));
      navigate('/');
    } catch (error: any) {
      // 获取错误信息
      const errorData = error.response?.data || {};
      const errorText = errorData.error || errorData.message || error.message || '';
      
      // 如果验证码相关错误，重新加载验证码
      if (errorText.includes('验证码') || errorText.includes('captcha') || errorText.includes('Captcha')) {
        loadCaptcha();
        setFormData(prev => ({ ...prev, captcha: '' }));
        // 如果是因为缺少 sessionId，也清空它以便重新获取
        if (errorText.includes('请提供验证码') || errorText.includes('验证码会话')) {
          setCaptchaSessionId('');
        }
      }
      
      // 显示详细的错误信息
      let finalErrorMessage: string;
      
      // 检查是否是API Key相关错误
      if (error.response?.status === 403 || errorText.includes('API Key') || errorText.includes('API Key')) {
        const customApiUrl = getCustomApiUrl();
        const customApiKey = getCustomApiKey();
        if (customApiUrl && (!customApiKey || !customApiKey.trim())) {
          finalErrorMessage = t('auth.apiKeyMissing') || 'API Key 未设置，请先配置 API Key';
        } else if (customApiUrl && customApiKey) {
          finalErrorMessage = t('auth.apiKeyIncorrect') || 'API Key 错误，请检查配置是否正确';
        } else {
          finalErrorMessage = errorText || t('auth.loginFailed');
        }
      } else if (error.response?.status === 400) {
        // 400错误：输入验证失败，显示详细错误
        if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          const errorMessages = errorData.errors.map((err: any) => {
            const field = err.param || err.path || '';
            const msg = err.msg || err.message || '';
            return field ? `${field}: ${msg}` : msg;
          }).filter((msg: string) => msg);
          
          if (errorMessages.length > 0) {
            finalErrorMessage = errorMessages.join('; ');
          } else {
            finalErrorMessage = errorData.error || '输入验证失败';
          }
        } else if (errorData.error) {
          finalErrorMessage = errorData.error;
        } else if (errorData.message) {
          finalErrorMessage = errorData.message;
        } else {
          finalErrorMessage = `请求参数错误 (400): ${JSON.stringify(errorData)}`;
        }
      } else if (error.response?.status === 500) {
        // 500错误：服务器内部错误，显示详细错误信息
        if (errorData.error) {
          finalErrorMessage = errorData.error;
          // 如果有提示信息，也显示
          if (errorData.message && errorData.message !== errorData.error) {
            finalErrorMessage += `: ${errorData.message}`;
          }
          if (errorData.hint) {
            finalErrorMessage += ` (${errorData.hint})`;
          }
        } else if (errorData.message) {
          finalErrorMessage = errorData.message;
        } else {
          finalErrorMessage = `服务器内部错误 (500): ${errorText || '未知错误'}`;
        }
      } else {
        finalErrorMessage = errorText || t('auth.loginFailed');
      }
      
      // 根据错误类型显示不同的提示
      if (error.response?.status === 429) {
        // 429错误：请求过于频繁
        toast.error(finalErrorMessage || '请求过于频繁，请稍后再试', {
          duration: 5000, // 显示5秒
          icon: '⏱️',
        });
      } else if (error.response?.status === 400) {
        // 400错误：输入验证失败，显示详细错误
        toast.error(finalErrorMessage || '输入验证失败', {
          duration: 4000, // 显示4秒，让用户有时间阅读
        });
      } else {
        // 其他错误
        toast.error(finalErrorMessage || t('auth.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  // 如果正在检查语言或系统配置还未加载
  if (checkingLanguage || !systemConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 dark:text-blue-500" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // 第一步：验证私有访问密钥
  if (showPrivateKeyStep && !privateKeyVerified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-950 py-12 px-4">
        <div className="max-w-md w-full flex-1 flex flex-col justify-center">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8">
            <div className="text-center mb-8">
              <div className="mx-auto h-12 w-12 bg-blue-600 dark:bg-blue-500 flex items-center justify-center mb-4">
                <Key className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('auth.privateKeyVerification')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('auth.privateKeyRequired')}
              </p>
            </div>
            
            {/* 服务器配置区域 - 根据系统设置和构建时配置决定是否显示 */}
            {systemConfig?.enableApiServerConfigInLogin && !import.meta.env.VITE_HIDE_API_SERVER_CONFIG && (
            <div className="mb-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowServerConfig(!showServerConfig)}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('auth.serverConfig')} {getCustomApiUrl() && `(${t('auth.configured')})`}
                  </span>
                </div>
                {showServerConfig ? (
                  <ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                )}
              </button>

              {showServerConfig && (
                <div className="p-3 space-y-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                    {t('auth.serverAddress')} <span className="text-gray-400 text-xs">({t('auth.optional')})</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                    value={serverConfig.apiUrl}
                    onChange={(e) => setServerConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                    placeholder={t('auth.serverAddressPlaceholder')}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveServerConfig();
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('auth.current')}: <code className="bg-white dark:bg-gray-900 px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 text-xs">{getCurrentApiUrl()}</code>
                    {!getCustomApiUrl() && (
                      <span className="ml-2 text-green-600 dark:text-green-400">✓ {t('auth.usingLocalServer')}</span>
                    )}
                  </p>
                  {!getCustomApiUrl() && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      💡 {t('auth.localServerHint')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                    {t('auth.apiKey')} <span className="text-gray-400 dark:text-gray-500 text-xs">({t('auth.optional')})</span>
                  </label>
                  <PasswordInput
                    value={serverConfig.apiKey}
                    onChange={(e) => setServerConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={t('auth.apiKeyPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveServerConfig();
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('auth.apiKeyHint')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="flex-1 px-3 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                  >
                    {testingConnection ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        {t('auth.testing')}
                      </>
                    ) : (
                      <>
                        {connectionStatus === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                        {connectionStatus === 'error' && <XCircle className="w-3.5 h-3.5" />}
                        {serverConfig.apiUrl?.trim() ? t('auth.testConnection') : t('auth.useLocalServer')}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveServerConfig}
                    className="flex-1 px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                  >
                    {serverConfig.apiUrl?.trim() ? t('auth.saveConfig') : (getCustomApiUrl() ? t('auth.restoreDefault') : t('auth.useDefault'))}
                  </button>
                </div>

                {getCustomApiUrl() && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomApiUrl(null);
                      setCustomApiKey(null);
                      setServerConfig({ apiUrl: '', apiKey: '' });
                      toast.success(t('auth.configCleared'));
                      setTimeout(() => window.location.reload(), 1000);
                    }}
                    className="w-full px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {t('auth.clearConfig')}
                  </button>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                  💡 {!getCustomApiUrl() 
                    ? t('auth.localServerConfigHint')
                    : t('auth.serverConfigHint')
                  }
                </p>
              </div>
            )}
          </div>
            )}

            <form onSubmit={handleVerifyPrivateKey} className="space-y-6">
              <div>
                <label htmlFor="privateKey" className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('auth.privateKey')}
                </label>
                <PasswordInput
                  id="privateKey"
                  name="privateKey"
                  value={formData.privateKey}
                  onChange={(e) =>
                    setFormData({ ...formData, privateKey: e.target.value })
                  }
                  placeholder={t('auth.enterPrivateKey')}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  required
                  autoFocus
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('auth.contactAdmin')}
                </p>
              </div>

              <button
                type="submit"
                disabled={verifyingPrivateKey}
                className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {verifyingPrivateKey ? t('auth.verifying') : t('auth.verifyPrivateKey')}
              </button>
            </form>

            {/* 语言选择器 - 扁平化设计 */}
            <div className="flex justify-center items-center gap-2 pt-6 mt-6 border-t border-gray-200 dark:border-gray-800">
              <Globe className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    currentLanguage === 'en'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  🇬🇧 English
                </button>
                <button
                  onClick={() => handleLanguageChange('zh')}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    currentLanguage === 'zh'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  🇨🇳 中文
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 第二步：正常登录
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-950 py-12 px-4">
      <div className="max-w-md w-full flex-1 flex flex-col justify-center">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8">
          <div className="text-center mb-8">
            <div className="mx-auto h-12 w-12 bg-blue-600 dark:bg-blue-500 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t('auth.loginToAccount')}
            </h2>
            {systemConfig.registrationEnabled && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('common.or')}{' '}
                <Link
                  to="/register"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t('auth.registerNewAccount')}
                </Link>
              </p>
            )}
          </div>

          {/* 服务器配置区域 - 根据系统设置和构建时配置决定是否显示 */}
          {systemConfig?.enableApiServerConfigInLogin && !import.meta.env.VITE_HIDE_API_SERVER_CONFIG && (
          <div className="mb-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowServerConfig(!showServerConfig)}
              className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('auth.serverConfig')} {getCustomApiUrl() && `(${t('auth.configured')})`}
                </span>
              </div>
              {showServerConfig ? (
                <ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>

            {showServerConfig && (
              <div className="p-3 space-y-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                  {t('auth.serverAddress')} <span className="text-gray-400 text-xs">({t('auth.optional')})</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  value={serverConfig.apiUrl}
                  onChange={(e) => setServerConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                  placeholder={t('auth.serverAddressPlaceholder')}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveServerConfig();
                    }
                  }}
                />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('auth.current')}: <code className="bg-white dark:bg-gray-900 px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 text-xs">{getCurrentApiUrl()}</code>
                    {!getCustomApiUrl() && (
                      <span className="ml-2 text-green-600 dark:text-green-400">✓ {t('auth.usingLocalServer')}</span>
                    )}
                  </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                  {t('auth.apiKey')} <span className="text-gray-400 dark:text-gray-500 text-xs">({t('auth.optional')})</span>
                </label>
                <PasswordInput
                  value={serverConfig.apiKey}
                  onChange={(e) => setServerConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={t('auth.apiKeyPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveServerConfig();
                    }
                  }}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('auth.apiKeyHint')}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !serverConfig.apiUrl?.trim()}
                  className="flex-1 px-3 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  {testingConnection ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      {t('auth.testing')}
                    </>
                  ) : (
                    <>
                      {connectionStatus === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                      {connectionStatus === 'error' && <XCircle className="w-3.5 h-3.5" />}
                      {t('auth.testConnection')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSaveServerConfig}
                  disabled={!serverConfig.apiUrl?.trim() && !getCustomApiUrl()}
                  className="flex-1 px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t('auth.saveConfig')}
                </button>
              </div>

              {getCustomApiUrl() && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomApiUrl(null);
                    setCustomApiKey(null);
                    setServerConfig({ apiUrl: '', apiKey: '' });
                    toast.success(t('auth.configCleared'));
                    setTimeout(() => window.location.reload(), 1000);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  {t('auth.clearConfig')}
                </button>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                💡 {!getCustomApiUrl() 
                  ? t('auth.localServerConfigHint')
                  : t('auth.serverConfigHint')
                }
              </p>
            </div>
          )}
          </div>
          )}
        
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* 用户名 */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('auth.username')}
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  autoFocus={!showPrivateKeyStep}
                />
              </div>

              {/* 密码 */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('auth.password')}
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              {/* 验证码 */}
              <div>
                <label htmlFor="captcha" className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('auth.captcha')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="captcha"
                    name="captcha"
                    type="text"
                    required
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
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
                        className="border border-gray-300 dark:border-gray-700 cursor-pointer hover:border-blue-600 dark:hover:border-blue-500 transition-colors"
                        style={{
                          height: '48px',
                          width: '112px',
                          minWidth: '112px',
                          maxWidth: '112px',
                          objectFit: 'contain',
                          display: 'block'
                        }}
                        onClick={loadCaptcha}
                        title={t('auth.clickToRefresh')}
                      />
                    ) : (
                      <div 
                        className="border border-gray-300 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800"
                        style={{
                          height: '48px',
                          width: '112px',
                          minWidth: '112px',
                          maxWidth: '112px'
                        }}
                      >
                        {loadingCaptcha ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <span className="text-xs text-gray-400">{t('common.loading')}</span>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={loadCaptcha}
                      disabled={loadingCaptcha}
                      className="absolute -top-1 -right-1 p-1.5 bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors"
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
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.rememberMe')}
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || loadingCaptcha}
              className="w-full px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('common.loading') : t('auth.login')}
            </button>
          </form>

          {/* 语言选择器 - 扁平化设计 */}
          <div className="flex justify-center items-center gap-2 pt-6 mt-6 border-t border-gray-200 dark:border-gray-800">
            <Globe className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1">
              <button
                onClick={() => handleLanguageChange('en')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  currentLanguage === 'en'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                🇬🇧 English
              </button>
              <button
                onClick={() => handleLanguageChange('zh')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  currentLanguage === 'zh'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                🇨🇳 简体中文
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
