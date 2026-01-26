/**
 * @file api.ts
 * @description API Mock
 */

import { vi } from 'vitest';

/**
 * Mock API 响应
 */
export interface MockApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
}

/**
 * 创建模拟的 API 客户端
 */
export function createMockApi() {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPut = vi.fn();
  const mockDelete = vi.fn();
  
  return {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    mockGet,
    mockPost,
    mockPut,
    mockDelete,
  };
}

/**
 * 创建成功的 API 响应
 */
export function createSuccessResponse<T>(data: T): MockApiResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
  };
}

/**
 * 创建错误的 API 响应
 */
export function createErrorResponse(
  status: number = 500,
  message: string = 'Internal Server Error'
): MockApiResponse {
  return {
    data: { error: message },
    status,
    statusText: message,
  };
}

/**
 * Mock 进度保存 API
 */
export function mockSaveProgress(api: ReturnType<typeof createMockApi>) {
  api.mockPost.mockImplementation((url: string) => {
    if (url.includes('/progress')) {
      return Promise.resolve(createSuccessResponse({ success: true }));
    }
    return Promise.reject(createErrorResponse(404, 'Not Found'));
  });
}

/**
 * Mock 音频文件获取 API
 */
export function mockGetAudioFile(api: ReturnType<typeof createMockApi>, blob: Blob) {
  api.mockGet.mockImplementation((url: string) => {
    if (url.includes('/audio/')) {
      return Promise.resolve({
        data: blob,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }
    return Promise.reject(createErrorResponse(404, 'Not Found'));
  });
}
