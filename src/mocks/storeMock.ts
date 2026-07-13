// storeMock.ts, CONTRACT 2: an in-memory Store + SecretsVault stand-in.
//
// Real persistence (IndexedDB, quota handling, migration) is the engine's job. This mock exists so
// screens that depend on `Store`/`SecretsVault` (settings, the backup nudge, the PAT entry sheet)
// can be built and tested without a browser IndexedDB implementation. The composition root swaps
// in the real `IndexedDbStore` with no screen rewrite (I1 seam #1).

import type { SecretId, SecretsVault, Store } from "../contracts";

export function createMockStore(schemaVersion = 2): Store {
  const data = new Map<string, Map<string, unknown>>();
  function coll(name: string): Map<string, unknown> {
    let m = data.get(name);
    if (!m) {
      m = new Map();
      data.set(name, m);
    }
    return m;
  }
  return {
    schemaVersion,
    async get<T>(collection: string, key: string): Promise<T | undefined> {
      return coll(collection).get(key) as T | undefined;
    },
    async put<T>(collection: string, key: string, value: T): Promise<void> {
      coll(collection).set(key, value);
    },
    async delete(collection: string, key: string): Promise<void> {
      coll(collection).delete(key);
    },
    async list<T>(collection: string, prefix?: string) {
      const out: Array<{ key: string; value: T }> = [];
      for (const [key, value] of coll(collection).entries()) {
        if (!prefix || key.startsWith(prefix)) out.push({ key, value: value as T });
      }
      return out;
    },
    async estimate() {
      return { usage: 12_500_000, quota: 1_000_000_000 };
    },
    async requestPersist() {
      return true;
    }
  };
}

/** MAIN-THREAD ONLY per CONTRACT 2 (F1 BLOCKER). This mock never leaves the module scope it is
 * constructed in, and the raw value is only ever handed to the closure form (useSecret), matching
 * the real vault's never-return/never-log discipline (F6) even though this is just a fixture. */
export function createMockSecretsVault(): SecretsVault {
  const secrets = new Map<SecretId, string>();
  return {
    async setSecret(id, value) {
      secrets.set(id, value);
    },
    async hasSecret(id) {
      return secrets.has(id);
    },
    async useSecret(id, fn) {
      const value = secrets.get(id);
      if (value === undefined) throw new Error(`useSecret: no secret set for ${id}`);
      return fn(value);
    },
    async clearSecret(id) {
      secrets.delete(id);
    }
  };
}
