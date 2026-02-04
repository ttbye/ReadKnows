/**
 * @author ttbye
 * 阅读器页面
 * 使用新的阅读器架构
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useAudiobookStore } from '../store/audiobookStore';
import ReaderContainer from '../components/readers/ReaderContainer';
import { ReadingSettings, defaultSettings, BookData, ReadingPosition, ReaderConfig } from '../types/reader';
import { useTranslation } from 'react-i18next';

export default function ReaderNew() {
  const { t } = useTranslation();
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { setCenterButtonMode } = useAudiobookStore();
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

  // 进入阅读页面时，设置中间按钮模式为 'reading'
  useEffect(() => {
    if (bookId) {
      setCenterButtonMode('reading');
    }
  }, [bookId, setCenterButtonMode]);

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

  // 获取阅读设置（优先从服务器获取，用户偏好持久化）
  const fetchSettings = async () => {
    try {
      // 首先尝试从服务器获取用户的阅读设置
      let serverSettings = null;
      try {
        const serverResponse = await api.get('/reading/settings');
        if (serverResponse.data?.settings) {
          serverSettings = serverResponse.data.settings;
        } 
      } catch (serverError: any) {
        console.error('[ReaderNew] 从服务器获取设置失败:', serverError.message);
        if (serverError.response) {
          console.error('[ReaderNew] 服务器响应状态:', serverError.response.status);
          if (serverError.response.status === 401) {
            console.error('[ReaderNew] 用户未认证，请重新登录');
          }
        } else {
          console.error('[ReaderNew] 网络错误，无法连接到服务器');
        }
      }

      // 获取本地设置作为fallback
      const savedSettings = localStorage.getItem('reading-settings');
      const settingsVersion = localStorage.getItem('reading-settings-version');

      let localParsed = null;
      if (savedSettings) {
        try {
          localParsed = JSON.parse(savedSettings);
        } catch (e) {
          console.error('ReaderNew: 解析本地设置失败', e);
        }
      }

      // 设置合并策略：服务器设置优先，本地设置作为fallback
      let finalSettings: ReadingSettings;

      if (serverSettings) {
        // 有服务器设置，使用服务器设置，但合并本地设置中可能缺失的字段
        finalSettings = {
          ...defaultSettings,
          ...localParsed, // 本地设置作为基础
          ...serverSettings, // 服务器设置覆盖本地设置（用户偏好优先）
        };
      } else if (localParsed) {
        // 只有本地设置
        finalSettings = {
          ...defaultSettings,
          ...localParsed,
        };
      } else {
        // 首次使用
        finalSettings = {
          ...defaultSettings,
          fontSize: Math.max(defaultSettings.fontSize, getRecommendedFontSize()),
        };
      }

      // 确保嵌套对象也被正确合并
      finalSettings.keyboardShortcuts = {
        ...defaultSettings.keyboardShortcuts,
        ...(localParsed?.keyboardShortcuts || {}),
        ...(serverSettings?.keyboardShortcuts || {}),
      };

      // 兼容升级逻辑
      if (finalSettings.pageTurnMethod !== 'click' && finalSettings.pageTurnMethod !== 'swipe') {
        finalSettings.pageTurnMethod = 'swipe';
      }
      if (finalSettings.pageTurnMode !== 'horizontal' && finalSettings.pageTurnMode !== 'vertical') {
        finalSettings.pageTurnMode = 'horizontal';
      }
      if (finalSettings.pdfAutoRotate === undefined) {
        finalSettings.pdfAutoRotate = false;
      }

      // 兼容升级：如果老版本默认字号过小
      if (!settingsVersion && !serverSettings) {
        const recommended = getRecommendedFontSize();
        const fontSize = typeof finalSettings.fontSize === 'number' ? finalSettings.fontSize : defaultSettings.fontSize;
        if (fontSize < 18) {
          finalSettings.fontSize = Math.max(18, recommended);
        }
        localStorage.setItem('reading-settings-version', '2');
      }

      // console.log('[ReaderNew] 最终设置:', {
      //   source: serverSettings ? 'server' : localParsed ? 'local' : 'default',
      //   fontSize: finalSettings.fontSize,
      //   fontFamily: finalSettings.fontFamily,
      //   theme: finalSettings.theme,
      //   hasServerSettings: !!serverSettings,
      //   hasLocalSettings: !!localParsed,
      // });

    // 如果有服务器设置，检查字体设置
    if (serverSettings && serverSettings.fontFamily) {
      // console.log('[ReaderNew] 服务器字体设置:', serverSettings.fontFamily);
    }
    if (localParsed && localParsed.fontFamily) {
      // console.log('[ReaderNew] 本地字体设置:', localParsed.fontFamily);
    }

      if (serverSettings) {
        // console.log('[ReaderNew] 服务器设置详情:', serverSettings);
      }
      if (localParsed) {
        // console.log('[ReaderNew] 本地设置详情:', localParsed);
      }

      setSettings(finalSettings);

      // 保存最终设置到本地存储（作为缓存）
      try {
        localStorage.setItem('reading-settings', JSON.stringify(finalSettings));
      } catch (e) {
        console.warn('保存设置到本地存储失败:', e);
      }
    } catch (error) {
      console.error('ReaderNew: 获取阅读设置失败', error);
      setSettings(defaultSettings);
    }
  };

  // 保存阅读设置（同时保存到服务器和本地）
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

    // 保存到服务器（用户偏好持久化）
    try {
      const response = await api.post('/reading/settings', completeSettings);
    } catch (serverError: any) {
      console.error('[ReaderNew] 保存设置到服务器失败:', serverError.message);
      if (serverError.response) {
        console.error('[ReaderNew] 服务器响应状态:', serverError.response.status);
        console.error('[ReaderNew] 服务器响应数据:', serverError.response.data);
      } else if (serverError.request) {
        console.error('[ReaderNew] 网络请求失败，无响应');
      }
      // 服务器保存失败不影响本地保存
    }

    // 保存到本地存储（作为缓存和离线支持）
    try {
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
      
      // console.log('[ReaderNew] 设置已保存到 localStorage:', {
      //   fontSize: completeSettings.fontSize,
      //   fontFamily: completeSettings.fontFamily,
      //   lineHeight: completeSettings.lineHeight,
      //   theme: completeSettings.theme,
      //   margin: completeSettings.margin,
      //   textIndent: completeSettings.textIndent,
      //   ttsSpeed: settingsAny.tts_default_speed?.value,
      //   ttsModel: settingsAny.tts_default_model?.value,
      //   ttsVoice: settingsAny.tts_default_voice?.value,
      // });
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
          toast.error(t('reader.bookNotFound'));
          setTimeout(() => navigate(-1), 1000);
          return;
        }

        // 如果是 Office 文件，检查是否有 PDF 版本，优先使用 PDF 阅读器
        const officeTypes = ['docx', 'doc', 'xlsx', 'xls', 'pptx'];
        if (officeTypes.includes(bookData.file_type?.toLowerCase())) {
          const pdfFormat = formats.find((f: any) => f.file_type?.toLowerCase() === 'pdf');
          if (pdfFormat) {
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

        // 若从书摘「打开并定位」进入，优先使用传入的进度，跳过服务端/本地进度
        const fromExcerpt = (location.state as { initialPosition?: Partial<ReadingPosition> })?.initialPosition;
        if (fromExcerpt && typeof fromExcerpt.progress === 'number') {
          const pos: ReadingPosition = {
            progress: fromExcerpt.progress,
            currentPage: fromExcerpt.currentPage ?? 1,
            totalPages: fromExcerpt.totalPages ?? 1,
            chapterIndex: fromExcerpt.chapterIndex ?? 0,
            chapterTitle: fromExcerpt.chapterTitle,
            currentLocation: fromExcerpt.currentLocation,
            scrollTop: fromExcerpt.scrollTop,
            paragraphIndex: fromExcerpt.paragraphIndex,
          };
          setInitialPosition(pos);
          lastLocalProgressRef.current = fromExcerpt.progress;
          setLoading(false);
          return;
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
        toast.error(t('reader.loadFailed', { error: error.message || t('reader.unknownError') }));
        setLoading(false);
      }
    };

    fetchBook();
  }, [bookId, isAuthenticated, navigate, location]);

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
            
            await api.post(`/reading/history/session/${sessionId}`, { _method: 'PUT', 
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

  // 监听Android返回按钮触发的阅读器关闭事件
  // 必须在所有条件返回之前调用，遵守React Hooks规则
  useEffect(() => {
    const handleReaderClose = () => {
      navigate(-1);
    };
    
    window.addEventListener('readerClose', handleReaderClose);
    
    return () => {
      window.removeEventListener('readerClose', handleReaderClose);
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">{t('reader.bookNotFound')}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t('common.back')}
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
