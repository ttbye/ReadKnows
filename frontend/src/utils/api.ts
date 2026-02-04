/**
 * @file api.ts
 * @author ttbye
 * @date 2025-12-11
 */

import axios from 'axios';

// 请求队列管理器，防止过多并发请求
class RequestQueue {
  private queue: Array<{
    request: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private activeRequests = 0;
  private maxConcurrent = 3; // 最大并发请求数

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.activeRequests++;
    const { request, resolve, reject } = this.queue.shift()!;

    try {
      const result = await request();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // 处理队列中的下一个请求
      setTimeout(() => this.processQueue(), 100); // 短暂延迟避免瞬间并发
    }
  }
}

const requestQueue = new RequestQueue();
import { offlineDataCache } from './offlineDataCache';

// 获取 API base URL
// 优先级：
// 1. localStorage 中的用户自定义服务器地址（用于 Android APK 等场景）
//    注意：如果用户设置了空字符串或无效值，会回退到默认值
// 2. 环境变量 VITE_API_URL（构建时配置）
// 3. 默认相对路径（Web 环境，由 nginx 或 Vite 代理处理）
//    默认使用 '/api'，通过前端服务器的代理转发到后端，无需配置API Key
const getBaseURL = (): string => {
  // 优先从 localStorage 读取用户自定义的服务器地址
  // 这对于 Android APK 等移动应用特别有用
  try {
    const customApiUrl = localStorage.getItem('custom-api-url');
    // 只有当设置了有效的URL时才使用，空字符串或无效值会回退到默认值
    if (customApiUrl && customApiUrl.trim()) {
      const url = customApiUrl.trim().replace(/\/+$/, '');
      // 验证 URL 格式：必须是 http:// 或 https:// 开头的有效URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // 在APK环境中记录日志
        // 安全修复：注释掉可能泄露API URL的console输出
        // const isAPK = typeof window !== 'undefined' && 
        //   ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');
        // if (isAPK) {
        //   console.log('[getBaseURL] 从localStorage读取自定义API URL:', url);
        // }
        return url;
      }
      // 如果格式无效，清除它并回退到默认值
      localStorage.removeItem('custom-api-url');
    }
  } catch (e) {
    // 在APK环境中，localStorage可能暂时不可用，记录错误但不抛出
    // 安全修复：注释掉不必要的console输出
    // const isAPK = typeof window !== 'undefined' && 
    //   ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');
    // if (isAPK) {
    //   console.warn('[getBaseURL] localStorage读取失败，可能尚未准备好:', e);
    // }
  }
  
  // 其次使用环境变量（构建时配置）
  if (import.meta.env.VITE_API_URL) {
    // 安全修复：注释掉可能泄露API URL的console输出
    // const isAPK = typeof window !== 'undefined' && 
    //   ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');
    // if (isAPK) {
    //   console.log('[getBaseURL] 使用环境变量VITE_API_URL:', import.meta.env.VITE_API_URL);
    // }
    return import.meta.env.VITE_API_URL;
  }
  
  // 默认使用相对路径 '/api'，让 nginx 或 Vite 代理处理（Web 环境）
  // 这样前端和后端在同一服务器上时，无需任何配置即可使用
  const isAPK = typeof window !== 'undefined' &&
    ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');

  if (isAPK) {
    // 在APK环境中，再次尝试读取localStorage（可能之前读取时还没准备好）
    try {
      const retryCustomApiUrl = localStorage.getItem('custom-api-url');
      if (retryCustomApiUrl && retryCustomApiUrl.trim()) {
        const url = retryCustomApiUrl.trim().replace(/\/+$/, '');
        if (url.startsWith('http://') || url.startsWith('https://')) {
          // 安全修复：注释掉可能泄露API URL的console输出
          // console.log('[getBaseURL] 重试读取localStorage成功，使用自定义API URL:', url);
          return url;
        }
      }
    } catch (e) {
      // 忽略重试时的错误
    }
    
    // 只有在真正没有配置的情况下才发出警告，并且只显示一次
    const warningKey = 'apk-baseurl-warning-shown';
    const hasShownWarning = sessionStorage.getItem(warningKey);
    
    if (!hasShownWarning) {
      // 安全修复：仅在开发环境显示警告，避免生产环境泄露信息
      if (import.meta.env.DEV) {
        console.warn('[getBaseURL] ⚠️ 使用默认相对路径 /api，这在APK环境中可能无法工作！');
        console.warn('[getBaseURL] 请确保在登录页面配置了自定义API服务器地址，或构建时设置了VITE_API_URL环境变量');
      }
      try {
        sessionStorage.setItem(warningKey, 'true');
      } catch (e) {
        // 忽略sessionStorage写入错误
      }
    }
  }
  
  return '/api';
};

