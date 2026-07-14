// LearnScreen: the Learn surface with the R1 to R10 router.
// Three views: map (curriculum overview), module (lesson list + boss doorway), lesson (the player).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { WorkerClient } from "../workerClient";
import type { CurriculumBundle, CompletedNode, HiddenTest, Lesson, Module, TestOutcome } from "../contracts";
import { COMPLETION_EMITTING_KINDS } from "../contracts";
import { CodeEditor, type CodeEditorHandle } from "../components/CodeEditor";
import { KeyRow } from "../components/KeyRow";
import { RunBar } from "../components/RunBar";
import { OutputStream, bytesToDataUrl, type ActiveInputRequest, type OutputItem } from "../components/OutputStream";
import { CheckResult } from "../components/CheckResult";
import { LessonPane } from "../components/LessonPane";
import { PredictionField } from "../components/PredictionField";
import { DegradedBootBanner } from "../components/DegradedBootBanner";
import { RestartConfirmDialog } from "../components/RestartConfirmDialog";
import { StepNav } from "../components/StepNav";
import {
  type AnswerState,
  type LocalGradeResult,
  type GraderRoute,
  graderRouteFor,
  initialAnswerFor,
  isAnswerEmpty,
  gradeAnswerForStep,
  EMPTY_NUDGE,
} from "../lib/gradeAnswer";

// Router types (R1)
type LearnView =
  | { view: "map" }
  | { view: "module"; moduleId: string }
  | { view: "lesson"; lessonId: string; focusStepId?: string };

export interface LearnScreenProps {
  bundle: CurriculumBundle;
  worker: WorkerClient;
  inputCapable: boolean;
  learnView: LearnView;
  lessonIndex: Map<string, { module: Module; lesson: Lesson; lessonOrder: number }>;
  completedNodes: CompletedNode[];
  onNavigate: (view: LearnView) => void;
  onOpenInSandbox?: (code: string) => void;
  onLessonStepComplete?: (moduleId: string, lessonId: string, stepId: string) => void;
  onEnterBoss?: (moduleId: string) => void;
  // G5: gates the predictOutput/traceTable "Run it and see" reveal. Defaults true (matches every
  // existing test/call site, which never modeled worker-boot readiness); the real composition root
  // (App.tsx) passes the actual Pyodide-boot state.
  workerReady?: boolean;
}

// R3: completion predicates
function isStepComplete(stepId: string, nodes: CompletedNode[]): boolean {
  return nodes.some(n => n.nodeId === stepId);
}

function isLessonComplete(lesson: Lesson, nodes: CompletedNode[]): boolean {
  const emitting = lesson.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind));
  if (emitting.length === 0) return false;
  return emitting.every(s => nodes.some(n => n.nodeId === s.id));
}

function isModuleComplete(mod: Module, nodes: CompletedNode[]): boolean {
  return nodes.some(n => n.kind === "module" && n.moduleId === mod.id);
}

let runIdSeq = 0;
function nextRunId(): string { runIdSeq += 1; return `run-${runIdSeq}`; }

// Manager fix round (item 1, portrait diagnosis): `portrait` used to be `useState(false)`, a
// checkbox-only dev toggle with ZERO connection to the real viewport. On Niko's actual iPad (the
// app's PRIMARY device), that meant the portrait-segmented layout NEVER activated in real use: the
// full landscape two-pane layout always rendered, squeezed into an 834px-wide viewport.
//
// 900px, NOT AppShell's own existing 820px breakpoint (components.css, rail -> bottom-tabs). They
// look like the same "narrow viewport" concept, but measuring against the real device caught a
// second, separate latent bug: an iPad Pro 11 in portrait is 834 CSS px wide, which is WIDER than
// 820, so AppShell's own rail-vs-bottom-tabs media query does not fire on Niko's primary device
// either. Reusing 820 here would have silently inherited that same miss for this screen's
// segmentation, the exact "looked fixed, still broken on the real device" trap this whole item is
// about. 900 safely covers iPad Pro 11 portrait (834) and every smaller iPad, stays well below
// iPad Pro 12.9 portrait (1024) and any landscape/desktop width, and is scoped to JUST this
// screen's own layout decision; it deliberately does not touch AppShell's separate breakpoint,
// which is a different component with its own blast radius, out of scope for this round (flagged
// in the report for a follow-up, not fixed here). The checkbox stays as a manual override for
// testing/preference (unchanged behavior once toggled, until the next real breakpoint-crossing
// resize).
function detectNarrowViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 900px)").matches;
}

