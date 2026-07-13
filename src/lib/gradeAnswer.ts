// gradeAnswer.ts, the grading-interaction-spec's main-thread comparison graders (G0 to G17).
//
// This module is the "swap the grade SOURCE, never the emitted node" seam (G0): pure, synchronous,
// no worker round-trip, so a predictOutput/traceTable/mcq/fillBlank/parsons Check grades instantly,
// even before Pyodide finishes booting. writeStub/fixBug/boss stay on the existing hidden-test path
// (LearnScreen.checkGraded), UNCHANGED, since they carry real hiddenTests and need the worker.
//
// Every function here reads only fields already on the frozen Step (CONTRACT 4, contracts.ts). No
// contract change (G19). Answer capture is UI-local ephemeral state; the AnswerState shape below is
// stored nowhere, never persisted, never sent over the worker protocol.

import type { Step } from "../contracts";

// ============================================================================
// Routing (G0): which kind of grader a Step falls to.
// ============================================================================

export type GraderRoute = "hiddenTest" | "predictOutput" | "traceTable" | "mcq" | "fillBlank" | "parsons" | "none";

const HIDDEN_TEST_KINDS = new Set(["writeStub", "fixBug", "boss"]);
const COMPARISON_KINDS = new Set(["predictOutput", "traceTable", "mcq", "fillBlank", "parsons"]);

/** G0: writeStub/fixBug/boss -> the existing hidden-test path (unchanged). The five answer-compared
 * kinds -> the main-thread comparison grader below. Anything else (prose/liveExample/reflection, or
 * an authoring kind this spec does not cover, e.g. specimenDecode has zero real content and no
 * defined grader here) -> "none": G13's defensive clause, never auto-pass. */
export function graderRouteFor(step: Step): GraderRoute {
  if (HIDDEN_TEST_KINDS.has(step.kind)) return "hiddenTest";
  if (COMPARISON_KINDS.has(step.kind)) return step.kind as GraderRoute;
  return "none";
}

// ============================================================================
// Answer capture state (UI-local, ephemeral, stored nowhere; G6/G8/G10 capture shapes).
// ============================================================================

export interface AnswerState {
  prediction: string;        // predictOutput / traceTable: the typed console prediction
  fillBlank: string;         // fillBlank: the chip's raw string
  mcqIndex: number | null;   // mcq: the selected choice index, null = nothing picked yet
  parsonsOrder: number[];    // parsons: current top-to-bottom order, as indices into step.scrambled
}

export function initialAnswerFor(step: Step): AnswerState {
  return {
    prediction: "",
    fillBlank: "",
    mcqIndex: null,
    parsonsOrder: (step.scrambled ?? []).map((_, i) => i),
  };
}

// ============================================================================
// G2: normalizeOutput, stated precisely, applied to BOTH sides before comparison.
// ============================================================================

export function normalizeOutput(s: string): string {
  let out = s.replace(/\r\n?/g, "\n"); // 1. line endings
  out = out.split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n"); // 2. per-line trailing whitespace
  out = out.replace(/\n+$/, ""); // 3. trailing blank lines / final newline
  return out; // 4. leading + internal whitespace left untouched, deliberately
}

/** G15: makes whitespace visible in the actual-vs-expected diff (a middot for space, a return glyph
 * before each real newline so the diff-block, styled with white-space: pre-wrap, actually shows the
 * line break). Never collapses consecutive spaces the way plain HTML text would. */
export function visualizeWhitespace(s: string): string {
  return s
    .split("\n")
    .map((line) => line.replace(/ /g, "·"))
    .join("↵\n");
}

// ============================================================================
// Local grade result: the shape CheckResult already renders (G15), UI-internal, never the worker's
// checkResult contract event.
// ============================================================================

export interface LocalGradeResult {
  passed: boolean;
  message: string;
  actual?: string;
  expected?: string;
}

export const EMPTY_NUDGE: Record<string, string> = {
  predictOutput: "Type what the console would show first.",
  traceTable: "Type what the console would show first.",
  fillBlank: "Fill in the blank first.",
  mcq: "Pick one to check.",
};

// ============================================================================
// G13: is this kind's answer empty right now (never auto-passes, never auto-fails; a calm no-op)?
// ============================================================================

export function isPredictionEmpty(answer: string): boolean {
  return normalizeOutput(answer) === "";
}
export function isFillBlankEmpty(answer: string): boolean {
  return answer.trim() === "";
}
export function isAnswerEmpty(route: GraderRoute, answer: AnswerState): boolean {
  switch (route) {
    case "predictOutput":
    case "traceTable":
      return isPredictionEmpty(answer.prediction);
    case "fillBlank":
      return isFillBlankEmpty(answer.fillBlank);
    case "mcq":
      return answer.mcqIndex == null;
    case "parsons":
      return false; // G13: an arrangement always exists, parsons is never "empty"
    default:
      return true;
  }
}

// ============================================================================
// Section A (G2, G3, G4): predictOutput and traceTable grade IDENTICALLY, whole-answer.
// ============================================================================

