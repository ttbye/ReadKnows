/**
 * 通知面板：群组邀请、好友请求等，点击顶部铃铛时展示
 * 被邀请人可在此接受/拒绝群组邀请，或去处理好友请求
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, UserPlus, Check, XCircle, Mail } from 'lucide-react';
import { formatTimeWithTimezone } from '../../utils/timezone';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  data?: any;
  created_at: string;
  is_read?: number;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onAcceptGroupInvitation: (invitationId: string) => void;
  onDeclineGroupInvitation: (invitationId: string) => void;
  onOpenFriendsManagement: () => void;
  onOpenGroupInvitationsPage: () => void;
  acceptingId?: string | null;
  decliningId?: string | null;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  isOpen,
  onClose,
  notifications,
  onAcceptGroupInvitation,
  onDeclineGroupInvitation,
  onOpenFriendsManagement,
  onOpenGroupInvitationsPage,
  acceptingId = null,
  decliningId = null,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const groupInvitations = notifications.filter((n) => n.type === 'group_invitation');
  const friendRequests = notifications.filter((n) => n.type === 'friend_request');

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-0 bottom-0 z-[61] w-full max-w-sm bg-white dark:bg-gray-800 shadow-xl flex flex-col"
        role="dialog"
        aria-label="通知"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            通知
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('messages.noNewNotifications')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 群组邀请 */}
              {groupInvitations.map((n) => {
                const d = n.data || {};
                const inviterName = d.inviter_nickname || d.inviter_username || t('messages.someone');
                const groupName = d.group_name || t('messages.groupDefaultName');
                const invId = d.id || n.id;
                const isAccepting = acceptingId === invId;
                const isDeclining = decliningId === invId;
                return (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white flex-shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {inviterName} 邀请您加入群组「{groupName}」
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {formatTimeWithTimezone(n.created_at, { showDate: true, showTime: true, relative: false })}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => onAcceptGroupInvitation(invId)}
                            disabled={isAccepting || isDeclining}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            {isAccepting ? t('messages.processing') : t('messages.accept')}
                          </button>
                          <button
                            onClick={() => onDeclineGroupInvitation(invId)}
                            disabled={isAccepting || isDeclining}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-lg disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            {isDeclining ? t('messages.processing') : t('messages.decline')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 好友请求 */}
              {friendRequests.map((n) => {
                const d = n.data || {};
                const fromName = d.user_nickname || d.user_username || t('messages.someone');
                return (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white flex-shrink-0">
                        <UserPlus className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {fromName} 向您发送了好友请求
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {formatTimeWithTimezone(n.created_at, { showDate: true, showTime: true, relative: false })}
                        </div>
                        <button
                          onClick={() => {
                            onOpenFriendsManagement();
                            onClose();
                          }}
                          className="mt-3 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        >
                          {t('messages.goToHandle')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              onOpenGroupInvitationsPage();
              onClose();
            }}
            className="w-full py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            {t('messages.viewAllGroupInvites')}
          </button>
        </div>
      </div>
    </>
  );
};
