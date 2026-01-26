/**
 * @file useTheme.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect, useCallback } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';

type Theme = 'light' | 'dark' | 'system';

// 检测是否在APK/Capacitor环境中
const isCapacitorEnvironment = (): boolean => {
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
};

// 获取默认主题（APK默认为亮色，Web默认为深色）
const getDefaultTheme = (): Theme => {
  const isAPK = isCapacitorEnvironment();
  return isAPK ? 'light' : 'dark';
};

const getSystemTheme = (): 'light' | 'dark' => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getEffectiveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
};

// 设置Android状态栏样式（带重试机制）
const setStatusBarStyle = async (isDark: boolean, retryCount = 0) => {
  try {
    // 检查是否在Capacitor原生环境中
    const Capacitor = (window as any).Capacitor;
    if (Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
      // 确保StatusBar插件已加载
      if (StatusBar && typeof StatusBar.setStyle === 'function') {
        // 设置状态栏样式（深色/浅色图标）
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
        // 设置状态栏背景颜色，与标题栏颜色一致
        // 深色主题：gray-900 (#111827) 与标题栏 dark:bg-gray-900 一致
        // 浅色主题：white (#ffffff) 与标题栏 bg-white 一致
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
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      return savedTheme;
    }
    // APK默认使用亮色主题，Web默认使用深色主题
    return getDefaultTheme();
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => 
    getEffectiveTheme(theme)
  );

  // 更新实际应用的主题
  useEffect(() => {
    const effective = getEffectiveTheme(theme);
    setEffectiveTheme(effective);

    const root = document.documentElement;
    const body = document.body;
    
    root.classList.remove('light', 'dark');
    body.classList.remove('dark');
    
    if (effective === 'dark') {
      root.classList.add('dark');
      body.classList.add('dark');
    } else {
      root.classList.add('light');
    }
    
    // 保存到localStorage
    localStorage.setItem('theme', theme);
    
    // ✅ 修复：更新iOS状态栏样式（PWA模式下）
    // iOS 状态栏样式说明：
    // - 'default': 浅色背景，深色文字（适合浅色主题）
    // - 'black': 深色背景，浅色文字（适合深色主题）
    // - 'black-translucent': 深色背景，浅色文字，半透明（适合深色主题）
    // 对于深色主题，使用 'black' 或 'black-translucent'；对于浅色主题，使用 'default'
    let metaAppleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!metaAppleStatusBar) {
      metaAppleStatusBar = document.createElement('meta');
      metaAppleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
      document.head.appendChild(metaAppleStatusBar);
    }
    // ✅ 修复：深色主题使用 'black'（深色背景，浅色文字），浅色主题使用 'default'（浅色背景，深色文字）
    const statusBarStyle = effective === 'dark' ? 'black' : 'default';
    metaAppleStatusBar.setAttribute('content', statusBarStyle);
    
    // ✅ 修复：更新 theme-color meta 标签（用于 Android PWA 状态栏）
    // 深色主题：gray-900 (#111827) 与标题栏 dark:bg-gray-900 一致
    // 浅色主题：white (#ffffff) 与标题栏 bg-white 一致
    const themeColor = effective === 'dark' ? '#111827' : '#ffffff';
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', themeColor);
    
    // ✅ 修复：更新CSS变量，用于CSS伪元素备用方案（Layout组件中的div是主要方案）
    root.style.setProperty('--status-bar-bg', themeColor);
    
    console.log('[useTheme] ✅ 更新iOS状态栏样式和theme-color', { 
      theme: effective, 
      statusBarStyle,
      themeColor,
      isPWA: window.matchMedia('(display-mode: standalone)').matches 
    });
    
    // 更新color-scheme
    root.style.colorScheme = effective === 'dark' ? 'dark' : 'light';
    
    // 设置CSS变量用于导航栏样式（确保导航栏能响应主题变化）
    const navBgDark = 'linear-gradient(135deg, rgba(17, 24, 39, 0.85) 0%, rgba(31, 41, 55, 0.9) 50%, rgba(17, 24, 39, 0.85) 100%)';
    const navBgLight = 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(249, 250, 251, 0.9) 50%, rgba(255, 255, 255, 0.85) 100%)';
    const navBorderDark = 'rgba(75, 85, 99, 0.3)';
    const navBorderLight = 'rgba(229, 231, 235, 0.5)';
    const navShadowDark = '0 -4px 20px rgba(0, 0, 0, 0.3), 0 -2px 8px rgba(0, 0, 0, 0.2)';
    const navShadowLight = '0 -4px 20px rgba(0, 0, 0, 0.08), 0 -2px 8px rgba(0, 0, 0, 0.04)';
    
    root.style.setProperty('--nav-bg', effective === 'dark' ? navBgDark : navBgLight);
    root.style.setProperty('--nav-border', effective === 'dark' ? navBorderDark : navBorderLight);
    root.style.setProperty('--nav-shadow', effective === 'dark' ? navShadowDark : navShadowLight);
    
    // 设置Android状态栏样式（使用setTimeout确保DOM更新完成后再设置状态栏）
    setTimeout(() => {
      setStatusBarStyle(effective === 'dark');
    }, 0);
  }, [theme]);

  // 监听系统主题变化（仅在theme为'system'时）
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const effective = getEffectiveTheme('system');
      setEffectiveTheme(effective);
      
      const root = document.documentElement;
      const body = document.body;
      root.classList.remove('light', 'dark');
      body.classList.remove('dark');
      
      if (effective === 'dark') {
        root.classList.add('dark');
        body.classList.add('dark');
      } else {
        root.classList.add('light');
      }
      
      // ✅ 修复：更新 theme-color meta 标签（用于 Android PWA 状态栏）
      const themeColor = effective === 'dark' ? '#111827' : '#ffffff';
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        document.head.appendChild(metaThemeColor);
      }
      metaThemeColor.setAttribute('content', themeColor);
      
      // ✅ 修复：更新iOS状态栏样式（PWA模式下）
      let metaAppleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (metaAppleStatusBar) {
        const statusBarStyle = effective === 'dark' ? 'black' : 'default';
        metaAppleStatusBar.setAttribute('content', statusBarStyle);
        console.log('[useTheme] 系统主题变化，更新iOS状态栏样式', { 
          theme: effective, 
          statusBarStyle,
          isPWA: window.matchMedia('(display-mode: standalone)').matches 
        });
      }
      
      root.style.colorScheme = effective === 'dark' ? 'dark' : 'light';
      
      // 设置CSS变量用于导航栏样式（确保导航栏能响应主题变化）
      const navBgDark = 'linear-gradient(135deg, rgba(17, 24, 39, 0.85) 0%, rgba(31, 41, 55, 0.9) 50%, rgba(17, 24, 39, 0.85) 100%)';
      const navBgLight = 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(249, 250, 251, 0.9) 50%, rgba(255, 255, 255, 0.85) 100%)';
      const navBorderDark = 'rgba(75, 85, 99, 0.3)';
      const navBorderLight = 'rgba(229, 231, 235, 0.5)';
      const navShadowDark = '0 -4px 20px rgba(0, 0, 0, 0.3), 0 -2px 8px rgba(0, 0, 0, 0.2)';
      const navShadowLight = '0 -4px 20px rgba(0, 0, 0, 0.08), 0 -2px 8px rgba(0, 0, 0, 0.04)';
      
      root.style.setProperty('--nav-bg', effective === 'dark' ? navBgDark : navBgLight);
      root.style.setProperty('--nav-border', effective === 'dark' ? navBorderDark : navBorderLight);
      root.style.setProperty('--nav-shadow', effective === 'dark' ? navShadowDark : navShadowLight);
      
      // ✅ 修复：更新CSS变量，用于状态栏占位div（确保系统主题变化时立即更新）
      root.style.setProperty('--status-bar-bg', themeColor);
      
      // 设置Android状态栏样式（使用setTimeout确保DOM更新完成后再设置状态栏）
      setTimeout(() => {
        setStatusBarStyle(effective === 'dark');
      }, 0);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      if (prev === 'system') {
        // 从系统主题切换到手动主题（切换到当前系统主题的相反主题）
        const currentSystemTheme = getSystemTheme();
        return currentSystemTheme === 'dark' ? 'light' : 'dark';
      } else if (prev === 'dark') {
        return 'light';
      } else {
        return 'dark';
      }
    });
  }, []);

  return { theme, effectiveTheme, setTheme, toggleTheme };
}

