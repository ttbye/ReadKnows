/**
 * @author ttbye
 * 处理书籍封面URL的工具函数
 * 支持多种封面URL格式：
 * 1. 完整URL（http/https）- 通过代理访问（避免CORS）
 * 2. /books/路径 - 书籍目录下的cover图片（支持中文路径）
 * 3. API路径（/api/covers/）- 直接使用
 * 4. 相对路径 - 通过API访问
 * 5. 豆瓣图片URL - 通过代理访问
 */
export function getCoverUrl(coverUrl?: string | null): string | null {
  if (!coverUrl) return null;

  // 如果是/books/路径（书籍目录下的cover图片）
  if (coverUrl.startsWith('/books/')) {
    // 处理中文路径：对路径的每个部分进行编码
    try {
      // 分割路径
      const parts = coverUrl.split('/').filter(p => p);
      
      // 对每个部分进行编码（跳过已编码的部分）
      const encodedParts = parts.map(part => {
        // 检查是否已经编码
        try {
          if (decodeURIComponent(part) !== part) {
            // 已经编码，直接返回
            return part;
          }
        } catch (e) {
          // 解码失败，说明可能已经编码或包含特殊字符
        }
        // 编码部分（保留斜杠）
        return encodeURIComponent(part);
      });
      
      // 重新组合路径
      return '/' + encodedParts.join('/');
    } catch (error) {
      console.error('[coverHelper] URL编码失败:', coverUrl, error);
      // 编码失败，返回原始URL
    return coverUrl;
    }
  }

  // 如果已经是API路径，直接返回
  if (coverUrl.startsWith('/api/covers/')) {
    return coverUrl;
  }

  // 如果是完整URL（http/https开头），使用代理避免CORS问题
  if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) {
    // 使用后端代理
    return `/api/covers/proxy?url=${encodeURIComponent(coverUrl)}`;
  }

  // 如果是相对路径，添加API前缀
  if (coverUrl.startsWith('/')) {
    // 如果已经是/covers/路径，转换为/api/covers/
    if (coverUrl.startsWith('/covers/')) {
      return `/api${coverUrl}`;
    }
    return `${import.meta.env.VITE_API_URL || ''}${coverUrl}`;
  }

  // 如果是本地文件路径，尝试通过API访问
  if (coverUrl.includes('covers/') || coverUrl.includes('cover')) {
    const fileName = coverUrl.split('/').pop() || coverUrl;
    return `/api/covers/${encodeURIComponent(fileName)}`;
  }

  // 其他情况，假设是文件名，直接使用API路径
  return `/api/covers/${encodeURIComponent(coverUrl)}`;
}

/**
 * 检查图片是否可以加载
 */
export function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

