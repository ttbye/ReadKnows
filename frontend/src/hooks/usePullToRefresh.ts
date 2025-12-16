/**
 * @file usePullToRefresh.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxDistance?: number;
  topAreaHeight?: number; // 顶部区域高度，只有从这个区域下拉才触发刷新
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  maxDistance = 120,
  topAreaHeight = 120, // 默认120px，覆盖顶部导航栏区域
}: UsePullToRefreshOptions) => {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const startClientY = useRef(0); // 触摸开始的屏幕Y坐标
  const scrollContainer = useRef<HTMLElement | null>(null);
  const isValidStart = useRef(false); // 是否从有效区域开始

  useEffect(() => {
    // 检测PWA模式
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true ||
                  document.referrer.includes('android-app://');
    
    // 获取滚动位置的辅助函数（兼容多种情况）
    const getScrollTop = () => {
      if (isPWA) {
        // PWA模式下，优先检查window和documentElement
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      }
      // 非PWA模式，检查容器
      const container = scrollContainer.current;
      if (container) {
        return container.scrollTop || window.scrollY || 0;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    };
    
    // 找到可滚动的容器
    let container = document.querySelector('main') as HTMLElement;
    
    // 在PWA模式下，优先使用document或window作为事件监听目标
    // 但保留container引用用于检查滚动位置
    if (isPWA) {
      // 检查main元素是否真的在滚动
      if (container) {
        const mainScrollTop = container.scrollTop || 0;
        const windowScrollTop = window.scrollY || 0;
        // 如果main元素不可滚动或滚动位置为0，使用document
        if (container.scrollHeight <= container.clientHeight || mainScrollTop === 0) {
          // 在PWA模式下，通常滚动发生在window/documentElement上
          container = document.documentElement;
        }
      } else {
        container = document.documentElement;
      }
    }
    
    if (!container) {
      console.warn('[下拉刷新] 未找到可滚动的容器');
      return;
    }
    
    scrollContainer.current = container;
    
    let touchStartY = 0;
    let currentPullDistance = 0;

    const handleTouchStart = (e: TouchEvent) => {
      // 重置状态
      isValidStart.current = false;
      
      // 检查是否滚动到顶部（使用统一的getScrollTop函数）
      const scrollTop = getScrollTop();
      if (scrollTop > 5) { // 允许5px的误差
        return;
      }
      
      // 检查是否从页面顶部开始（包括PWA模式）
      const touch = e.touches[0];
      if (!touch) return;
      
      const clientY = touch.clientY; // 触摸点在屏幕上的Y坐标
      
      // 获取安全区域高度
      const safeAreaTop = parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue('env(safe-area-inset-top)') || '0',
        10
      ) || 0;
      
      // 顶部导航栏高度（约44px，PWA模式下可能更高）
      const headerHeight = isPWA ? 56 : 44;
      
      // 计算顶部区域总高度（安全区域 + 导航栏 + 缓冲区域）
      // 在PWA模式下，增加缓冲区域以确保能触发
      const bufferArea = isPWA ? 100 : 30; // PWA模式下增加缓冲区域
      const totalTopHeight = safeAreaTop + headerHeight + bufferArea;
      
      // 使用配置的topAreaHeight或计算出的值，取较大者
      const effectiveTopArea = Math.max(totalTopHeight, topAreaHeight);
      
      // 检查是否从顶部区域开始
      if (clientY <= effectiveTopArea) {
        touchStartY = touch.clientY;
        startY.current = touchStartY;
        startClientY.current = clientY;
        isValidStart.current = true;
        console.log('[下拉刷新] 触摸开始，位置:', { 
          clientY, 
          effectiveTopArea, 
          scrollTop,
          isPWA,
          bufferArea,
          container: container.tagName,
          windowScrollY: window.scrollY,
          docScrollTop: document.documentElement.scrollTop
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshing || !isValidStart.current) return;
      
      const currentY = e.touches[0]?.clientY;
      if (currentY === undefined) return;
      
      const diff = currentY - startY.current;
      const scrollTop = getScrollTop();

      // 只有向下拉且在顶部时才处理
      if (diff > 0 && scrollTop <= 5) { // 允许5px的误差
        // 阻止默认的滚动行为（在PWA模式下特别重要）
        e.preventDefault();
        e.stopPropagation();
        
        // 计算拉动距离，使用阻尼效果
        currentPullDistance = Math.min(diff * 0.5, maxDistance);
        setPullDistance(currentPullDistance);
        setIsPulling(true);
        console.log('[下拉刷新] 拉动中:', { 
          diff, 
          currentPullDistance, 
          scrollTop, 
          isPWA,
          windowScrollY: window.scrollY 
        });
      } else if (diff <= 0 || scrollTop > 5) {
        // 如果向上滑动或页面已滚动，取消下拉刷新
        setPullDistance(0);
        setIsPulling(false);
        isValidStart.current = false;
      }
    };

    const handleTouchEnd = async () => {
      // 如果不是从有效区域开始的，直接返回
      if (!isValidStart.current) {
        setPullDistance(0);
        setIsPulling(false);
        isValidStart.current = false;
        return;
      }
      
      if (!isPulling || isRefreshing) {
        setPullDistance(0);
        setIsPulling(false);
        isValidStart.current = false;
        return;
      }

      // 如果拉动距离超过阈值，触发刷新
      if (currentPullDistance >= threshold) {
        setIsRefreshing(true);
        setPullDistance(threshold); // 固定在阈值位置
        
        try {
          await onRefresh();
        } catch (error) {
          console.error('刷新失败:', error);
        } finally {
          // 刷新完成后的动画
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
            setIsPulling(false);
            isValidStart.current = false;
          }, 300);
        }
      } else {
        // 没有达到阈值，回弹
        setPullDistance(0);
        setIsPulling(false);
        isValidStart.current = false;
      }
      
      currentPullDistance = 0;
    };

    // 在PWA模式下，优先监听document和window的touch事件（确保能捕获到）
    // 非PWA模式下，监听容器的touch事件
    if (isPWA) {
      // PWA模式下，优先使用document作为事件目标
      document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
      
      // 也监听window（某些情况下可能需要）
      window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    } else {
      // 非PWA模式，监听容器
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    return () => {
      if (isPWA) {
        document.removeEventListener('touchstart', handleTouchStart, { capture: true } as any);
        document.removeEventListener('touchmove', handleTouchMove, { capture: true } as any);
        document.removeEventListener('touchend', handleTouchEnd, { capture: true } as any);
        window.removeEventListener('touchstart', handleTouchStart, { capture: true } as any);
        window.removeEventListener('touchmove', handleTouchMove, { capture: true } as any);
        window.removeEventListener('touchend', handleTouchEnd, { capture: true } as any);
      } else {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isPulling, isRefreshing, threshold, maxDistance, topAreaHeight, onRefresh]);

  return {
    isPulling,
    isRefreshing,
    pullDistance,
  };
};

