/**
 * @author ttbye
 * 文本选择工具栏
 * 当用户选择文本时显示，提供添加笔记等功能
 */

import { BookOpen, Copy, Highlighter, Languages, Search, StickyNote, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TextSelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number };
  onAddNote: (text: string) => void;
  onToggleHighlight?: () => void;
  isHighlighted?: boolean;
  onCopy?: () => void;
  onSearch?: () => void;
  onDictionary?: () => void;
  onTranslate?: () => void;
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
  onClose,
}: TextSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

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
          title="复制"
        >
          <Copy className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">复制</span>
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
          title="百度搜索"
        >
          <Search className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">搜索</span>
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
          title="词典"
        >
          <BookOpen className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">词典</span>
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
          title="翻译"
        >
          <Languages className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">翻译</span>
        </button>
      )}

      {onToggleHighlight && (
        <button
          onPointerDown={(e) => {
            // 用 pointerdown 触发，避免移动端/PWA click 被选区/手势吞掉
            e.preventDefault();
            e.stopPropagation();
            onToggleHighlight();
          }}
          className={`flex flex-col items-center justify-center w-11 h-10 rounded-md transition-colors ${
            isHighlighted
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:text-gray-100'
              : 'bg-amber-500 hover:bg-amber-600 text-white'
          }`}
          title={isHighlighted ? '取消高亮' : '高亮标注'}
        >
          <Highlighter className="w-4 h-4" />
          <span className="mt-0.5 text-[9px] leading-none opacity-90">
            {isHighlighted ? '取消' : '高亮'}
          </span>
        </button>
      )}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddNote(selectedText);
        }}
        className="flex flex-col items-center justify-center w-11 h-10 rounded-md transition-colors bg-blue-600 hover:bg-blue-700 text-white"
        title="新建笔记"
      >
        <StickyNote className="w-4 h-4" />
        <span className="mt-0.5 text-[9px] leading-none opacity-90">笔记</span>
      </button>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="flex flex-col items-center justify-center w-10 h-10 rounded-md transition-colors text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-800/60"
        title="关闭"
      >
        <X className="w-4 h-4" />
        <span className="mt-0.5 text-[9px] leading-none opacity-80">关闭</span>
      </button>
    </div>
  );
}

