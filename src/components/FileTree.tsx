import { useState } from "preact/hooks";

// FileTree, L3/4.2: project navigator, tap-to-open. F23: rename/duplicate/delete are reachable via
// a visible "more" button on every node (never long-press-only), so there is always a discoverable,
// non-timing alternative alongside any future long-press gesture.

export interface FileNode {
  path: string;
  name: string;
  kind: "file" | "folder";
  depth: number;
}

export interface FileTreeProps {
  nodes: FileNode[];
  activePath: string;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

export function FileTree({ nodes, activePath, onOpen, onRename, onDuplicate, onDelete, onNewFile, onNewFolder }: FileTreeProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  return (
    <nav class="file-rail" aria-label="Project files">
      <div class="dim-label">project</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {nodes.map((n) => (
          <li key={n.path} style={{ position: "relative", paddingLeft: n.depth * 12 }}>
            <button
              type="button"
              class="file-node"
              aria-current={n.path === activePath}
              onClick={() => n.kind === "file" && onOpen(n.path)}
              style={{ width: "calc(100% - 40px)", textAlign: "left" }}
            >
              {n.name}
            </button>
            {n.kind === "file" && (
              <button
                type="button"
                class="btn btn-ghost btn-small"
                aria-haspopup="true"
                aria-expanded={menuFor === n.path}
                aria-label={`More actions for ${n.name}`}
                style={{ position: "absolute", right: 0, top: 0, minHeight: "40px" }}
                onClick={() => setMenuFor((cur) => (cur === n.path ? null : n.path))}
              >
                &#8942;
              </button>
            )}
            {menuFor === n.path && (
              <div class="card" style={{ position: "absolute", right: 0, top: "40px", zIndex: 10, padding: "6px" }} role="menu">
                <button type="button" class="btn btn-ghost btn-small" role="menuitem" onClick={() => { onRename(n.path); setMenuFor(null); }}>Rename</button>
                <button type="button" class="btn btn-ghost btn-small" role="menuitem" onClick={() => { onDuplicate(n.path); setMenuFor(null); }}>Duplicate</button>
                <button type="button" class="btn btn-ghost btn-small" role="menuitem" onClick={() => { onDelete(n.path); setMenuFor(null); }}>Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <button type="button" class="btn btn-ghost btn-small" style={{ width: "100%", marginTop: "6px" }} onClick={onNewFile}>+ new file</button>
      <button type="button" class="btn btn-ghost btn-small" style={{ width: "100%", marginTop: "6px" }} onClick={onNewFolder}>+ new folder</button>
    </nav>
  );
}
