import { describe, expect, it } from "vitest";
import { mockDeriveStatSheet, mockDetectPromotion } from "../src/mocks/deriveStatSheetMock";
import { FIXTURE_AWARD_MAP } from "../src/mocks/curriculumFixture";
import { FIXTURE_PROFILE, PHASE1_PROGRESS, PHASE2_PROGRESS, PHASE3_PROGRESS, PHASE4_PROGRESS } from "../src/mocks/statSheetFixtures";
import type { CompletedNode, ProfileFacts } from "../src/contracts";

describe("mockDeriveStatSheet (CONTRACT 5 pure-fold semantics)", () => {
  it("level is exactly the count of kind==='module' completed nodes", () => {
    const sheet = mockDeriveStatSheet(PHASE1_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const moduleCount = PHASE1_PROGRESS.completedNodes.filter((n) => n.kind === "module").length;
    expect(sheet.level).toBe(moduleCount);
  });

  it("phase derives from level via phaseThresholds, never a hardcoded 10/20/30 (P2)", () => {
    const s1 = mockDeriveStatSheet(PHASE1_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const s2 = mockDeriveStatSheet(PHASE2_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const s3 = mockDeriveStatSheet(PHASE3_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const s4 = mockDeriveStatSheet(PHASE4_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    expect(s1.phase).toBe(1);
    expect(s2.phase).toBe(2);
    expect(s3.phase).toBe(3);
    expect(s4.phase).toBe(4);
    // className/spriteTier follow classByPhase, not invented independently
    expect(s1.className).toBe("Apprentice");
    expect(s4.className).toBe("Wayfarer");
    expect(s4.spriteTier).toBe(4);
  });

  it("is a PURE function: same inputs yield byte-identical output on repeat calls (no hidden state)", () => {
    const a = mockDeriveStatSheet(PHASE2_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const b = mockDeriveStatSheet(PHASE2_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    expect(a).toEqual(b);
  });

  it("stats never exceed statMax (the capped-bar invariant), SHIP excepted (it is a count, not a bar)", () => {
    const sheet = mockDeriveStatSheet(PHASE4_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    for (const s of sheet.stats) {
      if (s.key === "SHIP") continue;
      expect(s.value).toBeLessThanOrEqual(s.max);
    }
  });

  it("jobMastery only counts PILLAR bosses actually present in the completion log (honesty invariant)", () => {
    const sheet = mockDeriveStatSheet(PHASE1_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    expect(sheet.jobMastery.earned).toBe(0); // no boss cleared yet in phase 1 fixture
    const sheet4 = mockDeriveStatSheet(PHASE4_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    expect(sheet4.jobMastery.earned).toBe(3); // all three pillar bosses cleared
    expect(sheet4.jobMastery.total).toBe(3);
  });

  it("titles and seals are minted only from real completed boss/module nodes, never invented", () => {
    const sheet = mockDeriveStatSheet(PHASE3_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    expect(sheet.titles.map((t) => t.label).sort()).toEqual(["PCAP", "PCEP"]);
    expect(sheet.seals.length).toBe(2);
  });

  it("changedSince (P10) reflects stats that rose strictly after profile.lastViewedAt", () => {
    const profile: ProfileFacts = { ...FIXTURE_PROFILE, lastViewedAt: Date.now() + 1000 }; // "visited" in the future: nothing should read as new
    const sheet = mockDeriveStatSheet(PHASE1_PROGRESS, FIXTURE_AWARD_MAP, profile);
    expect(sheet.changedSince).toEqual([]);
  });

  it("changedSince fires for a stat with a completion strictly after lastViewedAt", () => {
    const veryOld: ProfileFacts = { ...FIXTURE_PROFILE, lastViewedAt: 0 };
    const sheet = mockDeriveStatSheet(PHASE1_PROGRESS, FIXTURE_AWARD_MAP, veryOld);
    expect(sheet.changedSince.length).toBeGreaterThan(0);
  });

  it("shipCount counts only kind==='artifact' nodes", () => {
    const sheet = mockDeriveStatSheet(PHASE4_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const artifactCount = PHASE4_PROGRESS.completedNodes.filter((n) => n.kind === "artifact").length;
    expect(sheet.shipCount).toBe(artifactCount);
  });

  it("a step-kind node missing its strand still folds byKind but skips the byStrand bump (P8 honesty, not a crash)", () => {
    const node: CompletedNode = { nodeId: "orphan", kind: "fixBug", moduleId: "m03", timestamp: Date.now() };
    const sheet = mockDeriveStatSheet({ completedNodes: [node] }, FIXTURE_AWARD_MAP, FIXTURE_PROFILE);
    const debug = sheet.stats.find((s) => s.key === "DEBUG");
    expect(debug?.value).toBe(FIXTURE_AWARD_MAP.byKind.fixBug?.DEBUG ?? 0); // byKind bump only, no byStrand bump
  });
});

describe("mockDetectPromotion", () => {
  it("reports promoted only when phase strictly increases", () => {
    expect(mockDetectPromotion(1, 2)).toEqual({ promoted: true, from: 1, to: 2 });
    expect(mockDetectPromotion(2, 2)).toEqual({ promoted: false, from: 2, to: 2 });
    expect(mockDetectPromotion(3, 2)).toEqual({ promoted: false, from: 3, to: 2 });
  });
});
