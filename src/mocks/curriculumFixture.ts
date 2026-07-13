// curriculumFixture.ts, L11: a fixture CurriculumBundle (CONTRACT 4).
//
// The real content (lesson prose, exercises, tests, boss scenarios) is Byleth's authoring job,
// entirely separate from this build. This fixture exists only so every screen that reads a
// CurriculumBundle (Learn, the Stat Screen's award map, the Glossary, the Review Hand) has
// something real and internally consistent to render against offline. Module ids here are
// invented for the fixture and carry no relationship to the actual curriculum numbering.

import type { CurriculumBundle, Module, StatAwardMap, Term } from "../contracts";

const terms_m01: Term[] = [
  { id: "t-var", term: "variable", definition: "A named box your program can put a value in and grab back later.", kind: "concept", strand: "core", sourceModuleId: "m01", sourceLessonId: "m01-l1" },
  { id: "t-fstring", term: "f-string", definition: 'A string with {curly braces} that drops a real value into a sentence, like f"Hi {name}".', kind: "concept", strand: "core", sourceModuleId: "m01", sourceLessonId: "m01-l1" },
  { id: "t-print", term: "print", definition: "How Python talks back to you. Whatever you hand it, it says out loud in the console.", kind: "function", strand: "core", sourceModuleId: "m01", sourceLessonId: "m01-l1" }
];

// D4/B16 fixture: an all-prose lesson (no completion-emitting step) whose term unlocks on the
// parent MODULE's completion instead (CONTRACT 7 fallback), exercised directly by
// tests/glossaryMock.test.ts.
const terms_m02: Term[] = [
  { id: "t-loop", term: "loop", definition: "A block of code Python repeats until you tell it to stop.", kind: "concept", strand: "core", sourceModuleId: "m02", sourceLessonId: "m02-l2" }
];

const terms_m03: Term[] = [
  { id: "t-traceback", term: "traceback", definition: "The error report Python prints when something breaks. Read it bottom up, the last line is what went wrong.", kind: "concept", strand: "debug", sourceModuleId: "m03", sourceLessonId: "m03-l1" },
  { id: "t-nameerror", term: "NameError", definition: "You used a name Python has never seen. Usually a typo or a value you forgot to define.", kind: "concept", strand: "debug", sourceModuleId: "m03", sourceLessonId: "m03-l1" },
  { id: "t-breakpoint", term: "breakpoint", definition: "A pause button for your code. Stop at a line and look at what every value actually is.", kind: "function", strand: "debug", sourceModuleId: "m03", sourceLessonId: "m03-l2" }
];

const terms_m06: Term[] = [
  { id: "t-decorator", term: "decorator", definition: "A wrapper you put on a function with @ to add behavior without rewriting the function.", kind: "concept", strand: "design", sourceModuleId: "m06", sourceLessonId: "m06-l1" },
  { id: "t-closure", term: "closure", definition: "A function that remembers values from the place it was created, even after that place is gone.", kind: "concept", strand: "design", sourceModuleId: "m06", sourceLessonId: "m06-l1" }
];

const terms_m09: Term[] = [
  { id: "t-fixture", term: "fixture", definition: "Canned test data you set up once and reuse across a bunch of tests.", kind: "concept", strand: "tests", sourceModuleId: "m09", sourceLessonId: "m09-l1" }
];

