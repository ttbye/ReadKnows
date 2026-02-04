import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MessageCircle, Mic, Plus, Smile, File, X, Image as ImageIcon, BookOpen, Volume2, Loader2, Check } from 'lucide-react';
import { StickerPicker, StickerItem } from './StickerPicker';
import { getMessageFileApiPath, getAuthenticatedFileUrl, getAvatarUrl } from '../../utils/api';
import api from '../../utils/api';
import ImageViewer from '../readers/ImageViewer';
import { formatTimeOnly, formatDateForSeparator, getDateKeyInSystemTZ, syncTimezoneFromBackendGlobal } from '../../utils/timezone';

interface Message {
  id: string;
  content: string;
  message_type: string;
  from_user_id: string;
  from_username?: string;
  from_nickname?: string;
  created_at: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  duration?: number;
  reply_to_message_id?: string;
  reply_content?: string;
  reply_from_nickname?: string;
  reply_from_username?: string;
  reply_message_type?: string;
  is_recalled?: boolean;
  is_deleted?: boolean;
  is_read?: number;
  local_audio_blob?: Blob;
  playing?: boolean;
}

interface ChatAreaProps {
  selectedConversation: any;
  messages: Message[];
  messageContent: string;
  showVoiceButton: boolean;
  showEmojiPicker: boolean;
  showStickerPicker: boolean;
  sending: boolean;
  isRecording: boolean;
  isPressingVoice: boolean;
  recordingTime: number;
  pendingAttachments: any[];
  replyingTo: Message | null;
  conversationType?: 'friend' | 'group';
  groupMembers?: any[];
  currentUserId?: string;
  currentUserDisplayName?: string;
  currentUserAvatarPath?: string | null;
  onMessageContentChange: (content: string) => void;
  onSendMessage: () => void;
  onToggleVoiceButton: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onToggleStickerPicker: () => void;
  onStickerSelect: (sticker: StickerItem) => void;
  onFileSelect: (files: FileList) => void;
  onEmojiSelect: (emoji: string) => void;
  onToggleEmojiPicker: () => void;
  onRemoveAttachment: (id: string) => void;
  onReplyCancel: () => void;
  onMessageContextMenu: (e: React.MouseEvent, message: Message) => void;
  onPlayVoiceMessage: (message: Message) => void;
}

/**
 * 主聊天区域组件
 */
