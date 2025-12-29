/**
 * @file useTheme.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const getSystemTheme = (): 'light' | 'dark' => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getEffectiveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      return savedTheme;
    }
    return 'dark'; // 默认使用深色主题
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
    
    // 更新meta标签
    const themeColor = effective === 'dark' ? '#1a1a1a' : '#ffffff';
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', themeColor);
    
    // 更新color-scheme
    root.style.colorScheme = effective === 'dark' ? 'dark' : 'light';
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
      
      // 更新meta标签
      const themeColor = effective === 'dark' ? '#1a1a1a' : '#ffffff';
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', themeColor);
      }
      
      root.style.colorScheme = effective === 'dark' ? 'dark' : 'light';
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

