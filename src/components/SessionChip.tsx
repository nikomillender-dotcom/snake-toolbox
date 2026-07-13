import { useState } from "preact/hooks";
import type { NameInfo } from "../contracts";
import { RestartConfirmDialog } from "./RestartConfirmDialog";
import { IconRestart } from "./icons";

// SessionChip + SessionInspector, L3/K5/F11/P4. The chip is driven by the `namespace` event the
// worker PUSHES after every runDone (do not poll); tapping it PULLS a fresh snapshot via
// requestNamespace so the inspector's on-open read is never stale (P4). Names with
// fromCurrentRun:false render dimmer (prior-run ghost state). Reduced motion: no pulse.

export type SessionState = "cold" | "live" | "running";

export interface SessionChipProps {
  state: SessionState;
  minutes: number;
  names: NameInfo[];
  onOpenInspector: () => void; // fires requestNamespace (the P4 pull)
  onRestart: () => void; // fires resetSession; Fresh Slate toast should only show on resetDone{ok:true}
  reducedMotion?: boolean;
}

const GROUP_LABELS: Record<NameInfo["group"], string> = { import: "imports", function: "functions", variable: "variables" };

export function SessionChip({ state, minutes, names, onOpenInspector, onRestart, reducedMotion }: SessionChipProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const label = state === "running" ? "running..." : state === "live" ? `Live ${minutes}m . ${names.length} names` : "Session: cold";

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpenInspector();
  }

  const groups: NameInfo["group"][] = ["import", "function", "variable"];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        class="session-chip"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
      >
        <span class={`dot ${state}${state === "running" && reducedMotion ? "" : ""}`} aria-hidden="true" />
        <span>{label}</span>
        <span aria-hidden="true">&#9650;</span>
      </button>
      {open && (
        <div class="session-inspector" role="region" aria-label="Session inspector">
          {names.length === 0 ? (
            <p style={{ color: "var(--dim)", fontSize: "13px" }}>Nothing defined yet. Run some code and it shows up here.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {groups.map((g) => {
                const items = names.filter((n) => n.group === g);
                if (items.length === 0) return null;
                return (
                  <li key={g}>
                    <h4 class="dim-label" style={{ margin: "8px 6px 4px" }}>{GROUP_LABELS[g]}</h4>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {items.map((n) => (
                        <li key={n.name} class={`iname${n.fromCurrentRun ? "" : " prior"}`}>
                          <span class="nm">{n.name}</span>
                          <span style={{ color: "var(--dim)", fontSize: "11px" }}>{n.typeName}</span>
                          <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.8 }}>{n.repr}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--line)" }}>
            <button type="button" class="btn btn-ghost btn-small" style={{ width: "100%" }} onClick={() => setConfirmOpen(true)}>
              <IconRestart /> Restart session
            </button>
          </div>
        </div>
      )}
      <RestartConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onRestart();
        }}
      />
    </div>
  );
}
