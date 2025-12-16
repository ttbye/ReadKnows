/**
 * @file version.ts
 * @author ttbye
 * @description 版本号管理工具
 */
/**
 * 生成带随机码的版本号
 * 格式：1.125.12-XXXXXX
 * 1: 大版本号（固定）
 * 125: 小版本号 = "1" + 年份后两位（2025 -> "25"） = "1" + "25" = "125"
 * 12: 编译月份
 * XXXXXX: 6位随机码
 */
export declare function generateVersion(): string;
/**
 * 获取当前版本号
 */
export declare function getVersion(): string;
/**
 * 保存版本号到文件
 */
export declare function saveVersion(version: string): void;
//# sourceMappingURL=version.d.ts.map