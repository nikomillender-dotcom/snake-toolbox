// REAL Pyodide smoke suite (opt-in: `npm run test:real-pyodide`, NOT part of the default `npm
// test`). Proves the F9 grading-isolation algorithm and basic run/check/namespace behavior against
// genuine CPython-on-wasm (the pinned build, PINS.md), not just the FakePythonEngine's scripted
// policy. Boots real Pyodide once (about 3 seconds locally) and reuses it across tests via
// `beforeAll`, since booting per-test would be needlessly slow.
//
// What this suite does NOT prove (documented, see BUILD-REPORT.md "what is proven where"): the
// SharedArrayBuffer + Atomics interrupt/input handshake (B4), COOP/COEP isolation, and running
// inside an actual Web Worker. Those require a real browser and are proven only by the manual
// harness (manual-harness/pyodide-harness.html).
import { beforeAll, describe, expect, it } from "vitest";
import { PyodideEngine } from "./pyodideEngine.js";
import type { RunHooks } from "./engineTypes.js";

function silentHooks(overrides: Partial<RunHooks> = {}): RunHooks {
  return {
    onStdout: () => {},
    onStderr: () => {},
    onFigure: () => {},
    onResult: () => {},
    onError: () => {},
    onInputRequest: () => {},
    ...overrides,
  };
}

describe("PyodideEngine (real Pyodide, F9 isolation proof)", () => {
  let engine: PyodideEngine;

  beforeAll(async () => {
    engine = new PyodideEngine();
    await engine.boot({ inputCapable: false, pyodideVersion: "314.0.2", pyodideHash: "fixture" });
  }, 30000);

  it("runs real Python and streams a result", async () => {
    const outcome = await engine.run({
      runId: "r1",
      code: "1 + 1",
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks(),
    });
    expect(outcome.ok).toBe(true);
  });

  it("scratch persists a variable across separate run calls", async () => {
    await engine.run({ runId: "r2", code: "x = 42", mountFiles: [], namespace: "scratch", hooks: silentHooks() });
    let errored = false;
    await engine.run({
      runId: "r3",
      code: "assert x == 42",
      mountFiles: [],
      namespace: "scratch",
      hooks: silentHooks({ onError: () => (errored = true) }),
    });
    expect(errored).toBe(false);
  });

  it("F9 LEAK TEST: a name defined in scratch fails a graded check (real CPython)", async () => {
    await engine.run({ runId: "r4", code: "leaked_name = 123", mountFiles: [], namespace: "scratch", hooks: silentHooks() });
    const outcome = await engine.check({
      runId: "c1",
      code: "",
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: "assert leaked_name == 123", message: "leaked_name must not be visible" }],
      hooks: silentHooks(),
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.results[0]?.passed).toBe(false);
  });

  it("F9 LEAK TEST: a monkeypatched builtin is PRISTINE in the next graded check (real CPython)", async () => {
    await engine.run({
      runId: "r5",
      code: "import builtins\nbuiltins.sum = lambda *a, **k: 999999",
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks(),
    });
    // Prove the monkeypatch actually took effect in Python's real builtins first (else the test
    // would pass vacuously).
    const tamperedCheck = await engine.run({
      runId: "r5b",
      code: "assert sum([1, 2, 3]) == 999999",
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks(),
    });
    expect(tamperedCheck.ok).toBe(true);

    const outcome = await engine.check({
      runId: "c2",
      code: "",
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: "assert sum([1, 2, 3]) == 6", message: "sum must be pristine" }],
      hooks: silentHooks(),
    });
    expect(outcome.passed).toBe(true);
  });

  it("F9: a fresh globals dict alone would NOT catch a sys.modules-level tamper; the hard reset does", async () => {
    // Prove the reset purges a genuinely NEW module injected into sys.modules from a prior run,
    // the exact class of leak a merely-fresh-globals-dict approach would miss (CONTRACT 1 comment).
    await engine.run({
      runId: "r6",
      code: [
        "import sys, types",
        "fake = types.ModuleType('totally_fake_user_module')",
        "fake.secret = 'leaked'",
        "sys.modules['totally_fake_user_module'] = fake",
      ].join("\n"),
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks(),
    });
    const outcome = await engine.check({
      runId: "c3",
      code: "",
      mountFiles: [],
      hiddenTests: [
        {
          id: "t1",
          code: "import sys\nassert 'totally_fake_user_module' not in sys.modules",
          message: "fake module must be purged before grading",
        },
      ],
      hooks: silentHooks(),
    });
    expect(outcome.passed).toBe(true);
  });

  it("check() runs hidden tests and reports pass/fail per test with the author message", async () => {
    const outcome = await engine.check({
      runId: "c4",
      code: "def add(a, b):\n    return a + b",
      mountFiles: [],
      hiddenTests: [
        { id: "t1", code: "assert add(2, 3) == 5", message: "add(2, 3) should be 5" },
        { id: "t2", code: "assert add(0, 0) == 1", message: "this one is deliberately wrong" },
      ],
      hooks: silentHooks(),
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.results.find((r) => r.id === "t1")?.passed).toBe(true);
    expect(outcome.results.find((r) => r.id === "t2")?.passed).toBe(false);
  });

  it("namespace snapshot filters dunders/builtins and reports real user names (F11, real CPython)", async () => {
    await engine.resetNamespace("session");
    await engine.run({
      runId: "r7",
      code: "my_var = 10\ndef my_func():\n    pass\nimport json",
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks(),
    });
    const names = engine.snapshotNamespace("session");
    const byName = new Map(names.map((n) => [n.name, n]));
    expect(byName.has("my_var")).toBe(true);
    expect(byName.get("my_var")?.group).toBe("variable");
    expect(byName.has("my_func")).toBe(true);
    expect(byName.get("my_func")?.group).toBe("function");
    expect(byName.has("json")).toBe(true);
    expect(byName.get("json")?.group).toBe("import");
    // No dunders, no builtins-injected noise.
    expect(names.some((n) => n.name.startsWith("__"))).toBe(false);
    expect(names.some((n) => n.name === "print")).toBe(false);
  });

  it("a raising __repr__ is caught under try/except in the REAL snapshot too (F11)", async () => {
    await engine.resetNamespace("session");
    await engine.run({
      runId: "r8",
      code: ["class Cursed:", "    def __repr__(self):", "        raise ValueError('boom')", "", "cursed = Cursed()"].join("\n"),
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks(),
    });
    const names = engine.snapshotNamespace("session");
    const cursed = names.find((n) => n.name === "cursed");
    expect(cursed?.computeRepr()).toBe("<repr() raised an exception>");
  });

  it("resetNamespace clears scratch/session persistent state", async () => {
    await engine.run({ runId: "r9", code: "should_vanish = 1", mountFiles: [], namespace: "session", hooks: silentHooks() });
    const ok = await engine.resetNamespace("session");
    expect(ok).toBe(true);
    let errored = false;
    await engine.run({
      runId: "r10",
      code: "assert should_vanish == 1",
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks({ onError: () => (errored = true) }),
    });
    expect(errored).toBe(true);
  });

  it("captures a Python exception as an honest error event, not a hang or crash", async () => {
    let captured: { errorType: string; message: string } | null = null;
    const outcome = await engine.run({
      runId: "r11",
      code: "1 / 0",
      mountFiles: [],
      namespace: "session",
      hooks: silentHooks({ onError: (errorType, message) => (captured = { errorType, message }) }),
    });
    expect(outcome.ok).toBe(false);
    expect(captured).not.toBeNull();
  });
});

