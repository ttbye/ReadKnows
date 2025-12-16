/**
 * @file pdfCoverExtractor.ts
 * @author ttbye
 * @date 2025-12-11
 */
/**
 * 从PDF第一页提取封面图片
 * 使用pdfjs-dist + canvas来渲染PDF第一页为图片
 * @param pdfFilePath PDF文件路径
 * @param outputDir 输出目录
 * @returns 封面图片的相对路径（相对于booksDir）
 */
export declare function extractPdfCover(pdfFilePath: string, outputDir: string): Promise<string | null>;
//# sourceMappingURL=pdfCoverExtractor.d.ts.map