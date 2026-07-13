import { describe, expect, it } from "vitest";
import { buildPixelWord, PIXEL_GLYPHS, validatePixelGlyphs } from "../src/lib/pixelFont";

describe("pixel display face (F21: display only, integer-size lint)", () => {
  it("every authored glyph is exactly 7 rows x 5 cols of 0/1 (the self-check)", () => {
    expect(validatePixelGlyphs()).toEqual([]);
  });

  it("flags a deliberately malformed glyph table instead of silently rendering it", () => {
    const broken = { ...PIXEL_GLYPHS, X: ["0111", "10001", "10001", "11111", "10001", "10001", "10001"] };
    const issues = validatePixelGlyphs(broken);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.char).toBe("X");
  });

  it("throws rather than render at a non-integer scale (F21 integer-scale-only rule)", () => {
    expect(() => buildPixelWord("UNIT 1", 2.5)).toThrow(/positive integer/);
    expect(() => buildPixelWord("UNIT 1", 0)).toThrow(/positive integer/);
    expect(() => buildPixelWord("UNIT 1", -3)).toThrow(/positive integer/);
  });

  it("builds valid rect geometry at an integer scale", () => {
    const { width, height, faceRects } = buildPixelWord("HI", 4);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(faceRects).toContain("<rect");
  });
});
