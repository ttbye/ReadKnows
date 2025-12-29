/**
 * @author ttbye
 * 阅读器类型定义
 */

export interface BookData {
  id: string;
  title: string;
  author: string;
  cover_image_url: string;
  file_path: string;
  file_name: string;
  file_type: 'epub' | 'pdf' | 'txt' | 'mobi' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'pptx' | 'md';
  description?: string;
  category?: string;
  language?: string;
  publisher?: string;
  publish_date?: string;
  isbn?: string;
  tags?: string[];
}

export interface ReadingSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia' | 'green';
  brightness: number;
  margin: number;
  textIndent: number; // 首行缩进（em单位）
  pageTurnMode: 'horizontal' | 'vertical';
  pageTurnMethod: 'click' | 'swipe'; // 翻页方式：点击或滑动
  clickToTurn: boolean;
  showBottomInfoBar: boolean; // 是否显示底部信息栏
  readerWidth: 'full' | 'centered'; // 阅读区域宽度：全宽或居中（仅PC端）
  pdfCropHorizontal?: boolean; // PDF裁剪左右白边（默认false）
  pdfCropVertical?: boolean; // PDF裁剪上下白边（默认false）
  pdfRenderQuality?: 'standard' | 'high' | 'ultra'; // PDF渲染质量（默认ultra）
  pdfAutoFit?: boolean; // PDF自适应屏幕（默认false）
  pdfAutoRotate?: boolean; // PDF根据内容自动旋转页面（默认false）
  officeZoom?: number; // Office文档缩放比例（默认100，表示100%）
  keyboardShortcuts: {
    prev: string;
    next: string;
  };
}

export interface ReadingPosition {
  chapterIndex?: number;
  chapterTitle?: string; // 当前章节标题
  currentPage: number;
  totalPages: number;
  scrollTop?: number;
  progress: number;
  currentLocation?: string; // EPUB.js 使用的 CFI 位置标识
  paragraphIndex?: number; // 当前段落索引（用于与朗读功能同步）
}

export interface ReaderConfig {
  book: BookData;
  settings: ReadingSettings;
  initialPosition?: ReadingPosition;
  onSettingsChange: (settings: ReadingSettings) => void;
  onProgressChange: (progress: number, position: ReadingPosition) => void;
  onClose: () => void;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  pageHeight: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface TOCItem {
  id: string;
  title: string;
  href: string;
  level: number;
  children?: TOCItem[];
  chapterIndex?: number; // 对应的章节索引（用于EPUB）
}

export interface Highlight {
  id: string;
  bookId: string;
  cfiRange: string;
  selectedText?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 默认阅读设置
 * 
 * 注意：阅读设置仅保存在本地 localStorage，不同步到服务器
 * 这样设计的原因：
 * 1. 不同设备（手机、平板、电脑）的最佳阅读体验不同
 * 2. 手机可能需要较小的字体和边距，电脑可能需要较大的字体
 * 3. 避免设备间设置冲突，每个设备可以独立调整
 * 
 * 默认值说明：
 * - fontSize: 18px - 适中的字体大小，适合大多数设备
 * - lineHeight: 1.8 - 舒适的行距，符合中文阅读习惯
 * - margin: 20px - 适中的页边距
 * - textIndent: 2em - 首行缩进2个字符（中文排版标准）
 * - theme: 'dark' - 默认深色主题
 * - readerWidth: 'centered' - PC端默认居中显示（980px宽）
 * - pageTurnMethod: 'click' - 默认点击翻页（上下点击翻页）
 */
export const defaultSettings: ReadingSettings = {
  fontSize: 18,
  fontFamily: 'default',
  lineHeight: 1.8,
  theme: 'dark',
  brightness: 100,
  margin: 20,
  textIndent: 2,
  // 默认：上下点击翻页
  pageTurnMode: 'vertical',
  pageTurnMethod: 'click',
  clickToTurn: true,
  showBottomInfoBar: true,
  readerWidth: 'centered',
  pdfCropHorizontal: false, // PDF默认不裁剪左右白边
  pdfCropVertical: false, // PDF默认不裁剪上下白边
  pdfRenderQuality: 'ultra', // PDF默认使用最佳清晰度渲染
  pdfAutoFit: true, // PDF默认自适应屏幕
  pdfAutoRotate: false, // PDF默认不自动旋转页面
  officeZoom: 100, // Office文档默认100%缩放
  keyboardShortcuts: {
    prev: 'ArrowLeft',
    next: 'ArrowRight',
  },
};