const modules: Module[] = [
  {
    id: "m01", title: "Values and print", phase: 1, strands: ["core"], producesArtifact: false,
    conceptTags: ["variables", "print", "f-strings"], terms: terms_m01,
    lessons: [
      {
        id: "m01-l1", title: "Telling Python things, and hearing it back",
        steps: [
          { id: "m01-l1-s1", kind: "prose", conceptTags: ["variables"], body: "A value is a thing your program holds onto." },
          { id: "m01-l1-s2", kind: "fillBlank", conceptTags: ["print"], strand: "core", reviewable: true,
            reviewForm: { kind: "fillBlank", sourceLessonId: "m01-l1", prompt: "Fill in the call that prints greeting.", starterCode: "greeting = \"hey\"\n____(greeting)", expected: "print(greeting)" },
            prompt: "Fill in the call that prints greeting.", starterCode: "greeting = \"hey\"\n____(greeting)", expected: "print(greeting)" },
          { id: "m01-l1-s3", kind: "mcq", conceptTags: ["variables"], strand: "core", reviewable: true,
            reviewForm: { kind: "recall", sourceLessonId: "m01-l1", prompt: "What keyword-free thing holds a value so you can use it later?", choices: ["a function", "a variable", "a loop", "a comment"], answerIndex: 1 },
            prompt: "What keyword-free thing holds a value so you can use it later?", choices: ["a function", "a variable", "a loop", "a comment"], answerIndex: 1 }
        ]
      }
    ]
  },
  {
    id: "m02", title: "Loops", phase: 1, strands: ["core"], producesArtifact: false,
    conceptTags: ["while", "for"], terms: terms_m02,
    lessons: [
      { id: "m02-l1", title: "While loops", steps: [
        { id: "m02-l1-s1", kind: "predictOutput", conceptTags: ["while"], strand: "core", reviewable: true,
          reviewForm: { kind: "predictOutput", sourceLessonId: "m02-l1", prompt: "What does this print?", code: "n = 0\nwhile n < 3:\n    print(n)\n    n += 1", expected: "0\n1\n2" },
          prompt: "What does this print?", code: "n = 0\nwhile n < 3:\n    print(n)\n    n += 1", expected: "0\n1\n2" }
      ] },
      // all-prose lesson (D4/B16 fallback fixture): no completion-emitting step, so its term
      // (t-loop) unlocks on the parent MODULE's completion instead.
      { id: "m02-l2", title: "Why loops matter", steps: [
        { id: "m02-l2-s1", kind: "prose", conceptTags: ["while"], body: "Loops are how a program does a lot with a little code." }
      ] }
    ]
  },
  {
    id: "m03", title: "Reading tracebacks", phase: 1, strands: ["debug"], producesArtifact: false,
    conceptTags: ["errors"], terms: terms_m03,
    boss: {
      id: "boss-m03", name: "The Receipt Printer", taunt: "Loops, totals, a clean receipt. My numbers never lie. Beat me.",
      brief: "Niko runs a little shop. Build printReceipt(items) so it loops the cart, totals it, and prints a clean receipt.",
      emblem: "receipt", isPillar: true,
      hiddenTests: [
        { id: "ht1a", code: "assert True", message: "loop every item", group: "loop" },
        { id: "ht1b", code: "assert True", message: "sum the prices", group: "sum" },
        { id: "ht1c", code: "assert True", message: "print name + price rows", group: "rows" },
        { id: "ht1", code: "assert 'total' in out", message: "print a total line after the loop", group: "total" },
        { id: "ht1d", code: "assert True", message: "handle an empty cart", group: "empty" }
      ],
      modelSolution: "def printReceipt(items):\n    if not items:\n        print('cart is empty'); return\n    total = 0\n    for name, price in items:\n        print(f'{name}: {price}')\n        total += price\n    print(f'total: {total}')"
    },
    lessons: [
      { id: "m03-l1", title: "What a traceback tells you", steps: [
        { id: "m03-l1-s1", kind: "fixBug", conceptTags: ["errors"], strand: "debug", reviewable: true,
          reviewForm: { kind: "fixBug", sourceLessonId: "m03-l1", prompt: "This raises a NameError. Fix it.", starterCode: "print(toal)", hiddenTests: [{ id: "rf1", code: "assert True", message: "runs clean" }] },
          prompt: "Fix the bug so this runs clean.", starterCode: "toatl = 4\nprint(toal)" }
      ] },
      { id: "m03-l2", title: "The breakpoint habit", steps: [
        { id: "m03-l2-s1", kind: "boss", conceptTags: ["errors"], strand: "debug" }
      ] }
    ]
  },
  {
    id: "m06", title: "Decorators and closures", phase: 2, strands: ["design"], producesArtifact: true,
    conceptTags: ["decorators", "closures"], terms: terms_m06,
    boss: {
      id: "boss-m06", name: "The Timing Wrapper", taunt: "Wrap it, time it, never touch the guts. Show me.",
      brief: "Write a @timed decorator that prints how long the wrapped call took.",
      emblem: "stopwatch", isPillar: true,
      hiddenTests: [{ id: "ht2", code: "assert True", message: "wraps without changing the return value" }],
      modelSolution: "def timed(fn):\n    def wrapper(*a, **kw):\n        import time\n        start = time.time()\n        result = fn(*a, **kw)\n        print(time.time() - start)\n        return result\n    return wrapper"
    },
    lessons: [{ id: "m06-l1", title: "Wrapping a function", steps: [
      { id: "m06-l1-s1", kind: "writeStub", conceptTags: ["decorators"], strand: "design" },
      { id: "m06-l1-s2", kind: "boss", conceptTags: ["decorators"], strand: "design" }
    ] }]
  },
  {
    id: "m09", title: "Writing real tests", phase: 3, strands: ["tests"], producesArtifact: true,
    conceptTags: ["pytest", "fixtures"], terms: terms_m09,
    boss: {
      id: "boss-m09", name: "The Coverage Auditor", taunt: "Prove it works, or it does not count.",
      brief: "Write a small test suite for a stack class.", emblem: "clipboard", isPillar: true,
      hiddenTests: [{ id: "ht3", code: "assert True", message: "covers push, pop, and empty-pop" }],
      modelSolution: "def test_push_pop():\n    s = Stack()\n    s.push(1)\n    assert s.pop() == 1"
    },
    lessons: [{ id: "m09-l1", title: "Arrange, act, assert", steps: [
      { id: "m09-l1-s1", kind: "traceTable", conceptTags: ["pytest"], strand: "tests" },
      { id: "m09-l1-s2", kind: "boss", conceptTags: ["pytest"], strand: "tests" }
    ] }]
  },
  {
    // fixture-only phase-4 module (no boss needed) so the phase-4 fixture StatSheet crosses a
    // real, higher level threshold than phase 3, exactly like the real curriculum would.
    id: "m12", title: "Shipping for real", phase: 4, strands: ["ship"], producesArtifact: true,
    conceptTags: ["packaging"], terms: [],
    lessons: [{ id: "m12-l1", title: "The last mile", steps: [
      { id: "m12-l1-s1", kind: "writeStub", conceptTags: ["packaging"], strand: "ship" }
    ] }]
  }
];

