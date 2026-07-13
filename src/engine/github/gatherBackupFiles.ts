// gatherBackupFiles (CONTRACT 3, backend B14 v6, DESIGN v0.4.3). Gathers the persisted `files`
// Store collection into ProgressBackup.files as BackupFile[], so backupProgress's snapshot carries
// the whole Sandbox workbench, not just the Learn journey. Reuses the shared classifyBytes helper
// (the same text-vs-binary call keepRemoteReconcile uses) and the base64 utilities, so there is no
// second text/binary detector in the codebase.
//
// Three exclusion rules, each SKIPPED-AND-REPORTED, never silently dropped and never truncated:
//   1. per-file cap (PER_FILE_CAP_BYTES): an oversized file is excluded whole.
//   2. F2 secret scan, run PER FILE (D5): a flagged file is excluded; it does NOT refuse the rest
//      of the backup (unlike the whole-snapshot D5 gate on `settings`, which is unchanged).
//   3. total cap (TOTAL_FILES_CAP_BYTES): once the per-file survivors are secret-clean and
//      individually under cap, small/text files win a spot first (Niko's irreplaceable code); the
//      largest binaries are the first to be excluded when the aggregate would exceed the cap.
import type { BackupFile, FileBlob, Store } from "../../contracts.js";
import { classifyBytes } from "../classifyBytes.js";
import { bytesToBase64 } from "./base64.js";
import { scanFileBlobHits } from "./scanArtifact.js";

// Tunable at build (backend B14 explicitly calls both of these "suggested, tunable" numbers).
export const PER_FILE_CAP_BYTES = 512 * 1024; // 512 KB
export const TOTAL_FILES_CAP_BYTES = 4 * 1024 * 1024; // ~4 MB aggregate

export type BackupFileSkipReason = "secretDetected" | "overPerFileCap" | "overTotalCap";
export interface BackupFileSkip {
  path: string;
  reason: BackupFileSkipReason;
  sizeBytes: number;
}
export interface GatherBackupFilesResult {
  files: BackupFile[];
  skipped: BackupFileSkip[];
}

interface Candidate {
  path: string;
  backupFile: BackupFile;
  sizeBytes: number;
  isText: boolean;
}

export interface GatherBackupFilesCaps {
  /** Override for PER_FILE_CAP_BYTES. Test-only hook; production callers use the default. */
  perFileCapBytes?: number;
  /** Override for TOTAL_FILES_CAP_BYTES. Test-only hook; production callers use the default. */
  totalCapBytes?: number;
}

function rawSizeBytes(blob: FileBlob): number {
  if (blob.text !== undefined) return new TextEncoder().encode(blob.text).length;
  if (blob.bytes !== undefined) return blob.bytes.length;
  return 0;
}

/** Converts a stored FileBlob into the JSON-safe BackupFile wire shape (DESIGN v0.4.3). */
function toBackupFile(path: string, blob: FileBlob): { backupFile: BackupFile; isText: boolean } {
  if (blob.text !== undefined) {
    return { backupFile: { path, content: blob.text, encoding: "utf8" }, isText: true };
  }
  const bytes = blob.bytes ?? new Uint8Array();
  const classified = classifyBytes(bytes);
  if (classified.kind === "text") {
    return { backupFile: { path, content: classified.text, encoding: "utf8" }, isText: true };
  }
  return { backupFile: { path, content: bytesToBase64(bytes), encoding: "base64" }, isText: false };
}

/**
 * Gathers the `files` Store collection into BackupFile[] for a progress backup, applying the
 * per-file secret scan, the per-file size cap, and the total size cap. Every exclusion is
 * returned in `skipped` (never a silent drop).
 */
export async function gatherBackupFiles(store: Store, caps: GatherBackupFilesCaps = {}): Promise<GatherBackupFilesResult> {
  const perFileCapBytes = caps.perFileCapBytes ?? PER_FILE_CAP_BYTES;
  const totalCapBytes = caps.totalCapBytes ?? TOTAL_FILES_CAP_BYTES;
  const rows = await store.list<FileBlob>("files");
  const skipped: BackupFileSkip[] = [];
  const candidates: Candidate[] = [];

  for (const { key, value } of rows) {
    const path = value.path || key;
    const sizeBytes = rawSizeBytes(value);

    if (sizeBytes > perFileCapBytes) {
      skipped.push({ path, reason: "overPerFileCap", sizeBytes });
      continue;
    }

    // D5: the F2 scan runs PER FILE here. A hit excludes just this file (never the whole backup);
    // scanned on the ORIGINAL stored content, before any base64 encoding, so the scan sees the
    // real text/bytes rather than an encoded string that could evade the pattern/entropy checks.
    if (scanFileBlobHits(value).length > 0) {
      skipped.push({ path, reason: "secretDetected", sizeBytes });
      continue;
    }

    const { backupFile, isText } = toBackupFile(path, value);
    candidates.push({ path, backupFile, sizeBytes, isText });
  }

  // Total cap: text files before binary files (irreplaceable code always wins over a
  // re-downloadable dataset), then ascending size within each group, so small files fit first.
  candidates.sort((a, b) => {
    if (a.isText !== b.isText) return a.isText ? -1 : 1;
    return a.sizeBytes - b.sizeBytes;
  });

  const files: BackupFile[] = [];
  let runningTotal = 0;
  for (const candidate of candidates) {
    if (runningTotal + candidate.sizeBytes > totalCapBytes) {
      skipped.push({ path: candidate.path, reason: "overTotalCap", sizeBytes: candidate.sizeBytes });
      continue;
    }
    files.push(candidate.backupFile);
    runningTotal += candidate.sizeBytes;
  }

  return { files, skipped };
}
