/**
 * @file GroupManagement.tsx
 * @author ttbye
 * @date 2025-12-30
 * @description 群组管理页面
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Users, Plus, Search, Settings, UserPlus, UserMinus, Crown, User, X, Edit2, Trash2, Globe, Lock, Mail, Check, XCircle, BookOpen, UserCog, BellOff, Bell, MessageCircle, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Group {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  is_public: number;
  user_role: string;
  joined_at: string;
  member_count: number;
  is_member?: number;
}

interface GroupMember {
  id: string;
  username: string;
  email: string;
  nickname: string;
  role: string;
  joined_at: string;
}

interface GroupInvitation {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  message: string;
  created_at: string;
  inviter_username: string;
  inviter_nickname: string;
  inviter_email: string;
  group_name: string;
  group_description: string;
  group_is_public: number;
}

interface GroupBook {
  id: string;
  title: string;
  author: string;
  cover_path: string;
  uploader_username: string;
  uploader_nickname: string;
  created_at: string;
}

export default function GroupManagement() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showPublicGroups, setShowPublicGroups] = useState(false);
  const [publicGroups, setPublicGroups] = useState<Group[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearchKeyword, setInviteSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [inviteMessage, setInviteMessage] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [pendingInvitation, setPendingInvitation] = useState<GroupInvitation | null>(null);
  const [showGroupDetail, setShowGroupDetail] = useState(false);
  const [groupBooks, setGroupBooks] = useState<GroupBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [groupMuted, setGroupMuted] = useState<boolean | null>(null);
  const [transferMembers, setTransferMembers] = useState<GroupMember[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);

  // 检测PWA模式
  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = (window.navigator as any).standalone === true; // iOS Safari
      setIsPWA(isStandalone || isFullscreen);
    };
    checkPWA();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkPWA);
    return () => mediaQuery.removeEventListener('change', checkPWA);
  }, []);

  // 计算顶部安全区域
  const getTopSafeArea = () => {
    if (typeof window === 'undefined') return '0px';
    const isMobile = window.innerWidth < 1024;
    
    if (isMobile) {
      // 移动端/iPad：安全区域 + 顶部导航栏高度（44px）
      return 'calc(clamp(20px, env(safe-area-inset-top, 20px), 44px) + 44px)';
    } else {
      // PC端：顶部导航栏高度（56px）+ PWA模式下的安全区域
      const safeAreaTop = isPWA ? 'env(safe-area-inset-top, 0px)' : '0px';
      return `calc(56px + ${safeAreaTop})`;
    }
  };

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    isPublic: false,
  });

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    isPublic: false,
  });

  useEffect(() => {
    // 延迟加载，避免阻塞页面渲染
    const timer = setTimeout(() => {
      fetchGroups();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // 检查URL参数中的邀请ID
  useEffect(() => {
    const invitationId = searchParams.get('invitationId');
    const groupId = searchParams.get('groupId');
    
    if (invitationId && groupId) {
      fetchInvitation(invitationId, groupId);
    }
  }, [searchParams, groups]);

  // 邀请弹窗打开时加载可邀请的好友列表（不依赖 handleInviteClick 的时序，确保有数据）
  useEffect(() => {
    if (showInviteModal && selectedGroup) {
      setSearchResults([]);
      fetchInvitableFriends(selectedGroup, undefined);
    }
  }, [showInviteModal, selectedGroup]);

  // 群组详情页：加载静音状态
  useEffect(() => {
    if (!showGroupDetail || !selectedGroup?.id) {
      setGroupMuted(null);
      return;
    }
    api.get(`/groups/${selectedGroup.id}/mute`)
      .then((res) => setGroupMuted(!!res.data?.muted))
      .catch(() => setGroupMuted(false));
  }, [showGroupDetail, selectedGroup?.id]);

  // 转让群主弹窗：加载成员列表（排除自己）
  useEffect(() => {
    if (!showTransferModal || !selectedGroup?.id) return;
    setTransferLoading(true);
    api.get(`/groups/${selectedGroup.id}/members`)
      .then((res) => {
        const list = (res.data?.members || []) as GroupMember[];
        setTransferMembers(list.filter((m) => m.id && m.id !== user?.id));
      })
      .catch(() => setTransferMembers([]))
      .finally(() => setTransferLoading(false));
  }, [showTransferModal, selectedGroup?.id, user?.id]);

  // 获取邀请信息
  const fetchInvitation = async (invitationId: string, groupId: string) => {
    try {
      const response = await api.get('/groups/invitations/received');
      const invitations = response.data.invitations || [];
      const invitation = invitations.find((inv: GroupInvitation) => inv.id === invitationId && inv.group_id === groupId);
      
      if (invitation) {
        setPendingInvitation(invitation);
        // 从邀请信息中获取群组信息，或从groups列表中查找
        let group = groups.find(g => g.id === groupId);
        if (!group && invitation.group_name) {
          // 如果groups列表中没有，使用邀请信息创建临时群组对象
          group = {
            id: invitation.group_id,
            name: invitation.group_name,
            description: invitation.group_description || '',
            creator_id: '',
            is_public: invitation.group_is_public || 0,
            user_role: 'member',
            joined_at: new Date().toISOString(),
            member_count: 0,
          };
        }
        if (group) {
          setSelectedGroup(group);
          setShowGroupDetail(true);
          // 如果用户已经是成员，加载书籍
          if (group.user_role !== undefined) {
            fetchGroupBooks(group.id);
          }
        }
      }
    } catch (error: any) {
      console.error('获取邀请信息失败:', error);
    }
  };

  // 接受邀请
  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await api.post(`/groups/invitations/${invitationId}/accept`);
      toast.success(t('groups.acceptSuccess') || '已成功加入群组');
      setPendingInvitation(null);
      setSearchParams({});
      await fetchGroups();
      if (selectedGroup) {
        fetchGroupBooks(selectedGroup.id);
      }
    } catch (error: any) {
      console.error('接受邀请失败:', error);
      toast.error(error.response?.data?.error || t('groups.acceptFailed') || '接受邀请失败');
    }
  };

  // 拒绝邀请
  const handleDeclineInvitation = async (invitationId: string) => {
    if (!confirm(t('groups.declineConfirm') || '确定要拒绝此邀请吗？')) {
      return;
    }

    try {
      await api.post(`/groups/invitations/${invitationId}/decline`);
      toast.success(t('groups.declineSuccess') || '已拒绝邀请');
      setPendingInvitation(null);
      setSearchParams({});
    } catch (error: any) {
      console.error('拒绝邀请失败:', error);
      toast.error(error.response?.data?.error || t('groups.declineFailed') || '拒绝邀请失败');
    }
  };

  // 获取群组书籍
  const fetchGroupBooks = async (groupId: string) => {
    try {
      setLoadingBooks(true);
      const response = await api.get(`/groups/${groupId}/books`, {
        params: { page: 1, limit: 20 }
      });
      setGroupBooks(response.data.books || []);
    } catch (error: any) {
      console.error('获取群组书籍失败:', error);
      setGroupBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  };

  // 查看群组详情
  const handleViewGroupDetail = async (group: Group) => {
    setSelectedGroup(group);
    setShowGroupDetail(true);
    await fetchGroupBooks(group.id);
  };

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/groups', {
        timeout: 10000, // 10秒超时，给数据库查询更多时间
      });
      
      console.log('获取群组列表完整响应:', response);
      console.log('获取群组列表响应数据:', response.data);
      
      // 处理不同的响应格式
      let groups: any[] = [];
      if (Array.isArray(response.data)) {
        // 如果响应直接是数组
        groups = response.data;
      } else if (response.data && Array.isArray(response.data.groups)) {
        // 如果是 {groups: [...]} 格式
        groups = response.data.groups;
      } else if (response.data && Array.isArray(response.data.data)) {
        // 如果是 {data: [...]} 格式（可能是拦截器返回的）
        groups = response.data.data;
      } else {
        groups = [];
      }
      
      console.log('解析的群组列表:', groups);
      console.log('群组数量:', groups.length);
      
      // 确保每个群组都有必需的字段
      const validGroups = groups.filter((g: any) => {
        if (!g || !g.id || !g.name) {
          console.warn('过滤无效群组:', g);
          return false;
        }
        return true;
      }).map((g: any): Group => ({
        id: g.id,
        name: g.name,
        description: g.description || '',
        creator_id: g.creator_id || '',
        is_public: g.is_public !== undefined ? (typeof g.is_public === 'number' ? g.is_public : (g.is_public ? 1 : 0)) : 0,
        user_role: g.user_role || 'member',
        joined_at: g.joined_at || new Date().toISOString(),
        member_count: g.member_count || 0,
      }));
      
      console.log('验证后的群组列表:', validGroups);
      setGroups(validGroups);
    } catch (error: any) {
      console.error('获取群组列表失败:', error);
      console.error('错误详情:', error.response?.data);
      console.error('错误状态码:', error.response?.status);
      console.error('错误代码:', error.code);
      console.error('错误消息:', error.message);
      
      // 如果是500错误，可能是后端问题，显示错误提示
      if (error.response?.status === 500) {
        toast.error(t('groups.fetchFailed') || '获取群组列表失败: 服务器错误');
      } else if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID' && error.code !== 'ECONNABORTED') {
        toast.error(t('groups.fetchFailed') || '获取群组列表失败');
      }
      
      // 网络错误时也设置空数组，避免显示错误状态
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPublicGroups = async () => {
    try {
      const response = await api.get('/groups/public/search', {
        params: { keyword: searchKeyword },
      });
      setPublicGroups(response.data.groups || []);
    } catch (error: any) {
      console.error('搜索公开群组失败:', error);
      toast.error(t('groups.searchFailed') || '搜索公开群组失败');
    }
  };

  const handleCreateGroup = async () => {
    if (!createForm.name.trim()) {
      toast.error(t('groups.nameRequired') || '群组名称不能为空');
      return;
    }

    try {
      const response = await api.post('/groups', {
        name: createForm.name.trim(),
        description: createForm.description || '',
        isPublic: createForm.isPublic || false,
      }, {
        timeout: 10000, // 10秒超时，给后端更多时间
      });
      
      console.log('创建群组完整响应:', response);
      console.log('创建群组响应数据:', response.data);
      
      // 如果响应中包含群组信息，立即添加到列表中
      if (response.data && response.data.group) {
        const newGroup = response.data.group;
        console.log('从响应中获取的群组:', newGroup);
        // 确保数据格式正确
        const formattedGroup: Group = {
          id: newGroup.id,
          name: newGroup.name,
          description: newGroup.description || '',
          creator_id: newGroup.creator_id,
          is_public: newGroup.is_public !== undefined ? (typeof newGroup.is_public === 'number' ? newGroup.is_public : (newGroup.is_public ? 1 : 0)) : 0,
          user_role: newGroup.user_role || 'admin',
          joined_at: newGroup.joined_at || new Date().toISOString(),
          member_count: newGroup.member_count || 1,
        };
        console.log('格式化后的群组:', formattedGroup);
        // 检查是否已存在，避免重复添加
        setGroups(prev => {
          const exists = prev.some(g => g.id === formattedGroup.id);
          if (exists) {
            console.log('群组已存在，跳过添加');
            return prev;
          }
          console.log('添加新群组到列表');
          return [formattedGroup, ...prev];
        });
      } else {
        console.warn('响应中没有群组信息，response.data:', response.data);
      }
      
      toast.success(t('groups.createSuccess') || '群组创建成功');
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', isPublic: false });
      
      // 延迟刷新列表，确保后端数据已更新（如果上面已经添加了，这里只是确保同步）
      setTimeout(async () => {
        try {
          await fetchGroups();
        } catch (error) {
          console.error('刷新群组列表失败:', error);
          // 静默失败，因为已经添加到列表了
        }
      }, 300);
    } catch (error: any) {
      console.error('创建群组失败:', error);
      console.error('错误详情:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.message || t('groups.createFailed') || '创建群组失败';
      toast.error(errorMessage);
    }
  };

  const handleEditGroup = async () => {
    if (!selectedGroup || !editForm.name.trim()) {
      toast.error(t('groups.nameRequired') || '群组名称不能为空');
      return;
    }

    try {
      await api.post(`/groups/${selectedGroup.id}`, { _method: 'PUT', 
        name: editForm.name.trim(),
        description: editForm.description || '',
        isPublic: editForm.isPublic || false,
       });
      toast.success(t('groups.updateSuccess') || '群组信息更新成功');
      setShowEditModal(false);
      setSelectedGroup(null);
      await fetchGroups();
    } catch (error: any) {
      console.error('更新群组失败:', error);
      const errorMessage = error.response?.data?.error || error.message || t('groups.updateFailed') || '更新群组失败';
      toast.error(errorMessage);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm(t('groups.deleteConfirm') || '确定要删除此群组吗？此操作不可恢复。')) {
      return;
    }

    try {
      await api.post(`/groups/${groupId}`, { _method: 'DELETE' });
      toast.success(t('groups.deleteSuccess') || '群组删除成功');
      await fetchGroups();
      if (selectedGroup?.id === groupId) {
        setShowGroupDetail(false);
        setSelectedGroup(null);
      }
    } catch (error: any) {
      console.error('删除群组失败:', error);
      toast.error(error.response?.data?.error || t('groups.deleteFailed') || '删除群组失败');
    }
  };

  const handleTransferOwner = async (groupId: string, newOwnerId: string) => {
    try {
      await api.post(`/groups/${groupId}/transfer`, { newOwnerId });
      toast.success(t('groups.transferSuccess') || '群主转让成功');
      setShowTransferModal(false);
      await fetchGroups();
      if (selectedGroup?.id === groupId) {
        const res = await api.get(`/groups/${groupId}`);
        setSelectedGroup(res.data.group);
      }
    } catch (error: any) {
      console.error('转让群主失败:', error);
      toast.error(error.response?.data?.error || (t('groups.transferFailed') || '转让群主失败'));
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!confirm(t('groups.leaveConfirm') || '确定要退出此群组吗？')) {
      return;
    }

    try {
      await api.post(`/groups/${groupId}/leave`);
      toast.success(t('groups.leaveSuccess') || '已成功退出群组');
      fetchGroups();
    } catch (error: any) {
      console.error('退出群组失败:', error);
      toast.error(error.response?.data?.error || t('groups.leaveFailed') || '退出群组失败');
    }
  };

  const handleViewMembers = async (group: Group) => {
    setSelectedGroup(group);
    try {
      const response = await api.get(`/groups/${group.id}`);
      setMembers(response.data.members || []);
      setShowMembersModal(true);
    } catch (error: any) {
      console.error('获取成员列表失败:', error);
      toast.error(t('groups.fetchMembersFailed') || '获取成员列表失败');
    }
  };

  const handleEditClick = (group: Group) => {
    setSelectedGroup(group);
    setEditForm({
      name: group.name,
      description: group.description || '',
      isPublic: group.is_public === 1,
    });
    setShowEditModal(true);
  };

  const handleJoinPublicGroup = async (groupId: string) => {
    try {
      // 这里需要先获取用户ID，然后添加到群组
      // 由于API需要userId，我们需要从authStore获取或通过其他方式
      const currentUser = user;
      if (!currentUser?.id) {
        toast.error(t('groups.userNotFound') || '用户信息不存在');
        return;
      }

      await api.post(`/groups/${groupId}/members`, {
        userId: currentUser.id,
        role: 'member',
      });
      toast.success(t('groups.joinSuccess') || '加入群组成功');
      fetchGroups();
      setShowPublicGroups(false);
    } catch (error: any) {
      console.error('加入群组失败:', error);
      toast.error(error.response?.data?.error || t('groups.joinFailed') || '加入群组失败');
    }
  };

  const handleInviteClick = (group: Group) => {
    setSelectedGroup(group);
    setShowInviteModal(true);
    setInviteSearchKeyword('');
    setSearchResults([]);
    setInviteMessage('');
    setSearchingUsers(true);
    // 可邀请好友列表由 useEffect(showInviteModal, selectedGroup) 统一加载
  };

  const fetchInvitableFriends = async (group: Group | null, keyword?: string) => {
    if (!group) return;

    try {
      setSearchingUsers(true);
      const response = await api.get(`/groups/${group.id}/invitable-friends`, {
        params: keyword && keyword.trim() ? { keyword: keyword.trim() } : {}
      });
      setSearchResults(response.data.friends || []);
    } catch (error: any) {
      console.error('获取可邀请的好友列表失败:', error);
      toast.error(error.response?.data?.error || t('groups.fetchFriendsFailed') || '获取好友列表失败');
      setSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleInviteUser = async (inviteeId: string) => {
    if (!selectedGroup) return;

    try {
      await api.post(`/groups/${selectedGroup.id}/invitations`, {
        inviteeId,
        message: inviteMessage.trim() || undefined,
      });
      toast.success(t('groups.inviteSuccess') || '邀请已发送');
      setInviteSearchKeyword('');
      setSearchResults([]);
      setInviteMessage('');
      // 可以选择是否关闭模态框
      // setShowInviteModal(false);
    } catch (error: any) {
      console.error('发送邀请失败:', error);
      toast.error(error.response?.data?.error || t('groups.inviteFailed') || '发送邀请失败');
    }
  };

  const filteredGroups = groups.filter((group) => {
    if (!group || !group.id || !group.name) {
      console.warn('无效的群组数据:', group);
      return false;
    }
    if (!searchKeyword.trim()) {
      return true; // 没有搜索关键词时显示所有群组
    }
    return group.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
           (group.description || '').toLowerCase().includes(searchKeyword.toLowerCase());
  });
  
  // 调试日志
  if (process.env.NODE_ENV === 'development') {
    console.log('群组列表状态:', {
      groupsCount: groups.length,
      filteredCount: filteredGroups.length,
      searchKeyword,
      groups: groups.map(g => ({ id: g.id, name: g.name }))
    });
  }

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
    <>
    {showGroupDetail && selectedGroup ? (
      <div className="container mx-auto px-4 py-8" style={{ paddingTop: getTopSafeArea() }}>
        <div className="mb-6">
          <button
            onClick={() => {
              setShowGroupDetail(false);
              setSelectedGroup(null);
              setSearchParams({});
            }}
            className="btn btn-secondary flex items-center gap-2 mb-4"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('common.back') || '返回'}
          </button>
          
          {/* 待处理邀请提示 */}
          {pendingInvitation && pendingInvitation.status === 'pending' && (
            <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 mb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Mail className="w-6 h-6 text-blue-600" />
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {t('groups.pendingInvitation') || '待处理的群组邀请'}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {pendingInvitation.inviter_nickname || pendingInvitation.inviter_username} {t('groups.invitedYou') || '邀请您加入'}
                      </div>
                    </div>
                  </div>
                  {pendingInvitation.message && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mt-2 mb-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {pendingInvitation.message}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAcceptInvitation(pendingInvitation.id)}
                      className="btn btn-sm btn-primary flex items-center gap-1"
                    >
                      <Check className="w-4 h-4" />
                      {t('groups.accept') || '接受'}
                    </button>
                    <button
                      onClick={() => handleDeclineInvitation(pendingInvitation.id)}
                      className="btn btn-sm btn-secondary flex items-center gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      {t('groups.decline') || '拒绝'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 群组信息 */}
          <div className="card mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-2">
                  {selectedGroup.is_public === 1 ? (
                    <Globe className="w-6 h-6 text-blue-500" />
                  ) : (
                    <Lock className="w-6 h-6 text-gray-500" />
                  )}
                  {selectedGroup.name}
                </h2>
                {selectedGroup.description && (
                  <p className="text-gray-600 dark:text-gray-400 mb-3">
                    {selectedGroup.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {selectedGroup.member_count} {t('groups.members') || '成员'}
                  </span>
                  {selectedGroup.user_role === 'admin' && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <Crown className="w-4 h-4" />
                      {t('groups.admin') || '管理员'}
                    </span>
                  )}
                  {selectedGroup.creator_id === user?.id && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Crown className="w-4 h-4" />
                      {t('groups.owner') || '群主'}
                    </span>
                  )}
                  {(selectedGroup.user_role === 'admin' || selectedGroup.user_role === 'member') && (
                    <button
                      type="button"
                      onClick={() => {
                        setInviteSearchKeyword('');
                        setSearchResults([]);
                        setInviteMessage('');
                        setSearchingUsers(true);
                        setShowInviteModal(true);
                      }}
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <UserPlus className="w-4 h-4" />
                      {t('groups.invite') || '邀请'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 操作 / 群消息管理 */}
            <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => handleViewMembers(selectedGroup)}
                className="btn btn-sm btn-secondary flex items-center gap-1"
              >
                <Users className="w-4 h-4" />
                {t('groups.viewMembers') || '查看成员'}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/chat/group/${selectedGroup.id}`)}
                className="btn btn-sm btn-secondary flex items-center gap-1"
              >
                <MessageCircle className="w-4 h-4" />
                {t('groups.enterChat') || '进入群聊'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (groupMuted == null) return;
                  try {
                    await api.post(`/groups/${selectedGroup.id}/mute`, { _method: 'PUT',  muted: !groupMuted  });
                    setGroupMuted(!groupMuted);
                    toast.success(groupMuted ? (t('groups.unmuted') || '已取消静音') : (t('groups.muted') || '已静音'));
                  } catch (e) {
                    toast.error(t('groups.muteFailed') || '操作失败');
                  }
                }}
                disabled={groupMuted == null}
                className="btn btn-sm btn-secondary flex items-center gap-1"
              >
                {groupMuted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                {groupMuted ? (t('groups.unmute') || '取消静音') : (t('groups.mute') || '静音')}
              </button>
              {selectedGroup.user_role === 'admin' && (
                <button type="button" onClick={() => handleEditClick(selectedGroup)} className="btn btn-sm btn-secondary flex items-center gap-1">
                  <Edit2 className="w-4 h-4" />
                  {t('groups.edit') || '编辑'}
                </button>
              )}
              {selectedGroup.creator_id === user?.id && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(true)}
                    className="btn btn-sm btn-secondary flex items-center gap-1"
                  >
                    <UserCog className="w-4 h-4" />
                    {t('groups.transferOwner') || '转让群主'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(selectedGroup.id)}
                    className="btn btn-sm flex items-center gap-1 font-medium transition-colors bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('groups.delete') || '删除群组'}
                  </button>
                </>
              )}
              {selectedGroup.creator_id !== user?.id && (
                <button
                  type="button"
                  onClick={() => handleLeaveGroup(selectedGroup.id)}
                  className="btn btn-sm flex items-center gap-1 font-medium transition-colors bg-red-50 hover:bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
                >
                  <UserMinus className="w-4 h-4" />
                  {t('groups.leave') || '退出群组'}
                </button>
              )}
            </div>
          </div>

          {/* 群组书籍推荐 */}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
              <BookOpen className="w-6 h-6" />
              {t('groups.groupBooks') || '群组书籍推荐'}
            </h3>
            {loadingBooks ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : groupBooks.length === 0 ? (
              <div className="card text-center py-12 text-gray-500 dark:text-gray-400">
                <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t('groups.noGroupBooks') || '该群组暂无推荐的书籍'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groupBooks.map((book) => (
                  <div
                    key={book.id}
                    className="card hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => navigate(`/books/${book.id}`)}
                  >
                    <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-lg mb-3 overflow-hidden">
                      {book.cover_path ? (
                        <img
                          src={`/api${book.cover_path}`}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <BookOpen className="w-12 h-12" />
                        </div>
                      )}
                    </div>
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
                      {book.title}
                    </h4>
                    {book.author && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {book.author}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('groups.uploadedBy') || '上传者'}: {book.uploader_nickname || book.uploader_username}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : (
    <div 
      className="container mx-auto px-4 py-8"
      style={{ 
        paddingTop: getTopSafeArea(),
      }}
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Users className="w-8 h-8" />
          {t('groups.title') || '群组管理'}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPublicGroups(!showPublicGroups)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Globe className="w-4 h-4" />
            {showPublicGroups ? t('groups.myGroups') || '我的群组' : t('groups.publicGroups') || '公开群组'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('groups.createGroup') || '创建群组'}
          </button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
          <input
            type="text"
            placeholder={t('groups.searchPlaceholder') || '搜索群组...'}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="input pl-10 md:pl-11 w-full"
          />
        </div>
      </div>

      {/* 群组列表 */}
      {!showPublicGroups ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
              {searchKeyword ? t('groups.noResults') || '没有找到匹配的群组' : t('groups.noGroups') || '您还没有加入任何群组'}
              {process.env.NODE_ENV === 'development' && (
                <div className="mt-2 text-xs">
                  调试信息: groups.length={groups.length}, filteredGroups.length={filteredGroups.length}
                </div>
              )}
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div
                key={group.id}
                className="card hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"
              >
                {/* 卡片头部 */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-1">
                      {group.is_public === 1 ? (
                        <Globe className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Lock className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      )}
                      <span className="truncate">{group.name}</span>
                    </h3>
                    {group.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
                        {group.description}
                      </p>
                    )}
                  </div>
                  {group.user_role === 'admin' && (
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0" title={t('groups.admin') || '管理员'}>
                      <Crown className="w-5 h-5 text-yellow-500" />
                    </div>
                  )}
                </div>

                {/* 群组信息 */}
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">{group.member_count}</span>
                    <span>{t('groups.members') || '成员'}</span>
                  </span>
                  <span className="text-xs">
                    {new Date(group.joined_at).toLocaleDateString()}
                  </span>
                </div>

                {/* 操作按钮组 */}
                <div className="space-y-2">
                  {/* 主要操作按钮 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewGroupDetail(group)}
                      className="btn btn-sm btn-primary flex-1 flex items-center justify-center gap-1.5 font-medium"
                    >
                      <BookOpen className="w-4 h-4" />
                      {t('groups.viewDetail') || '详情'}
                    </button>
                    <button
                      onClick={() => handleInviteClick(group)}
                      className="btn btn-sm btn-secondary flex items-center gap-1.5 px-3"
                      title={t('groups.inviteUser') || '邀请用户'}
                    >
                      <UserPlus className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('groups.invite') || '邀请'}</span>
                    </button>
                    <button
                      onClick={() => handleViewMembers(group)}
                      className="btn btn-sm btn-secondary px-3"
                      title={t('groups.viewMembers') || '查看成员'}
                    >
                      <Users className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 管理员操作或退出群组 */}
                  {(group.user_role === 'admin' || group.creator_id !== user?.id) && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      {group.user_role === 'admin' && (
                        <>
                          <button
                            onClick={() => handleEditClick(group)}
                            className="btn btn-sm btn-secondary flex-1 flex items-center justify-center gap-1.5"
                            title={t('groups.edit') || '编辑群组'}
                          >
                            <Edit2 className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('groups.edit') || '编辑'}</span>
                          </button>
                          {group.creator_id === user?.id && (
                            <>
                              <button
                                onClick={() => { setSelectedGroup(group); setShowTransferModal(true); }}
                                className="btn btn-sm btn-secondary flex-1 flex items-center justify-center gap-1.5"
                                title={t('groups.transferOwner') || '转让群主'}
                              >
                                <UserCog className="w-4 h-4" />
                                <span className="hidden sm:inline">{t('groups.transfer') || '转让'}</span>
                              </button>
                              <button
                                onClick={() => handleDeleteGroup(group.id)}
                                className="btn btn-sm btn-danger flex-1 flex items-center justify-center gap-1.5"
                                title={t('groups.delete') || '删除群组'}
                              >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">{t('groups.delete') || '删除'}</span>
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {group.creator_id !== user?.id && (
                        <button
                          onClick={() => handleLeaveGroup(group.id)}
                          className="btn btn-sm w-full flex items-center justify-center gap-1.5 font-medium transition-colors bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700"
                          title={t('groups.leave') || '退出群组'}
                        >
                          <UserMinus className="w-4 h-4" />
                          {t('groups.leave') || '退出群组'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
              <input
                type="text"
                placeholder={t('groups.searchPublicGroups') || '搜索公开群组...'}
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  if (e.target.value) {
                    fetchPublicGroups();
                  }
                }}
                className="input pl-10 md:pl-11 w-full"
              />
            </div>
            <button
              onClick={fetchPublicGroups}
              className="btn btn-primary"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicGroups.map((group) => (
              <div key={group.id} className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <h3 className="text-lg font-semibold">{group.name}</h3>
                </div>
                {group.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {group.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>{group.member_count} {t('groups.members') || '成员'}</span>
                  {group.is_member === 1 && (
                    <span className="text-green-600">{t('groups.joined') || '已加入'}</span>
                  )}
                </div>
                {group.is_member !== 1 && (
                  <button
                    onClick={() => handleJoinPublicGroup(group.id)}
                    className="btn btn-primary w-full"
                  >
                    {t('groups.join') || '加入群组'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    )}

      {/* 创建群组模态框 */}
      {showCreateModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateModal(false);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('groups.createGroup') || '创建群组'}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateGroup();
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    {t('groups.name') || '群组名称'} *
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="input w-full"
                    placeholder={t('groups.namePlaceholder') || '请输入群组名称'}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                    {t('groups.description') || '群组描述'}
                  </label>
                  <textarea
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    className="input w-full"
                    rows={3}
                    placeholder={t('groups.descriptionPlaceholder') || '请输入群组描述（可选）'}
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={createForm.isPublic}
                    onChange={(e) => setCreateForm({ ...createForm, isPublic: e.target.checked })}
                    className="h-4 w-4 text-blue-600"
                  />
                  <label htmlFor="isPublic" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    {t('groups.isPublic') || '公开群组（其他用户可以搜索并加入）'}
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                  >
                    {t('common.cancel') || '取消'}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    {t('common.create') || '创建'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑群组模态框 */}
      {showEditModal && selectedGroup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEditModal(false);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('groups.editGroup') || '编辑群组'}
              </h2>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEditGroup();
              }}
            >
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('groups.name') || '群组名称'} *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input w-full"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('groups.description') || '群组描述'}
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="editIsPublic"
                  checked={editForm.isPublic}
                  onChange={(e) => setEditForm({ ...editForm, isPublic: e.target.checked })}
                  className="h-4 w-4 text-blue-600"
                />
                <label htmlFor="editIsPublic" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  {t('groups.isPublic') || '公开群组'}
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary"
                >
                  {t('common.cancel') || '取消'}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {t('common.save') || '保存'}
                </button>
              </div>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* 成员列表模态框 */}
      {showMembersModal && selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('groups.members') || '群组成员'} - {selectedGroup.name}
              </h2>
              <button
                onClick={() => setShowMembersModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                      {(member.nickname || member.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {member.nickname || member.username}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {member.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {member.id === selectedGroup.creator_id && (
                      <span className="flex items-center gap-1 text-amber-600 text-sm">
                        <Crown className="w-4 h-4" />
                        {t('groups.owner') || '群主'}
                      </span>
                    )}
                    {member.role === 'admin' && member.id !== selectedGroup.creator_id && (
                      <span className="flex items-center gap-1 text-yellow-600 text-sm">
                        <Crown className="w-4 h-4" />
                        {t('groups.admin') || '管理员'}
                      </span>
                    )}
                    {member.role === 'member' && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {t('groups.member') || '成员'}
                      </span>
                    )}
                    {selectedGroup.creator_id === user?.id && member.id !== user?.id && member.id !== selectedGroup.creator_id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(t('groups.transferConfirm') || `确定将群主转让给 ${member.nickname || member.username}？`)) {
                            handleTransferOwner(selectedGroup.id, member.id);
                            setShowMembersModal(false);
                          }
                        }}
                        className="btn btn-sm btn-primary"
                      >
                        {t('groups.transferTo') || '转让给 TA'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 邀请用户模态框 */}
      {showInviteModal && selectedGroup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInviteModal(false);
            }
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t('groups.inviteUser') || '邀请用户'} - {selectedGroup.name}
              </h2>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('groups.searchUser') || '搜索用户'}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={inviteSearchKeyword}
                    className="input w-full pl-11"
                    onChange={(e) => {
                      setInviteSearchKeyword(e.target.value);
                      // 防抖搜索（传入 selectedGroup，弹窗打开时已设置）
                      const timer = setTimeout(() => {
                        fetchInvitableFriends(selectedGroup, e.target.value);
                      }, 300);
                      return () => clearTimeout(timer);
                    }}
                    placeholder={t('groups.searchFriendPlaceholder') || '搜索好友...'}
                  />
                </div>
                {searchingUsers && (
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {t('common.searching') || '搜索中...'}
                  </div>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  {searchResults.map((friend) => (
                    <div
                      key={friend.friend_id}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                      onClick={() => handleInviteUser(friend.friend_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold">
                            {(friend.remark || friend.nickname || friend.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {friend.remark || friend.nickname || friend.username}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {friend.email}
                            </div>
                          </div>
                        </div>
                        <UserPlus className="w-4 h-4 text-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!searchingUsers && searchResults.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  {inviteSearchKeyword 
                    ? (t('groups.noFriendsFound') || '未找到好友')
                    : (t('groups.noInvitableFriends') || '没有可邀请的好友，请先添加好友')}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {t('groups.inviteMessage') || '邀请消息（可选）'}
                </label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className="input w-full"
                  rows={3}
                  placeholder={t('groups.inviteMessagePlaceholder') || '添加一条个人消息...'}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn btn-secondary"
                >
                  {t('common.close') || '关闭'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 转让群主 */}
      {showTransferModal && selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowTransferModal(false); }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('groups.transferOwner') || '转让群主'} - {selectedGroup.name}</h2>
              <button type="button" onClick={() => setShowTransferModal(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
            {transferLoading ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">{t('common.loading') || '加载中...'}</div>
            ) : transferMembers.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">{t('groups.noMemberToTransfer') || '没有可转让的成员'}</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transferMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">{(m.nickname || m.username || '?').charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{m.nickname || m.username}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{m.email || m.username}</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleTransferOwner(selectedGroup.id, m.id)} className="btn btn-sm btn-primary">
                      {t('groups.transferTo') || '转让给 TA'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
