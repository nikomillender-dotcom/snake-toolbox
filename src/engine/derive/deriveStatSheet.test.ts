import { describe, expect, it } from "vitest";
import type { CompletedNode, ProfileFacts, ProgressSnapshot } from "../../contracts.js";
import { makeStatAwardMapFixture } from "../fixtures/statAwardMap.fixture.js";
import { deriveStatSheet } from "./deriveStatSheet.js";

const profile: ProfileFacts = { name: "Niko", epithet: "the Curious", lastViewedAt: 1000 };

function snapshot(nodes: CompletedNode[]): ProgressSnapshot {
  return { completedNodes: nodes };
}

describe("deriveStatSheet", () => {
  it("is deterministic: identical inputs yield an identical StatSheet (checklist item 13)", () => {
    const nodes: CompletedNode[] = [
      { nodeId: "step-practice-mcq", kind: "mcq", moduleId: "m1-variables", strand: "core", timestamp: 500 },
      { nodeId: "m1-variables", kind: "module", moduleId: "m1-variables", timestamp: 600 },
    ];
    const awardMap = makeStatAwardMapFixture();
    const a = deriveStatSheet(snapshot(nodes), awardMap, profile);
    const b = deriveStatSheet(snapshot([...nodes]), awardMap, profile);
    expect(a).toEqual(b);
  });

  it("counts level as the number of module-kind nodes, not any other kind", () => {
    const nodes: CompletedNode[] = [
      { nodeId: "m1-variables", kind: "module", moduleId: "m1-variables", timestamp: 1 },
      { nodeId: "m2-control-flow", kind: "module", moduleId: "m2-control-flow", timestamp: 2 },
      { nodeId: "boss-m1", kind: "boss", moduleId: "m1-variables", timestamp: 3 },
    ];
    const sheet = deriveStatSheet(snapshot(nodes), makeStatAwardMapFixture(), profile);
    expect(sheet.level).toBe(2);
  });

  it("derives phase from phaseThresholds, never a hardcoded magic number (P2)", () => {
    const awardMap = makeStatAwardMapFixture();
    // thresholds: 1:0, 2:2, 3:5, 4:9
    const zeroModules = deriveStatSheet(snapshot([]), awardMap, profile);
    expect(zeroModules.phase).toBe(1);

    const twoModules: CompletedNode[] = [
      { nodeId: "m1-variables", kind: "module", moduleId: "m1-variables", timestamp: 1 },
      { nodeId: "m2-control-flow", kind: "module", moduleId: "m2-control-flow", timestamp: 2 },
    ];
    expect(deriveStatSheet(snapshot(twoModules), awardMap, profile).phase).toBe(2);

    const fiveModules: CompletedNode[] = Array.from({ length: 5 }, (_, i) => ({
      nodeId: `mod-${i}`,
      kind: "module" as const,
      moduleId: `mod-${i}`,
      timestamp: i,
    }));
    expect(deriveStatSheet(snapshot(fiveModules), awardMap, profile).phase).toBe(3);

    // Reshaping the curriculum (changing only the thresholds) must reshape the promotion point,
    // proving there is no hardcoded 10/20/30 anywhere in the fold.
    const reshaped = { ...awardMap, phaseThresholds: { 1: 0, 2: 100, 3: 200, 4: 300 } };
    expect(deriveStatSheet(snapshot(twoModules), reshaped, profile).phase).toBe(1);
  });

  it("joins modulePrimary, bossAward, and titleFor on the pinned keys (P7)", () => {
    const nodes: CompletedNode[] = [
      { nodeId: "m1-variables", kind: "module", moduleId: "m1-variables", timestamp: 10 },
      { nodeId: "boss-m1", kind: "boss", moduleId: "m1-variables", timestamp: 20 },
    ];
    const sheet = deriveStatSheet(snapshot(nodes), makeStatAwardMapFixture(), profile);

    // modulePrimary["m1-variables"] = { stat: SYNTAX, bump: 10 }
    const syntax = sheet.stats.find((s) => s.key === "SYNTAX");
    expect(syntax?.value).toBeGreaterThanOrEqual(10);

    // bossAward["boss-m1"] = { stat: DEBUG, bump: 20, seal: bronze, pillar: true }
    const debug = sheet.stats.find((s) => s.key === "DEBUG");
    expect(debug?.value).toBeGreaterThanOrEqual(20);
    expect(sheet.seals.some((s) => s.id === "seal-boss-m1")).toBe(true);

    // titleFor["m1-variables"] fires on the module node
    expect(sheet.titles.some((t) => t.id === "title-m1")).toBe(true);
  });

  it("a mismatched key yields silent zero awards, proving the join is exact (pre-flag item 14)", () => {
    const nodes: CompletedNode[] = [
      // moduleId does not match any modulePrimary/titleFor key in the fixture.
      { nodeId: "unknown-module", kind: "module", moduleId: "unknown-module", timestamp: 10 },
    ];
    const sheet = deriveStatSheet(snapshot(nodes), makeStatAwardMapFixture(), profile);
    expect(sheet.titles).toHaveLength(0);
    expect(sheet.stats.every((s) => s.value === 0)).toBe(true);
    expect(sheet.level).toBe(1); // level still counts the module node itself
  });

  it("requires strand to be stamped for byStrand awards to land (P8)", () => {
    const withStrand: CompletedNode = {
      nodeId: "n1",
      kind: "fixBug",
      moduleId: "m1-variables",
      strand: "debug",
      timestamp: 10,
    };
    const withoutStrand: CompletedNode = { ...withStrand, strand: undefined };

    const withSheet = deriveStatSheet(snapshot([withStrand]), makeStatAwardMapFixture(), profile);
    const withoutSheet = deriveStatSheet(snapshot([withoutStrand]), makeStatAwardMapFixture(), profile);

    const debugWith = withSheet.stats.find((s) => s.key === "DEBUG")!.value;
    const debugWithout = withoutSheet.stats.find((s) => s.key === "DEBUG")!.value;
    // byKind.fixBug gives DEBUG 5; byStrand.debug gives another DEBUG 3 only when strand is present.
    expect(debugWith).toBe(8);
    expect(debugWithout).toBe(5);
  });

  it("does not fold statTags (P9, advisory-only)", () => {
    const node: CompletedNode = {
      nodeId: "n1",
      kind: "mcq",
      moduleId: "m1-variables",
      statTags: ["DESIGN", "SHIP"],
      timestamp: 10,
    };
    const sheet = deriveStatSheet(snapshot([node]), makeStatAwardMapFixture(), profile);
    const design = sheet.stats.find((s) => s.key === "DESIGN")!.value;
    const ship = sheet.stats.find((s) => s.key === "SHIP")!.value;
    // Only byKind.mcq (SYNTAX 2) should land; statTags must not add to DESIGN or SHIP.
    expect(design).toBe(0);
    expect(ship).toBe(0);
  });

  it("caps a stat at statMax", () => {
    const nodes: CompletedNode[] = Array.from({ length: 60 }, (_, i) => ({
      nodeId: `mcq-${i}`,
      kind: "mcq" as const,
      moduleId: "m1-variables",
      timestamp: i,
    }));
    const sheet = deriveStatSheet(snapshot(nodes), makeStatAwardMapFixture(), profile);
    const syntax = sheet.stats.find((s) => s.key === "SYNTAX")!;
    expect(syntax.value).toBe(syntax.max); // 60 * 2 = 120, capped at 100
  });

  it("changedSince reflects only stat rises after profile.lastViewedAt", () => {
    const before: CompletedNode = { nodeId: "n1", kind: "mcq", moduleId: "m1-variables", timestamp: 500 };
    const after: CompletedNode = { nodeId: "n2", kind: "fixBug", moduleId: "m1-variables", strand: "debug", timestamp: 1500 };
    const sheet = deriveStatSheet(snapshot([before, after]), makeStatAwardMapFixture(), profile);
    expect(sheet.changedSince).toContain("DEBUG");
    expect(sheet.changedSince).not.toContain("SYNTAX");
  });

  it("shipAward adds to SHIP per artifact node and increments shipCount", () => {
    const nodes: CompletedNode[] = [
      { nodeId: "artifact-1", kind: "artifact", moduleId: "m1-variables", timestamp: 1 },
      { nodeId: "artifact-2", kind: "artifact", moduleId: "m2-control-flow", timestamp: 2 },
    ];
    const sheet = deriveStatSheet(snapshot(nodes), makeStatAwardMapFixture(), profile);
    expect(sheet.shipCount).toBe(2);
    expect(sheet.stats.find((s) => s.key === "SHIP")!.value).toBe(16);
  });

  it("jobMastery counts only pillar bosses, lit exactly on real completion", () => {
    const nodes: CompletedNode[] = [
      { nodeId: "boss-m1", kind: "boss", moduleId: "m1-variables", timestamp: 1 },
    ];
    const sheet = deriveStatSheet(snapshot(nodes), makeStatAwardMapFixture(), profile);
    // Fixture has 2 bossAward entries, only boss-m1 is pillar: true.
    expect(sheet.jobMastery.total).toBe(1);
    expect(sheet.jobMastery.earned).toBe(1);
    expect(sheet.jobMastery.stars[0]?.lit).toBe(true);
    expect(sheet.jobMastery.stars[0]?.pillarModuleId).toBe("m1-variables");
  });
});
