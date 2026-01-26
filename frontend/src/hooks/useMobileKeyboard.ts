/**
 * @file useMobileKeyboard.ts
 * @description PWA 移动端：监听键盘弹出/收起，滚动到活动输入框并在收起后恢复滚动位置
 * - 使用 visualViewport 可靠检测键盘
 * - 防抖与 RAF 做性能优化
 */

import { useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';

const DEBOUNCE_MS = 100;
const KEYBOARD_OPEN_THRESHOLD = 120;
const KEYBOARD_CLOSE_THRESHOLD = 80;
const BLUR_RESTORE_DELAY_MS = 380;

export interface UseMobileKeyboardOptions {
  scrollContainerRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLElement | null>;
}

const EMPTY_REF = { current: null } as RefObject<HTMLElement | null>;

function isMobileOrPWA(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const standalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return (window.innerWidth < 768 && mobile) || (standalone && (mobile || window.innerWidth < 1024));
}

export function useMobileKeyboard(options?: UseMobileKeyboardOptions) {
  const scrollContainerRef = options?.scrollContainerRef ?? EMPTY_REF;
  const inputRef = options?.inputRef ?? EMPTY_REF;

  const savedScrollTopRef = useRef<number>(0);
  const didScrollForKeyboardRef = useRef<boolean>(false);
  const lastViewportHeightRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInputFocusedRef = useRef<boolean>(false);

  const scrollToInput = useCallback(() => {
    const container = scrollContainerRef.current;
    const input = inputRef.current;
    if (!container || !input) return;
    input.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
  }, [scrollContainerRef, inputRef]);

  const restoreScroll = useCallback(() => {
    if (!didScrollForKeyboardRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    didScrollForKeyboardRef.current = false;
    const saved = savedScrollTopRef.current;
    const doRestore = () => { el.scrollTop = saved; };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(doRestore));
    } else {
      doRestore();
    }
  }, [scrollContainerRef]);

  const onViewportChange = useCallback(() => {
    if (!isMobileOrPWA()) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const container = scrollContainerRef.current;
    const input = inputRef.current;
    const h = vv.height;
    const prev = lastViewportHeightRef.current;
    lastViewportHeightRef.current = h;

    // 首次或未初始化：只记录高度，不动作
    if (prev === 0) return;

    // 键盘弹出：高度明显减小
    if (prev - h >= KEYBOARD_OPEN_THRESHOLD) {
      if (container && input && document.activeElement === input && isInputFocusedRef.current) {
        savedScrollTopRef.current = container.scrollTop;
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => {
            requestAnimationFrame(scrollToInput);
          });
        } else {
          scrollToInput();
        }
        didScrollForKeyboardRef.current = true;
      }
      return;
    }

    // 键盘收起：高度明显增大，且此前做过滚动
    if (h - prev >= KEYBOARD_CLOSE_THRESHOLD && didScrollForKeyboardRef.current) {
      restoreScroll();
    }
  }, [scrollContainerRef, inputRef, scrollToInput, restoreScroll]);

  const debouncedViewport = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      onViewportChange();
    }, DEBOUNCE_MS);
  }, [onViewportChange]);

  // 初始化 lastViewportHeight
  useEffect(() => {
    if (!isMobileOrPWA() || !window.visualViewport) return;
    lastViewportHeightRef.current = window.visualViewport.height;
  }, []);

  // 监听 visualViewport
  useEffect(() => {
    if (!isMobileOrPWA()) return;
    const vv = window.visualViewport;
    if (!vv) return;

    vv.addEventListener('resize', debouncedViewport);
    vv.addEventListener('scroll', debouncedViewport);
    return () => {
      vv.removeEventListener('resize', debouncedViewport);
      vv.removeEventListener('scroll', debouncedViewport);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [debouncedViewport]);

  // focusin / focusout：标记输入是否聚焦，blur 时延迟恢复
  useEffect(() => {
    if (!isMobileOrPWA()) return;

    const onFocusIn = (e: FocusEvent) => {
      if (inputRef.current && e.target === inputRef.current) {
        isInputFocusedRef.current = true;
      }
    };

    const onFocusOut = (e: FocusEvent) => {
      if (inputRef.current && e.target === inputRef.current) {
        isInputFocusedRef.current = false;
        if (blurRestoreTimerRef.current) clearTimeout(blurRestoreTimerRef.current);
        blurRestoreTimerRef.current = setTimeout(() => {
          blurRestoreTimerRef.current = null;
          restoreScroll();
        }, BLUR_RESTORE_DELAY_MS);
      }
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      if (blurRestoreTimerRef.current) clearTimeout(blurRestoreTimerRef.current);
    };
  }, [inputRef, restoreScroll]);

  return {
    isMobile: isMobileOrPWA(),
    // 向后兼容：未传入 scrollContainerRef/inputRef 时，以下供旧用法（如 Messages）避免报错
    keyboardState: { isVisible: false, height: 0, viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0 },
    scrollToInput: () => {},
  };
}
