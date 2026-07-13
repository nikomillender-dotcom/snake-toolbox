import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import type { Lesson, Step } from "../contracts";
import { PixelWord } from "./PixelWord";
import { KeyRow } from "./KeyRow";
import type { CodeEditorHandle } from "./CodeEditor";
import { IconCheckBig, IconX } from "./icons";
import {
  type AnswerState,
  type LocalGradeResult,
  mcqRevealsAnswer,
  parsonsSettledMask,
  parsonsRevealsOrder,
} from "../lib/gradeAnswer";

// LessonPane, L1/3.1/3.2: prose renderer + inline LiveExample blocks (mini editor + run) + the
// rung-ladder exercise prompt. This is the TEACHER side of the two-pane Learn layout; the DOING
// side (Check/CheckResult and, for predictOutput/traceTable, the prediction field itself, G1) lives
// in screens/LearnScreen.tsx. mcq/fillBlank/parsons capture their answer HERE, in the "Your turn"
// block, since there is no code to write for these three kinds (grading-interaction-spec G6/G8/G10).

export interface LessonPaneProps {
  moduleTitle: string;
  lesson: Lesson;
  stepIndex: number;
  onTryItRun?: (code: string) => Promise<string>;
  onEnterBoss?: () => void;
  // grading-interaction-spec answer capture wiring (G6/G8/G10). Optional so this component still
  // renders sensibly for kinds that do not need them (prose/liveExample/reflection/boss/hidden-test).
  answer?: AnswerState;
  onAnswerChange?: (next: AnswerState) => void;
  localGrade?: LocalGradeResult | null;
  missCount?: number;
}

