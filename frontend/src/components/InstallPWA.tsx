/**
 * PWA 安装提示组件
 * 在桌面端显示"安装应用"按钮
 */

import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPWA: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    // 检查是否已经安装
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
    
    if (isInstalled) {
      console.log('[PWA] 应用已经安装，不显示安装按钮');
      setShowInstallButton(false);
      return;
    }

    // 监听 beforeinstallprompt 事件（Chrome/Edge/Firefox）
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA] 收到 beforeinstallprompt 事件');
      
      // 阻止默认的安装提示
      e.preventDefault();
      
      // 保存事件，以便后续使用
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // 显示自定义安装按钮
      setShowInstallButton(true);
      
      console.log('[PWA] 可以安装，显示安装按钮');
    };

    // 监听 beforeinstallprompt 事件
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 检查是否已经安装（定期检查）
    const checkInstalled = () => {
      const installed = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
      if (installed) {
        console.log('[PWA] 检测到应用已安装');
      setShowInstallButton(false);
        setDeferredPrompt(null);
    }
    };

    // 定期检查（每5秒检查一次）
    const interval = setInterval(checkInstalled, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearInterval(interval);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      console.log('[PWA] 没有可用的安装提示');
      
      // 如果没有 deferredPrompt，尝试手动触发安装
      // 对于某些浏览器，可能需要用户手动操作
      if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('[PWA] 应用已经安装');
        setShowInstallButton(false);
        return;
      }
      
      // 提示用户使用浏览器菜单安装
      alert('请使用浏览器菜单安装应用：\n\nChrome/Edge: 点击地址栏右侧的安装图标\nFirefox: 点击地址栏右侧的安装图标\nSafari: 文件 → 添加到程序坞');
      return;
    }

    try {
      console.log('[PWA] 显示安装提示');

    // 显示安装提示
      await deferredPrompt.prompt();

    // 等待用户响应
    const { outcome } = await deferredPrompt.userChoice;
    
      console.log(`[PWA] 用户响应: ${outcome}`);

    if (outcome === 'accepted') {
        console.log('[PWA] 用户接受了安装');
        // 安装成功后，隐藏按钮
        setShowInstallButton(false);
    } else {
        console.log('[PWA] 用户拒绝了安装');
    }
    } catch (error) {
      console.error('[PWA] 安装过程出错:', error);
    } finally {
      // 清除保存的事件（无论成功或失败）
    setDeferredPrompt(null);
      // 不立即隐藏按钮，让用户有机会再次尝试
    }
  };

  if (!showInstallButton) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        backgroundColor: '#4F46E5',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        fontWeight: '500',
        transition: 'all 0.3s ease',
      }}
      onClick={handleInstallClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#4338CA';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#4F46E5';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span>安装读士私人书库应用</span>
    </div>
  );
};

export default InstallPWA;

