/**
 * @file Upload.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Upload as UploadIcon, FileText, Folder, Scan, CheckCircle, XCircle, Loader, History, Trash2, Clock, ChevronDown, ChevronUp, Settings, FileCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import CategoryCombobox from '../components/CategoryCombobox';
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
  const { isAuthenticated, user } = useAuthStore();
  
  // 检查上传权限
  const canUploadBooks = user?.can_upload_books !== undefined 
    ? user.can_upload_books 
    : true; // 默认为true（向后兼容）
  
  // 如果没有上传权限，显示提示
  useEffect(() => {
    if (isAuthenticated && !canUploadBooks) {
      toast.error(t('upload.uploadPermissionDisabled') || '您没有权限上传书籍，请联系管理员开启此权限');
    }
  }, [isAuthenticated, canUploadBooks, t]);
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
  // 根据用户权限设置默认值：如果没有权限上传私人书籍，默认为公开且禁用选择
  const canUploadPrivate = user?.can_upload_private !== undefined 
    ? user.can_upload_private 
    : (user?.role === 'admin'); // 默认：管理员允许，普通用户不允许
  const [isPublic, setIsPublic] = useState(true); // 默认改为公开
  const [category, setCategory] = useState('未分类');
  const [deleteSource, setDeleteSource] = useState(false); // 是否删除源文件
  const [bookCategories, setBookCategories] = useState<string[]>([]);
  
  // 免责声明同意状态
  const [agreedToDisclaimer, setAgreedToDisclaimer] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false); // 移动端免责声明折叠

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

  // 延迟加载书籍类型列表（非关键数据，避免阻塞页面）
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookCategories();
    }, 200);
    
    return () => clearTimeout(timer);
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
      // 静默失败，使用默认分类列表
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK' && error.code !== 'ERR_ADDRESS_INVALID') {
        console.error('获取书籍类型列表失败:', error);
        console.error('错误状态码:', error.response?.status);
        console.error('错误详情:', error.response?.data || error.message);
      }
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

          // 检查上传权限
          if (isAuthenticated && user?.can_upload_books === false) {
            throw new Error(t('upload.uploadPermissionDisabled') || '您没有权限上传书籍，请联系管理员开启此权限');
          }
          
          // 大文件上传需要更长的超时时间（10分钟）
          
          const response = await api.post('/books/upload', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            timeout: 600000, // 10分钟超时，适用于大文件上传
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                // 可以在这里更新上传进度（如果需要）
              }
            },
          });

          uploaded++;
          
          // 显示单个文件上传成功
          toast.success(`✓ ${localFile.name}`, { duration: 2000 });
        } catch (error: any) {

          failed++;
          
          // 提供更详细的错误信息
          let errorMessage = error.response?.data?.error || error.message || t('upload.uploadFailed') || '上传失败';
          
          // 处理各种错误情况
          if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.message?.includes('Timeout')) {
            errorMessage = t('upload.uploadTimeout') || '上传超时，请检查网络连接或文件大小。如果文件较大，请稍后重试。';
          } else if (error.code === 'ERR_NETWORK' || error.code === 'ERR_ADDRESS_INVALID' || error.message?.includes('Network Error')) {
            errorMessage = t('upload.networkError') || '网络连接失败，请检查网络设置和服务器连接';
          } else if (error.response?.status === 403) {
            errorMessage = error.response?.data?.error || t('upload.uploadPermissionDisabled') || '您没有权限上传书籍';
          } else if (error.response?.status === 400) {
            errorMessage = error.response?.data?.error || '请求参数错误，请检查文件格式和大小';
          } else if (error.response?.status === 413) {
            errorMessage = '文件太大，超过服务器限制（最大500MB）';
          } else if (error.response?.status === 500) {
            errorMessage = error.response?.data?.error || '服务器内部错误，请稍后重试或联系管理员';
          } else if (error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504) {
            errorMessage = '服务器暂时不可用，请稍后重试';
          } else if (!error.response) {
            // 没有响应，可能是网络问题或请求被拦截
            errorMessage = '请求失败，可能是网络问题或服务器未响应。请检查：\n1. 网络连接是否正常\n2. 服务器是否运行\n3. 防火墙设置';
          }
          
          // 显示错误提示（延长显示时间以便用户阅读）
          toast.error(`✗ ${localFile.name}: ${errorMessage}`, { duration: 5000 });
        }
      }

      // 显示汇总结果
      if (uploaded > 0) {
        toast.success(t('upload.uploadSuccess', { count: uploaded }));
      }
      if (failed > 0) {
        toast.error(t('upload.uploadFailedCount', { count: failed }), { duration: 5000 });
        // 如果所有文件都失败了，显示更详细的提示
        if (uploaded === 0 && failed === selectedFiles.length) {
          // console.error('[上传] 所有文件上传失败，可能的原因：');
          // console.error('1. 网络连接问题');
          // console.error('2. 服务器超时（文件太大）');
          // console.error('3. 权限问题');
          // console.error('4. 服务器配置问题（nginx超时、文件大小限制等）');
          toast.error('所有文件上传失败，请检查：\n1. 网络连接\n2. 文件大小（最大500MB）\n3. 服务器日志', { duration: 8000 });
        }
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
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
      {/* 紧凑的页面头部 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UploadIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">导入书籍</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title={showHistory ? '隐藏历史' : '导入历史'}
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 紧凑的导入选项卡片 */}
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入设置</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">配置书籍导入选项</p>
          </div>
        </div>

        {/* 重要免责声明 - 同意复选框始终可见 */}
        <div className="mb-4">
          <button
            onClick={() => setShowDisclaimer(!showDisclaimer)}
            className="w-full flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="text-red-600 dark:text-red-400">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-medium text-red-800 dark:text-red-200">重要免责声明</span>
            </div>
            {showDisclaimer ? (
              <ChevronUp className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
          </button>

          {/* 折叠的免责声明内容 */}
          {showDisclaimer && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="text-xs text-red-700 dark:text-red-300 leading-relaxed space-y-2">
                <p>
                  <strong>版权声明：</strong>请确保您拥有上传书籍的合法版权，或书籍已进入公共领域。
                </p>
                <p>
                  <strong>内容审核：</strong>系统会自动处理书籍内容，但请自行确保内容合规。
                </p>
                <p>
                  <strong>数据安全：</strong>上传的文件将存储在服务器上，请谨慎选择。
                </p>
                <p>
                  <strong>技术支持：</strong>如遇问题请联系管理员获取帮助。
                </p>
              </div>
            </div>
          )}

          {/* 同意复选框 - 始终可见 */}
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <label className="flex items-start gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToDisclaimer}
                onChange={(e) => setAgreedToDisclaimer(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-red-300 dark:border-red-700 text-red-600 focus:ring-red-500 focus:ring-2"
                required
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-red-800 dark:text-red-200 group-hover:text-red-900 dark:group-hover:text-red-100 transition-colors">
                  我已阅读并同意上述声明
                </span>
                {!agreedToDisclaimer && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    必须同意免责声明才能继续操作
                  </p>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* 紧凑的导入选项 */}
        <div className="space-y-3">
          {/* 书籍分类 */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              📚 书籍分类
            </label>
            <CategoryCombobox
              value={category}
              onChange={setCategory}
              categories={bookCategories}
              placeholder="选择或输入分类"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              为上传的书籍设置分类标签
            </p>
            {/* PC端显示更详细的说明 */}
            <div className="hidden md:block mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                选择现有分类或输入新分类名称，有助于更好地组织和管理您的书籍收藏
              </p>
            </div>
          </div>

          {/* 导入选项网格 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFetchDouban}
                  onChange={(e) => setAutoFetchDouban(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🔍 获取豆瓣信息</span>
                  {/* PC端显示详细说明 */}
                  <div className="hidden md:block">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      自动从豆瓣获取书籍的详细信息，包括简介、评分、作者信息等
                    </p>
                  </div>
                </div>
              </label>
            </div>

            <div className={`p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 ${canUploadPrivate ? '' : 'opacity-60'}`}>
              <label className={`flex items-start gap-2 ${canUploadPrivate ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => {
                    if (canUploadPrivate) {
                      setIsPublic(e.target.checked);
                    }
                  }}
                  disabled={!canUploadPrivate}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                />
                <div className="flex-1">
                  <span className={`text-sm font-medium text-gray-700 dark:text-gray-300 ${canUploadPrivate ? '' : 'cursor-not-allowed'}`}>
                    🌐 {isPublic ? '公开书籍' : '私有书籍'}
                  </span>
                  {/* PC端显示详细说明 */}
                  <div className="hidden md:block">
                    <p className={`text-xs mt-1 ${canUploadPrivate ? 'text-gray-500 dark:text-gray-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      {canUploadPrivate
                        ? (isPublic ? '书籍对所有用户可见' : '书籍仅自己可见')
                        : '需要管理员开启私有上传权限'}
                    </p>
                  </div>
                </div>
              </label>
            </div>

            <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoConvertTxt}
                  onChange={(e) => setAutoConvertTxt(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">📄 TXT转EPUB</span>
                  {/* PC端显示详细说明 */}
                  <div className="hidden md:block">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      自动将TXT格式文件转换为标准EPUB格式，便于阅读和兼容
                    </p>
                  </div>
                </div>
              </label>
            </div>

            <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoConvertMobi}
                  onChange={(e) => setAutoConvertMobi(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">📱 MOBI转EPUB</span>
                  {/* PC端显示详细说明 */}
                  <div className="hidden md:block">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      自动将MOBI格式文件转换为标准EPUB格式，提高兼容性
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 删除源文件选项 */}
          <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteSource}
                onChange={(e) => setDeleteSource(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🗑️ 导入后删除源文件</span>
                {/* PC端显示详细说明 */}
                <div className="hidden md:block">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {deleteSource ? '导入成功后自动删除服务器上的源文件，节省存储空间' : '保留源文件在服务器上，可用于重新处理'}
                  </p>
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* 文件选择区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 本地文件选择 */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">本地文件</h2>
          </div>
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors bg-gray-50 dark:bg-gray-800/50">
              <div className="text-center">
                <FileText className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  点击选择文件
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                  支持多种格式
                </p>
                {/* PC端显示更详细的说明 */}
                <div className="hidden md:block mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    支持EPUB、PDF、TXT、MOBI等多种电子书格式
                  </p>
                </div>
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
            {localFiles.length > 0 && (
              <div className="text-sm text-purple-600 dark:text-purple-400">
                已选择 {localFiles.length} 个文件
              </div>
            )}
          </div>
        </div>

        {/* 服务器目录扫描 */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Folder className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">服务器目录</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                服务器路径
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="输入服务器目录路径"
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
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {scanning ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      扫描中
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      扫描
                    </>
                  )}
                </button>
              </div>
              {/* PC端显示详细说明 */}
              <div className="hidden md:block mt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  输入服务器上的目录路径，系统将自动扫描该目录下的所有支持的文件格式
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 本地文件列表 */}
      {localFiles.length > 0 && (
        <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                已选择文件 ({localFiles.length})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAllLocalFiles}
                className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                {localFiles.every((f) => f.selected) ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                已选 {selectedLocalCount} 个
              </span>
            </div>
          </div>

          {/* 桌面端表格 */}
          <div className="hidden md:block overflow-x-auto mb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3">
                    <input
                      type="checkbox"
                      checked={localFiles.every((f) => f.selected)}
                      onChange={handleSelectAllLocalFiles}
                      className="w-3 h-3"
                    />
                  </th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">文件名</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">格式</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">大小</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">操作</th>
                </tr>
              </thead>
              <tbody>
                {localFiles.map((file, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={file.selected}
                        onChange={() => handleToggleLocalFile(index)}
                        className="w-3 h-3"
                      />
                    </td>
                    <td className="py-2 px-3 font-medium text-sm truncate max-w-xs">{file.name}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs uppercase">
                        {file.ext}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleRemoveLocalFile(index)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 text-sm p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PC端使用说明 */}
          <div className="hidden md:block mt-4 p-4 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-purple-600 mt-0.5">💡</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">使用说明</p>
                <ul className="space-y-1 text-xs">
                  <li>• 支持同时上传多个文件，系统会自动处理</li>
                  <li>• 上传过程中请勿关闭页面，文件较大时需要较长时间</li>
                  <li>• 上传成功后可在"我的书架"中查看和管理书籍</li>
                  <li>• 如遇上传失败，请检查文件格式和网络连接</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 移动端卡片列表 */}
          <div className="md:hidden space-y-2 mb-4">
            {localFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={file.selected}
                  onChange={() => handleToggleLocalFile(index)}
                  className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {file.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs uppercase">
                      {file.ext}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveLocalFile(index)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* 批量上传按钮 */}
          <div className="flex justify-center">
            <button
              onClick={handleBatchUpload}
              disabled={batchUploading || selectedLocalCount === 0 || !agreedToDisclaimer}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {batchUploading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  上传中 ({batchProgress.current}/{batchProgress.total})
                </>
              ) : (
                <>
                  <UploadIcon className="w-4 h-4" />
                  批量上传 ({selectedLocalCount})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 扫描结果列表 */}
      {scannedFiles.length > 0 && (
        <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Folder className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                扫描结果 ({scannedFiles.length})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                {scannedFiles.every((f) => f.selected) ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                已选 {selectedCount} 个
              </span>
            </div>
          </div>

          {/* 桌面端表格 */}
          <div className="hidden md:block overflow-x-auto mb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3">
                    <input
                      type="checkbox"
                      checked={scannedFiles.every((f) => f.selected)}
                      onChange={handleSelectAll}
                      className="w-3 h-3"
                    />
                  </th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">文件名</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">格式</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">大小</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">修改时间</th>
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">路径</th>
                </tr>
              </thead>
              <tbody>
                {scannedFiles.map((file, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={file.selected}
                        onChange={() => handleToggleFile(index)}
                        className="w-3 h-3"
                      />
                    </td>
                    <td className="py-2 px-3 font-medium text-sm truncate max-w-xs">{file.name}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs uppercase">
                        {file.ext}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(file.modified)}
                    </td>
                    <td className="py-2 px-3 text-sm text-gray-500 dark:text-gray-500 font-mono truncate max-w-xs">
                      {file.path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 移动端卡片列表 */}
          <div className="md:hidden space-y-2 mb-4">
            {scannedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={file.selected}
                  onChange={() => handleToggleFile(index)}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {file.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs uppercase">
                      {file.ext}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 truncate mt-1">
                    修改时间: {formatDate(file.modified)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 批量导入按钮 */}
          <div className="flex justify-center">
            <button
              onClick={handleImportAll}
              disabled={importing || selectedCount === 0 || !agreedToDisclaimer}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  导入中 ({importProgress.current}/{importProgress.total})
                </>
              ) : (
                <>
                  <UploadIcon className="w-4 h-4" />
                  批量导入 ({selectedCount})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 导入历史 */}
      {showHistory && (
        <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">导入历史</h2>
            </div>
            {importHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                清空历史
              </button>
            )}
          </div>

          {loadingHistory ? (
            <div className="text-center py-6">
              <Loader className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">加载中...</p>
            </div>
          ) : importHistory.length === 0 ? (
            <div className="text-center py-6">
              <History className="w-10 h-10 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-500 dark:text-gray-400">暂无导入历史</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {importHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(item.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{item.file_name}</p>
                    <p className={`text-xs ${getStatusColor(item.status)} mt-1`}>
                      {item.message}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-2">
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
