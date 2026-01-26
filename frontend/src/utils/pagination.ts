/**
 * @author ttbye
 * 智能分页算法
 * 根据内容高度、字体大小、行高等因素智能计算分页
 */

export interface PaginationResult {
  pages: PageInfo[];
  totalPages: number;
}

export interface PageInfo {
  pageNumber: number;
  startPosition: number;
  endPosition: number;
  height: number;
}

export class SmartPagination {
  /**
   * 计算智能分页
   * @param container 内容容器
   * @param pageHeight 每页高度
   * @returns 分页结果
   */
  static calculate(container: HTMLElement, pageHeight: number): PaginationResult {
    const pages: PageInfo[] = [];
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    if (scrollHeight <= 0 || clientHeight <= 0) {
      return { pages: [], totalPages: 0 };
    }

    // 如果内容高度小于等于容器高度，只有一页
    if (scrollHeight <= clientHeight) {
      pages.push({
        pageNumber: 1,
        startPosition: 0,
        endPosition: scrollHeight,
        height: scrollHeight,
      });
      return { pages, totalPages: 1 };
    }

    // 计算总页数
    const totalPages = Math.ceil(scrollHeight / pageHeight);

    // 为每一页计算位置
    for (let i = 0; i < totalPages; i++) {
      const startPosition = i * pageHeight;
      const endPosition = Math.min((i + 1) * pageHeight, scrollHeight);
      
      pages.push({
        pageNumber: i + 1,
        startPosition,
        endPosition,
        height: endPosition - startPosition,
      });
    }

    return { pages, totalPages };
  }

  /**
   * 根据滚动位置计算当前页
   * @param scrollTop 当前滚动位置
   * @param pageHeight 每页高度
   * @returns 当前页号（从1开始）
   */
  static getCurrentPage(scrollTop: number, pageHeight: number): number {
    if (pageHeight <= 0) return 1;
    return Math.floor(scrollTop / pageHeight) + 1;
  }

  /**
   * 计算下一页的滚动位置
   * @param currentPage 当前页号
   * @param pageHeight 每页高度
   * @param maxScrollTop 最大滚动位置
   * @returns 下一页的滚动位置
   */
  static getNextPagePosition(
    currentPage: number,
    pageHeight: number,
    maxScrollTop: number
  ): number {
    const nextPosition = currentPage * pageHeight;
    return Math.min(nextPosition, maxScrollTop);
  }

  /**
   * 计算上一页的滚动位置
   * @param currentPage 当前页号
   * @param pageHeight 每页高度
   * @returns 上一页的滚动位置
   */
  static getPrevPagePosition(currentPage: number, pageHeight: number): number {
    if (currentPage <= 1) return 0;
    return Math.max(0, (currentPage - 2) * pageHeight);
  }
}

