import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { ProgressScreen } from "../src/screens/ProgressScreen";
import { FIXTURE_STAT_SHEETS } from "../src/mocks/statSheetFixtures";
import { createMockReviewScheduler } from "../src/mocks/reviewMock";
import { createMockGitHubAuth, createMockGitHubSync, type MockGitHubConfig } from "../src/mocks/githubMock";
import { FIXTURE_GLOSSARY } from "../src/mocks/glossaryMock";

function renderProgress(githubConfig: MockGitHubConfig = {}) {
  return render(
    <ProgressScreen
      sheet={FIXTURE_STAT_SHEETS[1]}
      glossaryView={FIXTURE_GLOSSARY}
      reviewScheduler={createMockReviewScheduler()}
      githubAuth={createMockGitHubAuth({})}
      githubSync={createMockGitHubSync(githubConfig)}
      ladder={[]}
      portfolio={[]}
      reducedMotion
      onReducedMotionChange={() => {}}
    />
  );
}

describe("ProgressScreen (H2: one hero view at a time, internal tabs)", () => {
  it("defaults to the character sheet view; other hero views are not simultaneously mounted", () => {
    renderProgress();
    expect(screen.getByText("character sheet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Concept map")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Backup and storage")).not.toBeInTheDocument();
  });

  it("switching tabs swaps the hero view rather than appending to one long scroll", () => {
    renderProgress();
    fireEvent.click(screen.getByRole("tab", { name: "Concept map" }));
    expect(screen.getByLabelText("Concept map")).toBeInTheDocument();
    expect(screen.queryByText("character sheet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Glossary" }));
    expect(screen.getByLabelText("Search the words you have found")).toBeInTheDocument();
    expect(screen.queryByLabelText("Concept map")).not.toBeInTheDocument();
  });

  it("the Review Hand stays visible regardless of which tab is active (the calm daily ritual is never hidden)", () => {
    renderProgress();
    const reviewBefore = screen.getByText(/caught up|due today/);
    fireEvent.click(screen.getByRole("tab", { name: "Backup & settings" }));
    expect(screen.getByText(reviewBefore.textContent!)).toBeInTheDocument();
  });

  // SF4 (Frederick full-gate should-fix): the backup/restore skip report reaches the Backup &
  // settings tab, pulled from the engine's v6 non-contract lastBackupSkippedFiles()/
  // lastRestoreFileReport() methods.
  it("surfaces a backup file skip (count + reason) in the Backup & settings tab", async () => {
    renderProgress({ backupFileSkips: [{ path: "leak.py", reason: "secretDetected", sizeBytes: 40 }] });
    fireEvent.click(screen.getByRole("tab", { name: "Backup & settings" }));
    await waitFor(() => {
      expect(screen.getByText(/1 file/)).toBeInTheDocument();
      expect(screen.getByText(/looked like it held a secret or token/)).toBeInTheDocument();
    });
  });

  it("says nothing in the Backup & settings tab when there is nothing to report", async () => {
    renderProgress();
    fireEvent.click(screen.getByRole("tab", { name: "Backup & settings" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Backup and storage")).toBeInTheDocument();
    });
    expect(screen.queryByText(/skipped on the last backup/)).not.toBeInTheDocument();
  });
});
