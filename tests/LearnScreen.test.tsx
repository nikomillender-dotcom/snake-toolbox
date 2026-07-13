import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { LearnScreen } from "../src/screens/LearnScreen";
import { createMockWorkerClient } from "../src/mocks/workerMock";
import { FIXTURE_BUNDLE } from "../src/mocks/curriculumFixture";

describe("LearnScreen (L2, F9 grading isolation at the UI-wiring level)", () => {
  it("Check always sends the CONTRACT-1 'check' message shape, which carries no namespace field by design (F9)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    const sent: unknown[] = [];
    const originalSend = worker.send.bind(worker);
    worker.send = (msg) => {
      sent.push(msg);
      originalSend(msg);
    };
    render(<LearnScreen bundle={FIXTURE_BUNDLE} worker={worker} inputCapable />);
    const checkButtons = screen.getAllByRole("button", { name: /Check/ });
    fireEvent.click(checkButtons[0]!);
    await waitFor(() => expect(sent.some((m) => (m as { t: string }).t === "check")).toBe(true));
    const checkMsg = sent.find((m) => (m as { t: string }).t === "check") as Record<string, unknown>;
    expect("namespace" in checkMsg).toBe(false);
  });

  it("the scratch REPL and the graded buffer are structurally independent editor instances (never one shared editor)", async () => {
    // CodeEditor tries CodeMirror 6 first (which mounts even under jsdom) and only falls back to
    // the accessible textarea if that throws (the F17 escape hatch), so both labelled editors are
    // resolved asynchronously here rather than assumed to be plain textareas.
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen bundle={FIXTURE_BUNDLE} worker={worker} inputCapable />);
    const gradedEditor = await screen.findByLabelText("Graded lesson code editor");
    const scratchEditor = await screen.findByLabelText("Scratch REPL editor");
    expect(gradedEditor).not.toBe(scratchEditor);
  });

  it("renders the degraded-boot banner when inputCapable is false (F5)", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen bundle={FIXTURE_BUNDLE} worker={worker} inputCapable={false} />);
    expect(screen.getByText(/Some features need a secure setup/)).toBeInTheDocument();
  });

  it("does not render the degraded-boot banner when inputCapable is true", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen bundle={FIXTURE_BUNDLE} worker={worker} inputCapable />);
    expect(screen.queryByText(/Some features need a secure setup/)).not.toBeInTheDocument();
  });
});
