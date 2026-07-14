// workerMock.ts, L11: "Mock the worker as a scripted WorkerToMain emitter so you can build
// Run/Check/output/figure/input/error/namespace/runDone/resetDone/fatal states without Pyodide."
//
// This is NOT the real Pyodide worker (Hubert's job, backend-spec.md). It is a scripted, offline,
// in-process stand-in typed against CONTRACT 1 verbatim, exercising: F5 degraded boot
// (ready.inputCapable: false), F10 (fatal), F19 (inputRequest), the namespace PUSH after runDone
// vs the requestNamespace PULL (P4), and resetDone{ok} driving the Fresh Slate beat (P12). Screens
// built against the `WorkerClient` interface drop onto the real worker at the composition root
// with no rewrite (I1).

import type { MainToWorker, WorkerToMain, NamespaceId, NameInfo } from "../contracts";

export interface WorkerClient {
  send(msg: MainToWorker): void;
  subscribe(cb: (msg: WorkerToMain) => void): () => void;
  dispose(): void;
}

export interface MockWorkerOptions {
  /** simulate the F5 degraded-boot path: crossOriginIsolated === false, both SABs null */
  inputCapable?: boolean;
  /** artificial per-event delay in ms, kept small so tests stay fast */
  delayMs?: number;
  /** Manager fix round (item 4, boot diagnostics): simulate a boot that never reaches "ready" and
   * instead reports fatal (loadPyodide throwing, or the F7 hash self-check failing, both real
   * worker-entry.ts/pyodideEngine.ts paths that end up as a `fatal` message; this mock exists so
   * App-level tests can drive that same outcome without a real Worker/Pyodide). */
  bootFatal?: "oom" | "crash" | "unknown";
}

const FIXTURE_NAMES: Record<string, NameInfo[]> = {
  first: [
    { name: "utils", group: "import", typeName: "module", repr: "<module utils.py>", fromCurrentRun: true },
    { name: "load", group: "function", typeName: "function", repr: "load(path)", fromCurrentRun: true },
    { name: "mean", group: "function", typeName: "function", repr: "mean(seq)", fromCurrentRun: true },
    { name: "data", group: "variable", typeName: "list[float]", repr: "[2.0, 4.0, 4.5, 3.0]", fromCurrentRun: true },
    { name: "avg", group: "variable", typeName: "float", repr: "3.5", fromCurrentRun: true }
  ]
};

/** Creates the scripted worker stand-in. Every screen talks to this through the same
 * `WorkerClient` shape the real composition root will hand them (I1 seam). */
