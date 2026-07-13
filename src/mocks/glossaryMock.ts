// glossaryMock.ts, L11 + CONTRACT 7: a working pure mock of deriveGlossary, and a fixture
// GlossaryView for building search/grouping/silhouettes/deep-link offline (L13).

import { COMPLETION_EMITTING_KINDS } from "../contracts";
import type { CurriculumBundle, GlossaryView, ProgressSnapshot } from "../contracts";
import { FIXTURE_BUNDLE } from "./curriculumFixture";
import { PHASE2_PROGRESS } from "./statSheetFixtures";

export function mockDeriveGlossary(progress: ProgressSnapshot, bundle: CurriculumBundle): GlossaryView {
  const emittingNodeIds = new Set(
    progress.completedNodes.filter((n) => n.kind !== "module" && n.kind !== "boss" && n.kind !== "artifact").map((n) => n.nodeId)
  );
  const completedModuleIds = new Set(progress.completedNodes.filter((n) => n.kind === "module").map((n) => n.moduleId));

  const entries = bundle.modules.flatMap((mod) =>
    mod.terms.map((term) => {
      const lesson = mod.lessons.find((l) => l.id === term.sourceLessonId);
      let unlocked = false;
      if (lesson) {
        const emittingSteps = lesson.steps.filter((s) => COMPLETION_EMITTING_KINDS.has(s.kind));
        unlocked =
          emittingSteps.length === 0
            ? completedModuleIds.has(term.sourceModuleId) // all-prose-lesson fallback (B16)
            : emittingSteps.every((s) => emittingNodeIds.has(s.id));
      }
      return { ...term, unlocked };
    })
  );

  return {
    discovered: entries.filter((e) => e.unlocked).length,
    total: entries.length,
    entries
  };
}

export const FIXTURE_GLOSSARY: GlossaryView = mockDeriveGlossary(PHASE2_PROGRESS, FIXTURE_BUNDLE);
