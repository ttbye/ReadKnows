/**
 * @file ProfileAvatar.tsx
 * @description 用户头像更换页面，从 Profile 双击头像进入
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { Upload, Trash2, ChevronLeft, Link as LinkIcon } from 'lucide-react';
import api, { getAvatarUrl } from '../utils/api';
import toast from 'react-hot-toast';

export default function ProfileAvatar() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [fromUrlLoading, setFromUrlLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 选择新文件时生成预览，并 revoke 旧的
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  const handleSelect = () => inputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(f.type)) {
      toast.error('仅支持 JPG、PNG、GIF、WebP 图片');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error('图片大小不能超过 2MB');
      return;
    }
    setFile(f);
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('请先选择图片');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const { data } = await api.post('/users/me/avatar', form);
      setUser(data.user);
      setFile(null);
      toast.success('头像已更新');
      navigate('/profile');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSetFromUrl = async () => {
    const u = urlInput.trim();
    if (!u) {
      toast.error('请输入图片链接');
      return;
    }
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      toast.error('仅支持 http 或 https 链接');
      return;
    }
    setFromUrlLoading(true);
    try {
      const { data } = await api.post('/users/me/avatar/from-url', { url: u });
      setUser(data.user);
      setUrlInput('');
      setFile(null);
      toast.success('头像已更新');
      navigate('/profile');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || '设置失败');
    } finally {
      setFromUrlLoading(false);
    }
  };

  const handleClear = async () => {
    if (!user?.avatar_path) {
      toast.error('当前没有自定义头像');
      return;
    }
    if (!confirm('确定要清除头像并恢复为默认吗？')) return;
    setClearing(true);
    try {
      const { data } = await api.delete('/users/me/avatar');
      setUser(data.user);
      setFile(null);
      toast.success('头像已清除');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || '清除失败');
    } finally {
      setClearing(false);
    }
  };

  const displayUrl = preview || (user?.avatar_path ? getAvatarUrl(user.avatar_path) : null);

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          aria-label="返回"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">更换头像</h1>
      </div>

      <div className="card p-6">
        <div className="flex flex-col items-center gap-4">
          {/* 当前 / 预览头像 */}
          <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center bg-gray-200 dark:bg-gray-700 flex-shrink-0">
            {displayUrl ? (
              <img src={displayUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-gray-500 dark:text-gray-400">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </span>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-wrap justify-center gap-2 w-full">
            <button
              type="button"
              onClick={handleSelect}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              选择图片
            </button>
            {file && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="btn btn-primary flex items-center gap-2"
              >
                {uploading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                上传
              </button>
            )}
            {user?.avatar_path && !file && (
              <button
                type="button"
                onClick={handleClear}
                disabled={clearing}
                className="btn btn-danger flex items-center gap-2"
              >
                {clearing ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                清除头像
              </button>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            支持 JPG、PNG、GIF、WebP，最大 2MB
          </p>

          <div className="w-full border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('settings.avatarFromUrl')}</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={t('settings.avatarUrlPlaceholder')}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
              <button
                type="button"
                onClick={handleSetFromUrl}
                disabled={fromUrlLoading}
                className="btn btn-secondary flex items-center gap-2"
              >
                {fromUrlLoading ? (
                  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                {t('settings.avatarSetFromUrl')}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{t('settings.avatarFromUrlHint')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
