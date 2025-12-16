/**
 * @file bookTextExtractor.ts
 * @author ttbye
 * @date 2025-12-11
 */
export declare function extractEpubText(filePath: string, maxLength?: number): Promise<string>;
export declare function extractPdfText(filePath: string, maxLength?: number): Promise<string>;
export declare function extractTxtText(filePath: string, maxLength?: number): Promise<string>;
export declare function extractBookText(bookId: string, maxLength?: number): Promise<string>;
export declare function extractDocxText(filePath: string, maxLength?: number): Promise<string>;
export declare function convertDocxToHtml(filePath: string): Promise<string>;
export declare function convertDocxToMarkdown(filePath: string): Promise<string>;
export declare function extractDocText(filePath: string, maxLength?: number): Promise<string>;
export declare function extractExcelText(filePath: string, maxLength?: number): Promise<string>;
export declare function extractMarkdownText(filePath: string, maxLength?: number): Promise<string>;
export declare function extractPptxText(filePath: string, maxLength?: number): Promise<string>;
//# sourceMappingURL=bookTextExtractor.d.ts.map