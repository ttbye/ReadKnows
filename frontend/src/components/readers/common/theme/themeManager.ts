/**
 * 通用主题管理模块
 * 支持所有格式书籍（EPUB、PDF、TXT、DOCX、XLSX等）
 */

import type { ReadingSettings } from '../../../../types/reader';

export interface ThemeStyles {
  bg: string;
  text: string;
  border: string;
}

export interface ThemeConfig {
  gradient: string;
  shadow: string;
  border: string;
  innerPadding: string;
}

/**
 * 获取主题样式
 */
export function getThemeStyles(theme: ReadingSettings['theme']): ThemeStyles {
  const styles: Record<ReadingSettings['theme'], ThemeStyles> = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  };
  return styles[theme];
}

/**
 * 获取字体族
 */
export function getFontFamily(fontFamily: string): string {
  switch (fontFamily) {
    case 'serif':
      return '"Songti SC", "SimSun", "宋体", "STSong", serif';
    case 'sans-serif':
      return '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif';
    case 'monospace':
      return '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';
    case 'default':
    default:
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  }
}

/**
 * 获取主题配置（用于背景渐变等视觉效果）
 */
export function getThemeConfig(theme: ReadingSettings['theme'], isCentered: boolean): ThemeConfig {
  const configs: Record<ReadingSettings['theme'], ThemeConfig> = {
    light: {
      gradient: 'linear-gradient(145deg, rgba(255, 255, 255, 0.938) 0%, rgba(248, 250, 252, 0.5) 50%, rgba(241, 245, 249, 0.7) 100%)',
      shadow: isCentered
        ? '0 20px 60px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.02)'
        : 'inset 0 0 40px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
      border: isCentered ? '1px solid rgba(226, 232, 240, 0.8)' : 'none',
      innerPadding: isCentered ? '24px' : '16px',
    },
    dark: {
      gradient: 'linear-gradient(145deg, rgba(28, 30, 34, 0.3) 0%, rgba(23, 25, 28, 0.5) 50%, rgba(18, 20, 23, 0.7) 100%)',
      shadow: isCentered
        ? '0 20px 60px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.4)'
        : 'inset 0 0 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      border: isCentered ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
      innerPadding: isCentered ? '24px' : '16px',
    },
    sepia: {
      gradient: 'linear-gradient(145deg, rgba(250, 247, 240, 0.3) 0%, rgba(245, 238, 225, 0.5) 50%, rgba(240, 232, 215, 0.7) 100%)',
      shadow: isCentered
        ? '0 20px 60px rgba(92, 75, 55, 0.12), 0 8px 24px rgba(92, 75, 55, 0.08), 0 2px 8px rgba(92, 75, 55, 0.05), inset 0 1px 0 rgba(255, 248, 230, 0.9), inset 0 -1px 0 rgba(92, 75, 55, 0.05)'
        : 'inset 0 0 40px rgba(92, 75, 55, 0.03), inset 0 1px 0 rgba(255, 248, 230, 0.5)',
      border: isCentered ? '1px solid rgba(212, 196, 156, 0.4)' : 'none',
      innerPadding: isCentered ? '24px' : '16px',
    },
    green: {
      gradient: 'linear-gradient(145deg, rgba(245, 252, 245, 0.3) 0%, rgba(237, 247, 237, 0.5) 50%, rgba(232, 245, 233, 0.7) 100%)',
      shadow: isCentered
        ? '0 20px 60px rgba(46, 125, 50, 0.08), 0 8px 24px rgba(46, 125, 50, 0.05), 0 2px 8px rgba(46, 125, 50, 0.03), inset 0 1px 0 rgba(240, 255, 240, 0.9), inset 0 -1px 0 rgba(46, 125, 50, 0.03)'
        : 'inset 0 0 40px rgba(46, 125, 50, 0.02), inset 0 1px 0 rgba(240, 255, 240, 0.4)',
      border: isCentered ? '1px solid rgba(165, 214, 167, 0.4)' : 'none',
      innerPadding: isCentered ? '24px' : '16px',
    },
  };
  return configs[theme];
}

/**
 * 构建 EPUB 主题配置（用于 epubjs）
 */
export function buildEpubTheme(settings: ReadingSettings): Record<string, any> {
  const themeStyles = getThemeStyles(settings.theme);
  const fontFamily = getFontFamily(settings.fontFamily);

  return {
    body: {
      'font-size': `${settings.fontSize}px !important`,
      'line-height': `${settings.lineHeight} !important`,
      'font-family': fontFamily + ' !important',
      'padding': `${settings.margin}px !important`,
      'text-indent': `${settings.textIndent}em !important`,
      'background-color': themeStyles.bg + ' !important',
      'color': themeStyles.text + ' !important',
      'margin': '0 !important',
      'box-sizing': 'border-box !important',
    },
    'p': {
      'color': themeStyles.text + ' !important',
    },
    'div': {
      'color': themeStyles.text + ' !important',
    },
    'span': {
      'color': themeStyles.text + ' !important',
    },
    'h1, h2, h3, h4, h5, h6': {
      'color': themeStyles.text + ' !important',
    },
    'li': {
      'color': themeStyles.text + ' !important',
    },
    'td, th': {
      'color': themeStyles.text + ' !important',
    },
    'a': {
      'color': themeStyles.text + ' !important',
    },
  };
}

/**
 * 应用主题到文档（通用方法，支持所有格式）
 */
export function applyThemeToDocument(
  doc: Document,
  settings: ReadingSettings,
  themeStyles: ThemeStyles
): void {
  if (!doc || !doc.body) return;

  try {
    // 应用背景色和文字颜色
    doc.body.style.setProperty('background-color', themeStyles.bg, 'important');
    doc.body.style.setProperty('color', themeStyles.text, 'important');

    // 应用字体设置
    doc.body.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
    doc.body.style.setProperty('line-height', `${settings.lineHeight}`, 'important');
    doc.body.style.setProperty('font-family', getFontFamily(settings.fontFamily), 'important');
    doc.body.style.setProperty('padding', `${settings.margin}px`, 'important');
    doc.body.style.setProperty('text-indent', `${settings.textIndent}em`, 'important');

    // 强制应用颜色到所有文本元素
    const textElements = doc.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, a, em, strong, b, i, u, blockquote, pre, code');
    textElements.forEach((el: any) => {
      if (el && el.style) {
        el.style.setProperty('color', themeStyles.text, 'important');
      }
    });
  } catch (e) {
    console.error('applyThemeToDocument: 应用主题失败', e);
  }
}

/**
 * 设置主题观察器（监听 DOM 变化并自动应用主题）
 */
export function setupThemeObserver(
  doc: Document,
  settingsRef: React.MutableRefObject<ReadingSettings>,
  themeStyles: ThemeStyles
): () => void {
  if ((doc as any).__epubThemeObserver) {
    return () => {}; // 已经设置过，返回空清理函数
  }

  const applyTheme = () => {
    const latestSettings = settingsRef.current;
    const latestThemeStyles = getThemeStyles(latestSettings.theme);
    applyThemeToDocument(doc, latestSettings, latestThemeStyles);
  };

  const themeObserver = new MutationObserver(() => {
    applyTheme();
  });

  themeObserver.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  });

  (doc as any).__epubThemeObserver = themeObserver;

  // 返回清理函数
  return () => {
    themeObserver.disconnect();
    delete (doc as any).__epubThemeObserver;
  };
}

