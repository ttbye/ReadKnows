/**
 * @file integration.test.tsx
 * @description 集成测试示例
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../../test/utils/testUtils';
import { PlayerControls } from '../PlayerControls';
import { ProgressBar } from '../ProgressBar';
import { VolumeControl } from '../VolumeControl';
import { createMockAudioElement, simulateAudioPlay, simulateTimeUpdate } from '../../../../test/mocks/audio';

describe('播放器组件集成测试', () => {
  let audioElement: HTMLAudioElement;
  let onTogglePlay: ReturnType<typeof vi.fn>;
  let onSeek: ReturnType<typeof vi.fn>;
  let onVolumeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    audioElement = createMockAudioElement();
    onTogglePlay = vi.fn();
    onSeek = vi.fn();
    onVolumeChange = vi.fn();
  });

  it('应该正确集成播放控制和进度条', async () => {
    render(
      <div>
        <PlayerControls
          isPlaying={false}
          isLoading={false}
          currentFileIndex={1}
          totalFiles={5}
          currentTime={30}
          duration={100}
          onTogglePlay={onTogglePlay}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
          onSeekBackward={vi.fn()}
          onSeekForward={vi.fn()}
        />
        <ProgressBar
          currentTime={30}
          duration={100}
          onSeek={onSeek}
        />
      </div>
    );

    // 验证播放按钮存在
    const playButton = screen.getByLabelText('播放');
    expect(playButton).toBeInTheDocument();

    // 验证进度条存在
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '30');

    // 点击播放按钮
    playButton.click();
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('应该在播放时更新进度条', async () => {
    const { rerender } = render(
      <ProgressBar
        currentTime={30}
        duration={100}
        onSeek={onSeek}
      />
    );

    // 初始进度
    let progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '30');

    // 更新进度
    rerender(
      <ProgressBar
        currentTime={50}
        duration={100}
        onSeek={onSeek}
      />
    );

    progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
  });

  it('应该正确处理音量控制', () => {
    render(
      <VolumeControl
        volume={0.5}
        isMuted={false}
        onVolumeChange={onVolumeChange}
        onToggleMute={vi.fn()}
        showSlider={true}
        onShowSliderChange={vi.fn()}
      />
    );

    const volumeSlider = screen.getByLabelText('调整音量');
    expect(volumeSlider).toBeInTheDocument();
    expect(volumeSlider).toHaveAttribute('aria-valuenow', '0.5');
  });
});
