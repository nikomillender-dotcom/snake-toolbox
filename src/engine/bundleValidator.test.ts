// Tests for the bundle validator (hardening F)
import { describe, expect, it } from "vitest";
import { validateBundle, assertAllModulesCompletable } from "./bundleValidator";
import { FIXTURE_BUNDLE } from "../mocks/curriculumFixture";

describe("bundleValidator (hardening F)", () => {
  it("the fixture bundle passes validation with only expected INFO-level all-prose findings", () => {
    const errors = validateBundle(FIXTURE_BUNDLE);
    // Filter out the INFO-level "all-prose lesson" findings (allowed by CONTRACT 7)
    const real = errors.filter(e => !e.message.startsWith("all-prose lesson"));
    expect(real).toEqual([]);
  });

  it("catches a Term.sourceLessonId that does not resolve to a real lesson", () => {
    const bad = structuredClone(FIXTURE_BUNDLE);
    bad.modules[0]!.terms[0]!.sourceLessonId = "nonexistent-lesson";
    const errors = validateBundle(bad);
    expect(errors.some(e => e.message.includes("nonexistent-lesson"))).toBe(true);
  });

  it("catches a bossAward key that does not match any boss id", () => {
    const bad = structuredClone(FIXTURE_BUNDLE);
    (bad.awardMap.bossAward as Record<string, unknown>)["fake-boss"] = { stat: "DEBUG", bump: 1, pillar: false, seal: { id: "s", label: "s", tier: "bronze", mintedAt: 0 } };
    const errors = validateBundle(bad);
    expect(errors.some(e => e.message.includes("fake-boss"))).toBe(true);
  });

  it("catches duplicate step ids", () => {
    const bad = structuredClone(FIXTURE_BUNDLE);
    bad.modules[0]!.lessons[0]!.steps.push({ ...bad.modules[0]!.lessons[0]!.steps[0]! });
    const errors = validateBundle(bad);
    expect(errors.some(e => e.message.includes("duplicate step id"))).toBe(true);
  });

  it("assertAllModulesCompletable passes for the fixture bundle", () => {
    const errors = assertAllModulesCompletable(FIXTURE_BUNDLE);
    expect(errors).toEqual([]);
  });
});
