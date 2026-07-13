import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ConflictSheet } from "../src/components/ConflictSheet";

describe("ConflictSheet (L8, P3 conflict round-trip)", () => {
  it("offers exactly the ConflictChoice[] the engine returned, never auto-resolving", () => {
    const onResolve = vi.fn();
    render(<ConflictSheet open choices={["keepMine", "keepRemote", "shipAsCopy"]} currentFolderPath="m03-receipt" onResolve={onResolve} onCancel={vi.fn()} />);
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText("Keep mine")).toBeInTheDocument();
    expect(screen.getByText("Keep the version on GitHub")).toBeInTheDocument();
    expect(screen.getByText("Ship as a copy")).toBeInTheDocument();
  });

  it("shipAsCopy passes the collected newFolderPath through to onResolve", () => {
    const onResolve = vi.fn();
    render(<ConflictSheet open choices={["shipAsCopy"]} currentFolderPath="m03-receipt" onResolve={onResolve} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("New folder path for the copy") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "m03-receipt-copy-2" } });
    fireEvent.click(screen.getByText(/Choose Ship as a copy/));
    expect(onResolve).toHaveBeenCalledWith("shipAsCopy", "m03-receipt-copy-2");
  });

  it("keepMine resolves with no folder path argument required", () => {
    const onResolve = vi.fn();
    render(<ConflictSheet open choices={["keepMine"]} currentFolderPath="m03-receipt" onResolve={onResolve} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText(/Choose Keep mine/));
    expect(onResolve).toHaveBeenCalledWith("keepMine", undefined);
  });
});
