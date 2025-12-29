# 通用阅读器模块

本目录包含所有格式书籍阅读器共享的通用模块，支持 EPUB、PDF、TXT、DOCX、XLSX 等格式。

## 目录结构

```
common/
├── theme/              # 主题管理模块
│   └── themeManager.ts # 主题样式、字体、背景等
├── gesture/            # 手势处理模块
│   └── gestureHandler.ts # 触摸、鼠标、滑动、点击翻页
├── text-selection/     # 文本选择模块
│   └── textSelection.ts # 文本选择、选区上报、长按选句
└── utils/              # 通用工具函数
```

## 模块说明

### 1. 主题管理模块 (`theme/themeManager.ts`)

**功能**：
- 主题样式管理（light、dark、sepia、green）
- 字体族管理（serif、sans-serif、monospace、default）
- 主题配置（渐变、阴影、边框等视觉效果）
- EPUB 主题构建（用于 epubjs）
- 文档主题应用（通用方法，支持所有格式）
- 主题观察器（监听 DOM 变化自动应用主题）

**使用示例**：
```typescript
import { getThemeStyles, applyThemeToDocument, setupThemeObserver } from '../common/theme/themeManager';

// 获取主题样式
const themeStyles = getThemeStyles('dark');

// 应用主题到文档
applyThemeToDocument(document, settings, themeStyles);

// 设置主题观察器
const cleanup = setupThemeObserver(document, settingsRef, themeStyles);
```

### 2. 手势处理模块 (`gesture/gestureHandler.ts`)

**功能**：
- 滑动检测（水平/垂直）
- 点击检测（区分点击和滑动）
- 长按检测（用于显示导航栏）
- 中心区域检测（用于长按功能）
- 点击方向判断（用于点击翻页）
- React 组件手势处理器（返回事件处理函数）

**使用示例**：
```typescript
import { createGestureHandler } from '../common/gesture/gestureHandler';

const handlers = createGestureHandler({
  containerRef,
  settings: {
    pageTurnMethod: 'swipe',
    pageTurnMode: 'horizontal',
    clickToTurn: true,
  },
  loading: false,
  onPageTurn: (direction) => {
    // 处理翻页
  },
  onShowBars: () => {
    // 显示导航栏
  },
});

// 在组件中使用
<div
  onTouchStart={handlers.onTouchStart}
  onTouchMove={handlers.onTouchMove}
  onTouchEnd={handlers.onTouchEnd}
  onClick={handlers.onClick}
/>
```

### 3. 文本选择模块 (`text-selection/textSelection.ts`)

**功能**：
- 文本选择信息获取
- 选择事件监听（鼠标/触摸）
- 安全的选择事件发射（防误触）
- 长按选句功能
- CFI range 计算支持（EPUB 特有，通过回调函数传入）

**使用示例**：
```typescript
import { createSelectionListeners } from '../common/text-selection/textSelection';

// 通用文本选择（不包含 CFI）
const cleanup = createSelectionListeners(doc, win, iframeEl);

// EPUB 文本选择（包含 CFI）
import { createEpubSelectionListeners } from '../formats/epub/utils/epubUtils';
const cleanup = createEpubSelectionListeners(doc, win, iframeEl, rendition);
```

## 设计原则

1. **通用性**：所有模块都设计为格式无关，可以用于任何格式的阅读器
2. **可扩展性**：通过回调函数支持格式特有的功能（如 EPUB 的 CFI）
3. **类型安全**：完整的 TypeScript 类型定义
4. **清理机制**：所有监听器都返回清理函数，防止内存泄漏

## 后续扩展

当实现 PDF、TXT、DOCX 等阅读器时，可以：

1. **复用通用模块**：直接使用主题、手势、文本选择模块
2. **创建格式专用工具**：如 `pdf/utils/pdfUtils.ts`、`txt/utils/txtUtils.ts`
3. **创建格式专用服务**：如 `pdf/services/PdfCoreService.ts`
4. **创建格式专用组件**：如 `pdf/components/PdfViewer.tsx`

## 注意事项

- 通用模块不依赖任何格式特定的库（如 epubjs、pdfjs）
- 格式特有的功能通过回调函数或参数传入
- 所有模块都支持清理函数，确保资源正确释放

