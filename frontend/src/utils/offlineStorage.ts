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
      // 如果 URL 是相对路径，需要转换为完整的 URL
      let fullUrl = url;
      if (url.startsWith('/')) {
        // 导入 API 工具函数获取正确的 URL
        const { getFullBookUrl, getCustomApiUrl, getCurrentApiUrl, isAPKEnvironment } = await import('./api');
        // 使用统一的URL构建函数（支持自定义API URL）
        fullUrl = getFullBookUrl(url);
        
        // 检查是否为相对路径
        // 在Web环境下（非APK），相对路径可以通过Vite代理正常工作
        // 只有在APK环境中才需要完整URL
        const isAPK = isAPKEnvironment();
        
        // 如果仍然是相对路径，需要进一步处理
        if (fullUrl.startsWith('/') && !fullUrl.startsWith('http')) {
          // 首先尝试在Web环境中构建完整URL（即使isAPK为true，也可能误判）
          if (typeof window !== 'undefined' && window.location) {
            const origin = window.location.origin;
            // 如果origin有效（是http://或https://开头），使用它构建完整URL
            if (origin && (origin.startsWith('http://') || origin.startsWith('https://'))) {
              fullUrl = `${origin}${fullUrl}`;
              // 安全修复：仅在开发环境输出URL信息
              // console.log('[OfflineStorage] 使用window.location.origin构建完整URL:', fullUrl);
            } else if (isAPK) {
              // 只有在确认是APK环境且无法获取有效origin时，才要求配置服务器地址
              const customUrl = getCustomApiUrl();
              const currentApiUrl = getCurrentApiUrl();
              // 安全修复：仅在开发环境输出详细错误信息，避免泄露URL配置
              if (import.meta.env.DEV) {
                console.error('[OfflineStorage] 错误: 无法构建完整的下载URL', {
                  originalUrl: url,
                  fullUrl: fullUrl,
                  customApiUrl: customUrl,
                  currentApiUrl: currentApiUrl,
                  isAPK: isAPK,
                  origin: origin,
                  location: window.location ? {
                    protocol: window.location.protocol,
                    host: window.location.host,
                    hostname: window.location.hostname,
                    port: window.location.port,
                  } : null,
                });
              }
              
              throw new Error(
                '无法下载书籍：未配置服务器地址。请在应用设置中配置服务器地址（如: https://your-server.com 或 http://192.168.1.100:1281）'
              );
            } else {
              // Web环境但无法获取origin，尝试使用相对路径
              // 安全修复：仅在开发环境输出警告
              if (import.meta.env.DEV) {
                console.warn('[OfflineStorage] 无法获取有效的window.location.origin，使用相对路径', {
                  origin: origin,
                  location: window.location ? {
                    protocol: window.location.protocol,
                    host: window.location.host,
                  } : null,
                });
              }
            }
          } else if (isAPK) {
            // 没有window对象且是APK环境，需要配置服务器地址
            const customUrl = getCustomApiUrl();
            const currentApiUrl = getCurrentApiUrl();
            // 安全修复：仅在开发环境输出详细错误信息
            if (import.meta.env.DEV) {
              console.error('[OfflineStorage] 错误: 无法构建完整的下载URL（无window对象）', {
                originalUrl: url,
                fullUrl: fullUrl,
                customApiUrl: customUrl,
                currentApiUrl: currentApiUrl,
                isAPK: isAPK,
              });
            }
            
            throw new Error(
              '无法下载书籍：未配置服务器地址。请在应用设置中配置服务器地址（如: https://your-server.com 或 http://192.168.1.100:1281）'
            );
          }
        }
        
        // 安全修复：仅在开发环境输出URL转换信息
        // console.log('[OfflineStorage] 下载书籍 URL 转换:', { 
        //   original: url, 
        //   full: fullUrl,
        //   isAPK: isAPK,
        //   hasAuth: true
        // });
      }
      
      // 准备请求头（包含认证信息）
      const { getAuthHeaders } = await import('./api');
      const headers = getAuthHeaders();
      
      // 安全修复：仅在开发环境输出下载信息，避免泄露URL和认证头
      // console.log('[OfflineStorage] 开始下载书籍:', {
      //   url: fullUrl,
      //   bookId: bookId,
      //   hasHeaders: Object.keys(headers).length > 0,
      //   headerKeys: Object.keys(headers)
      // });
      
      // 下载文件（带认证头）
      const response = await fetch(fullUrl, {
        headers: headers,
      });
      
      // 安全修复：仅在开发环境输出响应信息
      // console.log('[OfflineStorage] 下载响应:', {
      //   status: response.status,
      //   statusText: response.statusText,
      //   ok: response.ok,
      //   headers: Object.fromEntries(response.headers.entries())
      // });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误信息');
        // 安全修复：仅在开发环境输出详细错误信息，避免泄露URL
        if (import.meta.env.DEV) {
          console.error('[OfflineStorage] 下载失败详情:', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText,
            url: fullUrl
          });
        }
        throw new Error(`下载失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.substring(0, 100)}` : ''}`);
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

