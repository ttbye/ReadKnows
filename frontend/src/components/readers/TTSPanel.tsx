/**
 * @author ttbye
 * 语音朗读面板组件
 * 显示当前章节段落列表，支持播放、跳转、倍速、音色选择
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import api, { getFullApiUrl, getApiKeyHeader } from '../../utils/api';
import toast from 'react-hot-toast';
import { ReadingSettings } from '../../types/reader';
import { useTranslation } from 'react-i18next';

// 获取认证token的辅助函数
const getAuthToken = (): string => {
  try {
    const token = localStorage.getItem('auth-storage');
    if (token) {
      const parsed = JSON.parse(token);
      // Zustand persist stores state directly, but may also have a 'state' wrapper
      return parsed.state?.token || parsed.token || '';
    }
  } catch (e) {
    // 忽略解析错误
  }
  return '';
};

interface Paragraph {
  id: string;
  text: string;
  order: number;
  anchor: {
    type: 'epub_cfi' | 'scroll';
    value: string | number;
  };
}

interface VoiceProfile {
  id: string;
  label: string;
}

interface TTSPanelProps {
  bookId: string;
  bookType: string;
  chapter?: string;
  currentPosition?: any;
  settings: ReadingSettings;
  isVisible: boolean;
  onClose: () => void;
  onParagraphClick?: (anchor: { type: string; value: any }) => void;
  onCurrentParagraphChange?: (paragraphId: string | null) => void; // 通知父组件当前朗读的段落
  hideUI?: boolean; // 是否隐藏UI,只保留逻辑
  onStateChange?: (state: {
    isPlaying: boolean;
    currentIndex: number;
    totalParagraphs: number;
    speed: number;
    model: string;
    voice: string;
    models: Array<{ id: string; name: string; description: string; type: string; available: boolean }>;
    voices: Array<{ id: string; name: string; lang: string; gender?: string; style?: string }>;
    onPlayPause: () => void;
    onPrev: () => void;
    onNext: () => void;
    onSpeedChange: (speed: number) => void;
    onModelChange: (model: string) => void;
    onVoiceChange: (voice: string) => void;
  }) => void; // 暴露状态和方法给父组件
}

export default function TTSPanel({
  bookId,
  bookType,
  chapter,
  currentPosition,
  settings,
  isVisible,
  onClose,
  onParagraphClick,
  onCurrentParagraphChange,
  hideUI = false,
  onStateChange,
}: TTSPanelProps) {
  const { t } = useTranslation();
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<string>('natural');
  const [speed, setSpeed] = useState<number>(1.0);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [autoRole, setAutoRole] = useState<boolean>(true); // 自动角色识别
  const [models, setModels] = useState<Array<{ id: string; name: string; description: string; type: string; available: boolean }>>([]);
  const [currentModel, setCurrentModel] = useState<string>('edge');
  const [voices, setVoices] = useState<Array<{ id: string; name: string; lang: string; gender?: string; style?: string }>>([]);
  const [currentVoice, setCurrentVoice] = useState<string>('zh-CN-XiaoxiaoNeural');
  const [loadingVoices, setLoadingVoices] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null); // 保存当前的Object URL，用于清理
  const loadingParagraphsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const preloadCacheRef = useRef<Map<string, { blob: Blob; url: string }>>(new Map()); // 预加载缓存
  const preloadingRef = useRef<Set<string>>(new Set()); // 正在预加载的段落
  const isPlayingRef = useRef(false); // 播放状态锁，防止重复播放
  const currentPlayingIndexRef = useRef<number>(-1); // 当前正在播放的段落索引
  const currentPageTextRef = useRef<string | null>(null); // 缓存当前页面的文本内容

  // 仅支持 EPUB/TXT/MD
  const supportedTypes = ['epub', 'txt', 'md'];
  const isSupported = supportedTypes.includes(bookType?.toLowerCase());

  useEffect(() => {
    if (isVisible && isSupported && bookId) {
      fetchTTSDefaults();
      fetchModels();
      fetchProfiles();
      fetchParagraphs();
      hasInitializedRef.current = false; // 重置初始化标记
    }
  }, [isVisible, bookId, chapter, isSupported]);

  // 从系统设置获取TTS默认配置
  const fetchTTSDefaults = async () => {
    try {
      const resp = await api.get('/settings');
      const settings = resp.data.settings || {};
      
      // 设置默认模型（但不立即获取语音列表，让 useEffect 来处理）
      if (settings.tts_default_model?.value) {
        setCurrentModel(settings.tts_default_model.value);
        // 注意：语音列表的获取由 useEffect 在 currentModel 改变时自动触发
      }
      
      // 设置默认语速
      if (settings.tts_default_speed?.value) {
        const speedValue = parseFloat(settings.tts_default_speed.value);
        if (!isNaN(speedValue) && speedValue >= 0.5 && speedValue <= 3.0) {
          setSpeed(speedValue);
        }
      }
      
      // 设置自动角色识别
      if (settings.tts_auto_role?.value !== undefined) {
        setAutoRole(settings.tts_auto_role.value === 'true');
      }
    } catch (e: any) {
      console.warn('[TTSPanel] 获取TTS默认配置失败，使用默认值', e);
    }
  };

  // 使用 ref 跟踪是否已从系统设置加载过默认语音，避免重复设置
  const hasLoadedDefaultVoiceRef = useRef(false);
  
  // 当模型改变时，获取对应的语音列表（确保实时从API获取）
  useEffect(() => {
    if (isVisible && currentModel) {
      console.log(`[TTSPanel] 模型改变，从API获取音色列表: model=${currentModel}`);
      hasLoadedDefaultVoiceRef.current = false; // 重置标记，允许重新设置默认语音
      // 强制从API获取最新音色列表
      fetchVoices(currentModel);
    }
  }, [isVisible, currentModel]);
  
  // 当面板可见时，确保音色列表是最新的
  useEffect(() => {
    if (isVisible && currentModel && voices.length === 0 && !loadingVoices) {
      console.log(`[TTSPanel] 面板可见但音色列表为空，从API获取: model=${currentModel}`);
      fetchVoices(currentModel);
    }
  }, [isVisible, currentModel, voices.length, loadingVoices]);
  
  // 当语音列表更新后，设置默认语音（从系统设置，仅首次加载时）
  useEffect(() => {
    if (voices.length > 0 && currentModel && !hasLoadedDefaultVoiceRef.current) {
      // 从系统设置获取默认语音
      const getDefaultVoice = async () => {
        try {
          const resp = await api.get('/settings');
          const settings = resp.data.settings || {};
          const defaultVoiceId = settings.tts_default_voice?.value;
          
          if (defaultVoiceId) {
            const defaultVoice = voices.find((v: any) => v.id === defaultVoiceId);
            if (defaultVoice) {
              setCurrentVoice(defaultVoiceId);
              console.log(`[TTSPanel] 使用系统设置的默认语音: ${defaultVoiceId}`);
              hasLoadedDefaultVoiceRef.current = true;
              return;
            }
          }
          
          // 如果系统设置的语音不在列表中，选择第一个中文语音
          if (!voices.find(v => v.id === currentVoice)) {
            const chineseVoice = voices.find((v: any) => v.lang === 'zh') || voices[0];
            if (chineseVoice) {
              setCurrentVoice(chineseVoice.id);
              console.log(`[TTSPanel] 自动选择音色: ${chineseVoice.id}`);
              hasLoadedDefaultVoiceRef.current = true;
            }
          } else {
            hasLoadedDefaultVoiceRef.current = true;
          }
        } catch (e: any) {
          console.warn('[TTSPanel] 获取系统设置失败', e);
          // 如果获取系统设置失败，选择第一个中文语音
          if (!voices.find(v => v.id === currentVoice)) {
            const chineseVoice = voices.find((v: any) => v.lang === 'zh') || voices[0];
            if (chineseVoice) {
              setCurrentVoice(chineseVoice.id);
              hasLoadedDefaultVoiceRef.current = true;
            }
          } else {
            hasLoadedDefaultVoiceRef.current = true;
          }
        }
      };
      
      getDefaultVoice();
    }
  }, [voices, currentModel, currentVoice]);


  // 暴露段落文本获取函数给阅读器组件
  useEffect(() => {
    (window as any).__getParagraphText = (paragraphId: string) => {
      const paraIndex = parseInt(paragraphId.replace(/^p/, ''), 10);
      if (!isNaN(paraIndex) && paraIndex >= 0 && paraIndex < paragraphs.length) {
        return paragraphs[paraIndex].text;
      }
      return null;
    };

    // 暴露段落CFI锚点获取函数给阅读器组件（用于精确定位）
    (window as any).__getParagraphCFI = (paragraphId: string) => {
      const paraIndex = parseInt(paragraphId.replace(/^p/, ''), 10);
      if (!isNaN(paraIndex) && paraIndex >= 0 && paraIndex < paragraphs.length) {
        const para = paragraphs[paraIndex];
        // 如果段落有CFI锚点，返回CFI
        if (para.anchor && para.anchor.type === 'epub_cfi' && para.anchor.value) {
          return para.anchor.value as string;
        }
      }
      return null;
    };

    return () => {
      delete (window as any).__getParagraphText;
      delete (window as any).__getParagraphCFI;
    };
  }, [paragraphs]);
      
  // 当段落加载完成且当前页信息可用时，自动定位到当前页对应的段落（但不自动播放）
  // 当用户打开朗读面板或位置变化时，重新定位到当前页面
  useEffect(() => {
    // 只有在面板可见、段落已加载、模型和语音已设置时才定位
    if (!isVisible || paragraphs.length === 0 || !currentModel || !currentVoice) {
      return;
    }

    // 不再自动开始播放，等待用户点击播放按钮
    // 注意：即使正在播放，也应该更新显示的段落索引，以反映当前阅读位置
    // 播放的段落索引和显示的段落索引是分开管理的
    
    // 定义一个异步函数来处理定位逻辑
    const locateAndSetIndex = async () => {
      // 根据当前页面定位到对应的段落
      // 对于 TXT/MD：从当前页面的第一行内容开始
      // 对于 EPUB：根据 progress 定位
      let targetIndex = -1;
      
      if (currentPosition) {
        // 重新设计：优先使用进度计算段落索引（更准确），段落索引作为备用
        // 因为段落索引匹配可能失败，但进度是准确的
        if (currentPosition.progress !== undefined && currentPosition.progress > 0 && paragraphs.length > 0) {
          // 优先使用进度计算段落索引
          const progressBasedIndex = Math.floor(currentPosition.progress * paragraphs.length);
          targetIndex = Math.max(0, Math.min(progressBasedIndex, paragraphs.length - 1));
          console.log(`[TTSPanel] 使用进度计算段落索引: progress=${(currentPosition.progress * 100).toFixed(2)}%, 计算索引=${targetIndex + 1}/${paragraphs.length}`);
        } else if (currentPosition.paragraphIndex !== undefined && currentPosition.paragraphIndex >= 0) {
          // 备用：使用保存的段落索引
          targetIndex = currentPosition.paragraphIndex;
          targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
          console.log(`[TTSPanel] 使用保存的段落索引定位: paragraphIndex=${currentPosition.paragraphIndex}, 总段落数=${paragraphs.length}, 目标索引=${targetIndex}`);
        } else if (bookType?.toLowerCase() === 'epub') {
          // EPUB: 优先尝试获取当前页面的段落索引
          const getCurrentPageParagraphIndex = (window as any).__getCurrentPageParagraphIndex;
          if (getCurrentPageParagraphIndex) {
            try {
              const pageParagraphIndex = await getCurrentPageParagraphIndex();
              if (pageParagraphIndex !== null && pageParagraphIndex !== undefined && pageParagraphIndex >= 0) {
                targetIndex = pageParagraphIndex;
                targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
                console.log(`[TTSPanel] EPUB 使用当前页面段落索引: ${pageParagraphIndex} -> ${targetIndex}, 总段落数=${paragraphs.length}`);
              }
            } catch (e) {
              console.warn('[TTSPanel] 获取当前页面段落索引失败，使用进度定位', e);
            }
          }
          
          // 如果获取失败，根据进度定位（progress 是 0-1 之间的值）
          if (targetIndex < 0) {
        const progress = currentPosition.progress || 0;
        if (progress > 0) {
              targetIndex = Math.floor(progress * paragraphs.length);
          targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
              console.log(`[TTSPanel] EPUB 使用进度定位: progress=${progress}, 段落索引=${targetIndex}, 总段落数=${paragraphs.length}`);
            }
        }
      } else {
          // TXT/MD: 从当前页面的第一行内容开始
          // 尝试获取当前页面信息
          const getCurrentPageInfo = (window as any).__getCurrentPageInfo;
          if (getCurrentPageInfo) {
            const pageInfo = getCurrentPageInfo();
            if (pageInfo) {
              // 根据当前页面的行号范围来匹配段落
              // 段落文本应该包含当前页面第一行的内容
              const currentPageFirstLine = pageInfo.content.split('\n')[0]?.trim();
              if (currentPageFirstLine && currentPageFirstLine.length > 0) {
                // 查找包含当前页面第一行内容的段落
                for (let i = 0; i < paragraphs.length; i++) {
                  const paraText = paragraphs[i].text;
                  // 检查段落是否包含当前页面第一行的内容
                  if (paraText.includes(currentPageFirstLine) || 
                      currentPageFirstLine.includes(paraText.substring(0, Math.min(20, paraText.length)))) {
                    targetIndex = i;
                    console.log(`[TTSPanel] TXT/MD 定位: 当前页面第一行="${currentPageFirstLine.substring(0, 20)}...", 匹配到段落索引=${targetIndex}`);
                    break;
                  }
                }
              }
              
              // 如果没找到匹配的段落，根据进度定位
              if (targetIndex < 0) {
        const progress = currentPosition.progress || 0;
        if (progress > 0) {
                  targetIndex = Math.floor(progress * paragraphs.length);
          targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
                  console.log(`[TTSPanel] TXT/MD 定位: 使用进度定位, progress=${progress}, 段落索引=${targetIndex}`);
                }
              }
            }
          } else {
            // 如果没有页面信息接口，使用进度定位
            const progress = currentPosition.progress || 0;
            if (progress > 0) {
              targetIndex = Math.floor(progress * paragraphs.length);
              targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
              console.log(`[TTSPanel] TXT/MD 定位: 使用进度定位, progress=${progress}, 段落索引=${targetIndex}`);
            }
          }
        }
      }
      
      // 如果没有定位到段落，从第一段开始
      if (targetIndex < 0) {
        targetIndex = 0;
        console.log(`[TTSPanel] 未找到匹配段落，从第一段开始`);
      }
      
      if (targetIndex >= 0 && targetIndex < paragraphs.length) {
        // 更新索引显示，反映当前阅读位置
        // 即使正在播放，也应该更新显示的段落索引，以反映当前页面位置
        if (targetIndex !== currentIndex) {
        setCurrentIndex(targetIndex);
          const progressPercent = paragraphs.length > 0 ? ((targetIndex + 1) / paragraphs.length * 100).toFixed(2) : '0.00';
          if (isPlayingRef.current || currentPlayingIndexRef.current >= 0) {
            console.log(`[TTSPanel] 翻页后更新段落索引显示: ${targetIndex + 1}/${paragraphs.length} (${progressPercent}%)（当前播放段落: ${currentPlayingIndexRef.current >= 0 ? currentPlayingIndexRef.current + 1 : '无'}）`);
          } else {
            console.log(`[TTSPanel] 自动定位到段落索引: ${targetIndex + 1}/${paragraphs.length} (${progressPercent}%)`);
          }
        } else {
          // 即使索引相同，也记录一下，方便调试
          const progressPercent = paragraphs.length > 0 ? ((targetIndex + 1) / paragraphs.length * 100).toFixed(2) : '0.00';
          console.log(`[TTSPanel] 段落索引未变化: ${targetIndex + 1}/${paragraphs.length} (${progressPercent}%)`);
        }
      } else {
        console.warn(`[TTSPanel] 目标索引无效: ${targetIndex}, 段落总数=${paragraphs.length}, currentPosition.paragraphIndex=${currentPosition?.paragraphIndex}, currentPosition.progress=${currentPosition?.progress}`);
        }
    };
    
    // 调用异步函数（只定位，不播放）
    locateAndSetIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, paragraphs.length, currentPosition, bookType, currentModel, currentVoice]);

  // 重新设计：优先使用进度计算段落索引（进度基于CFI/locations，最准确）
  // 段落索引仅用于TTS定位，不用于进度计算
  // 即使正在播放，也应该更新显示的段落索引，以反映当前阅读位置
  useEffect(() => {
    console.log(`[TTSPanel] useEffect触发: currentPosition.progress=${currentPosition?.progress}, currentPosition.paragraphIndex=${currentPosition?.paragraphIndex}, currentIndex=${currentIndex}, paragraphs.length=${paragraphs.length}`);
    
    if (paragraphs.length > 0 && currentPosition) {
      let targetIndex = -1;
      
      // 优先使用进度计算段落索引（进度基于CFI/locations，最准确）
      if (currentPosition.progress !== undefined && currentPosition.progress > 0) {
        targetIndex = Math.floor(currentPosition.progress * paragraphs.length);
        targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
        console.log(`[TTSPanel] 使用进度计算段落索引: progress=${(currentPosition.progress * 100).toFixed(2)}%, 计算索引=${targetIndex + 1}/${paragraphs.length}`);
      } 
      // 备用：使用保存的段落索引（如果进度不可用）
      else if (currentPosition.paragraphIndex !== undefined && currentPosition.paragraphIndex >= 0) {
        targetIndex = Math.max(0, Math.min(currentPosition.paragraphIndex, paragraphs.length - 1));
        console.log(`[TTSPanel] 使用保存的段落索引（备用）: ${targetIndex + 1}/${paragraphs.length}`);
      }
      
      if (targetIndex >= 0 && targetIndex !== currentIndex) {
        const progressPercent = paragraphs.length > 0 ? ((targetIndex + 1) / paragraphs.length * 100).toFixed(2) : '0.00';
        console.log(`[TTSPanel] 准备更新段落索引: ${currentIndex} -> ${targetIndex} (${progressPercent}%)`);
        setCurrentIndex(targetIndex);
        if (isPlayingRef.current || currentPlayingIndexRef.current >= 0) {
          console.log(`[TTSPanel] 翻页后段落索引同步更新: ${targetIndex + 1}/${paragraphs.length} (${progressPercent}%)（当前播放段落: ${currentPlayingIndexRef.current >= 0 ? currentPlayingIndexRef.current + 1 : '无'}）`);
        } else {
          console.log(`[TTSPanel] 段落索引同步更新: ${targetIndex + 1}/${paragraphs.length} (${progressPercent}%)`);
        }
      } else if (targetIndex >= 0) {
        const progressPercent = paragraphs.length > 0 ? ((targetIndex + 1) / paragraphs.length * 100).toFixed(2) : '0.00';
        console.log(`[TTSPanel] 段落索引未变化（已是最新）: ${targetIndex + 1}/${paragraphs.length} (${progressPercent}%)`);
      } else {
        console.log(`[TTSPanel] 无法计算段落索引: progress=${currentPosition.progress}, paragraphIndex=${currentPosition.paragraphIndex}`);
      }
    }
    // 使用 currentPosition 对象本身作为依赖项，确保对象引用变化时触发
    // 这样当翻页后 currentPosition 更新时，useEffect 会重新计算段落索引
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition, paragraphs.length]);

  // 清理音频和预加载缓存
  useEffect(() => {
    return () => {
      stopCurrentPlayback();
      // 清理预加载缓存
      preloadCacheRef.current.forEach(({ url }) => {
        URL.revokeObjectURL(url);
      });
      preloadCacheRef.current.clear();
      preloadingRef.current.clear();
      loadingParagraphsRef.current.clear();
    };
  }, []);

  const fetchModels = async () => {
    try {
      const resp = await api.get('/tts/models');
      const modelsList = resp.data.models || [];
      setModels(modelsList);
      // 默认选择第一个可用的在线模型
      const availableModel = modelsList.find((m: any) => m.available && m.type === 'online') || modelsList.find((m: any) => m.available);
      if (availableModel) {
        setCurrentModel(availableModel.id);
      }
    } catch (e: any) {
      console.error('[TTSPanel] 获取 models 失败', e);
      setModels([
        { id: 'edge', name: 'Edge-TTS', description: '微软Edge TTS（在线，高质量）', type: 'online', available: true },
        { id: 'qwen3', name: 'Qwen3-TTS', description: '通义千问TTS（在线，高质量）', type: 'online', available: true },
        { id: 'indextts2', name: 'IndexTTS2', description: 'IndexTTS2（离线，高质量，支持情感）', type: 'offline', available: false },
      ]);
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
        console.warn('[TTSPanel] 获取系统语言设置失败，使用默认值（中文）', e);
      }
      
      console.log(`[TTSPanel] 获取音色列表: model=${modelId}, lang=${systemLang}`);
      const resp = await api.get('/tts/voices', { 
        params: { 
          model: modelId,
          lang: systemLang  // 传递语言参数，后端会根据此参数筛选音色
        } 
      });
      const voicesList = resp.data.voices || [];
      console.log(`[TTSPanel] 成功获取 ${voicesList.length} 个音色（已根据系统语言 ${systemLang} 筛选）`);
      setVoices(voicesList);
      if (voicesList.length > 0) {
        // 根据系统语言选择默认语音
        const defaultVoice = systemLang === 'zh' 
          ? voicesList.find((v: any) => v.lang === 'zh') || voicesList[0]
          : voicesList.find((v: any) => v.lang === 'en') || voicesList[0];
        if (defaultVoice) {
          setCurrentVoice(defaultVoice.id);
        }
      }
    } catch (e: any) {
      console.error('[TTSPanel] 获取 voices 失败', e);
      setVoices([]);
      toast.error('获取音色列表失败，请稍后重试');
    } finally {
      setLoadingVoices(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const resp = await api.get('/tts/profiles');
      const profilesList = resp.data.profiles || [];
      setProfiles(profilesList);
      if (profilesList.length > 0 && !currentProfile) {
        setCurrentProfile(profilesList[0].id);
      }
      console.log(`[TTSPanel] 可用语音配置: ${profilesList.length} 个`);
    } catch (e: any) {
      console.error('[TTSPanel] 获取 profiles 失败', e);
      // 使用默认配置
      setProfiles([
        { id: 'natural', label: '自然' },
        { id: 'clear', label: '清晰' }
      ]);
    }
  };

  const fetchParagraphs = async () => {
    if (!bookId) return;
    try {
      setLoading(true);
      const resp = await api.get('/tts/paragraphs', {
        params: { bookId, chapter: chapter || '0' },
      });
      setParagraphs(resp.data.paragraphs || []);
    } catch (e: any) {
      console.error('[TTSPanel] 获取段落失败', e);
      toast.error('获取段落列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 预加载下一段音频
  const preloadNextParagraph = async (currentIndex: number) => {
    if (currentIndex < 0 || currentIndex >= paragraphs.length - 1) return;
    
    const nextIndex = currentIndex + 1;
    const nextPara = paragraphs[nextIndex];
    const nextParaId = nextPara.id;
    const cacheKey = `${nextParaId}_${currentProfile}_${speed}_${autoRole ? 'auto' : 'manual'}`;
    
    // 如果已经预加载或正在预加载，跳过
    if (preloadCacheRef.current.has(cacheKey) || preloadingRef.current.has(cacheKey)) {
      return;
    }
    
    preloadingRef.current.add(cacheKey);
    
    try {
      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...getApiKeyHeader(), // 添加 API Key
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // 如果文本太长（超过300字符），使用POST请求到/synthesize，避免URL过长
      // 注意：URL 总长度限制通常是 2048 字符，考虑到其他参数，文本长度应该更保守
      const textLength = nextPara.text.length;
      let response: Response;
      
      if (textLength > 300) {
        // 使用POST请求生成音频
        const synthesizeUrl = getFullApiUrl('/tts/synthesize');
        response = await fetch(synthesizeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bookId,
            chapterId: chapter || '0',
            paragraphId: nextParaId,
            text: nextPara.text,
            speed,
            model: currentModel,
            voice: currentVoice,
            autoRole,
          }),
        });
        
        if (response.ok) {
          // 生成成功后，再获取音频
          const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(bookId)}&chapterId=${encodeURIComponent(chapter || '0')}&paragraphId=${encodeURIComponent(nextParaId)}&speed=${speed}&model=${encodeURIComponent(currentModel)}&voice=${encodeURIComponent(currentVoice)}&autoRole=${autoRole ? 'true' : 'false'}`);
          response = await fetch(audioUrl, { headers });
        }
      } else {
        // 文本较短，可以直接使用GET请求
        const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(bookId)}&chapterId=${encodeURIComponent(chapter || '0')}&paragraphId=${encodeURIComponent(nextParaId)}&speed=${speed}&model=${encodeURIComponent(currentModel)}&voice=${encodeURIComponent(currentVoice)}&autoRole=${autoRole ? 'true' : 'false'}&text=${encodeURIComponent(nextPara.text)}`);
        response = await fetch(audioUrl, { headers });
      }
      
      if (response.ok) {
        const audioBlob = await response.blob();
        const preloadUrl = URL.createObjectURL(audioBlob);
        preloadCacheRef.current.set(cacheKey, { blob: audioBlob, url: preloadUrl });
        console.log(`[TTSPanel] 预加载完成: 段落 ${nextIndex}`);
      } else {
        console.warn(`[TTSPanel] 预加载失败: 段落 ${nextIndex}, status=${response.status}`);
      }
    } catch (e) {
      console.warn(`[TTSPanel] 预加载失败: 段落 ${nextIndex}`, e);
    } finally {
      preloadingRef.current.delete(cacheKey);
    }
  };

  // 批量预加载后续多段音频（用于连贯听书）
  // 保持至少20个段落的缓存，播放时自动补充
  const preloadMultipleParagraphs = async (startIndex: number, count: number = 20) => {
    if (startIndex < 0 || startIndex >= paragraphs.length) return;

    console.log(`[TTSPanel] 开始预加载后续 ${count} 段音频，从段落 ${startIndex + 1} 开始`);
    
    // 预加载接下来的 count 段音频（并行预加载，提高效率）
    const preloadPromises: Promise<void>[] = [];
    for (let i = 1; i <= count; i++) {
      const targetIndex = startIndex + i;
      if (targetIndex >= paragraphs.length) break;
      
      // 使用延迟加载，避免同时发起太多请求
      setTimeout(() => {
        preloadNextParagraph(startIndex + i - 1);
      }, i * 200); // 每200ms预加载一段
    }
  };

  // 停止当前播放并清理资源
  const stopCurrentPlayback = () => {
    // 停止当前播放的音频
    if (audioRef.current) {
      try {
      audioRef.current.pause();
        audioRef.current.removeEventListener('ended', () => {});
        audioRef.current.removeEventListener('error', () => {});
        audioRef.current.removeEventListener('canplay', () => {});
        audioRef.current.removeEventListener('canplaythrough', () => {});
        audioRef.current.removeEventListener('loadeddata', () => {});
        audioRef.current.removeEventListener('loadstart', () => {});
      audioRef.current = null;
      } catch (e) {
        console.warn('[TTSPanel] 清理音频元素失败', e);
      }
    }
    if (audioObjectUrlRef.current) {
      try {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
      } catch (e) {
        console.warn('[TTSPanel] 清理Object URL失败', e);
      }
    }
    
    // 清除所有正在加载的段落，这样逐段播放循环会停止
    loadingParagraphsRef.current.clear();
    
    isPlayingRef.current = false;
    setIsPlaying(false);
    currentPlayingIndexRef.current = -1;
    
    // 通知父组件朗读结束
    if (onCurrentParagraphChange) {
      onCurrentParagraphChange(null);
    }
  };

  // 将文本分割成多个段落（用于逐段生成音频）
  const splitTextIntoSegments = (text: string, maxLength: number = 500): string[] => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    
    // 如果文本较短，直接返回
    if (trimmed.length <= maxLength) {
      return [trimmed];
    }
    
    const segments: string[] = [];
    
    // 首先按双换行符分割（段落分隔）
    const paragraphs = trimmed.split(/\n\s*\n/);
    
    for (const para of paragraphs) {
      const paraTrimmed = para.trim();
      if (paraTrimmed.length === 0) continue;
      
      // 如果段落较短，直接添加
      if (paraTrimmed.length <= maxLength) {
        segments.push(paraTrimmed);
        continue;
      }
      
      // 如果段落较长，按句子分割
      // 使用正则匹配句子结束符（。！？\n）
      const sentences = paraTrimmed.split(/([。！？\n])/);
      let currentSegment = '';
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        if (!sentence.trim()) continue;
        
        // 如果当前段落加上新句子不超过最大长度，继续累积
        if (currentSegment.length + sentence.length <= maxLength) {
          currentSegment += sentence;
        } else {
          // 如果当前段落不为空，先保存
          if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
          }
          // 如果单个句子就超过最大长度，按固定长度分割
          if (sentence.length > maxLength) {
            // 按固定长度分割长句子
            for (let j = 0; j < sentence.length; j += maxLength) {
              segments.push(sentence.substring(j, j + maxLength).trim());
            }
            currentSegment = '';
          } else {
            currentSegment = sentence;
          }
        }
      }
      
      // 添加剩余的段落
      if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
      }
    }
    
    return segments.filter(s => s.length > 0);
  };

  // 逐段生成并播放音频
  const generateAndPlaySegment = async (
    segmentText: string,
    segmentIndex: number,
    totalSegments: number,
    baseParaId: string
  ): Promise<void> => {
    const segmentParaId = `${baseParaId}_seg${segmentIndex}`;
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...getApiKeyHeader(), // 添加 API Key
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`[TTSPanel] 生成第 ${segmentIndex + 1}/${totalSegments} 段音频: ${segmentText.substring(0, 50)}...`);
    
    // 生成音频（带重试机制）
    let response: Response | null = null;
    const maxRetries = 3;
    const retryDelay = 1000;
    
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        if (retry > 0) {
          console.log(`[TTSPanel] 重试生成第 ${segmentIndex + 1} 段音频 (${retry}/${maxRetries - 1})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * retry));
        }
        
        // 确保所有必需参数都存在
        if (!bookId || !segmentParaId || !segmentText || !currentModel || !currentVoice) {
          throw new Error(`缺少必需参数: bookId=${bookId}, paragraphId=${segmentParaId}, text=${segmentText ? '有' : '无'}, model=${currentModel}, voice=${currentVoice}`);
        }
        
        const synthesizeUrl = getFullApiUrl('/tts/synthesize');
        response = await fetch(synthesizeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bookId: String(bookId),
            chapterId: String(chapter || '0'),
            paragraphId: String(segmentParaId),
            text: String(segmentText),
            speed: Number(speed) || 1.0,
            model: String(currentModel),
            voice: String(currentVoice),
            autoRole: Boolean(autoRole),
          }),
        });
        
        if (response.ok) {
          break;
        }
        
        const errorText = await response.text();
        const isTimeoutError = response.status === 500 && (
          errorText.includes('Connection timeout') || 
          errorText.includes('TimeoutError') ||
          errorText.includes('ConnectionTimeoutError')
        );
        
        if (isTimeoutError && retry < maxRetries - 1) {
          continue;
        }
        
        if (response.status === 401) {
          toast.error('认证失败，请重新登录');
          throw new Error('Unauthorized');
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error: any) {
        if (error.name === 'TypeError' && error.message.includes('fetch') && retry < maxRetries - 1) {
          continue;
        }
        if (retry === maxRetries - 1) {
          throw error;
        }
      }
    }
    
    if (!response || !response.ok) {
      throw new Error(`生成第 ${segmentIndex + 1} 段音频失败`);
    }
    
    // 获取音频 - 使用统一的 API URL 配置
    const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(bookId)}&chapterId=${encodeURIComponent(chapter || '0')}&paragraphId=${encodeURIComponent(segmentParaId)}&speed=${speed}&model=${encodeURIComponent(currentModel)}&voice=${encodeURIComponent(currentVoice)}&autoRole=${autoRole ? 'true' : 'false'}`);
    const audioResponse = await fetch(audioUrl, { headers });
    
    if (!audioResponse.ok) {
      throw new Error(`获取第 ${segmentIndex + 1} 段音频失败: HTTP ${audioResponse.status}`);
    }
    
    const audioBlob = await audioResponse.blob();
    const audioObjectUrl = URL.createObjectURL(audioBlob);
    
    // 创建音频元素并播放
    const audio = new Audio(audioObjectUrl);
    audio.playbackRate = speed;
    
    // 保存当前音频引用，以便能够停止
    audioRef.current = audio;
    audioObjectUrlRef.current = audioObjectUrl;
    
    return new Promise((resolve, reject) => {
      // 检查是否已被停止
      const checkStopped = () => {
        if (!loadingParagraphsRef.current.has(baseParaId)) {
          audio.pause();
          audio.currentTime = 0;
          URL.revokeObjectURL(audioObjectUrl);
          resolve(); // 停止时正常结束，不抛出错误
          return true;
        }
        return false;
      };
      
      audio.addEventListener('loadeddata', () => {
        if (checkStopped()) return;
        audio.play().then(() => {
          console.log(`[TTSPanel] 第 ${segmentIndex + 1}/${totalSegments} 段开始播放`);
          isPlayingRef.current = true;
          setIsPlaying(true);
        }).catch(reject);
      });
      
      audio.addEventListener('ended', () => {
        console.log(`[TTSPanel] 第 ${segmentIndex + 1}/${totalSegments} 段播放完成`);
        URL.revokeObjectURL(audioObjectUrl);
        audioRef.current = null;
        audioObjectUrlRef.current = null;
        resolve();
      });
      
      audio.addEventListener('error', (e) => {
        console.error(`[TTSPanel] 第 ${segmentIndex + 1} 段播放失败`, e);
        URL.revokeObjectURL(audioObjectUrl);
        audioRef.current = null;
        audioObjectUrlRef.current = null;
        reject(new Error(`播放第 ${segmentIndex + 1} 段失败`));
      });
      
      // 定期检查是否被停止
      const checkInterval = setInterval(() => {
        if (checkStopped()) {
          clearInterval(checkInterval);
        }
      }, 100);
      
      audio.addEventListener('ended', () => {
        clearInterval(checkInterval);
      });
      
      audio.addEventListener('error', () => {
        clearInterval(checkInterval);
      });
      
      audio.load();
    });
  };

  // 直接从文本内容生成并播放音频（不依赖段落索引）
  const loadAndPlayText = async (text: string, paragraphId?: string) => {
    if (!text || text.trim().length === 0) {
      console.warn('[TTSPanel] 文本内容为空，无法生成音频');
      return;
    }

    // 如果正在播放，先停止当前播放
    if (isPlayingRef.current) {
      console.log(`[TTSPanel] 停止当前播放，开始播放新文本`);
      stopCurrentPlayback();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const paraId = paragraphId || `text-${Date.now()}`;
    
    // 防止重复加载
    if (loadingParagraphsRef.current.has(paraId)) {
      // console.log(`[TTSPanel] 文本正在加载中，跳过重复加载`);
      return;
    }
    loadingParagraphsRef.current.add(paraId);
    currentPlayingIndexRef.current = -1; // 使用文本播放时，不设置段落索引

    try {
      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // 确保文本不为空
      const trimmedText = text.trim();
      if (trimmedText.length === 0) {
        throw new Error('文本内容为空');
      }


      if (bookType?.toLowerCase() === 'epub' && (window as any).__setCurrentReadingParagraph) {
        const searchText = trimmedText.substring(0, Math.min(50, trimmedText.length));
        // 通知阅读器高亮包含该文本的元素
        setTimeout(() => {
          // 创建一个临时的高亮标识，通过文本内容匹配
          if ((window as any).__highlightTextInPage) {
            (window as any).__highlightTextInPage(searchText);
          }
        }, 100);
      }
      
      console.log(`[TTSPanel] 开始生成TTS音频: 文本长度=${trimmedText.length}, 模型=${currentModel}, 语音=${currentVoice}`);
      console.log(`[TTSPanel] 文本内容预览: ${trimmedText.substring(0, 200)}...`);
      
      // 将文本分割成多个段落（每段最多500字符）
      const segments = splitTextIntoSegments(trimmedText, 500);
      console.log(`[TTSPanel] 文本已分割为 ${segments.length} 段`);
      
      // 通知父组件开始朗读
      if (onCurrentParagraphChange) {
        onCurrentParagraphChange(paraId);
      }
      
      // 逐段生成并播放
      try {
        for (let i = 0; i < segments.length; i++) {
          // 检查是否被停止
          if (!loadingParagraphsRef.current.has(paraId)) {
            console.log(`[TTSPanel] 播放已停止，中断后续段落`);
            break;
          }
          
          // 高亮当前段落的文本
          if (bookType?.toLowerCase() === 'epub' && (window as any).__highlightTextInPage) {
            const segmentText = segments[i].substring(0, Math.min(50, segments[i].length));
            (window as any).__highlightTextInPage(segmentText);
          }
          
          // 生成并播放当前段
          await generateAndPlaySegment(segments[i], i, segments.length, paraId);
        }
        
        // 所有段落播放完成
        console.log(`[TTSPanel] 所有段落播放完成`);
        isPlayingRef.current = false;
        setIsPlaying(false);
        currentPlayingIndexRef.current = -1;
        
        // 通知父组件朗读结束
        if (onCurrentParagraphChange) {
          onCurrentParagraphChange(null);
        }
        loadingParagraphsRef.current.delete(paraId);
        
        // 如果启用自动下一段，继续播放后续内容
        if (autoNext) {
          setTimeout(async () => {
            const getCurrentPageText = (window as any).__getCurrentPageText;
            if (getCurrentPageText) {
              try {
                const nextPageText = getCurrentPageText();
                if (nextPageText && nextPageText.trim().length > 0) {
                  // 检查文本是否与当前播放的文本不同
                  if (nextPageText !== text) {
                    console.log(`[TTSPanel] 自动播放下一页内容`);
                    loadAndPlayText(nextPageText, `text-${Date.now()}`);
                  }
                }
              } catch (e) {
                console.warn('[TTSPanel] 获取下一页文本失败', e);
              }
            }
          }, 300);
        }
      } catch (error: any) {
        // 播放过程中出错
        console.error(`[TTSPanel] 逐段播放过程中出错`, error);
        isPlayingRef.current = false;
        setIsPlaying(false);
        loadingParagraphsRef.current.delete(paraId);
        
        // 显示错误提示
        let errorMessage = 'TTS播放失败';
        if (error?.message) {
          if (error.message.includes('连接超时') || error.message.includes('Connection timeout') || error.message.includes('TimeoutError')) {
            errorMessage = 'TTS服务连接超时，请检查网络连接或稍后重试';
          } else if (error.message.includes('Unauthorized')) {
            errorMessage = '认证失败，请重新登录';
          } else if (error.message.includes('HTTP 500')) {
            errorMessage = 'TTS服务暂时不可用，请稍后重试';
          } else {
            errorMessage = error.message;
          }
        }
        toast.error(errorMessage);
        
        // 通知父组件朗读结束
        if (onCurrentParagraphChange) {
          onCurrentParagraphChange(null);
        }
      }
    } catch (e: any) {
      console.error('[TTSPanel] 加载文本音频失败', e);
      
      // 显示友好的错误提示
      let errorMessage = 'TTS生成失败';
      if (e?.message) {
        if (e.message.includes('连接超时') || e.message.includes('Connection timeout') || e.message.includes('TimeoutError')) {
          errorMessage = 'TTS服务连接超时，请检查网络连接或稍后重试';
        } else if (e.message.includes('Unauthorized')) {
          errorMessage = '认证失败，请重新登录';
        } else if (e.message.includes('HTTP 500')) {
          errorMessage = 'TTS服务暂时不可用，请稍后重试';
        } else {
          errorMessage = e.message;
        }
      }
      toast.error(errorMessage);
      
      isPlayingRef.current = false;
      setIsPlaying(false);
      if (currentPlayingIndexRef.current === -1) {
        currentPlayingIndexRef.current = -1;
      }
      loadingParagraphsRef.current.delete(paraId);
      // 清理Object URL
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }
    }
  };

  const loadAndPlayParagraph = async (index: number) => {
    if (index < 0 || index >= paragraphs.length) return;

    // 如果正在播放相同的段落，直接返回
    if (isPlayingRef.current && currentPlayingIndexRef.current === index) {
      console.log(`[TTSPanel] 段落 ${index} 正在播放，跳过重复加载`);
      return;
    }

    // 如果正在播放其他段落，先停止当前播放
    if (isPlayingRef.current) {
      console.log(`[TTSPanel] 停止当前播放，开始播放段落 ${index}`);
      stopCurrentPlayback();
      // 等待一小段时间确保资源清理完成
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const para = paragraphs[index];
    const paraId = para.id;
    const cacheKey = `${paraId}_${currentProfile}_${speed}_${autoRole ? 'auto' : 'manual'}`;
    
    // 防止重复加载
    if (loadingParagraphsRef.current.has(paraId)) {
      console.log(`[TTSPanel] 段落 ${index} 正在加载中，跳过重复加载`);
      return;
    }
    loadingParagraphsRef.current.add(paraId);
    currentPlayingIndexRef.current = index;

    try {
      let audioBlob: Blob;
      let audioObjectUrl: string;
      
      // 检查预加载缓存
      if (preloadCacheRef.current.has(cacheKey)) {
        const cached = preloadCacheRef.current.get(cacheKey)!;
        audioBlob = cached.blob;
        audioObjectUrl = cached.url;
        preloadCacheRef.current.delete(cacheKey); // 使用后从缓存移除
        console.log(`[TTSPanel] 使用预加载缓存: 段落 ${index}`);
      } else {
        // 构建音频请求（包含模型、语音、自动角色识别参数）
        // 注意：如果指定了voice，后端会忽略profile参数，所以优先使用voice
        // 如果文本太长（超过300字符），使用POST请求到/synthesize，避免URL过长
        // 注意：URL 总长度限制通常是 2048 字符，考虑到其他参数，文本长度应该更保守
        const token = getAuthToken();
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          ...getApiKeyHeader(), // 添加 API Key
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const textLength = para.text.length;
        let response: Response;
        
        if (textLength > 300) {
          // 使用POST请求生成音频
          // 确保所有必需参数都存在
          if (!bookId || !paraId || !para.text || !currentModel || !currentVoice) {
            throw new Error(`缺少必需参数: bookId=${bookId}, paragraphId=${paraId}, text=${para.text ? '有' : '无'}, model=${currentModel}, voice=${currentVoice}`);
          }
          
          const synthesizeUrl = getFullApiUrl('/tts/synthesize');
          response = await fetch(synthesizeUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              bookId: String(bookId),
              chapterId: String(chapter || '0'),
              paragraphId: String(paraId),
              text: String(para.text),
              speed: Number(speed) || 1.0,
              model: String(currentModel),
              voice: String(currentVoice),
              autoRole: Boolean(autoRole),
            }),
          });
          
          if (response.ok) {
            // 生成成功后，再获取音频（不传text参数，因为已经生成缓存）
            const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(bookId)}&chapterId=${encodeURIComponent(chapter || '0')}&paragraphId=${encodeURIComponent(paraId)}&speed=${speed}&model=${encodeURIComponent(currentModel)}&voice=${encodeURIComponent(currentVoice)}&autoRole=${autoRole ? 'true' : 'false'}`);
            response = await fetch(audioUrl, { headers });
          }
        } else {
          // 文本较短，可以直接使用GET请求
          const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(bookId)}&chapterId=${encodeURIComponent(chapter || '0')}&paragraphId=${encodeURIComponent(paraId)}&speed=${speed}&model=${encodeURIComponent(currentModel)}&voice=${encodeURIComponent(currentVoice)}&autoRole=${autoRole ? 'true' : 'false'}&text=${encodeURIComponent(para.text)}`);
          response = await fetch(audioUrl, { headers });
        }

        if (!response.ok) {
          if (response.status === 401) {
            toast.error('认证失败，请重新登录');
            throw new Error('Unauthorized');
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // 将响应转换为Blob
        audioBlob = await response.blob();
        
        // 创建Object URL
        audioObjectUrl = URL.createObjectURL(audioBlob);
      }
      
      audioObjectUrlRef.current = audioObjectUrl;

      // 创建新的audio元素
      const audio = new Audio(audioObjectUrl);
      audioRef.current = audio;
      audio.preload = 'auto';
      
      // 设置播放速度
      audio.playbackRate = speed;

      const handlePlay = () => {
        // 检查是否仍然是当前要播放的段落（防止重复点击导致的问题）
        if (currentPlayingIndexRef.current !== index || !audioRef.current || audioRef.current !== audio) {
          console.log(`[TTSPanel] 播放已取消: 段落索引已变更或音频元素已替换`);
          return;
        }
        
        audio.play().then(() => {
          console.log(`[TTSPanel] 播放成功: 段落 ${index}`);
          isPlayingRef.current = true;
          setIsPlaying(true);
        }).catch((e) => {
          console.error('[TTSPanel] 播放失败', e);
          toast.error('播放失败: ' + (e.message || '未知错误'));
          isPlayingRef.current = false;
          setIsPlaying(false);
          loadingParagraphsRef.current.delete(paraId);
          currentPlayingIndexRef.current = -1;
          // 清理Object URL
          if (audioObjectUrlRef.current) {
            URL.revokeObjectURL(audioObjectUrlRef.current);
            audioObjectUrlRef.current = null;
          }
        });
      };

      audio.addEventListener('loadstart', () => {
        console.log(`[TTSPanel] 开始加载音频: 段落 ${index}`);
      });

      audio.addEventListener('loadeddata', () => {
        console.log(`[TTSPanel] 音频数据已加载: 段落 ${index}`);
        // 尝试播放
        handlePlay();
      });

      audio.addEventListener('canplay', () => {
        console.log(`[TTSPanel] 音频可以播放: 段落 ${index}`);
        // 如果还没有开始播放，尝试播放
        if (audio.paused && !audio.ended) {
          handlePlay();
        }
      });

      audio.addEventListener('canplaythrough', () => {
        console.log(`[TTSPanel] 音频可以完整播放: 段落 ${index}`);
        // 如果还没有开始播放，尝试播放
        if (audio.paused && !audio.ended) {
          handlePlay();
        }
      });

      audio.addEventListener('ended', () => {
        console.log(`[TTSPanel] 音频播放结束: 段落 ${index}`);
        
        // 检查是否仍然是当前播放的段落
        if (currentPlayingIndexRef.current !== index) {
          console.log(`[TTSPanel] 播放结束事件已过期: 当前段落已变更`);
          return;
        }
        
        isPlayingRef.current = false;
        setIsPlaying(false);
        currentPlayingIndexRef.current = -1;
        
        // 清理Object URL
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current);
          audioObjectUrlRef.current = null;
        }
        // 通知父组件朗读结束
        if (onCurrentParagraphChange) {
          onCurrentParagraphChange(null);
        }
        loadingParagraphsRef.current.delete(paraId);
        
        if (autoNext && index < paragraphs.length - 1) {
          // 自动播下一段
          setTimeout(() => {
            // 再次检查是否仍然应该自动播放下一段
            if (!isPlayingRef.current && currentPlayingIndexRef.current === -1) {
            setCurrentIndex(index + 1);
            loadAndPlayParagraph(index + 1);
            }
          }, 300);
        } else {
          // 播放完成，补充缓存（保持至少20个段落）
          if (index < paragraphs.length - 1) {
            preloadMultipleParagraphs(index, 20);
          }
        }
      });

      audio.addEventListener('error', (e) => {
        console.error('[TTSPanel] 音频加载失败', e, audio.error);
        const errorMsg = audio.error 
          ? `错误代码: ${audio.error.code}, 消息: ${audio.error.message}`
          : '未知错误';
        toast.error('音频加载失败: ' + errorMsg);
        isPlayingRef.current = false;
        setIsPlaying(false);
        if (currentPlayingIndexRef.current === index) {
          currentPlayingIndexRef.current = -1;
        }
        loadingParagraphsRef.current.delete(paraId);
        // 清理Object URL
        if (audioObjectUrlRef.current) {
          URL.revokeObjectURL(audioObjectUrlRef.current);
          audioObjectUrlRef.current = null;
        }
      });

      // 如果音频已经可以播放，立即尝试播放
      if (audio.readyState >= 2) {
        handlePlay();
      } else {
        // 否则等待加载完成
        audio.load();
      }

      setCurrentIndex(index);
      // 注意：isPlaying 状态在 handlePlay 成功后设置
      
      // 对于EPUB，优先使用段落CFI锚点跳转（最准确）
      if (bookType?.toLowerCase() === 'epub') {
        // EPUB: 优先使用段落CFI锚点定位
        if (para.anchor && para.anchor.type === 'epub_cfi' && para.anchor.value) {
          const cfi = para.anchor.value as string;
          const goToPosition = (window as any).__readerGoToPosition;
          if (goToPosition && typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
            console.log(`[TTSPanel] 使用段落CFI跳转: ${cfi.substring(0, 50)}...`);
            goToPosition({ currentLocation: cfi }).then(() => {
              console.log(`[TTSPanel] CFI跳转成功`);
              // 等待跳转完成后再高亮显示
              setTimeout(() => {
                if ((window as any).__setCurrentReadingParagraph) {
                  (window as any).__setCurrentReadingParagraph(para.id);
                }
              }, 300);
            }).catch((e) => {
              console.warn('[TTSPanel] CFI跳转失败，使用备用方案', e);
              // CFI跳转失败，使用onParagraphClick
              if (onParagraphClick) {
                onParagraphClick(para.anchor);
              }
      // 通知父组件当前朗读的段落
      if (onCurrentParagraphChange) {
        onCurrentParagraphChange(para.id);
      }
              // 延迟高亮
              setTimeout(() => {
                if ((window as any).__setCurrentReadingParagraph) {
                  (window as any).__setCurrentReadingParagraph(para.id);
                }
              }, 500);
            });
          } else {
            // CFI无效，使用onParagraphClick
      if (onParagraphClick) {
        onParagraphClick(para.anchor);
      }
            if (onCurrentParagraphChange) {
              onCurrentParagraphChange(para.id);
            }
            setTimeout(() => {
              if ((window as any).__setCurrentReadingParagraph) {
                (window as any).__setCurrentReadingParagraph(para.id);
              }
            }, 300);
          }
        } else {
          // 没有CFI锚点，使用onParagraphClick
          if (onParagraphClick) {
            onParagraphClick(para.anchor);
          }
          if (onCurrentParagraphChange) {
            onCurrentParagraphChange(para.id);
          }
          setTimeout(() => {
            if ((window as any).__setCurrentReadingParagraph) {
              (window as any).__setCurrentReadingParagraph(para.id);
            }
          }, 300);
        }
      } else {
        // TXT/MD: 使用onParagraphClick跳转
        if (onParagraphClick) {
          onParagraphClick(para.anchor);
        }
        if (onCurrentParagraphChange) {
          onCurrentParagraphChange(para.id);
        }
        // TXT/MD: 检查段落是否在当前页面，如果不在则自动翻页
        const getCurrentPageInfo = (window as any).__getCurrentPageInfo;
        if (getCurrentPageInfo) {
          const pageInfo = getCurrentPageInfo();
          if (pageInfo) {
            // 检查段落文本是否在当前页面内容中
            const paraText = para.text.substring(0, Math.min(50, para.text.length));
            if (!pageInfo.content.includes(paraText) && !paraText.includes(pageInfo.content.substring(0, Math.min(50, pageInfo.content.length)))) {
              // 段落不在当前页面，需要翻页
              // 通过段落索引估算行号（假设每个段落平均15行）
              const paraIndex = parseInt(para.id.replace(/^p/, ''), 10);
              const estimatedLine = paraIndex * 15;
              
              // 通知阅读器翻页（通过onParagraphClick）
              if (onParagraphClick) {
                onParagraphClick({
                  type: 'scroll',
                  value: estimatedLine,
                });
                console.log(`[TTSPanel] 段落不在当前页面，翻页到行号: ${estimatedLine}`);
              }
            }
          }
        }
      }
      
      // 开始播放后，批量预加载后续多段音频（用于连贯听书）
      // 保持至少20个段落的缓存
      if (index < paragraphs.length - 1) {
        // 立即预加载下一段
        preloadNextParagraph(index);
        // 批量预加载后续20段（保持缓存）
        preloadMultipleParagraphs(index, 20);
      }
    } catch (e: any) {
      console.error('[TTSPanel] 加载段落音频失败', e);
      toast.error(e.message || '加载音频失败');
      isPlayingRef.current = false;
      setIsPlaying(false);
      if (currentPlayingIndexRef.current === index) {
        currentPlayingIndexRef.current = -1;
      }
      loadingParagraphsRef.current.delete(paraId);
      // 清理Object URL
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }
    }
  };

  const handlePlayPause = useCallback(async () => {
    // 如果正在播放，暂停
    if (isPlayingRef.current && audioRef.current) {
      console.log('[TTSPanel] 暂停播放');
      audioRef.current.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentPlayingIndexRef.current = -1;
      // 通知父组件停止朗读
      if (onCurrentParagraphChange) {
        onCurrentParagraphChange(null);
      }
      return;
    }

    // 如果正在加载，不允许重复点击
    if (loadingParagraphsRef.current.size > 0) {
      console.log('[TTSPanel] 正在加载音频，请稍候...');
      return;
    }

    // 重新设计播放逻辑：优先使用进度计算段落索引（更准确）
    // 1. 首先获取当前页面对应的段落索引
    let targetParagraphIndex = -1;
    
    if (paragraphs.length > 0) {
      // 优先使用进度计算段落索引（进度基于CFI/locations，最准确）
      if (currentPosition?.progress !== undefined && currentPosition.progress > 0) {
        targetParagraphIndex = Math.floor(currentPosition.progress * paragraphs.length);
        targetParagraphIndex = Math.max(0, Math.min(targetParagraphIndex, paragraphs.length - 1));
        console.log(`[TTSPanel] 使用进度计算段落索引: progress=${(currentPosition.progress * 100).toFixed(2)}%, 计算索引=${targetParagraphIndex + 1}/${paragraphs.length}`);
      } 
      // 备用：使用保存的段落索引
      else if (currentPosition?.paragraphIndex !== undefined && currentPosition.paragraphIndex >= 0) {
        targetParagraphIndex = currentPosition.paragraphIndex;
        targetParagraphIndex = Math.max(0, Math.min(targetParagraphIndex, paragraphs.length - 1));
        console.log(`[TTSPanel] 使用保存的段落索引（备用）: ${targetParagraphIndex + 1}/${paragraphs.length}`);
      } else {
        // 尝试通过 __getCurrentPageParagraphIndex 获取当前页对应的段落索引
        const getCurrentPageParagraphIndex = (window as any).__getCurrentPageParagraphIndex;
        if (getCurrentPageParagraphIndex) {
          try {
            const pageParagraphIndex = await Promise.resolve(getCurrentPageParagraphIndex());
            if (pageParagraphIndex !== null && pageParagraphIndex !== undefined && pageParagraphIndex >= 0) {
              targetParagraphIndex = pageParagraphIndex;
              targetParagraphIndex = Math.max(0, Math.min(targetParagraphIndex, paragraphs.length - 1));
              console.log(`[TTSPanel] 通过页面段落索引定位: ${targetParagraphIndex + 1}/${paragraphs.length}`);
            }
          } catch (e) {
            console.warn('[TTSPanel] 获取当前页段落索引失败', e);
          }
        }
        
        // 如果还是无法获取，使用进度估算
        if (targetParagraphIndex < 0 && currentPosition?.progress !== undefined && currentPosition.progress > 0) {
          targetParagraphIndex = Math.floor(currentPosition.progress * paragraphs.length);
          targetParagraphIndex = Math.max(0, Math.min(targetParagraphIndex, paragraphs.length - 1));
          console.log(`[TTSPanel] 使用进度估算段落索引: progress=${currentPosition.progress}, 段落索引=${targetParagraphIndex + 1}/${paragraphs.length}`);
        }
      }
      
      // 如果成功获取到段落索引，使用该段落的内容进行播放
      if (targetParagraphIndex >= 0 && targetParagraphIndex < paragraphs.length) {
        const para = paragraphs[targetParagraphIndex];
        if (para && para.text && para.text.trim().length > 0) {
          console.log(`[TTSPanel] 使用段落索引 ${targetParagraphIndex + 1}/${paragraphs.length} 播放: "${para.text.substring(0, 50)}..."`);
          setCurrentIndex(targetParagraphIndex);
          // 直接使用段落内容播放，而不是页面文本
          loadAndPlayParagraph(targetParagraphIndex);
          return;
        }
      }
    }
    
    // 新方案：优先使用 __getCurrentPageParagraphIndex 获取当前页面对应的段落索引
    // 这样可以确保TTS内容和当前页面内容一致，避免进度计算不准确的问题
    console.log('[TTSPanel] 尝试使用当前页面对应的段落索引生成TTS');
    
    // 1. 优先使用 __getCurrentPageParagraphIndex 获取当前页面对应的段落索引（最准确）
    if (bookType?.toLowerCase() === 'epub' && paragraphs.length > 0) {
      const getCurrentPageParagraphIndex = (window as any).__getCurrentPageParagraphIndex;
      if (getCurrentPageParagraphIndex) {
        try {
          const pageParagraphIndex = await Promise.resolve(getCurrentPageParagraphIndex());
          if (pageParagraphIndex !== null && pageParagraphIndex !== undefined && pageParagraphIndex >= 0 && pageParagraphIndex < paragraphs.length) {
            const para = paragraphs[pageParagraphIndex];
            if (para && para.text && para.text.trim().length > 0) {
              console.log(`[TTSPanel] 使用当前页面对应的段落索引: ${pageParagraphIndex + 1}/${paragraphs.length}`);
              console.log(`[TTSPanel] 段落文本预览: "${para.text.substring(0, 50)}..."`);
              console.log(`[TTSPanel] 段落文本长度: ${para.text.length} 字符`);
              
              // 更新 currentIndex，确保显示正确
              setCurrentIndex(pageParagraphIndex);
              // 使用该段落的文本生成TTS并播放
              loadAndPlayText(para.text.trim(), para.id);
              return;
            }
          }
        } catch (e) {
          console.warn('[TTSPanel] 获取当前页段落索引失败，尝试文本匹配', e);
        }
      }
    }
    
    // 2. 备用方案：通过文本匹配查找段落
    console.log('[TTSPanel] 尝试通过文本匹配查找当前页面对应的段落');
    
    // 获取当前页面的第一段文本
    let currentPageFirstParagraphText: string | null = null;
    
        if (bookType?.toLowerCase() === 'epub') {
      // EPUB: 通过 __getCurrentPageText 获取当前页面文本，然后提取第一段
      const getCurrentPageText = (window as any).__getCurrentPageText;
      if (getCurrentPageText) {
        try {
          const pageText = getCurrentPageText();
          if (pageText && typeof pageText === 'string' && pageText.trim().length > 0) {
            // 提取第一段文本：取第一个非空行或前200字符
            const lines = pageText.split('\n').filter(line => line.trim().length > 0);
            if (lines.length > 0) {
              // 使用第一行，但不超过200字符
              currentPageFirstParagraphText = lines[0].substring(0, Math.min(200, lines[0].length)).trim();
            } else {
              // 如果没有换行，取前200字符
              currentPageFirstParagraphText = pageText.substring(0, Math.min(200, pageText.length)).trim();
            }
            console.log(`[TTSPanel] 获取到当前页面第一段文本: ${currentPageFirstParagraphText.length} 字符`);
            console.log(`[TTSPanel] 第一段文本预览: "${currentPageFirstParagraphText.substring(0, 50)}..."`);
          }
        } catch (e) {
          console.warn('[TTSPanel] 获取当前页面文本失败', e);
        }
      }
    } else {
      // TXT/MD: 通过 __getCurrentPageInfo 获取当前页面信息
      const getCurrentPageInfo = (window as any).__getCurrentPageInfo;
      if (getCurrentPageInfo) {
        try {
          const pageInfo = getCurrentPageInfo();
          if (pageInfo && pageInfo.content) {
            // 提取第一行或第一段
            const firstLine = pageInfo.content.split('\n')[0]?.trim();
            if (firstLine && firstLine.length > 0) {
              currentPageFirstParagraphText = firstLine;
              console.log(`[TTSPanel] 获取到当前页面第一行: "${currentPageFirstParagraphText.substring(0, 50)}..."`);
            }
          }
        } catch (e) {
          console.warn('[TTSPanel] 获取当前页面信息失败', e);
        }
      }
    }
    
    // 在段落列表中查找匹配的段落（通过文本匹配）
    let matchedParagraphIndex = -1;
    let matchedParagraph: typeof paragraphs[0] | null = null;
    
    if (currentPageFirstParagraphText && paragraphs.length > 0) {
      // 使用文本匹配查找段落
      const searchText = currentPageFirstParagraphText.substring(0, Math.min(100, currentPageFirstParagraphText.length)).trim();
      
      // 优先匹配：段落文本包含页面第一段文本
      for (let i = 0; i < paragraphs.length; i++) {
        const paraText = paragraphs[i].text.trim();
        if (paraText.includes(searchText) || searchText.includes(paraText.substring(0, Math.min(50, paraText.length)))) {
          matchedParagraphIndex = i;
          matchedParagraph = paragraphs[i];
          console.log(`[TTSPanel] 匹配到段落索引 ${i}: 页面第一段="${searchText.substring(0, 30)}...", 段落文本="${paraText.substring(0, 30)}..."`);
          break;
        }
      }
      
      // 如果没找到，尝试反向匹配：页面第一段包含段落开头
      if (matchedParagraphIndex < 0) {
        for (let i = 0; i < paragraphs.length; i++) {
          const paraText = paragraphs[i].text.trim();
          const paraStart = paraText.substring(0, Math.min(50, paraText.length));
          if (currentPageFirstParagraphText.includes(paraStart)) {
            matchedParagraphIndex = i;
            matchedParagraph = paragraphs[i];
            console.log(`[TTSPanel] 反向匹配到段落索引 ${i}: 页面第一段包含段落开头`);
            break;
          }
        }
      }
    }
    
    // 如果找到匹配的段落，使用该段落的文本生成TTS并播放
    if (matchedParagraphIndex >= 0 && matchedParagraph) {
      console.log(`[TTSPanel] 使用匹配的段落文本生成TTS: 段落 ${matchedParagraphIndex + 1}/${paragraphs.length}, 文本长度=${matchedParagraph.text.length} 字符`);
      // 更新 currentIndex，确保显示正确
      setCurrentIndex(matchedParagraphIndex);
      // 使用匹配的段落文本生成TTS并播放
      loadAndPlayText(matchedParagraph.text.trim(), matchedParagraph.id);
      return;
    }
    
    // 如果无法通过段落索引播放，回退到使用页面文本（兼容旧逻辑）
    console.warn('[TTSPanel] 未找到匹配段落，回退到页面文本模式');

    // 如果无法获取页面文本，尝试通过段落索引定位当前页对应的段落
    // 优先使用段落索引来定位当前页的内容
    // 重要：保持当前的 currentIndex，不要随意重置
    let targetIndex = currentIndex >= 0 && currentIndex < paragraphs.length ? currentIndex : -1;
    
    // 如果段落列表已加载，尝试通过当前页定位段落
    if (paragraphs.length > 0) {
      // 优先尝试使用 __getCurrentPageParagraphIndex 获取当前页对应的段落索引
      if (bookType?.toLowerCase() === 'epub') {
        const getCurrentPageParagraphIndex = (window as any).__getCurrentPageParagraphIndex;
        if (getCurrentPageParagraphIndex) {
          try {
            const pageParagraphIndex = await getCurrentPageParagraphIndex();
            if (pageParagraphIndex !== null && pageParagraphIndex !== undefined && pageParagraphIndex >= 0) {
              targetIndex = pageParagraphIndex;
            targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
              console.log(`[TTSPanel] 通过段落索引定位到当前页: 段落 ${targetIndex + 1}/${paragraphs.length}`);
              
              // 使用该段落的文本进行朗读
              const para = paragraphs[targetIndex];
              if (para && para.text && para.text.trim().length > 0) {
                console.log(`[TTSPanel] 使用当前页对应段落的文本进行朗读: ${para.text.length} 字符`);
                // 先更新 currentIndex，确保显示正确
                setCurrentIndex(targetIndex);
                loadAndPlayText(para.text.trim(), para.id);
                return;
              }
            }
          } catch (e) {
            console.warn('[TTSPanel] 获取当前页段落索引失败', e);
          }
        }
      }
    }
    
    // 如果还没有定位到段落，尝试根据当前页定位
    // 但只有在 targetIndex 无效时才重新计算，避免覆盖已有的有效索引
    if (targetIndex < 0 || targetIndex >= paragraphs.length) {
      if (paragraphs.length > 0 && currentPosition) {
        // 优先使用段落索引
        if (currentPosition.paragraphIndex !== undefined && currentPosition.paragraphIndex >= 0) {
          targetIndex = currentPosition.paragraphIndex;
        } else {
          // 根据进度定位
          const progress = currentPosition.progress || 0;
          if (progress > 0) {
            targetIndex = Math.floor(progress * paragraphs.length);
          } else {
            // 只有在完全没有进度信息时才从第一段开始
            // 如果 currentIndex 是有效的，保持它
            if (currentIndex >= 0 && currentIndex < paragraphs.length) {
              targetIndex = currentIndex;
            } else {
              targetIndex = 0;
            }
          }
        }
            targetIndex = Math.max(0, Math.min(targetIndex, paragraphs.length - 1));
        // 只有在 targetIndex 与 currentIndex 不同时才更新
        if (targetIndex !== currentIndex) {
        setCurrentIndex(targetIndex);
        }
      } else {
        // 只有在完全没有信息时才从第一段开始
        // 如果 currentIndex 是有效的，保持它
        if (currentIndex >= 0 && currentIndex < paragraphs.length) {
          targetIndex = currentIndex;
        } else {
          targetIndex = 0;
          setCurrentIndex(0);
        }
      }
    }

    // 如果当前段落已加载且未播放，直接播放
    if (audioRef.current && currentPlayingIndexRef.current === targetIndex && !isPlayingRef.current) {
      audioRef.current.play().then(() => {
        isPlayingRef.current = true;
        setIsPlaying(true);
      }).catch((e) => {
        console.error('[TTSPanel] 播放失败', e);
        toast.error('播放失败');
      });
    } else {
      // 如果当前段落未加载或已变更，重新加载并播放
      loadAndPlayParagraph(targetIndex);
    }
  }, [currentIndex, paragraphs, currentPosition, bookType, onCurrentParagraphChange, loadAndPlayParagraph, loadAndPlayText]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      loadAndPlayParagraph(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < paragraphs.length - 1) {
      loadAndPlayParagraph(currentIndex + 1);
    }
  };

  const handleParagraphClick = (index: number) => {
    loadAndPlayParagraph(index);
  };

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0', hover: 'rgba(0, 0, 0, 0.05)' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040', hover: 'rgba(255, 255, 255, 0.1)' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c', hover: 'rgba(0, 0, 0, 0.05)' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7', hover: 'rgba(0, 0, 0, 0.05)' },
  }[settings.theme];

  // 暴露控制方法给父组件
  const handleModelChange = async (newModel: string) => {
    console.log(`[TTSPanel] 切换模型: ${currentModel} -> ${newModel}`);
    setCurrentModel(newModel);
    // 清理预加载缓存
    preloadCacheRef.current.forEach(({ url }) => {
      URL.revokeObjectURL(url);
    });
    preloadCacheRef.current.clear();
    preloadingRef.current.clear();
    // 切换模型时，立即从API获取新的音色列表
    await fetchVoices(newModel);
    if (isPlaying) {
      loadAndPlayParagraph(currentIndex);
    }
  };

  const handleVoiceChange = (newVoice: string) => {
    setCurrentVoice(newVoice);
    // 清理预加载缓存
    preloadCacheRef.current.forEach(({ url }) => {
      URL.revokeObjectURL(url);
    });
    preloadCacheRef.current.clear();
    preloadingRef.current.clear();
    if (isPlaying) {
      loadAndPlayParagraph(currentIndex);
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  // 暴露状态和方法给父组件
  useEffect(() => {
    if (onStateChange) {
      // 确保 currentIndex 有效（>= 0），如果无效则使用 0
      // 注意：如果 currentIndex 是 -1，说明还没有初始化，应该使用 0
      const validIndex = currentIndex >= 0 ? currentIndex : 0;
      const progressPercent = paragraphs.length > 0 ? ((validIndex + 1) / paragraphs.length * 100).toFixed(2) : '0.00';
      console.log(`[TTSPanel] 更新TTS状态: currentIndex=${currentIndex} -> validIndex=${validIndex}, totalParagraphs=${paragraphs.length}, progress=${progressPercent}%`);
      console.log(`[TTSPanel] currentPosition信息: paragraphIndex=${currentPosition?.paragraphIndex}, progress=${currentPosition?.progress}, currentPage=${currentPosition?.currentPage}`);
      onStateChange({
        isPlaying,
        currentIndex: validIndex, // 使用有效的索引
        totalParagraphs: paragraphs.length,
        speed,
        model: currentModel,
        voice: currentVoice,
        models,
        voices,
        onPlayPause: handlePlayPause,
        onPrev: handlePrev,
        onNext: handleNext,
        onSpeedChange: handleSpeedChange,
        onModelChange: handleModelChange,
        onVoiceChange: handleVoiceChange,
      });
    }
  }, [isPlaying, currentIndex, paragraphs.length, speed, currentModel, currentVoice, models, voices]);

  // 如果隐藏UI,只返回null
  if (hideUI) return null;

  // 返回控制方法（通过props暴露）
  if (!isVisible) return null;

  if (!isSupported) {
    return (
      <div 
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" 
        onClick={onClose}
        style={{
          paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 1rem)`
            : 'max(env(safe-area-inset-top, 0px), 1rem)',
          paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 1rem)`
            : 'max(env(safe-area-inset-bottom, 0px), 1rem)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
        }}
      >
        <div
          className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
          style={{ 
            backgroundColor: themeStyles.bg, 
            color: themeStyles.text,
            maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
              ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 1rem) - max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 1rem) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
              : 'calc(80vh - 2rem)',
          }}
        >
          <h2 className="text-lg font-bold mb-4">{t('tts.readAloud')}</h2>
          <p className="mb-4">{t('tts.formatNotSupported', { format: bookType })}</p>
          <p className="text-sm opacity-70 mb-4">{t('tts.supportedFormats')}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    );
  }

  // 如果不需要隐藏UI,显示原来的面板
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 flex flex-col shadow-xl"
        style={{
          backgroundColor: themeStyles.bg,
          color: themeStyles.text,
          paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `clamp(20px, env(safe-area-inset-top, 20px), 44px)`
            : 'env(safe-area-inset-top, 0px)',
          paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `calc(${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} + clamp(10px, env(safe-area-inset-bottom, 10px), 34px))`
            : 'clamp(10px, env(safe-area-inset-bottom, 10px), 34px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: themeStyles.border }}>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            语音朗读
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-opacity-10 hover:bg-black dark:hover:bg-white rounded-lg transition-colors"
            style={{ color: themeStyles.text }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 控制栏 */}
        <div className="p-4 border-b space-y-3" style={{ borderColor: themeStyles.border }}>
          {/* 模型选择 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('tts.modelSelection')}</span>
            <select
              value={currentModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: themeStyles.bg, borderColor: themeStyles.border, color: themeStyles.text }}
            >
              {models.filter(m => m.available).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.type === 'online' ? t('tts.online') : t('tts.offline')})
                </option>
              ))}
            </select>
          </div>

          {/* 语音选择 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('tts.voiceSelection')}</span>
            <select
              value={currentVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: themeStyles.bg, borderColor: themeStyles.border, color: themeStyles.text }}
              disabled={loadingVoices}
            >
              {loadingVoices ? (
                <option value="">{t('common.loading')}</option>
              ) : voices.length === 0 ? (
                <option value="">{t('tts.noAvailableVoices')}</option>
              ) : (
                voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* 倍速选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm">{t('tts.speed')}</span>
            <select
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
              style={{ backgroundColor: themeStyles.bg, borderColor: themeStyles.border, color: themeStyles.text }}
            >
              <option value="0.8">0.8x</option>
              <option value="1.0">1.0x</option>
              <option value="1.2">1.2x</option>
              <option value="1.5">1.5x</option>
            </select>
          </div>

          {/* 播放控制 */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              className="p-2 rounded-lg disabled:opacity-30"
              style={{ color: themeStyles.text }}
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={handlePlayPause}
              className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex >= paragraphs.length - 1}
              className="p-2 rounded-lg disabled:opacity-30"
              style={{ color: themeStyles.text }}
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* 自动下一段 */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => setAutoNext(e.target.checked)}
              className="rounded"
            />
            <span>{t('tts.autoPlayNext')}</span>
          </label>
        </div>

        {/* 段落列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : paragraphs.length === 0 ? (
            <div className="text-center py-12 text-sm opacity-70">{t('tts.noParagraphs')}</div>
          ) : (
            <div className="space-y-2">
              {paragraphs.map((para, idx) => (
                <div
                  key={para.id}
                  id={`para-${idx}`}
                  onClick={() => handleParagraphClick(idx)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    idx === currentIndex ? 'bg-blue-100 dark:bg-blue-900' : ''
                  }`}
                  style={{
                    backgroundColor: idx === currentIndex ? (settings.theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)') : 'transparent',
                    border: `1px solid ${idx === currentIndex ? '#3b82f6' : themeStyles.border}`,
                  }}
                >
                  <p className="text-sm leading-relaxed line-clamp-3">{para.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

