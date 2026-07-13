// pyodideManifest.ts: the ONE source of truth for the pinned Pyodide version and
// its per-asset hashes (PINS.md). A version bump is ONE change here, not a hunt
// across boot messages, postinstall scripts, and hash tables.
//
// Consumed by: App.tsx (boot message), worker-entry.ts (indexURL), and
// scripts/copy-pyodide-assets.mjs (postinstall).

export const PYODIDE_VERSION = "314.0.2";

export const PYODIDE_WASM_HASH = "f7a8a169e513791e18fa0790fb69d6f2656b779e9012ba57e03e973f0df0b39f";

export const PYODIDE_CORE_FILES = [
  "pyodide.asm.wasm",
  "pyodide.asm.mjs",
  "pyodide.mjs",
  "python_stdlib.zip",
  "pyodide-lock.json",
] as const;
