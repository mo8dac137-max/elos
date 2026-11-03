import type { DictEntry } from './types.js';

/**
 * Milestone I2: the dictionary cache. Every successful lookup is stored
 * locally forever (handoff C6: "cache every external result for each word
 * permanently") so answers are instant offline and the provider is called
 * at most once per word. Keys are lowercase lemmas.
 */

export interface DictCache {
  get(word: string): Promise<DictEntry | null>;
  put(word: string, entry: DictEntry): Promise<void>;
}

/** In-memory implementation (tests, and non-browser fallbacks). */
export class MemoryDictCache implements DictCache {
  private readonly map = new Map<string, DictEntry>();

  get(word: string): Promise<DictEntry | null> {
    return Promise.resolve(this.map.get(word.toLowerCase()) ?? null);
  }

  put(word: string, entry: DictEntry): Promise<void> {
    this.map.set(word.toLowerCase(), entry);
    return Promise.resolve();
  }
}

/**
 * IndexedDB-backed cache in its OWN database ("elos-dict", store "entries"),
 * fully separate from the learner-state database: dictionary reference data
 * can never interfere with client state or its schema version.
 */
export class IndexedDbDictCache implements DictCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(
        new Error('IndexedDB is not available in this environment')
      );
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('elos-dict', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('entries')) {
            db.createObjectStore('entries');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(req.error || new Error('Failed to open IndexedDB database "elos-dict"'));
      });
    }
    return this.dbPromise;
  }

  async get(word: string): Promise<DictEntry | null> {
    const db = await this.getDb();
    return new Promise<DictEntry | null>((resolve, reject) => {
      const tx = db.transaction('entries', 'readonly');
      const req = tx.objectStore('entries').get(word.toLowerCase());
      req.onsuccess = () => {
        const val = req.result;
        if (val === null || val === undefined) {
          resolve(null);
          return;
        }
        // Only trust records that still look like a DictEntry.
        if (
          typeof (val as DictEntry).word === 'string' &&
          Array.isArray((val as DictEntry).meanings)
        ) {
          resolve(val as DictEntry);
        } else {
          resolve(null);
        }
      };
      req.onerror = () =>
        reject(req.error || new Error('Failed to read a dictionary entry'));
    });
  }

  async put(word: string, entry: DictEntry): Promise<void> {
    const db = await this.getDb();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(entry, word.toLowerCase());
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('Failed to save a dictionary entry'));
      tx.onabort = () =>
        reject(tx.error || new Error('Dictionary cache write aborted'));
    });
  }
}

let sharedCache: DictCache | null = null;

/** The production cache: one shared IndexedDB dictionary per device. */
export function getDictCache(): DictCache {
  if (sharedCache === null) {
    sharedCache = new IndexedDbDictCache();
  }
  return sharedCache;
}
