// keepRemoteReconcile (S5, Ruling 3): converts a GitHub Contents API base64-encoded file
// into the FileBlob project-file shape the file rail and the Store's "files" collection use.
//
// RULE (Frederick S5): extension is an EDITABILITY hint only, never the storage-encoding decider.
// The actual storage encoding is determined by VALIDATING the decoded bytes as UTF-8:
//   1. base64-decode to raw bytes
//   2. Try TextDecoder with { fatal: true } (throws on invalid UTF-8)
//   3. On success: re-encode and compare byte-for-byte (catches BOM stripping, etc.)
//   4. On match: store as { text, encoding: "utf8" }
//   5. On mismatch or decode failure: store as { bytes, encoding: "binary" } losslessly
//
// BOM policy: PRESERVE. A file with a UTF-8 BOM round-trips with the BOM intact because
// we decode with { ignoreBOM: true } (does NOT strip the BOM).
import type { FileBlob } from "../../contracts.js";

/**
 * Convert a GitHub Contents API response file ({ path, content (base64), encoding: "base64" })
 * into a FileBlob that can be stored in the "files" collection.
 *
 * @param repoRelativePath  e.g. "m1-variables/main.py"
 * @param base64Content     the base64-encoded file content from the GitHub API
 */
export function reconcileKeepRemoteFile(repoRelativePath: string, base64Content: string): FileBlob {
  // Step 1: decode base64 to raw bytes
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Step 2: try decoding as UTF-8 with fatal mode (rejects invalid sequences)
  // and ignoreBOM: true (preserves a leading BOM if present)
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const text = decoder.decode(bytes);

    // Step 3: re-encode and compare byte-for-byte to catch any decode/re-encode divergence
    const reEncoded = new TextEncoder().encode(text);
    if (reEncoded.length === bytes.length && reEncoded.every((b, i) => b === bytes[i])) {
      // Perfect round-trip: store as text
      return { path: repoRelativePath, text, encoding: "utf8" };
    }
    // Mismatch (e.g. the text decodes but re-encodes differently): store as binary
    return { path: repoRelativePath, bytes, encoding: "binary" };
  } catch {
    // Invalid UTF-8: store as binary losslessly
    return { path: repoRelativePath, bytes, encoding: "binary" };
  }
}