// Manager fix round, item 6: Niko wrote a graded answer containing input(), clicked Check, and the
// session froze permanently ("blanked out and hasn't responded"). Root cause (confirmed by reading
// the engine, not guessed): check() never wired `this.currentHooks` the way run() does, so the
// stdin callback's `engine.currentHooks?.onInputRequest("")` silently no-opped on a null/stale
// callback, no message EVER reached the main thread, no UI ever changed, and the worker sat
// blocked in a synchronous Atomics.wait forever, with Stop unable to help (SIGINT is only checked
// BETWEEN Python opcodes; the worker was not executing opcodes, it was parked in a blocking native
// wait). This describe block boots its OWN engine with REAL SharedArrayBuffers (inputCapable:
// true), the exact condition the original bug needed, since the OTHER describe block above boots
// non-interactive (inputCapable: false) and would never exercise the custom stdin path at all.
describe("PyodideEngine: check() with input()-calling code never hangs (Manager fix round, item 6)", () => {
  let engine: PyodideEngine;

  beforeAll(async () => {
    engine = new PyodideEngine();
    await engine.boot({
      inputCapable: true,
      pyodideVersion: "314.0.2",
      pyodideHash: "fixture",
      interruptBuffer: new SharedArrayBuffer(4),
      inputBuffer: new SharedArrayBuffer(4096 + 8),
    });
  }, 30000);

  it("REGRESSION NET FOR THE DEADLOCK: a graded submission calling input() fails in bounded time with an honest coaching message, never hangs", async () => {
    const start = Date.now();
    const outcome = await engine.check({
      runId: "input-check-1",
      code: "answer = input('give me a number: ')",
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: "assert answer == '5'", message: "answer should be 5" }],
      hooks: silentHooks(),
    });
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(5000); // this used to hang FOREVER; bounded time is the proof
    expect(outcome.passed).toBe(false);
    expect(outcome.results[0]?.message).toMatch(/can't answer input\(\) prompts/);
  }, 10000);

  it("a hidden test that calls a student function which itself calls input() ALSO fails fast with the coaching message, not the raw EOFError traceback", async () => {
    const outcome = await engine.check({
      runId: "input-check-2",
      code: "def solve():\n    return input('n: ')",
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: "assert solve() == 'x'", message: "solve() should equal x" }],
      hooks: silentHooks(),
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.results[0]?.message).toMatch(/can't answer input\(\) prompts/);
    expect(outcome.results[0]?.message).not.toMatch(/EOFError/); // coaching text, never the raw traceback
  }, 10000);

  it("onInputRequest is NEVER called during check(), even on an input-capable engine: grading truly never surfaces an interactive prompt", async () => {
    let requested = false;
    await engine.check({
      runId: "input-check-3",
      code: "input('should never reach the main thread')",
      mountFiles: [],
      hiddenTests: [],
      hooks: silentHooks({ onInputRequest: () => { requested = true; } }),
    });
    expect(requested).toBe(false);
  });

  it("a NORMAL (non-input) graded check on the SAME input-capable engine still passes correctly: the EOF policy is scoped to input() only, not to check() wholesale", async () => {
    const outcome = await engine.check({
      runId: "input-check-4",
      code: "def add(a, b):\n    return a + b",
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: "assert add(2, 3) == 5", message: "add(2, 3) should be 5" }],
      hooks: silentHooks(),
    });
    expect(outcome.passed).toBe(true);
  });

  it("a REGULAR run() (not check()) on the SAME engine is still genuinely interactive: onInputRequest DOES fire, proving the EOF policy is scoped to grading only, not to input-capable engines wholesale", async () => {
    let requestedPrompt: string | null = null;
    const runPromise = engine.run({
      runId: "input-run-1",
      code: "input('name: ')",
      mountFiles: [],
      namespace: "scratch",
      hooks: silentHooks({ onInputRequest: (prompt) => { requestedPrompt = prompt; } }),
    });
    // Give the worker a moment to reach the blocking input() call and fire onInputRequest.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requestedPrompt).not.toBeNull();
    // Answer it directly via the SAB (the real handshake workerClient.ts uses), the same way a
    // real main thread would, so this test does not itself hang: writes the length, the data,
    // then flips status to ready and notifies, exactly matching provideInput's real B4 protocol.
    const inputBuffer = (engine as unknown as { inputBuffer: SharedArrayBuffer }).inputBuffer;
    const int32 = new Int32Array(inputBuffer);
    const dataView = new Uint8Array(inputBuffer, 8);
    const bytes = new TextEncoder().encode("Niko");
    dataView.set(bytes);
    Atomics.store(int32, 1, bytes.length);
    Atomics.store(int32, 0, 1); // INPUT_STATUS_READY
    Atomics.notify(int32, 0);
    const outcome = await runPromise;
    expect(outcome.ok).toBe(true);
  }, 10000);
});