export const ChatArea: React.FC<ChatAreaProps> = ({
  selectedConversation,
  messages,
  messageContent,
  showVoiceButton,
  showEmojiPicker,
  showStickerPicker,
  sending,
  isRecording,
  isPressingVoice = false,
  recordingTime,
  pendingAttachments,
  replyingTo,
  conversationType,
  groupMembers = [],
  currentUserId,
  currentUserDisplayName,
  currentUserAvatarPath,
  onMessageContentChange,
  onSendMessage,
  onToggleVoiceButton,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  onToggleStickerPicker,
  onStickerSelect,
  onFileSelect,
  onEmojiSelect,
  onToggleEmojiPicker,
  onRemoveAttachment,
  onReplyCancel,
  onMessageContextMenu,
  onPlayVoiceMessage,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const voiceButtonRef = React.useRef<HTMLButtonElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messageInputRef = React.useRef<HTMLTextAreaElement>(null);

  // @提醒相关状态
  const [showMentionList, setShowMentionList] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState('');
  const [mentionPosition, setMentionPosition] = React.useState(0);

  // 长按相关状态
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);

  // 时区同步状态
  const [tzSynced, setTzSynced] = React.useState(0);

  // 图片预览状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 从设置同步时区
  React.  useEffect(() => {
    const sync = async () => {
      try {
        await syncTimezoneFromBackendGlobal();
        setTzSynced((n) => n + 1);
      } catch (error) {
        console.error('[时区调试] ChatArea时区同步失败:', error);
      }
    };
    sync();
  }, []);

  // 将文本中的 URL 转为可点击链接，点击时确认后打开
  const handleUrlClick = (href: string) => {
    if (window.confirm(t('messages.openUrlConfirm'))) window.open(href, '_blank');
  };
  const linkifyUrls = (text: string): React.ReactNode => {
    if (!text || typeof text !== 'string') return text;
    const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(<React.Fragment key={`t-${last}`}>{text.slice(last, m.index)}</React.Fragment>);
      const raw = m[0];
      const href = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      parts.push(
        <button key={`url-${m.index}`} type="button" onClick={() => handleUrlClick(href)} className="underline cursor-pointer bg-transparent border-0 p-0 font-inherit text-inherit">
          {raw}
        </button>
      );
      last = re.lastIndex;
    }
    if (last < text.length) parts.push(<React.Fragment key={`t-${last}`}>{text.slice(last)}</React.Fragment>);
    return parts.length > 1 ? <>{parts}</> : parts.length === 1 ? parts[0] : text;
  };

  // 处理@提及的高亮显示（与 ChatPage 一致）
  const renderMessageWithMentions = (content: string, members: any[] = []) => {
    if (!content) return content;
    const memberMap = new Map<string, any>();
    members.forEach(member => {
      memberMap.set(member.username, member);
      if (member.nickname && member.nickname !== member.username) memberMap.set(member.nickname, member);
    });
    const mentionRegex = /@(\w+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) parts.push(<React.Fragment key={`s-${match.index}`}>{linkifyUrls(content.substring(lastIndex, match.index))}</React.Fragment>);
      const mentionName = match[1];
      const member = memberMap.get(mentionName);
      if (member) {
        parts.push(<span key={match.index} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded font-medium">@{mentionName}</span>);
      } else {
        parts.push(<React.Fragment key={`s-${match.index}-p`}>{linkifyUrls(match[0])}</React.Fragment>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(<React.Fragment key="s-end">{linkifyUrls(content.substring(lastIndex))}</React.Fragment>);
    return parts.length > 0 ? parts : content;
  };

  // 日期分隔与格式化（与 ChatPage 一致）
  const shouldShowDateSeparator = (current: Message, previous?: Message): boolean => {
    if (!previous) return true;
    return getDateKeyInSystemTZ(current.created_at) !== getDateKeyInSystemTZ(previous.created_at);
  };
  const formatMessageDate = (dateString: string) => formatDateForSeparator(dateString, { today: t('messages.today'), yesterday: t('messages.yesterday') });

  // ============ 长按处理函数 ============
  const handleMessageLongPress = (message: Message, x: number, y: number) => {
    console.log('[长按菜单] 触发', { x, y, messageId: message.id });

    // 阻止浏览器默认的右键菜单
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      document.removeEventListener('contextmenu', preventContextMenu);
    };
    document.addEventListener('contextmenu', preventContextMenu, { once: true });

    // 创建一个模拟的鼠标事件来触发右键菜单
    const mockEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientX: x,
      clientY: y,
    } as React.MouseEvent;
    onMessageContextMenu(mockEvent, message);
  };

  const handleTouchStart = (e: React.TouchEvent, message: Message) => {
    const touch = e.touches[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };

    // 启动长按计时器（500ms）
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartRef.current) {
        // 触发振动反馈（如果支持）
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        handleMessageLongPress(message, touchStartRef.current!.x, touchStartRef.current!.y);
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 如果移动距离超过10px，取消长按
    if (distance > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    // 检查是否有文本选择，如果有则取消长按
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartRef.current = null;
      return;
    }
    
    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
  };

  // 渲染单条消息（与 ChatPage 样式一致：头像、左右布局、群组发送者名、日期分隔、已读、撤回/删除）
  const renderMessage = (message: Message, index: number) => {
    const isFromMe = message.from_user_id === currentUserId;
    const previousMessage = index > 0 ? messages[index - 1] : undefined;
    const showDateSeparator = shouldShowDateSeparator(message, previousMessage);

    if (message.is_recalled) {
      return (
        <div key={message.id}>
          {showDateSeparator && (
            <div className="flex justify-center my-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{formatMessageDate(message.created_at)}</div>
            </div>
          )}
          <div className="flex justify-center mb-3 px-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{t('messages.messageRecalled')}</div>
          </div>
        </div>
      );
    }
    if (message.is_deleted) return null;

    return (
      <div key={message.id}>
        {showDateSeparator && (
          <div className="flex justify-center my-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">{formatMessageDate(message.created_at)}</div>
          </div>
        )}
        <div
          className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} mb-3 group px-2 md:px-4`}
          onContextMenu={(e) => onMessageContextMenu(e, message)}
          onTouchStart={(e) => handleTouchStart(e, message)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            WebkitTouchCallout: 'none' // 屏蔽iOS长按系统菜单，但允许文本选择
          }}
        >
          {!isFromMe && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs mr-2 flex-shrink-0 mt-1">
              {(message.from_nickname || message.from_username || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          {isFromMe && (
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 ml-2 flex-shrink-0 mt-1 order-3">
              {currentUserAvatarPath && getAvatarUrl(currentUserAvatarPath) ? (
                <img src={getAvatarUrl(currentUserAvatarPath)!} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-xs">{(currentUserDisplayName || t('messages.me')).charAt(0).toUpperCase()}</span>
              )}
            </div>
          )}
          <div className={`max-w-xs md:max-w-md ${isFromMe ? 'order-1' : 'order-2'}`}>
            {!isFromMe && conversationType === 'group' && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">{message.from_nickname || message.from_username}</div>
            )}
            {message.reply_to_message_id && message.reply_content && (
              <div className={`mb-1.5 px-3 py-2 rounded-lg border-l-3 ${isFromMe ? 'bg-blue-400/20 border-blue-400 dark:bg-blue-500/20 dark:border-blue-400' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500'}`}>
                <div className="text-xs font-medium opacity-80 mb-1">{message.reply_from_nickname || message.reply_from_username}</div>
                <div className="text-xs truncate opacity-70">
                  {message.reply_message_type === 'image' ? t('messages.typeImage') : message.reply_message_type === 'sticker' ? t('messages.typeSticker') : linkifyUrls(message.reply_content || '')}
                </div>
              </div>
            )}
            <div className={`px-3.5 py-2.5 rounded-2xl shadow-sm ${isFromMe ? 'bg-[#007AFF] text-white rounded-tr-sm' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm border border-gray-200 dark:border-gray-700'}`}>
              {message.message_type === 'voice' ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onPlayVoiceMessage(message)} className={`p-2 rounded-full transition-colors ${message.playing ? 'bg-white/20 text-white' : isFromMe ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    {message.playing ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <div className="flex-1">
                    <div className="text-sm">{message.duration ? t('messages.voiceSeconds', { seconds: message.duration }) : t('messages.voiceMessage')}</div>
                  </div>
                </div>
              ) : message.message_type === 'image' ? (
                <div className="max-w-xs">
                  {getMessageFileApiPath(message.file_path) ? (
                    <img src={getAuthenticatedFileUrl(getMessageFileApiPath(message.file_path)!)} alt={t('messages.imageAlt')} className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setPreviewImageUrl(getAuthenticatedFileUrl(getMessageFileApiPath(message.file_path)!))} />
                  ) : (
                    <div className="py-8 px-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm text-center">[图片]</div>
                  )}
                </div>
              ) : message.message_type === 'sticker' ? (
                <div className="max-w-[140px]">
                  {getMessageFileApiPath(message.file_path) ? (
                    <img src={getAuthenticatedFileUrl(getMessageFileApiPath(message.file_path)!)} alt={t('messages.stickerAlt')} className="rounded-lg w-full h-auto cursor-pointer hover:opacity-90 transition-opacity" />
                  ) : (message.content || '').match(/^(https?:|\/\/|data:)/i) ? (
                    <img src={message.content} alt={t('messages.stickerAlt')} className="rounded-lg w-full h-auto cursor-pointer hover:opacity-90 transition-opacity" />
                  ) : (
                    <div className="py-6 px-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs text-center">[表情]</div>
                  )}
                </div>
              ) : message.message_type === 'reading_progress' ? (
                <div className="max-w-xs">
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center"><span className="text-white text-xs font-bold">📖</span></div>
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t('messages.readingProgressShare')}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {(() => { try { const d = JSON.parse(message.content); return d.message || t('messages.readingProgressFormat', { title: d.chapter_title || d.book_title || '—', progress: (d.progress * 100).toFixed(1) }); } catch { return message.content; } })()}
                      </div>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                        <div className="bg-gradient-to-r from-blue-400 to-purple-500 h-2 rounded-full transition-all duration-300" style={{ width: (() => { try { return `${Math.min(JSON.parse(message.content).progress * 100, 100)}%`; } catch { return '0%'; } })() }} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : message.message_type === 'book_excerpt' ? (
                <div className="max-w-sm">
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-700">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><span className="text-white text-xs font-bold">📚</span></div>
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('messages.bookExcerpt')}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-gray-700 dark:text-gray-300 italic border-l-3 border-amber-400 pl-3">
                        {(() => { try { return JSON.parse(message.content).excerpt_text || message.content; } catch { return message.content; } })()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-amber-200 dark:border-amber-700">
                        {(() => { try { const e = JSON.parse(message.content); return `——《${e.book_title}》${e.chapter_title ? ` ${e.chapter_title}` : ''}`; } catch { return ''; } })()}
                      </div>
                      {(() => {
                        try {
                          const e = JSON.parse(message.content);
                          if (!e?.book_id) return null;
                          return (
                            <button type="button" onClick={() => navigate(`/reader/${e.book_id}`, { state: { initialPosition: { progress: typeof e.progress === 'number' ? e.progress : 0, currentPage: e.page ?? 1, totalPages: e.total_pages ?? 1, chapterIndex: e.chapter_index ?? 0, chapterTitle: e.chapter_title, currentLocation: e.current_location } } })} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 hover:underline">
                              <BookOpen className="w-3.5 h-3.5" />{t('messages.openBookAtExcerpt')}
                            </button>
                          );
                        } catch { return null; }
                      })()}
                    </div>
                  </div>
                </div>
              ) : message.message_type === 'file' ? (
                <div className="flex items-center gap-3">
                  <File className={`w-5 h-5 flex-shrink-0 ${isFromMe ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm break-words break-all ${isFromMe ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '200px' }}>{message.file_name}</div>
                    <div className={`text-xs mt-0.5 ${isFromMe ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{message.file_size ? `${(message.file_size / 1024 / 1024).toFixed(2)} MB` : ''}</div>
                  </div>
                </div>
              ) : (
                <div 
                  className="text-sm md:text-base whitespace-pre-wrap break-words" 
                  style={{ 
                    wordBreak: 'break-word', 
                    overflowWrap: 'break-word', 
                    maxWidth: '100%',
                    userSelect: 'text',
                    WebkitUserSelect: 'text'
                  }}
                >
                  {conversationType === 'group' ? renderMessageWithMentions(message.content, groupMembers) : linkifyUrls(message.content)}
                </div>
              )}
            </div>
            <div className={`text-xs text-gray-400 dark:text-gray-500 mt-1 px-1 ${isFromMe ? 'text-right' : 'text-left'} flex items-center gap-1`}>
              {formatTimeOnly(message.created_at)}
              {isFromMe && (
                <div className="flex items-center">
                  {message.is_read ? (<div className="flex"><div className="w-3 h-3 rounded-full bg-blue-500 -ml-1" /><div className="w-3 h-3 rounded-full bg-blue-500" /></div>) : (<div className="w-3 h-3 rounded-full bg-gray-400" />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 自动滚动到底部
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <MessageCircle className="w-24 h-24 mx-auto mb-4 opacity-50" />
          <p className="text-lg">请选择一个会话开始聊天</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* 消息列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>{t('messages.noMessages')}</p>
          </div>
        ) : (
          messages.map((message, index) => renderMessage(message, index))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative">
        {/* Emoji选择器 */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-0 right-0 z-50 shadow-lg">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
              <div className="grid grid-cols-8 gap-2">
                {['😀', '😂', '😊', '😍', '🥰', '😘', '😉', '😎', '🤔', '😮', '😢', '😭', '😤', '😅', '🙄', '😴'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onEmojiSelect(emoji)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 表情包选择器 */}
        {showStickerPicker && (
          <div className="absolute bottom-full left-0 right-0 z-50 shadow-lg">
            <StickerPicker onSelect={onStickerSelect} />
          </div>
        )}

        {/* 录音动画遮罩层 */}
        {isRecording && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4">
              {/* 录音动画 */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <div className="flex items-end gap-1 h-16">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div
                      key={i}
                      className="w-1 bg-red-500 rounded-full animate-pulse"
                      style={{
                        height: `${20 + Math.random() * 60}%`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: '0.6s',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-500 mb-2">
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {isPressingVoice ? t('messages.stopRecording') : t('messages.tapToStopRecording')}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={onStopRecording}
                    className="px-6 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
                  >
                    结束录音
                  </button>
                  <button
                    onClick={onCancelRecording}
                    className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    取消录音
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-2 md:p-2.5">
          {/* 功能按钮栏 */}
          <div className="flex items-center gap-1 mb-1">
            <button
              onClick={onToggleVoiceButton}
              className={`p-2 rounded-lg transition-all ${
                showVoiceButton
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={showVoiceButton ? t('messages.switchToKeyboard') : t('messages.switchToVoice')}
            >
              <Mic className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
              title="添加附件"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && onFileSelect(e.target.files)}
            />

            <button
              onClick={onToggleEmojiPicker}
              className={`p-2 rounded-lg transition-all ${
                showEmojiPicker
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={t('messages.emoji')}
            >
              <Smile className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            <button
              onClick={onToggleStickerPicker}
              className={`p-2 rounded-lg transition-all ${
                showStickerPicker
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="表情包"
            >
              <ImageIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>

          <div className="flex items-end gap-2">
            {/* 输入框或语音按钮 */}
            {showVoiceButton ? (
              <div className="flex-1 flex items-center justify-center">
                <button
                  ref={voiceButtonRef}
                  onClick={() => {
                    if (isRecording) {
                      onStopRecording();
                    } else {
                      onStartRecording();
                    }
                  }}
                  disabled={sending}
                  className={`flex-1 py-3 md:py-4 px-4 rounded-xl transition-all ${
                    isRecording
                      ? 'bg-red-500 text-white scale-95 shadow-lg'
                      : 'bg-green-500 text-white shadow-sm hover:bg-green-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isRecording ? (
                    <span className="text-sm md:text-base font-medium">{t('messages.tapToStopRecording')}</span>
                  ) : (
                    <span className="text-sm md:text-base font-medium">{t('messages.tapToStartRecording')}</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex-1 relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                {replyingTo && (
                  <div className="px-3 md:px-4 pt-2 pb-1 border-b border-gray-200 dark:border-gray-700">
                    <div className="px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                          {t('messages.replyPrefix', { name: replyingTo.from_nickname || replyingTo.from_username })}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {replyingTo.message_type === 'image'
                            ? t('messages.typeImage')
                            : replyingTo.message_type === 'sticker'
                            ? t('messages.typeSticker')
                            : replyingTo.content}
                        </div>
                      </div>
                      <button
                        onClick={onReplyCancel}
                        className="ml-2 p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                      >
                        <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 附件预览区域 */}
                {pendingAttachments.length > 0 && (
                  <div className="px-3 md:px-4 pt-2 pb-1 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2">
                      {pendingAttachments.map((attachment) => {
                        // 书籍摘抄：不显示上传状态，直接展示摘抄卡片
                        if (attachment.excerptData) {
                          return (
                            <div key={attachment.id} className="relative group rounded-lg overflow-hidden border border-amber-200 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20">
                              <div className="px-3 py-2 flex items-center gap-2 min-w-[140px]">
                                <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-900 dark:text-gray-100 truncate">{attachment.excerptData.excerpt_text || t('messages.bookExcerpt')}</div>
                                  <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80 truncate">{attachment.excerptData.book_title}</div>
                                </div>
                                <button onClick={() => onRemoveAttachment(attachment.id)} className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><X className="w-2.5 h-2.5" /></button>
                              </div>
                            </div>
                          );
                        }
                        // 文件附件：按上传状态展示
                        const st = attachment.uploadStatus || 'pending';
                        const isUp = st === 'uploading' || st === 'pending';
                        const isDone = st === 'done';
                        const isErr = st === 'error';
                        const displayName = attachment.fileName || attachment.file_name || (attachment.file && 'name' in attachment.file ? attachment.file.name : undefined) || t('messages.attachmentLabel');
                        const displaySize = attachment.file_size ?? (attachment.file && 'size' in attachment.file ? attachment.file.size : undefined);
                        return (
                          <div
                            key={attachment.id}
                            className={`relative group rounded-lg overflow-hidden border ${isErr ? 'border-red-300 dark:border-red-600' : 'border-gray-200 dark:border-gray-600'}`}
                          >
                            {attachment.preview ? (
                              <div className="relative w-16 h-16 md:w-20 md:h-20">
                                <img src={attachment.preview} alt={t('messages.previewAlt')} className="w-full h-full object-cover" />
                                {isUp && (
                                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                                    <span className="text-[10px] text-white mt-0.5">{attachment.progress ?? 0}%</span>
                                  </div>
                                )}
                                {isDone && (
                                  <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                                {isErr && <div className="absolute bottom-0 left-0 right-0 bg-red-500/90 text-[10px] text-white px-1 truncate">{attachment.error || t('messages.uploadFailed')}</div>}
                                <button onClick={() => onRemoveAttachment(attachment.id)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div className="relative px-3 py-2 bg-gray-100 dark:bg-gray-700 flex items-center gap-2 min-w-[120px]">
                                <File className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
                                  {isUp && <div className="flex items-center gap-1 mt-0.5"><div className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${attachment.progress ?? 0}%` }} /></div><span className="text-[10px] text-gray-500">{attachment.progress ?? 0}%</span></div>}
                                  {isDone && <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5 mt-0.5"><Check className="w-3 h-3" /> {t('messages.uploadDone')}</div>}
                                  {isErr && <div className="text-[10px] text-red-500 truncate">{attachment.error || t('messages.uploadFailed')}</div>}
                                  {!isUp && !isDone && !isErr && displaySize != null && <div className="text-[10px] text-gray-500 dark:text-gray-400">{(displaySize / 1024).toFixed(1)} KB</div>}
                                </div>
                                <button onClick={() => onRemoveAttachment(attachment.id)} className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><X className="w-2.5 h-2.5" /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="relative px-3 md:px-4 py-1 md:py-1.5">
                  <textarea
                    ref={messageInputRef}
                    value={messageContent}
                    onChange={(e) => {
                      const value = e.target.value;
                      onMessageContentChange(value);

                      // 处理@提醒
                      if (conversationType === 'group') {
                        const cursorPosition = e.target.selectionStart;
                        const textBeforeCursor = value.substring(0, cursorPosition);
                        const atIndex = textBeforeCursor.lastIndexOf('@');

                        if (atIndex !== -1 && (atIndex === 0 || textBeforeCursor[atIndex - 1] === ' ' || textBeforeCursor[atIndex - 1] === '\n')) {
                          const query = textBeforeCursor.substring(atIndex + 1);
                          if (!query.includes(' ') && !query.includes('\n')) {
                            setMentionQuery(query);
                            setMentionPosition(atIndex);
                            setShowMentionList(true);
                          } else {
                            setShowMentionList(false);
                          }
                        } else {
                          setShowMentionList(false);
                        }
                      }
                    }}
                    onPaste={(e) => {
                      const cd = e.clipboardData;
                      if (!cd) return;
                      if (cd.files && cd.files.length > 0) {
                        e.preventDefault();
                        onFileSelect(cd.files);
                        const n = cd.files.length;
                        toast.success(n === 1 && cd.files[0].type.startsWith('image/') ? t('messages.imagePasted') : t('messages.filesPasted'));
                        return;
                      }
                      const items = cd.items;
                      if (!items) return;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].kind !== 'file') continue;
                        const file = items[i].getAsFile();
                        if (file) {
                          e.preventDefault();
                          const dt = new DataTransfer();
                          dt.items.add(file);
                          onFileSelect(dt.files);
                          toast.success(file.type.startsWith('image/') ? t('messages.imagePasted') : t('messages.filesPasted'));
                          return;
                        }
                      }
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSendMessage();
                        if (showEmojiPicker) {
                          onToggleEmojiPicker();
                        }
                      }
                    }}
                    className="w-full bg-transparent border-0 outline-none resize-y text-sm md:text-base text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 leading-6 overflow-y-auto"
                    style={{
                      minHeight: '40px',
                      maxHeight: '216px',
                      resize: 'vertical',
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent',
                    }}
                    placeholder="输入消息..."
                    disabled={sending || isRecording}
                    rows={1}
                  />
                </div>
              </div>
            )}

            {/* @提醒列表 */}
            {showMentionList && conversationType === 'group' && groupMembers.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto z-10">
                {groupMembers
                  .filter(member =>
                    mentionQuery === '' ||
                    member.username?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                    member.nickname?.toLowerCase().includes(mentionQuery.toLowerCase())
                  )
                  .slice(0, 10)
                  .map((member) => (
                    <button
                      key={member.id}
                      onClick={() => {
                        const beforeAt = messageContent.substring(0, mentionPosition);
                        const afterCursor = messageContent.substring(messageInputRef.current!.selectionStart);
                        const mentionText = `@${member.nickname || member.username} `;
                        const newContent = beforeAt + mentionText + afterCursor;
                        onMessageContentChange(newContent);
                        setShowMentionList(false);

                        // 设置光标位置
                        setTimeout(() => {
                          if (messageInputRef.current) {
                            const newPosition = mentionPosition + mentionText.length;
                            messageInputRef.current.setSelectionRange(newPosition, newPosition);
                            messageInputRef.current.focus();
                          }
                        }, 0);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 first:rounded-t-lg last:rounded-b-lg"
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {(member.nickname || member.username || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {member.nickname || member.username}
                        </div>
                        {member.nickname && member.username !== member.nickname && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            @{member.username}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                {groupMembers.filter(member =>
                  mentionQuery === '' ||
                  member.username?.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                  member.nickname?.toLowerCase().includes(mentionQuery.toLowerCase())
                ).length === 0 && (
                  <div className="px-4 py-2 text-center text-gray-500 dark:text-gray-400">
                    {t('messages.mentionNoUser')}
                  </div>
                )}
              </div>
            )}

            {/* 发送：使用 Enter 发送，Shift+Enter 换行，不再显示发送按钮 */}
          </div>
        </div>
      </div>

      {/* 图片预览 */}
      {previewImageUrl && (
        <ImageViewer
          imageUrl={previewImageUrl}
          isVisible={true}
          onClose={() => setPreviewImageUrl(null)}
          doubleClickToClose={true}
        />
      )}
    </div>
  );
};