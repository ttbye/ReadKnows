/**
 * @file officeToPdfConverter.ts
 * @author ttbye
 * @date 2025-12-11
 * Office 文档转 PDF 转换器
 * 支持 docx, xlsx, pptx 等格式转换为 PDF
 */
/**
 * 使用 LibreOffice 将 Office 文档转换为 PDF
 */
export declare function convertOfficeToPdf(inputPath: string, outputDir: string, outputFileName?: string): Promise<string>;
/**
 * 检查 LibreOffice 是否可用
 */
export declare function checkLibreOfficeAvailable(): Promise<boolean>;
//# sourceMappingURL=officeToPdfConverter.d.ts.map