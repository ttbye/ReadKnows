/**
 * @author ttbye
 * 手势处理类 - 提供原生级别的触摸和手势体验
 * 支持惯性滚动、防误触、多点触控、边缘检测、振动反馈等功能
 */

export interface GestureConfig {
  // 基础配置
  swipeThreshold: number; // 滑动阈值（像素）
  swipeVelocityThreshold: number; // 滑动速度阈值
  longPressThreshold: number; // 长按阈值（毫秒）
  tapThreshold: number; // 点击阈值（像素）
  
  // 惯性滚动配置
  inertiaDeceleration: number; // 惯性减速度
  overscrollDamping: number; // 回弹阻尼
  animationDuration: number; // 动画时长（毫秒）
  
  // 防误触配置
  minTouchDuration: number; // 最小触摸时长（毫秒）
  maxTouchDuration: number; // 最大触摸时长（毫秒）
  maxMoveDistance: number; // 最大移动距离（像素）
  
  // 方向检测配置
  directionRatio: number; // 方向比例阈值
  directionMin: number; // 方向判定最小距离（像素）
  
  // 多点触控配置
  pinchZoomThreshold: number; // 捏合缩放阈值
  rotationThreshold: number; // 旋转阈值（度）
  
  // 边缘检测配置
  edgeThreshold: number; // 边缘阈值（像素）
  
  // 性能配置
  usePassiveListeners: boolean; // 使用被动监听器
  debounceTime: number; // 防抖时间（毫秒）
}

export interface TouchData {
  id: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  time: number;
  velocityX: number;
  velocityY: number;
}

export type GestureType = 'tap' | 'swipe' | 'long-press' | 'pinch' | 'rotate' | 'drag' | 'none';
export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | 'none';
export type PageTurnDirection = 'prev' | 'next';

export interface GestureCallbacks {
  onTap?: (x: number, y: number) => void;
  onSwipe?: (direction: SwipeDirection, distance: number, velocity: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onPageTurn?: (direction: PageTurnDirection) => void;
  onPinchZoom?: (scale: number, centerX: number, centerY: number) => void;
  onRotate?: (angle: number, centerX: number, centerY: number) => void;
  onDrag?: (deltaX: number, deltaY: number) => void;
  onEdgeReached?: (edge: 'top' | 'bottom' | 'left' | 'right') => void;
  onShowNavigation?: () => void;
}

export class GestureHandler {
  private container: HTMLElement;
  private config: GestureConfig;
  private callbacks: GestureCallbacks;
  
  // 触摸状态
  private touches: Map<number, TouchData> = new Map();
  private touchStartRef: { x: number; y: number; clientX: number; clientY: number; time: number } | null = null;
  private touchMoveRef: { maxMoveX: number; maxMoveY: number; lastX: number; lastY: number } = {
    maxMoveX: 0,
    maxMoveY: 0,
    lastX: 0,
    lastY: 0,
  };
  
  // 速度计算
  private velocity = { x: 0, y: 0 };
  private lastTouchTime = 0;
  private lastTouchPosition = { x: 0, y: 0 };
  
  // 长按相关
  private longPressTimer: NodeJS.Timeout | null = null;
  private longPressTriggered = false;
  
  // 动画相关
  private animationId: number | null = null;
  private isAnimating = false;
  
  // 多点触控相关
  private pinchStartDistance = 0;
  private pinchStartScale = 1;
  private rotationStartAngle = 0;
  
  // 页面设置
  private pageTurnMethod: 'swipe' | 'click' = 'swipe';
  private pageTurnMode: 'horizontal' | 'vertical' = 'horizontal';
  private clickToTurn = true;
  
  // 边界检测
  private isAtPageBoundary: (direction: PageTurnDirection) => boolean = () => false;
  
