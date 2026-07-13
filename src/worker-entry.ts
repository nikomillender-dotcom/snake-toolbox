// worker-entry.ts: the REAL Web Worker entry point (I1).
// Wires WorkerProtocolEngine + PyodideEngine into a real self.onmessage handler.
// SAB buffers are passed through unchanged in the boot message (the protocol layer
// already handles null vs real SharedArrayBuffer).
//
// This file runs INSIDE the worker context. It never imports secrets, store, or any
// main-thread module (F1 boundary enforced by worker-guard).
//
// Pyodide is loaded from the self-hosted /pyodide/ directory (same-origin, no CDN,
// works offline under require-corp). The indexURL tells loadPyodide where to find
// the wasm, stdlib zip, and lock file.

import type { MainToWorker, WorkerToMain } from "./contracts";
import { WorkerProtocolEngine } from "./engine/worker/workerProtocolEngine";
import { PyodideEngine } from "./engine/worker/pyodideEngine";

// Compute the self-hosted Pyodide asset URL relative to the worker's location.
// In dev: /pyodide/  (served from public/)
// In prod: /pyodide/  (copied to dist/ by Vite's public folder handling)
const PYODIDE_INDEX_URL = new URL("/pyodide/", self.location.href).href;

// Browser-friendly wasm loader: fetches from the self-hosted path.
async function loadWasmBytesFromSelfHosted(): Promise<Uint8Array> {
  const response = await fetch(new URL("pyodide.asm.wasm", PYODIDE_INDEX_URL));
  if (!response.ok) {
    throw new Error(`Failed to fetch pyodide.asm.wasm: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const engine = new PyodideEngine({
  loadWasmBytes: loadWasmBytesFromSelfHosted,
  indexURL: PYODIDE_INDEX_URL,
});

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
