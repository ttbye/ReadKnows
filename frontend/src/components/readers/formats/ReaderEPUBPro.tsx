/**
 * @author ttbye
 * 专业级 EPUB 电子书阅读器
 * 支持多种渲染引擎：epubjs、readium、react-epub
 * 默认使用 epubjs
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem } from '../../../types/reader';
import toast from 'react-hot-toast';

interface ReaderEPUBProProps {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  onSettingsChange: (settings: ReadingSettings) => void;
  onProgressChange: (progress: number, position: ReadingPosition) => void;
  onTOCChange: (toc: TOCItem[]) => void;
  onClose: () => void;
}

// 阅读器引擎类型
type ReaderEngine = 'epubjs' | 'readium' | 'react-epub';

// epubjs 管理器类型
type EpubjsManager = 'default' | 'continuous';

// epubjs Flow 模式
type EpubjsFlow = 'auto' | 'paginated' | 'scrolled-doc';

export default function ReaderEPUBPro({
  book,
  settings,
  initialPosition,
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
}: ReaderEPUBProProps) {
  // 核心状态
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 阅读器引擎（默认使用 epubjs）
  const [readerEngine] = useState<ReaderEngine>('epubjs');
  
  // epubjs 相关引用
  const epubjsBookRef = useRef<any>(null);
  const epubjsRenditionRef = useRef<any>(null);
  const totalChaptersRef = useRef<number>(1); // 保存总章节数
  const isInitializingRef = useRef(false);
  const isInitializedRef = useRef(false);
  
  // epubjs 配置
  const [epubjsManager] = useState<EpubjsManager>('default');
  const [epubjsFlow] = useState<EpubjsFlow>('paginated');
  
  // UI 状态
  const [toc, setToc] = useState<TOCItem[]>([]);
  
  // 翻页防抖
  const pageTurnStateRef = useRef<{
    lastPageTurnTime: number;
    isTurningPage: boolean;
  }>({
    lastPageTurnTime: 0,
    isTurningPage: false,
  });

  // 设备检测
  const [isMobile, setIsMobile] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  // 长按相关
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressThreshold = 500; // 500ms长按阈值
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // 获取文件URL
  const getFileUrl = useCallback(async (): Promise<string | null> => {
    if (!book.file_path && !book.file_name && !book.id) return null;
    
    const ext = book.file_name?.split('.').pop()?.toLowerCase() || 'epub';
    let serverUrl: string;
    
    if (book.id) {
      serverUrl = `/books/${book.id}.${ext}`;
    } else if (book.file_path) {
      if (book.file_path.startsWith('http://') || book.file_path.startsWith('https://') || book.file_path.startsWith('/')) {
        serverUrl = book.file_path;
      } else {
        serverUrl = `/books/${book.file_path}`;
      }
    } else {
      return null;
    }

    // 尝试使用离线存储
    try {
      const { offlineStorage } = await import('../../../utils/offlineStorage');
      if (book.id) {
        const cachedBlob = await offlineStorage.getBook(book.id);
        if (cachedBlob) {
          return offlineStorage.createBlobURL(cachedBlob);
        }
        const blob = await offlineStorage.downloadBook(book.id, ext, serverUrl);
        return offlineStorage.createBlobURL(blob);
      }
    } catch (error) {
      // 离线存储不可用，使用服务器URL
    }

    return serverUrl;
  }, [book.id, book.file_path, book.file_name]);

  // 检测设备类型和PWA模式（必须在所有条件返回之前）
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
      const isMobileDevice = mobileKeywords.some(keyword => userAgent.includes(keyword)) || window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
      
      // 检测PWA模式
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = (window.navigator as any).standalone === true; // iOS Safari
      setIsPWA(isStandalone || isFullscreen);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    // 监听display-mode变化
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkDevice);
    
    return () => {
      window.removeEventListener('resize', checkDevice);
      mediaQuery.removeEventListener('change', checkDevice);
    };
  }, []);

      // 组件卸载时清理所有定时器
      useEffect(() => {
        return () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
          }
        };
      }, []);

  // ==================== epubjs 阅读器实现 ====================
  const initEpubjsReader = useCallback(async (fileUrl: string) => {
    // 防止重复初始化
    if (isInitializingRef.current) {
      return;
    }
    
    isInitializingRef.current = true;
    
    try {
      if (!containerRef.current) {
        throw new Error('阅读器容器未准备好');
      }

      const container = containerRef.current;
      
      // 确保容器有尺寸
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        container.style.width = '100%';
        container.style.height = '100%';
      }

      const containerWidth = container.offsetWidth || window.innerWidth;
      const containerHeight = container.offsetHeight || window.innerHeight;

      // 动态导入 epubjs
      const { default: ePub } = await import('epubjs');
      
      // 创建 book 实例
      // epubjs 使用默认的请求方法，不需要手动提供 request
      const bookInstance = ePub(fileUrl, {
        openAs: 'epub',
      });

      epubjsBookRef.current = bookInstance;

      // 等待 book 加载完成
      await bookInstance.ready;
      await bookInstance.loaded.navigation;

      // 获取目录
      const navigation = bookInstance.navigation;
      const spine = bookInstance.spine;
      
      const tocItems: TOCItem[] = (navigation?.toc || []).map((item: any, index: number) => {
        let spineIndex = -1;
        try {
          const spineItem = spine.get(item.href);
          if (spineItem) {
            spineIndex = spineItem.index;
          }
        } catch (e) {
          // 查找失败，使用默认索引
        }
        
        return {
          id: item.id || `toc-${index}`,
          title: item.label || `目录项 ${index + 1}`,
          href: item.href,
          level: item.level || 1,
          chapterIndex: spineIndex >= 0 ? spineIndex : index,
        };
      });
      
      setToc(tocItems);
      onTOCChange(tocItems);

      // 计算并保存总章节数（优先使用 spine 的长度）
      try {
        let totalChapters = 0;
        
        // 方法1：使用 spine.items 数组长度（最常用）
        const spineItems = (spine as any).items || [];
        if (spineItems.length > 0) {
          totalChapters = spineItems.length;
        } else {
          // 方法2：遍历 spine 获取最大索引 + 1（最准确）
          try {
            let maxIndex = -1;
            let itemCount = 0;
            spine.each((item: any) => {
              itemCount++;
              if (item.index !== undefined && item.index > maxIndex) {
                maxIndex = item.index;
              }
            });
            if (maxIndex >= 0) {
              totalChapters = maxIndex + 1;
            } else if (itemCount > 0) {
              // 如果无法获取索引，使用遍历到的项目数
              totalChapters = itemCount;
            }
          } catch (e) {
            // 遍历失败
          }
          
          // 方法3：使用 TOC 项数量（可能不准确，因为 TOC 可能不包含所有 spine 项）
          if (totalChapters === 0 && tocItems.length > 0) {
            totalChapters = tocItems.length;
          }
        }
        
        if (totalChapters > 0) {
          totalChaptersRef.current = totalChapters;
        } else {
          totalChaptersRef.current = 1;
        }
      } catch (e) {
        console.error('ReaderEPUBPro: 获取总章节数失败', e);
        totalChaptersRef.current = tocItems.length || 1;
      }

      // 清空容器（注意：不要直接操作，让 epubjs 自己管理）
      // container.innerHTML = '';

      // 创建 rendition 配置
      const renditionConfig: any = {
        width: containerWidth,
        height: containerHeight,
        flow: epubjsFlow,
        spread: 'none', // 单页显示
        allowScriptedContent: false, // 默认禁用脚本内容
      };

      // 根据管理器类型设置 method
      if (epubjsManager === 'continuous') {
        renditionConfig.method = 'continuous';
      }

      // 创建 rendition
      const rendition = bookInstance.renderTo(container, renditionConfig);
      epubjsRenditionRef.current = rendition;
      
      // 修复 epubjs 的 hooks，确保它们使用正确的 document
      if (rendition && rendition.hooks) {
        // 获取有效的 document 对象的辅助函数
        const getValidDocument = (view: any, container: HTMLElement): Document | null => {
          // 首先检查 view.document 是否有效
          if (view && view.document && typeof view.document.createElement === 'function') {
            return view.document;
          }
          
          // 尝试从 iframe 获取
          try {
            const iframe = container.querySelector('iframe');
            if (iframe && iframe.contentDocument && typeof iframe.contentDocument.createElement === 'function') {
              return iframe.contentDocument;
            }
          } catch (e) {
            // 忽略跨域错误
          }
          
          // 尝试从 view 的其他属性获取
          try {
            if (view && view.window && view.window.document && typeof view.window.document.createElement === 'function') {
              return view.window.document;
            }
          } catch (e) {
            // 忽略错误
          }
          
          return null;
        };

        // 拦截 content hooks 的 trigger，确保所有 hooks 调用前验证 document
        const originalContentTrigger = rendition.hooks.content.trigger;
        if (originalContentTrigger) {
          rendition.hooks.content.trigger = function(name: string, view: any, ...args: any[]) {
            // 在触发之前，确保 view.document 是有效的 Document 对象
            if (view) {
              const validDoc = getValidDocument(view, container);
              if (validDoc) {
                // 如果当前 view.document 无效，替换为有效的 document
                if (!view.document || typeof view.document.createElement !== 'function') {
                  view.document = validDoc;
                }
              } else {
                // 如果无法获取有效的 document，跳过这个 hook
                console.warn(`ReaderEPUBPro: 跳过 hook "${name}"，无法获取有效的 document`, view);
                return;
              }
            }
            
            try {
              return originalContentTrigger.call(this, name, view, ...args);
            } catch (error: any) {
              // 如果 hook 执行失败，记录错误但不中断流程
              console.warn(`ReaderEPUBPro: hook "${name}" 执行失败`, error);
              return;
            }
          };
        }

        // 拦截 display hooks 的 trigger（如果有）
        if (rendition.hooks.display && rendition.hooks.display.trigger) {
          const originalDisplayTrigger = rendition.hooks.display.trigger;
          rendition.hooks.display.trigger = function(name: string, view: any, ...args: any[]) {
            if (view) {
              const validDoc = getValidDocument(view, container);
              if (validDoc) {
                if (!view.document || typeof view.document.createElement !== 'function') {
                  view.document = validDoc;
                }
              } else {
                console.warn(`ReaderEPUBPro: 跳过 display hook "${name}"，无法获取有效的 document`, view);
                return;
              }
            }
            
            try {
              return originalDisplayTrigger.call(this, name, view, ...args);
            } catch (error: any) {
              console.warn(`ReaderEPUBPro: display hook "${name}" 执行失败`, error);
              return;
            }
          };
        }
      }

      // 获取主题样式
      const themeStyles = {
        light: { bg: '#ffffff', text: '#000000' },
        dark: { bg: '#1a1a1a', text: '#ffffff' },
        sepia: { bg: '#f4e4bc', text: '#5c4b37' },
        green: { bg: '#c8e6c9', text: '#2e7d32' },
      }[settings.theme];

      // 应用主题
      const getFontFamily = () => {
        switch (settings.fontFamily) {
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
      };
      
      const theme = {
        body: {
          'font-size': `${settings.fontSize}px !important`,
          'line-height': `${settings.lineHeight} !important`,
          'font-family': getFontFamily() + ' !important',
          'padding': `${settings.margin}px !important`,
          'text-indent': `${settings.textIndent}em !important`,
          'background-color': themeStyles.bg + ' !important',
          'color': themeStyles.text + ' !important',
          'margin': '0 !important',
          'box-sizing': 'border-box !important',
        },
        // 确保所有元素都继承正确的颜色（epubjs 可能不支持通配符，使用具体元素）
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
      
      rendition.themes.default(theme);

      // 保存事件处理函数引用，用于清理
      const eventHandlers: {
        relocated?: (location: any) => void;
        keyup?: (e: KeyboardEvent) => void;
      } = {};

      // 监听内容加载
      rendition.hooks.content.register((view: any) => {
        const doc = view.document;
        // 确保 doc 是一个有效的 Document 对象
        if (!doc || typeof doc.createElement !== 'function') {
          console.warn('ReaderEPUBPro: view.document 不是有效的 Document 对象', doc);
          return;
        }

        // 在 iframe 的 window 对象上拦截字体加载（更早的拦截）
        try {
          const iframeWindow = doc.defaultView || (doc as any).parentWindow;
          if (iframeWindow) {
            // 拦截 fetch 请求
            const originalFetch = iframeWindow.fetch;
            if (originalFetch) {
              iframeWindow.fetch = function(...args: any[]) {
                const url = args[0];
                if (typeof url === 'string' && (
                  url.includes('res://') || 
                  url.includes('tt0011m') ||
                  (url.includes('.ttf') && url.includes('res://')) ||
                  url.startsWith('res://')
                )) {
                  // 阻止无效字体加载
                  return Promise.reject(new Error('Blocked invalid font'));
                }
                return originalFetch.apply(this, args);
              };
            }

            // 拦截 XMLHttpRequest
            const originalXHROpen = iframeWindow.XMLHttpRequest?.prototype?.open;
            if (originalXHROpen) {
              iframeWindow.XMLHttpRequest.prototype.open = function(method: string, url: string, ...args: any[]) {
                if (typeof url === 'string' && (
                  url.includes('res://') || 
                  url.includes('tt0011m') ||
                  (url.includes('.ttf') && url.includes('res://')) ||
                  url.startsWith('res://')
                )) {
                  // 阻止无效字体加载
                  return;
                }
                return originalXHROpen.apply(this, [method, url, ...args]);
              };
            }

            // 拦截 CSS 字体加载（通过修改 CSSStyleSheet）
            try {
              const originalInsertRule = CSSStyleSheet.prototype.insertRule;
              CSSStyleSheet.prototype.insertRule = function(rule: string, index?: number) {
                if (rule.includes('@font-face') && (
                  rule.includes('res://') || 
                  rule.includes('tt0011m') ||
                  rule.includes('res:///')
                )) {
                  // 阻止无效字体规则
                  return -1;
                }
                return originalInsertRule.call(this, rule, index);
              };
            } catch (e) {
              // 忽略拦截失败
            }
          }
        } catch (e) {
          // 拦截失败
        }

        // 移除无效字体引用的函数
        const removeInvalidFonts = () => {
          try {
            // 移除 <link> 标签中的无效字体引用
            const linkTags = doc.querySelectorAll('link[rel="stylesheet"], link[type="text/css"]');
            linkTags.forEach((link: any) => {
              const href = link.getAttribute('href') || link.href;
              if (href && (
                href.includes('res://') || 
                href.includes('file://') || 
                href.includes('res:///') ||
                href.includes('tt0011m') ||
                href.includes('.ttf') && href.includes('res://')
              )) {
                try {
                  link.remove();
                } catch (e) {
                  // 忽略移除错误
                }
              }
            });

            // 移除样式表中的无效字体引用
            const styleSheets = doc.styleSheets;
            for (let i = 0; i < styleSheets.length; i++) {
              try {
                const sheet = styleSheets[i];
                if (!sheet.cssRules) continue;
                
                for (let j = sheet.cssRules.length - 1; j >= 0; j--) {
                  try {
                    const rule = sheet.cssRules[j];
                    if (rule.type === CSSRule.FONT_FACE_RULE) {
                      const fontFaceRule = rule as CSSFontFaceRule;
                      const src = fontFaceRule.style.getPropertyValue('src');
                      if (src && (
                        src.includes('res://') || 
                        src.includes('file://') || 
                        src.includes('res:///') ||
                        src.includes('tt0011m')
                      )) {
                        sheet.deleteRule(j);
                      }
                    }
                  } catch (e) {
                    // 忽略无法访问的规则
                  }
                }
              } catch (e) {
                // 忽略无法访问的样式表
              }
            }

            // 移除 <style> 标签中的无效字体引用
            const styleTags = doc.querySelectorAll('style');
            styleTags.forEach((styleTag: HTMLStyleElement) => {
              if (styleTag.textContent) {
                let cleanedCSS = styleTag.textContent;
                // 移除包含 res:// 的 @font-face 规则
                cleanedCSS = cleanedCSS.replace(/@font-face\s*\{[^}]*src\s*:[^}]*res:\/\/[^}]*\}/gi, '/* 已移除无效字体引用 */');
                cleanedCSS = cleanedCSS.replace(/@font-face\s*\{[^}]*src\s*:[^}]*tt0011m[^}]*\}/gi, '/* 已移除无效字体引用 */');
                cleanedCSS = cleanedCSS.replace(/url\([^)]*res:\/\/[^)]*\)/gi, '');
                cleanedCSS = cleanedCSS.replace(/url\([^)]*tt0011m[^)]*\)/gi, '');
                
                if (cleanedCSS !== styleTag.textContent) {
                  styleTag.textContent = cleanedCSS;
                }
              }
            });
          } catch (e) {
            // 清理失败
          }
        };

        // 立即执行一次清理
        removeInvalidFonts();

        // 使用 MutationObserver 实时监听并移除动态添加的字体引用
        if (!(doc as any).__epubFontObserver) {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node: any) => {
                // 验证 node 是有效的 Element 对象
                if (node && node.nodeType === Node.ELEMENT_NODE && typeof node.getAttribute === 'function') {
                  // 检查 link 标签
                  if (node.tagName === 'LINK' || node.tagName === 'link') {
                    try {
                      const href = node.getAttribute('href') || (node.href ? String(node.href) : '');
                      if (href && (
                        href.includes('res://') || 
                        href.includes('file://') || 
                        href.includes('res:///') ||
                        href.includes('tt0011m') ||
                        (href.includes('.ttf') && href.includes('res://'))
                      )) {
                        try {
                          if (typeof node.remove === 'function') {
                            node.remove();
                          }
                        } catch (e) {
                          // 忽略移除错误
                        }
                      }
                    } catch (e) {
                      // 忽略属性访问错误
                    }
                  }
                  
                  // 检查 style 标签
                  if (node.tagName === 'STYLE' || node.tagName === 'style') {
                    try {
                      if (node.textContent && (
                        node.textContent.includes('@font-face') || 
                        node.textContent.includes('res://') || 
                        node.textContent.includes('tt0011m')
                      )) {
                        let cleanedCSS = node.textContent;
                        cleanedCSS = cleanedCSS.replace(/@font-face\s*\{[^}]*\}/gi, '');
                        cleanedCSS = cleanedCSS.replace(/res:\/\/[^'"]*/gi, '');
                        cleanedCSS = cleanedCSS.replace(/url\([^)]*res:\/\/[^)]*\)/gi, '');
                        cleanedCSS = cleanedCSS.replace(/url\([^)]*tt0011m[^)]*\)/gi, '');
                        node.textContent = cleanedCSS;
                      }
                    } catch (e) {
                      // 忽略样式处理错误
                    }
                  }
                }
              });
            });
            
            // 再次执行清理（处理已存在的元素）
            removeInvalidFonts();
          });
          
          observer.observe(doc, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'src'],
          });
          
          (doc as any).__epubFontObserver = observer;
        }

        // 应用主题到文档
        if (doc.body) {
          doc.body.style.setProperty('background-color', themeStyles.bg, 'important');
          doc.body.style.setProperty('color', themeStyles.text, 'important');
        }
        
        // 强制应用颜色到所有文本元素
        const applyThemeToElements = () => {
          try {
            const iframeWindow = doc.defaultView || (doc as any).parentWindow;
            // 获取所有可能的文本元素
            const textElements = doc.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, a, em, strong, b, i, u, blockquote, pre, code');
            textElements.forEach((el: any) => {
              // 验证 el 是有效的 Element 对象
              if (el && typeof el.getElementsByTagName === 'function' && el.style) {
                // 检查当前颜色，如果是白色或黑色且与主题不匹配，则强制应用
                let currentColor = '';
                try {
                  if (iframeWindow) {
                    const computedStyle = iframeWindow.getComputedStyle(el);
                    currentColor = computedStyle.color;
                  }
                } catch (e) {
                  // 无法获取计算样式
                }
                
                // 如果当前颜色是白色 (#ffffff, rgb(255,255,255) 等) 且主题是亮色，改为深色
                if (settings.theme === 'light' && (
                  currentColor === 'rgb(255, 255, 255)' || 
                  currentColor === '#ffffff' || 
                  currentColor === 'white' ||
                  currentColor.includes('rgb(255, 255, 255)')
                )) {
                  el.style.setProperty('color', themeStyles.text, 'important');
                }
                // 如果当前颜色是黑色 (#000000, rgb(0,0,0) 等) 且主题是深色，改为浅色
                else if (settings.theme === 'dark' && (
                  currentColor === 'rgb(0, 0, 0)' || 
                  currentColor === '#000000' || 
                  currentColor === 'black' ||
                  currentColor.includes('rgb(0, 0, 0)')
                )) {
                  el.style.setProperty('color', themeStyles.text, 'important');
                }
                // 如果颜色与背景色太接近，也强制应用主题色
                else if (currentColor === themeStyles.bg || 
                         (settings.theme === 'dark' && (currentColor === 'rgb(26, 26, 26)' || currentColor.includes('rgb(26, 26, 26)'))) ||
                         (settings.theme === 'light' && (currentColor === 'rgb(255, 255, 255)' || currentColor.includes('rgb(255, 255, 255)'))) ||
                         !currentColor) {
                  el.style.setProperty('color', themeStyles.text, 'important');
                }
              }
            });
          } catch (e) {
            // 应用失败，忽略
          }
        };
        
        // 立即应用一次
        applyThemeToElements();
        
        // 使用 MutationObserver 监听新添加的元素
        if (!(doc as any).__epubThemeObserver) {
          const themeObserver = new MutationObserver(() => {
            applyThemeToElements();
          });
          
          themeObserver.observe(doc.body || doc.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class'],
          });
          
          (doc as any).__epubThemeObserver = themeObserver;
        }
      });

      // 恢复阅读位置或显示第一页
      let displayPromise: Promise<any>;
      let restoredByCFI = false;
      
      // 优先使用 CFI（最精确的位置）
      if (initialPosition?.currentLocation && initialPosition.currentLocation.startsWith('epubcfi(')) {
        try {
          displayPromise = rendition.display(initialPosition.currentLocation);
          restoredByCFI = true;
        } catch (error) {
          console.error('ReaderEPUBPro: ❌ CFI 恢复失败，回退到章节索引', error);
          // CFI 失败，回退到章节索引
          if (initialPosition.chapterIndex !== undefined) {
            const item = spine.get(initialPosition.chapterIndex);
            displayPromise = item ? rendition.display(item.href) : rendition.display(spine.get(0).href);
          } else {
            displayPromise = rendition.display(spine.get(0).href);
          }
        }
      } else if (initialPosition?.chapterIndex !== undefined) {
        const item = spine.get(initialPosition.chapterIndex);
        if (item) {
          displayPromise = rendition.display(item.href);
        } else {
          const firstItem = spine.get(0);
          displayPromise = rendition.display(firstItem.href);
        }
      } else {
        const firstItem = spine.get(0);
        if (!firstItem) {
          throw new Error('书籍没有可用的章节');
        }
        displayPromise = rendition.display(firstItem.href);
      }

      await displayPromise;
      
      // 等待内容渲染（CFI 恢复可能需要更长时间）
      await new Promise(resolve => setTimeout(resolve, restoredByCFI ? 800 : 500));
      
      // 检查内容是否显示（静默检查）
      const iframe = container.querySelector('iframe');
      if (iframe) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          // 内容已显示
        } catch (e) {
          // 无法访问内容
        }
      }

      // 监听位置变化（保存函数引用用于清理）
      let isFirstRelocated = true; // 标记是否是首次 relocated 事件
      
      // 获取总章节数（从 ref 中读取）
      const getTotalChapters = (): number => {
        return totalChaptersRef.current;
      };
      
      eventHandlers.relocated = (location: any) => {
        // 提取位置信息
        const spineIndex = location.start?.index ?? 0;
        const cfi = location.start?.cfi;
        const currentPage = location.start?.displayed?.page || 1;
        const totalPages = location.start?.displayed?.total || 1;
        
        // ⚠️ 重要：使用章节索引计算全书进度（而不是章节内的页码进度）
        // 进度 = (当前章节索引 + 1) / 总章节数
        const totalChapters = getTotalChapters();
        let progress = 0;
        
        // 验证总章节数是否合理（至少应该大于 spineIndex）
        if (totalChapters > 0 && spineIndex >= 0) {
          // 如果总章节数不合理（比如只有1个章节，但 spineIndex 很大），说明总章节数获取错误
          if (totalChapters === 1 && spineIndex > 0) {
            // 总章节数可能获取错误，尝试重新获取
            try {
              const book = epubjsBookRef.current;
              if (book && book.spine) {
                const spine = book.spine;
                let recalculatedTotal = 0;
                
                // 尝试多种方法重新获取总章节数
                if (typeof spine.length === 'number') {
                  recalculatedTotal = spine.length;
                } else {
                  const spineItems = (spine as any).items || [];
                  if (spineItems.length > 0) {
                    recalculatedTotal = spineItems.length;
                  } else {
                    // 遍历获取最大索引
                    let maxIndex = -1;
                    try {
                      spine.each((item: any) => {
                        if (item.index !== undefined && item.index > maxIndex) {
                          maxIndex = item.index;
                        }
                      });
                      if (maxIndex >= 0) {
                        recalculatedTotal = maxIndex + 1;
                      }
                    } catch (e) {
                      // 忽略错误
                    }
                  }
                }
                
                if (recalculatedTotal > 0 && recalculatedTotal > spineIndex) {
                  totalChaptersRef.current = recalculatedTotal;
                  progress = Math.min(1, Math.max(0, (spineIndex + 1) / recalculatedTotal));
                } else {
                  // 如果重新计算失败，使用 percentage 或页码
                  const percentage = location.start?.percentage;
                  if (percentage !== undefined && percentage !== null && !isNaN(percentage) && percentage > 0) {
                    progress = Math.min(1, Math.max(0, percentage));
                    console.warn('ReaderEPUBPro: ⚠️ 使用 percentage 作为进度', {
                      spineIndex,
                      totalChapters,
                      percentage,
                      progress,
                    });
                  } else if (totalPages > 0 && currentPage > 0) {
                    progress = Math.min(1, Math.max(0, currentPage / totalPages));
                  } else {
                    progress = 0;
                  }
                }
              } else {
                progress = 0;
              }
            } catch (e) {
              console.error('ReaderEPUBPro: 重新获取总章节数失败', e);
              progress = 0;
            }
          } else if (spineIndex >= totalChapters) {
            // 如果 spineIndex 大于等于总章节数，说明总章节数可能获取错误
            // 使用 percentage 或页码作为备选
            const percentage = location.start?.percentage;
            if (percentage !== undefined && percentage !== null && !isNaN(percentage) && percentage > 0) {
              progress = Math.min(1, Math.max(0, percentage));
            } else if (totalPages > 0 && currentPage > 0) {
              progress = Math.min(1, Math.max(0, currentPage / totalPages));
            } else {
              progress = Math.min(1, Math.max(0, (spineIndex + 1) / (spineIndex + 1))); // 至少是当前章节
            }
          } else {
            // 正常情况：使用章节索引计算全书进度
            progress = Math.min(1, Math.max(0, (spineIndex + 1) / totalChapters));
          }
        } else {
          // 如果章节信息不可用，尝试使用 percentage（如果存在）
          const percentage = location.start?.percentage;
          if (percentage !== undefined && percentage !== null && !isNaN(percentage) && percentage > 0) {
            progress = Math.min(1, Math.max(0, percentage));
          } else {
            progress = 0;
          }
        }
        
        // 确保进度值有效
        if (isNaN(progress) || progress < 0 || progress > 1) {
          progress = 0;
        }
        
        // 获取章节标题（从 state 中的 toc 获取）
        let chapterTitle = '';
        // 注意：这里需要在闭包中访问 toc，但由于 toc 是 state，需要使用最新的值
        // 暂时使用 epubjsBookRef 来获取章节信息
        try {
          const book = epubjsBookRef.current;
          if (book) {
            const navigation = book.navigation;
            const tocItems = navigation?.toc || [];
            const tocItem = tocItems.find((item: any) => {
              try {
                const spineItem = book.spine.get(item.href);
                return spineItem && spineItem.index === spineIndex;
              } catch (e) {
                return false;
              }
            });
            if (tocItem) {
              chapterTitle = tocItem.label || '';
            }
          }
        } catch (e) {
          // 获取失败
        }
        
        const position: ReadingPosition = {
          chapterIndex: spineIndex,
          currentPage: location.start?.displayed?.page || 1,
          totalPages: location.start?.displayed?.total || 1,
          progress: progress,
          currentLocation: cfi, // 保存 CFI（最精确的位置）
          chapterTitle: chapterTitle,
        };
        
        // 标记首次事件
        if (isFirstRelocated) {
          isFirstRelocated = false;
        }
        
        // 触发进度保存
        onProgressChange(progress, position);
      };
      rendition.on('relocated', eventHandlers.relocated);

      // 键盘快捷键（保存函数引用用于清理）
      eventHandlers.keyup = (e: KeyboardEvent) => {
        if (e.key === settings.keyboardShortcuts.prev || e.key === 'ArrowLeft') {
          e.preventDefault();
          rendition.prev();
        } else if (e.key === settings.keyboardShortcuts.next || e.key === 'ArrowRight') {
          e.preventDefault();
          rendition.next();
        }
      };
      rendition.on('keyup', eventHandlers.keyup);

      // 注意：点击/触摸翻页现在由最顶层的透明捕获层处理
      // 不在这里添加事件监听，避免重复触发

      // 保存事件处理函数引用到 rendition，用于清理
      (rendition as any).__eventHandlers = eventHandlers;


      // 暴露翻页函数到全局
      (window as any).__readerPageTurn = async (direction: 'prev' | 'next') => {
        // 防抖检查
        const now = Date.now();
        const debounceTime = 300;
        if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) {
          return;
        }
        
        if (pageTurnStateRef.current.isTurningPage) {
          return;
        }
        
        pageTurnStateRef.current.isTurningPage = true;
        pageTurnStateRef.current.lastPageTurnTime = now;
        
        try {
          if (direction === 'prev') {
            await rendition.prev();
          } else {
            await rendition.next();
          }
        } catch (err: any) {
          console.error(`ReaderEPUBPro: 翻页失败`, err);
        } finally {
          setTimeout(() => {
            pageTurnStateRef.current.isTurningPage = false;
          }, debounceTime);
        }
      };

      // 窗口大小变化时调整
      const handleResize = () => {
        if (rendition && container) {
          const width = container.offsetWidth || window.innerWidth;
          const height = container.offsetHeight || window.innerHeight;
          rendition.resize(width, height);
        }
      };

      window.addEventListener('resize', handleResize);
      
      // 暴露全局跳转函数供TOC使用
      (window as any).__epubGoToChapter = async (href: string) => {
        if (rendition) {
          try {
            await rendition.display(href);
            toast.success('已跳转');
          } catch (error) {
            console.error('ReaderEPUBPro: 跳转失败', error);
            toast.error('跳转失败');
          }
        }
      };
      
      // 保存清理函数到 ref，供 useEffect 使用
      (epubjsRenditionRef.current as any).__cleanup = {
        handleResize,
        rendition,
        bookInstance,
      };

      setLoading(false);
      isInitializedRef.current = true;
    } catch (error: any) {
      console.error('ReaderEPUBPro: epubjs 加载失败', error);
      setError(`加载失败: ${error.message || '未知错误'}`);
      setLoading(false);
      toast.error(`加载书籍失败: ${error.message || '未知错误'}`);
      isInitializedRef.current = false;
    } finally {
      isInitializingRef.current = false;
    }
  }, [book.id, initialPosition?.currentLocation, initialPosition?.chapterIndex, epubjsManager, epubjsFlow, onProgressChange, onTOCChange]);

  // 实时更新主题和字体设置（不重新初始化阅读器）
  useEffect(() => {
    const rendition = epubjsRenditionRef.current;
    if (!rendition) return;

    // 获取主题样式
    const themeStyles = {
      light: { bg: '#ffffff', text: '#000000' },
      dark: { bg: '#1a1a1a', text: '#ffffff' },
      sepia: { bg: '#f4e4bc', text: '#5c4b37' },
      green: { bg: '#c8e6c9', text: '#2e7d32' },
    }[settings.theme];

    // 构建新主题
    const getFontFamily = () => {
      switch (settings.fontFamily) {
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
    };
    
    const theme = {
      body: {
        'font-size': `${settings.fontSize}px !important`,
        'line-height': `${settings.lineHeight} !important`,
        'font-family': getFontFamily() + ' !important',
        'padding': `${settings.margin}px !important`,
        'text-indent': `${settings.textIndent}em !important`,
        'background-color': themeStyles.bg + ' !important',
        'color': themeStyles.text + ' !important',
        'margin': '0 !important',
        'box-sizing': 'border-box !important',
      },
      // 确保所有元素都继承正确的颜色（epubjs 可能不支持通配符，使用具体元素）
      'p': {
        'text-indent': `${settings.textIndent}em !important`,
        'margin-bottom': '0.8em !important',
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

    // 应用新主题到 rendition
    try {
      rendition.themes.default(theme);
      
      // 对已经渲染的内容也应用样式
      rendition.views().forEach((view: any) => {
        if (view && view.document) {
          const doc = view.document;
          // 验证 document 是否有效
          if (!doc || typeof doc.createElement !== 'function' || !doc.body) {
            console.warn('ReaderEPUBPro: 跳过无效的 view.document', doc);
            return;
          }
          if (doc.body) {
            doc.body.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
            doc.body.style.setProperty('line-height', `${settings.lineHeight}`, 'important');
            doc.body.style.setProperty('padding', `${settings.margin}px`, 'important');
            doc.body.style.setProperty('background-color', themeStyles.bg, 'important');
            doc.body.style.setProperty('color', themeStyles.text, 'important');
            
            // 应用字体
            let fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            switch (settings.fontFamily) {
              case 'serif':
                fontFamily = '"Songti SC", "SimSun", "宋体", "STSong", serif';
                break;
              case 'sans-serif':
                fontFamily = '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "WenQuanYi Micro Hei", sans-serif';
                break;
              case 'monospace':
                fontFamily = '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace';
                break;
            }
            doc.body.style.setProperty('font-family', fontFamily, 'important');
            
            // 应用文本缩进到所有段落
            const paragraphs = doc.querySelectorAll('p');
            paragraphs.forEach((p: HTMLElement) => {
              p.style.setProperty('text-indent', `${settings.textIndent}em`, 'important');
              p.style.setProperty('color', themeStyles.text, 'important');
            });
            
            // 强制应用颜色到所有文本元素
            const textElements = doc.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, a, em, strong, b, i, u, blockquote, pre, code');
            textElements.forEach((el: any) => {
              // 验证 el 是有效的 Element 对象
              if (el && typeof el.getElementsByTagName === 'function' && el.style) {
                // 检查当前颜色，如果是白色或黑色且与主题不匹配，则强制应用
                let currentColor = '';
                try {
                  const iframeWindow = doc.defaultView || (doc as any).parentWindow;
                  if (iframeWindow) {
                    const computedStyle = iframeWindow.getComputedStyle(el);
                    currentColor = computedStyle.color;
                  }
                } catch (e) {
                  // 无法获取计算样式
                }
                
                // 如果当前颜色是白色且主题是亮色，改为深色
                if (settings.theme === 'light' && (
                  currentColor === 'rgb(255, 255, 255)' || 
                  currentColor === '#ffffff' || 
                  currentColor === 'white' ||
                  currentColor.includes('rgb(255, 255, 255)')
                )) {
                  el.style.setProperty('color', themeStyles.text, 'important');
                }
                // 如果当前颜色是黑色且主题是深色，改为浅色
                else if (settings.theme === 'dark' && (
                  currentColor === 'rgb(0, 0, 0)' || 
                  currentColor === '#000000' || 
                  currentColor === 'black' ||
                  currentColor.includes('rgb(0, 0, 0)')
                )) {
                  el.style.setProperty('color', themeStyles.text, 'important');
                }
                // 如果颜色与背景色太接近，也强制应用主题色
                else if (currentColor === themeStyles.bg || 
                         (settings.theme === 'dark' && (currentColor === 'rgb(26, 26, 26)' || currentColor.includes('rgb(26, 26, 26)'))) ||
                         (settings.theme === 'light' && (currentColor === 'rgb(255, 255, 255)' || currentColor.includes('rgb(255, 255, 255)'))) ||
                         !currentColor) {
                  el.style.setProperty('color', themeStyles.text, 'important');
                }
              }
            });
          }
        }
      });
      
      // 等待样式生效后重新计算分页和布局
      setTimeout(async () => {
        try {
          // 调用 resize 方法重新计算布局
          if (typeof rendition.resize === 'function') {
            await rendition.resize();
          }
          
          // 或者使用 clear 和 render 强制重新渲染当前页
          // 这样可以确保分页正确
          const currentLocation = rendition.currentLocation();
          if (currentLocation?.start?.cfi) {
            await rendition.display(currentLocation.start.cfi);
          }
        } catch (e) {
          console.error('ReaderEPUBPro: 重新布局失败', e);
        }
      }, 100); // 延迟100ms确保样式已应用
      
    } catch (error) {
      console.error('ReaderEPUBPro: 更新主题失败', error);
    }
  }, [settings.theme, settings.fontSize, settings.fontFamily, settings.lineHeight, settings.margin, settings.textIndent]);

  // 加载阅读器
  useEffect(() => {
    const loadReader = async () => {
      if (!book.id && !book.file_path) {
        setError('书籍信息不完整');
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);

      try {
        const fileUrl = await getFileUrl();
        if (!fileUrl) {
          throw new Error('无法获取书籍文件URL');
        }

        // 根据阅读器引擎加载
        if (readerEngine === 'epubjs') {
          await initEpubjsReader(fileUrl);
        } else if (readerEngine === 'readium') {
          // TODO: 实现 readium
          toast('Readium 阅读器暂未实现', { icon: 'ℹ️' });
          setError('Readium 阅读器暂未实现');
          setLoading(false);
        } else if (readerEngine === 'react-epub') {
          // TODO: 实现 react-epub
          toast('React-EPUB 阅读器暂未实现', { icon: 'ℹ️' });
          setError('React-EPUB 阅读器暂未实现');
          setLoading(false);
        } else {
          // 默认使用 epubjs
          await initEpubjsReader(fileUrl);
        }
      } catch (error: any) {
        console.error('ReaderEPUBPro: 加载失败', error);
        setError(`加载失败: ${error.message || '未知错误'}`);
        setLoading(false);
        toast.error(`加载书籍失败: ${error.message || '未知错误'}`);
      }
    };

    // 延迟加载，确保容器已渲染
    const timer = setTimeout(() => {
      loadReader();
    }, 100);

    return () => {
      clearTimeout(timer);
      // 注意：不要在这里清理，因为 settings 变化时也会触发这个 effect
      // 清理逻辑在单独的 useEffect 中处理
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.file_path, readerEngine]);

  // 组件卸载时清理（只在组件真正卸载时执行一次）
  useEffect(() => {
    return () => {
      // 使用 requestIdleCallback 或 setTimeout 延迟清理，避免与 React 的 DOM 操作冲突
      const cleanup = () => {
        try {
          const rendition = epubjsRenditionRef.current;
          const bookInstance = epubjsBookRef.current;
          
          // 移除 resize 事件监听器
          if (rendition && (rendition as any).__cleanup) {
            try {
              window.removeEventListener('resize', (rendition as any).__cleanup.handleResize);
            } catch (e) {
              // 忽略错误
            }
          }
          
          
          // 清理 rendition
          if (rendition) {
            try {
              // 移除事件监听器
              const eventHandlers = (rendition as any).__eventHandlers;
              if (eventHandlers) {
                try {
                  if (eventHandlers.relocated && typeof rendition.removeListener === 'function') {
                    rendition.removeListener('relocated', eventHandlers.relocated);
                  } else if (eventHandlers.relocated && typeof rendition.off === 'function') {
                    rendition.off('relocated', eventHandlers.relocated);
                  }
                  if (eventHandlers.keyup && typeof rendition.removeListener === 'function') {
                    rendition.removeListener('keyup', eventHandlers.keyup);
                  } else if (eventHandlers.keyup && typeof rendition.off === 'function') {
                    rendition.off('keyup', eventHandlers.keyup);
                  }
                } catch (e) {
                  // 忽略错误
                }
              }
              
              // 销毁 rendition（这会自动清理 DOM）
              if (typeof rendition.destroy === 'function') {
                rendition.destroy();
              }
            } catch (e) {
              // 忽略错误
            }
            epubjsRenditionRef.current = null;
          }
          
          // 清理 book
          if (bookInstance) {
            try {
              if (typeof bookInstance.destroy === 'function') {
                bookInstance.destroy();
              }
            } catch (e) {
              // 忽略错误
            }
            epubjsBookRef.current = null;
          }
          
          // 清理全局函数
          delete (window as any).__readerPageTurn;
          
          // 重置初始化标志
          isInitializedRef.current = false;
          isInitializingRef.current = false;
        } catch (e) {
          // 忽略所有清理错误
        }
      };
      
      // 清理全局函数
      delete (window as any).__epubGoToChapter;
      
      // 延迟清理，确保 React 完成 DOM 操作后再清理
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cleanup, { timeout: 1000 });
      } else {
        setTimeout(cleanup, 100);
      }
    };
  }, []);

  // 主题样式
  // 检测设备类型和PWA模式（必须在所有条件返回之前）
  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
      const isMobileDevice = mobileKeywords.some(keyword => userAgent.includes(keyword)) || window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
      
      // 检测PWA模式
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = (window.navigator as any).standalone === true; // iOS Safari
      setIsPWA(isStandalone || isFullscreen);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    // 监听display-mode变化
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', checkDevice);
    
    return () => {
      window.removeEventListener('resize', checkDevice);
      mediaQuery.removeEventListener('change', checkDevice);
    };
  }, []);

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // 触摸开始记录（用于检测误触和滑动）
  const touchStartRef = useRef<{ 
    x: number; 
    y: number; 
    time: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  
  // 触摸移动记录（用于检测滑动方向）
  const touchMoveRef = useRef<{
    maxMoveX: number;
    maxMoveY: number;
    lastX: number;
    lastY: number;
  }>({ maxMoveX: 0, maxMoveY: 0, lastX: 0, lastY: 0 });

  // 显示/隐藏底部导航栏的函数（通过全局函数调用）
  const showBars = useCallback(() => {
    if ((window as any).__toggleReaderNavigation) {
      (window as any).__toggleReaderNavigation();
    }
  }, []);

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (loading) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // 检查是否在中心区域（30% - 70%）
    const centerXStart = width * 0.3;
    const centerXEnd = width * 0.7;
    const centerYStart = height * 0.3;
    const centerYEnd = height * 0.7;
    const isInCenterArea = x >= centerXStart && x <= centerXEnd && 
                           y >= centerYStart && y <= centerYEnd;
    
    // 记录触摸开始的位置和时间
    touchStartRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      clientX: touch.clientX,
      clientY: touch.clientY,
      time: Date.now(),
    };
    
    // 重置移动记录
    touchMoveRef.current = {
      maxMoveX: 0,
      maxMoveY: 0,
      lastX: touch.clientX,
      lastY: touch.clientY,
    };
    
    // 移动端PWA模式：在中心区域长按显示导航栏
    if (isMobile && isPWA && isInCenterArea) {
      longPressTimerRef.current = setTimeout(() => {
        showBars();
        // 触觉反馈（如果支持）
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, longPressThreshold);
    }
  }, [loading, isMobile, isPWA, showBars]);

  // 处理触摸移动（检测滑动）
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) {
      // 如果开始移动，取消长按定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }
    
    const touch = e.touches[0];
    if (!touch) return;
    
    // 计算相对于起点的移动距离
    const moveX = Math.abs(touch.clientX - touchStartRef.current.clientX);
    const moveY = Math.abs(touch.clientY - touchStartRef.current.clientY);
    const totalDistance = Math.sqrt(moveX * moveX + moveY * moveY);
    
    // 如果移动距离超过阈值，取消长按检测
    if (totalDistance > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // 更新最大移动距离
    touchMoveRef.current.maxMoveX = Math.max(touchMoveRef.current.maxMoveX, moveX);
    touchMoveRef.current.maxMoveY = Math.max(touchMoveRef.current.maxMoveY, moveY);
    touchMoveRef.current.lastX = touch.clientX;
    touchMoveRef.current.lastY = touch.clientY;
    
    // 滑动翻页：只有在用户选择滑动翻页模式时才阻止默认行为
    if (settings.pageTurnMethod === 'swipe' && moveX > 10 && moveX > moveY * 1.5) {
      e.preventDefault();
    }
  }, [settings.pageTurnMethod]);

  // 判断是否为有效的滑动翻页
  const checkSwipeGesture = useCallback((): 'prev' | 'next' | null => {
    if (!touchStartRef.current) return null;
    
    const moveX = touchMoveRef.current.maxMoveX;
    const moveY = touchMoveRef.current.maxMoveY;
    const deltaX = touchMoveRef.current.lastX - touchStartRef.current.clientX;
    
    // 滑动翻页的条件：
    // 1. 水平滑动距离 > 50px（足够的滑动距离）
    // 2. 水平滑动距离 > 垂直滑动距离 * 1.5（明确的横向滑动）
    // 3. 滑动方向明确（向左或向右）
    if (moveX > 50 && moveX > moveY * 1.5) {
      if (deltaX < -30) {
        // 向左滑动 - 下一页
        return 'next';
      } else if (deltaX > 30) {
        // 向右滑动 - 上一页
        return 'prev';
      }
    }
    
    return null;
  }, []);

  // PC端鼠标按下事件（用于长按检测）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 点击按钮或输入框时不处理
    if (target.closest('button') || target.closest('input')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // 检查是否在中心区域（30% - 70%）
    const centerXStart = width * 0.3;
    const centerXEnd = width * 0.7;
    const centerYStart = height * 0.3;
    const centerYEnd = height * 0.7;
    const isInCenterArea = x >= centerXStart && x <= centerXEnd && 
                           y >= centerYStart && y <= centerYEnd;
    
    mouseDownRef.current = {
      x,
      y,
      time: Date.now(),
    };
    
    // PC端：在中心区域长按显示导航栏
    if (!isMobile && isInCenterArea) {
      longPressTimerRef.current = setTimeout(() => {
        showBars();
      }, longPressThreshold);
    }
  }, [isMobile, showBars]);

  // PC端鼠标移动事件（取消长按）
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (mouseDownRef.current && longPressTimerRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const deltaX = Math.abs(currentX - mouseDownRef.current.x);
      const deltaY = Math.abs(currentY - mouseDownRef.current.y);
      
      // 如果移动距离超过阈值，取消长按检测
      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  // PC端鼠标抬起事件
  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    mouseDownRef.current = null;
  }, []);

  // 处理触摸/点击事件的函数（带防抖和误触检测）
  const handleTouchClick = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (loading || !epubjsRenditionRef.current) return;
    
    // 只有在用户选择点击翻页模式且启用了点击翻页时才处理
    if (settings.pageTurnMethod !== 'click' || !settings.clickToTurn) {
      return;
    }
    
    // 防抖检查
    const now = Date.now();
    const debounceTime = 300;
    if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) {
      return;
    }

    if (pageTurnStateRef.current.isTurningPage) {
      return;
    }
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    let x: number, y: number;
    let isTouchEvent = false;
    
    // 判断是 touch 还是 mouse 事件
    if ('touches' in e.nativeEvent) {
      isTouchEvent = true;
      const touch = e.nativeEvent.touches[0] || e.nativeEvent.changedTouches[0];
      if (!touch) return;
      x = touch.clientX - rect.left;
      y = touch.clientY - rect.top;
    } else {
      x = (e as React.MouseEvent).clientX - rect.left;
      y = (e as React.MouseEvent).clientY - rect.top;
    }
    
    // 触摸事件的处理
    if (isTouchEvent && touchStartRef.current) {
      // 清除长按定时器（触摸结束）
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // 点击翻页模式：检查误触条件
      const touchDuration = now - touchStartRef.current.time;
      const moveDistance = Math.sqrt(
        Math.pow(x - touchStartRef.current.x, 2) + 
        Math.pow(y - touchStartRef.current.y, 2)
      );
      
      // 判断是滑动还是点击
      const isSwipe = moveDistance > 50;
      
      // 如果是滑动，不处理点击
      if (isSwipe) {
        touchStartRef.current = null;
        return;
      }
        
      // 检测误触条件：
      // 1. 触摸时间太短（< 80ms）- 可能是误触
      // 2. 触摸时间太长（> 800ms）- 可能是长按或选择文字
      // 3. 移动距离太大（> 15px）- 是移动而不是点击
      if (touchDuration < 80) {
        touchStartRef.current = null;
        return;
      }
        
      if (touchDuration > 800) {
        touchStartRef.current = null;
        return;
      }
        
      if (moveDistance > 15) {
        touchStartRef.current = null;
        return;
      }
        
      // 点击翻页模式下，通过误触检测后继续执行点击翻页
      // 清除触摸记录
      touchStartRef.current = null;
    }
    
    // 点击翻页模式：检查是否点击了中心区域（用于切换导航栏）
    // 或者 PC 端的鼠标点击也应该支持
    
    // 只有在点击翻页模式下才处理点击翻页（或者是PC端鼠标点击）
    if (settings.pageTurnMethod === 'click' || !isTouchEvent) {
      const width = rect.width;
      const height = rect.height;
      
      // 检查是否点击了中心区域（30% - 70%）
      const centerXStart = width * 0.3;
      const centerXEnd = width * 0.7;
      const centerYStart = height * 0.3;
      const centerYEnd = height * 0.7;
      
      // 中心区域不再通过点击显示导航栏（改为长按显示）
      // 直接执行点击翻页
      
      // 设置翻页状态
      pageTurnStateRef.current.isTurningPage = true;
      pageTurnStateRef.current.lastPageTurnTime = now;
      
      // 根据翻页模式决定翻页方向
      if (settings.pageTurnMode === 'horizontal') {
        if (x < width / 2) {
          epubjsRenditionRef.current.prev();
        } else {
          epubjsRenditionRef.current.next();
        }
      } else {
        if (y < height / 2) {
          epubjsRenditionRef.current.prev();
        } else {
          epubjsRenditionRef.current.next();
        }
      }
      
      // 重置翻页状态
      setTimeout(() => {
        pageTurnStateRef.current.isTurningPage = false;
      }, debounceTime);
    }
  }, [loading, settings.clickToTurn, settings.pageTurnMode, settings.pageTurnMethod, checkSwipeGesture]);

  // 判断是否为PC端
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  
  // 获取阅读区域宽度样式
  const getReaderWidthStyle = () => {
    if (!isDesktop) {
      // 移动端和平板：始终全宽
      return { width: '100%', maxWidth: '100%', margin: '0' };
    }
    
    // PC端：根据设置选择
    if (settings.readerWidth === 'centered') {
      return {
        width: '980px',
        maxWidth: '980px',
        margin: '0 auto', // 居中显示
      };
    } else {
      return {
        width: '100%',
        maxWidth: '100%',
        margin: '0',
      };
    }
  };

  // 获取背景样式（美观的渐变效果）
  const getBackgroundStyle = () => {
    const isCentered = isDesktop && settings.readerWidth === 'centered';
    
    // 根据主题返回不同的背景色和视觉效果
    const themeConfig = {
      light: {
        // 浅色主题：纯净、清爽
        gradient: 'linear-gradient(145deg, rgba(255, 255, 255, 0.938) 0%, rgba(248, 250, 252, 0.5) 50%, rgba(241, 245, 249, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.02)'
          : 'inset 0 0 40px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        border: isCentered ? '1px solid rgba(226, 232, 240, 0.8)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
      dark: {
        // 深色主题：沉稳、优雅
        gradient: 'linear-gradient(145deg, rgba(28, 30, 34, 0.3) 0%, rgba(23, 25, 28, 0.5) 50%, rgba(18, 20, 23, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.4)'
          : 'inset 0 0 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        border: isCentered ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
      sepia: {
        // 护眼主题：温暖、柔和
        gradient: 'linear-gradient(145deg, rgba(250, 247, 240, 0.3) 0%, rgba(245, 238, 225, 0.5) 50%, rgba(240, 232, 215, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(92, 75, 55, 0.12), 0 8px 24px rgba(92, 75, 55, 0.08), 0 2px 8px rgba(92, 75, 55, 0.05), inset 0 1px 0 rgba(255, 248, 230, 0.9), inset 0 -1px 0 rgba(92, 75, 55, 0.05)'
          : 'inset 0 0 40px rgba(92, 75, 55, 0.03), inset 0 1px 0 rgba(255, 248, 230, 0.5)',
        border: isCentered ? '1px solid rgba(212, 196, 156, 0.4)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
      green: {
        // 绿色主题：清新、自然
        gradient: 'linear-gradient(145deg, rgba(245, 252, 245, 0.3) 0%, rgba(237, 247, 237, 0.5) 50%, rgba(232, 245, 233, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(46, 125, 50, 0.08), 0 8px 24px rgba(46, 125, 50, 0.05), 0 2px 8px rgba(46, 125, 50, 0.03), inset 0 1px 0 rgba(240, 255, 240, 0.9), inset 0 -1px 0 rgba(46, 125, 50, 0.03)'
          : 'inset 0 0 40px rgba(46, 125, 50, 0.02), inset 0 1px 0 rgba(240, 255, 240, 0.4)',
        border: isCentered ? '1px solid rgba(165, 214, 167, 0.4)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
    }[settings.theme];

    return {
      background: themeConfig.gradient,
      boxShadow: themeConfig.shadow,
      borderRadius: isCentered ? '16px' : '0',
      border: themeConfig.border,
      padding: themeConfig.innerPadding,
    };
  };

  // 主题样式（必须在所有 hooks 之后，但在 return 之前定义）
  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  }[settings.theme];

  // 错误处理（在 themeStyles 定义之后）
  if (error) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: themeStyles.bg }}>
        <div className="text-center">
          <p style={{ color: themeStyles.text }} className="mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg"
            style={{ backgroundColor: themeStyles.border, color: themeStyles.text }}
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const readerWidthStyle = getReaderWidthStyle();
  const backgroundStyle = getBackgroundStyle();

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ 
        backgroundColor: themeStyles.bg,
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        // 确保内容区域不会被安全区域遮挡（左右边距）
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      } as React.CSSProperties}
    >
      {/* 阅读内容背景容器 */}
      <div
        className="reader-background-texture relative h-full overflow-hidden"
        data-theme={settings.theme}
        style={{
          ...readerWidthStyle,
          ...backgroundStyle,
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          backdropFilter: 'blur(12px) saturate(1.08)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.08)', // Safari 兼容
          boxSizing: 'border-box',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* 内部容器：epubjs 渲染区域 */}
        <div
          ref={containerRef}
          className="reader-content-wrapper relative h-full w-full overflow-hidden"
          style={{
            borderRadius: isDesktop && settings.readerWidth === 'centered' ? '12px' : '0',
          }}
          suppressHydrationWarning
        >
        {/* 加载提示 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-50" style={{ backgroundColor: themeStyles.bg }}>
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: themeStyles.text }} />
              <p style={{ color: themeStyles.text }}>加载中...</p>
            </div>
          </div>
        )}
        
        {/* 触摸事件捕获层（支持点击和滑动翻页、长按显示导航栏） */}
        {!loading && (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleTouchClick}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
              pointerEvents: 'auto',
              touchAction: 'pan-y', // 允许垂直滚动，但可以在代码中阻止横向滚动
              cursor: 'pointer',
              // 完全透明，不影响显示
              backgroundColor: 'transparent',
            }}
            aria-label="点击或滑动翻页"
          />
        )}
        
        {/* epubjs 会直接渲染到 containerRef 中 */}
        </div>
      </div>
    </div>
  );
}

