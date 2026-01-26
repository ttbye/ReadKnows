/**
 * @file Notes.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { StickyNote, Plus, Search, Trash2, Edit, BookOpen, X, Save, Calendar, RefreshCw, Activity } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { getCoverUrl } from '../utils/coverHelper';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';
import { useTranslation } from 'react-i18next';
import { formatTimeWithTimezone } from '../utils/timezone';

interface Note {
  id: string;
  book_id: string;
  book_title?: string;
  book_author?: string;
  book_cover_url?: string;
  content: string;
  position?: string;
  page_number?: number;
  chapter_index?: number;
  selected_text?: string;
  created_at: string;
  updated_at: string;
}

export default function Notes() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [shareToGroupId, setShareToGroupId] = useState('');
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  
  // 检测是否为移动设备
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      // 立即加载笔记（关键数据）
      fetchNotes();
      // 延迟加载群组列表（非关键数据）
      const timer = setTimeout(() => {
        fetchGroups();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups');
      setAvailableGroups(response.data.groups || []);
    } catch (error: any) {
      console.error('获取群组列表失败:', error);
    }
  };

  // 检测设备类型
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
      const isAndroidDevice = /android/.test(userAgent);
      const isMobileDevice = isIOSDevice || isAndroidDevice || window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/notes', {
        timeout: 5000, // 5秒超时
      });
      setNotes(response.data.notes || []);
    } catch (error: any) {
      console.error('获取笔记失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
      if (error.statusText === 'OK (Offline Cache)' || error.statusText === 'OK (Offline, No Cache)') {
        // 使用缓存数据（API拦截器返回的响应）
        if (error.data?.notes) {
          setNotes(error.data.notes || []);
        }
      } else {
        // 只有在在线且确实失败时才显示错误
        if (navigator.onLine && error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID') {
          toast.error(error.response?.data?.error || t('notes.fetchNotesFailed'));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast.error(t('notes.enterNoteContent'));
      return;
    }

    try {
      await api.post('/notes', {
        bookId: selectedBookId && selectedBookId.trim() ? selectedBookId.trim() : null,
        content: noteContent,
        selectedText: selectedText || null,
        isPublic,
        shareToGroupId: shareToGroupId || null,
      });
      toast.success(t('notes.noteCreated'));
      setShowCreateModal(false);
      setNoteContent('');
      setSelectedBookId('');
      setSelectedText('');
      setIsPublic(false);
      setShareToGroupId('');
      fetchNotes();
    } catch (error: any) {
      console.error('创建笔记失败:', error);
      toast.error(error.response?.data?.error || t('notes.createNoteFailed'));
    }
  };

  const handleEditNote = async () => {
    if (!editingNote || !noteContent.trim()) {
      toast.error(t('notes.enterNoteContent'));
      return;
    }

    try {
      await api.post(`/notes/${editingNote.id}`, { _method: 'PUT', 
        content: noteContent,
        selectedText: selectedText || null,
        isPublic,
        shareToGroupId: shareToGroupId || null,
       });
      toast.success(t('notes.noteUpdated'));
      setShowEditModal(false);
      setEditingNote(null);
      setNoteContent('');
      setSelectedText('');
      setIsPublic(false);
      setShareToGroupId('');
      fetchNotes();
    } catch (error: any) {
      console.error('更新笔记失败:', error);
      toast.error(error.response?.data?.error || t('notes.updateNoteFailed'));
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm(t('notes.confirmDeleteNote'))) {
      return;
    }

    try {
      await api.post(`/notes/${noteId}`, { _method: 'DELETE' });
      toast.success(t('notes.noteDeleted'));
      fetchNotes();
    } catch (error: any) {
      console.error('删除笔记失败:', error);
      toast.error(error.response?.data?.error || t('notes.deleteNoteFailed'));
    }
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setNoteContent(note.content);
    setSelectedText(note.selected_text || '');
    // 从note对象获取可见性设置（如果API返回了这些字段）
    setIsPublic((note as any).is_public === 1 || false);
    setShareToGroupId((note as any).share_to_group_id || '');
    setShowEditModal(true);
  };

  const filteredNotes = notes.filter(note =>
    note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.book_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.selected_text?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchNotes();
    toast.success(
      (toastInstance) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '0.5s' }} />
          </div>
          <div>
            <div className="font-semibold text-white">{t('notes.refreshSuccess')}</div>
            <div className="text-xs text-white/80 mt-0.5">{t('notes.notesUpdated')}</div>
          </div>
        </div>
      ),
      {
        duration: 2000,
        style: {
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '16px 20px',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4), 0 4px 12px rgba(5, 150, 105, 0.3)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        },
        iconTheme: {
          primary: 'transparent',
          secondary: 'transparent',
        },
      }
    );
  };

  const { isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 计算顶部安全区域padding
  const getTopPadding = () => {
    if (!isMobile) {
      return '1.5rem'; // 桌面端：24px (pt-6)
    }
    // 移动端：安全区域 + 基础padding
    // 使用clamp确保最小值，同时适配不同设备
    return 'max(1.5rem, calc(env(safe-area-inset-top, 0px) + 1rem))';
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center"
        style={{
          paddingTop: getTopPadding(),
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />

      {/* 紧凑的页面头部 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">笔记管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchNotes(); }}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title="新建笔记"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 紧凑的统计信息 */}
      <div className="mb-4">
        <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs text-gray-600 dark:text-gray-400">笔记统计</span>
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{notes.length} 个笔记</div>
        </div>
      </div>

      {/* 紧凑的操作栏 */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="搜索笔记内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 笔记列表 - 响应式布局 */}
      {filteredNotes.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <StickyNote className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery ? '未找到匹配的笔记' : '还没有笔记'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" />
              创建第一条笔记
            </button>
          )}
        </div>
      ) : (
          <div className="space-y-2">
          {/* 桌面端网格布局 */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
              >
                {note.book_title && (
                  <Link
                    to={`/books/${note.book_id}`}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-3 flex items-center gap-1.5 transition-colors"
                  >
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{note.book_title}</span>
                    {note.book_author && (
                      <span className="text-gray-500 dark:text-gray-400 text-xs truncate ml-1">- {note.book_author}</span>
                    )}
                  </Link>
                )}

                {note.selected_text && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-gray-700 dark:text-gray-300 italic border-l-2 border-blue-500">
                    <div className="font-medium text-blue-600 dark:text-blue-400 mb-1">引用</div>
                    <div className="whitespace-pre-wrap break-words">"{note.selected_text}"</div>
                  </div>
                )}

                <p className="text-gray-700 dark:text-gray-300 mb-3 line-clamp-3 text-sm leading-relaxed">
                  {note.content}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatTimeWithTimezone(note.created_at, {
                      showTime: false,
                      showDate: true,
                      relative: false,
                    })}</span>
                  </div>
                  {note.page_number && (
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">第{note.page_number}页</span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <Link
                    to={`/reader/${note.book_id}`}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                  >
                    继续阅读
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(note)}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 移动端卡片列表 */}
          <div className="md:hidden space-y-2">
            {filteredNotes.map((note) => (
              <div key={note.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {note.book_title && (
                      <Link
                        to={`/books/${note.book_id}`}
                        className="flex items-center gap-1.5 min-w-0 flex-1"
                      >
                        <BookOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate block">{note.book_title}</span>
                          {note.book_author && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{note.book_author}</span>
                          )}
                        </div>
                      </Link>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditModal(note)}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {note.selected_text && (
                  <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-gray-700 dark:text-gray-300 italic border-l-2 border-blue-500">
                    <div className="font-medium text-blue-600 dark:text-blue-400 mb-1">引用</div>
                    <div className="whitespace-pre-wrap break-words">"{note.selected_text}"</div>
                  </div>
                )}

                <p className="text-gray-700 dark:text-gray-300 mb-2 line-clamp-2 text-sm leading-relaxed">
                  {note.content}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatTimeWithTimezone(note.created_at, {
                      showTime: false,
                      showDate: true,
                      relative: false,
                    })}</span>
                  </div>
                  {note.page_number && (
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">第{note.page_number}页</span>
                  )}
                </div>

                {note.book_id && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <Link
                      to={`/reader/${note.book_id}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                    >
                      继续阅读 →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 创建笔记弹窗 */}
      {showCreateModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"
            style={{
              paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
                ? `max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 8px)`
                : 'max(env(safe-area-inset-top, 0px), 8px)',
              paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
                ? `max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 8px)`
                : 'max(env(safe-area-inset-bottom, 0px), 8px)',
              paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
              paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
            }}
          >
            <div 
              className="card-gradient rounded-xl sm:rounded-lg max-w-2xl w-full flex flex-col shadow-2xl"
              style={{
                maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
                  ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 8px) - max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 8px) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
                  : 'calc(90vh - 2rem)',
              }}
            >
              <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('notes.createNote')}</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNoteContent('');
                    setSelectedBookId('');
                    setSelectedText('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{t('notes.selectBook')}</label>
                <input
                  type="text"
                  placeholder={t('notes.bookIdPlaceholder')}
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{t('notes.selectedText')}</label>
                <textarea
                  placeholder={t('notes.selectedTextPlaceholder')}
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={2}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{t('notes.noteContent')}</label>
                <textarea
                  placeholder={t('notes.noteContentPlaceholder')}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={3}
                  autoFocus
                />
              </div>
              
              <div 
                className="flex justify-end gap-2 mt-4"
                style={{
                  paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
                    ? `calc(1rem + ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
                    : '1rem'
                }}
              >
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNoteContent('');
                    setSelectedBookId('');
                    setSelectedText('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateNote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑笔记弹窗 */}
      {showEditModal && editingNote && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"
            style={{
              paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
                ? `max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 8px)`
                : 'max(env(safe-area-inset-top, 0px), 8px)',
              paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
                ? `max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 8px)`
                : 'max(env(safe-area-inset-bottom, 0px), 8px)',
              paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
              paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
            }}
          >
            <div 
              className="card-gradient rounded-xl sm:rounded-lg max-w-2xl w-full flex flex-col shadow-2xl"
              style={{
                maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
                  ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 8px) - max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 8px) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
                  : 'calc(90vh - 2rem)',
              }}
            >
              <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('notes.editNote')}</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingNote(null);
                    setNoteContent('');
                    setSelectedText('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {editingNote.selected_text && (
                <div className="mb-4 p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-blue-500">
                  "{editingNote.selected_text}"
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{t('notes.selectedText')}</label>
                <textarea
                  placeholder={t('notes.selectedTextPlaceholder')}
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={2}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">{t('notes.noteContent')}</label>
                <textarea
                  placeholder={t('notes.noteContentPlaceholder')}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={3}
                  autoFocus
                />
              </div>

              {/* 可见性设置 */}
              <div className="mb-4 space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPublicNoteEdit"
                    checked={isPublic}
                    onChange={(e) => {
                      setIsPublic(e.target.checked);
                      if (e.target.checked) {
                        setShareToGroupId(''); // 如果设为公开，清除群组分享
                      }
                    }}
                    className="h-4 w-4 text-blue-600"
                  />
                  <label htmlFor="isPublicNoteEdit" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    {t('notes.isPublic') || '公开笔记（所有用户可见）'}
                  </label>
                </div>
                {!isPublic && availableGroups.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                      {t('notes.shareToGroup') || '分享给群组（可选）'}
                    </label>
                    <select
                      value={shareToGroupId}
                      onChange={(e) => setShareToGroupId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                    >
                      <option value="">{t('notes.noGroupShare') || '不分享给群组'}</option>
                      {availableGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              
              <div 
                className="flex justify-end gap-2 mt-4"
                style={{
                  paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
                    ? `calc(1rem + ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
                    : '1rem'
                }}
              >
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingNote(null);
                    setNoteContent('');
                    setSelectedText('');
                    setIsPublic(false);
                    setShareToGroupId('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleUpdateNote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
