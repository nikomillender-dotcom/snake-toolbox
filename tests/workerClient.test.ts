import { describe, expect, it } from "vitest";
import { createWorkerClient } from "../src/workerClient";
import type { WorkerToMain } from "../src/contracts";

// Manager fix round (item 4, boot diagnostics): workerClient.ts's `spawnWorker()` used to be an
// UNGUARDED `new Worker(...)`, so a spawn failure threw straight out of `createWorkerClient()`,
// which App.tsx calls from a `useMemo` during render, with no error boundary anywhere in the tree
// before this round. That is exactly Niko's reported "silent blank screen on first iPad load,
// self-healed on reload": whatever transient condition made `new Worker(...)` throw (a cold-load
// resource fetch failure for the worker script, a module-worker-type quirk, etc.) crashed the
// whole render with no message at all.
//
// jsdom (this suite's test environment) does not implement Web Workers at all, so `Worker` is
// already `undefined` in every test file here; that is a REAL, not simulated, spawn failure, which
// makes this file able to exercise the fix directly against the real `createWorkerClient()`
// rather than a stand-in, no mocking required.
describe("workerClient.ts: spawn failure is caught, never thrown, and surfaces via the fatal channel (item 4)", () => {
  it("createWorkerClient() does not throw even when the Worker constructor is unavailable (jsdom has none)", () => {
    expect(() => createWorkerClient()).not.toThrow();
  });

  it("a spawn failure eventually emits a fatal to subscribers registered AFTER creation (matching App.tsx's real useEffect timing)", async () => {
    const client = createWorkerClient();
    const received: WorkerToMain[] = [];
    // Registered AFTER creation, the same order App.tsx's own `useEffect(() => worker.subscribe(...))`
    // runs relative to the `useMemo(() => createWorkerClient(), [])` that creates the client during
    // render: the fatal must be deferred (a macrotask), or an external subscriber like this would
    // never see it, since it could not have been registered before construction ran synchronously.
    client.subscribe((msg) => received.push(msg));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(received.some((m) => m.t === "fatal")).toBe(true);
  });

  it("send() and dispose() are safe no-ops when the worker never spawned (never throws)", () => {
    const client = createWorkerClient();
    expect(() => client.send({
      t: "boot", pyodideVersion: "314.0.2", pyodideHash: "fixture",
      interruptBuffer: null, inputBuffer: null,
    })).not.toThrow();
    expect(() => client.dispose()).not.toThrow();
  });
});
