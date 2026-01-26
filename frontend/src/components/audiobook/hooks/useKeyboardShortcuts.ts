/**
 * @file useKeyboardShortcuts.ts
 * @description 键盘快捷键Hook（无障碍性支持）
 */

import { useEffect, useCallback, useRef } from 'react';

/**
 * 键盘快捷键配置
 */
export interface KeyboardShortcutsConfig {
  /** 播放/暂停快捷键（默认：空格） */
  togglePlay?: string[];
  /** 上一首快捷键（默认：ArrowLeft + Ctrl/Meta） */
  previous?: string[];
  /** 下一首快捷键（默认：ArrowRight + Ctrl/Meta） */
  next?: string[];
  /** 快退快捷键（默认：ArrowLeft） */
  seekBackward?: string[];
  /** 快进快捷键（默认：ArrowRight） */
  seekForward?: string[];
  /** 增加音量快捷键（默认：ArrowUp） */
  volumeUp?: string[];
  /** 减少音量快捷键（默认：ArrowDown） */
  volumeDown?: string[];
  /** 静音切换快捷键（默认：m） */
  toggleMute?: string[];
  /** 关闭播放器快捷键（默认：Escape） */
  close?: string[];
  /** 显示/隐藏播放列表快捷键（默认：p） */
  togglePlaylist?: string[];
  /** 显示/隐藏章节列表快捷键（默认：c） */
  toggleChapters?: string[];
  /** 是否启用快捷键（默认：true） */
  enabled?: boolean;
}

/**
 * 键盘快捷键处理函数
 */
export interface KeyboardShortcutsHandlers {
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onToggleMute: () => void;
  onClose?: () => void;
  onTogglePlaylist?: () => void;
  onToggleChapters?: () => void;
}

/**
 * 默认快捷键配置
 */
const DEFAULT_SHORTCUTS: Required<KeyboardShortcutsConfig> = {
  togglePlay: [' ', 'Space'],
  previous: ['ArrowLeft'],
  next: ['ArrowRight'],
  seekBackward: ['ArrowLeft'],
  seekForward: ['ArrowRight'],
  volumeUp: ['ArrowUp'],
  volumeDown: ['ArrowDown'],
  toggleMute: ['m', 'M'],
  close: ['Escape'],
  togglePlaylist: ['p', 'P'],
  toggleChapters: ['c', 'C'],
  enabled: true,
};

/**
 * 检查是否应该忽略快捷键（例如在输入框中）
 */
function shouldIgnoreShortcut(target: EventTarget | null): boolean {
  if (!target) return false;
  
  const element = target as HTMLElement;
  
  // 忽略输入框、文本域、可编辑元素
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable
  ) {
    return true;
  }
  
  // 忽略带有 data-ignore-shortcuts 属性的元素
  if (element.hasAttribute('data-ignore-shortcuts')) {
    return true;
  }
  
  return false;
}

/**
 * 检查快捷键是否匹配
 */
function matchesShortcut(
  event: KeyboardEvent,
  shortcuts: string[]
): boolean {
  const key = event.key;
  const code = event.code;
  
  return shortcuts.some(shortcut => {
    // 支持 Ctrl/Cmd 修饰键
    if (shortcut.includes('Ctrl') || shortcut.includes('Meta')) {
      const hasModifier = event.ctrlKey || event.metaKey;
      const keyPart = shortcut.replace(/Ctrl|Meta/g, '').trim();
      return hasModifier && (key === keyPart || code === keyPart);
    }
    
    // 支持 Shift 修饰键
    if (shortcut.includes('Shift')) {
      const hasShift = event.shiftKey;
      const keyPart = shortcut.replace('Shift', '').trim();
      return hasShift && (key === keyPart || code === keyPart);
    }
    
    // 普通快捷键匹配
    return key === shortcut || code === shortcut;
  });
}

/**
 * 键盘快捷键Hook
 * 
 * @param handlers 快捷键处理函数
 * @param config 快捷键配置（可选）
 * 
 * @example
 * ```tsx
 * useKeyboardShortcuts({
 *   onTogglePlay: () => togglePlay(),
 *   onPrevious: () => handlePrevious(),
 *   onNext: () => handleNext(),
 * }, {
 *   enabled: true,
 * });
 * ```
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutsHandlers,
  config: KeyboardShortcutsConfig = {}
): void {
  const configRef = useRef({ ...DEFAULT_SHORTCUTS, ...config });
  const handlersRef = useRef(handlers);
  
  // 更新配置和处理函数引用
  useEffect(() => {
    configRef.current = { ...DEFAULT_SHORTCUTS, ...config };
    handlersRef.current = handlers;
  }, [config, handlers]);
  
  // 键盘事件处理
  useEffect(() => {
    if (!configRef.current.enabled) {
      return;
    }
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // 忽略输入框中的快捷键
      if (shouldIgnoreShortcut(event.target)) {
        return;
      }
      
      const currentConfig = configRef.current;
      const currentHandlers = handlersRef.current;
      
      // 播放/暂停
      if (matchesShortcut(event, currentConfig.togglePlay)) {
        event.preventDefault();
        currentHandlers.onTogglePlay();
        return;
      }
      
      // 上一首（需要 Ctrl/Meta）
      if (
        (event.ctrlKey || event.metaKey) &&
        matchesShortcut(event, currentConfig.previous)
      ) {
        event.preventDefault();
        currentHandlers.onPrevious();
        return;
      }
      
      // 下一首（需要 Ctrl/Meta）
      if (
        (event.ctrlKey || event.metaKey) &&
        matchesShortcut(event, currentConfig.next)
      ) {
        event.preventDefault();
        currentHandlers.onNext();
        return;
      }
      
      // 快退（不需要修饰键）
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        matchesShortcut(event, currentConfig.seekBackward)
      ) {
        event.preventDefault();
        currentHandlers.onSeekBackward();
        return;
      }
      
      // 快进（不需要修饰键）
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        matchesShortcut(event, currentConfig.seekForward)
      ) {
        event.preventDefault();
        currentHandlers.onSeekForward();
        return;
      }
      
      // 增加音量
      if (matchesShortcut(event, currentConfig.volumeUp)) {
        event.preventDefault();
        currentHandlers.onVolumeUp();
        return;
      }
      
      // 减少音量
      if (matchesShortcut(event, currentConfig.volumeDown)) {
        event.preventDefault();
        currentHandlers.onVolumeDown();
        return;
      }
      
      // 静音切换
      if (matchesShortcut(event, currentConfig.toggleMute)) {
        event.preventDefault();
        currentHandlers.onToggleMute();
        return;
      }
      
      // 关闭播放器
      if (currentHandlers.onClose && matchesShortcut(event, currentConfig.close)) {
        event.preventDefault();
        currentHandlers.onClose();
        return;
      }
      
      // 显示/隐藏播放列表
      if (
        currentHandlers.onTogglePlaylist &&
        matchesShortcut(event, currentConfig.togglePlaylist)
      ) {
        event.preventDefault();
        currentHandlers.onTogglePlaylist();
        return;
      }
      
      // 显示/隐藏章节列表
      if (
        currentHandlers.onToggleChapters &&
        matchesShortcut(event, currentConfig.toggleChapters)
      ) {
        event.preventDefault();
        currentHandlers.onToggleChapters();
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
