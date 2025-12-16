/**
 * @file epubConverter.ts
 * @author ttbye
 * @date 2025-12-11
 */
export declare function convertTxtToEpub(txtFilePath: string, title: string, author?: string): Promise<string>;
/**
 * 将 MOBI 文件转换为 EPUB 格式
 * 使用 Calibre 的 ebook-convert 命令行工具
 * @param mobiFilePath MOBI 文件路径
 * @returns EPUB 文件路径
 */
export declare function convertMobiToEpub(mobiFilePath: string): Promise<string>;
//# sourceMappingURL=epubConverter.d.ts.map