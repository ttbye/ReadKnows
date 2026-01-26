/**
 * @file audioCache.ts
 * @description 音频文件持久化缓存工具
 * 使用IndexedDB存储音频文件的Blob，支持离线播放
 */

const DB_NAME = 'AudiobookCache';
const DB_VERSION = 1;
const STORE_NAME = 'audioFiles';

interface AudioCacheEntry {
  key: string; // 格式: audiobookId:fileId
  audiobookId: string;
  fileId: string;
  blob: Blob;
  mimeType: string;
  fileSize: number;
  cachedAt: number;
  lastAccessed: number;
}

class AudioCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  
  // 缓存大小限制：默认500MB
  private readonly MAX_CACHE_SIZE = 500 * 1024 * 1024;
  
  // 缓存过期时间：30天
  private readonly MAX_AGE = 30 * 24 * 60 * 60 * 1000;

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
        console.error('[AudioCache] IndexedDB打开失败:', request.error);
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
          objectStore.createIndex('audiobookId', 'audiobookId', { unique: false });
          objectStore.createIndex('fileId', 'fileId', { unique: false });
          objectStore.createIndex('cachedAt', 'cachedAt', { unique: false });
          objectStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
          objectStore.createIndex('fileSize', 'fileSize', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * 生成缓存键
   */
  private generateKey(audiobookId: string, fileId: string): string {
    return `${audiobookId}:${fileId}`;
  }

  /**
   * 获取当前缓存总大小
   */
  private async getTotalCacheSize(): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('fileSize');
      const request = index.openCursor();
      let totalSize = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          const entry = cursor.value as AudioCacheEntry;
          totalSize += entry.fileSize || 0;
          cursor.continue();
        } else {
          resolve(totalSize);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 清理最旧的缓存，直到满足大小限制
   */
  private async cleanupOldCache(targetSize: number): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('lastAccessed');
      const request = index.openCursor(null, 'next'); // 按最后访问时间升序排列

      let currentSize = 0;
      const entriesToDelete: string[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (!cursor) {
          // 删除需要清理的条目
          entriesToDelete.forEach(key => {
            store.delete(key);
          });
          resolve();
          return;
        }

        const entry = cursor.value as AudioCacheEntry;
        currentSize += entry.fileSize || 0;

        if (currentSize > targetSize) {
          // 需要删除这个条目
          entriesToDelete.push(entry.key);
          cursor.delete();
        }

        cursor.continue();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 清理过期缓存
   */
  private async cleanExpired(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('cachedAt');
      const now = Date.now();
      const expiredTime = now - this.MAX_AGE;
      const range = IDBKeyRange.upperBound(expiredTime);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 保存音频文件到缓存
   */
  async set(
    audiobookId: string,
    fileId: string,
    blob: Blob,
    mimeType: string
  ): Promise<void> {
    await this.init();

    const key = this.generateKey(audiobookId, fileId);
    const now = Date.now();
    const entry: AudioCacheEntry = {
      key,
      audiobookId,
      fileId,
      blob,
      mimeType,
      fileSize: blob.size,
      cachedAt: now,
      lastAccessed: now,
    };

    // 检查缓存大小，如果超过限制则清理
    const totalSize = await this.getTotalCacheSize();
    if (totalSize + blob.size > this.MAX_CACHE_SIZE) {
      const targetSize = this.MAX_CACHE_SIZE - blob.size;
      await this.cleanupOldCache(targetSize);
    }

    // 清理过期缓存
    await this.cleanExpired();

    return new Promise((resolve, reject) => {
      // 先检查是否已存在，避免重复保存和日志
      const checkTransaction = this.db!.transaction([STORE_NAME], 'readonly');
      const checkStore = checkTransaction.objectStore(STORE_NAME);
      const checkRequest = checkStore.get(key);
      
      checkRequest.onsuccess = () => {
        const existing = checkRequest.result as AudioCacheEntry | undefined;
        
        if (existing) {
          // 已存在，只更新访问时间，不重复保存
          const updateTransaction = this.db!.transaction([STORE_NAME], 'readwrite');
          const updateStore = updateTransaction.objectStore(STORE_NAME);
          existing.lastAccessed = Date.now();
          updateStore.put(existing);
          resolve();
          return;
        }
        
        // 不存在，执行保存
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => {
          console.log(`[AudioCache] 缓存已保存: ${key} (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
          resolve();
        };

        request.onerror = () => {
          console.error('[AudioCache] 缓存保存失败:', request.error);
          reject(request.error);
        };
      };
      
      checkRequest.onerror = () => {
        // 检查失败，仍然尝试保存
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => {
          console.log(`[AudioCache] 缓存已保存: ${key} (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
          resolve();
        };

        request.onerror = () => {
          console.error('[AudioCache] 缓存保存失败:', request.error);
          reject(request.error);
        };
      };
    });
  }

  /**
   * 从缓存获取音频文件
   */
  async get(audiobookId: string, fileId: string): Promise<{ blob: Blob; mimeType: string; url: string } | null> {
    await this.init();

    const key = this.generateKey(audiobookId, fileId);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite'); // 使用readwrite以更新lastAccessed
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as AudioCacheEntry | undefined;
        
        if (!entry) {
          resolve(null);
          return;
        }

        // 检查是否过期
        const now = Date.now();
        if (now - entry.cachedAt > this.MAX_AGE) {
          // 删除过期缓存
          store.delete(key);
          resolve(null);
          return;
        }

        // 更新最后访问时间
        entry.lastAccessed = now;
        store.put(entry);

        // 创建blob URL
        const blobUrl = URL.createObjectURL(entry.blob);

        console.log(`[AudioCache] 从缓存加载: ${key} (${(entry.fileSize / 1024 / 1024).toFixed(2)}MB)`);
        resolve({
          blob: entry.blob,
          mimeType: entry.mimeType,
          url: blobUrl,
        });
      };

      request.onerror = () => {
        console.error('[AudioCache] 获取缓存失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除指定音频文件的缓存
   */
  async delete(audiobookId: string, fileId: string): Promise<void> {
    await this.init();

    const key = this.generateKey(audiobookId, fileId);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log(`[AudioCache] 缓存已删除: ${key}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[AudioCache] 删除缓存失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除指定有声小说的所有缓存
   */
  async deleteByAudiobookId(audiobookId: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('audiobookId');
      const request = index.openCursor(IDBKeyRange.only(audiobookId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
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
        console.log('[AudioCache] 所有缓存已清空');
        resolve();
      };

      request.onerror = () => {
        console.error('[AudioCache] 清空缓存失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{ totalSize: number; totalFiles: number; totalSizeMB: string }> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      let totalSize = 0;
      let totalFiles = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          const entry = cursor.value as AudioCacheEntry;
          totalSize += entry.fileSize || 0;
          totalFiles++;
          cursor.continue();
        } else {
          resolve({
            totalSize,
            totalFiles,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
          });
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

export const audioCache = new AudioCache();

// 定期清理过期缓存（每小时一次）
if (typeof window !== 'undefined') {
  setInterval(() => {
    audioCache['cleanExpired']().catch(console.error);
  }, 60 * 60 * 1000);
}
