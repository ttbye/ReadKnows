/**
 * @author ttbye
 * 底部功能导航栏
 * 仿Kindle/微信读书风格，点击阅读内容时显示，包含各种功能按钮
 */

import { BookOpen, Palette, Type, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react';
import { BookData, ReadingPosition, ReadingSettings } from '../../types/reader';
import { useState, useEffect } from 'react';

interface BottomNavigationProps {
  book: BookData;
  position: ReadingPosition;
  settings: ReadingSettings;
  onSettingsChange: (settings: ReadingSettings) => void;
  isVisible: boolean;
  onToggleTOC: () => void;
  onToggleSettings: () => void;
  onToggleNotes?: () => void;
  onPageTurn: (direction: 'prev' | 'next') => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function BottomNavigation({
  book,
  position,
  settings,
  onSettingsChange,
  isVisible,
  onToggleTOC,
  onToggleSettings,
  onToggleNotes,
  onPageTurn,
  onMouseEnter,
  onMouseLeave,
}: BottomNavigationProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [infoBarHeight, setInfoBarHeight] = useState(34); // 默认移动端高度

  // 监听窗口大小变化和设置变化，动态计算底部信息栏高度
  useEffect(() => {
    const updateInfoBarHeight = () => {
      // 如果不显示底部信息栏，高度为0
      if (!settings.showBottomInfoBar) {
        setInfoBarHeight(0);
        return;
      }
      
      const width = window.innerWidth;
      const height = width < 768 ? 34 : width < 1024 ? 42 : 48;
      setInfoBarHeight(height);
    };
    
    updateInfoBarHeight();
    window.addEventListener('resize', updateInfoBarHeight);
    return () => window.removeEventListener('resize', updateInfoBarHeight);
  }, [settings.showBottomInfoBar]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0', hover: 'rgba(0, 0, 0, 0.05)' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040', hover: 'rgba(255, 255, 255, 0.1)' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c', hover: 'rgba(0, 0, 0, 0.05)' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7', hover: 'rgba(0, 0, 0, 0.05)' },
  }[settings.theme];

  const progressPercentage = Math.round(position.progress * 100);

  return (
    <div
      className={`fixed left-0 right-0 z-40 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
      }`}
      style={{
        // 定位在底部信息栏上方
        // 底部信息栏外层容器有paddingBottom处理安全区域，所以实际高度 = infoBarHeight + 安全区域
        // 所以这里需要定位在 infoBarHeight + 安全区域 的位置
        bottom: settings.showBottomInfoBar 
          ? `calc(${infoBarHeight}px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))` 
          : '0',
        left: '0',
        right: '0',
        backgroundColor: themeStyles.bg,
        borderTop: `1px solid ${themeStyles.border}`,
        boxShadow: isVisible ? '0 -2px 8px rgba(0, 0, 0, 0.08)' : 'none',
        // 如果不显示底部信息栏，需要自己处理安全区域
        paddingBottom: settings.showBottomInfoBar 
          ? '0px' 
          : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
        margin: '0', // 确保没有margin
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 进度条 */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: themeStyles.border }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progressPercentage}%`,
              backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
            }}
          />
        </div>
      </div>

      {/* 信息行 - 缩小 */}
      <div className="flex items-center justify-between px-3 py-1 text-xs" style={{ color: themeStyles.text, opacity: 0.75, fontSize: '10px' }}>
        <span className="truncate max-w-[30%] font-medium">
          {book.title || book.file_name}
        </span>
        <span className="mx-2">
          第 {position.currentPage} / {position.totalPages} 页
        </span>
        <span>
          {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* 功能按钮 - 缩小间距 */}
      <div className="flex items-center justify-around px-1 pb-2 pt-0.5">
        <button
          onClick={onToggleTOC}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="目录"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>目录</span>
        </button>

        <button
          onClick={onToggleSettings}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="设置"
        >
          <Type className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>设置</span>
        </button>

        {onToggleNotes && (
          <button
            onClick={onToggleNotes}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
            style={{
              color: themeStyles.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="笔记"
          >
            <StickyNote className="w-4 h-4" />
            <span className="text-xs" style={{ fontSize: '10px' }}>笔记</span>
          </button>
        )}

        <button
          onClick={onToggleSettings}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="主题"
        >
          <Palette className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>主题</span>
        </button>

        <button
          onClick={() => onPageTurn('prev')}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="上一页"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>上一页</span>
        </button>

        <button
          onClick={() => onPageTurn('next')}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="下一页"
        >
          <ChevronRight className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>下一页</span>
        </button>
      </div>
    </div>
  );
}
