import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { OutputStream, bytesToDataUrl, type OutputItem } from "../src/components/OutputStream";

describe("OutputStream (L5, F20)", () => {
  it("renders a typed stream in order: text, then error, then figure", () => {
    const items: OutputItem[] = [
      { kind: "stdout", id: "1", text: "hello" },
      { kind: "error", id: "2", message: "boom", traceback: "Traceback..." },
      { kind: "figure", id: "3", alt: "a line chart of run totals", dataUrl: bytesToDataUrl(new Uint8Array([1, 2, 3])) }
    ];
    render(<OutputStream items={items} />);
    const log = screen.getByLabelText("Program output");
    const text = log.textContent ?? "";
    expect(text.indexOf("hello")).toBeLessThan(text.indexOf("boom"));
    expect(screen.getByRole("img", { name: "a line chart of run totals" })).toBeInTheDocument();
  });

  it("F20: every figure REQUIRES real alt text, rendered on the <img> element", () => {
    const items: OutputItem[] = [{ kind: "figure", id: "f1", alt: "figure output", dataUrl: bytesToDataUrl(new Uint8Array([1])) }];
    render(<OutputStream items={items} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.alt.length).toBeGreaterThan(0);
  });

  it("F20: an error announces via the assertive live region, stdout via the polite region", () => {
    const { rerender } = render(<OutputStream items={[{ kind: "stdout", id: "1", text: "3.5" }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("3.5");
    rerender(<OutputStream items={[{ kind: "stdout", id: "1", text: "3.5" }, { kind: "error", id: "2", message: "ZeroDivisionError", traceback: "..." }]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/ZeroDivisionError/);
  });

  it("F19: an active input() request takes focus and is announced, and submit returns focus", async () => {
    const onSubmit = vi.fn();
    const returnTarget = document.createElement("button");
    document.body.appendChild(returnTarget);
    render(
      <OutputStream
        items={[]}
        activeInputRequest={{ runId: "r1", prompt: "your name?" }}
        onInputSubmit={onSubmit}
        returnFocusRef={{ current: returnTarget }}
      />
    );
    const input = screen.getByLabelText("your name?");
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.input(input, { target: { value: "Niko" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("Niko");
    await waitFor(() => expect(returnTarget).toHaveFocus());
    document.body.removeChild(returnTarget);
  });

  it("renders a semantic <table> for table output, never ASCII-in-console (O8 condition)", () => {
    const items: OutputItem[] = [{ kind: "table", id: "t1", columns: ["name", "price"], rows: [["apple", "1"]] }];
    render(<OutputStream items={items} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
  });
});