export function createMockWorkerClient(options: MockWorkerOptions = {}): WorkerClient {
  const { inputCapable = true, delayMs = 12, bootFatal } = options;
  const listeners = new Set<(msg: WorkerToMain) => void>();
  const namespaceNames = new Map<NamespaceId, NameInfo[]>([
    ["graded", []],
    ["scratch", []],
    ["session", []]
  ]);
  const pendingInput = new Map<string, (bytes: Uint8Array) => void>();
  let disposed = false;
  let runCounter = 0;

  function emit(msg: WorkerToMain): void {
    if (disposed) return;
    listeners.forEach((cb) => cb(msg));
  }

  function after(fn: () => void): void {
    setTimeout(() => {
      if (!disposed) fn();
    }, delayMs);
  }

  function pushNamespace(namespace: NamespaceId): void {
    emit({ t: "namespace", namespace, names: namespaceNames.get(namespace) ?? [] });
  }

  function growSession(namespace: NamespaceId): void {
    const current = namespaceNames.get(namespace) ?? [];
    const grown = current.length === 0 ? FIXTURE_NAMES.first!.map((n) => ({ ...n })) : current.map((n) => ({ ...n, fromCurrentRun: false }));
    if (current.length > 0) {
      runCounter += 1;
      grown.push({
        name: `run${runCounter}`,
        group: "variable",
        typeName: "int",
        repr: String(40 + runCounter),
        fromCurrentRun: true
      });
    }
    namespaceNames.set(namespace, grown);
  }

  function handleRun(msg: Extract<MainToWorker, { t: "run" }>): void {
    const { runId, code, namespace } = msg;
    if (code.includes("CRASH_WORKER")) {
      after(() => emit({ t: "fatal", reason: "crash" }));
      return;
    }
    if (code.includes("input(")) {
      const prompt = "what should I name this run?";
      after(() => {
        emit({ t: "inputRequest", runId, prompt });
        pendingInput.set(runId, (bytes) => {
          const text = new TextDecoder().decode(bytes);
          after(() => {
            emit({ t: "stdout", runId, text: `you said: ${text}\n` });
            if (namespace !== "graded") growSession(namespace);
            emit({ t: "runDone", runId, ok: true });
            pushNamespace(namespace);
          });
        });
      });
      return;
    }
    if (code.includes("1 / 0") || code.includes("1/0")) {
      after(() => {
        emit({
          t: "error",
          runId,
          errorType: "ZeroDivisionError",
          message: "division by zero",
          line: 1,
          traceback: 'Traceback (most recent call last):\n  File "<stdin>", line 1\nZeroDivisionError: division by zero'
        });
        emit({ t: "runDone", runId, ok: false });
        pushNamespace(namespace);
      });
      return;
    }
    after(() => {
      emit({ t: "stdout", runId, text: "3.5\n" });
      if (namespace !== "graded") growSession(namespace);
      emit({ t: "runDone", runId, ok: true });
      pushNamespace(namespace);
      // v5: session runs emit a fileDrain event (simulated with a fixture file)
      if (namespace === "session" && code.includes("open(")) {
        emit({ t: "fileDrain", runId, namespace, files: [
          { path: "output.txt", text: "generated output\n", encoding: "utf8" }
        ] });
      }
    });
  }

  function handleCheck(msg: Extract<MainToWorker, { t: "check" }>): void {
    const { runId, code, hiddenTests } = msg;
    // Mock simplification (documented in BUILD-REPORT.md): real grading is the engine's job
    // (Hubert). This mock passes every test unless the code carries the demo marker below, so
    // CheckResult's pass/fail/hint states are all reachable offline for UI verification.
    const forceFail = code.includes("# FAIL_CHECK");
    after(() => {
      const results = hiddenTests.map((test, i) => ({
        id: test.id,
        group: test.group,
        passed: !forceFail || i > 0,
        message: test.message,
        actual: forceFail && i === 0 ? "Niko" : undefined,
        expected: forceFail && i === 0 ? "Hi Niko, welcome to the ToolBox" : undefined
      }));
      const passed = results.every((r) => r.passed);
      emit({ t: "checkResult", runId, passed, results });
      emit({ t: "runDone", runId, ok: true });
      pushNamespace("graded");
    });
  }

  return {
    send(msg: MainToWorker) {
      switch (msg.t) {
        case "boot": {
          if (bootFatal) {
            after(() => emit({ t: "fatal", reason: bootFatal }));
            return;
          }
          const capable = inputCapable && msg.interruptBuffer !== null && msg.inputBuffer !== null;
          after(() => emit({ t: "ready", pyodideVersion: msg.pyodideVersion, inputCapable: capable }));
          return;
        }
        case "run":
          handleRun(msg);
          return;
        case "check":
          handleCheck(msg);
          return;
        case "stop":
          after(() => emit({ t: "runDone", runId: msg.runId, ok: false }));
          return;
        case "inputResponse": {
          const resolver = pendingInput.get(msg.runId);
          pendingInput.delete(msg.runId);
          resolver?.(msg.bytes);
          return;
        }
        case "loadPackage":
          after(() => emit({ t: "packageProgress", name: msg.name, phase: "download", loadedBytes: 0, totalBytes: 1_000_000 }));
          after(() => emit({ t: "packageProgress", name: msg.name, phase: "install", loadedBytes: 1_000_000, totalBytes: 1_000_000 }));
          after(() => emit({ t: "packageProgress", name: msg.name, phase: "done", loadedBytes: 1_000_000, totalBytes: 1_000_000 }));
          return;
        case "resetSession":
          namespaceNames.set(msg.namespace, []);
          runCounter = 0;
          after(() => emit({ t: "resetDone", namespace: msg.namespace, ok: true }));
          return;
        case "requestNamespace":
          pushNamespace(msg.namespace);
          return;
        default: {
          const _exhaustive: never = msg;
          return _exhaustive;
        }
      }
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      disposed = true;
      listeners.clear();
      pendingInput.clear();
    }
  };
}
