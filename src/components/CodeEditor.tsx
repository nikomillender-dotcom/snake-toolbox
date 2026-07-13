import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";

// CodeEditor, L4 + F17: CodeMirror 6 is the ruling editor. F17 attaches the acceptance gate: if
// VoiceOver on a real iPad cannot read/edit/navigate the CM6 contenteditable (labelled
// role="textbox" aria-multiline="true", autocomplete selection announced), ship the accessible
// plain-textarea fallback instead of discovering the screen-reader story at build time. This
// component tries CM6 first and swaps to the textarea fallback if construction throws (the same
// escape hatch also keeps this buildable in jsdom, which lacks the layout APIs CM6 needs).
//
// Autocorrect / smart-quotes / smart-dashes are explicitly OFF on both backends (v0 6.3): a curly
// quote breaks Python syntax, this is a named, hard-won iPad bug.

export type EditorMode = "auto" | "cm6" | "textarea";

export interface CodeEditorHandle {
  insertAtCursor(text: string, caretOffsetFromInsertStart?: number): void;
  dedentCurrentLine(): void;
  focus(): void;
}

export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  mode?: EditorMode;
  handleRef?: RefObject<CodeEditorHandle>;
  readOnly?: boolean;
}

function useLineNumbers(value: string): string {
  const n = value.split("\n").length;
  let out = "";
  for (let i = 1; i <= n; i++) out += i + "\n";
  return out;
}

function TextareaFallback({ value, onChange, ariaLabel, handleRef, readOnly }: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutter = useLineNumbers(value);

  useEffect(() => {
    // Preact's JSX typing pins `spellcheck` to a boolean (the IDL property), but the HTML
    // ATTRIBUTE is a "true"/"false" enumerated string per spec, which is what AT and this app's
    // own tests inspect. Setting both keeps the property AND the attribute honest.
    ref.current?.setAttribute("spellcheck", "false");
  }, []);

  useEffect(() => {
    if (!handleRef) return;
    (handleRef as { current: CodeEditorHandle }).current = {
      insertAtCursor(text, caretOffset) {
        const el = ref.current;
        if (!el) return;
        const s = el.selectionStart ?? value.length;
        const e = el.selectionEnd ?? value.length;
        const next = value.slice(0, s) + text + value.slice(e);
        onChange(next);
        const pos = caretOffset != null ? s + caretOffset : s + text.length;
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = pos;
          el.focus();
        });
      },
      dedentCurrentLine() {
        const el = ref.current;
        if (!el) return;
        const s = el.selectionStart ?? 0;
        const lineStart = value.lastIndexOf("\n", s - 1) + 1;
        if (value.slice(lineStart, lineStart + 4) === "    ") {
          const next = value.slice(0, lineStart) + value.slice(lineStart + 4);
          onChange(next);
        }
        el.focus();
      },
      focus() {
        ref.current?.focus();
      }
    };
  }, [handleRef, value, onChange]);

  return (
    <div class="editor-body">
      <div class="editor-gutter" aria-hidden="true">{gutter}</div>
      <textarea
        ref={ref}
        class="editor-textarea"
        aria-label={ariaLabel}
        spellcheck={false}
        autocorrect="off"
        autocapitalize="off"
        autocomplete="off"
        readOnly={readOnly}
        value={value}
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      />
    </div>
  );
}

function Cm6Editor({ value, onChange, ariaLabel, handleRef, readOnly, onMountError }: CodeEditorProps & { onMountError: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<import("@codemirror/view").EditorView | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [{ EditorView, keymap, lineNumbers }, { EditorState }, { defaultKeymap, indentWithTab, history, historyKeymap }, { python }] =
          await Promise.all([
            import("@codemirror/view"),
            import("@codemirror/state"),
            import("@codemirror/commands"),
            import("@codemirror/lang-python")
          ]);
        if (disposed || !hostRef.current) return;

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            valueRef.current = text;
            onChange(text);
          }
        });

        const state = EditorState.create({
          doc: value,
          extensions: [
            lineNumbers(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            python(),
            updateListener,
            EditorView.editable.of(!readOnly),
            EditorView.theme({
              "&": { height: "100%", fontSize: "16px" },
              ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--pink)" },
              ".cm-scroller": { overflow: "auto" }
            })
          ]
        });

        const view = new EditorView({ state, parent: hostRef.current });
        viewRef.current = view;

        // F17: label the contenteditable as a real textbox for VoiceOver / other AT.
        view.contentDOM.setAttribute("role", "textbox");
        view.contentDOM.setAttribute("aria-multiline", "true");
        view.contentDOM.setAttribute("aria-label", ariaLabel);
        view.contentDOM.setAttribute("spellcheck", "false");
        view.contentDOM.setAttribute("autocorrect", "off");
        view.contentDOM.setAttribute("autocapitalize", "off");

        if (handleRef) {
          (handleRef as { current: CodeEditorHandle }).current = {
            insertAtCursor(text, caretOffset) {
              const v = viewRef.current;
              if (!v) return;
              const pos = v.state.selection.main.from;
              v.dispatch({
                changes: { from: pos, insert: text },
                selection: { anchor: caretOffset != null ? pos + caretOffset : pos + text.length }
              });
              v.focus();
            },
            dedentCurrentLine() {
              const v = viewRef.current;
              if (!v) return;
              const pos = v.state.selection.main.from;
              const line = v.state.doc.lineAt(pos);
              if (line.text.startsWith("    ")) {
                v.dispatch({ changes: { from: line.from, to: line.from + 4, insert: "" } });
              }
              v.focus();
            },
            focus() {
              viewRef.current?.focus();
            }
          };
        }
      } catch {
        // F17 escape hatch: CM6 could not mount (jsdom, or a real browser incompatibility). Ship
        // the accessible textarea fallback instead of a broken or inaccessible editor.
        if (!disposed) onMountError();
      }
    })();

    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewRef.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div class="editor-body" ref={hostRef} />;
}

export function CodeEditor(props: CodeEditorProps) {
  const requestedMode = props.mode ?? "auto";
  const [fallback, setFallback] = useState(requestedMode === "textarea");

  if (requestedMode === "textarea" || fallback) {
    return <TextareaFallback {...props} />;
  }
  return <Cm6Editor {...props} onMountError={() => setFallback(true)} />;
}
