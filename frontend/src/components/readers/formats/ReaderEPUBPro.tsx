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
  
  // 使用 ref 存储最新的 settings，确保在闭包中能访问到最新值
  const settingsRef = useRef<ReadingSettings>(settings);
  
  // 更新 settings ref
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // EPUB locations（用于全书“页码/总页数/进度”的稳定计算，避免字体/横竖屏变化导致跳页）
  const locationsReadyRef = useRef(false);
  const totalLocationsRef = useRef<number>(0);
  const lastCfiRef = useRef<string | null>(null);
  const isRestoringLayoutRef = useRef(false);
  // 兜底：保存最近一次计算出来的进度/位置，用于 visibilitychange/pagehide flush
  const lastProgressRef = useRef<number>(0);
  const lastPositionRef = useRef<ReadingPosition | null>(null);
  // 兼容：某些 epubjs 内置 hooks 期望拿到 Document，但实际会收到 Contents（导致 getElementsByTagName/createElement 报错）。
  // 我们不改 trigger（否则会破坏 contents.on/addStylesheetRules 等），改为“失败后重试一次”的包装。
  // 某些 EPUB 会在 epubjs.locations.generate 时触发内部 parse 异常（ownerDocument undefined）
  // 失败后不再重试，避免控制台 Uncaught (in promise) 噪音与潜在性能问题
  const locationsFailedRef = useRef(false);
  
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

      // 生成 EPUB locations（基于内容的稳定“全书页码”映射）
      // 注意：locations 生成可能较耗时，这里异步后台生成，不阻塞首屏显示
      const generateLocationsInBackground = async () => {
        try {
          if (locationsFailedRef.current) return;
          // 先重置，避免读到旧状态
          locationsReadyRef.current = false;
          totalLocationsRef.current = 0;

          // 保险：spine/items 未就绪时不生成，避免 epubjs 内部 parse 报错
          const spineItems = (bookInstance?.spine as any)?.items || [];
          if (!spineItems || spineItems.length === 0) {
            return;
          }

          // epubjs 默认按字符数切分，数值越大生成越快但精度越粗；1600 是相对平衡的取值
          if (bookInstance?.locations && typeof bookInstance.locations.generate === 'function') {
            // 额外等待 opened（如果存在），并用 catch 吞掉内部异常，避免 Uncaught (in promise)
            try {
              if (bookInstance?.opened && typeof bookInstance.opened.then === 'function') {
                await bookInstance.opened;
              }
            } catch {
              // ignore
            }

            const gen = bookInstance.locations.generate(1600);
            if (gen && typeof (gen as any).catch === 'function') {
              await (gen as any).catch(() => undefined);
            } else {
              // 非 promise（极少见），直接 await
              await gen;
            }
            const total = typeof bookInstance.locations.length === 'function'
              ? bookInstance.locations.length()
              : (bookInstance.locations?.locations?.length || 0);
            totalLocationsRef.current = total;
            locationsReadyRef.current = total > 0;
          }
        } catch (e) {
          // locations 生成失败不影响阅读，回退到旧算法
          locationsReadyRef.current = false;
          totalLocationsRef.current = 0;
          locationsFailedRef.current = true;
        }
      };

      // 清空容器（注意：不要直接操作，让 epubjs 自己管理）
      // container.innerHTML = '';

      // 创建 rendition 配置
      const renditionConfig: any = {
        width: containerWidth,
        height: containerHeight,
        flow: epubjsFlow,
        spread: 'none', // 单页显示
        // 允许脚本：否则 iframe 会被 sandbox 严格限制，控制台会出现 about:srcdoc 的脚本阻止提示，
        // 且某些 EPUB（或 epubjs 内部）功能会受影响。风险：EPUB 内脚本可能执行。
        // 如果你后续希望更安全，可以再做“白名单/按书籍开关”的策略。
        allowScriptedContent: true,
      };

      // 根据管理器类型设置 method
      if (epubjsManager === 'continuous') {
        renditionConfig.method = 'continuous';
      }

      // 创建 rendition
      const rendition = bookInstance.renderTo(container, renditionConfig);
      epubjsRenditionRef.current = rendition;

      // ---- epubjs Hook 参数兼容补丁（仅修复内置 replaceBase/Meta/Canonical/Identifier） ----
      // 某些版本/构建下，epubjs 的内置 hooks 会收到 Contents 对象而不是 Document，
      // 导致 replaceBase/replaceMeta/replaceCanonical/injectIdentifier 内部调用 doc.getElementsByTagName/createElement 报错。
      // 注意：绝对不要改写 trigger 去传 Document，否则会破坏 epubjs 其它依赖 Contents 的逻辑（contents.on/addStylesheetRules 等）。
      try {
        const contentHook: any = (rendition as any)?.hooks?.content;
        const hookList: any[] =
          (contentHook && Array.isArray(contentHook.hooks) && contentHook.hooks) ||
          (contentHook && Array.isArray(contentHook.list) && contentHook.list) ||
          [];

        if (hookList.length > 0) {
          const wrapped = hookList.map((fn: any) => {
            if (typeof fn !== 'function') return fn;
            if ((fn as any).__rkWrapped) return fn;
            const w = function (...args: any[]) {
              try {
                return fn.apply(this, args);
              } catch (e: any) {
                // 仅当遇到“把 Contents 当 Document 用”的错误时，才用 contents.document 重试一次
                const first = args[0];
                const msg = String(e?.message || '');
                const isDocTypeError =
                  msg.includes('getElementsByTagName is not a function') ||
                  msg.includes('createElement is not a function') ||
                  msg.includes("reading 'ownerDocument'");
                if (
                  isDocTypeError &&
                  first &&
                  first.document &&
                  typeof first.document.createElement === 'function'
                ) {
                  try {
                    return fn.apply(this, [first.document, ...args.slice(1)]);
                  } catch {
                    // fallthrough to rethrow original
                  }
                }
                throw e;
              }
            };
            (w as any).__rkWrapped = true;
            return w;
          });
          // 覆盖回 hook 列表
          if (Array.isArray((contentHook as any).hooks)) (contentHook as any).hooks = wrapped;
          else if (Array.isArray((contentHook as any).list)) (contentHook as any).list = wrapped;
        }
      } catch {
        // ignore
      }

      // ⚠️ 禁用 epubjs.locations.generate：
      // 部分书籍会在 epubjs 内部异步解析 locations 时抛出 Locations.parse(ownerDocument) 异常，
      // 该异常发生在 requestAnimationFrame 队列中，无法通过 Promise catch 完全捕获，会导致控制台持续报错。
      // 因此这里直接不生成 locations，回退使用 percentage/章节进度（阅读与进度保存不受影响）。
      locationsReadyRef.current = false;
      totalLocationsRef.current = 0;
      locationsFailedRef.current = true;
      
      // ⚠️ 不要 monkey-patch rendition.hooks.content.trigger
      // epubjs 这里的第一个参数是 Contents（带 .on/.addStylesheetRules 等），不是 Document。
      // 改写 trigger 会破坏 epubjs 内部逻辑（链接处理/主题注入等），导致阅读器初始化失败与翻页失效。

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
      // epubjs 的 content hook 传入的是 Contents（不是 View）
      // Contents: { document, window, on(), addStylesheetRules(), ... }
      rendition.hooks.content.register((a0: any, a1?: any) => {
        // 兼容：某些场景下第1参会是 Document（见下方 trigger patch），第2参才是 Contents
        const contents = a1 && a1.document ? a1 : a0;
        const doc = contents?.document || a0;
        // 确保 doc 是一个有效的 Document 对象
        if (!doc || typeof doc.createElement !== 'function') {
          console.warn('ReaderEPUBPro: contents.document 不是有效的 Document 对象', doc);
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

        // 应用主题到文档 - 使用最新的settings
        const currentSettings = settingsRef.current;
        const currentThemeStyles = {
          light: { bg: '#ffffff', text: '#000000' },
          dark: { bg: '#1a1a1a', text: '#ffffff' },
          sepia: { bg: '#f4e4bc', text: '#5c4b37' },
          green: { bg: '#c8e6c9', text: '#2e7d32' },
        }[currentSettings.theme];
        
        if (doc.body) {
          doc.body.style.setProperty('background-color', currentThemeStyles.bg, 'important');
          doc.body.style.setProperty('color', currentThemeStyles.text, 'important');
        }
        
        // 强制应用颜色到所有文本元素
        const applyThemeToElements = () => {
          try {
            // 重新获取最新的settings和themeStyles
            const latestSettings = settingsRef.current;
            const latestThemeStyles = {
              light: { bg: '#ffffff', text: '#000000' },
              dark: { bg: '#1a1a1a', text: '#ffffff' },
              sepia: { bg: '#f4e4bc', text: '#5c4b37' },
              green: { bg: '#c8e6c9', text: '#2e7d32' },
            }[latestSettings.theme];
            
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
                if (latestSettings.theme === 'light' && (
                  currentColor === 'rgb(255, 255, 255)' || 
                  currentColor === '#ffffff' || 
                  currentColor === 'white' ||
                  currentColor.includes('rgb(255, 255, 255)')
                )) {
                  el.style.setProperty('color', latestThemeStyles.text, 'important');
                }
                // 如果当前颜色是黑色 (#000000, rgb(0,0,0) 等) 且主题是深色，改为浅色
                else if (latestSettings.theme === 'dark' && (
                  currentColor === 'rgb(0, 0, 0)' || 
                  currentColor === '#000000' || 
                  currentColor === 'black' ||
                  currentColor.includes('rgb(0, 0, 0)')
                )) {
                  el.style.setProperty('color', latestThemeStyles.text, 'important');
                }
                // 如果颜色与背景色太接近，也强制应用主题色
                else if (currentColor === latestThemeStyles.bg || 
                         (latestSettings.theme === 'dark' && (currentColor === 'rgb(26, 26, 26)' || currentColor.includes('rgb(26, 26, 26)'))) ||
                         (latestSettings.theme === 'light' && (currentColor === 'rgb(255, 255, 255)' || currentColor.includes('rgb(255, 255, 255)'))) ||
                         !currentColor) {
                  el.style.setProperty('color', latestThemeStyles.text, 'important');
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

        // ==================== 文本选择 + 笔记（iframe 内） ====================
        // 允许选中文本，并把选区信息上报给外层 ReaderContainer
        try {
          const win = doc.defaultView;
          const iframeEl = (win?.frameElement as HTMLIFrameElement | null) || null;

          // 让 iframe 内允许选择
          if (doc.documentElement) {
            (doc.documentElement.style as any).userSelect = 'text';
            (doc.documentElement.style as any).webkitUserSelect = 'text';
          }
          if (doc.body) {
            doc.body.style.setProperty('user-select', 'text');
            (doc.body.style as any).webkitUserSelect = 'text';
          }

          const emitSelection = () => {
            try {
              const selection = win?.getSelection?.() || doc.getSelection?.();
              if (!selection || selection.isCollapsed) return;
              const text = selection.toString().trim();
              if (!text) return;
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();

              // 计算相对主窗口的坐标
              const iframeRect = iframeEl?.getBoundingClientRect();
              const x = (iframeRect?.left ?? 0) + rect.left + rect.width / 2;
              // 作为“锚点”：交给外层工具栏决定显示在上方还是下方（避免遮挡）
              const y = (iframeRect?.top ?? 0) + rect.top;

              // 计算 CFI range（用于高亮）
              let cfiRange: string | null = null;
              try {
                // epubjs: 不同版本 cfiFromRange 所在对象不同，做多级兜底
                const anyRendition: any = rendition as any;
                const anyContents: any = contents as any;
                const anyBook: any = bookInstance as any;

                if (typeof anyRendition?.cfiFromRange === 'function') {
                  cfiRange = anyRendition.cfiFromRange(range);
                } else if (typeof anyContents?.cfiFromRange === 'function') {
                  cfiRange = anyContents.cfiFromRange(range);
                } else if (typeof anyBook?.cfiFromRange === 'function') {
                  cfiRange = anyBook.cfiFromRange(range);
                }
              } catch (e) {
                cfiRange = null;
              }

              window.dispatchEvent(
                new CustomEvent('__reader_text_selection', {
                  detail: { text, x, y, cfiRange },
                })
              );
            } catch (e) {
              // ignore
            }
          };

          // 监听鼠标/触摸结束后上报选区
          // 说明：移动端/滚动/滑动翻页时，WebView/Chrome 可能产生“短暂选区”，会导致误弹菜单；
          // 这里加入“手势移动阈值”与“最小文本长度”来防误触。
          if (!(doc as any).__rkSelectionListener) {
            const state = {
              touchStart: null as { x: number; y: number } | null,
              touchMoved: false,
              mouseDown: false,
              mouseMoved: false,
              mouseStart: null as { x: number; y: number } | null,
            };

            const MOVE_PX = 12; // 认为是“滑动/滚动”的阈值
            const MIN_TEXT = 2; // 认为是“有效选择”的最小字符数（中文/英文都更稳）

            const safeEmitSelection = () => {
              try {
                const selection = win?.getSelection?.() || doc.getSelection?.();
                if (!selection || selection.isCollapsed) return;
                const text = selection.toString().trim();
                if (!text || text.length < MIN_TEXT) return;
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                // rect 过小也视为误触（例如 caret/极短选区）
                if (!rect || (rect.width < 2 && rect.height < 8)) return;
                emitSelection();
              } catch {
                // ignore
              }
            };

            const onMouseDown = (e: MouseEvent) => {
              state.mouseDown = true;
              state.mouseMoved = false;
              state.mouseStart = { x: e.clientX, y: e.clientY };
            };
            const onMouseMove = (e: MouseEvent) => {
              if (!state.mouseDown || !state.mouseStart) return;
              const dx = Math.abs(e.clientX - state.mouseStart.x);
              const dy = Math.abs(e.clientY - state.mouseStart.y);
              if (dx > MOVE_PX || dy > MOVE_PX) state.mouseMoved = true;
            };
            const onMouseUp = () => {
              const moved = state.mouseMoved;
              state.mouseDown = false;
              state.mouseMoved = false;
              state.mouseStart = null;
              if (moved) return;
              setTimeout(safeEmitSelection, 0);
            };

            const onTouchStart = (e: TouchEvent) => {
              const t = e.touches?.[0];
              if (!t) return;
              state.touchStart = { x: t.clientX, y: t.clientY };
              state.touchMoved = false;
            };
            const onTouchMove = (e: TouchEvent) => {
              const t = e.touches?.[0];
              if (!t || !state.touchStart) return;
              const dx = Math.abs(t.clientX - state.touchStart.x);
              const dy = Math.abs(t.clientY - state.touchStart.y);
              if (dx > MOVE_PX || dy > MOVE_PX) state.touchMoved = true;
            };
            const onTouchEnd = () => {
              const moved = state.touchMoved;
              state.touchStart = null;
              state.touchMoved = false;
              if (moved) return;
              setTimeout(safeEmitSelection, 0);
            };

            doc.addEventListener('mousedown', onMouseDown, { capture: true });
            doc.addEventListener('mousemove', onMouseMove, { capture: true });
            doc.addEventListener('mouseup', onMouseUp);
            doc.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
            doc.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
            doc.addEventListener('touchend', onTouchEnd);

            (doc as any).__rkSelectionListener = {
              onMouseDown,
              onMouseMove,
              onMouseUp,
              onTouchStart,
              onTouchMove,
              onTouchEnd,
            };
          }

          // 点击已高亮区域：自动选中该高亮的全部内容并弹出菜单
          // 实现策略：获取点击点的 caret range（collapsed），判断是否落在某个 highlightRange 内，
          // 若命中则将 selection 替换为该 highlightRange，并触发 emitSelection。
          if (!(doc as any).__rkHighlightClickSelect) {
            const onPointerDownSelectHighlight = (e: PointerEvent) => {
              try {
                // 只处理左键/触摸/笔
                if ((e as any).button !== undefined && (e as any).button !== 0) return;

                const sel = win?.getSelection?.() || doc.getSelection?.();
                // 用户正在手动选择时不干预
                if (sel && !sel.isCollapsed) return;

                // 获取点击点的 Range（collapsed）
                let clickRange: Range | null = null;
                const anyDoc = doc as any;
                if (typeof anyDoc.caretRangeFromPoint === 'function') {
                  clickRange = anyDoc.caretRangeFromPoint(e.clientX, e.clientY);
                } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
                  const pos = anyDoc.caretPositionFromPoint(e.clientX, e.clientY);
                  if (pos) {
                    clickRange = doc.createRange();
                    clickRange.setStart(pos.offsetNode, pos.offset);
                    clickRange.collapse(true);
                  }
                }
                if (!clickRange) return;

                // 读取本地高亮列表（同源 iframe 可直接访问 localStorage）
                const bookId = (book as any)?.id;
                if (!bookId) return;
                const raw = localStorage.getItem(`epub-highlights-cache-${bookId}`);
                if (!raw) return;
                let list: any[] = [];
                try {
                  list = JSON.parse(raw) || [];
                } catch (e) {
                  list = [];
                }
                // 仅考虑未删除的
                const highlights = list.filter((h) => h && !h.deleted && typeof h.cfiRange === 'string');
                if (!highlights.length) return;

                // 命中检测：点击点是否在某个 highlightRange 内
                for (const h of highlights) {
                  const cfi = h.cfiRange as string;
                  let hr: Range | null = null;
                  try {
                    // Rendition.getRange 是同步方法
                    hr = (rendition as any).getRange?.(cfi) || null;
                  } catch (e) {
                    hr = null;
                  }
                  if (!hr) continue;

                  try {
                    const node = clickRange.startContainer;
                    const offset = clickRange.startOffset;
                    // comparePoint 返回 0 表示在 range 内
                    const inside = typeof (hr as any).comparePoint === 'function'
                      ? (hr as any).comparePoint(node, offset) === 0
                      : false;
                    if (!inside) continue;

                    // 命中：阻止本次事件继续触发翻页点击
                    e.preventDefault();
                    e.stopPropagation();

                    const s = win?.getSelection?.() || doc.getSelection?.();
                    if (!s) return;
                    s.removeAllRanges();
                    s.addRange(hr);
                    // 选中后弹出菜单
                    setTimeout(emitSelection, 0);
                    return;
                  } catch (e) {
                    // ignore compare failures
                  }
                }
              } catch (e) {
                // ignore
              }
            };

            // capture: true，确保在翻页点击逻辑前执行
            doc.addEventListener('pointerdown', onPointerDownSelectHighlight as any, true);
            (doc as any).__rkHighlightClickSelect = { onPointerDownSelectHighlight };
          }
        } catch (e) {
          // ignore
        }

        // ==================== iframe 内翻页手势（不使用遮罩层，避免挡住选中文本） ====================
        try {
          if (!(doc as any).__rkPageTurnListeners) {
            const win = doc.defaultView;
            // 屏蔽 iframe 内默认右键菜单/长按菜单
            const onContextMenu = (e: Event) => {
              try {
                e.preventDefault();
              } catch (e) {}
            };
            doc.addEventListener('contextmenu', onContextMenu);

            const getRect = () => {
              const iframeEl = (win?.frameElement as HTMLIFrameElement | null) || null;
              const r = iframeEl?.getBoundingClientRect();
              return r || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            };

            // 长按自动选择“一句话”
            const SENTENCE_BREAK = /[。！？；;.!?\n\r]/;
            const selectSentenceAtPoint = (clientX: number, clientY: number) => {
              try {
                const anyDoc = doc as any;
                let range: Range | null = null;
                if (typeof anyDoc.caretRangeFromPoint === 'function') {
                  range = anyDoc.caretRangeFromPoint(clientX, clientY);
                } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
                  const pos = anyDoc.caretPositionFromPoint(clientX, clientY);
                  if (pos) {
                    range = doc.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.collapse(true);
                  }
                }
                if (!range) return false;

                let node = range.startContainer as any;
                let offset = range.startOffset;
                if (node && node.nodeType !== Node.TEXT_NODE) {
                  const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
                  const textNode = walker.nextNode();
                  if (!textNode) return false;
                  node = textNode;
                  offset = 0;
                }
                const text = (node?.textContent || '') as string;
                if (!text) return false;

                let start = Math.min(offset, text.length);
                let end = Math.min(offset, text.length);
                while (start > 0 && !SENTENCE_BREAK.test(text[start - 1])) start--;
                while (end < text.length && !SENTENCE_BREAK.test(text[end])) end++;
                if (end < text.length) end++;
                if (end - start < 2) return false;

                const sel = win?.getSelection?.() || doc.getSelection?.();
                if (!sel) return false;
                const sentenceRange = doc.createRange();
                sentenceRange.setStart(node, start);
                sentenceRange.setEnd(node, end);
                sel.removeAllRanges();
                sel.addRange(sentenceRange);
                return true;
              } catch (e) {
                return false;
              }
            };

            let longPressTimer: any = null;
            // 增加长按阈值，降低误触（用户反馈：容易误触）
            const LONG_PRESS_MS = 700;
            let longPressSelected = false;

            // Pointer Events（iOS PWA/部分浏览器对 iframe 的 touch 事件支持不稳定）
            // 统一使用 pointer 处理 swipe，再保留 touch 作为兜底
            let pointerDown: { x: number; y: number; time: number } | null = null;
            let pointerMove: { maxX: number; maxY: number; lastX: number; lastY: number } = { maxX: 0, maxY: 0, lastX: 0, lastY: 0 };

            const onPointerDown = (e: PointerEvent) => {
              if (settingsRef.current.pageTurnMethod !== 'swipe') return;
              if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
              pointerDown = { x: e.clientX, y: e.clientY, time: Date.now() };
              pointerMove = { maxX: 0, maxY: 0, lastX: e.clientX, lastY: e.clientY };
            };

            const onPointerMove = (e: PointerEvent) => {
              if (settingsRef.current.pageTurnMethod !== 'swipe') return;
              if (!pointerDown) return;
              const moveX = Math.abs(e.clientX - pointerDown.x);
              const moveY = Math.abs(e.clientY - pointerDown.y);
              pointerMove.maxX = Math.max(pointerMove.maxX, moveX);
              pointerMove.maxY = Math.max(pointerMove.maxY, moveY);
              pointerMove.lastX = e.clientX;
              pointerMove.lastY = e.clientY;
              // 尽量避免浏览器默认手势干扰
              if (settingsRef.current.pageTurnMode === 'horizontal') {
                if (moveX > 10 && moveX > moveY * 1.2) e.preventDefault();
              } else {
                if (moveY > 10 && moveY > moveX * 1.2) e.preventDefault();
              }
            };

            const onPointerUp = () => {
              if (!pointerDown) return;
              if (settingsRef.current.pageTurnMethod !== 'swipe') {
                pointerDown = null;
                return;
              }
              const dir = (() => {
                const moveX = pointerMove.maxX;
                const moveY = pointerMove.maxY;
                const deltaX = pointerMove.lastX - pointerDown!.x;
                const deltaY = pointerMove.lastY - pointerDown!.y;
                const PRIMARY_THRESHOLD = 70;
                const DIRECTION_RATIO = 1.3;
                const DIRECTION_MIN = 40;
                if (settingsRef.current.pageTurnMode === 'horizontal') {
                  if (moveX > PRIMARY_THRESHOLD && moveX > moveY * DIRECTION_RATIO) {
                    // 修正方向：右→左 下一页；左→右 上一页
                    if (deltaX > DIRECTION_MIN) return 'prev';
                    if (deltaX < -DIRECTION_MIN) return 'next';
                  }
                } else {
                  if (moveY > PRIMARY_THRESHOLD && moveY > moveX * DIRECTION_RATIO) {
                    if (deltaY < -DIRECTION_MIN) return 'next';
                    if (deltaY > DIRECTION_MIN) return 'prev';
                  }
                }
                return null;
              })();
              pointerDown = null;
              if (!dir || !epubjsRenditionRef.current) return;
              const now = Date.now();
              const debounceTime = 300;
              if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
              if (pageTurnStateRef.current.isTurningPage) return;
              pageTurnStateRef.current.isTurningPage = true;
              pageTurnStateRef.current.lastPageTurnTime = now;
              try {
                if (dir === 'prev') epubjsRenditionRef.current.prev();
                else epubjsRenditionRef.current.next();
              } finally {
                setTimeout(() => (pageTurnStateRef.current.isTurningPage = false), debounceTime);
              }
            };

            const onTouchStart = (e: TouchEvent) => {
              if (settingsRef.current.pageTurnMethod !== 'swipe') return;
              if (!e.touches || e.touches.length === 0) return;
              const t = e.touches[0];
              // 复用现有记录结构
              touchStartRef.current = {
                x: t.clientX,
                y: t.clientY,
                clientX: t.clientX,
                clientY: t.clientY,
                time: Date.now(),
              };
              touchMoveRef.current = { maxMoveX: 0, maxMoveY: 0, lastX: t.clientX, lastY: t.clientY };

              // 长按：自动选择触点所在一句话（不依赖系统菜单）
              if (longPressTimer) clearTimeout(longPressTimer);
              longPressSelected = false;
              longPressTimer = setTimeout(() => {
                try {
                  const sel = win?.getSelection?.() || doc.getSelection?.();
                  if (!sel || sel.isCollapsed) {
                    const ok = selectSentenceAtPoint(t.clientX, t.clientY);
                    if (ok) {
                      longPressSelected = true;
                      // 长按成功后立即上报选区并弹出菜单（不必等抬手）
                      setTimeout(emitSelection, 0);
                    }
                  }
                } catch (e) {}
              }, LONG_PRESS_MS);
            };

            const onTouchMove = (e: TouchEvent) => {
              if (settingsRef.current.pageTurnMethod !== 'swipe') return;
              if (!touchStartRef.current || !e.touches || e.touches.length === 0) return;
              const t = e.touches[0];
              const moveX = Math.abs(t.clientX - touchStartRef.current.clientX);
              const moveY = Math.abs(t.clientY - touchStartRef.current.clientY);
              touchMoveRef.current.maxMoveX = Math.max(touchMoveRef.current.maxMoveX, moveX);
              touchMoveRef.current.maxMoveY = Math.max(touchMoveRef.current.maxMoveY, moveY);
              touchMoveRef.current.lastX = t.clientX;
              touchMoveRef.current.lastY = t.clientY;
              // 阻止滚动干扰（按模式）
              if (settingsRef.current.pageTurnMode === 'horizontal') {
                if (moveX > 10 && moveX > moveY * 1.2) e.preventDefault();
              } else {
                if (moveY > 10 && moveY > moveX * 1.2) e.preventDefault();
              }

              // 有明显移动就取消长按
              if (longPressTimer && (moveX > 12 || moveY > 12)) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
              }
            };

            const onTouchEnd = () => {
              if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
              }
              // 长按已触发“整句选择”时，不要让 touchend 的 swipe 判定覆盖掉选区
              if (longPressSelected) {
                longPressSelected = false;
                touchStartRef.current = null;
                return;
              }
              if (settingsRef.current.pageTurnMethod !== 'swipe') {
                touchStartRef.current = null;
                return;
              }
              const dir = (() => {
                if (!touchStartRef.current) return null;
                const moveX = touchMoveRef.current.maxMoveX;
                const moveY = touchMoveRef.current.maxMoveY;
                const deltaX = touchMoveRef.current.lastX - touchStartRef.current.clientX;
                const deltaY = touchMoveRef.current.lastY - touchStartRef.current.clientY;
                const PRIMARY_THRESHOLD = 70;
                const DIRECTION_RATIO = 1.3;
                const DIRECTION_MIN = 40;
                if (settingsRef.current.pageTurnMode === 'horizontal') {
                  if (moveX > PRIMARY_THRESHOLD && moveX > moveY * DIRECTION_RATIO) {
                    // 修正方向：右→左 下一页；左→右 上一页
                    if (deltaX > DIRECTION_MIN) return 'prev';
                    if (deltaX < -DIRECTION_MIN) return 'next';
                  }
                } else {
                  if (moveY > PRIMARY_THRESHOLD && moveY > moveX * DIRECTION_RATIO) {
                    if (deltaY < -DIRECTION_MIN) return 'next';
                    if (deltaY > DIRECTION_MIN) return 'prev';
                  }
                }
                return null;
              })();

              touchStartRef.current = null;
              if (!dir || !epubjsRenditionRef.current) return;
              const now = Date.now();
              const debounceTime = 300;
              if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
              if (pageTurnStateRef.current.isTurningPage) return;
              pageTurnStateRef.current.isTurningPage = true;
              pageTurnStateRef.current.lastPageTurnTime = now;
              try {
                if (dir === 'prev') epubjsRenditionRef.current.prev();
                else epubjsRenditionRef.current.next();
              } finally {
                setTimeout(() => (pageTurnStateRef.current.isTurningPage = false), debounceTime);
              }
            };

            const onClick = (e: MouseEvent) => {
              const s = settingsRef.current;
              if (s.pageTurnMethod !== 'click' || !s.clickToTurn) return;
              if (!epubjsRenditionRef.current) return;
              const rect = getRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;

              // 若有选区，不触发点击翻页
              try {
                const sel = doc.getSelection?.();
                if (sel && !sel.isCollapsed) return;
              } catch (e) {}

              const now = Date.now();
              const debounceTime = 300;
              if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
              if (pageTurnStateRef.current.isTurningPage) return;
              pageTurnStateRef.current.isTurningPage = true;
              pageTurnStateRef.current.lastPageTurnTime = now;

              if (s.pageTurnMode === 'horizontal') {
                if (x < rect.width / 2) epubjsRenditionRef.current.prev();
                else epubjsRenditionRef.current.next();
              } else {
                if (y < rect.height / 2) epubjsRenditionRef.current.prev();
                else epubjsRenditionRef.current.next();
              }

              setTimeout(() => (pageTurnStateRef.current.isTurningPage = false), debounceTime);
            };

            doc.addEventListener('touchstart', onTouchStart, { passive: true });
            doc.addEventListener('touchmove', onTouchMove, { passive: false });
            doc.addEventListener('touchend', onTouchEnd, { passive: true });
            doc.addEventListener('click', onClick, true);
            // Pointer Events：更适配 PWA / iOS
            doc.addEventListener('pointerdown', onPointerDown as any, { passive: true });
            doc.addEventListener('pointermove', onPointerMove as any, { passive: false });
            doc.addEventListener('pointerup', onPointerUp as any, { passive: true });

            (doc as any).__rkPageTurnListeners = { onTouchStart, onTouchMove, onTouchEnd, onPointerDown, onPointerMove, onPointerUp, onClick, onContextMenu };
          }
        } catch (e) {
          // ignore
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
        // 注意：displayed.page/total 仅对“当前章节/当前视图”有效，字体/尺寸变化会漂移
        // 全书页码将优先使用 book.locations + CFI 计算（更稳定）
        const chapterCurrentPage = location.start?.displayed?.page || 1;
        const chapterTotalPages = location.start?.displayed?.total || 1;

        if (typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
          lastCfiRef.current = cfi;
        }

        // 若正在执行“重排后定位”的恢复流程，避免把中间态写回进度（会造成进度跳动）
        if (isRestoringLayoutRef.current) {
          return;
        }
        
        // 进度策略（locations 被禁用时也要“随翻页变化”）：
        // - 优先使用 epubjs 提供的全书 percentage（若可用）
        // - 否则使用 “spineIndex/spineLength + 当前章节内页码比例” 的组合近似全书进度
        const totalChapters = getTotalChapters();
        let progress = 0;

        // 章节内进度（0~1）
        const withinChapter =
          typeof chapterTotalPages === 'number' &&
          chapterTotalPages > 1 &&
          typeof chapterCurrentPage === 'number' &&
          chapterCurrentPage >= 1
            ? Math.min(1, Math.max(0, (chapterCurrentPage - 1) / chapterTotalPages))
            : 0;

        // 先尝试使用 epubjs 的 percentage（如果存在且有效）
        const percentage = location.start?.percentage;
        if (percentage !== undefined && percentage !== null && !isNaN(percentage) && percentage > 0) {
          progress = Math.min(1, Math.max(0, percentage));
        } else if (totalChapters > 0 && spineIndex >= 0) {
          // 章节总数异常时尝试重算一次
          if (totalChapters === 1 && spineIndex > 0) {
            try {
              const book = epubjsBookRef.current;
              if (book && book.spine) {
                const spine = book.spine;
                let recalculatedTotal = 0;

                if (typeof spine.length === 'number') {
                  recalculatedTotal = spine.length;
                } else {
                  const spineItems = (spine as any).items || [];
                  if (spineItems.length > 0) {
                    recalculatedTotal = spineItems.length;
                  } else {
                    let maxIndex = -1;
                    try {
                      spine.each((item: any) => {
                        if (item.index !== undefined && item.index > maxIndex) {
                          maxIndex = item.index;
                        }
                      });
                      if (maxIndex >= 0) recalculatedTotal = maxIndex + 1;
                    } catch {
                      // ignore
                    }
                  }
                }

                if (recalculatedTotal > 0 && recalculatedTotal > spineIndex) {
                  totalChaptersRef.current = recalculatedTotal;
                  progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / recalculatedTotal));
                } else {
                  // 兜底：至少让进度随章节内翻页变化
                  progress = Math.min(1, Math.max(0, withinChapter));
                }
              } else {
                progress = Math.min(1, Math.max(0, withinChapter));
              }
            } catch {
              progress = Math.min(1, Math.max(0, withinChapter));
            }
          } else {
            // 正常：组合进度（确保同章节内翻页也会变化）
            const denom = totalChapters > 0 ? totalChapters : Math.max(1, spineIndex + 1);
            progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / denom));
          }
        } else {
          // 完全拿不到章节信息时：至少使用章节内页码比例
          progress = Math.min(1, Math.max(0, withinChapter));
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
        
        // 使用 locations 计算稳定的“全书页码/总页数/进度”
        let finalCurrentPage = chapterCurrentPage;
        let finalTotalPages = chapterTotalPages;
        let finalProgress = progress;

        try {
          const bookInstance = epubjsBookRef.current;
          if (
            locationsReadyRef.current &&
            bookInstance?.locations &&
            typeof bookInstance.locations.locationFromCfi === 'function' &&
            typeof bookInstance.locations.length === 'function' &&
            typeof cfi === 'string' &&
            cfi.startsWith('epubcfi(')
          ) {
            const loc = bookInstance.locations.locationFromCfi(cfi);
            const total = bookInstance.locations.length();
            if (typeof loc === 'number' && loc >= 0 && typeof total === 'number' && total > 0) {
              finalCurrentPage = loc + 1;
              finalTotalPages = total;
              finalProgress = Math.min(1, Math.max(0, (loc + 1) / total));
            }
          }
        } catch (e) {
          // 忽略，回退到章节内页码
        }

        const position: ReadingPosition = {
          chapterIndex: spineIndex,
          currentPage: finalCurrentPage,
          totalPages: finalTotalPages,
          progress: finalProgress,
          currentLocation: cfi, // 保存 CFI（最精确的位置）
          chapterTitle: chapterTitle,
        };
        
        // 标记首次事件
        if (isFirstRelocated) {
          isFirstRelocated = false;
        }
        
        // 触发进度保存（使用最终进度）
        lastProgressRef.current = finalProgress;
        lastPositionRef.current = position;
        onProgressChange(finalProgress, position);
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

      // 暴露“跳转到指定进度/位置”给外部（供跨设备进度跳转）
      (window as any).__readerGoToPosition = async (pos: any) => {
        try {
          const cfi = pos?.currentLocation || pos?.currentPosition;
          if (typeof cfi === 'string' && cfi.startsWith('epubcfi(') && typeof rendition.display === 'function') {
            await rendition.display(cfi);
            return true;
          }
          const chapterIndex = pos?.chapterIndex;
          if (typeof chapterIndex === 'number' && !isNaN(chapterIndex)) {
            const item = bookInstance?.spine?.get?.(chapterIndex);
            if (item?.href) {
              await rendition.display(item.href);
              return true;
            }
          }
        } catch {
          // ignore
        }
        return false;
      };

      // 窗口大小变化时调整
      const handleResize = () => {
        if (rendition && container) {
          const width = container.offsetWidth || window.innerWidth;
          const height = container.offsetHeight || window.innerHeight;

          const anchorCfi =
            lastCfiRef.current ||
            rendition.currentLocation?.()?.start?.cfi ||
            null;

          // 避免 resize 过程中 relocated 触发保存，导致进度/页码跳动
          isRestoringLayoutRef.current = true;

          try {
            rendition.resize(width, height);
          } catch (e) {
            // 忽略 resize 错误
          }

          // resize 后重新定位回锚点 CFI（保证“正在读的内容”不变）
          if (anchorCfi && typeof rendition.display === 'function') {
            setTimeout(async () => {
              try {
                await rendition.display(anchorCfi);
              } catch (e) {
                // 忽略定位失败
              } finally {
                // 短延迟后恢复保存
                setTimeout(() => {
                  isRestoringLayoutRef.current = false;
                }, 150);
              }
            }, 50);
          } else {
            setTimeout(() => {
              isRestoringLayoutRef.current = false;
            }, 150);
          }
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

      // 暴露高亮函数（用于笔记高亮）
      (window as any).__epubHighlight = (cfiRange: string) => {
        try {
          if (!cfiRange || typeof cfiRange !== 'string') return;
          if (!epubjsRenditionRef.current?.annotations?.highlight) return;
          epubjsRenditionRef.current.annotations.highlight(
            cfiRange,
            {},
            () => {},
            'rk-note-highlight',
            {
              // 更明显的“背景高亮”效果（epubjs 通过 SVG overlay 实现）
              fill: 'rgba(255, 235, 59, 0.55)',
              'mix-blend-mode': 'multiply',
            }
          );
        } catch (e) {
          // ignore
        }
      };

      // 暴露取消高亮函数
      (window as any).__epubUnhighlight = (cfiRange: string) => {
        try {
          if (!cfiRange || typeof cfiRange !== 'string') return;
          const anyR: any = epubjsRenditionRef.current;
          if (!anyR?.annotations) return;
          if (typeof anyR.annotations.remove === 'function') {
            // epubjs 常见 API：remove(cfiRange, type)
            try {
              anyR.annotations.remove(cfiRange, 'highlight');
              return;
            } catch (e) {
              // ignore
            }
            // 兜底：remove(cfiRange)
            try {
              anyR.annotations.remove(cfiRange);
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          // ignore
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
          // 记录重排前的锚点 CFI，避免字体/尺寸变化导致跳页
          const anchorCfi =
            lastCfiRef.current ||
            rendition.currentLocation?.()?.start?.cfi ||
            null;

          // 标记进入恢复流程，避免 relocated 中间态写回进度
          isRestoringLayoutRef.current = true;

          // 调用 resize 方法重新计算布局
          if (typeof rendition.resize === 'function') {
            await rendition.resize();
          }
          
          // 或者使用 clear 和 render 强制重新渲染当前页
          // 这样可以确保分页正确
          if (anchorCfi && typeof rendition.display === 'function') {
            await rendition.display(anchorCfi);
          }

          // 重排/定位完成后，再允许进度保存，并主动触发一次“稳定页码”保存
          setTimeout(() => {
            try {
              isRestoringLayoutRef.current = false;
              const latestLocation = rendition.currentLocation?.();
              const latestCfi = latestLocation?.start?.cfi;
              if (typeof latestCfi === 'string' && latestCfi.startsWith('epubcfi(')) {
                lastCfiRef.current = latestCfi;
              }

              // 如果 locations 可用，用它更新全书页码/进度
              const bookInstance = epubjsBookRef.current;
              if (
                locationsReadyRef.current &&
                bookInstance?.locations &&
                typeof bookInstance.locations.locationFromCfi === 'function' &&
                typeof bookInstance.locations.length === 'function' &&
                typeof latestCfi === 'string' &&
                latestCfi.startsWith('epubcfi(')
              ) {
                const loc = bookInstance.locations.locationFromCfi(latestCfi);
                const total = bookInstance.locations.length();
                if (typeof loc === 'number' && loc >= 0 && typeof total === 'number' && total > 0) {
                  const progress = Math.min(1, Math.max(0, (loc + 1) / total));
                  lastProgressRef.current = progress;
                  lastPositionRef.current = {
                    chapterIndex: latestLocation?.start?.index ?? 0,
                    currentPage: loc + 1,
                    totalPages: total,
                    progress,
                    currentLocation: latestCfi,
                  };
                  onProgressChange(progress, {
                    chapterIndex: latestLocation?.start?.index ?? 0,
                    currentPage: loc + 1,
                    totalPages: total,
                    progress,
                    currentLocation: latestCfi,
                  });
                }
              }
            } catch (e) {
              isRestoringLayoutRef.current = false;
            }
          }, 150);
        } catch (e) {
          console.error('ReaderEPUBPro: 重新布局失败', e);
          isRestoringLayoutRef.current = false;
        }
      }, 100); // 延迟100ms确保样式已应用
      
    } catch (error) {
      console.error('ReaderEPUBPro: 更新主题失败', error);
    }
  }, [settings.theme, settings.fontSize, settings.fontFamily, settings.lineHeight, settings.margin, settings.textIndent]);

  // 在切后台/关闭页面时，强制 flush 一次最新位置，避免“最后一次 relocated 未落库”导致回退到上一页
  useEffect(() => {
    const flushNow = () => {
      try {
        if (isRestoringLayoutRef.current) return;
        const rendition = epubjsRenditionRef.current;
        const bookInstance = epubjsBookRef.current;
        const cfi =
          lastCfiRef.current ||
          rendition?.currentLocation?.()?.start?.cfi ||
          null;

        // 优先使用我们已经算好的 lastPositionRef
        if (lastPositionRef.current && lastPositionRef.current.currentLocation) {
          onProgressChange(lastProgressRef.current || lastPositionRef.current.progress || 0, lastPositionRef.current);
          return;
        }

        if (typeof cfi !== 'string' || !cfi.startsWith('epubcfi(')) return;

        // 重新计算一次稳定页码（如果 locations 已就绪）
        let currentPage = 1;
        let totalPages = 1;
        let progress = 0;
        try {
          if (
            locationsReadyRef.current &&
            bookInstance?.locations &&
            typeof bookInstance.locations.locationFromCfi === 'function' &&
            typeof bookInstance.locations.length === 'function'
          ) {
            const loc = bookInstance.locations.locationFromCfi(cfi);
            const total = bookInstance.locations.length();
            if (typeof loc === 'number' && loc >= 0 && typeof total === 'number' && total > 0) {
              currentPage = loc + 1;
              totalPages = total;
              progress = Math.min(1, Math.max(0, (loc + 1) / total));
            }
          }
        } catch {
          // ignore
        }

        const spineIndex = rendition?.currentLocation?.()?.start?.index ?? 0;
        const pos: ReadingPosition = {
          chapterIndex: spineIndex,
          currentPage,
          totalPages,
          progress,
          currentLocation: cfi,
        };
        lastProgressRef.current = progress;
        lastPositionRef.current = pos;
        onProgressChange(progress, pos);
      } catch {
        // ignore
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    const onPageHide = () => flushNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      flushNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, onProgressChange]);

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
    
    // 移动端：在中心区域长按显示导航栏（PWA/浏览器保持一致）
    if (isMobile && isInCenterArea) {
      longPressTimerRef.current = setTimeout(() => {
        showBars();
        // 触觉反馈（如果支持）
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, longPressThreshold);
    }
  }, [loading, isMobile, showBars]);

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
    
    // 滑动翻页：只有在用户选择滑动翻页模式时才阻止默认行为（避免页面滚动/选中干扰）
    if (settings.pageTurnMethod === 'swipe') {
      // 根据翻页模式阻止对应方向的默认滚动
      if (settings.pageTurnMode === 'horizontal') {
        if (moveX > 10 && moveX > moveY * 1.2) e.preventDefault();
      } else {
        if (moveY > 10 && moveY > moveX * 1.2) e.preventDefault();
      }
    }
  }, [settings.pageTurnMethod]);

  // 判断是否为有效的滑动翻页
  const checkSwipeGesture = useCallback((): 'prev' | 'next' | null => {
    if (!touchStartRef.current) return null;
    
    const moveX = touchMoveRef.current.maxMoveX;
    const moveY = touchMoveRef.current.maxMoveY;
    const deltaX = touchMoveRef.current.lastX - touchStartRef.current.clientX;
    const deltaY = touchMoveRef.current.lastY - touchStartRef.current.clientY;

    // 防误触阈值
    const PRIMARY_THRESHOLD = 70; // 主方向最小滑动距离
    const DIRECTION_RATIO = 1.3;  // 主方向需要明显大于副方向
    const DIRECTION_MIN = 40;     // 方向判定最小 delta

    // 支持两种滑动方式：
    // - 横向：左→右 下一页；右→左 上一页
    // - 纵向：下→上 下一页；上→下 上一页
    if (settings.pageTurnMode === 'horizontal') {
      if (moveX > PRIMARY_THRESHOLD && moveX > moveY * DIRECTION_RATIO) {
        if (deltaX > DIRECTION_MIN) return 'next'; // 左向右：下一页
        if (deltaX < -DIRECTION_MIN) return 'prev'; // 右向左：上一页
      }
    } else {
      if (moveY > PRIMARY_THRESHOLD && moveY > moveX * DIRECTION_RATIO) {
        if (deltaY < -DIRECTION_MIN) return 'next'; // 下向上：下一页
        if (deltaY > DIRECTION_MIN) return 'prev';  // 上向下：上一页
      }
    }
    
    return null;
  }, [settings.pageTurnMode]);

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

  // 处理 swipe 翻页（touch end）
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (loading || !epubjsRenditionRef.current) return;
    if (settings.pageTurnMethod !== 'swipe') {
      // 非 swipe 模式，交给点击逻辑（兼容）
      handleTouchClick(e);
      return;
    }

    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const dir = checkSwipeGesture();
    touchStartRef.current = null;
    if (!dir) return;

    // 防抖
    const now = Date.now();
    const debounceTime = 300;
    if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
    if (pageTurnStateRef.current.isTurningPage) return;
    pageTurnStateRef.current.isTurningPage = true;
    pageTurnStateRef.current.lastPageTurnTime = now;

    try {
      if (dir === 'prev') {
        epubjsRenditionRef.current.prev();
      } else {
        epubjsRenditionRef.current.next();
      }
    } finally {
      setTimeout(() => {
        pageTurnStateRef.current.isTurningPage = false;
      }, debounceTime);
    }
  }, [loading, settings.pageTurnMethod, checkSwipeGesture, handleTouchClick]);

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
      onContextMenu={(e) => {
        // 屏蔽浏览器默认右键菜单（阅读器内交互由应用接管）
        e.preventDefault();
      }}
      style={{ 
        backgroundColor: themeStyles.bg,
        touchAction: 'manipulation',
        // 屏蔽 iOS/Safari 长按系统菜单（仍允许选中文字）
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'text',
        userSelect: 'text',
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
            onTouchEnd={handleTouchEnd}
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
              // 关键：不要挡住 EPUB iframe 的文字选择
              pointerEvents: 'none',
              touchAction: 'manipulation',
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

