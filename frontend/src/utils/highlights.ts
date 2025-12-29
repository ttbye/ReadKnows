/**
 * EPUB 高亮本地缓存 + 离线队列 + 自动同步
 * 设计目标：
 * - 离线：先落本地并立即渲染
 * - 在线：自动同步到服务端持久化
 * - 下次打开：优先从本地缓存快速渲染，再从服务端刷新
 */

import api from './api';

export interface EpubHighlight {
  id: string; // 客户端生成 UUID，服务端同样使用该 ID（便于离线创建后同步）
  bookId: string;
  cfiRange: string;
  selectedText?: string;
  color?: string; // 预留
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

type QueueOp =
  | { op: 'upsert'; item: EpubHighlight }
  | { op: 'delete'; id: string; bookId: string; updatedAt: string };

const cacheKey = (bookId: string) => `epub-highlights-cache-${bookId}`;
const queueKey = () => `epub-highlights-queue`;

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

export function getLocalHighlights(bookId: string): EpubHighlight[] {
  const list = safeJsonParse<EpubHighlight[]>(localStorage.getItem(cacheKey(bookId)), []);
  return (list || []).filter((x) => x && x.bookId === bookId && !x.deleted);
}

function setLocalHighlights(bookId: string, items: EpubHighlight[]) {
  try {
    localStorage.setItem(cacheKey(bookId), JSON.stringify(items));
  } catch {
    // ignore
  }
}

function readQueue(): QueueOp[] {
  return safeJsonParse<QueueOp[]>(localStorage.getItem(queueKey()), []);
}

function writeQueue(q: QueueOp[]) {
  try {
    localStorage.setItem(queueKey(), JSON.stringify(q));
  } catch {
    // ignore
  }
}

export function addOrUpdateLocalHighlight(input: Omit<EpubHighlight, 'createdAt' | 'updatedAt'> & Partial<Pick<EpubHighlight, 'createdAt' | 'updatedAt'>>) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  const item: EpubHighlight = { ...input, createdAt, updatedAt } as EpubHighlight;

  const all = safeJsonParse<EpubHighlight[]>(localStorage.getItem(cacheKey(item.bookId)), []);
  const next = (() => {
    const idx = all.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      const merged = { ...all[idx], ...item, updatedAt };
      const copy = [...all];
      copy[idx] = merged;
      return copy;
    }
    return [item, ...all];
  })();

  setLocalHighlights(item.bookId, next);
  const q = readQueue();
  writeQueue([{ op: 'upsert', item }, ...q]);
  return item;
}

export function deleteLocalHighlight(bookId: string, id: string) {
  const all = safeJsonParse<EpubHighlight[]>(localStorage.getItem(cacheKey(bookId)), []);
  const updatedAt = nowIso();
  const next = all.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt } : x));
  setLocalHighlights(bookId, next);
  const q = readQueue();
  writeQueue([{ op: 'delete', id, bookId, updatedAt }, ...q]);
}

export function hasLocalHighlight(bookId: string, cfiRange: string): EpubHighlight | null {
  const list = safeJsonParse<EpubHighlight[]>(localStorage.getItem(cacheKey(bookId)), []);
  const found = (list || []).find((h) => !h.deleted && h.bookId === bookId && h.cfiRange === cfiRange);
  return found || null;
}

/**
 * 从服务端拉取高亮并刷新本地缓存（不覆盖本地未同步的更“新”的修改）。
 */
export async function refreshHighlightsFromServer(bookId: string): Promise<EpubHighlight[]> {
  const res = await api.get(`/highlights/book/${bookId}`);
  const serverList = (res.data?.highlights || []) as any[];
  const normalized: EpubHighlight[] = serverList.map((h) => ({
    id: String(h.id),
    bookId: String(h.book_id || bookId),
    cfiRange: String(h.cfi_range || ''),
    selectedText: h.selected_text ? String(h.selected_text) : undefined,
    color: h.color ? String(h.color) : undefined,
    createdAt: String(h.created_at || nowIso()),
    updatedAt: String(h.updated_at || h.created_at || nowIso()),
    deleted: !!h.deleted_at,
  })).filter((x) => x.cfiRange);

  const localAll = safeJsonParse<EpubHighlight[]>(localStorage.getItem(cacheKey(bookId)), []);
  const byId = new Map<string, EpubHighlight>();
  for (const x of normalized) byId.set(x.id, x);
  for (const x of localAll) {
    const s = byId.get(x.id);
    if (!s) {
      byId.set(x.id, x);
    } else {
      // 谁 updatedAt 更新用谁（简单冲突策略）
      if (String(x.updatedAt || '') > String(s.updatedAt || '')) {
        byId.set(x.id, x);
      }
    }
  }

  const merged = Array.from(byId.values());
  setLocalHighlights(bookId, merged);
  return merged.filter((x) => !x.deleted);
}

/**
 * 同步离线队列到服务端：逐条 upsert / delete。
 */
export async function syncHighlightQueue(): Promise<void> {
  if (!navigator.onLine) return;
  const q = readQueue();
  if (!q.length) return;

  const remaining: QueueOp[] = [];

  // 先进先出，避免反复覆盖
  for (let i = q.length - 1; i >= 0; i--) {
    const job = q[i];
    try {
      if (job.op === 'upsert') {
        const item = job.item;
        await api.post('/highlights', {
          id: item.id,
          bookId: item.bookId,
          cfiRange: item.cfiRange,
          selectedText: item.selectedText || null,
          color: item.color || null,
          updatedAt: item.updatedAt,
        });
      } else if (job.op === 'delete') {
        await api.delete(`/highlights/${job.id}`);
      }
    } catch {
      // 同步失败：保留该任务，后续再试
      remaining.push(job);
    }
  }

  writeQueue(remaining);
}

export function generateHighlightId(): string {
  // Safari/iOS/PWA 兼容：优先 crypto.randomUUID
  const anyCrypto: any = crypto as any;
  if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  // fallback：不追求强随机，只要冲突概率足够低
  return `hl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}


