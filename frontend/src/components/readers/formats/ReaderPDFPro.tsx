/**
 * @author ttbye
 * 全新构建的专业级 PDF 阅读器
 * 使用 pdf.js 实现完整的 PDF 阅读功能
 * 
 * 完全独立实现，不依赖任何现有 PDF 阅读器组件
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { BookData, ReadingSettings, ReadingPosition, TOCItem } from '../../../types/reader';
import { loadPdfJs } from '../../../utils/pdfLoader';
import { offlineStorage } from '../../../utils/offlineStorage';
import toast from 'react-hot-toast';
import { X, Clock, ZoomIn, ZoomOut, Maximize, Minimize, ChevronLeft, ChevronRight, Settings, Crop } from 'lucide-react';

interface ReaderPDFProProps {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  onSettingsChange: (settings: ReadingSettings) => void;
  onProgressChange: (progress: number, position: ReadingPosition) => void;
  onTOCChange: (toc: TOCItem[]) => void;
  onClose: () => void;
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

/**
 * 检测PDF页面的实际内容边界，去除白边
 * 通过分析canvas像素来找到非白色内容的边界
 */
function detectContentBounds(canvas: HTMLCanvasElement, threshold: number = 250): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 检查一个像素是否接近白色（或背景色）
  const isWhitePixel = (r: number, g: number, b: number): boolean => {
    return r > threshold && g > threshold && b > threshold;
  };

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  // 扫描所有像素，找到内容边界
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      if (!isWhitePixel(r, g, b)) {
        // 找到非白色像素，更新边界
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 如果没有找到内容，返回null
  if (minX >= width || minY >= height) {
    return null;
  }

  // 添加一些padding，避免裁剪过紧
  const padding = Math.min(width, height) * 0.02; // 2%的padding
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width, maxX + padding);
  maxY = Math.min(height, maxY + padding);

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
  };
}

/**
 * 将PDF outline转换为TOCItem格式
 */
async function convertOutlineToTOC(outline: any[], pdf: any, level: number = 1): Promise<TOCItem[]> {
  const tocItems: TOCItem[] = [];
  
  for (let i = 0; i < outline.length; i++) {
    const item = outline[i];
    const tocItem: TOCItem = {
      id: `toc-${level}-${i}`,
      title: item.title || `目录项 ${i + 1}`,
      href: '', // PDF使用pageNumber而不是href
      level: level,
    };
    
    // 处理目标位置，转换为页码
    if (item.dest) {
      try {
        // dest可能是数组、字符串或命名目标
        let dest: any;
        if (Array.isArray(item.dest)) {
          dest = item.dest;
        } else if (typeof item.dest === 'string') {
          // 如果是字符串，尝试作为命名目标获取
          try {
            dest = await pdf.getDestination(item.dest);
          } catch (e) {
            // 如果获取失败，可能是直接的目标字符串
            dest = null;
          }
        } else {
          dest = item.dest;
        }
        
        if (dest && Array.isArray(dest) && dest.length > 0) {
          // dest格式通常是 [ref, name, ...args] 或 [name, ...args]
          // 需要解析引用对象来获取页码
          let pageRef = dest[0];
          
          // 如果第一个元素是字符串（命名目标），尝试获取实际目标
          if (typeof pageRef === 'string') {
            try {
              const resolvedDest = await pdf.getDestination(pageRef);
              if (resolvedDest && Array.isArray(resolvedDest) && resolvedDest.length > 0) {
                pageRef = resolvedDest[0];
              }
            } catch (e) {
              // 忽略错误，继续使用原始pageRef
            }
          }
          
          // 尝试从pageRef中提取页码
          if (pageRef) {
            if (pageRef.num !== undefined) {
              // 如果ref有num属性，直接使用
              const pageNum = pageRef.num; // PDF内部页码从1开始
              tocItem.href = `#page=${pageNum}`;
            } else if (typeof pageRef === 'object') {
              // 尝试通过getPageIndex获取页码
              try {
                const pageIndex = await pdf.getPageIndex(pageRef);
                tocItem.href = `#page=${pageIndex + 1}`;
              } catch (e) {
                // 如果失败，尝试其他方法
                // 尝试从dest数组中查找页码信息
                for (let j = 1; j < dest.length; j++) {
                  if (typeof dest[j] === 'number') {
                    tocItem.href = `#page=${dest[j] + 1}`;
                    break;
                  }
                }
              }
            }
          }
          
          // 如果还是没有设置href，尝试从dest数组中查找数字
          if (!tocItem.href) {
            for (let j = 0; j < dest.length; j++) {
              if (typeof dest[j] === 'number' && dest[j] >= 0) {
                tocItem.href = `#page=${dest[j] + 1}`;
                break;
              }
            }
          }
        }
      } catch (error) {
        // 解析失败，使用默认值
      }
      
      // 如果还是没有设置href，使用dest作为fallback
      if (!tocItem.href && item.dest) {
        if (typeof item.dest === 'string') {
          tocItem.href = `#dest=${item.dest}`;
        } else {
          tocItem.href = `#dest=${JSON.stringify(item.dest)}`;
        }
      }
    }
    
    // 递归处理子项
    if (item.items && item.items.length > 0) {
      tocItem.children = await convertOutlineToTOC(item.items, pdf, level + 1);
    }
    
    tocItems.push(tocItem);
  }
  
  return tocItems;
}

