/**
 * @file Friends.tsx
 * @author ttbye
 * @date 2025-01-01
 * @description 好友管理页面 - 参考微信/QQ等优秀应用设计
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { 
  UserPlus, Users, Search, Check, XCircle, UserMinus, Mail, Edit2, X, 
  Clock, MessageSquare, MoreVertical, Filter, UserCheck, UserX 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  friend_email?: string;
}

import { formatTimeWithTimezone } from '../utils/timezone';

// 格式化时间显示（考虑时区）
const formatTime = (dateString: string): string => {
  return formatTimeWithTimezone(dateString, {
    showTime: true,
    showDate: true,
    relative: true,
  });
};

export default function Friends() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [requestFilter, setRequestFilter] = useState<'all' | 'received' | 'sent'>('all');
  const [friendGroups, setFriendGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [editRemark, setEditRemark] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [friendSearchKeyword, setFriendSearchKeyword] = useState('');
  
  // 添加好友相关状态
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchData();
    if (activeTab === 'friends') {
      fetchFriendGroups();
    }
  }, [activeTab, selectedGroup, friendSearchKeyword]);

  // 定期刷新请求列表（每30秒）
  useEffect(() => {
    if (activeTab === 'requests') {
      const interval = setInterval(() => {
        fetchReceivedRequests();
        fetchSentRequests();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'friends') {
        await fetchFriends();
      } else if (activeTab === 'requests') {
        // 同时获取收到的和发送的请求
        await Promise.all([fetchReceivedRequests(), fetchSentRequests()]);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const params: any = {};
      if (selectedGroup) {
        params.groupName = selectedGroup;
      }
      if (friendSearchKeyword.trim()) {
        params.keyword = friendSearchKeyword.trim();
      }
      const response = await api.get('/friends', { params });
      setFriends(response.data.friends || []);
    } catch (error: any) {
      console.error('获取好友列表失败:', error);
      toast.error(t('friends.fetchFailed') || '获取好友列表失败');
    }
  };

  const fetchFriendGroups = async () => {
    try {
      const response = await api.get('/friends/groups');
      setFriendGroups(response.data.groups || []);
    } catch (error: any) {
      console.error('获取好友分组失败:', error);
    }
  };

  const fetchReceivedRequests = async () => {
    try {
      const response = await api.get('/friends/requests/received');
      const requests = response.data.requests || [];
      setReceivedRequests(requests);
    } catch (error: any) {
      console.error('获取收到的请求失败:', error);
      toast.error(t('friends.fetchReceivedFailed') || '获取收到的请求失败');
    }
  };

  const fetchSentRequests = async () => {
    try {
      const response = await api.get('/friends/requests/sent');
      setSentRequests(response.data.requests || []);
    } catch (error: any) {
      console.error('获取发送的请求失败:', error);
      toast.error(t('friends.fetchSentFailed') || '获取发送的请求失败');
    }
  };

  const searchUsers = async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchingUsers(true);
      const response = await api.get('/friends/search', {
        params: { keyword: keyword.trim() }
      });
      setSearchResults(response.data.users || []);
    } catch (error: any) {
      console.error('搜索用户失败:', error);
      toast.error(t('friends.searchFailed') || '搜索用户失败');
      setSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleUserSelect = (user: any) => {
    setSelectedUser(user);
    setRequestMessage('');
    setShowRequestModal(true);
  };

  const sendFriendRequest = async () => {
    if (!selectedUser) return;

    try {
      await api.post('/friends/requests', { 
        friendId: selectedUser.id,
        message: requestMessage.trim() || null
      });
      toast.success(t('friends.requestSent') || '好友请求已发送');
      setShowRequestModal(false);
      setSelectedUser(null);
      setRequestMessage('');
      setSearchKeyword('');
      setSearchResults([]);
      fetchSentRequests();
    } catch (error: any) {
      console.error('发送好友请求失败:', error);
      toast.error(error.response?.data?.error || t('friends.requestFailed') || '发送好友请求失败');
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      await api.post(`/friends/requests/${requestId}/accept`);
      toast.success(t('friends.acceptSuccess') || '好友请求已接受');
      fetchReceivedRequests();
      fetchFriends();
    } catch (error: any) {
      console.error('接受好友请求失败:', error);
      toast.error(error.response?.data?.error || t('friends.acceptFailed') || '接受好友请求失败');
    }
  };

  const declineRequest = async (requestId: string) => {
    if (!confirm(t('friends.declineConfirm') || '确定要拒绝此好友请求吗？')) {
      return;
    }

    try {
      await api.post(`/friends/requests/${requestId}/decline`);
      toast.success(t('friends.declineSuccess') || '好友请求已拒绝');
      fetchReceivedRequests();
    } catch (error: any) {
      console.error('拒绝好友请求失败:', error);
      toast.error(error.response?.data?.error || t('friends.declineFailed') || '拒绝好友请求失败');
    }
  };

  const deleteFriend = async (friendId: string) => {
    if (!confirm(t('friends.deleteConfirm') || '确定要删除此好友吗？')) {
      return;
    }

    try {
      await api.post(`/friends/${friendId}`, { _method: 'DELETE' });
      toast.success(t('friends.deleteSuccess') || '好友已删除');
      fetchFriends();
      fetchFriendGroups();
    } catch (error: any) {
      console.error('删除好友失败:', error);
      toast.error(error.response?.data?.error || t('friends.deleteFailed') || '删除好友失败');
    }
  };

  const handleEditFriend = (friend: Friend) => {
    setEditingFriend(friend);
    setEditRemark(friend.remark || '');
    setEditGroupName(friend.group_name_display || '');
    setNewGroupName('');
  };

  const saveFriendEdit = async () => {
    if (!editingFriend) return;

    try {
      await api.post(`/friends/${editingFriend.friend_id}/remark`, { _method: 'PUT', 
        remark: editRemark.trim() || null,
       });
      const finalGroupName = newGroupName.trim() || editGroupName || null;
      if (finalGroupName !== editingFriend.group_name_display) {
        await api.post(`/friends/${editingFriend.friend_id}/group`, { _method: 'PUT', 
          groupName: finalGroupName,
         });
      }
      toast.success(t('friends.updateSuccess') || '好友信息已更新');
      setEditingFriend(null);
      fetchFriends();
      fetchFriendGroups();
    } catch (error: any) {
      console.error('更新好友信息失败:', error);
      toast.error(error.response?.data?.error || t('friends.updateFailed') || '更新好友信息失败');
    }
  };

  // 处理搜索输入
  const handleSearchChange = (value: string) => {
    setSearchKeyword(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (value.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        searchUsers(value);
      }, 500);
    } else {
      setSearchResults([]);
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
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
          {t('friends.title') || '好友'}
        </h1>
        <button
          onClick={() => setShowAddFriend(!showAddFriend)}
          className="btn btn-primary flex items-center gap-2 shadow-lg hover:shadow-xl transition-shadow"
        >
          <UserPlus className="w-4 h-4" />
          {t('friends.addFriend') || '添加好友'}
        </button>
      </div>

      {/* 添加好友搜索卡片 */}
      {showAddFriend && (
        <div className="card mb-6 shadow-lg border-2 border-blue-100 dark:border-blue-900">
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Search className="w-4 h-4" />
              {t('friends.searchUser') || '搜索用户'}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="input w-full pl-11 pr-4 py-3 text-base"
                placeholder={t('friends.searchPlaceholder') || '输入用户名、邮箱或昵称'}
              />
            </div>
            {searchingUsers && (
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                {t('common.searching')}
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 mt-4">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg hover:shadow-md transition-all cursor-pointer border border-gray-200 dark:border-gray-600"
                  onClick={() => handleUserSelect(user)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                      {(user.nickname || user.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {user.nickname || user.username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUserSelect(user);
                    }}
                    className="btn btn-sm btn-primary flex items-center gap-1"
                  >
                    <UserPlus className="w-4 h-4" />
                    {t('friends.add') || '添加'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchKeyword && !searchingUsers && searchResults.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <UserX className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{t('friends.noUsersFound') || '未找到用户'}</p>
            </div>
          )}
        </div>
      )}

      {/* 标签页导航 */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        <button
          onClick={() => {
            setActiveTab('friends');
            setSelectedGroup('');
            setFriendSearchKeyword('');
          }}
          className={`flex-1 px-4 py-2.5 rounded-md font-medium transition-all ${
            activeTab === 'friends'
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />
            <span>{t('friends.friends') || '好友'}</span>
            {friends.length > 0 && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs px-2 py-0.5 rounded-full">
                {friends.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 px-4 py-2.5 rounded-md font-medium transition-all relative ${
            activeTab === 'requests'
              ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Mail className="w-4 h-4" />
            <span>{t('friends.requests') || '好友请求'}</span>
            {(receivedRequests.length + sentRequests.length) > 0 && (
              <span className="bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 text-xs px-2 py-0.5 rounded-full">
                {receivedRequests.length + sentRequests.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* 好友列表 */}
      {activeTab === 'friends' && (
        <div>
          {/* 搜索和筛选 */}
          <div className="mb-4 flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={friendSearchKeyword}
                onChange={(e) => setFriendSearchKeyword(e.target.value)}
                className="input w-full pl-10"
                placeholder={t('friends.searchFriends') || '搜索好友...'}
              />
            </div>
            {friendGroups.length > 0 && (
              <div className="flex gap-2 items-center">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="input"
                >
                  <option value="">{t('friends.allGroups')}</option>
                  {friendGroups.map((group) => (
                    <option key={group.group_name} value={group.group_name}>
                      {group.group_name} ({group.count})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 分组标签 */}
          {friendGroups.length > 0 && !selectedGroup && (
            <div className="mb-4 flex gap-2 flex-wrap">
              {friendGroups.map((group) => (
                <button
                  key={group.group_name}
                  onClick={() => setSelectedGroup(group.group_name)}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  {group.group_name} ({group.count})
                </button>
              ))}
            </div>
          )}

          {/* 好友卡片列表 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {friends.length === 0 ? (
              <div className="col-span-full text-center py-16">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                  <Users className="w-12 h-12 text-gray-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  {selectedGroup ? (t('friends.noFriendsInGroup') || '该分组暂无好友') : (t('friends.noFriends') || '暂无好友')}
                </p>
                <button
                  onClick={() => setShowAddFriend(true)}
                  className="mt-4 btn btn-primary"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t('friends.addFriend') || '添加好友'}
                </button>
              </div>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="card p-4 hover:shadow-lg transition-all cursor-pointer group border border-gray-200 dark:border-gray-700"
                  onClick={() => navigate(`/messages?userId=${friend.friend_id}`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-md flex-shrink-0">
                      {(friend.remark || friend.friend_nickname || friend.friend_username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {friend.remark || friend.friend_nickname || friend.friend_username}
                      </div>
                      {friend.remark && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {friend.friend_nickname || friend.friend_username}
                        </div>
                      )}
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                        {friend.friend_email}
                      </div>
                      {friend.group_name_display && (
                        <div className="mt-2">
                          <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                            {friend.group_name_display}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditFriend(friend);
                        }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        title={t('friends.edit') || '编辑'}
                      >
                        <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/messages?userId=${friend.friend_id}`);
                        }}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg"
                        title={t('friends.sendMessage') || '发消息'}
                      >
                        <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFriend(friend.friend_id);
                        }}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                        title={t('friends.delete') || '删除'}
                      >
                        <UserMinus className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 好友请求列表（合并收到的和发送的） */}
      {activeTab === 'requests' && (
        <div>
          {/* 筛选按钮 */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setRequestFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                requestFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('friends.all')} ({receivedRequests.length + sentRequests.length})
            </button>
            <button
              onClick={() => setRequestFilter('received')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                requestFilter === 'received'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('friends.received')} ({receivedRequests.length})
            </button>
            <button
              onClick={() => setRequestFilter('sent')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                requestFilter === 'sent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('friends.sent')} ({sentRequests.length})
            </button>
          </div>

          {/* 请求列表 */}
          <div className="space-y-3">
            {(() => {
              // 根据筛选条件合并和过滤请求
              const allRequests = [
                ...receivedRequests.map(req => ({ ...req, requestType: 'received' as const })),
                ...sentRequests.map(req => ({ ...req, requestType: 'sent' as const })),
              ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

              const filteredRequests = requestFilter === 'all' 
                ? allRequests
                : allRequests.filter(req => req.requestType === requestFilter);

              if (filteredRequests.length === 0) {
                return (
                  <div className="text-center py-16">
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                      <Mail className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-lg">
                      {requestFilter === 'all' 
                        ? (t('friends.noRequests') || '暂无好友请求')
                        : requestFilter === 'received'
                        ? (t('friends.noReceivedRequests') || '暂无收到的请求')
                        : (t('friends.noSentRequests') || '暂无发送的请求')}
                    </p>
                  </div>
                );
              }

              return filteredRequests.map((request) => {
                const isReceived = request.requestType === 'received';
                const displayName = isReceived 
                  ? (request.user_nickname || request.user_username)
                  : (request.friend_nickname || request.friend_username);
                const displayEmail = isReceived 
                  ? request.user_email
                  : request.friend_email;

                return (
                  <div key={request.id} className="card p-4 hover:shadow-md transition-all">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl shadow-md flex-shrink-0">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {displayName}
                              </div>
                              {/* 请求类型标签 */}
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                isReceived
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              }`}>
                                {isReceived ? t('friends.received') : t('friends.sent')}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {displayEmail}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(request.created_at)}
                          </div>
                        </div>
                        {request.message && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border-l-4 border-blue-500">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                                {request.message}
                              </p>
                            </div>
                          </div>
                        )}
                        {/* 操作按钮 - 只有收到的请求才显示接受/拒绝 */}
                        {isReceived && (
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => acceptRequest(request.id)}
                              className="btn btn-sm btn-primary flex items-center gap-2 flex-1"
                            >
                              <Check className="w-4 h-4" />
                              {t('friends.accept') || '接受'}
                            </button>
                            <button
                              onClick={() => declineRequest(request.id)}
                              className="btn btn-sm btn-secondary flex items-center gap-2 flex-1"
                            >
                              <XCircle className="w-4 h-4" />
                              {t('friends.decline') || '拒绝'}
                            </button>
                          </div>
                        )}
                        {/* 发送的请求显示待处理状态 */}
                        {!isReceived && (
                          <div className="mt-4">
                            <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs rounded-full font-medium">
                              {t('friends.pending') || '待处理'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* 发送好友请求模态框 */}
      {showRequestModal && selectedUser && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowRequestModal(false);
            setSelectedUser(null);
            setRequestMessage('');
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('friends.sendRequest') || '发送好友请求'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowRequestModal(false);
                  setSelectedUser(null);
                  setRequestMessage('');
                }}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                  {(selectedUser.nickname || selectedUser.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                    {selectedUser.nickname || selectedUser.username}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedUser.email}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('friends.requestMessage') || '验证消息'} ({t('common.optional') || '可选'})
              </label>
              <textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                className="input w-full min-h-[100px] resize-none"
                placeholder={t('friends.requestMessagePlaceholder') || '请输入验证消息...'}
                maxLength={200}
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                {requestMessage.length}/200
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRequestModal(false);
                  setSelectedUser(null);
                  setRequestMessage('');
                }}
                className="btn btn-secondary flex-1"
              >
                {t('common.cancel') || '取消'}
              </button>
              <button
                type="button"
                onClick={sendFriendRequest}
                className="btn btn-primary flex-1"
              >
                {t('friends.send') || '发送'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑好友信息模态框 */}
      {editingFriend && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingFriend(null);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('friends.editFriend') || '编辑好友信息'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingFriend(null)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('friends.remark') || '备注名称'}
                </label>
                <input
                  type="text"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="input w-full"
                  placeholder={t('friends.remarkPlaceholder') || '输入备注名称（可选）'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('friends.group') || '分组'}
                </label>
                <div className="flex gap-2">
                  <select
                    value={editGroupName}
                    onChange={(e) => {
                      setEditGroupName(e.target.value);
                      setNewGroupName('');
                    }}
                    className="input flex-1"
                  >
                    <option value="">{t('friends.noGroup') || '无分组'}</option>
                    {friendGroups.map((group) => (
                      <option key={group.group_name} value={group.group_name}>
                        {group.group_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => {
                      setNewGroupName(e.target.value);
                      setEditGroupName('');
                    }}
                    className="input flex-1"
                    placeholder={t('friends.newGroup') || '新建分组'}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newGroupName.trim()) {
                        setEditGroupName(newGroupName.trim());
                        setNewGroupName('');
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingFriend(null)}
                  className="btn btn-secondary"
                >
                  {t('common.cancel') || '取消'}
                </button>
                <button
                  type="button"
                  onClick={saveFriendEdit}
                  className="btn btn-primary"
                >
                  {t('common.save') || '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