  constructor(
    container: HTMLElement,
    callbacks: GestureCallbacks,
    config?: Partial<GestureConfig>
  ) {
    this.container = container;
    this.callbacks = callbacks;
    
    // 默认配置
    this.config = {
      swipeThreshold: 70,
      swipeVelocityThreshold: 0.3,
      longPressThreshold: 500,
      tapThreshold: 10,
      inertiaDeceleration: 0.003,
      overscrollDamping: 0.05,
      animationDuration: 300,
      minTouchDuration: 80,
      maxTouchDuration: 800,
      maxMoveDistance: 15,
      directionRatio: 1.3,
      directionMin: 40,
      pinchZoomThreshold: 10,
      rotationThreshold: 5,
      edgeThreshold: 50,
      usePassiveListeners: true,
      debounceTime: 300,
      ...config,
    };
    
    this.init();
  }
  
  /**
   * 初始化事件监听器
   */
  private init() {
    const options: AddEventListenerOptions = {
      passive: this.config.usePassiveListeners,
      capture: false,
    };
    
    // Touch 事件
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), options);
    this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd.bind(this), options);
    this.container.addEventListener('touchcancel', this.handleTouchCancel.bind(this), options);
    
    // Pointer 事件（更好的跨平台支持）
    this.container.addEventListener('pointerdown', this.handlePointerDown.bind(this), options);
    this.container.addEventListener('pointermove', this.handlePointerMove.bind(this), { passive: false });
    this.container.addEventListener('pointerup', this.handlePointerUp.bind(this), options);
    this.container.addEventListener('pointercancel', this.handlePointerCancel.bind(this), options);
    
    // 鼠标事件（PC端）
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.container.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.container.addEventListener('click', this.handleClick.bind(this));
    this.container.addEventListener('contextmenu', this.handleContextMenu.bind(this));
  }
  
  /**
   * 更新页面设置
   */
  public updateSettings(settings: {
    pageTurnMethod?: 'swipe' | 'click';
    pageTurnMode?: 'horizontal' | 'vertical';
    clickToTurn?: boolean;
    isAtPageBoundary?: (direction: PageTurnDirection) => boolean;
  }) {
    if (settings.pageTurnMethod !== undefined) {
      this.pageTurnMethod = settings.pageTurnMethod;
    }
    if (settings.pageTurnMode !== undefined) {
      this.pageTurnMode = settings.pageTurnMode;
    }
    if (settings.clickToTurn !== undefined) {
      this.clickToTurn = settings.clickToTurn;
    }
    if (settings.isAtPageBoundary !== undefined) {
      this.isAtPageBoundary = settings.isAtPageBoundary;
    }
  }
  
  /**
   * 检查是否在可交互元素上
   */
  private isInSelectableArea(x: number, y: number): boolean {
    const selectableElements = this.container.querySelectorAll(
      'a, button, input, textarea, [contenteditable], [role="button"], [role="link"]'
    );
    
    for (const element of selectableElements) {
      const rect = element.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 检查是否在边缘区域
   */
  private isAtEdge(x: number, y: number): 'top' | 'bottom' | 'left' | 'right' | null {
    const rect = this.container.getBoundingClientRect();
    const relativeX = x - rect.left;
    const relativeY = y - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    if (relativeX < this.config.edgeThreshold) return 'left';
    if (relativeX > width - this.config.edgeThreshold) return 'right';
    if (relativeY < this.config.edgeThreshold) return 'top';
    if (relativeY > height - this.config.edgeThreshold) return 'bottom';
    
    return null;
  }
  
  /**
   * 提供触觉反馈
   */
  private provideHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'medium') {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 50,
        heavy: 100,
      };
      navigator.vibrate(patterns[type]);
    }
    
    // 添加视觉反馈
    this.container.classList.add('haptic-feedback');
    setTimeout(() => {
      this.container.classList.remove('haptic-feedback');
    }, 100);
  }
  
  /**
   * 计算速度
   */
  private calculateVelocity(currentX: number, currentY: number, time: number): { x: number; y: number } {
    if (this.lastTouchTime === 0) {
      this.lastTouchTime = time;
      this.lastTouchPosition = { x: currentX, y: currentY };
      return { x: 0, y: 0 };
    }
    
    const deltaTime = time - this.lastTouchTime;
    if (deltaTime === 0) return this.velocity;
    
    const deltaX = currentX - this.lastTouchPosition.x;
    const deltaY = currentY - this.lastTouchPosition.y;
    
    this.velocity = {
      x: deltaX / deltaTime,
      y: deltaY / deltaTime,
    };
    
    this.lastTouchTime = time;
    this.lastTouchPosition = { x: currentX, y: currentY };
    
    return this.velocity;
  }
  
  /**
   * 检测手势类型
   */
  private detectGestureType(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number
  ): GestureType {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (duration > this.config.longPressThreshold) {
      return 'long-press';
    } else if (distance < this.config.tapThreshold) {
      return 'tap';
    } else if (Math.abs(deltaX) > Math.abs(deltaY) * this.config.directionRatio) {
      return 'swipe';
    } else if (Math.abs(deltaY) > Math.abs(deltaX) * this.config.directionRatio) {
      return 'swipe';
    } else {
      return 'drag';
    }
  }
  
  /**
   * 检测滑动方向
   */
  private detectSwipeDirection(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): SwipeDirection {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    
    if (absDeltaX > absDeltaY * this.config.directionRatio) {
      return deltaX > 0 ? 'right' : 'left';
    } else if (absDeltaY > absDeltaX * this.config.directionRatio) {
      return deltaY > 0 ? 'down' : 'up';
    }
    
    return 'none';
  }
  
  /**
   * 处理多点触控
   */
  private handleMultiTouch(e: TouchEvent | PointerEvent): boolean {
    const touches = 'touches' in e ? e.touches : [];
    
    if (touches.length === 2) {
      e.preventDefault();
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      
      // 计算两指距离
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // 计算两指中心点
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      // 计算旋转角度
      const angle = Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      ) * (180 / Math.PI);
      
      if (this.pinchStartDistance === 0) {
        this.pinchStartDistance = distance;
        this.rotationStartAngle = angle;
      } else {
        const scale = distance / this.pinchStartDistance;
        const rotation = angle - this.rotationStartAngle;
        
        if (Math.abs(scale - 1) > this.config.pinchZoomThreshold / 100) {
          this.callbacks.onPinchZoom?.(scale, centerX, centerY);
        }
        
        if (Math.abs(rotation) > this.config.rotationThreshold) {
          this.callbacks.onRotate?.(rotation, centerX, centerY);
        }
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * 处理惯性滚动
   */
  private handleInertiaScroll() {
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
    
    if (speed > this.config.swipeVelocityThreshold) {
      const direction = this.getInertiaDirection();
      if (direction) {
        this.animatePageTurn(direction);
      }
    }
  }
  
  /**
   * 获取惯性方向
   */
  private getInertiaDirection(): PageTurnDirection | null {
    if (!this.touchStartRef) return null;
    
    const absVelX = Math.abs(this.velocity.x);
    const absVelY = Math.abs(this.velocity.y);
    
    if (this.pageTurnMode === 'horizontal') {
      if (absVelX > absVelY * this.config.directionRatio) {
        return this.velocity.x > 0 ? 'next' : 'prev';
      }
    } else {
      if (absVelY > absVelX * this.config.directionRatio) {
        return this.velocity.y < 0 ? 'next' : 'prev';
      }
    }
    
    return null;
  }
  
  /**
   * 动画翻页
   */
  private animatePageTurn(direction: PageTurnDirection) {
    if (this.isAnimating) return;
    
    // 检查边界
    if (this.isAtPageBoundary(direction)) {
      this.provideHapticFeedback('light');
      this.callbacks.onEdgeReached?.(
        direction === 'prev'
          ? this.pageTurnMode === 'horizontal' ? 'left' : 'top'
          : this.pageTurnMode === 'horizontal' ? 'right' : 'bottom'
      );
      return;
    }
    
    this.isAnimating = true;
    const container = this.container;
    const startPos = 0;
    const endPos = direction === 'next' ? -100 : 100;
    
    // 使用 Web Animations API 实现流畅动画
    const animation = container.animate(
      [
        { transform: `translateX(${startPos}%)` },
        { transform: `translateX(${endPos}%)` },
      ],
      {
        duration: this.config.animationDuration,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }
    );
    
    animation.onfinish = () => {
      container.style.transform = '';
      this.isAnimating = false;
      this.callbacks.onPageTurn?.(direction);
    };
    
    animation.oncancel = () => {
      this.isAnimating = false;
    };
  }
  
  /**
   * 缓动函数
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  
  /**
   * 处理长按
   */
  private handleLongPress(x: number, y: number) {
    this.longPressTriggered = true;
    this.provideHapticFeedback('medium');
    
    // 检查是否在边缘
    const edge = this.isAtEdge(x, y);
    if (edge) {
      this.callbacks.onEdgeReached?.(edge);
    }
    
    // 触发长按回调
    this.callbacks.onLongPress?.(x, y);
    
    // 显示导航栏
    this.callbacks.onShowNavigation?.();
  }
  
  /**
   * Touch Start 处理
   */
  private handleTouchStart(e: TouchEvent) {
    if (e.touches.length > 1) {
      this.handleMultiTouch(e);
      return;
    }
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const x = touch.clientX;
    const y = touch.clientY;
    
    // 检查是否在可交互元素上
    if (this.isInSelectableArea(x, y)) {
      return;
    }
    
    const rect = this.container.getBoundingClientRect();
    const relativeX = x - rect.left;
    const relativeY = y - rect.top;
    
    // 记录触摸开始
    this.touchStartRef = {
      x: relativeX,
      y: relativeY,
      clientX: x,
      clientY: y,
      time: Date.now(),
    };
    
    this.touchMoveRef = {
      maxMoveX: 0,
      maxMoveY: 0,
      lastX: x,
      lastY: y,
    };
    
    this.lastTouchTime = Date.now();
    this.lastTouchPosition = { x, y };
    this.velocity = { x: 0, y: 0 };
    this.longPressTriggered = false;
    
    // 启动长按检测
    this.longPressTimer = setTimeout(() => {
      if (this.touchStartRef) {
        this.handleLongPress(relativeX, relativeY);
      }
    }, this.config.longPressThreshold);
    
    // 存储触摸数据
    const touchData: TouchData = {
      id: touch.identifier,
      startX: relativeX,
      startY: relativeY,
      clientX: x,
      clientY: y,
      time: Date.now(),
      velocityX: 0,
      velocityY: 0,
    };
    this.touches.set(touch.identifier, touchData);
  }
  
  /**
   * Touch Move 处理
   */
  private handleTouchMove(e: TouchEvent) {
    if (e.touches.length > 1) {
      this.handleMultiTouch(e);
      return;
    }
    
    if (!this.touchStartRef) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const x = touch.clientX;
    const y = touch.clientY;
    const time = Date.now();
    
    // 计算速度
    this.calculateVelocity(x, y, time);
    
    // 计算移动距离
    const moveX = Math.abs(x - this.touchStartRef.clientX);
    const moveY = Math.abs(y - this.touchStartRef.clientY);
    const totalDistance = Math.sqrt(moveX * moveX + moveY * moveY);
    
    // 如果移动距离超过阈值，取消长按检测
    if (totalDistance > 10 && this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    // 更新移动记录
    this.touchMoveRef.maxMoveX = Math.max(this.touchMoveRef.maxMoveX, moveX);
    this.touchMoveRef.maxMoveY = Math.max(this.touchMoveRef.maxMoveY, moveY);
    this.touchMoveRef.lastX = x;
    this.touchMoveRef.lastY = y;
    
    // 滑动翻页模式：阻止默认滚动
    if (this.pageTurnMethod === 'swipe') {
      if (this.pageTurnMode === 'horizontal') {
        if (moveX > 10 && moveX > moveY * 1.2) {
          e.preventDefault();
        }
      } else {
        if (moveY > 10 && moveY > moveX * 1.2) {
          e.preventDefault();
        }
      }
    }
    
    // 触发拖拽回调
    const deltaX = x - this.touchStartRef.clientX;
    const deltaY = y - this.touchStartRef.clientY;
    this.callbacks.onDrag?.(deltaX, deltaY);
  }
  
  /**
   * Touch End 处理
   */
  private handleTouchEnd(e: TouchEvent) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    if (!this.touchStartRef) return;
    
    const touch = e.changedTouches[0];
    if (!touch) return;
    
    const x = touch.clientX;
    const y = touch.clientY;
    const time = Date.now();
    const duration = time - this.touchStartRef.time;
    
    const rect = this.container.getBoundingClientRect();
    const relativeX = x - rect.left;
    const relativeY = y - rect.top;
    
    // 如果长按已触发，不处理其他手势
    if (this.longPressTriggered) {
      this.touchStartRef = null;
      this.touches.delete(touch.identifier);
      return;
    }
    
    // 检测手势类型
    const gestureType = this.detectGestureType(
      this.touchStartRef.x,
      this.touchStartRef.y,
      relativeX,
      relativeY,
      duration
    );
    
    // 误触检测
    if (
      duration < this.config.minTouchDuration ||
      duration > this.config.maxTouchDuration
    ) {
      this.touchStartRef = null;
      this.touches.delete(touch.identifier);
      return;
    }
    
    const moveDistance = Math.sqrt(
      Math.pow(relativeX - this.touchStartRef.x, 2) +
      Math.pow(relativeY - this.touchStartRef.y, 2)
    );
    
    if (moveDistance > this.config.maxMoveDistance && gestureType === 'tap') {
      this.touchStartRef = null;
      this.touches.delete(touch.identifier);
      return;
    }
    
    // 处理不同手势类型
    if (gestureType === 'tap') {
      this.callbacks.onTap?.(relativeX, relativeY);
    } else if (gestureType === 'swipe') {
      const direction = this.detectSwipeDirection(
        this.touchStartRef.x,
        this.touchStartRef.y,
        relativeX,
        relativeY
      );
      
      if (direction !== 'none') {
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        this.callbacks.onSwipe?.(direction, moveDistance, speed);
        
        // 处理翻页
        if (this.pageTurnMethod === 'swipe') {
          const pageDirection = this.getPageTurnDirection(direction);
          if (pageDirection) {
            // 检查是否需要惯性滚动
            if (speed > this.config.swipeVelocityThreshold) {
              this.handleInertiaScroll();
            } else {
              this.callbacks.onPageTurn?.(pageDirection);
            }
          }
        }
      }
    }
    
    // 重置状态
    this.touchStartRef = null;
    this.touches.delete(touch.identifier);
    this.pinchStartDistance = 0;
    this.rotationStartAngle = 0;
  }
  
  /**
   * 获取翻页方向
   */
  private getPageTurnDirection(swipeDirection: SwipeDirection): PageTurnDirection | null {
    if (this.pageTurnMode === 'horizontal') {
      if (swipeDirection === 'right') return 'next';
      if (swipeDirection === 'left') return 'prev';
    } else {
      if (swipeDirection === 'up') return 'next';
      if (swipeDirection === 'down') return 'prev';
    }
    return null;
  }
  
  /**
   * Touch Cancel 处理
   */
  private handleTouchCancel(e: TouchEvent) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.touchStartRef = null;
    this.touches.clear();
  }
  
  /**
   * Pointer Down 处理
   */
  private handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (this.pageTurnMethod !== 'swipe') return;
    
    const fakeTouchEvent = {
      touches: [{ clientX: e.clientX, clientY: e.clientY, identifier: e.pointerId }],
      preventDefault: () => e.preventDefault(),
    } as unknown as TouchEvent;
    
    this.handleTouchStart(fakeTouchEvent);
  }
  
  /**
   * Pointer Move 处理
   */
  private handlePointerMove(e: PointerEvent) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (this.pageTurnMethod !== 'swipe') return;
    if (!this.touchStartRef) return;
    
    const fakeTouchEvent = {
      touches: [{ clientX: e.clientX, clientY: e.clientY, identifier: e.pointerId }],
      preventDefault: () => e.preventDefault(),
    } as unknown as TouchEvent;
    
    this.handleTouchMove(fakeTouchEvent);
  }
  
  /**
   * Pointer Up 处理
   */
  private handlePointerUp(e: PointerEvent) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (this.pageTurnMethod !== 'swipe') return;
    
    const fakeTouchEvent = {
      changedTouches: [{ clientX: e.clientX, clientY: e.clientY, identifier: e.pointerId }],
    } as unknown as TouchEvent;
    
    this.handleTouchEnd(fakeTouchEvent);
  }
  
  /**
   * Pointer Cancel 处理
   */
  private handlePointerCancel(e: PointerEvent) {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    this.handleTouchCancel({} as TouchEvent);
  }
  
  /**
   * Mouse Down 处理
   */
  private handleMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;
    
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    this.touchStartRef = {
      x,
      y,
      clientX: e.clientX,
      clientY: e.clientY,
      time: Date.now(),
    };
    
    // PC端长按检测
    this.longPressTimer = setTimeout(() => {
      if (this.touchStartRef) {
        this.handleLongPress(x, y);
      }
    }, this.config.longPressThreshold);
  }
  
  /**
   * Mouse Move 处理
   */
  private handleMouseMove(e: MouseEvent) {
    if (this.touchStartRef && this.longPressTimer) {
      const rect = this.container.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const deltaX = Math.abs(currentX - this.touchStartRef.x);
      const deltaY = Math.abs(currentY - this.touchStartRef.y);
      
      if (deltaX > 10 || deltaY > 10) {
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }
    }
  }
  
  /**
   * Mouse Up 处理
   */
  private handleMouseUp() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.touchStartRef = null;
  }
  
  /**
   * Click 处理（点击翻页模式）
   */
  private handleClick(e: MouseEvent) {
    if (this.pageTurnMethod !== 'click' || !this.clickToTurn) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) return;
    
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    if (this.pageTurnMode === 'horizontal') {
      if (x < width / 2) {
        this.callbacks.onPageTurn?.('prev');
      } else {
        this.callbacks.onPageTurn?.('next');
      }
    } else {
      if (y < height / 2) {
        this.callbacks.onPageTurn?.('prev');
      } else {
        this.callbacks.onPageTurn?.('next');
      }
    }
  }
  
  /**
   * Context Menu 处理
   */
  private handleContextMenu(e: MouseEvent) {
    e.preventDefault();
  }
  
  /**
   * 销毁处理器
   */
  public destroy() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    
    // 移除所有事件监听器
    this.container.removeEventListener('touchstart', this.handleTouchStart.bind(this));
    this.container.removeEventListener('touchmove', this.handleTouchMove.bind(this));
    this.container.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    this.container.removeEventListener('touchcancel', this.handleTouchCancel.bind(this));
    this.container.removeEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.container.removeEventListener('pointermove', this.handlePointerMove.bind(this));
    this.container.removeEventListener('pointerup', this.handlePointerUp.bind(this));
    this.container.removeEventListener('pointercancel', this.handlePointerCancel.bind(this));
    this.container.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    this.container.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.container.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.container.removeEventListener('click', this.handleClick.bind(this));
    this.container.removeEventListener('contextmenu', this.handleContextMenu.bind(this));
    
    this.touches.clear();
    this.touchStartRef = null;
  }
}

