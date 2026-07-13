// StepNav: a persistent Back/Next affordance for lesson steps.
//
// Manager fix round, bug 2 (non-graded steps had no forward navigation): the ONLY Next in the
// whole player used to live inside CheckResult, which only ever renders after a graded Check. A
// prose/liveExample/reflection step carries no Check at all, so there was literally no way to
// move past one. This bar is always mounted (persistent) across every step kind.
//
// Back is offered on every step, including graded ones: a learner should always be able to look
// back at what they just did or said.
//
// Next is offered here ONLY when the caller says `canGoNext` is true. LessonPlayer computes that
// as: the current step is non-graded (route "none": prose/liveExample/reflection), OR the current
// step is a graded step that is ALREADY complete (present in completedNodes). That second half is
// what lets a learner who backs into an already-cleared graded step move forward past it again
// without re-passing Check (nothing here re-grades or re-emits; CONTRACT 5's dedupe-by-nodeId
// already makes a second genuine pass idempotent, and this path never re-triggers one). An
// un-passed graded step never satisfies either half, so this can never be used as a skip path
// around Check; Check still gates Next via CheckResult exactly as before for that case.
//
// Manager fix round, bug 3 (Next was a silent no-op on the last step): on the lesson's final step
// this becomes the lesson-complete action, relabeled honestly. The caller's `onNext` handler
// decides what that actually does (LearnScreen.goNext routes to the module screen when there is no
// next step); this component only swaps the label.

export interface StepNavProps {
  canGoBack: boolean;
  canGoNext: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function StepNav({ canGoBack, canGoNext, isLastStep, onBack, onNext }: StepNavProps) {
  return (
    <div class="step-nav">
      <button type="button" class="btn btn-ghost btn-small" onClick={onBack} disabled={!canGoBack}>
        &lt;- Back
      </button>
      <div class="spacer" />
      {canGoNext && (
        <button type="button" class="btn btn-primary btn-small" onClick={onNext}>
          {isLastStep ? "Finish lesson" : "Next ->"}
        </button>
      )}
    </div>
  );
}
