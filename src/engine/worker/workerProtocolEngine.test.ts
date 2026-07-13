import { describe, expect, it, vi } from "vitest";
import type { WorkerToMain } from "../../contracts.js";
import { encodeOps, FakePythonEngine, type FakeOp } from "./fakePythonEngine.js";
import { WorkerProtocolEngine } from "./workerProtocolEngine.js";

function harness() {
  const events: WorkerToMain[] = [];
  const engine = new FakePythonEngine();
  const protocol = new WorkerProtocolEngine(engine, (msg) => events.push(msg));
  return { events, engine, protocol };
}

async function bootIsolated(protocol: WorkerProtocolEngine) {
  await protocol.handle({
    t: "boot",
    pyodideVersion: "314.0.2",
    pyodideHash: "sha256-fixture",
    interruptBuffer: new SharedArrayBuffer(4),
    inputBuffer: new SharedArrayBuffer(4),
  });
}

async function bootDegraded(protocol: WorkerProtocolEngine) {
  await protocol.handle({
    t: "boot",
    pyodideVersion: "314.0.2",
    pyodideHash: "sha256-fixture",
    interruptBuffer: null,
    inputBuffer: null,
  });
}

describe("WorkerProtocolEngine: boot (P1, F5)", () => {
  it("isolated boot: both real SharedArrayBuffers -> ready.inputCapable true", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    expect(events).toEqual([{ t: "ready", pyodideVersion: "314.0.2", inputCapable: true }]);
  });

  it("degraded boot: both SABs null -> ready.inputCapable false, and the worker still runs code (never hangs)", async () => {
    const { events, protocol } = harness();
    await bootDegraded(protocol);
    expect(events).toEqual([{ t: "ready", pyodideVersion: "314.0.2", inputCapable: false }]);

    events.length = 0;
    const ops: FakeOp[] = [{ op: "print", text: "hello" }, { op: "result", repr: "None" }];
    await protocol.handle({ t: "run", runId: "r1", code: encodeOps(ops), mountFiles: [], namespace: "session" });
    const runDone = events.find((e) => e.t === "runDone");
    expect(runDone).toEqual({ t: "runDone", runId: "r1", ok: true });
  });

  it("degraded boot: input() surfaces as a disabled affordance, never a hang", async () => {
    const { events, protocol } = harness();
    await bootDegraded(protocol);
    events.length = 0;
    const ops: FakeOp[] = [{ op: "callInput", prompt: "name?", assignTo: "name" }];
    const donePromise = protocol.handle({ t: "run", runId: "r2", code: encodeOps(ops), mountFiles: [], namespace: "session" });
    await Promise.race([donePromise, new Promise((_, reject) => setTimeout(() => reject(new Error("hung")), 500))]);
    const errorEvent = events.find((e) => e.t === "error");
    expect(errorEvent).toMatchObject({ t: "error", errorType: "InputUnavailable" });
    const runDone = events.find((e) => e.t === "runDone");
    expect(runDone).toEqual({ t: "runDone", runId: "r2", ok: false });
  });
});

describe("WorkerProtocolEngine: fresh-run isolation for graded (F9)", () => {
  it("a name defined in one graded run is GONE in the next graded run/check on the SAME engine", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "g1",
      code: encodeOps([{ op: "setVar", name: "x", value: "5" }]),
      mountFiles: [],
      namespace: "graded",
    });

    await protocol.handle({
      t: "check",
      runId: "g2",
      code: encodeOps([]),
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: encodeOps([{ op: "readVar", name: "x" }]), message: "x should be defined" }],
    });

    const result = events.find((e) => e.t === "checkResult");
    expect(result).toMatchObject({ t: "checkResult", passed: false });
  });
});

