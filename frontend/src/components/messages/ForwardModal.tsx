import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, User, Search } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  message_type: string;
  from_user_id: string;
  from_username?: string;
  from_nickname?: string;
  created_at: string;
  file_path?: string;
  file_name?: string;
}

interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_nickname: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
}

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message | null;
  friends: Friend[];
  groups: Group[];
  onForward: (message: Message, targetId: string, targetType: 'friend' | 'group') => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  message,
  friends,
  groups,
  onForward,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'friends' | 'groups'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [forwarding, setForwarding] = useState<string | null>(null);

  if (!isOpen || !message) return null;

  const filteredFriends = friends.filter(friend =>
    friend.friend_username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.friend_nickname?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleForward = async (targetId: string, targetType: 'friend' | 'group') => {
    if (!message) return;

    setForwarding(targetId);
    try {
      await onForward(message, targetId, targetType);
      onClose();
    } catch (error) {
      // 错误已在onForward中处理
    } finally {
      setForwarding(null);
    }
  };

  const renderMessagePreview = () => {
    if (!message) return null;

    return (
      <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('messages.forwardPreview')}</div>
        <div className="text-sm text-gray-900 dark:text-gray-100 max-h-20 overflow-hidden">
          {message.message_type === 'image' && t('messages.typeImage')}
          {message.message_type === 'sticker' && t('messages.typeSticker')}
          {message.message_type === 'voice' && t('messages.typeVoice')}
          {message.message_type === 'file' && `[${t('messages.typeLabelFile')}] ${message.file_name}`}
          {(!message.message_type || message.message_type === 'text') && message.content}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.forwardMessage')}</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 消息预览 */}
        <div className="p-4">
          {renderMessagePreview()}

          {/* 搜索框 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('messages.searchPlaceholderShort')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* 标签页 */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
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

          {/* 转发目标列表 */}
          <div className="max-h-60 overflow-y-auto">
            {activeTab === 'friends' ? (
              filteredFriends.length > 0 ? (
                <div className="space-y-1">
                  {filteredFriends.map((friend) => (
                    <button
                      key={friend.friend_id}
                      onClick={() => handleForward(friend.friend_id, 'friend')}
                      disabled={forwarding === friend.friend_id}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {friend.friend_nickname || friend.friend_username}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          @{friend.friend_username}
                        </div>
                      </div>
                      {forwarding === friend.friend_id && (
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('messages.noFriendsShort')}</p>
                </div>
              )
            ) : (
              filteredGroups.length > 0 ? (
                <div className="space-y-1">
                  {filteredGroups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => handleForward(group.id, 'group')}
                      disabled={forwarding === group.id}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {group.name}
                        </div>
                        {group.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {group.description}
                          </div>
                        )}
                      </div>
                      {forwarding === group.id && (
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('messages.noGroupsShort')}</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};