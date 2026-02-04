/**
 * @file App.tsx
 * @author ttbye
 * @date 2024-12-11
 * @description 主应用组件，定义路由
 */

import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import InstallPWA from './components/InstallPWA';
import LanguageSelect from './pages/LanguageSelect';
import Login from './pages/Login';
import Register from './pages/Register';
import BookList from './pages/BookList';
import BookDetail from './pages/BookDetail';
import MyShelf from './pages/MyShelf';
import ReadingHistory from './pages/ReadingHistory';
import Reader from './pages/ReaderNew';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import BookManagement from './pages/BookManagement';
import IPManagement from './pages/IPManagement';
import CategoryManagement from './pages/CategoryManagement';
import Notes from './pages/Notes';
import AIReading from './pages/AIReading';
import SearchResults from './pages/SearchResults';
import Profile from './pages/Profile';
import ProfileAvatar from './pages/ProfileAvatar';
import AccountSettings from './pages/AccountSettings';
import UserProfile from './pages/UserProfile';
import GroupManagement from './pages/GroupManagement';
import GroupInvitations from './pages/GroupInvitations';
import Messages from './pages/Messages';
import ChatPage from './pages/ChatPage';
import Friends from './pages/Friends';
import AudiobookImport from './pages/AudiobookImport';
import AudiobookList from './pages/AudiobookList';
import AudiobookDetail from './pages/AudiobookDetail';
import AudiobookPlayerPage from './pages/AudiobookPlayerPage';
import LogManagement from './pages/LogManagement';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function FriendsRouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const canUseFriends = user?.can_use_friends !== undefined ? user.can_use_friends : true;

  // 如果用户有书友权限或权限未定义（向后兼容），允许访问
  if (canUseFriends) {
    return <>{children}</>;
  }

  // 没有权限的用户重定向到首页
  return <Navigate to="/" replace />;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // 全局清理：PWA关闭时停止所有音频播放
  useEffect(() => {
    const stopAllAudio = () => {
      // 使用全局音频管理器停止所有音频
      if ((window as any).globalAudioManager && typeof (window as any).globalAudioManager.stopAll === 'function') {
        (window as any).globalAudioManager.stopAll();
      } else {
        // 降级方案：直接停止所有音频元素
        if (typeof document !== 'undefined') {
          const allAudios = document.querySelectorAll('audio');
          allAudios.forEach((audioEl) => {
            if (!audioEl.paused) {
              try {
                audioEl.pause();
                audioEl.currentTime = 0;
                // 清理blob URL
                if (audioEl.src && audioEl.src.startsWith('blob:')) {
                  URL.revokeObjectURL(audioEl.src);
                }
              } catch (e) {
                // 静默处理错误，避免影响页面
              }
            }
          });
        }
      }
      
      // 发送停止事件
      window.dispatchEvent(new CustomEvent('audiobook:stop'));
    };
    
    // 监听页面隐藏/冻结事件（PWA关闭时）
    const handlePageHide = (event: PageTransitionEvent) => {
      // 检查是否是 PWA 模式
      const isPWA = typeof window !== 'undefined' && 
        (window.matchMedia('(display-mode: standalone)').matches || 
         (window.navigator as any).standalone === true ||
         document.referrer.includes('android-app://'));
      
      // 在 PWA 模式下，即使页面隐藏也应该允许后台播放
      // 只有在非 PWA 模式下且页面未被持久化时才停止播放
      if (!isPWA && !event.persisted) {
        stopAllAudio();
      }
      // 其他情况允许后台播放
    };
    
    // 监听visibilitychange事件（页面切换到后台时）
    const handleVisibilityChange = () => {
      // 注意：这里不停止播放，因为用户可能希望后台播放
      // 只有在真正关闭时才停止
    };
    
    // 只在 pagehide 事件中处理清理，避免 beforeunload 导致页面刷新循环
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 处理Android返回按钮和侧滑返回手势
  useEffect(() => {
    // ✅ 修复：智能返回路径判断函数
    const getSmartBackPath = (currentPath: string): string | null => {
      // 有声小说播放页面 -> 详情页面
      if (currentPath.startsWith('/audiobooks/') && currentPath.includes('/player')) {
        const audiobookId = currentPath.split('/')[2];
        return audiobookId ? `/audiobooks/${audiobookId}` : '/audiobooks';
      }
      
      // 有声小说详情页面 -> 列表页面
      if (currentPath.startsWith('/audiobooks/') && !currentPath.includes('/player')) {
        return '/audiobooks';
      }
      
      // 书籍详情页面 -> 列表页面
      if (currentPath.startsWith('/books/')) {
        return '/books';
      }
      
      // 阅读器页面 -> 触发关闭事件（由阅读器组件处理）
      if (currentPath.startsWith('/reader/')) {
        return null; // 返回 null 表示需要特殊处理
      }
      
      // 个人中心子页面 -> 个人中心
      if (currentPath.startsWith('/profile/') || 
          currentPath.startsWith('/settings') ||
          currentPath.startsWith('/users') ||
          currentPath.startsWith('/ip-management') ||
          currentPath.startsWith('/logs') ||
          currentPath.startsWith('/upload') ||
          currentPath.startsWith('/history') ||
          currentPath.startsWith('/books-management') ||
          currentPath.startsWith('/ai-reading')) {
        return '/profile';
      }
      
      // 笔记子页面 -> 笔记列表
      if (currentPath.startsWith('/notes') && currentPath !== '/notes') {
        return '/notes';
      }
      
      // 其他情况返回 null，使用浏览器历史记录
      return null;
    };
    
    const handleAndroidBack = (e: CustomEvent) => {
      const path = location.pathname;
      
      // 如果在登录或注册页面，不处理返回（让Android退出应用）
      if (path === '/login' || path === '/register' || path === '/language-select') {
        if (e.detail) {
          e.detail.handled = false;
        }
        return;
      }
      
      // 如果在阅读器页面，触发关闭事件
      if (path.startsWith('/reader/')) {
        const closeEvent = new CustomEvent('readerClose');
        window.dispatchEvent(closeEvent);
        if (e.detail) {
          e.detail.handled = true;
        }
        return;
      }
      
      // ✅ 修复：使用智能返回路径判断
      try {
        const smartBackPath = getSmartBackPath(path);
        
        if (smartBackPath) {
          // 使用智能路径
          navigate(smartBackPath);
          if (e.detail) {
            e.detail.handled = true;
          }
        } else if (window.history.length > 1) {
          // 使用浏览器历史记录
          navigate(-1);
          if (e.detail) {
            e.detail.handled = true;
          }
        } else {
          // 如果没有历史记录，返回首页
          if (path !== '/') {
            navigate('/');
            if (e.detail) {
              e.detail.handled = true;
            }
          } else {
            // 已经在首页，让Android退出应用
            if (e.detail) {
              e.detail.handled = false;
            }
          }
        }
      } catch (error) {
        console.error('[App] 处理返回按钮失败:', error);
        if (e.detail) {
          e.detail.handled = false;
        }
      }
    };

    // 监听Android返回按钮事件（自定义事件，由原生代码触发）
    window.addEventListener('androidBackButton', handleAndroidBack as EventListener);
    
    // ✅ 修复：添加 Capacitor App 插件监听（处理系统返回按钮和左划手势）
    let capacitorBackButtonListener: any = null;
    
    // 检查是否在 Capacitor 环境中
    if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform && (window as any).Capacitor.isNativePlatform()) {
      // 动态导入 @capacitor/app（如果已安装）
      // 注意：需要先安装 @capacitor/app: npm install @capacitor/app
      try {
        import('@capacitor/app').then((App) => {
          // 监听返回按钮事件（包括硬件返回键和左划手势）
          capacitorBackButtonListener = App.App.addListener('backButton', (data: any) => {
            console.log('[App] Capacitor 返回按钮/手势事件', data);
            // 触发自定义事件，让 handleAndroidBack 处理
            const event = new CustomEvent('androidBackButton', {
              detail: { handled: false }
            });
            window.dispatchEvent(event);
            
            // 如果事件被处理了，阻止默认行为（退出应用）
            if ((event as any).detail?.handled) {
              // 阻止默认行为（不退出应用）
              data.canGoBack = false;
            } else {
              // 如果没有处理，允许默认行为（退出应用）
              data.canGoBack = true;
            }
          });
          console.log('[App] Capacitor App 插件监听已注册');
        }).catch((error) => {
          console.warn('[App] @capacitor/app 插件未安装，使用自定义事件处理:', error);
          console.warn('[App] 提示：运行 npm install @capacitor/app 以支持 Android 返回手势');
        });
      } catch (error) {
        console.warn('[App] 无法加载 @capacitor/app 插件:', error);
      }
    }
    
    // 监听阅读器关闭事件
    const handleReaderClose = () => {
      if (location.pathname.startsWith('/reader/')) {
        try {
          navigate(-1);
        } catch (error) {
          console.error('[App] 关闭阅读器失败:', error);
        }
      }
    };
    window.addEventListener('readerClose', handleReaderClose);

    return () => {
      window.removeEventListener('androidBackButton', handleAndroidBack as EventListener);
      window.removeEventListener('readerClose', handleReaderClose);
      
      // 清理 Capacitor 监听器
      if (capacitorBackButtonListener && typeof capacitorBackButtonListener.remove === 'function') {
        capacitorBackButtonListener.remove();
      }
    };
  }, [navigate, location.pathname]);

  return (
    <>
      <Routes>
        <Route path="/language-select" element={<LanguageSelect />} />
        <Route 
          path="/login" 
          element={<Login />} 
        />
        <Route 
          path="/register" 
          element={<Register />} 
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout>
                <MyShelf />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/books"
          element={
            <PrivateRoute>
              <Layout>
                <BookList />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/books/:id"
          element={
            <PrivateRoute>
              <Layout>
                <BookDetail />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/shelf"
          element={
            <PrivateRoute>
              <Layout>
                <MyShelf />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/history"
          element={
            <PrivateRoute>
              <Layout>
                <ReadingHistory />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/reader/:bookId"
          element={
            <PrivateRoute>
              <Reader />
            </PrivateRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <PrivateRoute>
              <Layout>
                <Upload />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/audiobook-import"
          element={
            <PrivateRoute>
              <Layout>
                <AudiobookImport />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/audiobooks"
          element={
            <PrivateRoute>
              <Layout>
                <RouteErrorBoundary pageName="AudiobookList">
                  <AudiobookList />
                </RouteErrorBoundary>
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/audiobooks/:id"
          element={
            <PrivateRoute>
              <Layout>
                <RouteErrorBoundary pageName="AudiobookDetail">
                  <AudiobookDetail />
                </RouteErrorBoundary>
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/audiobooks/:id/player"
          element={
            <PrivateRoute>
              <RouteErrorBoundary pageName="AudiobookPlayerPage">
                <AudiobookPlayerPage />
              </RouteErrorBoundary>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <Layout>
                <Settings />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Layout>
                <Profile />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/user/:userId"
          element={
            <PrivateRoute>
              <UserProfile />
            </PrivateRoute>
          }
        />
        <Route
          path="/profile/avatar"
          element={
            <PrivateRoute>
              <Layout>
                <ProfileAvatar />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/profile/account"
          element={
            <PrivateRoute>
              <Layout>
                <AccountSettings />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/users"
          element={
            <PrivateRoute>
              <Layout>
                <UserManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/books-management"
          element={
            <PrivateRoute>
              <Layout>
                <BookManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/ip-management"
          element={
            <PrivateRoute>
              <Layout>
                <IPManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/logs"
          element={
            <PrivateRoute>
              <Layout>
                <LogManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/category-management"
          element={
            <PrivateRoute>
              <Layout>
                <CategoryManagement />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/notes"
          element={
            <PrivateRoute>
              <Layout>
                <Notes />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/ai-reading"
          element={
            <PrivateRoute>
              <Layout>
                <AIReading />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/search"
          element={
            <PrivateRoute>
              <Layout>
                <SearchResults />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/groups"
          element={
            <PrivateRoute>
              <FriendsRouteGuard>
                <Layout>
                  <GroupManagement />
                </Layout>
              </FriendsRouteGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/group-invitations"
          element={
            <PrivateRoute>
              <FriendsRouteGuard>
                <Layout>
                  <GroupInvitations />
                </Layout>
              </FriendsRouteGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <PrivateRoute>
              <FriendsRouteGuard>
                <Layout>
                  <Messages />
                </Layout>
              </FriendsRouteGuard>
            </PrivateRoute>
          }
        />
        <Route
          path="/chat/:type/:conversationId"
          element={
            <PrivateRoute>
              <FriendsRouteGuard>
                <ChatPage />
              </FriendsRouteGuard>
            </PrivateRoute>
          }
        />
        {/* 重定向 /friends 和 /groups 到 /messages */}
        <Route
          path="/friends"
          element={
            <PrivateRoute>
              <Layout>
                <Navigate to="/messages?tab=friends" replace />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/groups"
          element={
            <PrivateRoute>
              <Layout>
                <Navigate to="/messages?tab=groups" replace />
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
      <InstallPWA />
      <Toaster 
        position="bottom-center"
        toastOptions={{
          // 默认样式
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            padding: '16px 24px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4), 0 4px 12px rgba(118, 75, 162, 0.3)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            maxWidth: '90vw',
            width: 'auto',
          },
          // 成功提示
          success: {
            duration: 2000,
            style: {
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#10b981',
            },
          },
          // 错误提示
          error: {
            duration: 3000,
            style: {
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#ef4444',
            },
          },
          // 加载提示
          loading: {
            style: {
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#3b82f6',
            },
          },
        }}
        containerStyle={{
          bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        }}
      />
    </>
  );
}

export default App;