export function gradePrediction(
  answer: string,
  step: Step,
  priorMisses: number,
  hasRunReveal: boolean
): LocalGradeResult {
  const normAnswer = normalizeOutput(answer);
  const normExpected = normalizeOutput(step.expected ?? "");
  if (normAnswer === normExpected) {
    return { passed: true, message: "Nice. Step cleared." };
  }
  const missNumber = priorMisses + 1; // G16: which miss this is
  const revealExpected = missNumber >= 3 && !hasRunReveal;
  let message: string;
  if (missNumber === 1) {
    message = "Not yet. Look closely at what you typed, spacing counts.";
  } else if (missNumber === 2) {
    message = "Still not it. Try \"Run it and see\" if you want to check your reasoning.";
  } else if (revealExpected) {
    message = "Here is exactly what prints. Compare it with your prediction.";
  } else {
    message = "You already ran it and saw the real output. Match your prediction to that.";
  }
  return {
    passed: false,
    message,
    actual: visualizeWhitespace(normAnswer),
    expected: revealExpected ? visualizeWhitespace(normExpected) : undefined,
  };
}

// ============================================================================
// Section B (G6, G7): mcq.
// ============================================================================

export function gradeMcq(selectedIndex: number | null, step: Step, priorMisses: number): LocalGradeResult {
  const answerIndex = step.answerIndex ?? -1;
  if (selectedIndex != null && selectedIndex === answerIndex) {
    return { passed: true, message: "Nice. Step cleared." };
  }
  const missNumber = priorMisses + 1;
  return {
    passed: false,
    message: missNumber === 1 ? "Not that one. Take another look." : "It is this one.",
  };
}

/** G7: reveal the correct option after the 2nd miss. `missCount` is the count of misses that have
 * ALREADY happened (post-grade), not the pre-grade prior count. */
export function mcqRevealsAnswer(missCount: number): boolean {
  return missCount >= 2;
}

// ============================================================================
// Section C (G8, G9): fillBlank, single blank, exact case-sensitive token match.
// ============================================================================

export function gradeFillBlank(answer: string, step: Step, priorMisses: number): LocalGradeResult {
  const expected = (step.expected ?? "").trim();
  const trimmed = answer.trim();
  if (trimmed === expected) {
    return { passed: true, message: "Nice. Step cleared." };
  }
  const missNumber = priorMisses + 1;
  let message: string;
  if (missNumber === 1) {
    message = "Close. Check your spelling and capital letters.";
  } else if (missNumber === 2) {
    const first = expected[0] ?? "";
    const n = expected.length;
    message = `Still not it. It starts with "${first}" and is ${n} character${n === 1 ? "" : "s"} long.`;
  } else {
    message = `It is "${expected}". Case matters, so match it exactly.`;
  }
  return { passed: false, message };
}

// ============================================================================
// Section D (G10, G11, G12): parsons, duplicate-safe value-sequence comparison.
// ============================================================================

function parsonsLines(order: number[], step: Step): string[] {
  const scrambled = step.scrambled ?? [];
  return order.map((i) => scrambled[i] ?? "");
}
function parsonsSolutionLines(step: Step): string[] {
  const scrambled = step.scrambled ?? [];
  return (step.solutionOrder ?? []).map((i) => scrambled[i] ?? "");
}

export function gradeParsons(currentOrder: number[], step: Step, priorMisses: number): LocalGradeResult {
  const answerLines = parsonsLines(currentOrder, step);
  const solutionLines = parsonsSolutionLines(step);
  const passed =
    answerLines.length === solutionLines.length && answerLines.every((line, i) => line === solutionLines[i]);
  if (passed) {
    return { passed: true, message: "Nice. Step cleared." };
  }
  const missNumber = priorMisses + 1;
  const message =
    missNumber >= 3
      ? "Here is the order that works. Read it top to bottom and see why."
      : "Some lines are home, some need to move. The checked ones are in the right spot.";
  return { passed: false, message };
}

/** G12: per-row "settled" (this position already matches the solution) vs "move me" marks. Never
 * reveals the whole order by itself; only the per-position match state. */
export function parsonsSettledMask(currentOrder: number[], step: Step): boolean[] {
  const answerLines = parsonsLines(currentOrder, step);
  const solutionLines = parsonsSolutionLines(step);
  return answerLines.map((line, i) => line === solutionLines[i]);
}

/** G12: reveal the full correct order after the 3rd miss. `missCount` is post-grade (misses that
 * have already happened), matching mcqRevealsAnswer's convention. */
export function parsonsRevealsOrder(missCount: number): boolean {
  return missCount >= 3;
}

// ============================================================================
// The one router (G0): grade whatever the current route is.
// ============================================================================

export function gradeAnswerForStep(
  route: GraderRoute,
  answer: AnswerState,
  step: Step,
  priorMisses: number,
  hasRunReveal: boolean
): LocalGradeResult {
  switch (route) {
    case "predictOutput":
    case "traceTable":
      return gradePrediction(answer.prediction, step, priorMisses, hasRunReveal);
    case "fillBlank":
      return gradeFillBlank(answer.fillBlank, step, priorMisses);
    case "mcq":
      return gradeMcq(answer.mcqIndex, step, priorMisses);
    case "parsons":
      return gradeParsons(answer.parsonsOrder, step, priorMisses);
    default:
      // G0/G13 defensive clause: a step matching no grader must never auto-pass.
      return { passed: false, message: "This step cannot be graded yet." };
  }
}
