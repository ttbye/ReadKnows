/**
 * @file api.ts
 * @author ttbye
 * @date 2025-12-11
 */

import axios from 'axios';
import { offlineDataCache } from './offlineDataCache';

// 获取 API base URL
// 在开发环境中，使用相对路径（Vite 代理会处理）
// 在生产环境中，也使用相对路径（nginx 会代理到后端）
// 如果设置了 VITE_API_URL 环境变量，使用它
const getBaseURL = (): string => {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // 默认使用相对路径，让 nginx 或 Vite 代理处理
  return '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30秒超时
});

// 从localStorage获取token的函数
const getTokenFromStorage = (): string | null => {
  try {
    const token = localStorage.getItem('auth-storage');
    if (token) {
    const parsed = JSON.parse(token);
      return parsed.state?.token || null;
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

// 请求拦截器：每次请求时动态获取最新的token
api.interceptors.request.use(
  (config) => {
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
    
    // 缓存GET请求的响应
    if ((config as any).__shouldCache) {
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
    }
    
    return response;
  },
  async (error) => {
    // 对于所有GET请求，如果失败，尝试从缓存获取
    if (error.config && error.config.method?.toLowerCase() === 'get') {
      const config = error.config;
      
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
    }
    
    // 如果是网络错误，且离线，尝试返回合理的空数据
    if (!offlineDataCache.isOnline() && (!error.response || error.code === 'ERR_NETWORK')) {
      const config = error.config;
      const url = config?.url || '';
      
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
    
    // 如果是401或403错误，可能是token过期，尝试清除token并跳转到登录页
    if (error.response?.status === 401 || error.response?.status === 403) {
      const errorMessage = error.response?.data?.error || '';
      // 如果是token相关错误，清除本地存储并跳转登录
      if (errorMessage.includes('认证') || errorMessage.includes('令牌') || errorMessage.includes('无效')) {
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

export default api;

