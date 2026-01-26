import { useEffect, useState } from 'react';

/**
 * 读取并监听 DOM 上的主题（以 html 是否包含 `.dark` 为准）。
 *
 * 用途：
 * - 避免 `useTheme()` 被多处调用导致的“局部状态不同步”
 * - 让某些依赖 fixed/安全区的 UI（如 PWA 顶部占位层）在主题切换时强制重渲染/重挂载，
 *   规避部分 PWA/WebView 下 CSS 变量更新不触发重绘的问题。
 */
export function useDomTheme(): 'light' | 'dark' {
  const get = (): 'light' | 'dark' => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  };

  const [domTheme, setDomTheme] = useState<'light' | 'dark'>(() => get());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const sync = () => setDomTheme(root.classList.contains('dark') ? 'dark' : 'light');

    // 主题切换通常通过切换 html 的 class 实现
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          sync();
          break;
        }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    // 兜底：某些环境仅触发 storage 事件（跨 tab / WebView 特殊行为）
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme') sync();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return domTheme;
}

