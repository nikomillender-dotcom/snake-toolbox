// PyodideEngine: the REAL PythonEngine implementation, backed by the pinned Pyodide build
// (PINS.md, version 314.0.2). This is the concrete class a real Web Worker wires up in the browser
// (via workerEntry.ts, not built in this pass, see BUILD-REPORT.md open items). It also backs an
// OPT-IN, heavier real-Pyodide Node smoke suite (pyodideEngine.realpyodide.test.ts, excluded from
// the default `npm test` run, see vitest.config.ts) that proves the F9 isolation algorithm against
// genuine CPython-on-wasm, going beyond the FakePythonEngine's scripted-policy proof.
//
// Known real-engine limitation (documented, not hidden): input()/interrupt depend on a
// SharedArrayBuffer + Atomics handshake between a Web Worker and the main thread (B4), which has no
// meaningful equivalent in a plain Node script. stop()/provideInput() are therefore best-effort
// stubs here; the REAL handshake is proven only via the manual browser harness
// (manual-harness/pyodide-harness.html), never a unit test, per B11's testing doctrine.
import type { FileBlob, NamespaceId } from "../../contracts.js";
import { classifyBytes } from "../classifyBytes.js";
import type {
  CheckOutcome,
  CheckParams,
  FatalReason,
  PackageProgressPhase,
  PythonEngine,
  RawNamespaceEntry,
  RunHooks,
  RunOutcome,
  RunParams,
} from "./engineTypes.js";

// Minimal structural type for the pieces of PyodideInterface this engine touches, so this file
// does not need the full `pyodide` type surface just to compile. The real npm package's types are
// used at the call site (loadPyodide's return value structurally satisfies this).
interface PyProxyDict {
  get(key: string): unknown;
  toJs(opts?: { dict_converter?: (entries: Iterable<[unknown, unknown]>) => unknown }): unknown;
}
interface PyProxyCallable {
  (...args: unknown[]): { toJs(): unknown };
}
interface MinimalPyodide {
  version: string;
  globals: PyProxyDict;
  runPython(code: string, options?: { globals?: PyProxyDict }): unknown;
  runPythonAsync(code: string, options?: { globals?: PyProxyDict }): Promise<unknown>;
  toPy(obj: unknown): PyProxyDict;
  loadPackage(names: string | string[]): Promise<void>;
  setInterruptBuffer(buffer: Int32Array): void;
  // Manager fix round, item 6(d): throws KeyboardInterrupt if SIGINT was written to the interrupt
  // buffer since the last check. Pyodide's own documented pattern for an interruptible stdin poll
  // loop (pyodide.org/en/stable/usage/keyboard-interrupts.html, version-pinned to match this
  // project's 314.0.2).
  checkInterrupt(): void;
  // stdin may return `undefined` (or `null`) to signal EOF, which makes a pending input() raise
  // EOFError in the running Python code rather than block forever (item 6a: used to force EOF
  // during check(), never real interactive input; also the poll-loop's timeout branch, item 6d).
  setStdin(opts: { stdin: () => string | undefined }): void;
  FS: {
    mkdir(path: string): void;
    readdir(path: string): string[];
    readFile(path: string, opts?: { encoding?: string }): string | Uint8Array;
    unlink(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    analyzePath(path: string): { exists: boolean };
  };
}

const BOOTSTRAP_PY = `
import sys, random, builtins

_pristine_builtins = None
_pristine_modules = None

def _capture_pristine():
    global _pristine_builtins, _pristine_modules
    _pristine_builtins = dict(vars(builtins))
    _pristine_modules = set(sys.modules.keys())

def _hard_reset_for_grading():
    # F9 acceptable-implementation (b): restore replaced builtins (by VALUE, not just by name),
    # remove any builtin ADDED since boot, purge user-defined modules, reset the random seed, and
    # reset the recursion limit. Verified by hand against this exact bootstrap (see the Node
    # experiment log in the build session): a monkeypatched builtin VALUE is restored, not just a
    # renamed/re-added key.
    for name in list(vars(builtins).keys()):
        if name not in _pristine_builtins:
            delattr(builtins, name)
    for name, value in _pristine_builtins.items():
        setattr(builtins, name, value)
    for name in list(sys.modules.keys()):
        if name not in _pristine_modules:
            del sys.modules[name]
    random.seed()
    sys.setrecursionlimit(1000)

def _snapshot_namespace(g):
    import types
    out = []
    for name, value in list(g.items()):
        if name.startswith("__"):
            continue
        if isinstance(value, types.ModuleType):
            group = "import"
        elif callable(value):
            group = "function"
        else:
            group = "variable"
        try:
            r = repr(value)
        except Exception:
            r = "<repr() raised an exception>"
        if len(r) > 200:
            r = r[:200] + "..."
        out.append((name, group, type(value).__name__, r))
    return out
`;

const GRADING_DIR = "/grading";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A defensive copy scoped to exactly this view's bytes (handles a subarray/view correctly, and
  // sidesteps TS's stricter generic Uint8Array<ArrayBufferLike> vs BufferSource typing).
  const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", exact);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Default wasm-byte loader for the Node-hosted engine (the real-Pyodide test suite and any future
 * Node-side usage): reads the pinned build's `pyodide.asm.wasm` directly from the locally
 * installed `pyodide` npm package (PINS.md pins the exact version this resolves to). A real
 * browser Worker (workerEntry.ts, not built in this pass, see BUILD-REPORT.md open items) would
 * inject a fetch-based loader instead, pointed at the self-hosted deploy path; the verification
 * LOGIC below (F7: detect a corrupted or swapped runtime rather than trust it) is identical either
 * way, only the byte-source differs.
 */
