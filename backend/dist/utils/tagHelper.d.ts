/**
 * @author ttbye
 * 处理标签的工具函数
 */
/**
 * 从豆瓣API返回的标签数组中提取标签字符串
 */
export declare function extractTagsFromDouban(doubanTags?: Array<{
    name?: string;
    title?: string;
    count?: number;
}>): string;
/**
 * 合并标签（保留现有标签，添加新标签）
 */
export declare function mergeTags(existingTags?: string, newTags?: string): string;
//# sourceMappingURL=tagHelper.d.ts.map