// FileTabs, L1/4.2: open-file tabs with a dirty dot on unsaved buffers (autosave means this is
// mostly reassurance, per DESIGN 4.2).

export interface OpenTab {
  path: string;
  name: string;
  dirty: boolean;
}

export interface FileTabsProps {
  tabs: OpenTab[];
  activePath: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function FileTabs({ tabs, activePath, onSelect, onClose }: FileTabsProps) {
  return (
    <div class="file-tabs" role="tablist" aria-label="Open files">
      {tabs.map((t) => (
        <div key={t.path} class="file-tab" role="tab" aria-selected={t.path === activePath} tabIndex={0}
          onClick={() => onSelect(t.path)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(t.path); }}
        >
          {t.name}{t.dirty && <span aria-label="unsaved changes">&bull;</span>}
          <button
            type="button"
            aria-label={`Close ${t.name}`}
            style={{ background: "transparent", border: 0, color: "var(--dim)", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onClose(t.path); }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
