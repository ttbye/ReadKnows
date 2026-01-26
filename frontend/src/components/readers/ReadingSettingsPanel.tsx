/**
 * @author ttbye
 * 阅读设置面板
 * 根据不同格式显示不同的设置选项
 */

import { X, Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { ReadingSettings, BookData } from '../../types/reader';
import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { useTranslation } from 'react-i18next';

interface ReadingSettingsPanelProps {
  settings: ReadingSettings;
  bookType: BookData['file_type'];
  onSettingsChange: (settings: ReadingSettings) => void;
  onClose: () => void;
  // 播放控制模式
  isTTSMode?: boolean;
  isTTSPlaying?: boolean;
  ttsCurrentIndex?: number;
  ttsTotalParagraphs?: number;
  onTTSPlayPause?: () => void;
  onTTSPrev?: () => void;
  onTTSNext?: () => void;
}

export default function ReadingSettingsPanel({
  settings,
  bookType,
  onSettingsChange,
  onClose,
  isTTSMode = false,
  isTTSPlaying = false,
  ttsCurrentIndex = -1,
  ttsTotalParagraphs = 0,
  onTTSPlayPause,
  onTTSPrev,
  onTTSNext,
}: ReadingSettingsPanelProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<Array<{ id: string; name: string; description: string; type: string; available: boolean }>>([]);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; lang: string; gender?: string; style?: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);

  const settingsAny = settings as any;
  
  // 优先从本地存储读取，如果没有则使用设置中的值，最后使用默认值
  const getLocalStorageValue = (key: string, defaultValue: string): string => {
    try {
      const saved = localStorage.getItem(key);
      return saved || defaultValue;
    } catch (e) {
      return defaultValue;
    }
  };
  
  // 使用 state 来管理当前值，确保响应式更新
  const [currentModel, setCurrentModel] = useState(() => 
    getLocalStorageValue('tts_default_model', settingsAny.tts_default_model?.value || 'edge')
  );
  const [currentVoice, setCurrentVoice] = useState(() => 
    getLocalStorageValue('tts_default_voice', settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural')
  );
  const [currentSpeed, setCurrentSpeed] = useState(() => {
    const saved = getLocalStorageValue('tts_default_speed', settingsAny.tts_default_speed?.value || '1.0');
    const speed = parseFloat(saved);
    // 如果值是0.5，返回1.0（修复旧版本的默认值）
    return (speed === 0.5 || isNaN(speed) || speed <= 0) ? 1.0 : speed;
  });

  // 从本地存储加载TTS设置并同步到settings和state（只在组件挂载时执行一次）
  useEffect(() => {
    try {
      const savedModel = localStorage.getItem('tts_default_model');
      const savedVoice = localStorage.getItem('tts_default_voice');
      const savedSpeed = localStorage.getItem('tts_default_speed');
      
      let needUpdate = false;
      const updatedSettings = { ...settings };
      
      if (savedModel && savedModel !== settingsAny.tts_default_model?.value) {
        setCurrentModel(savedModel);
        (updatedSettings as any).tts_default_model = { value: savedModel };
        needUpdate = true;
      }
      
      if (savedVoice && savedVoice !== settingsAny.tts_default_voice?.value) {
        setCurrentVoice(savedVoice);
        (updatedSettings as any).tts_default_voice = { value: savedVoice };
        needUpdate = true;
      }
      
      if (savedSpeed) {
        const speed = parseFloat(savedSpeed);
        // 如果值是0.5，将其更新为1.0（修复旧版本的默认值）
        if (speed === 0.5) {
          localStorage.setItem('tts_default_speed', '1.0');
          setCurrentSpeed(1.0);
          (updatedSettings as any).tts_default_speed = { value: '1.0' };
          needUpdate = true;
        } else if (!isNaN(speed) && speed > 0) {
          setCurrentSpeed(speed);
          if (speed.toString() !== settingsAny.tts_default_speed?.value) {
            (updatedSettings as any).tts_default_speed = { value: speed.toString() };
            needUpdate = true;
          }
        }
      } else {
        // 如果没有保存的值，设置默认值为1.0并保存
        localStorage.setItem('tts_default_speed', '1.0');
        setCurrentSpeed(1.0);
        (updatedSettings as any).tts_default_speed = { value: '1.0' };
        needUpdate = true;
      }
      
      if (needUpdate) {
        console.log('[ReadingSettingsPanel] 从本地存储加载TTS设置并同步到settings');
        onSettingsChange(updatedSettings as ReadingSettings);
      }
    } catch (e) {
      console.warn('[ReadingSettingsPanel] 从本地存储加载TTS设置失败:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // 定期从 localStorage 同步最新值到 state（防止外部修改 localStorage）
  // 使用 ref 来避免不必要的更新
  const lastSyncedSpeedRef = useRef<number | null>(null);
  
  useEffect(() => {
    const syncFromLocalStorage = () => {
      const savedSpeed = localStorage.getItem('tts_default_speed');
      if (savedSpeed) {
        const speed = parseFloat(savedSpeed);
        // 如果值是0.5，自动更新为1.0
        if (speed === 0.5) {
          localStorage.setItem('tts_default_speed', '1.0');
          if (currentSpeed !== 1.0) {
            setCurrentSpeed(1.0);
            lastSyncedSpeedRef.current = 1.0;
          }
        } else if (!isNaN(speed) && speed > 0) {
          // 只有当 localStorage 的值与当前 state 不同时才更新
          if (speed !== currentSpeed && speed !== lastSyncedSpeedRef.current) {
            console.log('[ReadingSettingsPanel] 从 localStorage 同步播放速度到 state:', speed, '当前:', currentSpeed);
            setCurrentSpeed(speed);
            lastSyncedSpeedRef.current = speed;
          }
        }
      }
      
      const savedModel = localStorage.getItem('tts_default_model');
      if (savedModel && savedModel !== currentModel) {
        setCurrentModel(savedModel);
      }
      
      const savedVoice = localStorage.getItem('tts_default_voice');
      if (savedVoice && savedVoice !== currentVoice) {
        setCurrentVoice(savedVoice);
      }
    };
    
    // 立即同步一次
    syncFromLocalStorage();
    
    // 设置定期同步（每500ms检查一次，但只在值变化时更新）
    const interval = setInterval(syncFromLocalStorage, 500);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

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
      console.error('[ReadingSettingsPanel] 获取 models 失败', e);
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
        console.warn('[ReadingSettingsPanel] 获取系统语言设置失败，使用默认值（中文）', e);
      }
      
      console.log(`[ReadingSettingsPanel] 获取音色列表: model=${modelId}, lang=${systemLang}`);
      const resp = await api.get('/tts/voices', { 
        params: { 
          model: modelId,
          lang: systemLang  // 传递语言参数，后端会根据此参数筛选音色
        } 
      });
      const voicesList = resp.data.voices || [];
      console.log(`[ReadingSettingsPanel] 成功获取 ${voicesList.length} 个音色（已根据系统语言 ${systemLang} 筛选）`);
      setVoices(voicesList);
    } catch (e: any) {
      console.error('[ReadingSettingsPanel] 获取 voices 失败', e);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleModelChange = async (model: string) => {
    console.log(`[ReadingSettingsPanel] 切换模型: ${currentModel} -> ${model}`);
    // 更新 state
    setCurrentModel(model);
    
    // 保存到本地存储
    try {
      localStorage.setItem('tts_default_model', model);
      console.log('[ReadingSettingsPanel] TTS引擎已保存到本地存储:', model);
    } catch (e) {
      console.warn('[ReadingSettingsPanel] 保存TTS引擎到本地存储失败:', e);
    }
    
    // 切换模型时，立即从API获取新的音色列表
    await fetchVoices(model);
    
    // 更新设置
    onSettingsChange({
      ...settings,
      tts_default_model: { value: model },
    } as any);
  };

  const handleVoiceChange = (voice: string) => {
    // 更新 state
    setCurrentVoice(voice);
    
    // 保存到本地存储
    try {
      localStorage.setItem('tts_default_voice', voice);
      console.log('[ReadingSettingsPanel] TTS音色已保存到本地存储:', voice);
    } catch (e) {
      console.warn('[ReadingSettingsPanel] 保存TTS音色到本地存储失败:', e);
    }
    
    // 更新设置
    onSettingsChange({
      ...settings,
      tts_default_voice: { value: voice },
    } as any);
  };

  const handleSpeedChange = (speed: number) => {
    // 确保速度值有效，默认为1.0
    const validSpeed = isNaN(speed) || speed <= 0 ? 1.0 : speed;
    
    console.log('[ReadingSettingsPanel] handleSpeedChange 被调用，新速度:', validSpeed, '当前速度:', currentSpeed);
    
    // 先保存到本地存储（确保持久化）
    try {
      localStorage.setItem('tts_default_speed', validSpeed.toString());
      console.log('[ReadingSettingsPanel] 播放速度已保存到本地存储:', validSpeed);
      
      // 验证保存是否成功
      const saved = localStorage.getItem('tts_default_speed');
      console.log('[ReadingSettingsPanel] 验证保存结果:', saved, '期望值:', validSpeed.toString());
      
      if (saved !== validSpeed.toString()) {
        console.error('[ReadingSettingsPanel] 保存失败！保存的值与期望值不匹配');
      }
    } catch (e) {
      console.warn('[ReadingSettingsPanel] 保存播放速度到本地存储失败:', e);
    }
    
    // 更新 state（立即更新UI）
    setCurrentSpeed(validSpeed);
    lastSyncedSpeedRef.current = validSpeed;
    
    // 更新设置
    onSettingsChange({
      ...settings,
      tts_default_speed: { value: validSpeed.toString() },
    } as any);
  };

  // 计算播放进度
  const progress = ttsTotalParagraphs > 0 && ttsCurrentIndex >= 0 
    ? ((ttsCurrentIndex + 1) / ttsTotalParagraphs) * 100 
    : 0;

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
    console.log(`[ReadingSettingsPanel] 更新设置 ${key}:`, value, '完整设置:', updatedSettings);
    // 立即调用 onSettingsChange，确保设置被保存
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
        animation: 'fadeIn 0.2s ease-out',
        paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
          ? `max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 0px)`
          : '0px',
        paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
          ? `calc(${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
          : 'max(env(safe-area-inset-bottom, 0px), 0px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 0px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 0px)',
      }}
      onClick={onClose}
    >
      <div 
        className="w-full md:w-[90vw] lg:w-[80vw] xl:w-[70vw] max-w-5xl md:h-auto md:max-h-[85vh] rounded-t-3xl md:rounded-3xl flex flex-col animate-slide-up overflow-hidden"
        style={{
          backgroundColor: themeStyles.bg,
          color: themeStyles.text,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 0px) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
            : '85vh',
          height: typeof window !== 'undefined' && window.innerWidth < 1024 ? 'auto' : undefined,
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
          <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
            {isTTSMode ? (
              <>
                <Volume2 className="w-5 h-5" />
                语音朗读
              </>
            ) : (
              '阅读设置'
            )}
          </h2>
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
          {/* TTS播放控制模式 */}
          {isTTSMode ? (
            <div className="space-y-6">
              {/* 进度条 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{t('tts.playbackProgress')}</span>
                  <span className="font-bold">
                    {ttsCurrentIndex >= 0 ? `${ttsCurrentIndex + 1} / ${ttsTotalParagraphs}` : '0 / 0'}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: themeStyles.border }}>
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                    }}
                  />
                </div>
              </div>

              {/* 播放控制 */}
              <div className="flex items-center justify-center gap-6 py-6">
                <button
                  onClick={onTTSPrev}
                  disabled={ttsCurrentIndex <= 0}
                  className="p-4 rounded-full transition-all hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    color: themeStyles.text,
                    backgroundColor: ttsCurrentIndex > 0 ? (settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)') : 'transparent',
                  }}
                >
                  <SkipBack className="w-6 h-6" />
                </button>
                <button
                  onClick={onTTSPlayPause}
                  className="p-5 rounded-full transition-all hover:scale-110 shadow-lg"
                  style={{
                    backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                    color: '#ffffff',
                  }}
                >
                  {isTTSPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                </button>
                <button
                  onClick={onTTSNext}
                  disabled={ttsCurrentIndex >= ttsTotalParagraphs - 1}
                  className="p-4 rounded-full transition-all hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    color: themeStyles.text,
                    backgroundColor: ttsCurrentIndex < ttsTotalParagraphs - 1 ? (settings.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)') : 'transparent',
                  }}
                >
                  <SkipForward className="w-6 h-6" />
                </button>
              </div>

              {/* TTS设置 */}
              <div className="space-y-4 border-t pt-6" style={{ borderColor: themeStyles.border }}>
                {/* TTS引擎选择 */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">TTS引擎</label>
                  <select
                    value={currentModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border text-sm transition-all"
                    style={{
                      backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                    disabled={loadingModels}
                  >
                    {models.filter(m => m.available).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.type === 'online' ? t('tts.online') : t('tts.offline')})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 音色选择 */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t('tts.voice')}</label>
                  <select
                    value={currentVoice}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border text-sm transition-all"
                    style={{
                      backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                    disabled={loadingVoices}
                  >
                    {loadingVoices ? (
                      <option value="">{t('common.loading')}</option>
                    ) : voices.length === 0 ? (
                      <option value="">{t('tts.noAvailableVoices')}</option>
                    ) : (
                      voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.gender ? `(${v.gender === 'male' ? t('tts.male') : t('tts.female')})` : ''}
                      </option>
                      ))
                    )}
                  </select>
                </div>

                {/* 播放速度 */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">{t('tts.playbackSpeed')}</label>
                  <select
                    value={currentSpeed.toString()}
                    onChange={(e) => handleSpeedChange(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border text-sm transition-all"
                    style={{
                      backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                  >
                    <option value="0.8">0.8x</option>
                    <option value="1.0">1.0x</option>
                    <option value="1.2">1.2x</option>
                    <option value="1.5">1.5x</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <>
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
                  {t('reader.textStyle')}
                </div>

                {/* 字体大小 */}
              <div className="mb-4 md:mb-5">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold">{t('reader.fontSize')}</label>
                  <div className="flex items-center gap-2">
                    {/* 自定义输入框 */}
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={settings.fontSize}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value > 0 && value <= 200) {
                          updateSetting('fontSize', value);
                        }
                      }}
                      onBlur={(e) => {
                        const value = parseInt(e.target.value);
                        if (isNaN(value) || value <= 0) {
                          updateSetting('fontSize', 18); // 默认值
                        } else if (value > 200) {
                          updateSetting('fontSize', 200); // 最大值
                        }
                      }}
                      className="w-16 px-2 py-1 text-sm text-center rounded-lg border focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        borderColor: themeStyles.border,
                        color: themeStyles.text,
                        focusRingColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                      }}
                      aria-label={t('reader.customFontSize')}
                    />
                    <span className="text-xs" style={{ color: themeStyles.text, opacity: 0.7 }}>px</span>
                  </div>
                </div>
                
                {/* 快捷调节：减号在左，滑块在中间，加号在右 */}
                <div className="flex items-center gap-2 mb-2">
                  {/* 减号按钮 - 最左侧 */}
                  <button
                    onClick={() => {
                      const newSize = Math.max(1, settings.fontSize - 1);
                      updateSetting('fontSize', newSize);
                    }}
                    className="w-10 h-10 rounded-lg border flex items-center justify-center font-bold text-lg transition-all hover:scale-[1.05] active:scale-[0.95] shadow-sm"
                    style={{
                      background: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                    aria-label={t('reader.decreaseFont')}
                  >
                    −
                  </button>
                  
                  {/* 滑块 - 中间 */}
                  <div className="flex-1">
                    <input
                      type="range"
                      min="15"
                      max="40"
                      value={Math.max(15, Math.min(40, settings.fontSize))}
                      onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} 0%, ${settings.theme === 'dark' ? '#4a9eff' : '#1890ff'} ${((Math.max(15, Math.min(40, settings.fontSize)) - 15) / 25) * 100}%, ${themeStyles.border} ${((Math.max(15, Math.min(40, settings.fontSize)) - 15) / 25) * 100}%, ${themeStyles.border} 100%)`,
                      }}
                    />
                    <div className="flex justify-between text-[10px] mt-1" style={{ opacity: 0.5 }}>
                      <span>15px</span>
                      <span>40px</span>
                    </div>
                  </div>
                  
                  {/* 加号按钮 - 最右侧 */}
                  <button
                    onClick={() => {
                      const newSize = Math.min(200, settings.fontSize + 1);
                      updateSetting('fontSize', newSize);
                    }}
                    className="w-10 h-10 rounded-lg border flex items-center justify-center font-bold text-lg transition-all hover:scale-[1.05] active:scale-[0.95] shadow-sm"
                    style={{
                      background: settings.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: themeStyles.border,
                      color: themeStyles.text,
                    }}
                    aria-label={t('reader.increaseFont')}
                  >
                    +
                  </button>
                </div>
                
                {/* 常用预设 */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[15, 18, 20, 22, 24, 28, 32, 36, 40].map((size) => (
                    <button
                      key={size}
                      onClick={() => updateSetting('fontSize', size)}
                      className="px-2.5 py-1 rounded-md border text-[10px] font-semibold transition-all hover:scale-[1.05] active:scale-[0.95]"
                      style={{
                        background: settings.fontSize === size
                          ? (settings.theme === 'dark'
                              ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)'
                              : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)')
                          : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                        borderColor: settings.fontSize === size ? 'transparent' : themeStyles.border,
                        color: settings.fontSize === size ? '#fff' : themeStyles.text,
                      }}
                      aria-label={t('reader.setFontSize', { size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* 字体 */}
              <div className="mb-4 md:mb-5">
                <label className="block text-sm font-semibold mb-2">{t('reader.font')}</label>
                <div className="grid grid-cols-4 gap-1.5 md:gap-2">
                  {[
                    { value: 'default', label: t('reader.defaultFont') },
                    { value: 'serif', label: t('reader.serifFont') },
                    { value: 'sans-serif', label: t('reader.sansSerifFont') },
                    { value: 'monospace', label: t('reader.monospaceFont') }
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
                  <label className="text-sm font-semibold">{t('reader.lineHeight')}</label>
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
                  <span>{t('reader.compact')}</span>
                  <span>{t('reader.loose')}</span>
                </div>
              </div>

              {/* 边距 */}
              <div className="mb-4 md:mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">{t('reader.margin')}</label>
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
                  <span>{t('reader.narrow')}</span>
                  <span>{t('reader.wide')}</span>
                </div>
              </div>

              {/* 首行缩进 */}
              <div className="mb-0">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">{t('reader.textIndent')}</label>
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
                  <span>{t('reader.none')}</span>
                  <span>{t('reader.max')}</span>
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
              {t('reader.appearanceSettings')}
            </div>

            {/* 主题 */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-3">{t('reader.readingTheme')}</label>
            <div className="grid grid-cols-4 gap-2 md:gap-3">
              {([
                { 
                  value: 'light', 
                  label: t('reader.lightTheme'), 
                  preview: '#ffffff', 
                  border: '#e5e7eb',
                  textColor: '#000000',
                  description: t('reader.lightThemeDesc')
                },
                { 
                  value: 'dark', 
                  label: t('reader.darkTheme'), 
                  preview: '#1a1a1a', 
                  border: '#374151',
                  textColor: '#ffffff',
                  description: t('reader.darkThemeDesc')
                },
                { 
                  value: 'sepia', 
                  label: t('reader.sepiaTheme'), 
                  preview: '#f4e4bc', 
                  border: '#d4c49c',
                  textColor: '#5c4b37',
                  description: t('reader.sepiaThemeDesc')
                },
                { 
                  value: 'green', 
                  label: t('reader.greenTheme'), 
                  preview: '#c8e6c9', 
                  border: '#a5d6a7',
                  textColor: '#2e7d32',
                  description: t('reader.greenThemeDesc')
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
              {t('reader.interactionSettings')}
            </div>

            {/* 翻页方式 */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">{t('reader.pageTurnMethod')}</label>
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
                  <div className="text-sm font-bold mb-0.5">{t('reader.swipePageTurn')}</div>
                  <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMethod === 'swipe' ? 0.9 : 0.6 }}>{t('reader.swipePageTurnDesc')}</div>
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
                  <div className="text-sm font-bold mb-0.5">{t('reader.clickPageTurn')}</div>
                  <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMethod === 'click' ? 0.9 : 0.6 }}>{t('reader.clickPageTurnDesc')}</div>
                </div>
              </button>
            </div>
          </div>

          {/* 滑动翻页模式（滑动翻页时有效） */}
          {settings.pageTurnMethod === 'swipe' && (
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">{t('reader.swipePageTurnMode')}</label>
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
                    <div className="text-sm font-bold mb-0.5">{t('reader.horizontalSwipe')}</div>
                    <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMode === 'horizontal' ? 0.9 : 0.6 }}>
                      {t('reader.horizontalSwipeDesc')}
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
                    <div className="text-sm font-bold mb-0.5">{t('reader.verticalSwipe')}</div>
                    <div className="text-[10px] md:text-xs" style={{ opacity: settings.pageTurnMode === 'vertical' ? 0.9 : 0.6 }}>
                      {t('reader.verticalSwipeDesc')}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 翻页模式（点击翻页时有效） */}
          {settings.pageTurnMethod === 'click' && (
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">{t('reader.pageTurnMode')}</label>
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
                    <div className="text-sm font-bold mb-0.5">{t('reader.horizontalPageTurn')}</div>
                    <div className="text-[10px]" style={{ opacity: settings.pageTurnMode === 'horizontal' ? 0.9 : 0.6 }}>{t('reader.horizontalPageTurnDesc')}</div>
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
                    <div className="text-sm font-bold mb-0.5">{t('reader.verticalPageTurn')}</div>
                    <div className="text-[10px]" style={{ opacity: settings.pageTurnMode === 'vertical' ? 0.9 : 0.6 }}>{t('reader.verticalPageTurnDesc')}</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 显示底部信息栏 */}
          <div className="mb-4">
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
              borderColor: themeStyles.border,
              background: settings.showBottomInfoBar 
                ? (settings.theme === 'dark' 
                    ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                    : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
            }}>
              <div>
                <label className="text-sm font-semibold block">{t('reader.bottomInfoBar')}</label>
                <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                  {t('reader.bottomInfoBarDesc')}
                </div>
              </div>
              <button
                onClick={() => updateSetting('showBottomInfoBar', !settings.showBottomInfoBar)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                  settings.showBottomInfoBar 
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                aria-label={t('reader.toggleBottomInfoBar')}
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
            <label className="block text-sm font-semibold mb-2">{t('reader.readingAreaWidth')}</label>
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
                  <div className="text-sm font-bold mb-0.5">{t('reader.centered')}</div>
                  <div className="text-[10px]" style={{ opacity: settings.readerWidth === 'centered' ? 0.9 : 0.6 }}>{t('reader.centeredDesc')}</div>
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
                  <div className="text-sm font-bold mb-0.5">{t('reader.fullWidth')}</div>
                  <div className="text-[10px]" style={{ opacity: settings.readerWidth === 'full' ? 0.9 : 0.6 }}>{t('reader.fullWidthDesc')}</div>
                </div>
              </button>
            </div>
          </div>

          {/* Office文档专用设置 */}
          {(bookType === 'docx' || bookType === 'xlsx' || bookType === 'pptx') && (
            <>
              <div className="mb-4 pb-3 border-b" style={{ borderColor: themeStyles.border }}>
                <div className="text-xs font-bold mb-3 flex items-center gap-2" style={{ 
                  opacity: 0.5,
                  letterSpacing: '0.05em'
                }}>
                  <div className="w-1 h-3 rounded-full bg-gradient-to-b from-blue-500 to-blue-600" />
                  Office文档设置
                </div>

                {/* 文档缩放（所有设备都显示） */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold">文档缩放</label>
                    <span className="text-sm font-bold px-2.5 py-0.5 rounded-md" style={{ 
                      color: '#fff',
                      background: settings.theme === 'dark' ? 'linear-gradient(135deg, #4a9eff 0%, #2563eb 100%)' : 'linear-gradient(135deg, #1890ff 0%, #0d5fbf 100%)',
                      boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)'
                    }}>
                      {(settings.officeZoom ?? 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    step="10"
                    value={settings.officeZoom ?? 100}
                    onChange={(e) => updateSetting('officeZoom', parseInt(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${
                        settings.theme === 'dark' ? '#4a9eff' : '#1890ff'
                      } 0%, ${
                        settings.theme === 'dark' ? '#4a9eff' : '#1890ff'
                      } ${((settings.officeZoom ?? 100) - 50) / 150 * 100}%, ${
                        themeStyles.border
                      } ${((settings.officeZoom ?? 100) - 50) / 150 * 100}%, ${
                        themeStyles.border
                      } 100%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: themeStyles.text, opacity: 0.6 }}>
                    <span>50%</span>
                    <span>100%</span>
                    <span>200%</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => updateSetting('officeZoom', Math.max(50, (settings.officeZoom ?? 100) - 10))}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border transition-all hover:scale-105"
                      style={{
                        borderColor: themeStyles.border,
                        backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        color: themeStyles.text,
                      }}
                    >
                      缩小
                    </button>
                    <button
                      onClick={() => updateSetting('officeZoom', 100)}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border transition-all hover:scale-105"
                      style={{
                        borderColor: themeStyles.border,
                        backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        color: themeStyles.text,
                      }}
                    >
                      重置
                    </button>
                    <button
                      onClick={() => updateSetting('officeZoom', Math.min(200, (settings.officeZoom ?? 100) + 10))}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border transition-all hover:scale-105"
                      style={{
                        borderColor: themeStyles.border,
                        backgroundColor: settings.theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        color: themeStyles.text,
                      }}
                    >
                      放大
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

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

                {/* 裁剪白边设置 */}
                <div className="mb-4">
                  <div className="text-sm font-semibold mb-2 px-1" style={{ color: themeStyles.text }}>
                    裁剪白边
                  </div>
                  
                  {/* 裁剪左右白边 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
                      borderColor: themeStyles.border,
                      background: (settings.pdfCropHorizontal ?? false)
                        ? (settings.theme === 'dark' 
                            ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                            : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                        : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
                    }}>
                      <div>
                        <label className="text-sm font-semibold block">裁剪左右白边</label>
                        <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                          智能去除PDF左右边缘空白
                        </div>
                      </div>
                      <button
                        onClick={() => updateSetting('pdfCropHorizontal', !(settings.pdfCropHorizontal ?? false))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                          (settings.pdfCropHorizontal ?? false)
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label="切换裁剪左右白边"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            (settings.pdfCropHorizontal ?? false) ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  
                  {/* 裁剪上下白边 */}
                  <div className="mb-0">
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
                      borderColor: themeStyles.border,
                      background: (settings.pdfCropVertical ?? false)
                        ? (settings.theme === 'dark' 
                            ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                            : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                        : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
                    }}>
                      <div>
                        <label className="text-sm font-semibold block">裁剪上下白边</label>
                        <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                          智能去除PDF上下边缘空白
                        </div>
                      </div>
                      <button
                        onClick={() => updateSetting('pdfCropVertical', !(settings.pdfCropVertical ?? false))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                          (settings.pdfCropVertical ?? false)
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label="切换裁剪上下白边"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            (settings.pdfCropVertical ?? false) ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 自动旋转页面 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border" style={{ 
                    borderColor: themeStyles.border,
                    background: (settings.pdfAutoRotate ?? false)
                      ? (settings.theme === 'dark' 
                          ? 'linear-gradient(135deg, rgba(74, 158, 255, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)'
                          : 'linear-gradient(135deg, rgba(24, 144, 255, 0.08) 0%, rgba(13, 95, 191, 0.05) 100%)')
                      : (settings.theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
                  }}>
                    <div>
                      <label className="text-sm font-semibold block">根据内容自动旋转</label>
                      <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                        自动检测文字方向，旋转横向内容以最佳方向显示
                      </div>
                    </div>
                    <button
                      onClick={() => updateSetting('pdfAutoRotate', !(settings.pdfAutoRotate ?? false))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all shadow-md ${
                        (settings.pdfAutoRotate ?? false)
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      aria-label="切换自动旋转"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          (settings.pdfAutoRotate ?? false) ? 'translate-x-6' : 'translate-x-1'
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

