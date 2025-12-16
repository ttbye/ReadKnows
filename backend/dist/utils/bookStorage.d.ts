/**
 * @file bookStorage.ts
 * @author ttbye
 * @date 2025-12-11
 */
/**
 * 清理文件名，移除非法字符
 */
export declare function sanitizeFileName(fileName: string): string;
/**
 * 根据书籍信息生成存储路径
 * 格式:
 * - 公开书籍: {booksDir}/public/{category}/{author}/{title}/
 * - 私有书籍: {booksDir}/user/{username}/{category}/{author}/{title}/
 */
export declare function generateBookPath(booksDir: string, title: string, author: string, category?: string, isPublic?: boolean, username?: string): string;
/**
 * 生成书籍文件名
 * 格式: {title}.{ext}
 */
export declare function generateBookFileName(title: string, fileExt: string): string;
/**
 * 确保目录存在
 */
export declare function ensureDirectoryExists(dirPath: string): void;
/**
 * 移动文件到新路径
 */
export declare function moveFile(oldPath: string, newPath: string): void;
/**
 * 复制文件到新路径
 */
export declare function copyFile(sourcePath: string, targetPath: string): void;
/**
 * 检查同一本书是否已存在（通过hash）
 */
export declare function findBookByHash(db: any, hash: string): any;
/**
 * 查找同一本书的其他格式（通过title和author）
 */
export declare function findSameBookOtherFormats(db: any, title: string, author: string, excludeId?: string): any[];
/**
 * 检查同一本书同格式是否已存在（通过title、author和file_type）
 */
export declare function findSameBookSameFormat(db: any, title: string, author: string, fileType: string, excludeId?: string): any;
/**
 * 查找一本书的所有格式（包括主书和子格式）
 */
export declare function findAllBookFormats(db: any, bookId: string): any[];
/**
 * 创建导入历史记录
 */
export declare function createImportHistory(db: any, userId: string, fileName: string, filePath: string | null, status: 'success' | 'skipped' | 'error', message: string, bookId?: string): void;
//# sourceMappingURL=bookStorage.d.ts.map