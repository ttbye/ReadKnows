/**
 * @file UserProfile.tsx
 * @description 用户资料页 - 查看好友或自己的公开资料（书友社交）
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  User, BookOpen, Book, Clock, MessageCircle, Calendar,
  RefreshCw, ChevronLeft
} from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

interface ProfileUser {
  id: string;
  username: string;
  nickname?: string;
  createdAt: string;
  isFriend: boolean;
  isSelf: boolean;
  totalBooks?: number;
  reading?: number;
  finished?: number;
  totalReadingTime?: number;
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const canUseFriends = currentUser?.can_use_friends !== undefined ? currentUser.can_use_friends : true;
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    }
  }, [userId]);

  const fetchProfile = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/users/profile/${userId}`);
      setProfile(res.data.user);
    } catch (e: any) {
      const msg = e.response?.data?.error || '加载资料失败';
      setError(msg);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = () => {
    if (!profile) return;
    navigate(`/chat/friend/${profile.id}`);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/messages');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* 顶部安全区 - 移动端/PWA 下避免返回按钮被刘海遮挡 */}
        <div
          className="flex-shrink-0 bg-white dark:bg-gray-800"
          style={{ height: typeof window !== 'undefined' && window.innerWidth < 1024 ? 'env(safe-area-inset-top, 0px)' : '0px' }}
        />
        <header className="flex-shrink-0 h-12 md:h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4">
          <button onClick={handleBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">用户资料</span>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* 顶部安全区 - 移动端/PWA 下避免返回按钮被刘海遮挡 */}
        <div
          className="flex-shrink-0 bg-white dark:bg-gray-800"
          style={{ height: typeof window !== 'undefined' && window.innerWidth < 1024 ? 'env(safe-area-inset-top, 0px)' : '0px' }}
        />
        <header className="flex-shrink-0 h-12 md:h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4">
          <button onClick={handleBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">用户资料</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <p className="text-gray-500 dark:text-gray-400 mb-4">{error || '用户不存在'}</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const displayName = profile.nickname || profile.username;
  const joinDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* 顶部安全区 - 移动端/PWA 下避免返回按钮被刘海遮挡 */}
      <div
        className="flex-shrink-0 bg-white dark:bg-gray-800"
        style={{ height: typeof window !== 'undefined' && window.innerWidth < 1024 ? 'env(safe-area-inset-top, 0px)' : '0px' }}
      />
      {/* 顶部栏 */}
      <header className="flex-shrink-0 h-12 md:h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4">
        <button onClick={handleBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <span className="font-medium text-gray-900 dark:text-gray-100">用户资料</span>
        <button
          onClick={fetchProfile}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          title="刷新"
        >
          <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* 头像与昵称 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold mb-3">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{displayName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
            {profile.isSelf && (
              <span className="mt-2 px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                本人
              </span>
            )}
            {profile.isFriend && !profile.isSelf && (
              <span className="mt-2 px-3 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                好友
              </span>
            )}
          </div>

          {/* 发消息（非本人且为好友时，且需要书友权限） */}
          {profile.isFriend && !profile.isSelf && canUseFriends && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleChat}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                发消息
              </button>
            </div>
          )}
        </div>

        {/* 加入时间 */}
        {joinDate && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">加入时间</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{joinDate}</div>
              </div>
            </div>
          </div>
        )}

        {/* 阅读统计 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            阅读统计
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {profile.totalBooks ?? 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">在读书籍</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {profile.reading ?? 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">阅读中</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center">
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {profile.finished ?? 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">已读完</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                {Math.round((profile.totalReadingTime ?? 0) / 60)}h
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">阅读时长</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
