// deriveStatSheet (CONTRACT 5, backend B9). PURE fold over ProgressSnapshot.completedNodes using
// StatAwardMap. No I/O, no stored output; memoize in memory only at the call site (composition
// root, Edelgard's job). Deterministic: identical inputs always yield an identical StatSheet.
//
// Design notes (documented per B9, not contract deviations, since no type changed):
// - jobMastery.stars: awardMap.bossAward has no direct bossId -> moduleId mapping, and
//   deriveStatSheet's typed inputs carry no CurriculumBundle. Seal.moduleId is OPTIONAL
//   (CONTRACT 5), so a pillar boss's JobStar.pillarModuleId is read from
//   awardMap.bossAward[bossId].seal.moduleId when Byleth authors it, falling back to the bossId
//   itself if not (documented assumption; flagged as an open question for Edelgard/Byleth in
//   BUILD-REPORT.md).
// - Seal.mintedAt / Title.earnedAt in the authored StatAwardMap are curriculum-wide placeholders
//   (the same map serves every player). The REAL per-player mint/earn time is the matching
//   CompletedNode.timestamp, so the emitted Seal/Title overrides mintedAt/earnedAt with that
//   observed timestamp. This keeps the honesty invariant: a stat sheet never shows a date the
//   player did not actually reach that moment.
import type {
  CompletedNode,
  JobStar,
  PhaseId,
  ProfileFacts,
  ProgressSnapshot,
  Seal,
  StatAwardMap,
  StatKey,
  StatSheet,
  StatValue,
  Title,
} from "../../contracts.js";

const STAT_KEYS: readonly StatKey[] = ["SYNTAX", "DEBUG", "TESTS", "READ", "DESIGN", "SHIP"] as const;
const PHASE_IDS: readonly PhaseId[] = [1, 2, 3, 4] as const;

function emptyTotals(): Record<StatKey, number> {
  return { SYNTAX: 0, DEBUG: 0, TESTS: 0, READ: 0, DESIGN: 0, SHIP: 0 };
}

function derivePhase(level: number, thresholds: Record<PhaseId, number>): PhaseId {
  // P2: phase = the highest PhaseId whose phaseThresholds[phase] <= level. No magic 10/20/30.
  let result: PhaseId = 1;
  for (const p of PHASE_IDS) {
    if (thresholds[p] <= level) result = p;
  }
  return result;
}

export function deriveStatSheet(
  progress: ProgressSnapshot,
  awardMap: StatAwardMap,
  profile: ProfileFacts,
): StatSheet {
  const totals = emptyTotals();
  const sinceLastView = emptyTotals();

  const titles: Title[] = [];
  const sealsByBossId = new Map<string, Seal>();
  const earnedBossIds = new Set<string>();
  let level = 0;
  let shipCount = 0;

  const bump = (key: StatKey, amount: number, isNew: boolean): void => {
    totals[key] += amount;
    if (isNew) sinceLastView[key] += amount;
  };

  // byKind is Partial<Record<StepKind, ...>>; a CompletedNode.kind can also be "module" | "boss" |
  // "artifact", which are never StepKind keys of byKind, so index through a deliberately widened
  // view (a plain lookup that is safely undefined for those three kinds, never a runtime error).
  const byKindLookup = awardMap.byKind as Partial<Record<string, Partial<Record<StatKey, number>>>>;

  for (const node of progress.completedNodes) {
    const isNew = node.timestamp > profile.lastViewedAt;

    const kindAwards = byKindLookup[node.kind];
    if (kindAwards) {
      for (const key of STAT_KEYS) {
        const amt = kindAwards[key];
        if (amt) bump(key, amt, isNew);
      }
    }

    // P8: byStrand only fires when the writer stamped `strand` on the node.
    if (node.strand) {
      const strandAwards = awardMap.byStrand[node.strand];
      if (strandAwards) {
        for (const key of STAT_KEYS) {
          const amt = strandAwards[key];
          if (amt) bump(key, amt, isNew);
        }
      }
    }

    if (node.kind === "module") {
      level += 1;
      // P7: modulePrimary and titleFor are keyed by moduleId, joined on CompletedNode.moduleId.
      const primary = awardMap.modulePrimary[node.moduleId];
      if (primary) bump(primary.stat, primary.bump, isNew);
      const title = awardMap.titleFor[node.moduleId];
      if (title) titles.push({ ...title, earnedAt: node.timestamp });
    }

    if (node.kind === "boss") {
      // P7: bossAward is keyed by bossId, joined on CompletedNode.nodeId (nodeId === Boss.id).
      const award = awardMap.bossAward[node.nodeId];
      if (award) {
        bump(award.stat, award.bump, isNew);
        earnedBossIds.add(node.nodeId);
        sealsByBossId.set(node.nodeId, { ...award.seal, mintedAt: node.timestamp });
      }
    }

    if (node.kind === "artifact") {
      shipCount += 1;
      bump("SHIP", awardMap.shipAward, isNew);
    }

    // P9: statTags is advisory-only in v1. Deliberately NOT folded here (no dimension consumes
    // it). A future dimension that reads it is a contract change (route through the Manager).
  }

  const stats: StatValue[] = STAT_KEYS.map((key) => ({
    key,
    value: Math.min(totals[key], awardMap.statMax[key]),
    max: awardMap.statMax[key],
  }));

  const changedSince = STAT_KEYS.filter((key) => sinceLastView[key] > 0);

  const phase = derivePhase(level, awardMap.phaseThresholds);
  const classInfo = awardMap.classByPhase[phase];

  const pillarEntries = Object.entries(awardMap.bossAward).filter(([, award]) => award.pillar);
  const stars: JobStar[] = pillarEntries.map(([bossId, award]) => ({
    pillarModuleId: award.seal.moduleId ?? bossId,
    lit: earnedBossIds.has(bossId),
    label: award.seal.label,
  }));

  return {
    characterName: profile.name,
    characterEpithet: profile.epithet,
    level,
    phase,
    className: classInfo.className,
    spriteTier: classInfo.spriteTier,
    jobMastery: {
      earned: stars.filter((s) => s.lit).length,
      total: stars.length,
      stars,
    },
    titles,
    stats,
    seals: Array.from(sealsByBossId.values()),
    shipCount,
    changedSince,
  };
}
