/**
 * @file IPManagement.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Shield, Unlock, Lock, Search, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';

interface BlockedIP {
  id: string;
  ip_address: string;
  reason: string;
  blocked_at: string;
  unblock_at: string | null;
  attempts: number;
  last_attempt: string | null;
}

interface AccessAttempt {
  id: string;
  ip_address: string;
  attempt_type: 'private_key' | 'login';
  success: number;
  created_at: string;
}

export default function IPManagement() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [attempts, setAttempts] = useState<AccessAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [searchIP, setSearchIP] = useState('');
  const [selectedIP, setSelectedIP] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchBlockedIPs();
    }
  }, [user]);

  const fetchBlockedIPs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/ip/blocked');
      setBlockedIPs(response.data.blockedIPs || []);
    } catch (error: any) {
      console.error('获取禁用IP列表失败:', error);
      toast.error(error.response?.data?.error || t('ipManagement.fetchBlockedIPsFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchAttempts = async (ip?: string) => {
    try {
      setLoadingAttempts(true);
      const response = await api.get('/ip/attempts', {
        params: ip ? { ip, limit: 50 } : { limit: 100 },
      });
      setAttempts(response.data.attempts || []);
    } catch (error: any) {
      console.error('获取访问尝试记录失败:', error);
      toast.error(error.response?.data?.error || t('ipManagement.fetchAccessRecordsFailed'));
    } finally {
      setLoadingAttempts(false);
    }
  };

  const handleUnblock = async (id: string, ip: string) => {
    if (!window.confirm(t('ipManagement.confirmUnblock', { ip }))) {
      return;
    }

    try {
      await api.post(`/ip/unblock/${id}`);
      toast.success(t('ipManagement.ipUnblocked'));
      fetchBlockedIPs();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('ipManagement.unblockFailed'));
    }
  };

  const handleBlock = async (ip: string, reason: string) => {
    if (!ip.trim()) {
      toast.error(t('ipManagement.pleaseEnterIP'));
      return;
    }

    if (!window.confirm(t('ipManagement.confirmBlock', { ip }))) {
      return;
    }

    try {
      await api.post('/ip/block', { ipAddress: ip, reason });
      toast.success(t('ipManagement.ipBlocked'));
      fetchBlockedIPs();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('ipManagement.blockFailed'));
    }
  };

  const handleViewAttempts = (ip: string) => {
    setSelectedIP(ip);
    fetchAttempts(ip);
  };

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">{t('ipManagement.noPermission')}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('ipManagement.needAdminPermission')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-end mb-6">
        <button
          onClick={fetchBlockedIPs}
          className="btn btn-secondary"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('ipManagement.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 被禁用的IP列表 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Lock className="w-5 h-5 text-red-600" />
              {t('ipManagement.blockedIPs')}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('ipManagement.totalBlocked', { count: blockedIPs.length })}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : blockedIPs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {t('ipManagement.noBlockedIPs')}
            </div>
          ) : (
            <div className="space-y-3">
              {blockedIPs.map((blocked) => (
                <div
                  key={blocked.id}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {blocked.ip_address}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {t('ipManagement.blockedTime')}: {new Date(blocked.blocked_at).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}
                      </div>
                      {blocked.reason && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {t('ipManagement.reason')}: {blocked.reason}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {t('ipManagement.failedAttempts')}: {blocked.attempts}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewAttempts(blocked.ip_address)}
                        className="btn btn-sm btn-secondary"
                        title={t('ipManagement.viewAccessRecords')}
                      >
                        <Search className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUnblock(blocked.id, blocked.ip_address)}
                        className="btn btn-sm btn-primary"
                        title={t('ipManagement.unblockIP')}
                      >
                        <Unlock className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 手动禁用IP */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">{t('ipManagement.manualBlockIP')}</h3>
            <div className="space-y-2">
              <input
                type="text"
                className="input"
                placeholder={t('ipManagement.enterIPAddress')}
                value={searchIP}
                onChange={(e) => setSearchIP(e.target.value)}
              />
              <button
                onClick={() => {
                  if (searchIP.trim()) {
                    handleBlock(searchIP.trim(), t('ipManagement.adminManualBlock'));
                    setSearchIP('');
                  }
                }}
                className="btn btn-danger w-full"
              >
                <Lock className="w-4 h-4" />
                {t('ipManagement.blockThisIP')}
              </button>
            </div>
          </div>
        </div>

        {/* 访问尝试记录 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Search className="w-5 h-5 text-blue-600" />
              {t('ipManagement.accessAttempts')}
            </h2>
            <button
              onClick={() => {
                setSelectedIP(null);
                fetchAttempts();
              }}
              className="btn btn-sm btn-secondary"
            >
              {t('ipManagement.viewAll')}
            </button>
          </div>

          {selectedIP && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{t('ipManagement.viewingIP')}:</span>
                <span className="font-mono ml-2 text-gray-900 dark:text-gray-100">{selectedIP}</span>
                <button
                  onClick={() => {
                    setSelectedIP(null);
                    fetchAttempts();
                  }}
                  className="ml-2 text-blue-600 hover:text-blue-700"
                >
                  {t('ipManagement.clearFilter')}
                </button>
              </div>
            </div>
          )}

          {loadingAttempts ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : attempts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('ipManagement.noAccessAttempts')}
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {attempt.ip_address}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(attempt.created_at).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}
                      </div>
                      <div className="text-xs mt-1 text-gray-900 dark:text-gray-100">
                        {t('ipManagement.type')}:{' '}
                        <span className="font-semibold">
                          {attempt.attempt_type === 'private_key'
                            ? t('ipManagement.privateKeyVerification')
                            : t('ipManagement.userLogin')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.success ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span
                        className={`text-xs font-semibold ${
                          attempt.success
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {attempt.success ? t('ipManagement.success') : t('ipManagement.failed')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

