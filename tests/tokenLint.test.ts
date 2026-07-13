import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// tokenLint.test.ts, F18: enforce the F.3 pink rules so no builder trips the trap.
// (rule 2) a pink FILL always takes charcoal ink, never light text.
// (rule 3) --pink-deep for saturated fills also takes dark ink.
// (rule 4) pink washes stay at 8 to 14 percent alpha only.

const tokensCss = readFileSync(resolve(__dirname, "../src/styles/tokens.css"), "utf8");
const globalCss = readFileSync(resolve(__dirname, "../src/styles/global.css"), "utf8");

function hexLuminanceOk(hex: string): boolean {
  // very rough check: charcoal ink is a DARK color (low luminance); this just proves the token is
  // dark, not a full WCAG contrast computation (Frederick recomputed the real ratios per spec).
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.3;
}

describe("F18 token lint: pink fill rules", () => {
  it("--ink-on-pink is defined and is a dark (charcoal) color, never light parchment", () => {
    const match = tokensCss.match(/--ink-on-pink:\s*(#[0-9a-fA-F]{6})/);
    expect(match).not.toBeNull();
    expect(hexLuminanceOk(match![1]!)).toBe(true);
  });

  it("both .fill-pink and .fill-pink-deep set color to --ink-on-pink, never --ink (parchment)", () => {
    const fillPinkRule = globalCss.match(/\.fill-pink\s*{[^}]*}/)?.[0] ?? "";
    const fillPinkDeepRule = globalCss.match(/\.fill-pink-deep\s*{[^}]*}/)?.[0] ?? "";
    expect(fillPinkRule).toMatch(/color:\s*var\(--ink-on-pink\)/);
    expect(fillPinkDeepRule).toMatch(/color:\s*var\(--ink-on-pink\)/);
    // the hard fail this rule exists to prevent: a pink fill class pairing with light --ink text
    expect(fillPinkRule).not.toMatch(/color:\s*var\(--ink\)[^-]/);
  });

  it("pink wash tokens stay within 8 to 14 percent alpha", () => {
    const washes = [...tokensCss.matchAll(/--pink-wash-(?:min|max):\s*rgba\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)\)/g)];
    expect(washes.length).toBeGreaterThanOrEqual(2);
    for (const m of washes) {
      const alpha = Number(m[1]);
      expect(alpha).toBeGreaterThanOrEqual(0.08);
      expect(alpha).toBeLessThanOrEqual(0.14);
    }
  });

  it("the primary --pink token is defined and matches the approved mockup hex exactly", () => {
    expect(tokensCss).toMatch(/--pink:\s*#F5C2CE/);
  });

  it("mint stays reserved: --mint is defined once at the token layer, not redefined per component", () => {
    const mintDefs = [...tokensCss.matchAll(/--mint:\s*#[0-9a-fA-F]{6}/g)];
    expect(mintDefs.length).toBe(1);
  });

  it("console theme tokens form a SEPARATE group from app chrome tokens (L9: the picker never touches app chrome)", () => {
    expect(tokensCss).toMatch(/\[data-console-theme="cli"\]/);
    expect(tokensCss).toMatch(/\[data-console-theme="green"\]/);
    // the console theme selectors must not redeclare --pink or --ground (app-chrome identity)
    const cliBlock = tokensCss.match(/\[data-console-theme="cli"\]\s*{[^}]*}/)?.[0] ?? "";
    const greenBlock = tokensCss.match(/\[data-console-theme="green"\]\s*{[^}]*}/)?.[0] ?? "";
    expect(cliBlock).not.toMatch(/--pink:|--ground:/);
    expect(greenBlock).not.toMatch(/--pink:|--ground:/);
  });
});
