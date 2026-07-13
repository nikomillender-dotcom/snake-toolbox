// completionLogWriter (backend B6). Decides which step completions become a CompletedNode, and
// builds module / boss / artifact nodes. This is the WRITER half of the D4 shared rule:
// COMPLETION_EMITTING_KINDS (contracts.ts, part of CONTRACT 4) is imported here and by
// derive/deriveGlossary.ts (the READER half), so the two can never privately disagree about which
// step kinds count. Both call sites' constant identity is asserted in
// completionEmittingKinds.identity.test.ts.
//
// P8: `strand` is copied VERBATIM from Step.strand onto the emitted node whenever the authoring
// data provides one. If the writer skipped this, DEBUG/TESTS/READ would silently under-count in
// deriveStatSheet (byStrand). P9: statTags rides through untouched (advisory-only; no dimension
// folds it, see derive/deriveStatSheet.ts).
import type { CompletedNode, Step } from "../../contracts.js";
import { COMPLETION_EMITTING_KINDS } from "../../contracts.js";

export interface StepCompletionInput {
  step: Step;
  moduleId: string;
  timestamp: number;
}

/**
 * Pure decision: does this step emit a completion node, and if so, what does it carry?
 * Returns null for NON-emitting kinds (prose / liveExample / reflection, D4), which is the exact
 * same set deriveGlossary treats as non-emitting because both read COMPLETION_EMITTING_KINDS.
 */
export function buildStepCompletionNode(input: StepCompletionInput): CompletedNode | null {
  const { step, moduleId, timestamp } = input;
  if (!COMPLETION_EMITTING_KINDS.has(step.kind)) return null;

  const node: CompletedNode = {
    nodeId: step.id,
    kind: step.kind,
    moduleId,
    timestamp,
  };
  if (step.strand !== undefined) node.strand = step.strand; // P8: verbatim copy, never invented
  if (step.statTags !== undefined) node.statTags = step.statTags; // P9: advisory-only passthrough
  return node;
}

export function buildModuleCompletionNode(moduleId: string, timestamp: number): CompletedNode {
  return { nodeId: moduleId, kind: "module", moduleId, timestamp };
}

export function buildBossCompletionNode(
  bossId: string,
  moduleId: string,
  timestamp: number,
): CompletedNode {
  // P7: a boss node's nodeId IS the Boss.id, so deriveStatSheet's bossAward join (keyed by
  // bossId) lands correctly.
  return { nodeId: bossId, kind: "boss", moduleId, timestamp };
}

export function buildArtifactCompletionNode(
  artifactId: string,
  moduleId: string,
  timestamp: number,
): CompletedNode {
  return { nodeId: artifactId, kind: "artifact", moduleId, timestamp };
}
