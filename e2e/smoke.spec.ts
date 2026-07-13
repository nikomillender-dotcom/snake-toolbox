// End-to-end smoke test: proves the real Pyodide worker runs actual Python code.
// Runs against `vite preview` (production build with COOP/COEP headers).
// This is the I9 "trivial run" item and the canary's live-smoke muscle (I13).
import { test, expect } from "@playwright/test";

test.describe("Snake ToolBox E2E (real Pyodide)", () => {
  test("running the default Sandbox code produces real Python output", async ({ page }) => {
    // Capture errors for debugging
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Navigate to the app
    await page.goto("/");

    // Dismiss the FirstLoadPrimer to start the Pyodide boot.
    await page.getByText("Sounds good, let's go").click();

    // Wait for the Python runtime to boot (Pyodide loads ~13MB wasm, can be slow).
    await expect(page.getByText(/Python runtime is warm/)).toBeVisible({ timeout: 120000 });

    // Navigate to Sandbox
    await page.getByText("Sandbox").first().click();
    await page.waitForTimeout(500);

    // The Sandbox starts with default code: print("hello from a fresh Sandbox")
    // Just click Run on the default code. This proves real Pyodide executes real Python.
    await page.getByRole("button", { name: /run/i }).click();

    // Wait for the output to show the default print output.
    // "hello from a fresh Sandbox" is the stdout from the default code.
    await expect(page.getByText("hello from a fresh Sandbox")).toBeVisible({ timeout: 60000 });

    // Report any page errors
    if (errors.length > 0) {
      console.log("Page errors captured:", errors);
    }
  });

  test("crossOriginIsolated is true under the served headers", async ({ page }) => {
    await page.goto("/");
    const isolated = await page.evaluate(() => self.crossOriginIsolated);
    expect(isolated).toBe(true);
  });
});
