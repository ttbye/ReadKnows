/**
 * @file ErrorBoundary.test.tsx
 * @description ErrorBoundary 组件测试
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../../../test/utils/testUtils';
import { AudiobookPlayerErrorBoundary } from '../ErrorBoundary';

// 抛出错误的测试组件
function ThrowError({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
}

describe('AudiobookPlayerErrorBoundary', () => {
  // 抑制控制台错误输出
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('应该正常渲染子组件', () => {
    render(
      <AudiobookPlayerErrorBoundary>
        <ThrowError shouldThrow={false} />
      </AudiobookPlayerErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('应该在子组件抛出错误时显示错误界面', () => {
    render(
      <AudiobookPlayerErrorBoundary>
        <ThrowError shouldThrow={true} />
      </AudiobookPlayerErrorBoundary>
    );

    expect(screen.getByText('播放器出现错误')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  it('应该支持自定义 fallback', () => {
    const customFallback = <div>Custom error message</div>;

    render(
      <AudiobookPlayerErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </AudiobookPlayerErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
  });
});
