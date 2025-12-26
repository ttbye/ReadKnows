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
import { Settings as SettingsIcon, Folder, Scan, CheckCircle, XCircle, Upload, Trash2, Type, Shield, Users, BookOpen, Trash, Sparkles, Sun, Moon, Monitor, Mail, Send, Plus, Edit, X, Volume2 } from 'lucide-react';
import { offlineStorage } from '../utils/offlineStorage';
import { useTheme } from '../hooks/useTheme';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string;
}

export default function Settings() {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
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
  }, [settings.tts_default_model, settings.system_language, ttsModels.length, user?.role]);

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
        toast.error('TTS 服务未返回可用模型，请检查 TTS 服务是否正常运行');
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
      toast.error(`获取TTS模型列表失败: ${error.response?.data?.error || error.message || '未知错误'}`);
    } finally {
      setLoadingTtsModels(false);
    }
  };

  // 获取TTS语音列表
  const fetchTtsVoices = async (modelId: string) => {
    try {
      // 获取系统语言设置
      const systemLanguage = settings.system_language?.value || 'zh-CN';
      const langParam = systemLanguage === 'zh-CN' ? 'zh' : 'en';
      
      const response = await api.get('/tts/voices', { 
        params: { 
          model: modelId,
          lang: langParam  // 传递语言参数，后端会根据此参数筛选音色
        } 
      });

      
      // 后端返回格式: {model: string, voices: array}
      const voices = response.data?.voices || response.data || [];
      if (!Array.isArray(voices)) {
        setTtsVoices([]);
        return [];
      }
      
      setTtsVoices(voices);
      return voices; // 返回语音列表，方便调用者使用
    } catch (error: any) {
      console.error('获取TTS语音列表失败:', error);
      console.error('错误详情:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setTtsVoices([]);
      return []; // 返回空数组
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

  // 获取书籍类型列表
  const fetchBookCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await api.get('/settings/book-categories');
      setBookCategories(response.data.categories || []);
    } catch (error) {
      console.error('获取书籍类型列表失败:', error);
      toast.error('获取书籍类型列表失败');
    } finally {
      setLoadingCategories(false);
    }
  };

  // 创建书籍类型
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
      toast.success('书籍类型创建成功');
      setShowCategoryEditModal(false);
      setCategoryForm({ name: '', display_order: 0 });
      await fetchBookCategories();
    } catch (error: any) {
      console.error('创建书籍类型失败:', error);
      toast.error(error.response?.data?.error || '创建失败');
    }
  };

  // 更新书籍类型
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
      toast.success('书籍类型更新成功');
      setShowCategoryEditModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', display_order: 0 });
      await fetchBookCategories();
    } catch (error: any) {
      console.error('更新书籍类型失败:', error);
      toast.error(error.response?.data?.error || '更新失败');
    }
  };

  // 删除书籍类型
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除书籍类型"${name}"吗？`)) {
      return;
    }

    try {
      await api.delete(`/settings/book-categories/${id}`);
      toast.success('书籍类型删除成功');
      await fetchBookCategories();
    } catch (error: any) {
      console.error('删除书籍类型失败:', error);
      toast.error(error.response?.data?.error || '删除失败');
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
      setBackendVersion(response.data.version || '未知版本');
      setBackendBuildTime(response.data.buildTime || '');
    } catch (error) {
      console.error('获取后端版本号失败:', error);
      setBackendVersion('未知版本');
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
    if (!confirm('确定要清除所有缓存吗？这将删除所有离线缓存的书籍文件和阅读位置数据。')) {
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
      toast.success(`缓存已清除！已删除 ${keysToRemove.length} 个阅读位置记录`);
    } catch (error: any) {
      console.error('清除缓存失败:', error);
      toast.error(error.message || '清除缓存失败');
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
          // 自动保存到数据库
          await updateSetting('ai_model', firstModel);
          console.log('[Settings] 已自动保存模型名称:', firstModel);
        }
        
        if (showToast) {
          if (models.length > 0) {
            toast.success(`成功获取 ${models.length} 个模型${(!settings.ai_model?.value || settings.ai_model.value.trim() === '') ? '，已自动选择第一个模型' : ''}`);
          } else {
            // 如果没有警告信息，才显示这个错误
            if (!response.data.warning) {
              toast.error('连接成功，但未找到可用模型。请确保 Ollama 已安装模型。');
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
      toast.error('请先输入API地址');
      return;
    }

    // 基本URL格式验证
    try {
      const url = new URL(apiUrl);
      if (!url.protocol || !url.hostname) {
        toast.error('API地址格式不正确，请使用 http:// 或 https:// 开头');
        return;
      }
    } catch (e) {
      toast.error('API地址格式不正确，请输入有效的URL');
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
      let errorMessage = '测试连接失败';
      
      if (error.response) {
        // 服务器返回了错误响应
        const status = error.response.status;
        const statusText = error.response.statusText;
        
        // 处理 502 Bad Gateway（nginx 无法连接到上游服务器）
        if (status === 502) {
          errorMessage = '502 Bad Gateway: nginx 无法连接到 Ollama 服务器\n\n';
          errorMessage += '可能的原因：\n';
          errorMessage += '1. 前端容器的 OLLAMA_URL 环境变量配置不正确\n';
          errorMessage += '2. Ollama 服务器无法从 Docker 容器访问\n';
          errorMessage += '3. Ollama 服务器未运行或地址/端口错误\n';
          errorMessage += '4. 防火墙阻止了连接\n\n';
          errorMessage += '解决步骤：\n';
          errorMessage += '1. 检查 OLLAMA_URL: docker exec readknows-frontend env | grep OLLAMA_URL\n';
          errorMessage += '2. 检查前端容器日志: docker logs readknows-frontend\n';
          errorMessage += '3. 在 docker-compose.yml 中设置正确的 OLLAMA_URL\n';
          errorMessage += '4. 重启前端容器: docker-compose restart frontend';
        } else if (status === 404) {
          errorMessage = '404 Not Found: Ollama API 端点不存在，请检查地址和端口是否正确';
        } else {
          errorMessage = error.response.data?.error || `HTTP ${status}: ${statusText}`;
        }
      } else if (error.request) {
        // 请求已发出但没有收到响应
        if (error.code === 'ECONNREFUSED') {
          errorMessage = '连接被拒绝，请检查 Ollama 服务器是否运行，以及地址和端口是否正确';
        } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
          errorMessage = '无法解析主机名，请检查地址是否正确';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
          errorMessage = '连接超时，请检查网络连接和防火墙设置';
        } else {
          errorMessage = `网络错误: ${error.message || error.code || '未知错误'}`;
        }
      } else {
        // 其他错误
        errorMessage = error.message || '测试连接失败';
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
          toast.error('获取设置失败');
        }
      } else if (error.statusText === 'OK (Offline Cache)') {
        // 使用缓存数据
        const cachedSettings = error.data?.settings || {};
        setSettings(cachedSettings);
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
      toast.success('字体上传成功');
      await fetchFonts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '字体上传失败');
    } finally {
      setUploadingFont(false);
      e.target.value = '';
    }
  };

  const handleDeleteFont = async (fontId: string) => {
    if (!confirm('确定要删除这个字体吗？')) return;
    try {
      await api.delete(`/fonts/${fontId}`);
      toast.success('字体已删除');
      await fetchFonts();
    } catch (error: any) {
      toast.error(error.response?.data?.error || '删除失败');
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
      toast.success('阅读器偏好已保存');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '保存失败');
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
      toast.success('已取消选择，将使用默认阅读器');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '删除失败');
    }
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      await api.put(`/settings/${key}`, { value });
      // 不立即刷新设置，避免重复请求
      // await fetchSettings();
      toast.success('设置已保存');
    } catch (error: any) {
      toast.error(error.response?.data?.error || '保存失败');
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
      toast.error('请先设置书籍扫描路径');
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
        <p className="text-gray-500">请先登录</p>
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
    <div className="max-w-4xl mx-auto">
      <div className="space-y-6">
        {/* ========== 管理图书（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">管理图书</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => window.location.href = '/books-management'}
              className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <BookOpen className="w-6 h-6 text-green-600 dark:text-green-400" />
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white">图书管理</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">管理书籍公有/私有状态</div>
              </div>
            </button>
            
            <button
              onClick={() => window.location.href = '/category-management'}
              className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <Type className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white">图书类型管理</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">管理书籍分类类型</div>
              </div>
            </button>
          </div>
        </div>
        )}

        {/* ========== 书籍扫描（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Folder className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">书籍扫描</h2>
          </div>
          
          <div className="space-y-6">
            {/* 存储路径 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                书籍存储路径
              </label>
              <input
                type="text"
                className="input"
                value={storagePath}
                onChange={(e) => handlePathChange('books_storage_path', e.target.value)}
                onBlur={() => updateSetting('books_storage_path', storagePath)}
                placeholder="例如: ./books 或 /path/to/books"
              />
              {storageValidation && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  {storageValidation.exists && storageValidation.isDirectory ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-green-600 dark:text-green-400">
                        路径有效 {storageValidation.isWritable ? '(可写)' : '(只读)'}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <span className="text-red-600 dark:text-red-400">
                        {storageValidation.error || '路径无效或不存在'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 扫描路径 */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                书籍扫描路径
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  value={scanPath}
                  onChange={(e) => handlePathChange('books_scan_path', e.target.value)}
                  onBlur={() => updateSetting('books_scan_path', scanPath)}
                  placeholder="例如: /path/to/scan"
                />
                <button
                  onClick={handleScan}
                  disabled={scanning || !scanPath}
                  className="btn btn-primary whitespace-nowrap"
                >
                  {scanning ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      扫描中
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4" />
                      扫描
                    </>
                  )}
                </button>
              </div>
              {scanValidation && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  {scanValidation.exists && scanValidation.isDirectory ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">路径有效</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-red-600">{scanValidation.error || '路径无效或不存在'}</span>
                    </>
                  )}
                </div>
              )}
              {scanResult && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                  <div className="flex gap-4">
                    <span>总计: {scanResult.total}</span>
                    <span className="text-green-600 dark:text-green-400">导入: {scanResult.imported}</span>
                    <span className="text-yellow-600 dark:text-yellow-400">跳过: {scanResult.skipped}</span>
                    {scanResult.errors > 0 && (
                      <span className="text-red-600 dark:text-red-400">错误: {scanResult.errors}</span>
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
                <span className="text-sm">扫描时自动将TXT转换为EPUB</span>
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
                <span className="text-sm">扫描时自动将MOBI转换为EPUB</span>
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
                <span className="text-sm">扫描时自动获取豆瓣信息</span>
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
                    placeholder="豆瓣API地址"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ========== 阅读设置 ========== */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">阅读设置</h2>
          </div>

          <div className="space-y-6">
            {/* EPUB阅读器选择 */}
            {loadingPreferences ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium">EPUB 阅读器</label>
                  {readerPreferences.epub && (
                    <button
                      onClick={() => deleteReaderPreference('epub')}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      使用默认
                    </button>
                  )}
                </div>
                {!readerPreferences.epub && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-600 dark:text-blue-400">
                    当前使用默认值：epub.js
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'epubjs', label: 'epub.js', desc: '默认' },
                    { value: 'custom', label: '自定义解析器', desc: '无iframe问题' },
                  ].map((option) => {
                    const currentReader = readerPreferences.epub?.readerType || 'epubjs';
                    const isSelected = currentReader === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="epub-reader"
                          value={option.value}
                          checked={isSelected}
                          onChange={() => updateReaderPreference('epub', option.value)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{option.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{option.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 字体管理 */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <Type className="w-4 h-4 text-blue-600" />
                <label className="block text-sm font-medium">字体管理</label>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors text-sm">
                  <Upload className="w-4 h-4" />
                  <span>{uploadingFont ? '上传中...' : '上传字体'}</span>
                  <input
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    onChange={handleFontUpload}
                    disabled={uploadingFont}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  支持 .ttf, .otf, .woff, .woff2
                </span>
              </div>
              {fonts.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {fonts.map((font) => (
                    <div
                      key={font.id}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{font.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {font.file_type.toUpperCase()} · {(font.file_size / 1024).toFixed(2)} KB
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteFont(font.id)}
                        className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========== AI功能（仅管理员） ========== */}
        {user?.role === 'admin' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">AI阅读助手</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                AI提供商
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
                <option value="ollama">Ollama (本地)</option>
                <option value="openai">OpenAI (ChatGPT)</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API地址
                </label>
                {settings.ai_provider?.value === 'ollama' && (
                  <button
                    onClick={testOllamaConnection}
                    disabled={testingConnection || loadingModels}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {testingConnection || loadingModels ? '测试中...' : '测试连接'}
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
                placeholder="http://localhost:11434 或 http://192.168.6.20:11434"
              />
              {settings.ai_provider?.value === 'ollama' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  提示：
                  <br />• 如果 Ollama 在宿主机上，使用：http://host.docker.internal:11434
                  <br />• 如果 Ollama 在局域网其他机器上，使用实际 IP 地址，如：http://192.168.6.20:11434
                  <br />• <strong>重要：</strong>在 Docker 部署中，后端会通过前端容器的 nginx 代理访问 Ollama
                  <br />• 请确保在 docker-compose.yml 中配置了前端容器的 OLLAMA_URL 环境变量
                  <br />• OLLAMA_URL 应该与系统设置中的 API 地址一致
                  <br />• 例如：OLLAMA_URL=http://host.docker.internal:11434 或 OLLAMA_URL=http://192.168.6.20:11434
                  <br />• 配置后需要重启前端容器：docker-compose restart frontend
                </p>
              )}
              {settings.ai_provider?.value === 'ollama' && ollamaModels.length > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✓ 已获取 {ollamaModels.length} 个可用模型
                </p>
              )}
            </div>

            {(settings.ai_provider?.value === 'openai' || settings.ai_provider?.value === 'deepseek') && (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  API密钥
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
                  placeholder="输入API密钥"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                模型名称
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

        {/* ========== 系统功能 ========== */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Monitor className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">系统功能</h2>
          </div>

          <div className="space-y-6">
            {/* 系统版本号 */}
            <div className="pb-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">前端版本</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    前端构建版本号
                  </p>
                </div>
                <div className="text-right">
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-blue-600 dark:text-blue-400">
                    {import.meta.env.VITE_BUILD_VERSION || '未知版本'}
                  </code>
                </div>
              </div>
              {import.meta.env.VITE_BUILD_TIME && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">前端编译时间</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      前端构建时间
                    </p>
                  </div>
                  <div className="text-right">
                    <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-gray-600 dark:text-gray-400">
                      {new Date(import.meta.env.VITE_BUILD_TIME).toLocaleString('zh-CN', { 
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
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">后端版本</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    后端构建版本号
                  </p>
                </div>
                <div className="text-right">
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-green-600 dark:text-green-400">
                    {backendVersion || '加载中...'}
                  </code>
                </div>
              </div>
              {backendBuildTime && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">后端编译时间</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      后端构建时间
                    </p>
                  </div>
                  <div className="text-right">
                    <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-gray-600 dark:text-gray-400">
                      {new Date(backendBuildTime).toLocaleString('zh-CN', { 
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
            {/* 主题设置 */}
            <div>
              <label className="block text-sm font-medium mb-3">主题模式</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'system', label: '自动', icon: Monitor },
                  { value: 'light', label: '亮色', icon: Sun },
                  { value: 'dark', label: '暗色', icon: Moon },
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

            {/* 系统语言设置 */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                系统语言
              </label>
              <select
                className="input w-full"
                value={settings.system_language?.value || 'zh-CN'}
                onChange={async (e) => {
                  const newLanguage = e.target.value;
                  setSettings((prev) => ({
                    ...prev,
                    system_language: { ...prev.system_language!, value: newLanguage },
                  }));
                  await updateSetting('system_language', newLanguage);
                  // 切换语言后，重新获取音色列表（根据新语言筛选）
                  const defaultModel = settings.tts_default_model?.value || 'edge';
                  if (defaultModel) {
                    await fetchTtsVoices(defaultModel);
                  }
                }}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                选择系统语言，音色列表将根据所选语言进行筛选
              </p>
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
                  <span className="text-sm font-medium">启用OPDS协议</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    允许其他阅读器通过OPDS访问书库
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
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">缓存管理</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    当前缓存大小: <span className="font-semibold">{formatCacheSize(cacheSize)}</span>
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
                      清除中
                    </>
                  ) : (
                    <>
                      <Trash className="w-4 h-4" />
                      清除缓存
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========== 安全设置（仅管理员） ========== */}
        {user?.role === 'admin' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">安全与访问控制</h2>
            </div>
            
            <div className="space-y-6">
              {/* 私有访问密钥设置 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">私有访问密钥</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">密钥设置</label>
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
                      placeholder="留空则不启用私有访问密钥"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      设置后，访问系统需要先验证此密钥。留空则不启用密钥验证。
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
                        <span className="text-sm text-gray-700 dark:text-gray-300">登录时需要验证密钥</span>
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
                        <span className="text-sm text-gray-700 dark:text-gray-300">注册时需要验证密钥（默认启用）</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 注册控制 */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-3">注册控制</h3>
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
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">允许用户注册</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      关闭后，新用户将无法注册账号
                    </div>
                  </div>
                </label>
              </div>
              
              {/* IP限制设置 */}
              <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-100 mb-3">IP访问限制</h3>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    最大失败尝试次数
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
                    超过此次数后，该IP将被自动封禁
                  </p>
                </div>
              </div>
              
              {/* 配置摘要 */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">当前安全配置</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">私有访问密钥:</span>
                    <span className={`font-medium ${settings.private_access_key?.value && settings.private_access_key.value.trim() !== '' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {settings.private_access_key?.value && settings.private_access_key.value.trim() !== '' ? '已设置' : '未设置'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">登录需要密钥:</span>
                    <span className={`font-medium ${settings.private_key_required_for_login?.value === 'true' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {settings.private_key_required_for_login?.value === 'true' ? '是' : '否'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">注册需要密钥:</span>
                    <span className={`font-medium ${settings.private_key_required_for_register?.value === 'true' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {settings.private_key_required_for_register?.value === 'true' ? '是' : '否'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">允许注册:</span>
                    <span className={`font-medium ${settings.registration_enabled?.value === 'true' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {settings.registration_enabled?.value === 'true' ? '是' : '否'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== 邮件推送设置（仅管理员） ========== */}
        {user?.role === 'admin' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <Mail className="w-5 h-5 text-orange-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">邮件推送设置</h2>
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
                    <span className="text-sm font-medium">启用邮件推送功能</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      启用后，用户可以将书籍推送到Kindle或其他邮箱
                    </p>
                  </div>
                </label>
              </div>

              {settings.email_push_enabled?.value === 'true' && (
                <>
                  {/* SMTP配置 */}
                  <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">SMTP服务器配置</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        SMTP服务器地址 <span className="text-red-500">*</span>
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
                        placeholder="例如：smtp.gmail.com 或 smtp.qq.com"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        常用邮箱SMTP地址：Gmail (smtp.gmail.com), QQ邮箱 (smtp.qq.com), 163邮箱 (smtp.163.com)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        SMTP端口 <span className="text-red-500">*</span>
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
                        常用端口：587 (TLS), 465 (SSL), 25 (不推荐)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        发送方邮箱地址 <span className="text-red-500">*</span>
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
                        此邮箱地址将显示在推送模态框中，用户需要在Kindle中允许接收此邮箱的邮件
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        SMTP密码/授权码 <span className="text-red-500">*</span>
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
                        placeholder="输入邮箱密码或授权码"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        注意：部分邮箱（如Gmail、QQ邮箱）需要使用授权码而非登录密码
                      </p>
                    </div>
                  </div>

                  {/* 测试邮件 */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">测试邮件发送</h3>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        className="input flex-1"
                        value={testEmailAddress}
                        onChange={(e) => setTestEmailAddress(e.target.value)}
                        placeholder="输入测试邮箱地址"
                        disabled={testingEmail}
                      />
                      <button
                        onClick={async () => {
                          if (!testEmailAddress || !testEmailAddress.includes('@')) {
                            toast.error('请输入有效的邮箱地址');
                            return;
                          }
                          setTestingEmail(true);
                          try {
                            const response = await api.post('/settings/test-email', { email: testEmailAddress });
                            toast.success(`测试邮件已发送到 ${response.data.sentTo}`);
                            setTestEmailAddress('');
                          } catch (error: any) {
                            const errorMsg = error.response?.data?.error || error.response?.data?.message || '发送测试邮件失败';
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
                            发送中...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            发送测试邮件
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      发送测试邮件以验证SMTP配置是否正确
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========== 语音朗读服务器设置（仅管理员） ========== */}
        {user?.role === 'admin' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Volume2 className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">语音朗读服务器设置</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  TTS 服务器地址 <span className="text-red-500">*</span>
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
                  placeholder="例如：127.0.0.1"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  部署 TTS 服务的服务器 IP 地址或域名
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  TTS 服务器端口 <span className="text-red-500">*</span>
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
                  TTS 服务监听的端口号（默认：5050）
                </p>
              </div>

              {/* TTS 默认配置 */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">TTS 默认配置</h3>
                
                {/* 默认模型 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      默认 TTS 引擎
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          toast.success('正在从 API 刷新 TTS 引擎列表...');
                          await fetchTtsModels();
                          toast.success('TTS 引擎列表已刷新');
                        } catch (error: any) {
                          console.error('刷新 TTS 引擎列表失败:', error);
                          toast.error('刷新 TTS 引擎列表失败');
                        }
                      }}
                      className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      title="从 API 刷新 TTS 引擎列表"
                    >
                      🔄 刷新
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
                      // 切换模型时，重新获取该模型的语音列表
                      const voices = await fetchTtsVoices(modelId);
                      // 如果当前默认语音不在新模型的语音列表中，重置为该模型的默认语音
                      // 注意：不同TTS引擎的语音ID格式完全不同，切换引擎时必须使用对应引擎的语音ID
                      if (voices && voices.length > 0) {
                        const currentVoiceId = settings.tts_default_voice?.value;
                        const voiceExists = voices.some((v: any) => v.id === currentVoiceId);
                        
                        if (!voiceExists) {
                          // 当前语音ID不匹配新引擎，使用新引擎的默认语音
                          // 辅助函数：从音色对象推断语言
                          const getVoiceLang = (voice: any): string => {
                            if (voice.lang) return voice.lang;
                            if (voice.locale?.toLowerCase().startsWith('zh')) return 'zh';
                            if (voice.language?.toLowerCase().includes('chinese') || voice.language?.toLowerCase().includes('中文')) return 'zh';
                            if (voice.id?.toLowerCase().startsWith('zh-cn') || voice.id?.toLowerCase().startsWith('zh_')) return 'zh';
                            return 'zh'; // 默认返回中文
                          };
                          const chineseVoice = voices.find((v: any) => getVoiceLang(v) === 'zh') || voices[0];
                          if (chineseVoice) {
                            console.log(`[TTS设置] 切换引擎：${settings.tts_default_model?.value} -> ${modelId}`);
                            console.log(`[TTS设置] 语音ID不匹配，重置为: ${currentVoiceId} -> ${chineseVoice.id}`);
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
                      <option value="">正在从 API 加载...</option>
                    ) : ttsModels.length === 0 ? (
                      <option value="">暂无可用引擎（请点击刷新按钮或检查 TTS 服务）</option>
                    ) : (
                      ttsModels.map((model) => (
                        <option key={model.id} value={model.id} disabled={!model.available}>
                          {model.name} ({model.type === 'online' ? '在线' : '离线'}) {model.available ? '' : '(不可用)'} - {model.description}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    选择默认使用的 TTS 引擎
                  </p>
                </div>

                {/* 默认语音 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    默认语音
                  </label>
                    <button
                      type="button"
                      onClick={async () => {
                        const currentModel = settings.tts_default_model?.value || 'edge';
                        if (currentModel === 'edge') {
                          try {
                            toast.success('正在从在线服务刷新音色列表...');
                            await fetchTtsVoices(currentModel);
                            toast.success('音色列表已刷新');
                          } catch (error: any) {
                            console.error('刷新音色列表失败:', error);
                            toast.error('刷新音色列表失败');
                          }
                        } else {
                          toast.success('只有 Edge-TTS 支持在线刷新音色列表');
                        }
                      }}
                      className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      title="从在线服务刷新音色列表（仅 Edge-TTS）"
                    >
                      🔄 刷新
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
                        // 辅助函数：从音色对象推断语言
                        const getVoiceLang = (voice: any): string => {
                          // 优先使用 lang 字段
                          if (voice.lang) return voice.lang;
                          // 从 locale 推断（如 zh-CN, en-US）
                          if (voice.locale) {
                            const locale = voice.locale.toLowerCase();
                            if (locale.startsWith('zh')) return 'zh';
                            if (locale.startsWith('en')) return 'en';
                          }
                          // 从 language 字段推断
                          if (voice.language) {
                            const lang = voice.language.toLowerCase();
                            if (lang.includes('chinese') || lang.includes('中文')) return 'zh';
                            if (lang.includes('english') || lang.includes('英文')) return 'en';
                          }
                          // 从 id 推断（如 zh-CN-XiaoxiaoNeural）
                          if (voice.id) {
                            const id = voice.id.toLowerCase();
                            if (id.startsWith('zh-cn') || id.startsWith('zh_')) return 'zh';
                            if (id.startsWith('en-us') || id.startsWith('en_')) return 'en';
                          }
                          return 'zh'; // 默认返回中文
                        };
                        
                        // 按语言分组：先显示中文，再显示英文
                        const zhVoices = ttsVoices.filter((v: any) => getVoiceLang(v) === 'zh');
                        const enVoices = ttsVoices.filter((v: any) => getVoiceLang(v) === 'en');
                        
                        
                        return [
                          ...zhVoices.map((voice: any) => (
                        <option key={voice.id} value={voice.id}>
                              {voice.name}
                        </option>
                          )),
                          ...(enVoices.length > 0 ? [
                            <optgroup key="en-group" label="--- 英文音色 ---">
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
                      <option value="">加载中...</option>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    选择默认使用的语音（根据选择的引擎显示可用语音）
                  </p>
                </div>

                {/* 默认语速 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    默认语速
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
                    设置默认语速（0.5x - 3.0x）
                  </p>
                </div>

                {/* 自动角色识别 */}
                <div className="mb-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.tts_auto_role?.value === 'true'}
                      onChange={(e) => {
                        setSettings((prev) => ({
                          ...prev,
                          tts_auto_role: { ...prev.tts_auto_role!, value: e.target.checked ? 'true' : 'false' },
                        }));
                        updateSetting('tts_auto_role', e.target.checked ? 'true' : 'false');
                      }}
                      className="w-5 h-5"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">启用自动角色识别</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        自动识别文本中的角色（旁白/对话）并选择合适的语音
                      </p>
                    </div>
                  </label>
                </div>

                {/* 音频测试内容样本 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    音频测试内容样本
                  </label>
                  <textarea
                    className="input min-h-[80px]"
                    value={settings.tts_test_sample?.value || 'Hello, 你好！This is a test. 这是一个测试。'}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        tts_test_sample: { ...prev.tts_test_sample!, value: e.target.value },
                      }))
                    }
                    onBlur={() => updateSetting('tts_test_sample', settings.tts_test_sample?.value || 'Hello, 你好！This is a test. 这是一个测试。')}
                    placeholder="例如：Hello, 你好！This is a test. 这是一个测试。"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    用于TTS测试的文本内容，建议使用中英文混读的文本以测试语音切换效果
                  </p>
                </div>
              </div>

              {/* 测试 TTS 服务 */}
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">测试 TTS 服务</h3>
                
                {/* 显示当前使用的配置 */}
                <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                  <div className="space-y-1 text-gray-700 dark:text-gray-300">
                    <div>
                      <strong>测试引擎:</strong>{' '}
                      {(() => {
                        const modelId = settings.tts_default_model?.value || 'edge';
                        const model = ttsModels.find(m => m.id === modelId);
                        return model ? `${model.name} (${model.type === 'online' ? '在线' : '离线'})` : modelId;
                      })()}
                    </div>
                    <div>
                      <strong>测试音色:</strong>{' '}
                      {(() => {
                        const voiceId = settings.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
                        const voice = ttsVoices.find(v => v.id === voiceId);
                        if (voice) {
                          return `${voice.name} ${voice.gender ? `(${voice.gender === 'male' ? '男' : '女'})` : ''} ${voice.style ? `- ${voice.style}` : ''}`;
                        }
                        return voiceId;
                      })()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      💡 测试将使用上方"默认 TTS 引擎"和"默认语音"的配置
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={async () => {
                    // 停止之前的音频播放
                    if (ttsTestAudio) {
                      ttsTestAudio.pause();
                      ttsTestAudio.currentTime = 0;
                      setTtsTestAudio(null);
                    }
                    
                    setTestingTTS(true);
                    setTtsTestResult(null);
                    try {
                      // 直接使用系统默认配置进行测试
                      const selectedModel = settings.tts_default_model?.value || 'edge';
                      const selectedVoice = settings.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
                      // 使用系统设置的测试样本
                      const testText = settings.tts_test_sample?.value || '你好，这是一个TTS测试。';
                      
                      console.log(`[TTS测试] 使用配置: model=${selectedModel}, voice=${selectedVoice}, text="${testText.substring(0, 50)}${testText.length > 50 ? '...' : ''}"`);
                      
                      const response = await api.post('/tts/test', {
                        voice: selectedVoice,
                        text: testText,
                        model: selectedModel  // 传递模型参数，确保使用正确的引擎
                      });
                      setTtsTestResult(response.data);
                      
                      // 检查响应是否成功
                      if (!response.data.success) {
                        const errorMsg = response.data.error || response.data.message || '测试 TTS 服务失败';
                        const errorDetails = response.data.details;
                        toast.error(errorDetails ? `${errorMsg} (${errorDetails})` : errorMsg, {
                          duration: 5000,
                        });
                        return;
                      }
                      
                      if (response.data.success && response.data.synthesis?.works) {
                        toast.success('TTS 服务测试成功！正在播放测试音频...');
                        
                        // 如果返回了音频数据，自动播放
                        if (response.data.audioData) {
                          try {
                            // 将base64转换为Blob
                            const base64Data = response.data.audioData;
                            const binaryString = atob(base64Data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                              bytes[i] = binaryString.charCodeAt(i);
                            }
                            const blob = new Blob([bytes], { type: 'audio/mpeg' });
                            const audioUrl = URL.createObjectURL(blob);
                            
                            // 创建Audio对象并播放
                            const audio = new Audio(audioUrl);
                            setTtsTestAudio(audio);
                            
                            audio.onended = () => {
                              URL.revokeObjectURL(audioUrl);
                              setTtsTestAudio(null);
                            };
                            
                            audio.onerror = (e) => {
                              console.error('音频播放失败:', e);
                              toast.error('音频播放失败');
                              URL.revokeObjectURL(audioUrl);
                              setTtsTestAudio(null);
                            };
                            
                            await audio.play();
                          } catch (audioError: any) {
                            console.error('播放测试音频失败:', audioError);
                            toast.error('播放测试音频失败: ' + (audioError.message || '未知错误'));
                          }
                        }
                      } else {
                        toast.error(response.data.message || 'TTS 服务测试完成，但部分功能可能异常', {
                          duration: 5000,
                        });
                      }
                    } catch (error: any) {
                      const errorMsg = error.response?.data?.error || error.response?.data?.message || '测试 TTS 服务失败';
                      const errorDetails = error.response?.data?.details;
                      console.error('测试 TTS 服务失败:', error.response?.data || error);
                      setTtsTestResult({ 
                        success: false, 
                        error: errorMsg,
                        details: errorDetails 
                      });
                      toast.error(errorDetails ? `${errorMsg} (${errorDetails})` : errorMsg, {
                        duration: 5000,
                      });
                    } finally {
                      setTestingTTS(false);
                    }
                  }}
                  disabled={testingTTS}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingTTS ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      测试中...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      测试 TTS 服务
                    </>
                  )}
                </button>
                
                {ttsTestResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    ttsTestResult.success && ttsTestResult.synthesis?.works
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
                  }`}>
                    {ttsTestResult.success && ttsTestResult.synthesis?.works ? (
                      <div>
                        <div className="font-semibold mb-1 flex items-center gap-2">
                          ✅ 测试成功
                          {ttsTestAudio && (
                            <span className="text-xs font-normal opacity-70 flex items-center gap-1">
                              <Volume2 className="w-3 h-3" />
                              正在播放...
                            </span>
                          )}
                        </div>
                        <div className="text-xs opacity-80 space-y-1">
                          <div><strong>服务器地址:</strong> {ttsTestResult.ttsBaseUrl}</div>
                          <div><strong>健康检查:</strong> 正常</div>
                          <div><strong>语音列表:</strong> {ttsTestResult.voices?.available ? '可用' : '不可用'}</div>
                          <div><strong>合成功能:</strong> 正常</div>
                          {ttsTestResult.synthesis?.model && (
                            <div>
                              <strong>TTS 引擎:</strong> {(() => {
                                const modelId = ttsTestResult.synthesis.model;
                                const model = ttsModels.find(m => m.id === modelId);
                                return model ? `${model.name} (${model.type === 'online' ? '在线' : '离线'})` : modelId;
                              })()}
                            </div>
                          )}
                          {ttsTestResult.synthesis?.voice && (
                            <div>
                              <strong>音色类型:</strong> {(() => {
                                const voiceId = ttsTestResult.synthesis.voice;
                                const voice = ttsVoices.find(v => v.id === voiceId);
                                if (voice) {
                                  return `${voice.name} ${voice.gender ? `(${voice.gender === 'male' ? '男' : '女'})` : ''} ${voice.style ? `- ${voice.style}` : ''}`;
                                }
                                // 如果找不到，尝试从voice ID中解析
                                // Edge-TTS格式：zh-CN-XiaoxiaoNeural
                                if (voiceId.startsWith('zh-CN-')) {
                                  const voiceName = voiceId.replace('zh-CN-', '').replace('Neural', '');
                                  // 简单的名称映射
                                  const nameMap: Record<string, string> = {
                                    'Xiaoxiao': '晓晓（温柔女声）',
                                    'Xiaohan': '晓涵（自然女声）',
                                    'Xiaomo': '晓墨（成熟女声）',
                                    'Xiaoyi': '晓伊（可爱女声）',
                                    'Yunxi': '云希（年轻男声）',
                                    'Yunyang': '云扬（成熟男声）',
                                    'Yunjian': '云健（专业男声）',
                                  };
                                  return nameMap[voiceName] || voiceId;
                                }
                                // CosyVoice格式：cosyvoice-{name}
                                if (voiceId.startsWith('cosyvoice-')) {
                                  return voiceId.replace('cosyvoice-', '');
                                }
                                return voiceId;
                              })()}
                            </div>
                          )}
                          {ttsTestResult.audioSize && (
                            <div><strong>测试音频大小:</strong> {(ttsTestResult.audioSize / 1024).toFixed(2)} KB</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-semibold mb-1">⚠️ 测试结果</div>
                        <div className="text-xs opacity-80 space-y-1">
                          {ttsTestResult.error && <div><strong>错误:</strong> {ttsTestResult.error}</div>}
                          {ttsTestResult.details && <div><strong>详情:</strong> {ttsTestResult.details}</div>}
                          {ttsTestResult.message && <div><strong>消息:</strong> {ttsTestResult.message}</div>}
                          {ttsTestResult.synthesis?.error && (
                            <div><strong>合成错误:</strong> {ttsTestResult.synthesis.error}</div>
                          )}
                          {ttsTestResult.synthesis?.model && (
                            <div>
                              <strong>TTS 引擎:</strong> {(() => {
                                const modelId = ttsTestResult.synthesis.model;
                                const model = ttsModels.find(m => m.id === modelId);
                                return model ? `${model.name} (${model.type === 'online' ? '在线' : '离线'})` : modelId;
                              })()}
                        </div>
                          )}
                          {ttsTestResult.synthesis?.voice && (
                            <div>
                              <strong>音色类型:</strong> {(() => {
                                const voiceId = ttsTestResult.synthesis.voice;
                                const voice = ttsVoices.find(v => v.id === voiceId);
                                if (voice) {
                                  return `${voice.name} ${voice.gender ? `(${voice.gender === 'male' ? '男' : '女'})` : ''} ${voice.style ? `- ${voice.style}` : ''}`;
                                }
                                // 如果找不到，尝试从voice ID中解析
                                // Edge-TTS格式：zh-CN-XiaoxiaoNeural
                                if (voiceId.startsWith('zh-CN-')) {
                                  const voiceName = voiceId.replace('zh-CN-', '').replace('Neural', '');
                                  // 简单的名称映射
                                  const nameMap: Record<string, string> = {
                                    'Xiaoxiao': '晓晓（温柔女声）',
                                    'Xiaohan': '晓涵（自然女声）',
                                    'Xiaomo': '晓墨（成熟女声）',
                                    'Xiaoyi': '晓伊（可爱女声）',
                                    'Yunxi': '云希（年轻男声）',
                                    'Yunyang': '云扬（成熟男声）',
                                    'Yunjian': '云健（专业男声）',
                                  };
                                  return nameMap[voiceName] || voiceId;
                                }
                                // CosyVoice格式：cosyvoice-{name}
                                if (voiceId.startsWith('cosyvoice-')) {
                                  return voiceId.replace('cosyvoice-', '');
                                }
                                return voiceId;
                              })()}
                            </div>
                          )}
                          {ttsTestResult.synthesis?.error && (
                            <div><strong>合成错误:</strong> {ttsTestResult.synthesis.error}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  测试 TTS 服务的连接、健康状态和语音合成功能。测试将使用上方配置的"默认 TTS 引擎"和"默认语音"。
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 书籍类型编辑模态框 */}
      {showCategoryEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="card-gradient rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingCategory ? '编辑书籍类型' : '添加书籍类型'}
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
                  类型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="例如: 小说、历史、科技"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  排序顺序
                </label>
                <input
                  type="number"
                  value={categoryForm.display_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) || 0 })}
                  placeholder="数字越小越靠前"
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
                  取消
                </button>
                <button
                  onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {editingCategory ? '更新' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
