import { describe, expect, it } from "vitest";
import type { ProgressBackup } from "../../contracts.js";
import { parseProgressBackup, validateProgressBackup } from "./progressBackupValidate.js";

function validBackup(): ProgressBackup {
  return {
    schemaVersion: 2,
    savedAt: 1000,
    completedNodes: [{ nodeId: "m1", kind: "module", moduleId: "m1", timestamp: 1 }],
    reviews: [
      {
        itemId: "step-1",
        sourceLessonId: "lesson-1",
        stability: 2.3,
        difficulty: 4.1,
        due: 2000,
        lastReviewed: 1000,
        reps: 1,
        lapses: 0,
        state: "learning",
      },
    ],
    settings: { theme: "dark" },
    profile: { name: "Niko", epithet: "the Curious", lastViewedAt: 0 },
  };
}

describe("validateProgressBackup / parseProgressBackup (D12)", () => {
  it("accepts a well-formed backup", () => {
    const result = validateProgressBackup(validBackup());
    expect(result).toEqual({ valid: true, errors: [] });
    expect(parseProgressBackup(validBackup())).not.toBeNull();
  });

  it("rejects a non-object payload cleanly", () => {
    expect(validateProgressBackup(null).valid).toBe(false);
    expect(validateProgressBackup("not json").valid).toBe(false);
    expect(validateProgressBackup(42).valid).toBe(false);
    expect(parseProgressBackup(null)).toBeNull();
  });

  it("rejects a CORRUPT completedNodes entry, never half-applying it", () => {
    const backup = validBackup();
    // @ts-expect-error intentionally corrupting a field for the test
    backup.completedNodes[0].timestamp = "not-a-number";
    const result = validateProgressBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("completedNodes[0].timestamp"))).toBe(true);
    expect(parseProgressBackup(backup)).toBeNull();
  });

  it("rejects a PARTIAL snapshot missing the reviews array entirely", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    delete backup.reviews;
    expect(validateProgressBackup(backup).valid).toBe(false);
  });

  it("rejects an invalid reviews[].state value", () => {
    const backup = validBackup();
    // @ts-expect-error intentionally corrupting for the test
    backup.reviews[0].state = "confused";
    expect(validateProgressBackup(backup).valid).toBe(false);
  });

  it("rejects a missing profile", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    delete backup.profile;
    const result = validateProgressBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("profile must be an object");
  });
});
