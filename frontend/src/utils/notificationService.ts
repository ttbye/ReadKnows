/**
 * @file notificationService.ts
 * @description 浏览器通知服务
 */

import { isTTSPlaying } from './audioRegistry';

// 通知权限状态
export type NotificationPermission = 'default' | 'granted' | 'denied';

class NotificationService {
  private permission: NotificationPermission = 'default';
  private notificationEnabled: boolean = false;
  private soundEnabled: boolean = true;
  private disableNotificationsWhenTTSPlaying: boolean = true; // TTS播放时关闭消息提醒（默认开启）
  private lastNotificationTime: number = 0;
  private notificationThrottle: number = 3000; // 3秒内不重复通知

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.permission = Notification.permission as NotificationPermission;
      // 从localStorage读取用户设置
      this.notificationEnabled = localStorage.getItem('notificationEnabled') === 'true';
      this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
      // 读取TTS播放时关闭提醒的设置，默认为true
      const stored = localStorage.getItem('disableNotificationsWhenTTSPlaying');
      this.disableNotificationsWhenTTSPlaying = stored === null ? true : stored === 'true';
    }
  }

  // 请求通知权限
  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('浏览器不支持通知功能');
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    if (this.permission === 'denied') {
      console.warn('通知权限已被拒绝');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission = permission as NotificationPermission;
      
      if (permission === 'granted') {
        this.notificationEnabled = true;
        localStorage.setItem('notificationEnabled', 'true');
        return true;
      }
      return false;
    } catch (error) {
      console.error('请求通知权限失败:', error);
      return false;
    }
  }

  // 检查是否有通知权限
  hasPermission(): boolean {
    return this.permission === 'granted';
  }

  // 启用/禁用通知
  setNotificationEnabled(enabled: boolean) {
    this.notificationEnabled = enabled;
    localStorage.setItem('notificationEnabled', enabled.toString());
  }

  // 启用/禁用声音
  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    localStorage.setItem('soundEnabled', enabled.toString());
  }

  // 设置TTS播放时是否关闭消息提醒
  setDisableNotificationsWhenTTSPlaying(enabled: boolean) {
    this.disableNotificationsWhenTTSPlaying = enabled;
    localStorage.setItem('disableNotificationsWhenTTSPlaying', enabled.toString());
  }

  // 获取TTS播放时是否关闭消息提醒
  getDisableNotificationsWhenTTSPlaying(): boolean {
    return this.disableNotificationsWhenTTSPlaying;
  }

  // 播放通知声音
  private playNotificationSound() {
    if (!this.soundEnabled) return;

    try {
      // 使用 Audio 元素播放声音文件（更可靠）
      // 如果没有声音文件，使用 Web Audio API 生成提示音
      const audio = new Audio();
      
      // 尝试使用数据URL播放提示音（类似微信的"叮"声）
      // 创建一个简单的提示音
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 设置音调（800Hz，类似消息提示音）
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      // 设置音量（淡入淡出，更柔和）
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
      
      // 确保音频上下文已激活（某些浏览器需要用户交互）
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
    } catch (error) {
      console.error('播放通知声音失败:', error);
    }
  }

  // 显示系统通知
  async showNotification(title: string, options: NotificationOptions = {}) {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    // 检查是否启用通知
    if (!this.notificationEnabled) {
      return;
    }

    // 检查权限
    if (this.permission !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        return;
      }
    }

    // 节流：避免短时间内重复通知
    const now = Date.now();
    if (now - this.lastNotificationTime < this.notificationThrottle) {
      return;
    }
    this.lastNotificationTime = now;

    try {
      // 播放声音
      this.playNotificationSound();

      // 显示通知
      const notification = new Notification(title, {
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: options.tag || 'message', // 相同tag的通知会被替换
        requireInteraction: false,
        silent: !this.soundEnabled,
        ...options,
      });

      // 点击通知时聚焦窗口
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // 自动关闭（5秒后）
      setTimeout(() => {
        notification.close();
      }, 5000);
    } catch (error) {
      console.error('显示通知失败:', error);
    }
  }

  // 显示消息通知（消息通知不受用户通知设置影响，始终尝试显示）
  showMessageNotification(
    senderName: string,
    message: string,
    conversationId?: string,
    conversationType?: 'friend' | 'group',
    isImportant: boolean = false // 是否为重要通知（好友消息、群消息等，不受TTS影响）
  ) {
    // 如果启用了"TTS播放时关闭消息提醒"且TTS正在播放，且不是重要通知，则不显示通知
    if (!isImportant && this.disableNotificationsWhenTTSPlaying && isTTSPlaying()) {
      console.log('[NotificationService] TTS正在播放，跳过消息通知');
      return;
    }

    // 检查是否在对话页面（包括ChatPage和Messages页面的对话区域）
    const isInChatPage = typeof window !== 'undefined' && (
      window.location.pathname.startsWith('/messages') ||
      window.location.pathname.startsWith('/chat') ||
      (window.location.pathname === '/messages' && window.location.search.includes('userId=')) ||
      (window.location.pathname === '/messages' && window.location.search.includes('groupId='))
    );
    
    // 检查页面是否可见
    const isPageVisible = typeof document !== 'undefined' && !document.hidden;
    
    // 播放声音提醒（如果启用）
    if (this.soundEnabled) {
      this.playNotificationSound();
    }
    
    // 如果不在对话页面，显示toast弹窗提示
    if (!isInChatPage && typeof window !== 'undefined') {
      // 动态导入toast以避免循环依赖
      import('react-hot-toast').then(({ default: toast }) => {
        const messagePreview = message.length > 30 ? message.substring(0, 30) + '...' : message;
        toast(`💬 ${senderName}: ${messagePreview}`, {
          icon: '💬',
          duration: 3000,
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
            maxWidth: '90vw',
          },
        });
      }).catch(err => {
        console.error('[NotificationService] 导入toast失败:', err);
      });
    }
    
    // 如果页面不可见，显示系统通知
    if (!isPageVisible) {
      this.showMessageNotificationDirectly(senderName, message, conversationId, conversationType);
    }
  }

  // 直接显示消息通知（不受用户设置影响）
  private async showMessageNotificationDirectly(
    senderName: string,
    message: string,
    conversationId?: string,
    conversationType?: 'friend' | 'group'
  ) {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    // 检查权限（如果没有权限，尝试请求一次）
    if (this.permission !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('[NotificationService] 消息通知：没有通知权限，跳过显示');
        return;
      }
    }

    // 节流：避免短时间内重复通知
    const now = Date.now();
    if (now - this.lastNotificationTime < this.notificationThrottle) {
      return;
    }
    this.lastNotificationTime = now;

    try {
      // 播放声音（如果启用）
      if (this.soundEnabled) {
        this.playNotificationSound();
      }

      const title = `新消息来自 ${senderName}`;
      const body = message.length > 50 ? message.substring(0, 50) + '...' : message;

      // 显示通知
      const notification = new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `message-${conversationId || 'unknown'}`, // 相同tag的通知会被替换
        requireInteraction: false,
        silent: !this.soundEnabled,
        data: {
          conversationId,
          conversationType,
          url: conversationId
            ? `/messages${conversationType === 'friend' ? `?userId=${conversationId}` : `?groupId=${conversationId}`}`
            : '/messages',
        },
      });

      // 点击通知时跳转到对应对话
      notification.onclick = () => {
        const data = notification.data;
        if (data?.url) {
          window.location.href = data.url;
        } else {
          window.location.href = '/messages';
        }
        notification.close();
      };

      // 自动关闭（8秒后，消息通知应该显示更久一些）
      setTimeout(() => {
        notification.close();
      }, 8000);

      console.log('[NotificationService] 消息通知已显示:', { senderName, message: body });
    } catch (error) {
      console.error('[NotificationService] 显示消息通知失败:', error);
    }
  }

  // 显示重要通知（好友请求、群邀请等，不受TTS播放影响）
  showImportantNotification(
    title: string,
    body: string,
    options?: {
      tag?: string;
      data?: any;
    }
  ) {
    // 重要通知不受TTS播放影响，始终显示
    this.showNotification(title, {
      body,
      tag: options?.tag || 'important-notification',
      data: options?.data,
    });
  }

  // 更新页面标题（闪烁提醒）
  private titleBlinkInterval: NodeJS.Timeout | null = null;
  private originalTitle: string = '';

  startTitleBlink(unreadCount: number) {
    if (this.titleBlinkInterval) {
      return; // 已经在闪烁
    }

    this.originalTitle = document.title;
    let isBlink = false;

    this.titleBlinkInterval = setInterval(() => {
      if (document.hidden) {
        // 页面隐藏时才闪烁
        document.title = isBlink 
          ? `(${unreadCount}) ${this.originalTitle}`
          : this.originalTitle;
        isBlink = !isBlink;
      }
    }, 1000);
  }

  stopTitleBlink() {
    if (this.titleBlinkInterval) {
      clearInterval(this.titleBlinkInterval);
      this.titleBlinkInterval = null;
      document.title = this.originalTitle;
    }
  }

  // 更新页面标题（显示未读数）
  updateTitle(unreadCount: number) {
    const baseTitle = 'ReadKnow';
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }
}

// 导出单例
export const notificationService = new NotificationService();

