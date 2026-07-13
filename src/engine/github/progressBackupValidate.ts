// progressBackupValidate (backend B14, D12). Before applying ANYTHING from a restored
// progress.json, validate it against the ProgressBackup shape (required fields present and
// well-typed) and REJECT a corrupt or partial snapshot CLEANLY: "that backup looked incomplete,
// nothing changed," never a half-applied restore.
import type { BackupFile, CompletedNode, ProgressBackup, ReviewState } from "../../contracts.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCompletedNode(node: unknown, index: number, errors: string[]): node is CompletedNode {
  if (!isPlainObject(node)) {
    errors.push(`completedNodes[${index}] is not an object`);
    return false;
  }
  if (!isString(node.nodeId)) errors.push(`completedNodes[${index}].nodeId must be a string`);
  if (!isString(node.kind)) errors.push(`completedNodes[${index}].kind must be a string`);
  if (!isString(node.moduleId)) errors.push(`completedNodes[${index}].moduleId must be a string`);
  if (!isNumber(node.timestamp)) errors.push(`completedNodes[${index}].timestamp must be a number`);
  return errors.length === 0;
}

function validateBackupFile(file: unknown, index: number, errors: string[]): file is BackupFile {
  if (!isPlainObject(file)) {
    errors.push(`files[${index}] is not an object`);
    return false;
  }
  if (!isString(file.path)) errors.push(`files[${index}].path must be a string`);
  if (!isString(file.content)) errors.push(`files[${index}].content must be a string`);
  if (file.encoding !== "utf8" && file.encoding !== "base64") {
    errors.push(`files[${index}].encoding must be "utf8" or "base64"`);
  }
  return errors.length === 0;
}

function validateReviewState(row: unknown, index: number, errors: string[]): row is ReviewState {
  if (!isPlainObject(row)) {
    errors.push(`reviews[${index}] is not an object`);
    return false;
  }
  const requiredStrings = ["itemId", "sourceLessonId", "state"] as const;
  const requiredNumbers = ["stability", "difficulty", "due", "lastReviewed", "reps", "lapses"] as const;
  for (const key of requiredStrings) {
    if (!isString(row[key])) errors.push(`reviews[${index}].${key} must be a string`);
  }
  for (const key of requiredNumbers) {
    if (!isNumber(row[key])) errors.push(`reviews[${index}].${key} must be a number`);
  }
  const validStates = new Set(["new", "learning", "review", "relearning"]);
  if (isString(row.state) && !validStates.has(row.state)) {
    errors.push(`reviews[${index}].state must be one of new|learning|review|relearning`);
  }
  return errors.length === 0;
}

/**
 * Validates a parsed JSON value against the ProgressBackup shape. Returns { valid: false, errors }
 * on ANYTHING corrupt or partial; never mutates or partially trusts the input. Callers MUST check
 * `valid` before touching `.completedNodes` etc. on the input.
 */
export function validateProgressBackup(candidate: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ["backup payload is not a JSON object"] };
  }

  if (!isNumber(candidate.schemaVersion)) errors.push("schemaVersion must be a number");
  if (!isNumber(candidate.savedAt)) errors.push("savedAt must be a number");

  if (!Array.isArray(candidate.completedNodes)) {
    errors.push("completedNodes must be an array");
  } else {
    candidate.completedNodes.forEach((n, i) => validateCompletedNode(n, i, errors));
  }

  if (!Array.isArray(candidate.reviews)) {
    errors.push("reviews must be an array");
  } else {
    candidate.reviews.forEach((r, i) => validateReviewState(r, i, errors));
  }

  if (!isPlainObject(candidate.settings)) errors.push("settings must be an object");

  // v6 back-compat (DESIGN v0.4.3): a pre-v6 snapshot legitimately has no `files` at all (it
  // captured none). An ABSENT `files` is accepted (defaulted to [] by parseProgressBackup below);
  // only a PRESENT-but-malformed `files` is rejected.
  if (candidate.files !== undefined) {
    if (!Array.isArray(candidate.files)) {
      errors.push("files must be an array when present");
    } else {
      candidate.files.forEach((f, i) => validateBackupFile(f, i, errors));
    }
  }

  if (!isPlainObject(candidate.profile)) {
    errors.push("profile must be an object");
  } else {
    if (!isString(candidate.profile.name)) errors.push("profile.name must be a string");
    if (!isString(candidate.profile.epithet)) errors.push("profile.epithet must be a string");
    if (!isNumber(candidate.profile.lastViewedAt)) errors.push("profile.lastViewedAt must be a number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Type-narrowing convenience: returns the validated ProgressBackup, or null on any validation
 * failure. v6 back-compat: a pre-v6 snapshot has no `files`; it is normalized to `[]` here (it
 * captured none), so every caller downstream can rely on `.files` always being an array.
 */
export function parseProgressBackup(candidate: unknown): ProgressBackup | null {
  const result = validateProgressBackup(candidate);
  if (!result.valid) return null;
  const obj = candidate as ProgressBackup & { files?: BackupFile[] };
  return { ...obj, files: obj.files ?? [] };
}
