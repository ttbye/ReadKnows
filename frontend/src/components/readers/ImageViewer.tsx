/**
 * @author ttbye
 * 图片查看器组件
 * 支持放大、缩小、拖拽、滚轮缩放、触摸手势缩放
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ImageViewerProps {
  imageUrl: string;
  isVisible: boolean;
  onClose: () => void;
  alt?: string;
}

export default function ImageViewer({ imageUrl, isVisible, onClose, alt = '' }: ImageViewerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // 检测是否为移动设备（必须在早期返回之前调用）
  const [isMobile, setIsMobile] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  // 检测设备类型和PWA模式
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
      const isMobileDevice = mobileKeywords.some(keyword => userAgent.includes(keyword)) || window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
      
      // 检测PWA模式
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = (window.navigator as any).standalone === true; // iOS Safari
      setIsPWA(isStandalone || isFullscreen);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkDevice);
    
    return () => {
      window.removeEventListener('resize', checkDevice);
      mediaQuery.removeEventListener('change', checkDevice);
    };
  }, []);

  // 重置状态
  const resetTransform = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  // 关闭时重置
  useEffect(() => {
    if (!isVisible) {
      resetTransform();
      setImageLoaded(false);
    }
  }, [isVisible, resetTransform]);

  // 图片加载完成
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    resetTransform();
  }, [resetTransform]);

  // 缩放
  const handleZoom = useCallback((delta: number, centerX?: number, centerY?: number) => {
    setScale((prevScale) => {
      const newScale = Math.max(0.5, Math.min(5, prevScale + delta));
      
      // 如果指定了缩放中心点，调整位置以保持中心点不变
      if (centerX !== undefined && centerY !== undefined && containerRef.current) {
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const relativeX = centerX - rect.left - rect.width / 2;
        const relativeY = centerY - rect.top - rect.height / 2;
        
        setPosition((prevPos) => ({
          x: prevPos.x - (relativeX * (newScale - prevScale)) / prevScale,
          y: prevPos.y - (relativeY * (newScale - prevScale)) / prevScale,
        }));
      }
      
      return newScale;
    });
  }, []);

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta, e.clientX, e.clientY);
  }, [handleZoom]);

  // 触摸手势缩放
  const touchStateRef = useRef<{
    touches: Array<{ x: number; y: number }>;
    initialDistance: number;
    initialScale: number;
    initialPosition: { x: number; y: number };
  } | null>(null);

  const getTouchDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      // 单指拖拽
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    } else if (e.touches.length === 2) {
      // 双指缩放
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      touchStateRef.current = {
        touches: Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY })),
        initialDistance: distance,
        initialScale: scale,
        initialPosition: { ...position },
      };
      setIsDragging(false);
    }
  }, [position, scale]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      // 单指拖拽
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && touchStateRef.current) {
      // 双指缩放
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      const scaleRatio = distance / touchStateRef.current.initialDistance;
      const newScale = touchStateRef.current.initialScale * scaleRatio;
      setScale(Math.max(0.5, Math.min(5, newScale)));

      // 计算双指中心点
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      if (containerRef.current) {
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const relativeX = centerX - rect.left - rect.width / 2;
        const relativeY = centerY - rect.top - rect.height / 2;
        
        setPosition({
          x: touchStateRef.current.initialPosition.x - (relativeX * (newScale - touchStateRef.current.initialScale)) / touchStateRef.current.initialScale,
          y: touchStateRef.current.initialPosition.y - (relativeY * (newScale - touchStateRef.current.initialScale)) / touchStateRef.current.initialScale,
        });
      }
    }
  }, [isDragging, dragStart]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    touchStateRef.current = null;
  }, []);

  // 鼠标拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 双击重置或放大
  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(2);
      setPosition({ x: 0, y: 0 });
    } else {
      resetTransform();
    }
  }, [scale, resetTransform]);

  // 事件监听
  useEffect(() => {
    if (!isVisible) return;

    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isVisible, handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseMove, handleMouseUp]);

  // 键盘快捷键
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoom(0.1);
      } else if (e.key === '-') {
        handleZoom(-0.1);
      } else if (e.key === '0') {
        resetTransform();
      } else if (e.key === 'r' || e.key === 'R') {
        setRotation((prev) => (prev + 90) % 360);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onClose, handleZoom, resetTransform]);

  // 计算顶部安全区域
  const topSafeArea = isMobile || isPWA ? 'env(safe-area-inset-top, 0px)' : '0px';

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => {
        // 点击背景关闭
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{ 
        cursor: isDragging ? 'grabbing' : 'default',
        paddingTop: topSafeArea,
      }}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute z-[101] p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        style={{
          top: `calc(${topSafeArea} + 1rem)`,
          right: '1rem',
        }}
        title={t('common.close')}
      >
        <X className="w-6 h-6" />
      </button>

      {/* 工具栏 */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 z-[101] flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md"
        style={{
          top: `calc(${topSafeArea} + 1rem)`,
        }}
      >
        <button
          onClick={() => handleZoom(-0.1)}
          disabled={scale <= 0.5}
          className="p-2 rounded-full hover:bg-white/20 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('reader.zoomOut')}
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="px-3 text-white text-sm min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => handleZoom(0.1)}
          disabled={scale >= 5}
          className="p-2 rounded-full hover:bg-white/20 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('reader.zoomIn')}
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={() => setRotation((prev) => (prev + 90) % 360)}
          className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
          title={t('reader.rotate')}
        >
          <RotateCw className="w-5 h-5" />
        </button>
        <button
          onClick={resetTransform}
          className="px-3 py-1 text-white text-sm hover:bg-white/20 rounded transition-colors"
          title={t('reader.resetZoom')}
        >
          {t('reader.reset')}
        </button>
      </div>

      {/* 图片容器 */}
      <div
        className="relative max-w-full max-h-full overflow-hidden"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          transition: isDragging || touchStateRef.current ? 'none' : 'transform 0.1s ease-out',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
      >
        <img
          ref={imageRef}
          src={imageUrl}
          alt={alt}
          className="max-w-full max-h-[90vh] object-contain select-none"
          draggable={false}
          onLoad={handleImageLoad}
          style={{
            display: imageLoaded ? 'block' : 'none',
          }}
        />
        {!imageLoaded && (
          <div className="flex items-center justify-center w-64 h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        )}
      </div>

      {/* 提示信息 */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 z-[101] px-4 py-2 rounded-full bg-black/50 backdrop-blur-md text-white text-xs text-center"
        style={{
          bottom: isMobile || isPWA ? `calc(1rem + env(safe-area-inset-bottom, 0px))` : '1rem',
        }}
      >
        {t('reader.imageViewerHint')}
      </div>
    </div>
  );
}

