import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ShipCelebration } from "../src/components/ShipCelebration";
import { globalFlashGate } from "../src/lib/flashGate";

beforeEach(() => {
  globalFlashGate.reset();
});

describe("ShipCelebration (L8/I11, the honesty split)", () => {
  it("artifact complete is LOCAL truth: it shows even with no ShipResult yet (offline or not)", () => {
    render(<ShipCelebration open artifactName="Receipt Printer" shipResult={null} onDismiss={vi.fn()} reducedMotion />);
    expect(screen.getByText(/Artifact complete: Receipt Printer/)).toBeInTheDocument();
  });

  it("live on GitHub only shows on a live ShipResult carrying a URL, never a fake green check", () => {
    const { rerender } = render(<ShipCelebration open artifactName="x" shipResult={{ status: "queued" }} onDismiss={vi.fn()} reducedMotion />);
    expect(screen.queryByText(/Live on GitHub/)).not.toBeInTheDocument();
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();

    rerender(<ShipCelebration open artifactName="x" shipResult={{ status: "live", url: "https://github.com/x" }} onDismiss={vi.fn()} reducedMotion />);
    expect(screen.getByText(/Live on GitHub/)).toBeInTheDocument();
  });

  it("F13: the offline-queue copy states the durability ceiling honestly (7-day eviction, re-shippable)", () => {
    render(<ShipCelebration open artifactName="x" shipResult={{ status: "queued" }} onDismiss={vi.fn()} reducedMotion />);
    expect(screen.getByText(/7 days/)).toBeInTheDocument();
  });

  it("expiredToken shows the SPECIFIC renewal copy, not a generic failure", () => {
    render(<ShipCelebration open artifactName="x" shipResult={{ status: "expiredToken" }} onDismiss={vi.fn()} reducedMotion onRenewToken={vi.fn()} />);
    expect(screen.getByText(/Your GitHub key expired/)).toBeInTheDocument();
    expect(screen.getByText("Renew now")).toBeInTheDocument();
  });

  it("conflict status surfaces before the round-trip, still never claiming live", () => {
    render(<ShipCelebration open artifactName="x" shipResult={{ status: "conflict" }} onDismiss={vi.fn()} reducedMotion />);
    expect(screen.queryByText(/Live on GitHub/)).not.toBeInTheDocument();
  });
});
