import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { useRef, useState } from "preact/hooks";
import { useDialogFocus } from "../src/lib/useDialogFocus";

// useDialogFocus, P11: move focus in on open, trap Tab/Shift+Tab while open, return focus to the
// trigger on close. Shared by every modal in the app (promotion cutscene, ConflictSheet, Sandbox
// Restart confirm, RestoreSheet).

function TestDialog() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open, containerRef, initialFocusRef: primaryRef });

  return (
    <div>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <div ref={containerRef} role="dialog" aria-label="Test dialog">
          <h2 id="h">Heading</h2>
          <button ref={primaryRef}>Primary</button>
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

describe("useDialogFocus (P11 dialog discipline)", () => {
  it("moves focus to the initial focus target on open", async () => {
    render(<TestDialog />);
    fireEvent.click(screen.getByText("Open dialog"));
    await waitFor(() => expect(screen.getByText("Primary")).toHaveFocus());
  });

  it("traps Tab within the dialog (wraps from last to first)", async () => {
    render(<TestDialog />);
    fireEvent.click(screen.getByText("Open dialog"));
    await waitFor(() => expect(screen.getByText("Primary")).toHaveFocus());
    screen.getByText("Close").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByText("Primary")).toHaveFocus();
  });

  it("traps Shift+Tab within the dialog (wraps from first to last)", async () => {
    render(<TestDialog />);
    fireEvent.click(screen.getByText("Open dialog"));
    await waitFor(() => expect(screen.getByText("Primary")).toHaveFocus());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByText("Close")).toHaveFocus();
  });

  it("returns focus to the triggering element on close", async () => {
    render(<TestDialog />);
    const trigger = screen.getByText("Open dialog");
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByText("Primary")).toHaveFocus());
    fireEvent.click(screen.getByText("Close"));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
