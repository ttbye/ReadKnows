/**
 * @file authStore.ts
 * @author ttbye
 * @date 2025-12-11
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../utils/api';

interface User {
  id: string;
  username: string;
  email: string;
  role?: string;
  can_upload_private?: boolean;
  max_private_books?: number;
  can_upload_books?: boolean;
  can_edit_books?: boolean;
  can_download?: boolean;
  can_push?: boolean;
  can_use_friends?: boolean;
  nickname?: string;
  avatar_path?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user) => {
        set({ token, user, isAuthenticated: true });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      },
      logout: async () => {
        set({ token: null, user: null, isAuthenticated: false });
        delete api.defaults.headers.common['Authorization'];

        // 登出时清除缓存，确保数据安全
        try {
          const { offlineDataCache } = await import('../utils/offlineDataCache');
          await offlineDataCache.clearAll();
        } catch (e) {
          // 静默处理清除缓存失败
        }
      },
      setUser: (user) => set({ user }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

