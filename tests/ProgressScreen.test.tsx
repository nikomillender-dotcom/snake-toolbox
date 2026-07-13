import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ProgressScreen } from "../src/screens/ProgressScreen";
import { FIXTURE_STAT_SHEETS } from "../src/mocks/statSheetFixtures";
import { createMockReviewScheduler } from "../src/mocks/reviewMock";
import { createMockGitHubAuth, createMockGitHubSync } from "../src/mocks/githubMock";

function renderProgress() {
  return render(
    <ProgressScreen
      sheet={FIXTURE_STAT_SHEETS[1]}
      reviewScheduler={createMockReviewScheduler()}
      githubAuth={createMockGitHubAuth({})}
      githubSync={createMockGitHubSync({})}
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
});
