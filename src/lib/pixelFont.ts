// pixelFont.ts, the Snake ToolBox hand-authored 5x7 pixel display face.
//
// Lifted VERBATIM from Simbo's Niko-approved mockup pack (mockups/index.html PF table): the same
// glyph grid, same 5-wide x 7-tall cell shape, same drop-shadow recipe. DISPLAY ONLY (F21): headers,
// unit title cards, boss screens, the big level number. NEVER body, code, or console text (the
// Meow Rush line). Rendered as authored SVG rects (not a webfont), so there is no font file to
// self-host yet and no non-integer-scale risk from font metrics; `cell` (px per pixel) MUST be a
// positive integer, enforced at call time (the F21 lint) rather than discovered visually.
//
// Self-check (F21, "ship the 40x32 self-check that paints a red banner on a malformed grid" applies
// here too, scaled to this 5x7 grid): validatePixelGlyphs() below reports any glyph whose row count
// or row width is wrong, and PixelWord throws loudly rather than silently render a corrupt glyph.

export const PIXEL_GLYPH_ROWS = 7;
export const PIXEL_GLYPH_COLS = 5;

export const PIXEL_GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10011", "10101", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "/": ["00001", "00010", "00100", "00100", "01000", "10000", "10000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "·": ["00000", "00000", "00000", "00100", "00000", "00000", "00000"]
};

export interface GlyphValidationIssue { char: string; reason: string }

/** F21 self-check: report any glyph whose grid is not exactly 7 rows x 5 cols. */
export function validatePixelGlyphs(glyphs: Record<string, string[]> = PIXEL_GLYPHS): GlyphValidationIssue[] {
  const issues: GlyphValidationIssue[] = [];
  for (const [ch, rows] of Object.entries(glyphs)) {
    if (rows.length !== PIXEL_GLYPH_ROWS) {
      issues.push({ char: ch, reason: `expected ${PIXEL_GLYPH_ROWS} rows, got ${rows.length}` });
      continue;
    }
    rows.forEach((row, i) => {
      if (row.length !== PIXEL_GLYPH_COLS) {
        issues.push({ char: ch, reason: `row ${i} expected ${PIXEL_GLYPH_COLS} cols, got ${row.length}` });
      }
      if (!/^[01]+$/.test(row)) {
        issues.push({ char: ch, reason: `row ${i} contains a non 0/1 character: "${row}"` });
      }
    });
  }
  return issues;
}

function glyphFor(ch: string): string[] {
  return PIXEL_GLYPHS[ch] ?? PIXEL_GLYPHS[ch.toUpperCase()] ?? PIXEL_GLYPHS[" "]!;
}

export interface PixelWordRects {
  width: number;
  height: number;
  shadowRects: string;
  faceRects: string;
}

/**
 * Builds the SVG rect geometry for a pixel word. `cell` (device px per glyph pixel) MUST be a
 * positive integer (F21: integer-scale only). Throws rather than silently render a fractional,
 * blurry pixel face.
 */
export function buildPixelWord(word: string, cell: number): PixelWordRects {
  if (!Number.isInteger(cell) || cell <= 0) {
    throw new Error(`buildPixelWord: cell must be a positive integer (F21 integer-scale rule), got ${cell}`);
  }
  const chars = [...word.toUpperCase()];
  const shadowOffset = Math.max(2, Math.round(cell * 0.72));
  const width = chars.length * PIXEL_GLYPH_COLS * cell + (chars.length - 1) * cell + shadowOffset;
  const height = PIXEL_GLYPH_ROWS * cell + shadowOffset;

  function rectsAt(dx: number, dy: number): string {
    let out = "";
    chars.forEach((ch, i) => {
      const grid = glyphFor(ch);
      const gx = dx + i * (PIXEL_GLYPH_COLS + 1) * cell;
      for (let y = 0; y < PIXEL_GLYPH_ROWS; y++) {
        const row = grid[y]!;
        let x = 0;
        while (x < PIXEL_GLYPH_COLS) {
          if (row[x] === "1") {
            let x2 = x;
            while (x2 < PIXEL_GLYPH_COLS && row[x2] === "1") x2++;
            out += `<rect x="${gx + x * cell}" y="${dy + y * cell}" width="${(x2 - x) * cell}" height="${cell}" />`;
            x = x2;
          } else {
            x++;
          }
        }
      }
    });
    return out;
  }

  return {
    width,
    height,
    shadowRects: rectsAt(shadowOffset, shadowOffset),
    faceRects: rectsAt(0, 0)
  };
}
