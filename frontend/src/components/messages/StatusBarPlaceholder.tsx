import React from 'react';
import { useDomTheme } from '../../hooks/useDomTheme';

/**
 * 状态栏占位符组件
 * 在移动端PWA中为系统状态栏预留空间
 */
export const StatusBarPlaceholder: React.FC = () => {
  // 获取DOM主题，确保主题切换时重新渲染
  const domTheme = useDomTheme();

  return (
    <header
      key={`status-bar-${domTheme}`} // 强制React在主题变化时重新渲染
      className="flex-shrink-0"
      style={{
        height: typeof window !== 'undefined' && window.innerWidth < 1024
          ? 'env(safe-area-inset-top, 0px)'
          : '0px',
        backgroundColor: 'var(--status-bar-bg)', // 使用CSS变量响应主题变化
        // 规避部分 PWA/WebView 下 fixed + 变量更新不重绘
        transform: 'translateZ(0)',
      }}
    />
  );
};