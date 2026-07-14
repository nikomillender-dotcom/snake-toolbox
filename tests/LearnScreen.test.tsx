import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { LearnScreen } from "../src/screens/LearnScreen";
import { createMockWorkerClient } from "../src/mocks/workerMock";
import { FIXTURE_BUNDLE } from "../src/mocks/curriculumFixture";
import { REAL_CURRICULUM_BUNDLE } from "../src/curriculum/realCurriculumBundle";
import type { CompletedNode, CurriculumBundle, Module, Lesson } from "../src/contracts";
import { makeInMemoryStore } from "../src/engine/fixtures/inMemoryStore.fixture";

// G17 App-level test only: mock the real worker client so App boots under jsdom (no Web Worker
// support), exactly the pattern tests/App.test.tsx already uses. Every other test in this file
// renders LearnScreen directly with an explicit mock worker prop and never touches this module.
vi.mock("../src/workerClient", () => ({
  createWorkerClient: () => createMockWorkerClient(),
}));
import { App } from "../src/App";

function buildLessonIndex(bundle: CurriculumBundle) {
  const idx = new Map<string, { module: Module; lesson: Lesson; lessonOrder: number }>();
  for (const mod of bundle.modules) {
    for (let i = 0; i < mod.lessons.length; i++) {
      const lesson = mod.lessons[i]!;
      idx.set(lesson.id, { module: mod, lesson, lessonOrder: i });
    }
  }
  return idx;
}

const FIXTURE_LESSON_INDEX = buildLessonIndex(FIXTURE_BUNDLE);
const REAL_LESSON_INDEX = buildLessonIndex(REAL_CURRICULUM_BUNDLE);

const defaultProps = () => ({
  bundle: FIXTURE_BUNDLE,
  learnView: { view: "lesson" as const, lessonId: "m01-l1" },
  lessonIndex: FIXTURE_LESSON_INDEX,
  completedNodes: [],
  onNavigate: () => {},
});

// Makes a minimal, real-shape CompletedNode for the fix-round landing/nav tests below. moduleId is
// derived from the nodeId's module prefix ("m01-l2-s3" -> "m01") the same way every real id is
// authored, so callers only ever need to name the step id + kind.
function completedNode(nodeId: string, kind: CompletedNode["kind"]): CompletedNode {
  return { nodeId, kind, moduleId: nodeId.split("-")[0]!, strand: "core", timestamp: Date.now() };
}

// Renders LearnScreen against the REAL curriculum bundle. focusStepId, when given, jumps directly
// to one step (R1), the same deep-link mechanism a glossary/review re-visit uses; omitted, the
// lesson lands wherever LearnScreen's own initial-step rule (bug 1) puts it, exactly like a real
// nav-in from the module list. `extra` is spread LAST, so it can override completedNodes/onNavigate
// too (both are otherwise defaulted to empty/no-op below).
function renderReal(lessonId: string, focusStepId?: string, extra: Partial<Parameters<typeof LearnScreen>[0]> = {}) {
  const worker = createMockWorkerClient({ delayMs: 5 });
  const onLessonStepComplete = vi.fn();
  const learnView = focusStepId
    ? { view: "lesson" as const, lessonId, focusStepId }
    : { view: "lesson" as const, lessonId };
  const utils = render(
    <LearnScreen
      bundle={REAL_CURRICULUM_BUNDLE}
      worker={worker}
      inputCapable
      learnView={learnView}
      lessonIndex={REAL_LESSON_INDEX}
      completedNodes={[]}
      onNavigate={() => {}}
      onLessonStepComplete={onLessonStepComplete}
      {...extra}
    />
  );
  return { ...utils, worker, onLessonStepComplete };
}

