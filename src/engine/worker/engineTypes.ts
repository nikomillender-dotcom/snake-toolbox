// PythonEngine: Hubert's OWN internal abstraction (NOT part of the frozen contract block) that
// sits behind WorkerProtocolEngine, so the message-pump logic in CONTRACT 1 can be driven by
// EITHER a scripted fake (the primary Node test suite, B11 doctrine: Pyodide itself is too heavy
// for unit suites) or a real Pyodide-backed implementation (pyodideEngine.ts, proven for real via
// the manual browser harness and, additionally, an opt-in real-Pyodide Node smoke suite, see
// BUILD-REPORT.md "what is proven where"). WorkerProtocolEngine never imports Pyodide directly;
// it only depends on this interface.
import type { FileBlob, HiddenTest, NamespaceId, TestOutcome } from "../../contracts.js";

export interface RunHooks {
  onStdout(text: string): void;
  onStderr(text: string): void;
  onFigure(png: Uint8Array, alt: string): void;
  onResult(repr: string): void;
  onError(errorType: string, message: string, line: number | null, traceback: string): void;
  // The engine calls this when the running program blocks on input(); it does not return a value.
  // A matching PythonEngine.provideInput(runId, bytes) call resumes the run.
  onInputRequest(prompt: string): void;
}

export interface RunParams {
  runId: string;
  code: string;
  mountFiles: FileBlob[];
  namespace: NamespaceId;
  hooks: RunHooks;
}

export interface CheckParams {
  runId: string;
  code: string;
  mountFiles: FileBlob[];
  hiddenTests: HiddenTest[];
  hooks: RunHooks;
}

export interface RunOutcome {
  ok: boolean;
}

export interface CheckOutcome {
  passed: boolean;
  results: TestOutcome[];
}

export interface RawNamespaceEntry {
  name: string;
  group: "import" | "function" | "variable";
  typeName: string;
  computeRepr: () => string;
}

export type PackageProgressPhase = "download" | "install" | "done";

export type FatalReason = "oom" | "crash" | "unknown";

export interface PythonEngine {
  boot(opts: {
    inputCapable: boolean;
    pyodideVersion: string;
    pyodideHash: string;
    interruptBuffer?: SharedArrayBuffer | null;
    inputBuffer?: SharedArrayBuffer | null;
  }): Promise<{ pyodideVersion: string }>;

  run(params: RunParams): Promise<RunOutcome>;
  check(params: CheckParams): Promise<CheckOutcome>;

  // Requests cancellation of an in-flight run/check. Real implementation: writes to the interrupt
  // SharedArrayBuffer (Atomics), which must win over a blocked input() (B4). The fake engine
  // simulates this cooperatively.
  stop(runId: string): void;

  // Resumes a run/check blocked on input().
  provideInput(runId: string, bytes: Uint8Array): void;

  loadPackage(
    name: string,
    onProgress: (phase: PackageProgressPhase, loadedBytes: number, totalBytes: number | null) => void,
  ): Promise<void>;

  resetNamespace(namespace: NamespaceId): Promise<boolean>;

  snapshotNamespace(namespace: NamespaceId): RawNamespaceEntry[];

  builtinNames(): ReadonlySet<string>;

  // v5 fileDrain (B6): returns new/changed files from the given namespace's MEMFS working dir.
  // Called by WorkerProtocolEngine after a session run to drain files back to the main thread.
  // UPSERT-ONLY: only files that are new or changed since the last drain, never deletions.
  // A graded check never calls this (isolation, F9); scratch has no file tree.
  drainFiles(namespace: NamespaceId): FileBlob[];

  // F10: registers a callback for an unexpected worker/interpreter death (OOM, crash), distinct
  // from a user-initiated stop(). Called at most in place of a pending run/check ever resolving.
  onFatal(cb: (reason: FatalReason) => void): void;
}
