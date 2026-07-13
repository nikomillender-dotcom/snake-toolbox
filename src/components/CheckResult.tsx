import { useEffect, useState } from "preact/hooks";
import type { TestOutcome } from "../contracts";
import { IconCheckBig, IconX } from "./icons";

// CheckResult, L2/3.4: pass/fail state, a friendly diff, progressive free hints, model solution
// side-by-side. "Never log an outcome the app cannot observe": this component only ever renders
// what the worker's real checkResult event said; it never invents a pass.

export interface CheckResultProps {
  // SF5 (Frederick full-gate should-fix): `outcome` is null before the first Check on this step.
  // The OUTER role="status" element below is ALWAYS mounted regardless of outcome (LearnScreen
  // renders <CheckResult /> unconditionally now, never gated behind `{checkOutcome && ...}`), and
  // only the INNER content swaps when outcome changes. A live region that appears in the DOM at
  // the SAME moment as its content is not reliably picked up by iOS VoiceOver (the region has to
  // already exist, and have been observed, before the mutation it needs to announce); keeping it
  // permanently mounted and swapping only the text fixes that.
  outcome: { passed: boolean; results: TestOutcome[] } | null;
  // Resets the ephemeral hint/solution-reveal state below when the step changes. Previously that
  // reset happened "for free" because the whole component unmounted/remounted with `checkOutcome`;
  // now that the outer element stays mounted across steps, this needs an explicit reset.
  stepId: string;
  hints: string[];
  modelSolution?: string;
  yourCode?: string;
  onOpenInSandbox?: () => void;
  onNext?: () => void;
  // Manager fix round, bug 3 (Next was a silent no-op on the last step): on the lesson's final
  // step, this pass card's action is no longer "advance to a step that does not exist," it is the
  // lesson-complete moment. Relabel honestly ("Finish lesson" instead of "Next ->"); the CALLER's
  // onNext decides what actually happens (LearnScreen.goNext routes to the module screen when
  // there is no next step to advance to). Defaults false so every existing call site (mid-lesson
  // passes) is unchanged.
  isLastStep?: boolean;
}

export function CheckResult({ outcome, stepId, hints, modelSolution, yourCode, onNext, onOpenInSandbox, isLastStep = false }: CheckResultProps) {
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => {
    setHintsShown(0);
    setShowSolution(false);
  }, [stepId]);

  const firstFail = outcome && !outcome.passed ? outcome.results.find((r) => !r.passed) : undefined;

  return (
    <div class="check-result" role="status">
      {outcome?.passed && (
        <div class="res-card pass">
          <div class="res-head"><IconCheckBig /> Nice. Step cleared.</div>
          <p>You proved it, not just guessed it. On to the next one.</p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" class="btn btn-primary btn-small" onClick={onNext}>{isLastStep ? "Finish lesson" : "Next ->"}</button>
            {onOpenInSandbox && (
              <button type="button" class="btn btn-ghost btn-small" onClick={onOpenInSandbox}>Open in Sandbox</button>
            )}
          </div>
        </div>
      )}

      {outcome && !outcome.passed && (
        <div class="res-card fail">
          <div class="res-head"><IconX /> Not yet, one requirement short.</div>
          {firstFail && <p style={{ margin: "6px 0" }}>{firstFail.message}</p>}
          {firstFail && (firstFail.expected != null || firstFail.actual != null) && (
            <div class="diff-block">
              {firstFail.expected != null && <div class="exp"><span class="dim-label">expected</span> {firstFail.expected}</div>}
              {firstFail.actual != null && <div class="got"><span class="dim-label">you printed</span> {firstFail.actual}</div>}
            </div>
          )}
          {Array.from({ length: hintsShown }).map((_, i) => (
            <div class="hint-box" key={i}>
              <b>Hint {i + 1}.</b> {hints[i] ?? "Try re-reading the failing test's message above."}
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            {hintsShown < hints.length && (
              <button type="button" class="btn btn-ghost btn-small" onClick={() => setHintsShown((n) => n + 1)}>
                {hintsShown === 0 ? "Hint" : "Another hint"}
              </button>
            )}
            {modelSolution && (
              <button type="button" class="btn btn-ghost btn-small" onClick={() => setShowSolution((s) => !s)}>
                {showSolution ? "Hide solution" : "Show me the solution"}
              </button>
            )}
          </div>
          {showSolution && modelSolution && (
            <div style={{ marginTop: "12px", border: "1px solid var(--line)", borderRadius: "10px", overflow: "hidden" }}>
              <div class="dim-label" style={{ padding: "10px 14px", background: "var(--panel)" }}>model solution, side by side with your attempt</div>
              <div style={{ display: "grid", gridTemplateColumns: yourCode ? "1fr 1fr" : "1fr" }}>
                {yourCode && (
                  <pre class="mono" style={{ margin: 0, padding: "12px", fontSize: "13px", borderRight: "1px solid var(--line)", overflow: "auto" }}>{yourCode}</pre>
                )}
                <pre class="mono" style={{ margin: 0, padding: "12px", fontSize: "13px", overflow: "auto" }}>{modelSolution}</pre>
              </div>
              {onOpenInSandbox && (
                <div style={{ padding: "10px 14px" }}>
                  <button type="button" class="btn btn-ghost btn-small" onClick={onOpenInSandbox}>Open in Sandbox</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
