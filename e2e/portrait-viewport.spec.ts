// E2E: real iPad Pro 11 portrait viewport (Manager fix round, item 1). The Manager's own repro was
// exactly this shape: Playwright WebKit + devices["iPad Pro 11"] (834x1194) against a local
// preview, and the actual bug was two-layered: (a) LearnScreen.tsx's `portrait` flag was a
// checkbox-only dev toggle with ZERO connection to the real viewport, so the portrait-segmented
// layout never activated on a real device at all; (b) the scratch REPL sat entirely outside the
// segmented lesson/code/output tab system, always rendered, collapsed by default behind a native
// <details> with no visible disclosure affordance, so even manually toggling portrait left the
// scratch editor's LABEL visible while its actual editor/Run/output were unreachable. This file
// proves BOTH are fixed, against a real device profile (via the "webkit-ipad-portrait" Playwright
// project in playwright.config.ts, scoped to just this file), not the manual override checkbox
// tests/LearnScreen.test.tsx's component suite exercises instead (jsdom stubs matchMedia to
// always report `matches: false`, so the real auto-detection cannot be proven there at all).
import { test, expect } from "@playwright/test";

test.describe("Portrait segmentation on a real iPad Pro 11 viewport (Manager fix round, item 1)", () => {
  test("portrait auto-activates from the real 834px viewport (no manual toggle), and the scratch REPL is genuinely visible and usable in its own segment", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.getByText("Sounds good, let's go").click();
    await expect(page.getByText(/Python runtime is warm/)).toBeVisible({ timeout: 120_000 });

    await page.getByText("Learn").first().click();
    await page.getByText("Hello, Python").click();
    await page.getByText("Your First Line").click();
    await expect(page.getByText("step 1 of 4")).toBeVisible();

    // (a) portrait auto-detected from the REAL viewport, no click on the manual checkbox at all.
    const portraitCheckbox = page.getByRole("checkbox", { name: /portrait/i });
    await expect(portraitCheckbox).toBeChecked();
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);

    // (b) THE REGRESSION NET: switch to the Scratch segment and prove the editor is genuinely
    // visible and usable (a real bounding box, real focus/typing), not just present in the DOM
    // behind a closed <details> the way it used to be (closed-by-default, editor count 1 but
    // isVisible() false, boundingBox height matching only the summary line).
    await page.getByRole("tab", { name: "Scratch" }).click();
    const scratchEditor = page.getByLabel("Scratch REPL editor");
    await expect(scratchEditor).toBeVisible({ timeout: 10_000 });
    const box = await scratchEditor.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(30); // a real editor area, not a collapsed one-line sliver

    await expect(page.getByRole("button", { name: "Run scratch" })).toBeVisible();

    // Genuinely usable, not just visible: set real content and run it. Direct keyboard typing
    // into CodeMirror 6 is a known-hanging pattern under Playwright automation (documented in
    // e2e/sab-handshake.spec.ts and e2e/check-input-deadlock.spec.ts, doubly so under WebKit's
    // touch-emulated iPad profile); use the same DOM-insertion technique those files already rely
    // on. A first run flaked here (element(s) not found for the run's own output): explicitly
    // focus the contentDOM first (execCommand needs a real focused selection to reliably act on,
    // which a bare getSelection() does not guarantee immediately after a tab switch) and poll
    // until the insert is actually reflected in the DOM before clicking Run, rather than assuming
    // one evaluate() call always lands before the next line proceeds.
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const cmContent = document.querySelector('[aria-label="Scratch REPL editor"]') as HTMLElement | null;
          if (!cmContent) return "no-element";
          cmContent.focus();
          const sel = window.getSelection();
          if (!sel) return "no-selection";
          sel.selectAllChildren(cmContent);
          document.execCommand("delete");
          document.execCommand("insertText", false, 'print("portrait scratch works")');
          return cmContent.textContent ?? "";
        });
      }, { timeout: 10_000 })
      .toContain("portrait scratch works");

    await page.getByRole("button", { name: "Run scratch" }).click();
    await expect(page.getByText("portrait scratch works")).toBeVisible({ timeout: 15_000 });

    // The other segments stay correctly gated: switching to Lesson removes the scratch editor
    // from the DOM entirely (not just visually hidden), matching the component suite's proof.
    await page.getByRole("tab", { name: "Lesson" }).click();
    await expect(page.getByLabel("Scratch REPL editor")).toHaveCount(0);

    if (errors.length > 0) {
      console.log("Page errors captured:", errors);
    }
  });
});
