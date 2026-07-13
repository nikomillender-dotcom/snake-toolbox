// Fixture StatAwardMap (CONTRACT 5) for standalone derive tests. Small but exercises every join
// key (P7): modulePrimary by moduleId, bossAward by bossId, titleFor by moduleId, phaseThresholds
// (P2), and one pillar boss (jobMastery).
import type { StatAwardMap } from "../../contracts.js";

export function makeStatAwardMapFixture(): StatAwardMap {
  return {
    version: "fixture-1",
    statMax: { SYNTAX: 100, DEBUG: 100, TESTS: 100, READ: 100, DESIGN: 100, SHIP: 100 },
    byKind: {
      mcq: { SYNTAX: 2 },
      fillBlank: { SYNTAX: 2 },
      fixBug: { DEBUG: 5 },
      traceTable: { READ: 4 },
    },
    byStrand: {
      debug: { DEBUG: 3 },
      tests: { TESTS: 3 },
      read: { READ: 3 },
    },
    modulePrimary: {
      "m1-variables": { stat: "SYNTAX", bump: 10 },
      "m2-control-flow": { stat: "SYNTAX", bump: 10 },
    },
    bossAward: {
      "boss-m1": {
        stat: "DEBUG",
        bump: 20,
        seal: { id: "seal-boss-m1", label: "Bug Slayer", tier: "bronze", moduleId: "m1-variables", mintedAt: 0 },
        pillar: true,
      },
      "boss-m2": {
        stat: "SYNTAX",
        bump: 15,
        seal: { id: "seal-boss-m2", label: "Loop Tamer", tier: "silver", mintedAt: 0 },
        pillar: false,
      },
    },
    shipAward: 8,
    titleFor: {
      "m1-variables": { id: "title-m1", label: "First Steps", earnedAt: 0 },
    },
    classByPhase: {
      1: { className: "Apprentice", spriteTier: 1 },
      2: { className: "Builder", spriteTier: 2 },
      3: { className: "Forgemaster", spriteTier: 3 },
      4: { className: "Wayfarer", spriteTier: 4 },
    },
    phaseThresholds: {
      1: 0,
      2: 2,
      3: 5,
      4: 9,
    },
  };
}
