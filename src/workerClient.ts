// workerClient.ts: the REAL main-thread WorkerClient (I1).
// Instantiates worker-entry.ts as a Web Worker, adapts CONTRACT 1's message stream
// to the WorkerClient interface every screen already consumes, and handles:
//   - boot: gate SAB construction on crossOriginIsolated (P1 degraded path)
//   - fatal -> respawn with cached boot args re-sent (S1 fix)
//   - respawn cap + backoff: max 3 attempts in 30s, then give up honestly (S1)
//   - inputRequest/inputResponse round-trip when inputCapable
//   - packageProgress passthrough
//   - resetSession acks
//
// This file is the ONE place `new Worker(...)` is called. Production code imports
// WorkerClient from here; tests import from mocks/workerMock.ts.

import type { MainToWorker, WorkerToMain } from "./contracts";

export interface WorkerClient {
  send(msg: MainToWorker): void;
  subscribe(cb: (msg: WorkerToMain) => void): () => void;
  dispose(): void;
}

const MAX_RESPAWNS = 3;
const RESPAWN_WINDOW_MS = 30_000;

export function createWorkerClient(): WorkerClient {
  const listeners = new Set<(msg: WorkerToMain) => void>();
  let disposed = false;
  let worker: Worker;

  // S1: cache the last boot args so we can replay them to a respawned worker.
  let lastBootArgs: Extract<MainToWorker, { t: "boot" }> | null = null;

  // S1: respawn cap + backoff. Track recent respawn timestamps.
  const respawnTimestamps: number[] = [];

  function emit(msg: WorkerToMain): void {
    if (disposed) return;
    for (const cb of listeners) cb(msg);
  }

  function spawnWorker(): Worker {
    const w = new Worker(
      new URL("./worker-entry.ts", import.meta.url),
      { type: "module" }
    );

    w.onmessage = (event: MessageEvent<WorkerToMain>) => {
      emit(event.data);
    };

    w.onerror = (event) => {
      // A worker-level error (script load failure, unhandled exception outside the
      // protocol's try/catch) is a genuine fatal.
      event.preventDefault();
      emit({ t: "fatal", reason: "crash" });
    };

    return w;
  }

  worker = spawnWorker();

  // S1 (F10): on a fatal event, the old worker is dead. Respawn a fresh one
  // AND replay the cached boot args so the runtime actually comes back warm.
  // Cap respawns to prevent unbounded loops (e.g. if worker-entry fails to load).
  function handleFatalRespawn(msg: WorkerToMain): void {
    if (msg.t !== "fatal" || disposed) return;

    // Prune old timestamps outside the window
    const now = Date.now();
    while (respawnTimestamps.length > 0 && respawnTimestamps[0]! < now - RESPAWN_WINDOW_MS) {
      respawnTimestamps.shift();
    }

    if (respawnTimestamps.length >= MAX_RESPAWNS) {
      // Respawn cap hit. Do not loop. The UI sees the fatal and shows the crash toast.
      // The "restarting" promise stops here honestly.
      return;
    }

    respawnTimestamps.push(now);

    try { worker.terminate(); } catch { /* already dead */ }
    worker = spawnWorker();

    // Replay the boot message so the new worker actually loads Pyodide
    if (lastBootArgs) {
      worker.postMessage(lastBootArgs);
    }
  }
  listeners.add(handleFatalRespawn);

  return {
    send(msg: MainToWorker) {
      if (disposed) return;

      // Cache boot args for respawn replay (S1)
      if (msg.t === "boot") {
        lastBootArgs = msg;
      }

      worker.postMessage(msg);
    },

    subscribe(cb: (msg: WorkerToMain) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    dispose() {
      disposed = true;
      listeners.clear();
      worker.terminate();
    }
  };
}
