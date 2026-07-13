import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

// noEmojiLint.test.ts, H3 (Simbo's visual-quality checklist): "zero platform emoji used as UI
// glyphs." A build pass found and fixed five real violations (a warning-sign, floppy-disk,
// alembic, and print emoji used as quick placeholder icons); this test exists so that class of
// regression cannot silently creep back in. Geometric/typographic symbols already in continuous
// use in Simbo's approved mockups (the triangle caret U+25B2, the vertical-ellipsis "more" dot
// U+22EE) are allowed; they are plain-text glyphs almost every platform renders monochrome, not
// colorful platform emoji, and match the lookbook exactly.

const SRC_DIR = join(__dirname, "../src");

// Common platform-emoji code point ranges (Misc Symbols and Pictographs, Supplemental Symbols and
// Pictographs, Transport and Map, Dingbats' colorful subset). Deliberately excludes the narrow
// geometric-shapes / general-punctuation glyphs the mockups already use.
const EMOJI_ENTITY = /&#(1f[0-9a-f]{3}|9(8[89]|9[0-9]|8[0-6])\d?);/i;

function collectFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectFiles(full, exts));
    } else if (exts.includes(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

describe("H3 lint: no platform-emoji numeric character entities as UI glyphs", () => {
  it("no .tsx component renders a warning/floppy/alembic/print-style emoji entity", () => {
    const files = collectFiles(SRC_DIR, [".tsx"]);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // allow the two mockup-continuous glyphs explicitly
      const withoutAllowed = text.replace(/&#9650;|&#8942;/g, "");
      if (EMOJI_ENTITY.test(withoutAllowed)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
