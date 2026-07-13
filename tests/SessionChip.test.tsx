import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { SessionChip } from "../src/components/SessionChip";
import type { NameInfo } from "../src/contracts";

const names: NameInfo[] = [
  { name: "utils", group: "import", typeName: "module", repr: "<module>", fromCurrentRun: true },
  { name: "data", group: "variable", typeName: "list", repr: "[1,2]", fromCurrentRun: false }
];

describe("SessionChip + inspector (K5/F11/P4)", () => {
  it("shows cold / live states honestly, driven by props not internal invention", () => {
    const { rerender } = render(<SessionChip state="cold" minutes={0} names={[]} onOpenInspector={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByText("Session: cold")).toBeInTheDocument();
    rerender(<SessionChip state="live" minutes={12} names={names} onOpenInspector={vi.fn()} onRestart={vi.fn()} />);
    expect(screen.getByText("Live 12m . 2 names")).toBeInTheDocument();
  });

  it("P4: opening the inspector fires the requestNamespace PULL", () => {
    const onOpen = vi.fn();
    render(<SessionChip state="live" minutes={1} names={names} onOpenInspector={onOpen} onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Live/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("prior-run names (fromCurrentRun:false) render with the dimmed 'prior' class", () => {
    render(<SessionChip state="live" minutes={1} names={names} onOpenInspector={vi.fn()} onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Live/ }));
    const dataRow = screen.getByText("data").closest(".iname");
    expect(dataRow).toHaveClass("prior");
    const utilsRow = screen.getByText("utils").closest(".iname");
    expect(utilsRow).not.toHaveClass("prior");
  });

  it("Restart requires the calm confirm dialog before calling onRestart (never an instant destructive action)", () => {
    const onRestart = vi.fn();
    render(<SessionChip state="live" minutes={1} names={names} onOpenInspector={vi.fn()} onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: /Live/ }));
    fireEvent.click(screen.getByText("Restart session"));
    expect(onRestart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Fresh slate"));
    expect(onRestart).toHaveBeenCalled();
  });
});
