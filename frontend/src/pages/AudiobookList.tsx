/**
 * @file AudiobookList.tsx
 * @description 有声小说列表页面
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { 
  Music, 
  Search, 
  Grid3x3, 
  List, 
  Clock,
  Play,
  Upload,
  Headphones
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { getCoverUrl } from '../utils/coverHelper';

interface Audiobook {
  id: string;
  title: string;
  author?: string;
  type: string;
  description?: string;
  cover_url?: string;
  fileCount: number;
  created_at?: string;
  progress?: {
    file_id: string;
    current_time: number;
    duration: number;
    progress: number;
  } | null;
}

export default function AudiobookList() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  const [audiobooks, setAudiobooks] = useState<Audiobook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    if (isAuthenticated) {
      fetchAudiobooks();
    }
  }, [isAuthenticated, page]);

  const fetchAudiobooks = async (search?: string) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        pageSize,
      };
      
      // 如果有搜索关键词，发送到后端进行模糊搜索
      // 使用传入的 search 参数或当前的 searchQuery 状态
      const currentSearch = search !== undefined ? search : searchQuery;
      if (currentSearch && currentSearch.trim()) {
        params.search = currentSearch.trim();
      }

      const response = await api.get('/audiobooks/list', { params });
      if (response.data.success) {
        setAudiobooks(response.data.audiobooks);
        setTotal(response.data.total);
      }
    } catch (error: any) {
      console.error('获取有声小说列表失败:', error);
      toast.error(error.response?.data?.error || '获取列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // 搜索时重置到第一页
    setPage(1);
    // 使用当前的 searchQuery 状态进行搜索
    fetchAudiobooks(searchQuery);
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 使用 coverHelper 中的 getCoverUrl 函数，支持自定义 API 地址
  const getAudiobookCoverUrl = (audiobook: Audiobook): string | null => {
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

  return (
    <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="w-full lg:max-w-7xl lg:mx-auto px-4 lg:px-6 py-6 lg:py-8">
        {/* 头部 - 扁平化设计 */}
        <div className="mb-6 lg:mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 dark:bg-blue-500 rounded-lg">
                <Music className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                {t('audiobook.title')}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                // 检查导入有声小说的权限
                const canImportAudiobook = (user as any)?.can_import_audiobook !== undefined
                  ? (user as any).can_import_audiobook === true || (user as any).can_import_audiobook === 1 || (user as any).can_import_audiobook === '1'
                  : user?.role === 'admin';
                
                return canImportAudiobook ? (
                  <button
                    onClick={() => navigate('/audiobook-import')}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    title={t('audiobook.import')}
                  >
                    <Upload className="w-5 h-5" />
                    <span className="hidden sm:inline">{t('audiobook.import')}</span>
                  </button>
                ) : null;
              })()}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  <Grid3x3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* 搜索 - 扁平化设计 */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('audiobook.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border-0 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              {t('common.search')}
            </button>
          </div>
        </div>

        {/* 列表内容 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          </div>
        ) : audiobooks.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <Music className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400">{t('audiobook.noAudiobooks')}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
            {audiobooks.map((audiobook) => (
              <Link
                key={audiobook.id}
                to={`/audiobooks/${audiobook.id}`}
                className="group block cursor-pointer relative"
              >
                <div className="overflow-hidden rounded-lg transition-all duration-300 hover:scale-105">
                  <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative flex-shrink-0 w-full rounded-lg">
                    {(() => {
                      const coverUrl = getAudiobookCoverUrl(audiobook);
                      return coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={audiobook.title}
                          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                          style={{ minWidth: '100%', minHeight: '100%' }}
                          onContextMenu={(e) => e.preventDefault()}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              parent.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center">
                                  <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                                  </svg>
                                </div>
                              `;
                            }
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                        </div>
                      );
                    })()}
                    {/* 语音图标 */}
                    <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-white p-1 rounded-full flex items-center justify-center">
                      <Headphones className="w-2.5 h-2.5" />
                    </div>
                    {audiobook.progress && audiobook.progress.progress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300 dark:bg-gray-600">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${audiobook.progress.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 px-1">
                    <h3 className="font-medium text-xs leading-tight line-clamp-2 text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={audiobook.title}>
                      {audiobook.title}
                    </h3>
                    {audiobook.author && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                        {audiobook.author}
                      </p>
                    )}
                    {audiobook.progress && audiobook.progress.progress > 0 && (
                      <div className="mt-1.5 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${audiobook.progress.progress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {audiobooks.map((audiobook) => (
              <Link
                key={audiobook.id}
                to={`/audiobooks/${audiobook.id}`}
                className="flex items-center gap-4 bg-white dark:bg-gray-800 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border border-gray-200 dark:border-gray-700"
              >
                <div className="relative w-20 h-20 flex-shrink-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg overflow-hidden">
                  {(() => {
                    const coverUrl = getAudiobookCoverUrl(audiobook);
                    return coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={audiobook.title}
                        className="w-full h-full object-cover"
                        onContextMenu={(e) => e.preventDefault()}
                      onError={(e) => {
                        // 加载失败时，隐藏图片并显示占位符
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.audiobook-cover-placeholder')) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'audiobook-cover-placeholder w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center';
                          placeholder.innerHTML = `
                            <svg class="w-10 h-10 text-white opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
                            </svg>
                          `;
                          parent.appendChild(placeholder);
                        }
                      }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-10 h-10 text-white opacity-90" />
                      </div>
                    );
                  })()}
                  {audiobook.progress && audiobook.progress.progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300/50 dark:bg-gray-600/50">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${audiobook.progress.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate mb-1">
                    {audiobook.title}
                  </h3>
                  {audiobook.author && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate mb-2">
                      {audiobook.author}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                      {audiobook.type}
                    </span>
                    <span>{audiobook.fileCount} {t('audiobook.episodes')}</span>
                    {audiobook.progress && audiobook.progress.progress > 0 && (
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <Clock className="w-3 h-3" />
                        {Math.round(audiobook.progress.progress)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <Play className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > pageSize && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.previous')}
            </button>
            <span className="text-gray-700 dark:text-gray-300">
              第 {page} 页，共 {Math.ceil(total / pageSize)} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
              disabled={page >= Math.ceil(total / pageSize)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

