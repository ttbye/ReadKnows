/**
 * @file EpubViewer.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useRef, useState } from 'react';
import { EpubViewer } from 'react-epub-viewer';
import type { Book } from 'epubjs';

interface EpubViewerProps {
  url: string;
  onLocationChange?: (location: any) => void;
  onReady?: (book: Book) => void;
  settings?: {
    fontSize?: number;
    fontFamily?: string;
    theme?: 'light' | 'dark' | 'sepia';
    width?: number;
    height?: number;
  };
}

export default function EpubViewerComponent({
  url,
  onLocationChange,
  onReady,
  settings = {},
}: EpubViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;

    try {
      // epubjs会自动处理图片路径
      const epubBook = new (window as any).ePub(url, {
        openAs: 'epub',
      });

      epubBook.ready.then(() => {
        setBook(epubBook);
        if (onReady) {
          onReady(epubBook);
        }
      });

      epubBook.on('relocated', (location: any) => {
        if (onLocationChange) {
          onLocationChange(location);
        }
      });

      return () => {
        if (epubBook) {
          epubBook.destroy();
        }
      };
    } catch (err: any) {
      console.error('加载EPUB失败:', err);
      setError(err.message || '加载EPUB失败');
    }
  }, [url]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>加载失败: {error}</p>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div 
      ref={viewerRef} 
      className="w-full h-full"
      style={{
        width: settings.width || '100%',
        height: settings.height || '100%',
      }}
    >
      <EpubViewer url={url} />
    </div>
  );
}

