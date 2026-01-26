/**
 * @file LogManagement.tsx
 * @author ttbye
 * @date 2026-01-06
 * @description 系统日志管理页面（仅管理员）
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { formatTimeWithTimezone } from '../utils/timezone';
import {
  FileText,
  Download,
  Trash2,
  Search,
  Filter,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart3,
  SlidersHorizontal,
  Eye,
  Clock,
  User,
  Activity
} from 'lucide-react';

interface LogEntry {
  id: string;
  user_id?: string;
  username?: string;
  action_type: string;
  action_category: string;
  description?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
  created_at: string;
}

interface LogStats {
  total: number;
  recent7Days: number;
  recent30Days: number;
  categoryStats: Array<{ action_category: string; count: number }>;
  typeStats: Array<{ action_type: string; count: number }>;
}

export default function LogManagement() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(0);

  // 筛选条件
  const [actionType, setActionType] = useState('');
  const [actionCategory, setActionCategory] = useState('');
  const [username, setUsername] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false); // 移动端筛选条件折叠

  // 检查管理员权限
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('需要管理员权限');
      navigate('/');
    }
  }, [user, navigate]);

  // 加载日志列表
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit,
      };

      if (actionType) params.action_type = actionType;
      if (actionCategory) params.action_category = actionCategory;
      if (username) params.username = username;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (search) params.search = search;

      const response = await api.get('/logs', { params });
      setLogs(response.data.logs || []);
      setTotal(response.data.pagination?.total || 0);
      setTotalPages(response.data.pagination?.totalPages || 0);
    } catch (error: any) {
      console.error('获取日志列表失败:', error);
      toast.error(error.response?.data?.error || '获取日志列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计信息
  const fetchStats = async () => {
    try {
      const response = await api.get('/logs/stats');
      setStats(response.data);
    } catch (error: any) {
      console.error('获取统计信息失败:', error);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchLogs();
      fetchStats();
    }
  }, [user, page, actionType, actionCategory, username, startDate, endDate, search]);

  // 导出日志
  const handleExport = async () => {
    try {
      const params: any = {};
      if (actionType) params.action_type = actionType;
      if (actionCategory) params.action_category = actionCategory;
      if (username) params.username = username;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (search) params.search = search;

      const response = await api.get('/logs/export', {
        params,
        responseType: 'blob',
      });

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('日志导出成功');
    } catch (error: any) {
      console.error('导出日志失败:', error);
      toast.error(error.response?.data?.error || '导出日志失败');
    }
  };

  // 清空日志
  const handleClear = async () => {
    if (!confirm('确定要清空日志吗？此操作不可恢复！')) {
      return;
    }

    const beforeDate = prompt('请输入要清空的日期（YYYY-MM-DD），留空则清空所有日志：');
    if (beforeDate === null) {
      return; // 用户取消
    }

    try {
      const params: any = {};
      if (beforeDate.trim()) {
        params.before_date = beforeDate.trim();
      }

      await api.delete('/logs', { params });
      toast.success('日志清空成功');
      fetchLogs();
      fetchStats();
    } catch (error: any) {
      console.error('清空日志失败:', error);
      toast.error(error.response?.data?.error || '清空日志失败');
    }
  };

  // 重置筛选条件
  const handleResetFilters = () => {
    setActionType('');
    setActionCategory('');
    setUsername('');
    setStartDate('');
    setEndDate('');
    setSearch('');
    setPage(1);
  };

  // 格式化日期时间（使用时区工具函数）
  const formatDateTime = (dateString: string) => {
    return formatTimeWithTimezone(dateString, {
      showTime: true,
      showDate: true,
      relative: false,
    });
  };

  // 获取操作类型显示名称
  const getActionTypeName = (type: string) => {
    const typeMap: { [key: string]: string } = {
      login: '登录',
      logout: '登出',
      register: '注册',
      login_failed: '登录失败',
      book_upload: '上传书籍',
      book_delete: '删除书籍',
      book_edit: '编辑书籍',
      book_favorite: '收藏书籍',
      book_unfavorite: '取消收藏',
      book_download: '下载书籍',
      book_share: '分享书籍',
      reading_start: '开始阅读',
      reading_progress: '阅读进度',
      reading_complete: '完成阅读',
      audiobook_play: '播放有声小说',
      audiobook_progress: '有声小说进度',
      audiobook_complete: '完成有声小说',
      user_create: '创建用户',
      user_edit: '编辑用户',
      user_delete: '删除用户',
      user_password_reset: '重置密码',
      system_settings_update: '更新设置',
      log_export: '导出日志',
      log_clear: '清空日志',
    };
    return typeMap[type] || type;
  };

  // 获取操作分类显示名称
  const getCategoryName = (category: string) => {
    const categoryMap: { [key: string]: string } = {
      auth: '认证',
      book: '书籍',
      reading: '阅读',
      audiobook: '有声小说',
      user: '用户',
      system: '系统',
      other: '其他',
    };
    return categoryMap[category] || category;
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
      {/* 紧凑的页面头部 */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">日志管理</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchLogs(); fetchStats(); }}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="刷新"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="筛选条件"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 紧凑的统计信息 */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">总日志</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{stats.total.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">7天</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{stats.recent7Days.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">30天</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{stats.recent30Days.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 mb-1">
              <Eye className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-400">页码</span>
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{page}/{totalPages}</div>
          </div>
        </div>
      )}

      {/* 紧凑的操作栏 */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={handleExport}
          className="flex-1 sm:flex-none px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">导出</span>
        </button>
        <button
          onClick={handleClear}
          className="flex-1 sm:flex-none px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">清空</span>
        </button>
      </div>

      {/* 折叠的筛选条件 */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  操作类型
                </label>
                <select
                  value={actionType}
                  onChange={(e) => { setActionType(e.target.value); setPage(1); }}
                  className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">全部</option>
                  <option value="login">登录</option>
                  <option value="login_failed">登录失败</option>
                  <option value="book_favorite">收藏</option>
                  <option value="book_unfavorite">取消收藏</option>
                  <option value="book_download">下载书籍</option>
                  <option value="book_share">分享书籍</option>
                  <option value="reading_start">开始阅读</option>
                  <option value="reading_progress">阅读进度</option>
                  <option value="audiobook_play">播放有声小说</option>
                  <option value="audiobook_progress">有声小说进度</option>
                  <option value="user_create">创建用户</option>
                  <option value="log_export">导出日志</option>
                  <option value="log_clear">清空日志</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  操作分类
                </label>
                <select
                  value={actionCategory}
                  onChange={(e) => { setActionCategory(e.target.value); setPage(1); }}
                  className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">全部</option>
                  <option value="auth">认证</option>
                  <option value="book">书籍</option>
                  <option value="reading">阅读</option>
                  <option value="audiobook">有声小说</option>
                  <option value="user">用户</option>
                  <option value="system">系统</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setPage(1); }}
                placeholder="搜索用户名"
                className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  开始日期
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  结束日期
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  className="w-full px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                搜索
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="搜索描述或用户名"
                  className="w-full px-2 py-2 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {search && (
                  <button
                    onClick={() => { setSearch(''); setPage(1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {(actionType || actionCategory || username || startDate || endDate || search) && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={handleResetFilters}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                清除筛选条件
              </button>
            </div>
          )}
        </div>
      )}

      {/* 日志列表 - 响应式布局 */}
      {loading ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">加载中...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-8 text-center rounded-lg border border-gray-200 dark:border-gray-700">
          <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">暂无日志记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 桌面端表格布局 */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      时间
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      操作
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      分类
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      详情
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {log.username || '(匿名)'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {getActionTypeName(log.action_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          {getCategoryName(log.action_category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                        {log.description || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 移动端卡片布局 */}
          <div className="md:hidden space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {log.username || '(匿名)'}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {getActionTypeName(log.action_type)}
                    </span>
                    <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      {getCategoryName(log.action_category)}
                    </span>
                  </div>
                </div>

                {log.description && (
                  <div className="mb-2">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {log.description}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatDateTime(log.created_at)}</span>
                  </div>
                  {log.ip_address && (
                    <span className="font-mono text-xs flex-shrink-0">{log.ip_address}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 紧凑的分页控件 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {total} 条记录
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 min-w-[3rem] text-center">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
