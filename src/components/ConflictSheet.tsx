import { useRef, useState } from "preact/hooks";
import type { ConflictChoice } from "../contracts";
import { useDialogFocus } from "../lib/useDialogFocus";

// ConflictSheet, L8/P3: offers the ConflictChoice[] the engine returned. Never auto-resolves; a
// conflict always asks. shipAsCopy REQUIRES a new folder path collected here.

export interface ConflictSheetProps {
  open: boolean;
  choices: ConflictChoice[];
  currentFolderPath: string;
  onResolve: (choice: ConflictChoice, newFolderPath?: string) => void;
  onCancel: () => void;
}

const CHOICE_COPY: Record<ConflictChoice, { label: string; body: string }> = {
  keepMine: { label: "Keep mine", body: "Re-ship your local version over the moved remote file." },
  keepRemote: { label: "Keep the version on GitHub", body: "Your local project updates to match what's already there." },
  shipAsCopy: { label: "Ship as a copy", body: "Name a new folder and ship a fresh commit with no conflict." }
};

export function ConflictSheet({ open, choices, currentFolderPath, onResolve, onCancel }: ConflictSheetProps) {
  const [copyPath, setCopyPath] = useState(`${currentFolderPath}-copy`);
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open, containerRef, initialFocusRef: headingRef });

  if (!open) return null;

  return (
    <div class="dialog-overlay">
      <div ref={containerRef} class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="conflict-heading" style={{ maxWidth: "440px" }}>
        <h2 id="conflict-heading" class="serif">GitHub moved out from under this ship</h2>
        <p>Someone (probably you, on another device) changed this file remotely. What should happen?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
          {choices.map((choice, i) => (
            <div key={choice} class="card" style={{ padding: "12px" }}>
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>{CHOICE_COPY[choice].label}</div>
              <div style={{ color: "var(--dim)", fontSize: "13px", marginBottom: "8px" }}>{CHOICE_COPY[choice].body}</div>
              {choice === "shipAsCopy" && (
                <input
                  class="editor-textarea"
                  style={{ background: "var(--panel-2)", borderRadius: "8px", padding: "8px", marginBottom: "8px" }}
                  aria-label="New folder path for the copy"
                  value={copyPath}
                  onInput={(e) => setCopyPath((e.target as HTMLInputElement).value)}
                />
              )}
              <button
                type="button"
                class="btn btn-primary btn-small"
                ref={i === 0 ? headingRef : undefined}
                onClick={() => onResolve(choice, choice === "shipAsCopy" ? copyPath : undefined)}
              >
                Choose {CHOICE_COPY[choice].label}
              </button>
            </div>
          ))}
        </div>
        <div class="row"><button type="button" class="btn btn-ghost btn-small" onClick={onCancel}>Decide later</button></div>
      </div>
    </div>
  );
}
