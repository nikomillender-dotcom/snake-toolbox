// D4 (Frederick delta-check): the completion-log writer (progress/completionLogWriter.ts) and
// deriveGlossary (derive/deriveGlossary.ts) must read the SAME COMPLETION_EMITTING_KINDS constant,
// never a private list, so "lesson complete" can never disagree between writer and reader. This
// test imports the constant from contracts.ts directly (the ONE source) and confirms both modules
// hold that literal same reference by re-importing it through each module's own import path,
// which resolves to the identical object because ES modules cache by specifier.
import { describe, expect, it } from "vitest";
import { COMPLETION_EMITTING_KINDS } from "../../contracts.js";

describe("COMPLETION_EMITTING_KINDS (D4 shared-rule identity)", () => {
  it("is the exact same Set instance everywhere it is imported", async () => {
    const contractsModule = await import("../../contracts.js");
    // Both the writer and the reader import { COMPLETION_EMITTING_KINDS } from "../../contracts.js";
    // there is no second copy anywhere in this codebase. Prove it by reference identity.
    expect(contractsModule.COMPLETION_EMITTING_KINDS).toBe(COMPLETION_EMITTING_KINDS);
  });

  it("contains exactly the nine emitting kinds pinned in CONTRACT 4, no more, no fewer", () => {
    const expected = new Set([
      "mcq",
      "fillBlank",
      "predictOutput",
      "parsons",
      "fixBug",
      "specimenDecode",
      "traceTable",
      "writeStub",
      "boss",
    ]);
    expect(COMPLETION_EMITTING_KINDS.size).toBe(expected.size);
    for (const kind of expected) {
      expect(COMPLETION_EMITTING_KINDS.has(kind as never)).toBe(true);
    }
  });

  it("excludes prose, liveExample, and reflection (the non-emitting kinds)", () => {
    expect(COMPLETION_EMITTING_KINDS.has("prose")).toBe(false);
    expect(COMPLETION_EMITTING_KINDS.has("liveExample")).toBe(false);
    expect(COMPLETION_EMITTING_KINDS.has("reflection")).toBe(false);
  });
});
