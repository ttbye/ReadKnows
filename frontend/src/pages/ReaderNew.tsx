/**
 * @author ttbye
 * 阅读器页面
 * 使用新的阅读器架构
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import ReaderContainer from '../components/readers/ReaderContainer';
import { ReadingSettings, defaultSettings, BookData, ReadingPosition, ReaderConfig } from '../types/reader';

export default function ReaderNew() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [initialPosition, setInitialPosition] = useState<ReadingPosition | undefined>();
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 获取阅读设置（仅从本地localStorage读取，不同步服务器）
  const fetchSettings = async () => {
    try {
      // 阅读设置仅保存在本地，不同步服务器
      // 这样不同平台可以有不同的字体设置而不冲突
      const savedSettings = localStorage.getItem('reading-settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          // 确保所有字段都被正确恢复，包括嵌套对象
          const restoredSettings: ReadingSettings = {
            ...defaultSettings,
            ...parsed,
            // 确保嵌套对象也被正确合并
            keyboardShortcuts: {
              ...defaultSettings.keyboardShortcuts,
              ...(parsed.keyboardShortcuts || {}),
            },
          };
          setSettings(restoredSettings);
        } catch (e) {
          console.error('ReaderNew: 解析本地设置失败', e);
          setSettings(defaultSettings);
        }
      } else {
        setSettings(defaultSettings);
      }
    } catch (error) {
      console.error('ReaderNew: 获取阅读设置失败', error);
      setSettings(defaultSettings);
    }
  };

  // 保存阅读设置（仅保存到本地localStorage）
  const saveSettings = async (newSettings: ReadingSettings) => {
    // 确保所有字段都被包含，合并默认值以防止字段丢失
    const completeSettings: ReadingSettings = {
      ...defaultSettings,
      ...newSettings,
      // 确保嵌套对象也被正确合并
      keyboardShortcuts: {
        ...defaultSettings.keyboardShortcuts,
        ...(newSettings.keyboardShortcuts || {}),
      },
    };
    
    setSettings(completeSettings);
    try {
      // 仅保存到本地，不同步服务器
      // 这样每个设备可以有独立的字体大小、行距等设置
      localStorage.setItem('reading-settings', JSON.stringify(completeSettings));
    } catch (error) {
      console.error('ReaderNew: 保存阅读设置失败', error);
    }
  };

  // 获取书籍信息
  useEffect(() => {
    const fetchBook = async () => {
      if (!bookId) return;

      try {
        setLoading(true);
        const response = await api.get(`/books/${bookId}`);
        let bookData = response.data.book;
        const formats = response.data.formats || [];

        if (!bookData) {
          toast.error('书籍不存在');
          setTimeout(() => navigate(-1), 1000);
          return;
        }

        // 如果是 Office 文件，检查是否有 PDF 版本，优先使用 PDF 阅读器
        const officeTypes = ['docx', 'doc', 'xlsx', 'xls', 'pptx'];
        if (officeTypes.includes(bookData.file_type?.toLowerCase())) {
          const pdfFormat = formats.find((f: any) => f.file_type?.toLowerCase() === 'pdf');
          if (pdfFormat) {
            console.log('[ReaderNew] Office 文件检测到 PDF 版本，使用 PDF 阅读器');
            bookData = pdfFormat; // 使用 PDF 版本的书籍数据
          }
        }

        setBook(bookData);
        await fetchSettings();

        // 创建阅读会话（每次打开书籍为一次阅读）
        if (isAuthenticated) {
          try {
            const sessionResponse = await api.post('/reading/history/session', {
              bookId,
              startTime: new Date().toISOString(),
            }            );
            if (sessionResponse.data.sessionId) {
              setSessionId(sessionResponse.data.sessionId);
            }
          } catch (error: any) {
            console.error('ReaderNew: 创建阅读会话失败', error);
            // 不影响阅读，继续执行
          }
        }

        // 获取阅读进度
        if (isAuthenticated) {
          try {
            const progressResponse = await api.get(`/reading/progress/${bookId}`);
            if (progressResponse.data.progress) {
              const progress = progressResponse.data.progress;
              
              // 优先使用 CFI（最精确），其次使用章节索引
              const initialPos: ReadingPosition = {
                chapterIndex: progress.chapter_index || 0,
                currentPage: progress.current_page || 1,
                totalPages: progress.total_pages || 1,
                scrollTop: progress.scroll_top || 0,
                progress: progress.progress || 0,
              };
              
              // 如果有 CFI，使用 CFI 恢复位置（最精确）
              // 注意：后端字段名是 current_position，不是 current_location
              if (progress.current_position) {
                initialPos.currentLocation = progress.current_position;
              }
              
              setInitialPosition(initialPos);
            }
          } catch (error) {
            console.error('ReaderNew: 获取阅读进度失败', error);
            // 忽略进度获取错误，从第一页开始
          }
        } else {
          try {
            const saved = localStorage.getItem(`reading-position-${bookId}`);
            if (saved) {
              const savedProgress = JSON.parse(saved);
              if (savedProgress.position) {
                setInitialPosition(savedProgress.position);
              }
            }
          } catch (e) {
            console.error('ReaderNew: localStorage解析失败', e);
            // 忽略解析错误
          }
        }

        setLoading(false);
      } catch (error: any) {
        console.error('获取书籍失败:', error);
        toast.error(`加载失败: ${error.message || '未知错误'}`);
        setLoading(false);
      }
    };

    fetchBook();
  }, [bookId, isAuthenticated, navigate]);

  // 组件卸载时结束阅读会话
  useEffect(() => {
    return () => {
      // 结束阅读会话
      if (isAuthenticated && sessionId && bookId) {
        // 使用 navigator.sendBeacon 确保即使页面关闭也能发送请求
        const endSession = async () => {
          try {
            // 尝试获取当前阅读进度（如果失败则使用默认值）
            let currentProgress = 0;
            try {
              const progressResponse = await api.get(`/reading/progress/${bookId}`);
              currentProgress = progressResponse.data?.progress || 0;
            } catch (e) {
              // 使用默认值
            }
            
            await api.put(`/reading/history/session/${sessionId}`, {
              endTime: new Date().toISOString(),
              progressAfter: currentProgress,
            });
          } catch (error) {
            console.error('ReaderNew: 结束阅读会话失败', error);
          }
        };
        
        // 尝试发送请求，如果失败则忽略（不影响用户体验）
        endSession().catch(() => {});
      }
    };
  }, [isAuthenticated, sessionId, bookId]);

  // 处理进度变化（实时保存）
  const handleProgressChange = async (newProgress: number, position: ReadingPosition) => {
    if (!bookId) {
      return;
    }
    
    // 确保进度值是有效的数字
    if (typeof newProgress !== 'number' || isNaN(newProgress) || newProgress < 0 || newProgress > 1) {
      return;
    }
    
    if (isAuthenticated) {
      try {
        await api.post('/reading/progress', {
          bookId: bookId,
          progress: newProgress,
          currentPosition: position.currentLocation || null, // CFI精确位置（后端会保存到 current_position 字段）
          currentPage: position.currentPage || 1,
          totalPages: position.totalPages || 1,
          chapterIndex: position.chapterIndex || 0,
          scrollTop: position.scrollTop || 0,
          clientTimestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error('ReaderNew: 保存进度到服务器失败', error);
        // 如果服务器保存失败，尝试保存到localStorage作为备份
        try {
          localStorage.setItem(`reading-position-${bookId}`, JSON.stringify({
            progress: newProgress,
            position: position,
            timestamp: Date.now(),
          }));
        } catch (e) {
          console.error('ReaderNew: localStorage保存也失败', e);
        }
      }
    } else {
      // 未登录用户，保存到localStorage
      try {
        localStorage.setItem(`reading-position-${bookId}`, JSON.stringify({
          progress: newProgress,
          position: position,
          timestamp: Date.now(),
        }));
      } catch (e) {
        console.error('ReaderNew: localStorage保存失败', e);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">书籍不存在</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  const readerConfig: ReaderConfig = {
    book,
    settings,
    initialPosition,
    onSettingsChange: saveSettings,
    onProgressChange: handleProgressChange,
    onClose: () => navigate(-1),
  };

  return <ReaderContainer config={readerConfig} />;
}
