/**
 * @file AudiobookDetail.tsx
 * @description 有声小说详情页面
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Play,
  Plus,
  Trash2,
  Music,
  Clock,
  BookOpen,
  Heart,
  List,
  Edit,
  Square,
  Share2,
  X
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import AudiobookPlayer from '../components/AudiobookPlayer';
import { useAudiobookStore } from '../store/audiobookStore';
import AudiobookEditModal from '../components/AudiobookEditModal';
import { getCoverUrl } from '../utils/coverHelper';
import { audiobookProgressManager } from '../utils/audiobookProgressManager';

interface AudiobookDetail {
  id: string;
  title: string;
  author?: string;
  type: string;
  description?: string;
  cover_url?: string;
  created_at?: string;
  uploader_id?: string;
  is_public?: number;
  files: Array<{
    id: string;
    file_name: string;
    file_size: number;
    file_type: string;
    file_order: number;
    duration?: number;
  }>;
}

export default function AudiobookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const autoPlay = searchParams.get('autoPlay') === 'true';
  const autoPlayFileId = searchParams.get('fileId');

  const [audiobook, setAudiobook] = useState<AudiobookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [inShelf, setInShelf] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [fileProgressMap, setFileProgressMap] = useState<{ [fileId: string]: any }>({}); // ✅ 新增：所有文件的播放进度映射
  const [showEditModal, setShowEditModal] = useState(false);
  const [hasAutoShownPlayer, setHasAutoShownPlayer] = useState(false); // 记录是否已经获取过播放进度（防止重复调用）
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false); // 头部是否收缩
  const [showNavMiniInfo, setShowNavMiniInfo] = useState(false); // 是否在导航栏显示迷你介绍
  const chapterListRef = useRef<HTMLDivElement>(null); // 章节列表容器的引用
  const headerRef = useRef<HTMLDivElement>(null); // 头部容器的引用
  
  // 共享相关状态
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareForm, setShareForm] = useState({ toUserId: '', toGroupId: '', permission: 'read' });
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  
  // 全局状态管理
  const {
    setAudiobook: setGlobalAudiobook,
    setShowPlayer,
    showPlayer,
    audiobookId: globalAudiobookId,
    isPlaying,
    setPlaying,
    reset,
    currentTime: globalCurrentTime,
    duration: globalDuration,
    currentFileId: globalCurrentFileId
  } = useAudiobookStore();

  // 滚动到当前播放文件
  const scrollToCurrentFile = useCallback(() => {
    if (!currentFileId || !chapterListRef.current) return;

    const container = chapterListRef.current;
    const targetElement = container.querySelector(`[data-file-id="${currentFileId}"]`) as HTMLElement;

    if (targetElement) {
      // 计算元素在容器中的位置
      const containerRect = container.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top;
      const currentScrollTop = container.scrollTop;

      // 检查元素是否已经在容器顶部附近
      const tolerance = 20;
      if (Math.abs(relativeTop) <= tolerance) {
        return; // 已经在正确位置
      }

      // 计算目标滚动位置，使当前文件滚动到容器顶部附近
      const targetScrollTop = currentScrollTop + relativeTop - 20; // 留20px的顶部间距

      // 使用容器的scrollTo方法，进行平滑滚动
      container.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
    }
  }, [currentFileId]);

  useEffect(() => {
    if (isAuthenticated && id) {
      // 重置自动显示标记（每次进入页面时重置，这样如果用户刷新页面，会再次自动显示）
      setHasAutoShownPlayer(false);
      
      fetchAudiobook();
      checkShelfStatus();
      fetchAllFileProgress(); // ✅ 新增：获取所有文件的播放进度
      // fetchProgress 会在 audiobook 加载完成后调用，确保有数据
    }
  }, [isAuthenticated, id]);

  // 获取好友和群组列表（用于共享）
  const fetchGroupsAndUsers = async () => {
    try {
      // 获取用户的群组列表（已加入的书友会）
      const groupsResponse = await api.get('/groups');
      setAvailableGroups(groupsResponse.data.groups || []);

      // 如果是管理员，获取所有用户列表
      if (user?.role === 'admin') {
        const usersResponse = await api.get('/users');
        setAvailableUsers(usersResponse.data.users || []);
      } else {
        // 普通用户只能获取好友列表
        try {
          const friendsResponse = await api.get('/friends');
          setAvailableUsers((friendsResponse.data.friends || []).map((f: any) => ({
            id: f.friend_id,
            username: f.friend_username,
            nickname: f.friend_nickname,
            email: f.friend_email
          })));
        } catch (error: any) {
          console.error('获取好友列表失败:', error);
          setAvailableUsers([]);
        }
      }
    } catch (error: any) {
      console.error('获取群组和用户列表失败:', error);
    }
  };

  // 分享有声小说
  const handleShare = async () => {
    if (!id || (!shareForm.toUserId && !shareForm.toGroupId)) {
      toast.error('请选择要分享给的用户或群组');
      return;
    }

    setSharing(true);
    try {
      await api.post('/audiobook-shares', {
        audiobookId: id,
        ...shareForm,
      });
      toast.success('有声小说分享成功');
      setShowShareModal(false);
      setShareForm({ toUserId: '', toGroupId: '', permission: 'read' });
    } catch (error: any) {
      console.error('分享有声小说失败:', error);
      toast.error(error.response?.data?.error || '分享有声小说失败');
    } finally {
      setSharing(false);
    }
  };

  // 当audiobook加载完成后，获取播放进度（不自动跳转，只在用户点击播放时跳转）
  useEffect(() => {
    if (audiobook && audiobook.files && audiobook.files.length > 0 && !hasAutoShownPlayer) {
      // 如果URL中有autoPlay参数，说明用户明确想要播放，跳转到播放页面
      if (autoPlay && autoPlayFileId) {
        const fileExists = audiobook.files.some(f => f.id === autoPlayFileId);
        if (fileExists) {
          setCurrentFileId(autoPlayFileId);
          navigate(`/audiobooks/${id}/player?fileId=${autoPlayFileId}&specificFile=true&autoPlay=true`);
          setHasAutoShownPlayer(true); // 标记已处理，避免重复
          return;
        }
      }
      
      // ✅ 修复：只获取播放进度，不自动跳转
      // 延迟一小段时间，确保所有状态都已初始化
      const timer = setTimeout(() => {
        fetchProgress();
        setHasAutoShownPlayer(true); // 标记已获取进度
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [audiobook, hasAutoShownPlayer, autoPlay, autoPlayFileId, id, navigate]);
  
  // ✅ 修复：监听全局播放进度变化，实时更新章节列表中的进度显示
  useEffect(() => {
    if (globalAudiobookId === id && globalCurrentFileId) {
      // ✅ 修复：即使 duration 为 0 也更新，只要 currentTime > 0 就显示进度
      if (globalCurrentTime >= 0) {
        // 计算当前播放文件的进度百分比（如果 duration > 0）
        const progressPercent = globalDuration > 0 ? (globalCurrentTime / globalDuration) * 100 : 0;
        
        // 更新当前播放文件的进度
        setProgress((prev: any) => {
          if (prev && prev.file_id === globalCurrentFileId) {
            return {
              ...prev,
              current_time: globalCurrentTime,
              duration: globalDuration,
              progress: progressPercent
            };
          }
          // 如果当前文件没有进度记录，创建一个新的
          return {
            file_id: globalCurrentFileId,
            current_time: globalCurrentTime,
            duration: globalDuration,
            progress: progressPercent
          };
        });
        
        // ✅ 修复：同步更新 fileProgressMap 中当前文件的进度（实时更新）
        setFileProgressMap(prev => {
          const updated = { ...prev };
          updated[globalCurrentFileId] = {
            file_id: globalCurrentFileId,
            current_time: globalCurrentTime,
            duration: globalDuration,
            progress: progressPercent,
          };
          return updated;
        });
      }
      
      // 同步当前文件ID
      if (currentFileId !== globalCurrentFileId) {
        setCurrentFileId(globalCurrentFileId);
      }
    }
  }, [globalAudiobookId, id, globalCurrentFileId, globalCurrentTime, globalDuration, currentFileId]);

  // 监听当前文件ID变化，自动滚动到对应行（已禁用）
  // useEffect(() => {
  //   if (currentFileId && audiobook && audiobook.files.length > 0) {
  //     scrollToCurrentFile(currentFileId);
  //   }
  // }, [currentFileId, audiobook, scrollToCurrentFile]);

  // 防止页面自动滚动（特别是在PWA环境中）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let scrollPreventionActive = true;

    // 在页面加载初期防止自动滚动
    const preventInitialScroll = () => {
      // 检查页面是否被自动滚动
      const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

      if (currentScrollTop > 0) {
        window.scrollTo(0, 0);
      }
    };

    // 初始检查
    preventInitialScroll();

    // 在短时间内持续监控和纠正自动滚动
    const monitorScroll = setInterval(() => {
      if (scrollPreventionActive) {
        preventInitialScroll();
      }
    }, 200);

    // 1秒后停止监控，允许正常的用户滚动
    const stopMonitoring = setTimeout(() => {
      scrollPreventionActive = false;
      clearInterval(monitorScroll);
    }, 1000);

    return () => {
      scrollPreventionActive = false;
      clearInterval(monitorScroll);
      clearTimeout(stopMonitoring);
    };
  }, []);

  // 监听滚动，实现头部收缩和导航栏迷你介绍
  useEffect(() => {
    if (!chapterListRef.current || !audiobook) return;

    const handleScroll = () => {
      if (chapterListRef.current) {
        const scrollTop = chapterListRef.current.scrollTop;
        const shouldCollapse = scrollTop > 80;
        setIsHeaderCollapsed(shouldCollapse);
        // 当滚动超过120px时，在导航栏显示迷你介绍（头部基本完全隐藏）
        const shouldShowNavMini = scrollTop > 120;
        setShowNavMiniInfo(shouldShowNavMini);

        // 通过自定义事件通知Layout组件显示迷你介绍
        if (shouldShowNavMini) {
          window.dispatchEvent(new CustomEvent('audiobook:showNavMini', {
            detail: {
              title: audiobook.title,
              author: audiobook.author,
              cover: getAudiobookCoverUrl(),
            }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('audiobook:hideNavMini'));
        }
      }
    };

    const scrollContainer = chapterListRef.current;
    // 初始检查一次，确保状态正确
    handleScroll();

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      // 清理时隐藏导航栏迷你介绍
      window.dispatchEvent(new CustomEvent('audiobook:hideNavMini'));
    };
  }, [audiobook]); // 依赖audiobook，确保列表加载后绑定事件

  // 当currentFileId改变时，滚动到该文件
  useEffect(() => {
    if (currentFileId && audiobook && audiobook.files.length > 0) {
      // 延迟执行，确保DOM已更新
      const timer = setTimeout(() => {
        scrollToCurrentFile();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentFileId, audiobook, scrollToCurrentFile]);

  const fetchAudiobook = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/audiobooks/${id}`);
      if (response.data.success) {
        setAudiobook(response.data.audiobook);
        // 如果有进度，设置当前播放文件
        if (response.data.audiobook.files && response.data.audiobook.files.length > 0) {
          const progressResponse = await api.get(`/audiobooks/${id}/progress`);
          if (progressResponse.data.success && progressResponse.data.progress) {
            setCurrentFileId(progressResponse.data.progress.file_id);
          } else {
            // 没有进度，默认播放第一集
            setCurrentFileId(response.data.audiobook.files[0].id);
          }
        }
      }
    } catch (error: any) {
      console.error('获取有声小说详情失败:', error);
      toast.error(error.response?.data?.error || '获取详情失败');
    } finally {
      setLoading(false);
    }
  };

  const checkShelfStatus = async () => {
    try {
      const response = await api.get(`/audiobooks/${id}/shelf`);
      if (response.data.success) {
        setInShelf(response.data.inShelf);
      }
    } catch (error: any) {
      console.error('检查书架状态失败:', error);
    }
  };

  const fetchProgress = async () => {
    if (!id) return;

    try {
      const latestProgress = await audiobookProgressManager.getProgress(id);
      setProgress(latestProgress);

      // 设置当前文件ID用于显示进度指示器
      if (latestProgress && latestProgress.file_id && audiobook && audiobook.files && audiobook.files.length > 0) {
        const fileExists = audiobook.files.some(f => f.id === latestProgress.file_id);
        if (fileExists) {
          setCurrentFileId(latestProgress.file_id);

        }
      }
    } catch (error: any) {
      // 429错误：请求过于频繁，不显示错误（避免干扰用户）
      if (error.response?.status === 429) {
        console.warn('[AudiobookDetail] 获取播放进度请求过于频繁，跳过');
      } else {
        console.error('[AudiobookDetail] 获取播放进度失败:', error);
        // 获取失败时清空进度状态
        setProgress(null);
      }
    }
  };

  // ✅ 新增：获取所有文件的播放进度
  const fetchAllFileProgress = async () => {
    if (!id) return;
    try {
      const response = await api.get(`/audiobooks/${id}/progress/all`);
      if (response.data.success && response.data.progress) {
        setFileProgressMap(response.data.progress);
      }
    } catch (error: any) {
      console.error('[AudiobookDetail] 获取所有文件播放进度失败', error);
      // 失败时不影响页面显示，只记录错误
    }
  };

  const handleAddToShelf = async () => {
    try {
      const response = await api.post(`/audiobooks/${id}/shelf`);
      if (response.data.success) {
        setInShelf(true);
        toast.success(t('audiobook.addedToShelf'));
      }
    } catch (error: any) {
      console.error('添加到书架失败:', error);
      toast.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleRemoveFromShelf = async () => {
    try {
      const response = await api.post(`/audiobooks/${id}/shelf`, { _method: 'DELETE' });
      if (response.data.success) {
        setInShelf(false);
        toast.success(t('audiobook.removedFromShelf'));
      }
    } catch (error: any) {
      console.error('从书架移除失败:', error);
      toast.error(error.response?.data?.error || '操作失败');
    }
  };

  const handlePlay = async (fileId?: string) => {
    if (!audiobook) return;

    let urlParams = `autoPlay=true`;

    if (fileId) {
      // 用户明确指定要播放某个文件（从章节列表点击播放）
      urlParams += `&fileId=${fileId}&specificFile=true`;
    }
    // 如果没有指定fileId，则不传递任何fileId参数，让播放页面使用最后播放的进度

    // ✅ 修改：跳转到播放页面而不是显示模态框
    navigate(`/audiobooks/${id}/player?${urlParams}`);
  };
  
  // 处理章节列表右侧播放按钮点击
  const handleChapterPlay = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发整个div的点击
    handlePlay(fileId);
  };

  // 检查是否有编辑权限（管理员或上传者）
  const canEdit = user?.role === 'admin' || audiobook?.uploader_id === user?.id;

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleUpdated = () => {
    fetchAudiobook();
  };

  const handleDeleted = () => {
    navigate('/audiobooks');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 使用 coverHelper 中的 getCoverUrl 函数，支持自定义 API 地址
  const getAudiobookCoverUrl = (): string | null => {
    // 确保 cover_url 是字符串类型，避免类型错误
    const coverUrl = audiobook?.cover_url;
    if (!coverUrl || typeof coverUrl !== 'string') {
      return null;
    }
    return getCoverUrl(coverUrl);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">请先登录</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!audiobook) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">{t('audiobook.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden flex flex-col h-screen">
      {/* 头部信息 - 固定定位 */}
      <div 
        ref={headerRef}
        className={`sticky top-0 z-30 transition-all duration-300 flex-shrink-0 ${
          isHeaderCollapsed ? 'shadow-lg' : ''
        }`}

      >
        <div className="w-full lg:max-w-7xl lg:mx-auto lg:px-4">
          <div className={`bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 rounded-b-2xl lg:rounded-2xl lg:border lg:shadow-xl overflow-hidden mx-4 lg:mx-0 transition-all duration-300 ${
            isHeaderCollapsed ? 'py-2 lg:py-3' : 'py-3 lg:py-6'
          }`}>
            <div className={`px-3 lg:px-6 transition-all duration-300 ${
              isHeaderCollapsed ? 'py-2' : 'py-3 lg:py-6'
            }`}>
              {isHeaderCollapsed ? (
                // 收缩状态：单行显示
                <div className="flex items-center gap-3">
                  {getAudiobookCoverUrl() ? (
                    <img
                      src={getAudiobookCoverUrl()!}
                      alt={audiobook.title}
                      className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Music className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {audiobook.title}
                    </h1>
                    {audiobook.author && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {audiobook.author}
                      </p>
                    )}
                  </div>
                  {isPlaying && globalAudiobookId === id ? (
                    <button
                      onClick={() => handlePlay()}
                      className="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {t('audiobook.playing')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlay()}
                      className="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {progress && progress.progress > 0 ? t('audiobook.continuePlay') : t('audiobook.startPlay')}
                    </button>
                  )}
                </div>
              ) : (
                // 展开状态：两列布局（移动端和PC端一致）
                <div className="flex flex-row items-start gap-3 lg:gap-6">
                  {/* 左侧：封面和按钮 */}
                  <div className="flex-shrink-0">
                    {getAudiobookCoverUrl() ? (
                      <img
                        src={getAudiobookCoverUrl()!}
                        alt={audiobook.title}
                        className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 object-cover rounded-xl shadow-xl ring-2 ring-gray-200 dark:ring-gray-700"
                        onContextMenu={(e) => e.preventDefault()}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.audiobook-cover-placeholder')) {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'audiobook-cover-placeholder w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-xl ring-2 ring-gray-200 dark:ring-gray-700 flex items-center justify-center';
                            placeholder.innerHTML = `
                              <svg class="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 text-white opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
                              </svg>
                            `;
                            parent.appendChild(placeholder);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-xl ring-2 ring-gray-200 dark:ring-gray-700 flex items-center justify-center">
                        <Music className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 text-white opacity-90" />
                      </div>
                    )}
                    
                    {/* 收藏和编辑按钮 - 封面正下方 */}
                    <div className="flex items-center justify-center gap-2 mt-2">
                      {inShelf ? (
                        <button
                          onClick={handleRemoveFromShelf}
                          className="group p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 text-red-500 dark:text-red-400 rounded-lg transition-all duration-200 hover:shadow-sm"
                          title={t('book.unfavorite')}
                        >
                          <Heart className="w-4 h-4 fill-red-500 text-red-500 transition-transform group-hover:scale-110" />
                        </button>
                      ) : (
                        <button
                          onClick={handleAddToShelf}
                          className="group p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-all duration-200 hover:shadow-sm"
                          title={t('book.favorite')}
                        >
                          <Heart className="w-4 h-4 transition-transform group-hover:scale-110" />
                        </button>
                      )}
                      
                      {canEdit && (
                        <button
                          onClick={handleEdit}
                          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg transition-all duration-200 hover:shadow-sm"
                          title={t('common.edit')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      
                      {/* 分享按钮 - 只有上传者或管理员可以分享 */}
                      {(user?.role === 'admin' || audiobook?.uploader_id === user?.id) && (
                        <button
                          onClick={() => {
                            fetchGroupsAndUsers();
                            setShowShareModal(true);
                          }}
                          className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-all duration-200 hover:shadow-sm"
                          title="分享有声小说"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* 右侧：标题和信息 */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mb-1 leading-tight line-clamp-2">
                      {audiobook.title}
                    </h1>
                    {audiobook.author && (
                      <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                        <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">{audiobook.author}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-medium border border-blue-200 dark:border-blue-800">
                        {audiobook.type}
                      </span>
                      <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400 text-xs">
                        <Music className="w-3 h-3" />
                        {audiobook.files.length} {t('audiobook.episodes')}
                      </span>
                    </div>
                    {audiobook.description && !isHeaderCollapsed && (
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2 leading-relaxed">
                        {audiobook.description}
                      </p>
                    )}
                    
                    {/* 开始播放按钮 - 扁平化设计 */}
                    <div className="flex justify-start">
                      {isPlaying && globalAudiobookId === id ? (
                        <button
                          onClick={() => {
                            // ✅ 修改：如果正在播放，跳转到播放页面而不是停止播放
                            const targetFileId = currentFileId || (progress && progress.file_id) || (audiobook.files && audiobook.files.length > 0 ? audiobook.files[0].id : null);
                            if (targetFileId) {
                              navigate(`/audiobooks/${id}/player?autoPlay=true`);
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:shadow-sm font-medium text-sm sm:text-base h-10 sm:h-12"
                          title={t('audiobook.goToPlayer') || '进入播放控制'}
                        >
                          <Play className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" stroke="none" style={{ marginLeft: '1px' }} />
                          <span className="whitespace-nowrap">{t('audiobook.playing')}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePlay()}
                          className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:shadow-sm font-medium text-sm sm:text-base h-10 sm:h-12"
                          title={progress && progress.progress > 0 ? t('audiobook.continuePlay') : t('audiobook.startPlay')}
                        >
                          <Play className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="currentColor" stroke="none" style={{ marginLeft: '1px' }} />
                          <span className="whitespace-nowrap">{progress && progress.progress > 0 ? t('audiobook.continuePlay') : t('audiobook.startPlay')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 移除：不再显示模态框播放器，改为跳转到播放页面 */}
      
      <div className="flex-1 flex flex-col min-h-0 pb-24 overflow-hidden">
      {/* 章节列表 */}
      <div className="w-full lg:max-w-7xl lg:mx-auto lg:px-4 py-4 lg:py-6 flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-4 flex-shrink-0 mx-4 lg:mx-0">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <List className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('audiobook.chapterList')}
          </h2>
        </div>
        {/* 章节列表滚动容器 */}
        <div
          ref={chapterListRef}
          className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 -mr-1 mx-4 lg:mx-0"
        >
            {(() => {
              // 保持原始文件顺序，不重新排列
              const files = audiobook.files;

              return files.map((file, index) => {
              const isCurrentFile = currentFileId === file.id;
              const fileProgress = fileProgressMap[file.id] || (progress && progress.file_id === file.id ? progress : null);
              // ✅ 修复：只要有 duration > 0 就显示进度条，即使 progress 为 0（刚开始播放）
              const hasProgress = fileProgress && fileProgress.duration > 0;
              const progressPercent = hasProgress ? Math.min(100, Math.max(0, fileProgress.progress || 0)) : 0;
              
              return (
                <div
                  key={file.id}
                  data-file-id={file.id}
                  onClick={() => handlePlay(file.id)}
                  className={`flex flex-col gap-1 p-2 rounded cursor-pointer transition-all duration-200 shadow-sm ${
                    isCurrentFile
                      ? 'bg-blue-50/70 dark:bg-blue-900/20 border border-blue-500/50 dark:border-blue-400/50 shadow-blue-100/50 dark:shadow-blue-900/20'
                      : 'bg-white/95 dark:bg-gray-800/95 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-50/80 dark:hover:bg-gray-700/30 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded font-semibold text-xs transition-all ${
                      isCurrentFile
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <h3 className={`flex-1 text-sm font-medium truncate ${
                        isCurrentFile
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {file.file_name.replace(/^\d+_/, '')}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {formatDuration(file.duration)}
                        </span>
                        <span className="hidden sm:inline-flex items-center gap-1">
                          <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                          {formatFileSize(file.file_size)}
                        </span>
                        {hasProgress && (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            {Math.round(progressPercent)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleChapterPlay(e, file.id)}
                      className={`flex-shrink-0 p-1.5 rounded transition-all duration-200 hover:scale-105 active:scale-95 ${
                        isCurrentFile
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30'
                          : 'text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      }`}
                      title={t('audiobook.startPlay')}
                    >
                      <Play className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" stroke="none" style={{ marginLeft: '0.5px' }} />
                    </button>
                  </div>
                  {/* ✅ 修复：播放进度条 - 实时更新 */}
                  {hasProgress && (
                    <div className="h-0.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ml-8">
                      <div
                        className={`h-full rounded-full ${
                          isCurrentFile
                            ? 'bg-blue-500 dark:bg-blue-400'
                            : 'bg-blue-400 dark:bg-blue-500'
                        }`}
                        style={{
                          width: `${progressPercent}%`,
                          transition: 'width 0.1s linear', // ✅ 修复：使用较短的线性过渡，确保实时更新
                          willChange: 'width' // ✅ 优化：提示浏览器优化性能
                        }}
                        title={`已播放 ${progressPercent.toFixed(1)}%`}
                      />
                    </div>
                  )}
                </div>
              );
            });
            })()}
        </div>
      </div>


      {/* 编辑模态框 */}
      {showEditModal && audiobook && (
        <AudiobookEditModal
          isOpen={showEditModal}
          audiobook={audiobook}
          onClose={() => setShowEditModal(false)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}

      {/* 分享有声小说模态框 */}
      {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Share2 className="w-5 h-5" />
                  分享有声小说
                </h2>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    分享给
                  </label>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        {user?.role === 'admin' ? '分享给用户' : '分享给好友'}
                      </label>
                      <select
                        value={shareForm.toUserId}
                        onChange={(e) => setShareForm({ ...shareForm, toUserId: e.target.value, toGroupId: '' })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">{user?.role === 'admin' ? '选择用户' : '选择好友'}</option>
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nickname || u.username} {u.email ? `(${u.email})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-center text-gray-400 dark:text-gray-500">或</div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        分享给书友会
                      </label>
                      <select
                        value={shareForm.toGroupId}
                        onChange={(e) => setShareForm({ ...shareForm, toGroupId: e.target.value, toUserId: '' })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">选择书友会</option>
                        {availableGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    权限
                  </label>
                  <select
                    value={shareForm.permission}
                    onChange={(e) => setShareForm({ ...shareForm, permission: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="read">只读</option>
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={sharing || (!shareForm.toUserId && !shareForm.toGroupId)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sharing ? '分享中...' : '分享'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

