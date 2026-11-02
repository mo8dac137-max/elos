import type { AuthSession } from '../sync/auth.js';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB unavailable');
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('elos', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('store')) {
          db.createObjectStore('store');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open database'));
    });
  }
  return dbPromise;
}

function isValidAuthSession(val: unknown): val is AuthSession {
  if (!val || typeof val !== 'object') return false;
  const o = val as Record<string, unknown>;
  return (
    typeof o.access_token === 'string' &&
    o.access_token.trim() !== '' &&
    typeof o.refresh_token === 'string' &&
    o.refresh_token.trim() !== '' &&
    typeof o.expires_at === 'string' &&
    o.expires_at.trim() !== ''
  );
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  try {
    const db = await getDb();
    return await new Promise<AuthSession | null>((resolve) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const req = store.get('auth_session');
      req.onsuccess = () => {
        let val = req.result;
        if (typeof val === 'string') {
          try {
            val = JSON.parse(val);
          } catch {
            resolve(null);
            return;
          }
        }
        if (isValidAuthSession(val)) {
          resolve(val);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    store.put(session, 'auth_session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save auth session'));
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted while saving auth session'));
  });
}

export async function clearAuthSession(): Promise<void> {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    store.delete('auth_session');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to clear auth session'));
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted while clearing auth session'));
  });
}

const LAST_SYNCED_KEY = 'elos.last_synced_at';

export function getLastSyncedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNCED_KEY);
  } catch {
    return null;
  }
}

export function setLastSyncedAt(iso: string): void {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, iso);
  } catch {
    // Storage unavailable
  }
}