describe("WorkerProtocolEngine: grading isolation leak tests (F9 BLOCKER)", () => {
  it("a name defined in SCRATCH fails a graded Check that references it", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "s1",
      code: encodeOps([{ op: "setVar", name: "leaked", value: "1" }]),
      mountFiles: [],
      namespace: "scratch",
    });

    await protocol.handle({
      t: "check",
      runId: "c1",
      code: encodeOps([]),
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: encodeOps([{ op: "readVar", name: "leaked" }]), message: "leaked should not be visible" }],
    });

    const checkResult = events.find((e) => e.t === "checkResult");
    expect(checkResult).toMatchObject({ passed: false, results: [{ id: "t1", passed: false }] });
  });

  it("a name defined in SESSION (Sandbox) fails a graded Check that references it", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "sess1",
      code: encodeOps([{ op: "setVar", name: "sessionVar", value: "1" }]),
      mountFiles: [],
      namespace: "session",
    });

    await protocol.handle({
      t: "check",
      runId: "c2",
      code: encodeOps([]),
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: encodeOps([{ op: "readVar", name: "sessionVar" }]), message: "must be isolated" }],
    });

    const checkResult = events.find((e) => e.t === "checkResult");
    expect(checkResult).toMatchObject({ passed: false });
  });

  it("a monkeypatched builtin from scratch/session is PRISTINE in the next graded Check", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "mp1",
      code: encodeOps([{ op: "monkeypatchBuiltin", name: "sum", value: "<evil sum>" }]),
      mountFiles: [],
      namespace: "session",
    });

    await protocol.handle({
      t: "check",
      runId: "c3",
      code: encodeOps([]),
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: encodeOps([{ op: "assertBuiltinPristine", name: "sum" }]), message: "sum must be pristine" }],
    });

    const checkResult = events.find((e) => e.t === "checkResult");
    expect(checkResult).toMatchObject({ passed: true, results: [{ id: "t1", passed: true }] });
  });

  it("the random seed is reset before every graded check", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "rs1",
      code: encodeOps([{ op: "mutateRandomSeedMarker", value: "42" }]),
      mountFiles: [],
      namespace: "session",
    });

    await protocol.handle({
      t: "check",
      runId: "c4",
      code: encodeOps([]),
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: encodeOps([{ op: "assertRandomSeedIsReset" }]), message: "seed must reset" }],
    });

    expect(events.find((e) => e.t === "checkResult")).toMatchObject({ passed: true });
  });

  it("the grading MEMFS working dir is cleared before every graded check", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "check",
      runId: "c5a",
      code: encodeOps([{ op: "writeGradingFile", path: "/grading/out.txt", contents: "leftover" }]),
      mountFiles: [],
      hiddenTests: [],
    });

    await protocol.handle({
      t: "check",
      runId: "c5b",
      code: encodeOps([]),
      mountFiles: [],
      hiddenTests: [{ id: "t1", code: encodeOps([{ op: "assertGradingFileAbsent", path: "/grading/out.txt" }]), message: "grading dir must be clean" }],
    });

    expect(events.find((e) => e.t === "checkResult" && e.runId === "c5b")).toMatchObject({ passed: true });
  });

  it("scratch and session are mutually isolated from EACH OTHER too", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "sc1",
      code: encodeOps([{ op: "setVar", name: "onlyInScratch", value: "1" }]),
      mountFiles: [],
      namespace: "scratch",
    });

    await protocol.handle({
      t: "run",
      runId: "se1",
      code: encodeOps([{ op: "readVar", name: "onlyInScratch" }]),
      mountFiles: [],
      namespace: "session",
    });

    const runDone = events.find((e) => e.t === "runDone" && e.runId === "se1");
    expect(runDone).toEqual({ t: "runDone", runId: "se1", ok: false });
  });
});

describe("WorkerProtocolEngine: persistent namespaces (scratch, session)", () => {
  it("scratch persists a variable across separate run calls", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);

    await protocol.handle({
      t: "run",
      runId: "p1",
      code: encodeOps([{ op: "setVar", name: "keep", value: "1" }]),
      mountFiles: [],
      namespace: "scratch",
    });

    await protocol.handle({
      t: "run",
      runId: "p2",
      code: encodeOps([{ op: "readVar", name: "keep" }]),
      mountFiles: [],
      namespace: "scratch",
    });

    const runDone = events.find((e) => e.t === "runDone" && e.runId === "p2");
    expect(runDone).toEqual({ t: "runDone", runId: "p2", ok: true });
  });
});

