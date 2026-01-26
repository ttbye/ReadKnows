/**
 * @file AudiobookImport.tsx
 * @description 有声小说导入页面
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { 
  Music, 
  Folder, 
  Scan, 
  CheckCircle, 
  XCircle, 
  Loader, 
  Upload,
  Search,
  User,
  BookOpen,
  FileAudio,
  Pause,
  Play
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';

// ==================== 类型定义 ====================

/**
 * File System Access API 的 DirectoryHandle 类型定义
 */
interface DirectoryHandleEntry {
  name: string;
  kind: 'directory' | 'file';
  values?: () => AsyncIterableIterator<DirectoryHandleEntry>;
  getFile?: () => Promise<File>;
}

/**
 * 本地音频文件类型（包含 File 对象）
 */
interface LocalAudioFile {
  name: string;
  path: string;
  size: number;
  type: string;
  file: File;
  lastModified?: number;
}

/**
 * 音频文件信息类型（不包含 File 对象，用于服务器端）
 */
interface AudioFileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
}

/**
 * 文件夹元数据
 */
interface FolderMetadata {
  title?: string;
  author?: string;
  description?: string;
  summary?: string;
  chapters?: Array<{
    id: number;
    title: string;
    start: number;
    end: number;
  }>;
  [key: string]: any;
}

/**
 * 音频文件夹信息
 */
interface AudioFolder {
  folderName: string;
  folderPath: string;
  relativePath: string;
  audioFileCount: number;
  totalSize: number;
  hasCover?: boolean;
  hasMetadata?: boolean;
  metadata?: FolderMetadata;
  audioFiles: AudioFileInfo[];
  // 本地目录扫描时使用的额外字段
  _directoryHandle?: DirectoryHandleEntry;
  _audioFiles?: LocalAudioFile[];
  _coverFile?: File | null;
}

interface AudiobookType {
  value: string;
  label: string;
}

// ==================== 常量定义 ====================

/**
 * 文件大小限制（与后端保持一致）
 */
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB per file
const MAX_SINGLE_FILE_SIZE_MB = 1024; // 1GB

/**
 * 支持的音频文件扩展名
 */
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma'];

/**
 * 支持的音频文件 MIME 类型
 */
const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'audio/wav',
  'audio/ogg',
  'audio/opus',
  'audio/x-ms-wma',
];

const AUDIOBOOK_TYPES: AudiobookType[] = [
  { value: '有声小说', label: '有声小说' },
  { value: '有声历史', label: '有声历史' },
  { value: '有声读物', label: '有声读物' },
  { value: '其他', label: '其他' },
];

