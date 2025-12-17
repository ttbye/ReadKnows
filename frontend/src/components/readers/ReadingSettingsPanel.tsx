/**
 * @author ttbye
 * 阅读设置面板
 * 根据不同格式显示不同的设置选项
 */

import { X } from 'lucide-react';
import { ReadingSettings, BookData } from '../../types/reader';

interface ReadingSettingsPanelProps {
  settings: ReadingSettings;
  bookType: BookData['file_type'];
  onSettingsChange: (settings: ReadingSettings) => void;
  onClose: () => void;
}

export default function ReadingSettingsPanel({
  settings,
  bookType,
  onSettingsChange,
  onClose,
}: ReadingSettingsPanelProps) {
  const updateSetting = <K extends keyof ReadingSettings>(
    key: K,
    value: ReadingSettings[K]
  ) => {
    // 确保所有字段都被保留，特别是嵌套对象
    const updatedSettings: ReadingSettings = {
      ...settings,
      [key]: value,
      // 确保嵌套对象也被正确保留
      keyboardShortcuts: {
        ...settings.keyboardShortcuts,
      },
    };
    onSettingsChange(updatedSettings);
  };

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  }[settings.theme];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.65)', 
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div 
        className="w-full md:w-[90vw] lg:w-[80vw] xl:w-[70vw] max-w-5xl h-[90vh] md:h-auto md:max-h-[85vh] rounded-t-3xl md:rounded-3xl flex flex-col animate-slide-up overflow-hidden"
        style={{
          backgroundColor: themeStyles.bg,
          color: themeStyles.text,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部拖动条（仅移动端） */}
        <div className="flex justify-center pt-3 pb-2 md:hidden shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: themeStyles.border, opacity: 0.4 }} />
        </div>
        
        {/* 标题栏 */}
        <div 
          className="flex items-center justify-between px-4 md:px-6 py-2.5 md:py-3 border-b shrink-0"
          style={{ 
            borderColor: themeStyles.border,
            background: settings.theme === 'dark' 
              ? 'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)'
              : 'linear-gradient(to bottom, rgba(0,0,0,0.02), transparent)'
          }}
        >
          <h2 className="text-base md:text-lg font-bold">阅读设置</h2>
          <button
            onClick={onClose}
            className="p-1.5 md:p-2 rounded-full transition-all hover:scale-110 hover:rotate-90"
            style={{
              color: themeStyles.text,
              backgroundColor: settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
            }}
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* 内容区域 - 可滚动 */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4 hide-scrollbar" style={{ 
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch'
        }}>
          {/* EPUB和TXT通用设置 */}
          {(bookType === 'epub' || bookType === 'txt') && (
            <>
              {/* 文字样式分组 */}
              <div className="mb-4 pb-3 border-b" style={{ borderColor: themeStyles.border }}>
                <div className="text-xs font-bold mb-3 flex items-center gap-2" style={{ 
                  opacity: 0.5,
                  letterSpacing: '0.05em'
                }}>
                  <div className="w-1 h-3 rounded-full bg-gradient-to-b from-blue-500 to-blue-600" />
                  文字样式
                </div>

                {/* 字体大小 */}
              <div className="mb-4 md:mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">字体大小</label>
                  <span className="text-sm font-bold px-2.5 py-0.5 rounded-md" style={{ 
                    color: '#fff',
                    background: settings.theme === 'dark' ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)' : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)',
                    boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
                  }}>
                    {settings.fontSize}px
                  </span>
                </div>
                {/* 快捷调节：- / + + 常用预设 */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => updateSetting('fontSize', Math.max(18, settings.fontSize - 1))}
                    className="w-10 h-9 rounded-lg border flex items-center justify-center font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                    aria-label="减小字体"
                  >
                    −
                  </button>
                  <button
                    onClick={() => updateSetting('fontSize', Math.min(48, settings.fontSize + 1))}
                    className="w-10 h-9 rounded-lg border flex items-center justify-center font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                    aria-label="增大字体"
                  >
                    +
                  </button>
                  <div className="flex-1 flex flex-wrap gap-1.5 justify-end">
                    {[18, 20, 22, 24, 28, 32, 36, 40, 48].map((size) => (
                      <button
                        key={size}
                        onClick={() => updateSetting('fontSize', size)}
                        className="px-2 py-1 rounded-md border text-[10px] font-semibold transition-all hover:scale-[1.03] active:scale-[0.98]"
                        style={{
                          background: settings.fontSize === size
                            ? (settings.theme === 'dark'
                                ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                                : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                            : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                          borderColor: settings.fontSize === size ? 'transparent' : themeStyles.border,
                          color: settings.fontSize === size ? '#fff' : themeStyles.text,
                        }}
                        aria-label={`设置字体大小 ${size}px`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min="18"
                  max="48"
                  value={settings.fontSize}
                  onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} 0%, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} ${((settings.fontSize - 18) / 30) * 100}%, ${themeStyles.border} ${((settings.fontSize - 18) / 30) * 100}%, ${themeStyles.border} 100%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] mt-1" style={{ opacity: 0.5 }}>
                  <span>18px 小</span>
                  <span>48px 大</span>
                </div>
              </div>

              {/* 字体 */}
              <div className="mb-4 md:mb-5">
                <label className="block text-sm font-semibold mb-2">字体</label>
                <div className="grid grid-cols-4 gap-1.5 md:gap-2">
                  {[
                    { value: 'default', label: '默认' },
                    { value: 'serif', label: '衬线' },
                    { value: 'sans-serif', label: '无衬线' },
                    { value: 'monospace', label: '等宽' }
                  ].map((font) => (
                    <button
                      key={font.value}
                      onClick={() => updateSetting('fontFamily', font.value)}
                      className={`px-2 py-2 md:px-3 md:py-2.5 rounded-lg border transition-all ${
                        settings.fontFamily === font.value
                          ? 'shadow-lg scale-[1.02]'
                          : 'hover:scale-[1.02]'
                      }`}
                      style={{
                        background: settings.fontFamily === font.value 
                          ? (settings.theme === 'dark' 
                              ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                              : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                          : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                        borderColor: settings.fontFamily === font.value 
                          ? 'transparent'
                          : themeStyles.border,
                        color: settings.fontFamily === font.value ? '#fff' : themeStyles.text,
                      }}
                    >
                      <span className="text-xs md:text-sm font-semibold">{font.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 行高 */}
              <div className="mb-4 md:mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">行间距</label>
                  <span className="text-sm font-bold px-2.5 py-0.5 rounded-md" style={{ 
                    color: '#fff',
                    background: settings.theme === 'dark' ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)' : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)',
                    boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
                  }}>
                    {settings.lineHeight.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="1.2"
                  max="3.0"
                  step="0.1"
                  value={settings.lineHeight}
                  onChange={(e) => updateSetting('lineHeight', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} 0%, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} ${((settings.lineHeight - 1.2) / 1.8) * 100}%, ${themeStyles.border} ${((settings.lineHeight - 1.2) / 1.8) * 100}%, ${themeStyles.border} 100%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] mt-1" style={{ opacity: 0.5 }}>
                  <span>1.2 紧凑</span>
                  <span>3.0 宽松</span>
                </div>
              </div>

              {/* 边距 */}
              <div className="mb-4 md:mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">页边距</label>
                  <span className="text-sm font-bold px-2.5 py-0.5 rounded-md" style={{ 
                    color: '#fff',
                    background: settings.theme === 'dark' ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)' : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)',
                    boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
                  }}>
                    {settings.margin}px
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="50"
                  value={settings.margin}
                  onChange={(e) => updateSetting('margin', parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} 0%, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} ${((settings.margin - 10) / 40) * 100}%, ${themeStyles.border} ${((settings.margin - 10) / 40) * 100}%, ${themeStyles.border} 100%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] mt-1" style={{ opacity: 0.5 }}>
                  <span>10px 窄</span>
                  <span>50px 宽</span>
                </div>
              </div>

              {/* 首行缩进 */}
              <div className="mb-0">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">首行缩进</label>
                  <span className="text-sm font-bold px-2.5 py-0.5 rounded-md" style={{ 
                    color: '#fff',
                    background: settings.theme === 'dark' ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)' : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)',
                    boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
                  }}>
                    {settings.textIndent}em
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.5"
                  value={settings.textIndent}
                  onChange={(e) => updateSetting('textIndent', parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} 0%, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} ${(settings.textIndent / 4) * 100}%, ${themeStyles.border} ${(settings.textIndent / 4) * 100}%, ${themeStyles.border} 100%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] mt-1" style={{ opacity: 0.5 }}>
                  <span>0em 无</span>
                  <span>4em 最大</span>
                </div>
              </div>
              </div>
            </>
          )}

          {/* 外观设置分组 */}
          <div className="mb-4 pb-3 border-b" style={{ borderColor: themeStyles.border }}>
            <div className="text-xs font-bold mb-3 flex items-center gap-2" style={{ 
              opacity: 0.5,
              letterSpacing: '0.05em'
            }}>
              <div className="w-1 h-3 rounded-full bg-gradient-to-b from-green-500 to-green-600" />
              外观设置
            </div>

            {/* 主题 */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-3">阅读主题</label>
            <div className="grid grid-cols-4 gap-2 md:gap-3">
              {([
                { 
                  value: 'light', 
                  label: '浅色', 
                  preview: '#ffffff', 
                  border: '#e5e7eb',
                  textColor: '#000000',
                  description: '经典白底黑字'
                },
                { 
                  value: 'dark', 
                  label: '深色', 
                  preview: '#1a1a1a', 
                  border: '#374151',
                  textColor: '#ffffff',
                  description: '夜间护眼'
                },
                { 
                  value: 'sepia', 
                  label: '护眼', 
                  preview: '#f4e4bc', 
                  border: '#d4c49c',
                  textColor: '#5c4b37',
                  description: '纸质质感'
                },
                { 
                  value: 'green', 
                  label: '绿色', 
                  preview: '#c8e6c9', 
                  border: '#a5d6a7',
                  textColor: '#2e7d32',
                  description: '清新护眼'
                }
              ] as const).map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => updateSetting('theme', theme.value)}
                  className={`relative p-3 md:p-4 rounded-xl transition-all duration-200 flex flex-col items-center gap-2 ${
                    settings.theme === theme.value
                      ? 'ring-2 ring-offset-2'
                      : 'hover:scale-[1.03] active:scale-[0.98]'
                  }`}
                  style={{
                    backgroundColor: theme.preview,
                    border: settings.theme === theme.value 
                      ? `2px solid ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'}` 
                      : `1.5px solid ${theme.border}`,
                    boxShadow: settings.theme === theme.value 
                      ? `0 0 0 4px ${settings.theme === 'dark' ? 'rgba(74, 158, 255, 0.15)' : 'rgba(24, 144, 255, 0.15)'}, 0 4px 16px rgba(0, 0, 0, 0.12)`
                      : '0 2px 8px rgba(0, 0, 0, 0.08)',
                    ringColor: settings.theme === theme.value 
                      ? (settings.theme === 'dark' ? '#4a9eff' : '#1890ff')
                      : 'transparent',
                  }}
                >
                  {/* 选中标记 */}
                  {settings.theme === theme.value && (
                    <div 
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow-lg"
                      style={{
                        backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                      }}
                    >
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  
                  {/* 主题预览卡片 */}
                  <div 
                    className="w-full h-16 md:h-20 rounded-lg shadow-inner flex items-center justify-center relative overflow-hidden"
                    style={{ 
                      backgroundColor: theme.preview,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    {/* 模拟文本行 */}
                    <div className="absolute inset-0 flex flex-col justify-center px-2 py-1 gap-1">
                      <div 
                        className="h-1.5 rounded-full"
                        style={{ 
                          backgroundColor: theme.textColor,
                          opacity: 0.8,
                          width: '85%'
                        }}
                      />
                      <div 
                        className="h-1.5 rounded-full"
                        style={{ 
                          backgroundColor: theme.textColor,
                          opacity: 0.6,
                          width: '100%'
                        }}
                      />
                      <div 
                        className="h-1.5 rounded-full"
                        style={{ 
                          backgroundColor: theme.textColor,
                          opacity: 0.5,
                          width: '70%'
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* 主题名称和描述 */}
                  <div className="flex flex-col items-center gap-0.5 w-full">
                    <span 
                      className="text-xs md:text-sm font-bold" 
                      style={{ color: theme.textColor }}
                    >
                      {theme.label}
                    </span>
                    <span 
                      className="text-[10px] opacity-70" 
                      style={{ color: theme.textColor }}
                    >
                      {theme.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* 交互设置分组 */}
          <div className="mb-4 pb-3 border-b" style={{ borderColor: themeStyles.border }}>
            <div className="text-xs font-bold mb-3 flex items-center gap-2" style={{ 
              opacity: 0.5,
              letterSpacing: '0.05em'
            }}>
              <div className="w-1 h-3 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
              交互设置
            </div>

            {/* 翻页方式 */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">翻页方式</label>
            <div className="grid grid-cols-2 gap-1.5 md:gap-2">
              <button
                onClick={() => {
                  // 切换到滑动翻页时，默认使用“左右滑动翻页”
                  onSettingsChange({
                    ...settings,
                    pageTurnMethod: 'swipe',
                    pageTurnMode: 'horizontal',
                    keyboardShortcuts: { ...settings.keyboardShortcuts },
                  });
                }}
                className={`px-3 py-2.5 md:py-3 rounded-lg border transition-all ${
                  settings.pageTurnMethod === 'swipe'
                    ? 'shadow-lg scale-[1.02]'
                    : 'hover:scale-[1.02]'
                }`}
                style={{
                  background: settings.pageTurnMethod === 'swipe' 
                    ? (settings.theme === 'dark' 
                        ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                        : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                    : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  borderColor: settings.pageTurnMethod === 'swipe' ? 'transparent' : themeStyles.border,
                  color: settings.pageTurnMethod === 'swipe' ? '#fff' : themeStyles.text,
                }}
              >
                <div className="text-center">
                  <div className="text-sm font-bold mb-0.5">滑动翻页</div>
                  <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMethod === 'swipe' ? 0.9 : 0.6 }}>防误触 · 推荐</div>
                </div>
              </button>
              <button
                onClick={() => updateSetting('pageTurnMethod', 'click')}
                className={`px-3 py-2.5 md:py-3 rounded-lg border transition-all ${
                  settings.pageTurnMethod === 'click'
                    ? 'shadow-lg scale-[1.02]'
                    : 'hover:scale-[1.02]'
                }`}
                style={{
                  background: settings.pageTurnMethod === 'click' 
                    ? (settings.theme === 'dark' 
                        ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                        : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                    : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  borderColor: settings.pageTurnMethod === 'click' ? 'transparent' : themeStyles.border,
                  color: settings.pageTurnMethod === 'click' ? '#fff' : themeStyles.text,
                }}
              >
                <div className="text-center">
                  <div className="text-sm font-bold mb-0.5">点击翻页</div>
                  <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMethod === 'click' ? 0.9 : 0.6 }}>快速便捷</div>
                </div>
              </button>
            </div>
          </div>

          {/* 滑动翻页模式（滑动翻页时有效） */}
          {settings.pageTurnMethod === 'swipe' && (
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">滑动翻页模式</label>
              <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                <button
                  onClick={() => updateSetting('pageTurnMode', 'horizontal')}
                  className={`px-3 py-2.5 md:py-3 rounded-lg border transition-all ${
                    settings.pageTurnMode === 'horizontal'
                      ? 'shadow-lg scale-[1.02]'
                      : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    background: settings.pageTurnMode === 'horizontal' 
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    borderColor: settings.pageTurnMode === 'horizontal' ? 'transparent' : themeStyles.border,
                    color: settings.pageTurnMode === 'horizontal' ? '#fff' : themeStyles.text,
                  }}
                >
                  <div className="text-center">
                    <div className="text-sm font-bold mb-0.5">左右滑动翻页</div>
                    <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMode === 'horizontal' ? 0.9 : 0.6 }}>
                      左→右下一页 · 右→左上一页
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => updateSetting('pageTurnMode', 'vertical')}
                  className={`px-3 py-2.5 md:py-3 rounded-lg border transition-all ${
                    settings.pageTurnMode === 'vertical'
                      ? 'shadow-lg scale-[1.02]'
                      : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    background: settings.pageTurnMode === 'vertical' 
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    borderColor: settings.pageTurnMode === 'vertical' ? 'transparent' : themeStyles.border,
                    color: settings.pageTurnMode === 'vertical' ? '#fff' : themeStyles.text,
                  }}
                >
                  <div className="text-center">
                    <div className="text-sm font-bold mb-0.5">上滑翻页</div>
                    <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMode === 'vertical' ? 0.9 : 0.6 }}>
                      下→上下一页 · 上→下上一页
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 翻页模式（点击翻页时有效） */}
          {settings.pageTurnMethod === 'click' && (
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">翻页模式</label>
              <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                <button
                  onClick={() => updateSetting('pageTurnMode', 'horizontal')}
                  className={`px-3 py-2.5 rounded-lg border transition-all ${
                    settings.pageTurnMode === 'horizontal'
                      ? 'shadow-lg scale-[1.02]'
                      : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    background: settings.pageTurnMode === 'horizontal' 
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    borderColor: settings.pageTurnMode === 'horizontal' ? 'transparent' : themeStyles.border,
                    color: settings.pageTurnMode === 'horizontal' ? '#fff' : themeStyles.text,
                  }}
                >
                  <div className="text-center">
                    <div className="text-sm font-bold mb-0.5">左右翻页</div>
                    <div className="text-[10px]" style={{ opacity: settings.pageTurnMode === 'horizontal' ? 0.9 : 0.6 }}>点击左/右</div>
                  </div>
                </button>
                <button
                  onClick={() => updateSetting('pageTurnMode', 'vertical')}
                  className={`px-3 py-2.5 rounded-lg border transition-all ${
                    settings.pageTurnMode === 'vertical'
                      ? 'shadow-lg scale-[1.02]'
                      : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    background: settings.pageTurnMode === 'vertical' 
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                          : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    borderColor: settings.pageTurnMode === 'vertical' ? 'transparent' : themeStyles.border,
                    color: settings.pageTurnMode === 'vertical' ? '#fff' : themeStyles.text,
                  }}
                >
                  <div className="text-center">
                    <div className="text-sm font-bold mb-0.5">上下翻页</div>
                    <div className="text-[10px]" style={{ opacity: settings.pageTurnMode === 'vertical' ? 0.9 : 0.6 }}>点击上/下</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 显示底部信息栏 */}
          <div className="mb-0">
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
              borderColor: themeStyles.border,
              background: settings.showBottomInfoBar 
                ? (settings.theme === 'dark' 
                    ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                    : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
            }}>
              <div>
                <label className="text-sm font-semibold block">底部信息栏</label>
                <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                  书名 · 页码 · 时间
                </div>
              </div>
              <button
                onClick={() => updateSetting('showBottomInfoBar', !settings.showBottomInfoBar)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                  settings.showBottomInfoBar 
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                aria-label="切换底部信息栏"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    settings.showBottomInfoBar ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
          </div>

          {/* 阅读区域宽度（PC端专用） */}
          <div className="mb-4 hidden md:block">
            <label className="block text-sm font-semibold mb-2">阅读区域宽度</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateSetting('readerWidth', 'centered')}
                className={`px-3 py-2.5 rounded-lg border transition-all ${
                  settings.readerWidth === 'centered'
                    ? 'shadow-lg scale-[1.02]'
                    : 'hover:scale-[1.02]'
                }`}
                style={{
                  background: settings.readerWidth === 'centered' 
                    ? (settings.theme === 'dark' 
                        ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                        : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                    : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  borderColor: settings.readerWidth === 'centered' ? 'transparent' : themeStyles.border,
                  color: settings.readerWidth === 'centered' ? '#fff' : themeStyles.text,
                }}
              >
                <div className="text-center">
                  <div className="text-sm font-bold mb-0.5">居中</div>
                  <div className="text-[10px]" style={{ opacity: settings.readerWidth === 'centered' ? 0.9 : 0.6 }}>980px 舒适</div>
                </div>
              </button>
              <button
                onClick={() => updateSetting('readerWidth', 'full')}
                className={`px-3 py-2.5 rounded-lg border transition-all ${
                  settings.readerWidth === 'full'
                    ? 'shadow-lg scale-[1.02]'
                    : 'hover:scale-[1.02]'
                }`}
                style={{
                  background: settings.readerWidth === 'full' 
                    ? (settings.theme === 'dark' 
                        ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                        : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                    : (settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  borderColor: settings.readerWidth === 'full' ? 'transparent' : themeStyles.border,
                  color: settings.readerWidth === 'full' ? '#fff' : themeStyles.text,
                }}
              >
                <div className="text-center">
                  <div className="text-sm font-bold mb-0.5">全宽</div>
                  <div className="text-[10px]" style={{ opacity: settings.readerWidth === 'full' ? 0.9 : 0.6 }}>铺满屏幕</div>
                </div>
              </button>
            </div>
          </div>

          {/* PDF专用设置 */}
          {bookType === 'pdf' && (
            <>
              <div className="mb-4 pb-3 border-b" style={{ borderColor: themeStyles.border }}>
                <div className="text-xs font-bold mb-3 flex items-center gap-2" style={{ 
                  opacity: 0.5,
                  letterSpacing: '0.05em'
                }}>
                  <div className="w-1 h-3 rounded-full bg-gradient-to-b from-purple-500 to-purple-600" />
                  PDF设置
                </div>

                {/* PDF缩放 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold">PDF缩放</label>
                    <span className="text-sm font-bold px-2.5 py-0.5 rounded-md" style={{ 
                      color: '#fff',
                      background: settings.theme === 'dark' ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)' : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)',
                      boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
                    }}>
                      {(settings.fontSize / 10).toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={settings.fontSize / 10}
                    onChange={(e) => updateSetting('fontSize', parseFloat(e.target.value) * 10)}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} 0%, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} ${((settings.fontSize / 10 - 0.5) / 2.5) * 100}%, ${themeStyles.border} ${((settings.fontSize / 10 - 0.5) / 2.5) * 100}%, ${themeStyles.border} 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-[10px] mt-1" style={{ opacity: 0.5 }}>
                    <span>0.5x 小</span>
                    <span>3.0x 大</span>
                  </div>
                </div>

                {/* 自适应屏幕 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
                    borderColor: themeStyles.border,
                    background: (settings.pdfAutoFit ?? false)
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                          : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
                  }}>
                    <div>
                      <label className="text-sm font-semibold block">自适应屏幕</label>
                      <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                        自动调整PDF页面大小以完全适合屏幕显示
                      </div>
                    </div>
                    <button
                      onClick={() => updateSetting('pdfAutoFit', !(settings.pdfAutoFit ?? false))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                        (settings.pdfAutoFit ?? false)
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      aria-label="切换自适应屏幕"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          (settings.pdfAutoFit ?? false) ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 自动裁剪白边 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
                    borderColor: themeStyles.border,
                    background: (settings.pdfAutoCropMargins ?? false)
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                          : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
                  }}>
                    <div>
                      <label className="text-sm font-semibold block">自动裁剪白边</label>
                      <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                        智能去除PDF边缘空白，最大化内容显示
                      </div>
                    </div>
                    <button
                      onClick={() => updateSetting('pdfAutoCropMargins', !(settings.pdfAutoCropMargins ?? false))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                        (settings.pdfAutoCropMargins ?? false)
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      aria-label="切换自动裁剪白边"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          (settings.pdfAutoCropMargins ?? false) ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 渲染质量 */}
                <div className="mb-0">
                  <label className="block text-sm font-semibold mb-2">渲染质量</label>
                  <div className="text-[10px] mb-2" style={{ opacity: 0.6 }}>
                    选择更高的质量可以获得更清晰的显示效果，但会消耗更多性能
                  </div>
                  <select
                    value={settings.pdfRenderQuality ?? 'ultra'}
                    onChange={(e) => updateSetting('pdfRenderQuality', e.target.value as 'standard' | 'high' | 'ultra')}
                    className="w-full px-3 py-2.5 rounded-lg border transition-all"
                    style={{
                      backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                      color: themeStyles.text,
                      borderColor: themeStyles.border,
                    }}
                  >
                    <option value="standard">标准 (1.5x) - 性能优先</option>
                    <option value="high">高质量 (2.0x) - 推荐</option>
                    <option value="ultra">超高质量 (3.0x) - 最佳清晰度</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

