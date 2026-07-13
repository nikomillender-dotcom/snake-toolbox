// REAL Pyodide proof of Byleth's three engine assumptions (curriculum-bundle round), run against
// the REAL bundle's actual content (not a hand-written stand-in), through the REAL check() path
// (PyodideEngine, genuine CPython-on-wasm). This file runs as part of the default `npm test` (see
// pyodideEngine.realpyodide.test.ts's own suite, which already executes in this environment despite
// its header comment describing an opt-in script; that discrepancy is noted in the round report,
// not fixed here, since it predates this round and is outside its scope).
//
// 3a: the M1 boss grades via a monkeypatched builtins.input + contextlib.redirect_stdout pattern
//     AUTHORED DIRECTLY INSIDE each hiddenTest's own code (not something the engine does for it).
//     Proven here by running m01-boss's REAL hiddenTests against its REAL modelSolution through
//     PyodideEngine.check() -- the exact same class/method that backs both a real browser Worker
//     and this Node smoke suite, so "browser check() path" and "Node check() path" are provably
//     the same code, not just similar.
// 3b: the M10 boss does a read-process-write round trip on absolute /grading/... paths, relying on
//     check() clearing and OWNING /grading fresh at the start of each check() call. Proven two ways:
//     (i) m10-boss's REAL hiddenTests + modelSolution round-trip correctly within one check() call
//     (multiple sequential hiddenTests sharing the same MEMFS state), and (ii) a synthetic pair of
//     check() calls proving a file written during call 1 does NOT leak into call 2.
import { beforeAll, describe, expect, it } from "vitest";
import { PyodideEngine } from "../engine/worker/pyodideEngine";
import type { RunHooks } from "../engine/worker/engineTypes";
import { REAL_CURRICULUM_BUNDLE } from "./realCurriculumBundle";

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

const m01 = REAL_CURRICULUM_BUNDLE.modules.find(m => m.id === "m01")!;
const m10 = REAL_CURRICULUM_BUNDLE.modules.find(m => m.id === "m10")!;

describe("Byleth's engine assumptions, proven against the REAL bundle through the REAL engine", () => {
  let engine: PyodideEngine;

  beforeAll(async () => {
    engine = new PyodideEngine();
    await engine.boot({ inputCapable: false, pyodideVersion: "314.0.2", pyodideHash: "fixture" });
  }, 30000);

  describe("3a: m01-boss (The Blank Console) -- scripted input() + redirect_stdout hiddenTests", () => {
    it("CONFIRMED: the real modelSolution passes every real hiddenTest through the real check() path", async () => {
      expect(m01.boss).toBeDefined();
      const boss = m01.boss!;
      const outcome = await engine.check({
        runId: "m01-boss-real",
        code: boss.modelSolution,
        mountFiles: [],
        hiddenTests: boss.hiddenTests,
        hooks: silentHooks(),
      });
      expect(outcome.passed).toBe(true);
      expect(outcome.results).toHaveLength(boss.hiddenTests.length);
      for (const r of outcome.results) expect(r.passed).toBe(true);
    });

    it("NOT VACUOUS: a deliberately wrong solution fails the same real hiddenTests", async () => {
      const boss = m01.boss!;
      // Never calls input(), never prints the name/doubled number: should fail every hidden test.
      const wrongSolution = "def run():\n    print('nope')";
      const outcome = await engine.check({
        runId: "m01-boss-wrong",
        code: wrongSolution,
        mountFiles: [],
        hiddenTests: boss.hiddenTests,
        hooks: silentHooks(),
      });
      expect(outcome.passed).toBe(false);
      expect(outcome.results.some(r => !r.passed)).toBe(true);
    });
  });

  describe("3b: m10-boss (The Keeper of Records) -- read/process/write round trip on /grading/...", () => {
    it("CONFIRMED: the real modelSolution passes every real hiddenTest (round trip through /grading works)", async () => {
      expect(m10.boss).toBeDefined();
      const boss = m10.boss!;
      const outcome = await engine.check({
        runId: "m10-boss-real",
        code: boss.modelSolution,
        mountFiles: [],
        hiddenTests: boss.hiddenTests,
        hooks: silentHooks(),
      });
      expect(outcome.passed).toBe(true);
      expect(outcome.results).toHaveLength(boss.hiddenTests.length);
      for (const r of outcome.results) expect(r.passed).toBe(true);
    });

    it("NOT VACUOUS: a solution that never persists to disk fails the file-reload hidden test", async () => {
      const boss = m10.boss!;
      // log_workout returns the right shape but never writes to disk; total_minutes is correct.
      // This should fail m10-boss-t3 (the reload-from-disk assertion) even though the in-memory
      // return values look right for t1/t2.
      const wrongSolution = [
        "def log_workout(path, activity, minutes):",
        "    entries = [{'activity': activity, 'minutes': minutes}]",
        "    return entries",
        "",
        "def total_minutes(entries):",
        "    total = 0",
        "    for entry in entries:",
        "        total += entry['minutes']",
        "    return total",
      ].join("\n");
      const outcome = await engine.check({
        runId: "m10-boss-wrong",
        code: wrongSolution,
        mountFiles: [],
        hiddenTests: boss.hiddenTests,
        hooks: silentHooks(),
      });
      expect(outcome.passed).toBe(false);
      const t3 = outcome.results.find(r => r.id === "m10-boss-t3");
      expect(t3?.passed).toBe(false);
    });

    it("CONFIRMED: check() OWNS /grading fresh each call -- a file from a prior check() does not leak into the next", async () => {
      const writeMarker = await engine.check({
        runId: "grading-owns-1",
        code: "",
        mountFiles: [],
        hiddenTests: [
          {
            id: "write",
            code: "import os\nos.makedirs('/grading', exist_ok=True)\nwith open('/grading/leftover.txt', 'w') as f:\n    f.write('from call 1')\nassert os.path.exists('/grading/leftover.txt')",
            message: "writes a marker file into /grading",
          },
        ],
        hooks: silentHooks(),
      });
      expect(writeMarker.passed).toBe(true);

      const checkNextCall = await engine.check({
        runId: "grading-owns-2",
        code: "",
        mountFiles: [],
        hiddenTests: [
          {
            id: "absent",
            code: "import os\nassert not os.path.exists('/grading/leftover.txt')",
            message: "the previous check()'s /grading file must not leak into this one",
          },
        ],
        hooks: silentHooks(),
      });
      expect(checkNextCall.passed).toBe(true);
      expect(checkNextCall.results[0]?.passed).toBe(true);
    });
  });
});
