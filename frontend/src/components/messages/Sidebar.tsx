import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Users, UserPlus, Settings, Bell, Plus, Search, X, VolumeX, User } from 'lucide-react';
import { formatTimeWithTimezone, formatTimeOnly } from '../../utils/timezone';
import { isE2EEContent } from '../../utils/e2ee';

interface SidebarProps {
  activeTab: string;
  conversations: any[];
  friends: any[];
  groups: any[];
  notificationCount: number;
  searchQuery?: string;
  searchResults?: any[];
  searchingMessages?: boolean;
  /** 移动端时隐藏顶部 tabs，由底部栏切换 */
  hideTabs?: boolean;
  /** 当前选中的会话 id（other_user_id 或 group_id），用于 PC 端高亮 */
  selectedConversation?: string | null;
  /** 当前会话类型，用于 PC 端高亮 */
  conversationType?: 'friend' | 'group' | null;
  /** 当前用户 ID，用于「我」入口及自己对话的样式区分 */
  currentUserId?: string | null;
  onTabChange: (tab: string) => void;
  onConversationClick: (conv: any) => void;
  onConversationContextMenu: (e: React.MouseEvent, conv: any) => void;
  onFriendClick: (friendId: string) => void;
  onGroupClick: (groupId: string) => void;
  onShowNotifications: () => void;
  onShowNotificationSettings: () => void;
  onShowFriendsManagement: () => void;
  onShowGroupsManagement: () => void;
  onAddFriend: () => void;
  onCreateGroup: () => void;
  onSearchChange?: (query: string) => void;
  onSearchResultClick?: (result: any) => void;
}