async function defaultLoadWasmBytes(): Promise<Uint8Array> {
  const { readFile } = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  const wasmPath = req.resolve("pyodide/pyodide.asm.wasm");
  return new Uint8Array(await readFile(wasmPath));
}

export interface PyodideEngineOptions {
  /** Injectable so a real browser Worker can supply a fetch-based loader (see defaultLoadWasmBytes). */
  loadWasmBytes?: () => Promise<Uint8Array>;
  /** The URL directory containing the self-hosted Pyodide assets (wasm, stdlib, lock).
   *  Passed to loadPyodide({ indexURL }) so the browser Worker fetches from the same origin
   *  rather than the default CDN. Required for require-corp COEP compliance. */
  indexURL?: string;
}

// B4 SAB input handshake protocol:
// The inputBuffer is a SharedArrayBuffer with layout:
//   int32[0] = status: 0 = idle, 1 = data ready
//   int32[1] = byte length of input data
//   bytes at offset 8: the input data (UTF-8 encoded)
// Worker (stdin callback): sets status to 0, calls Atomics.wait on [0] until !== 0
// Main thread (provideInput via WorkerClient): writes the data, sets [1] = length, sets [0] = 1,
//   then Atomics.notify to wake the worker.
const INPUT_STATUS_IDLE = 0;
const INPUT_STATUS_READY = 1;
// Minimum inputBuffer size: 8 bytes header + at least some data space
const INPUT_HEADER_BYTES = 8;
// Manager fix round, item 6(d): the stdin wait polls in short bursts instead of blocking
// indefinitely, so a pending input() can notice a Stop click (SIGINT written to the SAME
// interrupt buffer the opcode-level interrupt already uses) within one poll interval instead of
// never. 100ms matches Pyodide's own documented example for this exact pattern; short enough to
// feel immediate to a person, long enough not to spin the CPU.
const INPUT_POLL_MS = 100;

