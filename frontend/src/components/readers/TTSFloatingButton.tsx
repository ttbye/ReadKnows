/**
 * @author ttbye
 * TTS 悬浮控制按钮
 * 可拖动，记住位置，点击显示播放面板
 */

import { Headphones } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';

interface TTSFloatingButtonProps {
  isVisible: boolean;
  onClick: () => void;
  theme?: 'light' | 'dark' | 'sepia' | 'green';
  containerRef?: MutableRefObject<HTMLDivElement | null>;
}

const STORAGE_KEY = 'tts-floating-button-position';

export default function TTSFloatingButton({
  isVisible,
  onClick,
  theme = 'light',
  containerRef,
}: TTSFloatingButtonProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = useState(false); // 标记是否真的移动了
  const buttonRef = useRef<HTMLDivElement>(null);

  // 获取阅读内容容器的边界
  const getContainerBounds = useCallback(() => {
    if (containerRef?.current) {
      const rect = containerRef.current.getBoundingClientRect();
      return {
        minX: rect.left,
        maxX: rect.right - 56, // 按钮宽度约56px
        minY: rect.top,
        maxY: rect.bottom - 56, // 按钮高度约56px
      };
    }
    // 如果没有容器引用，使用整个窗口
    return {
      minX: 0,
      maxX: window.innerWidth - 56,
      minY: 0,
      maxY: window.innerHeight - 56,
    };
  }, [containerRef]);

  // 从 localStorage 加载保存的位置
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const bounds = getContainerBounds();
      
      if (saved) {
        const { x, y } = JSON.parse(saved);
        // 验证位置是否在阅读内容容器内
        setPosition({
          x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
          y: Math.max(bounds.minY, Math.min(bounds.maxY, y)),
        });
      } else {
        // 默认位置：阅读内容容器右下角，留出安全区域
        const safeAreaBottom = parseInt(
          getComputedStyle(document.documentElement)
            .getPropertyValue('env(safe-area-inset-bottom)') || '0'
        ) || 0;
        setPosition({
          x: Math.max(bounds.minX, bounds.maxX - 16), // 距离右边16px
          y: Math.max(bounds.minY, bounds.maxY - 16 - safeAreaBottom), // 距离底部16px + 安全区域
        });
      }
    } catch (e) {
      console.warn('[TTSFloatingButton] 加载位置失败:', e);
      // 使用默认位置
      const bounds = getContainerBounds();
      const safeAreaBottom = parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue('env(safe-area-inset-bottom)') || '0'
      ) || 0;
      setPosition({
        x: Math.max(bounds.minX, bounds.maxX - 16),
        y: Math.max(bounds.minY, bounds.maxY - 16 - safeAreaBottom),
      });
    }
  }, [getContainerBounds]);

  // 保存位置到 localStorage
  const savePosition = useCallback((x: number, y: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
    } catch (e) {
      console.warn('[TTSFloatingButton] 保存位置失败:', e);
    }
  }, []);
  
  // 使用原生事件监听器来处理触摸事件，避免被动事件监听器问题
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    
    const handleNativeTouchStart = (e: TouchEvent) => {
      // 使用原生事件，可以设置 passive: false
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.touches[0];
      if (!touch) return;
      
      const rect = button.getBoundingClientRect();
      setDragOffset({
        x: touch.clientX - rect.left - rect.width / 2,
        y: touch.clientY - rect.top - rect.height / 2,
      });
      setIsDragging(true);
      setHasMoved(false);
    };
    
    // 使用 passive: false 来允许 preventDefault
    button.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    
    return () => {
      button.removeEventListener('touchstart', handleNativeTouchStart);
    };
  }, []);

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!buttonRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = buttonRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2,
    });
    setIsDragging(true);
    setHasMoved(false); // 重置移动标记
  }, []);

  // 处理触摸按下
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!buttonRef.current) return;
    
    // 尝试阻止默认行为，但如果事件是被动的则忽略错误
    try {
      if (e.cancelable !== false) {
        e.preventDefault();
      }
    } catch (err) {
      // 忽略被动事件监听器错误
    }
    e.stopPropagation();
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const rect = buttonRef.current.getBoundingClientRect();
    setDragOffset({
      x: touch.clientX - rect.left - rect.width / 2,
      y: touch.clientY - rect.top - rect.height / 2,
    });
    setIsDragging(true);
    setHasMoved(false); // 重置移动标记
  }, []);

  // 处理鼠标移动
  useEffect(() => {
    if (!isDragging) return;

    let lastPosition = { x: position.x, y: position.y };
    
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const bounds = getContainerBounds();
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // 限制在阅读内容容器内
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, newX));
      const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, newY));
      
      // 检查是否真的移动了（超过5px才算移动）
      const moved = Math.abs(clampedX - lastPosition.x) > 5 || Math.abs(clampedY - lastPosition.y) > 5;
      if (moved) {
        setHasMoved(true);
      }
      
      lastPosition = { x: clampedX, y: clampedY };
      setPosition({ x: clampedX, y: clampedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // 保存位置（使用最新的位置值）
      if (hasMoved && lastPosition.x !== 0 && lastPosition.y !== 0) {
        savePosition(lastPosition.x, lastPosition.y);
      }
      setHasMoved(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, savePosition, getContainerBounds, position]);

  // 处理触摸移动
  useEffect(() => {
    if (!isDragging) return;

    let lastPosition = { x: position.x, y: position.y };
    
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      
      const bounds = getContainerBounds();
      const newX = touch.clientX - dragOffset.x;
      const newY = touch.clientY - dragOffset.y;
      
      // 限制在阅读内容容器内
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, newX));
      const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, newY));
      
      // 检查是否真的移动了（超过5px才算移动）
      const moved = Math.abs(clampedX - lastPosition.x) > 5 || Math.abs(clampedY - lastPosition.y) > 5;
      if (moved) {
        setHasMoved(true);
      }
      
      lastPosition = { x: clampedX, y: clampedY };
      setPosition({ x: clampedX, y: clampedY });
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      // 保存位置（使用最新的位置值）
      if (hasMoved && lastPosition.x !== 0 && lastPosition.y !== 0) {
        savePosition(lastPosition.x, lastPosition.y);
      }
      setHasMoved(false);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragOffset, savePosition, getContainerBounds, position]);

  // 处理窗口大小变化，调整位置
  useEffect(() => {
    const handleResize = () => {
      if (!buttonRef.current) return;
      
      const bounds = getContainerBounds();
      
      setPosition(prev => ({
        x: Math.max(bounds.minX, Math.min(bounds.maxX, prev.x)),
        y: Math.max(bounds.minY, Math.min(bounds.maxY, prev.y)),
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getContainerBounds]);

  // 处理点击（非拖动时）
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 如果刚刚拖动过，不触发点击
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick();
  }, [hasMoved, onClick]);

  if (!isVisible) return null;

  const themeStyles = {
    light: { bg: 'rgba(255, 255, 255, 0.9)', text: '#000000', border: 'rgba(0, 0, 0, 0.1)' },
    dark: { bg: 'rgba(26, 26, 26, 0.9)', text: '#ffffff', border: 'rgba(255, 255, 255, 0.1)' },
    sepia: { bg: 'rgba(244, 228, 188, 0.9)', text: '#5c4b37', border: 'rgba(92, 75, 55, 0.1)' },
    green: { bg: 'rgba(200, 230, 201, 0.9)', text: '#2e7d32', border: 'rgba(46, 125, 50, 0.1)' },
  }[theme];

  // 计算相对于阅读容器的位置（如果容器存在）
  const getRelativePosition = () => {
    if (containerRef?.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      return {
        x: position.x - containerRect.left,
        y: position.y - containerRect.top,
      };
    }
    // 如果没有容器，使用绝对位置
    return { x: position.x, y: position.y };
  };

  const relativePos = getRelativePosition();
  const isInsideContainer = !!containerRef?.current;

  return (
    <div
      ref={buttonRef}
      className={isInsideContainer ? "absolute z-50 cursor-move active:cursor-grabbing select-none" : "fixed z-50 cursor-move active:cursor-grabbing select-none"}
      style={{
        left: `${relativePos.x}px`,
        top: `${relativePos.y}px`,
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        backgroundColor: themeStyles.bg,
        border: `2px solid ${themeStyles.border}`,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: isDragging ? 'none' : 'all 0.2s ease',
        transform: isDragging ? 'scale(1.1)' : 'scale(1)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      role="button"
      aria-label="显示语音朗读面板"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Headphones
        className="w-7 h-7"
        style={{
          color: themeStyles.text,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

