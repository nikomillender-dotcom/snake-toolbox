import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";

// OutputStream, L5: a typed stream (text | error | figure | table | result), rendered in order,
// NOT a bare stdout box. F20: an aria-live region (POLITE for stdout, ASSERTIVE for an error), a
// REQUIRED alt on every figure, the input() prompt takes focus on request, is announced, and
// returns focus after submit.

export type OutputItem =
  | { kind: "stdout" | "stderr" | "result"; id: string; text: string }
  | { kind: "error"; id: string; message: string; traceback: string }
  | { kind: "figure"; id: string; alt: string; dataUrl: string }
  | { kind: "table"; id: string; columns: string[]; rows: string[][] };

export interface ActiveInputRequest {
  runId: string;
  prompt: string;
}

export interface OutputStreamProps {
  items: OutputItem[];
  activeInputRequest?: ActiveInputRequest | null;
  onInputSubmit?: (text: string) => void;
  returnFocusRef?: RefObject<HTMLElement>;
  emptyHint?: string;
}

export function bytesToDataUrl(bytes: Uint8Array, mime = "image/png"): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  // jsdom (the test environment) does not implement btoa/atob; fall back to a manual base64
  // encode there so this stays a pure, dependency-free helper in both browser and test contexts.
  if (typeof btoa === "function") {
    return `data:${mime};base64,${btoa(binary)}`;
  }
  const nodeBuffer = (globalThis as { Buffer?: { from(input: string, enc: string): { toString(enc: string): string } } }).Buffer;
  const base64 = nodeBuffer ? nodeBuffer.from(binary, "binary").toString("base64") : binary;
  return `data:${mime};base64,${base64}`;
}

export function OutputStream({ items, activeInputRequest, onInputSubmit, returnFocusRef, emptyHint }: OutputStreamProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // announce only the newest item, politely for normal output, assertively for a fault (F20)
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (last.kind === "error") {
      if (assertiveRef.current) assertiveRef.current.textContent = `Error: ${last.message}`;
    } else if (last.kind === "figure") {
      if (politeRef.current) politeRef.current.textContent = `Figure output: ${last.alt}`;
    } else if (last.kind === "stdout" || last.kind === "result") {
      if (politeRef.current) politeRef.current.textContent = last.text;
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [items]);

  useEffect(() => {
    if (activeInputRequest) {
      if (assertiveRef.current) {
        assertiveRef.current.textContent = `Python is waiting for input: ${activeInputRequest.prompt}`;
      }
      inputRef.current?.focus();
    }
  }, [activeInputRequest]);

  function submit() {
    if (!activeInputRequest) return;
    onInputSubmit?.(draft);
    setDraft("");
    returnFocusRef?.current?.focus();
  }

  return (
    <div>
      <div class="output-stream" id="output-stream-log" ref={logRef} aria-label="Program output">
        {items.length === 0 && !activeInputRequest && (
          <div><span class="prompt">&gt;&gt;&gt;</span> {emptyHint ?? "ready when you are"}</div>
        )}
        {items.map((item) => {
          if (item.kind === "stdout" || item.kind === "result") {
            return <div key={item.id}><span class="prompt">&gt;&gt;&gt;</span> <span class={item.kind === "result" ? "ok" : undefined}>{item.text}</span></div>;
          }
          if (item.kind === "stderr") {
            return <div key={item.id} class="bad">{item.text}</div>;
          }
          if (item.kind === "error") {
            // No role="alert" here: the ONE hidden assertive live region below is the sole
            // live-announcing channel (F20). A second visible role="alert" on every historical
            // error line would double-announce the same fault to a screen reader.
            return (
              <div key={item.id} class="bad">
                {item.message}
                <details>
                  <summary>show details</summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{item.traceback}</pre>
                </details>
              </div>
            );
          }
          if (item.kind === "figure") {
            return (
              <figure class="output-figure" key={item.id}>
                <img src={item.dataUrl} alt={item.alt} style={{ display: "block", width: "100%" }} />
                <figcaption class="cap"><span>figure output</span><span>tap to zoom</span></figcaption>
              </figure>
            );
          }
          if (item.kind === "table") {
            return (
              <table key={item.id} style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <caption class="visually-hidden">Program table output</caption>
                <thead><tr>{item.columns.map((c) => <th key={c} style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>{c}</th>)}</tr></thead>
                <tbody>
                  {item.rows.map((row, i) => (
                    <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            );
          }
          return null;
        })}
        {activeInputRequest && (
          <div class="input-line">
            <span class="prompt">&gt;&gt;&gt;</span>
            <label class="visually-hidden" htmlFor="stb-input-prompt">{activeInputRequest.prompt}</label>
            <span aria-hidden="true">{activeInputRequest.prompt}</span>
            <input
              id="stb-input-prompt"
              ref={inputRef}
              value={draft}
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        )}
      </div>
      <div class="visually-hidden" role="status" aria-live="polite" ref={politeRef} />
      <div class="visually-hidden" role="alert" aria-live="assertive" ref={assertiveRef} />
    </div>
  );
}
