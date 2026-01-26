import { useEffect } from 'react';

/**
 * 让 PWA 状态栏（theme-color / iOS status-bar-style）尽可能“即时”跟随主题更新。
 *
 * 说明：
 * - 部分浏览器/installed PWA/WebView 对 `meta[name="theme-color"]` 的动态更新不敏感，
 *   仅 setAttribute 有时不会生效（表现为“需要重启应用”）。
 * - 这里采用“移除并重建 meta + 轻量强制重绘”的兜底策略。
 */
export function usePWATheme(options?: { disabled?: boolean }) {
  const disabled = !!options?.disabled;

  useEffect(() => {
    if (disabled) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const root = document.documentElement;

    const forceUpdateThemeColorMeta = (themeColor: string) => {
      // 方法1：直接更新（最快）
      try {
        const existing = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
        if (existing) existing.setAttribute('content', themeColor);
      } catch {
        // ignore
      }

      // 方法2：移除并重新添加（更容易触发 PWA/WebView 重新读取）
      try {
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('content', themeColor);
        document.head.appendChild(meta);
      } catch {
        // ignore
      }
    };

    const forceUpdateAppleStatusBarStyle = (isDark: boolean) => {
      try {
        let meta = document.querySelector(
          'meta[name="apple-mobile-web-app-status-bar-style"]'
        ) as HTMLMetaElement | null;
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', isDark ? 'black' : 'default');
      } catch {
        // ignore
      }
    };

    const forceRepaint = () => {
      // 轻量强制重绘：触发一次 reflow + 微小滚动（仅在顶部时）
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        document.documentElement.offsetHeight;
      } catch {
        // ignore
      }
      try {
        if (window.scrollY === 0) {
          window.scrollTo(0, 1);
          setTimeout(() => window.scrollTo(0, 0), 50);
        }
      } catch {
        // ignore
      }
    };

    const apply = () => {
      const isDark = root.classList.contains('dark');
      const themeColor = isDark ? '#111827' : '#ffffff';
      forceUpdateThemeColorMeta(themeColor);
      forceUpdateAppleStatusBarStyle(isDark);
      // 更新CSS变量，确保状态栏占位div背景色与主题同步
      root.style.setProperty('--status-bar-bg', themeColor);
      forceRepaint();
    };

    apply();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          apply();
          break;
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme') apply();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', onStorage);
    };
  }, [disabled]);
}
