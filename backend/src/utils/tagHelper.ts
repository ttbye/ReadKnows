/**
 * @author ttbye
 * 处理标签的工具函数
 */

/**
 * 从豆瓣API返回的标签数组中提取标签字符串
 */
export function extractTagsFromDouban(doubanTags?: Array<{ name?: string; title?: string; count?: number }>): string {
  if (!doubanTags || !Array.isArray(doubanTags) || doubanTags.length === 0) {
    return '';
  }

  // 提取标签名称，优先使用name，其次使用title
  const tagNames = doubanTags
    .map((tag) => tag.name || tag.title)
    .filter((name): name is string => !!name && typeof name === 'string')
    .filter((name, index, self) => self.indexOf(name) === index); // 去重

  return tagNames.join(', ');
}

/**
 * 合并标签（保留现有标签，添加新标签）
 */
export function mergeTags(existingTags?: string, newTags?: string): string {
  if (!newTags) return existingTags || '';
  if (!existingTags) return newTags;

  // 将两个标签字符串转换为数组
  const existing = existingTags.split(',').map((t) => t.trim()).filter((t) => t);
  const newTagsArray = newTags.split(',').map((t) => t.trim()).filter((t) => t);

  // 合并并去重
  const merged = [...new Set([...existing, ...newTagsArray])];

  return merged.join(', ');
}

