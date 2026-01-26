/**
 * @file utils.test.ts
 * @description 工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import { formatTime, formatDuration, formatFileSize } from '../utils';

describe('formatTime', () => {
  it('应该正确格式化秒数', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(30)).toBe('00:30');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('应该处理负数', () => {
    expect(formatTime(-10)).toBe('00:00');
  });

  it('应该处理小数', () => {
    expect(formatTime(30.5)).toBe('00:30');
    expect(formatTime(65.9)).toBe('01:05');
  });
});

describe('formatDuration', () => {
  it('应该正确格式化时长', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(30)).toBe('00:30');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('应该处理 undefined', () => {
    expect(formatDuration(undefined)).toBe('00:00');
  });
});

describe('formatFileSize', () => {
  it('应该正确格式化文件大小', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('应该处理小数', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1536 * 1024)).toBe('1.5 MB');
  });
});
