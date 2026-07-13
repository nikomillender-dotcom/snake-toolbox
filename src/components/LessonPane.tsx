import { useState } from "preact/hooks";
import type { Lesson, Step } from "../contracts";
import { PixelWord } from "./PixelWord";

// LessonPane, L1/3.1/3.2: prose renderer + inline LiveExample blocks (mini editor + run) + the
// rung-ladder exercise prompt. This is the TEACHER side of the two-pane Learn layout; the DOING
// side (editor/run/console/check) lives in screens/LearnScreen.tsx.

export interface LessonPaneProps {
  moduleTitle: string;
  lesson: Lesson;
  stepIndex: number;
  onTryItRun?: (code: string) => Promise<string>;
  onEnterBoss?: () => void;
}

function ExercisePromptBody({ step }: { step: Step }) {
  switch (step.kind) {
    case "mcq":
      return (
        <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}>
          <legend class="prose">{step.prompt}</legend>
          {(step.choices ?? []).map((choice, i) => (
            <label key={i} style={{ display: "block", padding: "6px 0" }}>
              <input type="radio" name={`mcq-${step.id}`} value={i} /> {choice}
            </label>
          ))}
        </fieldset>
      );
    case "parsons":
      return (
        <div style={{ margin: "12px 0" }}>
          <p class="prose">{step.prompt}</p>
          <ol style={{ fontFamily: "var(--font-mono)", fontSize: "14px" }}>
            {(step.scrambled ?? []).map((line, i) => <li key={i}>{line}</li>)}
          </ol>
          <p class="dim-label">drag to reorder (touch/keyboard reorder wired at build time)</p>
        </div>
      );
    default:
      return step.prompt ? <p class="prose">{step.prompt}</p> : null;
  }
}

export function LessonPane({ moduleTitle, lesson, stepIndex, onTryItRun, onEnterBoss }: LessonPaneProps) {
  const step = lesson.steps[stepIndex];
  const [tryOut, setTryOut] = useState<string | null>(null);
  const [tryCode] = useState(step?.code ?? "");

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

      {step.kind !== "prose" && step.kind !== "liveExample" && step.kind !== "reflection" && (
        <div class="turn" style={{ marginTop: "20px", padding: "16px", borderLeft: "3px solid var(--pink)", background: "var(--pink-wash-min)", borderRadius: "0 10px 10px 0" }}>
          <b>Your turn.</b>
          <ExercisePromptBody step={step} />
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
