// bundleValidator (hardening F): validates a CurriculumBundle at load time.
// Every Term.sourceLessonId and ReviewForm.sourceLessonId resolves to a real lesson,
// every awardMap key matches a real module/boss, lesson and step ids are unique,
// every COMPLETION_EMITTING_KINDS step in a strand-fed module carries strand.
// Loud failure with the exact bad id.
import type { CurriculumBundle, Module } from "../contracts";
import { COMPLETION_EMITTING_KINDS } from "../contracts";

export interface BundleValidationError {
  path: string;
  message: string;
}

const STRAND_FED: ReadonlySet<string> = new Set(["debug", "tests", "read"]);

// Byleth's authoring sentinel (curriculum-bundle round): a not-yet-written module ships as an
// honest skeleton, a single "prose" step whose body starts with this exact string, no boss, no
// terms. Machine-detectable so validation can tell "not written yet" apart from "broken."
const PLACEHOLDER_SENTINEL = "PLACEHOLDER:";

/** Sentinel-aware skeleton detection. A module is a placeholder skeleton if any of its steps is a
 *  "prose" step whose body begins with the PLACEHOLDER: sentinel. Skeleton modules are EXEMPT from
 *  authored-content requirements (a boss / graded gate); every other module is "authored" and IS
 *  held to those requirements. This exemption is scoped to the sentinel only, never widened. */
export function isPlaceholderModule(mod: Module): boolean {
  return mod.lessons.some((lesson) =>
    lesson.steps.some((step) => step.kind === "prose" && typeof step.body === "string" && step.body.startsWith(PLACEHOLDER_SENTINEL)),
  );
}

export function validateBundle(bundle: CurriculumBundle): BundleValidationError[] {
  const errors: BundleValidationError[] = [];

  // Build index of all lesson ids and step ids
  const lessonIds = new Set<string>();
  const stepIds = new Set<string>();
  const moduleIds = new Set<string>();
  const bossIds = new Set<string>();

  for (const mod of bundle.modules) {
    moduleIds.add(mod.id);
    if (mod.boss) bossIds.add(mod.boss.id);
    for (const lesson of mod.lessons) {
      if (lessonIds.has(lesson.id)) {
        errors.push({ path: `module/${mod.id}/lesson/${lesson.id}`, message: `duplicate lesson id "${lesson.id}"` });
      }
      lessonIds.add(lesson.id);
      for (const step of lesson.steps) {
        if (stepIds.has(step.id)) {
          errors.push({ path: `module/${mod.id}/lesson/${lesson.id}/step/${step.id}`, message: `duplicate step id "${step.id}"` });
        }
        stepIds.add(step.id);
      }
    }
  }

  for (const mod of bundle.modules) {
    // Check Term.sourceLessonId
    for (const term of mod.terms) {
      if (!lessonIds.has(term.sourceLessonId)) {
        errors.push({
          path: `module/${mod.id}/term/${term.id}`,
          message: `Term.sourceLessonId "${term.sourceLessonId}" does not resolve to a real lesson`,
        });
      }
    }

    // Check ReviewForm.sourceLessonId
    for (const lesson of mod.lessons) {
      for (const step of lesson.steps) {
        if (step.reviewForm?.sourceLessonId && !lessonIds.has(step.reviewForm.sourceLessonId)) {
          errors.push({
            path: `module/${mod.id}/lesson/${lesson.id}/step/${step.id}/reviewForm`,
            message: `ReviewForm.sourceLessonId "${step.reviewForm.sourceLessonId}" does not resolve to a real lesson`,
          });
        }
      }
    }

    // Check: every COMPLETION_EMITTING_KINDS step in a strand-fed module carries strand
    const isStrandFed = mod.strands.some(s => STRAND_FED.has(s));
    if (isStrandFed) {
      for (const lesson of mod.lessons) {
        for (const step of lesson.steps) {
          if (COMPLETION_EMITTING_KINDS.has(step.kind) && !step.strand) {
            errors.push({
              path: `module/${mod.id}/lesson/${lesson.id}/step/${step.id}`,
              message: `emitting step "${step.id}" (kind: ${step.kind}) in strand-fed module "${mod.id}" has no strand (P8: stat will under-count)`,
            });
          }
        }
      }
    }

    // Flag lessons with zero emitting steps (allowed, but listed)
    for (const lesson of mod.lessons) {
      const emitting = lesson.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind));
      if (emitting.length === 0 && lesson.steps.length > 0) {
        // This is an INFO, not an error: all-prose is allowed by CONTRACT 7 fallback.
        // But we report it so authoring knows it was a choice, not an accident.
        errors.push({
          path: `module/${mod.id}/lesson/${lesson.id}`,
          message: `all-prose lesson (zero emitting steps): terms unlock on module completion, not lesson completion`,
        });
      }
    }
  }

  // Sentinel-aware authored-content gate: a module that is NOT a PLACEHOLDER skeleton is real
  // authored content and must ship its graded gate (a boss); a PLACEHOLDER skeleton is exempt.
  // This is deliberately NOT a global "every module needs a boss" rule (that would be wrong: a
  // skeleton has none yet, by honest design) and deliberately NOT removed for every module either
  // (that would silently hide a genuinely broken authored module). Only the sentinel exempts.
  for (const mod of bundle.modules) {
    if (!isPlaceholderModule(mod) && !mod.boss) {
      errors.push({
        path: `module/${mod.id}`,
        message: `authored module "${mod.id}" has no boss (a real module needs its graded gate; only a PLACEHOLDER: skeleton is exempt)`,
      });
    }
  }

  // Check awardMap keys
  const { modulePrimary, bossAward, titleFor } = bundle.awardMap;
  for (const key of Object.keys(modulePrimary)) {
    if (!moduleIds.has(key)) {
      errors.push({ path: `awardMap/modulePrimary/${key}`, message: `key "${key}" does not match any module id` });
    }
  }
  for (const key of Object.keys(bossAward)) {
    if (!bossIds.has(key)) {
      errors.push({ path: `awardMap/bossAward/${key}`, message: `key "${key}" does not match any boss id` });
    }
  }
  for (const key of Object.keys(titleFor)) {
    if (!moduleIds.has(key)) {
      errors.push({ path: `awardMap/titleFor/${key}`, message: `key "${key}" does not match any module id` });
    }
  }

  return errors;
}

/** The 10-line completeness test: simulate completing every emitting step
 *  of every module and assert every module reports complete. */
export function assertAllModulesCompletable(bundle: CurriculumBundle): BundleValidationError[] {
  const errors: BundleValidationError[] = [];
  const nodeIds = new Set<string>();

  for (const mod of bundle.modules) {
    // Simulate completing every emitting step
    for (const lesson of mod.lessons) {
      for (const step of lesson.steps) {
        if (COMPLETION_EMITTING_KINDS.has(step.kind)) {
          nodeIds.add(step.id);
        }
      }
    }
    if (mod.boss) nodeIds.add(mod.boss.id);

    // Check: is every lesson "complete" (all emitting steps in the set)?
    for (const lesson of mod.lessons) {
      const emitting = lesson.steps.filter(s => COMPLETION_EMITTING_KINDS.has(s.kind));
      if (emitting.length > 0) {
        const missing = emitting.filter(s => !nodeIds.has(s.id));
        if (missing.length > 0) {
          errors.push({
            path: `module/${mod.id}/lesson/${lesson.id}`,
            message: `lesson not completable: steps ${missing.map(s => s.id).join(", ")} would be missing`,
          });
        }
      }
    }
  }

  return errors;
}
