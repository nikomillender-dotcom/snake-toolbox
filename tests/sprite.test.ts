import { describe, expect, it } from "vitest";
import { buildSpriteRects, expandRuns, SPRITE_TIERS, validateSpriteGrid } from "../src/lib/sprite";
import type { PhaseId } from "../src/contracts";

describe("sprite DSL (L6: 40x32, uniform width, the self-check)", () => {
  const tiers: PhaseId[] = [1, 2, 3, 4];

  it.each(tiers)("tier %i expands to exactly 40 rows x 32 cols", (tier) => {
    const grid = expandRuns(SPRITE_TIERS[tier].runs);
    const result = validateSpriteGrid(grid);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("flags a malformed grid (wrong row count) rather than silently rendering it", () => {
    const badGrid = expandRuns(SPRITE_TIERS[1].runs).slice(0, 39);
    const result = validateSpriteGrid(badGrid);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/40 rows/);
  });

  it("flags a malformed grid (uneven row width)", () => {
    const grid = expandRuns(SPRITE_TIERS[1].runs);
    const badGrid = [...grid];
    badGrid[5] = badGrid[5]!.slice(0, 31); // one row short
    const result = validateSpriteGrid(badGrid);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/32 cols/);
  });

  it("throws on a non-integer scale", () => {
    expect(() => buildSpriteRects(SPRITE_TIERS[1].runs, 3.5)).toThrow(/positive integer/);
  });

  it("builds real rect geometry at an integer scale for every tier", () => {
    for (const tier of tiers) {
      const { width, height, rects } = buildSpriteRects(SPRITE_TIERS[tier].runs, 2);
      expect(width).toBe(32 * 2);
      expect(height).toBe(40 * 2);
      expect(rects).toContain("<rect");
    }
  });

  it("every tier carries a real accessible label (never image-only identity)", () => {
    for (const tier of tiers) {
      expect(SPRITE_TIERS[tier].label.length).toBeGreaterThan(0);
    }
  });
});
