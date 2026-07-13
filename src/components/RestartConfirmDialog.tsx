import { useRef } from "preact/hooks";
import { useDialogFocus } from "../lib/useDialogFocus";

// RestartConfirmDialog, L3/F20: the calm confirm before resetSession. Shared by Sandbox's Restart
// and Learn's scratch-REPL Restart. F20 note (the native-dialog gap): the accessible name comes
// from aria-labelledby on the heading, not from a native <dialog> element alone.

export interface RestartConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  bodyText?: string;
}

export function RestartConfirmDialog({ open, onCancel, onConfirm, bodyText }: RestartConfirmDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open, containerRef, initialFocusRef: confirmRef });

  if (!open) return null;
  return (
    <div class="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="restart-heading" ref={containerRef}>
        <h3 id="restart-heading">Clear the session?</h3>
        <p>{bodyText ?? "Your files are safe. This just resets the live variables so you get a fresh, empty slate."}</p>
        <div class="row">
          <button type="button" class="btn btn-ghost btn-small" onClick={onCancel}>Keep it</button>
          <button type="button" class="btn btn-primary btn-small" ref={confirmRef} onClick={onConfirm}>Fresh slate</button>
        </div>
      </div>
    </div>
  );
}
