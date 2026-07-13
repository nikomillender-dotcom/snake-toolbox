import type { ComponentChildren } from "preact";
import { IconCoil } from "./icons";

// AppShell, L1/v0 1.2: persistent left rail in landscape, collapsing to bottom tabs in portrait.
// Three targets: Learn, Sandbox, Progress. The rail also holds the runtime status dot.

export type Surface = "learn" | "sandbox" | "progress";

export interface AppShellProps {
  active: Surface;
  onNavigate: (s: Surface) => void;
  runtimeState: "warm" | "cold" | "loading";
  children: ComponentChildren;
}

const TARGETS: Array<{ id: Surface; label: string }> = [
  { id: "learn", label: "Learn" },
  { id: "sandbox", label: "Sandbox" },
  { id: "progress", label: "Progress" }
];

export function AppShell({ active, onNavigate, runtimeState, children }: AppShellProps) {
  return (
    <div class="app-shell">
      <a href="#main-content" class="skip-link">Skip to content</a>
      <div class="shell-body">
        <nav class="rail" aria-label="Main navigation">
          <IconCoil size={32} />
          {TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              class="rail-btn"
              aria-current={active === t.id ? "page" : undefined}
              onClick={() => onNavigate(t.id)}
            >
              {t.label}
            </button>
          ))}
          <div class="rail-spacer" />
          <span class={`runtime-dot ${runtimeState === "warm" ? "warm" : runtimeState === "loading" ? "loading" : "cold"}`} title={`Python runtime: ${runtimeState}`} />
          <span class="visually-hidden" role="status">Python runtime is {runtimeState}</span>
        </nav>
        <main id="main-content" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </main>
      </div>
      <nav class="bottom-tabs" aria-label="Main navigation">
        {TARGETS.map((t) => (
          <button key={t.id} type="button" aria-current={active === t.id ? "page" : undefined} onClick={() => onNavigate(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
