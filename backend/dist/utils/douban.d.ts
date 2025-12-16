/**
 * @file douban.ts
 * @author ttbye
 * @date 2025-12-11
 */
export interface DoubanBookInfo {
    id?: string;
    title?: string;
    author?: string[];
    isbn?: string;
    publisher?: string;
    pubdate?: string;
    summary?: string;
    image?: string;
    rating?: {
        average?: number;
    };
    tags?: Array<{
        name?: string;
        title?: string;
        count?: number;
    }>;
}
export declare function searchBookByName(bookName: string): Promise<DoubanBookInfo[]>;
export declare function getBookById(id: string): Promise<DoubanBookInfo | null>;
export declare function getBookByISBN(isbn: string): Promise<DoubanBookInfo | null>;
//# sourceMappingURL=douban.d.ts.map