export class PyodideEngine implements PythonEngine {
  private pyodide!: MinimalPyodide;
  private inputCapable = false;
  // Manager fix round, item 6(a): true for the duration of check() only. Learn-mode grading is
  // NEVER interactive by design (boss hiddenTests monkeypatch builtins.input themselves before
  // run() is even called); this flag makes that literally true at the stdin layer too, so a
  // graded answer that calls input() gets an immediate EOFError instead of freezing the worker.
  // Before this fix, check() never wired `currentHooks` the way run() does, so a stdin callback's
  // onInputRequest() call silently no-opped on `null?.onInputRequest`: no message ever reached the
  // main thread, no UI ever changed, and the worker sat in Atomics.wait forever with no observable
  // signal and no possible recovery (Stop cannot help either: SIGINT is only checked BETWEEN
  // Python opcodes, and the worker was not executing opcodes, it was parked in a blocking native
  // wait). That silent, permanent, "check() drops the ball entirely" freeze is the actual root
  // cause Niko hit; the EOF-during-grading policy below is a second, independent layer of defense
  // (grading should never wait on a person even if currentHooks were wired correctly).
  private grading = false;
  private fatalCb: ((reason: FatalReason) => void) | null = null;
  // B4: SAB refs for interrupt and input handshake
  private interruptBuffer: SharedArrayBuffer | null = null;
  private interruptView: Int32Array | null = null;
  private inputBuffer: SharedArrayBuffer | null = null;
  private inputInt32: Int32Array | null = null;
  private inputDataView: Uint8Array | null = null;
  // Current run's hooks for forwarding inputRequest to the protocol layer
  private currentHooks: RunHooks | null = null;
  private currentRunId: string | null = null;

  private scratchGlobals!: PyProxyDict;
  private sessionGlobals!: PyProxyDict;

  constructor(private readonly options: PyodideEngineOptions = {}) {}

