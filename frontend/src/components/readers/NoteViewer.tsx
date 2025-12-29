/**
 * @author ttbye
 * 笔记查看组件
 * 用于在阅读页面中显示笔记内容（点击笔记标记时弹出）
 */

import { X, StickyNote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReadingSettings } from '../../types/reader';

interface BookNote {
  id: string;
  content: string;
  position?: string;
  page_number?: number;
  chapter_index?: number;
  selected_text?: string;
  created_at: string;
  updated_at: string;
}

interface NoteViewerProps {
  note: BookNote | null;
  isVisible: boolean;
  onClose: () => void;
  theme?: ReadingSettings['theme'];
}

export default function NoteViewer({
  note,
  isVisible,
  onClose,
  theme = 'light',
}: NoteViewerProps) {
  const { t } = useTranslation();

  if (!isVisible || !note) return null;

  const themeStyles = {
    light: {
      bg: '#ffffff',
      text: '#111827',
      border: 'rgba(229,231,235,0.7)',
      subText: '#6b7280',
      quoteBg: 'rgba(219,234,254,0.85)',
      quoteText: '#4b5563',
      overlay: 'rgba(0,0,0,0.55)',
    },
    dark: {
      bg: '#111827',
      text: '#f9fafb',
      border: 'rgba(31,41,55,0.85)',
      subText: '#d1d5db',
      quoteBg: 'rgba(30,58,138,0.22)',
      quoteText: '#d1d5db',
      overlay: 'rgba(0,0,0,0.55)',
    },
    sepia: {
      bg: '#f4e4bc',
      text: '#5c4b37',
      border: 'rgba(212,196,156,0.9)',
      subText: 'rgba(92,75,55,0.75)',
      quoteBg: 'rgba(255,255,255,0.35)',
      quoteText: 'rgba(92,75,55,0.8)',
      overlay: 'rgba(0,0,0,0.45)',
    },
    green: {
      bg: '#c8e6c9',
      text: '#2e7d32',
      border: 'rgba(165,214,167,0.95)',
      subText: 'rgba(46,125,50,0.75)',
      quoteBg: 'rgba(255,255,255,0.35)',
      quoteText: 'rgba(46,125,50,0.8)',
      overlay: 'rgba(0,0,0,0.45)',
    },
  }[theme];

  return (
    <>
      <div
        className="fixed inset-0 backdrop-blur-[1px] z-[90]"
        style={{ backgroundColor: themeStyles.overlay }}
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
          <div className="flex items-center gap-2">
            <StickyNote className="w-5 h-5" style={{ color: themeStyles.text }} />
            <h3 className="text-base font-semibold">{t('notes.note')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10"
            style={{ color: themeStyles.subText }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 引用的文本 */}
          {note.selected_text && (
            <div
              className="p-3 rounded-lg text-sm italic border-l-4"
              style={{
                backgroundColor: themeStyles.quoteBg,
                color: themeStyles.quoteText,
                borderLeftColor: theme === 'dark' ? '#60a5fa' : '#2563eb',
              }}
            >
              <div className="font-medium mb-1 text-xs opacity-80">{t('notes.quote')}</div>
              <div className="whitespace-pre-wrap break-words">"{note.selected_text}"</div>
            </div>
          )}

          {/* 笔记内容 */}
          <div className="whitespace-pre-wrap break-words" style={{ color: themeStyles.text }}>
            {note.content}
          </div>

          {/* 元信息 */}
          <div className="text-xs pt-2 border-t" style={{ color: themeStyles.subText, borderTopColor: themeStyles.border }}>
            {note.page_number && (
              <div>
                {t('notes.pageNumber', { page: note.page_number })}
                {note.chapter_index !== undefined && ` · ${t('notes.chapterNumber', { chapter: note.chapter_index + 1 })}`}
              </div>
            )}
            <div className="mt-1">
              {new Date(note.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

