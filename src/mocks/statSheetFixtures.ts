// statSheetFixtures.ts, L11: "Mock deriveStatSheet with fixture StatSheets across all four phases
// (to build the four sprite tiers, the promotion cutscene via a phase change, and the calm
// up-arrow via a changedSince)."

import type { CompletedNode, ProfileFacts, ProgressSnapshot } from "../contracts";
import { FIXTURE_AWARD_MAP } from "./curriculumFixture";
import { mockDeriveStatSheet } from "./deriveStatSheetMock";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function node(partial: Partial<CompletedNode> & Pick<CompletedNode, "nodeId" | "kind" | "moduleId" | "timestamp">): CompletedNode {
  return partial as CompletedNode;
}

// Phase 1 progress: matches the approved mockup (stats.html) closely, level 3, Apprentice,
// SYNTAX up-arrow live (last visit was before today's fillBlank practice).
export const PHASE1_PROGRESS: ProgressSnapshot = {
  completedNodes: [
    node({ nodeId: "m01-l1-s2", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: now - 20 * DAY }),
    node({ nodeId: "m01", kind: "module", moduleId: "m01", timestamp: now - 20 * DAY }),
    node({ nodeId: "m02-l1-s1", kind: "predictOutput", moduleId: "m02", strand: "core", timestamp: now - 15 * DAY }),
    node({ nodeId: "m02", kind: "module", moduleId: "m02", timestamp: now - 15 * DAY }),
    node({ nodeId: "m03-l1-s1", kind: "fixBug", moduleId: "m03", strand: "debug", timestamp: now - 2 * DAY }),
    node({ nodeId: "m03", kind: "module", moduleId: "m03", timestamp: now - 2 * DAY }),
    // a fresh syntax rep since last visit, to light the calm up-arrow (P10)
    node({ nodeId: "m01-l1-s2-review", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: now - 1000 })
  ]
};

// Phase 2 progress: one pillar boss cleared (PCEP title, seal minted), a shipped artifact.
export const PHASE2_PROGRESS: ProgressSnapshot = {
  completedNodes: [
    ...PHASE1_PROGRESS.completedNodes,
    node({ nodeId: "boss-m03", kind: "boss", moduleId: "m03", timestamp: now - 25 * DAY }),
    node({ nodeId: "m06-l1-s1", kind: "writeStub", moduleId: "m06", strand: "design", timestamp: now - 10 * DAY }),
    node({ nodeId: "m06", kind: "module", moduleId: "m06", timestamp: now - 10 * DAY }),
    node({ nodeId: "artifact-m06", kind: "artifact", moduleId: "m06", timestamp: now - 9 * DAY })
  ]
};

// Phase 3 progress: two pillar bosses (PCEP + PCAP titles), two ships.
export const PHASE3_PROGRESS: ProgressSnapshot = {
  completedNodes: [
    ...PHASE2_PROGRESS.completedNodes,
    node({ nodeId: "boss-m06", kind: "boss", moduleId: "m06", timestamp: now - 8 * DAY }),
    node({ nodeId: "m09-l1-s1", kind: "traceTable", moduleId: "m09", strand: "tests", timestamp: now - 4 * DAY }),
    node({ nodeId: "m09", kind: "module", moduleId: "m09", timestamp: now - 4 * DAY }),
    node({ nodeId: "artifact-m09", kind: "artifact", moduleId: "m09", timestamp: now - 3 * DAY })
  ]
};

// Phase 4: all three pillar bosses lit, three ships, and the phase-4 module cleared (the level
// bump that actually crosses the phase-4 threshold; phase is level-derived, never a separate flag).
export const PHASE4_PROGRESS: ProgressSnapshot = {
  completedNodes: [
    ...PHASE3_PROGRESS.completedNodes,
    node({ nodeId: "boss-m09", kind: "boss", moduleId: "m09", timestamp: now - 1 * DAY }),
    node({ nodeId: "artifact-final", kind: "artifact", moduleId: "m09", timestamp: now - 12 * 60 * 60 * 1000 }),
    node({ nodeId: "m12-l1-s1", kind: "writeStub", moduleId: "m12", strand: "ship", timestamp: now - 6 * 60 * 60 * 1000 }),
    node({ nodeId: "m12", kind: "module", moduleId: "m12", timestamp: now - 6 * 60 * 60 * 1000 })
  ]
};

export const FIXTURE_PROFILE: ProfileFacts = {
  name: "Niko",
  epithet: "the coder",
  lastViewedAt: now - 30 * 60 * 1000 // 30 minutes ago, so today's fresh rep shows as "up"
};

export const FIXTURE_STAT_SHEETS = {
  1: mockDeriveStatSheet(PHASE1_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE),
  2: mockDeriveStatSheet(PHASE2_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE),
  3: mockDeriveStatSheet(PHASE3_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE),
  4: mockDeriveStatSheet(PHASE4_PROGRESS, FIXTURE_AWARD_MAP, FIXTURE_PROFILE)
} as const;
