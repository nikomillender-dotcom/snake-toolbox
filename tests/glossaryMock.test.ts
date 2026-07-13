import { describe, expect, it } from "vitest";
import { mockDeriveGlossary } from "../src/mocks/glossaryMock";
import { FIXTURE_BUNDLE } from "../src/mocks/curriculumFixture";
import type { ProgressSnapshot } from "../src/contracts";

describe("mockDeriveGlossary (CONTRACT 7 pure-fold semantics)", () => {
  it("a term is locked when its home lesson's completion-emitting steps are not all done", () => {
    const progress: ProgressSnapshot = { completedNodes: [] };
    const view = mockDeriveGlossary(progress, FIXTURE_BUNDLE);
    expect(view.discovered).toBe(0);
    expect(view.entries.every((e) => !e.unlocked)).toBe(true);
  });

  it("a term unlocks once every completion-emitting step of its home lesson is in the log", () => {
    const progress: ProgressSnapshot = {
      completedNodes: [{ nodeId: "m01-l1-s2", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: Date.now() }]
      // NOTE: m01-l1 also has step m01-l1-s3 (mcq); leaving it out should keep the lesson incomplete
    };
    const view = mockDeriveGlossary(progress, FIXTURE_BUNDLE);
    const term = view.entries.find((e) => e.id === "t-var");
    expect(term?.unlocked).toBe(false); // lesson not fully done yet (s3 missing)
  });

  it("unlocks fully once ALL completion-emitting steps of the lesson are done", () => {
    const progress: ProgressSnapshot = {
      completedNodes: [
        { nodeId: "m01-l1-s2", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: Date.now() },
        { nodeId: "m01-l1-s3", kind: "mcq", moduleId: "m01", strand: "core", timestamp: Date.now() }
      ]
    };
    const view = mockDeriveGlossary(progress, FIXTURE_BUNDLE);
    const term = view.entries.find((e) => e.id === "t-var");
    expect(term?.unlocked).toBe(true);
  });

  it("is a pure fold: same inputs yield the same output on repeat calls", () => {
    const progress: ProgressSnapshot = { completedNodes: [{ nodeId: "m01-l1-s2", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: 1 }] };
    const a = mockDeriveGlossary(progress, FIXTURE_BUNDLE);
    const b = mockDeriveGlossary(progress, FIXTURE_BUNDLE);
    expect(a).toEqual(b);
  });

  it("total always equals the sum of every module's authored terms", () => {
    const totalTerms = FIXTURE_BUNDLE.modules.reduce((sum, m) => sum + m.terms.length, 0);
    const view = mockDeriveGlossary({ completedNodes: [] }, FIXTURE_BUNDLE);
    expect(view.total).toBe(totalTerms);
  });

  it("discovered never exceeds total, and equals the count of unlocked entries", () => {
    const progress: ProgressSnapshot = {
      completedNodes: [
        { nodeId: "m01-l1-s2", kind: "fillBlank", moduleId: "m01", strand: "core", timestamp: 1 },
        { nodeId: "m01-l1-s3", kind: "mcq", moduleId: "m01", strand: "core", timestamp: 1 },
        { nodeId: "m02", kind: "module", moduleId: "m02", timestamp: 1 }
      ]
    };
    const view = mockDeriveGlossary(progress, FIXTURE_BUNDLE);
    expect(view.discovered).toBeLessThanOrEqual(view.total);
    expect(view.discovered).toBe(view.entries.filter((e) => e.unlocked).length);
  });

  it("D4/B16: an ALL-PROSE lesson's term stays locked until the parent MODULE completes, not before", () => {
    // m02-l2 (t-loop's home lesson) has no completion-emitting step at all.
    const noModuleYet: ProgressSnapshot = { completedNodes: [{ nodeId: "m02-l1-s1", kind: "predictOutput", moduleId: "m02", strand: "core", timestamp: 1 }] };
    const view1 = mockDeriveGlossary(noModuleYet, FIXTURE_BUNDLE);
    expect(view1.entries.find((e) => e.id === "t-loop")?.unlocked).toBe(false);

    const moduleComplete: ProgressSnapshot = { completedNodes: [...noModuleYet.completedNodes, { nodeId: "m02", kind: "module", moduleId: "m02", timestamp: 2 }] };
    const view2 = mockDeriveGlossary(moduleComplete, FIXTURE_BUNDLE);
    expect(view2.entries.find((e) => e.id === "t-loop")?.unlocked).toBe(true);
  });
});
