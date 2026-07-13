import { useRef } from "preact/hooks";
import type { ProgressBackup, TokenExpiry } from "../contracts";
import { useDialogFocus } from "../lib/useDialogFocus";
import { IconWarning } from "./icons";

// RestoreSheet + BackupStatus + TokenExpiryBanner, L14. Restore is OFFERED, never required (R).
// TokenExpiryBanner: captured:false shows NOTHING (D3); quiet at 7 days, sticky at 48 hours.

export interface RestoreSheetProps {
  open: boolean;
  snapshot: ProgressBackup | null;
  onRestore: () => void;
  onStartFresh: () => void;
}

export function RestoreSheet({ open, snapshot, onRestore, onStartFresh }: RestoreSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open, containerRef, initialFocusRef: primaryRef });

  if (!open || !snapshot) return null;
  return (
    <div class="dialog-overlay">
      <div ref={containerRef} class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="restore-heading" style={{ maxWidth: "420px" }}>
        <h2 id="restore-heading" class="serif">Bring your journey over?</h2>
        <p>
          Looks like you have a saved journey from another device
          ({snapshot.completedNodes.length} completed step{snapshot.completedNodes.length === 1 ? "" : "s"}).
          Bring your Learn progress and reviews over?
        </p>
        <div class="row">
          <button type="button" class="btn btn-ghost" onClick={onStartFresh}>Start fresh</button>
          <button type="button" class="btn btn-primary" ref={primaryRef} onClick={onRestore}>Restore it</button>
        </div>
      </div>
    </div>
  );
}

export interface BackupStatusProps {
  lastBackup: { at: number; ok: boolean } | null;
}

export function BackupStatus({ lastBackup }: BackupStatusProps) {
  if (!lastBackup) {
    return <p style={{ color: "var(--dim)", fontSize: "13px" }}>No progress backup yet. It happens quietly once GitHub is connected.</p>;
  }
  const days = Math.floor((Date.now() - lastBackup.at) / (24 * 60 * 60 * 1000));
  return (
    <p style={{ color: "var(--dim)", fontSize: "13px" }}>
      Last progress backup: <b style={{ color: "var(--ink)" }}>{days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}</b>
    </p>
  );
}

export interface TokenExpiryBannerProps {
  expiry: TokenExpiry | null;
  onRenew: () => void;
  onDismiss: () => void;
  dismissed: boolean;
}

export function TokenExpiryBanner({ expiry, onRenew, onDismiss, dismissed }: TokenExpiryBannerProps) {
  if (!expiry || !expiry.captured || expiry.daysLeft == null) return null; // D3: nothing rather than a fake countdown
  const sticky = expiry.daysLeft <= 2;
  if (dismissed && !sticky) return null;
  return (
    <div class={`banner warn${sticky ? " sticky" : ""}`} role={sticky ? "alert" : "status"}>
      <IconWarning />
      <span style={{ flex: 1 }}>
        Your GitHub key expires in {expiry.daysLeft} day{expiry.daysLeft === 1 ? "" : "s"}. Renewing
        takes about a minute, here is how -&gt;
      </span>
      <button type="button" class="btn btn-ghost btn-small" onClick={onRenew}>Renew</button>
      {!sticky && <button type="button" class="btn btn-ghost btn-small" onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}
