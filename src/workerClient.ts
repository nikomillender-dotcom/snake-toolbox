// workerClient.ts: the REAL main-thread WorkerClient (I1).
// Handles the SAB input/interrupt handshake per B4.
import type { MainToWorker, WorkerToMain } from "./contracts";

export interface WorkerClient {
  send(msg: MainToWorker): void;
  subscribe(cb: (msg: WorkerToMain) => void): () => void;
  dispose(): void;
}

const MAX_RESPAWNS = 3;
const RESPAWN_WINDOW_MS = 30_000;
// B4 SAB input handshake: matches the constants in pyodideEngine.ts
const INPUT_STATUS_READY = 1;
const INPUT_HEADER_BYTES = 8;

export function createWorkerClient(): WorkerClient {
  const listeners = new Set<(msg: WorkerToMain) => void>();
  let disposed = false;
  let worker: Worker;
  let lastBootArgs: Extract<MainToWorker, { t: "boot" }> | null = null;
  const respawnTimestamps: number[] = [];

  // B4: refs to the SABs for the input handshake (set from the boot message)
  let inputBuffer: SharedArrayBuffer | null = null;
  let inputInt32: Int32Array | null = null;
  let inputDataView: Uint8Array | null = null;
  let interruptView: Int32Array | null = null;

  function emit(msg: WorkerToMain): void {
    if (disposed) return;
    for (const cb of listeners) cb(msg);
  }

  function spawnWorker(): Worker {
    const w = new Worker(
      new URL("./worker-entry.ts", import.meta.url),
      { type: "module" }
    );
    w.onmessage = (event: MessageEvent<WorkerToMain>) => { emit(event.data); };
    w.onerror = (event) => { event.preventDefault(); emit({ t: "fatal", reason: "crash" }); };
    return w;
  }

  worker = spawnWorker();

  function handleFatalRespawn(msg: WorkerToMain): void {
    if (msg.t !== "fatal" || disposed) return;
    const now = Date.now();
    while (respawnTimestamps.length > 0 && respawnTimestamps[0]! < now - RESPAWN_WINDOW_MS) {
      respawnTimestamps.shift();
    }
    if (respawnTimestamps.length >= MAX_RESPAWNS) return;
    respawnTimestamps.push(now);
    try { worker.terminate(); } catch { /* already dead */ }
    worker = spawnWorker();
    if (lastBootArgs) worker.postMessage(lastBootArgs);
  }
  listeners.add(handleFatalRespawn);

  return {
    send(msg: MainToWorker) {
      if (disposed) return;

      if (msg.t === "boot") {
        lastBootArgs = msg;
        // Store SAB refs for the input handshake
        inputBuffer = msg.inputBuffer;
        if (inputBuffer) {
          inputInt32 = new Int32Array(inputBuffer);
          inputDataView = new Uint8Array(inputBuffer, INPUT_HEADER_BYTES);
        }
        if (msg.interruptBuffer) {
          interruptView = new Int32Array(msg.interruptBuffer);
        }
      }

      // SF6 (Frederick full-gate should-fix): clear the interrupt buffer HERE, synchronously on
      // the main thread, at the moment a new run is actually initiated, strictly before the "run"
      // message is even posted. This used to happen worker-side, inside pyodideEngine.run(), which
      // opened a real race: the worker's postMessage queue can sit unprocessed for a long stretch
      // under CPU contention, and if the user clicked Stop in that window (writing SIGINT=2
      // directly into this same buffer below), the worker-side clear would silently overwrite it
      // back to 0 the moment "run" was finally dequeued, permanently losing the Stop for that run
      // (see pyodideEngine.ts's run() comment for the full trace). Clearing here instead cannot
      // race with a Stop click: Stop can only be clicked by the user AFTER Run was already
      // initiated, and this thread is single-threaded, so "clear, then post run" is atomic with
      // respect to any later click handler.
      if (msg.t === "run" && interruptView) {
        Atomics.store(interruptView, 0, 0);
      }

      // B4: inputResponse writes directly to the SAB and notifies the blocked worker.
      // The worker is blocked on Atomics.wait in the stdin callback and cannot process
      // postMessage, so we bypass the message queue entirely.
      if (msg.t === "inputResponse" && inputInt32 && inputDataView) {
        const bytes = msg.bytes;
        // Write the input data into the SAB
        inputDataView.set(bytes.slice(0, inputDataView.length));
        // Write the length
        Atomics.store(inputInt32, 1, bytes.length);
        // Signal data ready and wake the worker
        Atomics.store(inputInt32, 0, INPUT_STATUS_READY);
        Atomics.notify(inputInt32, 0);
        return; // do NOT post the message
      }

      // B4: stop() writes SIGINT to the interrupt buffer to raise KeyboardInterrupt.
      // Also post the message so WorkerProtocolEngine can handle cleanup.
      if (msg.t === "stop" && interruptView) {
        Atomics.store(interruptView, 0, 2); // 2 = SIGINT
        // If the worker is blocked on Atomics.wait for input, we also need to wake it
        if (inputInt32) {
          Atomics.store(inputInt32, 0, INPUT_STATUS_READY);
          Atomics.notify(inputInt32, 0);
        }
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
