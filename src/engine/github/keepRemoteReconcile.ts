// keepRemoteReconcile (S5, Ruling 3): converts a GitHub Contents API base64-encoded file
// into the FileBlob project-file shape the file rail and the Store's "files" collection use.
// Uses the shared classifyBytes helper for the text/binary decision.
import type { FileBlob } from "../../contracts.js";
import { classifyBytes } from "../classifyBytes.js";

/**
 * Convert a GitHub Contents API base64-encoded file into a FileBlob.
 *
 * @param repoRelativePath  e.g. "m1-variables/main.py"
 * @param base64Content     the base64-encoded file content from the GitHub API
 */
export function reconcileKeepRemoteFile(repoRelativePath: string, base64Content: string): FileBlob {
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const result = classifyBytes(bytes);
  if (result.kind === "text") {
    return { path: repoRelativePath, text: result.text, encoding: "utf8" };
  }
  return { path: repoRelativePath, bytes, encoding: "binary" };
}
