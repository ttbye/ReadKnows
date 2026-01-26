import { useCallback, useEffect, useRef, useState } from 'react';

export type SelectionPosition = { x: number; y: number } | null;

export function useTextSelection(params?: {
  minTextLength?: number;
  onViewImage?: (imageUrl: string) => void;
}) {
  const minTextLength = params?.minTextLength ?? 2;
  const onViewImage = params?.onViewImage;

  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition>(null);
  const [selectedCfiRange, setSelectedCfiRange] = useState<string | null>(null);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);

  const lastEpubSelectionAtRef = useRef<number>(0);
  const mouseUpTimerRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    setShowSelectionToolbar(false);
    setSelectionPosition(null);
    setSelectedCfiRange(null);
    setSelectedText('');

    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // ignore
    }
    try {
      // EPUB iframe 内选择清理（由 ReaderEPUBPro 提供）
      const fn = window.__epubClearSelection;
      if (typeof fn === 'function') fn();
    } catch {
      // ignore
    }
  }, []);

  // 文本选择：统一管理外层与 EPUB iframe 上报
  useEffect(() => {
    const handleMouseUp = () => {
      // 如果刚刚由 EPUB iframe 上报过选区，则忽略一小段时间内的外层 mouseup，
      // 避免外层 window.getSelection() 为空把工具栏立刻关掉，导致"点不到按钮/弹窗不出"。
      const timeSinceEpubSelection = Date.now() - lastEpubSelectionAtRef.current;
      if (timeSinceEpubSelection < 200) return;

      if (mouseUpTimerRef.current) {
        window.clearTimeout(mouseUpTimerRef.current);
        mouseUpTimerRef.current = null;
      }

      // 延迟一小段时间再检查，给 selectionchange 事件时间触发
      mouseUpTimerRef.current = window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          if (Date.now() - lastEpubSelectionAtRef.current < 200) return;
          setShowSelectionToolbar(false);
          setSelectionPosition(null);
          setSelectedCfiRange(null);
          return;
        }

        const text = selection.toString().trim();
        if (!text || text.length < minTextLength) {
          setShowSelectionToolbar(false);
          setSelectionPosition(null);
          setSelectedCfiRange(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // 验证选区矩形是否有效
        if (!rect || (rect.width < 2 && rect.height < 8)) {
          setShowSelectionToolbar(false);
          return;
        }

        setSelectedText(text);
        setSelectionPosition({
          x: rect.left + rect.width / 2,
          // 作为"锚点"：交给工具栏自己决定显示在上方还是下方
          y: rect.top,
        });
        setShowSelectionToolbar(true);
      }, 50);
    };

    // EPUB iframe 内选区：由 ReaderEPUBPro 通过自定义事件上报
    const handleEpubSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string; x: number; y: number; cfiRange?: string | null };
      const t = (detail?.text || '').toString().trim();
      if (!t || t.length < minTextLength) {
        setShowSelectionToolbar(false);
        return;
      }
      const now = Date.now();
      lastEpubSelectionAtRef.current = now;
      // 记录选择完成时间，供点击翻页逻辑使用（避免在选择刚完成时立即清除）
      window.__lastEpubSelectionTime = now;

      setSelectedText(t);
      setSelectionPosition({ x: detail.x, y: detail.y });
      setSelectedCfiRange(detail.cfiRange || null);
      setShowSelectionToolbar(true);
    };

    // 翻页事件：翻页时自动隐藏工具条并清空选择
    const handlePageTurnEvent = () => {
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // ignore
      }
      setShowSelectionToolbar(false);
      setSelectionPosition(null);
      setSelectedCfiRange(null);
    };

    // 图片查看事件：转交给容器处理
    const handleImageView = (e: Event) => {
      if (!onViewImage) return;
      const detail = (e as CustomEvent).detail as { imageUrl?: string };
      if (detail?.imageUrl) onViewImage(detail.imageUrl);
    };

    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('__reader_text_selection' as any, handleEpubSelection);
    window.addEventListener('__reader_page_turn' as any, handlePageTurnEvent);
    window.addEventListener('__reader_view_image' as any, handleImageView);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('__reader_text_selection' as any, handleEpubSelection);
      window.removeEventListener('__reader_page_turn' as any, handlePageTurnEvent);
      window.removeEventListener('__reader_view_image' as any, handleImageView);
      if (mouseUpTimerRef.current) {
        window.clearTimeout(mouseUpTimerRef.current);
        mouseUpTimerRef.current = null;
      }
    };
  }, [minTextLength, onViewImage]);

  return {
    selectedText,
    setSelectedText,
    selectionPosition,
    setSelectionPosition,
    selectedCfiRange,
    setSelectedCfiRange,
    showSelectionToolbar,
    setShowSelectionToolbar,
    clearSelection,
  };
}

