// Store schema (CONTRACT 2, backend B6). schemaVersion 2 (v1 was 1). The v0.4 fold adds the
// `reviews` (FSRS) and `githubMeta` (token expiry + last-backup) collections, the first genuinely
// STATEFUL stored data, so the version bumps 1 -> 2 (D6, checklist item 30).
export const CURRENT_SCHEMA_VERSION = 2;

export const V1_COLLECTIONS = [
  "projects",
  "files",
  "progress",
  "settings",
  "shipQueue",
  "curriculumCache",
] as const;

export const V2_NEW_COLLECTIONS = ["reviews", "githubMeta"] as const;

export const ALL_COLLECTIONS = [...V1_COLLECTIONS, ...V2_NEW_COLLECTIONS] as const;

export type KnownCollection = (typeof ALL_COLLECTIONS)[number];
