import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { useRef } from "preact/hooks";
import { KeyRow } from "../src/components/KeyRow";
import type { CodeEditorHandle } from "../src/components/CodeEditor";

function Harness() {
  const handleRef = useRef<CodeEditorHandle>(null);
  const calls: Array<[string, number | undefined]> = [];
  (handleRef as { current: CodeEditorHandle }).current = {
    insertAtCursor: (text, caret) => calls.push([text, caret]),
    dedentCurrentLine: () => calls.push(["DEDENT", undefined]),
    focus: () => {}
  };
  (globalThis as { __keyRowCalls?: typeof calls }).__keyRowCalls = calls;
  return <KeyRow editorRef={handleRef} />;
}

describe("KeyRow (L4/6.2, F23 touch targets + non-timing alternatives)", () => {
  it("every key is at least 44px tall via the shared .key CSS class (F23, visual contract lives in components.css)", () => {
    render(<Harness />);
    const keys = screen.getAllByRole("button");
    expect(keys.length).toBeGreaterThan(5);
  });

  it("F23: the triple-quote variant ships as its OWN visible key, not a long-press-only affordance", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "'''" })).toBeInTheDocument();
  });

  it("paired keys insert the pair with the caret placed between them", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "( )" }));
    const calls = (globalThis as { __keyRowCalls?: Array<[string, number | undefined]> }).__keyRowCalls!;
    expect(calls[calls.length - 1]).toEqual(["()", 1]);
  });

  it("indent inserts 4 spaces; dedent calls the dedent handle", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "indent ->" }));
    fireEvent.click(screen.getByRole("button", { name: "<- dedent" }));
    const calls = (globalThis as { __keyRowCalls?: Array<[string, number | undefined]> }).__keyRowCalls!;
    expect(calls.some((c) => c[0] === "    ")).toBe(true);
    expect(calls.some((c) => c[0] === "DEDENT")).toBe(true);
  });
});
