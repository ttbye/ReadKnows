/**
 * 端到端加密（E2EE）工具
 * 仅用于 1:1 好友文字消息：发送方用对方公钥+己方私钥派生密钥并 AES-GCM 加密，服务器只存密文。
 * 群聊、图片/语音/文件等不在此列。
 */

import api from './api';

const DB_NAME = 'ReadKnowsE2EE';
const STORE = 'keys';
const KEY_ID = 'main';
const E2EE_MAGIC = { e2ee: 1, v: 1 } as const;

// 公钥缓存：避免重复请求同一个用户的公钥
const publicKeyCache = new Map<string, { publicKey: string | null; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存有效期
const publicKeyFetchPromises = new Map<string, Promise<string | null>>(); // 防止并发请求同一个用户的公钥

function u8ToB64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
    r.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

export async function savePrivateKeyToStorage(jwk: JsonWebKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put({ privateKey: jwk }, KEY_ID);
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function loadPrivateKeyFromStorage(): Promise<JsonWebKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).get(KEY_ID);
    t.oncomplete = () => { db.close(); resolve((req.result?.privateKey) ?? null); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function hasLocalPrivateKey(): Promise<boolean> {
  const jwk = await loadPrivateKeyFromStorage();
  return !!jwk && typeof jwk === 'object' && !!jwk.kty;
}

/** 生成 ECDH P-256 密钥对，私钥写入 IndexedDB，返回公钥 JWK（用于上传到服务端） */
export async function generateKeyPairAndSave(): Promise<{ publicKeyJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const prv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  await savePrivateKeyToStorage(prv);
  return { publicKeyJwk: pub };
}

/** 上传公钥到服务端 */
export async function uploadPublicKey(publicKeyJwk: JsonWebKey): Promise<void> {
  await api.post('/users/me/e2ee-public-key', { _method: 'PUT', publicKey: JSON.stringify(publicKeyJwk) });
}

/** 从服务端获取对应用户的公钥（JWK 字符串，可为 null） */
export async function fetchUserPublicKey(userId: string): Promise<string | null> {
  // 检查缓存
  const cached = publicKeyCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.publicKey;
  }

  // 如果已经有正在进行的请求，等待它完成
  const existingPromise = publicKeyFetchPromises.get(userId);
  if (existingPromise) {
    return existingPromise;
  }

  // 创建新的请求Promise
  const fetchPromise = (async () => {
    try {
      let response;
      try {
        response = await api.get<{ publicKey: string | null }>(`/users/${userId}/e2ee-public-key`);
      } catch (error: any) {
        // 如果是429错误，等待1秒后重试一次
        if (error.response?.status === 429) {
          console.warn(`[E2EE] 获取用户${userId}公钥429错误，等待1秒后重试`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          response = await api.get<{ publicKey: string | null }>(`/users/${userId}/e2ee-public-key`);
        } else {
          throw error;
        }
      }

      const publicKey = response.data?.publicKey ?? null;
      
      // 更新缓存
      publicKeyCache.set(userId, {
        publicKey,
        timestamp: Date.now()
      });

      return publicKey;
    } catch (error) {
      console.error(`[E2EE] 获取用户${userId}公钥失败:`, error);
      // 缓存null值，避免重复请求失败的公钥（但缓存时间短一些）
      publicKeyCache.set(userId, {
        publicKey: null,
        timestamp: Date.now() - (CACHE_TTL - 30000) // 只缓存30秒
      });
      return null;
    } finally {
      // 清除正在进行的请求标记
      publicKeyFetchPromises.delete(userId);
    }
  })();

  // 保存Promise，防止并发请求
  publicKeyFetchPromises.set(userId, fetchPromise);

  return fetchPromise;
}

function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr) as JsonWebKey;
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
}

/** 使用 ECDH 共享秘密派生 AES-GCM 密钥 */
async function deriveAesKey(ourPrivate: CryptoKey, theirPublic: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublic },
    ourPrivate,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** 加密明文，返回可存入 content 的 JSON 字符串；失败返回 null */
