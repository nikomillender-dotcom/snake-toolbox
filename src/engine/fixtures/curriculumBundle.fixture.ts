// Fixture CurriculumBundle (CONTRACT 4) for standalone derive/glossary tests. Deliberately small
// but covers both deriveGlossary branches (D4): a MIXED-KIND lesson (unlocks on its own
// completion-emitting steps) and an ALL-PROSE lesson (unlocks on parent module completion).
import type { CurriculumBundle } from "../../contracts.js";
import { makeStatAwardMapFixture } from "./statAwardMap.fixture.js";

export function makeCurriculumBundleFixture(): CurriculumBundle {
  return {
    version: "fixture-1",
    phases: [
      { id: 1, name: "Foundations", moduleIds: ["m1-variables", "m2-control-flow"] },
    ],
    units: [
      { id: "u1", title: "Getting Started", phase: 1, moduleIds: ["m1-variables", "m2-control-flow"], emblem: "u1.svg" },
    ],
    modules: [
      {
        id: "m1-variables",
        title: "Variables",
        phase: 1,
        strands: ["core", "debug"],
        producesArtifact: false,
        conceptTags: ["variables"],
        lessons: [
          {
            id: "lesson-intro",
            title: "What is a variable",
            steps: [
              { id: "step-intro-1", kind: "prose", conceptTags: ["variables"] },
            ],
          },
          {
            id: "lesson-practice",
            title: "Practice",
            steps: [
              {
                id: "step-practice-mcq",
                kind: "mcq",
                conceptTags: ["variables"],
                strand: "core",
                prompt: "Which is a valid variable name?",
                choices: ["2x", "x2", "x-2"],
                answerIndex: 1,
                reviewable: true,
                reviewForm: {
                  kind: "recall",
                  sourceLessonId: "lesson-practice",
                  prompt: "Which is a valid variable name?",
                  choices: ["2x", "x2", "x-2"],
                  answerIndex: 1,
                },
              },
              {
                id: "step-practice-fill",
                kind: "fillBlank",
                conceptTags: ["variables"],
                strand: "core",
                prompt: "x ___ 5",
                expected: "=",
              },
            ],
          },
        ],
        boss: {
          id: "boss-m1",
          name: "The Assignment Golem",
          taunt: "Bind me if you can.",
          brief: "Fix the broken assignment chain.",
          emblem: "boss-m1.svg",
          hiddenTests: [{ id: "ht1", code: "assert x == 5", message: "x should be 5" }],
          modelSolution: "x = 5",
          isPillar: true,
        },
        terms: [
          {
            id: "term-variable",
            term: "variable",
            definition: "A name that points at a value.",
            kind: "concept",
            strand: "core",
            sourceModuleId: "m1-variables",
            sourceLessonId: "lesson-practice",
          },
          {
            id: "term-assignment",
            term: "assignment",
            definition: "Giving a variable a value with =.",
            kind: "concept",
            strand: "core",
            sourceModuleId: "m1-variables",
            sourceLessonId: "lesson-intro",
          },
        ],
      },
      {
        id: "m2-control-flow",
        title: "Control Flow",
        phase: 1,
        strands: ["core", "tests"],
        producesArtifact: false,
        conceptTags: ["control-flow"],
        lessons: [
          {
            id: "lesson-cf-intro",
            title: "If and else",
            steps: [
              { id: "step-cf-1", kind: "prose", conceptTags: ["control-flow"] },
              { id: "step-cf-2", kind: "predictOutput", conceptTags: ["control-flow"], strand: "tests",
                code: "if True:\n  print('a')\nelse:\n  print('b')", expected: "a" },
            ],
          },
        ],
        boss: {
          id: "boss-m2",
          name: "The Branching Beast",
          taunt: "Choose your path.",
          brief: "Route the branches correctly.",
          emblem: "boss-m2.svg",
          hiddenTests: [{ id: "ht2", code: "assert route() == 'left'", message: "route() should return left" }],
          modelSolution: "def route():\n  return 'left'",
          isPillar: false,
        },
        terms: [
          {
            id: "term-branch",
            term: "branch",
            definition: "A fork in program execution.",
            kind: "concept",
            strand: "core",
            sourceModuleId: "m2-control-flow",
            sourceLessonId: "lesson-cf-intro",
          },
        ],
      },
    ],
    awardMap: makeStatAwardMapFixture(),
  };
}
