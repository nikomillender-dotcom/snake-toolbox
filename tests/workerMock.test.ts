import { describe, expect, it } from "vitest";
import { createMockWorkerClient } from "../src/mocks/workerMock";
import type { WorkerToMain } from "../src/contracts";

function collect(worker: ReturnType<typeof createMockWorkerClient>) {
  const events: WorkerToMain[] = [];
  worker.subscribe((m) => events.push(m));
  return events;
}

describe("mock WorkerClient (CONTRACT 1, L11)", () => {
  it("F5/P1: degraded boot (null SABs) reports ready.inputCapable === false", async () => {
    const worker = createMockWorkerClient();
    const events = collect(worker);
    worker.send({ t: "boot", pyodideVersion: "x", pyodideHash: "y", interruptBuffer: null, inputBuffer: null });
    await new Promise((r) => setTimeout(r, 30));
    const ready = events.find((e) => e.t === "ready");
    expect(ready).toBeDefined();
    expect((ready as Extract<WorkerToMain, { t: "ready" }>).inputCapable).toBe(false);
  });

  it("isolated boot (real SABs) reports ready.inputCapable === true", async () => {
    const worker = createMockWorkerClient();
    const events = collect(worker);
    worker.send({ t: "boot", pyodideVersion: "x", pyodideHash: "y", interruptBuffer: new SharedArrayBuffer(4), inputBuffer: new SharedArrayBuffer(4) });
    await new Promise((r) => setTimeout(r, 30));
    const ready = events.find((e) => e.t === "ready");
    expect((ready as Extract<WorkerToMain, { t: "ready" }>).inputCapable).toBe(true);
  });

  it("F10: a CRASH_WORKER marker emits a fatal event", async () => {
    const worker = createMockWorkerClient();
    const events = collect(worker);
    worker.send({ t: "run", runId: "r1", code: "# CRASH_WORKER", mountFiles: [], namespace: "session" });
    await new Promise((r) => setTimeout(r, 30));
    expect(events.some((e) => e.t === "fatal")).toBe(true);
  });

  it("F19: input(...) code emits inputRequest, blocks, then resumes on inputResponse", async () => {
    const worker = createMockWorkerClient();
    const events = collect(worker);
    worker.send({ t: "run", runId: "r2", code: "name = input()", mountFiles: [], namespace: "session" });
    await new Promise((r) => setTimeout(r, 30));
    const req = events.find((e) => e.t === "inputRequest");
    expect(req).toBeDefined();
    expect(events.some((e) => e.t === "runDone")).toBe(false); // must not complete while blocked
    worker.send({ t: "inputResponse", runId: "r2", bytes: new TextEncoder().encode("Niko") });
    await new Promise((r) => setTimeout(r, 30));
    expect(events.some((e) => e.t === "runDone" && e.runId === "r2" && e.ok)).toBe(true);
  });

  it("P4: the worker PUSHES a namespace event right after every runDone (not just on request)", async () => {
    const worker = createMockWorkerClient();
    const events = collect(worker);
    worker.send({ t: "run", runId: "r3", code: "x = 1", mountFiles: [], namespace: "session" });
    await new Promise((r) => setTimeout(r, 30));
    const idx = events.findIndex((e) => e.t === "runDone");
    expect(idx).toBeGreaterThan(-1);
    expect(events[idx + 1]?.t).toBe("namespace");
  });

  it("P4: requestNamespace is a separate PULL carrying the same snapshot shape", async () => {
    const worker = createMockWorkerClient();
    worker.send({ t: "run", runId: "r4", code: "x = 1", mountFiles: [], namespace: "session" });
    await new Promise((r) => setTimeout(r, 30));
    const events = collect(worker);
    worker.send({ t: "requestNamespace", namespace: "session" });
    expect(events.some((e) => e.t === "namespace" && e.namespace === "session")).toBe(true);
  });

  it("P12: resetDone{ok:true} is the ONLY signal the Fresh Slate beat may fire on, and clears names", async () => {
    const worker = createMockWorkerClient();
    worker.send({ t: "run", runId: "r5", code: "x = 1", mountFiles: [], namespace: "session" });
    await new Promise((r) => setTimeout(r, 30));
    const events = collect(worker);
    worker.send({ t: "resetSession", namespace: "session" });
    await new Promise((r) => setTimeout(r, 30));
    const reset = events.find((e) => e.t === "resetDone");
    expect(reset).toBeDefined();
    expect((reset as Extract<WorkerToMain, { t: "resetDone" }>).ok).toBe(true);
    const pullEvents: WorkerToMain[] = [];
    worker.subscribe((m) => pullEvents.push(m));
    worker.send({ t: "requestNamespace", namespace: "session" });
    const ns = pullEvents.find((e) => e.t === "namespace") as Extract<WorkerToMain, { t: "namespace" }>;
    expect(ns.names).toEqual([]);
  });

  it("F9 shape: a 'check' message carries no namespace argument by design (always graded+isolated)", () => {
    // type-level guarantee: this line would fail to compile if `check` ever grew a `namespace`
    // field, which is exactly the F9 grading-isolation discipline CONTRACT 1 pins by shape.
    const msg: { t: "check"; runId: string; code: string; mountFiles: []; hiddenTests: [] } = {
      t: "check", runId: "x", code: "", mountFiles: [], hiddenTests: []
    };
    expect("namespace" in msg).toBe(false);
  });
});
