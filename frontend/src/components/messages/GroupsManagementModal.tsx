import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, UserPlus, Crown, LogOut, Settings, Trash2, UserCog } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface GroupsManagementModalProps {
  onClose: () => void;
  currentUserId?: string;
  groups: Group[];
  onCreateGroup: () => void;
  onInviteToGroup: (groupId: string) => void;
  onLeaveGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void | Promise<void>;
  onTransferOwner: (groupId: string, newOwnerId: string) => void | Promise<void>;
  onManageGroup: (groupId: string) => void;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
  member_count?: number;
  is_owner?: boolean;
}

export const GroupsManagementModal: React.FC<GroupsManagementModalProps> = ({
  onClose,
  currentUserId,
  groups,
  onCreateGroup,
  onInviteToGroup,
  onLeaveGroup,
  onDeleteGroup,
  onTransferOwner,
  onManageGroup,
}) => {
  const { t } = useTranslation();
  const [transferFor, setTransferFor] = useState<{ groupId: string; groupName: string } | null>(null);
  const [transferMembers, setTransferMembers] = useState<Array<{ id: string; username?: string; nickname?: string; role?: string }>>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    if (!transferFor) return;
    setTransferLoading(true);
    api.get(`/groups/${transferFor.groupId}/members`)
      .then((res) => {
        const list = res.data?.members || [];
        // 接口返回的 id 为用户 id，排除当前用户
        setTransferMembers(list.filter((m: any) => m.id && m.id !== currentUserId));
      })
      .catch(() => setTransferMembers([]))
      .finally(() => setTransferLoading(false));
  }, [transferFor, currentUserId]);

  const handleLeaveGroup = async (g: Group) => {
    if (g.is_owner) {
      toast.error(t('messages.ownerTransferOrDeleteFirst'));
      return;
    }
    if (!confirm(t('messages.leaveGroupConfirmName', { name: g.name }))) return;
    try {
      await api.post(`/groups/${g.id}/leave`);
      toast.success(t('messages.leaveGroupSuccess'));
      onLeaveGroup(g.id);
    } catch (error) {
      console.error('leave group failed:', error);
      toast.error((error as any)?.response?.data?.error || t('messages.leaveGroupFailedErr'));
    }
  };

  const handleDeleteGroup = async (g: Group) => {
    if (!confirm(t('messages.deleteGroupConfirm', { name: g.name }))) return;
    try {
      await onDeleteGroup(g.id);
    } catch (e) {
      // 已由 onDeleteGroup 侧 toasts 处理
    }
  };

  const handleSelectNewOwner = async (groupId: string, newOwnerId: string) => {
    try {
      await onTransferOwner(groupId, newOwnerId);
      setTransferFor(null);
    } catch (e) {
      // 已由 onTransferOwner 侧 toasts 处理
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.groupManagement')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* 新建群组按钮 */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onCreateGroup}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <UserPlus className="w-5 h-5" />
            {t('messages.newBookGroupButton')}
          </button>
        </div>

        {/* 群组列表 */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <Users className="w-8 h-8 opacity-50" />
              </div>
              <p>{t('messages.noGroups')}</p>
              <p className="text-sm mt-2">{t('messages.createFirstGroup')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {groups.map((group) => (
                <div key={group.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100">
                            {group.name}
                          </h3>
                          {group.is_owner && (
                            <Crown className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {t('messages.memberCount', { count: group.member_count || 0 })} · {group.description || t('messages.noDesc')}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {t('messages.createdAt', { date: new Date(group.created_at).toLocaleDateString() })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2 ml-15">
                    <button
                      onClick={() => onInviteToGroup(group.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {t('messages.inviteFriendsButton')}
                    </button>

                    {group.is_owner && (
                      <>
                        <button
                          onClick={() => onManageGroup(group.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-800/30 transition-colors"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          {t('messages.manageMembers')}
                        </button>
                        <button
                          onClick={() => setTransferFor({ groupId: group.id, groupName: group.name })}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-800/30 transition-colors"
                        >
                          <UserCog className="w-3.5 h-3.5" />
                          {t('messages.transferOwner')}
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-800/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('messages.deleteGroup')}
                        </button>
                      </>
                    )}

                    {!group.is_owner && (
                      <button
                        onClick={() => handleLeaveGroup(group)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-800/30 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        退出群组
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 转让群主：选择新群主 */}
        {transferFor && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 min-w-[260px] max-w-[90%] max-h-[50vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">{t('messages.selectNewOwner', { name: transferFor.groupName })}</h4>
                <button onClick={() => setTransferFor(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {transferLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">{t('messages.loadingMembers')}</p>
              ) : transferMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">{t('messages.noTransferableMembers')}</p>
              ) : (
                <ul className="overflow-y-auto space-y-1">
                  {transferMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => handleSelectNewOwner(transferFor.groupId, m.id)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        {m.nickname || m.username}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};