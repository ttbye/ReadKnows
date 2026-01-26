/**
 * @file main.tsx
 * @author ttbye
 * @date 2024-12-11
 * @description 前端应用入口文件
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n/config';
import { StatusBar, Style } from '@capacitor/status-bar';
import api, { debugApiConfig, getCustomApiUrl } from './utils/api';

// 检测是否在APK/Capacitor环境中
function isCapacitorEnvironment(): boolean {
  try {
    // 检查是否存在Capacitor
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return true;
    }
    // 检查是否是移动应用（没有有效的origin）
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin;
      if (!origin || origin === 'null' || origin.startsWith('file://') || origin.startsWith('capacitor://')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// 检测是否在PWA模式
function isPWA(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    // 检查是否是standalone模式（PWA）
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    // iOS Safari的特殊检测
    const isIOSStandalone = (window.navigator as any).standalone === true;
    return isStandalone || isIOSStandalone;
  } catch {
    return false;
  }
}

// 检测是否是移动设备
function isMobileDevice(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  } catch {
    return false;
  }
}
// 设置Android状态栏样式（带重试机制）
async function setStatusBarStyle(isDark: boolean, retryCount = 0) {
  try {
    // 检查是否在Capacitor原生环境中
    const Capacitor = (window as any).Capacitor;
    if (Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
      // 确保StatusBar插件已加载
      if (StatusBar && typeof StatusBar.setStyle === 'function') {
        // 设置状态栏样式（深色/浅色图标）
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        // 设置状态栏背景颜色，与标题栏颜色一致
        await StatusBar.setBackgroundColor({ 
          color: isDark ? '#111827' : '#ffffff' 
        });
        // 确保状态栏不覆盖WebView内容
        await StatusBar.setOverlaysWebView({ overlay: false });
        // 安全修复：仅在开发环境输出状态栏更新信息
        // console.log(`StatusBar已更新: ${isDark ? '深色' : '浅色'}主题`);
        return true;
      } else if (retryCount < 3) {
        // 如果StatusBar插件未加载，等待后重试
        // 安全修复：仅在开发环境输出重试信息
        // console.log(`StatusBar插件未就绪，${100 * (retryCount + 1)}ms后重试...`);
        setTimeout(() => {
          setStatusBarStyle(isDark, retryCount + 1);
        }, 100 * (retryCount + 1));
        return false;
      }
    }
  } catch (error) {
    // StatusBar插件可能未初始化，如果还有重试次数则重试
    if (retryCount < 3) {
      // 安全修复：仅在开发环境输出错误信息
      if (import.meta.env.DEV) {
        console.warn(`StatusBar设置失败，${100 * (retryCount + 1)}ms后重试:`, error);
      }
      setTimeout(() => {
        setStatusBarStyle(isDark, retryCount + 1);
      }, 100 * (retryCount + 1));
    } else {
      // 安全修复：仅在开发环境输出错误信息
      if (import.meta.env.DEV) {
        console.warn('StatusBar设置最终失败:', error);
      }
    }
  }
  return false;
}

// 修复 Android WebView 的缩放问题
function fixAndroidWebViewScaling() {
  // 检测是否是 Android WebView
  const userAgent = navigator.userAgent.toLowerCase();
  const isAndroid = userAgent.includes('android');
  const isWebView = (window as any).Capacitor?.isNativePlatform?.() || 
                    window.location.protocol === 'capacitor:' ||
                    window.location.protocol === 'file:';
  
  if (isAndroid && isWebView) {
    // 强制设置正确的 viewport scale
    const setViewport = () => {
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.setAttribute('name', 'viewport');
        document.head.appendChild(viewport);
      }
      viewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    };
    
    // 修复可能的缩放问题
    const fixScale = () => {
      // 设置 viewport
      setViewport();
      
      // 注意：不能在 html 或 body 上设置 transform，会导致 position: fixed 失效
      // 如果之前有设置，先清除它们
      document.documentElement.style.transform = '';
      document.documentElement.style.transformOrigin = '';
      document.body.style.transform = '';
      document.body.style.transformOrigin = '';
      
      // 确保没有意外的 zoom（某些浏览器支持）
      // zoom 属性不会影响 fixed 定位，所以可以安全使用
      if ((document.body as any).style.zoom !== undefined) {
        (document.body as any).style.zoom = '1';
      }
      
      // 强制重新计算布局（触发重排）
      void document.body.offsetHeight;
    };
    
    // 立即修复（多次执行以确保生效）
    fixScale();
    setTimeout(fixScale, 0);
    setTimeout(fixScale, 100);
    setTimeout(fixScale, 500);
    
    // 监听窗口变化
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(fixScale, 100);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(fixScale, 100);
      setTimeout(fixScale, 300);
    });
    
    // DOM 加载完成后再次修复
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        fixScale();
        setTimeout(fixScale, 100);
      });
    }
    
    // 页面完全加载后再次修复
    window.addEventListener('load', () => {
      setTimeout(fixScale, 0);
      setTimeout(fixScale, 100);
    });
    
    // 安全修复：仅在开发环境输出调试信息
    // console.log('[Android WebView] 已应用缩放修复');
  }
}

// 在页面加载时立即执行 Android WebView 修复
fixAndroidWebViewScaling();

// 全局错误处理：过滤浏览器扩展的错误
function setupGlobalErrorHandlers() {
  // 捕获未处理的Promise错误（来自扩展的错误通常是Promise rejection）
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    const errorMessage = error?.message || String(error || '');
    const errorStack = error?.stack || '';
    
    // 检查是否是来自浏览器扩展的错误
    const isExtensionError = 
      errorStack.includes('bootstrap-autofill-overlay') ||
      errorStack.includes('chrome-extension://') ||
      errorStack.includes('moz-extension://') ||
      errorStack.includes('safari-extension://') ||
      errorMessage.includes('Failed to construct \'URL\'') ||
      errorMessage.includes('Invalid URL');
    
    if (isExtensionError) {
      // 静默忽略扩展错误，不显示在控制台
      event.preventDefault();
      return;
    }
    
    // 其他错误正常处理（在开发环境显示）
    if (import.meta.env.DEV) {
      console.error('未处理的Promise错误:', error);
    }
  });
  
  // 捕获全局错误（可选，因为扩展错误通常是Promise rejection）
  const originalErrorHandler = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    const errorMessage = String(message || '');
    const errorStack = error?.stack || '';
    
    // 检查是否是来自浏览器扩展的错误
    const isExtensionError = 
      errorStack.includes('bootstrap-autofill-overlay') ||
      errorStack.includes('chrome-extension://') ||
      errorStack.includes('moz-extension://') ||
      errorStack.includes('safari-extension://') ||
      errorMessage.includes('Failed to construct \'URL\'') ||
      errorMessage.includes('Invalid URL');
    
    if (isExtensionError) {
      // 静默忽略扩展错误
      return true; // 返回true表示已处理，阻止默认错误处理
    }
    
    // 其他错误正常处理
    if (originalErrorHandler) {
      return originalErrorHandler(message, source, lineno, colno, error);
    }
    return false;
  };
}

// 设置全局错误处理
setupGlobalErrorHandlers();

// 初始化主题（在React渲染之前执行，避免闪烁）
async function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const root = document.documentElement;
  const body = document.body;
  
  // 清除可能存在的class
  root.classList.remove('dark', 'light');
  body.classList.remove('dark');
  
  let isDark = false;
  
  if (savedTheme === 'dark' || savedTheme === 'light') {
    // 用户手动设置的主题
    isDark = savedTheme === 'dark';
  } else {
    // APK默认使用亮色主题，Web默认使用深色主题
    const isAPK = isCapacitorEnvironment();
    isDark = !isAPK; // APK为false（亮色），Web为true（深色）
  }
  
  if (isDark) {
    root.classList.add('dark');
    body.classList.add('dark');
  } else {
    root.classList.add('light');
  }
  
  // 更新meta标签，与标题栏颜色一致
  // 深色主题：gray-900 (#111827) 与标题栏 dark:bg-gray-900 一致
  // 浅色主题：white (#ffffff) 与标题栏 bg-white 一致
  const themeColor = isDark ? '#111827' : '#ffffff';
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) {
    metaThemeColor = document.createElement('meta');
    metaThemeColor.setAttribute('name', 'theme-color');
    document.head.appendChild(metaThemeColor);
  }
  metaThemeColor.setAttribute('content', themeColor);
  
  // 更新color-scheme
  root.style.colorScheme = isDark ? 'dark' : 'light';
  
  // 设置CSS变量用于导航栏样式（确保导航栏能响应主题变化）
  const navBgDark = 'linear-gradient(135deg, rgba(17, 24, 39, 0.85) 0%, rgba(31, 41, 55, 0.9) 50%, rgba(17, 24, 39, 0.85) 100%)';
  const navBgLight = 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(249, 250, 251, 0.9) 50%, rgba(255, 255, 255, 0.85) 100%)';
  const navBorderDark = 'rgba(75, 85, 99, 0.3)';
  const navBorderLight = 'rgba(229, 231, 235, 0.5)';
  const navShadowDark = '0 -4px 20px rgba(0, 0, 0, 0.3), 0 -2px 8px rgba(0, 0, 0, 0.2)';
  const navShadowLight = '0 -4px 20px rgba(0, 0, 0, 0.08), 0 -2px 8px rgba(0, 0, 0, 0.04)';
  
  root.style.setProperty('--nav-bg', isDark ? navBgDark : navBgLight);
  root.style.setProperty('--nav-border', isDark ? navBorderDark : navBorderLight);
  root.style.setProperty('--nav-shadow', isDark ? navShadowDark : navShadowLight);
  
  // ✅ 修复：iOS状态栏样式（根据主题调整，PWA模式下）
  // iOS 状态栏样式说明：
  // - 'default': 浅色背景，深色文字（适合浅色主题）
  // - 'black': 深色背景，浅色文字（适合深色主题）
  // - 'black-translucent': 深色背景，浅色文字，半透明（适合深色主题）
  let metaAppleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!metaAppleStatusBar) {
    metaAppleStatusBar = document.createElement('meta');
    metaAppleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
    document.head.appendChild(metaAppleStatusBar);
  }
  // ✅ 修复：深色主题使用 'black'（深色背景，浅色文字），浅色主题使用 'default'（浅色背景，深色文字）
  const statusBarStyle = isDark ? 'black' : 'default';
  metaAppleStatusBar.setAttribute('content', statusBarStyle);
  
  // ✅ 修复：使用已声明的 themeColor 和 metaThemeColor（避免重复声明）
  // themeColor 和 metaThemeColor 已在上面声明，这里只需要更新CSS变量
  root.style.setProperty('--status-bar-bg', themeColor);
  
  // 设置Android状态栏样式
  await setStatusBarStyle(isDark);
}

// 初始化主题（在React渲染之前执行，避免闪烁）
initTheme();

// 版本检测和缓存清理
function checkAppVersionAndClearCache() {
  const currentVersion = import.meta.env.VITE_BUILD_VERSION;
  const storedVersion = localStorage.getItem('app-version');

  if (currentVersion && storedVersion && storedVersion !== currentVersion) {
    console.log('[版本检测] 检测到版本更新:', { currentVersion, storedVersion });

    // 清理旧版本的缓存数据
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('reading-position-') ||
        key.startsWith('reading-settings') ||
        key.startsWith('bookmarks-') ||
        key.startsWith('theme-') ||
        key.startsWith('settings-')
      )) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      console.log('[版本检测] 清理旧版本缓存数据:', keysToRemove.length, '项');
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    // 清理Service Worker缓存
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name.includes('pages-cache') || name.includes('api-cache')) {
            console.log('[版本检测] 清理缓存:', name);
            caches.delete(name);
          }
        });
      });
    }

    // 更新存储的版本号
    localStorage.setItem('app-version', currentVersion);
  } else if (currentVersion && !storedVersion) {
    // 首次运行，存储版本号
    localStorage.setItem('app-version', currentVersion);
  }
}

// 注册Service Worker，支持离线访问
// 参考 LearnQ 项目：在页面加载完成后注册，确保更可靠
if ('serviceWorker' in navigator) {
  // 使用 window.load 事件确保在页面完全加载后注册
  window.addEventListener('load', () => {
    // 版本检测和缓存清理
    checkAppVersionAndClearCache();
    // 优先使用 vite-plugin-pwa 的虚拟模块
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  import('virtual:pwa-register').then((module: any) => {
    const registerSW = module.registerSW || module.default?.registerSW || module.default;
    if (registerSW && typeof registerSW === 'function') {
      registerSW({
        immediate: true,
        onNeedRefresh() {
          // 有新版本可用时，自动更新
          console.log('[PWA] 检测到新版本，正在更新...');
        },
        onOfflineReady() {
          // Service Worker已就绪，可以离线使用
            // 安全修复：仅在开发环境输出PWA信息
            // console.log('[PWA] Service Worker已就绪，可以离线使用');
        },
          onRegistered(registration: ServiceWorkerRegistration) {
            // Service Worker注册成功
            if (import.meta.env.DEV) {
              // console.log('[PWA] Service Worker注册成功', registration);
            }

            // 监听Service Worker更新事件
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // 有新版本可用
                    // console.log('[PWA] 新版本已安装，准备激活');
                    // 可以在这里显示更新提示给用户
                  }
                });
              }
            });
          },
        onRegisterError(error: any) {
          // Service Worker注册失败
            // 安全修复：仅在开发环境输出错误信息
            if (import.meta.env.DEV) {
              console.error('[PWA] Service Worker注册失败', error);
            }
        },
      });
      } else {
        // 安全修复：仅在开发环境输出警告
        // console.warn('[PWA] 无法找到 registerSW 函数，尝试直接注册');
        // 备用方案：直接注册 Service Worker
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((registration) => {
            // 安全修复：仅在开发环境输出注册信息
            // console.log('[PWA] Service Worker 直接注册成功:', registration);
          })
          .catch((error) => {
            // 安全修复：仅在开发环境输出错误信息
            if (import.meta.env.DEV) {
              console.error('[PWA] Service Worker 直接注册失败:', error);
            }
          });
      }
    }).catch((error) => {
      // 如果虚拟模块加载失败，尝试直接注册
      // 安全修复：仅在开发环境输出警告
      if (import.meta.env.DEV) {
        console.warn('[PWA] Service Worker注册模块加载失败，尝试直接注册', error);
      }
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((registration) => {
          // 安全修复：仅在开发环境输出注册信息
          // console.log('[PWA] Service Worker 直接注册成功:', registration);
        })
        .catch((regError) => {
          // 安全修复：仅在开发环境输出错误信息
          if (import.meta.env.DEV) {
            console.error('[PWA] Service Worker 直接注册失败:', regError);
          }
        });
    });
  });
} else {
  // 安全修复：仅在开发环境输出警告
  // console.warn('[PWA] 浏览器不支持 Service Worker');
}

// 在APK环境中，确保API配置在应用启动时正确初始化
if (isCapacitorEnvironment()) {
  // 延迟执行，确保localStorage已经准备好
  setTimeout(() => {
    const customApiUrl = getCustomApiUrl();
    if (customApiUrl && customApiUrl.trim()) {
      const url = customApiUrl.trim().replace(/\/+$/, '');
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // 确保baseURL包含/api路径
        const baseURLWithApi = url.endsWith('/api') ? url : `${url}/api`;
        api.defaults.baseURL = baseURLWithApi;
        // 安全修复：注释掉可能泄露API URL的console输出
        // console.log('[main.tsx] APK环境：已更新axios baseURL为:', baseURLWithApi);
      }
    }
    // 安全修复：仅在开发环境显示API配置，避免生产环境泄露敏感信息
    if (import.meta.env.DEV) {
      debugApiConfig();
    }
  }, 200); // 延迟200ms，确保localStorage已准备好
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

