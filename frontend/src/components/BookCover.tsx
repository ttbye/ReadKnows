/**
 * @file BookCover.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState } from 'react';
import { Book } from 'lucide-react';
import { getCoverUrl } from '../utils/coverHelper';

interface BookCoverProps {
  coverUrl?: string | null;
  title: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function BookCover({ coverUrl, title, className = '', size = 'md' }: BookCoverProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };

  const handleImageError = () => {
    console.error('[BookCover] 图片加载失败:', coverUrl);
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  // 使用coverHelper处理封面URL（支持中文路径）
  const finalCoverUrl = getCoverUrl(coverUrl);

  if (imageError || !finalCoverUrl) {
    return (
      <div className={`${sizeClasses[size]} ${className} bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md`}>
        <Book className={`${size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-8 h-8' : 'w-6 h-6'} text-white opacity-80`} />
      </div>
    );
  }

  return (
    <div className={`relative ${className} overflow-hidden rounded-lg shadow-md`}>
      {imageLoading && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse flex items-center justify-center">
          <Book className={`${sizeClasses[size]} text-gray-400`} />
        </div>
      )}
      <img
        src={finalCoverUrl}
        alt={title}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          imageLoading ? 'opacity-0' : 'opacity-100'
        }`}
        onError={handleImageError}
        onLoad={handleImageLoad}
        loading="lazy"
      />
    </div>
  );
}

