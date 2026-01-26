import { useEffect, useRef, useState, type MutableRefObject } from 'react';

export function useTTSControls(params: {
  showBottomNav: boolean;
  showBottomNavigationRef: MutableRefObject<((isSettings?: boolean) => void) | null>;
}) {
  const { showBottomNav, showBottomNavigationRef } = params;

  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [isTTSMode, setIsTTSMode] = useState(false); // 是否显示TTS控制面板
  const [ttsCurrentIndex, setTtsCurrentIndex] = useState(-1);
  const [ttsTotalParagraphs, setTtsTotalParagraphs] = useState(0);
  const [showTTSFloatingButton, setShowTTSFloatingButton] = useState(false);

  const showBottomNavRef = useRef(showBottomNav);
  const floatingRef = useRef(showTTSFloatingButton);

  useEffect(() => {
    showBottomNavRef.current = showBottomNav;
  }, [showBottomNav]);

  useEffect(() => {
    floatingRef.current = showTTSFloatingButton;
  }, [showTTSFloatingButton]);

  useEffect(() => {
    // 注册TTS播放状态回调（由 ReaderEPUBPro 等触发）
    window.__onTTSStart = () => {
      setIsTTSPlaying(true);

      // 如果悬浮按钮显示中，隐藏它并显示底部导航栏，进入TTS模式
      if (floatingRef.current) {
        setShowTTSFloatingButton(false);
        setIsTTSMode(true);
        showBottomNavigationRef.current?.();
      } else if (!showBottomNavRef.current) {
        // 显示底部导航栏（会切换为播放控制模式）
        showBottomNavigationRef.current?.();
      }

      // 通知阅读器重新计算底部安全区域并重新分页
      try {
        const fn = window.__onTTSStateChange;
        if (typeof fn === 'function') fn();
      } catch {
        // ignore
      }
    };

    window.__onTTSStop = () => {
      setIsTTSPlaying(false);
      setTtsCurrentIndex(-1);
      setTtsTotalParagraphs(0);
      setIsTTSMode(false);
      // 隐藏悬浮按钮（用户主动停止播放后，关闭面板时不显示悬浮按钮）
      setShowTTSFloatingButton(false);

      try {
        const fn = window.__onTTSStateChange;
        if (typeof fn === 'function') fn();
      } catch {
        // ignore
      }
    };

    // 备用：定期检查TTS播放状态和段落信息
    const checkInterval = window.setInterval(() => {
      try {
        const getPlaying = window.__getTTSIsPlaying;
        if (typeof getPlaying === 'function') {
          const playing = !!getPlaying();
          setIsTTSPlaying((prev) => (prev === playing ? prev : playing));
        }
      } catch {
        // ignore
      }

      try {
        const getIdx = window.__getTTSCurrentIndex;
        if (typeof getIdx === 'function') {
          const idx = Number(getIdx());
          if (Number.isFinite(idx)) {
            setTtsCurrentIndex((prev) => (prev === idx ? prev : idx));
          }
        }
      } catch {
        // ignore
      }

      try {
        const getTotal = window.__getTTSTotalParagraphs;
        if (typeof getTotal === 'function') {
          const total = Number(getTotal());
          if (Number.isFinite(total)) {
            setTtsTotalParagraphs((prev) => (prev === total ? prev : total));
          }
        }
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      delete window.__onTTSStart;
      delete window.__onTTSStop;
      window.clearInterval(checkInterval);
    };
  }, [showBottomNavigationRef]);

  return {
    isTTSPlaying,
    setIsTTSPlaying,
    isTTSMode,
    setIsTTSMode,
    ttsCurrentIndex,
    setTtsCurrentIndex,
    ttsTotalParagraphs,
    setTtsTotalParagraphs,
    showTTSFloatingButton,
    setShowTTSFloatingButton,
  };
}

