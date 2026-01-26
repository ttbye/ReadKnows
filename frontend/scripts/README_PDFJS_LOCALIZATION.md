# PDF.js 资源本地化说明

## 概述

本项目已将 PDF.js 的所有第三方资源（worker、cmaps、standard_fonts）从 CDN 迁移到本地服务器，避免网络依赖问题。

## 资源位置

所有 PDF.js 资源已下载到 `frontend/public/pdfjs/` 目录：

```
public/pdfjs/
├── worker/
│   └── pdf.worker.min.js          # PDF.js Worker 文件
├── cmaps/                          # CMap 文件（用于中文显示）
│   ├── GBK-EUC-H.bcmap
│   ├── GBK-EUC-V.bcmap
│   └── ...
└── standard_fonts/                 # 标准字体文件
    ├── Courier-Bold.afm
    ├── Helvetica.afm
    └── ...
```

## 已修改的文件

### 1. `frontend/src/utils/pdfLoader.ts`
- **修改前**: 使用 CDN `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`
- **修改后**: 使用本地路径 `/pdfjs/worker/pdf.worker.min.js`

### 2. `frontend/src/components/readers/formats/ReaderPDFPro.tsx`
- **修改前**: 使用 CDN `https://unpkg.com/pdfjs-dist@${version}/cmaps/` 和 `standard_fonts/`
- **修改后**: 使用本地路径 `/pdfjs/cmaps/` 和 `/pdfjs/standard_fonts/`

## 下载脚本

使用 `frontend/scripts/download-pdfjs-resources.js` 脚本可以自动下载所有 PDF.js 资源：

```bash
cd frontend
node scripts/download-pdfjs-resources.js
```

脚本会：
1. 优先尝试从 `node_modules/pdfjs-dist` 复制文件
2. 如果 node_modules 中没有，则从 CDN 下载
3. 自动创建必要的目录结构

## 注意事项

1. **资源版本**: 当前使用的 PDF.js 版本是 `3.11.174`（与 `package.json` 中的 `pdfjs-dist` 版本一致）

2. **CMap 文件**: 如果某些 CMap 文件下载失败，PDF.js 仍可正常工作，但可能影响某些中文字符的显示。建议确保至少下载了以下关键文件：
   - `UniGB-UCS2-H.bcmap`
   - `UniGB-UCS2-V.bcmap`
   - `UniGB-UTF16-H.bcmap`
   - `UniGB-UTF16-V.bcmap`

3. **Standard Fonts**: 如果某些字体文件下载失败，PDF.js 会使用系统字体作为后备方案。

4. **构建和部署**: 
   - 这些文件位于 `public/` 目录，会被 Vite 自动复制到构建输出目录
   - 确保在构建和部署时包含这些文件

## 其他 CDN 引用

### 后端字体下载（服务器端，非前端 CDN）
`backend/src/utils/downloadFonts.ts` 中的字体下载功能是服务器端功能，用于将字体下载到服务器本地，不是前端 CDN 依赖。如需本地化，可以：
1. 预先下载字体文件到服务器
2. 修改下载脚本使用本地路径

## 验证

修改后，可以通过以下方式验证：

1. **检查网络请求**: 打开浏览器开发者工具，查看 Network 标签，确认不再有对 `cdnjs.cloudflare.com` 或 `unpkg.com` 的请求
2. **检查控制台**: 查看控制台日志，应该看到 `[PDF.js] 使用本地 worker: /pdfjs/worker/pdf.worker.min.js`
3. **测试 PDF 阅读**: 打开一个 PDF 文件，确认可以正常显示，特别是中文内容

## 故障排除

如果 PDF.js 无法加载：

1. **检查文件是否存在**: 
   ```bash
   ls -la frontend/public/pdfjs/worker/pdf.worker.min.js
   ```

2. **检查服务器配置**: 确保服务器可以访问 `/pdfjs/` 路径

3. **检查浏览器控制台**: 查看是否有 404 错误

4. **重新下载资源**: 运行下载脚本重新下载资源
