// Tests for gatherBackupFiles (B14 v6, DESIGN v0.4.3): utf8/base64 encoding, the per-file and
// total size caps (skip-and-report, never truncate), and the per-file F2 secret scan exclusion.
import { describe, expect, it } from "vitest";
import type { FileBlob } from "../../contracts.js";
import { makeInMemoryStore } from "../fixtures/inMemoryStore.fixture.js";
import { gatherBackupFiles, PER_FILE_CAP_BYTES, TOTAL_FILES_CAP_BYTES } from "./gatherBackupFiles.js";

async function storeWith(files: Array<{ path: string; blob: FileBlob }>) {
  const store = makeInMemoryStore();
  for (const { path, blob } of files) {
    await store.put("files", path, blob);
  }
  return store;
}

describe("gatherBackupFiles (B14 v6)", () => {
  it("an empty files collection gathers to an empty snapshot with nothing skipped", async () => {
    const store = makeInMemoryStore();
    const result = await gatherBackupFiles(store);
    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("a UTF-8 text file rides verbatim as { content, encoding: 'utf8' }", async () => {
    const store = await storeWith([{ path: "main.py", blob: { path: "main.py", text: "print('hi')\n", encoding: "utf8" } }]);
    const result = await gatherBackupFiles(store);
    expect(result.files).toEqual([{ path: "main.py", content: "print('hi')\n", encoding: "utf8" }]);
    expect(result.skipped).toEqual([]);
  });

  it("a binary file rides as base64 with { encoding: 'base64' }, and round-trips losslessly", async () => {
    const bytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]); // gzip magic
    const store = await storeWith([{ path: "data.bin", blob: { path: "data.bin", bytes, encoding: "binary" } }]);
    const result = await gatherBackupFiles(store);
    expect(result.files).toHaveLength(1);
    const backupFile = result.files[0]!;
    expect(backupFile.encoding).toBe("base64");
    const decoded = Uint8Array.from(atob(backupFile.content), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
    expect(result.skipped).toEqual([]);
  });

  it("classifies a binary FileBlob whose bytes are actually valid UTF-8 as text (shared classifyBytes discipline)", async () => {
    const bytes = new TextEncoder().encode("actually text\n");
    const store = await storeWith([{ path: "mystery.dat", blob: { path: "mystery.dat", bytes, encoding: "binary" } }]);
    const result = await gatherBackupFiles(store);
    expect(result.files[0]).toEqual({ path: "mystery.dat", content: "actually text\n", encoding: "utf8" });
  });

  it("PER-FILE CAP: an oversized file is SKIPPED and REPORTED, never truncated", async () => {
    const bigText = "x".repeat(PER_FILE_CAP_BYTES + 1);
    const store = await storeWith([
      { path: "huge.py", blob: { path: "huge.py", text: bigText, encoding: "utf8" } },
      { path: "small.py", blob: { path: "small.py", text: "print(1)\n", encoding: "utf8" } },
    ]);
    const result = await gatherBackupFiles(store);
    expect(result.files.map((f) => f.path)).toEqual(["small.py"]);
    expect(result.skipped).toEqual([{ path: "huge.py", reason: "overPerFileCap", sizeBytes: bigText.length }]);
  });

  it("TOTAL CAP: prefers small/text files and skips-and-reports the largest binary first", async () => {
    // A small text file and a larger binary file, each individually under the (overridden, tiny)
    // per-file cap, but together over the (overridden, tiny) total cap. The text file must win
    // the budget; the larger binary is skipped and reported.
    const smallText = "print('irreplaceable code')\n"; // ~29 bytes
    const mediumBinary = new Uint8Array(80);
    mediumBinary[0] = 0xff; // ensure it classifies as binary, not accidentally valid UTF-8

    const store = await storeWith([
      { path: "dataset.bin", blob: { path: "dataset.bin", bytes: mediumBinary, encoding: "binary" } },
      { path: "main.py", blob: { path: "main.py", text: smallText, encoding: "utf8" } },
    ]);
    const result = await gatherBackupFiles(store, { perFileCapBytes: 100, totalCapBytes: 90 });
    expect(result.files.map((f) => f.path)).toEqual(["main.py"]);
    const skip = result.skipped.find((s) => s.path === "dataset.bin");
    expect(skip?.reason).toBe("overTotalCap");
    expect(skip?.sizeBytes).toBe(80);
  });

  it("TOTAL CAP: allocation is first-fit, not stop-at-first-miss (a later, smaller file still fits)", async () => {
    // A text file that alone is too big for the whole total-cap budget sorts FIRST (text always
    // wins priority over binary) but does not fit and is skipped; a later, smaller binary file
    // must still get a chance to fit in the untouched budget rather than the allocator giving up
    // the moment its top-priority candidate does not fit.
    const store = await storeWith([
      { path: "huge_notes.txt", blob: { path: "huge_notes.txt", text: "x".repeat(70), encoding: "utf8" } },
      { path: "tiny.bin", blob: { path: "tiny.bin", bytes: (() => { const b = new Uint8Array(10); b[0] = 0xff; return b; })(), encoding: "binary" } },
    ]);
    const result = await gatherBackupFiles(store, { perFileCapBytes: 100, totalCapBytes: 60 });
    expect(result.files.map((f) => f.path)).toEqual(["tiny.bin"]);
    expect(result.skipped).toEqual([{ path: "huge_notes.txt", reason: "overTotalCap", sizeBytes: 70 }]);
  });

  // B1 fix (Frederick full-gate blocker): entropy is scoped to TEXT content; a binary FileBlob
  // (stored as `.bytes`) is never excluded just because its raw-byte latin1 projection happens to
  // look statistically high-entropy. Prevents the "quieter durability gap" Frederick flagged: a
  // legit binary silently excluded as a false "secret."
  it("does NOT exclude a binary file whose raw bytes happen to look like a high-entropy run (entropy scoped to text)", async () => {
    const highEntropyLooking = "aZ9k2mQ8pXw3vB7nR4tY6uL1sD0fG5hJ2kM"; // would trip entropy if scanned as text
    const bytes = new TextEncoder().encode(highEntropyLooking);
    const store = await storeWith([{ path: "resource.bin", blob: { path: "resource.bin", bytes, encoding: "binary" } }]);
    const result = await gatherBackupFiles(store);
    expect(result.skipped).toEqual([]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe("resource.bin");
  });

  it("D5: a per-file secret hit EXCLUDES just that file, never the whole gather", async () => {
    const store = await storeWith([
      { path: "leak.py", blob: { path: "leak.py", text: "TOKEN='ghp_1234567890abcdefghijklmnopqrstuvwxyzAB'", encoding: "utf8" } },
      { path: "clean.py", blob: { path: "clean.py", text: "print('clean')\n", encoding: "utf8" } },
    ]);
    const result = await gatherBackupFiles(store);
    expect(result.files.map((f) => f.path)).toEqual(["clean.py"]);
    expect(result.skipped).toEqual([{ path: "leak.py", reason: "secretDetected", sizeBytes: expect.any(Number) }]);
  });
});
