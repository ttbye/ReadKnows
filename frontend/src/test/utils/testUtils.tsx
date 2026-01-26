/**
 * @file testUtils.tsx
 * @description 测试工具函数
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 初始化 i18n（用于测试）
i18n.use(initReactI18next).init({
  lng: 'zh',
  fallbackLng: 'zh',
  resources: {
    zh: {
      translation: {
        'audiobook.player.playFailed': '播放失败',
        'audiobook.player.pauseFailed': '暂停失败',
        'audiobook.player.lastEpisode': '已经是最后一集',
        'audiobook.player.firstEpisode': '已经是第一集',
        'audiobook.player.sleepTimerClosed': '睡眠定时器已关闭',
        'audiobook.chapters': '章节',
        'audiobook.playlist': '播放列表',
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

/**
 * 自定义渲染函数（包含必要的 Provider）
 */
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </BrowserRouter>
  );
}

/**
 * 自定义 render 函数
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from '@testing-library/react';
export { customRender as render };
