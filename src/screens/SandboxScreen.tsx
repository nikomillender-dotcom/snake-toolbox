import { useEffect, useRef, useState } from "preact/hooks";
import type { WorkerClient } from "../workerClient";
import type { NameInfo } from "../contracts";
import { CodeEditor, type CodeEditorHandle, type EditorMode } from "../components/CodeEditor";
import { KeyRow } from "../components/KeyRow";
import { RunBar } from "../components/RunBar";
import { OutputStream, bytesToDataUrl, type ActiveInputRequest, type OutputItem } from "../components/OutputStream";
import { FileTree, type FileNode } from "../components/FileTree";
import { FileTabs, type OpenTab } from "../components/FileTabs";
import { SessionChip } from "../components/SessionChip";
import { PackageSheet } from "../components/PackageSheet";
import { DegradedBootBanner } from "../components/DegradedBootBanner";

export interface SandboxScreenProps {
  worker: WorkerClient;
  inputCapable: boolean;
  /** editor backend override (a settings escape hatch AND what tests use to avoid the async CM6
   * mount race); defaults to "auto" (CodeMirror 6, falling back to the accessible textarea if it
   * cannot mount, per F17). */
  editorMode?: EditorMode;
  /** Files drained from the worker via fileDrain (v5). UPSERT into the file tree. */
  drainedFiles?: import("../contracts").FileBlob[];
  /** The Store for persisting Sandbox files across reloads. */
  store?: import("../contracts").Store;
}

let runIdSeq = 0;
function nextRunId(): string {
  runIdSeq += 1;
  return `sbx-run-${runIdSeq}`;
}

// Zero-state fixture (D14/R): Sandbox must be immediately usable with no saved data. This is the
// in-memory "no data yet" starting point, not a restore, not a progress gate.
const ZERO_STATE_FILES: Record<string, string> = {
  "main.py": "print(\"hello from a fresh Sandbox\")\n"
};

