import { useMemo, useState } from "preact/hooks";
import type { GlossaryView, StrandId, Term } from "../contracts";
import { IconLock } from "../components/icons";

// GlossaryScreen, L13/CONTRACT 7: reads deriveGlossary's output only. D13 accessibility: a real
// semantic list, each unlocked entry a labelled link, each locked entry announced as "locked, not
// yet discovered" (never a bare visual blur a screen reader skips), search results announce a
// count, the silhouette bar is aria-hidden, the lock glyph is the sole visual "locked" cue.

export interface GlossaryScreenProps {
  view: GlossaryView;
  onOpenLesson?: (sourceLessonId: string) => void;
}

type GroupMode = "kind" | "strand";

function groupKey(term: Term & { unlocked: boolean }, mode: GroupMode): string {
  return mode === "kind" ? term.kind : term.strand;
}

export function GlossaryScreen({ view, onOpenLesson }: GlossaryScreenProps) {
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("strand");

  const filteredUnlocked = useMemo(() => {
    const q = query.trim().toLowerCase();
    return view.entries.filter((e) => e.unlocked && (q === "" || e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q)));
  }, [view, query]);
  const locked = useMemo(() => view.entries.filter((e) => !e.unlocked), [view]);

  const groups = useMemo(() => {
    const map = new Map<string, Array<Term & { unlocked: boolean }>>();
    for (const entry of filteredUnlocked) {
      const key = groupKey(entry, groupMode);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return map;
  }, [filteredUnlocked, groupMode]);

  return (
    <div style={{ padding: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span class="mono dim-label"><b style={{ color: "var(--pink)" }}>{view.discovered}</b> found . {view.total - view.discovered} still locked</span>
      </div>
      <div style={{ height: "8px", borderRadius: "5px", background: "var(--panel-2)", border: "1px solid var(--line)", overflow: "hidden", margin: "14px 0 20px" }}>
        <div style={{ height: "100%", width: `${view.total > 0 ? (view.discovered / view.total) * 100 : 0}%`, background: "var(--pink)" }} />
      </div>
      <p class="serif">Your handbook fills itself. Finish a lesson and its words show up here. The blurred ones are waiting for you.</p>

      <label class="visually-hidden" htmlFor="glossary-search">Search the words you have found</label>
      <input
        id="glossary-search"
        class="editor-textarea"
        style={{ width: "100%", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "12px", padding: "14px 16px", margin: "12px 0" }}
        placeholder="search the words you have found..."
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="visually-hidden" role="status">{filteredUnlocked.length} result{filteredUnlocked.length === 1 ? "" : "s"}</div>

      <div class="seg" role="group" aria-label="Group by">
        <button type="button" aria-selected={groupMode === "kind"} onClick={() => setGroupMode("kind")}>By kind</button>
        <button type="button" aria-selected={groupMode === "strand"} onClick={() => setGroupMode("strand")}>By strand</button>
      </div>

      {[...groups.entries()].map(([key, entries]) => (
        <section key={key} style={{ marginTop: "20px" }}>
          <h3 class="dim-label">{key}</h3>
          <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", listStyle: "none", padding: 0 }}>
            {entries.map((term) => (
              <li key={term.id} class="term-card found">
                <a
                  href="#lesson"
                  onClick={(e) => { e.preventDefault(); onOpenLesson?.(term.sourceLessonId); }}
                  style={{ color: "var(--pink)", fontFamily: "var(--font-mono)", fontWeight: 600, display: "block" }}
                >
                  {term.term}
                </a>
                <div style={{ fontSize: "13px", color: "var(--dim)", marginTop: "6px" }}>{term.definition}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h3 class="dim-label" style={{ marginTop: "26px" }}>Still ahead . {locked.length} locked</h3>
      <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px", listStyle: "none", padding: 0 }}>
        {locked.map((term) => (
          <li key={term.id} class="term-card locked" aria-label="locked, not yet discovered">
            <div class="silhouette-bar" aria-hidden="true" />
            <div class="silhouette-line" style={{ width: "90%" }} aria-hidden="true" />
            <div class="silhouette-line" style={{ width: "70%" }} aria-hidden="true" />
            <span style={{ position: "absolute", top: "12px", right: "12px" }}><IconLock /></span>
            <span class="visually-hidden">locked, not yet discovered</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
