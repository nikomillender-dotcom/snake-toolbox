// Tests for restoreBackupFiles (B14 v6, integration I14): decode round trips (utf8/base64), the
// additive-restore collision rule (local always wins, never overwritten), and honest reporting of
// both written and skipped paths.
import { describe, expect, it } from "vitest";
import type { BackupFile } from "../../contracts.js";
import { makeInMemoryStore } from "../fixtures/inMemoryStore.fixture.js";
import { decodeBackupFile, restoreBackupFilesAdditively } from "./restoreBackupFiles.js";

describe("decodeBackupFile", () => {
  it("decodes a utf8 BackupFile back into a text FileBlob", () => {
    const file: BackupFile = { path: "main.py", content: "print('hi')\n", encoding: "utf8" };
    expect(decodeBackupFile(file)).toEqual({ path: "main.py", text: "print('hi')\n", encoding: "utf8" });
  });

  it("decodes a base64 BackupFile back into a bytes FileBlob, losslessly", () => {
    const original = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]); // gzip magic
    let binary = "";
    for (const b of original) binary += String.fromCharCode(b);
    const file: BackupFile = { path: "data.bin", content: btoa(binary), encoding: "base64" };
    const blob = decodeBackupFile(file);
    expect(blob.encoding).toBe("binary");
    expect(blob.path).toBe("data.bin");
    expect(Array.from(blob.bytes!)).toEqual(Array.from(original));
  });
});

describe("restoreBackupFilesAdditively (B14 v6, never-destroy invariant)", () => {
  it("writes every file on a fresh device (no local files at all)", async () => {
    const store = makeInMemoryStore();
    const files: BackupFile[] = [
      { path: "main.py", content: "print('hi')\n", encoding: "utf8" },
      { path: "notes.txt", content: "todo\n", encoding: "utf8" },
    ];
    const report = await restoreBackupFilesAdditively(store, files);
    expect(report.written).toEqual(["main.py", "notes.txt"]);
    expect(report.skipped).toEqual([]);
    expect(await store.get("files", "main.py")).toEqual({ path: "main.py", text: "print('hi')\n", encoding: "utf8" });
  });

  it("ADDITIVE COLLISION: a path that already exists locally is LEFT ALONE and reported, never overwritten", async () => {
    const store = makeInMemoryStore();
    const localFile = { path: "main.py", text: "print('local, in progress')\n", encoding: "utf8" as const };
    await store.put("files", "main.py", localFile);

    const files: BackupFile[] = [{ path: "main.py", content: "print('backed up, stale')\n", encoding: "utf8" }];
    const report = await restoreBackupFilesAdditively(store, files);

    expect(report.written).toEqual([]);
    expect(report.skipped).toEqual(["main.py"]);
    // The local file must be BYTE-IDENTICAL to what it was before restore: never overwritten.
    expect(await store.get("files", "main.py")).toEqual(localFile);
  });

  it("a mix of colliding and new paths: new paths land, colliding paths are left alone, both reported", async () => {
    const store = makeInMemoryStore();
    await store.put("files", "existing.py", { path: "existing.py", text: "local version\n", encoding: "utf8" });

    const files: BackupFile[] = [
      { path: "existing.py", content: "backed-up version\n", encoding: "utf8" },
      { path: "new_file.py", content: "brand new\n", encoding: "utf8" },
    ];
    const report = await restoreBackupFilesAdditively(store, files);

    expect(report.written).toEqual(["new_file.py"]);
    expect(report.skipped).toEqual(["existing.py"]);
    expect(await store.get("files", "existing.py")).toEqual({ path: "existing.py", text: "local version\n", encoding: "utf8" });
    expect(await store.get("files", "new_file.py")).toEqual({ path: "new_file.py", text: "brand new\n", encoding: "utf8" });
  });

  it("an empty files array (a pre-v6 snapshot, normalized to []) writes and skips nothing", async () => {
    const store = makeInMemoryStore();
    const report = await restoreBackupFilesAdditively(store, []);
    expect(report).toEqual({ written: [], skipped: [] });
  });
});
