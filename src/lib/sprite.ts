// sprite.ts, the Snake ToolBox character sprite DSL (L6, "the four sprite tiers").
//
// 32 wide x 40 tall, uniform width (the ripgrep-lint requirement transcribed as a runtime
// validator here: validateSpriteGrid). The Apprentice (Phase 1) grid below is lifted VERBATIM
// from Simbo's Niko-approved mockup (mockups/stats.html, the APP run-length array) so Tier 1 is
// pixel-identical to the approved lookbook. Tiers 2 to 4 (Builder/Forgemaster/Wayfarer) are
// PLACEHOLDER recolors/additions authored here only to prove the tier-swap renderer works end to
// end; the real art is [TBD-AUTHORING] per frontend-spec.md L6 ("Assets are [TBD-AUTHORING];
// build the renderer against the tier system"). Flagged in BUILD-REPORT.md as mocked thinner than
// spec, not hidden.

import type { PhaseId } from "../contracts";

export const SPRITE_ROWS = 40;
export const SPRITE_COLS = 32;

export type SpriteRun = Array<[string, number]>;

/** color key -> hex. "." is transparent (no rect emitted). */
export const SPRITE_PALETTE: Record<string, string> = {
  o: "#141110", // outline
  s: "#E6B98F", // skin
  h: "#6E4A2E", // hair
  c: "#B79B6E", // apprentice tunic (cloth)
  w: "#D8C6A0", // wrap / undershirt
  m: "#E0A54C", // brass accent (buckles, goggles, tools)
  p: "#F5C2CE", // the pink snake mascot
  r: "#8A4A46", // forgemaster cape (placeholder tier 3 accent)
  b: "#5B7A9A" // wayfarer travel cloak (placeholder tier 4 accent)
};

const APPRENTICE: SpriteRun[] = [
  [[".", 32]], [[".", 32]],
  [[".", 13], ["o", 6], [".", 13]],
  [[".", 12], ["o", 1], ["h", 6], ["o", 1], [".", 12]],
  [[".", 11], ["o", 1], ["h", 8], ["o", 1], [".", 11]],
  [[".", 11], ["o", 1], ["s", 8], ["o", 1], [".", 11]],
  [[".", 11], ["o", 1], ["s", 2], ["o", 1], ["s", 2], ["o", 1], ["s", 2], ["o", 1], [".", 11]],
  [[".", 11], ["o", 1], ["s", 8], ["o", 1], [".", 11]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 2], ["s", 3], ["o", 1], [".", 11]],
  [[".", 12], ["o", 1], ["s", 6], ["o", 1], [".", 12]],
  [[".", 13], ["o", 1], ["s", 4], ["o", 1], [".", 13]],
  [[".", 10], ["o", 1], ["c", 10], ["o", 1], [".", 10]],
  [[".", 9], ["o", 1], ["c", 12], ["o", 1], [".", 9]],
  [[".", 9], ["o", 1], ["c", 12], ["o", 1], [".", 9]],
  [[".", 9], ["o", 1], ["c", 12], ["o", 1], [".", 9]],
  [[".", 9], ["o", 1], ["s", 2], ["c", 8], ["s", 2], ["o", 1], [".", 9]],
  [[".", 10], ["o", 1], ["w", 1], ["c", 9], ["o", 1], ["s", 1], ["m", 1], [".", 8]],
  [[".", 10], ["o", 1], ["w", 1], ["c", 9], ["o", 1], [".", 1], ["m", 1], [".", 8]],
  [[".", 10], ["o", 1], ["w", 1], ["c", 9], ["o", 1], [".", 10]],
  [[".", 10], ["o", 1], ["w", 1], ["c", 9], ["o", 1], [".", 10]],
  [[".", 10], ["o", 1], ["w", 1], ["c", 9], ["o", 1], [".", 10]],
  [[".", 10], ["o", 1], ["m", 10], ["o", 1], [".", 10]],
  [[".", 9], ["o", 1], ["c", 12], ["o", 1], [".", 9]],
  [[".", 9], ["o", 1], ["c", 12], ["o", 1], [".", 9]],
  [[".", 8], ["o", 1], ["c", 14], ["o", 1], [".", 8]],
  [[".", 8], ["o", 1], ["c", 14], ["o", 1], [".", 8]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 11], ["o", 1], ["s", 3], ["o", 1], [".", 1], ["o", 1], ["s", 3], ["o", 1], [".", 10]],
  [[".", 10], ["o", 1], ["s", 4], ["o", 1], [".", 2], ["o", 1], ["s", 4], ["o", 1], [".", 8]],
  [[".", 10], ["o", 5], [".", 2], ["o", 5], [".", 10]],
  [[".", 22], ["o", 4], [".", 6]],
  [[".", 21], ["o", 1], ["p", 4], ["o", 1], [".", 5]],
  [[".", 21], ["o", 1], ["p", 1], ["o", 2], ["p", 1], ["o", 1], [".", 5]],
  [[".", 22], ["o", 1], ["p", 2], ["o", 1], [".", 6]],
  [[".", 32]]
];

