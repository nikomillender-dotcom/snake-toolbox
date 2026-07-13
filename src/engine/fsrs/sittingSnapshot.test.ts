import { describe, expect, it } from "vitest";
import { SittingSnapshot } from "./sittingSnapshot.js";

const DAY1 = new Date("2026-01-01T10:00:00.000Z").getTime();
const DAY1_LATER = new Date("2026-01-01T14:00:00.000Z").getTime();
const DAY2 = new Date("2026-01-02T09:00:00.000Z").getTime();

describe("SittingSnapshot (D7)", () => {
  it("is not excluded before it has ever been graded", () => {
    const s = new SittingSnapshot();
    expect(s.isExcludedThisSitting("item1", DAY1)).toBe(false);
  });

  it("excludes an item graded earlier THIS sitting, even later the same day", () => {
    const s = new SittingSnapshot();
    s.markGraded("item1", DAY1);
    expect(s.isExcludedThisSitting("item1", DAY1_LATER)).toBe(true);
  });

  it("stops excluding once the calendar day rolls over (next hand, D7)", () => {
    const s = new SittingSnapshot();
    s.markGraded("item1", DAY1);
    expect(s.isExcludedThisSitting("item1", DAY2)).toBe(false);
  });

  it("tracks multiple items independently", () => {
    const s = new SittingSnapshot();
    s.markGraded("item1", DAY1);
    expect(s.isExcludedThisSitting("item1", DAY1_LATER)).toBe(true);
    expect(s.isExcludedThisSitting("item2", DAY1_LATER)).toBe(false);
  });
});
