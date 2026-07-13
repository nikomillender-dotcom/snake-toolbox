import { describe, expect, it } from "vitest";
import type { Step } from "../../contracts.js";
import {
  buildArtifactCompletionNode,
  buildBossCompletionNode,
  buildModuleCompletionNode,
  buildStepCompletionNode,
} from "./completionLogWriter.js";

function step(overrides: Partial<Step>): Step {
  return { id: "s1", kind: "mcq", conceptTags: [], ...overrides };
}

describe("completionLogWriter (B6)", () => {
  it("emits a node for a completion-emitting kind", () => {
    const node = buildStepCompletionNode({ step: step({ kind: "mcq" }), moduleId: "m1", timestamp: 10 });
    expect(node).not.toBeNull();
    expect(node?.nodeId).toBe("s1");
    expect(node?.kind).toBe("mcq");
    expect(node?.moduleId).toBe("m1");
    expect(node?.timestamp).toBe(10);
  });

  it("returns null for prose, liveExample, and reflection (D4 non-emitting kinds)", () => {
    expect(buildStepCompletionNode({ step: step({ kind: "prose" }), moduleId: "m1", timestamp: 1 })).toBeNull();
    expect(buildStepCompletionNode({ step: step({ kind: "liveExample" }), moduleId: "m1", timestamp: 1 })).toBeNull();
    expect(buildStepCompletionNode({ step: step({ kind: "reflection" }), moduleId: "m1", timestamp: 1 })).toBeNull();
  });

  it("stamps strand verbatim when the step carries one (P8)", () => {
    const withStrand = buildStepCompletionNode({
      step: step({ kind: "fixBug", strand: "debug" }),
      moduleId: "m1",
      timestamp: 1,
    });
    expect(withStrand?.strand).toBe("debug");

    const withoutStrand = buildStepCompletionNode({
      step: step({ kind: "fixBug" }),
      moduleId: "m1",
      timestamp: 1,
    });
    expect(withoutStrand?.strand).toBeUndefined();
  });

  it("carries statTags through untouched (P9, advisory-only, not interpreted here)", () => {
    const node = buildStepCompletionNode({
      step: step({ kind: "mcq", statTags: ["DESIGN"] }),
      moduleId: "m1",
      timestamp: 1,
    });
    expect(node?.statTags).toEqual(["DESIGN"]);
  });

  it("builds module, boss, and artifact nodes with the pinned key shape (P7)", () => {
    expect(buildModuleCompletionNode("m1", 5)).toEqual({ nodeId: "m1", kind: "module", moduleId: "m1", timestamp: 5 });
    expect(buildBossCompletionNode("boss-m1", "m1", 6)).toEqual({
      nodeId: "boss-m1",
      kind: "boss",
      moduleId: "m1",
      timestamp: 6,
    });
    expect(buildArtifactCompletionNode("artifact-1", "m1", 7)).toEqual({
      nodeId: "artifact-1",
      kind: "artifact",
      moduleId: "m1",
      timestamp: 7,
    });
  });
});