describe("WorkerProtocolEngine: namespace push vs pull (F11, P4)", () => {
  it("pushes a namespace event right after every runDone", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "run",
      runId: "n1",
      code: encodeOps([{ op: "setVar", name: "a", value: "1", kind: "variable" }]),
      mountFiles: [],
      namespace: "session",
    });
    const runDoneIndex = events.findIndex((e) => e.t === "runDone");
    const namespaceIndex = events.findIndex((e) => e.t === "namespace");
    expect(runDoneIndex).toBeGreaterThanOrEqual(0);
    expect(namespaceIndex).toBe(runDoneIndex + 1);
    const nsEvent = events[namespaceIndex];
    if (nsEvent?.t === "namespace") {
      expect(nsEvent.names.map((n) => n.name)).toEqual(["a"]);
      expect(nsEvent.names[0]?.fromCurrentRun).toBe(true);
    }
  });

  it("requestNamespace is a separate pull carrying the same snapshot shape, usable without a run", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "run",
      runId: "n2",
      code: encodeOps([{ op: "setVar", name: "b", value: "2" }]),
      mountFiles: [],
      namespace: "session",
    });
    events.length = 0;
    await protocol.handle({ t: "requestNamespace", namespace: "session" });
    expect(events).toHaveLength(1);
    expect(events[0]?.t).toBe("namespace");
  });

  it("check never pushes a namespace event (graded state is thrown away)", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "check",
      runId: "cn1",
      code: encodeOps([{ op: "setVar", name: "z", value: "1" }]),
      mountFiles: [],
      hiddenTests: [],
    });
    expect(events.some((e) => e.t === "namespace")).toBe(false);
  });

  it("a raising __repr__ is caught, never crashing the namespace snapshot (F11)", async () => {
    // FakePythonEngine's snapshot always succeeds; this exercises filterNamespace's own
    // try/except discipline directly (also covered in nameInfoFilter.test.ts) via a custom
    // engine wrapper that forces a throwing repr.
    const { events, protocol, engine } = harness();
    await bootIsolated(protocol);
    const originalSnapshot = engine.snapshotNamespace.bind(engine);
    engine.snapshotNamespace = (ns) => {
      const real = originalSnapshot(ns);
      return [...real, { name: "cursed", group: "variable", typeName: "Cursed", computeRepr: () => { throw new Error("boom"); } }];
    };
    await protocol.handle({
      t: "run",
      runId: "cursed1",
      code: encodeOps([]),
      mountFiles: [],
      namespace: "session",
    });
    const nsEvent = events.find((e) => e.t === "namespace");
    if (nsEvent?.t === "namespace") {
      const cursed = nsEvent.names.find((n) => n.name === "cursed");
      expect(cursed?.repr).toBe("<repr() raised an exception>");
    } else {
      throw new Error("expected a namespace event");
    }
  });
});

describe("WorkerProtocolEngine: resetSession ack (P12)", () => {
  it("resetDone ok:true only when the reset actually succeeded", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    events.length = 0;
    await protocol.handle({ t: "resetSession", namespace: "session" });
    expect(events).toEqual([{ t: "resetDone", namespace: "session", ok: true }]);
  });

  it("resetDone ok:false when the engine reports failure, and the Fresh Slate beat must not fire on it", async () => {
    const { events, protocol, engine } = harness();
    await bootIsolated(protocol);
    events.length = 0;
    engine.resetNamespace = async () => false;
    await protocol.handle({ t: "resetSession", namespace: "session" });
    expect(events).toEqual([{ t: "resetDone", namespace: "session", ok: false }]);
  });
});

describe("WorkerProtocolEngine: interrupt wins over blocked input (B4)", () => {
  it("stop() resolves a run blocked on input(), never leaving it hanging", async () => {
    const { events, protocol, engine } = harness();
    await bootIsolated(protocol);

    const runPromise = protocol.handle({
      t: "run",
      runId: "int1",
      code: encodeOps([{ op: "callInput", prompt: "?", assignTo: "x" }]),
      mountFiles: [],
      namespace: "session",
    });

    // Give the fake engine a tick to reach the blocked input state, then interrupt it.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events.some((e) => e.t === "inputRequest")).toBe(true);
    await protocol.handle({ t: "stop", runId: "int1" });

    await Promise.race([runPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("hung")), 500))]);
    const runDone = events.find((e) => e.t === "runDone" && e.runId === "int1");
    expect(runDone).toEqual({ t: "runDone", runId: "int1", ok: false });
    void engine;
  });

  it("a late inputResponse after stop() cannot resurrect the run", async () => {
    const { protocol, engine } = harness();
    await bootIsolated(protocol);
    const runPromise = protocol.handle({
      t: "run",
      runId: "int2",
      code: encodeOps([{ op: "callInput", prompt: "?", assignTo: "x" }, { op: "setVar", name: "after", value: "1" }]),
      mountFiles: [],
      namespace: "session",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await protocol.handle({ t: "stop", runId: "int2" });
    await runPromise;
    // A late response should be a no-op (no pending resolver left).
    engine.provideInput("int2", new Uint8Array());
    const snapshot = engine.snapshotNamespace("session");
    expect(snapshot.some((n) => n.name === "after")).toBe(false);
  });
});

