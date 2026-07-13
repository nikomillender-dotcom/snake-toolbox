// workerClient.ts: the REAL main-thread WorkerClient (I1, the missing link).
// Instantiates worker-entry.ts as a Web Worker, adapts CONTRACT 1's message stream
// to the WorkerClient interface every screen already consumes, and handles:
//   - boot: gate SAB construction on crossOriginIsolated (P1 degraded path)
//   - fatal -> respawn (F10)
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

export function createWorkerClient(): WorkerClient {
  const listeners = new Set<(msg: WorkerToMain) => void>();
  let disposed = false;
  let worker: Worker;

  function emit(msg: WorkerToMain): void {
    if (disposed) return;
    for (const cb of listeners) cb(msg);
  }

  function spawnWorker(): Worker {
    // Vite's worker import syntax: new URL(..., import.meta.url) is statically analyzed
    // at build time, so Vite bundles worker-entry.ts into a separate chunk and serves it
    // correctly with the right MIME type and COOP/COEP headers.
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

  // F10: on a fatal event, the old worker is dead. Respawn a fresh one so the app
  // can recover (the UI shows the honest crash toast and a "cold" session marker).
  // Subscribe to our own emissions to detect fatal.
  function handleFatalRespawn(msg: WorkerToMain): void {
    if (msg.t === "fatal" && !disposed) {
      try { worker.terminate(); } catch { /* already dead */ }
      worker = spawnWorker();
    }
  }
  listeners.add(handleFatalRespawn);

  return {
    send(msg: MainToWorker) {
      if (disposed) return;
      // MainToWorker messages are structured-clone safe per CONTRACT 1.
      // SharedArrayBuffer is transferable across postMessage when COOP/COEP are set.
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
