// worker-entry.ts: the REAL Web Worker entry point (I1, Hubert's open question 3).
// Wires WorkerProtocolEngine + PyodideEngine into a real self.onmessage handler.
// SAB buffers are passed through unchanged in the boot message (the protocol layer
// already handles null vs real SharedArrayBuffer).
//
// This file runs INSIDE the worker context. It never imports secrets, store, or any
// main-thread module (F1 boundary enforced by worker-guard).

import type { MainToWorker, WorkerToMain } from "./contracts";
import { WorkerProtocolEngine } from "./engine/worker/workerProtocolEngine";
import { PyodideEngine } from "./engine/worker/pyodideEngine";

const engine = new PyodideEngine();

function emit(msg: WorkerToMain): void {
  self.postMessage(msg);
}

const protocol = new WorkerProtocolEngine(engine, emit);

self.onmessage = async (event: MessageEvent<MainToWorker>) => {
  try {
    await protocol.handle(event.data);
  } catch (err) {
    // An unhandled error in the protocol layer is a genuine fatal; surface it
    // rather than letting the worker silently stop responding.
    emit({
      t: "fatal",
      reason: "crash",
    });
  }
};