export const FIXTURE_AWARD_MAP: StatAwardMap = {
  version: "fixture-1",
  statMax: { SYNTAX: 80, DEBUG: 60, TESTS: 40, READ: 40, DESIGN: 50, SHIP: 999 },
  byKind: {
    mcq: { SYNTAX: 1 },
    fillBlank: { SYNTAX: 2 },
    predictOutput: { READ: 2 },
    parsons: { READ: 2 },
    fixBug: { DEBUG: 3 },
    specimenDecode: { READ: 3 },
    traceTable: { TESTS: 3 },
    writeStub: { DESIGN: 3 }
  },
  byStrand: {
    debug: { DEBUG: 2 },
    tests: { TESTS: 2 },
    read: { READ: 2 },
    design: { DESIGN: 1 }
  },
  modulePrimary: {
    m01: { stat: "SYNTAX", bump: 8 },
    m02: { stat: "SYNTAX", bump: 8 },
    m03: { stat: "DEBUG", bump: 6 },
    m06: { stat: "DESIGN", bump: 10 },
    m09: { stat: "TESTS", bump: 10 },
    m12: { stat: "SHIP", bump: 1 }
  },
  bossAward: {
    "boss-m03": { stat: "DEBUG", bump: 20, pillar: true, seal: { id: "seal-m03", label: "Receipt Printer", tier: "bronze", moduleId: "m03", mintedAt: 0 } },
    "boss-m06": { stat: "DESIGN", bump: 20, pillar: true, seal: { id: "seal-m06", label: "Timing Wrapper", tier: "silver", moduleId: "m06", mintedAt: 0 } },
    "boss-m09": { stat: "TESTS", bump: 20, pillar: true, seal: { id: "seal-m09", label: "Coverage Auditor", tier: "gold", moduleId: "m09", mintedAt: 0 } }
  },
  shipAward: 1,
  titleFor: {
    m03: { id: "title-pcep", label: "PCEP", earnedAt: 0 },
    m06: { id: "title-pcap", label: "PCAP", earnedAt: 0 }
  },
  classByPhase: {
    1: { className: "Apprentice", spriteTier: 1 },
    2: { className: "Builder", spriteTier: 2 },
    3: { className: "Forgemaster", spriteTier: 3 },
    4: { className: "Wayfarer", spriteTier: 4 }
  },
  phaseThresholds: { 1: 0, 2: 4, 3: 5, 4: 6 }
};

export const FIXTURE_BUNDLE: CurriculumBundle = {
  version: "fixture-1",
  phases: [
    { id: 1, name: "First Light", moduleIds: ["m01", "m02", "m03"] },
    { id: 2, name: "The Forge", moduleIds: ["m06"], milestone: "PCAP" },
    { id: 3, name: "Proving Ground", moduleIds: ["m09"] },
    { id: 4, name: "The Open Road", moduleIds: [] }
  ],
  units: [
    { id: "u1", title: "Foundations", phase: 1, moduleIds: ["m01", "m02", "m03"], emblem: "spark" }
  ],
  modules,
  awardMap: FIXTURE_AWARD_MAP
};
