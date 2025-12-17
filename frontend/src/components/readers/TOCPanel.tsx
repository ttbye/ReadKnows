/**
 * @author ttbye
 * 目录面板组件
 */

import { X } from 'lucide-react';
import { TOCItem } from '../../types/reader';

interface TOCPanelProps {
  toc: TOCItem[];
  currentChapter: number;
  onClose: () => void;
  onChapterSelect: (index: number, href?: string) => void;
}

export default function TOCPanel({ toc, currentChapter, onClose, onChapterSelect }: TOCPanelProps) {
  const renderTOCItem = (item: TOCItem, index: number, level: number = 0) => {
    return (
      <div key={item.id || index}>
              <button
                onClick={() => onChapterSelect(index, item.href)}
                className={`w-full text-left px-4 py-2 hover:bg-gray-100/80 dark:hover:bg-gray-800/70 transition-colors ${
                  index === currentChapter ? 'bg-blue-100/80 dark:bg-blue-900/30' : ''
                }`}
                style={{ paddingLeft: `${level * 20 + 16}px` }}
              >
                <span className="text-sm text-gray-900 dark:text-gray-100">{item.title}</span>
              </button>
        {item.children?.map((child, childIndex) => renderTOCItem(child, childIndex, level + 1))}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex items-end sm:items-center sm:justify-center"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="w-full sm:w-96 h-full sm:h-auto sm:max-h-[80vh] bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col border border-gray-200/70 dark:border-gray-800/80 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70 dark:border-gray-800/80 bg-white/80 dark:bg-gray-900/70 backdrop-blur-md">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">目录</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100/80 dark:hover:bg-gray-800/70 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50/60 dark:bg-gray-950/20">
          {toc.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              暂无目录
            </div>
          ) : (
            <div className="py-2">
              {toc.map((item, index) => renderTOCItem(item, index))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

