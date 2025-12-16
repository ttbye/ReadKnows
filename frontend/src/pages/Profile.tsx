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

export default function Profile() {
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
      setBackendVersion(response.data.version || '未知版本');
      setBackendBuildTime(response.data.buildTime || '');
    } catch (error) {
      console.error('获取后端版本号失败:', error);
      setBackendVersion('未知版本');
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
    if (confirm('确定要退出登录吗？')) {
      logout();
      navigate('/login');
    }
  };

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchUserStats();
    toast.success(
      (t) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '0.5s' }} />
          </div>
          <div>
            <div className="font-semibold text-white">刷新成功</div>
            <div className="text-xs text-white/80 mt-0.5">数据已更新</div>
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
    { path: '/upload', label: '上传书籍', icon: Upload, color: 'bg-blue-500', adminOnly: false },
    { path: '/history', label: '阅读历史', icon: Clock, color: 'bg-orange-500', adminOnly: false },
    { path: '/ai-reading', label: 'AI阅读', icon: Sparkles, color: 'bg-teal-500', adminOnly: false },
    { path: '/settings', label: '系统设置', icon: Settings, color: 'bg-green-500', adminOnly: false },
    ...(user?.role === 'admin'
      ? [
          { path: '/users', label: '用户管理', icon: Users, color: 'bg-purple-500', adminOnly: true },
          { path: '/ip-management', label: '安全管理', icon: Shield, color: 'bg-red-500', adminOnly: true },
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
                管理员
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
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">我的书籍</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{bookStats.reading}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">阅读中</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{bookStats.finished}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">已完成</div>
            </div>
          </div>
        )}
      </div>

      {/* 功能菜单 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Grid3x3 className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">功能菜单</h2>
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">账号管理</h2>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => navigate('/profile/account')}
            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="text-gray-900 dark:text-gray-100">个人信息</span>
            </div>
            <span className="text-gray-400">修改用户名、邮箱、密码</span>
          </button>
        </div>
      </div>

      {/* 系统信息 */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">关于系统</h2>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">读士私人书库</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">The Books Path</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              一个现代化的电子书管理系统，支持EPUB、PDF、TXT等多种格式，提供流畅的阅读体验和强大的管理功能。
            </p>
          </div>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">开发人员</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">ttbye</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">GitHub</span>
                <a
                  href="https://ttbye.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ttbye.github.com
                </a>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">前端版本</span>
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-blue-600 dark:text-blue-400">
                  {import.meta.env.VITE_BUILD_VERSION || '未知版本'}
                </code>
              </div>
              {import.meta.env.VITE_BUILD_TIME && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">前端编译时间</span>
                  <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                    {new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString('zh-CN', { 
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
                <span className="text-gray-600 dark:text-gray-400">后端版本</span>
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-green-600 dark:text-green-400">
                  {backendVersion || '加载中...'}
                </code>
              </div>
              {backendBuildTime && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">后端编译时间</span>
                  <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                    {new Date(backendBuildTime).toLocaleString('zh-CN', { 
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">使用说明</h2>
        </div>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">📚 上传书籍</h4>
            <p>支持EPUB、PDF、TXT格式，上传后系统会自动解析书籍信息。</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">📖 阅读功能</h4>
            <p>支持多种阅读器，可自定义字体、主题、行距等阅读设置。</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">📝 笔记功能</h4>
            <p>阅读时可以添加笔记和标注，方便记录阅读心得。</p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">🤖 AI阅读</h4>
            <p>使用AI助手进行智能阅读，支持摘要、问答等功能。</p>
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
          <span className="font-medium">退出登录</span>
        </button>
      </div>
      </div>
    </>
  );
}

