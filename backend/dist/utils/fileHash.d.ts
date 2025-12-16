/**
 * @file fileHash.ts
 * @author ttbye
 * @date 2025-12-11
 */
/**
 * 计算文件的SHA256哈希值
 */
export declare function calculateFileHash(filePath: string): Promise<string>;
/**
 * 生成短hash（用于目录名）
 */
export declare function getShortHash(fullHash: string, length?: number): string;
//# sourceMappingURL=fileHash.d.ts.map