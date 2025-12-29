/**
 * @file Layout.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Book, Upload, History, LogOut, Menu, X, Settings, Library, Users, Shield, ArrowLeft, ChevronDown, BookOpen, StickyNote, Sparkles, Sun, Moon, FolderOpen, Type } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { effectiveTheme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const [systemTitle, setSystemTitle] = useState<string>('读士私人书库');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 最近阅读功能
  const [latestBook, setLatestBook] = useState<any>(null);
  
  // 获取系统标题
  useEffect(() => {
    const fetchSystemTitle = async () => {
      try {
        const response = await api.get('/settings');
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
        console.error('获取系统标题失败:', error);
      }
    };
    
    if (isAuthenticated) {
      fetchSystemTitle();
    }
  }, [isAuthenticated]);
  
  useEffect(() => {
    if (isAuthenticated) {
      fetchLatestReading();
    }
  }, [isAuthenticated]);

  const fetchLatestReading = async () => {
    try {
      const response = await api.get('/reading/progress?limit=1');
      if (response.data.progresses && response.data.progresses.length > 0) {
        setLatestBook(response.data.progresses[0]);
      }
    } catch (error) {
      console.error('获取最近阅读失败:', error);
    }
  };

  const handleReadingClick = () => {
    if (latestBook && latestBook.book_id) {
      navigate(`/reader/${latestBook.book_id}`);
    } else {
      // 如果没有最近阅读，跳转到图书馆
      navigate('/books');
    }
  };

  // 移动端底部导航项（5个按钮：图书馆、书架、阅读、笔记、我的）
  const mobileNavItems = isAuthenticated
    ? [
        { path: '/books', label: t('navigation.library'), icon: Library, onClick: null },
        { path: '/', label: t('navigation.myShelf'), icon: Book, onClick: null },
        { path: '#', label: t('navigation.reading'), icon: BookOpen, onClick: handleReadingClick, isSpecial: true },
        { path: '/notes', label: t('navigation.notes'), icon: StickyNote, onClick: null },
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
    ...(isAuthenticated
      ? [
          { path: '/history', label: t('navigation.readingHistory'), icon: History },
          { path: '/notes', label: t('navigation.notes'), icon: StickyNote },
          { path: '/ai-reading', label: t('navigation.aiReading'), icon: Sparkles },
        ]
      : []),
  ];

  // 设置菜单项
  const settingsMenuItems = isAuthenticated
    ? [
        { path: '/settings', label: t('navigation.systemSettings'), icon: Settings },
        { path: '/upload', label: t('navigation.uploadBook'), icon: Upload },
        ...(user?.role === 'admin'
          ? [
              { path: '/books-management', label: t('navigation.bookManagement'), icon: FolderOpen },
              { path: '/users', label: t('navigation.userManagement'), icon: Users },
              { path: '/ip-management', label: t('navigation.securityManagement'), icon: Shield },
              { path: '/category-management', label: t('navigation.categoryManagement'), icon: Type },
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
  
  // 获取返回目标路径（子页面返回上一级）
  const getBackPath = () => {
    if (location.pathname.startsWith('/profile/account')) return '/profile';
    if (location.pathname.startsWith('/settings')) return '/profile';
    if (location.pathname.startsWith('/users')) return '/profile';
    if (location.pathname.startsWith('/ip-management')) return '/profile';
    if (location.pathname.startsWith('/upload')) return '/profile';
    if (location.pathname.startsWith('/history')) return '/profile';
    if (location.pathname.startsWith('/books-management')) return '/profile';
    if (location.pathname.startsWith('/notes')) return '/notes';
    if (location.pathname.startsWith('/ai-reading')) return '/profile';
    if (location.pathname.startsWith('/books/')) return '/books';
    if (location.pathname.startsWith('/reader/')) return '/';
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* 顶部导航栏 - 桌面端（仅在大屏幕显示，iPad不显示） */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50 shadow-sm lg:block hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between" style={{ height: '56px', marginTop: '-5px' }}>
            <div className="flex items-center gap-4">
              {/* 返回按钮 - 非首页显示在最左侧 */}
              {!isHomePage && (
                <button
                  onClick={() => navigate(getBackPath())}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title={t('common.back')}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{t('common.back')}</span>
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
                  (item.path === '/notes' && location.pathname.startsWith('/notes')) ||
                  (item.path === '/ai-reading' && location.pathname.startsWith('/ai-reading'));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="hidden lg:flex items-center gap-4">
              {isAuthenticated ? (
                <>
                  {/* 用户头像下拉菜单 */}
                  <div className="relative" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                        {user?.username?.[0]?.toUpperCase() || 'U'}
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
                            (item.path === '/settings' && location.pathname.startsWith('/settings')) ||
                            (item.path === '/upload' && location.pathname === '/upload') ||
                            (item.path === '/books-management' && location.pathname === '/books-management') ||
                            (item.path === '/users' && location.pathname === '/users') ||
                            (item.path === '/ip-management' && location.pathname === '/ip-management') ||
                            (item.path === '/category-management' && location.pathname === '/category-management');
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              onClick={() => setUserMenuOpen(false)}
                              className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                                isActive
                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                        {/* 分隔线 */}
                        {settingsMenuItems.length > 0 && (
                          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                        )}
                        {/* 主题切换 - 图标按钮 */}
                        <button
                          onClick={() => {
                            toggleTheme();
                            setUserMenuOpen(false);
                          }}
                          className="flex items-center justify-center px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-full"
                          title={effectiveTheme === 'dark' ? t('settings.switchToLight') : t('settings.switchToDark')}
                        >
                          {effectiveTheme === 'dark' ? (
                            <Sun className="w-5 h-5" />
                          ) : (
                            <Moon className="w-5 h-5" />
                          )}
                        </button>
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
                  </div>
                </>
              )}
              {isAuthenticated ? (
                <>
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                    <div className="px-4 py-2 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                        {user?.username?.[0]?.toUpperCase() || 'U'}
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
                  {/* 主题切换 - 图标按钮 */}
                  <button
                    onClick={() => {
                      toggleTheme();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center justify-center px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-full"
                    title={effectiveTheme === 'dark' ? t('settings.switchToLight') : t('settings.switchToDark')}
                  >
                    {effectiveTheme === 'dark' ? (
                      <Sun className="w-6 h-6" />
                    ) : (
                      <Moon className="w-6 h-6" />
                    )}
                  </button>
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
        className="lg:hidden sticky top-0 z-40 border-b shadow-sm backdrop-blur-xl"
        style={{ 
          paddingTop: 'env(safe-area-inset-top, 0px)',
          // 浅色主题：半透明白色渐变背景
          background: effectiveTheme === 'dark' 
            ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.85) 0%, rgba(31, 41, 55, 0.9) 50%, rgba(17, 24, 39, 0.85) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(249, 250, 251, 0.9) 50%, rgba(255, 255, 255, 0.85) 100%)',
          borderColor: effectiveTheme === 'dark' 
            ? 'rgba(75, 85, 99, 0.3)' 
            : 'rgba(229, 231, 235, 0.5)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between ipad-nav-header">
            <div className="flex items-center gap-3">
              {/* 返回按钮 - 非首页显示在最左侧 */}
              {!isHomePage && (
                <Link
                  to={getBackPath()}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  title={t('common.back')}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              )}
              <div className="flex items-center gap-2 text-lg font-bold text-blue-600 dark:text-blue-400">
                <Book className="w-5 h-5" />
                <span>{getPageTitle()}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAuthenticated && (
                <>
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
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium">
                      {user?.username?.[0]?.toUpperCase() || 'U'}
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

      {/* 主内容区域
          说明：不要在 main 上使用 overflow-y-auto 作为滚动容器，否则 iOS/PWA 的弹性拖拽会让 sticky header 看起来“乱动”。
          让页面滚动回到 body，sticky 才能稳定固定在顶部。
      */}
      <main className="flex-1 container mx-auto px-4 py-6 lg:py-8 hide-scrollbar ipad-main-content">
        {children}
      </main>

      {/* 移动端和iPad底部导航栏 - 紧贴屏幕底部，包含安全区域 */}
      {isAuthenticated && (
        <nav 
          className="lg:hidden fixed left-0 right-0 border-t z-50 shadow-lg backdrop-blur-xl"
          style={{
            bottom: 0,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            // 浅色主题：半透明白色渐变背景
            background: effectiveTheme === 'dark' 
              ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.85) 0%, rgba(31, 41, 55, 0.9) 50%, rgba(17, 24, 39, 0.85) 100%)'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(249, 250, 251, 0.9) 50%, rgba(255, 255, 255, 0.85) 100%)',
            borderColor: effectiveTheme === 'dark' 
              ? 'rgba(75, 85, 99, 0.3)' 
              : 'rgba(229, 231, 235, 0.5)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: effectiveTheme === 'dark'
              ? '0 -4px 20px rgba(0, 0, 0, 0.3), 0 -2px 8px rgba(0, 0, 0, 0.2)'
              : '0 -4px 20px rgba(0, 0, 0, 0.08), 0 -2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div className="flex items-center justify-around ipad-nav-footer">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = !item.isSpecial && (
                  location.pathname === item.path || 
                  (item.path === '/books' && location.pathname.startsWith('/books')) ||
                  (item.path === '/' && location.pathname === '/') ||
                  (item.path === '/notes' && location.pathname.startsWith('/notes')) ||
                  (item.path === '/profile' && location.pathname.startsWith('/profile'))
                );
                const isSpecial = item.isSpecial; // 阅读按钮（中间）
                
                if (isSpecial) {
                  return (
                    <button
                      key={item.path}
                      onClick={item.onClick}
                      className="flex items-center justify-center px-1.5 transition-all relative group"
                      style={{ marginTop: '-2px' }}
                    >
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105"
                        style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          boxShadow: '0 6px 12px rgba(102, 126, 234, 0.35), 0 3px 6px rgba(118, 75, 162, 0.25)'
                        }}
                      >
                        <Icon className="w-6 h-6 text-white drop-shadow-md" />
                      </div>
                    </button>
                  );
                }
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={item.onClick || undefined}
                    className={`flex flex-col items-center justify-center px-1.5 rounded-lg transition-all min-w-[50px] relative ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                    style={{ 
                      paddingTop: '10px', 
                      paddingBottom: '4px',
                      // 激活状态添加微妙的背景高光
                      backgroundColor: isActive 
                        ? (effectiveTheme === 'dark' 
                          ? 'rgba(59, 130, 246, 0.15)' 
                          : 'rgba(59, 130, 246, 0.08)')
                        : 'transparent',
                      borderRadius: '12px',
                    }}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                    <span className="text-[10px] font-medium leading-tight mt-0.5">{item.label}</span>
                  </Link>
                );
              })}
          </div>
        </nav>
      )}

      {/* 桌面端底部（仅大屏幕显示） */}
      <footer className="hidden lg:block bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>{t('footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}
