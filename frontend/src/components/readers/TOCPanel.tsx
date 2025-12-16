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
                className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  index === currentChapter ? 'bg-blue-100 dark:bg-blue-900' : ''
                }`}
                style={{ paddingLeft: `${level * 20 + 16}px` }}
              >
                <span className="text-sm">{item.title}</span>
              </button>
        {item.children?.map((child, childIndex) => renderTOCItem(child, childIndex, level + 1))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-end sm:items-center sm:justify-center">
      <div className="w-full sm:w-96 h-full sm:h-auto sm:max-h-[80vh] bg-white dark:bg-gray-800 rounded-t-lg sm:rounded-lg shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-semibold">目录</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {toc.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
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

