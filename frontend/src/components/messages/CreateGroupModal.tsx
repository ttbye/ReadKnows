import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface CreateGroupModalProps {
  onClose: () => void;
}

interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_nickname: string;
  friend_email: string;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  React.useEffect(() => {
    fetchFriends();
  }, []);

  const fetchFriends = async () => {
    try {
      setLoading(true);
      const response = await api.get('/friends');
      setFriends(response.data.friends || []);
    } catch (error) {
      console.error('fetch friends failed:', error);
      toast.error(t('friends.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error(t('messages.enterGroupName'));
      return;
    }

    if (selectedFriends.length === 0) {
      toast.error(t('messages.selectAtLeastOneFriend'));
      return;
    }

    try {
      setCreating(true);

      const createResponse = await api.post('/groups', {
        name: groupName.trim(),
        description: groupDescription.trim() || null,
      });

      const groupId = createResponse.data.group.id;

      let invited = 0;
      let inviteErrors: string[] = [];
      if (selectedFriends.length > 0) {
        try {
          const inviteRes = await api.post(`/groups/${groupId}/invite`, {
            userIds: selectedFriends,
          });
          invited = inviteRes?.data?.invited ?? 0;
          inviteErrors = inviteRes?.data?.errors ?? [];
        } catch (e) {
          inviteErrors = [t('messages.inviteFriendsFailed')];
        }
      }

      toast.success(invited > 0 ? t('messages.createGroupSuccessWithInvite', { count: invited }) : t('messages.createGroupSuccess'));
      if (inviteErrors.length > 0) {
        toast.error(inviteErrors[0] || t('messages.invitePartialFailed'));
      }
      onClose();
    } catch (error) {
      console.error('create group failed:', error);
      toast.error(t('messages.createGroupFailed'));
    } finally {
      setCreating(false);
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.newBookGroup')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* 表单区域 */}
        <div className="p-4 space-y-4">
          {/* 群组名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('messages.groupName')}
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('messages.groupNamePlaceholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={50}
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {groupName.length}/50
            </div>
          </div>

          {/* 群组描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('messages.groupDesc')}
            </label>
            <textarea
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              placeholder={t('messages.groupDescPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              maxLength={200}
            />
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {groupDescription.length}/200
            </div>
          </div>

          {/* 选择好友 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('messages.inviteFriends', { count: selectedFriends.length })}
              </label>
              <button
                onClick={() => setSelectedFriends(friends.map(f => f.friend_id))}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {t('messages.selectAll')}
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg">
              {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {t('messages.loadingFriends')}
                </div>
              ) : friends.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('messages.noFriendsShort')}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => toggleFriendSelection(friend.friend_id)}
                      className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedFriends.includes(friend.friend_id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                          {(friend.friend_nickname || friend.friend_username).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {friend.friend_nickname || friend.friend_username}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {friend.friend_username}
                          </div>
                        </div>
                        {selectedFriends.includes(friend.friend_id) && (
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreateGroup}
            disabled={creating || !groupName.trim()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? t('messages.creating') : t('messages.createGroup')}
          </button>
        </div>
      </div>
    </div>
  );
};