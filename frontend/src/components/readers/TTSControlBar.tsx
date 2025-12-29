/**
 * @author ttbye
 * 朗读控制菜单组件
 * 在朗读时替换底部导航栏，提供朗读控制功能
 */

import { Play, Pause, SkipBack, SkipForward, Volume2, X, Settings } from 'lucide-react';
import { ReadingSettings } from '../../types/reader';
import { useTranslation } from 'react-i18next';

interface TTSControlBarProps {
  settings: ReadingSettings;
  isPlaying: boolean;
  currentIndex: number;
  totalParagraphs: number;
  speed: number;
  model: string;
  voice: string;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSpeedChange: (speed: number) => void;
  onModelChange: (model: string) => void;
  onVoiceChange: (voice: string) => void;
  onSettings: () => void;
  onClose: () => void;
  availableModels: Array<{ id: string; name: string; description: string; type: string; available: boolean }>;
  availableVoices: Array<{ id: string; name: string; lang: string; gender?: string; style?: string }>;
  isVisible: boolean;
}

export default function TTSControlBar({
  settings,
  isPlaying,
  currentIndex,
  totalParagraphs,
  speed,
  model,
  voice,
  onPlayPause,
  onPrev,
  onNext,
  onSpeedChange,
  onModelChange,
  onVoiceChange,
  onSettings,
  onClose,
  availableModels,
  availableVoices,
  isVisible,
}: TTSControlBarProps) {
  const { t } = useTranslation();
  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0', hover: 'rgba(0, 0, 0, 0.05)' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040', hover: 'rgba(255, 255, 255, 0.1)' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c', hover: 'rgba(0, 0, 0, 0.05)' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7', hover: 'rgba(0, 0, 0, 0.05)' },
  }[settings.theme];

  // 计算进度：确保 currentIndex 有效（>= 0）
  // 注意：如果 currentIndex 是 -1，说明还没有初始化，应该显示 0%
  const progress = totalParagraphs > 0 && currentIndex >= 0 
    ? ((currentIndex + 1) / totalParagraphs) * 100 
    : 0;
  
  // 调试日志（始终显示，方便排查问题）
  console.log(`[TTSControlBar] 进度计算: currentIndex=${currentIndex}, totalParagraphs=${totalParagraphs}, progress=${progress.toFixed(2)}%`);

  if (!isVisible) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 transition-all duration-300"
      style={{
        bottom: settings.showBottomInfoBar 
          ? 'calc(48px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))' 
          : '0',
        backgroundColor: themeStyles.bg,
        borderTop: `1px solid ${themeStyles.border}`,
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.08)',
        paddingBottom: settings.showBottomInfoBar 
          ? '0px' 
          : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
        // 减小高度：紧凑布局
        paddingTop: '8px',
        paddingLeft: '8px',
        paddingRight: '8px',
      }}
    >
      {/* 进度条 */}
      <div className="px-2 pt-1 pb-1">
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: themeStyles.border }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5 text-xs" style={{ color: themeStyles.text, opacity: 0.7 }}>
          <span>{t('tts.paragraph', { current: currentIndex + 1, total: totalParagraphs })}</span>
          <span>{speed.toFixed(1)}x</span>
        </div>
      </div>

      {/* 主控制区 */}
      <div className="flex items-center justify-between px-2 py-2">
        {/* 左侧：上一段 */}
        <button
          onClick={onPrev}
          disabled={currentIndex <= 0}
          className="p-2 rounded-lg disabled:opacity-30 transition-colors"
          style={{ 
            color: themeStyles.text,
            backgroundColor: currentIndex > 0 ? 'transparent' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (currentIndex > 0) {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <SkipBack className="w-5 h-5" />
        </button>

        {/* 中间：播放/暂停 */}
        <button
          onClick={onPlayPause}
          className="p-3 rounded-full transition-colors"
          style={{
            backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
            color: '#ffffff',
          }}
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>

        {/* 右侧：下一段 */}
        <button
          onClick={onNext}
          disabled={currentIndex >= totalParagraphs - 1}
          className="p-2 rounded-lg disabled:opacity-30 transition-colors"
          style={{ 
            color: themeStyles.text,
            backgroundColor: currentIndex < totalParagraphs - 1 ? 'transparent' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (currentIndex < totalParagraphs - 1) {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* 设置行 */}
      <div className="px-2 pb-2 flex items-center gap-2 flex-wrap">
        {/* 模型选择 */}
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="px-2 py-1 rounded text-xs border"
          style={{ 
            backgroundColor: themeStyles.bg, 
            borderColor: themeStyles.border, 
            color: themeStyles.text,
            minWidth: '100px',
          }}
        >
          {availableModels.filter(m => m.available).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        {/* 语音选择 */}
        <select
          value={voice}
          onChange={(e) => onVoiceChange(e.target.value)}
          className="px-2 py-1 rounded text-xs border flex-1"
          style={{ 
            backgroundColor: themeStyles.bg, 
            borderColor: themeStyles.border, 
            color: themeStyles.text,
            minWidth: '120px',
          }}
        >
          {availableVoices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} {v.gender ? `(${v.gender === 'male' ? t('tts.male') : t('tts.female')})` : ''}
            </option>
          ))}
        </select>

        {/* 倍速选择 */}
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="px-2 py-1 rounded text-xs border"
          style={{ 
            backgroundColor: themeStyles.bg, 
            borderColor: themeStyles.border, 
            color: themeStyles.text,
            minWidth: '70px',
          }}
        >
          <option value="0.8">0.8x</option>
          <option value="1.0">1.0x</option>
          <option value="1.2">1.2x</option>
          <option value="1.5">1.5x</option>
        </select>

        {/* 设置按钮 */}
        <button
          onClick={onSettings}
          className="p-2 rounded-lg transition-colors"
          style={{ color: themeStyles.text }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg transition-colors"
          style={{ color: themeStyles.text }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}






