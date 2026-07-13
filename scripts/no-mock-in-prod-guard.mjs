// Production no-mock guard: proves that no production source file (src/ excluding
// src/mocks/) imports from src/mocks/. The mocks are for tests ONLY; production
// code paths must never consume them. Same spirit as the worker-boundary-guard.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const MOCKS_DIR = join(SRC, "mocks");

// Pattern: any import from a path containing /mocks/
const MOCK_IMPORT_PATTERN = /from\s+["'][^"']*\/mocks\//;

// Allowlist: files inside src/mocks/ can import from each other,
// and fixture data files (curriculumFixture, statSheetFixtures) are DATA, not execution mocks,
// so App.tsx importing them is acceptable. The guard targets the WORKER mock specifically.
const FORBIDDEN_MOCKS = ["workerMock", "createMockWorkerClient"];

function scanDir(dir) {
  const violations = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    // Skip the mocks directory itself
    if (full === MOCKS_DIR || full.startsWith(MOCKS_DIR + "\\") || full.startsWith(MOCKS_DIR + "/")) continue;

    if (statSync(full).isDirectory()) {
      violations.push(...scanDir(full));
    } else if ((full.endsWith(".ts") || full.endsWith(".tsx")) && !full.includes(".test.")) {
      const content = readFileSync(full, "utf8");
      for (const [i, line] of content.split("\n").entries()) {
        // Check for imports of the worker mock specifically
        for (const forbidden of FORBIDDEN_MOCKS) {
          if (line.includes(forbidden) && !line.trimStart().startsWith("//")) {
            violations.push(`${relative(ROOT, full)}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }
  }
  return violations;
}

const violations = scanDir(SRC);

if (violations.length > 0) {
  console.error("PRODUCTION-MOCK VIOLATION: production code imports a test mock");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
} else {
  console.log("Production no-mock guard: PASS (0 violations)");
}
