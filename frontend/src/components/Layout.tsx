/**
 * @file Layout.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Book, Upload, History, LogOut, Menu, X, Settings, Library, Users, Shield, ChevronDown, ChevronLeft, BookOpen, StickyNote, Sparkles, Sun, Moon, Monitor, FolderOpen, Type, UserCog, Mail, MessageCircle, UserPlus, User, Music, Play, Pause, FileText, Bell } from 'lucide-react';
import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import api, { getAvatarUrl } from '../utils/api';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { useAudiobookStore } from '../store/audiobookStore';
// 在 Layout.tsx 顶部导入
import { usePWATheme } from '../hooks/usePWATheme';
import { useDomTheme } from '../hooks/useDomTheme';
import { stopAllRegisteredAudios } from '../utils/audioRegistry';
import { syncTimezoneFromBackend, syncTimezoneFromBackendGlobal } from '../utils/timezone';



interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isReaderPage = location.pathname.startsWith('/reader/');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, effectiveTheme, setTheme } = useTheme();
  const domTheme = useDomTheme();
  const { t } = useTranslation();

  // 权限计算 - 提前定义以避免初始化顺序问题
  const canUseFriends = user?.can_use_friends !== undefined ? user.can_use_friends : true;
  const [systemTitle, setSystemTitle] = useState<string>('读士私人书库');
  const [unreadMessageCount, setUnreadMessageCount] = useState<number>(0);
  const previousUnreadCountRef = useRef<number>(0); // 用于检测未读数变化
  const unreadCountForbiddenRef = useRef<boolean>(false); // 403 时不再轮询未读消息
  const [isPWA, setIsPWA] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [navMiniInfo, setNavMiniInfo] = useState<{ title: string; author?: string; cover?: string | null } | null>(null);
  // 监听 DOM 主题变化，保持 PWA meta 状态栏与主题同步（阅读页由 ReaderContainer 自己处理）
  usePWATheme({ disabled: isReaderPage });
  // 全局音频播放状态
  const {
    isPlaying,
    audiobookTitle,
    audiobookAuthor,
    audiobookCover,
    audiobookId,
    currentFileId,
    currentTime,
    duration,
    showMiniPlayer,
    showPlayer,
    centerButtonMode,
    setShowPlayer,
    setShowMiniPlayer,
    setCenterButtonMode,
  } = useAudiobookStore();
  
  // 播放控制函数（通过事件触发）
  const handlePlayPause = () => {
    window.dispatchEvent(new CustomEvent('audiobook:playPause'));
  };
  
  const handlePrevious = () => {
    window.dispatchEvent(new CustomEvent('audiobook:previous'));
  };
  
  const handleNext = () => {
    window.dispatchEvent(new CustomEvent('audiobook:next'));
  };

  // 处理停止播放（显示确认对话框）
  const handleStop = () => {
    if (!audiobookId || !currentFileId) return;
    setShowStopConfirm(true);
  };

  // 确认停止播放
  const confirmStop = async () => {
    // 停止播放时，清除中间按钮模式（让用户重新选择）
    setCenterButtonMode(null);
    setShowStopConfirm(false);
    
    if (!audiobookId || !currentFileId) {
      console.warn('无法停止播放：缺少必要信息', { audiobookId, currentFileId });
      return;
    }
    
    // ✅ 修复：保存audiobookId，用于跳转到详细页面
    const targetAudiobookId = audiobookId;
    
    // 先保存当前播放进度（如果store中有进度信息）
    if (currentTime > 0 && duration > 0) {
      try {
        await api.post(`/audiobooks/${targetAudiobookId}/progress`, {
          fileId: currentFileId,
          currentTime: currentTime,
          duration: duration,
          clientTimestamp: Date.now(), // 添加客户端时间戳，用于并发控制
        });
        console.log('播放进度已保存');

        // 调试日志：停止播放时打印最后file id和进度
        console.log('🎵 [有声小说调试] 停止播放时最后file id:', currentFileId, '进度:', currentTime, '/', duration, '百分比:', ((currentTime / duration) * 100).toFixed(2) + '%');
      } catch (error: any) {
        console.error('保存进度失败:', error);
        // 即使保存失败，也继续停止播放
      }
    }
    
    // 直接停止所有音频播放（不依赖组件挂载）
    // ✅ 先停掉所有“注册过的游离音频”（new Audio() 生成、但不在 DOM 的那种）
    stopAllRegisteredAudios({ revokeBlobUrl: true });
    // 1. 强制停止所有audio元素（包括暂停和重置时间）
    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      let stoppedCount = 0;
      allAudios.forEach((audioEl) => {
        try {
          // 强制暂停（即使已经暂停也执行，确保状态正确）
          audioEl.pause();
          audioEl.currentTime = 0;
          // 移除所有事件监听器，防止自动播放
          audioEl.onplay = null;
          audioEl.onpause = null;
          audioEl.onended = null;
          // 如果src是blob URL，清理它
          if (audioEl.src && audioEl.src.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(audioEl.src);
            } catch (e) {
              console.warn('清理blob URL失败:', e);
            }
          }
          stoppedCount++;
        } catch (error) {
          console.warn('停止音频元素失败:', error);
        }
      });
      console.log(`已停止 ${stoppedCount} 个音频元素`);
    }
    
    // 2. 清理全局音频管理器（通过window对象访问，如果存在）
    try {
      // 尝试通过自定义事件通知清理全局音频管理器
      window.dispatchEvent(new CustomEvent('audiobook:clearGlobalManager'));
    } catch (e) {
      console.warn('清理全局音频管理器失败:', e);
    }
    
    // 3. 触发停止事件（让AudiobookPlayer组件也处理，如果它存在）
    const stopEvent = new CustomEvent('audiobook:stop');
    window.dispatchEvent(stopEvent);
    console.log('已触发停止播放事件');
    
    // 4. 重置全局状态（确保迷你播放器关闭）
    // 使用 getState() 直接访问 store，避免 Hook 规则问题
    const store = useAudiobookStore.getState();
    // 先停止播放状态
    store.setPlaying(false);
    // 隐藏迷你播放器
    store.setShowMiniPlayer(false);
    // 清除中间按钮模式（让用户重新选择）
    store.setCenterButtonMode(null);
    // 完全重置所有状态（这会清除audiobookId、audiobookTitle等）
    store.reset();
    console.log('已重置全局播放状态，迷你播放器已隐藏');
    
    // 5. 延迟再次检查，确保所有音频都已停止（防止异步问题）
    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const remainingAudios = document.querySelectorAll('audio');
        let stillPlaying = 0;
        remainingAudios.forEach((audioEl) => {
          if (!audioEl.paused) {
            audioEl.pause();
            audioEl.currentTime = 0;
            stillPlaying++;
          }
        });
        if (stillPlaying > 0) {
          console.warn(`发现 ${stillPlaying} 个仍在播放的音频元素，已强制停止`);
        }
      }
    }, 100);
    
    // ✅ 修复：停止播放后跳转到有声小说详细页面，而不是刷新页面
    setTimeout(() => {
      console.log('停止播放完成，跳转到有声小说详细页面', { audiobookId: targetAudiobookId });
      navigate(`/audiobooks/${targetAudiobookId}`);
    }, 200);
  };

  // 监听页面切换，如果正在播放且不在有声小说详情页，自动显示迷你播放器
  useEffect(() => {
    const isAudiobookDetailPage = location.pathname.startsWith('/audiobooks/') && location.pathname.split('/').length === 3;
    
    // 如果在有声小说详情页，立即隐藏迷你播放器（因为完整播放器会显示）
    if (isAudiobookDetailPage) {
      setShowMiniPlayer(false);
      return; // 提前返回，不执行后续逻辑
    }
    
    // 如果有播放进程（audiobookId存在），显示迷你播放器
    // 注意：即使 isPlaying 为 false，只要 audiobookId 存在，也应该显示迷你播放器（用户可以点击继续播放）
    // 但如果明确调用了 reset()，audiobookId 会被清除，此时不应该显示
    if (audiobookId && audiobookTitle) {
      // 延迟一小段时间，确保状态已同步
      const timer = setTimeout(() => {
        setShowMiniPlayer(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // 如果没有播放进程，隐藏迷你播放器
      setShowMiniPlayer(false);
    }
  }, [location.pathname, isPlaying, audiobookId, audiobookTitle, setShowMiniPlayer]);

  // 监听有声小说详情页的导航栏迷你介绍事件
  useEffect(() => {
    const handleShowNavMini = (e: CustomEvent) => {
      if (location.pathname.startsWith('/audiobooks/') && location.pathname.split('/').length === 3) {
        setNavMiniInfo(e.detail);
      }
    };
    
    const handleHideNavMini = () => {
      setNavMiniInfo(null);
    };
    
    window.addEventListener('audiobook:showNavMini', handleShowNavMini as EventListener);
    window.addEventListener('audiobook:hideNavMini', handleHideNavMini);
    
    return () => {
      window.removeEventListener('audiobook:showNavMini', handleShowNavMini as EventListener);
      window.removeEventListener('audiobook:hideNavMini', handleHideNavMini);
    };
  }, [location.pathname]);

  // 检测PWA模式（兼容不同浏览器 / WebView 的实现，避免在不支持 addEventListener 的环境中报错）
  useEffect(() => {
    const checkPWA = () => {
      try {
        const hasMatchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
        const mediaQuery = hasMatchMedia ? window.matchMedia('(display-mode: standalone)') : null;
        const isStandalone = !!mediaQuery && mediaQuery.matches;
      const isFullscreen = (window.navigator as any).standalone === true; // iOS Safari
      setIsPWA(isStandalone || isFullscreen);
      } catch (e) {
        // 某些 WebView 可能不完全支持 matchMedia，静默失败即可
        setIsPWA(false);
      }
    };

    checkPWA();

    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
        const handler = () => checkPWA();

        // 兼容旧版浏览器 / WebView：优先使用 addEventListener，否则回退到 addListener
        if (typeof (mediaQuery as any).addEventListener === 'function') {
          (mediaQuery as any).addEventListener('change', handler);
          return () => (mediaQuery as any).removeEventListener('change', handler);
        } else if (typeof (mediaQuery as any).addListener === 'function') {
          (mediaQuery as any).addListener(handler);
          return () => (mediaQuery as any).removeListener(handler);
        }
      }
    } catch {
      // 忽略监听相关错误
    }

    // 默认清理函数
    return () => {};
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 最近阅读功能
  const [latestBook, setLatestBook] = useState<any>(null);
  const [latestAudiobook, setLatestAudiobook] = useState<any>(null);
  
  // 获取系统标题（延迟加载，避免阻塞页面渲染）
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // 延迟500ms加载，让页面先渲染
    const timer = setTimeout(async () => {
        try {
          // 先同步时区设置
          await syncTimezoneFromBackendGlobal();

          // 然后获取系统标题等其他设置
          const response = await api.get('/settings', { timeout: 3000 });
          const settings = response.data.settings || {};
          const title = settings.system_title?.value || '读士私人书库';
          setSystemTitle(title);
          // 更新页面标题
          document.title = title;
          // 更新meta标签
          const metaTitle = document.querySelector('meta[name="application-name"]');
          if (metaTitle) {
            metaTitle.setAttribute('content', title);
          }
          const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
          if (appleTitle) {
            appleTitle.setAttribute('content', title);
          }
        } catch (error) {
          // 静默失败，使用默认标题
          console.error('获取系统标题失败:', error);
        }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [isAuthenticated]);
  
  // 获取最近阅读和播放记录（延迟加载）
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // 延迟1秒加载，优先级更低
    const timer = setTimeout(() => {
      fetchLatestReading();
      fetchLatestAudiobook();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const fetchLatestReading = async () => {
    try {
      const response = await api.get('/reading/progress?limit=1', { timeout: 3000 });
      if (response.data.progresses && response.data.progresses.length > 0) {
        setLatestBook(response.data.progresses[0]);
      }
    } catch (error) {
      // 静默失败，不影响页面
      console.error('获取最近阅读失败:', error);
    }
  };

  const fetchLatestAudiobook = async () => {
    try {
      const response = await api.get('/audiobooks/history/list?pageSize=1', { timeout: 3000 });
      if (response.data.success && response.data.history && response.data.history.length > 0) {
        setLatestAudiobook(response.data.history[0]);
      }
    } catch (error) {
      // 静默失败，不影响页面
      console.error('获取最近播放失败:', error);
    }
  };

  const fetchUnreadMessageCount = async (): Promise<boolean> => {
    if (unreadCountForbiddenRef.current) return false;
    try {
      let response;
      try {
        response = await api.get('/messages/unread-count', { timeout: 3000 });
      } catch (error: any) {
        // 403 表示无书友/消息权限，不再轮询
        if (error.response?.status === 403) {
          unreadCountForbiddenRef.current = true;
          setUnreadMessageCount(0);
          return false;
        }
        // 如果是429错误，重试一次
        if (error.response?.status === 429) {
          console.warn('[fetchUnreadMessageCount] 429错误，等待1秒后重试');
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get('/messages/unread-count', { timeout: 3000 });
        } else {
          throw error;
        }
      }
      const newCount = response.data.count || 0;
      const oldCount = previousUnreadCountRef.current;
      
      // 如果未读数增加，触发新消息事件
      if (newCount > oldCount && oldCount >= 0) {
        window.dispatchEvent(new CustomEvent('messages:newMessageReceived', {
          detail: { unreadCount: newCount, previousCount: oldCount }
        }));
      }
      
      previousUnreadCountRef.current = newCount;
      setUnreadMessageCount(newCount);
      return true; // 成功
    } catch (error: any) {
      if (error.response?.status === 403) {
        unreadCountForbiddenRef.current = true;
        setUnreadMessageCount(0);
        return false;
      }
      // 如果是连接错误（后端未运行），静默失败，不频繁报错
      const isConnectionError = error.code === 'ECONNREFUSED' ||
                                error.code === 'ERR_NETWORK' ||
                                error.message?.includes('ECONNREFUSED') ||
                                error.message?.includes('Network Error');

      if (!isConnectionError) {
        // 只有非连接错误才记录日志
        console.error('获取未读消息数失败:', error);
      }
      return false; // 失败
    }
  };

  // 获取未读消息数
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!canUseFriends) return;
    if (unreadCountForbiddenRef.current) return;
    
    let retryCount = 0;
    const maxRetries = 3; // 最多重试3次
    let intervalId: NodeJS.Timeout | null = null;
    let isPolling = true;
    
    // 监听消息未读数变化事件（当消息被阅读时触发）
    const handleUnreadCountChanged = () => {
      // 立即刷新未读消息数，延迟一下确保后端已更新
      setTimeout(() => {
        fetchUnreadMessageCount();
      }, 100);
    };
    
    window.addEventListener('messages:unreadCountChanged', handleUnreadCountChanged);
    
    const startPolling = async () => {
      // 延迟1.5秒加载，优先级更低
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (!isPolling) return;
      
      const success = await fetchUnreadMessageCount();
      if (success) {
        retryCount = 0; // 重置重试计数
        // 每30秒刷新一次未读消息数
        intervalId = setInterval(async () => {
          if (!isPolling) {
            if (intervalId) {
              clearInterval(intervalId);
            }
            return;
          }
          
          const success = await fetchUnreadMessageCount();
          if (!success) {
            retryCount++;
            // 如果连续失败3次，停止轮询（可能是后端未运行）
            if (retryCount >= maxRetries) {
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
            }
          } else {
            retryCount = 0; // 成功时重置计数
          }
        }, 30000);
      } else {
        retryCount++;
        // 如果初始请求失败，延迟重试
        if (retryCount < maxRetries && isPolling) {
          setTimeout(startPolling, 10000); // 10秒后重试
        }
      }
    };
    
    startPolling();
    
    return () => {
      isPolling = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener('messages:unreadCountChanged', handleUnreadCountChanged);
    };
  }, [isAuthenticated, canUseFriends, location.pathname]); // 当路由变化时也刷新

  const handleReadingClick = () => {
    if (latestBook && latestBook.book_id) {
      navigate(`/reader/${latestBook.book_id}`);
    } else {
      // 如果没有最近阅读，跳转到图书馆
      navigate('/books');
    }
  };

  // 监听路由变化，自动设置中间按钮模式
  useEffect(() => {
    // 如果进入阅读页面，设置模式为 'reading'
    if (location.pathname.startsWith('/reader/')) {
      setCenterButtonMode('reading');
    }
    // 如果进入播放页面，设置模式为 'audiobook'（如果正在播放）
    else if (location.pathname.startsWith('/audiobooks/') && location.pathname.includes('/player')) {
      if (audiobookId && audiobookTitle) {
        setCenterButtonMode('audiobook');
      }
    }
  }, [location.pathname, audiobookId, audiobookTitle, setCenterButtonMode]);

  // 处理中间按钮点击（播放控制或阅读）
  const handleCenterButtonClick = (e?: React.MouseEvent) => {
    // 如果有播放中的有声小说（audiobookId和audiobookTitle都存在，说明正在播放）
    if (audiobookId && audiobookTitle) {
      // 检查当前是否在播放控制页面（播放页面路由）
      const isInPlayerPage = location.pathname === `/audiobooks/${audiobookId}/player`;
      
      if (isInPlayerPage) {
        // 如果当前在播放控制页面，点击用于控制播放/暂停
        handlePlayPause();
      } else {
        // 如果不在播放控制页面，跳转到播放控制页面
        navigate(`/audiobooks/${audiobookId}/player`);
      }
    } else {
      // 没有播放中的有声小说，根据全局模式判断
      if (centerButtonMode === 'reading') {
        // 阅读模式：进入最后阅读页面
        if (latestBook && latestBook.book_id) {
          navigate(`/reader/${latestBook.book_id}`);
        } else {
          navigate('/books');
        }
      } else if (centerButtonMode === 'audiobook') {
        // 有声小说模式：进入播放控制页面
        if (latestAudiobook && latestAudiobook.audiobook_id) {
          navigate(`/audiobooks/${latestAudiobook.audiobook_id}/player?autoPlay=true`);
        } else {
          navigate('/audiobooks');
        }
      } else {
        // 模式未设置，根据最后一次操作决定（降级方案）
        // 优先检查是否有最近阅读记录
        if (latestBook && latestBook.book_id) {
          // 有最近阅读记录，检查是否有最近播放记录
          if (latestAudiobook && latestAudiobook.last_played_at) {
            // 比较时间：如果阅读时间比播放时间更新，进入阅读页面；否则进入播放页面
            const readingTime = latestBook.last_read_at ? new Date(latestBook.last_read_at).getTime() : 0;
            const audiobookTime = new Date(latestAudiobook.last_played_at).getTime();
            
            if (readingTime >= audiobookTime) {
              // 最后一次操作是阅读（或阅读和播放时间相同，优先阅读），进入阅读页面
              navigate(`/reader/${latestBook.book_id}`);
            } else {
              // 最后一次操作是播放，进入播放页面
              navigate(`/audiobooks/${latestAudiobook.audiobook_id}/player?autoPlay=true`);
            }
          } else {
            // 只有阅读记录，没有播放记录，进入阅读页面
            navigate(`/reader/${latestBook.book_id}`);
          }
        } else if (latestAudiobook && latestAudiobook.audiobook_id) {
          // 没有阅读记录，但有播放记录，进入播放页面
          navigate(`/audiobooks/${latestAudiobook.audiobook_id}/player?autoPlay=true`);
        } else {
          // 都没有，跳转到图书馆
          navigate('/books');
        }
      }
    }
  };

  // 移动端底部导航项（5个按钮：图书馆、书架、播放/阅读、有声小说、我的）
  const mobileNavItems = isAuthenticated
    ? [
        { path: '/books', label: t('navigation.library'), icon: Library, onClick: null },
        { path: '/', label: t('navigation.myShelf'), icon: Book, onClick: null },
        { path: '#', label: audiobookId ? t('audiobook.title') : t('navigation.reading'), icon: audiobookId ? Music : BookOpen, onClick: handleCenterButtonClick, isSpecial: true },
        { path: '/audiobooks', label: t('audiobook.title'), icon: Music, onClick: null },
        { path: '/profile', label: t('navigation.my'), icon: Settings, onClick: null },
      ]
    : [
        { path: '/books', label: t('navigation.library'), icon: Library, onClick: null },
      ];

  // 桌面端导航项（简化版，设置项合并到下拉菜单）
  const desktopNavItems = [
    ...(isAuthenticated
      ? [
          { path: '/', label: t('navigation.myShelf'), icon: Book },
        ]
      : []),
    { path: '/books', label: t('navigation.library'), icon: Library },
    { path: '/audiobooks', label: t('audiobook.title'), icon: Music },
    ...(isAuthenticated
      ? [
          { path: '/history', label: t('navigation.readingHistory'), icon: History },
          { path: '/notes', label: t('navigation.notes'), icon: StickyNote },
          { path: '/ai-reading', label: t('navigation.aiReading'), icon: Sparkles },
        ]
      : []),
  ];

  // 设置菜单项
  const canUploadBooks = user?.can_upload_books !== undefined ? user.can_upload_books : true;
  const settingsMenuItems = isAuthenticated
    ? [
        { path: '/profile', label: t('profile.my'), icon: User },
        { path: '/settings', label: t('navigation.systemSettings'), icon: Settings },
        ...(canUploadBooks ? [{ path: '/upload', label: t('navigation.uploadBook'), icon: Upload }] : []),
        ...(canUseFriends ? [{ path: '/messages', label: t('friends.title'), icon: Bell }] : []),
        ...(user?.role === 'admin'
          ? [
              { path: '/books-management', label: t('navigation.bookManagement'), icon: FolderOpen },
              { path: '/users', label: t('navigation.userManagement'), icon: Users },
              { path: '/ip-management', label: t('navigation.securityManagement'), icon: Shield },
              { path: '/category-management', label: t('navigation.categoryManagement'), icon: Type },
              { path: '/logs', label: '日志管理', icon: FileText },
            ]
          : []),
      ]
    : [];

  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭设置菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };

    if (settingsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [settingsMenuOpen]);

  // 点击外部关闭用户菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  // 判断是否为首页（需要显示返回按钮的页面）
  const isHomePage = location.pathname === '/' || 
                     location.pathname === '/books' || 
                     location.pathname === '/login' || 
                     location.pathname === '/register' ||
                     location.pathname === '/profile' ||
                     location.pathname === '/category-management' ||
                     location.pathname === '/notes';
  
  // ✅ 修复：获取返回目标路径（子页面返回上一级）
  // 使用更智能的逻辑，优先使用浏览器历史记录，如果没有则使用路径映射
  const getBackPath = () => {
    const path = location.pathname;
    
    // 有声小说相关页面
    if (path.startsWith('/audiobooks/') && path.includes('/player')) {
      // 从播放页面返回到详情页面
      const audiobookId = path.split('/')[2];
      return audiobookId ? `/audiobooks/${audiobookId}` : '/audiobooks';
    }
    if (path.startsWith('/audiobooks/')) {
      // 从详情页面返回到列表页面
      return '/audiobooks';
    }
    
    // 书籍相关页面
    if (path.startsWith('/books/')) {
      return '/books';
    }
    if (path.startsWith('/reader/')) {
      // 从阅读器返回到书籍详情或首页
      // 尝试从历史记录获取，如果没有则返回首页
      return '/';
    }
    
    // 个人中心相关页面
    if (path.startsWith('/profile/account')) return '/profile';
    if (path.startsWith('/settings')) return '/profile';
    if (path.startsWith('/users')) return '/profile';
    if (path.startsWith('/ip-management')) return '/profile';
    if (path.startsWith('/logs')) return '/profile';
    if (path.startsWith('/upload')) return '/profile';
    if (path.startsWith('/history')) return '/profile';
    if (path.startsWith('/books-management')) return '/profile';
    if (path.startsWith('/ai-reading')) return '/profile';
    
    // 笔记相关页面
    if (path.startsWith('/notes')) return '/notes';
    
    // 其他页面默认返回首页
    return '/';
  };

  // 根据路径获取页面标题
  const getPageTitle = () => {
    if (location.pathname === '/') return t('navigation.myShelf');
    if (location.pathname === '/books' || location.pathname.startsWith('/books/')) return t('navigation.library');
    if (location.pathname === '/upload') return t('navigation.uploadBook');
    if (location.pathname === '/history') return t('navigation.readingHistory');
    if (location.pathname === '/settings' || location.pathname.startsWith('/settings')) return t('navigation.systemSettings');
    if (location.pathname === '/profile/account') return t('navigation.accountManagement');
    if (location.pathname === '/profile' || location.pathname.startsWith('/profile')) return t('navigation.my');
    if (location.pathname === '/users') return t('navigation.userManagement');
    if (location.pathname === '/ip-management') return t('navigation.securityManagement');
    if (location.pathname === '/logs') return '日志管理';
    if (location.pathname === '/books-management') return t('navigation.bookManagement');
    if (location.pathname === '/notes' || location.pathname.startsWith('/notes')) return t('navigation.notes');
    if (location.pathname === '/ai-reading' || location.pathname.startsWith('/ai-reading')) return t('navigation.aiReading');
    if (location.pathname.startsWith('/reader/')) return t('navigation.reading');
    if (location.pathname === '/login') return t('auth.login');
    if (location.pathname === '/register') return t('auth.register');
    return 'ReadKnow';
  };

  // 设置HTML和body的背景色为系统主题色（非阅读器页面）
  useEffect(() => {
    // 只在非阅读器页面设置
    if (!location.pathname.startsWith('/reader')) {
      const bgColor = effectiveTheme === 'dark' ? '#030712' : '#f9fafb'; // bg-gray-950 : bg-gray-50
      
      document.documentElement.style.backgroundColor = bgColor;
      document.body.style.backgroundColor = bgColor;
    }
  }, [location.pathname, effectiveTheme]);

  // ✅ 修复：更新PWA状态栏颜色和iOS状态栏样式
  useEffect(() => {
    const themeColor = effectiveTheme === 'dark' ? '#111827' : '#ffffff';
    
    // 更新 theme-color meta 标签
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', themeColor);
    
    // ✅ 修复：更新iOS状态栏样式（PWA模式下）
    // iOS 状态栏样式：
    // - 'default': 浅色背景，深色文字（适合浅色主题）
    // - 'black': 深色背景，浅色文字（适合深色主题）
    let metaAppleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!metaAppleStatusBar) {
      metaAppleStatusBar = document.createElement('meta');
      metaAppleStatusBar.setAttribute('name', 'apple-mobile-web-app-status-bar-style');
      document.head.appendChild(metaAppleStatusBar);
    }
    const statusBarStyle = effectiveTheme === 'dark' ? 'black' : 'default';
    metaAppleStatusBar.setAttribute('content', statusBarStyle);
    
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    if (isPWA) {
      console.log('[Layout] 更新PWA状态栏样式', { 
        theme: effectiveTheme, 
        themeColor,
        statusBarStyle 
      });
    }
  }, [effectiveTheme]);


  
  const isMessagesPage = location.pathname === '/messages';

  return (
    <div
      className={`min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 ${isMessagesPage ? 'h-screen overflow-hidden' : ''}`}
      onContextMenu={(e) => {
        // 全局屏蔽浏览器默认右键菜单（应用有自己的右键菜单）
        e.preventDefault();
      }}
    >
      {/* ✅ 修复：PWA模式下顶部状态栏占位div，确保状态栏背景色正确 */}
      {/* 注意：阅读页面有自己的状态栏处理，这里不显示 */}
      {/* 使用 CSS 变量（--status-bar-bg）避免依赖局部主题状态导致“需重启才生效” */}
      {isPWA && !isReaderPage && (
        <div
          key={`status-bar-${domTheme}`}
          data-status-bar-placeholder="true"
          className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none"
          style={{
            height: 'env(safe-area-inset-top, 0px)',
            backgroundColor: 'var(--status-bar-bg)',
            // 规避部分 PWA/WebView 下 fixed + 变量更新不重绘
            transform: 'translateZ(0)',
          }}
        />
      )}
      {/* 顶部导航栏 - 桌面端（仅在大屏幕显示，iPad不显示） */}
      <header
        data-nav="true"
        role="navigation" 
        className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 shadow-sm lg:block hidden" 
        style={{ 
          // PC端只在PWA模式下才需要安全区域，普通浏览器不需要
          paddingTop: isPWA ? 'env(safe-area-inset-top, 0px)' : '0px'
        }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between" style={{ height: '56px' }}>
            <div className="flex items-center gap-4">
              {/* 返回按钮 - 非首页显示在最左侧 */}
              {!isHomePage && (
                <button
                  onClick={() => {
                    // ✅ 修复：优先使用浏览器历史记录，如果没有则使用智能路径
                    const backPath = getBackPath();
                    if (window.history.length > 1) {
                      // 尝试使用浏览器历史记录
                      navigate(-1);
                    } else {
                      // 如果没有历史记录，使用智能路径
                      navigate(backPath);
                    }
                  }}
                  className="flex items-center justify-center p-2.5 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all relative group"
                  title={t('common.back')}
                >
                  <ChevronLeft className="w-5 h-5" />
                  {/* Tooltip */}
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-800 rounded-md shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-gray-900 dark:before:border-t-gray-800">
                    {t('common.back')}
                  </span>
                </button>
              )}
              <div className="flex items-center gap-2 text-xl font-bold text-blue-600 dark:text-blue-400">
                <Book className="w-6 h-6" />
                <span>{getPageTitle()}</span>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-2">
              {desktopNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                  (item.path === '/books' && location.pathname.startsWith('/books') && location.pathname !== '/books') ||
                  (item.path === '/audiobooks' && location.pathname.startsWith('/audiobooks')) ||
                  (item.path === '/ai-reading' && location.pathname.startsWith('/ai-reading'));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center justify-center p-2.5 rounded-xl transition-all duration-200 relative group ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-900/30 shadow-sm ring-1 ring-blue-200/50 dark:ring-blue-800/50'
                        : 'text-gray-600 dark:text-gray-400 bg-gray-50/50 dark:bg-gray-800/30 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-900/20 hover:shadow-sm hover:ring-1 hover:ring-blue-200/30 dark:hover:ring-blue-800/30'
                    }`}
                    title={item.label}
                  >
                    <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} strokeWidth={isActive ? 2.5 : 2} />
                    {/* Tooltip */}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-800 rounded-md shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 before:content-[''] before:absolute before:top-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-t-gray-900 dark:before:border-t-gray-800">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="hidden lg:flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  {/* 全局音频播放控制按钮 - 桌面端显示（简化版迷你播放器） */}
                  {showMiniPlayer && audiobookTitle && (
                    <div className="flex items-center gap-2">
                      {/* 播放/暂停按钮 - 扁平化设计 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPause();
                        }}
                        className="relative w-10 h-10 rounded-lg overflow-hidden transition-all duration-200 shadow-md hover:shadow-lg active:shadow-sm flex items-center justify-center"
                        style={{ aspectRatio: '1 / 1' }}
                        title={isPlaying ? `${t('common.pause') || '暂停'} - ${audiobookTitle}` : `${t('common.play') || '播放'} - ${audiobookTitle}`}
                      >
                        {audiobookCover ? (
                          <>
                            <img 
                              src={audiobookCover} 
                              alt={audiobookTitle}
                              className="w-full h-full object-cover"
                            />
                            {/* 播放/暂停图标覆盖层 - 扁平化 */}
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-colors">
                              {isPlaying ? (
                                <Pause className="w-4 h-4 flex-shrink-0" fill="white" stroke="none" />
                              ) : (
                                <Play className="w-4 h-4 flex-shrink-0" fill="white" stroke="none" style={{ marginLeft: '1px' }} />
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center">
                            {isPlaying ? (
                              <Pause className="w-4 h-4 flex-shrink-0" fill="white" stroke="none" />
                            ) : (
                              <Play className="w-4 h-4 flex-shrink-0" fill="white" stroke="none" style={{ marginLeft: '1px' }} />
                            )}
                          </div>
                        )}
                      </button>
                      {/* 点击打开播放控制页面（桌面端也跳转 /player，避免详情页无控播放） */}
                      <button
                        onClick={() => {
                          navigate(`/audiobooks/${audiobookId}/player`);
                          setShowPlayer(true);
                          setShowMiniPlayer(false);
                        }}
                        className="px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors text-xs font-medium max-w-[100px] truncate"
                        title={audiobookTitle}
                      >
                        {audiobookTitle}
                      </button>
                      {/* 停止播放按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStop();
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title={t('audiobook.stop') || '停止播放'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {/* 用户头像下拉菜单 */}
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-blue-600 flex-shrink-0">
                        {user?.avatar_path && getAvatarUrl(user.avatar_path) ? (
                          <img src={getAvatarUrl(user.avatar_path)!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-sm font-medium">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                        )}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {user?.username}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {userMenuOpen && (
                      <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                        {settingsMenuItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location.pathname === item.path ||
                            (item.path === '/profile' && (location.pathname === '/profile' || location.pathname.startsWith('/profile/'))) ||
                            (item.path === '/settings' && location.pathname.startsWith('/settings')) ||
                            (item.path === '/upload' && location.pathname === '/upload') ||
                            (item.path === '/books-management' && location.pathname === '/books-management') ||
                            (item.path === '/users' && location.pathname === '/users') ||
                            (item.path === '/ip-management' && location.pathname === '/ip-management') ||
                            (item.path === '/category-management' && location.pathname === '/category-management') ||
                            (item.path === '/logs' && location.pathname === '/logs') ||
                            (item.path === '/groups' && location.pathname.startsWith('/groups')) ||
                            (item.path === '/friends' && location.pathname.startsWith('/friends')) ||
                            (item.path === '/messages' && location.pathname.startsWith('/messages'));
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              onClick={() => {
                                setUserMenuOpen(false);
                                if (item.path === '/messages') {
                                  fetchUnreadMessageCount();
                                }
                              }}
                              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                                isActive
                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              {item.path === '/messages' ? (
                                <Bell className={`w-4 h-4 transition-colors ${
                                  unreadMessageCount > 0 
                                    ? 'text-red-500 dark:text-red-400' 
                                    : (isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300')
                                }`} />
                              ) : (
                                <Icon className="w-4 h-4" />
                              )}
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                        {/* 分隔线 */}
                        {settingsMenuItems.length > 0 && (
                          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                        )}
                        {/* 主题切换 - 自动 / 亮色 / 暗色 三个图标 */}
                        <div className="flex items-center justify-center gap-1 px-2 py-2">
                          <button
                            onClick={() => setTheme('system')}
                            title={t('settings.themeAuto')}
                            className={`p-2 rounded-lg transition-colors ${theme === 'system' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          >
                            <Monitor className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setTheme('light')}
                            title={t('settings.themeLight')}
                            className={`p-2 rounded-lg transition-colors ${theme === 'light' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          >
                            <Sun className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setTheme('dark')}
                            title={t('settings.themeDark')}
                            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          >
                            <Moon className="w-5 h-5" />
                          </button>
                        </div>
                        {/* 分隔线 */}
                        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                        {/* 注销按钮 */}
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            handleLogout();
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full text-left"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>{t('auth.logout')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {t('auth.login')}
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    {t('auth.register')}
                  </Link>
                </>
              )}
            </div>

            {/* Mobile/iPad Menu Button */}
            <button
              className="lg:hidden p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile/iPad Navigation - 顶部下拉菜单 */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <nav className="container mx-auto px-4 py-4 space-y-2">
              {desktopNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                  (item.path === '/books' && location.pathname.startsWith('/books') && location.pathname !== '/books');
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              {/* 移动端菜单中的设置项 */}
              {isAuthenticated && settingsMenuItems.length > 0 && (
                <>
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                      {t('navigation.settings')}
                    </div>
                    {settingsMenuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path ||
                        (item.path === '/settings' && location.pathname.startsWith('/settings')) ||
                        (item.path === '/upload' && location.pathname === '/upload') ||
                        (item.path === '/books-management' && location.pathname === '/books-management') ||
                        (item.path === '/users' && location.pathname === '/users') ||
                        (item.path === '/ip-management' && location.pathname === '/ip-management');
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => {
                            setMobileMenuOpen(false);
                            if (item.path === '/messages') {
                              fetchUnreadMessageCount();
                            }
                          }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                            isActive
                              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {item.path === '/messages' ? (
                            <Bell className={`w-5 h-5 transition-colors ${
                              unreadMessageCount > 0 
                                ? 'text-red-500 dark:text-red-400' 
                                : 'text-gray-700 dark:text-gray-300'
                            }`} />
                          ) : (
                            <Icon className="w-5 h-5" />
                          )}
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
              {isAuthenticated ? (
                <>
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                    <div className="px-4 py-2 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-blue-600 flex-shrink-0">
                        {user?.avatar_path && getAvatarUrl(user.avatar_path) ? (
                          <img src={getAvatarUrl(user.avatar_path)!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-medium">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {user?.username}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {user?.email}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 主题切换 - 自动 / 亮色 / 暗色 三个图标 */}
                  <div className="flex items-center justify-center gap-2 px-4 py-3">
                    <button
                      onClick={() => setTheme('system')}
                      title={t('settings.themeAuto')}
                      className={`p-2.5 rounded-lg transition-colors ${theme === 'system' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      <Monitor className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setTheme('light')}
                      title={t('settings.themeLight')}
                      className={`p-2.5 rounded-lg transition-colors ${theme === 'light' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      <Sun className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      title={t('settings.themeDark')}
                      className={`p-2.5 rounded-lg transition-colors ${theme === 'dark' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      <Moon className="w-5 h-5" />
                    </button>
                  </div>
                  {/* 退出登录 */}
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors w-full text-left"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>{t('auth.logout')}</span>
                  </button>
                </>
              ) : (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-3 text-center text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t('auth.login')}
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-3 text-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('auth.register')}
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* iPad/移动端顶部导航栏（简化版，仅显示Logo和用户信息） */}
      <header 
        key={`mobile-header-${domTheme}`}
        data-nav="true"
        role="navigation"
        className="lg:hidden sticky top-0 z-40 border-b shadow-sm backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 border-gray-200/50 dark:border-gray-700/50"
        style={{ 
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              {/* 返回按钮 - 非首页显示在最左侧 */}
              {!isHomePage && (
                <Link
                  to={getBackPath()}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title={t('common.back')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Link>
              )}
              <div className="flex items-center gap-2 text-lg font-bold text-blue-600 dark:text-blue-400 flex-1 min-w-0">
                {/* 当显示导航栏迷你介绍时，显示有声小说信息 */}
                {navMiniInfo ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {navMiniInfo.cover ? (
                      <img
                        src={navMiniInfo.cover}
                        alt={navMiniInfo.title}
                        className="w-8 h-8 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Music className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {navMiniInfo.title}
                      </div>
                      {navMiniInfo.author && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {navMiniInfo.author}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <Book className="w-5 h-5 flex-shrink-0" />
                    {/* 当显示迷你播放器时隐藏标题文字 */}
                    {!(showMiniPlayer && audiobookTitle) && (
                      <span className="truncate">{getPageTitle()}</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAuthenticated && (
                <>
                  {/* 全局音频播放控制按钮 - 移动端显示（简化版迷你播放器） */}
                  {showMiniPlayer && audiobookTitle && (
                    <div className="flex items-center gap-1.5 lg:hidden">
                      {/* 播放/暂停按钮 - 使用封面图片 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPause();
                        }}
                        className="relative w-9 h-9 rounded-lg overflow-hidden transition-all duration-200 shadow-sm group"
                        title={isPlaying ? `${t('common.pause') || '暂停'} - ${audiobookTitle}` : `${t('common.play') || '播放'} - ${audiobookTitle}`}
                      >
                        {audiobookCover ? (
                          <>
                            <img 
                              src={audiobookCover} 
                              alt={audiobookTitle}
                              className="w-full h-full object-cover"
                            />
                            {/* 播放/暂停图标覆盖层 */}
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 flex items-center justify-center transition-colors">
                              {isPlaying ? (
                                <Pause className="w-3.5 h-3.5 fill-white text-white" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-white text-white" />
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center">
                            {isPlaying ? (
                              <Pause className="w-3.5 h-3.5 fill-white text-white" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-white text-white" />
                            )}
                          </div>
                        )}
                      </button>
                      {/* 点击打开播放控制页面 */}
                      <button
                        onClick={() => {
                          navigate(`/audiobooks/${audiobookId}/player`);
                          setShowMiniPlayer(false);
                        }}
                        className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors text-xs font-medium max-w-[80px] truncate"
                        title={audiobookTitle}
                      >
                        {audiobookTitle}
                      </button>
                      {/* 停止播放按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStop();
                        }}
                        className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        title={t('audiobook.stop') || '停止播放'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {/* 消息按钮 - 移动端显示 */}
                  {canUseFriends && (
                    <Link
                      to="/messages"
                      className={`p-2 rounded-lg transition-colors lg:hidden ${
                        location.pathname === '/messages' || location.pathname.startsWith('/messages')
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                      title={t('navigation.messages') || '消息'}
                      onClick={() => {
                        // 点击消息后立即刷新未读消息数
                        fetchUnreadMessageCount();
                      }}
                    >
                      <Bell className={`w-5 h-5 transition-colors ${
                        unreadMessageCount > 0
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`} />
                    </Link>
                  )}
                  {/* AI阅读按钮 */}
                  <Link
                    to="/ai-reading"
                    className={`p-2 rounded-lg transition-colors ${
                      location.pathname === '/ai-reading' || location.pathname.startsWith('/ai-reading')
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    title={t('navigation.aiReading')}
                  >
                    <Sparkles className="w-5 h-5" />
                  </Link>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800">
                    <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-blue-600 flex-shrink-0">
                      {user?.avatar_path && getAvatarUrl(user.avatar_path) ? (
                        <img src={getAvatarUrl(user.avatar_path)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xs font-medium">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline">
                      {user?.username}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className={`flex-1 w-full hide-scrollbar min-h-0 overflow-hidden${isMessagesPage ? ' pb-0' : ''}`}>
        {/* 播放页面：无 padding，全屏 */}
        {location.pathname.includes('/player') ? (
          <div className="w-full h-full flex flex-col" style={{ minHeight: 0 }}>
            {children}
          </div>
        ) : location.pathname === '/messages' ? (
          /* 消息页面：无 padding，全高，overflow-hidden 配合根节点 h-screen 确保 PC 右侧对话区适配视窗 */
          <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>
        ) : (
          <div className="px-4 py-6 lg:py-8 lg:pb-24 lg:container lg:mx-auto">
            {children}
          </div>
        )}
      </main>

      {/* 移动端和iPad底部导航栏 - 消息/对话页不显示，由 Messages 自管 */}
      {isAuthenticated && location.pathname !== '/messages' && (
        <nav 
          key={`mobile-nav-${effectiveTheme}`}
          data-nav="true"
          role="navigation"
          className="lg:hidden fixed left-0 right-0 border-t z-50 shadow-lg backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 border-gray-200/50 dark:border-gray-700/50"
          style={{
            bottom: 0,
            paddingBottom: 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
          }}
        >
          <div className="flex items-center justify-around py-2">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = !item.isSpecial && (
                  location.pathname === item.path || 
                  (item.path === '/books' && location.pathname.startsWith('/books')) ||
                  (item.path === '/' && location.pathname === '/') ||
                  (item.path === '/audiobooks' && location.pathname.startsWith('/audiobooks')) ||
                  (item.path === '/profile' && location.pathname.startsWith('/profile'))
                );
                const isSpecial = item.isSpecial; // 阅读按钮（中间）
                
                if (isSpecial) {
                  // 中间按钮：播放控制或阅读按钮
                  const hasAudiobook = !!audiobookId && !!audiobookTitle;
                  
                  return (
                    <button
                      key={item.path}
                      onClick={(e) => {
                        // 执行默认行为（切换播放/暂停或进入播放控制页面）
                        if (item.onClick) {
                          item.onClick(e);
                        }
                      }}
                      className="flex items-center justify-center px-2 transition-all relative group"
                      style={{ marginTop: '-2px' }}
                    >
                      {hasAudiobook ? (
                        // 播放控制模式：显示封面和播放状态
                        <div className="relative">
                          <div 
                            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105 overflow-hidden play-pause-area cursor-pointer"
                            style={{
                              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                              boxShadow: '0 6px 12px rgba(59, 130, 246, 0.35), 0 3px 6px rgba(139, 92, 246, 0.25)'
                            }}
                          >
                            {audiobookCover ? (
                              <>
                                <img 
                                  src={audiobookCover} 
                                  alt={audiobookTitle}
                                  className="w-full h-full object-cover"
                                />
                                {/* 播放/暂停图标覆盖层 */}
                                <div className={`absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                  {isPlaying ? (
                                    <Pause className="w-5 h-5 fill-white text-white" />
                                  ) : (
                                    <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                                  )}
                                </div>
                                {/* 播放动画效果 */}
                                {isPlaying && (
                                  <div className="absolute inset-0 rounded-full border-2 border-white/50 animate-ping" style={{ animationDuration: '2s' }}></div>
                                )}
                              </>
                            ) : (
                              <>
                                {isPlaying ? (
                                  <Pause className="w-7 h-7 text-white drop-shadow-md" />
                                ) : (
                                  <Play className="w-7 h-7 text-white drop-shadow-md ml-0.5" />
                                )}
                                {/* 播放动画效果 */}
                                {isPlaying && (
                                  <div className="absolute inset-0 rounded-full border-2 border-white/50 animate-ping" style={{ animationDuration: '2s' }}></div>
                                )}
                              </>
                            )}
                          </div>
                          {/* 播放进度指示器 */}
                          {duration > 0 && (
                            <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-white/30 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-white rounded-full transition-all duration-300"
                                style={{ width: `${(currentTime / duration) * 100}%` }}
                              ></div>
                            </div>
                          )}
                        </div>
                      ) : (
                        // 阅读按钮模式
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105"
                        style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          boxShadow: '0 6px 12px rgba(102, 126, 234, 0.35), 0 3px 6px rgba(118, 75, 162, 0.25)'
                        }}
                      >
                        <Icon className="w-7 h-7 text-white drop-shadow-md" />
                      </div>
                      )}
                    </button>
                  );
                }
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={item.onClick || undefined}
                    className={`flex flex-col items-center justify-center px-2 rounded-lg transition-all min-w-[60px] relative ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                    style={{ 
                      paddingTop: '8px', 
                      paddingBottom: '6px',
                      backgroundColor: isActive 
                        ? (effectiveTheme === 'dark' 
                          ? 'rgba(59, 130, 246, 0.15)' 
                          : 'rgba(59, 130, 246, 0.08)')
                        : 'transparent',
                      borderRadius: '12px',
                    }}
                  >
                    <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform`} />
                    <span className="text-[11px] font-medium leading-tight mt-1">{item.label}</span>
                  </Link>
                );
              })}
          </div>
        </nav>
      )}

      {/* 停止播放确认对话框 */}
      {showStopConfirm && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
          }}
          onClick={() => setShowStopConfirm(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <X className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t('audiobook.confirmStop')}
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6 whitespace-pre-line">
              {t('audiobook.confirmStopMessage', { title: audiobookTitle })}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmStop}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-sm"
              >
                {t('audiobook.stop')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
