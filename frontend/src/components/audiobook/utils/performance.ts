/**
 * @file performance.ts
 * @description 性能优化工具函数（防抖、节流等）
 */

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @param immediate 是否立即执行
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);

    if (callNow) func(...args);
  };
}

/**
 * 节流函数
 * @param func 要节流的函数
 * @param limit 时间限制（毫秒）
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 防抖 Hook 版本（返回稳定的函数引用）
 */
export function useDebounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  deps: React.DependencyList = []
): T {
  const { useRef, useCallback, useEffect } = require('react');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const funcRef = useRef(func);

  useEffect(() => {
    funcRef.current = func;
  }, [func]);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        funcRef.current(...args);
      }, wait);
    }) as T,
    [wait, ...deps]
  );
}

/**
 * 节流 Hook 版本（返回稳定的函数引用）
 */
export function useThrottle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
  deps: React.DependencyList = []
): T {
  const { useRef, useCallback, useEffect } = require('react');
  const inThrottleRef = useRef<boolean>(false);
  const funcRef = useRef(func);

  useEffect(() => {
    funcRef.current = func;
  }, [func]);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (!inThrottleRef.current) {
        funcRef.current(...args);
        inThrottleRef.current = true;
        setTimeout(() => {
          inThrottleRef.current = false;
        }, limit);
      }
    }) as T,
    [limit, ...deps]
  );
}
