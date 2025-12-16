/**
 * @file ReadingHistory.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Book, Clock, Trash2, ChevronDown, ChevronUp, Calendar, TrendingUp } from 'lucide-react';
import { getCoverUrl } from '../utils/coverHelper';

interface HistoryItem {
  history_id: string;
  id: string;
  title: string;
  author: string;
  cover_url?: string;
  file_type: string;
  last_read_at: string;
  total_reading_time: number;
  total_progress: number;
  read_count: number;
}

interface ReadingSession {
  id: string;
  start_time: string;
  end_time?: string;
  duration: number;
  progress_before: number;
  progress_after: number;
}

interface Stats {
  totalBooks: number;
  monthReadingTime: number;
  yearReadingTime: number;
}

export default function ReadingHistory() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [bookSessions, setBookSessions] = useState<Record<string, ReadingSession[]>>({});
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    fetchHistory();
    fetchStats();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await api.get('/reading/history');
      setHistory(response.data.history || []);
    } catch (error: any) {
      console.error('获取阅读历史失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
      if (error.statusText !== 'OK (Offline Cache)' && error.statusText !== 'OK (Offline, No Cache)') {
        // 只有在在线且确实失败时才显示错误
        if (navigator.onLine) {
          toast.error('获取阅读历史失败');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/reading/history/stats/summary');
      setStats(response.data);
    } catch (error: any) {
      console.error('获取统计信息失败:', error);
      // 离线时不显示错误，静默失败
    }
  };

  const fetchBookSessions = async (bookId: string) => {
    if (bookSessions[bookId]) {
      return; // 已加载
    }

    setLoadingSessions((prev) => new Set(prev).add(bookId));
    try {
      const response = await api.get(`/reading/history/${bookId}`);
      if (response.data.sessions) {
        setBookSessions((prev) => ({
          ...prev,
          [bookId]: response.data.sessions || [],
        }));
      }
    } catch (error) {
      console.error('获取阅读会话失败:', error);
    } finally {
      setLoadingSessions((prev) => {
        const next = new Set(prev);
        next.delete(bookId);
        return next;
      });
    }
  };

  const handleToggleExpand = (bookId: string) => {
    const newExpanded = new Set(expandedBooks);
    if (newExpanded.has(bookId)) {
      newExpanded.delete(bookId);
    } else {
      newExpanded.add(bookId);
      fetchBookSessions(bookId);
    }
    setExpandedBooks(newExpanded);
  };

  const handleDelete = async (bookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这本书的阅读历史吗？')) {
      return;
    }

    try {
      await api.delete(`/reading/history/${bookId}`);
      toast.success('阅读历史已删除');
      setHistory((prev) => prev.filter((item) => item.id !== bookId));
      setStats((prev) => prev ? { ...prev, totalBooks: prev.totalBooks - 1 } : null);
    } catch (error: any) {
      console.error('删除阅读历史失败:', error);
      toast.error(error.response?.data?.error || '删除失败');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return '今天';
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}分钟`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分钟`;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="pb-safe pt-4 sm:pt-6">
      {/* 统计信息卡片 */}
      {stats && (
        <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 sm:p-4 transition-all hover:bg-blue-100 dark:hover:bg-blue-950/30">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md bg-blue-500 dark:bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <Book className="w-4 h-4 text-white" />
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">已阅读</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalBooks}
              </div>
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 sm:p-4 transition-all hover:bg-orange-100 dark:hover:bg-orange-950/30">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md bg-orange-500 dark:bg-orange-600 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">本月</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatDuration(stats.monthReadingTime)}
              </div>
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-3 sm:p-4 transition-all hover:bg-purple-100 dark:hover:bg-purple-950/30">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md bg-purple-500 dark:bg-purple-600 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">年度</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatDuration(stats.yearReadingTime)}
              </div>
            </div>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">暂无阅读历史</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => {
            const isExpanded = expandedBooks.has(item.id);
            const sessions = bookSessions[item.id] || [];
            const isLoadingSessions = loadingSessions.has(item.id);

            return (
              <div
                key={item.history_id}
                className="card-gradient rounded-xl overflow-hidden"
              >
                {/* 主卡片 */}
                <div className="p-4">
                  <div className="flex gap-4">
                    <Link
                      to={`/books/${item.id}`}
                      className="w-20 h-28 flex-shrink-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg overflow-hidden shadow-md"
                    >
                      {(() => {
                        const coverUrl = getCoverUrl(item.cover_url);
                        return coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = `
                                  <div class="w-full h-full flex items-center justify-center">
                                    <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                                    </svg>
                                  </div>
                                `;
                              }
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Book className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                          </div>
                        );
                      })()}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link to={`/books/${item.id}`}>
                        <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate">
                          {item.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        {item.author || '未知作者'}
                      </p>

                      {/* 统计信息 */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="w-4 h-4" />
                          <span>总时长: {formatDuration(item.total_reading_time)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <TrendingUp className="w-4 h-4" />
                          <span>进度: {(item.total_progress * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Book className="w-4 h-4" />
                          <span>阅读次数: {item.read_count}次</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(item.last_read_at)}</span>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleExpand(item.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              收起详情
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              查看详情
                            </>
                          )}
                        </button>
                        <button
                          onClick={(e) => handleDelete(item.id, e)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 展开的会话详情 */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
                    {isLoadingSessions ? (
                      <div className="text-center py-4">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    ) : sessions.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">暂无阅读会话记录</p>
                    ) : (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          阅读会话记录 ({sessions.length}次)
                        </h4>
                        {sessions.map((session) => (
                          <div
                            key={session.id}
                            className="card-gradient rounded-lg p-3"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {formatTime(session.start_time)}
                                </div>
                                {session.end_time && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    结束: {formatTime(session.end_time)}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                  {formatDuration(session.duration)}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  进度: {(session.progress_before * 100).toFixed(1)}% →{' '}
                                  {(session.progress_after * 100).toFixed(1)}%
                                </div>
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
          })}
        </div>
      )}
    </div>
  );
}
