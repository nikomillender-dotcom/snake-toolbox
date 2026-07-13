// FakePythonEngine: the scripted test double that drives WorkerProtocolEngine in Node (B11
// doctrine: "unit suites run in Node with a scripted/mocked worker transport where Pyodide itself
// is too heavy"). It does not run real Python; `code` is a tiny JSON-encoded op list (FakeOp[])
// built with the helper functions below, kept deliberately small and readable in tests.
//
// It models the EXACT isolation policy F9 requires so leak tests are meaningful, not vacuous:
// - graded runs/checks ALWAYS start from a brand-new empty globals map (fresh every time).
// - scratch and session each keep their OWN persistent globals map across calls.
// - a shared `builtinsRegistry` simulates CPython's process-global builtins module: any namespace
//   can monkeypatch it (e.g. `import builtins; builtins.sum = ...`), but the hard reset run before
//   EVERY graded run/check restores it to the pristine snapshot captured at boot, exactly per the
//   F9 acceptable-implementation (b) checklist: purge user modules, restore builtins, reset the
//   random seed, clear the grading working dir, reset the recursion limit.
import type { FileBlob, NamespaceId } from "../../contracts.js";
import type {
  CheckOutcome,
  CheckParams,
  FatalReason,
  PackageProgressPhase,
  PythonEngine,
  RawNamespaceEntry,
  RunOutcome,
  RunParams,
} from "./engineTypes.js";

export type FakeOp =
  | { op: "setVar"; name: string; value: string; kind?: "variable" | "function" | "import" }
  | { op: "print"; text: string }
  | { op: "readVar"; name: string } // fails (raiseError) if not defined in the current globals
  | { op: "monkeypatchBuiltin"; name: string; value: string }
  | { op: "assertBuiltinPristine"; name: string } // fails if the shared builtin registry was tampered
  | { op: "raiseError"; errorType: string; message: string }
  | { op: "callInput"; prompt: string; assignTo: string }
  | { op: "figure"; alt: string }
  | { op: "result"; repr: string }
  | { op: "mutateRandomSeedMarker"; value: string } // simulates random.seed(N); reset() clears this
  | { op: "assertRandomSeedIsReset" }
  | { op: "writeGradingFile"; path: string; contents: string } // simulates a file dropped in the grading MEMFS dir
  | { op: "assertGradingFileAbsent"; path: string }
  | { op: "writeSessionFile"; path: string; contents: string } // S6: simulates a file written in the session MEMFS dir
  | { op: "sleepForever" }; // used to test stop()/interrupt

export function encodeOps(ops: FakeOp[]): string {
  return JSON.stringify(ops);
}

function decodeOps(code: string): FakeOp[] {
  if (!code.trim()) return [];
  return JSON.parse(code) as FakeOp[];
}

interface GlobalsEntry {
  value: string;
  kind: "variable" | "function" | "import";
}

const PRISTINE_BUILTINS = new Map<string, string>([
  ["print", "<builtin print>"],
  ["len", "<builtin len>"],
  ["sum", "<builtin sum>"],
  ["range", "<builtin range>"],
]);

export class FakePythonEngine implements PythonEngine {
  private inputCapable = false;
  private booted = false;
  private pyodideVersion = "";

  private namespaces: Record<NamespaceId, Map<string, GlobalsEntry>> = {
    graded: new Map(),
    scratch: new Map(),
    session: new Map(),
  };

  private builtinsRegistry = new Map(PRISTINE_BUILTINS);
  private randomSeedMarker: string | null = null;
  private gradingFiles = new Map<string, string>();

  private drainedSessionFiles: FileBlob[] = [];
  private pendingInputResolvers = new Map<string, { resolveInput: (bytes: Uint8Array) => void; abort: () => void }>();
  private stopRequested = new Set<string>();
  private fatalCb: ((reason: FatalReason) => void) | null = null;
  private forcedFatal: FatalReason | null = null;

  /** Test hook: force the next run/check to end in a "fatal" worker death (F10). */
  forceFatalOnNextRun(reason: FatalReason): void {
    this.forcedFatal = reason;
  }

  async boot(opts: { inputCapable: boolean; pyodideVersion: string; pyodideHash: string }): Promise<{ pyodideVersion: string }> {
    this.inputCapable = opts.inputCapable;
    this.pyodideVersion = opts.pyodideVersion;
    this.booted = true;
    return { pyodideVersion: this.pyodideVersion };
  }

  builtinNames(): ReadonlySet<string> {
    return new Set(this.builtinsRegistry.keys());
  }

  drainFiles(_namespace: NamespaceId): FileBlob[] {
    // The fake engine tracks files written during a session run via sessionFiles.
    // For now, return any files written to the session namespace since the last drain.
    const files = this.drainedSessionFiles;
    this.drainedSessionFiles = [];
    return files;
  }

