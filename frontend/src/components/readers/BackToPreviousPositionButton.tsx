/**
 * @author ttbye
 * 返回上一阅读位置的悬浮按钮组件
 */

import { useState } from 'react';
import { ArrowLeft, X, AlertCircle } from 'lucide-react';
import { ReadingSettings, ReadingPosition } from '../../types/reader';
import { useTranslation } from 'react-i18next';

interface BackToPreviousPositionButtonProps {
  previousPosition: ReadingPosition | null;
  isVisible: boolean;
  onBack: () => void;
  onClose: () => void;
  theme?: ReadingSettings['theme'];
}

export default function BackToPreviousPositionButton({
  previousPosition,
  isVisible,
  onBack,
  onClose,
  theme = 'light',
}: BackToPreviousPositionButtonProps) {
  const { t } = useTranslation();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  if (!isVisible || !previousPosition) return null;

  const themeStyles = {
    light: {
      bg: '#ffffff',
      text: '#111827',
      border: 'rgba(229,231,235,0.7)',
      hover: 'rgba(243,244,246,0.8)',
    },
    dark: {
      bg: '#111827',
      text: '#f9fafb',
      border: 'rgba(31,41,55,0.85)',
      hover: 'rgba(31,41,55,0.8)',
    },
    sepia: {
      bg: '#f4e4bc',
      text: '#5c4b37',
      border: 'rgba(212,196,156,0.9)',
      hover: 'rgba(255,255,255,0.4)',
    },
    green: {
      bg: '#c8e6c9',
      text: '#2e7d32',
      border: 'rgba(165,214,167,0.9)',
      hover: 'rgba(255,255,255,0.4)',
    },
  }[theme];

  const formatPosition = () => {
    // 优先显示进度百分比
    if (previousPosition.progress !== undefined) {
      return `${(previousPosition.progress * 100).toFixed(1)}%`;
    }
    // 如果没有进度，使用页码作为备选
    if (previousPosition.currentPage) {
      return t('reader.pageNumber', { page: previousPosition.currentPage });
    }
    return t('reader.previousPosition');
  };

  const handleClose = () => {
    setShowCloseConfirm(true);
  };

  const confirmClose = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  const cancelClose = () => {
    setShowCloseConfirm(false);
  };

  return (
    <>
      {/* 悬浮返回按钮 - 放置在右上角，避免遮挡内容 */}
      <div
        className="fixed top-16 right-4 z-[80] flex flex-col items-end gap-2"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        {/* 关闭确认提示 */}
        {showCloseConfirm && (
          <div
            className="mb-1 px-3 py-2 rounded-lg shadow-lg border max-w-xs"
            style={{
              backgroundColor: themeStyles.bg,
              borderColor: themeStyles.border,
              color: themeStyles.text,
            }}
          >
            <div className="flex items-start gap-2 mb-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
              <div className="flex-1">
                <p className="text-xs font-medium mb-0.5">{t('reader.confirmCloseBackButton')}</p>
                <p className="text-xs opacity-70 leading-tight">{t('reader.confirmCloseBackButtonDesc')}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={cancelClose}
                className="px-2 py-1 rounded text-xs transition-colors"
                style={{
                  color: themeStyles.text,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = themeStyles.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmClose}
                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        )}

        {/* 按钮组 - 水平排列，避免误触 */}
        <div className="flex items-center gap-2">
          {/* 返回按钮 - 简洁设计，醒目颜色 */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md shadow-md transition-all hover:opacity-90 active:scale-95"
            style={{
              backgroundColor: '#3b82f6', // 蓝色背景，醒目
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '500',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
            }}
            title={t('reader.backToPreviousPosition')}
          >
            <ArrowLeft className="w-3 h-3" />
            <span>{t('reader.backTo')} {formatPosition()}</span>
          </button>

          {/* 关闭按钮 - 增大尺寸，降低误触率 */}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-md shadow-sm flex items-center justify-center transition-all hover:opacity-80 active:scale-95"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: '#ffffff',
              minWidth: '32px',
              minHeight: '32px',
            }}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
}

