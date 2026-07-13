import { describe, expect, it } from "vitest";
import type { Step } from "../contracts";
import {
  normalizeOutput,
  visualizeWhitespace,
  graderRouteFor,
  isAnswerEmpty,
  isPredictionEmpty,
  isFillBlankEmpty,
  gradePrediction,
  gradeMcq,
  mcqRevealsAnswer,
  gradeFillBlank,
  gradeParsons,
  parsonsSettledMask,
  parsonsRevealsOrder,
  gradeAnswerForStep,
  initialAnswerFor,
} from "./gradeAnswer";

function step(partial: Partial<Step> & { kind: Step["kind"] }): Step {
  return { id: "s1", conceptTags: [], ...partial };
}

// ============================================================================
// G0: routing
// ============================================================================
describe("graderRouteFor (G0)", () => {
  it("routes writeStub/fixBug/boss to the hidden-test path, unchanged", () => {
    expect(graderRouteFor(step({ kind: "writeStub" }))).toBe("hiddenTest");
    expect(graderRouteFor(step({ kind: "fixBug" }))).toBe("hiddenTest");
    expect(graderRouteFor(step({ kind: "boss" }))).toBe("hiddenTest");
  });
  it("routes the five comparison kinds to their own main-thread grader", () => {
    expect(graderRouteFor(step({ kind: "predictOutput" }))).toBe("predictOutput");
    expect(graderRouteFor(step({ kind: "traceTable" }))).toBe("traceTable");
    expect(graderRouteFor(step({ kind: "mcq" }))).toBe("mcq");
    expect(graderRouteFor(step({ kind: "fillBlank" }))).toBe("fillBlank");
    expect(graderRouteFor(step({ kind: "parsons" }))).toBe("parsons");
  });
  it("routes everything else (prose/liveExample/reflection/specimenDecode) to 'none': never auto-pass (G13)", () => {
    expect(graderRouteFor(step({ kind: "prose" }))).toBe("none");
    expect(graderRouteFor(step({ kind: "liveExample" }))).toBe("none");
    expect(graderRouteFor(step({ kind: "reflection" }))).toBe("none");
    expect(graderRouteFor(step({ kind: "specimenDecode" }))).toBe("none");
  });
});

describe("gradeAnswerForStep default branch (G0/G13 defensive clause)", () => {
  it("a step matching no grader never auto-passes, and says so honestly", () => {
    const s = step({ kind: "prose" });
    const result = gradeAnswerForStep("none", initialAnswerFor(s), s, 0, false);
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/cannot be graded yet/);
  });
});