  async boot(opts: { inputCapable: boolean; pyodideVersion: string; pyodideHash: string; interruptBuffer?: SharedArrayBuffer | null; inputBuffer?: SharedArrayBuffer | null }): Promise<{ pyodideVersion: string }> {
    this.inputCapable = opts.inputCapable;
    // B4: store the SAB refs for interrupt and input
    this.interruptBuffer = opts.interruptBuffer ?? null;
    this.inputBuffer = opts.inputBuffer ?? null;
    if (this.interruptBuffer) this.interruptView = new Int32Array(this.interruptBuffer);
    if (this.inputBuffer) {
      this.inputInt32 = new Int32Array(this.inputBuffer);
      this.inputDataView = new Uint8Array(this.inputBuffer, INPUT_HEADER_BYTES);
    }

    // F7: hash-verify the highest-value executable asset BEFORE trusting it. A mismatch means a
    // corrupted or swapped runtime, DETECTED rather than silently run.
    if (opts.pyodideHash && opts.pyodideHash !== "fixture") {
      const loadBytes = this.options.loadWasmBytes ?? defaultLoadWasmBytes;
      const bytes = await loadBytes();
      const actualHash = await sha256Hex(bytes);
      if (actualHash !== opts.pyodideHash) {
        const err = new Error(
          `Pyodide hash mismatch (F7): expected ${opts.pyodideHash}, got sha256:${actualHash}. ` +
            `Refusing to boot a runtime that was not verified.`,
        );
        this.fatalCb?.("crash");
        throw err;
      }
    }

    const pyodideModule = (await import("pyodide")) as unknown as {
      loadPyodide: (opts?: { indexURL?: string; stdout?: (text: string) => void; stderr?: (text: string) => void }) => Promise<MinimalPyodide>;
    };
    // When indexURL is set (browser Worker context), loadPyodide fetches wasm + stdlib
    // from that same-origin path instead of the default CDN. This is required for
    // require-corp COEP compliance and offline operation.
    const loadOpts: Record<string, unknown> = {};
    if (this.options.indexURL) loadOpts.indexURL = this.options.indexURL;
    // Wire stdout/stderr to forward to the current run's hooks
    loadOpts.stdout = (text: string) => { this.currentHooks?.onStdout(text + "\n"); };
    loadOpts.stderr = (text: string) => { this.currentHooks?.onStderr(text + "\n"); };
    // B4: wire stdin for the input() handshake via SAB Atomics.wait
    if (this.inputCapable && this.inputInt32 && this.inputDataView) {
      const inputInt32 = this.inputInt32;
      const inputDataView = this.inputDataView;
      const engine = this;
      loadOpts.stdin = () => {
        // item 6(a): grading (check()) is NEVER interactive, by locked design; EOF makes a
        // graded answer's input() raise EOFError immediately instead of blocking the worker.
        if (engine.grading) return undefined;
        // Tell the main thread we need input via a postMessage (onInputRequest hook)
        if (engine.currentHooks) {
          engine.currentHooks.onInputRequest("");
        }
        return engine.waitForStdinOrInterrupt(inputInt32, inputDataView);
      };
    }
    this.pyodide = await pyodideModule.loadPyodide(loadOpts as { indexURL?: string });
    // B4: wire the interrupt buffer so Pyodide checks it between Python opcodes
    if (this.interruptBuffer) {
      this.pyodide.setInterruptBuffer(this.interruptView!);
    }
    // B4: wire the stdin hook for the input() handshake
    if (this.inputCapable && this.inputInt32 && this.inputDataView) {
      const inputInt32 = this.inputInt32;
      const inputDataView = this.inputDataView;
      const engine = this;
      this.pyodide.setStdin({
        stdin: () => {
          // item 6(a): same EOF-during-grading policy as the pre-load stdin above; this is the
          // wiring that is actually LIVE for every real run once Pyodide has finished loading.
          if (engine.grading) return undefined;
          // Tell the main thread we need input
          if (engine.currentHooks) {
            engine.currentHooks.onInputRequest("");
          }
          return engine.waitForStdinOrInterrupt(inputInt32, inputDataView);
        }
      });
    }
    this.pyodide.runPython(BOOTSTRAP_PY);
    this.pyodide.runPython("_capture_pristine()");
    this.scratchGlobals = this.pyodide.toPy({});
    this.sessionGlobals = this.pyodide.toPy({});
    if (!this.pyodide.FS.analyzePath(GRADING_DIR).exists) this.pyodide.FS.mkdir(GRADING_DIR);
    return { pyodideVersion: this.pyodide.version };
  }

  // Manager fix round, item 6(d): shared by both stdin wiring sites above. Was a single
  // `Atomics.wait(inputInt32, 0, INPUT_STATUS_IDLE)` with NO timeout, which blocks the worker
  // thread inside this callback indefinitely with no way out: Pyodide checks the interrupt
  // buffer BETWEEN Python opcodes, but the worker is not executing opcodes while parked here, so
  // a Stop click (which writes SIGINT into that same interrupt buffer, pyodideEngine.stop() below)
  // had no way to ever be noticed. Polls in short bursts instead (Pyodide's own documented pattern
  // for exactly this: pyodide.org/en/stable/usage/keyboard-interrupts.html, version-pinned to this
  // project's 314.0.2 build) and calls checkInterrupt() on each timeout, which throws
  // KeyboardInterrupt if SIGINT landed meanwhile, unblocking a pending input() the SAME way Stop
  // already unblocks a running loop, no separate B4 status needed.
  //
  // workerClient.ts's stop() handling used to ALSO write directly into the input SAB (status =
  // "ready", as if data had arrived) specifically to wake this wait early. That was a real bug,
  // not just an optimization attempt: it woke the wait, but with no real input data ever written,
  // so the callback returned STALE/garbage bytes from a PRIOR input() call (or empty on the very
  // first one) as if the learner had typed them, letting the blocked code continue running with
  // wrong input instead of actually stopping. Removed in favor of this poll loop, which is
  // correct by construction (it only ever returns real data or a real KeyboardInterrupt).
  private waitForStdinOrInterrupt(inputInt32: Int32Array, inputDataView: Uint8Array): string | undefined {
    while (true) {
      Atomics.store(inputInt32, 0, INPUT_STATUS_IDLE);
      const result = Atomics.wait(inputInt32, 0, INPUT_STATUS_IDLE, INPUT_POLL_MS);
      if (result === "timed-out") {
        // Guarded: checkInterrupt() needs setInterruptBuffer() to have already run, which only
        // happens after loadPyodide() resolves (see boot() above). In the astronomically unlikely
        // case this fires from the PRE-load stdin wiring before that, just keep polling; the input
        // handshake below still works correctly, only the early-interrupt check is unavailable
        // for that narrow window.
        this.pyodide?.checkInterrupt?.();
        continue;
      }
      // "ok" (woken by notify) or "not-equal" (already changed before we even waited): either way
      // real data has been written by the main thread's inputResponse handshake (workerClient.ts).
      const length = Atomics.load(inputInt32, 1);
      const data = inputDataView.slice(0, length);
      Atomics.store(inputInt32, 0, INPUT_STATUS_IDLE);
      return new TextDecoder().decode(data);
    }
  }

