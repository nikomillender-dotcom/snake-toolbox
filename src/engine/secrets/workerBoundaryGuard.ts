// workerBoundaryGuard (F1 BLOCKER, I3, I9 item 10). A static source scan proving, mechanically,
// that no file under src/worker/** ever imports anything from src/secrets/**. This is the closest
// thing to a real bundler proof available without shipping Edelgard's Vite build: if the worker's
// OWN source tree contains zero import edges into the secrets module, no bundler configuration can
// accidentally pull SecretsVault into the worker chunk, because there is no reference to pull.
//
// Run standalone: `npm run worker-guard`. Also exercised as a vitest test
// (workerBoundaryGuard.test.ts) so it runs on every `npm test` too.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const IMPORT_PATTERN = /(?:import|export)\s+(?:[^'"]*from\s+)?["']([^"']+)["']/g;

export interface BoundaryViolation {
  file: string;
  importSpecifier: string;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scans every .ts file under `workerDir` for import/export specifiers that resolve into
 * `forbiddenDir` (matched as a relative-path prefix, e.g. "../secrets/"), and returns every
 * violation found. An empty array means the boundary holds.
 */
export function scanForForbiddenImports(workerDir: string, forbiddenSpecifierFragment: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  for (const file of listTsFiles(workerDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier && specifier.includes(forbiddenSpecifierFragment)) {
        violations.push({ file: relative(workerDir, file), importSpecifier: specifier });
      }
    }
  }
  return violations;
}
