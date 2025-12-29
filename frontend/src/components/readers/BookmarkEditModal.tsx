/**
 * @author ttbye
 * 书签编辑弹窗组件
 */

import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { ReadingSettings } from '../../types/reader';
import { useTranslation } from 'react-i18next';

interface Bookmark {
  id: string;
  bookId: string;
  fileType: string;
  name?: string;
  note?: string;
  position: {
    progress?: number;
    currentPage?: number;
    chapterIndex?: number;
    cfi?: string;
    currentLocation?: string;
  };
  preview?: string;
  createdAt: number;
}

interface BookmarkEditModalProps {
  bookmark: Bookmark | null;
  isVisible: boolean;
  onClose: () => void;
  onSave: (bookmark: Bookmark) => void;
  theme?: ReadingSettings['theme'];
}

export default function BookmarkEditModal({
  bookmark,
  isVisible,
  onClose,
  onSave,
  theme = 'light',
}: BookmarkEditModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (bookmark) {
      setName(bookmark.name || '');
      setNote(bookmark.note || '');
    }
  }, [bookmark]);

  if (!isVisible || !bookmark) return null;

  const themeStyles = {
    light: {
      bg: '#ffffff',
      text: '#111827',
      subText: '#6b7280',
      border: 'rgba(229,231,235,0.7)',
      hover: 'rgba(243,244,246,0.8)',
      inputBg: '#ffffff',
    },
    dark: {
      bg: '#111827',
      text: '#f9fafb',
      subText: '#d1d5db',
      border: 'rgba(31,41,55,0.85)',
      hover: 'rgba(31,41,55,0.8)',
      inputBg: 'rgba(31,41,55,0.9)',
    },
    sepia: {
      bg: '#f4e4bc',
      text: '#5c4b37',
      subText: 'rgba(92,75,55,0.75)',
      border: 'rgba(212,196,156,0.9)',
      hover: 'rgba(255,255,255,0.4)',
      inputBg: 'rgba(255,255,255,0.7)',
    },
    green: {
      bg: '#c8e6c9',
      text: '#2e7d32',
      subText: 'rgba(46,125,50,0.75)',
      border: 'rgba(165,214,167,0.9)',
      hover: 'rgba(255,255,255,0.4)',
      inputBg: 'rgba(255,255,255,0.7)',
    },
  }[theme];

  const handleSave = () => {
    const updatedBookmark: Bookmark = {
      ...bookmark,
      name: name.trim() || undefined,
      note: note.trim() || undefined,
    };
    onSave(updatedBookmark);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 backdrop-blur-[1px] z-[90]"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[80vh] shadow-2xl z-[91] flex flex-col rounded-lg border"
        style={{
          backgroundColor: themeStyles.bg,
          color: themeStyles.text,
          borderColor: themeStyles.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{
            borderBottomColor: themeStyles.border,
          }}
        >
          <h3 className="text-base font-semibold">{t('reader.editBookmark')}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10"
            style={{ color: themeStyles.subText }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 书签名称 */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: themeStyles.text }}>
              {t('reader.bookmarkName')} ({t('common.optional')})
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('reader.bookmarkNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{
                backgroundColor: themeStyles.inputBg,
                color: themeStyles.text,
                borderColor: themeStyles.border,
              }}
              maxLength={50}
            />
          </div>

          {/* 书签备注 */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: themeStyles.text }}>
              {t('reader.bookmarkNote')} ({t('common.optional')})
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('reader.bookmarkNotePlaceholder')}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{
                backgroundColor: themeStyles.inputBg,
                color: themeStyles.text,
                borderColor: themeStyles.border,
                minHeight: '100px',
              }}
              maxLength={200}
            />
          </div>

          {/* 位置信息（只读） */}
          <div className="pt-2 border-t" style={{ borderTopColor: themeStyles.border }}>
            <p className="text-xs mb-1" style={{ color: themeStyles.subText }}>
              {t('reader.position')}:
            </p>
            <p className="text-sm" style={{ color: themeStyles.text }}>
              {bookmark.position.currentPage
                ? t('reader.pageNumber', { page: bookmark.position.currentPage })
                : bookmark.position.progress !== undefined
                ? `${(bookmark.position.progress * 100).toFixed(1)}%`
                : t('reader.unknown')}
            </p>
            {bookmark.preview && (
              <p className="text-xs mt-2 italic" style={{ color: themeStyles.subText }}>
                "{bookmark.preview}"
              </p>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{
            borderTopColor: themeStyles.border,
          }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              color: themeStyles.subText,
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
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <Save className="w-4 h-4" />
            {t('common.save')}
          </button>
        </div>
      </div>
    </>
  );
}