describe("LearnScreen (L2, F9 grading isolation at the UI-wiring level)", () => {
  it("Check on a hidden-test-kind step (fixBug) always sends the CONTRACT-1 'check' message shape, which carries no namespace field by design (F9)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    const sent: unknown[] = [];
    const originalSend = worker.send.bind(worker);
    worker.send = (msg) => {
      sent.push(msg);
      originalSend(msg);
    };
    render(
      <LearnScreen
        {...defaultProps()}
        worker={worker}
        inputCapable
        learnView={{ view: "lesson", lessonId: "m03-l1", focusStepId: "m03-l1-s1" }}
      />
    );
    const checkButtons = screen.getAllByRole("button", { name: /Check/ });
    fireEvent.click(checkButtons[0]!);
    await waitFor(() => expect(sent.some((m) => (m as { t: string }).t === "check")).toBe(true));
    const checkMsg = sent.find((m) => (m as { t: string }).t === "check") as Record<string, unknown>;
    expect("namespace" in checkMsg).toBe(false);
  });

  it("the scratch REPL and the graded buffer (a hidden-test-kind step) are structurally independent editor instances (never one shared editor)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(
      <LearnScreen
        {...defaultProps()}
        worker={worker}
        inputCapable
        learnView={{ view: "lesson", lessonId: "m03-l1", focusStepId: "m03-l1-s1" }}
      />
    );
    const gradedEditor = await screen.findByLabelText("Graded lesson code editor");
    const scratchEditor = await screen.findByLabelText("Scratch REPL editor");
    expect(gradedEditor).not.toBe(scratchEditor);
  });

  it("renders the degraded-boot banner when inputCapable is false (F5)", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen {...defaultProps()} worker={worker} inputCapable={false} />);
    const banner = screen.getByText(/input\(\) is unavailable on this device/);
    expect(banner).toBeInTheDocument();
    expect(banner).toBeVisible();
  });

  it("does not VISIBLY render the degraded-boot banner text when inputCapable is true, but the status region is already mounted (SF5: never a freshly-mounted live region)", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<LearnScreen {...defaultProps()} worker={worker} inputCapable />);
    expect(screen.queryByText(/input\(\) is unavailable on this device/)).not.toBeInTheDocument();
    // the role="status" shell itself is present from first render (query by role, not text, since
    // its text is empty while idle); only its content/visibility ever changes.
    const statusRegions = screen.getAllByRole("status", { hidden: true });
    expect(statusRegions.length).toBeGreaterThan(0);
  });
});

// grading-interaction-spec.md: honest grading for the five answer-compared step kinds (G0 to G17).
// Every test below drives the REAL authored content (m01-m10), the exact shapes the round's hole
// was quantified against (65 of 87 real emitting steps had no hiddenTests and no capture UI).
describe("honest grading: predictOutput (G1 to G5, G16)", () => {
  // m01-l1-s4: code print("Snake ToolBox is booting up"), expected "Snake ToolBox is booting up",
  // strand "core". It is the FIRST completion-emitting step in m01-l1 (s1 to s3 are prose/
  // liveExample/prose), so it is also reachable as the lesson's natural landing step.

  it("REGRESSION FLIP (was: 'clicking Check on an empty editor reports Step cleared'): an empty prediction leaves Check disabled, and clicking it is a calm no-op, never a false pass", async () => {
    const { onLessonStepComplete } = renderReal("m01-l1", "m01-l1-s4");
    const field = await screen.findByLabelText("Your prediction");
    expect((field as HTMLTextAreaElement).value).toBe(""); // never typed a prediction
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    expect(checkBtn).toBeDisabled();
    fireEvent.click(checkBtn); // disabled: real DOM never dispatches this to the handler
    expect(screen.queryByText(/Nice\. Step cleared\./)).not.toBeInTheDocument();
    expect(onLessonStepComplete).not.toHaveBeenCalled();
    // the learner's (empty) input is left exactly where it was, never force-cleared
    expect((field as HTMLTextAreaElement).value).toBe("");
  });

  it("a correct prediction passes and emits exactly once", async () => {
    const { onLessonStepComplete } = renderReal("m01-l1", "m01-l1-s4");
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "Snake ToolBox is booting up" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledTimes(1);
    expect(onLessonStepComplete).toHaveBeenCalledWith("m01", "m01-l1", "m01-l1-s4");
  });

  it("a wrong (non-empty, partial) prediction fails honestly: no false pass, no emission, coach diff shown", async () => {
    const { onLessonStepComplete } = renderReal("m01-l1", "m01-l1-s4");
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "snake toolbox is booting up" } }); // wrong case
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/one requirement short/)).toBeInTheDocument());
    expect(screen.queryByText(/Nice\. Step cleared\./)).not.toBeInTheDocument();
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });

  it("whitespace rule: a trailing space (line-end whitespace) is normalized away and still passes", async () => {
    renderReal("m01-l1", "m01-l1-s4");
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "Snake ToolBox is booting up   " } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
  });

  it("whitespace rule: a trailing Return (final newline) is normalized away and still passes", async () => {
    renderReal("m01-l1", "m01-l1-s4");
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "Snake ToolBox is booting up\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
  });
});