describe("PyodideEngine hash verification (F7)", () => {
  // The real pinned hash from PINS.md, verified independently by computing sha256 over the exact
  // pyodide.asm.wasm file the locally installed `pyodide` npm package resolves to.
  const REAL_PYODIDE_ASM_WASM_SHA256 = "f7a8a169e513791e18fa0790fb69d6f2656b779e9012ba57e03e973f0df0b39f";

  it("boots cleanly when the hash matches the pinned value", async () => {
    const engine = new PyodideEngine();
    const result = await engine.boot({
      inputCapable: false,
      pyodideVersion: "314.0.2",
      pyodideHash: REAL_PYODIDE_ASM_WASM_SHA256,
    });
    expect(result.pyodideVersion).toBe("314.0.2");
  }, 30000);

  it("REFUSES to boot when the hash does not match (a corrupted or swapped runtime, F7)", async () => {
    const engine = new PyodideEngine();
    await expect(
      engine.boot({ inputCapable: false, pyodideVersion: "314.0.2", pyodideHash: "sha256:deadbeef-not-the-real-hash" }),
    ).rejects.toThrow(/hash mismatch/i);
  }, 30000);

  it("reports fatal via onFatal on a hash mismatch, so the composition root can respond (F10-adjacent)", async () => {
    const engine = new PyodideEngine();
    let fatalReason: string | null = null;
    engine.onFatal((reason) => (fatalReason = reason));
    await engine.boot({ inputCapable: false, pyodideVersion: "314.0.2", pyodideHash: "not-the-real-hash" }).catch(() => {});
    expect(fatalReason).toBe("crash");
  }, 30000);
});
