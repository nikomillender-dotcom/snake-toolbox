import { useEffect, useRef, useState } from "preact/hooks";
import type { DueReview, ReviewGrade } from "../contracts";

// ReviewHand + ReviewCard, L12: the calm daily ritual. NOT a fourth nav item, NOT a blocking modal.
// D7: the hand is fixed for the sitting (this component receives a snapshot list and removes cards
// locally as graded, it never re-fetches mid-hand in a way that could re-surface a just-graded
// card). Grade buttons carry WORD + color, never color alone (F18).

export interface ReviewHandProps {
  dueCount: number;
  hand: DueReview[] | null; // null until drawn
  onDrawHand: () => void;
  onGrade: (itemId: string, grade: ReviewGrade) => void;
  reducedMotion?: boolean;
}

function ReviewCard({ item, onGrade, reducedMotion }: { item: DueReview; onGrade: (grade: ReviewGrade) => void; reducedMotion?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const form = item.form;

  return (
    <div class={`card${reducedMotion ? "" : " card-enter"}`} style={{ padding: "16px" }} role="region" aria-label="Review card">
      <p class="serif">{form.prompt}</p>
      {form.kind === "predictOutput" && form.code && (
        <pre class="mono" style={{ background: "var(--console-bg)", padding: "10px", borderRadius: "8px" }}>{form.code}</pre>
      )}
      {(form.kind === "fixBug" || form.kind === "fillBlank") && form.starterCode && (
        <textarea
          aria-label="Your answer"
          value={answer}
          onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
          rows={4}
          class="mono"
          style={{ width: "100%", background: "var(--console-bg)", color: "var(--ink)", padding: "10px", borderRadius: "8px" }}
        />
      )}
      {form.kind === "recall" && form.choices && (
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend class="visually-hidden">Choose an answer</legend>
          {form.choices.map((c, i) => (
            <label key={i} style={{ display: "block", padding: "4px 0" }}>
              <input type="radio" name="recall-choice" value={i} /> {c}
            </label>
          ))}
        </fieldset>
      )}
      {!revealed ? (
        <button type="button" class="btn btn-ghost btn-small" style={{ marginTop: "10px" }} onClick={() => setRevealed(true)}>
          Reveal answer
        </button>
      ) : (
        <>
          {form.expected != null && <div class="banner info" style={{ marginTop: "10px" }}>Expected: {form.expected}</div>}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            <button type="button" class="btn btn-small" style={{ background: "var(--err)", color: "var(--ink-on-pink)" }} onClick={() => onGrade("failed")}>
              Failed
            </button>
            <button type="button" class="btn btn-small" style={{ background: "var(--brass)", color: "var(--ink-on-pink)" }} onClick={() => onGrade("struggled")}>
              Struggled
            </button>
            <button type="button" class="btn btn-small" style={{ background: "var(--mint)", color: "var(--ink-on-pink)" }} onClick={() => onGrade("passed")}>
              Passed
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ReviewHand({ dueCount, hand, onDrawHand, onGrade, reducedMotion }: ReviewHandProps) {
  const [remaining, setRemaining] = useState<DueReview[]>([]);
  const focusTargetRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (hand) setRemaining(hand);
  }, [hand]);

  useEffect(() => {
    if (hand && focusTargetRef.current) focusTargetRef.current.focus();
  }, [hand]);

  function gradeAndAdvance(itemId: string, grade: ReviewGrade) {
    onGrade(itemId, grade);
    setRemaining((prev) => prev.filter((r) => r.itemId !== itemId));
  }

  if (hand === null) {
    if (dueCount === 0) {
      return (
        <div class="card" style={{ padding: "16px" }}>
          <p class="serif" style={{ margin: 0 }}>You are all caught up. Nothing due today.</p>
        </div>
      );
    }
    return (
      <div class="card" style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <span>{dueCount} due today. A quick hand to keep it fresh.</span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" class="btn btn-primary btn-small" onClick={onDrawHand}>Draw the hand</button>
        </div>
      </div>
    );
  }

  if (remaining.length === 0) {
    return (
      <div class="card" style={{ padding: "16px" }}>
        <h3 class="serif" tabIndex={-1} ref={focusTargetRef} style={{ margin: 0 }}>You kept it fresh.</h3>
      </div>
    );
  }

  const current = remaining[0]!;
  return (
    <div>
      <h3 class="dim-label" tabIndex={-1} ref={focusTargetRef}>Review hand, {remaining.length} left</h3>
      <ReviewCard key={current.itemId} item={current} onGrade={(g) => gradeAndAdvance(current.itemId, g)} reducedMotion={reducedMotion} />
      <button type="button" class="btn btn-ghost btn-small" style={{ marginTop: "10px" }} onClick={() => setRemaining([])}>
        not today
      </button>
    </div>
  );
}
