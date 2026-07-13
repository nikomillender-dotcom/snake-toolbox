// offlineQueue (backend B8/B14, F14/R9). Durable queue in the same evictable IndexedDB (the
// `shipQueue` collection), flushed SEQUENTIALLY with a real gap between attempts (>=1s in
// production; injectable for fast tests), honoring Retry-After on 403/429, exponential-ish backoff,
// NEVER a parallel commit storm. Holds both ship artifacts and progress backups, since B14 states
// backup rides "the same offline queue with the same sequential + backoff + Retry-After discipline
// as ship."
import type { Artifact, BackupResult, FlushReport, ProgressBackup, ShipResult, Store } from "../../contracts.js";
import { GitHubApiError } from "./gitHubApiError.js";

export const SHIP_QUEUE_COLLECTION = "shipQueue";

export type QueueItem =
  | { kind: "ship"; id: string; artifact: Artifact; enqueuedAt: number }
  | { kind: "backup"; id: string; snapshot: ProgressBackup; enqueuedAt: number };

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}:${Date.now()}:${counter}`;
}

export interface FlushHandlers {
  processShip(artifact: Artifact): Promise<ShipResult>;
  processBackup(snapshot: ProgressBackup): Promise<BackupResult>;
}

export interface OfflineQueue {
  enqueueShip(artifact: Artifact): Promise<void>;
  enqueueBackup(snapshot: ProgressBackup): Promise<void>;
  length(): Promise<number>;
  flush(handlers: FlushHandlers): Promise<FlushReport>;
}

export interface OfflineQueueOptions {
  /** Minimum gap between sequential attempts. Production: >=1000ms. Tests: a few ms. */
  minGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createOfflineQueue(store: Store, options: OfflineQueueOptions = {}): OfflineQueue {
  const minGapMs = options.minGapMs ?? 1000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function readAll(): Promise<QueueItem[]> {
    const rows = await store.list<QueueItem>(SHIP_QUEUE_COLLECTION);
    return rows.map((r) => r.value).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  return {
    async enqueueShip(artifact) {
      const id = newId("ship");
      await store.put<QueueItem>(SHIP_QUEUE_COLLECTION, id, { kind: "ship", id, artifact, enqueuedAt: Date.now() });
    },
    async enqueueBackup(snapshot) {
      const id = newId("backup");
      await store.put<QueueItem>(SHIP_QUEUE_COLLECTION, id, { kind: "backup", id, snapshot, enqueuedAt: Date.now() });
    },
    async length() {
      return (await readAll()).length;
    },
    async flush(handlers) {
      const items = await readAll();
      let shipped = 0;
      let failed = 0;
      let backOffAndStop = false;

      const attempt = async (item: QueueItem): Promise<"done" | "stillQueued"> => {
        const result = item.kind === "ship" ? await handlers.processShip(item.artifact) : await handlers.processBackup(item.snapshot);
        const isDone = result.status === "live" || result.status === "saved";
        if (isDone) {
          await store.delete(SHIP_QUEUE_COLLECTION, item.id);
          return "done";
        }
        return "stillQueued";
      };

      for (let i = 0; i < items.length; i += 1) {
        if (backOffAndStop) break;
        const item = items[i];
        if (!item) continue;
        if (i > 0) await sleep(minGapMs); // NEVER a parallel commit storm (F14/R9)

        try {
          const outcome = await attempt(item);
          if (outcome === "done") shipped += 1;
        } catch (err) {
          if (err instanceof GitHubApiError && (err.status === 403 || err.status === 429)) {
            const waitMs = (err.retryAfterSeconds ?? 5) * 1000;
            await sleep(waitMs);
            try {
              const retryOutcome = await attempt(item);
              if (retryOutcome === "done") shipped += 1;
              else backOffAndStop = true; // back off the rest of this cycle rather than hammer a limited API
            } catch {
              failed += 1;
              backOffAndStop = true;
            }
          } else {
            failed += 1;
          }
        }
      }

      const queued = await (async () => (await readAll()).length)();
      return { shipped, queued, failed };
    },
  };
}
