/**
 * 书摘分享弹窗：在阅读页直接选择好友或书友群，将书摘以文字消息发送
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, User, Search } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Friend {
  id?: string;
  friend_id: string;
  friend_username: string;
  friend_nickname?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
}

/** 分享书摘的数据，含用于「打开并定位」的进度字段 */
export interface ShareExcerptData {
  /** 展示用：格式化后的书摘文案 */
  excerpt: string;
  /** 书籍 ID，用于跳转阅读器 */
  book_id: string;
  book_title: string;
  excerpt_text: string;
  chapter_title?: string;
  progress?: number;
  page?: number;
  total_pages?: number;
  chapter_index?: number;
  /** EPUB 的 CFI，有则优先用于精确定位 */
  current_location?: string;
}

interface ShareExcerptModalProps {
  isOpen: boolean;
  onClose: () => void;
  excerptData: ShareExcerptData | null;
}

export default function ShareExcerptModal({
  isOpen,
  onClose,
  excerptData,
}: ShareExcerptModalProps) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'friends' | 'groups'>('friends');
  const [searchQuery, setSearchQuery] = useState('');

  // 打开时拉取好友和群组
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setActiveTab('friends');
    setLoading(true);
    Promise.all([
      api.get('/friends').then((r) => r.data?.friends || []),
      api.get('/groups').then((r) => r.data?.groups || []),
    ])
      .then(([f, g]) => {
        setFriends(Array.isArray(f) ? f : []);
        setGroups(Array.isArray(g) ? g : []);
      })
      .catch((err) => {
        console.error('获取好友/群组失败:', err);
        toast.error(t('reader.shareExcerptFetchFailed') || '获取好友或群组失败');
      })
      .finally(() => setLoading(false));
  }, [isOpen, t]);

  const filteredFriends = friends.filter(
    (f) =>
      (f.friend_username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.friend_nickname || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredGroups = groups.filter(
    (g) =>
      (g.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = async (targetId: string, targetType: 'friend' | 'group') => {
    if (!excerptData?.excerpt || !excerptData?.book_id) return;

    setSending(targetId);
    try {
      const formData = new FormData();
      // 使用 book_excerpt 类型，content 为 JSON，含书摘与进度，便于接收方「打开并定位」
      const payload = {
        book_id: excerptData.book_id,
        book_title: excerptData.book_title,
        excerpt_text: excerptData.excerpt_text,
        chapter_title: excerptData.chapter_title || '未知章节',
        progress: typeof excerptData.progress === 'number' ? excerptData.progress : 0,
        page: excerptData.page ?? 1,
        total_pages: excerptData.total_pages ?? 1,
        chapter_index: excerptData.chapter_index ?? 0,
        current_location: excerptData.current_location || undefined,
      };
      formData.append('content', JSON.stringify(payload));
      formData.append('messageType', 'book_excerpt');
      if (targetType === 'friend') {
        formData.append('toUserId', targetId);
      } else {
        formData.append('groupId', targetId);
      }

      await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success(t('reader.excerptShared') || '书摘已发送');
      onClose();
    } catch (err: any) {
      console.error('发送书摘失败:', err);
      toast.error(err?.response?.data?.error || t('reader.shareExcerptFailed') || '发送失败');
    } finally {
      setSending(null);
    }
  };

  if (!isOpen) return null;
  if (!excerptData?.excerpt || !excerptData?.book_id) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('reader.shareExcerptModalTitle') || '分享书摘'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-hidden flex flex-col min-h-0">
          {/* 书摘预览 */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700/60 rounded-lg mb-4 flex-shrink-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {t('reader.shareExcerptPreview') || '书摘内容'}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100 max-h-16 overflow-y-auto whitespace-pre-wrap">
              {excerptData.excerpt}
            </div>
          </div>

          {/* 搜索 */}
          <div className="relative mb-4 flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('messages.searchPlaceholderShort')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* 好友 / 群组 标签 */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3 flex-shrink-0">
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                activeTab === 'friends'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t('messages.friend')}
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                activeTab === 'groups'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t('messages.group')}
            </button>
          </div>

          {/* 列表 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                {t('messages.loadingFriends') || '加载中...'}
              </div>
            ) : activeTab === 'friends' ? (
              filteredFriends.length > 0 ? (
                <div className="space-y-1">
                  {filteredFriends.map((f) => (
                    <button
                      key={f.friend_id}
                      onClick={() => handleSend(f.friend_id, 'friend')}
                      disabled={!!sending}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {f.friend_nickname || f.friend_username}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          @{f.friend_username}
                        </div>
                      </div>
                      {sending === f.friend_id && (
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-gray-500 dark:text-gray-400">
                  <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>{t('messages.noFriendsShort')}</p>
                </div>
              )
            ) : filteredGroups.length > 0 ? (
              <div className="space-y-1">
                {filteredGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleSend(g.id, 'group')}
                    disabled={!!sending}
                    className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {g.name}
                      </div>
                      {g.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {g.description}
                        </div>
                      )}
                    </div>
                    {sending === g.id && (
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-gray-500 dark:text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>{t('messages.noGroupsShort')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