export default function ReaderPDFPro({
  book,
  settings,
  initialPosition,
  onSettingsChange,
  onProgressChange,
  onTOCChange,
  onClose,
}: ReaderPDFProProps) {
  // 核心状态
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null); // 保存当前的渲染任务，用于取消
  const [loading, setLoading] = useState(true);
  const [pdfMetadata, setPdfMetadata] = useState<PDFMetadata>({});
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isTurningPage, setIsTurningPage] = useState(false);
  
  // 缩放状态 - 从 settings.fontSize 初始化（fontSize 存储为 10 倍值，例如 15 表示 1.5x）
  const initialScale = settings.fontSize ? settings.fontSize / 10 : 1.5;
  const [scale, setScale] = useState(initialScale);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 双指捏合缩放相关状态
  const pinchStartRef = useRef<{ 
    distance: number; 
    scale: number;
    initialDistance: number; // 初始距离，用于计算阈值
    lastUpdateTime: number; // 上次更新时间，用于节流
  } | null>(null);
  const isPinchingRef = useRef(false);
  const scaleRef = useRef(scale);
  
  // 缩放灵敏度设置
  const PINCH_THRESHOLD = 0.05; // 最小缩放变化阈值（5%），只有超过这个值才开始缩放
  const PINCH_THROTTLE = 16; // 节流间隔（毫秒），约 60fps
  
  // 保持 scaleRef 与 scale 同步
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  
  // 白边裁剪状态（从settings中读取，如果没有则使用默认值false）
  const autoCropMargins = settings.pdfAutoCropMargins ?? false;
  const [contentBounds, setContentBounds] = useState<{left: number, top: number, right: number, bottom: number} | null>(null);
  
  // 渲染质量设置（从settings中读取，如果没有则使用默认值'ultra'）
  const renderQuality = settings.pdfRenderQuality ?? 'ultra';
  
  // 自适应屏幕设置（从settings中读取，如果没有则使用默认值false）
  const autoFit = settings.pdfAutoFit ?? false;
  
  // UI 状态
  const [showBottomBar, setShowBottomBar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPageJump, setShowPageJump] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // 触摸状态
  const touchStartRef = useRef<{ x: number; y: number; time: number; distance: number } | null>(null);
  const [touchOffset, setTouchOffset] = useState(0);
  const [pageTransition, setPageTransition] = useState<'none' | 'next' | 'prev'>('none');
  
  // 容器尺寸
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // 检测是否为移动设备
  const [isMobile, setIsMobile] = useState(false);
  const [isPWA, setIsPWA] = useState(false);
  
  // 长按相关
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressThreshold = 500; // 500ms长按阈值
  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);
  
  // 定时器
  const hideBarsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 检测设备类型和PWA模式
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

  // 更新时间
  useEffect(() => {
    timeUpdateTimerRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => {
      if (timeUpdateTimerRef.current) {
        clearInterval(timeUpdateTimerRef.current);
      }
    };
  }, []);

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      if (hideBarsTimerRef.current) {
        clearTimeout(hideBarsTimerRef.current);
      }
      if (progressSaveTimerRef.current) {
        clearTimeout(progressSaveTimerRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // 获取文件URL
  const getFileUrl = async (): Promise<string> => {
    const ext = book.file_name?.split('.').pop()?.toLowerCase() || 'pdf';
    const serverUrl = `/books/${book.id}.${ext}`;
    
    try {
      const cachedBlob = await offlineStorage.getBook(book.id);
      if (cachedBlob) {
        return offlineStorage.createBlobURL(cachedBlob);
      }
      const blob = await offlineStorage.downloadBook(book.id, ext, serverUrl);
      return offlineStorage.createBlobURL(blob);
    } catch (error) {
      console.error('离线存储失败，使用服务器URL', error);
      return serverUrl;
    }
  };

  // 加载PDF文件
  useEffect(() => {
    if (!book || !book.id) return;

    const loadPdf = async () => {
      try {
        setLoading(true);

        const pdfjsLib = await loadPdfJs();
        const bookUrl = await getFileUrl();
        
        const loadingTask = pdfjsLib.getDocument({
          url: bookUrl,
          withCredentials: false,
        });
        
        const pdf = await loadingTask.promise;
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);

        // 获取PDF元数据
        try {
          const metadata = await pdf.getMetadata();
          const info = metadata.info || {};
          setPdfMetadata({
            title: info.Title,
            author: info.Author,
            subject: info.Subject,
            creator: info.Creator,
            producer: info.Producer,
            creationDate: info.CreationDate,
            modificationDate: info.ModDate,
          });
        } catch (error) {
          // 元数据获取失败不影响阅读
        }

        // 提取PDF目录大纲
        try {
          const outline = await pdf.getOutline();
          if (outline && outline.length > 0) {
            const tocItems = await convertOutlineToTOC(outline, pdf);
            onTOCChange(tocItems);
          } else {
            onTOCChange([]);
          }
        } catch (error) {
          onTOCChange([]);
        }

        setLoading(false);
      } catch (error: any) {
        console.error('加载PDF失败', error);
        toast.error(`加载失败: ${error.message || '未知错误'}`);
        setLoading(false);
      }
    };

    loadPdf();
  }, [book?.id, book?.file_name, onTOCChange]);

  // 监听容器尺寸变化
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newSize = { 
          width: rect.width || window.innerWidth, 
          height: rect.height || (window.innerHeight - 140) 
        };
        setContainerSize(newSize);
      } else {
        const fallbackSize = { 
          width: window.innerWidth, 
          height: window.innerHeight - 140 
        };
        setContainerSize(fallbackSize);
      }
    };

    const timer = setTimeout(() => {
      updateSize();
    }, 100);

    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        updateSize();
      });
      resizeObserver.observe(containerRef.current);
      window.addEventListener('resize', updateSize);
      
      return () => {
        clearTimeout(timer);
        resizeObserver.disconnect();
        window.removeEventListener('resize', updateSize);
      };
    }
    
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // 渲染PDF页面
  const renderPage = useCallback(async (pageNum: number, targetScale?: number) => {
    if (!pdfRef.current || !canvasRef.current) return;

    try {
      // 取消之前的渲染任务（如果存在）
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // 忽略取消错误
        }
        renderTaskRef.current = null;
      }

      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', {
        alpha: false, // 不透明背景，提高性能
        desynchronized: true, // 允许异步渲染，提高性能
      });
      
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }

      // 根据渲染质量设置不同的分辨率倍数
      // 考虑设备像素比（高DPI屏幕）
      const devicePixelRatio = window.devicePixelRatio || 1;
      let qualityMultiplier = 1.0;
      switch (renderQuality) {
        case 'standard':
          qualityMultiplier = 1.5;
          break;
        case 'high':
          qualityMultiplier = 2.0;
          break;
        case 'ultra':
          qualityMultiplier = 3.0;
          break;
      }
      
      // 优化canvas渲染质量
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const page = await pdf.getPage(pageNum);
      const effectiveScale = targetScale !== undefined ? targetScale : scale;
      
      // 计算适合容器的缩放比例
      const containerWidth = containerSize.width > 0 ? containerSize.width : window.innerWidth;
      const containerHeight = containerSize.height > 0 ? containerSize.height : window.innerHeight - 140;
      
      // 第一步：使用较高的scale渲染到临时canvas进行内容检测
      // 根据渲染质量调整检测分辨率
      const detectionScale = qualityMultiplier * 2.0; // 使用较高的分辨率来检测内容边界
      const detectionViewport = page.getViewport({ scale: detectionScale });
      
      // 创建临时canvas用于检测内容边界
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = detectionViewport.width;
      tempCanvas.height = detectionViewport.height;
      const tempCtx = tempCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
      
      if (tempCtx) {
        // 优化临时canvas的渲染质量
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        
        // 保存临时canvas的渲染任务（用于检测，不需要取消）
        const tempRenderTask = page.render({
          canvasContext: tempCtx,
          viewport: detectionViewport,
        });
        await tempRenderTask.promise;
        
        // 检测内容边界
        if (autoCropMargins) {
          const bounds = detectContentBounds(tempCanvas);
          if (bounds) {
            setContentBounds(bounds);
            
            // 计算裁剪后的内容尺寸（在检测分辨率下）
            const contentWidth = bounds.right - bounds.left;
            const contentHeight = bounds.bottom - bounds.top;
            
            // 计算基于内容的显示缩放比例，使内容适合屏幕（显示尺寸）
            const scaleX = (containerWidth - settings.margin * 2) / contentWidth;
            const scaleY = (containerHeight - settings.margin * 2) / contentHeight;
            const displayScale = Math.min(scaleX, scaleY);
            
            // 计算显示尺寸（像素）
            const displayWidth = contentWidth * displayScale;
            const displayHeight = contentHeight * displayScale;
            
            // 使用更高的分辨率渲染（根据质量设置）
            const renderScale = displayScale * qualityMultiplier;
            const renderViewport = page.getViewport({ scale: renderScale });
            
            // 设置canvas尺寸（高分辨率）
            canvas.width = renderViewport.width;
            canvas.height = renderViewport.height;
            
            // 通过CSS控制显示尺寸（保持原显示尺寸）
            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;
            
            // 清空canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 渲染完整页面（高分辨率）
            const mainRenderTask = page.render({
              canvasContext: ctx,
              viewport: renderViewport,
            });
            renderTaskRef.current = mainRenderTask; // 保存渲染任务
            await mainRenderTask.promise;
            renderTaskRef.current = null; // 渲染完成后清除引用
            
            // 裁剪出内容区域（通过计算偏移）
            // 计算从检测分辨率到渲染分辨率的比例
            const scaleRatio = renderScale / detectionScale;
            const cropLeft = bounds.left * scaleRatio;
            const cropTop = bounds.top * scaleRatio;
            const cropWidth = contentWidth * scaleRatio;
            const cropHeight = contentHeight * scaleRatio;
            
            // 使用另一个临时canvas来存储裁剪后的内容
            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = cropWidth;
            croppedCanvas.height = cropHeight;
            const croppedCtx = croppedCanvas.getContext('2d', {
              alpha: false,
              desynchronized: true,
            });
            
            if (croppedCtx) {
              // 优化裁剪canvas的渲染质量
              croppedCtx.imageSmoothingEnabled = true;
              croppedCtx.imageSmoothingQuality = 'high';
              
              // 从原canvas复制裁剪区域
              croppedCtx.drawImage(
                canvas,
                cropLeft, cropTop, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
              );
              
              // 调整主canvas尺寸并显示裁剪后的内容（保持高分辨率）
              canvas.width = cropWidth;
              canvas.height = cropHeight;
              // 显示尺寸保持不变
              canvas.style.width = `${displayWidth}px`;
              canvas.style.height = `${displayHeight}px`;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(croppedCanvas, 0, 0);
            }
            
            return;
          }
        }
      }
      
      // 如果不启用自动裁剪或检测失败，使用原来的渲染逻辑
      // 先计算显示尺寸（基于effectiveScale）
      const displayViewport = page.getViewport({ scale: effectiveScale });
      
      // 如果启用自适应屏幕，计算适合容器的缩放比例（保持纵横比）
      let displayScale = effectiveScale;
      if (autoFit && targetScale === undefined) {
        // 自适应屏幕：计算使页面完全适合容器的缩放比例
        // 只在初始渲染时应用，如果用户手动设置了缩放（targetScale），则使用用户设置的值
        const availableWidth = containerWidth - settings.margin * 2;
        const availableHeight = containerHeight - settings.margin * 2;
        const pageWidth = page.view[2]; // PDF 页面宽度（单位：点）
        const pageHeight = page.view[3]; // PDF 页面高度（单位：点）
        
        // 计算宽度和高度的缩放比例，取较小值以确保页面完全显示（保持纵横比）
        const scaleX = availableWidth / pageWidth;
        const scaleY = availableHeight / pageHeight;
        displayScale = Math.min(scaleX, scaleY);
      } else {
        // 如果页面宽度超过容器，自动调整缩放（保持原有逻辑，但保持纵横比）
        if (displayViewport.width > containerWidth - settings.margin * 2) {
          // 保持纵横比：只根据宽度调整，高度会自动按比例缩放
          displayScale = ((containerWidth - settings.margin * 2) / page.view[2]);
        }
      }
      
      // 确保使用 PDF.js 的 viewport 来保持纵横比
      // getViewport 会自动根据 scale 和页面原始尺寸计算正确的宽高比
      
      // 根据渲染质量，使用更高的分辨率渲染，但显示尺寸保持不变
      const renderScale = displayScale * qualityMultiplier;
      const finalViewport = page.getViewport({ scale: renderScale });
      
      // 设置canvas尺寸（高分辨率）
      canvas.width = finalViewport.width;
      canvas.height = finalViewport.height;
      
      // 通过CSS控制显示尺寸（保持原显示尺寸）
      const displayWidth = displayViewport.width;
      const displayHeight = displayViewport.height;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      
      const renderContext = {
        canvasContext: ctx,
        viewport: finalViewport,
      };
      
      // 保存渲染任务并等待完成
      const mainRenderTask = page.render(renderContext);
      renderTaskRef.current = mainRenderTask; // 保存渲染任务
      await mainRenderTask.promise;
      renderTaskRef.current = null; // 渲染完成后清除引用
    } catch (error: any) {
      // 清理渲染任务引用
      renderTaskRef.current = null;
      
      // 如果是取消错误，不显示错误提示
      if (error.name === 'RenderingCancelledException' || error.message?.includes('cancelled')) {
        return;
      }
      
      console.error('渲染PDF页面失败', error);
      toast.error(`渲染页面失败: ${error.message || '未知错误'}`);
    }
  }, [scale, containerSize, settings.margin, autoCropMargins, renderQuality, autoFit]);

  // 同步 settings.fontSize 到 scale state
  // 使用 useRef 来避免循环依赖
  const lastFontSizeRef = useRef(settings.fontSize);
  useEffect(() => {
    // 只有当 fontSize 真正变化时才更新 scale
    if (lastFontSizeRef.current !== settings.fontSize) {
      lastFontSizeRef.current = settings.fontSize;
      const newScale = settings.fontSize ? settings.fontSize / 10 : 1.5;
      setScale(newScale);
    }
  }, [settings.fontSize]);

  // 当页面或缩放变化时重新渲染
  useEffect(() => {
    if (currentPage > 0 && currentPage <= totalPages && !loading) {
      renderPage(currentPage);
    }
  }, [currentPage, scale, containerSize, renderPage, totalPages, loading]);

  // 组件卸载时清理渲染任务
  useEffect(() => {
    return () => {
      // 清理渲染任务
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // 忽略取消错误
        }
        renderTaskRef.current = null;
      }
    };
  }, []);

  // 恢复阅读位置
  useEffect(() => {
    if (totalPages > 0 && initialPosition) {
      const savedPage = initialPosition.currentPage || 1;
      if (savedPage >= 1 && savedPage <= totalPages) {
        setCurrentPage(savedPage);
      }
    }
  }, [totalPages, initialPosition]);

  // 显示/隐藏底部导航栏
  const showBars = useCallback(() => {
    setShowBottomBar(true);
    
    if (hideBarsTimerRef.current) {
      clearTimeout(hideBarsTimerRef.current);
    }
    
    hideBarsTimerRef.current = setTimeout(() => {
      setShowBottomBar(false);
    }, 3000);
  }, []);

  // 翻页处理
  const turnPage = useCallback((direction: 'prev' | 'next') => {
    if (isTurningPage || totalPages === 0) return;

    setIsTurningPage(true);
    setPageTransition(direction);

    setTimeout(() => {
      if (direction === 'next') {
        if (currentPage < totalPages) {
          setCurrentPage(currentPage + 1);
        } else {
          toast('已经是最后一页了');
        }
      } else {
        if (currentPage > 1) {
          setCurrentPage(currentPage - 1);
        } else {
          toast('已经是第一页了');
        }
      }

      setTimeout(() => {
        setPageTransition('none');
        setIsTurningPage(false);
      }, 300);
    }, 50);
  }, [isTurningPage, totalPages, currentPage]);

  // 跳转到指定页面
  const jumpToPage = useCallback((pageNum: number) => {
    const targetPage = Math.max(1, Math.min(pageNum, totalPages));
    setCurrentPage(targetPage);
    setShowPageJump(false);
    setJumpPageInput('');
    toast(`已跳转到第 ${targetPage} 页`);
  }, [totalPages]);

  // 处理目录项点击（通过全局函数暴露）
  useEffect(() => {
    (window as any).__pdfGoToPage = (page: number) => {
      jumpToPage(page);
    };
    
    (window as any).__pdfHandleTOCClick = (href: string) => {
      // 解析href中的页码信息
      // href格式可能是: #page=5 或 #dest=...
      if (href.startsWith('#page=')) {
        const pageMatch = href.match(/#page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          jumpToPage(pageNum);
        }
      } else if (href.startsWith('#dest=')) {
        // 如果是dest格式，需要解析PDF的命名目标
        // 这里简化处理，尝试从dest中提取页码
        toast.error('该目录项暂不支持跳转');
      }
    };
    
    return () => {
      delete (window as any).__pdfGoToPage;
      delete (window as any).__pdfHandleTOCClick;
    };
  }, [jumpToPage]);

  // 缩放处理
  const handleZoom = useCallback((direction: 'in' | 'out' | 'reset', newScale?: number) => {
    setScale(prevScale => {
      let targetScale: number;
      if (newScale !== undefined) {
        targetScale = Math.max(0.5, Math.min(3, newScale));
      } else if (direction === 'in') {
        targetScale = Math.min(3, prevScale + 0.25);
      } else if (direction === 'out') {
        targetScale = Math.max(0.5, prevScale - 0.25);
      } else {
        targetScale = 1.5;
      }
      
      // 同步更新 settings（fontSize 存储为 10 倍值）
      onSettingsChange({
        ...settings,
        fontSize: Math.round(targetScale * 10),
      });
      
      return targetScale;
    });
  }, [settings, onSettingsChange]);

  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        } else if ((containerRef.current as any).mozRequestFullScreen) {
          await (containerRef.current as any).mozRequestFullScreen();
        } else if ((containerRef.current as any).msRequestFullscreen) {
          await (containerRef.current as any).msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('全屏切换失败', error);
    }
  }, [isFullscreen]);

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // 更新阅读进度（实时保存）
  useEffect(() => {
    if (totalPages === 0) return;

    const progress = Math.min(1, Math.max(0, currentPage / totalPages));

    // 防抖保存进度（500ms延迟，避免频繁请求）
    if (progressSaveTimerRef.current) {
      clearTimeout(progressSaveTimerRef.current);
    }

    progressSaveTimerRef.current = setTimeout(() => {
      const position: ReadingPosition = {
        currentPage: currentPage,
        totalPages: totalPages,
        progress: progress,
      };
      
      onProgressChange(progress, position);
    }, 500);
  }, [currentPage, totalPages, onProgressChange]);

  // 计算两点之间的距离
  const getTouchDistance = (touch1: Touch, touch2: Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 触摸事件处理
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // 双指捏合检测
    if (e.touches.length === 2) {
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      pinchStartRef.current = {
        distance,
        scale: scaleRef.current,
        initialDistance: distance, // 保存初始距离
        lastUpdateTime: Date.now(), // 记录开始时间
      };
      isPinchingRef.current = true;
      // 取消长按定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }

    // 单指触摸处理
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
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
    
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      distance: 0,
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
  }, [isMobile, isPWA, showBars]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // 双指捏合缩放处理
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const currentTime = Date.now();
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      
      // 节流：限制更新频率
      if (currentTime - pinchStartRef.current.lastUpdateTime < PINCH_THROTTLE) {
        return;
      }
      
      // 计算距离变化比例（相对于初始距离）
      const distanceChange = Math.abs(currentDistance - pinchStartRef.current.initialDistance);
      const distanceChangeRatio = distanceChange / pinchStartRef.current.initialDistance;
      
      // 只有当距离变化超过阈值时才开始缩放（避免误触）
      if (distanceChangeRatio < PINCH_THRESHOLD) {
        return;
      }
      
      // 计算缩放变化（相对于上次记录的距离）
      const scaleChange = currentDistance / pinchStartRef.current.distance;
      
      // 计算新的缩放值，保持纵横比一致
      const newScale = Math.max(0.5, Math.min(3, pinchStartRef.current.scale * scaleChange));
      
      // 直接更新 scale，不立即更新 settings（在 touchEnd 时统一更新）
      setScale(newScale);
      // 更新 pinchStartRef 的 scale、distance 和更新时间，以便连续缩放时保持正确的比例
      pinchStartRef.current.scale = newScale;
      pinchStartRef.current.distance = currentDistance;
      pinchStartRef.current.lastUpdateTime = currentTime;
      return;
    }

    // 单指触摸处理
    if (!touchStartRef.current || e.touches.length !== 1) {
      // 如果开始移动，取消长按定时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    touchStartRef.current.distance = distance;

    // 如果移动距离超过阈值，取消长按检测
    if (distance > 10 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 滑动翻页：只有在用户选择滑动翻页模式时才启用
    if (settings.pageTurnMethod === 'swipe' && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
      setTouchOffset(Math.max(-100, Math.min(100, deltaX)));
    }
  }, [settings.pageTurnMethod, handleZoom]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // 结束双指捏合
    if (isPinchingRef.current) {
      isPinchingRef.current = false;
      // 在双指捏合结束时，同步更新 settings
      if (pinchStartRef.current) {
        const finalScale = pinchStartRef.current.scale;
        onSettingsChange({
          ...settings,
          fontSize: Math.round(finalScale * 10),
        });
      }
      pinchStartRef.current = null;
      // 如果只有一根手指抬起，继续处理单指逻辑
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
          distance: 0,
        };
        return;
      }
    }

    // 清除长按定时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const distance = touchStartRef.current.distance;
    const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 判断是滑动还是点击
    const isSwipe = totalDistance > 50 && deltaTime < 300 && distance < 200;

    if (settings.pageTurnMethod === 'swipe' && isSwipe) {
      // 滑动翻页模式：处理滑动翻页
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // 水平滑动
          if (deltaX > 0) {
            turnPage('prev');
          } else {
            turnPage('next');
          }
        }
      }
    } else if (settings.pageTurnMethod === 'click' && settings.clickToTurn && !isSwipe && totalDistance < 10) {
      // 点击翻页模式：处理点击翻页（移动距离很小，认为是点击）
      const target = e.target as HTMLElement;
      if (!target.closest('button') && !target.closest('input')) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        if (settings.pageTurnMode === 'horizontal') {
          if (x < width / 3) {
            turnPage('prev');
          } else if (x > (width * 2) / 3) {
            turnPage('next');
          }
        } else {
          if (y < height / 3) {
            turnPage('prev');
          } else if (y > (height * 2) / 3) {
            turnPage('next');
          }
        }
      }
    }

    setTouchOffset(0);
    touchStartRef.current = null;
  }, [settings, turnPage]);

  // 鼠标滚轮支持
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Ctrl/Cmd + 滚轮 = 缩放
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY > 0) {
        handleZoom('out');
      } else {
        handleZoom('in');
      }
      return;
    }

    // 普通滚轮 = 翻页（在页面边缘时）
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const isAtTop = e.clientY - rect.top < 50;
    const isAtBottom = rect.bottom - e.clientY < 50;

    if (isAtTop && e.deltaY < 0) {
      e.preventDefault();
      turnPage('prev');
    } else if (isAtBottom && e.deltaY > 0) {
      e.preventDefault();
      turnPage('next');
    }
  }, [handleZoom, turnPage]);

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

  // 点击翻页（PC端和移动端）
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 点击按钮或输入框时不翻页
    if (target.closest('button') || target.closest('input')) {
      return;
    }

    // 只有在用户选择点击翻页模式且启用了点击翻页时才处理
    if (settings.pageTurnMethod !== 'click' || !settings.clickToTurn) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (settings.pageTurnMode === 'horizontal') {
      if (x < width / 3) {
        turnPage('prev');
      } else if (x > (width * 2) / 3) {
        turnPage('next');
      }
    } else {
      const y = e.clientY - rect.top;
      const height = rect.height;
      if (y < height / 3) {
        turnPage('prev');
      } else if (y > (height * 2) / 3) {
        turnPage('next');
      }
    }
  }, [settings, turnPage, onSettingsChange]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // 标记已处理，避免容器层重复处理
      (e as any).__readerHandled = true;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        turnPage('prev');
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        turnPage('next');
      } else if (e.key === 'Escape') {
        setShowBottomBar(false);
        setShowPageJump(false);
        if (isFullscreen) {
          toggleFullscreen();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleFullscreen();
        }
      } else if (e.key === '+' || e.key === '=') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleZoom('in');
        }
      } else if (e.key === '-') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleZoom('out');
        }
      } else if (e.key === '0') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleZoom('reset');
        }
      } else if (e.key === 'g' || e.key === 'G') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setShowPageJump(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [turnPage, toggleFullscreen, handleZoom, isFullscreen]);

  // 暴露翻页函数给外部（供 ReaderContainer 调用）
  useEffect(() => {
    (window as any).__readerPageTurn = (direction: 'prev' | 'next') => {
      turnPage(direction);
    };
    return () => {
      delete (window as any).__readerPageTurn;
    };
  }, [turnPage]);

  const themeStyles = {
    light: { bg: '#ffffff', text: '#000000', border: '#e0e0e0' },
    dark: { bg: '#1a1a1a', text: '#ffffff', border: '#404040' },
    sepia: { bg: '#f4e4bc', text: '#5c4b37', border: '#d4c49c' },
    green: { bg: '#c8e6c9', text: '#2e7d32', border: '#a5d6a7' },
  }[settings.theme];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: themeStyles.bg }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: themeStyles.text }} />
          <p style={{ color: themeStyles.text }}>加载PDF中...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-auto"
      style={{ backgroundColor: themeStyles.bg }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
    >
      {/* PDF 内容区域 */}
      <div
        className={`flex items-center justify-center w-full min-h-full ${isMobile ? 'py-4' : 'pb-4'}`}
        style={{
          transform: `translateX(${touchOffset}px)`,
          transition: touchOffset === 0 && pageTransition === 'none' ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          paddingBottom: showBottomBar ? '100px' : '20px',
        }}
      >
        {totalPages > 0 && (
          <div className="flex flex-col items-center">
            <canvas
              ref={canvasRef}
              className="shadow-lg"
              style={{
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
        )}
      </div>

      {/* 底部导航栏 */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 transition-all duration-300 ${
          showBottomBar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
        style={{
          backgroundColor: themeStyles.bg,
          borderTop: `1px solid ${themeStyles.border}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="px-4 py-3">
          {/* 进度条 */}
          <div className="w-full h-1 rounded-full mb-3" style={{ backgroundColor: themeStyles.border }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(currentPage / totalPages) * 100}%`,
                backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
              }}
            />
          </div>
          
          {/* 控制按钮行 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => turnPage('prev')}
                disabled={currentPage <= 1}
                className="p-2 rounded-lg transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: currentPage > 1 ? 'rgba(0,0,0,0.05)' : 'transparent',
                  color: themeStyles.text,
                }}
                aria-label="上一页"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <button
                onClick={() => turnPage('next')}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-lg transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: currentPage < totalPages ? 'rgba(0,0,0,0.05)' : 'transparent',
                  color: themeStyles.text,
                }}
                aria-label="下一页"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleZoom('out')}
                className="p-2 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10"
                style={{ color: themeStyles.text }}
                aria-label="缩小"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              
              <span className="text-xs" style={{ color: themeStyles.text, opacity: 0.7 }}>
                {Math.round(scale * 100)}%
              </span>
              
              <button
                onClick={() => handleZoom('in')}
                className="p-2 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10"
                style={{ color: themeStyles.text }}
                aria-label="放大"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newValue = !autoCropMargins;
                  onSettingsChange({
                    ...settings,
                    pdfAutoCropMargins: newValue,
                  });
                  // 重新渲染当前页面以应用设置
                  setTimeout(() => {
                    if (pdfRef.current) {
                      renderPage(currentPage);
                    }
                  }, 100);
                  toast(newValue ? '已开启自动裁剪' : '已关闭自动裁剪');
                }}
                className={`p-2 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10 ${autoCropMargins ? 'bg-blue-500 bg-opacity-20' : ''}`}
                style={{ color: autoCropMargins ? '#1890ff' : themeStyles.text }}
                aria-label="自动裁剪白边"
                title="自动裁剪白边"
              >
                <Crop className="w-5 h-5" />
              </button>
              
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10"
                style={{ color: themeStyles.text }}
                aria-label="设置"
                title="阅读设置"
              >
                <Settings className="w-5 h-5" />
              </button>
              
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg transition-colors hover:bg-opacity-10 hover:bg-black dark:hover:bg-white dark:hover:bg-opacity-10"
                style={{ color: themeStyles.text }}
                aria-label={isFullscreen ? '退出全屏' : '全屏'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* 信息行 */}
          <div className="flex items-center justify-between text-xs" style={{ color: themeStyles.text, opacity: 0.7 }}>
            <span className="truncate max-w-[30%]">
              {pdfMetadata.title || book.title || book.file_name}
            </span>
            <span className="mx-2">
              {currentPage} / {totalPages}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* 跳转页面对话框 */}
      {showPageJump && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4"
            style={{ backgroundColor: themeStyles.bg, color: themeStyles.text }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">跳转到页面</h2>
              <button onClick={() => setShowPageJump(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const pageNum = parseInt(jumpPageInput);
                    if (!isNaN(pageNum)) {
                      jumpToPage(pageNum);
                    }
                  }
                }}
                placeholder={`1-${totalPages}`}
                className="flex-1 px-4 py-2 border rounded-lg"
                style={{
                  backgroundColor: themeStyles.bg,
                  color: themeStyles.text,
                  borderColor: themeStyles.border,
                }}
                autoFocus
              />
              <button
                onClick={() => {
                  const pageNum = parseInt(jumpPageInput);
                  if (!isNaN(pageNum)) {
                    jumpToPage(pageNum);
                  }
                }}
                className="px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: settings.theme === 'dark' ? '#4a9eff' : '#1890ff',
                  color: '#ffffff',
                }}
              >
                跳转
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: themeStyles.text, opacity: 0.7 }}>
              快捷键: Ctrl+G (Windows/Linux) 或 Cmd+G (Mac)
            </p>
          </div>
        </div>
      )}

      {/* 设置面板 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black bg-opacity-50">
          <div
            className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: themeStyles.bg, color: themeStyles.text }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">阅读设置</h2>
              <button onClick={() => setShowSettings(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* PDF 元数据信息 */}
            {Object.keys(pdfMetadata).length > 0 && (
              <div className="mb-4 p-4 rounded-lg" style={{ backgroundColor: themeStyles.border, opacity: 0.3 }}>
                <h3 className="font-semibold mb-2">文档信息</h3>
                {pdfMetadata.title && (
                  <p className="text-sm mb-1">
                    <span className="font-medium">标题:</span> {pdfMetadata.title}
                  </p>
                )}
                {pdfMetadata.author && (
                  <p className="text-sm mb-1">
                    <span className="font-medium">作者:</span> {pdfMetadata.author}
                  </p>
                )}
                {pdfMetadata.subject && (
                  <p className="text-sm mb-1">
                    <span className="font-medium">主题:</span> {pdfMetadata.subject}
                  </p>
                )}
                {pdfMetadata.creator && (
                  <p className="text-sm mb-1">
                    <span className="font-medium">创建工具:</span> {pdfMetadata.creator}
                  </p>
                )}
              </div>
            )}

            {/* 提示：详细设置请在阅读设置中查看 */}
            <div className="mb-4 p-3 rounded-lg text-xs" style={{ backgroundColor: themeStyles.border, opacity: 0.1 }}>
              <div style={{ color: themeStyles.text, opacity: 0.7 }}>
                💡 提示：PDF相关设置（自动裁剪白边、渲染质量等）请在阅读设置中查看
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

