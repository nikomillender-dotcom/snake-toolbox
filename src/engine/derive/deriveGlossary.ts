// deriveGlossary (CONTRACT 7, backend B16). PURE fold over (progress, bundle). No I/O, no stored
// output, memoized in memory only at the call site, same discipline as deriveStatSheet.
//
// D4: "lesson complete" reads the SAME COMPLETION_EMITTING_KINDS constant the completion-log
// writer (progress/completionLogWriter.ts) reads, both imported from contracts.ts, so a term can
// never silently never-unlock or unlock early from a writer/reader disagreement. See
// contractConformance.test.ts and derive/completionEmittingKinds.identity.test.ts for the proof
// that both call sites hold the literal same reference.
import type { CurriculumBundle, GlossaryView, ProgressSnapshot, Term } from "../../contracts.js";
import { COMPLETION_EMITTING_KINDS } from "../../contracts.js";

export function deriveGlossary(progress: ProgressSnapshot, bundle: CurriculumBundle): GlossaryView {
  const completedNodeIds = new Set(progress.completedNodes.map((n) => n.nodeId));
  const completedModuleIds = new Set(
    progress.completedNodes.filter((n) => n.kind === "module").map((n) => n.moduleId),
  );

  const entries: Array<Term & { unlocked: boolean }> = [];

  for (const module of bundle.modules) {
    for (const term of module.terms) {
      const lesson = module.lessons.find((l) => l.id === term.sourceLessonId);
      let unlocked: boolean;

      if (!lesson) {
        // Authoring defect: sourceLessonId does not resolve to a real lesson in its own module.
        // Never fabricate an unlock for a term the fold cannot place; treat as locked. Byleth's
        // authoring obligation (B16) is to keep this resolvable; a fixture test should catch it
        // upstream of shipping content.
        unlocked = false;
      } else {
        const emittingSteps = lesson.steps.filter((s) => COMPLETION_EMITTING_KINDS.has(s.kind));
        if (emittingSteps.length === 0) {
          // All-prose lesson (D4/B16 fallback): unlock on the parent MODULE's completion instead.
          unlocked = completedModuleIds.has(term.sourceModuleId);
        } else {
          // Mixed-kind lesson: every completion-emitting step (matched by Step.id) must be logged.
          unlocked = emittingSteps.every((s) => completedNodeIds.has(s.id));
        }
      }

      entries.push({ ...term, unlocked });
    }
  }

  const discovered = entries.filter((e) => e.unlocked).length;
  return { discovered, total: entries.length, entries };
}
