// WorkerProtocolEngine (CONTRACT 1, backend B2/B3). The message pump: translates MainToWorker
// into PythonEngine calls, and PythonEngine callbacks/results into WorkerToMain emissions. This is
// the ONE place that implements the protocol's bookkeeping rules:
// - boot: inputCapable is derived from whether BOTH SharedArrayBuffers are non-null (P1).
// - run: pushes a `namespace` event right after every `runDone` (F11 + P4 push half).
// - requestNamespace: the SEPARATE pull half (P4), same snapshot shape.
// - resetSession: replies with `resetDone{ok}` (P12); the caller decides whether to fire "Fresh
//   slate" on ok:true, this engine only reports the fact honestly.
// - check: ALWAYS graded + isolated; no namespace push (graded state is thrown away immediately).
// - fatal: wired once at construction via PythonEngine.onFatal, independent of any in-flight
//   request/response, so a worker death can be reported at any time (F10).
import type { MainToWorker, NamespaceId, WorkerToMain } from "../../contracts.js";
import { filterNamespace } from "./nameInfoFilter.js";
import type { PythonEngine, RunHooks } from "./engineTypes.js";

export class WorkerProtocolEngine {
  private inputCapable = false;
  private pyodideVersion = "";
  private previousNamesByNamespace = new Map<NamespaceId, Set<string>>([
    ["graded", new Set()],
    ["scratch", new Set()],
    ["session", new Set()],
  ]);

  constructor(
    private readonly engine: PythonEngine,
    private readonly emit: (msg: WorkerToMain) => void,
  ) {
    this.engine.onFatal((reason) => this.emit({ t: "fatal", reason }));
  }

  async handle(msg: MainToWorker): Promise<void> {
    switch (msg.t) {
      case "boot":
        return this.handleBoot(msg);
      case "run":
        return this.handleRun(msg);
      case "check":
        return this.handleCheck(msg);
      case "stop":
        this.engine.stop(msg.runId);
        return;
      case "inputResponse":
        this.engine.provideInput(msg.runId, msg.bytes);
        return;
      case "loadPackage":
        return this.handleLoadPackage(msg.name);
      case "resetSession":
        return this.handleResetSession(msg.namespace);
      case "requestNamespace":
        this.pushNamespace(msg.namespace);
        return;
      default: {
        // Exhaustiveness guard: if CONTRACT 1 ever grows a new MainToWorker variant, this line
        // fails to compile until this switch handles it (never silently ignored).
        const _exhaustive: never = msg;
        return _exhaustive;
      }
    }
  }

  private async handleBoot(msg: Extract<MainToWorker, { t: "boot" }>): Promise<void> {
    const inputCapable = msg.interruptBuffer !== null && msg.inputBuffer !== null;
    this.inputCapable = inputCapable;
    const result = await this.engine.boot({
      inputCapable,
      pyodideVersion: msg.pyodideVersion,
      pyodideHash: msg.pyodideHash,
      interruptBuffer: msg.interruptBuffer,
      inputBuffer: msg.inputBuffer,
    });
    this.pyodideVersion = result.pyodideVersion;
    this.emit({ t: "ready", pyodideVersion: this.pyodideVersion, inputCapable });
  }

  private async handleRun(msg: Extract<MainToWorker, { t: "run" }>): Promise<void> {
    const hooks = this.makeHooks(msg.runId);
    const outcome = await this.engine.run({
      runId: msg.runId,
      code: msg.code,
      mountFiles: msg.mountFiles,
      namespace: msg.namespace,
      hooks,
    });
    this.emit({ t: "runDone", runId: msg.runId, ok: outcome.ok });
    this.pushNamespace(msg.namespace);
    // v5 fileDrain: after a SESSION run, drain new/changed files to the main thread.
    // graded checks do NOT drain (isolation, F9); scratch has no file tree.
    if (msg.namespace === "session") {
      const files = this.engine.drainFiles(msg.namespace);
      if (files.length > 0) {
        this.emit({ t: "fileDrain", runId: msg.runId, namespace: msg.namespace, files });
      }
    }
  }

