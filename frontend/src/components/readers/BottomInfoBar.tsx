/**
 * @author ttbye
 * 底部阅读信息栏
 * 始终显示在阅读页面底部，显示书籍名称、页码、时间等信息
 * 支持响应式布局，自动适配移动端/平板/PC端
 */

import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { BookData, ReadingPosition, ReadingSettings } from '../../types/reader';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';

interface BottomInfoBarProps {
  book: BookData;
  position: ReadingPosition;
  settings: ReadingSettings;
  onToggleTOC?: () => void;
}

// 导出高度计算函数，供其他组件使用
export const getInfoBarHeight = (width: number): number => {
  if (width < 768) {
    // 移动端：5px + 24px + 5px = 34px (含上下padding)
    return 34;
  } else if (width < 1024) {
    // 平板：7px + 28px + 7px = 42px
    return 42;
  } else {
    // PC端：8px + 32px + 8px = 48px
    return 48;
  }
};

export default function BottomInfoBar({
  book,
  position,
  settings,
  onToggleTOC,
}: BottomInfoBarProps) {
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // 检测设备类型
  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

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


  // 根据设备类型设置样式
  const getResponsiveStyles = () => {
    if (isMobile) {
      // 移动端：紧凑布局
      return {
        containerPadding: '0px',
        contentHeight: '24px',
        fontSize: '11px',
        pageNumberSize: '11.5px',
        timeSize: '11px',
        horizontalPadding: '12px',
        verticalPadding: '5px',
      };
    } else if (isTablet) {
      // 平板：中等布局
      return {
        containerPadding: '0px',
        contentHeight: '30px',
        fontSize: '12px',
        pageNumberSize: '13px',
        timeSize: '12px',
        horizontalPadding: '16px',
        verticalPadding: '7px',
      };
    } else {
      // PC端：舒适布局
      return {
        containerPadding: '0px',
        contentHeight: '32px',
        fontSize: '13px',
        pageNumberSize: '14px',
        timeSize: '13px',
        horizontalPadding: '24px',
        verticalPadding: '8px',
      };
    }
  };

  const styles = getResponsiveStyles();
  const isEpub = book.file_type === 'epub';
  const pct = (() => {
    const p = typeof position.progress === 'number' ? position.progress : 0;
    const v = Number.isFinite(p) ? p : 0;
    return Math.min(100, Math.max(0, v * 100));
  })();

  return (
    <div
      className="fixed left-0 right-0 z-20"
      style={{
        bottom: '0',
        left: '0',
        right: '0',
        backgroundColor: themeStyles.bg,
        borderTop: `1px solid ${themeStyles.border}`,
        boxShadow: '0 -1px 3px rgba(0, 0, 0, 0.05)',
        margin: '0',
        // 外层容器处理安全区域，确保整个元素紧贴屏幕底部
        // paddingBottom 让内容显示在安全区域上方
        paddingBottom: 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
      }}
    >
      <div 
        className="flex items-center justify-between"
        style={{ 
          padding: styles.containerPadding,
          paddingLeft: styles.horizontalPadding,
          paddingRight: styles.horizontalPadding,
          paddingTop: styles.verticalPadding,
          paddingBottom: styles.verticalPadding,
          color: themeStyles.text,
          fontSize: styles.fontSize,
          height: styles.contentHeight,
          minHeight: styles.contentHeight,
        }}
      >
        {/* 左侧：目录按钮 */}
        {onToggleTOC ? (
          <button
            onClick={onToggleTOC}
            className="flex-shrink-0 flex items-center justify-center p-1.5 rounded transition-colors"
            style={{
              color: themeStyles.text,
              opacity: 0.75,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label={t('reader.toc')}
            title={t('reader.toc')}
          >
            <BookOpen className="w-4 h-4" style={{ width: isMobile ? '16px' : isTablet ? '18px' : '20px', height: isMobile ? '16px' : isTablet ? '18px' : '20px' }} />
          </button>
        ) : (
          <div className="flex-shrink-0" style={{ width: isMobile ? '16px' : isTablet ? '18px' : '20px' }}></div>
        )}

        {/* 中间：页码信息 */}
        <div 
          className="flex-shrink-0 text-center"
          style={{ 
            opacity: 0.75,
            fontWeight: 500,
            fontSize: styles.pageNumberSize,
            letterSpacing: '0.01em',
          }}
        >
          {isEpub ? `${pct.toFixed(2)}%` : t('reader.pageNumberFormat', { current: position.currentPage, total: position.totalPages })}
        </div>

        {/* 右侧：当前时间 */}
        <div 
          className="flex-shrink-0"
          style={{ 
            opacity: 0.65,
            fontWeight: 400,
            fontSize: styles.timeSize,
            letterSpacing: '0.02em',
          }}
        >
          {currentTime.toLocaleTimeString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false,
          })}
        </div>
      </div>
    </div>
  );
}

