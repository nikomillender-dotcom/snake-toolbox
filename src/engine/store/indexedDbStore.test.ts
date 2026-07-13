import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { V1_COLLECTIONS, V2_NEW_COLLECTIONS } from "./schema.js";
import { IndexedDbStore, type IndexedDbEnvironment } from "./indexedDbStore.js";

// Each test gets a FRESH, isolated fake IndexedDB factory so tests never bleed into each other
// (a real risk if we reused one global fake-indexeddb instance across the suite).
let env: IndexedDbEnvironment;

beforeEach(() => {
  env = { indexedDB: new IDBFactory(), IDBKeyRange };
});

describe("IndexedDbStore basic CRUD (CONTRACT 2)", () => {
  it("round-trips get/put/delete", async () => {
    const store = await IndexedDbStore.open("t1", env);
    expect(await store.get("settings", "theme")).toBeUndefined();
    await store.put("settings", "theme", { mode: "dark" });
    expect(await store.get<{ mode: string }>("settings", "theme")).toEqual({ mode: "dark" });
    await store.delete("settings", "theme");
    expect(await store.get("settings", "theme")).toBeUndefined();
  });

  it("lists all entries in a collection, optionally filtered by prefix", async () => {
    const store = await IndexedDbStore.open("t2", env);
    await store.put("projects", "proj/alpha", { name: "alpha" });
    await store.put("projects", "proj/beta", { name: "beta" });
    await store.put("projects", "other/gamma", { name: "gamma" });

    const all = await store.list("projects");
    expect(all).toHaveLength(3);

    const prefixed = await store.list<{ name: string }>("projects", "proj/");
    expect(prefixed.map((e) => e.value.name).sort()).toEqual(["alpha", "beta"]);
  });

  it("reports schemaVersion 2 (v0.4 bump, P14 extended)", async () => {
    const store = await IndexedDbStore.open("t3", env);
    expect(store.schemaVersion).toBe(2);
  });

  it("rejects an unknown collection with a clear error rather than a native NotFoundError", async () => {
    const store = await IndexedDbStore.open("t4", env);
    await expect(store.get("madeUpCollection", "x")).rejects.toThrow(/Unknown Store collection/);
  });

  it("estimate() and requestPersist() degrade honestly with no navigator.storage in Node", async () => {
    const store = await IndexedDbStore.open("t5", env);
    expect(await store.estimate()).toEqual({ usage: 0, quota: 0 });
    expect(await store.requestPersist()).toBe(false);
  });
});

describe("schemaVersion 1 -> 2 migrate() hook (D6, checklist item 30, standalone)", () => {
  it("a fixture v1-shaped store migrates to v2 with reviews + githubMeta present and empty, v1 data intact", async () => {
    const dbName = "migration-fixture";

    // Step 1: build a genuine v1-shaped database by hand (version 1, only the six v1 collections),
    // and seed it with real data, exactly like a returning user's browser would hold.
    await new Promise<void>((resolve, reject) => {
      const req = env.indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of V1_COLLECTIONS) db.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("progress", "readwrite");
        tx.objectStore("progress").put([{ nodeId: "m1", kind: "module", moduleId: "m1", timestamp: 1 }], "completedNodes");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Step 2: open the SAME database name through IndexedDbStore, which opens at
    // CURRENT_SCHEMA_VERSION (2), triggering the REAL onupgradeneeded -> migrateV1ToV2 path with
    // oldVersion === 1, not a greenfield oldVersion === 0 path.
    const store = await IndexedDbStore.open(dbName, env);

    for (const name of V2_NEW_COLLECTIONS) {
      const rows = await store.list(name);
      expect(rows).toEqual([]); // present and empty
    }

    // v1 data survived the migration untouched.
    const progress = await store.get("progress", "completedNodes");
    expect(progress).toEqual([{ nodeId: "m1", kind: "module", moduleId: "m1", timestamp: 1 }]);
  });

  it("is a no-op on a brand new greenfield install (oldVersion 0), yet the code path still runs", async () => {
    const store = await IndexedDbStore.open("greenfield", env);
    for (const name of V2_NEW_COLLECTIONS) {
      expect(await store.list(name)).toEqual([]);
    }
    for (const name of V1_COLLECTIONS) {
      expect(await store.list(name)).toEqual([]);
    }
  });
});
