import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface InviteToGroupModalProps {
  onClose: () => void;
  friends?: Friend[];
  onInvite: (friendIds: string[], groupId: string) => void;
  groupId?: string;
  groupName?: string;
}

interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_nickname: string;
  friend_email: string;
  status?: string;
  remark?: string;
}

/** 统一展示项：friend_id 用于邀请接口，其余用于展示 */
type ListItem = { id: string; friend_id: string; friend_username: string; friend_nickname: string; friend_email: string; remark?: string };

export const InviteToGroupModal: React.FC<InviteToGroupModalProps> = ({
  onClose,
  friends = [],
  onInvite,
  groupId,
  groupName,
}) => {
  const { t } = useTranslation();
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [invitableList, setInvitableList] = useState<ListItem[]>([]);
  const [invitableHint, setInvitableHint] = useState<'no_accepted_friends' | 'all_in_group_or_pending' | undefined>(undefined);
  const [invitableLoadError, setInvitableLoadError] = useState(false);
  const [groups, setGroups] = useState<Array<{id: string, name: string}>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groupId || '');

  useEffect(() => {
    if (!groupId) {
      fetchGroups();
    }
  }, [groupId]);

  // 当有 groupId 时，从「可邀请好友」接口拉取列表（仅好友且排除已在群、已有待处理邀请）
  useEffect(() => {
    if (!groupId) return;
    setLoadingList(true);
    setInvitableHint(undefined);
    setInvitableLoadError(false);
    api.get(`/groups/${groupId}/invitable-friends`)
      .then((res) => {
        const raw = (res.data?.friends || []) as Array<{ friend_id: string; username?: string; nickname?: string; email?: string; remark?: string }>;
        setInvitableList(raw.map((f) => ({
          id: f.friend_id,
          friend_id: f.friend_id,
          friend_username: f.username || '',
          friend_nickname: f.nickname || '',
          friend_email: f.email || '',
          remark: f.remark,
        })));
        setInvitableHint((res.data?.hint as 'no_accepted_friends' | 'all_in_group_or_pending') || undefined);
      })
      .catch(() => {
        setInvitableList([]);
        setInvitableHint(undefined);
        setInvitableLoadError(true);
      })
      .finally(() => setLoadingList(false));
  }, [groupId]);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('获取群组列表失败:', error);
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleInvite = async () => {
    const targetGroupId = groupId || selectedGroupId;
    if (!targetGroupId) {
      toast.error(t('messages.selectGroupToInvite'));
      return;
    }

    if (selectedFriends.length === 0) {
      toast.error(t('messages.selectAtLeastOneFriend'));
      return;
    }

    try {
      setInviting(true);
      const res = await api.post(`/groups/${targetGroupId}/invite`, {
        userIds: selectedFriends,
      });
      const { invited = 0, errors } = res?.data || {};
      const group = groups.find(g => g.id === targetGroupId);
      const name = group?.name || groupName || t('messages.groupDefaultName');
      if (invited > 0) {
        toast.success(t('messages.invitedToGroupSuccess', { count: invited, name }));
      }
      if (errors && errors.length > 0) {
        toast.error(errors[0] || t('messages.invitePartialFailed'));
      }
      if (invited > 0) {
        onInvite(selectedFriends, targetGroupId);
        onClose();
      }
    } catch (error: any) {
      console.error('invite friends failed:', error);
      const msg = error?.response?.data?.error || error?.response?.data?.message;
      toast.error(msg || t('messages.inviteFriendsFailed'));
    } finally {
      setInviting(false);
    }
  };

  // 有 groupId：用可邀请好友接口结果；否则用父级传入的 friends（仅已接受）
  const listToShow: ListItem[] = groupId
    ? invitableList
    : friends
        .filter((f) => f.status === 'accepted')
        .map((f) => ({
          id: f.id,
          friend_id: f.friend_id,
          friend_username: f.friend_username || '',
          friend_nickname: f.friend_nickname || '',
          friend_email: f.friend_email || '',
          remark: f.remark,
        }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {groupName ? t('messages.inviteFriendsToGroup', { name: groupName }) : t('messages.inviteFriendsToGroupDefault')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          {/* 选择群组（如果没有预设） */}
          {!groupId && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                选择群组 *
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('messages.selectGroupPlaceholder')}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 选择好友 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('messages.selectFriends', { count: selectedFriends.length })}
              </label>
              <button
                onClick={() => setSelectedFriends(listToShow.map(f => f.friend_id))}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {t('messages.selectAll')}
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg">
              {loadingList ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {t('messages.loadingInvitableFriends')}
                </div>
              ) : listToShow.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>
                    {groupId
                      ? invitableLoadError
                        ? t('messages.loadFailedRetry')
                        : invitableHint === 'no_accepted_friends'
                        ? t('messages.addFriendsFirst')
                        : invitableHint === 'all_in_group_or_pending'
                        ? t('messages.allFriendsInGroupOrPending')
                        : t('messages.noInvitableFriendsShort')
                      : t('messages.noInvitableFriendsEmpty')}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {listToShow.map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => toggleFriendSelection(friend.friend_id)}
                      className={`p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedFriends.includes(friend.friend_id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                          {(friend.remark || friend.friend_nickname || friend.friend_username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {friend.remark || friend.friend_nickname || friend.friend_username}
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
            onClick={handleInvite}
            disabled={inviting || selectedFriends.length === 0 || (!groupId && !selectedGroupId)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {inviting ? t('messages.inviting') : t('messages.inviteCount', { count: selectedFriends.length })}
          </button>
        </div>
      </div>
    </div>
  );
};