/** Builder = Apprentice + a goggles band (row 4) + a wide brass toolbelt (rows 20-21). Verbatim
 * from the mockup's BUILD derivation. */
const BUILDER: SpriteRun[] = APPRENTICE.map((row, i) => {
  if (i === 4) return [[".", 11], ["o", 1], ["m", 8], ["o", 1], [".", 11]] as SpriteRun;
  if (i === 20) return [[".", 10], ["o", 1], ["m", 10], ["o", 1], [".", 10]] as SpriteRun;
  if (i === 21) return [[".", 9], ["o", 1], ["m", 12], ["o", 1], [".", 9]] as SpriteRun;
  return row;
});

/** PLACEHOLDER tier 3: Builder + a forgemaster cape hinted across the shoulders (rows 11-13). */
const FORGEMASTER: SpriteRun[] = BUILDER.map((row, i) => {
  if (i === 11) return [[".", 9], ["r", 1], ["o", 1], ["c", 10], ["o", 1], ["r", 1], [".", 9]] as SpriteRun;
  if (i === 12) return [[".", 7], ["r", 2], ["o", 1], ["c", 12], ["o", 1], ["r", 2], [".", 7]] as SpriteRun;
  return row;
});

/** PLACEHOLDER tier 4: Forgemaster + a travel cloak wash across the lower body (rows 26-30). */
const WAYFARER: SpriteRun[] = FORGEMASTER.map((row, i) => {
  if (i >= 26 && i <= 30) {
    return [[".", 11], ["o", 1], ["b", 3], ["o", 1], [".", 1], ["o", 1], ["b", 3], ["o", 1], [".", 10]] as SpriteRun;
  }
  return row;
});

export const SPRITE_TIERS: Record<PhaseId, { runs: SpriteRun[]; className: string; label: string }> = {
  1: { runs: APPRENTICE, className: "Apprentice", label: "Apprentice, your character at Phase 1" },
  2: { runs: BUILDER, className: "Builder", label: "Builder, your character at Phase 2" },
  3: { runs: FORGEMASTER, className: "Forgemaster", label: "Forgemaster, your character at Phase 3 (placeholder art, pending authoring)" },
  4: { runs: WAYFARER, className: "Wayfarer", label: "Wayfarer, your character at Phase 4 (placeholder art, pending authoring)" }
};

export function expandRuns(runs: SpriteRun[]): string[] {
  return runs.map((row) => row.map(([ch, n]) => ch.repeat(n)).join(""));
}

export interface SpriteValidationResult { ok: boolean; issues: string[] }

/** The 40x32 self-check: fails loud (not silent) on a malformed grid, per L6. */
export function validateSpriteGrid(grid: string[]): SpriteValidationResult {
  const issues: string[] = [];
  if (grid.length !== SPRITE_ROWS) {
    issues.push(`expected ${SPRITE_ROWS} rows, got ${grid.length}`);
  }
  const widths = new Set(grid.map((r) => r.length));
  if (![...widths].every((w) => w === SPRITE_COLS)) {
    issues.push(`expected every row exactly ${SPRITE_COLS} cols wide, found widths: ${[...widths].join("/")}`);
  }
  return { ok: issues.length === 0, issues };
}

export interface SpriteRects { width: number; height: number; rects: string; }

export function buildSpriteRects(runs: SpriteRun[], scale: number): SpriteRects {
  if (!Number.isInteger(scale) || scale <= 0) {
    throw new Error(`buildSpriteRects: scale must be a positive integer, got ${scale}`);
  }
  const grid = expandRuns(runs);
  const { ok, issues } = validateSpriteGrid(grid);
  if (!ok) {
    throw new Error(`Malformed sprite grid: ${issues.join("; ")}`);
  }
  let rects = "";
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!;
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      if (ch === ".") { x++; continue; }
      let x2 = x;
      while (x2 < row.length && row[x2] === ch) x2++;
      const color = SPRITE_PALETTE[ch] ?? "#ff00ff";
      rects += `<rect x="${x * scale}" y="${y * scale}" width="${(x2 - x) * scale}" height="${scale}" fill="${color}" />`;
      x = x2;
    }
  }
  return { width: SPRITE_COLS * scale, height: SPRITE_ROWS * scale, rects };
}
