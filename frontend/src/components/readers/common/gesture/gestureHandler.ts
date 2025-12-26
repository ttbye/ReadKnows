/**
 * 通用手势处理模块
 * 支持所有格式书籍（EPUB、PDF、TXT、DOCX、XLSX等）
 */

import type { ReadingSettings } from '../../../../types/reader';

export interface TouchState {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  time: number;
}

export interface TouchMoveState {
  maxMoveX: number;
  maxMoveY: number;
  lastX: number;
  lastY: number;
}

export interface GestureConfig {
  pageTurnMethod: ReadingSettings['pageTurnMethod'];
  pageTurnMode: ReadingSettings['pageTurnMode'];
  clickToTurn: boolean;
}

/**
 * 检测滑动方向
 */
export function detectSwipeDirection(
  touchStart: TouchState | null,
  touchMove: TouchMoveState,
  pageTurnMode: ReadingSettings['pageTurnMode']
): { isValid: boolean; direction?: 'prev' | 'next' } {
  if (!touchStart) {
    return { isValid: false };
  }

  const PRIMARY_THRESHOLD = 70;
  const DIRECTION_RATIO = 1.3;
  const DIRECTION_MIN = 40;

  const moveX = touchMove.maxMoveX;
  const moveY = touchMove.maxMoveY;
  const deltaX = touchMove.lastX - touchStart.clientX;
  const deltaY = touchMove.lastY - touchStart.clientY;

  if (pageTurnMode === 'horizontal') {
    if (moveX > PRIMARY_THRESHOLD && moveX > moveY * DIRECTION_RATIO) {
      // 修正方向：右→左 下一页；左→右 上一页
      if (deltaX > DIRECTION_MIN) return { isValid: true, direction: 'prev' };
      if (deltaX < -DIRECTION_MIN) return { isValid: true, direction: 'next' };
    }
  } else {
    if (moveY > PRIMARY_THRESHOLD && moveY > moveX * DIRECTION_RATIO) {
      if (deltaY < -DIRECTION_MIN) return { isValid: true, direction: 'next' };
      if (deltaY > DIRECTION_MIN) return { isValid: true, direction: 'prev' };
    }
  }

  return { isValid: false };
}

/**
 * 检查是否为有效点击（非滑动）
 */
export function isValidClick(
  touchStart: TouchState | null,
  touchMove: TouchMoveState,
  currentTime: number
): boolean {
  if (!touchStart) return false;

  const touchDuration = currentTime - touchStart.time;
  const moveDistance = Math.sqrt(
    Math.pow(touchMove.lastX - touchStart.clientX, 2) +
    Math.pow(touchMove.lastY - touchStart.clientY, 2)
  );

  // 检测误触条件：
  // 1. 触摸时间太短（< 80ms）- 可能是误触
  // 2. 触摸时间太长（> 800ms）- 可能是长按或选择文字
  // 3. 移动距离太大（> 15px）- 是移动而不是点击
  if (touchDuration < 80 || touchDuration > 800 || moveDistance > 15) {
    return false;
  }

  return true;
}

/**
 * 检查是否在中心区域（用于长按显示导航栏）
 */
export function isInCenterArea(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  const centerXStart = width * 0.3;
  const centerXEnd = width * 0.7;
  const centerYStart = height * 0.3;
  const centerYEnd = height * 0.7;

  return (
    x >= centerXStart &&
    x <= centerXEnd &&
    y >= centerYStart &&
    y <= centerYEnd
  );
}

/**
 * 获取点击方向（用于点击翻页）
 */
export function getClickDirection(
  x: number,
  y: number,
  width: number,
  height: number,
  pageTurnMode: ReadingSettings['pageTurnMode']
): 'prev' | 'next' {
  if (pageTurnMode === 'horizontal') {
    return x < width / 2 ? 'prev' : 'next';
  } else {
    return y < height / 2 ? 'prev' : 'next';
  }
}

/**
 * 创建手势处理器（用于 React 组件）
 */
export interface GestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

export interface GestureHandlerConfig {
  containerRef: React.RefObject<HTMLElement>;
  settings: GestureConfig;
  loading: boolean;
  onPageTurn: (direction: 'prev' | 'next') => void;
  onShowBars?: () => void;
  longPressThreshold?: number;
  debounceTime?: number;
}

/**
 * 创建手势处理器
 */
