import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { BackupNudge, InstallHint, StorageMeter } from "../src/components/Durability";

describe("Durability trio (F8 BLOCKER, the layered backstop)", () => {
  it("InstallHint is a dismissible nudge by default (not sticky) when under the risk threshold", () => {
    render(<InstallHint installed={false} dismissed={false} sticky={false} onDismiss={vi.fn()} />);
    expect(screen.getByText("Not now")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("escalates to a STICKY banner (role=alert, no dismiss) once over the risk threshold", () => {
    render(<InstallHint installed={false} dismissed onDismiss={vi.fn()} sticky />);
    expect(screen.queryByText("Not now")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders nothing once installed (the durability risk this nudge exists for is gone)", () => {
    render(<InstallHint installed dismissed={false} sticky={false} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/Home Screen/)).not.toBeInTheDocument();
  });

  it("a dismissed, non-sticky nudge stays dismissed", () => {
    render(<InstallHint installed={false} dismissed sticky={false} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/Home Screen/)).not.toBeInTheDocument();
  });

  it("BackupNudge reads 'last backed up to GitHub: N days ago' once connected (I8/N)", () => {
    render(<BackupNudge connected lastBackupDaysAgo={3} onConnect={vi.fn()} onExportZip={vi.fn()} />);
    expect(screen.getByText(/3 days ago/)).toBeInTheDocument();
  });

  it("StorageMeter renders a real usage/quota read from navigator.storage.estimate() shape", () => {
    render(<StorageMeter usageBytes={50_000_000} quotaBytes={1_000_000_000} />);
    expect(screen.getByText(/5%/)).toBeInTheDocument();
  });
});
