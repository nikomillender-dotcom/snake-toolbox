// Tests for the bundle validator (hardening F)
import { describe, expect, it } from "vitest";
import { validateBundle, assertAllModulesCompletable, isPlaceholderModule } from "./bundleValidator";
import { FIXTURE_BUNDLE } from "../mocks/curriculumFixture";
import type { Module } from "../contracts";

// The synthetic L11 fixture (src/mocks/curriculumFixture.ts) predates the sentinel-aware
// authored-module-needs-a-boss rule (curriculum-bundle round) and, by original design, models
// m01/m02 as early modules with no boss and m12 as a fixture-only phase-4 module built specifically
// to be boss-less (see its own comment: tests a phase-4 crossing without a boss completion event).
// None of the three is a PLACEHOLDER: skeleton, so the rule would flag all three; this is a known,
// deliberate property of the fixture, not a real curriculum defect, so it is filtered here exactly
// like the all-prose INFO findings below. The REAL curriculum bundle's authored modules (m01 to
// m10) all ship a boss (see realCurriculumBundle.test.ts), so the rule stays strict for real content.
const FIXTURE_KNOWN_BOSS_LESS_MODULES = new Set(["m01", "m02", "m12"]);

describe("bundleValidator (hardening F)", () => {
  it("the fixture bundle passes validation with only expected INFO-level all-prose findings", () => {
    const errors = validateBundle(FIXTURE_BUNDLE);
    // Filter out the INFO-level "all-prose lesson" findings (allowed by CONTRACT 7) and the
    // fixture's own known boss-less modules (see comment above).
    const real = errors.filter(e =>
      !e.message.startsWith("all-prose lesson") &&
      ![...FIXTURE_KNOWN_BOSS_LESS_MODULES].some(id => e.message.includes(`authored module "${id}" has no boss`))
    );
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

  // Sentinel-aware authored-content gate (curriculum-bundle round): catches a real authored
  // module missing its boss, but exempts a PLACEHOLDER: skeleton, and does not water down the
  // check globally (a genuinely broken authored module still fails).
  describe("sentinel-aware authored-module-needs-a-boss rule", () => {
    it("catches an AUTHORED module (not a PLACEHOLDER skeleton) missing a boss", () => {
      const bad = structuredClone(FIXTURE_BUNDLE);
      const m03 = bad.modules.find(m => m.id === "m03")!;
      expect(m03.boss).toBeDefined(); // sanity: m03 has a boss in the fixture
      delete m03.boss;
      const errors = validateBundle(bad);
      expect(errors.some(e => e.message.includes('authored module "m03" has no boss'))).toBe(true);
    });

    it("does NOT flag a PLACEHOLDER: skeleton module missing a boss", () => {
      const bad = structuredClone(FIXTURE_BUNDLE);
      const skeleton: Module = {
        id: "m-skeleton", title: "Coming Soon", phase: 1, strands: ["core"], producesArtifact: false,
        conceptTags: [], terms: [],
        lessons: [{ id: "m-skeleton-l1", title: "Coming Soon", steps: [
          { id: "m-skeleton-l1-s1", kind: "prose", conceptTags: [], reviewable: false, body: "PLACEHOLDER: this chapter is still being written." },
        ] }],
      };
      bad.modules.push(skeleton);
      const errors = validateBundle(bad);
      expect(errors.some(e => e.message.includes('module "m-skeleton" has no boss'))).toBe(false);
    });

    it("isPlaceholderModule identifies the sentinel correctly", () => {
      const placeholder: Module = {
        id: "x", title: "x", phase: 1, strands: ["core"], producesArtifact: false, conceptTags: [], terms: [],
        lessons: [{ id: "x-l1", title: "x", steps: [
          { id: "x-l1-s1", kind: "prose", conceptTags: [], body: "PLACEHOLDER: not written yet." },
        ] }],
      };
      const authored = FIXTURE_BUNDLE.modules.find(m => m.id === "m01")!;
      expect(isPlaceholderModule(placeholder)).toBe(true);
      expect(isPlaceholderModule(authored)).toBe(false);
    });

    // SF2 (Frederick full-gate should-fix): the tightened whole-skeleton shape. A single stray
    // PLACEHOLDER: prose step must no longer exempt an otherwise genuinely authored module (real
    // emitting steps, real terms, a real boss) from the authored-boss gate.
    it("a stray PLACEHOLDER: prose step in an otherwise-authored module (real emitting step, terms, boss) does NOT exempt it", () => {
      const strayPlaceholder: Module = {
        id: "m-stray", title: "Mostly real", phase: 1, strands: ["core"], producesArtifact: false,
        conceptTags: [],
        terms: [{ id: "t-stray", term: "stray", definition: "def", kind: "concept", strand: "core", sourceModuleId: "m-stray", sourceLessonId: "m-stray-l1" }],
        boss: { id: "boss-m-stray", name: "Boss", taunt: "t", brief: "b", emblem: "e", isPillar: false,
          hiddenTests: [{ id: "h1", code: "assert True", message: "m" }], modelSolution: "pass" },
        lessons: [{ id: "m-stray-l1", title: "Real lesson", steps: [
          { id: "m-stray-l1-s1", kind: "mcq", conceptTags: [], choices: ["a", "b"], answerIndex: 0 },
          // The stray sentinel: one leftover authoring artifact, everything else here is real.
          { id: "m-stray-l1-s2", kind: "prose", conceptTags: [], body: "PLACEHOLDER: leftover note, forgot to delete." },
        ] }],
      };
      // Old `.some()` behavior would have exempted this module (it DOES have a boss, so the old
      // rule's only consequence, missing-boss detection, would not have caught it either; prove
      // the tightened detector itself instead: isPlaceholderModule must be false now that the
      // module has a real emitting step, real terms, and a real boss).
      expect(isPlaceholderModule(strayPlaceholder)).toBe(false);

      // The real consequence: strip the boss and the module MUST be flagged (old `.some()` would
      // have silently exempted it, since the stray sentinel alone used to be enough).
      const withoutBoss = structuredClone(strayPlaceholder);
      delete withoutBoss.boss;
      const errors = validateBundle({ ...FIXTURE_BUNDLE, modules: [...FIXTURE_BUNDLE.modules, withoutBoss] });
      expect(errors.some(e => e.message.includes('authored module "m-stray" has no boss'))).toBe(true);
    });
  });

  // SF1 (Frederick full-gate should-fix): an authored (non-placeholder) hidden-test-route step
  // (writeStub/fixBug/boss) with empty or missing hiddenTests would vacuously auto-pass at
  // runtime (pyodideEngine.check reports an empty test `passed: true`). bundleValidator rejects
  // this at load time.
  describe("hidden-test-route step must carry real hiddenTests (SF1)", () => {
    it("catches a writeStub step in an authored module with NO hiddenTests field", () => {
      const bad = structuredClone(FIXTURE_BUNDLE);
      const m06 = bad.modules.find(m => m.id === "m06")!;
      delete m06.lessons[0]!.steps[0]!.hiddenTests;
      const errors = validateBundle(bad);
      expect(errors.some(e => e.message.includes('step "m06-l1-s1"') && e.message.includes("empty or missing hiddenTests"))).toBe(true);
    });

    it("catches a fixBug step with an EMPTY hiddenTests array", () => {
      const bad = structuredClone(FIXTURE_BUNDLE);
      const m03 = bad.modules.find(m => m.id === "m03")!;
      m03.lessons[0]!.steps[0]!.hiddenTests = [];
      const errors = validateBundle(bad);
      expect(errors.some(e => e.message.includes('step "m03-l1-s1"') && e.message.includes("empty or missing hiddenTests"))).toBe(true);
    });

    it("does NOT flag a PLACEHOLDER: skeleton module (it has no real hidden-test-route steps to check)", () => {
      const skeleton: Module = {
        id: "m-skeleton2", title: "Coming Soon", phase: 1, strands: ["core"], producesArtifact: false,
        conceptTags: [], terms: [],
        lessons: [{ id: "m-skeleton2-l1", title: "Coming Soon", steps: [
          { id: "m-skeleton2-l1-s1", kind: "prose", conceptTags: [], reviewable: false, body: "PLACEHOLDER: this chapter is still being written." },
        ] }],
      };
      const bad = structuredClone(FIXTURE_BUNDLE);
      bad.modules.push(skeleton);
      const errors = validateBundle(bad);
      // A prose-only skeleton legitimately trips the unrelated "all-prose lesson" INFO finding
      // (CONTRACT 7 fallback, expected); the thing under test is specifically the SF1 rule.
      expect(errors.some(e => e.path.includes("m-skeleton2") && e.message.includes("empty or missing hiddenTests"))).toBe(false);
    });

    it("the real fixture bundle's own writeStub/fixBug/boss steps all carry real hiddenTests (no false positives)", () => {
      const errors = validateBundle(FIXTURE_BUNDLE);
      expect(errors.some(e => e.message.includes("empty or missing hiddenTests"))).toBe(false);
    });
  });
});
