/**
 * @author ttbye
 * 离线存储工具
 * 使用IndexedDB存储电子书文件，支持离线阅读
 */

const DB_NAME = 'EpubManagerDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

interface BookCache {
  bookId: string;
  fileType: string;
  blob: Blob;
  downloadedAt: number;
  fileSize: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'bookId' });
          objectStore.createIndex('fileType', 'fileType', { unique: false });
          objectStore.createIndex('downloadedAt', 'downloadedAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * 下载并缓存电子书
   */
  async downloadBook(bookId: string, fileType: string, url: string): Promise<Blob> {
    await this.init();

    // 检查是否已缓存
    const cached = await this.getBook(bookId);
    if (cached) {
      return cached;
    }

    try {
      // 下载文件
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileSize = blob.size;

      // 保存到IndexedDB
      const bookCache: BookCache = {
        bookId,
        fileType,
        blob,
        downloadedAt: Date.now(),
        fileSize,
      };

      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.put(bookCache);
        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => {
          console.error('OfflineStorage: 缓存失败', request.error);
          reject(request.error);
        };
      });

      return blob;
    } catch (error) {
      console.error('OfflineStorage: 下载失败', error);
      throw error;
    }
  }

  /**
   * 获取缓存的电子书
   */
  async getBook(bookId: string): Promise<Blob | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(bookId);

      request.onsuccess = () => {
        const result = request.result as BookCache | undefined;
        if (result && result.blob) {
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('OfflineStorage: 获取缓存失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 检查书籍是否已缓存
   */
  async isBookCached(bookId: string): Promise<boolean> {
    const cached = await this.getBook(bookId);
    return cached !== null;
  }

  /**
   * 删除缓存的书籍
   */
  async deleteBook(bookId: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(bookId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('OfflineStorage: 删除失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取所有缓存的书籍信息
   */
  async getAllCachedBooks(): Promise<BookCache[]> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as BookCache[]);
      };

      request.onerror = () => {
        console.error('OfflineStorage: 获取缓存列表失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取缓存大小
   */
  async getCacheSize(): Promise<number> {
    const books = await this.getAllCachedBooks();
    return books.reduce((total, book) => total + (book.fileSize || 0), 0);
  }

  /**
   * 清空所有缓存
   */
  async clearAll(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('OfflineStorage: 清空缓存失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 创建Blob URL
   */
  createBlobURL(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  /**
   * 释放Blob URL
   */
  revokeBlobURL(url: string): void {
    URL.revokeObjectURL(url);
  }
}

export const offlineStorage = new OfflineStorage();

