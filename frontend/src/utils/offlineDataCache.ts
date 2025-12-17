/**
 * @author ttbye
 * 离线数据缓存工具
 * 使用IndexedDB存储API响应数据，支持离线访问
 */

const DB_NAME = 'EpubManagerDataCache';
const DB_VERSION = 1;
const STORE_NAME = 'apiCache';

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  expiresAt: number;
}

class OfflineDataCache {
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
        console.error('数据缓存IndexedDB打开失败:', request.error);
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
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * 生成缓存键
   */
  private generateKey(url: string, params?: any): string {
    const paramsStr = params ? JSON.stringify(params) : '';
    return `${url}${paramsStr}`;
  }

  /**
   * 保存数据到缓存
   */
  async set(url: string, data: any, params?: any, maxAge: number = 60 * 60 * 24 * 7 * 1000): Promise<void> {
    await this.init();

    const key = this.generateKey(url, params);
    const now = Date.now();
    const entry: CacheEntry = {
      key,
      data,
      timestamp: now,
      expiresAt: now + maxAge,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('OfflineDataCache: 缓存失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 从缓存获取数据
   */
  async get(url: string, params?: any): Promise<any | null> {
    await this.init();

    const key = this.generateKey(url, params);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        
        if (!entry) {
          resolve(null);
          return;
        }

        // 检查是否过期
        if (Date.now() > entry.expiresAt) {
          // 删除过期缓存
          this.delete(url, params).catch(console.error);
          resolve(null);
          return;
        }

        resolve(entry.data);
      };

      request.onerror = () => {
        console.error('OfflineDataCache: 获取缓存失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除缓存
   */
  async delete(url: string, params?: any): Promise<void> {
    await this.init();

    const key = this.generateKey(url, params);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('OfflineDataCache: 删除失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 按 URL 前缀批量删除缓存（用于上传/新增后让列表强制刷新）
   */
  async deleteByPrefix(urlPrefix: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value as CacheEntry;
        if (typeof entry?.key === 'string' && entry.key.startsWith(urlPrefix)) {
          cursor.delete();
        }
        cursor.continue();
      };

      request.onerror = () => {
        console.error('OfflineDataCache: 前缀删除失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 清理过期缓存
   */
  async cleanExpired(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('expiresAt');
      const now = Date.now();
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
        console.error('OfflineDataCache: 清理失败', request.error);
        reject(request.error);
      };
    });
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
        console.error('OfflineDataCache: 清空失败', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 检查是否在线
   */
  isOnline(): boolean {
    return navigator.onLine;
  }
}

export const offlineDataCache = new OfflineDataCache();

// 定期清理过期缓存（每小时一次）
if (typeof window !== 'undefined') {
  setInterval(() => {
    offlineDataCache.cleanExpired().catch(console.error);
  }, 60 * 60 * 1000);
}