  private async handleCheck(msg: Extract<MainToWorker, { t: "check" }>): Promise<void> {
    const hooks = this.makeHooks(msg.runId);
    const outcome = await this.engine.check({
      runId: msg.runId,
      code: msg.code,
      mountFiles: msg.mountFiles,
      hiddenTests: msg.hiddenTests,
      hooks,
    });
    this.emit({ t: "checkResult", runId: msg.runId, passed: outcome.passed, results: outcome.results });
    // Manager fix round, item 6: this real engine never emitted `runDone` for a check message, only
    // `checkResult`. LearnScreen.tsx's `running` UI state (which gates the Check button itself, see
    // RunBar.tsx's `checkIsDisabled = ... || running`) is only ever cleared by `runDone`, so on the
    // REAL worker, Check permanently disabled itself the moment it was FIRST used on any hiddenTest-
    // route step (fixBug/writeStub/boss), for the rest of that step's visit; a fail-then-fix-then-
    // retry flow was simply broken. This escaped every existing test because
    // mocks/workerMock.ts's scripted stand-in (deliberately built as a faithful CONTRACT-1 double)
    // already emits BOTH events for a check, exactly the shape this brings the real engine in line
    // with; found only by this round's new E2E driving the REAL worker end to end (a real-vs-mock
    // divergence that a mocked-worker component test structurally cannot catch, however thorough).
    // No namespace push for check: graded state is fresh + thrown away immediately (F9), and the
    // Session Inspector only ever reflects scratch/session (B3).
    this.emit({ t: "runDone", runId: msg.runId, ok: outcome.passed });
  }

  private async handleLoadPackage(name: string): Promise<void> {
    await this.engine.loadPackage(name, (phase, loadedBytes, totalBytes) => {
      this.emit({ t: "packageProgress", name, phase, loadedBytes, totalBytes });
    });
  }

  private async handleResetSession(namespace: NamespaceId): Promise<void> {
    const ok = await this.engine.resetNamespace(namespace);
    if (ok) this.previousNamesByNamespace.set(namespace, new Set());
    this.emit({ t: "resetDone", namespace, ok });
  }

  private makeHooks(runId: string): RunHooks {
    return {
      onStdout: (text) => this.emit({ t: "stdout", runId, text }),
      onStderr: (text) => this.emit({ t: "stderr", runId, text }),
      onFigure: (png, alt) => this.emit({ t: "figure", runId, png, alt: alt || "figure output" }),
      onResult: (repr) => this.emit({ t: "result", runId, repr }),
      onError: (errorType, message, line, traceback) =>
        this.emit({ t: "error", runId, errorType, message, line, traceback }),
      onInputRequest: (prompt) => {
        if (!this.inputCapable) {
          // P1: never hang. Degraded boot disables input(); surface this as an honest error
          // rather than waiting forever for a response that can never come.
          this.emit({
            t: "error",
            runId,
            errorType: "InputUnavailable",
            message: "input() is not available (interrupt/input disabled in this session)",
            line: null,
            traceback: "",
          });
          return;
        }
        this.emit({ t: "inputRequest", runId, prompt });
      },
    };
  }

  private pushNamespace(namespace: NamespaceId): void {
    const raw = this.engine.snapshotNamespace(namespace);
    // graded is fresh + isolated every time (F9): its "previous" set is always empty, never
    // accumulated across separate graded run/check calls.
    const previous =
      namespace === "graded" ? new Set<string>() : (this.previousNamesByNamespace.get(namespace) ?? new Set<string>());
    const names = filterNamespace(raw, previous, this.engine.builtinNames());
    if (namespace !== "graded") {
      this.previousNamesByNamespace.set(namespace, new Set(raw.map((r) => r.name)));
    }
    this.emit({ t: "namespace", namespace, names });
  }
}
