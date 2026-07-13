import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { StatScreen } from "../src/components/StatScreen";
import { FIXTURE_STAT_SHEETS } from "../src/mocks/statSheetFixtures";

describe("StatScreen (L6, the FF5 character sheet)", () => {
  it("renders characterName and characterEpithet as plain TEXT, never innerHTML/markup (P13)", () => {
    const crafted = {
      ...FIXTURE_STAT_SHEETS[1],
      characterName: "<img src=x onerror=alert(1)>",
      characterEpithet: "<b>bold</b> epithet"
    };
    render(<StatScreen sheet={crafted} />);
    // if this were rendered as markup, there would be no literal "<img" text node and an <img> tag
    // would exist instead; asserting the raw string appears as VISIBLE TEXT proves no HTML injection.
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.getByText("<b>bold</b> epithet")).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("P10: a risen stat carries REAL accessible text, never icon+color alone", () => {
    const sheet = FIXTURE_STAT_SHEETS[1];
    render(<StatScreen sheet={sheet} />);
    const risenKey = sheet.changedSince[0];
    expect(risenKey).toBeDefined();
    // the accessible name lives on a role="group" wrapping the stat row (see StatScreen.tsx)
    const group = screen.getByRole("group", { name: new RegExp(`${risenKey} \\d+, up since your last visit`) });
    expect(group).toBeInTheDocument();
  });

  it("SHIP renders a count, never a segmented bar (it is not capped like the other five stats)", () => {
    render(<StatScreen sheet={FIXTURE_STAT_SHEETS[2]} />);
    expect(screen.getByText("SHIP")).toBeInTheDocument();
    expect(screen.getByText(/artifact.* shipped to your portfolio/)).toBeInTheDocument();
  });

  it("renders the correct sprite tier for the sheet's spriteTier (L6 four tiers)", () => {
    render(<StatScreen sheet={FIXTURE_STAT_SHEETS[4]} />);
    expect(screen.getByRole("img", { name: /Wayfarer/ })).toBeInTheDocument();
  });
});