export function createGestureHandler(config: GestureHandlerConfig): GestureHandlers {
  const {
    containerRef,
    settings,
    loading,
    onPageTurn,
    onShowBars,
    longPressThreshold = 500,
    debounceTime = 300,
  } = config;

  // 状态管理
  let touchStart: TouchState | null = null;
  let touchMove: TouchMoveState = { maxMoveX: 0, maxMoveY: 0, lastX: 0, lastY: 0 };
  let mouseDown: { x: number; y: number; time: number } | null = null;
  let longPressTimer: NodeJS.Timeout | null = null;
  let lastPageTurnTime = 0;
  let isTurningPage = false;

  const clearLongPressTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const handlePageTurn = (direction: 'prev' | 'next') => {
    const now = Date.now();
    if (now - lastPageTurnTime < debounceTime) return;
    if (isTurningPage) return;

    isTurningPage = true;
    lastPageTurnTime = now;
    onPageTurn(direction);
    setTimeout(() => {
      isTurningPage = false;
    }, debounceTime);
  };

  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (loading) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const touch = e.touches[0];
      if (!touch) return;

      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;

      const isInCenter = isInCenterArea(x, y, width, height);

      touchStart = {
        x,
        y,
        clientX: touch.clientX,
        clientY: touch.clientY,
        time: Date.now(),
      };

      touchMove = {
        maxMoveX: 0,
        maxMoveY: 0,
        lastX: touch.clientX,
        lastY: touch.clientY,
      };

      // 移动端：在中心区域长按显示导航栏
      if (isInCenter && onShowBars) {
        longPressTimer = setTimeout(() => {
          onShowBars();
          if (navigator.vibrate) {
            navigator.vibrate(50);
          }
        }, longPressThreshold);
      }
    },

    onTouchMove: (e: React.TouchEvent) => {
      if (!touchStart) {
        clearLongPressTimer();
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const moveX = Math.abs(touch.clientX - touchStart.clientX);
      const moveY = Math.abs(touch.clientY - touchStart.clientY);
      const totalDistance = Math.sqrt(moveX * moveX + moveY * moveY);

      // 如果移动距离超过阈值，取消长按检测
      if (totalDistance > 10) {
        clearLongPressTimer();
      }

      touchMove.maxMoveX = Math.max(touchMove.maxMoveX, moveX);
      touchMove.maxMoveY = Math.max(touchMove.maxMoveY, moveY);
      touchMove.lastX = touch.clientX;
      touchMove.lastY = touch.clientY;

      // 滑动翻页：阻止默认行为
      if (settings.pageTurnMethod === 'swipe') {
        if (settings.pageTurnMode === 'horizontal') {
          if (moveX > 10 && moveX > moveY * 1.2) e.preventDefault();
        } else {
          if (moveY > 10 && moveY > moveX * 1.2) e.preventDefault();
        }
      }
    },

    onTouchEnd: (e: React.TouchEvent) => {
      clearLongPressTimer();

      if (loading) return;

      if (settings.pageTurnMethod === 'swipe') {
        const swipe = detectSwipeDirection(touchStart, touchMove, settings.pageTurnMode);
        touchStart = null;
        if (swipe.isValid && swipe.direction) {
          handlePageTurn(swipe.direction);
        }
      } else if (settings.pageTurnMethod === 'click' && settings.clickToTurn) {
        if (touchStart && isValidClick(touchStart, touchMove, Date.now())) {
          const rect = containerRef.current?.getBoundingClientRect();
          const touch = e.changedTouches[0];
          if (touch && rect) {
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const direction = getClickDirection(x, y, rect.width, rect.height, settings.pageTurnMode);
            handlePageTurn(direction);
          }
        }
      }

      touchStart = null;
    },

    onMouseDown: (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;

      const isInCenter = isInCenterArea(x, y, width, height);

      mouseDown = { x, y, time: Date.now() };

      // PC端：在中心区域长按显示导航栏
      if (isInCenter && onShowBars) {
        longPressTimer = setTimeout(() => {
          onShowBars();
        }, longPressThreshold);
      }
    },

    onMouseMove: (e: React.MouseEvent) => {
      if (mouseDown && longPressTimer) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        const deltaX = Math.abs(currentX - mouseDown.x);
        const deltaY = Math.abs(currentY - mouseDown.y);

        if (deltaX > 10 || deltaY > 10) {
          clearLongPressTimer();
        }
      }
    },

    onMouseUp: () => {
      clearLongPressTimer();
      mouseDown = null;
    },

    onClick: (e: React.MouseEvent) => {
      if (loading || settings.pageTurnMethod !== 'click' || !settings.clickToTurn) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const direction = getClickDirection(x, y, rect.width, rect.height, settings.pageTurnMode);
      handlePageTurn(direction);
    },
  };
}

