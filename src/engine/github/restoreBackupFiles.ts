// restoreBackupFiles (CONTRACT 3, backend B14 v6, integration I14). Decodes each BackupFile from a
// restored ProgressBackup back into a FileBlob and writes it into the `files` Store collection
// ADDITIVELY: a path with no local file is restored; a path that already exists locally is LEFT
// ALONE (local wins) and reported, NEVER overwritten (the never-destroy invariant, the same
// discipline `completedNodes` union-by-id already follows). A fresh device has no local files, so
// every backed-up file lands.
import type { BackupFile, FileBlob, Store } from "../../contracts.js";
import { base64ToBytes } from "./base64.js";

export interface RestoreFilesReport {
  written: string[];
  skipped: string[]; // paths left alone because a local file already exists at that path
}

/** Decodes a BackupFile's JSON-safe wire content back into a real, storable FileBlob. */
export function decodeBackupFile(file: BackupFile): FileBlob {
  if (file.encoding === "base64") {
    return { path: file.path, bytes: base64ToBytes(file.content), encoding: "binary" };
  }
  return { path: file.path, text: file.content, encoding: "utf8" };
}

/**
 * Applies a restored ProgressBackup's `files` to the local `files` Store collection additively.
 * Never overwrites an existing local file; every skipped collision is reported.
 */
export async function restoreBackupFilesAdditively(store: Store, files: BackupFile[]): Promise<RestoreFilesReport> {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const existing = await store.get<FileBlob>("files", file.path);
    if (existing !== undefined) {
      skipped.push(file.path);
      continue;
    }
    await store.put("files", file.path, decodeBackupFile(file));
    written.push(file.path);
  }
  return { written, skipped };
}
