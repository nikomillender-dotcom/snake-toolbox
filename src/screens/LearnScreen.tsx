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
import { DegradedBootBanner } from "../components/DegradedBootBanner";
import { RestartConfirmDialog } from "../components/RestartConfirmDialog";

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

export function LearnScreen({
  bundle, worker, inputCapable, learnView, lessonIndex, completedNodes,
  onNavigate, onOpenInSandbox, onLessonStepComplete, onEnterBoss
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
}

function LessonPlayer({
  module: mod, lesson, worker, inputCapable,
  onNavigate, onOpenInSandbox, onLessonStepComplete, onEnterBoss,
  completedNodes, focusStepId
}: LessonPlayerProps) {
  // Start at the focusStepId if provided, else first incomplete step
  const initialStep = useMemo(() => {
    if (focusStepId) {
      const idx = lesson.steps.findIndex(s => s.id === focusStepId);
      if (idx >= 0) return idx;
    }
    // First incomplete emitting step
    for (let i = 0; i < lesson.steps.length; i++) {
      const s = lesson.steps[i]!;
      if (COMPLETION_EMITTING_KINDS.has(s.kind) && !completedNodes.some(n => n.nodeId === s.id)) return i;
    }
    return 0;
  }, [lesson, focusStepId, completedNodes]);

  const [stepIndex, setStepIndex] = useState(initialStep);
  const step = lesson.steps[stepIndex]!;

  const [portrait, setPortrait] = useState(false);
  const [segment, setSegment] = useState<"lesson" | "code" | "output">("lesson");
  const [code, setCode] = useState(step?.starterCode ?? "");
  const [scratchCode, setScratchCode] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<OutputItem[]>([]);
  const [scratchItems, setScratchItems] = useState<OutputItem[]>([]);
  const [activeInput, setActiveInput] = useState<ActiveInputRequest | null>(null);
  const [checkOutcome, setCheckOutcome] = useState<{ passed: boolean; results: TestOutcome[] } | null>(null);
  const [restartScratchOpen, setRestartScratchOpen] = useState(false);

  const gradedRunId = useRef<string | null>(null);
  const scratchRunId = useRef<string | null>(null);
  const editorHandle = useRef<CodeEditorHandle>(null);
  const scratchHandle = useRef<CodeEditorHandle>(null);

  useEffect(() => {
    setCode(step?.starterCode ?? "");
    setCheckOutcome(null);
    setItems([]);
  }, [stepIndex, lesson.id]);

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
      } else if (msg.t === "checkResult" && msg.runId === gradedRunId.current) {
        setCheckOutcome({ passed: msg.passed, results: msg.results });
        if (msg.passed) {
          onLessonStepComplete?.(mod.id, lesson.id, step.id);
        }
      } else if (msg.t === "runDone") {
        if (msg.runId === gradedRunId.current || msg.runId === scratchRunId.current) {
          setRunning(false);
          if (portrait) setSegment("output");
        }
      } else if (msg.t === "resetDone" && msg.namespace === "scratch" && msg.ok) {
        setScratchItems([]);
      }
    });
    return unsubscribe;
  }, [worker, portrait, mod.id, lesson.id, step?.id, onLessonStepComplete]);

  function runGraded() {
    const runId = nextRunId();
    gradedRunId.current = runId;
    setRunning(true);
    setCheckOutcome(null);
    worker.send({ t: "run", runId, code, mountFiles: [], namespace: "graded" });
  }
  function stopGraded() { if (gradedRunId.current) worker.send({ t: "stop", runId: gradedRunId.current }); }
  function checkGraded() {
    const runId = nextRunId();
    gradedRunId.current = runId;
    setRunning(true);
    const hiddenTests: HiddenTest[] = step.hiddenTests ?? [{ id: "default", code: "", message: "your output should match the brief" }];
    worker.send({ t: "check", runId, code, mountFiles: [], hiddenTests });
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

  const teacherPane = useMemo(
    () => (
      <LessonPane
        moduleTitle={mod.title}
        lesson={lesson}
        stepIndex={stepIndex}
        onTryItRun={async () => "hey"}
        onEnterBoss={onEnterBoss ? () => onEnterBoss(mod.id) : undefined}
      />
    ),
    [mod, lesson, stepIndex, onEnterBoss]
  );

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
            {(["lesson", "code", "output"] as const).map(s => (
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

      <div class="player" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {(!portrait || segment === "lesson") && teacherPane}
        {(!portrait || segment === "code" || segment === "output") && (
          <div class="pane work" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {(!portrait || segment === "code") && (
              <div class="editor-bezel">
                <div class="editor-head">
                  <span class="fn">lesson.py (graded, runs fresh every time)</span>
                  <span class="studs"><i class="stud" /><i class="stud" /><i class="stud" /></span>
                </div>
                <CodeEditor value={code} onChange={setCode} ariaLabel="Graded lesson code editor" handleRef={editorHandle} />
              </div>
            )}
            {(!portrait || segment === "output") && (
              <>
                <RunBar running={running} onRun={runGraded} onStop={stopGraded} onCheck={checkGraded} interruptCapable={inputCapable} />
                <OutputStream items={items} activeInputRequest={activeInput} onInputSubmit={submitInput} />
                {checkOutcome && (
                  <CheckResult
                    passed={checkOutcome.passed}
                    results={checkOutcome.results}
                    hints={step.hints ?? []}
                    modelSolution={step.modelSolution}
                    yourCode={code}
                    onOpenInSandbox={() => onOpenInSandbox?.(code)}
                    onNext={() => setStepIndex(i => Math.min(i + 1, lesson.steps.length - 1))}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
      {(!portrait || segment === "code") && <KeyRow editorRef={editorHandle} />}
      <details style={{ margin: "8px 14px" }}>
        <summary class="dim-label">scratch REPL (persistent, never feeds Check)</summary>
        <div class="editor-bezel" style={{ height: "140px" }}>
          <CodeEditor value={scratchCode} onChange={setScratchCode} ariaLabel="Scratch REPL editor" handleRef={scratchHandle} />
        </div>
        <div class="run-bar">
          <button type="button" class="btn btn-small" onClick={runScratch}>Run scratch</button>
          <button type="button" class="btn btn-ghost btn-small" onClick={() => setRestartScratchOpen(true)}>Restart</button>
        </div>
        <OutputStream items={scratchItems} emptyHint="the scratch REPL keeps its own names between runs" />
      </details>
      <RestartConfirmDialog
        open={restartScratchOpen}
        onCancel={() => setRestartScratchOpen(false)}
        onConfirm={() => { setRestartScratchOpen(false); worker.send({ t: "resetSession", namespace: "scratch" }); }}
        bodyText="Your lesson progress is safe. This just resets the scratch REPL's live variables."
      />
    </div>
  );
}
