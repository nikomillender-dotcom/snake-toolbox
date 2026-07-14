import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/preact";
import { makeInMemoryStore } from "../src/engine/fixtures/inMemoryStore.fixture";
import type { MainToWorker, WorkerToMain } from "../src/contracts";

// Manager fix round (item 4, boot diagnostics): Niko's first iPad load was a silent blank screen
// that self-healed on reload, unacceptable for a new user. A worker spawn failure, a loadPyodide
// throw, and the F7 boot hash self-check failure all end up as a CONTRACT-1 `fatal` message
// (proven by workerProtocolEngine.test.ts and pyodideEngine tests); this file proves the piece
// that was previously MISSING: that App.tsx actually reacts to `fatal` with an honest, named
// banner instead of silently sitting on "Booting Python..." forever (the pre-fix behavior, since
// only workerClient's OWN internal respawn listener ever read `fatal`, never the UI).
//
// A hand-rolled controllable WorkerClient (not the scripted mocks/workerMock.ts stand-in, though
// that ALSO gained a `bootFatal` option this round for App.test.tsx-style happy-path coverage) so
// these tests can choose the EXACT message sequence: a `fatal` with no preceding `ready`, and later,
// deliberately, a `ready` that self-heals it.
const { controllable, sentMessages } = vi.hoisted(() => {
  return {
    controllable: { listeners: new Set<(msg: WorkerToMain) => void>() },
    sentMessages: [] as MainToWorker[],
  };
});

vi.mock("../src/workerClient", () => ({
  createWorkerClient: () => ({
    send: (msg: MainToWorker) => { sentMessages.push(msg); },
    subscribe: (cb: (msg: WorkerToMain) => void) => {
      controllable.listeners.add(cb);
      return () => controllable.listeners.delete(cb);
    },
    dispose: () => {},
  }),
}));

import { App } from "../src/App";

function emit(msg: WorkerToMain) {
  controllable.listeners.forEach((cb) => cb(msg));
}

describe("App boot-failure banner (Manager fix round, item 4)", () => {
  it("a fatal with no prior ready surfaces a calm, honest, named banner, never a silently-stuck 'Booting Python...'", async () => {
    const testStore = makeInMemoryStore();
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    await waitFor(() => expect(screen.getByText(/Booting Python/)).toBeInTheDocument());

    emit({ t: "fatal", reason: "crash" });
    await waitFor(() => expect(screen.getByText(/Python did not start/)).toBeInTheDocument());
    expect(screen.getByText(/an internal error/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // the OLD stuck-forever text is gone, replaced (never both/neither)
    expect(screen.queryByText(/^Booting Python\.\.\.$/)).not.toBeInTheDocument();
  });

  it("oom and unknown reasons each get their own honest detail text", async () => {
    const testStore = makeInMemoryStore();
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    emit({ t: "fatal", reason: "oom" });
    await waitFor(() => expect(screen.getByText(/the device ran low on memory/)).toBeInTheDocument());
  });

  it("a later ready (a successful respawn) clears the banner: the app already self-heals, this just makes it visible instead of silent", async () => {
    const testStore = makeInMemoryStore();
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    emit({ t: "fatal", reason: "unknown" });
    await waitFor(() => expect(screen.getByText(/Python did not start/)).toBeInTheDocument());

    emit({ t: "ready", pyodideVersion: "314.0.2", inputCapable: true });
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument());
    expect(screen.queryByText(/Python did not start/)).not.toBeInTheDocument();
  });

  it("a fatal AFTER the runtime was already warm reads as a crash mid-session, not 'did not start'", async () => {
    const testStore = makeInMemoryStore();
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    emit({ t: "ready", pyodideVersion: "314.0.2", inputCapable: true });
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument());

    emit({ t: "fatal", reason: "crash" });
    await waitFor(() => expect(screen.getByText(/Python's engine crashed/)).toBeInTheDocument());
  });

  it("'Try again' re-sends a boot message (the same retry path startBoot already uses)", async () => {
    const testStore = makeInMemoryStore();
    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    emit({ t: "fatal", reason: "crash" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument());

    const bootMessagesBefore = sentMessages.filter((m) => m.t === "boot").length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const bootMessagesAfter = sentMessages.filter((m) => m.t === "boot").length;
    expect(bootMessagesAfter).toBe(bootMessagesBefore + 1);
    // optimistically clears back to the loading banner rather than staying on the error text
    await waitFor(() => expect(screen.getByText(/^Booting Python\.\.\.$/)).toBeInTheDocument());
  });
});
