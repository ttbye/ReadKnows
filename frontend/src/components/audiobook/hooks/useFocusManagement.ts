/**
 * @file useFocusManagement.ts
 * @description 焦点管理Hook（无障碍性支持）
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * 焦点管理配置
 */
export interface FocusManagementConfig {
  /** 是否在打开时自动聚焦到第一个可聚焦元素 */
  autoFocusOnOpen?: boolean;
  /** 是否在关闭时恢复之前的焦点 */
  restoreFocusOnClose?: boolean;
  /** 打开时的初始焦点选择器 */
  initialFocusSelector?: string;
  /** 关闭按钮的选择器 */
  closeButtonSelector?: string;
}

/**
 * 焦点管理Hook
 * 
 * @param isOpen 是否打开
 * @param config 配置选项
 * 
 * @example
 * ```tsx
 * const { focusCloseButton, trapFocus } = useFocusManagement(isOpen, {
 *   autoFocusOnOpen: true,
 *   restoreFocusOnClose: true,
 * });
 * ```
 */
export function useFocusManagement(
  isOpen: boolean,
  config: FocusManagementConfig = {}
): {
  focusCloseButton: () => void;
  trapFocus: (containerRef: React.RefObject<HTMLElement>) => void;
} {
  const {
    autoFocusOnOpen = true,
    restoreFocusOnClose = true,
    initialFocusSelector = '[data-initial-focus]',
    closeButtonSelector = '[data-close-button]',
  } = config;
  
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  
  // 保存打开前的焦点
  useEffect(() => {
    if (isOpen && restoreFocusOnClose) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen, restoreFocusOnClose]);
  
  // 打开时自动聚焦
  useEffect(() => {
    if (!isOpen || !autoFocusOnOpen) {
      return;
    }
    
    // 延迟聚焦，确保DOM已渲染
    const timeoutId = setTimeout(() => {
      // 优先聚焦到指定元素
      const initialFocus = document.querySelector<HTMLElement>(initialFocusSelector);
      if (initialFocus) {
        initialFocus.focus();
        return;
      }
      
      // 否则聚焦到关闭按钮
      const closeButton = document.querySelector<HTMLElement>(closeButtonSelector);
      if (closeButton) {
        closeButton.focus();
        return;
      }
      
      // 最后聚焦到第一个可聚焦元素
      const firstFocusable = containerRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [isOpen, autoFocusOnOpen, initialFocusSelector, closeButtonSelector]);
  
  // 关闭时恢复焦点
  useEffect(() => {
    if (!isOpen && restoreFocusOnClose && previousFocusRef.current) {
      const timeoutId = setTimeout(() => {
        if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
          previousFocusRef.current.focus();
        }
        previousFocusRef.current = null;
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, restoreFocusOnClose]);
  
  // 聚焦到关闭按钮
  const focusCloseButton = useCallback(() => {
    const closeButton = document.querySelector<HTMLElement>(closeButtonSelector);
    if (closeButton) {
      closeButton.focus();
    }
  }, [closeButtonSelector]);
  
  // 焦点陷阱（将焦点限制在容器内）
  const trapFocus = useCallback((containerRef: React.RefObject<HTMLElement>) => {
    if (!isOpen || !containerRef.current) {
      return;
    }
    
    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) {
      return;
    }
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return;
      }
      
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    };
    
    container.addEventListener('keydown', handleTabKey);
    
    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);
  
  return {
    focusCloseButton,
    trapFocus,
  };
}
