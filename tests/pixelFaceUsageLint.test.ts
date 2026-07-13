import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// pixelFaceUsageLint.test.ts, F21: "pixel font is DISPLAY ONLY (headers, title cards, boss screens),
// never body or code text." The rendering primitive itself (PixelWord) already refuses a
// non-integer scale (tests/pixelFont.test.ts). This is the other half: a build-time grep proving
// the pixel face is never reached for in the components that render body prose, code, or console
// text, so the discipline cannot silently erode as the app grows.

const FORBIDDEN_FILES = [
  "../src/components/CodeEditor.tsx",
  "../src/components/OutputStream.tsx"
];

describe("F21 lint: pixel face never used for code/console/body text", () => {
  it("CodeEditor and OutputStream never import or render PixelWord", () => {
    for (const file of FORBIDDEN_FILES) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/PixelWord/);
    }
  });

  it("LessonPane's prose-rendering path (step.kind 'prose'/'liveExample') never wraps body text in PixelWord", () => {
    const source = readFileSync(resolve(__dirname, "../src/components/LessonPane.tsx"), "utf8");
    // PixelWord IS used in this file, but only for the "BOSS AHEAD" title-card moment (L1: title
    // cards are an approved display use); assert it never appears inside the prose <p> lines.
    const proseLines = source.split("\n").filter((l) => l.includes("<p class=\"prose\""));
    for (const line of proseLines) {
      expect(line).not.toMatch(/PixelWord/);
    }
  });
});
