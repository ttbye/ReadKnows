/**
 * @file App.tsx
 * @author ttbye
 * @date 2024-12-11
 * @description 主应用组件，定义路由
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
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
import AccountSettings from './pages/AccountSettings';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
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

