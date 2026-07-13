import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { SandboxScreen } from "../src/screens/SandboxScreen";
import { createMockWorkerClient } from "../src/mocks/workerMock";

// SandboxScreen, L3/DESIGN v0.4 R (D14/I2 item 18): on a fresh install with NO saved data and NO
// GitHub connection, Sandbox is IMMEDIATELY, FULLY functional. This test wipes to zero state by
// construction (SandboxScreen's own ZERO_STATE_FILES, no Store/restore involved at all) and proves
// create-file -> Run -> see-output succeeds.

describe("SandboxScreen zero-state acceptance (D14/R)", () => {
  it("the editor is reachable immediately, with a real file already open, no progress/account/restore gate", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<SandboxScreen worker={worker} inputCapable />);
    const editor = await screen.findByLabelText("main.py editor");
    expect(editor).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/restore/i)).not.toBeInTheDocument();
  });

  it("create a new file, Run it, and see output, with zero saved data (the acceptance criterion)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<SandboxScreen worker={worker} inputCapable />);
    fireEvent.click(screen.getByText("+ new file"));
    const runButton = screen.getByRole("button", { name: /Run$/ });
    fireEvent.click(runButton);
    await waitFor(() => expect(screen.getByLabelText("Program output").textContent).toMatch(/3\.5/));
  });

  it("the Session chip starts cold and goes live only after a real run (never fabricated)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<SandboxScreen worker={worker} inputCapable />);
    expect(screen.getByText("Session: cold")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Run$/ }));
    await waitFor(() => expect(screen.queryByText("Session: cold")).not.toBeInTheDocument());
  });

  it("F10: a fatal worker event shows the honest crash toast and cools the session, never a frozen tab", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    // editorMode="textarea" forces the accessible fallback deterministically for this test (see
    // CodeEditor.test.tsx for dedicated fallback-path coverage); avoids the async CM6 mount race.
    render(<SandboxScreen worker={worker} inputCapable editorMode="textarea" />);
    const editor = await screen.findByLabelText("main.py editor");
    fireEvent.input(editor, { target: { value: "# CRASH_WORKER" } });
    fireEvent.click(screen.getByRole("button", { name: /Run$/ }));
    await waitFor(() => expect(screen.getByText(/Python crashed/)).toBeInTheDocument());
    expect(screen.getByText("Session: cold")).toBeInTheDocument();
  });
});