// 动态获取 baseURL（每次请求时都重新获取，支持运行时修改）
const getDynamicBaseURL = (): string => {
  return getBaseURL();
};

// 初始化axios实例
// 注意：在APK环境中，localStorage可能还没有准备好，所以初始baseURL可能不准确
// 但请求拦截器会在每次请求时动态更新baseURL，所以这不是问题
const initialBaseURL = getBaseURL();
const api = axios.create({
  baseURL: initialBaseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30秒超时，避免网络问题导致请求失败
});

// 在APK环境中，确保baseURL在初始化后立即更新（如果localStorage中有配置）
// 这可以避免第一次请求时使用错误的baseURL
if (typeof window !== 'undefined') {
  // 延迟执行，确保localStorage已经准备好
  setTimeout(() => {
    const currentBaseURL = getBaseURL();
    if (currentBaseURL !== initialBaseURL) {
      // 安全修复：注释掉可能泄露API URL的console输出
      // console.log('[API] 检测到baseURL变化，更新axios实例:', {
      //   initial: initialBaseURL,
      //   current: currentBaseURL
      // });
      // 确保baseURL包含/api路径
      let finalBaseURL = currentBaseURL;
      if (finalBaseURL.startsWith('http://') || finalBaseURL.startsWith('https://')) {
        finalBaseURL = finalBaseURL.replace(/\/+$/, '');
        if (!finalBaseURL.endsWith('/api')) {
          finalBaseURL = `${finalBaseURL}/api`;
        }
      }
      api.defaults.baseURL = finalBaseURL;
    }
  }, 100);
}

// 从localStorage获取token的函数
const getTokenFromStorage = (): string | null => {
  try {
    const token = localStorage.getItem('auth-storage');
    if (token) {
      const parsed = JSON.parse(token);
      // Zustand persist stores state in { state: {...}, version: 0 } format
      // Check both formats for compatibility
      const extractedToken = parsed.state?.token || parsed.token || null;
      
      return extractedToken;
    }
  } catch (e) {
    // 忽略解析错误
  }
  return null;
};

