/**
 * @author ttbye
 * 阅读器页面
 * 使用新的阅读器架构
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import ReaderContainer from '../components/readers/ReaderContainer';
import { ReadingSettings, defaultSettings, BookData, ReadingPosition, ReaderConfig } from '../types/reader';

export default function ReaderNew() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [initialPosition, setInitialPosition] = useState<ReadingPosition | undefined>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pendingServerProgressRef = useRef<any>(null);
  const suppressServerSaveRef = useRef(false);
  const lastLocalProgressRef = useRef<number>(0);
  const lastRemoteCheckAtRef = useRef<number>(0);
  const lastRemoteProgressRef = useRef<number>(0);
  const lastConflictPromptAtRef = useRef<number>(0);
  const remotePromptStorageKey = bookId ? `rk-remote-progress-${bookId}` : null;

  // 阅读字号推荐：只在“未自定义/从旧版本升级”时使用，避免覆盖用户设置
  const getRecommendedFontSize = () => {
    const w = window.innerWidth || 390;
    // 移动端适当更大，避免“默认太小”
    if (w <= 360) return 18;
    if (w <= 430) return 19;
    if (w <= 768) return 18;
    // 大屏阅读稍微大一点更舒服（不强制）
    return 18;
  };

  // 获取阅读设置（仅从本地localStorage读取，不同步服务器）
  const fetchSettings = async () => {
    try {
      // 阅读设置仅保存在本地，不同步服务器
      // 这样不同平台可以有不同的字体设置而不冲突
      const savedSettings = localStorage.getItem('reading-settings');
      const settingsVersion = localStorage.getItem('reading-settings-version');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          // 确保所有字段都被正确恢复，包括嵌套对象
          const restoredSettings: ReadingSettings = {
            ...defaultSettings,
            ...parsed,
            // 确保嵌套对象也被正确合并
            keyboardShortcuts: {
              ...defaultSettings.keyboardShortcuts,
              ...(parsed.keyboardShortcuts || {}),
            },
          };

          // 兼容升级：如果缺少翻页模式/方式字段，补齐默认值（左右滑动翻页）
          if (restoredSettings.pageTurnMethod !== 'click' && restoredSettings.pageTurnMethod !== 'swipe') {
            restoredSettings.pageTurnMethod = 'swipe';
          }
          if (restoredSettings.pageTurnMode !== 'horizontal' && restoredSettings.pageTurnMode !== 'vertical') {
            restoredSettings.pageTurnMode = 'horizontal';
          }
          
          // 兼容升级：确保PDF自动旋转默认为false（如果未设置）
          if (restoredSettings.pdfAutoRotate === undefined) {
            restoredSettings.pdfAutoRotate = false;
          }

          // 兼容升级：如果老版本默认字号过小（或用户从未主动调整），自动修复到更舒适的字号
          // 仅在首次升级时执行一次，后续完全尊重用户在本机的设置
          if (!settingsVersion) {
            const recommended = getRecommendedFontSize();
            const fontSize = typeof restoredSettings.fontSize === 'number' ? restoredSettings.fontSize : defaultSettings.fontSize;
            // 旧默认常见为 16，或小于 18 的情况：提升到推荐值
            if (fontSize < 18) {
              restoredSettings.fontSize = Math.max(18, recommended);
              // 同步写回 localStorage，保证“不同书籍体验一致”
              try {
                localStorage.setItem('reading-settings', JSON.stringify(restoredSettings));
              } catch (e) {
                // 忽略写回失败
              }
            }
            localStorage.setItem('reading-settings-version', '2');
          }

          console.log('[ReaderNew] 从 localStorage 恢复设置:', {
            fontSize: restoredSettings.fontSize,
            fontFamily: restoredSettings.fontFamily,
            lineHeight: restoredSettings.lineHeight,
            theme: restoredSettings.theme,
            margin: restoredSettings.margin,
            textIndent: restoredSettings.textIndent,
          });
          setSettings(restoredSettings);
        } catch (e) {
          console.error('ReaderNew: 解析本地设置失败', e);
          setSettings(defaultSettings);
        }
      } else {
        // 首次使用：使用更舒适的默认字号，并按屏幕轻度自适配
        const firstSettings: ReadingSettings = {
          ...defaultSettings,
          fontSize: Math.max(defaultSettings.fontSize, getRecommendedFontSize()),
        };
        console.log('[ReaderNew] 首次使用，创建默认设置:', {
          fontSize: firstSettings.fontSize,
          fontFamily: firstSettings.fontFamily,
          lineHeight: firstSettings.lineHeight,
        });
        setSettings(firstSettings);
        try {
          localStorage.setItem('reading-settings', JSON.stringify(firstSettings));
          localStorage.setItem('reading-settings-version', '2');
        } catch (e) {
          // 忽略写入失败
        }
      }
    } catch (error) {
      console.error('ReaderNew: 获取阅读设置失败', error);
      setSettings(defaultSettings);
    }
  };

  // 保存阅读设置（仅保存到本地localStorage）
  const saveSettings = async (newSettings: ReadingSettings) => {
    // 确保所有字段都被包含，合并默认值以防止字段丢失
    const completeSettings: ReadingSettings = {
      ...defaultSettings,
      ...newSettings,
      // 确保嵌套对象也被正确合并
      keyboardShortcuts: {
        ...defaultSettings.keyboardShortcuts,
        ...(newSettings.keyboardShortcuts || {}),
      },
    };
    
    // 更新状态
    setSettings(completeSettings);
    
    // 立即保存到 localStorage
    try {
      // 仅保存到本地，不同步服务器
      // 这样每个设备可以有独立的字体大小、行距等设置
      const settingsJson = JSON.stringify(completeSettings);
      localStorage.setItem('reading-settings', settingsJson);
      // 同时保存TTS设置到独立的localStorage键（确保TTS设置持久化）
      const settingsAny = completeSettings as any;
      if (settingsAny.tts_default_speed?.value) {
        try {
          localStorage.setItem('tts_default_speed', settingsAny.tts_default_speed.value);
        } catch (e) {
          console.warn('[ReaderNew] 保存TTS播放速度失败:', e);
        }
      }
      if (settingsAny.tts_default_model?.value) {
        try {
          localStorage.setItem('tts_default_model', settingsAny.tts_default_model.value);
        } catch (e) {
          console.warn('[ReaderNew] 保存TTS引擎失败:', e);
        }
      }
      if (settingsAny.tts_default_voice?.value) {
        try {
          localStorage.setItem('tts_default_voice', settingsAny.tts_default_voice.value);
        } catch (e) {
          console.warn('[ReaderNew] 保存TTS音色失败:', e);
        }
      }
      
      console.log('[ReaderNew] 设置已保存到 localStorage:', {
        fontSize: completeSettings.fontSize,
        fontFamily: completeSettings.fontFamily,
        lineHeight: completeSettings.lineHeight,
        theme: completeSettings.theme,
        margin: completeSettings.margin,
        textIndent: completeSettings.textIndent,
        ttsSpeed: settingsAny.tts_default_speed?.value,
        ttsModel: settingsAny.tts_default_model?.value,
        ttsVoice: settingsAny.tts_default_voice?.value,
      });
    } catch (error) {
      console.error('ReaderNew: 保存阅读设置失败', error);
    }
  };

  // 首先加载设置（在获取书籍信息之前）
  useEffect(() => {
    fetchSettings();
  }, []);

  // 获取书籍信息
  useEffect(() => {
    const fetchBook = async () => {
      if (!bookId) return;

      try {
        setLoading(true);
        const response = await api.get(`/books/${bookId}`);
        let bookData = response.data.book;
        const formats = response.data.formats || [];

        if (!bookData) {
          toast.error('书籍不存在');
          setTimeout(() => navigate(-1), 1000);
          return;
        }

        // 如果是 Office 文件，检查是否有 PDF 版本，优先使用 PDF 阅读器
        const officeTypes = ['docx', 'doc', 'xlsx', 'xls', 'pptx'];
        if (officeTypes.includes(bookData.file_type?.toLowerCase())) {
          const pdfFormat = formats.find((f: any) => f.file_type?.toLowerCase() === 'pdf');
          if (pdfFormat) {
            console.log('[ReaderNew] Office 文件检测到 PDF 版本，使用 PDF 阅读器');
            bookData = pdfFormat; // 使用 PDF 版本的书籍数据
          }
        }

        setBook(bookData);

        // 创建阅读会话（每次打开书籍为一次阅读）
        if (isAuthenticated) {
          try {
            const sessionResponse = await api.post('/reading/history/session', {
              bookId,
              startTime: new Date().toISOString(),
            }            );
            if (sessionResponse.data.sessionId) {
              setSessionId(sessionResponse.data.sessionId);
            }
          } catch (error: any) {
            console.error('ReaderNew: 创建阅读会话失败', error);
            // 不影响阅读，继续执行
          }
        }

        // 获取阅读进度
        if (isAuthenticated) {
          try {
            const progressResponse = await api.get(`/reading/progress/${bookId}`);
            if (progressResponse.data.progress) {
              const progress = progressResponse.data.progress;
              const serverProgressValue = typeof progress.progress === 'number' ? progress.progress : 0;
              lastRemoteProgressRef.current = serverProgressValue;
              
              // 优先使用 CFI（最精确），其次使用章节索引
              const initialPos: ReadingPosition = {
                chapterIndex: progress.chapter_index || 0,
                currentPage: progress.current_page || 1,
                totalPages: progress.total_pages || 1,
                scrollTop: progress.scroll_top || 0,
                progress: progress.progress || 0,
                paragraphIndex: progress.paragraph_index !== null && progress.paragraph_index !== undefined ? progress.paragraph_index : undefined,
              };
              
              // 如果有 CFI，使用 CFI 恢复位置（最精确）
              // 注意：后端字段名是 current_position，不是 current_location
              if (progress.current_position) {
                initialPos.currentLocation = progress.current_position;
              }

              // 新增：对比本机上次进度（localStorage），若服务器更靠后，则不自动跳转，改为弹提示询问
              try {
                const saved = localStorage.getItem(`reading-position-${bookId}`);
                if (saved) {
                  const local = JSON.parse(saved);
                  const localProgress = typeof local?.progress === 'number' ? local.progress : (typeof local?.position?.progress === 'number' ? local.position.progress : 0);
                  const localPos = local?.position as ReadingPosition | undefined;
                  lastLocalProgressRef.current = localProgress;
                  // 只有当服务器明显更靠后才提示（避免微小浮动）
                  if (serverProgressValue - localProgress > 0.01 && localPos) {
                    // 先用本机位置进入阅读，等待用户确认再跳服务器位置
                    setInitialPosition(localPos);
                    pendingServerProgressRef.current = {
                      progress: serverProgressValue,
                      currentPage: progress.current_page || 1,
                      totalPages: progress.total_pages || 1,
                      chapterIndex: progress.chapter_index || 0,
                      scrollTop: progress.scroll_top || 0,
                      currentPosition: progress.current_position || null,
                      updatedAt: progress.updated_at || null,
                    };
                    // 关键：避免事件早于 ReaderContainer 挂载导致丢失提示
                    // 写入 sessionStorage，ReaderContainer 挂载后会主动读取并弹一次提示
                    try {
                      if (remotePromptStorageKey) {
                        sessionStorage.setItem(remotePromptStorageKey, JSON.stringify({
                          bookId,
                          serverProgress: pendingServerProgressRef.current,
                          ts: Date.now(),
                        }));
                      }
                    } catch {
                      // ignore
                    }
                    window.dispatchEvent(
                      new CustomEvent('__reading_progress_remote_detected', {
                        detail: {
                          bookId,
                          serverProgress: pendingServerProgressRef.current,
                        },
                      })
                    );
                  } else {
                    setInitialPosition(initialPos);
                  }
                } else {
                  lastLocalProgressRef.current = serverProgressValue;
                  setInitialPosition(initialPos);
                }
              } catch {
                setInitialPosition(initialPos);
              }
            }
          } catch (error) {
            console.error('ReaderNew: 获取阅读进度失败', error);
            // 忽略进度获取错误，从第一页开始
          }
        } else {
          try {
            const saved = localStorage.getItem(`reading-position-${bookId}`);
            if (saved) {
              const savedProgress = JSON.parse(saved);
              if (savedProgress.position) {
                const p = typeof savedProgress?.progress === 'number' ? savedProgress.progress : (typeof savedProgress?.position?.progress === 'number' ? savedProgress.position.progress : 0);
                lastLocalProgressRef.current = p || 0;
                setInitialPosition(savedProgress.position);
              }
            }
          } catch (e) {
            console.error('ReaderNew: localStorage解析失败', e);
            // 忽略解析错误
          }
        }

        setLoading(false);
      } catch (error: any) {
        console.error('获取书籍失败:', error);
        toast.error(`加载失败: ${error.message || '未知错误'}`);
        setLoading(false);
      }
    };

    fetchBook();
  }, [bookId, isAuthenticated, navigate]);

  // 跨端进度提示：回到前台/聚焦时主动拉取一次服务端进度并对比（不依赖 409）
  useEffect(() => {
    if (!isAuthenticated || !bookId) return;

    let disposed = false;

    const normalizeServerProgress = (p: any) => {
      if (!p) return null;
      const progressValue = typeof p.progress === 'number' ? p.progress : 0;
      return {
        progress: progressValue,
        currentPage: p.current_page || p.currentPage || 1,
        totalPages: p.total_pages || p.totalPages || 1,
        chapterIndex: p.chapter_index ?? p.chapterIndex ?? 0,
        scrollTop: p.scroll_top || p.scrollTop || 0,
        paragraphIndex: p.paragraph_index !== null && p.paragraph_index !== undefined ? p.paragraph_index : (p.paragraphIndex !== undefined ? p.paragraphIndex : undefined),
        currentPosition: p.current_position || p.currentPosition || null,
        updatedAt: p.updated_at || p.updatedAt || null,
      };
    };

    const shouldPrompt = (serverP: number, localP: number) => {
      if (!Number.isFinite(serverP) || !Number.isFinite(localP)) return false;
      if (serverP <= localP + 0.01) return false; // 1% 阈值
      // 同一服务器进度不重复提示
      if (serverP <= lastRemoteProgressRef.current + 0.0001) return false;
      return true;
    };

    const checkRemoteProgress = async (reason: string) => {
      const now = Date.now();
      // 节流：10s 内只检查一次
      if (now - lastRemoteCheckAtRef.current < 10_000) return;
      lastRemoteCheckAtRef.current = now;

      try {
        const resp = await api.get(`/reading/progress/${bookId}`);
        if (disposed) return;
        const raw = resp.data?.progress;
        const sp = normalizeServerProgress(raw);
        if (!sp) return;

        const serverP = typeof sp.progress === 'number' ? sp.progress : 0;
        const localP = typeof lastLocalProgressRef.current === 'number' ? lastLocalProgressRef.current : 0;

        // 更新“已见过的服务器进度”
        if (serverP > lastRemoteProgressRef.current) {
          lastRemoteProgressRef.current = serverP;
        }

        if (shouldPrompt(serverP, localP)) {
          try {
            if (remotePromptStorageKey) {
              sessionStorage.setItem(remotePromptStorageKey, JSON.stringify({
                bookId,
                serverProgress: { ...sp, reason },
                clientProgress: { progress: localP },
                ts: Date.now(),
              }));
            }
          } catch {
            // ignore
          }
          window.dispatchEvent(
            new CustomEvent('__reading_progress_remote_detected', {
              detail: {
                bookId,
                serverProgress: { ...sp, reason },
                clientProgress: { progress: localP },
              },
            })
          );
        }
      } catch {
        // ignore
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkRemoteProgress('visibility');
      }
    };
    const onFocus = () => checkRemoteProgress('focus');

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, bookId]);

  // 组件卸载时结束阅读会话
  useEffect(() => {
    return () => {
      // 结束阅读会话
      if (isAuthenticated && sessionId && bookId) {
        // 使用 navigator.sendBeacon 确保即使页面关闭也能发送请求
        const endSession = async () => {
          try {
            // 尝试获取当前阅读进度（如果失败则使用默认值）
            let currentProgress = 0;
            try {
              const progressResponse = await api.get(`/reading/progress/${bookId}`);
              currentProgress = progressResponse.data?.progress || 0;
            } catch (e) {
              // 使用默认值
            }
            
            await api.put(`/reading/history/session/${sessionId}`, {
              endTime: new Date().toISOString(),
              progressAfter: currentProgress,
            });
          } catch (error) {
            console.error('ReaderNew: 结束阅读会话失败', error);
          }
        };
        
        // 尝试发送请求，如果失败则忽略（不影响用户体验）
        endSession().catch(() => {});
      }
    };
  }, [isAuthenticated, sessionId, bookId]);

  // 处理进度变化（实时保存）
  const handleProgressChange = async (newProgress: number, position: ReadingPosition) => {
    if (!bookId) {
      return;
    }
    
    // 确保进度值是有效的数字
    if (typeof newProgress !== 'number' || isNaN(newProgress) || newProgress < 0 || newProgress > 1) {
      return;
    }
    
    if (isAuthenticated) {
      try {
        lastLocalProgressRef.current = newProgress;
        // 冲突提示期间：暂停向服务端写入，避免 409 刷屏；仍写本地用于打开时对比
        if (suppressServerSaveRef.current) {
          try {
            localStorage.setItem(`reading-position-${bookId}`, JSON.stringify({
              progress: newProgress,
              position,
              timestamp: Date.now(),
            }));
          } catch {
            // ignore
          }
          return;
        }
        await api.post('/reading/progress', {
          bookId: bookId,
          progress: newProgress,
          // CFI 精确位置：不传/不覆盖由后端兜底处理（避免偶发空值覆盖导致重新打开回到章节开头）
          currentPosition: position.currentLocation || undefined,
          currentPage: position.currentPage || 1,
          totalPages: position.totalPages || 1,
          chapterIndex: position.chapterIndex || 0,
          scrollTop: position.scrollTop || 0,
          paragraphIndex: position.paragraphIndex !== undefined ? position.paragraphIndex : undefined,
          clientTimestamp: new Date().toISOString(),
          sessionId: sessionId || undefined, // 传递会话ID，用于避免同一设备的误判
        });
        // 即使登录，也写一份本机进度用于“打开时对比提示”
        try {
          localStorage.setItem(`reading-position-${bookId}`, JSON.stringify({
            progress: newProgress,
            position,
            timestamp: Date.now(),
          }));
        } catch {
          // ignore
        }
      } catch (error: any) {
        // 跨设备进度冲突：提示用户是否跳转到更新的进度继续阅读
        if (error?.response?.status === 409 && error?.response?.data?.conflict) {
          try {
            const now = Date.now();
            // 409 是“正常的跨端冲突信号”，不作为错误刷屏；同时做节流避免重复触发提示
            if (now - lastConflictPromptAtRef.current < 1500) {
              suppressServerSaveRef.current = true;
              return;
            }
            lastConflictPromptAtRef.current = now;
            const serverProgress = error.response.data.serverProgress || {};
            suppressServerSaveRef.current = true;
            window.dispatchEvent(
              new CustomEvent('__reading_progress_conflict', {
                detail: {
                  bookId,
                  serverProgress,
                },
              })
            );
          } catch {
            // ignore
          }
          return;
        }
        console.error('ReaderNew: 保存进度到服务器失败', error);
        // 如果服务器保存失败，尝试保存到localStorage作为备份
        try {
          localStorage.setItem(`reading-position-${bookId}`, JSON.stringify({
            progress: newProgress,
            position: position,
            timestamp: Date.now(),
          }));
        } catch (e) {
          console.error('ReaderNew: localStorage保存也失败', e);
        }
      }
    } else {
      // 未登录用户，保存到localStorage
      try {
        localStorage.setItem(`reading-position-${bookId}`, JSON.stringify({
          progress: newProgress,
          position: position,
          timestamp: Date.now(),
        }));
      } catch (e) {
        console.error('ReaderNew: localStorage保存失败', e);
      }
    }
  };

  // 用户在提示框里选择“是/否”后，恢复服务端上报（避免一直处于暂停状态）
  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (!detail?.bookId || detail.bookId !== bookId) return;
        suppressServerSaveRef.current = false;
      } catch {
        // ignore
      }
    };
    window.addEventListener('__reading_progress_conflict_resolved' as any, handler);
    return () => window.removeEventListener('__reading_progress_conflict_resolved' as any, handler);
  }, [bookId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">书籍不存在</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const readerConfig: ReaderConfig = {
    book,
    settings,
    initialPosition,
    onSettingsChange: saveSettings,
    onProgressChange: handleProgressChange,
    onClose: () => navigate(-1),
  };

  return <ReaderContainer config={readerConfig} />;
}
