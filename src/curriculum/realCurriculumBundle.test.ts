// Tests for the REAL curriculum bundle (curriculum-bundle round): Byleth's authored content,
// mechanically copied into src/curriculum/ and assembled by realCurriculumBundle.ts. Confirms the
// bundle loads, validates cleanly (module 2 of the round: bundle validator + assertAllModulesCompletable),
// the authored/skeleton boundary is machine-detected correctly, and awardMap resolves against real
// boss ids. Byleth's JSON content is his lane; this file asserts structure only, never content.
import { describe, expect, it } from "vitest";
import { REAL_CURRICULUM_BUNDLE } from "./realCurriculumBundle";
import { validateBundle, assertAllModulesCompletable, isPlaceholderModule } from "../engine/bundleValidator";

const AUTHORED_IDS = Array.from({ length: 10 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`);
const SKELETON_IDS = Array.from({ length: 23 }, (_, i) => `m${String(i + 11).padStart(2, "0")}`);

describe("REAL_CURRICULUM_BUNDLE", () => {
  it("loads with exactly 33 modules", () => {
    expect(REAL_CURRICULUM_BUNDLE.modules).toHaveLength(33);
    expect(REAL_CURRICULUM_BUNDLE.modules.map(m => m.id)).toEqual([...AUTHORED_IDS, ...SKELETON_IDS]);
  });

  it("validates with ONLY the expected 23 all-prose (skeleton) INFO findings, zero real errors", () => {
    const errors = validateBundle(REAL_CURRICULUM_BUNDLE);
    const allProse = errors.filter(e => e.message.startsWith("all-prose lesson"));
    const real = errors.filter(e => !e.message.startsWith("all-prose lesson"));
    // Every skeleton module (m11 to m33) has exactly one all-prose lesson (its PLACEHOLDER lesson);
    // that is the ONLY finding this validator run should produce against the real bundle.
    expect(allProse).toHaveLength(SKELETON_IDS.length);
    expect(allProse.map(e => e.path).sort()).toEqual(
      SKELETON_IDS.map(id => `module/${id}/lesson/${id}-l1`).sort(),
    );
    expect(real).toEqual([]);
  });

  it("assertAllModulesCompletable reports zero errors for the real bundle", () => {
    expect(assertAllModulesCompletable(REAL_CURRICULUM_BUNDLE)).toEqual([]);
  });

  it("the authored/skeleton boundary is machine-detected correctly (sentinel-aware)", () => {
    for (const id of AUTHORED_IDS) {
      const mod = REAL_CURRICULUM_BUNDLE.modules.find(m => m.id === id)!;
      expect(mod, `module ${id} should exist`).toBeDefined();
      expect(isPlaceholderModule(mod), `${id} should NOT be a placeholder`).toBe(false);
      expect(mod.boss, `${id} is authored and must have a boss`).toBeDefined();
      expect(mod.terms.length, `${id} is authored and should have real glossary terms`).toBeGreaterThan(0);
    }
    for (const id of SKELETON_IDS) {
      const mod = REAL_CURRICULUM_BUNDLE.modules.find(m => m.id === id)!;
      expect(mod, `module ${id} should exist`).toBeDefined();
      expect(isPlaceholderModule(mod), `${id} should be detected as a PLACEHOLDER skeleton`).toBe(true);
      expect(mod.boss, `${id} is a skeleton and should have no boss yet`).toBeUndefined();
      expect(mod.terms, `${id} is a skeleton and should have no terms yet`).toEqual([]);
    }
  });

  it("awardMap.bossAward resolves against every real boss id, one entry per authored module", () => {
    const bossIds = REAL_CURRICULUM_BUNDLE.modules
      .map(m => m.boss?.id)
      .filter((id): id is string => !!id);
    expect(bossIds).toHaveLength(AUTHORED_IDS.length);
    const bossAwardKeys = Object.keys(REAL_CURRICULUM_BUNDLE.awardMap.bossAward);
    expect(bossAwardKeys.sort()).toEqual(bossIds.sort());
    // Every bossAward entry actually resolves to a REAL boss on a REAL module (not orphaned).
    for (const key of bossAwardKeys) {
      expect(bossIds).toContain(key);
    }
  });

  it("awardMap.modulePrimary and titleFor keys resolve against real module ids", () => {
    const moduleIds = new Set(REAL_CURRICULUM_BUNDLE.modules.map(m => m.id));
    for (const key of Object.keys(REAL_CURRICULUM_BUNDLE.awardMap.modulePrimary)) {
      expect(moduleIds.has(key), `modulePrimary key "${key}" should resolve to a real module`).toBe(true);
    }
    for (const key of Object.keys(REAL_CURRICULUM_BUNDLE.awardMap.titleFor)) {
      expect(moduleIds.has(key), `titleFor key "${key}" should resolve to a real module`).toBe(true);
    }
  });

  it("phases and units in the manifest reference only real module ids, and cover all 33 exactly once", () => {
    const moduleIds = new Set(REAL_CURRICULUM_BUNDLE.modules.map(m => m.id));
    const seenInPhases = new Set<string>();
    for (const phase of REAL_CURRICULUM_BUNDLE.phases) {
      for (const id of phase.moduleIds) {
        expect(moduleIds.has(id), `phase ${phase.id} references real module ${id}`).toBe(true);
        expect(seenInPhases.has(id), `module ${id} appears in exactly one phase`).toBe(false);
        seenInPhases.add(id);
      }
    }
    expect(seenInPhases.size).toBe(33);
    const seenInUnits = new Set<string>();
    for (const unit of REAL_CURRICULUM_BUNDLE.units) {
      for (const id of unit.moduleIds) {
        expect(moduleIds.has(id), `unit ${unit.id} references real module ${id}`).toBe(true);
        seenInUnits.add(id);
      }
    }
    expect(seenInUnits.size).toBe(33);
  });
});
