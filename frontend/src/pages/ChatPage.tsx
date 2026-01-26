/**
 * @file ChatPage.tsx
 * @author ttbye
 * @date 2025-01-01
 * @description 独立聊天页面 - 不包含系统导航栏，专注聊天体验
 * 微信风格的对话界面，支持好友对话和群组对话
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useDomTheme } from '../hooks/useDomTheme';
import api, { getFullApiUrl, getMessageFileApiPath, getAuthenticatedFileUrl, getAvatarUrl } from '../utils/api';
import { encrypt, decrypt, decryptAsSender, isE2EEContent, hasLocalPrivateKey } from '../utils/e2ee';
import toast from 'react-hot-toast';
import {
  Mic, Plus, Smile, File as FileIcon, X, Volume2, Image as ImageIcon,
  MessageCircle, Users, UserPlus, Phone, Video, MoreVertical,
  Copy, Reply, BookOpen, RotateCcw, XCircle, Forward, VolumeX, Ban, ChevronLeft, Download, Loader2, Check, ShieldCheck
} from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';
import { ForwardModal, AddToLibraryModal } from '../components/messages';
import type { AddToLibraryMessage, AddToLibraryOptions } from '../components/messages';
import { StickerPicker, StickerItem } from '../components/messages/StickerPicker';
import { useAuthStore } from '../store/authStore';
import { useMobileKeyboard } from '../hooks/useMobileKeyboard';
import { formatTimeOnly, formatDateForSeparator, getDateKeyInSystemTZ, syncTimezoneFromBackendGlobal } from '../utils/timezone';
import { notificationService } from '../utils/notificationService';

interface Message {
  id: string;
  from_user_id: string;
  to_user_id?: string;
  group_id?: string;
  message_type: string;
  content: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  created_at: string;
  from_username: string;
  from_nickname: string;
  is_read?: number;
  duration?: number;
  reply_to_message_id?: string;
  reply_content?: string;
  reply_from_nickname?: string;
  reply_from_username?: string;
  reply_message_type?: string;
  is_recalled?: boolean;
  is_deleted?: boolean;
  local_audio_blob?: Blob;
  playing?: boolean;
}

interface Conversation {
  id: string;
  other_user_id?: string;
  group_id?: string;
  group_name?: string;
  other_username?: string;
  other_nickname?: string;
  conversation_type: 'friend' | 'group';
}

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId, type } = useParams<{ conversationId: string; type: 'friend' | 'group' }>();
  const { user } = useAuthStore();
  const domTheme = useDomTheme(); // 获取DOM主题，确保主题切换时重新渲染

  // ============ 状态管理 ============
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [showVoiceButton, setShowVoiceButton] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    file: File;
    preview?: string;
    id: string;
    uploadStatus?: 'pending' | 'uploading' | 'done' | 'error';
    progress?: number;
    file_path?: string;
    file_name?: string;
    file_size?: number;
    file_type?: string | null;
    error?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [friendsForForward, setFriendsForForward] = useState<any[]>([]);
  const [groupsForForward, setGroupsForForward] = useState<any[]>([]);
  const [addToLibraryMessage, setAddToLibraryMessage] = useState<Message | null>(null);
  const [showConversationSettings, setShowConversationSettings] = useState(false);
  const [conversationSettings, setConversationSettings] = useState<{ is_muted: boolean; is_blocked: boolean }>({
    is_muted: false,
    is_blocked: false
  });
  const [isPWA, setIsPWA] = useState(false);
  const [, setTzSynced] = useState(0);

  // @提醒相关状态
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);

  // 语音相关状态
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voicePlaybackTime, setVoicePlaybackTime] = useState<number>(0);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingCancelRef = useRef<boolean>(false);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // ============ 右键菜单状态 ============
  const [contextMenu, setContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);

  // ============ E2EE 状态 ============
  const [showE2EERecoveryPrompt, setShowE2EERecoveryPrompt] = useState(false);

  // ============ 长按状态 ============
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // ============ Refs ============
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceButtonRef = useRef<HTMLButtonElement>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageTimeRef = useRef<string>('');
  const isPageVisibleRef = useRef<boolean>(true);
  const isRefreshingAfterSendRef = useRef<boolean>(false); // 发送消息后正在刷新的标志
  const noNewMessageCountRef = useRef<number>(0); // 连续没有新消息的次数

  useMobileKeyboard({ scrollContainerRef: messagesScrollRef, inputRef: chatInputRef });

  // 从设置同步时区（ChatPage 无 Layout，需自行拉取）
  useEffect(() => {
    const sync = async () => {
      try {
        await syncTimezoneFromBackendGlobal();
        setTzSynced((n) => n + 1);
      } catch (error) {
        console.error('[时区调试] 时区同步失败:', error);
      }
    };
    sync();
  }, []);

// ============ 工具函数 ============
const scrollToBottom = () => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
};

// 将Float32Array转换为WAV格式的Blob
const float32ArrayToWav = (buffer: Float32Array, sampleRate: number): Blob => {
  const length = buffer.length;
  const arrayBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(arrayBuffer);

  // WAV文件头
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);

  // 转换Float32到16位PCM
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(offset, sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

  // 获取安全区域偏移
  const getLeftSafeAreaInset = (): string => {
    if (typeof window === 'undefined') return '8px';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-left') || '8px';
  };

  const getTopSafeAreaInset = (): string => {
    if (typeof window === 'undefined') return '8px';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top') || '8px';
  };

  // 检查是否为书籍文件
  const isBookFile = (message: Message): boolean => {
    if (!message.file_type || !message.file_name) return false;
    const extension = message.file_name.toLowerCase().split('.').pop();
    return ['epub', 'pdf', 'mobi', 'azw', 'azw3', 'fb2', 'djvu', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(extension || '');
  };

  // 检查消息是否可以撤回（5分钟内）
  const canRecallMessage = (message: Message): boolean => {
    const now = new Date().getTime();
    const messageTime = new Date(message.created_at).getTime();
    const diffMinutes = (now - messageTime) / (1000 * 60);
    return diffMinutes <= 5;
  };

  // 是否有可下载的附件（file_path 经认证 API 可获取）
  const hasDownloadableAttachment = (message: Message): boolean => !!getMessageFileApiPath(message.file_path);

  const downloadAttachment = async (message: Message) => {
    const fileApiPath = getMessageFileApiPath(message.file_path);
    if (!fileApiPath) return;
    try {
      const res = await api.get(fileApiPath, { responseType: 'blob' });
      const blob = res.data as Blob;
      const name = message.file_path?.split('/').pop();
      const filename = message.file_name || name || (message.message_type === 'image' ? 'image.png' : message.message_type === 'sticker' ? 'sticker.png' : message.message_type === 'voice' ? 'voice.ogg' : 'file');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setContextMenu(null);
      toast.success(t('messages.attachmentDownloaded') || '已下载');
    } catch (e) {
      console.error('下载附件失败:', e);
      toast.error(t('messages.fileDownloadFailed') || '下载失败');
    }
  };

  // 语音消息相关函数
  const clearRecordingTimers = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(t('messages.microphoneNotSupported'));
      return;
    }
    try {
      clearRecordingTimers();
      console.log('[录音] 开始录音流程...');

      // 方法1: 使用Web Audio API手动录音
      console.log('[录音] 尝试使用Web Audio API...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        console.log('[录音] 获取音频流成功');

        // 检查音频轨道
        const audioTracks = stream.getAudioTracks();
        console.log('[录音] 音频轨道数量:', audioTracks.length);

        if (audioTracks.length === 0) {
          throw new Error('没有找到音频轨道');
        }

        const track = audioTracks[0];
        console.log('[录音] 音频轨道信息:', {
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          label: track.label,
          settings: track.getSettings()
        });

        // 使用Web Audio API
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        const chunks: Float32Array[] = [];
        let isRecording = false;

        processor.onaudioprocess = (event) => {
          if (!isRecording) return;

          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);

          // 复制音频数据
          const chunk = new Float32Array(inputData.length);
          chunk.set(inputData);
          chunks.push(chunk);

          console.log('[录音] 收集音频数据块，长度:', inputData.length);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        recordingStreamRef.current = stream;
        recordingStartTimeRef.current = Date.now();
        isRecording = true;

        console.log('[录音] Web Audio API录音已启动');

        // 创建停止函数
        const stopWebAudioRecording = () => {
          console.log('[录音] 停止Web Audio录音');
          isRecording = false;

          setTimeout(() => {
            // 断开音频节点
            source.disconnect();
            processor.disconnect();

            // 停止音频流
            stream.getTracks().forEach(track => {
              track.stop();
              track.enabled = false;
            });
            recordingStreamRef.current = null;

            // 处理录音数据
            if (chunks.length === 0) {
              console.error('[录音] 没有收集到音频数据');
              toast.error(t('messages.noValidVoice'));
              return;
            }

            console.log('[录音] 处理录音数据，数据块数量:', chunks.length);

            // 计算总长度
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const audioData = new Float32Array(totalLength);
            let offset = 0;

            for (const chunk of chunks) {
              audioData.set(chunk, offset);
              offset += chunk.length;
            }

            console.log('[录音] 音频数据总长度:', totalLength);

            // 转换为WAV格式
            const wavBlob = float32ArrayToWav(audioData, audioContext.sampleRate);
            const duration = Math.max(1, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));

            console.log('[录音] WAV文件大小:', wavBlob.size);
            handleVoiceMessage(wavBlob, duration);
          }, 100);
        };

        // 设置最大录音时间
        recordingTimeoutRef.current = setTimeout(() => {
          stopWebAudioRecording();
          setIsRecording(false);
          setRecordingTime(0);
        }, 60000);

        // 开始倒计时
        recordingIntervalRef.current = setInterval(() => {
          setRecordingTime(prev => {
            const newTime = prev + 1;
            if (newTime >= 60) {
              stopWebAudioRecording();
              return 60;
            }
            return newTime;
          });
        }, 1000);

        setIsRecording(true);
        setRecordingTime(0);

        return;
      } catch (webAudioError) {
        console.warn('[录音] Web Audio API失败，回退到MediaRecorder:', webAudioError);
      }

      // 方法2: 回退到MediaRecorder
      console.log('[录音] 使用MediaRecorder作为回退方案');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      console.log('[录音] 获取音频流成功', { tracks: stream.getAudioTracks().length });
      stream.getAudioTracks().forEach(track => {
        console.log('[录音] 音频轨道:', {
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          label: track.label
        });
        track.enabled = true;
      });

      // 尝试多种MIME类型
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
        'audio/mpeg'
      ];

      const supportedType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      const recorderOptions: MediaRecorderOptions = supportedType ? { mimeType: supportedType } : {};

      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];
      recordingCancelRef.current = false;
      recordingStreamRef.current = stream;

      recorder.ondataavailable = (event) => {
        console.log('[录音] MediaRecorder收到数据块:', { size: event.data?.size, type: event.data?.type });
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearRecordingTimers();
        setIsRecording(false);
        setRecordingTime(0);
        const duration = Math.max(1, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));

        setTimeout(() => {
          stream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
          });
          recordingStreamRef.current = null;
        }, 100);

        if (recordingCancelRef.current) {
          chunks.length = 0;
          return;
        }

        if (chunks.length === 0) {
          console.error('[录音] MediaRecorder没有收到数据');
          toast.error(t('messages.noValidVoice'));
          return;
        }

        const recorderMimeType = recorder.mimeType || supportedType || 'audio/webm';
        const audioBlob = new Blob(chunks, { type: recorderMimeType });

        if (audioBlob.size === 0) {
          console.error('[录音] MediaRecorder Blob大小为0');
          toast.error(t('messages.voiceFileEmpty'));
          return;
        }

        console.log('[录音] MediaRecorder录音完成', {
          duration,
          blobSize: audioBlob.size,
          mimeType: recorderMimeType
        });

        handleVoiceMessage(audioBlob, duration);
      };

      recorder.onerror = (event) => {
        console.error('[录音] MediaRecorder错误:', event);
        toast.error(t('messages.recordingError'));
        cancelRecording();
      };

      mediaRecorderRef.current = recorder;
      recordingStartTimeRef.current = Date.now();

      recorder.start();
      console.log('[录音] MediaRecorder开始录音', { mimeType: recorder.mimeType });

      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= 60) {
            stopRecording();
            return 60;
          }
          return newTime;
        });
      }, 1000);

      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 60000);

    } catch (error: any) {
      console.error('开始录音失败:', error);
      const name = error?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        const isPWA = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || !!(navigator as any).standalone);
        toast.error(t(isPWA ? 'messages.microphoneNotAllowedHintPWA' : 'messages.microphoneNotAllowedHintSafari'));
      } else if (name === 'NotFoundError') {
        toast.error(t('messages.microphoneNotFound'));
      } else {
        toast.error(t('messages.cannotAccessMicrophone'));
      }
    }
  };

  const stopRecording = () => {
    clearRecordingTimers();
    // 注意：停止逻辑现在在startRecording函数中处理
    setIsRecording(false);
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    recordingCancelRef.current = true;
    clearRecordingTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  const handleVoiceMessage = async (audioBlob: Blob, duration: number) => {
    if (audioBlob.size === 0) return;

    try {
      const formData = new FormData();
      formData.append('content', `[语音消息 ${duration}秒]`);
      formData.append('messageType', 'voice');
      formData.append('duration', duration.toString());

      if (type === 'friend') {
        formData.append('toUserId', conversationId);
      } else {
        formData.append('groupId', conversationId);
      }

      const fileExt = audioBlob.type.includes('ogg')
        ? 'ogg'
        : audioBlob.type.includes('webm')
        ? 'webm'
        : audioBlob.type.includes('wav')
        ? 'wav'
        : 'webm';
      formData.append('file', audioBlob, `voice-${Date.now()}.${fileExt}`);

      await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // 延迟一下再刷新消息列表，确保后端已保存
      setTimeout(() => {
        // 强制刷新消息列表，确保新消息显示
        fetchMessages(true, false);
      }, 300);
    } catch (error) {
      console.error('发送语音消息失败:', error);
      toast.error(t('messages.sendVoiceFailed'));
    }
  };

  const playVoiceMessage = async (message: Message) => {
    try {
      if (playingVoiceId === message.id) {
        // 停止播放
        setPlayingVoiceId(null);
        setVoicePlaybackTime(0);
        return;
      }

      setPlayingVoiceId(message.id);

      let audioBlob: Blob;
      let mimeType: string;

      if (message.local_audio_blob) {
        // 播放本地音频
        audioBlob = message.local_audio_blob;
        mimeType = message.local_audio_blob.type || 'audio/webm';
      } else {
        const fileApiPath = getMessageFileApiPath(message.file_path);
        if (!fileApiPath) {
          toast.error(t('messages.voiceFileNotFound'));
          setPlayingVoiceId(null);
          return;
        }
        // 经认证 API 获取远程音频
        const blobResponse = await api.get(fileApiPath, { responseType: 'blob' });
        audioBlob = blobResponse.data;
        
        // 确保 MIME 类型正确
        mimeType = audioBlob.type || 'audio/webm';
        
        // 如果 MIME 类型不正确，根据文件扩展名推断
        if (!mimeType || mimeType === 'application/octet-stream') {
          const fileExt = (message.file_path || '').split('.').pop()?.toLowerCase();
          const mimeTypeMap: { [key: string]: string } = {
            'webm': 'audio/webm',
            'ogg': 'audio/ogg',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'm4a': 'audio/mp4',
            'aac': 'audio/aac',
          };
          mimeType = mimeTypeMap[fileExt || ''] || 'audio/webm';
        }
      }

      // 验证 blob 大小
      if (audioBlob.size === 0) {
        toast.error(t('messages.voiceFileEmpty'));
        setPlayingVoiceId(null);
        return;
      }

      // 创建正确 MIME 类型的 Blob
      const typedBlob = new Blob([audioBlob], { type: mimeType });
      const audioUrl = URL.createObjectURL(typedBlob);
      const audio = new Audio(audioUrl);

      // 确保音频元素被添加到DOM中（某些浏览器需要）
      document.body.appendChild(audio);
      audio.style.display = 'none';

      // 设置音量和播放参数
      audio.volume = 1.0;
      audio.muted = false;
      audio.preload = 'auto';
      
      console.log('[播放语音] 音频元素创建', {
        volume: audio.volume,
        muted: audio.muted,
        blobSize: audioBlob.size,
        mimeType,
        audioUrl: audioUrl.substring(0, 50) + '...'
      });

      // 监听播放进度
      const updateProgress = () => {
        if (audio.duration) {
          setVoicePlaybackTime(audio.currentTime);
        }
      };
      audio.addEventListener('timeupdate', updateProgress);

      audio.onloadedmetadata = () => {
        console.log('[播放语音] 音频元数据加载完成', {
          duration: audio.duration,
          blobSize: audioBlob.size,
          mimeType,
          volume: audio.volume,
          muted: audio.muted,
          readyState: audio.readyState
        });
      };

      audio.oncanplay = () => {
        console.log('[播放语音] 音频可以播放', {
          readyState: audio.readyState,
          volume: audio.volume,
          muted: audio.muted
        });
      };
      
      audio.onplay = () => {
        console.log('[播放语音] 开始播放', {
          currentTime: audio.currentTime,
          duration: audio.duration,
          volume: audio.volume,
          muted: audio.muted
        });
      };

      audio.onended = () => {
        setPlayingVoiceId(null);
        setVoicePlaybackTime(0);
        URL.revokeObjectURL(audioUrl);
        audio.removeEventListener('timeupdate', updateProgress);
        // 清理DOM中的音频元素
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      };

      audio.onerror = (e) => {
        console.error('[播放语音] 播放错误:', e, {
          error: audio.error,
          blobSize: audioBlob.size,
          mimeType
        });
        setPlayingVoiceId(null);
        setVoicePlaybackTime(0);
        URL.revokeObjectURL(audioUrl);
        audio.removeEventListener('timeupdate', updateProgress);
        // 清理DOM中的音频元素
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
        toast.error(t('messages.playFailed') + ': ' + (audio.error?.message || ''));
      };

      // 等待音频可以播放后再播放
      await new Promise<void>((resolve, reject) => {
        audio.oncanplaythrough = () => resolve();
        audio.onerror = () => reject(new Error('音频加载失败'));
        // 设置超时
        setTimeout(() => {
          if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
            resolve();
          } else {
            reject(new Error('音频加载超时'));
          }
        }, 5000);
      });

      // 尝试激活音频上下文（某些浏览器需要）
      try {
        if (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined') {
          const AudioContextClass = AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContextClass();
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
        }
      } catch (e) {
        console.warn('[播放语音] 音频上下文激活失败:', e);
      }

      await audio.play();
      console.log('[播放语音] 开始播放', { messageId: message.id });
    } catch (error: any) {
      console.error('[播放语音] 播放失败:', error);
      setPlayingVoiceId(null);
      setVoicePlaybackTime(0);
      toast.error(t('messages.playFailed') + ': ' + (error.message || ''));
    }
  };

  // ============ API调用 ============
  const fetchConversation = async () => {
    if (!conversationId || !type) return;

    try {
      let response;
      try {
        response = await api.get(`/messages/conversation/${type}/${conversationId}`);
      } catch (error: any) {
        // 如果是429错误（请求过于频繁），等待1秒后重试一次
        if (error.response?.status === 429) {
          console.warn('[fetchConversation] 429错误，等待1秒后重试');
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get(`/messages/conversation/${type}/${conversationId}`);
        } else {
          throw error;
        }
      }

      setConversation(response.data.conversation);

      // 获取对话设置
      try {
        const settingsResponse = await api.get(`/messages/conversation/${type}/${conversationId}/settings`);
        setConversationSettings({
          is_muted: settingsResponse.data.is_muted || false,
          is_blocked: settingsResponse.data.is_blocked || false
        });
      } catch (e: any) {
        // 如果是429错误，重试一次
        if (e.response?.status === 429) {
          console.warn('[fetchConversation] 设置获取429错误，重试一次');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const settingsResponse = await api.get(`/messages/conversation/${type}/${conversationId}/settings`);
          setConversationSettings({
            is_muted: settingsResponse.data.is_muted || false,
            is_blocked: settingsResponse.data.is_blocked || false
          });
        } else {
          // 如果获取设置失败，使用默认值
          setConversationSettings({ is_muted: false, is_blocked: false });
        }
      }
    } catch (error) {
      console.error('获取对话信息失败:', error);
      toast.error(t('messages.fetchConversationsFailed'));
    }
  };

  const toggleMute = async () => {
    if (!conversationId || !type) return;
    
    try {
      const newMutedState = !conversationSettings.is_muted;
      await api.post(`/messages/conversation/${type}/${conversationId}/mute`, { _method: 'PUT',
        muted: newMutedState
      });
      setConversationSettings(prev => ({ ...prev, is_muted: newMutedState }));
      toast.success(newMutedState ? t('messages.setMuted') : t('messages.setUnmuted'));
    } catch (error) {
      console.error('设置静音失败:', error);
      toast.error(t('messages.muteFailed'));
    }
  };

  const toggleBlock = async () => {
    if (!conversationId || !type) return;
    
    if (!conversationSettings.is_blocked) {
      if (!confirm(t('messages.addToBlocklistConfirm'))) {
        return;
      }
    }
    
    try {
      const newBlockedState = !conversationSettings.is_blocked;
      await api.post(`/messages/conversation/${type}/${conversationId}/block`, { _method: 'PUT',
        blocked: newBlockedState
      });
      setConversationSettings(prev => ({ ...prev, is_blocked: newBlockedState }));
      toast.success(newBlockedState ? t('messages.setBlocklist') : t('messages.setUnblocklist'));
      
      if (newBlockedState) {
        // 加入黑名单后，刷新消息列表
        fetchMessages(true);
      }
    } catch (error) {
      console.error('设置黑名单失败:', error);
      toast.error(t('messages.muteFailed'));
    }
  };

  const fetchGroupMembers = async () => {
    if (type !== 'group' || !conversationId) return;

    try {
      const response = await api.get(`/groups/${conversationId}/members`);
      setGroupMembers(response.data.members || []);
    } catch (error) {
      console.error('获取群组成员失败:', error);
      setGroupMembers([]);
    }
  };

  const fetchMessages = async (force = false, checkNewOnly = false) => {
    if (!conversationId || !type) return;

    try {
      // 如果checkNewOnly为true但没有lastMessageTimeRef，则回退到完整刷新
      if (checkNewOnly && !lastMessageTimeRef.current) {
        checkNewOnly = false;
        force = true;
      }

      // 对于好友消息使用 /messages/conversation/:userId，对于群组消息使用 /messages/group/:groupId
      const endpoint = type === 'friend'
        ? `/messages/conversation/${conversationId}`
        : `/messages/group/${conversationId}`;
      
      // 如果只检查新消息，添加 since 参数
      // 注意：使用稍微早一点的时间（减去1秒），避免因为时间精度问题漏掉消息
      const params: any = {};
      if (checkNewOnly && lastMessageTimeRef.current) {
        try {
          const sinceDate = new Date(lastMessageTimeRef.current);
          // 减去1秒，确保不会因为时间精度问题漏掉同一秒内的消息
          sinceDate.setSeconds(sinceDate.getSeconds() - 1);
          params.since = sinceDate.toISOString();
          if (import.meta.env.DEV) {
            console.log('[fetchMessages] 轮询检查新消息，since:', params.since, '原始:', lastMessageTimeRef.current);
          }
        } catch (e) {
          // 如果时间解析失败，使用原始值
          params.since = lastMessageTimeRef.current;
          if (import.meta.env.DEV) {
            console.warn('[fetchMessages] 时间解析失败，使用原始值:', lastMessageTimeRef.current);
          }
        }
      }
      
      let response;
      try {
        response = await api.get(endpoint, { params });
      } catch (error: any) {
        // 如果是429错误（请求过于频繁），等待1秒后重试一次
        if (error.response?.status === 429) {
          console.warn('[fetchMessages] 429错误，等待1秒后重试:', endpoint);
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get(endpoint, { params });
        } else {
          throw error;
        }
      }
      const newMessages = response.data.messages || [];
      
      if (import.meta.env.DEV && checkNewOnly) {
        console.log('[fetchMessages] 轮询返回:', {
          newMessagesCount: newMessages.length,
          since: params.since,
          lastMessageTime: lastMessageTimeRef.current
        });
      }

      // 异步处理E2EE解密，不阻塞消息显示
      setTimeout(async () => {
        const messagesToUpdate: { id: string; content: string }[] = [];

        for (const m of newMessages) {
          if (m.message_type === 'text' && isE2EEContent(m.content)) {
            let decryptedContent = m.content;
            if (m.from_user_id === user?.id) {
              // 本人发送的：用收件人公钥+己方私钥解密，发送端本地可显示原文
              const recipientId = type === 'friend' ? conversationId : null;
              const decrypted = recipientId ? await decryptAsSender(m.content, recipientId) : null;
              if (!decrypted) {
                decryptedContent = '[E2EE消息 - 请检查本地密钥]';
                // 触发密钥检查和恢复提示
                setTimeout(() => checkAndPromptE2EERecovery(), 100);
              } else {
                decryptedContent = decrypted;
              }
            } else {
              const decrypted = await decrypt(m.content, m.from_user_id);
              if (!decrypted) {
                decryptedContent = '[E2EE消息 - 需要恢复密钥]';
                // 触发密钥检查和恢复提示
                setTimeout(() => checkAndPromptE2EERecovery(), 100);
              } else {
                decryptedContent = decrypted;
              }
            }

            // 总是更新E2EE消息，即使内容已经是占位符
            messagesToUpdate.push({ id: m.id, content: decryptedContent });
          }
        }

        // 批量更新解密后的消息内容
        if (messagesToUpdate.length > 0) {
          setMessages(prev => prev.map(msg =>
            messagesToUpdate.find(update => update.id === msg.id)
              ? { ...msg, content: messagesToUpdate.find(update => update.id === msg.id)!.content }
              : msg
          ));
        }
      }, 0);
      if (checkNewOnly) {
        // 只检查新消息模式
        // console.log('[轮询] 检查新消息结果:', {
        //   checkNewOnly,
        //   newMessagesCount: newMessages.length,
        //   lastMessageTime: lastMessageTimeRef.current
        // });

        if (newMessages.length > 0) {
          // 立即添加新消息到列表（先显示占位符或原始内容），然后再异步解密
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            // 先处理E2EE消息，显示占位符
            const processedNewMessages = newMessages.map((m: Message) => {
              if (m.message_type === 'text' && isE2EEContent(m.content)) {
                // E2EE消息先显示占位符
                return {
                  ...m,
                  content: '[E2EE消息 - 解密中...]'
                };
              }
              return m;
            });
            
            const trulyNew = processedNewMessages.filter((m: Message) => !existingIds.has(m.id));

            if (import.meta.env.DEV) {
              console.log('[ChatPage轮询] 检查新消息:', {
                newMessagesCount: newMessages.length,
                existingIdsCount: existingIds.size,
                trulyNewCount: trulyNew.length,
                newMessageIds: newMessages.map(m => m.id),
                existingIds: Array.from(existingIds).slice(0, 5), // 只显示前5个
                trulyNewIds: trulyNew.map(m => m.id)
              });
            }

            if (trulyNew.length > 0) {
              // 重置计数器
              noNewMessageCountRef.current = 0;

              // 更新最后一条消息的时间（使用所有新消息中的最新时间）
              const latestMessage = [...trulyNew].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0];
              lastMessageTimeRef.current = latestMessage.created_at;
              
              if (import.meta.env.DEV) {
                console.log('[ChatPage轮询] 成功添加新消息:', {
                  trulyNewCount: trulyNew.length,
                  latestMessageTime: latestMessage.created_at,
                  updatedLastMessageTime: lastMessageTimeRef.current
                });
              }
              
              // 立即添加到消息列表
              const updatedMessages = [...prev, ...trulyNew].sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
              
              // 异步解密E2EE消息并更新
              (async () => {
                const messagesToUpdate: { id: string; content: string }[] = [];
                
                for (const m of trulyNew) {
                  if (m.message_type === 'text' && isE2EEContent(m.content)) {
                    let decryptedContent = '[E2EE消息 - 解密中...]';
                    const hasLocalKey = await hasLocalPrivateKey();

                    if (m.from_user_id === user?.id) {
                      // 本人发送的：用收件人公钥+己方私钥解密
                      const recipientId = type === 'friend' ? conversationId : null;
                      const decrypted = recipientId && hasLocalKey ? await decryptAsSender(m.content, recipientId) : null;
                      if (!decrypted) {
                        decryptedContent = '[E2EE消息 - 请检查本地密钥]';
                        setTimeout(() => checkAndPromptE2EERecovery(), 100);
                      } else {
                        decryptedContent = decrypted;
                      }
                    } else {
                      const decrypted = hasLocalKey ? await decrypt(m.content, m.from_user_id) : null;
                      if (!decrypted) {
                        decryptedContent = '[E2EE消息 - 需要恢复密钥]';
                        setTimeout(() => checkAndPromptE2EERecovery(), 100);
                      } else {
                        decryptedContent = decrypted;
                      }
                    }

                    messagesToUpdate.push({ id: m.id, content: decryptedContent });
                  }
                }

                // 批量更新解密后的消息内容
                if (messagesToUpdate.length > 0) {
                  setMessages(prevMsgs => prevMsgs.map(msg => {
                    const update = messagesToUpdate.find(u => u.id === msg.id);
                    return update ? { ...msg, content: update.content } : msg;
                  }));
                }
              })();
              
              // 显示通知和声音提醒（如果未静音且未拉黑）
              if (!conversationSettings.is_muted && !conversationSettings.is_blocked) {
                trulyNew.forEach((msg: Message) => {
                  if (msg.from_user_id !== user?.id) {
                    const senderName = msg.from_nickname || msg.from_username || '未知用户';
                    const messageText = msg.message_type === 'voice' 
                      ? '[语音消息]' 
                      : msg.message_type === 'image'
                      ? '[图片]'
                      : msg.message_type === 'sticker'
                      ? '[表情]'
                      : msg.content || '[消息]';
                    
                    // 显示系统通知和声音提醒
                    notificationService.showMessageNotification(
                      senderName,
                      messageText,
                      conversationId,
                      type,
                      true // 重要通知
                    );
                  }
                });
              }
              
              // 确保消息状态更新后立即滚动到底部
              setTimeout(() => {
                scrollToBottom();
              }, 0);
              
              return updatedMessages;
            }
            return prev;
          });
        } else {
          // 如果API返回了消息但都被过滤掉了，可能是ID重复或其他问题
          // 这种情况下，我们应该强制完整刷新一次，确保不遗漏消息
          if (newMessages.length > 0) {
            if (import.meta.env.DEV) {
              // 重新获取 existingIds 用于日志
              setMessages(prev => {
                const existingIdsForLog = new Set(prev.map(m => m.id));
                console.warn('[ChatPage轮询] API返回了新消息，但都被过滤掉了，强制完整刷新:', {
                  newMessagesCount: newMessages.length,
                  existingIdsCount: existingIdsForLog.size,
                  newMessageIds: newMessages.map(m => m.id),
                  existingIds: Array.from(existingIdsForLog).slice(0, 10)
                });
                return prev;
              });
            }
            
            // 强制完整刷新一次，确保不遗漏消息
            // 但不要立即执行，避免频繁刷新，延迟一下
            setTimeout(() => {
              if (conversationId && type) {
                fetchMessages(true, false).catch(err => {
                  if (err.response?.status !== 429) {
                    console.error('[ChatPage] 强制刷新失败:', err);
                  }
                });
              }
            }, 1000);
          } else {
            // 如果API没有返回新消息，增加计数器
            noNewMessageCountRef.current += 1;
            
            // 如果连续5次（约10秒）没有新消息，但可能有未读消息，强制完整刷新一次
            if (noNewMessageCountRef.current >= 5) {
              if (import.meta.env.DEV) {
                console.log('[ChatPage轮询] 连续多次没有新消息，强制完整刷新检查');
              }
              noNewMessageCountRef.current = 0; // 重置计数器
              
              // 延迟执行，避免与正常轮询冲突
              setTimeout(() => {
                if (conversationId && type && !isRefreshingAfterSendRef.current) {
                  fetchMessages(true, false).catch(err => {
                    if (err.response?.status !== 429) {
                      console.error('[ChatPage] 定期强制刷新失败:', err);
                    }
                  });
                }
              }, 500);
            }
          }
        }
      } else {
        // 首次加载或强制刷新，替换所有消息
        // 重置计数器
        noNewMessageCountRef.current = 0;
        
        // 先处理E2EE消息，将未解密的内容替换为占位符，避免显示JSON格式
        const processedMessages = newMessages.map((m: Message) => {
          if (m.message_type === 'text' && isE2EEContent(m.content)) {
            // 如果是E2EE消息，先显示占位符，等待异步解密
            return {
              ...m,
              content: m.from_user_id === user?.id 
                ? '[E2EE消息 - 解密中...]' 
                : '[E2EE消息 - 解密中...]'
            };
          }
          return m;
        });
        setMessages(processedMessages);
        if (newMessages.length > 0) {
          // 找到时间最新的消息（按created_at排序）
          const latestMessage = [...newMessages].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          lastMessageTimeRef.current = latestMessage.created_at;
        } else {
          // 如果消息列表为空，清空lastMessageTimeRef，以便下次完整刷新
          lastMessageTimeRef.current = '';
        }
        scrollToBottom();
      }
    } catch (error: any) {
      console.error('获取消息失败:', error);
      const status = error?.response?.status;
      // 群组 403：已不是成员（已退出/被移除/群已解散），停止轮询并返回
      if (status === 403 && type === 'group') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        toast.error(error?.response?.data?.error || t('messages.notGroupMemberAnymore'));
        navigate('/messages');
        return;
      }
      if (!checkNewOnly) {
        toast.error(t('messages.fetchMessagesFailed'));
      }
    } finally {
      if (!checkNewOnly) {
        setLoading(false);
      }
    }
  };

  const sendMessage = async () => {
    if (!conversationId || !type) return;
    const hasText = !!messageContent.trim();
    const doneAttachments = pendingAttachments.filter(a => a.uploadStatus === 'done');
    if (!hasText && doneAttachments.length === 0) return;
    if (pendingAttachments.some(a => a.uploadStatus === 'pending' || a.uploadStatus === 'uploading')) {
      toast.error(t('messages.pleaseWaitUpload') || '请等待附件上传完成');
      return;
    }

    try {
      setSending(true);

      // 先清空输入框，给用户即时反馈
      const textToSend = messageContent.trim();
      setMessageContent('');
      setReplyingTo(null);
      setShowEmojiPicker(false);
      setShowStickerPicker(false);

      // 如果有文本内容，先发送文本消息（1:1 且在双方具备 E2EE 时端到端加密）
      if (hasText) {
        const textFormData = new FormData();
        let contentToSend = textToSend;
        
        // E2EE加密：添加超时机制，避免阻塞太久
        if (type === 'friend') {
          try {
            const enc = await Promise.race([
              encrypt(contentToSend, conversationId),
              new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 2000)) // 2秒超时
            ]);
            if (enc) contentToSend = enc;
          } catch (error) {
            console.warn('[发送消息] E2EE加密失败，发送未加密消息:', error);
            // 加密失败时继续发送未加密消息
          }
        }
        
        textFormData.append('content', contentToSend);
        textFormData.append('messageType', 'text');

        if (type === 'friend') {
          textFormData.append('toUserId', conversationId);
        } else {
          textFormData.append('groupId', conversationId);
        }

        if (replyingTo) {
          textFormData.append('replyToMessageId', replyingTo.id);
        }

        await api.post('/messages', textFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      // 逐个发送已上传完成的附件（使用 file_path，不再传 file）
      for (const attachment of doneAttachments) {
        if (!attachment.file_path) continue;
        const attachmentFormData = new FormData();
        attachmentFormData.append('file_path', attachment.file_path);
        attachmentFormData.append('file_name', attachment.file_name || attachment.file.name);
        attachmentFormData.append('file_size', String(attachment.file_size ?? attachment.file.size));
        attachmentFormData.append('file_type', attachment.file_type || '');

        let messageType = 'file';
        if (attachment.file.type.startsWith('image/')) messageType = 'image';
        else if (attachment.file.type.startsWith('audio/')) messageType = 'voice';
        attachmentFormData.append('messageType', messageType);

        if (type === 'friend') {
          attachmentFormData.append('toUserId', conversationId);
        } else {
          attachmentFormData.append('groupId', conversationId);
        }

        await api.post('/messages', attachmentFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      // 清空附件
      setPendingAttachments([]);

      // 立即完整刷新消息列表，确保发送的消息能立即显示
      isRefreshingAfterSendRef.current = true; // 标记正在刷新
      setTimeout(async () => {
        try {
          // 使用完整刷新模式，确保新消息立即显示
          await fetchMessages(true, false);
        } finally {
          // 刷新完成后立即允许轮询，不要延迟太久
          isRefreshingAfterSendRef.current = false;
        }
      }, 300); // 延迟300ms，确保后端已保存
    } catch (error) {
      console.error('发送消息失败:', error);
      toast.error(t('messages.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  // ============ 消息操作函数 ============
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

  // 处理@提及的高亮显示，并对文本中的 URL 做可点击处理
  const renderMessageWithMentions = (content: string, groupMembers: any[] = []) => {
    if (!content) return content;

    const memberMap = new Map<string, any>();
    groupMembers.forEach(member => {
      memberMap.set(member.username, member);
      if (member.nickname && member.nickname !== member.username) {
        memberMap.set(member.nickname, member);
      }
    });

    const mentionRegex = /@(\w+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<React.Fragment key={`s-${match.index}`}>{linkifyUrls(content.substring(lastIndex, match.index))}</React.Fragment>);
      }
      const mentionName = match[1];
      const member = memberMap.get(mentionName);
      if (member) {
        parts.push(
          <span key={match.index} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded font-medium">
            @{mentionName}
          </span>
        );
      } else {
        parts.push(<React.Fragment key={`s-${match.index}-p`}>{linkifyUrls(match[0])}</React.Fragment>);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push(<React.Fragment key="s-end">{linkifyUrls(content.substring(lastIndex))}</React.Fragment>);
    }
    return parts.length > 0 ? parts : content;
  };

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success(t('messages.copied'));
      setContextMenu(null);
    } catch (error) {
      toast.error(t('messages.copyFailed'));
    }
  };

  const recallMessage = async (messageId: string, message?: Message) => {
    try {
      await api.post(`/messages/${messageId}/recall`, { _method: 'PUT' });
      setContextMenu(null);
      if (message) {
        setMessageContent(message.content || '');
        setReplyingTo(null);
      }
      toast.success(t('messages.messageRecalled'));
      fetchMessages(true);
    } catch (error) {
      console.error('撤回消息失败:', error);
      toast.error(t('messages.recallFailed'));
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await api.post(`/messages/${messageId}`, { _method: 'DELETE' });
      toast.success(t('messages.messageDeleted'));
      fetchMessages(true);
    } catch (error) {
      console.error('删除消息失败:', error);
      toast.error(t('messages.deleteMessageFailed'));
    }
  };

  const handleAddToLibraryConfirm = async (message: AddToLibraryMessage, opts: AddToLibraryOptions) => {
    const fileApiPath = getMessageFileApiPath(message.file_path);
    if (!fileApiPath || !message.file_name) return;

    try {
      const res = await api.get(fileApiPath, { responseType: 'blob' });
      const blob = res.data as Blob;

      const formData = new FormData();
      formData.append('file', blob, message.file_name);
      formData.append('isPublic', opts.isPublic ? 'true' : 'false');
      formData.append('category', opts.category || t('book.uncategorized'));

      await api.post('/books/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success(opts.isPublic ? t('messages.addToLibrarySuccess') : t('messages.addToPrivateLibrarySuccess'));
      setAddToLibraryMessage(null);
    } catch (error) {
      console.error('添加到图书馆失败:', error);
      toast.error(t('messages.addToLibraryFailed'));
    }
  };

  // ============ 事件处理 ============
  const handleBack = () => {
    navigate('/messages');
  };

  const uploadAttachment = (att: { id: string; file: File }) => {
    setPendingAttachments(prev => prev.map(a => a.id === att.id ? { ...a, uploadStatus: 'uploading' as const, progress: 0 } : a));
    const fd = new FormData();
    fd.append('file', att.file, att.file.name);
    api.post('/messages/upload-file', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        const p = e.total ? Math.round((100 * e.loaded) / e.total) : 0;
        setPendingAttachments(prev => prev.map(a => a.id === att.id ? { ...a, progress: p } : a));
      }
    }).then((res: any) => {
      const d = res?.data || {};
      setPendingAttachments(prev => prev.map(a => a.id === att.id ? {
        ...a, uploadStatus: 'done' as const, progress: 100,
        file_path: d.file_path, file_name: d.file_name, file_size: d.file_size, file_type: d.file_type
      } : a));
    }).catch((err: any) => {
      setPendingAttachments(prev => prev.map(a => a.id === att.id ? {
        ...a, uploadStatus: 'error' as const, error: err?.response?.data?.error || err?.message || t('messages.uploadFailed')
      } : a));
      toast.error(t('messages.uploadFailed'));
    });
  };

  const handleFileSelect = (files: FileList) => {
    Array.from(files).forEach(file => {
      if (file.size > 1024 * 1024 * 1024) {
        toast.error(t('messages.fileTooLarge1GB'));
        return;
      }
      const id = `attachment-${Date.now()}-${Math.random()}`;
      const attachment = { file, id, uploadStatus: 'pending' as const };

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const withPreview = { ...attachment, preview: e.target?.result as string };
          setPendingAttachments(prev => [...prev, withPreview]);
          uploadAttachment(withPreview);
        };
        reader.readAsDataURL(file);
      } else {
        setPendingAttachments(prev => [...prev, attachment]);
        uploadAttachment(attachment);
      }
    });
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessageContent(prev => prev + emoji);
  };

  const handleToggleEmojiPicker = () => {
    setShowEmojiPicker(prev => {
      if (!prev) setShowStickerPicker(false);
      return !prev;
    });
  };

  const handleToggleStickerPicker = () => {
    setShowStickerPicker(prev => {
      if (!prev) setShowEmojiPicker(false);
      return !prev;
    });
  };

  const handleStickerSelect = async (sticker: StickerItem) => {
    if (!conversationId || !type) {
      toast.error(t('messages.selectConversationFirst'));
      return;
    }

    try {
      const formData = new FormData();
      formData.append('content', sticker.src);
      formData.append('messageType', 'sticker');
      if (type === 'friend') {
        formData.append('toUserId', conversationId);
      } else {
        formData.append('groupId', conversationId);
      }

      await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setShowStickerPicker(false);
      
      toast.success(t('messages.stickerSent'));

      // 延迟一下再刷新消息列表，确保后端已保存
      setTimeout(() => {
        // 强制刷新消息列表，确保新消息显示
        fetchMessages(true, false);
      }, 300);
    } catch (error) {
      console.error('发送表情包失败:', error);
      toast.error(t('messages.sendStickerFailed'));
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[右键菜单] 触发', { x: e.clientX, y: e.clientY, messageId: message.id, target: e.target });
    setContextMenu({
      message,
      x: e.clientX,
      y: e.clientY
    });
  };

  // ============ E2EE 处理函数 ============
  const checkAndPromptE2EERecovery = async () => {
    // 检查是否启用了E2EE但没有本地私钥
    try {
      const userRes = await api.get('/users/me');
      const userData = userRes.data.user;
      const e2eeEnabled = !!(userData as any).e2ee_public_key;
      const hasLocalKey = await hasLocalPrivateKey();

      if (e2eeEnabled && !hasLocalKey && !showE2EERecoveryPrompt) {
        setShowE2EERecoveryPrompt(true);
      }
    } catch (error) {
      console.error('[E2EE] 检查恢复状态失败:', error);
    }
  };

  // ============ 长按处理函数 ============
  const handleMessageLongPress = (message: Message, x: number, y: number) => {
    console.log('[长按菜单] 触发', { x, y, messageId: message.id });

    // 阻止浏览器默认的右键菜单
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
      document.removeEventListener('contextmenu', preventContextMenu);
    };
    document.addEventListener('contextmenu', preventContextMenu, { once: true });

    setContextMenu({
      message,
      x,
      y
    });
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

  // ============ useEffect ============
  useEffect(() => {
    if (conversationId && type) {
      // 清空之前的消息和lastMessageTimeRef，确保全新开始
      setMessages([]);
      lastMessageTimeRef.current = '';
      noNewMessageCountRef.current = 0; // 重置计数器
      
      fetchConversation();
      // 首次加载消息（完整刷新）
      fetchMessages(true, false).then(() => {
        // 首次加载完成后，再启动轮询
        // 启动实时消息轮询（每2秒检查一次新消息，提高响应速度）
        pollingIntervalRef.current = setInterval(() => {
          // 只要不在发送后刷新状态，就执行轮询（即使页面在后台也轮询，确保能收到消息）
          if (conversationId && type && !isRefreshingAfterSendRef.current) {
            fetchMessages(false, true).catch(err => {
              if (err.response?.status === 429) {
                // 429错误时不输出警告，避免控制台噪音
              } else {
                console.error('[轮询] 轮询请求失败:', err);
              }
            });
          }
        }, 2000); // 从3秒减少到2秒，提高实时性
      });
      
      if (type === 'group') {
        fetchGroupMembers();
      }
      
      // 标记所有消息为已读（打开对话页面时）
      (async () => {
        try {
          await api.post(`/messages/conversation/${type}/${conversationId}/read-all`, { _method: 'PUT' });
          // 触发未读数更新事件，立即更新未读数
          window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
          // 延迟一下再触发一次，确保未读数已更新
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
          }, 300);
        } catch (err: any) {
          // 如果是429错误，重试一次
          if (err.response?.status === 429) {
            console.warn('[标记已读] 429错误，等待1秒后重试');
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              await api.post(`/messages/conversation/${type}/${conversationId}/read-all`, { _method: 'PUT' });
              window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
              }, 300);
            } catch (retryErr) {
              console.error('标记消息为已读失败:', retryErr);
            }
          } else {
            console.error('标记消息为已读失败:', err);
          }
        }
      })();
    }
    
    return () => {
      // 清理轮询
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      lastMessageTimeRef.current = '';
      // 清空消息列表，避免显示错误的对话消息
      setMessages([]);
      
      // 退出对话时，再次标记为已读并更新未读数（确保未读数为0）
      if (conversationId && type) {
        (async () => {
          try {
            await api.post(`/messages/conversation/${type}/${conversationId}/read-all`, { _method: 'PUT' });
            // 触发未读数更新事件
            window.dispatchEvent(new CustomEvent('messages:unreadCountChanged'));
          } catch (err) {
            // 静默失败，不影响退出流程
            if (import.meta.env.DEV) {
              console.warn('[退出对话] 标记已读失败:', err);
            }
          }
        })();
      }
    };
  }, [conversationId, type]);

  // 监听新消息事件，如果当前会话有新消息，立即刷新
  useEffect(() => {
    if (!conversationId || !type) return;
    
    let previousUnreadCount = 0;
    
    const handleNewMessageReceived = async () => {
      // 延迟一下，等待会话列表更新
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 刷新会话列表以获取最新的未读数
      try {
        const response = await api.get('/messages/conversations');
        const conversations = response.data.conversations || [];
        
        // 查找当前会话
        const currentConv = conversations.find((conv: any) => {
          if (type === 'friend') {
            return conv.conversation_type === 'friend' && 
                   (conv.other_user_id === conversationId || conv.user_id === conversationId);
          } else {
            return conv.conversation_type === 'group' && conv.group_id === conversationId;
          }
        });
        
        // 如果当前会话有未读消息，立即刷新消息列表
        if (currentConv && conversationId && type) {
          const currentUnreadCount = currentConv.unread_count || 0;
          if (currentUnreadCount > previousUnreadCount) {
            if (import.meta.env.DEV) {
              console.log('[ChatPage] 检测到当前会话有新消息，立即刷新:', {
                conversationId,
                type,
                previousUnreadCount,
                currentUnreadCount
              });
            }
            
            // 立即刷新消息（使用checkNewOnly模式，避免完整刷新）
            // 即使isRefreshingAfterSendRef为true也执行，因为这是外部新消息，优先级更高
            fetchMessages(false, true).catch(err => {
              if (err.response?.status !== 429) {
                console.error('[ChatPage] 收到新消息后刷新失败:', err);
              }
            });
          }
          previousUnreadCount = currentUnreadCount;
        }
      } catch (error) {
        // 静默失败，不影响正常流程
        if (import.meta.env.DEV) {
          console.warn('[ChatPage] 检查未读数变化失败:', error);
        }
      }
    };
    
    window.addEventListener('messages:newMessageReceived', handleNewMessageReceived);
    
    return () => {
      window.removeEventListener('messages:newMessageReceived', handleNewMessageReceived);
    };
  }, [conversationId, type]);

  // 页面可见性检测
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      
      // 页面变为可见时，立即检查新消息
      if (!document.hidden && conversationId && type) {
        fetchMessages(false, true);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    isPageVisibleRef.current = !document.hidden;
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, type]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setIsPWA(typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || !!(navigator as any).standalone));
  }, []);

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (showForwardModal) {
      api.get('/friends').then(r => setFriendsForForward(r.data?.friends || [])).catch(() => setFriendsForForward([]));
      api.get('/groups').then(r => setGroupsForForward(r.data?.groups || [])).catch(() => setGroupsForForward([]));
    }
  }, [showForwardModal]);

  const forwardMessage = async (message: Message, targetId: string, targetType: 'friend' | 'group') => {
    try {
      const formData = new FormData();
      formData.append('content', message.content);
      formData.append('messageType', message.message_type || 'text');
      if (targetType === 'friend') formData.append('toUserId', targetId);
      else formData.append('groupId', targetId);
      const fileApiPath = getMessageFileApiPath(message.file_path);
      if (fileApiPath && message.file_name) {
        try {
          const res = await api.get(fileApiPath, { responseType: 'blob' });
          const blob = res.data as Blob;
          formData.append('file', new File([blob], message.file_name, { type: blob.type }));
        } catch {
          const fallbackLabel = message.message_type === 'image'
            ? t('messages.typeLabelImage')
            : message.message_type === 'sticker'
            ? t('messages.typeLabelSticker')
            : message.message_type === 'voice'
            ? t('messages.typeLabelVoice')
            : t('messages.typeLabelFile');
          formData.set('content', `[${fallbackLabel}] ${message.file_name}`);
          formData.set('messageType', 'text');
        }
      }
      await api.post('/messages', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(t('messages.messageForwarded'));
      setShowForwardModal(false);
      setForwardingMessage(null);
    } catch (e: any) {
      toast.error(e.response?.data?.error || t('messages.forwardFailed'));
    }
  };

  // ============ 消息分组工具函数 ============
  const shouldShowDateSeparator = (currentMessage: Message, previousMessage?: Message): boolean => {
    if (!previousMessage) return true;
    return getDateKeyInSystemTZ(currentMessage.created_at) !== getDateKeyInSystemTZ(previousMessage.created_at);
  };

  const formatMessageDate = (dateString: string): string =>
    formatDateForSeparator(dateString, { today: t('messages.today'), yesterday: t('messages.yesterday') });

  // ============ 渲染函数 ============
  const renderMessage = (message: Message, index: number) => {
    const isFromMe = message.from_user_id === user?.id;
    const previousMessage = index > 0 ? messages[index - 1] : undefined;
    const showDateSeparator = shouldShowDateSeparator(message, previousMessage);

    // 检查消息是否已撤回或已删除
    if (message.is_recalled) {
      return (
        <div key={message.id}>
          {showDateSeparator && (
            <div className="flex justify-center my-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                {formatMessageDate(message.created_at)}
              </div>
            </div>
          )}
          <div className="flex justify-center mb-3 px-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
              {t('messages.messageRecalled')}
            </div>
          </div>
        </div>
      );
    }

    if (message.is_deleted) {
      return null; // 已删除的消息不显示
    }

    return (
      <div key={message.id}>
        {showDateSeparator && (
          <div className="flex justify-center my-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
              {formatMessageDate(message.created_at)}
            </div>
          </div>
        )}
        <div
          className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} mb-3 group px-4`}
          onContextMenu={(e) => handleMessageContextMenu(e, message)}
          onTouchStart={(e) => handleTouchStart(e, message)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            WebkitTouchCallout: 'none' // 屏蔽iOS长按系统菜单，但允许文本选择
          }}
        >
          {/* 显示发送者头像（所有消息类型都显示） */}
          {!isFromMe && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs mr-2 flex-shrink-0 mt-1">
              {(message.from_nickname || message.from_username || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          
          {/* 自己的消息头像（右侧） */}
          {isFromMe && (
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 ml-2 flex-shrink-0 mt-1 order-3">
              {user?.avatar_path && getAvatarUrl(user.avatar_path) ? (
                <img src={getAvatarUrl(user.avatar_path)!} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-xs">{(user?.nickname || user?.username || t('messages.me')).charAt(0).toUpperCase()}</span>
              )}
            </div>
          )}

          <div className={`max-w-xs md:max-w-md ${isFromMe ? 'order-1' : 'order-2'}`}>
          {/* 群组消息显示发送者名字 */}
          {!isFromMe && type === 'group' && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">
              {message.from_nickname || message.from_username}
            </div>
          )}
          {/* 回复消息 */}
          {message.reply_to_message_id && message.reply_content && (
            <div className={`mb-1.5 px-3 py-2 rounded-lg border-l-3 ${
              isFromMe
                ? 'bg-blue-400/20 border-blue-400 dark:bg-blue-500/20 dark:border-blue-400'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500'
            }`}>
              <div className="text-xs font-medium opacity-80 mb-1">
                {message.reply_from_nickname || message.reply_from_username}
              </div>
              <div className="text-xs truncate opacity-70">
                {message.reply_message_type === 'image'
                  ? t('messages.typeImage')
                  : message.reply_message_type === 'sticker'
                  ? t('messages.typeSticker')
                  : linkifyUrls(message.reply_content || '')}
              </div>
            </div>
          )}

          {/* 消息内容 */}
          <div
            className={`px-3.5 py-2.5 rounded-2xl shadow-sm ${
              isFromMe
                ? 'bg-[#007AFF] text-white rounded-tr-sm'
                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm border border-gray-200 dark:border-gray-700'
            }`}
          >
            {message.message_type === 'voice' ? (
              /* 语音消息 */
              <div className="flex items-center gap-2">
                <button
                  onClick={() => playVoiceMessage(message)}
                  className={`p-2 rounded-full transition-colors ${
                    playingVoiceId === message.id
                      ? 'bg-white/20 text-white'
                      : isFromMe
                      ? 'bg-white/10 text-white hover:bg-white/20'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {playingVoiceId === message.id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="text-sm">
                    {message.duration ? t('messages.voiceSeconds', { seconds: message.duration }) : t('messages.voiceMessage')}
                  </div>
                  {playingVoiceId === message.id && (
                    <div className="w-full bg-white/20 rounded-full h-1 mt-1">
                      <div
                        className="bg-white h-1 rounded-full transition-all duration-100"
                        style={{ width: `${(voicePlaybackTime / (message.duration || 1)) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : message.message_type === 'image' ? (
              /* 图片消息：经认证 API，避免未授权访问 */
              <div className="max-w-xs">
                {getMessageFileApiPath(message.file_path) ? (
                  <img
                    src={getAuthenticatedFileUrl(getMessageFileApiPath(message.file_path)!)}
                    alt={t('messages.imageAlt')}
                    className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(getAuthenticatedFileUrl(getMessageFileApiPath(message.file_path)!), '_blank')}
                  />
                ) : (
                  <div className="py-8 px-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm text-center">[图片]</div>
                )}
              </div>
            ) : message.message_type === 'sticker' ? (
              /* 表情包：file_path 走认证 API；http/data 用原样 */
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
              /* 阅读进度消息 */
              <div className="max-w-xs">
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">📖</span>
                    </div>
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{t('messages.readingProgressShare')}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      {(() => {
                        try {
                          const progressData = JSON.parse(message.content);
                          return progressData.message || t('messages.readingProgressFormat', { title: progressData.chapter_title || '-', progress: (progressData.progress * 100).toFixed(1) });
                        } catch {
                          return message.content;
                        }
                      })()}
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: (() => {
                            try {
                              const progressData = JSON.parse(message.content);
                              return `${Math.min(progressData.progress * 100, 100)}%`;
                            } catch {
                              return '0%';
                            }
                          })()
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : message.message_type === 'book_excerpt' ? (
              /* 书籍摘抄消息 */
              <div className="max-w-sm">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-700">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">📚</span>
                    </div>
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('messages.bookExcerpt')}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-gray-700 dark:text-gray-300 italic border-l-3 border-amber-400 pl-3">
                      {(() => {
                        try {
                          const excerptData = JSON.parse(message.content);
                          return excerptData.excerpt_text || message.content;
                        } catch {
                          return message.content;
                        }
                      })()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-amber-200 dark:border-amber-700">
                      {(() => {
                        try {
                          const excerptData = JSON.parse(message.content);
                          return `——《${excerptData.book_title}》${excerptData.chapter_title ? ` ${excerptData.chapter_title}` : ''}`;
                        } catch {
                          return '';
                        }
                      })()}
                    </div>
                    {(() => {
                      try {
                        const excerptData = JSON.parse(message.content);
                        if (!excerptData?.book_id) return null;
                        const initialPosition = {
                          progress: typeof excerptData.progress === 'number' ? excerptData.progress : 0,
                          currentPage: excerptData.page ?? 1,
                          totalPages: excerptData.total_pages ?? 1,
                          chapterIndex: excerptData.chapter_index ?? 0,
                          chapterTitle: excerptData.chapter_title,
                          currentLocation: excerptData.current_location,
                        };
                        return (
                          <button
                            type="button"
                            onClick={() => navigate(`/reader/${excerptData.book_id}`, { state: { initialPosition } })}
                            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 hover:underline"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            {t('messages.openBookAtExcerpt')}
                          </button>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              /* 文本消息 */
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
                {type === 'group' ? renderMessageWithMentions(message.content, groupMembers) : linkifyUrls(message.content)}
              </div>
            )}
          </div>

          {/* 时间戳和状态（按系统时区） */}
          <div className={`text-xs text-gray-400 dark:text-gray-500 mt-1 px-1 ${isFromMe ? 'text-right' : 'text-left'} flex items-center gap-1`}>
            {formatTimeOnly(message.created_at)}
            {isFromMe && (
              <div className="flex items-center">
                {message.is_read ? (
                  <div className="flex">
                    <div className="w-3 h-3 rounded-full bg-blue-500 -ml-1" />
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                  </div>
                ) : (
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col bg-gray-50 dark:bg-gray-900"
      style={isPWA ? { minHeight: '100dvh' } : undefined}
      onContextMenu={(e) => {
        // 阻止ChatPage页面的默认右键菜单
        e.preventDefault();
      }}
    >
      {/* 状态栏占位符 - PWA 移动端预留刘海/状态栏安全区 */}
      <div
        key={`chat-status-bar-${domTheme}`} // 强制React在主题变化时重新渲染
        className="flex-shrink-0"
        style={{
          height: typeof window !== 'undefined' && window.innerWidth < 1024
            ? 'env(safe-area-inset-top, 0px)'
            : '0px',
          backgroundColor: 'var(--status-bar-bg)', // 使用CSS变量响应主题变化
          // 规避部分 PWA/WebView 下 fixed + 变量更新不重绘
          transform: 'translateZ(0)',
        }}
      />

      {/* 聊天头部 */}
      <header className="flex-shrink-0 h-11 md:h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
        <div className="h-full flex items-center px-4">
          {/* 返回按钮 */}
          <button
            onClick={handleBack}
            className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          {/* 对话标题 - 好友时可点击进入资料页；移动端居中且不显示「点击查看资料」 */}
          <div className="flex-1 ml-2 min-w-0 flex justify-center md:justify-start">
            {type === 'friend' && conversationId ? (
              <button
                onClick={() => navigate(`/user/${conversationId}`)}
                className="text-center md:text-left block w-full group"
              >
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {conversation?.group_name || conversation?.other_nickname || conversation?.other_username || t('messages.conversation')}
                </h1>
                <p className="hidden md:block text-xs text-gray-500 dark:text-gray-400">{t('messages.clickToViewProfile')}</p>
              </button>
            ) : (
              <div className="text-center md:text-left">
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  {conversation?.group_name || conversation?.other_nickname || conversation?.other_username || t('messages.conversation')}
                </h1>
                {conversation?.conversation_type === 'group' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('messages.group')}</p>
                )}
              </div>
            )}
          </div>

          {/* 对话设置 */}
          <button 
            onClick={() => setShowConversationSettings(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title={t('messages.conversationSettings')}
          >
            <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </header>

      {/* 消息列表区域 */}
      <div className="flex-1 min-h-0 relative">
        <div ref={messagesScrollRef} className="absolute inset-0 overflow-y-auto">
          <div className="p-4 space-y-2">
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
        </div>
      </div>

      {/* 输入区域 - 非 PWA 预留底部安全区；PWA 下不预留底部安全区 */}
      <div
        className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative z-10"
        style={isPWA ? undefined : { paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Emoji选择器 */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-0 right-0 z-50 shadow-lg">
            <EmojiPicker onSelect={handleEmojiSelect} />
          </div>
        )}

        {showStickerPicker && (
          <div className="absolute bottom-full left-0 right-0 z-50 shadow-lg">
            <StickerPicker onSelect={handleStickerSelect} />
          </div>
        )}

        {/* 录音动画遮罩层 */}
        {isRecording && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4">
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
                  {t('messages.tapToStopRecording')}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={stopRecording}
                    className="px-6 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors"
                  >
                    {t('messages.stopRecording')}
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    {t('messages.cancelRecording')}
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
              onClick={() => setShowVoiceButton(!showVoiceButton)}
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
              title={t('messages.addAttachment')}
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            />

            <button
              onClick={handleToggleEmojiPicker}
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
              onClick={handleToggleStickerPicker}
              className={`p-2 rounded-lg transition-all ${
                showStickerPicker
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={t('messages.sticker')}
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
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-full max-w-xs py-3 md:py-4 px-4 rounded-xl transition-all ${
                    isRecording
                      ? 'bg-red-500 text-white scale-95 shadow-lg animate-pulse'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isRecording ? (
                    <span className="text-sm md:text-base font-medium">
                      {t('messages.recording', { seconds: recordingTime })}
                    </span>
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
                          {t('messages.replyTo', { name: replyingTo.from_nickname || replyingTo.from_username })}
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
                        onClick={() => setReplyingTo(null)}
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
                        const st = attachment.uploadStatus || 'pending';
                        const isUp = st === 'uploading' || st === 'pending';
                        const isDone = st === 'done';
                        const isErr = st === 'error';
                        return (
                        <div
                          key={attachment.id}
                          className={`relative group rounded-lg overflow-hidden border ${isErr ? 'border-red-300 dark:border-red-600' : 'border-gray-200 dark:border-gray-600'}`}
                        >
                          {attachment.preview ? (
                            <div className="relative w-16 h-16 md:w-20 md:h-20">
                              <img src={attachment.preview} alt="" className="w-full h-full object-cover" />
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
                              <button onClick={() => handleRemoveAttachment(attachment.id)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            <div className="relative px-3 py-2 bg-gray-100 dark:bg-gray-700 flex items-center gap-2 min-w-[120px]">
                              <FileIcon className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-900 dark:text-gray-100 truncate">{attachment.file.name}</div>
                                {isUp && <div className="flex items-center gap-1 mt-0.5"><div className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${attachment.progress ?? 0}%` }} /></div><span className="text-[10px] text-gray-500">{attachment.progress ?? 0}%</span></div>}
                                {isDone && <div className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5 mt-0.5"><Check className="w-3 h-3" /> {t('messages.uploadDone') || '已上传'}</div>}
                                {isErr && <div className="text-[10px] text-red-500 truncate">{attachment.error || t('messages.uploadFailed')}</div>}
                                {!isUp && !isDone && !isErr && <div className="text-[10px] text-gray-500">{(attachment.file.size / 1024).toFixed(1)} KB</div>}
                              </div>
                              <button onClick={() => handleRemoveAttachment(attachment.id)} className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 flex-shrink-0"><X className="w-2.5 h-2.5" /></button>
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
                    ref={(el) => {
                      chatInputRef.current = el;
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 216) + 'px';
                      }
                    }}
                    value={messageContent}
                    onPaste={async (e) => {
                      const cd = e.clipboardData;
                      if (!cd) return;
                      // 1) 优先：从资源管理器复制的多个文件（clipboardData.files）
                      if (cd.files && cd.files.length > 0) {
                        e.preventDefault();
                        handleFileSelect(cd.files);
                        const n = cd.files.length;
                        toast.success(n === 1 && cd.files[0].type.startsWith('image/') ? t('messages.imagePasted') : t('messages.filesPasted'));
                        return;
                      }
                      // 2) 从 items 取文件（截图、复制图片、部分系统下复制的文件）
                      const items = cd.items;
                      if (!items) return;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].kind !== 'file') continue;
                        const file = items[i].getAsFile();
                        if (file) {
                          e.preventDefault();
                          const dt = new DataTransfer();
                          dt.items.add(file);
                          handleFileSelect(dt.files);
                          toast.success(file.type.startsWith('image/') ? t('messages.imagePasted') : t('messages.filesPasted'));
                          return;
                        }
                      }
                    }}
                    onChange={(e) => {
                      const value = e.target.value;
                      setMessageContent(value);

                      // 处理@提醒（仅群组）
                      if (type === 'group') {
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

                      // 自动调整高度
                      setTimeout(() => {
                        const textarea = e.target as HTMLTextAreaElement;
                        textarea.style.height = 'auto';
                        textarea.style.height = Math.min(textarea.scrollHeight, 216) + 'px';
                      }, 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (e.ctrlKey || e.metaKey) {
                          // Ctrl/Cmd + Enter 发送消息
                          e.preventDefault();
                          sendMessage();
                          setShowEmojiPicker(false);
                        } else if (!e.shiftKey) {
                          // 普通Enter发送消息
                          e.preventDefault();
                          sendMessage();
                          setShowEmojiPicker(false);
                        }
                        // Shift + Enter 换行
                      }
                    }}
                    className="w-full bg-transparent border-0 outline-none resize-none text-sm md:text-base text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 leading-6 overflow-y-auto"
                    style={{
                      minHeight: '40px',
                      maxHeight: '216px',
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent',
                    }}
                    placeholder={t('messages.inputPlaceholderHint')}
                    disabled={sending || isRecording}
                    rows={1}
                  />
                </div>
              </div>
            )}

            {/* 发送：Enter / Ctrl+Enter 发送，Shift+Enter 换行，不再显示发送按钮 */}
          </div>
        </div>

        {/* @提醒列表 */}
        {showMentionList && type === 'group' && groupMembers.length > 0 && (
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
                    const afterCursor = messageContent.substring(mentionPosition + mentionQuery.length + 1);
                    const mentionText = `@${member.nickname || member.username} `;
                    const newContent = beforeAt + mentionText + afterCursor;
                    setMessageContent(newContent);
                    setShowMentionList(false);

                    setTimeout(() => {
                      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
                      if (textarea) {
                        const newPosition = mentionPosition + mentionText.length;
                        textarea.setSelectionRange(newPosition, newPosition);
                        textarea.focus();
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
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] pointer-events-auto"
          style={{
            left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200))}px`,
            top: `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - 300))}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 复制 */}
          <button
            onClick={() => copyMessage(contextMenu.message)}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Copy className="w-4 h-4" />
            {t('messages.copy')}
          </button>

          {/* 引用 */}
          <button
            onClick={() => {
              setReplyingTo(contextMenu.message);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Reply className="w-4 h-4" />
            {t('messages.reply')}
          </button>

          {/* 转发 */}
          <button
            onClick={() => {
              setForwardingMessage(contextMenu.message);
              setShowForwardModal(true);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Forward className="w-4 h-4" />
            {t('messages.forward')}
          </button>

          {/* 下载 - 仅附件/图片/语音等有 file_path 的消息 */}
          {hasDownloadableAttachment(contextMenu.message) && (
            <button
              onClick={() => downloadAttachment(contextMenu.message)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('messages.download')}
            </button>
          )}

          {/* 添加到图书馆 - 仅书籍文件 */}
          {isBookFile(contextMenu.message) && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={() => { setAddToLibraryMessage(contextMenu.message); setContextMenu(null); }}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                {t('messages.addToLibrary')}
              </button>
            </>
          )}

          {/* 撤回 - 仅自己的消息且5分钟内 */}
          {contextMenu.message.from_user_id === user?.id && canRecallMessage(contextMenu.message) && (
            <button
              onClick={() => recallMessage(contextMenu.message.id, contextMenu.message)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {t('messages.recall')}
            </button>
          )}

          {/* 删除 - 仅自己的消息 */}
          {contextMenu.message.from_user_id === user?.id && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <button
                onClick={() => {
                  deleteMessage(contextMenu.message.id);
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2 text-left hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                {t('messages.delete')}
              </button>
            </>
          )}
        </div>
      )}

      {/* 点击空白处关闭右键菜单 */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[99]"
          onClick={() => setContextMenu(null)}
        />
      )}

      {/* E2EE 恢复提示 */}
      {showE2EERecoveryPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowE2EERecoveryPrompt(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('messages.e2eeRecoveryTitle') || '端到端加密'}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('messages.e2eeRecoveryHint') || '检测到加密消息，但本设备未恢复密钥。请在设置中恢复密钥以查看加密消息。'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowE2EERecoveryPrompt(false)}
                className="btn btn-secondary"
              >
                {t('common.later') || '稍后'}
              </button>
              <button
                onClick={() => {
                  setShowE2EERecoveryPrompt(false);
                  // 跳转到设置页面
                  navigate('/settings');
                }}
                className="btn btn-primary"
              >
                {t('messages.e2eeGoToSettings') || '前往设置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 转发模态框 */}
      {showForwardModal && (
        <ForwardModal
          isOpen={showForwardModal}
          onClose={() => { setShowForwardModal(false); setForwardingMessage(null); }}
          message={forwardingMessage}
          friends={friendsForForward}
          groups={groupsForForward}
          onForward={forwardMessage}
        />
      )}

      {/* 添加到图书馆模态框 */}
      <AddToLibraryModal
        isOpen={!!addToLibraryMessage}
        onClose={() => setAddToLibraryMessage(null)}
        message={addToLibraryMessage}
        onConfirm={handleAddToLibraryConfirm}
      />

      {/* 对话设置模态框 */}
      {showConversationSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('messages.conversationSettingsTitle')}</h2>
              <button
                onClick={() => setShowConversationSettings(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 静音设置 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    {conversationSettings.is_muted ? (
                      <VolumeX className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{t('messages.muteLabel')}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {conversationSettings.is_muted ? t('messages.mutedNoReminder') : t('messages.receiveReminder')}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={conversationSettings.is_muted}
                    onChange={toggleMute}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* 黑名单设置 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Ban className={`w-5 h-5 ${conversationSettings.is_blocked ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{t('messages.blocklistLabel')}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {conversationSettings.is_blocked ? t('messages.blockedNoMessage') : t('messages.receiveNormal')}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={conversationSettings.is_blocked}
                    onChange={toggleBlock}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;