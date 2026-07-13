import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/preact";
import { PromotionCutscene } from "../src/components/PromotionCutscene";
import { globalFlashGate } from "../src/lib/flashGate";

// F16: the flash-cooldown gate is a deliberate app-wide singleton; reset it between test cases so
// one test's celebration cannot starve the next (see the same note in tests/BossScreen.test.tsx).
beforeEach(() => {
  globalFlashGate.reset();
});

describe("PromotionCutscene (L7, P11 dialog discipline, F22 reduced motion)", () => {
  it("reduced motion: the new sprite appears already changed, no calm-then-loud delay, identical payload", async () => {
    render(
      <PromotionCutscene
        open
        fromPhase={1}
        toPhase={2}
        fromClassName="Apprentice"
        toClassName="Builder"
        equipment={["goggles"]}
        line="You outgrew the starter bench."
        reducedMotion
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText(/Class change, you are now a Builder/)).toBeInTheDocument());
    expect(screen.getByText("You outgrew the starter bench.")).toBeInTheDocument();
  });

  it("P11: focus moves to the primary action once revealed", async () => {
    render(
      <PromotionCutscene
        open
        fromPhase={1}
        toPhase={2}
        fromClassName="Apprentice"
        toClassName="Builder"
        equipment={[]}
        line="line"
        reducedMotion
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText("See your sheet")).toHaveFocus());
  });

  it("full motion: still reveals the card (through the flash-cooldown gate) without dropping the celebration", async () => {
    render(
      <PromotionCutscene
        open
        fromPhase={2}
        toPhase={3}
        fromClassName="Builder"
        toClassName="Forgemaster"
        equipment={[]}
        line="a specific promotion line"
        onClose={vi.fn()}
      />
    );
    // the accessible heading exists from the moment the dialog opens (see below), so the REVEAL
    // itself is asserted via content that only exists once revealed=true.
    await waitFor(() => expect(screen.getByText("a specific promotion line")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("P11 correctness: the dialog carries a real accessible name even during the brief calm beat before reveal (never a dangling aria-labelledby)", () => {
    render(
      <PromotionCutscene
        open
        fromPhase={1}
        toPhase={2}
        fromClassName="Apprentice"
        toClassName="Builder"
        equipment={[]}
        line="line"
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).not.toBeNull();
  });
});
