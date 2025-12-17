/**
 * @author ttbye
 * 笔记创建模态框组件
 * 用于在阅读页面直接创建笔记，无需跳转
 */

import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

interface CreateNoteModalProps {
  isVisible: boolean;
  bookId: string;
  selectedText: string;
  selectedCfiRange?: string;
  currentPage: number;
  chapterIndex?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateNoteModal({
  isVisible,
  bookId,
  selectedText,
  selectedCfiRange,
  currentPage,
  chapterIndex,
  onClose,
  onSuccess,
}: CreateNoteModalProps) {
  const [noteContent, setNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 当模态框显示时，自动聚焦到输入框
  useEffect(() => {
    if (isVisible) {
      // 延迟一下，确保DOM已渲染
      setTimeout(() => {
        const textarea = document.querySelector('.note-content-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.focus();
        }
      }, 100);
    }
  }, [isVisible]);

  // 重置表单
  useEffect(() => {
    if (!isVisible) {
      setNoteContent('');
      setIsSubmitting(false);
    }
  }, [isVisible]);

  const handleSubmit = async () => {
    if (!noteContent.trim()) {
      toast.error('请输入笔记内容');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/notes', {
        bookId,
        content: noteContent,
        pageNumber: currentPage,
        chapterIndex: chapterIndex ?? 0,
        selectedText: selectedText || null,
      });
      toast.success('笔记创建成功');
      setNoteContent('');
      // 触发高亮（EPUB），仅本次会话内
      if (selectedCfiRange && (window as any).__epubHighlight) {
        try {
          (window as any).__epubHighlight(selectedCfiRange);
        } catch (e) {
          // ignore
        }
      }
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('创建笔记失败:', error);
      toast.error(error.response?.data?.error || '创建笔记失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter 快速保存
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    // ESC 关闭
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      // 遮罩背景改为不透明，避免“背景透出”影响阅读/对比度
      className="fixed inset-0 bg-black flex items-start justify-center z-[100] p-2 sm:p-4"
      onClick={(e) => {
        // 点击背景关闭
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        // 确保在移动端也能正确显示，考虑安全区域
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
      }}
    >
      <div 
        className="rounded-lg w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[90vh] flex flex-col shadow-xl bg-white dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          // 确保在移动端也能正确显示
          maxHeight: 'calc(100vh - max(env(safe-area-inset-top, 0px), 8px) - max(env(safe-area-inset-bottom, 0px), 8px) - 16px)',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">新建笔记</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-0">
          {/* 选中的文本引用 */}
          {selectedText && (
            <div className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs sm:text-sm text-gray-700 dark:text-gray-300 italic border-l-4 border-blue-500">
              <div className="font-medium text-blue-600 dark:text-blue-400 mb-1 text-xs">引用内容：</div>
              <div className="whitespace-pre-wrap break-words max-h-32 overflow-y-auto">"{selectedText}"</div>
            </div>
          )}

          {/* 笔记内容输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              笔记内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              className="note-content-textarea w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              placeholder="输入你的笔记内容..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={6}
              autoFocus
            />
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              提示：按 Ctrl/Cmd + Enter 快速保存，按 ESC 关闭
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !noteContent.trim()}
            className="px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

