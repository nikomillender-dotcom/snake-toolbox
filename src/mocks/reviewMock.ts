// reviewMock.ts, L11 + L12 + CONTRACT 6: a working mock ReviewScheduler.
//
// "Mock getDueReviews/recordReview/dueCount for the Review Hand" across all four ReviewForm kinds
// (recall, predictOutput, fixBug, fillBlank), and honor D7 (snapshot per sitting: the hand drawn at
// sitting-start is fixed; a graded card is done regardless of grade; dueCount does not tick back up
// mid-session). D9: DueReview.form is re-joined from the loaded CurriculumBundle at read time, never
// persisted in ReviewState.

import type { CompletedNode, CurriculumBundle, DueReview, ReviewForm, ReviewGrade, ReviewScheduler, ReviewState, Step } from "../contracts";
import { FIXTURE_BUNDLE } from "./curriculumFixture";

function findReviewableStep(bundle: CurriculumBundle, itemId: string): Step | undefined {
  for (const mod of bundle.modules) {
    for (const lesson of mod.lessons) {
      const step = lesson.steps.find((s) => s.id === itemId);
      if (step) return step;
    }
  }
  return undefined;
}

function collectReviewableSteps(bundle: CurriculumBundle): Array<{ step: Step; lessonId: string }> {
  const out: Array<{ step: Step; lessonId: string }> = [];
  for (const mod of bundle.modules) {
    for (const lesson of mod.lessons) {
      for (const step of lesson.steps) {
        if (step.reviewable !== false && step.reviewForm) out.push({ step, lessonId: lesson.id });
      }
    }
  }
  return out;
}

const DAY = 24 * 60 * 60 * 1000;

/** Creates a scripted ReviewScheduler seeded from the fixture bundle's reviewable steps, all
 * already due (so the Review Hand has something to show on first render). */
export function createMockReviewScheduler(bundle: CurriculumBundle = FIXTURE_BUNDLE): ReviewScheduler {
  const seeded = collectReviewableSteps(bundle);
  const states = new Map<string, ReviewState>(
    seeded.map(({ step, lessonId }, i) => [
      step.id,
      {
        itemId: step.id,
        sourceLessonId: lessonId,
        stability: 1 + i,
        difficulty: 5,
        due: Date.now() - i * 1000, // already due
        lastReviewed: Date.now() - 7 * DAY,
        reps: 1,
        lapses: 0,
        state: "review" as const
      }
    ])
  );
  // sitting snapshot (D7): once a hand is drawn, cards resolved this sitting are excluded even if
  // the library reschedules them same-day.
  let sittingResolved = new Set<string>();
  let sittingDrawnAt: number | null = null;

  function sittingKey(now: number): string {
    const d = new Date(now);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }
  let currentSittingKey: string | null = null;

  function ensureSitting(now: number): void {
    const key = sittingKey(now);
    if (currentSittingKey !== key) {
      currentSittingKey = key;
      sittingResolved = new Set();
      sittingDrawnAt = now;
    }
  }

  return {
    async getDueReviews(now: number, cap: number): Promise<DueReview[]> {
      ensureSitting(now);
      const due = [...states.values()]
        .filter((s) => s.due <= now && !sittingResolved.has(s.itemId))
        .sort((a, b) => a.due - b.due)
        .slice(0, cap);
      return due.map((s) => {
        const step = findReviewableStep(bundle, s.itemId);
        const form: ReviewForm = step?.reviewForm ?? { kind: "recall", sourceLessonId: s.sourceLessonId, prompt: "(missing form)" };
        return { itemId: s.itemId, sourceLessonId: s.sourceLessonId, form, due: s.due };
      });
    },
    async recordReview(itemId: string, grade: ReviewGrade, now: number): Promise<ReviewState> {
      ensureSitting(now);
      const prior = states.get(itemId);
      const base: ReviewState = prior ?? {
        itemId,
        sourceLessonId: "",
        stability: 1,
        difficulty: 5,
        due: now,
        lastReviewed: now,
        reps: 0,
        lapses: 0,
        state: "new"
      };
      // simplified FSRS-shaped fold: failed shortens the next interval, passed lengthens it.
      const multiplier = grade === "failed" ? 0.4 : grade === "struggled" ? 1.1 : 2.4;
      const nextStability = Math.max(0.5, base.stability * multiplier);
      const nextDue = now + nextStability * DAY;
      const next: ReviewState = {
        ...base,
        stability: nextStability,
        difficulty: grade === "failed" ? Math.min(10, base.difficulty + 1) : Math.max(1, base.difficulty - 0.5),
        due: nextDue,
        lastReviewed: now,
        reps: base.reps + 1,
        lapses: grade === "failed" ? base.lapses + 1 : base.lapses,
        state: grade === "failed" ? "relearning" : "review"
      };
      states.set(itemId, next);
      // D7: this card is DONE for the current sitting regardless of grade, even though the fold
      // above may have rescheduled it later today (nextDue could still be "today" for a failed
      // card); the sitting-resolved set is what keeps it out of THIS hand.
      sittingResolved.add(itemId);
      return next;
    },
    async dueCount(now: number): Promise<number> {
      ensureSitting(now);
      return [...states.values()].filter((s) => s.due <= now && !sittingResolved.has(s.itemId)).length;
    },
    async enroll(node: CompletedNode, form: ReviewForm): Promise<void> {
      if (states.has(node.nodeId)) return;
      states.set(node.nodeId, {
        itemId: node.nodeId,
        sourceLessonId: form.sourceLessonId,
        stability: 1,
        difficulty: 5,
        due: node.timestamp,
        lastReviewed: node.timestamp,
        reps: 0,
        lapses: 0,
        state: "new"
      });
    }
  };
}