export function LearnScreen({
  bundle, worker, inputCapable, learnView, lessonIndex, completedNodes,
  onNavigate, onOpenInSandbox, onLessonStepComplete, onEnterBoss, workerReady = true
}: LearnScreenProps) {

  // === MAP VIEW (R2) ===
  if (learnView.view === "map") {
    return (
      <div style={{ padding: "18px", overflow: "auto" }}>
        <h1 class="pixel-title" style={{ marginBottom: "18px" }}>Your path</h1>
        {bundle.phases.map(phase => {
          const mods = phase.moduleIds
            .map(id => bundle.modules.find(m => m.id === id))
            .filter((m): m is Module => !!m);
          return (
            <section key={phase.id} style={{ marginBottom: "28px" }}>
              <h2 class="dim-label" style={{ fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>
                {phase.name} {phase.milestone && <span class="chip" style={{ marginLeft: "8px" }}>{phase.milestone}</span>}
              </h2>
              {mods.length === 0 && (
                <p class="serif" style={{ color: "var(--dim)", fontStyle: "italic" }}>This chapter is still being written.</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {mods.map((mod, i) => {
                  const done = isModuleComplete(mod, completedNodes);
                  // R3: modules unlock in Phase.moduleIds order
                  const priorDone = i === 0 || isModuleComplete(mods[i - 1]!, completedNodes);
                  const isCurrent = priorDone && !done;
                  const isLocked = !priorDone && !done;
                  const status = done ? "done" : isCurrent ? "current" : isLocked ? "locked" : "ahead";
                  const accentClass = done ? "acc-m" : isCurrent ? "acc" : "acc-dim";
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      class={`card nav-card ${accentClass}`}
                      style={{ textAlign: "left", padding: "14px 16px", border: "1px solid var(--line)", cursor: isLocked ? "default" : "pointer", opacity: isLocked ? 0.55 : 1 }}
                      onClick={() => !isLocked && onNavigate({ view: "module", moduleId: mod.id })}
                      aria-label={`${mod.title}, ${status}${isLocked && i > 0 ? `. Opens after you clear ${mods[i - 1]!.title}` : ""}`}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span class="visually-hidden">{status}</span>
                        <span aria-hidden="true" style={{ fontSize: "14px" }}>
                          {done ? "✓" : isCurrent ? "▶" : isLocked ? "🔒" : "○"}
                        </span>
                        <span class="dim-label" style={{ fontSize: "11px", textTransform: "uppercase" }}>{status}</span>
                      </div>
                      <h3 style={{ margin: "4px 0 2px", fontSize: "16px" }}>{mod.title}</h3>
                      <span class="dim-label" style={{ fontSize: "13px" }}>
                        {mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}
                        {mod.boss && " + boss"}
                      </span>
                      {isCurrent && i === 0 && completedNodes.length === 0 && (
                        <span class="chip" style={{ marginLeft: "8px", background: "var(--pink)", color: "var(--ground)" }}>Start here</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // === MODULE VIEW (R1) ===
  if (learnView.view === "module") {
    const mod = bundle.modules.find(m => m.id === learnView.moduleId);
    if (!mod) return <div>Module not found</div>;
    const modComplete = isModuleComplete(mod, completedNodes);
    return (
      <div style={{ padding: "18px", overflow: "auto" }}>
        <button type="button" class="btn btn-ghost btn-small" onClick={() => onNavigate({ view: "map" })} style={{ marginBottom: "12px" }}>
          Back to the map
        </button>
        <h2 style={{ marginBottom: "4px" }}>{mod.title}</h2>
        <div class="dim-label" style={{ marginBottom: "18px" }}>{mod.lessons.length} lesson{mod.lessons.length !== 1 ? "s" : ""}{mod.boss && " + boss"}</div>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          {mod.lessons.map((lesson, i) => {
            const done = isLessonComplete(lesson, completedNodes);
            // R3: lessons unlock in order
            const priorDone = i === 0 || isLessonComplete(mod.lessons[i - 1]!, completedNodes);
            const isCurrent = priorDone && !done;
            const isLocked = !priorDone && !done;
            const status = done ? "done" : isCurrent ? "current" : isLocked ? "locked" : "ahead";
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  class="btn btn-ghost"
                  style={{ width: "100%", textAlign: "left", opacity: isLocked ? 0.55 : 1, padding: "10px 14px" }}
                  disabled={isLocked}
                  onClick={() => onNavigate({ view: "lesson", lessonId: lesson.id })}
                  aria-label={`${lesson.title}, ${status}`}
                >
                  <span aria-hidden="true" style={{ marginRight: "8px" }}>
                    {done ? "✓" : isCurrent ? "▶" : "○"}
                  </span>
                  {lesson.title}
                  <span class="visually-hidden">, {status}</span>
                </button>
              </li>
            );
          })}
          {mod.boss && (
            <li>
              <button
                type="button"
                class="btn btn-ghost"
                style={{ width: "100%", textAlign: "left", padding: "10px 14px", borderColor: "var(--pink)" }}
                disabled={!mod.lessons.every(l => isLessonComplete(l, completedNodes) || l.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind)).length === 0)}
                onClick={() => onEnterBoss?.(mod.id)}
              >
                Boss: {mod.boss.name}
              </button>
            </li>
          )}
        </ul>
      </div>
    );
  }

  // === LESSON VIEW (the existing player, R1) ===
  const entry = lessonIndex.get(learnView.lessonId);
  if (!entry) return <div style={{ padding: "18px" }}>Lesson not found. <button type="button" class="btn btn-ghost btn-small" onClick={() => onNavigate({ view: "map" })}>Back to the map</button></div>;

  const { module: currentModule, lesson: currentLesson } = entry;

  return (
    <LessonPlayer
      module={currentModule}
      lesson={currentLesson}
      worker={worker}
      inputCapable={inputCapable}
      onNavigate={onNavigate}
      onOpenInSandbox={onOpenInSandbox}
      onLessonStepComplete={onLessonStepComplete}
      onEnterBoss={onEnterBoss}
      completedNodes={completedNodes}
      focusStepId={learnView.focusStepId}
      workerReady={workerReady}
    />
  );
}

// The lesson player (extracted from the old LearnScreen, accepts a specific lesson)
interface LessonPlayerProps {
  module: Module;
  lesson: Lesson;
  worker: WorkerClient;
  inputCapable: boolean;
  onNavigate: (view: LearnView) => void;
  onOpenInSandbox?: (code: string) => void;
  onLessonStepComplete?: (moduleId: string, lessonId: string, stepId: string) => void;
  onEnterBoss?: (moduleId: string) => void;
  completedNodes: CompletedNode[];
  focusStepId?: string;
  workerReady: boolean;
}

function LessonPlayer({
  module: mod, lesson, worker, inputCapable,
  onNavigate, onOpenInSandbox, onLessonStepComplete, onEnterBoss,
  completedNodes, focusStepId, workerReady
}: LessonPlayerProps) {
  // Manager fix round, bug 1 (never-started lessons opened past the teaching): focusStepId
  // deep-links keep top priority, unchanged. Otherwise, the OLD rule ("first incomplete emitting
  // step") landed a totally fresh lesson on its first EXERCISE, since prose/liveExample never emit
  // and so are never "complete" either, every emitting step reads as "incomplete" on a fresh
  // lesson, and the first one of those wins. The fix separates the two real cases: a lesson with
  // ZERO completed emitting steps has never been started, so it opens at step 0, teaching first. A
  // lesson with SOME progress resumes right after the LAST completed emitting step (clamped to the
  // final step), so a returning learner re-enters exactly where they left off instead of
  // re-reading everything from the top.
  const initialStep = useMemo(() => {
    if (focusStepId) {
      const idx = lesson.steps.findIndex(s => s.id === focusStepId);
      if (idx >= 0) return idx;
    }
    let lastCompletedEmittingIdx = -1;
    for (let i = 0; i < lesson.steps.length; i++) {
      const s = lesson.steps[i]!;
      if (COMPLETION_EMITTING_KINDS.has(s.kind) && completedNodes.some(n => n.nodeId === s.id)) {
        lastCompletedEmittingIdx = i;
      }
    }
    if (lastCompletedEmittingIdx === -1) return 0; // never started: zero completed emitting steps
    return Math.min(lastCompletedEmittingIdx + 1, lesson.steps.length - 1);
  }, [lesson, focusStepId, completedNodes]);

  const [stepIndex, setStepIndex] = useState(initialStep);
  const step = lesson.steps[stepIndex]!;
  // G0: the ONE router. writeStub/fixBug/boss -> "hiddenTest" (worker path, unchanged). The five
  // answer-compared kinds -> their own main-thread grader. Anything else -> "none" (G13 defensive
  // clause: never auto-pass a step that matches no grader).
  const route: GraderRoute = graderRouteFor(step);

  const [portrait, setPortrait] = useState(detectNarrowViewport);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 900px)");
    const onChange = () => setPortrait(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  // Manager fix round (item 1): "scratch" joins lesson/code/output as its OWN segment, so the
  // scratch REPL + Run scratch is reachable via the same tab control as everything else, instead of
  // sitting outside the segmented layout entirely (the old shape: always-rendered, unconditioned on
  // `segment`, and collapsed by default behind a native <details> with no visible-affordance
  // disclosure control, see the scratch-pane block below for the full trace).
  const [segment, setSegment] = useState<"lesson" | "code" | "output" | "scratch">("lesson");
  const [scratchOpen, setScratchOpen] = useState(true); // landscape-only collapse toggle, default OPEN
  const [code, setCode] = useState(step?.starterCode ?? "");
  const [scratchCode, setScratchCode] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<OutputItem[]>([]);
  const [scratchItems, setScratchItems] = useState<OutputItem[]>([]);
  const [activeInput, setActiveInput] = useState<ActiveInputRequest | null>(null);
  const [checkOutcome, setCheckOutcome] = useState<{ passed: boolean; results: TestOutcome[] } | null>(null);
  const [restartScratchOpen, setRestartScratchOpen] = useState(false);

  // grading-interaction-spec answer-capture + local-grade state (G6/G8/G10, G16). UI-local
  // ephemeral state only, stored nowhere (G19), reset on every step change below.
  const [answer, setAnswer] = useState<AnswerState>(() => initialAnswerFor(step));
  const [missCount, setMissCount] = useState(0);          // completed misses on THIS step (G16 ladder)
  const [attemptsMade, setAttemptsMade] = useState(0);     // total Check presses on this step (G5 gate)
  const [localGrade, setLocalGrade] = useState<LocalGradeResult | null>(null);
  const [hasRunReveal, setHasRunReveal] = useState(false); // G5/G16: has "Run it and see" been used
  const [emptyNudge, setEmptyNudge] = useState<string | null>(null); // G13 calm inline nudge

  const gradedRunId = useRef<string | null>(null);
  const scratchRunId = useRef<string | null>(null);
  const editorHandle = useRef<CodeEditorHandle>(null);
  const scratchHandle = useRef<CodeEditorHandle>(null);
  // Manager fix round (item 5): the liveExample "try it" box's real run. tryItRunId is a SEPARATE
  // marker from gradedRunId's own identity check below (it is set to the SAME value as
  // gradedRunId.current for the run's duration, see runTryIt), used only so the subscribe effect
  // knows to ALSO buffer text for the box's own Promise<string> return, without changing any of
  // the existing gradedRunId-keyed branches at all.
  const tryItRunId = useRef<string | null>(null);
  const tryItBuffer = useRef("");
  const tryItResolve = useRef<((out: string) => void) | null>(null);

  useEffect(() => {
    setCode(step?.starterCode ?? "");
    setCheckOutcome(null);
    setItems([]);
    setAnswer(initialAnswerFor(step));
    setMissCount(0);
    setAttemptsMade(0);
    setLocalGrade(null);
    setHasRunReveal(false);
    setEmptyNudge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, lesson.id]);

  function updateAnswer(next: AnswerState) {
    setAnswer(next);
    setEmptyNudge(null);
  }

  useEffect(() => {
    const unsubscribe = worker.subscribe((msg) => {
      if (msg.t === "stdout" && msg.runId === gradedRunId.current) {
        setItems(prev => [...prev, { kind: "stdout", id: `${msg.runId}-${prev.length}`, text: msg.text }]);
      } else if (msg.t === "stdout" && msg.runId === scratchRunId.current) {
        setScratchItems(prev => [...prev, { kind: "stdout", id: `${msg.runId}-${prev.length}`, text: msg.text }]);
      } else if (msg.t === "error" && msg.runId === gradedRunId.current) {
        setItems(prev => [...prev, { kind: "error", id: `${msg.runId}-err`, message: msg.message, traceback: msg.traceback }]);
      } else if (msg.t === "error" && msg.runId === scratchRunId.current) {
        setScratchItems(prev => [...prev, { kind: "error", id: `${msg.runId}-err`, message: msg.message, traceback: msg.traceback }]);
      } else if (msg.t === "figure" && msg.runId === gradedRunId.current) {
        setItems(prev => [...prev, { kind: "figure", id: `${msg.runId}-fig`, alt: msg.alt, dataUrl: bytesToDataUrl(msg.png) }]);
      } else if (msg.t === "inputRequest" && (msg.runId === gradedRunId.current || msg.runId === scratchRunId.current)) {
        setActiveInput({ runId: msg.runId, prompt: msg.prompt });
        // Manager fix round (item 5): a liveExample's tryIt run (real Python now, was a "hey"
        // stub) can call input() (m01-l4-s3 does). In portrait the interactive prompt line lives
        // in the work pane's Output segment, not the Lesson segment the tryIt box is clicked from;
        // without this, a learner who clicked Run from Lesson would see nothing happen and have to
        // guess to switch tabs. runDone already does this same auto-switch below; doing it here
        // too (on the FIRST sign the run needs the learner) means it never even looks stuck.
        if (portrait && msg.runId === gradedRunId.current) setSegment("output");
      } else if (msg.t === "checkResult" && msg.runId === gradedRunId.current) {
        setCheckOutcome({ passed: msg.passed, results: msg.results });
        if (msg.passed) {
          onLessonStepComplete?.(mod.id, lesson.id, step.id);
        }
      } else if (msg.t === "runDone") {
        if (msg.runId === gradedRunId.current || msg.runId === scratchRunId.current) {
          setRunning(false);
          // item 5: a tryIt run's recap already shows INLINE in LessonPane's own "try it" box, in
          // the Lesson segment the learner is already looking at; auto-switching to Output here
          // would yank them away from the very teaching pane they just interacted with, for exactly
          // the runs that most want to stay put. Real graded Run/Check/"Run it and see" keep the
          // existing auto-switch unchanged (their output only ever appears in the Output segment).
          // The EARLIER inputRequest branch above still switches for a tryIt run that genuinely
          // needs the learner's input (this box has no input field of its own to give it).
          if (portrait && msg.runId !== tryItRunId.current) setSegment("output");
        }
      } else if (msg.t === "resetDone" && msg.namespace === "scratch" && msg.ok) {
        setScratchItems([]);
      }

      // Manager fix round (item 5): an ADDITIVE side channel, not part of the if/else-if chain
      // above (that chain already correctly routes this SAME run's stdout/error/figure/inputRequest
      // into `items` and the work pane's OutputStream, since runTryIt below sets gradedRunId.current
      // to the tryIt run's id). This just ALSO buffers plain text so LessonPane's small inline box
      // gets its own quick recap via the Promise<string> runTryIt returns, without a second,
      // separate, untested run/subscribe/input-handling path of its own.
      if ("runId" in msg && msg.runId === tryItRunId.current) {
        if (msg.t === "stdout") {
          tryItBuffer.current += msg.text;
        } else if (msg.t === "error") {
          tryItBuffer.current += (tryItBuffer.current ? "\n" : "") + msg.message;
        } else if (msg.t === "runDone") {
          const out = tryItBuffer.current.trim();
          tryItRunId.current = null;
          tryItResolve.current?.(out.length > 0 ? out : "(no output)");
          tryItResolve.current = null;
        }
      }
    });
    return unsubscribe;
  }, [worker, portrait, mod.id, lesson.id, step?.id, onLessonStepComplete]);

  // Manager fix round (item 5): was `async () => "hey"`, a literal leftover stub, so every
  // liveExample's "try it" Run silently returned the string "hey" instead of executing anything.
  // Reuses the SAME graded-namespace run plumbing runGraded/runReveal already use (isolated per
  // run, F9; never the persistent scratch namespace, per the Manager's brief) rather than a
  // bespoke path, so stdout/error/figure/inputRequest/runDone are all handled by the ALREADY
  // correct, already-tested branches above; this function only adds the small buffering side
  // channel wired in the subscribe effect to turn that into the single Promise<string> LessonPane's
  // inline box expects.
  async function runTryIt(tryCode: string): Promise<string> {
    if (!workerReady) {
      return "Python is still starting up. Wait a moment, then try Run again.";
    }
    const runId = nextRunId();
    gradedRunId.current = runId;
    tryItRunId.current = runId;
    tryItBuffer.current = "";
    setRunning(true);
    setCheckOutcome(null);
    setItems([]);
    return new Promise<string>((resolve) => {
      tryItResolve.current = resolve;
      worker.send({ t: "run", runId, code: tryCode, mountFiles: [], namespace: "graded" });
    });
  }

  function runGraded() {
    const runId = nextRunId();
    gradedRunId.current = runId;
    setRunning(true);
    setCheckOutcome(null);
    worker.send({ t: "run", runId, code, mountFiles: [], namespace: "graded" });
  }
  function stopGraded() { if (gradedRunId.current) worker.send({ t: "stop", runId: gradedRunId.current }); }

  // G0: checkGraded routes by Step.kind. writeStub/fixBug/boss keep the exact hidden-test path this
  // function always used (worker-run, UNCHANGED). The five answer-compared kinds grade MAIN-THREAD
  // and INSTANT (no worker round-trip): the empty-always-pass fallback that used to send a single
  // empty-code hidden test for these kinds is GONE (that was the hole this round closes).
  function checkGraded() {
    if (route === "hiddenTest") {
      // SF1 (Frederick full-gate should-fix): a hidden-test-route step (writeStub/fixBug/boss)
      // with no real hiddenTests must NEVER fabricate an empty-code test. pyodideEngine.check runs
      // `runPython("")` for an empty test, which never throws, so an empty test always reports
      // "passed: true", a vacuous auto-pass. bundleValidator now rejects this shape for any
      // authored (non-placeholder) module at load time; this is the runtime backstop for the same
      // hole, routed the same honest way route "none" already is.
      if (!step.hiddenTests || step.hiddenTests.length === 0) {
        setEmptyNudge("This step cannot be graded yet.");
        return;
      }
      const runId = nextRunId();
      gradedRunId.current = runId;
      setRunning(true);
      setEmptyNudge(null);
      const hiddenTests: HiddenTest[] = step.hiddenTests;
      worker.send({ t: "check", runId, code, mountFiles: [], hiddenTests });
      return;
    }
    if (route === "none") {
      // G0/G13 defensive clause: a step matching no grader must never auto-pass.
      setEmptyNudge("This step cannot be graded yet.");
      return;
    }
    // G13: empty or partial is an honest "not yet." Never clears, never emits, never fake-passes.
    if (isAnswerEmpty(route, answer)) {
      setEmptyNudge(EMPTY_NUDGE[route] ?? "Answer this one before you check.");
      return;
    }
    setEmptyNudge(null);
    const result = gradeAnswerForStep(route, answer, step, missCount, hasRunReveal);
    setAttemptsMade((n) => n + 1);
    setLocalGrade(result);
    setCheckOutcome({
      passed: result.passed,
      results: [{ id: step.id, passed: result.passed, message: result.message, actual: result.actual, expected: result.expected }],
    });
    if (result.passed) {
      // G17: only a genuinely correct answer emits, through the SAME callback the hidden-test path
      // already uses; App.tsx's handleLessonStepComplete carries strand verbatim (P8) and dedupes
      // by nodeId (CONTRACT 5), so re-passing an already-complete step is a no-op there.
      onLessonStepComplete?.(mod.id, lesson.id, step.id);
    } else {
      setMissCount((n) => n + 1);
    }
  }

  // G5: the OPTIONAL "Run it and see" reveal for predictOutput/traceTable, post-attempt only. Runs
  // the step's OWN authored code (never the learner's typed prediction) so a wrong guess becomes a
  // live discovery. Reuses the graded run id / items plumbing (a plain "run" never emits
  // checkResult, so this can never accidentally trigger completion).
  function runReveal() {
    if (!workerReady) return;
    const runId = nextRunId();
    gradedRunId.current = runId;
    setRunning(true);
    setItems([]);
    setHasRunReveal(true);
    worker.send({ t: "run", runId, code: step.code ?? "", mountFiles: [], namespace: "graded" });
  }
  function runScratch() {
    const runId = nextRunId();
    scratchRunId.current = runId;
    worker.send({ t: "run", runId, code: scratchCode, mountFiles: [], namespace: "scratch" });
  }
  function submitInput(text: string) {
    if (!activeInput) return;
    worker.send({ t: "inputResponse", runId: activeInput.runId, bytes: new TextEncoder().encode(text) });
    setActiveInput(null);
  }

  // Manager fix round, bugs 2/3 (persistent step nav + honest last-step action). isLastStep is
  // purely structural (the final step in lesson.steps), independent of graded/non-graded.
  const isLastStep = stepIndex === lesson.steps.length - 1;
  function goBack() {
    setStepIndex(i => Math.max(i - 1, 0));
  }
  // The SAME handler backs both CheckResult's post-pass Next and StepNav's persistent Next (bug 3):
  // on the last step there is nothing left to advance TO, so this becomes the lesson-complete
  // action and routes back to the module screen (the same destination the top bar's "Back to
  // {mod.title}" already uses), instead of silently clamping to a step index that never moves.
  function goNext() {
    if (isLastStep) {
      onNavigate({ view: "module", moduleId: mod.id });
      return;
    }
    setStepIndex(i => Math.min(i + 1, lesson.steps.length - 1));
  }
  // Bug 2: Next is offered on the persistent StepNav ONLY for a non-graded step (route "none":
  // prose/liveExample/reflection, always free to move past) OR a graded step that is ALREADY
  // complete. "Already complete" is read from completedNodes (the same honest progress log G17
  // writes to), never from local answer/grade state, which is ephemeral and resets on step change
  // (so backing into an already-cleared graded step and moving forward again still works). An
  // un-passed graded step satisfies neither condition, so this can never be used to skip an
  // un-passed Check; that flow keeps gating Next through CheckResult exactly as it does today.
  const canGoNextViaStepNav = route === "none" || isStepComplete(step.id, completedNodes);

  // grading-interaction-spec G6/G8/G10: mcq/fillBlank/parsons capture their answer inside
  // LessonPane's "Your turn" block, so it needs the live answer/grade state. Not memoized (it
  // changes on every keystroke/selection/reorder for those kinds; Preact re-renders are cheap).
  const teacherPane = (
    <LessonPane
      moduleTitle={mod.title}
      lesson={lesson}
      stepIndex={stepIndex}
      onTryItRun={runTryIt}
      onEnterBoss={onEnterBoss ? () => onEnterBoss(mod.id) : undefined}
      answer={answer}
      onAnswerChange={updateAnswer}
      localGrade={localGrade}
      missCount={missCount}
    />
  );

  // G0/G13: where the WORK pane's Check button ends up disabled. "none" (no grader) is always
  // disabled; "hiddenTest" is unchanged (never disabled here); the five comparison kinds disable on
  // an empty answer (preferred over letting a click through and doing nothing, G13).
  const checkDisabled = route === "none" ? true : route === "hiddenTest" ? false : isAnswerEmpty(route, answer);
  const showPredictionField = route === "predictOutput" || route === "traceTable";
  const showEditorBezel = route === "hiddenTest" || route === "none";
  const showRunRevealButton = showPredictionField && attemptsMade >= 1 && workerReady;

  return (
    <div class={portrait ? "learn-screen pmode" : "learn-screen"}>
      <div class="top-bar">
        <button type="button" class="btn btn-ghost btn-small" onClick={() => onNavigate({ view: "module", moduleId: mod.id })} style={{ marginRight: "8px" }}>
          Back to {mod.title}
        </button>
        <span class="chip">step {stepIndex + 1} of {lesson.steps.length}</span>
        <span class="rt-indicator"><span class="runtime-dot warm" aria-hidden="true" /> runtime warm</span>
        <div class="spacer" />
        {portrait && (
          <div class="seg" role="tablist" aria-label="Lesson view">
            {(["lesson", "code", "output", "scratch"] as const).map(s => (
              <button key={s} type="button" role="tab" aria-selected={segment === s} onClick={() => setSegment(s)}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}
        <label style={{ fontSize: "12px", color: "var(--dim)", display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={portrait} onChange={e => setPortrait((e.target as HTMLInputElement).checked)} /> portrait
        </label>
      </div>

      <DegradedBootBanner inputCapable={inputCapable} />

      {/* Bug 2/3: a persistent step-nav bar, mounted once regardless of portrait segment (a prose/
          liveExample/reflection step has no Check flow at all, so without this it had no forward
          navigation whatsoever; on the last step, Next becomes the honest lesson-complete action,
          bug 3). */}
      <StepNav
        canGoBack={stepIndex > 0}
        canGoNext={canGoNextViaStepNav}
        isLastStep={isLastStep}
        onBack={goBack}
        onNext={goNext}
      />

      <div class="player" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {(!portrait || segment === "lesson") && teacherPane}
        {(!portrait || segment === "code" || segment === "output") && (
          <div class="pane work" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {(!portrait || segment === "code") && showEditorBezel && (
              <div class="editor-bezel">
                <div class="editor-head">
                  <span class="fn">lesson.py (graded, runs fresh every time)</span>
                  <span class="studs"><i class="stud" /><i class="stud" /><i class="stud" /></span>
                </div>
                <CodeEditor value={code} onChange={setCode} ariaLabel="Graded lesson code editor" handleRef={editorHandle} />
              </div>
            )}
            {(!portrait || segment === "code") && showPredictionField && (
              <PredictionField
                value={answer.prediction}
                onChange={(v) => updateAnswer({ ...answer, prediction: v })}
              />
            )}
            {(!portrait || segment === "output") && (
              <>
                <RunBar
                  running={running}
                  onRun={runGraded}
                  onStop={stopGraded}
                  onCheck={checkGraded}
                  interruptCapable={inputCapable}
                  hideRun={!showEditorBezel}
                  hideStop={!showEditorBezel}
                  checkDisabled={checkDisabled}
                />
                {route === "none" && (
                  <div class="dim-label" role="status" style={{ padding: "0 12px 10px" }}>This step cannot be graded yet.</div>
                )}
                {emptyNudge && (
                  <div class="dim-label" role="status" style={{ padding: "0 12px 10px" }}>{emptyNudge}</div>
                )}
                {showRunRevealButton && (
                  <div style={{ padding: "0 12px 10px" }}>
                    <button type="button" class="btn btn-ghost btn-small" onClick={runReveal}>Run it and see</button>
                  </div>
                )}
                <OutputStream items={items} activeInputRequest={activeInput} onInputSubmit={submitInput} />
                {/* SF5: CheckResult is ALWAYS mounted (never gated behind `checkOutcome &&`), so
                    its role="status" region is already in the DOM before the content it needs to
                    announce ever changes; see CheckResult.tsx's own comment for why. */}
                <CheckResult
                  outcome={checkOutcome}
                  stepId={step.id}
                  hints={step.hints ?? []}
                  modelSolution={step.modelSolution}
                  yourCode={code}
                  onOpenInSandbox={() => onOpenInSandbox?.(code)}
                  onNext={goNext}
                  isLastStep={isLastStep}
                />
              </>
            )}
          </div>
        )}
      </div>
      {(!portrait || segment === "code") && showEditorBezel && <KeyRow editorRef={editorHandle} />}
      {/* Manager fix round (item 1): this used to be a native <details>/<summary>, unconditioned on
          `segment`, always rendered below the whole player regardless of portrait/landscape. Two
          compounding bugs: (a) <details> is CLOSED by default with no `open` attribute, so its
          editor/Run/output were invisible (not just "less prominent") behind a plain dim-uppercase
          label with zero visible disclosure affordance (no chevron, no button chrome) on a touch
          device, exactly the "label visible, control hidden" shape; (b) in portrait it sat entirely
          OUTSIDE the lesson/code/output segment system, so even a learner who discovered the tap-
          to-expand trick had no indication a 4th surface existed at all. Portrait: its own segment,
          reachable the same way as everything else, always expanded once selected (the segment tab
          IS the disclosure control, a second nested toggle would be redundant). Landscape: a real
          `<button aria-expanded>` toggle, defaulting OPEN (never hidden on first render), so the
          same "no label-visible-but-control-hidden" invariant holds there too. */}
      {(!portrait || segment === "scratch") && (
        <div class="scratch-pane" style={{ margin: portrait ? "0 14px 14px" : "8px 14px" }}>
          {portrait ? (
            <div class="dim-label" style={{ padding: "10px 0 6px" }}>scratch REPL (persistent, never touches grading)</div>
          ) : (
            // Button text deliberately avoids the word "Check": a getByRole("button", { name:
            // /Check/ }) query used throughout the suite for the REAL Check button would otherwise
            // ambiguously match this toggle too, the moment it became a real queryable button
            // instead of a <summary> (jsdom's role computation never exposed <summary> as
            // role="button" in the first place, which is part of why the old shape hid this from
            // every existing test).
            <button
              type="button"
              class="scratch-toggle dim-label"
              aria-expanded={scratchOpen}
              aria-controls="scratch-repl-body"
              onClick={() => setScratchOpen(o => !o)}
            >
              <span aria-hidden="true">{scratchOpen ? "▾" : "▸"}</span>{" "}
              scratch REPL (persistent, never touches grading)
            </button>
          )}
          {(portrait || scratchOpen) && (
            <div id="scratch-repl-body">
              <div class="editor-bezel" style={{ height: "140px" }}>
                <CodeEditor value={scratchCode} onChange={setScratchCode} ariaLabel="Scratch REPL editor" handleRef={scratchHandle} />
              </div>
              <div class="run-bar">
                <button type="button" class="btn btn-small" onClick={runScratch}>Run scratch</button>
                <button type="button" class="btn btn-ghost btn-small" onClick={() => setRestartScratchOpen(true)}>Restart</button>
              </div>
              <OutputStream items={scratchItems} emptyHint="the scratch REPL keeps its own names between runs" />
            </div>
          )}
        </div>
      )}
      <RestartConfirmDialog
        open={restartScratchOpen}
        onCancel={() => setRestartScratchOpen(false)}
        onConfirm={() => { setRestartScratchOpen(false); worker.send({ t: "resetSession", namespace: "scratch" }); }}
        bodyText="Your lesson progress is safe. This just resets the scratch REPL's live variables."
      />
    </div>
  );
}