// ============================================================================
// G2: normalizeOutput, exactly as specced
// ============================================================================
describe("normalizeOutput (G2)", () => {
  it("normalizes CRLF and lone CR to LF", () => {
    expect(normalizeOutput("1\r\n2\r3")).toBe("1\n2\n3");
  });
  it("strips per-line trailing spaces and tabs", () => {
    expect(normalizeOutput("42 ")).toBe("42");
    expect(normalizeOutput("1 \n2 \n3")).toBe("1\n2\n3");
    expect(normalizeOutput("a\t\n b\t ")).toBe("a\n b");
  });
  it("drops trailing blank lines and the final newline (print()'s trailing newline, or a learner's stray Return)", () => {
    expect(normalizeOutput("42\n")).toBe("42");
    expect(normalizeOutput("1\n2\n3\n\n\n")).toBe("1\n2\n3");
  });
  it("does NOT touch leading whitespace, internal whitespace, or internal blank lines", () => {
    expect(normalizeOutput("  42")).toBe("  42");
    expect(normalizeOutput("{'a': 2, 'b': 1}")).toBe("{'a': 2, 'b': 1}");
    expect(normalizeOutput("1\n\n2")).toBe("1\n\n2");
  });
  it("the load-bearing example from the Manager's brief: internal space is significant", () => {
    expect(normalizeOutput("{'a': 2}")).not.toBe(normalizeOutput("{'a':2}"));
  });

  // SF3 (Frederick full-gate should-fix): iOS Safari's Smart Punctuation rewrites a typed straight
  // quote/dash into a curly quote/en dash as the learner types; no HTML attribute disables this.
  // normalizeOutput must fold it back so a genuinely correct prediction still grades correct.
  it("normalizes curly single quotes (iOS Smart Punctuation) to straight quotes", () => {
    expect(normalizeOutput("{‘a’: 2, ‘b’: 1}")).toBe("{'a': 2, 'b': 1}");
  });
  it("normalizes curly double quotes (iOS Smart Punctuation) to straight quotes", () => {
    expect(normalizeOutput("print(“hi”)")).toBe('print("hi")');
  });
  it("normalizes en dash and em dash (iOS Smart Punctuation) to a plain hyphen", () => {
    expect(normalizeOutput("range 5–9")).toBe("range 5-9");
    expect(normalizeOutput("a — b")).toBe("a - b");
  });
  it("a prediction typed with smart quotes matches the straight-quote expected output", () => {
    const smartTyped = "{‘a’: 2, ‘b’: 1}"; // what iOS actually inserts
    const authoredExpected = "{'a': 2, 'b': 1}"; // what the curriculum authors in straight quotes
    expect(normalizeOutput(smartTyped)).toBe(normalizeOutput(authoredExpected));
  });
});

describe("visualizeWhitespace", () => {
  it("renders spaces as middots and newlines as a return glyph before the real break", () => {
    expect(visualizeWhitespace("a b")).toBe("a·b");
    expect(visualizeWhitespace("1\n2")).toBe("1↵\n2");
  });
});

// ============================================================================
// G13: emptiness per kind
// ============================================================================
describe("isAnswerEmpty (G13)", () => {
  it("predictOutput/traceTable: empty iff the normalized answer is the empty string", () => {
    expect(isPredictionEmpty("")).toBe(true);
    expect(isPredictionEmpty("   \n  ")).toBe(true);
    expect(isPredictionEmpty("0")).toBe(false);
  });
  it("fillBlank: empty iff the trimmed answer is empty", () => {
    expect(isFillBlankEmpty("   ")).toBe(true);
    expect(isFillBlankEmpty("#")).toBe(false);
  });
  it("mcq: empty iff nothing is selected", () => {
    const s = step({ kind: "mcq", choices: ["a", "b"], answerIndex: 0 });
    expect(isAnswerEmpty("mcq", { ...initialAnswerFor(s), mcqIndex: null })).toBe(true);
    expect(isAnswerEmpty("mcq", { ...initialAnswerFor(s), mcqIndex: 0 })).toBe(false);
  });
  it("parsons: never empty, an arrangement always exists", () => {
    const s = step({ kind: "parsons", scrambled: ["a", "b"], solutionOrder: [1, 0] });
    expect(isAnswerEmpty("parsons", initialAnswerFor(s))).toBe(false);
  });
});

