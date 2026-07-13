import { describe, expect, it } from "vitest";
import { detectPromotion } from "./detectPromotion.js";

describe("detectPromotion", () => {
  it("reports a promotion only when the phase actually rises", () => {
    expect(detectPromotion(1, 2)).toEqual({ promoted: true, from: 1, to: 2 });
  });

  it("reports no promotion when the phase is unchanged", () => {
    expect(detectPromotion(2, 2)).toEqual({ promoted: false, from: 2, to: 2 });
  });

  it("never reports a promotion for a phase drop", () => {
    expect(detectPromotion(3, 2)).toEqual({ promoted: false, from: 3, to: 2 });
  });
});
