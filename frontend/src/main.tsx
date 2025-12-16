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

// 初始化主题（在React渲染之前执行，避免闪烁）
function initTheme() {
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
    // 使用系统主题
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDark = true;
    }
  }
  
  if (isDark) {
    root.classList.add('dark');
    body.classList.add('dark');
  } else {
    root.classList.add('light');
  }
  
  // 更新meta标签
  const themeColor = isDark ? '#1a1a1a' : '#ffffff';
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) {
    metaThemeColor = document.createElement('meta');
    metaThemeColor.setAttribute('name', 'theme-color');
    document.head.appendChild(metaThemeColor);
  }
  metaThemeColor.setAttribute('content', themeColor);
  
  // 更新color-scheme
  root.style.colorScheme = isDark ? 'dark' : 'light';
  
  // iOS状态栏样式
  let metaAppleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (!metaAppleStatusBar) {
    metaAppleStatusBar = document.createElement('meta');
    metaAppleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
    document.head.appendChild(metaAppleStatusBar);
  }
  metaAppleStatusBar.setAttribute('content', 'black-translucent');
}

// 初始化主题（在React渲染之前执行，避免闪烁）
initTheme();

// 注册Service Worker，支持离线访问
// 参考 LearnQ 项目：在页面加载完成后注册，确保更可靠
if ('serviceWorker' in navigator) {
  // 使用 window.load 事件确保在页面完全加载后注册
  window.addEventListener('load', () => {
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
            console.log('[PWA] 有新版本可用');
        },
        onOfflineReady() {
          // Service Worker已就绪，可以离线使用
            console.log('[PWA] Service Worker已就绪，可以离线使用');
        },
          onRegistered(registration: ServiceWorkerRegistration) {
          // Service Worker注册成功
            console.log('[PWA] Service Worker注册成功', registration);
        },
        onRegisterError(error: any) {
          // Service Worker注册失败
            console.error('[PWA] Service Worker注册失败', error);
        },
      });
      } else {
        console.warn('[PWA] 无法找到 registerSW 函数，尝试直接注册');
        // 备用方案：直接注册 Service Worker
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((registration) => {
            console.log('[PWA] Service Worker 直接注册成功:', registration);
          })
          .catch((error) => {
            console.error('[PWA] Service Worker 直接注册失败:', error);
          });
      }
    }).catch((error) => {
      // 如果虚拟模块加载失败，尝试直接注册
      console.warn('[PWA] Service Worker注册模块加载失败，尝试直接注册', error);
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[PWA] Service Worker 直接注册成功:', registration);
        })
        .catch((regError) => {
          console.error('[PWA] Service Worker 直接注册失败:', regError);
        });
    });
  });
} else {
  console.warn('[PWA] 浏览器不支持 Service Worker');
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

