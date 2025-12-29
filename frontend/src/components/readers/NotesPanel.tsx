/**
 * @author ttbye
 * 笔记面板组件
 * 显示当前书籍的所有笔记，支持添加、编辑、删除笔记
 */

import { useEffect, useMemo, useState } from 'react';
import { StickyNote, Plus, X, Edit, Trash2, Save } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { ReadingSettings } from '../../types/reader';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';

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
  theme?: ReadingSettings['theme'];
}

export default function NotesPanel({
  bookId,
  currentPage,
  currentChapterIndex,
  selectedText,
  isVisible,
  onClose,
  onNoteClick,
  theme = 'light',
}: NotesPanelProps) {
  const { t } = useTranslation();
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

  const themeStyles = useMemo(() => {
    return (
      {
        light: {
          panelBg: '#ffffff',
          panelText: '#111827',
          border: 'rgba(229,231,235,0.7)',
          subText: '#6b7280',
          listBg: 'rgba(249,250,251,0.75)',
          cardBg: 'rgba(255,255,255,0.92)',
          overlay: 'rgba(0,0,0,0.55)',
          quoteBg: 'rgba(219,234,254,0.85)',
          quoteText: '#4b5563',
        },
        dark: {
          panelBg: '#111827',
          panelText: '#f9fafb',
          border: 'rgba(31,41,55,0.85)',
          subText: '#d1d5db',
          listBg: 'rgba(3,7,18,0.35)',
          cardBg: 'rgba(17,24,39,0.78)',
          overlay: 'rgba(0,0,0,0.55)',
          quoteBg: 'rgba(30,58,138,0.22)',
          quoteText: '#d1d5db',
        },
        sepia: {
          panelBg: '#f4e4bc',
          panelText: '#5c4b37',
          border: 'rgba(212,196,156,0.9)',
          subText: 'rgba(92,75,55,0.75)',
          listBg: 'rgba(244,228,188,0.85)',
          cardBg: 'rgba(255,255,255,0.55)',
          overlay: 'rgba(0,0,0,0.45)',
          quoteBg: 'rgba(255,255,255,0.35)',
          quoteText: 'rgba(92,75,55,0.8)',
        },
        green: {
          panelBg: '#c8e6c9',
          panelText: '#2e7d32',
          border: 'rgba(165,214,167,0.95)',
          subText: 'rgba(46,125,50,0.75)',
          listBg: 'rgba(200,230,201,0.85)',
          cardBg: 'rgba(255,255,255,0.55)',
          overlay: 'rgba(0,0,0,0.45)',
          quoteBg: 'rgba(255,255,255,0.35)',
          quoteText: 'rgba(46,125,50,0.8)',
        },
      } as const
    )[theme];
  }, [theme]);

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
      toast.error(error.response?.data?.error || t('notes.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast.error(t('notes.pleaseEnterContent'));
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
      toast.success(t('notes.createSuccess'));
      setShowCreateModal(false);
      setNoteContent('');
      setNoteSelectedText('');
      fetchNotes();
    } catch (error: any) {
      console.error('创建笔记失败:', error);
      toast.error(error.response?.data?.error || t('notes.createFailed'));
    }
  };

  const handleEditNote = async () => {
    if (!editingNote || !noteContent.trim()) {
      toast.error(t('notes.pleaseEnterContent'));
      return;
    }

    try {
      await api.put(`/notes/${editingNote.id}`, {
        content: noteContent,
        selectedText: noteSelectedText || null,
      });
      toast.success(t('notes.updateSuccess'));
      setShowEditModal(false);
      setEditingNote(null);
      setNoteContent('');
      setNoteSelectedText('');
      fetchNotes();
    } catch (error: any) {
      console.error('更新笔记失败:', error);
      toast.error(error.response?.data?.error || t('notes.updateFailed'));
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm(t('notes.confirmDelete'))) {
      return;
    }

    try {
      await api.delete(`/notes/${noteId}`);
      toast.success(t('notes.deleteSuccess'));
      fetchNotes();
    } catch (error: any) {
      console.error('删除笔记失败:', error);
      toast.error(error.response?.data?.error || t('notes.deleteFailed'));
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
      <div
        className="fixed inset-0 backdrop-blur-[1px] z-40"
        style={{ backgroundColor: themeStyles.overlay }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md shadow-2xl z-50 flex flex-col border-l"
        style={{
          // 预留顶部工具栏（48px）+ 顶部安全区域
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)',
          // 预留底部导航栏空间 + 底部安全区域（避免内容被遮挡）
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 82px)',
          backgroundColor: themeStyles.panelBg,
          color: themeStyles.panelText,
          borderLeftColor: themeStyles.border,
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b backdrop-blur-md"
          style={{
            borderBottomColor: themeStyles.border,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <StickyNote className="w-5 h-5" />
            {t('reader.notes')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="p-2 rounded-lg transition-colors"
              style={{ color: theme === 'dark' ? '#60a5fa' : '#2563eb' }}
              title={t('notes.createNote')}
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors"
              style={{ color: themeStyles.subText }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 笔记列表 */}
        <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: themeStyles.listBg }}>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <StickyNote className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p style={{ color: themeStyles.subText }}>{t('notes.noNotes')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-xl p-3 border hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onNoteClick?.(note)}
                  style={{
                    backgroundColor: themeStyles.cardBg,
                    borderColor: themeStyles.border,
                  }}
                >
                  {note.selected_text && (
                    <div
                      className="mb-2 p-2 rounded-lg text-sm italic border-l-2 border-blue-500"
                      style={{
                        backgroundColor: themeStyles.quoteBg,
                        color: themeStyles.quoteText,
                      }}
                    >
                      "{note.selected_text}"
                    </div>
                  )}
                  <p className="mb-2 line-clamp-3 whitespace-pre-wrap" style={{ color: themeStyles.panelText }}>
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between text-xs" style={{ color: themeStyles.subText }}>
                    <span>
                      {note.page_number && t('notes.pageNumber', { page: note.page_number })}
                      {note.page_number && note.chapter_index !== undefined && ' · '}
                      {note.chapter_index !== undefined && t('notes.chapterNumber', { chapter: note.chapter_index + 1 })}
                    </span>
                    <span>{new Date(note.created_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t" style={{ borderTopColor: themeStyles.border }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(note);
                      }}
                      className="p-1.5 transition-colors"
                      style={{ color: themeStyles.subText }}
                      title={t('common.edit')}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="p-1.5 transition-colors"
                      style={{ color: themeStyles.subText }}
                      title={t('common.delete')}
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
                <h3 className="text-lg font-bold">{t('notes.createNote')}</h3>
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
                <label className="block text-sm font-medium mb-2">{t('notes.content')}</label>
                <textarea
                  placeholder={t('notes.contentPlaceholder')}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{t('notes.editNote')}</h3>
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
                <label className="block text-sm font-medium mb-2">{t('notes.content')}</label>
                <textarea
                  placeholder={t('notes.contentPlaceholder')}
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
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleEditNote}
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
    </>
  );
}

