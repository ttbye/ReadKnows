/**
 * @author ttbye
 * 底部功能导航栏
 * 仿Kindle/微信读书风格，点击阅读内容时显示，包含各种功能按钮
 */

import { BookOpen, Type, StickyNote, Volume2, Bookmark, BookmarkCheck, Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { BookData, ReadingPosition, ReadingSettings } from '../../types/reader';
import { useState, useEffect, forwardRef } from 'react';
import api from '../../utils/api';

interface BottomNavigationProps {
  book: BookData;
  position: ReadingPosition;
  settings: ReadingSettings;
  onSettingsChange: (settings: ReadingSettings) => void;
  isVisible: boolean;
  onToggleTOC: () => void;
  onToggleSettings: () => void;
  onToggleNotes?: () => void;
  onToggleTTS?: () => void;
  onToggleBookmark?: () => void;
  onToggleBookmarkPanel?: () => void;
  hasBookmark?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  // TTS播放控制模式
  isTTSMode?: boolean;
  isTTSPlaying?: boolean;
  ttsCurrentIndex?: number;
  ttsTotalParagraphs?: number;
  onTTSPlayPause?: () => void;
  onTTSPrev?: () => void;
  onTTSNext?: () => void;
  onTTSClose?: () => void;
  onTTSModelChange?: (model: string) => void;
  onTTSVoiceChange?: (voice: string) => void;
  onTTSSpeedChange?: (speed: number) => void;
  onClose?: () => void; // 关闭按钮回调
  isSettingsMode?: boolean; // 是否为设置模式
}

const BottomNavigation = forwardRef<HTMLDivElement, BottomNavigationProps>(function BottomNavigation({
  book,
  position,
  settings,
  onSettingsChange,
  isVisible,
  onToggleTOC,
  onToggleSettings,
  onToggleNotes,
  onToggleTTS,
  onToggleBookmark,
  onToggleBookmarkPanel,
  hasBookmark = false,
  onMouseEnter,
  onMouseLeave,
  isTTSMode = false,
  isTTSPlaying = false,
  ttsCurrentIndex = -1,
  ttsTotalParagraphs = 0,
  onTTSPlayPause,
  onTTSPrev,
  onTTSNext,
  onTTSClose,
  onTTSModelChange,
  onTTSVoiceChange,
  onTTSSpeedChange,
  onClose,
  isSettingsMode = false,
}, ref) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [infoBarHeight, setInfoBarHeight] = useState(34); // 默认移动端高度
  const [models, setModels] = useState<Array<{ id: string; name: string; description: string; type: string; available: boolean }>>([]);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; lang: string; gender?: string; style?: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [showTTSOptions, setShowTTSOptions] = useState(false); // 控制TTS选项的显示/隐藏

  const settingsAny = settings as any;
  // 优先从本地存储读取，如果没有则使用设置中的值，最后使用默认值（1.0倍速）
  const getLocalStorageValue = (key: string, defaultValue: string): string => {
    try {
      const saved = localStorage.getItem(key);
      return saved || defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };
  
  const currentModel = getLocalStorageValue('tts_default_model', settingsAny.tts_default_model?.value || 'edge');
  const currentVoice = getLocalStorageValue('tts_default_voice', settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural');
  // 默认播放速度为1.0倍速，如果检测到旧版本默认值0.5，则使用1.0
  const speedValue = parseFloat(getLocalStorageValue('tts_default_speed', settingsAny.tts_default_speed?.value || '1.0')) || 1.0;
  const currentSpeed = (speedValue === 0.5 || speedValue <= 0 || isNaN(speedValue)) ? 1.0 : speedValue;

  // 监听窗口大小变化和设置变化，动态计算底部信息栏高度
  useEffect(() => {
    const updateInfoBarHeight = () => {
      // 如果不显示底部信息栏，高度为0
      if (!settings.showBottomInfoBar) {
        setInfoBarHeight(0);
        return;
      }
      
      const width = window.innerWidth;
      const height = width < 768 ? 34 : width < 1024 ? 42 : 48;
      setInfoBarHeight(height);
    };
    
    updateInfoBarHeight();
    window.addEventListener('resize', updateInfoBarHeight);
    return () => window.removeEventListener('resize', updateInfoBarHeight);
  }, [settings.showBottomInfoBar]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取TTS模型列表
  useEffect(() => {
    if (isTTSMode) {
      fetchModels();
    }
  }, [isTTSMode]);

  // 获取语音列表
  useEffect(() => {
    if (isTTSMode && currentModel) {
      fetchVoices(currentModel);
    }
  }, [isTTSMode, currentModel]);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const resp = await api.get('/tts/models');
      const modelsList = resp.data.models || [];
      setModels(modelsList);
    } catch (e: any) {
      console.error('[BottomNavigation] 获取 models 失败', e);
      setModels([
        { id: 'edge', name: 'Edge-TTS', description: '微软Edge TTS（在线，高质量）', type: 'online', available: true },
        { id: 'qwen3', name: 'Qwen3-TTS', description: '通义千问TTS（在线，高质量）', type: 'online', available: true },
      ]);
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchVoices = async (modelId: string) => {
    setLoadingVoices(true);
    try {
      // 获取系统语言设置，用于筛选音色
      let systemLang = 'zh'; // 默认中文
      try {
        const settingsResp = await api.get('/settings');
        const systemLanguage = settingsResp.data.settings?.system_language?.value || 'zh-CN';
        systemLang = systemLanguage === 'zh-CN' ? 'zh' : (systemLanguage === 'en' ? 'en' : 'zh');
      } catch (e) {
        console.warn('[BottomNavigation] 获取系统语言设置失败，使用默认值（中文）', e);
      }
      
      console.log(`[BottomNavigation] 获取音色列表: model=${modelId}, lang=${systemLang}`);
      const resp = await api.get('/tts/voices', { 
        params: { 
          model: modelId,
          lang: systemLang  // 传递语言参数，后端会根据此参数筛选音色
        } 
      });
      const voicesList = resp.data.voices || [];
      console.log(`[BottomNavigation] 成功获取 ${voicesList.length} 个音色（已根据系统语言 ${systemLang} 筛选）`);
      setVoices(voicesList);
    } catch (e: any) {
      console.error('[BottomNavigation] 获取 voices 失败', e);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleModelChange = async (model: string) => {
    console.log(`[BottomNavigation] 切换模型: ${currentModel} -> ${model}`);
    // 保存到本地存储
    try {
      localStorage.setItem('tts_default_model', model);
    } catch (e) {
      console.warn('[BottomNavigation] 保存TTS引擎到本地存储失败:', e);
    }
    
    // 切换模型时，立即从API获取新的音色列表
    await fetchVoices(model);
    
    if (onTTSModelChange) {
      onTTSModelChange(model);
    } else {
      onSettingsChange({
        ...settings,
        tts_default_model: { value: model },
      } as any);
    }
  };

  const handleVoiceChange = (voice: string) => {
    // 保存到本地存储
    try {
      localStorage.setItem('tts_default_voice', voice);
    } catch (e) {
      console.warn('[BottomNavigation] 保存TTS音色到本地存储失败:', e);
    }
    
    if (onTTSVoiceChange) {
      onTTSVoiceChange(voice);
    } else {
      onSettingsChange({
        ...settings,
        tts_default_voice: { value: voice },
      } as any);
    }
  };

  const handleSpeedChange = (speed: number) => {
    // 确保速度值有效，默认为1.0
    const validSpeed = isNaN(speed) || speed <= 0 ? 1.0 : speed;
    
    // 保存到本地存储
    try {
      localStorage.setItem('tts_default_speed', validSpeed.toString());
      console.log('[BottomNavigation] 播放速度已保存到本地存储:', validSpeed);
    } catch (e) {
      console.warn('[BottomNavigation] 保存播放速度到本地存储失败:', e);
    }
    
    if (onTTSSpeedChange) {
      onTTSSpeedChange(validSpeed);
    } else {
      onSettingsChange({
        ...settings,
        tts_default_speed: { value: validSpeed.toString() },
      } as any);
    }
  };
  
  // 从本地存储加载TTS设置（只在组件挂载时执行一次）
  useEffect(() => {
    try {
      const savedModel = localStorage.getItem('tts_default_model');
      const savedVoice = localStorage.getItem('tts_default_voice');
      const savedSpeed = localStorage.getItem('tts_default_speed');
      
      if (savedModel && savedModel !== currentModel) {
        if (onTTSModelChange) {
          onTTSModelChange(savedModel);
        } else {
          onSettingsChange({
            ...settings,
            tts_default_model: { value: savedModel },
          } as any);
        }
      }
      if (savedVoice && savedVoice !== currentVoice) {
        if (onTTSVoiceChange) {
          onTTSVoiceChange(savedVoice);
        } else {
          onSettingsChange({
            ...settings,
            tts_default_voice: { value: savedVoice },
          } as any);
        }
      }
      // 加载播放速度，如果没有保存的值或值为0.5，则使用默认值1.0
      if (savedSpeed) {
        const speed = parseFloat(savedSpeed);
        // 如果值是0.5，将其更新为1.0（修复旧版本的默认值）
        if (speed === 0.5) {
          console.log('[BottomNavigation] 检测到旧版本默认值0.5，更新为1.0');
          try {
            localStorage.setItem('tts_default_speed', '1.0');
            if (onTTSSpeedChange) {
              onTTSSpeedChange(1.0);
            } else {
              onSettingsChange({
                ...settings,
                tts_default_speed: { value: '1.0' },
              } as any);
            }
          } catch (e) {
            console.warn('[BottomNavigation] 更新播放速度失败:', e);
          }
        } else if (!isNaN(speed) && speed > 0 && speed !== currentSpeed) {
          console.log('[BottomNavigation] 从本地存储加载播放速度:', speed);
          if (onTTSSpeedChange) {
            onTTSSpeedChange(speed);
          } else {
            onSettingsChange({
              ...settings,
              tts_default_speed: { value: savedSpeed },
            } as any);
          }
        }
      } else {
        // 如果没有保存的值，设置默认值为1.0并保存
        console.log('[BottomNavigation] 未找到保存的播放速度，使用默认值1.0');
        try {
          localStorage.setItem('tts_default_speed', '1.0');
        } catch (e) {
          console.warn('[BottomNavigation] 保存默认播放速度失败:', e);
        }
      }
    } catch (e) {
      console.warn('[BottomNavigation] 从本地存储加载TTS设置失败:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0', hover: 'rgba(0, 0, 0, 0.05)' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040', hover: 'rgba(255, 255, 255, 0.1)' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c', hover: 'rgba(0, 0, 0, 0.05)' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7', hover: 'rgba(0, 0, 0, 0.05)' },
  }[settings.theme];

  const progressPercentage = Math.round(position.progress * 100);
  
  // TTS播放进度
  const ttsProgress = ttsTotalParagraphs > 0 && ttsCurrentIndex >= 0 
    ? ((ttsCurrentIndex + 1) / ttsTotalParagraphs) * 100 
    : 0;

  return (
    <div
      ref={ref}
      className={`fixed left-0 right-0 z-40 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
      }`}
      style={{
        // 定位在底部信息栏上方
        // 底部信息栏外层容器有paddingBottom处理安全区域，所以实际高度 = infoBarHeight + 安全区域
        // 所以这里需要定位在 infoBarHeight + 安全区域 的位置
        bottom: settings.showBottomInfoBar 
          ? `calc(${infoBarHeight}px + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))` 
          : '0',
        left: '0',
        right: '0',
        backgroundColor: themeStyles.bg,
        borderTop: `1px solid ${themeStyles.border}`,
        boxShadow: isVisible ? '0 -2px 8px rgba(0, 0, 0, 0.08)' : 'none',
        // 如果不显示底部信息栏，需要自己处理安全区域
        paddingBottom: settings.showBottomInfoBar 
          ? '0px' 
          : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
        margin: '0', // 确保没有margin
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isTTSMode ? (
        <>
          {/* TTS播放控制模式 */}
          {/* 关闭按钮 */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" style={{ color: themeStyles.text }} />
              <span className="text-xs font-medium" style={{ color: themeStyles.text }}>语音朗读</span>
            </div>
            {onTTSClose && (
              <button
                onClick={onTTSClose}
                className="p-1.5 rounded-full transition-all hover:scale-110"
                style={{
                  color: themeStyles.text,
                  backgroundColor: settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                }}
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* TTS播放进度条 */}
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between text-xs mb-1" style={{ color: themeStyles.text, opacity: 0.75 }}>
              <span>播放进度</span>
              <span className="font-medium">
                {ttsCurrentIndex >= 0 ? `${ttsCurrentIndex + 1} / ${ttsTotalParagraphs}` : '0 / 0'}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: themeStyles.border }}>
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${ttsProgress}%`,
                  backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                }}
              />
            </div>
          </div>

          {/* TTS播放控制按钮 */}
          <div className="flex items-center justify-center gap-4 px-3 pb-3">
            <button
              onClick={onTTSPrev}
              disabled={ttsCurrentIndex <= 0}
              className="p-2.5 rounded-full transition-all hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                color: themeStyles.text,
                backgroundColor: ttsCurrentIndex > 0 ? (settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)') : 'transparent',
              }}
              aria-label="上一段"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={onTTSPlayPause}
              className="p-3 rounded-full transition-all hover:scale-110 shadow-md"
              style={{
                backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                color: '#ffffff',
              }}
              aria-label={isTTSPlaying ? '暂停' : '播放'}
            >
              {isTTSPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={onTTSNext}
              disabled={ttsCurrentIndex >= ttsTotalParagraphs - 1}
              className="p-2.5 rounded-full transition-all hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                color: themeStyles.text,
                backgroundColor: ttsCurrentIndex < ttsTotalParagraphs - 1 ? (settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)') : 'transparent',
              }}
              aria-label="下一段"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* 播放速度控制 - 始终显示，默认速度为1.0x */}
          <div className="px-3 pb-2 border-t" style={{ borderColor: themeStyles.border }}>
            <div className="flex items-center justify-between pt-2">
              <label className="text-xs font-medium" style={{ color: themeStyles.text, opacity: 0.8 }}>
                播放速度:
              </label>
              <select
                value={currentSpeed}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="px-2 py-1 rounded text-xs transition-all"
                style={{
                  backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  borderColor: themeStyles.border,
                  color: themeStyles.text,
                  border: `1px solid ${themeStyles.border}`,
                }}
              >
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="0.8">0.8x</option>
                <option value="1.0">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">2.0x</option>
                <option value="2.5">2.5x</option>
              </select>
            </div>
          </div>

          {/* TTS选项展开/收起按钮 */}
          <div className="px-3 pb-2">
            <button
              onClick={() => setShowTTSOptions(!showTTSOptions)}
              className="w-full py-1.5 px-2 rounded-lg text-xs transition-all"
              style={{
                color: themeStyles.text,
                backgroundColor: settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              }}
            >
              {showTTSOptions ? '收起选项 ▲' : '展开选项 ▼'}
            </button>
          </div>

          {/* TTS选项面板 */}
          {showTTSOptions && (
            <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: themeStyles.border }}>
              {/* TTS引擎选择 */}
              <div className="pt-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: themeStyles.text, opacity: 0.8 }}>
                  TTS引擎
                </label>
                <select
                  value={currentModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs transition-all"
                  style={{
                    backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                    border: `1px solid ${themeStyles.border}`,
                  }}
                  disabled={loadingModels}
                >
                  {models.filter(m => m.available).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type === 'online' ? '在线' : '离线'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 音色选择 */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: themeStyles.text, opacity: 0.8 }}>
                  音色
                </label>
                <select
                  value={currentVoice}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs transition-all"
                  style={{
                    backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                    borderColor: themeStyles.border,
                    color: themeStyles.text,
                    border: `1px solid ${themeStyles.border}`,
                  }}
                  disabled={loadingVoices}
                >
                  {loadingVoices ? (
                    <option value="">加载中...</option>
                  ) : voices.length === 0 ? (
                    <option value="">暂无可用音色</option>
                  ) : (
                    voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.gender ? `(${v.gender === 'male' ? '男' : '女'})` : ''}
                    </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 正常导航模式 */}
      {/* 进度条 */}
      <div className="px-3 pt-2 pb-1.5">
        <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: themeStyles.border }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progressPercentage}%`,
              backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
            }}
          />
        </div>
      </div>

      {/* 信息行 - 缩小 */}
      <div className="flex items-center justify-between px-3 py-1 text-xs" style={{ color: themeStyles.text, opacity: 0.75, fontSize: '10px' }}>
        <span className="truncate max-w-[30%] font-medium">
          {book.title || book.file_name}
        </span>
        <span className="mx-2">
          第 {position.currentPage} / {position.totalPages} 页
        </span>
        <span>
          {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* 功能按钮 - 缩小间距 */}
      <div className="flex items-center justify-around px-1 pb-2 pt-0.5">
        <button
          onClick={onToggleTOC}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="目录"
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>目录</span>
        </button>

        <button
          onClick={onToggleSettings}
          className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
          style={{
            color: themeStyles.text,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeStyles.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="设置"
        >
          <Type className="w-4 h-4" />
          <span className="text-xs" style={{ fontSize: '10px' }}>设置</span>
        </button>

        {onToggleNotes && (
          <button
            onClick={onToggleNotes}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
            style={{
              color: themeStyles.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="笔记"
          >
            <StickyNote className="w-4 h-4" />
            <span className="text-xs" style={{ fontSize: '10px' }}>笔记</span>
          </button>
        )}

        {onToggleTTS && (
          <button
            onClick={onToggleTTS}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
            style={{
              color: themeStyles.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="朗读"
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-xs" style={{ fontSize: '10px' }}>朗读</span>
          </button>
        )}

        {onToggleBookmark && (
          <button
            onClick={onToggleBookmark}
            onDoubleClick={(e) => {
              e.preventDefault();
              onToggleBookmarkPanel?.();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onToggleBookmarkPanel?.();
            }}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors"
            style={{
              color: hasBookmark ? '#ff9800' : themeStyles.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeStyles.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label={hasBookmark ? "删除书签" : "添加书签"}
            title="单击：添加/删除书签 | 双击/右键：打开书签列表"
          >
            {hasBookmark ? (
              <BookmarkCheck className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
            <span className="text-xs" style={{ fontSize: '10px' }}>书签</span>
          </button>
        )}
      </div>
        </>
      )}
    </div>
  );
});

export default BottomNavigation;