export default function AudiobookImport() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();

  const [scanning, setScanning] = useState(false);
  const [folders, setFolders] = useState<AudioFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<AudioFolder | null>(null);
  const [importing, setImporting] = useState(false);
  
  // 本地目录扫描
  const [localScanPath, setLocalScanPath] = useState('');
  const [scanningLocal, setScanningLocal] = useState(false);
  const [localFolders, setLocalFolders] = useState<AudioFolder[]>([]);
  const [selectedLocalFolder, setSelectedLocalFolder] = useState<AudioFolder | null>(null);
  const [uploadingLocal, setUploadingLocal] = useState(false);
  const [uploadMode, setUploadMode] = useState<'server' | 'local'>('server'); // 上传模式：服务器目录或本地目录
  const directoryInputRef = useRef<HTMLInputElement>(null);
  
  // 上传进度状态
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLoaded, setUploadLoaded] = useState(0); // 已上传字节数
  const [uploadTotal, setUploadTotal] = useState(0); // 总字节数
  
  // 分批上传状态
  const [uploadSpeed, setUploadSpeed] = useState(0); // 上传速度 KB/s
  const [estimatedTime, setEstimatedTime] = useState(0); // 剩余时间（秒）
  const [currentFileName, setCurrentFileName] = useState(''); // 当前上传的文件名
  const [uploadedFileCount, setUploadedFileCount] = useState(0); // 已上传文件数
  const [totalFileCount, setTotalFileCount] = useState(0); // 总文件数
  const [isPaused, setIsPaused] = useState(false); // 是否暂停
  const [uploadAbortController, setUploadAbortController] = useState<AbortController | null>(null); // 用于取消上传
  const [audiobookId, setAudiobookId] = useState<string | null>(null); // 上传会话ID
  
  // 表单字段
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [type, setType] = useState('有声小说');
  const [isPublic, setIsPublic] = useState(true);
  const [authorInput, setAuthorInput] = useState('');
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [authors, setAuthors] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // 加载作者列表
  useEffect(() => {
    if (isAuthenticated) {
      fetchAuthors();
    }
  }, [isAuthenticated]);

  const fetchAuthors = async () => {
    try {
      const response = await api.get('/audiobooks/authors/list');
      if (response.data.success) {
        setAuthors(response.data.authors);
      }
    } catch (error: unknown) {
      console.error('获取作者列表失败:', error);
      // 静默失败，不影响主要功能
    }
  };

  // 检查上传权限
  const canUploadAudiobook = (user as any)?.can_upload_audiobook !== undefined 
    ? (user as any).can_upload_audiobook 
    : (user?.role === 'admin'); // 默认：管理员允许，普通用户禁用

  // 扫描服务器端文件夹
  const handleScan = async () => {
    if (!isAuthenticated) {
      toast.error('请先登录');
      return;
    }

    if (!canUploadAudiobook && user?.role !== 'admin') {
      toast.error('您没有权限上传有声小说，请联系管理员开启此权限');
      return;
    }

    setScanning(true);
    try {
      const response = await api.post('/audiobooks/scan-folders');
      if (response.data.success) {
        setFolders(response.data.folders);
        toast.success(t('audiobook.scanSuccess', { count: response.data.folders.length }));
      } else {
        toast.error(t('audiobook.scanFailed'));
      }
    } catch (error: unknown) {
      console.error('扫描失败:', error);
      const errorMessage = handleUploadError(error);
      toast.error(errorMessage);
    } finally {
      setScanning(false);
    }
  };

  // ==================== 文件验证工具函数 ====================
  
  /**
   * 验证音频文件
   */
  const validateAudioFile = (file: File): { valid: boolean; reason?: string } => {
    // 检查文件大小
    if (file.size === 0) {
      return { valid: false, reason: '文件为空' };
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return { 
        valid: false, 
        reason: `文件大小超过限制（最大 ${MAX_SINGLE_FILE_SIZE_MB}MB）` 
      };
    }
    
    // 检查文件类型
    const fileName = file.name.toLowerCase();
    const ext = fileName.substring(fileName.lastIndexOf('.'));
    const isValidExtension = AUDIO_EXTENSIONS.includes(ext);
    const isValidMimeType = file.type && AUDIO_MIME_TYPES.includes(file.type);
    
    if (!isValidExtension && !isValidMimeType) {
      return { valid: false, reason: '不支持的文件格式，仅支持 MP3、M4A、AAC、FLAC、WAV、OGG、OPUS、WMA' };
    }
    
    return { valid: true };
  };

  // ==================== 日志工具函数 ====================
  
  /**
   * 开发环境日志输出（生产环境不输出，提升性能）
   */
  const devLog = (...args: unknown[]): void => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  };
  
  const devWarn = (...args: unknown[]): void => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    }
  };
  
  const devError = (...args: unknown[]): void => {
    // 错误日志始终输出，便于调试
    console.error(...args);
  };

  // ==================== 分批上传工具函数 ====================
  
  /**
   * 上传单个批次（带重试机制）
   */
  const uploadBatchWithRetry = async (
    batch: LocalAudioFile[],
    batchIndex: number,
    audiobookId: string,
    abortSignal: AbortSignal,
    checkPaused: () => boolean,
    batchStartBytes: number, // 批次开始时的累计字节数
    onBatchProgress?: (loaded: number, total: number) => void, // 批次进度回调
    maxRetries: number = 3
  ): Promise<{ success: boolean; uploadedFiles: number }> => {
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 检查是否已暂停
        while (checkPaused() && !abortSignal.aborted) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
        
        if (abortSignal.aborted) {
          throw new Error('上传已取消');
        }
        
        const formData = new FormData();
        formData.append('audiobookId', audiobookId);
        formData.append('batchIndex', batchIndex.toString());
        
        // 添加批次文件
        batch.forEach((audioFile) => {
          const file = audioFile.file!;
          const fileName = file.name || audioFile.name || 'audio.mp3';
          formData.append('audioFiles', file, fileName);
        });
        
        // 上传批次
        const response = await api.post('/audiobooks/upload-batch', formData, {
          timeout: 600000, // 10分钟超时
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          signal: abortSignal,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && progressEvent.total > 0) {
              // 调用批次进度回调，更新总体进度
              if (onBatchProgress) {
                onBatchProgress(progressEvent.loaded, progressEvent.total);
              }
              
              const batchProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              // 更新当前文件名
              if (batch.length > 0) {
                const currentFileIndex = Math.floor((batchProgress / 100) * batch.length);
                const currentFile = batch[Math.min(currentFileIndex, batch.length - 1)];
                if (currentFile) {
                  setCurrentFileName(currentFile.file?.name || currentFile.name || '');
                }
              }
            }
          },
        });
        
        if (response.data.success) {
          return { success: true, uploadedFiles: batch.length };
        } else {
          throw new Error(response.data.error || '批次上传失败');
        }
      } catch (error: unknown) {
        retries++;
        
        // 如果是取消错误，直接抛出
        if (error instanceof Error && (error.name === 'AbortError' || error.message === '上传已取消')) {
          throw error;
        }
        
        if (retries >= maxRetries) {
          devError(`[批次 ${batchIndex}] 上传失败，已重试 ${maxRetries} 次:`, error);
          return { success: false, uploadedFiles: 0 };
        }
        
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
        devWarn(`[批次 ${batchIndex}] 上传失败，${delay}ms 后重试 (${retries}/${maxRetries}):`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return { success: false, uploadedFiles: 0 };
  };

  // ==================== 错误处理工具函数 ====================
  
  /**
   * 处理上传错误，提供友好的用户提示
   */
  const handleUploadError = (error: unknown): string => {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const axiosError = error as { response?: { status?: number; data?: { error?: string } } };
      const status = axiosError.response?.status;
      const errorData = axiosError.response?.data;
      
      if (status === 413) {
        return '文件大小超过服务器限制（最大 1GB/文件）';
      } else if (status === 400) {
        return errorData?.error || '请求参数错误，请检查文件格式';
      } else if (status === 403) {
        return errorData?.error || '权限不足，无法上传';
      } else if (status === 500) {
        return errorData?.error || '服务器错误，请稍后重试';
      } else if (status === 413 || status === 414) {
        return '上传文件过大，请减小文件大小';
      }
      
      return errorData?.error || '上传失败，请重试';
    }
    
    if (error instanceof Error) {
      // 网络错误
      if (error.message.includes('Network Error') || error.message.includes('network')) {
        return '网络连接失败，请检查网络连接';
      }
      // 超时错误
      if (error.message.includes('timeout')) {
        return '上传超时，请重试或减小文件大小';
      }
      return error.message;
    }
    
    return '上传失败，未知错误';
  };

  // 递归读取目录中的所有音频文件（优化：并行读取文件）
  const readDirectoryFiles = async (directoryHandle: DirectoryHandleEntry, basePath: string = ''): Promise<LocalAudioFile[]> => {
    const files: LocalAudioFile[] = [];
    
    try {
      // 先收集所有条目
      const entries: Array<{entry: any, path: string}> = [];
      for await (const entry of directoryHandle.values()) {
        const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        entries.push({ entry, path: entryPath });
      }
      
      // 并行处理文件和目录
      const filePromises: Promise<void>[] = [];
      const dirPromises: Promise<LocalAudioFile[]>[] = [];
      
      for (const { entry, path: entryPath } of entries) {
        if (entry.kind === 'file') {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) {
            // 并行读取文件
            if (entry.getFile) {
              filePromises.push(
                entry.getFile().then((file: File) => {
                  // 验证文件
                  const validation = validateAudioFile(file);
                  if (!validation.valid) {
                    devWarn(`跳过文件 ${entry.name}: ${validation.reason}`);
                    return;
                  }
                  
                  files.push({
                    name: entry.name,
                    path: entryPath,
                    size: file.size,
                    type: ext.substring(1),
                    file: file,
                    lastModified: file.lastModified,
                  });
                }).catch((error: unknown) => {
                  console.warn(`无法读取文件 ${entry.name}:`, error);
                })
              );
            }
          }
        } else if (entry.kind === 'directory' && entry.values) {
          // 递归读取子目录
          dirPromises.push(readDirectoryFiles(entry, entryPath));
        }
      }
      
      // 等待所有文件读取完成
      await Promise.all(filePromises);
      
      // 等待所有子目录读取完成
      const subFilesArrays = await Promise.all(dirPromises);
      subFilesArrays.forEach(subFiles => files.push(...subFiles));
      
    } catch (error: unknown) {
      devError(`读取目录失败 ${basePath}:`, error);
    }
    
    return files;
  };

  // 使用系统目录选择器选择目录并扫描
  const handleSelectDirectory = async () => {
    try {
      // 检查是否支持 File System Access API（现代浏览器）
      if ('showDirectoryPicker' in window) {
        try {
          setScanningLocal(true);
          // 使用现代 File System Access API
          const directoryHandle = await (window as { showDirectoryPicker: () => Promise<DirectoryHandleEntry> }).showDirectoryPicker() as DirectoryHandleEntry;
          const dirName = directoryHandle.name;
          
          // 仅显示目录名，不暴露完整路径（安全性改进）
          toast.success(`正在扫描目录: ${dirName}...`, { duration: 2000 });
          
          // 读取目录中的所有音频文件
          const audioFiles = await readDirectoryFiles(directoryHandle);
          
          if (audioFiles.length === 0) {
            toast.error('目录中没有找到有效的音频文件');
            setScanningLocal(false);
            return;
          }
          
          // 查找封面和元数据文件
          let coverFile: File | null = null;
          let metadataContent: FolderMetadata | null = null;
          
          try {
            for await (const entry of directoryHandle.values()) {
              if (entry.kind === 'file') {
                const fileName = entry.name.toLowerCase();
                const ext = fileName.substring(fileName.lastIndexOf('.'));
                
                // 检查封面
                if (!coverFile && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                  if (fileName.includes('cover') || fileName.includes('封面')) {
                    coverFile = await entry.getFile();
                  }
                }
                
                // 检查元数据
                if (!metadataContent && fileName === 'metadata.json') {
                  try {
                    const file = await entry.getFile();
                    const text = await file.text();
                    metadataContent = JSON.parse(text);
                  } catch (e) {
                    console.warn('解析元数据文件失败:', e);
                  }
                }
              }
            }
          } catch (error: any) {
            console.warn('查找封面和元数据失败:', error);
          }
          
          // 组织文件夹结构
          const folder: AudioFolder = {
            folderName: dirName,
            folderPath: dirName, // 使用目录名作为标识
            relativePath: dirName,
            audioFileCount: audioFiles.length,
            totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
            hasCover: coverFile !== null,
            hasMetadata: metadataContent !== null,
            metadata: metadataContent ? {
              title: metadataContent.title,
              author: metadataContent.author,
              description: metadataContent.description,
              summary: metadataContent.summary,
            } : undefined,
            audioFiles: audioFiles.map(f => ({
              name: f.name,
              path: f.path,
              size: f.size,
              type: f.type,
            })),
            // 保存文件对象和目录句柄用于上传
            _directoryHandle: directoryHandle,
            _audioFiles: audioFiles,
            _coverFile: coverFile,
          };
          
          setLocalFolders([folder]);
          // 仅保存目录名，不暴露完整路径（安全性改进）
          setLocalScanPath(dirName);
          toast.success(`扫描完成，找到 ${audioFiles.length} 个音频文件`, { duration: 3000 });
        } catch (error: unknown) {
          // 用户取消选择或其他错误
          if (error instanceof Error) {
            if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
              console.error('选择目录失败:', error);
              toast.error('选择目录失败: ' + error.message);
            }
          } else {
            console.error('选择目录失败:', error);
            toast.error('选择目录失败: 未知错误');
          }
        } finally {
          setScanningLocal(false);
        }
      } else if (directoryInputRef.current) {
        // 降级方案：使用传统的文件输入（webkitdirectory）
        directoryInputRef.current.click();
      } else {
        toast.error('您的浏览器不支持目录选择功能');
      }
    } catch (error: unknown) {
      console.error('选择目录失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast.error('选择目录失败: ' + errorMessage);
      setScanningLocal(false);
    }
  };

  // 处理传统文件输入（webkitdirectory）的选择
  const handleDirectoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // 从第一个文件获取路径信息
      const firstFile = files[0];
      // 尝试获取路径（webkitRelativePath 包含相对路径）
      const webkitPath = (firstFile as any).webkitRelativePath;
      if (webkitPath) {
        // 提取目录名称（第一个路径段）
        const dirName = webkitPath.split('/')[0];
        // 注意：webkitRelativePath 是相对路径，不是绝对路径
        // 浏览器出于安全考虑不会暴露完整路径
        toast.success(`已选择目录: ${dirName}\n请手动输入完整路径到输入框`, { duration: 3000 });
      } else {
        toast.success('已选择目录，请手动输入完整路径到输入框', { duration: 3000 });
      }
    }
    // 重置 input，允许再次选择
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  };

  // 扫描本地目录（已废弃，现在使用 handleSelectDirectory）
  const handleScanLocal = async () => {
    // 提示用户使用目录选择器
    toast.error('请使用"浏览"按钮选择本地目录');
  };

  // 选择文件夹（服务器端）
  const handleSelectFolder = (folder: AudioFolder) => {
    setSelectedFolder(folder);
    setSelectedLocalFolder(null);
    setUploadMode('server');
    // 自动填充标题和作者（优先使用元数据，否则使用文件夹名）
    if (folder.metadata) {
      setTitle(folder.metadata.title || folder.folderName);
      setAuthorInput(folder.metadata.author || '');
    } else {
      setTitle(folder.folderName);
      setAuthorInput('');
    }
  };

  // 选择本地文件夹
  const handleSelectLocalFolder = (folder: AudioFolder) => {
    setSelectedLocalFolder(folder);
    setSelectedFolder(null);
    setUploadMode('local');
    // 自动填充标题和作者（优先使用元数据，否则使用文件夹名）
    if (folder.metadata) {
      setTitle(folder.metadata.title || folder.folderName);
      setAuthorInput(folder.metadata.author || '');
    } else {
      setTitle(folder.folderName);
      setAuthorInput('');
    }
  };

  // 导入有声小说（服务器端）
  const handleImport = async () => {
    if (!isAuthenticated) {
      toast.error('请先登录');
      return;
    }

    if (!canUploadAudiobook && user?.role !== 'admin') {
      toast.error('您没有权限上传有声小说，请联系管理员开启此权限');
      return;
    }

    if (!selectedFolder) {
      toast.error(t('audiobook.selectFolder'));
      return;
    }

    if (!title.trim()) {
      toast.error(t('audiobook.enterTitle'));
      return;
    }

    if (!type) {
      toast.error(t('audiobook.selectType'));
      return;
    }

    setImporting(true);
    try {
      const response = await api.post('/audiobooks/import', {
        folderPath: selectedFolder.folderPath,
        title: title.trim(),
        author: authorInput.trim() || null,
        type,
        isPublic,
      });

      if (response.data.success) {
        toast.success(t('audiobook.importSuccess', { count: response.data.files.length }));
        // 重置表单
        setSelectedFolder(null);
        setTitle('');
        setAuthorInput('');
        setType('有声小说');
        // 重新扫描
        handleScan();
      } else {
        toast.error(t('audiobook.importFailed'));
      }
    } catch (error: unknown) {
      console.error('导入失败:', error);
      const errorMessage = handleUploadError(error);
      toast.error(errorMessage);
    } finally {
      setImporting(false);
    }
  };

  // 暂停上传
  const handlePauseUpload = () => {
    setIsPaused(true);
    toast('上传已暂停', { icon: '⏸️' });
  };

  // 继续上传
  const handleResumeUpload = () => {
    setIsPaused(false);
    toast('上传已继续', { icon: '▶️' });
  };

  // 取消上传
  const handleCancelUpload = () => {
    if (uploadAbortController) {
      uploadAbortController.abort();
      setUploadAbortController(null);
    }
    setIsPaused(false);
    setUploadingLocal(false);
    setUploadProgress(0);
    setUploadLoaded(0);
    setUploadTotal(0);
    setUploadSpeed(0);
    setEstimatedTime(0);
    setCurrentFileName('');
    setUploadedFileCount(0);
    setTotalFileCount(0);
    setAudiobookId(null);
    toast('上传已取消', { icon: '❌' });
  };

  // 上传本地文件夹（分批并发上传）
  const handleUploadLocal = async () => {
    if (!isAuthenticated) {
      toast.error('请先登录');
      return;
    }

    if (!canUploadAudiobook && user?.role !== 'admin') {
      toast.error('您没有权限上传有声小说，请联系管理员开启此权限');
      return;
    }

    if (!selectedLocalFolder) {
      toast.error(t('audiobook.selectFolder'));
      return;
    }

    if (!title.trim()) {
      toast.error(t('audiobook.enterTitle'));
      return;
    }

    if (!type) {
      toast.error(t('audiobook.selectType'));
      return;
    }

    // 检查是否有文件需要上传
    if (!selectedLocalFolder._audioFiles || selectedLocalFolder._audioFiles.length === 0) {
      toast.error('没有找到音频文件');
      return;
    }

    // 初始化上传状态
    setUploadingLocal(true);
    setIsPaused(false);
    setUploadProgress(0);
    setUploadLoaded(0);
    setUploadTotal(0);
    setUploadSpeed(0);
    setEstimatedTime(0);
    setCurrentFileName('');
    setUploadedFileCount(0);
    setTotalFileCount(0);
    
    // 创建 AbortController 用于取消上传
    const abortController = new AbortController();
    setUploadAbortController(abortController);
    
    // 初始化速度计算
    (window as any).lastUploadTime = Date.now();
    (window as any).lastUploadLoaded = 0;
    
    try {
      // 预先验证和准备文件
      const validFiles: LocalAudioFile[] = [];
      const invalidFiles: Array<{ name: string; reason: string }> = [];
      
      selectedLocalFolder._audioFiles.forEach((audioFile) => {
        if (!audioFile.file) {
          invalidFiles.push({ name: audioFile.name || '未知文件', reason: '文件对象缺失' });
          return;
        }
        
        const file = audioFile.file;
        const fileName = file.name || audioFile.name || 'audio.mp3';
        const validation = validateAudioFile(file);
        
        if (!validation.valid) {
          invalidFiles.push({ name: fileName, reason: validation.reason || '验证失败' });
          return;
        }
        
        validFiles.push(audioFile);
      });
      
      // 按文件大小排序：小文件优先
      validFiles.sort((a, b) => (a.file?.size || 0) - (b.file?.size || 0));
      
      if (validFiles.length === 0) {
        toast.error('没有有效的音频文件可以上传');
        setUploadingLocal(false);
        return;
      }
      
      // 提示无效文件
      if (invalidFiles.length > 0) {
        devWarn(`[上传] ${invalidFiles.length} 个文件被跳过:`, invalidFiles);
        toast.error(`有 ${invalidFiles.length} 个文件被跳过，原因：${invalidFiles[0].reason}`, { duration: 4000 });
      }
      
      // 计算总大小
      const totalSize = validFiles.reduce((sum, f) => sum + (f.file?.size || 0), 0);
      setUploadTotal(totalSize);
      setTotalFileCount(validFiles.length);
      
      devLog(`[上传] 准备上传 ${validFiles.length} 个文件，总大小: ${formatFileSize(totalSize)}`);
      
      // 步骤1: 创建有声书记录
      devLog('[上传] 步骤1: 创建有声书记录...');
      const createResponse = await api.post('/audiobooks/create', {
        title: title.trim(),
        author: authorInput.trim() || null,
        type,
        isPublic,
        metadata: selectedLocalFolder.metadata || null,
        coverFile: selectedLocalFolder._coverFile ? {
          name: selectedLocalFolder._coverFile.name,
          size: selectedLocalFolder._coverFile.size,
          type: selectedLocalFolder._coverFile.type,
        } : null,
        totalFiles: validFiles.length,
        totalSize: totalSize,
      });
      
      if (!createResponse.data.success || !createResponse.data.audiobookId) {
        throw new Error(createResponse.data.error || '创建有声书记录失败');
      }
      
      const newAudiobookId = createResponse.data.audiobookId;
      setAudiobookId(newAudiobookId);
      devLog(`[上传] 有声书记录已创建: ${newAudiobookId}`);
      
      // 上传封面（如果有）
      if (selectedLocalFolder._coverFile && createResponse.data.needUploadCover) {
        devLog('[上传] 上传封面文件...');
        const coverFormData = new FormData();
        coverFormData.append('audiobookId', newAudiobookId);
        coverFormData.append('cover', selectedLocalFolder._coverFile, selectedLocalFolder._coverFile.name);
        
        await api.post('/audiobooks/upload-cover', coverFormData, {
          timeout: 60000,
          signal: abortController.signal,
        });
      }
      
      // 步骤2: 分批上传文件
      const BATCH_SIZE = 8; // 每批8个文件（增大批次大小以提升效率）
      const CONCURRENT_BATCHES = 3; // 同时上传3个批次（增加并发度）
      const batches: LocalAudioFile[][] = [];
      
      // 将文件分成批次
      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        batches.push(validFiles.slice(i, i + BATCH_SIZE));
      }
      
      devLog(`[上传] 文件已分为 ${batches.length} 个批次，每批最多 ${BATCH_SIZE} 个文件`);
      
      let uploadedFiles = 0;
      let totalUploadedBytes = 0;
      const failedBatches: number[] = [];
      
      // 计算每个批次的大小和起始位置
      const batchSizes = batches.map(batch => batch.reduce((sum, f) => sum + (f.file?.size || 0), 0));
      const batchStartPositions: number[] = [];
      let currentPosition = 0;
      batchSizes.forEach(size => {
        batchStartPositions.push(currentPosition);
        currentPosition += size;
      });
      
      // 全局进度跟踪
      const batchUploadedBytes = new Map<number, number>(); // 记录每个批次已上传的字节数
      
      // 更新总体进度的函数
      const updateOverallProgress = () => {
        let totalLoaded = 0;
        batchUploadedBytes.forEach((bytes) => {
          totalLoaded += bytes;
        });
        totalLoaded += totalUploadedBytes; // 已完成的批次大小
        
        const progress = totalSize > 0 ? Math.round((totalLoaded * 100) / totalSize) : 0;
        setUploadProgress(progress);
        setUploadLoaded(totalLoaded);
        
        // 计算上传速度
        const now = Date.now();
        const lastTime = (window as any).lastUploadTime || now;
        const timeDiff = (now - lastTime) / 1000; // 秒
        
        if (timeDiff > 0 && (window as any).lastUploadLoaded !== undefined) {
          const lastLoaded = (window as any).lastUploadLoaded;
          const bytesDiff = totalLoaded - lastLoaded;
          const speed = bytesDiff / timeDiff / 1024; // KB/s
          
          if (speed > 0 && !isNaN(speed) && isFinite(speed)) {
            setUploadSpeed(speed);
            
            // 计算剩余时间
            const totalRemaining = totalSize - totalLoaded;
            if (totalRemaining > 0 && speed > 0) {
              setEstimatedTime(Math.round(totalRemaining / (speed * 1024)));
            }
          }
        }
        
        (window as any).lastUploadTime = now;
        (window as any).lastUploadLoaded = totalLoaded;
      };
      
      // 初始化进度显示（显示总大小）
      setUploadTotal(totalSize);
      
      // 并发上传批次
      for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
        // 检查是否已取消
        if (abortController.signal.aborted) {
          throw new Error('上传已取消');
        }
        
        // 等待暂停状态
        while (isPaused && !abortController.signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (abortController.signal.aborted) {
          throw new Error('上传已取消');
        }
        
        // 获取当前批次的并发组
        const concurrentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
        
        // 并发上传当前组的所有批次
        const batchPromises = concurrentBatches.map(async (batch, batchIndex) => {
          const actualBatchIndex = i + batchIndex;
          const batchSize = batchSizes[actualBatchIndex];
          const batchStartPosition = batchStartPositions[actualBatchIndex];
          
          // 批次进度回调
          const onBatchProgress = (loaded: number, total: number) => {
            // 更新该批次的上传字节数
            batchUploadedBytes.set(actualBatchIndex, loaded);
            // 更新总体进度
            updateOverallProgress();
          };
          
          const result = await uploadBatchWithRetry(
            batch, 
            actualBatchIndex, 
            newAudiobookId,
            abortController.signal,
            () => isPaused,
            batchStartPosition,
            onBatchProgress
          );
          
          // 批次完成后，从进度跟踪中移除
          batchUploadedBytes.delete(actualBatchIndex);
          
          if (result.success) {
            uploadedFiles += result.uploadedFiles;
            totalUploadedBytes += batchSize;
            
            // 更新进度（确保完成批次也被计入）
            updateOverallProgress();
            setUploadedFileCount(uploadedFiles);
            
            devLog(`[批次 ${actualBatchIndex}] 上传成功: ${result.uploadedFiles} 个文件`);
          } else {
            failedBatches.push(actualBatchIndex);
            devError(`[批次 ${actualBatchIndex}] 上传失败`);
          }
        });
        
        await Promise.all(batchPromises);
      }
      
      // 检查是否有失败的批次
      if (failedBatches.length > 0) {
        throw new Error(`${failedBatches.length} 个批次上传失败，请重试`);
      }
      
      // 步骤3: 完成上传
      devLog('[上传] 步骤3: 完成上传...');
      const completeResponse = await api.post('/audiobooks/complete-upload', {
        audiobookId: newAudiobookId,
      }, {
        signal: abortController.signal,
      });
      
      if (!completeResponse.data.success) {
        throw new Error(completeResponse.data.error || '完成上传失败');
      }
      
      // 上传成功
      setUploadProgress(100);
      toast.success(t('audiobook.importSuccess', { count: uploadedFiles }));
      
      // 重置表单
      setSelectedLocalFolder(null);
      setLocalFolders([]);
      setTitle('');
      setAuthorInput('');
      setType('有声小说');
      setLocalScanPath('');
      
    } catch (error: unknown) {
      // 如果是取消错误，不显示错误提示
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      
      devError('[上传] 上传失败:', error);
      
      // 记录详细错误
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
        devError('[上传] 错误详情:', {
          message: axiosError.message,
          response: axiosError.response?.data,
          status: axiosError.response?.status,
        });
      }
      
      const errorMessage = handleUploadError(error);
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setUploadingLocal(false);
      setUploadAbortController(null);
      
      // 清理速度计算
      delete (window as any).lastUploadTime;
      delete (window as any).lastUploadLoaded;
      
      // 延迟重置进度
      setTimeout(() => {
        setUploadProgress(0);
        setUploadLoaded(0);
        setUploadTotal(0);
        setUploadSpeed(0);
        setEstimatedTime(0);
        setCurrentFileName('');
        setUploadedFileCount(0);
        setTotalFileCount(0);
        setAudiobookId(null);
      }, 2000);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  // 过滤文件夹
  const filteredFolders = folders.filter(folder => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      folder.folderName.toLowerCase().includes(query) ||
      folder.relativePath.toLowerCase().includes(query)
    );
  });

  // 过滤作者
  const filteredAuthors = authors.filter(author => {
    if (!authorInput) return false;
    return author.toLowerCase().includes(authorInput.toLowerCase());
  }).slice(0, 10);

  // 权限检查
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">请先登录</p>
      </div>
    );
  }

  if (!canUploadAudiobook && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Music className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">权限不足</p>
          <p className="text-gray-500 dark:text-gray-400">您没有权限上传有声小说，请联系管理员开启此权限</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full lg:max-w-6xl lg:mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <Music className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('audiobook.importTitle')}
            </h1>
          </div>

          {/* 上传模式切换 */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => {
                setUploadMode('server');
                setSelectedLocalFolder(null);
                setLocalFolders([]);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                uploadMode === 'server'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              服务器目录
            </button>
            <button
              onClick={() => {
                setUploadMode('local');
                setSelectedFolder(null);
                setFolders([]);
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                uploadMode === 'local'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              本地目录
            </button>
          </div>

          {/* 服务器端扫描 */}
          {uploadMode === 'server' && (
            <div className="mb-4">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {scanning ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t('audiobook.scanning')}
                  </>
                ) : (
                  <>
                    <Scan className="w-4 h-4" />
                    {t('audiobook.scanAudioimport')}
                  </>
                )}
              </button>
            </div>
          )}

          {/* 本地目录扫描 */}
          {uploadMode === 'local' && (
            <div className="mb-4">
              <button
                onClick={handleSelectDirectory}
                disabled={scanningLocal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="选择本地目录并扫描音频文件"
              >
                {scanningLocal ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    扫描中...
                  </>
                ) : (
                  <>
                    <Folder className="w-5 h-5" />
                    选择本地目录
                  </>
                )}
              </button>
              {localScanPath && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  已选择: {localScanPath}
                </p>
              )}
              {/* 隐藏的文件输入，用于降级方案 */}
              <input
                ref={directoryInputRef}
                type="file"
                // @ts-ignore - webkitdirectory is a non-standard HTML attribute
                webkitdirectory=""
                // @ts-ignore - directory is a non-standard HTML attribute
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleDirectoryInputChange}
              />
            </div>
          )}

          {/* 服务器端文件夹列表 */}
          {uploadMode === 'server' && folders.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Search className="w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder={t('common.search') + '...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFolders.map((folder, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectFolder(folder)}
                    className={`p-3 border rounded-md cursor-pointer transition-all ${
                      selectedFolder?.folderPath === folder.folderPath
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                            {folder.folderName}
                          </h3>
                          {folder.hasCover && (
                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs">
                              {t('audiobook.hasCover')}
                            </span>
                          )}
                          {folder.hasMetadata && (
                            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                              {t('audiobook.hasMetadata')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {folder.audioFileCount} {t('audiobook.audioFiles')} · {formatFileSize(folder.totalSize)}
                        </p>
                        {selectedFolder?.folderPath === folder.folderPath && (
                          <div className="mt-1.5 flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span className="text-xs">{t('common.selected')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 本地文件夹列表 */}
          {uploadMode === 'local' && localFolders.length > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {localFolders.map((folder, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectLocalFolder(folder)}
                    className={`p-3 border rounded-md cursor-pointer transition-all ${
                      selectedLocalFolder?.folderPath === folder.folderPath
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                            {folder.folderName}
                          </h3>
                          {folder.hasCover && (
                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-xs">
                              {t('audiobook.hasCover')}
                            </span>
                          )}
                          {folder.hasMetadata && (
                            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs">
                              {t('audiobook.hasMetadata')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {folder.audioFileCount} {t('audiobook.audioFiles')} · {formatFileSize(folder.totalSize)}
                        </p>
                        {selectedLocalFolder?.folderPath === folder.folderPath && (
                          <div className="mt-1.5 flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span className="text-xs">{t('common.selected')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 导入表单 */}
          {(selectedFolder || selectedLocalFolder) && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-4 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {t('audiobook.importInfo')}
              </h2>

              <div className="space-y-3">
                {/* 标题 */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <BookOpen className="w-3.5 h-3.5 inline mr-1" />
                    {t('audiobook.titleLabel')} *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('audiobook.enterTitle')}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* 作者 */}
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <User className="w-3.5 h-3.5 inline mr-1" />
                    {t('audiobook.authorLabel')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={authorInput}
                      onChange={(e) => {
                        setAuthorInput(e.target.value);
                        setShowAuthorDropdown(true);
                      }}
                      onFocus={() => setShowAuthorDropdown(true)}
                      placeholder={t('audiobook.selectOrEnterAuthor')}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    {showAuthorDropdown && filteredAuthors.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredAuthors.map((author, index) => (
                          <div
                            key={index}
                            onClick={() => {
                              setAuthorInput(author);
                              setShowAuthorDropdown(false);
                            }}
                            className="px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-white"
                          >
                            {author}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 类型 */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    <FileAudio className="w-3.5 h-3.5 inline mr-1" />
                    {t('audiobook.typeLabel')} *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {AUDIOBOOK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 公开/私有 */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t('audiobook.publicModeDesc')}
                    </span>
                  </label>
                </div>

                {/* 文件列表预览 */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t('audiobook.audioFiles')} ({(selectedFolder || selectedLocalFolder)?.audioFileCount || 0})
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-2 bg-white dark:bg-gray-700">
                    {(selectedFolder || selectedLocalFolder)?.audioFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
                      >
                        <FileAudio className="w-3.5 h-3.5 text-blue-600" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 上传进度显示（仅在上传时显示） */}
                {uploadMode === 'local' && uploadingLocal && (
                  <div className="space-y-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                    {/* 总体进度 */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">上传进度</span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {uploadProgress}% ({formatFileSize(uploadLoaded)} / {formatFileSize(uploadTotal)})
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className={`h-2.5 rounded-full transition-all duration-300 ease-out ${
                            isPaused ? 'bg-yellow-500' : 'bg-green-600'
                          }`}
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* 详细信息 */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">文件进度: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {uploadedFileCount} / {totalFileCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">上传速度: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {uploadSpeed > 0 ? `${uploadSpeed.toFixed(1)} KB/s` : '计算中...'}
                        </span>
                      </div>
                      {estimatedTime > 0 && (
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-gray-400">剩余时间: </span>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            {estimatedTime < 60 
                              ? `${estimatedTime} 秒` 
                              : `${Math.floor(estimatedTime / 60)} 分 ${estimatedTime % 60} 秒`}
                          </span>
                        </div>
                      )}
                      {currentFileName && (
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-gray-400">当前文件: </span>
                          <span className="text-gray-700 dark:text-gray-300 font-medium truncate block" title={currentFileName}>
                            {currentFileName}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 控制按钮 */}
                    <div className="flex gap-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                      {isPaused ? (
                        <button
                          onClick={handleResumeUpload}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium"
                        >
                          <Play className="w-3.5 h-3.5" />
                          继续上传
                        </button>
                      ) : (
                        <button
                          onClick={handlePauseUpload}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-xs font-medium"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          暂停
                        </button>
                      )}
                      <button
                        onClick={handleCancelUpload}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs font-medium"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        取消上传
                      </button>
                    </div>
                    
                    {isPaused && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 text-center">
                        上传已暂停，点击"继续上传"恢复
                      </p>
                    )}
                  </div>
                )}

                {/* 导入/上传按钮 */}
                <button
                  onClick={uploadMode === 'server' ? handleImport : handleUploadLocal}
                  disabled={(uploadMode === 'server' ? importing : uploadingLocal) || !title.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {(uploadMode === 'server' ? importing : uploadingLocal) ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      {t('audiobook.importing')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      {uploadMode === 'server' ? t('audiobook.import') : '上传'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {uploadMode === 'server' && folders.length === 0 && !scanning && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t('audiobook.clickToScan')}</p>
            </div>
          )}

          {uploadMode === 'local' && localFolders.length === 0 && !scanningLocal && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">请点击"选择本地目录"按钮选择目录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

