// SecretsVault (CONTRACT 2, backend B7, F1 BLOCKER + F6). MAIN-THREAD ONLY.
//
// Architectural choice (documented, not a contract deviation): the vault is backed by
// `localStorage`, not IndexedDB. This is a deliberate, stronger boundary than "a differently named
// IndexedDB object store": IndexedDB is an ORIGIN-scoped store reachable from both the main thread
// AND any same-origin Worker, so a worker with an unlocked JS FFI could in principle open the same
// database by name. `localStorage` (the synchronous Web Storage API) is a WINDOW-ONLY API: it does
// not exist on a Worker's global scope at all (no `self.localStorage`), so `import js; js.localStorage`
// from Python inside the worker has nothing to reach, not merely something it is asked nicely not
// to reach. Defense in depth on top of that: the worker bundle never imports this module at all
// (enforced by workerBoundaryGuard.ts, a static source-scan test), so there is no code path inside
// worker.js that even knows this collection's key prefix exists.
//
// F6 (never-log): the raw secret value is exposed ONLY inside the `useSecret(id, fn)` closure. No
// method returns, logs, or serializes the raw value. Token loss on Safari storage eviction is
// EXPECTED and handled as a calm re-auth by the frontend, not an edge case here.
import type { SecretId, SecretsVault } from "../../contracts.js";

export interface SecretStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY_PREFIX = "snake-toolbox:secret:";

export function defaultSecretStorageBackend(): SecretStorageBackend {
  const g = globalThis as unknown as { localStorage?: SecretStorageBackend };
  if (!g.localStorage) {
    throw new Error(
      "SecretsVault requires localStorage, a Window-only API that does not exist inside a Worker. " +
        "If this error fires inside worker code, the architectural boundary (F1 BLOCKER) has already " +
        "been violated: stop and route it through the Manager, do not add a fallback here.",
    );
  }
  return g.localStorage;
}

export function createSecretsVault(backend: SecretStorageBackend = defaultSecretStorageBackend()): SecretsVault {
  const keyFor = (id: SecretId): string => STORAGE_KEY_PREFIX + id;

  return {
    async setSecret(id, value) {
      backend.setItem(keyFor(id), value);
    },
    async hasSecret(id) {
      return backend.getItem(keyFor(id)) !== null;
    },
    async useSecret(id, fn) {
      const value = backend.getItem(keyFor(id));
      if (value === null) {
        throw new Error(`No secret set for id "${id}". Call setSecret() first.`);
      }
      // F6: the raw value lives only inside this call. It is never assigned to a variable the
      // caller retains, never returned, never logged.
      return fn(value);
    },
    async clearSecret(id) {
      backend.removeItem(keyFor(id));
    },
  };
}
