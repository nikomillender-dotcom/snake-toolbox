// deriveStatSheetMock.ts, L11: a working PURE mock of CONTRACT 5's deriveStatSheet/detectPromotion.
//
// The contract declares these as pure functions the ENGINE provides (Hubert, backend-spec.md).
// Lysithea never computes stats for real; this mock exists so the Stat Screen has a real fold to
// render against offline (not just a single frozen fixture object), mirroring the documented
// semantics (sum award-map contributions over completedNodes, memoized in memory only, no I/O).
// At integration, the composition root swaps this for the real engine binding with no screen
// rewrite, per the CONTRACT 5 pure-derived discipline.

import type {
  CompletedNode,
  PhaseId,
  ProfileFacts,
  ProgressSnapshot,
  StatAwardMap,
  StatKey,
  StatSheet,
  StatValue,
  StepKind
} from "../contracts";

const STAT_KEYS: StatKey[] = ["SYNTAX", "DEBUG", "TESTS", "READ", "DESIGN", "SHIP"];

function emptyTotals(): Record<StatKey, number> {
  return { SYNTAX: 0, DEBUG: 0, TESTS: 0, READ: 0, DESIGN: 0, SHIP: 0 };
}

function foldTotals(nodes: CompletedNode[], awardMap: StatAwardMap): Record<StatKey, number> {
  const totals = emptyTotals();
  for (const node of nodes) {
    if (node.kind === "module") {
      const mp = awardMap.modulePrimary[node.moduleId];
      if (mp) totals[mp.stat] += mp.bump;
      continue;
    }
    if (node.kind === "boss") {
      const ba = awardMap.bossAward[node.nodeId];
      if (ba) totals[ba.stat] += ba.bump;
      continue;
    }
    if (node.kind === "artifact") {
      totals.SHIP += awardMap.shipAward;
      continue;
    }
    const byKind = awardMap.byKind[node.kind as StepKind];
    if (byKind) {
      for (const key of STAT_KEYS) {
        const bump = byKind[key];
        if (bump) totals[key] += bump;
      }
    }
    if (node.strand) {
      const byStrand = awardMap.byStrand[node.strand];
      if (byStrand) {
        for (const key of STAT_KEYS) {
          const bump = byStrand[key];
          if (bump) totals[key] += bump;
        }
      }
    }
  }
  return totals;
}

function capped(totals: Record<StatKey, number>, awardMap: StatAwardMap): StatValue[] {
  return STAT_KEYS.map((key) => ({
    key,
    value: key === "SHIP" ? totals[key] : Math.min(totals[key], awardMap.statMax[key]),
    max: awardMap.statMax[key]
  }));
}

function derivePhase(level: number, awardMap: StatAwardMap): PhaseId {
  const phases = (Object.keys(awardMap.phaseThresholds) as unknown as string[])
    .map((k) => Number(k) as PhaseId)
    .sort((a, b) => a - b);
  let best: PhaseId = phases[0] ?? 1;
  for (const p of phases) {
    if (awardMap.phaseThresholds[p] <= level) best = p;
  }
  return best;
}

export function mockDeriveStatSheet(
  progress: ProgressSnapshot,
  awardMap: StatAwardMap,
  profile: ProfileFacts
): StatSheet {
  const nodes = progress.completedNodes;
  const level = nodes.filter((n) => n.kind === "module").length;
  const phase = derivePhase(level, awardMap);
  const cls = awardMap.classByPhase[phase];

  const totals = foldTotals(nodes, awardMap);
  const stats = capped(totals, awardMap);

  const bossNodes = nodes.filter((n): n is CompletedNode & { kind: "boss" } => n.kind === "boss");
  const pillarEntries = Object.entries(awardMap.bossAward).filter(([, v]) => v.pillar);
  const jobStars = pillarEntries.map(([bossId, v]) => ({
    pillarModuleId: bossId,
    lit: bossNodes.some((n) => n.nodeId === bossId),
    label: v.seal.label
  }));

  const moduleNodes = nodes.filter((n) => n.kind === "module");
  const titles = moduleNodes
    .map((n) => {
      const t = awardMap.titleFor[n.moduleId];
      return t ? { ...t, earnedAt: n.timestamp } : undefined;
    })
    .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const seals = bossNodes
    .map((n) => {
      const ba = awardMap.bossAward[n.nodeId];
      return ba ? { ...ba.seal, mintedAt: n.timestamp } : undefined;
    })
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const shipCount = nodes.filter((n) => n.kind === "artifact").length;

  const before = nodes.filter((n) => n.timestamp <= profile.lastViewedAt);
  const beforeTotals = capped(foldTotals(before, awardMap), awardMap);
  const changedSince = STAT_KEYS.filter((key) => {
    const now = stats.find((s) => s.key === key)?.value ?? 0;
    const prior = beforeTotals.find((s) => s.key === key)?.value ?? 0;
    return now > prior;
  });

  return {
    characterName: profile.name,
    characterEpithet: profile.epithet,
    level,
    phase,
    className: cls?.className ?? "Apprentice",
    spriteTier: cls?.spriteTier ?? 1,
    jobMastery: { earned: jobStars.filter((s) => s.lit).length, total: jobStars.length, stars: jobStars },
    titles,
    stats,
    seals,
    shipCount,
    changedSince
  };
}

export function mockDetectPromotion(prevPhase: PhaseId, nextPhase: PhaseId): { promoted: boolean; from: PhaseId; to: PhaseId } {
  return { promoted: nextPhase > prevPhase, from: prevPhase, to: nextPhase };
}
