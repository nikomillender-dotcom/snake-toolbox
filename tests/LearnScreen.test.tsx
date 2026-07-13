import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { LearnScreen } from "../src/screens/LearnScreen";
import { createMockWorkerClient } from "../src/mocks/workerMock";
import { FIXTURE_BUNDLE } from "../src/mocks/curriculumFixture";
import { REAL_CURRICULUM_BUNDLE } from "../src/curriculum/realCurriculumBundle";
import type { CurriculumBundle, Module, Lesson } from "../src/contracts";

function buildLessonIndex(bundle: typeof FIXTURE_BUNDLE) {
  const idx = new Map<string, { module: Module; lesson: Lesson; lessonOrder: number }>();
  for (const mod of bundle.modules) {
    for (let i = 0; i < mod.lessons.length; i++) {
      const lesson = mod.lessons[i]!;
      idx.set(lesson.id, { module: mod, lesson, lessonOrder: i });
    }
  }
  return idx;
}

const defaultProps = () => ({
  bundle: FIXTURE_BUNDLE,
  learnView: { view: "lesson" as const, lessonId: "m01-l1" },
  lessonIndex: buildLessonIndex(FIXTURE_BUNDLE),
  completedNodes: [],
  onNavigate: () => {},
});

describe("LearnScreen (L2, F9 grading isolation at the UI-wiring level)", () => {
  it("Check always sends the CONTRACT-1 'check' message shape, which carries no namespace field by design (F9)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    const sent: unknown[] = [];
    const originalSend = worker.send.bind(worker);
    worker.send = (msg) => {
      sent.push(msg);
      originalSend(msg);
    };
    render(<LearnScreen {...defaultProps()} worker={worker} inputCapable />);
    const checkButtons = screen.getAllByRole("button", { name: /Check/ });
    fireEvent.click(checkButtons[0]!);
    await waitFor(() => expect(sent.some((m) => (m as { t: string }).t === "check")).toBe(true));
    const checkMsg = sent.find((m) => (m as { t: string }).t === "check") as Record<string, unknown>;
    expect("namespace" in checkMsg).toBe(false);
  });

  it("the scratch REPL and the graded buffer are structurally independent editor instances (never one shared editor)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen {...defaultProps()} worker={worker} inputCapable />);
    const gradedEditor = await screen.findByLabelText("Graded lesson code editor");
    const scratchEditor = await screen.findByLabelText("Scratch REPL editor");
    expect(gradedEditor).not.toBe(scratchEditor);
  });

  it("renders the degraded-boot banner when inputCapable is false (F5)", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen {...defaultProps()} worker={worker} inputCapable={false} />);
    expect(screen.getByText(/Some features need a secure setup/)).toBeInTheDocument();
  });

  it("does not render the degraded-boot banner when inputCapable is true", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen {...defaultProps()} worker={worker} inputCapable />);
    expect(screen.queryByText(/Some features need a secure setup/)).not.toBeInTheDocument();
  });
});

// curriculum-bundle round, engine-assumption 3c (FLAGGED, not fixed here, see round report): a
// predictOutput/traceTable/mcq/fillBlank/parsons step carries an `expected` string but NO
// `hiddenTests` (65 of 87 real emitting steps in the authored m01-m10 content, confirmed by
// script). LearnScreen.checkGraded()'s fallback `step.hiddenTests ?? [{ id: "default", code: "",
// message: ... }]` sends a single EMPTY-code test, which the real engine's check() (and every
// PythonEngine implementation) reports as passed=true unconditionally (empty code never raises).
// There is no UI answer-capture for these step kinds either (LessonPane's ExercisePromptBody only
// wires mcq/parsons markup, never a typed-prediction input), so nothing is ever compared to
// `expected`. This regression test pins the CURRENT (buggy) behavior precisely, so a follow-up
// round has an exact reproduction rather than a vague report.
describe("KNOWN GAP (flagged, curriculum-bundle round): predictOutput Check trivially passes with no typed answer", () => {
  function buildRealLessonIndex(bundle: CurriculumBundle) {
    const idx = new Map<string, { module: Module; lesson: Lesson; lessonOrder: number }>();
    for (const mod of bundle.modules) {
      for (let i = 0; i < mod.lessons.length; i++) {
        const lesson = mod.lessons[i]!;
        idx.set(lesson.id, { module: mod, lesson, lessonOrder: i });
      }
    }
    return idx;
  }

  it("clicking Check on a real predictOutput step (m01-l1-s4, no hiddenTests) reports 'Step cleared' with the editor left EMPTY", async () => {
    const step = REAL_CURRICULUM_BUNDLE.modules
      .find(m => m.id === "m01")!.lessons.find(l => l.id === "m01-l1")!.steps
      .find(s => s.id === "m01-l1-s4")!;
    // Sanity: confirm this is exactly the shape the bug depends on (real content, not invented).
    expect(step.kind).toBe("predictOutput");
    expect(step.expected).toBe("Snake ToolBox is booting up");
    expect(step.hiddenTests).toBeUndefined();

    const worker = createMockWorkerClient({ delayMs: 5 });
    render(
      <LearnScreen
        bundle={REAL_CURRICULUM_BUNDLE}
        worker={worker}
        inputCapable
        learnView={{ view: "lesson", lessonId: "m01-l1", focusStepId: "m01-l1-s4" }}
        lessonIndex={buildRealLessonIndex(REAL_CURRICULUM_BUNDLE)}
        completedNodes={[]}
        onNavigate={() => {}}
      />
    );
    const editor = await screen.findByLabelText("Graded lesson code editor");
    expect(editor.textContent ?? "").toBe(""); // never typed a prediction
    const checkButtons = screen.getAllByRole("button", { name: /Check/ });
    fireEvent.click(checkButtons[0]!);
    // FLAGGED: this reports success with zero verification of any typed prediction.
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
  });
});