/**
 * 侧边栏组件
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  conversations,
  friends,
  groups,
  notificationCount,
  searchQuery = '',
  searchResults = [],
  searchingMessages = false,
  hideTabs = false,
  selectedConversation = null,
  conversationType = null,
  currentUserId = null,
  onTabChange,
  onConversationClick,
  onConversationContextMenu,
  onFriendClick,
  onGroupClick,
  onShowNotifications,
  onShowNotificationSettings,
  onShowFriendsManagement,
  onShowGroupsManagement,
  onAddFriend,
  onCreateGroup,
  onSearchChange,
  onSearchResultClick,
}) => {
  const { t } = useTranslation();
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [localFriendSearch, setLocalFriendSearch] = useState('');
  const [localGroupSearch, setLocalGroupSearch] = useState('');

  // 长按相关状态
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

  // 好友列表按关键词过滤（备注、昵称、用户名、邮箱）
  const kwFriend = (localFriendSearch || '').trim().toLowerCase();
  const filteredFriends = !kwFriend
    ? (friends || [])
    : (friends || []).filter((f: any) => {
        const parts = [f.remark, f.friend_nickname, f.friend_username, f.friend_email].filter(Boolean).map((s: any) => String(s).toLowerCase());
        return parts.some((s) => s.includes(kwFriend));
      });

  // 群组列表按关键词过滤（名称、描述）
  const kwGroup = (localGroupSearch || '').trim().toLowerCase();
  const filteredGroups = !kwGroup
    ? (groups || [])
    : (groups || []).filter((g: any) => {
        const parts = [g.name, g.description].filter(Boolean).map((s: any) => String(s).toLowerCase());
        return parts.some((s) => s.includes(kwGroup));
      });

  // 处理搜索输入
  const handleSearchChange = (query: string) => {
    setLocalSearchQuery(query);
    onSearchChange?.(query);
  };

  // 清空搜索
  const clearSearch = () => {
    setLocalSearchQuery('');
    setIsSearching(false);
    onSearchChange?.('');
  };

  // ============ 长按处理函数 ============
  const handleConversationLongPress = (conv: any, x: number, y: number) => {
    console.log('[Sidebar长按菜单] 触发', { x, y, convId: conv.id });

    // 阻止浏览器默认的右键菜单
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      document.removeEventListener('contextmenu', preventContextMenu);
    };
    document.addEventListener('contextmenu', preventContextMenu, { once: true });

    // 创建一个模拟的鼠标事件来触发右键菜单
    const mockEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: x,
      clientY: y,
    } as React.MouseEvent;
    onConversationContextMenu(mockEvent, conv);
  };

  const handleTouchStart = (e: React.TouchEvent, conv: any) => {
    const touch = e.touches[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };

    // 启动长按计时器（500ms）
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartRef.current) {
        // 触发振动反馈（如果支持）
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        handleConversationLongPress(conv, touchStartRef.current!.x, touchStartRef.current!.y);
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 如果移动距离超过10px，取消长按
    if (distance > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
  };

  const getMessagePreview = (content?: string, messageType?: string, fileName?: string) => {
    switch (messageType) {
      case 'image':
        return t('messages.typeImage');
      case 'sticker':
        return t('messages.typeSticker');
      case 'voice':
        return t('messages.typeVoice');
      case 'file':
        return fileName ? `${t('messages.typeFile')} ${fileName}` : t('messages.typeFile');
      case 'book':
        return t('messages.typeBook');
      case 'book_excerpt':
        return t('messages.typeExcerpt');
      case 'reading_progress':
        return t('messages.typeReadingProgress');
      default:
        // 检查是否为E2EE内容，如果是则显示替代文本
        if (messageType === 'text' && content && isE2EEContent(content)) {
          return t('messages.typeEncrypted') || '[加密消息]';
        }
        return content || t('messages.noMessages');
    }
  };

  return (
    <div
      className="relative w-full h-full min-h-0 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
    >
      {/* 头部：移动端 hideTabs 时加 pt-14 避免被 Layout 顶栏遮挡搜索框 */}
      <div className={`flex-shrink-0 p-2 md:p-3 lg:p-4 border-b border-gray-200 dark:border-gray-700 ${hideTabs ? 'pt-14' : ''}`}>
        {/* 标题和操作按钮 */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base md:text-lg lg:text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5 md:gap-2">
            <MessageCircle className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">{t('messages.sidebarTitle')}</span>
          </h2>
          <div className="flex gap-1 md:gap-2">
            {activeTab === 'messages' && (
              <>
                <button
                  onClick={onShowNotifications}
                  className="relative p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  title={t('messages.notificationsTitle')}
                >
                  <Bell className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400" />
                  {notificationCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] md:text-xs font-bold px-1 md:px-1.5 py-0.5 rounded-full">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={onShowNotificationSettings}
                  className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  title={t('messages.notificationSettingsTitle')}
                >
                  <Settings className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </>
            )}
            {activeTab === 'friends' && (
              <>
                <button
                  onClick={onAddFriend}
                  className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  title={t('messages.addFriendTitle')}
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <button
                  onClick={onShowFriendsManagement}
                  className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  title={t('messages.manageTitle')}
                >
                  <Settings className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </>
            )}
            {activeTab === 'groups' && (
              <>
                <button
                  onClick={onCreateGroup}
                  className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  title={t('messages.newGroupTitle')}
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <button
                  onClick={onShowGroupsManagement}
                  className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  title={t('messages.manageTitle')}
                >
                  <Settings className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 搜索框：对话 / 好友 / 群组 统一风格 */}
        {activeTab === 'messages' && (
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('messages.searchConversationsPlaceholder')}
                value={localSearchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setIsSearching(true)}
                className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {localSearchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        )}
        {activeTab === 'friends' && (
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('messages.searchFriendsPlaceholder')}
                value={localFriendSearch}
                onChange={(e) => setLocalFriendSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {localFriendSearch && (
                <button
                  onClick={() => setLocalFriendSearch('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        )}
        {activeTab === 'groups' && (
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('messages.searchGroupsPlaceholder')}
                value={localGroupSearch}
                onChange={(e) => setLocalGroupSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {localGroupSearch && (
                <button
                  onClick={() => setLocalGroupSearch('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 标签页切换 - 移动端由底部栏替代，仅 PC 显示 */}
        {!hideTabs && (
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => onTabChange('messages')}
              className={`flex-1 py-3 px-2 text-center text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'messages'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t('messages.tabConversations')}
            </button>
            <button
              onClick={() => onTabChange('friends')}
              className={`flex-1 py-3 px-2 text-center text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'friends'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t('messages.tabFriends')}
            </button>
            <button
              onClick={() => onTabChange('groups')}
              className={`flex-1 py-3 px-2 text-center text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'groups'
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t('messages.tabGroups')}
            </button>
          </div>
        )}

        {/* 搜索结果 */}
        {activeTab === 'messages' && searchQuery && (
          <div className="mt-2 max-h-60 overflow-y-auto">
            {searchingMessages ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map((result, index) => (
                  <div
                    key={`${result.id}-${index}`}
                    onClick={() => onSearchResultClick?.(result)}
                    className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {(result.from_nickname || result.from_username || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {result.from_nickname || result.from_username}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {result.conversation_type === 'group' ? t('messages.groupChat') : t('messages.privateChat')}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {getMessagePreview(result.content, result.message_type, result.file_name)}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {formatTimeWithTimezone(result.created_at, { showDate: true, showTime: true, relative: false })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : searchQuery ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{t('messages.noSearchResults')}</p>
              </div>
            ) : null}
          </div>
        )}

      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'messages' && (
          <div className="h-full">
            {conversations.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t('messages.noConversationsShort')}</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = (conv.other_user_id || conv.group_id) === selectedConversation && conv.conversation_type === conversationType;
                const isSelf = conv.conversation_type === 'friend' && currentUserId && conv.other_user_id === currentUserId;
                return (
                <div
                  key={conv.id}
                  onClick={() => onConversationClick(conv)}
                  onContextMenu={(e) => onConversationContextMenu(e, conv)}
                  onTouchStart={(e) => handleTouchStart(e, conv)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''} ${isSelf ? 'bg-amber-50/80 dark:bg-amber-900/20 border-l-4 border-l-amber-400' : ''}`}
                  style={{
                    WebkitTouchCallout: 'none', // 屏蔽iOS长按系统菜单
                    WebkitUserSelect: 'none', // 阻止文本选择
                    userSelect: 'none'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      {/* 自己的对话：用户图标；群组：群组图标；好友：对方头像 */}
                      {isSelf ? (
                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                          <User className="w-5 h-5" />
                        </div>
                      ) : conv.conversation_type === 'group' ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white">
                          <Users className="w-5 h-5" />
                        </div>
                      ) : conv.other_avatar ? (
                        <img
                          src={conv.other_avatar}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover bg-gray-200 dark:bg-gray-600"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                          {(conv.other_nickname || conv.other_username || '').charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      {/* 未读数量角标（新消息未点进时在头像右上角显示） */}
                      {(conv.unread_count || 0) > 0 && (
                        <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white dark:border-gray-800">
                          {(conv.unread_count || 0) > 99 ? '99+' : (conv.unread_count || 0)}
                        </div>
                      )}
                      {/* 静音图标 */}
                      {conv.is_muted && (
                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-gray-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
                          <VolumeX className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {conv.conversation_type === 'group' && (
                            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400">
                              {t('messages.groupLabel')}
                            </span>
                          )}
                          <span className={`font-medium truncate min-w-0 ${
                            isSelf
                              ? 'text-amber-700 dark:text-amber-400'
                              : conv.conversation_type === 'group'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {isSelf ? (t('messages.self') || '我') : ((conv.display_name && String(conv.display_name).trim()) || (conv.conversation_type === 'group' ? conv.group_name : (conv.other_nickname || conv.other_username)))}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {(() => {
                            const ts = conv.created_at || conv.last_message_time;
                            return ts ? formatTimeOnly(ts) : '';
                          })()}
                        </div>
                      </div>
                      {/* 最后一条对话内容 */}
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {getMessagePreview(conv.content || conv.last_message, conv.message_type, conv.file_name)}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'friends' && (
          <div className="h-full">
            {filteredFriends.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{kwFriend ? t('messages.noFriendsFilter') : t('messages.noFriendsShort')}</p>
              </div>
            ) : (
              filteredFriends.map((friend) => {
                const isSelf = currentUserId && friend.friend_id === currentUserId;
                return (
                <div
                  key={friend.id || 'self'}
                  onClick={() => onFriendClick(friend.friend_id)}
                  className={`p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${isSelf ? 'bg-amber-50/80 dark:bg-amber-900/20 border-l-4 border-l-amber-400' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {isSelf ? (
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                        <User className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                        {(friend.remark || friend.friend_nickname || friend.friend_username).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${isSelf ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {friend.remark || friend.friend_nickname || friend.friend_username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {friend.friend_email || ''}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="h-full">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <UserPlus className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{kwGroup ? t('messages.noGroupsFilter') : t('messages.noGroupsShort')}</p>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => onGroupClick(group.id)}
                  className="p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-bold">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {group.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {group.description || t('messages.noDesc')}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};