// ============================================================================
// Section A: predictOutput / traceTable (G3, G4, G16)
// ============================================================================
describe("gradePrediction (predictOutput, G3)", () => {
  const s = step({ kind: "predictOutput", code: "print(40 + 2)", expected: "42" });

  it("correct answer passes", () => {
    expect(gradePrediction("42", s, 0, false).passed).toBe(true);
  });
  it("a trailing Return still passes (trailing newline dropped)", () => {
    expect(gradePrediction("42\n", s, 0, false).passed).toBe(true);
  });
  it("case-sensitive: wrong case fails", () => {
    const s2 = step({ kind: "predictOutput", expected: "Ready\nGo!" });
    expect(gradePrediction("ready\ngo!", s2, 0, false).passed).toBe(false);
  });
  it("internal spacing is significant: a dict repr missing the space after the colon fails", () => {
    const s2 = step({ kind: "predictOutput", expected: "{'a': 2, 'b': 1}" });
    expect(gradePrediction("{'a':2, 'b':1}", s2, 0, false).passed).toBe(false);
    expect(gradePrediction("{'a': 2, 'b': 1}", s2, 0, false).passed).toBe(true);
  });
  it("wrong answer never passes, and 1st miss does NOT reveal expected (coach, not the answer)", () => {
    const r = gradePrediction("40", s, 0, false);
    expect(r.passed).toBe(false);
    expect(r.expected).toBeUndefined();
    expect(r.actual).toBeDefined();
  });
  it("2nd miss still does not reveal expected", () => {
    const r = gradePrediction("40", s, 1, false);
    expect(r.expected).toBeUndefined();
  });
  it("3rd miss reveals expected, whitespace-visible, IF they have not run it (G16)", () => {
    const r = gradePrediction("40", s, 2, false);
    expect(r.expected).toBe("42");
  });
  it("3rd miss does NOT reveal expected if they already used Run it and see", () => {
    const r = gradePrediction("40", s, 2, true);
    expect(r.expected).toBeUndefined();
  });
});

describe("traceTable grades identically to predictOutput, whole-answer (G4)", () => {
  it("m09-l3-s4-shaped step (a dict repr) passes only on an exact whole-answer match", () => {
    const s = step({ kind: "traceTable", code: "counts = {}\n...", expected: "{'a': 2, 'b': 1}" });
    expect(gradePrediction("{'a': 2, 'b': 1}", s, 0, false).passed).toBe(true);
    expect(gradePrediction("{'a': 2, 'b':1}", s, 0, false).passed).toBe(false);
  });
});

// ============================================================================
// Section B: mcq (G6, G7)
// ============================================================================
describe("gradeMcq (G6, G7)", () => {
  const s = step({ kind: "mcq", choices: ["\"7\"", "7", "\"seven\"", "seven"], answerIndex: 1 });

  it("selecting the correct index passes", () => {
    expect(gradeMcq(1, s, 0).passed).toBe(true);
  });
  it("selecting a wrong index fails, 1st miss says 'Not that one'", () => {
    const r = gradeMcq(0, s, 0);
    expect(r.passed).toBe(false);
    expect(r.message).toBe("Not that one. Take another look.");
  });
  it("null selection (nothing picked) is never graded as a pass", () => {
    expect(gradeMcq(null, s, 0).passed).toBe(false);
  });
  it("mcqRevealsAnswer only reveals the correct option after the 2nd miss", () => {
    expect(mcqRevealsAnswer(0)).toBe(false);
    expect(mcqRevealsAnswer(1)).toBe(false);
    expect(mcqRevealsAnswer(2)).toBe(true);
  });
});

