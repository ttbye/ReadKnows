import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, UserCheck, UserMinus, Clock, Check, X as XIcon } from 'lucide-react';

interface FriendsManagementModalProps {
  onClose: () => void;
  friends: Friend[];
  friendRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onCancelRequest: (requestId: string) => void;
  onRemoveFriend: (friendId: string) => void;
}

interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_nickname: string;
  friend_email: string;
  status: string;
  remark?: string;
  group_name_display?: string;
}

interface FriendRequest {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
  message?: string;
  user_username?: string;
  user_nickname?: string;
  user_email?: string;
  friend_username?: string;
  friend_nickname?: string;
}

export const FriendsManagementModal: React.FC<FriendsManagementModalProps> = ({
  onClose,
  friends,
  friendRequests,
  sentRequests,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
  onRemoveFriend,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');

  const handleAcceptRequest = (requestId: string) => {
    onAcceptRequest(requestId);
  };

  const handleRejectRequest = (requestId: string) => {
    onRejectRequest(requestId);
  };

  const handleCancelRequest = (requestId: string) => {
    onCancelRequest(requestId);
  };

  const handleRemoveFriend = (friendId: string) => {
    if (!confirm(t('messages.deleteFriendConfirmShort'))) return;
    onRemoveFriend(friendId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.friendsManagement')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'friends'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t('messages.myFriends', { count: friends.length })}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'requests'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t('messages.friendRequests', { count: friendRequests.length + sentRequests.length })}
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {activeTab === 'friends' && (
            <div>
              {friends.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <UserCheck className="w-8 h-8 opacity-50" />
                  </div>
                  <p>暂无好友</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {friends.map((friend) => (
                    <div key={friend.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                          {(friend.friend_nickname || friend.friend_username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {friend.remark || friend.friend_nickname || friend.friend_username}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {friend.friend_username} · {friend.friend_email}
                          </div>
                          {friend.group_name_display && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {t('friends.group')}: {friend.group_name_display}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFriend(friend.friend_id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title={t('friends.delete')}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div>
              {/* 收到的请求 */}
              {friendRequests.length > 0 && (
                <div className="mb-6">
                  <h3 className="px-4 py-2 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('messages.receivedRequestsLabel', { count: friendRequests.length })}
                  </h3>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {friendRequests.map((request) => (
                      <div key={request.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold">
                              {(request.user_nickname || request.user_username || '').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {request.user_nickname || request.user_username}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(request.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAcceptRequest(request.id)}
                              className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                              title={t('messages.acceptTitle')}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRejectRequest(request.id)}
                              className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                              title={t('messages.rejectTitle')}
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {request.message && (
                          <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                            {request.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 发送的请求 */}
              {sentRequests.length > 0 && (
                <div>
                  <h3 className="px-4 py-2 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('messages.sentRequestsLabel', { count: sentRequests.length })}
                  </h3>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sentRequests.map((request) => (
                      <div key={request.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-bold">
                            {(request.friend_nickname || request.friend_username || '').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {request.friend_nickname || request.friend_username}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(request.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {request.status === 'pending' ? t('messages.pendingConfirm') :
                             request.status === 'accepted' ? t('messages.accepted') : t('messages.rejected')}
                          </span>
                          {request.status === 'pending' && (
                            <button
                              onClick={() => handleCancelRequest(request.id)}
                              className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              title={t('messages.cancelRequest')}
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {friendRequests.length === 0 && sentRequests.length === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <UserCheck className="w-8 h-8 opacity-50" />
                  </div>
                  <p>{t('messages.noFriendRequests')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};