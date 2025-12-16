/**
 * @file Notes.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { StickyNote, Plus, Search, Trash2, Edit, BookOpen, X, Save, Calendar, RefreshCw } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { getCoverUrl } from '../utils/coverHelper';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefresh';

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
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedText, setSelectedText] = useState('');
  
  // 检测是否为移动设备
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotes();
    }
  }, [isAuthenticated]);

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
      const response = await api.get('/notes');
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
        if (navigator.onLine) {
          toast.error(error.response?.data?.error || '获取笔记失败');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast.error('请输入笔记内容');
      return;
    }

    try {
      await api.post('/notes', {
        bookId: selectedBookId && selectedBookId.trim() ? selectedBookId.trim() : null,
        content: noteContent,
        selectedText: selectedText || null,
      });
      toast.success('笔记创建成功');
      setShowCreateModal(false);
      setNoteContent('');
      setSelectedBookId('');
      setSelectedText('');
      fetchNotes();
    } catch (error: any) {
      console.error('创建笔记失败:', error);
      toast.error(error.response?.data?.error || '创建笔记失败');
    }
  };

  const handleEditNote = async () => {
    if (!editingNote || !noteContent.trim()) {
      toast.error('请输入笔记内容');
      return;
    }

    try {
      await api.put(`/notes/${editingNote.id}`, {
        content: noteContent,
        selectedText: selectedText || null,
      });
      toast.success('笔记更新成功');
      setShowEditModal(false);
      setEditingNote(null);
      setNoteContent('');
      setSelectedText('');
      fetchNotes();
    } catch (error: any) {
      console.error('更新笔记失败:', error);
      toast.error(error.response?.data?.error || '更新笔记失败');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('确定要删除这条笔记吗？')) {
      return;
    }

    try {
      await api.delete(`/notes/${noteId}`);
      toast.success('笔记已删除');
      fetchNotes();
    } catch (error: any) {
      console.error('删除笔记失败:', error);
      toast.error(error.response?.data?.error || '删除笔记失败');
    }
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setNoteContent(note.content);
    setSelectedText(note.selected_text || '');
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
      (t) => (
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '0.5s' }} />
          </div>
          <div>
            <div className="font-semibold text-white">刷新成功</div>
            <div className="text-xs text-white/80 mt-0.5">笔记已更新</div>
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
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gray-50 dark:bg-gray-950"
      style={{
        paddingTop: getTopPadding(),
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))', // 底部导航栏 + 安全区域
      }}
    >
      <PullToRefreshIndicator 
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
      />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <StickyNote className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" />
            我的笔记
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            记录阅读中的思考和感悟
          </p>
        </div>

        {/* 搜索框和新建按钮 */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
          <input
            type="text"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 sm:py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all"
          />
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors shrink-0 shadow-md hover:shadow-lg"
        >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-sm sm:text-base font-medium">新建笔记</span>
        </button>
      </div>

      {/* 笔记列表 */}
      {filteredNotes.length === 0 ? (
          <div className="text-center py-16 sm:py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
              <StickyNote className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-base sm:text-lg">
            {searchQuery ? '没有找到匹配的笔记' : '还没有笔记，开始阅读并添加笔记吧'}
          </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm sm:text-base"
              >
                <Plus className="w-4 h-4" />
                创建第一条笔记
              </button>
            )}
        </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
                className="card-gradient rounded-xl p-4 sm:p-5 hover:shadow-lg dark:hover:shadow-xl transition-all duration-200"
            >
              {note.book_title && (
                <Link
                  to={`/books/${note.book_id}`}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-3 flex items-center gap-1.5 transition-colors"
                >
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{note.book_title}</span>
                  {note.book_author && (
                      <span className="text-gray-500 dark:text-gray-400 text-xs truncate"> - {note.book_author}</span>
                  )}
                </Link>
              )}
              
              {note.selected_text && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs sm:text-sm text-gray-700 dark:text-gray-300 italic border-l-3 border-blue-500 max-h-24 overflow-y-auto">
                    <div className="font-medium text-blue-600 dark:text-blue-400 mb-1 text-xs">引用：</div>
                    <div className="whitespace-pre-wrap break-words">"{note.selected_text}"</div>
                </div>
              )}
              
                <p className="text-gray-700 dark:text-gray-300 mb-4 line-clamp-4 whitespace-pre-wrap text-sm sm:text-base leading-relaxed">
                {note.content}
              </p>
              
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(note.created_at).toLocaleDateString('zh-CN', { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric' 
                    })}</span>
                </div>
                {note.page_number && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">第 {note.page_number} 页</span>
                )}
              </div>
              
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                <Link
                  to={`/reader/${note.book_id}`}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
                >
                  继续阅读
                </Link>
                  <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(note)}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建笔记弹窗 */}
      {showCreateModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"
            style={{
              paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
              paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
              paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
            }}
          >
            <div className="card-gradient rounded-xl sm:rounded-lg max-w-2xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">新建笔记</h2>
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
                <label className="block text-sm font-medium mb-2">选择书籍（可选）</label>
                <input
                  type="text"
                  placeholder="书籍ID（留空则创建独立笔记）"
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">选中的文本（可选）</label>
                <textarea
                  placeholder="记录选中的文本..."
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={2}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">笔记内容 *</label>
                <textarea
                  placeholder="输入笔记内容..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={8}
                  autoFocus
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNoteContent('');
                    setSelectedBookId('');
                    setSelectedText('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateNote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存
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
              paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
              paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
              paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
            }}
          >
            <div className="card-gradient rounded-xl sm:rounded-lg max-w-2xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">编辑笔记</h2>
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
                <label className="block text-sm font-medium mb-2">选中的文本（可选）</label>
                <textarea
                  placeholder="记录选中的文本..."
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={2}
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">笔记内容 *</label>
                <textarea
                  placeholder="输入笔记内容..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={8}
                  autoFocus
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingNote(null);
                    setNoteContent('');
                    setSelectedText('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleEditNote}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
