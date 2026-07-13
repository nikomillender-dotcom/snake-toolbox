// A minimal in-memory Store (CONTRACT 2) test double, used across suites that need a Store but
// are not specifically testing IndexedDbStore itself (that has its own real fake-indexeddb-backed
// tests in store/indexedDbStore.test.ts). Same semantics: collection+key addressing, prefix list.
import type { Store } from "../../contracts.js";

export function makeInMemoryStore(): Store {
  const data = new Map<string, Map<string, unknown>>();

  const collectionFor = (collection: string): Map<string, unknown> => {
    let c = data.get(collection);
    if (!c) {
      c = new Map();
      data.set(collection, c);
    }
    return c;
  };

  return {
    schemaVersion: 2,
    async get<T>(collection: string, key: string): Promise<T | undefined> {
      return collectionFor(collection).get(key) as T | undefined;
    },
    async put<T>(collection: string, key: string, value: T): Promise<void> {
      collectionFor(collection).set(key, value);
    },
    async delete(collection: string, key: string): Promise<void> {
      collectionFor(collection).delete(key);
    },
    async list<T>(collection: string, prefix?: string): Promise<Array<{ key: string; value: T }>> {
      const entries = Array.from(collectionFor(collection).entries());
      const filtered = prefix ? entries.filter(([k]) => k.startsWith(prefix)) : entries;
      return filtered.map(([key, value]) => ({ key, value: value as T }));
    },
    async estimate() {
      return { usage: 0, quota: 0 };
    },
    async requestPersist() {
      return false;
    },
  };
}
