import { useState } from "preact/hooks";

// PackageSheet, L3/4.6: two tiers (built-in one-tap with size estimates; PyPI pure-Python via
// micropip) and the honest C-extension wall copy, never a spinner that never resolves.

export interface BuiltinPackage { name: string; sizeMb: number; }

export interface PackageSheetProps {
  open: boolean;
  onClose: () => void;
  builtins: BuiltinPackage[];
  onAdd: (name: string) => void;
  progressByName?: Record<string, { phase: "download" | "install" | "done"; pct: number }>;
}

const CANNOT_RUN = new Set(["scipy-native-blas-x", "some-c-extension-only-lib"]);

export function PackageSheet({ open, onClose, builtins, onAdd, progressByName = {} }: PackageSheetProps) {
  const [query, setQuery] = useState("");
  if (!open) return null;

  const filtered = builtins.filter((p) => p.name.includes(query.toLowerCase()));
  const wallHit = query.length > 2 && CANNOT_RUN.has(query.toLowerCase());

  return (
    <div class="dialog-overlay">
      <div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="pkg-heading" style={{ maxWidth: "480px" }}>
        <h3 id="pkg-heading">Add a package</h3>
        <input
          class="editor-textarea"
          style={{ background: "var(--panel-2)", borderRadius: "8px", padding: "10px" }}
          placeholder="search packages..."
          aria-label="Search packages"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <h4 class="dim-label" style={{ marginTop: "16px" }}>Built in (fast, cached)</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {filtered.map((p) => {
            const prog = progressByName[p.name];
            return (
              <li key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                <span class="mono">{p.name} <span style={{ color: "var(--dim)" }}>~{p.sizeMb} MB</span></span>
                {prog ? (
                  <span class="dim-label">{prog.phase} {prog.pct}%</span>
                ) : (
                  <button type="button" class="btn btn-ghost btn-small" onClick={() => onAdd(p.name)}>add</button>
                )}
              </li>
            );
          })}
        </ul>
        {wallHit && (
          <div class="banner warn">
            This one has C code under the hood, so it can't run in the browser sandbox. Here's what
            usually works instead: check for a pure-Python alternative, or use it locally and bring
            the results in as a data file.
          </div>
        )}
        <div class="row">
          <button type="button" class="btn btn-ghost btn-small" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
