/**
 * @file AudiobookEditModal.tsx
 * @description 有声小说编辑模态框
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2, Upload, Image as ImageIcon, Save, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { getCoverUrl } from '../utils/coverHelper';
import { useAuthStore } from '../store/authStore';
import { audiobookProgressManager } from '../utils/audiobookProgressManager';

interface AudiobookEditModalProps {
  isOpen: boolean;
  audiobook: {
    id: string;
    title: string;
    author?: string;
    type: string;
    description?: string;
    cover_url?: string;
    uploader_id?: string;
    is_public?: number;
  } | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function AudiobookEditModal({
  isOpen,
  audiobook,
  onClose,
  onUpdated,
  onDeleted,
}: AudiobookEditModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    type: '',
    description: '',
    cover_url: '',
  });
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearingProgress, setClearingProgress] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearProgressConfirm, setShowClearProgressConfirm] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // 检查用户是否有权限修改公开状态（管理员或上传者）
  const canEditVisibility = user && (user.role === 'admin' || audiobook?.uploader_id === user.id);

  useEffect(() => {
    if (audiobook && isOpen) {
      setFormData({
        title: audiobook.title || '',
        author: audiobook.author || '',
        type: audiobook.type || '',
        description: audiobook.description || '',
        cover_url: audiobook.cover_url || '',
      });
      setIsPublic(audiobook.is_public === 1);
      setCoverPreview(getAudiobookCoverUrl(audiobook.cover_url));
      setCoverFile(null);
      setShowDeleteConfirm(false);
    }
  }, [audiobook, isOpen]);

  // 使用 coverHelper 中的 getCoverUrl 函数，支持自定义 API 地址
  const getAudiobookCoverUrl = (coverUrl: string | null | undefined): string | null => {
    return getCoverUrl(coverUrl);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('bookDetail.imageSizeLimit'));
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(t('book.imageFormatHint'));
        return;
      }
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setCoverPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCoverUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setFormData(prev => ({ ...prev, cover_url: url }));
    if (url) {
      setCoverPreview(url);
    } else {
      setCoverPreview(null);
    }
  };

  const handleSave = async () => {
    if (!audiobook) return;

    if (!formData.title.trim()) {
      toast.error(t('book.titleRequired'));
      return;
    }

    setSaving(true);
    try {
      let finalCoverUrl = formData.cover_url;

      // 如果上传了封面文件，先上传封面
      if (coverFile) {
        const formDataUpload = new FormData();
        formDataUpload.append('cover', coverFile);
        const uploadResponse = await api.post(`/audiobooks/${audiobook.id}/cover`, formDataUpload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (uploadResponse.data.success && uploadResponse.data.cover_url) {
          finalCoverUrl = uploadResponse.data.cover_url;
        }
      }

      // 更新有声小说信息
      const updatePayload: any = {
        title: formData.title.trim(),
        author: formData.author.trim(),
        type: formData.type,
        description: formData.description.trim(),
        cover_url: finalCoverUrl || null,
      };

      // 只有管理员或上传者可以修改公开状态
      if (canEditVisibility) {
        updatePayload.isPublic = isPublic;
      }

      const response = await api.put(`/audiobooks/${audiobook.id}`, updatePayload);

      if (response.data.success) {
        toast.success(t('audiobook.bookInfoUpdated') || '更新成功');
        onUpdated();
        onClose();
      }
    } catch (error: any) {
      console.error('更新有声小说失败:', error);
      toast.error(error.response?.data?.error || t('audiobook.updateFailed') || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!audiobook) return;

    setDeleting(true);
    try {
      const response = await api.post(`/audiobooks/${audiobook.id}`, { _method: 'DELETE' });
      if (response.data.success) {
        toast.success(t('audiobook.deleteSuccess'));
        onDeleted();
        onClose();
      }
    } catch (error: any) {
      console.error('删除有声小说失败:', error);
      toast.error(error.response?.data?.error || t('audiobook.deleteFailed'));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClearProgress = async () => {
    if (!audiobook) return;

    setClearingProgress(true);
    try {
      // 调用API删除服务器端的播放进度
      const response = await api.post(`/audiobooks/${audiobook.id}/progress`, { _method: 'DELETE' });
      if (response.data.success) {
        // 清除本地缓存
        audiobookProgressManager.clearCache(audiobook.id);

        toast.success(t('audiobook.clearProgressSuccess') || '播放进度已清空');
        setShowClearProgressConfirm(false);
      }
    } catch (error: any) {
      console.error('清空播放进度失败:', error);
      // 即使API调用失败，也清除本地缓存
      audiobookProgressManager.clearCache(audiobook.id);
      toast.error(error.response?.data?.error || (t('audiobook.clearProgressFailed') || '清空播放进度失败，但已清除本地缓存'));
      setShowClearProgressConfirm(false);
    } finally {
      setClearingProgress(false);
    }
  };

  if (!isOpen || !audiobook) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" 
        onClick={onClose}
        style={{
          // ✅ 修复：PWA和移动端安全区域适配
          paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
        }}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full overflow-y-auto flex flex-col"
          onClick={(e) => e.stopPropagation()}
          style={{
            // ✅ 修复：调整最大高度以考虑安全区域和底部导航栏
            maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
              ? `calc(100vh - max(env(safe-area-inset-top, 0px), 1rem) - max(env(safe-area-inset-bottom, 0px), 1rem) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
              : 'calc(100vh - max(env(safe-area-inset-top, 0px), 1rem) - max(env(safe-area-inset-bottom, 0px), 1rem) - 2rem)',
          }}
        >
          {/* 头部 */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('audiobook.edit') || '编辑有声小说'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 内容 */}
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* 标题 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('book.title')} *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                placeholder={t('book.title')}
              />
            </div>

            {/* 作者和类型 - 同一行 */}
            <div className="flex gap-4">
              {/* 作者 */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('book.author')}
                </label>
                <input
                  type="text"
                  name="author"
                  value={formData.author}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder={t('book.author')}
                />
              </div>

              {/* 类型 */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('audiobook.typeLabel')}
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                >
                  <option value="有声小说">{t('audiobook.types.novel')}</option>
                  <option value="有声历史">{t('audiobook.types.history')}</option>
                  <option value="有声读物">{t('audiobook.types.reading')}</option>
                  <option value="其他">{t('audiobook.types.other')}</option>
                </select>
              </div>
            </div>

            {/* 简介 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('book.description')}
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                placeholder={t('book.descriptionPlaceholder')}
              />
            </div>

            {/* 是否公开（仅管理员或上传者可见） */}
            {canEditVisibility && (
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('audiobook.isPublic') || '公开（其他用户可见）'}
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  {t('audiobook.isPublicDesc') || '开启后，其他用户可以搜索并查看此有声小说'}
                </p>
              </div>
            )}

            {/* 封面 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('book.cover')}
              </label>
              <div className="space-y-4">
                {/* 封面预览 */}
                {coverPreview && (
                  <div className="w-32 h-32 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                    <img
                      src={coverPreview}
                      alt="封面预览"
                      className="w-full h-full object-cover"
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  </div>
                )}

                {/* 本地上传 */}
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {t('book.localUpload')}
                  </label>
                  <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">{t('book.clickOrDragImage')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverFileChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('book.imageFormatHint')}
                  </p>
                </div>

                {/* URL上传 */}
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {t('book.urlUpload')}
                  </label>
                  <input
                    type="text"
                    name="cover_url"
                    value={formData.cover_url}
                    onChange={handleCoverUrlChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder={t('book.coverImageUrlPlaceholder') || '例如：/api/covers/xxx.jpg 或 https://example.com/cover.jpg'}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 底部按钮 */}
          <div 
            className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between gap-3"
            style={{
              paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
                ? `calc(1rem + ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
                : '1rem'
            }}
          >
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearProgressConfirm(true)}
                disabled={clearingProgress}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {t('audiobook.clearProgress') || '清空播放记录'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t('audiobook.delete')}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 清空播放进度确认对话框 */}
      {showClearProgressConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
          style={{
            // ✅ 修复：PWA和移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('audiobook.confirmClearProgress') || '确认清空播放记录'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('audiobook.confirmClearProgressMessage', { title: audiobook?.title }) || `确定要清空《${audiobook?.title}》的所有播放进度吗？此操作不可恢复。`}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearProgressConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleClearProgress}
                disabled={clearingProgress}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {clearingProgress ? t('common.loading') : (t('audiobook.confirmClearProgress') || '确认清空')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
          style={{
            // ✅ 修复：PWA和移动端安全区域适配
            paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('audiobook.confirmDelete')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('audiobook.confirmDeleteMessage', { title: audiobook?.title })}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? t('common.loading') : t('audiobook.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

