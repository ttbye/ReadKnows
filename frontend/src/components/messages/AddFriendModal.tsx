import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, UserPlus, Mail, User } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface AddFriendModalProps {
  onClose: () => void;
}

interface User {
  id: string;
  username: string;
  nickname: string;
  email: string;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingRequests, setSendingRequests] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      toast.error(t('messages.enterKeywordToSearch'));
      return;
    }

    try {
      setSearching(true);
      const response = await api.get(`/friends/search?keyword=${encodeURIComponent(searchKeyword)}`);
      setSearchResults(response.data.users || []);
    } catch (error) {
      console.error('search failed:', error);
      toast.error(t('friends.searchFailed'));
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: string, username: string) => {
    try {
      setSendingRequests(prev => new Set(prev).add(userId));
      await api.post('/friends/requests', { friendId: userId });
      toast.success(t('messages.friendRequestSentTo', { name: username }));
      setSearchResults(prev => prev.filter(user => user.id !== userId));
    } catch (error: any) {
      console.error('send friend request failed:', error);
      if (error.response?.data?.message?.includes('already')) {
        toast.error(t('messages.alreadySentRequest'));
      } else if (error.response?.data?.message?.includes('friends')) {
        toast.error(t('messages.alreadyFriend'));
      } else {
        toast.error(t('friends.requestFailed'));
      }
    } finally {
      setSendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.addFriendTitle')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* 搜索区域 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('messages.searchPlaceholderLong')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {searching ? t('common.searching') : t('common.search')}
            </button>
          </div>
        </div>

        {/* 搜索结果 */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {searchResults.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {searchKeyword ? t('friends.noUsersFound') : t('messages.enterKeywordToSearch')}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {searchResults.map((user) => (
                <div key={user.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                      {(user.nickname || user.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {user.nickname || user.username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {user.username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSendRequest(user.id, user.nickname || user.username)}
                    disabled={sendingRequests.has(user.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <UserPlus className="w-3 h-3" />
                    {sendingRequests.has(user.id) ? t('messages.sending') : t('messages.addButton')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};