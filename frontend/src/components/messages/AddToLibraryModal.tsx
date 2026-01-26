import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, BookOpen, Lock, Globe } from 'lucide-react';
import api from '../../utils/api';
import CategoryCombobox from '../CategoryCombobox';
import { useAuthStore } from '../../store/authStore';

/** 模态框仅需 file_path、file_name，父级可传入完整 Message */
export interface AddToLibraryMessage {
  file_path?: string;
  file_name?: string;
}

export interface AddToLibraryOptions {
  isPublic: boolean;
  category: string;
}

interface AddToLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: AddToLibraryMessage | null;
  onConfirm: (message: AddToLibraryMessage, opts: AddToLibraryOptions) => Promise<void>;
}

export const AddToLibraryModal: React.FC<AddToLibraryModalProps> = ({
  isOpen,
  onClose,
  message,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [bookCategories, setBookCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canUploadPrivate =
    user?.can_upload_private !== undefined
      ? user.can_upload_private
      : user?.role === 'admin';

  useEffect(() => {
    if (!isOpen) return;
    setCategory(t('book.uncategorized'));
    setIsPublic(canUploadPrivate ? false : true);
    const fetchCategories = async () => {
      try {
        const res = await api.get('/settings/book-categories');
        if (res?.data?.categories) {
          const cats = res.data.categories
            .map((c: { name?: string; category?: string } | string) =>
              typeof c === 'string' ? c : (c?.name ?? c?.category ?? String(c ?? ''))
            )
            .filter((s: string) => s && String(s).trim() !== '');
          if (cats.length > 0) setBookCategories(cats);
          else setBookCategories([t('book.uncategorized')]);
        } else {
          setBookCategories([t('book.uncategorized')]);
        }
      } catch {
        setBookCategories([t('book.uncategorized')]);
      }
    };
    fetchCategories();
  }, [isOpen, t]);

  if (!isOpen || !message) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(message, { isPublic, category: category || t('book.uncategorized') });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('messages.addToLibraryModalTitle')}
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 文件预览 */}
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {message.file_name || t('messages.typeLabelFile')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('messages.addToLibraryModalHint')}
              </div>
            </div>
          </div>

          {/* 私人 / 公开 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('messages.addToLibraryVisibilityLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => canUploadPrivate && setIsPublic(false)}
                disabled={!canUploadPrivate}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-colors ${
                  !isPublic
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                } ${!canUploadPrivate ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <Lock className="w-4 h-4" />
                <span>{t('messages.addToLibraryPrivate')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-colors ${
                  isPublic
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>{t('messages.addToLibraryPublic')}</span>
              </button>
            </div>
            {!canUploadPrivate && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                {t('messages.noPrivateBookPermissionDesc')}
              </p>
            )}
          </div>

          {/* 书籍类型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('messages.addToLibraryCategoryLabel')}
            </label>
            <CategoryCombobox
              value={category}
              onChange={setCategory}
              categories={bookCategories}
              placeholder={t('messages.addToLibraryCategoryPlaceholder')}
            />
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              t('common.confirm')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
