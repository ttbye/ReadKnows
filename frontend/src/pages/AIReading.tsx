/**
 * @file AIReading.tsx
 * @author ttbye
 * @date 2025-12-11
 */

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { Sparkles, Send, BookOpen, FileText, Volume2, VolumeX, Loader2, Book, X, Menu } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import MessageContent from '../components/MessageContent';
import { useTranslation } from 'react-i18next';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Book {
  id: string;
  title: string;
  author?: string;
  file_name?: string;
}

export default function AIReading() {
  const { isAuthenticated, user } = useAuthStore();
  const { t } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showBookSelector, setShowBookSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBooks();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchBooks = async () => {
    try {
      // 只获取用户书架中的书籍
      const response = await api.get('/shelf/my');
      const shelfBooks = response.data.books || [];
      // 转换为AIReading需要的格式
      const books: Book[] = shelfBooks.map((book: any) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        file_name: book.file_name,
      }));
      setBooks(books);
    } catch (error: any) {
      console.error('获取书架书籍列表失败:', error);
      toast.error(error.response?.data?.error || t('ai.fetchBooksFailed'));
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;
    if (!selectedBook) {
      toast.error(t('ai.selectBookFirst'));
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.post('/ai/chat', {
        bookId: selectedBook.id,
        message: input,
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

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('发送消息失败:', error);
      const errorMsg = error.response?.data?.error || error.message || t('ai.sendMessageFailed');
      const errorDetails = error.response?.data?.details;
      
      console.error('错误详情:', {
        message: errorMsg,
        details: errorDetails,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        fullError: error,
      });
      
      // 显示更详细的错误信息
      let displayMsg = errorMsg;
      if (errorDetails && typeof errorDetails === 'object') {
        if (errorDetails.stack) {
          console.error('错误堆栈:', errorDetails.stack);
        }
      }
      
      // 如果响应数据为空，可能是服务器错误
      if (!error.response?.data || error.response.data === '') {
        displayMsg = t('ai.serverError');
        console.error('服务器返回空响应，可能是未处理的错误');
      }
      
      toast.error(displayMsg);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${t('common.error')}: ${errorMsg}${errorDetails ? '\n\n' + errorDetails : ''}\n\n${t('ai.errorCheck')}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeBook = async () => {
    if (!selectedBook) {
      toast.error(t('ai.selectBookFirst'));
      return;
    }

    setAnalyzing(true);
    try {
      const response = await api.post('/ai/analyze', {
        bookId: selectedBook.id,
      });

      const analysisMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.data.analysis,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, analysisMessage]);
      toast.success(t('ai.analysisComplete'));
    } catch (error: any) {
      console.error('分析书籍失败:', error);
      const errorMsg = error.response?.data?.error || error.message || t('ai.analyzeFailed');
      const errorDetails = error.response?.data?.details;
      
      console.error('错误详情:', {
        message: errorMsg,
        details: errorDetails,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        fullError: error,
      });
      
      // 显示更详细的错误信息
      let displayMsg = errorMsg;
      if (errorDetails && typeof errorDetails === 'object') {
        if (errorDetails.stack) {
          console.error('错误堆栈:', errorDetails.stack);
        }
        // 如果 errorDetails 有 message，使用它作为补充信息
        if (errorDetails.message && errorDetails.message !== errorMsg) {
          displayMsg = `${errorMsg}\n${errorDetails.message}`;
        }
      }
      
      // 确保错误消息完整显示
      if (typeof displayMsg !== 'string' || displayMsg.trim().length === 0) {
        displayMsg = t('ai.analyzeFailed');
      }
      
      toast.error(displayMsg, { duration: 5000 });
      
      // 构建详细的错误消息用于显示在对话中
      let errorContent = `${t('ai.analyzeFailed')}: ${errorMsg}`;
      if (errorDetails && typeof errorDetails === 'object') {
        if (errorDetails.message && errorDetails.message !== errorMsg) {
          errorContent += `\n\n${errorDetails.message}`;
        }
        if (errorDetails.code) {
          errorContent += `\n${t('common.error')}: ${errorDetails.code}`;
        }
      }
      errorContent += `\n\n${t('ai.errorCheck')}`;
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setAnalyzing(false);
    }
  };

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
        toast.error(t('ai.voicePlaybackFailed'));
        URL.revokeObjectURL(url);
        setAudioUrl(null);
        audioRef.current = null;
      };

      await audio.play();
      setIsPlaying(true);
    } catch (error: any) {
      console.error('语音合成失败:', error);
      toast.error(error.response?.data?.error || t('ai.ttsFailed'));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">{t('ai.pleaseLogin')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-180px)] lg:h-[calc(100vh-200px)] flex flex-col">
      {/* 标题栏 - 移动端显示书籍选择按钮 */}
      <div className="flex items-center justify-end mb-4 lg:mb-6">
        {/* 移动端：显示书籍选择按钮 */}
        <div className="lg:hidden flex items-center gap-2">
          {selectedBook && (
            <button
              onClick={() => {
                setSelectedBook(null);
                setMessages([]);
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setShowBookSelector(!showBookSelector)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden relative">
        {/* 移动端：书籍选择抽屉 */}
        {showBookSelector && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowBookSelector(false)}
            />
            <div className="lg:hidden fixed inset-y-0 left-0 w-80 bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('ai.selectBook')}</h2>
                <button
                  onClick={() => setShowBookSelector(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {books.map((book) => (
                  <button
                    key={book.id}
                    onClick={() => {
                      setSelectedBook(book);
                      setMessages([]);
                      setShowBookSelector(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedBook?.id === book.id
                        ? 'bg-blue-100 dark:bg-blue-900/20 border-2 border-blue-500'
                        : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-2 border-transparent'
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{book.title}</div>
                    {book.author && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {book.author}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {selectedBook && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      handleAnalyzeBook();
                      setShowBookSelector(false);
                    }}
                    disabled={analyzing}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('ai.analyzing')}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        {t('ai.analyzeBook')}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* 桌面端：左侧书籍选择 */}
        <div className="hidden lg:flex w-64 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('ai.selectBook')}</h2>
            {selectedBook && (
              <button
                onClick={() => {
                  setSelectedBook(null);
                  setMessages([]);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {books.map((book) => (
              <button
                key={book.id}
                onClick={() => {
                  setSelectedBook(book);
                  setMessages([]);
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedBook?.id === book.id
                    ? 'bg-blue-100 dark:bg-blue-900/20 border-2 border-blue-500'
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-2 border-transparent'
                }`}
              >
                <div className="font-medium text-sm truncate">{book.title}</div>
                {book.author && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {book.author}
                  </div>
                )}
              </button>
            ))}
          </div>
          {selectedBook && (
            <button
              onClick={handleAnalyzeBook}
              disabled={analyzing}
              className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('ai.analyzing')}
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  {t('ai.analyzeBook')}
                </>
              )}
            </button>
          )}
        </div>

        {/* 对话区域 */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden min-w-0">
          {!selectedBook ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <BookOpen className="w-12 h-12 lg:w-16 lg:h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 text-sm lg:text-base">
                  <span className="lg:hidden">{t('ai.selectBookToStartMobile')}</span>
                  <span className="hidden lg:inline">{t('ai.selectBookToStart')}</span>
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* 移动端：显示当前书籍信息 */}
              {selectedBook && (
                <div className="lg:hidden px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{selectedBook.title}</div>
                      {selectedBook.author && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {selectedBook.author}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleAnalyzeBook}
                      disabled={analyzing}
                      className="ml-2 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {analyzing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {t('ai.analyzing')}
                        </>
                      ) : (
                        <>
                          <FileText className="w-3 h-3" />
                          {t('ai.analyzeBook')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-6 lg:py-8">
                    <Sparkles className="w-10 h-10 lg:w-12 lg:h-12 text-gray-400 mx-auto mb-3 lg:mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm lg:text-base px-4">
                      {t('ai.startConversation', { title: selectedBook.title })}
                    </p>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] lg:max-w-[70%] rounded-lg p-2.5 lg:p-3 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <MessageContent 
                          content={message.content} 
                          className="text-sm lg:text-base"
                        />
                      ) : (
                        <div className="whitespace-pre-wrap break-words text-sm lg:text-base">
                          {message.content}
                        </div>
                      )}
                      {message.role === 'assistant' && (
                        <button
                          onClick={() => handleTextToSpeech(message.content)}
                          className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 active:opacity-70"
                        >
                          {isPlaying && audioUrl ? (
                            <>
                              <VolumeX className="w-3 h-3" />
                              {t('ai.stopPlayback')}
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              {t('ai.voiceRead')}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs lg:text-sm font-medium">
                          {user?.username?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-2 lg:gap-3 justify-start">
                    <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-2.5 lg:p-3">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入框 */}
              <div className="border-t border-gray-200 dark:border-gray-700 p-3 lg:p-4">
                <div className="flex gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('ai.enterQuestion')}
                    className="flex-1 px-3 lg:px-4 py-2 text-sm lg:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                    rows={2}
                    disabled={loading}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={loading || !input.trim()}
                    className="px-4 lg:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 lg:gap-2 text-sm lg:text-base"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">{t('ai.send')}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

