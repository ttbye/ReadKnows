import { useEffect } from 'react';

export function useReaderShortcuts(params: {
  onPageTurn: (direction: 'prev' | 'next') => void;
  enabled?: boolean;
}) {
  const { onPageTurn, enabled = true } = params;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果阅读器内部已处理（格式阅读器会标记），则跳过，避免重复翻页
      if ((e as any).__readerHandled) return;

      // 如果焦点在输入框/文本域，跳过
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target?.isContentEditable ?? false)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onPageTurn('prev');
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onPageTurn('next');
      } else if (e.key === ' ') {
        // 空格键：向下翻页
        e.preventDefault();
        onPageTurn('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onPageTurn]);
}