function FillBlankCapture({
  step, value, onChange,
}: { step: Step; value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<CodeEditorHandle | null>(null) as RefObject<CodeEditorHandle>;

  useEffect(() => {
    (handleRef as { current: CodeEditorHandle }).current = {
      insertAtCursor(text, caretOffset) {
        const el = inputRef.current;
        const s = el?.selectionStart ?? value.length;
        const e = el?.selectionEnd ?? value.length;
        const next = value.slice(0, s) + text + value.slice(e);
        onChange(next);
        const pos = caretOffset != null ? s + caretOffset : s + text.length;
        requestAnimationFrame(() => {
          if (el) { el.selectionStart = el.selectionEnd = pos; el.focus(); }
        });
      },
      dedentCurrentLine() { /* no-op: a single-line blank has nothing to dedent */ },
      focus() { inputRef.current?.focus(); },
    };
  }, [value, onChange]);

  const prompt = step.prompt ?? "";
  const match = prompt.match(/_+/);
  // SF3 (Frederick full-gate should-fix): these attributes turn off spellcheck/autocorrect/auto-
  // capitalize/browser autofill, but none of them disable iOS Safari's Smart Punctuation (there is
  // no HTML attribute that does). A typed straight quote can still become a curly quote here. The
  // actual fix is grader-side: gradeAnswer.gradeFillBlank normalizes smart punctuation back to
  // straight quotes/hyphens on BOTH sides before comparing.
  const chip = (
    <input
      ref={inputRef}
      type="text"
      class="blank-chip mono"
      aria-label="Fill in the blank"
      value={value}
      spellcheck={false}
      autocorrect="off"
      autocapitalize="off"
      autocomplete="off"
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
    />
  );

  return (
    <div style={{ margin: "12px 0" }}>
      {match && match.index != null ? (
        <p class="prose">
          {prompt.slice(0, match.index)}
          {chip}
          {prompt.slice(match.index + match[0].length)}
        </p>
      ) : (
        <>
          <p class="prose">{prompt}</p>
          <label class="dim-label" style={{ display: "block", marginBottom: "6px" }}>your answer</label>
          {chip}
        </>
      )}
      <KeyRow editorRef={handleRef} />
    </div>
  );
}

function McqCapture({
  step, selected, onSelect, localGrade, missCount,
}: { step: Step; selected: number | null; onSelect: (i: number) => void; localGrade?: LocalGradeResult | null; missCount: number }) {
  const choices = step.choices ?? [];
  const showedAWrongPick = !!localGrade && !localGrade.passed;
  const revealCorrect = showedAWrongPick && mcqRevealsAnswer(missCount);
  // N3 (Frederick full-gate nit): the radiogroup used to repeat the prompt as BOTH aria-label and
  // this visible <p>, so a screen reader announced it twice. aria-labelledby points at the visible
  // text instead, one source of truth, one announcement.
  const promptId = `mcq-prompt-${step.id}`;
  return (
    <div role="radiogroup" aria-labelledby={promptId} style={{ margin: "12px 0" }}>
      <p id={promptId} class="prose">{step.prompt ?? "Choose one"}</p>
      {choices.map((choice, i) => {
        const isSelected = selected === i;
        const looksLikeCode = !/\s/.test(choice.trim()) && choice.trim().length > 0;
        const isWrongPick = showedAWrongPick && isSelected && !revealCorrect;
        const isRevealedCorrect = revealCorrect && i === step.answerIndex;
        return (
          <label key={i} class={`mcq-row${isSelected ? " sel" : ""}`}>
            <input
              type="radio"
              name={`mcq-${step.id}`}
              checked={isSelected}
              onChange={() => onSelect(i)}
            />
            <span class={looksLikeCode ? "mono" : undefined}>{choice}</span>
            {isWrongPick && <span class="mark not-this-one"><IconX /> not this one</span>}
            {isRevealedCorrect && <span class="mark this-one"><IconCheckBig /> it is this one</span>}
          </label>
        );
      })}
    </div>
  );
}

function ParsonsCapture({
  step, order, onReorder, localGrade, missCount,
}: { step: Step; order: number[]; onReorder: (next: number[]) => void; localGrade?: LocalGradeResult | null; missCount: number }) {
  const scrambled = step.scrambled ?? [];
  const effectiveOrder = order.length === scrambled.length ? order : scrambled.map((_, i) => i);
  const showedAMiss = !!localGrade && !localGrade.passed;
  const settled = showedAMiss ? parsonsSettledMask(effectiveOrder, step) : null;
  const revealOrder = showedAMiss && parsonsRevealsOrder(missCount);
  const [announcement, setAnnouncement] = useState("");

  function move(pos: number, dir: -1 | 1) {
    const target = pos + dir;
    if (target < 0 || target >= effectiveOrder.length) return;
    const next = effectiveOrder.slice();
    const line = scrambled[next[pos]!] ?? "";
    [next[pos], next[target]] = [next[target]!, next[pos]!];
    onReorder(next);
    setAnnouncement(`${line} moved to position ${target + 1} of ${next.length}`);
  }

  return (
    <div style={{ margin: "12px 0" }}>
      <p class="prose">{step.prompt}</p>
      <ol class="parsons-list" aria-label="Reorder these lines into a working program">
        {effectiveOrder.map((idx, pos) => {
          const line = scrambled[idx] ?? "";
          return (
            <li key={idx} class="parsons-row">
              <span class="mono">{line}</span>
              <span class="parsons-buttons">
                <button
                  type="button" class="btn btn-ghost btn-small"
                  aria-label={`Move ${line} up`} disabled={pos === 0}
                  onClick={() => move(pos, -1)}
                >&uarr;</button>
                <button
                  type="button" class="btn btn-ghost btn-small"
                  aria-label={`Move ${line} down`} disabled={pos === effectiveOrder.length - 1}
                  onClick={() => move(pos, 1)}
                >&darr;</button>
              </span>
              {settled && (
                settled[pos]
                  ? <span class="mark settled"><IconCheckBig /> home</span>
                  : <span class="mark move-me">move me</span>
              )}
            </li>
          );
        })}
      </ol>
      <div aria-live="polite" class="visually-hidden">{announcement}</div>
      <p class="dim-label">move-up / move-down reorders; drag is a future enhancement, the buttons are the accessible primary (F23)</p>
      {revealOrder && (
        <div class="card" style={{ marginTop: "10px", padding: "10px 12px" }}>
          <div class="dim-label" style={{ marginBottom: "6px" }}>the order that works</div>
          {(step.solutionOrder ?? []).map((idx, i) => <div key={i} class="mono">{scrambled[idx]}</div>)}
        </div>
      )}
    </div>
  );
}

function ExercisePromptBody({ step, answer, onAnswerChange, localGrade, missCount }: {
  step: Step; answer?: AnswerState; onAnswerChange?: (next: AnswerState) => void;
  localGrade?: LocalGradeResult | null; missCount: number;
}) {
  switch (step.kind) {
    case "predictOutput":
    case "traceTable":
      // G1: the code is read here (so there is something to predict); the actual typed prediction
      // field lives in the WORK pane (LearnScreen.tsx), styled to echo the OutputStream, NOT here.
      return (
        <div style={{ margin: "12px 0" }}>
          <p class="prose">{step.prompt}</p>
          {step.code && (
            <pre class="mono card" style={{ padding: "12px 14px", marginTop: "10px", whiteSpace: "pre" }}>{step.code}</pre>
          )}
        </div>
      );
    case "mcq":
      return (
        <McqCapture
          step={step}
          selected={answer?.mcqIndex ?? null}
          onSelect={(i) => onAnswerChange?.({ ...(answer as AnswerState), mcqIndex: i })}
          localGrade={localGrade}
          missCount={missCount}
        />
      );
    case "fillBlank":
      return (
        <FillBlankCapture
          step={step}
          value={answer?.fillBlank ?? ""}
          onChange={(v) => onAnswerChange?.({ ...(answer as AnswerState), fillBlank: v })}
        />
      );
    case "parsons":
      return (
        <ParsonsCapture
          step={step}
          order={answer?.parsonsOrder ?? (step.scrambled ?? []).map((_, i) => i)}
          onReorder={(next) => onAnswerChange?.({ ...(answer as AnswerState), parsonsOrder: next })}
          localGrade={localGrade}
          missCount={missCount}
        />
      );
    default:
      return step.prompt ? <p class="prose">{step.prompt}</p> : null;
  }
}

export function LessonPane({ moduleTitle, lesson, stepIndex, onTryItRun, onEnterBoss, answer, onAnswerChange, localGrade, missCount = 0 }: LessonPaneProps) {
  const step = lesson.steps[stepIndex];
  const [tryOut, setTryOut] = useState<string | null>(null);
  const [tryCode, setTryCode] = useState(step?.code ?? "");

  // Manager fix round, bug 2 side-effect: LessonPane is a PERSISTENT instance across step
  // navigation (it is never remounted when stepIndex changes), so the two lines above only ever
  // ran once, at the very first step this instance ever rendered. Before Back/Next existed the
  // only way to move between steps was CheckResult's post-pass Next, and no real lesson happens to
  // land on a liveExample step right after a graded pass, so this was never actually reachable.
  // The new persistent step nav makes it trivially reachable (Next from ANY step into the next
  // liveExample one), which showed up immediately as an empty "try it" code block. Re-sync both on
  // every step change so a liveExample step always shows its OWN code, not whatever the instance's
  // first-ever step happened to carry.
  useEffect(() => {
    setTryCode(step?.code ?? "");
    setTryOut(null);
  }, [step?.id]);

  async function runTryIt() {
    if (!onTryItRun) return;
    const out = await onTryItRun(tryCode);
    setTryOut(out);
  }

  if (!step) return null;

  return (
    <div class="pane teacher" style={{ overflow: "auto", padding: "22px 24px" }}>
      <div class="dim-label">{moduleTitle}</div>
      <h1 class="serif" style={{ fontSize: "24px", margin: "6px 0 4px" }}>{lesson.title}</h1>

      {step.kind === "prose" && step.body && <p class="prose">{step.body}</p>}

      {step.kind === "liveExample" && step.code && (
        <div class="card" style={{ margin: "18px 0" }}>
          <div class="dim-label" style={{ padding: "10px 14px 0" }}>try it (live)</div>
          <pre class="mono" style={{ padding: "8px 14px 12px", whiteSpace: "pre" }}>{tryCode}</pre>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px 12px" }}>
            <button type="button" class="btn btn-small btn-primary" onClick={runTryIt}>Run</button>
          </div>
          {tryOut != null && <div class="mono" style={{ color: "var(--mint)", padding: "0 14px 12px" }}>{tryOut}</div>}
        </div>
      )}

      {step.kind !== "prose" && step.kind !== "liveExample" && step.kind !== "reflection" && step.kind !== "boss" && (
        <div class="turn" style={{ marginTop: "20px", padding: "16px", borderLeft: "3px solid var(--pink)", background: "var(--pink-wash-min)", borderRadius: "0 10px 10px 0" }}>
          <b>Your turn.</b>
          <ExercisePromptBody step={step} answer={answer} onAnswerChange={onAnswerChange} localGrade={localGrade} missCount={missCount} />
        </div>
      )}

      {step.kind === "reflection" && (
        <div style={{ marginTop: "20px" }}>
          <p class="prose">{step.prompt ?? "A quick reflection, no grading, just captured."}</p>
          <textarea aria-label="Reflection" rows={4} style={{ width: "100%", fontFamily: "var(--font-serif)", fontSize: "15px" }} />
        </div>
      )}

      {step.kind === "boss" && (
        <div style={{ marginTop: "20px" }}>
          <PixelWord word="BOSS AHEAD" cell={6} color="#E0A54C" />
          <p class="prose">This lesson's boss battle opens in its own screen. Bring everything this unit taught.</p>
          {onEnterBoss && (
            <button type="button" class="btn btn-primary" onClick={onEnterBoss}>Enter the boss battle</button>
          )}
        </div>
      )}
    </div>
  );
}
