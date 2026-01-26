/**
 * @author ttbye
 * AI阅读交流模态框
 * 在阅读页面中提供AI对话功能，基于选中的文本内容进行问答
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import MessageContent from '../MessageContent';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIReadingModalProps {
  isVisible: boolean;
  bookId: string;
  bookTitle: string;
  selectedText: string;
  onClose: () => void;
  theme?: 'light' | 'dark' | 'sepia' | 'green';
}

export default function AIReadingModal({
  isVisible,
  bookId,
  bookTitle,
  selectedText,
  onClose,
  theme = 'light',
}: AIReadingModalProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 主题样式
  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  }[theme];

  // 清空对话历史
  const clearConversationHistory = async () => {
    if (!bookId) return;
    
    try {
      await api.post(`/ai/conversations/${bookId}`, { _method: 'DELETE' });
      setMessages([]);
      toast.success(t('reader.ai.historyCleared') || '历史记录已清空');
    } catch (error: any) {
      console.error('清空对话历史失败:', error);
      toast.error(error.response?.data?.error || t('reader.ai.clearHistoryFailed') || '清空历史记录失败');
    }
  };

  // 当模态框关闭时，清空输入和停止音频（但保留消息，下次打开时会加载历史）
  useEffect(() => {
    if (!isVisible) {
      setInput('');
      // 停止音频播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setIsPlaying(false);
    }
  }, [isVisible, audioUrl]);

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // 聚焦输入框
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isVisible]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 保存对话历史
  const saveConversationHistory = useCallback(async (messagesToSave: Message[]) => {
    if (!bookId || messagesToSave.length === 0) return;
    
    try {
      await api.post(`/ai/conversations/${bookId}`, {
        messages: messagesToSave.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
      });
    } catch (error: any) {
      console.error('保存对话历史失败:', error);
      // 静默失败，不影响用户体验
    }
  }, [bookId]);

  const handleSendMessage = useCallback(async (messageText?: string, isAutoSend = false) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      // 保存对话历史（包含用户消息）
      saveConversationHistory(newMessages);
      return newMessages;
    });
    if (!isAutoSend) {
      setInput('');
    }
    setLoading(true);

    try {
      const response = await api.post('/ai/chat', {
        bookId,
        message: textToSend,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => {
        const newMessages = [...prev, assistantMessage];
        // 保存对话历史
        saveConversationHistory(newMessages);
        return newMessages;
      });
    } catch (error: any) {
      console.error('发送消息失败:', error);
      let errorMsg = error.response?.data?.error || error.message || t('reader.ai.sendMessageFailed');
      
      // 针对 502 Bad Gateway 错误提供更友好的提示
      if (error.response?.status === 502 || (error.code === 'ERR_BAD_RESPONSE' && error.response?.status === 502)) {
        errorMsg = t('reader.ai.error502') || '502 Bad Gateway: 无法连接到 AI 服务器。请检查 AI 服务器是否正在运行，以及系统设置中的服务器地址是否正确。';
      }
      
      toast.error(errorMsg);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${t('common.error')}: ${errorMsg}\n\n${t('reader.ai.errorCheck')}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [bookId, input, loading, messages, saveConversationHistory, t]);

  // 加载对话历史
  const loadConversationHistory = useCallback(async () => {
    if (!isVisible || !bookId) return;
    
    setLoadingHistory(true);
    try {
      const response = await api.get(`/ai/conversations/${bookId}`);
      const historyMessages = response.data.messages || [];
      
      if (historyMessages.length > 0) {
        // 转换历史消息格式
        const formattedMessages: Message[] = historyMessages.map((msg: any, index: number) => ({
          id: msg.id || `msg-${Date.now()}-${index}`,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        }));
        setMessages(formattedMessages);
        console.log('[AI Reading Modal] 已加载历史对话:', formattedMessages.length, '条消息');
      } else {
        // 如果没有历史记录且有选中文本，自动发送初始消息
        if (selectedText) {
          const initialMessageText = t('reader.ai.askAboutSelectedText', { text: selectedText.substring(0, 200) });
          // 延迟发送，确保组件已完全加载
          setTimeout(() => {
            handleSendMessage(initialMessageText, true);
          }, 300);
        }
      }
    } catch (error: any) {
      console.error('加载对话历史失败:', error);
      // 如果加载失败，仍然允许用户开始新对话
      if (selectedText) {
        const initialMessageText = t('reader.ai.askAboutSelectedText', { text: selectedText.substring(0, 200) });
        setTimeout(() => {
          handleSendMessage(initialMessageText, true);
        }, 300);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [isVisible, bookId, selectedText, t, handleSendMessage]);

  // 当模态框打开时，加载历史对话
  useEffect(() => {
    if (isVisible && bookId) {
      loadConversationHistory();
    }
  }, [isVisible, bookId, loadConversationHistory]);

  const handleTextToSpeech = async (text: string) => {
    if (isPlaying) {
      // 停止播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setIsPlaying(false);
      return;
    }

    try {
      const response = await api.post(
        '/ai/tts',
        { text },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        setAudioUrl(null);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        toast.error(t('reader.ai.voicePlaybackFailed'));
        URL.revokeObjectURL(url);
        setAudioUrl(null);
        audioRef.current = null;
      };

      await audio.play();
      setIsPlaying(true);
    } catch (error: any) {
      console.error('语音合成失败:', error);
      toast.error(error.response?.data?.error || t('reader.ai.ttsFailed'));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingTop: typeof window !== 'undefined' && window.innerWidth < 1024
          ? `max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 1rem)`
          : 'max(env(safe-area-inset-top, 0px), 1rem)',
        paddingBottom: typeof window !== 'undefined' && window.innerWidth < 1024
          ? `max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 1rem)`
          : 'max(env(safe-area-inset-bottom, 0px), 1rem)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-3xl rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: themeStyles.bg,
          color: themeStyles.text,
          border: `1px solid ${themeStyles.border}`,
          maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 1rem) - max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 1rem) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
            : 'calc(80vh - 2rem)',
          height: typeof window !== 'undefined' && window.innerWidth >= 1024 ? '80vh' : 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: themeStyles.border }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: themeStyles.text }} />
            <h2 className="text-lg font-semibold" style={{ color: themeStyles.text }}>
              {t('reader.ai.title')}
            </h2>
            <span className="text-sm opacity-70" style={{ color: themeStyles.text }}>
              - {bookTitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearConversationHistory}
                className="p-1.5 rounded-lg hover:bg-opacity-20 hover:bg-black dark:hover:bg-white transition-colors"
                style={{ color: themeStyles.text }}
                title={t('reader.ai.clearHistory') || '清空历史记录'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-opacity-20 hover:bg-black dark:hover:bg-white transition-colors"
              style={{ color: themeStyles.text }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingHistory && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: themeStyles.text }} />
              <span className="ml-2 opacity-70" style={{ color: themeStyles.text }}>
                {t('reader.ai.loadingHistory') || '加载历史对话...'}
              </span>
            </div>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div className="text-center py-8">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" style={{ color: themeStyles.text }} />
              <p className="opacity-70" style={{ color: themeStyles.text }}>
                {t('reader.ai.startConversation', { title: bookTitle })}
              </p>
              {selectedText && (
                <div
                  className="mt-4 p-3 rounded-lg text-sm text-left max-w-2xl mx-auto"
                  style={{
                    backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                    border: `1px solid ${themeStyles.border}`,
                  }}
                >
                  <div className="font-medium mb-2" style={{ color: themeStyles.text }}>
                    {t('reader.ai.selectedText')}:
                  </div>
                  <div className="opacity-80 whitespace-pre-wrap break-words" style={{ color: themeStyles.text }}>
                    {selectedText}
                  </div>
                </div>
              )}
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: theme === 'dark' ? '#2563eb' : '#3b82f6' }}
                >
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user'
                    ? theme === 'dark'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-600 text-white'
                    : theme === 'dark'
                    ? 'bg-gray-700 text-gray-100'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {message.role === 'assistant' ? (
                  <MessageContent 
                    content={message.content} 
                    className="text-sm"
                    theme={theme}
                  />
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm">
                    {message.content}
                  </div>
                )}
                {message.role === 'assistant' && (
                  <button
                    onClick={() => handleTextToSpeech(message.content)}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {isPlaying && audioUrl ? (
                      <>
                        <VolumeX className="w-3 h-3" />
                        {t('reader.ai.stopPlayback')}
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3" />
                        {t('reader.ai.voiceRead')}
                      </>
                    )}
                  </button>
                )}
              </div>
              {message.role === 'user' && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: theme === 'dark' ? '#4b5563' : '#9ca3af',
                    color: '#ffffff',
                  }}
                >
                  <span className="text-xs font-medium">U</span>
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: theme === 'dark' ? '#2563eb' : '#3b82f6' }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div
                className="rounded-lg p-3"
                style={{
                  backgroundColor: theme === 'dark' ? '#374151' : '#f3f4f6',
                }}
              >
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: themeStyles.text }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div
          className="border-t p-4"
          style={{ borderColor: themeStyles.border }}
        >
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('reader.ai.enterQuestion')}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
              style={{
                backgroundColor: theme === 'dark' ? '#374151' : '#ffffff',
                color: themeStyles.text,
                borderColor: themeStyles.border,
              }}
              rows={2}
              disabled={loading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{t('reader.ai.send')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
