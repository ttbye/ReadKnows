/**
 * @file PlayerControls.test.tsx
 * @description PlayerControls 组件单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../../../test/utils/testUtils';
import { PlayerControls } from '../PlayerControls';

describe('PlayerControls', () => {
  const defaultProps = {
    isPlaying: false,
    isLoading: false,
    currentFileIndex: 1,
    totalFiles: 5,
    currentTime: 30,
    duration: 100,
    onTogglePlay: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    onSeekBackward: vi.fn(),
    onSeekForward: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该正确渲染播放/暂停按钮', () => {
    render(<PlayerControls {...defaultProps} />);
    
    const playButton = screen.getByLabelText('播放');
    expect(playButton).toBeInTheDocument();
  });

  it('应该在播放时显示暂停按钮', () => {
    render(<PlayerControls {...defaultProps} isPlaying={true} />);
    
    const pauseButton = screen.getByLabelText('暂停');
    expect(pauseButton).toBeInTheDocument();
  });

  it('应该在加载时显示加载指示器', () => {
    render(<PlayerControls {...defaultProps} isLoading={true} />);
    
    const button = screen.getByLabelText('播放');
    expect(button).toBeDisabled();
  });

  it('应该在第一集时禁用上一首按钮', () => {
    render(<PlayerControls {...defaultProps} currentFileIndex={0} />);
    
    const prevButton = screen.getByLabelText('上一首');
    expect(prevButton).toBeDisabled();
  });

  it('应该在最后一集时禁用下一首按钮', () => {
    render(<PlayerControls {...defaultProps} currentFileIndex={4} totalFiles={5} />);
    
    const nextButton = screen.getByLabelText('下一首');
    expect(nextButton).toBeDisabled();
  });

  it('应该在 currentTime 为 0 时禁用快退按钮', () => {
    render(<PlayerControls {...defaultProps} currentTime={0} />);
    
    const seekBackwardButton = screen.getByLabelText('向前15秒');
    expect(seekBackwardButton).toBeDisabled();
  });

  it('应该在 currentTime 等于 duration 时禁用快进按钮', () => {
    render(<PlayerControls {...defaultProps} currentTime={100} duration={100} />);
    
    const seekForwardButton = screen.getByLabelText('向后15秒');
    expect(seekForwardButton).toBeDisabled();
  });

  it('应该调用 onTogglePlay 当点击播放/暂停按钮', () => {
    const onTogglePlay = vi.fn();
    render(<PlayerControls {...defaultProps} onTogglePlay={onTogglePlay} />);
    
    const playButton = screen.getByLabelText('播放');
    fireEvent.click(playButton);
    
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('应该调用 onPrevious 当点击上一首按钮', () => {
    const onPrevious = vi.fn();
    render(<PlayerControls {...defaultProps} onPrevious={onPrevious} currentFileIndex={2} />);
    
    const prevButton = screen.getByLabelText('上一首');
    fireEvent.click(prevButton);
    
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('应该调用 onNext 当点击下一首按钮', () => {
    const onNext = vi.fn();
    render(<PlayerControls {...defaultProps} onNext={onNext} currentFileIndex={1} />);
    
    const nextButton = screen.getByLabelText('下一首');
    fireEvent.click(nextButton);
    
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('应该调用 onSeekBackward 当点击快退按钮', () => {
    const onSeekBackward = vi.fn();
    render(<PlayerControls {...defaultProps} onSeekBackward={onSeekBackward} currentTime={30} />);
    
    const seekBackwardButton = screen.getByLabelText('向前15秒');
    fireEvent.click(seekBackwardButton);
    
    expect(onSeekBackward).toHaveBeenCalledTimes(1);
  });

  it('应该调用 onSeekForward 当点击快进按钮', () => {
    const onSeekForward = vi.fn();
    render(<PlayerControls {...defaultProps} onSeekForward={onSeekForward} currentTime={30} duration={100} />);
    
    const seekForwardButton = screen.getByLabelText('向后15秒');
    fireEvent.click(seekForwardButton);
    
    expect(onSeekForward).toHaveBeenCalledTimes(1);
  });
});