export function SandboxScreen({ worker, inputCapable, editorMode = "auto", drainedFiles, store }: SandboxScreenProps) {
  const [files, setFiles] = useState<Record<string, string>>(ZERO_STATE_FILES);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([{ path: "main.py", name: "main.py", dirty: false }]);
  const [activePath, setActivePath] = useState("main.py");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<OutputItem[]>([]);
  const [activeInput, setActiveInput] = useState<ActiveInputRequest | null>(null);
  const [sessionState, setSessionState] = useState<"cold" | "live" | "running">("cold");
  const [sessionNames, setSessionNames] = useState<NameInfo[]>([]);
  const [consoleTheme, setConsoleTheme] = useState<"cli" | "green">("cli");
  const [pkgOpen, setPkgOpen] = useState(false);
  const [crashToast, setCrashToast] = useState(false);
  const [progressByName, setProgressByName] = useState<Record<string, { phase: "download" | "install" | "done"; pct: number }>>({});

  const runIdRef = useRef<string | null>(null);
  const editorHandle = useRef<CodeEditorHandle>(null);

  useEffect(() => {
    const unsubscribe = worker.subscribe((msg) => {
      if (msg.t === "stdout" && msg.runId === runIdRef.current) {
        setItems((prev) => [...prev, { kind: "stdout", id: `${msg.runId}-${prev.length}`, text: msg.text }]);
      } else if (msg.t === "error" && msg.runId === runIdRef.current) {
        setItems((prev) => [...prev, { kind: "error", id: `${msg.runId}-err`, message: msg.message, traceback: msg.traceback }]);
      } else if (msg.t === "figure" && msg.runId === runIdRef.current) {
        setItems((prev) => [...prev, { kind: "figure", id: `${msg.runId}-fig`, alt: msg.alt, dataUrl: bytesToDataUrl(msg.png) }]);
      } else if (msg.t === "inputRequest" && msg.runId === runIdRef.current) {
        setActiveInput({ runId: msg.runId, prompt: msg.prompt });
      } else if (msg.t === "runDone" && msg.runId === runIdRef.current) {
        setRunning(false);
        setSessionState("live");
      } else if (msg.t === "namespace" && msg.namespace === "session") {
        setSessionNames(msg.names);
      } else if (msg.t === "resetDone" && msg.namespace === "session" && msg.ok) {
        setSessionState("cold");
        setSessionNames([]);
        setItems((prev) => [...prev, { kind: "stdout", id: `reset-${prev.length}`, text: "Fresh slate. Session is cold again, your files are untouched.\n" }]);
      } else if (msg.t === "fatal") {
        setCrashToast(true);
        setRunning(false);
        setSessionState("cold");
        setTimeout(() => setCrashToast(false), 3200);
      } else if (msg.t === "packageProgress") {
        setProgressByName((prev) => ({ ...prev, [msg.name]: { phase: msg.phase, pct: msg.phase === "done" ? 100 : msg.phase === "install" ? 70 : 30 } }));
      }
    });
    return unsubscribe;
  }, [worker]);

  // fileDrain: UPSERT drained files into the local file tree (gap 6)
  useEffect(() => {
    if (!drainedFiles || drainedFiles.length === 0) return;
    setFiles(prev => {
      const next = { ...prev };
      for (const file of drainedFiles) {
        if (file.text !== undefined) next[file.path] = file.text;
      }
      return next;
    });
    // Also open tabs for newly drained files
    for (const file of drainedFiles) {
      setOpenTabs(prev => {
        if (prev.some(t => t.path === file.path)) return prev;
        return [...prev, { path: file.path, name: file.path, dirty: false }];
      });
    }
  }, [drainedFiles]);

  // Hydrate files from Store on mount (persistence)
  useEffect(() => {
    if (!store) return;
    (async () => {
      const saved = await store.list<{ text?: string }>("files");
      if (saved.length > 0) {
        const restored: Record<string, string> = {};
        const tabs: import("../components/FileTabs").OpenTab[] = [];
        for (const { key, value } of saved) {
          if (typeof (value as { text?: string })?.text === "string") {
            restored[key] = (value as { text: string }).text;
            tabs.push({ path: key, name: key, dirty: false });
          }
        }
        if (Object.keys(restored).length > 0) {
          setFiles(prev => ({ ...ZERO_STATE_FILES, ...restored }));
          setOpenTabs(prev => {
            const existing = new Set(prev.map(t => t.path));
            return [...prev, ...tabs.filter(t => !existing.has(t.path))];
          });
        }
      }
    })();
  }, [store]);

  // Persist files to Store on change (debounced)
  useEffect(() => {
    if (!store) return;
    const timer = setTimeout(() => {
      for (const [path, text] of Object.entries(files)) {
        store.put("files", path, { path, text, encoding: "utf8" }).catch(() => {});
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [files, store]);

  function runActive() {
    const runId = nextRunId();
    runIdRef.current = runId;
    setRunning(true);
    setSessionState("running");
    worker.send({ t: "run", runId, code: files[activePath] ?? "", mountFiles: [], namespace: "session" });
  }

  function stopActive() {
    if (!runIdRef.current) return;
    worker.send({ t: "stop", runId: runIdRef.current });
  }

  function submitInput(text: string) {
    if (!activeInput) return;
    worker.send({ t: "inputResponse", runId: activeInput.runId, bytes: new TextEncoder().encode(text) });
    setActiveInput(null);
  }

  const nodes: FileNode[] = Object.keys(files).map((path) => ({ path, name: path, kind: "file", depth: 0 }));

  return (
    <div class="sandbox-screen" data-console-theme={consoleTheme} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div class="top-bar">
        <strong>Sandbox</strong>
        <div class="spacer" />
        <span class="rt-indicator"><span class="runtime-dot warm" aria-hidden="true" /> Python warm</span>
      </div>
      <DegradedBootBanner inputCapable={inputCapable} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <FileTree
          nodes={nodes}
          activePath={activePath}
          onOpen={(path) => {
            setActivePath(path);
            if (!openTabs.some((t) => t.path === path)) {
              setOpenTabs((prev) => [...prev, { path, name: path, dirty: false }]);
            }
          }}
          onRename={() => { /* wired at integration: Store-backed rename */ }}
          onDuplicate={(path) => setFiles((prev) => ({ ...prev, [`${path}-copy`]: prev[path] ?? "" }))}
          onDelete={(path) => setFiles((prev) => { const next = { ...prev }; delete next[path]; return next; })}
          onNewFile={() => {
            const name = `untitled${Object.keys(files).length + 1}.py`;
            setFiles((prev) => ({ ...prev, [name]: "" }));
            setOpenTabs((prev) => [...prev, { path: name, name, dirty: false }]);
            setActivePath(name);
          }}
          onNewFolder={() => { /* folder model is a v1.1 nicety in this mock */ }}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <FileTabs
            tabs={openTabs}
            activePath={activePath}
            onSelect={setActivePath}
            onClose={(path) => {
              setOpenTabs((prev) => prev.filter((t) => t.path !== path));
              if (activePath === path && openTabs.length > 1) {
                setActivePath(openTabs.find((t) => t.path !== path)!.path);
              }
            }}
          />
          <div class="editor-bezel">
            <CodeEditor
              value={files[activePath] ?? ""}
              onChange={(next) => setFiles((prev) => ({ ...prev, [activePath]: next }))}
              ariaLabel={`${activePath} editor`}
              handleRef={editorHandle}
              mode={editorMode}
            />
          </div>
          <div class="run-bar">
            <RunBar running={running} onRun={runActive} onStop={stopActive} interruptCapable={inputCapable} />
            <button type="button" class="btn btn-small" onClick={() => setPkgOpen(true)}>+ package</button>
            <SessionChip
              state={sessionState}
              minutes={0}
              names={sessionNames}
              onOpenInspector={() => worker.send({ t: "requestNamespace", namespace: "session" })}
              onRestart={() => worker.send({ t: "resetSession", namespace: "session" })}
            />
          </div>
          <div class="term-head" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px" }}>
            <span class="dim-label">Output</span>
            <div class="seg" style={{ marginLeft: "auto" }}>
              <button type="button" aria-selected={consoleTheme === "cli"} onClick={() => setConsoleTheme("cli")}>CLI white</button>
              <button type="button" aria-selected={consoleTheme === "green"} onClick={() => setConsoleTheme("green")}>Hacker green</button>
            </div>
          </div>
          <OutputStream items={items} activeInputRequest={activeInput} onInputSubmit={submitInput} />
        </div>
      </div>
      <KeyRow editorRef={editorHandle} />
      <PackageSheet
        open={pkgOpen}
        onClose={() => setPkgOpen(false)}
        builtins={[{ name: "numpy", sizeMb: 8 }, { name: "pandas", sizeMb: 10 }, { name: "matplotlib", sizeMb: 6 }]}
        onAdd={(name) => worker.send({ t: "loadPackage", name })}
        progressByName={progressByName}
      />
      {crashToast && (
        <div class="toast" role="alert">Python crashed, restarting. Your files are safe.</div>
      )}
    </div>
  );
}
