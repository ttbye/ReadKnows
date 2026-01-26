/**
 * 对话重命名弹窗：设置显示名与备注（仅对当前用户可见）
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export interface RenameConversationModalProps {
  onClose: () => void;
  onSaved: () => void;
  conversation: {
    conversation_type: 'friend' | 'group';
    other_user_id?: string;
    group_id?: string;
    group_name?: string;
    other_nickname?: string;
    other_username?: string;
    display_name?: string | null;
    remark?: string | null;
  };
}

export const RenameConversationModal: React.FC<RenameConversationModalProps> = ({
  onClose,
  onSaved,
  conversation,
}) => {
  const { t } = useTranslation();
  const convId = conversation.conversation_type === 'friend' ? conversation.other_user_id : conversation.group_id;
  const originalName = conversation.conversation_type === 'group'
    ? (conversation.group_name || '')
    : (conversation.other_nickname || conversation.other_username || '');

  const [displayName, setDisplayName] = useState(conversation.display_name ?? originalName);
  const [remark, setRemark] = useState(conversation.remark ?? '');
  const [saving, setSaving] = useState(false);
  const label = conversation.conversation_type === 'group' ? t('messages.group') : t('messages.friend');

  useEffect(() => {
    setDisplayName(conversation.display_name ?? originalName);
    setRemark(conversation.remark ?? '');
  }, [conversation.display_name, conversation.remark, originalName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convId) return;
    try {
      setSaving(true);
      await api.post(`/messages/conversation/${conversation.conversation_type}/${convId}/display`, { _method: 'PUT', 
        display_name: displayName.trim() || null,
        remark: remark.trim() || null,
       });
      toast.success('已保存');
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('保存失败:', err);
      const msg = err?.response?.data?.error || err?.response?.data?.message;
      toast.error(msg || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('messages.renameLabel', { label })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              显示名称
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={originalName || `请输入${label}名称`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              留空则使用原名：{originalName || '-'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('messages.remarkLabel')}
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder={t('messages.remarkPlaceholderShort')}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? t('messages.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
