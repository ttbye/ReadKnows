/**
 * @author ttbye
 * 文本选择工具栏
 * 当用户选择文本时显示，提供添加笔记等功能
 */

import { StickyNote, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TextSelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number };
  onAddNote: (text: string) => void;
  onClose: () => void;
}

export default function TextSelectionToolbar({
  selectedText,
  position,
  onAddNote,
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

    let x = position.x;
    let y = position.y;

    // 水平方向调整：确保工具栏不超出视口
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }
    if (x < 10) {
      x = 10;
    }

    // 垂直方向调整：如果工具栏在选中文本下方，且超出视口，则显示在上方
    if (y + rect.height > viewportHeight) {
      y = position.y - rect.height - 10;
    }
    if (y < 10) {
      y = 10;
    }

    setAdjustedPosition({ x, y });
  }, [position]);

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2 p-2"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      <button
        onClick={() => {
          onAddNote(selectedText);
          onClose();
        }}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-sm"
        title="添加笔记"
      >
        <StickyNote className="w-4 h-4" />
        添加笔记
      </button>
      <button
        onClick={onClose}
        className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded transition-colors"
        title="关闭"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

