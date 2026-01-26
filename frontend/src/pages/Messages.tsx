/**
 * @file Messages.tsx
 * @author ttbye
 * @date 2025-01-01
 * @description 消息页面 - 参考微信/QQ设计，支持好友聊天、群组消息、系统通知
 * 重构版本：按功能模块拆分为独立组件，提高代码可读性和维护性
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api, { getFullApiUrl, getMessageFileApiPath } from '../utils/api';
import { encrypt, decrypt, decryptAsSender, isE2EEContent, hasLocalPrivateKey } from '../utils/e2ee';
import { createRegisteredAudio, pauseAllRegisteredAudiosExcept, unregisterAudio } from '../utils/audioRegistry';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageCircle, Send, User, Check, CheckCheck, Users, Bell,
  Paperclip, BookOpen, X, FileText, Image as ImageIcon, Download,
  Search, MoreVertical, UserPlus, UserCheck, Smile, Mic, ChevronLeft, Settings, Volume2, VolumeX,
  RotateCcw, Reply, XCircle, MessageSquare, Copy, Forward, Trash2, UserMinus, Mail, Edit2,
  Clock, Filter, UserX, Plus, Crown, Globe, Lock, Ban, ShieldCheck
} from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';
import { useAuthStore } from '../store/authStore';
import { notificationService } from '../utils/notificationService';
import { formatTimeWithTimezone, syncTimezoneFromBackendGlobal } from '../utils/timezone';
import { useMobileKeyboard } from '../hooks/useMobileKeyboard';

// UI组件
import {
  StatusBarPlaceholder,
  BottomNavigation,
  Sidebar,
  ChatArea,
  AddFriendModal,
  CreateGroupModal,
  FriendsManagementModal,
  GroupsManagementModal,
  NotificationSettingsModal,
  InviteToGroupModal,
  ForwardModal,
  RenameConversationModal,
  NotificationsPanel,
  AddToLibraryModal
} from '../components/messages';
import type { AddToLibraryMessage, AddToLibraryOptions } from '../components/messages';
import type { NotificationItem } from '../components/messages';
import type { StickerItem } from '../components/messages/StickerPicker';

interface Conversation {
  id: string;
  other_user_id?: string;
  group_id?: string;
  group_name?: string;
  other_username?: string;
  other_nickname?: string;
  other_email?: string;
  content: string;
  created_at: string;
  is_read: number;
  unread_count: number;
  conversation_type: 'friend' | 'group';
  message_type: string;
  is_muted?: boolean; // 静音状态
  is_blocked?: boolean; // 黑名单状态
  display_name?: string | null; // 用户自定义显示名（重命名）
  remark?: string | null; // 备注，仅自己可见
}


interface Message {
  id: string;
  from_user_id: string;
  to_user_id?: string;
  group_id?: string;
  message_type: string;
  content: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  created_at: string;
  from_username?: string;
  from_nickname?: string;
  duration?: number;
  reply_to_message_id?: string;
  reply_content?: string;
  reply_from_nickname?: string;
  reply_from_username?: string;
  reply_message_type?: string;
  is_recalled?: boolean;
  is_deleted?: boolean;
  local_audio_blob?: Blob;
  playing?: boolean;
}

interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_nickname: string;
  friend_email: string;
  status: string;
  created_at: string;
  remark?: string;
  group_name_display?: string;
}

interface FriendRequest {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
  message?: string;
  user_username?: string;
  user_nickname?: string;
  user_email?: string;
  friend_username?: string;
  friend_nickname?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  creator_id: string;
  owner_id?: string;
  created_at: string;
  is_member?: boolean;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  data?: any;
  created_at: string;
  is_read: number;
}

interface User {
  id: string;
  username: string;
  nickname?: string;
  email: string;
  role: string;
  avatar?: string;
  max_private_books?: number;
}

const Messages: React.FC = () => {
  // ============ 基础状态 ============
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuthStore();

  // ============ Refs ============
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 键盘处理
  const { keyboardState, scrollToInput, isMobile: isMobileKeyboard } = useMobileKeyboard();

  // ============ 页面状态 ============
  const [activeTab, setActiveTab] = useState<'messages' | 'friends' | 'groups'>('messages');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationType, setConversationType] = useState<'friend' | 'group' | null>(null);

  // ============ 消息输入状态 ============
  const [messageContent, setMessageContent] = useState('');
  const [showVoiceButton, setShowVoiceButton] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPressingVoice, setIsPressingVoice] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    file?: File | Blob;
    preview?: string;
    id: string;
    fileName?: string;
    excerptData?: {
      book_id: string;
      book_title: string;
      excerpt_text: string;
      chapter_title?: string;
      progress?: number;
      page?: number;
    };
    uploadStatus?: 'pending' | 'uploading' | 'done' | 'error';
    progress?: number;
    file_path?: string;
    file_name?: string;
    file_size?: number;
    file_type?: string | null;
    error?: string;
  }>>([]);

  // ============ 数据状态 ============
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // ============ UI状态 ============
  const [showSidebar, setShowSidebar] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showFriendsManagement, setShowFriendsManagement] = useState(false);
  const [showFriendsManagementModal, setShowFriendsManagementModal] = useState(false);
  const [showGroupsManagement, setShowGroupsManagement] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showInviteToGroup, setShowInviteToGroup] = useState<{groupId: string, groupName?: string} | null>(null);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);
  const [decliningInvitationId, setDecliningInvitationId] = useState<string | null>(null);
  const [showFriendRequestModal, setShowFriendRequestModal] = useState(false);
  const [showSearchFriendModal, setShowSearchFriendModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);

  // ============ 语音录制状态 ============
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [, setVoicePlaybackTime] = useState<number>(0);

  // ============ 右键菜单状态 ============
  const [contextMenu, setContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<{
    conversation: Conversation;
    x: number;
    y: number;
  } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState<Conversation | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showAddToLibraryModal, setShowAddToLibraryModal] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // ============ 消息输入状态 ============


  // ============ 搜索和过滤状态 ============
  const [searchKeyword, setSearchKeyword] = useState('');
  const [conversationSearchKeyword, setConversationSearchKeyword] = useState('');
  const [friendSearchKeyword, setFriendSearchKeyword] = useState('');
  const [groupSearchKeyword, setGroupSearchKeyword] = useState('');
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<any[]>([]);
  const [friendSearchResults, setFriendSearchResults] = useState<User[]>([]);
  const [publicGroups, setPublicGroups] = useState<Group[]>([]);
  const [searchUserResults, setSearchUserResults] = useState<User[]>([]);

  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchingFriends, setSearchingFriends] = useState(false);
  const [searchingMessages, setSearchingMessages] = useState(false);

  // ============ 好友管理状态 ============
  const [friendsManagementTab, setFriendsManagementTab] = useState<'friends' | 'requests'>('friends');
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friendGroups, setFriendGroups] = useState<Array<{id: string, name: string, count: number}>>([]);
  const [selectedFriendGroup, setSelectedFriendGroup] = useState<string>('all');
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [editRemark, setEditRemark] = useState('');
  const [selectedUserForRequest, setSelectedUserForRequest] = useState<User | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [pendingFriendRequest, setPendingFriendRequest] = useState<FriendRequest | null>(null);
  const [inviteGroupMessage, setInviteGroupMessage] = useState('');
  const [selectedGroupForManagement, setSelectedGroupForManagement] = useState<Group | null>(null);
  const [selectedUserForInvite, setSelectedUserForInvite] = useState<User | null>(null);

  // ============ @提醒相关状态 ============
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  // ============ 群组管理状态 ============
  const [groupsForManagement, setGroupsForManagement] = useState<Group[]>([]);
  const [selectedGroupForEdit, setSelectedGroupForEdit] = useState<Group | null>(null);
  const [createGroupForm, setCreateGroupForm] = useState({ name: '', description: '' });
  const [editGroupForm, setEditGroupForm] = useState({ name: '', description: '' });
  const [invitableFriends, setInvitableFriends] = useState<Friend[]>([]);

  // ============ 通知设置状态 ============
  const [notificationEnabled, setNotificationEnabled] = useState(() => {
    return localStorage.getItem('notificationEnabled') === 'true';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('soundEnabled') !== 'false';
  });
  const [disableNotificationsWhenTTSPlaying, setDisableNotificationsWhenTTSPlaying] = useState(() => {
    const stored = localStorage.getItem('disableNotificationsWhenTTSPlaying');
    return stored === null ? true : stored === 'true';
  });


  // ============ 转发功能状态 ============
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardTargetUserId, setForwardTargetUserId] = useState<string>('');
  const [forwardTargetType, setForwardTargetType] = useState<'friend' | 'group'>('friend');

  // ============ 添加到图书馆模态框 ============
  const [addToLibraryMessage, setAddToLibraryMessage] = useState<Message | null>(null);

  // ============ 文件上传状态 ============
  const [fileToAdd, setFileToAdd] = useState<Message | null>(null);

  // ============ 计数状态 ============
  const [notificationCount, setNotificationCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [scopeCounts, setScopeCounts] = useState<{[key: string]: number}>({
    all: 0,
    public: 0,
    private: 0,
    shared: 0,
    group: 0
  });

  // ============ 加载状态 ============
  const [loading, setLoading] = useState(true);
  const [fetchingConversations, setFetchingConversations] = useState(false);
  const [fetchingMessages, setFetchingMessages] = useState<{[key: string]: boolean}>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState<{[key: string]: boolean}>({});

  // ============ 时区同步 ============
  const [tzSynced, setTzSynced] = useState(0);

  // ============ E2EE 状态 ============
  const [showE2EERecoveryPrompt, setShowE2EERecoveryPrompt] = useState(false);

  // ============ Refs ============
  const lastFetchTimeRef = useRef<{
    conversations: number;
    messages: {[key: string]: number};
  }>({
    conversations: 0,
    messages: {}
  });

  const retryDelayRef = useRef<{
    conversations: number;
    messages: {[key: string]: number};
  }>({
    conversations: 0,
    messages: {}
  });
  const recordingStartTimeRef = useRef<number>(0);
  const recordingCancelRef = useRef<boolean>(false);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const currentVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef<string>('');
  const isPageVisibleRef = useRef<boolean>(true);
  const isRefreshingAfterSendRef = useRef<boolean>(false); // 发送消息后正在刷新的标志


  // ============ 业务逻辑函数 ============

  // 获取顶部安全区域高度
  const getTopSafeAreaInset = (): string => {
    if (typeof window === 'undefined') return '0px';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') || '0px';
  };

  // 获取底部安全区域高度
  const getBottomSafeAreaInset = (): string => {
    if (typeof window === 'undefined') return '0px';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0px';
  };


  // 获取右侧安全区域
  const getRightSafeAreaInset = (): string => {
    if (typeof window === 'undefined') return '0px';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-right') || '0px';
  };

  // ============ 时区同步 ============
  useEffect(() => {
    const sync = async () => {
      try {
        await syncTimezoneFromBackendGlobal();
        setTzSynced((n) => n + 1);
      } catch (error) {
        console.error('[时区调试] Messages时区同步失败:', error);
      }
    };
    sync();
  }, []);

  // ============ E2EE 处理函数 ============
  const checkAndPromptE2EERecovery = async () => {
    // 检查是否启用了E2EE但没有本地私钥
    try {
      const userRes = await api.get('/users/me');
      const userData = userRes.data.user;
      const e2eeEnabled = !!(userData as any).e2ee_public_key;
      const hasLocalKey = await hasLocalPrivateKey();

      if (e2eeEnabled && !hasLocalKey && !showE2EERecoveryPrompt) {
        setShowE2EERecoveryPrompt(true);
      }
    } catch (error) {
      console.error('[E2EE] 检查恢复状态失败:', error);
    }
  };

  // ============ 事件处理函数 ============

  // 标签页切换
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as 'messages' | 'friends' | 'groups');
  };

  // 会话点击
  const handleConversationClick = (conv: Conversation) => {
    const conversationId = conv.other_user_id || conv.group_id;
    const type = conv.conversation_type;

    if (conversationId && type) {
      if (isMobile) {
        // 移动端跳转到独立页面
        navigate(`/chat/${type}/${conversationId}`);
      } else {
        // PC端在右侧显示聊天
        setSelectedConversation(conversationId);
        setConversationType(type);
      }
    }
  };

  // 好友点击 - 导航到独立聊天页面
  const handleFriendClick = (friendId: string) => {
    navigate(`/chat/friend/${friendId}`);
  };

  // 群组点击 - 导航到独立聊天页面
  const handleGroupClick = (groupId: string) => {
    navigate(`/chat/group/${groupId}`);
  };


  // ============ API调用函数 ============

  // 获取群组成员
  const fetchGroupMembers = async (groupId: string) => {
    try {
      const response = await api.get(`/groups/${groupId}/members`);
      setGroupMembers(response.data.members || []);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        // 兼容后端尚未更新的情况，降级为空列表
        setGroupMembers([]);
        return;
      }
      console.error('获取群组成员失败:', error);
      setGroupMembers([]);
    }
  };

  // 获取会话列表
  const fetchConversations = async (force = false) => {
    if (fetchingConversations && !force) return;

    try {
      setFetchingConversations(true);
      let response;
      try {
        response = await api.get('/messages/conversations');
      } catch (error: any) {
        // 如果是429错误，重试一次
        if (error.response?.status === 429) {
          console.warn('[fetchConversations] 429错误，等待1秒后重试');
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get('/messages/conversations');
        } else {
          throw error;
        }
      }
      setConversations(response.data.conversations || []);
    } catch (error) {
      console.error('获取会话列表失败:', error);
      toast.error(t('messages.fetchConversationsFailed') || '获取会话列表失败');
    } finally {
      setFetchingConversations(false);
    }
  };


  // 获取好友列表
  const fetchFriends = async () => {
    try {
      const response = await api.get('/friends');
      setFriends(response.data.friends || []);
    } catch (error) {
      console.error('获取好友列表失败:', error);
    }
  };

  // 获取好友请求列表
  const fetchFriendRequests = async () => {
    try {
      const [receivedResponse, sentResponse] = await Promise.all([
        api.get('/friends/requests/received'),
        api.get('/friends/requests/sent')
      ]);
      setReceivedRequests(receivedResponse.data?.requests || []);
      setSentRequests(sentResponse.data?.requests || []);
    } catch (error) {
      console.error('获取好友请求失败:', error);
    }
  };

  // 搜索消息
  const searchMessages = async (query: string) => {
    if (!query.trim()) {
      setMessageSearchResults([]);
      return;
    }

    try {
      setSearchingMessages(true);
      const response = await api.get(`/messages/search?q=${encodeURIComponent(query.trim())}`);
      setMessageSearchResults(response.data.results || []);
    } catch (error) {
      console.error('搜索消息失败:', error);
      toast.error('搜索失败');
      setMessageSearchResults([]);
    } finally {
      setSearchingMessages(false);
    }
  };

  // 处理搜索输入变化
  const handleSearchChange = (query: string) => {
    setSearchKeyword(query);
    if (query.trim()) {
      searchMessages(query);
    } else {
      setMessageSearchResults([]);
    }
  };

  // 处理搜索结果点击
  const handleSearchResultClick = (result: any) => {
    // 根据搜索结果类型跳转到对应的对话
    if (result.conversation_type === 'friend') {
      navigate(`/chat/friend/${result.other_user_id || result.group_id}`);
    } else if (result.conversation_type === 'group') {
      navigate(`/chat/group/${result.group_id}`);
    }
    // 清空搜索
    setSearchKeyword('');
    setMessageSearchResults([]);
  };

  // ============ 工具函数 ============
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 转发消息
  const forwardMessage = async (message: Message, targetUserId: string, targetType: 'friend' | 'group') => {
    try {
      const formData = new FormData();

      // 根据目标类型设置接收者
      if (targetType === 'friend') {
        formData.append('toUserId', targetUserId);
      } else {
        formData.append('groupId', targetUserId);
      }

      // 复制原始消息的内容和类型
      formData.append('content', message.content);
      formData.append('messageType', message.message_type || 'text');

      // 如果是文件消息，经认证 API 获取后复制
      const fileApiPath = getMessageFileApiPath(message.file_path);
      if (fileApiPath && message.file_name) {
        try {
          const res = await api.get(fileApiPath, { responseType: 'blob' });
          const blob = res.data as Blob;
          const file = new File([blob], message.file_name, { type: blob.type });
          formData.append('file', file);
        } catch (error) {
          console.warn('复制文件失败，使用文本转发:', error);
          const fallbackLabel = message.message_type === 'image'
            ? '图片'
            : message.message_type === 'sticker'
            ? '表情'
            : message.message_type === 'voice'
            ? '语音'
            : '文件';
          formData.append('content', `[${fallbackLabel}] ${message.file_name}`);
          formData.set('messageType', 'text');
        }
      }

      // 如果是回复消息，保持回复关系
      if (message.reply_to_message_id) {
        formData.append('replyToMessageId', message.reply_to_message_id);
      }

      await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('消息已转发');
    } catch (error) {
      console.error('转发消息失败:', error);
      toast.error('转发失败');
    }
  };

  // 获取安全区域偏移
  const getLeftSafeAreaInset = (): string => {
    if (typeof window === 'undefined') return '8px';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-left') || '8px';
  };


  // 检查是否为书籍文件
  const isBookFile = (message: Message): boolean => {
    if (!message.file_type || !message.file_name) return false;
    const extension = message.file_name.toLowerCase().split('.').pop();
    return ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'fb2', 'djvu', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension || '');
  };

  // 检查消息是否可以撤回（5分钟内）
  const canRecallMessage = (message: Message): boolean => {
    if (message.is_recalled || message.is_deleted) return false;
    const now = new Date().getTime();
    const messageTime = new Date(message.created_at).getTime();
    const diffMinutes = (now - messageTime) / (1000 * 60);
    return diffMinutes <= 5;
  };

  // 是否有可下载的附件（file_path 经认证 API 可获取）
  const hasDownloadableAttachment = (message: Message): boolean => !!getMessageFileApiPath(message.file_path);

  const downloadAttachment = async (message: Message) => {
    const fileApiPath = getMessageFileApiPath(message.file_path);
    if (!fileApiPath) return;
    try {
      const res = await api.get(fileApiPath, { responseType: 'blob' });
      const blob = res.data as Blob;
      const name = message.file_path?.split('/').pop();
      const filename = message.file_name || name || (message.message_type === 'image' ? 'image.png' : message.message_type === 'sticker' ? 'sticker.png' : message.message_type === 'voice' ? 'voice.ogg' : 'file');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setContextMenu(null);
      toast.success(t('messages.attachmentDownloaded') || '已下载');
    } catch (e) {
      console.error('下载附件失败:', e);
      toast.error(t('messages.fileDownloadFailed') || '下载失败');
    }
  };

  // ============ 消息操作函数 ============
  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success('已复制到剪贴板');
      setContextMenu(null);
    } catch (error) {
      toast.error('复制失败');
    }
  };

  const recallMessage = async (messageId: string, message?: Message) => {
    try {
      await api.post(`/messages/${messageId}/recall`, { _method: 'PUT' });
      setContextMenu(null);
      if (message) {
        setMessageContent(message.content || '');
        setReplyingTo(null);
      }
      toast.success('消息已撤回');
      if (selectedConversation && conversationType) {
        fetchMessages(selectedConversation, conversationType, false, true);
      }
    } catch (error) {
      console.error('撤回消息失败:', error);
      toast.error('撤回失败');
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!confirm(t('messages.deleteMessageConfirm') || '确定删除此消息？')) return;
    try {
      await api.post(`/messages/${messageId}`, { _method: 'DELETE' });
      setContextMenu(null);
      toast.success('消息已删除');
      if (selectedConversation && conversationType) {
        fetchMessages(selectedConversation, conversationType, false, true);
      }
    } catch (error) {
      console.error('删除消息失败:', error);
      toast.error('删除失败');
    }
  };

  const handleAddToLibraryConfirm = async (message: AddToLibraryMessage, opts: AddToLibraryOptions) => {
    const fileApiPath = getMessageFileApiPath(message.file_path);
    if (!fileApiPath || !message.file_name) return;

    try {
      const res = await api.get(fileApiPath, { responseType: 'blob' });
      const blob = res.data as Blob;

      const formData = new FormData();
      formData.append('file', blob, message.file_name);
      formData.append('isPublic', opts.isPublic ? 'true' : 'false');
      formData.append('category', opts.category || t('book.uncategorized'));

      await api.post('/books/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(opts.isPublic ? t('messages.addToLibrarySuccess') : t('messages.addToPrivateLibrarySuccess'));
      setAddToLibraryMessage(null);
    } catch (error) {
      console.error('添加到图书馆失败:', error);
      toast.error(t('messages.addToLibraryFailed'));
    }
  };

  // 获取群组列表
  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('获取群组列表失败:', error);
    }
  };

  // 获取消息列表
  const fetchMessages = async (conversationId: string, type: 'friend' | 'group', force = false, checkNewOnly = false) => {
    try {
      // 如果checkNewOnly为true但没有lastMessageTimeRef，则回退到完整刷新
      if (checkNewOnly && !lastMessageTimeRef.current) {
        checkNewOnly = false;
        force = true;
      }

      // 使用正确的端点
      const endpoint = type === 'friend' 
        ? `/messages/conversation/${conversationId}` 
        : `/messages/group/${conversationId}`;
      
      // 如果只检查新消息，添加 since 参数
      const params: any = {};
      if (checkNewOnly && lastMessageTimeRef.current) {
        params.since = lastMessageTimeRef.current;
      }
      
      let response;
      try {
        response = await api.get(endpoint, { params });
      } catch (error: any) {
        // 如果是429错误（请求过于频繁），等待1秒后重试一次
        if (error.response?.status === 429) {
          console.warn('[Messages fetchMessages] 429错误，等待1秒后重试:', endpoint);
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get(endpoint, { params });
        } else {
          throw error;
        }
      }
      const newMessages = response.data.messages || [];

      // 异步处理E2EE解密，不阻塞消息显示
      setTimeout(async () => {
        const messagesToUpdate: { id: string; content: string }[] = [];

        for (const m of newMessages) {
          if (m.message_type === 'text' && isE2EEContent(m.content)) {
            let decryptedContent = m.content;
            if (m.from_user_id === user?.id) {
              // 本人发送的：用收件人公钥+己方私钥解密，发送端本地可显示原文
              const recipientId = type === 'friend' ? conversationId : null;
              const decrypted = recipientId ? await decryptAsSender(m.content, recipientId) : null;
              if (!decrypted) {
                decryptedContent = '[E2EE消息 - 请检查本地密钥]';
                // 触发密钥检查和恢复提示
                setTimeout(() => checkAndPromptE2EERecovery(), 100);
              } else {
                decryptedContent = decrypted;
              }
            } else {
              const decrypted = await decrypt(m.content, m.from_user_id);
              if (!decrypted) {
                decryptedContent = '[E2EE消息 - 需要恢复密钥]';
                // 触发密钥检查和恢复提示
                setTimeout(() => checkAndPromptE2EERecovery(), 100);
              } else {
                decryptedContent = decrypted;
              }
            }

            // 总是更新E2EE消息，即使内容已经是占位符
            messagesToUpdate.push({ id: m.id, content: decryptedContent });
          }
        }

        // 批量更新解密后的消息内容
        if (messagesToUpdate.length > 0) {
          setMessages(prev => prev.map(msg =>
            messagesToUpdate.find(update => update.id === msg.id)
              ? { ...msg, content: messagesToUpdate.find(update => update.id === msg.id)!.content }
              : msg
          ));
        }
      }, 0);
      if (checkNewOnly) {
        // 只检查新消息模式
        // console.log('[Messages轮询] 检查新消息结果:', {
        //   checkNewOnly,
        //   newMessagesCount: newMessages.length,
        //   lastMessageTime: lastMessageTimeRef.current
        // });

        if (newMessages.length > 0) {
          // 立即添加新消息到列表（先显示占位符或原始内容），然后再异步解密
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            // 先处理E2EE消息，显示占位符
            const processedNewMessages = newMessages.map((m: Message) => {
              if (m.message_type === 'text' && isE2EEContent(m.content)) {
                // E2EE消息先显示占位符
                return {
                  ...m,
                  content: '[E2EE消息 - 解密中...]'
                };
              }
              return m;
            });
            
            const trulyNew = processedNewMessages.filter((m: Message) => !existingIds.has(m.id));

            if (import.meta.env.DEV) {
              console.log('[Messages轮询] 检查新消息:', {
                newMessagesCount: newMessages.length,
                existingIdsCount: existingIds.size,
                trulyNewCount: trulyNew.length,
                newMessageIds: newMessages.map(m => m.id),
                existingIds: Array.from(existingIds).slice(0, 5), // 只显示前5个
                trulyNewIds: trulyNew.map(m => m.id)
              });
            }

            if (trulyNew.length > 0) {

              // 更新最后一条消息的时间
              const latestMessage = [...trulyNew].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0];
              lastMessageTimeRef.current = latestMessage.created_at;
              
              // 立即添加到消息列表
              const updatedMessages = [...prev, ...trulyNew].sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              
              // 异步解密E2EE消息并更新
              (async () => {
                const messagesToUpdate: { id: string; content: string }[] = [];
                
                for (const m of trulyNew) {
                  if (m.message_type === 'text' && isE2EEContent(m.content)) {
                    let decryptedContent = '[E2EE消息 - 解密中...]';
                    const hasLocalKey = await hasLocalPrivateKey();

                    if (m.from_user_id === user?.id) {
                      // 本人发送的：用收件人公钥+己方私钥解密
                      const recipientId = conversationType === 'friend' ? selectedConversation : null;
                      const decrypted = recipientId && hasLocalKey ? await decryptAsSender(m.content, recipientId) : null;
                      if (!decrypted) {
                        decryptedContent = '[E2EE消息 - 请检查本地密钥]';
                        setTimeout(() => checkAndPromptE2EERecovery(), 100);
                      } else {
                        decryptedContent = decrypted;
                      }
                    } else {
                      const decrypted = hasLocalKey ? await decrypt(m.content, m.from_user_id) : null;
                      if (!decrypted) {
                        decryptedContent = '[E2EE消息 - 需要恢复密钥]';
                        setTimeout(() => checkAndPromptE2EERecovery(), 100);
                      } else {
                        decryptedContent = decrypted;
                      }
                    }

                    messagesToUpdate.push({ id: m.id, content: decryptedContent });
                  }
                }

                // 批量更新解密后的消息内容
                if (messagesToUpdate.length > 0) {
                  setMessages(prevMsgs => prevMsgs.map(msg => {
                    const update = messagesToUpdate.find(u => u.id === msg.id);
                    return update ? { ...msg, content: update.content } : msg;
                  }));
                }
              })();
              
              // 异步检查对话设置并显示通知（不阻塞UI更新）
              (async () => {
                let isMuted = false;
                let isBlocked = false;
                try {
                  const settingsResponse = await api.get(`/messages/conversation/${conversationType}/${selectedConversation}/settings`);
                  isMuted = settingsResponse.data?.is_muted === true;
                  isBlocked = settingsResponse.data?.is_blocked === true;
                } catch (e) {
                  // 如果获取设置失败，默认为非静音和非黑名单
                }
                
                // 显示通知和声音提醒（如果未静音且未拉黑）
                if (!isMuted && !isBlocked) {
                  trulyNew.forEach((msg: Message) => {
                    if (msg.from_user_id !== user?.id) {
                      const senderName = msg.from_nickname || msg.from_username || '未知用户';
                      const messageText = msg.message_type === 'voice' 
                        ? '[语音消息]' 
                        : msg.message_type === 'image'
                        ? '[图片]'
                        : msg.message_type === 'sticker'
                        ? '[表情]'
                        : msg.content || '[消息]';
                      
                      // 显示系统通知和声音提醒
                      notificationService.showMessageNotification(
                        senderName,
                        messageText,
                        selectedConversation,
                        conversationType,
                        true
                      );
                    }
                  });
                }
              })();
              
              // 确保消息状态更新后立即滚动到底部
              setTimeout(() => {
                scrollToBottom();
              }, 0);
              
              return updatedMessages;
            }
            return prev;
          });
        } else {
          // 如果没有新消息，但API返回了消息，可能是ID重复或其他问题
          if (import.meta.env.DEV && newMessages.length > 0) {
            // 重新获取 existingIds 用于日志
            setMessages(prev => {
              const existingIdsForLog = new Set(prev.map(m => m.id));
              console.warn('[Messages轮询] API返回了新消息，但都被过滤掉了:', {
                newMessagesCount: newMessages.length,
                existingIdsCount: existingIdsForLog.size,
                newMessageIds: newMessages.map(m => m.id),
                existingIds: Array.from(existingIdsForLog)
              });
              return prev;
            });
          }
        }
      } else {
        // 首次加载或强制刷新，替换所有消息
        // 先处理E2EE消息，将未解密的内容替换为占位符，避免显示JSON格式
        const processedMessages = newMessages.map((m: Message) => {
          if (m.message_type === 'text' && isE2EEContent(m.content)) {
            // 如果是E2EE消息，先显示占位符，等待异步解密
            return {
              ...m,
              content: m.from_user_id === user?.id 
                ? '[E2EE消息 - 解密中...]' 
                : '[E2EE消息 - 解密中...]'
            };
          }
          return m;
        });
        setMessages(processedMessages);
        if (newMessages.length > 0) {
          // 找到时间最新的消息（按created_at排序）
          const latestMessage = [...newMessages].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          lastMessageTimeRef.current = latestMessage.created_at;
        }
        scrollToBottom();
      }

      // 如果是群组消息，获取群组成员用于@提醒
      if (type === 'group') {
        fetchGroupMembers(conversationId);
      } else {
        setGroupMembers([]);
      }
    } catch (error: any) {
      console.error('获取消息失败:', error);
      const status = error?.response?.status;
      if (status === 403 && type === 'group') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setSelectedConversation(null);
        setConversationType(null);
        setMessages([]);
        toast.error(error?.response?.data?.error || '您已不是该群组成员，请返回');
        return;
      }
      toast.error('获取消息失败');
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!selectedConversation) return;
    const hasText = !!messageContent.trim();
    const hasExcerpt = pendingAttachments.some(a => a.excerptData);
    const doneFiles = pendingAttachments.filter(a => !a.excerptData && a.uploadStatus === 'done');
    if (!hasText && !hasExcerpt && doneFiles.length === 0) return;
    if (pendingAttachments.some(a => !a.excerptData && (a.uploadStatus === 'pending' || a.uploadStatus === 'uploading'))) {
      toast.error(t('messages.pleaseWaitUpload') || '请等待附件上传完成');
      return;
    }

    try {
      setSending(true);

      // 先清空输入框，给用户即时反馈
      const textToSend = messageContent.trim();
      setMessageContent('');
      setReplyingTo(null);
      setShowEmojiPicker(false);
      setShowStickerPicker(false);

      // 如果有文本内容，先发送文本消息（1:1 且在双方具备 E2EE 时端到端加密）
      if (hasText) {
        const textFormData = new FormData();
        let contentToSend = textToSend;
        
        // E2EE加密：添加超时机制，避免阻塞太久
        if (conversationType === 'friend') {
          try {
            const enc = await Promise.race([
              encrypt(contentToSend, selectedConversation),
              new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 2000)) // 2秒超时
            ]);
            if (enc) contentToSend = enc;
          } catch (error) {
            console.warn('[发送消息] E2EE加密失败，发送未加密消息:', error);
            // 加密失败时继续发送未加密消息
          }
        }
        
        textFormData.append('content', contentToSend);
        textFormData.append('messageType', 'text');

        if (conversationType === 'friend') {
          textFormData.append('toUserId', selectedConversation);
        } else {
          textFormData.append('groupId', selectedConversation);
        }

        if (replyingTo) {
          textFormData.append('replyToMessageId', replyingTo.id);
        }

        await api.post('/messages', textFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      // 逐个发送附件：书籍摘抄直接发；文件类仅发送已上传完成的（file_path）
      for (const attachment of pendingAttachments) {
        const attachmentFormData = new FormData();
        let messageType = 'file';

        if (attachment.excerptData) {
          messageType = 'book_excerpt';
          attachmentFormData.append('content', JSON.stringify(attachment.excerptData));
        } else if (attachment.uploadStatus === 'done' && attachment.file_path) {
          attachmentFormData.append('file_path', attachment.file_path);
          attachmentFormData.append('file_name', attachment.file_name || (attachment.file && 'name' in attachment.file ? (attachment.file as File).name : 'file'));
          attachmentFormData.append('file_size', String(attachment.file_size ?? (attachment.file && 'size' in attachment.file ? attachment.file.size : 0)));
          attachmentFormData.append('file_type', attachment.file_type || '');
          if (attachment.file && 'type' in attachment.file) {
            if ((attachment.file as File).type.startsWith('image/')) messageType = 'image';
            else if ((attachment.file as File).type.startsWith('audio/')) messageType = 'voice';
          }
        } else {
          continue;
        }
        attachmentFormData.append('messageType', messageType);

        if (conversationType === 'friend') {
          attachmentFormData.append('toUserId', selectedConversation);
        } else {
          attachmentFormData.append('groupId', selectedConversation);
        }

        if (replyingTo && messageContent.trim()) { }

        await api.post('/messages', attachmentFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      // 清空附件
      setPendingAttachments([]);

      // 立即完整刷新消息列表，确保发送的消息能立即显示
      // 注意：不在这里刷新会话列表，避免与轮询冲突导致429错误
      isRefreshingAfterSendRef.current = true; // 标记正在刷新
      setTimeout(async () => {
        if (selectedConversation && conversationType) {
          try {
            // 使用完整刷新模式，确保新消息立即显示
            await fetchMessages(selectedConversation, conversationType, true, false);
          } finally {
            // 刷新完成后，延迟一下再允许轮询，避免冲突
            setTimeout(() => {
              isRefreshingAfterSendRef.current = false;
            }, 500);
          }
        }
      }, 300); // 延迟300ms，确保后端已保存
    } catch (error) {
      console.error('发送消息失败:', error);
      toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  const uploadAttachment = (att: { id: string; file: File | Blob }) => {
    const f = att.file as File;
    setPendingAttachments(prev => prev.map(a => a.id === att.id ? { ...a, uploadStatus: 'uploading' as const, progress: 0 } : a));
    const fd = new FormData();
    fd.append('file', f, (f && f.name) ? f.name : 'file');
    api.post('/messages/upload-file', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e: any) => {
        const p = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
        setPendingAttachments(prev => prev.map(a => a.id === att.id ? { ...a, progress: p } : a));
      }
    }).then((res: any) => {
      const d = res?.data || {};
      setPendingAttachments(prev => prev.map(a => a.id === att.id ? { ...a, uploadStatus: 'done' as const, progress: 100, file_path: d.file_path, file_name: d.file_name, file_size: d.file_size, file_type: d.file_type } : a));
    }).catch((err: any) => {
      setPendingAttachments(prev => prev.map(a => a.id === att.id ? { ...a, uploadStatus: 'error' as const, error: err?.response?.data?.error || err?.message || t('messages.uploadFailed') } : a));
      toast.error(t('messages.uploadFailed') || '上传失败');
    });
  };

  // 文件选择处理：选择后立即上传，展示进度，上传完成后才可发送
  const handleFileSelect = (files: FileList) => {
    Array.from(files).forEach(file => {
      if (file.size > 1024 * 1024 * 1024) {
        toast.error(t('messages.fileTooLarge1GB') || '文件大小不能超过1GB');
        return;
      }
      const id = `attachment-${Date.now()}-${Math.random()}`;
      const attachment = { file, id, uploadStatus: 'pending' as const };

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const withPreview = { ...attachment, preview: e.target?.result as string };
          setPendingAttachments(prev => [...prev, withPreview]);
          uploadAttachment(withPreview);
        };
        reader.readAsDataURL(file);
      } else {
        setPendingAttachments(prev => [...prev, attachment]);
        uploadAttachment(attachment);
      }
    });
  };

  // 移除附件
  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(att => att.id !== id));
  };

  // 表情选择
  const handleEmojiSelect = (emoji: string) => {
    setMessageContent(prev => prev + emoji);
  };

  const handleToggleEmojiPicker = () => {
    setShowEmojiPicker(prev => {
      if (!prev) setShowStickerPicker(false);
      return !prev;
    });
  };

  const handleToggleStickerPicker = () => {
    setShowStickerPicker(prev => {
      if (!prev) setShowEmojiPicker(false);
      return !prev;
    });
  };

  const handleStickerSelect = async (sticker: StickerItem) => {
    if (!selectedConversation || !conversationType) {
      toast.error('请选择一个会话');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('content', sticker.src);
      formData.append('messageType', 'sticker');
      if (conversationType === 'friend') {
        formData.append('toUserId', selectedConversation);
      } else {
        formData.append('groupId', selectedConversation);
      }

      await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowStickerPicker(false);
      if (selectedConversation && conversationType) {
        fetchMessages(selectedConversation, conversationType, false, true);
      }
    } catch (error) {
      console.error('发送表情包失败:', error);
      toast.error('发送表情包失败');
    }
  };

  // 消息右键菜单
  const handleMessageContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    setContextMenu({
      message,
      x: e.clientX,
      y: e.clientY
    });
  };

  const clearRecordingTimers = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  // 语音录制
  const startRecording = async () => {
    if (isRecording) return;
    if (!selectedConversation || !conversationType) {
      toast.error('请选择一个会话');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(t('messages.microphoneNotSupported'));
      return;
    }

    try {
      clearRecordingTimers();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 确保音频轨道已启用
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
        'audio/aac',
        'audio/mpeg'
      ];
      const supportedType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      
      // 使用更保守的比特率设置，确保兼容性
      const recorderOptions: MediaRecorderOptions = supportedType
        ? { 
            mimeType: supportedType, 
            audioBitsPerSecond: 64000  // 降低比特率，提高兼容性
          }
        : { 
            audioBitsPerSecond: 64000 
          };
      
      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];
      recordingCancelRef.current = false;
      recordingStreamRef.current = stream;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearRecordingTimers();
        setIsRecording(false);
        setIsPressingVoice(false);
        setRecordingTime(0);

        const duration = Math.max(1, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        
        // 确保所有轨道都已停止
        stream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        recordingStreamRef.current = null;

        if (recordingCancelRef.current) {
          chunks.length = 0; // 清理 chunks
          return;
        }

        if (chunks.length === 0) {
          toast.error('未录制到有效语音');
          return;
        }

        // 确保使用正确的 MIME 类型
        const recorderMimeType = recorder.mimeType || supportedType || 'audio/webm';
        const audioBlob = new Blob(chunks, { type: recorderMimeType });
        
        // 验证 blob 大小
        if (audioBlob.size === 0) {
          toast.error('录音文件为空');
          return;
        }

        console.log('[录音] 录音完成', {
          duration,
          blobSize: audioBlob.size,
          mimeType: recorderMimeType,
          chunksCount: chunks.length
        });

        await handleVoiceMessage(audioBlob, duration);
      };

      recorder.onerror = (event) => {
        console.error('[录音] MediaRecorder 错误:', event);
        toast.error('录音过程中发生错误');
        cancelRecording();
      };

      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = Date.now();
      
      // 使用 timeslice 参数，确保数据实时获取（每100ms获取一次）
      recorder.start(100);

      setIsRecording(true);
      setIsPressingVoice(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const next = prev + 1;
          if (next >= 60) {
            stopRecording();
            return 60;
          }
          return next;
        });
      }, 1000);

      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 60000);
    } catch (error: any) {
      console.error('开始录音失败:', error);
      const name = error?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        const isPWA = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || !!(navigator as any).standalone);
        toast.error(t(isPWA ? 'messages.microphoneNotAllowedHintPWA' : 'messages.microphoneNotAllowedHintSafari'));
      } else if (name === 'NotFoundError') {
        toast.error(t('messages.microphoneNotFound'));
      } else {
        toast.error(t('messages.cannotAccessMicrophone'));
      }
      setIsRecording(false);
      setIsPressingVoice(false);
      setRecordingTime(0);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        // 请求最后的数据块
        mediaRecorderRef.current.requestData();
        // 等待一小段时间确保数据被处理
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        }, 100);
      } catch (error) {
        console.error('[录音] 停止录音时出错:', error);
        // 如果 requestData 失败，直接停止
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }
    }
    setIsPressingVoice(false);
  };

  const cancelRecording = () => {
    recordingCancelRef.current = true;
    clearRecordingTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
    }
    setIsRecording(false);
    setIsPressingVoice(false);
    setRecordingTime(0);
  };

  const handleVoiceMessage = async (audioBlob: Blob, duration: number) => {
    if (!selectedConversation || !conversationType) return;

    try {
      const formData = new FormData();
      formData.append('content', `[语音消息 ${duration}秒]`);
      formData.append('messageType', 'voice');
      formData.append('duration', duration.toString());

      if (conversationType === 'friend') {
        formData.append('toUserId', selectedConversation);
      } else {
        formData.append('groupId', selectedConversation);
      }

      const fileExt = audioBlob.type.includes('ogg')
        ? 'ogg'
        : audioBlob.type.includes('webm')
        ? 'webm'
        : audioBlob.type.includes('wav')
        ? 'wav'
        : 'webm';
      formData.append('file', audioBlob, `voice-${Date.now()}.${fileExt}`);

      await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // 延迟一下再刷新消息列表和会话列表，确保后端已保存
      setTimeout(() => {
        if (selectedConversation && conversationType) {
          // 强制刷新消息列表，确保新消息显示
          fetchMessages(selectedConversation, conversationType, true, false);
        }
        // 刷新会话列表，使最后一条与未读数及时更新
        fetchConversations();
      }, 300);
    } catch (error) {
      console.error('发送语音消息失败:', error);
      toast.error('发送语音消息失败');
    }
  };

  // 播放语音消息
  const handlePlayVoiceMessage = async (message: Message) => {
    if (!message.file_path && !message.local_audio_blob) {
      toast.error('语音文件不存在');
      return;
    }

    if (playingVoiceId === message.id && currentVoiceAudioRef.current) {
      currentVoiceAudioRef.current.pause();
      currentVoiceAudioRef.current.currentTime = 0;
      unregisterAudio(currentVoiceAudioRef.current);
      currentVoiceAudioRef.current = null;
      setPlayingVoiceId(null);
      setVoicePlaybackTime(0);
      setMessages(prev => prev.map(item => ({ ...item, playing: false })));
      return;
    }

    if (currentVoiceAudioRef.current) {
      currentVoiceAudioRef.current.pause();
      currentVoiceAudioRef.current.currentTime = 0;
      unregisterAudio(currentVoiceAudioRef.current);
    }

    let audioSrc = '';
    let shouldRevoke = false;
    if (message.local_audio_blob) {
      audioSrc = URL.createObjectURL(message.local_audio_blob);
      shouldRevoke = true;
    } else {
      const fileApiPath = getMessageFileApiPath(message.file_path);
      if (!fileApiPath) {
        toast.error('播放失败');
        return;
      }
      try {
        const blobResponse = await api.get(fileApiPath, { responseType: 'blob' });
        audioSrc = URL.createObjectURL(blobResponse.data);
        shouldRevoke = true;
      } catch (error) {
        toast.error('播放失败');
        setPlayingVoiceId(null);
        setVoicePlaybackTime(0);
        setMessages(prev => prev.map(item => ({ ...item, playing: false })));
        return;
      }
    }
    const audio = createRegisteredAudio(audioSrc, { tag: 'voice-message' });
    currentVoiceAudioRef.current = audio;
    pauseAllRegisteredAudiosExcept(audio);

    setPlayingVoiceId(message.id);
    setMessages(prev => prev.map(item => ({ ...item, playing: item.id === message.id })));

    audio.ontimeupdate = () => {
      setVoicePlaybackTime(audio.currentTime);
    };

    audio.onended = () => {
      setPlayingVoiceId(null);
      setVoicePlaybackTime(0);
      setMessages(prev => prev.map(item => ({ ...item, playing: false })));
      if (shouldRevoke && audioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(audioSrc);
      }
      unregisterAudio(audio);
      currentVoiceAudioRef.current = null;
    };

    audio.onerror = () => {
      toast.error('播放失败');
      setPlayingVoiceId(null);
      setVoicePlaybackTime(0);
      setMessages(prev => prev.map(item => ({ ...item, playing: false })));
      if (shouldRevoke && audioSrc.startsWith('blob:')) {
        URL.revokeObjectURL(audioSrc);
      }
      unregisterAudio(audio);
      currentVoiceAudioRef.current = null;
    };

    audio.play().catch(() => {
      toast.error('播放失败');
      setPlayingVoiceId(null);
      setVoicePlaybackTime(0);
      setMessages(prev => prev.map(item => ({ ...item, playing: false })));
    });
  };

  // 获取通知列表（群组邀请、好友请求等）
  const fetchNotifications = async () => {
    try {
      let response;
      try {
        response = await api.get('/messages/notifications');
      } catch (error: any) {
        // 如果是429错误，重试一次
        if (error.response?.status === 429) {
          console.warn('[fetchNotifications] 429错误，等待1秒后重试');
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get('/messages/notifications');
        } else {
          throw error;
        }
      }
      const list = response.data.notifications || [];
      setNotifications(list);
      setNotificationCount(list.length);
    } catch (error) {
      console.error('获取通知失败:', error);
    }
  };

  // ============ useEffect 生命周期 ============

  // 初始化和URL参数处理
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'friends' || tab === 'groups') {
      setActiveTab(tab);
    }

    const userId = searchParams.get('userId');
    if (userId) {
      setConversationType('friend');
    }
  }, [searchParams]);

  // 同步URL参数
  useEffect(() => {
    if (activeTab === 'messages') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', activeTab);
    }
    setSearchParams(searchParams, { replace: true });
  }, [activeTab, setSearchParams]);

  // 检测PWA模式
  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = (window.navigator as any).standalone === true;
      // 可以在这里设置PWA状态
    };
    checkPWA();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkPWA);
    return () => mediaQuery.removeEventListener('change', checkPWA);
  }, []);

  // 移动端键盘处理
  useEffect(() => {
    if (!isMobileKeyboard || !keyboardState.isVisible) return;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [isMobileKeyboard, keyboardState.isVisible]);

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
      }
      if (currentVoiceAudioRef.current) {
        currentVoiceAudioRef.current.pause();
        unregisterAudio(currentVoiceAudioRef.current);
        currentVoiceAudioRef.current = null;
      }
    };
  }, []);

  // 初始化通知服务
  useEffect(() => {
    notificationService.setNotificationEnabled(notificationEnabled);
    notificationService.setSoundEnabled(soundEnabled);
    notificationService.setDisableNotificationsWhenTTSPlaying(disableNotificationsWhenTTSPlaying);

    if (notificationEnabled && !notificationService.hasPermission()) {
      notificationService.requestPermission().catch(console.error);
    }
  }, [notificationEnabled, soundEnabled, disableNotificationsWhenTTSPlaying]);

  // 定期刷新数据（会话列表、通知数）- 只在页面活跃时刷新
  useEffect(() => {
    fetchConversations();

    const interval = setInterval(() => {
      // 只在页面可见时刷新，减少不必要的API调用
      if (!document.hidden) {
        fetchConversations();
        fetchNotifications();
      }
    }, 60000); // 60秒刷新一次，进一步减少频率

    return () => clearInterval(interval);
  }, []);

  // 监听新消息事件，如果当前会话有新消息，立即刷新
  useEffect(() => {
    if (!selectedConversation || !conversationType) return;
    
    let previousUnreadCount = 0;
    
    const handleNewMessageReceived = async () => {
      // 延迟一下，等待会话列表更新
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 刷新会话列表以获取最新的未读数
      try {
        const response = await api.get('/messages/conversations');
        const conversations = response.data.conversations || [];
        
        // 查找当前会话
        const currentConv = conversations.find((conv: any) => {
          if (conversationType === 'friend') {
            return conv.conversation_type === 'friend' && 
                   (conv.other_user_id === selectedConversation || conv.user_id === selectedConversation);
          } else {
            return conv.conversation_type === 'group' && conv.group_id === selectedConversation;
          }
        });
        
        // 如果当前会话有未读消息，立即刷新消息列表
        if (currentConv && selectedConversation && conversationType) {
          const currentUnreadCount = currentConv.unread_count || 0;
          if (currentUnreadCount > previousUnreadCount) {
            if (import.meta.env.DEV) {
              console.log('[Messages] 检测到当前会话有新消息，立即刷新:', {
                conversationId: selectedConversation,
                conversationType,
                previousUnreadCount,
                currentUnreadCount
              });
            }
            
            // 立即刷新消息（使用checkNewOnly模式，避免完整刷新）
            if (!isRefreshingAfterSendRef.current) {
              fetchMessages(selectedConversation, conversationType, false, true).catch(err => {
                if (err.response?.status !== 429) {
                  console.error('[Messages] 收到新消息后刷新失败:', err);
                }
              });
            }
          }
          previousUnreadCount = currentUnreadCount;
        }
      } catch (error) {
        // 静默失败，不影响正常流程
        if (import.meta.env.DEV) {
          console.warn('[Messages] 检查未读数变化失败:', error);
        }
      }
    };
    
    window.addEventListener('messages:newMessageReceived', handleNewMessageReceived);
    
    return () => {
      window.removeEventListener('messages:newMessageReceived', handleNewMessageReceived);
    };
  }, [selectedConversation, conversationType]);


  // 当选择会话时获取消息
  useEffect(() => {
    if (selectedConversation && conversationType) {
      // 清空之前的消息和lastMessageTimeRef，确保全新开始
      setMessages([]);
      lastMessageTimeRef.current = '';
      
      // 首次加载消息（完整刷新）
      fetchMessages(selectedConversation, conversationType, true, false).then(() => {
        // 首次加载完成后，再启动轮询
        // 启动实时消息轮询（每3秒检查一次新消息，提高响应速度）
        pollingIntervalRef.current = setInterval(() => {
          if (selectedConversation && conversationType && isPageVisibleRef.current && !isRefreshingAfterSendRef.current) {
            fetchMessages(selectedConversation, conversationType, false, true).catch(err => {
              if (err.response?.status === 429) {
                // 429错误时不输出警告，避免控制台噪音
              } else {
                console.error('[Messages轮询] 轮询请求失败:', err);
              }
            });
          }
        }, 3000); // 从5秒减少到3秒，提高实时性
      });
      
      // 标记所有消息为已读（打开对话页面时）
      (async () => {
        try {
          await api.post(`/messages/conversation/${conversationType}/${selectedConversation}/read-all`, { _method: 'PUT' });
          // 触发未读数更新事件，立即更新未读数
          window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
          // 延迟一下再触发一次，确保未读数已更新
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
          }, 300);
          // 刷新会话列表
          fetchConversations();
        } catch (err: any) {
          // 如果是429错误，重试一次
          if (err.response?.status === 429) {
            console.warn('[Messages标记已读] 429错误，等待1秒后重试');
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              await api.post(`/messages/conversation/${conversationType}/${selectedConversation}/read-all`, { _method: 'PUT' });
              window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
              }, 300);
              fetchConversations();
            } catch (retryErr) {
              console.error('标记消息为已读失败:', retryErr);
            }
          } else {
            console.error('标记消息为已读失败:', err);
          }
        }
      })();
    }
    
    return () => {
      // 清理轮询
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      lastMessageTimeRef.current = '';
      // 清空消息列表，避免显示错误的对话消息
      setMessages([]);
      
      // 退出对话时，再次标记为已读并更新未读数（确保未读数为0）
      if (selectedConversation && conversationType) {
        (async () => {
          try {
            await api.post(`/messages/conversation/${conversationType}/${selectedConversation}/read-all`, { _method: 'PUT' });
            // 触发未读数更新事件
            window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
            // 刷新会话列表，确保未读数更新
            setTimeout(() => {
              fetchConversations();
            }, 200);
          } catch (err) {
            // 静默失败，不影响退出流程
            if (import.meta.env.DEV) {
              console.warn('[退出对话] 标记已读失败:', err);
            }
          }
        })();
      }
    };
  }, [selectedConversation, conversationType]);

  // 页面可见性检测
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      
      // 页面变为可见时，立即检查新消息
      if (!document.hidden && selectedConversation && conversationType) {
        fetchMessages(selectedConversation, conversationType, false, true);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    isPageVisibleRef.current = !document.hidden;
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedConversation, conversationType]);

  // 根据活跃标签页获取数据
  useEffect(() => {
    if (activeTab === 'messages') {
      fetchConversations();
    } else if (activeTab === 'friends') {
      fetchFriends();
    } else if (activeTab === 'groups') {
      fetchGroups();
    }
  }, [activeTab]);

  // 初始化通知和好友请求
  useEffect(() => {
    fetchNotifications();
    fetchFriendRequests();
  }, []);

  // 打开通知面板时刷新列表
  useEffect(() => {
    if (showNotifications) fetchNotifications();
  }, [showNotifications]);

  // 页面可见性变化处理
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchConversations();
        notificationService.stopTitleBlink();
      } else {
        if (unreadCount > 0) {
          notificationService.startTitleBlink(unreadCount);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      notificationService.stopTitleBlink();
    };
  }, [unreadCount]);

  // 初始化时清理可能损坏的分享摘抄数据
  useEffect(() => {
    try {
      const storedExcerpt = localStorage.getItem('shareExcerpt');
      if (storedExcerpt) {
        // 尝试解析，如果失败则清除
        JSON.parse(storedExcerpt);
      }
    } catch (error) {
      console.warn('[分享摘抄] 检测到损坏的数据，清除:', error);
      localStorage.removeItem('shareExcerpt');
    }
  }, []);

  // 监听分享摘抄事件
  useEffect(() => {
    const handleShareExcerpt = (event: CustomEvent) => {
      const excerptData = event.detail;

      // 如果是书籍摘抄，使用特殊的消息类型
      if (excerptData.messageType === 'book_excerpt') {
        // 构造书籍摘抄消息内容
        const bookExcerptData = {
          book_id: excerptData.book_id,
          book_title: excerptData.book_title,
          excerpt_text: excerptData.excerpt_text,
          chapter_title: excerptData.chapter_title,
          progress: excerptData.progress,
          page: excerptData.page
        };

        setMessageContent('');
        setPendingAttachments([]); // 清空附件
        setReplyingTo(null);
        setShowEmojiPicker(false);

        // 设置书籍摘抄消息类型（通过附件传递）
        const excerptContent = excerptData.excerpt;
        if (typeof excerptContent !== 'string') {
          console.warn('[分享摘抄] excerpt字段不是字符串，使用默认内容');
          setMessageContent('分享了书籍摘抄');
        } else {
          let excerptFile: Blob | File | null = null;
          const fileName = 'excerpt.txt';
          try {
            if (typeof File !== 'undefined') {
              excerptFile = new File([excerptContent], fileName, { type: 'text/plain' });
            }
          } catch (error) {
            console.warn('[分享摘抄] File构造函数不可用，降级为Blob:', error);
            excerptFile = null;
          }

          if (!excerptFile) {
            excerptFile = new Blob([excerptContent], { type: 'text/plain' });
          }

          const excerptAttachment = {
            file: excerptFile,
            fileName,
            id: `excerpt-${Date.now()}`,
            excerptData: bookExcerptData
          };
          setPendingAttachments([excerptAttachment]);
        }
      } else {
        // 普通文本摘抄
        setMessageContent(excerptData.excerpt);
        setPendingAttachments([]);
        setReplyingTo(null);
        setShowEmojiPicker(false);
      }

      // 如果有选中的对话，自动发送
      if (selectedConversation && conversationType) {
        // 延迟一下，让用户看到内容
        setTimeout(() => {
          sendMessage();
        }, 500);
      }
    };

    // 页面加载时检查本地存储中是否有待分享的摘抄
    const storedExcerpt = localStorage.getItem('shareExcerpt');
    if (storedExcerpt) {
      try {
        console.log('[分享摘抄] 发现存储的摘抄数据:', storedExcerpt.substring(0, 200) + '...');

        // 安全检查：确保数据是有效的JSON字符串
        if (typeof storedExcerpt !== 'string' || storedExcerpt.trim() === '') {
          console.warn('[分享摘抄] 存储的数据为空或无效，清除');
          localStorage.removeItem('shareExcerpt');
          return;
        }

        const excerptData = JSON.parse(storedExcerpt);
        console.log('[分享摘抄] 解析后的数据:', excerptData);

        // 验证必要字段
        if (!excerptData || typeof excerptData !== 'object') {
          console.warn('[分享摘抄] 解析后的数据不是对象，清除');
          localStorage.removeItem('shareExcerpt');
          return;
        }

        if (excerptData.messageType === 'book_excerpt') {
          // 处理书籍摘抄
          const bookExcerptData = {
            book_id: excerptData.book_id,
            book_title: excerptData.book_title,
            excerpt_text: excerptData.excerpt_text,
            chapter_title: excerptData.chapter_title,
            progress: excerptData.progress,
            page: excerptData.page
          };

          console.log('[分享摘抄] 构造书籍摘抄数据:', bookExcerptData);

          setMessageContent('');
          setPendingAttachments([]);
          setReplyingTo(null);
          setShowEmojiPicker(false);

          // 设置书籍摘抄消息类型
          try {
            // 安全检查：确保excerpt字段存在且是字符串
            const excerptContent = excerptData.excerpt;
            if (typeof excerptContent !== 'string') {
              console.warn('[分享摘抄] excerpt字段不是字符串，使用默认内容');
              setMessageContent('分享了书籍摘抄');
            } else {
              let excerptFile: Blob | File | null = null;
              const fileName = 'excerpt.txt';
              try {
                if (typeof File !== 'undefined') {
                  excerptFile = new File([excerptContent], fileName, { type: 'text/plain' });
                }
              } catch (error) {
                console.warn('[分享摘抄] File构造函数不可用，降级为Blob:', error);
                excerptFile = null;
              }

              if (!excerptFile) {
                excerptFile = new Blob([excerptContent], { type: 'text/plain' });
              }

              const excerptAttachment = {
                file: excerptFile,
                fileName,
                id: `excerpt-${Date.now()}`,
                excerptData: bookExcerptData
              };
              console.log('[分享摘抄] 创建附件对象成功:', excerptAttachment.file);
              setPendingAttachments([excerptAttachment]);
            }
          } catch (fileError) {
            console.error('[分享摘抄] 创建File对象失败:', fileError);
            // 如果File构造函数失败，至少设置文本内容
            setMessageContent(excerptData.excerpt || '分享了书籍摘抄');
          }
        } else {
          // 普通文本摘抄
          console.log('[分享摘抄] 普通文本摘抄:', excerptData.excerpt);
          setMessageContent(excerptData.excerpt);
        }
        localStorage.removeItem('shareExcerpt'); // 清除存储
        console.log('[分享摘抄] 处理完成，已清除存储');
      } catch (error) {
        console.error('[分享摘抄] 解析分享摘抄数据失败:', error);
        console.error('[分享摘抄] 原始数据:', storedExcerpt);
        // 清除损坏的数据
        localStorage.removeItem('shareExcerpt');
      }
    }

    // 监听转发消息事件
    const handleForwardMessage = (event: CustomEvent) => {
      const { message, type } = event.detail;
      setForwardingMessage(message);
      setForwardTargetType(type);
      setShowForwardModal(true);
    };

    window.addEventListener('shareExcerpt', handleShareExcerpt as EventListener);
    window.addEventListener('forwardMessage', handleForwardMessage as EventListener);
    return () => {
      window.removeEventListener('shareExcerpt', handleShareExcerpt as EventListener);
      window.removeEventListener('forwardMessage', handleForwardMessage as EventListener);
    };
  }, [selectedConversation, conversationType]);

  // 布局：移动端 <768 为底部 tab 模式；PC 左侧 Sidebar + 右侧对话
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const isInChatMode = !isMobile && !!selectedConversation;

  return (
    <>
    <div
      className={`${isMobile ? 'fixed inset-0' : 'w-full h-full min-h-0'} flex flex-col bg-gray-50 dark:bg-gray-900`}
      onContextMenu={(e) => {
        // 阻止Messages页面的默认右键菜单
        e.preventDefault();
      }}
    >
      <StatusBarPlaceholder />

      {/* PC 端：有会话时显示对话顶栏，背景与主内容同宽居中；无返回按钮，名称居中 */}
      {isInChatMode && (
        <header className="flex-shrink-0 h-11 w-full max-w-7xl mx-auto bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="h-full flex items-center justify-center px-4">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate text-center">
              {conversations.find(c => (c.other_user_id || c.group_id) === selectedConversation && c.conversation_type === conversationType)?.other_nickname
                || conversations.find(c => (c.other_user_id || c.group_id) === selectedConversation && c.conversation_type === conversationType)?.other_username
                || conversations.find(c => (c.other_user_id || c.group_id) === selectedConversation)?.group_name
                || '对话'}
            </h1>
          </div>
        </header>
      )}

      {/* 主内容区：pb-0 覆盖 index.css 的 main { padding-bottom: 5rem }；PC 端 max-w-7xl mx-auto 居中 */}
      <main className={`flex-1 min-h-0 overflow-hidden flex pb-0 w-full ${!isMobile ? 'max-w-7xl mx-auto' : ''}`}>
        {/* 左侧：Sidebar。移动端占满；PC 固定宽 */}
        <div className={`flex flex-col min-h-0 overflow-hidden ${isMobile ? 'flex-1 w-full' : 'w-64 xl:w-72 2xl:w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700'}`}>
          <Sidebar
            hideTabs={isMobile}
            activeTab={activeTab}
            selectedConversation={selectedConversation}
            conversationType={conversationType}
            currentUserId={user?.id}
            conversations={conversations}
            friends={user ? [{ id: 'self', friend_id: user.id, friend_username: user.username, friend_nickname: t('messages.self') || '我', friend_email: user.email || '' } as any, ...(friends || [])] : (friends || [])}
            groups={groups}
            notificationCount={notificationCount}
            searchQuery={searchKeyword}
            searchResults={messageSearchResults}
            searchingMessages={searchingMessages}
            onTabChange={handleTabChange}
            onConversationClick={handleConversationClick}
            onConversationContextMenu={(e, conv) => { e.preventDefault(); setConversationContextMenu({ conversation: conv, x: e.clientX, y: e.clientY }); }}
            onFriendClick={handleFriendClick}
            onGroupClick={handleGroupClick}
            onShowNotifications={() => setShowNotifications(!showNotifications)}
            onShowNotificationSettings={() => setShowNotificationSettings(!showNotificationSettings)}
            onShowFriendsManagement={() => setShowFriendsManagement(true)}
            onShowGroupsManagement={() => setShowGroupsManagement(true)}
            onAddFriend={() => setShowAddFriend(true)}
            onCreateGroup={() => setShowCreateGroup(true)}
            onSearchChange={handleSearchChange}
            onSearchResultClick={handleSearchResultClick}
          />
        </div>

        {/* 右侧：仅 PC。有会话为 ChatArea，无会话为空状态 */}
        {!isMobile && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
            {selectedConversation && conversationType ? (
              <ChatArea
                selectedConversation={selectedConversation}
                messages={messages}
                messageContent={messageContent}
                showVoiceButton={showVoiceButton}
                showEmojiPicker={showEmojiPicker}
                showStickerPicker={showStickerPicker}
                sending={sending}
                isRecording={isRecording}
                isPressingVoice={isPressingVoice}
                recordingTime={recordingTime}
                pendingAttachments={pendingAttachments}
                replyingTo={replyingTo}
                conversationType={conversationType}
                groupMembers={groupMembers}
                currentUserId={user?.id}
                currentUserDisplayName={user?.nickname || user?.username}
                currentUserAvatarPath={user?.avatar_path}
                onMessageContentChange={setMessageContent}
                onSendMessage={sendMessage}
                onToggleVoiceButton={() => setShowVoiceButton(!showVoiceButton)}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
                onCancelRecording={cancelRecording}
                onToggleStickerPicker={handleToggleStickerPicker}
                onStickerSelect={handleStickerSelect}
                onFileSelect={handleFileSelect}
                onEmojiSelect={handleEmojiSelect}
                onToggleEmojiPicker={handleToggleEmojiPicker}
                onRemoveAttachment={handleRemoveAttachment}
                onReplyCancel={() => setReplyingTo(null)}
                onMessageContextMenu={handleMessageContextMenu}
                onPlayVoiceMessage={handlePlayVoiceMessage}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                <div className="text-center">
                  <MessageCircle className="w-16 h-16 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">{t('messages.selectConversation')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 移动端：微信式底部栏（对话/好友/群组），替代系统底栏 */}
      {isMobile && (
        <BottomNavigation activeTab={activeTab} onTabChange={handleTabChange} />
      )}
    </div>

    {/* 添加好友模态框 */}
    {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} />}

    {/* 新建群组模态框 */}
    {showCreateGroup && <CreateGroupModal onClose={() => setShowCreateGroup(false)} />}

    {/* 好友管理模态框 */}
    {showFriendsManagement && (
      <FriendsManagementModal
        onClose={() => setShowFriendsManagement(false)}
        friends={friends}
        friendRequests={receivedRequests}
        sentRequests={sentRequests}
        onAcceptRequest={async (requestId) => {
          try {
            await api.post(`/friends/requests/${requestId}/accept`);
            toast.success(t('messages.acceptFriendRequestSuccess'));
            fetchFriendRequests();
            fetchFriends();
          } catch (error) {
            console.error('接受好友请求失败:', error);
            toast.error(t('messages.acceptFriendRequestFailed'));
          }
        }}
        onRejectRequest={async (requestId) => {
          try {
            await api.post(`/friends/requests/${requestId}/reject`);
            toast.success(t('messages.rejectFriendRequestSuccess'));
            fetchFriendRequests();
          } catch (error) {
            console.error('拒绝好友请求失败:', error);
            toast.error(t('messages.rejectFriendRequestFailed'));
          }
        }}
        onCancelRequest={async (requestId) => {
          try {
            await api.post(`/friends/requests/${requestId}`, { _method: 'DELETE' });
            toast.success(t('messages.cancelRequestSuccess'));
            fetchFriendRequests();
          } catch (error) {
            console.error('取消好友请求失败:', error);
            toast.error(t('messages.cancelRequestFailed'));
          }
        }}
        onRemoveFriend={async (friendId) => {
          if (!confirm(t('messages.deleteFriendConfirmShort'))) return;
          try {
            await api.post(`/friends/${friendId}`, { _method: 'DELETE' });
            toast.success(t('friends.deleteSuccess'));
            fetchFriends();
          } catch (error) {
            console.error('删除好友失败:', error);
            toast.error(t('friends.deleteFailed'));
          }
        }}
      />
    )}

    {/* 群组管理模态框 */}
    {showGroupsManagement && (
      <GroupsManagementModal
        onClose={() => setShowGroupsManagement(false)}
        currentUserId={user?.id}
        groups={groups.map(group => ({
          ...group,
          owner_id: group.owner_id || group.creator_id,
          is_owner: (group.creator_id || group.owner_id) === user?.id,
        }))}
        onCreateGroup={() => {
          setShowGroupsManagement(false);
          setShowCreateGroup(true);
        }}
        onInviteToGroup={(groupId) => {
          const group = groups.find(g => g.id === groupId);
          setShowInviteToGroup({ groupId, groupName: group?.name });
        }}
        onLeaveGroup={async (groupId) => {
          if (!confirm(t('messages.leaveGroupConfirmThis'))) return;
          try {
            await api.post(`/groups/${groupId}/leave`);
            toast.success(t('messages.leaveGroupSuccess'));
            fetchGroups();
          } catch (error) {
            console.error('退出群组失败:', error);
            toast.error(t('messages.leaveGroupFailedErr'));
          }
        }}
        onDeleteGroup={async (groupId) => {
          try {
            await api.post(`/groups/${groupId}`, { _method: 'DELETE' });
            toast.success(t('messages.deleteGroupSuccess'));
            fetchGroups();
            setShowGroupsManagement(false);
          } catch (error) {
            console.error('删除群组失败:', error);
            toast.error((error as any)?.response?.data?.error || t('messages.deleteGroupFailed'));
          }
        }}
        onTransferOwner={async (groupId, newOwnerId) => {
          try {
            await api.post(`/groups/${groupId}/transfer`, { newOwnerId });
            toast.success(t('messages.transferOwnerSuccess'));
            fetchGroups();
          } catch (error) {
            console.error('转让群主失败:', error);
            toast.error((error as any)?.response?.data?.error || t('messages.transferOwnerFailed'));
          }
        }}
        onManageGroup={(groupId) => {
          // 这里可以打开群组成员管理模态框
          toast(t('messages.membersManagementComing'));
        }}
      />
    )}

    {/* 通知设置模态框 */}
    {showNotificationSettings && (
      <NotificationSettingsModal
        onClose={() => setShowNotificationSettings(false)}
        notificationEnabled={notificationEnabled}
        soundEnabled={soundEnabled}
        disableNotificationsWhenTTSPlaying={disableNotificationsWhenTTSPlaying}
        onUpdateSettings={(settings) => {
          setNotificationEnabled(settings.notificationEnabled);
          setSoundEnabled(settings.soundEnabled);
          setDisableNotificationsWhenTTSPlaying(settings.disableNotificationsWhenTTSPlaying);

          // 保存到本地存储
          localStorage.setItem('notificationEnabled', settings.notificationEnabled.toString());
          localStorage.setItem('soundEnabled', settings.soundEnabled.toString());
          localStorage.setItem('disableNotificationsWhenTTSPlaying', settings.disableNotificationsWhenTTSPlaying.toString());

          toast.success(t('messages.settingsSaved'));
        }}
      />
    )}

    {/* 邀请好友加入群组模态框 */}
    {showInviteToGroup && (
      <InviteToGroupModal
        onClose={() => setShowInviteToGroup(null)}
        friends={friends}
        groupId={showInviteToGroup.groupId}
        groupName={showInviteToGroup.groupName}
        onInvite={async (friendIds, groupId) => {
          try {
            await api.post(`/groups/${groupId}/invite`, {
              userIds: friendIds,
            });
            toast.success(t('messages.invitedToGroupToast', { count: friendIds.length }));
            setShowInviteToGroup(null);
          } catch (error) {
            console.error('邀请好友失败:', error);
            toast.error(t('messages.inviteFriendsFailed'));
          }
        }}
      />
    )}

    {/* 通知面板：群组邀请、好友请求，点击顶部铃铛时展示 */}
    <NotificationsPanel
      isOpen={showNotifications}
      onClose={() => setShowNotifications(false)}
      notifications={notifications as NotificationItem[]}
      onAcceptGroupInvitation={async (invitationId) => {
        try {
          setAcceptingInvitationId(invitationId);
          await api.post(`/groups/invitations/${invitationId}/accept`);
          toast.success(t('messages.acceptGroupSuccess'));
          fetchNotifications();
          fetchGroups();
          fetchConversations();
        } catch (error: any) {
          console.error('接受群组邀请失败:', error);
          toast.error(error?.response?.data?.error || t('messages.acceptGroupFailed'));
        } finally {
          setAcceptingInvitationId(null);
        }
      }}
      onDeclineGroupInvitation={async (invitationId) => {
        try {
          setDecliningInvitationId(invitationId);
          await api.post(`/groups/invitations/${invitationId}/decline`);
          toast.success(t('messages.declineGroupSuccess'));
          fetchNotifications();
        } catch (error: any) {
          console.error('拒绝群组邀请失败:', error);
          toast.error(error?.response?.data?.error || t('messages.declineGroupFailed'));
        } finally {
          setDecliningInvitationId(null);
        }
      }}
      onOpenFriendsManagement={() => {
        setShowNotifications(false);
        setShowFriendsManagement(true);
      }}
      onOpenGroupInvitationsPage={() => {
        navigate('/group-invitations');
        setShowNotifications(false);
      }}
      acceptingId={acceptingInvitationId}
      decliningId={decliningInvitationId}
    />

    {/* 消息右键菜单（PC 端 ChatArea 触发） */}
    {contextMenu && (
      <div
        className="fixed z-[100] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] pointer-events-auto"
        style={{
          left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200))}px`,
          top: `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - 300))}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => { copyMessage(contextMenu.message); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors">
          <Copy className="w-4 h-4" />
          {t('messages.copy')}
        </button>
        <button onClick={() => { setReplyingTo(contextMenu.message); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors">
          <Reply className="w-4 h-4" />
          {t('messages.reply')}
        </button>
        <button onClick={() => { setForwardingMessage(contextMenu.message); setShowForwardModal(true); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors">
          <Forward className="w-4 h-4" />
          {t('messages.forward')}
        </button>
        {hasDownloadableAttachment(contextMenu.message) && (
          <button onClick={() => downloadAttachment(contextMenu.message)} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors">
            <Download className="w-4 h-4" />
            {t('messages.download')}
          </button>
        )}
        {isBookFile(contextMenu.message) && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button onClick={() => { setAddToLibraryMessage(contextMenu.message); setContextMenu(null); }} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors">
              <BookOpen className="w-4 h-4" />
              {t('messages.addToLibrary')}
            </button>
          </>
        )}
        {contextMenu.message.from_user_id === user?.id && canRecallMessage(contextMenu.message) && (
          <button onClick={() => recallMessage(contextMenu.message.id, contextMenu.message)} className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors">
            <RotateCcw className="w-4 h-4" />
            {t('messages.recall')}
          </button>
        )}
        {contextMenu.message.from_user_id === user?.id && !contextMenu.message.is_deleted && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button onClick={() => deleteMessage(contextMenu.message.id)} className="w-full px-4 py-2 text-left hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 transition-colors">
              <XCircle className="w-4 h-4" />
              {t('messages.delete')}
            </button>
          </>
        )}
      </div>
    )}
    {contextMenu && (
      <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} aria-hidden="true" />
    )}

    {/* 转发消息模态框 */}
    {showForwardModal && (
      <ForwardModal
        isOpen={showForwardModal}
        onClose={() => {
          setShowForwardModal(false);
          setForwardingMessage(null);
        }}
        message={forwardingMessage}
        friends={friends}
        groups={groups}
        onForward={async (message, targetId, targetType) => {
          await forwardMessage(message, targetId, targetType);
          setShowForwardModal(false);
          setForwardingMessage(null);
        }}
      />
    )}

    {/* 添加到图书馆模态框 */}
    <AddToLibraryModal
      isOpen={!!addToLibraryMessage}
      onClose={() => setAddToLibraryMessage(null)}
      message={addToLibraryMessage}
      onConfirm={handleAddToLibraryConfirm}
    />

    {/* 对话重命名弹窗（显示名与备注） */}
    {showRenameModal && (
      <RenameConversationModal
        conversation={showRenameModal}
        onClose={() => setShowRenameModal(null)}
        onSaved={() => {
          fetchConversations();
        }}
      />
    )}

    {/* 对话设置右键菜单 */}
    {conversationContextMenu && (
      <div
        className="fixed z-[100] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
        style={{
          left: `${Math.max(8, Math.min(conversationContextMenu.x, window.innerWidth - 200))}px`,
          top: `${Math.max(8, Math.min(conversationContextMenu.y, window.innerHeight - 300))}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 静音/取消静音 */}
        <button
          onClick={async () => {
            const conv = conversationContextMenu.conversation;
            const convId = conv.conversation_type === 'friend' ? conv.other_user_id : conv.group_id;
            if (!convId) return;
            
            try {
              const currentMuted = conv.is_muted || false;
              await api.post(`/messages/conversation/${conv.conversation_type}/${convId}/mute`, { _method: 'PUT',
                muted: !currentMuted
              });
              toast.success(!currentMuted ? t('messages.setMuted') : t('messages.setUnmuted'));
              fetchConversations(); // 刷新会话列表
              setConversationContextMenu(null);
            } catch (error) {
              console.error('设置静音失败:', error);
              toast.error(t('messages.muteFailed'));
            }
          }}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
        >
          {conversationContextMenu.conversation.is_muted ? (
            <>
              <Volume2 className="w-4 h-4" />
              {t('messages.unmute')}
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4" />
              {t('messages.mute')}
            </>
          )}
        </button>

        {/* 重命名（显示名与备注） */}
        <button
          onClick={() => {
            setShowRenameModal(conversationContextMenu.conversation);
            setConversationContextMenu(null);
          }}
          className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
        >
          <Edit2 className="w-4 h-4" />
          {t('messages.renamed')}
        </button>

        {/* 黑名单/取消黑名单 */}
        <button
          onClick={async () => {
            const conv = conversationContextMenu.conversation;
            const convId = conv.conversation_type === 'friend' ? conv.other_user_id : conv.group_id;
            if (!convId) return;
            
            const currentBlocked = conv.is_blocked || false;
            if (!currentBlocked) {
              if (!confirm(t('messages.addToBlocklistConfirm'))) {
                return;
              }
            }
            
            try {
              await api.post(`/messages/conversation/${conv.conversation_type}/${convId}/block`, { _method: 'PUT',
                blocked: !currentBlocked
              });
              toast.success(!currentBlocked ? t('messages.setBlocklist') : t('messages.setUnblocklist'));
              fetchConversations(); // 刷新会话列表
              setConversationContextMenu(null);
            } catch (error) {
              console.error('设置黑名单失败:', error);
              toast.error(t('messages.muteFailed'));
            }
          }}
          className={`w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm transition-colors ${
            conversationContextMenu.conversation.is_blocked
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          <Ban className="w-4 h-4" />
          {conversationContextMenu.conversation.is_blocked ? t('messages.removeFromBlocklist') : t('messages.addToBlocklist')}
        </button>

        {/* 删除对话（仅移除当前用户本地的对话记录，对方仍保留完整内容） */}
        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
        <button
          onClick={async () => {
            const conv = conversationContextMenu.conversation;
            const convId = conv.conversation_type === 'friend' ? conv.other_user_id : conv.group_id;
            if (!convId) return;
            if (!confirm(t('messages.deleteConversationConfirm'))) return;
            try {
              await api.post(`/messages/conversation/${conv.conversation_type}/${convId}`, { _method: 'DELETE' });
              if (selectedConversation === convId && conversationType === conv.conversation_type) {
                setSelectedConversation(null);
                setConversationType(null);
              }
              fetchConversations();
              setConversationContextMenu(null);
              toast.success(t('messages.deleteConversationSuccess'));
            } catch (error: any) {
              console.error('删除对话失败:', error);
              toast.error(error?.response?.data?.error || t('messages.deleteConversationFailed'));
            }
          }}
          className="w-full px-4 py-2 text-left hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          {t('messages.deleteConversation')}
        </button>
      </div>
    )}

    {/* 点击空白处关闭对话右键菜单 */}
    {conversationContextMenu && (
      <div
        className="fixed inset-0 z-[99]"
        onClick={() => setConversationContextMenu(null)}
      />
    )}

    {/* E2EE 恢复提示 */}
    {showE2EERecoveryPrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowE2EERecoveryPrompt(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('messages.e2eeRecoveryTitle') || '端到端加密'}</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('messages.e2eeRecoveryHint') || '检测到加密消息，但本设备未恢复密钥。请在设置中恢复密钥以查看加密消息。'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowE2EERecoveryPrompt(false)}
              className="btn btn-secondary"
            >
              {t('common.later') || '稍后'}
            </button>
            <button
              onClick={() => {
                setShowE2EERecoveryPrompt(false);
                // 跳转到设置页面
                navigate('/settings');
              }}
              className="btn btn-primary"
            >
              {t('messages.e2eeGoToSettings') || '前往设置'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default Messages;