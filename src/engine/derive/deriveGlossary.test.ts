import { describe, expect, it } from "vitest";
import type { CompletedNode, ProgressSnapshot } from "../../contracts.js";
import { makeCurriculumBundleFixture } from "../fixtures/curriculumBundle.fixture.js";
import { deriveGlossary } from "./deriveGlossary.js";

function snapshot(nodes: CompletedNode[]): ProgressSnapshot {
  return { completedNodes: nodes };
}

describe("deriveGlossary", () => {
  it("reports total across all modules' terms", () => {
    const view = deriveGlossary(snapshot([]), makeCurriculumBundleFixture());
    // m1-variables: term-variable, term-assignment. m2-control-flow: term-branch.
    expect(view.total).toBe(3);
    expect(view.discovered).toBe(0);
    expect(view.entries.every((e) => e.unlocked === false)).toBe(true);
  });

  it("MIXED-KIND lesson: unlocks only when every completion-emitting step is logged (D4)", () => {
    const onlyOneStep: CompletedNode[] = [
      { nodeId: "step-practice-mcq", kind: "mcq", moduleId: "m1-variables", timestamp: 1 },
    ];
    const partial = deriveGlossary(snapshot(onlyOneStep), makeCurriculumBundleFixture());
    const variableTerm = partial.entries.find((e) => e.id === "term-variable")!;
    expect(variableTerm.unlocked).toBe(false); // step-practice-fill still missing

    const bothSteps: CompletedNode[] = [
      { nodeId: "step-practice-mcq", kind: "mcq", moduleId: "m1-variables", timestamp: 1 },
      { nodeId: "step-practice-fill", kind: "fillBlank", moduleId: "m1-variables", timestamp: 2 },
    ];
    const complete = deriveGlossary(snapshot(bothSteps), makeCurriculumBundleFixture());
    const variableTermComplete = complete.entries.find((e) => e.id === "term-variable")!;
    expect(variableTermComplete.unlocked).toBe(true);
  });

  it("ALL-PROSE lesson: unlocks its term on the parent MODULE's completion, not the lesson (D4/B16 fallback)", () => {
    // lesson-intro has only a "prose" step (non-emitting); term-assignment lives there.
    const stepAlone: CompletedNode[] = [
      // Even if somehow a node existed with the prose step's id, it should never be emitted by
      // the writer in the first place; the fallback here proves the READ side does not depend on
      // it either. The lesson only unlocks via the module node.
    ];
    const beforeModule = deriveGlossary(snapshot(stepAlone), makeCurriculumBundleFixture());
    expect(beforeModule.entries.find((e) => e.id === "term-assignment")!.unlocked).toBe(false);

    const moduleComplete: CompletedNode[] = [
      { nodeId: "m1-variables", kind: "module", moduleId: "m1-variables", timestamp: 5 },
    ];
    const afterModule = deriveGlossary(snapshot(moduleComplete), makeCurriculumBundleFixture());
    expect(afterModule.entries.find((e) => e.id === "term-assignment")!.unlocked).toBe(true);
    // The mixed-kind lesson's term must NOT unlock from module completion alone (no fallback for
    // lessons that already have a determinate emitting-step set).
    expect(afterModule.entries.find((e) => e.id === "term-variable")!.unlocked).toBe(false);
  });

  it("is deterministic and stored nowhere: same inputs, same output, called twice", () => {
    const bundle = makeCurriculumBundleFixture();
    const nodes: CompletedNode[] = [
      { nodeId: "step-practice-mcq", kind: "mcq", moduleId: "m1-variables", timestamp: 1 },
      { nodeId: "step-practice-fill", kind: "fillBlank", moduleId: "m1-variables", timestamp: 2 },
    ];
    const a = deriveGlossary(snapshot(nodes), bundle);
    const b = deriveGlossary(snapshot([...nodes]), bundle);
    expect(a).toEqual(b);
  });
});
