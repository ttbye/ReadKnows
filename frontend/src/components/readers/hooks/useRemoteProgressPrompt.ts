import { useEffect, useRef, useState } from 'react';

export type RemoteProgressPrompt = {
  serverProgress: any;
  clientProgress?: any;
} | null;

export function useRemoteProgressPrompt(params: {
  bookId: string;
  currentProgress?: number;
}) {
  const { bookId, currentProgress } = params;

  const [remoteProgressPrompt, setRemoteProgressPrompt] = useState<RemoteProgressPrompt>(null);
  // 同一阅读会话内：提示只弹一次；用户选择后不再弹，避免重复骚扰
  const remotePromptHandledRef = useRef(false);
  const remotePromptLastProgressRef = useRef<number>(0);

  const markHandled = () => {
    remotePromptHandledRef.current = true;
  };

  // 跨设备进度冲突提示（由 ReaderNew 在保存进度时触发 409 后广播）
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (!detail?.serverProgress) return;
        if (detail.bookId && detail.bookId !== bookId) return;
        if (remotePromptHandledRef.current) return;
        if (remoteProgressPrompt) return; // 正在显示时不重复 set
        const p = typeof detail.serverProgress.progress === 'number' ? detail.serverProgress.progress : 0;
        // 同进度/更小进度不重复提示
        if (p <= remotePromptLastProgressRef.current + 0.0001) return;
        remotePromptLastProgressRef.current = p;
        setRemoteProgressPrompt({ serverProgress: detail.serverProgress, clientProgress: detail.clientProgress });
      } catch {
        // ignore
      }
    };
    window.addEventListener('__reading_progress_conflict' as any, handler);
    return () => window.removeEventListener('__reading_progress_conflict' as any, handler);
  }, [bookId, remoteProgressPrompt]);

  // 打开书时发现服务端进度更靠后：也需要提示一次（不依赖 409 冲突）
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (!detail?.serverProgress) return;
        if (detail.bookId && detail.bookId !== bookId) return;
        if (remotePromptHandledRef.current) return;
        if (remoteProgressPrompt) return;
        const p = typeof detail.serverProgress.progress === 'number' ? detail.serverProgress.progress : 0;
        if (p <= remotePromptLastProgressRef.current + 0.0001) return;
        remotePromptLastProgressRef.current = p;
        setRemoteProgressPrompt({ serverProgress: detail.serverProgress, clientProgress: detail.clientProgress });
      } catch {
        // ignore
      }
    };
    window.addEventListener('__reading_progress_remote_detected' as any, handler);
    return () => window.removeEventListener('__reading_progress_remote_detected' as any, handler);
  }, [bookId, remoteProgressPrompt]);

  // 兜底：如果 ReaderNew 在 ReaderContainer 挂载前就触发了提示事件，事件可能会丢
  // 这里从 sessionStorage 读取一次“待提示的远端进度”，确保重新打开 A 端也能看到提示并跳转到 B 端最新进度
  useEffect(() => {
    try {
      if (!bookId) return;
      if (remotePromptHandledRef.current) return;
      if (remoteProgressPrompt) return;

      const key = `rk-remote-progress-${bookId}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key); // 读一次就清掉，避免重复弹

      const payload = JSON.parse(raw);
      const sp = payload?.serverProgress;
      if (!sp || typeof sp.progress !== 'number') return;

      // 只有当服务器明显更靠后才提示（避免重复/旧数据）
      const serverP = sp.progress;
      const localP = typeof currentProgress === 'number' ? currentProgress : 0;
      if (serverP <= localP + 0.01) return;
      if (serverP <= remotePromptLastProgressRef.current + 0.0001) return;

      remotePromptLastProgressRef.current = serverP;
      setRemoteProgressPrompt({ serverProgress: sp, clientProgress: payload?.clientProgress });
    } catch {
      // ignore
    }
  }, [bookId, currentProgress, remoteProgressPrompt]);

  // 切书时重置（新书可再次提示）
  useEffect(() => {
    remotePromptHandledRef.current = false;
    remotePromptLastProgressRef.current = 0;
    setRemoteProgressPrompt(null);
  }, [bookId]);

  return {
    remoteProgressPrompt,
    setRemoteProgressPrompt,
    markHandled,
  };
}

