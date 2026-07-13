// ReviewScheduler (CONTRACT 6, backend B13). Wraps ts-fsrs (pinned 5.4.1, see PINS.md), the
// maintained pure-TypeScript FSRS implementation. Fully offline, deterministic given its inputs.
//
// Determinism (B11, checklist item 14): ts-fsrs's `enable_fuzz` option deliberately randomizes
// scheduled intervals for realism in a full spaced-repetition app; that randomness would break the
// "fixed (state, grade, now) -> fixed next state" contract requirement outright, so it is turned
// OFF here, pinned in generatorParameters(). This is a deliberate configuration choice, documented,
// not a contract deviation (CONTRACT 6 does not pin FSRS's own internal parameters).
//
// Storage note (documented design decision, not a contract deviation): ts-fsrs's `Card` carries
// `elapsed_days` / `scheduled_days` / `learning_steps`, three fields CONTRACT 6's `ReviewState`
// does not have. Dropping them between calls measurably changes scheduling for a card still
// mid-way through its initial learning-step ladder (verified by hand: reconstructing a Card with
// learning_steps zeroed causes an extra learning-step hop before graduating to full spaced
// review). Rather than expanding the frozen ReviewState shape, this module stores a strict
// SUPERSET internally (StoredReviewRow) and returns/persists-to-backup only the exact CONTRACT 6
// fields; see toPublicReviewState() below and github/progressBackup.ts, which also strips to
// exactly ReviewState when building a ProgressBackup. Flagged in BUILD-REPORT.md for visibility,
// not hidden.
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type {
  CompletedNode,
  DueReview,
  ReviewForm,
  ReviewGrade,
  ReviewScheduler,
  ReviewState,
  Store,
} from "../../contracts.js";
import { SittingSnapshot } from "./sittingSnapshot.js";

export const REVIEWS_COLLECTION = "reviews";

interface StoredReviewRow extends ReviewState {
  _fsrsElapsedDays: number;
  _fsrsScheduledDays: number;
  _fsrsLearningSteps: number;
}

function toPublicReviewState(row: StoredReviewRow): ReviewState {
  return {
    itemId: row.itemId,
    sourceLessonId: row.sourceLessonId,
    stability: row.stability,
    difficulty: row.difficulty,
    due: row.due,
    lastReviewed: row.lastReviewed,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
  };
}

const FSRS_STATE_TO_STRING: Record<number, ReviewState["state"]> = {
  0: "new",
  1: "learning",
  2: "review",
  3: "relearning",
};
const STRING_TO_FSRS_STATE: Record<ReviewState["state"], number> = {
  new: 0,
  learning: 1,
  review: 2,
  relearning: 3,
};

const GRADE_TO_RATING: Record<ReviewGrade, Grade> = {
  failed: Rating.Again,
  struggled: Rating.Hard,
  passed: Rating.Good,
};

function rowToCard(row: StoredReviewRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row._fsrsElapsedDays,
    scheduled_days: row._fsrsScheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    learning_steps: row._fsrsLearningSteps,
    state: STRING_TO_FSRS_STATE[row.state],
    last_review: row.lastReviewed ? new Date(row.lastReviewed) : undefined,
  };
}

function cardToRow(card: Card, itemId: string, sourceLessonId: string): StoredReviewRow {
  const state = FSRS_STATE_TO_STRING[card.state];
  if (!state) throw new Error(`Unknown ts-fsrs state ${card.state}`);
  return {
    itemId,
    sourceLessonId,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.getTime(),
    lastReviewed: card.last_review ? card.last_review.getTime() : 0,
    reps: card.reps,
    lapses: card.lapses,
    state,
    _fsrsElapsedDays: card.elapsed_days,
    _fsrsScheduledDays: card.scheduled_days,
    _fsrsLearningSteps: card.learning_steps,
  };
}

export interface ReviewSchedulerDeps {
  store: Store;
  /** D9: getDueReviews re-joins the review form from the loaded CurriculumBundle at read time;
   * this is that join, injected so this module never needs to import the whole bundle type. */
  getReviewForm(itemId: string): ReviewForm | undefined;
  /** Injectable for deterministic tests; defaults to Date.now via the `now` params already
   * threaded through every method, so this is only used by enroll() when constructing a brand new
   * card (enroll's CompletedNode.timestamp IS the "now" for that creation). */
}

export function createReviewScheduler(deps: ReviewSchedulerDeps): ReviewScheduler {
  const engine = fsrs(generatorParameters({ enable_fuzz: false }));
  const sitting = new SittingSnapshot();

  async function readAll(): Promise<StoredReviewRow[]> {
    const rows = await deps.store.list<StoredReviewRow>(REVIEWS_COLLECTION);
    return rows.map((r) => r.value);
  }

  async function readOne(itemId: string): Promise<StoredReviewRow | undefined> {
    return deps.store.get<StoredReviewRow>(REVIEWS_COLLECTION, itemId);
  }

  async function writeOne(row: StoredReviewRow): Promise<void> {
    await deps.store.put(REVIEWS_COLLECTION, row.itemId, row);
  }

  return {
    async enroll(node: CompletedNode, form: ReviewForm): Promise<void> {
      // D9: the form itself is never persisted here; getDueReviews re-joins it from the bundle.
      const existing = await readOne(node.nodeId);
      if (existing) return; // idempotent: enrolling twice keeps the existing state (CONTRACT 6)
      const card = createEmptyCard(new Date(node.timestamp));
      // v5 (Deviation 1 fix): ReviewForm now carries sourceLessonId (the deep-link home for
      // "open the full exercise"), so enroll reads it directly from the form. The old
      // node.moduleId fallback is retired.
      const row = cardToRow(card, node.nodeId, form.sourceLessonId);
      await writeOne(row);
    },

    async getDueReviews(now: number, cap: number): Promise<DueReview[]> {
      const rows = await readAll();
      const due = rows
        .filter((r) => r.due <= now)
        .filter((r) => !sitting.isExcludedThisSitting(r.itemId, now))
        .sort((a, b) => a.due - b.due); // most-overdue-first

      const result: DueReview[] = [];
      for (const row of due) {
        if (result.length >= cap) break;
        const form = deps.getReviewForm(row.itemId);
        if (!form) continue; // never fabricate a review card with no real form (authoring gap)
        result.push({ itemId: row.itemId, sourceLessonId: row.sourceLessonId, form, due: row.due });
      }
      return result;
    },

    async recordReview(itemId: string, grade: ReviewGrade, now: number): Promise<ReviewState> {
      const existing = await readOne(itemId);
      if (!existing) {
        throw new Error(
          `recordReview("${itemId}") called before enroll(): the review pool only grows from real ` +
            `completions (honesty invariant, CONTRACT 6). This is a caller bug, not a data problem.`,
        );
      }
      const card = rowToCard(existing);
      const { card: nextCard } = engine.next(card, new Date(now), GRADE_TO_RATING[grade]);
      const row = cardToRow(nextCard, existing.itemId, existing.sourceLessonId);
      await writeOne(row);
      sitting.markGraded(itemId, now);
      return toPublicReviewState(row);
    },

    async dueCount(now: number): Promise<number> {
      const rows = await readAll();
      return rows.filter((r) => r.due <= now && !sitting.isExcludedThisSitting(r.itemId, now)).length;
    },
  };
}
