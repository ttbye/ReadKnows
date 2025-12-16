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
  const [category, setCategory] = useState('未分类');
  const [deleteSource, setDeleteSource] = useState(false); // 是否删除源文件
  const [bookCategories, setBookCategories] = useState<string[]>([]);
  
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
        setBookCategories(['未分类']);
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
        setBookCategories(['未分类']);
      }
    } catch (error: any) {
      console.error('获取书籍类型列表失败:', error);
      console.error('错误状态码:', error.response?.status);
      console.error('错误详情:', error.response?.data || error.message);
      // 使用默认分类列表
      setBookCategories(['未分类', '小说', '文学', '历史', '哲学', '武侠', '传记', '科技', '计算机', '编程', '经济', '管理', '心理学', '社会科学', '自然科学', '艺术', '教育', '儿童读物', '漫画']);
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
    if (!window.confirm('确定要清空导入历史吗？')) {
      return;
    }

    try {
      await api.delete('/scan/import-history');
      setImportHistory([]);
      toast.success('导入历史已清空');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '清空失败');
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
    toast.success(`已添加 ${files.length} 个文件`);
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
    const selectedFiles = localFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      toast.error('请至少选择一个文件');
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
          toast.error(`✗ ${localFile.name}: ${error.response?.data?.error || '上传失败'}`, { duration: 3000 });
        }
      }

      // 显示汇总结果
      if (uploaded > 0) {
        toast.success(`成功上传 ${uploaded} 本书籍`);
      }
      if (failed > 0) {
        toast.error(`失败 ${failed} 本`);
      }

      // 移除已上传的文件
      setLocalFiles(localFiles.filter((f) => !f.selected));
      
      // 刷新导入历史
      if (showHistory) {
        fetchImportHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || '批量上传失败');
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
      toast.error('请输入扫描路径');
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
        toast.success(`扫描完成，找到 ${files.length} 个文件（${errorCount} 个错误）`, {
          duration: 4000,
        });
      } else {
        toast.success(`扫描完成，找到 ${files.length} 个文件`);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || '扫描失败';
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
    const selectedFiles = scannedFiles.filter((f) => f.selected);
    if (selectedFiles.length === 0) {
      toast.error('请至少选择一个文件');
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
        toast.success(`导入成功 ${imported} 本书籍`);
      }
      if (skipped > 0) {
        toast(`跳过 ${skipped} 本（已存在或不支持）`, { icon: 'ℹ️' });
      }
      if (failed > 0) {
        toast.error(`失败 ${failed} 本`);
      }

      // 移除已导入的文件
      setScannedFiles(scannedFiles.filter((f) => !f.selected));
      
      // 刷新导入历史
      if (showHistory) {
        fetchImportHistory();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || '批量导入失败');
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
    return new Date(dateString).toLocaleString('zh-CN');
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">请先登录</p>
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
          {showHistory ? '隐藏历史' : '导入历史'}
        </button>
      </div>

      {/* 全局导入选项卡片 */}
      <div className="card bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 border-2 border-blue-200 dark:border-blue-700 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">导入选项</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">这些选项适用于所有导入方式（批量选择和目录扫描）</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {/* 书籍分类 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              📚 书籍分类
            </label>
            <CategoryCombobox
              value={category}
              onChange={setCategory}
              categories={bookCategories}
              placeholder="选择或输入书籍分类"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              导入的所有书籍将使用此分类，可在书籍详情页单独修改
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
                  🔍 自动从豆瓣获取书籍信息
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                自动获取书籍封面、简介、评分等详细信息
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
                  🌐 设为公开书籍
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {isPublic ? '✅ 所有用户都可以查看（默认）' : '🔒 仅自己可见'}
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
                  📄 自动将TXT转换为EPUB
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                TXT文件会转换为EPUB格式以获得更好的阅读体验
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
                  📱 自动将MOBI转换为EPUB
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                MOBI文件会转换为EPUB格式以支持在线阅读（需要安装 Calibre）
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
                  🗑️ 导入后删除源文件
                </span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
                {deleteSource ? '⚠️ 导入成功后将删除原始文件' : '✅ 保留原始文件（默认）'}
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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">批量选择</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                从本地选择文件
              </label>
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg cursor-pointer hover:border-purple-500 transition-colors bg-white dark:bg-gray-800">
                <div className="text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    点击选择文件（支持单个或多个）
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    支持 EPUB, PDF, TXT, MOBI, Word, Excel, PowerPoint, Markdown
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
                <p>📚 已选择 {localFiles.length} 个文件</p>
              </div>
            )}
          </div>
        </div>

        {/* 目录扫描（服务器） */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Folder className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">目录扫描</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">服务器路径</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="例如: /app/scan"
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
                      扫描中...
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      扫描
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
                本地文件列表 ({localFiles.length} 个文件)
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAllLocalFiles}
                className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
              >
                {localFiles.every((f) => f.selected) ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                已选择 {selectedLocalCount} 个
              </span>
              <button
                onClick={handleBatchUpload}
                disabled={batchUploading || selectedLocalCount === 0}
                className="btn btn-primary bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {batchUploading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    上传中 ({batchProgress.current}/{batchProgress.total})...
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
                  <th className="text-left py-3 px-4">文件名</th>
                  <th className="text-left py-3 px-4">格式</th>
                  <th className="text-left py-3 px-4">大小</th>
                  <th className="text-left py-3 px-4">操作</th>
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
                        title="移除"
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
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">使用说明：</p>
                <ul className="space-y-1 text-xs">
                  <li>• 点击上方"批量选择"按钮，可一次选择多个文件</li>
                  <li>• 勾选要上传的文件，点击"批量上传"开始上传</li>
                  <li>• 系统会逐个上传文件，实时显示进度</li>
                  <li>• 上传成功的文件会自动从列表中移除</li>
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
                服务器目录扫描结果 ({scannedFiles.length} 个文件)
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {scannedFiles.every((f) => f.selected) ? '取消全选' : '全选'}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                已选择 {selectedCount} 个
              </span>
              <button
                onClick={handleImportAll}
                disabled={importing || selectedCount === 0}
                className="btn btn-primary"
              >
                {importing ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    导入中 ({importProgress.current}/{importProgress.total})...
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-4 h-4" />
                    导入所有 ({selectedCount})
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
                  <th className="text-left py-3 px-4">文件名</th>
                  <th className="text-left py-3 px-4">格式</th>
                  <th className="text-left py-3 px-4">大小</th>
                  <th className="text-left py-3 px-4">修改时间</th>
                  <th className="text-left py-3 px-4">路径</th>
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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">导入历史</h2>
            </div>
            {importHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                清空历史
              </button>
            )}
          </div>

          {loadingHistory ? (
            <div className="text-center py-8">
              <Loader className="w-6 h-6 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">加载中...</p>
            </div>
          ) : importHistory.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-12 h-12 mx-auto text-gray-400 mb-2" />
              <p className="text-gray-500 dark:text-gray-400">暂无导入历史</p>
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
                      <span>{new Date(item.created_at).toLocaleString('zh-CN')}</span>
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
