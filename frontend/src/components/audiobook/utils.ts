/**
 * @file utils.ts
 * @description 有声小说播放器工具函数
 */

import { FormatTimeFunction, FormatDurationFunction, FormatFileSizeFunction } from './types';

// 导出性能优化工具
export * from './utils/performance';

/**
 * 格式化时间（秒 -> HH:MM:SS 或 MM:SS）
 */
export const formatTime: FormatTimeFunction = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * 格式化时长（用于显示文件时长）
 */
export const formatDuration: FormatDurationFunction = (seconds?: number): string => {
  if (!seconds) return '--:--';
  return formatTime(seconds);
};

/**
 * 格式化文件大小
 */
export const formatFileSize: FormatFileSizeFunction = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};
