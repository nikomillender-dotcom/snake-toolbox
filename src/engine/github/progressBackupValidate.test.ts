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
    files: [],
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

describe("v6 back-compat: files (DESIGN v0.4.3, B14)", () => {
  it("accepts a PRE-V6 snapshot with no `files` field at all", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    delete backup.files;
    const result = validateProgressBackup(backup);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("parseProgressBackup normalizes an absent `files` to an empty array", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    delete backup.files;
    const parsed = parseProgressBackup(backup);
    expect(parsed?.files).toEqual([]);
  });

  it("accepts a well-formed files array (utf8 and base64 entries)", () => {
    const backup = validBackup();
    backup.files = [
      { path: "main.py", content: "print('hi')\n", encoding: "utf8" },
      { path: "logo.png", content: "aGVsbG8=", encoding: "base64" },
    ];
    expect(validateProgressBackup(backup)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a files entry with a bad encoding value", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    backup.files = [{ path: "main.py", content: "x", encoding: "latin1" }];
    const result = validateProgressBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("files[0].encoding"))).toBe(true);
  });

  it("rejects a files entry missing content", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    backup.files = [{ path: "main.py", encoding: "utf8" }];
    const result = validateProgressBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("files[0].content"))).toBe(true);
  });

  it("rejects `files` when present but not an array", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    backup.files = "not-an-array";
    const result = validateProgressBackup(backup);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("files must be an array when present");
  });
});
