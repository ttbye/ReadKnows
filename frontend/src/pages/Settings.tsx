/**
 * @file Settings.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon, Folder, Scan, CheckCircle, XCircle, Upload, Trash2, Type, Shield, Users, BookOpen, Trash, Sparkles, Sun, Moon, Monitor, Mail, Send, Plus, Edit, X, Volume2, Globe } from 'lucide-react';
import { offlineStorage } from '../utils/offlineStorage';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string;
}

export default function Settings() {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<Record<string, Setting>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [pathValidation, setPathValidation] = useState<Record<string, any>>({});
  const [fonts, setFonts] = useState<any[]>([]);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [readerPreferences, setReaderPreferences] = useState<Record<string, any>>({});
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testingTTS, setTestingTTS] = useState(false);
  const [ttsTestResult, setTtsTestResult] = useState<any>(null);
  const [ttsTestAudio, setTtsTestAudio] = useState<HTMLAudioElement | null>(null);
  const [ttsProfiles, setTtsProfiles] = useState<Array<{ id: string; label: string }>>([]);
  const [testingVoice, setTestingVoice] = useState(false);
  const [ttsModels, setTtsModels] = useState<Array<{ id: string; name: string; description: string; type: string; available: boolean }>>([]);
  const [ttsVoices, setTtsVoices] = useState<Array<{ id: string; name: string; lang: string; gender?: string; style?: string }>>([]);
  const [loadingTtsModels, setLoadingTtsModels] = useState(false);
  const [backendVersion, setBackendVersion] = useState<string>('');
  const [backendBuildTime, setBackendBuildTime] = useState<string>('');
  const { theme, setTheme } = useTheme();
  
  // 书籍类型管理
  const [bookCategories, setBookCategories] = useState<Array<{ id: string; name: string; display_order: number }>>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCategoryEditModal, setShowCategoryEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; display_order: number } | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', display_order: 0 });

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
      fetchFonts();
      fetchReaderPreferences();
      fetchCacheSize();
      fetchBackendVersion();
      fetchTtsProfiles();
      if (user?.role === 'admin') {
        fetchBookCategories();
        // 强制从API获取TTS模型列表，不使用缓存
        fetchTtsModels().catch((error) => {
          console.error('[TTS设置] 初始化时获取模型列表失败:', error);
        });
      }
    }
  }, [isAuthenticated, user]);

  // 当设置加载完成后，初始化TTS默认配置
  useEffect(() => {
    if (user?.role === 'admin' && Object.keys(settings).length > 0) {
      const defaultModel = settings.tts_default_model?.value;
      if (defaultModel && ttsModels.length > 0) {
        fetchTtsVoices(defaultModel);
      }
    }
  }, [settings.tts_default_model, i18n.language, ttsModels.length, user?.role]);

  // 初始化时，优先使用 localStorage 的语言设置，然后同步到后端
  useEffect(() => {
    if (Object.keys(settings).length > 0) {
      // 优先使用 localStorage 中的语言设置（用户最新选择）
      const savedLanguage = localStorage.getItem('app-language');
      if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
        // 如果 localStorage 中的语言与当前 i18n.language 不一致，更新 i18n
        if (i18n.language !== savedLanguage) {
          i18n.changeLanguage(savedLanguage);
        }
        
        // 同步到后端 system_language 设置（如果后端设置不一致）
        const systemLanguage = savedLanguage === 'zh' ? 'zh-CN' : 'en';
        if (settings.system_language?.value !== systemLanguage) {
          // 静默更新后端设置，不显示 toast
          api.put('/settings/system_language', { value: systemLanguage }).catch((error) => {
            console.error('同步语言设置到后端失败:', error);
          });
          // 更新本地状态
          setSettings((prev) => ({
            ...prev,
            system_language: { ...prev.system_language!, value: systemLanguage },
          }));
        }
      } else if (settings.system_language?.value) {
        // 如果 localStorage 中没有语言设置，使用后端的设置
        const systemLang = settings.system_language.value;
        const i18nLang = systemLang === 'zh-CN' ? 'zh' : systemLang === 'en' ? 'en' : 'zh';
        if (i18n.language !== i18nLang) {
          i18n.changeLanguage(i18nLang);
          localStorage.setItem('app-language', i18nLang);
        }
      }
    }
  }, [settings.system_language?.value, i18n]);

  // 当用户是管理员且设置已加载时，强制从 API 获取 TTS 模型列表
  useEffect(() => {
    if (user?.role === 'admin' && Object.keys(settings).length > 0 && ttsModels.length === 0 && !loadingTtsModels) {
      // 如果模型列表为空且不在加载中，强制从 API 获取
      console.log('[TTS设置] 检测到模型列表为空，从 API 获取最新数据');
      fetchTtsModels().catch((error) => {
        console.error('[TTS设置] 自动获取模型列表失败:', error);
      });
    }
  }, [user?.role, settings, ttsModels.length, loadingTtsModels]);
  
  // 获取TTS模型列表
  const fetchTtsModels = async () => {
    try {
      setLoadingTtsModels(true);
      const response = await api.get('/tts/models');
      const models = response.data.models || [];
      
      if (models.length === 0) {
        console.warn('[TTS设置] API 返回的模型列表为空');
        setTtsModels([]);
        toast.error(t('settings.ttsNoModels'));
        return;
      }
      
      setTtsModels(models);
      
      // 如果当前没有设置默认模型，选择第一个可用的模型
      const defaultModel = settings.tts_default_model?.value;
      if (!defaultModel && models.length > 0) {
        const availableModel = models.find((m: any) => m.available) || models[0];
        if (availableModel) {
          await fetchTtsVoices(availableModel.id);
        }
      } else if (defaultModel) {
        await fetchTtsVoices(defaultModel);
      }
    } catch (error: any) {
      console.error('获取TTS模型列表失败:', error);
      setTtsModels([]); // 清空列表，显示加载错误状态
      toast.error(`${t('settings.fetchTtsModelsFailed')}: ${error.response?.data?.error || error.message || t('settings.unknownError')}`);
    } finally {
      setLoadingTtsModels(false);
    }
  };

  // 语言代码映射函数：将 i18n 语言代码映射为系统语言代码
  const mapLanguageToSystemLanguage = (lang: string): string => {
    // zh -> zh-CN, en -> en, 未来可以扩展更多语言
    const langMap: Record<string, string> = {
      'zh': 'zh-CN',
      'en': 'en',
    };
    return langMap[lang] || lang;
  };

  // 获取TTS语音列表
  const fetchTtsVoices = async (modelId: string) => {
    try {
      // 使用 i18n.language 作为全局语言设置
      const currentLanguage = i18n.language || 'zh';
      const langParam = currentLanguage === 'zh' ? 'zh' : 'en';
      
      const response = await api.get('/tts/voices', { 
        params: { 
          model: modelId,
          lang: langParam 
        } 
      });

      
      // 后端返回格式: {model: string, voices: array}
      const voices = response.data?.voices || response.data || [];
      if (!Array.isArray(voices)) {
        setTtsVoices([]);
        return [];
      }
      
      setTtsVoices(voices);
      return voices; 
    } catch (error: any) {
      console.error('获取TTS语音列表失败:', error);
      console.error('错误详情:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setTtsVoices([]);
      return []; 
    }
  };
  
  // 获取TTS语音配置列表
  const fetchTtsProfiles = async () => {
    try {
      const response = await api.get('/tts/profiles');
      const profiles = response.data.profiles || [];
      setTtsProfiles(profiles);
    } catch (error: any) {
      console.error('获取TTS语音配置失败:', error);
      setTtsProfiles([]);
    }
  };

  // 获取书籍类型 列表
  const fetchBookCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await api.get('/settings/book-categories');
      setBookCategories(response.data.categories || []);
    } catch (error) {
      console.error('获取书籍类型列表失败:', error);
      toast.error(t('settings.fetchCategoriesFailed'));
    } finally {
      setLoadingCategories(false);
    }
  };

  // 创建书籍 类型
  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('请输入书籍类型名称');
      return;
    }

    try {
      await api.post('/settings/book-categories', {
        name: categoryForm.name.trim(),
        display_order: categoryForm.display_order,
      });
      toast.success(t('settings.categoryCreated'));
      setShowCategoryEditModal(false);
      setCategoryForm({ name: '', display_order: 0 });
      await fetchBookCategories();
    } catch (error: any) {
      console.error('创建书籍类型失败:', error);
      toast.error(error.response?.data?.error || t('settings.createCategoryFailed'));
    }
  };

  // 更新书籍 类型
  const handleUpdateCategory = async () => {
    if (!editingCategory || !categoryForm.name.trim()) {
      toast.error('请输入书籍类型名称');
      return;
    }

    try {
      await api.put(`/settings/book-categories/${editingCategory.id}`, {
        name: categoryForm.name.trim(),
        display_order: categoryForm.display_order,
      });
      toast.success(t('settings.categoryUpdatedSuccess'));
      setShowCategoryEditModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', display_order: 0 });
      await fetchBookCategories();
    } catch (error: any) {
      console.error('更新书籍类型失败:', error);
      toast.error(error.response?.data?.error || t('settings.updateCategoryFailed'));
    }
  };

  // 删除书籍 类型
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(t('settings.confirmDeleteCategoryMessage', { name }))) {
      return;
    }

    try {
      await api.delete(`/settings/book-categories/${id}`);
      toast.success(t('settings.categoryDeletedSuccess'));
      await fetchBookCategories();
    } catch (error: any) {
      console.error('删除书籍类型失败:', error);
      toast.error(error.response?.data?.error || t('settings.deleteFailed'));
    }
  };

  // 打开编辑模态框
  const openEditModal = (category: { id: string; name: string; display_order: number }) => {
    setEditingCategory(category);
    setCategoryForm({ name: category.name, display_order: category.display_order });
    setShowCategoryEditModal(true);
  };

  // 打开创建模态框
  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', display_order: bookCategories.length });
    setShowCategoryEditModal(true);
  };

  const fetchBackendVersion = async () => {
    try {
      const response = await api.get('/settings/version');
      setBackendVersion(response.data.version || t('reader.unknownVersion'));
      setBackendBuildTime(response.data.buildTime || '');
    } catch (error) {
      console.error('获取后端版本号失败:', error);
      setBackendVersion(t('reader.unknownVersion'));
      setBackendBuildTime('');
    }
  };

  const fetchCacheSize = async () => {
    try {
      const size = await offlineStorage.getCacheSize();
      setCacheSize(size);
    } catch (error) {
      console.error('获取缓存大小失败:', error);

    }
  };

  const formatCacheSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleClearCache = async () => {
    if (!confirm(t('settings.confirmClearCache'))) {
      return;
    }

    setClearingCache(true);
    try {
      await offlineStorage.clearAll();
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('reading-position-') ||
          key.startsWith('reading-settings') ||
          key.startsWith('bookmarks-')
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      await fetchCacheSize();
      toast.success(t('settings.cacheCleared', { count: keysToRemove.length }));
    } catch (error: any) {
      console.error('清除缓存失败:', error);
      toast.error(error.message || t('settings.clearCacheFailed'));
    } finally {
      setClearingCache(false);
    }
  };


  const fetchOllamaModels = async (apiUrl?: string, showToast: boolean = true, provider?: string) => {
    const currentProvider = provider || settings.ai_provider?.value;
    const testUrl = apiUrl || settings.ai_api_url?.value;
    
    if (!testUrl || currentProvider !== 'ollama') {
      setOllamaModels([]);
      return;
    }

    setLoadingModels(true);
    try {
      // 如果提供了 apiUrl，通过查询参数传递给后端进行测试（不保存到数据库）
      const params: any = {};
      if (apiUrl) {
        params.api_url = apiUrl;
        if (currentProvider) {
          params.provider = currentProvider;
        }
      }
      
      const response = await api.get('/ai/test', { params });
      console.log('[Settings] AI测试响应:', response.data);
      console.log('[Settings] 模型数据:', response.data.models);
      console.log('[Settings] 模型数据类型:', typeof response.data.models);
      console.log('[Settings] 模型是否为数组:', Array.isArray(response.data.models));
      
      if (response.data.success) {
        // 处理模型列表
        let models: string[] = [];
        if (response.data.models && Array.isArray(response.data.models)) {
          models = response.data.models.map((m: any) => {
            // Ollama API 返回的模型格式可能是：
            // { name: "model-name" } 或 { model: "model-name" } 或直接是字符串
            if (typeof m === 'string') {
              return m;
            }
            // 优先使用 name，然后是 model，最后是其他字段
            const modelName = m.name || m.model || m.digest;
            if (modelName && typeof modelName === 'string') {
              return modelName;
            }
            // 如果都没有，尝试转换为字符串
            console.warn('[Settings] 模型对象无法提取名称:', m);
            return JSON.stringify(m);
          }).filter((name: string) => name && name.trim() !== '');
        } else {
          console.warn('[Settings] ⚠️ 模型列表为空或格式不正确:', {
            hasModels: !!response.data.models,
            modelsType: typeof response.data.models,
            isArray: Array.isArray(response.data.models),
            modelsValue: response.data.models
          });
        }
        
        console.log('[Settings] 解析后的模型列表:', models);

        setOllamaModels(models);
        
        // 检查是否有警告（例如：使用代理但模型列表为空，可能是 OLLAMA_URL 配置不一致）
        if (response.data.warning) {
          console.warn('[Settings] 警告:', response.data.warning);
          if (showToast) {
            toast.error(response.data.warning, {
              duration: 8000, // 显示8秒
            });
          }
        }
        
        // 如果获取到了模型列表，且当前没有选择模型，自动选择第一个模型
        if (models.length > 0 && (!settings.ai_model?.value || settings.ai_model.value.trim() === '')) {
          const firstModel = models[0];
          console.log('[Settings] 自动选择第一个模型:', firstModel);
          setSettings((prev) => ({
            ...prev,
            ai_model: { ...prev.ai_model!, value: firstModel },
          }));
          // 自动保存到数据库，但不显示toast提示
          await updateSetting('ai_model', firstModel, false);
          console.log('[Settings] 已自动保存模型名称:', firstModel);
        }
        
        if (showToast) {
          if (models.length > 0) {
            toast.success(`成功获取 ${models.length} 个模型${(!settings.ai_model?.value || settings.ai_model.value.trim() === '') ? '，已自动选择第一个模型' : ''}`);
          } else {
            // 如果没有警告信息，才显示这个错误
            if (!response.data.warning) {
              toast.error(t('settings.connectionSuccessButNoModels'));
            }
          }
        }
      } else {
        setOllamaModels([]);
        if (showToast) {
          toast.error(response.data.error || '获取模型列表失败');
        }
      }
    } catch (error: any) {
      console.error('获取模型列表失败:', error);
      setOllamaModels([]);
      if (showToast) {
        const errorMessage = error.response?.data?.error || '获取模型列表失败';
        toast.error(errorMessage);
      }
    } finally {
      setLoadingModels(false);
    }
  };

  const testOllamaConnection = async () => {
    const apiUrl = settings.ai_api_url?.value || 'http://localhost:11434';
    if (!apiUrl) {
      toast.error(t('settings.pleaseEnterApiAddress'));
      return;
    }

    // 基本URL格式验证
    try {
      const url = new URL(apiUrl);
      if (!url.protocol || !url.hostname) {
        toast.error(t('settings.invalidApiUrlFormat'));
        return;
      }
    } catch (e) {
      toast.error(t('settings.invalidApiUrl'));
      return;
    }

    setTestingConnection(true);
    try {
      // 先测试连接（不保存到数据库）
      await fetchOllamaModels(apiUrl, true, settings.ai_provider?.value);
      
      // 检查是否真的获取到了模型（即使连接成功，如果没有模型也应该提示）
      // fetchOllamaModels 内部会处理模型列表为空的情况
      
      // 测试成功后，再保存到数据库
      await updateSetting('ai_api_url', apiUrl);
      // 注意：成功消息在 fetchOllamaModels 中已经显示，这里不再重复显示
    } catch (error: any) {
      console.error('测试连接失败:', error);
      let errorMessage = t('settings.testConnectionFailed');
      
      if (error.response) {
        // 服务器返回了错误响应
        const status = error.response.status;
        const statusText = error.response.statusText;
        
        // 处理 502 Bad Gateway（nginx 无法连接到上游服务器）
        if (status === 502) {
          errorMessage = t('settings.error502');
        } else if (status === 404) {
          errorMessage = t('settings.error404');
        } else {
          errorMessage = error.response.data?.error || `HTTP ${status}: ${statusText}`;
        }
      } else if (error.request) {
        // 请求已发出但没有收到响应
        if (error.code === 'ECONNREFUSED') {
          errorMessage = t('settings.errorConnectionRefused');
        } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
          errorMessage = t('settings.errorHostNotFound');
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          errorMessage = t('settings.errorTimeout');
        } else {
          errorMessage = t('settings.errorNetwork', { message: error.message || error.code || t('settings.unknownError') });
        }
      } else {
        // 其他错误
        errorMessage = error.message || t('settings.testConnectionFailed');
      }
      
      toast.error(errorMessage);
    } finally {
      setTestingConnection(false);
    }
  };

  useEffect(() => {
    if (settings.ai_provider?.value !== 'ollama') {
      setOllamaModels([]);
    }
  }, [settings.ai_provider?.value]);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      const fetchedSettings = response.data.settings || {};
      setSettings(fetchedSettings);
      
      // 更新系统标题到页面
      const title = fetchedSettings.system_title?.value || '读士私人书库';
      document.title = title;
      const metaTitle = document.querySelector('meta[name="application-name"]');
      if (metaTitle) {
        metaTitle.setAttribute('content', title);
      }
      const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appleTitle) {
        appleTitle.setAttribute('content', title);
      }
      
      if (fetchedSettings.ai_provider?.value === 'ollama' && fetchedSettings.ai_api_url?.value) {
        setTimeout(() => {
          fetchOllamaModels(fetchedSettings.ai_api_url.value, false, 'ollama');
        }, 500);
      }
    } catch (error: any) {
      console.error('获取设置失败:', error);
      // 离线时不显示错误，API拦截器会尝试从缓存获取
      if (error.statusText !== 'OK (Offline Cache)' && error.statusText !== 'OK (Offline, No Cache)') {
        // 只有在在线且确实失败时才显示错误
        if (navigator.onLine) {
          toast.error(t('settings.fetchSettingsFailed'));
        }
      } else if (error.statusText === 'OK (Offline Cache)') {
        // 使用缓存数据
        const cachedSettings = error.data?.settings || {};
        setSettings(cachedSettings);
        
        // 更新系统标题到页面
        const title = cachedSettings.system_title?.value || '读士私人书库';
        document.title = title;
        const metaTitle = document.querySelector('meta[name="application-name"]');
        if (metaTitle) {
          metaTitle.setAttribute('content', title);
        }
        const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if (appleTitle) {
          appleTitle.setAttribute('content', title);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFonts = async () => {
    try {
      const response = await api.get('/fonts');
      setFonts(response.data.fonts || []);
    } catch (error) {
      console.error('获取字体列表失败:', error);
    }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFont(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/fonts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(t('settings.fontUploadSuccess'));
      await fetchFonts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('settings.uploadFailed'));
    } finally {
      setUploadingFont(false);
      e.target.value = '';
    }
  };

  const handleDeleteFont = async (fontId: string) => {
    if (!confirm(t('settings.confirmDeleteFont'))) return;
    try {
      await api.delete(`/fonts/${fontId}`);
      toast.success(t('settings.fontDeletedSuccess'));
      await fetchFonts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('settings.deleteFailed'));
    }
  };

  const fetchReaderPreferences = async () => {
    try {
      setLoadingPreferences(true);
      const response = await api.get('/reading/preferences');
      setReaderPreferences(response.data.preferences || {});
    } catch (error) {
      console.error('获取阅读器偏好失败:', error);
    } finally {
      setLoadingPreferences(false);
    }
  };

  const updateReaderPreference = async (fileType: string, readerType: string, settings?: any) => {
    try {
      await api.post('/reading/preferences', { fileType, readerType, settings });
      setReaderPreferences((prev) => ({
        ...prev,
        [fileType]: { readerType, settings: settings || null },
      }));
      toast.success(t('settings.readerPreferencesSaved'));
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('settings.saveFailed'));
    }
  };

  const deleteReaderPreference = async (fileType: string) => {
    try {
      await api.delete(`/reading/preferences?fileType=${fileType}`);
      setReaderPreferences((prev) => {
        const newPrefs = { ...prev };
        delete newPrefs[fileType];
        return newPrefs;
      });
      toast.success(t('settings.unselectedWillUseDefault'));
    } catch (error: any) {
      toast.error(error.response?.data?.error || t('settings.deleteFailed'));
    }
  };

  const updateSetting = async (key: string, value: string, showToast: boolean = true) => {
    try {
      await api.put(`/settings/${key}`, { value });
      // 不立即刷新设置，避免重复请求
      // await fetchSettings();
      if (showToast) {
      toast.success(t('settings.settingsSaved'));
      }
    } catch (error: any) {
      if (showToast) {
        toast.error(error.response?.data?.error || t('settings.saveFailed'));
      }
    }
  };

  const validatePath = async (path: string) => {
    try {
      const response = await api.post('/settings/validate-path', { path });
      setPathValidation((prev) => ({ ...prev, [path]: response.data }));
      return response.data;
    } catch (error) {
      console.error('验证路径失败:', error);
      return null;
    }
  };

  const handlePathChange = async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
    setTimeout(async () => {
      await validatePath(value);
    }, 500);
  };

  const handleScan = async () => {
    const scanPath = settings.books_scan_path?.value;
    if (!scanPath) {
      toast.error(t('settings.pleaseSetScanPath'));
      return;
    }

    setScanning(true);
    setScanResult(null);
    try {
      const response = await api.post('/scan/scan');
      setScanResult(response.data);
      toast.success(`扫描完成: 导入 ${response.data.imported} 本，跳过 ${response.data.skipped} 本`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || '扫描失败');
    } finally {
      setScanning(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('settings.pleaseLogin')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const storagePath = settings.books_storage_path?.value || '';
  const scanPath = settings.books_scan_path?.value || '';
  const storageValidation = pathValidation[storagePath];
  const scanValidation = pathValidation[scanPath];

  return (
    <>
    <div className="max-w-4xl mx-auto">
      <div className="space-y-6">
        {/* ========== 一、个人设置（所有用户） ========== */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.personalSettings') || '个人设置'}</h2>
          </div>

          <div className="space-y-6">
            {/* 主题设置 */}
            <div>
              <label className="block text-sm font-medium mb-3">{t('settings.theme')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'system', label: t('settings.theme'), icon: Monitor },
                  { value: 'light', label: t('settings.lightMode'), icon: Sun },
                  { value: 'dark', label: t('settings.darkMode'), icon: Moon },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.value}
                      className={`flex flex-col items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        theme === option.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={option.value}
                        checked={theme === option.value}
                        onChange={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                        className="hidden"
                      />
                      <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <span className="text-sm font-medium">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 语言设置（统一管理界面语言和系统语言） */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('language.systemLanguage')}
              </label>
              <select
                className="input w-full"
                value={i18n.language || 'zh'}
                onChange={async (e) => {
                  const newLanguage = e.target.value;
                  const systemLanguage = mapLanguageToSystemLanguage(newLanguage);
                  
                  // 更新界面语言
                  localStorage.setItem('app-language', newLanguage);
                  await i18n.changeLanguage(newLanguage);
                  
                  // 同步更新系统语言设置到后端
                  setSettings((prev) => ({
                    ...prev,
                    system_language: { ...prev.system_language!, value: systemLanguage },
                  }));
                  await updateSetting('system_language', systemLanguage);
                  
                  // 如果用户已登录，保存用户语言偏好到后端
                  if (isAuthenticated && user) {
                    try {
                      await api.put('/users/me/language', { language: newLanguage });
                    } catch (error) {
                      console.error('保存语言设置失败:', error);
                    }
                  }
                  
                  // 切换语言后，重新获取音色列表（根据新语言筛选）
                  const defaultModel = settings.tts_default_model?.value || 'edge';
                  if (defaultModel) {
                    await fetchTtsVoices(defaultModel);
                  }
                  
                  toast.success(t('language.languageChanged'), {
                    duration: 2000,
                  });
                  
                  // 延迟刷新页面以确保翻译生效
                  setTimeout(() => {
                    window.location.reload();
                  }, 500);
                }}
              >
                <option value="zh">{t('language.chinese')}</option>
                <option value="en">{t('language.english')}</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.selectSystemLanguageDesc')}
              </p>
            </div>

            {/* 系统标题设置（仅管理员） */}
            {user?.role === 'admin' && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('settings.systemTitle')}
                </label>
                <input
                  type="text"
                  className="input w-full"
                  value={settings.system_title?.value || '读士私人书库'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      system_title: { ...prev.system_title!, value: e.target.value },
                    }))
                  }
                  onBlur={() => {
                    const title = settings.system_title?.value || '读士私人书库';
                    updateSetting('system_title', title);
                    // 更新页面标题
                    document.title = title;
                    // 更新meta标签
                    const metaTitle = document.querySelector('meta[name="application-name"]');
                    if (metaTitle) {
                      metaTitle.setAttribute('content', title);
                    }
                    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
                    if (appleTitle) {
                      appleTitle.setAttribute('content', title);
                    }
                  }}
                  placeholder={t('settings.systemTitlePlaceholder')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.systemTitleDesc')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ========== 二、书籍管理（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.bookManagement')}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => window.location.href = '/books-management'}
              className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <BookOpen className="w-6 h-6 text-green-600 dark:text-green-400" />
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white">{t('settings.bookManagement')}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{t('settings.bookManagementDesc')}</div>
              </div>
            </button>
            
            <button
              onClick={() => window.location.href = '/category-management'}
              className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <Type className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white">{t('settings.categoryManagement')}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{t('settings.categoryManagementDesc')}</div>
              </div>
            </button>
          </div>
        </div>
        )}

        {/* ========== 三、阅读设置（所有用户） ========== */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.readingSettings')}</h2>
          </div>
          
          <div className="space-y-6">
            {/* EPUB阅读器选择 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('settings.epubReader') || 'EPUB阅读器'}
              </label>
              <select
                className="input w-full"
                value={readerPreferences.epub?.readerType || 'default'}
                onChange={(e) => updateReaderPreference('epub', e.target.value)}
                disabled={loadingPreferences}
              >
                <option value="default">{t('settings.defaultReader')}</option>
                <option value="pro">{t('settings.proReader') || '专业阅读器'}</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('settings.epubReaderDesc')}
              </p>
            </div>

            {/* 字体管理 */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.fontManagement')}
                </label>
                <label className="btn btn-sm btn-primary cursor-pointer">
                  <Upload className="w-4 h-4 mr-1" />
                  {t('settings.uploadFont') || '上传字体'}
                  <input
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    onChange={handleFontUpload}
                    disabled={uploadingFont}
                    className="hidden"
                  />
                </label>
              </div>
              
              {fonts.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('settings.noFonts')}
                </p>
              ) : (
                <div className="space-y-2">
                  {fonts.map((font: any) => (
                    <div
                      key={font.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">{font.name}</span>
                      <button
                        onClick={() => handleDeleteFont(font.id)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        title={t('settings.deleteFont') || '删除字体'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {uploadingFont && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                  {t('settings.uploadingFont') || '正在上传字体...'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ========== 四、书籍扫描（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Folder className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.bookScanning')}</h2>
          </div>
          
          <div className="space-y-6">
            {/* 存储路径 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('settings.storagePath')}
              </label>
              <input
                type="text"
                className="input"
                value={storagePath}
                onChange={(e) => handlePathChange('books_storage_path', e.target.value)}
                onBlur={() => updateSetting('books_storage_path', storagePath)}
                placeholder={t('settings.storagePath')}
              />
              {storageValidation && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  {storageValidation.exists && storageValidation.isDirectory ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-green-600 dark:text-green-400">
                        {storageValidation.isWritable ? t('settings.pathValidWritable') : t('settings.pathValidReadOnly')}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <span className="text-red-600 dark:text-red-400">
                        {storageValidation.error || t('settings.pathInvalid')}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 扫描路径 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('settings.scanPath')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  value={scanPath}
                  onChange={(e) => handlePathChange('books_scan_path', e.target.value)}
                  onBlur={() => updateSetting('books_scan_path', scanPath)}
                  placeholder={t('settings.scanPath')}
                />
                <button
                  onClick={handleScan}
                  disabled={scanning || !scanPath}
                  className="btn btn-primary whitespace-nowrap"
                >
                  {scanning ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('settings.scanning')}
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      {t('settings.scan')}
                    </>
                  )}
                </button>
              </div>
              {scanValidation && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  {scanValidation.exists && scanValidation.isDirectory ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">{t('settings.pathValid')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-red-600">{scanValidation.error || t('settings.pathInvalid')}</span>
                    </>
                  )}
                </div>
              )}
              {scanResult && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                  <div className="flex gap-4">
                    <span>{t('settings.total')}: {scanResult.total}</span>
                    <span className="text-green-600 dark:text-green-400">{t('settings.imported')}: {scanResult.imported}</span>
                    <span className="text-yellow-600 dark:text-yellow-400">{t('settings.skipped')}: {scanResult.skipped}</span>
                    {scanResult.errors > 0 && (
                      <span className="text-red-600 dark:text-red-400">{t('settings.errors')}: {scanResult.errors}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 自动功能 */}
            <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_convert_txt?.value === 'true'}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      auto_convert_txt: { ...prev.auto_convert_txt!, value: e.target.checked ? 'true' : 'false' },
                    }));
                    updateSetting('auto_convert_txt', e.target.checked ? 'true' : 'false');
                  }}
                  className="w-5 h-5"
                />
                <span className="text-sm">{t('settings.autoConvertTxt')}</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_convert_mobi?.value === 'true'}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      auto_convert_mobi: { ...prev.auto_convert_mobi!, value: e.target.checked ? 'true' : 'false' },
                    }));
                    updateSetting('auto_convert_mobi', e.target.checked ? 'true' : 'false');
                  }}
                  className="w-5 h-5"
                />
                <span className="text-sm">{t('settings.autoConvertMobi')}</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_fetch_douban?.value === 'true'}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      auto_fetch_douban: { ...prev.auto_fetch_douban!, value: e.target.checked ? 'true' : 'false' },
                    }));
                    updateSetting('auto_fetch_douban', e.target.checked ? 'true' : 'false');
                  }}
                  className="w-5 h-5"
                />
                <span className="text-sm">{t('settings.autoFetchDouban')}</span>
              </label>
              
              {settings.auto_fetch_douban?.value === 'true' && (
                <div className="ml-8 mt-2">
                  <input
                    type="text"
                    className="input text-sm"
                    value={settings.douban_api_base?.value || 'https://127.0.0.1:1552'}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        douban_api_base: { ...prev.douban_api_base!, value: e.target.value },
                      }))
                    }
                    onBlur={() => updateSetting('douban_api_base', settings.douban_api_base?.value || 'https://127.0.0.1:1552')}
                    placeholder={t('settings.doubanApiUrlPlaceholder')}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ========== 五、AI功能设置（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.aiReadingAssistant')}</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('settings.aiProvider')}
              </label>
              <select
                value={settings.ai_provider?.value || 'ollama'}
                onChange={(e) => {
                  setSettings((prev) => ({
                    ...prev,
                    ai_provider: { ...prev.ai_provider!, value: e.target.value },
                  }));
                  updateSetting('ai_provider', e.target.value);
                }}
                className="input w-full"
              >
                <option value="ollama">{t('settings.ollamaLocal')}</option>
                <option value="openai">{t('settings.openaiChatGPT')}</option>
                <option value="deepseek">{t('settings.deepseek')}</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('settings.apiUrl')}
                </label>
                {settings.ai_provider?.value === 'ollama' && (
                  <button
                    onClick={testOllamaConnection}
                    disabled={testingConnection || loadingModels}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {testingConnection || loadingModels ? t('settings.testing') : t('settings.testConnection')}
                  </button>
                )}
              </div>
              <input
                type="text"
                className="input w-full"
                value={settings.ai_api_url?.value || 'http://localhost:11434'}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    ai_api_url: { ...prev.ai_api_url!, value: e.target.value },
                  }))
                }
                onBlur={() => updateSetting('ai_api_url', settings.ai_api_url?.value || 'http://localhost:11434')}
                placeholder={t('settings.ollamaApiUrlPlaceholder')}
              />
              {settings.ai_provider?.value === 'ollama' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.ollamaHint')}
                </p>
              )}
              {settings.ai_provider?.value === 'ollama' && ollamaModels.length > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {t('settings.modelsFetched', { count: ollamaModels.length })}
                </p>
              )}
            </div>

            {(settings.ai_provider?.value === 'openai' || settings.ai_provider?.value === 'deepseek') && (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('settings.apiKey')}
                </label>
                <input
                  type="password"
                  className="input w-full"
                  value={settings.ai_api_key?.value || ''}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      ai_api_key: { ...prev.ai_api_key!, value: e.target.value },
                    }))
                  }
                  onBlur={() => updateSetting('ai_api_key', settings.ai_api_key?.value || '')}
                  placeholder={t('settings.enterApiKey')}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t('settings.model')}
              </label>
              {settings.ai_provider?.value === 'ollama' && ollamaModels.length > 0 ? (
                <select
                  value={settings.ai_model?.value || ''}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setSettings((prev) => ({
                      ...prev,
                      ai_model: { ...prev.ai_model!, value },
                    }));
                    if (value) await updateSetting('ai_model', value);
                  }}
                  className="input w-full"
                >
                  <option value="">请选择模型</option>
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="input w-full"
                  value={settings.ai_model?.value || ''}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      ai_model: { ...prev.ai_model!, value: e.target.value },
                    }))
                  }
                  onBlur={() => {
                    const value = settings.ai_model?.value || '';
                    if (value) updateSetting('ai_model', value);
                  }}
                  placeholder={settings.ai_provider?.value === 'ollama' ? 'llama2' : settings.ai_provider?.value === 'openai' ? 'gpt-3.5-turbo' : 'deepseek-chat'}
                />
              )}
            </div>
          </div>
        </div>
        )}

        {/* ========== 六、语音朗读设置（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
              <Volume2 className="w-5 h-5 text-orange-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.ttsServerSettings')}</h2>
          </div>

          <div className="space-y-6">
                <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('settings.ttsServerAddress')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={settings.tts_server_host?.value || '127.0.0.1'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      tts_server_host: { ...prev.tts_server_host!, value: e.target.value },
                    }))
                  }
                  onBlur={() => updateSetting('tts_server_host', settings.tts_server_host?.value || '127.0.0.1')}
                  placeholder={t('settings.ttsServerAddressPlaceholder')}
                />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.ttsServerAddressDesc')}
                  </p>
                </div>

                  <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  {t('settings.ttsServerPort')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  className="input w-32"
                  value={settings.tts_server_port?.value || '5050'}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      tts_server_port: { ...prev.tts_server_port!, value: e.target.value },
                    }))
                  }
                  onBlur={() => updateSetting('tts_server_port', settings.tts_server_port?.value || '5050')}
                  placeholder="5050"
                  min="1"
                  max="65535"
                />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.ttsServerPortDesc')}
                </p>
            </div>

              {/* TTS 默认配置 */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('settings.ttsDefaultConfig')}</h3>
                
                {/* 默认模型 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.defaultTtsEngine')}
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          toast.success(t('settings.refreshingTtsEngines'));
                          await fetchTtsModels();
                          toast.success(t('settings.ttsEnginesRefreshed'));
                        } catch (error: any) {
                          console.error('刷新 TTS 引擎列表失败:', error);
                          toast.error(t('settings.refreshTtsEnginesFailed'));
                        }
                      }}
                      className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      title={t('settings.refreshTtsEnginesTitle')}
                    >
                      🔄 {t('settings.refreshTtsEngines')}
                    </button>
            </div>
              <select
                    className="input"
                    value={settings.tts_default_model?.value || 'edge'}
                onChange={async (e) => {
                      const modelId = e.target.value;
                  setSettings((prev) => ({
                    ...prev,
                        tts_default_model: { ...prev.tts_default_model!, value: modelId },
                      }));
                      updateSetting('tts_default_model', modelId);
                      const voices = await fetchTtsVoices(modelId);
                      if (voices && voices.length > 0) {
                        const currentVoiceId = settings.tts_default_voice?.value;
                        const voiceExists = voices.some((v: any) => v.id === currentVoiceId);
                        if (!voiceExists) {
                          const getVoiceLang = (voice: any): string => {
                            if (voice.lang) return voice.lang;
                            if (voice.locale?.toLowerCase().startsWith('zh')) return 'zh';
                            if (voice.language?.toLowerCase().includes('chinese') || voice.language?.toLowerCase().includes('中文')) return 'zh';
                            if (voice.id?.toLowerCase().startsWith('zh-cn') || voice.id?.toLowerCase().startsWith('zh_')) return 'zh';
                            return 'zh';
                          };
                          const chineseVoice = voices.find((v: any) => getVoiceLang(v) === 'zh') || voices[0];
                          if (chineseVoice) {
                            setSettings((prev) => ({
                              ...prev,
                              tts_default_voice: { ...prev.tts_default_voice!, value: chineseVoice.id },
                            }));
                            updateSetting('tts_default_voice', chineseVoice.id);
                          }
                        }
                      }
                    }}
                    disabled={loadingTtsModels}
                  >
                    {loadingTtsModels ? (
                      <option value="">{t('settings.loadingFromApi')}</option>
                    ) : ttsModels.length === 0 ? (
                      <option value="">{t('settings.noAvailableEngines')}</option>
                    ) : (
                      ttsModels.map((model) => (
                        <option key={model.id} value={model.id} disabled={!model.available}>
                          {model.name} ({model.type === 'online' ? t('settings.online') : t('settings.offline')}) {model.available ? '' : `(${t('settings.unavailable')})`} - {model.description}
                        </option>
                      ))
                    )}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.selectDefaultTtsEngine')}
              </p>
            </div>

                {/* 默认语音 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.defaultVoice')}
              </label>
                <button
                      type="button"
                      onClick={async () => {
                        const currentModel = settings.tts_default_model?.value || 'edge';
                        if (currentModel === 'edge') {
                          try {
                            toast.success(t('settings.refreshingVoices'));
                            await fetchTtsVoices(currentModel);
                            toast.success(t('settings.voicesRefreshed'));
                          } catch (error: any) {
                            console.error('刷新音色列表失败:', error);
                            toast.error(t('settings.refreshVoicesFailed'));
                          }
                        } else {
                          toast.success(t('settings.onlyEdgeTtsSupportsRefresh'));
                        }
                      }}
                      className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      title={t('settings.refreshVoicesTitle')}
                    >
                      🔄 {t('settings.refreshVoices')}
                </button>
              </div>
                  <select
                      className="input"
                    value={settings.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural'}
                    onChange={(e) => {
                        setSettings((prev) => ({
                          ...prev,
                        tts_default_voice: { ...prev.tts_default_voice!, value: e.target.value },
                      }));
                      updateSetting('tts_default_voice', e.target.value);
                    }}
                    disabled={ttsVoices.length === 0}
                  >
                    {ttsVoices.length > 0 ? (
                      (() => {
                        const getVoiceLang = (voice: any): string => {
                          if (voice.lang) return voice.lang;
                          if (voice.locale) {
                            const locale = voice.locale.toLowerCase();
                            if (locale.startsWith('zh')) return 'zh';
                            if (locale.startsWith('en')) return 'en';
                          }
                          if (voice.language) {
                            const lang = voice.language.toLowerCase();
                            if (lang.includes('chinese') || lang.includes('中文')) return 'zh';
                            if (lang.includes('english') || lang.includes('英文')) return 'en';
                          }
                          if (voice.id) {
                            const id = voice.id.toLowerCase();
                            if (id.startsWith('zh-cn') || id.startsWith('zh_')) return 'zh';
                            if (id.startsWith('en-us') || id.startsWith('en_')) return 'en';
                          }
                          return 'zh';
                        };
                        const zhVoices = ttsVoices.filter((v: any) => getVoiceLang(v) === 'zh');
                        const enVoices = ttsVoices.filter((v: any) => getVoiceLang(v) === 'en');
                        return [
                          ...zhVoices.map((voice: any) => (
                            <option key={voice.id} value={voice.id}>
                              {voice.name}
                            </option>
                          )),
                          ...(enVoices.length > 0 ? [
                            <optgroup key="en-group" label={t('settings.englishVoices')}>
                              {enVoices.map((voice: any) => (
                                <option key={voice.id} value={voice.id}>
                                  {voice.name}
                                </option>
                              ))}
                            </optgroup>
                          ] : [])
                        ];
                      })()
                    ) : (
                      <option value="">{t('reader.loading')}</option>
                    )}
                  </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.selectDefaultVoice')}
                    </p>
                  </div>
                  
                {/* 默认语速 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('settings.defaultSpeed')}
                      </label>
                  <div className="flex items-center gap-3">
                        <input
                      type="range"
                      min="0.5"
                      max="3.0"
                      step="0.1"
                      className="flex-1"
                      value={settings.tts_default_speed?.value || '1.0'}
                          onChange={(e) => {
                            setSettings((prev) => ({
                              ...prev,
                          tts_default_speed: { ...prev.tts_default_speed!, value: e.target.value },
                        }));
                      }}
                      onMouseUp={(e) => {
                        updateSetting('tts_default_speed', (e.target as HTMLInputElement).value);
                      }}
                    />
                    <span className="text-sm font-medium w-16 text-right">
                      {settings.tts_default_speed?.value || '1.0'}x
                    </span>
                    </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.defaultSpeedDesc') || '设置默认语速（0.5x - 3.0x）'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== 七、邮件推送设置（仅管理员） ========== */}
        {user?.role === 'admin' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.emailPushSettings')}</h2>
            </div>
            
            <div className="space-y-6">
              {/* 启用邮件推送 */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.email_push_enabled?.value === 'true'}
                    onChange={(e) => {
                      setSettings((prev) => ({
                        ...prev,
                        email_push_enabled: { ...prev.email_push_enabled!, value: e.target.checked ? 'true' : 'false' },
                      }));
                      updateSetting('email_push_enabled', e.target.checked ? 'true' : 'false');
                    }}
                    className="w-5 h-5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{t('settings.enableEmailPush')}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.enableEmailPushDesc')}
                    </p>
                  </div>
                </label>
              </div>

              {settings.email_push_enabled?.value === 'true' && (
                <>
                  {/* SMTP配置 */}
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('settings.smtpServerConfig')}</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        {t('settings.smtpServerAddress')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="input"
                        value={settings.smtp_host?.value || ''}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            smtp_host: { ...prev.smtp_host!, value: e.target.value },
                          }))
                        }
                        onBlur={() => updateSetting('smtp_host', settings.smtp_host?.value || '')}
                        placeholder={t('settings.smtpServerAddressPlaceholder')}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.smtpServerAddressDesc')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        {t('settings.smtpPortRequired')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        className="input w-32"
                        value={settings.smtp_port?.value || '587'}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            smtp_port: { ...prev.smtp_port!, value: e.target.value },
                          }))
                        }
                        onBlur={() => updateSetting('smtp_port', settings.smtp_port?.value || '587')}
                        placeholder="587"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.smtpPortDesc')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        {t('settings.senderEmail')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        className="input"
                        value={settings.smtp_user?.value || ''}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            smtp_user: { ...prev.smtp_user!, value: e.target.value },
                          }))
                        }
                        onBlur={() => updateSetting('smtp_user', settings.smtp_user?.value || '')}
                        placeholder="your-email@example.com"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.senderEmailDesc')}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        {t('settings.smtpPasswordOrAuthCode')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        className="input"
                        value={settings.smtp_password?.value || ''}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            smtp_password: { ...prev.smtp_password!, value: e.target.value },
                          }))
                        }
                        onBlur={() => updateSetting('smtp_password', settings.smtp_password?.value || '')}
                        placeholder={t('settings.smtpPasswordPlaceholder')}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('settings.smtpPasswordDesc')}
                      </p>
                    </div>
                  </div>

                  {/* 测试邮件 */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('settings.testEmailSending')}</h3>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        className="input flex-1"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        placeholder={t('settings.testEmailAddressPlaceholder')}
                        disabled={testingEmail}
                      />
                      <button
                        onClick={async () => {
                          if (!testEmailAddress || !testEmailAddress.includes('@')) {
                            toast.error(t('settings.pleaseEnterValidEmail'));
                            return;
                          }
                          setTestingEmail(true);
                          try {
                            const response = await api.post('/settings/test-email', { email: testEmailAddress });
                            toast.success(t('settings.testEmailSentTo', { email: response.data.sentTo }));
                            setTestEmailAddress('');
                          } catch (error: any) {
                            const errorMsg = error.response?.data?.error || error.response?.data?.message || t('settings.sendTestEmailFailed');
                            const errorDetails = error.response?.data?.details;
                            console.error('发送测试邮件失败:', error.response?.data || error);
                            toast.error(errorDetails ? `${errorMsg} (${errorDetails})` : errorMsg, {
                              duration: 5000, // 显示5秒，让用户有时间阅读
                            });
                          } finally {
                            setTestingEmail(false);
                          }
                        }}
                        disabled={testingEmail || !testEmailAddress || !testEmailAddress.includes('@')}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingEmail ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            {t('settings.sending')}
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            {t('settings.sendTestEmail')}
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {t('settings.testEmailDesc')}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========== 八、安全与访问控制（仅管理员） ========== */}
        {user?.role === 'admin' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.securityAndAccessControl')}</h2>
            </div>
            
            <div className="space-y-6">
              {/* 私有访问密钥设置 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">{t('settings.privateAccessKey')}</h3>
                <div className="space-y-3">
              <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('settings.keySettings')}</label>
                <input
                      type="password"
                  className="input"
                      value={settings.private_access_key?.value || ''}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                          private_access_key: { ...prev.private_access_key!, value: e.target.value },
                    }))
                  }
                      onBlur={() => updateSetting('private_access_key', settings.private_access_key?.value || '')}
                      placeholder={t('settings.leaveEmptyToDisable')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.keyVerificationDesc')}
                </p>
              </div>

                  {settings.private_access_key?.value && settings.private_access_key.value.trim() !== '' && (
                    <div className="pl-4 border-l-2 border-blue-300 dark:border-blue-700 space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                <input
                          type="checkbox"
                          checked={settings.private_key_required_for_login?.value === 'true'}
                    onChange={(e) => {
                      setSettings((prev) => ({
                        ...prev,
                              private_key_required_for_login: { ...prev.private_key_required_for_login!, value: e.target.checked ? 'true' : 'false' },
                            }));
                            updateSetting('private_key_required_for_login', e.target.checked ? 'true' : 'false');
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('settings.requireKeyForLogin')}</span>
                  </label>
                      
                      <label className="flex items-center gap-3 cursor-pointer">
                    <input
                          type="checkbox"
                          checked={settings.private_key_required_for_register?.value === 'true'}
                      onChange={(e) => {
                        setSettings((prev) => ({
                          ...prev,
                              private_key_required_for_register: { ...prev.private_key_required_for_register!, value: e.target.checked ? 'true' : 'false' },
                        }));
                            updateSetting('private_key_required_for_register', e.target.checked ? 'true' : 'false');
                      }}
                          className="w-4 h-4"
                    />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{t('settings.requireKeyForRegister')}</span>
                      </label>
                  </div>
                  )}
                </div>
                </div>

              {/* 注册控制 */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-3">{t('settings.registrationControl')}</h3>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                    checked={settings.registration_enabled?.value === 'true'}
                      onChange={(e) => {
                        setSettings((prev) => ({
                          ...prev,
                        registration_enabled: { ...prev.registration_enabled!, value: e.target.checked ? 'true' : 'false' },
                        }));
                      updateSetting('registration_enabled', e.target.checked ? 'true' : 'false');
                      }}
                      className="w-5 h-5"
                    />
                    <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.allowUserRegistration')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.disableRegistrationDesc')}
                    </div>
                    </div>
                  </label>
                </div>

              {/* IP限制设置 */}
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-3">{t('settings.ipAccessRestriction')}</h3>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('settings.maxFailedAttempts')}
                  </label>
                  <input
                    type="number"
                    className="input w-32"
                    min="1"
                    max="100"
                    value={settings.max_access_attempts?.value || '10'}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        max_access_attempts: { ...prev.max_access_attempts!, value: e.target.value },
                      }))
                    }
                    onBlur={() => updateSetting('max_access_attempts', settings.max_access_attempts?.value || '10')}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.autoBanDesc')}
                  </p>
                </div>
              </div>

              {/* 配置摘要 */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('settings.currentSecurityConfig')}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('settings.privateAccessKeyStatus')}</span>
                    <span className={`font-medium ${settings.private_access_key?.value && settings.private_access_key.value.trim() !== '' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {settings.private_access_key?.value && settings.private_access_key.value.trim() !== '' ? t('settings.set') : t('settings.notSet')}
                    </span>
                    </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('settings.loginRequiresKey')}</span>
                    <span className={`font-medium ${settings.private_key_required_for_login?.value === 'true' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {settings.private_key_required_for_login?.value === 'true' ? t('settings.yes') : t('settings.no')}
                    </span>
                    </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('settings.registerRequiresKey')}</span>
                    <span className={`font-medium ${settings.private_key_required_for_register?.value === 'true' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {settings.private_key_required_for_register?.value === 'true' ? t('settings.yes') : t('settings.no')}
                    </span>
                    </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('settings.allowRegistration')}</span>
                    <span className={`font-medium ${settings.registration_enabled?.value === 'true' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {settings.registration_enabled?.value === 'true' ? t('settings.yes') : t('settings.no')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== 九、系统信息（所有用户） ========== */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Monitor className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('settings.systemInfo') || '系统信息'}</h2>
                        </div>

          <div className="space-y-6">
            {/* 系统版本号 */}
            <div className="pb-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                            <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('settings.frontendVersion')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.frontendBuildTime') || '前端构建版本号'}
                  </p>
                            </div>
                <div className="text-right">
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-blue-600 dark:text-blue-400">
                    {import.meta.env.VITE_BUILD_VERSION || t('reader.unknownVersion')}
                  </code>
                </div>
              </div>
              {import.meta.env.VITE_BUILD_TIME && (
                <div className="flex items-center justify-between">
                            <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('settings.frontendBuildTime')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.frontendBuildTimeDesc')}
                    </p>
                            </div>
                  <div className="text-right">
                    <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-gray-600 dark:text-gray-400">
                      {new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </code>
                        </div>
                      </div>
              )}
              <div className="flex items-center justify-between">
                            <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('settings.backendVersion')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.backendVersionDesc')}
                  </p>
                        </div>
                <div className="text-right">
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-green-600 dark:text-green-400">
                    {backendVersion || t('common.loading')}
                  </code>
                </div>
              </div>
              {backendBuildTime && (
                <div className="flex items-center justify-between">
                            <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('settings.backendBuildTime')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('settings.backendBuildTimeDesc')}
                    </p>
                            </div>
                  <div className="text-right">
                    <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-gray-600 dark:text-gray-400">
                      {new Date(backendBuildTime).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { 
                        year: 'numeric', 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </code>
                        </div>
                      </div>
                    )}
                  </div>

            {/* OPDS功能（仅管理员） */}
            {user?.role === 'admin' && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.opds_enabled?.value === 'true'}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      opds_enabled: { ...prev.opds_enabled!, value: e.target.checked ? 'true' : 'false' },
                    }));
                    updateSetting('opds_enabled', e.target.checked ? 'true' : 'false');
                  }}
                  className="w-5 h-5"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{t('settings.opdsEnabled')}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.opdsDesc')}
                </p>
              </div>
              </label>
              {settings.opds_enabled?.value === 'true' && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs font-medium mb-1">OPDS地址:</p>
                  <code className="text-xs bg-white dark:bg-gray-800 p-2 rounded block break-all">
                    {window.location.origin}/opds/
                  </code>
            </div>
              )}
          </div>
        )}

            {/* 缓存清理 */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">{t('settings.cache')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('settings.currentCacheSize')}: <span className="font-semibold">{formatCacheSize(cacheSize)}</span>
                  </p>
                </div>
                <button
                  onClick={handleClearCache}
                  disabled={clearingCache || cacheSize === 0}
                  className="btn btn-danger text-sm"
                >
                  {clearingCache ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('settings.clearing')}
                    </>
                  ) : (
                    <>
                      <Trash className="w-4 h-4" />
                      {t('settings.clearCache')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* 书籍类型编辑模态框 */}
      {showCategoryEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editingCategory ? t('settings.editCategory') : t('settings.addCategory')}
              </h2>
              <button
                onClick={() => {
                  setShowCategoryEditModal(false);
                  setEditingCategory(null);
                  setCategoryForm({ name: '', display_order: 0 });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('settings.categoryName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder={t('settings.categoryNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                {t('settings.displayOrder')}
                </label>
                <input
                  type="number"
                  value={categoryForm.display_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) || 0 })}
                placeholder={t('settings.displayOrderPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowCategoryEditModal(false);
                    setEditingCategory(null);
                    setCategoryForm({ name: '', display_order: 0 });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                {t('common.cancel')}
                </button>
                <button
                  onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                {editingCategory ? t('common.save') : t('common.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