describe("honest grading: traceTable grades whole-answer, identically to predictOutput (G4)", () => {
  // m02-l2-s4: an accumulator trace, expected "10", strand "core".
  it("a correct trace passes", async () => {
    const { onLessonStepComplete } = renderReal("m02-l2", "m02-l2-s4");
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m02", "m02-l2", "m02-l2-s4");
  });

  it("an empty trace leaves Check disabled and never clears/emits", async () => {
    const { onLessonStepComplete } = renderReal("m02-l2", "m02-l2-s4");
    await screen.findByLabelText("Your prediction");
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    expect(checkBtn).toBeDisabled();
    fireEvent.click(checkBtn);
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });

  it("load-bearing whitespace case: internal spacing in a dict repr is significant (m09-l3-s4, {'a': 2, 'b': 1})", async () => {
    // m09-l3-s4: a Counter-style dict trace, expected "{'a': 2, 'b': 1}", strand "core".
    const { onLessonStepComplete } = renderReal("m09-l3", "m09-l3-s4");
    const field = await screen.findByLabelText("Your prediction");

    // missing the space after the second colon: internal whitespace is NOT normalized, must fail.
    fireEvent.input(field, { target: { value: "{'a': 2, 'b':1}" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/one requirement short/)).toBeInTheDocument());
    expect(onLessonStepComplete).not.toHaveBeenCalled();

    // the exact repr passes.
    fireEvent.input(field, { target: { value: "{'a': 2, 'b': 1}" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m09", "m09-l3", "m09-l3-s4");
  });
});

describe("honest grading: mcq (G6, G7)", () => {
  // m01-l3-s4: choices ['"7"', '7', '"seven"', 'seven'], answerIndex 1, strand "core".
  it("Check is disabled until exactly one option is selected, and never auto-passes on load", async () => {
    const { onLessonStepComplete } = renderReal("m01-l3", "m01-l3-s4");
    await screen.findAllByRole("radio");
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    expect(checkBtn).toBeDisabled();
    fireEvent.click(checkBtn);
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });

  it("selecting the correct index passes and emits", async () => {
    const { onLessonStepComplete } = renderReal("m01-l3", "m01-l3-s4");
    const radios = await screen.findAllByRole("radio");
    fireEvent.click(radios[1]!); // index 1 == "7" (no quotes) == answerIndex
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m01", "m01-l3", "m01-l3-s4");
  });

  it("selecting a wrong index fails honestly, coaches without shaming, never emits", async () => {
    const { onLessonStepComplete } = renderReal("m01-l3", "m01-l3-s4");
    const radios = await screen.findAllByRole("radio");
    fireEvent.click(radios[0]!); // '"7"' (a string), the wrong pick
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Not that one\. Take another look\./)).toBeInTheDocument());
    expect(screen.queryByText(/Nice\. Step cleared\./)).not.toBeInTheDocument();
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });
});