  // v5 fileDrain: scan the session working dir for new/changed files.
  // Session files live in the Pyodide CWD ("/home/pyodide" by default).
  // Grading files live in GRADING_DIR ("/grading"), structurally separate.
  private sessionFileSnapshots = new Map<string, string>();
  private readonly SESSION_DIR = "/home/pyodide";

  drainFiles(namespace: NamespaceId): FileBlob[] {
    if (namespace !== "session") return [];
    const drained: FileBlob[] = [];
    try {
      const entries = this.pyodide.FS.readdir(this.SESSION_DIR);
      for (const name of entries) {
        if (name === "." || name === "..") continue;
        // Skip directories and special files
        const fullPath = `${this.SESSION_DIR}/${name}`;
        try {
          // Read as binary, then classify via the shared helper (same logic as keepRemoteReconcile)
          const raw = this.pyodide.FS.readFile(fullPath, { encoding: "binary" }) as Uint8Array;
          // Use a string key for snapshot comparison (hex of first 32 bytes + length)
          const snapKey = `${raw.length}:${Array.from(raw.slice(0, 32)).map(b => b.toString(16)).join("")}`;
          const prev = this.sessionFileSnapshots.get(name);
          if (prev !== snapKey) {
            this.sessionFileSnapshots.set(name, snapKey);
            const classified = classifyBytes(raw);
            if (classified.kind === "text") {
              drained.push({ path: name, text: classified.text, encoding: "utf8" });
            } else {
              drained.push({ path: name, bytes: raw, encoding: "binary" });
            }
          }
        } catch {
          // Skip unreadable files (directories, etc.)
        }
      }
    } catch {
      // Session dir may not exist yet
    }
    return drained;
  }

  builtinNames(): ReadonlySet<string> {
    // Real Python introspection (dir(builtins)/vars(builtins)), not a hardcoded JS list, so this
    // stays correct regardless of which CPython build is pinned (see nameInfoFilter.ts's
    // comment). runPython's return is a PyProxy list; .toJs() converts it to a real JS array.
    const proxy = this.pyodide.runPython("list(vars(builtins).keys())") as { toJs(): string[] };
    return new Set(proxy.toJs());
  }

  onFatal(cb: (reason: FatalReason) => void): void {
    this.fatalCb = cb;
  }

  private globalsFor(namespace: NamespaceId): PyProxyDict {
    if (namespace === "graded") return this.pyodide.toPy({}); // fresh + isolated every time (F9)
    return namespace === "scratch" ? this.scratchGlobals : this.sessionGlobals;
  }

  private clearGradingDir(): void {
    for (const name of this.pyodide.FS.readdir(GRADING_DIR)) {
      if (name === "." || name === "..") continue;
      this.pyodide.FS.unlink(`${GRADING_DIR}/${name}`);
    }
  }

