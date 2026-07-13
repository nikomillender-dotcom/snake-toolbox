import { describe, expect, it } from "vitest";
import type { CompletedNode, ReviewForm } from "../../contracts.js";
import { makeInMemoryStore } from "../fixtures/inMemoryStore.fixture.js";
import { createReviewScheduler } from "./reviewScheduler.js";

const FORM: ReviewForm = { kind: "recall", sourceLessonId: "m01-l1", prompt: "What is a variable?" };

function makeScheduler(forms: Record<string, ReviewForm> = { "step-1": FORM }) {
  const store = makeInMemoryStore();
  const scheduler = createReviewScheduler({ store, getReviewForm: (itemId) => forms[itemId] });
  return { store, scheduler };
}

function node(nodeId: string, moduleId: string, timestamp: number): CompletedNode {
  return { nodeId, kind: "mcq", moduleId, timestamp };
}

describe("ReviewScheduler (CONTRACT 6, B13)", () => {
  it("enroll() is idempotent: enrolling the same item twice keeps the existing state", async () => {
    const { scheduler } = makeScheduler();
    await scheduler.enroll(node("step-1", "m1", 1000), FORM);
    await scheduler.recordReview("step-1", "passed", 2000);
    const before = await scheduler.dueCount(3_000_000_000_000);

    await scheduler.enroll(node("step-1", "m1", 5000), FORM); // re-enroll, should be a no-op
    const after = await scheduler.dueCount(3_000_000_000_000);
    expect(after).toBe(before);
  });

  it("getDueReviews returns nothing before enrollment (honesty invariant)", async () => {
    const { scheduler } = makeScheduler();
    expect(await scheduler.getDueReviews(Date.now(), 5)).toEqual([]);
    expect(await scheduler.dueCount(Date.now())).toBe(0);
  });

  it("a freshly enrolled item is immediately due for its FIRST review (ts-fsrs new-card default)", async () => {
    // Documented behavior, not a bug: createEmptyCard(now).due === now, matching how Anki/FSRS
    // present brand-new cards right away for their first pass. D7's sitting-exclusion only ever
    // applies to items already GRADED this sitting; a merely-enrolled item has not been graded, so
    // it legitimately appears. If a same-sitting appearance is undesirable product-wise, that is a
    // composition-root/UI policy choice (e.g. also exclude same-sitting enrollments), not an
    // engine correctness issue: flagged for Edelgard in BUILD-REPORT.md.
    const { scheduler } = makeScheduler();
    const enrolledAt = new Date("2026-01-01T00:00:00.000Z").getTime();
    await scheduler.enroll(node("step-1", "m1", enrolledAt), FORM);
    expect(await scheduler.dueCount(enrolledAt)).toBe(1);
  });

  it("recordReview() throws if the item was never enrolled (honesty invariant)", async () => {
    const { scheduler } = makeScheduler();
    await expect(scheduler.recordReview("never-enrolled", "passed", Date.now())).rejects.toThrow(/enroll/);
  });

  it("recordReview maps failed/struggled/passed to Again/Hard/Good with different difficulty and stability", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler: s1 } = makeScheduler();
    await s1.enroll(node("step-1", "m1", now), FORM);
    const passedState = await s1.recordReview("step-1", "passed", now);

    const { scheduler: s2 } = makeScheduler();
    await s2.enroll(node("step-1", "m1", now), FORM);
    const failedState = await s2.recordReview("step-1", "failed", now);

    // A passed grade should never leave the item worse off than a failed grade at the same review.
    expect(passedState.stability).toBeGreaterThan(failedState.stability);
    expect(passedState.difficulty).toBeLessThan(failedState.difficulty);
  });

  it("a genuine LAPSE (failing a card already in review state) increments lapses", async () => {
    // FSRS only counts `lapses` for a REVIEW-state card that is forgotten, not for an "Again" on a
    // brand-new card still in its initial learning ladder (verified by hand against ts-fsrs directly).
    const t0 = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler } = makeScheduler();
    await scheduler.enroll(node("step-1", "m1", t0), FORM);
    const afterFirstGood = await scheduler.recordReview("step-1", "passed", t0);
    const afterSecondGood = await scheduler.recordReview("step-1", "passed", afterFirstGood.due);
    expect(afterSecondGood.state).toBe("review"); // graduated out of the learning ladder
    expect(afterSecondGood.lapses).toBe(0);

    const afterLapse = await scheduler.recordReview("step-1", "failed", afterSecondGood.due);
    expect(afterLapse.lapses).toBe(1);
    expect(afterLapse.state).toBe("relearning");
  });

  it("a failed/struggled item's next due is sooner than a passed item's", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler: passedScheduler } = makeScheduler();
    await passedScheduler.enroll(node("step-1", "m1", now), FORM);
    const passed = await passedScheduler.recordReview("step-1", "passed", now);

    const { scheduler: failedScheduler } = makeScheduler();
    await failedScheduler.enroll(node("step-1", "m1", now), FORM);
    const failed = await failedScheduler.recordReview("step-1", "failed", now);

    expect(failed.due).toBeLessThanOrEqual(passed.due);
  });

  it("DueReview.form is re-joined at read time, not persisted in ReviewState (D9)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler } = makeScheduler({ "step-1": FORM });
    await scheduler.enroll(node("step-1", "m1", now), FORM);
    // A freshly enrolled item is immediately due for its first review (see the dedicated test
    // above); no recordReview needed here, keeping this test focused on the form re-join alone.
    const due = await scheduler.getDueReviews(now, 5);
    expect(due).toHaveLength(1);
    expect(due[0]?.form).toEqual(FORM);
  });

  it("skips a due item whose form cannot be resolved from the bundle, rather than fabricating one", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler } = makeScheduler({}); // no forms resolvable
    await scheduler.enroll(node("step-1", "m1", now), FORM);
    const due = await scheduler.getDueReviews(now, 5);
    expect(due).toEqual([]);
  });

  it("getDueReviews respects the cap and orders most-overdue-first", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const forms: Record<string, ReviewForm> = { a: FORM, b: FORM, c: FORM };
    const { scheduler } = makeScheduler(forms);
    // Enroll at three different times: each freshly-enrolled item is immediately due at its own
    // enrollment time, so "a" (enrolled earliest) is the most overdue once all three are checked.
    await scheduler.enroll(node("a", "m1", now), FORM);
    await scheduler.enroll(node("b", "m1", now + 1000), FORM);
    await scheduler.enroll(node("c", "m1", now + 2000), FORM);

    const due = await scheduler.getDueReviews(now + 10_000, 2);
    expect(due).toHaveLength(2);
    expect(due[0]?.itemId).toBe("a"); // most overdue first (earliest due timestamp)
    expect(due[1]?.itemId).toBe("b");
  });

  it("determinism: a fixed (state, grade, now) yields a fixed next state (checklist item 14)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler: s1 } = makeScheduler();
    await s1.enroll(node("step-1", "m1", now), FORM);
    const r1 = await s1.recordReview("step-1", "passed", now + 60_000);

    const { scheduler: s2 } = makeScheduler();
    await s2.enroll(node("step-1", "m1", now), FORM);
    const r2 = await s2.recordReview("step-1", "passed", now + 60_000);

    expect(r1).toEqual(r2);
  });

  it("recordReview marks the item graded this sitting, so it is excluded from THIS sitting's hand (D7)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler } = makeScheduler();
    await scheduler.enroll(node("step-1", "m1", now), FORM);
    const failed = await scheduler.recordReview("step-1", "failed", now);
    // FSRS commonly reschedules a just-failed learning-step card minutes out, i.e. due <= now +
    // a few minutes. Prove that even once that due time has passed, the SAME sitting excludes it.
    const stillSameSitting = now + 5 * 60_000; // 5 minutes later, same calendar day
    expect(failed.due).toBeLessThanOrEqual(stillSameSitting);
    const due = await scheduler.getDueReviews(stillSameSitting, 5);
    expect(due.find((d) => d.itemId === "step-1")).toBeUndefined();
    expect(await scheduler.dueCount(stillSameSitting)).toBe(0);
  });

  it("a card excluded this sitting DOES return on the next hand (next calendar day, D7)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const { scheduler } = makeScheduler();
    await scheduler.enroll(node("step-1", "m1", now), FORM);
    await scheduler.recordReview("step-1", "failed", now);

    const nextDay = new Date("2026-01-02T09:00:00.000Z").getTime();
    const due = await scheduler.getDueReviews(nextDay, 5);
    expect(due.find((d) => d.itemId === "step-1")).toBeDefined();
  });
});
