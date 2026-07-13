// Production no-mock guard (S3): proves that no production source file (src/ excluding
// src/mocks/ and test files) imports from src/mocks/ EXCEPT the explicitly allowlisted
// DATA fixture(s). The mocks directory is for tests ONLY; execution mocks must never ship.
//
// RULE: any prod non-test file importing from /mocks/ is a violation, UNLESS the imported
// module is on the DATA_FIXTURE_ALLOWLIST (a data-only stand-in with no runtime behavior, no
// network calls, no state, acceptable until its real binding ships).
//
// curriculum-bundle round: the real CurriculumBundle loader (src/curriculum/realCurriculumBundle.ts)
// now ships and App.tsx/AppRoot.tsx are wired to it, so curriculumFixture is REMOVED from this
// allowlist. It still exists in src/mocks/ for tests only (isTestFile() below already exempts
// *.test.ts / *.test.tsx from this scan entirely, so no allowlist entry is needed for test usage).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const MOCKS_DIR = join(SRC, "mocks");

// The DIRECTORY rule: any import from a path containing /mocks/
const MOCK_IMPORT_PATTERN = /from\s+["'][^"']*\/mocks\/([^"']+)["']/;

// Allowlisted DATA fixtures (not execution mocks): these are pure data that serve as
// stand-ins for the CurriculumBundle loader and stat sheet derivation until those are
// wired to real content. They contain no runtime behavior, no network calls, no state.
const DATA_FIXTURE_ALLOWLIST = new Set([
  "statSheetFixtures",
]);

function isTestFile(path) {
  return path.includes(".test.") || path.includes(".spec.");
}

function scanDir(dir) {
  const violations = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    // Skip the mocks directory itself
    if (full === MOCKS_DIR || full.startsWith(MOCKS_DIR + "\\") || full.startsWith(MOCKS_DIR + "/")) continue;

    if (statSync(full).isDirectory()) {
      violations.push(...scanDir(full));
    } else if ((full.endsWith(".ts") || full.endsWith(".tsx")) && !isTestFile(full)) {
      const content = readFileSync(full, "utf8");
      for (const [i, line] of content.split("\n").entries()) {
        if (line.trimStart().startsWith("//")) continue; // skip comments
        const match = MOCK_IMPORT_PATTERN.exec(line);
        if (match) {
          const importedModule = match[1].replace(/\.(ts|tsx|js)$/, "").replace(/["']$/, "");
          if (!DATA_FIXTURE_ALLOWLIST.has(importedModule)) {
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
  console.error("PRODUCTION-MOCK VIOLATION: production code imports an execution mock from /mocks/");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
} else {
  console.log("Production no-mock guard: PASS (0 violations)");
}