describe("honest grading: fillBlank (G8, G9)", () => {
  // m01-l2-s4: expected "#", strand "core". Check disabled until non-empty.
  it("Check is disabled until the trimmed value is non-empty", async () => {
    const { onLessonStepComplete } = renderReal("m01-l2", "m01-l2-s4");
    await screen.findByLabelText("Fill in the blank");
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    expect(checkBtn).toBeDisabled();
    fireEvent.click(checkBtn);
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });

  it("the exact token passes", async () => {
    const { onLessonStepComplete } = renderReal("m01-l2", "m01-l2-s4");
    const chip = await screen.findByLabelText("Fill in the blank");
    fireEvent.input(chip, { target: { value: "#" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m01", "m01-l2", "m01-l2-s4");
  });

  it("a wrong token fails honestly and never emits", async () => {
    const { onLessonStepComplete } = renderReal("m01-l2", "m01-l2-s4");
    const chip = await screen.findByLabelText("Fill in the blank");
    fireEvent.input(chip, { target: { value: "//" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Close\. Check your spelling and capital letters\./)).toBeInTheDocument());
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });

  it("case sensitivity (m06-l4-s3, expected 'None' with a capital N): lowercase 'none' fails, 'None' passes", async () => {
    const { onLessonStepComplete } = renderReal("m06-l4", "m06-l4-s3");
    const chip = await screen.findByLabelText("Fill in the blank");

    fireEvent.input(chip, { target: { value: "none" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Close\. Check your spelling and capital letters\./)).toBeInTheDocument());
    expect(onLessonStepComplete).not.toHaveBeenCalled();

    fireEvent.input(chip, { target: { value: "None" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m06", "m06-l4", "m06-l4-s3");
  });
});

describe("honest grading: parsons (G10, G11, G12)", () => {
  // m01-l2-s3: scrambled = [gator line, hello line, name line], solutionOrder [1, 2, 0], strand "core".
  it("the scrambled (unarranged) starting order never auto-passes on load; Check is enabled (an arrangement always exists, G13) but grading is honest", async () => {
    const { onLessonStepComplete } = renderReal("m01-l2", "m01-l2-s3");
    await screen.findAllByRole("listitem");
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    expect(checkBtn).not.toBeDisabled(); // G10: parsons is never "empty"
    fireEvent.click(checkBtn);
    await waitFor(() => expect(screen.getByText(/Some lines are home, some need to move\./)).toBeInTheDocument());
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });

  it("reordering to the correct value-sequence via the move-down buttons passes and emits", async () => {
    const { onLessonStepComplete } = renderReal("m01-l2", "m01-l2-s3");
    await screen.findAllByRole("listitem");
    const moveFirstDown = () => fireEvent.click(screen.getByRole("button", { name: /Move print\("Later, gator\.\"\) down/ }));
    moveFirstDown(); // [1, 0, 2]
    moveFirstDown(); // [1, 2, 0] == solutionOrder
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m01", "m01-l2", "m01-l2-s3");
  });
});

describe("hidden-test path (writeStub/fixBug/boss) is UNCHANGED by this round", () => {
  it("fixBug (m01-l4-s5) still routes through the worker's real hiddenTests, unchanged, no namespace field", async () => {
    const { worker, onLessonStepComplete } = renderReal("m01-l4", "m01-l4-s5");
    await screen.findByLabelText("Graded lesson code editor");
    const sent: unknown[] = [];
    const originalSend = worker.send.bind(worker);
    worker.send = (msg) => { sent.push(msg); originalSend(msg); };

    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    await waitFor(() => expect(sent.some((m) => (m as { t: string }).t === "check")).toBe(true));
    const checkMsg = sent.find((m) => (m as { t: string }).t === "check") as { hiddenTests: unknown[] };
    expect(checkMsg.hiddenTests).toHaveLength(3); // the step's REAL authored hiddenTests, not a fallback
    expect("namespace" in checkMsg).toBe(false);

    // the mock worker's handleCheck always passes (no # FAIL_CHECK marker), proving the pass path
    // still emits through the exact same callback.
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());
    expect(onLessonStepComplete).toHaveBeenCalledWith("m01", "m01-l4", "m01-l4-s5");
  });
});

describe("G0/G13 defensive clause: a step matching no grader never auto-passes", () => {
  it("a prose step (no answer shape) never shows a false pass when Check is somehow reached", async () => {
    // Fixture m01-l1-s1 is prose. Land on it directly via focusStepId.
    const worker = createMockWorkerClient({ delayMs: 5 });
    const onLessonStepComplete = vi.fn();
    render(
      <LearnScreen
        {...defaultProps()}
        worker={worker}
        inputCapable
        learnView={{ view: "lesson", lessonId: "m01-l1", focusStepId: "m01-l1-s1" }}
        onLessonStepComplete={onLessonStepComplete}
      />
    );
    expect(await screen.findByText(/This step cannot be graded yet\./)).toBeInTheDocument();
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    expect(checkBtn).toBeDisabled();
    expect(onLessonStepComplete).not.toHaveBeenCalled();
  });
});

// Manager fix round: three interlocking lesson-FLOW bugs Niko hit playing the live app, none of
// which the grading-round tests above ever exercised (they all deep-link straight to one step and
// never "walk a lesson like a human"). m01-l1 (Your First Line: prose, liveExample, prose,
// predictOutput) and m01-l2 (print, and Leaving Notes: prose, liveExample, parsons, fillBlank) are
// the real content used throughout; see the top of this file for their exact step shapes.
describe("lesson-flow fix round: never-started landing (bug 1)", () => {
  it("a lesson with ZERO completed emitting steps opens at step 0 (the teaching), not at the first exercise", async () => {
    renderReal("m01-l1"); // no focusStepId, no completedNodes: a totally fresh lesson
    expect(await screen.findByText(/Welcome in\./)).toBeInTheDocument();
    expect(screen.getByText("step 1 of 4")).toBeInTheDocument();
    // The old bug landed here directly, skipping all three teaching steps.
    expect(screen.queryByLabelText("Your prediction")).not.toBeInTheDocument();
  });

  it("a lesson with SOME progress resumes right after the LAST completed emitting step, clamped", async () => {
    // m01-l2: s1 prose, s2 liveExample, s3 parsons (emitting, marked complete below), s4 fillBlank
    // (emitting, not complete). Should land on s4 (index 3), not re-open s1 and not skip past s4.
    renderReal("m01-l2", undefined, { completedNodes: [completedNode("m01-l2-s3", "parsons")] });
    expect(await screen.findByLabelText("Fill in the blank")).toBeInTheDocument();
    expect(screen.getByText("step 4 of 4")).toBeInTheDocument();
  });
});

describe("lesson-flow fix round: persistent Back/Next step nav (bug 2)", () => {
  it("Next and Back walk a non-graded (prose/liveExample) run of steps; Back is disabled on step 1", async () => {
    renderReal("m01-l1"); // lands at step 0 (bug 1 fix)
    await screen.findByText(/Welcome in\./);
    expect(screen.getByRole("button", { name: "<- Back" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next ->" })); // s1 -> s2 (liveExample)
    expect(await screen.findByText('print("Hello, world.")')).toBeInTheDocument(); // s2's code block
    expect(screen.getByText("step 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "<- Back" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "<- Back" })); // s2 -> s1
    expect(await screen.findByText(/Welcome in\./)).toBeInTheDocument();
    expect(screen.getByText("step 1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "<- Back" })).toBeDisabled();
  });

  it("an incomplete graded step offers NO persistent Next: Check is the only path forward (never a skip-around)", async () => {
    // m01-l2-s3 (parsons), landed directly, never passed.
    renderReal("m01-l2", "m01-l2-s3");
    await screen.findAllByRole("listitem");
    expect(screen.getByRole("button", { name: "<- Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next ->" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish lesson" })).not.toBeInTheDocument();
  });

  it("a graded step that is ALREADY complete (e.g. after backing into it) offers a persistent Next past it", async () => {
    // m01-l2-s3 (parsons) landed directly, but marked already-complete: proves backing into a
    // cleared graded step and moving forward again works without re-passing Check.
    renderReal("m01-l2", "m01-l2-s3", { completedNodes: [completedNode("m01-l2-s3", "parsons")] });
    await screen.findAllByRole("listitem");
    const nextBtn = await screen.findByRole("button", { name: "Next ->" });
    fireEvent.click(nextBtn); // s3 -> s4 (fillBlank)
    expect(await screen.findByLabelText("Fill in the blank")).toBeInTheDocument();
    expect(screen.getByText("step 4 of 4")).toBeInTheDocument();
  });
});

describe("lesson-flow fix round: honest last-step action, never a silent no-op (bug 3)", () => {
  it("passing the lesson's LAST step relabels CheckResult's action 'Finish lesson' and routes to the module screen", async () => {
    const onNavigate = vi.fn();
    // m01-l1-s4 (predictOutput) is m01-l1's last step (index 3 of 4).
    const { onLessonStepComplete } = renderReal("m01-l1", "m01-l1-s4", { onNavigate });
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "Snake ToolBox is booting up" } });
    fireEvent.click(screen.getByRole("button", { name: /Check/ }));
    const finishBtn = await screen.findByRole("button", { name: "Finish lesson" });
    expect(screen.queryByText("Next ->")).not.toBeInTheDocument(); // never the old silent-no-op label
    expect(onLessonStepComplete).toHaveBeenCalledWith("m01", "m01-l1", "m01-l1-s4");

    fireEvent.click(finishBtn);
    expect(onNavigate).toHaveBeenCalledWith({ view: "module", moduleId: "m01" });
  });

  it("the persistent step-nav ALSO shows 'Finish lesson' (never a plain 'Next ->') when landing on an already-complete last step, and it routes to the module screen", async () => {
    const onNavigate = vi.fn();
    renderReal("m01-l1", "m01-l1-s4", {
      onNavigate,
      completedNodes: [completedNode("m01-l1-s4", "predictOutput")],
    });
    const finishBtn = await screen.findByRole("button", { name: "Finish lesson" });
    expect(screen.queryByRole("button", { name: "Next ->" })).not.toBeInTheDocument();
    fireEvent.click(finishBtn);
    expect(onNavigate).toHaveBeenCalledWith({ view: "module", moduleId: "m01" });
  });
});

// G17: strand carries verbatim on emission (P8), and re-passing an already-complete step is
// deduped by nodeId (no double-count). This exercises the REAL App composition root (not just
// LearnScreen in isolation) because the strand stamp and the dedupe both live in App.tsx's
// handleLessonStepComplete/recordCompletion, which this round deliberately left untouched: proving
// LearnScreen's new graders feed that existing, trusted wiring correctly is the point of this test.
describe("G17: strand carried verbatim on emission, dedupe on re-pass (App-level)", () => {
  it("a genuine predictOutput pass persists a CompletedNode with strand copied verbatim from Step.strand; pressing Check again on the same (already-correct, still-persisted) answer does not double the log", async () => {
    const testStore = makeInMemoryStore();

    render(<App store={testStore} />);
    fireEvent.click(screen.getByText("Sounds good, let's go"));
    await waitFor(() => expect(screen.getByText(/Python runtime is warm/)).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getByText("Hello, Python")); // m01 module card (real content title)
    fireEvent.click(await screen.findByText("Your First Line")); // m01-l1 (real content title)

    // Bug 1 fix: a never-started lesson now opens at step 0 (the teaching), not at the first
    // exercise. m01-l1's step 4 (m01-l1-s4, predictOutput, strand "core") is the only completion-
    // emitting step; steps 1 to 3 are prose/liveExample/prose. Walk them with the persistent
    // step-nav Next control (bug 2) exactly the way a real learner would.
    await screen.findByText(/Welcome in\./);
    fireEvent.click(screen.getByRole("button", { name: "Next ->" })); // s1 prose -> s2 liveExample
    fireEvent.click(screen.getByRole("button", { name: "Next ->" })); // s2 liveExample -> s3 prose
    fireEvent.click(screen.getByRole("button", { name: "Next ->" })); // s3 prose -> s4 predictOutput
    const field = await screen.findByLabelText("Your prediction");
    fireEvent.input(field, { target: { value: "Snake ToolBox is booting up" } });
    const checkBtn = screen.getByRole("button", { name: /Check/ });
    fireEvent.click(checkBtn);
    await waitFor(() => expect(screen.getByText(/Nice\. Step cleared\./)).toBeInTheDocument());

    type Node = { nodeId: string; strand?: string };
    await waitFor(async () => {
      const nodes = await testStore.get<Node[]>("progress", "completedNodes");
      expect(nodes?.some((n) => n.nodeId === "m01-l1-s4")).toBe(true);
    });
    let nodes = (await testStore.get<Node[]>("progress", "completedNodes"))!;
    const node = nodes.find((n) => n.nodeId === "m01-l1-s4")!;
    expect(node.strand).toBe("core"); // P8: verbatim from Step.strand, never dropped

    // Re-pass: the typed prediction persists (G14), Check is still enabled; press it again.
    fireEvent.click(checkBtn);
    await new Promise((resolve) => setTimeout(resolve, 30));
    nodes = (await testStore.get<Node[]>("progress", "completedNodes"))!;
    const matches = nodes.filter((n) => n.nodeId === "m01-l1-s4");
    expect(matches).toHaveLength(1); // CONTRACT 5: deduped by nodeId, never a double-count
  });
});

// Manager fix round, item 2: the liveExample prompt (the teaching sentence) never rendered, only
// its code block and Run button did.
describe("liveExample prompt renders (Manager fix round, item 2)", () => {
  it("m01-l1-s2's liveExample prompt is visible alongside its code block, not just the code", async () => {
    renderReal("m01-l1", "m01-l1-s2");
    expect(await screen.findByText("Hit Run. Watch the console show your words.")).toBeInTheDocument();
    expect(screen.getByText('print("Hello, world.")')).toBeInTheDocument(); // the code block, unaffected
  });

  it("m01-l2-s2's liveExample prompt also renders (a second real step, not a one-off)", async () => {
    renderReal("m01-l2", "m01-l2-s2");
    expect(await screen.findByText(/The first line starts with #, which makes it a comment/)).toBeInTheDocument();
  });
});

// Manager fix round, item 5: onTryItRun used to be a hardcoded `async () => "hey"` stub (a literal
// leftover), so a liveExample's "try it" Run silently returned that string instead of executing
// anything. This proves the WIRING reaches the real worker client with the right shape (isolated
// graded namespace, per the Manager's own brief, never the persistent scratch one); the mock
// worker here is a scripted stand-in, not real Python, so the actual EXECUTION correctness (real
// stdout for real code, including the one real input()-calling liveExample) is proven live against
// real Pyodide in e2e/check-input-deadlock.spec.ts, the same split this suite already uses
// elsewhere (e.g. the CONTRACT-1 "check" message-shape test above).
describe("liveExample \"try it\" reaches the real worker client (Manager fix round, item 5)", () => {
  it("clicking Run sends a real 'run' message (graded/isolated namespace, the step's own code) and the response reaches the box, never the 'hey' stub", async () => {
    const { worker } = renderReal("m01-l1", "m01-l1-s2");
    const sent: unknown[] = [];
    const originalSend = worker.send.bind(worker);
    worker.send = (msg) => { sent.push(msg); originalSend(msg); };

    // Scoped to the try-it card: the work pane ALSO renders its own (separate, empty-starterCode)
    // Run button for a liveExample step (route "none" shows the editor bezel unconditionally, a
    // pre-existing characteristic, not something this round changes), so an unscoped query is
    // ambiguous between the two real buttons.
    const runBtn = document.querySelector(".pane.teacher .card")!.querySelector("button.btn-primary") as HTMLButtonElement;
    fireEvent.click(runBtn);

    await waitFor(() => expect(sent.some((m) => (m as { t: string }).t === "run")).toBe(true));
    const runMsg = sent.find((m) => (m as { t: string }).t === "run") as { namespace: string; code: string };
    expect(runMsg.namespace).toBe("graded"); // isolated, never the persistent scratch namespace
    expect(runMsg.code).toBe('print("Hello, world.")'); // the liveExample's OWN code, not the editor's

    // The mock worker (a scripted stand-in, not real Python) always echoes "3.5\n" for code that
    // does not match one of its special markers; the point here is that SOME real response from
    // the worker reaches the box, never the literal stub string "hey".
    await waitFor(() => expect(screen.getByText("3.5")).toBeInTheDocument());
    expect(screen.queryByText("hey")).not.toBeInTheDocument();
  });

  it("Run is disabled while a try-it run is in flight (honest running state), never queuing a second overlapping run", async () => {
    renderReal("m01-l1", "m01-l1-s2", { worker: createMockWorkerClient({ delayMs: 30 }) });
    const runBtn = document.querySelector(".pane.teacher .card")!.querySelector("button.btn-primary") as HTMLButtonElement;
    fireEvent.click(runBtn);
    expect(runBtn).toBeDisabled();
    expect(runBtn.textContent).toMatch(/Running/);
    await waitFor(() => expect(runBtn).not.toBeDisabled());
  });
});

// Manager fix round, item 1: the portrait-segmented layout used to leak the scratch REPL's label
// ("SCRATCH REPL...") while its editor/Run/output were genuinely unreachable (a native <details>
// closed by default, with zero visible disclosure affordance, entirely outside the lesson/code/
// output segment system). jsdom stubs matchMedia to always report `matches: false` (tests/setup.ts),
// so the REAL auto-detection this round added (LearnScreen.tsx's detectNarrowViewport, a genuine
// viewport check) cannot be exercised here; that half is proven live instead, against a real iPad
// Pro 11 device profile, in e2e/portrait-viewport.spec.ts. This suite drives the SAME manual
// override checkbox the component has always exposed, to prove the segment-reachability logic
// itself: every surface a step offers must be reachable via ITS OWN segment tab, and nothing is
// ever visible-labeled-but-hidden.
describe("portrait segmentation: every surface reachable via its own segment (Manager fix round, item 1)", () => {
  function enablePortrait() {
    fireEvent.click(screen.getByRole("checkbox", { name: /portrait/i }));
  }

  it("in portrait, the 4 segment tabs (Lesson, Code, Output, Scratch) all exist, defaulting to Lesson", async () => {
    renderReal("m01-l4", "m01-l4-s5"); // fixBug: hiddenTest route, has a real graded editor
    await screen.findByLabelText("Graded lesson code editor");
    enablePortrait();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Lesson", "Code", "Output", "Scratch"]);
    expect(screen.getByRole("tab", { name: "Lesson" })).toHaveAttribute("aria-selected", "true");
  });

  it("Lesson segment: the teaching pane is reachable; the graded editor and scratch editor are NOT in the DOM at all (never label-visible-but-control-hidden)", async () => {
    renderReal("m01-l4", "m01-l4-s5");
    await screen.findByLabelText("Graded lesson code editor");
    enablePortrait();
    // Still in the Lesson segment (the default): the step's real prompt/instructions are visible...
    expect(screen.getByText(/This box, total\(\), wants to add 10/)).toBeInTheDocument();
    // ...and neither editor exists in the DOM (not merely hidden) while a different segment is
    // showing, since LearnScreen.tsx gates the whole work pane AND the scratch pane on `segment`.
    expect(screen.queryByLabelText("Graded lesson code editor")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scratch REPL editor")).not.toBeInTheDocument();
  });

  it("Code segment: the graded editor becomes reachable and genuinely visible; Lesson and Scratch content are absent", async () => {
    renderReal("m01-l4", "m01-l4-s5");
    await screen.findByLabelText("Graded lesson code editor");
    enablePortrait();
    fireEvent.click(screen.getByRole("tab", { name: "Code" }));
    const gradedEditor = await screen.findByLabelText("Graded lesson code editor");
    expect(gradedEditor).toBeVisible();
    expect(screen.queryByLabelText("Scratch REPL editor")).not.toBeInTheDocument();
  });

  it("Output segment: Check/Run controls and the output stream are reachable", async () => {
    renderReal("m01-l4", "m01-l4-s5");
    await screen.findByLabelText("Graded lesson code editor");
    enablePortrait();
    fireEvent.click(screen.getByRole("tab", { name: "Output" }));
    const checkBtn = await screen.findByRole("button", { name: /^Check$/i });
    expect(checkBtn).toBeVisible();
    expect(screen.queryByLabelText("Graded lesson code editor")).not.toBeInTheDocument();
  });

  it("Scratch segment: THE REGRESSION NET. The scratch REPL editor and Run scratch are genuinely reachable and visible, not just present-but-hidden behind a closed <details>", async () => {
    renderReal("m01-l4", "m01-l4-s5");
    await screen.findByLabelText("Graded lesson code editor");
    enablePortrait();
    fireEvent.click(screen.getByRole("tab", { name: "Scratch" }));
    const scratchEditor = await screen.findByLabelText("Scratch REPL editor");
    expect(scratchEditor).toBeVisible();
    expect(screen.getByRole("button", { name: "Run scratch" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Restart" })).toBeVisible();
    // Genuinely a DIFFERENT segment from the graded editor's: switching here removed it entirely.
    expect(screen.queryByLabelText("Graded lesson code editor")).not.toBeInTheDocument();
  });

  it("landscape (portrait OFF): the scratch REPL is expanded by default, not collapsed behind a closed <details> with no visible affordance", async () => {
    renderReal("m01-l1"); // portrait defaults false; no toggle click
    const scratchEditor = await screen.findByLabelText("Scratch REPL editor");
    expect(scratchEditor).toBeVisible();
    // A real, accessible toggle exists (not a bare <summary>), defaulting open (aria-expanded=true).
    expect(screen.getByRole("button", { name: /scratch REPL/i })).toHaveAttribute("aria-expanded", "true");
  });
});
