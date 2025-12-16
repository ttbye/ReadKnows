/**
 * @file ReadingSettings.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect } from 'react';
import { X, Type, Palette, Minus, Plus, RotateCcw } from 'lucide-react';
import api from '../utils/api';

interface ReadingSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    fontSize: number;
    fontFamily: string;
    lineHeight: number;
    theme: 'light' | 'dark' | 'sepia' | 'green';
    brightness: number;
    margin: number;
    pageTurnMode: 'horizontal' | 'vertical';
    clickToTurn: boolean;
    keyboardShortcuts: {
      prev: string;
      next: string;
    };
  };
  onSettingsChange: (settings: any) => void;
}

// 默认字体选项
const defaultFontFamilies = [
  { value: 'default', label: '默认字体', font: 'system-ui', url: null },
  { value: 'serif', label: '衬线字体', font: 'Georgia, "Times New Roman", serif', url: null },
  { value: 'sans-serif', label: '无衬线字体', font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', url: null },
  { value: 'monospace', label: '等宽字体', font: '"Courier New", monospace', url: null },
  { value: 'song', label: '宋体', font: '"SimSun", "STSong", serif', url: null },
  { value: 'hei', label: '黑体', font: '"SimHei", "STHeiti", sans-serif', url: null },
  { value: 'kai', label: '楷体', font: '"KaiTi", "STKaiti", serif', url: null },
];

const themes = [
  { value: 'light', label: '白色', bg: '#ffffff', text: '#000000' },
  { value: 'sepia', label: '护眼', bg: '#f4e4bc', text: '#5c4b37' },
  { value: 'green', label: '绿色', bg: '#c8e6c9', text: '#2e7d32' },
  { value: 'dark', label: '夜间', bg: '#1a1a1a', text: '#ffffff' },
];

export default function ReadingSettings({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: ReadingSettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [fontFamilies, setFontFamilies] = useState(defaultFontFamilies);
  const [loadingFonts, setLoadingFonts] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  // 加载服务器字体列表
  useEffect(() => {
    if (isOpen) {
      loadFonts();
    }
  }, [isOpen]);

  const loadFonts = async () => {
    try {
      setLoadingFonts(true);
      const response = await api.get('/api/fonts');
      const serverFonts = response.data.fonts.map((font: any) => ({
        value: font.id,
        label: font.name,
        font: font.name,
        url: font.url,
      }));
      setFontFamilies([...defaultFontFamilies, ...serverFonts]);
    } catch (error: any) {
      console.error('加载字体列表失败:', error);
    } finally {
      setLoadingFonts(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const resetSettings = () => {
    const defaultSettings = {
      fontSize: 18,
      fontFamily: 'default',
      lineHeight: 1.8,
      theme: 'light' as const,
      brightness: 100,
      margin: 20,
      pageTurnMode: 'horizontal' as const,
      clickToTurn: true,
      keyboardShortcuts: {
        prev: 'ArrowLeft',
        next: 'ArrowRight',
      },
    };
    setLocalSettings(defaultSettings);
    onSettingsChange(defaultSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center reading-settings-panel">
      <div className="bg-white dark:bg-gray-900 w-full md:w-[500px] md:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold">阅读设置</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 设置内容 */}
        <div className="p-6 space-y-6">
          {/* 字体大小 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span className="font-medium">字体大小</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {localSettings.fontSize}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSetting('fontSize', Math.max(12, localSettings.fontSize - 2))}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${((localSettings.fontSize - 12) / (32 - 12)) * 100}%` }}
                />
              </div>
              <button
                onClick={() => updateSetting('fontSize', Math.min(32, localSettings.fontSize + 2))}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>12px</span>
              <span>32px</span>
            </div>
          </div>

          {/* 字体选择 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="font-medium">字体</span>
              {loadingFonts && <span className="text-xs text-gray-500">加载中...</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {fontFamilies.map((font) => {
                // 如果字体有URL，加载字体文件
                const fontStyle: React.CSSProperties = font.url
                  ? {
                      fontFamily: `"${font.font}", ${font.font}`,
                      fontFeatureSettings: 'normal',
                    }
                  : { fontFamily: font.font };
                
                // 如果字体有URL，添加@font-face
                if (font.url) {
                  const styleId = `font-style-${font.value}`;
                  if (!document.getElementById(styleId)) {
                    const style = document.createElement('style');
                    style.id = styleId;
                    style.textContent = `
                      @font-face {
                        font-family: "${font.font}";
                        src: url("${font.url}") format("truetype");
                        font-display: swap;
                      }
                    `;
                    document.head.appendChild(style);
                  }
                }

                return (
                  <button
                    key={font.value}
                    onClick={() => updateSetting('fontFamily', font.value)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      localSettings.fontFamily === font.value
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    style={fontStyle}
                  >
                    <div className="font-medium text-sm">{font.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      示例文字 Aa
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 行距 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <span className="font-medium">行距</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {localSettings.lineHeight.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSetting('lineHeight', Math.max(1.2, localSettings.lineHeight - 0.1))}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${((localSettings.lineHeight - 1.2) / (2.5 - 1.2)) * 100}%` }}
                />
              </div>
              <button
                onClick={() => updateSetting('lineHeight', Math.min(2.5, localSettings.lineHeight + 0.1))}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1.2</span>
              <span>2.5</span>
            </div>
          </div>

          {/* 背景主题 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="font-medium">背景主题</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => updateSetting('theme', theme.value)}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    localSettings.theme === theme.value
                      ? 'border-blue-600 ring-2 ring-blue-200 dark:ring-blue-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  style={{ backgroundColor: theme.bg }}
                >
                  <div
                    className="w-full h-16 rounded mb-2"
                    style={{ backgroundColor: theme.bg }}
                  />
                  <div className="text-xs font-medium text-center" style={{ color: theme.text }}>
                    {theme.label}
                  </div>
                  {localSettings.theme === theme.value && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 页边距 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">页边距</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {localSettings.margin}px
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSetting('margin', Math.max(0, localSettings.margin - 5))}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${(localSettings.margin / 40) * 100}%` }}
                />
              </div>
              <button
                onClick={() => updateSetting('margin', Math.min(40, localSettings.margin + 5))}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>0px</span>
              <span>40px</span>
            </div>
          </div>

          {/* 翻页模式 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium">翻页模式</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateSetting('pageTurnMode', 'vertical')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  localSettings.pageTurnMode === 'vertical'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">⬆️ ⬇️</div>
                  <div className="text-sm font-medium">上下翻页</div>
                  <div className="text-xs text-gray-500 mt-1">点击上方翻到上页<br/>点击下方翻到下页</div>
                </div>
              </button>
              <button
                onClick={() => updateSetting('pageTurnMode', 'horizontal')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  localSettings.pageTurnMode === 'horizontal'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">⬅️ ➡️</div>
                  <div className="text-sm font-medium">左右翻页</div>
                  <div className="text-xs text-gray-500 mt-1">点击左侧翻到上页<br/>点击右侧翻到下页</div>
                </div>
              </button>
            </div>
          </div>

          {/* 点击翻页 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">点击翻页</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.clickToTurn}
                  onChange={(e) => updateSetting('clickToTurn', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {localSettings.pageTurnMode === 'vertical' 
                ? '点击上半部分上一页，点击下半部分下一页'
                : '点击左半部分上一页，点击右半部分下一页'}
            </p>
          </div>

          {/* 键盘快捷键 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium">键盘快捷键</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  上一页
                </label>
                <input
                  type="text"
                  value={localSettings.keyboardShortcuts?.prev || 'ArrowLeft'}
                  onChange={(e) => {
                    const shortcuts = { ...localSettings.keyboardShortcuts, prev: e.target.value };
                    updateSetting('keyboardShortcuts', shortcuts);
                  }}
                  className="input text-sm"
                  placeholder="ArrowLeft"
                  readOnly
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  默认: ← 左箭头键
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  下一页
                </label>
                <input
                  type="text"
                  value={localSettings.keyboardShortcuts?.next || 'ArrowRight'}
                  onChange={(e) => {
                    const shortcuts = { ...localSettings.keyboardShortcuts, next: e.target.value };
                    updateSetting('keyboardShortcuts', shortcuts);
                  }}
                  className="input text-sm"
                  placeholder="ArrowRight"
                  readOnly
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  默认: → 右箭头键
                </p>
              </div>
            </div>
          </div>

          {/* 重置按钮 */}
          <button
            onClick={resetSettings}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>恢复默认</span>
          </button>
        </div>
      </div>
    </div>
  );
}