  onFatal(cb: (reason: FatalReason) => void): void {
    this.fatalCb = cb;
  }

  /** F9: the hard isolation reset, run before EVERY graded run/check. */
  private hardResetForGrading(): void {
    this.namespaces.graded = new Map(); // fresh globals dict
    this.builtinsRegistry = new Map(PRISTINE_BUILTINS); // restore replaced builtins
    this.randomSeedMarker = null; // reset the random seed
    this.gradingFiles = new Map(); // clear the grading MEMFS working dir
    // (recursion limit reset has no meaningful Node analogue; documented as a real-engine-only step)
  }

  private execOps(
    ops: FakeOp[],
    globalsMap: Map<string, GlobalsEntry>,
    runId: string,
    hooks: RunParams["hooks"],
  ): { ok: boolean } {
    for (const instr of ops) {
      if (this.stopRequested.has(runId)) {
        this.stopRequested.delete(runId);
        return { ok: false };
      }
      switch (instr.op) {
        case "setVar":
          globalsMap.set(instr.name, { value: instr.value, kind: instr.kind ?? "variable" });
          break;
        case "print":
          hooks.onStdout(instr.text);
          break;
        case "readVar": {
          const entry = globalsMap.get(instr.name);
          if (!entry) {
            hooks.onError("NameError", `name '${instr.name}' is not defined`, null, "");
            return { ok: false };
          }
          break;
        }
        case "monkeypatchBuiltin":
          this.builtinsRegistry.set(instr.name, instr.value);
          break;
        case "assertBuiltinPristine": {
          const current = this.builtinsRegistry.get(instr.name);
          const pristine = PRISTINE_BUILTINS.get(instr.name);
          if (current !== pristine) {
            hooks.onError(
              "AssertionError",
              `builtin '${instr.name}' was not pristine (got ${String(current)})`,
              null,
              "",
            );
            return { ok: false };
          }
          break;
        }
        case "raiseError":
          hooks.onError(instr.errorType, instr.message, null, "");
          return { ok: false };
        case "callInput": {
          if (!this.inputCapable) {
            hooks.onError(
              "InputUnavailable",
              "input() is not available (interrupt/input disabled in this session)",
              null,
              "",
            );
            return { ok: false };
          }
          hooks.onInputRequest(instr.prompt);
          // Cooperative "block": the test resolves via provideInput(); this fake engine is
          // single-threaded/synchronous per exec pass, so blocking input is modeled by the async
          // run()/check() wrapper (see below), not here.
          break;
        }
        case "figure":
          hooks.onFigure(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), instr.alt);
          break;
        case "result":
          hooks.onResult(instr.repr);
          break;
        case "mutateRandomSeedMarker":
          this.randomSeedMarker = instr.value;
          break;
        case "assertRandomSeedIsReset":
          if (this.randomSeedMarker !== null) {
            hooks.onError("AssertionError", "random seed was not reset", null, "");
            return { ok: false };
          }
          break;
        case "writeGradingFile":
          this.gradingFiles.set(instr.path, instr.contents);
          break;
        case "assertGradingFileAbsent":
          if (this.gradingFiles.has(instr.path)) {
            hooks.onError("AssertionError", `grading file '${instr.path}' leaked across checks`, null, "");
            return { ok: false };
          }
          break;
        case "writeSessionFile":
          // S6: populate drainedSessionFiles so drainFiles returns them
          this.drainedSessionFiles.push({
            path: instr.path,
            text: instr.contents,
            encoding: "utf8",
          });
          break;
        case "sleepForever":
          // Handled by the caller (run() special-cases this before reaching execOps); if it ever
          // reaches here directly (e.g. inside a hidden test), treat it as an immediate stop.
          return { ok: false };
      }
    }
    return { ok: true };
  }

  async run(params: RunParams): Promise<RunOutcome> {
    if (!this.booted) throw new Error("run() called before boot()");
    if (this.forcedFatal) {
      const reason = this.forcedFatal;
      this.forcedFatal = null;
      queueMicrotask(() => this.fatalCb?.(reason));
      return new Promise(() => {}); // the run never resolves; the world learns via onFatal
    }

    const ops = decodeOps(params.code);
    const isGraded = params.namespace === "graded";
    if (isGraded) this.hardResetForGrading();
    const target = this.namespaces[params.namespace];

    if (ops.some((o) => o.op === "sleepForever")) {
      return this.runUntilStopped(params.runId);
    }
    if (ops.some((o) => o.op === "callInput")) {
      return this.runWithInput(ops, target, params);
    }

    const result = this.execOps(ops, target, params.runId, params.hooks);
    return { ok: result.ok };
  }

  private runUntilStopped(runId: string): Promise<RunOutcome> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.stopRequested.has(runId)) {
          this.stopRequested.delete(runId);
          resolve({ ok: false });
          return;
        }
        setTimeout(check, 1);
      };
      check();
    });
  }

  private runWithInput(ops: FakeOp[], target: Map<string, GlobalsEntry>, params: RunParams): Promise<RunOutcome> {
    return new Promise((resolve) => {
      let i = 0;
      const step = (): void => {
        while (i < ops.length) {
          const instr = ops[i];
          i += 1;
          if (!instr) continue;
          if (this.stopRequested.has(params.runId)) {
            this.stopRequested.delete(params.runId);
            this.pendingInputResolvers.delete(params.runId);
            resolve({ ok: false });
            return;
          }
          if (instr.op === "callInput") {
            if (!this.inputCapable) {
              params.hooks.onError(
                "InputUnavailable",
                "input() is not available (interrupt/input disabled in this session)",
                null,
                "",
              );
              resolve({ ok: false });
              return;
            }
            params.hooks.onInputRequest(instr.prompt);
            this.pendingInputResolvers.set(params.runId, {
              resolveInput: (bytes) => {
                target.set(instr.assignTo, { value: new TextDecoder().decode(bytes), kind: "variable" });
                step();
              },
              // Interrupt wins over a blocked input() (B4): stop() calls this directly so the
              // outer run() promise resolves immediately rather than waiting for a response that
              // may never come.
              abort: () => resolve({ ok: false }),
            });
            return; // wait for provideInput() or stop()
          }
          const outcome = this.execOps([instr], target, params.runId, params.hooks);
          if (!outcome.ok) {
            resolve({ ok: false });
            return;
          }
        }
        resolve({ ok: true });
      };
      step();
    });
  }

  async check(params: CheckParams): Promise<CheckOutcome> {
    if (!this.booted) throw new Error("check() called before boot()");
    // F9: check is ALWAYS graded + isolated, regardless of any prior namespace's state.
    this.hardResetForGrading();
    const target = this.namespaces.graded;

    const setupOutcome = this.execOps(decodeOps(params.code), target, params.runId, params.hooks);
    if (!setupOutcome.ok) {
      return { passed: false, results: [] };
    }

    const results = params.hiddenTests.map((test) => {
      const noopHooks: RunParams["hooks"] = {
        onStdout: () => {},
        onStderr: () => {},
        onFigure: () => {},
        onResult: () => {},
        onError: () => {},
        onInputRequest: () => {},
      };
      let failMessage: string | null = null;
      const capturingHooks: RunParams["hooks"] = {
        ...noopHooks,
        onError: (_type, message) => {
          failMessage = message;
        },
      };
      const outcome = this.execOps(decodeOps(test.code), target, params.runId, capturingHooks);
      return {
        id: test.id,
        group: test.group,
        passed: outcome.ok,
        message: outcome.ok ? test.message : (failMessage ?? test.message),
      };
    });

    return { passed: results.every((r) => r.passed), results };
  }

  stop(runId: string): void {
    this.stopRequested.add(runId);
    const pending = this.pendingInputResolvers.get(runId);
    if (pending) {
      // Interrupt wins over a blocked input() (B4): actively abort the pending run rather than
      // merely dropping the reference, so the run never hangs waiting for a response that may
      // never come. A late inputResponse afterward is a no-op (the entry is already gone).
      this.pendingInputResolvers.delete(runId);
      pending.abort();
    }
  }

  provideInput(runId: string, bytes: Uint8Array): void {
    const pending = this.pendingInputResolvers.get(runId);
    if (pending) {
      this.pendingInputResolvers.delete(runId);
      pending.resolveInput(bytes);
    }
  }

  async loadPackage(
    name: string,
    onProgress: (phase: PackageProgressPhase, loadedBytes: number, totalBytes: number | null) => void,
  ): Promise<void> {
    onProgress("download", 0, 1000);
    onProgress("download", 1000, 1000);
    onProgress("install", 1000, 1000);
    onProgress("done", 1000, 1000);
  }

  async resetNamespace(namespace: NamespaceId): Promise<boolean> {
    this.namespaces[namespace] = new Map();
    return true;
  }

  snapshotNamespace(namespace: NamespaceId): RawNamespaceEntry[] {
    const entries: RawNamespaceEntry[] = [];
    for (const [name, entry] of this.namespaces[namespace].entries()) {
      entries.push({
        name,
        group: entry.kind,
        typeName: entry.kind === "function" ? "function" : entry.kind === "import" ? "module" : "str",
        computeRepr: () => entry.value,
      });
    }
    return entries;
  }
}
