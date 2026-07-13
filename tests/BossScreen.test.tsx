import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { BossScreen } from "../src/screens/BossScreen";
import { createMockWorkerClient } from "../src/mocks/workerMock";
import { FIXTURE_BUNDLE } from "../src/mocks/curriculumFixture";
import { globalFlashGate } from "../src/lib/flashGate";

const boss = FIXTURE_BUNDLE.modules.find((m) => m.id === "m03")!.boss!;

// The flash-cooldown gate (F16) is a deliberate module-level singleton shared across the WHOLE
// app (that is the point: chained celebrations across different screens still share one ceiling).
// That means it also persists across test cases in this file; reset it between tests so each
// test's celebration is not starved by a PRIOR test's VS-intro fire still sitting in the same
// rolling 1-second window.
beforeEach(() => {
  globalFlashGate.reset();
});

describe("BossScreen (L7, the loud-calm-loud arc)", () => {
  it("opens on the VS intro with BEGIN, then moves to the calm itemized fight", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<BossScreen boss={boss} worker={worker} reducedMotion />);
    const begin = screen.getByRole("button", { name: /BEGIN/ });
    fireEvent.click(begin);
    expect(screen.getByText(boss.brief)).toBeInTheDocument();
    expect(screen.getByText(/checks pass/)).toBeInTheDocument();
  });

  it("the checklist is itemized per hiddenTests group, starting unresolved", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<BossScreen boss={boss} worker={worker} reducedMotion />);
    fireEvent.click(screen.getByRole("button", { name: /BEGIN/ }));
    for (const test of boss.hiddenTests) {
      expect(screen.getByText(test.message)).toBeInTheDocument();
    }
  });

  it("Check all resolves the checklist and reveals the victory beat (F16-gated, reduced motion here)", async () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<BossScreen boss={boss} worker={worker} reducedMotion />);
    fireEvent.click(screen.getByRole("button", { name: /BEGIN/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check all" }));
    await waitFor(() => expect(screen.getByText(new RegExp(`You beat ${boss.name}`))).toBeInTheDocument());
  });

  it("F5: renders the degraded-boot banner when inputCapable is false", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<BossScreen boss={boss} worker={worker} reducedMotion inputCapable={false} />);
    fireEvent.click(screen.getByRole("button", { name: /BEGIN/ }));
    expect(screen.getByText(/Some features need a secure setup/)).toBeInTheDocument();
  });

  it("F5: Stop is disabled outright when inputCapable is false, not just visually inert while idle", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    render(<BossScreen boss={boss} worker={worker} reducedMotion inputCapable={false} />);
    fireEvent.click(screen.getByRole("button", { name: /BEGIN/ }));
    const stopBtn = screen.getByRole("button", { name: /Stop/ });
    expect(stopBtn).toBeDisabled();
  });

  it("onExit renders a reachable Close action", () => {
    const worker = createMockWorkerClient({ delayMs: 5 });
    let closed = false;
    render(<BossScreen boss={boss} worker={worker} reducedMotion onExit={() => { closed = true; }} />);
    fireEvent.click(screen.getByRole("button", { name: /BEGIN/ }));
    fireEvent.click(screen.getByText("Close"));
    expect(closed).toBe(true);
  });
});
