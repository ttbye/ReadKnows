/**
 * @author ttbye
 * 文本选择工具栏
 * 当用户选择文本时显示，提供添加笔记等功能
 */

import { BookOpen, Copy, Highlighter, Languages, Search, StickyNote, X, Bot, Sparkles, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TextSelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number };
  onAddNote: (text: string) => void;
  onToggleHighlight?: (color?: string) => void;
  isHighlighted?: boolean;
  onCopy?: () => void;
  onSearch?: () => void;
  onDictionary?: () => void;
  onTranslate?: () => void;
  onAI?: () => void;
  onShareExcerpt?: () => void;
  onClose: () => void;
}

export default function TextSelectionToolbar({
  selectedText,
  position,
  onAddNote,
  onToggleHighlight,
  isHighlighted,
  onCopy,
  onSearch,
  onDictionary,
  onTranslate,
  onAI,
  onShareExcerpt,
  onClose,
}: TextSelectionToolbarProps) {
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const colors = [
    { name: 'yellow', value: 'rgba(255, 235, 59, 0.65)', class: 'bg-[#FFEB3B]' },
    { name: 'green', value: 'rgba(139, 195, 74, 0.65)', class: 'bg-[#8BC34A]' },
    { name: 'blue', value: 'rgba(33, 150, 243, 0.65)', class: 'bg-[#2196F3]' },
    { name: 'pink', value: 'rgba(233, 30, 99, 0.65)', class: 'bg-[#E91E63]' },
  ];

  useEffect(() => {
    if (!toolbarRef.current) return;

    const toolbar = toolbarRef.current;
    const rect = toolbar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // position 作为“锚点”（选区附近的一个点），工具栏默认显示在锚点上方并留出间距，避免遮挡选中内容
    const GAP = 14;
    let x = position.x - rect.width / 2;
    let y = position.y - rect.height - GAP;

    // 水平方向调整：确保工具栏不超出视口
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }
    if (x < 10) {
      x = 10;
    }

    // 垂直方向：优先上方；如果上方放不下，则放到锚点下方
    if (y < 10) {
      y = position.y + GAP;
    }
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10;
    }

    setAdjustedPosition({ x, y });
  }, [position]);

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[90] rounded-lg border border-gray-200/70 dark:border-gray-700/60 bg-white/95 dark:bg-gray-900/90 shadow-md backdrop-blur-md flex items-center gap-1 px-1.5 py-1"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      onMouseDown={(e) => {
        // 防止点击工具栏导致选区立即丢失（尤其是移动端/PWA）
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {onCopy && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCopy();
          }}
          className="flex flex-col items-center justify-center w-10 h-10 rounded-md transition-colors bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:text-gray-100"
          title={t('reader.copy')}
        >
          <Copy className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.copy')}</span>
        </button>
      )}
      {onSearch && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSearch();
          }}
          className="flex flex-col items-center justify-center w-10 h-10 rounded-md transition-colors bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:text-gray-100"
          title={t('reader.search')}
        >
          <Search className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.search')}</span>
        </button>
      )}
      {onDictionary && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDictionary();
          }}
          className="flex flex-col items-center justify-center w-10 h-10 rounded-md transition-colors bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:text-gray-100"
          title={t('reader.dictionary')}
        >
          <BookOpen className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.dictionary')}</span>
        </button>
      )}
      {onTranslate && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTranslate();
          }}
          className="flex flex-col items-center justify-center w-10 h-10 rounded-md transition-colors bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:text-gray-100"
          title={t('reader.translate')}
        >
          <Languages className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.translate')}</span>
        </button>
      )}

      {onToggleHighlight && (
        <div className="relative flex items-center">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isHighlighted) {
                // 如果已高亮，直接触发取消
                onToggleHighlight();
              } else {
                // 如果未高亮，显示颜色选择
                setShowColorPicker(!showColorPicker);
              }
            }}
            className={`flex flex-col items-center justify-center w-11 h-10 rounded-md transition-colors ${
              isHighlighted
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:text-gray-100'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
            title={isHighlighted ? t('reader.removeHighlight') : t('reader.addHighlight')}
          >
            <Highlighter className="w-4 h-4" />
            <span className="mt-0.5 text-[9px] leading-none opacity-90">
              {isHighlighted ? t('reader.removeHighlightShort') : t('reader.highlight')}
            </span>
          </button>

          {showColorPicker && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {colors.map((color) => (
                <button
                  key={color.name}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleHighlight(color.value);
                    setShowColorPicker(false);
                  }}
                  className={`w-7 h-7 rounded-full ${color.class} border-2 border-transparent hover:border-gray-400 dark:hover:border-white transition-all transform hover:scale-110 shadow-sm`}
                  title={color.name}
                />
              ))}
              <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 rotate-45"></div>
            </div>
          )}
        </div>
      )}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddNote(selectedText);
        }}
        className="flex flex-col items-center justify-center w-11 h-10 rounded-md transition-colors bg-blue-600 hover:bg-blue-700 text-white"
        title={t('notes.createNote')}
      >
        <StickyNote className="w-4 h-4" />
        <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.notes')}</span>
      </button>
      {onAI && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAI();
          }}
          className="flex flex-col items-center justify-center w-11 h-10 rounded-md transition-colors bg-purple-600 hover:bg-purple-700 text-white"
          title={t('reader.ai.title')}
        >
          <Sparkles className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.ai.short')}</span>
        </button>
      )}
      {onShareExcerpt && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onShareExcerpt();
          }}
          className="flex flex-col items-center justify-center w-11 h-10 rounded-md transition-colors bg-green-600 hover:bg-green-700 text-white"
          title={t('reader.shareExcerpt')}
        >
          <Share2 className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">{t('reader.share')}</span>
        </button>
      )}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="flex flex-col items-center justify-center w-10 h-10 rounded-md transition-colors text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-800/60"
        title={t('common.close')}
      >
        <X className="w-4 h-4" />
        <span className="mt-0.5 text-[9px] leading-none opacity-80">{t('common.close')}</span>
      </button>
    </div>
  );
}

