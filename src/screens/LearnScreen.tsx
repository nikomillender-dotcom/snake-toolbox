import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { WorkerClient } from "../mocks/workerMock";
import type { CurriculumBundle, HiddenTest, TestOutcome } from "../contracts";
import { CodeEditor, type CodeEditorHandle } from "../components/CodeEditor";
import { KeyRow } from "../components/KeyRow";
import { RunBar } from "../components/RunBar";
import { OutputStream, bytesToDataUrl, type ActiveInputRequest, type OutputItem } from "../components/OutputStream";
import { CheckResult } from "../components/CheckResult";
import { LessonPane } from "../components/LessonPane";
import { DegradedBootBanner } from "../components/DegradedBootBanner";
import { RestartConfirmDialog } from "../components/RestartConfirmDialog";

export interface LearnScreenProps {
  bundle: CurriculumBundle;
  worker: WorkerClient;
  inputCapable: boolean;
  onOpenInSandbox?: (code: string) => void;
  onLessonStepComplete?: (moduleId: string, lessonId: string, stepId: string) => void;
  onEnterBoss?: (moduleId: string) => void;
}

let runIdSeq = 0;
function nextRunId(): string {
  runIdSeq += 1;
  return `run-${runIdSeq}`;
}

export function LearnScreen({ bundle, worker, inputCapable, onOpenInSandbox, onLessonStepComplete, onEnterBoss }: LearnScreenProps) {
  const firstModule = bundle.modules[0]!;
  const firstLesson = firstModule.lessons[0]!;
  const [stepIndex, setStepIndex] = useState(0);
  const step = firstLesson.steps[stepIndex]!;

  const [portrait, setPortrait] = useState(false);
  const [segment, setSegment] = useState<"lesson" | "code" | "output">("lesson");

  const [code, setCode] = useState(step.starterCode ?? "");
  const [scratchCode, setScratchCode] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<OutputItem[]>([]);
  const [scratchItems, setScratchItems] = useState<OutputItem[]>([]);
  const [activeInput, setActiveInput] = useState<ActiveInputRequest | null>(null);
  const [checkOutcome, setCheckOutcome] = useState<{ passed: boolean; results: TestOutcome[] } | null>(null);
  const [restartScratchOpen, setRestartScratchOpen] = useState(false);

  const gradedRunId = useRef<string | null>(null);
  const scratchRunId = useRef<string | null>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const editorHandle = useRef<CodeEditorHandle>(null);
  const scratchHandle = useRef<CodeEditorHandle>(null);

  useEffect(() => {
    setCode(step.starterCode ?? "");
    setCheckOutcome(null);
    setItems([]);
  }, [stepIndex]);

  useEffect(() => {
    const unsubscribe = worker.subscribe((msg) => {
      if (msg.t === "stdout" && msg.runId === gradedRunId.current) {
        setItems((prev) => [...prev, { kind: "stdout", id: `${msg.runId}-${prev.length}`, text: msg.text }]);
      } else if (msg.t === "stdout" && msg.runId === scratchRunId.current) {
        setScratchItems((prev) => [...prev, { kind: "stdout", id: `${msg.runId}-${prev.length}`, text: msg.text }]);
      } else if (msg.t === "error" && msg.runId === gradedRunId.current) {
        setItems((prev) => [...prev, { kind: "error", id: `${msg.runId}-err`, message: msg.message, traceback: msg.traceback }]);
      } else if (msg.t === "error" && msg.runId === scratchRunId.current) {
        setScratchItems((prev) => [...prev, { kind: "error", id: `${msg.runId}-err`, message: msg.message, traceback: msg.traceback }]);
      } else if (msg.t === "figure" && msg.runId === gradedRunId.current) {
        setItems((prev) => [...prev, { kind: "figure", id: `${msg.runId}-fig`, alt: msg.alt, dataUrl: bytesToDataUrl(msg.png) }]);
      } else if (msg.t === "inputRequest" && (msg.runId === gradedRunId.current || msg.runId === scratchRunId.current)) {
        setActiveInput({ runId: msg.runId, prompt: msg.prompt });
      } else if (msg.t === "checkResult" && msg.runId === gradedRunId.current) {
        setCheckOutcome({ passed: msg.passed, results: msg.results });
        if (msg.passed) {
          onLessonStepComplete?.(firstModule.id, firstLesson.id, step.id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worker, portrait]);

  function runGraded() {
    const runId = nextRunId();
    gradedRunId.current = runId;
    setRunning(true);
    setCheckOutcome(null);
    worker.send({ t: "run", runId, code, mountFiles: [], namespace: "graded" });
  }

  function stopGraded() {
    if (!gradedRunId.current) return;
    worker.send({ t: "stop", runId: gradedRunId.current });
  }

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
        moduleTitle={firstModule.title}
        lesson={firstLesson}
        stepIndex={stepIndex}
        onTryItRun={async () => "hey"}
        onEnterBoss={onEnterBoss ? () => onEnterBoss(firstModule.id) : undefined}
      />
    ),
    [firstModule, firstLesson, stepIndex, onEnterBoss]
  );

  return (
    <div class={portrait ? "learn-screen pmode" : "learn-screen"}>
      <div class="top-bar">
        <span class="chip">step {stepIndex + 1} of {firstLesson.steps.length}</span>
        <span class="rt-indicator"><span class="runtime-dot warm" aria-hidden="true" /> runtime warm</span>
        <div class="spacer" />
        {onEnterBoss && (
          // Demo/reachability affordance: this build's LearnScreen renders a single fixture
          // lesson (module 1, lesson 1) rather than full curriculum navigation (that is
          // Byleth's content + Edelgard's progress-driven routing, out of scope here per L11).
          // This link keeps the Boss Battle screen (L7) reachable end to end for review.
          <button type="button" class="btn btn-ghost btn-small" onClick={() => onEnterBoss("m03")}>
            Preview: boss battle
          </button>
        )}
        {portrait && (
          <div class="seg" role="tablist" aria-label="Lesson view">
            {(["lesson", "code", "output"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={segment === s} onClick={() => setSegment(s)}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}
        <label style={{ fontSize: "12px", color: "var(--dim)", display: "flex", alignItems: "center", gap: "6px" }}>
          <input type="checkbox" checked={portrait} onChange={(e) => setPortrait((e.target as HTMLInputElement).checked)} /> portrait
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
                <OutputStream
                  items={items}
                  activeInputRequest={activeInput}
                  onInputSubmit={submitInput}
                  returnFocusRef={runButtonRef}
                />
                {checkOutcome && (
                  <CheckResult
                    passed={checkOutcome.passed}
                    results={checkOutcome.results}
                    hints={step.hints ?? []}
                    modelSolution={step.modelSolution}
                    yourCode={code}
                    onOpenInSandbox={() => onOpenInSandbox?.(code)}
                    onNext={() => setStepIndex((i) => Math.min(i + 1, firstLesson.steps.length - 1))}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {(!portrait || segment === "code") && (
        <KeyRow editorRef={editorHandle} />
      )}

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
        onConfirm={() => {
          setRestartScratchOpen(false);
          worker.send({ t: "resetSession", namespace: "scratch" });
        }}
        bodyText="Your lesson progress is safe. This just resets the scratch REPL's live variables."
      />
    </div>
  );
}
