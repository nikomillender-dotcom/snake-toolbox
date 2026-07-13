// E2E tests for the SAB input/interrupt handshake (B4).
// Runs against vite preview with real COOP/COEP headers, real Pyodide, real
// SharedArrayBuffers. These two tests prove the handshake works in a real
// browser, not just in the mock layer.
import { test, expect, type Page } from "@playwright/test";

// Helper: boot the app and navigate to Sandbox in a warm state.
async function bootToSandbox(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("Sounds good, let's go").click();
  await expect(page.getByText(/Python runtime is warm/)).toBeVisible({ timeout: 120_000 });
  await page.getByText("Sandbox").first().click();
  await page.waitForTimeout(500);
}

// Helper: set the Sandbox editor content via the SandboxScreen's React state.
// Direct keyboard typing into CodeMirror 6 hangs in Playwright (a known CM6
// contenteditable interaction issue with automation tools). Instead, we set
// the file content by modifying the Sandbox's "main.py" file directly through
// the file tree's internal state, which CodeMirror reads on the next render.
async function setEditorContent(page: Page, code: string): Promise<void> {
  // Approach: find the editor (CM6 or textarea) and use evaluate to set its value
  // directly via the DOM/CM6 API.
  await page.waitForSelector(".cm-editor, textarea.editor-textarea", { timeout: 5000 });

  const set = await page.evaluate((newCode) => {
    // Try CM6 first
    const cmEditor = document.querySelector(".cm-editor") as HTMLElement | null;
    if (cmEditor) {
      // CM6 stores its view in a property. Access it via the Preact component tree
      // or by dispatching a transaction. The .cm-content element has the view
      // accessible through the parent editor's internals.
      // Walk up from .cm-content to find the CodeMirror EditorView.
      const cmContent = cmEditor.querySelector(".cm-content");
      if (cmContent) {
        // Use the input event approach: focus, select all, delete, then insert
        // by setting innerHTML and dispatching input (this works because CM6
        // listens for DOM mutations on its contenteditable).
        const sel = window.getSelection();
        if (sel) {
          sel.selectAllChildren(cmContent);
          document.execCommand("delete");
          document.execCommand("insertText", false, newCode);
          return "cm6";
        }
      }
    }
    // Try textarea
    const ta = document.querySelector("textarea.editor-textarea") as HTMLTextAreaElement | null;
    if (ta) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(ta, newCode);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return "textarea";
      }
    }
    return "none";
  }, code);

  if (set === "none") throw new Error("Could not set editor content");
}

test.describe("SAB input/interrupt handshake (B4, real Pyodide)", () => {
  test("input() round trip: program calls input(), user types a value, program completes with it", async ({ page }) => {
    const consoleMsgs: string[] = [];
    page.on("console", (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));

    await bootToSandbox(page);

    // Type a program that calls input() and prints the result
    await setEditorContent(page, 'name = input("your name? ")\nprint(f"hello {name}")');

    // Click Run
    await page.getByRole("button", { name: /^run$/i }).click();

    // Wait for the input prompt to appear in the OutputStream.
    // The OutputStream renders an <input> element with id="stb-input-prompt" when
    // Python calls input().
    const inputField = page.locator("#stb-input-prompt");
    await expect(inputField).toBeVisible({ timeout: 30_000 });

    // Type the response and press Enter
    await inputField.fill("Niko");
    await inputField.press("Enter");

    // The program should complete and show the output with the typed value.
    // Use a specific locator to avoid strict-mode violations from the aria-live region.
    await expect(page.locator(".output-stream span").filter({ hasText: "hello Niko" }).first()).toBeVisible({ timeout: 30_000 });

    // Log console messages for debugging if the test fails
    if (consoleMsgs.length > 0) {
      console.log("Console messages:", consoleMsgs.slice(-10).join("\n"));
    }
  });

  test("Stop interrupt: infinite loop terminated by Stop, engine usable for the next run", async ({ page }) => {
    const consoleMsgs: string[] = [];
    page.on("console", (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));

    await bootToSandbox(page);

    // Type an infinite loop
    await setEditorContent(page, "while True:\n    pass");

    // Click Run
    await page.getByRole("button", { name: /^run$/i }).click();

    // Give the loop a moment to start executing
    await page.waitForTimeout(1000);

    // Click Stop
    const stopBtn = page.getByRole("button", { name: /stop/i });
    await expect(stopBtn).toBeVisible({ timeout: 5000 });
    await stopBtn.click();

    // The run should terminate. Look for either:
    // (a) "KeyboardInterrupt" in the output stream (the honest error message), or
    // (b) the running state clears (the Run button becomes enabled again)
    // We check for the Run button becoming clickable as the primary signal,
    // since the exact error text depends on how Pyodide surfaces the interrupt.
    const runBtn = page.getByRole("button", { name: /^run$/i });
    await expect(runBtn).toBeEnabled({ timeout: 15_000 });

    // Prove the engine is still usable: run a simple program after the interrupt
    await setEditorContent(page, 'print("still alive")');
    await runBtn.click();
    // Use a specific locator to avoid strict-mode violations from the editor text
    // and the aria-live region.
    await expect(page.locator(".output-stream span").filter({ hasText: "still alive" }).first()).toBeVisible({ timeout: 30_000 });

    if (consoleMsgs.length > 0) {
      console.log("Console messages:", consoleMsgs.slice(-10).join("\n"));
    }
  });
});
