/**
 * @file AudiobookPlayerPage.tsx
 * @description 有声小说播放页面（独立页面形式）
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAudiobookStore } from '../store/audiobookStore';
import { getCoverUrl } from '../utils/coverHelper';
import AudiobookPlayer from '../components/AudiobookPlayer';
import Layout from '../components/Layout';
import { audiobookProgressManager } from '../utils/audiobookProgressManager';

export default function AudiobookPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [audiobook, setAudiobook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [initialTime, setInitialTime] = useState<number>(0);
  
  const {
    setAudiobook: setGlobalAudiobook,
    setShowPlayer,
    showPlayer,
    audiobookId: globalAudiobookId,
  } = useAudiobookStore();

  // ✅ 修复：组件卸载时清理状态
  useEffect(() => {
    return () => {
      // 清理函数：组件卸载时清理状态
      setAudiobook(null);
      setCurrentFileId(null);
      setLoading(false);
      setShowPlayer(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ 修复：空依赖数组，只在组件卸载时执行一次

  // ✅ 修复：将 getAudiobookCoverUrl 移到 loadData 之前，避免依赖问题
  const getAudiobookCoverUrl = (data: any): string | null => {
    const coverUrl = data?.cover_url;
    if (!coverUrl || typeof coverUrl !== 'string') {
      return null;
    }
    return getCoverUrl(coverUrl);
  };

  // 加载数据：先加载有声小说详情，再确定播放文件和初始时间
  const loadData = async () => {
    setLoading(true);
    try {
      // ✅ 修复：进入播放页面时，先停止所有正在播放的音频，避免同时播放多个音频
      if (typeof document !== 'undefined') {
        const allAudios = document.querySelectorAll('audio');
        allAudios.forEach((audioEl) => {
          if (!audioEl.paused) {
            try {
              audioEl.pause();
            } catch (e) {
              console.warn('[AudiobookPlayerPage] 停止其他音频失败:', e);
            }
          }
        });
      }

      // 先获取有声小说详情
      const response = await api.get(`/audiobooks/${id}`);
      if (response.data.success) {
        const data = response.data.audiobook;
        setAudiobook(data);

        // 确定要播放的文件ID和初始时间
        let targetFileId: string | null = null;
        let targetTime: number = 0;

        // 1. 检查是否明确指定要播放特定文件
        const fileIdFromUrl = searchParams.get('fileId');
        const specificFile = searchParams.get('specificFile') === 'true';
        const autoPlay = searchParams.get('autoPlay') === 'true';

        if (fileIdFromUrl && specificFile) {
          // 用户明确指定要播放某个特定文件
          targetFileId = fileIdFromUrl;
          targetTime = await audiobookProgressManager.getFileProgress(id!, fileIdFromUrl);
        } else {
          // 2. 默认情况：获取最后播放的进度（所有进入方式都应该这样）
          const latestProgress = await audiobookProgressManager.getProgress(id!);

          // 调试日志：进入后打印获得的file id和进度
          console.log('🎵 [有声小说调试] 进入后获得的进度:', {
            audiobookId: id,
            latestProgress: latestProgress ? {
              file_id: latestProgress.file_id,
              current_time: latestProgress.current_time,
              duration: latestProgress.duration,
              progress: latestProgress.progress,
              last_played_at: latestProgress.last_played_at
            } : null,
            fileIdFromUrl,
            specificFile,
            autoPlay
          });

          if (latestProgress && latestProgress.file_id) {
            targetFileId = latestProgress.file_id;
            targetTime = latestProgress.current_time || 0;

            // 如果进度已接近完成（>=99.9%），从头开始播放
            const progressPercent = latestProgress.duration > 0 ? (latestProgress.current_time / latestProgress.duration) * 100 : 0;
            if (progressPercent >= 99.9) {
              targetTime = 0;
            }
          } else if (fileIdFromUrl) {
            // 如果没有最后播放进度，但URL中有fileId（向后兼容），使用URL中的文件
            targetFileId = fileIdFromUrl;
            targetTime = 0;
          }
        }

        // 3. 如果还是没有目标文件，使用第一个文件
        if (!targetFileId && data.files && data.files.length > 0) {
          targetFileId = data.files[0].id;
          targetTime = 0;
        }

        // 验证文件ID是否存在于文件列表中
        if (targetFileId && data.files && data.files.some((f: any) => f.id === targetFileId)) {
          setCurrentFileId(targetFileId);
          setInitialTime(targetTime);

          // 更新全局状态
          setGlobalAudiobook({
            audiobookId: id!,
            audiobookTitle: data.title,
            audiobookAuthor: data.author,
            audiobookCover: getAudiobookCoverUrl(data),
            files: data.files,
            initialFileId: targetFileId,
          });

          setShowPlayer(true);
        } else {
          console.error('[AudiobookPlayerPage] 无法找到有效的文件ID', {
            targetFileId,
            files: data.files,
            fileIds: data.files?.map((f: any) => f.id)
          });
          toast.error('无法找到播放文件');
          navigate(`/audiobooks/${id}`);
        }
      } else {
        toast.error('获取有声小说详情失败');
        navigate('/audiobooks');
      }
    } catch (error: any) {
      console.error('获取有声小说详情失败:', error);
      toast.error(error.response?.data?.error || '获取详情失败');
      navigate('/audiobooks');
    } finally {
      setLoading(false);
    }
  };

  // ✅ 修复：只在 id 变化时加载数据，避免重复加载
  useEffect(() => {
    if (id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // 不再通过URL参数触发自动播放，因为这违反了浏览器的自动播放策略
    // 用户需要手动点击播放按钮来开始播放
    // if (currentFileId && audiobook && (searchParams.get('fileId') || searchParams.get('autoPlay') === 'true')) {
    //   window.dispatchEvent(new CustomEvent('audiobook:userPlayRequest'));
    // }
  }, [currentFileId, audiobook, searchParams]);

  // ✅ 修复：调试日志，帮助诊断问题
  // ✅ 重要：所有 hooks 必须在条件返回之前，确保每次渲染时 hooks 数量一致
  // ✅ 修复：只依赖稳定的值，避免对象引用变化导致频繁触发
  useEffect(() => {
  }, [loading, audiobook?.id, currentFileId, showPlayer, globalAudiobookId, id]);

  // ✅ 修复：条件返回必须在所有 hooks 之后
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!audiobook || !currentFileId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">加载失败</p>
      </div>
    );
  }

  return (
    <Layout>
      <div
        className="w-full flex flex-col"
        style={{
          // ✅ 修复：使用视口高度，减去头部和底部导航栏
          height: '100%',
          minHeight: 0,
          // ✅ 修复：移除顶部安全区域，只保留底部安全区域和左右边距
          paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 60px), calc(1rem + 60px))',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
          // ✅ 修复：确保容器不会阻止底部导航栏的点击事件
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          // ✅ 修复：防止页面级别的弹性滚动
          overscrollBehavior: 'none',
          WebkitOverscrollBehavior: 'none',
          touchAction: 'pan-x pinch-zoom', // 只允许水平滑动和缩放，垂直滚动由内部容器处理
        }}
      >
        {/* 播放器内容 - 扁平化设计，移除不必要的嵌套 */}
        {/* ✅ 修复：简化条件渲染，只要 audiobook 和 currentFileId 存在就显示播放器 */}
        {audiobook && currentFileId ? (
          <div 
            className="w-full max-w-5xl flex-1 flex flex-col overflow-hidden mx-auto"
            style={{ 
              // ✅ 修复：使用 flex-1 占据剩余空间
              minHeight: 0,
              height: '100%',
              overflow: 'hidden',
              position: 'relative',
              // ✅ 修复：确保 z-index 低于底部导航栏（导航栏是 z-50）
              zIndex: 1,
              // ✅ 修复：确保容器可见
              visibility: 'visible',
              opacity: 1,
            }}
            data-testid="audiobook-player-container"
            onWheel={(e) => {
              // 移除 preventDefault 调用以避免潜在的兼容性问题
              // 现代浏览器通常能正确处理滚动事件
              const target = e.target as HTMLElement;
              const playlistContainer = target.closest('[data-playlist-container]');
              const isButton = target.closest('button') || target.closest('[role="button"]');
              const isLink = target.closest('a');
              const isClickable = isButton || isLink;

              // 如果是可点击元素，不阻止事件，让点击事件正常工作
              if (isClickable) {
                return;
              }

              // 只在必要时停止传播
              if (!playlistContainer) {
                e.stopPropagation();
              }
            }}
            onTouchMove={(e) => {
              // 移除 preventDefault 调用以避免 passive 事件监听器警告
              // 现代浏览器默认允许触摸滚动，这通常不是问题
              const target = e.target as HTMLElement;
              const playlistContainer = target.closest('[data-playlist-container]');
              const isButton = target.closest('button') || target.closest('[role="button"]');
              const isLink = target.closest('a');
              const isClickable = isButton || isLink;

              // 如果是可点击元素，不阻止事件
              if (isClickable) {
                return;
              }

              // 只在必要时停止传播，但不阻止默认行为
              if (!playlistContainer) {
                e.stopPropagation();
              }
            }}
            onTouchStart={(e) => {
              // 记录触摸开始位置，用于区分点击和滚动
              const touch = e.touches[0];
              if (touch && e.target) {
                (e.target as any)._touchStart = { x: touch.clientX, y: touch.clientY };
              }
            }}
            onTouchEnd={(e) => {
              // 清理触摸数据
              if (e.target) {
                delete (e.target as any)._touchStart;
              }
            }}
            // ✅ 修复：移除空的 onClick 和 onTouchStart 处理器，避免意外阻止事件
          >
            <AudiobookPlayer
              audiobookId={id!}
              audiobookTitle={audiobook.title}
              audiobookAuthor={audiobook.author}
              audiobookCover={getAudiobookCoverUrl(audiobook)}
              files={audiobook.files}
              initialFileId={currentFileId}
              initialTime={initialTime}
              onClose={() => {
                navigate(`/audiobooks/${id}`);
              }}
              onFileChange={(fileId) => setCurrentFileId(fileId)}
              onProgressUpdate={() => {}}
              isPageMode={true}
            />
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400">
              等待加载播放器...
              {!audiobook && ' (缺少有声小说数据)'}
              {!currentFileId && ' (缺少文件ID)'}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
