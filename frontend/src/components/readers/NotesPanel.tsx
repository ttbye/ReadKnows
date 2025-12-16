/**
 * @author ttbye
 * 笔记面板组件
 * 显示当前书籍的所有笔记，支持添加、编辑、删除笔记
 */

import { useEffect, useState } from 'react';
import { StickyNote, Plus, X, Edit, Trash2, Save } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Note {
  id: string;
  content: string;
  position?: string;
  page_number?: number;
  chapter_index?: number;
  selected_text?: string;
  created_at: string;
  updated_at: string;
}

interface NotesPanelProps {
  bookId: string;
  currentPage?: number;
  currentChapterIndex?: number;
  selectedText?: string;
  isVisible: boolean;
  onClose: () => void;
  onNoteClick?: (note: Note) => void;
}

export default function NotesPanel({
  bookId,
  currentPage,
  currentChapterIndex,
  selectedText,
  isVisible,
  onClose,
  onNoteClick,
}: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteSelectedText, setNoteSelectedText] = useState('');

  useEffect(() => {
    if (isVisible && bookId) {
      fetchNotes();
    }
  }, [isVisible, bookId]);

  useEffect(() => {
    if (showCreateModal && selectedText) {
      setNoteSelectedText(selectedText);
    }
  }, [showCreateModal, selectedText]);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/notes/book/${bookId}`);
      setNotes(response.data.notes || []);
    } catch (error: any) {
      console.error('获取笔记失败:', error);
      toast.error(error.response?.data?.error || '获取笔记失败');
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
        bookId,
        content: noteContent,
        pageNumber: currentPage,
        chapterIndex: currentChapterIndex,
        selectedText: noteSelectedText || null,
      });
      toast.success('笔记创建成功');
      setShowCreateModal(false);
      setNoteContent('');
      setNoteSelectedText('');
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
        selectedText: noteSelectedText || null,
      });
      toast.success('笔记更新成功');
      setShowEditModal(false);
      setEditingNote(null);
      setNoteContent('');
      setNoteSelectedText('');
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
    setNoteSelectedText(note.selected_text || '');
    setShowEditModal(true);
  };

  const openCreateModal = () => {
    setNoteContent('');
    setNoteSelectedText(selectedText || '');
    setShowCreateModal(true);
  };

  if (!isVisible) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <StickyNote className="w-5 h-5" />
            笔记
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="新建笔记"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 笔记列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <StickyNote className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">还没有笔记</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onNoteClick?.(note)}
                >
                  {note.selected_text && (
                    <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-blue-500">
                      "{note.selected_text}"
                    </div>
                  )}
                  <p className="text-gray-700 dark:text-gray-300 mb-2 line-clamp-3 whitespace-pre-wrap">
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {note.page_number && `第 ${note.page_number} 页`}
                      {note.page_number && note.chapter_index !== undefined && ' · '}
                      {note.chapter_index !== undefined && `章节 ${note.chapter_index + 1}`}
                    </span>
                    <span>{new Date(note.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(note);
                      }}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 创建笔记弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">新建笔记</h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNoteContent('');
                    setNoteSelectedText('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {noteSelectedText && (
                <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-blue-500">
                  "{noteSelectedText}"
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">笔记内容 *</label>
                <textarea
                  placeholder="输入笔记内容..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={6}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNoteContent('');
                    setNoteSelectedText('');
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">编辑笔记</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingNote(null);
                    setNoteContent('');
                    setNoteSelectedText('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {noteSelectedText && (
                <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-blue-500">
                  "{noteSelectedText}"
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">笔记内容 *</label>
                <textarea
                  placeholder="输入笔记内容..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 resize-none"
                  rows={6}
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingNote(null);
                    setNoteContent('');
                    setNoteSelectedText('');
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
    </>
  );
}