  private mountFiles(files: RunParams["mountFiles"], dir: string): void {
    for (const file of files) {
      const path = `${dir}/${file.path}`;
      if (file.text !== undefined) this.pyodide.FS.writeFile(path, file.text);
      else if (file.bytes !== undefined) this.pyodide.FS.writeFile(path, file.bytes);
    }
  }

  async run(params: RunParams): Promise<RunOutcome> {
    if (params.namespace === "graded") {
      this.pyodide.runPython("_hard_reset_for_grading()");
      this.clearGradingDir();
      this.mountFiles(params.mountFiles, GRADING_DIR);
    }
    // SF6 (Frederick full-gate should-fix, a real latent race found under host CPU contention
    // during E2E stress testing, not just a timing margin): the interrupt buffer is NO LONGER
    // cleared here. Clearing it on the WORKER side, at the moment this run() call actually starts
    // executing, has an unbounded delay relative to when the main thread POSTED the "run" message
    // (the worker's postMessage queue can sit unprocessed for an arbitrary stretch under CPU
    // contention). If the user clicks Stop in that window, workerClient.ts writes SIGINT=2
    // directly into this SAME SharedArrayBuffer slot (a main-thread write, since the worker may be
    // too busy/delayed to process a posted "stop" message promptly); this line used to then
    // unconditionally overwrite that 2 back to 0 the moment "run" was finally dequeued, silently
    // erasing a Stop that was already in flight for THIS run, with no other mechanism able to ever
    // re-arm it (pyodideEngine.stop()'s own write is queued behind this same synchronous,
    // now-uninterruptible runPython() call). The infinite loop then runs forever. The clear now
    // happens on the MAIN THREAD instead, synchronously at the moment Run is clicked, strictly
    // BEFORE the "run" message is even posted (see workerClient.ts's send()); that ordering can
    // never race with a Stop click, since Stop can only be clicked by the user after Run already
    // started, so the buffer is guaranteed clear before this run's lifecycle can produce a Stop.
    this.currentHooks = params.hooks;
    this.currentRunId = params.runId;
    const globals = this.globalsFor(params.namespace);
    try {
      const result = this.pyodide.runPython(params.code, { globals });
      if (result !== undefined && result !== null) {
        params.hooks.onResult(this.safeRepr(result));
      }
      return { ok: true };
    } catch (err) {
      const { errorType, message } = this.classifyError(err);
      params.hooks.onError(errorType, message, null, String(err));
      return { ok: false };
    } finally {
      this.currentHooks = null;
      this.currentRunId = null;
    }
  }

  async check(params: CheckParams): Promise<CheckOutcome> {
    // Manager fix round, item 6(a): grading is never interactive (locked design; boss hiddenTests
    // monkeypatch builtins.input themselves before run(), never reaching real stdin). This flag,
    // read by both stdin wiring sites above, is what actually makes a graded input() fail fast
    // with EOFError instead of freezing the worker forever, see this.grading's own doc comment.
    this.grading = true;
    try {
      // F9: check is ALWAYS graded + isolated, regardless of any prior namespace's state.
      this.pyodide.runPython("_hard_reset_for_grading()");
      this.clearGradingDir();
      this.mountFiles(params.mountFiles, GRADING_DIR);
      const globals = this.pyodide.toPy({});

      try {
        this.pyodide.runPython(params.code, { globals });
      } catch (err) {
        if (this.isGradingInputEof(err)) {
          return { passed: false, results: [this.gradingInputEofOutcome("submission")] };
        }
        return { passed: false, results: [] };
      }

      const results = params.hiddenTests.map((test) => {
        try {
          this.pyodide.runPython(test.code, { globals });
          return { id: test.id, group: test.group, passed: true, message: test.message };
        } catch (err) {
          if (this.isGradingInputEof(err)) {
            return { ...this.gradingInputEofOutcome(test.id), group: test.group };
          }
          return { id: test.id, group: test.group, passed: false, message: test.message, actual: String(err) };
        }
      });

      return { passed: results.every((r) => r.passed), results };
    } finally {
      this.grading = false;
    }
  }

