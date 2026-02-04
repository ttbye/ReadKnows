/**
 * @author ttbye
 * 专业级 EPUB 电子书阅读器
 * 支持多种渲染引擎：epubjs、readium、react-epub
 * 默认使用 epubjs
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem, Highlight } from '../../../types/reader';
import toast from 'react-hot-toast';
import { GestureHandler, GestureCallbacks } from '../utils/GestureHandler';
import { useTranslation } from 'react-i18next';
import { selectSentenceAtPoint } from '../common/text-selection/textSelection';
import { getFullApiUrl, getApiKeyHeader, getFullBookUrl, getFontsBaseUrl } from '../../../utils/api';
import { getFontFamily, buildCustomFontsStyleContent } from '../common/theme/themeManager';

interface BookNote {
  id: string;
  content: string;
  position?: string;
  page_number?: number;
  chapter_index?: number;
  selected_text?: string;
  created_at: string;
  updated_at: string;
}

interface ReaderEPUBProProps {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  customFonts?: Array<{ id: string; name: string; file_name: string }>;
  fontCache?: Map<string, Blob>;
  onSettingsChange: (settings: ReadingSettings) => void;
  onProgressChange: (progress: number, position: ReadingPosition) => void;
  onTOCChange: (toc: TOCItem[]) => void;
  onClose: () => void;
  highlights?: Highlight[];
  notes?: BookNote[];
  onNoteClick?: (note: BookNote) => void;
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
  customFonts = [],
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
  highlights = [],
  notes = [],
  onNoteClick,
}: ReaderEPUBProProps) {
  const { t } = useTranslation();
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
  const customFontsRef = useRef(customFonts);
  
  // 更新 refs
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  
  useEffect(() => {
    customFontsRef.current = customFonts;
  }, [customFonts]);
  
  // 监听播放速度变化，动态调整正在播放的音频速度
  useEffect(() => {
    const settingsAny = settings as any;
    const currentSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
    
    // 如果正在播放音频，实时更新播放速度
    if (ttsAudioRef.current && !ttsAudioRef.current.paused) {
      ttsAudioRef.current.playbackRate = currentSpeed;
      console.log('[TTS] 动态调整播放速度:', currentSpeed);
    }
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

  // 手势处理器
  const gestureHandlerRef = useRef<GestureHandler | null>(null);

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
      // 离线存储不可用，使用服务器URL（需要构建完整URL以支持自定义API URL）
      return getFullBookUrl(serverUrl);
    }

    // 如果离线存储成功，返回blob URL；否则返回完整URL
    // 注意：如果离线存储失败，上面的catch已经返回了完整URL
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
      
      // 确保 book 的 package 已加载（epubjs 需要 package 信息才能启动 rendition）
      // 使用类型断言，因为 package 属性在运行时存在但类型定义中可能缺失
      if (!(bookInstance as any).package) {
        // 等待 metadata 加载完成
        await bookInstance.loaded.metadata;
        // 如果仍然没有 package，等待一小段时间让 epubjs 完成初始化
        if (!(bookInstance as any).package) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        // 再次检查，确保 package 已加载
        if (!(bookInstance as any).package) {
          // 尝试等待更长时间
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // 最终验证：确保 package 存在，否则抛出错误
      if (!(bookInstance as any).package) {
        throw new Error('EPUB 书籍 package 信息未加载，无法创建 rendition');
      }

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
            // 确保 locations 对象存在且有效
            if (!bookInstance.locations) {
              totalLocationsRef.current = 0;
              locationsReadyRef.current = false;
              return;
            }
            const total = typeof bookInstance.locations.length === 'function'
              ? bookInstance.locations.length()
              : ((bookInstance.locations as any)?.locations?.length || (bookInstance.locations as any)?.length || 0);
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

      // 创建 rendition 前，再次验证 book 实例和 package
      if (!bookInstance || !(bookInstance as any).package) {
        throw new Error('无法创建 rendition：book 实例或 package 无效');
      }
      
      // 创建 rendition
      const rendition = bookInstance.renderTo(container, renditionConfig);
      
      // 验证 rendition 创建成功
      if (!rendition) {
        throw new Error('rendition 创建失败');
      }
      
      // 确保 rendition 内部的 book 引用正确
      if ((rendition as any).book !== bookInstance) {
        // 如果 book 引用不匹配，尝试修复
        try {
          (rendition as any).book = bookInstance;
        } catch (e) {
          console.warn('[ReaderEPUBPro] 无法设置 rendition.book 引用:', e);
        }
      }
      
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

      // ⚠️ 注意：部分书籍会在 epubjs 内部异步解析 locations 时抛出异常
      // 但为了支持全书进度跳转，我们仍然尝试生成 locations
      // 如果生成失败，会在跳转时使用回退方案
      // 尝试在后台生成 locations（不阻塞初始化）
      try {
        // 延迟生成，避免阻塞初始化
        setTimeout(() => {
          if (bookInstance?.locations && typeof bookInstance.locations.generate === 'function') {
            generateLocationsInBackground().catch((e) => {
              // 生成失败不影响阅读，跳转时会使用回退方案
              console.log('[ReaderEPUBPro] locations 生成失败，跳转时将使用章节估算方案:', e);
              locationsFailedRef.current = true;
            });
          }
        }, 3000); // 延迟3秒生成，确保阅读器已完全初始化
      } catch (e) {
        // 如果触发生成也失败，标记为失败
        console.warn('[ReaderEPUBPro] 无法触发 locations 生成:', e);
        // 不直接设置 locationsFailedRef，允许后续尝试
      }
      
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

      // 应用主题（含自定义字体）
      const fontFamily = getFontFamily(settings.fontFamily);

      const theme = {
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

      // 【关键修复】统一的字体注入函数
      const injectCustomFonts = (contents: any, source: string) => {
        const doc = contents?.document;
        if (!doc || !doc.head) {
          return;
        }

        const fonts = customFontsRef.current;
        const currentSettings = settingsRef.current;
        const selectedFontId = currentSettings.fontFamily?.startsWith('custom:') 
          ? currentSettings.fontFamily.slice(7).trim() 
          : undefined;

        if (!fonts.length && !selectedFontId) {
          return;
        }


        // 1. 使用 FontFace API 加载字体（优先）
        fonts.forEach((font) => {
          const fontFamilyName = `ReadKnowsCustomFont-${font.id}`;
          const apiUrl = `${getFontsBaseUrl()}/api/fonts/file-by-id/${encodeURIComponent(font.id)}`;
          
          try {
            if (doc.fonts && typeof doc.fonts.add === 'function' && !doc.fonts.check(`12px ${fontFamilyName}`)) {
              const fontFace = new FontFace(fontFamilyName, `url("${apiUrl}")`);
              fontFace.load()
                .then(() => {
                  doc.fonts.add(fontFace);
                })
                .catch(() => {
                  // 忽略错误
                });
            }
          } catch (e) {
            // 忽略错误
          }
        });

        // 2. 直接注入 @font-face CSS（addStylesheetRules 不支持 @font-face 规则）
        const styleContent = buildCustomFontsStyleContent(fonts, getFontsBaseUrl());
        if (styleContent) {
          // 移除旧的字体样式
          const oldStyle = doc.getElementById('readknows-custom-fonts');
          if (oldStyle) oldStyle.remove();
          
          const style = doc.createElement('style');
          style.id = 'readknows-custom-fonts';
          style.textContent = styleContent;
          if (doc.head.firstChild) {
            doc.head.insertBefore(style, doc.head.firstChild);
          } else {
            doc.head.appendChild(style);
          }
        }

        // 3. 如果是自定义字体，注入强制字体样式
        if (selectedFontId) {
          const fontFamily = getFontFamily(currentSettings.fontFamily);
          const forceStyle = doc.createElement('style');
          forceStyle.id = 'readknows-custom-fonts-force';
          forceStyle.textContent = `
body, body * {
  font-family: ${fontFamily} !important;
}
*[style*="font-family"] {
  font-family: ${fontFamily} !important;
}
          `.trim();
          
          if (doc.head.firstChild) {
            doc.head.insertBefore(forceStyle, doc.head.firstChild);
          } else {
            doc.head.appendChild(forceStyle);
          }
        }
      };

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

        // 【关键修复】使用统一的字体注入函数
        injectCustomFonts(contents, 'content.register');

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
        
        // 同时设置 html 和 body 的背景色，确保翻页后背景色正确
        if (doc.documentElement) {
          doc.documentElement.style.setProperty('background-color', currentThemeStyles.bg, 'important');
          doc.documentElement.style.setProperty('color', currentThemeStyles.text, 'important');
        }
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
            
            // 确保 html 和 body 的背景色始终正确（防止翻页后背景色变白）
            if (doc.documentElement) {
              doc.documentElement.style.setProperty('background-color', latestThemeStyles.bg, 'important');
              doc.documentElement.style.setProperty('color', latestThemeStyles.text, 'important');
            }
            if (doc.body) {
              doc.body.style.setProperty('background-color', latestThemeStyles.bg, 'important');
              doc.body.style.setProperty('color', latestThemeStyles.text, 'important');
            }
            
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

          // ==================== 图片点击/长按检测 ====================
          // 为所有图片添加点击和长按事件监听
          const setupImageListeners = () => {
            const images = doc.querySelectorAll('img');
            images.forEach((img) => {
              // 跳过已处理的图片
              if ((img as any).__rkImageListener) return;
              (img as any).__rkImageListener = true;

              let longPressTimer: any = null;
              const LONG_PRESS_MS = 500;
              let hasMoved = false;
              let touchStartPos: { x: number; y: number } | null = null;

              const handleImageClick = (e: MouseEvent | TouchEvent) => {
                // 如果用户正在选择文本，不触发图片查看
                const selection = win?.getSelection?.() || doc.getSelection?.();
                if (selection && !selection.isCollapsed) {
                  const text = selection.toString().trim();
                  if (text && text.length > 0) {
                    return; // 有文本选择，不处理图片点击
                  }
                }

                const imgElement = e.target as HTMLImageElement;
                if (!imgElement || imgElement.tagName !== 'IMG') return;

                const imageUrl = imgElement.src || imgElement.getAttribute('src') || '';
                if (!imageUrl) return;

                // 双击或长按后点击：显示图片查看器
                window.dispatchEvent(
                  new CustomEvent('__reader_view_image', {
                    detail: { imageUrl },
                  })
                );
              };

              const handleImageLongPress = (e: TouchEvent) => {
                const imgElement = e.target as HTMLImageElement;
                if (!imgElement || imgElement.tagName !== 'IMG') return;

                const imageUrl = imgElement.src || imgElement.getAttribute('src') || '';
                if (!imageUrl) return;

                // 长按显示图片查看器
                window.dispatchEvent(
                  new CustomEvent('__reader_view_image', {
                    detail: { imageUrl },
                  })
                );
              };

              // 鼠标双击
              img.addEventListener('dblclick', handleImageClick);

              // 触摸长按
              img.addEventListener('touchstart', (e: TouchEvent) => {
                if (e.touches.length === 1) {
                  touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                  hasMoved = false;
                  longPressTimer = setTimeout(() => {
                    if (!hasMoved && touchStartPos) {
                      handleImageLongPress(e);
                    }
                  }, LONG_PRESS_MS);
                }
              }, { passive: true });

              img.addEventListener('touchmove', () => {
                hasMoved = true;
                if (longPressTimer) {
                  clearTimeout(longPressTimer);
                  longPressTimer = null;
                }
              }, { passive: true });

              img.addEventListener('touchend', () => {
                if (longPressTimer) {
                  clearTimeout(longPressTimer);
                  longPressTimer = null;
                }
                touchStartPos = null;
                hasMoved = false;
              }, { passive: true });

              // 移除单击事件监听，只保留双击和长按，避免与点击翻页冲突
            });
          };

          // 立即设置图片监听器
          setupImageListeners();

          // 监听DOM变化，为新加载的图片添加监听器
          const imageObserver = new MutationObserver(() => {
            setupImageListeners();
          });
          imageObserver.observe(doc.body, {
            childList: true,
            subtree: true,
          });

          // 保存observer以便清理
          (doc as any).__rkImageObserver = imageObserver;

          // 监听鼠标/触摸结束后上报选区
          // 说明：移动端/滚动/滑动翻页时，WebView/Chrome 可能产生"短暂选区"，会导致误弹菜单；
          // 这里加入"手势移动阈值"与"最小文本长度"来防误触。
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
            const iframeEl = (win?.frameElement as HTMLIFrameElement | null) || null;
            
            // 定义 emitSelection 函数（用于长按选择文本后上报）
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
                const y = (iframeRect?.top ?? 0) + rect.top;

                // 计算 CFI range（用于高亮）
                let cfiRange: string | null = null;
                try {
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
            
            // 屏蔽 iframe 内默认右键菜单/长按菜单
            const onContextMenu = (e: Event) => {
              try {
                e.preventDefault();
              } catch (e) {}
            };
            doc.addEventListener('contextmenu', onContextMenu);

            const getRect = () => {
              const r = iframeEl?.getBoundingClientRect();
              return r || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            };

            // 长按自动选择"一句话"（使用通用模块，支持跨节点选择）
            const selectSentenceAtPointLocal = (clientX: number, clientY: number) => {
              return selectSentenceAtPoint(doc, win, clientX, clientY);
            };

            let longPressTimer: any = null;
            // 增加长按阈值，降低误触（用户反馈：容易误触）
            const LONG_PRESS_MS = 700;
            let longPressSelected = false;

            // Touch 事件记录（用于 iframe 内部的翻页手势）
            let touchStartRef: { x: number; y: number; clientX: number; clientY: number; time: number } | null = null;
            let touchMoveRef: { maxMoveX: number; maxMoveY: number; lastX: number; lastY: number } = {
              maxMoveX: 0,
              maxMoveY: 0,
              lastX: 0,
              lastY: 0,
            };

            // Pointer Events（iOS PWA/部分浏览器对 iframe 的 touch 事件支持不稳定）
            // 统一使用 pointer 处理 swipe，再保留 touch 作为兜底
            let pointerDown: { x: number; y: number; time: number } | null = null;
            let pointerMove: { maxX: number; maxY: number; lastX: number; lastY: number } = { maxX: 0, maxY: 0, lastX: 0, lastY: 0 };
            
            // 记录鼠标按下和移动状态，用于区分"选择文字"和"点击翻页"
            let mouseDownForClick: { x: number; y: number; time: number } | null = null;
            let mouseMovedForClick = false;

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
              // 翻页时通知外层容器隐藏工具条
              window.dispatchEvent(
                new CustomEvent('__reader_page_turn', {
                  detail: { direction: dir },
                })
              );
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
              // 记录触摸开始
              touchStartRef = {
                x: t.clientX,
                y: t.clientY,
                clientX: t.clientX,
                clientY: t.clientY,
                time: Date.now(),
              };
              touchMoveRef = { maxMoveX: 0, maxMoveY: 0, lastX: t.clientX, lastY: t.clientY };

              // 长按：自动选择触点所在一句话（不依赖系统菜单）
              if (longPressTimer) clearTimeout(longPressTimer);
              longPressSelected = false;
              longPressTimer = setTimeout(() => {
                try {
                  const sel = win?.getSelection?.() || doc.getSelection?.();
                  if (!sel || sel.isCollapsed) {
                    const ok = selectSentenceAtPointLocal(t.clientX, t.clientY);
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
              if (!touchStartRef || !e.touches || e.touches.length === 0) return;
              const t = e.touches[0];
              const moveX = Math.abs(t.clientX - touchStartRef.clientX);
              const moveY = Math.abs(t.clientY - touchStartRef.clientY);
              touchMoveRef.maxMoveX = Math.max(touchMoveRef.maxMoveX, moveX);
              touchMoveRef.maxMoveY = Math.max(touchMoveRef.maxMoveY, moveY);
              touchMoveRef.lastX = t.clientX;
              touchMoveRef.lastY = t.clientY;
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
              // 长按已触发"整句选择"时，不要让 touchend 的 swipe 判定覆盖掉选区
              if (longPressSelected) {
                longPressSelected = false;
                touchStartRef = null;
                return;
              }
              if (settingsRef.current.pageTurnMethod !== 'swipe') {
                touchStartRef = null;
                return;
              }
              const dir = (() => {
                if (!touchStartRef) return null;
                const moveX = touchMoveRef.maxMoveX;
                const moveY = touchMoveRef.maxMoveY;
                const deltaX = touchMoveRef.lastX - touchStartRef.clientX;
                const deltaY = touchMoveRef.lastY - touchStartRef.clientY;
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

              touchStartRef = null;
              if (!dir || !epubjsRenditionRef.current) return;
              const now = Date.now();
              const debounceTime = 300;
              if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
              if (pageTurnStateRef.current.isTurningPage) return;
              pageTurnStateRef.current.isTurningPage = true;
              pageTurnStateRef.current.lastPageTurnTime = now;
              // 翻页时通知外层容器隐藏工具条
              window.dispatchEvent(
                new CustomEvent('__reader_page_turn', {
                  detail: { direction: dir },
                })
              );
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
              
              // 检查是否点击了笔记标记或脚注，如果是则不触发翻页
              const target = e.target as HTMLElement;
              if (target && (
                target.classList.contains('rk-note-mark') ||
                target.classList.contains('rk-note-footnote') ||
                target.closest('.rk-note-mark') ||
                target.closest('.rk-note-footnote')
              )) {
                return;
              }
              
              const rect = getRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;

              // 优先检查并隐藏 UI 元素（工具条、选择等）
              // 如果隐藏了 UI，则不翻页
              const checkAndHideUI = (window as any).__readerCheckAndHideUI;
              if (checkAndHideUI && typeof checkAndHideUI === 'function') {
                const hasHiddenUI = checkAndHideUI();
                if (hasHiddenUI) {
                  // 如果隐藏了 UI，不执行翻页
                  return;
                }
              }
              
              // 若有选区，不触发点击翻页（让 checkAndHideUI 处理清除选择）
              try {
                const sel = doc.getSelection?.();
                if (sel && !sel.isCollapsed) {
                  return;
                }
              } catch (e) {}

              const now = Date.now();
              const debounceTime = 300;
              if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
              if (pageTurnStateRef.current.isTurningPage) return;
              pageTurnStateRef.current.isTurningPage = true;
              pageTurnStateRef.current.lastPageTurnTime = now;
              
              // 翻页时通知外层容器隐藏工具条
              const turnDirection = s.pageTurnMode === 'horizontal' 
                ? (x < rect.width / 2 ? 'prev' : 'next')
                : (y < rect.height / 2 ? 'prev' : 'next');
              window.dispatchEvent(
                new CustomEvent('__reader_page_turn', {
                  detail: { direction: turnDirection },
                })
              );

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


      // 使用类型断言，因为 package 属性在运行时存在但类型定义中可能缺失
      if (!(bookInstance as any).package) {
        // 等待 metadata 加载完成
        try {
          await bookInstance.loaded.metadata;
        } catch (e) {
          // 忽略 metadata 加载错误
        }
        // 如果仍然没有 package，等待一小段时间让 epubjs 完成初始化
        if (!(bookInstance as any).package) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        // 再次检查，如果还是没有 package，抛出错误
        if (!(bookInstance as any).package) {
          throw new Error('EPUB 书籍 package 信息未加载，无法启动阅读器');
        }
      }

      // 确保 locations 对象存在（即使还未生成完成），避免 epubjs 内部调用 locations.length 时报错
      if (!bookInstance.locations) {
        // 初始化一个空的 locations 对象，避免 epubjs 内部访问 undefined
        // 使用类型断言，因为这是一个临时的 fallback 对象，实际 locations 会在后台生成
        try {
          bookInstance.locations = {
            length: () => 0,
            locationFromCfi: () => null,
            cfiFromLocation: () => null,
          } as any;
        } catch (e) {
          // 如果无法设置，忽略（某些版本的 epubjs 可能不允许直接设置）
        }
      }
      
      // 恢复阅读位置或显示第一页
      let displayPromise: Promise<any>;
      let restoredByCFI = false;
      
      // 优先使用 CFI（最精确的位置）
      if (initialPosition?.currentLocation && initialPosition.currentLocation.startsWith('epubcfi(')) {
        // console.log('[ReaderEPUBPro] [初始化] 尝试使用CFI恢复位置:', {
        //   cfi: initialPosition.currentLocation.substring(0, 50) + '...',
        //   cfiValid: initialPosition.currentLocation.startsWith('epubcfi('),
        //   progress: initialPosition.progress,
        //   currentPage: initialPosition.currentPage,
        //   chapterIndex: initialPosition.chapterIndex,
        // });
        try {
          displayPromise = rendition.display(initialPosition.currentLocation);
          restoredByCFI = true;
          // console.log('[ReaderEPUBPro] [初始化] ✅ CFI恢复成功');
        } catch (error) {
          // console.error('ReaderEPUBPro: ❌ CFI 恢复失败，回退到章节索引', error);
          // CFI 失败，回退到章节索引
          if (initialPosition.chapterIndex !== undefined) {
            const item = spine.get(initialPosition.chapterIndex);
            displayPromise = item ? rendition.display(item.href) : rendition.display(spine.get(0).href);
            // console.log('[ReaderEPUBPro] [初始化] 回退到章节索引:', initialPosition.chapterIndex);
          } else {
            displayPromise = rendition.display(spine.get(0).href);
            // console.log('[ReaderEPUBPro] [初始化] 回退到第一章');
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
      await new Promise(resolve => setTimeout(resolve, restoredByCFI ? 1000 : 500));
      
      // 验证恢复的位置是否正确（特别是CFI恢复）
      if (restoredByCFI && initialPosition?.currentLocation) {
        try {
          const actualLocation = rendition.currentLocation?.() as any;
          const actualCfi = actualLocation?.start?.cfi;
          const expectedCfi = initialPosition.currentLocation;
          
          // console.log('[ReaderEPUBPro] [初始化] 验证CFI恢复结果:', {
          //   expectedCfi: expectedCfi.substring(0, 50) + '...',
          //   actualCfi: actualCfi ? actualCfi.substring(0, 50) + '...' : 'null',
          //   cfiMatch: actualCfi === expectedCfi || (actualCfi && expectedCfi.startsWith(actualCfi.substring(0, Math.min(30, actualCfi.length)))),
          // });
          
          // 提取CFI的章节路径部分（例如：/6/32! 之前的部分）
          const getChapterPath = (cfiStr: string) => {
            const match = cfiStr.match(/epubcfi\(([^)]+)\)/);
            if (!match) return '';
            const path = match[1];
            // 找到第一个 ! 的位置，之前的部分是章节路径
            const exclamationIndex = path.indexOf('!');
            return exclamationIndex > 0 ? path.substring(0, exclamationIndex) : path;
          };
          
          const expectedChapterPath = getChapterPath(expectedCfi);
          const actualChapterPath = actualCfi ? getChapterPath(actualCfi) : '';
          
          // 检查CFI是否匹配（允许前缀匹配，因为CFI可能略有不同）
          const cfiExactMatch = actualCfi === expectedCfi;
          const cfiPrefixMatch = actualCfi && (
            expectedCfi.startsWith(actualCfi.substring(0, Math.min(30, actualCfi.length))) ||
            actualCfi.startsWith(expectedCfi.substring(0, Math.min(30, expectedCfi.length)))
          );
          // 检查是否在同一章节内（章节路径相同）
          const sameChapter = expectedChapterPath && actualChapterPath && expectedChapterPath === actualChapterPath;
          
          // 如果章节相同，认为匹配成功（允许同一章节内的CFI差异）
          const cfiMatches = cfiExactMatch || cfiPrefixMatch || sameChapter;
          
          // console.log('[ReaderEPUBPro] [初始化] 验证CFI恢复结果:', {
          //   expectedCfi: expectedCfi.substring(0, 50) + '...',
          //   actualCfi: actualCfi ? actualCfi.substring(0, 50) + '...' : 'null',
          //   expectedChapterPath,
          //   actualChapterPath,
          //   sameChapter,
          //   cfiExactMatch,
          //   cfiPrefixMatch,
          //   cfiMatch: cfiMatches,
          // });
          
          if (!cfiMatches) {
            console.warn('[ReaderEPUBPro] [初始化] ⚠️ CFI恢复后位置不匹配（不在同一章节），尝试重新跳转');
            // CFI不匹配，尝试重新跳转
            try {
              await rendition.display(expectedCfi);
              await new Promise(resolve => setTimeout(resolve, 800)); // 增加等待时间，确保位置稳定
              
              // 再次验证
              const retryLocation = rendition.currentLocation?.() as any;
              const retryCfi = retryLocation?.start?.cfi;
              const retryChapterPath = retryCfi ? getChapterPath(retryCfi) : '';
              const retryExactMatch = retryCfi === expectedCfi;
              const retryPrefixMatch = retryCfi && (
                expectedCfi.startsWith(retryCfi.substring(0, Math.min(30, retryCfi.length))) ||
                retryCfi.startsWith(expectedCfi.substring(0, Math.min(30, expectedCfi.length)))
              );
              const retrySameChapter = expectedChapterPath && retryChapterPath && expectedChapterPath === retryChapterPath;
              const retryMatches = retryExactMatch || retryPrefixMatch || retrySameChapter;
              
              if (retryMatches) {
                // console.log('[ReaderEPUBPro] [初始化] ✅ 重新跳转后CFI匹配成功', retrySameChapter ? '(同一章节内)' : '(精确匹配)');
              } else {
                // console.warn('[ReaderEPUBPro] [初始化] ⚠️ 重新跳转后CFI仍不匹配，使用章节索引回退');
                // 如果重新跳转后仍不匹配，回退到章节索引
                if (initialPosition.chapterIndex !== undefined) {
                  const item = spine.get(initialPosition.chapterIndex);
                  if (item) {
                    await rendition.display(item.href);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    // console.log('[ReaderEPUBPro] [初始化] 回退到章节索引:', initialPosition.chapterIndex);
                  }
                }
              }
            } catch (e) {
              console.error('[ReaderEPUBPro] [初始化] 重新跳转失败:', e);
              // 回退到章节索引
              if (initialPosition.chapterIndex !== undefined) {
                const item = spine.get(initialPosition.chapterIndex);
                if (item) {
                  await rendition.display(item.href);
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }
            }
          } else {
            // console.log('[ReaderEPUBPro] [初始化] ✅ CFI恢复验证成功', sameChapter ? '(同一章节内)' : '(精确匹配)');
          }
        } catch (e) {
          console.warn('[ReaderEPUBPro] [初始化] 验证CFI恢复失败:', e);
        }
      }
      
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
      // relocated事件防抖：记录最后保存的进度，避免重复保存
      let lastSavedRelocatedProgress: { cfi: string; progress: number; timestamp: number } | null = null;
      
      // 获取总章节数（从 ref 中读取）
      const getTotalChapters = (): number => {
        return totalChaptersRef.current;
      };
      
      // 获取当前页面文本内容的函数（基于 CFI）
      const getCurrentPageText = (location: any): string => {
        // 保存函数引用到 ref，以便在组件级别访问
        if (!getCurrentPageTextRef.current) {
          getCurrentPageTextRef.current = getCurrentPageText;
        }
        try {
          const rendition = epubjsRenditionRef.current;
          if (!rendition) return '';

          // 获取当前页面的开始和结束 CFI
          const startCfi = location.start?.cfi;
          const endCfi = location.end?.cfi;

          if (!startCfi || typeof startCfi !== 'string' || !startCfi.startsWith('epubcfi(')) {
            return '';
          }

          // 获取 iframe 文档
          const iframe = containerRef.current?.querySelector('iframe');
          if (!iframe) return '';
          
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) return '';

          // 方法1: 优先使用结束 CFI（如果可用且有效）
          if (endCfi && typeof endCfi === 'string' && endCfi.startsWith('epubcfi(')) {
            try {
              const startRange = (rendition as any).getRange?.(startCfi);
              const endRange = (rendition as any).getRange?.(endCfi);
              
              if (startRange && endRange) {
                // 验证开始和结束 Range 是否都在视口内
                const startRect = startRange.getBoundingClientRect();
                const endRect = endRange.getBoundingClientRect();
                const iframeWin = iframe.contentWindow;
                if (iframeWin) {
                  const viewportHeight = iframeWin.innerHeight || iframeDoc.documentElement?.clientHeight || 0;
                  
                  const startInViewport = startRect.top >= 0 && startRect.top < viewportHeight;
                  const endInViewport = endRect.top >= 0 && endRect.bottom <= viewportHeight;

                  if (startInViewport && endInViewport) {
                    const pageRange = iframeDoc.createRange();
                    pageRange.setStart(startRange.startContainer, startRange.startOffset);
                    pageRange.setEnd(endRange.endContainer, endRange.endOffset);
                    const text = pageRange.toString().trim();
                    if (text) return text;
                  }
                }
              }
            } catch (e) {
              console.warn('使用结束 CFI 获取文本失败:', e);
            }
          }

          // 方法2: 基于视口边界精确计算当前页面文本
          const startRange = (rendition as any).getRange?.(startCfi);
          if (!startRange) return '';

          // 获取 iframe 的可见视口边界
          const iframeWin = iframe.contentWindow;
          if (!iframeWin) return '';

          // 获取 iframe 内部视口的尺寸（这是实际可见区域）
          const iframeRect = iframe.getBoundingClientRect();
          const viewportHeight = iframeWin.innerHeight || iframeDoc.documentElement?.clientHeight || iframeRect.height;
          const viewportWidth = iframeWin.innerWidth || iframeDoc.documentElement?.clientWidth || iframeRect.width;
          
          // 视口的边界（相对于 iframe 视口）
          // 在 iframe 内部，getBoundingClientRect() 返回的坐标是相对于 iframe 视口的
          const viewportTop = 0;
          const viewportBottom = viewportHeight;
          const viewportLeft = 0;
          const viewportRight = viewportWidth;

          // 创建 Range 从开始位置
          const pageRange = iframeDoc.createRange();
          pageRange.setStart(startRange.startContainer, startRange.startOffset);

          // 找到开始节点
          const startContainer = startRange.startContainer;
          let currentNode: Node | null = null;
          
          if (startContainer.nodeType === Node.TEXT_NODE) {
            currentNode = startContainer;
          } else {
            // 如果开始容器不是文本节点，找到包含它的第一个文本节点
            const walker = iframeDoc.createTreeWalker(
              startContainer,
              NodeFilter.SHOW_TEXT,
              null
            );
            currentNode = walker.nextNode();
          }

          if (!currentNode) {
            // 如果找不到开始节点，使用开始 Range 的内容
            pageRange.setEnd(startRange.endContainer, startRange.endOffset);
            return pageRange.toString().trim();
          }

          // 处理开始节点：如果开始 Range 不在节点开头，需要调整起始偏移
          let startOffset = 0;
          if (currentNode === startContainer && currentNode.nodeType === Node.TEXT_NODE) {
            startOffset = startRange.startOffset;
            pageRange.setStart(currentNode, startOffset);
          }

          // 创建一个 TreeWalker 从开始节点开始遍历
          const walker = iframeDoc.createTreeWalker(
            iframeDoc.body || iframeDoc.documentElement,
            NodeFilter.SHOW_TEXT,
            null
          );
          
          // 定位到开始节点
          walker.currentNode = currentNode;
          
          // 从开始节点开始，收集可见区域内的文本
          let lastVisibleNode: Node | null = null;
          let lastVisibleOffset = 0;
          let node: Node | null = currentNode;
          
          while (node) {
            const nodeRange = iframeDoc.createRange();
            try {
              // 对于开始节点，如果开始位置不在节点开头，创建一个从 startOffset 开始的 Range
              if (node === currentNode && startOffset > 0) {
                nodeRange.setStart(node, startOffset);
                nodeRange.setEnd(node, node.textContent?.length || 0);
              } else {
                nodeRange.selectNodeContents(node);
              }
              
              // 获取节点在视口中的位置
              const nodeRect = nodeRange.getBoundingClientRect();
              const nodeTop = nodeRect.top;
              const nodeBottom = nodeRect.bottom;
              const nodeLeft = nodeRect.left;
              const nodeRight = nodeRect.right;

              // 检查节点是否完全超出视口底部（提前停止）
              if (nodeTop >= viewportBottom) {
                // 节点完全超出视口底部，停止收集
                break;
              }

              // 检查节点是否在可见视口内（至少有一部分可见）
              const isInViewport = 
                nodeBottom > viewportTop && 
                nodeTop < viewportBottom &&
                nodeRight > viewportLeft &&
                nodeLeft < viewportRight;

              if (isInViewport) {
                // 节点在视口内，记录它
                lastVisibleNode = node;
                lastVisibleOffset = node.textContent?.length || 0;
              }
            } catch (e) {
              // 忽略错误，继续遍历
            }
            
            // 移动到下一个节点
            node = walker.nextNode();
            
            // 如果下一个节点完全超出视口，提前停止
            if (node) {
              try {
                const nextNodeRange = iframeDoc.createRange();
                nextNodeRange.selectNodeContents(node);
                const nextNodeRect = nextNodeRange.getBoundingClientRect();
                if (nextNodeRect.top >= viewportBottom) {
                  break;
                }
              } catch (e) {
                // 忽略错误，继续
              }
            }
          }

          // 设置结束位置
          if (lastVisibleNode) {
            // 检查结束节点是否部分超出视口
            const endNodeRange = iframeDoc.createRange();
            if (lastVisibleNode === currentNode && startOffset > 0) {
              endNodeRange.setStart(lastVisibleNode, startOffset);
            } else {
              endNodeRange.setStart(lastVisibleNode, 0);
            }
            endNodeRange.setEnd(lastVisibleNode, lastVisibleNode.textContent?.length || 0);
            const endNodeRect = endNodeRange.getBoundingClientRect();
            const endNodeBottom = endNodeRect.bottom;
            
            if (endNodeBottom > viewportBottom && lastVisibleNode.textContent) {
              // 节点部分超出视口，需要计算精确的结束位置
              // 通过二分查找找到视口边界在文本中的位置
              const text = lastVisibleNode.textContent;
              const startIdx = (lastVisibleNode === currentNode && startOffset > 0) ? startOffset : 0;
              let low = startIdx;
              let high = text.length;
              
              while (low < high) {
                const mid = Math.floor((low + high) / 2);
                const testRange = iframeDoc.createRange();
                testRange.setStart(lastVisibleNode, startIdx);
                testRange.setEnd(lastVisibleNode, mid);
                const testRect = testRange.getBoundingClientRect();
                const testBottom = testRect.bottom;
                
                if (testBottom <= viewportBottom) {
                  low = mid + 1;
                } else {
                  high = mid;
                }
              }
              
              pageRange.setEnd(lastVisibleNode, Math.max(startIdx, low - 1));
            } else {
              // 节点完全在视口内，使用完整节点
              pageRange.setEnd(lastVisibleNode, lastVisibleOffset);
            }
          } else {
            // 如果没有找到可见的结束节点，使用开始 Range 的结束位置
            pageRange.setEnd(startRange.endContainer, startRange.endOffset);
          }

          const text = pageRange.toString().trim();
          return text;
        } catch (e) {
          console.warn('getCurrentPageText 错误:', e);
          return '';
        }
      };

      eventHandlers.relocated = (location: any) => {
        // 【关键修复】翻页后重新注入字体
        setTimeout(() => {
          const rendition = epubjsRenditionRef.current;
          if (rendition?.views) {
            const views = rendition.views();
            if (views && Array.isArray(views)) {
              views.forEach((view: any) => {
                if (view?.document) {
                  const fonts = customFontsRef.current;
                  const currentSettings = settingsRef.current;
                  const selectedFontId = currentSettings.fontFamily?.startsWith('custom:') 
                    ? currentSettings.fontFamily.slice(7).trim() 
                    : undefined;

                  if (fonts.length > 0 || selectedFontId) {
                    // 注入 @font-face
                    const styleContent = buildCustomFontsStyleContent(fonts, getFontsBaseUrl());
                    if (styleContent) {
                      const oldStyle = view.document.getElementById('readknows-custom-fonts');
                      if (oldStyle) oldStyle.remove();
                      
                      const style = view.document.createElement('style');
                      style.id = 'readknows-custom-fonts';
                      style.textContent = styleContent;
                      if (view.document.head.firstChild) {
                        view.document.head.insertBefore(style, view.document.head.firstChild);
                      } else {
                        view.document.head.appendChild(style);
                      }
                    }
                    
                    // 注入强制字体样式
                    if (selectedFontId) {
                      const oldForceStyle = view.document.getElementById('readknows-custom-fonts-force');
                      if (oldForceStyle) oldForceStyle.remove();
                      
                      const fontFamily = getFontFamily(currentSettings.fontFamily);
                      const forceStyle = view.document.createElement('style');
                      forceStyle.id = 'readknows-custom-fonts-force';
                      forceStyle.textContent = `body, body * { font-family: ${fontFamily} !important; }`;
                      if (view.document.head.firstChild) {
                        view.document.head.insertBefore(forceStyle, view.document.head.firstChild);
                      } else {
                        view.document.head.appendChild(forceStyle);
                      }
                    }
                    
                    // 使用 FontFace API
                    fonts.forEach((font) => {
                      const fontFamilyName = `ReadKnowsCustomFont-${font.id}`;
                      const apiUrl = `${getFontsBaseUrl()}/api/fonts/file-by-id/${encodeURIComponent(font.id)}`;
                      
                      try {
                        if (view.document.fonts && typeof view.document.fonts.add === 'function' && !view.document.fonts.check(`12px ${fontFamilyName}`)) {
                          const fontFace = new FontFace(fontFamilyName, `url("${apiUrl}")`);
                          fontFace.load()
                            .then(() => {
                              view.document.fonts.add(fontFace);
                            })
                            .catch(() => {});
                        }
                      } catch (e) {}
                    });
                  }
                }
              });
            }
          }
        }, 100);

        // 提取位置信息
        const spineIndex = location.start?.index ?? 0;
        const cfi = location.start?.cfi;
        // 注意：displayed.page/total 仅对"当前章节/当前视图"有效，字体/尺寸变化会漂移
        // 全书页码将优先使用 book.locations + CFI 计算（更稳定）
        const chapterCurrentPage = location.start?.displayed?.page || 1;
        const chapterTotalPages = location.start?.displayed?.total || 1;

        if (typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
          lastCfiRef.current = cfi;
        }

        // 获取并输出当前页面文本内容（调试用）
        const currentPageText = getCurrentPageText(location);

        // 若正在执行“重排后定位”的恢复流程，避免把中间态写回进度（会造成进度跳动）
        if (isRestoringLayoutRef.current) {
          return;
        }

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

        // 先尝试使用 epubjs 的 percentage（如果存在且有效，这是全书进度）
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
                } else if (spineIndex >= 0) {
                  // 如果重算失败，至少使用spineIndex来估算全书进度
                  const estimatedTotal = Math.max(spineIndex + 1, 1);
                  progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / estimatedTotal));
                } else {
                  // 完全无法获取章节信息时，才使用章节内进度作为最后兜底
                  progress = Math.min(1, Math.max(0, withinChapter));
                }
              } else if (spineIndex >= 0) {
                // book实例不存在，但至少知道章节索引，使用估算
                const estimatedTotal = Math.max(spineIndex + 1, 1);
                progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / estimatedTotal));
              } else {
                progress = Math.min(1, Math.max(0, withinChapter));
              }
            } catch {
              if (spineIndex >= 0) {
                // 异常时，至少使用spineIndex来估算全书进度
                const estimatedTotal = Math.max(spineIndex + 1, 1);
                progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / estimatedTotal));
              } else {
                progress = Math.min(1, Math.max(0, withinChapter));
              }
            }
          } else {
            // 正常：组合进度（确保同章节内翻页也会变化）
            const denom = totalChapters;
            progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / denom));
          }
        } else if (spineIndex >= 0) {
          // 如果无法获取总章节数，但至少知道当前章节索引，使用spineIndex+1作为估算分母
          // 这样可以避免使用纯章节内进度，至少能反映章节在全书中的大致位置
          const estimatedTotal = Math.max(spineIndex + 1, 1);
          progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / estimatedTotal));
        } else {
          // 完全拿不到章节信息时：至少使用章节内页码比例（最后兜底）
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
          
          // 首次 relocated 事件：验证是否与初始位置匹配
          // 注意：initialPosition 在闭包中，需要从外部传入或使用 ref
          const savedInitialPosition = initialPosition;
          if (savedInitialPosition?.currentLocation && savedInitialPosition.currentLocation.startsWith('epubcfi(')) {
            const expectedCfi = savedInitialPosition.currentLocation;
            const actualCfi = cfi;
            
            // 提取CFI的章节路径部分（例如：/6/32! 之前的部分）
            const getChapterPath = (cfiStr: string) => {
              const match = cfiStr.match(/epubcfi\(([^)]+)\)/);
              if (!match) return '';
              const path = match[1];
              // 找到第一个 ! 的位置，之前的部分是章节路径
              const exclamationIndex = path.indexOf('!');
              return exclamationIndex > 0 ? path.substring(0, exclamationIndex) : path;
            };
            
            const expectedChapterPath = getChapterPath(expectedCfi);
            const actualChapterPath = actualCfi ? getChapterPath(actualCfi) : '';
            
            // 检查CFI是否匹配（允许前缀匹配）
            const cfiExactMatch = actualCfi === expectedCfi;
            const cfiPrefixMatch = actualCfi && (
              expectedCfi.startsWith(actualCfi.substring(0, Math.min(30, actualCfi.length))) ||
              actualCfi.startsWith(expectedCfi.substring(0, Math.min(30, expectedCfi.length)))
            );
            // 检查是否在同一章节内（章节路径相同）
            const sameChapter = expectedChapterPath && actualChapterPath && expectedChapterPath === actualChapterPath;
            
            // 如果章节相同，且进度差异不大，认为匹配成功（允许同一章节内的CFI差异）
            const progressDiff = Math.abs((savedInitialPosition.progress || 0) - finalProgress);
            const cfiMatches = cfiExactMatch || cfiPrefixMatch || (sameChapter && progressDiff < 0.1);
            
            
            // 如果CFI不匹配且不在同一章节，或进度差异很大，说明恢复失败
            if (!cfiMatches && !sameChapter) {
              console.warn('[ReaderEPUBPro] [首次relocated] ⚠️ 初始位置恢复失败（不在同一章节），尝试重新跳转');
              // 尝试重新跳转到正确的CFI
              setTimeout(async () => {
                try {
                  await rendition.display(expectedCfi);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  // console.log('[ReaderEPUBPro] [首次relocated] ✅ 重新跳转到正确位置');
                } catch (e) {
                  console.error('[ReaderEPUBPro] [首次relocated] ❌ 重新跳转失败:', e);
                }
              }, 300);
              // 首次事件时不保存进度，等待重新跳转完成
              return;
            } else if (!cfiMatches && sameChapter && progressDiff > 0.1) {
              // 同一章节但进度差异较大，也尝试重新跳转
              console.warn('[ReaderEPUBPro] [首次relocated] ⚠️ 初始位置恢复失败（进度差异较大），尝试重新跳转');
              setTimeout(async () => {
                try {
                  await rendition.display(expectedCfi);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  console.log('[ReaderEPUBPro] [首次relocated] ✅ 重新跳转到正确位置');
                } catch (e) {
                  console.error('[ReaderEPUBPro] [首次relocated] ❌ 重新跳转失败:', e);
                }
              }, 300);
              return;
            } else {
              // console.log('[ReaderEPUBPro] [首次relocated] ✅ 初始位置恢复成功', sameChapter ? '(同一章节内)' : '(精确匹配)');
            }
          }
        }
        
        // 如果处于书签浏览模式，不更新 lastPositionRef 和 lastProgressRef（保持原阅读位置）
        // 这样 flushNow 时就不会保存书签位置
        const isBookmarkBrowsing = (window as any).__isBookmarkBrowsingMode === true;
        
        // 触发进度保存（使用最终进度）
        // 只有在非书签浏览模式时才更新 lastPositionRef
        if (!isBookmarkBrowsing) {
          lastProgressRef.current = finalProgress;
          lastPositionRef.current = position;
          if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
            lastCfiRef.current = cfi;
          }
        }
        
        // 只有在非恢复布局状态时才保存阅读进度
        if (!isRestoringLayoutRef.current) {
          // 防抖处理：检查是否与上次保存的位置相同
          const shouldSave = !lastSavedRelocatedProgress || 
            !cfi || 
            lastSavedRelocatedProgress.cfi !== cfi ||
            Math.abs(lastSavedRelocatedProgress.progress - finalProgress) > 0.001;
          
          if (shouldSave) {
            // 更新最后保存的进度信息
            if (cfi) {
              lastSavedRelocatedProgress = {
                cfi: cfi,
                progress: finalProgress,
                timestamp: Date.now(),
              };
            }
            
            onProgressChange(finalProgress, position);
          } else {
            // 跳过重复保存（静默，不输出日志）
          }
        }
      };
      rendition.on('relocated', eventHandlers.relocated);

      // 主动初始化 getCurrentPageText 函数引用
      // 在页面加载完成后，延迟获取一次当前页面位置并调用 getCurrentPageText
      // 这样可以确保函数引用被初始化，避免 TTS 功能报错
      setTimeout(() => {
        try {
          const currentLocation = rendition.currentLocation?.();
          if (currentLocation) {
            // 调用 getCurrentPageText 以初始化函数引用
            getCurrentPageText(currentLocation);
            // console.log('[ReaderEPUBPro] getCurrentPageText 函数已初始化');
          }
        } catch (e) {
          console.warn('[ReaderEPUBPro] 初始化 getCurrentPageText 失败:', e);
        }
      }, 1000); // 延迟1秒，确保内容完全渲染

      // 键盘快捷键（直接在 window 上添加，避免 passive 事件监听器问题）
      eventHandlers.keyup = (e: KeyboardEvent) => {
        // 如果焦点在输入框/文本域，跳过
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        
        // 处理左右键和上下键翻页
        if (e.key === settings.keyboardShortcuts.prev || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          // 标记已处理，避免容器层重复处理
          (e as any).__readerHandled = true;
          rendition.prev();
        } else if (e.key === settings.keyboardShortcuts.next || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          // 标记已处理，避免容器层重复处理
          (e as any).__readerHandled = true;
          rendition.next();
        }
      };
      // 使用 keydown 事件并在 window 上注册，确保可以调用 preventDefault
      window.addEventListener('keydown', eventHandlers.keyup, { passive: false });

      // 注意：点击/触摸翻页现在由最顶层的透明捕获层处理
      // 不在这里添加事件监听，避免重复触发

      // 保存事件处理函数引用到 rendition，用于清理
      (rendition as any).__eventHandlers = eventHandlers;


      // 暴露翻页函数到全局
      (window as any).__readerPageTurn = async (direction: 'prev' | 'next') => {
        // 翻页时通知外层容器隐藏工具条
        window.dispatchEvent(
          new CustomEvent('__reader_page_turn', {
            detail: { direction },
          })
        );
        
        // 检查是否正在播放TTS，如果是，不停止播放，只更新位置
        const isTTSPlaying = ttsIsPlayingRef.current;
        
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
          
          // 如果正在播放TTS，不停止播放，只记录日志
          // TTS播放时会自动处理翻页和段落更新
          if (isTTSPlaying) {
            const currentLocation = rendition.currentLocation?.() as any;
            const newCfi = currentLocation?.start?.cfi;
            console.log('[ReaderEPUBPro] [手动翻页] TTS播放中，翻页但不停止播放:', {
              direction: direction,
              newCfi: newCfi ? newCfi.substring(0, 50) + '...' : 'null',
              cfiValid: newCfi && typeof newCfi === 'string' && newCfi.startsWith('epubcfi('),
              note: 'TTS将继续播放，段落列表将在下次播放时自动更新'
            });
            // 不继续执行进度保存，因为TTS播放时会自动保存
            // 也不停止播放，让TTS继续播放当前段落
            setTimeout(() => {
              pageTurnStateRef.current.isTurningPage = false;
            }, debounceTime);
            return;
          }
          
          // 翻页后等待 relocated 事件触发，然后主动保存进度
          // 确保手动翻页的进度能够被保存
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 主动获取当前位置并保存进度
          const currentLocation = rendition.currentLocation?.() as any;
          if (currentLocation && !isRestoringLayoutRef.current) {
            try {
              const spineIndex = currentLocation?.start?.index ?? 0;
              const cfi = currentLocation?.start?.cfi;
              const chapterCurrentPage = currentLocation?.start?.displayed?.page || 1;
              const chapterTotalPages = currentLocation?.start?.displayed?.total || 1;
              
              // 计算进度
              const totalChapters = getTotalChapters();
              const withinChapter =
                typeof chapterTotalPages === 'number' &&
                chapterTotalPages > 1 &&
                typeof chapterCurrentPage === 'number' &&
                chapterCurrentPage >= 1
                  ? Math.min(1, Math.max(0, (chapterCurrentPage - 1) / chapterTotalPages))
                  : 0;
              
              let progress = 0;
              const percentage = currentLocation.start?.percentage;
              if (percentage !== undefined && percentage !== null && !isNaN(percentage) && percentage > 0) {
                // 优先使用epubjs提供的percentage（这是全书进度）
                progress = Math.min(1, Math.max(0, percentage));
              } else if (totalChapters > 0 && spineIndex >= 0) {
                // 使用章节索引和章节内进度计算全书进度
                const denom = totalChapters;
                progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / denom));
              } else if (spineIndex >= 0) {
                // 如果无法获取总章节数，但至少知道当前章节索引，使用spineIndex+1作为估算分母
                // 这样可以避免使用纯章节内进度，至少能反映章节在全书中的大致位置
                const estimatedTotal = Math.max(spineIndex + 1, 1);
                progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / estimatedTotal));
              } else {
                // 完全无法获取章节信息时，才使用章节内进度作为最后兜底
                progress = Math.min(1, Math.max(0, withinChapter));
              }
              
              // 使用 locations 计算稳定的页码（如果可用）
              let finalCurrentPage = chapterCurrentPage;
              let finalTotalPages = chapterTotalPages;
              let finalProgress = progress;
              
              const bookInstance = epubjsBookRef.current;
              if (
                locationsReadyRef.current &&
                bookInstance?.locations &&
                typeof bookInstance.locations.locationFromCfi === 'function' &&
                typeof bookInstance.locations.length === 'function' &&
                typeof cfi === 'string' &&
                cfi.startsWith('epubcfi(')
              ) {
                try {
                  const loc = bookInstance.locations.locationFromCfi(cfi);
                  const total = bookInstance.locations.length();
                  if (typeof loc === 'number' && loc >= 0 && typeof total === 'number' && total > 0) {
                    finalCurrentPage = loc + 1;
                    finalTotalPages = total;
                    finalProgress = Math.min(1, Math.max(0, (loc + 1) / total));
                  }
                } catch (e) {
                  // 忽略错误，使用章节内页码
                }
              }
              
              // 获取章节标题
              let chapterTitle = '';
              try {
                if (bookInstance) {
                  const navigation = bookInstance.navigation;
                  const tocItems = navigation?.toc || [];
                  const tocItem = tocItems.find((item: any) => {
                    try {
                      const spineItem = bookInstance.spine.get(item.href);
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
                // 忽略错误
              }
              
              const position: ReadingPosition = {
                chapterIndex: spineIndex,
                currentPage: finalCurrentPage,
                totalPages: finalTotalPages,
                progress: finalProgress,
                currentLocation: cfi || undefined,
                chapterTitle: chapterTitle || undefined,
              };
              
              // 如果处于书签浏览模式，不更新 lastPositionRef（保持原阅读位置）
              const isBookmarkBrowsing = (window as any).__isBookmarkBrowsingMode === true;
              if (!isBookmarkBrowsing) {
                // 保存进度
                lastProgressRef.current = finalProgress;
                lastPositionRef.current = position;
                if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
                  lastCfiRef.current = cfi;
                }
              }
              
              // 手动翻页只保存阅读进度（不影响TTS进度）
              saveReadingProgress(currentLocation, 'manual_page_turn');
            } catch (e) {
              console.warn('[ReaderEPUBPro] 手动翻页后保存进度失败:', e);
            }
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

      // 暴露“根据进度百分比跳转”给外部（供进度跳转功能使用）
      // 注意：这里的 progress 是全书进度（0-1），不是章节进度
      (window as any).__readerGoToProgress = async (progress: number) => {
        try {
          if (typeof progress !== 'number' || isNaN(progress) || progress < 0 || progress > 1) {
            console.warn('[ReaderEPUBPro] 无效的进度值:', progress);
            return false;
          }

          const bookInstance = epubjsBookRef.current;
          if (!bookInstance || !rendition) {
            console.warn('[ReaderEPUBPro] 书籍实例或 rendition 不存在');
            return false;
          }

          console.log('[ReaderEPUBPro] 开始跳转到全书进度:', (progress * 100).toFixed(2) + '%', {
            locationsReady: locationsReadyRef.current,
            totalLocations: totalLocationsRef.current,
            hasLocationsAPI: !!(bookInstance.locations && typeof bookInstance.locations.cfiFromLocation === 'function')
          });

          // 方案1：优先使用 locations API（如果可用且已生成）- 这是最准确的全书进度跳转方法
          if (locationsReadyRef.current && totalLocationsRef.current > 0 && 
              bookInstance.locations) {
            try {
              // 优先使用 cfiFromLocation（标准方法，更可靠）
              if (typeof bookInstance.locations.cfiFromLocation === 'function') {
                // 根据全书进度计算 location 索引（0-based）
                // locations 是基于全书内容生成的，每个 location 代表全书中的一个位置点
                // 注意：locations 索引范围是 0 到 (totalLocations - 1)
                // 进度 0% 对应索引 0，进度 100% 对应索引 (totalLocations - 1)
                // 计算公式：targetLocation = progress * (totalLocations - 1)
                const targetLocationIndex = Math.round(progress * (totalLocationsRef.current - 1));
                const targetLocation = Math.max(0, Math.min(targetLocationIndex, totalLocationsRef.current - 1));
                
                // 计算实际对应的进度（用于验证）
                const actualCalculatedProgress = totalLocationsRef.current > 1 
                  ? targetLocation / (totalLocationsRef.current - 1)
                  : 0;
                
                console.log('[ReaderEPUBPro] 使用 cfiFromLocation 跳转（全书进度）:', {
                  targetProgress: (progress * 100).toFixed(2) + '%',
                  targetLocationIndex: targetLocation,
                  totalLocations: totalLocationsRef.current,
                  calculatedProgress: (actualCalculatedProgress * 100).toFixed(2) + '%',
                  formula: `Math.round(${progress} * ${totalLocationsRef.current - 1}) = ${targetLocation}`
                });
                
                // 获取对应的 CFI（这是全书位置的 CFI，不是章节位置的 CFI）
                const cfi = bookInstance.locations.cfiFromLocation(targetLocation);
                if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(') && typeof rendition.display === 'function') {
                  console.log('[ReaderEPUBPro] 跳转到 CFI（全书位置）:', cfi.substring(0, 80) + '...');
                  
                  // 设置跳转标志，避免首次 relocated 验证误报
                  (window as any).__isProgressJumping = true;
                  
                  await rendition.display(cfi);
                  // 等待跳转完成，确保页面已渲染
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // 清除跳转标志（延迟清除，确保 relocated 事件已处理）
                  setTimeout(() => {
                    (window as any).__isProgressJumping = false;
                  }, 1000);
                  
                  // 验证跳转结果（用于调试，延迟验证以确保位置已更新）
                  setTimeout(() => {
                    try {
                      const actualLocation = rendition.currentLocation();
                      const actualCfi = (actualLocation as any)?.start?.cfi;
                      if (actualCfi && bookInstance.locations.locationFromCfi) {
                        const actualLoc = bookInstance.locations.locationFromCfi(actualCfi);
                        if (typeof actualLoc === 'number' && actualLoc >= 0 && totalLocationsRef.current > 1) {
                          const actualProgress = actualLoc / (totalLocationsRef.current - 1);
                          const errorPercent = Math.abs(progress - actualProgress) * 100;
                          console.log('[ReaderEPUBPro] 跳转验证（延迟）:', {
                            targetProgress: (progress * 100).toFixed(2) + '%',
                            actualProgress: (actualProgress * 100).toFixed(2) + '%',
                            error: errorPercent.toFixed(2) + '%',
                            targetLocation,
                            actualLocation: actualLoc,
                            totalLocations: totalLocationsRef.current
                          });
                          
                          // 如果误差超过15%，记录警告（但不影响跳转成功）
                          if (errorPercent > 15) {
                            console.warn('[ReaderEPUBPro] 跳转精度较低，误差:', errorPercent.toFixed(2) + '%', {
                              targetLocation,
                              actualLocation: actualLoc,
                              targetProgress: progress,
                              actualProgress
                            });
                          }
                        }
                      }
                    } catch (e) {
                      // 验证失败不影响跳转成功
                      console.warn('[ReaderEPUBPro] 跳转验证失败（不影响跳转）:', e);
                    }
                  }, 800);
                  
                  console.log('[ReaderEPUBPro] cfiFromLocation 跳转成功（全书进度）');
                  return true;
                } else {
                  console.warn('[ReaderEPUBPro] cfiFromLocation 返回的 CFI 无效:', cfi);
                }
              }
              
              // 备用方法：尝试使用 cfiFromPercentage（如果可用，但可能不准确）
              // 注意：这个方法可能不是 epubjs 的标准 API，使用时要谨慎
              if (typeof (bookInstance.locations as any).cfiFromPercentage === 'function') {
                try {
                  const cfi = (bookInstance.locations as any).cfiFromPercentage(progress);
                  if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(') && typeof rendition.display === 'function') {
                    console.log('[ReaderEPUBPro] 使用 cfiFromPercentage 跳转（备用方法，可能不准确）:', {
                      progress: (progress * 100).toFixed(2) + '%',
                      cfi: cfi.substring(0, 60) + '...'
                    });
                    await rendition.display(cfi);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    console.log('[ReaderEPUBPro] cfiFromPercentage 跳转完成（备用方法）');
                    return true;
                  }
                } catch (e) {
                  console.warn('[ReaderEPUBPro] cfiFromPercentage 跳转失败:', e);
                }
              }
            } catch (e) {
              console.error('[ReaderEPUBPro] 使用 locations API 跳转失败:', e);
              // 继续尝试其他方案
            }
          }

          // 方案2：如果 locations 未生成但可以生成，尝试触发并等待生成
          if (!locationsReadyRef.current && !locationsFailedRef.current && 
              bookInstance.locations && typeof bookInstance.locations.generate === 'function') {
            console.log('[ReaderEPUBPro] locations 未生成，尝试生成并等待（最多10秒）...');
            try {
              // 触发生成并等待（最多等待10秒，因为生成可能需要较长时间）
              const generatePromise = bookInstance.locations.generate(1600);
              
              // 如果 generate 返回 Promise，使用它；否则使用包装的 Promise
              const actualGeneratePromise = generatePromise && typeof (generatePromise as any).then === 'function'
                ? generatePromise
                : Promise.resolve();
              
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Locations generation timeout')), 10000)
              );
              
              try {
                await Promise.race([actualGeneratePromise, timeoutPromise]);
                
                // 等待一下，确保 locations 对象已更新
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 生成完成后，重新检查并更新 refs
                const total = typeof bookInstance.locations.length === 'function'
                  ? bookInstance.locations.length()
                  : ((bookInstance.locations as any)?.locations?.length || (bookInstance.locations as any)?.length || 0);
                
                console.log('[ReaderEPUBPro] locations 生成完成，检查结果:', {
                  total,
                  hasCfiFromLocation: typeof bookInstance.locations.cfiFromLocation === 'function',
                  hasCfiFromPercentage: typeof (bookInstance.locations as any).cfiFromPercentage === 'function'
                });
                
                if (total > 0 && typeof bookInstance.locations.cfiFromLocation === 'function') {
                  totalLocationsRef.current = total;
                  locationsReadyRef.current = true;
                  
                  // 现在可以使用 locations API 跳转
                  // 优先使用 cfiFromLocation（标准方法，更可靠）
                  const targetLocationIndex = Math.round(progress * (total - 1));
                  const targetLocation = Math.max(0, Math.min(targetLocationIndex, total - 1));
                  const cfi = bookInstance.locations.cfiFromLocation(targetLocation);
                  
                  if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(') && typeof rendition.display === 'function') {
                    console.log('[ReaderEPUBPro] locations 生成完成，使用 cfiFromLocation 跳转（全书进度）:', {
                      progress: (progress * 100).toFixed(2) + '%',
                      targetLocation,
                      total,
                      calculatedProgress: ((targetLocation / total) * 100).toFixed(2) + '%'
                    });
                    await rendition.display(cfi);
                    await new Promise(resolve => setTimeout(resolve, 400));
                    console.log('[ReaderEPUBPro] cfiFromLocation 跳转成功（生成后）');
                    return true;
                  } else {
                    console.warn('[ReaderEPUBPro] cfiFromLocation 返回的 CFI 无效:', cfi);
                  }
                } else {
                  console.warn('[ReaderEPUBPro] locations 生成完成但 total 无效或 API 不可用:', {
                    total,
                    hasCfiFromLocation: typeof bookInstance.locations.cfiFromLocation === 'function'
                  });
                  locationsFailedRef.current = true;
                }
              } catch (e: any) {
                console.warn('[ReaderEPUBPro] locations 生成超时或失败，使用回退方案:', e?.message || e);
                // 如果生成失败，标记为失败，避免重复尝试
                locationsFailedRef.current = true;
              }
            } catch (e) {
              console.warn('[ReaderEPUBPro] 触发 locations 生成失败:', e);
              locationsFailedRef.current = true;
            }
          }

          // 方案3：回退方案 - 使用章节索引 + 章节内进度
          // 注意：这是基于章节的估算方法，可能不够精确，但至少能跳转到正确的章节
          const spine = bookInstance.spine;
          if (!spine) {
            console.warn('[ReaderEPUBPro] spine 不存在，跳转失败');
            return false;
          }

          const totalChapters = totalChaptersRef.current || 1;
          if (totalChapters <= 0) {
            console.warn('[ReaderEPUBPro] 总章节数无效:', totalChapters);
            return false;
          }

          // 根据全书进度计算目标章节索引和章节内进度
          // 假设章节长度均匀（虽然不准确，但这是在没有 locations 时的最佳估算）
          const targetChapterFloatIndex = progress * totalChapters;
          const targetChapterIndex = Math.floor(targetChapterFloatIndex);
          const chapterProgress = targetChapterFloatIndex - targetChapterIndex; // 章节内进度（0-1）

          // 确保章节索引有效
          const safeChapterIndex = Math.max(0, Math.min(targetChapterIndex, totalChapters - 1));
          const item = spine.get(safeChapterIndex);
          
          if (!item?.href) {
            console.warn('[ReaderEPUBPro] 无法获取目标章节:', safeChapterIndex);
            return false;
          }

          console.log('[ReaderEPUBPro] 使用章节跳转方案（回退，基于章节估算）:', {
            progress: (progress * 100).toFixed(2) + '%',
            totalChapters,
            targetChapterIndex: safeChapterIndex + 1,
            chapterProgress: (chapterProgress * 100).toFixed(2) + '%',
            note: '注意：这是基于章节均匀分布的估算，可能不够精确'
          });

          // 先跳转到章节开头
          await rendition.display(item.href);
          // 等待章节加载完成
          await new Promise(resolve => setTimeout(resolve, 500));

          // 如果有章节内进度，尝试在章节内定位
          // 注意：由于 epubjs 的限制，如果没有 locations API，精确的章节内定位可能不可靠
          // 但我们仍然尝试使用一些方法来提高准确性
          if (chapterProgress > 0 && chapterProgress < 1) {
            try {
              const currentLocation = rendition.currentLocation();
              if (currentLocation) {
                const chapterTotalPages = (currentLocation as any).start?.displayed?.total || 1;
                
                if (chapterTotalPages > 1) {
                  // 计算目标页码（章节内，1-based）
                  const targetPageInChapter = Math.max(1, Math.min(
                    Math.ceil(chapterProgress * chapterTotalPages), 
                    chapterTotalPages
                  ));
                  
                  console.log('[ReaderEPUBPro] 尝试章节内定位:', {
                    chapterProgress: (chapterProgress * 100).toFixed(2) + '%',
                    chapterTotalPages,
                    targetPageInChapter
                  });
                  
                  // 方法：通过多次翻页到达目标位置（如果页数不多）
                  // 但这对大章节不适用，因为会太慢
                  // 
                  // 更好的方法：尝试使用 rendition 的内部方法（如果可用）
                  // 但由于 epubjs 的限制，暂时只跳转到章节开头
                  // 
                  // 用户可以通过手动翻页来调整到精确位置
                  console.log('[ReaderEPUBPro] 已跳转到目标章节（第', safeChapterIndex + 1, '章），预计在第', targetPageInChapter, '页附近');
                  console.log('[ReaderEPUBPro] 提示：如需更精确的位置，请等待 locations 生成完成（后台进行中）或手动翻页');
                  return true;
                }
              }
              
              // 如果无法获取章节页数，至少已跳转到章节开头
              console.log('[ReaderEPUBPro] 已跳转到目标章节（第', safeChapterIndex + 1, '章）开头');
              console.log('[ReaderEPUBPro] 提示：章节内进度约为', (chapterProgress * 100).toFixed(1) + '%，请手动翻页到目标位置');
              return true;
            } catch (e) {
              console.warn('[ReaderEPUBPro] 章节内定位失败:', e);
              // 即使定位失败，至少已跳转到章节
              console.log('[ReaderEPUBPro] 已跳转到目标章节（第', safeChapterIndex + 1, '章）');
              return true;
            }
          } else if (chapterProgress === 0) {
            // 章节进度为 0，已在章节开头
            console.log('[ReaderEPUBPro] 已跳转到目标章节开头（第', safeChapterIndex + 1, '章）');
            return true;
          } else if (chapterProgress >= 1) {
            // 章节进度 >= 1，跳转到下一章节
            const nextIndex = Math.min(safeChapterIndex + 1, totalChapters - 1);
            const nextItem = spine.get(nextIndex);
            if (nextItem?.href && typeof rendition.display === 'function') {
              await rendition.display(nextItem.href);
              await new Promise(resolve => setTimeout(resolve, 300));
              console.log('[ReaderEPUBPro] 已跳转到下一章节（第', nextIndex + 1, '章）');
              return true;
            }
          }
          
          console.log('[ReaderEPUBPro] 已跳转到目标章节（第', safeChapterIndex + 1, '章）');
          return true;
        } catch (e) {
          console.error('[ReaderEPUBPro] 进度跳转失败:', e);
        }
        return false;
      };

      // 暴露"保存当前进度"给外部（供关闭书签浏览模式时使用）
      (window as any).__saveCurrentProgress = () => {
        try {
          const currentLocation = rendition.currentLocation?.();
          if (currentLocation) {
            // 强制保存当前进度（忽略书签浏览模式标志）
            const wasBrowsingMode = (window as any).__isBookmarkBrowsingMode;
            (window as any).__isBookmarkBrowsingMode = false;
            // 直接调用 saveReadingProgress，此时标志已清除，会正常保存
            saveReadingProgress(currentLocation, 'bookmark_close');
            // 不再恢复标志，因为已经关闭了书签浏览模式
          }
        } catch (e) {
          console.warn('[ReaderEPUBPro] 保存当前进度失败:', e);
        }
      };

      // 暴露"保存之前的阅读位置"给外部（供关闭书籍时使用）
      (window as any).__savePreviousPosition = (previousPos: ReadingPosition) => {
        try {
          if (previousPos) {
            // 直接保存之前的阅读位置
            onProgressChange(previousPos.progress || 0, previousPos);
          }
        } catch (e) {
          console.warn('[ReaderEPUBPro] 保存之前的阅读位置失败:', e);
        }
      };

      // 窗口大小变化时调整
      const handleResize = () => {
        if (rendition && container) {
          const width = container.offsetWidth || window.innerWidth;
          const height = container.offsetHeight || window.innerHeight;

          const anchorCfi =
            lastCfiRef.current ||
            (rendition.currentLocation?.() as any)?.start?.cfi ||
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
      
      // 监听 TTS 状态变化，重新计算布局和安全区域
      (window as any).__onTTSStateChange = () => {
        // 延迟执行，确保 DOM 更新完成
        setTimeout(() => {
          handleResize();
        }, 100);
      };
      
      // 监听底部导航栏显示/隐藏状态变化
      // 注意：底部导航栏显示/隐藏只改变 padding，不改变阅读区域的实际尺寸
      // 因此不需要调用 resize，避免重新分页导致位置偏移
      (window as any).__onBottomNavStateChange = () => {
        // 底部导航栏显示/隐藏时，阅读区域的实际尺寸（width/height）没有变化
        // 只是外层容器的 paddingBottom 改变了，epubjs iframe 内部的尺寸不变
        // 所以不需要调用 handleResize，避免不必要的重新分页和位置恢复
        // 这样可以保证当前页面内容不会因为点击设置按钮而改变
      };
      
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
      (window as any).__epubHighlight = (cfiRange: string, color?: string) => {
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
              fill: color || 'rgba(255, 235, 59, 0.55)',
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

    // 构建新主题（含自定义字体）
    const fontFamily = getFontFamily(settings.fontFamily);

    const theme = {
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
      
      const applyFontAndThemeToDoc = (doc: Document) => {
        if (!doc || typeof doc.createElement !== 'function' || !doc.body) return;
        if (doc.documentElement) {
          doc.documentElement.style.setProperty('background-color', themeStyles.bg, 'important');
          doc.documentElement.style.setProperty('color', themeStyles.text, 'important');
        }
        doc.body.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
        doc.body.style.setProperty('line-height', `${settings.lineHeight}`, 'important');
        doc.body.style.setProperty('padding', `${settings.margin}px`, 'important');
        doc.body.style.setProperty('background-color', themeStyles.bg, 'important');
        doc.body.style.setProperty('color', themeStyles.text, 'important');
        // 使用内联样式确保字体优先级最高
        doc.body.setAttribute('style', `${doc.body.getAttribute('style') || ''}; font-family: ${fontFamily} !important;`);

        const paragraphs = doc.querySelectorAll('p');
        paragraphs.forEach((p: HTMLElement) => {
          p.style.setProperty('text-indent', `${settings.textIndent}em`, 'important');
          p.style.setProperty('color', themeStyles.text, 'important');
          p.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
          p.style.setProperty('line-height', `${settings.lineHeight}`, 'important');
          // 直接设置style属性确保最高优先级
          p.setAttribute('style', `${p.getAttribute('style') || ''}; font-family: ${fontFamily} !important;`);
        });

        // 为所有文本元素设置字体
        const textElements = doc.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, a, em, strong, b, i, u, blockquote, pre, code, section, article, body');
        textElements.forEach((el: any) => {
          if (el && typeof el.getElementsByTagName === 'function' && el.style) {
            el.style.setProperty('font-size', `${settings.fontSize}px`, 'important');
            el.style.setProperty('line-height', `${settings.lineHeight}`, 'important');
            // 使用setAttribute确保样式优先级
            el.setAttribute('style', `${el.getAttribute('style') || ''}; font-family: ${fontFamily} !important;`);
            let currentColor = '';
            try {
              const win = doc.defaultView || (doc as any).parentWindow;
              if (win) currentColor = win.getComputedStyle(el).color;
            } catch (_) {}
            if (settings.theme === 'light' && (currentColor === 'rgb(255, 255, 255)' || currentColor === '#ffffff' || currentColor === 'white' || currentColor.includes('rgb(255, 255, 255)')))
              el.style.setProperty('color', themeStyles.text, 'important');
            else if (settings.theme === 'dark' && (currentColor === 'rgb(0, 0, 0)' || currentColor === '#000000' || currentColor === 'black' || currentColor.includes('rgb(0, 0, 0)')))
              el.style.setProperty('color', themeStyles.text, 'important');
            else if (!currentColor || currentColor === themeStyles.bg)
              el.style.setProperty('color', themeStyles.text, 'important');
          }
        });
      };

      // 对已经渲染的内容也应用样式（rendition.views() 可能为空，故用 iframe 兜底）
      const views = rendition.views();
      if (views && Array.isArray(views)) {
        views.forEach((view: any) => {
          if (view?.document) applyFontAndThemeToDoc(view.document);
        });
      }
      const iframe = containerRef.current?.querySelector('iframe');
      const iframeDoc = iframe?.contentDocument || (iframe as HTMLIFrameElement)?.contentWindow?.document;
      if (iframeDoc) applyFontAndThemeToDoc(iframeDoc);
      
      // 【关键修复】应用主题后，重新注入字体样式
      setTimeout(() => {
        const views2 = rendition.views?.();
        if (views2 && Array.isArray(views2)) {
          views2.forEach((view: any) => {
            if (view?.document) {
              const tempContents = {
                document: view.document,
                addStylesheetRules: (rules: any) => {
                  // 尝试使用 epubjs 的方式添加样式
                  try {
                    if (view.document?.defaultView?.epubjs?.contents?.addStylesheetRules) {
                      view.document.defaultView.epubjs.contents.addStylesheetRules(rules);
                    } else {
                      // 回退：直接注入 CSS
                      const style = view.document.createElement('style');
                      style.textContent = Object.entries(rules).map(([key, value]: [string, any]) => {
                        if (key.startsWith('@font-face')) {
                          return `@font-face { ${Object.entries(value).map(([k, v]) => `${k}: ${v}`).join('; ')} }`;
                        }
                        return `${key} { ${Object.entries(value).map(([k, v]) => `${k}: ${v}`).join('; ')} }`;
                      }).join('\n');
                      view.document.head.appendChild(style);
                    }
                  } catch (e) {
                    console.warn('[主题useEffect] 注入字体样式失败:', e);
                  }
                }
              };
              
              // 注入字体
              const fonts = customFontsRef.current;
              const currentSettings = settingsRef.current;
              const selectedFontId = currentSettings.fontFamily?.startsWith('custom:') 
                ? currentSettings.fontFamily.slice(7).trim() 
                : undefined;

              if (fonts.length > 0 || selectedFontId) {
                const styleContent = buildCustomFontsStyleContent(fonts, getFontsBaseUrl());
                if (styleContent) {
                  const style = view.document.createElement('style');
                  style.id = 'readknows-custom-fonts';
                  style.textContent = styleContent;
                  if (view.document.head.firstChild) {
                    view.document.head.insertBefore(style, view.document.head.firstChild);
                  } else {
                    view.document.head.appendChild(style);
                  }
                  
                  if (selectedFontId) {
                    const fontFamily = getFontFamily(currentSettings.fontFamily);
                    const forceStyle = view.document.createElement('style');
                    forceStyle.id = 'readknows-custom-fonts-force';
                    forceStyle.textContent = `body, body * { font-family: ${fontFamily} !important; }`;
                    if (view.document.head.firstChild) {
                      view.document.head.insertBefore(forceStyle, view.document.head.firstChild);
                    } else {
                      view.document.head.appendChild(forceStyle);
                    }
                  }
                }
              }
            }
          });
        }
      }, 300);

      // 等待样式生效后重新计算分页和布局
      setTimeout(async () => {
        try {
          // 记录重排前的锚点 CFI，避免字体/尺寸变化导致跳页
          const anchorCfi =
            lastCfiRef.current ||
            (rendition.currentLocation?.() as any)?.start?.cfi ||
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
              const latestCfi = (latestLocation as any)?.start?.cfi;
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

  // 监听自定义字体变化，重新注入@font-face CSS到iframe并强制重新应用
  useEffect(() => {
    const rendition = epubjsRenditionRef.current;
    if (!rendition) return;

    const fonts = customFontsRef.current;
    const currentSettings = settingsRef.current;
    const selectedFontId = currentSettings.fontFamily?.startsWith('custom:') 
      ? currentSettings.fontFamily.slice(7).trim() 
      : undefined;

    if (!fonts.length && !selectedFontId) return;

    // 延迟注入，确保 rendition 已就绪
    setTimeout(() => {
      const views = rendition.views?.();
      if (views && Array.isArray(views)) {
        views.forEach((view: any) => {
          if (view?.document) {
            // 注入 @font-face
            const styleContent = buildCustomFontsStyleContent(fonts, getFontsBaseUrl());
            if (styleContent) {
              const oldStyle = view.document.getElementById('readknows-custom-fonts');
              if (oldStyle) oldStyle.remove();
              
              const style = view.document.createElement('style');
              style.id = 'readknows-custom-fonts';
              style.textContent = styleContent;
              if (view.document.head.firstChild) {
                view.document.head.insertBefore(style, view.document.head.firstChild);
              } else {
                view.document.head.appendChild(style);
              }
            }
            
            // 注入强制字体样式
            if (selectedFontId) {
              const oldForceStyle = view.document.getElementById('readknows-custom-fonts-force');
              if (oldForceStyle) oldForceStyle.remove();
              
              const fontFamily = getFontFamily(currentSettings.fontFamily);
              const forceStyle = view.document.createElement('style');
              forceStyle.id = 'readknows-custom-fonts-force';
              forceStyle.textContent = `body, body * { font-family: ${fontFamily} !important; }`;
              if (view.document.head.firstChild) {
                view.document.head.insertBefore(forceStyle, view.document.head.firstChild);
              } else {
                view.document.head.appendChild(forceStyle);
              }
            }
            
            // 使用 FontFace API
            fonts.forEach((font) => {
              const fontFamilyName = `ReadKnowsCustomFont-${font.id}`;
              const apiUrl = `${getFontsBaseUrl()}/api/fonts/file-by-id/${encodeURIComponent(font.id)}`;
              
              try {
                if (view.document.fonts && typeof view.document.fonts.add === 'function' && !view.document.fonts.check(`12px ${fontFamilyName}`)) {
                  const fontFace = new FontFace(fontFamilyName, `url("${apiUrl}")`);
                  fontFace.load()
                    .then(() => {
                      view.document.fonts.add(fontFace);
                    })
                    .catch(() => {});
                }
              } catch (e) {}
            });
          }
        });
      }
    }, 200);
  }, [customFonts, settings.fontFamily]);

  // 监听高亮列表变化并自动渲染到阅读器
  useEffect(() => {
    if (loading || !epubjsRenditionRef.current || !highlights) return;

    const rendition = epubjsRenditionRef.current;
    
    // 渲染所有高亮
    const applyHighlights = () => {
      if (!rendition?.annotations) return;
      
      highlights.forEach((h) => {
        if (!h.cfiRange) return;
        try {
          // 先尝试移除旧的（避免重复渲染导致颜色变深）
          try {
            // @ts-ignore
            rendition.annotations.remove(h.cfiRange, 'highlight');
          } catch (e) { /* ignore */ }
          
          rendition.annotations.highlight(
            h.cfiRange,
            {},
            () => {},
            'rk-note-highlight',
            {
              fill: h.color || 'rgba(255, 235, 59, 0.55)',
              'mix-blend-mode': 'multiply',
            }
          );
        } catch (e) {
          // ignore
        }
      });
    };

    // 延迟一会确保内容加载完成，做一次全量渲染
    const timer = setTimeout(applyHighlights, 1000);
    
    // 监听 rendition 的 relocated 事件，确保在翻页后也能显示高亮
    // EPUB.js 的 annotations.add 虽然是全局的，但在某些版本的渲染引擎中，
    // 翻页后新内容可能需要重新触发一下或者确保 annotations 系统已经处理。
    const handleRelocated = () => {
      // relocated 触发时，内容可能还没完全渲染，稍微延迟一下
      setTimeout(applyHighlights, 200);
    };
    
    rendition.on('relocated', handleRelocated);

    return () => {
      clearTimeout(timer);
      if (rendition) {
        rendition.off('relocated', handleRelocated);
      }
    };
  }, [highlights, loading]);

  // 使用 ref 存储笔记列表，确保在闭包中能访问到最新值
  const notesRef = useRef<BookNote[]>(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // 确保tooltip样式已添加到外层窗口（组件初始化时执行一次）
  useEffect(() => {
    const styleId = 'rk-note-tooltip-global-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        .rk-note-tooltip {
          position: fixed;
          z-index: 10000;
          max-width: 320px;
          padding: 10px 14px;
          background-color: rgba(0, 0, 0, 0.9);
          color: #fff;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.5;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease;
          word-wrap: break-word;
        }
        .rk-note-tooltip.show {
          opacity: 1;
        }
        .rk-note-tooltip-quote {
          font-style: italic;
          color: rgba(255, 255, 255, 0.85);
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          font-size: 12px;
        }
        .rk-note-tooltip-content {
          color: rgba(255, 255, 255, 0.95);
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 13px;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  // 监听笔记列表变化并自动渲染笔记标记（下虚线+脚注）
  useEffect(() => {
    
    if (loading || !epubjsRenditionRef.current) {
      return;
    }
    
    if (!notes || notes.length === 0) {
      // 如果没有笔记，清除所有标记
      const iframe = containerRef.current?.querySelector('iframe');
      if (iframe) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.querySelectorAll('.rk-note-mark').forEach((el) => {
            const parent = el.parentNode;
            if (parent && el.textContent) {
              parent.replaceChild(iframeDoc.createTextNode(el.textContent), el);
            }
          });
        }
      }
      return;
    }

    const rendition = epubjsRenditionRef.current;
    
    // 渲染笔记标记
    const applyNoteMarks = () => {
      if (!rendition?.annotations) return;
      
      const iframe = containerRef.current?.querySelector('iframe');
      if (!iframe) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 辅助函数：为笔记标记添加tooltip（PC端）
      const addNoteTooltip = (
        markEl: HTMLElement,
        footnoteEl: HTMLElement | null,
        note: BookNote,
        iframe: HTMLIFrameElement,
        iframeDoc: Document
      ) => {
        // 检测是否为移动设备
        const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
        if (isMobileDevice) return; // 移动端不显示tooltip
        
        // 创建tooltip元素（添加到外层窗口的body，而不是iframe的body）
        const tooltip = document.createElement('div');
        tooltip.className = 'rk-note-tooltip';
        tooltip.style.display = 'none';
        
        // 构建tooltip内容
        let tooltipHtml = '';
        if (note.selected_text) {
          const quoteText = note.selected_text.length > 50 
            ? note.selected_text.substring(0, 50) + '...' 
            : note.selected_text;
          tooltipHtml += `<div class="rk-note-tooltip-quote">"${quoteText.replace(/"/g, '&quot;')}"</div>`;
        }
        const contentText = note.content.length > 150 
          ? note.content.substring(0, 150) + '...' 
          : note.content;
        tooltipHtml += `<div class="rk-note-tooltip-content">${contentText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
        tooltip.innerHTML = tooltipHtml;
        
        // 添加到外层窗口的body
        document.body.appendChild(tooltip);
        
        let tooltipTimer: NodeJS.Timeout | null = null;
        
        // 显示tooltip
        const showTooltip = (e: MouseEvent) => {
          console.log('[Tooltip] mouseenter 事件触发', e.target, markEl);
          if (tooltipTimer) {
            clearTimeout(tooltipTimer);
          }
          
          tooltipTimer = setTimeout(() => {
            // 使用 markEl 而不是 e.target，因为 e.target 可能是子元素
            const rect = markEl.getBoundingClientRect();
            const iframeRect = iframe.getBoundingClientRect();
            
            // iframe 内元素的坐标需要加上 iframe 的偏移
            // getBoundingClientRect() 在 iframe 中返回的是相对于 iframe 视口的坐标
            // 需要加上 iframe 相对于外层窗口的位置
            const x = rect.left + rect.width / 2 + iframeRect.left;
            const y = rect.top + iframeRect.top;
            
            console.log('[Tooltip] 显示位置', { 
              x, 
              y, 
              markRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
              iframeRect: { left: iframeRect.left, top: iframeRect.top, width: iframeRect.width, height: iframeRect.height }
            });
            
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y - 10}px`;
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.style.display = 'block';
            tooltip.style.zIndex = '10000';
            
            // 延迟显示动画
            setTimeout(() => {
              tooltip.classList.add('show');
              console.log('[Tooltip] 已显示，tooltip元素:', tooltip);
            }, 10);
          }, 200); // 延迟200ms显示
        };
        
        // 隐藏tooltip
        const hideTooltip = () => {
          if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
          }
          tooltip.classList.remove('show');
          setTimeout(() => {
            tooltip.style.display = 'none';
          }, 200);
        };
        
        // 绑定事件（使用捕获阶段确保事件能触发）
        const handleMouseEnter = (e: MouseEvent) => {
          console.log('[Tooltip] handleMouseEnter 被调用', markEl, e.target);
          e.stopPropagation();
          e.preventDefault();
          showTooltip(e);
        };
        const handleMouseLeave = (e: MouseEvent) => {
          console.log('[Tooltip] handleMouseLeave 被调用');
          e.stopPropagation();
          hideTooltip();
        };
        
        // 使用 mouseover/mouseout 替代 mouseenter/mouseleave，因为它们在 iframe 中更可靠
        markEl.addEventListener('mouseover', handleMouseEnter, true);
        markEl.addEventListener('mouseout', handleMouseLeave, true);
        markEl.addEventListener('mouseenter', handleMouseEnter, true);
        markEl.addEventListener('mouseleave', handleMouseLeave, true);
        
        if (footnoteEl) {
          footnoteEl.addEventListener('mouseover', handleMouseEnter, true);
          footnoteEl.addEventListener('mouseout', handleMouseLeave, true);
          footnoteEl.addEventListener('mouseenter', handleMouseEnter, true);
          footnoteEl.addEventListener('mouseleave', handleMouseLeave, true);
        }
        
      };

      // 添加笔记标记样式
      const styleId = 'rk-note-mark-style';
      let styleEl = iframeDoc.getElementById(styleId) as HTMLStyleElement;
      if (!styleEl) {
        styleEl = iframeDoc.createElement('style');
        styleEl.id = styleId;
        iframeDoc.head.appendChild(styleEl);
      }
      // 检测是否为移动设备
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
      
      styleEl.textContent = `
        .rk-note-mark {
          border-bottom: 2px dashed rgba(33, 150, 243, 0.6);
          cursor: pointer;
          position: relative;
          text-decoration: none !important;
          display: inline;
        }
        .rk-note-mark:hover {
          border-bottom-color: rgba(33, 150, 243, 0.9);
          background-color: rgba(33, 150, 243, 0.1);
        }
        .rk-note-footnote {
          display: inline;
          font-size: 0.7em;
          vertical-align: super;
          color: rgba(33, 150, 243, 0.9);
          margin-left: 0;
          margin-right: 0;
          padding-left: 0;
          padding-right: 0;
          cursor: pointer;
          line-height: 0;
          font-weight: normal;
          position: relative;
          top: -0.3em;
        }
        .rk-note-footnote::before {
          content: "●";
          display: inline;
          font-size: 0.6em;
        }
        .rk-note-tooltip {
          position: fixed;
          z-index: 10000;
          max-width: 320px;
          padding: 8px 12px;
          background-color: rgba(0, 0, 0, 0.85);
          color: #fff;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.5;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .rk-note-tooltip.show {
          opacity: 1;
        }
        .rk-note-tooltip-quote {
          font-style: italic;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 6px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }
        .rk-note-tooltip-content {
          color: rgba(255, 255, 255, 0.95);
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;

      // 清除旧的笔记标记
      iframeDoc.querySelectorAll('.rk-note-mark').forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          const textContent = el.textContent || '';
          // 移除脚注标记
          const textWithoutFootnote = textContent.replace(/\[\d+\]$/, '');
          parent.replaceChild(iframeDoc.createTextNode(textWithoutFootnote), el);
        }
      });

      // 为每个有 selected_text 的笔记添加标记
      notesRef.current.forEach((note, index) => {
        if (!note.selected_text) {
          return;
        }
        
        const selectedText = note.selected_text.trim();
        if (!selectedText) {
          return;
        }
        
        try {
          let range: Range | null = null;
          
          // 优先使用 CFI 定位（如果存在且有效）
          if (note.position && typeof note.position === 'string' && note.position.startsWith('epubcfi(')) {
            try {
              range = (rendition as any).getRange?.(note.position);
              if (!range) {
                // console.log('[笔记标记] CFI 定位失败，尝试文本匹配:', note.position);
              }
            } catch (e) {
              console.warn('[笔记标记] CFI 定位异常:', e, note.position);
            }
          }
          
          // 如果没有 range，通过文本匹配查找
          if (!range) {
            
            // 简化匹配：直接在整个文档中查找文本
            const bodyText = iframeDoc.body.textContent || '';
            const bodyHtml = iframeDoc.body.innerHTML;
            
            // 检查文本是否存在
            if (bodyText.includes(selectedText)) {
              
              // 使用更简单的方法：直接替换 HTML 中的文本
              // 但需要确保不会破坏 HTML 结构
              try {
                // 转义特殊字符用于正则表达式
                const escapedText = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // 创建标记 HTML
                const markHtml = `<span class="rk-note-mark" data-note-id="${note.id}">${selectedText.replace(/[&<>"']/g, (m) => {
                  const map: Record<string, string> = {
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                  };
                  return map[m];
                })}<sup class="rk-note-footnote" data-note-id="${note.id}" title="笔记 ${index + 1}"></sup></span>`;
                
                // 在 body 中查找并替换（只替换第一次出现）
                const newHtml = bodyHtml.replace(new RegExp(`(${escapedText})`, 'g'), (match, p1) => {
                  // 检查是否已经在标记内
                  const beforeMatch = bodyHtml.substring(0, bodyHtml.indexOf(match));
                  const lastOpenTag = beforeMatch.lastIndexOf('<span class="rk-note-mark"');
                  const lastCloseTag = beforeMatch.lastIndexOf('</span>');
                  if (lastOpenTag > lastCloseTag) {
                    // 已经在标记内，不替换
                    return match;
                  }
                  return markHtml;
                });
                
                if (newHtml !== bodyHtml) {
                  iframeDoc.body.innerHTML = newHtml;
                  
                  // 重新绑定事件
                  const markEl = iframeDoc.querySelector(`.rk-note-mark[data-note-id="${note.id}"]`);
                  const footnoteEl = iframeDoc.querySelector(`.rk-note-footnote[data-note-id="${note.id}"]`);
                  
                  const handleClick = (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    if (onNoteClick) {
                      onNoteClick(note);
                    }
                    return false;
                  };
                  
                  if (markEl) {
                    markEl.addEventListener('click', handleClick, true);
                    markEl.addEventListener('mousedown', (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                    }, true);
                    
                    // 添加tooltip（PC端）
                    addNoteTooltip(markEl as HTMLElement, footnoteEl as HTMLElement | null, note, iframe, iframeDoc);
                  }
                  if (footnoteEl) {
                    footnoteEl.addEventListener('click', handleClick, true);
                    footnoteEl.addEventListener('mousedown', (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                    }, true);
                  }
                  
                  return; // 已处理，跳过后续 range 处理
                }
              } catch (e) {
                // console.warn('[笔记标记] HTML 替换失败:', e);
              }
            } else {
              // console.log('[笔记标记] 文本未找到:', selectedText.substring(0, 30));
            }
          }
          
          // 如果找到了 range，添加标记
          if (range) {
            try {
              const element = range.commonAncestorContainer;
              
              if (element.nodeType === Node.TEXT_NODE) {
                const textNode = element as Text;
                const parent = textNode.parentElement;
                if (!parent || parent.classList.contains('rk-note-mark')) return;
                
                // 创建标记元素
                const mark = iframeDoc.createElement('span');
                mark.className = 'rk-note-mark';
                mark.setAttribute('data-note-id', note.id);
                
                // 创建脚注标记（使用图标，不显示数字）
                const footnote = iframeDoc.createElement('sup');
                footnote.className = 'rk-note-footnote';
                footnote.setAttribute('data-note-id', note.id);
                footnote.setAttribute('title', `笔记 ${index + 1}`); // 鼠标悬停时显示编号
                
                // 提取文本内容
                const textContent = textNode.textContent || '';
                const textBefore = textContent.substring(0, range.startOffset);
                const textSelected = textContent.substring(range.startOffset, range.endOffset);
                const textAfter = textContent.substring(range.endOffset);
                
                // 替换文本节点
                if (textBefore) {
                  parent.insertBefore(iframeDoc.createTextNode(textBefore), textNode);
                }
                
                mark.textContent = textSelected;
                mark.appendChild(footnote);
                parent.insertBefore(mark, textNode);
                
                if (textAfter) {
                  parent.insertBefore(iframeDoc.createTextNode(textAfter), textNode);
                }
                
                parent.removeChild(textNode);
                
                // 添加tooltip（PC端）
                addNoteTooltip(mark, footnote, note, iframe, iframeDoc);
                
                // 添加点击事件（使用捕获阶段，确保优先处理）
                const handleClick = (e: Event) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation(); // 阻止同一元素上的其他监听器
                  if (onNoteClick) {
                    onNoteClick(note);
                  }
                  return false; // 额外的保护
                };
                
                mark.addEventListener('click', handleClick, true); // 使用捕获阶段
                footnote.addEventListener('click', handleClick, true);
                
                // 同时阻止鼠标按下事件，防止触发其他交互
                mark.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                }, true);
                footnote.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.stopImmediatePropagation();
                }, true);
                
              } else if (element.nodeType === Node.ELEMENT_NODE) {
                // 如果是元素节点，尝试在元素内查找并替换
                const el = element as HTMLElement;
                const textContent = el.textContent || '';
                
                if (textContent.includes(selectedText)) {
                  // 使用更安全的方式替换
                  const markHtml = `<span class="rk-note-mark" data-note-id="${note.id}">${selectedText.replace(/[&<>"']/g, (m) => {
                    const map: Record<string, string> = {
                      '&': '&amp;',
                      '<': '&lt;',
                      '>': '&gt;',
                      '"': '&quot;',
                      "'": '&#39;',
                    };
                    return map[m];
                  })}<sup class="rk-note-footnote" data-note-id="${note.id}" title="笔记 ${index + 1}"></sup></span>`;
                  
                  // 使用 textContent 查找并替换（更安全）
                  const newHtml = el.innerHTML.replace(
                    new RegExp(selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                    markHtml
                  );
                  el.innerHTML = newHtml;
                  
                  // 重新绑定事件
                  const markEl = el.querySelector(`.rk-note-mark[data-note-id="${note.id}"]`);
                  const footnoteEl = el.querySelector(`.rk-note-footnote[data-note-id="${note.id}"]`);
                  
                  const handleClick = (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    if (onNoteClick) {
                      onNoteClick(note);
                    }
                    return false;
                  };
                  
                  if (markEl) {
                    markEl.addEventListener('click', handleClick, true);
                    markEl.addEventListener('mousedown', (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                    }, true);
                  }
                  if (footnoteEl) {
                    footnoteEl.addEventListener('click', handleClick, true);
                    footnoteEl.addEventListener('mousedown', (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                    }, true);
                  }
                  
                }
              }
            } catch (e) {
              // console.warn('[笔记标记] 处理 range 失败:', e, note);
            }
          } else {
            // console.warn('[笔记标记] 无法定位文本:', note.id, selectedText.substring(0, 30));
          }
        } catch (e) {
          // console.error('[笔记标记] 标记笔记异常:', e, note);
        }
      });
    };

    // 延迟确保内容加载完成
    const timer = setTimeout(applyNoteMarks, 1000);
    
    // 监听 relocated 事件
    const handleRelocated = () => {
      setTimeout(applyNoteMarks, 200);
    };
    
    rendition.on('relocated', handleRelocated);

    return () => {
      clearTimeout(timer);
      if (rendition) {
        rendition.off('relocated', handleRelocated);
      }
    };
  }, [notes, loading, onNoteClick]);

  // 在切后台/关闭页面时，强制 flush 一次最新位置，避免"最后一次 relocated 未落库"导致回退到上一页
  useEffect(() => {
    const flushNow = () => {
      try {
        if (isRestoringLayoutRef.current) return;
        
        // 如果处于书签浏览模式，不保存当前进度（保持原阅读进度不变）
        // 如果存在 previousPosition，会在 ReaderContainer 的 onClose 中处理
        if ((window as any).__isBookmarkBrowsingMode === true) {
          // 检查是否有 previousPosition 需要保存
          const previousPos = (window as any).__previousPositionForSave;
          if (previousPos) {
            // 保存之前的阅读位置
            onProgressChange(previousPos.progress || 0, previousPos);
            // 清除标志和临时数据
            (window as any).__isBookmarkBrowsingMode = false;
            (window as any).__previousPositionForSave = null;
          }
          return;
        }
        
        const rendition = epubjsRenditionRef.current;
        const bookInstance = epubjsBookRef.current;
        const cfi =
          lastCfiRef.current ||
          (rendition?.currentLocation?.() as any)?.start?.cfi ||
          null;

        // 优先使用我们已经算好的 lastPositionRef
        // 但如果处于书签浏览模式，不应该使用 lastPositionRef（因为它可能被书签位置更新了）
        if (!(window as any).__isBookmarkBrowsingMode && lastPositionRef.current && lastPositionRef.current.currentLocation) {
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
          // 循环所有 iframe，清理其中的 MutationObserver 和事件监听器将在下方统一处理
          // 此处不需要直接操作 iframeDoc，iframeDoc 尚未定义
          try {
            const container = containerRef.current;
            if (container) {
              const iframes = container.querySelectorAll('iframe');
              iframes.forEach((iframe) => {
                try {
                  const iframeDoc = (iframe as HTMLIFrameElement).contentDocument;
                  if (iframeDoc) {
                    // 清理字体观察者
                    const fontObserver = (iframeDoc as any).__epubFontObserver;
                    if (fontObserver && typeof fontObserver.disconnect === 'function') {
                      fontObserver.disconnect();
                      delete (iframeDoc as any).__epubFontObserver;
                    }
                    
                    // 清理主题观察者
                    const themeObserver = (iframeDoc as any).__epubThemeObserver;
                    if (themeObserver && typeof themeObserver.disconnect === 'function') {
                      themeObserver.disconnect();
                      delete (iframeDoc as any).__epubThemeObserver;
                    }
                    
                    // 清理 iframe 内的事件监听器
                    const listeners = (iframeDoc as any).__rkPageTurnListeners;
                    if (listeners) {
                      try {
                        if (listeners.onTouchStart) {
                          iframeDoc.removeEventListener('touchstart', listeners.onTouchStart);
                        }
                        if (listeners.onTouchMove) {
                          iframeDoc.removeEventListener('touchmove', listeners.onTouchMove);
                        }
                        if (listeners.onTouchEnd) {
                          iframeDoc.removeEventListener('touchend', listeners.onTouchEnd);
                        }
                        if (listeners.onPointerDown) {
                          iframeDoc.removeEventListener('pointerdown', listeners.onPointerDown);
                        }
                        if (listeners.onPointerMove) {
                          iframeDoc.removeEventListener('pointermove', listeners.onPointerMove);
                        }
                        if (listeners.onPointerUp) {
                          iframeDoc.removeEventListener('pointerup', listeners.onPointerUp);
                        }
                        if (listeners.onClick) {
                          iframeDoc.removeEventListener('click', listeners.onClick, true);
                        }
                        if (listeners.onContextMenu) {
                          iframeDoc.removeEventListener('contextmenu', listeners.onContextMenu);
                        }
                      } catch (e) {
                        // 忽略清理错误
                      }
                      delete (iframeDoc as any).__rkPageTurnListeners;
                    }
                  }
                } catch (e) {
                  // 忽略 iframe 访问错误（可能是跨域）
                }
              });
            }
          } catch (e) {
            // 忽略清理错误
          }
          
          // 移除 resize 事件监听器
          if (rendition && (rendition as any).__cleanup) {
            try {
              window.removeEventListener('resize', (rendition as any).__cleanup.handleResize);
            } catch (e) {
              // 忽略错误
            }
          }
          
          // 清理 TTS 状态变化监听器
          if ((window as any).__onTTSStateChange) {
            delete (window as any).__onTTSStateChange;
          }
          
          // 清理底部导航栏状态变化监听器
          if ((window as any).__onBottomNavStateChange) {
            delete (window as any).__onBottomNavStateChange;
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
                  // 移除 window 上的键盘事件监听器
                  if (eventHandlers.keyup) {
                    window.removeEventListener('keydown', eventHandlers.keyup);
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
      delete (window as any).__epubClearSelection;
      delete (window as any).__readerGoToProgress;
      
      // 延迟清理，确保 React 完成 DOM 操作后再清理
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cleanup, { timeout: 1000 });
      } else {
        setTimeout(cleanup, 100);
      }
    };
  }, []);

  // 主题样式

  // 组件卸载时清理手势处理器
  useEffect(() => {
    return () => {
      if (gestureHandlerRef.current) {
        gestureHandlerRef.current.destroy();
        gestureHandlerRef.current = null;
      }
    };
  }, []);

  // 显示/隐藏底部导航栏的函数（通过全局函数调用）
  const showBars = useCallback(() => {
    if ((window as any).__toggleReaderNavigation) {
      (window as any).__toggleReaderNavigation();
    }
  }, []);

  // 初始化手势处理器
  useEffect(() => {
    if (!containerRef.current || loading) return;

    const callbacks: GestureCallbacks = {
      onPageTurn: (direction) => {
        if (!epubjsRenditionRef.current) return;
        
        // 防抖检查
        const now = Date.now();
        const debounceTime = 300;
        if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
        if (pageTurnStateRef.current.isTurningPage) return;
        
        pageTurnStateRef.current.isTurningPage = true;
        pageTurnStateRef.current.lastPageTurnTime = now;
        
        // 翻页时通知外层容器隐藏工具条
        window.dispatchEvent(
          new CustomEvent('__reader_page_turn', {
            detail: { direction },
          })
        );
        
        try {
          if (direction === 'prev') {
            epubjsRenditionRef.current.prev();
          } else {
            epubjsRenditionRef.current.next();
          }
        } finally {
          setTimeout(() => {
            pageTurnStateRef.current.isTurningPage = false;
          }, debounceTime);
        }
      },
      onLongPress: () => {
        showBars();
      },
      onShowNavigation: () => {
        showBars();
      },
      onTap: (x, y) => {
        // 点击翻页模式处理
        if (settings.pageTurnMethod !== 'click' || !settings.clickToTurn) return;
        if (loading || !epubjsRenditionRef.current) return;
        
        // 优先检查并隐藏 UI 元素（工具条、选择等）
        // 如果隐藏了 UI，则不翻页
        const checkAndHideUI = (window as any).__readerCheckAndHideUI;
        if (checkAndHideUI && typeof checkAndHideUI === 'function') {
          const hasHiddenUI = checkAndHideUI();
          if (hasHiddenUI) {
            // 如果隐藏了 UI，不执行翻页
            return;
          }
        }
        
        // 检查 iframe 内是否有选择，如果有则不翻页（让 checkAndHideUI 处理清除选择）
        try {
          const iframe = epubjsRenditionRef.current?.manager?.container?.querySelector('iframe');
          if (iframe) {
            const iframeDoc = iframe.contentDocument || (iframe as any).contentWindow?.document;
            if (iframeDoc) {
              const iframeWin = iframeDoc.defaultView || (iframe as any).contentWindow;
              if (iframeWin) {
                const sel = iframeWin.getSelection?.() || iframeDoc.getSelection?.();
                if (sel && !sel.isCollapsed) {
                  // 有选择，不翻页（让 checkAndHideUI 处理清除选择）
                  return;
                }
              }
            }
          }
        } catch (e) {
          // ignore
        }
        
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        // 防抖检查
        const now = Date.now();
        const debounceTime = 300;
        if (now - pageTurnStateRef.current.lastPageTurnTime < debounceTime) return;
        if (pageTurnStateRef.current.isTurningPage) return;
        
        pageTurnStateRef.current.isTurningPage = true;
        pageTurnStateRef.current.lastPageTurnTime = now;
        
        const width = rect.width;
        const height = rect.height;
        
        // 根据翻页模式决定翻页方向
        const turnDirection = settings.pageTurnMode === 'horizontal'
          ? (x < width / 2 ? 'prev' : 'next')
          : (y < height / 2 ? 'prev' : 'next');
        
        // 翻页时通知外层容器隐藏工具条
        window.dispatchEvent(
          new CustomEvent('__reader_page_turn', {
            detail: { direction: turnDirection },
          })
        );
        
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
      },
      onEdgeReached: (edge) => {
        // 到达边界时的反馈（可选）
        // toast('已到达边界');
      },
    };

    const handler = new GestureHandler(
      containerRef.current,
      callbacks,
      {
        swipeThreshold: 70,
        swipeVelocityThreshold: 0.3,
        longPressThreshold: 500,
        animationDuration: 300,
        minTouchDuration: 80,
        maxTouchDuration: 800,
        maxMoveDistance: 15,
        directionRatio: 1.3,
        directionMin: 40,
      }
    );

    gestureHandlerRef.current = handler;

    // 更新设置
    handler.updateSettings({
      pageTurnMethod: settings.pageTurnMethod,
      pageTurnMode: settings.pageTurnMode,
      clickToTurn: settings.clickToTurn,
      isAtPageBoundary: () => {
        // 可以在这里实现边界检测逻辑
        return false;
      },
    });

    return () => {
      handler.destroy();
      gestureHandlerRef.current = null;
    };
  }, [loading, showBars]);

  // 当设置变化时更新手势处理器
  useEffect(() => {
    if (gestureHandlerRef.current) {
      gestureHandlerRef.current.updateSettings({
        pageTurnMethod: settings.pageTurnMethod,
        pageTurnMode: settings.pageTurnMode,
        clickToTurn: settings.clickToTurn,
        isAtPageBoundary: () => false,
      });
    }
  }, [settings.pageTurnMethod, settings.pageTurnMode, settings.clickToTurn]);

  // TTS 朗读相关状态
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCurrentSentencesRef = useRef<string[]>([]);
  const ttsCurrentParagraphsRef = useRef<Array<{ text: string; cfi?: string; startCfi?: string; endCfi?: string }>>([]);
  const ttsCurrentIndexRef = useRef<number>(0);
  const ttsIsPlayingRef = useRef<boolean>(false);
  const ttsNextPageTextRef = useRef<string>('');
  const ttsNextPageAudioCacheRef = useRef<Map<string, string>>(new Map()); // 缓存音频URL
  const ttsParagraphCacheRef = useRef<Set<string>>(new Set()); // 段落去重缓存（使用文本内容的hash）
  const ttsLastPlayedTextRef = useRef<string>(''); // 上一个播放的文本内容（用于检测重复）
  const ttsLastGeneratedTextRef = useRef<string>(''); // 上一个生成的文本内容（用于检测重复）
  const getCurrentPageTextRef = useRef<((location: any) => string) | null>(null); // 保存 getCurrentPageText 函数引用
  const ttsHighlightRef = useRef<HTMLElement | null>(null); // 当前高亮的元素
  const ttsInstanceRef = useRef<{ stop: () => void } | null>(null); // 当前实例引用，用于从全局集合中删除
  
  // TTS进度存储（独立于阅读进度）
  const ttsProgressRef = useRef<{
    currentCfi?: string;
    currentParagraphIndex: number;
    currentParagraphCfi?: string;
    progress: number;
  } | null>(null);
  
  // 保存TTS进度到localStorage（独立存储）
  const saveTTSProgress = useCallback(() => {
    if (!ttsIsPlayingRef.current) return;
    
    const currentParagraph = ttsCurrentParagraphsRef.current[ttsCurrentIndexRef.current];
    if (!currentParagraph) return;
    
    const rendition = epubjsRenditionRef.current;
    if (!rendition) return;
    
    try {
      const currentLocation = rendition.currentLocation?.() as any;
      const currentCfi = currentLocation?.start?.cfi;
      
      // 优先使用段落的 startCfi，如果没有则使用 cfi，如果还没有则使用当前页面的 CFI
      let paragraphCfi = currentParagraph.startCfi || currentParagraph.cfi;
      
      // 如果段落没有 CFI，尝试从当前页面位置获取
      if (!paragraphCfi && currentCfi) {
        paragraphCfi = currentCfi;
      }
      
      // 计算TTS进度（基于段落索引）
      const totalParagraphs = ttsCurrentParagraphsRef.current.length;
      const ttsProgress = totalParagraphs > 0 
        ? Math.min(1, Math.max(0, (ttsCurrentIndexRef.current + 1) / totalParagraphs))
        : 0;
      
      const ttsProgressData = {
        currentCfi: currentCfi || undefined,
        currentParagraphIndex: ttsCurrentIndexRef.current,
        currentParagraphCfi: paragraphCfi || undefined,
        progress: ttsProgress,
        timestamp: Date.now(),
      };
      
      ttsProgressRef.current = ttsProgressData;
      
      // 保存到localStorage（使用独立的key）
      const storageKey = `tts-progress-${book.id}`;
      localStorage.setItem(storageKey, JSON.stringify(ttsProgressData));
      
      console.log('[TTS] 保存TTS进度:', {
        paragraphIndex: ttsCurrentIndexRef.current,
        totalParagraphs: totalParagraphs,
        progress: ttsProgress,
        paragraphCfi: paragraphCfi ? paragraphCfi.substring(0, 50) + '...' : 'null',
      });
    } catch (e) {
      console.warn('[TTS] 保存TTS进度失败:', e);
    }
  }, [book.id]);
  
  // 保存阅读进度（独立于TTS进度）
  const saveReadingProgress = useCallback((location: any, source: string = 'unknown') => {
    // 如果处于书签浏览模式，不保存阅读进度（保持原阅读进度不变）
    if ((window as any).__isBookmarkBrowsingMode === true) {
      return;
    }
    
    // 如果正在播放TTS，不更新阅读进度（TTS播放时的翻页会单独调用）
    // 但手动翻页时应该更新阅读进度
    if (ttsIsPlayingRef.current && source !== 'manual_page_turn' && source !== 'tts_page_turn' && source !== 'relocated_event') {
      return;
    }
    
    try {
      const bookInstance = epubjsBookRef.current;
      if (!bookInstance || !location) return;
      
      const spineIndex = location?.start?.index ?? 0;
      const cfi = location?.start?.cfi;
      const chapterCurrentPage = location?.start?.displayed?.page || 1;
      const chapterTotalPages = location?.start?.displayed?.total || 1;
      
      // 计算进度（使用totalChaptersRef）
      let totalChapters = totalChaptersRef.current;
      const withinChapter =
        typeof chapterTotalPages === 'number' &&
        chapterTotalPages > 1 &&
        typeof chapterCurrentPage === 'number' &&
        chapterCurrentPage >= 1
          ? Math.min(1, Math.max(0, (chapterCurrentPage - 1) / chapterTotalPages))
          : 0;
      
      // 如果totalChapters无效，尝试从spine重新计算
      if (totalChapters <= 0 && bookInstance?.spine && spineIndex >= 0) {
        try {
          const spine = bookInstance.spine;
          const spineItems = (spine as any).items || [];
          if (spineItems.length > 0) {
            totalChapters = spineItems.length;
            totalChaptersRef.current = totalChapters;
          } else {
            // 尝试通过遍历获取
            let maxIndex = -1;
            try {
              spine.each((item: any) => {
                if (item.index !== undefined && item.index > maxIndex) {
                  maxIndex = item.index;
                }
              });
              if (maxIndex >= 0) {
                totalChapters = maxIndex + 1;
                totalChaptersRef.current = totalChapters;
              }
            } catch (e) {
              // 遍历失败
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
      
      let progress = 0;
      const percentage = location.start?.percentage;
      if (percentage !== undefined && percentage !== null && !isNaN(percentage) && percentage > 0) {
        // 优先使用epubjs提供的percentage（这是全书进度）
        progress = Math.min(1, Math.max(0, percentage));
      } else if (totalChapters > 0 && spineIndex >= 0) {
        // 使用章节索引和章节内进度计算全书进度
        const denom = totalChapters;
        progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / denom));
      } else if (spineIndex >= 0) {
        // 如果无法获取总章节数，但至少知道当前章节索引，使用spineIndex+1作为估算分母
        // 这样可以避免使用纯章节内进度，至少能反映章节在全书中的大致位置
        const estimatedTotal = Math.max(spineIndex + 1, 1);
        progress = Math.min(1, Math.max(0, (spineIndex + withinChapter) / estimatedTotal));
      } else {
        // 完全无法获取章节信息时，才使用章节内进度作为最后兜底
        // 但这种情况应该很少见
        progress = Math.min(1, Math.max(0, withinChapter));
      }
      
      // 使用 locations 计算稳定的页码（如果可用）
      let finalCurrentPage = chapterCurrentPage;
      let finalTotalPages = chapterTotalPages;
      let finalProgress = progress;
      
      if (
        locationsReadyRef.current &&
        bookInstance?.locations &&
        typeof bookInstance.locations.locationFromCfi === 'function' &&
        typeof bookInstance.locations.length === 'function' &&
        typeof cfi === 'string' &&
        cfi.startsWith('epubcfi(')
      ) {
        try {
          const loc = bookInstance.locations.locationFromCfi(cfi);
          const total = bookInstance.locations.length();
          if (typeof loc === 'number' && loc >= 0 && typeof total === 'number' && total > 0) {
            finalCurrentPage = loc + 1;
            finalTotalPages = total;
            finalProgress = Math.min(1, Math.max(0, (loc + 1) / total));
          }
        } catch (e) {
          // 忽略错误，使用章节内页码
        }
      }
      
      // 获取章节标题
      let chapterTitle = '';
      try {
        const navigation = bookInstance.navigation;
        const tocItems = navigation?.toc || [];
        const tocItem = tocItems.find((item: any) => {
          try {
            const spineItem = bookInstance.spine.get(item.href);
            return spineItem && spineItem.index === spineIndex;
          } catch (e) {
            return false;
          }
        });
        if (tocItem) {
          chapterTitle = tocItem.label || '';
        }
      } catch (e) {
        // 忽略错误
      }
      
      const position: ReadingPosition = {
        chapterIndex: spineIndex,
        currentPage: finalCurrentPage,
        totalPages: finalTotalPages,
        progress: finalProgress,
        currentLocation: cfi || undefined,
        chapterTitle: chapterTitle || undefined,
      };
      
      // 如果处于书签浏览模式，不更新 lastPositionRef（保持原阅读位置）
      const isBookmarkBrowsing = (window as any).__isBookmarkBrowsingMode === true;
      if (!isBookmarkBrowsing) {
        // 更新本地引用
        lastProgressRef.current = finalProgress;
        lastPositionRef.current = position;
        if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
          lastCfiRef.current = cfi;
        }
      }
      
      // 更新最后保存的进度信息（用于防抖，但saveReadingProgress不直接使用，因为relocated事件有自己的防抖逻辑）
      
      console.log('[ReaderEPUBPro] [保存阅读进度]', {
        source: source,
        cfi: cfi ? cfi.substring(0, 50) + '...' : 'null',
        progress: finalProgress,
        currentPage: finalCurrentPage,
        totalPages: finalTotalPages,
        chapterIndex: spineIndex,
        isTTSPlaying: ttsIsPlayingRef.current,
      });
      
      // 调用外部回调保存阅读进度
      onProgressChange(finalProgress, position);
    } catch (e) {
      console.warn('[ReaderEPUBPro] 保存阅读进度失败:', e);
    }
  }, [onProgressChange]);
  
  // 全局播放状态管理：确保整个系统只有一个播放进程
  // 使用全局变量存储当前播放实例的引用
  if (typeof window !== 'undefined' && !(window as any).__globalTTSInstances) {
    (window as any).__globalTTSInstances = new Set();
  }
  const globalTTSInstances = (window as any).__globalTTSInstances as Set<any>;

  // 按句号、分号等分割文本为句子
  const splitIntoSentences = useCallback((text: string): string[] => {
    if (!text || !text.trim()) return [];
    
    // 使用正则表达式分割：句号、问号、感叹号、分号、换行符
    // 保留标点符号在句子末尾
    const sentences = text
      .split(/([。！？；\n]+)/)
      .filter(s => s.trim().length > 0)
      .reduce((acc: string[], curr, index, array) => {
        // 如果当前是标点符号，合并到前一个句子
        if (/^[。！？；\n]+$/.test(curr) && acc.length > 0) {
          acc[acc.length - 1] += curr;
        } else {
          // 如果下一个是标点符号，先不添加，等下一轮合并
          if (index < array.length - 1 && /^[。！？；\n]+$/.test(array[index + 1])) {
            acc.push(curr);
          } else if (!/^[。！？；\n]+$/.test(curr)) {
            acc.push(curr);
          }
        }
        return acc;
      }, [])
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return sentences;
  }, []);

  // 提取文本的段落（按双换行符或段落标签分割）
  const extractParagraphs = useCallback((text: string, location?: any): Array<{ text: string; cfi?: string; startCfi?: string; endCfi?: string }> => {
    if (!text || !text.trim()) return [];
    
    // 按双换行符、段落标签等分割段落
    // 保留段落之间的分隔符，包括空段落（空行）
    const rawParagraphs = text
      .split(/(\n\s*\n+|<p[^>]*>|<\/p>)/)
      .map(p => p.trim())
      .filter(p => !/^<p[^>]*>$/.test(p) && !/^<\/p>$/.test(p));
    
    const paragraphs = rawParagraphs.map(p => {
      // 移除HTML标签（如果有）
      const cleanText = p.replace(/<[^>]+>/g, '').trim();
      return cleanText;
    });
    
    // 保留所有段落，包括空段落（空行），让播放逻辑决定是否跳过
    // 这样不会因为过滤空段落而导致段落索引错乱
    
    // 如果没有找到段落分隔符，尝试按单换行符分割（但合并短行）
    if (paragraphs.length === 0 || (paragraphs.length === 1 && paragraphs[0] === text.trim())) {
      const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
      const mergedParagraphs: string[] = [];
      let currentParagraph = '';
      
      for (const line of lines) {
        // 如果当前段落为空，直接添加
        if (!currentParagraph) {
          currentParagraph = line;
        } else {
          // 如果行很短（可能是标题或单独的行），作为新段落
          if (line.length < 20 && /^[^\u4e00-\u9fa5]/.test(line)) {
            if (currentParagraph) {
              mergedParagraphs.push(currentParagraph);
              currentParagraph = line;
            }
          } else {
            // 否则合并到当前段落
            currentParagraph += '\n' + line;
          }
        }
      }
      
      if (currentParagraph) {
        mergedParagraphs.push(currentParagraph);
      }
      
      return mergedParagraphs.map(p => ({ text: p }));
    }
    
    return paragraphs.map(p => ({ text: p }));
  }, []);

  // 生成文本内容的hash（用于去重）
  const generateTextHash = useCallback((text: string): string => {
    // 简单的hash函数，基于文本内容
    let hash = 0;
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    for (let i = 0; i < normalizedText.length; i++) {
      const char = normalizedText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }, []);

      // 获取下一页文本内容
      const getNextPageText = useCallback(async (): Promise<string> => {
        try {
          const rendition = epubjsRenditionRef.current;
          if (!rendition) return '';

          // 获取当前页面的结束 CFI
          const currentLocation = rendition.currentLocation?.();
          if (!currentLocation) return '';

          const endCfi = (currentLocation as any).end?.cfi || (currentLocation as any).start?.cfi;
          if (!endCfi || typeof endCfi !== 'string' || !endCfi.startsWith('epubcfi(')) {
            return '';
          }

          // 尝试翻到下一页
          const nextLocation = await rendition.next();
          if (!nextLocation) return '';

          // 获取下一页的文本（使用 ref 中的函数）
          const getCurrentPageTextFn = getCurrentPageTextRef.current;
          const nextPageText = getCurrentPageTextFn ? getCurrentPageTextFn(nextLocation) : '';
          
          // 返回上一页
          await rendition.prev();

          return nextPageText || '';
        } catch (e) {
          console.warn('获取下一页文本失败:', e);
          return '';
        }
      }, []);

      // 预加载下一页的音频
      const preloadNextPageAudio = useCallback(async (nextPageText: string, settings: ReadingSettings) => {
        if (!nextPageText || !nextPageText.trim()) return;

        try {
          const sentences = splitIntoSentences(nextPageText);
          if (sentences.length === 0) return;

      // 获取TTS配置（从 settings 对象中获取，可能不存在于类型定义中）
      const settingsAny = settings as any;
      const model = settingsAny.tts_default_model?.value || 'edge';
      const voice = settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
      // 预加载时使用系统设置中的速度，默认1.0倍速
      const generateSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
      const autoRole = settingsAny.tts_auto_role?.value === 'true';

      // 获取认证token
      const token = localStorage.getItem('auth-storage');
      let authToken = '';
      if (token) {
        try {
          const parsed = JSON.parse(token);
          // Zustand persist stores state directly, but may also have a 'state' wrapper
          authToken = parsed.state?.token || parsed.token || '';
        } catch (e) {
          // ignore
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // 预加载前3个句子（避免预加载太多）
      const preloadCount = Math.min(3, sentences.length);
      for (let i = 0; i < preloadCount; i++) {
        const sentence = sentences[i];
        const cacheKey = `next_${i}_${sentence.substring(0, 20)}`;

        // 如果已经缓存，跳过
        if (ttsNextPageAudioCacheRef.current.has(cacheKey)) {
          continue;
        }

        // 验证句子不为空
        const sentenceTrimmed = sentence?.trim() || '';
        if (!sentenceTrimmed || sentenceTrimmed.length === 0) {
          console.warn(`[TTS] 跳过空句子预加载: 索引 ${i}`);
          continue;
        }
        
        try {
          // 生成音频
          const synthesizeUrl = getFullApiUrl('/tts/synthesize');
          const synthesizeResponse = await fetch(synthesizeUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              bookId: book.id,
              chapterId: '0',
              paragraphId: `next_page_${i}`,
              text: sentenceTrimmed, // 使用验证后的文本
              speed: generateSpeed, // 生成时使用默认速度
              model,
              voice,
              autoRole,
            }),
          });

          if (synthesizeResponse.ok) {
            // 获取音频（生成时使用默认速度）
            const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(book.id)}&chapterId=0&paragraphId=${encodeURIComponent(`next_page_${i}`)}&speed=${generateSpeed}&model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}&autoRole=${autoRole ? 'true' : 'false'}`);
            const audioResponse = await fetch(audioUrl, { headers });

            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const audioObjectUrl = URL.createObjectURL(audioBlob);
              ttsNextPageAudioCacheRef.current.set(cacheKey, audioObjectUrl);
              // 预加载下一页音频完成
            }
          }
        } catch (e) {
          console.warn(`[TTS] 预加载下一页音频 ${i + 1} 失败:`, e);
        }
      }
    } catch (e) {
      console.warn('[TTS] 预加载下一页音频失败:', e);
    }
  }, [book.id, splitIntoSentences]);

  // 清除所有高亮
  const clearHighlight = useCallback(() => {
    try {
      // 清除 ref 中的高亮元素
      if (ttsHighlightRef.current) {
        const el = ttsHighlightRef.current;
        // 只清除下划线样式，不影响布局
        el.style.textDecoration = '';
        el.style.textDecorationColor = '';
        el.style.textDecorationThickness = '';
        el.style.textUnderlineOffset = '';
        // 移除可能添加的类名
        el.classList.remove('tts-highlight');
        ttsHighlightRef.current = null;
      }
      
      // 额外清除：遍历 iframe 中的所有元素，清除可能遗留的高亮
      const iframe = containerRef.current?.querySelector('iframe');
      if (iframe) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          // 查找所有带有 TTS 高亮类名的元素
          const highlightedElements = iframeDoc.querySelectorAll('.tts-highlight');
          highlightedElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.textDecoration = '';
            htmlEl.style.textDecorationColor = '';
            htmlEl.style.textDecorationThickness = '';
            htmlEl.style.textUnderlineOffset = '';
            htmlEl.classList.remove('tts-highlight');
          });
          
          // 也清除可能通过内联样式添加的高亮（兼容旧代码）
          const inlineHighlighted = iframeDoc.querySelectorAll('[style*="text-decoration: underline"]');
          inlineHighlighted.forEach((el) => {
            const htmlEl = el as HTMLElement;
            // 检查是否是TTS高亮（有下划线样式）
            if (htmlEl.classList.contains('tts-highlight')) {
              htmlEl.style.textDecoration = '';
              htmlEl.style.textDecorationColor = '';
              htmlEl.style.textDecorationThickness = '';
              htmlEl.style.textUnderlineOffset = '';
              htmlEl.classList.remove('tts-highlight');
            }
          });
        }
      }
    } catch (e) {
      console.warn('[TTS] 清除高亮失败:', e);
    }
  }, []);

  // 高亮显示文本段落（异步，不阻塞播放）
  const highlightParagraph = useCallback((text: string, cfi?: string) => {
    // 异步执行，不阻塞播放流程
    (async () => {
      try {
        // 先清除之前的高亮
        clearHighlight();
        
        // 等待一小段时间确保清除完成
        await new Promise(resolve => setTimeout(resolve, 50));
        const iframe = containerRef.current?.querySelector('iframe');
        if (!iframe) return;
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        // 如果有CFI，使用CFI定位
        if (cfi) {
          const rendition = epubjsRenditionRef.current;
          if (rendition) {
            try {
              const range = (rendition as any).getRange?.(cfi);
              if (range) {
                const element = range.commonAncestorContainer;
                let highlightElement: HTMLElement | null = null;
                
                if (element.nodeType === Node.TEXT_NODE && element.parentElement) {
                  highlightElement = element.parentElement as HTMLElement;
                } else if (element.nodeType === Node.ELEMENT_NODE) {
                  highlightElement = element as HTMLElement;
                }
                
                if (highlightElement) {
                  // 只使用下划线高亮，不影响布局
                  const underlineColor = settingsRef.current.theme === 'dark' ? '#4a9eff' : '#1890ff';
                  highlightElement.style.textDecoration = 'underline';
                  highlightElement.style.textDecorationColor = underlineColor;
                  highlightElement.style.textDecorationThickness = '2px';
                  highlightElement.style.textUnderlineOffset = '2px';
                  highlightElement.classList.add('tts-highlight');
                  // 不调用 scrollIntoView，避免内容偏移
                  // 使用更温和的方式：只在元素完全不可见时才滚动，且使用 scrollTo 而不是 scrollIntoView
                  const rect = highlightElement.getBoundingClientRect();
                  const container = iframe?.contentWindow || window;
                  const containerHeight = container.innerHeight || window.innerHeight;
                  const containerWidth = container.innerWidth || window.innerWidth;
                  
                  // 只在元素完全不可见时才滚动，且使用更温和的方式避免布局偏移
                  if (rect.bottom < 0 || rect.top > containerHeight || rect.right < 0 || rect.left > containerWidth) {
                    // 元素不可见，使用 scrollTo 而不是 scrollIntoView，避免布局偏移
                    requestAnimationFrame(() => {
                      try {
                        const scrollContainer = iframe?.contentWindow || iframe?.contentDocument?.defaultView || window;
                        if (scrollContainer) {
                          // 获取当前滚动位置
                          const scrollY = scrollContainer.scrollY || scrollContainer.pageYOffset || 0;
                          const scrollX = scrollContainer.scrollX || scrollContainer.pageXOffset || 0;
                          
                          // 计算元素在文档中的绝对位置
                          const elementTop = rect.top + scrollY;
                          const elementLeft = rect.left + scrollX;
                          
                          // 计算滚动到中心的位置
                          const centerY = elementTop - containerHeight / 2 + rect.height / 2;
                          const centerX = elementLeft - containerWidth / 2 + rect.width / 2;
                          
                          scrollContainer.scrollTo({
                            top: Math.max(0, centerY),
                            left: Math.max(0, centerX),
                            behavior: 'smooth'
                          });
                        }
                      } catch (e) {
                        // 如果 scrollTo 失败，不执行任何滚动操作，避免布局偏移
                        console.warn('[TTS] 滚动失败，但不影响播放:', e);
                      }
                    });
                  }
                  ttsHighlightRef.current = highlightElement;
                  return;
                }
              }
            } catch (e) {
              console.warn('[TTS] 使用CFI高亮失败:', e);
            }
          }
        }

        // 如果没有CFI或CFI失败，尝试通过文本内容匹配
        // 使用更精确的匹配：先找到包含文本开头的节点，然后高亮其父元素
        // 规范化文本：移除所有空白字符（包括空格、换行、制表符等），只保留实际文本
        const normalizeText = (str: string) => str.replace(/\s+/g, '').trim();
        const normalizedText = normalizeText(text);
        
        // 如果文本太短，直接返回
        if (normalizedText.length < 5) {
          console.warn('[TTS] 文本太短，无法匹配:', normalizedText);
          return;
        }
        
        // 使用多个搜索策略：从长到短尝试匹配
        const searchLengths = [
          Math.min(100, normalizedText.length), // 长匹配
          Math.min(50, normalizedText.length),  // 中匹配
          Math.min(30, normalizedText.length),  // 短匹配
          Math.min(20, normalizedText.length),  // 更短匹配
        ];
        
        const walker = iframeDoc.createTreeWalker(
          iframeDoc.body || iframeDoc.documentElement,
          NodeFilter.SHOW_TEXT,
          null
        );

        let node: Node | null = null;
        let bestMatch: HTMLElement | null = null;
        let bestMatchScore = 0;
        let bestMatchLength = 0;

        while ((node = walker.nextNode())) {
          if (node.textContent) {
            const nodeText = normalizeText(node.textContent);
            if (nodeText.length < 5) continue; // 跳过太短的文本节点
            
            // 尝试不同长度的匹配
            for (const searchLength of searchLengths) {
              if (searchLength < 10) break; // 搜索长度太短，跳过
              
              const searchPrefix = normalizedText.substring(0, searchLength);
              
              // 检查节点文本是否以搜索前缀开头（精确匹配开头）
              if (nodeText.startsWith(searchPrefix)) {
                const parent = node.parentElement;
                if (parent) {
                  // 计算匹配度：匹配长度越长，匹配度越高
                  const matchScore = searchLength + (searchLength / normalizedText.length) * 10;
                  if (matchScore > bestMatchScore || (matchScore === bestMatchScore && searchLength > bestMatchLength)) {
                    bestMatch = parent;
                    bestMatchScore = matchScore;
                    bestMatchLength = searchLength;
                  }
                }
                break; // 找到匹配就跳出循环，使用更长的匹配
              }
              
              // 如果精确开头匹配失败，尝试包含匹配（但分数较低）
              if (nodeText.includes(searchPrefix) && searchLength >= 20) {
                const parent = node.parentElement;
                if (parent && !bestMatch) {
                  // 包含匹配的分数较低
                  const matchScore = searchLength * 0.5;
                  if (matchScore > bestMatchScore) {
                    bestMatch = parent;
                    bestMatchScore = matchScore;
                    bestMatchLength = searchLength;
                  }
                }
              }
            }
          }
        }

        if (bestMatch) {
          // 只使用下划线高亮，不影响布局
          const underlineColor = settingsRef.current.theme === 'dark' ? '#4a9eff' : '#1890ff';
          bestMatch.style.textDecoration = 'underline';
          bestMatch.style.textDecorationColor = underlineColor;
          bestMatch.style.textDecorationThickness = '2px';
          bestMatch.style.textUnderlineOffset = '2px';
          bestMatch.classList.add('tts-highlight');
          // 不调用 scrollIntoView，避免内容偏移
          // 使用更温和的方式：只在元素完全不可见时才滚动，且使用 scrollTo 而不是 scrollIntoView
          const rect = bestMatch.getBoundingClientRect();
          const container = iframe?.contentWindow || window;
          const containerHeight = container.innerHeight || window.innerHeight;
          const containerWidth = container.innerWidth || window.innerWidth;
          
          // 只在元素完全不可见时才滚动，且使用更温和的方式避免布局偏移
          if (rect.bottom < 0 || rect.top > containerHeight || rect.right < 0 || rect.left > containerWidth) {
            // 元素不可见，使用 scrollTo 而不是 scrollIntoView，避免布局偏移
            requestAnimationFrame(() => {
              try {
                const scrollContainer = iframe?.contentWindow || iframe?.contentDocument?.defaultView || window;
                if (scrollContainer) {
                  // 获取当前滚动位置
                  const scrollY = scrollContainer.scrollY || scrollContainer.pageYOffset || 0;
                  const scrollX = scrollContainer.scrollX || scrollContainer.pageXOffset || 0;
                  
                  // 计算元素在文档中的绝对位置
                  const elementTop = rect.top + scrollY;
                  const elementLeft = rect.left + scrollX;
                  
                  // 计算滚动到中心的位置
                  const centerY = elementTop - containerHeight / 2 + rect.height / 2;
                  const centerX = elementLeft - containerWidth / 2 + rect.width / 2;
                  
                  scrollContainer.scrollTo({
                    top: Math.max(0, centerY),
                    left: Math.max(0, centerX),
                    behavior: 'smooth'
                  });
                }
              } catch (e) {
                // 如果 scrollTo 失败，不执行任何滚动操作，避免布局偏移
                console.warn('[TTS] 滚动失败，但不影响播放:', e);
              }
            });
          }
          ttsHighlightRef.current = bestMatch;
          return;
        }
        
        // 如果找不到匹配的文本，但有CFI，尝试使用CFI跳转并重新尝试
        if (cfi) {
          const displayText = normalizedText.length > 30 ? normalizedText.substring(0, 30) + '...' : normalizedText;
          console.warn(`[TTS] 未找到匹配的段落文本，尝试使用CFI跳转: "${displayText}"`);
          try {
            const rendition = epubjsRenditionRef.current;
            if (rendition) {
              // 先跳转到CFI位置
              await jumpToCfi(cfi);
              // 等待页面加载
              await new Promise(resolve => setTimeout(resolve, 500));
              // 重新尝试使用CFI高亮
              try {
                const range = (rendition as any).getRange?.(cfi);
                if (range) {
                  const element = range.commonAncestorContainer;
                  let highlightElement: HTMLElement | null = null;
                  
                  if (element.nodeType === Node.TEXT_NODE && element.parentElement) {
                    highlightElement = element.parentElement as HTMLElement;
                  } else if (element.nodeType === Node.ELEMENT_NODE) {
                    highlightElement = element as HTMLElement;
                  }
                  
                  if (highlightElement) {
                    const underlineColor = settingsRef.current.theme === 'dark' ? '#4a9eff' : '#1890ff';
                    highlightElement.style.textDecoration = 'underline';
                    highlightElement.style.textDecorationColor = underlineColor;
                    highlightElement.style.textDecorationThickness = '2px';
                    highlightElement.style.textUnderlineOffset = '2px';
                    highlightElement.classList.add('tts-highlight');
                    ttsHighlightRef.current = highlightElement;
                    console.log('[TTS] 通过CFI跳转成功定位并高亮段落');
                    return;
                  }
                }
              } catch (e) {
                console.warn('[TTS] CFI跳转后高亮失败:', e);
              }
            }
          } catch (e) {
            console.warn('[TTS] CFI跳转失败:', e);
          }
        }
        
        const displayText = normalizedText.length > 30 ? normalizedText.substring(0, 30) + '...' : normalizedText;
        console.warn(`[TTS] 未找到匹配的段落文本: "${displayText}"`);
        // 即使找不到匹配，也不影响播放继续，只是不显示高亮
      } catch (e) {
        console.warn('[TTS] 高亮段落失败:', e);
        // 高亮失败不影响播放继续
      }
    })();
  }, [clearHighlight]);

  // 跳转到指定CFI位置
  const jumpToCfi = useCallback((cfi: string) => {
    try {
      const rendition = epubjsRenditionRef.current;
      if (rendition && cfi) {
        rendition.display(cfi);
      }
    } catch (e) {
      console.warn('[TTS] 跳转到CFI失败:', e);
    }
  }, []);

  // 播放单个段落
  const playParagraph = useCallback(async (
    paragraph: { text: string; cfi?: string; startCfi?: string; endCfi?: string },
    paragraphIndex: number,
    totalParagraphs: number,
    settings: ReadingSettings
  ): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      // 检查是否已停止
      if (!ttsIsPlayingRef.current) {
        resolve();
        return;
      }

      // 先清除之前的高亮（确保每次播放新段落时都能正确高亮）
      clearHighlight();
      
      // 生成段落hash用于去重
      const paragraphHash = generateTextHash(paragraph.text);
      const paragraphTextTrimmed = paragraph.text.trim();
      
      // 检查段落是否为空（只包含空白字符）
      if (!paragraphTextTrimmed || paragraphTextTrimmed.length === 0) {
        // 空段落，跳过播放但更新索引
        ttsCurrentIndexRef.current = paragraphIndex;
        // 通知外部更新进度（避免跳段显示）
        if ((window as any).__onTTSStateChange) {
          (window as any).__onTTSStateChange({
            currentIndex: paragraphIndex,
            totalParagraphs: totalParagraphs,
          });
        }
        resolve();
        return;
      }
      
      // 检查是否与上一个播放的内容相同
      if (ttsLastPlayedTextRef.current === paragraphTextTrimmed) {
        // 段落与上一个播放内容相同，跳过播放但更新索引
        ttsCurrentIndexRef.current = paragraphIndex;
        // 通知外部更新进度（避免跳段显示）
        if ((window as any).__onTTSStateChange) {
          (window as any).__onTTSStateChange({
            currentIndex: paragraphIndex,
            totalParagraphs: totalParagraphs,
          });
        }
        resolve();
        return;
      }
      
      // 检查是否已经生成过这个段落的TTS
      if (ttsParagraphCacheRef.current.has(paragraphHash)) {
        // 段落已生成，跳过重复生成
      } else {
        ttsParagraphCacheRef.current.add(paragraphHash);
      }
      
      // 更新上一个播放的文本
      ttsLastPlayedTextRef.current = paragraphTextTrimmed;

      // 等待一小段时间确保清除完成，然后高亮当前段落
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Console输出当前播放的文字内容（在播放前输出，方便调试）
      // 高亮显示当前段落
      // 优先使用 startCfi，如果没有则使用 cfi
      const cfiToUse = paragraph.startCfi || paragraph.cfi;
      
      // 如果段落有CFI，先检查是否在当前页，如果不在则先跳转
      if (cfiToUse) {
        try {
          const rendition = epubjsRenditionRef.current;
          if (rendition) {
            const currentLocation = rendition.currentLocation?.() as any;
            const currentCfi = currentLocation?.start?.cfi;
            
            // 添加调试日志
            console.log('[TTS] [playParagraph] 检查段落CFI:', {
              paragraphIndex: paragraphIndex,
              paragraphText: paragraphTextTrimmed.substring(0, 30) + '...',
              cfiToUse: cfiToUse ? cfiToUse.substring(0, 50) + '...' : 'null',
              currentCfi: currentCfi ? currentCfi.substring(0, 50) + '...' : 'null',
              needJump: currentCfi && cfiToUse !== currentCfi && !cfiToUse.startsWith(currentCfi.substring(0, Math.min(30, currentCfi.length))),
            });
            
            // 检查CFI是否在当前页
            // 注意：如果刚刚翻页（在 playParagraphAtIndex 中），currentCfi 可能还没更新
            // 所以我们需要更智能的判断：只有在 CFI 明显不在当前页时才跳转
            
            // 等待一小段时间，确保翻页后的位置已更新
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // 重新获取当前位置（翻页后可能已更新）
            const updatedLocation = rendition.currentLocation?.() as any;
            const updatedCurrentCfi = updatedLocation?.start?.cfi;
            
            // 检查CFI是否匹配
            const cfiPrefixMatch = updatedCurrentCfi && cfiToUse.startsWith(updatedCurrentCfi.substring(0, Math.min(30, updatedCurrentCfi.length)));
            const cfiExactMatch = updatedCurrentCfi === cfiToUse;
            
            // 如果CFI不匹配且不是前缀匹配，说明不在当前页，需要跳转
            // 但是，如果刚刚翻页，段落的 CFI 应该已经更新为新页面的 CFI
            // 如果段落的 CFI 还是旧页面的，说明分配有问题，不应该跳转
            if (updatedCurrentCfi && !cfiExactMatch && !cfiPrefixMatch) {
              // 检查是否是跨章节的情况（通过比较 CFI 的前缀）
              const currentCfiPrefix = updatedCurrentCfi.substring(0, Math.min(50, updatedCurrentCfi.length));
              const targetCfiPrefix = cfiToUse.substring(0, Math.min(50, cfiToUse.length));
              
              // 提取章节路径（CFI中!之前的部分）
              const getChapterPath = (cfi: string) => cfi.split('!')[0];
              const currentChapterPath = getChapterPath(updatedCurrentCfi);
              const targetChapterPath = getChapterPath(cfiToUse);
              
              // 如果 CFI 前缀差异很大（不是同一章节），才跳转
              // 如果只是同一章节内的不同位置，可能是翻页后的正常情况，不跳转
              const isDifferentChapter = currentChapterPath !== targetChapterPath;
              
              // 额外检查：如果段落的 CFI 看起来像是起始页面的 CFI（比如索引很小），可能是分配错误
              // 这种情况下不应该跳转，而是继续在当前页播放
              // 但如果当前CFI和段落CFI在同一章节，且段落索引大于当前索引，说明是向前翻页，不应该跳转
              const looksLikeStartPage = targetCfiPrefix.includes('/2') || targetCfiPrefix.includes('/4/2');
              
              // 如果当前章节路径和段落章节路径相同，说明在同一章节，不应该跳转（可能是翻页后的正常情况）
              const isSameChapter = currentChapterPath === targetChapterPath;
              
              if (isDifferentChapter && !looksLikeStartPage && !isSameChapter) {
                console.log('[TTS] [playParagraph] ⚠️ 段落CFI不在当前页，跳转到CFI:', {
                  currentCfi: currentCfiPrefix,
                  targetCfi: targetCfiPrefix,
                  note: '跨章节跳转'
                });
                // 段落不在当前页，先跳转到CFI
                await jumpToCfi(cfiToUse);
                // 等待页面加载
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 跳转后保存阅读进度（TTS播放时的翻页要记录到阅读进度）
                try {
                  const newLocation = rendition.currentLocation?.() as any;
                  if (newLocation) {
                    saveReadingProgress(newLocation, 'tts_cfi_jump');
                  }
                } catch (e) {
                  console.warn('[TTS] 保存CFI跳转后阅读进度失败:', e);
                }
              } else {
                if (looksLikeStartPage) {
                  console.log('[TTS] [playParagraph] ⚠️ 段落CFI看起来像起始页面，可能是分配错误，不跳转:', {
                    targetCfi: targetCfiPrefix,
                    note: '继续在当前页播放，通过文本匹配高亮'
                  });
                } else {
                  console.log('[TTS] [playParagraph] ✅ 段落CFI在同一章节，不跳转（翻页后的正常情况）');
                }
              }
            } else {
              console.log('[TTS] [playParagraph] ✅ 段落CFI在当前页，不需要跳转');
            }
          }
        } catch (e) {
          console.warn('[TTS] 跳转到段落CFI失败:', e);
        }
      }
      
      // 高亮段落（如果CFI跳转成功，会在正确的位置高亮）
      // 即使高亮失败，也不影响播放继续
      try {
        highlightParagraph(paragraph.text, cfiToUse);
      } catch (e) {
        console.warn('[TTS] 高亮段落失败，但继续播放:', e);
      }

      // Console输出已在上面完成

      // 获取TTS配置（从 settings 对象中获取，可能不存在于类型定义中）
      const settingsAny = settings as any;
      const model = settingsAny.tts_default_model?.value || 'edge';
      const voice = settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
      // 生成TTS时使用系统设置中的速度，默认1.0倍速
      const generateSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
      // 播放速度从设置中获取，用于 audio.playbackRate（与生成速度相同）
      const playbackSpeed = generateSpeed;
      const autoRole = settingsAny.tts_auto_role?.value === 'true';

      // 获取认证token
      const token = localStorage.getItem('auth-storage');
      let authToken = '';
      if (token) {
        try {
          const parsed = JSON.parse(token);
          // Zustand persist stores state directly, but may also have a 'state' wrapper
          authToken = parsed.state?.token || parsed.token || '';
        } catch (e) {
          // ignore
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // 使用段落hash作为paragraphId，确保去重
      const paragraphId = `para_${paragraphHash}`;
      // 使用段落hash作为缓存键，与预生成保持一致（不依赖索引）
      const cacheKey = `para_${paragraphHash}`;
      let audioObjectUrl = ttsNextPageAudioCacheRef.current.get(cacheKey);
      
      // 如果缓存中有 URL，先验证它是否仍然有效
      if (audioObjectUrl) {
        // 验证缓存的 blob URL 是否仍然有效
        const verifyBlobUrl = async (url: string): Promise<boolean> => {
          return new Promise((resolve) => {
            const testAudio = new Audio(url);
            testAudio.preload = 'auto';
            
            const timeout = setTimeout(() => {
              testAudio.removeEventListener('canplaythrough', onSuccess);
              testAudio.removeEventListener('error', onError);
              resolve(false);
            }, 2000);
            
            const onSuccess = () => {
              clearTimeout(timeout);
              testAudio.removeEventListener('canplaythrough', onSuccess);
              testAudio.removeEventListener('error', onError);
              resolve(true);
            };
            
            const onError = () => {
              clearTimeout(timeout);
              testAudio.removeEventListener('canplaythrough', onSuccess);
              testAudio.removeEventListener('error', onError);
              resolve(false);
            };
            
            testAudio.addEventListener('canplaythrough', onSuccess, { once: true });
            testAudio.addEventListener('error', onError, { once: true });
            
            // 尝试加载
            testAudio.load();
          });
        };
        
        // 验证 blob URL 是否有效
        const isValid = await verifyBlobUrl(audioObjectUrl);
        if (!isValid) {
          // blob URL 失效，清除缓存
          console.warn(`[TTS] 缓存的音频 URL 已失效，清除缓存: ${cacheKey}`);
          ttsNextPageAudioCacheRef.current.delete(cacheKey);
          try {
            URL.revokeObjectURL(audioObjectUrl);
          } catch (err) {
            // ignore
          }
          audioObjectUrl = undefined;
        }
      }

      if (!audioObjectUrl) {
        // 检查是否与上一个生成的内容相同
        if (ttsLastGeneratedTextRef.current === paragraphTextTrimmed) {
          // 段落与上一个生成内容相同，跳过生成
          resolve();
          return;
        }
        
        // 更新上一个生成的文本
        ttsLastGeneratedTextRef.current = paragraphTextTrimmed;
        
        // 验证文本不为空
        const textToSend = paragraph.text?.trim() || '';
        if (!textToSend || textToSend.length === 0) {
          console.warn('[TTS] 跳过空段落音频生成');
          resolve();
          return;
        }
        
        // 生成音频
        const synthesizeUrl = getFullApiUrl('/tts/synthesize');
        fetch(synthesizeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bookId: book.id,
            chapterId: '0',
            paragraphId,
            text: textToSend, // 使用验证后的文本
            speed: generateSpeed, // 生成时使用默认速度
            model,
            voice,
            autoRole,
          }),
        })
          .then((synthesizeResponse) => {
            if (!synthesizeResponse.ok) {
              throw new Error(`生成音频失败: HTTP ${synthesizeResponse.status}`);
            }

            // 获取音频（生成时使用默认速度）
            const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(book.id)}&chapterId=0&paragraphId=${encodeURIComponent(paragraphId)}&speed=${generateSpeed}&model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}&autoRole=${autoRole ? 'true' : 'false'}`);
            return fetch(audioUrl, { headers });
          })
          .then((audioResponse) => {
            if (!audioResponse.ok) {
              throw new Error(`获取音频失败: HTTP ${audioResponse.status}`);
            }
            return audioResponse.blob();
          })
          .then((audioBlob) => {
            audioObjectUrl = URL.createObjectURL(audioBlob);
            ttsNextPageAudioCacheRef.current.set(cacheKey, audioObjectUrl);
            return audioObjectUrl;
          })
          .then((url) => {
            // 检查是否还在播放状态（可能已被停止）
            if (!ttsIsPlayingRef.current) {
              URL.revokeObjectURL(url);
              resolve();
              return;
            }
            
            // 停止所有其他正在播放的音频
            if (typeof document !== 'undefined') {
              const allAudios = document.querySelectorAll('audio');
              allAudios.forEach((audio) => {
                if (!audio.paused && audio !== ttsAudioRef.current) {
                  audio.pause();
                  audio.currentTime = 0;
                }
              });
            }
            
            // 创建音频元素并播放（使用播放速度控制播放速率）
            const audio = new Audio(url);
            audio.playbackRate = playbackSpeed;
            ttsAudioRef.current = audio;

            audio.addEventListener('ended', () => {
              // 段落播放完成
              URL.revokeObjectURL(url);
              ttsNextPageAudioCacheRef.current.delete(cacheKey);
              
              // 保存TTS进度（按照音频播放进度推进）
              ttsCurrentIndexRef.current = paragraphIndex;
              saveTTSProgress();
              
              // 延迟清除高亮，确保用户能看到播放完成的段落
              setTimeout(() => {
                clearHighlight();
              }, 200);
              resolve();
            });

            audio.addEventListener('error', (e) => {
              console.error(`[TTS] 段落 ${paragraphIndex + 1} 播放失败:`, e);
              if (audioObjectUrl) {
                URL.revokeObjectURL(audioObjectUrl);
                ttsNextPageAudioCacheRef.current.delete(cacheKey);
              }
              // 清除高亮
              if (ttsHighlightRef.current) {
                ttsHighlightRef.current.style.textDecoration = '';
                ttsHighlightRef.current.style.textDecorationColor = '';
                ttsHighlightRef.current.style.textDecorationThickness = '';
                ttsHighlightRef.current.style.textUnderlineOffset = '';
                ttsHighlightRef.current = null;
              }
              reject(e);
            });

            audio.play().then(() => {
              // 段落开始播放
            }).catch((e) => {
              console.error(`[TTS] 播放失败:`, e);
              reject(e);
            });
          })
          .catch((e) => {
            console.error(`[TTS] 生成/获取音频失败:`, e);
            reject(e);
          });
      } else {
        // 检查是否还在播放状态（可能已被停止）
        if (!ttsIsPlayingRef.current) {
          resolve();
          return;
        }
        
        // blob URL 已验证有效，使用缓存的音频
        // 停止所有其他正在播放的音频
        if (typeof document !== 'undefined') {
          const allAudios = document.querySelectorAll('audio');
          allAudios.forEach((audio) => {
            if (!audio.paused && audio !== ttsAudioRef.current) {
              audio.pause();
              audio.currentTime = 0;
            }
          });
        }
        
        // 使用缓存的音频
        // 获取播放速度（从 settings 对象中获取）
        const settingsAny = settings as any;
        const playbackSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
        const audio = new Audio(audioObjectUrl);
        audio.playbackRate = playbackSpeed;
        ttsAudioRef.current = audio;

        // 处理播放错误：如果 blob URL 失效，重新生成音频
        const handlePlayError = async (e: any) => {
          console.warn(`[TTS] 缓存的音频 URL 失效，尝试重新生成: ${cacheKey}`, e);
          
          // 清除缓存中的无效 URL
          ttsNextPageAudioCacheRef.current.delete(cacheKey);
          try {
            URL.revokeObjectURL(audioObjectUrl);
          } catch (err) {
            // ignore
          }
          
          // 清除高亮
          if (ttsHighlightRef.current) {
            ttsHighlightRef.current.style.textDecoration = '';
            ttsHighlightRef.current.style.fontWeight = '';
            ttsHighlightRef.current = null;
          }
          
          // 检查是否还在播放状态
          if (!ttsIsPlayingRef.current) {
            reject(e);
            return;
          }
          
          // 重新生成音频
          try {
            const textToSend = paragraph.text?.trim() || '';
            if (!textToSend || textToSend.length === 0) {
              reject(new Error('段落文本为空'));
              return;
            }
            
            const model = settingsAny.tts_default_model?.value || 'edge';
            const voice = settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
            const generateSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
            const autoRole = settingsAny.tts_auto_role?.value === 'true';
            
            const token = localStorage.getItem('auth-storage');
            let authToken = '';
            if (token) {
              try {
                const parsed = JSON.parse(token);
                // Zustand persist stores state directly, but may also have a 'state' wrapper
                authToken = parsed.state?.token || parsed.token || '';
              } catch (err) {
                // ignore
              }
            }
            
            const headers: HeadersInit = {
              'Content-Type': 'application/json',
              ...getApiKeyHeader(), // 添加 API Key
            };
            if (authToken) {
              headers['Authorization'] = `Bearer ${authToken}`;
            }
            
            const synthesizeUrl = getFullApiUrl('/tts/synthesize');
            const synthesizeResponse = await fetch(synthesizeUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                bookId: book.id,
                chapterId: '0',
                paragraphId,
                text: textToSend,
                speed: generateSpeed,
                model,
                voice,
                autoRole,
              }),
            });
            
            if (!synthesizeResponse.ok) {
              throw new Error(`生成音频失败: HTTP ${synthesizeResponse.status}`);
            }
            
            // 使用统一的 API URL 配置
            const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(book.id)}&chapterId=0&paragraphId=${encodeURIComponent(paragraphId)}&speed=${generateSpeed}&model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}&autoRole=${autoRole ? 'true' : 'false'}`);
            const audioResponse = await fetch(audioUrl, { headers });
            
            if (!audioResponse.ok) {
              throw new Error(`获取音频失败: HTTP ${audioResponse.status}`);
            }
            
            const audioBlob = await audioResponse.blob();
            const newAudioObjectUrl = URL.createObjectURL(audioBlob);
            ttsNextPageAudioCacheRef.current.set(cacheKey, newAudioObjectUrl);
            
            // 使用新生成的音频继续播放
            const newAudio = new Audio(newAudioObjectUrl);
            newAudio.playbackRate = playbackSpeed;
            ttsAudioRef.current = newAudio;
            
            newAudio.addEventListener('ended', () => {
              setTimeout(() => {
                clearHighlight();
              }, 200);
              URL.revokeObjectURL(newAudioObjectUrl);
              ttsNextPageAudioCacheRef.current.delete(cacheKey);
              resolve();
            });
            
            newAudio.addEventListener('error', (err) => {
              console.error(`[TTS] 重新生成的音频也播放失败:`, err);
              URL.revokeObjectURL(newAudioObjectUrl);
              ttsNextPageAudioCacheRef.current.delete(cacheKey);
              reject(err);
            });
            
            await newAudio.play();
          } catch (err) {
            console.error(`[TTS] 重新生成音频失败:`, err);
            reject(err);
          }
        };

        audio.addEventListener('ended', () => {
          // 段落播放完成（使用缓存）
          
          // 保存TTS进度（按照音频播放进度推进）
          ttsCurrentIndexRef.current = paragraphIndex;
          saveTTSProgress();
          
          // 延迟清除高亮，确保用户能看到播放完成的段落
          setTimeout(() => {
            clearHighlight();
          }, 200);
          resolve();
        });

        audio.addEventListener('error', (e) => {
          // 如果播放失败，尝试重新生成
          handlePlayError(e).catch((err) => {
            console.error(`[TTS] 段落 ${paragraphIndex + 1} 播放失败:`, err);
            reject(err);
          });
        });

        audio.play().then(() => {
          // 段落开始播放（使用缓存）
        }).catch((e) => {
          // 如果播放失败，尝试重新生成
          handlePlayError(e).catch((err) => {
            console.error(`[TTS] 播放失败:`, err);
            reject(err);
          });
        });
      }
    });
  }, [book.id, generateTextHash, highlightParagraph, jumpToCfi, clearHighlight]);

  // 播放单个句子（保留用于兼容）
  const playSentence = useCallback(async (
    sentence: string,
    sentenceIndex: number,
    totalSentences: number,
    settings: ReadingSettings
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 检查是否已停止
      if (!ttsIsPlayingRef.current) {
        resolve();
        return;
      }

      // 获取TTS配置（从 settings 对象中获取，可能不存在于类型定义中）
      const settingsAny = settings as any;
      const model = settingsAny.tts_default_model?.value || 'edge';
      const voice = settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
      // 生成TTS时使用系统设置中的速度，默认1.0倍速
      const generateSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
      // 播放速度从设置中获取，用于 audio.playbackRate（与生成速度相同）
      const playbackSpeed = generateSpeed;
      const autoRole = settingsAny.tts_auto_role?.value === 'true';

      // 获取认证token
      const token = localStorage.getItem('auth-storage');
      let authToken = '';
      if (token) {
        try {
          const parsed = JSON.parse(token);
          // Zustand persist stores state directly, but may also have a 'state' wrapper
          authToken = parsed.state?.token || parsed.token || '';
        } catch (e) {
          // ignore
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // 检查缓存
      const cacheKey = `current_${sentenceIndex}_${sentence.substring(0, 20)}`;
      let audioObjectUrl = ttsNextPageAudioCacheRef.current.get(cacheKey);

      // 验证句子不为空
      const sentenceTrimmed = sentence?.trim() || '';
      if (!sentenceTrimmed || sentenceTrimmed.length === 0) {
        console.warn(`[TTS] 跳过空句子: 索引 ${sentenceIndex}`);
        return Promise.resolve(null);
      }
      
      if (!audioObjectUrl) {
        // 生成音频（使用系统设置中的速度）
        const synthesizeUrl = getFullApiUrl('/tts/synthesize');
        fetch(synthesizeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            bookId: book.id,
            chapterId: '0',
            paragraphId: `current_page_${sentenceIndex}`,
            text: sentenceTrimmed, // 使用验证后的文本
            speed: generateSpeed, // 生成时使用系统设置中的速度
            model,
            voice,
            autoRole,
          }),
        })
          .then((synthesizeResponse) => {
            if (!synthesizeResponse.ok) {
              throw new Error(`生成音频失败: HTTP ${synthesizeResponse.status}`);
            }

            // 获取音频（生成时使用系统设置中的速度）
            const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(book.id)}&chapterId=0&paragraphId=${encodeURIComponent(`current_page_${sentenceIndex}`)}&speed=${generateSpeed}&model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}&autoRole=${autoRole ? 'true' : 'false'}`);
            return fetch(audioUrl, { headers });
          })
          .then((audioResponse) => {
            if (!audioResponse.ok) {
              throw new Error(`获取音频失败: HTTP ${audioResponse.status}`);
            }
            return audioResponse.blob();
          })
          .then((audioBlob) => {
            audioObjectUrl = URL.createObjectURL(audioBlob);
            ttsNextPageAudioCacheRef.current.set(cacheKey, audioObjectUrl);
            return audioObjectUrl;
          })
          .then((url) => {
            // 检查是否还在播放状态（可能已被停止）
            if (!ttsIsPlayingRef.current) {
              URL.revokeObjectURL(url);
              resolve();
              return;
            }
            
            // 停止所有其他正在播放的音频
            if (typeof document !== 'undefined') {
              const allAudios = document.querySelectorAll('audio');
              allAudios.forEach((audio) => {
                if (!audio.paused && audio !== ttsAudioRef.current) {
                  audio.pause();
                  audio.currentTime = 0;
                }
              });
            }
            
            // 创建音频元素并播放（使用播放速度控制播放速率）
            const audio = new Audio(url);
            audio.playbackRate = playbackSpeed;
            ttsAudioRef.current = audio;

            audio.addEventListener('ended', () => {
              // 句子播放完成
              URL.revokeObjectURL(url);
              ttsNextPageAudioCacheRef.current.delete(cacheKey);
              resolve();
            });

            audio.addEventListener('error', (e) => {
              console.error(`[TTS] 句子 ${sentenceIndex + 1} 播放失败:`, e);
              if (audioObjectUrl) {
                URL.revokeObjectURL(audioObjectUrl);
                ttsNextPageAudioCacheRef.current.delete(cacheKey);
              }
              reject(e);
            });

            audio.play().then(() => {
              // 句子开始播放
            }).catch((e) => {
              console.error(`[TTS] 播放失败:`, e);
              reject(e);
            });
          })
          .catch((e) => {
            console.error(`[TTS] 生成/获取音频失败:`, e);
            reject(e);
          });
      } else {
        // 检查是否还在播放状态（可能已被停止）
        if (!ttsIsPlayingRef.current) {
          resolve();
          return;
        }
        
        // 停止所有其他正在播放的音频
        if (typeof document !== 'undefined') {
          const allAudios = document.querySelectorAll('audio');
          allAudios.forEach((audio) => {
            if (!audio.paused && audio !== ttsAudioRef.current) {
              audio.pause();
              audio.currentTime = 0;
            }
          });
        }
        
        // 使用缓存的音频（使用播放速度控制播放速率）
        const audio = new Audio(audioObjectUrl);
        audio.playbackRate = playbackSpeed;
        ttsAudioRef.current = audio;

            audio.addEventListener('ended', () => {
              // 句子播放完成（使用缓存）
              resolve();
            });

        audio.addEventListener('error', (e) => {
          console.error(`[TTS] 句子 ${sentenceIndex + 1} 播放失败（使用缓存）:`, e);
          reject(e);
        });

        audio.play().then(() => {
          // 句子开始播放（使用缓存）
        }).catch((e) => {
          console.error(`[TTS] 播放失败（使用缓存）:`, e);
          reject(e);
        });
      }
    });
  }, [book.id]);

  // 开始播放当前页面的TTS（按段落播放）
  const startPageTTS = useCallback(async () => {
    try {
      const rendition = epubjsRenditionRef.current;
      if (!rendition) {
        console.warn('[TTS] 阅读器未初始化');
        return;
      }

      // 停止所有其他TTS播放进程（确保只有一个播放进程）
      stopAllTTS();
      
      // 等待一小段时间确保所有播放都已停止
      await new Promise(resolve => setTimeout(resolve, 100));

      // 如果当前实例正在播放，先停止
      if (ttsIsPlayingRef.current) {
        stopPageTTS();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 将当前实例注册到全局集合
      ttsInstanceRef.current = { stop: stopPageTTS };
      globalTTSInstances.add(ttsInstanceRef.current);

      // 获取当前页面位置
      const currentLocation = rendition.currentLocation?.();
      if (!currentLocation) {
        console.warn('[TTS] 无法获取当前位置');
        return;
      }

      // 获取当前页面文本（使用 ref 中的函数）
      const getCurrentPageTextFn = getCurrentPageTextRef.current;
      if (!getCurrentPageTextFn) {
        console.warn('[TTS] getCurrentPageText 函数未初始化');
        return;
      }
      const currentPageText = getCurrentPageTextFn(currentLocation);
      if (!currentPageText || !currentPageText.trim()) {
        console.warn('[TTS] 当前页面无文本内容');
        return;
      }

      // 提取段落
      const paragraphs = extractParagraphs(currentPageText, currentLocation);
      if (paragraphs.length === 0) {
        console.warn('[TTS] 无法提取出段落');
        return;
      }

      // 尝试为每个段落添加CFI信息（如果可能）
      // 通过文本匹配在DOM中找到每个段落的位置，并分配CFI
      if (rendition && paragraphs.length > 0) {
        try {
          const iframe = containerRef.current?.querySelector('iframe');
          if (iframe) {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              // 规范化文本函数
              const normalizeText = (str: string) => str.replace(/\s+/g, '').trim();
              
              // 遍历段落，尝试在DOM中找到对应的元素并获取CFI
              for (let i = 0; i < paragraphs.length; i++) {
                const para = paragraphs[i];
                const paraText = normalizeText(para.text);
                if (paraText.length < 5) continue; // 跳过太短的段落
                
                // 使用多个搜索长度，从长到短
                const searchLengths = [
                  Math.min(100, paraText.length),
                  Math.min(50, paraText.length),
                  Math.min(30, paraText.length),
                  Math.min(20, paraText.length),
                ];
                
                // 使用TreeWalker查找包含该文本的节点
                const walker = iframeDoc.createTreeWalker(
                  iframeDoc.body || iframeDoc.documentElement,
                  NodeFilter.SHOW_TEXT,
                  null
                );
                
                let node: Node | null = null;
                let bestMatch: { node: Node; parent: HTMLElement; score: number } | null = null;
                
                while ((node = walker.nextNode())) {
                  if (node.textContent) {
                    const nodeText = normalizeText(node.textContent);
                    if (nodeText.length < 5) continue;
                    
                    // 尝试不同长度的匹配
                    for (const searchLength of searchLengths) {
                      if (searchLength < 10) break;
                      
                      const searchPrefix = paraText.substring(0, searchLength);
                      
                      // 优先匹配开头
                      if (nodeText.startsWith(searchPrefix)) {
                        const parent = node.parentElement;
                        if (parent) {
                          const score = searchLength;
                          if (!bestMatch || score > bestMatch.score) {
                            bestMatch = { node, parent, score };
                          }
                          break; // 找到匹配就跳出
                        }
                      }
                    }
                  }
                }
                
                // 如果找到匹配，尝试获取CFI
                if (bestMatch) {
                  try {
                    const range = iframeDoc.createRange();
                    // 尝试选择整个父元素
                    range.selectNodeContents(bestMatch.parent);
                    const cfi = (rendition as any).cfiFromRange?.(range);
                    if (cfi && typeof cfi === 'string' && cfi.startsWith('epubcfi(')) {
                      para.startCfi = cfi;
                      para.cfi = cfi;
                      // 如果这是最后一个段落，也设置endCfi
                      if (i === paragraphs.length - 1 && currentLocation.end?.cfi) {
                        para.endCfi = currentLocation.end.cfi;
                      }
                    } else {
                      // 如果获取CFI失败，尝试选择文本节点范围
                      try {
                        range.setStart(bestMatch.node, 0);
                        range.setEnd(bestMatch.node, bestMatch.node.textContent?.length || 0);
                        const cfi2 = (rendition as any).cfiFromRange?.(range);
                        if (cfi2 && typeof cfi2 === 'string' && cfi2.startsWith('epubcfi(')) {
                          para.startCfi = cfi2;
                          para.cfi = cfi2;
                        }
                      } catch (e) {
                        // 忽略错误
                      }
                    }
                  } catch (e) {
                    // 忽略错误，继续下一个段落
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[TTS] 为段落分配CFI失败:', e);
        }
      }
      
      // 如果段落没有CFI，至少为第一个和最后一个分配页面CFI
      const startCfi = currentLocation.start?.cfi;
      const endCfi = currentLocation.end?.cfi;
      if (startCfi && paragraphs.length > 0 && !paragraphs[0].startCfi) {
        paragraphs[0].startCfi = startCfi;
        paragraphs[0].cfi = startCfi;
      }
      if (endCfi && paragraphs.length > 0 && !paragraphs[paragraphs.length - 1].endCfi) {
        paragraphs[paragraphs.length - 1].endCfi = endCfi;
      }

      // 开始播放当前页面

      // 保存段落列表
      ttsCurrentParagraphsRef.current = paragraphs;
      ttsCurrentIndexRef.current = 0;
      ttsIsPlayingRef.current = true;

      // 立即通知外部开始播放（用于切换面板）
      // 这会在播放第一段之前就触发，确保面板能立即切换为播放控制模式
      if ((window as any).__onTTSStart) {
        (window as any).__onTTSStart();
      }
      
      // 确保状态更新完成
      await new Promise(resolve => setTimeout(resolve, 50));

      // 预缓存后续段落（最多10个）
      const preloadParagraphs = async (paragraphsToPreload: typeof paragraphs, startIndex: number): Promise<void> => {
        const maxPreload = 10;
        const endIndex = Math.min(startIndex + maxPreload, paragraphsToPreload.length);
        let lastPreloadedText = '';
        
        const preloadPromises: Promise<void>[] = [];
        
        for (let i = startIndex; i < endIndex; i++) {
          if (!ttsIsPlayingRef.current) break;
          const para = paragraphsToPreload[i];
          // 检查段落文本是否存在且不为空
          if (!para || !para.text || typeof para.text !== 'string') {
            continue;
          }
          
          const paraTextTrimmed = para.text.trim();
          
          // 检查文本是否为空（空段落跳过，避免 400 错误）
          if (!paraTextTrimmed || paraTextTrimmed.length === 0) {
            continue;
          }
          
          // 检查是否与上一个预加载的内容相同
          if (lastPreloadedText === paraTextTrimmed) {
            // 预加载段落与上一个内容相同，跳过
            continue;
          }
          
          const paragraphHash = generateTextHash(para.text);
          // 使用段落hash作为缓存键，不依赖索引（因为索引可能变化）
          const cacheKey = `para_${paragraphHash}`;
          
          // 如果已经缓存，跳过
          if (ttsNextPageAudioCacheRef.current.has(cacheKey)) {
            lastPreloadedText = paraTextTrimmed;
            continue;
          }
          
          // 更新上一个预加载的文本
          lastPreloadedText = paraTextTrimmed;
          
          // 异步预加载，不阻塞播放
          const preloadPromise = (async () => {
            try {
              const settingsAny = settings as any;
              const model = settingsAny.tts_default_model?.value || 'edge';
              const voice = settingsAny.tts_default_voice?.value || 'zh-CN-XiaoxiaoNeural';
              // 预缓存时使用系统设置中的速度，默认1.0倍速
              const generateSpeed = parseFloat(settingsAny.tts_default_speed?.value || '1.0');
              const autoRole = settingsAny.tts_auto_role?.value === 'true';
              const paragraphId = `para_${paragraphHash}`;
              
              // 再次验证文本不为空（双重检查）
              const textToSend = para.text.trim();
              if (!textToSend || textToSend.length === 0) {
                console.warn(`[TTS] 跳过空段落预加载: 索引 ${i}`);
                return;
              }
              
              const token = localStorage.getItem('auth-storage');
              let authToken = '';
              if (token) {
                try {
                  const parsed = JSON.parse(token);
                  // Zustand persist stores state directly, but may also have a 'state' wrapper
                  authToken = parsed.state?.token || parsed.token || '';
                } catch (e) {}
              }
              
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };
              if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
              }
              
              const synthesizeUrl = getFullApiUrl('/tts/synthesize');
            const synthesizeResponse = await fetch(synthesizeUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  bookId: book.id,
                  chapterId: '0',
                  paragraphId,
                  text: textToSend, // 使用验证后的文本
                  speed: generateSpeed, // 生成时使用默认速度
                  model,
                  voice,
                  autoRole,
                }),
              });
              
              // 检查响应状态，如果不是 200，记录错误信息但不抛出异常（避免影响播放）
              if (!synthesizeResponse.ok) {
                const errorText = await synthesizeResponse.text().catch(() => '');
                // 只记录警告，不阻止后续预生成
                console.warn(`[TTS] 预缓存段落 ${i + 1} 失败: HTTP ${synthesizeResponse.status}`, errorText.substring(0, 200));
                // 如果是服务器错误（500），可能是临时问题，不记录到错误日志
                if (synthesizeResponse.status >= 500) {
                  console.warn(`[TTS] 服务器错误，跳过此段落的预生成，不影响播放`);
                }
                return;
              }
              
              if (synthesizeResponse.ok) {
                // 使用统一的 API URL 配置
                const audioUrl = getFullApiUrl(`/tts/audio?bookId=${encodeURIComponent(book.id)}&chapterId=0&paragraphId=${encodeURIComponent(paragraphId)}&speed=${generateSpeed}&model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}&autoRole=${autoRole ? 'true' : 'false'}`);
                const audioResponse = await fetch(audioUrl, { headers });
                if (audioResponse.ok) {
                  const audioBlob = await audioResponse.blob();
                  const audioObjectUrl = URL.createObjectURL(audioBlob);
                  ttsNextPageAudioCacheRef.current.set(cacheKey, audioObjectUrl);
                  // 预缓存段落完成
                }
              }
            } catch (e) {
              console.warn(`[TTS] 预缓存段落 ${i + 1} 失败:`, e);
            }
          })();
          
          preloadPromises.push(preloadPromise);
        }
        
        // 等待所有预加载完成（但不阻塞，允许并发）
        await Promise.allSettled(preloadPromises);
      };
      
      // 开始预缓存当前页的所有段落（立即开始，不等待）
      preloadParagraphs(paragraphs, 0).catch(e => console.warn('[TTS] 预加载当前页段落失败:', e));
      
      // 提前预生成下一页的音频（异步，不阻塞播放，在播放本页时就开始预生成）
      (async () => {
        try {
          const nextLocation = await rendition.next();
          if (nextLocation) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const nextPageText = getCurrentPageTextFn(nextLocation);
            if (nextPageText && nextPageText.trim()) {
              const nextPageParagraphs = extractParagraphs(nextPageText, nextLocation);
              if (nextPageParagraphs.length > 0) {
                // 预生成下一页音频
                // 为段落分配CFI
                const nextStartCfi = nextLocation.start?.cfi;
                const nextEndCfi = nextLocation.end?.cfi;
                if (nextStartCfi && nextPageParagraphs.length > 0) {
                  nextPageParagraphs.forEach((para, idx) => {
                    if (idx === 0 && !para.startCfi) {
                      para.startCfi = nextStartCfi;
                      para.cfi = nextStartCfi;
                    }
                    if (idx === nextPageParagraphs.length - 1 && nextEndCfi && !para.endCfi) {
                      para.endCfi = nextEndCfi;
                    }
                  });
                }
                // 预生成下一页的音频（立即开始预生成，不等待）
                const allParagraphs = [...paragraphs, ...nextPageParagraphs];
                preloadParagraphs(allParagraphs, paragraphs.length).catch(e => console.warn('[TTS] 预生成下一页音频失败:', e));
              }
            }
            // 返回上一页
            await rendition.prev();
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (e) {
          console.warn('[TTS] 预生成下一页音频失败:', e);
        }
      })();
      
      // 按顺序播放段落
      // 使用动态段落列表，支持翻页后更新
      let currentParagraphs = paragraphs;
      for (let i = 0; i < currentParagraphs.length; i++) {
        if (!ttsIsPlayingRef.current) {
          break;
        }

        // 检查当前段落是否与上一个播放的段落相同
        const currentParaText = currentParagraphs[i].text.trim();
        if (i > 0 && currentParagraphs[i - 1].text.trim() === currentParaText) {
          // 段落与上一个段落内容相同，跳过播放但更新索引
          ttsCurrentIndexRef.current = i;
          // 通知外部更新进度（避免跳段显示）
          if ((window as any).__onTTSStateChange) {
            (window as any).__onTTSStateChange({
              currentIndex: i,
              totalParagraphs: currentParagraphs.length,
            });
          }
          continue;
        }

        ttsCurrentIndexRef.current = i;
        // 更新总段落数（确保进度显示正确）
        const totalParagraphs = ttsCurrentParagraphsRef.current.length;
        await playParagraph(currentParagraphs[i], i, totalParagraphs, settings);
        
        // 检查是否是当前页的最后一个段落
        const isLastParagraphInPage = i === currentParagraphs.length - 1;
        
        // 持续预缓存后续10个段落（确保播放连续性）
        // 每次播放后都检查并预加载后续段落
        const nextIndex = i + 1;
        if (nextIndex < currentParagraphs.length) {
          preloadParagraphs(ttsCurrentParagraphsRef.current, nextIndex);
        }
        
        // 如果当前段落是当前页的倒数第3个段落，提前预加载下一页
        // 这样可以确保翻页时音频已经准备好
        if (i >= currentParagraphs.length - 3 && i < currentParagraphs.length - 1) {
          const nextPara = currentParagraphs[i + 1];
          if (nextPara && currentParagraphs[i].endCfi && nextPara.startCfi) {
            const currentCfiPrefix = currentParagraphs[i].endCfi.substring(0, Math.min(30, currentParagraphs[i].endCfi.length));
            const nextCfiPrefix = nextPara.startCfi.substring(0, Math.min(30, nextPara.startCfi.length));
            if (currentCfiPrefix !== nextCfiPrefix) {
              // 下一个段落跨页，提前预加载下一页（异步，不阻塞播放）
              (async () => {
                try {
                  const currentLocation = rendition.currentLocation?.();
                  if (currentLocation) {
                    const nextLocation = await rendition.next();
                    if (nextLocation) {
                      await new Promise(resolve => setTimeout(resolve, 300));
                      const nextPageText = getCurrentPageTextFn(nextLocation);
                      if (nextPageText && nextPageText.trim()) {
                        const nextPageParagraphs = extractParagraphs(nextPageText, nextLocation);
                        if (nextPageParagraphs.length > 0) {
                          const allParagraphs = [...ttsCurrentParagraphsRef.current, ...nextPageParagraphs];
                          // 提前预加载下一页的段落
                          preloadParagraphs(allParagraphs, ttsCurrentParagraphsRef.current.length);
                        }
                      }
                      // 返回当前页
                      await rendition.prev();
                      await new Promise(resolve => setTimeout(resolve, 300));
                    }
                  }
                } catch (e) {
                  console.warn('[TTS] 提前预加载下一页失败:', e);
                }
              })();
            }
          }
        }
        
        // 检查下一个段落是否跨页，如果是则提前翻页（在播放下一个段落之前）
        if (i < currentParagraphs.length - 1) {
          const currentPara = currentParagraphs[i];
          const nextPara = currentParagraphs[i + 1];
          // 如果当前段落有endCfi，检查下一个段落是否在同一页
          if (currentPara.endCfi && nextPara.startCfi) {
            const currentCfiPrefix = currentPara.endCfi.substring(0, Math.min(30, currentPara.endCfi.length));
            const nextCfiPrefix = nextPara.startCfi.substring(0, Math.min(30, nextPara.startCfi.length));
            // 如果CFI前缀不同，说明不在同一页，需要翻页
            if (currentCfiPrefix !== nextCfiPrefix && nextPara.startCfi) {
              // 检测到下一个段落跨页，提前翻页
              try {
                await rendition.next();
                await new Promise(resolve => setTimeout(resolve, 800));
                const newLocation = rendition.currentLocation?.();
                if (newLocation) {
                  // 保存阅读进度（TTS播放时的翻页要记录到阅读进度）
                  try {
                    saveReadingProgress(newLocation, 'tts_page_turn');
                  } catch (e) {
                    console.warn('[TTS] 保存提前翻页阅读进度失败:', e);
                  }
                  
                  const nextPageText = getCurrentPageTextFn(newLocation);
                  if (nextPageText && nextPageText.trim()) {
                    const nextPageParagraphs = extractParagraphs(nextPageText, newLocation);
                    // 如果下一页有段落，更新段落列表
                    if (nextPageParagraphs.length > 0) {
                      // 为新增段落分配CFI
                      const nextStartCfi = newLocation.start?.cfi;
                      const nextEndCfi = newLocation.end?.cfi;
                      if (nextStartCfi && nextPageParagraphs.length > 0) {
                        nextPageParagraphs.forEach((para, idx) => {
                          if (idx === 0 && !para.startCfi) {
                            para.startCfi = nextStartCfi;
                            para.cfi = nextStartCfi;
                          }
                          if (idx === nextPageParagraphs.length - 1 && nextEndCfi && !para.endCfi) {
                            para.endCfi = nextEndCfi;
                          }
                        });
                      }
                      
                      // 检查是否有跨页重复的段落
                      const lastPlayedParagraph = ttsCurrentParagraphsRef.current.length > 0 
                        ? ttsCurrentParagraphsRef.current[ttsCurrentParagraphsRef.current.length - 1] 
                        : null;
                      const firstNextParagraph = nextPageParagraphs[0];
                      
                      let skipFirst = 0;
                      if (lastPlayedParagraph && firstNextParagraph) {
                        const lastText = lastPlayedParagraph.text.trim();
                        const firstText = firstNextParagraph.text.trim();
                        
                        // 如果第一个段落与上一个段落内容相同或相似，跳过它
                        if (lastText === firstText || 
                            (lastText.length > 0 && firstText.length > 0 && 
                             (lastText.includes(firstText.substring(0, Math.min(20, firstText.length))) ||
                              firstText.includes(lastText.substring(0, Math.min(20, lastText.length)))))) {
                          console.log('[TTS] [提前翻页] 检测到跨页重复段落，跳过:', {
                            lastText: lastText.substring(0, 30) + '...',
                            firstText: firstText.substring(0, 30) + '...',
                          });
                          skipFirst = 1; // 跳过第一个段落
                        }
                      }
                      
                      // 更新段落列表（追加到现有列表）
                      const updatedParagraphs = [...ttsCurrentParagraphsRef.current, ...nextPageParagraphs];
                      ttsCurrentParagraphsRef.current = updatedParagraphs;
                      
                      // 更新循环中的段落数组引用，确保后续循环使用更新后的列表
                      currentParagraphs = updatedParagraphs;
                      
                      // 立即预加载新页面的段落，确保播放连续性（跳过重复的段落）
                      const newStartIndex = updatedParagraphs.length - nextPageParagraphs.length + skipFirst;
                      preloadParagraphs(updatedParagraphs, newStartIndex);
                    }
                  }
                }
              } catch (e) {
                console.warn('[TTS] 提前翻页失败:', e);
              }
            }
          }
        }
        
        // 如果是当前页的最后一个段落，播放完成后跳出循环，让后面的代码处理翻页
        if (isLastParagraphInPage) {
          // 跳出循环，让后面的自动翻页逻辑处理
          break;
        }
      }

      // 当前页播放完成，尝试自动翻页并继续播放
      try {
        if (ttsIsPlayingRef.current) {
          // 当前页面播放完成，尝试翻到下一页
          // 保存当前页的结束CFI，用于验证翻页是否成功
          const currentEndCfi = currentLocation.end?.cfi;
          
          // 尝试翻到下一页
          await rendition.next();
          
          // 等待页面加载和 relocated 事件触发
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // 获取翻页后的位置
          const newLocation = rendition.currentLocation?.();
          if (!newLocation) {
            console.log('[TTS] 翻页后无法获取位置');
            ttsIsPlayingRef.current = false;
            clearHighlight();
            if ((window as any).__onTTSStop) {
              (window as any).__onTTSStop();
            }
            return;
          }
          
          // 保存阅读进度（TTS播放时的翻页要记录到阅读进度）
          try {
            saveReadingProgress(newLocation, 'tts_page_turn');
          } catch (e) {
            console.warn('[TTS] 保存翻页阅读进度失败:', e);
          }
          
          // 验证是否真的翻到了下一页（通过比较CFI）
          const newStartCfi = newLocation.start?.cfi;
          if (newStartCfi === currentEndCfi) {
            // 翻页成功，获取下一页文本
          } else {
            // 翻页后位置变化，继续获取文本
          }
          
          // 获取下一页的文本
          const nextPageText = getCurrentPageTextFn(newLocation);
          if (nextPageText && nextPageText.trim()) {
            // 提取下一页的段落
            const nextParagraphs = extractParagraphs(nextPageText, newLocation);
            
            // 尝试为段落添加CFI信息
            const nextStartCfi = newLocation.start?.cfi;
            const nextEndCfi = newLocation.end?.cfi;
            if (nextStartCfi && nextEndCfi) {
              nextParagraphs.forEach((para, index) => {
                if (index === 0 && nextStartCfi) {
                  para.startCfi = nextStartCfi;
                }
                if (index === nextParagraphs.length - 1 && nextEndCfi) {
                  para.endCfi = nextEndCfi;
                }
              });
            }
            
            if (nextParagraphs.length > 0) {
              // 下一页有段落，继续播放
              
              // 检查是否有跨页重复的段落（通过比较文本内容）
              // 如果下一页的第一个段落与当前页的最后一个段落内容相同或相似，说明是跨页段落，需要跳过
              const lastPlayedParagraph = ttsCurrentParagraphsRef.current.length > 0 
                ? ttsCurrentParagraphsRef.current[ttsCurrentParagraphsRef.current.length - 1] 
                : null;
              const firstNextParagraph = nextParagraphs[0];
              
              let startIndex = 0;
              if (lastPlayedParagraph && firstNextParagraph) {
                const lastText = lastPlayedParagraph.text.trim();
                const firstText = firstNextParagraph.text.trim();
                
                // 如果第一个段落与上一个段落内容相同，跳过它
                if (lastText === firstText || 
                    (lastText.length > 0 && firstText.length > 0 && 
                     (lastText.includes(firstText.substring(0, Math.min(20, firstText.length))) ||
                      firstText.includes(lastText.substring(0, Math.min(20, lastText.length)))))) {
                  console.log('[TTS] 检测到跨页重复段落，跳过:', {
                    lastText: lastText.substring(0, 30) + '...',
                    firstText: firstText.substring(0, 30) + '...',
                  });
                  startIndex = 1; // 从第二个段落开始播放
                }
              }
              
              // 更新段落列表（追加到现有列表，保持连续播放）
              const allParagraphs = [...ttsCurrentParagraphsRef.current, ...nextParagraphs];
              ttsCurrentParagraphsRef.current = allParagraphs;
              const actualStartIndex = ttsCurrentParagraphsRef.current.length - nextParagraphs.length + startIndex;
              
              // 立即预缓存新页面的段落，确保播放连续性（在播放前就开始预加载）
              // 异步预加载，不阻塞播放
              (async () => {
                try {
                  await preloadParagraphs(allParagraphs, actualStartIndex);
                  // 预加载完成后，继续预加载后续段落
                  if (actualStartIndex + 5 < allParagraphs.length) {
                    preloadParagraphs(allParagraphs, actualStartIndex + 5);
                  }
                } catch (e) {
                  console.warn('[TTS] 预加载段落失败:', e);
                }
              })();
              
              // 继续播放下一页的段落（跳过重复的段落）
              for (let i = actualStartIndex; i < allParagraphs.length; i++) {
                if (!ttsIsPlayingRef.current) {
                  break;
                }

                // 检查当前段落是否与上一个播放的段落相同
                const currentParaText = allParagraphs[i].text.trim();
                if (i > 0 && allParagraphs[i - 1].text.trim() === currentParaText) {
                  // 段落与上一个段落内容相同，跳过播放但更新索引
                  ttsCurrentIndexRef.current = i;
                  // 通知外部更新进度（避免跳段显示）
                  if ((window as any).__onTTSStateChange) {
                    (window as any).__onTTSStateChange({
                      currentIndex: i,
                      totalParagraphs: allParagraphs.length,
                    });
                  }
                  continue;
                }

                ttsCurrentIndexRef.current = i;
                // 更新段落列表引用（确保进度显示正确）
                ttsCurrentParagraphsRef.current = allParagraphs;
                await playParagraph(allParagraphs[i], i, allParagraphs.length, settings);
                
                // 持续预缓存后续10个段落（确保播放连续性）
                const nextIndex = i + 1;
                if (nextIndex < allParagraphs.length) {
                  preloadParagraphs(allParagraphs, nextIndex);
                }
                
                // 在播放过程中继续预缓存后续段落
                if (i === Math.floor((startIndex + allParagraphs.length) / 2)) {
                  preloadParagraphs(allParagraphs, i + 1);
                }
                
                // 检查是否需要继续翻页（如果段落跨页）
                if (i < allParagraphs.length - 1) {
                  const currentPara = allParagraphs[i];
                  const nextPara = allParagraphs[i + 1];
                  if (currentPara.endCfi && nextPara.startCfi) {
                    const currentCfiPrefix = currentPara.endCfi.substring(0, Math.min(30, currentPara.endCfi.length));
                    const nextCfiPrefix = nextPara.startCfi.substring(0, Math.min(30, nextPara.startCfi.length));
                    if (currentCfiPrefix !== nextCfiPrefix) {
                      // 检测到段落跨页，准备翻页
                      try {
                        await rendition.next();
                        await new Promise(resolve => setTimeout(resolve, 800));
                        const newLocation = rendition.currentLocation?.();
                        if (newLocation) {
                          // 保存翻页后的进度（和手动翻页一样）
                          try {
                            const bookInstance = epubjsBookRef.current;
                            if (bookInstance) {
                              const total = bookInstance.spine.length;
                              const loc = newLocation.start?.index ?? 0;
                              const progress = Math.min(1, Math.max(0, (loc + 1) / total));
                              const latestCfi = newLocation.start?.cfi || '';
                              const position = {
                                chapterIndex: newLocation.start?.index ?? 0,
                                currentPage: loc + 1,
                                totalPages: total,
                                progress,
                                currentLocation: latestCfi,
                              };
                              onProgressChange(progress, position);
                            }
                          } catch (e) {
                            console.warn('[TTS] 保存自动翻页进度失败:', e);
                          }
                          
                          const nextPageText = getCurrentPageTextFn(newLocation);
                          if (nextPageText && nextPageText.trim()) {
                            const nextPageParagraphs = extractParagraphs(nextPageText, newLocation);
                            if (nextPageParagraphs.length > 0) {
                              const updatedParagraphs = [...allParagraphs, ...nextPageParagraphs];
                              ttsCurrentParagraphsRef.current = updatedParagraphs;
                              const nextStartCfi = newLocation.start?.cfi;
                              if (nextStartCfi && nextPageParagraphs.length > 0) {
                                nextPageParagraphs.forEach((para, idx) => {
                                  if (idx === 0 && !para.startCfi) {
                                    para.startCfi = nextStartCfi;
                                    para.cfi = nextStartCfi;
                                  }
                                });
                              }
                              // 立即预加载新页面的段落，确保播放连续性
                              const newStartIndex = allParagraphs.length;
                              preloadParagraphs(updatedParagraphs, newStartIndex);
                            }
                          }
                        }
                      } catch (e) {
                        console.warn('[TTS] 自动翻页失败:', e);
                      }
                    }
                  }
                }
              }
              
              // 如果还有下一页，继续翻页
              if (ttsIsPlayingRef.current) {
                // 递归调用继续翻页和播放
                const nextLocation2 = rendition.currentLocation?.();
                if (nextLocation2) {
                  await rendition.next();
                  await new Promise(resolve => setTimeout(resolve, 800));
                  const newLocation2 = rendition.currentLocation?.();
                  if (newLocation2) {
                    // 保存翻页后的进度（和手动翻页一样）
                    try {
                      const bookInstance = epubjsBookRef.current;
                      if (bookInstance) {
                        const total = bookInstance.spine.length;
                        const loc = newLocation2.start?.index ?? 0;
                        const progress = Math.min(1, Math.max(0, (loc + 1) / total));
                        const latestCfi = newLocation2.start?.cfi || '';
                        const position = {
                          chapterIndex: newLocation2.start?.index ?? 0,
                          currentPage: loc + 1,
                          totalPages: total,
                          progress,
                          currentLocation: latestCfi,
                        };
                        onProgressChange(progress, position);
                      }
                    } catch (e) {
                      console.warn('[TTS] 保存递归翻页进度失败:', e);
                    }
                    
                    const nextPageText2 = getCurrentPageTextFn(newLocation2);
                    if (nextPageText2 && nextPageText2.trim()) {
                      const nextNextParagraphs = extractParagraphs(nextPageText2, newLocation2);
                      if (nextNextParagraphs.length > 0) {
                        const allParagraphs2 = [...ttsCurrentParagraphsRef.current, ...nextNextParagraphs];
                        ttsCurrentParagraphsRef.current = allParagraphs2;
                        const startIndex2 = ttsCurrentParagraphsRef.current.length - nextNextParagraphs.length;
                        preloadParagraphs(allParagraphs2, startIndex2);
                        for (let i = startIndex2; i < allParagraphs2.length; i++) {
                          if (!ttsIsPlayingRef.current) break;
                          ttsCurrentIndexRef.current = i;
                          await playParagraph(allParagraphs2[i], i, allParagraphs2.length, settings);
                          // 持续预缓存后续段落
                          const nextIndex = i + 1;
                          if (nextIndex < allParagraphs2.length) {
                            preloadParagraphs(allParagraphs2, nextIndex);
                          }
                        }
                      }
                    }
                  }
                }
              }
            } else {
              // 下一页无段落内容
              ttsIsPlayingRef.current = false;
              clearHighlight();
              if ((window as any).__onTTSStop) {
                (window as any).__onTTSStop();
              }
            }
          } else {
            // 下一页无文本内容
            ttsIsPlayingRef.current = false;
            clearHighlight();
            if ((window as any).__onTTSStop) {
              (window as any).__onTTSStop();
            }
          }
        }
      } catch (e) {
        console.warn('[TTS] 翻页失败:', e);
          ttsIsPlayingRef.current = false;
          clearHighlight();
          if ((window as any).__onTTSStop) {
            (window as any).__onTTSStop();
          }
        }

        // 播放完成（所有页面）
        if (ttsIsPlayingRef.current) {
          // 所有页面播放完成
          ttsIsPlayingRef.current = false;
          
          // 清除高亮
          clearHighlight();
          
          // 通知外部播放完成（用于切换面板）
          if ((window as any).__onTTSStop) {
            (window as any).__onTTSStop();
          }
        }
      } catch (e) {
      console.error('[TTS] 播放失败:', e);
      ttsIsPlayingRef.current = false;
      
      // 清除高亮
      if (ttsHighlightRef.current) {
        ttsHighlightRef.current.style.textDecoration = '';
        ttsHighlightRef.current.style.fontWeight = '';
        ttsHighlightRef.current = null;
      }
      
      // 通知外部播放失败
      if ((window as any).__onTTSStop) {
        (window as any).__onTTSStop();
      }
    }
  }, [extractParagraphs, playParagraph, settings, clearHighlight]);

  // 停止所有TTS播放（全局停止函数）
  const stopAllTTS = useCallback(() => {
    // 停止所有注册的TTS实例
    globalTTSInstances.forEach((instance: any) => {
      if (instance && typeof instance.stop === 'function') {
        try {
          instance.stop();
        } catch (e) {
          console.warn('[TTS] 停止其他实例失败:', e);
        }
      }
    });
    globalTTSInstances.clear();
    
    // 停止所有正在播放的音频元素
    if (typeof document !== 'undefined') {
      const allAudios = document.querySelectorAll('audio');
      allAudios.forEach((audio) => {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
    }
    
    console.log('[TTS] 已停止所有播放进程');
  }, [globalTTSInstances]);

  // 停止播放
  const stopPageTTS = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current = null;
    }
    ttsIsPlayingRef.current = false;
    
    // 从全局实例集合中移除
    if (ttsInstanceRef.current) {
      globalTTSInstances.delete(ttsInstanceRef.current);
      ttsInstanceRef.current = null;
    }
    
    // 清除高亮
    if (ttsHighlightRef.current) {
      ttsHighlightRef.current.style.textDecoration = '';
      ttsHighlightRef.current.style.fontWeight = '';
      ttsHighlightRef.current = null;
    }
    
    // 通知外部停止播放（用于切换面板）
    if ((window as any).__onTTSStop) {
      (window as any).__onTTSStop();
    }
  }, [globalTTSInstances]);

  // 播放指定索引的段落（不自动继续播放下一段，用于手动切换）
  const playParagraphAtIndex = useCallback(async (index: number, autoContinue: boolean = false) => {
    const rendition = epubjsRenditionRef.current;
    if (!rendition) {
      console.warn('[TTS] 阅读器未初始化');
      return;
    }

    const getCurrentPageTextFn = getCurrentPageTextRef.current;
    if (!getCurrentPageTextFn) {
      console.warn('[TTS] getCurrentPageText 函数未初始化');
      return;
    }

    let paragraphs = ttsCurrentParagraphsRef.current;
    
    // 如果当前没有段落列表，需要先初始化
    if (paragraphs.length === 0) {
      const currentLocation = rendition.currentLocation?.();
      if (!currentLocation) {
        console.warn('[TTS] 无法获取当前位置');
        return;
      }

      const currentPageText = getCurrentPageTextFn(currentLocation);
      if (!currentPageText || !currentPageText.trim()) {
        console.warn('[TTS] 当前页面无文本内容');
        return;
      }

      const extractedParagraphs = extractParagraphs(currentPageText, currentLocation);
      if (extractedParagraphs.length === 0) {
        console.warn('[TTS] 无法提取出段落');
        return;
      }

      ttsCurrentParagraphsRef.current = extractedParagraphs;
      paragraphs = extractedParagraphs;
    }

    // 如果索引超出范围，尝试翻页加载更多段落
    if (index < 0) {
      // 尝试翻到上一页
      try {
        const currentLocation = rendition.currentLocation?.();
        if (currentLocation) {
          await rendition.prev();
          await new Promise(resolve => setTimeout(resolve, 800));
          const newLocation = rendition.currentLocation?.();
          if (newLocation) {
            const prevPageText = getCurrentPageTextFn(newLocation);
            if (prevPageText && prevPageText.trim()) {
              const prevPageParagraphs = extractParagraphs(prevPageText, newLocation);
              if (prevPageParagraphs.length > 0) {
                // 为段落分配CFI
                const prevStartCfi = newLocation.start?.cfi;
                const prevEndCfi = newLocation.end?.cfi;
                if (prevStartCfi && prevPageParagraphs.length > 0) {
                  prevPageParagraphs.forEach((para, idx) => {
                    if (idx === 0 && !para.startCfi) {
                      para.startCfi = prevStartCfi;
                      para.cfi = prevStartCfi;
                    }
                    if (idx === prevPageParagraphs.length - 1 && prevEndCfi && !para.endCfi) {
                      para.endCfi = prevEndCfi;
                    }
                  });
                }
                // 将上一页的段落添加到列表开头
                const updatedParagraphs = [...prevPageParagraphs, ...paragraphs];
                ttsCurrentParagraphsRef.current = updatedParagraphs;
                paragraphs = updatedParagraphs;
                // 更新索引（因为添加了前面的段落）
                index = prevPageParagraphs.length - 1;
              }
            }
          }
        }
      } catch (e) {
        console.warn('[TTS] 翻到上一页失败:', e);
        console.log('[TTS] 已经是第一页');
        return;
      }
    } else if (index >= paragraphs.length) {
      // 尝试翻到下一页
      try {
        const currentLocation = rendition.currentLocation?.();
        if (currentLocation) {
          await rendition.next();
          await new Promise(resolve => setTimeout(resolve, 800));
          const newLocation = rendition.currentLocation?.();
          if (newLocation) {
            // 保存阅读进度（TTS播放时的翻页要记录到阅读进度）
            try {
              saveReadingProgress(newLocation, 'tts_page_turn');
            } catch (e) {
              console.warn('[TTS] 保存翻页阅读进度失败:', e);
            }

            const nextPageText = getCurrentPageTextFn(newLocation);
            if (nextPageText && nextPageText.trim()) {
              const nextPageParagraphs = extractParagraphs(nextPageText, newLocation);
              if (nextPageParagraphs.length > 0) {
                // 为段落分配CFI（使用新页面的CFI，确保正确）
                const nextStartCfi = (newLocation as any)?.start?.cfi;
                const nextEndCfi = (newLocation as any)?.end?.cfi;
                
                console.log('[TTS] [playParagraphAtIndex] 翻到下一页，分配CFI:', {
                  nextStartCfi: nextStartCfi ? nextStartCfi.substring(0, 50) + '...' : 'null',
                  nextEndCfi: nextEndCfi ? nextEndCfi.substring(0, 50) + '...' : 'null',
                  paragraphCount: nextPageParagraphs.length,
                });
                
                if (nextStartCfi && nextPageParagraphs.length > 0) {
                  // 确保所有段落都使用新页面的CFI，而不是旧页面的CFI
                  nextPageParagraphs.forEach((para, idx) => {
                    // 清除可能存在的旧CFI
                    if (para.startCfi || para.cfi) {
                      console.log('[TTS] [playParagraphAtIndex] 清除段落旧CFI:', {
                        idx: idx,
                        oldCfi: para.startCfi || para.cfi,
                        newCfi: nextStartCfi,
                      });
                    }
                    // 第一个段落使用页面起始CFI
                    if (idx === 0) {
                      para.startCfi = nextStartCfi;
                      para.cfi = nextStartCfi;
                    } else {
                      // 其他段落暂时不设置CFI，让它们在播放时通过文本匹配获取
                      // 这样可以避免使用错误的CFI
                      para.startCfi = undefined;
                      para.cfi = undefined;
                    }
                    // 最后一个段落使用页面结束CFI
                    if (idx === nextPageParagraphs.length - 1 && nextEndCfi) {
                      para.endCfi = nextEndCfi;
                    }
                  });
                  
                  console.log('[TTS] [playParagraphAtIndex] ✅ 已为下一页段落分配CFI:', {
                    paragraphCount: nextPageParagraphs.length,
                    firstParaCfi: nextPageParagraphs[0]?.startCfi ? nextPageParagraphs[0].startCfi.substring(0, 50) + '...' : 'null',
                    lastParaEndCfi: nextPageParagraphs[nextPageParagraphs.length - 1]?.endCfi ? nextPageParagraphs[nextPageParagraphs.length - 1].endCfi.substring(0, 50) + '...' : 'null',
                  });
                }
                // 将下一页的段落添加到列表末尾
                const updatedParagraphs = [...paragraphs, ...nextPageParagraphs];
                ttsCurrentParagraphsRef.current = updatedParagraphs;
                paragraphs = updatedParagraphs;
                // 确保索引在有效范围内
                index = Math.min(index, paragraphs.length - 1);
                
                console.log('[TTS] [playParagraphAtIndex] 段落列表已更新:', {
                  oldCount: paragraphs.length - nextPageParagraphs.length,
                  newCount: paragraphs.length,
                  targetIndex: index,
                });
              } else {
                console.log('[TTS] 已经是最后一页');
                return;
              }
            } else {
              console.log('[TTS] 已经是最后一页');
              return;
            }
          }
        }
      } catch (e) {
        console.warn('[TTS] 翻到下一页失败:', e);
        console.log('[TTS] 已经是最后一页');
        return;
      }
    }

    // 确保索引在有效范围内
    const validIndex = Math.max(0, Math.min(index, paragraphs.length - 1));
    
    // 停止当前播放
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
    }

    // 设置播放状态
    ttsIsPlayingRef.current = true;
    ttsCurrentIndexRef.current = validIndex;

    // 将当前实例注册到全局集合
    if (!ttsInstanceRef.current) {
      ttsInstanceRef.current = { stop: stopPageTTS };
      globalTTSInstances.add(ttsInstanceRef.current);
    }

    // 通知外部开始播放
    if ((window as any).__onTTSStart) {
      (window as any).__onTTSStart();
    }

    // 播放指定段落
    const paragraph = paragraphs[validIndex];
    const totalParagraphs = paragraphs.length;
    
    // 添加调试日志
    const currentLocation = rendition.currentLocation?.() as any;
    const currentCfi = currentLocation?.start?.cfi;
    console.log('[TTS] [playParagraphAtIndex] 准备播放段落:', {
      index: validIndex,
      totalParagraphs: totalParagraphs,
      paragraphText: paragraph.text ? paragraph.text.substring(0, 30) + '...' : 'empty',
      paragraphCfi: paragraph.cfi ? paragraph.cfi.substring(0, 50) + '...' : 'null',
      paragraphStartCfi: paragraph.startCfi ? paragraph.startCfi.substring(0, 50) + '...' : 'null',
      currentCfi: currentCfi ? currentCfi.substring(0, 50) + '...' : 'null',
      autoContinue: autoContinue,
    });
    
    try {
      await playParagraph(paragraph, validIndex, totalParagraphs, settings);
      
      // 只有在自动继续模式下才继续播放下一段
      if (autoContinue && ttsIsPlayingRef.current && validIndex < totalParagraphs - 1) {
        // 自动播放下一段
        ttsCurrentIndexRef.current = validIndex + 1;
        await playParagraphAtIndex(validIndex + 1, true);
      } else if (!autoContinue) {
        // 手动切换段落时，播放完成后不停止播放状态
        // 保持播放状态，等待用户继续操作（继续播放下一段或停止）
        // 不触发 __onTTSStop，不关闭播放控制面板
        // 只更新当前索引
        ttsCurrentIndexRef.current = validIndex;
      } else {
        // 自动播放模式且没有下一段，或者播放被停止
        // 只有在真正停止播放时才触发 __onTTSStop
        if (!ttsIsPlayingRef.current) {
          if ((window as any).__onTTSStop) {
            (window as any).__onTTSStop();
          }
        }
      }
    } catch (e) {
      console.error('[TTS] 播放段落失败:', e);
      // 只有在播放状态被明确停止时才触发 __onTTSStop
      if (!ttsIsPlayingRef.current) {
        if ((window as any).__onTTSStop) {
          (window as any).__onTTSStop();
        }
      }
    }
  }, [extractParagraphs, playParagraph, settings, stopPageTTS, globalTTSInstances, onProgressChange]);

  // 播放前一个段落（手动切换，不自动继续）
  const prevParagraph = useCallback(async () => {
    const currentIndex = ttsCurrentIndexRef.current;
    // 尝试播放前一个段落（如果索引为0，playParagraphAtIndex会尝试翻到上一页）
    await playParagraphAtIndex(currentIndex - 1, false);
  }, [playParagraphAtIndex]);

  // 播放下一个段落（手动切换，不自动继续）
  const nextParagraph = useCallback(async () => {
    const currentIndex = ttsCurrentIndexRef.current;
    const totalParagraphs = ttsCurrentParagraphsRef.current.length;
    // 尝试播放下一个段落（如果索引超出范围，playParagraphAtIndex会尝试翻到下一页）
    await playParagraphAtIndex(currentIndex + 1, false);
  }, [playParagraphAtIndex]);

  // 暴露TTS功能到全局
  useEffect(() => {
    (window as any).__startPageTTS = startPageTTS;
    (window as any).__stopPageTTS = stopPageTTS;
    // 动态调整播放速度（不影响播放进程）
    (window as any).__updateTTSPlaybackSpeed = (speed: number) => {
      if (ttsAudioRef.current && !ttsAudioRef.current.paused) {
        ttsAudioRef.current.playbackRate = speed;
        console.log('[TTS] 动态调整播放速度:', speed);
      }
    };
    (window as any).__getTTSIsPlaying = () => ttsIsPlayingRef.current;
    (window as any).__getTTSCurrentIndex = () => ttsCurrentIndexRef.current;
    (window as any).__getTTSTotalParagraphs = () => ttsCurrentParagraphsRef.current.length;
    (window as any).__prevParagraph = prevParagraph;
    (window as any).__nextParagraph = nextParagraph;

    return () => {
      stopPageTTS();
      delete (window as any).__startPageTTS;
      delete (window as any).__stopPageTTS;
      delete (window as any).__getTTSIsPlaying;
      delete (window as any).__getTTSCurrentIndex;
      delete (window as any).__getTTSTotalParagraphs;
      delete (window as any).__prevParagraph;
      delete (window as any).__nextParagraph;
      delete (window as any).__updateTTSPlaybackSpeed;
    };
  }, [startPageTTS, stopPageTTS, prevParagraph, nextParagraph]);

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
        // gradient: 'linear-gradient(145deg, rgba(255, 255, 255, 0.938) 0%, rgba(248, 250, 252, 0.5) 50%, rgba(241, 245, 249, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -1px 0 rgba(0, 0, 0, 0.02)'
          : 'inset 0 0 40px rgba(0, 0, 0, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        border: isCentered ? '1px solid rgba(226, 232, 240, 0.8)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
      dark: {
        // 深色主题：沉稳、优雅
        // gradient: 'linear-gradient(145deg, rgba(28, 30, 34, 0.3) 0%, rgba(23, 25, 28, 0.5) 50%, rgba(18, 20, 23, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.4)'
          : 'inset 0 0 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        border: isCentered ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
      sepia: {
        // 护眼主题：温暖、柔和
        // gradient: 'linear-gradient(145deg, rgba(250, 247, 240, 0.3) 0%, rgba(245, 238, 225, 0.5) 50%, rgba(240, 232, 215, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(92, 75, 55, 0.12), 0 8px 24px rgba(92, 75, 55, 0.08), 0 2px 8px rgba(92, 75, 55, 0.05), inset 0 1px 0 rgba(255, 248, 230, 0.9), inset 0 -1px 0 rgba(92, 75, 55, 0.05)'
          : 'inset 0 0 40px rgba(92, 75, 55, 0.03), inset 0 1px 0 rgba(255, 248, 230, 0.5)',
        border: isCentered ? '1px solid rgba(212, 196, 156, 0.4)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
      green: {
        // 绿色主题：清新、自然
        // gradient: 'linear-gradient(145deg, rgba(245, 252, 245, 0.3) 0%, rgba(237, 247, 237, 0.5) 50%, rgba(232, 245, 233, 0.7) 100%)',
        shadow: isCentered
          ? '0 20px 60px rgba(46, 125, 50, 0.08), 0 8px 24px rgba(46, 125, 50, 0.05), 0 2px 8px rgba(46, 125, 50, 0.03), inset 0 1px 0 rgba(240, 255, 240, 0.9), inset 0 -1px 0 rgba(46, 125, 50, 0.03)'
          : 'inset 0 0 40px rgba(46, 125, 50, 0.02), inset 0 1px 0 rgba(240, 255, 240, 0.4)',
        border: isCentered ? '1px solid rgba(165, 214, 167, 0.4)' : 'none',
        innerPadding: isCentered ? '24px' : '16px',
      },
    }[settings.theme];
// background: linear-gradient(145deg, rgba(245, 252, 245, 0.3) 0%, rgba(237, 247, 237, 0.5) 50%, rgba(232, 245, 233, 0.7) 100%); 
    return {
      // background: themeConfig.gradient,
      // boxShadow: themeConfig.shadow,
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
          // 只对视觉属性应用过渡动画，不包括布局属性（width、margin、padding等），避免容器偏移
          transition: 'background 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s cubic-bezier(0.4, 0, 0.2, 1), border 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.4s cubic-bezier(0.4, 0, 0.2, 1), backdrop-filter 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
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
              <p style={{ color: themeStyles.text }}>{t('common.loading')}</p>
            </div>
          </div>
        )}
        
        {/* 手势处理已由 GestureHandler 接管，不再需要事件捕获层 */}
        
        {/* epubjs 会直接渲染到 containerRef 中 */}
        </div>
      </div>
    </div>
  );
}

