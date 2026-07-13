import type { StatSheet } from "../contracts";

// ConceptMap, ProjectLadder, PortfolioShelf: named in the L1 component inventory, but the mastery
// model's exact graph/rungs are [TBD-BLUEPRINT] in DESIGN.md section 5 (Byleth's curriculum
// authoring job). Built here as honest, functional stubs driven off the same StatSheet the Stat
// Screen reads (no new tracking burden, per Niko's stat-screen ask), documented as thinner than the
// Learn/Sandbox/Stat/Review/Glossary surfaces in BUILD-REPORT.md.

export function ConceptMap({ sheet }: { sheet: StatSheet }) {
  return (
    <section aria-label="Concept map" class="card" style={{ padding: "16px" }}>
      <h3 class="dim-label">Concept map</h3>
      <p style={{ color: "var(--dim)", fontSize: "13px" }}>
        Where you stand on each strand (a placeholder read over the same six stats the Stat Screen
        shows; the real concept graph is Byleth's curriculum authoring job).
      </p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "10px" }}>
        {sheet.stats.map((s) => (
          <li key={s.key} style={{ fontSize: "13px" }}>
            <div style={{ fontWeight: 700 }}>{s.key}</div>
            <div style={{ color: "var(--dim)" }}>{s.key === "SHIP" ? `${s.value} shipped` : `${s.value} / ${s.max}`}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface LadderRung { id: string; title: string; status: "done" | "current" | "ahead"; }

export function ProjectLadder({ rungs }: { rungs: LadderRung[] }) {
  return (
    <section aria-label="Project ladder" class="card" style={{ padding: "16px" }}>
      <h3 class="dim-label">Project ladder</h3>
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rungs.map((r) => (
          <li key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", opacity: r.status === "ahead" ? 0.55 : 1 }}>
            <span aria-hidden="true">{r.status === "done" ? "✓" : r.status === "current" ? "▸" : "○"}</span>
            <span>{r.title}</span>
            <span class="visually-hidden">
              {r.status === "done" ? "done" : r.status === "current" ? "in progress" : "aspirational, not started"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface PortfolioEntry { id: string; name: string; url?: string; isCarryProject?: boolean }

export function PortfolioShelf({ entries }: { entries: PortfolioEntry[] }) {
  return (
    <section aria-label="Portfolio shelf" class="card" style={{ padding: "16px" }}>
      <h3 class="dim-label">Portfolio shelf</h3>
      {entries.length === 0 ? (
        <p style={{ color: "var(--dim)", fontSize: "13px" }}>Your first shipped artifact lands here.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "10px" }}>
          {entries.map((e) => (
            <li key={e.id} class="card" style={{ padding: "10px" }}>
              <div style={{ fontWeight: 700 }}>{e.name}{e.isCarryProject && <span class="dim-label"> . carry project</span>}</div>
              {e.url ? <a href={e.url} target="_blank" rel="noreferrer">View -&gt;</a> : <span class="dim-label">queued</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
