import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface StickerItem {
  id: string;
  label: string;
  src: string;
}

interface StickerPack {
  id: string;
  name: string;
  stickers: StickerItem[];
}

interface StickerPickerProps {
  onSelect: (sticker: StickerItem) => void;
}

const STICKER_PACK_KEYS: Record<string, string> = { classic: 'stickerCategoryClassic' };
const STICKER_KEYS: Record<string, string> = { happy: 'stickerHappy', love: 'stickerLove', wow: 'stickerWow', cool: 'stickerCool', sad: 'stickerSad', angry: 'stickerAngry' };

const STICKER_PACKS: StickerPack[] = [
  {
    id: 'classic',
    name: 'classic',
    stickers: [
      { id: 'happy', label: 'happy', src: '/stickers/classic/happy.svg' },
      { id: 'love', label: 'love', src: '/stickers/classic/love.svg' },
      { id: 'wow', label: 'wow', src: '/stickers/classic/wow.svg' },
      { id: 'cool', label: 'cool', src: '/stickers/classic/cool.svg' },
      { id: 'sad', label: 'sad', src: '/stickers/classic/sad.svg' },
      { id: 'angry', label: 'angry', src: '/stickers/classic/angry.svg' },
    ],
  },
];

export const StickerPicker: React.FC<StickerPickerProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const [activePackId, setActivePackId] = useState<string>(STICKER_PACKS[0].id);
  const activePack = STICKER_PACKS.find(pack => pack.id === activePackId) || STICKER_PACKS[0];

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {STICKER_PACKS.map(pack => (
          <button
            key={pack.id}
            onClick={() => setActivePackId(pack.id)}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
              activePackId === pack.id
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {t(`messages.${STICKER_PACK_KEYS[pack.id] || pack.id}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
        {activePack.stickers.map(sticker => (
          <button
            key={sticker.id}
            onClick={() => onSelect(sticker)}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={t(`messages.${STICKER_KEYS[sticker.id] || sticker.id}`)}
          >
            <img 
              src={sticker.src} 
              alt={t(`messages.${STICKER_KEYS[sticker.id] || sticker.id}`)} 
              className="w-16 h-16 object-contain"
              onError={(e) => {
                // 如果图片加载失败，显示占位符
                const target = e.target as HTMLImageElement;
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0zMiAyMEMyNS4zNzI2IDIwIDIwIDI1LjM3MjYgMjAgMzJDMjAgMzguNjI3NCAyNS4zNzI2IDQ0IDMyIDQ0QzM4LjYyNzQgNDQgNDQgMzguNjI3NCA0NCAzMkM0NCAyNS4zNzI2IDM4LjYyNzQgMjAgMzIgMjBaIiBmaWxsPSIjOUI5QkE1Ii8+Cjwvc3ZnPgo=';
                console.warn('[StickerPicker] 图片加载失败:', sticker.src);
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
