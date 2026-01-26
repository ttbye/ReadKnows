/**
 * @author ttbye
 * 阅读进度跳转模态框
 * 支持通过百分比或页码跳转到指定位置
 */

import { useState, useEffect, useRef } from 'react';
import { X, Navigation } from 'lucide-react';
import { ReadingSettings, ReadingPosition } from '../../types/reader';
import { useTranslation } from 'react-i18next';

interface ProgressJumpModalProps {
  isVisible: boolean;
  onClose: () => void;
  position: ReadingPosition;
  settings: ReadingSettings;
  bookType: string;
  onJump: (progress: number) => void; // progress: 0-1 之间的值
}

export default function ProgressJumpModal({
  isVisible,
  onClose,
  position,
  settings,
  bookType,
  onJump,
}: ProgressJumpModalProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [inputType, setInputType] = useState<'percentage' | 'page'>('percentage');
  const inputRef = useRef<HTMLInputElement>(null);

  const themeStyles = {
    bg: settings.theme === 'dark' ? '#1f2937' : '#ffffff',
    text: settings.theme === 'dark' ? '#f3f4f6' : '#111827',
    border: settings.theme === 'dark' ? '#374151' : '#e5e7eb',
    hover: settings.theme === 'dark' ? '#374151' : '#f3f4f6',
    primary: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
  };

  // 当模态框显示时，聚焦输入框并设置初始值
  useEffect(() => {
    if (isVisible) {
      // 延迟聚焦，确保模态框已渲染
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
      
      // 根据当前类型设置初始值
      if (inputType === 'percentage') {
        const currentProgress = position.progress || 0;
        setInputValue((currentProgress * 100).toFixed(2));
      } else {
        setInputValue(String(position.currentPage || 1));
      }
    } else {
      setInputValue('');
    }
  }, [isVisible, inputType, position]);

  const handleJump = () => {
    const value = parseFloat(inputValue);
    if (isNaN(value) || value < 0) {
      return;
    }

    let progress = 0;

    if (inputType === 'percentage') {
      // 百分比模式：0-100
      if (value > 100) {
        progress = 1;
      } else {
        progress = Math.max(0, Math.min(1, value / 100));
      }
    } else {
      // 页码模式
      const totalPages = position.totalPages || 1;
      const targetPage = Math.max(1, Math.min(totalPages, Math.round(value)));
      progress = (targetPage - 1) / totalPages;
    }

    onJump(progress);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJump();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isVisible) return null;

  const isEpub = bookType.toLowerCase() === 'epub';
  const currentProgress = position.progress || 0;
  const currentPage = position.currentPage || 1;
  const totalPages = position.totalPages || 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
          ? `max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 1rem)`
          : 'max(env(safe-area-inset-top, 0px), 1rem)',
        paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
          ? `max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 1rem)`
          : 'max(env(safe-area-inset-bottom, 0px), 1rem)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl flex flex-col"
        style={{
          backgroundColor: themeStyles.bg,
          border: `1px solid ${themeStyles.border}`,
          maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 1rem) - max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 1rem) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
            : 'calc(80vh - 2rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: themeStyles.border }}
        >
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5" style={{ color: themeStyles.primary }} />
            <h3 className="text-lg font-semibold" style={{ color: themeStyles.text }}>
              {t('reader.jumpToProgress', '跳转到进度')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{
              color: themeStyles.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label={t('common.close', '关闭')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-4">
          {/* 当前进度信息 */}
          <div className="text-sm" style={{ color: themeStyles.text, opacity: 0.7 }}>
            {isEpub ? (
              <span>
                {t('reader.currentProgress', '当前进度')}: {currentProgress > 0 ? (currentProgress * 100).toFixed(2) : '0.00'}%
              </span>
            ) : (
              <span>
                {t('reader.currentPage', '当前页码')}: {currentPage} / {totalPages}
              </span>
            )}
          </div>

          {/* 输入类型切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setInputType('percentage');
                const currentProgress = position.progress || 0;
                setInputValue((currentProgress * 100).toFixed(2));
              }}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: inputType === 'percentage' ? themeStyles.primary : 'transparent',
                color: inputType === 'percentage' ? '#ffffff' : themeStyles.text,
                border: `1px solid ${inputType === 'percentage' ? themeStyles.primary : themeStyles.border}`,
              }}
            >
              {t('reader.percentage', '百分比')}
            </button>
            {!isEpub && (
              <button
                onClick={() => {
                  setInputType('page');
                  setInputValue(String(position.currentPage || 1));
                }}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: inputType === 'page' ? themeStyles.primary : 'transparent',
                  color: inputType === 'page' ? '#ffffff' : themeStyles.text,
                  border: `1px solid ${inputType === 'page' ? themeStyles.primary : themeStyles.border}`,
                }}
              >
                {t('reader.pageNumber', '页码')}
              </button>
            )}
          </div>

          {/* 输入框 */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: themeStyles.text }}>
              {inputType === 'percentage'
                ? t('reader.enterPercentage', '输入百分比 (0-100)')
                : t('reader.enterPageNumber', `输入页码 (1-${totalPages})`)}
            </label>
            <input
              ref={inputRef}
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              min={inputType === 'percentage' ? 0 : 1}
              max={inputType === 'percentage' ? 100 : totalPages}
              step={inputType === 'percentage' ? 0.01 : 1}
              className="w-full px-4 py-3 rounded-lg text-lg font-medium focus:outline-none focus:ring-2 transition-all"
              style={{
                backgroundColor: settings.theme === 'dark' ? '#111827' : '#f9fafb',
                color: themeStyles.text,
                border: `2px solid ${themeStyles.border}`,
              }}
              placeholder={
                inputType === 'percentage'
                  ? t('reader.percentagePlaceholder', '例如: 50.5')
                  : t('reader.pagePlaceholder', `例如: ${Math.floor(totalPages / 2)}`)
              }
            />
          </div>

          {/* 快捷按钮 */}
          <div className="grid grid-cols-4 gap-2">
            {[0, 25, 50, 75, 100].map((percent) => (
              <button
                key={percent}
                onClick={() => {
                  setInputType('percentage');
                  setInputValue(String(percent));
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: themeStyles.hover,
                  color: themeStyles.text,
                  border: `1px solid ${themeStyles.border}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = themeStyles.primary;
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = themeStyles.hover;
                  e.currentTarget.style.color = themeStyles.text;
                }}
              >
                {percent}%
              </button>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div
          className="flex gap-3 px-6 py-4 border-t"
          style={{ 
            borderColor: themeStyles.border,
            paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
              ? `calc(1rem + ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
              : '1rem'
          }}
        >
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: themeStyles.hover,
              color: themeStyles.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            onClick={handleJump}
            className="flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors"
            style={{
              backgroundColor: themeStyles.primary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {t('reader.jump', '跳转')}
          </button>
        </div>
      </div>
    </div>
  );
}
