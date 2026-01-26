# PDF.js 中文显示问题修复指南

## 问题描述

使用本地 PDF.js 后，某些 PDF 中的中文无法显示。

## 原因分析

PDF.js 需要 CMap（字符映射）文件来正确显示中文、日文、韩文等字符。如果缺少或损坏了关键的 CMap 文件，就会导致中文显示问题。

## 解决方案

### 1. 运行修复脚本

```bash
cd frontend
node scripts/download-pdfjs-resources.js
```

脚本会自动：
- 检查现有 CMap 文件
- 删除损坏的小文件（< 1000 字节）
- 从多个 CDN 源下载缺失或损坏的文件
- 验证文件完整性

### 2. 关键 CMap 文件

以下文件对于中文显示至关重要：

**必需文件（水平文本）：**
- `UniGB-UCS2-H.bcmap` - Unicode GB UCS2 水平文本（最常用）
- `UniGB-UTF16-H.bcmap` - Unicode GB UTF16 水平文本
- `GBK-EUC-H.bcmap` - GBK 编码水平文本

**必需文件（垂直文本）：**
- `UniGB-UCS2-V.bcmap` - Unicode GB UCS2 垂直文本
- `UniGB-UTF16-V.bcmap` - Unicode GB UTF16 垂直文本
- `GBK-EUC-V.bcmap` - GBK 编码垂直文本

### 3. 验证文件完整性

运行脚本后，检查输出中的验证部分：

```
验证关键CMap文件完整性...
  ✓ UniGB-UCS2-H.bcmap: 43366 bytes
  ✓ UniGB-UCS2-V.bcmap: 193 bytes (损坏，需要重新下载)
  ...
```

如果文件大小小于 1000 字节，说明文件损坏，需要重新下载。

### 4. 手动下载（如果脚本失败）

如果脚本下载失败，可以手动下载：

```bash
cd frontend/public/pdfjs/cmaps

# 下载关键文件
curl -L -o UniGB-UCS2-V.bcmap "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/UniGB-UCS2-V.bcmap"
curl -L -o UniGB-UTF16-V.bcmap "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/UniGB-UTF16-V.bcmap"
curl -L -o GBK-EUC-V.bcmap "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/GBK-EUC-V.bcmap"
```

### 5. 检查文件大小

确保所有关键文件大小合理：

```bash
ls -lh frontend/public/pdfjs/cmaps/*.bcmap
```

正常文件应该至少几千字节：
- `UniGB-UCS2-H.bcmap`: ~43KB
- `UniGB-UCS2-V.bcmap`: ~43KB
- `UniGB-UTF16-H.bcmap`: ~44KB
- `UniGB-UTF16-V.bcmap`: ~44KB
- `GBK-EUC-H.bcmap`: ~14KB
- `GBK-EUC-V.bcmap`: ~14KB

如果文件只有几百字节，说明下载失败或文件损坏。

## 配置检查

确保 PDF.js 配置正确使用 CMap：

在 `ReaderPDFPro.tsx` 中，应该有以下配置：

```typescript
const loadingTask = pdfjsLib.getDocument({
  url: bookUrl,
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true, // 使用压缩的CMap文件
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  useSystemFonts: true, // 启用系统字体支持
});
```

## 常见问题

### Q: 为什么有些文件下载失败？

A: 某些 CMap 文件（如 UTF32 和部分 Adobe-GB1）在某些 PDF.js 版本中可能不存在。这些文件不是必需的，只要关键的 UniGB 和 GBK 文件完整即可。

### Q: Standard Fonts 文件下载失败怎么办？

A: Standard Fonts 文件不是必需的。如果下载失败，PDF.js 会使用系统字体作为后备方案，不影响基本功能。

### Q: 如何确认修复成功？

A: 
1. 检查所有关键 CMap 文件都存在且大小合理（> 1000 字节）
2. 打开一个包含中文的 PDF 文件
3. 检查浏览器控制台是否有 CMap 相关的错误
4. 确认中文能够正常显示

## 文件位置

所有 CMap 文件位于：
```
frontend/public/pdfjs/cmaps/
```

这些文件会被 Vite 自动复制到构建输出目录，无需额外配置。
