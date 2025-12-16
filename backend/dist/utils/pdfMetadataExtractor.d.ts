/**
 * @file pdfMetadataExtractor.ts
 * @author ttbye
 * @date 2025-12-11
 */
/**
 * 从PDF文件中提取元数据（标题、作者等）
 * 优先使用pdf-parse，如果失败则尝试使用pdfjs-dist
 * @param pdfFilePath PDF文件路径
 * @returns 元数据对象
 */
export declare function extractPdfMetadata(pdfFilePath: string): Promise<{
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    keywords?: string;
    creationDate?: string;
    modificationDate?: string;
}>;
//# sourceMappingURL=pdfMetadataExtractor.d.ts.map