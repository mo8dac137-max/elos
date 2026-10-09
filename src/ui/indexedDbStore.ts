import type { ClientState } from '../kernel/index.js';
import { ClientStore, LoadResult, parseState, serializeState } from '../app/storage.js';

export class IndexedDbClientStore implements ClientStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      try {
        navigator.storage.persist().catch(() => {});
      } catch {
        // ignore errors
      }
    }
  }

  private getDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment');
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('elos', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('store')) {
            db.createObjectStore('store');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB database "elos"'));
      });
    }
    return this.dbPromise;
  }

  async load(): Promise<LoadResult> {
    const db = await this.getDb();
    return new Promise<LoadResult>((resolve, reject) => {
      const tx = db.transaction('store', 'readonly');
      const store = tx.objectStore('store');
      const req = store.get('client_state');
      req.onsuccess = () => {
        const val = req.result;
        if (val === undefined || val === null) {
          resolve({ status: 'empty' });
        } else if (typeof val === 'string') {
          resolve(parseState(val));
        } else {
          resolve({ status: 'corrupt', raw: String(val) });
        }
      };
      req.onerror = () => reject(req.error || new Error('Failed to read client_state from IndexedDB'));
    });
  }

  async save(state: ClientState): Promise<void> {
    const db = await this.getDb();
    const serialized = serializeState(state);
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('store', 'readwrite');
      const store = tx.objectStore('store');
      store.put(serialized, 'client_state');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save client_state to IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted while saving client_state'));
    });
  }
}
