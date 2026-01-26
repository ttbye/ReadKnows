/**
 * @file ProgressBar.test.tsx
 * @description ProgressBar 组件单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../../../test/utils/testUtils';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  const defaultProps = {
    currentTime: 30,
    duration: 100,
    onSeek: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该正确显示当前时间和总时长', () => {
    render(<ProgressBar {...defaultProps} />);
    
    expect(screen.getByText('00:30')).toBeInTheDocument();
    expect(screen.getByText('01:40')).toBeInTheDocument();
  });

  it('应该正确计算进度百分比', () => {
    render(<ProgressBar {...defaultProps} currentTime={50} duration={100} />);
    
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('应该在 duration 为 0 时显示 0% 进度', () => {
    render(<ProgressBar {...defaultProps} duration={0} />);
    
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
  });

  it('应该调用 onSeek 当拖动进度条', () => {
    const onSeek = vi.fn();
    render(<ProgressBar {...defaultProps} onSeek={onSeek} />);
    
    const slider = screen.getByLabelText('调整播放进度');
    fireEvent.change(slider, { target: { value: '50' } });
    
    expect(onSeek).toHaveBeenCalledWith(50);
  });

  it('应该在 disabled 时禁用进度条', () => {
    render(<ProgressBar {...defaultProps} disabled={true} />);
    
    const slider = screen.getByLabelText('调整播放进度');
    expect(slider).toBeDisabled();
  });

  it('应该有正确的 ARIA 属性', () => {
    render(<ProgressBar {...defaultProps} />);
    
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-label', '播放进度');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    expect(progressbar).toHaveAttribute('aria-valuenow', '30');
  });
});