describe("WorkerProtocolEngine: OOM/crash -> fatal (F10)", () => {
  it("emits fatal{reason} when the engine reports an unexpected death, independent of any request", async () => {
    const { events, protocol, engine } = harness();
    await bootIsolated(protocol);
    engine.forceFatalOnNextRun("oom");
    // Fire-and-forget: a run that never resolves because the interpreter died.
    void protocol.handle({
      t: "run",
      runId: "oom1",
      code: encodeOps([{ op: "print", text: "before the crash" }]),
      mountFiles: [],
      namespace: "session",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events).toContainEqual({ t: "fatal", reason: "oom" });
  });
});

describe("WorkerProtocolEngine: loadPackage -> packageProgress", () => {
  it("streams download -> install -> done phases", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({ t: "loadPackage", name: "numpy" });
    const phases = events.filter((e) => e.t === "packageProgress").map((e) => (e.t === "packageProgress" ? e.phase : null));
    expect(phases).toEqual(["download", "download", "install", "done"]);
  });
});

describe("WorkerProtocolEngine: fileDrain (S6, I9 item 19)", () => {
  it("a session run that writes a file emits fileDrain carrying it", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "run",
      runId: "drain1",
      code: encodeOps([{ op: "writeSessionFile", path: "output.txt", contents: "generated output\n" }]),
      mountFiles: [],
      namespace: "session",
    });
    const drain = events.find((e) => e.t === "fileDrain");
    expect(drain).toBeDefined();
    if (drain?.t === "fileDrain") {
      expect(drain.namespace).toBe("session");
      expect(drain.runId).toBe("drain1");
      expect(drain.files).toHaveLength(1);
      expect(drain.files[0]?.path).toBe("output.txt");
      expect(drain.files[0]?.text).toBe("generated output\n");
    }
  });

  it("a graded check that writes a file does NOT emit fileDrain (isolation, F9)", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "check",
      runId: "drain2",
      code: encodeOps([{ op: "writeGradingFile", path: "/grading/secret.txt", contents: "should not drain" }]),
      mountFiles: [],
      hiddenTests: [],
    });
    const drain = events.find((e) => e.t === "fileDrain");
    expect(drain).toBeUndefined();
  });

  it("a session run that writes NO files does not emit an empty fileDrain", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "run",
      runId: "drain3",
      code: encodeOps([{ op: "print", text: "no file written" }]),
      mountFiles: [],
      namespace: "session",
    });
    const drain = events.find((e) => e.t === "fileDrain");
    expect(drain).toBeUndefined();
  });
});

describe("WorkerProtocolEngine: figure alt text is required (F20)", () => {
  it("defaults alt to 'figure output' when the program supplied none", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "run",
      runId: "fig1",
      code: encodeOps([{ op: "figure", alt: "" }]),
      mountFiles: [],
      namespace: "session",
    });
    const figureEvent = events.find((e) => e.t === "figure");
    expect(figureEvent).toMatchObject({ t: "figure", alt: "figure output" });
  });

  it("carries through the program's real alt text when given", async () => {
    const { events, protocol } = harness();
    await bootIsolated(protocol);
    await protocol.handle({
      t: "run",
      runId: "fig2",
      code: encodeOps([{ op: "figure", alt: "a red line chart" }]),
      mountFiles: [],
      namespace: "session",
    });
    const figureEvent = events.find((e) => e.t === "figure");
    expect(figureEvent).toMatchObject({ alt: "a red line chart" });
  });
});
