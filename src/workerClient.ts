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
  // Manager fix round (item 4, boot diagnostics): `worker` used to be a non-null `Worker` set
  // synchronously by an UNGUARDED `new Worker(...)` call, so a spawn failure (module worker type
  // unsupported, a blocked/failed resource fetch for the worker script on a cold iPad load, etc.)
  // threw straight out of `createWorkerClient()`, which App.tsx calls from a `useMemo` during
  // render. An uncaught render-time throw with no error boundary anywhere in the tree is exactly
  // Niko's reported "silent blank screen" (Preact fails to render the whole subtree, nothing is
  // shown, no message, "self-healed on reload" because whatever transient condition caused the
  // throw happened not to recur). `worker` is now `Worker | null`; a spawn failure never throws
  // out of this function, and is instead funneled through the SAME `fatal` channel every other
  // boot failure (loadPyodide throwing, the F7 hash self-check) already uses, so App.tsx's ONE
  // boot-error banner (added this round) covers all three named failure modes uniformly.
  let worker: Worker | null;
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

  // Deferred so subscribers registered AFTER createWorkerClient() returns (App.tsx's own
  // `useEffect` calling `worker.subscribe(...)`, which only runs after the first render commits)
  // still receive it. A synchronous emit here would reach zero external listeners: only the
  // `handleFatalRespawn` listener below is registered in time (it is added synchronously, in this
  // same function body), which is exactly why the respawn retry still works even for a spawn
  // failure on the very first attempt.
  function emitFatalSoon(reason: "oom" | "crash" | "unknown"): void {
    setTimeout(() => emit({ t: "fatal", reason }), 0);
  }

  function trySpawnWorker(): Worker | null {
    try {
      const w = new Worker(
        new URL("./worker-entry.ts", import.meta.url),
        { type: "module" }
      );
      w.onmessage = (event: MessageEvent<WorkerToMain>) => { emit(event.data); };
      w.onerror = (event) => { event.preventDefault(); emit({ t: "fatal", reason: "crash" }); };
      return w;
    } catch {
      return null;
    }
  }

  worker = trySpawnWorker();
  if (!worker) emitFatalSoon("unknown");

  function handleFatalRespawn(msg: WorkerToMain): void {
    if (msg.t !== "fatal" || disposed) return;
    const now = Date.now();
    while (respawnTimestamps.length > 0 && respawnTimestamps[0]! < now - RESPAWN_WINDOW_MS) {
      respawnTimestamps.shift();
    }
    if (respawnTimestamps.length >= MAX_RESPAWNS) return;
    respawnTimestamps.push(now);
    try { worker?.terminate(); } catch { /* already dead */ }
    worker = trySpawnWorker();
    if (!worker) { emitFatalSoon("unknown"); return; }
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
      //
      // Manager fix round, item 6(d): this used to ALSO wake a pending input() wait directly by
      // writing INPUT_STATUS_READY into the input SAB and notifying it, as if real data had
      // arrived. That was a real bug, not just belt-and-suspenders: it woke the worker's stdin
      // callback, but with no actual input bytes ever written, so the callback read STALE/garbage
      // data from a PRIOR input() call (or empty on the first one) and returned it as if the
      // learner had typed it, letting the "stopped" code keep running with wrong input instead of
      // actually stopping. Removed: pyodideEngine.ts's stdin callback now polls the interrupt
      // buffer itself in short bursts (Pyodide's own documented pattern for this), so writing
      // SIGINT here is already sufficient to interrupt a pending input() too, correctly, within
      // one poll interval, with no separate wake needed.
      if (msg.t === "stop" && interruptView) {
        Atomics.store(interruptView, 0, 2); // 2 = SIGINT
      }

      // worker can be null only when every spawn attempt (initial + respawns) has failed; the
      // `fatal` banner is already showing by the time that is true, and there is nothing left to
      // post to, so this is a safe, silent no-op rather than a throw.
      worker?.postMessage(msg);
    },

    subscribe(cb: (msg: WorkerToMain) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    dispose() {
      disposed = true;
      listeners.clear();
      worker?.terminate();
    }
  };
}
