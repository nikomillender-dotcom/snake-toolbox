import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { useRef } from "preact/hooks";
import { CodeEditor, type CodeEditorHandle } from "../src/components/CodeEditor";

// CodeEditor, L4/F17. Forcing mode="textarea" here tests the accessible fallback deterministically
// (no async CM6 mount race); the CM6 path itself is exercised indirectly by every screen test that
// awaits its labelled editor (LearnScreen.test.tsx, SandboxScreen.test.tsx, BossScreen.test.tsx).

function Harness({ onChange }: { onChange: (v: string) => void }) {
  const handleRef = useRef<CodeEditorHandle>(null);
  return <CodeEditor value="print('hi')" onChange={onChange} ariaLabel="test editor" mode="textarea" handleRef={handleRef} />;
}

describe("CodeEditor textarea fallback (F17 escape hatch)", () => {
  it("is a real labelled textarea, not a bare textarea with no accessible name", () => {
    render(<Harness onChange={vi.fn()} />);
    const el = screen.getByLabelText("test editor");
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("autocorrect / autocapitalize / autocomplete are explicitly off (v0 6.3, the curly-quote bug)", () => {
    render(<Harness onChange={vi.fn()} />);
    const el = screen.getByLabelText("test editor");
    expect(el).toHaveAttribute("autocorrect", "off");
    expect(el).toHaveAttribute("autocapitalize", "off");
    expect(el).toHaveAttribute("autocomplete", "off");
    expect(el).toHaveAttribute("spellcheck", "false");
  });

  it("calls onChange with the new value on input", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const el = screen.getByLabelText("test editor");
    fireEvent.input(el, { target: { value: "print('bye')" } });
    expect(onChange).toHaveBeenCalledWith("print('bye')");
  });

  it("two independent CodeEditor instances never share state (the graded/scratch isolation shape)", () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    render(
      <div>
        <CodeEditor value="A" onChange={onChangeA} ariaLabel="editor A" mode="textarea" />
        <CodeEditor value="B" onChange={onChangeB} ariaLabel="editor B" mode="textarea" />
      </div>
    );
    const a = screen.getByLabelText("editor A") as HTMLTextAreaElement;
    const b = screen.getByLabelText("editor B") as HTMLTextAreaElement;
    fireEvent.input(a, { target: { value: "A-changed" } });
    expect(onChangeA).toHaveBeenCalledWith("A-changed");
    expect(onChangeB).not.toHaveBeenCalled();
    expect(b.value).toBe("B");
  });
});
