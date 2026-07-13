import type { CodeEditorHandle } from "./CodeEditor";
import type { RefObject } from "preact";

// KeyRow, L4/6.2: the custom accessory row pinned above the on-screen keyboard. Paired keys insert
// the pair and place the caret between them. F23: every key is at least 44x44 in portrait; the
// triple-quote variant (normally a long-press-only iOS affordance) ships as its OWN visible key
// here instead, so there is a discoverable non-timing alternative from day one (no long-press-only
// function in this app).

export interface KeyRowProps {
  editorRef: RefObject<CodeEditorHandle>;
  onHideKeyboard?: () => void;
}

interface KeyDef {
  label: string;
  insert?: string;
  caretOffset?: number;
  dedent?: boolean;
  wide?: boolean;
}

const KEYS: KeyDef[] = [
  { label: "tab", insert: "    ", caretOffset: 4, wide: true },
  { label: ":", insert: ":" },
  { label: "_", insert: "_" },
  { label: "( )", insert: "()", caretOffset: 1 },
  { label: "[ ]", insert: "[]", caretOffset: 1 },
  { label: "{ }", insert: "{}", caretOffset: 1 },
  { label: '" "', insert: '""', caretOffset: 1 },
  { label: "'''", insert: '""""""', caretOffset: 3 }, // discoverable non-timing triple-quote key (F23)
  { label: "' '", insert: "''", caretOffset: 1 },
  { label: "=", insert: "=" },
  { label: "indent ->", insert: "    ", caretOffset: 4, wide: true },
  { label: "<- dedent", dedent: true, wide: true }
];

export function KeyRow({ editorRef, onHideKeyboard }: KeyRowProps) {
  function press(key: KeyDef) {
    const handle = editorRef.current;
    if (!handle) return;
    if (key.dedent) {
      handle.dedentCurrentLine();
      return;
    }
    if (key.insert != null) {
      handle.insertAtCursor(key.insert, key.caretOffset);
    }
  }

  return (
    <div class="key-row" role="toolbar" aria-label="Code editor key row">
      {KEYS.map((k) => (
        <button key={k.label} type="button" class={`key${k.wide ? " wide" : ""}`} onClick={() => press(k)}>
          {k.label}
        </button>
      ))}
      <span class="sp" />
      <button type="button" class="key arrow" aria-label="cursor left" onClick={() => moveCaret(editorRef, -1)}>&larr;</button>
      <button type="button" class="key arrow" aria-label="cursor right" onClick={() => moveCaret(editorRef, 1)}>&rarr;</button>
      <button type="button" class="key wide" onClick={onHideKeyboard}>hide kb</button>
      <div class="visually-hidden">
        Paired keys insert the pair and place your caret in the middle. Indent inserts 4 spaces.
        This row stays even with a hardware keyboard attached.
      </div>
    </div>
  );
}

function moveCaret(editorRef: RefObject<CodeEditorHandle>, delta: number) {
  // best-effort: focus the editor so the platform's own caret movement takes over; a full custom
  // caret-move implementation is left to the editor backend (CM6 has its own arrow handling).
  editorRef.current?.focus();
  void delta;
}
