/**
 * @file AIChatModal.tsx
 * @author ttbye
 * AI阅读交流模态框组件
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import MessageContent from '../MessageContent';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  selectedText?: string;
  bookTitle?: string;
}

export default function AIChatModal({
  isOpen,
  onClose,
  bookId,
  selectedText,
  bookTitle,
}: AIChatModalProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  
  // 同步messages到ref
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 滚动到底部
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

  // 发送消息
  const handleSendMessage = useCallback(async (messageText?: string, isInitial = false) => {
    const textToSend = messageText || inputMessage.trim();
    if (!textToSend && !isInitial) return;

    // 添加用户消息
    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      // 保存对话历史（包含用户消息）
      saveConversationHistory(newMessages);
      return newMessages;
    });
    setInputMessage('');
    setIsLoading(true);

    try {
      // 构建对话历史（只包含role和content），使用ref获取最新消息
      const conversationHistory = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 调用AI API
      const response = await api.post('/ai/chat', {
        bookId,
        message: textToSend,
        messages: conversationHistory,
      }, {
        timeout: 120000, // 2分钟超时，AI响应可能需要较长时间
      });

      // 添加AI回复
      const aiMessage: Message = {
        role: 'assistant',
        content: response.data.response || t('reader.ai.noResponse'),
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const newMessages = [...prev, aiMessage];
        // 保存对话历史
        saveConversationHistory(newMessages);
        return newMessages;
      });
    } catch (error: any) {
      console.error('AI聊天失败:', error);
      let errorMessage = error.response?.data?.error || error.message || t('reader.ai.error');
      
      // 针对 502 Bad Gateway 错误提供更友好的提示
      if (error.response?.status === 502) {
        errorMessage = t('reader.ai.error502') || '502 Bad Gateway: 无法连接到 AI 服务器。请检查 AI 服务器是否正在运行，以及系统设置中的服务器地址是否正确。';
      } else if (error.code === 'ERR_BAD_RESPONSE' && error.response?.status === 502) {
        errorMessage = t('reader.ai.error502') || '502 Bad Gateway: 无法连接到 AI 服务器。请检查 AI 服务器是否正在运行，以及系统设置中的服务器地址是否正确。';
      }
      
      toast.error(errorMessage);
      
      // 添加错误消息
      const errorMsg: Message = {
        role: 'assistant',
        content: `${t('reader.ai.error')}: ${errorMessage}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, inputMessage, t, saveConversationHistory]);

  // 清空对话历史
  const clearConversationHistory = async () => {
    if (!bookId) return;
    
    try {
      await api.post(`/ai/conversations/${bookId}`, { _method: 'DELETE' });
      setMessages([]);
      setInputMessage('');
      toast.success(t('reader.ai.historyCleared') || '历史记录已清空');
    } catch (error: any) {
      console.error('清空对话历史失败:', error);
      toast.error(error.response?.data?.error || t('reader.ai.clearHistoryFailed') || '清空历史记录失败');
    }
  };

  // 加载对话历史
  const loadConversationHistory = useCallback(async () => {
    if (!isOpen || !bookId) return;
    
    setLoadingHistory(true);
    try {
      const response = await api.get(`/ai/conversations/${bookId}`);
      const historyMessages = response.data.messages || [];
      
      if (historyMessages.length > 0) {
        // 转换历史消息格式
        const formattedMessages: Message[] = historyMessages.map((msg: any, index: number) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
        }));
        setMessages(formattedMessages);
        console.log('[AI Chat Modal] 已加载历史对话:', formattedMessages.length, '条消息');
        
        // 如果有选中文本，将其加载到输入框（不自动发送）
        if (selectedText) {
          const promptText = t('reader.ai.promptTemplate', { text: selectedText.substring(0, 500) });
          setInputMessage(promptText);
        }
      } else {
        // 如果没有历史记录且有选中文本，将选中文本加载到输入框
        if (selectedText) {
          const promptText = t('reader.ai.promptTemplate', { text: selectedText.substring(0, 500) });
          setInputMessage(promptText);
        }
      }
    } catch (error: any) {
      console.error('加载对话历史失败:', error);
      // 如果加载失败，仍然允许用户开始新对话
      if (selectedText) {
        const promptText = t('reader.ai.promptTemplate', { text: selectedText.substring(0, 500) });
        setInputMessage(promptText);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [isOpen, bookId, selectedText, t]);

  // 当模态框打开时，加载历史对话
  useEffect(() => {
    if (isOpen && bookId) {
      loadConversationHistory();
    }
  }, [isOpen, bookId, loadConversationHistory]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      // 聚焦输入框
      const focusTimer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(focusTimer);
    } else {
      // 关闭时只清空输入，不清空消息（下次打开会加载历史）
      setInputMessage('');
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };


  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: typeof window !== 'undefined' && window.innerWidth < 1024
            ? `calc(100vh - max(clamp(20px, env(safe-area-inset-top, 20px), 44px), 8px) - max(clamp(10px, env(safe-area-inset-bottom, 10px), 34px), 8px) - ${typeof window !== 'undefined' && window.innerWidth >= 768 ? '64px' : '56px'} - 2rem)`
            : 'calc(85vh - 2rem)',
          height: typeof window !== 'undefined' && window.innerWidth >= 1024 ? '85vh' : 'auto',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t('reader.ai.title')}
              </h2>
              {bookTitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                  {bookTitle}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearConversationHistory}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={t('reader.ai.clearHistory') || '清空历史记录'}
              >
                <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ userSelect: 'text' }}>
          {loadingHistory && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                {t('reader.ai.loadingHistory') || '加载历史对话...'}
              </span>
            </div>
          )}
          {!loadingHistory && messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-2">
                {t('reader.ai.welcome')}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t('reader.ai.welcomeHint')}
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              >
                {message.role === 'assistant' ? (
                  <MessageContent 
                    content={message.content} 
                    className="text-sm"
                    theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
                  />
                ) : (
                  <div className="whitespace-pre-wrap break-words select-text">{message.content}</div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  <span className="text-gray-500 dark:text-gray-400">
                    {t('reader.ai.thinking')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          {/* 提示词快捷按钮 */}
          {selectedText && (
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const prompt = t('reader.ai.promptTemplate', { text: selectedText.substring(0, 500) });
                  setInputMessage(prompt);
                  inputRef.current?.focus();
                }}
                className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                分析文本
              </button>
              <button
                onClick={() => {
                  const prompt = `${t('reader.ai.promptHelpUnderstand')}\n\n"${selectedText.substring(0, 500)}"`;
                  setInputMessage(prompt);
                  inputRef.current?.focus();
                }}
                className="px-2 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
              >
                {t('reader.ai.promptHelpUnderstand')}
              </button>
              <button
                onClick={() => {
                  const prompt = `${t('reader.ai.promptExplain')}\n\n"${selectedText.substring(0, 500)}"`;
                  setInputMessage(prompt);
                  inputRef.current?.focus();
                }}
                className="px-2 py-1 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              >
                {t('reader.ai.promptExplain')}
              </button>
              <button
                onClick={() => {
                  const prompt = `${t('reader.ai.promptSummarize')}\n\n"${selectedText.substring(0, 500)}"`;
                  setInputMessage(prompt);
                  inputRef.current?.focus();
                }}
                className="px-2 py-1 text-xs bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
              >
                {t('reader.ai.promptSummarize')}
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('reader.ai.inputPlaceholder')}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              rows={2}
              disabled={isLoading}
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {t('reader.ai.inputHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
