/**
 * @file Upload.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Upload as UploadIcon, FileText, Folder, Scan, CheckCircle, XCircle, Loader, History, Trash2, Clock } from 'lucide-react';
import CategoryCombobox from '../components/CategoryCombobox';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';

interface ScannedFile {
  path: string;
  name: string;
  size: number;
  ext: string;
  modified: string;
  selected?: boolean;
}

interface ImportHistoryItem {
  id: string;
  file_name: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
  created_at: string;
}

interface LocalFile {
  file: File;
  name: string;
  size: number;
  ext: string;
  selected: boolean;
}

export default function Upload() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [scanPath, setScanPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  
  // 本地批量上传
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  
  // 全局导入选项
  const [autoConvertTxt, setAutoConvertTxt] = useState(true);
  const [autoConvertMobi, setAutoConvertMobi] = useState(true);
  const [autoFetchDouban, setAutoFetchDouban] = useState(true);
  const [isPublic, setIsPublic] = useState(true); // 默认改为公开
  const [category, setCategory] = useState('');
  const [deleteSource, setDeleteSource] = useState(false); // 是否删除源文件
  const [bookCategories, setBookCategories] = useState<string[]>([]);
  
  // 免责声明同意状态
  const [agreedToDisclaimer, setAgreedToDisclaimer] = useState(false);
  
  // 导入历史
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 加载导入历史
  useEffect(() => {
    if (isAuthenticated && showHistory) {
      fetchImportHistory();
    }
  }, [isAuthenticated, showHistory]);

  // 加载书籍类型列表
  useEffect(() => {
    fetchBookCategories();
  }, []);

  const fetchBookCategories = async () => {
    try {
      const response = await api.get('/settings/book-categories');
      
      if (!response.data || !response.data.categories) {
        console.warn('API返回数据格式不正确:', response.data);
        setBookCategories([t('book.uncategorized')]);
        return;
      }
      
      const cats = response.data.categories.map((c: any) => {
        if (typeof c === 'string') {
          return c;
        }
        return c.name || c.category || String(c);
      }).filter((cat: string) => cat && cat.trim() !== '');
      
      if (cats.length > 0) {
        setBookCategories(cats);
      } else {
        console.warn('书籍类型列表为空，使用默认值');
        setBookCategories([t('book.uncategorized')]);
      }
    } catch (error: any) {
      console.error('获取书籍类型列表失败:', error);
      console.error('错误状态码:', error.response?.status);
      console.error('错误详情:', error.response?.data || error.message);
      // 使用默认分类列表
      setBookCategories([t('book.uncategorized')]);
    }
  };

  const fetchImportHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await api.get('/scan/import-history?limit=50');
      setImportHistory(response.data.history || []);
    } catch (error) {
      console.error('获取导入历史失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm(t('upload.confirmClearHistory'))) {
      return;
    }

    try {
      await api.delete('/scan/import-history');
      setImportHistory([]);
      toast.success(t('upload.historyCleared'));
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('upload.clearFailed'));
    }
  };

  // 处理批量文件选择
  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newLocalFiles: LocalFile[] = Array.from(files).map(file => ({
      file,
      name: file.name,
      size: file.size,
      ext: file.name.split('.').pop()?.toLowerCase() || '',
      selected: true, // 默认全选
    }));

    setLocalFiles(prev => [...prev, ...newLocalFiles]);
    toast.success(t('upload.filesAdded', { count: files.length }));
    e.target.value = ''; // 重置input，允许再次选择相同文件
  };

  // 切换本地文件选择状态
  const handleToggleLocalFile = (index: number) => {
    const newFiles = [...localFiles];
    newFiles[index].selected = !newFiles[index].selected;
    setLocalFiles(newFiles);
  };

  // 全选/取消全选本地文件
  const handleSelectAllLocalFiles = () => {
    const allSelected = localFiles.every((f) => f.selected);
    setLocalFiles(localFiles.map((f) => ({ ...f, selected: !allSelected })));
  };

  // 批量上传本地文件
  const handleBatchUpload = async () => {
    // 检查是否同意免责声明
    if (!agreedToDisclaimer) {
      toast.error(t('upload.pleaseAgreeDisclaimer'));
      return;
    }
    
    const selectedFiles = localFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      toast.error(t('upload.selectAtLeastOneFile'));
      return;
    }

    setBatchUploading(true);
    setBatchProgress({ current: 0, total: selectedFiles.length });

    let uploaded = 0;
    let failed = 0;

    try {
      // 逐个上传文件以显示实时进度
      for (let i = 0; i < selectedFiles.length; i++) {
        const localFile = selectedFiles[i];
        
        try {
          // 更新当前进度
          setBatchProgress({ current: i + 1, total: selectedFiles.length });
          
          const formData = new FormData();
          formData.append('file', localFile.file);
          formData.append('isPublic', String(isPublic));
          formData.append('autoConvertTxt', String(autoConvertTxt));
          formData.append('autoConvertMobi', String(autoConvertMobi));
          formData.append('autoFetchDouban', String(autoFetchDouban));
          formData.append('category', category);

          await api.post('/books/upload', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          uploaded++;
          
          // 显示单个文件上传成功
          toast.success(`✓ ${localFile.name}`, { duration: 2000 });
        } catch (error: any) {
          console.error(`上传失败 ${localFile.name}:`, error);
          failed++;
          toast.error(`✗ ${localFile.name}: ${error.response?.data?.error || t('upload.uploadFailed')}`, { duration: 3000 });
        }
      }

      // 显示汇总结果
      if (uploaded > 0) {
        toast.success(t('upload.uploadSuccess', { count: uploaded }));
      }
      if (failed > 0) {
        toast.error(t('upload.uploadFailedCount', { count: failed }));
      }

      // 移除已上传的文件
      setLocalFiles(localFiles.filter((f) => !f.selected));
      
      // 刷新导入历史
      if (showHistory) {
        fetchImportHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('upload.batchUploadFailed'));
    } finally {
      setBatchUploading(false);
      setBatchProgress({ current: 0, total: 0 });
    }
  };

  // 移除本地文件
  const handleRemoveLocalFile = (index: number) => {
    setLocalFiles(localFiles.filter((_, i) => i !== index));
  };

  const handleScanDirectory = async () => {
    if (!scanPath.trim()) {
      toast.error(t('upload.pleaseEnterScanPath'));
      return;
    }

    setScanning(true);
    setScannedFiles([]);
    try {
      // 清理路径，移除引号和多余空格
      let cleanPath = scanPath.trim();
      // 移除首尾的引号
      cleanPath = cleanPath.replace(/^['"]|['"]$/g, '').trim();
      
      const response = await api.post('/scan/scan-list', { scanPath: cleanPath });
      const files = (response.data.files || []).map((file: ScannedFile) => ({
        ...file,
        selected: true, // 默认全选
      }));
      setScannedFiles(files);
      const errorCount = response.data.errors || 0;
      if (errorCount > 0) {
        toast.success(t('upload.scanCompleteWithErrors', { count: files.length, errors: errorCount }), {
          duration: 4000,
        });
      } else {
        toast.success(t('upload.scanComplete', { count: files.length }));
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || t('upload.scanFailed');
      console.error('扫描错误:', error.response?.data);
      toast.error(errorMessage);
    } finally {
      setScanning(false);
    }
  };

  const handleToggleFile = (index: number) => {
    const newFiles = [...scannedFiles];
    newFiles[index].selected = !newFiles[index].selected;
    setScannedFiles(newFiles);
  };

  const handleSelectAll = () => {
    const allSelected = scannedFiles.every((f) => f.selected);
    setScannedFiles(scannedFiles.map((f) => ({ ...f, selected: !allSelected })));
  };

  const handleImportAll = async () => {
    // 检查是否同意免责声明
    if (!agreedToDisclaimer) {
      toast.error(t('upload.pleaseAgreeDisclaimer'));
      return;
    }
    
    const selectedFiles = scannedFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      toast.error(t('upload.selectAtLeastOneFile'));
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: selectedFiles.length });

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    try {
      // 逐个导入文件以显示实时进度
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        try {
          // 更新当前进度（从1开始计数，更直观）
          setImportProgress({ current: i + 1, total: selectedFiles.length });
          
          const response = await api.post('/scan/import-batch', {
            files: [{
              path: file.path,
              name: file.name,
            }],
            autoConvertTxt,
            autoConvertMobi,
            autoFetchDouban,
            isPublic,
            category,
            deleteSource,
          });

          if (response.data.imported > 0) {
            imported += response.data.imported;
          }
          if (response.data.skipped > 0) {
            skipped += response.data.skipped;
          }
          if (response.data.failed > 0) {
            failed += response.data.failed;
          }
        } catch (error: any) {
          console.error(`导入文件失败 ${file.name}:`, error);
          failed++;
        }
      }

      // 显示汇总结果
      if (imported > 0) {
        toast.success(t('upload.importSuccess', { count: imported }));
      }
      if (skipped > 0) {
        toast(t('upload.skipped', { count: skipped }), { icon: 'ℹ️' });
      }
      if (failed > 0) {
        toast.error(t('upload.failed', { count: failed }));
      }

      // 移除已导入的文件
      setScannedFiles(scannedFiles.filter((f) => !f.selected));
      
      // 刷新导入历史
      if (showHistory) {
        fetchImportHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('upload.batchImportFailed'));
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US');
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">{t('upload.pleaseLogin')}</p>
      </div>
    );
  }

  const selectedCount = scannedFiles.filter((f) => f.selected).length;
  const selectedLocalCount = localFiles.filter((f) => f.selected).length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'skipped':
        return <XCircle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'skipped':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-end">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="btn btn-secondary flex items-center gap-2"
        >
          <History className="w-4 h-4" />
          {showHistory ? t('upload.hideHistory') : t('upload.importHistory')}
        </button>
      </div>

      {/* 全局导入选项卡片 */}
      <div className="card bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 border-2 border-blue-200 dark:border-blue-700 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('upload.importOptions')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('upload.importOptionsDesc')}</p>
          </div>
        </div>
        
        {/* 免责声明 */}
        <div className="mb-4 p-4 rounded-lg border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-start gap-3 mb-3">
            <div className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800 dark:text-red-200 mb-2">
                {t('upload.importantDisclaimer')}
              </p>
              <div className="text-xs text-red-700 dark:text-red-300 leading-relaxed space-y-2">
                <p>
                  <strong>{t('upload.disclaimer1Title')}</strong>{t('upload.disclaimer1Content')}
                </p>
                <p>
                  <strong>{t('upload.disclaimer2Title')}</strong>{t('upload.disclaimer2Content')}
                </p>
                <p>
                  <strong>{t('upload.disclaimer3Title')}</strong>{t('upload.disclaimer3Content')}
                </p>
                <p>
                  <strong>{t('upload.disclaimer4Title')}</strong>{t('upload.disclaimer4Content')}
                </p>
                <p>
                  <strong>{t('upload.disclaimer5Title')}</strong>{t('upload.disclaimer5Content')}
                </p>
                <p>
                  <strong>{t('upload.disclaimer6Title')}</strong>{t('upload.disclaimer6Content')}
                </p>
              </div>
            </div>
          </div>
          
          {/* 同意复选框 */}
          <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
            <label className="flex items-start gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToDisclaimer}
                onChange={(e) => setAgreedToDisclaimer(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-red-300 dark:border-red-700 text-red-600 focus:ring-red-500 focus:ring-2"
                required
              />
              <span className="text-sm font-semibold text-red-800 dark:text-red-200 group-hover:text-red-900 dark:group-hover:text-red-100 transition-colors">
                {t('upload.agreeDisclaimer')}
              </span>
            </label>
            {!agreedToDisclaimer && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 ml-7">
                {t('upload.mustAgreeDisclaimer')}
              </p>
            )}
          </div>
        </div>
        
        <div className="space-y-4">
          {/* 书籍分类 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              📚 {t('upload.bookCategory')}
            </label>
            <CategoryCombobox
              value={category}
              onChange={setCategory}
              categories={bookCategories}
              placeholder={t('upload.selectOrEnterCategory')}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('upload.categoryDesc')}
            </p>
          </div>

          {/* 导入选项 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 获取豆瓣信息 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={autoFetchDouban}
                  onChange={(e) => setAutoFetchDouban(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  🔍 {t('upload.autoFetchDouban')}
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {t('upload.autoFetchDoubanDesc')}
              </p>
            </div>

            {/* 公开/私有 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  🌐 {t('upload.setPublic')}
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {isPublic ? t('upload.publicDesc') : t('upload.privateDesc')}
              </p>
            </div>
          </div>

          {/* 文件处理选项 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* TXT转EPUB */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={autoConvertTxt}
                  onChange={(e) => setAutoConvertTxt(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  📄 {t('upload.autoConvertTxt')}
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {t('upload.autoConvertTxtDesc')}
              </p>
            </div>

            {/* MOBI转EPUB */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={autoConvertMobi}
                  onChange={(e) => setAutoConvertMobi(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  📱 {t('upload.autoConvertMobi')}
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {t('upload.autoConvertMobiDesc')}
              </p>
            </div>

            {/* 删除源文件 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={deleteSource}
                  onChange={(e) => setDeleteSource(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                  🗑️ {t('upload.deleteSource')}
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {deleteSource ? t('upload.deleteSourceDesc') : t('upload.keepSourceDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 批量选择文件 */}
        <div className="card bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-200 dark:border-purple-700">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('upload.batchSelect')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('upload.selectFromLocal')}
              </label>
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg cursor-pointer hover:border-purple-500 transition-colors bg-white dark:bg-gray-800">
                <div className="text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('upload.clickToSelectFiles')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('upload.supportedFormats')}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".epub,.pdf,.txt,.mobi,.docx,.doc,.xlsx,.xls,.pptx,.md"
                  multiple
                  onChange={handleBatchFileSelect}
                  disabled={batchUploading}
                />
              </label>
            </div>
            {localFiles.length > 0 && (
              <div className="text-sm text-purple-600 dark:text-purple-400">
                <p>📚 {t('upload.selectedFiles', { count: localFiles.length })}</p>
              </div>
            )}
          </div>
        </div>

        {/* 目录扫描（服务器） */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Folder className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('upload.directoryScan')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('upload.serverPath')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder={t('upload.serverPathPlaceholder')}
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleScanDirectory();
                    }
                  }}
                />
                <button
                  onClick={handleScanDirectory}
                  disabled={scanning}
                  className="btn btn-primary"
                >
                  {scanning ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      {t('upload.scanning')}
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      {t('upload.scan')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 本地文件列表 */}
      {localFiles.length > 0 && (
        <div className="card mt-6 bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-900/10 dark:to-pink-900/10 border-2 border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('upload.localFileList', { count: localFiles.length })}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAllLocalFiles}
                className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
              >
                {localFiles.every((f) => f.selected) ? t('upload.deselectAll') : t('upload.selectAll')}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('upload.selectedCount', { count: selectedLocalCount })}
              </span>
              <button
                onClick={handleBatchUpload}
                disabled={batchUploading || selectedLocalCount === 0 || !agreedToDisclaimer}
                className="btn btn-primary bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {batchUploading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t('upload.uploading', { current: batchProgress.current, total: batchProgress.total })}
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-4 h-4" />
                    {t('upload.batchUpload', { count: selectedLocalCount })}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-purple-200 dark:border-purple-800">
                  <th className="text-left py-3 px-4">
                    <input
                      type="checkbox"
                      checked={localFiles.every((f) => f.selected)}
                      onChange={handleSelectAllLocalFiles}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="text-left py-3 px-4">{t('upload.fileName')}</th>
                  <th className="text-left py-3 px-4">{t('upload.format')}</th>
                  <th className="text-left py-3 px-4">{t('upload.size')}</th>
                  <th className="text-left py-3 px-4">{t('upload.action')}</th>
                </tr>
              </thead>
              <tbody>
                {localFiles.map((file, index) => (
                  <tr
                    key={index}
                    className="border-b border-purple-100 dark:border-purple-900/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={file.selected}
                        onChange={() => handleToggleLocalFile(index)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">{file.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs uppercase">
                        {file.ext}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleRemoveLocalFile(index)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                        title={t('upload.remove')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 card-gradient rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-purple-600 mt-0.5">💡</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">{t('upload.usageInstructions')}</p>
                <ul className="space-y-1 text-xs">
                  <li>• {t('upload.usageTip1')}</li>
                  <li>• {t('upload.usageTip2')}</li>
                  <li>• {t('upload.usageTip3')}</li>
                  <li>• {t('upload.usageTip4')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 扫描结果列表（服务器目录） */}
      {scannedFiles.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('upload.scanResult', { count: scannedFiles.length })}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {scannedFiles.every((f) => f.selected) ? t('upload.deselectAll') : t('upload.selectAll')}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('upload.selectedCount', { count: selectedCount })}
              </span>
              <button
                onClick={handleImportAll}
                disabled={importing || selectedCount === 0 || !agreedToDisclaimer}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t('upload.importing', { current: importProgress.current, total: importProgress.total })}
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-4 h-4" />
                    {t('upload.importAll', { count: selectedCount })}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4">
                    <input
                      type="checkbox"
                      checked={scannedFiles.every((f) => f.selected)}
                      onChange={handleSelectAll}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="text-left py-3 px-4">{t('upload.fileName')}</th>
                  <th className="text-left py-3 px-4">{t('upload.format')}</th>
                  <th className="text-left py-3 px-4">{t('upload.size')}</th>
                  <th className="text-left py-3 px-4">{t('upload.modifiedTime')}</th>
                  <th className="text-left py-3 px-4">{t('upload.path')}</th>
                </tr>
              </thead>
              <tbody>
                {scannedFiles.map((file, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={file.selected}
                        onChange={() => handleToggleFile(index)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">{file.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs uppercase">
                        {file.ext}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                      {formatDate(file.modified)}
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-500 text-sm font-mono truncate max-w-xs">
                      {file.path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 导入历史 */}
      {showHistory && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('upload.importHistory')}</h2>
            </div>
            {importHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t('upload.clearHistory')}
              </button>
            )}
          </div>

          {loadingHistory ? (
            <div className="text-center py-8">
              <Loader className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('common.loading')}</p>
            </div>
          ) : importHistory.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-12 h-12 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-500 dark:text-gray-400">{t('upload.noImportHistory')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {importHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.file_name}</p>
                    <p className={`text-xs ${getStatusColor(item.status)} mt-1`}>
                      {item.message}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(item.created_at).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
