/**
 * @file Profile.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  Upload, Users, Clock, Settings, User, BookOpen, Book, HelpCircle, Info, 
  LogOut, Shield, Grid3x3, Sparkles, RefreshCw 
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';

export default function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [bookStats, setBookStats] = useState({ total: 0, reading: 0, finished: 0 });
  const [loading, setLoading] = useState(true);
  const [backendVersion, setBackendVersion] = useState<string>('');
  const [backendBuildTime, setBackendBuildTime] = useState<string>('');

  useEffect(() => {
    if (user) {
      fetchUserStats();
      fetchBackendVersion();
    }
  }, [user]);

  const fetchBackendVersion = async () => {
    try {
      const response = await api.get('/settings/version');
      setBackendVersion(response.data.version || t('reader.unknownVersion'));
      setBackendBuildTime(response.data.buildTime || '');
    } catch (error) {
      console.error('获取后端版本号失败:', error);
      setBackendVersion(t('reader.unknownVersion'));
      setBackendBuildTime('');
    }
  };

  const fetchUserStats = async () => {
    try {
      setLoading(true);
      // 获取用户书籍统计
      const booksResponse = await api.get('/books?limit=1000');
      const allBooks = booksResponse.data.books || [];
      const userBooks = allBooks.filter((book: any) => book.uploader_id === user?.id);
      
      // 获取阅读进度
      const progressResponse = await api.get('/reading/progress?limit=1000');
      const progresses = progressResponse.data.progresses || [];
      
      const reading = progresses.filter((p: any) => p.progress > 0 && p.progress < 1).length;
      const finished = progresses.filter((p: any) => p.progress >= 1).length;
      
      setBookStats({
        total: userBooks.length,
        reading,
        finished,
      });
    } catch (error: any) {
      console.error('获取用户统计失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
      // 静默失败，让API拦截器处理缓存
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (confirm(t('auth.confirmLogout'))) {
      logout();
      navigate('/login');
    }
  };

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchUserStats();
    toast.success(
      (_toast) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '0.5s' }} />
          </div>
          <div>
            <div className="font-semibold text-white">{t('common.refreshSuccess')}</div>
            <div className="text-xs text-white/80 mt-0.5">{t('common.dataUpdated')}</div>
          </div>
        </div>
      ),
      {
        duration: 2000,
        style: {
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '16px 20px',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4), 0 4px 12px rgba(5, 150, 105, 0.3)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        },
        iconTheme: {
          primary: 'transparent',
          secondary: 'transparent',
        },
      }
    );
  };

  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 功能菜单项
  const menuItems = [
    { path: '/upload', label: t('profile.uploadBooks'), icon: Upload, color: 'bg-blue-500', adminOnly: false },
    { path: '/history', label: t('profile.readingHistory'), icon: Clock, color: 'bg-orange-500', adminOnly: false },
    { path: '/ai-reading', label: t('profile.aiReading'), icon: Sparkles, color: 'bg-teal-500', adminOnly: false },
    { path: '/settings', label: t('profile.systemSettings'), icon: Settings, color: 'bg-green-500', adminOnly: false },
    ...(user?.role === 'admin'
      ? [
          { path: '/users', label: t('profile.userManagement'), icon: Users, color: 'bg-purple-500', adminOnly: true },
          { path: '/ip-management', label: t('profile.securityManagement'), icon: Shield, color: 'bg-red-500', adminOnly: true },
        ]
      : []),
  ];

  return (
    <>
      <PullToRefreshIndicator 
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />
      <div className="max-w-4xl mx-auto pt-6">
        {/* 用户信息卡片 */}
        <div className="card mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{user?.username}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{user?.email}</p>
            {user?.role === 'admin' && (
              <span className="inline-block mt-2 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded">
                {t('profile.admin')}
              </span>
            )}
          </div>
        </div>

        {/* 统计数据 */}
        {loading ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{bookStats.total}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('profile.myBooks')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{bookStats.reading}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('profile.reading')}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{bookStats.finished}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('profile.finished')}</div>
            </div>
          </div>
        )}
      </div>

      {/* 功能菜单 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Grid3x3 className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.functionMenu')}</h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center p-4 card-gradient rounded-lg hover:shadow-md transition-all"
              >
                <div className={`w-12 h-12 ${item.color} rounded-lg flex items-center justify-center mb-2`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 账号管理 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.accountManagement')}</h2>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => navigate('/profile/account')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="text-gray-900 dark:text-gray-100">{t('profile.personalInfo')}</span>
            </div>
            <span className="text-gray-400">{t('profile.editPersonalInfoDesc')}</span>
          </button>
        </div>
      </div>

      {/* 系统信息 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.aboutSystem')}</h2>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('profile.appName')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">The Books Path</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {t('profile.appDescription')}
            </p>
          </div>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('profile.developer')}</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">ttbye</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">GitHub</span>
                <a
                  href="https://github.com/ttbye/ReadKnows"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  github.com/ttbye/ReadKnows
                </a>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">{t('profile.frontendVersion')}</span>
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-blue-600 dark:text-blue-400">
                  {import.meta.env.VITE_BUILD_VERSION || t('reader.unknownVersion')}
                </code>
              </div>
              {import.meta.env.VITE_BUILD_TIME && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{t('profile.frontendBuildTime')}</span>
                  <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                    {new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { 
                      year: 'numeric', 
                      month: '2-digit', 
                      day: '2-digit', 
                      hour: '2-digit', 
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </code>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">{t('profile.backendVersion')}</span>
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-green-600 dark:text-green-400">
                  {backendVersion || t('common.loading')}
                </code>
              </div>
              {backendBuildTime && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">{t('profile.backendBuildTime')}</span>
                  <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                    {new Date(backendBuildTime).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { 
                      year: 'numeric', 
                      month: '2-digit', 
                      day: '2-digit', 
                      hour: '2-digit', 
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </code>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.usageInstructions')}</h2>
        </div>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">📚 {t('profile.uploadBooksTitle')}</h4>
            <p>{t('profile.uploadBooksDesc')}</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">📖 {t('profile.readingFeaturesTitle')}</h4>
            <p>{t('profile.readingFeaturesDesc')}</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">📝 {t('profile.notesFeaturesTitle')}</h4>
            <p>{t('profile.notesFeaturesDesc')}</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">🤖 {t('profile.aiReadingTitle')}</h4>
            <p>{t('profile.aiReadingDesc')}</p>
          </div>
        </div>
      </div>

      {/* 退出登录 */}
      <div className="card">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 p-4 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">{t('auth.logout')}</span>
        </button>
      </div>
      </div>
    </>
  );
}

