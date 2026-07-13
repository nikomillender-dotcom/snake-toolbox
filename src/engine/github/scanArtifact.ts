// scanArtifact (CONTRACT 3, backend B8, F2 BLOCKER). Runs BEFORE any commit and BLOCKS ship() (and,
// per D5, backupProgress()) on a hit. Detects token-shaped strings in file contents:
// - "sk-"            : common LLM provider secret key prefix
// - "ghp_"           : GitHub classic PAT prefix
// - "github_pat_"    : GitHub fine-grained PAT prefix
// - "entropy"        : a generic high-entropy string heuristic (catches unlabeled secrets, keys,
//                      or tokens from providers this scanner does not special-case by prefix)
import type { Artifact, ScanResult } from "../../contracts.js";

const PREFIX_PATTERNS: Array<{ kind: "sk-" | "ghp_" | "github_pat_"; regex: RegExp }> = [
  { kind: "sk-", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { kind: "ghp_", regex: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { kind: "github_pat_", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
];

// A conservative generic-entropy heuristic: a long run of base64/hex-ish characters with mixed
// case and digits, unlikely to occur in ordinary prose or code, but common in API keys/tokens.
const ENTROPY_CANDIDATE = /\b[A-Za-z0-9+/_-]{32,}\b/g;

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const ENTROPY_THRESHOLD = 3.5; // bits/char; ordinary English prose is well below this

function looksHighEntropy(candidate: string): boolean {
  const hasUpper = /[A-Z]/.test(candidate);
  const hasLower = /[a-z]/.test(candidate);
  const hasDigit = /[0-9]/.test(candidate);
  const mixedEnough = [hasUpper, hasLower, hasDigit].filter(Boolean).length >= 2;
  return mixedEnough && shannonEntropy(candidate) >= ENTROPY_THRESHOLD;
}

function scanText(text: string): Array<"sk-" | "ghp_" | "github_pat_" | "entropy"> {
  const hits: Array<"sk-" | "ghp_" | "github_pat_" | "entropy"> = [];
  for (const { kind, regex } of PREFIX_PATTERNS) {
    if (regex.test(text)) hits.push(kind);
  }
  const entropyMatches = text.match(ENTROPY_CANDIDATE) ?? [];
  if (entropyMatches.some((candidate) => looksHighEntropy(candidate))) {
    hits.push("entropy");
  }
  return hits;
}

/** The hit-kind union scanText/scanArtifact/scanFileBlobHits all share (CONTRACT 3, ScanResult["hits"][number]["kind"]). */
export type SecretHitKind = "sk-" | "ghp_" | "github_pat_" | "entropy";

/**
 * Scans a single FileBlob-shaped file's content for secret-shaped strings (F2), reusing the exact
 * same text-vs-bytes-as-latin1 convention scanArtifact() already uses per Artifact file. Used by
 * gatherBackupFiles (B14 v6) to run the F2 scan PER FILE on the Sandbox files collection, so one
 * flagged file can be excluded without refusing the whole backup.
 */
export function scanFileBlobHits(file: { text?: string; bytes?: Uint8Array }): SecretHitKind[] {
  const text = file.text ?? (file.bytes ? bytesToLatin1(file.bytes) : "");
  return scanText(text);
}

export function scanArtifact(artifact: Artifact): ScanResult {
  const hits: ScanResult["hits"] = [];
  for (const file of artifact.files) {
    const text = file.text ?? (file.bytes ? bytesToLatin1(file.bytes) : "");
    for (const kind of scanText(text)) {
      hits.push({ path: file.path, kind });
    }
  }
  // The README and commit message are also shipped content; scan them too.
  for (const kind of scanText(artifact.readme)) hits.push({ path: "README.md", kind });
  for (const kind of scanText(artifact.commitMessage)) hits.push({ path: "<commit message>", kind });

  return { clean: hits.length === 0, hits };
}

/**
 * Scans an arbitrary serialized JSON payload (used by backupProgress's D5 runtime gate, which
 * scans the whole ProgressBackup JSON string, not a per-file Artifact).
 */
export function scanSerializedPayload(text: string): ScanResult {
  const hits = scanText(text).map((kind) => ({ path: "<payload>", kind }));
  return { clean: hits.length === 0, hits };
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}
