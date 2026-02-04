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
  LogOut, Shield, Grid3x3, Sparkles, RefreshCw, MessageCircle, ChevronDown, ChevronUp,
  StickyNote, Music, Sun, Moon, Monitor, FileText, CheckCircle, Calendar, Pencil
} from 'lucide-react';
import api, { getAvatarUrl } from '../utils/api';
import toast from 'react-hot-toast';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';
import { useTheme } from '../hooks/useTheme';

export default function Profile() {
  const { t } = useTranslation();
  const { user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [bookStats, setBookStats] = useState({ total: 0, reading: 0, finished: 0 });
  const [loading, setLoading] = useState(true);
  const [backendVersion, setBackendVersion] = useState<string>('');
  const [backendBuildTime, setBackendBuildTime] = useState<string>('');
  const [showAboutSystem, setShowAboutSystem] = useState(false);
  const [showUsageHelp, setShowUsageHelp] = useState(false);
  const [checkinToday, setCheckinToday] = useState<{ checked: boolean }>({ checked: false });
  const [checkinStreak, setCheckinStreak] = useState(0);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [achievementStats, setAchievementStats] = useState({
    unlockedCount: 0,
    totalAchievements: 0,
    totalPoints: 0,
  });
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const timer1 = setTimeout(() => fetchUserStats(), 300);
      const timer2 = setTimeout(() => fetchBackendVersion(), 500);
      const timer3 = setTimeout(() => fetchCheckin(), 400);
      const timer4 = setTimeout(() => fetchAchievements(), 450);
      api.get('/users/me').then((r) => setUser(r.data.user)).catch(() => {});
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(timer4);
      };
    }
  }, [user]);

  const fetchCheckin = async () => {
    try {
      const [todayRes, listRes] = await Promise.all([
        api.get('/reading-checkins/today'),
        api.get('/reading-checkins?limit=365')
      ]);
      setCheckinToday({ checked: !!todayRes.data?.checked });
      setCheckinStreak(listRes.data?.streak ?? 0);
    } catch {
      setCheckinToday({ checked: false });
      setCheckinStreak(0);
    }
  };

  const fetchAchievements = async () => {
    try {
      setAchievementsLoading(true);
      const response = await api.get('/achievements');
      setAchievements(response.data?.achievements || []);
      setAchievementStats({
        unlockedCount: response.data?.stats?.unlockedCount || 0,
        totalAchievements: response.data?.stats?.totalAchievements || 0,
        totalPoints: response.data?.stats?.totalPoints || 0,
      });
    } catch (error) {
      console.error('获取成就失败:', error);
      setAchievements([]);
      setAchievementStats({ unlockedCount: 0, totalAchievements: 0, totalPoints: 0 });
    } finally {
      setAchievementsLoading(false);
    }
  };

  const doCheckin = async () => {
    if (checkinToday.checked) return;
    try {
      setCheckinLoading(true);
      await api.post('/reading-checkins', {});
      setCheckinToday({ checked: true });
      setCheckinStreak((s) => s + 1);
      fetchAchievements();
      toast.success('今日打卡成功');
    } catch (e: any) {
      toast.error(e.response?.data?.error || '打卡失败');
    } finally {
      setCheckinLoading(false);
    }
  };

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
      // 获取书架书籍统计（我的书架中的书籍数量）
      const shelfResponse = await api.get('/shelf/my', {
        params: { limit: 1000 },
        timeout: 5000, // 5秒超时
      });
      const shelfBooks = shelfResponse.data.books || [];
      const total = shelfBooks.length;
      
      // 获取阅读进度（使用较小的limit）
      const progressResponse = await api.get('/reading/progress', {
        params: { limit: 100 },
        timeout: 5000, // 5秒超时
      });
      const progresses = progressResponse.data.progresses || [];
      
      const reading = progresses.filter((p: any) => p.progress > 0 && p.progress < 1).length;
      const finished = progresses.filter((p: any) => p.progress >= 1).length;
      
      setBookStats({
        total, // 书架中的书籍数量
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
    await fetchAchievements();
    try { const r = await api.get('/users/me'); setUser(r.data.user); } catch (_) {}
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

  // 检查导入有声小说的权限
  const canImportAudiobook = (user as any)?.can_import_audiobook !== undefined
    ? (user as any).can_import_audiobook === true || (user as any).can_import_audiobook === 1 || (user as any).can_import_audiobook === '1'
    : user?.role === 'admin'; // 默认：只有管理员可以导入（向后兼容）

  // 检查书友功能权限
  const canUseFriends = user?.can_use_friends !== undefined ? user.can_use_friends : true;

  // 功能菜单项
  const menuItems = [
    { path: '/upload', label: t('profile.uploadBooks'), icon: Upload, color: 'bg-blue-500', adminOnly: false, show: true },
    { path: '/history', label: t('profile.readingHistory'), icon: Clock, color: 'bg-orange-500', adminOnly: false, show: true },
    { path: '/ai-reading', label: t('profile.aiReading'), icon: Sparkles, color: 'bg-teal-500', adminOnly: false, show: true },
    { path: '/settings', label: t('profile.systemSettings'), icon: Settings, color: 'bg-green-500', adminOnly: false, show: true },
    { path: '/notes', label: t('navigation.notes'), icon: StickyNote, color: 'bg-cyan-500', adminOnly: false, show: true },
    { path: '/logs', label: '日志管理', icon: FileText, color: 'bg-indigo-500', adminOnly: true, show: user?.role === 'admin' },
    { path: '/messages', label: t('friends.title'), icon: MessageCircle, color: 'bg-yellow-500', adminOnly: false, show: canUseFriends },
    ...(user?.role === 'admin'
      ? [
          { path: '/users', label: t('profile.userManagement'), icon: Users, color: 'bg-purple-500', adminOnly: true, show: true },
          { path: '/ip-management', label: t('profile.securityManagement'), icon: Shield, color: 'bg-red-500', adminOnly: true, show: true },
        ]
      : []),
  ].filter(item => item.show); // 只显示有权限的菜单项

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
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              role="button"
              tabIndex={0}
              onDoubleClick={() => navigate('/profile/avatar')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/profile/avatar'); } }}
              title="双击更换头像"
              className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden cursor-pointer select-none ${user?.avatar_path ? 'bg-gray-200 dark:bg-gray-700' : 'bg-blue-600'}`}
            >
              {user?.avatar_path && getAvatarUrl(user.avatar_path) ? (
                <img src={getAvatarUrl(user.avatar_path)!} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/profile/avatar')}
              title="修改头像"
              aria-label="修改头像"
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
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

      {/* 主题设置 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Monitor className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.theme') || '主题设置'}</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'system', label: t('settings.systemTheme') || '跟随系统', icon: Monitor },
            { value: 'light', label: t('settings.lightMode') || '浅色模式', icon: Sun },
            { value: 'dark', label: t('settings.darkMode') || '深色模式', icon: Moon },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className={`flex flex-col items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  theme === option.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                  className="hidden"
                />
                <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 读书打卡 + 成就 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-amber-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">读书打卡</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={doCheckin}
            disabled={checkinToday.checked || checkinLoading}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              checkinToday.checked
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-default'
                : 'bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50'
            }`}
          >
            {checkinToday.checked ? (
              <>
                <CheckCircle className="w-5 h-5" />
                已打卡
              </>
            ) : checkinLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                打卡中
              </>
            ) : (
              <>
                <Calendar className="w-5 h-5" />
                今日打卡
              </>
            )}
          </button>
          <div className="text-gray-600 dark:text-gray-400">
            已连续打卡 <span className="font-bold text-amber-600 dark:text-amber-400">{checkinStreak}</span> 天
          </div>
        </div>
        {/* 成就 - 单行，放在下方 */}
        <div className="flex items-center gap-2 sm:gap-3 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
          <Sparkles className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">成就</span>
          {achievementsLoading ? (
            <div className="flex-1 flex justify-center min-w-0">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500" />
            </div>
          ) : achievements.length > 0 ? (
            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto min-w-0 py-0.5">
              {achievements.map((a) => (
                <span
                  key={a.id}
                  title={a.description ? `${a.name}：${a.description}` : a.name}
                  className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm ${
                    a.unlocked ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-gray-200 dark:bg-gray-700 opacity-50'
                  }`}
                >
                  {a.icon || '🏆'}
                </span>
              ))}
            </div>
          ) : (
            <span className="flex-1 text-xs text-gray-500 dark:text-gray-400">暂无</span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
            {achievementStats.unlockedCount}/{achievementStats.totalAchievements} · {achievementStats.totalPoints} 分
          </span>
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

      {/* 系统信息 - 折叠卡片 */}
      <div className="card mb-6">
        <button
          onClick={() => setShowAboutSystem(!showAboutSystem)}
          className="w-full flex items-center justify-between gap-2 mb-4"
        >
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.aboutSystem')}</h2>
          </div>
          {showAboutSystem ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>
        {showAboutSystem && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('profile.appName')}</h3>
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
              {/* <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">GitHub</span>
                <a
                  href="https://github.com/ttbye/ReadKnows"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  github.com/ttbye/ReadKnows
                </a>
              </div> */}
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
        )}
      </div>

      {/* 使用说明 - 折叠卡片 */}
      <div className="card mb-6">
        <button
          onClick={() => setShowUsageHelp(!showUsageHelp)}
          className="w-full flex items-center justify-between gap-2 mb-4"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('profile.usageInstructions')}</h2>
          </div>
          {showUsageHelp ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>
        {showUsageHelp && (
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
        )}
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

