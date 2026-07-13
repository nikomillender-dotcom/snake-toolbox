// IndexedDbStore (CONTRACT 2, backend B6). The ONE Store adapter; UI code never touches
// IndexedDB directly. Quota handling, hydration-wipe prevention, and migration live INSIDE the
// adapter so they travel with storage.
//
// Design choice (documented, not a contract deviation): collections are fixed to the schema's
// known set (the "suggested" B6 list) rather than fully open strings, because IndexedDB object
// stores must be created inside a versionchange transaction (onupgradeneeded); an unknown
// collection string cannot be created lazily on a later readwrite transaction, so this restriction
// is enforced defensively with a clear error rather than a native NotFoundError deep in the API.
//
// Design choice (documented, B6 "your call at build"): MEMFS hydrate/drain for a Python run's
// working files does NOT go through this Store. See worker/memfsDrain.ts for that decision.
import type { Store } from "../../contracts.js";
import { ALL_COLLECTIONS, CURRENT_SCHEMA_VERSION, V1_COLLECTIONS, V2_NEW_COLLECTIONS } from "./schema.js";

export const DEFAULT_DB_NAME = "snake-toolbox";

export interface IndexedDbEnvironment {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
}

function defaultEnvironment(): IndexedDbEnvironment {
  const g = globalThis as unknown as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  if (!g.indexedDB || !g.IDBKeyRange) {
    throw new Error(
      "No global indexedDB/IDBKeyRange found. In Node tests, pass an explicit environment " +
        "(e.g. fake-indexeddb's IDBFactory + IDBKeyRange); in a real browser/worker these globals exist.",
    );
  }
  return { indexedDB: g.indexedDB, IDBKeyRange: g.IDBKeyRange };
}

function assertKnownCollection(collection: string): void {
  if (!(ALL_COLLECTIONS as readonly string[]).includes(collection)) {
    throw new Error(
      `Unknown Store collection "${collection}". Known collections: ${ALL_COLLECTIONS.join(", ")}`,
    );
  }
}

/**
 * B6/D6: the real, unit-tested v1 -> v2 migration hook. A forward-add that is a no-op on
 * greenfield (nothing shipped at v1, so there is no data to convert), but it EXISTS and runs on
 * every DB open whose oldVersion < 2 (including every brand-new install, oldVersion === 0), so the
 * first in-anger v2 -> v3 migration is not this code path's first run (the Throughline "prove the
 * seam before you need it" discipline). See indexedDbStore.test.ts for the standalone proof: a
 * fixture v1-shaped database (only the six v1 collections, with real data in them) migrates to v2
 * with `reviews` and `githubMeta` PRESENT and EMPTY, and the v1 data untouched.
 */
export function migrateV1ToV2(db: IDBDatabase): void {
  for (const name of V2_NEW_COLLECTIONS) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
  }
}

function createV1Collections(db: IDBDatabase): void {
  for (const name of V1_COLLECTIONS) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
  }
}

function openDatabase(
  dbName: string,
  env: IndexedDbEnvironment,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = env.indexedDB.open(dbName, CURRENT_SCHEMA_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (oldVersion < 1) createV1Collections(db);
      if (oldVersion < 2) migrateV1ToV2(db);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`IndexedDB open blocked for "${dbName}"`));
  });
}

export class IndexedDbStore implements Store {
  readonly schemaVersion = CURRENT_SCHEMA_VERSION;

  private constructor(
    private readonly db: IDBDatabase,
    private readonly env: IndexedDbEnvironment,
  ) {}

  static async open(dbName: string = DEFAULT_DB_NAME, env?: IndexedDbEnvironment): Promise<IndexedDbStore> {
    const resolvedEnv = env ?? defaultEnvironment();
    const db = await openDatabase(dbName, resolvedEnv);
    return new IndexedDbStore(db, resolvedEnv);
  }

  close(): void {
    this.db.close();
  }

  async get<T>(collection: string, key: string): Promise<T | undefined> {
    assertKnownCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(collection, "readonly");
      const req = tx.objectStore(collection).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async put<T>(collection: string, key: string, value: T): Promise<void> {
    assertKnownCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(collection, "readwrite");
      tx.objectStore(collection).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    });
  }

  async delete(collection: string, key: string): Promise<void> {
    assertKnownCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(collection, "readwrite");
      tx.objectStore(collection).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    });
  }

  async list<T>(collection: string, prefix?: string): Promise<Array<{ key: string; value: T }>> {
    assertKnownCollection(collection);
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(collection, "readonly");
      const store = tx.objectStore(collection);
      const range =
        prefix !== undefined ? this.env.IDBKeyRange.bound(prefix, prefix + "￿") : undefined;
      const req = store.openCursor(range);
      const results: Array<{ key: string; value: T }> = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push({ key: String(cursor.key), value: cursor.value as T });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async estimate(): Promise<{ usage: number; quota: number }> {
    const nav = (globalThis as unknown as { navigator?: { storage?: StorageManager } }).navigator;
    if (nav?.storage?.estimate) {
      const est = await nav.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
    // Node / fixture environment: no navigator.storage. Report an honest zero rather than fake it.
    return { usage: 0, quota: 0 };
  }

  async requestPersist(): Promise<boolean> {
    const nav = (globalThis as unknown as { navigator?: { storage?: StorageManager } }).navigator;
    if (nav?.storage?.persist) {
      return nav.storage.persist();
    }
    return false;
  }
}