// 初始化时设置token
const initialToken = getTokenFromStorage();
if (initialToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

// 请求去重：避免同时发送相同的请求（简化版本，仅用于清理）
const pendingRequests = new Map<string, Promise<any>>();

// 生成请求的唯一标识（用于调试和清理）
const getRequestKey = (config: any): string => {
  const url = config.url || '';
  const method = (config.method || 'get').toLowerCase();
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${method}:${url}:${params}`;
};

// 检查是否为本地地址
function isLocalAddress(url: string): boolean {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().trim();
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '::1' ||
           hostname === '0.0.0.0' ||
           hostname.startsWith('127.') ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           (hostname.startsWith('172.') && 
            parseInt(hostname.split('.')[1] || '0') >= 16 && 
            parseInt(hostname.split('.')[1] || '0') <= 31);
  } catch (e) {
    // 如果不是有效URL，检查是否包含本地地址关键词
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

// 从localStorage获取API KEY的函数
// 优先级：1. localStorage中的用户自定义API Key（最高优先级）
//         2. 环境变量VITE_API_KEY（构建时配置，作为默认值）
const getApiKeyFromStorage = (): string | null => {
  try {
    // 优先从localStorage读取用户自定义的API Key
    const customApiKey = localStorage.getItem('custom-api-key');
    if (customApiKey && customApiKey.trim()) {
      return customApiKey;
    }
  } catch (e) {
    // 忽略读取错误
  }
  
  // 如果localStorage中没有，则使用环境变量（构建时配置）
  if (import.meta.env.VITE_API_KEY) {
    return import.meta.env.VITE_API_KEY;
  }
  
  return null;
};

// 请求拦截器：每次请求时动态获取最新的token、baseURL和API KEY
// 包装原始请求函数以使用队列
const originalRequest = api.request.bind(api);
api.request = function(config: any) {
  return requestQueue.add(() => originalRequest(config));
};

// 修改各个方法以使用队列
['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].forEach(method => {
  const originalMethod = (api as any)[method].bind(api);
  (api as any)[method] = function(url: string, config?: any) {
    return requestQueue.add(() => originalMethod(url, config));
  };
});

api.interceptors.request.use(
  (config) => {
    // 将 PUT 和 DELETE 请求转换为 POST，添加 _method 参数（用于防火墙限制）
    const method = config.method?.toLowerCase();
    if (method === 'put' || method === 'delete') {
      // 将方法改为 POST
      config.method = 'post';
      
      // 在请求体中添加 _method 参数
      if (config.data) {
        // 如果 data 是对象，添加 _method 字段
        if (typeof config.data === 'object' && !(config.data instanceof FormData)) {
          config.data._method = method.toUpperCase();
        } else if (config.data instanceof FormData) {
          // 如果是 FormData，追加 _method 字段
          config.data.append('_method', method.toUpperCase());
        }
      } else {
        // 如果没有 data，创建一个新对象
        config.data = { _method: method.toUpperCase() };
      }
      
      // 如果是 DELETE 请求且没有 body，确保有 _method 参数
      if (method === 'delete' && !config.data) {
        config.data = { _method: 'DELETE' };
      }
    }
    
    // 每次请求时都重新获取 baseURL（支持运行时修改服务器地址）
    let dynamicBaseURL = getDynamicBaseURL();
    
    // 在APK环境中，如果baseURL是相对路径'/api'，说明可能没有正确读取localStorage
    // 再次尝试直接从localStorage读取（可能之前读取时localStorage还没准备好）
    const isAPK = typeof window !== 'undefined' && 
      ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');
    
    if (isAPK && dynamicBaseURL === '/api') {
      // 再次尝试读取localStorage（可能之前读取时localStorage还没准备好）
      try {
        const customApiUrl = localStorage.getItem('custom-api-url');
        if (customApiUrl && customApiUrl.trim()) {
          const url = customApiUrl.trim().replace(/\/+$/, '');
          if (url.startsWith('http://') || url.startsWith('https://')) {
            // 安全修复：注释掉可能泄露API URL的console输出
            // console.warn('[API拦截器] ⚠️ 检测到APK环境使用默认baseURL，但localStorage中有自定义URL，强制使用:', url);
            dynamicBaseURL = url; // 更新dynamicBaseURL
          }
        }
      } catch (e) {
        // 安全修复：仅在开发环境记录错误
        if (import.meta.env.DEV) {
          console.error('[API拦截器] localStorage读取失败:', e);
        }
      }
    }
    
    // 强制更新 config 的 baseURL（确保使用最新的服务器地址）
    // 注意：必须直接设置 config.baseURL，不能依赖 defaults.baseURL
    // 如果 config.url 已经是完整 URL，需要确保 baseURL 为空或 undefined
    if (config.url && (config.url.startsWith('http://') || config.url.startsWith('https://'))) {
      // URL 已经是完整的，不需要 baseURL
      config.baseURL = undefined;
    } else {
      // 如果 baseURL 是绝对 URL（如 https://server.com），需要确保包含 /api 路径
      // 如果是相对路径（如 '/api'），直接使用，不需要修改
      let finalBaseURL = dynamicBaseURL;
      if (finalBaseURL.startsWith('http://') || finalBaseURL.startsWith('https://')) {
        // 绝对URL：移除末尾斜杠
        finalBaseURL = finalBaseURL.replace(/\/+$/, '');
        // 检查是否已经包含 /api
        if (!finalBaseURL.endsWith('/api')) {
          // 添加 /api 路径
          finalBaseURL = `${finalBaseURL}/api`;
        }
      }
      // 相对路径（如 '/api'）直接使用，不需要修改
      // 强制设置 baseURL
      config.baseURL = finalBaseURL;
      
      // 修复：如果 config.url 已经包含 /api/，且 baseURL 也包含 /api，避免重复
      if (config.url && config.url.startsWith('/api/') && finalBaseURL.endsWith('/api')) {
        // 移除 config.url 中的 /api 前缀
        config.url = config.url.substring(4); // 移除 '/api'
      }
    }
    
    // 同时更新 axios 实例的默认 baseURL（保持同步）
    // 如果 baseURL 是绝对 URL，也需要添加 /api 路径
    let defaultBaseURL = dynamicBaseURL;
    if (defaultBaseURL.startsWith('http://') || defaultBaseURL.startsWith('https://')) {
      defaultBaseURL = defaultBaseURL.replace(/\/+$/, '');
      if (!defaultBaseURL.endsWith('/api')) {
        defaultBaseURL = `${defaultBaseURL}/api`;
      }
    }
    if (api.defaults.baseURL !== defaultBaseURL) {
      api.defaults.baseURL = defaultBaseURL;
    }
    
    // 调试日志：显示实际请求的完整 URL（在APK环境或开发环境显示）
    if (config.url) {
      const finalBaseURL = config.baseURL || api.defaults.baseURL || '';
      const fullUrl = finalBaseURL && !config.url.startsWith('http')
        ? (finalBaseURL.endsWith('/') ? finalBaseURL.slice(0, -1) : finalBaseURL) + 
          (config.url.startsWith('/') ? config.url : '/' + config.url)
        : config.url;
      
      // 在APK环境或开发环境显示详细日志
      const isAPK = typeof window !== 'undefined' && 
        ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');
      if (isAPK || import.meta.env.DEV) {
        // console.log(`[API请求] ${config.method?.toUpperCase()} ${fullUrl}`, {
        //   baseURL: finalBaseURL,
        //   url: config.url,
        //   hasAuth: !!config.headers.Authorization,
        //   hasApiKey: !!config.headers['X-API-Key'],
        //   customApiUrl: getCustomApiUrl(),
        //   customApiKey: getCustomApiKey() ? '***' : null
        // });
      }
    }
    
    // 每次请求时都从storage获取最新的API KEY
    // 如果API服务器地址是本地地址或者是相对路径，则不发送API Key
    const baseURL = config.baseURL || api.defaults.baseURL || '';
    
    // 判断是否为本地地址：
    // 1. 相对路径（如 '/api'）视为本地地址
    // 2. 绝对URL且是本地地址
    const isLocal = baseURL.startsWith('/') || isLocalAddress(baseURL);
    
    if (!isLocal) {
      // 只有非本地地址才需要API Key
      const apiKey = getApiKeyFromStorage();
      if (apiKey && apiKey.trim()) {
        config.headers['X-API-Key'] = apiKey.trim();
      } else {
        delete config.headers['X-API-Key'];
      }
    } else {
      // 本地地址或相对路径不发送API Key
      delete config.headers['X-API-Key'];
    }
    
    // 处理 FormData：如果是 FormData，删除 Content-Type，让浏览器自动设置（包括 boundary）
    if (config.data instanceof FormData) {
      // 删除 Content-Type，让浏览器自动设置 multipart/form-data 和 boundary
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
    
    // 每次请求时都从storage获取最新的token
    const token = getTokenFromStorage();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // 如果没有token，移除Authorization头
      delete config.headers.Authorization;
    }
    
    // 标记需要缓存的请求
    if (shouldCache(config.url || '', config.method || 'get')) {
      (config as any).__shouldCache = true;
    }

    // 添加AbortController支持（简化版本，不强制添加）
    if (!config.signal && typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      (config as any).__abortController = controller;
      config.signal = controller.signal;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 需要缓存的API端点（GET请求）
// 所有GET请求都应该被缓存，以便离线时使用
const cacheableEndpoints = [
  '/books',
  '/books/recent',
  '/books/recommended',
  '/shelf/my',
  '/reading/progress',
  '/notes',
  '/settings',
  '/fonts',
  '/profile',
  '/reading/history',
  '/user',
  '/ip/blocked',
  '/ip/attempts',
  // 书籍详情页面的API路径通常是 /books/:id
  // 搜索结果的API路径通常是 /books 或 /shelf/my
  // 这些已经在上面包含了
];

// 判断是否应该缓存
// 默认所有GET请求都应该缓存（除了明确不需要缓存的）
const shouldCache = (url: string, method: string): boolean => {
  if (method.toLowerCase() !== 'get') return false;
  
  // 排除不需要缓存的端点（如认证相关、实时数据等）
  const excludeEndpoints = [
    '/auth',
    '/login',
    '/logout',
    '/register',
    '/verify',
    '/upload', // 上传接口不需要缓存
  ];
  
  // 如果URL包含排除列表中的端点，不缓存
  if (excludeEndpoints.some(endpoint => url.includes(endpoint))) {
    return false;
  }
  
  // 如果URL在缓存列表中，明确缓存
  if (cacheableEndpoints.some(endpoint => url.includes(endpoint))) {
    return true;
  }
  
  // 默认：所有其他GET请求也缓存（用于离线支持）
  return true;
};


// 响应拦截器：缓存GET请求的响应
api.interceptors.response.use(
  async (response) => {
    const config = response.config;
    
    // 清除pending请求标记
    if (config.method?.toLowerCase() === 'get') {
      const requestKey = getRequestKey(config);
      pendingRequests.delete(requestKey);
    }
    
    // 缓存GET请求的响应（异步非阻塞）
    if ((config as any).__shouldCache) {
      // 使用setTimeout让缓存操作不阻塞响应返回
      setTimeout(async () => {
        try {
          // 缓存7天
          await offlineDataCache.set(
            config.url || '',
            response.data,
            config.params,
            60 * 60 * 24 * 7 * 1000
          );
        } catch (error) {
          // 缓存失败不影响使用
        }
      }, 0);
    }
    
    return response;
  },
  async (error) => {
    // 清除pending请求标记
    if (error.config && error.config.method?.toLowerCase() === 'get') {
      const requestKey = getRequestKey(error.config);
      pendingRequests.delete(requestKey);
    }

    // 如果是请求被取消，直接返回
    if (axios.isCancel(error) || error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    // 检查是否是连接被拒绝的错误（后端未运行）
    const isConnectionRefused = !error.response && (
      error.code === 'ERR_CONNECTION_REFUSED' ||
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('ERR_CONNECTION_REFUSED') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('Connection refused')
    );

    // 对于连接被拒绝的错误，静默处理，不输出到控制台
    // 这些错误通常是因为后端服务器未运行，用户已经知道
    if (isConnectionRefused) {
      // 对于GET请求，尝试从缓存获取数据
      if (error.config && error.config.method?.toLowerCase() === 'get') {
        const config = error.config;
        try {
          const cachedData = await offlineDataCache.get(config.url || '', config.params);
          if (cachedData) {
            return Promise.resolve({
              data: cachedData,
              status: 200,
              statusText: 'OK (Offline Cache)',
              headers: {},
              config,
            });
          }
        } catch (cacheError) {
          // 缓存获取失败，继续使用默认空数据
        }
      }
      
      // 返回空数据，静默失败
      const config = error.config || {};
      const url = config.url || '';
      
      // 根据不同的API端点返回不同的空数据结构
      let emptyData: any = {};
      
      if (url.includes('/books')) {
        emptyData = { books: [], pagination: { total: 0 } };
      } else if (url.includes('/notes')) {
        emptyData = { notes: [] };
      } else if (url.includes('/shelf')) {
        emptyData = { books: [], audiobooks: [] };
      } else if (url.includes('/reading/progress') || url.includes('/reading/history')) {
        emptyData = { progresses: [], history: [] };
      } else if (url.includes('/messages/unread-count')) {
        emptyData = { count: 0 };
      } else if (url.includes('/audiobooks') && url.includes('/progress')) {
        emptyData = { progress: null };
      } else if (url.includes('/settings')) {
        emptyData = { settings: {} };
      } else if (url.includes('/fonts')) {
        emptyData = { fonts: [] };
      } else if (url.includes('/profile') || url.includes('/user')) {
        emptyData = { user: null };
      } else if (url.includes('/groups')) {
        emptyData = { groups: [] };
      } else {
        emptyData = { data: [] };
      }
      
      // 静默返回空数据，不输出错误日志
      return Promise.resolve({
        data: emptyData,
        status: 200,
        statusText: 'OK (Offline, No Cache)',
        headers: {},
        config,
      });
    }

    // 对于所有GET请求，如果失败，尝试从缓存获取
    // 但只有在真正无法连接到服务器时才使用缓存（避免显示旧服务器的数据）
    if (error.config && error.config.method?.toLowerCase() === 'get') {
      const config = error.config;
      
      // 检查是否是真正的网络错误（无法连接到服务器）
      const isRealNetworkError = !error.response && (
        error.code === 'ERR_NETWORK' || 
        error.code === 'ERR_ADDRESS_INVALID' ||
        error.message?.includes('Network Error') ||
        error.message?.includes('ERR_ADDRESS_INVALID')
      );
      
      // 只有在真正的网络错误时才使用缓存
      // 如果是 401/403/404/500 等错误，说明服务器可达，不应该使用缓存
      if (isRealNetworkError) {
        // 尝试从缓存获取数据
        try {
          const cachedData = await offlineDataCache.get(config.url || '', config.params);
          if (cachedData) {
            // 返回缓存的响应
            return Promise.resolve({
              data: cachedData,
              status: 200,
              statusText: 'OK (Offline Cache)',
              headers: {},
              config,
            });
          }
        } catch (cacheError) {
          // 缓存获取失败不影响使用
        }
      } else {
        // 服务器可达但返回错误，不使用缓存，让错误继续传播
      }
    }
    
    // 如果是网络错误（包括 ERR_NETWORK, ERR_ADDRESS_INVALID, ECONNABORTED 等），尝试返回合理的空数据或使用缓存
    const isNetworkError = !error.response && (
      error.code === 'ERR_NETWORK' || 
      error.code === 'ERR_ADDRESS_INVALID' || 
      error.code === 'ECONNABORTED' ||
      error.message?.includes('timeout') ||
      error.message?.includes('Network Error') ||
      error.message?.includes('ERR_ADDRESS_INVALID')
    );
    
    // 网络错误已通过toast提示用户
    
    if (isNetworkError || (!offlineDataCache.isOnline() && !error.response)) {
      const config = error.config;
      const url = config?.url || '';
      
      // 对于 /users/me 和 /groups 接口，如果失败，不返回空数据，让调用方处理
      if (url.includes('/users/me') || url.includes('/groups')) {
        // 让错误继续传播，让调用方使用缓存数据或显示错误
        return Promise.reject(error);
      }
      
      // 根据不同的API端点返回不同的空数据结构
      let emptyData: any = {};
      
      if (url.includes('/books')) {
        emptyData = { books: [], pagination: { total: 0 } };
      } else if (url.includes('/notes')) {
        emptyData = { notes: [] };
      } else if (url.includes('/shelf')) {
        emptyData = { books: [] };
      } else if (url.includes('/reading/progress') || url.includes('/reading/history')) {
        emptyData = { progresses: [], history: [] };
      } else if (url.includes('/settings')) {
        emptyData = { settings: {} };
      } else if (url.includes('/fonts')) {
        emptyData = { fonts: [] };
      } else if (url.includes('/profile') || url.includes('/user')) {
        emptyData = { user: null };
      } else if (url.includes('/groups')) {
        emptyData = { groups: [] };
      } else {
        // 默认空数据
        emptyData = { data: [] };
      }
      
      return Promise.resolve({
        data: emptyData,
        status: 200,
        statusText: 'OK (Offline, No Cache)',
        headers: {},
        config: config || {},
      });
    }
    
    // 如果是401或403错误，可能是token过期或用户不存在，尝试清除token并跳转到登录页
    if (error.response?.status === 401 || error.response?.status === 403) {
      const errorMessage = error.response?.data?.error || '';
      // 如果是token相关错误或用户不存在，清除本地存储并跳转登录
      if (
        errorMessage.includes('认证') || 
        errorMessage.includes('令牌') || 
        errorMessage.includes('无效') ||
        errorMessage.includes('用户不存在') ||
        errorMessage.includes('请重新登录')
      ) {
        try {
          localStorage.removeItem('auth-storage');
          // 如果当前不在登录页，跳转到登录页
          if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
            window.location.href = '/login';
          }
        } catch (e) {
          // 忽略清除错误
        }
      }
    }
    
    return Promise.reject(error);
  }
);

// 导出取消请求的工具函数
export const createCancelToken = () => {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
  };
};

// 包装API调用，支持自动取消
export const apiWithCancel = <T = any>(
  request: Promise<T>,
  cancelToken?: { signal: AbortSignal; cancel: () => void }
): Promise<T> => {
  if (cancelToken) {
    return Promise.race([
      request,
      new Promise<T>((_, reject) => {
        cancelToken.signal.addEventListener('abort', () => {
          reject(new Error('Request canceled'));
        });
      }),
    ]);
  }
  return request;
};

// 导出设置和获取自定义 API URL 的工具函数
export const setCustomApiUrl = (url: string | null): void => {
  try {
    const oldUrl = getCustomApiUrl();
    
    if (url && url.trim()) {
      const cleanUrl = url.trim().replace(/\/+$/, '');
      if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        localStorage.setItem('custom-api-url', cleanUrl);
        // 更新 axios 实例的 baseURL（添加 /api 路径）
        const baseURLWithApi = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
        api.defaults.baseURL = baseURLWithApi;

        
        // 如果服务器地址改变了，清除旧的缓存数据（避免显示错误服务器的数据）

      } else {
        throw new Error('API URL must start with http:// or https://');
      }
    } else {
      localStorage.removeItem('custom-api-url');
      // 恢复默认 baseURL
      const defaultUrl = import.meta.env.VITE_API_URL || '/api';
      api.defaults.baseURL = defaultUrl;
    }
  } catch (e) {
    throw e;
  }
};

export const getCustomApiUrl = (): string | null => {
  try {
    return localStorage.getItem('custom-api-url');
  } catch (e) {
    return null;
  }
};

export const getCurrentApiUrl = (): string => {
  const url = getBaseURL();
  // 如果是相对路径，显示为"本地服务器（默认）"
  if (url.startsWith('/')) {
    return '本地服务器（默认）';
  }
  return url;
};

// 获取实际的API URL（用于调试和日志）
export const getActualApiUrl = (): string => {
  return getBaseURL();
};

/** 用于 @font-face 等需要拼接 api 路径的 base：相对时为 ''，绝对时为 origin（不含 /api） */
export const getFontsBaseUrl = (): string => {
  const u = getBaseURL();
  if (!u || u === '/api' || u.startsWith('/')) return '';
  const clean = u.replace(/\/+$/, '');
  if (clean.endsWith('/api')) return clean.slice(0, -4);
  return clean;
};

// 获取完整的 API URL（用于直接使用 fetch 的场景）
export const getFullApiUrl = (path: string): string => {
  const baseURL = getBaseURL();
  
  // 如果 path 已经包含协议，直接返回
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // 如果 baseURL 是相对路径（如 '/api'）
  if (baseURL.startsWith('/')) {
    // 如果 path 已经以 / 开头
    if (path.startsWith('/')) {
      // 检查 baseURL 是否以 /api 结尾，且 path 以 /api/ 开头，避免重复
      if (baseURL === '/api' && path.startsWith('/api/')) {
        // 移除 path 中的 /api 前缀
        return path; // path 已经是 /api/...，直接返回即可
      }
      return `${baseURL}${path}`;
    }
    return `${baseURL}/${path}`;
  }
  
  // 如果 baseURL 是绝对 URL（如 'https://server.com'）
  // 移除末尾斜杠
  const cleanBaseURL = baseURL.replace(/\/+$/, '');
  
  // 检查 baseURL 是否已经包含 /api
  if (cleanBaseURL.endsWith('/api')) {
    // 如果 path 以 / 开头，移除它
    let cleanPath = path.startsWith('/') ? path.substring(1) : path;
    // 如果 path 已经以 api/ 开头，移除这个前缀（避免重复）
    if (cleanPath.startsWith('api/')) {
      cleanPath = cleanPath.substring(4);
    }
    // 如果 cleanPath 为空，只返回 baseURL
    if (!cleanPath) {
      return cleanBaseURL;
    }
    return `${cleanBaseURL}/${cleanPath}`;
  } else {
    // baseURL 不包含 /api，需要添加
    let cleanPath = path.startsWith('/') ? path.substring(1) : path;
    // 如果 path 已经以 api/ 开头，不需要再添加
    if (cleanPath.startsWith('api/')) {
      return `${cleanBaseURL}/${cleanPath}`;
    }
    return `${cleanBaseURL}/api/${cleanPath}`;
  }
};

// 获取当前登录 token（用于拼接鉴权 URL）
export const getAuthToken = (): string | null => {
  return getTokenFromStorage();
};

/**
 * 从消息的 file_path（如 /messages/files/uuid.ext）得到需经认证的 API 路径。
 * 用于通过 /api/messages/files/:filename 获取附件，避免未授权访问。
 */
export const getMessageFileApiPath = (filePath: string | null | undefined): string | null => {
  if (!filePath || typeof filePath !== 'string') return null;
  const name = filePath.split('/').pop();
  return name ? `messages/files/${name}` : null;
};

// 获取带 token 的文件 URL（用于 <img> / <audio> 等无法加 Header 的场景）
export const getAuthenticatedFileUrl = (path: string): string => {
  const fullUrl = getFullApiUrl(path);
  const token = getAuthToken();
  if (!token) return fullUrl;
  if (fullUrl.includes('token=')) return fullUrl;
  return `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

// 检测是否在APK/Capacitor环境中
export const isAPKEnvironment = (): boolean => {
  try {
    // 优先使用构建时的环境变量（最可靠的方式）
    // 在构建APK时，VITE_IS_ANDROID_APP 会被设置为 'true'
    const isAndroidApp = import.meta.env.VITE_IS_ANDROID_APP;
    if (isAndroidApp === 'true') {
      return true;
    }
    
    // 如果环境变量明确设置为非 'true'，则不是APK环境
    if (isAndroidApp !== undefined && isAndroidApp !== 'true') {
      return false;
    }
    
    // 如果没有设置环境变量，使用运行时检测（作为fallback）
    if (typeof window === 'undefined') {
      return false;
    }
    
    // 最可靠的检测：检查是否存在Capacitor对象
    if ((window as any).Capacitor) {
      return true;
    }
    
    // 检查是否是capacitor://协议（Capacitor特有的协议）
    if (window.location && window.location.protocol === 'capacitor:') {
      return true;
    }
    
    // 检查origin，但要排除PWA standalone模式
    const origin = window.location.origin;
    
    // 如果origin是null或空字符串，可能是某些特殊环境
    // 但要排除PWA standalone模式（PWA的origin应该是有效的HTTP/HTTPS URL）
    if (!origin || origin === 'null') {
      // 检查是否是PWA standalone模式
      const isPWAStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                              (window.navigator as any).standalone === true;
      
      // 如果是PWA standalone模式，不是APK环境
      if (isPWAStandalone) {
        return false;
      }
      
      // 检查是否是file://协议（可能是本地开发环境，需要进一步判断）
      if (window.location.protocol === 'file:') {
        // 在开发环境中，file://可能是本地开发，不是APK
        // 只有在生产环境且没有有效的origin时才认为是APK
        // 这里保守一点，只检查capacitor://协议
        return false;
      }
      
      // 其他情况，可能是APK环境
      return true;
    }
    
    // 如果origin是有效的HTTP/HTTPS URL，不是APK环境
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      return false;
    }
    
    // 其他协议（如capacitor://）认为是APK环境
    return origin.startsWith('capacitor://');
  } catch {
    return false;
  }
};

// 获取完整的书籍文件 URL（用于 /books/ 路径，不在 /api 下）
export const getFullBookUrl = (path: string): string => {
  // 如果 path 已经包含协议，直接返回
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // 如果 path 是相对路径（如 '/books/xxx.epub'）
  if (path.startsWith('/')) {
    // 优先使用自定义API URL（适用于APK和Web环境）
    const customApiUrl = getCustomApiUrl();
    if (customApiUrl) {
      // 有自定义API URL，构建完整URL
      // /books/ 路径不在 /api 下，需要从服务器根路径获取
      const cleanBaseUrl = customApiUrl.replace(/\/+$/, '');
      return `${cleanBaseUrl}${path}`;
    }
    
    // 如果没有自定义URL，尝试使用环境变量中的API URL（适用于APK环境）
    const envApiUrl = import.meta.env.VITE_API_URL;
    if (envApiUrl && (envApiUrl.startsWith('http://') || envApiUrl.startsWith('https://'))) {
      // 环境变量中的URL可能包含 /api，需要移除
      const cleanBaseUrl = envApiUrl.replace(/\/+$/, '').replace(/\/api$/, '');
      return `${cleanBaseUrl}${path}`;
    }
    
    // 检查是否在APK环境中
    const isAPK = isAPKEnvironment();
    
    if (isAPK) {
      // APK环境但没有配置服务器地址
      // 返回相对路径，会在fetch时失败并给出明确的错误信息
      return path;
    }
    
    // Web环境：没有自定义URL，使用相对路径（浏览器会自动使用当前页面的 origin）
    return path;
  }
  
  // 如果 path 不是以 / 开头，添加 /books/ 前缀
  return `/books/${path}`;
};

// 获取 API Key（用于直接使用 fetch 的场景）
export const getApiKeyHeader = (): HeadersInit => {
  const headers: HeadersInit = {};
  const apiKey = getCustomApiKey();
  if (apiKey && apiKey.trim()) {
    headers['X-API-Key'] = apiKey.trim();
  }
  return headers;
};

// 获取认证头（包含 Authorization 和 X-API-Key，用于直接使用 fetch 的场景）
export const getAuthHeaders = (): HeadersInit => {
  const headers: HeadersInit = {};
  
  // 获取 token
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      const token = parsed.state?.token || parsed.token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (e) {
    // 忽略解析错误
  }
  
  // 获取 API Key
  const apiKey = getCustomApiKey();
  if (apiKey && apiKey.trim()) {
    headers['X-API-Key'] = apiKey.trim();
  }
  
  return headers;
};

// 导出设置和获取自定义 API KEY 的工具函数
export const setCustomApiKey = (key: string | null): void => {
  try {
    if (key && key.trim()) {
      localStorage.setItem('custom-api-key', key.trim());
    } else {
      localStorage.removeItem('custom-api-key');
    }
  } catch (e) {
    throw e;
  }
};

export const getCustomApiKey = (): string | null => {
  try {
    // 优先从localStorage读取用户自定义的API Key
    const customApiKey = localStorage.getItem('custom-api-key');
    if (customApiKey && customApiKey.trim()) {
      return customApiKey;
    }
  } catch (e) {
    // 忽略读取错误
  }
  
  // 如果localStorage中没有，则使用环境变量（构建时配置）
  if (import.meta.env.VITE_API_KEY) {
    return import.meta.env.VITE_API_KEY;
  }
  
  return null;
};

// 调试工具：打印当前 API 配置信息
export const debugApiConfig = (): void => {
  const baseURL = getBaseURL();
  const customUrl = getCustomApiUrl();
  const apiKey = getCustomApiKey();
  const envUrl = import.meta.env.VITE_API_URL;
  const envApiKey = import.meta.env.VITE_API_KEY;
  
  const isAPK = typeof window !== 'undefined' && 
    ((window as any).Capacitor || window.location.protocol === 'capacitor:' || !window.location.origin || window.location.origin === 'null');
  
  // 安全修复：仅在开发环境输出配置信息，避免生产环境泄露敏感信息
  if (import.meta.env.DEV) {
    // console.log('[API配置] 当前配置信息:', {
    //   baseURL,
    //   customUrl,
    //   hasApiKey: !!apiKey,
    //   envUrl,
    //   hasEnvApiKey: !!envApiKey,
    //   isAPK,
    //   axiosDefaultBaseURL: api.defaults.baseURL,
    //   origin: typeof window !== 'undefined' ? window.location.origin : 'N/A'
    // });
  }
};

/** 获取用户头像完整 URL，avatarPath 为 /users/me 返回的 avatar_path */
export function getAvatarUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  const base = (api.defaults.baseURL || '/api').toString().replace(/\/+$/, '');
  const root = base.startsWith('http') ? (base.replace(/\/api\/?$/, '') || base) : '';
  return root ? `${root}/api/avatars/${avatarPath}` : `/api/avatars/${avatarPath}`;
}

export default api;

