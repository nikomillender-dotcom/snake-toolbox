// Copies the core Pyodide files from node_modules/pyodide/ to public/pyodide/
// so they are self-hosted (same-origin, no CDN, works offline under require-corp).
// Runs automatically on `npm install` via the postinstall script.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "node_modules", "pyodide");
const DEST = join(ROOT, "public", "pyodide");

const FILES = [
  "pyodide.asm.wasm",
  "pyodide.asm.mjs",
  "pyodide.mjs",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

if (!existsSync(SRC)) {
  console.log("Pyodide not installed yet, skipping asset copy");
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

for (const file of FILES) {
  const src = join(SRC, file);
  const dest = join(DEST, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
  } else {
    console.warn(`Warning: ${file} not found in ${SRC}`);
  }
}

console.log(`Pyodide core assets (${FILES.length} files) copied to public/pyodide/`);
