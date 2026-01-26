/**
 * @file GroupInvitations.tsx
 * @author ttbye
 * @date 2025-01-01
 * @description 群组邀请通知页面
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Mail, Check, XCircle, Users, Clock, User } from 'lucide-react';

interface GroupInvitation {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  message: string;
  created_at: string;
  responded_at: string | null;
  inviter_username: string;
  inviter_nickname: string;
  inviter_email: string;
  group_name: string;
  group_description: string;
  group_is_public: number;
}

export default function GroupInvitations() {
  const { t } = useTranslation();
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      const response = await api.get('/groups/invitations/received');
      setInvitations(response.data.invitations || []);
    } catch (error: any) {
      console.error('获取邀请列表失败:', error);
      toast.error(t('groups.fetchInvitationsFailed') || '获取邀请列表失败');
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await api.post(`/groups/invitations/${invitationId}/accept`);
      toast.success(t('groups.acceptSuccess') || '已成功加入群组');
      fetchInvitations();
    } catch (error: any) {
      console.error('接受邀请失败:', error);
      toast.error(error.response?.data?.error || t('groups.acceptFailed') || '接受邀请失败');
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    if (!confirm(t('groups.declineConfirm') || '确定要拒绝此邀请吗？')) {
      return;
    }

    try {
      await api.post(`/groups/invitations/${invitationId}/decline`);
      toast.success(t('groups.declineSuccess') || '已拒绝邀请');
      fetchInvitations();
    } catch (error: any) {
      console.error('拒绝邀请失败:', error);
      toast.error(error.response?.data?.error || t('groups.declineFailed') || '拒绝邀请失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Mail className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {t('groups.invitations') || '群组邀请'}
        </h1>
      </div>

      {invitations.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Mail className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">{t('groups.noInvitations') || '暂无待处理的邀请'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                      {(invitation.inviter_nickname || invitation.inviter_username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {invitation.inviter_nickname || invitation.inviter_username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {invitation.inviter_email}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {invitation.group_name}
                      </span>
                    </div>
                    {invitation.group_description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 ml-6">
                        {invitation.group_description}
                      </p>
                    )}
                  </div>

                  {invitation.message && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {invitation.message}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(invitation.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleAcceptInvitation(invitation.id)}
                    className="btn btn-sm btn-primary flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    {t('groups.accept') || '接受'}
                  </button>
                  <button
                    onClick={() => handleDeclineInvitation(invitation.id)}
                    className="btn btn-sm btn-secondary flex items-center gap-1"
                  >
                    <XCircle className="w-4 h-4" />
                    {t('groups.decline') || '拒绝'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

