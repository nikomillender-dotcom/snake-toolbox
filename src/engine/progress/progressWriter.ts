// progressWriter (backend B6 orchestration). Not part of the frozen contract block; this is
// Hubert's own composition of Store (CONTRACT 2) + ReviewScheduler (CONTRACT 6) + the pure
// completionLogWriter builders above. It is what the composition root (Edelgard) would wire a
// screen event ("lesson step graded pass") to.
//
// - Appends the CompletedNode to the `progress` collection's `completedNodes` log (the ONLY
//   source of truth for stats and the glossary, B6).
// - Calls ReviewScheduler.enroll(node, form) when a reviewable step (reviewable !== false) with an
//   authored reviewForm is first cleared, so the review pool grows only from real completions
//   (the honesty invariant, CONTRACT 6 comment).
import type { CompletedNode, ReviewScheduler, Step, Store } from "../../contracts.js";
import {
  buildArtifactCompletionNode,
  buildBossCompletionNode,
  buildModuleCompletionNode,
  buildStepCompletionNode,
} from "./completionLogWriter.js";

export const PROGRESS_COLLECTION = "progress";
export const COMPLETED_NODES_KEY = "completedNodes";

export interface ProgressWriter {
  recordStep(step: Step, moduleId: string, now: number): Promise<CompletedNode | null>;
  recordModule(moduleId: string, now: number): Promise<CompletedNode>;
  recordBoss(bossId: string, moduleId: string, now: number): Promise<CompletedNode>;
  recordArtifact(artifactId: string, moduleId: string, now: number): Promise<CompletedNode>;
  readLog(): Promise<CompletedNode[]>;
}

export function createProgressWriter(store: Store, scheduler: ReviewScheduler): ProgressWriter {
  async function appendNode(node: CompletedNode): Promise<void> {
    const existing = (await store.get<CompletedNode[]>(PROGRESS_COLLECTION, COMPLETED_NODES_KEY)) ?? [];
    existing.push(node);
    await store.put(PROGRESS_COLLECTION, COMPLETED_NODES_KEY, existing);
  }

  return {
    async recordStep(step, moduleId, now) {
      const node = buildStepCompletionNode({ step, moduleId, timestamp: now });
      if (!node) return null;
      await appendNode(node);
      if (step.reviewable !== false && step.reviewForm) {
        await scheduler.enroll(node, step.reviewForm);
      }
      return node;
    },
    async recordModule(moduleId, now) {
      const node = buildModuleCompletionNode(moduleId, now);
      await appendNode(node);
      return node;
    },
    async recordBoss(bossId, moduleId, now) {
      const node = buildBossCompletionNode(bossId, moduleId, now);
      await appendNode(node);
      return node;
    },
    async recordArtifact(artifactId, moduleId, now) {
      const node = buildArtifactCompletionNode(artifactId, moduleId, now);
      await appendNode(node);
      return node;
    },
    async readLog() {
      return (await store.get<CompletedNode[]>(PROGRESS_COLLECTION, COMPLETED_NODES_KEY)) ?? [];
    },
  };
}