export async function encrypt(plaintext: string, recipientUserId: string): Promise<string | null> {
  try {
    const [theirPkStr, myPrvJwk] = await Promise.all([
      fetchUserPublicKey(recipientUserId),
      loadPrivateKeyFromStorage(),
    ]);
    if (!theirPkStr || !myPrvJwk) return null;
    const [theirPublic, myPrivate] = await Promise.all([
      importPublicKey(theirPkStr),
      importPrivateKey(myPrvJwk),
    ]);
    const aes = await deriveAesKey(myPrivate, theirPublic);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aes,
      enc.encode(plaintext)
    );
    const obj = {
      ...E2EE_MAGIC,
      iv: u8ToB64(iv),
      ct: u8ToB64(new Uint8Array(ct)),
    };
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

/** 判断 content 是否为 E2EE 载荷 */
export function isE2EEContent(content: unknown): boolean {
  if (typeof content !== 'string') return false;
  try {
    const o = JSON.parse(content) as Record<string, unknown>;
    return o?.e2ee === 1 && typeof o?.iv === 'string' && typeof o?.ct === 'string';
  } catch {
    return false;
  }
}

/** 解密 E2EE 的 content，返回明文；失败返回 null。用于「接收方」：用己方私钥+发送方公钥派生。 */
export async function decrypt(content: string, senderUserId: string): Promise<string | null> {
  try {
    const o = JSON.parse(content) as { iv?: string; ct?: string };
    if (!o?.iv || !o?.ct) return null;

    const [senderPkStr, myPrvJwk] = await Promise.all([
      fetchUserPublicKey(senderUserId),
      loadPrivateKeyFromStorage(),
    ]);

    if (!senderPkStr || !myPrvJwk) return null;

    const [senderPublic, myPrivate] = await Promise.all([
      importPublicKey(senderPkStr),
      importPrivateKey(myPrvJwk),
    ]);

    const aes = await deriveAesKey(myPrivate, senderPublic);
    const iv = b64ToU8(o.iv);
    const ct = b64ToU8(o.ct);
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aes,
      ct
    );

    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
}

/** 以「发送方」身份解密：用己方私钥+收件人公钥派生（与 encrypt 时一致），用于在本地显示自己发出的消息原文。 */
export async function decryptAsSender(content: string, recipientUserId: string): Promise<string | null> {
  try {
    const o = JSON.parse(content) as { iv?: string; ct?: string };
    if (!o?.iv || !o?.ct) return null;
    const [theirPkStr, myPrvJwk] = await Promise.all([
      fetchUserPublicKey(recipientUserId),
      loadPrivateKeyFromStorage(),
    ]);
    if (!theirPkStr || !myPrvJwk) return null;
    const [theirPublic, myPrivate] = await Promise.all([
      importPublicKey(theirPkStr),
      importPrivateKey(myPrvJwk),
    ]);
    const aes = await deriveAesKey(myPrivate, theirPublic);
    const iv = b64ToU8(o.iv);
    const ct = b64ToU8(o.ct);
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aes,
      ct
    );
    return new TextDecoder().decode(buf);
  } catch {
    return null;
  }
}

/** 用恢复密码加密本机私钥并上传到服务器，供其他设备恢复。格式：{ v, salt, iter, iv, ct }，PBKDF2-SHA256 100000 次 + AES-256-GCM。 */
export async function createBackup(recoveryPassword: string): Promise<boolean> {
  try {
    const jwk = await loadPrivateKeyFromStorage();
    if (!jwk || typeof jwk !== 'object' || !jwk.kty) return false;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey('raw', enc.encode(recoveryPassword), 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      pwKey,
      256
    );
    const aesKey = await crypto.subtle.importKey('raw', derived, 'AES-GCM', false, ['encrypt']);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      aesKey,
      enc.encode(JSON.stringify(jwk))
    );
    const obj = { v: 1, salt: u8ToB64(salt), iter: 100000, iv: u8ToB64(iv), ct: u8ToB64(new Uint8Array(ct)) };
    await api.post('/users/me/e2ee-backup', { _method: 'PUT', encrypted: JSON.stringify(obj) });
    return true;
  } catch {
    return false;
  }
}

/** 从服务器拉取加密备份，用恢复密码解密后写入本机 IndexedDB。 */
export async function restoreFromBackup(recoveryPassword: string): Promise<boolean> {
  try {
    const { data } = await api.get<{ encrypted: string | null }>('/users/me/e2ee-backup');
    const raw = data?.encrypted;
    if (!raw || typeof raw !== 'string') return false;
    const obj = JSON.parse(raw) as { v?: number; salt?: string; iter?: number; iv?: string; ct?: string };
    if (!obj?.salt || !obj?.iv || !obj?.ct) return false;
    const iter = typeof obj.iter === 'number' && obj.iter > 0 ? obj.iter : 100000;
    const salt = b64ToU8(obj.salt);
    const iv = b64ToU8(obj.iv);
    const ct = b64ToU8(obj.ct);
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey('raw', enc.encode(recoveryPassword), 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      pwKey,
      256
    );
    const aesKey = await crypto.subtle.importKey('raw', derived, 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, ct);
    const jwk = JSON.parse(new TextDecoder().decode(pt)) as JsonWebKey;
    if (!jwk || typeof jwk !== 'object' || !jwk.kty) return false;
    await savePrivateKeyToStorage(jwk);
    return true;
  } catch {
    return false;
  }
}

/** 一站式启用 E2EE：生成密钥、保存私钥、上传公钥 */
export async function enableE2EE(): Promise<boolean> {
  try {
    const { publicKeyJwk } = await generateKeyPairAndSave();
    await uploadPublicKey(publicKeyJwk);
    return true;
  } catch {
    return false;
  }
}

/** 清除本机私钥（仅本地；服务端公钥需另调接口清除） */
export async function clearLocalPrivateKey(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(KEY_ID);
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}
