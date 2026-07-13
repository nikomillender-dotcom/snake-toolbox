import { describe, expect, it } from "vitest";
import { createMockReviewScheduler } from "../src/mocks/reviewMock";
import { FIXTURE_BUNDLE } from "../src/mocks/curriculumFixture";

describe("mock ReviewScheduler (CONTRACT 6)", () => {
  it("getDueReviews returns forms across the four ReviewForm kinds from the fixture bundle", () => {
    const scheduler = createMockReviewScheduler(FIXTURE_BUNDLE);
    return scheduler.getDueReviews(Date.now(), 8).then((hand) => {
      const kinds = new Set(hand.map((h) => h.form.kind));
      expect(kinds.has("recall")).toBe(true);
      expect(kinds.has("predictOutput")).toBe(true);
      expect(kinds.has("fixBug")).toBe(true);
      expect(kinds.has("fillBlank")).toBe(true);
    });
  });

  it("never surfaces more than `cap` items (the calm-hand rule, never Anki's 200-card wall)", async () => {
    const scheduler = createMockReviewScheduler(FIXTURE_BUNDLE);
    const hand = await scheduler.getDueReviews(Date.now(), 2);
    expect(hand.length).toBeLessThanOrEqual(2);
  });

  it("D9: DueReview.form is re-joined from the bundle at read time, matching the Step's authored reviewForm", async () => {
    const scheduler = createMockReviewScheduler(FIXTURE_BUNDLE);
    const hand = await scheduler.getDueReviews(Date.now(), 8);
    const fillBlankItem = hand.find((h) => h.form.kind === "fillBlank");
    expect(fillBlankItem?.form.prompt).toBe("Fill in the call that prints greeting.");
  });

  it("D7 (snapshot per sitting): a card graded once does not reappear in the SAME sitting's due count or hand", async () => {
    const scheduler = createMockReviewScheduler(FIXTURE_BUNDLE);
    const now = Date.now();
    const before = await scheduler.dueCount(now);
    const hand = await scheduler.getDueReviews(now, 8);
    const first = hand[0]!;
    await scheduler.recordReview(first.itemId, "failed", now + 10);
    const after = await scheduler.dueCount(now + 20);
    expect(after).toBe(before - 1);
    const nextHand = await scheduler.getDueReviews(now + 30, 8);
    expect(nextHand.some((h) => h.itemId === first.itemId)).toBe(false);
  });

  it("recordReview reschedules: failed shortens the interval relative to passed", async () => {
    const scheduler = createMockReviewScheduler(FIXTURE_BUNDLE);
    const now = Date.now();
    const hand = await scheduler.getDueReviews(now, 8);
    const [a, b] = hand;
    const failedState = await scheduler.recordReview(a!.itemId, "failed", now);
    const passedState = await scheduler.recordReview(b!.itemId, "passed", now);
    expect(failedState.due - now).toBeLessThan(passedState.due - now);
    expect(failedState.lapses).toBeGreaterThan(0);
  });

  it("enroll only ever adds items from real completions, never fabricates a due item on its own", async () => {
    const scheduler = createMockReviewScheduler(FIXTURE_BUNDLE);
    const before = await scheduler.dueCount(Date.now() + 10_000_000_000); // far future, catches everything
    await scheduler.enroll(
      { nodeId: "brand-new-step", kind: "fillBlank", moduleId: "m01", timestamp: Date.now() },
      { kind: "fillBlank", sourceLessonId: "m01-l1", prompt: "test" }
    );
    const after = await scheduler.dueCount(Date.now() + 10_000_000_000);
    expect(after).toBe(before + 1);
  });
});
