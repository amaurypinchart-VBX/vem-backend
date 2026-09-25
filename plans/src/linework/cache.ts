// Cache des vues calculées dans le navigateur (IndexedDB) : une vue déjà calculée s'ouvre instantanément.
// Clé = empreinte (modèle, sous-ensemble, vue, style, version du moteur). Sans IndexedDB : pas de cache, sans erreur.
import type { Linework2D } from './types';

const DB_NAME = 'vem-plans';
const STORE = 'linework';
const MAX_ENTRIES = 400;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE);
        store.createIndex('at', 'at');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function cacheGet(key: string): Promise<Linework2D | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result?.lw as Linework2D) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cachePut(key: string, lw: Linework2D): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ lw, at: Date.now() }, key);
      // garde les plus récentes seulement
      const countReq = store.count();
      countReq.onsuccess = () => {
        let excess = countReq.result - MAX_ENTRIES;
        if (excess <= 0) return;
        store.index('at').openCursor().onsuccess = (ev) => {
          const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cur || excess-- <= 0) return;
          cur.delete();
          cur.continue();
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function hashKey(value: unknown): Promise<string> {
  const text = JSON.stringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