  // Manager fix round, item 6(b): "coach, never shame," and never the raw Python EOFError
  // traceback, which would read like an unexplained crash. The message plainly states the
  // structural rule (graded checks never answer input()) and the concrete fix (take the value as
  // a parameter, or otherwise avoid calling input() at the top level), matching the voice of every
  // other coaching message in this app (CheckResult's fail card, gradeAnswer.ts's EMPTY_NUDGE).
  private isGradingInputEof(err: unknown): boolean {
    return this.classifyError(err).errorType === "EOFError";
  }
  private gradingInputEofOutcome(id: string): { id: string; passed: false; message: string } {
    return {
      id,
      passed: false,
      message:
        "Graded checks can't answer input() prompts. The hidden tests supply their own inputs when " +
        "they run your code, so write your function or answer without calling input() (or running " +
        "it) at the top level.",
    };
  }

  stop(_runId: string): void {
    // B4: write SIGINT (2) to the interrupt buffer. Pyodide checks this between Python
    // opcodes and raises KeyboardInterrupt. On the degraded path (no SAB), this is a no-op
    // and the P1 error message ("input() is not available") handles it honestly.
    if (this.interruptView) {
      Atomics.store(this.interruptView, 0, 2); // 2 = SIGINT
    }
  }

  provideInput(_runId: string, _bytes: Uint8Array): void {
    // B4: in the SAB approach, the main thread writes directly to the inputBuffer SAB
    // and calls Atomics.notify, bypassing the worker's message loop entirely (because
    // the worker is blocked on Atomics.wait and cannot process postMessage). So this
    // method on the engine side is a no-op; the real handshake lives in workerClient.ts.
    void _runId;
    void _bytes;
  }

  async loadPackage(
    name: string,
    onProgress: (phase: PackageProgressPhase, loadedBytes: number, totalBytes: number | null) => void,
  ): Promise<void> {
    onProgress("download", 0, null);
    await this.pyodide.loadPackage(name);
    onProgress("install", 0, null);
    onProgress("done", 0, null);
  }

  async resetNamespace(namespace: NamespaceId): Promise<boolean> {
    const fresh = this.pyodide.toPy({});
    if (namespace === "scratch") this.scratchGlobals = fresh;
    else if (namespace === "session") this.sessionGlobals = fresh;
    // graded has no persistent state to reset (always fresh already).
    return true;
  }

  snapshotNamespace(namespace: NamespaceId): RawNamespaceEntry[] {
    const globals = this.globalsFor(namespace);
    const snapshotFn = this.pyodide.runPython("_snapshot_namespace") as PyProxyCallable;
    // The Python function returns a list of tuples; Pyodide hands that back as a PyProxy, which
    // needs an explicit .toJs() to become a real JS array (verified by hand: calling a PyProxy
    // function does NOT auto-convert list/tuple return values the way it does for primitives).
    const rows = snapshotFn(globals).toJs() as Array<[string, string, string, string]>;
    return rows.map(([name, group, typeName, repr]) => ({
      name,
      group: group as RawNamespaceEntry["group"],
      typeName,
      computeRepr: () => repr,
    }));
  }

  private safeRepr(value: unknown): string {
    try {
      const s = String(value);
      return s.length > 200 ? `${s.slice(0, 200)}...` : s;
    } catch {
      return "<repr() raised an exception>";
    }
  }

  private classifyError(err: unknown): { errorType: string; message: string } {
    const message = err instanceof Error ? err.message : String(err);
    const match = /^(\w+Error)\b[:]?\s*(.*)$/m.exec(message);
    if (match?.[1]) return { errorType: match[1], message: match[2] ?? message };
    return { errorType: "PythonError", message };
  }
}
