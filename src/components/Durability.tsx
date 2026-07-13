// Durability.tsx, L8/F8 BLOCKER: the layered backstop, not a single dismissible nudge.
// (1) InstallHint frames add-to-home-screen as DATA DURABILITY. (2) BackupNudge shows "last backed
// up to GitHub: N days ago" once connected. (3) StorageMeter shows navigator.storage.estimate().
// The composition root feeds install-state and last-backup facts (I8); these components render
// what they are given, they never probe the platform themselves at the component level (that lives
// at the composition root / a small platform-facts hook, out of scope for a pure UI component).

import { IconBackup, IconInstall } from "./icons";

export interface InstallHintProps {
  installed: boolean;
  dismissed: boolean;
  sticky: boolean; // escalated: unexported changes over a threshold, non-installed
  onDismiss: () => void;
}

export function InstallHint({ installed, dismissed, sticky, onDismiss }: InstallHintProps) {
  if (installed || (dismissed && !sticky)) return null;
  return (
    <div class={`banner info${sticky ? " sticky" : ""}`} role={sticky ? "alert" : "status"}>
      <IconInstall />
      <span style={{ flex: 1 }}>
        Add Snake ToolBox to your Home Screen so your work survives. A plain Safari tab can lose
        everything after a week of not opening it; an installed app does not have that clock.
      </span>
      {!sticky && (
        <button type="button" class="btn btn-ghost btn-small" onClick={onDismiss}>Not now</button>
      )}
    </div>
  );
}

export interface BackupNudgeProps {
  connected: boolean;
  lastBackupDaysAgo: number | null;
  onConnect: () => void;
  onExportZip: () => void;
}

export function BackupNudge({ connected, lastBackupDaysAgo, onConnect, onExportZip }: BackupNudgeProps) {
  return (
    <div class="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
      <IconBackup />
      {connected ? (
        <span>
          Last backed up to GitHub: <b>{lastBackupDaysAgo == null ? "not yet" : `${lastBackupDaysAgo} day${lastBackupDaysAgo === 1 ? "" : "s"} ago`}</b>.
          This covers your Learn journey, not just shipped projects.
        </span>
      ) : (
        <span>Connect GitHub so a backup happens quietly in the background, or export a zip right now.</span>
      )}
      <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
        {!connected && <button type="button" class="btn btn-ghost btn-small" onClick={onConnect}>Connect GitHub</button>}
        <button type="button" class="btn btn-ghost btn-small" onClick={onExportZip}>Export everything</button>
      </div>
    </div>
  );
}

export interface StorageMeterProps {
  usageBytes: number;
  quotaBytes: number;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StorageMeter({ usageBytes, quotaBytes }: StorageMeterProps) {
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 100)) : 0;
  return (
    <div>
      <div class="dim-label">Storage used</div>
      <div style={{ height: "10px", borderRadius: "6px", background: "var(--panel-2)", border: "1px solid var(--line)", overflow: "hidden", margin: "6px 0" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--brass)" }} />
      </div>
      <div class="mono" style={{ fontSize: "12px", color: "var(--dim)" }}>{formatMb(usageBytes)} of {formatMb(quotaBytes)} ({pct}%)</div>
    </div>
  );
}
