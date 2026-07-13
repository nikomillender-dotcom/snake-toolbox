import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { BackupFileReport, BackupNudge, InstallHint, StorageMeter } from "../src/components/Durability";

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

  // SF4 (Frederick full-gate should-fix): honest count + reason for backup/restore skips.
  describe("BackupFileReport (SF4: surfaces the engine's skip reports to the user)", () => {
    it("renders nothing at all when there is nothing to report (calm on the common day)", () => {
      const { container } = render(<BackupFileReport backupSkips={[]} restoreSkippedPaths={[]} />);
      expect(container.textContent).toBe("");
    });

    it("shows a count + reason for backup skips, grouped so repeats read as one honest line", () => {
      render(
        <BackupFileReport
          backupSkips={[
            { path: "leak.py", reason: "secretDetected", sizeBytes: 40 },
            { path: "huge.bin", reason: "overPerFileCap", sizeBytes: 999_999 },
            { path: "also_huge.bin", reason: "overPerFileCap", sizeBytes: 999_999 },
          ]}
          restoreSkippedPaths={[]}
        />
      );
      expect(screen.getByText(/3 files/)).toBeInTheDocument();
      expect(screen.getByText(/1 looked like it held a secret or token/)).toBeInTheDocument();
      expect(screen.getByText(/2 too large to back up on its own/)).toBeInTheDocument();
    });

    it("shows a count for restored files left alone because a local copy already existed", () => {
      render(<BackupFileReport backupSkips={[]} restoreSkippedPaths={["main.py"]} />);
      expect(screen.getByText(/1 file/)).toBeInTheDocument();
      expect(screen.getByText(/local copy already existed here/)).toBeInTheDocument();
    });

    it("is a live region (role=status), same honest-reporting posture as the rest of Durability", () => {
      render(<BackupFileReport backupSkips={[{ path: "leak.py", reason: "secretDetected", sizeBytes: 1 }]} restoreSkippedPaths={[]} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });
});
