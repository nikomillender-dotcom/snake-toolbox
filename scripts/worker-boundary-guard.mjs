// Worker boundary guard (F1 BLOCKER): statically proves that no file under
// src/engine/worker/ or src/worker-entry.ts imports from src/engine/secrets/.
// This is the architectural boundary: the worker is a hostile-input zone and
// must never have access to the SecretsVault or any bearer secret.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_DIRS = [
  join(ROOT, "src", "engine", "worker"),
];
const WORKER_FILES = [
  join(ROOT, "src", "worker-entry.ts"),
];

const FORBIDDEN_PATTERN = /from\s+["'].*secrets/;

function scanDir(dir) {
  const violations = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      violations.push(...scanDir(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      const content = readFileSync(full, "utf8");
      for (const [i, line] of content.split("\n").entries()) {
        if (FORBIDDEN_PATTERN.test(line)) {
          violations.push(`${relative(ROOT, full)}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }
  return violations;
}

const violations = [];
for (const dir of WORKER_DIRS) {
  try { violations.push(...scanDir(dir)); } catch { /* dir may not exist */ }
}
for (const file of WORKER_FILES) {
  try {
    const content = readFileSync(file, "utf8");
    for (const [i, line] of content.split("\n").entries()) {
      if (FORBIDDEN_PATTERN.test(line)) {
        violations.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      }
    }
  } catch { /* file may not exist */ }
}

if (violations.length > 0) {
  console.error("F1 BOUNDARY VIOLATION: worker code imports from secrets/");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
} else {
  console.log("Worker boundary guard: PASS (0 violations)");
}