// ============================================================================
// Section C: fillBlank (G8, G9)
// ============================================================================
describe("gradeFillBlank (G9)", () => {
  it("exact match passes", () => {
    const s = step({ kind: "fillBlank", expected: "#" });
    expect(gradeFillBlank("#", s, 0).passed).toBe(true);
  });
  it("a stray outer space on the answer never fails a right token (trim both sides)", () => {
    const s = step({ kind: "fillBlank", expected: "None" });
    expect(gradeFillBlank("  None  ", s, 0).passed).toBe(true);
  });
  it("case-sensitive: 'none' fails when 'None' is expected", () => {
    const s = step({ kind: "fillBlank", expected: "None" });
    expect(gradeFillBlank("none", s, 0).passed).toBe(false);
  });
  it("case-sensitive: 'STRIP' fails when 'strip' is expected", () => {
    const s = step({ kind: "fillBlank", expected: "strip" });
    expect(gradeFillBlank("STRIP", s, 0).passed).toBe(false);
  });
  it("1st miss coaches spelling/capitalization, does not reveal the token", () => {
    const s = step({ kind: "fillBlank", expected: "None" });
    const r = gradeFillBlank("none", s, 0);
    expect(r.message).toBe("Close. Check your spelling and capital letters.");
    expect(r.message).not.toMatch(/None/);
  });
  it("2nd miss reveals length + first character, not the whole token", () => {
    const s = step({ kind: "fillBlank", expected: "None" });
    const r = gradeFillBlank("none", s, 1);
    expect(r.message).toMatch(/"N"/);
    expect(r.message).toMatch(/4 characters/);
  });
  it("3rd miss reveals the full token", () => {
    const s = step({ kind: "fillBlank", expected: "None" });
    const r = gradeFillBlank("none", s, 2);
    expect(r.message).toMatch(/"None"/);
  });

  // SF3 (Frederick full-gate should-fix): iOS Safari's Smart Punctuation can rewrite a typed
  // straight quote/dash into a curly quote/en dash. A fillBlank answer typed on an iPad must still
  // grade correct against a straight-quote/hyphen authored `expected`.
  it("a curly single quote typed on iOS still matches a straight-quote expected token", () => {
    const s = step({ kind: "fillBlank", expected: "'q'" });
    expect(gradeFillBlank("‘q’", s, 0).passed).toBe(true);
  });
  it("a curly double quote typed on iOS still matches a straight-quote expected token", () => {
    const s = step({ kind: "fillBlank", expected: '"q"' });
    expect(gradeFillBlank("“q”", s, 0).passed).toBe(true);
  });
  it("an en dash typed on iOS still matches a hyphen-expected token", () => {
    const s = step({ kind: "fillBlank", expected: "well-formed" });
    expect(gradeFillBlank("well–formed", s, 0).passed).toBe(true);
  });
});

// ============================================================================
// Section D: parsons (G10, G11, G12)
// ============================================================================
describe("gradeParsons (G11, value-sequence not index-sequence)", () => {
  // real m01-l2-s3 shape
  const s = step({
    kind: "parsons",
    scrambled: ["print(\"Later, gator.\")", "print(\"Hello there.\")", "print(\"My name is Niko.\")"],
    solutionOrder: [1, 2, 0],
  });

  it("the solution order passes", () => {
    expect(gradeParsons([1, 2, 0], s, 0).passed).toBe(true);
  });
  it("the scrambled (unarranged) starting order fails and does not auto-pass on load", () => {
    expect(gradeParsons([0, 1, 2], s, 0).passed).toBe(false);
  });
  it("value-sequence, duplicate-safe: two identical scrambled lines in ANY order that matches by VALUE passes", () => {
    const dup = step({
      kind: "parsons",
      scrambled: ["print(x)", "print(x)", "y = 1"],
      solutionOrder: [2, 0, 1], // "y = 1", "print(x)", "print(x)"
    });
    // a different index arrangement that produces the SAME line values in the SAME positions
    // must also pass, proving grading is by value not by index identity.
    expect(gradeParsons([2, 1, 0], dup, 0).passed).toBe(true);
  });
  it("parsonsSettledMask marks each position independently, without revealing the whole order", () => {
    // solutionLines = [scrambled[1], scrambled[2], scrambled[0]] = ["Hello there.", "My name is Niko.", "Later, gator."]
    // currentOrder [1, 0, 2] -> answerLines = [scrambled[1], scrambled[0], scrambled[2]] = ["Hello there.", "Later, gator.", "My name is Niko."]
    // position 0 matches ("Hello there." at both), positions 1 and 2 do not.
    const mask = parsonsSettledMask([1, 0, 2], s);
    expect(mask).toEqual([true, false, false]);
  });
  it("parsonsRevealsOrder only reveals the full order after the 3rd miss", () => {
    expect(parsonsRevealsOrder(0)).toBe(false);
    expect(parsonsRevealsOrder(1)).toBe(false);
    expect(parsonsRevealsOrder(2)).toBe(false);
    expect(parsonsRevealsOrder(3)).toBe(true);
  });
});
